import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalFirstStore } from '../src/persistence/local-first-store.mjs';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

test('local-first store reads through, caches writes and removes from both layers', () => {
  const storage = memoryStorage({ theme: 'dark' });
  const writes = [];
  const store = createLocalFirstStore({ storage, enqueueIndexedDBWrite: (...args) => writes.push(args) });
  assert.equal(store.get('theme'), 'dark');
  assert.equal(store.set('theme', 'light'), true);
  assert.equal(store.get('theme'), 'light');
  assert.equal(storage.getItem('theme'), 'light');
  store.remove('theme');
  assert.equal(store.get('theme'), null);
  assert.equal(storage.getItem('theme'), null);
  assert.deepEqual(writes, [['theme', 'light', false], ['theme', '', true]]);
});

test('IndexedDB-owned values avoid the LocalStorage mirror', () => {
  const storage = memoryStorage();
  const writes = [];
  const store = createLocalFirstStore({
    storage,
    isIndexedDBOwned: (key) => key === 'history',
    enqueueIndexedDBWrite: (...args) => writes.push(args),
  });
  store.set('history', '[1,2]');
  assert.equal(storage.getItem('history'), null);
  assert.equal(store.get('history'), '[1,2]');
  assert.deepEqual(writes, [['history', '[1,2]', false]]);
});

test('invalid JSON is quarantined and the active key is removed', () => {
  const storage = memoryStorage({ profile: '{broken' });
  const warnings = [];
  let clock = 123;
  const store = createLocalFirstStore({ storage, onWarning: (warning) => warnings.push(warning), now: () => clock++ });
  assert.deepEqual(store.json('profile', {}), {});
  assert.equal(storage.getItem('profile'), null);
  assert.equal(storage.getItem('mmg.recovery.profile.123'), '{broken');
  assert.deepEqual(warnings, [{ key: 'profile', type: 'json', recoveryKey: 'mmg.recovery.profile.123', at: 124 }]);
});

test('memory-only mode keeps values for the current app lifetime', () => {
  const store = createLocalFirstStore();
  assert.equal(store.set('lang', 'en'), true);
  assert.equal(store.get('lang'), 'en');
  store.remove('lang');
  assert.equal(store.get('lang'), null);
});
