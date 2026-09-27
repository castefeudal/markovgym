const EPSILON = 1e-6;

const finitePositive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const finiteNonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const confidenceByReps = (reps) => reps <= 10 ? 'high' : reps <= 15 ? 'medium' : 'low';

export function estimateOneRepMax(weight, reps) {
  const load = finitePositive(weight);
  const repetitions = Number(reps);
  if (!load || !Number.isFinite(repetitions) || repetitions < 1 || repetitions > 30) return null;
  const epley = load * (1 + repetitions / 30);
  const brzycki = repetitions < 37 ? load * 36 / (37 - repetitions) : null;
  const models = [epley, brzycki].filter(Number.isFinite);
  const low = Math.min(...models);
  const high = Math.max(...models);
  return {
    weight: load,
    reps: repetitions,
    epley: round(epley),
    brzycki: brzycki == null ? null : round(brzycki),
    central: round((low + high) / 2),
    range: [round(low), round(high)],
    confidence: confidenceByReps(repetitions),
    formulaVersion: 'epley-brzycki-v1',
  };
}

export function loadFromOneRepMax(oneRepMax, percent, increment = 2.5) {
  const max = finitePositive(oneRepMax);
  const pct = Number(percent);
  const step = finitePositive(increment) || 2.5;
  if (!max || !Number.isFinite(pct) || pct <= 0 || pct > 110) return null;
  const raw = max * pct / 100;
  const rounded = Math.round(raw / step) * step;
  return { raw: round(raw), rounded: round(rounded), percent: pct, increment: step };
}

export function convertRepMax(weight, repsFrom, repsTo) {
  const base = estimateOneRepMax(weight, repsFrom);
  const targetReps = Number(repsTo);
  if (!base || !Number.isFinite(targetReps) || targetReps < 1 || targetReps > 30) return null;
  const epley = base.epley / (1 + targetReps / 30);
  const brzycki = base.brzycki == null ? null : base.brzycki * (37 - targetReps) / 36;
  const values = [epley, brzycki].filter(Number.isFinite);
  return {
    from: { weight: Number(weight), reps: Number(repsFrom) },
    toReps: targetReps,
    central: round(values.reduce((a, b) => a + b, 0) / values.length),
    range: [round(Math.min(...values)), round(Math.max(...values))],
    confidence: confidenceByReps(Math.max(Number(repsFrom), targetReps)),
    formulaVersion: 'rep-conversion-epley-brzycki-v1',
  };
}

function normalisePairs(availablePairs) {
  return Object.entries(availablePairs || {})
    .map(([value, count]) => ({ value: finitePositive(value), count: Math.max(0, Math.floor(Number(count) || 0)) }))
    .filter((entry) => entry.value && entry.count)
    .sort((a, b) => b.value - a.value);
}

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
      const completed = (item.setLog || []).filter((set) => set?.completed).length;
      totals[muscle] = (totals[muscle] || 0) + (completed || Number(item.sets) || 0);
    });
    return totals;
  }, {});
}

export function bmrMifflinStJeor({ sex, weightKg, heightCm, age } = {}) {
  const weight = finitePositive(weightKg);
  const height = finitePositive(heightCm);
  const years = finitePositive(age);
  if (!weight || !height || !years || !['male', 'female'].includes(sex)) return null;
  const sexOffset = sex === 'male' ? 5 : -161;
  return {
    kcal: round(10 * weight + 6.25 * height - 5 * years + sexOffset),
    formulaVersion: 'mifflin-st-jeor-1990',
    confidence: 'population-estimate',
  };
}

export function tdeeEstimate({ bmr, activityFactor = 1.4, uncertainty = 0.08 } = {}) {
  const basal = finitePositive(bmr);
  const factor = Number(activityFactor);
  if (!basal || !Number.isFinite(factor) || factor < 1 || factor > 2.5) return null;
  const central = basal * factor;
  const margin = Math.max(0.05, Math.min(0.2, Number(uncertainty) || 0.08));
  return {
    central: round(central),
    range: [round(central * (1 - margin)), round(central * (1 + margin))],
    activityFactor: factor,
    confidence: 'starting-estimate',
  };
}

