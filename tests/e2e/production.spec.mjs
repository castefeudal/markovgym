import { test, expect } from '@playwright/test';

async function exportBackup(page, selector = '#data-export') {
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.locator(selector).click();
  const output = page.locator('#data-io');
  await expect(output).toBeVisible();
  return JSON.parse(await output.inputValue());
}

test('backup export attempts a file download and always exposes its JSON fallback', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop') test.skip();
  await page.goto('/index.html#settings');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const downloadPromise = page.waitForEvent('download');
  const backup = await exportBackup(page);
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^markov-made-gym-backup-.*\.json$/);
  expect(backup).toMatchObject({ app: 'markov-made-gym', schemaVersion: 10, kind: 'mmg-backup' });
});

async function readIndexedUserState(page, key, fallback = null) {
  return page.evaluate(async ({ key, fallback }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('userState', 'readonly').objectStore('userState').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (record?.value == null) return fallback;
    try { return JSON.parse(record.value); } catch { return fallback; }
  }, { key, fallback });
}

async function readIndexedExercisePreference(page, exerciseId) {
  return page.evaluate(async id => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('exercisePreferences', 'readonly').objectStore('exercisePreferences').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return record?.preference || null;
  }, exerciseId);
}

async function chooseLanguage(page, locale) {
  const desktopControl = page.locator(`#lang-switch [data-lang="${locale}"]`);
  if (await desktopControl.isVisible()) {
    await desktopControl.click();
    return;
  }
  await page.goto('/index.html#settings');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-route-ready', 'settings');
  await expect(page.locator('#settings')).toBeVisible();
  const control = page.locator(`#v7-language-actions [data-lang="${locale}"]`);
  await control.scrollIntoViewIfNeeded();
  await control.click();
}

