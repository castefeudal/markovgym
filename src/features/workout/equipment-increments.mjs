const MAX_OVERRIDES = 2000;

export function validLoadIncrement(value) {
  const increment = Number(value);
  return Number.isFinite(increment) && increment >= 0.1 && increment <= 20 ? increment : null;
}

export function cleanLoadIncrementOverrides(value, maxEntries = MAX_OVERRIDES) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const id of Object.keys(value).slice(0, Math.max(0, maxEntries))) {
    const increment = validLoadIncrement(value[id]);
    if (increment !== null && id.length <= 100) result[id] = increment;
  }
  return result;
}

export function loadEquipmentKind(equipment) {
  const name = String(equipment || '').toLowerCase();
  if (['barbell', 'olympic barbell', 'ez barbell', 'trap bar', 'weighted bar'].includes(name)) return 'barbell';
  if (name.includes('smith')) return 'smith';
  if (name.includes('dumbbell')) return 'dumbbell';
  if (name.includes('cable')) return 'cable';
  if (name.includes('leverage') || name.includes('machine')) return 'machine';
  if (name.includes('body weight') || name.includes('bodyweight')) return 'bodyweight';
  return 'other';
}

/** Equipment-aware default; the value follows the load unit recorded for that exercise. */
export function equipmentLoadIncrement(exercise, overrides = {}) {
  const override = validLoadIncrement(overrides?.[exercise?.id]);
  if (override !== null) return override;
  const custom = validLoadIncrement(exercise?.loadIncrement);
  if (exercise?.custom && custom !== null) return custom;

  const kind = loadEquipmentKind(exercise?.equip);
  if (kind === 'barbell' || kind === 'smith') return 2.5;
  if (kind === 'dumbbell') return 1;
  if (kind === 'cable' || kind === 'machine') return 2.5;
  if (kind === 'bodyweight') return 1.25;

  const lowerBody = ['upper legs', 'lower legs'].includes(exercise?.zone);
  const compound = exercise?.compound === true;
  return lowerBody ? 2.5 : compound ? 2 : 1;
}
