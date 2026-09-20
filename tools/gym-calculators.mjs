const EPSILON = 1e-6;

const finitePositive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

/** Estimate one-rep max with two common models. Returns null for unsafe input. */
export function estimateOneRepMax(weight, reps) {
  const load = finitePositive(weight);
  const repetitions = Number(reps);
  if (!load || !Number.isFinite(repetitions) || repetitions < 1 || repetitions > 30) return null;

  const epley = load * (1 + repetitions / 30);
  const brzycki = repetitions < 37 ? load * 36 / (37 - repetitions) : null;
  const models = [epley, brzycki].filter((value) => Number.isFinite(value));
  const low = Math.min(...models);
  const high = Math.max(...models);
  const confidence = repetitions <= 10 ? 'high' : repetitions <= 15 ? 'medium' : 'low';
  return {
    weight: load,
    reps: repetitions,
    epley: round(epley),
    brzycki: brzycki == null ? null : round(brzycki),
    central: round((low + high) / 2),
    range: [round(low), round(high)],
    confidence,
  };
}

function normalisePairs(availablePairs) {
  return Object.entries(availablePairs || {})
    .map(([value, count]) => ({ value: finitePositive(value), count: Math.max(0, Math.floor(Number(count) || 0)) }))
    .filter((entry) => entry.value && entry.count)
    .sort((a, b) => b.value - a.value);
}

/**
 * Find a safe bilateral plate arrangement. Counts represent available pairs;
 * the returned list is the plates for one side only.
 */
export function calculatePlates({ targetTotal, barWeight = 20, collars = 0, availablePairs = {} } = {}) {
  const target = finitePositive(targetTotal);
  const bar = finitePositive(barWeight) || 20;
  const collarWeight = Math.max(0, Number(collars) || 0);
  if (!target) return null;

  const desiredPerSide = (target - bar - collarWeight) / 2;
  const types = normalisePairs(availablePairs);
  if (desiredPerSide <= EPSILON || !types.length) {
    const achieved = bar + collarWeight;
    return { target, bar, collars: collarWeight, exact: Math.abs(achieved - target) < EPSILON, achievedTotal: round(achieved), difference: round(achieved - target), perSide: [], pairsUsed: {} };
  }

  let best = { weight: 0, plates: [], pairsUsed: {} };
  const visit = (index, current, plates, pairsUsed) => {
    if (current > desiredPerSide + EPSILON) return;
    if (current > best.weight + EPSILON || (Math.abs(current - best.weight) < EPSILON && plates.length < best.plates.length)) {
      best = { weight: current, plates: [...plates], pairsUsed: { ...pairsUsed } };
    }
    const type = types[index];
    if (!type) return;
    visit(index + 1, current, plates, pairsUsed);
    for (let used = 1; used <= type.count; used += 1) {
      const next = current + type.value * used;
      if (next > desiredPerSide + EPSILON) break;
      plates.push(...Array(used).fill(type.value));
      pairsUsed[type.value] = used;
      visit(index + 1, next, plates, pairsUsed);
      delete pairsUsed[type.value];
      plates.splice(-used, used);
    }
  };
  visit(0, 0, [], {});

  const achievedTotal = bar + collarWeight + best.weight * 2;
  return {
    target,
    bar,
    collars: collarWeight,
    exact: Math.abs(achievedTotal - target) < EPSILON,
    achievedTotal: round(achievedTotal),
    difference: round(achievedTotal - target),
    perSide: best.plates,
    pairsUsed: best.pairsUsed,
  };
}

/** A modifiable warm-up template; returned sets exclude the working set. */
export function warmupRamp({ workingWeight, barWeight = 20, increment = 2.5 } = {}) {
  const working = finitePositive(workingWeight);
  const bar = finitePositive(barWeight) || 20;
  const step = finitePositive(increment) || 2.5;
  if (!working || working <= bar) return working ? [{ weight: round(bar), reps: 8, label: 'empty bar' }] : [];

  const reps = [8, 5, 3, 1];
  const percentages = working < bar * 1.6 ? [0.55, 0.75] : working < bar * 2.2 ? [0.4, 0.6, 0.8] : [0.4, 0.6, 0.75, 0.85];
  const result = [];
  percentages.forEach((percentage, index) => {
    const raw = Math.max(bar, Math.round((working * percentage) / step) * step);
    if (raw >= working || result.some((set) => Math.abs(set.weight - raw) < EPSILON)) return;
    result.push({ weight: round(raw), reps: reps[index] || 1, label: raw === bar ? 'empty bar' : `${Math.round(percentage * 100)}%` });
  });
  return result;
}

export function sessionVolume(sets = []) {
  return round(sets.reduce((sum, set) => {
    if (set && set.completed === false) return sum;
    const weight = finitePositive(set?.weight);
    const reps = finitePositive(set?.reps);
    return weight && reps ? sum + weight * reps : sum;
  }, 0));
}

export function weeklyMuscleSets(history = []) {
  return history.reduce((totals, session) => {
    (session?.items || []).forEach((item) => {
      const muscle = item.muscle || item.target || item.zone;
      if (!muscle) return;
      const completed = (item.setLog || []).filter((set) => set?.completed !== false && set?.completed).length;
      totals[muscle] = (totals[muscle] || 0) + (completed || Number(item.sets) || 0);
    });
    return totals;
  }, {});
}

export { round };
