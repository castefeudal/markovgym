import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('canonical shell does not use payload bootstrap or document.write', async () => {
  const index = await read('index.html');
  assert.doesNotMatch(index, /document\.write|r2\.payload\.b64/);
  assert.match(index, /app\.css/);
  assert.match(index, /app\.js/);
  assert.match(index, /gym-tools\.js/);
  assert.match(index, /lab\.css/);
});

test('bootstrap subscribes before the app can emit ready', async () => {
  const index = await read('index.html');
  const bootstrap = index.indexOf('src="./bootstrap.js"');
  const app = index.indexOf('src="./app.js');
  assert.ok(bootstrap >= 0 && app >= 0, 'bootstrap.js and app.js must be present');
  assert.ok(bootstrap < app, 'bootstrap.js must load before app.js so mmg:ready cannot be missed');
});

test('exercise GIF media uses a fresh revision and cache write failures stay non-fatal', async () => {
  const app = await read('app.js');
  const sw = await read('sw.js');
  assert.match(app, /MEDIA_REVISION = '20260927-media4'/);
  assert.match(app, /\.gif\?v=' \+ MEDIA_REVISION/);
  assert.match(sw, /const VERSION = '2026\.09-r\d+-[a-z-]+'/);
  assert.match(sw, /Cache Storage is an optimisation only/);
  assert.match(sw, /ignoreSearch: true/);
});

test('active exercise views always request GIF animation and service worker leaves videos alone', async () => {
  const app = await read('app.js');
  const sw = await read('sw.js');
  assert.match(app, /img\.src = exMotion\(ex\);/);
  assert.doesNotMatch(app, /img\.src = REDUCED_MOTION\.matches \? exStill\(ex\) : exMotion\(ex\)/);
  assert.match(sw, /if \(\/\\\/videos\\\/\//);
  assert.match(sw, /Exercise GIFs are intentionally not intercepted/);
});

test('GIF previews are not gated by fine-pointer detection', async () => {
  const app = await read('app.js');
  assert.doesNotMatch(app, /if \(FINE_POINTER\.matches\) \{\s*\$\('grid'\)\.addEventListener\('pointerover'/);
  assert.match(app, /GIF-превью работают на мыши, стилусе и гибридных\/сенсорных устройствах/);
});

test('PWA update lifecycle is controlled and shell assets are network-first', async () => {
  const index = await read('index.html');
  const sw = await read('sw.js');
  const bootstrap = await read('bootstrap.js');
  assert.doesNotMatch(index, /_mmgsw|registration\.unregister\(\)/);
  assert.doesNotMatch(sw, /cache\.addAll\(PRECACHE\)\)\.then\(\(\) => self\.skipWaiting\(\)\)/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(bootstrap, /mmg-update/);
  assert.match(bootstrap, /controllerchange/);
  assert.match(sw, /fetch\(request, \{ cache: 'no-store' \}\)/);
});

test('exercise detail view keeps full-frame media and structured guidance', async () => {
  const index = await read('index.html');
  const body = await read('app-body.html');
  const app = await read('app.js');
  const css = await read('app.css');
  for (const html of [index, body]) {
    assert.match(html, /id="modal-media-expand"/);
    assert.match(html, /id="modal-tabs"/);
    assert.match(html, /id="modal-cues"/);
    assert.match(html, /id="modal-errors"/);
    assert.match(html, /class="modal-visual"/);
  }
  assert.match(app, /function exerciseTechniqueModel\(ex\)/);
  assert.match(app, /C && C\.card && C\.card\.enhanced/);
  assert.match(app, /function defaultBreathingCue\(ex\)/);
  assert.match(app, /function toggleModalMedia\(\)/);
  assert.match(app, /class="run-tech-cues"/);
  assert.match(css, /#modal \.modal-media img\{[\s\S]*?object-fit:contain/);
  assert.match(css, /#run \.run-media-frame \.run-media\{[\s\S]*?object-fit:contain/);
  assert.match(css, /\.card-media img\{[\s\S]*?object-fit:contain/);
});

test('detail assets use a cache-busting revision', async () => {
  const index = await read('index.html');
  assert.match(index, /app\.css\?v=2026\.09-r\d+-[a-z-]+/);
  assert.match(index, /app\.js\?v=2026\.09-r\d+-[a-z-]+/);
});

test('detail media box itself stays inside the visual frame and step counter increments once', async () => {
  const css = await read('app.css');
  assert.match(css, /#modal \.modal-media img\{[\s\S]*?position:absolute;[\s\S]*?inset:18px;[\s\S]*?width:calc\(100% - 36px\);[\s\S]*?height:calc\(100% - 36px\)/);
  const detail = css.slice(css.lastIndexOf('/* 19. EXERCISE DETAIL V2'));
  const pseudo = detail.match(/#modal \.modal-steps-detailed li::before\{[\s\S]*?\}/)?.[0] || '';
  assert.doesNotMatch(pseudo, /counter-increment/);
});

test('canonical premium theme system defines complete tokens for all themes', async () => {
  const css = await read('app.css');
  const block = css.slice(css.lastIndexOf('/* 21. PREMIUM THEME SYSTEM'));
  assert.match(block, /html\[data-theme="obsidian"\]\{[\s\S]*?--v8-signal:#86b6ff/);
  assert.match(block, /html\[data-theme="soft"\]\{[\s\S]*?--v8-signal:#386aa9/);
  assert.match(block, /html\[data-theme="ivory"\]\{[\s\S]*?--v8-signal:#4f7197/);
  assert.match(block, /--premium-panel:/);
  assert.match(block, /--premium-control:/);
  assert.match(block, /--premium-media:/);
  for (const token of ['--bg-canvas:', '--bg-surface:', '--bg-elevated:', '--text-primary:', '--text-secondary:', '--text-muted:', '--border-subtle:', '--border-strong:', '--accent:', '--accent-hover:', '--accent-soft:', '--positive:', '--warning:', '--critical:']) {
    assert.match(block, new RegExp(token.replaceAll('-', '\\-')));
  }
  assert.match(block, /\.library-layout\{[\s\S]*?grid-template-columns:286px minmax\(0,1fr\)/);
  assert.match(block, /\.filter-btn\{[\s\S]*?grid-template-columns:10px minmax\(0,1fr\) 36px/);
  assert.match(block, /\.card-specs\{/);
  assert.match(block, /\.results-insights\{/);
});

test('saved theme is hydrated before stylesheet and runtime keeps theme metadata in sync', async () => {
  const index = await read('index.html');
  const app = await read('app.js');
  const hydrate = index.indexOf("localStorage.getItem('mmg.theme.v2')");
  const stylesheet = index.indexOf('app.css?v=');
  assert.ok(hydrate >= 0 && stylesheet > hydrate, 'saved theme must resolve before stylesheet paint');
  assert.match(app, /document\.documentElement\.style\.colorScheme = S\.theme === 'obsidian' \? 'dark' : 'light'/);
  assert.match(app, /obsidian: '#070A0E', soft: '#EAF0F6', ivory: '#F6F5F1'/);
});

test('library cards expose useful type and level context plus live selection insights', async () => {
  const body = await read('app-body.html');
  const index = await read('index.html');
  const app = await read('app.js');
  for (const html of [body, index]) assert.match(html, /id="results-insights"/);
  assert.match(app, /class="card-specs"/);
  assert.match(app, /function renderResultsInsights\(items\)/);
  assert.match(app, /labels\.compound/);
  assert.match(app, /labels\.equipment/);
});

test('exercise dataset keeps all 1324 compact records', async () => {
  const dataset = JSON.parse(await read('data/exercises-compact.json'));
  assert.equal(dataset.x.length, 1324);
});

test('PWA manifest is relative-origin and points to a valid shell', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './#home');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.length > 0);
});

test('service worker precaches the same shell resources as the index', async () => {
  const sw = await read('sw.js');
  const pages = await read('.github/workflows/pages.yml');
  for (const resource of ['index.html', 'app.css', 'styles/tokens.css', 'styles/reset.css', 'styles/base.css', 'styles/components.css', 'styles/layout.css', 'styles/features/legacy-product.css', 'styles/features/exercise.css', 'styles/features/program.css', 'styles/features/workout.css', 'styles/features/nutrition.css', 'app.js', 'tools/workout-groups.mjs', 'src/app/router.mjs', 'src/app/i18n.mjs', 'src/persistence/history-repository.mjs', 'src/features/today/decision-engine.mjs', 'src/features/exercise/substitution-engine.mjs', 'src/features/workout/pr-engine.mjs', 'src/features/nutrition/nutrition-analytics.mjs', 'src/features/progress/weight-trend.mjs', 'data/content.json', 'data/exercises-compact.json']) assert.match(sw, new RegExp(resource.replaceAll('.', '\\.')));
  assert.match(pages, /cp -R data images src styles tools videos site\//);
  assert.doesNotMatch(sw, /legacy-base\.html|r2\.payload/);
});

test('legacy production artifacts are classified and Pages ships only the active fallback', async () => {
  const pages = await read('.github/workflows/pages.yml');
  const inventory = await read('docs/legacy-inventory.md');
  assert.match(pages, /legacy-base\.html/);
  assert.doesNotMatch(pages, /setup\.html|r2\.payload\.b64/);
  assert.match(inventory, /Keep and retain the link/);
  assert.match(inventory, /Removed as an unconsumed and unreadable artifact/);
  assert.match(inventory, /mmg_current_workout_v1/);
});

test('stylesheet layers are separated and linked in their original cascade order', async () => {
  const index = await read('index.html');
  const build = await read('scripts/build-index.mjs');
  const base = await read('app.css');
  const layers = ['./styles/tokens.css?v=', './styles/reset.css?v=', './styles/base.css?v=', './styles/components.css?v=', './styles/layout.css?v=', './styles/features/legacy-product.css?v=', './app.css?v=', './styles/features/exercise.css?v='];
  const positions = layers.map((layer) => index.indexOf(layer));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.ok(index.indexOf('./styles/features/nutrition.css?v=') < index.indexOf('./lab.css?v='));
  assert.match(build, /styles\/features\/exercise\.css/);
  for (const layer of ['tokens', 'reset', 'base', 'components', 'layout']) assert.match(await read(`styles/${layer}.css`), /\S/);
  assert.match(await read('styles/features/legacy-product.css'), /\.cnote\s*\{/);
  assert.match(build, /2026\.09-r35-calculator-history/);
  assert.doesNotMatch(base, /\.custom-exercise-dialog\{|\.run-pr-notice\{|\.nutrition-log-panel\{/);
});

test('daily nutrition records use a dedicated validated store and survive backup import/export flows', async () => {
  const app = await read('app.js');
  const repository = await read('src/persistence/history-repository.mjs');
  assert.match(app, /K\.nutritionLog = 'mmg\.nutritionLog\.v1'/);
  assert.match(app, /name==='nutritionLog'[\s\S]*?cleanNutritionDays/);
  assert.match(app, /historyRepository\.replaceNutritionDays\(importedNutritionDays\)/);
  assert.match(app, /nutritionLog'\?JSON\.stringify\(databaseNutritionDays\)/);
  assert.match(repository, /createObjectStore\(NUTRITION_DAY_STORE, \{ keyPath: 'date' \}\)/);
  assert.match(repository, /migrateLegacyNutritionDays/);
});

test('backward-compatible local storage keys remain in application code', async () => {
  const app = await read('app.js');
  for (const key of ['mmg.favorites.v8', 'mmg.workout.v2', 'mmg.history.v1', 'mmg.lang.v2', 'mmg.theme.v2']) assert.match(app, new RegExp(key.replaceAll('.', '\\.')));
});


test('flagship 10 surface includes weekly pulse, contextual actions, workout balance and readability controls', async () => {
  const body = await read('app-body.html');
  const index = await read('index.html');
  const app = await read('app.js');
  const css = await read('app.css');
  for (const html of [body, index]) {
    assert.match(html, /id="v10-home-pulse"/);
    assert.match(html, /id="v10-context-actions"/);
    assert.match(html, /id="v10-workout-balance"/);
    assert.match(html, /id="v10-reading-actions"/);
  }
  assert.match(app, /function renderV10HomePulse\(\)/);
  assert.match(app, /function renderV10ContextAction\(route\)/);
  assert.match(app, /function renderV10WorkoutBalance\(\)/);
  assert.match(css, /\/\* 22\. FLAGSHIP 10\/10/);
  assert.match(css, /html\[data-reading="comfortable"\]/);
  assert.match(css, /html\[data-reading="large"\]/);
});

test('programme survives reloads and edits are written back to saved state', async () => {
  const app = await read('app.js');
  assert.match(app, /hasPersistedExerciseState = !!\(store\.get\(K\.fav\) \|\| store\.get\(K\.workout\) \|\| store\.get\(K\.plan\) \|\| store\.get\(K\.exercisePreferences\) \|\| databaseCustomExercises\.length\)/);
  assert.match(app, /function renderStoredPlanV10\(\)/);
  assert.match(app, /item\.ex=alt;\s*savePlanV7\(\);\s*renderStoredPlanV10\(\)/);
  assert.match(app, /day\.items\.splice\(itemIndex,1\);\s*savePlanV7\(\);/);
  assert.match(app, /'plan', 'settings', 'recentSearch', 'recentExercises'/);
});

test('progress view can switch between weight waist and sleep', async () => {
  const app = await read('app.js');
  assert.match(app, /var progressMetric = 'weight'/);
  assert.match(app, /function progressChartTabsV10\(\)/);
  assert.match(app, /\['weight', S\.lang/);
  assert.match(app, /\['waist', S\.lang/);
  assert.match(app, /\['sleep', S\.lang/);
  assert.match(app, /progressMetric = metric\.dataset\.progressMetric/);
});

test('first paint restores readability preference before flagship stylesheet', async () => {
  const index = await read('index.html');
  const hydration = index.indexOf("localStorage.getItem('mmg.settings.v1')");
  const stylesheet = index.indexOf('app.css?v=');
  assert.ok(hydration >= 0 && stylesheet > hydration, 'reading preference must hydrate before stylesheet paint');
  assert.match(index, /data-app-version="2026\.09-r\d+-[a-z-]+"/);
});


test('in-library quick scenarios reuse preset state and session balance flags duplication', async () => {
  const body = await read('app-body.html');
  const index = await read('index.html');
  const app = await read('app.js');
  const css = await read('app.css');

  for (const html of [body, index]) {
    assert.match(html, /id="v10-library-quick-presets"/);
    assert.match(html, /id="v10-library-quick-label"/);
  }

  assert.match(app, /function renderV10LibraryQuick\(\)/);
  assert.match(app, /sameStringSetV10/);
  assert.match(app, /duplicated=maxSame>=3/);
  assert.match(app, /noCompound=compound===0&&rows.length>=4/);

  const block = css.slice(css.lastIndexOf('/* 23. FLAGSHIP LIBRARY REFINEMENT'));
  assert.match(block, /\.v10-library-quick\{/);
  assert.match(block, /\.v10-library-quick-btn\[aria-pressed="true"\]/);
  assert.match(index, /app\.css\?v=2026\.09-r\d+-[a-z-]+/);
  assert.match(index, /app\.js\?v=2026\.09-r\d+-[a-z-]+/);
});
