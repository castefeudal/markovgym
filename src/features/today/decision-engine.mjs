function result(recommendation, reasons, confidence, missingData = []) {
  return Object.freeze({
    recommendation,
    reasons: Object.freeze(reasons),
    confidence,
    missingData: Object.freeze(missingData),
    nextAction: recommendation,
  });
}

/** Choose one next action from recorded state; this module has no DOM or copy dependencies. */
export function nextWorkoutAction(context = {}) {
  if (context.activeRun) return result('resume_run', ['active_run'], 'high');
  if (context.pendingWorkout) return result('start_workout', ['workout_ready'], 'high');
  if (context.completedWorkout) return result('save_workout', ['workout_complete'], 'high');
  if (!context.hasFavorites && !context.hasWorkout) {
    return result('find_exercise', ['no_exercises_selected'], 'medium', ['exercise_choice']);
  }
  if (!context.hasWorkout) {
    return result('build_workout', ['no_active_workout'], 'medium', ['workout']);
  }
  if (!context.hasNutritionTarget) {
    return result('set_nutrition', ['nutrition_target_missing'], 'low', ['nutrition_target']);
  }
  if (!context.hasProgram) {
    return result('build_program', ['program_missing'], 'medium', ['program']);
  }
  if (Number(context.diaryEntries) < 2) {
    return result('record_measurements', ['trend_needs_more_checkins'], 'low', ['measurements']);
  }
  if (Number(context.checkinAgeDays) > 8) {
    return result('refresh_measurements', ['checkin_is_stale'], 'medium', ['measurements']);
  }
  return result('review_progress', ['current_records_available'], 'medium');
}
