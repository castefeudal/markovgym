import test from 'node:test';
import assert from 'node:assert/strict';
import { progressionTrackingType } from '../src/features/workout/progression-adapter.mjs';

test('progression tracking follows explicit custom semantics before built-in defaults', () => {
  assert.equal(progressionTrackingType({ custom: true, trackingType: 'distance-duration', zone: 'strength' }), 'distance-duration');
  assert.equal(progressionTrackingType({ trackingType: 'unknown', zone: 'cardio', equip: 'body weight' }), 'duration');
});

test('bodyweight and assisted built-in exercises cannot trigger load increases', () => {
  assert.equal(progressionTrackingType({ zone: 'strength', equip: 'body weight' }), 'reps-only');
  assert.equal(progressionTrackingType({ zone: 'strength', equip: 'assisted' }), 'assisted-weight');
  assert.equal(progressionTrackingType({ zone: 'strength', equip: 'barbell' }), 'weight-reps');
  assert.equal(progressionTrackingType({ zone: 'strength', equip: 'resistance band' }), 'reps-only');
  assert.equal(progressionTrackingType({ zone: 'strength', equip: 'stability ball' }), 'reps-only');
  assert.equal(progressionTrackingType(null), 'reps-only');
});
