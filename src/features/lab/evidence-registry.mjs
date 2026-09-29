const make = (id, title, formula, version, evidenceLevel, limitations, references = []) => ({
  id, title, formula, version, evidenceLevel, limitations, references, lastReviewed: '2026-09-30',
});

const REGISTRY = Object.freeze({
  'estimated-1rm': make('estimated-1rm', 'Submaximal 1RM estimates', 'Epley and Brzycki estimates are shown separately and summarized as a range.', '1.0', 'Published prediction equations', 'An estimate from a submaximal set, not a measured maximum. Prediction error increases with more repetitions, different exercises, technique changes, and effort that is not close to failure.', [
    { title: 'Brzycki, 1993. Strength Testing—Predicting a One-Rep Max from Reps-to-Fatigue', organisation: 'Journal of Physical Education, Recreation & Dance', year: 1993, url: 'https://doi.org/10.1080/07303084.1993.10606684', kind: 'Original equation reference' },
    { title: 'Epley, 1985. Poundage Chart', organisation: 'Boyd Epley Workout, Body Enterprises', year: 1985, url: 'https://www.1rmcalculator.org/formulas/epley', kind: 'Bibliographic record; equation attribution is less formally documented' },
  ]),
  'load-percentage': make('load-percentage', 'Load as a percentage of a supplied 1RM estimate', 'Input load = 1RM estimate × percentage; rounded to the selected increment.', '1.0', 'Transparent arithmetic', 'The result inherits any error in the 1RM estimate and equipment increment. It does not predict an individual repetition maximum.'),
  'plate-loading': make('plate-loading', 'Plate loading', 'Enumerate available plate pairs to find an exact or nearest total load.', '1.0', 'Deterministic equipment arithmetic', 'Assumes the entered bar, collars, plate inventory, and bilateral loading are correct.'),
  'warmup-ramp': make('warmup-ramp', 'Warm-up ramp template', 'A product-defined ramp of lighter sets before a supplied working load.', '1.0', 'Practical template; not a validated prescription', 'The template is optional and should be adjusted to the lift, person, environment, and how the warm-up feels. It is not included in working-set volume.'),
  'workout-volume': make('workout-volume', 'Logged volume load', 'Sum of completed working-set load × repetitions in the selected records.', '1.0', 'User-data aggregation', 'Not a universal measure of training stimulus. Excludes warm-up and unsupported load semantics; compare like-for-like records.'),
  'weekly-muscle-sets': make('weekly-muscle-sets', 'Weekly sets by target muscle', 'Count completed working sets using the exercise target-muscle metadata.', '1.0', 'User-data aggregation', 'A set count does not measure effort, range of motion, or stimulus. Muscle labels inherit the limits of the exercise metadata.'),
  'resting-energy-estimates': make('resting-energy-estimates', 'Resting energy equations', 'Mifflin–St Jeor; optional Katch–McArdle lean-mass equation; an activity-factor planning range.', '1.0', 'Published prediction equations plus a planning assumption', 'These equations predict a population estimate and do not measure energy expenditure. Activity factors add uncertainty; body-fat input error affects the lean-mass equation.', [
    { title: 'Mifflin et al., 1990. A new predictive equation for resting energy expenditure in healthy individuals', organisation: 'The American Journal of Clinical Nutrition', year: 1990, url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/', kind: 'Derivation study' },
    { title: 'Katch–McArdle equation as reported in a comparison of predictive equations', organisation: 'Predictive Equations Overestimate Resting Metabolic Rate in Chronic Stroke Survivors', year: 2022, url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9246861/', kind: 'Secondary equation listing; not the original derivation' },
  ]),
  'goal-calories': make('goal-calories', 'Goal-calorie planning estimate', 'Convert a selected weekly weight-change rate to a daily energy difference using a fixed energy-per-mass approximation.', '1.0', 'Heuristic planning model', 'The fixed energy-per-mass factor is a simplification. Real weight change is dynamic and this output is not a measured expenditure or guaranteed rate.'),
  'protein-range': make('protein-range', 'Protein planning range', 'A broad application-defined range scaled to body mass or supplied lean mass.', '1.0', 'Planning range informed by research; not an individualized prescription', 'The displayed range is a starting reference. The cited meta-analysis studied healthy adults doing resistance training and does not validate every value or user group.', [
    { title: 'Morton et al., 2018. Protein supplementation and resistance-training gains: systematic review and meta-analysis', organisation: 'British Journal of Sports Medicine', year: 2018, url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/', kind: 'Systematic review and meta-analysis' },
  ]),
  'macro-arithmetic': make('macro-arithmetic', 'Macronutrient energy arithmetic', 'Carbohydrate grams are calculated from the remaining calorie budget after protein and fat inputs.', '1.0', 'Transparent arithmetic', 'This only partitions entered calories; it does not judge diet quality, adequacy, or suitability.'),
  'fiber-reference': make('fiber-reference', 'Fiber planning reference', '14 g per 1,000 kcal.', '1.0', 'Dietary reference value', 'A general reference, not an individualized target; tolerance and clinical needs vary.', [
    { title: 'Dietary Reference Intakes: Water, Potassium, Sodium, Chloride, and Sulfate', organisation: 'Institute of Medicine / National Academies', year: 2005, url: 'https://www.nationalacademies.org/read/10925/chapter/8', kind: 'Dietary reference report' },
  ]),
  'bmi-screening': make('bmi-screening', 'BMI and waist-to-height arithmetic', 'BMI = mass / height²; waist-to-height = waist / height.', '1.0', 'Screening measures, not diagnosis', 'BMI does not directly measure body fat and can misrepresent individuals. The waist-to-height result is shown as a ratio without a risk category.', [
    { title: 'Adult BMI Categories', organisation: 'US Centers for Disease Control and Prevention', year: 2024, url: 'https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html', kind: 'Official screening guidance' },
  ]),
  'body-composition-arithmetic': make('body-composition-arithmetic', 'Body-composition arithmetic', 'Fat mass and lean mass are calculated from supplied body mass and body-fat percentage; FFMI divides lean mass by height².', '1.0', 'Derived estimate', 'Accuracy depends on the entered body-fat estimate. Normalized FFMI is a mathematical transformation, not a health or performance classification.'),
  'target-body-fat-projection': make('target-body-fat-projection', 'Target body-fat projection', 'Project weight while holding calculated lean mass constant.', '1.0', 'Conditional arithmetic projection', 'The assumption that lean mass stays constant may not hold. This is not a forecast or promised outcome.'),
  'heart-rate-zones': make('heart-rate-zones', 'Heart-rate reserve zones', 'When resting heart rate is supplied, apply selected fractions to heart-rate reserve and add resting heart rate; otherwise use fractions of supplied maximum heart rate.', '1.0', 'Exercise-intensity model', 'The result depends on the supplied maximum and resting rates and the selected bands. It is not a measured threshold or medical exercise prescription.', [
    { title: 'Karvonen, Kentala & Mustala, 1957. The effects of training on heart rate; a longitudinal study', organisation: 'Annales Medicinae Experimentalis et Biologiae Fenniae', year: 1957, url: 'https://pubmed.ncbi.nlm.nih.gov/13470504/', kind: 'Original heart-rate training study' },
  ]),
  'pace-conversion': make('pace-conversion', 'Pace and speed conversion', 'Elapsed time divided by distance; speed is distance divided by elapsed time.', '1.0', 'Dimensional arithmetic', 'The conversion does not account for terrain, conditions, or measurement error.'),
  'riegel-prediction': make('riegel-prediction', 'Riegel time-distance extrapolation', 'T₂ = T₁ × (D₂ / D₁)^1.06.', '1.0', 'Published performance model', 'An extrapolation from one performance. It may not transfer across event type, terrain, weather, training, or substantially different durations.', [
    { title: 'Riegel, 1981. Athletic Records and Human Endurance', organisation: 'American Scientist', year: 1981, url: 'https://pubmed.ncbi.nlm.nih.gov/7235349/', kind: 'Original model publication' },
  ]),
  'unit-conversion': make('unit-conversion', 'Unit conversions', 'Apply fixed factors for the supported mass, length, energy, and speed units.', '1.0', 'Deterministic unit arithmetic', 'Values are rounded for display; unit labels remain part of the result.'),
  'adaptive-expenditure': make('adaptive-expenditure', 'Logged intake and weight trend estimate', 'Mean logged intake adjusted by weight change across the observed period using an explicit fixed energy-per-mass approximation and edge-window means.', '1.0', 'Transparent product model; not a published proprietary algorithm', 'Requires paired daily intake and weight entries. Sparse or inconsistent logging can dominate the result; range and coverage are shown as uncertainty context.'),
  'personal-data-summary': make('personal-data-summary', 'Local-data coverage summary', 'Counts available local records without deriving a physiological score.', '1.0', 'Descriptive aggregation', 'Record counts describe data coverage only.'),
  'training-plan': make('training-plan', 'Training-plan arithmetic and recorded signals', 'Summarize the selected plan and its recorded inputs; no readiness score is calculated.', '1.0', 'Descriptive product logic', 'The summary is not a medical judgement or a validated prediction.'),
});

const CALCULATOR_EVIDENCE = Object.freeze({
  'lab-e1rm': 'estimated-1rm', 'lab-percent': 'load-percentage', 'lab-plates': 'plate-loading', 'lab-warmup': 'warmup-ramp',
  'lab-volume': 'workout-volume', 'lab-muscles': 'weekly-muscle-sets', 'lab-bmr': 'resting-energy-estimates',
  'lab-goal': 'goal-calories', 'lab-protein': 'protein-range', 'lab-macros': 'macro-arithmetic', 'lab-fiber': 'fiber-reference',
  'lab-bmi': 'bmi-screening', 'lab-ffmi': 'body-composition-arithmetic', 'lab-target-bf': 'target-body-fat-projection',
  'lab-hr': 'heart-rate-zones', 'lab-pace': 'pace-conversion', 'lab-riegel': 'riegel-prediction', 'lab-convert': 'unit-conversion',
  'lab-adaptive': 'adaptive-expenditure', 'lab-personal-summary': 'personal-data-summary', 'lab-planning': 'training-plan',
});

const RU_COPY = Object.freeze({
  'estimated-1rm': ['Оценка одноповторного максимума', 'Опирается на субмаксимальный подход, а не измеренный максимум. Погрешность выше при большом числе повторов, другом упражнении, изменении техники и далёком от отказа усилии.'],
  'load-percentage': ['Вес по проценту оценочного 1RM', 'Результат наследует погрешность оценки 1RM и шага оборудования; это не персонально измеренный максимум повторений.'],
  'plate-loading': ['Расчёт блинов', 'Расчёт предполагает верно указанные гриф, замки, инвентарь блинов и симметричную загрузку.'],
  'warmup-ramp': ['Шаблон разминочной серии', 'Необязательный шаблон следует подстроить под упражнение, человека, условия и ощущения. Разминочные подходы не входят в рабочий объём.'],
  'workout-volume': ['Записанный тоннаж', 'Не является универсальной мерой тренировочного стимула. Разминочные подходы и неподдерживаемые типы нагрузки исключены; сравнивай сопоставимые записи.'],
  'weekly-muscle-sets': ['Рабочие подходы по мышцам за неделю', 'Число подходов не отражает усилие, амплитуду или тренировочный стимул и зависит от разметки упражнений.'],
  'resting-energy-estimates': ['Формулы основного обмена', 'Это популяционные оценки, а не измерение расхода. Коэффициент активности добавляет неопределённость; ошибка процента жира влияет на модель безжировой массы.'],
  'goal-calories': ['Плановый ориентир калорий', 'Фиксированный пересчёт энергии в изменение массы упрощён: реальная динамика веса нелинейна, результат не гарантирует темп.'],
  'protein-range': ['Диапазон белка', 'Широкий ориентир приложения, а не индивидуальное назначение. Указанный метаанализ изучал здоровых взрослых с силовыми тренировками и не подтверждает все значения для всех групп.'],
  'macro-arithmetic': ['Расчёт энергии макронутриентов', 'Расчёт распределяет введённую калорийность и не оценивает качество, достаточность или индивидуальную применимость рациона.'],
  'fiber-reference': ['Справочный ориентир клетчатки', 'Общий ориентир, а не персональная цель; переносимость и клинические потребности различаются.'],
  'bmi-screening': ['ИМТ и отношение талии к росту', 'ИМТ не измеряет жир напрямую и может неверно характеризовать отдельных людей. Отношение талии к росту показано без категории риска.'],
  'body-composition-arithmetic': ['Расчёт состава тела', 'Точность зависит от введённой оценки процента жира. Нормализованный FFMI — математическое преобразование, а не оценка здоровья или спортивного результата.'],
  'target-body-fat-projection': ['Проекция веса при целевом проценте жира', 'Предполагается неизменная безжировая масса. Это условная математика, а не прогноз или обещание результата.'],
  'heart-rate-zones': ['Зоны пульса по резерву ЧСС', 'Результат зависит от введённых максимального и пульса покоя и выбранных долей. Это не измеренный порог и не медицинское назначение нагрузки.'],
  'pace-conversion': ['Пересчёт темпа и скорости', 'Не учитывает рельеф, условия и погрешность измерения дистанции.'],
  'riegel-prediction': ['Экстраполяция результата Riegel', 'Экстраполяция одного результата; применимость ограничена типом события, рельефом, погодой, подготовкой и различиями длительности.'],
  'unit-conversion': ['Перевод единиц', 'Значения округляются для показа; единицы остаются частью результата.'],
  'adaptive-expenditure': ['Оценка расхода по записям питания и веса', 'Нужны записи калорий и веса за одни и те же дни. Редкие или непоследовательные записи могут сильно сместить оценку; покрытие и диапазон показывают неопределённость.'],
  'personal-data-summary': ['Сводка локальных данных', 'Количество записей описывает только полноту данных.'],
  'training-plan': ['Арифметика плана и записанные сигналы', 'Сводка не является медицинским суждением или валидированным прогнозом.'],
});
const RU_LEVELS = Object.freeze({
  'Published prediction equations': 'Опубликованные прогнозные формулы',
  'Transparent arithmetic': 'Прозрачная арифметика',
  'Deterministic equipment arithmetic': 'Детерминированный расчёт оборудования',
  'Practical template; not a validated prescription': 'Практический шаблон, не валидированное назначение',
  'User-data aggregation': 'Сводка пользовательских данных',
  'Published prediction equations plus a planning assumption': 'Опубликованные прогнозные формулы и допущение планирования',
  'Heuristic planning model': 'Эвристическая модель планирования',
  'Planning range informed by research; not an individualized prescription': 'Диапазон планирования с учётом исследований, не индивидуальное назначение',
  'Dietary reference value': 'Нормативный справочный ориентир питания',
  'Screening measures, not diagnosis': 'Скрининговые показатели, не диагноз',
  'Derived estimate': 'Расчётная оценка',
  'Conditional arithmetic projection': 'Условная арифметическая проекция',
  'Exercise-intensity model': 'Модель интенсивности нагрузки',
  'Dimensional arithmetic': 'Пересчёт физических величин',
  'Published performance model': 'Опубликованная модель спортивного результата',
  'Deterministic unit arithmetic': 'Детерминированный перевод единиц',
  'Transparent product model; not a published proprietary algorithm': 'Прозрачная модель приложения, не опубликованный proprietary-алгоритм',
  'Descriptive aggregation': 'Описательная сводка',
  'Descriptive product logic': 'Описательная логика приложения',
});

export function loadLabEvidenceRegistry() {
  return Object.freeze({ ...REGISTRY });
}

export function getLabEvidence(id) {
  const entry = REGISTRY[id];
  if (!entry || entry.id !== id || !entry.title || !entry.formula || !entry.version || !entry.evidenceLevel || !entry.limitations) return null;
  return entry;
}

export function getLocalizedLabEvidence(id, language = 'ru') {
  const entry = getLabEvidence(id);
  if (!entry) return null;
  const ru = RU_COPY[id];
  if (language !== 'ru' || !ru) return entry;
  return { ...entry, title: ru[0], evidenceLevel: RU_LEVELS[entry.evidenceLevel] || entry.evidenceLevel, limitations: ru[1] };
}

export function getCalculatorEvidenceId(cardId) {
  return CALCULATOR_EVIDENCE[cardId] || null;
}

export function validateCalculatorEvidenceMap(cardIds) {
  return cardIds.every((cardId) => Boolean(getCalculatorEvidenceId(cardId) && getLabEvidence(getCalculatorEvidenceId(cardId))))
    && Object.keys(CALCULATOR_EVIDENCE).every((cardId) => cardIds.includes(cardId));
}
