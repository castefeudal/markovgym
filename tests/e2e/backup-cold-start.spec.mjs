import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const backup = {
  app: 'markov-made-gym', schemaVersion: 10, kind: 'mmg-backup',
  data: {
    exercisePreferences: JSON.stringify({ '0025': 'discomfort' }),
    fav: JSON.stringify(['0025']),
    workout: JSON.stringify([{ id: '0025', sets: 2, reps: '10', weight: '60' }]),
  },
};

async function chooseBackup(page) {
  const choosing = page.waitForEvent('filechooser');
  await page.locator('#data-import').click();
  const chooser = await choosing;
  await chooser.setFiles({ name: 'cold-start.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
}

async function exportedState(page) {
  await page.locator('#data-export').click();
  const { data } = JSON.parse(await page.locator('#data-io').inputValue());
  return { workout: JSON.parse(data.workout || '[]'), exercisePreferences: JSON.parse(data.exercisePreferences || '{}'), favorites: JSON.parse(data.fav || '[]') };
}

test.beforeEach(async ({ page }) => {
  // Reproduce import before the optional idle catalog preload has run.
  await page.addInitScript(() => { window.requestIdleCallback = () => 0; });
});

test('a backup restores exercise references when Settings starts without the catalog', async ({ page }) => {
  await page.goto('/index.html#settings');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  expect(await page.evaluate(() => window.mmgDiagnostics.exerciseCount)).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  const navigation = page.waitForNavigation();
  await chooseBackup(page);
  await navigation;
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics.exerciseCount)).toBe(1324);
  const restored = await exportedState(page);
  expect(restored.workout[0].id).toBe('0025');
  expect(restored.exercisePreferences['0025']).toBe('discomfort');
  expect(restored.favorites).toContain('0025');
});

test('a catalog error refuses import and keeps current data intact', async ({ page }) => {
  await page.goto('/index.html#settings');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const previous = await exportedState(page);
  await page.route('**/data/exercises-compact.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await chooseBackup(page);
  await expect(page.locator('#toast')).toContainText('Импорт не применён');
  const after = await exportedState(page);
  expect(after.workout).toEqual(previous.workout);
  expect(after.exercisePreferences).toEqual(previous.exercisePreferences);
  expect(after.favorites).toEqual(previous.favorites);
});
