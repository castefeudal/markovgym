/** Join intake with scale measurements by local calendar date for personal estimates. */
export function joinNutritionAndMeasurements(nutritionDays = [], measurements = []) {
  const weights = new Map();
  for (const entry of Array.isArray(measurements) ? measurements : []) {
    if (typeof entry?.date !== 'string') continue;
    const weight = Number(entry.weightKg ?? entry.weight ?? entry.bodyWeight);
    if (Number.isFinite(weight) && weight > 0) weights.set(entry.date, weight);
  }
  const days = new Map();
  for (const entry of Array.isArray(nutritionDays) ? nutritionDays : []) {
    if (typeof entry?.date !== 'string') continue;
    const calories = Number(entry.calories ?? entry.kcal ?? entry.energy);
    const weightKg = Number(entry.weightKg ?? weights.get(entry.date));
    if (!Number.isFinite(calories) || calories <= 0 || !Number.isFinite(weightKg) || weightKg <= 0) continue;
    days.set(entry.date, { date: entry.date, calories, weightKg });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