test('home boots with the full exercise dataset and no page errors', async ({ page }) => {
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failed.push(request.url()));
  await page.goto('/index.html#home');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-storage-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-core-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-route-ready', 'home');
  expect(await page.evaluate(() => typeof window.mmgLabOpen)).toBe('undefined');
  await expect(page.locator('#stat-total')).toHaveText('1324');
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('daily nutrition log persists by date and links optional weight to the progress diary', async ({ page }) => {
  await page.goto('/index.html#nutrition');
  await page.locator('#nutrition-log-form').scrollIntoViewIfNeeded();
  await expect(page.locator('#nutrition-log-title')).toBeVisible();
  await page.locator('#kbju-form').scrollIntoViewIfNeeded();
  await page.locator('#kbju-calc').click();
  await expect(page.locator('#nutrition-weekly-budget')).toContainText('Ориентир на неделю');
  const logDate = await page.locator('#nlog-date').inputValue();
  await page.locator('#nlog-date').fill(logDate);
  await page.locator('#nlog-calories').fill('2240');
  await page.locator('#nlog-protein').fill('148');
  await page.locator('#nlog-fat').fill('72');
  await page.locator('#nlog-carbs').fill('252');
  await page.locator('#nlog-weight').fill('80.4');
  await page.locator('#nlog-accuracy').selectOption('estimated');
  await page.locator('#nlog-note').fill('Long day');
  await page.locator('#nutrition-log-form button[type="submit"]').click();
  await expect(page.locator('#nutrition-log-list')).toContainText('2240 ккал');
  await expect(page.locator('#nutrition-log-list')).toContainText('80.4 кг');
  const weeklyBudgetText = (await page.locator('#nutrition-weekly-budget').innerText()).replace(/\u00a0/g, ' ');
  expect(weeklyBudgetText).toContain('2 240');
  await expect(page.locator('#nutrition-trend')).toContainText('80.4');
  await expect(page.locator('#nutrition-trend')).toContainText('—');
  const saved = await page.evaluate(async (date) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const nutrition = await new Promise((resolve, reject) => {
      const request = db.transaction('nutritionDays', 'readonly').objectStore('nutritionDays').get(date);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const diaryRecord = await new Promise((resolve, reject) => {
      const request = db.transaction('userState', 'readonly').objectStore('userState').get('mmg.diary.v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const diary = JSON.parse(diaryRecord?.value || '[]');
    db.close();
    return { nutrition, diary: diary.find(entry => entry.date === date) };
  }, logDate);
  expect(saved.nutrition).toMatchObject({ calories: 2240, protein: 148, fat: 72, carbs: 252, weightKg: 80.4, accuracy: 'estimated', note: 'Long day' });
  expect(saved.diary.weight).toBe(80.4);
  await page.reload();
  await expect(page.locator('#nutrition-log-list')).toContainText('2240 ккал');
});

test('Lab reads full workout and nutrition data from IndexedDB repositories', async ({ page }) => {
  await page.goto('/index.html#home');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['history', 'nutritionDays', 'userState'], 'readwrite');
      tx.objectStore('history').put({
        id: 'lab-idb-session', date: '2026-09-30', durationMin: 45,
        items: [{ id: '0001', setLog: [{ completed: true, type: 'working', weight: 80, reps: 8 }] }]
      });
      tx.objectStore('nutritionDays').put({ date: '2026-09-30', calories: 2200, protein: 140, weightKg: 80 });
      tx.objectStore('userState').put({ key: 'mmg.diary.v1', value: JSON.stringify([{ date: '2026-09-30', weight: 80 }]) });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.goto('/index.html#tools');
  await expect(page.locator('#lab-volume-kpis')).toContainText('1');
  await expect(page.locator('#lab-personal-kpis')).toContainText('1');
  await expect(page.locator('#lab-adaptive-data')).toContainText('1');
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

test('corrupt backup import leaves the current local profile and workout untouched', async ({ page }) => {
  const profile = { goal: 'muscle', level: 'middle', place: 'gym', days: '3', done: true, skipped: false };
  const workout = [{ id: '0001', sets: 3, reps: '8–12', weight: '40', done: false }];
  await page.addInitScript(({ profileSeed, workoutSeed }) => {
    localStorage.setItem('mmg.profile.v1', JSON.stringify(profileSeed));
    localStorage.setItem('mmg.workout.v2', JSON.stringify(workoutSeed));
  }, { profileSeed: profile, workoutSeed: workout });
  await page.goto('/index.html#settings');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  const before = { profile: await readIndexedUserState(page, 'mmg.profile.v1'), workout: await readIndexedUserState(page, 'mmg.workout.v2') };
  const importChooser = page.waitForEvent('filechooser');
  await page.locator('#data-import').click();
  const chooser = await importChooser;
  await chooser.setFiles({ name: 'corrupt-backup.json', mimeType: 'application/json', buffer: Buffer.from('{ definitely not valid json') });
  await expect(page.locator('.toast')).toContainText(/Не получилось прочитать JSON|Could not read the JSON/);
  const after = { profile: await readIndexedUserState(page, 'mmg.profile.v1'), workout: await readIndexedUserState(page, 'mmg.workout.v2') };
  expect(after).toEqual(before);
});

test('hydrated IndexedDB state wins over stale or corrupt LocalStorage mirrors', async ({ page }) => {
  const profile = { goal: 'muscle', level: 'middle', place: 'gym', days: '3', done: true, skipped: false };
  const workout = [{ id: '0001', sets: 3, reps: '8–12', weight: '40', done: false }];
  await page.addInitScript(({ profileSeed, workoutSeed }) => {
    localStorage.setItem('mmg.profile.v1', JSON.stringify(profileSeed));
    localStorage.setItem('mmg.workout.v2', JSON.stringify(workoutSeed));
  }, { profileSeed: profile, workoutSeed: workout });
  await page.goto('/index.html#workout');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('.workout-item')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.userStateReady)).toBe(true);
  expect(await page.evaluate(() => ['mmg.profile.v1', 'mmg.workout.v2'].map(key => localStorage.getItem(key)))).toEqual([null, null]);

  await page.evaluate(() => {
    localStorage.setItem('mmg.profile.v1', '{ stale and corrupt');
    localStorage.setItem('mmg.workout.v2', '{ stale and corrupt');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('.workout-item')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.storageWarnings.filter(item => item.type === 'json'))).toEqual([]);
  const restored = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const state = db.transaction('userState', 'readonly').objectStore('userState');
    const read = key => new Promise((resolve, reject) => {
      const request = state.get(key);
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    });
    const [savedProfile, savedWorkout] = await Promise.all([read('mmg.profile.v1'), read('mmg.workout.v2')]);
    db.close();
    return { profile: JSON.parse(savedProfile), workout: JSON.parse(savedWorkout) };
  });
  expect(restored.profile).toMatchObject({ goal: 'muscle', place: 'gym', done: true });
  expect(restored.workout).toHaveLength(1);
});

test('a waiting service worker update reloads once only after the user accepts it', async ({ page }) => {
  let documentNavigations = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentNavigations += 1;
  });
  await page.goto('/index.html#home');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__mmg_mock_waiting_update__') === 'used') return;
    sessionStorage.setItem('__mmg_mock_waiting_update__', 'used');
    const serviceWorker = navigator.serviceWorker;
    Object.defineProperty(serviceWorker, 'register', {
      configurable: true,
      value: async () => ({
        waiting: {
          postMessage(message) {
            sessionStorage.setItem('__mmg_update_message__', message.type);
            serviceWorker.dispatchEvent(new Event('controllerchange'));
            serviceWorker.dispatchEvent(new Event('controllerchange'));
          },
        },
        installing: null,
        addEventListener() {},
      }),
    });
  });
  await page.reload();
  await expect(page.locator('#mmg-update')).toContainText('Доступна новая версия');
  expect(documentNavigations).toBe(2);
  await page.locator('#mmg-update button').click();
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('__mmg_update_message__'))).toBe('SKIP_WAITING');
  expect(documentNavigations).toBe(3);
  await page.waitForTimeout(150);
  expect(documentNavigations).toBe(3);
});

