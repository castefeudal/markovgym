import {
  calculatePlates,
  estimateOneRepMax,
  sessionVolume,
  warmupRamp,
  weeklyMuscleSets,
} from './tools/gym-calculators.mjs';
import {
  adaptiveExpenditure,
  bmi,
  bmr,
  bodyComposition,
  convert,
  fiberTarget,
  goalCalories,
  heartRateZones,
  macroPlan,
  paceFromDistanceTime,
  proteinTarget,
  riegelPredict,
  targetWeightAtBodyFat,
  tdee,
  waistToHeight,
} from './tools/lab-calculators.mjs';
import { joinNutritionAndMeasurements } from './src/features/nutrition/nutrition-analytics.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const en = () => document.documentElement.lang === 'en';
const t = (ru, english) => en() ? english : ru;
const num = (value, digits = 2) => Number(value).toLocaleString(en() ? 'en-US' : 'ru-RU', { maximumFractionDigits: digits });
const q = (selector, root = section) => root?.querySelector(selector);
const qa = (selector, root = section) => [...(root?.querySelectorAll(selector) || [])];
const value = (id) => q('#' + id)?.value;
const defaultPairs = { 25: 2, 20: 2, 15: 2, 10: 4, 5: 4, 2.5: 4, 1.25: 4 };

let section;
let lastWarmupSets = [];
let category = 'strength';
let search = '';
let lastLanguage = document.documentElement.lang;

const categories = [
  ['strength', 'Сила', 'Strength'],
  ['training', 'Тренировки', 'Training'],
  ['nutrition', 'Питание', 'Nutrition'],
  ['body', 'Состав тела', 'Body composition'],
  ['cardio', 'Кардио', 'Cardio'],
  ['planning', 'Планирование', 'Planning'],
  ['converters', 'Конвертеры', 'Converters'],
  ['personal', 'Мои данные', 'My data'],
];

function field(id, label, initial, attrs = '', type = 'input') {
  if (type === 'select') return `<label class="field" for="${id}"><span>${label}</span><select class="select" id="${id}">${initial}</select></label>`;
  return `<label class="field" for="${id}"><span>${label}</span><input class="input" id="${id}" value="${initial}" ${attrs}></label>`;
}

function card({ id, cat, kicker, title, description, form = '', body = '', keywords = '' }) {
  return `<article class="lab-card" data-lab-card data-category="${cat}" data-search="${esc((title + ' ' + description + ' ' + keywords).toLowerCase())}">
    <p class="eyebrow">${kicker}</p>
    <h2>${title}</h2>
    <p class="tiny">${description}</p>
    ${form}
    ${body}
    <div class="lab-result" id="${id}-out" aria-live="polite"></div>
  </article>`;
}

function result(out, main, { range = '', confidence = '', meaning = '', action = '', details = '' } = {}) {
  if (!out) return;
  out.innerHTML = `<strong>${main}</strong>
    <div class="lab-result-meta">
      ${range ? `<span class="lab-pill">${range}</span>` : ''}
      ${confidence ? `<span class="lab-pill">${confidence}</span>` : ''}
    </div>
    ${meaning ? `<p class="small">${meaning}</p>` : ''}
    ${action ? `<p class="tiny"><b>${t('Что делать:', 'Next:')}</b> ${action}</p>` : ''}
    ${details ? `<details class="lab-details"><summary>${t('Метод, допущения и ограничения', 'Method, assumptions and limits')}</summary><div class="tiny">${details}</div></details>` : ''}`;
}

function renderShell() {
  if (!section) return;
  section.innerHTML = `<div class="container lab-shell">
    <div class="lab-hero">
      <div><p class="eyebrow">MARKOV MADE LAB</p><h1 id="gym-tools-title">${t('Расчёты, которые ведут к решению', 'Calculations that lead to a decision')}</h1><p class="lede">${t('Сила, нагрузка, питание, состав тела и кардио — с диапазонами, ограничениями и использованием локальных данных.', 'Strength, load, nutrition, body composition and cardio — with ranges, limitations and local-data integration.')}</p></div>
      <label class="field lab-search" for="lab-search"><span>${t('Поиск по Lab', 'Search Lab')}</span><input class="input" id="lab-search" type="search" placeholder="${t('e1RM, белок, темп…', 'e1RM, protein, pace…')}"></label>
    </div>
    <div class="lab-layout">
      <aside class="lab-sidebar" aria-label="${t('Категории Lab', 'Lab categories')}">
        ${categories.map(([id, ru, english]) => `<button class="lab-cat" type="button" data-lab-category="${id}" aria-pressed="${id === category}">${en() ? english : ru}</button>`).join('')}
      </aside>
      <div class="lab-main">
        <div class="lab-grid" id="lab-grid">
          ${renderCards()}
        </div>
        <div class="lab-empty" id="lab-empty" hidden>${t('Ничего не найдено. Измени категорию или поисковый запрос.', 'Nothing found. Change the category or search query.')}</div>
      </div>
    </div>
  </div>`;
  bind();
  calculateAll();
  filterCards();
}

