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
