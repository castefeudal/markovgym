import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe.configure({ mode: 'parallel' });

const sizes = [
  ['360', 360, 800], ['390', 390, 844], ['430', 430, 932],
  ['768', 768, 1024], ['1440', 1440, 900], ['1920', 1920, 1080],
];
const themes = ['obsidian', 'soft', 'ivory'];
const routes = ['home', 'library', 'workout', 'progress', 'program', 'nutrition', 'tools', 'settings'];
const fixedTime = new Date('2026-10-04T09:00:00.000Z');

async function prepare(page, theme, populated = true) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(fixedTime);
  await page.addInitScript(({ theme, populated }) => {
    if (sessionStorage.getItem('visual-seeded')) return;
    sessionStorage.setItem('visual-seeded', '1');
    localStorage.setItem('mmg.theme.v2', theme);
    if (!populated) return;
    localStorage.setItem('mmg.profile.v1', JSON.stringify({ goal: 'muscle', level: 'middle', place: 'gym', days: 3, done: true }));
    localStorage.setItem('mmg.workout.v2', JSON.stringify([{ id: '0025', sets: 3, reps: '8–12', weight: '60', done: false }]));
    localStorage.setItem('mmg.settings.v1', JSON.stringify({ rir: true, rpe: true, reading: 'balanced' }));
    localStorage.setItem('mmg.diary.v1', JSON.stringify([
      { date: '2026-10-04', weight: 80.4, waist: 84, sleep: 7.5, fatigue: 2 },
      { date: '2026-09-28', weight: 80.8, waist: 84.5, sleep: 7, fatigue: 2 },
      { date: '2026-09-21', weight: 81.1, waist: 85, sleep: 7.5, fatigue: 2 },
    ]));
  }, { theme, populated });
}

async function ready(page, route) {
  await page.goto(`/index.html#${route}`);
  await expect(page.locator('html')).toHaveAttribute('data-route-ready', route);
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  if (route === 'tools') await expect(page.locator('[data-lab-form]').first()).toBeVisible();
  if (route === 'library') await expect(page.locator('#grid .card').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function snapshot(page, name) {
  // Production GIF animation stays enabled. Only screenshot capture substitutes
  // the existing still asset, so pixel comparisons are deterministic.
  await page.evaluate(async () => {
    const images = [...document.querySelectorAll('img')].filter(img => img.checkVisibility() && img.getBoundingClientRect().bottom > 0 && img.getBoundingClientRect().top < innerHeight);
    await Promise.all(images.map(async img => {
      if (img.dataset.still) img.src = img.dataset.still;
      try { await img.decode(); } catch {}
    }));
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name}: horizontal page overflow`).toBeLessThanOrEqual(1);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled', caret: 'hide', scale: 'css',
    maxDiffPixelRatio: 0.005, threshold: 0.2,
    mask: [page.locator('[data-run-elapsed], [data-run-elapsed-full]')],
  });
}

for (const [size, width, height] of sizes) for (const theme of themes) for (const route of routes) {
  test(`${size} ${theme} ${route}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepare(page, theme);
    await ready(page, route);
    if (route === 'progress') {
      const axisSize = await page.locator('.prog-chart text').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) * Math.abs(el.getScreenCTM().a));
      expect(axisSize, 'chart labels must remain readable after SVG scaling').toBeGreaterThanOrEqual(14);
      await expect(page.locator('#prog-out>.v8-muted-copy')).toContainText('Данных пока недостаточно');
    }
    await snapshot(page, `${size}-${theme}-${route}`);
    if (['360', '1440'].includes(size)) { const results = await new AxeBuilder({ page }).analyze(); expect(results.violations.filter(v => ['serious', 'critical'].includes(v.impact)), JSON.stringify(results.violations)).toEqual([]); }
    if (route === 'progress' && size === '1440' && theme === 'obsidian') {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('.prog-chart svg')).toHaveAttribute('viewBox', '0 0 280 200');
      expect(await page.locator('.prog-chart text').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) * Math.abs(el.getScreenCTM().a))).toBeGreaterThanOrEqual(14);
    }
  });
}

for (const [size, width, height] of sizes.filter(([name]) => ['360', '390', '1440'].includes(name))) {
  for (const theme of themes) for (const state of ['detail', 'run', 'filters', 'command', 'empty', 'offline']) {
    test(`${size} ${theme} ${state}`, async ({ page, context }) => {
      await page.setViewportSize({ width, height });
      await prepare(page, theme, state !== 'empty');
      await ready(page, ['detail', 'filters'].includes(state) ? 'library' : 'workout');
      if (state === 'detail') {
        await page.locator('#grid [data-open]').first().click();
        await expect(page.locator('#modal')).toHaveAttribute('data-open', 'true');
        const titleBounds = await page.locator('#modal-title').boundingBox();
        const closeBounds = await page.locator('#modal-close').boundingBox();
        expect(titleBounds.y).toBeGreaterThanOrEqual(0);
        expect(closeBounds.y).toBeGreaterThanOrEqual(0);
      } else if (state === 'run') {
        await page.locator('[data-v8-start-run]:visible, #w-run:visible').first().click();
        await expect(page.locator('#run')).toHaveAttribute('data-open', 'true');
        await expect(page.locator('[data-run-field="rir"]')).toHaveCount(1);
        const rect = await page.locator('#run-next').boundingBox();
        expect(rect.y + rect.height).toBeLessThanOrEqual(height + 1);
      } else if (state === 'filters' && width < 900) {
        await page.locator('#mfb-open').click();
        await expect(page.locator('#filters')).toHaveAttribute('data-open', 'true');
      } else if (state === 'command') {
        await page.locator('#cmdk-open').click();
        await page.locator('#cmdk-input').fill('прогресс');
      } else if (state === 'offline') {
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
        });
        await context.setOffline(true);
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
      }
      await snapshot(page, `${size}-${theme}-${state}`);
      if (width === 360 || width === 1440) {
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations.filter(v => ['serious', 'critical'].includes(v.impact)), JSON.stringify(results.violations)).toEqual([]);
      }
    });
  }
}

for (const state of ['loading', 'error']) {
  test(`shell ${state}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page, 'obsidian', false);
    let blocked;
    await page.route('**/ui.html', route => state === 'error' ? route.abort() : new Promise(resolve => { blocked = () => { resolve(); return route.abort(); }; }));
    await page.goto('/index.html', { waitUntil: 'commit' });
    await expect(page.locator('#mmg-boot')).toBeVisible();
    if (state === 'error') await expect(page.locator('#mmg-boot')).toHaveAttribute('data-error', 'true');
    await snapshot(page, `390-obsidian-${state}`);
    if (blocked) await blocked();
  });
}
