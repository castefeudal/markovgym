import { round } from './gym-calculators.mjs';

const n = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const positive = (value) => {
  const parsed = n(value);
  return parsed != null && parsed > 0 ? parsed : null;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function convert(value, from, to) {
  const x = n(value);
  if (x == null) return null;
  const key = `${from}:${to}`;
  const factors = {
    'kg:lb': 2.2046226218, 'lb:kg': 1 / 2.2046226218,
    'cm:in': 1 / 2.54, 'in:cm': 2.54,
    'km:mi': 0.6213711922, 'mi:km': 1 / 0.6213711922,
    'kcal:kj': 4.184, 'kj:kcal': 1 / 4.184,
    'kmh:mph': 0.6213711922, 'mph:kmh': 1 / 0.6213711922,
  };
  if (from === to) return round(x, 4);
  return factors[key] ? round(x * factors[key], 4) : null;
}

export function bmi({ weightKg, heightCm } = {}) {
  const w = positive(weightKg);
  const h = positive(heightCm);
  if (!w || !h) return null;
  const value = w / ((h / 100) ** 2);
  return { value: round(value, 1), category: value < 18.5 ? 'under' : value < 25 ? 'reference' : value < 30 ? 'above' : 'high' };
}

export function waistToHeight({ waistCm, heightCm } = {}) {
  const waist = positive(waistCm);
  const height = positive(heightCm);
  if (!waist || !height) return null;
  return { ratio: round(waist / height, 3) };
}

export function bodyComposition({ weightKg, bodyFatPercent, heightCm } = {}) {
  const weight = positive(weightKg);
  const bf = n(bodyFatPercent);
  const height = positive(heightCm);
  if (!weight || bf == null || bf <= 0 || bf >= 70) return null;
  const fatMass = weight * bf / 100;
  const leanMass = weight - fatMass;
  const ffmi = height ? leanMass / ((height / 100) ** 2) : null;
  const normalizedFfmi = ffmi && height ? ffmi + 6.1 * (1.8 - height / 100) : null;
  return {
    fatMassKg: round(fatMass, 1),
    leanMassKg: round(leanMass, 1),
    ffmi: ffmi ? round(ffmi, 1) : null,
    normalizedFfmi: normalizedFfmi ? round(normalizedFfmi, 1) : null,
  };
}

export function targetWeightAtBodyFat({ weightKg, bodyFatPercent, targetBodyFatPercent } = {}) {
  const current = bodyComposition({ weightKg, bodyFatPercent });
  const target = n(targetBodyFatPercent);
  if (!current || target == null || target <= 2 || target >= 60) return null;
  return { targetWeightKg: round(current.leanMassKg / (1 - target / 100), 1), assumedLeanMassKg: current.leanMassKg };
}

export function bmr({ sex, weightKg, heightCm, age, bodyFatPercent } = {}) {
  const weight = positive(weightKg);
  const height = positive(heightCm);
  const years = positive(age);
  if (!weight || !height || !years) return null;
  const sexOffset = sex === 'female' ? -161 : sex === 'male' ? 5 : null;
  if (sexOffset == null) return null;
  const mifflin = 10 * weight + 6.25 * height - 5 * years + sexOffset;
  let katch = null;
  const bf = n(bodyFatPercent);
  if (bf != null && bf > 0 && bf < 70) {
    const lean = weight * (1 - bf / 100);
    katch = 370 + 21.6 * lean;
  }
  const models = [mifflin, katch].filter(Number.isFinite);
  return {
    mifflin: round(mifflin),
    katch: katch == null ? null : round(katch),
    range: [round(Math.min(...models)), round(Math.max(...models))],
    central: round(models.reduce((a,b)=>a+b,0)/models.length),
  };
}

export function tdee({ bmrKcal, activityFactor = 1.4 } = {}) {
  const base = positive(bmrKcal);
  const factor = n(activityFactor);
  if (!base || factor == null || factor < 1 || factor > 2.5) return null;
  const central = base * factor;
  return { central: round(central), range: [round(central * 0.9), round(central * 1.1)] };
}

export function goalCalories({ maintenanceKcal, goal = 'maintain', weeklyRatePercent = 0.5, weightKg } = {}) {
  const maintenance = positive(maintenanceKcal);
  const weight = positive(weightKg);
  if (!maintenance || !weight) return null;
  if (goal === 'maintain') return { target: round(maintenance), delta: 0 };
  const rate = clamp(positive(weeklyRatePercent) || 0.5, 0.1, 1.5) / 100;
  const dailyDelta = weight * rate * 7700 / 7;
  const signed = goal === 'gain' ? dailyDelta : -dailyDelta;
  return { target: round(Math.max(900, maintenance + signed)), delta: round(signed), ratePercent: round(rate * 100, 2) };
}

export function proteinTarget({ weightKg, goal = 'maintain', leanMassKg = null } = {}) {
  const weight = positive(weightKg);
  const lean = positive(leanMassKg);
  if (!weight) return null;
  const basis = lean || weight;
  const low = goal === 'loss' ? 2.0 : 1.6;
  const high = goal === 'loss' ? 2.4 : 2.2;
  return { lowGrams: round(basis * low), highGrams: round(basis * high), basis: lean ? 'lean-mass' : 'body-weight' };
}

export function macroPlan({ calories, proteinGrams, fatGrams } = {}) {
  const kcal = positive(calories);
  const protein = positive(proteinGrams);
  const fat = positive(fatGrams);
  if (!kcal || !protein || !fat) return null;
  const used = protein * 4 + fat * 9;
  if (used >= kcal) return null;
  return { proteinGrams: round(protein), fatGrams: round(fat), carbsGrams: round((kcal - used) / 4), calories: round(kcal) };
}

export function fiberTarget({ calories } = {}) {
  const kcal = positive(calories);
  if (!kcal) return null;
  return { grams: round(kcal / 1000 * 14, 1) };
}

export function heartRateZones({ maxHr, restingHr = null } = {}) {
  const max = positive(maxHr);
  const rest = positive(restingHr);
  if (!max || max < 100 || max > 240) return null;
  const bands = [[0.5,0.6],[0.6,0.7],[0.7,0.8],[0.8,0.9],[0.9,1]];
  return bands.map(([lo, hi], index) => {
    const calc = (p) => rest ? rest + (max - rest) * p : max * p;
    return { zone: index + 1, low: Math.round(calc(lo)), high: Math.round(calc(hi)), method: rest ? 'HRR' : '%HRmax' };
  });
}

export function paceFromDistanceTime({ distanceKm, minutes } = {}) {
  const d = positive(distanceKm);
  const m = positive(minutes);
  if (!d || !m) return null;
  const pace = m / d;
  const totalSeconds = Math.round(pace * 60);
  const whole = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return { minPerKm: round(pace, 3), display: `${whole}:${String(seconds).padStart(2,'0')}`, speedKmh: round(d / (m / 60), 2) };
}

export function riegelPredict({ distance1Km, time1Minutes, distance2Km, exponent = 1.06 } = {}) {
  const d1 = positive(distance1Km), t1 = positive(time1Minutes), d2 = positive(distance2Km), exp = positive(exponent);
  if (!d1 || !t1 || !d2 || !exp) return null;
  return { predictedMinutes: round(t1 * (d2 / d1) ** exp, 2), exponent: exp };
}

export function adaptiveExpenditure({ days = [] } = {}) {
  const valid = days.filter((d) => Number.isFinite(Number(d?.calories)) && Number(d.calories) > 0 && Number.isFinite(Number(d?.weightKg)) && Number(d.weightKg) > 0);
  if (valid.length < 7) return { status: 'insufficient', completeDays: valid.length };
  const sorted = [...valid].sort((a,b) => new Date(a.date || 0) - new Date(b.date || 0));
  const avgIntake = sorted.reduce((s,d)=>s+Number(d.calories),0)/sorted.length;
  const edgeWindow = Math.min(3, Math.max(1, Math.floor(sorted.length / 4)));
  const startSlice = sorted.slice(0, edgeWindow);
  const endSlice = sorted.slice(-edgeWindow);
  const meanWeight = (rows) => rows.reduce((sum, row) => sum + Number(row.weightKg), 0) / rows.length;
  const meanTime = (rows) => rows.reduce((sum, row) => sum + new Date(row.date || 0).getTime(), 0) / rows.length;
  const startWeight = meanWeight(startSlice);
  const endWeight = meanWeight(endSlice);
  const span = Math.max(1, (meanTime(endSlice) - meanTime(startSlice)) / 86400000);
  const deltaKg = endWeight - startWeight;
  const dailyBalance = deltaKg * 7700 / span;
  const expenditure = avgIntake - dailyBalance;
  const coverage = clamp(sorted.length / Math.max(7, Math.round(span) + 1), 0, 1);
  const uncertainty = expenditure * (coverage >= .85 && sorted.length >= 14 ? .06 : .1);
  return {
    status: 'ok',
    central: round(expenditure),
    range: [round(expenditure - uncertainty), round(expenditure + uncertainty)],
    completeDays: sorted.length,
    coverage: round(coverage * 100),
    confidence: coverage >= .85 && sorted.length >= 14 ? 'moderate' : 'low',
    averageIntake: round(avgIntake),
    weightChangeKg: round(deltaKg, 2),
    smoothing: `${edgeWindow}-day edge mean`,
  };
}
