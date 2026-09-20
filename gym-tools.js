import {
  calculatePlates,
  estimateOneRepMax,
  sessionVolume,
  warmupRamp,
} from './tools/gym-calculators.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const isEnglish = () => document.documentElement.lang === 'en';
const text = (ru, en) => isEnglish() ? en : ru;
const number = (value) => Number(value).toLocaleString(isEnglish() ? 'en-US' : 'ru-RU', { maximumFractionDigits: 2 });

const defaultPairs = { 25: 2, 20: 2, 15: 2, 10: 4, 5: 4, 2.5: 4, 1.25: 4 };
let section;
let lastLanguage = document.documentElement.lang;

function field(id, label, value, attrs = '') {
  return `<label class="field" for="${id}"><span>${label}</span><input class="input" id="${id}" name="${id}" value="${value}" ${attrs}></label>`;
}

function renderShell() {
  if (!section) return;
  const en = isEnglish();
  section.innerHTML = `
    <div class="container gym-tools-shell">
      <div class="v7-page-head">
        <div><p class="eyebrow">${en ? 'LOAD MANAGEMENT' : 'УПРАВЛЕНИЕ НАГРУЗКОЙ'}</p><h1 id="gym-tools-title">${en ? 'Gym tools' : 'Инструменты зала'}</h1><p class="lede">${en ? 'Small, transparent calculations that turn the next set into a practical decision.' : 'Небольшие прозрачные расчёты, которые превращают следующий подход в практичное решение.'}</p></div>
      </div>
      <div class="gym-tools-grid">
        <article class="card gym-tool-card">
          <div class="card-head"><div><p class="eyebrow">e1RM</p><h2>${en ? 'Estimated one-rep max' : 'Расчёт e1RM'}</h2></div><span class="tool-mark">01</span></div>
          <p class="tiny">${en ? 'Two models are shown as a range, not as false precision.' : 'Две модели показаны диапазоном, а не ложной точностью.'}</p>
          <form data-gym-form="e1rm" class="form-grid gym-tool-form">
            ${field('gym-e1rm-weight', en ? 'Weight' : 'Вес', '80', 'type="number" min="0.5" step="0.5" inputmode="decimal" required')}
            ${field('gym-e1rm-reps', en ? 'Reps' : 'Повторы', '5', 'type="number" min="1" max="30" step="1" inputmode="numeric" required')}
            <label class="field" for="gym-e1rm-unit"><span>${en ? 'Unit' : 'Единицы'}</span><select class="select" id="gym-e1rm-unit"><option value="kg">kg</option><option value="lb">lb</option></select></label>
            <button class="btn btn-primary" type="submit">${en ? 'Estimate' : 'Рассчитать'}</button>
          </form>
          <div class="gym-tool-output" id="gym-e1rm-output" aria-live="polite"></div>
        </article>

        <article class="card gym-tool-card">
          <div class="card-head"><div><p class="eyebrow">PLATES</p><h2>${en ? 'Plate calculator' : 'Калькулятор блинов'}</h2></div><span class="tool-mark">02</span></div>
          <p class="tiny">${en ? 'The result is for one side. Available values mean pairs.' : 'Результат показан на одну сторону. Доступное количество — это пары.'}</p>
          <form data-gym-form="plates" class="form-grid gym-tool-form">
            ${field('gym-plates-target', en ? 'Target total' : 'Целевой общий вес', '100', 'type="number" min="0.5" step="0.5" inputmode="decimal" required')}
            ${field('gym-plates-bar', en ? 'Bar' : 'Гриф', '20', 'type="number" min="0.5" step="0.5" inputmode="decimal" required')}
            ${field('gym-plates-collars', en ? 'Collars' : 'Замки', '0', 'type="number" min="0" step="0.5" inputmode="decimal"')}
            <label class="field" for="gym-plates-unit"><span>${en ? 'Unit' : 'Единицы'}</span><select class="select" id="gym-plates-unit"><option value="kg">kg</option><option value="lb">lb</option></select></label>
            <div class="plate-options" role="group" aria-label="${en ? 'Available plate pairs' : 'Доступные пары блинов'}">${Object.keys(defaultPairs).map((value) => field(`gym-pair-${value.replace('.', '-')}`, `${value} kg`, defaultPairs[value], 'type="number" min="0" max="20" step="1" inputmode="numeric"')).join('')}</div>
            <button class="btn btn-primary" type="submit">${en ? 'Find plates' : 'Подобрать блины'}</button>
          </form>
          <div class="gym-tool-output" id="gym-plates-output" aria-live="polite"></div>
        </article>

        <article class="card gym-tool-card">
          <div class="card-head"><div><p class="eyebrow">WARM-UP</p><h2>${en ? 'Warm-up ramp' : 'Разминочные подходы'}</h2></div><span class="tool-mark">03</span></div>
          <p class="tiny">${en ? 'A practical editable template. Warm-up sets are not working volume.' : 'Практический редактируемый шаблон. Разминочные подходы не считаются рабочим объёмом.'}</p>
          <form data-gym-form="warmup" class="form-grid gym-tool-form">
            ${field('gym-warmup-working', en ? 'Working weight' : 'Рабочий вес', '100', 'type="number" min="0.5" step="0.5" inputmode="decimal" required')}
            ${field('gym-warmup-bar', en ? 'Empty bar' : 'Пустой гриф', '20', 'type="number" min="0.5" step="0.5" inputmode="decimal" required')}
            ${field('gym-warmup-step', en ? 'Smallest increment' : 'Минимальный шаг', '2.5', 'type="number" min="0.5" step="0.5" inputmode="decimal" required')}
            <button class="btn btn-primary" type="submit">${en ? 'Build ramp' : 'Собрать ramp'}</button>
          </form>
          <div class="gym-tool-output" id="gym-warmup-output" aria-live="polite"></div>
        </article>

        <article class="card gym-tool-card gym-tool-volume">
          <div class="card-head"><div><p class="eyebrow">TRAINING SIGNAL</p><h2>${en ? 'Recorded volume' : 'Записанный объём'}</h2></div><span class="tool-mark">04</span></div>
          <p class="tiny">${en ? 'Only completed weighted sets from local history. Tonnage compares best with the same exercise over time.' : 'Только завершённые отягощённые подходы из локальной истории. Тоннаж корректно сравнивать прежде всего у одного упражнения с самим собой.'}</p>
          <div id="gym-volume-output" class="gym-tool-output" aria-live="polite"></div>
          <button class="btn btn-quiet" type="button" data-gym-refresh-volume>${en ? 'Refresh from history' : 'Обновить из истории'}</button>
        </article>
      </div>
    </div>`;
  bindForms();
  calculateAll();
}

