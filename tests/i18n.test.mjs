import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../src/app/i18n.mjs';
import { CORE_TRANSLATIONS } from '../src/app/catalog.mjs';

test('core catalog is immutable bilingual runtime data with complete entries', () => {
  assert.equal(Object.isFrozen(CORE_TRANSLATIONS), true);
  assert.ok(Object.keys(CORE_TRANSLATIONS).length >= 100);
  for (const [key, entry] of Object.entries(CORE_TRANSLATIONS)) {
    assert.equal(Object.isFrozen(entry), true, `${key} must not be mutated at runtime`);
    assert.equal(typeof entry.ru, 'string', `${key} is missing Russian copy`);
    assert.equal(typeof entry.en, 'string', `${key} is missing English copy`);
    assert.ok(entry.ru.trim(), `${key} has empty Russian copy`);
    assert.ok(entry.en.trim(), `${key} has empty English copy`);
  }
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
