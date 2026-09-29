import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSetPersonalRecords, detectVolumePersonalRecords } from '../src/features/workout/pr-engine.mjs';

const history = [{ items: [{ id: 'squat', setLog: [
  { completed: true, type: 'warmup', weight: 200, reps: 10 },
  { completed: true, type: 'working', weight: 100, reps: 5 },
] }] }];

test('set PRs compare only against completed non-warm-up performance', () => {
  assert.deepEqual(detectSetPersonalRecords({ exerciseId: 'squat', set: { completed: true, type: 'working', weight: 105, reps: 5 }, history }), [
    { type: 'load', value: 105 }, { type: 'e1rm', value: 120.31 },
  ]);
  assert.deepEqual(detectSetPersonalRecords({ exerciseId: 'squat', set: { completed: true, type: 'warmup', weight: 250, reps: 10 }, history }), []);
  assert.deepEqual(detectSetPersonalRecords({ exerciseId: 'squat', set: { completed: false, weight: 250, reps: 10 }, history }), []);
});

test('rep and duration records use their own tracking type; assisted load is not mis-ranked', () => {
  assert.deepEqual(detectSetPersonalRecords({ exerciseId: 'row', trackingType: 'reps-only', set: { completed: true, reps: 12 }, history: [{ items: [{ id: 'row', setLog: [{ completed: true, reps: 10 }] }] }] }), [{ type: 'reps', value: 12 }]);
  assert.deepEqual(detectSetPersonalRecords({ exerciseId: 'run', trackingType: 'duration', set: { completed: true, duration: 62 }, history: [{ items: [{ id: 'run', setLog: [{ completed: true, duration: 60 }] }] }] }), [{ type: 'duration', value: 62 }]);
  assert.deepEqual(detectSetPersonalRecords({ exerciseId: 'pullup', trackingType: 'assisted-weight', set: { completed: true, weight: 10, reps: 10 }, history }), []);
  assert.deepEqual(detectSetPersonalRecords({ exerciseId: 'weighted-pullup', trackingType: 'bodyweight-added-weight', set: { completed: true, weight: 15, reps: 6 }, history: [{ items: [{ id: 'weighted-pullup', setLog: [{ completed: true, weight: 10, reps: 6 }] }] }] }), [{ type: 'added-load', value: 15 }]);
});

test('volume PRs compare completed exercise and session totals and ignore warm-ups', () => {
  const old = [{ id: 'squat', setLog: [{ completed: true, type: 'working', weight: 100, reps: 5 }] }];
  const current = [{ id: 'squat', setLog: [
    { completed: true, type: 'warmup', weight: 200, reps: 10 },
    { completed: true, type: 'working', weight: 100, reps: 6 },
  ] }];
  assert.deepEqual(detectVolumePersonalRecords({ exerciseId: 'squat', currentItems: current, history: [{ items: old }], exerciseComplete: true, sessionComplete: true }), [
    { type: 'exercise-volume', value: 600 }, { type: 'session-volume', value: 600 },
  ]);
  assert.deepEqual(detectVolumePersonalRecords({ exerciseId: 'squat', currentItems: current, history: [], exerciseComplete: true, sessionComplete: true }), []);
  const assisted = [{ id: 'pullup', trackingType: 'assisted-weight', setLog: [{ completed: true, weight: 40, reps: 8 }] }];
  assert.deepEqual(detectVolumePersonalRecords({ exerciseId: 'pullup', currentItems: assisted, history: [{ items: [{ ...assisted[0], setLog: [{ completed: true, weight: 50, reps: 8 }] }] }], exerciseComplete: true, sessionComplete: true }), []);
});