function showOneRepMax(form) {
  const result = estimateOneRepMax(form.querySelector('#gym-e1rm-weight').value, form.querySelector('#gym-e1rm-reps').value);
  const output = section.querySelector('#gym-e1rm-output');
  if (!result) { output.innerHTML = `<p class="form-error">${text('Введи вес и от 1 до 30 повторов.', 'Enter a weight and 1–30 reps.')}</p>`; return; }
  const unit = form.querySelector('#gym-e1rm-unit').value;
  const confidence = result.confidence === 'high' ? text('выше', 'higher') : result.confidence === 'medium' ? text('средняя', 'medium') : text('ниже', 'lower');
  const rows = [50, 60, 70, 75, 80, 85, 90, 95].map((percent) => `<div><span>${percent}%</span><b>${number(result.central * percent / 100)} ${unit}</b></div>`).join('');
  output.innerHTML = `<div class="gym-result-main"><strong>${number(result.central)} ${unit}</strong><span>${text('центральная оценка', 'central estimate')} · ${text('диапазон', 'range')} ${number(result.range[0])}–${number(result.range[1])} ${unit}</span></div><p class="tiny">${text('Уверенность', 'Confidence')}: ${confidence}. ${result.reps > 15 ? text('При большом числе повторов неопределённость выше.', 'Uncertainty is higher at higher rep counts.') : ''}</p><div class="gym-percent-table">${rows}</div>`;
}

function showPlates(form) {
  const values = Object.fromEntries(Object.keys(defaultPairs).map((value) => [value, form.querySelector(`#gym-pair-${value.replace('.', '-')}`).value]));
  const result = calculatePlates({
    targetTotal: form.querySelector('#gym-plates-target').value,
    barWeight: form.querySelector('#gym-plates-bar').value,
    collars: form.querySelector('#gym-plates-collars').value,
    availablePairs: values,
  });
  const output = section.querySelector('#gym-plates-output');
  if (!result) { output.innerHTML = `<p class="form-error">${text('Введи целевой вес.', 'Enter a target weight.')}</p>`; return; }
  const unit = form.querySelector('#gym-plates-unit').value;
  const plates = result.perSide.length ? result.perSide.map((plate) => `${number(plate)} ${unit}`).join(' + ') : text('без блинов', 'no plates');
  const delta = Math.abs(result.difference) < 0.01 ? text('точно', 'exact') : `${result.difference > 0 ? '+' : ''}${number(result.difference)} ${unit}`;
  output.innerHTML = `<div class="gym-result-main"><strong>${esc(plates)}</strong><span>${text('на одну сторону', 'per side')} · ${text('итого', 'total')} ${number(result.achievedTotal)} ${unit}</span></div><p class="tiny">${text('Разница', 'Difference')}: ${delta}. ${result.exact ? '' : text('Ближайший достижимый вес с выбранными парами.', 'Closest achievable weight with the selected pairs.')}</p>`;
}

function showWarmup(form) {
  const sets = warmupRamp({ workingWeight: form.querySelector('#gym-warmup-working').value, barWeight: form.querySelector('#gym-warmup-bar').value, increment: form.querySelector('#gym-warmup-step').value });
  const output = section.querySelector('#gym-warmup-output');
  output.innerHTML = sets.length ? `<div class="gym-warmup-list">${sets.map((set, index) => `<div><span>${String(index + 1).padStart(2, '0')}</span><b>${number(set.weight)}</b><small>${set.reps} ${text('повторов', 'reps')} · ${esc(set.label)}</small></div>`).join('')}</div><p class="tiny">${text('Шаблон можно изменить под упражнение и самочувствие.', 'Edit the template for the movement and how you feel.')}</p>` : `<p class="tiny">${text('Укажи рабочий вес.', 'Enter a working weight.')}</p>`;
}