export function calorieTargetRange({ maintenanceKcal, goal = 'maintain', rate = 'moderate' } = {}) {
  const maintenance = finitePositive(maintenanceKcal);
  if (!maintenance) return null;
  const deltas = {
    cut: { gentle: [-0.10, -0.15], moderate: [-0.15, -0.20], assertive: [-0.20, -0.25] },
    maintain: { gentle: [-0.03, 0.03], moderate: [-0.03, 0.03], assertive: [-0.03, 0.03] },
    gain: { gentle: [0.03, 0.06], moderate: [0.05, 0.08], assertive: [0.07, 0.10] },
  };
  const goalMap = goal === 'loss' ? 'cut' : goal === 'gain' ? 'gain' : goal;
  const pair = deltas[goalMap]?.[rate] || deltas.maintain.moderate;
  return {
    range: pair.map((delta) => round(maintenance * (1 + delta))).sort((a, b) => a - b),
    maintenance: round(maintenance),
    goal: goalMap,
    rate,
  };
}

export function proteinRange({ weightKg, leanMassKg, goal = 'maintain', resistanceTraining = true } = {}) {
  const weight = finitePositive(weightKg);
  const lean = finitePositive(leanMassKg);
  if (!weight) return null;
  let low = resistanceTraining ? 1.6 : 1.2;
  let high = resistanceTraining ? 2.2 : 1.6;
  if (goal === 'cut') {
    low = 1.8;
    high = 2.4;
  }
  const base = lean && goal === 'cut' ? Math.max(weight * 0.75, lean) : weight;
  return {
    grams: [round(base * low), round(base * high)],
    gPerKg: [low, high],
    basisKg: round(base),
    confidence: 'moderate',
    evidenceIds: ['issn-protein-2017', 'morton-protein-2018', ...(goal === 'cut' ? ['helms-cutting-protein-2014'] : [])],
  };
}

export function macroPlan({ calories, proteinG, fatG } = {}) {
  const kcal = finitePositive(calories);
  const protein = finiteNonNegative(proteinG);
  const fat = finiteNonNegative(fatG);
  if (!kcal || protein == null || fat == null) return null;
  const used = protein * 4 + fat * 9;
  const carbKcal = kcal - used;
  if (carbKcal < 0) return null;
  return {
    calories: round(kcal),
    proteinG: round(protein),
    fatG: round(fat),
    carbsG: round(carbKcal / 4),
    proteinPct: round(protein * 4 / kcal * 100),
    fatPct: round(fat * 9 / kcal * 100),
    carbsPct: round(carbKcal / kcal * 100),
  };
}

export function bmi({ weightKg, heightCm } = {}) {
  const weight = finitePositive(weightKg);
  const height = finitePositive(heightCm);
  if (!weight || !height) return null;
  const meters = height / 100;
  return round(weight / (meters * meters), 1);
}

export function bodyCompositionFromFat({ weightKg, bodyFatPct } = {}) {
  const weight = finitePositive(weightKg);
  const fatPct = Number(bodyFatPct);
  if (!weight || !Number.isFinite(fatPct) || fatPct <= 0 || fatPct >= 70) return null;
  const fatMass = weight * fatPct / 100;
  return {
    fatMassKg: round(fatMass),
    leanMassKg: round(weight - fatMass),
    bodyFatPct: round(fatPct, 1),
  };
}

export function targetWeightAtBodyFat({ weightKg, currentBodyFatPct, targetBodyFatPct } = {}) {
  const composition = bodyCompositionFromFat({ weightKg, bodyFatPct: currentBodyFatPct });
  const target = Number(targetBodyFatPct);
  if (!composition || !Number.isFinite(target) || target <= 0 || target >= 60) return null;
  const theoretical = composition.leanMassKg / (1 - target / 100);
  return {
    targetWeightKg: round(theoretical),
    leanMassAssumptionKg: composition.leanMassKg,
    changeKg: round(theoretical - Number(weightKg)),
    assumption: 'lean-mass-held-constant',
  };
}

