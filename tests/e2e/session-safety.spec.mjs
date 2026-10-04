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