test('legacy workout history migrates to IndexedDB without a 20-session cap', async ({ page }) => {
  const sessions = Array.from({ length: 28 }, (_, index) => ({
    id: `legacy-${index}`,
    name: `Session ${index}`,
    date: `2026-09-${String(28 - (index % 28)).padStart(2, '0')}`,
    note: index === 0 ? 'bench note' : '',
    planDay: index % 2 === 0 ? 0 : null,
    durationSec: index * 60,
    personalRecords: index === 0 ? [{ type: 'e1rm', value: 52.3 }] : [],
    items: [{ id: index % 2 === 0 ? '0001' : '0002', done: true, setLog: [{ completed: true, type: 'working', reps: 8, weight: 40, rir: 2, rpe: 8, restSec: 90, note: index === 0 ? 'bench note' : '' }] }],
  }));
  const customExercise = {
    id: 'custom-legacy-example', nameRu: 'Старое пользовательское упражнение', nameEn: 'Legacy custom exercise',
    zone: 'chest', target: 'pectorals', secondary: ['triceps'], equip: 'dumbbell',
    movementPattern: 'horizontal-push', trackingType: 'weight-reps', laterality: 'bilateral', compound: true,
    defaultSets: 3, defaultRepRange: '8–12', defaultRest: 90, loadIncrement: 2.5,
    notes: 'Контролируемая амплитуда', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  };
  const profile = { goal: 'muscle', level: 'middle', place: 'gym', days: '3', typicalSessionMinutes: '60', equipmentAvailability: [], focus: 'balanced', limitations: [], recoveryBaseline: 'mid', done: true, skipped: false };
  const diary = [{ date: '2026-09-27', weight: 82, waist: 86, sleep: 7, recovery: 3 }];
  await page.addInitScript(({ history, custom, preferences, profile, diary }) => {
    localStorage.setItem('mmg.history.v1', JSON.stringify(history));
    localStorage.setItem('mmg.customExercises.v1', JSON.stringify([custom]));
    localStorage.setItem('mmg.exercisePreferences.v1', JSON.stringify(preferences));
    localStorage.setItem('mmg.profile.v1', JSON.stringify(profile));
    localStorage.setItem('mmg.diary.v1', JSON.stringify(diary));
    localStorage.setItem('mmg.workout.v2', JSON.stringify([{ id: '0001', sets: 3, reps: '8–12', weight: '40', done: false }]));
  }, { history: sessions, custom: customExercise, preferences: { '0001': 'prefer', 'custom-legacy-example': 'lessOften' }, profile, diary });
  await page.goto('/index.html#home');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.historyCount)).toBe(28);
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.customExerciseCount)).toBe(1);
  expect(await page.evaluate(() => [
    'mmg.history.v1', 'mmg.customExercises.v1', 'mmg.exercisePreferences.v1',
    'mmg.profile.v1', 'mmg.diary.v1', 'mmg.workout.v2'
  ].map(key => localStorage.getItem(key)))).toEqual([null, null, null, null, null, null]);
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
    const exercisePreferences = await new Promise((resolve, reject) => {
      const request = db.transaction('exercisePreferences', 'readonly').objectStore('exercisePreferences').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const userState = await new Promise((resolve, reject) => {
      const request = db.transaction('userState', 'readonly').objectStore('userState').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { version: db.version, count, customCount, profileCount, exercisePreferences, userState };
  });
  expect(persistedCount.version).toBe(7);
  expect(persistedCount.count).toBe(28);
  expect(persistedCount.customCount).toBe(1);
  expect(persistedCount.profileCount).toBe(4);
  expect(persistedCount.exercisePreferences).toEqual([{ id: '0001', preference: 'prefer' }, { id: 'custom-legacy-example', preference: 'lessOften' }]);
  const migratedState = Object.fromEntries(persistedCount.userState.map(record => [record.key, record.value]));
  expect(JSON.parse(migratedState['mmg.profile.v1'])).toMatchObject({ goal: 'muscle', place: 'gym', done: true });
  expect(JSON.parse(migratedState['mmg.diary.v1'])).toEqual(diary);
  expect(JSON.parse(migratedState['mmg.workout.v2'])).toHaveLength(1);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.historyCount)).toBe(28);

  await page.goto('/index.html#settings');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const backup = await exportBackup(page);
  expect(backup.app).toBe('markov-made-gym');
  expect(backup.schemaVersion).toBe(10);
  expect(JSON.parse(backup.data.calculatorHistory)).toEqual([]);
  expect(JSON.parse(backup.data.history)).toHaveLength(28);
  expect(JSON.parse(backup.data.customExercises)).toHaveLength(1);
  expect(JSON.parse(backup.data.equipmentProfiles)).toHaveLength(4);
  await page.goto('/index.html#workout');
  await expect(page.locator('#hist .hist-item')).toHaveCount(20);
  await page.locator('#hist [data-history-more]').click();
  await expect(page.locator('#hist .hist-item')).toHaveCount(28);
  await page.locator('#history-query').fill('Session 27');
  await expect(page.locator('#hist .hist-item')).toHaveCount(1);
  await page.locator('#history-query').fill('');
  await page.locator('#history-from').fill('2026-09-28');
  await expect(page.locator('#hist .hist-item')).toHaveCount(1);
  await page.locator('#history-from').fill('');
  await page.locator('#history-programme').selectOption('day:0');
  await expect(page.locator('#hist .hist-item')).toHaveCount(14);
  await page.locator('#history-programme').selectOption('');
  await page.locator('#history-exercise').selectOption('0001');
  await expect(page.locator('#hist .hist-item')).toHaveCount(14);
  await page.locator('#history-duration-min').fill('20');
  await expect(page.locator('#hist .hist-item')).toHaveCount(4);
  await page.locator('#history-duration-min').fill('');
  await page.locator('#history-pr-only').check();
  await expect(page.locator('#hist .hist-item')).toHaveCount(1);
  await page.locator('#hist [data-hist-detail]').click();
  await expect(page.locator('.hist-detail')).toContainText('RIR 2');
  await expect(page.locator('.hist-detail')).toContainText('RPE 8');
  await expect(page.locator('.hist-detail')).toContainText(/Rest 90s|Отдых 90s/);
  await expect(page.locator('.hist-detail')).toContainText('bench note');
});

