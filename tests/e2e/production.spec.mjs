import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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

test('first service worker install does not reload the active page', async ({ page }) => {
  let documentNavigations = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentNavigations += 1;
  });
  await page.goto('/index.html#home');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(300);
  expect(documentNavigations).toBe(1);
});

test('legacy workout history migrates to IndexedDB without a 20-session cap', async ({ page }) => {
  const sessions = Array.from({ length: 28 }, (_, index) => ({
    id: `legacy-${index}`,
    name: `Session ${index}`,
    date: `2026-09-${String(28 - (index % 28)).padStart(2, '0')}`,
    items: [{ id: '0001', done: true, setLog: [{ completed: true, reps: 8, weight: 40 }] }],
  }));
  const customExercise = {
    id: 'custom-legacy-example', nameRu: 'Старое пользовательское упражнение', nameEn: 'Legacy custom exercise',
    zone: 'chest', target: 'pectorals', secondary: ['triceps'], equip: 'dumbbell',
    movementPattern: 'horizontal-push', trackingType: 'weight-reps', laterality: 'bilateral', compound: true,
    defaultSets: 3, defaultRepRange: '8–12', defaultRest: 90, loadIncrement: 2.5,
    notes: 'Контролируемая амплитуда', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  };
  await page.addInitScript(({ history, custom }) => {
    localStorage.setItem('mmg.history.v1', JSON.stringify(history));
    localStorage.setItem('mmg.customExercises.v1', JSON.stringify([custom]));
  }, { history: sessions, custom: customExercise });
  await page.goto('/index.html#home');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.historyCount)).toBe(28);
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.customExerciseCount)).toBe(1);
  const persistedCount = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise((resolve, reject) => {
      const request = db.transaction('history', 'readonly').objectStore('history').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const customCount = await new Promise((resolve, reject) => {
      const request = db.transaction('customExercises', 'readonly').objectStore('customExercises').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const profileCount = await new Promise((resolve, reject) => {
      const request = db.transaction('equipmentProfiles', 'readonly').objectStore('equipmentProfiles').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { version: db.version, count, customCount, profileCount };
  });
  expect(persistedCount).toEqual({ version: 3, count: 28, customCount: 1, profileCount: 4 });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.historyCount)).toBe(28);

  await page.goto('/index.html#settings');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#data-export').click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.app).toBe('markov-made-gym');
  expect(backup.schemaVersion).toBe(7);
  expect(JSON.parse(backup.data.history)).toHaveLength(28);
  expect(JSON.parse(backup.data.customExercises)).toHaveLength(1);
  expect(JSON.parse(backup.data.equipmentProfiles)).toHaveLength(4);
  await page.goto('/index.html#workout');
  await expect(page.locator('#hist .hist-item')).toHaveCount(20);
  await page.locator('#hist [data-history-more]').click();
  await expect(page.locator('#hist .hist-item')).toHaveCount(28);
});

test('custom exercise joins the Library, saved workout, Run Mode, history and schema v7 backup', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('#custom-exercise-open').click();
  await page.locator('#custom-name-ru').fill('Мой жим гантели');
  await page.locator('#custom-name-en').fill('My dumbbell press');
  await page.locator('#custom-zone').selectOption('chest');
  await page.locator('#custom-target').selectOption('pectorals');
  await page.locator('#custom-secondary').selectOption(['triceps']);
  await page.locator('#custom-equipment').selectOption('dumbbell');
  await page.locator('#custom-pattern').selectOption('horizontal-push');
  await page.locator('#custom-tracking').selectOption('weight-reps');
  await page.locator('#custom-laterality').selectOption('unilateral');
  await page.locator('#custom-compound').check();
  await page.locator('#custom-sets').fill('1');
  await page.locator('#custom-reps').fill('8–12');
  await page.locator('#custom-rest').fill('90');
  await page.locator('#custom-increment').fill('2.5');
  await page.locator('#custom-notes').fill('Опускай гантель под контролем.');
  await page.locator('#custom-exercise-save').click();

  const card = page.locator('.card[data-id^="custom-"]');
  await expect(card).toContainText('Мой жим гантели');
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.customExerciseCount)).toBe(1);
  await card.locator('[data-add]').click();
  await expect(page.locator('.workout-item')).toContainText('Мой жим гантели');

  await page.reload();
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.customExerciseCount)).toBe(1);
  await page.goto('/index.html#workout');
  const startRun = page.locator('[data-v8-start-run]:visible').first();
  if (await startRun.count()) await startRun.click();
  else await page.locator('#w-run:visible').click();
  await expect(page.locator('#run-stage')).toContainText('Мой жим гантели');
  await expect(page.locator('#run-stage [data-run-field="weight"]')).toBeVisible();
  await page.locator('#run-next').click();
  await expect(page.locator('#run-stage')).toContainText(/Все упражнения|All exercises/);
  await page.locator('#run-next').click();
  await expect(page.locator('#run')).toHaveAttribute('data-open', 'false');
  await page.goto('/index.html#workout');
  await expect(page.locator('#hist .hist-item')).toContainText('Мой жим гантели');
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.historyCount)).toBe(1);

  await page.goto('/index.html#settings');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#data-export').click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  const customExercises = JSON.parse(backup.data.customExercises);
  expect(backup.schemaVersion).toBe(7);
  expect(customExercises).toHaveLength(1);
  expect(customExercises[0]).toMatchObject({
    nameRu: 'Мой жим гантели', nameEn: 'My dumbbell press',
    trackingType: 'weight-reps', laterality: 'unilateral', loadIncrement: 2.5,
  });
});

