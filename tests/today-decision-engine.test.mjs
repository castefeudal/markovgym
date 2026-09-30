import test from 'node:test';
import assert from 'node:assert/strict';
import { nextWorkoutAction } from '../src/features/today/decision-engine.mjs';

test('Today decision preserves an active Run Mode before all other actions', () => {
  const decision = nextWorkoutAction({
    activeRun: true,
    pendingWorkout: true,
    completedWorkout: true,
    scheduledProgramDay: 2,
    programmeWeekComplete: true,
  });
  assert.equal(decision.recommendation, 'resume_run');
  assert.deepEqual(decision.reasons, ['active_run']);
  assert.equal(decision.confidence, 'high');
  assert.equal(decision.nextAction, 'resume_run');
});

test('Today prioritizes saving a completed session, then starting a prepared workout', () => {
  assert.equal(nextWorkoutAction({ completedWorkout: true, pendingWorkout: true }).recommendation, 'save_workout');
  assert.equal(nextWorkoutAction({ pendingWorkout: true, scheduledProgramDay: 1 }).recommendation, 'start_workout');
});

test('a scheduled programme day precedes check-ins and other routine actions', () => {
  const decision = nextWorkoutAction({ scheduledProgramDay: 3, hasTrainingHistory: true, checkinAgeDays: 12, hasNutritionLogToday: false });
  assert.equal(decision.recommendation, 'start_program_day');
  assert.equal(decision.day, 3);
  assert.deepEqual(decision.missingData, []);
});

test('Today asks for an overdue weigh-in before nutrition and weekly review', () => {
  const decision = nextWorkoutAction({
    hasTrainingHistory: true,
    checkinAgeDays: 8,
    hasNutritionLogToday: false,
    programmeWeekComplete: true,
  });
  assert.equal(decision.recommendation, 'record_measurements');
  assert.deepEqual(decision.missingData, ['measurements']);
});

test('Today requests nutrition before a completed-week review', () => {
  assert.equal(nextWorkoutAction({ hasNutritionLogToday: false, programmeWeekComplete: true }).recommendation, 'log_nutrition');
  assert.equal(nextWorkoutAction({ hasNutritionLogToday: true, programmeWeekComplete: true }).recommendation, 'review_week');
});

test('Today asks to finish the profile, build a programme, and then begin training', () => {
  assert.equal(nextWorkoutAction({ profileIncomplete: true }).recommendation, 'finish_profile');
  assert.equal(nextWorkoutAction({ hasNutritionLogToday: true, hasProgram: false }).recommendation, 'build_program');
  assert.equal(nextWorkoutAction({ hasProgram: true, hasTrainingHistory: false, hasNutritionLogToday: true }).recommendation, 'find_exercise');
});

test('Today shows progress review when training and daily records are current', () => {
  const decision = nextWorkoutAction({
    hasProgram: true,
    hasTrainingHistory: true,
    checkinAgeDays: 2,
    hasNutritionLogToday: true,
  });
  assert.deepEqual(decision, {
    recommendation: 'review_progress',
    reasons: ['current_records_available'],
    confidence: 'medium',
    missingData: [],
    nextAction: 'review_progress',
  });
});

test('programme block review remains ahead of the next programme session', () => {
  assert.equal(nextWorkoutAction({ programmeBlockComplete: true, scheduledProgramDay: 0 }).recommendation, 'review_program_block');
});
