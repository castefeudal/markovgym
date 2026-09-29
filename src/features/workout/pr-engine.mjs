import { estimateOneRepMax, round } from '../../../tools/gym-calculators.mjs';

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

function completedRecords(history, exerciseId) {
  const records = [];
  for (const session of history || []) {
    for (const item of session?.items || []) {
      if (item?.id !== exerciseId) continue;
      for (const set of item.setLog || []) {
        if (set?.completed && set.type !== 'warmup') records.push(set);
      }
    }
  }
  return records;
}

/** Detect new, history-backed set records. Unsupported load semantics are skipped. */
export function detectSetPersonalRecords({ exerciseId, set, trackingType = 'weight-reps', history = [] } = {}) {
  if (!exerciseId || !set?.completed || set.type === 'warmup') return [];
  const previous = completedRecords(history, exerciseId);
  const events = [];
  const addIfBest = (type, value, priorValues) => {
    if (value == null || !priorValues.length || value <= Math.max(...priorValues)) return;
    events.push({ type, value: round(value) });
  };

  if (trackingType === 'weight-reps' || trackingType === 'bodyweight-added-weight') {
    const weight = positive(set.weight);
    const reps = positive(set.reps);
    if (weight) {
      addIfBest(trackingType === 'bodyweight-added-weight' ? 'added-load' : 'load', weight, previous.map((row) => positive(row.weight)).filter(Boolean));
      if (reps) {
        const atLoad = previous.filter((row) => positive(row.weight) === weight).map((row) => positive(row.reps)).filter(Boolean);
        addIfBest('reps-at-load', reps, atLoad);
        // Bodyweight is not collected in Run Mode, so an e1RM here would
        // understate total system load and is intentionally not reported.
        const estimate = trackingType === 'weight-reps' ? estimateOneRepMax(weight, reps) : null;
        if (estimate) addIfBest('e1rm', estimate.central, previous.map((row) => {
          const oldWeight = positive(row.weight), oldReps = positive(row.reps);
          return oldWeight && oldReps ? estimateOneRepMax(oldWeight, oldReps)?.central : null;
        }).filter(Boolean));
      }
    }
  } else if (trackingType === 'reps-only') {
    addIfBest('reps', positive(set.reps), previous.map((row) => positive(row.reps)).filter(Boolean));
  } else if (trackingType === 'duration') {
    addIfBest('duration', positive(set.duration), previous.map((row) => positive(row.duration)).filter(Boolean));
  } else if (trackingType === 'distance-duration') {
    addIfBest('distance', positive(set.distance), previous.map((row) => positive(row.distance)).filter(Boolean));
  }
  return events;
}

function sessionVolume(items) {
  return (items || []).reduce((sum, item) => {
    if (item?.trackingType === 'assisted-weight') return sum;
    return sum + (item?.setLog || []).reduce((subtotal, set) => {
    if (!set?.completed || set.type === 'warmup') return subtotal;
    const weight = positive(set.weight), reps = positive(set.reps);
    return weight && reps ? subtotal + weight * reps : subtotal;
    }, 0);
  }, 0);
}

/** Compare completed exercise/session tonnage with prior logged sessions. */
export function detectVolumePersonalRecords({ exerciseId, currentItems = [], history = [], exerciseComplete = false, sessionComplete = false } = {}) {
  const events = [];
  const currentItem = (currentItems || []).find((item) => item?.id === exerciseId);
  if (exerciseComplete && currentItem) {
    const value = sessionVolume([currentItem]);
    if (value > 0) {
      const prior = (history || []).filter((session) => (session?.items || []).some((item) => item?.id === exerciseId)).map((session) => sessionVolume((session?.items || []).filter((item) => item?.id === exerciseId))).filter(Boolean);
      if (prior.length && value > Math.max(...prior)) events.push({ type: 'exercise-volume', value: round(value) });
    }
  }
  if (sessionComplete) {
    const value = sessionVolume(currentItems);
    if (value > 0) {
      const prior = (history || []).map((session) => sessionVolume(session?.items || [])).filter(Boolean);
      if (prior.length && value > Math.max(...prior)) events.push({ type: 'session-volume', value: round(value) });
    }
  }
  return events;
}