test('partial IndexedDB collections merge missing legacy rows without replacing current records', async ({ page }) => {
  await page.goto('/index.html#home');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['history', 'nutritionDays'], 'readwrite');
      tx.objectStore('history').put({ id: 'idb-current', date: '2026-09-20', name: 'Current', items: [] });
      tx.objectStore('nutritionDays').put({ date: '2026-09-20', calories: 2200, protein: 140, fat: null, carbs: null, weightKg: null, accuracy: 'unknown', note: '', updatedAt: '' });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem('mmg.history.v1', JSON.stringify([
      { id: 'idb-current', date: '2026-09-20', name: 'Stale mirror', items: [] },
      { id: 'legacy-extra', date: '2026-09-19', name: 'Legacy', items: [] },
    ]));
    localStorage.setItem('mmg.nutritionLog.v1', JSON.stringify([
      { date: '2026-09-20', calories: 1800, protein: 90 },
      { date: '2026-09-19', calories: 2100, protein: 130 },
    ]));
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.historyCount)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.mmgDiagnostics?.nutritionCount)).toBe(2);
  const restored = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [history, nutritionDays] = await Promise.all([
      new Promise((resolve, reject) => { const request = db.transaction('history', 'readonly').objectStore('history').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }),
      new Promise((resolve, reject) => { const request = db.transaction('nutritionDays', 'readonly').objectStore('nutritionDays').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }),
    ]);
    db.close();
    return { history, nutritionDays };
  });
  expect(restored.history.find(row => row.id === 'idb-current')?.name).toBe('Current');
  expect(restored.history.map(row => row.id).sort()).toEqual(['idb-current', 'legacy-extra']);
  expect(restored.nutritionDays.find(row => row.date === '2026-09-20')?.calories).toBe(2200);
  expect(restored.nutritionDays.map(row => row.date).sort()).toEqual(['2026-09-19', '2026-09-20']);
});

