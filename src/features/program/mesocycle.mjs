const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function monday(date) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result;
}

/** Calendar-week progress for a programme block; it does not prescribe a deload. */
export function mesocycleStatus({ startWeek, durationWeeks = 4, today } = {}) {
  const start = isoDate(startWeek), current = isoDate(today);
  const duration = Number(durationWeeks);
  if (!start || !current || !Number.isInteger(duration) || duration < 1 || duration > 16) {
    return { status: 'insufficient', weekNumber: null, durationWeeks: null, startWeek: null };
  }
  const firstWeek = monday(start), currentWeek = monday(current);
  const elapsedWeeks = Math.floor((currentWeek.getTime() - firstWeek.getTime()) / (7 * DAY_MS));
  if (elapsedWeeks < 0) return { status: 'upcoming', weekNumber: 1, durationWeeks: duration, startWeek: firstWeek.toISOString().slice(0, 10) };
  if (elapsedWeeks >= duration) return { status: 'complete', weekNumber: duration, durationWeeks: duration, startWeek: firstWeek.toISOString().slice(0, 10) };
  return { status: 'active', weekNumber: elapsedWeeks + 1, durationWeeks: duration, startWeek: firstWeek.toISOString().slice(0, 10) };
}
