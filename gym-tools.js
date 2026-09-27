import {
  adaptiveExpenditure,
  bmrMifflinStJeor,
  bodyCompositionFromFat,
  calculatePlates,
  calorieTargetRange,
  convertRepMax,
  convertUnits,
  cooperVo2FromDistance,
  estimateOneRepMax,
  heartRateReserveZones,
  loadFromOneRepMax,
  macroPlan,
  metCalories,
  paceFromDistanceTime,
  proteinRange,
  riegelPrediction,
  rockportVo2,
  sessionVolume,
  targetWeightAtBodyFat,
  tdeeEstimate,
  waistToHeight,
  warmupRamp,
} from './tools/gym-calculators.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const en = () => document.documentElement.lang === 'en';
const t = (ru, english) => en() ? english : ru;
const num = (value, digits = 2) => Number(value).toLocaleString(en() ? 'en-US' : 'ru-RU', { maximumFractionDigits: digits });
const evidence = (ids) => `<div class="lab-evidence">${ids.map((id) => `<span>${esc(id)}</span>`).join('')}</div>`;
const resultBox = (main, sub, body = '', meta = '') => `<div class="lab-result"><div class="lab-result-main"><strong>${main}</strong><span>${sub}</span></div>${body}${meta ? `<div class="lab-meta">${meta}</div>` : ''}</div>`;

const defaultPairs = { 25: 2, 20: 2, 15: 2, 10: 4, 5: 4, 2.5: 4, 1.25: 4 };
let section;
let lastLanguage = document.documentElement.lang;
let activeCategory = 'strength';

