import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferenceWriter } from '../src/features/exercise/preference-write-queue.mjs';

test('an import cannot be overwritten by an older delayed preference write', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let records;
  let count = 0;
  const write = createPreferenceWriter(() => ({ async replaceExercisePreferences(value) {
    if (++count === 1) await blocked;
    records = value;
  } }));
  const previous = write({});
  const imported = { '0029': 'discomfort' };
  const restored = write(imported);
  imported['0029'] = 'avoid';
  release();
  await Promise.all([previous, restored]);
  assert.deepEqual(records, { '0029': 'discomfort' });
  await write({});
  assert.deepEqual(records, {});
});

test('a failed write does not block a later rollback or import', async () => {
  let records;
  let failed = false;
  const write = createPreferenceWriter(() => ({ async replaceExercisePreferences(value) {
    if (!failed) { failed = true; throw new Error('storage failure'); }
    records = value;
  } }));
  await assert.rejects(write({ '0029': 'avoid' }), /storage failure/);
  await write({ '0029': 'prefer' });
  assert.deepEqual(records, { '0029': 'prefer' });
});