function readHistory() {
  try { const value = JSON.parse(localStorage.getItem('mmg.history.v1') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}

function renderVolume() {
  const history = readHistory();
  const sets = history.flatMap((session) => (session.items || []).flatMap((item) => item.setLog || []));
  const total = sessionVolume(sets);
  const sessions = history.length;
  const output = section.querySelector('#gym-volume-output');
  output.innerHTML = `<div class="gym-volume-kpis"><div><span>${text('Сессий', 'Sessions')}</span><b>${sessions}</b></div><div><span>${text('Тоннаж', 'Volume load')}</span><b>${number(total)} kg</b></div><div><span>${text('Источник', 'Source')}</span><b>${text('локально', 'local')}</b></div></div>${total ? `<p class="tiny">${text('В расчёт попали только подходы с весом и повторениями; собственный вес не превращается в фиктивный тоннаж.', 'Only sets with weight and reps are counted; bodyweight work is not turned into fake tonnage.')}</p>` : `<p class="tiny">${text('После первой завершённой тренировки здесь появится объём.', 'Recorded volume appears after your first completed workout.')}</p>`}`;
}

function calculateAll() {
  const e1rm = section.querySelector('[data-gym-form="e1rm"]');
  const plates = section.querySelector('[data-gym-form="plates"]');
  const warmup = section.querySelector('[data-gym-form="warmup"]');
  applyPrefill(e1rm);
  showOneRepMax(e1rm); showPlates(plates); showWarmup(warmup); renderVolume();
}

function applyPrefill(form) {
  let applied = false;
  try {
    const raw = sessionStorage.getItem('mmg.gym-prefill.v1');
    if (!raw) return false;
    const value = JSON.parse(raw);
    if (value?.weight && form.querySelector('#gym-e1rm-weight')) { form.querySelector('#gym-e1rm-weight').value = value.weight; applied = true; }
    if (value?.reps && form.querySelector('#gym-e1rm-reps')) { form.querySelector('#gym-e1rm-reps').value = value.reps; applied = true; }
    sessionStorage.removeItem('mmg.gym-prefill.v1');
  } catch { /* optional convenience only */ }
  return applied;
}

function bindForms() {
  section.querySelectorAll('[data-gym-form]').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.dataset.gymForm === 'e1rm') showOneRepMax(form);
    if (form.dataset.gymForm === 'plates') showPlates(form);
    if (form.dataset.gymForm === 'warmup') showWarmup(form);
  }));
  section.querySelector('[data-gym-refresh-volume]')?.addEventListener('click', renderVolume);
}

function addNavigation() {
  const topMenu = document.querySelector('#navmenu-more');
  if (topMenu && !topMenu.querySelector('[href="#tools"]')) topMenu.insertAdjacentHTML('afterbegin', '<a href="#tools" data-v7-more="tools"><b>Инструменты</b><span data-v7-more-sub="tools">e1RM, блины и разминочные подходы</span></a>');
  const mobile = document.querySelector('#mobile-nav');
  if (mobile && !mobile.querySelector('[href="#tools"]')) mobile.insertAdjacentHTML('afterbegin', '<a class="mnav-link" href="#tools"><span data-v7-more="tools">Инструменты</span><span>→</span></a>');
  const moreGrid = document.querySelector('#v7-more-grid .v8-more-group');
  if (moreGrid && !moreGrid.querySelector('[data-v7-route="tools"]')) {
    const list = moreGrid.querySelector('.v8-more-list');
    list?.insertAdjacentHTML('afterbegin', '<button class="v7-more-item" type="button" data-v7-route="tools"><span class="v7-more-icon" aria-hidden="true">↗</span><span><b data-v7-more="tools">Инструменты</b><p data-v7-more-sub="tools">e1RM, блины и разминка</p></span><span aria-hidden="true">→</span></button>');
  }
}

function addWorkoutLink() {
  const head = document.querySelector('#workout .section-head');
  if (!head || head.querySelector('[data-gym-workout-link]')) return;
  const link = document.createElement('a');
  link.className = 'btn btn-quiet gym-workout-link';
  link.href = '#tools';
  link.dataset.gymWorkoutLink = 'true';
  link.textContent = text('Калькуляторы нагрузки', 'Load calculators');
  head.appendChild(link);
}

function syncRoute() {
  const route = (location.hash || '#home').slice(1).split('?')[0];
  if (section) section.hidden = route !== 'tools';
  if (route === 'tools' && section) {
    const form = section.querySelector('[data-gym-form="e1rm"]');
    if (form && applyPrefill(form)) showOneRepMax(form);
  }
  addNavigation();
  addWorkoutLink();
}

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
    if (lastLanguage !== document.documentElement.lang) { lastLanguage = document.documentElement.lang; renderShell(); }
    addNavigation();
    addWorkoutLink();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
