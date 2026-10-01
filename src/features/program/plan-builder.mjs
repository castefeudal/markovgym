const DAY_TEMPLATES = {
  full: ['chest', 'back', 'upper legs', 'shoulders', 'upper arms', 'waist'],
  upper: ['chest', 'back', 'shoulders', 'upper arms'],
  lower: ['upper legs', 'lower legs', 'waist'],
  push: ['chest', 'shoulders', 'upper arms'],
  pull: ['back', 'upper arms', 'lower arms'],
  legs: ['upper legs', 'lower legs', 'waist'],
};

const GOAL_DOSE = {
  strength: { sets: [4, 5], reps: '3–6', rest: [150, 210] },
  muscle: { sets: [3, 4], reps: '6–12', rest: [90, 120] },
  fatloss: { sets: [3, 4], reps: '10–15', rest: [45, 75] },
  health: { sets: [2, 3], reps: '10–15', rest: [60, 90] },
};

export function splitFor(days, level, goal) {
  if (days <= 2) return ['full', 'full'];
  if (days === 3) {
    if (level === 'beginner' || goal === 'health') return ['full', 'full', 'full'];
    return ['push', 'pull', 'legs'];
  }
  if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (days === 5) return ['push', 'pull', 'legs', 'upper', 'lower'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
}

/** Build a deterministic weekly plan. Exercise filtering and scoring are injected from the app. */
export function buildWeeklyPlan({
  goal = 'muscle', level = 'beginner', days = 3, time = 45, focus = 'balanced', recovery = 'mid',
  allowedEquipment = [], exercises = [], scoreExercise = () => 0, isExerciseAllowed = () => true,
}) {
  const dose = GOAL_DOSE[goal] || GOAL_DOSE.muscle;
  let [setsLo, setsHi] = dose.sets;
  if (level === 'beginner') { setsLo = Math.max(2, setsLo - 1); setsHi = Math.max(3, setsHi - 1); }
  if (level === 'advanced') { setsLo += 1; setsHi += 1; }

  let perSession = Math.max(3, Math.min(8, Math.round(time / 12)));
  if (level === 'beginner') perSession = Math.max(3, Math.min(6, perSession - 1));
  if (days >= 5) perSession = Math.max(3, Math.min(7, perSession - 1));
  if (recovery === 'low') {
    setsLo = Math.max(2, setsLo - 1);
    setsHi = Math.max(2, setsHi - 1);
    perSession = Math.max(3, perSession - 1);
  }

  const split = splitFor(days, level, goal).slice(0, days);
  const used = new Set();
  const poolCache = new Map();
  const poolFor = (zone) => {
    if (!poolCache.has(zone)) {
      const allowed = new Set(allowedEquipment);
      poolCache.set(zone, exercises
        .filter((exercise) => exercise.zone === zone && allowed.has(exercise.equip) && isExerciseAllowed(exercise))
        .map((exercise, index) => ({ exercise, index }))
        .sort((a, b) => (scoreExercise(b.exercise) - scoreExercise(a.exercise)) ||
          ((a.exercise.idx ?? a.index) - (b.exercise.idx ?? b.index)))
        .map(({ exercise }) => exercise));
    }
    return poolCache.get(zone);
  };
  const pickFor = (zone) => {
    const list = poolFor(zone);
    const next = list.find((exercise) => !used.has(exercise.id));
    if (next) { used.add(next.id); return next; }
    return null;
  };

  const week = split.map((key, dayIndex) => {
    let zones = DAY_TEMPLATES[key].slice();
    const focusZone = ({ chest: 'chest', back: 'back', shoulders: 'shoulders', 'upper arms': 'upper arms', waist: 'waist' })[focus] ||
      (focus === 'balanced' ? null : 'upper legs');
    if (focusZone && zones.includes(focusZone)) zones = [focusZone, focusZone, ...zones.filter((zone) => zone !== focusZone)];
    const items = [];
    let guard = 0;
    while (items.length < perSession && guard < perSession * 4) {
      const pick = pickFor(zones[guard % zones.length]);
      guard += 1;
      if (!pick || items.some((item) => item.ex.id === pick.id)) continue;
      const main = items.length < 2;
      items.push({
        ex: pick,
        sets: main ? setsHi : setsLo,
        reps: pick.zone === 'waist' && goal !== 'strength' ? '12–20' : dose.reps,
        rest: main ? dose.rest[1] : dose.rest[0],
      });
    }
    return { key, index: dayIndex, items };
  });

  return { week, split, perSession };
}