test('equipment profiles constrain Library choices, survive reload and preserve the current workout', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  const filterOpen = page.locator('#mfb-open');
  if (await filterOpen.isVisible()) await filterOpen.click();
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.equipmentProfileCount)).toBe(4);
  await page.locator('#equipment-profile-select').selectOption('builtin-home');
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.activeEquipmentProfileId)).toBe('builtin-home');
  if (await page.locator('#filters-apply').isVisible()) await page.locator('#filters-apply').click();
  const firstHomeExercise = page.locator('#grid .card[data-id]').first();
  await expect(firstHomeExercise).toBeVisible();
  await firstHomeExercise.locator('[data-add]').click();
  await expect(page.locator('.workout-item')).toHaveCount(1);

  if (await filterOpen.isVisible()) await filterOpen.click();
  await page.locator('#equipment-profile-select').selectOption('builtin-travel');
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.activeEquipmentProfileId)).toBe('builtin-travel');
  if (await page.locator('#filters-apply').isVisible()) await page.locator('#filters-apply').click();
  await expect(page.locator('.workout-item')).toHaveCount(1);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.activeEquipmentProfileId)).toBe('builtin-travel');
  await expect(page.locator('.workout-item')).toHaveCount(1);

  if (await filterOpen.isVisible()) await filterOpen.click();
  page.once('dialog', dialog => dialog.accept('Weekend'));
  await page.locator('#equipment-profile-save').click();
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.equipmentProfileCount)).toBe(5);
  if (await page.locator('#filters-apply').isVisible()) await page.locator('#filters-apply').click();

  await page.goto('/index.html#settings');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#data-export').click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.schemaVersion).toBe(7);
  expect(JSON.parse(backup.data.equipmentProfiles)).toHaveLength(5);
  const importedProfileId = backup.data.equipmentProfileActive;
  expect(importedProfileId).toMatch(/^equipment-/);

  await page.evaluate(async () => {
    localStorage.setItem('mmg.equipmentProfiles.v1', '[]');
    localStorage.setItem('mmg.equipmentProfileActive.v1', 'builtin-home');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('equipmentProfiles', 'readwrite');
      tx.objectStore('equipmentProfiles').clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.activeEquipmentProfileId)).toBe('builtin-home');
  let importPreview='';
  page.once('dialog', dialog => { importPreview=dialog.message(); return dialog.accept(); });
  const importChooser = page.waitForEvent('filechooser');
  await page.locator('#data-import').click();
  const chooser = await importChooser;
  await chooser.setFiles({name:'equipment-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect.poll(() => importPreview).toMatch(/Резервная копия проверена|Backup validated/);
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.activeEquipmentProfileId)).toBe(importedProfileId);
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.equipmentProfileCount)).toBe(5);
});

test('hash routes and MARKOV MADE LAB calculators are usable', async ({ page }) => {
  await page.goto('/index.html#tools');
  await expect(page.locator('#tools')).toBeVisible();
  await expect(page.locator('#gym-tools-title')).toContainText(/Расчёты|Calculations/);
  await expect(page.locator('#lab-e1rm-out')).toContainText(/114[,.]58/);
  await page.locator('[data-lab-form="e1rm"] #e1rm-weight').fill('100');
  await page.locator('[data-lab-form="e1rm"] #e1rm-reps').fill('5');
  await page.locator('[data-lab-form="e1rm"]').getByRole('button', { name: /Рассчитать|Calculate/ }).click();
  await expect(page.locator('#lab-e1rm-out')).toContainText(/114[,.]5[89]/);
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
  await expect.poll(() => page.locator('#modal-img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#modal-img').evaluate((img) => img.naturalHeight)).toBeGreaterThan(0);

  const geometry = await page.locator('#modal-media').evaluate((frame) => {
    const img = frame.querySelector('#modal-img');
    const f = frame.getBoundingClientRect();
    const i = img.getBoundingClientRect();
    return {
      contained: i.left >= f.left - 1 && i.top >= f.top - 1 && i.right <= f.right + 1 && i.bottom <= f.bottom + 1,
      stepsTag: document.querySelector('#modal-steps').tagName,
      markers: [...document.querySelectorAll('#modal-steps li')].slice(0, 3).map((node) =>
        getComputedStyle(node, '::before').content
      ),
    };
  });
  expect(geometry.contained).toBe(true);
  expect(geometry.stepsTag).toBe('OL');
  expect(geometry.markers).toHaveLength(3);
  expect(geometry.markers.every((content) => content.includes('counter('))).toBe(true);
  expect(errors).toEqual([]);
});

