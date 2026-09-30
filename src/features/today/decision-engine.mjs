function result(recommendation, reasons, confidence, missingData = [], details = {}) {
  return Object.freeze({
    recommendation,
    reasons: Object.freeze(reasons),
    confidence,
    missingData: Object.freeze(missingData),
    nextAction: recommendation,
    ...details,
  });
}

/** Choose one next action from recorded state; this module has no DOM or copy dependencies. */
export function nextWorkoutAction(context = {}) {
  if (context.activeRun) return result('resume_run', ['active_run'], 'high');
  if (context.completedWorkout) return result('save_workout', ['workout_complete'], 'high');
  if (context.pendingWorkout) return result('start_workout', ['workout_ready'], 'high');
  if (context.programmeBlockComplete) return result('review_program_block', ['programme_block_complete'], 'medium', ['programme_review']);
  if (Number.isInteger(context.scheduledProgramDay) && context.scheduledProgramDay >= 0) {
    return result('start_program_day', ['scheduled_program_day'], 'high', [], { day: context.scheduledProgramDay });
  }
  if (context.hasTrainingHistory && (context.checkinAgeDays == null || Number(context.checkinAgeDays) > 7)) {
    return result('record_measurements', ['weight_checkin_missing_or_stale'], 'low', ['measurements']);
  }
  if (context.hasNutritionLogToday === false) {
    return result('log_nutrition', ['nutrition_log_missing_today'], 'low', ['nutrition_entry']);
  }
  if (context.programmeWeekComplete) {
    return result('review_week', ['programme_week_complete'], 'medium', ['weekly_feedback']);
  }
  if (context.profileIncomplete) return result('finish_profile', ['profile_incomplete'], 'medium', ['training_profile']);
  if (!context.hasProgram) {
    return result('build_program', ['program_missing'], 'medium', ['program']);
  }
  if (!context.hasTrainingHistory) {
    return result('find_exercise', ['no_training_history'], 'medium', ['first_workout']);
  }
  return result('review_progress', ['current_records_available'], 'medium');
}
