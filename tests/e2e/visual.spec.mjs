import { test, expect } from '@playwright/test';

const sizes = [
  ['mobile-390', 390, 844],
  ['tablet-768', 768, 1024],
  ['laptop-1440', 1440, 900],
  ['wide-1920', 1920, 1080],
];
const routes = ['home', 'library', 'workout', 'progress', 'program', 'nutrition', 'tools', 'settings'];

test('capture the production layout matrix', async ({ browser }) => {
  for (const [sizeName, width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(`/index.html#${route}`);
      await expect(page.locator('#mmg-boot')).toHaveCount(0);
      await page.screenshot({ path: `artifacts/screens/${sizeName}-${route}.png`, fullPage: true });
    }
    await context.close();
  }
});