test('run mode keeps full exercise media visible and surfaces execution cues', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('#grid [data-add]').first().click();
  await page.goto('/index.html#workout');
  await page.locator('[data-v8-start-run]:visible, #w-run:visible').first().click();

  await expect(page.locator('#run')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('.run-tech-cues')).toBeVisible();
  await expect(page.locator('[data-run-set-type]')).toHaveValue('working');
  await expect(page.locator('[data-run-field="rir"]')).toHaveCount(0);
  await expect(page.locator('.run-media')).toHaveCSS('object-fit', 'contain');
});

test('run mode exposes RIR and RPE only when advanced logging is enabled', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('mmg.settings.v1', JSON.stringify({ rir: true, rpe: true, reading: 'balanced' })));
  await page.reload();
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('#grid [data-add]').first().click();
  await page.goto('/index.html#workout');
  await page.locator('[data-v8-start-run]:visible, #w-run:visible').first().click();
  await expect(page.locator('[data-run-field="rir"]')).toBeVisible();
  await expect(page.locator('[data-run-field="rpe"]')).toBeVisible();
  await page.locator('[data-run-field="rir"]').fill('2');
  await page.locator('[data-run-field="rpe"]').fill('8');
  await page.locator('[data-run-set-type]').selectOption('backoff');
  await expect(page.locator('[data-run-set-type]')).toHaveValue('backoff');
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
    { theme: 'soft', canvas: '#eaf0f6', signal: '#386aa9', scheme: 'light' },
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


test('flagship restores saved programme on home and exposes the weekly pulse', async ({ page }) => {
  await page.goto('/index.html#home');
  await page.evaluate(() => {
    localStorage.setItem('mmg.plan.v1', JSON.stringify({
      v: 2,
      createdAt: Date.now(),
      weekKey: '',
      completedDays: [],
      ctx: { goal: 'muscle', level: 'middle', days: 2, time: 60, place: 'gym', focus: 'balanced', cardio: 'light', steps: 'mid' },
      days: [
        { key: 'fullA', index: 0, items: [{ id: '0001', sets: 3, reps: '10–12', rest: 90 }] },
        { key: 'fullB', index: 1, items: [{ id: '0002', sets: 3, reps: '10–12', rest: 90 }] },
      ],
    }));
  });
  await page.reload();
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await expect(page.locator('#v10-home-pulse')).toBeVisible();
  await expect(page.locator('#v10-home-pulse')).toContainText(/0\s*\/\s*2/);
  await page.goto('/index.html#program');
  await expect(page.locator('#plan-out')).toHaveAttribute('data-filled', 'true');
  await expect(page.locator('#plan-out .v10-plan-day')).toHaveCount(2);
});

test('readability choice persists and progress supports multiple chart signals', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mmg.diary.v1', JSON.stringify([
      { date: '2026-09-26', weight: 108.2, waist: 85.0, sleep: 7.5, recovery: 3, mood: 3, hunger: 2, fatigue: 2 },
      { date: '2026-09-20', weight: 109.0, waist: 85.8, sleep: 6.8, recovery: 2, mood: 3, hunger: 2, fatigue: 3 },
    ]));
  });
  await page.goto('/index.html#settings');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('[data-v10-reading="comfortable"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-reading', 'comfortable');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-reading', 'comfortable');

  await page.goto('/index.html#progress');
  await expect(page.locator('[data-progress-metric="weight"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-progress-metric="waist"]').click();
  await expect(page.locator('[data-progress-metric="waist"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-progress-metric="sleep"]').click();
  await expect(page.locator('[data-progress-metric="sleep"]')).toHaveAttribute('aria-pressed', 'true');
});


test('library quick scenarios stay synchronized with filters', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  const home = page.locator('#v10-library-quick-presets [data-preset="home"]');
  await expect(home).toBeVisible();
  await home.click();
  await expect(home).toHaveAttribute('aria-pressed', 'true');

  const gym = page.locator('#v10-library-quick-presets [data-preset="gym"]');
  await gym.click();
  await expect(gym).toHaveAttribute('aria-pressed', 'true');
  await expect(home).toHaveAttribute('aria-pressed', 'false');
});
