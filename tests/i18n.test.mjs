import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTranslator, mergeEnglishCompatibility } from '../src/app/i18n.mjs';
import { CORE_TRANSLATIONS, LEGACY_ENGLISH } from '../src/app/catalog.mjs';

const repo = new URL('../', import.meta.url);
const appSource = readFileSync(new URL('app.js', repo), 'utf8');
const shellSource = readFileSync(new URL('app-body.html', repo), 'utf8');

test('core catalog is immutable bilingual runtime data with complete entries', () => {
  assert.equal(Object.isFrozen(CORE_TRANSLATIONS), true);
  assert.ok(Object.keys(CORE_TRANSLATIONS).length >= 400);
  for (const key of ['nutritionWeek.target', 'runFinishedBody', 'planReview.continue']) {
    assert.ok(Object.hasOwn(CORE_TRANSLATIONS, key), `${key} must be in the core catalog`);
  }
  for (const [key, entry] of Object.entries(CORE_TRANSLATIONS)) {
    assert.equal(Object.isFrozen(entry), true, `${key} must not be mutated at runtime`);
    assert.equal(typeof entry.ru, 'string', `${key} is missing Russian copy`);
    assert.equal(typeof entry.en, 'string', `${key} is missing English copy`);
    assert.ok(entry.ru.trim(), `${key} has empty Russian copy`);
    assert.ok(entry.en.trim(), `${key} has empty English copy`);
  }
});

test('literal runtime translation calls have a complete Russian and English source', () => {
  const staticDomKeys = new Set();
  for (const match of shellSource.matchAll(/data-i18n(?:-ph|-aria|-alt)?\s*=\s*['\"]([^'\"]+)['\"]/g)) {
    staticDomKeys.add(match[1]);
  }
  const calls = new Set([...appSource.matchAll(/\bt\(\s*['\"]([^'\"]+)['\"]/g)].map(match => match[1]));
  const missing = [...calls].filter(key => {
    if (key.endsWith('.')) return false;
    if (Object.hasOwn(CORE_TRANSLATIONS, key)) return false;
    if (Object.hasOwn(LEGACY_ENGLISH, key)) {
      return !staticDomKeys.has(key)
        && !staticDomKeys.has(`ph:${key}`)
        && !staticDomKeys.has(`aria:${key}`)
        && !staticDomKeys.has(`alt:${key}`);
    }
    return !staticDomKeys.has(key);
  }).sort();
  assert.deepEqual(missing, [], `add bilingual catalog entries for runtime-only calls: ${missing.join(', ')}`);
});

test('legacy English copy merges into the same catalog using captured DOM labels', () => {
  assert.equal(Object.isFrozen(LEGACY_ENGLISH), true);
  assert.ok(Object.keys(LEGACY_ENGLISH).length >= 500);
  for (const [key, english] of Object.entries(LEGACY_ENGLISH)) {
    assert.equal(typeof english, 'string', `${key} must have English copy`);
    assert.ok(english.trim(), `${key} must not be empty`);
  }

  const catalog = { core: { ru: 'Основа', en: 'Core' } };
  mergeEnglishCompatibility(catalog, { core: 'Old core', title: 'Title', search: 'Search', close: 'Close', hero: 'Hero', missing: 'Missing' }, {
    title: 'Заголовок',
    'ph:search': 'Поиск',
    'aria:close': 'Закрыть',
    'alt:hero': 'Иллюстрация',
  });
  assert.deepEqual(catalog, {
    core: { ru: 'Основа', en: 'Core' },
    title: { ru: 'Заголовок', en: 'Title' },
    search: { ru: 'Поиск', en: 'Search' },
    close: { ru: 'Закрыть', en: 'Close' },
    hero: { ru: 'Иллюстрация', en: 'Hero' },
    missing: { ru: 'missing', en: 'Missing' },
  });
});

test('runtime translator follows locale changes and safely falls back to Russian', () => {
  let locale = 'ru';
  const t = createTranslator({ greeting: { ru: 'Привет, {name}', en: 'Hello, {name}' }, ruOnly: { ru: 'Только по-русски' } }, () => locale);
  assert.equal(t('greeting', { name: 'Анна' }), 'Привет, Анна');
  locale = 'en';
  assert.equal(t('greeting', { name: 'Alex' }), 'Hello, Alex');
  assert.equal(t('ruOnly'), 'Только по-русски');
  assert.equal(t('missing'), 'missing');
});

test('translator leaves unknown placeholders intact and stringifies values', () => {
  const t = createTranslator({ status: { en: '{count} sets · {unknown}' } }, () => 'en-US');
  assert.equal(t('status', { count: 3 }), '3 sets · {unknown}');
});

test('translator sees legacy strings registered after startup through the same catalog', () => {
  const catalog = {};
  const t = createTranslator(catalog, () => 'en');
  catalog['home.title'] = { ru: 'Домой', en: 'Home' };
  assert.equal(t('home.title'), 'Home');
});
