import { test, expect } from '@playwright/test';

// Extend the existing screenshot matrix with the narrowest phones, intermediate
// widths and landscape. These checks exercise real controls without new baselines.
for (const theme of ['obsidian', 'soft', 'ivory']) {
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440, 1920]) {
    test(`Run Mode controls remain usable at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 768 ? 430 : 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(theme => {
        localStorage.setItem('mmg.theme.v2', theme);
        localStorage.setItem('mmg.workout.v2', JSON.stringify([{ id: '0025', sets: 3, reps: '8–12', weight: '60' }]));
      }, theme);
      await page.goto('/index.html#workout');
      await expect(page.locator('#mmg-boot')).toHaveCount(0);
      await page.locator('[data-v8-start-run]:visible, #w-run:visible').first().click();
      const weight = page.getByRole('textbox', { name: 'Вес, кг', exact: true });
      await expect(weight).toHaveValue('60');
      await weight.fill('62.5');
      await page.locator('[data-run-adjust="weight"][data-direction="1"]').click();
      await expect(weight).toHaveValue('65');
      for (const selector of ['#run-next', '#run-rest', '[data-run-adjust="weight"][data-direction="1"]']) {
        const control = page.locator(selector);
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        await control.click({ trial: true });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.locator('#run-next').click();
      await expect(page.locator('.run-set-chip[data-state="done"]')).toHaveCount(1);
    });
  }
}
