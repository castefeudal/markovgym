const EXCLUDED_PREFERENCES = new Set(['avoid', 'unavailable', 'discomfort']);

function overlap(left, right) {
  const values = new Set(Array.isArray(left) ? left : []);
  return [...new Set(Array.isArray(right) ? right : [])].filter((value) => values.has(value));
}

function allowedForReason(candidate, source, reason, context) {
  const equipment = candidate.equip;
  const guided = context.guidedEquipment?.includes(equipment) || false;
  const homeFriendly = context.homeEquipment?.includes(equipment) || false;
  if (reason === 'busy') return equipment !== source.equip;
  if (reason === 'noequip') return equipment !== source.equip && (homeFriendly || guided);
  if (reason === 'home') return homeFriendly;
  if (reason === 'awkward') return guided || homeFriendly;
  if (reason === 'discomfort') return guided || equipment === 'body weight';
  if (reason === 'hard') return context.levelById?.[candidate.id] === 'beginner';
  if (reason === 'easy') return context.levelById?.[candidate.id] === 'advanced'
    || (context.roleById?.[candidate.id] === 'compound' && context.freeWeightEquipment?.includes(equipment));
  return true;
}

function rankCandidate(candidate, source, context) {
  const reasons = [];
  let score = 0;
  const primaryMatch = candidate.target && candidate.target === source.target;
  const sameGroup = candidate.group && candidate.group === source.group && candidate.zone === source.zone;
  const sharedMuscles = overlap(candidate.secondary, [source.target, ...(source.secondary || [])]);
  const sourceSupportsCandidate = (source.secondary || []).includes(candidate.target);
  const sameMovement = candidate.movementPattern && source.movementPattern
    && candidate.movementPattern === source.movementPattern;
  const candidateRole = context.roleById?.[candidate.id] || candidate.exerciseRole || '';
  const sourceRole = context.roleById?.[source.id] || source.exerciseRole || '';
  const sameRole = candidateRole && sourceRole && candidateRole === sourceRole;
  const sameLaterality = candidate.laterality && source.laterality && candidate.laterality === source.laterality;
  const sameStability = candidate.stabilityRequirement && source.stabilityRequirement
    && candidate.stabilityRequirement === source.stabilityRequirement;
  const slotRole = context.programSlot?.role || '';

  if (primaryMatch) { score += 100; reasons.push('same_primary'); }
  else if (sameGroup) { score += 58; reasons.push('same_group'); }
  else if (sourceSupportsCandidate) { score += 34; reasons.push('supporting_muscle'); }
  if (sharedMuscles.length && !reasons.includes('supporting_muscle')) { score += 24; reasons.push('supporting_muscle'); }
  if (sameMovement) { score += 36; reasons.push('same_movement'); }
  if (sameRole) { score += 18; reasons.push('same_role'); }
  if (sameLaterality) { score += 8; reasons.push('same_laterality'); }
  if (sameStability) { score += 8; reasons.push('same_stability'); }
  if (context.availableEquipment.includes(candidate.equip)) { score += 5; reasons.push('available_equipment'); }

  const preference = context.preferenceById?.[candidate.id] || 'neutral';
  if (preference === 'prefer') { score += 28; reasons.push('preferred'); }
  if (preference === 'lessOften') { score -= 24; reasons.push('less_often'); }
  if (context.favouriteIds?.includes(candidate.id)) { score += 12; reasons.push('favourite'); }
  if (context.location === 'home' && context.homeEquipment?.includes(candidate.equip)) {
    score += 8;
    reasons.push('location_match');
  }
  const candidateLevel = context.levelById?.[candidate.id] || '';
  if (context.experience && candidateLevel === context.experience) {
    score += 8;
    reasons.push('experience_match');
  }
  if (slotRole && candidateRole === slotRole) {
    score += 12;
    reasons.push('program_slot');
  }
  return { exercise: candidate, score, reasons };
}

/** Deterministically ranks only available, user-acceptable exercises and returns the evidence used. */
export function rankSubstitutions({
  exercise,
  candidates = [],
  reason = '',
  availableEquipment = [],
  preferenceById = {},
  favouriteIds = [],
  location = '',
  experience = '',
  roleById = {},
  levelById = {},
  programSlot = null,
  homeEquipment = [],
  guidedEquipment = [],
  freeWeightEquipment = [],
  limit = 6,
} = {}) {
  if (!exercise || !exercise.id) return [];
  const context = {
    availableEquipment: new Set(availableEquipment), preferenceById, favouriteIds,
    location, experience, roleById, levelById, programSlot,
    homeEquipment, guidedEquipment, freeWeightEquipment,
  };
  context.availableEquipment = [...context.availableEquipment];
  return candidates
    .filter((candidate) => candidate && candidate.id !== exercise.id)
    .filter((candidate) => candidate.target === exercise.target
      || (candidate.group && candidate.group === exercise.group && candidate.zone === exercise.zone)
      || (Array.isArray(exercise.secondary) && exercise.secondary.includes(candidate.target))
      || overlap(candidate.secondary, [exercise.target, ...(exercise.secondary || [])]).length > 0)
    .filter((candidate) => context.availableEquipment.includes(candidate.equip))
    .filter((candidate) => !EXCLUDED_PREFERENCES.has(preferenceById[candidate.id]))
    .filter((candidate) => allowedForReason(candidate, exercise, reason, context))
    .map((candidate, index) => ({ ...rankCandidate(candidate, exercise, context), index }))
    .sort((left, right) => right.score - left.score || left.index - right.index || String(left.exercise.id).localeCompare(String(right.exercise.id)))
    .slice(0, Math.max(0, Math.floor(Number(limit) || 0)))
    .map(({ index, ...result }) => result);
}
