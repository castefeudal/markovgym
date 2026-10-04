/* ============================================================================
   MARKOV MADE GYM — прикладной слой
   Одна точка инициализации, централизованное состояние, делегирование событий.
   Разделы: 1 утилиты · 2 хранилище · 3 словари · 4 i18n · 5 данные
            6 состояние · 7 библиотека · 8 модальное окно · 9 тренировка
            10 КБЖУ · 11 план · 12 заявка · 13 оверлеи
            15 экосистема тренера · 16 инструменты · 17 словари слоя
            18 связывание · 14 инициализация
   ========================================================================= */
import './bootstrap.js';
import { createPreferenceWriter } from './src/features/exercise/preference-write-queue.mjs';
import { workoutAlreadySaved } from './src/features/workout/save-state.mjs';
import { progressIntelligenceHtmlView } from './src/features/progress/progressintelligence-view.mjs';
import { renderHistoryView } from './src/features/workout/history-view.mjs';
import { renderProgramWizardView } from './src/features/program/programwizard-view.mjs';
import { renderV7SettingsView } from './src/features/settings/v7settings-view.mjs';
import { renderExerciseTechniqueView } from './src/features/exercise/exercisetechnique-view.mjs';
import { renderWorkoutView } from './src/features/workout/workout-view.mjs';
import { bindSessionLifecycle } from './src/features/workout/session-lifecycle.mjs';
import { cardHtmlView } from './src/features/exercise/card-view.mjs';
import { renderNutritionTrendView } from './src/features/nutrition/nutritiontrend-view.mjs';
import { renderV7HomeView } from './src/features/today/v7home-view.mjs';
import { renderRunView } from './src/features/workout/run-view.mjs';
import { CORE_TRANSLATIONS, LEGACY_ENGLISH } from './src/app/catalog.mjs';
import { mergeEnglishCompatibility } from './src/app/i18n.mjs';
import { createLocalFirstStore } from './src/persistence/local-first-store.mjs';
import { createInitialState } from './src/app/state.mjs';
import { subscribeToHashChanges } from './src/app/router.mjs';
import { searchCommandPalette } from './src/features/command-palette/search.mjs';
import { createCustomExerciseRuntimeRecord, decodeCompactExercises } from './src/data/exercise-repository.mjs';
import { cleanSetRecord, ensureSetLog, normalizeWorkoutRecord } from './src/features/workout/workout-records.mjs';
import { progressionTrackingType } from './src/features/workout/progression-adapter.mjs';
import { cleanExercisePreferences as normalizeExercisePreferences, exercisePreference as getExercisePreference, exercisePreferenceScore as rankByPreference, EXERCISE_PREFERENCE_VALUES } from './src/features/exercise/preferences.mjs';
import { buildWeeklyPlan } from './src/features/program/plan-builder.mjs';
import { diaryAverage, diaryDelta as calculateDiaryDelta } from './src/features/progress/diary-analytics.mjs';
import { progressSummary, progressVerdictKey } from './src/features/progress/summary.mjs';
import { progressChartModel } from './src/features/progress/chart-model.mjs';
import { renderProgressChart } from './src/features/progress/chart-view.mjs';
import { backupEnvelopeError, parseBackupJson, validateBackupField } from './src/features/backup/backup-fields.mjs';
import { cleanLoadIncrementOverrides, equipmentLoadIncrement } from './src/features/workout/equipment-increments.mjs';

(function () {
  'use strict';

  /* ---------- 1. УТИЛИТЫ -------------------------------------------------- */
  var $ = function (id) { return document.getElementById(id); };
  var qs = function (sel, root) { return (root || document).querySelector(sel); };
  var qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }

  function norm(v) {
    return String(v == null ? '' : v)
      .toLowerCase()
      .replace(/\u0451/g, '\u0435')      // ё → е
      .replace(/[^\p{L}\p{N}]+/gu, ' ')  // всё, кроме букв и цифр → пробел
      .trim();
  }

  function clamp(n, min, max) { return n < min ? min : n > max ? max : n; }
  function round(n) { return Math.round(Number(n) || 0); }

  function debounce(fn, wait) {
    var timer = 0;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function fmt(str, vals) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vals, k) ? vals[k] : m;
    });
  }

  var REDUCED_MOTION = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false, addEventListener: function () {} };
  var FINE_POINTER = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : { matches: false };
  var MOBILE_MQ = window.matchMedia ? window.matchMedia('(max-width: 860px)') : { matches: false };

  /* ---------- 2. ХРАНИЛИЩЕ ------------------------------------------------ */
  var memoryStore = null;
  var storageWarnings = [];
  var lastLocalError = null;
  var historyRepository = null;
  var writePreferenceSnapshot = createPreferenceWriter(function(){return historyRepository;});
  var indexedAppStateKeys = Object.create(null);
  var indexedRepositoryKeys = Object.create(null);
  var indexedAppStateReady = false;
  var pendingAppStateWrites = [];
  function queueAppStateWrite(key, value, remove) {
    var isProgram = key === K.plan;
    var isDiary = key === K.diary;
    if (!indexedAppStateReady || !historyRepository || (!isProgram && !isDiary && !indexedAppStateKeys[key])) return;
    var write = isProgram
      ? (remove ? historyRepository.clearProgram() : historyRepository.writeProgram(String(value)))
      : isDiary
        ? historyRepository.replaceMeasurements(remove ? [] : store.json(K.diary, []))
        : (remove ? historyRepository.deleteUserState(key) : historyRepository.writeUserState(key, String(value)));
    pendingAppStateWrites.push(write.then(function () {
      if (isProgram) databaseProgram = remove ? null : String(value);
      else if (isDiary) databaseMeasurements = remove ? [] : cleanMeasurementsFn(store.json(K.diary, []));
      else if (remove) delete databaseAppState[key]; else databaseAppState[key] = String(value);
      return null;
    }).catch(function (error) {
      storageWarnings.push({ key: key, type: 'indexeddb-write', at: Date.now() });
      try { if (storageOk) { if (remove) window.localStorage.removeItem(key); else window.localStorage.setItem(key, String(value)); } } catch (_fallbackError) {}
      return error;
    }));
  }
  function flushAppStateWrites() {
    var writes = pendingAppStateWrites.splice(0);
    return Promise.all(writes).then(function (results) {
      var failure = results.filter(Boolean)[0];
      if (failure) throw failure;
    });
  }
  var databaseHistory = null;
  var databaseNutritionDays = [];
  var databaseMeasurements = [];
  var databaseCalculatorResults = [];
  var databaseCustomExercises = [];
  var databaseEquipmentProfiles = [];
  var databaseExercisePreferences = {};
  var databaseAppState = {};
  var databaseProgram = null;
  var cleanIdbExercisePreferences = function (value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; };
  var cleanCalculatorResultsFn = function () { return []; };
  var cleanNutritionDays = function (rows) { return Array.isArray(rows) ? rows.filter(function (row) { return row && typeof row === 'object'; }) : []; };
  var cleanMeasurementsFn = function (rows) { return Array.isArray(rows) ? rows.filter(function (row) { return row && typeof row === 'object' && row.date; }) : []; };
  var cleanEquipmentProfiles = function (rows) { return Array.isArray(rows) ? rows.filter(function (row) { return row && typeof row === 'object'; }) : []; };
  var activeEquipmentProfileId = '';
  var cleanCustomExercises = function (rows) { return Array.isArray(rows) ? rows.filter(function (row) { return row && typeof row === 'object'; }) : []; };
  var historyVisibleCount = 20;
  var historyFilters = { query:'', from:'', to:'', programme:'', exercise:'', durationMin:'', durationMax:'', prOnly:false };
  var todayDecisionEngine = null;
  var mesocycleStatusFn = null;
  var weeklyReviewDecisionFn = null;
  var cleanWeeklyReviewsFn = function () { return []; };
  var weightTrendFn = null;
  var weeklyNutritionBudgetFn = null;
  var substitutionRanker = null;
  var workoutExecutionOrderFn = null;
  var routeIsKnown = null;
  var normalizeRouteHash = null;
  var runtimeTranslator = null;
  var storageOk = (function () {
    try {
      var k = '__mmg_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  var K = {
    fav: 'mmg.favorites.v8',
    exercisePreferences: 'mmg.exercisePreferences.v1',
    workout: 'mmg.workout.v2',
    lang: 'mmg.lang.v2',
    theme: 'mmg.theme.v2',
    schema: 'mmg.schema.v3',
    density: 'mmg.density.v2',
    legacyFav: 'mmg_favorites_v7',
    legacyWorkout: 'mmg_current_workout_v1',
    legacyLang: 'mmg_lang_v1',
    legacyTheme: 'mmg_theme_v7'
  };

  var store = createLocalFirstStore({
    storage: storageOk ? window.localStorage : null,
    isIndexedDBOwned: function (key) {
      return indexedAppStateReady && key !== K.settings &&
        (Object.prototype.hasOwnProperty.call(indexedAppStateKeys, key) || Object.prototype.hasOwnProperty.call(indexedRepositoryKeys, key));
    },
    enqueueIndexedDBWrite: queueAppStateWrite,
    onWarning: function (warning) { storageWarnings.push(warning); }
  });
  memoryStore = store.memory;

  /* ---------- 3. СЛОВАРИ -------------------------------------------------- */
  var RU_ZONE = {
    'back': 'Спина', 'cardio': 'Кардио', 'chest': 'Грудь', 'lower arms': 'Предплечья',
    'lower legs': 'Голени', 'neck': 'Шея', 'shoulders': 'Плечи', 'upper arms': 'Руки',
    'upper legs': 'Ноги', 'waist': 'Пресс и кор'
  };
  var EN_ZONE = {
    'back': 'Back', 'cardio': 'Cardio', 'chest': 'Chest', 'lower arms': 'Forearms',
    'lower legs': 'Lower legs', 'neck': 'Neck', 'shoulders': 'Shoulders', 'upper arms': 'Arms',
    'upper legs': 'Legs', 'waist': 'Core'
  };
  var RU_EQ = {
    'assisted': 'С поддержкой', 'band': 'Резинка', 'barbell': 'Штанга', 'body weight': 'Собственный вес',
    'bosu ball': 'BOSU', 'cable': 'Блок / кроссовер', 'dumbbell': 'Гантели', 'elliptical machine': 'Эллипсоид',
    'ez barbell': 'EZ-гриф', 'hammer': 'Кувалда', 'kettlebell': 'Гиря', 'leverage machine': 'Тренажёр',
    'medicine ball': 'Медбол', 'olympic barbell': 'Олимпийская штанга', 'resistance band': 'Эспандер',
    'roller': 'Ролик', 'rope': 'Канат', 'skierg machine': 'SkiErg', 'sled machine': 'Сани',
    'smith machine': 'Машина Смита', 'stability ball': 'Фитбол', 'stationary bike': 'Велотренажёр',
    'stepmill machine': 'Степпер', 'tire': 'Покрышка', 'trap bar': 'Трэп-гриф',
    'upper body ergometer': 'Эргометр для рук', 'weighted': 'С отягощением', 'wheel roller': 'Ролик для пресса'
  };
  var EN_EQ = {
    'assisted': 'Assisted', 'band': 'Band', 'barbell': 'Barbell', 'body weight': 'Body weight',
    'bosu ball': 'Bosu ball', 'cable': 'Cable', 'dumbbell': 'Dumbbell', 'elliptical machine': 'Elliptical',
    'ez barbell': 'EZ bar', 'hammer': 'Hammer', 'kettlebell': 'Kettlebell', 'leverage machine': 'Machine',
    'medicine ball': 'Medicine ball', 'olympic barbell': 'Olympic barbell', 'resistance band': 'Resistance band',
    'roller': 'Roller', 'rope': 'Rope', 'skierg machine': 'SkiErg', 'sled machine': 'Sled',
    'smith machine': 'Smith machine', 'stability ball': 'Stability ball', 'stationary bike': 'Stationary bike',
    'stepmill machine': 'Stepmill', 'tire': 'Tire', 'trap bar': 'Trap bar',
    'upper body ergometer': 'Upper-body ergometer', 'weighted': 'Weighted', 'wheel roller': 'Ab wheel'
  };
  var RU_MU = {
    'abdominals': 'Мышцы живота', 'abductors': 'Отводящие бедра', 'abs': 'Пресс', 'adductors': 'Приводящие бедра',
    'ankle stabilizers': 'Стабилизаторы стопы', 'ankles': 'Голеностоп', 'back': 'Спина', 'biceps': 'Бицепс',
    'brachialis': 'Плечевая мышца', 'calves': 'Икры', 'cardiovascular system': 'Сердечно-сосудистая система',
    'chest': 'Грудные', 'core': 'Кор', 'deltoids': 'Дельты', 'delts': 'Дельты', 'feet': 'Стопы',
    'forearms': 'Предплечья', 'glutes': 'Ягодицы', 'grip muscles': 'Хват', 'groin': 'Приводящие',
    'hamstrings': 'Бицепс бедра', 'hands': 'Кисти', 'hip flexors': 'Сгибатели бедра', 'inner thighs': 'Внутренняя поверхность бедра',
    'latissimus dorsi': 'Широчайшие', 'lats': 'Широчайшие', 'levator scapulae': 'Подниматель лопатки',
    'lower abs': 'Низ пресса', 'lower back': 'Поясница', 'obliques': 'Косые живота', 'pectorals': 'Грудные',
    'quadriceps': 'Квадрицепс', 'quads': 'Квадрицепс', 'rear deltoids': 'Задние дельты', 'rhomboids': 'Ромбовидные',
    'rotator cuff': 'Вращательная манжета', 'serratus anterior': 'Передняя зубчатая', 'shins': 'Передняя большеберцовая',
    'shoulders': 'Плечи', 'soleus': 'Камбаловидная', 'spine': 'Разгибатели спины',
    'sternocleidomastoid': 'Грудино-ключично-сосцевидная', 'trapezius': 'Трапеции', 'traps': 'Трапеции',
    'triceps': 'Трицепс', 'upper back': 'Верх спины', 'upper chest': 'Верх груди',
    'wrist extensors': 'Разгибатели запястья', 'wrist flexors': 'Сгибатели запястья', 'wrists': 'Запястья'
  };
  var EN_MU = {
    'abdominals': 'Abdominals', 'abductors': 'Abductors', 'abs': 'Abs', 'adductors': 'Adductors',
    'ankle stabilizers': 'Ankle stabilizers', 'ankles': 'Ankles', 'back': 'Back', 'biceps': 'Biceps',
    'brachialis': 'Brachialis', 'calves': 'Calves', 'cardiovascular system': 'Cardiovascular system',
    'chest': 'Chest', 'core': 'Core', 'deltoids': 'Deltoids', 'delts': 'Delts', 'feet': 'Feet',
    'forearms': 'Forearms', 'glutes': 'Glutes', 'grip muscles': 'Grip muscles', 'groin': 'Groin',
    'hamstrings': 'Hamstrings', 'hands': 'Hands', 'hip flexors': 'Hip flexors', 'inner thighs': 'Inner thighs',
    'latissimus dorsi': 'Latissimus dorsi', 'lats': 'Lats', 'levator scapulae': 'Levator scapulae',
    'lower abs': 'Lower abs', 'lower back': 'Lower back', 'obliques': 'Obliques', 'pectorals': 'Pectorals',
    'quadriceps': 'Quadriceps', 'quads': 'Quads', 'rear deltoids': 'Rear deltoids', 'rhomboids': 'Rhomboids',
    'rotator cuff': 'Rotator cuff', 'serratus anterior': 'Serratus anterior', 'shins': 'Shins',
    'shoulders': 'Shoulders', 'soleus': 'Soleus', 'spine': 'Spinal erectors',
    'sternocleidomastoid': 'Sternocleidomastoid', 'trapezius': 'Trapezius', 'traps': 'Traps',
    'triceps': 'Triceps', 'upper back': 'Upper back', 'upper chest': 'Upper chest',
    'wrist extensors': 'Wrist extensors', 'wrist flexors': 'Wrist flexors', 'wrists': 'Wrists'
  };

  function labelZone(key) { return (S.lang === 'en' ? EN_ZONE : RU_ZONE)[key] || key; }
  function labelEq(key) { return (S.lang === 'en' ? EN_EQ : RU_EQ)[key] || key; }
  function labelMu(key) { return (S.lang === 'en' ? EN_MU : RU_MU)[key] || key; }

  /* ---------- 4. I18N ----------------------------------------------------- */
  /* Runtime copy lives in src/app/catalog.mjs; HTML-derived Russian remains
     the compatibility source for older English-only keys. */
  var T = Object.assign({}, CORE_TRANSLATIONS);

  function t(key, vals) {
    if (runtimeTranslator) return runtimeTranslator(key, vals);
    var entry = T[key];
    var str = entry ? (entry[S.lang] || entry.ru) : key;
    return vals ? fmt(str, vals) : str;
  }

  var RU_DOM = {};
  function captureRu() {
    qsa('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (!(k in RU_DOM)) RU_DOM[k] = el.textContent;
    });
    qsa('[data-i18n-ph]').forEach(function (el) {
      var k = 'ph:' + el.getAttribute('data-i18n-ph');
      if (!(k in RU_DOM)) RU_DOM[k] = el.getAttribute('placeholder') || '';
    });
    qsa('[data-i18n-aria]').forEach(function (el) {
      var k = 'aria:' + el.getAttribute('data-i18n-aria');
      if (!(k in RU_DOM)) RU_DOM[k] = el.getAttribute('aria-label') || '';
    });
    qsa('[data-i18n-alt]').forEach(function (el) {
      var k = 'alt:' + el.getAttribute('data-i18n-alt');
      if (!(k in RU_DOM)) RU_DOM[k] = el.getAttribute('alt') || '';
    });
  }

  function registerLegacyEnglishStrings() {
    mergeEnglishCompatibility(T, LEGACY_ENGLISH, RU_DOM);
  }

  function domText(key, fallbackKey) {
    var translated = t(key);
    if (translated !== key) return translated;
    return RU_DOM[fallbackKey || key] || '';
  }

  var SEO_COPY = {
    ru: {
      title: 'MARKOV MADE GYM — 1324 упражнения, техника, КБЖУ и план тренировок',
      description: 'Библиотека 1324 упражнений с техникой, персональным подбором, избранным, конструктором тренировки, расчётом КБЖУ и планом недели. Без регистрации.',
      ogTitle: 'MARKOV MADE GYM — тренировка начинается с точного выбора',
      ogDescription: '1324 упражнения, персональный подбор, техника, КБЖУ, план недели и дневник прогресса в одной системе Павла Маркова.',
      imageAlt: 'MARKOV MADE GYM — система тренировок Павла Маркова'
    },
    en: {
      title: 'MARKOV MADE GYM — 1,324 exercises, technique, macros and training plans',
      description: 'A library of 1,324 exercises with technique guides, personalised starting recommendations, saved workouts, macro calculations and weekly planning. No sign-up.',
      ogTitle: 'MARKOV MADE GYM — training starts with an accurate choice',
      ogDescription: '1,324 exercises, personalised guidance, technique, macros, weekly planning and progress tracking in Pavel Markov’s system.',
      imageAlt: 'MARKOV MADE GYM — Pavel Markov’s training system'
    }
  };

  function setMeta(selector, value) {
    var node = document.querySelector(selector);
    if (node) node.setAttribute('content', value);
  }

  function updateSeo() {
    var en = S.lang === 'en';
    var copy = SEO_COPY[en ? 'en' : 'ru'];
    var pageUrl = 'https://markovmade.com/gym/' + (en ? '?lang=en' : '');
    document.title = copy.title;
    setMeta('meta[name="description"]', copy.description);
    setMeta('meta[property="og:locale"]', en ? 'en_US' : 'ru_RU');
    setMeta('meta[property="og:title"]', copy.ogTitle);
    setMeta('meta[property="og:description"]', copy.ogDescription);
    setMeta('meta[property="og:url"]', pageUrl);
    setMeta('meta[property="og:image:alt"]', copy.imageAlt);
    setMeta('meta[name="twitter:title"]', copy.ogTitle);
    setMeta('meta[name="twitter:description"]', copy.ogDescription);
    setMeta('meta[name="twitter:image:alt"]', copy.imageAlt);
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = pageUrl;
    var schema = $('structured-data');
    if (!schema) return;
    try {
      var data = JSON.parse(schema.textContent);
      var graph = data['@graph'] || [];
      graph.forEach(function (item) {
        if (item['@type'] === 'WebSite') item.inLanguage = en ? 'en-US' : 'ru-RU';
        if (Array.isArray(item['@type']) && item['@type'].indexOf('WebPage') !== -1) {
          item.name = copy.title; item.description = copy.description; item.inLanguage = en ? 'en-US' : 'ru-RU';
        }
        if (item['@type'] === 'SoftwareApplication') {
          delete item.offers;
          item.description = copy.ogDescription;
          item.inLanguage = ['ru', 'en'];
        }
        if (item['@type'] === 'ProfilePage') {
          item.name = en ? 'Pavel Markov — creator of MARKOV MADE GYM' : 'Павел Марков — автор MARKOV MADE GYM';
          item.inLanguage = en ? 'en-US' : 'ru-RU';
        }
        if (item['@type'] === 'FAQPage') {
          item.mainEntity = qsa('#faq .faq-item').map(function (faq) {
            return {
              '@type': 'Question',
              name: qs('summary', faq).textContent.trim(),
              acceptedAnswer: { '@type': 'Answer', text: qs('p', faq).textContent.trim() }
            };
          });
        }
      });
      schema.textContent = JSON.stringify(data);
    } catch (e) {}
  }

  function applyLang(initial) {
    var en = S.lang === 'en';
    document.documentElement.lang = en ? 'en' : 'ru';

    qsa('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      el.textContent = domText(k);
    });
    qsa('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph');
      el.setAttribute('placeholder', domText(k, 'ph:' + k));
    });
    qsa('[data-i18n-aria]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-aria');
      el.setAttribute('aria-label', domText(k, 'aria:' + k));
    });
    qsa('[data-i18n-alt]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-alt');
      el.setAttribute('alt', domText(k, 'alt:' + k));
    });

    qsa('[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang));
    });

    store.set(K.lang, S.lang);
    if (!initial && window.history && history.replaceState) {
      try {
        var url = new URL(window.location.href);
        if (en) url.searchParams.set('lang', 'en'); else url.searchParams.delete('lang');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch (e) { /* local/offline documents can have an opaque origin */ }
    }
    updateSeo();
    renderMuscleBoard();
    renderFilters();
    renderResults();
    renderWorkout();
    renderKbjuPlaceholder();
    renderPlanPlaceholder();
    renderEco(initial);
    if (!initial) {
      if ($('kbju-out').getAttribute('data-filled') === 'true') { try { calcKbju(); } catch (e) {} }
      if ($('plan-out').getAttribute('data-filled') === 'true') { try { buildPlan(); } catch (e) {} }
    }
    if (S.activeId) openExercise(S.activeId, null, true);
  }

  /* ---------- 5. ДАННЫЕ --------------------------------------------------- */
  var EX = [];
  var BY_ID = Object.create(null);
  var ZONES = [], EQUIPMENT = [], MUSCLES = [];
  var COUNT_ZONE = Object.create(null), COUNT_MU = Object.create(null), COUNT_EQ = Object.create(null);
  var DATA_EXPECTED = 1324;
  var DATA_READY = false;
  var DATA_PROMISE = null;

  function makeCustomExerciseRuntimeRecord(record, index) {
    return createCustomExerciseRuntimeRecord(record, index, { equipmentWeight: EQUIP_WEIGHT, normalize: norm, transliterate: translitRu });
  }

  var EQUIP_WEIGHT = {
    'barbell': 5, 'olympic barbell': 5, 'trap bar': 5, 'ez barbell': 4,
    'dumbbell': 4, 'body weight': 4, 'kettlebell': 4, 'smith machine': 3,
    'cable': 3, 'leverage machine': 3, 'weighted': 3, 'band': 2,
    'resistance band': 2, 'assisted': 2, 'sled machine': 2, 'medicine ball': 2
  };

  var HOME_EQUIP = ['body weight', 'dumbbell', 'band', 'resistance band', 'kettlebell', 'stability ball', 'medicine ball', 'roller', 'wheel roller', 'bosu ball'];
  var GYM_EQUIP = ['barbell', 'ez barbell', 'olympic barbell', 'trap bar', 'cable', 'leverage machine', 'smith machine', 'dumbbell', 'body weight', 'kettlebell', 'weighted', 'assisted', 'sled machine'];

  async function fetchData() {
    var raw;
    try {
      var response = await fetch(new URL('./data/exercises-compact.json', document.baseURI), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('exercise data ' + response.status);
      raw = await response.json();
    } catch (e) {
      return false;
    }
    if (!raw || !Array.isArray(raw.x) || !raw.x.length) return false;

    EX = decodeCompactExercises(raw, { equipmentWeight: EQUIP_WEIGHT, normalize: norm });
    EX.forEach(function (ex) {
      ex.search = norm([
        ex.search, RU_ZONE[ex.zone], EN_ZONE[ex.zone], RU_EQ[ex.equip], EN_EQ[ex.equip],
        RU_MU[ex.target], EN_MU[ex.target], RU_MU[ex.group],
        ex.secondary.map(function (m) { return RU_MU[m] || ''; }).join(' ')
      ].join(' '));
      BY_ID[ex.id] = ex;
    });

    databaseCustomExercises.forEach(function (record) {
      if (!record || BY_ID[record.id]) return;
      var ex = makeCustomExerciseRuntimeRecord(record, EX.length);
      BY_ID[ex.id] = ex;
      EX.push(ex);
    });

    EX.forEach(function (ex) {
      var latin = translitRu([ex.nameRu, RU_ZONE[ex.zone], RU_MU[ex.target], RU_MU[ex.group], ex.secondary.map(function (m) { return RU_MU[m] || m; }).join(' ')].join(' '));
      ex.search = norm(ex.search + ' ' + latin);
    });

    EX.forEach(function (ex) {
      COUNT_ZONE[ex.zone] = (COUNT_ZONE[ex.zone] || 0) + 1;
      COUNT_MU[ex.target] = (COUNT_MU[ex.target] || 0) + 1;
      COUNT_EQ[ex.equip] = (COUNT_EQ[ex.equip] || 0) + 1;
    });
    ZONES = Object.keys(COUNT_ZONE);
    MUSCLES = Object.keys(COUNT_MU);
    EQUIPMENT = Object.keys(COUNT_EQ);
    return EX.length > 0;
  }

  function dataRouteNeedsLibrary(route) {
    return ['library', 'program', 'workout'].indexOf(route) !== -1;
  }

  function ensureData() {
    if (DATA_READY) return Promise.resolve(true);
    if (!DATA_PROMISE) {
      DATA_PROMISE = fetchData().then(function (loaded) {
        DATA_READY = !!loaded;
        return DATA_READY;
      }).catch(function () { return false; });
    }
    return DATA_PROMISE;
  }

  function refreshDataDependentUI() {
    if (!DATA_READY) return;
    $('stat-total').textContent = EX.length;
    $('stat-zones').textContent = ZONES.length;
    $('stat-equip').textContent = EQUIPMENT.length;
    renderFilters();
    renderResults();
    renderMuscleBoard();
    renderWorkout();
    heroPeek();
    if (window.mmgV7 && typeof window.mmgV7.render === 'function') window.mmgV7.render();
  }

  function exName(ex) { return S.lang === 'en' ? (ex.nameEn || ex.nameRu) : (ex.nameRu || ex.nameEn); }
  function exSteps(ex) {
    if (ex.custom && ex.notes) return ex.notes.split(/\r?\n/).map(function (step) { return step.trim(); }).filter(Boolean);
    var primary = S.lang === 'en' ? ex.stepsEn : ex.stepsRu;
    return (primary && primary.length) ? primary : (ex.stepsRu.length ? ex.stepsRu : ex.stepsEn);
  }
  var MEDIA_PLACEHOLDER = 'images/exercise-placeholder.svg';
  var MEDIA_INLINE_FALLBACK = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="#101318"/><g fill="none" stroke="#6f7782" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".74"><circle cx="320" cy="120" r="34"/><path d="M320 154v92M268 202l52-32 52 32M286 344l34-98 34 98M250 244h140"/></g><path d="M70 360h500" stroke="#d8a431" stroke-width="4" opacity=".55"/><text x="320" y="395" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" letter-spacing="4" fill="#8d949e">MARKOV MADE GYM</text></svg>');
  var MEDIA_REVISION = '20260927-media4';
  function exStill(ex) { return ex.custom ? (ex.image || MEDIA_PLACEHOLDER) : 'images/' + ex.slug + '.jpg'; }
  function exMotion(ex) { return ex.custom ? exStill(ex) : 'videos/' + ex.slug + '.gif?v=' + MEDIA_REVISION; }
  function mediaFallback(img) {
    if (!img || img.dataset.mediaFailed === 'inline') return;
    if (img.dataset.mediaFailed === 'final') { img.dataset.mediaFailed='inline'; img.src=MEDIA_INLINE_FALLBACK; img.classList.add('media-fallback','media-fallback-inline'); img.removeAttribute('data-motion'); return; }
    var still = img.dataset.still;
    var current = img.currentSrc || img.src || '';
    var stillAbs = still || '';
    if (still) { try { stillAbs = new URL(still, document.baseURI).href; } catch (e) { /* opaque QA origins: compare raw path */ } }
    if (still && current !== stillAbs && img.dataset.mediaFailed !== 'still') {
      img.dataset.mediaFailed = 'still';
      img.src = still;
      return;
    }
    img.dataset.mediaFailed = 'final';
    img.src = MEDIA_PLACEHOLDER;
    img.classList.add('media-fallback');
    img.removeAttribute('data-motion');
  }
  document.addEventListener('error', function (event) {
    var img = event.target;
    if (img && img.tagName === 'IMG' && img.hasAttribute('data-ex-media')) mediaFallback(img);
  }, true);

  /* ---------- 6. СОСТОЯНИЕ ------------------------------------------------ */
  var S = createInitialState();

  var PAGE = 60;

  function isFav(id) { return S.favorites.indexOf(id) !== -1; }
  function inWorkout(id) {
    return S.workout.some(function (item) { return item.id === id; });
  }
  function saveFavorites() { store.set(K.fav, JSON.stringify(S.favorites)); }
  function exercisePreference(id) { return getExercisePreference(S.exercisePreferences, id); }
  function exercisePreferenceScore(ex) {
    return rankByPreference(exercisePreference(ex.id));
  }
  function exercisePreferenceLabel(value) {
    var labels = S.lang === 'en' ? {neutral:'No preference',prefer:'Prefer',lessOften:'Less often',avoid:'Avoid',unavailable:'Unavailable',discomfort:'Does not suit me / discomfort'} : {neutral:'Без предпочтения',prefer:'Предпочитаю',lessOften:'Реже',avoid:'Избегать',unavailable:'Недоступно',discomfort:'Не подходит / дискомфорт'};
    return labels[value] || labels.neutral;
  }
  function saveExercisePreferences() {
    var serialized = JSON.stringify(S.exercisePreferences);
    store.set(K.exercisePreferences, serialized);
    if (!historyRepository) return Promise.resolve();
    var snapshot = cleanIdbExercisePreferences(S.exercisePreferences);
    return writePreferenceSnapshot(snapshot).then(function () {
      databaseExercisePreferences = snapshot;
    }).catch(function () {
      storageWarnings.push({ key: K.exercisePreferences, type: 'indexeddb-write', at: Date.now() });
      try { if (storageOk) window.localStorage.setItem(K.exercisePreferences, serialized); } catch (_fallbackError) {}
    });
  }
  function cleanExercisePreferences(value) {
    return normalizeExercisePreferences(value, function(id) { return !!BY_ID[id]; }, EX.length);
  }
  function saveWorkout() { store.set(K.workout, JSON.stringify(S.workout)); }

  function toggleInArray(arr, value) {
    var i = arr.indexOf(value);
    if (i === -1) arr.push(value); else arr.splice(i, 1);
    return arr;
  }

  /* ---------- 7. БИБЛИОТЕКА ----------------------------------------------- */
  function getFiltered() {
    var tokens = S.query ? norm(S.query).split(' ').filter(Boolean) : [];
    var out = EX.filter(function (ex) {
      if (S.favOnly && !isFav(ex.id)) return false;
      if (S.zones.length && S.zones.indexOf(ex.zone) === -1) return false;
      if (S.muscles.length && S.muscles.indexOf(ex.target) === -1) return false;
      if (S.equipment.length && S.equipment.indexOf(ex.equip) === -1) return false;
      for (var i = 0; i < tokens.length; i++) {
        if (ex.search.indexOf(tokens[i]) === -1) return false;
      }
      return true;
    });

    var coll = S.lang === 'en' ? 'en' : 'ru';
    if (S.sort === 'name') {
      out.sort(function (a, b) { return exName(a).localeCompare(exName(b), coll); });
    } else if (S.sort === 'muscle') {
      out.sort(function (a, b) {
        var d = labelMu(a.target).localeCompare(labelMu(b.target), coll);
        return d || (b.score - a.score);
      });
    } else if (S.sort === 'equipment') {
      out.sort(function (a, b) {
        var d = labelEq(a.equip).localeCompare(labelEq(b.equip), coll);
        return d || (b.score - a.score);
      });
    } else if (S.sort === 'favorites') {
      out.sort(function (a, b) {
        var d = (isFav(b.id) ? 1 : 0) - (isFav(a.id) ? 1 : 0);
        return d || (b.score - a.score) || (a.idx - b.idx);
      });
    } else {
      out.sort(function (a, b) { return (b.score + exercisePreferenceScore(b) + (isFav(b.id) ? 65 : 0) - (a.score + exercisePreferenceScore(a) + (isFav(a.id) ? 65 : 0))) || (a.idx - b.idx); });
    }
    return out;
  }

  var STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.6 2.6 5.5 6 .85-4.35 4.2 1.05 5.95L12 17.3l-5.3 2.8 1.05-5.95L3.4 9.95l6-.85Z"/></svg>';

  function premiumIcon(name) {
    var common = 'viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    var paths = {
      equipment:'<path d="M4 9v6M20 9v6M7 6v12M17 6v12M7 12h10"/>',
      muscle:'<path d="M7 14c1.3-4.5 3.7-7 6-7 2.6 0 4 2 4 5 0 3.2-2.4 6-6.2 6H8c-1.7 0-3-1.3-3-3 0-1.1.6-2.1 2-2.8"/>',
      check:'<path d="m5 12 4 4 10-10"/>',
      arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
      fat:'<path d="M12 3v15m0 0-5-5m5 5 5-5"/><path d="M5 21h14"/>',
      strength:'<path d="M3 10v4m18-4v4M6 7v10m12-10v10M6 12h12"/>',
      health:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
      gym:'<path d="M4 19V8l8-4 8 4v11"/><path d="M8 19v-6h8v6M3 19h18"/>',
      home:'<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
      mixed:'<path d="M4 7h11m0 0-3-3m3 3-3 3M20 17H9m0 0 3-3m-3 3 3 3"/>',
      experience:'<path d="M5 19V9m7 10V5m7 14v-7"/>',
      time:'<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
      search:'<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
      workout:'<path d="M5 6h14v14H5z"/><path d="m8 11 2 2 5-5M8 17h8"/>',
      nutrition:'<path d="M12 21c4-4 6-8 6-12a6 6 0 0 0-12 0c0 4 2 8 6 12Z"/><path d="M9 10c1.5 1.2 4.5 1.2 6 0"/>',
      progress:'<path d="M4 18 9 13l3 3 7-9"/><path d="M15 7h4v4"/>',
      technique:'<path d="M6 4h12v16H6z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
      swap:'<path d="M5 7h12m0 0-3-3m3 3-3 3M19 17H7m0 0 3-3m-3 3 3 3"/>',
      favorite:'<path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8Z"/>',
      filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',
      pause:'<path d="M9 7v10M15 7v10"/>',
      skip:'<path d="m8 7 6 5-6 5V7Z"/><path d="M17 7v10"/>',
      menu:'<path d="M5 7h14M5 12h14M5 17h14"/>',
      program:'<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h5M8 17h7"/>',
      knowledge:'<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M8 4v13a3 3 0 0 0 3 3"/>',
      settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1A8 8 0 0 0 15 6l-.4-2.6h-4L10 6a8 8 0 0 0-1.5 1L6 6 4 9.4 6 11a7 7 0 0 0 0 2l-2 1.6L6 18l2.5-1a8 8 0 0 0 1.5 1l.5 2.6h4L15 18a8 8 0 0 0 1.5-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z"/>'
    };
    return '<svg class="premium-mini-ico" '+common+'>'+(paths[name]||paths.muscle)+'</svg>';
  }

  function miniBodyIcon(zone) {
    var hit = {
      neck:'<rect class="mini-body-hit" x="10" y="5" width="4" height="3" rx="1"/>',
      shoulders:'<path class="mini-body-hit" d="M6 9h4v3H5V10Zm8 0h4l1 1v2h-5Z"/>',
      chest:'<rect class="mini-body-hit" x="8" y="10" width="8" height="5" rx="2"/>',
      back:'<rect class="mini-body-hit" x="8" y="9" width="8" height="8" rx="2"/>',
      'upper arms':'<path class="mini-body-hit" d="M4 11h3v8H4zm13 0h3v8h-3z"/>',
      'lower arms':'<path class="mini-body-hit" d="M3 18h3v7H3zm15 0h3v7h-3z" transform="translate(0 -3)"/>',
      waist:'<rect class="mini-body-hit" x="9" y="15" width="6" height="7" rx="2"/>',
      'upper legs':'<path class="mini-body-hit" d="M8 21h4v8H8zm5 0h4v8h-4z"/>',
      'lower legs':'<path class="mini-body-hit" d="M8 28h3v7H8zm6 0h3v7h-3z"/>',
      cardio:'<path class="mini-body-hit" d="M12 14s-4-2.3-4-5a2.3 2.3 0 0 1 4-1.4A2.3 2.3 0 0 1 16 9c0 2.7-4 5-4 5Z"/>'
    }[zone] || '';
    return '<svg viewBox="0 0 24 38" aria-hidden="true"><circle class="mini-body-base" cx="12" cy="4" r="3"/><path class="mini-body-base" d="M8 8h8l3 9-2 5-1 14h-3l-1-12-1 12H8L7 22l-2-5Z"/>'+hit+'</svg>';
  }

  function cardHtml(ex) {
    return cardHtmlView({ S, esc, exName, labelZone, labelMu, labelEq, isFav, inWorkout, exStill, STAR_SVG, premiumIcon, t, exercisePreference, exercisePreferenceLabel, C, detailKindLabel, detailLevelLabel }, ex);
  }

  function activeChipsHtml() {
    var chips = [];
    if (S.query) {
      chips.push({ kind: 'query', value: '', label: t('searchTag', { q: S.query }) });
    }
    S.zones.forEach(function (v) { chips.push({ kind: 'zone', value: v, label: labelZone(v) }); });
    S.muscles.forEach(function (v) { chips.push({ kind: 'muscle', value: v, label: labelMu(v) }); });
    S.equipment.forEach(function (v) { chips.push({ kind: 'equip', value: v, label: labelEq(v) }); });
    if (S.favOnly) chips.push({ kind: 'fav', value: '', label: t('favTag') });

    return chips.map(function (c) {
      return '<button class="chip is-on" type="button" data-chip-kind="' + c.kind + '" data-chip-value="' + esc(c.value) +
        '" aria-label="' + esc(t('removeFilter', { name: c.label })) + '">' + esc(c.label) +
        '<span class="chip-remove" aria-hidden="true">×</span></button>';
    }).join('');
  }

  function renderResultsInsights(items) {
    var host = $('results-insights');
    if (!host) return;
    if (!items || !items.length) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    var compounds = items.filter(function (ex) { return exKind(ex) === 'compound'; }).length;
    var home = items.filter(isHomeFriendly).length;
    var equipment = {};
    var zones = {};
    items.forEach(function (ex) { equipment[ex.equip] = 1; zones[ex.zone] = 1; });
    var pct = function (n) { return Math.round((n / items.length) * 100); };
    var labels = S.lang === 'en'
      ? { compound: 'Compound', home: 'Home-ready', equipment: 'Equipment', zones: 'Body areas', aria: 'Current selection profile' }
      : { compound: 'Составные', home: 'Для дома', equipment: 'Оборудование', zones: 'Зоны тела', aria: 'Профиль текущей подборки' };
    host.hidden = false;
    host.setAttribute('aria-label', labels.aria);
    host.innerHTML =
      '<span><b>' + pct(compounds) + '%</b><em>' + esc(labels.compound) + '</em></span>' +
      '<span><b>' + pct(home) + '%</b><em>' + esc(labels.home) + '</em></span>' +
      '<span><b>' + Object.keys(equipment).length + '</b><em>' + esc(labels.equipment) + '</em></span>' +
      '<span><b>' + Object.keys(zones).length + '</b><em>' + esc(labels.zones) + '</em></span>';
  }

  function sameStringSetV10(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every(function (v) { return b.indexOf(v) !== -1; });
  }

  function renderV10LibraryQuick() {
    var host = $('v10-library-quick-presets');
    var label = $('v10-library-quick-label');
    if (!host) return;
    if (label) label.textContent = S.lang === 'en' ? 'Quick selection' : 'Быстрый выбор';
    var defs = [
      ['home', S.lang === 'en' ? 'Home' : 'Дом', sameStringSetV10(S.equipment, PRESETS.home.equipment)],
      ['gym', S.lang === 'en' ? 'Gym' : 'Зал', sameStringSetV10(S.equipment, PRESETS.gym.equipment)],
      ['chest', S.lang === 'en' ? 'Chest' : 'Грудь', S.zones.length === 1 && S.zones[0] === 'chest'],
      ['back', S.lang === 'en' ? 'Back' : 'Спина', S.zones.length === 1 && S.zones[0] === 'back'],
      ['legs', S.lang === 'en' ? 'Legs' : 'Ноги', sameStringSetV10(S.zones, ['upper legs', 'lower legs'])],
      ['favorites', S.lang === 'en' ? 'Favorites' : 'Избранное', !!S.favOnly]
    ];
    host.innerHTML = defs.map(function (d) {
      return '<button class="v10-library-quick-btn" type="button" data-preset="' + d[0] + '" aria-pressed="' + String(d[2]) + '">' + esc(d[1]) + '</button>';
    }).join('');
  }

  function renderResults() {
    var items = getFiltered();
    S.lastFiltered = items;
    var visible = items.slice(0, S.limit);
    var grid = $('grid');

    grid.setAttribute('data-density', S.density);

    if (!visible.length) {
      var favEmpty = S.favOnly && !S.favorites.length;
      grid.innerHTML = '<div class="empty v8-grid-span">' +
        '<b>' + esc(favEmpty ? t('emptyFavTitle') : t('emptyTitle')) + '</b>' +
        '<p>' + esc(favEmpty ? t('emptyFavText') : t('emptyText')) + '</p>' +
        '<button class="btn btn-solid btn-sm" type="button" data-reset-filters>' + esc(t('emptyReset')) + '</button>' +
      '</div>';
    } else {
      grid.innerHTML = visible.map(cardHtml).join('');
    }

    $('results-count').innerHTML = fmt(t('resultsLine'), {
      found: items.length, total: EX.length, shown: visible.length
    });
    $('active-chips').innerHTML = activeChipsHtml();
    renderResultsInsights(items);
    renderV10LibraryQuick();

    var more = items.length > visible.length;
    $('load-more').hidden = !more;
    $('show-all').hidden = !more;
    $('load-more').textContent = t('loadMore', { n: Math.min(PAGE, items.length - visible.length) });
    $('load-note').textContent = more
      ? t('loadNoteMore', { shown: visible.length, found: items.length })
      : t('loadNoteAll');

    $('mfb-count').textContent = items.length;
    $('filters-apply-count').textContent = items.length;
    var activeCount = S.zones.length + S.muscles.length + S.equipment.length + (S.favOnly ? 1 : 0) + (S.query ? 1 : 0);
    $('mfb-active').textContent = activeCount ? '(' + activeCount + ')' : '';
    $('fav-count').textContent = S.favorites.length;
    $('stat-fav').textContent = S.favorites.length;
    qs('#search-box').setAttribute('data-filled', String(!!S.query));
    renderCoachLib(S.lastFiltered);
    renderMuscleBoard();
  }

  function filterListHtml(values, counts, labelFn, kind, selected) {
    return values.slice().sort(function (a, b) {
      var sa = selected.indexOf(a) !== -1 ? 1 : 0, sb = selected.indexOf(b) !== -1 ? 1 : 0;
      return (sb - sa) || counts[b] - counts[a] || labelFn(a).localeCompare(labelFn(b), S.lang === 'en' ? 'en' : 'ru');
    }).map(function (v) {
      var on = selected.indexOf(v) !== -1;
      return '<button class="filter-btn" type="button" data-filter-kind="' + kind + '" data-filter-value="' + esc(v) +
        '" aria-pressed="' + on + '"><span>' + esc(labelFn(v)) + '</span><b>' + counts[v] + '</b></button>';
    }).join('');
  }

  function renderFilters() {
    $('filter-bp').innerHTML = filterListHtml(ZONES, COUNT_ZONE, labelZone, 'zone', S.zones);
    $('filter-mu').innerHTML = filterListHtml(MUSCLES, COUNT_MU, labelMu, 'muscle', S.muscles);
    $('filter-eq').innerHTML = filterListHtml(EQUIPMENT, COUNT_EQ, labelEq, 'equip', S.equipment);
    $('count-bp').textContent = ZONES.length;
    $('count-mu').textContent = MUSCLES.length;
    $('count-eq').textContent = EQUIPMENT.length;
    $('fav-only').setAttribute('aria-pressed', String(S.favOnly));
    ['filter-search-muscle','filter-search-eq'].forEach(function(id){ var input=$(id); if(input && input.value){ input.dispatchEvent(new Event('input',{bubbles:true})); } });
    renderEquipmentProfileControl();
  }

  function equipmentProfileName(profile) { return S.lang==='en' ? profile.nameEn : profile.nameRu; }
  function renderEquipmentProfileControl() {
    var select=$('equipment-profile-select'); if(!select)return;
    var en=S.lang==='en';
    $('equipment-profile-title').textContent=en?'Active equipment profile':'Активный профиль оборудования';
    $('equipment-profile-save').textContent=en?'Save current selection':'Сохранить текущий выбор';
    $('equipment-profile-delete').textContent=en?'Delete profile':'Удалить профиль';
    $('equipment-profile-help').textContent=en?'Changing a profile only changes exercise recommendations and filters. Your workout stays intact.':'Смена профиля меняет фильтры и подбор упражнений, сохраняя текущую тренировку.';
    var current=databaseEquipmentProfiles.some(function(profile){return profile.id===activeEquipmentProfileId;})?activeEquipmentProfileId:'';
    select.innerHTML='<option value="">'+(en?'Choose equipment…':'Выбери оборудование…')+'</option>'+databaseEquipmentProfiles.map(function(profile){return'<option value="'+esc(profile.id)+'"'+(profile.id===current?' selected':'')+'>'+esc(equipmentProfileName(profile))+'</option>';}).join('');
    $('equipment-profile-delete').hidden=!current||!!databaseEquipmentProfiles.filter(function(profile){return profile.id===current;})[0].builtIn;
  }

  async function saveCurrentEquipmentProfile() {
    var en=S.lang==='en';
    var name=window.prompt(en?'Name this equipment profile':'Назови профиль оборудования');
    if(name===null)return;
    name=String(name).trim().slice(0,80);
    if(!name){showToast(en?'Enter a profile name.':'Введи название профиля.');return;}
    var now=new Date().toISOString(),id='equipment-'+Date.now();
    try{
      databaseEquipmentProfiles=await saveEquipmentProfileRecords(databaseEquipmentProfiles.concat([{id:id,nameRu:name,nameEn:name,equipment:S.equipment.slice(),createdAt:now,updatedAt:now,builtIn:false}]));
      activeEquipmentProfileId=id;store.set(K.equipmentProfileActive,id);renderEquipmentProfileControl();
      showToast(en?'Equipment profile saved.':'Профиль оборудования сохранён.');
    }catch(error){showToast(en?'Could not save this profile.':'Не удалось сохранить профиль.');}
  }

  function activateEquipmentProfile(id) {
    var profile=databaseEquipmentProfiles.filter(function(item){return item.id===id;})[0];
    activeEquipmentProfileId=profile?profile.id:'';store.set(K.equipmentProfileActive,activeEquipmentProfileId);
    if(profile)S.equipment=profile.equipment.slice();
    S.limit=PAGE;renderEquipmentProfileControl();renderFilters();renderResults();
  }

  async function removeActiveEquipmentProfile() {
    var profile=databaseEquipmentProfiles.filter(function(item){return item.id===activeEquipmentProfileId;})[0];
    if(!profile||profile.builtIn)return;
    var en=S.lang==='en';
    if(!window.confirm(en?'Delete this equipment profile? Your workout will stay intact.':'Удалить этот профиль оборудования? Текущая тренировка сохранится.'))return;
    try{
      databaseEquipmentProfiles=await saveEquipmentProfileRecords(databaseEquipmentProfiles.filter(function(item){return item.id!==profile.id;}));
      activeEquipmentProfileId='';store.set(K.equipmentProfileActive,'');S.equipment=profile.equipment.slice();renderFilters();renderResults();
    }catch(error){showToast(en?'Could not delete this profile.':'Не удалось удалить профиль.');}
  }

  async function ensureDefaultEquipmentProfiles() {
    if(databaseEquipmentProfiles.length)return;
    var now=new Date().toISOString();
    databaseEquipmentProfiles=await saveEquipmentProfileRecords([
      {id:'builtin-gym',nameRu:'Мой зал',nameEn:'My gym',equipment:PRESETS.gym.equipment,createdAt:now,updatedAt:now,builtIn:true},
      {id:'builtin-home',nameRu:'Дом',nameEn:'Home',equipment:HOME_EQUIP,createdAt:now,updatedAt:now,builtIn:true},
      {id:'builtin-travel',nameRu:'Поездка',nameEn:'Travel',equipment:['body weight','band','resistance band','dumbbell'],createdAt:now,updatedAt:now,builtIn:true},
      {id:'builtin-custom',nameRu:'Custom',nameEn:'Custom',equipment:HOME_EQUIP.concat(GYM_EQUIP),createdAt:now,updatedAt:now,builtIn:true}
    ]);
  }

  function preferredMuscleZone() {
    if (S.zones.length) return S.zones[0];
    if (S.muscles.length) {
      var hit = EX.find(function (ex) { return ex.target === S.muscles[0]; });
      if (hit) return hit.zone;
    }
    return '';
  }

  function syncBodyMap(zone) {
    zone = zone || preferredMuscleZone();
    qsa('[data-body-zone]').forEach(function (node) {
      node.dataset.selected = String(!!zone && node.dataset.bodyZone === zone);
    });
    var sig = $('bodymap-signal');
    if (sig) {
      sig.dataset.state = zone ? 'ok' : 'none';
      sig.textContent = zone ? labelZone(zone) : (S.lang === 'en' ? 'No area selected' : 'Зона не выбрана');
    }
  }

  function syncMuscleFlow(zone) {
    var z = $('muscle-flow-zone'), m = $('muscle-flow-target'), r = $('muscle-flow-results');
    if (!z || !m || !r) return;
    var exact = !!(zone && S.muscles && S.muscles.length);
    z.dataset.state = zone ? 'done' : 'current';
    m.dataset.state = !zone ? 'idle' : (exact ? 'done' : 'current');
    r.dataset.state = exact ? 'current' : 'idle';
  }

  function renderMuscleBoard() {
    var board = $('muscle-board');
    var strip = $('zone-strip');
    if (!board || !strip) return;
    var zone = preferredMuscleZone();
    syncMuscleFlow(zone);
    var ordered = ZONES.slice().sort(function (a, b) { return COUNT_ZONE[b] - COUNT_ZONE[a]; });
    strip.innerHTML = ordered.map(function (z) {
      return '<button class="zone-pill" type="button" data-musnav-zone="' + esc(z) + '" aria-pressed="' + (zone === z) + '"><span>' + esc(labelZone(z)) + '</span><b>' + (COUNT_ZONE[z] || 0) + '</b></button>';
    }).join('');

    var title = $('musnav-title'), subtitle = $('musnav-subtitle');
    if (!zone) {
      if (title) title.textContent = S.lang === 'en' ? 'Choose a body area' : 'Выбери зону тела';
      if (subtitle) subtitle.textContent = S.lang === 'en' ? 'The visual map and the accessible list control the same filter.' : 'Визуальная карта и доступный список управляют одним фильтром.';
      board.innerHTML = '<div class="muscle-empty">' + esc(S.lang === 'en' ? 'Start with a body area. Exact target muscles and live exercise counts will appear here.' : 'Начни с зоны тела. Здесь появятся конкретные целевые мышцы и актуальное количество упражнений.') + '</div>';
      syncBodyMap('');
      return;
    }

    var inZone = EX.filter(function (ex) { return ex.zone === zone; });
    var byTarget = Object.create(null);
    inZone.forEach(function (ex) { byTarget[ex.target] = (byTarget[ex.target] || 0) + 1; });
    var targets = Object.keys(byTarget).sort(function (a, b) { return byTarget[b] - byTarget[a] || labelMu(a).localeCompare(labelMu(b), S.lang === 'en' ? 'en' : 'ru'); });
    if (title) title.textContent = labelZone(zone);
    if (subtitle) subtitle.textContent = (S.lang === 'en' ? inZone.length + ' exercises · choose a target muscle or keep the whole area.' : inZone.length + ' упражнений · уточни мышцу или оставь активной всю зону.');
    board.innerHTML = '<div class="muscle-detail"><div class="muscle-detail-grid">' + targets.map(function (tg) {
        var selected = S.muscles.indexOf(tg) !== -1;
        return '<button class="muscle-target-btn" type="button" data-musnav-muscle="' + esc(tg) + '" aria-pressed="' + selected + '">' +
          '<span class="muscle-dot" aria-hidden="true">' + miniBodyIcon(zone) + '</span>' +
          '<span><strong>' + esc(labelMu(tg)) + '</strong><small>' + esc(S.lang === 'en' ? 'Target muscle' : 'Целевая мышца') + '</small></span>' +
          '<span class="muscle-count">' + byTarget[tg] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="muscle-actions"><span class="small">' + esc(S.muscles.length ? (S.lang === 'en' ? 'Selected: ' + S.muscles.map(labelMu).join(', ') : 'Выбрано: ' + S.muscles.map(labelMu).join(', ')) : (S.lang === 'en' ? 'No exact muscle selected — the whole area is active.' : 'Конкретная мышца не выбрана — активна вся зона.')) + '</span>' +
      '<button class="btn btn-primary btn-sm" type="button" data-musnav-open>' + esc(S.lang === 'en' ? 'Show exercises' : 'Показать упражнения') + ' →</button></div></div>';
    syncBodyMap(zone);
  }

  function resetFilters(rerender) {
    S.query = '';
    S.zones = [];
    S.muscles = [];
    S.equipment = [];
    activeEquipmentProfileId='';
    store.set(K.equipmentProfileActive,'');
    S.favOnly = false;
    S.limit = PAGE;
    $('search').value = '';
    if (rerender !== false) { renderFilters(); renderResults(); renderMuscleBoard(); }
  }

  function scrollToLibrary() {
    var top = $('library').getBoundingClientRect().top + window.pageYOffset - 72;
    window.scrollTo({ top: top, behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth' });
  }

  var PRESETS = {
    chest: { zones: ['chest'] },
    back: { zones: ['back'] },
    legs: { zones: ['upper legs', 'lower legs'] },
    shoulders: { zones: ['shoulders'] },
    arms: { zones: ['upper arms', 'lower arms'] },
    abs: { zones: ['waist'] },
    home: { equipment: HOME_EQUIP },
    gym: { equipment: ['barbell', 'cable', 'leverage machine', 'smith machine', 'ez barbell'] },
    favorites: { favOnly: true }
  };

  function applyPreset(name) {
    if (name === 'swap') {
      resetFilters(false);
      var pool = EX.filter(function (ex) { return ex.score >= 8; });
      var pick = pool[Math.floor(Math.random() * pool.length)] || EX[0];
      S.muscles = [pick.target];
      renderFilters(); renderResults(); scrollToLibrary();
      showToast(t('swapToast', { muscle: labelMu(pick.target) }));
      return;
    }
    var preset = PRESETS[name];
    if (!preset) return;
    resetFilters(false);
    if (preset.zones) S.zones = preset.zones.slice();
    if (preset.equipment) {
      S.equipment = preset.equipment.slice();
      var matchingProfile=databaseEquipmentProfiles.filter(function(profile){return sameStringSetV10(profile.equipment,S.equipment);})[0];
      activeEquipmentProfileId=matchingProfile?matchingProfile.id:'';store.set(K.equipmentProfileActive,activeEquipmentProfileId);
    }
    if (preset.favOnly) S.favOnly = true;
    renderFilters(); renderResults(); scrollToLibrary();
  }

  function toggleFavorite(id) {
    if (!BY_ID[id]) return;
    toggleInArray(S.favorites, id);
    saveFavorites();
    renderResults();
    if (S.activeId === id) syncModalButtons();
    showToast(isFav(id) ? t('favAdded') : t('favRemoved'));
  }

  /* ---------- 8. МОДАЛЬНОЕ ОКНО ------------------------------------------- */
  var modalReturnFocus = null;

  function factRow(label, value) {
    return '<div class="modal-fact"><span>' + esc(label) + '</span><span>' + esc(value) + '</span></div>';
  }

  function detailText(ru, en) { return S.lang === 'en' ? en : ru; }

  function detailValue(source, key, fallback) {
    if (!source || typeof source !== 'object') return fallback;
    var suffix = S.lang === 'en' ? 'En' : 'Ru';
    var value = source[key + suffix];
    if (value == null) value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && (value.ru != null || value.en != null)) {
      value = S.lang === 'en' && value.en != null ? value.en : value.ru;
    }
    return value == null || value === '' ? fallback : value;
  }

  function detailArray(source, key, fallback) {
    var value = detailValue(source, key, null);
    if (Array.isArray(value)) return value.filter(function (item) { return item != null && String(item).trim(); }).map(String);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return (fallback || []).slice();
  }

  function enhancedTechnique(ex) {
    var enhanced = C && C.card && C.card.enhanced;
    if (!enhanced || typeof enhanced !== 'object') return null;
    return enhanced[ex.id] || enhanced[ex.slug] || enhanced[norm(ex.nameEn)] || null;
  }

  function detailKindLabel(ex) {
    return { compound: t('kindCompound'), accessory: t('kindAccessory'), isolation: t('kindIsolation') }[exKind(ex)];
  }

  function detailLevelLabel(ex) {
    return { beginner: t('lvlEasy'), medium: t('lvlMid'), advanced: t('lvlHard') }[exLevel(ex)];
  }

  function detailStepLabel(index, total) {
    if (index === 0) return detailText('Старт', 'Set-up');
    if (index === total - 1) return detailText('Завершение', 'Finish');
    if (index === 1) return detailText('Позиция', 'Position');
    if (index >= total - 2) return detailText('Контроль', 'Control');
    return detailText('Движение', 'Movement');
  }

  function defaultBreathingCue(ex) {
    if (ex.zone === 'cardio') {
      return detailText('Дыши ритмично и без задержек. Темп должен позволять сохранять технику до конца интервала.', 'Breathe rhythmically without holding your breath. The pace should let you keep your form through the interval.');
    }
    if (ex.zone === 'waist') {
      return detailText('Выдыхай на усилии, вдыхай при контролируемом возврате. Не задерживай дыхание настолько, чтобы терять положение корпуса.', 'Exhale through the effort and inhale on the controlled return. Do not hold your breath long enough to lose trunk position.');
    }
    if (exKind(ex) === 'compound') {
      return detailText('Перед повтором вдохни и создай жёсткость корпуса. Сохрани давление в сложной части движения и выдыхай после её прохождения или в устойчивой верхней точке.', 'Take a breath and brace before the rep. Keep trunk pressure through the hardest part and exhale after the sticking point or at a stable top position.');
    }
    return detailText('Выдыхай в рабочей фазе, вдыхай при возврате. Дыхание не должно ломать темп и положение корпуса.', 'Exhale through the working phase and inhale on the return. Breathing should not disturb your tempo or body position.');
  }

  function defaultRangeCue(ex) {
    var cues = {
      chest: {
        ru: 'Опускай вес только до глубины, где лопатки остаются стабильными и передняя часть плеча не уходит вперёд. Не добирай амплитуду за счёт сустава.',
        en: 'Lower only as far as the shoulder blades stay stable and the front of the shoulder does not roll forward. Do not buy extra range from the joint.'
      },
      back: {
        ru: 'Начни с контролируемого вытяжения, затем веди локоть назад. Конечная точка — там, где лопатка завершает движение без раскачки и переразгибания корпуса.',
        en: 'Start from a controlled stretch, then drive the elbow back. Finish where the shoulder blade completes the motion without torso swing or overextension.'
      },
      shoulders: {
        ru: 'Работай только в диапазоне без подъёма плеча к уху и без боли. Если выше уровня плеча начинается компенсация — это и есть текущая граница амплитуды.',
        en: 'Use the range where the shoulder does not shrug toward the ear and there is no pain. If compensation starts above shoulder height, that is your current range limit.'
      },
      'upper arms': {
        ru: 'Сохраняй плечо и локоть в заданной позиции, двигай предплечьем через комфортную полную амплитуду без отдыха в крайних точках.',
        en: 'Keep the upper arm and elbow in position and move the forearm through a comfortable full range without resting at the ends.'
      },
      'lower arms': {
        ru: 'Амплитуда небольшая: двигай кистью только до точки, где предплечье остаётся неподвижным, без рывка в крайних положениях.',
        en: 'The range is small: move only as far as the forearm stays still, without jerking at either end.'
      },
      waist: {
        ru: 'Заканчивай повтор до того, как движение начинает добираться прогибом поясницы, рывком ног или тягой руками за голову.',
        en: 'End the rep before extra range comes from lumbar arching, leg swing or pulling on the head.'
      },
      'upper legs': {
        ru: 'Глубина — максимальная, на которой стопа полностью опирается, колени идут по направлению носков, а корпус остаётся контролируемым.',
        en: 'Depth is the deepest position where the whole foot stays planted, knees track with the toes and the torso remains controlled.'
      },
      'lower legs': {
        ru: 'Используй полный контролируемый ход: растяжение внизу, короткая пауза, подъём без пружины и полное сокращение наверху.',
        en: 'Use the full controlled travel: stretch at the bottom, brief pause, rise without bouncing and finish fully shortened at the top.'
      },
      neck: {
        ru: 'Только комфортная амплитуда без натяжения, боли и резких крайних положений. Здесь больше амплитуда не означает лучше.',
        en: 'Use only a comfortable range with no pulling, pain or abrupt end positions. More range is not better here.'
      },
      cardio: {
        ru: 'Двигайся в естественной амплитуде без ударных крайних положений. Если техника разваливается, сначала снизь темп, а не увеличивай усилие.',
        en: 'Move through a natural range without slamming into end positions. If form breaks down, lower the pace before adding effort.'
      }
    };
    var cue = cues[ex.zone];
    return cue ? detailText(cue.ru, cue.en) : detailText('Работай только в амплитуде, которую можешь повторять одинаково без боли, рывка и потери положения корпуса.', 'Use only a range you can repeat consistently without pain, jerking or losing body position.');
  }

  function defaultControlCue(ex) {
    if (exKind(ex) === 'compound') {
      return detailText('Каждый повтор начинай из одинаковой устойчивой позиции. Возврат выполняй под контролем, не бросай вес и не ускоряйся ценой траектории.', 'Start every rep from the same stable position. Control the return, never drop the load or trade the path for speed.');
    }
    if (exKind(ex) === 'isolation') {
      return detailText('Убери инерцию и держи целевой сустав стабильным. Вес подходит, если последние повторы выглядят почти так же, как первые.', 'Remove momentum and keep the target joint stable. The load is appropriate when the final reps still look close to the first ones.');
    }
    return detailText('Сохраняй одинаковую траекторию и темп. Если для следующего повтора приходится менять положение корпуса — подход технически закончен.', 'Keep the same path and tempo. If the next rep requires changing body position, the set is technically over.');
  }

  function exerciseTechniqueModel(ex) {
    var enhanced = enhancedTechnique(ex);
    var zone = C && C.card ? exCardZone(ex) : null;
    var baseSteps = exSteps(ex);
    var steps = detailArray(enhanced, 'steps', baseSteps);
    var cues = detailArray(enhanced, 'cues', zone && zone.key ? [L(zone.key)] : []);
    var mistakes = detailArray(enhanced, 'mistakes', zone && zone.err ? [L(zone.err)] : []);
    var contra = detailArray(enhanced, 'contra', zone && zone.swap ? [L(zone.swap)] : []);
    var tips = detailArray(enhanced, 'tips', []);
    return {
      enhanced: !!enhanced,
      steps: steps,
      setup: String(detailValue(enhanced, 'setup', steps[0] || detailText('Настрой исходное положение до начала движения.', 'Set the starting position before you move.'))),
      cues: cues,
      mistakes: mistakes,
      contra: contra,
      breathing: String(detailValue(enhanced, 'breathing', defaultBreathingCue(ex))),
      range: String(detailValue(enhanced, 'range', defaultRangeCue(ex))),
      control: String(detailValue(enhanced, 'control', tips[0] || defaultControlCue(ex))),
      tips: tips
    };
  }

  function detailCueCard(label, value, state) {
    return '<article class="modal-cue-card" data-state="' + esc(state || 'neutral') + '">' +
      '<span class="modal-cue-label">' + esc(label) + '</span><p>' + esc(value) + '</p></article>';
  }

  function detailAlertCard(label, value, state) {
    return '<article class="modal-alert-card" data-state="' + esc(state || 'watch') + '">' +
      '<span class="modal-alert-label">' + esc(label) + '</span><p>' + esc(value) + '</p></article>';
  }

  function detailMetric(label, value) {
    return '<div class="modal-dose-metric"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  function setModalTabActive(id) {
    qsa('[data-modal-jump]', $('modal-tabs')).forEach(function (button) {
      var active = button.dataset.modalJump === id;
      button.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }

  function renderExerciseTechnique(ex) {
    return renderExerciseTechniqueView({ $, C, L, detailAlertCard, detailCueCard, detailKindLabel, detailLevelLabel, detailStepLabel, detailText, esc, exCardZone, exerciseTechniqueModel, factRow, labelEq, labelMu, labelZone, qsa, setModalTabActive, t }, ex);
  }

  function syncModalMediaExpandLabel() {
    var frame = $('modal-media'), button = $('modal-media-expand'), label = $('modal-media-expand-label');
    if (!frame || !button || !label) return;
    var expanded = document.fullscreenElement === frame || frame.dataset.expanded === 'true';
    label.textContent = expanded ? detailText('Свернуть', 'Collapse') : detailText('Развернуть', 'Expand');
    button.setAttribute('aria-label', expanded ? detailText('Свернуть демонстрацию упражнения', 'Collapse exercise demonstration') : detailText('Развернуть демонстрацию упражнения', 'Expand exercise demonstration'));
    button.setAttribute('aria-pressed', String(expanded));
  }

  function toggleModalMedia() {
    var frame = $('modal-media');
    if (!frame) return;
    if (document.fullscreenElement === frame && document.exitFullscreen) {
      var exitRequest = document.exitFullscreen();
      if (exitRequest && exitRequest.catch) exitRequest.catch(function () {});
      return;
    }
    if (frame.dataset.expanded === 'true') {
      frame.dataset.expanded = 'false';
      syncModalMediaExpandLabel();
      return;
    }
    if (frame.requestFullscreen) {
      var request = frame.requestFullscreen();
      if (request && request.catch) {
        request.catch(function () {
          frame.dataset.expanded = 'true';
          syncModalMediaExpandLabel();
        });
      }
    } else {
      frame.dataset.expanded = 'true';
      syncModalMediaExpandLabel();
    }
  }

  function updateModalTabFromScroll() {
    var scroll = $('modal-scroll');
    if (!scroll) return;
    var ids = ['modal-technique', 'modal-cues-section', 'modal-errors-section', 'modal-dose-section', 'modal-swap-section'];
    var top = scroll.getBoundingClientRect().top + 92;
    var best = ids[0], bestDistance = Infinity;
    ids.forEach(function (id) {
      var section = $(id);
      if (!section) return;
      var distance = Math.abs(section.getBoundingClientRect().top - top);
      if (distance < bestDistance) { bestDistance = distance; best = id; }
    });
    setModalTabActive(best);
  }

  function openExercise(id, trigger, silent) {
    var ex = BY_ID[id];
    if (!ex) return;
    S.activeId = id;
    if (trigger) modalReturnFocus = trigger;

    $('modal-kicker').textContent = labelZone(ex.zone) + ' · ' + labelMu(ex.target);
    $('modal-title').textContent = exName(ex);

    var frame = $('modal-media');
    var img = $('modal-img');
    if (frame) {
      frame.dataset.expanded = 'false';
      frame.classList.remove('is-ready');
    }
    img.alt = detailText('Техника: ', 'Technique: ') + exName(ex);
    img.dataset.still = exStill(ex);
    img.setAttribute('data-ex-media', '');
    img.dataset.mediaFailed = '';
    img.classList.remove('is-ready');
    img.addEventListener('load', function () {
      img.classList.add('is-ready');
      if (frame) frame.classList.add('is-ready');
    }, { once: true });
    img.src = exMotion(ex);

    renderExerciseTechnique(ex);
    renderExerciseCoach(ex);
    renderExerciseDose(ex);
    if (!silent) S.swapReason = '';
    renderSwapReasons();
    renderSwapList();
    syncModalButtons();
    syncModalMediaExpandLabel();

    if (!silent) {
      var scroll = $('modal-scroll');
      if (scroll) scroll.scrollTop = 0;
      openOverlay($('modal'), $('modal-close'));
      track('exercise_open', { id: ex.id });
    }
  }

  function syncModalButtons() {
    var id = S.activeId;
    if (!id) return;
    var fav = isFav(id), added = inWorkout(id);
    var favBtn = $('modal-fav');
    favBtn.textContent = fav ? t('saved') : t('save');
    favBtn.setAttribute('aria-pressed', String(fav));
    var addBtn = $('modal-add');
    addBtn.textContent = added ? (S.lang === 'en' ? 'Remove from workout' : 'Убрать из тренировки') : t('addToWorkout');
    addBtn.disabled = false;
    addBtn.setAttribute('data-in-workout', String(added));
  }

  function closeModal() {
    var frame = $('modal-media');
    if (frame) frame.dataset.expanded = 'false';
    if (document.fullscreenElement === frame && document.exitFullscreen) {
      var exitRequest = document.exitFullscreen();
      if (exitRequest && exitRequest.catch) exitRequest.catch(function () {});
    }
    closeOverlay($('modal'), modalReturnFocus);
    modalReturnFocus = null;
    S.activeId = null;
    $('modal-img').removeAttribute('src');
    syncModalMediaExpandLabel();
  }

  /* ---------- 9. ТЕКУЩАЯ ТРЕНИРОВКА --------------------------------------- */
  function defaultDose(ex) {
    if (ex.custom) return { sets: ex.defaultSets || 3, reps: ex.defaultRepRange || '8–12' };
    if (ex.zone === 'cardio') return { sets: 1, reps: '10–20 мин' };
    if (ex.zone === 'waist') return { sets: 3, reps: '12–20' };
    if (ex.score >= 9) return { sets: 4, reps: '6–10' };
    return { sets: 3, reps: '10–12' };
  }

  function completedSetCount(item){return ensureSetLog(item).filter(function(x){return x.completed;}).length;}
  function totalCompletedHistorySets(entry){return(entry&&Array.isArray(entry.items)?entry.items:[]).reduce(function(sum,item){if(Array.isArray(item.setLog))return sum+item.setLog.filter(function(x){return x&&x.completed;}).length;return sum+(item.done?(Number(item.sets)||0):0);},0);}
  function totalHistorySets(entry){return(entry&&Array.isArray(entry.items)?entry.items:[]).reduce(function(sum,item){return sum+(Number(item.sets)||0);},0);}

  function addToWorkout(id, silent) {
    var ex = BY_ID[id];
    if (!ex || inWorkout(id)) return false;
    var dose = defaultDose(ex);
    S.workout.push(normalizeWorkoutRecord({ id:id, sets:dose.sets, reps:dose.reps, weight:'', done:false, setLog:[] }));
    saveWorkout();
    renderWorkout();
    renderResults();
    if (S.activeId === id) syncModalButtons();
    if (!silent) { showToast(t('addedToWorkout')); track('exercise_add', { id:id }); }
    return true;
  }

  function removeFromWorkout(id) {
    S.workout = S.workout.filter(function (item) { return item.id !== id; });
    saveWorkout();
    renderWorkout();
    renderResults();
    if (S.activeId === id) syncModalButtons();
    showToast(t('removedFromWorkout'));
  }

  function moveInWorkout(id, delta) {
    var i = S.workout.findIndex(function (item) { return item.id === id; });
    var j = i + delta;
    if (i === -1 || j < 0 || j >= S.workout.length) return;
    var tmp = S.workout[i];
    S.workout[i] = S.workout[j];
    S.workout[j] = tmp;
    saveWorkout();
    renderWorkout();
    var safeId = (window.CSS && CSS.escape) ? CSS.escape(id) : String(id).replace(/"/g, '\\"');
    var next = qs('.workout-item[data-id="' + safeId + '"] [data-move="' + delta + '"]');
    if (next && !next.disabled) next.focus();
  }

  function renderWorkout() {
    return renderWorkoutView({ $, BY_ID, S, completedSetCount, ensureSetLog, esc, exName, exStill, labelEq, labelMu, premiumIcon, renderCoachWorkout, round, saveWorkout, t, updateMobileBar, v7NextPlanDay });
  }

  function workoutText() {
    var lines = [t('wTitle'), ''];
    S.workout.forEach(function (item, i) {
      var ex = BY_ID[item.id];
      if (!ex) return;
      var parts = [(i + 1) + '. ' + exName(ex), item.sets + '×' + item.reps];
      if (item.weight) parts.push(item.weight);
      parts.push('(' + labelEq(ex.equip) + ')');
      lines.push(parts.join(' — '));
    });
    lines.push('', 'markovmade.com/gym');
    return lines.join('\n');
  }

  /* ---------- 10. КБЖУ ---------------------------------------------------- */
  function setFieldError(id, message) {
    var wrap = qs('[data-field="' + id + '"]');
    var err = $('err-' + id);
    if (wrap) wrap.setAttribute('data-invalid', message ? 'true' : 'false');
    if (err) err.textContent = message || '';
    var input = $(id);
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function readNumber(id, min, max, required) {
    var input = $(id);
    var raw = String(input.value || '').trim().replace(',', '.');
    if (!raw) {
      if (required) { setFieldError(id, t('errRequired')); return null; }
      setFieldError(id, ''); return undefined;
    }
    var value = Number(raw);
    if (!isFinite(value)) { setFieldError(id, t('errNumber')); return null; }
    if (value < min || value > max) { setFieldError(id, t('errRange', { min: min, max: max })); return null; }
    setFieldError(id, '');
    return value;
  }

  function renderKbjuPlaceholder() {
    var out = $('kbju-out');
    if (out.getAttribute('data-filled') === 'true') return;
    out.innerHTML = '<div class="empty v8-empty-flat">' +
      '<b>' + esc(t('kbjuEmptyTitle')) + '</b><p>' + esc(t('kbjuEmptyText')) + '</p></div>';
  }

  var PACE_FACTOR = { gentle: 0.6, moderate: 1, assertive: 1.45 };

  function calcKbju() {
    var age = readNumber('k-age', 14, 90, true);
    var height = readNumber('k-height', 130, 230, true);
    var weight = readNumber('k-weight', 35, 250, true);
    var fat = readNumber('k-fat', 3, 60, false);
    var waist = readNumber('k-waist', 45, 200, false);
    if (age === null || height === null || weight === null || fat === null || waist === null) {
      showToast(t('formHasErrors'), 'error');
      var firstBad = qs('[data-invalid="true"] .input');
      if (firstBad) firstBad.focus();
      return;
    }

    var sex = $('k-sex').value;
    var activity = Number($('k-activity').value);
    var goal = $('k-goal').value;
    var training = $('k-training').value;
    var pace = $('k-pace').value;

    var mifflin = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
    var lbm = null, katch = null;
    if (fat !== undefined) {
      lbm = weight * (1 - fat / 100);
      katch = 370 + 21.6 * lbm;
    }
    var bmr = katch || mifflin;
    var tdee = bmr * activity;

    var paceK = PACE_FACTOR[pace] || 1;
    var delta = 0;
    if (goal === 'cut') delta = -tdee * 0.15 * paceK;
    else if (goal === 'lean') delta = tdee * 0.07 * paceK;
    else if (goal === 'bulk') delta = tdee * 0.14 * paceK;
    var target = tdee + delta;
    target = clamp(target, bmr * 1.05, tdee * 1.35);

    var proteinPerKg = goal === 'cut' ? 2.2 : goal === 'maintain' ? 1.8 : 2.0;
    if (training === 'endurance') proteinPerKg -= 0.2;
    if (training === 'health') proteinPerKg -= 0.3;
    var proteinBase = lbm ? lbm * (proteinPerKg + 0.3) : weight * proteinPerKg;
    var protein = clamp(proteinBase, weight * 1.2, weight * 2.6);

    var fatPerKg = goal === 'cut' ? 0.8 : 1.0;
    var fats = clamp(weight * fatPerKg, target * 0.2 / 9, target * 0.38 / 9);

    var carbs = (target - protein * 4 - fats * 9) / 4;
    if (carbs < weight * 1.2) {
      carbs = weight * 1.2;
      fats = clamp((target - protein * 4 - carbs * 4) / 9, weight * 0.5, weight * 1.4);
    }
    carbs = Math.max(carbs, 40);

    var u = t('kcal'), g = t('gram');
    var lo = round(target * 0.96), hi = round(target * 1.04);

    var paceLabel = goal === 'maintain' ? t('paceKeep')
      : pace === 'gentle' ? t('paceGentleTxt')
      : pace === 'assertive' ? t('paceAssertiveTxt') : t('paceModerateTxt');

    var methodNote = katch
      ? t('kbjuMethodKatch', { lbm: lbm.toFixed(1), bmr: round(bmr), u: u })
      : t('kbjuMethodMifflin', { bmr: round(bmr), u: u });

    var goalLabelEl = $('k-goal').selectedOptions[0];
    var goalLabel = goalLabelEl ? goalLabelEl.textContent : '';

    var html = '<div>' +
      '<p class="eyebrow v8-eyebrow-tight">' + esc(t('kbjuTitle')) + '</p>' +
      '<h3 class="v8-output-title">' + esc(goalLabel) + '</h3>' +
      '</div>' +
      '<div class="kpi-row">' +
        '<div class="kpi kpi-accent"><span>' + esc(t('kbjuTarget')) + '</span><b>' + round(target) + ' ' + esc(u) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('kbjuTdee')) + '</span><b>' + round(tdee) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('kbjuBmr')) + '</span><b>' + round(bmr) + '</b></div>' +
      '</div>' +
      '<div class="kpi-row">' +
        '<div class="kpi"><span>' + esc(t('kbjuProtein')) + '</span><b>' + round(protein) + ' ' + esc(g) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('kbjuFat')) + '</span><b>' + round(fats) + ' ' + esc(g) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('kbjuCarbs')) + '</span><b>' + round(carbs) + ' ' + esc(g) + '</b></div>' +
      '</div>' +
      '<div class="note">' + esc(t('kbjuRange', { lo: lo, hi: hi, u: u })) + '</div>' +
      '<div class="note">' + esc(t('kbjuPaceNote', { pace: paceLabel })) + '</div>' +
      '<div class="note">' + esc(t('kbjuTrackNote')) + '</div>' +
      (waist !== undefined ? '<div class="note">' + esc(t('kbjuWaistNote', { waist: waist })) + '</div>' : '') +
      '<p class="tiny">' + esc(methodNote) + '</p>' +
      '<button class="btn btn-solid" type="button" id="kbju-copy">' + esc(t('kbjuCopy')) + '</button>';

    var out = $('kbju-out');
    out.innerHTML = html;
    out.setAttribute('data-filled', 'true');

    var summary = [
      'MARKOV MADE GYM — ' + goalLabel,
      t('kbjuTarget') + ': ' + round(target) + ' ' + u + ' (' + lo + '–' + hi + ')',
      t('kbjuProtein') + ': ' + round(protein) + ' ' + g,
      t('kbjuFat') + ': ' + round(fats) + ' ' + g,
      t('kbjuCarbs') + ': ' + round(carbs) + ' ' + g,
      t('kbjuTdee') + ': ' + round(tdee) + ' ' + u,
      methodNote
    ].join('\n');
    $('kbju-copy').addEventListener('click', function () { copyText(summary); });

    decorateKbju({ target: round(target), goal: goal, method: katch ? 'Katch–McArdle' : 'Mifflin–St Jeor', protein: round(protein), fat: round(fats), carbs: round(carbs) });
  }

  /* ---------- 11. КОНСТРУКТОР ПЛАНА --------------------------------------- */
  var DAY_NAMES = {
    full: { ru: 'Всё тело', en: 'Full body' },
    upper: { ru: 'Верх тела', en: 'Upper body' },
    lower: { ru: 'Низ тела', en: 'Lower body' },
    push: { ru: 'Жимовой день', en: 'Push day' },
    pull: { ru: 'Тяговый день', en: 'Pull day' },
    legs: { ru: 'Ноги и кор', en: 'Legs and core' }
  };

  var CARDIO_TEXT = {
    fatloss: { ru: '2–4 сессии по 25–40 минут в спокойном темпе + 8–10 тыс. шагов ежедневно. Кардио после силовой или в отдельный день.', en: '2–4 easy sessions of 25–40 minutes plus 8–10k steps daily. Put cardio after lifting or on a separate day.' },
    muscle: { ru: '1–2 лёгкие сессии по 20–25 минут для восстановления. Больше — начнёт мешать набору.', en: '1–2 easy 20–25 minute sessions for recovery. More than that starts to cost you gains.' },
    strength: { ru: '1 лёгкая сессия 20 минут в нетренировочный день. Тяжёлое кардио перед приседом или тягой — не нужно.', en: 'One easy 20-minute session on an off day. Skip hard cardio before squats or deadlifts.' },
    health: { ru: '2–3 сессии по 25–35 минут в комфортном темпе — можно ходьбой, велосипедом или плаванием.', en: '2–3 comfortable 25–35 minute sessions — walking, cycling or swimming all count.' }
  };

  var PROGRESS_TEXT = {
    beginner: { ru: 'Первые 6–8 недель добавляй повторы в том же весе, пока не дойдёшь до верхней границы диапазона. Только после этого увеличивай вес на 2,5–5%.', en: 'For the first 6–8 weeks add reps at the same load until you reach the top of the range. Only then add 2.5–5% to the weight.' },
    middle: { ru: 'Держи 1–3 повтора в запасе. Когда все подходы закрываются по верхней границе — добавляй вес. Каждую 5–6-ю неделю снижай объём примерно на треть.', en: 'Keep 1–3 reps in reserve. When every set hits the top of the range, add weight. Every fifth or sixth week cut volume by about a third.' },
    advanced: { ru: 'Веди недельный тоннаж по основным движениям и добавляй нагрузку волнами по 3–4 недели с разгрузочной неделей. Технический отказ — исключение, а не норма.', en: 'Track weekly tonnage on the main lifts and load in 3–4 week waves with a deload. Technical failure is the exception, not the norm.' }
  };

  function equipmentFor(place) {
    var profile=databaseEquipmentProfiles.filter(function(item){return item.id===activeEquipmentProfileId;})[0];
    if(profile)return profile.equipment.length?profile.equipment:HOME_EQUIP.concat(GYM_EQUIP);
    if (place === 'home') return HOME_EQUIP;
    if (place === 'mixed') return HOME_EQUIP.concat(GYM_EQUIP);
    return GYM_EQUIP;
  }

  /* Рейтинг для стартового плана: сначала понятные, воспроизводимые движения.
     Сложные соревновательные и координационные варианты остаются в библиотеке,
     но не попадают в типовой план раньше базовых упражнений. */
  var PLAN_PRIORITY = [
    'barbell full squat', 'barbell deadlift', 'barbell bench press',
    'barbell romanian deadlift', 'barbell bent over row', 'barbell overhead press',
    'dumbbell bench press', 'dumbbell shoulder press', 'lat pulldown',
    'pull up', 'chin up', 'lever leg press', 'barbell hip thrust',
    'seated cable row', 'cable row', 'leg extension', 'leg curl',
    'walking lunge', 'push up', 'cable face pull', 'dumbbell lateral raise',
    'dumbbell biceps curl', 'cable pushdown', 'plank'
  ];
  var PLAN_NICHE = [
    'kipping', 'muscle up', 'handstand', 'archer', 'balance with',
    'bosu', 'jump', 'backflip', 'front lever', 'iron cross',
    'clean and jerk', 'snatch', 'thruster', 'pistol squat'
  ];
  function planExerciseScore(ex, goal, level) {
    var name = norm(ex.nameEn);
    var score = ex.score * 3;
    var priority = PLAN_PRIORITY.indexOf(name);
    if (priority !== -1) score += 220 - priority * 3;
    PLAN_NICHE.forEach(function (term) {
      if (name.indexOf(term) !== -1) score -= level === 'advanced' ? 90 : 180;
    });
    if (exKind(ex) === 'compound') score += goal === 'strength' ? 46 : 24;
    if (goal === 'strength' && ['barbell', 'olympic barbell', 'trap bar', 'dumbbell', 'weighted'].indexOf(ex.equip) !== -1) score += 28;
    if (goal === 'health' && ['leverage machine', 'cable', 'body weight', 'assisted'].indexOf(ex.equip) !== -1) score += 20;
    if (level === 'beginner' && ['leverage machine', 'cable', 'assisted', 'body weight'].indexOf(ex.equip) !== -1) score += 22;
    return score + exercisePreferenceScore(ex) + (isFav(ex.id) ? 65 : 0);
  }

  function renderPlanPlaceholder() {
    var out = $('plan-out');
    if (!out) return;
    if (S.plan && Array.isArray(S.plan.days) && S.plan.days.length) {
      renderStoredPlanV10();
      return;
    }
    if (out.getAttribute('data-filled') === 'true') return;
    out.innerHTML = '<div class="empty v8-empty-flat">' +
      '<b>' + esc(t('planEmptyTitle')) + '</b><p>' + esc(t('planEmptyText')) + '</p></div>';
  }

  var lastPlan = null;

  function buildPlan() {
    var goal = $('p-goal').value;
    var level = $('p-level').value;
    var days = Number($('p-days').value);
    var time = Number($('p-time').value);
    var blockWeeks = Number($('p-block-weeks') && $('p-block-weeks').value) || 4;
    var place = $('p-place').value;
    var focus = $('p-focus').value;

    var recovery = $('p-recovery') ? $('p-recovery').value : 'mid';
    var generated = buildWeeklyPlan({
      goal: goal, level: level, days: days, time: time, focus: focus, recovery: recovery,
      allowedEquipment: equipmentFor(place), exercises: EX,
      scoreExercise: function (ex) { return planExerciseScore(ex, goal, level); },
      isExerciseAllowed: planExtraFilter
    });
    var week = generated.week;
    var split = generated.split;
    var perSession = generated.perSession;

    lastPlan = { week: week, goal: goal, level: level, days: days, time: time, place: place, focus: focus, ctx: {goal:goal,level:level,days:days,time:time,place:place,focus:focus,style:$('p-style')?$('p-style').value:'balanced',recovery:recovery,cardio:$('p-cardio')?$('p-cardio').value:'light',steps:$('p-steps')?$('p-steps').value:'mid',blockWeeks:blockWeeks} };

    var goalLabel = $('p-goal').selectedOptions[0].textContent;
    var placeLabel = $('p-place').selectedOptions[0].textContent;
    var levelLabel = $('p-level').selectedOptions[0].textContent;

    var weekHtml = week.map(function (day, dayIndex) {
      var name = DAY_NAMES[day.key][S.lang] || DAY_NAMES[day.key].ru;
      return '<div class="plan-day" data-plan-day="' + dayIndex + '">' +
        '<div class="plan-day-head"><b>' + esc(t('planDay', { n: day.index + 1 })) + ' · ' + esc(name) + '</b>' +
        '<span>' + esc(t('planRest')) + ' ' + (day.items.length ? day.items[0].rest + ' ' + esc(t('planSec')) : '—') + '</span></div>' +
        day.items.map(function (it, itemIndex) {
          return '<div class="plan-ex" data-plan-day="' + dayIndex + '" data-plan-item="' + itemIndex + '">' +
            '<button class="plan-ex-name" type="button" data-open="' + esc(it.ex.id) + '">' + esc(exName(it.ex)) + '</button>' +
            '<span class="meta-tag">' + esc(labelEq(it.ex.equip)) + '</span>' +
            '<span class="plan-ex-reason">' + esc(exercisePreference(it.ex.id) === 'prefer' ? (S.lang === 'en' ? 'Preferred by you' : 'Вы отметили как предпочтительное') : isFav(it.ex.id) ? (S.lang === 'en' ? 'Saved as a favourite' : 'В избранном') : (S.lang === 'en' ? 'Matches this day, goal and available equipment' : 'Подходит для этого дня, цели и доступного оборудования')) + '</span>' +
            '<span class="plan-ex-dose">' + it.sets + ' × ' + esc(it.reps) + '</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }).join('');

    var out = $('plan-out');
    out.innerHTML = '<div>' +
        '<p class="eyebrow v8-eyebrow-tight">' + esc(goalLabel + ' · ' + levelLabel + ' · ' + placeLabel) + '</p>' +
        '<h3 class="v8-output-title">' + esc(DAY_NAMES[split[0]][S.lang] || '') + ' → ' + esc(String(days)) + '/7</h3>' +
        '<p class="small v8-mt-2">' + esc(t('planWeekly', { days: days, time: time, ex: perSession })) + '</p>' +
      '</div>' +
      '<div class="plan-week">' + weekHtml + '</div>' +
      '<div class="note"><b>' + esc(t('planCardio')) + '.</b> ' + esc(planCardioTextV10({goal:goal,cardio:$('p-cardio')?$('p-cardio').value:'light',steps:$('p-steps')?$('p-steps').value:'mid'})) + '</div>' +
      '<div class="note"><b>' + esc(t('planProgress')) + '.</b> ' + esc(PROGRESS_TEXT[level][S.lang] || PROGRESS_TEXT[level].ru) + '</div>' +
      '<div class="note note-warn">' + esc(t('plan.disclaimer')) + '</div>' +
      '<div class="plan-actions">' +
        '<button class="btn btn-primary btn-sm" type="button" id="plan-copy">' + esc(t('planCopy')) + '</button>' +
        '<button class="btn btn-solid btn-sm" type="button" id="plan-to-workout">' + esc(t('planToWorkout')) + '</button>' +
      '</div>';
    out.setAttribute('data-filled', 'true');

    $('plan-copy').addEventListener('click', function () { copyText(planText()); });
    $('plan-to-workout').addEventListener('click', function () {
      week[0].items.forEach(function (it) {
        if (!inWorkout(it.ex.id)) {
          S.workout.push({ id: it.ex.id, sets: it.sets, reps: it.reps, weight: '', done: false });
        }
      });
      saveWorkout(); renderWorkout(); renderResults();
      showToast(t('planAddedDay'));
    });

    decoratePlan(week, {
      days: days, time: time, goal: goal, level: level, place: place, focus: focus,
      style: $('p-style') ? $('p-style').value : 'balanced',
      recovery: $('p-recovery') ? $('p-recovery').value : 'mid',
      cardio: $('p-cardio') ? $('p-cardio').value : 'light',
      steps: $('p-steps') ? $('p-steps').value : 'mid',
      blockWeeks: blockWeeks,
      goalLabel: goalLabel, levelLabel: levelLabel, placeLabel: placeLabel
    });
  }

  function planText() {
    if (!lastPlan) return '';
    var lines = [t('planTitle'), ''];
    lines.push(t('planWeekly', { days: lastPlan.days, time: lastPlan.time, ex: lastPlan.week[0].items.length }));
    lines.push('');
    lastPlan.week.forEach(function (day) {
      var name = DAY_NAMES[day.key][S.lang] || DAY_NAMES[day.key].ru;
      lines.push(t('planDay', { n: day.index + 1 }) + ' — ' + name + ' (' + t('planRest') + ' ' + (day.items[0] ? day.items[0].rest : 90) + ' ' + t('planSec') + ')');
      day.items.forEach(function (it, i) {
        lines.push('  ' + (i + 1) + '. ' + exName(it.ex) + ' — ' + it.sets + '×' + it.reps + ' (' + labelEq(it.ex.equip) + ')');
      });
      lines.push('');
    });
    lines.push(t('planCardio') + ': ' + planCardioTextV10(lastPlan.ctx || { goal:lastPlan.goal, cardio:'light', steps:'mid' }));
    lines.push(t('planProgress') + ': ' + (PROGRESS_TEXT[lastPlan.level][S.lang] || PROGRESS_TEXT[lastPlan.level].ru));
    lines.push('', 'markovmade.com/gym');
    return lines.join('\n');
  }

  /* ---------- 12. ЗАЯВКА -------------------------------------------------- */
  var TELEGRAM = 'https://t.me/markovmade';



  /* ---------- 13. ОВЕРЛЕИ, TOAST, БУФЕР ----------------------------------- */
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var overlayStack = [];

  function lockBody(lock) {
    document.body.classList.toggle('is-locked', lock);
  }

  function openOverlay(el, focusTarget, options) {
    var opts = options || {};
    el.inert = false;
    el.setAttribute('aria-hidden', 'false');
    el.setAttribute('data-open', 'true');
    if (el.hasAttribute('hidden')) el.removeAttribute('hidden');
    overlayStack.push({ el: el, onClose: opts.onClose, returnFocus: document.activeElement });
    lockBody(true);
    if (opts.scrim !== false) {
      var scrim = $('scrim');
      scrim.hidden = false;
      scrim.setAttribute('data-open', 'true');
    }
    window.setTimeout(function () {
      var target = focusTarget || qs(FOCUSABLE, el);
      if (target && typeof target.focus === 'function') target.focus();
    }, 20);
  }

  function closeOverlay(el, returnFocus) {
    if (el.id === 'run') { saveCurrentSetDraft(); saveRunSession(); }
    el.setAttribute('data-open', 'false');
    el.setAttribute('aria-hidden', 'true');
    var i = overlayStack.findIndex(function (entry) { return entry.el === el; });
    var entry = i !== -1 ? overlayStack.splice(i, 1)[0] : null;
    if (entry && entry.onClose) entry.onClose();
    if (!overlayStack.length) {
      lockBody(false);
      var scrim = $('scrim');
      scrim.setAttribute('data-open', 'false');
      window.setTimeout(function () { if (!overlayStack.length) scrim.hidden = true; }, 220);
    }
    var back = returnFocus || (entry && entry.returnFocus);
    if (back && document.contains(back) && typeof back.focus === 'function') back.focus();
    window.setTimeout(function(){ if(el.getAttribute('data-open') !== 'true') el.inert = true; }, 0);
  }

  function topOverlay() { return overlayStack.length ? overlayStack[overlayStack.length - 1] : null; }

  function handleTrap(event) {
    var top = topOverlay();
    if (!top || event.key !== 'Tab') return;
    var nodes = qsa(FOCUSABLE, top.el).filter(function (n) {
      return n.offsetParent !== null || n === document.activeElement;
    });
    if (!nodes.length) return;
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    else if (!top.el.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
  }

  var toastTimer = 0;
  function showToast(message, tone) {
    var el = $('toast');
    el.textContent = message;
    el.setAttribute('data-tone', tone || 'info');
    el.setAttribute('data-open', 'true');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.setAttribute('data-open', 'false'); }, 2600);
  }

  function copyText(text, successMessage) {
    var done = function () { showToast(successMessage || t('copied')); };
    var fail = function () { showToast(t('copyFailed'), 'error'); };
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () { legacyCopy(text) ? done() : fail(); });
    } else {
      legacyCopy(text) ? done() : fail();
    }
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function shareOrCopy(title, text) {
    if (navigator.share) {
      navigator.share({ title: title, text: text }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        copyText(text, t('shareUnavailable'));
      });
    } else {
      copyText(text, t('shareUnavailable'));
    }
  }

  /* ---------- КОМАНДНАЯ ПАНЕЛЬ -------------------------------------------- */
  var SECTIONS = [
    { hash:'#home', label:{ru:'Сегодня',en:'Today'} },
    { hash:'#workout', label:{ru:'Тренировка',en:'Workout'} },
    { hash:'#library', label:{ru:'Библиотека',en:'Library'} },
    { hash:'#program', label:{ru:'Программа',en:'Programme'} },
    { hash:'#progress', label:{ru:'Прогресс',en:'Progress'} },
    { hash:'#nutrition', label:{ru:'Питание',en:'Nutrition'} },
    { hash:'#tools', label:{ru:'MARKOV MADE LAB',en:'MARKOV MADE LAB'} },
    { hash:'#knowledge', label:{ru:'База знаний',en:'Knowledge'} },
    { hash:'#settings', label:{ru:'Настройки',en:'Settings'} },
    { hash:'#method', label:{ru:'Метод',en:'Method'} },
    { hash:'#about', label:{ru:'Павел Марков',en:'Pavel Markov'} }
  ];
  var LAB_COMMANDS = [
    {q:'1rm e1rm максимум',label:{ru:'e1RM — оценка максимума',en:'e1RM estimate'}},
    {q:'блины plates barbell',label:{ru:'Plate Calculator PRO',en:'Plate Calculator PRO'}},
    {q:'разминка warmup',label:{ru:'Разминочный ramp',en:'Warm-up ramp'}},
    {q:'bmr tdee расход калории',label:{ru:'BMR / TDEE',en:'BMR / TDEE'}},
    {q:'белок protein',label:{ru:'Белковый диапазон',en:'Protein range'}},
    {q:'макросы macros кбжу',label:{ru:'План макросов',en:'Macro planner'}},
    {q:'ffmi состав тела жир',label:{ru:'Состав тела / FFMI',en:'Body composition / FFMI'}},
    {q:'пульс зоны heart rate',label:{ru:'Пульсовые зоны',en:'Heart-rate zones'}},
    {q:'темп pace бег',label:{ru:'Темп и скорость',en:'Pace and speed'}},
    {q:'adaptive expenditure расход мои данные',label:{ru:'Adaptive expenditure',en:'Adaptive expenditure'}}
  ];
  var cmdkItems = [];
  var cmdkIndex = 0;

  function sectionLabel(section) {
    if (section && section.label) return S.lang === 'en' ? section.label.en : section.label.ru;
    var key = section && section.key ? section.key : section;
    return domText(key) || key;
  }

  function renderCmdk(query) {
    var box = $('cmdk-results');
    var q = norm(query);
    cmdkItems = searchCommandPalette(query, {
      sections: SECTIONS,
      labCommands: LAB_COMMANDS,
      muscles: MUSCLES,
      exercises: EX,
      normalize: norm,
      sectionLabel: sectionLabel,
      sectionHint: t('cmdkSection'),
      muscleLabel: labelMu,
      muscleHint: t('discMuscles'),
      muscleRank: matchRank,
      exerciseLabel: exName,
      exerciseHint: function(exercise) { return labelMu(exercise.target); },
      exerciseRank: exerciseDiscoveryRank,
      language: S.lang
    });
    cmdkIndex = 0;
    if (!cmdkItems.length) {
      box.innerHTML = '<li class="cmdk-empty">' + esc(q ? t('cmdkEmpty') : t('cmdkStart')) + '</li>';
      return;
    }
    box.innerHTML = cmdkItems.map(function (item, i) {
      return '<li role="presentation"><button class="cmdk-item" type="button" role="option" id="cmdk-opt-' + i +
        '" aria-selected="' + (i === 0) + '" data-cmdk-index="' + i + '">' +
        '<span>' + esc(item.label) + '</span><span>' + esc(item.hint) + '</span></button></li>';
    }).join('');
    $('cmdk-input').setAttribute('aria-activedescendant', 'cmdk-opt-0');
  }

  function moveCmdk(delta) {
    if (!cmdkItems.length) return;
    cmdkIndex = (cmdkIndex + delta + cmdkItems.length) % cmdkItems.length;
    qsa('.cmdk-item').forEach(function (btn, i) {
      btn.setAttribute('aria-selected', String(i === cmdkIndex));
      if (i === cmdkIndex) btn.scrollIntoView({ block: 'nearest' });
    });
    $('cmdk-input').setAttribute('aria-activedescendant', 'cmdk-opt-' + cmdkIndex);
  }

  function runCmdk(index) {
    var item = cmdkItems[index];
    if (!item) return;
    closeOverlay($('cmdk'));
    if (item.type === 'section') {
      location.hash = item.hash;
    } else if (item.type === 'lab') {
      if (typeof window.mmgLabOpen === 'function') window.mmgLabOpen(item.query);
      else location.hash = '#tools';
    } else if (item.type === 'muscle') {
      S.query=''; S.zones=[]; S.muscles=[item.muscle]; S.limit=PAGE; $('search').value=''; renderFilters(); renderResults(); scrollToLibrary();
    } else {
      openExercise(item.id, null);
    }
  }

  /* ==========================================================================
     15. ЭКОСИСТЕМА ТРЕНЕРА — контент, профиль, режим тренера, карточка
     ====================================================================== */

  /* ---------- 15.1 КОНТЕНТНЫЙ СЛОЙ ---------------------------------------- */
  var C = null;

  async function loadContent() {
    try {
      var response = await fetch(new URL('./data/content.json', document.baseURI), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('content ' + response.status);
      C = await response.json();
      return !!C;
    } catch (e) {
      C = null;
      return false;
    }
  }

  /* Двуязычное значение: {ru,en} → строка или массив под текущий язык. */
  function L(pair) {
    if (!pair) return '';
    return S.lang === 'en' && pair.en != null ? pair.en : pair.ru;
  }

  /* ---------- 15.2 СОБЫТИЯ (без отправки наружу) -------------------------- */
  /* Единый безопасный слой: события копятся в памяти страницы и доступны как
     window.mmgEvents. Никакой сети и никаких сторонних скриптов. */
  var EVENTS = [];
  window.mmgEvents = EVENTS;
  function track(name, payload) {
    EVENTS.push({ e: name, t: Date.now(), d: payload || null });
    if (EVENTS.length > 400) EVENTS.splice(0, 200);
    if (typeof window.mmgOnEvent === 'function') {
      try { window.mmgOnEvent(name, payload || null); } catch (err) { /* обработчик владельца */ }
    }
  }

  /* ---------- 15.3 ХРАНИЛИЩЕ v3 ------------------------------------------ */
  K.profile = 'mmg.profile.v1';
  K.meta = 'mmg.workoutMeta.v1';
  K.history = 'mmg.history.v1';
  K.calculatorHistory = 'mmg.calculatorResults.v1';
  K.customExercises = 'mmg.customExercises.v1';
  K.equipmentProfiles = 'mmg.equipmentProfiles.v1';
  K.equipmentProfileActive = 'mmg.equipmentProfileActive.v1';
  K.diary = 'mmg.diary.v1';
  K.nutritionLog = 'mmg.nutritionLog.v1';
  K.kbju = 'mmg.kbju.v1';
  K.tips = 'mmg.tips.v1';
  K.coach = 'mmg.coach.v1';
  K.rest = 'mmg.rest.v1';
  K.recentSearch = 'mmg.recentSearches.v1';
  K.recentExercises = 'mmg.recentExercises.v1';
  K.runSession = 'mmg.runSession.v1';
  K.plan = 'mmg.plan.v1';
  K.settings = 'mmg.settings.v1';
  K.workoutSchema = 'mmg.workoutSchema.v4';
  K.historySchema = 'mmg.historySchema.v2';
  [K.fav,K.workout,K.profile,K.meta,K.equipmentProfileActive,K.kbju,K.tips,K.coach,K.rest,K.recentSearch,K.recentExercises,K.settings,K.calculatorHistory].forEach(function(key){indexedAppStateKeys[key]=true;});
  [K.history,K.customExercises,K.equipmentProfiles,K.exercisePreferences,K.nutritionLog,K.diary,K.plan].forEach(function(key){indexedRepositoryKeys[key]=true;});

  var DEFAULT_PROFILE = { goal:'', level:'', place:'', days:'', typicalSessionMinutes:'', equipmentAvailability:[], focus:'balanced', limitations:[], recoveryBaseline:'mid', done:false, skipped:false };

  function saveProfile() { store.set(K.profile, JSON.stringify(S.profile)); }
  function saveMeta() { store.set(K.meta, JSON.stringify(S.meta)); }
  function saveHistory() {
    databaseHistory = S.history.slice();
    var fallback = function () {
      storageWarnings.push({ key: K.history, type: 'indexeddb-write', at: Date.now() });
      try { if (storageOk) { window.localStorage.setItem(K.history, JSON.stringify(databaseHistory)); return true; } } catch (_fallbackError) {}
      return false;
    };
    if (historyRepository) return historyRepository.replaceAll(databaseHistory).then(function(){return true;}).catch(fallback);
    return Promise.resolve(store.set(K.history, JSON.stringify(databaseHistory)) !== false);
  }
  async function saveCustomExerciseRecords(records) {
    var clean = cleanCustomExercises(records);
    if (historyRepository) {
      try { await historyRepository.replaceCustomExercises(clean); }
      catch (error) { try { if (storageOk) window.localStorage.setItem(K.customExercises, JSON.stringify(clean)); } catch (_fallbackError) {} throw error; }
    }
    databaseCustomExercises = clean;
    if (store.set(K.customExercises, JSON.stringify(clean)) === false && !historyRepository) {
      throw new Error('Custom exercises could not be saved in browser storage');
    }
    return clean;
  }
  async function saveEquipmentProfileRecords(records) {
    var clean = cleanEquipmentProfiles(records);
    if (historyRepository) {
      try { await historyRepository.replaceEquipmentProfiles(clean); }
      catch (error) { try { if (storageOk) window.localStorage.setItem(K.equipmentProfiles, JSON.stringify(clean)); } catch (_fallbackError) {} throw error; }
    }
    databaseEquipmentProfiles = clean;
    if (store.set(K.equipmentProfiles, JSON.stringify(clean)) === false && !historyRepository) {
      throw new Error('Equipment profiles could not be saved in browser storage');
    }
    return clean;
  }
  function saveDiary() { store.set(K.diary, JSON.stringify(cleanMeasurementsFn(S.diary))); }
  function saveTips() { store.set(K.tips, JSON.stringify(S.tips)); }
  function saveSettings() { store.set(K.settings, JSON.stringify(S.settings)); }
  function applyReadability() {
    var mode = S.settings && ['balanced','comfortable','large'].indexOf(S.settings.reading) !== -1 ? S.settings.reading : 'balanced';
    if (S.settings) S.settings.reading = mode;
    document.documentElement.setAttribute('data-reading', mode);
  }
  function serialisePlanV7(plan){
    if(!plan||!Array.isArray(plan.days))return null;
    return {v:2,createdAt:Number(plan.createdAt)||Date.now(),weekKey:String(plan.weekKey||v7CurrentWeekKey()),completedDays:Array.isArray(plan.completedDays)?plan.completedDays.map(Number).filter(function(n){return n>=0&&n<12;}):[],ctx:plan.ctx||{},days:plan.days.map(function(day,i){return {key:String(day.key||''),index:Number(day.index)>=0?Number(day.index):i,items:(day.items||[]).map(function(it){var ex=it&&it.ex;return {id:String(ex&&ex.id||it&&it.id||''),sets:Number(it&&it.sets)||3,reps:String(it&&it.reps||'10–12').slice(0,24),rest:Number(it&&it.rest)||90};}).filter(function(it){return !!BY_ID[it.id];})};})};
  }
  function restorePlanV7(raw){
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.days))return null;
    var days=raw.days.map(function(day,i){return {key:String(day.key||''),index:Number(day.index)>=0?Number(day.index):i,items:(day.items||[]).map(function(it){var ex=BY_ID[String(it.id||'')];return ex?{ex:ex,sets:clamp(Number(it.sets)||3,1,20),reps:String(it.reps||'10–12').slice(0,24),rest:clamp(Number(it.rest)||90,15,900)}:null;}).filter(Boolean)};}).filter(function(d){return d.items.length;});
    var currentWeek=v7CurrentWeekKey(),storedWeek=String(raw.weekKey||currentWeek),completed=Array.isArray(raw.completedDays)?raw.completedDays.map(Number).filter(function(n){return n>=0&&n<days.length;}):[];if(raw.weekKey&&storedWeek!==currentWeek)completed=[];
    var ctx=raw.ctx&&typeof raw.ctx==='object'?Object.assign({},raw.ctx):{};
    if([4,6,8].indexOf(Number(ctx.blockWeeks))===-1)ctx.blockWeeks=4;
    if(typeof ctx.blockStartWeek!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(ctx.blockStartWeek))ctx.blockStartWeek=currentWeek;
    ctx.weeklyReviews=cleanWeeklyReviewsFn(ctx.weeklyReviews);
    return days.length?{days:days,ctx:ctx,createdAt:Number(raw.createdAt)||Date.now(),weekKey:currentWeek,completedDays:completed}:null;
  }
  function savePlanV7(){var data=serialisePlanV7(S.plan);if(data)store.set(K.plan,JSON.stringify(data));else store.remove(K.plan);}

  /* ---------- 15.4 РАСШИРЕНИЕ СОСТОЯНИЯ ---------------------------------- */
  function migrateEco() {
    var p = store.json(K.profile, null);
    S.profile = (p && typeof p === 'object') ? {
      goal:String(p.goal||''), level:String(p.level||''), place:String(p.place||''), days:String(p.days||''),
      typicalSessionMinutes:String(p.typicalSessionMinutes||p.time||''),
      equipmentAvailability:Array.isArray(p.equipmentAvailability)?p.equipmentAvailability.map(String).slice(0,32):[],
      focus:String(p.focus||'balanced').slice(0,40), limitations:Array.isArray(p.limitations)?p.limitations.map(String).slice(0,16):[],
      recoveryBaseline:String(p.recoveryBaseline||'mid').slice(0,20), done:!!p.done, skipped:!!p.skipped
    } : Object.assign({}, DEFAULT_PROFILE);

    var m = store.json(K.meta, null);
    S.meta = (m && typeof m === 'object') ? {
      name:String(m.name||'').slice(0,80), date:String(m.date||'').slice(0,10), note:String(m.note||'').slice(0,600),
      planDay:Number.isInteger(Number(m.planDay))?Number(m.planDay):null
    } : { name:'', date:'', note:'', planDay:null };

    var h = store.json(K.history, []);
    var fallbackHistory = Array.isArray(h) ? h.filter(function (x) { return x && Array.isArray(x.items); }) : [];
    S.history = Array.isArray(databaseHistory) ? databaseHistory : fallbackHistory;

    var d = historyRepository ? databaseMeasurements : store.json(K.diary, []);
    S.diary = cleanMeasurementsFn(d);

    var kb = store.json(K.kbju, null);
    S.kbjuLast = (kb && typeof kb === 'object' && kb.target) ? kb : null;

    var tips = store.json(K.tips, []);
    S.tips = Array.isArray(tips) ? tips.map(String).slice(0, 200) : [];

    S.coachOn = store.get(K.coach) !== '0';

    var rest = Number(store.get(K.rest));
    S.rest = [60, 90, 120, 180].indexOf(rest) !== -1 ? rest : 90;

    // Консоль подхватывает уже известный профиль
    if (S.profile.goal) S.console.goal = S.profile.goal;
    if (S.profile.place) S.console.place = S.profile.place;
    if (S.profile.level) S.console.level = S.profile.level;

    var recentSearches = store.json(K.recentSearch, []);
    S.recentSearches = Array.isArray(recentSearches) ? recentSearches.map(String).filter(Boolean).slice(0, 8) : [];
    var recentExercises = store.json(K.recentExercises, []);
    S.recentExercises = Array.isArray(recentExercises) ? recentExercises.map(String).filter(function(id){ return !!BY_ID[id]; }).slice(0, 8) : [];
    var runSaved = store.json(K.runSession, null);
    S.runSession = (runSaved && typeof runSaved === 'object' && Date.now() - Number(runSaved.startedAt || 0) < 8 * 3600000) ? runSaved : null;
    S.plan = restorePlanV7(store.json(K.plan,null));
    if(S.plan) savePlanV7();
    var settings=store.json(K.settings,null);
    S.settings=(settings&&typeof settings==='object')?{rir:!!settings.rir,rpe:!!settings.rpe,reading:['balanced','comfortable','large'].indexOf(settings.reading)!==-1?settings.reading:'balanced',loadIncrements:cleanLoadIncrementOverrides(settings.loadIncrements)}:{rir:false,rpe:false,reading:'balanced',loadIncrements:{}};
    applyReadability();
  }

  /* ---------- 15.5 ОБЩИЕ ПРИМИТИВЫ РЕНДЕРА ------------------------------- */
  var MARK_SVG = '<svg viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">' +
    '<path d="M9 29V11h4.4l6.6 10.2L26.6 11H31v18h-4.3V18.9l-5.9 9.1h-1.6l-5.9-9.1V29z"/></svg>';

  /* Единый компонент авторской рекомендации.
     note: {t,d,a,w} — мысль, объяснение, действие, предупреждение. */
  function coachNote(note, opts) {
    if (!note) return '';
    opts = opts || {};
    var kicker = opts.kicker || t('coachKicker');
    var html = '<div class="cnote' + (opts.compact ? ' cnote--compact' : '') + '">' +
      '<span class="cnote-mark" aria-hidden="true">' + MARK_SVG + '</span>' +
      '<div class="cnote-body">' +
      '<p class="cnote-kicker">' + esc(kicker) + '</p>';
    if (note.t) html += '<p class="cnote-t">' + esc(L(note.t)) + '</p>';
    if (note.d) html += '<p class="cnote-d">' + esc(L(note.d)) + '</p>';
    if (note.a) html += '<p class="cnote-a">' + esc(L(note.a)) + '</p>';
    if (note.w) html += '<p class="cnote-w">' + esc(L(note.w)) + '</p>';
    if (opts.why && opts.why.length) {
      html += '<details class="cnote-why"><summary>' + esc(t('whyThis')) + '</summary><ul>' +
        opts.why.map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('') +
        '</ul><p class="v8-mt-2">' + esc(t('whyLimit')) + '</p></details>';
    }
    html += '</div></div>';
    return html;
  }

  function signal(state, label) {
    return '<span class="signal" data-state="' + esc(state) + '">' + esc(label) + '</span>';
  }

  function renderGuides(hostId, key) {
    var host = $(hostId);
    if (!host || !C.guides[key]) return;
    host.innerHTML = C.guides[key].map(function (g) {
      return '<details class="guide"><summary>' + esc(L(g.t)) + '</summary><p>' + esc(L(g.d)) + '</p></details>';
    }).join('');
  }

  /* ---------- 15.6 КЛАССИФИКАЦИЯ УПРАЖНЕНИЯ ------------------------------ */
  var FREE_WEIGHT = ['barbell', 'olympic barbell', 'ez barbell', 'dumbbell', 'kettlebell', 'trap bar', 'weighted'];
  var GUIDED = ['leverage machine', 'sled machine', 'smith machine', 'cable', 'stationary bike', 'elliptical machine'];
  var HOME_EQUIP = ['body weight', 'band', 'dumbbell', 'resistance band', 'medicine ball', 'stability ball', 'rope'];

  function exKind(ex) {
    if (ex.custom && typeof ex.compound === 'boolean') return ex.compound ? 'compound' : (ex.secondary.length ? 'accessory' : 'isolation');
    var n = ex.secondary.length;
    if (n >= 3) return 'compound';
    if (n >= 1) return 'accessory';
    return 'isolation';
  }

  function exLevel(ex) {
    var kind = exKind(ex);
    var free = FREE_WEIGHT.indexOf(ex.equip) !== -1;
    var guided = GUIDED.indexOf(ex.equip) !== -1;
    if (kind === 'compound' && free) return 'advanced';
    if (guided || kind === 'isolation') return 'beginner';
    return 'medium';
  }

  function isHomeFriendly(ex) { return HOME_EQUIP.indexOf(ex.equip) !== -1; }

  /* Авторский комментарий: сначала curated по названию, затем шаблон по зоне. */
  function exCurated(ex) {
    var name = norm(ex.nameEn);
    for (var i = 0; i < C.card.curated.length; i++) {
      if (name.indexOf(C.card.curated[i][0]) !== -1) return C.card.curated[i][1];
    }
    return null;
  }

  function exCardZone(ex) { return C.card.zone[ex.zone] || null; }

  function exScale(ex) { return C.card.scale[ex.equip] || C.card.scale['default']; }

  /* ---------- 15.7 РЕЖИМ ТРЕНЕРА: БИБЛИОТЕКА ----------------------------- */
  function libNote(list) {
    if (!C) return { note: null, why: [] };
    var byId = {};
    C.coach.lib.forEach(function (n) { byId[n.id] = n; });

    if (!list.length) return { note: byId['none'], why: [t('whyNoResults')] };

    var why = [];
    if (S.zones.length) why.push(t('whyZone', { v: S.zones.map(labelZone).join(', ') }));
    if (S.muscles.length) why.push(t('whyMuscle', { v: S.muscles.map(labelMu).join(', ') }));
    if (S.equipment.length) why.push(t('whyEquip', { v: S.equipment.map(labelEq).join(', ') }));
    why.push(t('whyCount', { n: list.length }));

    if (S.favOnly) return { note: byId['fav'], why: why };

    var homeOnly = S.equipment.length > 0 && S.equipment.every(function (eq) { return HOME_EQUIP.indexOf(eq) !== -1; });
    if (homeOnly) return { note: byId['home'], why: why };

    if (list.length > 300) return { note: byId['many'], why: why };

    var compounds = list.filter(function (ex) { return exKind(ex) === 'compound'; }).length;
    if (!compounds && list.length > 2) return { note: byId['isolation'], why: why };

    if (list.length <= 40) return { note: byId['few'], why: why };
    return { note: byId['many'], why: why };
  }

  function renderCoachLib(list) {
    var host = $('coach-lib');
    if (!host || !C) return;
    if (!S.coachOn) { host.innerHTML = ''; return; }
    var res = libNote(list || S.lastFiltered);
    // Если выбрана одна зона — приоритет у разбора именно этой зоны.
    var note = res.note;
    if (S.zones.length === 1 && C.coach.zone[S.zones[0]]) note = C.coach.zone[S.zones[0]];
    else if (S.equipment.length === 1 && C.coach.equip[S.equipment[0]]) note = C.coach.equip[S.equipment[0]];
    host.innerHTML = coachNote(note, { why: res.why });
  }

  /* ---------- 15.8 РЕЖИМ ТРЕНЕРА: ТРЕНИРОВКА ----------------------------- */
  function workoutNote() {
    if (!C) return { note: null, why: [] };
    var byId = {};
    C.coach.workout.forEach(function (n) { byId[n.id] = n; });
    var items = S.workout.map(function (w) { return BY_ID[w.id]; }).filter(Boolean);
    if (!items.length) return { note: byId['empty'], why: [t('whyEmptyWorkout')] };

    var sets = S.workout.reduce(function (sum, w) { return sum + w.sets; }, 0);
    var why = [t('whyWorkoutEx', { n: items.length }), t('whyWorkoutSets', { n: sets })];

    var targets = {};
    items.forEach(function (ex) { targets[ex.target] = (targets[ex.target] || 0) + 1; });
    var maxSame = 0, zoneSets = {};
    Object.keys(targets).forEach(function (k) { if (targets[k] > maxSame) maxSame = targets[k]; });
    S.workout.forEach(function (w) {
      var ex = BY_ID[w.id];
      if (ex) zoneSets[ex.zone] = (zoneSets[ex.zone] || 0) + w.sets;
    });
    var maxZoneSets = 0;
    Object.keys(zoneSets).forEach(function (z) { if (zoneSets[z] > maxZoneSets) maxZoneSets = zoneSets[z]; });
    why.push(t('whyWorkoutZones', { n: Object.keys(zoneSets).length }));

    if (items.length > 9) return { note: byId['overloaded'], why: why };
    if (maxSame >= 3) return { note: byId['duplicates'], why: why };
    if (maxZoneSets > 14) return { note: byId['highVolume'], why: why };
    if (!items.some(function (ex) { return exKind(ex) === 'compound'; })) return { note: byId['noCompound'], why: why };
    return { note: byId['balanced'], why: why };
  }

  function renderCoachWorkout() {
    var host = $('coach-workout');
    if (!host || !C) return;
    if (!S.coachOn) { host.innerHTML = ''; return; }
    var res = workoutNote();
    host.innerHTML = coachNote(res.note, { why: res.why });
  }

  /* ---------- 15.9 КОНСОЛЬ ТРЕНЕРА (hero) -------------------------------- */
  function renderConsole() {
    if (!C) return;
    qsa('[data-console]').forEach(function (group) {
      var key = group.dataset.console;
      qsa('[data-v]', group).forEach(function (b) {
        b.setAttribute('aria-pressed', String(S.console[key] === b.dataset.v));
      });
    });

    var keys = ['goal', 'place', 'level', 'time'];
    var answered = keys.filter(function (key) { return !!S.console[key]; }).length;
    var heroPanel = qs('.hero-panel');
    if (heroPanel) {
      heroPanel.setAttribute('data-console-complete', String(answered === 4));
      heroPanel.setAttribute('data-console-editing', String(!!S.consoleEditing));
    }
    var progress = $('console-progress-bar');
    var progressLabel = $('console-progress-label');
    if (progress) progress.style.width = (answered * 25) + '%';
    if (progressLabel) progressLabel.textContent = answered + ' / 4';

    var out = $('console-out'), hint = $('console-hint');
    if (answered < 4) {
      out.hidden = true;
      out.innerHTML = '';
      hint.hidden = false;
      hint.textContent = consoleHint(answered);
      S.consoleRecommendation = null;
      return;
    }

    hint.hidden = true;
    out.hidden = false;
    var rec = buildConsoleRecommendation(S.console);
    S.consoleRecommendation = rec;
    syncProfileFromConsole();
    var tg = 'https://t.me/markovmade?text=' + encodeURIComponent(consoleRecommendationText(rec, true));

    out.innerHTML =
      '<article class="rec-card rec-card-compact">' +
        '<div class="rec-status">' +
          '<span class="signal" data-state="ok">' + esc(L({ ru: 'Сценарий обновляется при каждом изменении', en: 'The scenario updates with every change' })) + '</span>' +
          '<button class="btn btn-quiet btn-sm rec-reset" type="button" data-console-edit>' + esc(S.consoleEditing ? L({ ru: 'Свернуть', en: 'Collapse' }) : L({ ru: 'Изменить параметры', en: 'Edit inputs' })) + '</button>' +
        '</div>' +
        '<div class="rec-context-grid">' +
          recContextChip(L({ ru: 'Цель', en: 'Goal' }), rec.labels.goal) +
          recContextChip(L({ ru: 'Место', en: 'Setting' }), rec.labels.place) +
          recContextChip(L({ ru: 'Опыт', en: 'Experience' }), rec.labels.level) +
          recContextChip(L({ ru: 'Время', en: 'Time' }), rec.labels.time) +
        '</div>' +
        '<div class="rec-main">' +
          '<p class="cnote-kicker">' + esc(t('coachKicker')) + '</p>' +
          '<h3 class="rec-title">' + esc(rec.title) + '</h3>' +
          '<div class="rec-focus"><span>' + esc(L({ ru: 'Главный фокус', en: 'Main focus' })) + '</span><b>' + esc(rec.focus) + '</b></div>' +
        '</div>' +
        '<div class="rec-metrics rec-metrics-compact">' +
          recMetric(L({ ru: 'Формат', en: 'Format' }), rec.format) +
          recMetric(L({ ru: 'Частота', en: 'Frequency' }), rec.frequency) +
          recMetric(L({ ru: 'Интенсивность', en: 'Intensity' }), rec.intensity) +
        '</div>' +
        '<div class="rec-timeline" aria-label="' + esc(L({ ru: 'Сценарий тренировки на сегодня', en: 'Today’s session blueprint' })) + '">' +
          recTimelineStep('01', L({ ru: 'Разминка', en: 'Warm-up' }), rec.today[0]) +
          recTimelineStep('02', L({ ru: 'Основная работа', en: 'Main work' }), rec.today[1]) +
          recTimelineStep('03', L({ ru: 'Завершение', en: 'Finish' }), rec.today[3]) +
        '</div>' +
        '<details class="rec-details">' +
          '<summary>' + esc(L({ ru: 'Почему именно такой вариант', en: 'Why this setup' })) + '</summary>' +
          '<p>' + esc(rec.why) + '</p>' +
        '</details>' +
        '<p class="rec-limit rec-limit--compact">' + esc(L({
          ru: 'Стартовый ориентир, не медицинское назначение. При боли или ограничениях нужен профильный специалист.',
          en: 'Starting guidance, not medical advice. Pain or medical limitations require an appropriate professional.'
        })) + '</p>' +
        '<div class="console-actions">' +
          '<button class="btn btn-solid btn-sm" type="button" data-console-copy>' + esc(L({ ru: 'Скопировать', en: 'Copy' })) + '</button>' +
          '<button class="btn btn-primary btn-sm" type="button" data-cact="library">' + esc(t('consoleLibrary')) + '</button>' +
          '<a class="btn btn-quiet btn-sm" href="' + esc(tg) + '" target="_blank" rel="noopener noreferrer">' + esc(L({ ru: 'Полный план у Павла', en: 'Full plan with Pavel' })) + '</a>' +
        '</div>' +
      '</article>';
  }

  function recMetric(label, value) {
    return '<div class="rec-metric"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  function recContextChip(label, value) {
    return '<div class="rec-context-chip"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  function recTimelineStep(num, label, text) {
    return '<div class="rec-timeline-step"><b class="num">' + esc(num) + '</b><span><strong>' + esc(label) + '</strong><small>' + esc(text) + '</small></span></div>';
  }

  function consoleHint(answered) {
    var messages = [
      { ru: 'Ответьте на четыре коротких вопроса — рекомендация появится после последнего выбора.', en: 'Answer four short questions — the recommendation appears after the final choice.' },
      { ru: 'Учтён 1 параметр из 4. Осталось ещё три коротких ответа.', en: '1 of 4 parameters noted. Three short answers remain.' },
      { ru: 'Учтены 2 параметра из 4. Рекомендация уже уточняется.', en: '2 of 4 parameters noted. The recommendation is becoming more specific.' },
      { ru: 'Последний шаг — выберите оставшийся параметр.', en: 'Final step — choose the remaining parameter.' }
    ];
    return L(messages[Math.max(0, Math.min(3, answered))]);
  }

  var CONSOLE_REC = {
    goal: {
      fat: {
        title: { ru: 'Сохраняйте мышцы и снижайте жир без изматывающих сессий', en: 'Keep your muscle while losing fat without punishing sessions' },
        summary: { ru: 'Главный результат создаёт управляемый дефицит, а силовая работа сохраняет мышечную массу. Кардио и шаги дополняют систему, но не заменяют питание и восстановление.', en: 'A controlled deficit drives the result while resistance training protects lean mass. Cardio and steps support the system, but never replace nutrition and recovery.' },
        focus: { ru: 'силовая база, шаги и сохранение рабочих весов', en: 'a strength base, daily steps and stable working loads' },
        main: { ru: 'Выполните два силовых паттерна для крупных мышечных групп, сохраняя обычные рабочие веса без попытки превратить занятие в кардио.', en: 'Perform two resistance patterns for large muscle groups, keeping normal working loads instead of turning the session into cardio.' },
        finish: { ru: 'Завершите спокойным кардио или ходьбой; интенсивные интервалы не нужны после тяжёлой силовой части.', en: 'Finish with easy cardio or walking; hard intervals are unnecessary after demanding strength work.' },
        why: { ru: 'При снижении жира тренировка должна прежде всего сохранять мышцы и работоспособность, а не компенсировать питание максимальным расходом.', en: 'For fat loss, training should primarily preserve muscle and performance rather than try to compensate for nutrition with maximum expenditure.' }
      },
      muscle: {
        title: { ru: 'Стройте мышечный рост вокруг прогрессии, а не разнообразия', en: 'Build muscle around progression, not endless variety' },
        summary: { ru: 'Рост обеспечивают повторяемые упражнения, достаточный недельный объём и постепенное увеличение нагрузки. План должен позволять сравнивать подходы от недели к неделе.', en: 'Repeatable exercises, enough weekly volume and progressive loading drive growth. Your plan needs to make sessions comparable from week to week.' },
        focus: { ru: 'целевой объём, техника и прогрессивная нагрузка', en: 'target volume, technique and progressive overload' },
        main: { ru: 'Поставьте в начало два приоритетных упражнения для крупных групп и фиксируйте повторы и нагрузку в каждом рабочем подходе.', en: 'Start with two priority movements for large muscle groups and record reps and load for every working set.' },
        finish: { ru: 'Добавьте один-два изолирующих акцента только после качественно выполненной основной работы.', en: 'Add one or two isolation movements only after the main work is completed well.' },
        why: { ru: 'Для набора мышц важнее накопить качественный объём и иметь возможность прогрессировать, чем постоянно менять движения ради ощущения новизны.', en: 'For muscle gain, quality volume and room to progress matter more than constantly changing movements for novelty.' }
      },
      strength: {
        title: { ru: 'Сделайте одно основное движение центром сегодняшней тренировки', en: 'Make one main lift the centre of today’s session' },
        summary: { ru: 'Сила растёт от качественного повторения основных движений, достаточного отдыха и управляемой интенсивности. Рекорды на каждой тренировке только мешают устойчивой прогрессии.', en: 'Strength grows through high-quality practice of the main lifts, adequate rest and controlled intensity. Chasing records every session gets in the way of sustainable progress.' },
        focus: { ru: 'основное движение, длинный отдых и точная техника', en: 'one main lift, longer rests and exact technique' },
        main: { ru: 'Выберите одно приоритетное движение, проведите полноценную разминку и выполните рабочие подходы в диапазоне 3–6 повторений без технического отказа.', en: 'Choose one priority lift, warm up properly and complete working sets in the 3–6 rep range without technical failure.' },
        finish: { ru: 'После главного движения добавьте два поддерживающих упражнения без лишнего отказного объёма.', en: 'After the main lift, add two supporting movements without unnecessary failure work.' },
        why: { ru: 'Для силы качество тяжёлых повторений и восстановление между ними важнее плотности тренировки и количества дополнительных упражнений.', en: 'For strength, the quality of heavy reps and recovery between them matter more than session density or accessory count.' }
      },
      health: {
        title: { ru: 'Закрепите регулярную тренировку всего тела без гонки за весами', en: 'Build a regular full-body habit without chasing weights' },
        summary: { ru: 'Для здоровья и тонуса важны основные двигательные паттерны, умеренная нагрузка, ежедневная активность и план, который реально повторять каждую неделю.', en: 'Health and tone come from covering the main movement patterns, using moderate loads, staying active daily and following a plan you can genuinely repeat each week.' },
        focus: { ru: 'full body, мобильность и стабильная недельная частота', en: 'full body work, mobility and a stable weekly rhythm' },
        main: { ru: 'Соберите занятие из приседа или его варианта, тяги, жима, движения на спину и упражнения для корпуса.', en: 'Build the session around a squat variation, a hinge, a press, a pull and one trunk exercise.' },
        finish: { ru: 'Закончите спокойной ходьбой и короткой мобильностью без попытки добрать усталость любой ценой.', en: 'Finish with easy walking and brief mobility rather than trying to accumulate fatigue for its own sake.' },
        why: { ru: 'При цели «здоровье и тонус» регулярность, качество движений и умеренная общая активность дают больше, чем редкие предельно тяжёлые занятия.', en: 'For health and tone, consistency, movement quality and moderate overall activity beat occasional maximal sessions.' }
      }
    },
    place: {
      gym: {
        label: { ru: 'зал', en: 'gym' },
        summary: { ru: 'В зале используйте устойчивые упражнения, тренажёры и свободные веса, которые позволяют точно дозировать прогрессию.', en: 'In the gym, use stable machine and free-weight movements that let you dose progression precisely.' },
        main: { ru: 'Используйте доступ к тренажёрам и свободным весам, но оставьте только те движения, в которых техника остаётся стабильной.', en: 'Use the available machines and free weights, but keep only movements you can execute consistently.' },
        why: { ru: 'Доступ к залу позволяет точнее дозировать нагрузку и выбирать устойчивые варианты упражнений.', en: 'Gym access lets you dose loading more precisely and select stable exercise variations.' }
      },
      home: {
        label: { ru: 'дома', en: 'at home' },
        summary: { ru: 'Домашний план должен работать даже без тренажёров: собственный вес, резинки и гантели — только если они действительно есть.', en: 'A home plan should work without machines: body weight, bands and dumbbells only when you actually have them.' },
        main: { ru: 'Управляйте сложностью через амплитуду, медленное опускание, паузы и односторонние варианты, а не через выдуманное оборудование.', en: 'Scale difficulty through range, slower lowering, pauses and unilateral variations rather than assuming equipment you do not have.' },
        why: { ru: 'Домашние условия требуют небольшого числа движений и способов прогрессировать без обязательного доступа к тренажёрам.', en: 'Home conditions call for fewer movements and progression methods that do not depend on gym machines.' }
      },
      mixed: {
        label: { ru: 'зал или дом', en: 'gym or home' },
        summary: { ru: 'Соберите взаимозаменяемые варианты A и B: одинаковые двигательные паттерны для зала и дома не позволят графику разрушить неделю.', en: 'Build interchangeable A and B options: matching movement patterns for gym and home keep a changing schedule from breaking the week.' },
        main: { ru: 'Для каждого движения держите две версии: более нагружаемую в зале и доступную домашнюю альтернативу на ту же мышечную группу.', en: 'Keep two versions of every movement: a loadable gym option and an accessible home alternative for the same target.' },
        why: { ru: 'Переменные условия лучше компенсировать вариантами одного плана, а не двумя несвязанными программами.', en: 'Changing settings are best handled with variants of one plan rather than two unrelated programmes.' }
      }
    },
    level: {
      beginner: {
        format: { ru: 'Full body с небольшим числом движений', en: 'Full body with a small exercise menu' },
        intensity: { ru: 'Около 3 повторений в запасе', en: 'About 3 reps in reserve' },
        summary: { ru: 'На старте ограничьте занятие понятными движениями, 2–3 рабочими подходами и одинаковой техникой от первого повторения до последнего.', en: 'At the start, use clear movements, 2–3 working sets and the same technique from the first rep to the last.' },
        why: { ru: 'Начальный уровень требует сначала закрепить технику и режим, а уже затем увеличивать объём и сложность.', en: 'At beginner level, technique and routine come before extra volume or complexity.' }
      },
      medium: {
        format: { ru: 'Full body или upper/lower', en: 'Full body or upper/lower' },
        intensity: { ru: 'Обычно 2 повторения в запасе', en: 'Usually 2 reps in reserve' },
        summary: { ru: 'Регулярный опыт позволяет точнее распределить недельный объём и планово увеличивать повторения или вес без резких скачков нагрузки.', en: 'Regular experience lets you distribute weekly volume more precisely and progress reps or load without sudden jumps.' },
        why: { ru: 'Вы уже тренируетесь регулярно, поэтому рекомендация строится вокруг измеримой прогрессии, а не только обучения базовым движениям.', en: 'Because you already train regularly, the recommendation centres on measurable progression rather than simply learning basic patterns.' }
      },
      advanced: {
        format: { ru: 'Специализация с контролем усталости', en: 'Specialisation with fatigue control' },
        intensity: { ru: '1–3 повторения в запасе по задаче', en: '1–3 reps in reserve by exercise' },
        summary: { ru: 'При опыте больше двух лет результат чаще ограничивает не нехватка упражнений, а качество специализации, дозировка объёма и управление усталостью.', en: 'After two years, progress is more often limited by poor specialisation, volume dosing and fatigue management than by a lack of exercises.' },
        why: { ru: 'Ваш опыт позволяет использовать специализацию, но требует внимательнее отслеживать накопленную усталость и слабые места.', en: 'Your experience supports specialisation, but makes accumulated fatigue and weak links more important to monitor.' }
      }
    },
    time: {
      '30': {
        label: { ru: '30 минут', en: '30 minutes' },
        exercises: { ru: '4–5 движений', en: '4–5 movements' },
        today: [
          { ru: '4–5 минут: суставная разминка и два разминочных подхода первого движения.', en: '4–5 minutes: joint preparation and two warm-up sets for the first movement.' },
          { ru: '20–22 минуты: основная работа без лишних переходов; допустим один безопасный суперсет.', en: '20–22 minutes: the main work with minimal transitions; one safe superset is fine.' },
          { ru: '3–5 минут: спокойное завершение и фиксация выполненных весов или повторений.', en: '3–5 minutes: easy finish and a record of loads or reps completed.' }
        ],
        why: { ru: 'Тридцать минут требуют убрать всё второстепенное и оставить движения с максимальной практической отдачей.', en: 'Thirty minutes means removing the secondary work and keeping the movements with the highest practical return.' }
      },
      '50': {
        label: { ru: '50 минут', en: '50 minutes' },
        exercises: { ru: '5–7 движений', en: '5–7 movements' },
        today: [
          { ru: '6–8 минут: общая разминка и постепенный выход на первый рабочий вес.', en: '6–8 minutes: general preparation and a gradual build to the first working load.' },
          { ru: '35–38 минут: полноценная силовая часть и один-два дополнительных акцента.', en: '35–38 minutes: a complete resistance block and one or two accessory priorities.' },
          { ru: '4–6 минут: спокойное завершение, короткая мобильность и запись результата.', en: '4–6 minutes: easy finish, brief mobility and a record of the result.' }
        ],
        why: { ru: 'Пятьдесят минут дают достаточно времени для полноценной работы без необходимости растягивать занятие дополнительными упражнениями.', en: 'Fifty minutes is enough for a complete session without padding it with extra exercises.' }
      },
      '70': {
        label: { ru: '70 минут', en: '70 minutes' },
        exercises: { ru: '6–8 движений', en: '6–8 movements' },
        today: [
          { ru: '8–10 минут: общая и специфическая разминка с постепенным повышением нагрузки.', en: '8–10 minutes: general and specific preparation with a gradual load build.' },
          { ru: '50–55 минут: основные подходы с полноценным отдыхом и целевая дополнительная работа.', en: '50–55 minutes: main work with full rests plus targeted accessory work.' },
          { ru: '5–10 минут: завершение, мобильность и фиксация показателей тренировки.', en: '5–10 minutes: finish, mobility and a record of the session metrics.' }
        ],
        why: { ru: 'Семьдесят минут позволяют не торопить основные подходы и добавить целевую работу, но не требуют заполнять всё время усталостью.', en: 'Seventy minutes lets you avoid rushing the main sets and add targeted work, without filling every minute with fatigue.' }
      }
    }
  };

  function buildConsoleRecommendation(cfg) {
    var goal = CONSOLE_REC.goal[cfg.goal];
    var place = CONSOLE_REC.place[cfg.place];
    var level = CONSOLE_REC.level[cfg.level];
    var time = CONSOLE_REC.time[String(cfg.time)];
    var frequencyMap = {
      fat: { beginner: '2–3', medium: '3–4', advanced: '3–4' },
      muscle: { beginner: '2–3', medium: '3–4', advanced: '4–5' },
      strength: { beginner: '2–3', medium: '3–4', advanced: '3–5' },
      health: { beginner: '2–3', medium: '2–3', advanced: '3–4' }
    };
    var frequency = frequencyMap[cfg.goal][cfg.level] + L({ ru: ' раза в неделю', en: ' sessions per week' });
    var title = L(goal.title) + ' — ' + L(place.label) + ', ' + L(time.label);
    var summary = [L(goal.summary), L(place.summary), L(level.summary)].join(' ');
    var today = [
      L(time.today[0]),
      L(goal.main) + ' ' + L(place.main),
      L(time.today[1]),
      L(goal.finish),
      L(time.today[2])
    ];
    var why = [L(goal.why), L(place.why), L(level.why), L(time.why)].join(' ');
    return {
      title: title,
      summary: summary,
      format: L(level.format) + ' · ' + L(time.exercises),
      frequency: frequency,
      timeLabel: L(time.label),
      intensity: L(level.intensity),
      focus: L(goal.focus),
      today: today,
      why: why,
      labels: {
        goal: L(consoleLabel('goal', cfg.goal)),
        place: L(consoleLabel('place', cfg.place)),
        level: L(consoleLabel('level', cfg.level)),
        time: L(time.label)
      }
    };
  }

  function consoleRecommendationText(rec, forTelegram) {
    var intro = S.lang === 'en'
      ? 'Hello, Pavel. I completed the MARKOV MADE GYM starting assessment.'
      : 'Здравствуйте, Павел. Прошёл стартовый подбор MARKOV MADE GYM.';
    var lines = [
      intro,
      '',
      (S.lang === 'en' ? 'Goal: ' : 'Цель: ') + rec.labels.goal,
      (S.lang === 'en' ? 'Training setting: ' : 'Место тренировок: ') + rec.labels.place,
      (S.lang === 'en' ? 'Experience: ' : 'Опыт: ') + rec.labels.level,
      (S.lang === 'en' ? 'Time: ' : 'Время: ') + rec.labels.time,
      '',
      (S.lang === 'en' ? 'Starting recommendation: ' : 'Предварительная рекомендация: ') + rec.title + '.',
      (S.lang === 'en' ? 'Format: ' : 'Формат: ') + rec.format + '.',
      (S.lang === 'en' ? 'Frequency: ' : 'Частота: ') + rec.frequency + '.',
      (S.lang === 'en' ? 'Main focus: ' : 'Главный приоритет: ') + rec.focus + '.'
    ];
    if (forTelegram) {
      lines.push('', S.lang === 'en'
        ? 'I would like a full plan that accounts for my schedule, health and limitations.'
        : 'Хочу получить полный план с учётом моего графика, здоровья и ограничений.');
    } else {
      lines.push('', (S.lang === 'en' ? 'Why: ' : 'Почему: ') + rec.why);
      lines.push('', (S.lang === 'en' ? 'Today:' : 'Что делать сегодня:'));
      rec.today.forEach(function (item, index) { lines.push((index + 1) + '. ' + item); });
    }
    return lines.join('\n');
  }

  function syncProfileFromConsole() {
    if (!S.profile) return;
    var recommendedDays = {
      fat: { beginner: '2', medium: '3', advanced: '3' },
      muscle: { beginner: '2', medium: '3', advanced: '4' },
      strength: { beginner: '2', medium: '3', advanced: '3' },
      health: { beginner: '2', medium: '3', advanced: '3' }
    };
    var nextDays = S.profile.days || recommendedDays[S.console.goal][S.console.level];
    var changed = S.profile.goal !== S.console.goal ||
      S.profile.place !== S.console.place ||
      S.profile.level !== S.console.level ||
      S.profile.days !== nextDays ||
      !S.profile.done || S.profile.skipped;
    if (!changed) return;
    S.profile.goal = S.console.goal;
    S.profile.place = S.console.place;
    S.profile.level = S.console.level;
    S.profile.days = nextDays;
    if(S.console.time) S.profile.typicalSessionMinutes=String(S.console.time);
    S.profile.done = true;
    S.profile.skipped = false;
    saveProfile();
    renderSystem();
  }

  var CONSOLE_LABELS = {
    goal: { fat: { ru: 'снижение жира', en: 'fat loss' }, muscle: { ru: 'набор мышц', en: 'muscle gain' },
            strength: { ru: 'рост силы', en: 'strength' }, health: { ru: 'здоровье и тонус', en: 'health and tone' } },
    place: { gym: { ru: 'зал', en: 'gym' }, home: { ru: 'дом', en: 'home' }, mixed: { ru: 'по-разному', en: 'mixed' } },
    level: { beginner: { ru: 'начинающий', en: 'beginner' }, medium: { ru: 'регулярные тренировки', en: 'training regularly' },
             advanced: { ru: 'больше двух лет', en: 'over two years' } }
  };
  function consoleLabel(kind, value) {
    return (CONSOLE_LABELS[kind] && CONSOLE_LABELS[kind][value]) || { ru: value, en: value };
  }

  /* Ближайшее рекомендуемое действие по выбранным параметрам. */
  function nextStepFor(cfg) {
    if (cfg.goal === 'fat') return { act: 'kbju', label: t('actKbju') };
    if (cfg.goal === 'muscle' || cfg.goal === 'strength') return { act: 'plan', label: t('actPlan') };
    return { act: 'plan', label: t('actPlan') };
  }

  function applyConsoleAction(act) {
    track('coach_console_action', { act: act, cfg: S.console });
    if (act === 'ask') { openSheet(); return; }
    if (act === 'library') {
      resetFilters(false);
      if (S.console.place === 'home') S.equipment = ['body weight', 'band', 'dumbbell'];
      renderFilters(); renderResults(); scrollToLibrary();
      return;
    }
    if (act === 'kbju') {
      if (S.console.goal === 'fat') $('k-goal').value = 'cut';
      else if (S.console.goal === 'muscle') $('k-goal').value = 'lean';
      scrollToId('nutrition');
      return;
    }
    if (act === 'plan') {
      prefillPlan();
      scrollToId('program');
    }
  }

  function prefillPlan() {
    var map = { fat: 'fatloss', muscle: 'muscle', strength: 'strength', health: 'health' };
    var goal = S.console.goal || S.profile.goal;
    var level = S.console.level || S.profile.level;
    var place = S.console.place || S.profile.place;
    if (goal && map[goal]) $('p-goal').value = map[goal];
    if (level) $('p-level').value = level === 'medium' ? 'middle' : level;
    if (place) $('p-place').value = place;
    if (S.console.time) $('p-time').value=String(S.console.time);
    else if(S.profile.typicalSessionMinutes) $('p-time').value=String(S.profile.typicalSessionMinutes);
    if(S.profile.days) $('p-days').value=S.profile.days;
    if(S.profile.focus&&$('p-focus')) $('p-focus').value=S.profile.focus;
    if(S.profile.recoveryBaseline&&$('p-recovery')) $('p-recovery').value=S.profile.recoveryBaseline;
    if(Array.isArray(S.profile.limitations)){S.planLimits=S.profile.limitations.slice();qsa('#p-limits [data-limit]').forEach(function(b){b.setAttribute('aria-pressed',String(S.planLimits.indexOf(b.dataset.limit)!==-1));});}
  }

  function scrollToId(id) {
    var el = $(id);
    if (!el) return;
    el.scrollIntoView({ behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- 15.10 ОНБОРДИНГ И DASHBOARD -------------------------------- */
  function profileComplete() {
    return !!(S.profile.goal && S.profile.level && S.profile.place && S.profile.days);
  }

  function renderSystem() {
    if (!C) return;
    var section = $('system'), dash = $('dash');
    var show = profileComplete() || S.profile.done;
    section.hidden = !show;
    dash.hidden = !show;
    if (show) renderDash();
  }

  function dashGoalLabel() {
    if (!S.profile.goal) return t('dashNoGoal');
    return L(consoleLabel('goal', S.profile.goal));
  }

  function renderDash() {
    var lastDiary = S.diary.length ? S.diary[0] : null;
    var tiles = [];

    tiles.push({ l: t('dashGoal'), v: dashGoalLabel(),
      s: S.profile.days ? t('dashDays', { n: S.profile.days }) : t('dashNotSet') });

    tiles.push({ l: t('dashFav'), v: String(S.favorites.length),
      s: S.favorites.length ? t('dashFavS') : t('dashFavEmpty') });

    var dashTotalSets = S.workout.reduce(function(sum,w){ return sum + (Number(w.sets)||0); },0);
    var dashDoneSets = S.workout.reduce(function(sum,w){ return sum + completedSetCount(w); },0);
    tiles.push({ l: t('dashWorkout'), v: String(S.workout.length),
      s: S.workout.length ? t('dashWorkoutSets', { done: dashDoneSets, total: dashTotalSets })
                          : t('dashWorkoutEmpty') });

    tiles.push({ l: t('dashKbju'), v: S.kbjuLast ? String(S.kbjuLast.target) : '—',
      s: S.kbjuLast ? t('kcal') : t('dashNotCounted') });

    tiles.push({ l: t('dashPlan'), v: S.plan ? String(S.plan.days.length) : '—',
      s: S.plan ? t('dashPlanS') : t('dashNoPlan') });

    tiles.push({ l: t('dashDiary'), v: lastDiary && lastDiary.weight ? String(lastDiary.weight) : '—',
      s: lastDiary ? t('dashDiaryS', { d: lastDiary.date }) : t('dashNoDiary') });

    $('dash-tiles').innerHTML = tiles.map(function (x) {
      return '<div class="dtile"><span class="dtile-l">' + esc(x.l) + '</span>' +
        '<b class="dtile-v">' + esc(x.v) + '</b>' +
        '<span class="dtile-s">' + esc(x.s) + '</span></div>';
    }).join('');

    var next = dashNext();
    $('dash-next').innerHTML = '<p>' + esc(next.text) + '<br><span class="tiny">' + esc(next.why) + '</span></p>' +
      '<button class="btn btn-primary btn-sm" type="button" data-cact="' + esc(next.act) + '"' + (next.day!=null?' data-cact-day="'+esc(next.day)+'"':'') + '>' + esc(next.label) + '</button>';

    var st = dashSignal();
    var sig = $('dash-signal');
    sig.setAttribute('data-state', st.state);
    sig.textContent = st.label;

    var advice = S.profile.goal ? C.console[S.profile.goal] : null;
    $('dash-note').innerHTML = advice ? coachNote(advice, { compact: true }) : '';
  }

  /* Следующее действие: контекст важнее линейного чек-листа. */
  function dashNext() {
    var next=v7NextAction();
    var actions={resume:'resumeRun',run:'startRun',workout:'workout',planDay:'planDay',profile:'profile',checkin:'checkin',nutrition:'nutritionLog',program:'plan',progress:'progress',library:'library'};
    var labels={resume:'continuityResume',run:'continuityStart',workout:'actWorkout',checkin:'actProgress',nutrition:'actNutritionLog',program:'actPlan',progress:'actProgress',library:'consoleLibrary'};
    return {
      text:next.title,
      why:next.why,
      act:actions[next.type]||'library',
      label:labels[next.type]?t(labels[next.type]):next.title,
      day:next.day,
      decision:next.decision
    };
  }

  /* Сигнал состояния: только по фактически введённым данным. */
  function dashSignal() {
    if (S.diary.length < 3) return { state: 'none', label: t('sigNone') };
    var recent = S.diary.slice(0, 14).filter(function (d) { return typeof d.weight === 'number'; });
    if (recent.length < 3) return { state: 'none', label: t('sigNone') };
    var half = Math.ceil(recent.length / 2);
    var avg = function (arr) { return arr.reduce(function (s, d) { return s + d.weight; }, 0) / arr.length; };
    var newAvg = avg(recent.slice(0, half));
    var oldAvg = avg(recent.slice(half));
    var pct = ((newAvg - oldAvg) / oldAvg) * 100;
    var goal = S.profile.goal;
    if (goal === 'fat') {
      if (pct <= -0.3 && pct >= -1.4) return { state: 'ok', label: t('sigOk') };
      if (pct > -0.3) return { state: 'watch', label: t('sigWatch') };
      return { state: 'change', label: t('sigChange') };
    }
    if (goal === 'muscle' || goal === 'strength') {
      if (pct >= 0.05 && pct <= 0.7) return { state: 'ok', label: t('sigOk') };
      if (pct < 0.05) return { state: 'watch', label: t('sigWatch') };
      return { state: 'change', label: t('sigChange') };
    }
    if (Math.abs(pct) <= 0.5) return { state: 'ok', label: t('sigOk') };
    return { state: 'watch', label: t('sigWatch') };
  }

  /* ---------- 15.11 СИСТЕМА MARKOV MADE ---------------------------------- */
  var methodIndex = 0;

  function renderMethod() {
    var nav = $('method-nav'), panel = $('method-panel');
    if (!nav || !C) return;
    nav.innerHTML = C.method.map(function (m, i) {
      return '<button class="method-tab" type="button" role="tab" id="mtab-' + esc(m.id) + '"' +
        ' aria-selected="' + (i === methodIndex) + '" aria-controls="method-panel" tabindex="' + (i === methodIndex ? '0' : '-1') + '">' +
        '<span class="method-num">' + esc(m.num) + '</span>' +
        '<span><span class="method-tab-t">' + esc(L(m.t)) + '</span>' +
        '<span class="method-tab-s">' + esc(L(m.s)) + '</span></span></button>';
    }).join('');

    var m = C.method[methodIndex];
    panel.setAttribute('aria-labelledby', 'mtab-' + m.id);
    panel.innerHTML = '<p class="eyebrow">' + esc(m.num) + ' — ' + esc(L(m.s)) + '</p>' +
      '<h3>' + esc(L(m.t)) + '</h3>' +
      '<p>' + esc(L(m.d)) + '</p>' +
      '<ul class="method-b">' + L(m.b).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  function bindMethod() {
    var nav = $('method-nav');
    if (!nav) return;
    nav.addEventListener('click', function (e) {
      var tab = e.target.closest('[role="tab"]');
      if (!tab) return;
      methodIndex = qsa('[role="tab"]', nav).indexOf(tab);
      renderMethod();
      track('method_step_opened', { step: C.method[methodIndex].id });
    });
    nav.addEventListener('keydown', function (e) {
      var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!keys[e.key]) return;
      e.preventDefault();
      methodIndex = (methodIndex + keys[e.key] + C.method.length) % C.method.length;
      renderMethod();
      var tabs = qsa('[role="tab"]', nav);
      if (tabs[methodIndex]) tabs[methodIndex].focus();
    });
  }

  /* ---------- 15.12 КАРТОЧКА УПРАЖНЕНИЯ: РАЗБОР -------------------------- */
  function renderExerciseCoach(ex) {
    var host = $('modal-coach');
    if (!host || !C) return;
    var curated = exCurated(ex);
    var note;
    if (curated) {
      note = { t: null, d: curated, a: null, w: null };
    } else {
      var z = C.coach.zone[ex.zone];
      var eq = C.coach.equip[ex.equip];
      note = z || eq || null;
    }
    host.innerHTML = note ? coachNote(note, { compact: true, kicker: t('coachOnExercise') }) : '';
  }

  function renderExerciseDose(ex) {
    var host = $('modal-dose');
    if (!host || !C) return;
    var kind = exKind(ex);
    var dose = C.card.dose[kind];
    var scale = exScale(ex);
    var levelLabel = detailLevelLabel(ex);
    var kindLabel = detailKindLabel(ex);

    host.innerHTML =
      '<div class="modal-dose-metrics">' +
        detailMetric(detailText('Тип', 'Type'), kindLabel) +
        detailMetric(detailText('Уровень', 'Level'), levelLabel) +
        detailMetric(t('repsLabel'), L(dose.reps)) +
        detailMetric(t('restLabel'), L(dose.rest)) +
        detailMetric(t('rirLabel'), L(dose.rir)) +
      '</div>' +
      '<div class="modal-progression-grid">' +
        '<article><span>' + esc(t('easierLabel')) + '</span><p>' + esc(L(scale.easy)) + '</p></article>' +
        '<article><span>' + esc(t('harderLabel')) + '</span><p>' + esc(L(scale.hard)) + '</p></article>' +
      '</div>';
  }

  /* ---------- 15.13 УМНАЯ ЗАМЕНА ----------------------------------------- */
  function renderSwapReasons() {
    var host = $('swap-reasons');
    if (!host || !C) return;
    host.innerHTML = C.swapReasons.map(function (r) {
      return '<button class="pill" type="button" data-swap="' + esc(r.id) + '"' +
        ' aria-pressed="' + (S.swapReason === r.id) + '">' + esc(L(r.l)) + '</button>';
    }).join('');
  }

  function swapCandidates(ex, reason) {
    if (!substitutionRanker) return [];
    var profile = databaseEquipmentProfiles.filter(function(item){return item.id===activeEquipmentProfileId;})[0];
    var availableEquipment = profile ? profile.equipment : equipmentFor(S.profile && S.profile.place ? S.profile.place : 'gym');
    var relatedCandidates = EX.filter(function(cand){
      return cand.target===ex.target || (cand.group===ex.group&&cand.zone===ex.zone) ||
        (Array.isArray(ex.secondary)&&ex.secondary.indexOf(cand.target)!==-1) ||
        (Array.isArray(cand.secondary)&&cand.secondary.some(function(mu){return mu===ex.target||ex.secondary.indexOf(mu)!==-1;}));
    });
    var roleById=Object.create(null),levelById=Object.create(null);
    relatedCandidates.forEach(function(cand){roleById[cand.id]=exKind(cand);levelById[cand.id]=exLevel(cand);});
    var experience=S.profile&&S.profile.level==='middle'?'medium':(S.profile&&S.profile.level)||'';
    var planSlot=null;
    if(S.plan&&Array.isArray(S.plan.days)){
      S.plan.days.some(function(day,dayIndex){
        var items=Array.isArray(day.items)?day.items:[];
        var itemIndex=items.findIndex(function(item){return item&&(item.id===ex.id||(item.ex&&item.ex.id===ex.id));});
        if(itemIndex<0)return false;
        planSlot={dayIndex:dayIndex,index:itemIndex,role:ex.exerciseRole||exKind(ex)};
        return true;
      });
    }
    return substitutionRanker({
      exercise:ex,candidates:relatedCandidates,reason:reason,availableEquipment:availableEquipment,
      preferenceById:S.exercisePreferences,favouriteIds:S.favorites,location:S.profile&&S.profile.place,
      experience:experience,roleById:roleById,levelById:levelById,programSlot:planSlot,
      homeEquipment:HOME_EQUIP,guidedEquipment:GUIDED,freeWeightEquipment:FREE_WEIGHT,limit:6
    }).map(function(result){return Object.assign({},result.exercise,{substitutionReasons:result.reasons});});
  }

  function swapWhy(ex, cand, reason) {
    var en = S.lang === 'en';
    var labels = {
      same_primary:en?'same primary muscle':'та же основная мышца',
      same_group:en?'same muscle group':'та же группа мышц',
      supporting_muscle:en?'overlapping supporting muscles':'совпадают вспомогательные мышцы',
      same_movement:en?'same movement pattern':'тот же паттерн движения',
      same_role:en?'same exercise role':'та же роль упражнения',
      same_laterality:en?'same side pattern':'та же схема сторон',
      same_stability:en?'same support and stability demand':'та же потребность в опоре и стабильности',
      preferred:en?'marked as preferred':'вы отметили упражнение как предпочтительное',
      less_often:en?'you asked to see it less often':'приоритет снижен по вашему выбору «реже»',
      favourite:en?'saved as a favourite':'упражнение в избранном',
      location_match:en?'fits your training location':'подходит для места тренировок',
      experience_match:en?'fits your experience level':'соответствует вашему уровню',
      program_slot:en?'matches the programme slot role':'сохраняет роль упражнения в программе'
    };
    var parts=(cand.substitutionReasons||[]).map(function(key){return labels[key];}).filter(Boolean);
    var profile=databaseEquipmentProfiles.filter(function(item){return item.id===activeEquipmentProfileId;})[0];
    if(profile){parts.push(en?'available in “'+profile.nameEn+'”':'доступно в профиле «'+profile.nameRu+'»');}
    else{parts.push((en?'available: ':'доступно: ')+labelEq(cand.equip));}
    if(reason==='hard')parts.push(en?'beginner-friendly level':'подходит для начального уровня');
    if(reason==='easy')parts.push(en?'higher difficulty option':'вариант повышенной сложности');
    return parts.join(' · ');
  }

  function renderSwapList() {
    var host = $('swap-list'), hint = $('swap-hint');
    if (!host || !C) return;
    var ex = BY_ID[S.activeId];
    if (!ex || !S.swapReason) { host.innerHTML = ''; return; }

    var reason = C.swapReasons.filter(function (r) { return r.id === S.swapReason; })[0];
    if (reason && hint) hint.textContent = L(reason.h) + ' ' + t('swapNotIdentical');

    var list = swapCandidates(ex, S.swapReason);
    if (!list.length) { host.innerHTML = '<p class="tiny">' + esc(t('swapNone')) + '</p>'; return; }

    host.innerHTML = list.map(function (cand) {
      return '<div class="swap-item">' +
        '<img class="swap-thumb" src="' + esc(exStill(cand)) + '" data-still="' + esc(exStill(cand)) + '" data-ex-media alt="" loading="lazy" decoding="async" width="52" height="52">' +
        '<span><b class="swap-name">' + esc(exName(cand)) + '</b>' +
        '<span class="swap-why">' + esc(swapWhy(ex, cand, S.swapReason)) + '</span></span>' +
        '<button class="btn btn-quiet btn-sm" type="button" data-open="' + esc(cand.id) + '">' + esc(t('openShort')) + '</button>' +
        '</div>';
    }).join('');
    track('substitution_open', { from: ex.id, reason: S.swapReason, n: list.length });
  }

  /* ==========================================================================
     16. ИНСТРУМЕНТЫ: тренировка, питание, план, прогресс, знания, заявка
     ====================================================================== */

  /* ---------- 16.1 ТРЕНИРОВКА: МЕТА, ТАЙМЕР, ВЫПОЛНЕНИЕ ------------------ */
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function syncWorkoutMeta() {
    if (!S.meta.date) S.meta.date = todayISO();
    $('w-name').value = S.meta.name;
    $('w-date').value = S.meta.date;
    $('w-note').value = S.meta.note;
  }

  var restTimer = { id: 0, left: 0, running: false };

  function fmtClock(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function renderTimer() {
    $('timer-clock').textContent = fmtClock(restTimer.left);
    $('timer').setAttribute('data-run', String(restTimer.running));
    var timerBase = Math.max(1, S.rest || 1);
    var timerPct = restTimer.running ? Math.max(0, Math.min(100, (restTimer.left / timerBase) * 100)) : (restTimer.left > 0 ? 100 : 0);
    $('timer').style.setProperty('--timer-progress', timerPct + '%');
    $('timer-toggle').textContent = restTimer.running ? t('timerStop') : t('timerStart');
    qsa('#timer [data-rest]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.rest) === S.rest));
    });
  }

  function stopTimer() {
    clearInterval(restTimer.id);
    restTimer.id = 0;
    restTimer.running = false;
    renderTimer();
  }

  function startTimer(seconds) {
    stopTimer();
    restTimer.left = seconds || S.rest;
    restTimer.running = true;
    $('timer').classList.remove('is-done');
    renderTimer();
    restTimer.id = setInterval(function () {
      restTimer.left--;
      if (restTimer.left <= 0) {
        restTimer.left = 0;
        stopTimer();
        $('timer').classList.add('is-done');
        showToast(t('timerDone'));
        return;
      }
      renderTimer();
      if (runOpen()) $('run-rest').textContent = t('run.restLeft', { v: fmtClock(restTimer.left) });
    }, 1000);
    track('rest_timer_started', { sec: restTimer.left });
  }

  /* Режим выполнения 3.0: один подход, минимум действий, сохранение сессии. */
  var runState = { ex: 0, set: 1, startedAt: 0, saved: false, lastPRs: [], personalRecords: [] };
  var detectSetPersonalRecords = null, detectVolumePersonalRecords = null;

  function runOpen() { return $('run').getAttribute('data-open') === 'true'; }

  function runTotalSets() {
    return S.workout.reduce(function (sum, w) { return sum + (Number(w.sets) || 0); }, 0);
  }

  function runDoneSets() {
    return S.workout.reduce(function(sum,item){return sum+completedSetCount(item);},0);
  }

  function runElapsedSeconds() {
    return runState.startedAt ? Math.max(0, Math.round((Date.now() - runState.startedAt) / 1000)) : 0;
  }

  function saveRunSession() {
    if (!runState.startedAt || runState.saved) { store.remove(K.runSession); S.runSession = null; return; }
    S.runSession = { ex: runState.ex, set: runState.set, startedAt: runState.startedAt };
    store.set(K.runSession, JSON.stringify(S.runSession));
  }

  var progressionEngine = null;
  import('./tools/progression.mjs').then(function (module) {
    progressionEngine = module;
    if (document.documentElement.dataset.appReady === 'true') {
      renderWorkout();
      if ($('run') && $('run').getAttribute('data-open') === 'true') renderRun();
    }
  }).catch(function (error) {
    progressionEngine = null;
  });

  function progressionForItem(item) {
    if (!progressionEngine || !item) return null;
    var previous = previousPerformance(item.id);
    if (!previous || !Array.isArray(previous.setLog)) return null;
    var exercise=BY_ID[item.id],trackingType=progressionTrackingType(exercise);
    return progressionEngine.recommendProgression({
      previousSets: previous.setLog,
      targetRepRange: item.reps,
      increment: progressionIncrementForExercise(exercise),
      trackingType: trackingType,
      unit: 'kg'
    });
  }

  function progressionCopy(rec) {
    if (!rec || rec.status !== 'recommendation') return null;
    var range = rec.targetReps && rec.targetReps.length ? rec.targetReps[0] + '–' + rec.targetReps[1] : '';
    var loadLabel=rec.nextLoad+' '+(rec.unit||'kg');
    var ru = S.lang !== 'en';
    if (rec.reason === 'all-sets-at-top-of-range') return {
      title: ru ? 'Следующая нагрузка' : 'Next load',
      value: loadLabel,
      why: ru ? 'Все завершённые рабочие подходы достигли верхней границы ' + range + '. Вес повышен на минимальный шаг правила.' : 'Every completed working set reached the top of ' + range + '. Load increases by the rule increment.'
    };
    if (rec.reason === 'top-range-but-maximal-effort') return {
      title: ru ? 'Сохранить вес' : 'Hold load',
      value: loadLabel,
      why: ru ? 'Повторы достигнуты, но в записи есть предельный RPE/RIR. Сначала закрепи результат без максимального усилия.' : 'The rep target was reached, but logged RPE/RIR indicates maximal effort. Consolidate before increasing.'
    };
    if (rec.reason === 'build-reps-within-range') return {
      title: ru ? 'Сохранить вес' : 'Hold load',
      value: loadLabel,
      why: ru ? 'Все подходы уже внутри диапазона ' + range + ', но верхняя граница ещё не достигнута во всех сетах.' : 'All sets are inside ' + range + ', but not every set has reached the top yet.'
    };
    return {
      title: ru ? 'Сохранить вес' : 'Hold load',
      value: loadLabel,
      why: ru ? 'Нижняя граница ' + range + ' ещё не закреплена во всех завершённых сетах.' : 'The lower edge of ' + range + ' is not yet secured across all completed sets.'
    };
  }

  function previousPerformance(id) {
    for (var i = 0; i < S.history.length; i++) {
      var hit = (S.history[i].items || []).filter(function (x) { return x.id === id; })[0];
      if (hit) return hit;
    }
    return null;
  }
  function setPerformanceSummary(row){
    if(!row)return'';
    var parts=[];
    if(row.weight)parts.push(String(row.weight)+(row.reps?' × '+row.reps:''));
    else if(row.reps)parts.push(String(row.reps));
    if(row.distance)parts.push(String(row.distance)+' km');
    if(row.duration)parts.push(String(row.duration));
    return parts.join(' · ');
  }
  function previousSetPerformance(id,setIndex){
    var prev=previousPerformance(id); if(!prev) return null;
    if(Array.isArray(prev.setLog)){
      var exact=prev.setLog[setIndex]; if(exact&&exact.completed) return exact;
      for(var i=prev.setLog.length-1;i>=0;i--) if(prev.setLog[i]&&prev.setLog[i].completed) return prev.setLog[i];
    }
    return {reps:prev.reps||'',weight:prev.weight||'',distance:prev.distance||'',duration:prev.duration||'',completed:!!prev.done};
  }
  function runExecutionOrder(){
    var order=workoutExecutionOrderFn?workoutExecutionOrderFn(S.workout):[];
    if(!order.length)for(var k=0;k<S.workout.length;k++){for(var n=1;n<=(Number(S.workout[k].sets)||1);n++)order.push({ex:k,set:n});}
    return order;
  }
  function firstIncompletePosition(){
    var order=runExecutionOrder();
    for(var i=0;i<order.length;i++){var pos=order[i],log=ensureSetLog(S.workout[pos.ex]),row=log[pos.set-1];if(row&&!row.completed)return{ex:pos.ex,set:pos.set};}
    return {ex:S.workout.length,set:1};
  }
  function completeCurrentSet(){
    var item=S.workout[runState.ex]; if(!item) return false;
    var log=ensureSetLog(item), row=log[Math.max(0,runState.set-1)]; if(!row) return false;
    var wasCompleted=!!row.completed;
    var stage=$('run-stage'),typeInput=qs('[data-run-set-type]',stage);
    ['reps','weight','distance','duration','rir','rpe','note'].forEach(function(name){
      var field=qs('[data-run-field="'+name+'"]',stage);if(field)row[name]=String(field.value||'').slice(0,name==='reps'?24:(name==='note'?500:40));
    });
    if(typeInput)row.type=String(typeInput.value||'working').slice(0,12);
    row.completed=true; row.completedAt=Date.now(); row.restSec=Math.max(0,Number(S.rest)||0); item.reps=row.reps||item.reps; item.weight=row.weight||item.weight; item.done=log.every(function(x){return x.completed;});
    if(!wasCompleted&&detectSetPersonalRecords){
      var exercise=BY_ID[item.id],tracking=exercise&&exercise.custom?exercise.trackingType:(exercise&&exercise.zone==='cardio'?'duration':'weight-reps');
      var records=detectSetPersonalRecords({exerciseId:item.id,set:row,trackingType:tracking,history:S.history});
      var volumeItems=S.workout.map(function(workoutItem){var row=BY_ID[workoutItem.id];return Object.assign({},workoutItem,{trackingType:row&&row.custom?row.trackingType:(row&&row.zone==='cardio'?'duration':'weight-reps')});});
      if(item.done&&detectVolumePersonalRecords)records=records.concat(detectVolumePersonalRecords({exerciseId:item.id,currentItems:volumeItems,history:S.history,exerciseComplete:true}));
      if(S.workout.every(function(workoutItem){return ensureSetLog(workoutItem).every(function(set){return set.completed;});})&&detectVolumePersonalRecords)records=records.concat(detectVolumePersonalRecords({exerciseId:item.id,currentItems:volumeItems,history:S.history,sessionComplete:true}));
      runState.lastPRs=records;
      records.forEach(function(record){var key=item.id+':'+record.type+':'+record.value;if(!runState.personalRecords.some(function(saved){return saved.key===key;}))runState.personalRecords.push({key:key,exerciseId:item.id,type:record.type,value:record.value});});
    }
    saveWorkout(); track('set_complete',{id:item.id,set:runState.set}); return true;
  }

  function runPersonalRecordNotice(){
    if(!runState.lastPRs||!runState.lastPRs.length)return '';
    var labels={load:{ru:'вес',en:'load'},'added-load':{ru:'дополнительный вес',en:'added load'},'reps-at-load':{ru:'повторы на весе',en:'reps at this load'},e1rm:{ru:'e1RM',en:'e1RM'},reps:{ru:'повторы',en:'reps'},duration:{ru:'время',en:'duration'},distance:{ru:'дистанция',en:'distance'},'exercise-volume':{ru:'объём упражнения',en:'exercise volume'},'session-volume':{ru:'объём тренировки',en:'workout volume'}};
    return '<div class="run-pr-notice" role="status" aria-live="polite">'+runState.lastPRs.map(function(record){var label=(labels[record.type]||labels.load)[S.lang==='en'?'en':'ru'];var unit=record.type==='duration'?(S.lang==='en'?' sec':' сек'):record.type==='distance'?' km':(['load','added-load','e1rm','exercise-volume','session-volume'].indexOf(record.type)>=0?' kg':'');return '<span><b>'+(S.lang==='en'?'New PR':'Новый PR')+'</b> · '+esc(label)+' '+esc(String(record.value))+unit+'</span>';}).join('')+'</div>';
  }

  function adjustRunField(name,direction){
    var stage=$('run-stage'),field=qs('[data-run-field="'+name+'"]',stage),item=S.workout[runState.ex],ex=item&&BY_ID[item.id];if(!field||!item)return;
    saveCurrentSetDraft();
    var text=String(field.value||'').trim().replace(',','.'),match=text.match(/-?\d+(?:\.\d+)?/),current=match?Number(match[0]):0;
    var step=name==='weight'?Math.max(.1,Number(ex&&ex.loadIncrement)||progressionIncrementForExercise(ex)||2.5):1;
    var value=Math.max(name==='reps'?1:0,current+direction*step);value=Math.round((value+Number.EPSILON)*100)/100;
    var row=ensureSetLog(item)[Math.max(0,runState.set-1)];if(row)row[name]=String(value);item[name]=String(value);saveWorkout();renderRun();
  }

  function addRunSet(){
    saveCurrentSetDraft();var item=S.workout[runState.ex];if(!item||Number(item.sets)>=20)return;
    var log=ensureSetLog(item),previous=log[Math.max(0,runState.set-1)]||{};item.setLog.push(cleanSetRecord({reps:previous.reps||item.reps,weight:previous.weight||item.weight,type:previous.type||'working'}));item.sets=item.setLog.length;item.done=false;runState.set=item.sets;saveWorkout();renderWorkout();renderRun();
  }

  function removeRunSet(){
    saveCurrentSetDraft();var item=S.workout[runState.ex];if(!item||Number(item.sets)<=1)return;
    var log=ensureSetLog(item);log.splice(Math.max(0,runState.set-1),1);item.sets=Math.max(1,log.length);item.setLog=log;item.done=log.every(function(row){return row.completed;});runState.set=Math.min(runState.set,item.sets);runState.lastPRs=[];saveWorkout();renderWorkout();renderRun();
  }

  function undoRunSet(){
    var item=S.workout[runState.ex];if(!item)return;var row=ensureSetLog(item)[Math.max(0,runState.set-1)];if(!row||!row.completed)return;
    row.completed=false;row.completedAt=0;item.done=false;runState.lastPRs=[];saveWorkout();renderWorkout();renderRun();
  }

  function workoutPersonalRecords(){
    if(!detectSetPersonalRecords||!detectVolumePersonalRecords)return[];
    var records=[];S.workout.forEach(function(item){var ex=BY_ID[item.id],tracking=ex&&ex.custom?ex.trackingType:(ex&&ex.zone==='cardio'?'duration':'weight-reps');ensureSetLog(item).forEach(function(row){records=records.concat(detectSetPersonalRecords({exerciseId:item.id,set:row,trackingType:tracking,history:S.history}));});
      if(item.done)records=records.concat(detectVolumePersonalRecords({exerciseId:item.id,currentItems:[Object.assign({},item,{trackingType:tracking})],history:S.history,exerciseComplete:true}));
    });
    if(S.workout.every(function(item){return ensureSetLog(item).every(function(row){return row.completed;});}))records=records.concat(detectVolumePersonalRecords({exerciseId:'',currentItems:S.workout.map(function(item){var ex=BY_ID[item.id];return Object.assign({},item,{trackingType:ex&&ex.custom?ex.trackingType:(ex&&ex.zone==='cardio'?'duration':'weight-reps')});}),history:S.history,sessionComplete:true}));
    var unique=[];records.forEach(function(record){var key=record.type+':'+record.value;if(!unique.some(function(saved){return saved.key===key;}))unique.push({key:key,type:record.type,value:record.value});});return unique.map(function(record){return{type:record.type,value:record.value};});
  }

  function saveCurrentSetDraft(){
    var item=S.workout[runState.ex],stage=$('run-stage'); if(!item||!stage)return;
    var type=qs('[data-run-set-type]',stage),log=ensureSetLog(item),row=log[Math.max(0,runState.set-1)];
    if(!row)return;
    ['reps','weight','distance','duration','rir','rpe','note'].forEach(function(name){var field=qs('[data-run-field="'+name+'"]',stage);if(field){row[name]=String(field.value||'').slice(0,name==='reps'?24:(name==='note'?500:40));if(name==='reps'||name==='weight')item[name]=row[name]||item[name];}});
    if(type)row.type=String(type.value||'working').slice(0,12); saveWorkout();saveRunSession();
  }
  function runReferenceForCurrent(){
    var item=S.workout[runState.ex];if(!item)return null;var log=ensureSetLog(item),idx=Math.max(0,runState.set-1);
    for(var i=idx-1;i>=0;i--)if(log[i]&&log[i].completed&&setPerformanceSummary(log[i]))return log[i];
    return previousSetPerformance(item.id,idx);
  }
  function reusePreviousRunResult(){
    var ref=runReferenceForCurrent(),stage=$('run-stage'); if(!ref||!stage)return;
    ['reps','weight','distance','duration'].forEach(function(name){var field=qs('[data-run-field="'+name+'"]',stage);if(field)field.value=ref[name]||'';});saveCurrentSetDraft();
  }

  function updateRunClock(){
    if(!runOpen())return;var stage=$('run-stage'),elapsed=fmtClock(runElapsedSeconds()),line=qs('[data-run-elapsed]',stage);
    if(line)line.textContent=t('runElapsed')+' · '+elapsed;
    qsa('[data-run-elapsed-full]',stage).forEach(function(node){node.textContent=elapsed;});
  }

  function renderRun() {
    return renderRunView({ $, S, runState, fmtClock, runElapsedSeconds, runPersonalRecordNotice, premiumIcon, esc, t, runTotalSets, saveRunSession, BY_ID, runDoneSets, ensureSetLog, cleanSetRecord, runReferenceForCurrent, setPerformanceSummary, exerciseTechniqueModel, progressionCopy, progressionForItem, exMotion, exStill, labelZone, labelMu, labelEq, exName, detailText, completedSetCount });
  }

  async function runNext() {
    if (runState.saving) return;
    var item=S.workout[runState.ex];
    if(!item){
      runState.saving=true;$('run-next').disabled=true;$('run-next').setAttribute('aria-busy','true');
      try {
        if(!runState.saved){var saved=await finishWorkout();if(!saved)return;runState.saved=true;}
        store.remove(K.runSession);S.runSession=null;closeOverlay($('run'),$('w-run'));navigateV7('progress',true);
      } finally {runState.saving=false;$('run-next').disabled=false;$('run-next').removeAttribute('aria-busy');}
      return;
    }
    completeCurrentSet(); renderWorkout();
    item.done=ensureSetLog(item).every(function(set){return set.completed;});
    var order=runExecutionOrder(),currentIndex=order.findIndex(function(pos){return pos.ex===runState.ex&&pos.set===runState.set;}),next=null;
    for(var j=Math.max(0,currentIndex+1);j<order.length;j++){var candidate=order[j],candidateLog=ensureSetLog(S.workout[candidate.ex]);if(candidateLog[candidate.set-1]&&!candidateLog[candidate.set-1].completed){next=candidate;break;}}
    if(!next){var wrapped=firstIncompletePosition();if(wrapped.ex<S.workout.length)next=wrapped;}
    if(next){var sameGroup=!!(item.groupId&&S.workout[next.ex]&&S.workout[next.ex].groupId===item.groupId),sameRound=next.set===runState.set;runState.ex=next.ex;runState.set=next.set;if(sameGroup&&sameRound)stopTimer();else startTimer(S.rest);}
    else{saveWorkout();renderWorkout();runState.ex=S.workout.length;runState.set=1;stopTimer();track('workout_complete',{n:S.workout.length});}
    saveRunSession();renderRun();
  }

  function runPrev() {
    saveCurrentSetDraft();
    var order=runExecutionOrder(),current=order.findIndex(function(pos){return pos.ex===runState.ex&&pos.set===runState.set;});
    if(current<0&&runState.ex>=S.workout.length)current=order.length;
    if(current>0){runState.ex=order[current-1].ex;runState.set=order[current-1].set;}
    saveRunSession();
    renderRun();
  }

  function openRun() {
    if (!S.workout.length) { showToast(t('workoutEmptyTitle')); return; }
    var validSaved = S.runSession && Date.now() - Number(S.runSession.startedAt || 0) < 8 * 3600000;
    if (validSaved) {
      runState.ex = clamp(Number(S.runSession.ex) || 0, 0, S.workout.length);
      runState.set = Math.max(1, Number(S.runSession.set) || 1);
      runState.startedAt = Number(S.runSession.startedAt) || Date.now();
    } else {
      var first=firstIncompletePosition(); runState.ex=first.ex; runState.set=first.set; runState.startedAt=Date.now();
      runState.lastPRs=[];runState.personalRecords=[];
    }
    runState.saved = false;
    saveRunSession();
    renderRun();
    openOverlay($('run'), $('run-next'));
    track('workout_start', { n: S.workout.length });
  }

  /* ---------- 16.2 ИСТОРИЯ ТРЕНИРОВОК ------------------------------------ */
  async function finishWorkout() {
    if (!S.workout.length) { showToast(t('workoutEmptyTitle')); return; }
    var entry = {
      id: 'w' + (runState.startedAt || Date.now()),
      name: S.meta.name || t('wTitle'),
      date: S.meta.date || todayISO(),
      note:S.meta.note,
      planDay:Number.isInteger(Number(S.meta.planDay))?Number(S.meta.planDay):null,
      durationSec: runState && runState.startedAt ? runElapsedSeconds() : 0,
      personalRecords:workoutPersonalRecords(),
      items: S.workout.map(function (w) {
        var ex=BY_ID[w.id];return { id:w.id, sets:w.sets, reps:w.reps, weight:w.weight, groupId:w.groupId, groupType:w.groupType, trackingType:ex&&ex.custom?ex.trackingType:(ex&&ex.zone==='cardio'?'duration':'weight-reps'), done:w.done, setLog:ensureSetLog(w).map(function(set){return Object.assign({},set);}) };
      })
    };
    var previousIndex=S.history.findIndex(function(record){return record.id===entry.id;});
    if(previousIndex!==-1)S.history.splice(previousIndex,1);
    S.history.unshift(entry);
    if(S.plan&&Number.isInteger(Number(S.meta.planDay))){v7EnsurePlanWeek();var pd=Number(S.meta.planDay);if(S.plan.completedDays.indexOf(pd)===-1)S.plan.completedDays.push(pd);savePlanV7();}
    var persisted=await saveHistory();
    if(!persisted){showToast(S.lang==='en'?'Could not save. Keep this session open and retry.':'Не удалось сохранить. Оставь тренировку открытой и повтори.', 'error');return false;}
    renderHistory();
    renderProgress();
    renderDashIfVisible();
    showToast(t('histSaved'));
    track('workout_saved', { n: entry.items.length });
    return true;
  }

  function historyDetailHtml(h){
    var note=String(h.note||'').trim();
    var items=(h.items||[]).map(function(item){
      var ex=BY_ID[item.id],name=ex?exName(ex):item.id,sets=Array.isArray(item.setLog)&&item.setLog.length?item.setLog:null;
      var groupNames={superset:S.lang==='en'?'Superset':'Суперсет','tri-set':S.lang==='en'?'Tri-set':'Три-сет',circuit:S.lang==='en'?'Circuit':'Круг'};
      var evidence=sets?sets.map(function(row,i){
        var details=[];if(row.rir!==''&&row.rir!=null)details.push('RIR '+row.rir);if(row.rpe!==''&&row.rpe!=null)details.push('RPE '+row.rpe);if(Number(row.restSec)>0)details.push((S.lang==='en'?'Rest ':'Отдых ')+row.restSec+'s');if(row.note)details.push(String(row.note));
        var typeNames={warmup:S.lang==='en'?'Warm-up':'Разминка',working:S.lang==='en'?'Working':'Рабочий',drop:'Drop',failure:S.lang==='en'?'Failure':'Отказ',backoff:'Back-off',amrap:'AMRAP'};
        return '<span class="hist-set-chip" data-done="'+String(!!row.completed)+'"><small>'+esc(t('histSet',{i:i+1}))+' · '+esc(typeNames[row.type]||row.type||'—')+'</small><b>'+esc(setPerformanceSummary(row)||'—')+'</b>'+(details.length?'<small class="hist-set-extra">'+esc(details.join(' · '))+'</small>':'')+'</span>';
      }).join(''):'<span class="hist-set-chip"><small>'+esc(t('sessionSets'))+'</small><b>'+esc(String(item.sets||0)+' × '+String(item.reps||'—'))+'</b></span>';
      return '<div class="hist-ex"'+(item.groupId?' data-group-id="'+esc(item.groupId)+'"':'')+'><span><b>'+esc(name)+'</b><small>'+esc((ex?labelMu(ex.target):'')+(item.groupType?' · '+groupNames[item.groupType]:''))+'</small></span><div class="hist-set-list">'+evidence+'</div></div>';
    }).join('');
    var prs=(h.personalRecords||[]).map(function(record){return '<span class="hist-pr-chip">'+(S.lang==='en'?'PR':'PR')+' · '+esc(record.type)+' '+esc(String(record.value))+'</span>';}).join('');
    return '<div class="hist-detail" id="hist-detail-'+esc(h.id)+'" hidden>'+(note?'<p class="hist-session-note"><b>'+(S.lang==='en'?'Note':'Заметка')+':</b> '+esc(note)+'</p>':'')+(prs?'<div class="hist-pr-list">'+prs+'</div>':'')+items+'</div>';
  }

  function renderHistoryFilterOptions(){
    var programme=$('history-programme'),exercise=$('history-exercise');if(!programme||!exercise)return;
    var currentProgram=historyFilters.programme,currentExercise=historyFilters.exercise;
    var days=Array.from(new Set(S.history.map(function(h){return h.planDay;}).filter(function(day){return day!=null&&Number.isFinite(Number(day));}))).sort(function(a,b){return Number(a)-Number(b);});
    programme.innerHTML='<option value="">'+(S.lang==='en'?'All programmes':'Все программы')+'</option><option value="unplanned">'+(S.lang==='en'?'Unplanned':'Без программы')+'</option>'+days.map(function(day){return'<option value="day:'+esc(String(day))+'">'+esc(S.lang==='en'?'Day ':'День ')+esc(String(Number(day)+1))+'</option>';}).join('');
    var exerciseIds=Array.from(new Set(S.history.flatMap(function(h){return(h.items||[]).map(function(item){return String(item.id||'');}).filter(Boolean);}))).sort(function(a,b){return exName(BY_ID[a]||{id:a}).localeCompare(exName(BY_ID[b]||{id:b}),S.lang);});
    exercise.innerHTML='<option value="">'+(S.lang==='en'?'All exercises':'Все упражнения')+'</option>'+exerciseIds.map(function(id){var ex=BY_ID[id];return'<option value="'+esc(id)+'">'+esc(ex?exName(ex):id)+'</option>';}).join('');
    programme.value=currentProgram;exercise.value=currentExercise;
    var strings=S.lang==='en'?{search:'Search',placeholder:'Workout, exercise or note',from:'From date',to:'To date',programme:'Programme',exercise:'Exercise',min:'Minutes from',max:'to',pr:'Has PR'}:{search:'Поиск',placeholder:'Тренировка, упражнение, заметка',from:'С даты',to:'По дату',programme:'Программа',exercise:'Упражнение',min:'Минуты от',max:'до',pr:'Есть PR'};
    var labelMap=[['history-query',strings.search],['history-from',strings.from],['history-to',strings.to],['history-programme',strings.programme],['history-exercise',strings.exercise],['history-duration-min',strings.min],['history-duration-max',strings.max]];
    labelMap.forEach(function(pair){var input=$(pair[0]);if(input){var label=input.closest('label'),span=label&&qs('span',label);if(span)span.textContent=pair[1];}});
    var query=$('history-query'),queryFocused=query&&document.activeElement===query,queryStart=queryFocused?query.selectionStart:null,queryEnd=queryFocused?query.selectionEnd:null;if(query){query.placeholder=strings.placeholder;query.value=historyFilters.query;if(queryFocused&&queryStart!=null)query.setSelectionRange(queryStart,queryEnd);}
    $('history-from').value=historyFilters.from;$('history-to').value=historyFilters.to;$('history-duration-min').value=historyFilters.durationMin;$('history-duration-max').value=historyFilters.durationMax;$('history-pr-only').checked=historyFilters.prOnly;
    var prLabel=$('history-pr-only').closest('label');if(prLabel){var prText=qs('span',prLabel);if(prText)prText.textContent=strings.pr;}
  }

  function filteredHistory(){
    var q=historyFilters.query.trim().toLocaleLowerCase();
    return S.history.filter(function(h){
      var items=h.items||[],duration=Number(h.durationSec)||0;
      if(historyFilters.from&&String(h.date||'')<historyFilters.from)return false;
      if(historyFilters.to&&String(h.date||'')>historyFilters.to)return false;
      if(historyFilters.programme==='unplanned'&&h.planDay!=null)return false;
      if(historyFilters.programme.indexOf('day:')===0&&(h.planDay==null||Number(h.planDay)!==Number(historyFilters.programme.slice(4))))return false;
      if(historyFilters.exercise&&!items.some(function(item){return String(item.id)===historyFilters.exercise;}))return false;
      if(historyFilters.prOnly&&!(h.personalRecords||[]).length)return false;
      if(historyFilters.durationMin&&duration<Number(historyFilters.durationMin)*60)return false;
      if(historyFilters.durationMax&&duration>Number(historyFilters.durationMax)*60)return false;
      if(q){var searchable=[h.name,h.date,h.note].concat(items.map(function(item){var ex=BY_ID[item.id];return(ex?exName(ex):item.id)+' '+(item.setLog||[]).map(function(set){return[setPerformanceSummary(set),set.note,set.type].join(' ');}).join(' ');})).concat((h.personalRecords||[]).map(function(record){return record.type+' '+record.value;})).join(' ').toLocaleLowerCase();if(searchable.indexOf(q)<0)return false;}
      return true;
    });
  }

  function updateHistoryFilterState(){
    historyFilters={query:$('history-query').value,from:$('history-from').value,to:$('history-to').value,programme:$('history-programme').value,exercise:$('history-exercise').value,durationMin:$('history-duration-min').value,durationMax:$('history-duration-max').value,prOnly:$('history-pr-only').checked};
    historyVisibleCount=20;renderHistory();
  }

  function renderHistory() {
    return renderHistoryView({ $, S, esc, filteredHistory, historyDetailHtml, historyVisibleCount, renderHistoryFilterOptions, t, totalCompletedHistorySets, totalHistorySets });
  }

  function repeatWorkout(id) {
    var h = S.history.filter(function (x) { return x.id === id; })[0];
    if (!h) return;
    S.workout=h.items.filter(function(i){return BY_ID[i.id];}).map(function(i){var last=Array.isArray(i.setLog)?i.setLog.filter(function(x){return x&&x.completed;}).slice(-1)[0]:null;return normalizeWorkoutRecord({id:i.id,sets:i.sets,reps:last&&last.reps?last.reps:i.reps,weight:last&&last.weight?last.weight:i.weight,groupId:i.groupId,groupType:i.groupType,done:false,setLog:[]});});
    S.meta.name = h.name;
    S.meta.date = todayISO();
    S.meta.note='';S.meta.planDay=null;
    saveWorkout();saveMeta();
    syncWorkoutMeta(); renderWorkout(); renderResults();
    showToast(t('histRepeated'));
    track('repeat_workout',{n:S.workout.length});
    scrollToId('workout');
  }

  /* ---------- 16.3 ЭКСПОРТ И ИМПОРТ ТРЕНИРОВКИ --------------------------- */
  function workoutJson() {
    return JSON.stringify({
      v: 4, kind: 'workout', meta: S.meta,
      items: S.workout.map(function (w) {
        var ex = BY_ID[w.id];
        return { id:w.id, name:ex?exName(ex):'', sets:w.sets, reps:w.reps, weight:w.weight, done:w.done, groupId:w.groupId, groupType:w.groupType, setLog:ensureSetLog(w).map(function(set){return Object.assign({},set);}) };
      })
    }, null, 2);
  }

  function importWorkoutJson(raw) {
    var data;
    try { data = JSON.parse(raw); } catch (e) { showToast(t('ioBadJson')); return false; }
    if (!data || !Array.isArray(data.items)) { showToast(t('ioBadShape')); return false; }
    var items = data.items.filter(function(i){return i&&BY_ID[String(i.id)];}).map(normalizeWorkoutRecord);
    if (!items.length) { showToast(t('ioNothing')); return false; }
    S.workout = items;
    if (data.meta && typeof data.meta === 'object') {
      S.meta = {
        name: String(data.meta.name || '').slice(0, 80),
        date: String(data.meta.date || todayISO()).slice(0, 10),
        note: String(data.meta.note || '').slice(0, 600)
      };
    }
    saveWorkout(); saveMeta(); syncWorkoutMeta(); renderWorkout(); renderResults();
    showToast(t('ioImported', { n: items.length }));
    return true;
  }

  /* ---------- 16.4 КБЖУ: АВТОРСКИЙ РАЗБОР -------------------------------- */
  function kbjuGoalKey(goal) {
    if (goal === 'cut') return 'cut';
    if (goal === 'lean' || goal === 'gain') return 'bulk';
    return 'maintain';
  }

  function decorateKbju(ctx) {
    if (!C) return;
    var key = kbjuGoalKey(ctx.goal);
    var block = C.coach.kbju[key];
    var out = $('kbju-out');
    if (!out || !block) return;

    var track_ = L(block.track);
    var html = coachNote(block, {
      why: [
        t('whyKbjuFormula', { v: ctx.method }),
        t('whyKbjuActivity'),
        t('whyKbjuNoHistory')
      ]
    }) +
    '<div><p class="kb-label">' + esc(t('kbjuWatchT')) + '</p><ul class="kb-practice">' +
      track_.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
    '</ul></div>' +
    '<div class="note">' + esc(t('kbjuUncertainty')) + '</div>' +
    '<div class="note"><b>' + esc(t('kbjuHowStart')) + '</b> ' + esc(t('kbjuHowStartText')) + '</div>' +
    '<div class="note note-warn"><b>' + esc(t('kbjuNever')) + '</b> ' + esc(t('kbjuNeverText')) + '</div>' +
    '<button class="btn btn-solid btn-sm" type="button" data-cact="checkin">' + esc(t('kbjuToCheckin')) + '</button>';

    var wrap = document.createElement('div');
    wrap.className = 'kbju-coach-stack';
    wrap.innerHTML = html;
    out.appendChild(wrap);

    if (ctx.protein && ctx.fat && ctx.carbs) {
      var macroCalories = ctx.protein * 4 + ctx.fat * 9 + ctx.carbs * 4;
      var pPct = Math.round(ctx.protein * 4 / macroCalories * 100);
      var fPct = Math.round(ctx.fat * 9 / macroCalories * 100);
      var cPct = Math.max(0, 100 - pPct - fPct);
      var visual = document.createElement('div');
      visual.className = 'macro-visual';
      visual.innerHTML = '<div class="macro-visual-head"><b>' + esc(t('macroVisual')) + '</b><span>' + pPct + '% / ' + fPct + '% / ' + cPct + '%</span></div>' +
        '<div class="macro-bar" role="img" aria-label="' + esc(t('macroVisual')) + '">' +
          '<span class="macro-seg macro-protein" style="width:' + pPct + '%"></span>' +
          '<span class="macro-seg macro-fat" style="width:' + fPct + '%"></span>' +
          '<span class="macro-seg macro-carbs" style="width:' + cPct + '%"></span>' +
        '</div>' +
        '<div class="macro-legend"><span><b>' + esc(t('kbjuProtein')) + '</b> ' + ctx.protein + ' ' + esc(t('gram')) + '</span>' +
        '<span><b>' + esc(t('kbjuFat')) + '</b> ' + ctx.fat + ' ' + esc(t('gram')) + '</span>' +
        '<span><b>' + esc(t('kbjuCarbs')) + '</b> ' + ctx.carbs + ' ' + esc(t('gram')) + '</span></div>';
      var firstNote = qs('.note', out);
      if (firstNote) out.insertBefore(visual, firstNote); else out.appendChild(visual);
    }

    S.kbjuLast = { target: ctx.target, goal: ctx.goal, date: todayISO() };
    store.set(K.kbju, JSON.stringify(S.kbjuLast));
    renderWeeklyNutritionBudget();
    renderDashIfVisible();
    track('nutrition_calculate', { goal: ctx.goal, target: ctx.target });
  }

  /* ---------- 16.5 НЕДЕЛЬНАЯ СВЕРКА -------------------------------------- */
  function runCheckin() {
    var prev = Number($('c-prev').value);
    var now = Number($('c-now').value);
    var ok = true;
    [['c-prev', prev], ['c-now', now]].forEach(function (pair) {
      if (!isFinite(pair[1]) || pair[1] < 30 || pair[1] > 300) {
        setFieldError(pair[0], t('errRange', { min: 30, max: 300 }));
        ok = false;
      } else setFieldError(pair[0], '');
    });
    if (!ok) { showToast(t('formHasErrors')); return; }

    var waist = $('c-waist').value, strength = $('c-strength').value;
    var hunger = $('c-hunger').value, sleep = $('c-sleep').value, adherence = $('c-adherence').value;

    var pct = ((now - prev) / prev) * 100;
    var goal = S.profile.goal || (S.kbjuLast ? kbjuGoalKey(S.kbjuLast.goal) : 'maintain');
    if (goal === 'fat') goal = 'cut';
    if (goal === 'muscle' || goal === 'strength') goal = 'bulk';
    if (goal === 'health') goal = 'maintain';

    var verdict;
    var why = [t('whyCheckPct', { v: (pct >= 0 ? '+' : '') + pct.toFixed(2) })];
    why.push(t('whyCheckGoal', { v: L(CHECK_GOAL_LABEL[goal]) }));
    why.push(t('whyCheckSignals', { s: $('c-strength').selectedOptions[0].textContent,
      w: $('c-waist').selectedOptions[0].textContent }));

    if (sleep === 'bad' && hunger === 'high') verdict = 'recover';
    else if (adherence === 'low') verdict = 'wait';
    else if (goal === 'cut') {
      if (pct < -1.2 || strength === 'down') verdict = 'up';
      else if (pct > -0.15 && waist !== 'down') verdict = 'down';
      else verdict = 'hold';
    } else if (goal === 'bulk') {
      if (pct > 0.7 || (waist === 'up' && strength !== 'up')) verdict = 'down';
      else if (pct < 0.05 && strength !== 'up') verdict = 'up';
      else verdict = 'hold';
    } else {
      if (Math.abs(pct) <= 0.4) verdict = 'hold';
      else if (pct > 0.4) verdict = 'down';
      else verdict = 'up';
    }

    var v = C.coach.checkin[verdict];
    var out = $('checkin-out');
    out.innerHTML = '<div>' +
        '<p class="eyebrow v8-eyebrow-tight">' + esc(t('checkinResult')) + '</p>' +
        signal(v.state, L(v.t)) +
      '</div>' +
      '<p class="v8-muted-copy">' + esc(L(v.d)) + '</p>' +
      '<div class="kpi-row">' +
        '<div class="kpi kpi-accent"><span>' + esc(t('checkinDelta')) + '</span><b>' +
          esc((pct >= 0 ? '+' : '') + pct.toFixed(2)) + ' %</b></div>' +
        '<div class="kpi"><span>' + esc(t('checkinAbs')) + '</span><b>' +
          esc((now - prev >= 0 ? '+' : '') + (now - prev).toFixed(1)) + ' ' + esc(t('kg')) + '</b></div>' +
      '</div>' +
      coachNote({
        t: { ru: 'Одна сверка — это гипотеза, а не решение', en: 'One check-in is a hypothesis, not a decision' },
        d: { ru: 'Меняй что-то одно и дай изменению две недели. Если поменять калории, объём и кардио одновременно, разобраться в результате будет невозможно.',
             en: 'Change one thing and give it two weeks. If you change calories, volume and cardio at once, the result tells you nothing.' },
        a: { ru: 'Запиши сегодняшние значения в дневник — через две недели будет с чем сравнить.',
             en: 'Log today\u2019s numbers in the diary — in two weeks you will have something to compare with.' }
      }, { compact: true, why: why }) +
      '<button class="btn btn-solid btn-sm" type="button" data-cact="progress">' + esc(t('actProgress')) + '</button>';
    out.setAttribute('data-filled', 'true');
    track('checkin_done', { verdict: verdict });
  }

  var CHECK_GOAL_LABEL = {
    cut: { ru: 'снижение жира', en: 'fat loss' },
    bulk: { ru: 'набор', en: 'gaining' },
    maintain: { ru: 'поддержание', en: 'maintenance' }
  };

  /* ---------- 16.6 ПЛАН: ОГРАНИЧЕНИЯ И РАЗБОР ---------------------------- */
  /* Фильтр вызывается из buildPlan при формировании пула упражнений. */
  function planExtraFilter(ex) {
    if (['avoid', 'unavailable', 'discomfort'].indexOf(exercisePreference(ex.id)) !== -1) return false;
    if (!C) return true;
    var style = $('p-style') ? $('p-style').value : 'balanced';
    if (style === 'free' && FREE_WEIGHT.indexOf(ex.equip) === -1 && ex.equip !== 'body weight') return false;
    if (style === 'machine' && GUIDED.indexOf(ex.equip) === -1) return false;
    if (style === 'minimal' && !isHomeFriendly(ex)) return false;

    if (S.planLimits.length) {
      if (S.planLimits.indexOf(ex.zone) !== -1 && FREE_WEIGHT.indexOf(ex.equip) !== -1 && exKind(ex) === 'compound') return false;
      if (S.planLimits.indexOf('back') !== -1 && norm(ex.nameEn).indexOf('deadlift') !== -1) return false;
    }

    var avoidRaw = $('p-avoid') ? $('p-avoid').value.trim() : '';
    if (avoidRaw) {
      var terms = avoidRaw.split(',').map(norm).filter(function (x) { return x.length > 2; });
      for (var i = 0; i < terms.length; i++) {
        if (ex.search.indexOf(terms[i]) !== -1) return false;
      }
    }
    return true;
  }

  function planSplitKind(days) {
    if (days <= 3) return 'full';
    if (days === 4) return 'ul';
    if (days >= 5) return 'ppl';
    return 'mixed';
  }

  function planCardioTextV10(ctx) {
    ctx = ctx || {};
    if (ctx.cardio === 'none') return S.lang === 'en' ? 'No dedicated cardio block selected.' : 'Отдельный кардио-блок не выбран.';
    var lowSteps = ctx.steps === 'low', highSteps = ctx.steps === 'high';
    if (ctx.cardio === 'mixed') {
      if (ctx.goal === 'fatloss' && lowSteps) return S.lang === 'en' ? '2–3 easy sessions of 20–30 minutes plus no more than one short interval block. First raise daily movement before adding more intervals.' : '2–3 спокойных сессии по 20–30 минут и не больше одного короткого интервального блока. Сначала подними ежедневную активность, а не количество интервалов.';
      return S.lang === 'en' ? '1–2 easy sessions of 20–30 minutes plus one short interval block if recovery stays normal.' : '1–2 спокойных сессии по 20–30 минут и один короткий интервальный блок, если восстановление остаётся нормальным.';
    }
    if (ctx.goal === 'fatloss') {
      if (lowSteps) return S.lang === 'en' ? 'Start with 2–3 easy sessions of 20–30 minutes and move daily steps toward a sustainable baseline.' : 'Начни с 2–3 спокойных сессий по 20–30 минут и постепенно подними ежедневные шаги до устойчивого уровня.';
      if (highSteps) return S.lang === 'en' ? 'Daily movement is already high; 1–2 easy sessions of 20–25 minutes are enough as a starting point.' : 'Ежедневная активность уже высокая; для старта достаточно 1–2 спокойных сессий по 20–25 минут.';
      return S.lang === 'en' ? 'Use 2 easy sessions of 20–30 minutes and adjust only after the weight/waist trend is clear.' : 'Используй 2 спокойные сессии по 20–30 минут и меняй объём только после понятного тренда веса и талии.';
    }
    return S.lang === 'en' ? '1–2 easy sessions of 20–30 minutes are enough for general conditioning without competing with strength work.' : '1–2 спокойные сессии по 20–30 минут достаточно для общей выносливости без лишней конкуренции с силовой работой.';
  }

  function weeklyReviewSets(){
    var cutoff=Date.now()-14*86400000;
    return S.history.filter(function(session){var date=Date.parse(String(session.date||'')+'T12:00:00');return Number.isFinite(date)&&date>=cutoff;})
      .flatMap(function(session){return(session.items||[]).flatMap(function(item){return Array.isArray(item.setLog)?item.setLog:[];});})
      .filter(function(set){return set&&set.completed;});
  }
  function weeklyReviewPanelHtml(block){
    var ctx=S.plan&&S.plan.ctx||{},weekStart=v7CurrentWeekKey(),reviews=cleanWeeklyReviewsFn(ctx.weeklyReviews),saved=reviews.filter(function(review){return review.weekStart===weekStart;})[0];
    var completed=Array.isArray(S.plan&&S.plan.completedDays)?S.plan.completedDays.length:0,planned=S.plan&&Array.isArray(S.plan.days)?S.plan.days.length:0;
    var decision=weeklyReviewDecisionFn?weeklyReviewDecisionFn({reviews:reviews,completedWorkingSets:weeklyReviewSets(),programmeAgeWeeks:block&&block.weekNumber||1}):null;
    var message='';
    if(decision&&decision.recommendation==='review-discomfort')message='<p class="note note-warn">'+esc(t('planReview.discomfortResult'))+'</p>';
    else if(decision&&decision.recommendation==='consider-deload'){
      var reasonKeys={two_consecutive_weeks_declining_performance:'planReview.reasonDecline',high_fatigue_and_session_difficulty:'planReview.reasonFatigue',adherence_at_least_70_percent:'planReview.reasonAdherence',at_least_half_of_rated_work_sets_near_limit:'planReview.reasonEffort'};
      message='<div class="note"><b>'+esc(t('planReview.deload'))+'</b><ul>'+decision.reasons.map(function(reason){return'<li>'+esc(t(reasonKeys[reason]||'planReview.hold'))+'</li>';}).join('')+'</ul></div>';
    }else if(decision&&decision.recommendation==='continue-plan')message='<p class="note">'+esc(t('planReview.continue'))+' · '+esc(t('planReview.reasonImprove'))+'</p>';
    else if(saved){var needed=[];if(decision&&decision.missingData.indexOf('second_consecutive_week')!==-1)needed.push(t('planReview.needSecond'));if(decision&&decision.missingData.indexOf('programme_age_under_three_weeks')!==-1)needed.push(t('planReview.needAge'));if(decision&&decision.missingData.indexOf('six_rated_working_sets_with_rir_or_rpe')!==-1)needed.push(t('planReview.needEffort'));message='<p class="note">'+esc(t('planReview.hold'))+(needed.length?' · '+esc(needed.join(' ')):'')+'</p>';}
    var performance=saved?saved.performance:'steady',fatigue=saved?saved.fatigue:'moderate',soreness=saved&&saved.soreness||'',discomfort=saved&&saved.jointDiscomfort?'yes':'no',difficulty=saved?saved.sessionDifficulty:3;
    function option(value,key,selected){return'<option value="'+esc(value)+'"'+(selected===value?' selected':'')+'>'+esc(t(key))+'</option>';}
    var sorenessOptions='<option value=""'+(!soreness?' selected':'')+'>'+esc(S.lang==='en'?'Not specified':'Не указана')+'</option>'+['low','moderate','high'].map(function(value){return option(value,'planReview.'+value,soreness);}).join('');
    return '<section class="plan-week-review" aria-labelledby="plan-week-review-title"><h3 id="plan-week-review-title">'+esc(t('planReview.title'))+'</h3><p class="small">'+esc(t('planReview.intro'))+'</p><p class="tiny">'+esc(t('planReview.adherence'))+': '+completed+' / '+planned+'</p>'+message+'<form id="plan-week-review-form" data-week-start="'+esc(weekStart)+'"><div class="form-grid">'+
      '<div class="field"><label for="plan-review-performance">'+esc(t('planReview.performance'))+'</label><select class="select" id="plan-review-performance">'+['improving','steady','declining'].map(function(value){return option(value,'planReview.'+value,performance);}).join('')+'</select></div>'+
      '<div class="field"><label for="plan-review-fatigue">'+esc(t('planReview.fatigue'))+'</label><select class="select" id="plan-review-fatigue">'+['low','moderate','high'].map(function(value){return option(value,'planReview.'+value,fatigue);}).join('')+'</select></div>'+
      '<div class="field"><label for="plan-review-soreness">'+esc(t('planReview.soreness'))+'</label><select class="select" id="plan-review-soreness">'+sorenessOptions+'</select></div>'+
      '<div class="field"><label for="plan-review-discomfort">'+esc(t('planReview.discomfort'))+'</label><select class="select" id="plan-review-discomfort">'+option('no','planReview.noDiscomfort',discomfort)+option('yes','planReview.yesDiscomfort',discomfort)+'</select></div>'+
      '<div class="field"><label for="plan-review-difficulty">'+esc(t('planReview.difficulty'))+'</label><select class="select" id="plan-review-difficulty">'+[1,2,3,4,5].map(function(value){return'<option value="'+value+'"'+(Number(difficulty)===value?' selected':'')+'>'+value+'</option>';}).join('')+'</select></div></div><button class="btn btn-solid btn-sm" type="submit">'+esc(t('planReview.save'))+'</button></form></section>';
  }
  function bindWeeklyReviewForm(block){
    var form=$('plan-week-review-form');if(!form)return;
    form.addEventListener('submit',function(event){
      event.preventDefault();
      var ctx=S.plan&&S.plan.ctx||{},reviews=cleanWeeklyReviewsFn(ctx.weeklyReviews),planned=S.plan&&S.plan.days?S.plan.days.length:0,completed=S.plan&&S.plan.completedDays?S.plan.completedDays.length:0;
      var review={weekStart:form.dataset.weekStart,performance:$('plan-review-performance').value,fatigue:$('plan-review-fatigue').value,soreness:$('plan-review-soreness').value||null,jointDiscomfort:$('plan-review-discomfort').value==='yes',sessionDifficulty:Number($('plan-review-difficulty').value),completedDays:completed,plannedDays:planned,adherence:planned?completed/planned:0};
      ctx.weeklyReviews=cleanWeeklyReviewsFn(reviews.filter(function(row){return row.weekStart!==review.weekStart;}).concat([review]));
      S.plan.ctx=ctx;savePlanV7();renderStoredPlanV10();showToast(t('planReview.saved'));
      var current=qs('#plan-week-review-form');if(current){var button=current.querySelector('button[type="submit"]');if(button)button.focus();}
    });
  }

  function renderStoredPlanV10() {
    var out = $('plan-out');
    if (!out || !S.plan || !Array.isArray(S.plan.days) || !S.plan.days.length) return;
    v7EnsurePlanWeek();
    var week = S.plan.days;
    var ctx = S.plan.ctx || {};
    var days = Number(ctx.days) || week.length;
    var time = Number(ctx.time) || Number(S.profile.typicalSessionMinutes) || 60;
    var goal = ctx.goal || (S.profile.goal === 'fat' ? 'fatloss' : S.profile.goal) || 'muscle';
    var level = ctx.level || (S.profile.level === 'medium' ? 'middle' : S.profile.level) || 'middle';
    var place = ctx.place || S.profile.place || 'gym';
    var completed = Array.isArray(S.plan.completedDays) ? S.plan.completedDays : [];
    var nextDay = v7NextPlanDay();
    lastPlan = { week:week, goal:goal, level:level, days:days, time:time, place:place, focus:ctx.focus||S.profile.focus||'balanced', ctx:ctx };

    var goalLabel = ctx.goalLabel || (S.lang === 'en' ? ({muscle:'Muscle',strength:'Strength',fatloss:'Fat loss',health:'Health'}[goal] || goal) : ({muscle:'Мышцы',strength:'Сила',fatloss:'Снижение жира',health:'Здоровье'}[goal] || goal));
    var levelLabel = ctx.levelLabel || (S.lang === 'en' ? ({beginner:'Beginner',middle:'Intermediate',advanced:'Advanced'}[level] || level) : ({beginner:'Начальный',middle:'Средний',advanced:'Продвинутый'}[level] || level));
    var placeLabel = ctx.placeLabel || (S.lang === 'en' ? ({gym:'Gym',home:'Home',minimal:'Minimal equipment'}[place] || place) : ({gym:'Зал',home:'Дом',minimal:'Минимум оборудования'}[place] || place));
    var created = S.plan.createdAt ? new Date(S.plan.createdAt) : null;
    var createdLabel = created && !isNaN(created.getTime()) ? new Intl.DateTimeFormat(S.lang === 'en' ? 'en-GB' : 'ru-RU',{day:'numeric',month:'short'}).format(created) : '';
    var block = v7MesocycleStatus();
    var blockLabel = block && block.status !== 'insufficient'
      ? (block.status === 'complete'
        ? (S.lang === 'en' ? 'Block complete · review the next block' : 'Блок завершён · оцени результат и задай следующий')
        : (S.lang === 'en' ? 'Block week {week} of {total}' : 'Неделя блока {week} из {total}').replace('{week}',String(block.weekNumber)).replace('{total}',String(block.durationWeeks)))
      : '';

    var weekHtml = week.map(function(day, dayIndex){
      var name = DAY_NAMES[day.key] ? (DAY_NAMES[day.key][S.lang] || DAY_NAMES[day.key].ru) : (S.lang === 'en' ? 'Session' : 'Тренировка');
      var done = completed.indexOf(dayIndex) !== -1;
      var current = dayIndex === nextDay;
      var status = done ? (S.lang === 'en' ? 'Completed' : 'Выполнено') : current ? (S.lang === 'en' ? 'Next' : 'Следующая') : (S.lang === 'en' ? 'Planned' : 'Запланировано');
      var rest = day.items[0] ? day.items[0].rest : 90;
      return '<section class="plan-day v10-plan-day" data-plan-day="'+dayIndex+'" data-state="'+(done?'done':current?'current':'planned')+'">' +
        '<div class="plan-day-head"><div><span class="v10-plan-status">'+esc(status)+'</span><b>'+esc(t('planDay',{n:dayIndex+1}))+' · '+esc(name)+'</b></div><span>'+esc(t('planRest'))+' '+rest+' '+esc(t('planSec'))+'</span></div>' +
        '<div class="v10-plan-exercises">' + day.items.map(function(it,itemIndex){
          return '<div class="plan-ex" data-plan-day="'+dayIndex+'" data-plan-item="'+itemIndex+'">' +
            '<button class="plan-ex-name" type="button" data-open="'+esc(it.ex.id)+'">'+esc(exName(it.ex))+'</button>' +
            '<span class="meta-tag">'+esc(labelEq(it.ex.equip))+'</span>' +
            '<span class="plan-ex-dose">'+it.sets+' × '+esc(it.reps)+'</span>' +
            '<div class="plan-ex-tools">' +
              '<button class="btn btn-quiet btn-sm" type="button" data-plan-swap="'+esc(it.ex.id)+'">'+esc(t('planSwapBtn'))+'</button>' +
              '<button class="btn btn-quiet btn-sm" type="button" data-plan-add="'+esc(it.ex.id)+'">'+esc(t('planAddOne'))+'</button>' +
              '<button class="btn btn-quiet btn-sm btn-danger" type="button" data-plan-del="1">'+esc(t('planDrop'))+'</button>' +
            '</div></div>';
        }).join('') + '</div>' +
        '<div class="plan-day-actions"><button class="btn '+(current?'btn-primary':'btn-solid')+' btn-sm" type="button" data-plan-day-add="'+dayIndex+'">'+esc(done?(S.lang==='en'?'Repeat session':'Повторить тренировку'):(current?(S.lang==='en'?'Start next session':'Начать следующую') : t('planAddDay')))+'</button></div>' +
      '</section>';
    }).join('');

    var coachWhy = C && C.coach && C.coach.plan && C.coach.plan.why ? C.coach.plan.why[planSplitKind(days)] : null;
    var warm = C && C.coach && C.coach.plan ? C.coach.plan.warmup : null;
    var progress = C && C.coach && C.coach.plan ? C.coach.plan.progress : null;
    var progressText = progress ? L(progress) : (PROGRESS_TEXT[level] ? (PROGRESS_TEXT[level][S.lang] || PROGRESS_TEXT[level].ru) : '');
    var completedText = completed.length + ' / ' + week.length;
    var allDone = completed.length >= week.length;

    out.innerHTML = '<div class="v10-plan-hero">' +
        '<div><p class="eyebrow v8-eyebrow-tight">'+esc(goalLabel+' · '+levelLabel+' · '+placeLabel)+'</p>' +
        '<h3 class="v8-output-title">'+esc(allDone?(S.lang==='en'?'Week complete':'Неделя выполнена'):(S.lang==='en'?'Active programme':'Активная программа'))+'</h3>' +
        '<p class="small v8-mt-2">'+esc(t('planWeekly',{days:days,time:time,ex:week[0]&&week[0].items?week[0].items.length:0}))+(createdLabel?' · '+esc(createdLabel):'')+'</p></div>' +
        '<div class="v10-plan-progress"><strong>'+esc(completedText)+'</strong><span>'+(S.lang==='en'?'sessions this week':'тренировок на неделе')+'</span><i style="--v10-plan-progress:'+Math.round(completed.length/Math.max(1,week.length)*100)+'%"></i></div>' +
      '</div>' +
      '<div class="plan-week">'+weekHtml+'</div>' +
      '<div class="v10-plan-guidance">' +
        (blockLabel?'<div class="note" data-mesocycle-status="'+esc(block.status)+'">'+esc(blockLabel)+'</div>':'') +
        (coachWhy?'<div class="note"><b>'+esc(t('planWhyT'))+'</b> '+esc(L(coachWhy))+'</div>':'') +
        (warm?'<div class="note"><b>'+esc(t('planWarmT'))+'</b> '+esc(L(warm))+'</div>':'') +
        '<div class="note"><b>'+esc(t('planCardio'))+'.</b> '+esc(planCardioTextV10(ctx))+'</div>' +
        '<div class="note"><b>'+esc(t('planProgress'))+'.</b> '+esc(progressText)+'</div>' +
        (ctx.recovery==='low'?'<div class="note note-warn">'+esc(t('planRecoveryWarn'))+'</div>':'') +
      '</div>' +
      '<div class="plan-actions v10-plan-actions">' +
        '<button class="btn btn-primary btn-sm" type="button" id="plan-copy">'+esc(t('planCopy'))+'</button>' +
        (nextDay>=0?'<button class="btn btn-solid btn-sm" type="button" data-plan-day-add="'+nextDay+'">'+esc(S.lang==='en'?'Load next session':'Загрузить следующую тренировку')+'</button>':'') +
        '<button class="btn btn-solid btn-sm" type="button" id="plan-export">'+esc(t('planExport'))+'</button>' +
        '<button class="btn btn-quiet btn-sm" type="button" id="plan-print">'+esc(t('workout.print'))+'</button>' +
      '</div>' + weeklyReviewPanelHtml(block);
    out.setAttribute('data-filled','true');
    bindWeeklyReviewForm(block);
    var copy=$('plan-copy'); if(copy)copy.addEventListener('click',function(){copyText(planText());});
    var exp=$('plan-export'); if(exp)exp.addEventListener('click',function(){copyText(JSON.stringify(serialisePlanV7(S.plan),null,2),t('planExported'));});
    var print=$('plan-print'); if(print)print.addEventListener('click',function(){window.print();});
  }

  function decoratePlan(week, ctx) {
    if (!$('plan-out')) return;
    ctx=Object.assign({},ctx||{});
    ctx.blockWeeks=[4,6,8].indexOf(Number(ctx.blockWeeks))!==-1?Number(ctx.blockWeeks):4;
    ctx.blockStartWeek=v7CurrentWeekKey();
    S.plan={days:week,ctx:ctx,createdAt:Date.now(),weekKey:v7CurrentWeekKey(),completedDays:[]};
    S.profile.goal=ctx.goal==='fatloss'?'fat':ctx.goal;
    S.profile.level=ctx.level==='middle'?'medium':ctx.level;
    S.profile.place=ctx.place;
    S.profile.days=String(ctx.days);
    S.profile.typicalSessionMinutes=String(ctx.time);
    S.profile.focus=ctx.focus||'balanced';
    S.profile.recoveryBaseline=ctx.recovery||'mid';
    S.profile.limitations=S.planLimits.slice();
    S.profile.done=true;S.profile.skipped=false;
    saveProfile();savePlanV7();
    renderStoredPlanV10();
    renderDashIfVisible();
    track('program_complete',{days:ctx.days,goal:ctx.goal});
  }

  function planRowAction(e) {
    var dayAdd=e.target.closest('[data-plan-day-add]');
    if(dayAdd&&S.plan&&S.plan.days){startPlanDayV7(Number(dayAdd.dataset.planDayAdd),false);return;}
    var row=e.target.closest('.plan-ex');
    var dayIndex=row?Number(row.dataset.planDay):-1;
    var itemIndex=row?Number(row.dataset.planItem):-1;
    var day=S.plan&&S.plan.days&&S.plan.days[dayIndex];
    var item=day&&day.items?day.items[itemIndex]:null;

    var swapBtn=e.target.closest('[data-plan-swap]');
    if(swapBtn){
      var ex=item&&item.ex?item.ex:BY_ID[swapBtn.dataset.planSwap];
      if(!ex||!day)return;
      var used=day.items.map(function(it){return it.ex.id;});
      var alt=swapCandidates(ex,'same').filter(function(candidate){return used.indexOf(candidate.id)===-1;})[0];
      if(!alt){showToast(t('swapNone'));return;}
      item.ex=alt;
      savePlanV7();
      renderStoredPlanV10();
      showToast(t('planSwapped'));
      return;
    }
    var addBtn=e.target.closest('[data-plan-add]');
    if(addBtn){
      var id=addBtn.dataset.planAdd;
      if(inWorkout(id)){showToast(t('inWorkout'));return;}
      addToWorkout(id);return;
    }
    var delBtn=e.target.closest('[data-plan-del]');
    if(delBtn&&day&&item){
      if(day.items.length<=1){showToast(S.lang==='en'?'Keep at least one exercise in the session':'Оставь хотя бы одно упражнение в тренировке');return;}
      day.items.splice(itemIndex,1);
      savePlanV7();
      renderStoredPlanV10();
      showToast(t('planDropped'));
    }
  }

  /* ---------- 16.7 ДНЕВНИК ПРОГРЕССА ------------------------------------- */
  function saveDiaryEntry() {
    var date = $('g-date').value || todayISO();
    var weight = $('g-weight').value === '' ? null : Number($('g-weight').value);
    var waist = $('g-waist').value === '' ? null : Number($('g-waist').value);
    var ok = true;

    if (weight !== null && (!isFinite(weight) || weight < 30 || weight > 300)) {
      setFieldError('g-weight', t('errRange', { min: 30, max: 300 })); ok = false;
    } else setFieldError('g-weight', '');
    if (waist !== null && (!isFinite(waist) || waist < 40 || waist > 200)) {
      setFieldError('g-waist', t('errRange', { min: 40, max: 200 })); ok = false;
    } else setFieldError('g-waist', '');
    if (!ok) { showToast(t('formHasErrors')); return; }
    if (weight === null && waist === null) { showToast(t('diaryNeedValue')); return; }

    var entry = {
      date: date,
      weight:weight, waist:waist,
      recovery:$('g-recovery-v7')?Number($('g-recovery-v7').value):null,
      sleep:$('g-sleep').value===''?null:Number($('g-sleep').value),
      mood: Number($('g-mood').value),
      hunger: Number($('g-hunger').value),
      fatigue: Number($('g-fatigue').value),
      lift: String($('g-lift').value || '').slice(0, 80),
      note: String($('g-note').value || '').slice(0, 400)
    };

    S.diary = S.diary.filter(function (d) { return d.date !== date; });
    S.diary.unshift(entry);
    S.diary.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    saveDiary();
    renderProgress();
    renderDashIfVisible();
    showToast(t('diarySaved'));
    track('progress_checkin', { has: { w: weight !== null, waist: waist !== null } });
  }

  function diaryDelta(field, days) {
    return calculateDiaryDelta(S.diary, field, days);
  }

  function diaryAvg(field, days) {
    return diaryAverage(S.diary, field, days);
  }

  var progressMetric = 'weight';

  function progressChartTabsV10() {
    var tabs = [
      ['weight', S.lang === 'en' ? 'Weight' : 'Вес'],
      ['waist', S.lang === 'en' ? 'Waist' : 'Талия'],
      ['sleep', S.lang === 'en' ? 'Sleep' : 'Сон']
    ];
    return '<div class="v10-progress-tabs" role="group" aria-label="' + esc(S.lang === 'en' ? 'Chart metric' : 'Показатель графика') + '">' + tabs.map(function(x){
      return '<button type="button" data-progress-metric="'+x[0]+'" aria-pressed="'+String(progressMetric===x[0])+'">'+esc(x[1])+'</button>';
    }).join('') + '</div>';
  }

  function progressCoachNoteV10() {
    if (progressMetric === 'waist') return coachNote({
      t:{ru:'Талия полезна как второй сигнал',en:'Waist is useful as a second signal'},
      d:{ru:'Измеряй её в одинаковых условиях. Она помогает отделить реальное изменение композиции тела от колебаний массы из-за воды.',en:'Measure it under the same conditions. It helps separate body-composition change from water-driven scale fluctuations.'},
      a:{ru:'Оценивай направление за несколько недель вместе с весом, а не отдельную точку.',en:'Read the multi-week direction together with weight, not a single point.'}
    },{compact:true});
    if (progressMetric === 'sleep') return coachNote({
      t:{ru:'Сон — контекст, а не оценка тренировки',en:'Sleep is context, not a workout score'},
      d:{ru:'Несколько плохих ночей подряд могут объяснить падение работоспособности, аппетит и ощущение восстановления.',en:'Several poor nights in a row can explain lower performance, appetite changes and worse recovery.'},
      a:{ru:'Ищи повторяющийся паттерн. Один короткий сон сам по себе не требует менять программу.',en:'Look for a repeated pattern. One short night alone is not a reason to change the programme.'}
    },{compact:true});
    return coachNote({
      t:{ru:'Не меняй план по одному измерению',en:'Never change a plan on a single measurement'},
      d:{ru:'Одна точка на графике почти всегда объясняется водой, солью или содержимым кишечника. Решение принимается по направлению линии за две-три недели.',en:'One point on the chart is almost always water, salt or gut content. Decisions come from the direction of the line over two or three weeks.'},
      a:{ru:'Смотри на среднюю линию — пунктир на графике. Отдельные точки нужны только для того, чтобы её построить.',en:'Watch the dashed average line. Individual points exist only to build it.'}
    },{compact:true});
  }

  function progressChart() {
    var cfg = {
      weight:{unit:t('kg'), digits:1, label:S.lang==='en'?'Weight':'Вес'},
      waist:{unit:t('cm'), digits:1, label:S.lang==='en'?'Waist':'Талия'},
      sleep:{unit:t('hrs'), digits:1, label:S.lang==='en'?'Sleep':'Сон'}
    }[progressMetric] || {unit:t('kg'),digits:1,label:S.lang==='en'?'Weight':'Вес'};
    var field = progressMetric;
    var plotWidth=Math.max(280,Math.min(1000,window.innerWidth-(window.innerWidth<=1024?128:560)));
    var model = progressChartModel(S.diary, field, {width:plotWidth});
    return renderProgressChart(model, {
      label: cfg.label,
      unit: cfg.unit,
      digits: cfg.digits,
      emptyText: S.lang==='en'?'Add at least two entries to see a trend.':'Добавь минимум две записи, чтобы увидеть динамику.',
      legendText: S.lang==='en'?'solid = entries, dashed = rolling average':'сплошная = записи, пунктир = скользящее среднее',
    });
  }

  function renderProgress() {
    var out = $('prog-out');
    if (!out) return;
    if (!S.diary.length) {
      out.innerHTML = S.history.length ? progressIntelligenceHtml() + '<button class="btn btn-solid" type="button" data-v7-route="workout">'+esc(S.lang==='en'?'Open training history':'Открыть историю тренировок')+'</button>' : '<div class="empty"><b>' + esc(t('diaryEmptyT')) + '</b><p>' + esc(t('diaryEmptyD')) + '</p></div>';
      out.setAttribute('data-filled', 'false');
      return;
    }

    var summary = progressSummary(S.diary, S.profile.goal);
    var d7 = summary.weightDelta7Kg, d14 = summary.weightDelta14Kg, d30 = summary.weightDelta30Kg;
    var waist30 = summary.waistDelta30Cm;
    var avg7 = summary.averageWeight7Kg;
    var fmtD = function (v, unit) {
      if (v === null) return '—';
      return (v > 0 ? '+' : '') + v.toFixed(1) + ' ' + unit;
    };

    var st = dashSignal();
    var verdictCopy=v7DiaryConfidence().level==='enough'?t(summary.verdictKey):(S.lang==='en'?'Keep measuring under comparable conditions. There is not enough evidence to adjust the plan yet.':'Продолжай измерения в одинаковых условиях. Данных пока недостаточно для корректировки плана.');
    var html = '<div class="v8-diary-head">' +
        '<p class="eyebrow v8-m0">' + esc(t('diaryTitle')) + '</p>' + signal(st.state, st.label) +
      '</div>' +
      progressChartTabsV10() + progressChart() +
      '<p class="v8-muted-copy">' + esc(verdictCopy) + '</p>' +
      '<div class="prog-deltas">' +
        '<div class="kpi kpi-accent"><span>' + esc(t('diaryAvg7')) + '</span><b>' +
          (avg7 === null ? '—' : avg7.toFixed(1) + ' ' + t('kg')) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('diary7')) + '</span><b>' + esc(fmtD(d7, t('kg'))) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('diary14')) + '</span><b>' + esc(fmtD(d14, t('kg'))) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('diary30')) + '</span><b>' + esc(fmtD(d30, t('kg'))) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('diaryWaist')) + '</span><b>' + esc(fmtD(waist30, t('cm'))) + '</b></div>' +
      '</div>' +
      progressCoachNoteV10() +
      '<div class="prog-log">' + S.diary.slice(0, 30).map(function (d) {
        var bits = [];
        if (typeof d.weight === 'number') bits.push(d.weight.toFixed(1) + ' ' + t('kg'));
        if (typeof d.waist === 'number') bits.push(d.waist.toFixed(1) + ' ' + t('cm'));
        if (typeof d.sleep === 'number') bits.push(d.sleep + ' ' + t('hrs'));
        if (d.lift) bits.push(d.lift);
        return '<div class="prog-row"><span class="num">' + esc(d.date) + '</span>' +
          '<span class="prog-note">' + esc(bits.join(' · ') + (d.note ? ' — ' + d.note : '')) + '</span>' +
          '<button class="btn btn-quiet btn-sm btn-danger" type="button" data-diary-del="' + esc(d.date) + '" aria-label="' + esc(t('diaryDelete')) + '">×</button>' +
          '</div>';
      }).join('') + '</div>';

    out.innerHTML = html;
    out.setAttribute('data-filled', 'true');
  }

  function diaryVerdict(d14, waist30) {
    return t(progressVerdictKey(S.profile.goal, d14, waist30));
  }

  /* ---------- 16.8 БАЗА ЗНАНИЙ ------------------------------------------- */
  var KB_INDEX = null;

  function kbIndex() {
    if (!C) return [];
    if (KB_INDEX) return KB_INDEX;
    KB_INDEX = C.kb.map(function (a) {
      return {
        a: a,
        search: {
          ru: norm([a.t.ru, a.s.ru, a.p.ru.join(' '), a.n ? a.n.ru : ''].join(' ')),
          en: norm([a.t.en, a.s.en, a.p.en.join(' '), a.n ? a.n.en : ''].join(' '))
        }
      };
    });
    return KB_INDEX;
  }

  var KB_CAT_LABEL = {
    training: 'kb.catTraining', technique: 'kb.catTechnique',
    nutrition: 'kb.catNutrition', recovery: 'kb.catRecovery'
  };

  function kbCatLabel(cat) {
    var el = qs('[data-kbcat="' + cat + '"]');
    return el ? el.textContent : cat;
  }

  function kbToolLabel(tool) {
    var map = { library: 'nav.library', workout: 'nav.workout', nutrition: 'nav.nutrition',
      program: 'nav.program', progress: 'nav.progress', contact: 'nav.contact' };
    var key = map[tool];
    if (!key) return '';
    var el = qs('[' + 'data-i18n' + '=\"' + key + '\"]');
    return el ? el.textContent : '';
  }

  function renderKb() {
    var host = $('kb-list');
    if (!host || !C) return;
    var totalChip = $('kb-total-chip');
    if (totalChip) totalChip.textContent = S.lang === 'en' ? (C.kb.length + ' briefings') : (C.kb.length + ' разборов');

    var tokens = S.kbQuery ? norm(S.kbQuery).split(' ').filter(Boolean) : [];
    var list = kbIndex().filter(function (row) {
      if (S.kbCat === 'saved') { if (S.tips.indexOf(row.a.id) === -1) return false; }
      else if (S.kbCat !== 'all' && row.a.cat !== S.kbCat) return false;
      for (var i = 0; i < tokens.length; i++) {
        if (row.search.ru.indexOf(tokens[i]) === -1 && row.search.en.indexOf(tokens[i]) === -1) return false;
      }
      return true;
    });

    if (!list.length) {
      $('kb-count').textContent = t('kbCount', { n: 0, total: 0 });
      host.innerHTML = '<div class="kb-empty"><b>' + esc(t('kbEmptyT')) + '</b><p>' + esc(t('kbEmptyD')) + '</p></div>';
      return;
    }

    var visibleCount = Math.max(1, Math.min(Number(S.kbVisible) || 12, list.length));
    $('kb-count').textContent = t('kbCount', { n: visibleCount, total: list.length });
    var visibleList = list.slice(0, visibleCount);
    host.innerHTML = visibleList.map(function (row) {
      var a = row.a;
      var saved = S.tips.indexOf(a.id) !== -1;
      var practice = L(a.p);
      return '<details class="kb-item" id="kb-' + esc(a.id) + '">' +
        '<summary class="kb-sum">' +
          '<span class="kb-cat">' + esc(kbCatLabel(a.cat)) + '</span>' +
          '<span class="kb-t">' + esc(L(a.t)) + '<span>' + esc(L(a.s)) + '</span></span>' +
          '<span class="kb-plus" aria-hidden="true"></span>' +
        '</summary>' +
        '<div class="kb-body">' +
          '<div><p class="kb-label">' + esc(t('kbPractice')) + '</p>' +
          '<ul class="kb-practice">' + practice.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
          (a.n ? coachNote({ t: null, d: a.n, a: null, w: null }, { compact: true }) : '') +
          '<div class="kb-foot">' +
            '<button class="btn btn-quiet btn-sm" type="button" data-kbsave="' + esc(a.id) + '" aria-pressed="' + saved + '">' +
              esc(saved ? t('kbUnsave') : t('kbSave')) + '</button>' +
            (a.tool ? '<button class="btn btn-quiet btn-sm" type="button" data-kbtool="' + esc(a.tool) + '">' +
              esc(t('kbOpenTool', { v: kbToolLabel(a.tool) })) + '</button>' : '') +
          '</div>' +
        '</div>' +
      '</details>';
    }).join('') + (visibleCount < list.length ?
      '<div class="kb-load-row"><div><b>' + esc(S.lang === 'en' ? (visibleCount + ' of ' + list.length) : (visibleCount + ' из ' + list.length)) + '</b><span>' + esc(S.lang === 'en' ? 'Only a compact selection is shown to keep the page scannable.' : 'Показываем материалы порциями, чтобы раздел оставался компактным.') + '</span></div><button class="btn btn-solid" type="button" data-kbmore>' + esc(S.lang === 'en' ? 'Show 12 more' : 'Показать ещё 12') + '</button></div>' : '');
  }

  /* ---------- 16.9 ЗАЯВКА: ДВА УРОВНЯ ------------------------------------ */
  var LEAD_GOAL_TEXT = {
    fat: { ru: 'снизить жир', en: 'lose fat' },
    muscle: { ru: 'набрать мышцы', en: 'build muscle' },
    strength: { ru: 'увеличить силу', en: 'increase strength' },
    program: { ru: 'составить программу', en: 'get a programme' },
    nutrition: { ru: 'разобраться с питанием', en: 'sort out nutrition' },
    'return': { ru: 'вернуться после перерыва', en: 'come back after a break' },
    other: { ru: 'обсудить задачу', en: 'discuss my goal' }
  };
  var leadGoal = '';

  function renderLeadGoals() {
    qsa('#l-goal [data-goal]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.goal === leadGoal));
    });
  }

  function validateLeadQuick() {
    var ok = true;
    var name = $('l-name').value.trim();
    var contact = $('l-contact').value.trim();
    if (!name) { setFieldError('l-name', t('errRequired')); ok = false; } else setFieldError('l-name', '');
    if (contact.length < 3) { setFieldError('l-contact', t('errContact')); ok = false; } else setFieldError('l-contact', '');
    if (!leadGoal) { setFieldError('l-goal', t('errPickGoal')); ok = false; } else setFieldError('l-goal', '');
    if (!ok) showToast(t('formHasErrors'));
    return ok;
  }

  function leadMessage() {
    var lines = [];
    var greet = S.lang === 'en' ? 'Hi Pavel. My name is ' : 'Павел, привет. Меня зовут ';
    lines.push(greet + $('l-name').value.trim() + '.');
    lines.push((S.lang === 'en' ? 'Goal: ' : 'Цель: ') + L(LEAD_GOAL_TEXT[leadGoal] || LEAD_GOAL_TEXT.other) + '.');

    var extra = [
      ['l-exp', t('lead.exp')], ['l-format', t('lead.format')], ['l-start', t('lead.start')],
      ['l-schedule', t('lead.schedule')], ['l-limits', t('lead.limits')],
      ['l-nutrition', t('lead.nutrition')], ['l-tried', t('lead.tried')], ['l-when', t('lead.when')]
    ];
    extra.forEach(function (pair) {
      var el = $(pair[0]);
      if (!el) return;
      var val = el.tagName === 'SELECT'
        ? (el.value ? el.selectedOptions[0].textContent : '')
        : el.value.trim();
      if (val) lines.push(pair[1] + ': ' + val + '.');
    });

    lines.push('');
    lines.push((S.lang === 'en' ? 'Contact: ' : 'Контакт: ') + $('l-contact').value.trim());
    lines.push('markovmade.com/gym');
    return lines.join('\n');
  }

  function submitLead() {
    if (!validateLeadQuick()) return;
    var text = leadMessage();
    track('lead_prepared', { goal: leadGoal, detailed: $('lead-more').open });
    copyText(text, t('leadCopied'));
    var win = window.open(TELEGRAM, '_blank', 'noopener,noreferrer');
    track('telegram_opened', { from: 'form' });

    $('lead-result').innerHTML =
      '<div class="note"><b>' + esc(t('leadReadyT')) + '</b> ' + esc(t('leadReadyD')) + '</div>' +
      '<ol class="modal-steps v8-mt-3">' +
        '<li><span>' + esc(t('leadStep1')) + '</span></li>' +
        '<li><span>' + esc(t('leadStep2')) + '</span></li>' +
        '<li><span>' + esc(t('leadStep3')) + '</span></li>' +
      '</ol>' +
      '<div class="data-tools v8-mt-3">' +
        '<button class="btn btn-solid btn-sm" type="button" id="lead-recopy">' + esc(t('leadRecopy')) + '</button>' +
        '<a class="btn btn-quiet btn-sm" href="' + esc(TELEGRAM) + '" target="_blank" rel="noopener noreferrer">' + esc(t('leadOpenTg')) + '</a>' +
      '</div>';
    $('lead-recopy').addEventListener('click', function () { copyText(text); });
    if (!win) showToast(t('leadPopup'));
  }

  /* ---------- 16.10 БЫСТРАЯ ЗАЯВКА (bottom sheet) ------------------------ */
  function renderAsks(hostId) {
    var host = $(hostId);
    if (!host || !C) return;
    host.innerHTML = C.asks.map(function (a) {
      return '<button class="pill" type="button" data-ask="' + esc(a.id) + '">' + esc(L(a.l)) + '</button>';
    }).join('');
  }

  function openSheet(askId) {
    renderAsks('sheet-asks');
    var msg = $('sheet-msg');
    if (askId) {
      var ask = C.asks.filter(function (a) { return a.id === askId; })[0];
      if (ask) msg.value = L(ask.m);
    } else if (!msg.value) {
      msg.value = defaultAskText();
    }
    openOverlay($('lead-sheet'), msg);
    $('lead-sheet').setAttribute('aria-hidden', 'false');
    track('quick_lead_opened', {});
  }

  function defaultAskText() {
    var bits = [S.lang === 'en' ? 'Hi Pavel.' : 'Павел, привет.'];
    if (S.profile.goal) {
      bits.push((S.lang === 'en' ? 'My goal is ' : 'Моя цель — ') + L(consoleLabel('goal', S.profile.goal)) + '.');
    }
    if (S.profile.days) {
      bits.push(S.lang === 'en'
        ? 'I train ' + S.profile.days + ' days a week.'
        : 'Тренируюсь ' + S.profile.days + ' раза в неделю.');
    }
    return bits.join(' ');
  }

  function sendSheet() {
    var text = $('sheet-msg').value.trim();
    if (!text) { showToast(t('sheetEmpty')); return; }
    copyText(text, t('leadCopied'));
    window.open(TELEGRAM, '_blank', 'noopener,noreferrer');
    track('lead_prepared', { source: 'sheet' });
    track('telegram_opened', { from: 'sheet' });
    showToast(t('sheetSent'));
  }

  /* ---------- 16.11 УПРАВЛЕНИЕ ДАННЫМИ ----------------------------------- */
  var DATA_KEYS = ['fav', 'workout', 'lang', 'theme', 'density', 'profile', 'meta', 'history', 'customExercises', 'diary', 'nutritionLog', 'kbju', 'tips', 'coach', 'rest', 'plan', 'settings', 'recentSearch', 'recentExercises'];

  function exportAll() {
    var payload = { v: 3, kind: 'mmg-backup', at: new Date().toISOString(), data: {} };
    DATA_KEYS.forEach(function (name) {
      var raw = store.get(K[name]);
      if (raw != null) payload.data[name] = raw;
    });
    return JSON.stringify(payload, null, 2);
  }

  function importAll(raw) {
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { showToast(t('ioBadJson')); return false; }
    if (!parsed || !parsed.data || typeof parsed.data !== 'object') { showToast(t('ioBadShape')); return false; }
    var n = 0;
    DATA_KEYS.forEach(function (name) {
      if (typeof parsed.data[name] === 'string') { store.set(K[name], parsed.data[name]); n++; }
    });
    if (!n) { showToast(t('ioNothing')); return false; }
    showToast(t('ioRestored', { n: n }));
    setTimeout(function () { window.location.reload(); }, 900);
    return true;
  }

  function clearAll() {
    if (!window.confirm(t('dataConfirm'))) return;
    DATA_KEYS.forEach(function (name) { store.remove(K[name]); });
    ['legacyFav', 'legacyWorkout', 'legacyLang', 'legacyTheme'].forEach(function (name) { store.remove(K[name]); });
    showToast(t('dataCleared'));
    setTimeout(function () { window.location.reload(); }, 700);
  }

  function toggleIo(id, value) {
    var area = $(id);
    if (!area) return;
    area.hidden = false;
    area.value = value;
    area.focus();
    area.select();
  }

  /* ---------- 16.12 НАВИГАЦИЯ, FAB, МОБИЛЬНАЯ ПАНЕЛЬ --------------------- */
  function closeNavGroups(except) {
    qsa('.nav-group').forEach(function (g) {
      if (g === except) return;
      g.setAttribute('data-open', 'false');
      var btn = qs('button', g);
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function bindNavGroups() {
    qsa('.nav-group').forEach(function (group) {
      var btn = qs('button', group);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = group.getAttribute('data-open') === 'true';
        closeNavGroups(group);
        group.setAttribute('data-open', String(!open));
        btn.setAttribute('aria-expanded', String(!open));
      });
      group.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeNavGroups(); btn.focus(); }
      });
      group.addEventListener('click', function (e) {
        if (e.target.closest('a')) closeNavGroups();
      });
    });
    document.addEventListener('click', function () { closeNavGroups(); });
  }

  function updateMobileBar() {
    var wbtn = $('mfb-workout');
    if (!wbtn) return;
    wbtn.hidden = S.workout.length === 0;
    $('mfb-wcount').textContent = String(S.workout.length);
  }

  function renderDashIfVisible() {
    if ($('dash') && !$('dash').hidden) renderDash();
  }

  /* ---------- 16.13 ПЕЧАТЬ ----------------------------------------------- */
  function printWorkout() {
    if (!S.workout.length) { showToast(t('workoutEmptyTitle')); return; }
    window.print();
  }

  /* ==========================================================================
     17. СЛОВАРИ НОВОГО СЛОЯ
     Русский по-прежнему берётся из разметки; здесь только английский слой
     и рантайм-строки, которых в разметке нет.
     ====================================================================== */

  /* Рантайм-строки нового слоя. */

  /* ==========================================================================
     18. СВЯЗЫВАНИЕ НОВОГО СЛОЯ
     ====================================================================== */

  /* Единая точка перерисовки всего авторского слоя — вызывается из applyLang. */
  function renderEco(initial) {
    if (!C) return;
    renderConsole();
    renderSystem();
    renderMethod();
    renderCoachLib(S.lastFiltered);
    renderCoachWorkout();
    renderGuides('guides-workout', 'workout');
    renderGuides('guides-nutrition', 'nutrition');
    renderGuides('guides-program', 'program');
    renderGuides('guides-progress', 'progress');
    renderHistory();
    renderKb();
    renderProgress();
    renderAsks('lead-asks');
    renderLeadGoals();
    renderTimer();
    renderAbout();
    updateMobileBar();
    if (!initial) {
      if ($('checkin-out').getAttribute('data-filled') === 'true') { try { runCheckin(); } catch (e) { /* пересчёт не критичен */ } }
    }
  }

  function renderAbout() {
    if (!C) return;
    var a = C.author;
    $('sig-name').textContent = L(a.name);
    $('sig-role').textContent = L(a.role);
    $('about-focus').innerHTML = a.focus.map(function (f) {
      return '<span class="meta-tag">' + esc(L(f)) + '</span>';
    }).join('');

    // Реальное фото подставляется, только если путь заполнен в конфигурации.
    var media = $('about-media');
    if (a.photo) {
      media.innerHTML = '<img src="' + esc(a.photo) + '" alt="' + esc(L(a.photoAlt)) +
        '" loading="lazy" decoding="async">';
    }
  }

  /* Плавающие элементы: FAB на desktop, панель действий на mobile. */
  function syncFloating() {
    var past = window.pageYOffset > 700;
    var fab = $('fab');
    if (fab) fab.setAttribute('data-open', String(past && !MOBILE_MQ.matches));
    if (MOBILE_MQ.matches) $('mfb').setAttribute('data-open', String(past));
  }

  function bindEco() {
    /* --- консоль тренера --- */
    qsa('[data-console]').forEach(function (group) {
      group.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-v]');
        if (!btn) return;
        var key = group.dataset.console;
        S.console[key] = S.console[key] === btn.dataset.v ? '' : btn.dataset.v;
        renderConsole();
        track('coach_console_changed', { key: key, value: S.console[key] });
      });
    });
    $('console-out').addEventListener('click', function (e) {
      var edit = e.target.closest('[data-console-edit]');
      if (edit) {
        S.consoleEditing = !S.consoleEditing;
        renderConsole();
        if (S.consoleEditing) {
          var firstEdit = qs('[data-console="goal"] [data-v]');
          if (firstEdit) firstEdit.focus();
        }
        track('coach_console_edit_toggle', { open: S.consoleEditing });
        return;
      }
      var reset = e.target.closest('[data-console-reset]');
      if (reset) {
        S.console = { goal: '', place: '', level: '', time: '' };
  S.consoleEditing = false;
        S.consoleRecommendation = null;
        renderConsole();
        var first = qs('[data-console="goal"] [data-v]');
        if (first) first.focus();
        track('coach_console_reset', {});
        return;
      }
      var copy = e.target.closest('[data-console-copy]');
      if (copy && S.consoleRecommendation) {
        var original = copy.textContent;
        copyText(consoleRecommendationText(S.consoleRecommendation, false),
          L({ ru: 'Рекомендация скопирована', en: 'Recommendation copied' }));
        copy.textContent = L({ ru: 'Скопировано', en: 'Copied' });
        window.setTimeout(function () {
          if (document.body.contains(copy)) copy.textContent = original;
        }, 1800);
        track('coach_console_copied', { cfg: S.console });
      }
    });

    /* --- действия «следующий шаг» из любых блоков --- */
    document.addEventListener('click', function (e) {
      var act = e.target.closest('[data-cact]');
      if (!act) return;
      var name = act.dataset.cact;
      if (name === 'resumeRun' || name === 'startRun') { openRun(); return; }
      if (name === 'planDay') { startPlanDayV7(Number(act.dataset.cactDay)||0,false); return; }
      if (name === 'profile') { scrollToId('top'); window.setTimeout(function(){var field=qs('.console-opt');if(field)field.focus();},80); return; }
      if (name === 'library') { navigateV7('library',true); return; }
      if (name === 'workout') { scrollToId('workout'); return; }
      if (name === 'progress') { scrollToId('progress'); return; }
      if (name === 'checkin') { scrollToId('progress'); window.setTimeout(function(){var field=$('g-weight');if(field)field.focus();},80); return; }
      if (name === 'nutritionLog') { scrollToId('nutrition'); window.setTimeout(function(){var field=$('nlog-calories');if(field)field.focus();},80); return; }
      applyConsoleAction(name);
    });

    /* --- персональные настройки: редактируются прямо в компактной hero-консоли --- */
    $('dash-edit').addEventListener('click', function () {
      scrollToId('top');
      window.setTimeout(function () {
        var target = qs('[data-console="goal"] [data-v]');
        if (target) target.focus();
      }, REDUCED_MOTION.matches ? 0 : 360);
      track('profile_edit_opened', {});
    });

    /* --- метод --- */
    bindMethod();

    /* --- режим тренера --- */
    $('coach-switch').addEventListener('click', function () {
      S.coachOn = !S.coachOn;
      store.set(K.coach, S.coachOn ? '1' : '0');
      $('coach-switch').setAttribute('aria-pressed', String(S.coachOn));
      renderCoachLib(S.lastFiltered);
      renderCoachWorkout();
      track('coach_mode_toggled', { on: S.coachOn });
    });

    /* --- карточка: причины замены --- */
    $('swap-reasons').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-swap]');
      if (!btn) return;
      S.swapReason = S.swapReason === btn.dataset.swap ? '' : btn.dataset.swap;
      renderSwapReasons();
      renderSwapList();
    });
    $('swap-list').addEventListener('click', function (e) {
      var open = e.target.closest('[data-open]');
      if (open) openExercise(open.dataset.open, open);
    });
    // раскрытие «почему» фиксируется во внутреннем событийном слое
    document.addEventListener('toggle', function (e) {
      if (e.target.classList && e.target.classList.contains('cnote-why') && e.target.open) {
        track('coach_tip_opened', {});
      }
    }, true);

    /* --- тренировка: мета --- */
    ['w-name', 'w-date', 'w-note'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        S.meta.name = $('w-name').value.slice(0, 80);
        S.meta.date = $('w-date').value.slice(0, 10);
        S.meta.note = $('w-note').value.slice(0, 600);
        saveMeta();
      });
    });

    /* --- таймер отдыха --- */
    qs('#timer .timer-presets').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-rest]');
      if (!btn) return;
      S.rest = Number(btn.dataset.rest);
      store.set(K.rest, String(S.rest));
      if (!restTimer.running) restTimer.left = S.rest;
      renderTimer();
    });
    $('timer-toggle').addEventListener('click', function () {
      if (restTimer.running) stopTimer(); else startTimer(restTimer.left || S.rest);
    });
    $('timer-skip').addEventListener('click', function () { restTimer.left = 0; stopTimer(); $('timer').classList.remove('is-done'); renderTimer(); });

    /* --- режим выполнения --- */
    $('w-run').addEventListener('click', openRun);
    $('run-close').addEventListener('click', function () { closeOverlay($('run'), $('w-run')); });
    qs('[data-close="run"]').addEventListener('click', function () { closeOverlay($('run'), $('w-run')); });
    $('run-next').addEventListener('click', runNext);
    $('run-prev').addEventListener('click', runPrev);
    $('run-rest').addEventListener('click', function () { startTimer(S.rest); });
    $('run-stage').addEventListener('input', function (e) {
      var field=e.target.closest('[data-run-field]');if(!field)return;
      var item=S.workout[runState.ex];if(!item)return;
      var name=field.dataset.runField,value=String(field.value||'').slice(0,name==='reps'?24:(name==='note'?500:40));
      var log=ensureSetLog(item),set=log[Math.max(0,runState.set-1)];if(set)set[name]=value;
      if(name==='reps'||name==='weight')item[name]=value;
      saveWorkout();saveRunSession();
    });
    $('run-stage').addEventListener('change', function (e) {
      var item = S.workout[runState.ex];
      if (!item) return;
      var type = e.target.closest('[data-run-set-type]');
      if (type) {
        var typeLog=ensureSetLog(item),typeSet=typeLog[Math.max(0,runState.set-1)];
        if(typeSet)typeSet.type=String(type.value||'working').slice(0,12);
        saveWorkout(); saveRunSession(); return;
      }
      var field = e.target.closest('[data-run-field]');
      if (!field) return;
      saveCurrentSetDraft();
    });
    $('run-stage').addEventListener('click', function (e) {
      var adjust=e.target.closest('[data-run-adjust]');if(adjust){adjustRunField(adjust.dataset.runAdjust,Number(adjust.dataset.direction)||1);return;}
      if(e.target.closest('[data-run-add-set]')){addRunSet();return;}
      if(e.target.closest('[data-run-remove-set]')){removeRunSet();return;}
      if(e.target.closest('[data-run-undo]')){undoRunSet();return;}
      var jump=e.target.closest('[data-run-set]'); if(jump){saveCurrentSetDraft();runState.set=Math.max(1,Number(jump.dataset.runSet)||1);saveRunSession();renderRun();return;}
      var reuse=e.target.closest('[data-run-copy-prev]'); if(reuse){reusePreviousRunResult();return;}
      var open = e.target.closest('[data-run-open]');
      if (open) { openExercise(open.dataset.runOpen, open); return; }
      if (e.target.closest('[data-run-skip]')) { saveCurrentSetDraft(); runState.ex++; runState.set = 1; saveRunSession(); renderRun(); }
    });
    $('run-stage').addEventListener('focusin', function(e){ var field=e.target.closest('[data-run-field]'); if(field&&typeof field.select==='function') window.setTimeout(function(){try{field.select();}catch(_e){}},0); });

    /* --- завершение, печать, экспорт --- */
    $('w-finish').addEventListener('click', finishWorkout);
    $('w-print').addEventListener('click', printWorkout);
    $('w-export').addEventListener('click', function () { toggleIo('w-io', workoutJson()); showToast(t('copied')); });
    $('w-import').addEventListener('click', function () {
      var area = $('w-io');
      if (area.hidden || !area.value.trim()) { area.hidden = false; area.value = ''; area.focus(); return; }
      importWorkoutJson(area.value);
    });

    /* --- история --- */
    $('hist').addEventListener('click', function (e) {
      if (e.target.closest('[data-history-more]')) { historyVisibleCount += 20; renderHistory(); return; }
      var detail=e.target.closest('[data-hist-detail]');
      if(detail){var panel=$(detail.getAttribute('aria-controls'));var open=detail.getAttribute('aria-expanded')==='true';detail.setAttribute('aria-expanded',String(!open));detail.textContent=open?t('histDetails'):t('histHideDetails');if(panel)panel.hidden=open;return;}
      var rep = e.target.closest('[data-hist-repeat]');
      if (rep) { repeatWorkout(rep.dataset.histRepeat); return; }
      var del = e.target.closest('[data-hist-del]');
      if (del) {
        S.history = S.history.filter(function (h) { return h.id !== del.dataset.histDel; });
        saveHistory(); renderHistory(); renderDashIfVisible();
      }
    });
    $('history-filters').addEventListener('input', updateHistoryFilterState);
    $('history-filters').addEventListener('change', updateHistoryFilterState);

    /* --- недельная сверка --- */
    $('checkin-form').addEventListener('submit', function (e) { e.preventDefault(); runCheckin(); });

    /* --- план: ограничения и редактирование --- */
    $('p-limits').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-limit]');
      if (!btn) return;
      toggleInArray(S.planLimits, btn.dataset.limit);
      btn.setAttribute('aria-pressed', String(S.planLimits.indexOf(btn.dataset.limit) !== -1));
    });
    $('plan-out').addEventListener('click', planRowAction);

    /* --- дневник прогресса --- */
    $('prog-form').addEventListener('submit', function (e) { e.preventDefault(); saveDiaryEntry(); });
    $('prog-export').addEventListener('click', function () {
      toggleIo('prog-io', JSON.stringify({ v: 3, kind: 'diary', items: S.diary }, null, 2));
      showToast(t('copied'));
    });
    $('prog-import').addEventListener('click', function () {
      var area = $('prog-io');
      if (area.hidden || !area.value.trim()) { area.hidden = false; area.value = ''; area.focus(); return; }
      var parsed;
      try { parsed = JSON.parse(area.value); } catch (err) { showToast(t('ioBadJson')); return; }
      var items = Array.isArray(parsed) ? parsed : (parsed && parsed.items);
      if (!Array.isArray(items)) { showToast(t('ioBadShape')); return; }
      var clean = items.filter(function (d) { return d && typeof d.date === 'string'; }).map(function (d) {
        return {
          date: d.date.slice(0, 10),
          weight: typeof d.weight === 'number' ? d.weight : null,
          waist: typeof d.waist === 'number' ? d.waist : null,
          recovery:typeof d.recovery==='number'?d.recovery:null,
          sleep:typeof d.sleep==='number'?d.sleep:null,
          mood:Number(d.mood)||3,hunger:Number(d.hunger)||2,fatigue:Number(d.fatigue)||2,
          lift: String(d.lift || '').slice(0, 80), note: String(d.note || '').slice(0, 400)
        };
      });
      if (!clean.length) { showToast(t('ioNothing')); return; }
      S.diary = cleanMeasurementsFn(clean.sort(function (a, b) { return a.date < b.date ? 1 : -1; }));
      saveDiary(); renderProgress(); renderDashIfVisible();
      showToast(t('ioImported', { n: clean.length }));
    });
    $('prog-clear').addEventListener('click', function () {
      if (!S.diary.length) { showToast(t('diaryEmptyT')); return; }
      if (!window.confirm(t('dataConfirm'))) return;
      S.diary = [];
      saveDiary(); renderProgress(); renderDashIfVisible();
    });
    $('prog-out').addEventListener('click', function (e) {
      var metric = e.target.closest('[data-progress-metric]');
      if (metric) {
        progressMetric = metric.dataset.progressMetric;
        renderProgress();
        return;
      }
      var del = e.target.closest('[data-diary-del]');
      if (!del) return;
      S.diary = S.diary.filter(function (d) { return d.date !== del.dataset.diaryDel; });
      saveDiary(); renderProgress(); renderDashIfVisible();
    });

    /* --- база знаний --- */
    $('kb-search').addEventListener('input', debounce(function (e) {
      S.kbQuery = e.target.value;
      S.kbVisible = 12;
      renderKb();
      if (S.kbQuery) track('kb_search', { q: S.kbQuery.length });
    }, 160));
    qs('.kb-cats').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-kbcat]');
      if (!btn) return;
      S.kbCat = btn.dataset.kbcat;
      S.kbVisible = 12;
      qsa('.kb-cats [data-kbcat]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.kbcat === S.kbCat));
      });
      renderKb();
    });
    $('kb-list').addEventListener('click', function (e) {
      var more = e.target.closest('[data-kbmore]');
      if (more) {
        S.kbVisible = (Number(S.kbVisible) || 12) + 12;
        renderKb();
        return;
      }
      var save = e.target.closest('[data-kbsave]');
      if (save) {
        var id = save.dataset.kbsave;
        toggleInArray(S.tips, id);
        saveTips();
        renderKb();
        var item = $('kb-' + id);
        if (item) item.open = true;
        return;
      }
      var tool = e.target.closest('[data-kbtool]');
      if (tool) scrollToId(tool.dataset.kbtool);
    });
    $('kb-list').addEventListener('toggle', function (e) {
      if (e.target.tagName === 'DETAILS' && e.target.open) {
        track('kb_article_opened', { id: e.target.id.replace('kb-', '') });
      }
    }, true);

    /* --- заявка --- */
    $('l-goal').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-goal]');
      if (!btn) return;
      leadGoal = btn.dataset.goal;
      renderLeadGoals();
      setFieldError('l-goal', '');
    });
    $('lead-asks').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-ask]');
      if (btn) openSheet(btn.dataset.ask);
    });
    $('lead-direct').addEventListener('click', function () { track('telegram_opened', { from: 'direct' }); });

    /* --- быстрая заявка (bottom sheet) --- */
    [['fab', 'fab'], ['nav-cta', 'nav'], ['hero-cta-lead', 'hero'], ['about-cta', 'about'], ['mfb-ask', 'mobile']]
      .forEach(function (pair) {
        var el = $(pair[0]);
        if (el) el.addEventListener('click', function () { openSheet(); track('coach_cta', { from: pair[1] }); });
      });
    $('sheet-close').addEventListener('click', function () { closeSheet(); });
    $('sheet-send').addEventListener('click', sendSheet);
    $('sheet-full').addEventListener('click', function () {
      closeSheet();
      scrollToId('contact');
      $('l-name').focus();
    });
    $('sheet-asks').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-ask]');
      if (!btn) return;
      var ask = C.asks.filter(function (a) { return a.id === btn.dataset.ask; })[0];
      if (ask) { $('sheet-msg').value = L(ask.m); $('sheet-msg').focus(); }
    });

    /* --- мобильная панель --- */
    $('mfb-workout').addEventListener('click', function () { scrollToId('workout'); });

    /* --- управление данными --- */
    $('data-export').addEventListener('click', function () { toggleIo('data-io', exportAll()); showToast(t('copied')); });
    $('data-import').addEventListener('click', function () {
      var area = $('data-io');
      if (area.hidden || !area.value.trim()) { area.hidden = false; area.value = ''; area.focus(); return; }
      importAll(area.value);
    });

    /* --- быстрые действия --- */
    document.addEventListener('click', function (e) {
      var qa = e.target.closest('[data-qa]');
      if (!qa) return;
      var name = qa.dataset.qa;
      if (name === 'find') { scrollToLibrary(); $('search').focus(); }
      else if (name === 'workout') scrollToId('workout');
      else if (name === 'kbju') scrollToId('nutrition');
      else if (name === 'ask') openSheet();
      track('quick_action', { name: name });
    });

    /* --- навигационные группы и плавающие элементы --- */
    bindNavGroups();
    window.addEventListener('scroll', syncFloating, { passive: true });
    syncFloating();
  }

  function closeSheet() {
    closeOverlay($('lead-sheet'));
    $('lead-sheet').setAttribute('aria-hidden', 'true');
  }

  /* ---------- 14. ИНИЦИАЛИЗАЦИЯ ------------------------------------------- */
  function migrate() {
    // Избранное
    var fav = store.json(K.fav, null);
    if (!Array.isArray(fav)) {
      var legacy = store.json(K.legacyFav, []);
      fav = Array.isArray(legacy) ? legacy.map(String) : [];
    }
    S.favorites = fav.map(String).filter(function (id) { return !!BY_ID[id]; });
    saveFavorites();
    S.exercisePreferences = cleanExercisePreferences(store.json(K.exercisePreferences, {}));
    saveExercisePreferences();

    // Тренировка
    var workout = store.json(K.workout, null);
    if (!Array.isArray(workout)) {
      var legacyW = store.json(K.legacyWorkout, []);
      workout = Array.isArray(legacyW) ? legacyW.map(function (item) {
        return { id: String(item.id), sets: Number(item.sets) || 3, reps: String(item.reps || '10–12'), weight: String(item.note || ''), done: false };
      }) : [];
    }
    S.workout = workout.filter(function (item) { return item && BY_ID[String(item.id)]; }).map(normalizeWorkoutRecord);
    saveWorkout();
    store.set(K.workoutSchema, '4');
    store.set(K.historySchema, '2');

    // Язык
    var lang = store.get(K.lang) || store.get(K.legacyLang);
    var params = new URLSearchParams(window.location.search);
    if (params.get('lang') === 'en' || params.get('lang') === 'ru') lang = params.get('lang');
    S.lang = lang === 'en' ? 'en' : 'ru';

    // Тема: три проверенных режима; старые значения безопасно сводятся к основной теме.
    var theme = store.get(K.theme) || store.get(K.legacyTheme) || document.documentElement.dataset.theme;
    S.theme = ['obsidian', 'soft', 'ivory'].indexOf(theme) !== -1 ? theme : 'obsidian';
    store.set(K.schema, '3');

    var density = store.get(K.density);
    S.density = ['compact', 'default', 'roomy'].indexOf(density) !== -1 ? density : 'default';

    var q = params.get('q');
    if (q) S.query = q.slice(0, 80);
  }

  function applyTheme() {
    var themes = ['obsidian', 'soft', 'ivory'];
    if (themes.indexOf(S.theme) === -1) S.theme = 'obsidian';
    document.documentElement.setAttribute('data-theme', S.theme);
    document.documentElement.style.colorScheme = S.theme === 'obsidian' ? 'dark' : 'light';
    store.set(K.theme, S.theme);
    var dark = S.theme === 'obsidian';
    qs('#theme-toggle .ico-dark').hidden = !dark;
    qs('#theme-toggle .ico-light').hidden = dark;
    qsa('#theme-switch-m [data-theme]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.theme === S.theme));
    });
    qsa('[data-v7-theme]').forEach(function (b) {
      var active = b.dataset.v7Theme === S.theme;
      b.setAttribute('aria-pressed', String(active));
      var mark = qs('.theme-choice-check', b);
      if (mark) mark.textContent = active ? '✓' : '';
    });
    var colors = { obsidian: '#070A0E', soft: '#EAF0F6', ivory: '#F6F5F1' };
    var labels = {
      obsidian: { ru: 'Тёмная', en: 'Dark' },
      soft: { ru: 'Мягкая', en: 'Soft' },
      ivory: { ru: 'Светлая', en: 'Light' }
    };
    var meta = qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors[S.theme]);
    var next = themes[(themes.indexOf(S.theme) + 1) % themes.length];
    $('theme-toggle').setAttribute('aria-label', (S.lang === 'en' ? 'Switch to ' : 'Переключить на тему: ') + labels[next][S.lang]);
    $('theme-toggle').setAttribute('data-current-theme', S.theme);
    $('theme-toggle').title = labels[S.theme][S.lang];
  }

  function bindGlobalKeys() {
    document.addEventListener('keydown', function (e) {
      handleTrap(e);

      if (e.key === 'Escape') {
        var top = topOverlay();
        if (top) {
          e.preventDefault();
          if (top.el.id === 'modal') closeModal();
          else closeOverlay(top.el);
        }
        return;
      }

      var mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openCmdk();
        return;
      }

      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (typing || mod || e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        $('search').focus();
        $('search').select();
      }
    });
  }

  function openCmdk() {
    $('cmdk-input').value = '';
    renderCmdk('');
    openOverlay($('cmdk'), $('cmdk-input'), { scrim: false });
  }

  function bindHeader() {
    $('nav-burger').addEventListener('click', function () {
      var nav = $('mobile-nav');
      $('nav-burger').setAttribute('aria-expanded', 'true');
      openOverlay(nav, $('nav-close'), {
        scrim: false,
        onClose: function () { $('nav-burger').setAttribute('aria-expanded', 'false'); }
      });
    });
    $('nav-close').addEventListener('click', function () { closeOverlay($('mobile-nav'), $('nav-burger')); });
    $('mobile-nav').addEventListener('click', function (e) {
      if (e.target.closest('a[href^="#"]')) closeOverlay($('mobile-nav'), $('nav-burger'));
    });

    $('theme-toggle').addEventListener('click', function () {
      var themes = ['obsidian', 'soft', 'ivory'];
      S.theme = themes[(themes.indexOf(S.theme) + 1) % themes.length];
      applyTheme();
    });
    qs('#theme-switch-m').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-theme]');
      if (!btn) return;
      S.theme = btn.dataset.theme;
      applyTheme();
    });

    [qs('#lang-switch'), qs('#lang-switch-m'), qs('#v7-language-actions')].forEach(function (group) {
      if (!group) return;
      group.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-lang]');
        if (!btn || btn.dataset.lang === S.lang) return;
        S.lang = btn.dataset.lang;
        applyLang();
      });
    });

    $('cmdk-open').addEventListener('click', openCmdk);
    $('to-top').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth' });
    });
  }

  function customExerciseCopy() {
    return S.lang === 'en' ? {
      kicker:'YOUR MOVEMENT', title:'Create a custom exercise', intro:'The exercise is saved on this device and joins the same Library, workout, plan and history flows. Add only details you know.',
      nameRu:'Name in Russian', nameEn:'Name in English', zone:'Body area', target:'Primary muscle', secondary:'Secondary muscles (optional)', equipment:'Equipment', pattern:'Movement pattern', tracking:'How to track it', laterality:'Sides', compound:'Compound exercise', sets:'Default sets', reps:'Default rep range', rest:'Default rest (seconds)', increment:'Load increment (kg)', notes:'Technique notes (one cue per line)', image:'Optional image (stored on this device)', cancel:'Cancel', save:'Save exercise', choose:'Choose…', customError:'The exercise could not be saved on this device.', imageError:'Choose a PNG, JPEG or WebP image under 2 MB.',
      trackingOptions:{'weight-reps':'Weight + reps','reps-only':'Reps only','duration':'Duration','distance-duration':'Distance + duration','weight-duration':'Weight + duration','assisted-weight':'Assisted weight','bodyweight-added-weight':'Bodyweight + added weight'},
      sideOptions:{bilateral:'Both sides',unilateral:'One side',alternating:'Alternating',none:'Not applicable'},
      patternOptions:{'':'Not specified','horizontal-push':'Horizontal push','horizontal-pull':'Horizontal pull','vertical-push':'Vertical push','vertical-pull':'Vertical pull',squat:'Squat',hinge:'Hip hinge',lunge:'Lunge',carry:'Carry',rotation:'Rotation',flexion:'Flexion',extension:'Extension',locomotion:'Locomotion',other:'Other'}
    } : {
      kicker:'СВОЁ ДВИЖЕНИЕ', title:'Создать упражнение', intro:'Упражнение сохранится на этом устройстве и появится в общей библиотеке, тренировке, программе и истории. Указывай только то, что знаешь.',
      nameRu:'Название на русском', nameEn:'Название на английском', zone:'Зона тела', target:'Основная мышца', secondary:'Вторичные мышцы (необязательно)', equipment:'Оборудование', pattern:'Паттерн движения', tracking:'Как записывать результат', laterality:'Стороны', compound:'Составное упражнение', sets:'Подходы по умолчанию', reps:'Диапазон повторов', rest:'Отдых по умолчанию (сек.)', increment:'Шаг нагрузки (кг)', notes:'Подсказки по технике (каждая с новой строки)', image:'Изображение (необязательно, хранится на устройстве)', cancel:'Отмена', save:'Сохранить упражнение', choose:'Выбрать…', customError:'Не удалось сохранить упражнение на этом устройстве.', imageError:'Выбери PNG, JPEG или WebP до 2 МБ.',
      trackingOptions:{'weight-reps':'Вес + повторы','reps-only':'Только повторы','duration':'Время','distance-duration':'Дистанция + время','weight-duration':'Вес + время','assisted-weight':'Вес с поддержкой','bodyweight-added-weight':'Свой вес + отягощение'},
      sideOptions:{bilateral:'Обе стороны',unilateral:'Одна сторона',alternating:'Попеременно',none:'Не применимо'},
      patternOptions:{'':'Не указан','horizontal-push':'Горизонтальный жим','horizontal-pull':'Горизонтальная тяга','vertical-push':'Вертикальный жим','vertical-pull':'Вертикальная тяга',squat:'Приседание',hinge:'Наклон / тазобедренный шарнир',lunge:'Выпад',carry:'Перенос',rotation:'Вращение',flexion:'Сгибание',extension:'Разгибание',locomotion:'Передвижение',other:'Другое'}
    };
  }

  function renderCustomExerciseForm() {
    var copy=customExerciseCopy();
    $('custom-exercise-kicker').textContent=copy.kicker;
    $('custom-exercise-title').textContent=copy.title;
    $('custom-exercise-intro').textContent=copy.intro;
    var labels={nameRu:copy.nameRu,nameEn:copy.nameEn,zone:copy.zone,target:copy.target,secondary:copy.secondary,equipment:copy.equipment,movementPattern:copy.pattern,trackingType:copy.tracking,laterality:copy.laterality,defaultSets:copy.sets,defaultRepRange:copy.reps,defaultRest:copy.rest,loadIncrement:copy.increment,notes:copy.notes,image:copy.image};
    Object.keys(labels).forEach(function(key){var el=$('custom-'+({'nameRu':'name-ru','nameEn':'name-en','movementPattern':'pattern','trackingType':'tracking','defaultSets':'sets','defaultRepRange':'reps','defaultRest':'rest','loadIncrement':'increment','notes':'notes','image':'image','secondary':'secondary','equipment':'equipment','laterality':'laterality','zone':'zone','target':'target'}[key])+'-label');if(el)el.textContent=labels[key];});
    $('custom-compound-label').textContent=copy.compound;
    $('custom-exercise-cancel').textContent=copy.cancel;
    $('custom-exercise-save').textContent=copy.save;
    function fill(id,rows,placeholder){
      var select=$(id),current=select.multiple?Array.from(select.selectedOptions).map(function(option){return option.value;}):[select.value];
      select.innerHTML=(placeholder?'<option value="">'+esc(copy.choose)+'</option>':'')+rows.map(function(row){return'<option value="'+esc(row.value)+'">'+esc(row.label)+'</option>';}).join('');
      if(select.multiple){Array.from(select.options).forEach(function(option){option.selected=current.indexOf(option.value)!==-1;});}
      else if(rows.some(function(row){return row.value===current[0];}))select.value=current[0];
    }
    fill('custom-zone',ZONES.map(function(value){return{value:value,label:labelZone(value)};}),true);
    fill('custom-target',MUSCLES.map(function(value){return{value:value,label:labelMu(value)};}),true);
    fill('custom-secondary',MUSCLES.map(function(value){return{value:value,label:labelMu(value)};}),false);
    fill('custom-equipment',EQUIPMENT.map(function(value){return{value:value,label:labelEq(value)};}),true);
    fill('custom-pattern',Object.keys(copy.patternOptions).map(function(value){return{value:value,label:copy.patternOptions[value]};}),false);
    fill('custom-tracking',Object.keys(copy.trackingOptions).map(function(value){return{value:value,label:copy.trackingOptions[value]};}),false);
    fill('custom-laterality',Object.keys(copy.sideOptions).map(function(value){return{value:value,label:copy.sideOptions[value]};}),false);
  }

  function openCustomExerciseEditor() {
    var open=function(){
      renderCustomExerciseForm();
      $('custom-exercise-form').reset();
      $('custom-exercise-error').hidden=true;
      renderCustomExerciseForm();
      openOverlay($('custom-exercise-dialog'),$('custom-name-ru'));
    };
    if(DATA_READY)open();
    else ensureData().then(function(ready){if(ready)open();else showToast(S.lang==='en'?'Exercise data is unavailable right now.':'Библиотека упражнений сейчас недоступна.','warn');});
  }

  function readCustomExerciseImage(file) {
    if(!file)return Promise.resolve(null);
    if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>1450000)return Promise.reject(new Error(customExerciseCopy().imageError));
    return new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onload=function(){var value=String(reader.result||'');if(value.length>2000000)reject(new Error(customExerciseCopy().imageError));else resolve(value);};
      reader.onerror=function(){reject(new Error(customExerciseCopy().imageError));};
      reader.readAsDataURL(file);
    });
  }

  function closeCustomExerciseEditor() {
    closeOverlay($('custom-exercise-dialog'),$('custom-exercise-open'));
    $('custom-exercise-form').reset();
    $('custom-exercise-error').hidden=true;
  }

  async function createCustomExerciseFromForm() {
    var form=$('custom-exercise-form'),copy=customExerciseCopy(),data=new FormData(form),now=new Date().toISOString();
    var file=$('custom-image').files&&$('custom-image').files[0];
    var image=await readCustomExerciseImage(file);
    var randomId=window.crypto&&typeof window.crypto.randomUUID==='function'?window.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    var candidate={
      id:'custom-'+randomId,
      nameRu:String(data.get('nameRu')||'').trim(),nameEn:String(data.get('nameEn')||'').trim(),
      zone:String(data.get('zone')||''),target:String(data.get('target')||''),
      secondary:Array.from($('custom-secondary').selectedOptions).map(function(option){return option.value;}),
      equip:String(data.get('equip')||''),movementPattern:String(data.get('movementPattern')||''),
      trackingType:String(data.get('trackingType')||'weight-reps'),laterality:String(data.get('laterality')||'bilateral'),
      compound:$('custom-compound').checked,defaultSets:Number(data.get('defaultSets')),
      defaultRepRange:String(data.get('defaultRepRange')||''),defaultRest:Number(data.get('defaultRest')),
      loadIncrement:Number(data.get('loadIncrement')),notes:String(data.get('notes')||''),image:image,
      createdAt:now,updatedAt:now
    };
    var record=cleanCustomExercises([candidate])[0];
    if(!record)throw new Error(copy.customError);
    databaseCustomExercises=await saveCustomExerciseRecords(databaseCustomExercises.concat([record]));
    var ex=makeCustomExerciseRuntimeRecord(record,EX.length);
    BY_ID[ex.id]=ex;EX.push(ex);
    COUNT_ZONE[ex.zone]=(COUNT_ZONE[ex.zone]||0)+1;COUNT_MU[ex.target]=(COUNT_MU[ex.target]||0)+1;COUNT_EQ[ex.equip]=(COUNT_EQ[ex.equip]||0)+1;
    ZONES=Object.keys(COUNT_ZONE);MUSCLES=Object.keys(COUNT_MU);EQUIPMENT=Object.keys(COUNT_EQ);
    $('stat-total').textContent=String(EX.length);
    $('search').value=exName(ex);S.query=exName(ex);S.zones=[];S.muscles=[];S.equipment=[];S.favOnly=false;S.limit=PAGE;
    renderFilters();renderResults();
    closeCustomExerciseEditor();
    showToast(S.lang==='en'?'Custom exercise saved to your Library.':'Своё упражнение сохранено в библиотеке.','success');
  }

  function bindCustomExerciseEditor() {
    $('custom-exercise-open').addEventListener('click',openCustomExerciseEditor);
    $('custom-exercise-close').addEventListener('click',closeCustomExerciseEditor);
    $('custom-exercise-cancel').addEventListener('click',closeCustomExerciseEditor);
    qs('[data-close="custom-exercise-dialog"]').addEventListener('click',closeCustomExerciseEditor);
    $('custom-exercise-form').addEventListener('submit',function(event){
      event.preventDefault();
      var save=$('custom-exercise-save'),error=$('custom-exercise-error');
      save.disabled=true;error.hidden=true;
      createCustomExerciseFromForm().catch(function(cause){error.textContent=cause&&cause.message?cause.message:customExerciseCopy().customError;error.hidden=false;}).finally(function(){save.disabled=false;});
    });
  }

  function bindLibrary() {
    $('grid').addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-pref-toggle]');
      if (!trigger) return;
      var id = trigger.dataset.prefToggle;
      if (!BY_ID[id]) return;
      var select = document.createElement('select');
      select.className = 'select exercise-preference';
      select.dataset.exercisePreference = id;
      select.setAttribute('aria-label', (S.lang === 'en' ? 'Preference: ' : 'Предпочтение: ') + exName(BY_ID[id]));
      select.innerHTML = EXERCISE_PREFERENCE_VALUES.map(function(value) { return '<option value="' + value + '"' + (exercisePreference(id) === value ? ' selected' : '') + '>' + esc(exercisePreferenceLabel(value)) + '</option>'; }).join('');
      trigger.replaceWith(select);
      select.focus();
    });
    $('grid').addEventListener('change', function (e) {
      var select = e.target.closest('[data-exercise-preference]');
      if (!select) return;
      var id = select.dataset.exercisePreference, value = select.value;
      if (!BY_ID[id] || EXERCISE_PREFERENCE_VALUES.indexOf(value) === -1) return;
      if (value === 'neutral') delete S.exercisePreferences[id]; else S.exercisePreferences[id] = value;
      saveExercisePreferences();
      track('exercise_preference_changed', { exercise: id, preference: value });
      if (value !== 'neutral') showToast(S.lang === 'en' ? 'Preference saved and used in plans and substitutions.' : 'Предпочтение сохранено и учтено в планах и заменах.');
      renderResults();
    });
    var onSearch = debounce(function (value) {
      S.query = value;
      S.limit = PAGE;
      renderResults();
    }, 160);

    $('search').addEventListener('input', function (e) { onSearch(e.target.value); });
    $('search-clear').addEventListener('click', function () {
      $('search').value = '';
      S.query = '';
      S.limit = PAGE;
      renderResults();
      $('search').focus();
    });

    $('hero-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var value = $('hero-search').value.trim();
      var go = function () {
        $('search').value = value;
        S.query = value;
        S.limit = PAGE;
        renderResults();
        scrollToLibrary();
      };
      if (DATA_READY) go(); else ensureData().then(go);
    });

    $('sort').addEventListener('change', function (e) {
      S.sort = e.target.value;
      renderResults();
    });

    qs('#density').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-density]');
      if (!btn) return;
      S.density = btn.dataset.density;
      store.set(K.density, S.density);
      qsa('#density [data-density]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.density === S.density));
      });
      renderResults();
    });

    $('load-more').addEventListener('click', function () {
      S.limit += PAGE;
      renderResults();
    });
    $('show-all').addEventListener('click', function () {
      S.limit = S.lastFiltered.length || EX.length;
      renderResults();
    });

    $('reset-all').addEventListener('click', function () { resetFilters(); });
    $('filters-reset').addEventListener('click', function () { resetFilters(); });
    $('muscles-reset').addEventListener('click', function () { resetFilters(); });

    $('fav-only').addEventListener('click', function () {
      S.favOnly = !S.favOnly;
      S.limit = PAGE;
      renderFilters();
      renderResults();
    });
    $('fav-clear').addEventListener('click', function () {
      if (!S.favorites.length) { showToast(t('favEmptyToast')); return; }
      if (!window.confirm(t('favConfirmClear'))) return;
      S.favorites = [];
      saveFavorites();
      renderResults();
      showToast(t('favCleared'));
    });

    $('equipment-profile-select').addEventListener('change',function(event){activateEquipmentProfile(event.target.value);});
    $('equipment-profile-save').addEventListener('click',function(){saveCurrentEquipmentProfile();});
    $('equipment-profile-delete').addEventListener('click',function(){removeActiveEquipmentProfile();});

    // Делегирование по всем группам фильтров
    qs('.filters-body').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter-kind]');
      if (!btn) return;
      var kind = btn.dataset.filterKind, value = btn.dataset.filterValue;
      if (kind === 'zone') toggleInArray(S.zones, value);
      else if (kind === 'muscle') toggleInArray(S.muscles, value);
      else if (kind === 'equip') { toggleInArray(S.equipment, value); activeEquipmentProfileId=''; store.set(K.equipmentProfileActive,''); renderEquipmentProfileControl(); }
      S.limit = PAGE;
      btn.setAttribute('aria-pressed', String(
        (kind === 'zone' ? S.zones : kind === 'muscle' ? S.muscles : S.equipment).indexOf(value) !== -1
      ));
      renderResults();
    });

    $('active-chips').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-chip-kind]');
      if (!chip) return;
      var kind = chip.dataset.chipKind, value = chip.dataset.chipValue;
      if (kind === 'query') { S.query = ''; $('search').value = ''; }
      else if (kind === 'fav') S.favOnly = false;
      else if (kind === 'zone') toggleInArray(S.zones, value);
      else if (kind === 'muscle') toggleInArray(S.muscles, value);
      else if (kind === 'equip') { toggleInArray(S.equipment, value); activeEquipmentProfileId=''; store.set(K.equipmentProfileActive,''); }
      S.limit = PAGE;
      renderFilters();
      renderResults();
      $('search').focus();
    });

    // Сетка результатов
    $('grid').addEventListener('click', function (e) {
      var reset = e.target.closest('[data-reset-filters]');
      if (reset) { resetFilters(); return; }
      var open = e.target.closest('[data-open]');
      if (open) { openExercise(open.dataset.open, open); return; }
      var fav = e.target.closest('[data-fav]');
      if (fav) { toggleFavorite(fav.dataset.fav); return; }
      var add = e.target.closest('[data-add]');
      if (add) {
        if (inWorkout(add.dataset.add)) removeFromWorkout(add.dataset.add);
        else addToWorkout(add.dataset.add);
      }
    });

    // GIF-превью работают на мыши, стилусе и гибридных/сенсорных устройствах.
    $('grid').addEventListener('pointerover', function (e) {
      var card = e.target.closest('.card');
      if (!card || card.contains(e.relatedTarget)) return;
      var ex = BY_ID[card.dataset.id];
      var img = qs('img', card);
      if (!ex || !img || img.dataset.motion === '1') return;
      img.dataset.still = exStill(ex);
      img.dataset.motion = '1';
      img.dataset.mediaFailed = '';
      img.setAttribute('data-ex-media', '');
      img.src = exMotion(ex);
    });
    $('grid').addEventListener('pointerout', function (e) {
      var card = e.target.closest('.card');
      if (!card || card.contains(e.relatedTarget)) return;
      var img = qs('img', card);
      if (!img || img.dataset.motion !== '1') return;
      img.dataset.motion = '0';
      img.src = img.dataset.still;
    });

    // Мобильная панель фильтров
    var openFilters = function () {
      openOverlay($('filters'), $('filters-close'));
    };
    $('mfb-open').addEventListener('click', openFilters);
    $('filters-close').addEventListener('click', function () { closeOverlay($('filters'), $('mfb-open')); });
    $('filters-apply').addEventListener('click', function () { closeOverlay($('filters'), $('mfb-open')); });
    $('scrim').addEventListener('click', function () {
      var top = topOverlay();
      if (top) closeOverlay(top.el);
    });

    // Пресеты и разделы по мышцам
    document.addEventListener('click', function (e) {
      var preset = e.target.closest('[data-preset]');
      if (preset) { applyPreset(preset.dataset.preset); return; }
      var zone = e.target.closest('[data-zone]');
      if (zone) {
        resetFilters(false);
        S.zones = [zone.dataset.zone];
        renderFilters(); renderResults(); scrollToLibrary();
        return;
      }
      var zoneMuscle = e.target.closest('[data-zone-muscle]');
      if (zoneMuscle) {
        resetFilters(false);
        S.muscles = [zoneMuscle.dataset.zoneMuscle];
        renderFilters(); renderResults(); scrollToLibrary();
      }
    });
  }

  function bindModal() {
    $('modal-close').addEventListener('click', closeModal);
    qs('[data-close-modal]').addEventListener('click', closeModal);
    $('modal-fav').addEventListener('click', function () { if (S.activeId) toggleFavorite(S.activeId); });
    $('modal-add').addEventListener('click', function () { if (!S.activeId) return; if (inWorkout(S.activeId)) removeFromWorkout(S.activeId); else addToWorkout(S.activeId); });
    $('modal-copy').addEventListener('click', function () {
      var ex = BY_ID[S.activeId];
      if (!ex) return;
      var model = exerciseTechniqueModel(ex);
      var lines = [exName(ex), labelZone(ex.zone) + ' · ' + labelMu(ex.target) + ' · ' + labelEq(ex.equip), ''];
      model.steps.forEach(function (step, i) { lines.push((i + 1) + '. ' + step); });
      lines.push('', detailText('Ключевой ориентир: ', 'Primary cue: ') + (model.cues[0] || model.control));
      lines.push(detailText('Дыхание: ', 'Breathing: ') + model.breathing);
      lines.push(detailText('Амплитуда: ', 'Range: ') + model.range);
      lines.push('', 'markovmade.com/gym');
      copyText(lines.join('\n'));
    });

    $('modal-media-expand').addEventListener('click', toggleModalMedia);
    $('modal-tabs').addEventListener('click', function (e) {
      var button = e.target.closest('[data-modal-jump]');
      if (!button) return;
      var target = $(button.dataset.modalJump);
      if (!target) return;
      setModalTabActive(button.dataset.modalJump);
      target.scrollIntoView({ behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth', block: 'start' });
    });

    var scroll = $('modal-scroll'), tabRaf = 0;
    if (scroll) {
      scroll.addEventListener('scroll', function () {
        if (tabRaf) return;
        tabRaf = requestAnimationFrame(function () {
          tabRaf = 0;
          updateModalTabFromScroll();
        });
      }, { passive: true });
    }

    document.addEventListener('fullscreenchange', syncModalMediaExpandLabel);
    document.addEventListener('keydown', function (e) {
      var frame = $('modal-media');
      if (e.key === 'Escape' && frame && frame.dataset.expanded === 'true') {
        e.preventDefault();
        e.stopImmediatePropagation();
        frame.dataset.expanded = 'false';
        syncModalMediaExpandLabel();
      }
    }, true);
  }

  function bindWorkout() {
    var list = $('workout-list');

    window.addEventListener('mmg:add-warmup', function (event) {
      if (!DATA_READY) {
        ensureData().then(function (ready) { if (ready) window.dispatchEvent(new CustomEvent('mmg:add-warmup', { detail: event.detail })); });
        return;
      }
      var rawSets = event.detail && Array.isArray(event.detail.sets) ? event.detail.sets.slice(0, 8) : [];
      var warmupSets = rawSets.map(function (set) {
        var weight = Number(set && set.weight), reps = Number(set && set.reps);
        return Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0
          ? cleanSetRecord({ weight: weight, reps: reps, type: 'warmup', completed: false }) : null;
      }).filter(Boolean);
      if (!warmupSets.length) return;
      var target = null;
      S.workout.some(function (item) {
        var ex = BY_ID[item.id];
        var tracking = ex && ex.custom ? ex.trackingType : (ex && ex.zone === 'cardio' ? 'duration' : 'weight-reps');
        var log = ensureSetLog(item);
        if (tracking !== 'weight-reps' || log.some(function (set) { return set.completed; })) return false;
        target = { item: item, log: log, name: exName(ex) };
        return true;
      });
      if (!target) {
        showToast(S.lang === 'en' ? 'Add an unstarted weighted exercise to your workout first.' : 'Сначала добавь в тренировку упражнение с весом, которое ещё не начинал.');
        return;
      }
      var count = Math.min(warmupSets.length, 20 - target.log.length);
      if (count < 1) {
        showToast(S.lang === 'en' ? 'There is no room for more sets in this exercise.' : 'В этом упражнении уже достигнут лимит подходов.');
        return;
      }
      target.item.setLog = warmupSets.slice(0, count).concat(target.log).slice(0, 20);
      target.item.sets = target.item.setLog.length;
      target.item.done = false;
      saveWorkout();
      renderWorkout();
      renderResults();
      showToast(S.lang === 'en' ? `Warm-up added before ${target.name}.` : `Разминка добавлена перед упражнением «${target.name}».`);
      track('warmup_add', { id: target.item.id, sets: count });
    });

    list.addEventListener('click', function (e) {
      if(e.target.closest('[data-resume-session]')){openRun();return;}
      var item = e.target.closest('.workout-item');
      var open = e.target.closest('[data-open]');
      if (open) { openExercise(open.dataset.open, open); return; }
      if (!item) return;
      var groupAction=e.target.closest('[data-group-create]');
      if(groupAction){
        var start=S.workout.findIndex(function(row){return row.id===item.dataset.id;}),type=groupAction.dataset.groupCreate,count=type==='superset'?2:3;
        var members=S.workout.slice(start,start+count);
        if(start<0||members.length!==count||members.some(function(row){return row.groupId||ensureSetLog(row).some(function(set){return set.completed;});})){showToast(S.lang==='en'?'This group needs enough adjacent, unstarted exercises.':'Для группы нужны соседние упражнения, которые ещё не начинались.');return;}
        var groupId='group-'+Date.now().toString(36)+'-'+start;
        members.forEach(function(row){row.groupId=groupId;row.groupType=type;});saveWorkout();renderWorkout();showToast(S.lang==='en'?'Exercise group saved.':'Группа упражнений сохранена.');return;
      }
      if(e.target.closest('[data-group-clear]')){var groupId=item.groupId;if(groupId)S.workout.forEach(function(row){if(row.groupId===groupId){row.groupId='';row.groupType='';}});saveWorkout();renderWorkout();showToast(S.lang==='en'?'Exercises ungrouped.':'Упражнения разделены.');return;}
      var move = e.target.closest('[data-move]');
      if (move) { moveInWorkout(item.dataset.id, Number(move.dataset.move)); return; }
      if (e.target.closest('[data-remove]')) removeFromWorkout(item.dataset.id);
    });

    list.addEventListener('change', function (e) {
      var field = e.target.closest('[data-field]');
      var item = e.target.closest('.workout-item');
      if (!field || !item) return;
      var record = S.workout.find(function (w) { return w.id === item.dataset.id; });
      if (!record) return;
      var name = field.dataset.field;
      if (name === 'sets') { record.sets=clamp(Number(field.value)||1,1,20); ensureSetLog(record); }
      else if (name === 'done') { ensureSetLog(record).forEach(function(set){set.completed=field.checked;if(field.checked){if(!set.reps)set.reps=String(record.reps||'').slice(0,24);if(!set.weight)set.weight=String(record.weight||'').slice(0,40);if(!set.completedAt)set.completedAt=Date.now();}else set.completedAt=0;});record.done=field.checked;item.setAttribute('data-done',String(record.done)); }
      else record[name] = String(field.value).slice(0, 40);
      saveWorkout();
      if (name === 'sets' || name === 'done') renderWorkout();
    });

    $('w-copy').addEventListener('click', function () {
      if (!S.workout.length) { showToast(t('workoutEmptyTitle')); return; }
      copyText(workoutText());
    });
    $('w-share').addEventListener('click', function () {
      if (!S.workout.length) { showToast(t('workoutEmptyTitle')); return; }
      shareOrCopy(t('wTitle'), workoutText());
    });
    $('w-clear').addEventListener('click', function () {
      if (!S.workout.length) { showToast(t('workoutEmptyTitle')); return; }
      if (!window.confirm(t('wConfirmClear'))) return;
      S.workout=[]; store.remove(K.runSession); S.runSession=null; runState={ex:0,set:1,startedAt:0,saved:false};
      saveWorkout();
      renderWorkout();
      renderResults();
      showToast(t('wCleared'));
    });
  }

  function renderNutritionLog() {
    var host = $('nutrition-log-list');
    if (!host) return;
    var rows = cleanNutritionDays(databaseNutritionDays).slice(0, 14);
    if (!rows.length) {
      host.innerHTML = '<p class="small">' + esc(t('nutritionLog.empty')) + '</p>';
      return;
    }
    host.innerHTML = rows.map(function (row) {
      var day = new Intl.DateTimeFormat(S.lang==='en'?'en-GB':'ru-RU').format(new Date(row.date+'T00:00:00'));
      var grams = t('nutritionLog.gramUnit');
      var weight = row.weightKg == null ? '' : ' · ' + esc(row.weightKg) + ' ' + esc(t('kg'));
      var macros = [row.fat == null ? '' : esc(row.fat) + ' ' + esc(grams) + ' ' + esc(t('nutritionLog.fatLabel')), row.carbs == null ? '' : esc(row.carbs) + ' ' + esc(grams) + ' ' + esc(t('nutritionLog.carbsLabel'))].filter(Boolean).join(' · ');
      var confidence = row.accuracy === 'accurate' ? t('nutritionLog.accurate') : row.accuracy === 'estimated' ? t('nutritionLog.estimated') : row.accuracy === 'rough' ? t('nutritionLog.rough') : '';
      return '<article class="nutrition-log-row"><div><strong>' + esc(day) + '</strong><span>' + esc(row.calories) + ' ' + esc(t('nutritionLog.calorieUnit')) + ' · ' + esc(row.protein) + ' ' + esc(grams) + ' ' + esc(t('nutritionLog.proteinLabel')) + weight + '</span>' + (macros ? '<small>' + macros + '</small>' : '') + (confidence ? '<small>' + esc(confidence) + '</small>' : '') + (row.note ? '<small>' + esc(row.note) + '</small>' : '') + '</div><button class="btn btn-quiet" type="button" data-nutrition-delete="' + esc(row.date) + '" aria-label="' + esc(t('nutritionLog.delete')) + '">' + esc(t('nutritionLog.delete')) + '</button></article>';
    }).join('');
  }

  function renderWeeklyNutritionBudget() {
    var host = $('nutrition-weekly-budget');
    if (!host) return;
    var budget = weeklyNutritionBudgetFn ? weeklyNutritionBudgetFn(databaseNutritionDays, S.kbjuLast && S.kbjuLast.target, todayISO()) : null;
    if (!budget || budget.status !== 'ok') {
      host.innerHTML = '<p class="small">' + esc(t('nutritionWeek.noTarget')) + '</p>';
      return;
    }
    var number = function (value) { return new Intl.NumberFormat(S.lang==='en'?'en-US':'ru-RU',{maximumFractionDigits:0}).format(value); };
    var difference = budget.difference;
    var signed = (difference > 0 ? '+' : '') + number(difference) + ' ' + (S.lang==='en'?'kcal':'ккал');
    var days = t('nutritionWeek.days',{n:budget.daysLogged});
    host.innerHTML = '<div class="nutrition-week-metrics"><div><span>' + esc(t('nutritionWeek.target')) + '</span><b>' + number(budget.weeklyTarget) + ' ' + (S.lang==='en'?'kcal':'ккал') + '</b></div><div><span>' + esc(t('nutritionWeek.logged')) + '</span><b>' + number(budget.logged) + ' ' + (S.lang==='en'?'kcal':'ккал') + '</b></div><div><span>' + esc(t('nutritionWeek.difference')) + '</span><b class="nutrition-week-difference" data-over="' + String(difference < 0) + '">' + esc(signed) + '</b></div></div><p class="tiny">' + esc(budget.weekStart) + ' — ' + esc(budget.weekEnd) + ' · ' + esc(days) + '</p><p class="tiny">' + esc(t('nutritionWeek.note')) + '</p>';
  }

  function renderNutritionTrend() {
    return renderNutritionTrendView({ $, S, t, esc, weightTrendFn });
  }

  async function saveNutritionDay() {
    var date = $('nlog-date').value || todayISO();
    var calories = Number($('nlog-calories').value), protein = Number($('nlog-protein').value);
    var weightKg = $('nlog-weight').value === '' ? null : Number($('nlog-weight').value);
    var record = cleanNutritionDays([{ date: date, calories: calories, protein: protein,
      fat: $('nlog-fat').value, carbs: $('nlog-carbs').value, weightKg: weightKg,
      accuracy: $('nlog-accuracy').value, note: $('nlog-note').value, updatedAt: new Date().toISOString() }])[0];
    if (!record) { showToast(t('nutritionLog.invalid')); return; }
    try {
      if (historyRepository) await historyRepository.putNutritionDay(record);
      databaseNutritionDays = cleanNutritionDays(databaseNutritionDays.filter(function (row) { return row.date !== date; }).concat([record]));
      store.set(K.nutritionLog, JSON.stringify(databaseNutritionDays));
      renderWeeklyNutritionBudget();
      if (weightKg !== null) {
        var diary = S.diary.filter(function (entry) { return entry.date === date; })[0];
        if (diary) diary.weight = weightKg;
        else S.diary.push({ date: date, weight: weightKg, waist: null, recovery: null, sleep: null, mood: 3, hunger: 3, fatigue: 3, lift: '', note: '' });
        S.diary.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        saveDiary(); renderProgress(); renderDashIfVisible(); renderNutritionTrend();
      }
      renderNutritionLog();
      $('nlog-note').value = '';
      showToast(t('nutritionLog.saved'));
    } catch (error) {
      storageWarnings.push({ key: K.nutritionLog, type: 'indexeddb-write', at: Date.now() });
      try { if (storageOk) window.localStorage.setItem(K.nutritionLog, JSON.stringify(databaseNutritionDays.filter(function (row) { return row.date !== date; }).concat([record]))); } catch (_fallbackError) {}
      showToast(t('nutritionLog.saveFailed'));
    }
  }

  function bindNutritionLog() {
    var form = $('nutrition-log-form');
    if (!form) return;
    $('nlog-date').value = todayISO();
    form.addEventListener('submit', function (event) { event.preventDefault(); saveNutritionDay(); });
    $('nutrition-log-list').addEventListener('click', function (event) {
      var button = event.target.closest('[data-nutrition-delete]');
      if (!button) return;
      var date = button.getAttribute('data-nutrition-delete');
      var remaining = databaseNutritionDays.filter(function (row) { return row.date !== date; });
      var remove = historyRepository ? historyRepository.replaceNutritionDays(remaining) : Promise.resolve();
      remove.then(function () { databaseNutritionDays = remaining; store.set(K.nutritionLog, JSON.stringify(databaseNutritionDays)); renderNutritionLog(); renderWeeklyNutritionBudget(); })
        .catch(function () { try { if (storageOk) window.localStorage.setItem(K.nutritionLog, JSON.stringify(remaining)); } catch (_fallbackError) {} showToast(t('nutritionLog.saveFailed')); });
    });
    renderNutritionLog();
    renderWeeklyNutritionBudget();
    renderNutritionTrend();
  }

  function bindTools() {
    bindNutritionLog();
    $('kbju-form').addEventListener('submit', function (e) { e.preventDefault(); calcKbju(); });
    $('plan-form').addEventListener('submit', function (e) { e.preventDefault(); if (DATA_READY) buildPlan(); else ensureData().then(buildPlan); });

    $('plan-out').addEventListener('click', function (e) {
      var open = e.target.closest('[data-open]');
      if (open) openExercise(open.dataset.open, open);
    });

    $('lead-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitLead();
    });
    ['l-name', 'l-contact'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        if ($(id).value.trim()) setFieldError(id, '');
      });
    });
  }

  function bindCmdk() {
    var input = $('cmdk-input');
    input.addEventListener('input', debounce(function () { renderCmdk(input.value); }, 120));
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCmdk(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveCmdk(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); runCmdk(cmdkIndex); }
    });
    $('cmdk-results').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cmdk-index]');
      if (btn) runCmdk(Number(btn.dataset.cmdkIndex));
    });
    qs('[data-close-cmdk]').addEventListener('click', function () { closeOverlay($('cmdk')); });
  }

  function bindObservers() {
    // Активный раздел в навигации
    var navMap = Object.create(null);
    qsa('#nav-links a').forEach(function (a) { navMap[a.getAttribute('href').slice(1)] = a; });
    var sectionNodes = Object.keys(navMap).map(function (id) { return $(id); }).filter(Boolean);

    if ('IntersectionObserver' in window) {
      var navObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var link = navMap[entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            qsa('#nav-links a').forEach(function (a) { a.removeAttribute('aria-current'); });
            link.setAttribute('aria-current', 'true');
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
      sectionNodes.forEach(function (node) { navObserver.observe(node); });

      // Панель фильтров на мобильном — только пока библиотека в поле зрения
      var libObserver = new IntersectionObserver(function (entries) {
        var visible = entries[0] && entries[0].isIntersecting;
        $('mfb-open').hidden = !visible;
      }, { rootMargin: '-10% 0px -20% 0px', threshold: 0 });
      libObserver.observe($('library'));

      // Мягкое появление секций
      var revealObserver = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add('is-in'); obs.unobserve(entry.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      qsa('.starts, .how-grid').forEach(function (node) {
        node.classList.add('reveal');
        revealObserver.observe(node);
      });
    }

    var onScroll = function () {
      $('to-top').setAttribute('data-open', String(window.pageYOffset > 900));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var syncMobileBar = function () {
      if (!MOBILE_MQ.matches) {
        $('mfb').setAttribute('data-open', 'false');
        var desktopFilters = $('filters');
        if (desktopFilters.getAttribute('data-open') === 'true') closeOverlay(desktopFilters, $('mfb-open'));
        desktopFilters.inert = false;
        desktopFilters.removeAttribute('aria-hidden');
        return;
      }
      var mobileFilters = $('filters');
      if (mobileFilters.getAttribute('data-open') !== 'true') {
        mobileFilters.inert = true;
        mobileFilters.setAttribute('aria-hidden', 'true');
      }
      var box = $('library').getBoundingClientRect();
      $('mfb-open').hidden = !(box.top < window.innerHeight * 0.8 && box.bottom > window.innerHeight * 0.2);
      syncFloating();
    };
    if (MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener('change', syncMobileBar);
    window.addEventListener('resize', debounce(syncMobileBar, 200), { passive: true });
    window.addEventListener('resize', debounce(function(){if(v7RouteFromHash()==='progress')renderProgress();},200), { passive: true });
  }

  function heroPeek() {
    var pool = EX.filter(function (ex) { return ex.score >= 8; });
    var ex = pool[Math.floor(Math.random() * pool.length)];
    if (!ex) return;
    var wrap = $('hero-peek');
    var img = $('hero-peek-img');
    img.src = exStill(ex);
    img.alt = exName(ex);
    $('hero-peek-name').textContent = exName(ex);
    $('hero-peek-meta').textContent = labelMu(ex.target) + ' · ' + labelEq(ex.equip);
    wrap.hidden = false;
    $('hero-peek-open').onclick = function () { openExercise(ex.id, $('hero-peek-open')); };
  }


  function initPremiumPresentation() {
    var clear = $('musnav-clear');
    if (clear && !clear.dataset.bound) {
      clear.dataset.bound = '1';
      clear.addEventListener('click', function () { resetFilters(); renderMuscleBoard(); });
    }

    qsa('[data-body-view]').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var view = btn.dataset.bodyView;
        qsa('[data-body-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        $('bodymap-front').toggleAttribute('hidden', view !== 'front');
        $('bodymap-back').toggleAttribute('hidden', view !== 'back');
      });
    });

    var nav = $('muscle-navigator');
    if (nav && !nav.dataset.bound) {
      nav.dataset.bound = '1';
      nav.addEventListener('click', function (e) {
        var z = e.target.closest('[data-musnav-zone]');
        if (z) {
          var value = z.dataset.musnavZone;
          S.zones = [value]; S.muscles = []; S.limit = PAGE;
          renderMuscleBoard(); renderFilters(); renderResults();
          return;
        }
        var m = e.target.closest('[data-musnav-muscle]');
        if (m) {
          var muscle = m.dataset.musnavMuscle;
          toggleInArray(S.muscles, muscle); S.limit = PAGE;
          renderMuscleBoard(); renderFilters(); renderResults();
          return;
        }
        if (e.target.closest('[data-musnav-open]')) scrollToLibrary();
      });
    }

    function wireFilterSearch(inputId, listId) {
      var input = $(inputId), list = $(listId);
      if (!input || !list || input.dataset.bound) return;
      input.dataset.bound = '1';
      input.addEventListener('input', debounce(function () {
        var q = norm(input.value);
        qsa('.filter-btn', list).forEach(function (b) {
          b.hidden = !!q && norm(b.textContent).indexOf(q) === -1;
        });
      }, 80));
    }
    wireFilterSearch('filter-search-muscle', 'filter-mu');
    wireFilterSearch('filter-search-eq', 'filter-eq');

    var minus = $('timer-minus'), plus = $('timer-plus');
    if (minus && !minus.dataset.bound) {
      minus.dataset.bound = plus.dataset.bound = '1';
      minus.addEventListener('click', function () { restTimer.left = Math.max(0, restTimer.left - 15); renderTimer(); });
      plus.addEventListener('click', function () { restTimer.left = Math.min(1800, restTimer.left + 15); renderTimer(); });
    }
  }


  /* ========================================================================
     19. PRODUCTION V3 ENHANCEMENTS
     ===================================================================== */

  function saveRecentSearch(value) {
    var q = String(value || '').trim();
    if (q.length < 2) return;
    S.recentSearches = [q].concat(S.recentSearches.filter(function (x) { return norm(x) !== norm(q); })).slice(0, 8);
    store.set(K.recentSearch, JSON.stringify(S.recentSearches));
    track('search',{length:q.length});
  }

  function saveRecentExercise(id) {
    if (!BY_ID[id]) return;
    S.recentExercises = [id].concat(S.recentExercises.filter(function (x) { return x !== id; })).slice(0, 8);
    store.set(K.recentExercises, JSON.stringify(S.recentExercises));
  }

  function matchRank(query,label){
    var q=norm(query),s=norm(label);if(!q||!s)return-1;if(s===q)return 120;if(s.indexOf(q)===0)return 90;if(s.split(' ').indexOf(q)!==-1)return 76;if(s.indexOf(' '+q)!==-1)return 64;if(s.indexOf(q)!==-1)return 48;return-1;
  }
  function allTokenRank(query,haystack){var q=norm(query),s=norm(haystack);if(!q||!s)return-1;var tokens=q.split(' ').filter(Boolean);if(!tokens.length||!tokens.every(function(token){return s.indexOf(token)!==-1;}))return-1;var whole=matchRank(q,s);return whole>=0?whole:58+Math.min(18,tokens.length*4);}
  function exerciseDiscoveryRank(ex,query){var q=norm(query);var name=Math.max(matchRank(q,ex.nameRu),matchRank(q,ex.nameEn));var muscle=Math.max(matchRank(q,ex.target),matchRank(q,RU_MU[ex.target]),matchRank(q,EN_MU[ex.target]));var zone=Math.max(matchRank(q,ex.zone),matchRank(q,RU_ZONE[ex.zone]),matchRank(q,EN_ZONE[ex.zone]));var equip=Math.max(matchRank(q,ex.equip),matchRank(q,RU_EQ[ex.equip]),matchRank(q,EN_EQ[ex.equip]));var tokens=allTokenRank(q,ex.search);return Math.max(name>=0?name+80:-1,muscle>=0?muscle+55:-1,zone>=0?zone+40:-1,equip>=0?equip+32:-1,tokens);}

  function discoveryRows(query) {
    var q = norm(query);
    if (!q) {
      return {
        recentSearch: S.recentSearches.slice(0, 4).map(function (v) { return { kind:'query', value:v, label:v, meta:'' }; }),
        recentExercise: S.recentExercises.slice(0, 5).map(function (id) {
          var ex = BY_ID[id];
          return ex ? { kind:'exercise', value:id, label:exName(ex), meta:t('discExerciseMeta',{ muscle:labelMu(ex.target), equipment:labelEq(ex.equip) }) } : null;
        }).filter(Boolean)
      };
    }

    function ranked(values, labelFn, kind, counts, max) {
      return values.map(function (v) {
        var rank = Math.max(matchRank(q, v), matchRank(q, labelFn(v)));
        return rank < 0 ? null : { kind:kind, value:v, label:labelFn(v), count:counts[v] || 0, rank:rank };
      }).filter(Boolean).sort(function (a,b) { return b.rank-a.rank || b.count-a.count; }).slice(0,max);
    }

    var exercises=EX.map(function(ex){var rank=exerciseDiscoveryRank(ex,q);return rank<0?null:{kind:'exercise',value:ex.id,label:exName(ex),meta:t('discExerciseMeta',{muscle:labelMu(ex.target),equipment:labelEq(ex.equip)}),rank:rank+ex.score/20};}).filter(Boolean).sort(function(a,b){return b.rank-a.rank||a.label.localeCompare(b.label);}).slice(0,5);

    return {
      zone: ranked(ZONES,labelZone,'zone',COUNT_ZONE,2),
      muscle: ranked(MUSCLES,labelMu,'muscle',COUNT_MU,3),
      equip: ranked(EQUIPMENT,labelEq,'equip',COUNT_EQ,2),
      exercise: exercises,
      query: [{ kind:'query', value:query, label:t('discSearch',{q:query}), meta:'' }]
    };
  }

  function discoveryMeta(row) {
    if (row.kind === 'zone') return t('discZoneMeta',{n:row.count});
    if (row.kind === 'muscle') return t('discMuscleMeta',{n:row.count});
    if (row.kind === 'equip') return t('discEquipMeta',{n:row.count});
    return row.meta || '';
  }

  function discoveryIcon(kind) {
    return kind === 'zone' || kind === 'muscle' ? miniBodyIcon(kind === 'zone' ? 'chest' : 'upper arms') : premiumIcon(kind === 'equip' ? 'equipment' : kind === 'exercise' ? 'technique' : 'search');
  }

  function renderDiscovery(host, query) {
    if (!host) return [];
    var rows = discoveryRows(query);
    var groups = [];
    function add(title, list) {
      if (!list || !list.length) return;
      groups.push('<div class="discovery-group"><div class="discovery-label"><span>' + esc(title) + '</span><span>' + list.length + '</span></div>' + list.map(function (r) {
        var oid=host.id+'-opt-'+r.kind+'-'+String(r.value).replace(/[^a-zA-Z0-9_-]/g,'-');
        return '<div class="discovery-option" id="'+esc(oid)+'" role="option" tabindex="-1" aria-selected="false" data-disc-kind="'+esc(r.kind)+'" data-disc-value="'+esc(r.value)+'"><span class="discovery-option-icon" aria-hidden="true">'+discoveryIcon(r.kind)+'</span><span class="discovery-option-main"><b>'+esc(r.label)+'</b><span>'+esc(discoveryMeta(r))+'</span></span>'+(r.count?'<span class="discovery-option-count">'+r.count+'</span>':'')+'</div>';
      }).join('') + '</div>');
    }
    add(t('discRecentSearches'), rows.recentSearch);
    add(t('discRecentExercises'), rows.recentExercise);
    add(t('discZones'), rows.zone);
    add(t('discMuscles'), rows.muscle);
    add(t('discEquipment'), rows.equip);
    add(t('discExercises'), rows.exercise);
    if (String(query || '').trim()) add('', rows.query);
    host.innerHTML = groups.length ? groups.join('') : '<div class="discovery-empty">' + esc(t('discNoMatches')) + '</div>';
    host.dataset.open = 'true';
    return qsa('.discovery-option', host);
  }

  function applyDiscovery(kind, value, sourceInput, host) {
    if (host) host.dataset.open = 'false';
    if (kind === 'exercise') {
      saveRecentExercise(value);
      openExercise(value, sourceInput);
      return;
    }
    if (kind === 'query') {
      var q = String(value || '').trim();
      if (sourceInput) sourceInput.value = q;
      $('search').value = q;
      S.query = q;
      saveRecentSearch(q);
    } else {
      S.query = ''; $('search').value = '';
      if (kind === 'zone') { S.zones = [value]; S.muscles = []; }
      if (kind === 'muscle') { S.muscles = [value]; S.zones = []; }
      if (kind === 'equip') { S.equipment = [value]; activeEquipmentProfileId=''; store.set(K.equipmentProfileActive,''); }
    }
    S.limit = PAGE;
    renderFilters(); renderResults();
    scrollToLibrary();
  }

  function bindDiscovery(input, host) {
    if (!input || !host || input.dataset.discoveryBound) return;
    input.dataset.discoveryBound = '1';
    input.setAttribute('role','combobox');
    input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-expanded','false');
    input.setAttribute('aria-controls',host.id);
    var index = -1;
    function show(){if(/^\d{4}$/.test(input.value.trim())){close();return;}var opts=renderDiscovery(host,input.value);index=-1;input.removeAttribute('aria-activedescendant');input.setAttribute('aria-expanded',String(!!opts.length));}
    function close(){host.dataset.open='false';input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');index=-1;}
    input.addEventListener('focus', show);
    input.addEventListener('input', debounce(show,70));
    input.addEventListener('keydown', function(e){
      var opts = qsa('.discovery-option',host);
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!opts.length) return; e.preventDefault();
        index = (index + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        opts.forEach(function(b,i){b.setAttribute('aria-selected',String(i===index));});
        if(opts[index].id)input.setAttribute('aria-activedescendant',opts[index].id);opts[index].scrollIntoView({block:'nearest'});
        return;
      }
      if (e.key === 'Enter' && index >= 0 && opts[index]) {
        e.preventDefault();
        applyDiscovery(opts[index].dataset.discKind,opts[index].dataset.discValue,input,host);
        return;
      }
      if (e.key === 'Enter' && input.value.trim()) saveRecentSearch(input.value.trim());
    });
    input.addEventListener('blur', function(){ window.setTimeout(close,140); });
    host.addEventListener('mousedown', function(e){ e.preventDefault(); });
    host.addEventListener('click', function(e){
      var btn=e.target.closest('[data-disc-kind]'); if(!btn) return;
      applyDiscovery(btn.dataset.discKind,btn.dataset.discValue,input,host);
    });
  }

  function initDiscovery() {
    var heroHost = document.createElement('div'); heroHost.className='discovery'; heroHost.id='hero-discovery'; heroHost.setAttribute('role','listbox'); $('hero-form').appendChild(heroHost);
    var libHost = document.createElement('div'); libHost.className='discovery'; libHost.id='library-discovery'; libHost.setAttribute('role','listbox'); $('search-box').appendChild(libHost);
    bindDiscovery($('hero-search'),heroHost); bindDiscovery($('search'),libHost);
    $('hero-form').addEventListener('submit',function(){ saveRecentSearch($('hero-search').value); });
  }

  function renderFilterResets() {
    [['filter-bp','zone',S.zones],['filter-mu','muscle',S.muscles],['filter-eq','equip',S.equipment]].forEach(function(row){
      var list=$(row[0]); if(!list) return; var details=list.closest('.filter-group'); if(!details) return;
      var btn=qs('[data-filter-reset-kind="'+row[1]+'"]',details);
      if(!btn){ btn=document.createElement('button'); btn.type='button'; btn.className='filter-group-reset'; btn.dataset.filterResetKind=row[1]; details.insertBefore(btn,list); }
      btn.textContent=t('filterClearGroup'); btn.hidden=!row[2].length;
    });
  }

  function initFilterResets() {
    qs('.filters-body').addEventListener('click',function(e){
      var btn=e.target.closest('[data-filter-reset-kind]'); if(!btn) return;
      var k=btn.dataset.filterResetKind; if(k==='zone') S.zones=[]; if(k==='muscle') S.muscles=[]; if(k==='equip') S.equipment=[];
      S.limit=PAGE; renderFilters(); renderResults();
    });
  }

  function decorateUnitInputs() {
    var defs = { 'k-age':t('unitYears'),'k-height':t('cm'),'k-weight':t('kg'),'k-fat':t('unitPercent'),'k-waist':t('cm'),'g-weight':t('kg'),'g-waist':t('cm'),'g-sleep':t('hrs'),'c-prev':t('kg'),'c-now':t('kg') };
    Object.keys(defs).forEach(function(id){
      var input=$(id); if(!input) return; var wrap=input.parentElement;
      if(!wrap.classList.contains('input-unit')){
        var unit=document.createElement('span'); unit.className='input-unit-suffix'; unit.setAttribute('aria-hidden','true');
        var holder=document.createElement('div'); holder.className='input-unit'; input.parentNode.insertBefore(holder,input); holder.appendChild(input); holder.appendChild(unit); wrap=holder;
      }
      var suffix=qs('.input-unit-suffix',wrap); if(suffix) suffix.textContent=defs[id];
    });
  }

  var wizardState = { step:0 };
  function wizardStepTitles(){
    return S.lang==='en'
      ? ['Goal','Experience','Schedule','Environment','Priority','Recovery']
      : ['Цель','Опыт','График','Условия','Приоритет','Восстановление'];
  }
  function renderProgramWizard() {
    return renderProgramWizardView({ $, S, esc, qs, qsa, wizardState, wizardStepTitles });
  }

  function initProgramWizard(){
    var form=$('plan-form');if(!form||$('plan-wizard'))return;
    var grid=qs(':scope > .form-grid',form),adv=qs(':scope > .plan-adv',form),build=$('plan-build');if(!grid||!adv||!build)return;
    var byId={};qsa('.field',form).forEach(function(f){var c=qs('select,input,textarea',f);if(c)byId[c.id]=f;});
    var limits=$('p-limits'),limitField=limits?limits.closest('.field'):null;
    var disclaimer=build.nextElementSibling&&build.nextElementSibling.classList.contains('tiny')?build.nextElementSibling:null;
    var wiz=document.createElement('div');wiz.id='plan-wizard';wiz.className='plan-wizard v7-plan-wizard';
    wiz.innerHTML='<div class="wizard-head"><div class="wizard-progress" aria-hidden="true"><i></i></div><div class="wizard-steps" role="navigation"></div><div class="wizard-summary" id="wizard-summary"></div></div><div class="wizard-panes"></div><div class="wizard-footer"><button class="btn btn-quiet" id="wizard-back" type="button"></button><span class="wizard-step-status" id="wizard-status"></span><button class="btn btn-solid" id="wizard-next" type="button"></button></div>';
    form.insertBefore(wiz,grid);form.classList.add('is-wizard','v7-wizard-form');
    var panes=qs('.wizard-panes',wiz),groups=[['p-goal'],['p-level'],['p-days','p-time'],['p-place','p-style'],['p-focus'],['p-recovery','p-cardio','p-steps','p-avoid','p-block-weeks']];
    groups.forEach(function(ids,i){var pane=document.createElement('div');pane.className='wizard-pane';pane.dataset.step=String(i);var intro=document.createElement('div');intro.className='v7-wizard-intro';intro.innerHTML='<span class="num">'+String(i+1).padStart(2,'0')+' / 06</span><h3>'+esc(wizardStepTitles()[i])+'</h3>';pane.appendChild(intro);var pg=document.createElement('div');pg.className='form-grid';ids.forEach(function(id){if(byId[id])pg.appendChild(byId[id]);});if(i===5&&limitField)pg.appendChild(limitField);pane.appendChild(pg);panes.appendChild(pane);});
    if(adv&&adv.parentNode)adv.remove();if(grid&&grid.parentNode)grid.remove();
    build.classList.add('wizard-build');qs('.wizard-footer',wiz).appendChild(build);if(disclaimer)qsa('.wizard-pane',wiz)[5].appendChild(disclaimer);
    var steps=qs('.wizard-steps',wiz);wizardStepTitles().forEach(function(_,i){var b=document.createElement('button');b.type='button';b.className='wizard-tab';b.dataset.wizardStep=String(i);steps.appendChild(b);});
    function stepValid(step){var ids=groups[step]||[];for(var x=0;x<ids.length;x++){var control=$(ids[x]);if(control&&control.required&&!String(control.value||'').trim()){control.focus();showToast(S.lang==='en'?'Complete this step first.':'Сначала завершите этот шаг.');return false;}}return true;}
    function goToStep(target){target=clamp(Number(target)||0,0,groups.length-1);if(target>wizardState.step){for(var si=wizardState.step;si<target;si++)if(!stepValid(si))return;}wizardState.step=target;renderProgramWizard();var pane=qsa('.wizard-pane',wiz)[wizardState.step];if(pane&&!REDUCED_MOTION.matches)pane.animate([{opacity:.5,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:160,easing:'ease-out'});}
    steps.addEventListener('click',function(e){var b=e.target.closest('[data-wizard-step]');if(b)goToStep(Number(b.dataset.wizardStep));});
    $('wizard-back').addEventListener('click',function(){goToStep(wizardState.step-1);});$('wizard-next').addEventListener('click',function(){if(stepValid(wizardState.step))goToStep(wizardState.step+1);});
    form.addEventListener('change',renderProgramWizard);renderProgramWizard();
  }

  function progressIntelligenceHtml() {
    return progressIntelligenceHtmlView({ S, dashSignal, diaryAvg, diaryDelta, diaryVerdict, esc, premiumIcon, signal, t, totalCompletedHistorySets });
  }

  function workoutSessionHead(){
    if(!S.workout.length) return '';
    var sets=S.workout.reduce(function(sum,w){return sum+(Number(w.sets)||0);},0),doneSets=S.workout.reduce(function(sum,w){return sum+completedSetCount(w);},0);
    var validSession=S.runSession&&Date.now()-Number(S.runSession.startedAt||0)<8*3600000&&doneSets<sets;
    return '<div class="workout-session-head"><div><h3>'+esc(S.meta.name||t('wTitle'))+'</h3><p>'+esc(t('sessionPrepared'))+' · '+S.workout.length+' '+esc(t('sessionExercises'))+' · '+sets+' '+esc(t('sessionSets'))+'</p></div><div class="workout-session-progress">'+doneSets+' / '+sets+' '+esc(t('sessionSets'))+'</div>'+(validSession?'<div class="workout-resume"><span><b>'+esc(t('workoutResume'))+'</b><small>'+esc(t('workoutResumeHint'))+'</small></span><button class="btn btn-solid btn-sm" type="button" data-resume-session>'+esc(t('workoutResume'))+'</button></div>':'')+'<button class="btn btn-primary btn-sm v8-mobile-start" type="button" data-v8-start-run>'+esc(t('continuityStart'))+'</button></div>';
  }

  function addPreviousPerformanceToWorkout(){
    qsa('.workout-item').forEach(function(row){
      var id=row.dataset.id,prev=previousPerformance(id),main=qs('.workout-main',row); if(!main||qs('.workout-previous',main))return;
      var summary='—';
      if(prev){if(Array.isArray(prev.setLog)&&prev.setLog.some(function(x){return x&&x.completed;})){summary=prev.setLog.filter(function(x){return x&&x.completed;}).slice(0,4).map(function(x){return (x.weight?x.weight+'×':'')+(x.reps||'—');}).join(' · ');}else summary=(prev.weight?prev.weight+' · ':'')+prev.sets+'×'+prev.reps;}
      var p=document.createElement('div');p.className='workout-previous';p.innerHTML=premiumIcon('progress')+'<span>'+esc(t('runPrevPerformance'))+': <b>'+esc(summary)+'</b></span>';var fields=qs('.workout-fields',main);if(fields)main.insertBefore(p,fields);
    });
  }

  function ensureMobileRestTimer(){
    if($('mobile-rest-timer')) return; var el=document.createElement('div'); el.id='mobile-rest-timer'; el.className='mobile-rest-timer'; el.setAttribute('role','status'); el.innerHTML='<b id="mobile-rest-clock">0:00</b><button type="button" data-mobile-rest="minus">−15</button><button type="button" data-mobile-rest="toggle">Ⅱ</button><button type="button" data-mobile-rest="plus">+15</button>'; document.body.appendChild(el);
    el.addEventListener('click',function(e){ var b=e.target.closest('[data-mobile-rest]'); if(!b)return; var k=b.dataset.mobileRest; if(k==='minus'){restTimer.left=Math.max(0,restTimer.left-15);renderTimer();} if(k==='plus'){restTimer.left=Math.min(1800,restTimer.left+15);renderTimer();} if(k==='toggle'){if(restTimer.running)stopTimer();else startTimer(restTimer.left||S.rest);} });
  }

  function decorateConsoleIcons(){
    var groupMap={ goal:{fat:'fat',muscle:'muscle',strength:'strength',health:'health'}, place:{gym:'gym',home:'home',mixed:'mixed'}, level:{beginner:'experience',medium:'experience',advanced:'experience'}, time:{'30':'time','50':'time','70':'time'} };
    qsa('[data-console]').forEach(function(group){ var kind=group.dataset.console; qsa('.console-opt[data-v]',group).forEach(function(b){ if(qs('.console-icon',b))return; var span=document.createElement('span'); span.className='console-icon'; span.setAttribute('aria-hidden','true'); span.innerHTML=premiumIcon((groupMap[kind]||{})[b.dataset.v]||'muscle'); b.insertBefore(span,b.firstChild); }); });
  }

  function initBodyMapTooltip(){
    var canvas=qs('.bodymap-canvas'); if(!canvas||canvas.dataset.tipBound)return; canvas.dataset.tipBound='1'; var tip=$('bodymap-hover');
    canvas.addEventListener('pointerover',function(e){var z=e.target.closest('[data-body-zone]'); if(!z||!tip)return; $('bodymap-hover-name').textContent=labelZone(z.dataset.bodyZone); $('bodymap-hover-count').textContent=(COUNT_ZONE[z.dataset.bodyZone]||0)+' '+(S.lang==='en'?'exercises':'упражнений'); tip.dataset.open='true';});
    canvas.addEventListener('pointerout',function(e){var z=e.target.closest('[data-body-zone]'); if(z&&tip)tip.dataset.open='false';});
  }

  function initV3Units(){ decorateUnitInputs(); }

  function countPhrase(n,kind){n=Number(n)||0;if(S.lang==='en')return n+' '+(kind==='exercise'?(n===1?'exercise':'exercises'):(n===1?'set':'sets'));var mod10=n%10,mod100=n%100;if(kind==='exercise')return n+' '+(mod10===1&&mod100!==11?'упражнение':(mod10>=2&&mod10<=4&&(mod100<12||mod100>14)?'упражнения':'упражнений'));return n+' '+(mod10===1&&mod100!==11?'подход':(mod10>=2&&mod10<=4&&(mod100<12||mod100>14)?'подхода':'подходов'));}
  function initBrandFallback(){
    var img=qs('.hero-panel-logo');if(!img||img.dataset.brandFallbackBound)return;img.dataset.brandFallbackBound='1';
    function fallback(){if(img.dataset.brandFallbackShown)return;img.dataset.brandFallbackShown='1';img.hidden=true;img.style.display='none';var box=document.createElement('span');box.className='hero-panel-logo-fallback';box.setAttribute('aria-hidden','true');var src=qs('.brand .brand-mark');if(src)box.appendChild(src.cloneNode(true));else box.textContent='M';img.insertAdjacentElement('afterend',box);}
    img.addEventListener('error',fallback,{once:true});if(img.complete&&img.naturalWidth===0)fallback();
  }
  function ensureContinuityStrip(){
    var strip=$('continuity-strip');if(strip)return strip;strip=document.createElement('div');strip.id='continuity-strip';strip.className='continuity-strip';strip.hidden=true;var anchor=qs('.hero-actions');if(anchor)anchor.insertAdjacentElement('afterend',strip);strip.addEventListener('click',function(e){if(e.target.closest('[data-continuity-run]'))openRun();});return strip;
  }
  function renderContinuityStrip(){
    var strip=ensureContinuityStrip();if(!strip)return;var total=S.workout.reduce(function(sum,w){return sum+(Number(w.sets)||0);},0),done=S.workout.reduce(function(sum,w){return sum+completedSetCount(w);},0);if(!S.workout.length||!total||done>=total){strip.hidden=true;return;}var active=S.runSession&&Date.now()-Number(S.runSession.startedAt||0)<8*3600000;strip.hidden=false;var elapsed=active?fmtClock(Math.max(0,Math.round((Date.now()-Number(S.runSession.startedAt||Date.now()))/1000))):'';var meta=(active?(done+' / '+total+' '+(S.lang==='en'?'sets':'подходов')):countPhrase(total,'set'))+' · '+countPhrase(S.workout.length,'exercise');strip.innerHTML='<span class="continuity-icon" aria-hidden="true">'+premiumIcon('workout')+'</span><div class="continuity-copy"><span>'+esc(active?t('continuityActive'):t('continuityReady'))+'</span><b>'+esc(active?t('continuityResume'):t('continuityStart'))+'</b><small>'+esc(meta)+(active?' · '+esc(t('continuityElapsed',{v:elapsed})):'')+'</small></div><button class="btn btn-solid btn-sm" type="button" data-continuity-run>'+esc(active?t('continuityResume'):t('continuityStart'))+'</button>';
  }
  function ensureMobileAppNav(){
    var nav=$('mobile-app-nav');if(!nav){nav=document.createElement('nav');nav.id='mobile-app-nav';nav.className='mobile-app-nav';document.body.appendChild(nav);}
    nav.setAttribute('aria-label',S.lang==='en'?'Primary navigation':'Основная навигация');var count=S.workout.length?'<span class="mobile-nav-badge">'+S.workout.length+'</span>':'';
    nav.innerHTML='<a href="#home" data-mobile-dest="home">'+premiumIcon('home')+'<span>'+esc(S.lang==='en'?'Today':'Сегодня')+'</span></a><a href="#library" data-mobile-dest="library">'+premiumIcon('search')+'<span>'+esc(S.lang==='en'?'Search':'Поиск')+'</span></a><a href="#workout" data-mobile-dest="workout">'+premiumIcon('workout')+count+'<span>'+esc(S.lang==='en'?'Train':'Тренинг')+'</span></a><a href="#progress" data-mobile-dest="progress">'+premiumIcon('progress')+'<span>'+esc(S.lang==='en'?'Progress':'Прогресс')+'</span></a><a href="#more" data-mobile-dest="more">'+premiumIcon('menu')+'<span>'+esc(S.lang==='en'?'More':'Ещё')+'</span></a>';
    if(typeof applyV7Route==='function')applyV7Route(false);return nav;
  }
  var mobileNavRaf=0;
  function updateMobileAppNavActive(){if(typeof applyV7Route==='function')applyV7Route(false);}
  function scheduleMobileNavActive(){updateMobileAppNavActive();}
  function initVisualViewportGuard(){if(!window.visualViewport||document.body.dataset.viewportGuardBound)return;document.body.dataset.viewportGuardBound='1';function sync(){var vv=window.visualViewport,delta=Math.max(0,window.innerHeight-vv.height),keyboard=delta>140&&Math.abs((vv.scale||1)-1)<.08;document.body.classList.toggle('keyboard-open',keyboard);}window.visualViewport.addEventListener('resize',sync,{passive:true});window.visualViewport.addEventListener('scroll',sync,{passive:true});window.addEventListener('orientationchange',function(){window.setTimeout(sync,180);},{passive:true});sync();}
  function initUltimateExperience(){qsa('[role="dialog"][aria-hidden="true"]').forEach(function(el){el.inert=true;});var filters=$('filters');if(filters){if(MOBILE_MQ.matches){filters.inert=filters.getAttribute('data-open')!=='true';filters.setAttribute('aria-hidden',filters.getAttribute('data-open')==='true'?'false':'true');}else{filters.inert=false;filters.removeAttribute('aria-hidden');}}initBrandFallback();initVisualViewportGuard();ensureContinuityStrip();renderContinuityStrip();ensureMobileAppNav();window.addEventListener('scroll',scheduleMobileNavActive,{passive:true});window.addEventListener('resize',scheduleMobileNavActive,{passive:true});}

  /* Wrapper layer: keeps proven business logic and adds production presentation. */
  var _renderFiltersV3=renderFilters;
  renderFilters=function(){ _renderFiltersV3(); renderFilterResets(); };

  var _renderWorkoutV3=renderWorkout;
  renderWorkout=function(){ _renderWorkoutV3(); var list=$('workout-list'); if(list&&S.workout.length&&!qs('.workout-session-head',list)){ var tmp=document.createElement('div'); tmp.innerHTML=workoutSessionHead(); if(tmp.firstElementChild) list.insertBefore(tmp.firstElementChild,list.firstChild); } addPreviousPerformanceToWorkout(); renderContinuityStrip(); ensureMobileAppNav(); };

  var _renderProgressV3=renderProgress;
  renderProgress=function(){ _renderProgressV3(); var out=$('prog-out'); if(out&&(S.diary.length||S.history.length)&&!qs('.progress-intel',out)){ var box=document.createElement('div'); box.innerHTML=progressIntelligenceHtml(); if(box.firstElementChild) out.insertBefore(box.firstElementChild,qs('.prog-log',out)); } };

  var _renderTimerV3=renderTimer;
  renderTimer=function(){ _renderTimerV3(); ensureMobileRestTimer(); var sticky=$('mobile-rest-timer'); if(sticky){ $('mobile-rest-clock').textContent=fmtClock(restTimer.left); sticky.dataset.open=String(MOBILE_MQ.matches&&(restTimer.running||restTimer.left>0)&&!runOpen()); sticky.classList.toggle('is-raised',!!($('mfb')&&$('mfb').getAttribute('data-open')==='true')); var toggle=qs('[data-mobile-rest="toggle"]',sticky); if(toggle){ toggle.textContent=restTimer.running?'Ⅱ':'▶'; toggle.setAttribute('aria-label',restTimer.running?t('timerPause'):t('timerResume')); } } $('timer-toggle').textContent=restTimer.running?t('timerPause'):(restTimer.left>0&&restTimer.left!==S.rest?t('timerResume'):t('timerStart')); if($('run-rest')) $('run-rest').textContent=restTimer.running?t('run.restLeft',{v:fmtClock(restTimer.left)}):t('run.rest'); };

  var _applyLangV3=applyLang;
  applyLang=function(initial){ _applyLangV3(initial); decorateConsoleIcons(); decorateUnitInputs(); qsa('#kbju-form [data-i18n^=\"ultimate.\"]').forEach(function(el){el.textContent=t(el.getAttribute('data-i18n'));}); if($('plan-wizard'))renderProgramWizard(); renderFilterResets(); if($('bodymap-hover'))$('bodymap-hover').dataset.open='false'; renderContinuityStrip(); ensureMobileAppNav(); };

  var _openExerciseV3=openExercise;
  openExercise=function(id,trigger){ saveRecentExercise(id); return _openExerciseV3(id,trigger); };

  function initProductionV3(){
    decorateConsoleIcons(); initDiscovery(); initFilterResets(); initProgramWizard(); initBodyMapTooltip(); initV3Units(); ensureMobileRestTimer();
    var nav=$('muscle-navigator'); if(nav){ nav.addEventListener('pointerdown',function(e){ var z=e.target.closest('[data-body-zone]'); if(!z)return; e.preventDefault(); var value=z.dataset.bodyZone; S.zones=[value];S.muscles=[];S.limit=PAGE;renderMuscleBoard();renderFilters();renderResults(); }); }
    window.setInterval(updateRunClock,1000);
  }


  /* ========================================================================
     20. PRODUCTION V5 HARDENING
     Correctness -> data integrity -> usability -> accessibility -> performance.
     This layer deliberately preserves the proven V4 business logic and contracts.
     ======================================================================== */
  var APP_VERSION = '2026.10-r72-fitness-os';
  var BACKUP_SCHEMA = 10;
  K.restTimer = 'mmg.restTimer.v2';
  K.lastBackup = 'mmg.lastBackup.v1';
  K.rollbackBackup = 'mmg.backup.rollback.v1';

  /* Search transliteration is additive: original RU/EN names remain the source of truth. */
  var RU_LAT = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ы':'y','э':'e','ю':'yu','я':'ya','ь':'','ъ':''
  };
  function translitRu(value){
    return norm(value).split('').map(function(ch){ return Object.prototype.hasOwnProperty.call(RU_LAT,ch) ? RU_LAT[ch] : ch; }).join('');
  }

  var _exerciseDiscoveryRankV5 = exerciseDiscoveryRank;
  exerciseDiscoveryRank = function(ex, query){
    var base = _exerciseDiscoveryRankV5(ex, query);
    var latinName = matchRank(query, translitRu(ex.nameRu));
    var latinMuscle = matchRank(query, translitRu(RU_MU[ex.target] || ex.target));
    return Math.max(base, latinName >= 0 ? latinName + 80 : -1, latinMuscle >= 0 ? latinMuscle + 55 : -1);
  };

  var _getFilteredV5 = getFiltered;
  getFiltered = function(){
    var out = _getFilteredV5();
    if (S.query && S.sort === 'recommended') {
      var q = S.query;
      out.sort(function(a,b){
        var dr = exerciseDiscoveryRank(b,q) - exerciseDiscoveryRank(a,q);
        return dr || (b.score-a.score) || (a.idx-b.idx);
      });
    }
    return out;
  };

  /* Shareable, non-sensitive library state + reliable Back/Forward restoration. */
  var urlStateRestoring = false;
  var lastUrlSignature = '';
  function validUrlList(raw, allowed){
    if (!raw) return [];
    return raw.split(',').map(function(v){return v.trim();}).filter(function(v,i,a){return allowed.indexOf(v)!==-1 && a.indexOf(v)===i;}).slice(0,12);
  }
  function restoreLibraryStateFromUrl(){
    var params;
    try { params = new URLSearchParams(window.location.search); } catch(e){ return; }
    var q = params.get('q');
    S.query = q ? q.slice(0,80) : '';
    S.zones = validUrlList(params.get('zone'), ZONES);
    S.muscles = validUrlList(params.get('muscle'), MUSCLES);
    S.equipment = validUrlList(params.get('equipment'), EQUIPMENT);
    S.favOnly = params.get('fav') === '1';
    S.limit = PAGE;
  }
  function urlStatePath(){
    try {
      var u = new URL(window.location.href);
      var p = u.searchParams;
      if (S.lang === 'en') p.set('lang','en'); else p.delete('lang');
      if (S.query) p.set('q',S.query.slice(0,80)); else p.delete('q');
      if (S.zones.length) p.set('zone',S.zones.join(',')); else p.delete('zone');
      if (S.muscles.length) p.set('muscle',S.muscles.join(',')); else p.delete('muscle');
      if (S.equipment.length) p.set('equipment',S.equipment.join(',')); else p.delete('equipment');
      if (S.favOnly) p.set('fav','1'); else p.delete('fav');
      return u.pathname + (p.toString() ? '?' + p.toString() : '') + u.hash;
    } catch(e){ return ''; }
  }
  function syncLibraryUrl(mode){
    if (urlStateRestoring || !window.history) return;
    var path = urlStatePath();
    if (!path) return;
    if (path === lastUrlSignature) return;
    try {
      if (mode === 'push' && history.pushState) history.pushState({mmgLibrary:true},'',path);
      else if (history.replaceState) history.replaceState({mmgLibrary:true},'',path);
      lastUrlSignature = path;
    } catch(e){}
  }
  var _migrateV5 = migrate;
  migrate = function(){
    _migrateV5();
    restoreLibraryStateFromUrl();
    lastUrlSignature = urlStatePath();
  };

  /* Deadline-based rest timer: background tabs/screen lock no longer stretch rest periods. */
  function persistRestTimer(){
    if (!restTimer.running && restTimer.left <= 0) { store.remove(K.restTimer); return; }
    store.set(K.restTimer, JSON.stringify({
      v:2, running:!!restTimer.running, left:clamp(Number(restTimer.left)||0,0,1800),
      endsAt:restTimer.running ? Number(restTimer.endsAt||0) : 0,
      savedAt:Date.now()
    }));
  }
  function restoreRestTimer(){
    var saved = store.json(K.restTimer,null);
    if (!saved || typeof saved !== 'object') return;
    var left = clamp(Number(saved.left)||0,0,1800);
    var endsAt = Number(saved.endsAt)||0;
    if (saved.running && endsAt > Date.now()) {
      left = clamp(Math.ceil((endsAt-Date.now())/1000),0,1800);
      restTimer.running = left > 0;
      restTimer.endsAt = endsAt;
    } else {
      restTimer.running = false;
      restTimer.endsAt = 0;
    }
    restTimer.left = left;
    if (!left) store.remove(K.restTimer);
  }
  function finishRestTimer(){
    clearInterval(restTimer.id); restTimer.id=0; restTimer.running=false; restTimer.endsAt=0; restTimer.left=0;
    store.remove(K.restTimer);
    renderTimer();
    var timer=$('timer'); if(timer) timer.classList.add('is-done');
    showToast(t('timerDone'));
    if (navigator.vibrate && document.visibilityState === 'visible') { try { navigator.vibrate(70); } catch(e){} }
  }
  function tickRestTimer(){
    if (!restTimer.running) return;
    var left = Math.max(0,Math.ceil((Number(restTimer.endsAt||0)-Date.now())/1000));
    if (left <= 0) { finishRestTimer(); return; }
    if (left !== restTimer.left) { restTimer.left=left; renderTimer(); }
  }
  stopTimer = function(){
    clearInterval(restTimer.id); restTimer.id=0;
    if (restTimer.running && restTimer.endsAt) restTimer.left=Math.max(0,Math.ceil((restTimer.endsAt-Date.now())/1000));
    restTimer.running=false; restTimer.endsAt=0;
    persistRestTimer(); renderTimer();
  };
  startTimer = function(seconds){
    clearInterval(restTimer.id); restTimer.id=0;
    var sec=clamp(Math.round(Number(seconds)||Number(S.rest)||90),1,1800);
    restTimer.left=sec; restTimer.running=true; restTimer.endsAt=Date.now()+sec*1000;
    var timer=$('timer'); if(timer) timer.classList.remove('is-done');
    persistRestTimer(); renderTimer();
    restTimer.id=window.setInterval(tickRestTimer,250);
    track('rest_timer_started',{sec:sec});
  };
  var _migrateEcoV5 = migrateEco;
  migrateEco = function(){ _migrateEcoV5(); restoreRestTimer(); };

  /* Production backup format: versioned, staged, validated, previewed, rollback-capable. */
  DATA_KEYS=['customExercises','equipmentProfiles','equipmentProfileActive','exercisePreferences','calculatorHistory','fav','workout','lang','theme','density','profile','meta','history','diary','nutritionLog','kbju','tips','coach','rest','recentSearch','recentExercises','runSession','plan','settings','schema','workoutSchema','historySchema'];
  var BACKUP_LABELS = {
    exercisePreferences:{ru:'предпочтения упражнений',en:'exercise preferences'},calculatorHistory:{ru:'история расчётов',en:'calculator history'},nutritionLog:{ru:'дневник питания',en:'nutrition log'},
    customExercises:{ru:'свои упражнения',en:'custom exercises'},equipmentProfiles:{ru:'профили оборудования',en:'equipment profiles'},equipmentProfileActive:{ru:'активный профиль оборудования',en:'active equipment profile'},fav:{ru:'избранное',en:'favorites'},workout:{ru:'тренировка',en:'workout'},lang:{ru:'язык',en:'language'},theme:{ru:'тема',en:'theme'},density:{ru:'плотность сетки',en:'grid density'},profile:{ru:'профиль',en:'profile'},meta:{ru:'данные тренировки',en:'workout meta'},history:{ru:'история',en:'history'},diary:{ru:'дневник прогресса',en:'progress diary'},kbju:{ru:'питание',en:'nutrition'},tips:{ru:'сохранённые материалы',en:'saved knowledge'},coach:{ru:'режим тренера',en:'coach mode'},rest:{ru:'настройка отдыха',en:'rest timer preset'},recentSearch:{ru:'недавние поиски',en:'recent searches'},recentExercises:{ru:'недавние упражнения',en:'recent exercises'},runSession:{ru:'активная сессия',en:'active session'},plan:{ru:'активная программа',en:'active programme'},settings:{ru:'настройки логирования',en:'logging settings'},schema:{ru:'схема данных',en:'schema'},workoutSchema:{ru:'схема тренировки',en:'workout schema'},historySchema:{ru:'схема истории',en:'history schema'}
  };
  function backupLabel(name){var pair=BACKUP_LABELS[name];return pair?(S.lang==='en'?pair.en:pair.ru):name;}
  function jsonValue(raw){ return parseBackupJson(raw); }
  function validateBackupValue(name, raw){
    return validateBackupField(name, raw, {
      exerciseExists: function(id){ return !!BY_ID[id]; }, exerciseLimit: EX.length,
      normalizeWorkoutRecord: normalizeWorkoutRecord, cleanNutritionDays: cleanNutritionDays,
      cleanMeasurements: cleanMeasurementsFn,
      cleanCalculatorResults: cleanCalculatorResultsFn, cleanLoadIncrementOverrides: cleanLoadIncrementOverrides, cleanCustomExercises: cleanCustomExercises,
      cleanEquipmentProfiles: cleanEquipmentProfiles, cleanExercisePreferences: cleanExercisePreferences,
      restorePlan: restorePlanV7, serializePlan: serialisePlanV7, now: Date.now()
    });
  }
  exportAll = function(){
    var payload={app:'markov-made-gym',schemaVersion:BACKUP_SCHEMA,createdAt:new Date().toISOString(),v:BACKUP_SCHEMA,kind:'mmg-backup',appVersion:APP_VERSION,exportedAt:new Date().toISOString(),data:{}};
    DATA_KEYS.forEach(function(name){var raw=name==='history'?JSON.stringify(S.history):(name==='nutritionLog'?JSON.stringify(databaseNutritionDays):(name==='customExercises'?JSON.stringify(databaseCustomExercises):(name==='equipmentProfiles'?JSON.stringify(databaseEquipmentProfiles):store.get(K[name]))));if(raw!=null)payload.data[name]=raw;});
    return JSON.stringify(payload,null,2);
  };
  function analyzeBackup(raw){
    var parsed;
    try{parsed=JSON.parse(raw);}catch(e){return{ok:false,code:'json'};}
    var envelopeError=backupEnvelopeError(parsed,BACKUP_SCHEMA);
    if(envelopeError)return{ok:false,code:envelopeError};
    var staged={},changed=[],invalid=[],temporaryCustomIds=[];
    if(Object.prototype.hasOwnProperty.call(parsed.data,'customExercises')){
      var customRaw=validateBackupValue('customExercises',parsed.data.customExercises);
      if(customRaw===null)invalid.push('customExercises');
      else{
        staged.customExercises=customRaw;
        jsonValue(customRaw).forEach(function(record){
          if(!BY_ID[record.id]){
            BY_ID[record.id]=makeCustomExerciseRuntimeRecord(record,EX.length+temporaryCustomIds.length);
            temporaryCustomIds.push(record.id);
          }
        });
        if(store.get(K.customExercises)!==customRaw)changed.push('customExercises');
      }
    }
    if(Object.prototype.hasOwnProperty.call(parsed.data,'equipmentProfiles')){
      var profilesRaw=validateBackupValue('equipmentProfiles',parsed.data.equipmentProfiles);
      if(profilesRaw===null)invalid.push('equipmentProfiles');
      else{staged.equipmentProfiles=profilesRaw;if(store.get(K.equipmentProfiles)!==profilesRaw)changed.push('equipmentProfiles');}
    }
    DATA_KEYS.forEach(function(name){
      if(name==='customExercises'||name==='equipmentProfiles'||invalid.indexOf(name)!==-1)return;
      if(!Object.prototype.hasOwnProperty.call(parsed.data,name))return;
      var clean=validateBackupValue(name,parsed.data[name]);
      if(clean===null){invalid.push(name);return;}
      staged[name]=clean;
      var currentRaw = name==='nutritionLog' ? JSON.stringify(databaseNutritionDays) : store.get(K[name]);
      if(currentRaw!==clean)changed.push(name);
    });
    if(Object.prototype.hasOwnProperty.call(staged,'equipmentProfileActive')){
      var availableProfiles=Object.prototype.hasOwnProperty.call(staged,'equipmentProfiles')?jsonValue(staged.equipmentProfiles):databaseEquipmentProfiles;
      if(staged.equipmentProfileActive&&!(availableProfiles||[]).some(function(profile){return profile.id===staged.equipmentProfileActive;})){
        staged.equipmentProfileActive='';
        if(changed.indexOf('equipmentProfileActive')===-1&&store.get(K.equipmentProfileActive)!=='')changed.push('equipmentProfileActive');
      }
    }
    temporaryCustomIds.forEach(function(id){delete BY_ID[id];});
    if(!Object.keys(staged).length)return{ok:false,code:'empty'};
    if(invalid.length)return{ok:false,code:'invalid',invalid:invalid};
    return{ok:true,staged:staged,changed:changed,sourceVersion:String(parsed.appVersion||parsed.v||'legacy')};
  }
  function backupPreviewText(report){
    var list=report.changed.slice(0,10).map(function(n){return '• '+backupLabel(n);}).join('\n');
    var collections=['customExercises','equipmentProfiles','workout','history','diary','nutritionLog','calculatorHistory'];
    var summary=collections.map(function(name){var value=jsonValue(report.staged[name]);return Array.isArray(value)?backupLabel(name)+': '+value.length:null;}).filter(Boolean).join(' · ');
    var more=Math.max(0,report.changed.length-10);
    if(S.lang==='en')return 'Backup validated. Changes: '+report.changed.length+'\n'+(summary?'Records: '+summary+'\n':'')+'\n'+(list||'No values differ.')+(more?'\n• +'+more+' more':'')+'\n\nA rollback snapshot will be kept on this device. Import now?';
    return 'Резервная копия проверена. Изменений: '+report.changed.length+'\n'+(summary?'Записи: '+summary+'\n':'')+'\n'+(list||'Значения не отличаются.')+(more?'\n• ещё '+more:'')+'\n\nПеред импортом сохранится локальная точка отката. Импортировать?';
  }
  function writeBackupValues(values){
    var failed=[];
    Object.keys(values).forEach(function(name){
      var raw=values[name];
      if(name==='history'&&historyRepository){
        var parsed=jsonValue(raw);
        raw=JSON.stringify(Array.isArray(parsed)?parsed.slice(0,20):[]);
      }
      if(store.set(K[name],raw)===false)failed.push(name);
    });
    return failed;
  }
  importAll = async function(raw){
    if(!DATA_READY&&!await ensureData()){showToast(S.lang==='en'?'Exercise data is unavailable. Import was not applied; retry when the catalog is available.':'Каталог упражнений недоступен. Импорт не применён; повтори после загрузки каталога.', 'error');return false;}
    var report=analyzeBackup(raw);
    if(!report.ok){
      var msg=report.code==='json'?t('ioBadJson'):report.code==='future'?(S.lang==='en'?'This backup was created by a newer app version.':'Эта копия создана более новой версией приложения.'):(report.code==='invalid'?(S.lang==='en'?'Invalid fields: '+report.invalid.map(backupLabel).join(', ')+'. Current data was not changed.':'Не прошли проверку: '+report.invalid.map(backupLabel).join(', ')+'. Текущие данные не изменены.'):(S.lang==='en'?'Backup validation failed. Current data was not changed.':'Проверка резервной копии не пройдена. Текущие данные не изменены.'));
      showToast(msg); return false;
    }
    if(!report.changed.length){showToast(S.lang==='en'?'Backup is valid; nothing to change.':'Копия корректна; изменений нет.');return true;}
    if(!window.confirm(backupPreviewText(report)))return false;
    var rollback=exportAll(); store.set(K.rollbackBackup,rollback);
    var failed=writeBackupValues(report.staged);
    if(failed.length){
      var rb=analyzeBackup(rollback); if(rb.ok)writeBackupValues(rb.staged);
      showToast(S.lang==='en'?'Import could not be written safely; previous data was restored.':'Не удалось безопасно записать импорт; предыдущие данные восстановлены.');
      return false;
    }
    var importedHistory = report.staged.history ? jsonValue(report.staged.history) : null;
    var importedNutritionDays = report.staged.nutritionLog ? cleanNutritionDays(jsonValue(report.staged.nutritionLog)) : null;
    var importedCustomExercises = report.staged.customExercises ? jsonValue(report.staged.customExercises) : null;
    var importedEquipmentProfiles = report.staged.equipmentProfiles ? jsonValue(report.staged.equipmentProfiles) : null;
    var importedExercisePreferences = report.staged.exercisePreferences ? cleanIdbExercisePreferences(jsonValue(report.staged.exercisePreferences)) : null;
    var indexedWrites = [];
    indexedWrites.push(flushAppStateWrites());
    if (report.staged.history && historyRepository) indexedWrites.push(historyRepository.replaceAll(importedHistory));
    if (report.staged.nutritionLog && historyRepository) indexedWrites.push(historyRepository.replaceNutritionDays(importedNutritionDays));
    if (report.staged.customExercises && historyRepository) indexedWrites.push(historyRepository.replaceCustomExercises(importedCustomExercises));
    if (report.staged.equipmentProfiles && historyRepository) indexedWrites.push(historyRepository.replaceEquipmentProfiles(importedEquipmentProfiles));
    if (report.staged.exercisePreferences && historyRepository) indexedWrites.push(writePreferenceSnapshot(importedExercisePreferences));
    Promise.all(indexedWrites).then(async function () {
      if (importedExercisePreferences && historyRepository) {
        var persistedPreferences = await historyRepository.readExercisePreferences();
        var preferenceIds = Object.keys(importedExercisePreferences).sort();
        var preferencesMatch = function (records) {
          var ids = Object.keys(records || {}).sort();
          return ids.length === preferenceIds.length && preferenceIds.every(function (id, index) {
            return id === ids[index] && records[id] === importedExercisePreferences[id];
          });
        };
        if (!preferencesMatch(persistedPreferences)) {
          await writePreferenceSnapshot(importedExercisePreferences);
          persistedPreferences = await historyRepository.readExercisePreferences();
        }
        if (!preferencesMatch(persistedPreferences)) throw new Error('Imported exercise preferences could not be verified');
      }
      if (Array.isArray(importedHistory)) databaseHistory = importedHistory;
      if (Array.isArray(importedNutritionDays)) databaseNutritionDays = importedNutritionDays;
      if (Array.isArray(importedCustomExercises)) databaseCustomExercises = cleanCustomExercises(importedCustomExercises);
      if (Array.isArray(importedEquipmentProfiles)) databaseEquipmentProfiles = cleanEquipmentProfiles(importedEquipmentProfiles);
      if (importedExercisePreferences) { databaseExercisePreferences = importedExercisePreferences; S.exercisePreferences = importedExercisePreferences; }
      showToast(t('ioRestored',{n:Object.keys(report.staged).length}));
      window.setTimeout(function(){window.location.reload();},650);
    }).catch(function () {
      var previous = analyzeBackup(rollback);
      if (previous.ok) {
        writeBackupValues(previous.staged);
        var restores = [];
        restores.push(flushAppStateWrites());
        if (historyRepository && previous.staged.history) restores.push(historyRepository.replaceAll(jsonValue(previous.staged.history)));
        if (historyRepository && previous.staged.nutritionLog) restores.push(historyRepository.replaceNutritionDays(cleanNutritionDays(jsonValue(previous.staged.nutritionLog))));
        if (historyRepository && previous.staged.customExercises) restores.push(historyRepository.replaceCustomExercises(jsonValue(previous.staged.customExercises)));
        if (historyRepository && previous.staged.equipmentProfiles) restores.push(historyRepository.replaceEquipmentProfiles(jsonValue(previous.staged.equipmentProfiles)));
        if (historyRepository && previous.staged.exercisePreferences) restores.push(writePreferenceSnapshot(cleanIdbExercisePreferences(jsonValue(previous.staged.exercisePreferences))));
        Promise.all(restores).then(function () {
          if (previous.staged.customExercises) databaseCustomExercises = cleanCustomExercises(jsonValue(previous.staged.customExercises));
          if (previous.staged.nutritionLog) databaseNutritionDays = cleanNutritionDays(jsonValue(previous.staged.nutritionLog));
          if (previous.staged.equipmentProfiles) databaseEquipmentProfiles = cleanEquipmentProfiles(jsonValue(previous.staged.equipmentProfiles));
          if (previous.staged.exercisePreferences) { databaseExercisePreferences = cleanIdbExercisePreferences(jsonValue(previous.staged.exercisePreferences)); S.exercisePreferences = databaseExercisePreferences; }
        }).catch(function () {});
      }
      showToast(S.lang==='en'?'Import could not be verified; the previous backup was restored.':'Импорт не удалось проверить; прежняя резервная копия восстановлена.');
    });
    return true;
  };
  clearAll = function(){
    if(!window.confirm(t('dataConfirm')))return;
    indexedAppStateReady = false;
    DATA_KEYS.forEach(function(name){if(K[name])store.remove(K[name]);});
    [K.restTimer,K.lastBackup,K.rollbackBackup,K.legacyFav,K.legacyWorkout,K.legacyLang,K.legacyTheme].forEach(function(key){if(key)store.remove(key);});
    Object.keys(memoryStore).filter(function(key){return key.indexOf('mmg.recovery.')===0;}).forEach(function(key){store.remove(key);});
    if(storageOk){try{for(var i=window.localStorage.length-1;i>=0;i--){var key=window.localStorage.key(i);if(key&&key.indexOf('mmg.recovery.')===0)window.localStorage.removeItem(key);}}catch(e){}}
    var cleared = historyRepository ? flushAppStateWrites().then(function(){
      return Promise.all([historyRepository.replaceAll([]), historyRepository.replaceNutritionDays([]), historyRepository.replaceMeasurements([]), historyRepository.replaceCustomExercises([]), historyRepository.replaceEquipmentProfiles([]), writePreferenceSnapshot({}), historyRepository.clearProgram()]);
    }).then(function(){return historyRepository.clearUserState();}) : Promise.resolve();
    cleared.then(function(){
      DATA_KEYS.forEach(function(name){var key=K[name];if(!key)return;delete memoryStore[key];if(storageOk){try{window.localStorage.removeItem(key);}catch(e){}}});
      databaseAppState = {};
      showToast(t('dataCleared'));
      window.setTimeout(function(){window.location.reload();},550);
    }).catch(function(){
      storageWarnings.push({ key: K.history, type: 'indexeddb-clear', at: Date.now() });
      showToast(S.lang==='en'?'Workout history could not be cleared from this device.':'Не удалось удалить историю тренировок с этого устройства.');
    });
  };

  function downloadBackup(){
    var text=exportAll(), blob=new Blob([text],{type:'application/json;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='markov-made-gym-backup-'+todayISO()+'.json'; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(function(){URL.revokeObjectURL(url);},1200); store.set(K.lastBackup,String(Date.now())); renderDataStatus();
    toggleIo('data-io',text);
    showToast(S.lang==='en'?'Backup created. JSON is ready below.':'Резервная копия создана. JSON готов ниже.'); track('data_exported',{format:'json'});
  }
  function ensureImportFileInput(){
    var input=$('data-import-file'); if(input)return input;
    input=document.createElement('input'); input.type='file'; input.id='data-import-file'; input.accept='.json,application/json'; input.hidden=true; document.body.appendChild(input);
    input.addEventListener('change',function(){
      var file=input.files&&input.files[0]; if(!file)return;
      if(file.size>50000000){showToast(S.lang==='en'?'Backup is too large.':'Файл резервной копии слишком большой.');input.value='';return;}
      var reader=new FileReader(); reader.onload=function(){importAll(String(reader.result||''));input.value='';}; reader.onerror=function(){showToast(S.lang==='en'?'Could not read the file.':'Не удалось прочитать файл.');input.value='';}; reader.readAsText(file);
    });
    return input;
  }
  function ensureDataStatus(){
    var el=$('data-status'); if(el)return el;
    el=document.createElement('p');el.id='data-status';el.className='data-status';el.setAttribute('role','status');
    var tools=qs('.data-tools'); if(tools)tools.parentNode.insertBefore(el,tools); return el;
  }
  function renderDataStatus(){
    var el=ensureDataStatus(); if(!el)return;
    var last=Number(store.get(K.lastBackup)||0), due=S.history.length>=3 && (!last||Date.now()-last>30*86400000);
    if(!storageOk){el.hidden=false;el.dataset.tone='warn';el.textContent=S.lang==='en'?'Session-only mode: browser storage is unavailable, so changes may disappear after reload. Export anything important before leaving.':'Режим без постоянного хранилища: браузер не даёт сохранять данные, поэтому изменения могут исчезнуть после перезагрузки. Экспортируй важное перед выходом.';return;}
    var corrupt=storageWarnings.filter(function(w){return w.type==='json';}).length;
    if(corrupt){el.hidden=false;el.dataset.tone='warn';el.textContent=S.lang==='en'?'Invalid local data was isolated instead of being silently overwritten. Working defaults are active; export a fresh backup after checking your data.':'Некорректные локальные данные изолированы, а не молча перезаписаны. Сейчас используются рабочие значения; после проверки данных сохрани свежую копию.';return;}
    if(due){el.hidden=false;el.dataset.tone='ok';el.textContent=S.lang==='en'?'You already have training history on this device. Download a backup occasionally so browser cleanup cannot erase it.':'На устройстве уже накопилась история тренировок. Периодически скачивай резервную копию, чтобы очистка браузера не удалила её.';return;}
    el.hidden=true;
  }

  function bindV5UrlState(){
    window.addEventListener('popstate',function(){
      urlStateRestoring=true; restoreLibraryStateFromUrl();
      if($('search'))$('search').value=S.query;
      renderMuscleBoard();renderFilters();renderResults();
      urlStateRestoring=false; lastUrlSignature=urlStatePath();
    });
    document.addEventListener('input',function(e){
      if(e.target&&e.target.id==='search')window.setTimeout(function(){syncLibraryUrl('replace');},210);
    });
    document.addEventListener('submit',function(e){if(e.target&&e.target.id==='hero-form')window.setTimeout(function(){syncLibraryUrl('push');},0);});
    document.addEventListener('click',function(e){
      var hit=e.target.closest('[data-filter-kind],[data-chip-kind],[data-preset],[data-zone],[data-zone-muscle],[data-musnav-zone],[data-musnav-muscle],[data-reset-filters],#fav-only,#reset-all,#filters-reset,#muscles-reset,#search-clear');
      if(hit)window.setTimeout(function(){syncLibraryUrl('push');},0);
    });
    document.addEventListener('pointerup',function(e){if(e.target.closest('[data-body-zone]'))window.setTimeout(function(){syncLibraryUrl('push');},0);});
  }

  function bindV5DataActions(){
    ensureImportFileInput();
    document.addEventListener('click',function(e){
      var exp=e.target.closest('#data-export');
      if(exp){e.preventDefault();e.stopImmediatePropagation();downloadBackup();return;}
      var imp=e.target.closest('#data-import');
      if(imp){e.preventDefault();e.stopImmediatePropagation();ensureImportFileInput().click();}
    },true);
  }

  var _applyLangV5 = applyLang;
  applyLang = function(initial){ _applyLangV5(initial); renderDataStatus(); };

  var _syncFloatingV5 = syncFloating;
  syncFloating = function(){
    _syncFloatingV5();
    var sticky=$('mobile-rest-timer'), bar=$('mfb');
    if(sticky&&bar) sticky.classList.toggle('is-raised',MOBILE_MQ.matches&&bar.getAttribute('data-open')==='true');
  };

  function initProductionV5(){
    bindSessionLifecycle({ window, document, isActive: runOpen, saveDraft: saveCurrentSetDraft, saveSession: saveRunSession, persistTimer: persistRestTimer, flush: flushAppStateWrites, onError: function () { lastLocalError = 'session-save'; renderV7Diagnostics(); } });
    document.documentElement.dataset.release='ultimate-2026-08-v8';
    restoreRestTimer();
    if(restTimer.running){clearInterval(restTimer.id);restTimer.id=window.setInterval(tickRestTimer,250);tickRestTimer();}
    renderTimer(); renderDataStatus(); bindV5UrlState(); bindV5DataActions();
    var bottomBar=$('mfb'),bottomTimer=$('mobile-rest-timer');
    if(bottomBar&&bottomTimer&&window.MutationObserver){
      var syncBottomLayer=function(){bottomTimer.classList.toggle('is-raised',MOBILE_MQ.matches&&bottomBar.getAttribute('data-open')==='true');};
      new MutationObserver(syncBottomLayer).observe(bottomBar,{attributes:true,attributeFilter:['data-open']}); syncBottomLayer();
    }
    var minus=$('timer-minus'),plus=$('timer-plus');
    [minus,plus].forEach(function(btn){if(btn)btn.addEventListener('click',function(){if(restTimer.running){restTimer.endsAt=Date.now()+Math.max(0,restTimer.left)*1000;persistRestTimer();}});});
    document.addEventListener('visibilitychange',function(){tickRestTimer();persistRestTimer();},{passive:true});
    window.addEventListener('pageshow',tickRestTimer,{passive:true});
    window.mmgDiagnostics={version:APP_VERSION,storagePersistent:storageOk,get storageWarnings(){return storageWarnings.slice();},exerciseCount:EX.length,get customExerciseCount(){return databaseCustomExercises.length;},get equipmentProfileCount(){return databaseEquipmentProfiles.length;},get activeEquipmentProfileId(){return activeEquipmentProfileId;},backupSchema:BACKUP_SCHEMA,get historySchema(){return historyRepository?historyRepository.schemaVersion:0;},get historyCount(){return Array.isArray(databaseHistory)?databaseHistory.length:S.history.length;},get nutritionCount(){return databaseNutritionDays.length;},get userStateReady(){return indexedAppStateReady;},get repositoryReady(){return !!historyRepository;},get lastLocalError(){return lastLocalError;}};
  }



  /* ========================================================================
     21. FLAGSHIP PRODUCT OS V8
     V7 state contracts retained; V8 owns the canonical presentation and shell.
     No network. No fake AI. Existing storage contracts remain readable.
     ======================================================================== */
  var V7_ROUTES={};
  var V7_ROUTE_IDS={};
  var v7ProgramStartTracked=false;

  function v7c(key){return t('v7.'+key);}
  function v7RouteFromHash(){return normalizeRouteHash?normalizeRouteHash(location.hash):'home';}
  function v7Returning(){return !!(profileComplete()||S.workout.length||S.history.length||S.diary.length||databaseNutritionDays.length||S.plan||S.kbjuLast||S.favorites.length);}
  function v7CurrentWeekKey(){var d=new Date(),day=(d.getDay()+6)%7;d.setHours(12,0,0,0);d.setDate(d.getDate()-day);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function v7MesocycleStatus(){if(!S.plan||!mesocycleStatusFn)return null;var ctx=S.plan.ctx||{};return mesocycleStatusFn({startWeek:ctx.blockStartWeek||S.plan.weekKey,durationWeeks:Number(ctx.blockWeeks)||4,today:todayISO()});}
  function v7EnsurePlanWeek(){if(!S.plan)return;var wk=v7CurrentWeekKey();if(S.plan.weekKey&&S.plan.weekKey!==wk){S.plan.weekKey=wk;S.plan.completedDays=[];savePlanV7();}else if(!S.plan.weekKey)S.plan.weekKey=wk;}
  function v7NextPlanDay(){if(!S.plan||!Array.isArray(S.plan.days)||!S.plan.days.length)return -1;v7EnsurePlanWeek();var done=Array.isArray(S.plan.completedDays)?S.plan.completedDays:[];for(var i=0;i<S.plan.days.length;i++)if(done.indexOf(i)===-1)return i;return -1;}
  function v7NextAction(){
    var total=S.workout.reduce(function(a,w){return a+(Number(w.sets)||0);},0),done=S.workout.reduce(function(a,w){return a+completedSetCount(w);},0);
    var active=S.runSession&&Date.now()-Number(S.runSession.startedAt||0)<8*3600000&&done<total;
    var block=v7MesocycleStatus();
    var day=v7NextPlanDay();
    var last=S.diary[0],age=last&&last.date?Math.max(0,Math.floor((Date.now()-Date.parse(last.date+'T12:00:00'))/86400000)):null;
    var planDone=!!(S.plan&&S.plan.days&&S.plan.days.length&&S.plan.completedDays&&S.plan.completedDays.length>=S.plan.days.length);
    var decision=todayDecisionEngine?todayDecisionEngine({
      activeRun:!!active,
      completedWorkout:!!(S.workout.length&&total>0&&done>=total&&!workoutAlreadySaved(S.workout,S.history)),
      pendingWorkout:!!(S.workout.length&&done<total),
      profileIncomplete:!profileComplete(),
      programmeBlockComplete:!!(block&&block.status==='complete'),
      scheduledProgramDay:S.plan&&day>=0?day:null,
      programmeWeekComplete:planDone,
      hasTrainingHistory:S.history.length>0,
      checkinAgeDays:age,
      hasNutritionLogToday:S.history.length?databaseNutritionDays.some(function(entry){return entry.date===todayISO();}):undefined,
      hasProgram:!!(S.plan&&S.plan.days&&S.plan.days.length)
    }):null;
    if(!decision)return{type:'library',title:v7c('discover'),why:v7c('discoverWhy'),evidence:[]};
    var views={
      resume_run:{type:'resume',title:v7c('continueRun'),why:v7c('continueRunWhy'),evidence:[done+' / '+total+' '+v7c('sets')]},
      save_workout:{type:'workout',title:t('nextSave'),why:t('nextSaveWhy'),evidence:[done+' / '+total+' '+v7c('sets')]},
      start_workout:{type:'run',title:v7c('startReady'),why:v7c('startReadyWhy'),evidence:[S.workout.length+' '+(S.lang==='en'?'exercises':'упражнений'),total+' '+v7c('sets')]},
      finish_profile:{type:'profile',title:v7c('finishProfile'),why:v7c('finishProfileWhy'),evidence:[]},
      review_program_block:{type:'program',title:t('nextBlockReview'),why:t('nextBlockReviewWhy'),evidence:[(block?block.durationWeeks:0)+' '+(S.lang==='en'?'weeks':'недель')]},
      start_program_day:{type:'planDay',day:decision.day,title:v7c('startPlan'),why:v7c('startPlanWhy'),evidence:[v7c('programmeDay')+' '+(decision.day+1)+' / '+(S.plan&&S.plan.days?S.plan.days.length:0)]},
      review_week:{type:'program',title:v7c('weekComplete'),why:v7c('weekCompleteWhy'),evidence:[(S.plan&&S.plan.completedDays?S.plan.completedDays.length:0)+' / '+(S.plan&&S.plan.days?S.plan.days.length:0)]},
      record_measurements:{type:'checkin',title:v7c('checkin'),why:v7c('checkinWhy'),evidence:age==null?[]:[age+' '+v7c('days')]},
      log_nutrition:{type:'nutrition',title:S.lang==='en'?'Log today’s nutrition':'Записать питание за сегодня',why:S.lang==='en'?'Add calories and protein; a same-day weigh-in can also strengthen the trend.':'Добавь калории и белок; вес за эту дату поможет точнее увидеть динамику.',evidence:[]},
      build_program:{type:'program',title:v7c('buildPlan'),why:v7c('buildPlanWhy'),evidence:[]},
      find_exercise:{type:'library',title:v7c('discover'),why:v7c('discoverWhy'),evidence:[]},
      review_progress:{type:'progress',title:t('nextKeep'),why:t('nextKeepWhy'),evidence:[]}
    };
    var view=views[decision.recommendation];
    return view?Object.assign({decision:decision},view):{type:'library',title:v7c('discover'),why:v7c('discoverWhy'),evidence:[]};
  }
  function v7DateLabel(){try{return new Intl.DateTimeFormat(S.lang==='en'?'en-GB':'ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(new Date());}catch(e){return todayISO();}}
  function v7PlanSummary(){if(!S.plan||!S.plan.days)return{v:'—',s:v7c('noPlan')};var done=(S.plan.completedDays||[]).length;return{v:done+' / '+S.plan.days.length,s:(S.lang==='en'?'sessions ':'тренировок ')+v7c('completed')};}
  function v7TrendSummary(){if(S.diary.length<2)return{v:'—',s:v7c('noTrend')};var d=diaryDelta('weight',14);if(d===null)return{v:'—',s:v7c('noTrend')};return{v:(d>0?'+':'')+d.toFixed(1)+' '+t('kg'),s:S.lang==='en'?'14-day weight change':'изменение веса за 14 дней'};}
  function v10WeekStartTime(){var d=new Date(),day=(d.getDay()+6)%7;d.setHours(0,0,0,0);d.setDate(d.getDate()-day);return d.getTime();}
  function v10RecoverySummary(){
    var d=S.diary&&S.diary[0];
    if(!d)return{label:S.lang==='en'?'No check-in':'Нет check-in',state:'none',detail:S.lang==='en'?'Add recovery data':'Добавь данные восстановления'};
    var score=typeof d.recovery==='number'?d.recovery:null;
    if(score===null&&typeof d.sleep==='number'){score=d.sleep>=7.5&&Number(d.fatigue||2)<=2?3:(d.sleep<6||Number(d.fatigue||2)>=4?1:2);}
    if(score===3)return{label:S.lang==='en'?'Good':'Хорошее',state:'ok',detail:S.lang==='en'?'Recovery supports normal training':'Можно тренироваться в обычном режиме'};
    if(score===1)return{label:S.lang==='en'?'Low':'Низкое',state:'watch',detail:S.lang==='en'?'Keep the session controlled':'Сделай нагрузку управляемой'};
    return{label:S.lang==='en'?'Normal':'Нормальное',state:'neutral',detail:S.lang==='en'?'No clear recovery warning':'Явных сигналов перегруза нет'};
  }
  function renderV10HomePulse(){
    var host=$('v10-home-pulse');if(!host)return; if(!S.history.length&&!S.plan&&!S.diary.length){host.innerHTML='';return;}
    var wk=v10WeekStartTime();
    var weekHistory=S.history.filter(function(h){var ts=h&&h.date?Date.parse(h.date+'T12:00:00'):0;return ts>=wk;});
    var weekSets=weekHistory.reduce(function(sum,h){return sum+totalCompletedHistorySets(h);},0);
    var recovery=v10RecoverySummary();
    var trend=v7TrendSummary();
    var completed=S.plan&&Array.isArray(S.plan.completedDays)?S.plan.completedDays.length:0;
    var total=S.plan&&Array.isArray(S.plan.days)?S.plan.days.length:0;
    var next=v7NextPlanDay();
    var timeline='';
    if(total){
      timeline='<div class="v10-week-timeline" aria-label="'+esc(S.lang==='en'?'Programme week':'Неделя программы')+'">'+S.plan.days.map(function(day,i){
        var done=S.plan.completedDays&&S.plan.completedDays.indexOf(i)!==-1,current=i===next;
        var label=(S.lang==='en'?'Day ':'День ')+(i+1);
        return '<button type="button" data-v7-action="planDay" data-v7-day="'+i+'" data-state="'+(done?'done':current?'current':'planned')+'" title="'+esc(label)+'"><i>'+(done?'✓':String(i+1))+'</i><span>'+esc(done?(S.lang==='en'?'Done':'Готово'):(current?(S.lang==='en'?'Next':'Дальше'):(S.lang==='en'?'Plan':'План')))+'</span></button>';
      }).join('')+'</div>';
    } else {
      timeline='<button class="v10-pulse-empty" type="button" data-v7-route="program">'+esc(S.lang==='en'?'Build a programme to see the week here':'Собери программу — здесь появится неделя')+' →</button>';
    }
    host.innerHTML='<div class="v10-pulse-head"><div><span class="eyebrow">'+esc(S.lang==='en'?'WEEKLY PULSE':'ПУЛЬС НЕДЕЛИ')+'</span><b>'+esc(S.lang==='en'?'What matters right now':'Что важно прямо сейчас')+'</b></div><span class="signal" data-state="'+esc(recovery.state)+'">'+esc(recovery.label)+'</span></div>'+
      '<div class="v10-pulse-metrics">'+
        '<div><span>'+esc(S.lang==='en'?'Programme':'Программа')+'</span><strong>'+(total?completed+' / '+total:'—')+'</strong><small>'+esc(total?(S.lang==='en'?'sessions complete':'тренировок выполнено'):(S.lang==='en'?'not built yet':'ещё не собрана'))+'</small></div>'+
        '<div><span>'+esc(S.lang==='en'?'Work sets':'Рабочие подходы')+'</span><strong>'+weekSets+'</strong><small>'+esc(S.lang==='en'?'completed this week':'завершено за неделю')+'</small></div>'+
        '<div><span>'+esc(S.lang==='en'?'14-day trend':'Тренд 14 дней')+'</span><strong>'+esc(trend.v)+'</strong><small>'+esc(trend.s)+'</small></div>'+
        '<div><span>'+esc(S.lang==='en'?'Recovery':'Восстановление')+'</span><strong>'+esc(recovery.label)+'</strong><small>'+esc(recovery.detail)+'</small></div>'+
      '</div>'+timeline;
  }
  function renderV7Home() {
    return renderV7HomeView({ $, S, esc, t, v7c, v7DateLabel, v7NextAction, v7PlanSummary, v7TrendSummary, totalCompletedHistorySets, premiumIcon, renderV10HomePulse });
  }

  function renderV7More(){
    var host=$('v7-more-grid');if(!host)return;$('v7-more-title').textContent=v7c('more');$('v7-more-sub').textContent=v7c('moreSub');
    var groups=[
      [S.lang==='en'?'TOOLS':'ИНСТРУМЕНТЫ',[
        ['program','program',S.lang==='en'?'Build and start the next training day.':'Собери неделю и начни следующий тренировочный день.'],
        ['nutrition','nutrition',S.lang==='en'?'Calorie target, macros and trend context.':'Калории, макросы и связь с динамикой.']]],
      [S.lang==='en'?'LEARN':'ЗНАНИЯ',[
        ['knowledge','knowledge',S.lang==='en'?'Practical explanations when context is useful.':'Практические разборы, когда нужен контекст.'],
        ['method','method',S.lang==='en'?'The decision framework behind the product.':'Логика решений, на которой построен продукт.']]],
      [S.lang==='en'?'SYSTEM':'СИСТЕМА',[
        ['settings','settings',S.lang==='en'?'Interface, advanced logging and local data.':'Интерфейс, расширенное логирование и данные.']]],
      [S.lang==='en'?'ABOUT':'АВТОР',[
        ['about','about',S.lang==='en'?'Author, principles and boundaries.':'Автор, принципы и границы системы.']]]
    ];
    host.innerHTML=groups.map(function(g){return'<section class="v8-more-group"><span class="v8-more-label">'+esc(g[0])+'</span><div class="v8-more-list">'+g[1].map(function(x){return'<button class="v7-more-item" type="button" data-v7-route="'+x[0]+'"><span class="v7-more-icon" aria-hidden="true">'+premiumIcon(x[1])+'</span><span><b>'+esc(v7c(x[0]))+'</b><p>'+esc(x[2])+'</p></span><span aria-hidden="true">→</span></button>';}).join('')+'</div></section>';}).join('');
  }
  function renderV7Settings() {
    return renderV7SettingsView({ $, S, esc, renderV7Diagnostics, v7c });
  }
  function renderV7Diagnostics(){
    var host=$('v7-diagnostics-output');if(!host)return;
    var d=window.mmgDiagnostics||{},sw=navigator.serviceWorker;
    var migration=d.repositoryReady?(d.userStateReady?(S.lang==='en'?'Ready':'Готово'):(S.lang==='en'?'Repository open; state loading':'Хранилище открыто; состояние загружается')):(S.lang==='en'?'Browser storage fallback':'Резервное хранилище браузера');
    var warnings=d.storageWarnings||[],lastWarning=warnings.length?warnings[warnings.length-1]:null;
    var warning=lastWarning?String(lastWarning.type)+' · '+String(lastWarning.key):(S.lang==='en'?'None':'Нет');
    var rows=S.lang==='en'?[['App version',d.version||APP_VERSION],['Backup / IndexedDB schema',String(d.backupSchema||BACKUP_SCHEMA)+' / '+String(d.historySchema||0)],['Storage migration',migration],['LocalStorage',d.storagePersistent?'Available':'Memory fallback'],['Exercise records',String(d.exerciseCount||EX.length)],['Custom exercises / equipment profiles',String(d.customExerciseCount||0)+' / '+String(d.equipmentProfileCount||0)],['Workout history / nutrition days',String(d.historyCount||0)+' / '+String(d.nutritionCount||0)],['Route',v7RouteFromHash()],['Service worker version',sw&&sw.controller?'Reading cache…':'Not controlling page','sw'],['Latest local error',d.lastLocalError||'None'],['Latest storage warning',warning]]:[['Версия приложения',d.version||APP_VERSION],['Схемы резервной копии / IndexedDB',String(d.backupSchema||BACKUP_SCHEMA)+' / '+String(d.historySchema||0)],['Состояние хранилища',migration],['LocalStorage',d.storagePersistent?'Доступен':'Используется память вкладки'],['Упражнения в каталоге',String(d.exerciseCount||EX.length)],['Свои упражнения / профили оборудования',String(d.customExerciseCount||0)+' / '+String(d.equipmentProfileCount||0)],['История тренировок / дни питания',String(d.historyCount||0)+' / '+String(d.nutritionCount||0)],['Текущий раздел',v7RouteFromHash()],['Версия service worker',sw&&sw.controller?'Загружается из локального кэша…':'Страница не управляется'],['Последняя локальная ошибка',d.lastLocalError||'Нет'],['Последнее предупреждение хранилища',warning]];
    host.innerHTML=rows.map(function(row){return'<div><dt>'+esc(row[0])+'</dt><dd'+(row[2]==='sw'?' data-diagnostic-sw-version':'')+'>'+esc(row[1])+'</dd></div>';}).join('');
    var swVersion=host.querySelector('[data-diagnostic-sw-version]');
    if(swVersion&&window.caches)window.caches.keys().then(function(keys){var prefix='mmg-gym-shell-',found=keys.filter(function(key){return key.indexOf(prefix)===0;}).sort().pop();if(document.contains(swVersion))swVersion.textContent=found?found.slice(prefix.length):(S.lang==='en'?'Active; cache version unavailable':'Активен; версия кэша недоступна');}).catch(function(){if(document.contains(swVersion))swVersion.textContent=S.lang==='en'?'Cache Storage unavailable':'Cache Storage недоступен';});
  }
  function renderV7Nav(){qsa('[data-v7-nav]').forEach(function(el){el.textContent=v7c(el.dataset.v7Nav);});var moreSub={tools:S.lang==='en'?'Strength, nutrition, body, cardio and my data':'Сила, питание, состав тела, кардио и мои данные',program:S.lang==='en'?'Weekly structure and the next workout':'Структура недели и следующая тренировка',nutrition:S.lang==='en'?'Calories, macros and feedback':'Калории, макросы и обратная связь',knowledge:S.lang==='en'?'Practical contextual guides':'Практические разборы по контексту',method:S.lang==='en'?'Decision framework':'Логика принятия решений',settings:S.lang==='en'?'Interface, logging and data':'Интерфейс, логирование и данные',about:S.lang==='en'?'Author and system boundaries':'Автор и границы системы'};qsa('[data-v7-more]').forEach(function(el){el.textContent=v7c(el.dataset.v7More);});qsa('[data-v7-more-sub]').forEach(function(el){el.textContent=moreSub[el.dataset.v7MoreSub]||'';});var mt=qs('[data-v7-mobile-title]');if(mt)mt.textContent=v7c('moreTitle');}
  function v7FocusRoute(route){var el=$('v8-context-title')||$(route+'-title');if(el){el.setAttribute('tabindex','-1');requestAnimationFrame(function(){el.focus({preventScroll:true});window.scrollTo(0,0);});}else window.scrollTo(0,0);}
  function applyV7Route(focus){var route=v7RouteFromHash();document.body.dataset.v7Route=route;document.documentElement.dataset.routeReady=route;var ids=['home','system','start','method','muscles','library','workout','nutrition','program','progress','knowledge','about','how','faq','contact','more','settings'];ids.forEach(function(id){var el=$(id);if(el)el.hidden=true;});var hero=qs('.hero');if(hero)hero.hidden=true;var returning=v7Returning();if(route==='home'){$('home').hidden=false;renderV7Home();}else{(V7_ROUTES[route]||[]).forEach(function(id){var el=$(id);if(el)el.hidden=false;});}if(route==='program'){if(!v7ProgramStartTracked){track('program_start',{});v7ProgramStartTracked=true;}var pf=$('plan-form');if(pf&&!pf.dataset.v7Prefilled){prefillPlan();pf.dataset.v7Prefilled='true';renderProgramWizard();}}var footer=qs('.footer');if(footer)footer.hidden=!(['more','settings','about','method','knowledge','how','faq','contact'].indexOf(route)!==-1);qsa('.v7-primary-nav>.v7-nav-link').forEach(function(a){var on=a.getAttribute('href')==='#'+route;a.toggleAttribute('aria-current',on);if(on)a.setAttribute('aria-current','page');});var nav=$('mobile-app-nav');if(nav)qsa('[data-mobile-dest]',nav).forEach(function(a){var on=a.dataset.mobileDest===route;a.classList.toggle('is-active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});syncV7Floating();renderV8Shell(route,!!focus);if(focus)v7FocusRoute(route);}
  function navigateV7(route,focus){route=routeIsKnown&&routeIsKnown(route)?route:'home';if(location.hash!=='#'+route)location.hash=route;else{applyV7Route(focus!==false);}}
  function syncV7Floating(){var route=v7RouteFromHash(),bar=$('mfb');if(bar){var show=MOBILE_MQ.matches&&route==='library';bar.setAttribute('data-open',String(show));}var sticky=$('mobile-rest-timer');if(sticky)sticky.classList.toggle('is-raised',!!(bar&&bar.getAttribute('data-open')==='true'));}
  function startPlanDayV7(dayIndex,startRun){if(!S.plan||!S.plan.days)return;v7EnsurePlanWeek();var day=S.plan.days[dayIndex];if(!day)return;S.workout=day.items.map(function(it){return normalizeWorkoutRecord({id:it.ex.id,sets:it.sets,reps:it.reps,weight:'',done:false,setLog:[]});});S.meta.name=(S.lang==='en'?'Day ':'День ')+(dayIndex+1)+' · '+(DAY_NAMES[day.key]?(DAY_NAMES[day.key][S.lang]||DAY_NAMES[day.key].ru):day.key);S.meta.date=todayISO();S.meta.note='';S.meta.planDay=dayIndex;saveWorkout();saveMeta();renderWorkout();renderResults();track('program_day_start',{day:dayIndex+1});navigateV7('workout',true);showToast(t('planDayAdded',{n:dayIndex+1}));if(startRun)setTimeout(openRun,80);}
  function progressionIncrementForExercise(ex){var source=ex&&ex.compound==null?Object.assign({},ex,{compound:exKind(ex)==='compound'}):ex;return equipmentLoadIncrement(source,S.settings&&S.settings.loadIncrements);}
  function progressionAdviceV7(id,item){
    if(!progressionEngine||!item)return null;
    var previous=previousPerformance(id);
    if(!previous||!Array.isArray(previous.setLog))return null;
    var rec=progressionEngine.recommendProgression({previousSets:previous.setLog,targetRepRange:item.reps,increment:progressionIncrementForExercise(BY_ID[id])});
    return rec&&rec.status==='recommendation'?rec:null;
  }
  function addProgressionAdviceV7(){qsa('#workout-list .workout-item').forEach(function(row){var item=S.workout.filter(function(w){return w.id===row.dataset.id;})[0],main=qs('.workout-main',row);if(!item||!main||qs('.workout-progression',main))return;var exercise=BY_ID[item.id];if(!exercise)return;var adv=progressionAdviceV7(item.id,item);if(!adv||adv.action!=='increase-load')return;var reason=S.lang==='en'?'Last completed session reached the top of the rep range in every working set.':'В прошлой завершённой сессии верхняя граница повторов достигнута во всех рабочих подходах.';var increment=progressionIncrementForExercise(exercise),override=S.settings&&S.settings.loadIncrements&&S.settings.loadIncrements[item.id],options=['0.5','1','1.25','2','2.5','5','10'];var label=S.lang==='en'?'Load step':'Шаг нагрузки';var automatic=S.lang==='en'?'Auto':'Авто';var box=document.createElement('div');box.className='workout-progression';box.innerHTML='<span aria-hidden="true">↗</span><span><b>'+esc(v7c('tryWeight'))+' '+adv.nextLoad+' '+esc(t('kg'))+'</b><small>'+esc(reason)+'</small><label class="workout-progression-increment">'+esc(label)+' <select data-load-increment="'+esc(item.id)+'" aria-label="'+esc(label)+' · '+esc(exName(exercise))+'"><option value="default"'+(!override?' selected':'')+'>'+esc(automatic)+' · '+increment+' '+esc(t('kg'))+'</option>'+options.map(function(step){return'<option value="'+step+'"'+(Number(override)===Number(step)?' selected':'')+'>'+step+' '+esc(t('kg'))+'</option>';}).join('')+'</select></label></span>';var prev=qs('.workout-previous',main);if(prev)prev.insertAdjacentElement('afterend',box);else main.appendChild(box);});}
  function initV7WorkoutUtilities(){var side=qs('.workout-side');if(!side||$('v7-session-tools'))return;var details=document.createElement('details');details.id='v7-session-tools';details.className='v7-session-tools';details.innerHTML='<summary>'+esc(v7c('utilities'))+'</summary><div class="v7-session-tools-body"></div>';var body=qs('.v7-session-tools-body',details);['w-copy','w-share','w-print','w-clear'].forEach(function(id){var el=$(id);if(el)body.appendChild(el);});['w-name','w-date','w-note'].forEach(function(fid){var field=$(fid);if(field&&field.closest('.field'))body.appendChild(field.closest('.field'));});var io=$('w-io');if(io){var d=io.closest('details');if(d)body.appendChild(d);}side.appendChild(details);}
  function initV7ProgressQuick(){var grid=qs('.progress-form-grid');if(!grid||$('g-recovery-v7'))return;var waist=$('g-waist'),field=document.createElement('div');field.className='field';field.innerHTML='<label for="g-recovery-v7">'+esc(v7c('recovery'))+'</label><select class="select" id="g-recovery-v7"><option value="1">'+esc(v7c('recoveryLow'))+'</option><option value="2" selected>'+esc(v7c('recoveryMid'))+'</option><option value="3">'+esc(v7c('recoveryHigh'))+'</option></select>';if(waist&&waist.closest('.field'))waist.closest('.field').insertAdjacentElement('afterend',field);var labels=qsa('.form-section-label',grid);if(labels.length<2)return;var adv=document.createElement('details');adv.className='v7-advanced-checkin';adv.innerHTML='<summary>'+esc(v7c('advanced'))+'</summary><div class="v7-advanced-checkin-grid"></div>';var advGrid=qs('.v7-advanced-checkin-grid',adv);var move=['g-sleep','g-mood','g-hunger','g-fatigue','g-lift','g-note'];labels.slice(1).forEach(function(l){if(l.parentNode)advGrid.appendChild(l);});move.forEach(function(id){var el=$(id);if(el&&el.closest('.field'))advGrid.appendChild(el.closest('.field'));});grid.appendChild(adv);var save=$('prog-save');if(save)save.textContent=S.lang==='en'?'Save check-in':'Сохранить check-in';}
  function v7DiaryConfidence(){var valid=S.diary.filter(function(d){return d&&d.date&&(typeof d.weight==='number'||typeof d.waist==='number');});if(valid.length<3)return{level:'low',label:v7c('confidenceLow'),detail:valid.length+' '+(S.lang==='en'?'measurements':'измерения')};var dates=valid.map(function(d){return Date.parse(d.date+'T12:00:00');}).filter(isFinite);var span=dates.length>1?(Math.max.apply(null,dates)-Math.min.apply(null,dates))/86400000:0;if(valid.length>=6&&span>=21)return{level:'enough',label:v7c('confidenceEnough'),detail:valid.length+' · '+Math.round(span/7)+' '+(S.lang==='en'?'weeks':'нед.')};return{level:'medium',label:v7c('confidenceMedium'),detail:valid.length+' · '+Math.max(1,Math.round(span/7))+' '+(S.lang==='en'?'weeks':'нед.')};}
  function renderV7ExerciseHistory(id){var info=qs('#modal .modal-info'),swap=$('swap-reasons');if(!info||!swap)return;var host=$('modal-history-v7');if(!host){host=document.createElement('section');host.id='modal-history-v7';host.className='v7-ex-history';var block=swap.closest('div');if(block&&block.parentNode)block.parentNode.insertBefore(host,block);else info.appendChild(host);}var sessions=[];for(var i=0;i<S.history.length&&sessions.length<3;i++){var h=S.history[i],hit=(h.items||[]).filter(function(x){return x.id===id;})[0];if(hit)sessions.push({entry:h,item:hit});}if(!sessions.length){host.hidden=true;host.innerHTML='';return;}var latest=sessions[0],sets=Array.isArray(latest.item.setLog)?latest.item.setLog.filter(function(x){return x&&x.completed;}):[];var chips=sets.slice(0,6).map(function(x){var main=(x.weight?x.weight+' × ':'')+(x.reps||'—'),extra=[];if(x.rir)extra.push('RIR '+x.rir);if(x.rpe)extra.push('RPE '+x.rpe);return'<span class="v7-history-set">'+esc(main)+(extra.length?'<small>'+esc(extra.join(' · '))+'</small>':'')+'</span>';}).join('');if(!chips)chips='<span class="v7-history-set">'+esc((latest.item.weight?latest.item.weight+' · ':'')+(latest.item.sets||'—')+' × '+(latest.item.reps||'—'))+'</span>';host.hidden=false;host.innerHTML='<div class="v7-ex-history-head"><h3>'+esc(v7c('exerciseHistory'))+'</h3><span>'+esc(latest.entry.date||'')+(sessions.length>1?' · '+sessions.length+' '+(S.lang==='en'?'sessions':'сессии'):'')+'</span></div><div class="v7-ex-history-result">'+chips+'</div>'; }
  function renderV7NutritionContext(ctx){var out=$('kbju-out');if(!out)return;var old=qs('.v7-nutrition-feedback',out);if(old)old.remove();var confidence=v7DiaryConfidence(),delta=diaryDelta('weight',14),goal=kbjuGoalKey(ctx.goal),text='';if(delta===null||S.diary.length<2){text=S.lang==='en'?'There is not enough progress data to adjust the target. Keep the current estimate and collect at least a few comparable check-ins.':'Недостаточно данных прогресса для корректировки. Сохрани текущий ориентир и накопи несколько сопоставимых check-in.';}else if(goal==='cut'){text=delta<-.2?(S.lang==='en'?'The 14-day weight direction supports the current fat-loss target. No calorie change is justified yet.':'Направление веса за 14 дней поддерживает текущую цель снижения. Оснований менять калории пока нет.'):(S.lang==='en'?'The 14-day trend does not yet clearly support fat loss. Check adherence and collect more data before changing the target.':'14-дневный тренд пока не подтверждает снижение достаточно уверенно. Проверь соблюдение и накопи больше данных до изменения калорий.');}else if(goal==='bulk'){text=delta>.1?(S.lang==='en'?'The 14-day direction supports the current gain target. Keep the target while performance and recovery remain acceptable.':'14-дневное направление поддерживает текущую цель набора. Сохрани ориентир, пока силовые и восстановление остаются приемлемыми.'):(S.lang==='en'?'The 14-day trend is still flat or uncertain. Do not raise calories automatically; verify adherence and collect more data.':'14-дневный тренд пока плоский или неопределённый. Не повышай калории автоматически — сначала проверь соблюдение и накопи данные.');}else{text=Math.abs(delta)<=.5?(S.lang==='en'?'The 14-day weight trend is broadly stable and consistent with maintenance.':'14-дневный тренд веса в целом стабилен и соответствует поддержанию.'):(S.lang==='en'?'Weight is moving outside a stable range. Keep collecting comparable data before changing the target.':'Вес движется вне стабильного диапазона. Накопи сопоставимые данные до изменения ориентира.');}var box=document.createElement('div');box.className='v7-nutrition-feedback';box.innerHTML='<div class="v7-nutrition-feedback-head"><h3>'+esc(v7c('nutritionFeedback'))+'</h3><span class="v7-confidence" data-level="'+confidence.level+'"><b>'+esc(confidence.label)+'</b><span>'+esc(confidence.detail)+'</span></span></div><p>'+esc(text)+'</p><small>'+esc(v7c('nutritionKeep'))+'</small>';out.appendChild(box);}
  var V8_ROUTE_META={
    ru:{home:['CONTROLLED PERFORMANCE','Следующее решение'],library:['MOVEMENT DATABASE','1324 упражнения'],workout:['TRAINING LOG','Текущая сессия'],progress:['FEEDBACK LOOP','Динамика и решение'],more:['SYSTEM','Инструменты и настройки'],tools:['MARKOV MADE LAB','Сила · питание · тело · кардио · мои данные'],program:['PROGRAMME','Структура недели'],nutrition:['NUTRITION','Ориентир и динамика'],knowledge:['KNOWLEDGE','Практические разборы'],method:['METHOD','Логика системы'],settings:['SYSTEM','Локальные настройки'],about:['MARKOV MADE','Автор и границы'],how:['GUIDE','Как пользоваться'],faq:['HELP','Частые вопросы'],contact:['COACHING','Персональная адаптация']},
    en:{home:['CONTROLLED PERFORMANCE','Next decision'],library:['MOVEMENT DATABASE','1,324 exercises'],workout:['TRAINING LOG','Current session'],progress:['FEEDBACK LOOP','Trend and decision'],more:['SYSTEM','Tools and settings'],tools:['MARKOV MADE LAB','Strength · nutrition · body · cardio · my data'],program:['PROGRAMME','Weekly structure'],nutrition:['NUTRITION','Target and trend'],knowledge:['KNOWLEDGE','Practical guides'],method:['METHOD','System logic'],settings:['SYSTEM','Local settings'],about:['MARKOV MADE','Author and boundaries'],how:['GUIDE','How to use'],faq:['HELP','Common questions'],contact:['COACHING','Personal adaptation']}
  };
  function v8RouteMeta(route){
    var pack=V8_ROUTE_META[S.lang==='en'?'en':'ru'],base=pack[route]||['MARKOV MADE',v7c(route)||route],meta=base[1];
    if(route==='home'){var n=v7NextAction();meta=n.why||meta;}
    else if(route==='library'){var nres=S.lastFiltered&&S.lastFiltered.length!=null?S.lastFiltered.length:EX.length;meta=nres+' / '+EX.length+' '+(S.lang==='en'?'movements':'движений');}
    else if(route==='workout'){var sets=S.workout.reduce(function(a,w){return a+(Number(w.sets)||0);},0);meta=S.workout.length+' '+(S.lang==='en'?'exercises':'упражнений')+' · '+sets+' '+v7c('sets');}
    else if(route==='progress'){var c=v7DiaryConfidence();meta=c.label+' · '+c.detail;}
    else if(route==='program'&&S.plan&&S.plan.days){meta=(S.plan.completedDays||[]).length+' / '+S.plan.days.length+' '+(S.lang==='en'?'sessions this week':'тренировок на этой неделе');}
    return{k:base[0],t:v7c(route)||route,m:meta};
  }
  function renderV10ContextAction(route){
    var host=$('v10-context-actions');if(!host)return;
    var html='';
    if(route==='home'){
      var next=v7NextAction();html='<button class="btn btn-primary btn-sm" type="button" data-v7-action="'+esc(next.type)+'"'+(next.day!=null?' data-v7-day="'+next.day+'"':'')+'>'+esc(next.title)+'</button>';
    }else if(route==='library'){
      html=S.workout.length?'<button class="btn btn-primary btn-sm" type="button" data-v7-route="workout">'+esc((S.lang==='en'?'Train':'Тренинг')+' · '+S.workout.length)+'</button>':'<button class="btn btn-primary btn-sm" type="button" data-v10-focus="search">'+esc(S.lang==='en'?'Search exercises':'Найти упражнение')+'</button>';
    }else if(route==='workout'){
      var total=S.workout.reduce(function(a,w){return a+(Number(w.sets)||0);},0),done=S.workout.reduce(function(a,w){return a+completedSetCount(w);},0);
      html=S.workout.length?'<button class="btn btn-primary btn-sm" type="button" data-v7-action="'+(done&&done<total?'resume':'run')+'">'+esc(done&&done<total?(S.lang==='en'?'Resume':'Продолжить'):(S.lang==='en'?'Start Run Mode':'Начать Run Mode'))+'</button>':'<button class="btn btn-primary btn-sm" type="button" data-v7-route="library">'+esc(S.lang==='en'?'Build workout':'Собрать тренировку')+'</button>';
    }else if(route==='program'){
      var p=v7NextPlanDay();html=S.plan&&p>=0?'<button class="btn btn-primary btn-sm" type="button" data-v7-action="planDay" data-v7-day="'+p+'">'+esc(S.lang==='en'?'Start next day':'Начать следующий день')+'</button>':'<button class="btn btn-primary btn-sm" type="button" data-v10-focus="p-goal">'+esc(S.lang==='en'?'Build programme':'Собрать программу')+'</button>';
    }else if(route==='progress'){
      html='<button class="btn btn-primary btn-sm" type="button" data-v10-focus="g-weight">'+esc(S.lang==='en'?'Add check-in':'Добавить check-in')+'</button>';
    }else if(route==='nutrition'){
      html='<button class="btn btn-primary btn-sm" type="button" data-v10-focus="k-weight">'+esc(S.lang==='en'?'Calculate target':'Рассчитать ориентир')+'</button>';
    }
    host.innerHTML=html;
    host.hidden=!html;
  }
  function renderV8Shell(route,animate){
    route=route||v7RouteFromHash();var returning=v7Returning();document.body.dataset.v8Returning='true';document.body.dataset.v8Ready='true';
    var meta=v8RouteMeta(route),k=$('v8-context-kicker'),t8=$('v8-context-title'),m8=$('v8-context-meta'),lt=$('v8-context-local-text');
    if(k)k.textContent=meta.k;if(t8)t8.textContent=meta.t;if(m8)m8.textContent=meta.m;if(lt)lt.textContent=S.lang==='en'?'Saved on this device':'Сохранено на устройстве';
    renderV10ContextAction(route);
    qsa('[data-v8-rail]').forEach(function(a){var on=a.dataset.v8Rail===route||(route!=='home'&&route!=='library'&&route!=='workout'&&route!=='progress'&&a.dataset.v8Rail==='more');if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(animate&&!REDUCED_MOTION.matches){var target=route==='home'&&returning?$('home'):(route==='home'?qs('.hero'):$(route));if(target){target.classList.remove('v8-route-enter');requestAnimationFrame(function(){target.classList.add('v8-route-enter');setTimeout(function(){target.classList.remove('v8-route-enter');},280);});}}
  }
  function initV8Keyboard(){
    var pending=false,timer=0;window.addEventListener('keydown',function(e){
      if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;var tag=e.target&&e.target.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(e.target&&e.target.isContentEditable)){pending=false;return;}
      var key=String(e.key||'').toLowerCase();if(pending){pending=false;clearTimeout(timer);var map={h:'home',l:'library',w:'workout',p:'progress',m:'more'};if(map[key]){e.preventDefault();navigateV7(map[key],true);}return;}
      if(key==='g'){pending=true;timer=setTimeout(function(){pending=false;},900);}
    });
  }
  function renderV7All(){renderV7Nav();renderV7More();renderV7Settings();renderV7Home();initV7ProgressQuick();initV7WorkoutUtilities();applyV7Route(false);renderV8Shell(v7RouteFromHash(),false);}
  function initProductOSV7(){
    document.documentElement.dataset.release='ultimate-2026-08-v8';document.body.dataset.v7Ready='true';document.body.dataset.v8Ready='true';
    ensureMobileAppNav();renderV7All();initV8Keyboard();
    document.addEventListener('change',function(event){var select=event.target.closest('[data-load-increment]');if(!select)return;var id=select.dataset.loadIncrement,values=Object.assign({},S.settings.loadIncrements||{});if(select.value==='default')delete values[id];else values[id]=select.value;S.settings.loadIncrements=cleanLoadIncrementOverrides(values);saveSettings();renderWorkout();var replacement=qsa('[data-load-increment]').filter(function(input){return input.dataset.loadIncrement===id;})[0];if(replacement)replacement.focus();});
    subscribeToHashChanges(window, v7RouteFromHash, function(route){
      applyV7Route(true);
      track('home_action',{route:route});
      if(dataRouteNeedsLibrary(route))ensureData().then(refreshDataDependentUI);
    });
    document.addEventListener('click',function(e){var startRun=e.target.closest('[data-v8-start-run]');if(startRun){e.preventDefault();openRun();return;}var r=e.target.closest('a[data-v7-route],button[data-v7-route]');if(r){e.preventDefault();navigateV7(r.dataset.v7Route,true);return;}var a=e.target.closest('[data-v7-action]');if(a){var type=a.dataset.v7Action;if(type==='resume'||type==='run')openRun();else if(type==='planDay')startPlanDayV7(Number(a.dataset.v7Day)||0,true);else if(type==='profile'){navigateV7('home',false);var panel=qs('.hero-panel');if(panel){$('home').hidden=true;var onboarding=qs('.hero');if(onboarding)onboarding.hidden=false;panel.scrollIntoView({block:'start'});var first=qs('.console-opt',panel);if(first)first.focus();}}else if(type==='checkin'){navigateV7('progress',true);setTimeout(function(){if($('g-weight'))$('g-weight').focus();},80);}else if(type==='nutrition'){navigateV7('nutrition',true);setTimeout(function(){if($('nlog-calories'))$('nlog-calories').focus();},80);}else navigateV7(V7_ROUTE_IDS[type]?type:(type==='program'?'program':'library'),true);track('home_action',{action:type});return;}var th=e.target.closest('[data-v7-theme]');if(th){S.theme=th.dataset.v7Theme;applyTheme();renderV7Settings();return;}var rd=e.target.closest('[data-v10-reading]');if(rd){var reading=rd.dataset.v10Reading;if(['balanced','comfortable','large'].indexOf(reading)!==-1){S.settings.reading=reading;saveSettings();applyReadability();renderV7Settings();}return;}var focusTarget=e.target.closest('[data-v10-focus]');if(focusTarget){var focusEl=$(focusTarget.dataset.v10Focus);if(focusEl){focusEl.scrollIntoView({block:'center',behavior:REDUCED_MOTION.matches?'auto':'smooth'});window.setTimeout(function(){try{focusEl.focus({preventScroll:true});}catch(_e){}},REDUCED_MOTION.matches?0:220);}return;}var st=e.target.closest('[data-v7-setting]');if(st){var key=st.dataset.v7Setting;S.settings[key]=!S.settings[key];saveSettings();renderV7Settings();if(runOpen())renderRun();return;}if(e.target.closest('[data-v7-coach]')){$('coach-switch').click();renderV7Settings();return;}var data=e.target.closest('[data-v7-data]');if(data){var map={export:'data-export',import:'data-import',clear:'data-clear'};var target=$(map[data.dataset.v7Data]);if(target)target.click();return;}},true);
    if(window.MutationObserver){var mo=new MutationObserver(function(){renderV7Home();syncV7Floating();});['workout-list','hist','prog-out','plan-out'].forEach(function(id){var el=$(id);if(el)mo.observe(el,{childList:true,subtree:false,attributes:true,attributeFilter:['data-filled']});});}
    applyV7Route(false);window.mmgV7={navigate:navigateV7,get route(){return v7RouteFromHash();},render:renderV7All};window.mmgV8=window.mmgV7;
  }

  function renderV10WorkoutBalance(){
    var host=$('v10-workout-balance');if(!host)return;
    var rows=S.workout.map(function(w){return{w:w,ex:BY_ID[w.id]};}).filter(function(r){return !!r.ex;});
    if(!rows.length){host.hidden=true;host.innerHTML='';return;}
    var totalSets=rows.reduce(function(a,r){return a+(Number(r.w.sets)||0);},0);
    var zoneSets=Object.create(null),targetHits=Object.create(null),compound=0;
    rows.forEach(function(r){
      zoneSets[r.ex.zone]=(zoneSets[r.ex.zone]||0)+(Number(r.w.sets)||0);
      targetHits[r.ex.target]=(targetHits[r.ex.target]||0)+1;
      if(exKind(r.ex)==='compound')compound++;
    });
    var ordered=Object.keys(zoneSets).sort(function(a,b){return zoneSets[b]-zoneSets[a];});
    var top=ordered[0],topSets=top?zoneSets[top]:0;
    var maxSame=Math.max.apply(null,Object.keys(targetHits).map(function(k){return targetHits[k];}).concat([0]));
    var high=topSets>14;
    var duplicated=maxSame>=3;
    var noCompound=compound===0&&rows.length>=4;
    var focused=ordered.length===1&&rows.length>=4;
    var status=high?(S.lang==='en'?'Volume concentrated':'Объём сильно сконцентрирован'):(duplicated?(S.lang==='en'?'Check duplication':'Проверь дублирование'):(noCompound?(S.lang==='en'?'Isolation-heavy':'Много изоляции'):(focused?(S.lang==='en'?'Focused session':'Фокусная сессия'):(S.lang==='en'?'Balanced structure':'Сбалансированная структура'))));
    var state=(high||duplicated)?'watch':(noCompound?'neutral':'ok');
    host.hidden=false;
    host.innerHTML='<div class="v10-balance-head"><div><span class="eyebrow">'+esc(S.lang==='en'?'SESSION STRUCTURE':'СТРУКТУРА СЕССИИ')+'</span><b>'+esc(status)+'</b></div><span class="signal" data-state="'+state+'">'+esc(totalSets+' '+v7c('sets'))+'</span></div>'+
      '<div class="v10-balance-metrics"><div><span>'+esc(S.lang==='en'?'Compound':'Составные')+'</span><strong>'+Math.round(compound/rows.length*100)+'%</strong></div><div><span>'+esc(S.lang==='en'?'Body areas':'Зоны тела')+'</span><strong>'+ordered.length+'</strong></div><div><span>'+esc(S.lang==='en'?'Estimated time':'Оценка времени')+'</span><strong>'+Math.max(10,round(totalSets*2.6+rows.length*2))+' '+esc(S.lang==='en'?'min':'мин')+'</strong></div></div>'+
      '<div class="v10-zone-load">'+ordered.slice(0,4).map(function(z){var pct=Math.round(zoneSets[z]/Math.max(1,totalSets)*100);return'<span><b>'+esc(labelZone(z))+'</b><i><u style="width:'+pct+'%"></u></i><em>'+zoneSets[z]+'</em></span>';}).join('')+'</div>'+
      (high?'<p class="small">'+esc(S.lang==='en'?'One body area carries more than 14 planned sets. Check whether every exercise is necessary before adding more volume.':'На одну зону приходится больше 14 запланированных подходов. Проверь, действительно ли нужны все упражнения, прежде чем добавлять объём.')+'</p>':(duplicated?'<p class="small">'+esc(S.lang==='en'?'Three or more exercises share the same primary target. Check whether every variation adds a distinct purpose.':'Три или больше упражнений имеют одну основную целевую мышцу. Проверь, действительно ли каждый вариант решает отдельную задачу.')+'</p>':(noCompound?'<p class="small">'+esc(S.lang==='en'?'The session contains no compound movement. That may be intentional, but verify that the session still has a clear anchor exercise.':'В сессии нет составного движения. Это может быть осознанно, но проверь, есть ли у тренировки понятное основное упражнение.')+'</p>':'')));
  }

  /* Wrap proven renderers instead of duplicating business logic. */
  var _renderSystemV7=renderSystem;renderSystem=function(){_renderSystemV7();if(document.body&&document.body.dataset.v7Ready==='true')applyV7Route(false);};
  var _renderWorkoutV7=renderWorkout;renderWorkout=function(){_renderWorkoutV7();addProgressionAdviceV7();renderV10WorkoutBalance();renderV7Home();if(document.body&&document.body.dataset.v8Ready==='true')renderV8Shell(v7RouteFromHash(),false);};
  var _renderHistoryV7=renderHistory;renderHistory=function(){_renderHistoryV7();renderV7Home();};
  var _renderProgressV7=renderProgress;renderProgress=function(){_renderProgressV7();renderV7Home();if(document.body&&document.body.dataset.v8Ready==='true')renderV8Shell(v7RouteFromHash(),false);};
  var _openExerciseProductOSV7=openExercise;openExercise=function(id,trigger,silent){var result=_openExerciseProductOSV7(id,trigger,silent);renderV7ExerciseHistory(id);return result;};
  var _decorateKbjuProductOSV7=decorateKbju;decorateKbju=function(ctx){var result=_decorateKbjuProductOSV7(ctx);renderV7NutritionContext(ctx);renderV7Home();return result;};
  var _progressIntelligenceHtmlProductOSV7=progressIntelligenceHtml;progressIntelligenceHtml=function(){var html=_progressIntelligenceHtmlProductOSV7();if(!html)return html;var c=v7DiaryConfidence(),badge='<div class="v7-confidence" data-level="'+c.level+'"><b>'+esc(c.label)+'</b><span>'+esc(c.detail)+'</span></div>';return html.replace('<div class="intel-metrics">',badge+'<div class="intel-metrics">');};
  var _applyLangProductOSV7=applyLang;applyLang=function(initial){_applyLangProductOSV7(initial);renderV7All();renderNutritionLog();renderWeeklyNutritionBudget();renderNutritionTrend();if(S.activeId)renderV7ExerciseHistory(S.activeId);};
  var _scrollToIdProductOSV7=scrollToId;scrollToId=function(id){if(routeIsKnown&&routeIsKnown(id)){navigateV7(id,true);return;}_scrollToIdProductOSV7(id);};
  var _scrollToLibraryProductOSV7=scrollToLibrary;scrollToLibrary=function(){navigateV7('library',false);requestAnimationFrame(function(){var el=$('library');if(el)el.scrollIntoView({block:'start',behavior:REDUCED_MOTION.matches?'auto':'smooth'});});};


  async function init() {
    window.addEventListener('mmg:error',function(event){lastLocalError=String(event&&event.detail&&event.detail.key||'unknown');renderV7Diagnostics();});
    var modules = {};
    try {
      var moduleLoader = await import('./src/app/load-modules.mjs');
      modules = await moduleLoader.loadAppModules(function(key) {
        window.dispatchEvent(new CustomEvent('mmg:error', { detail: { key: key } }));
      });
    } catch (error) {
      window.dispatchEvent(new CustomEvent('mmg:error', { detail: { key: 'module-loader' } }));
    }
    var router = modules.router;
    if (router) {
      var routeViews = router.ROUTE_VIEWS;
      routeIsKnown = router.isKnownRoute;
      normalizeRouteHash = router.normalizeRouteHash;
      V7_ROUTES = routeViews;
      V7_ROUTE_IDS = Object.keys(routeViews).reduce(function(a,k){a[k]=1;return a;},{});
    }
    if (modules.i18n) runtimeTranslator = modules.i18n.createTranslator(T, function(){return S.lang;});
    if (modules.workoutGroups) workoutExecutionOrderFn = modules.workoutGroups.workoutExecutionOrder;
    if (modules.today) todayDecisionEngine = modules.today.nextWorkoutAction;
    if (modules.mesocycle) mesocycleStatusFn = modules.mesocycle.mesocycleStatus;
    if (modules.weeklyReview) {
      weeklyReviewDecisionFn = modules.weeklyReview.weeklyReviewDecision;
      cleanWeeklyReviewsFn = modules.weeklyReview.cleanWeeklyReviews;
    }
    if (modules.weightTrend) weightTrendFn = modules.weightTrend.weightTrend;
    if (modules.nutritionAnalytics) weeklyNutritionBudgetFn = modules.nutritionAnalytics.weeklyNutritionBudget;
    if (modules.substitutions) substitutionRanker = modules.substitutions.rankSubstitutions;
    if (modules.personalRecords) {
      detectSetPersonalRecords = modules.personalRecords.detectSetPersonalRecords;
      detectVolumePersonalRecords = modules.personalRecords.detectVolumePersonalRecords;
    }
    if (modules.calculatorHistory) cleanCalculatorResultsFn = modules.calculatorHistory.cleanCalculatorResults;
    try {
      var persistence = modules.persistence;
      if (!persistence) throw new Error('IndexedDB persistence module did not load');
      cleanCustomExercises = persistence.cleanCustomExercises;
      cleanEquipmentProfiles = persistence.cleanEquipmentProfiles;
      cleanIdbExercisePreferences = persistence.cleanExercisePreferences;
      cleanNutritionDays = persistence.cleanNutritionDays;
      cleanMeasurementsFn = persistence.cleanMeasurements;
      databaseCustomExercises = cleanCustomExercises(store.json(K.customExercises, []));
      databaseEquipmentProfiles = cleanEquipmentProfiles(store.json(K.equipmentProfiles, []));
      historyRepository = await persistence.createHistoryRepository();
      databaseNutritionDays = await historyRepository.migrateLegacyNutritionDays(store.json(K.nutritionLog, []));
      databaseHistory = await historyRepository.migrateLegacy(store.json(K.history, []));
      databaseCustomExercises = await historyRepository.migrateLegacyCustomExercises(databaseCustomExercises);
      databaseEquipmentProfiles = await historyRepository.migrateLegacyEquipmentProfiles(databaseEquipmentProfiles);
      databaseExercisePreferences = await historyRepository.migrateLegacyExercisePreferences(cleanIdbExercisePreferences(store.json(K.exercisePreferences, {})));
      var legacyAppState = {};
      Object.keys(indexedAppStateKeys).forEach(function(key){var value=store.get(key);if(value!==null)legacyAppState[key]=value;});
      databaseAppState = await historyRepository.migrateLegacyUserState(legacyAppState);
      databaseMeasurements = await historyRepository.migrateLegacyMeasurements(store.json(K.diary, []), K.diary);
      delete databaseAppState[K.diary];
      memoryStore[K.diary] = JSON.stringify(databaseMeasurements);
      databaseProgram = await historyRepository.migrateLegacyProgram(store.get(K.plan), K.plan);
      delete databaseAppState[K.plan];
      if (databaseProgram == null) delete memoryStore[K.plan]; else memoryStore[K.plan] = databaseProgram;
      try { databaseCalculatorResults = cleanCalculatorResultsFn(JSON.parse(databaseAppState[K.calculatorHistory] || '[]')); }
      catch (_calculatorStateError) { databaseCalculatorResults = []; }
      Object.keys(indexedAppStateKeys).forEach(function(key){
        if(!Object.prototype.hasOwnProperty.call(databaseAppState,key))return;
        memoryStore[key]=databaseAppState[key];
        try{if(storageOk){if(key===K.settings)window.localStorage.setItem(key,databaseAppState[key]);else window.localStorage.removeItem(key);}}catch(e){storageWarnings.push({key:key,type:key===K.settings?'mirror-write':'mirror-remove',at:Date.now()});}
      });
      indexedAppStateReady = true;
      Object.keys(indexedRepositoryKeys).forEach(function(key){try{if(storageOk)window.localStorage.removeItem(key);}catch(e){storageWarnings.push({key:key,type:'mirror-remove',at:Date.now()});}});
      activeEquipmentProfileId = store.get(K.equipmentProfileActive) || '';
      store.set(K.customExercises, JSON.stringify(databaseCustomExercises));
      store.set(K.equipmentProfiles, JSON.stringify(databaseEquipmentProfiles));
    } catch (error) {
      historyRepository = null;
      databaseHistory = null;
      databaseNutritionDays = cleanNutritionDays(store.json(K.nutritionLog, []));
      databaseCustomExercises = cleanCustomExercises(store.json(K.customExercises, []));
      databaseEquipmentProfiles = cleanEquipmentProfiles(store.json(K.equipmentProfiles, []));
      databaseExercisePreferences = cleanIdbExercisePreferences(store.json(K.exercisePreferences, {}));
      var fallbackMeasurements = store.json(K.diary, []), legacyMeasurements = [];
      try { legacyMeasurements = JSON.parse(databaseAppState[K.diary] || '[]'); } catch (_legacyMeasurementsError) {}
      databaseMeasurements = cleanMeasurementsFn((Array.isArray(fallbackMeasurements) ? fallbackMeasurements : []).concat(Array.isArray(legacyMeasurements) ? legacyMeasurements : []));
      databaseProgram = store.get(K.plan);
      databaseCalculatorResults = cleanCalculatorResultsFn(store.json(K.calculatorHistory, []));
      indexedAppStateReady = false;
      storageWarnings.push({ key: K.history, type: 'indexeddb-unavailable', at: Date.now() });
    }
    document.documentElement.dataset.storageReady = 'true';
    document.documentElement.dataset.storageMode = historyRepository ? 'indexeddb' : 'degraded';
    var initialRoute = (location.hash || '#home').slice(1).split('?')[0];
    var hasPersistedExerciseState = !!(store.get(K.fav) || store.get(K.workout) || store.get(K.plan) || store.get(K.exercisePreferences) || Object.keys(databaseExercisePreferences).length || databaseCustomExercises.length);
    var needsData = dataRouteNeedsLibrary(initialRoute) || hasPersistedExerciseState;
    if (needsData) window.dispatchEvent(new CustomEvent('mmg:stage', { detail: { key: 'data' } }));
    var contentLoaded = await loadContent();
    var dataLoaded = needsData ? await ensureData() : true;
    if (!dataLoaded && needsData) {
      var grid = $('grid');
      if (grid) grid.innerHTML = '<div class="empty v8-grid-span"><b>Библиотека не загрузилась</b>' +
        '<p>Обнови страницу. Если не помогает — проверь, что файл открыт полностью.</p></div>';
      window.dispatchEvent(new CustomEvent('mmg:error', { detail: { key: 'data' } }));
      return;
    }
    await ensureDefaultEquipmentProfiles();
    S.exercisePreferences = cleanExercisePreferences(databaseExercisePreferences);
    store.set(K.exercisePreferences, JSON.stringify(S.exercisePreferences));
    store.set(K.calculatorHistory, JSON.stringify(databaseCalculatorResults));
    if(activeEquipmentProfileId){
      var activeProfile=databaseEquipmentProfiles.filter(function(profile){return profile.id===activeEquipmentProfileId;})[0];
      if(activeProfile)S.equipment=activeProfile.equipment.slice();
      else{activeEquipmentProfileId='';store.set(K.equipmentProfileActive,'');}
    }

    captureRu();
    registerLegacyEnglishStrings();
    migrate();
    migrateEco();
    applyTheme();

    $('stat-total').textContent = DATA_READY ? EX.length : DATA_EXPECTED;
    $('stat-zones').textContent = DATA_READY ? ZONES.length : 10;
    $('stat-equip').textContent = DATA_READY ? EQUIPMENT.length : 29;
    $('year').textContent = String(new Date().getFullYear());

    qsa('#density [data-density]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.density === S.density));
    });
    if (S.query) $('search').value = S.query;

    bindHeader();
    bindLibrary();
    bindCustomExerciseEditor();
    bindModal();
    bindWorkout();
    bindTools();
    bindCmdk();
    bindGlobalKeys();
    if (C) bindEco();
    initPremiumPresentation();
    initProductionV3();
    initUltimateExperience();
    initProductionV5();
    initProductOSV7();
    $('data-clear').addEventListener('click', function () { clearAll(); });

    $('coach-switch').setAttribute('aria-pressed', String(S.coachOn));
    qsa('.kb-cats [data-kbcat]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.kbcat === S.kbCat));
    });
    syncWorkoutMeta();
    $('g-date').value = todayISO();

    applyLang(true);      // отрисует доску мышц, фильтры, сетку, тренировку и заглушки
    bindObservers();
    heroPeek();
    refreshDataDependentUI();
    document.documentElement.dataset.coreReady = 'true';
    document.documentElement.dataset.routeReady = v7RouteFromHash();
    document.documentElement.dataset.appReady = 'true';
      window.mmgLocalData = Object.freeze({
      readSnapshot: function () {
        return {
          history: S.history.slice(),
          measurements: S.diary.slice(),
          nutritionDays: databaseNutritionDays.slice(),
          calculatorResults: databaseCalculatorResults.slice()
        };
      },
      saveCalculatorResult: function (record) {
        var id = 'calc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        var clean = cleanCalculatorResultsFn([Object.assign({ id: id, createdAt: new Date().toISOString() }, record)]);
        if (!clean.length) return false;
        databaseCalculatorResults = cleanCalculatorResultsFn(clean.concat(databaseCalculatorResults));
        store.set(K.calculatorHistory, JSON.stringify(databaseCalculatorResults));
        return true;
      }
    });
    window.dispatchEvent(new CustomEvent('mmg:ready', { detail: { exercises: DATA_READY ? EX.length : DATA_EXPECTED, content: !!contentLoaded, dataReady: DATA_READY } }));

    if (!DATA_READY) {
      var preload = function () { ensureData().then(function () { refreshDataDependentUI(); }); };
      if (window.requestIdleCallback) window.requestIdleCallback(preload, { timeout: 4000 });
      else window.setTimeout(preload, 1200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init().catch(function (error) {
      console.error('[MMG] application initialisation failed', error);
      window.dispatchEvent(new CustomEvent('mmg:error', { detail: { key: 'init' } }));
    }); }, { once: true });
  } else {
    init().catch(function (error) {
      console.error('[MMG] application initialisation failed', error);
      window.dispatchEvent(new CustomEvent('mmg:error', { detail: { key: 'init' } }));
    });
  }
})();
