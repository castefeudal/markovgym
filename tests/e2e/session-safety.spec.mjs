import { test, expect } from '@playwright/test';

async function seed(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('session-seeded')) return;
    sessionStorage.setItem('session-seeded', '1');
    localStorage.setItem('mmg.workout.v2', JSON.stringify([{ id: '0025', sets: 1, reps: '10', weight: '60' }]));
  });
  await page.goto('/index.html#workout');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('[data-v8-start-run]:visible, #w-run:visible').first().click();
}

test('closing and reloading Run Mode preserves the entered draft and active set', async ({ page }) => {
  await seed(page);
  await page.locator('[data-run-field="weight"]').fill('62.5');
  await page.locator('[data-run-field="reps"]').fill('11');
  await page.locator('.run-details summary').click();
  await page.locator('[data-run-field="note"]').fill('Controlled range');
  await page.locator('#run-close').click();
  await page.reload();
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('[data-v8-start-run]:visible, #w-run:visible').first().click();
  await expect(page.locator('[data-run-field="weight"]')).toHaveValue('62.5');
  await expect(page.locator('[data-run-field="reps"]')).toHaveValue('11');
  await expect(page.locator('[data-run-field="note"]')).toHaveValue('Controlled range');
  await expect(page.locator('.run-set-chip[data-state="current"]')).toHaveText('1');
});

test('saving the session once opens real progress and removes the repeated Save action', async ({ page }) => {
  await seed(page);
  await page.locator('#run-next').click();
  await expect(page.locator('.run-finish-summary')).toBeVisible();
  await page.locator('#run-next').dblclick();
  await expect(page.locator('html')).toHaveAttribute('data-route-ready', 'progress');
  await expect(page.locator('#prog-out .intel-metrics')).toBeVisible();
  const history = await page.evaluate(() => window.mmgLocalData.readSnapshot().history);
  expect(history).toHaveLength(1);
  expect(history[0].items[0].setLog[0].completed).toBe(true);
  await page.goto('/index.html#home');
  await expect(page.locator('#v7-home-next')).not.toContainText('Сохранить тренировку');
});

test('Run Mode fields have unambiguous accessible names and separate adjustment controls', async ({ page }) => {
  await seed(page);
  const load = page.getByRole('textbox', { name: 'Вес, кг', exact: true });
  await expect(load).toHaveValue('60');
  await page.locator('#run-stage').getByText('Вес, кг', { exact: true }).click();
  await expect(load).toBeFocused();
  await expect(page.locator('.run-current-inputs label button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Увеличить: Вес, кг', exact: true }).click();
  await expect(load).toHaveValue('62.5');
  await expect(page.getByRole('button', { name: 'Увеличить: Вес, кг', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(load).toHaveValue('65');
});

test('mobile rest adjustments change the deadline and survive pause and reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await seed(page);
  await page.locator('#run-rest').click();
  await page.locator('#run-close').click();
  const timer = page.locator('#mobile-rest-timer');
  await expect(timer).toBeVisible();
  await timer.locator('[data-mobile-rest="plus"]').click({ trial: true });
  // Let the modal finish closing before freezing animation/timer clocks.
  // Only the explicit second below should affect the measured adjustment.
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  const before = await page.locator('#mobile-rest-clock').textContent();
  await timer.locator('[data-mobile-rest="plus"]').click();
  await page.clock.runFor(1000);
  const after = await page.locator('#mobile-rest-clock').textContent();
  const seconds = value => value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  expect(seconds(after) - seconds(before)).toBe(14);
  await timer.locator('[data-mobile-rest="toggle"]').click();
  await timer.locator('[data-mobile-rest="minus"]').click();
  const paused = await page.locator('#mobile-rest-clock').textContent();
  await page.clock.resume();
  await page.reload();
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await expect(page.locator('#mobile-rest-clock')).toHaveText(paused);
});

test('removing a completed set requires confirmation and cancellation preserves its result', async ({ page }) => {
  await seed(page);
  await page.locator('[data-run-add-set]').click();
  await page.locator('[data-run-set="1"]').click();
  await page.locator('#run-next').click();
  await page.locator('[data-run-set="1"]').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-run-remove-set]').click();
  await expect(page.locator('[data-run-set]')).toHaveCount(2);
  await expect(page.locator('[data-run-undo]')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-run-remove-set]').click();
  await expect(page.locator('[data-run-set]')).toHaveCount(1);
});

test('the modal traps keyboard focus and returns it to its opener', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  const opener = page.locator('#grid [data-open]').first();
  await opener.click();
  for (let index = 0; index < 16; index++) {
    await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#modal'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('an available application update cannot cover active workout controls', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    if (document.getElementById('mmg-update')) return;
    const banner = document.createElement('div');
    banner.id = 'mmg-update'; banner.className = 'mmg-update';
    banner.innerHTML = '<span>Обновление готово</span><button type="button" class="btn btn-primary">Обновить</button>';
    document.querySelector('main').prepend(banner);
  });
  await expect(page.locator('#mmg-update')).toBeHidden();
  await page.locator('#run-next').click();
  await expect(page.locator('.run-finish-summary')).toBeVisible();
  await page.locator('#run-close').click();
  await expect(page.locator('#mmg-update')).toBeVisible();
  await page.evaluate(() => window.mmgV7.navigate('settings'));
  await expect(page.locator('html')).toHaveAttribute('data-route-ready', 'settings');
  const choosing = page.waitForEvent('filechooser');
  await page.locator('#data-import').click();
  await choosing;
});

test('keyboard navigation focuses the visible title of the destination', async ({ page }) => {
  await page.goto('/index.html#home');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const link = page.locator('nav a[href="#library"]:visible').first();
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-route-ready', 'library');
  await expect(page.locator('#v8-context-title')).toBeFocused();
  await expect(page.locator('#v8-context-title')).toBeVisible();
});
