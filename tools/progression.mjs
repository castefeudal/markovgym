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
} = {}) {
  const range = parseRepRange(targetRepRange);
  if (!range) return { status: 'insufficient', reason: 'missing-rep-range' };

  const completed = previousSets
    .filter((set) => set && set.completed !== false)
    .map((set) => ({
      weight: finite(set.weight),
      reps: finite(set.reps),
      rir: finite(set.rir),
      rpe: finite(set.rpe),
    }))
    .filter((set) => set.weight != null && set.weight > 0 && set.reps != null && set.reps > 0);

  if (completed.length < minimumCompletedSets) return { status: 'insufficient', reason: 'not-enough-completed-sets' };

  const weights = completed.map((set) => set.weight);
  const baseWeight = weights[0];
  const sameWeight = weights.every((weight) => Math.abs(weight - baseWeight) < 1e-6);
  if (!sameWeight) return { status: 'insufficient', reason: 'mixed-working-weights' };

  const [low, high] = range;
  const reps = completed.map((set) => set.reps);
  const allAtTop = reps.every((rep) => rep >= high);
  const allInRange = reps.every((rep) => rep >= low);
  const hardTopSet = completed.some((set) =>
    (set.rir != null && set.rir <= 0) ||
    (set.rpe != null && set.rpe >= 10)
  );

  if (allAtTop && !hardTopSet) {
    const nextLoad = roundToIncrement(baseWeight + Number(increment || 0), increment);
    return {
      status: 'recommendation',
      action: 'increase-load',
      previousLoad: baseWeight,
      nextLoad,
      targetReps: [low, high],
      evidence: { completedSets: completed.length, reps, allAtTop: true },
      reason: 'all-sets-at-top-of-range',
    };
  }

  if (allAtTop && hardTopSet) {
    return {
      status: 'recommendation',
      action: 'hold-load',
      previousLoad: baseWeight,
      nextLoad: baseWeight,
      targetReps: [low, high],
      evidence: { completedSets: completed.length, reps, hardTopSet: true },
      reason: 'top-range-but-maximal-effort',
    };
  }

  if (allInRange) {
    return {
      status: 'recommendation',
      action: 'hold-load',
      previousLoad: baseWeight,
      nextLoad: baseWeight,
      targetReps: [low, high],
      evidence: { completedSets: completed.length, reps },
      reason: 'build-reps-within-range',
    };
  }

  return {
    status: 'recommendation',
    action: 'hold-load',
    previousLoad: baseWeight,
    nextLoad: baseWeight,
    targetReps: [low, high],
    evidence: { completedSets: completed.length, reps },
    reason: 'rep-floor-not-yet-secured',
  };
}
