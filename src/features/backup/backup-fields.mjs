const JSON_FIELDS_LIMIT = 50_000_000;
export function parseBackupJson(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

/** Sanitize one serialized backup field without reading browser or application state. */
export function validateBackupField(name, raw, adapters = {}) {
  if (typeof raw !== 'string' || raw.length > JSON_FIELDS_LIMIT) return null;
  if (name === 'lang') return raw === 'ru' || raw === 'en' ? raw : null;
  if (name === 'theme') return ['obsidian', 'soft', 'ivory'].includes(raw) ? raw : null;
  if (name === 'density') return ['compact', 'default', 'roomy'].includes(raw) ? raw : null;
  if (name === 'coach') return raw === '0' || raw === '1' ? raw : null;
  if (name === 'rest') return [60, 90, 120, 180].includes(Number(raw)) ? String(Number(raw)) : null;
  if (['schema', 'workoutSchema', 'historySchema'].includes(name)) return /^\d{1,3}$/.test(raw) ? raw : null;
  if (name === 'equipmentProfileActive') return raw.length <= 80 ? raw : null;

  const value = parseBackupJson(raw);
  if (value === null) return null;
  const stringify = (next) => JSON.stringify(next);
  const exists = (id) => typeof adapters.exerciseExists === 'function' && adapters.exerciseExists(String(id));

  if (name === 'fav') return stringify(Array.isArray(value) ? value.map(String).filter(exists).slice(0, adapters.exerciseLimit || 1324) : []);
  if (name === 'workout') {
    if (!Array.isArray(value)) return stringify([]);
    if (typeof adapters.normalizeWorkoutRecord !== 'function') return null;
    return stringify(value.filter((item) => item && exists(item.id)).map(adapters.normalizeWorkoutRecord).slice(0, 80));
  }
  if (name === 'profile') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return stringify({
      goal: String(value.goal || '').slice(0, 40), level: String(value.level || '').slice(0, 40),
      place: String(value.place || '').slice(0, 40), days: String(value.days || '').slice(0, 8),
      typicalSessionMinutes: String(value.typicalSessionMinutes || '').slice(0, 8),
      equipmentAvailability: Array.isArray(value.equipmentAvailability) ? value.equipmentAvailability.map(String).slice(0, 32) : [],
      focus: String(value.focus || 'balanced').slice(0, 40),
      limitations: Array.isArray(value.limitations) ? value.limitations.map(String).slice(0, 16) : [],
      recoveryBaseline: String(value.recoveryBaseline || 'mid').slice(0, 20), done: !!value.done, skipped: !!value.skipped,
    });
  }
  if (name === 'meta') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return stringify({
      name: String(value.name || '').slice(0, 80), date: String(value.date || '').slice(0, 10),
      note: String(value.note || '').slice(0, 600), planDay: Number.isInteger(Number(value.planDay)) ? Number(value.planDay) : null,
    });
  }
  if (name === 'history') return stringify(Array.isArray(value) ? value.filter((item) => item && Array.isArray(item.items)) : []);
  if (name === 'diary') return stringify(Array.isArray(value) ? value.filter((item) => item && typeof item.date === 'string').slice(0, 400) : []);
  if (name === 'nutritionLog') {
    if (!Array.isArray(value) || typeof adapters.cleanNutritionDays !== 'function') return null;
    const clean = adapters.cleanNutritionDays(value);
    return clean.length === value.length ? stringify(clean) : null;
  }
  if (name === 'calculatorHistory') {
    return Array.isArray(value) && typeof adapters.cleanCalculatorResults === 'function'
      ? stringify(adapters.cleanCalculatorResults(value)) : null;
  }
  if (name === 'tips') return stringify(Array.isArray(value) ? value.map(String).slice(0, 200) : []);
  if (name === 'recentSearch') return stringify(Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 8) : []);
  if (name === 'recentExercises') return stringify(Array.isArray(value) ? value.map(String).filter(exists).slice(0, 8) : []);
  if (name === 'runSession') {
    if (!value || typeof value !== 'object' || Number(adapters.now ?? Date.now()) - Number(value.startedAt || 0) > 8 * 3600000) return stringify(null);
    return stringify(value);
  }
  if (name === 'kbju') return value && typeof value === 'object' && !Array.isArray(value) ? stringify(value) : null;
  if (name === 'customExercises') return Array.isArray(value) && typeof adapters.cleanCustomExercises === 'function' ? stringify(adapters.cleanCustomExercises(value)) : null;
  if (name === 'equipmentProfiles') return Array.isArray(value) && typeof adapters.cleanEquipmentProfiles === 'function' ? stringify(adapters.cleanEquipmentProfiles(value)) : null;
  if (name === 'exercisePreferences') {
    return value && typeof value === 'object' && !Array.isArray(value) && typeof adapters.cleanExercisePreferences === 'function'
      ? stringify(adapters.cleanExercisePreferences(value)) : null;
  }
  if (name === 'plan') {
    if (typeof adapters.restorePlan !== 'function' || typeof adapters.serializePlan !== 'function') return null;
    const restored = adapters.restorePlan(value);
    return restored ? stringify(adapters.serializePlan(restored)) : stringify(null);
  }
  if (name === 'settings') {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? stringify({
        rir: !!value.rir, rpe: !!value.rpe,
        reading: ['balanced', 'comfortable', 'large'].includes(value.reading) ? value.reading : 'balanced',
        loadIncrements: typeof adapters.cleanLoadIncrementOverrides === 'function' ? adapters.cleanLoadIncrementOverrides(value.loadIncrements) : {},
      })
      : null;
  }
  return null;
}

export function backupEnvelopeError(parsed, schemaVersion) {
  if (!parsed || parsed.kind !== 'mmg-backup' || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) return 'shape';
  if (Number(parsed.schemaVersion || parsed.v || 0) > schemaVersion) return 'future';
  return null;
}
