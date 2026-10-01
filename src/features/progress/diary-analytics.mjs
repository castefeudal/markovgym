function datedValues(entries, field) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry.date === 'string' && Number.isFinite(Date.parse(entry.date)) &&
      typeof entry[field] === 'number' && Number.isFinite(entry[field]))
    .slice()
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function diaryDelta(entries, field, days) {
  const values = datedValues(entries, field);
  if (values.length < 2 || !Number.isFinite(Number(days)) || Number(days) < 0) return null;
  const newestDate = Date.parse(values[0].date);
  const threshold = newestDate - Number(days) * 86400000;
  const past = values.find((entry) => Date.parse(entry.date) <= threshold) || values[values.length - 1];
  if (past === values[0]) return null;
  return values[0][field] - past[field];
}

export function diaryAverage(entries, field, days, now = Date.now()) {
  if (!Number.isFinite(Number(days)) || Number(days) < 0 || !Number.isFinite(Number(now))) return null;
  const cutoff = Number(now) - Number(days) * 86400000;
  const values = datedValues(entries, field).filter((entry) => Date.parse(entry.date) >= cutoff);
  if (!values.length) return null;
  return values.reduce((sum, entry) => sum + entry[field], 0) / values.length;
}