function renderCards() {
  const strength = [
    card({
      id: 'lab-e1rm', cat: 'strength', kicker: 'e1RM', title: t('Оценка одноповторного максимума', 'Estimated one-rep max'),
      description: t('Epley + Brzycki: показываем обе модели, центральную оценку и диапазон.', 'Epley + Brzycki: both models, central estimate and range.'),
      keywords: 'one rep max 1rm сила',
      form: `<form class="lab-form" data-lab-form="e1rm">${field('e1rm-weight', t('Вес', 'Weight'), 100, 'type="number" min=".1" step=".5" required')}${field('e1rm-reps', t('Повторы', 'Reps'), 5, 'type="number" min="1" max="30" step="1" required')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
    card({
      id: 'lab-percent', cat: 'strength', kicker: '%1RM', title: t('Нагрузка по проценту', 'Load by percentage'),
      description: t('Переводи e1RM в рабочий вес с заданным шагом округления.', 'Turn e1RM into a working load with a chosen increment.'),
      form: `<form class="lab-form" data-lab-form="percent">${field('pct-rm', 'e1RM', 120, 'type="number" min=".1" step=".5"')}${field('pct-value', t('Процент', 'Percent'), 80, 'type="number" min="1" max="100" step="1"')}${field('pct-step', t('Шаг веса', 'Load step'), 2.5, 'type="number" min=".1" step=".1"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
    card({
      id: 'lab-plates', cat: 'strength', kicker: 'PLATES', title: t('Plate Calculator PRO', 'Plate Calculator PRO'),
      description: t('Ближайший достижимый вес с учётом грифа, замков и доступных пар.', 'Closest achievable load with bar, collars and available pairs.'),
      form: `<form class="lab-form" data-lab-form="plates">${field('plates-target', t('Общий вес', 'Target total'), 100, 'type="number" min=".1" step=".5"')}${field('plates-bar', t('Гриф', 'Bar'), 20, 'type="number" min=".1" step=".5"')}${field('plates-collars', t('Замки', 'Collars'), 0, 'type="number" min="0" step=".5"')}<div class="field" style="grid-column:1/-1"><span>${t('Пары блинов', 'Plate pairs')}</span><div class="plate-options">${Object.entries(defaultPairs).map(([plate,count]) => field('pair-' + plate.replace('.','-'), plate + ' kg', count, 'type="number" min="0" max="20" step="1"')).join('')}</div></div><button class="btn btn-primary" type="submit">${t('Подобрать', 'Find plates')}</button></form>`,
    }),
    card({
      id: 'lab-warmup', cat: 'strength', kicker: 'WARM-UP', title: t('Разминочный ramp', 'Warm-up ramp'),
      description: t('Редактируемый шаблон разогрева перед рабочим весом.', 'Editable warm-up template before the working load.'),
      form: `<form class="lab-form" data-lab-form="warmup">${field('warm-working', t('Рабочий вес', 'Working load'), 100, 'type="number" min=".1" step=".5"')}${field('warm-bar', t('Минимальный вес', 'Minimum load'), 20, 'type="number" min=".1" step=".5"')}${field('warm-step', t('Шаг', 'Increment'), 2.5, 'type="number" min=".1" step=".1"')}<button class="btn btn-primary" type="submit">${t('Собрать', 'Build')}</button></form>`,
    }),
  ].join('');

  const training = [
    card({
      id: 'lab-volume', cat: 'training', kicker: 'MY HISTORY', title: t('Тренировочный объём', 'Training volume'),
      description: t('Берём завершённые подходы из локальной истории. Тоннаж полезнее сравнивать внутри одного упражнения.', 'Uses completed sets from local history. Volume load is most useful within the same exercise.'),
      body: '<div class="lab-kpis" id="lab-volume-kpis"></div>',
    }),
    card({
      id: 'lab-muscles', cat: 'training', kicker: 'WEEKLY SETS', title: t('Подходы по мышцам', 'Sets by muscle'),
      description: t('Сумма завершённых подходов по сохранённым тренировкам.', 'Completed sets grouped by recorded target muscle.'),
      body: '<div id="lab-muscle-list"></div>',
    }),
  ].join('');

  const nutrition = [
    card({
      id: 'lab-bmr', cat: 'nutrition', kicker: 'ENERGY', title: 'BMR / TDEE',
      description: t('Mifflin–St Jeor; при наличии процента жира дополнительно Katch–McArdle. TDEE показывается диапазоном.', 'Mifflin–St Jeor; with body-fat input, Katch–McArdle is also shown. TDEE is a range.'),
      form: `<form class="lab-form" data-lab-form="bmr">${field('bmr-sex', t('Пол для формулы', 'Sex for formula'), '<option value="male">'+t('Мужской','Male')+'</option><option value="female">'+t('Женский','Female')+'</option>', '', 'select')}${field('bmr-age', t('Возраст', 'Age'), 30, 'type="number" min="14" max="100"')}${field('bmr-weight', t('Вес, кг', 'Weight, kg'), 80, 'type="number" min="30" max="350" step=".1"')}${field('bmr-height', t('Рост, см', 'Height, cm'), 180, 'type="number" min="120" max="230" step=".1"')}${field('bmr-bf', t('Жир %, опционально', 'Body fat %, optional'), '', 'type="number" min="3" max="60" step=".1"')}${field('bmr-af', t('Коэффициент активности', 'Activity factor'), 1.5, 'type="number" min="1" max="2.5" step=".05"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
    card({
      id: 'lab-goal', cat: 'nutrition', kicker: 'TARGET', title: t('Целевые калории', 'Goal calories'),
      description: t('Rate-based ориентир для поддержания, снижения или набора массы.', 'Rate-based planning for maintenance, loss or gain.'),
      form: `<form class="lab-form" data-lab-form="goal">${field('goal-maint', t('Поддержание, ккал', 'Maintenance, kcal'), 2800, 'type="number" min="900" max="8000"')}${field('goal-weight', t('Вес, кг', 'Weight, kg'), 80, 'type="number" min="30" max="350" step=".1"')}${field('goal-type', t('Цель', 'Goal'), '<option value="maintain">'+t('Поддержание','Maintain')+'</option><option value="loss">'+t('Снижение','Loss')+'</option><option value="gain">'+t('Набор','Gain')+'</option>', '', 'select')}${field('goal-rate', t('% массы/неделю', '% body weight/week'), .5, 'type="number" min=".1" max="1.5" step=".1"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
    card({
      id: 'lab-protein', cat: 'nutrition', kicker: 'PROTEIN', title: t('Белковый диапазон', 'Protein range'),
      description: t('Рабочий диапазон, а не одна «идеальная» цифра.', 'A practical range rather than one “perfect” number.'),
      form: `<form class="lab-form" data-lab-form="protein">${field('protein-weight', t('Вес, кг', 'Weight, kg'), 80, 'type="number" min="30" max="350" step=".1"')}${field('protein-lean', t('Безжировая масса, кг', 'Lean mass, kg'), '', 'type="number" min="20" max="250" step=".1"')}${field('protein-goal', t('Цель', 'Goal'), '<option value="maintain">'+t('Поддержание/набор','Maintain/gain')+'</option><option value="loss">'+t('Дефицит','Deficit')+'</option>', '', 'select')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
    card({
      id: 'lab-macros', cat: 'nutrition', kicker: 'MACROS', title: t('План макросов', 'Macro planner'),
      description: t('Белок и жир задаются явно; углеводы занимают оставшуюся энергию.', 'Protein and fat are explicit; carbohydrates fill remaining energy.'),
      form: `<form class="lab-form" data-lab-form="macros">${field('macro-kcal', t('Калории', 'Calories'), 2600, 'type="number" min="900" max="8000"')}${field('macro-protein', t('Белок, г', 'Protein, g'), 180, 'type="number" min="20" max="500"')}${field('macro-fat', t('Жиры, г', 'Fat, g'), 70, 'type="number" min="20" max="300"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
    card({
      id: 'lab-fiber', cat: 'nutrition', kicker: 'FIBER', title: t('Клетчатка', 'Fiber'),
      description: t('Ориентир на основе энергопотребления, не индивидуальное медицинское назначение.', 'Energy-based planning reference, not an individual medical prescription.'),
      form: `<form class="lab-form" data-lab-form="fiber">${field('fiber-kcal', t('Калории', 'Calories'), 2500, 'type="number" min="900" max="8000"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
  ].join('');

  const body = [
    card({
      id: 'lab-bmi', cat: 'body', kicker: 'SCREENING', title: 'BMI + waist/height',
      description: t('Скрининговые показатели с явным предупреждением: они не измеряют состав тела напрямую.', 'Screening metrics with an explicit limitation: they do not directly measure body composition.'),
      form: `<form class="lab-form" data-lab-form="bmi">${field('body-weight', t('Вес, кг', 'Weight, kg'), 80, 'type="number" min="30" max="350" step=".1"')}${field('body-height', t('Рост, см', 'Height, cm'), 180, 'type="number" min="120" max="230" step=".1"')}${field('body-waist', t('Талия, см', 'Waist, cm'), 85, 'type="number" min="40" max="220" step=".1"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
    card({
      id: 'lab-ffmi', cat: 'body', kicker: 'COMPOSITION', title: t('Жировая / безжировая масса и FFMI', 'Fat/lean mass and FFMI'),
      description: t('Расчёт зависит от введённого процента жира и наследует ошибку этого измерения.', 'The result depends on entered body-fat percentage and inherits its measurement error.'),
      form: `<form class="lab-form" data-lab-form="ffmi">${field('ffmi-weight', t('Вес, кг', 'Weight, kg'), 80, 'type="number" min="30" max="350" step=".1"')}${field('ffmi-height', t('Рост, см', 'Height, cm'), 180, 'type="number" min="120" max="230" step=".1"')}${field('ffmi-bf', t('Жир, %', 'Body fat, %'), 15, 'type="number" min="3" max="60" step=".1"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
    card({
      id: 'lab-target-bf', cat: 'body', kicker: 'PROJECTION', title: t('Вес при целевом % жира', 'Weight at target body fat'),
      description: t('Модель удерживает безжировую массу постоянной — это допущение, а не прогноз.', 'Assumes lean mass remains constant — an assumption, not a forecast.'),
      form: `<form class="lab-form" data-lab-form="target-bf">${field('tbf-weight', t('Вес, кг', 'Weight, kg'), 80, 'type="number" min="30" max="350" step=".1"')}${field('tbf-current', t('Текущий жир, %', 'Current body fat, %'), 15, 'type="number" min="3" max="60" step=".1"')}${field('tbf-target', t('Целевой жир, %', 'Target body fat, %'), 12, 'type="number" min="3" max="50" step=".1"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
  ].join('');

  const cardio = [
    card({
      id: 'lab-hr', cat: 'cardio', kicker: 'HEART RATE', title: t('Пульсовые зоны', 'Heart-rate zones'),
      description: t('При наличии пульса покоя используется HRR/Karvonen; иначе — %HRmax.', 'Uses HRR/Karvonen with resting HR; otherwise %HRmax.'),
      form: `<form class="lab-form" data-lab-form="hr">${field('hr-max', t('Максимальный пульс', 'Max HR'), 190, 'type="number" min="100" max="240"')}${field('hr-rest', t('Пульс покоя, опционально', 'Resting HR, optional'), 60, 'type="number" min="30" max="130"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
    card({
      id: 'lab-pace', cat: 'cardio', kicker: 'PACE', title: t('Темп и скорость', 'Pace and speed'),
      description: t('Расстояние + время → темп и средняя скорость.', 'Distance + time → pace and average speed.'),
      form: `<form class="lab-form" data-lab-form="pace">${field('pace-distance', t('Дистанция, км', 'Distance, km'), 5, 'type="number" min=".1" step=".01"')}${field('pace-minutes', t('Время, минут', 'Time, minutes'), 25, 'type="number" min=".1" step=".1"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
    card({
      id: 'lab-riegel', cat: 'cardio', kicker: 'RIEGEL', title: t('Прогноз времени', 'Race-time estimate'),
      description: t('Математическая экстраполяция между дистанциями. Не учитывает профиль трассы, погоду и подготовку.', 'Mathematical extrapolation between distances. It does not model terrain, weather or preparation.'),
      form: `<form class="lab-form" data-lab-form="riegel">${field('r-d1', t('Известная дистанция, км', 'Known distance, km'), 5, 'type="number" min=".1" step=".01"')}${field('r-t1', t('Известное время, мин', 'Known time, min'), 25, 'type="number" min=".1" step=".1"')}${field('r-d2', t('Целевая дистанция, км', 'Target distance, km'), 10, 'type="number" min=".1" step=".01"')}<button class="btn btn-primary" type="submit">${t('Рассчитать', 'Calculate')}</button></form>`,
    }),
  ].join('');

  const converters = card({
    id: 'lab-convert', cat: 'converters', kicker: 'INSTANT', title: t('Конвертер единиц', 'Unit converter'),
    description: t('Мгновенная конвертация базовых единиц без отдельного сервиса.', 'Instant conversion of common units without a separate service.'),
    form: `<form class="lab-form" data-lab-form="convert">${field('conv-value', t('Значение', 'Value'), 100, 'type="number" step="any"')}${field('conv-pair', t('Направление', 'Direction'), '<option value="kg:lb">kg → lb</option><option value="lb:kg">lb → kg</option><option value="cm:in">cm → in</option><option value="in:cm">in → cm</option><option value="km:mi">km → mi</option><option value="mi:km">mi → km</option><option value="kcal:kj">kcal → kJ</option><option value="kj:kcal">kJ → kcal</option><option value="kmh:mph">km/h → mph</option><option value="mph:kmh">mph → km/h</option>', '', 'select')}</form>`,
  });

  const personal = [
    card({
      id: 'lab-adaptive', cat: 'personal', kicker: 'LOCAL DATA', title: t('Adaptive expenditure', 'Adaptive expenditure'),
      description: t('Оценка из записанных калорий и динамики веса. При недостатке данных результат не придумывается.', 'Estimate from logged calories and weight trend. No estimate is fabricated when data are insufficient.'),
      body: '<div id="lab-adaptive-data"></div>',
    }),
    card({
      id: 'lab-personal-summary', cat: 'personal', kicker: 'MY DATA', title: t('Сводка локальных данных', 'Local data summary'),
      description: t('Что приложение уже может использовать без повторного ввода.', 'What the app can already reuse without asking you to enter it again.'),
      body: '<div class="lab-kpis" id="lab-personal-kpis"></div>',
    }),
  ].join('');

  const planning = card({
    id: 'lab-planning', cat: 'planning', kicker: 'DECISION SUPPORT', title: t('Планирование без псевдоточных score', 'Planning without pseudo-precise scores'),
    description: t('Этот раздел собирает только прозрачные инструменты, которые меняют следующее действие. Композитные “recovery 93%” не используются без валидной модели.', 'This area only includes transparent tools that change the next action. Composite “recovery 93%” scores are not used without a valid model.'),
    body: `<div class="lab-result"><p class="small">${t('Используй Strength для нагрузки, Training для истории, Nutrition для энергии и Personal для персонализированных оценок.', 'Use Strength for load decisions, Training for history, Nutrition for energy targets and Personal for personalized estimates.')}</p></div>`,
  });

  return strength + training + nutrition + body + cardio + planning + converters + personal;
}

function readJson(keys, fallback) {
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed != null) return parsed;
    } catch {}
  }
  return fallback;
}

function history() {
  const data = readJson(['mmg.history.v1', 'mmg_history_v7'], []);
  return Array.isArray(data) ? data : [];
}

function diaryRows() {
  const measurementRaw = readJson(['mmg.diary.v1'], []);
  const measurementRows = Array.isArray(measurementRaw) ? measurementRaw : Array.isArray(measurementRaw?.entries) ? measurementRaw.entries : [];
  const legacyNutritionRaw = readJson(['mmg.nutrition.v1', 'mmg_nutrition_v7'], []);
  const legacyNutritionRows = Array.isArray(legacyNutritionRaw) ? legacyNutritionRaw : Array.isArray(legacyNutritionRaw?.entries) ? legacyNutritionRaw.entries : [];
  const logged = readJson(['mmg.nutritionLog.v1'], []);
  const logRows = Array.isArray(logged) ? logged : [];
  const nutritionRows = legacyNutritionRows.filter((row) => row && (row.calories != null || row.kcal != null || row.energy != null)).concat(logRows);
  return joinNutritionAndMeasurements(nutritionRows, measurementRows);
}

function filterCards() {
  let visible = 0;
  qa('[data-lab-card]').forEach((cardEl) => {
    const categoryMatch = cardEl.dataset.category === category;
    const searchMatch = !search || cardEl.dataset.search.includes(search);
    cardEl.hidden = !(categoryMatch && searchMatch);
    if (!cardEl.hidden) visible += 1;
  });
  if (q('#lab-empty')) q('#lab-empty').hidden = visible > 0;
  qa('[data-lab-category]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.labCategory === category)));
}

function bind() {
  section.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-warmup]');
    if (!button || !lastWarmupSets.length) return;
    window.dispatchEvent(new CustomEvent('mmg:add-warmup', { detail: { sets: lastWarmupSets.map(({ weight, reps }) => ({ weight, reps })) } }));
  });
  qa('[data-lab-category]').forEach((button) => button.addEventListener('click', () => {
    category = button.dataset.labCategory;
    filterCards();
  }));
  q('#lab-search')?.addEventListener('input', (event) => {
    search = String(event.target.value || '').trim().toLowerCase();
    if (search) {
      const hit = qa('[data-lab-card]').find((cardEl) => cardEl.dataset.search.includes(search));
      if (hit) category = hit.dataset.category;
    }
    filterCards();
  });
  qa('[data-lab-form]').forEach((form) => {
    form.addEventListener('submit', (event) => { event.preventDefault(); calculate(form.dataset.labForm); });
    form.addEventListener('input', () => {
      if (form.dataset.labForm === 'convert') calculate('convert');
    });
  });
}

function calculate(name) {
  if (name === 'e1rm') {
    const r = estimateOneRepMax(value('e1rm-weight'), value('e1rm-reps'));
    if (!r) return result(q('#lab-e1rm-out'), t('Проверь ввод', 'Check inputs'));
    result(q('#lab-e1rm-out'), num(r.central) + ' kg', {
      range: t('Диапазон ', 'Range ') + num(r.range[0]) + '–' + num(r.range[1]) + ' kg',
      confidence: t('Уверенность: ', 'Confidence: ') + r.confidence,
      meaning: `Epley ${num(r.epley)} · Brzycki ${num(r.brzycki)}`,
      action: t('Используй как ориентир для процентов нагрузки и отслеживания динамики, а не как гарантированный максимум.', 'Use it for load percentages and trend tracking, not as a guaranteed maximum.'),
      details: t('Оценка основана на выполненном подходе. Неопределённость растёт при большом числе повторов, нестабильной технике и непредельном усилии.', 'Estimate from a completed set. Uncertainty rises with high reps, inconsistent technique and non-maximal effort.'),
    });
  }

  if (name === 'percent') {
    const rm = Number(value('pct-rm')), pct = Number(value('pct-value')), step = Number(value('pct-step')) || 1;
    const raw = rm * pct / 100;
    if (!(raw > 0 && pct > 0 && pct <= 100)) return;
    const rounded = Math.round(raw / step) * step;
    result(q('#lab-percent-out'), num(rounded) + ' kg', {
      range: t('Расчётное ', 'Raw ') + num(raw) + ' kg',
      meaning: t('Округлено к доступному шагу веса.', 'Rounded to the available load increment.'),
    });
  }

  if (name === 'plates') {
    const pairs = Object.fromEntries(Object.keys(defaultPairs).map((plate) => [plate, value('pair-' + plate.replace('.','-'))]));
    const r = calculatePlates({ targetTotal: value('plates-target'), barWeight: value('plates-bar'), collars: value('plates-collars'), availablePairs: pairs });
    if (!r) return;
    result(q('#lab-plates-out'), r.perSide.length ? r.perSide.map((x) => num(x)).join(' + ') + ' kg' : t('Без блинов', 'No plates'), {
      range: t('Итого ', 'Total ') + num(r.achievedTotal) + ' kg',
      confidence: r.exact ? t('Точно', 'Exact') : t('Ближайший вариант', 'Nearest available'),
      meaning: t('Показано на одну сторону.', 'Shown per side.'),
      action: r.exact ? '' : t('Разница с целью: ', 'Difference from target: ') + (r.difference > 0 ? '+' : '') + num(r.difference) + ' kg.',
    });
  }

  if (name === 'warmup') {
    const sets = warmupRamp({ workingWeight: value('warm-working'), barWeight: value('warm-bar'), increment: value('warm-step') });
    const out = q('#lab-warmup-out');
    lastWarmupSets = sets;
    out.innerHTML = sets.length ? `<div class="gym-warmup-list">${sets.map((set, i) => `<div><span>${i + 1}</span><b>${num(set.weight)} kg</b><small>${set.reps} × · ${esc(set.label)}</small></div>`).join('')}</div><p class="tiny">${t('Разминка — редактируемый шаблон, не рабочий объём.', 'Warm-up is an editable template, not working volume.')}</p><button class="btn btn-primary" type="button" data-add-warmup>${t('Добавить разминку в тренировку', 'Add warm-up to workout')}</button>` : `<p class="tiny">${t('Проверь рабочий вес.', 'Check the working load.')}</p>`;
  }

  if (name === 'bmr') {
    const base = bmr({ sex: value('bmr-sex'), age: value('bmr-age'), weightKg: value('bmr-weight'), heightCm: value('bmr-height'), bodyFatPercent: value('bmr-bf') });
    if (!base) return;
    const total = tdee({ bmrKcal: base.central, activityFactor: value('bmr-af') });
    result(q('#lab-bmr-out'), num(total.central) + ' kcal/day', {
      range: num(total.range[0]) + '–' + num(total.range[1]) + ' kcal',
      meaning: `BMR ≈ ${num(base.central)} kcal${base.katch ? ` · Mifflin ${num(base.mifflin)} · Katch ${num(base.katch)}` : ''}`,
      action: t('Сверяй с реальной динамикой веса и фактическим intake; формула — стартовая оценка.', 'Validate against real weight trend and logged intake; the formula is a starting estimate.'),
      details: t('Коэффициент активности создаёт значимую неопределённость, поэтому TDEE показан коридором.', 'Activity factors introduce substantial uncertainty, so TDEE is shown as a range.'),
    });
  }

  if (name === 'goal') {
    const r = goalCalories({ maintenanceKcal: value('goal-maint'), weightKg: value('goal-weight'), goal: value('goal-type'), weeklyRatePercent: value('goal-rate') });
    if (!r) return;
    result(q('#lab-goal-out'), num(r.target) + ' kcal/day', {
      range: r.delta ? (r.delta > 0 ? '+' : '') + num(r.delta) + ' kcal/day' : t('Поддержание', 'Maintenance'),
      meaning: t('Это плановый ориентир, не измеренный расход.', 'This is a planning target, not measured expenditure.'),
      action: t('Корректируй по тренду массы и качеству логирования.', 'Adjust using weight trend and logging quality.'),
    });
  }

  if (name === 'protein') {
    const r = proteinTarget({ weightKg: value('protein-weight'), leanMassKg: value('protein-lean'), goal: value('protein-goal') });
    if (!r) return;
    result(q('#lab-protein-out'), num(r.lowGrams) + '–' + num(r.highGrams) + ' g/day', {
      confidence: r.basis === 'lean-mass' ? t('Основа: безжировая масса', 'Basis: lean mass') : t('Основа: масса тела', 'Basis: body weight'),
      meaning: t('Диапазон оставляет место под переносимость, рацион и фазу питания.', 'The range leaves room for tolerance, diet composition and phase.'),
    });
  }

  if (name === 'macros') {
    const r = macroPlan({ calories: value('macro-kcal'), proteinGrams: value('macro-protein'), fatGrams: value('macro-fat') });
    if (!r) return result(q('#lab-macros-out'), t('Калорий недостаточно для заданных белка и жира', 'Calories are too low for the selected protein and fat'));
    result(q('#lab-macros-out'), num(r.carbsGrams) + ' g ' + t('углеводов', 'carbs'), {
      range: `${num(r.proteinGrams)}P · ${num(r.fatGrams)}F · ${num(r.carbsGrams)}C`,
      meaning: t('Углеводы рассчитаны как остаток энергии после белка и жиров.', 'Carbohydrates are the remaining energy after protein and fat.'),
    });
  }

  if (name === 'fiber') {
    const r = fiberTarget({ calories: value('fiber-kcal') });
    if (!r) return;
    result(q('#lab-fiber-out'), num(r.grams, 1) + ' g/day', {
      meaning: t('Ориентир 14 г на 1000 ккал.', 'Planning reference: 14 g per 1000 kcal.'),
      details: t('Индивидуальная переносимость, заболевания ЖКТ и лечебные рекомендации этим расчётом не определяются.', 'Individual tolerance, GI conditions and therapeutic recommendations are not determined by this estimate.'),
    });
  }

  if (name === 'bmi') {
    const b = bmi({ weightKg: value('body-weight'), heightCm: value('body-height') });
    const w = waistToHeight({ waistCm: value('body-waist'), heightCm: value('body-height') });
    if (!b || !w) return;
    result(q('#lab-bmi-out'), 'BMI ' + num(b.value, 1), {
      range: 'Waist/height ' + num(w.ratio, 3),
      meaning: t('Это скрининговые отношения размеров тела, а не прямое измерение жира или здоровья.', 'These are screening ratios, not direct measures of body fat or health.'),
    });
  }

  if (name === 'ffmi') {
    const r = bodyComposition({ weightKg: value('ffmi-weight'), heightCm: value('ffmi-height'), bodyFatPercent: value('ffmi-bf') });
    if (!r) return;
    result(q('#lab-ffmi-out'), 'FFMI ' + num(r.ffmi, 1), {
      range: `${t('Безжировая', 'Lean')} ${num(r.leanMassKg,1)} kg · ${t('жировая', 'fat')} ${num(r.fatMassKg,1)} kg`,
      meaning: r.normalizedFfmi ? t('Нормализованный FFMI ', 'Normalized FFMI ') + num(r.normalizedFfmi, 1) : '',
      details: t('Точность ограничена точностью введённого процента жира.', 'Accuracy is limited by the accuracy of the entered body-fat percentage.'),
    });
  }

  if (name === 'target-bf') {
    const r = targetWeightAtBodyFat({ weightKg: value('tbf-weight'), bodyFatPercent: value('tbf-current'), targetBodyFatPercent: value('tbf-target') });
    if (!r) return;
    result(q('#lab-target-bf-out'), num(r.targetWeightKg, 1) + ' kg', {
      meaning: t('Математическая проекция при неизменной безжировой массе.', 'Mathematical projection assuming unchanged lean mass.'),
      details: t('В реальности безжировая масса и вода могут меняться; результат не является прогнозом даты или гарантированного веса.', 'In reality lean mass and water can change; this is not a dated or guaranteed forecast.'),
    });
  }

  if (name === 'hr') {
    const zones = heartRateZones({ maxHr: value('hr-max'), restingHr: value('hr-rest') });
    if (!zones) return;
    result(q('#lab-hr-out'), zones.map((z) => `Z${z.zone} ${z.low}–${z.high}`).join(' · '), {
      confidence: zones[0].method,
      meaning: t('Зоны являются расчётной моделью, а не лабораторным пороговым тестом.', 'Zones are a model, not a laboratory threshold test.'),
    });
  }

  if (name === 'pace') {
    const r = paceFromDistanceTime({ distanceKm: value('pace-distance'), minutes: value('pace-minutes') });
    if (!r) return;
    result(q('#lab-pace-out'), r.display + ' min/km', { range: num(r.speedKmh) + ' km/h' });
  }

  if (name === 'riegel') {
    const r = riegelPredict({ distance1Km: value('r-d1'), time1Minutes: value('r-t1'), distance2Km: value('r-d2') });
    if (!r) return;
    result(q('#lab-riegel-out'), num(r.predictedMinutes) + ' min', {
      meaning: t('Экстраполяция по формуле Riegel с exponent 1.06.', 'Riegel extrapolation with exponent 1.06.'),
      details: t('Не учитывает специфику дистанции, рельеф, погоду, усталость и спортивную подготовку.', 'Does not model terrain, weather, fatigue or event-specific preparation.'),
    });
  }

  if (name === 'convert') {
    const [from, to] = value('conv-pair').split(':');
    const r = convert(value('conv-value'), from, to);
    if (r == null) return;
    result(q('#lab-convert-out'), num(r, 4) + ' ' + to);
  }
}

function renderHistoryInsights() {
  const rows = history();
  const sets = rows.flatMap((session) => (session.items || []).flatMap((item) => item.setLog || []));
  const volume = sessionVolume(sets);
  const completedSets = sets.filter((set) => set?.completed !== false && set?.completed).length;
  q('#lab-volume-kpis').innerHTML = [
    [t('Сессий', 'Sessions'), rows.length],
    [t('Завершённых сетов', 'Completed sets'), completedSets],
    [t('Тоннаж', 'Volume load'), num(volume) + ' kg'],
  ].map(([label,v]) => `<div class="lab-kpi"><span>${label}</span><b>${v}</b></div>`).join('');
  result(q('#lab-volume-out'), rows.length ? t('Источник: мои данные', 'Source: my data') : t('Пока нет истории', 'No history yet'), {
    action: rows.length ? t('Сравнивай одинаковые упражнения и одинаковую методику записи.', 'Compare like-for-like exercises and logging methods.') : t('Заверши первую тренировку — данные появятся автоматически.', 'Complete your first workout and data will appear automatically.'),
  });

  const muscles = weeklyMuscleSets(rows);
  const entries = Object.entries(muscles).sort((a,b) => b[1]-a[1]).slice(0, 8);
  q('#lab-muscle-list').innerHTML = entries.length ? `<div class="gym-percent-table">${entries.map(([muscle,count]) => `<div><span>${esc(muscle)}</span><b>${num(count,0)}</b></div>`).join('')}</div>` : `<p class="tiny">${t('Нужны завершённые тренировки с целевой мышцей.', 'Completed workouts with target-muscle data are required.')}</p>`;
  result(q('#lab-muscles-out'), entries.length ? t('Источник: мои данные', 'Source: my data') : t('Недостаточно данных', 'Insufficient data'));

  const diary = diaryRows();
  const adaptive = adaptiveExpenditure({ days: diary });
  q('#lab-adaptive-data').innerHTML = `<p class="tiny">${t('Найдено полных дней: ', 'Complete days found: ')}${adaptive.completeDays || 0}</p>`;
  if (adaptive.status !== 'ok') {
    result(q('#lab-adaptive-out'), t('Недостаточно данных', 'Insufficient data'), {
      meaning: t('Нужно минимум 7 дней, где одновременно есть калории и вес.', 'At least 7 days with both calories and body weight are required.'),
    });
  } else {
    result(q('#lab-adaptive-out'), num(adaptive.central) + ' kcal/day', {
      range: num(adaptive.range[0]) + '–' + num(adaptive.range[1]) + ' kcal',
      confidence: t('Уверенность: ', 'Confidence: ') + adaptive.confidence,
      meaning: `${adaptive.completeDays} ${t('дней', 'days')} · ${adaptive.coverage}% ${t('покрытие', 'coverage')} · Δ ${num(adaptive.weightChangeKg,2)} kg`,
      details: t('Прозрачная энергетическая оценка: средний intake корректируется на изменение массы по окну наблюдения. Это упрощённая модель и не копирует proprietary-алгоритмы.', 'Transparent energy estimate: mean intake adjusted by observed weight change across the data window. This is a simplified model and does not copy proprietary algorithms.'),
    });
  }

  q('#lab-personal-kpis').innerHTML = [
    [t('Тренировки', 'Workouts'), rows.length],
    [t('Дни питания+вес', 'Nutrition+weight days'), diary.length],
    [t('Локально', 'Storage'), t('да', 'yes')],
  ].map(([label,v]) => `<div class="lab-kpi"><span>${label}</span><b>${v}</b></div>`).join('');
  result(q('#lab-personal-summary-out'), t('Источник: мои данные', 'Source: my data'), {
    meaning: t('Lab использует существующие локальные записи там, где структура данных это позволяет.', 'Lab reuses existing local records where the stored data structure supports it.'),
  });
}

function calculateAll() {
  ['e1rm','percent','plates','warmup','bmr','goal','protein','macros','fiber','bmi','ffmi','target-bf','hr','pace','riegel','convert'].forEach(calculate);
  renderHistoryInsights();
}

function addNavigation() {
  const topMenu = document.querySelector('#navmenu-more');
  if (topMenu && !topMenu.querySelector('[href="#tools"]')) topMenu.insertAdjacentHTML('afterbegin', '<a href="#tools" data-v7-more="tools"><b>Lab</b><span data-v7-more-sub="tools">Расчёты, анализ и персональные данные</span></a>');
  const mobile = document.querySelector('#mobile-nav');
  if (mobile && !mobile.querySelector('[href="#tools"]')) mobile.insertAdjacentHTML('afterbegin', '<a class="mnav-link" href="#tools"><span data-v7-more="tools">Lab</span><span>→</span></a>');
  const moreGrid = document.querySelector('#v7-more-grid .v8-more-group');
  if (moreGrid && !moreGrid.querySelector('[data-v7-route="tools"]')) {
    moreGrid.querySelector('.v8-more-list')?.insertAdjacentHTML('afterbegin', '<button class="v7-more-item" type="button" data-v7-route="tools"><span class="v7-more-icon" aria-hidden="true">↗</span><span><b data-v7-more="tools">Lab</b><p data-v7-more-sub="tools">Сила, питание, состав тела, кардио и мои данные</p></span><span aria-hidden="true">→</span></button>');
  }
}

function syncRoute() {
  const route = (location.hash || '#home').slice(1).split('?')[0];
  if (section) section.hidden = route !== 'tools';
  addNavigation();
  if (route === 'tools') renderHistoryInsights();
}

function openLab(query = '') {
  location.hash = '#tools';
  const needle = String(query || '').trim().toLowerCase();
  if (needle) {
    search = needle;
    const hit = qa('[data-lab-card]').find((cardEl) => cardEl.dataset.search.includes(needle));
    if (hit) category = hit.dataset.category;
    const input = q('#lab-search');
    if (input) input.value = query;
  }
  filterCards();
  requestAnimationFrame(() => q('#gym-tools-title')?.focus?.({ preventScroll: false }));
}

window.mmgLabOpen = openLab;

function init() {
  section = document.createElement('section');
  section.id = 'tools';
  section.className = 'section v7-app-view';
  section.hidden = true;
  section.setAttribute('aria-labelledby', 'gym-tools-title');
  document.querySelector('main')?.appendChild(section);
  renderShell();
  syncRoute();
  window.addEventListener('hashchange', syncRoute);
  const observer = new MutationObserver(() => {
    if (lastLanguage !== document.documentElement.lang) {
      lastLanguage = document.documentElement.lang;
      renderShell();
    }
    addNavigation();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
