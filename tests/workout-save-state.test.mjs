import test from 'node:test';
import assert from 'node:assert/strict';
import { workoutAlreadySaved } from '../src/features/workout/save-state.mjs';
const workout = [{ id: '0025', setLog: [{ completed: true, completedAt: 100, weight: '60', reps: '10', type: 'working' }] }];
test('a saved session is recognized without inventing a new storage schema', () => {
  assert.equal(workoutAlreadySaved(workout, [{ items: structuredClone(workout) }]), true);
});
test('new completion, edited result, incomplete set and reordered exercises need a save', () => {
  for (const change of [{ completedAt: 101 }, { weight: '62.5' }, { completed: false }, { note: 'Changed' }]) {
    const changed = structuredClone(workout); Object.assign(changed[0].setLog[0], change);
    assert.equal(workoutAlreadySaved(changed, [{ items: workout }]), false);
  }
  assert.equal(workoutAlreadySaved([{ id: 'other', setLog: workout[0].setLog }], [{ items: workout }]), false);
  assert.equal(workoutAlreadySaved([], []), false);
});