export function waistToHeight({ waistCm, heightCm } = {}) {
  const waist = finitePositive(waistCm);
  const height = finitePositive(heightCm);
  return waist && height ? round(waist / height, 3) : null;
}

export function hrMaxTanaka(age) {
  const years = finitePositive(age);
  return years ? round(208 - 0.7 * years) : null;
}

export function heartRateReserveZones({ age, restingHr, zones = [[0.5,0.6],[0.6,0.7],[0.7,0.8],[0.8,0.9],[0.9,1.0]] } = {}) {
  const max = hrMaxTanaka(age);
  const rest = finitePositive(restingHr);
  if (!max || !rest || rest >= max) return null;
  const reserve = max - rest;
  return {
    hrMax: max,
    restingHr: rest,
    zones: zones.map(([low, high], index) => ({
      zone: index + 1,
      low: round(rest + reserve * low),
      high: round(rest + reserve * high),
    })),
    evidenceId: 'tanaka-hrmax-2001',
  };
}

export function paceFromDistanceTime({ distanceKm, timeMinutes } = {}) {
  const distance = finitePositive(distanceKm);
  const minutes = finitePositive(timeMinutes);
  if (!distance || !minutes) return null;
  const pace = minutes / distance;
  return {
    minPerKm: round(pace, 3),
    kmh: round(distance / (minutes / 60), 2),
  };
}

export function riegelPrediction({ knownDistanceKm, knownTimeMinutes, targetDistanceKm, exponent = 1.06 } = {}) {
  const d1 = finitePositive(knownDistanceKm);
  const t1 = finitePositive(knownTimeMinutes);
  const d2 = finitePositive(targetDistanceKm);
  const exp = Number(exponent);
  if (!d1 || !t1 || !d2 || !Number.isFinite(exp) || exp <= 0) return null;
  const predicted = t1 * ((d2 / d1) ** exp);
  return { minutes: round(predicted, 2), exponent: exp, evidenceId: 'riegel-1981' };
}

export function cooperVo2FromDistance(distanceMeters) {
  const distance = finitePositive(distanceMeters);
  if (!distance) return null;
  return {
    vo2max: round((distance - 504.9) / 44.73, 1),
    evidenceId: 'cooper-1968',
    confidence: 'field-estimate',
  };
}

export function rockportVo2({ weightKg, age, sex, timeMinutes, heartRate } = {}) {
  const weight = finitePositive(weightKg);
  const years = finitePositive(age);
  const time = finitePositive(timeMinutes);
  const hr = finitePositive(heartRate);
  if (!weight || !years || !time || !hr || !['male', 'female'].includes(sex)) return null;
  const weightLb = weight * 2.2046226218;
  const male = sex === 'male' ? 1 : 0;
  const vo2 = 132.853 - 0.0769 * weightLb - 0.3877 * years + 6.315 * male - 3.2649 * time - 0.1565 * hr;
  return { vo2max: round(vo2, 1), evidenceId: 'rockport-1987', confidence: 'field-estimate' };
}

export function metCalories({ met, weightKg, minutes } = {}) {
  const metValue = finitePositive(met);
  const weight = finitePositive(weightKg);
  const duration = finitePositive(minutes);
  if (!metValue || !weight || !duration) return null;
  return {
    kcal: round(metValue * 3.5 * weight / 200 * duration),
    evidenceId: 'compendium-2024',
    confidence: 'population-estimate',
  };
}

export function convertUnits(value, from, to) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const key = `${from}->${to}`;
  const conversions = {
    'kg->lb': (x) => x * 2.2046226218,
    'lb->kg': (x) => x / 2.2046226218,
    'cm->in': (x) => x / 2.54,
    'in->cm': (x) => x * 2.54,
    'km->mi': (x) => x * 0.6213711922,
    'mi->km': (x) => x / 0.6213711922,
    'kcal->kj': (x) => x * 4.184,
    'kj->kcal': (x) => x / 4.184,
    'kmh->mph': (x) => x * 0.6213711922,
    'mph->kmh': (x) => x / 0.6213711922,
  };
  const fn = conversions[key];
  return fn ? round(fn(n), 3) : (from === to ? round(n, 3) : null);
}
