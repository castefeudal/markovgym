import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../src/app/i18n.mjs';

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
