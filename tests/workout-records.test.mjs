import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSetRecord, ensureSetLog, normalizeWorkoutRecord } from '../src/features/workout/workout-records.mjs';

test('set records normalize supported roles and bounded text fields', () => {
  const record = cleanSetRecord({
    type: 'unsupported', reps: '1'.repeat(40), weight: 90, restSec: -5, note: 'n'.repeat(600),
    completed: 1, completedAt: -1,
  });
  assert.equal(record.type, 'working');
  assert.equal(record.reps.length, 24);
  assert.equal(record.weight, '90');
  assert.equal(record.restSec, 0);
  assert.equal(record.note.length, 500);
  assert.equal(record.completed, true);
  assert.equal(record.completedAt, 0);
});

test('set log fills legacy completed workouts and clamps set count', () => {
  const workout = { sets: 50, reps: '8–10', weight: '75', done: true };
  const log = ensureSetLog(workout);
  assert.equal(log.length, 20);
  assert.ok(log.every((set) => set.completed && set.reps === '8–10' && set.weight === '75'));
  assert.equal(workout.done, true);
});

test('workout records keep valid groups and safely drop invalid grouping metadata', () => {
  const valid = normalizeWorkoutRecord({ id: 'ex', sets: 2, groupId: 'pair-1', groupType: 'superset', setLog: [{ type: 'warmup' }] });
  assert.equal(valid.groupType, 'superset');
  assert.equal(valid.groupId, 'pair-1');
  assert.equal(valid.setLog.length, 2);
  assert.equal(valid.setLog[0].type, 'warmup');

  const invalid = normalizeWorkoutRecord({ id: 'ex', sets: -4, groupId: 'pair-1', groupType: 'unknown' });
  assert.equal(invalid.sets, 1);
  assert.equal(invalid.groupId, '');
  assert.equal(invalid.groupType, '');
});
