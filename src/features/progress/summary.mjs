import { diaryAverage, diaryDelta } from './diary-analytics.mjs';

/** Select a transparent progress message from declared goal and recorded trends. */
export function progressVerdictKey(goal, weightDelta14Kg, waistDelta30Cm) {
  if (!Number.isFinite(weightDelta14Kg)) return 'diaryNoTrend';

  if (goal === 'fat') {
    if (weightDelta14Kg < -0.2) return 'diaryFatOk';
    if (Number.isFinite(waistDelta30Cm) && waistDelta30Cm < -1) return 'diaryFatWaist';
    return 'diaryFatFlat';
  }

  if (goal === 'muscle' || goal === 'strength') {
    return weightDelta14Kg > 0.1 ? 'diaryGainOk' : 'diaryGainFlat';
  }

  return 'diaryNeutral';
}

/**
 * Build the Progress overview from local diary entries. Values are kept as
 * numbers or null; localization and rendering stay in the UI adapter.
 */
export function progressSummary(entries, goal, now = Date.now()) {
  const weightDelta7Kg = diaryDelta(entries, 'weight', 7);
  const weightDelta14Kg = diaryDelta(entries, 'weight', 14);
  const weightDelta30Kg = diaryDelta(entries, 'weight', 30);
  const waistDelta30Cm = diaryDelta(entries, 'waist', 30);

  return {
    weightDelta7Kg,
    weightDelta14Kg,
    weightDelta30Kg,
    waistDelta30Cm,
    averageWeight7Kg: diaryAverage(entries, 'weight', 7, now),
    verdictKey: progressVerdictKey(goal, weightDelta14Kg, waistDelta30Cm),
  };
}
