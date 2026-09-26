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
  assert.match(app, /MEDIA_REVISION = '20260927-media1'/);
  assert.match(app, /\.gif\?v=' \+ MEDIA_REVISION/);
  assert.match(sw, /2026\.09-r3-media1/);
  assert.match(sw, /Cache Storage is an optimisation only/);
  assert.match(sw, /ignoreSearch: true/);
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
  for (const resource of ['index.html', 'app.css', 'app.js', 'data/content.json', 'data/exercises-compact.json']) assert.match(sw, new RegExp(resource.replace('.', '\\.')));
  assert.doesNotMatch(sw, /legacy-base\.html|r2\.payload/);
});

test('backward-compatible local storage keys remain in application code', async () => {
  const app = await read('app.js');
  for (const key of ['mmg.favorites.v8', 'mmg.workout.v2', 'mmg.history.v1', 'mmg.lang.v2', 'mmg.theme.v2']) assert.match(app, new RegExp(key.replaceAll('.', '\\.')));
});
