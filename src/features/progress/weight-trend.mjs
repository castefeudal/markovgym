const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const mean = (rows) => rows.length ? rows.reduce((sum, row) => sum + row.weightKg, 0) / rows.length : null;
const rounded = (value, places = 2) => value == null ? null : Math.round(value * (10 ** places)) / (10 ** places);

/** Explainable 7-day arithmetic means of recorded weigh-ins, with explicit coverage. */
export function weightTrend(measurements = []) {
  const byDate = new Map();
  for (const entry of Array.isArray(measurements) ? measurements : []) {
    const date = entry?.date;
    const weightKg = Number(entry?.weightKg ?? entry?.weight ?? entry?.bodyWeight);
    if (!validDate(date) || !Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500) continue;
    byDate.set(date, { date, day: Date.parse(`${date}T00:00:00.000Z`) / 86400000, weightKg });
  }
  const rows = [...byDate.values()].sort((a, b) => a.day - b.day);
  if (!rows.length) return { status: 'insufficient', scaleWeightKg: null, trendWeightKg: null, delta7dKg: null, rate21dKgPerWeek: null, coverage7d: 0, coverage21d: 0, observations7d: 0, observations21d: 0 };
  const lastDay = rows[rows.length - 1].day;
  const recent = rows.filter((row) => lastDay - row.day >= 0 && lastDay - row.day < 7);
  const previous = rows.filter((row) => lastDay - row.day >= 7 && lastDay - row.day < 14);
  const older = rows.filter((row) => lastDay - row.day >= 14 && lastDay - row.day < 21);
  const all21 = rows.filter((row) => lastDay - row.day >= 0 && lastDay - row.day < 21);
  const recentMean = recent.length >= 3 ? mean(recent) : null;
  const previousMean = previous.length >= 3 ? mean(previous) : null;
  let rate21dKgPerWeek = null;
  if (recent.length >= 3 && older.length >= 3) {
    const recentDay = recent.reduce((sum, row) => sum + row.day, 0) / recent.length;
    const olderDay = older.reduce((sum, row) => sum + row.day, 0) / older.length;
    const elapsedWeeks = (recentDay - olderDay) / 7;
    if (elapsedWeeks > 0) rate21dKgPerWeek = (mean(recent) - mean(older)) / elapsedWeeks;
  }
  return {
    status: 'ok',
    scaleWeightKg: rounded(rows[rows.length - 1].weightKg),
    trendWeightKg: rounded(recentMean),
    delta7dKg: recentMean == null || previousMean == null ? null : rounded(recentMean - previousMean),
    rate21dKgPerWeek: rounded(rate21dKgPerWeek),
    coverage7d: Math.round(Math.min(1, recent.length / 7) * 100),
    coverage21d: Math.round(Math.min(1, all21.length / 21) * 100),
    observations7d: recent.length,
    observations21d: all21.length,
    method: 'arithmetic mean of recorded weigh-ins in calendar windows; requires at least 3 observations per compared window',
  };
}
