import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const route of ['home', 'library', 'tools', 'settings']) {
  test(`axe has no serious or critical violations on ${route}`, async ({ page }) => {
    await page.goto(`/index.html#${route}`);
    await expect(page.locator('#mmg-boot')).toHaveCount(0);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