function addStylesheet() {
  if (document.querySelector('link[data-mmg-lab]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './lab.css?v=20260928-lab1';
  link.dataset.mmgLab = 'true';
  document.head.appendChild(link);
}

function field(id, label, value, attrs = '') {
  return `<label class="field" for="${id}"><span>${label}</span><input class="input" id="${id}" value="${value}" ${attrs}></label>`;
}
function select(id, label, options) {
  return `<label class="field" for="${id}"><span>${label}</span><select class="select" id="${id}">${options.map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}</select></label>`;
}
function card(category, id, kicker, title, description, form) {
  return `<article class="card lab-card" data-lab-category="${category}" id="${id}">
    <div class="card-head"><div><p class="eyebrow">${kicker}</p><h2>${title}</h2></div></div>
    <p class="tiny">${description}</p>
    ${form}
  </article>`;
}

function renderShell() {
  if (!section) return;
  const categories = [
    ['strength', t('Сила', 'Strength')],
    ['training', t('Тренировка', 'Training')],
    ['nutrition', t('Питание', 'Nutrition')],
    ['body', t('Состав тела', 'Body')],
    ['cardio', t('Кардио', 'Cardio')],
    ['convert', t('Конвертеры', 'Converters')],
    ['mydata', t('Мои данные', 'My data')],
  ];

  section.innerHTML = `
    <div class="container gym-tools-shell">
      <div class="lab-hero">
        <div class="v7-page-head">
          <div>
            <p class="eyebrow">MARKOV MADE LAB</p>
            <h1 id="gym-tools-title">${t('Лаборатория расчётов', 'Calculation laboratory')}</h1>
            <p class="lede">${t('Не набор цифр, а прозрачные расчёты с диапазонами, ограничениями и практическим следующим действием.', 'Transparent calculations with ranges, limitations and a practical next action.')}</p>
          </div>
        </div>
        <aside class="lab-summary">
          <strong>${t('Результат → смысл → действие', 'Result → meaning → action')}</strong>
          <p>${t('Если расчёт зависит от популяционной формулы, интерфейс показывает это прямо. Сохранённые данные тренировок используются там, где они реально повышают полезность.', 'Population estimates are labelled as estimates. Saved training data is reused where it meaningfully improves the result.')}</p>
        </aside>
      </div>

      <div class="lab-tabs" role="group" aria-label="${t('Категории лаборатории', 'Lab categories')}">
        ${categories.map(([id, label]) => `<button class="lab-tab" type="button" data-lab-tab="${id}" aria-pressed="${id === activeCategory}">${label}</button>`).join('')}
      </div>

      <div class="lab-grid">
        ${card('strength','lab-e1rm','e1RM',t('Оценка максимума на 1 повтор','Estimated one-rep max'),t('Epley + Brzycki: показываем диапазон, а не одну псевдоточную цифру.','Epley + Brzycki shown as a range rather than false precision.'),`
          <form data-lab-form="e1rm" class="form-grid">
            <div class="lab-form-row">${field('lab-e1rm-w',t('Вес','Weight'),'80','type="number" min="0.5" step="0.5" required')}${field('lab-e1rm-r',t('Повторы','Reps'),'5','type="number" min="1" max="30" step="1" required')}</div>
            <button class="btn btn-primary" type="submit">${t('Рассчитать','Calculate')}</button>
          </form><div data-lab-output="e1rm"></div>`)}

        ${card('strength','lab-percent','LOAD',t('Рабочий вес по %1RM','Training load by %1RM'),t('С учётом минимального шага доступного веса.','Rounded to the smallest available increment.'),`
          <form data-lab-form="percent" class="form-grid">
            <div class="lab-form-row three">${field('lab-p-max','1RM / e1RM','100','type="number" step="0.5"')}${field('lab-p-pct','%','80','type="number" step="0.5"')}${field('lab-p-step',t('Шаг','Increment'),'2.5','type="number" step="0.25"')}</div>
          </form><div data-lab-output="percent"></div>`)}

        ${card('strength','lab-repconvert','REPS',t('Конвертер повторных максимумов','Rep-max converter'),t('Модельный эквивалент между разными диапазонами повторов.','Model-based equivalent across rep ranges.'),`
          <form data-lab-form="repconvert" class="form-grid"><div class="lab-form-row three">${field('lab-rc-w',t('Вес','Weight'),'100','type="number" step="0.5"')}${field('lab-rc-from',t('Из повторов','From reps'),'5','type="number" min="1" max="30"')}${field('lab-rc-to',t('В повторы','To reps'),'10','type="number" min="1" max="30"')}</div></form><div data-lab-output="repconvert"></div>`)}

        ${card('strength','lab-plates','PLATES',t('Калькулятор блинов PRO','Plate calculator PRO'),t('Показывает ближайший собираемый вес и раскладку на одну сторону.','Finds the nearest achievable total and one-side layout.'),`
          <form data-lab-form="plates" class="form-grid">
            <div class="lab-form-row three">${field('lab-pl-target',t('Целевой вес','Target total'),'100','type="number" step="0.5"')}${field('lab-pl-bar',t('Гриф','Bar'),'20','type="number" step="0.5"')}${field('lab-pl-collars',t('Замки','Collars'),'0','type="number" step="0.5"')}</div>
            <details><summary>${t('Доступные пары блинов','Available plate pairs')}</summary><div class="plate-options">${Object.keys(defaultPairs).map((v)=>field(`lab-pair-${v.replace('.','-')}`,`${v} kg`,defaultPairs[v],'type="number" min="0" max="20" step="1"')).join('')}</div></details>
          </form><div data-lab-output="plates"></div>`)}

        ${card('strength','lab-warmup','WARM-UP',t('Разминочная лестница','Warm-up ramp'),t('Редактируемый шаблон; разминка не считается рабочим объёмом.','Editable template; warm-up sets are not working volume.'),`
          <form data-lab-form="warmup" class="form-grid"><div class="lab-form-row three">${field('lab-wu-work',t('Рабочий','Working'),'100','type="number" step="0.5"')}${field('lab-wu-bar',t('Гриф','Bar'),'20','type="number" step="0.5"')}${field('lab-wu-step',t('Шаг','Increment'),'2.5','type="number" step="0.25"')}</div></form><div data-lab-output="warmup"></div>`)}

        ${card('training','lab-volume','HISTORY',t('Записанный тренировочный объём','Recorded training volume'),t('Используются только завершённые подходы с весом и повторениями из локальной истории.','Uses only completed weighted sets from local history.'),`<div data-lab-output="volume"></div><button class="btn btn-quiet" type="button" data-refresh-history>${t('Обновить из истории','Refresh from history')}</button>`)}

        ${card('nutrition','lab-energy','ENERGY',t('BMR → TDEE → цель','BMR → TDEE → target'),t('Mifflin–St Jeor для стартовой оценки. TDEE показывается коридором, затем его лучше заменять фактическими данными.','Mifflin–St Jeor provides a starting estimate. TDEE is shown as a range and should later yield to observed data.'),`
          <form data-lab-form="energy" class="form-grid">
            <div class="lab-form-row three">${select('lab-en-sex',t('Пол','Sex'),[['male',t('Мужской','Male')],['female',t('Женский','Female')]])}${field('lab-en-age',t('Возраст','Age'),'30','type="number" min="18" max="100"')}${field('lab-en-height',t('Рост, см','Height, cm'),'180','type="number" step="0.1"')}</div>
            <div class="lab-form-row three">${field('lab-en-weight',t('Вес, кг','Weight, kg'),'80','type="number" step="0.1"')}${select('lab-en-act',t('Активность','Activity'),[['1.2',t('Низкая','Low')],['1.4',t('Лёгкая','Light')],['1.55',t('Умеренная','Moderate')],['1.725',t('Высокая','High')]])}${select('lab-en-goal',t('Цель','Goal'),[['maintain',t('Поддержание','Maintain')],['cut',t('Снижение','Fat loss')],['gain',t('Набор','Gain')]])}</div>
          </form><div data-lab-output="energy"></div>`)}

        ${card('nutrition','lab-protein','PROTEIN',t('Белок и макросы','Protein & macros'),t('Белок — диапазон. Углеводы считаются остатком после выбранных белка и жира.','Protein is a range. Carbs are the remainder after selected protein and fat.'),`
          <form data-lab-form="protein" class="form-grid">
            <div class="lab-form-row three">${field('lab-pr-weight',t('Вес, кг','Weight, kg'),'80','type="number" step="0.1"')}${select('lab-pr-goal',t('Цель','Goal'),[['maintain',t('Поддержание','Maintain')],['cut',t('Дефицит','Cut')],['gain',t('Набор','Gain')]])}${field('lab-pr-cal',t('Ккал','Calories'),'2500','type="number" step="10"')}</div>
            <div class="lab-form-row">${field('lab-pr-fixed',t('Белок для плана, г','Protein for plan, g'),'160','type="number" step="1"')}${field('lab-pr-fat',t('Жир, г','Fat, g'),'70','type="number" step="1"')}</div>
          </form><div data-lab-output="protein"></div>`)}

        ${card('body','lab-body','BODY',t('Состав тела и целевой вес','Body composition & target weight'),t('Целевой вес при % жира — теоретическая модель при неизменной безжировой массе.','Target weight assumes lean mass remains constant.'),`
          <form data-lab-form="body" class="form-grid">
            <div class="lab-form-row three">${field('lab-b-weight',t('Вес, кг','Weight, kg'),'80','type="number" step="0.1"')}${field('lab-b-fat',t('Жир, %','Body fat, %'),'20','type="number" step="0.1"')}${field('lab-b-target',t('Цель, %','Target, %'),'15','type="number" step="0.1"')}</div>
            <div class="lab-form-row">${field('lab-b-height',t('Рост, см','Height, cm'),'180','type="number" step="0.1"')}${field('lab-b-waist',t('Талия, см','Waist, cm'),'85','type="number" step="0.1"')}</div>
          </form><div data-lab-output="body"></div>`)}

        ${card('cardio','lab-hr','HRR',t('Пульсовые зоны','Heart-rate reserve zones'),t('HRmax оценивается по Tanaka; индивидуальная ошибка может быть значительной.','HRmax uses Tanaka and may have substantial individual error.'),`
          <form data-lab-form="hr" class="form-grid"><div class="lab-form-row">${field('lab-hr-age',t('Возраст','Age'),'30','type="number" min="18"')}${field('lab-hr-rest',t('Пульс покоя','Resting HR'),'60','type="number" min="30" max="120"')}</div></form><div data-lab-output="hr"></div>`)}

        ${card('cardio','lab-running','PACE',t('Темп и прогноз дистанции','Pace & race prediction'),t('Темп рассчитывается напрямую; Riegel — эмпирическая модель и не гарантирует результат.','Pace is direct arithmetic; Riegel is an empirical model, not a guarantee.'),`
          <form data-lab-form="running" class="form-grid"><div class="lab-form-row three">${field('lab-run-d1',t('Дистанция, км','Distance, km'),'5','type="number" step="0.1"')}${field('lab-run-t1',t('Время, мин','Time, min'),'25','type="number" step="0.1"')}${field('lab-run-d2',t('Цель, км','Target, km'),'10','type="number" step="0.1"')}</div></form><div data-lab-output="running"></div>`)}

        ${card('cardio','lab-field','VO₂',t('Полевые оценки VO₂max','Field VO₂max estimates'),t('Cooper и Rockport — непрямые полевые оценки, не лабораторное измерение.','Cooper and Rockport are indirect field estimates, not lab measurements.'),`
          <form data-lab-form="field" class="form-grid">
            <div class="lab-form-row">${field('lab-cooper-distance',t('Cooper: 12 мин, м','Cooper: 12-min distance, m'),'2800','type="number" step="10"')}${field('lab-met',t('MET активности','Activity MET'),'8','type="number" step="0.1"')}</div>
            <details><summary>Rockport</summary><div class="lab-form-row three">${field('lab-rp-weight',t('Вес, кг','Weight, kg'),'80','type="number" step="0.1"')}${field('lab-rp-age',t('Возраст','Age'),'30','type="number"')}${select('lab-rp-sex',t('Пол','Sex'),[['male',t('Мужской','Male')],['female',t('Женский','Female')]])}${field('lab-rp-time',t('1 миля, мин','1 mile, min'),'13','type="number" step="0.1"')}${field('lab-rp-hr',t('Пульс на финише','Finish HR'),'130','type="number"')}${field('lab-met-min',t('MET: минуты','MET minutes'),'60','type="number"')}</div></details>
          </form><div data-lab-output="field"></div>`)}

        ${card('mydata','lab-adaptive','MY DATA',t('Адаптивный расход энергии','Adaptive energy expenditure'),t('Использует локальные записи калорий и веса. До достаточного покрытия данных результат не показывается.','Uses local calorie and weight logs. No estimate is shown until coverage is sufficient.'),`
          <div data-lab-output="adaptive"></div>
          <button class="btn btn-quiet" type="button" data-refresh-adaptive>${t('Обновить из дневника','Refresh from diary')}</button>`)}

        ${card('convert','lab-convert','UNITS',t('Конвертер единиц','Unit converter'),t('Мгновенные двусторонние преобразования без кнопки Calculate.','Instant two-way conversions without a Calculate button.'),`
          <form data-lab-form="convert" class="form-grid"><div class="lab-form-row three">${field('lab-c-value',t('Значение','Value'),'100','type="number" step="any"')}${select('lab-c-from',t('Из','From'),[['kg','kg'],['lb','lb'],['cm','cm'],['in','in'],['km','km'],['mi','mi'],['kcal','kcal'],['kj','kJ'],['kmh','km/h'],['mph','mph']])}${select('lab-c-to',t('В','To'),[['lb','lb'],['kg','kg'],['in','in'],['cm','cm'],['mi','mi'],['km','km'],['kj','kJ'],['kcal','kcal'],['mph','mph'],['kmh','km/h']])}</div></form><div data-lab-output="convert"></div>`)}
      </div>
    </div>`;

  bind();
  updateCategory();
  calculateAll();
}

function out(key) { return section.querySelector(`[data-lab-output="${key}"]`); }
function val(id) { return section.querySelector(`#${id}`)?.value; }

function renderE1rm() {
  const r = estimateOneRepMax(val('lab-e1rm-w'), val('lab-e1rm-r'));
  out('e1rm').innerHTML = r ? resultBox(`${num(r.central)} kg`, t('центральная оценка','central estimate'), `<div class="lab-result-grid"><div><span>Epley</span><b>${num(r.epley)}</b></div><div><span>Brzycki</span><b>${num(r.brzycki)}</b></div><div><span>${t('Диапазон','Range')}</span><b>${num(r.range[0])}–${num(r.range[1])}</b></div></div>`, `${t('Уверенность','Confidence')}: ${r.confidence}. ${t('При высоком числе повторов ошибка обычно выше.','Error generally increases at higher rep counts.')}`) : '';
}
function renderPercent() {
  const r = loadFromOneRepMax(val('lab-p-max'), val('lab-p-pct'), val('lab-p-step'));
  out('percent').innerHTML = r ? resultBox(`${num(r.rounded)} kg`, `${num(r.percent)}% · ${t('сырой расчёт','raw')} ${num(r.raw)} kg`) : '';
}
function renderRepConvert() {
  const r = convertRepMax(val('lab-rc-w'), val('lab-rc-from'), val('lab-rc-to'));
  out('repconvert').innerHTML = r ? resultBox(`${num(r.central)} kg × ${r.toReps}`, `${t('диапазон','range')} ${num(r.range[0])}–${num(r.range[1])} kg`, '', `${t('Уверенность','Confidence')}: ${r.confidence}`) : '';
}
function renderPlates() {
  const pairs = Object.fromEntries(Object.keys(defaultPairs).map((v)=>[v,val(`lab-pair-${v.replace('.','-')}`)]));
  const r = calculatePlates({targetTotal:val('lab-pl-target'),barWeight:val('lab-pl-bar'),collars:val('lab-pl-collars'),availablePairs:pairs});
  out('plates').innerHTML = r ? resultBox(r.perSide.length ? r.perSide.map((x)=>`${num(x)} kg`).join(' + ') : t('без блинов','no plates'), t('на одну сторону','per side'), `<div class="lab-result-grid"><div><span>${t('Итого','Total')}</span><b>${num(r.achievedTotal)} kg</b></div><div><span>${t('Разница','Difference')}</span><b>${r.difference>0?'+':''}${num(r.difference)} kg</b></div><div><span>${t('Точность','Fit')}</span><b>${r.exact?t('точно','exact'):t('ближайший','nearest')}</b></div></div>`) : '';
}
function renderWarmup() {
  const rows = warmupRamp({workingWeight:val('lab-wu-work'),barWeight:val('lab-wu-bar'),increment:val('lab-wu-step')});
  out('warmup').innerHTML = rows.length ? resultBox(`${rows.length} ${t('подхода','sets')}`,t('до рабочего веса','before work sets'),`<div class="lab-result-grid">${rows.map((s,i)=>`<div><span>0${i+1}</span><b>${num(s.weight)} kg × ${s.reps}</b><small>${esc(s.label)}</small></div>`).join('')}</div>`) : '';
}
function history() { try { const x=JSON.parse(localStorage.getItem('mmg.history.v1')||'[]'); return Array.isArray(x)?x:[]; } catch { return []; } }
function diary() { try { const x=JSON.parse(localStorage.getItem('mmg.diary.v1')||'[]'); return Array.isArray(x)?x:[]; } catch { return []; } }
function renderVolume() {
  const h=history(); const sets=h.flatMap((s)=>(s.items||[]).flatMap((i)=>i.setLog||[])); const total=sessionVolume(sets);
  out('volume').innerHTML=resultBox(`${num(total,0)} kg`,t('зафиксированный тоннаж','recorded volume load'),`<div class="lab-result-grid"><div><span>${t('Сессий','Sessions')}</span><b>${h.length}</b></div><div><span>${t('Источник','Source')}</span><b>${t('мои данные','my data')}</b></div><div><span>${t('Правило','Rule')}</span><b>${t('только завершённые','completed only')}</b></div></div>`,t('Собственный вес не превращается в фиктивный тоннаж. Сравнивай тоннаж прежде всего у одного упражнения с самим собой.','Bodyweight work is not converted into fake tonnage. Compare volume load primarily within the same movement over time.'));
}
function renderEnergy() {
  const b=bmrMifflinStJeor({sex:val('lab-en-sex'),age:val('lab-en-age'),heightCm:val('lab-en-height'),weightKg:val('lab-en-weight')});
  const td=b&&tdeeEstimate({bmr:b.kcal,activityFactor:val('lab-en-act')});
  const target=td&&calorieTargetRange({maintenanceKcal:td.central,goal:val('lab-en-goal'),rate:'moderate'});
  out('energy').innerHTML = b&&td&&target ? resultBox(`${num(target.range[0],0)}–${num(target.range[1],0)} kcal`,t('стартовый целевой коридор','starting target range'),`<div class="lab-result-grid"><div><span>BMR</span><b>${num(b.kcal,0)}</b></div><div><span>TDEE</span><b>${num(td.central,0)}</b></div><div><span>${t('TDEE диапазон','TDEE range')}</span><b>${num(td.range[0],0)}–${num(td.range[1],0)}</b></div></div>`,`${t('Это стартовая оценка, а не измеренный расход. После достаточного периода логирования приоритет должен получать персональный тренд.','This is a starting estimate, not measured expenditure. With enough logging, observed personal trend should take priority.')}${evidence(['mifflin-st-jeor-1990'])}`) : '';
}
function renderProtein() {
  const p=proteinRange({weightKg:val('lab-pr-weight'),goal:val('lab-pr-goal'),resistanceTraining:true});
  const m=macroPlan({calories:val('lab-pr-cal'),proteinG:val('lab-pr-fixed'),fatG:val('lab-pr-fat')});
  out('protein').innerHTML = p&&m ? resultBox(`${num(p.grams[0],0)}–${num(p.grams[1],0)} g`,t('ориентир белка','protein range'),`<div class="lab-result-grid"><div><span>${t('Белок в плане','Plan protein')}</span><b>${num(m.proteinG,0)} g</b></div><div><span>${t('Жиры','Fat')}</span><b>${num(m.fatG,0)} g</b></div><div><span>${t('Углеводы','Carbs')}</span><b>${num(m.carbsG,0)} g</b></div></div>`,`${t('Диапазон — практический ориентир для здоровых тренирующихся взрослых, а не медицинское назначение.','The range is a practical guide for healthy exercising adults, not a medical prescription.')}${evidence(p.evidenceIds)}`) : '';
}
function renderBody() {
  const c=bodyCompositionFromFat({weightKg:val('lab-b-weight'),bodyFatPct:val('lab-b-fat')});
  const target=targetWeightAtBodyFat({weightKg:val('lab-b-weight'),currentBodyFatPct:val('lab-b-fat'),targetBodyFatPct:val('lab-b-target')});
  const ratio=waistToHeight({waistCm:val('lab-b-waist'),heightCm:val('lab-b-height')});
  const weight=Number(val('lab-b-weight')); const height=Number(val('lab-b-height'))/100; const bmiVal=weight&&height?weight/(height*height):null;
  out('body').innerHTML=c&&target ? resultBox(`${num(target.targetWeightKg)} kg`,t('теоретический вес при целевом % жира','theoretical weight at target body fat'),`<div class="lab-result-grid"><div><span>${t('Безжировая масса','Lean mass')}</span><b>${num(c.leanMassKg)} kg</b></div><div><span>BMI</span><b>${bmiVal?num(bmiVal,1):'—'}</b></div><div><span>Waist / height</span><b>${ratio??'—'}</b></div></div>`,t('Ключевое допущение: безжировая масса остаётся неизменной. Ошибка измерения % жира может быть больше ожидаемого изменения.','Key assumption: lean mass stays constant. Body-fat measurement error may exceed the projected change.')):'';
}
function renderHr() {
  const r=heartRateReserveZones({age:val('lab-hr-age'),restingHr:val('lab-hr-rest')});
  out('hr').innerHTML=r?resultBox(`${r.hrMax} bpm`,t('оценка HRmax','estimated HRmax'),`<div class="lab-result-grid">${r.zones.map((z)=>`<div><span>Zone ${z.zone}</span><b>${z.low}–${z.high}</b></div>`).join('')}</div>`,`${t('Формула HRmax имеет индивидуальную ошибку; измеренное значение предпочтительнее, если оно валидно и безопасно получено.','Predicted HRmax has individual error; a valid safely measured value is preferable.')}${evidence([r.evidenceId])}`):'';
}
function renderRunning() {
  const pace=paceFromDistanceTime({distanceKm:val('lab-run-d1'),timeMinutes:val('lab-run-t1')});
  const pred=riegelPrediction({knownDistanceKm:val('lab-run-d1'),knownTimeMinutes:val('lab-run-t1'),targetDistanceKm:val('lab-run-d2')});
  out('running').innerHTML=pace&&pred?resultBox(`${num(pace.minPerKm)} min/km`,`${num(pace.kmh)} km/h`,`<div class="lab-result-grid"><div><span>${t('Прогноз цели','Target prediction')}</span><b>${num(pred.minutes)} min</b></div><div><span>${t('Экспонента','Exponent')}</span><b>${pred.exponent}</b></div><div><span>${t('Тип','Type')}</span><b>${t('эмпирика','empirical')}</b></div></div>`,`${t('Прогноз чувствителен к дистанции и специфичности подготовки.','Prediction depends on distance and training specificity.')}${evidence([pred.evidenceId])}`):'';
}
function renderField() {
  const cooper=cooperVo2FromDistance(val('lab-cooper-distance'));
  const rp=rockportVo2({weightKg:val('lab-rp-weight'),age:val('lab-rp-age'),sex:val('lab-rp-sex'),timeMinutes:val('lab-rp-time'),heartRate:val('lab-rp-hr')});
  const kcal=metCalories({met:val('lab-met'),weightKg:val('lab-rp-weight'),minutes:val('lab-met-min')});
  out('field').innerHTML=cooper&&rp&&kcal?resultBox(`${num(cooper.vo2max,1)} ml/kg/min`,t('Cooper estimate','Cooper estimate'),`<div class="lab-result-grid"><div><span>Rockport</span><b>${num(rp.vo2max,1)}</b></div><div><span>MET kcal</span><b>${num(kcal.kcal,0)}</b></div><div><span>${t('Уверенность','Confidence')}</span><b>${t('полевой estimate','field estimate')}</b></div></div>`,`${t('Это непрямые оценки. MET — справочное популяционное значение, а не персональный калориметр.','These are indirect estimates. MET is a population reference, not a personal calorimeter.')}${evidence([cooper.evidenceId,rp.evidenceId,kcal.evidenceId])}`):'';
}

function renderAdaptive() {
  const r = adaptiveExpenditure(diary());
  if (!r.ready) {
    const coverage = Number(r.coverage || 0);
    out('adaptive').innerHTML = resultBox(
      t('Недостаточно данных','Not enough data'),
      t('нужны калории + вес минимум за 14 дней','calories + weight are needed across at least 14 days'),
      `<div class="lab-result-grid"><div><span>${t('Покрытие','Coverage')}</span><b>${Math.round(coverage*100)}%</b></div><div><span>${t('Дней с калориями','Calorie days')}</span><b>${r.loggedDays || 0}</b></div><div><span>${t('Дней с весом','Weight days')}</span><b>${r.weightDays || 0}</b></div></div>`,
      t('Заполняй вес и фактически съеденные калории в разделе Прогресс. Система не подменяет недостаток данных формульной псевдоточностью.','Log body weight and actual calorie intake in Progress. The system does not replace missing data with false precision.')
    );
    return;
  }
  out('adaptive').innerHTML = resultBox(
    `${num(r.central,0)} kcal/day`,
    t('адаптивная оценка расхода','adaptive expenditure estimate'),
    `<div class="lab-result-grid"><div><span>${t('Диапазон','Range')}</span><b>${num(r.range[0],0)}–${num(r.range[1],0)}</b></div><div><span>${t('Среднее питание','Average intake')}</span><b>${num(r.averageCalories,0)}</b></div><div><span>${t('Покрытие','Coverage')}</span><b>${Math.round(r.coverage*100)}%</b></div></div>`,
    `${t('Уверенность','Confidence')}: ${r.confidence}. ${t('Это прозрачная energy-balance эвристика, а не калориметрия. Краткосрочное изменение веса включает воду и другие компоненты, поэтому диапазон намеренно широкий.','This is a transparent energy-balance heuristic, not calorimetry. Short-term scale change includes water and other components, so the range is intentionally wide.')}<br>${t('Метод','Method')}: ${r.methodVersion} · ${t('сглаживание','smoothing')} ${r.smoothingDays} d`
  );
}

function renderConvert() {
  const r=convertUnits(val('lab-c-value'),val('lab-c-from'),val('lab-c-to'));
  out('convert').innerHTML=r==null?resultBox('—',t('Эта пара единиц несовместима','This unit pair is incompatible')):resultBox(num(r,3),`${val('lab-c-to')}`);
}

function calculateAll() {
  [renderE1rm,renderPercent,renderRepConvert,renderPlates,renderWarmup,renderVolume,renderEnergy,renderProtein,renderBody,renderHr,renderRunning,renderField,renderAdaptive,renderConvert].forEach((fn)=>fn());
}
function updateCategory() {
  section.querySelectorAll('[data-lab-category]').forEach((el)=>{el.hidden=el.dataset.labCategory!==activeCategory;});
  section.querySelectorAll('[data-lab-tab]').forEach((el)=>el.setAttribute('aria-pressed',String(el.dataset.labTab===activeCategory)));
}
function bind() {
  section.querySelectorAll('[data-lab-tab]').forEach((btn)=>btn.addEventListener('click',()=>{activeCategory=btn.dataset.labTab;updateCategory();}));
  section.querySelectorAll('[data-lab-form]').forEach((form)=>{
    form.addEventListener('submit',(e)=>e.preventDefault());
    form.addEventListener('input',calculateAll);
    form.addEventListener('change',calculateAll);
  });
  section.querySelector('[data-refresh-history]')?.addEventListener('click',renderVolume);
  section.querySelector('[data-refresh-adaptive]')?.addEventListener('click',renderAdaptive);
}

function addNavigation() {
  const topMenu=document.querySelector('#navmenu-more');
  if(topMenu&&!topMenu.querySelector('[href="#tools"]')) topMenu.insertAdjacentHTML('afterbegin', `<a href="#tools" data-v7-more="tools"><b>${t('Лаборатория','Lab')}</b><span data-v7-more-sub="tools">${t('Сила, питание, тело, кардио и конвертеры','Strength, nutrition, body, cardio and converters')}</span></a>`);
  const mobile=document.querySelector('#mobile-nav');
  if(mobile&&!mobile.querySelector('[href="#tools"]')) mobile.insertAdjacentHTML('afterbegin', `<a class="mnav-link" href="#tools"><span data-v7-more="tools">${t('Лаборатория','Lab')}</span><span>→</span></a>`);
  const group=document.querySelector('#v7-more-grid .v8-more-group');
  if(group&&!group.querySelector('[data-v7-route="tools"]')) group.querySelector('.v8-more-list')?.insertAdjacentHTML('afterbegin', `<button class="v7-more-item" type="button" data-v7-route="tools"><span class="v7-more-icon" aria-hidden="true">↗</span><span><b data-v7-more="tools">${t('Лаборатория','Lab')}</b><p data-v7-more-sub="tools">${t('Расчёты с объяснением','Calculations with interpretation')}</p></span><span aria-hidden="true">→</span></button>`);
}
function syncRoute() {
  const route=(location.hash||'#home').slice(1).split('?')[0];
  if(section)section.hidden=route!=='tools';
  addNavigation();
}
function init() {
  addStylesheet();
  section=document.createElement('section');
  section.id='tools';
  section.className='section v7-app-view';
  section.hidden=true;
  section.setAttribute('aria-labelledby','gym-tools-title');
  document.querySelector('main')?.appendChild(section);
  renderShell(); syncRoute();
  window.addEventListener('hashchange',syncRoute);
  const observer=new MutationObserver(()=>{
    if(lastLanguage!==document.documentElement.lang){lastLanguage=document.documentElement.lang;renderShell();}
    addNavigation();
  });
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  observer.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
