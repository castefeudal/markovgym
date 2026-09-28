import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanHistory, HISTORY_SCHEMA_VERSION, newestFirst } from '../src/persistence/history-repository.mjs';

test('history schema is explicitly versioned', () => {
  assert.equal(HISTORY_SCHEMA_VERSION, 1);
});

test('history migration drops malformed rows, assigns stable ids, and preserves records', () => {
  const source = [
    { date: '2026-09-01', items: [{ id: '0001', setLog: [{ reps: 8 }] }] },
    null,
    { date: '2026-09-02', items: 'invalid' },
  ];
  const migrated = cleanHistory(source);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].id, 'legacy-2026-09-01-0');
  assert.deepEqual(migrated[0].items[0].setLog, [{ reps: 8 }]);
  assert.equal(source[0].id, undefined);
});

test('history ordering is deterministic and newest first', () => {
  const records = [
    { id: 'w2', date: '2026-09-27' },
    { id: 'w4', date: '2026-09-28' },
    { id: 'w3', date: '2026-09-28' },
  ];
  assert.deepEqual(newestFirst(records).map((record) => record.id), ['w4', 'w3', 'w2']);
});

test('duplicate imported history ids remain distinct records', () => {
  const migrated = cleanHistory([
    { id: 'same', date: '2026-09-01', items: [] },
    { id: 'same', date: '2026-09-02', items: [] },
  ]);
  assert.deepEqual(migrated.map((record) => record.id), ['same', 'same-2']);
});