test('custom exercise joins the Library, saved workout, Run Mode, history and schema v10 backup', async ({ page }) => {
  test.setTimeout(90_000);
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
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const backup = await exportBackup(page);
  const customExercises = JSON.parse(backup.data.customExercises);
  expect(backup.schemaVersion).toBe(10);
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
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const backup = await exportBackup(page, '#v7-data-actions [data-v7-data="export"]');
  expect(backup.schemaVersion).toBe(10);
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
      const tx = db.transaction(['equipmentProfiles', 'userState'], 'readwrite');
      tx.objectStore('equipmentProfiles').clear();
      tx.objectStore('userState').delete('mmg.equipmentProfileActive.v1');
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

test('exercise preferences persist, affect library ranking and round-trip through backups', async ({ page }) => {
  const savedProfile = { goal: 'muscle', level: 'middle', place: 'gym', days: '3', typicalSessionMinutes: '60', equipmentAvailability: [], focus: 'balanced', limitations: [], recoveryBaseline: 'mid', done: true, skipped: false };
  await page.addInitScript(profile => {
    if (sessionStorage.getItem('__mmg_profile_seeded')) return;
    localStorage.setItem('mmg.profile.v1', JSON.stringify(profile));
    sessionStorage.setItem('__mmg_profile_seeded', '1');
  }, savedProfile);
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  const preferredCard = page.locator('#grid .card').nth(5);
  const exerciseId = await preferredCard.getAttribute('data-id');
  await preferredCard.locator('[data-pref-toggle]').click();
  const preference = preferredCard.locator('[data-exercise-preference]');
  await expect(preference.locator('option')).toHaveCount(6);
  await preference.selectOption('prefer');
  await expect(page.locator('#grid .card').first()).toHaveAttribute('data-id', exerciseId);
  await expect.poll(() => readIndexedExercisePreference(page, exerciseId)).toBe('prefer');
  await expect.poll(() => page.evaluate(async id => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('markov-made-gym'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const record = await new Promise((resolve, reject) => { const request = db.transaction('exercisePreferences', 'readonly').objectStore('exercisePreferences').get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return record?.preference;
  }, exerciseId)).toBe('prefer');
  await page.reload();
  await page.locator(`[data-pref-toggle="${exerciseId}"]`).click();
  await expect(page.locator(`[data-exercise-preference="${exerciseId}"]`)).toHaveValue('prefer');
  await page.locator('#search').fill(exerciseId);
  await expect(page.locator(`[data-pref-toggle="${exerciseId}"]`)).toBeVisible();
  await page.locator(`[data-pref-toggle="${exerciseId}"]`).click();
  await page.locator(`[data-exercise-preference="${exerciseId}"]`).selectOption('discomfort');
  await expect.poll(() => readIndexedExercisePreference(page, exerciseId)).toBe('discomfort');

  await page.goto('/index.html#settings');
  const backup = await exportBackup(page);
  expect(backup.schemaVersion).toBe(10);
  expect(JSON.parse(backup.data.exercisePreferences)[exerciseId]).toBe('discomfort');
  expect(JSON.parse(backup.data.profile)).toMatchObject({ goal: 'muscle', place: 'gym', done: true });

  await page.evaluate(async () => {
    localStorage.setItem('mmg.exercisePreferences.v1', '{}');
    localStorage.removeItem('mmg.profile.v1');
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('markov-made-gym'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction(['exercisePreferences', 'userState'], 'readwrite'); tx.objectStore('exercisePreferences').clear(); tx.objectStore('userState').clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.reload();
  let importPreview = '';
  page.once('dialog', dialog => { importPreview = dialog.message(); return dialog.accept(); });
  const importChooser = page.waitForEvent('filechooser');
  await page.locator('#data-import').click();
  const chooser = await importChooser;
  const importNavigation = page.waitForNavigation();
  await chooser.setFiles({ name: 'exercise-preferences.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect.poll(() => importPreview).toMatch(/Резервная копия проверена|Backup validated/);
  await importNavigation;
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-storage-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect.poll(() => readIndexedExercisePreference(page, exerciseId), { timeout: 15000 }).toBe('discomfort');
  await expect.poll(() => page.evaluate(async id => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('markov-made-gym'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const record = await new Promise((resolve, reject) => { const request = db.transaction('exercisePreferences', 'readonly').objectStore('exercisePreferences').get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return record?.preference;
  }, exerciseId), { timeout: 15000 }).toBe('discomfort');
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('markov-made-gym'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const record = await new Promise((resolve, reject) => { const request = db.transaction('userState', 'readonly').objectStore('userState').get('mmg.profile.v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return JSON.parse(record?.value || '{}');
  })).toMatchObject({ goal: 'muscle', place: 'gym', done: true });

  page.once('dialog', dialog => dialog.accept());
  const clearedNavigation = page.waitForNavigation();
  await page.locator('#data-clear').click();
  await clearedNavigation;
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('markov-made-gym'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const count = await new Promise((resolve, reject) => { const request = db.transaction('equipmentProfiles', 'readonly').objectStore('equipmentProfiles').count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return count;
  })).toBe(4);
  const clearedState = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('markov-made-gym'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const counts = await Promise.all(['history', 'customExercises', 'equipmentProfiles', 'exercisePreferences', 'programs', 'userState'].map(name => new Promise((resolve, reject) => {
      const request = db.transaction(name, 'readonly').objectStore(name).count(); request.onsuccess = () => resolve([name, request.result]); request.onerror = () => reject(request.error);
    })));
    const userState = await new Promise((resolve, reject) => { const request = db.transaction('userState', 'readonly').objectStore('userState').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const localProfile = localStorage.getItem('mmg.profile.v1');
    db.close(); return { counts: Object.fromEntries(counts), userState: Object.fromEntries(userState.map(record => [record.key, record.value])), localProfile };
  });
  expect(clearedState.counts).toMatchObject({ history: 0, customExercises: 0, equipmentProfiles: 4, exercisePreferences: 0, programs: 0 });
  expect(JSON.parse(clearedState.userState['mmg.diary.v1'] || '[]')).toEqual([]);
  expect(JSON.parse(clearedState.userState['mmg.plan.v1'] || 'null')).toBeNull();
  expect(JSON.parse(clearedState.userState['mmg.workout.v2'] || '[]')).toEqual([]);
  expect(JSON.parse(clearedState.userState['mmg.favorites.v8'] || '[]')).toEqual([]);
  expect(JSON.parse(clearedState.userState['mmg.exercisePreferences.v1'] || '{}')).toEqual({});
  expect(clearedState.localProfile).toBeNull();
  expect(JSON.parse(clearedState.userState['mmg.profile.v1'] || 'null')?.goal || '').not.toBe('muscle');
});

test('distance and duration tracking stay structured from Run Mode into workout history', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('#custom-exercise-open').click();
  await page.locator('#custom-name-ru').fill('Своя пробежка');
  await page.locator('#custom-name-en').fill('Custom run');
  await page.locator('#custom-zone').selectOption('cardio');
  const firstTarget = await page.locator('#custom-target option').evaluateAll(options => options.map(option => option.value).find(Boolean));
  await page.locator('#custom-target').selectOption(firstTarget);
  await page.locator('#custom-equipment').selectOption('body weight');
  await page.locator('#custom-pattern').selectOption({ index: 0 });
  await page.locator('#custom-tracking').selectOption('distance-duration');
  await page.locator('#custom-sets').fill('1');
  await page.locator('#custom-exercise-save').click();
  const card = page.locator('.card[data-id^="custom-"]');
  await expect(card).toContainText('Своя пробежка');
  await card.locator('[data-add]').click();
  await page.goto('/index.html#workout');
  await page.locator('[data-v8-start-run]:visible, #w-run:visible').first().click();
  await expect(page.locator('[data-run-field="distance"]')).toBeVisible();
  await expect(page.locator('[data-run-field="duration"]')).toBeVisible();
  await page.locator('[data-run-field="distance"]').fill('2');
  await page.locator('[data-run-field="duration"]').fill('12:30');
  await page.locator('#run-next').click();
  const savedLog = (await readIndexedUserState(page, 'mmg.workout.v2'))[0].setLog[0];
  expect(savedLog).toMatchObject({ distance: '2', duration: '12:30' });
  await expect(page.locator('#run-stage')).toContainText(/Все упражнения|All exercises/);
  await page.locator('#run-next').click();
  await page.goto('/index.html#workout');
  const historyItem = page.locator('#hist .hist-item').first();
  await expect(historyItem).toContainText('Своя пробежка');
  await historyItem.locator('[data-hist-detail]').click();
  await expect(historyItem.locator('.hist-detail')).toContainText('2 km · 12:30');
});

test('hash routes and MARKOV MADE LAB calculators are usable', async ({ page }) => {
  await page.goto('/index.html#tools');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('#tools')).toBeVisible();
  await expect(page.locator('#gym-tools-title')).toContainText(/Расчёты|Calculations/);
  await expect(page.locator('#lab-e1rm-out')).toContainText(/114[,.]58/);
  const evidence = page.locator('#tools [data-evidence-id="estimated-1rm"]');
  await evidence.locator('summary').click();
  await expect(evidence).toContainText('Brzycki, 1993');
  await expect(evidence.locator('a[href="https://doi.org/10.1080/07303084.1993.10606684"]')).toHaveAttribute('rel', 'noopener noreferrer');
  await page.locator('[data-lab-form="e1rm"] #e1rm-weight').fill('100.1');
  await page.locator('[data-lab-form="e1rm"] #e1rm-reps').fill('5');
  await page.locator('[data-lab-form="e1rm"]').getByRole('button', { name: /Рассчитать|Calculate/ }).click();
  await expect(page.locator('#lab-e1rm-out')).toContainText(/114[,.]7/);
  await expect.poll(async () => (await readIndexedUserState(page, 'mmg.calculatorResults.v1', [])).length).toBe(1);
  const results = await readIndexedUserState(page, 'mmg.calculatorResults.v1', []);
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ calculatorId: 'lab-e1rm', title: 'Оценка одноповторного максимума', evidenceId: 'estimated-1rm' });
  await page.goto('/index.html#settings');
  const calculatorBackup = await exportBackup(page);
  expect(calculatorBackup.schemaVersion).toBe(10);
  expect(JSON.parse(calculatorBackup.data.calculatorHistory)).toHaveLength(1);
  await page.goto('/index.html#library');
  await expect(page.locator('#library')).toBeVisible();
  await expect(page.locator('#search')).toBeVisible();
});

test('mobile shell has no horizontal page overflow', async ({ page }) => {
  await page.goto('/index.html#home');
  for (const [width, height] of [[360, 800], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `page overflow at ${width}x${height}`).toBeLessThanOrEqual(1);
  }
});

test('RU and EN runtime translations follow the saved language', async ({ page }) => {
  await page.goto('/index.html#workout');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('#workout-list .empty b')).toContainText('Тренировка пока пустая');
  await chooseLanguage(page, 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/index.html#workout');
  await expect(page.locator('#workout-list .empty b')).toContainText('The workout is empty');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#workout-list .empty b')).toContainText('The workout is empty');
  await page.goto('/index.html#settings');
  await chooseLanguage(page, 'ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.goto('/index.html#workout');
  await expect(page.locator('#workout-list .empty b')).toContainText('Тренировка пока пустая');
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
  await page.locator('#modal [data-swap="same"]').click();
  await expect(page.locator('#swap-list .swap-item').first()).toBeVisible();
  await expect(page.locator('#swap-list .swap-why').first()).toContainText('доступно');

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
  const exerciseId = await page.locator('#grid [data-add]').evaluateAll(async (buttons) => {
    const raw = await (await fetch('./data/exercises-compact.json')).json();
    const strengthIds = new Set(raw.x.filter((row) => raw.bp[row[3]] !== 'cardio').map((row) => row[0]));
    return buttons.find((button) => strengthIds.has(button.getAttribute('data-add')))?.getAttribute('data-add');
  });
  expect(exerciseId).toBeTruthy();
  await page.locator('#grid [data-add="' + exerciseId + '"]').click();
  await page.goto('/index.html#workout');
  await page.locator('[data-v8-start-run]:visible, #w-run:visible').first().click();
  await expect(page.locator('[data-run-field="rir"]')).toBeVisible();
  await expect(page.locator('[data-run-field="rpe"]')).toBeVisible();
  await page.locator('[data-run-field="rir"]').fill('2');
  await page.locator('[data-run-field="rpe"]').fill('8');
});

test('Run Mode announces a history-backed estimated one-rep-max record', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  const exerciseId = await page.locator('#grid [data-add]').evaluateAll(async (buttons) => {
    const raw = await (await fetch('./data/exercises-compact.json')).json();
    const strengthIds = new Set(raw.x.filter((row) => raw.bp[row[3]] !== 'cardio').map((row) => row[0]));
    return buttons.find((button) => strengthIds.has(button.getAttribute('data-add')))?.getAttribute('data-add');
  });
  expect(exerciseId).toBeTruthy();
  await page.evaluate(async (id) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('history', 'readwrite');
      tx.objectStore('history').put({ id: 'baseline', name: 'Baseline', date: '2026-09-01', items: [{ id, setLog: [{ completed: true, type: 'working', weight: 100, reps: 5 }] }] });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, exerciseId);
  await page.reload();
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.locator('#grid [data-add="' + exerciseId + '"]').click();
  await expect.poll(async () => (await readIndexedUserState(page, 'mmg.workout.v2', [])).length, { timeout: 10_000 }).toBe(1);
  await page.goto('/index.html#workout');
  const workoutSets = page.locator('.workout-item [data-field="sets"]');
  await workoutSets.fill('1');
  await workoutSets.press('Tab');
  await page.locator('[data-v8-start-run]:visible, #w-run:visible').first().click();
  await page.locator('[data-run-field="weight"]').fill('105');
  const beforeStep = Number(await page.locator('[data-run-field="weight"]').inputValue());
  await page.locator('[data-run-adjust="weight"][data-direction="1"]').click();
  expect(Number(await page.locator('[data-run-field="weight"]').inputValue())).toBeGreaterThan(beforeStep);
  await page.locator('[data-run-add-set]').click();
  await expect(page.locator('[data-run-set]')).toHaveCount(2);
  await page.locator('[data-run-remove-set]').click();
  await expect(page.locator('[data-run-set]')).toHaveCount(1);
  await page.locator('[data-run-field="reps"]').fill('5');
  await page.locator('[data-run-field="note"]').fill('Keep the next rep controlled');
  await expect.poll(async () => (await readIndexedUserState(page, 'mmg.workout.v2'))[0].setLog[0].note).toBe('Keep the next rep controlled');
  await page.locator('#run-next').click();
  await expect(page.locator('.run-pr-notice')).toContainText('Новый PR');
  await expect(page.locator('.run-pr-notice')).toContainText('e1RM');
  await page.locator('#run-prev').click();
  await expect(page.locator('[data-run-undo]')).toBeVisible();
  await page.locator('[data-run-undo]').click();
  await expect(page.locator('.run-pr-notice')).toHaveCount(0);
});

test('equipment-based progression increment can be overridden and survives reload', async ({ page }) => {
  await page.goto('/index.html#workout');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  await page.evaluate(async (id) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('userState', 'readwrite');
      tx.objectStore('userState').put({ key: 'mmg.workout.v2', value: JSON.stringify([{ id, sets: 3, reps: '6–8', weight: '', done: false, setLog: [] }]) });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('history', 'readwrite');
      tx.objectStore('history').put({ id: 'increment-baseline', name: 'Baseline', date: '2026-09-28', items: [{ id, setLog: [
        { completed: true, type: 'working', weight: 50, reps: 8 },
        { completed: true, type: 'working', weight: 50, reps: 8 },
      ] }] });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, '0025');
  const exerciseId = '0025';
  await page.reload();
  const step = page.locator('.workout-item[data-id="' + exerciseId + '"] [data-load-increment]');
  await expect(step).toBeVisible();
  await expect(step.locator('option').first()).toContainText('2.5');
  await step.selectOption('1.25');
  await expect.poll(async () => (await readIndexedUserState(page, 'mmg.settings.v1')).loadIncrements[exerciseId]).toBe(1.25);
  await page.reload();
  await expect(page.locator('.workout-item[data-id="' + exerciseId + '"] [data-load-increment]')).toHaveValue('1.25');
  await expect(page.locator('.workout-item[data-id="' + exerciseId + '"] .workout-progression b')).toContainText('51.25');
});

test('Lab warm-up can be added before an unstarted weighted exercise', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  const exerciseId = await page.locator('#grid [data-add]').evaluateAll(async (buttons) => {
    const raw = await (await fetch('./data/exercises-compact.json')).json();
    const strengthIds = new Set(raw.x.filter((row) => raw.bp[row[3]] !== 'cardio').map((row) => row[0]));
    return buttons.find((button) => strengthIds.has(button.getAttribute('data-add')))?.getAttribute('data-add');
  });
  expect(exerciseId).toBeTruthy();
  await page.locator('#grid [data-add="' + exerciseId + '"]').click();
  await page.goto('/index.html#tools');
  await page.locator('#warm-working').fill('100');
  await page.locator('#warm-bar').fill('20');
  await page.locator('#warm-step').fill('2.5');
  await page.locator('[data-lab-form="warmup"] button[type="submit"]').click();
  await page.locator('[data-add-warmup]').click();
  await expect(page.locator('#toast')).toHaveAttribute('data-open', 'true');
  await page.goto('/index.html#workout');
  const setLog = (await readIndexedUserState(page, 'mmg.workout.v2', []))[0]?.setLog || [];
  expect(setLog.length).toBeGreaterThan(1);
  expect(setLog[0]).toMatchObject({ type: 'warmup', weight: '40', reps: '8', completed: false });
  expect(setLog[setLog.length - 1].type).toBe('working');
});

test('Workout superset runs in alternating rounds and survives workout storage', async ({ page }) => {
  await page.goto('/index.html#library');
  await expect(page.locator('#mmg-boot')).toHaveCount(0);
  const exerciseIds = await page.locator('#grid [data-add]').evaluateAll(async (buttons) => {
    const raw = await (await fetch('./data/exercises-compact.json')).json();
    const strengthIds = new Set(raw.x.filter((row) => raw.bp[row[3]] !== 'cardio').map((row) => row[0]));
    return buttons.filter((button) => strengthIds.has(button.getAttribute('data-add'))).slice(0, 2).map((button) => button.getAttribute('data-add'));
  });
  expect(exerciseIds).toHaveLength(2);
  const exerciseNames = [];
  for (const id of exerciseIds) {
    const card = page.locator('#grid [data-add="' + id + '"]').locator('xpath=ancestor::article[contains(@class,"card")]');
    exerciseNames.push(await card.locator('.card-title').innerText());
    await page.locator('#grid [data-add="' + id + '"]').click();
  }
  await page.goto('/index.html#workout');
  for (const workoutItem of await page.locator('.workout-item').all()) {
    await workoutItem.locator('[data-field="sets"]').fill('1');
    await workoutItem.locator('[data-field="sets"]').press('Tab');
  }
  const firstItem = page.locator('.workout-item').first();
  await firstItem.locator('.workout-group-menu summary').click();
  await firstItem.locator('[data-group-create="superset"]').click();
  const savedWorkout = await readIndexedUserState(page, 'mmg.workout.v2', []);
  expect(savedWorkout[0].groupType).toBe('superset');
  expect(savedWorkout[1].groupId).toBe(savedWorkout[0].groupId);
  await page.locator('[data-v8-start-run]:visible, #w-run:visible').first().click();
  await expect(page.locator('.run-name')).toHaveText(exerciseNames[0]);
  await page.locator('#run-next').click();
  await expect(page.locator('.run-name')).toHaveText(exerciseNames[1]);
  const afterFirstSet = await readIndexedUserState(page, 'mmg.workout.v2', []);
  expect(afterFirstSet[0].setLog[0].completed).toBe(true);
  expect(afterFirstSet[1].setLog[0].completed).toBe(false);
  await page.locator('#run-next').click();
  await expect(page.locator('.run-finish-summary')).toBeVisible();
  await page.locator('#run-next').click();
  await page.locator('[data-hist-detail]').first().click();
  await expect(page.locator('.hist-detail [data-group-id]')).toHaveCount(2);
  await page.locator('[data-hist-repeat]').first().click();
  const repeatedWorkout = await readIndexedUserState(page, 'mmg.workout.v2', []);
  expect(repeatedWorkout[0].groupType).toBe('superset');
  expect(repeatedWorkout[1].groupId).toBe(repeatedWorkout[0].groupId);
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
  await page.addInitScript(() => {
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
  await page.goto('/index.html#home');
  await expect(page.locator('#mmg-boot')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('#v10-home-pulse')).toBeVisible();
  await expect(page.locator('#v10-home-pulse')).toContainText(/0\s*\/\s*2/);
  await expect(page.locator('#v7-home-next')).toContainText('Начать следующий день программы');
  await page.goto('/index.html#program');
  await expect(page.locator('html')).toHaveAttribute('data-route-ready', 'program');
  await expect(page.locator('#plan-out')).toHaveAttribute('data-filled', 'true');
  await expect(page.locator('#plan-out .v10-plan-day')).toHaveCount(2);
  await expect(page.locator('#plan-out [data-mesocycle-status="active"]')).toContainText('Неделя блока 1 из 4');
  const programMigration = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const saved = await new Promise((resolve, reject) => {
      const request = db.transaction('programs', 'readonly').objectStore('programs').get('active');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const legacy = await new Promise((resolve, reject) => {
      const request = db.transaction('userState', 'readonly').objectStore('userState').get('mmg.plan.v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { schemaVersion: saved?.schemaVersion, savedWeeks: saved?.plan?.ctx?.blockWeeks, hasLegacy: !!legacy };
  });
  expect(programMigration).toMatchObject({ schemaVersion: 1, savedWeeks: 4, hasLegacy: false });

  // Recreate a v6 UserState-only programme to verify the versioned migration path.
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['programs', 'userState'], 'readwrite');
      const programs = tx.objectStore('programs');
      const userState = tx.objectStore('userState');
      const read = programs.get('active');
      read.onsuccess = () => {
        userState.put({ key: 'mmg.plan.v1', value: JSON.stringify(read.result.plan) });
        programs.delete('active');
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator('#plan-out')).toHaveAttribute('data-filled', 'true');
  const movedLegacyProgramme = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await Promise.all(['programs', 'userState'].map(name => new Promise((resolve, reject) => {
      const store = db.transaction(name, 'readonly').objectStore(name);
      const request = name === 'programs' ? store.get('active') : store.get('mmg.plan.v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    })));
    db.close();
    return { weeks: result[0]?.plan?.ctx?.blockWeeks, legacyRemoved: !result[1] };
  });
  expect(movedLegacyProgramme).toEqual({ weeks: 4, legacyRemoved: true });

  await page.locator('#plan-wizard [data-wizard-step="5"]').click();
  await page.locator('#p-block-weeks').selectOption('6');
  await page.locator('#plan-build').click();
  await expect(page.locator('#plan-out [data-mesocycle-status="active"]')).toContainText('Неделя блока 1 из 6');
  await page.locator('#plan-review-performance').selectOption('improving');
  await page.locator('#plan-review-fatigue').selectOption('low');
  await page.locator('#plan-week-review-form button[type="submit"]').click();
  await expect(page.locator('#plan-week-review-form')).toBeVisible();
  await page.reload();
  await page.goto('/index.html#program');
  await expect(page.locator('#plan-out [data-mesocycle-status="active"]')).toContainText('Неделя блока 1 из 6');
  await expect(page.locator('#plan-review-performance')).toHaveValue('improving');
  await expect(page.locator('#plan-review-fatigue')).toHaveValue('low');
  await expect(page.locator('#plan-out')).toContainText('Продолжай текущий план');
  const savedReviewCount = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise((resolve, reject) => {
      const request = db.transaction('programs').objectStore('programs').get('active');
      request.onsuccess = () => resolve(request.result.plan.ctx.weeklyReviews.length);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  });
  expect(savedReviewCount).toBe(1);
  const oldBlockStart = await page.evaluate(() => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7) - 28);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  });
  await page.evaluate(async (startWeek) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('markov-made-gym');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('programs', 'readwrite');
      const state = tx.objectStore('programs');
      const get = state.get('active');
      get.onsuccess = () => {
        const record = get.result;
        const plan = record.plan;
        plan.ctx.blockWeeks = 4;
        plan.ctx.blockStartWeek = startWeek;
        state.put({ ...record, plan });
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, oldBlockStart);
  await page.reload();
  await page.goto('/index.html#home');
  await expect(page.locator('#v7-home-next')).toContainText('Сверить блок и задать следующий');
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
  await page.locator('#v7-diagnostics summary').click();
  await expect(page.locator('#v7-diagnostics-output')).toContainText('Версия приложения');
  await expect(page.locator('#v7-diagnostics-output')).toContainText('Состояние хранилища');
  await expect(page.locator('#v7-diagnostics-output')).toContainText('LocalStorage');
  await expect(page.locator('#v7-diagnostics-output')).toContainText(/service worker/i);
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

test('command palette searches sections and opens the selected route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'The command palette launcher is a desktop header control.');
  await page.goto('/index.html#home');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.locator('#cmdk-open').click();
  await expect(page.locator('#cmdk')).toHaveAttribute('data-open', 'true');
  await page.locator('#cmdk-input').fill('Прогресс');
  const result = page.locator('#cmdk-results [role="option"]').filter({ hasText: 'Прогресс' }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/#progress$/);
  await expect(page.locator('html')).toHaveAttribute('data-route-ready', 'progress');
});
