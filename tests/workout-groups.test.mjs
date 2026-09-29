import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkoutGroup, workoutExecutionOrder } from '../tools/workout-groups.mjs';

test('workout execution interleaves superset sets by round', () => {
  const group = { groupId: 'pair-1', groupType: 'superset' };
  assert.deepEqual(workoutExecutionOrder([
    { ...group, sets: 2 },
    { ...group, sets: 2 },
  ]), [
    { ex: 0, set: 1 }, { ex: 1, set: 1 },
    { ex: 0, set: 2 }, { ex: 1, set: 2 },
  ]);
});

test('tri-sets and circuits keep their members together and respect unequal set counts', () => {
  assert.deepEqual(workoutExecutionOrder([
    { groupId: 'g', groupType: 'tri-set', sets: 1 },
    { groupId: 'g', groupType: 'tri-set', sets: 2 },
    { groupId: 'g', groupType: 'tri-set', sets: 2 },
    { sets: 2 },
  ]), [
    { ex: 0, set: 1 }, { ex: 1, set: 1 }, { ex: 2, set: 1 },
    { ex: 1, set: 2 }, { ex: 2, set: 2 },
    { ex: 3, set: 1 }, { ex: 3, set: 2 },
  ]);
});

test('invalid grouping metadata safely falls back to ordinary exercise order', () => {
  assert.deepEqual(normalizeWorkoutGroup('g', 'giant-set'), { groupId: '', groupType: '' });
  assert.deepEqual(workoutExecutionOrder([{ groupId: 'g', groupType: 'broken', sets: 2 }]), [
    { ex: 0, set: 1 }, { ex: 0, set: 2 },
  ]);
});
