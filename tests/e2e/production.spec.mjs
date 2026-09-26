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
  expect(await page.locator('#modal-cues .modal-cue-card').count()).toBeGreaterThanOrEqual(5);
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

  const geometry = await page.locator('#modal-media').evaluate((frame) => {
    const img = frame.querySelector('#modal-img');
    const f = frame.getBoundingClientRect();
    const i = img.getBoundingClientRect();
    return {
      contained: i.left >= f.left - 1 && i.top >= f.top - 1 && i.right <= f.right + 1 && i.bottom <= f.bottom + 1,
      numbers: [...document.querySelectorAll('#modal-steps li')].slice(0, 3).map((node) =>
        getComputedStyle(node, '::before').content.replaceAll('"', '')
      ),
    };
  });
  expect(geometry.contained).toBe(true);
  expect(geometry.numbers).toEqual(['01', '02', '03']);
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


test('desktop library filters do not overlap and the warm gold accent is gone', async ({ page }) => {
  await page.setViewportSize({ width: 1830, height: 900 });
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);

  const audit = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const accent = root.getPropertyValue('--v8-signal').trim();
    const brass = root.getPropertyValue('--v8-brass').trim();
    const list = document.querySelector('#filter-mu');
    const buttons = [...list.querySelectorAll('.filter-btn')].slice(0, 18);
    const rects = buttons.map((button) => {
      const r = button.getBoundingClientRect();
      const label = button.querySelector('span').getBoundingClientRect();
      const count = button.querySelector('b').getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        labelRight: label.right,
        countLeft: count.left,
      };
    });
    const overlaps = rects.slice(1).filter((r, i) => r.top < rects[i].bottom - 0.5).length;
    const labelCountCollisions = rects.filter((r) => r.labelRight > r.countLeft + 0.5).length;
    return {
      accent,
      brass,
      listOverflow: getComputedStyle(list).overflowY,
      minHeight: Math.min(...rects.map((r) => r.height)),
      overlaps,
      labelCountCollisions,
      sidebarWidth: document.querySelector('#filters').getBoundingClientRect().width,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });

  expect(audit.accent.toLowerCase()).toBe('#86b6ff');
  expect(audit.brass.toLowerCase()).toBe('#8f9bad');
  expect(audit.listOverflow).toBe('visible');
  expect(audit.minHeight).toBeGreaterThanOrEqual(37);
  expect(audit.overlaps).toBe(0);
  expect(audit.labelCountCollisions).toBe(0);
  expect(audit.sidebarWidth).toBeGreaterThanOrEqual(280);
  expect(audit.pageOverflow).toBeLessThanOrEqual(1);
});


test('all three themes resolve coherent tokens, persist and keep library information readable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);

  const expected = [
    { theme: 'obsidian', canvas: '#070a0e', signal: '#86b6ff', scheme: 'dark' },
    { theme: 'soft', canvas: '#eaf0f6', signal: '#3f72b5', scheme: 'light' },
    { theme: 'ivory', canvas: '#f6f5f1', signal: '#4f7197', scheme: 'light' },
  ];

  for (const spec of expected) {
    await page.evaluate((theme) => localStorage.setItem('mmg.theme.v2', theme), spec.theme);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#mmg-boot')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', spec.theme);

    const resolved = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const card = getComputedStyle(document.querySelector('#grid .card'));
      return {
        canvas: root.getPropertyValue('--v8-canvas').trim().toLowerCase(),
        signal: root.getPropertyValue('--v8-signal').trim().toLowerCase(),
        scheme: root.colorScheme,
        cardBackground: card.backgroundImage + ' ' + card.backgroundColor,
        cardText: getComputedStyle(document.querySelector('#grid .card-title')).color,
        insightCount: document.querySelectorAll('#results-insights > span').length,
        cardSpecs: document.querySelectorAll('#grid .card-specs span').length,
        stored: localStorage.getItem('mmg.theme.v2'),
      };
    });

    expect(resolved.canvas).toBe(spec.canvas);
    expect(resolved.signal).toBe(spec.signal);
    expect(resolved.scheme).toContain(spec.scheme);
    expect(resolved.stored).toBe(spec.theme);
    expect(resolved.insightCount).toBe(4);
    expect(resolved.cardSpecs).toBeGreaterThanOrEqual(2);
    expect(resolved.cardBackground).not.toBe('');
    expect(resolved.cardText).not.toBe('');
  }
});
