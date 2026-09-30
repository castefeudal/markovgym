const SET_TYPES = new Set(['warmup', 'working', 'drop', 'failure', 'backoff', 'amrap']);
const GROUP_TYPES = new Set(['superset', 'tri-set', 'circuit']);
const boundedCount = (value, fallback, min, max) => {
  const count = Number(value) || fallback;
  return Math.min(max, Math.max(min, count));
};

/** Normalize one set while preserving the app's legacy-compatible storage shape. */
export function cleanSetRecord(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const requestedType = String(source.type || 'working');
  const type = SET_TYPES.has(requestedType) ? requestedType : 'working';
  return {
    reps: String(source.reps == null ? '' : source.reps).slice(0, 24),
    weight: String(source.weight == null ? '' : source.weight).slice(0, 40),
    distance: String(source.distance == null ? '' : source.distance).slice(0, 32),
    duration: String(source.duration == null ? '' : source.duration).slice(0, 32),
    rir: String(source.rir == null ? '' : source.rir).slice(0, 8),
    rpe: String(source.rpe == null ? '' : source.rpe).slice(0, 8),
    restSec: Math.max(0, Number(source.restSec) || 0),
    note: String(source.note == null ? '' : source.note).slice(0, 500),
    type,
    completed: !!source.completed,
    completedAt: Number(source.completedAt) > 0 ? Number(source.completedAt) : 0,
  };
}

/** Ensure a workout item has exactly its declared number of normalized sets. */
export function ensureSetLog(item) {
  if (!item) return [];
  const total = boundedCount(item.sets, 1, 1, 20);
  const source = Array.isArray(item.setLog) ? item.setLog : [];
  const log = [];
  for (let index = 0; index < total; index += 1) {
    const row = cleanSetRecord(source[index]);
    if (!source.length && item.done) {
      row.reps = String(item.reps || '').slice(0, 24);
      row.weight = String(item.weight || '').slice(0, 40);
      row.completed = true;
    }
    log.push(row);
  }
  item.setLog = log;
  item.done = log.length > 0 && log.every((row) => row.completed);
  return log;
}

/** Normalize persisted workout rows and keep supported grouping metadata. */
export function normalizeWorkoutRecord(item) {
  const source = item && typeof item === 'object' ? item : {};
  const requestedGroupType = String(source.groupType || '');
  const groupType = GROUP_TYPES.has(requestedGroupType) ? requestedGroupType : '';
  const groupId = groupType ? String(source.groupId || '').slice(0, 48) : '';
  const record = {
    id: String(source.id || ''),
    sets: boundedCount(source.sets, 3, 1, 20),
    reps: String(source.reps == null ? '10–12' : source.reps).slice(0, 24),
    weight: String(source.weight == null ? '' : source.weight).slice(0, 40),
    done: !!source.done,
    groupId,
    groupType: groupId ? groupType : '',
    setLog: Array.isArray(source.setLog) ? source.setLog.map(cleanSetRecord).slice(0, 20) : [],
  };
  ensureSetLog(record);
  return record;
}
