const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function parseRepRange(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const low = finite(value[0]);
    const high = finite(value[1]);
    return low != null && high != null && low > 0 && high >= low ? [low, high] : null;
  }
  const text = String(value ?? '').trim();
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i);
  if (match) {
    const low = Number(match[1]), high = Number(match[2]);
    return low > 0 && high >= low ? [low, high] : null;
  }
  const single = finite(text);
  return single != null && single > 0 ? [single, single] : null;
}

const roundToIncrement = (value, increment) => {
  const step = finite(increment);
  if (step == null || step <= 0) return value;
  return Math.round(value / step) * step;
};

export function recommendProgression({
  previousSets = [],
  targetRepRange,
  increment = 2.5,
  minimumCompletedSets = 2,
  trackingType = 'weight-reps',
  unit = 'kg',
} = {}) {
  const range = parseRepRange(targetRepRange);
  if (!range) return insufficient('missing-rep-range');
  if (!['weight-reps', 'bodyweight-added-weight'].includes(trackingType)) {
    return insufficient('unsupported-tracking-type', range, { trackingType });
  }

  const minSets = Number.isInteger(minimumCompletedSets) && minimumCompletedSets > 0 ? minimumCompletedSets : 2;
  const loadUnit = String(unit || 'kg').trim().toLowerCase();

  const completed = previousSets
    .filter((set) => set && set.completed !== false && (set.type == null || set.type === 'working'))
    .map((set) => ({
      weight: finite(set.weight),
      reps: finite(set.reps),
      rir: finite(set.rir),
      rpe: finite(set.rpe),
      unit: String(set.unit || set.weightUnit || set.loadUnit || loadUnit).trim().toLowerCase(),
    }))
    .filter((set) => set.weight != null && set.weight > 0 && set.reps != null && set.reps > 0);

  if (completed.length < minSets) return insufficient('not-enough-completed-sets', range, { completedSets: completed.length, requiredSets: minSets });
  if (completed.some((set) => set.unit !== loadUnit)) {
    return insufficient('mixed-load-units', range, { completedSets: completed.length, expectedUnit: loadUnit });
  }

  const weights = completed.map((set) => set.weight);
  const baseWeight = weights[0];
  const sameWeight = weights.every((weight) => Math.abs(weight - baseWeight) < 1e-6);
  if (!sameWeight) return insufficient('mixed-working-weights', range, { completedSets: completed.length });

  const [low, high] = range;
  const reps = completed.map((set) => set.reps);
  const allAtTop = reps.every((rep) => rep >= high);
  const allInRange = reps.every((rep) => rep >= low);
  const hardTopSet = completed.some((set) =>
    (set.rir != null && set.rir <= 0) ||
    (set.rpe != null && set.rpe >= 10)
  );

  if (allAtTop && !hardTopSet) {
    const step = finite(increment);
    if (step == null || step <= 0) return insufficient('invalid-load-increment', range, { completedSets: completed.length, previousLoad: baseWeight });
    const nextLoad = roundToIncrement(baseWeight + step, step);
    return recommendation({
      action: 'increase-load',
      previousLoad: baseWeight,
      nextLoad,
      targetRange: range,
      unit: loadUnit,
      evidence: { completedSets: completed.length, reps, allAtTop: true },
      reason: 'all-sets-at-top-of-range',
    });
  }

  if (allAtTop && hardTopSet) {
    return recommendation({
      action: 'hold-load',
      previousLoad: baseWeight,
      nextLoad: baseWeight,
      targetRange: range,
      unit: loadUnit,
      evidence: { completedSets: completed.length, reps, hardTopSet: true },
      reason: 'top-range-but-maximal-effort',
    });
  }

  if (allInRange) {
    return recommendation({
      action: 'hold-load',
      previousLoad: baseWeight,
      nextLoad: baseWeight,
      targetRange: range,
      unit: loadUnit,
      evidence: { completedSets: completed.length, reps },
      reason: 'build-reps-within-range',
    });
  }

  return recommendation({
    action: 'hold-load',
    previousLoad: baseWeight,
    nextLoad: baseWeight,
    targetRange: range,
    unit: loadUnit,
    evidence: { completedSets: completed.length, reps },
    reason: 'rep-floor-not-yet-secured',
  });
}

function insufficient(reason, targetRange = null, evidence = {}) {
  return {
    status: 'insufficient', action: 'collect-more-data', nextLoad: null,
    targetRange, targetReps: targetRange, confidence: 'low', reason, evidence,
  };
}

function recommendation({ action, previousLoad, nextLoad, targetRange, unit, evidence, reason }) {
  const completedSets = Number(evidence && evidence.completedSets) || 0;
  const confidence = completedSets >= 3 ? 'high' : (completedSets >= 2 ? 'medium' : 'low');
  return {
    status: 'recommendation', action, previousLoad, nextLoad,
    targetRange, targetReps: targetRange, unit, confidence,
    evidence: { ...evidence, confidenceBasis: `${completedSets}-completed-working-sets` },
    reason,
  };
}
