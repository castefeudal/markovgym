import { test, expect } from '@playwright/test';

test('home boots with the full exercise dataset and no page errors', async ({ page }) => {
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failed.push(request.url()));
  await page.goto('/index.html#home');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await expect(page.locator('#stat-total')).toHaveText('1324');
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('hash routes and gym calculators are usable', async ({ page }) => {
  await page.goto('/index.html#tools');
  await expect(page.locator('#tools')).toBeVisible();
  await expect(page.locator('#gym-e1rm-output')).toContainText(/91[,.]67/);
  await page.locator('[data-gym-form="e1rm"] #gym-e1rm-weight').fill('100');
  await page.locator('[data-gym-form="e1rm"] #gym-e1rm-reps').fill('5');
  await page.locator('[data-gym-form="e1rm"]').getByRole('button', { name: /Рассчитать|Estimate/ }).click();
  await expect(page.locator('#gym-e1rm-output')).toContainText(/116[,.]67/);
  await page.goto('/index.html#library');
  await expect(page.locator('#library')).toBeVisible();
  await expect(page.locator('#search')).toBeVisible();
});

test('mobile shell has no horizontal page overflow', async ({ page }) => {
  await page.goto('/index.html#home');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});


test('exercise detail shows complete GIF and structured technique guidance', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('#grid [data-open]').first().click();

  await expect(page.locator('#modal')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#modal-img')).toBeVisible();
  await expect(page.locator('#modal-cues .modal-cue-card')).toHaveCount(5);
  expect(await page.locator('#modal-steps li').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#modal-errors .modal-alert-card').first()).toBeVisible();

  const media = await page.locator('#modal-img').evaluate((img) => ({
    fit: getComputedStyle(img).objectFit,
    src: img.getAttribute('src'),
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  }));
  expect(media.fit).toBe('contain');
  expect(media.src).toContain('.gif?v=');
  expect(media.naturalWidth).toBeGreaterThan(0);
  expect(media.naturalHeight).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('run mode keeps full exercise media visible and surfaces execution cues', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('#grid [data-add]').first().click();
  await page.goto('/index.html#workout');
  await page.locator('#w-run').click();

  await expect(page.locator('#run')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('.run-tech-cues')).toBeVisible();
  const fit = await page.locator('.run-media').evaluate((img) => getComputedStyle(img).objectFit);
  expect(fit).toBe('contain');
});

test('exercise detail has no horizontal overflow on a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('#grid [data-open]').first().click();
  const overflow = await page.locator('#modal .modal-box').evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('#modal-tabs')).toBeVisible();
});
