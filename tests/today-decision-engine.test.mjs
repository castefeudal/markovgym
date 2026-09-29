import test from 'node:test';
import assert from 'node:assert/strict';
import { nextWorkoutAction } from '../src/features/today/decision-engine.mjs';

test('Today decision gives an active run priority over every later action', () => {
  const decision = nextWorkoutAction({
    activeRun: true,
    pendingWorkout: true,
    completedWorkout: true,
    hasWorkout: true,
    hasNutritionTarget: true,
    hasProgram: true,
    diaryEntries: 20,
  });
  assert.equal(decision.recommendation, 'resume_run');
  assert.deepEqual(decision.reasons, ['active_run']);
  assert.equal(decision.confidence, 'high');
  assert.equal(decision.nextAction, 'resume_run');
});

test('Today decision selects the highest priority incomplete action', () => {
  assert.equal(nextWorkoutAction({ pendingWorkout: true, hasWorkout: true }).recommendation, 'start_workout');
  assert.equal(nextWorkoutAction({ completedWorkout: true, hasWorkout: true }).recommendation, 'save_workout');
  assert.equal(nextWorkoutAction({}).recommendation, 'find_exercise');
  assert.equal(nextWorkoutAction({ hasFavorites: true }).recommendation, 'build_workout');
});

test('Today decision explains missing data before asking for a progress review', () => {
  const base = { hasWorkout: true, hasNutritionTarget: true, hasProgram: true, diaryEntries: 4, hasNutritionLogToday: true };
  assert.deepEqual(nextWorkoutAction(base), {
    recommendation: 'review_progress',
    reasons: ['current_records_available'],
    confidence: 'medium',
    missingData: [],
    nextAction: 'review_progress',
  });
  assert.equal(nextWorkoutAction({ ...base, hasNutritionTarget: false }).recommendation, 'set_nutrition');
  assert.equal(nextWorkoutAction({ ...base, hasProgram: false }).recommendation, 'build_program');
  assert.equal(nextWorkoutAction({ ...base, diaryEntries: 1 }).recommendation, 'record_measurements');
  assert.equal(nextWorkoutAction({ ...base, checkinAgeDays: 9 }).recommendation, 'refresh_measurements');
  assert.equal(nextWorkoutAction({ ...base, hasNutritionLogToday: false }).recommendation, 'log_nutrition');
});
