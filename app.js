/* ============================================================================
   MARKOV MADE GYM — прикладной слой
   Одна точка инициализации, централизованное состояние, делегирование событий.
   Разделы: 1 утилиты · 2 хранилище · 3 словари · 4 i18n · 5 данные
            6 состояние · 7 библиотека · 8 модальное окно · 9 тренировка
            10 КБЖУ · 11 план · 12 заявка · 13 оверлеи
            15 экосистема тренера · 16 инструменты · 17 словари слоя
            18 связывание · 14 инициализация
   ========================================================================= */
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
  var memoryStore = {};
  var storageWarnings = [];
  var storageOk = (function () {
    try {
      var k = '__mmg_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  var store = {
    get: function (key) {
      try { return storageOk ? window.localStorage.getItem(key) : (memoryStore[key] || null); }
      catch (e) { return memoryStore[key] || null; }
    },
    set: function (key, value) {
      memoryStore[key] = value;
      try {
        if (storageOk) window.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        storageWarnings.push({ key: key, type: 'write', at: Date.now() });
        return !storageOk;
      }
    },
    remove: function (key) {
      delete memoryStore[key];
      try { if (storageOk) window.localStorage.removeItem(key); } catch (e) {}
    },
    json: function (key, fallback) {
      var raw = store.get(key);
      if (!raw) return fallback;
      try {
        var parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
      } catch (e) {
        /* Corrupted production data is quarantined before the active key is reset. */
        var recoveryKey = 'mmg.recovery.' + String(key).replace(/[^a-z0-9_.-]/gi, '_') + '.' + Date.now();
        try {
          memoryStore[recoveryKey] = raw;
          if (storageOk) window.localStorage.setItem(recoveryKey, raw);
        } catch (_recoveryError) {}
        storageWarnings.push({ key: key, type: 'json', recoveryKey: recoveryKey, at: Date.now() });
        store.remove(key);
        return fallback;
      }
    }
  };

  var K = {
    fav: 'mmg.favorites.v8',
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
  /* Русский — источник правды: он берётся прямо из разметки при загрузке.
     Здесь хранится только английский слой, поэтому расхождение по покрытию
     невозможно: если ключ есть в HTML, он есть и здесь. */
  var EN = {
    'skip': 'Skip to the exercise library',
    'nav.muscles': 'Muscles', 'nav.library': 'Library', 'nav.workout': 'Workout',
    'nav.nutrition': 'Macros', 'nav.program': 'Plan', 'nav.faq': 'FAQ', 'nav.cta': 'Work with Pavel',
    'mnav.muscles': 'Target area', 'mnav.library': 'Exercise library', 'mnav.workout': 'My workout',
    'mnav.nutrition': 'Macro calculator', 'mnav.program': 'Weekly plan', 'mnav.how': 'How to use it',
    'mnav.faq': 'FAQ', 'mnav.contact': 'Work with Pavel',
    'theme.dark': 'Dark', 'theme.soft': 'Soft', 'theme.light': 'Light',
    'cta.telegram': 'Message on Telegram',
    'aria.lang': 'Interface language', 'aria.theme': 'Switch theme', 'aria.themeGroup': 'Colour theme',
    'aria.cmdk': 'Quick search', 'aria.menu': 'Menu', 'aria.menuOpen': 'Open menu', 'aria.menuClose': 'Close menu',
    'aria.presets': 'Quick picks', 'aria.filters': 'Library filters', 'aria.filtersClose': 'Close filters',
    'aria.searchClear': 'Clear search', 'aria.density': 'Grid density', 'aria.close': 'Close', 'aria.toTop': 'Back to top',

    'hero.eyebrow': 'MARKOV MADE GYM',
    'hero.title1': 'Training starts',
    'hero.title2': 'with the right choice.',
    'hero.lede': 'Choose the movement, build the session and track progress — in one local system with no sign-up.',
    'hero.ctaPrimary': 'Open the library', 'hero.ctaSecondary': 'Build a weekly plan',
    'hero.statTotal': 'exercises in the base', 'hero.statZones': 'body areas',
    'hero.statEquip': 'equipment types', 'hero.statFav': 'in your saved list',
    'hero.panelEyebrow': 'Direct entry', 'hero.panelTitle': 'Find a movement in seconds',
    'hero.panelText': 'Name, muscle, body area or equipment — in Russian or English.',
    'hero.searchLabel': 'Search the exercise library', 'hero.searchPh': 'Bench press, chest, dumbbell…',
    'hero.searchGo': 'Search', 'hero.peekLabel': 'Random movement', 'hero.peekOpen': 'Open',

    'preset.chest': 'Chest', 'preset.back': 'Back', 'preset.legs': 'Legs', 'preset.shoulders': 'Shoulders',
    'preset.arms': 'Arms', 'preset.abs': 'Core', 'preset.home': 'At home',

    'start.eyebrow': 'Quick start', 'start.title': 'Three ways into the base',
    'start.text': 'Pick a scenario — the filters set themselves and the library shows the matching movements right away.',
    'start.homeTitle': 'Training at home', 'start.homeText': 'Body weight, bands and dumbbells — no gym, no machines.',
    'start.gymTitle': 'Training at the gym', 'start.gymText': 'Barbells, cables, machines and the Smith rack — full access to the base.',
    'start.swapTitle': 'Need a substitute', 'start.swapText': 'Machine taken or the movement is not working — find another one for the same muscle.',

    'muscles.eyebrow': 'Target area', 'muscles.title': 'Start with a body area',
    'muscles.text': 'Pick an area or a specific muscle — the library keeps only the relevant exercises.',
    'muscles.reset': 'Clear selection',

    'library.eyebrow': 'Library', 'library.title': 'Find the exercise and check the technique',
    'library.text': 'Search and filters run across the whole base. From a card you can open the technique, save the movement or add it to today\u2019s session.',
    'library.resetAll': 'Clear everything', 'library.searchLabel': 'Search the library',
    'library.searchPh': 'Name, muscle or equipment…', 'library.sortLabel': 'Sort order',
    'library.showAll': 'Show all',

    'filters.title': 'Filters', 'filters.favOnly': 'Saved only', 'filters.favClear': 'Clear saved list',
    'filters.favHint': 'Saved exercises stay in this browser and survive a reload.',
    'filters.zone': 'Body area', 'filters.muscle': 'Target muscle', 'filters.equipment': 'Equipment',
    'filters.reset': 'Reset', 'filters.apply': 'Show',

    'sort.recommended': 'Compound first', 'sort.name': 'By name', 'sort.muscle': 'By muscle',
    'sort.equipment': 'By equipment', 'sort.favorites': 'Saved first',
    'density.compact': 'Dense', 'density.default': 'Normal', 'density.roomy': 'Large',
    'mfb.found': 'found',

    'workout.eyebrow': 'Today\u2019s session', 'workout.title': 'My workout',
    'workout.text': 'Saved exercises are your long-term shortlist. The workout is what you are doing today: order, sets, reps, load and a done marker.',
    'workout.add': 'Add exercises', 'workout.kpiEx': 'exercises', 'workout.kpiSets': 'sets', 'workout.kpiTime': 'min',
    'workout.copy': 'Copy workout', 'workout.share': 'Share', 'workout.clear': 'Clear workout',
    'workout.saveHint': 'The workout is stored on this device. No account needed.',
    'workout.progressEmpty': 'Done: 0 of 0',

    'kbju.eyebrow': 'Nutrition', 'kbju.title': 'Starting macro estimate',
    'kbju.text': 'The calculation gives a starting point and a calorie corridor, not a medical prescription. What matters next is the trend over two to three weeks.',
    'kbju.sex': 'Sex', 'kbju.male': 'Male', 'kbju.female': 'Female',
    'kbju.age': 'Age, years', 'kbju.height': 'Height, cm', 'kbju.weight': 'Weight, kg',
    'kbju.fat': 'Body fat %, if known', 'kbju.waist': 'Waist, cm (for tracking)',
    'kbju.activity': 'Daily activity',
    'kbju.act1': 'Sedentary, few steps', 'kbju.act2': 'Low, 5–7k steps', 'kbju.act3': 'Moderate, 8–11k steps',
    'kbju.act4': 'High, lots of movement', 'kbju.act5': 'Physical job',
    'kbju.goal': 'Goal', 'kbju.goalCut': 'Fat loss', 'kbju.goalMaintain': 'Maintenance',
    'kbju.goalLean': 'Lean gain', 'kbju.goalBulk': 'Mass gain',
    'kbju.training': 'Training type', 'kbju.trStrength': 'Strength', 'kbju.trMixed': 'Strength + cardio',
    'kbju.trEndurance': 'Endurance', 'kbju.trHealth': 'Health and tone',
    'kbju.pace': 'Rate of change', 'kbju.paceGentle': 'Gentle', 'kbju.paceModerate': 'Moderate', 'kbju.paceAssertive': 'Assertive',
    'kbju.submit': 'Calculate macros',
    'kbju.disclaimer': 'This is a reference estimate, not a substitute for a doctor or dietitian. With medical conditions, pregnancy or medication, targets should be set by a specialist.',

    'plan.eyebrow': 'Weekly structure', 'plan.title': 'Starting training plan',
    'plan.text': 'The inputs genuinely change the output: split, volume, reps, rest, cardio and the actual exercises are drawn from this same base.',
    'plan.goal': 'Goal', 'plan.goalFat': 'Fat loss', 'plan.goalMuscle': 'Muscle gain',
    'plan.goalStrength': 'Strength', 'plan.goalHealth': 'Health and tone',
    'plan.level': 'Experience', 'plan.lvlBeginner': 'Beginner (under a year)',
    'plan.lvlMiddle': 'Intermediate (1–3 years)', 'plan.lvlAdvanced': 'Advanced (3+ years)',
    'plan.days': 'Sessions per week', 'plan.time': 'Session length',
    'plan.time35': '35 minutes', 'plan.time50': '50 minutes', 'plan.time70': '70 minutes', 'plan.time90': '90 minutes',
    'plan.place': 'Where you train', 'plan.placeGym': 'Gym', 'plan.placeHome': 'Home', 'plan.placeMixed': 'Home + gym',
    'plan.focus': 'Priority', 'plan.focusBalanced': 'Balanced full body', 'plan.focusChest': 'Chest',
    'plan.focusBack': 'Back', 'plan.focusLegs': 'Legs', 'plan.focusShoulders': 'Shoulders',
    'plan.focusArms': 'Arms', 'plan.focusCore': 'Core',
    'plan.submit': 'Build the plan',
    'plan.disclaimer': 'This is a starting framework. With pain, injuries, health limitations or competitive goals the programme needs individual adaptation.',

    'how.eyebrow': 'Order of work', 'how.title': 'How to use the system',
    'how.text': 'Four steps that repeat before every session. The order is the method.',
    'how.s1t': 'Define the task', 'how.s1p': 'Which muscle works today and what is available: gym, home, dumbbells or body weight only.',
    'how.s2t': 'Narrow the list', 'how.s2p': 'Keep the movements you can actually perform today. Active filters sit above the grid and come off one at a time.',
    'how.s3t': 'Check the technique', 'how.s3p': 'Open the card: animation, target and secondary muscles, step-by-step execution and what to control.',
    'how.s4t': 'Build the session', 'how.s4p': 'Add movements to the workout, set sets, reps and load. Save the good ones for later.',

    'faq.eyebrow': 'FAQ', 'faq.title': 'Common questions',
    'faq.text': 'Short answers to what usually matters before a first session and before changing a routine that already works.',
    'faq.ctaLibrary': 'Go to the exercises',
    'faq.q1': 'What is MARKOV MADE GYM?',
    'faq.a1': 'A working tool for training: 1324 exercises with filters by body area, muscle and equipment, step-by-step technique, a saved list, a session builder, a macro calculator and a starting weekly plan.',
    'faq.q2': 'How do I quickly find an exercise for a specific muscle?',
    'faq.a2': 'Pick a body area or target muscle in the “Target area” section, then narrow by equipment in the filters. The list updates instantly — open, save or add the movement to your workout.',
    'faq.q3': 'Can I use it on a phone during a session?',
    'faq.a3': 'Yes. On a phone the filters open as a bottom panel, cards are compact, the technique opens full screen and the current workout stays at hand.',
    'faq.q4': 'Does it work for training at home?',
    'faq.a4': 'Yes. The equipment filter includes body weight, bands, dumbbells and other home options. The “Training at home” scenario keeps only those.',
    'faq.q5': 'Do the saved list and workout survive a reload?',
    'faq.a5': 'Yes. Saved exercises, the workout, language and theme are stored locally in this browser. No sign-up, nothing is sent anywhere. Private browsing may clear them on close.',
    'faq.q6': 'How accurate is the macro calculation?',
    'faq.a6': 'Mifflin–St Jeor and Katch–McArdle give a starting range, not a prescription. From there, follow weekly average weight, waist, strength numbers, sleep and hunger.',
    'faq.q7': 'Does this replace a coach?',
    'faq.a7': 'No. It helps you choose an exercise, check technique and build a starting structure. Pain, injuries, limitations and complex goals need individual adaptation.',

    'lead.eyebrow': 'Personal work', 'lead.title': 'When the tools are no longer enough',
    'lead.text': 'The library, macros and starting plan cover choice and structure. Personal work matters where context decides: injuries and limitations, a tight schedule, a plateau, or preparing for a fixed date.',
    'lead.i1t': 'Assessment.', 'lead.i1p': 'Starting point, limitations, schedule and the real goal.',
    'lead.i2t': 'Programme.', 'lead.i2p': 'Exercises, volume, progression and nutrition built around your week.',
    'lead.i3t': 'Support.', 'lead.i3p': 'Tracking and corrections when something stops going to plan.',
    'lead.note': 'How this differs from a ready-made plan: a ready plan is the same for everyone, a personal one is built around your limitations and changes as you go.',
    'lead.formTitle': 'Request for personal work', 'lead.formTime': '≈ 60 seconds',
    'lead.name': 'Name', 'lead.namePh': 'What should I call you',
    'lead.contact': 'Contact for the reply', 'lead.contactPh': 'Telegram, email or phone',
    'lead.format': 'Format', 'lead.fOnline': 'Online coaching', 'lead.fConsult': 'Assessment and consultation',
    'lead.fProgram': 'Personal programme',
    'lead.start': 'When you can start', 'lead.sNow': 'Now', 'lead.sWeek': 'Within a week',
    'lead.sMonth': 'This month', 'lead.sLater': 'Still looking around',
    'lead.goal': 'Main goal', 'lead.goalPh': 'Fat loss, mass, strength, health…',
    'lead.context': 'What I should know', 'lead.contextPh': 'Experience, schedule, injuries and limitations, nutrition, deadlines, what you have already tried',
    'lead.contextHint': 'Optional, but it noticeably shortens the first conversation.',
    'lead.send': 'Send the request via Telegram', 'lead.copy': 'Copy the request text',
    'lead.privacy': 'The form does not send anything by itself: it assembles the text and opens Telegram, where you send it yourself. No spam, no sales pressure.',

    'modal.steps': 'Step-by-step technique',
    'modal.warning': 'Pain, numbness or sharp discomfort is a signal to stop and swap the movement, not to push through. With injuries and limitations the exercise needs to be adapted.',
    'modal.add': 'Add to workout', 'modal.copy': 'Copy',

    'cmdk.label': 'Quick search across exercises and sections', 'cmdk.ph': 'Exercise, muscle or section…',
    'cmdk.results': 'Results', 'cmdk.hint1': '↑↓ move', 'cmdk.hint2': 'Enter open', 'cmdk.hint3': 'Esc close',

    'footer.text': 'Exercise library, technique, session builder, macros and a starting weekly plan. A project by Pavel Markov / MarkovMade.',
    'footer.colProduct': 'Sections', 'footer.colHelp': 'Help',
    'footer.legal': 'Information only — this does not replace medical advice.'
  };

  Object.assign(EN, {
    'musnav.mapTitle':'Anatomical navigation',
    'musnav.mapText':'Choose an area on the map or use the list on the right.',
    'musnav.front':'Front', 'musnav.back':'Back', 'musnav.viewAria':'Body view',
    'musnav.frontAria':'Front muscle-area map', 'musnav.backAria':'Back muscle-area map',
    'musnav.access':'The list on the right mirrors the map for keyboard and screen-reader access.',
    'musnav.selector':'Load navigator', 'musnav.choose':'Choose a body area',
    'musnav.chooseText':'Then refine to a target muscle — results update immediately.',
    'musnav.zonesAria':'Body areas', 'musnav.filterMuscle':'Search muscles',
    'musnav.filterMusclePh':'Find a muscle…', 'musnav.filterEquipment':'Search equipment',
    'musnav.filterEquipmentPh':'Find equipment…'
  });


  Object.assign(EN, {
    'v3.timerAdjust': 'Rest timer adjustment',
    'v3.timerMinus': 'Reduce rest timer by 15 seconds',
    'v3.timerPlus': 'Increase rest timer by 15 seconds',
    'v3.timerSkip': 'Skip rest timer'
  });

  /* Строки, которые создаются в рантайме. */
  var T = {
    save: { ru: 'Сохранить', en: 'Save' },
    saved: { ru: 'В избранном', en: 'Saved' },
    favAdd: { ru: 'Сохранить упражнение', en: 'Save exercise' },
    favRemove: { ru: 'Убрать из избранного', en: 'Remove from saved' },
    favAdded: { ru: 'Сохранено в избранное', en: 'Added to your saved list' },
    favRemoved: { ru: 'Убрано из избранного', en: 'Removed from your saved list' },
    favCleared: { ru: 'Избранное очищено', en: 'Saved list cleared' },
    favEmptyToast: { ru: 'В избранном пока пусто', en: 'Your saved list is empty' },
    openTechnique: { ru: 'Открыть технику', en: 'View technique' },
    addToWorkout: { ru: 'Добавить в тренировку', en: 'Add to workout' },
    inWorkout: { ru: 'Уже в тренировке', en: 'Already in the workout' },
    addedToWorkout: { ru: 'Добавлено в тренировку', en: 'Added to the workout' },
    removedFromWorkout: { ru: 'Убрано из тренировки', en: 'Removed from the workout' },
    copied: { ru: 'Скопировано', en: 'Copied' },
    copyFailed: { ru: 'Скопировать не удалось — выдели текст вручную', en: 'Copy failed — select the text manually' },
    resultsLine: { ru: 'Найдено <b>{found}</b> из {total} • показано {shown}', en: 'Found <b>{found}</b> of {total} • showing {shown}' },
    loadMore: { ru: 'Показать ещё {n}', en: 'Show {n} more' },
    loadNoteMore: { ru: 'Показано {shown} из {found}. Уточни фильтр или открой ещё.', en: 'Showing {shown} of {found}. Narrow the filter or load more.' },
    loadNoteAll: { ru: 'Показаны все найденные упражнения.', en: 'All matching exercises are shown.' },
    emptyTitle: { ru: 'Ничего не найдено', en: 'Nothing found' },
    emptyText: { ru: 'Под текущий набор фильтров в базе нет упражнений. Сними один-два условия или измени запрос.', en: 'No exercises match this filter set. Drop a condition or two, or change the query.' },
    emptyReset: { ru: 'Сбросить фильтры', en: 'Reset filters' },
    emptyFavTitle: { ru: 'В избранном пусто', en: 'Nothing saved yet' },
    emptyFavText: { ru: 'Нажми звезду на карточке — упражнение останется здесь после перезагрузки.', en: 'Tap the star on a card — the exercise stays here after a reload.' },
    searchTag: { ru: 'Поиск: {q}', en: 'Search: {q}' },
    favTag: { ru: 'Только избранное', en: 'Saved only' },
    removeFilter: { ru: 'Убрать фильтр: {name}', en: 'Remove filter: {name}' },
    zoneLabel: { ru: 'Зона тела', en: 'Body area' },
    muscleLabel: { ru: 'Целевая мышца', en: 'Target muscle' },
    secondaryLabel: { ru: 'Вторичные мышцы', en: 'Secondary muscles' },
    equipmentLabel: { ru: 'Оборудование', en: 'Equipment' },
    groupLabel: { ru: 'Мышечная группа', en: 'Muscle group' },
    openSection: { ru: 'Открыть раздел', en: 'Open section' },
    exercisesShort: { ru: 'упр.', en: 'ex.' },
    workoutEmptyTitle: { ru: 'Тренировка пока пустая', en: 'The workout is empty' },
    workoutEmptyText: { ru: 'Добавь движения кнопкой «+» на карточке или из окна техники.', en: 'Add movements with the “+” button on a card or from the technique window.' },
    workoutOpenLibrary: { ru: 'Открыть библиотеку', en: 'Open the library' },
    wSets: { ru: 'Подходы', en: 'Sets' },
    wReps: { ru: 'Повторы', en: 'Reps' },
    wWeight: { ru: 'Вес / заметка', en: 'Load / note' },
    wUp: { ru: 'Переместить выше', en: 'Move up' },
    wDown: { ru: 'Переместить ниже', en: 'Move down' },
    wRemove: { ru: 'Убрать из тренировки', en: 'Remove from the workout' },
    wDone: { ru: 'Отметить выполненным', en: 'Mark as done' },
    wProgress: { ru: 'Выполнено: {done} из {total}', en: 'Done: {done} of {total}' },
    wCleared: { ru: 'Тренировка очищена', en: 'Workout cleared' },
    wConfirmClear: { ru: 'Очистить тренировку? Действие нельзя отменить.', en: 'Clear the workout? This cannot be undone.' },
    favConfirmClear: { ru: 'Очистить избранное? Действие нельзя отменить.', en: 'Clear the saved list? This cannot be undone.' },
    wTitle: { ru: 'Тренировка MARKOV MADE GYM', en: 'MARKOV MADE GYM workout' },
    shareUnavailable: { ru: 'Поделиться нельзя — текст скопирован', en: 'Sharing unavailable — text copied instead' },

    errRequired: { ru: 'Заполни это поле', en: 'This field is required' },
    errRange: { ru: 'Введи значение от {min} до {max}', en: 'Enter a value between {min} and {max}' },
    errNumber: { ru: 'Нужно число', en: 'A number is required' },
    errContact: { ru: 'Укажи, куда прислать ответ', en: 'Tell me where to reply' },
    formHasErrors: { ru: 'Проверь отмеченные поля', en: 'Check the highlighted fields' },

    kcal: { ru: 'ккал', en: 'kcal' }, gram: { ru: 'г', en: 'g' },
    kbjuEmptyTitle: { ru: 'Результат появится здесь', en: 'The result will appear here' },
    kbjuEmptyText: { ru: 'Заполни параметры слева и нажми расчёт. Получишь коридор калорий, белки, жиры, углеводы и что отслеживать дальше.', en: 'Fill in the parameters and run the calculation. You get a calorie corridor, protein, fat, carbs and what to track next.' },
    kbjuTitle: { ru: 'Стартовый коридор', en: 'Starting corridor' },
    kbjuTdee: { ru: 'Поддержание (TDEE)', en: 'Maintenance (TDEE)' },
    kbjuBmr: { ru: 'Основной обмен', en: 'Basal rate' },
    kbjuTarget: { ru: 'Цель на сегодня', en: 'Today\u2019s target' },
    kbjuProtein: { ru: 'Белки', en: 'Protein' },
    kbjuFat: { ru: 'Жиры', en: 'Fat' },
    kbjuCarbs: { ru: 'Углеводы', en: 'Carbs' },
    kbjuRange: { ru: 'Рабочий диапазон: {lo}–{hi} {u} в день. Точность формул ограничена — держись середины и смотри на динамику.', en: 'Working range: {lo}–{hi} {u} per day. Formulas are approximate — hold the middle and watch the trend.' },
    kbjuPaceNote: { ru: 'Ожидаемый темп: {pace}. Если через 2–3 недели динамики нет, меняй калории на 5–10%.', en: 'Expected pace: {pace}. If nothing moves in two to three weeks, adjust calories by 5–10%.' },
    kbjuTrackNote: { ru: 'Что отслеживать: средний вес за 7 дней, объём талии, силовые показатели, сон, голод и настроение. Один день на весах ничего не значит.', en: 'What to track: weekly average weight, waist, strength numbers, sleep, hunger and mood. A single day on the scale means nothing.' },
    kbjuMethodMifflin: { ru: 'Метод: Mifflin–St Jeor ({bmr} {u}).', en: 'Method: Mifflin–St Jeor ({bmr} {u}).' },
    kbjuMethodKatch: { ru: 'Метод: Katch–McArdle по сухой массе {lbm} кг ({bmr} {u}). Формула точнее, когда процент жира измерен, а не оценён на глаз.', en: 'Method: Katch–McArdle on {lbm} kg lean mass ({bmr} {u}). It is more accurate when body fat is measured rather than guessed.' },
    kbjuWaistNote: { ru: 'Талия {waist} см записана как контрольная точка: при снижении жира она обычно меняется раньше веса.', en: 'Waist {waist} cm is recorded as a checkpoint: during fat loss it usually moves before body weight.' },
    kbjuCopy: { ru: 'Скопировать расчёт', en: 'Copy the result' },
    paceGentleTxt: { ru: 'мягкий, около 0,25–0,4% массы тела в неделю', en: 'gentle, about 0.25–0.4% of body weight per week' },
    paceModerateTxt: { ru: 'умеренный, около 0,5% массы тела в неделю', en: 'moderate, about 0.5% of body weight per week' },
    paceAssertiveTxt: { ru: 'интенсивный, около 0,7–1% массы тела в неделю', en: 'assertive, about 0.7–1% of body weight per week' },
    paceKeep: { ru: 'вес держится в коридоре ±1 кг', en: 'weight holds within a ±1 kg corridor' },

    planEmptyTitle: { ru: 'План появится здесь', en: 'The plan will appear here' },
    planEmptyText: { ru: 'Задай цель, уровень, количество дней, длительность, место и приоритет. Сплит, объём, повторы, отдых и упражнения соберутся под эти параметры.', en: 'Set goal, experience, days, length, place and priority. Split, volume, reps, rest and exercises are assembled from those inputs.' },
    planSets: { ru: 'подх.', en: 'sets' },
    planRest: { ru: 'Отдых', en: 'Rest' },
    planSec: { ru: 'сек', en: 'sec' },
    planCardio: { ru: 'Кардио', en: 'Cardio' },
    planProgress: { ru: 'Прогрессия', en: 'Progression' },
    planCopy: { ru: 'Скопировать план', en: 'Copy the plan' },
    planToWorkout: { ru: 'День 1 → в тренировку', en: 'Day 1 → workout' },
    planRebuild: { ru: 'Пересобрать', en: 'Rebuild' },
    planDay: { ru: 'День {n}', en: 'Day {n}' },
    planWeekly: { ru: '{days} тренировки в неделю по {time} мин · {ex} упражнений за сессию', en: '{days} sessions per week × {time} min · {ex} exercises per session' },
    planAddedDay: { ru: 'Первый день добавлен в тренировку', en: 'Day 1 added to your workout' },
    planTitle: { ru: 'Стартовый план MARKOV MADE GYM', en: 'MARKOV MADE GYM starting plan' },

    leadCopied: { ru: 'Текст заявки скопирован — вставь его в Telegram', en: 'Request text copied — paste it into Telegram' },
    leadTitle: { ru: 'Заявка на персональную работу', en: 'Request for personal work' },
    leadName: { ru: 'Имя', en: 'Name' }, leadContact: { ru: 'Контакт', en: 'Contact' },
    leadFormat: { ru: 'Формат', en: 'Format' }, leadStart: { ru: 'Старт', en: 'Start' },
    leadGoal: { ru: 'Цель', en: 'Goal' }, leadContext: { ru: 'Контекст', en: 'Context' },

    cmdkSection: { ru: 'Раздел', en: 'Section' },
    cmdkEmpty: { ru: 'Ничего не найдено', en: 'Nothing found' },
    cmdkStart: { ru: 'Начни вводить название упражнения, мышцы или раздела', en: 'Start typing an exercise, muscle or section' },
    swapToast: { ru: 'Замена на ту же мышцу: {muscle}', en: 'Substitutes for the same muscle: {muscle}' }
  };


  Object.assign(T, {
    discZones: { ru:'Зоны тела', en:'Body areas' },
    discMuscles: { ru:'Мышцы', en:'Muscles' },
    discEquipment: { ru:'Оборудование', en:'Equipment' },
    discExercises: { ru:'Упражнения', en:'Exercises' },
    discRecentSearches: { ru:'Недавние запросы', en:'Recent searches' },
    discRecentExercises: { ru:'Недавно открывали', en:'Recently viewed' },
    discNoMatches: { ru:'Совпадений нет. Попробуй название мышцы, упражнения или оборудования.', en:'No matches. Try an exercise, muscle or equipment name.' },
    discSearch: { ru:'Искать «{q}» во всей базе', en:'Search the whole library for “{q}”' },
    discZoneMeta: { ru:'Зона тела · {n} упражнений', en:'Body area · {n} exercises' },
    discMuscleMeta: { ru:'Целевая мышца · {n} упражнений', en:'Target muscle · {n} exercises' },
    discEquipMeta: { ru:'Оборудование · {n} упражнений', en:'Equipment · {n} exercises' },
    discExerciseMeta: { ru:'{muscle} · {equipment}', en:'{muscle} · {equipment}' },
    filterClearGroup: { ru:'Очистить группу', en:'Clear group' },
    wizardStep1: { ru:'Цель', en:'Goal' },
    wizardStep2: { ru:'График', en:'Schedule' },
    wizardStep3: { ru:'Условия', en:'Environment' },
    wizardStep4: { ru:'Приоритет', en:'Priority' },
    wizardStep5: { ru:'Дополнительно', en:'Advanced' },
    wizardBack: { ru:'Назад', en:'Back' },
    wizardNext: { ru:'Далее', en:'Next' },
    wizardStatus: { ru:'Шаг {i} из 5', en:'Step {i} of 5' },
    wizardSummary: { ru:'Текущие параметры', en:'Current setup' },
    wizardDays: { ru:'Дни', en:'Days' },
    wizardPlace: { ru:'Место', en:'Place' },
    wizardPriority: { ru:'Фокус', en:'Focus' },
    planAddDay: { ru:'Добавить этот день в тренировку', en:'Add this day to workout' },
    planDayAdded: { ru:'День {n} добавлен в тренировку', en:'Day {n} added to workout' },
    runPrevPerformance: { ru:'Прошлый раз', en:'Previous' },
    runNoPrev: { ru:'Для этого движения пока нет прошлой записи.', en:'No previous record for this exercise yet.' },
    runElapsed: { ru:'Время', en:'Elapsed' },
    'run.rest': { ru:'Отдых', en:'Rest' },
    runVolume: { ru:'Объём', en:'Volume' },
    runSetLabel: { ru:'Подход {i} из {n}', en:'Set {i} of {n}' },
    runCompleteSet: { ru:'Завершить подход', en:'Complete set' },
    runSaveWorkout: { ru:'Сохранить тренировку', en:'Save workout' },
    runFinishedBody: { ru:'Все упражнения отмечены. Сохрани тренировку в историю или вернись назад, если нужно что-то исправить.', en:'All exercises are complete. Save the workout to history or go back if you need to adjust anything.' },
    timerPause: { ru:'Пауза', en:'Pause' },
    timerResume: { ru:'Продолжить', en:'Resume' },
    timerSkipShort: { ru:'Пропустить', en:'Skip' },
    progressIntel: { ru:'Progress Intelligence', en:'Progress Intelligence' },
    progressIntelSub: { ru:'Сводка по последним данным без выводов из одной случайной точки.', en:'A summary of recent data without conclusions from a single isolated reading.' },
    progressWeight: { ru:'Вес', en:'Weight' },
    progressWaist: { ru:'Талия', en:'Waist' },
    progressSleep: { ru:'Сон 14 дн.', en:'Sleep 14d' },
    progressMood: { ru:'Самочувствие 14 дн.', en:'Wellbeing 14d' },
    progressStrength: { ru:'Последняя силовая', en:'Latest strength' },
    progressNeedMore: { ru:'Нужно больше данных', en:'Need more data' },
    progressAction: { ru:'Следующий вывод', en:'Next conclusion' },
    macroVisual: { ru:'Распределение калорий из макросов', en:'Calorie distribution from macros' },
    unitYears: { ru:'лет', en:'yr' },
    unitPercent: { ru:'%', en:'%' },
    sessionPrepared: { ru:'Тренировка подготовлена', en:'Workout prepared' },
    sessionExercises: { ru:'упражнений', en:'exercises' },
    sessionSets: { ru:'подходов', en:'sets' },
    sessionDone: { ru:'выполнено', en:'complete' },
    wizardProgramSteps: { ru:'Шаги программы', en:'Program steps' },
    wizardCompleteStep: { ru:'Заполни обязательные параметры текущего шага.', en:'Complete the required fields on this step.' },
    workoutResume: { ru:'Продолжить тренировку', en:'Resume workout' },
    workoutResumeHint: { ru:'Незавершённая сессия сохранена автоматически.', en:'Your unfinished session was autosaved.' },
    workoutSetsDone: { ru:'{done} из {total} подходов', en:'{done} of {total} sets' },
    progressSessions: { ru:'Тренировки 30 дн.', en:'Sessions 30d' },
    progressWorkSets: { ru:'Рабочие подходы 30 дн.', en:'Work sets 30d' },
    histDuration: { ru:'{v} мин', en:'{v} min' },
    histSetsDone: { ru:'{done}/{total} подходов', en:'{done}/{total} sets' }
  });

  function t(key, vals) {
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
      el.textContent = en ? (EN[k] != null ? EN[k] : RU_DOM[k]) : RU_DOM[k];
    });
    qsa('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph');
      el.setAttribute('placeholder', en ? (EN[k] != null ? EN[k] : RU_DOM['ph:' + k]) : RU_DOM['ph:' + k]);
    });
    qsa('[data-i18n-aria]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-aria');
      var v = en ? (EN[k] != null ? EN[k] : RU_DOM['aria:' + k]) : RU_DOM['aria:' + k];
      el.setAttribute('aria-label', v);
    });
    qsa('[data-i18n-alt]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-alt');
      var v = en ? (EN[k] != null ? EN[k] : RU_DOM['alt:' + k]) : RU_DOM['alt:' + k];
      el.setAttribute('alt', v);
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

    EX = raw.x.map(function (r, i) {
      var ex = {
        id: r[0], nameEn: r[1], nameRu: r[2],
        zone: raw.bp[r[3]], equip: raw.eq[r[4]],
        target: raw.mu[r[5]], group: raw.mu[r[6]],
        secondary: r[7].map(function (j) { return raw.mu[j]; }),
        slug: r[8], stepsEn: r[9] || [], stepsRu: r[10] || [],
        idx: i
      };
      ex.score = (ex.secondary.length * 2) + (EQUIP_WEIGHT[ex.equip] || 1);
      ex.search = norm([
        ex.id, ex.nameEn, ex.nameRu, ex.zone, ex.equip, ex.target, ex.group,
        RU_ZONE[ex.zone], EN_ZONE[ex.zone], RU_EQ[ex.equip], EN_EQ[ex.equip],
        RU_MU[ex.target], EN_MU[ex.target], RU_MU[ex.group],
        ex.secondary.join(' '),
        ex.secondary.map(function (m) { return RU_MU[m] || ''; }).join(' ')
      ].join(' '));
      BY_ID[ex.id] = ex;
      return ex;
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
    var primary = S.lang === 'en' ? ex.stepsEn : ex.stepsRu;
    return (primary && primary.length) ? primary : (ex.stepsRu.length ? ex.stepsRu : ex.stepsEn);
  }
  var MEDIA_PLACEHOLDER = 'images/exercise-placeholder.svg';
  var MEDIA_INLINE_FALLBACK = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="#101318"/><g fill="none" stroke="#6f7782" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".74"><circle cx="320" cy="120" r="34"/><path d="M320 154v92M268 202l52-32 52 32M286 344l34-98 34 98M250 244h140"/></g><path d="M70 360h500" stroke="#d8a431" stroke-width="4" opacity=".55"/><text x="320" y="395" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" letter-spacing="4" fill="#8d949e">MARKOV MADE GYM</text></svg>');
  var MEDIA_REVISION = '20260927-media1';
  function exStill(ex) { return 'images/' + ex.slug + '.jpg'; }
  function exMotion(ex) { return 'videos/' + ex.slug + '.gif?v=' + MEDIA_REVISION; }
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
  var S = {
    lang: 'ru',
    theme: 'obsidian',
    density: 'default',
    query: '',
    zones: [],
    muscles: [],
    equipment: [],
    favOnly: false,
    sort: 'recommended',
    limit: 60,
    favorites: [],
    workout: [],
    activeId: null,
    lastFiltered: []
  };

  var PAGE = 60;

  function isFav(id) { return S.favorites.indexOf(id) !== -1; }
  function inWorkout(id) {
    return S.workout.some(function (item) { return item.id === id; });
  }
  function saveFavorites() { store.set(K.fav, JSON.stringify(S.favorites)); }
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
      out.sort(function (a, b) { return (b.score - a.score) || (a.idx - b.idx); });
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
    var fav = isFav(ex.id);
    var added = inWorkout(ex.id);
    var name = exName(ex);
    var meta = ex.secondary.slice(0, 2).map(function (m) {
      return '<span class="meta-tag">+ ' + esc(labelMu(m)) + '</span>';
    }).join('');
    return '<article class="card' + (added ? ' in-workout' : '') + '" data-id="' + esc(ex.id) + '">' +
      '<div class="card-media">' +
        '<img src="' + esc(exStill(ex)) + '" data-still="' + esc(exStill(ex)) + '" data-ex-media alt="' + esc(name) + '" width="320" height="240" loading="lazy" decoding="async">' +
        '<span class="card-badge">' + esc(labelZone(ex.zone)) + '</span>' +
        (added ? '<span class="card-status">' + esc(t('inWorkout')) + '</span>' : '') +
        '<button class="fav-btn" type="button" data-fav="' + esc(ex.id) + '" aria-pressed="' + fav + '" aria-label="' +
          esc(fav ? t('favRemove') : t('favAdd')) + '">' + STAR_SVG + '</button>' +
      '</div>' +
      '<div class="card-body">' +
        '<p class="card-target">' + esc(labelMu(ex.target)) + '</p>' +
        '<h3 class="card-title">' + esc(name) + '</h3>' +
        '<div class="card-meta"><span class="meta-tag">' + premiumIcon('equipment') + esc(labelEq(ex.equip)) + '</span>' + meta + '</div>' +
        '<div class="card-actions">' +
          '<button class="btn btn-solid btn-sm" type="button" data-open="' + esc(ex.id) + '">' + esc(t('openTechnique')) + '</button>' +
          '<button class="btn btn-sm btn-add' + (added ? ' btn-primary' : ' btn-solid') + '" type="button" data-add="' + esc(ex.id) + '" aria-label="' +
            esc(added ? (S.lang === 'en' ? 'Remove from workout' : 'Убрать из тренировки') : t('addToWorkout')) + '" title="' + esc(added ? t('inWorkout') : t('addToWorkout')) + '">' +
            (added ? premiumIcon('check') : '+') + '</button>' +
        '</div>' +
      '</div>' +
    '</article>';
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
    if (preset.equipment) S.equipment = preset.equipment.slice();
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

  function openExercise(id, trigger, silent) {
    var ex = BY_ID[id];
    if (!ex) return;
    S.activeId = id;
    if (trigger) modalReturnFocus = trigger;

    $('modal-kicker').textContent = labelZone(ex.zone) + ' · ' + labelMu(ex.target);
    $('modal-title').textContent = exName(ex);

    var img = $('modal-img');
    img.alt = exName(ex);
    img.dataset.still = exStill(ex);
    img.setAttribute('data-ex-media', '');
    img.dataset.mediaFailed = '';
    img.src = REDUCED_MOTION.matches ? exStill(ex) : exMotion(ex);

    var facts = factRow(t('zoneLabel'), labelZone(ex.zone)) +
      factRow(t('muscleLabel'), labelMu(ex.target)) +
      factRow(t('groupLabel'), labelMu(ex.group)) +
      factRow(t('equipmentLabel'), labelEq(ex.equip));
    if (ex.secondary.length) {
      facts += factRow(t('secondaryLabel'), ex.secondary.map(labelMu).join(', '));
    }
    $('modal-facts').innerHTML = facts;

    var steps = exSteps(ex);
    $('modal-steps').innerHTML = steps.map(function (step) {
      return '<li><span>' + esc(step) + '</span></li>';
    }).join('');

    renderExerciseCoach(ex);
    renderExerciseDose(ex);
    if (!silent) S.swapReason = '';
    renderSwapReasons();
    renderSwapList();

    syncModalButtons();
    if (!silent) {
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
    closeOverlay($('modal'), modalReturnFocus);
    modalReturnFocus = null;
    S.activeId = null;
    $('modal-img').removeAttribute('src');
  }

  /* ---------- 9. ТЕКУЩАЯ ТРЕНИРОВКА --------------------------------------- */
  function defaultDose(ex) {
    if (ex.zone === 'cardio') return { sets: 1, reps: '10–20 мин' };
    if (ex.zone === 'waist') return { sets: 3, reps: '12–20' };
    if (ex.score >= 9) return { sets: 4, reps: '6–10' };
    return { sets: 3, reps: '10–12' };
  }

  function cleanSetRecord(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return { reps:String(raw.reps==null?'':raw.reps).slice(0,24), weight:String(raw.weight==null?'':raw.weight).slice(0,40), rir:String(raw.rir==null?'':raw.rir).slice(0,8), rpe:String(raw.rpe==null?'':raw.rpe).slice(0,8), completed:!!raw.completed, completedAt:Number(raw.completedAt)>0?Number(raw.completedAt):0 };
  }
  function ensureSetLog(item) {
    if (!item) return [];
    var total=clamp(Number(item.sets)||1,1,20), source=Array.isArray(item.setLog)?item.setLog:[], log=[];
    for(var i=0;i<total;i++){ var row=cleanSetRecord(source[i]); if(!source.length&&item.done){row.reps=String(item.reps||'').slice(0,24);row.weight=String(item.weight||'').slice(0,40);row.completed=true;} log.push(row); }
    item.setLog=log; item.done=log.length>0&&log.every(function(x){return x.completed;}); return log;
  }
  function normalizeWorkoutRecord(item) {
    item=item&&typeof item==='object'?item:{};
    var record={id:String(item.id||''),sets:clamp(Number(item.sets)||3,1,20),reps:String(item.reps==null?'10–12':item.reps).slice(0,24),weight:String(item.weight==null?'':item.weight).slice(0,40),done:!!item.done,setLog:Array.isArray(item.setLog)?item.setLog.map(cleanSetRecord).slice(0,20):[]};
    ensureSetLog(record); return record;
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
    var list = $('workout-list');
    var rows = S.workout.map(function (item) {
      return { item: item, ex: BY_ID[item.id] };
    }).filter(function (r) { return !!r.ex; });

    if (rows.length !== S.workout.length) {
      S.workout = rows.map(function (r) { return r.item; });
      saveWorkout();
    }

    if (!rows.length) {
      list.innerHTML = '<div class="empty"><b>' + esc(t('workoutEmptyTitle')) + '</b><p>' +
        esc(t('workoutEmptyText')) + '</p><a class="btn btn-primary btn-sm" href="#library">' +
        esc(t('workoutOpenLibrary')) + ' →</a></div>';
    } else {
      list.innerHTML = rows.map(function (r, i) {
        var ex = r.ex, item = r.item;
        return '<article class="workout-item" data-id="' + esc(item.id) + '" data-done="' + !!item.done + '">' +
          '<div class="workout-order">' +
            '<button type="button" data-move="-1" ' + (i === 0 ? 'disabled' : '') + ' aria-label="' + esc(t('wUp')) + '">↑</button>' +
            '<button type="button" data-move="1" ' + (i === rows.length - 1 ? 'disabled' : '') + ' aria-label="' + esc(t('wDown')) + '">↓</button>' +
          '</div>' +
          '<img class="workout-thumb" src="' + esc(exStill(ex)) + '" data-still="' + esc(exStill(ex)) + '" data-ex-media alt="" width="96" height="96" loading="lazy" decoding="async">' +
          '<div class="workout-main">' +
            '<button class="workout-name" type="button" data-open="' + esc(item.id) + '">' + esc(exName(ex)) + '</button>' +
            '<p class="workout-sub"><span class="meta-tag">' + esc(labelMu(ex.target)) + '</span><span class="meta-tag">' + premiumIcon('equipment') + esc(labelEq(ex.equip)) + '</span></p>' +
            '<div class="workout-fields">' +
              '<label>' + esc(t('wSets')) + '<input class="num" type="number" min="1" max="20" step="1" inputmode="numeric" data-field="sets" value="' + esc(item.sets) + '"></label>' +
              '<label>' + esc(t('wReps')) + '<input type="text" inputmode="numeric" data-field="reps" value="' + esc(item.reps) + '"></label>' +
              '<label>' + esc(t('wWeight')) + '<input type="text" inputmode="decimal" data-field="weight" value="' + esc(item.weight) + '"></label>' +
            '</div>' +
            '<div class="workout-set-summary"><span>' + esc(t('workoutSetsDone',{done:completedSetCount(item),total:item.sets})) + '</span><span class="workout-set-dots" aria-hidden="true">' + ensureSetLog(item).map(function(set){return '<i class="workout-set-dot" data-done="'+String(!!set.completed)+'"></i>';}).join('') + '</span></div>' +
            '<label class="workout-complete"><input type="checkbox" data-field="done"' + (item.done ? ' checked' : '') + '> ' + esc(t('wDone')) + '</label>' +
          '</div>' +
          '<button class="icon-btn" type="button" data-remove aria-label="' + esc(t('wRemove')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
        '</article>';
      }).join('');
    }

    var sets = rows.reduce(function (sum, r) { return sum + (Number(r.item.sets) || 0); }, 0);
    var done = rows.filter(function (r) { return r.item.done; }).length;
    $('w-count').textContent = rows.length;
    $('w-sets').textContent = sets;
    $('w-time').textContent = rows.length ? Math.max(10, round(sets * 2.6 + rows.length * 2)) : 0;
    $('w-progress').textContent = t('wProgress', { done: done, total: rows.length });
    var progress = rows.length ? Math.round(done / rows.length * 100) : 0;
    $('w-progress').style.setProperty('--workout-progress', progress + '%');
    renderCoachWorkout();
    updateMobileBar();
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
  var DAY_TEMPLATES = {
    full: { key: 'full', zones: ['chest', 'back', 'upper legs', 'shoulders', 'upper arms', 'waist'] },
    upper: { key: 'upper', zones: ['chest', 'back', 'shoulders', 'upper arms'] },
    lower: { key: 'lower', zones: ['upper legs', 'lower legs', 'waist'] },
    push: { key: 'push', zones: ['chest', 'shoulders', 'upper arms'] },
    pull: { key: 'pull', zones: ['back', 'upper arms', 'lower arms'] },
    legs: { key: 'legs', zones: ['upper legs', 'lower legs', 'waist'] }
  };
  var DAY_NAMES = {
    full: { ru: 'Всё тело', en: 'Full body' },
    upper: { ru: 'Верх тела', en: 'Upper body' },
    lower: { ru: 'Низ тела', en: 'Lower body' },
    push: { ru: 'Жимовой день', en: 'Push day' },
    pull: { ru: 'Тяговый день', en: 'Pull day' },
    legs: { ru: 'Ноги и кор', en: 'Legs and core' }
  };

  function splitFor(days, level, goal) {
    if (days <= 2) return ['full', 'full'];
    if (days === 3) {
      if (level === 'beginner' || goal === 'health') return ['full', 'full', 'full'];
      return ['push', 'pull', 'legs'];
    }
    if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
    if (days === 5) return ['push', 'pull', 'legs', 'upper', 'lower'];
    return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
  }

  var GOAL_DOSE = {
    strength: { sets: [4, 5], reps: '3–6', rest: [150, 210] },
    muscle: { sets: [3, 4], reps: '6–12', rest: [90, 120] },
    fatloss: { sets: [3, 4], reps: '10–15', rest: [45, 75] },
    health: { sets: [2, 3], reps: '10–15', rest: [60, 90] }
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
    return score;
  }

  function renderPlanPlaceholder() {
    var out = $('plan-out');
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
    var place = $('p-place').value;
    var focus = $('p-focus').value;

    var allowed = equipmentFor(place);
    var dose = GOAL_DOSE[goal] || GOAL_DOSE.muscle;
    var setsLo = dose.sets[0], setsHi = dose.sets[1];
    if (level === 'beginner') { setsLo = Math.max(2, setsLo - 1); setsHi = Math.max(3, setsHi - 1); }
    if (level === 'advanced') { setsLo += 1; setsHi += 1; }

    var perSession = clamp(Math.round(time / 12), 3, 8);
    if (level === 'beginner') perSession = clamp(perSession - 1, 3, 6);
    if (days >= 5) perSession = clamp(perSession - 1, 3, 7);

    var split = splitFor(days, level, goal).slice(0, days);
    var used = Object.create(null);

    function pool(zone) {
      return EX.filter(function (ex) {
        return ex.zone === zone && allowed.indexOf(ex.equip) !== -1 && planExtraFilter(ex);
      }).sort(function (a, b) {
        return (planExerciseScore(b, goal, level) - planExerciseScore(a, goal, level)) || (a.idx - b.idx);
      });
    }

    var poolCache = Object.create(null);
    function pickFor(zone) {
      if (!poolCache[zone]) poolCache[zone] = pool(zone);
      var list = poolCache[zone];
      for (var i = 0; i < list.length; i++) {
        if (!used[list[i].id]) { used[list[i].id] = true; return list[i]; }
      }
      return list.length ? list[0] : null;
    }

    var week = split.map(function (key, dayIndex) {
      var tpl = DAY_TEMPLATES[key];
      var zones = tpl.zones.slice();
      if (focus !== 'balanced') {
        var focusZones = focus === 'chest' ? ['chest'] : focus === 'back' ? ['back'] :
          focus === 'shoulders' ? ['shoulders'] : focus === 'upper arms' ? ['upper arms'] :
          focus === 'waist' ? ['waist'] : ['upper legs'];
        var hit = focusZones.filter(function (z) { return zones.indexOf(z) !== -1; });
        if (hit.length) {
          zones = hit.concat(hit, zones.filter(function (z) { return hit.indexOf(z) === -1; }));
        }
      }
      var items = [];
      var guard = 0;
      while (items.length < perSession && guard < perSession * 4) {
        var zone = zones[items.length % zones.length];
        var pick = pickFor(zone);
        guard++;
        if (!pick) continue;
        if (items.some(function (it) { return it.ex.id === pick.id; })) continue;
        var isMain = items.length < 2;
        items.push({
          ex: pick,
          sets: isMain ? setsHi : setsLo,
          reps: pick.zone === 'waist' && goal !== 'strength' ? '12–20' : dose.reps,
          rest: isMain ? dose.rest[1] : dose.rest[0]
        });
      }
      return { key: key, index: dayIndex, items: items };
    });

    lastPlan = { week: week, goal: goal, level: level, days: days, time: time, place: place, focus: focus };

    var goalLabel = $('p-goal').selectedOptions[0].textContent;
    var placeLabel = $('p-place').selectedOptions[0].textContent;
    var levelLabel = $('p-level').selectedOptions[0].textContent;

    var weekHtml = week.map(function (day) {
      var name = DAY_NAMES[day.key][S.lang] || DAY_NAMES[day.key].ru;
      return '<div class="plan-day">' +
        '<div class="plan-day-head"><b>' + esc(t('planDay', { n: day.index + 1 })) + ' · ' + esc(name) + '</b>' +
        '<span>' + esc(t('planRest')) + ' ' + day.items[0].rest + ' ' + esc(t('planSec')) + '</span></div>' +
        day.items.map(function (it) {
          return '<div class="plan-ex">' +
            '<button class="plan-ex-name" type="button" data-open="' + esc(it.ex.id) + '">' + esc(exName(it.ex)) + '</button>' +
            '<span class="meta-tag">' + esc(labelEq(it.ex.equip)) + '</span>' +
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
      '<div class="note"><b>' + esc(t('planCardio')) + '.</b> ' + esc(CARDIO_TEXT[goal][S.lang] || CARDIO_TEXT[goal].ru) + '</div>' +
      '<div class="note"><b>' + esc(t('planProgress')) + '.</b> ' + esc(PROGRESS_TEXT[level][S.lang] || PROGRESS_TEXT[level].ru) + '</div>' +
      '<div class="note note-warn">' + esc(S.lang === 'en' ? (EN['plan.disclaimer'] || '') : (RU_DOM['plan.disclaimer'] || '')) + '</div>' +
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
      days: days, time: time, goal: goal, level: level, place: place,
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
      lines.push(t('planDay', { n: day.index + 1 }) + ' — ' + name + ' (' + t('planRest') + ' ' + day.items[0].rest + ' ' + t('planSec') + ')');
      day.items.forEach(function (it, i) {
        lines.push('  ' + (i + 1) + '. ' + exName(it.ex) + ' — ' + it.sets + '×' + it.reps + ' (' + labelEq(it.ex.equip) + ')');
      });
      lines.push('');
    });
    lines.push(t('planCardio') + ': ' + (CARDIO_TEXT[lastPlan.goal][S.lang] || CARDIO_TEXT[lastPlan.goal].ru));
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
    { hash: '#muscles', key: 'nav.muscles' }, { hash: '#library', key: 'nav.library' },
    { hash: '#workout', key: 'nav.workout' }, { hash: '#nutrition', key: 'nav.nutrition' },
    { hash: '#program', key: 'nav.program' }, { hash: '#how', key: 'mnav.how' },
    { hash: '#faq', key: 'nav.faq' }, { hash: '#contact', key: 'nav.cta' }
  ];
  var cmdkItems = [];
  var cmdkIndex = 0;

  function sectionLabel(key) {
    return S.lang === 'en' ? (EN[key] || RU_DOM[key] || key) : (RU_DOM[key] || key);
  }

  function renderCmdk(query) {
    var box = $('cmdk-results');
    var q = norm(query);
    cmdkItems = [];

    if (!q) {
      cmdkItems = SECTIONS.map(function (s) {
        return { type: 'section', hash: s.hash, label: sectionLabel(s.key), hint: t('cmdkSection') };
      });
    } else {
      SECTIONS.forEach(function (s) {
        if (norm(sectionLabel(s.key)).indexOf(q) !== -1) {
          cmdkItems.push({ type: 'section', hash: s.hash, label: sectionLabel(s.key), hint: t('cmdkSection') });
        }
      });
      MUSCLES.map(function(m){return {m:m,rank:Math.max(matchRank(q,m),matchRank(q,labelMu(m)))};}).filter(function(x){return x.rank>=0;}).sort(function(a,b){return b.rank-a.rank;}).slice(0,3).forEach(function(x){cmdkItems.push({type:'muscle',muscle:x.m,label:labelMu(x.m),hint:t('discMuscles')});});
      EX.map(function(ex){return {ex:ex,rank:exerciseDiscoveryRank(ex,q)};}).filter(function(x){return x.rank>=0;}).sort(function(a,b){return b.rank-a.rank;}).slice(0,8).forEach(function(x){cmdkItems.push({type:'exercise',id:x.ex.id,label:exName(x.ex),hint:labelMu(x.ex.target)});});
    }

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
      var target = qs(item.hash);
      if (target) target.scrollIntoView({ behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth', block: 'start' });
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
  K.diary = 'mmg.diary.v1';
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

  var DEFAULT_PROFILE = { goal:'', level:'', place:'', days:'', typicalSessionMinutes:'', equipmentAvailability:[], focus:'balanced', limitations:[], recoveryBaseline:'mid', done:false, skipped:false };

  function saveProfile() { store.set(K.profile, JSON.stringify(S.profile)); }
  function saveMeta() { store.set(K.meta, JSON.stringify(S.meta)); }
  function saveHistory() { store.set(K.history, JSON.stringify(S.history.slice(0, 20))); }
  function saveDiary() { store.set(K.diary, JSON.stringify(S.diary.slice(0, 400))); }
  function saveTips() { store.set(K.tips, JSON.stringify(S.tips)); }
  function saveSettings() { store.set(K.settings, JSON.stringify(S.settings)); }
  function serialisePlanV7(plan){
    if(!plan||!Array.isArray(plan.days))return null;
    return {v:2,createdAt:Number(plan.createdAt)||Date.now(),weekKey:String(plan.weekKey||v7CurrentWeekKey()),completedDays:Array.isArray(plan.completedDays)?plan.completedDays.map(Number).filter(function(n){return n>=0&&n<12;}):[],ctx:plan.ctx||{},days:plan.days.map(function(day,i){return {key:String(day.key||''),index:Number(day.index)>=0?Number(day.index):i,items:(day.items||[]).map(function(it){var ex=it&&it.ex;return {id:String(ex&&ex.id||it&&it.id||''),sets:Number(it&&it.sets)||3,reps:String(it&&it.reps||'10–12').slice(0,24),rest:Number(it&&it.rest)||90};}).filter(function(it){return !!BY_ID[it.id];})};})};
  }
  function restorePlanV7(raw){
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.days))return null;
    var days=raw.days.map(function(day,i){return {key:String(day.key||''),index:Number(day.index)>=0?Number(day.index):i,items:(day.items||[]).map(function(it){var ex=BY_ID[String(it.id||'')];return ex?{ex:ex,sets:clamp(Number(it.sets)||3,1,20),reps:String(it.reps||'10–12').slice(0,24),rest:clamp(Number(it.rest)||90,15,900)}:null;}).filter(Boolean)};}).filter(function(d){return d.items.length;});
    var currentWeek=v7CurrentWeekKey(),storedWeek=String(raw.weekKey||currentWeek),completed=Array.isArray(raw.completedDays)?raw.completedDays.map(Number).filter(function(n){return n>=0&&n<days.length;}):[];if(raw.weekKey&&storedWeek!==currentWeek)completed=[];return days.length?{days:days,ctx:raw.ctx&&typeof raw.ctx==='object'?raw.ctx:{},createdAt:Number(raw.createdAt)||Date.now(),weekKey:currentWeek,completedDays:completed}:null;
  }
  function savePlanV7(){var data=serialisePlanV7(S.plan);if(data)store.set(K.plan,JSON.stringify(data));else store.remove(K.plan);}

  /* ---------- 15.4 РАСШИРЕНИЕ СОСТОЯНИЯ ---------------------------------- */
  S.profile = null;      // цель, уровень, место, дни
  S.meta = null;         // название, дата и заметка текущей тренировки
  S.history = [];        // последние сохранённые тренировки
  S.diary = [];          // дневник прогресса
  S.kbjuLast = null;     // последний расчёт КБЖУ
  S.tips = [];           // сохранённые материалы базы знаний
  S.coachOn = true;      // режим тренера
  S.console = { goal: '', place: '', level: '', time: '' };
  S.consoleEditing = false;
  S.onbStep = 0;
  S.kbCat = 'all';
  S.kbQuery = '';
  S.kbVisible = 12;
  S.swapReason = '';
  S.rest = 90;
  S.planLimits = [];
  S.plan = null;         // последний собранный план (для редактирования)
  S.recentSearches = [];
  S.recentExercises = [];
  S.runSession = null;
  S.settings = { rir:false, rpe:false };

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
    S.history = Array.isArray(h) ? h.filter(function (x) { return x && Array.isArray(x.items); }).slice(0, 20) : [];

    var d = store.json(K.diary, []);
    S.diary = Array.isArray(d) ? d.filter(function (x) { return x && x.date; }).slice(0, 400) : [];

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
    S.settings=(settings&&typeof settings==='object')?{rir:!!settings.rir,rpe:!!settings.rpe}:{rir:false,rpe:false};
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
    if (level) $('p-level').value = level;
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
      '<button class="btn btn-primary btn-sm" type="button" data-cact="' + esc(next.act) + '">' + esc(next.label) + '</button>';

    var st = dashSignal();
    var sig = $('dash-signal');
    sig.setAttribute('data-state', st.state);
    sig.textContent = st.label;

    var advice = S.profile.goal ? C.console[S.profile.goal] : null;
    $('dash-note').innerHTML = advice ? coachNote(advice, { compact: true }) : '';
  }

  /* Следующее действие: контекст важнее линейного чек-листа. */
  function dashNext() {
    var totalSets=S.workout.reduce(function(sum,w){return sum+(Number(w.sets)||0);},0);
    var doneSets=S.workout.reduce(function(sum,w){return sum+completedSetCount(w);},0);
    var runFresh=S.runSession&&Date.now()-Number(S.runSession.startedAt||0)<8*3600000&&doneSets<totalSets;
    if(runFresh) return { text:t('nextResume'), why:t('nextResumeWhy'), act:'resumeRun', label:t('continuityResume') };
    if(S.workout.length&&doneSets<totalSets) return { text:t('nextStart'), why:t('nextStartWhy'), act:'startRun', label:t('continuityStart') };
    if(S.workout.length&&totalSets&&doneSets>=totalSets) return { text:t('nextSave'), why:t('nextSaveWhy'), act:'workout', label:t('actWorkout') };
    if (!S.favorites.length && !S.workout.length) return { text: t('nextLibrary'), why: t('nextLibraryWhy'), act: 'library', label: t('consoleLibrary') };
    if (!S.workout.length) return { text: t('nextWorkout'), why: t('nextWorkoutWhy'), act: 'workout', label: t('actWorkout') };
    if (!S.kbjuLast) return { text: t('nextKbju'), why: t('nextKbjuWhy'), act: 'kbju', label: t('actKbju') };
    if (!S.plan) return { text: t('nextPlan'), why: t('nextPlanWhy'), act: 'plan', label: t('actPlan') };
    if (S.diary.length < 2) return { text: t('nextDiary'), why: t('nextDiaryWhy'), act: 'progress', label: t('actProgress') };
    var last=S.diary[0],age=last&&last.date?Math.floor((Date.now()-Date.parse(last.date+'T12:00:00'))/86400000):0;
    if(age>8) return { text:t('nextRefresh'), why:t('nextRefreshWhy',{n:age}), act:'progress', label:t('actProgress') };
    return { text: t('nextKeep'), why: t('nextKeepWhy'), act: 'progress', label: t('actProgress') };
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
    var zone = exCardZone(ex);
    var scale = exScale(ex);
    var levelLabel = { beginner: t('lvlEasy'), medium: t('lvlMid'), advanced: t('lvlHard') }[exLevel(ex)];
    var kindLabel = { compound: t('kindCompound'), accessory: t('kindAccessory'), isolation: t('kindIsolation') }[kind];

    var html = factRow(t('kindLabel'), kindLabel) +
      factRow(t('levelLabel'), levelLabel) +
      factRow(t('repsLabel'), L(dose.reps)) +
      factRow(t('restLabel'), L(dose.rest)) +
      factRow(t('rirLabel'), L(dose.rir));
    if (zone) {
      html += factRow(t('keyLabel'), L(zone.key)) +
        factRow(t('errLabel'), L(zone.err)) +
        factRow(t('whenSwapLabel'), L(zone.swap));
    }
    html += factRow(t('easierLabel'), L(scale.easy)) +
      factRow(t('harderLabel'), L(scale.hard));
    host.innerHTML = html;
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
    var sameTarget = [], sameGroup = [];
    var level = exLevel(ex), kind = exKind(ex);

    EX.forEach(function (cand) {
      if (cand.id === ex.id) return;
      if (cand.target === ex.target) sameTarget.push(cand);
      else if (cand.group === ex.group && cand.zone === ex.zone) sameGroup.push(cand);
    });

    var pool = sameTarget.length >= 4 ? sameTarget : sameTarget.concat(sameGroup);

    var pass = function (cand) {
      if (reason === 'busy') return cand.equip !== ex.equip;
      if (reason === 'noequip') return cand.equip !== ex.equip && (isHomeFriendly(cand) || GUIDED.indexOf(cand.equip) !== -1);
      if (reason === 'home') return isHomeFriendly(cand);
      if (reason === 'awkward') return GUIDED.indexOf(cand.equip) !== -1 || isHomeFriendly(cand);
      if (reason === 'discomfort') return GUIDED.indexOf(cand.equip) !== -1 || cand.equip === 'body weight';
      if (reason === 'hard') return exLevel(cand) === 'beginner';
      if (reason === 'easy') return exLevel(cand) === 'advanced' || (exKind(cand) === 'compound' && FREE_WEIGHT.indexOf(cand.equip) !== -1);
      return true;
    };

    var filtered = pool.filter(pass);
    if (filtered.length < 3) filtered = pool;

    filtered.sort(function (a, b) {
      var scoreOf = function (c) {
        var s = 0;
        if (c.target === ex.target) s += 6;
        if (exKind(c) === kind) s += 3;
        if (exLevel(c) === level) s += 2;
        if (S.profile.place === 'home' && isHomeFriendly(c)) s += 2;
        return s + c.score / 20;
      };
      return scoreOf(b) - scoreOf(a);
    });

    return filtered.slice(0, 6);
  }

  function swapWhy(ex, cand, reason) {
    if (cand.target === ex.target && cand.equip !== ex.equip) return t('swapWhyEquip', { v: labelEq(cand.equip) });
    if (cand.target !== ex.target) return t('swapWhyGroup', { v: labelMu(cand.target) });
    if (reason === 'hard') return t('swapWhyEasier');
    if (reason === 'easy') return t('swapWhyHarder');
    return t('swapWhySame', { v: labelEq(cand.equip) });
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
  var runState = { ex: 0, set: 1, startedAt: 0, saved: false };

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

  function previousPerformance(id) {
    for (var i = 0; i < S.history.length; i++) {
      var hit = (S.history[i].items || []).filter(function (x) { return x.id === id; })[0];
      if (hit) return hit;
    }
    return null;
  }
  function previousSetPerformance(id,setIndex){
    var prev=previousPerformance(id); if(!prev) return null;
    if(Array.isArray(prev.setLog)){
      var exact=prev.setLog[setIndex]; if(exact&&exact.completed) return exact;
      for(var i=prev.setLog.length-1;i>=0;i--) if(prev.setLog[i]&&prev.setLog[i].completed) return prev.setLog[i];
    }
    return {reps:prev.reps||'',weight:prev.weight||'',completed:!!prev.done};
  }
  function firstIncompletePosition(){
    for(var i=0;i<S.workout.length;i++){var log=ensureSetLog(S.workout[i]);for(var j=0;j<log.length;j++)if(!log[j].completed)return{ex:i,set:j+1};}
    return {ex:S.workout.length,set:1};
  }
  function completeCurrentSet(){
    var item=S.workout[runState.ex]; if(!item) return false;
    var log=ensureSetLog(item), row=log[Math.max(0,runState.set-1)]; if(!row) return false;
    var stage=$('run-stage'),repsInput=qs('[data-run-field="reps"]',stage),weightInput=qs('[data-run-field="weight"]',stage),rirInput=qs('[data-run-field="rir"]',stage),rpeInput=qs('[data-run-field="rpe"]',stage);
    row.reps=String(repsInput?repsInput.value:(row.reps||item.reps||'')).slice(0,24);
    row.weight=String(weightInput?weightInput.value:(row.weight||item.weight||'')).slice(0,40);
    if(rirInput)row.rir=String(rirInput.value||'').slice(0,4); if(rpeInput)row.rpe=String(rpeInput.value||'').slice(0,4);
    row.completed=true; row.completedAt=Date.now(); item.reps=row.reps||item.reps; item.weight=row.weight||item.weight; item.done=log.every(function(x){return x.completed;}); saveWorkout(); track('set_complete',{id:item.id,set:runState.set}); return true;
  }

  function saveCurrentSetDraft(){
    var item=S.workout[runState.ex],stage=$('run-stage'); if(!item||!stage)return;
    var reps=qs('[data-run-field="reps"]',stage),weight=qs('[data-run-field="weight"]',stage),rir=qs('[data-run-field="rir"]',stage),rpe=qs('[data-run-field="rpe"]',stage),log=ensureSetLog(item),row=log[Math.max(0,runState.set-1)];
    if(!row)return; if(reps){row.reps=String(reps.value||'').slice(0,24);item.reps=row.reps||item.reps;} if(weight){row.weight=String(weight.value||'').slice(0,40);item.weight=row.weight||item.weight;} if(rir)row.rir=String(rir.value||'').slice(0,4); if(rpe)row.rpe=String(rpe.value||'').slice(0,4); saveWorkout();saveRunSession();
  }
  function runReferenceForCurrent(){
    var item=S.workout[runState.ex];if(!item)return null;var log=ensureSetLog(item),idx=Math.max(0,runState.set-1);
    for(var i=idx-1;i>=0;i--)if(log[i]&&log[i].completed&&(log[i].reps||log[i].weight))return log[i];
    return previousSetPerformance(item.id,idx);
  }
  function reusePreviousRunResult(){
    var ref=runReferenceForCurrent(),stage=$('run-stage'); if(!ref||!stage)return;
    var reps=qs('[data-run-field="reps"]',stage),weight=qs('[data-run-field="weight"]',stage);if(reps)reps.value=ref.reps||'';if(weight)weight.value=ref.weight||'';saveCurrentSetDraft();
  }

  function renderRun() {
    var item = S.workout[runState.ex];
    var stage = $('run-stage');
    var elapsed = fmtClock(runElapsedSeconds());
    if (!item) {
      stage.innerHTML = '<div class="run-finish-summary">' + premiumIcon('check') +
        '<h3>' + esc(t('runDoneTitle')) + '</h3><p class="small">' + esc(t('runFinishedBody')) + '</p>' +
        '<div class="run-session-meta"><div><span>' + esc(t('runElapsed')) + '</span><b>' + elapsed + '</b></div>' +
        '<div><span>' + esc(t('sessionExercises')) + '</span><b>' + S.workout.length + '</b></div>' +
        '<div><span>' + esc(t('sessionSets')) + '</span><b>' + runTotalSets() + '</b></div></div></div>';
      $('run-kicker').textContent = t('runFinished');
      $('run-bar-i').style.width = '100%';
      $('run-next').textContent = t('runSaveWorkout');
      $('run-prev').disabled = false;
      $('run-rest').disabled = true;
      saveRunSession();
      return;
    }
    var ex = BY_ID[item.id];
    if (!ex) { runState.ex++; runState.set = 1; renderRun(); return; }

    var total = runTotalSets() || 1;
    $('run-bar-i').style.width = Math.round((runDoneSets() / total) * 100) + '%';
    $('run-kicker').textContent = t('runProgress', { i: runState.ex + 1, n: S.workout.length });
    $('run-next').textContent = t('runCompleteSet');
    $('run-rest').disabled = false;
    $('run-prev').disabled = runState.ex === 0 && runState.set === 1;

    var currentLog=ensureSetLog(item), currentSet=currentLog[Math.max(0,runState.set-1)]||cleanSetRecord(null);
    var prev=runReferenceForCurrent();
    var prevText=prev&&(prev.reps||prev.weight)?((prev.weight?prev.weight+' × ':'')+(prev.reps||'—')):t('runNoPrev');
    var setStrip=currentLog.map(function(row,idx){var state=row.completed?'done':(idx===runState.set-1?'current':'pending');return '<button class="run-set-chip" type="button" data-state="'+state+'" data-run-set="'+(idx+1)+'" aria-pressed="'+String(state==='current')+'" aria-label="'+esc(t('runJumpSet',{i:idx+1}))+'">'+(idx+1)+'</button>';}).join('');
    var usePrev=prev&&(prev.reps||prev.weight)?'<button class="run-use-prev" type="button" data-run-copy-prev><span>'+premiumIcon('progress')+esc(t('runUsePrevious'))+'</span><b>'+esc(t('runUsePreviousValue',{v:prevText}))+'</b></button>':'';
    stage.innerHTML = '<div class="run-shell">' +
      '<div class="run-media-frame"><img class="run-media" src="' + esc(REDUCED_MOTION.matches ? exStill(ex) : exMotion(ex)) + '" data-still="' + esc(exStill(ex)) + '" data-ex-media alt="" decoding="async"><span class="run-media-badge">' + esc(labelZone(ex.zone)) + '</span></div>' +
      '<div class="run-context"><div><div class="run-submeta"><span class="meta-tag">' + esc(labelMu(ex.target)) + '</span><span class="meta-tag">' + premiumIcon('equipment') + esc(labelEq(ex.equip)) + '</span></div>' +
      '<h3 class="run-name">' + esc(exName(ex)) + '</h3></div>' +
      '<div class="run-current"><div class="run-setline"><b>' + esc(t('runSetLabel', { i: runState.set, n: item.sets })) + '</b><span>' + esc(t('runElapsed')) + ' · ' + elapsed + '</span></div>' +
      '<div class="run-current-inputs"><label>' + esc(ex.zone==='cardio'?t('runVolume'):t('wReps')) + '<input type="text" inputmode="' + (ex.zone==='cardio'?'text':'numeric') + '" data-run-field="reps" value="' + esc(currentSet.reps || item.reps || '') + '"></label>' +
      '<label>' + esc(t('wWeight')) + '<input type="text" inputmode="decimal" data-run-field="weight" value="' + esc(currentSet.weight || item.weight || '') + '"></label></div>' +
      '<div class="run-prev-record"><b>' + esc(t('runPrevPerformance')) + ':</b> ' + esc(prevText) + '</div>' + usePrev + '<div class="run-set-strip" aria-label="' + esc(t('workoutSetsDone',{done:completedSetCount(item),total:item.sets})) + '">' + setStrip + '</div></div>' +
      '<div class="run-session-meta"><div><span>' + esc(t('sessionExercises')) + '</span><b>' + (runState.ex + 1) + ' / ' + S.workout.length + '</b></div>' +
      '<div><span>' + esc(t('sessionSets')) + '</span><b>' + runDoneSets() + ' / ' + total + '</b></div>' +
      '<div><span>' + esc(t('runElapsed')) + '</span><b>' + elapsed + '</b></div></div>' +
      '<div class="run-actions"><button class="btn btn-solid btn-sm" type="button" data-run-open="' + esc(ex.id) + '">' + premiumIcon('technique') + esc(t('openTechnique')) + '</button>' +
      '<button class="btn btn-quiet btn-sm" type="button" data-run-skip="1">' + premiumIcon('skip') + esc(t('runSkip')) + '</button></div></div></div>';
    saveRunSession();
  }

  function runNext() {
    var item=S.workout[runState.ex];
    if(!item){if(!runState.saved){finishWorkout();runState.saved=true;}store.remove(K.runSession);S.runSession=null;closeOverlay($('run'),$('w-run'));return;}
    completeCurrentSet(); renderWorkout();
    var log=ensureSetLog(item),nextInExercise=-1;
    for(var j=Math.max(0,runState.set);j<log.length;j++){if(!log[j].completed){nextInExercise=j;break;}}
    if(nextInExercise>=0){runState.set=nextInExercise+1;startTimer(S.rest);}else{item.done=true;saveWorkout();renderWorkout();var pos=firstIncompletePosition();runState.ex=pos.ex;runState.set=pos.set;if(runState.ex<S.workout.length)startTimer(S.rest);else{stopTimer();track('workout_complete',{n:S.workout.length});}}
    saveRunSession();renderRun();
  }

  function runPrev() {
    saveCurrentSetDraft();
    if (runState.set > 1) runState.set--;
    else if (runState.ex > 0) {
      runState.ex--;
      runState.set = S.workout[runState.ex] ? Number(S.workout[runState.ex].sets) || 1 : 1;
    }
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
    }
    runState.saved = false;
    saveRunSession();
    renderRun();
    openOverlay($('run'), $('run-next'));
    track('workout_start', { n: S.workout.length });
  }

  /* ---------- 16.2 ИСТОРИЯ ТРЕНИРОВОК ------------------------------------ */
  function finishWorkout() {
    if (!S.workout.length) { showToast(t('workoutEmptyTitle')); return; }
    var entry = {
      id: 'w' + Date.now(),
      name: S.meta.name || t('wTitle'),
      date: S.meta.date || todayISO(),
      note:S.meta.note,
      planDay:Number.isInteger(Number(S.meta.planDay))?Number(S.meta.planDay):null,
      durationSec: runState && runState.startedAt ? runElapsedSeconds() : 0,
      items: S.workout.map(function (w) {
        return { id:w.id, sets:w.sets, reps:w.reps, weight:w.weight, done:w.done, setLog:ensureSetLog(w).map(function(set){return Object.assign({},set);}) };
      })
    };
    S.history.unshift(entry);
    if(S.plan&&Number.isInteger(Number(S.meta.planDay))){v7EnsurePlanWeek();var pd=Number(S.meta.planDay);if(S.plan.completedDays.indexOf(pd)===-1)S.plan.completedDays.push(pd);savePlanV7();}
    saveHistory();
    renderHistory();
    renderDashIfVisible();
    showToast(t('histSaved'));
    track('workout_saved', { n: entry.items.length });
  }

  function historyDetailHtml(h){
    return '<div class="hist-detail" id="hist-detail-'+esc(h.id)+'" hidden>'+h.items.map(function(item){var ex=BY_ID[item.id],name=ex?exName(ex):item.id,sets=Array.isArray(item.setLog)&&item.setLog.length?item.setLog:null;var evidence=sets?sets.map(function(row,i){return '<span class="hist-set-chip" data-done="'+String(!!row.completed)+'"><small>'+esc(t('histSet',{i:i+1}))+'</small><b>'+esc((row.weight?row.weight+' × ':'')+(row.reps||'—'))+'</b></span>';}).join(''):'<span class="hist-set-chip"><small>'+esc(t('sessionSets'))+'</small><b>'+esc(String(item.sets||0)+' × '+String(item.reps||'—'))+'</b></span>';return '<div class="hist-ex"><span><b>'+esc(name)+'</b><small>'+esc(ex?labelMu(ex.target):'')+'</small></span><div class="hist-set-list">'+evidence+'</div></div>';}).join('')+'</div>';
  }

  function renderHistory() {
    var host = $('hist');
    if (!host) return;
    if (!S.history.length) { host.innerHTML = '<p class="tiny">' + esc(t('histEmpty')) + '</p>'; return; }
    host.innerHTML = S.history.slice(0, 8).map(function (h) {
      var done=h.items.filter(function(i){return i.done;}).length, doneSets=totalCompletedHistorySets(h), totalSets=totalHistorySets(h);
      var duration=Number(h.durationSec)>0?Math.max(1,Math.round(Number(h.durationSec)/60)):0;
      return '<div class="hist-item"><span><b class="hist-name">' + esc(h.name) + '</b><span class="hist-meta">' + esc(h.date) + ' · ' + esc(t('histMeta', { n: h.items.length, d: done })) + '</span><span class="hist-evidence"><b>'+esc(t('histSetsDone',{done:doneSets,total:totalSets}))+'</b>'+(duration?'<span>'+esc(t('histDuration',{v:duration}))+'</span>':'')+'</span></span><span class="hist-actions"><button class="btn btn-quiet btn-sm" type="button" data-hist-detail="'+esc(h.id)+'" aria-expanded="false" aria-controls="hist-detail-'+esc(h.id)+'">'+esc(t('histDetails'))+'</button><button class="btn btn-quiet btn-sm" type="button" data-hist-repeat="' + esc(h.id) + '">' + esc(t('histRepeat')) + '</button><button class="btn btn-quiet btn-sm btn-danger" type="button" data-hist-del="' + esc(h.id) + '" aria-label="' + esc(t('histDelete')) + '">×</button></span>'+historyDetailHtml(h)+'</div>';
    }).join('');
  }

  function repeatWorkout(id) {
    var h = S.history.filter(function (x) { return x.id === id; })[0];
    if (!h) return;
    S.workout=h.items.filter(function(i){return BY_ID[i.id];}).map(function(i){var last=Array.isArray(i.setLog)?i.setLog.filter(function(x){return x&&x.completed;}).slice(-1)[0]:null;return normalizeWorkoutRecord({id:i.id,sets:i.sets,reps:last&&last.reps?last.reps:i.reps,weight:last&&last.weight?last.weight:i.weight,done:false,setLog:[]});});
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
        return { id:w.id, name:ex?exName(ex):'', sets:w.sets, reps:w.reps, weight:w.weight, done:w.done, setLog:ensureSetLog(w).map(function(set){return Object.assign({},set);}) };
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

  function decoratePlan(week, ctx) {
    var out = $('plan-out');
    if (!out || !C) return;

    S.plan={days:week,ctx:ctx,createdAt:Date.now(),weekKey:v7CurrentWeekKey(),completedDays:[]};
    S.profile.goal=ctx.goal==='fatloss'?'fat':ctx.goal;
    S.profile.level=ctx.level;S.profile.place=ctx.place;S.profile.days=String(ctx.days);S.profile.typicalSessionMinutes=String(ctx.time);
    S.profile.focus=ctx.focus||'balanced';S.profile.recoveryBaseline=$('p-recovery')?$('p-recovery').value:'mid';S.profile.limitations=S.planLimits.slice();S.profile.done=true;S.profile.skipped=false;
    saveProfile();savePlanV7();

    var kind = planSplitKind(ctx.days);
    var why = [
      t('whyPlanDays', { n: ctx.days }),
      t('whyPlanTime', { n: ctx.time }),
      t('whyPlanPlace', { v: ctx.placeLabel }),
      t('whyPlanLevel', { v: ctx.levelLabel })
    ];
    if (S.planLimits.length) why.push(t('whyPlanLimits', { v: S.planLimits.map(labelZone).join(', ') }));

    var recovery = $('p-recovery') ? $('p-recovery').value : 'mid';
    var cardio = $('p-cardio') ? $('p-cardio').value : 'light';

    var block = document.createElement('div');
    block.style.display = 'grid';
    block.style.gap = 'var(--space-4)';
    block.innerHTML =
      '<div class="note"><b>' + esc(t('planWhyT')) + '</b> ' + esc(L(C.coach.plan.why[kind])) + '</div>' +
      '<div class="note"><b>' + esc(t('planWarmT')) + '</b> ' + esc(L(C.coach.plan.warmup)) + '</div>' +
      (recovery === 'low' ? '<div class="note note-warn">' + esc(t('planRecoveryWarn')) + '</div>' : '') +
      (cardio === 'none' ? '' : '<div class="note"><b>' + esc(t('planCardio')) + '.</b> ' +
        esc(cardio === 'mixed' ? t('planCardioMixed') : t('planCardioLight')) + '</div>') +
      '<div class="note"><b>' + esc(t('planProgress')) + '.</b> ' + esc(L(C.coach.plan.progress)) + '</div>' +
      '<div class="note"><b>' + esc(t('planSkipT')) + '</b> ' + esc(L(C.coach.plan.skip)) + '</div>' +
      '<div class="note"><b>' + esc(t('planSwapT')) + '</b> ' + esc(L(C.coach.plan.swap)) + '</div>' +
      '<div class="note"><b>' + esc(t('planDurationT')) + '</b> ' + esc(L(C.coach.plan.duration)) + '</div>' +
      coachNote({ t: null, d: C.coach.plan.note, a: null, w: null }, { why: why }) +
      '<div class="plan-actions">' +
        '<button class="btn btn-solid btn-sm" type="button" id="plan-export">' + esc(t('planExport')) + '</button>' +
        '<button class="btn btn-quiet btn-sm" type="button" id="plan-print">' + esc(t('workout.print')) + '</button>' +
      '</div>';
    out.appendChild(block);

    qsa('.plan-day', out).forEach(function (dayNode, dayIndex) {
      var actions = document.createElement('div');
      actions.className = 'plan-day-actions';
      actions.innerHTML = '<button class="btn btn-solid btn-sm" type="button" data-plan-day-add="' + dayIndex + '">' + esc(t('planAddDay')) + '</button>';
      dayNode.appendChild(actions);
    });

    // Инструменты редактирования на каждом упражнении плана
    qsa('.plan-ex', out).forEach(function (row, i) {
      var btn = qs('.plan-ex-name', row);
      if (!btn) return;
      var tools = document.createElement('div');
      tools.className = 'plan-ex-tools';
      tools.innerHTML =
        '<button class="btn btn-quiet btn-sm" type="button" data-plan-swap="' + esc(btn.dataset.open) + '" data-plan-i="' + i + '">' + esc(t('planSwapBtn')) + '</button>' +
        '<button class="btn btn-quiet btn-sm" type="button" data-plan-add="' + esc(btn.dataset.open) + '">' + esc(t('planAddOne')) + '</button>' +
        '<button class="btn btn-quiet btn-sm btn-danger" type="button" data-plan-del="' + i + '">' + esc(t('planDrop')) + '</button>';
      row.appendChild(tools);
    });

    $('plan-export').addEventListener('click', function () {
      copyText(JSON.stringify({ v: 3, kind: 'plan', ctx: ctx, days: week.map(function (d) {
        return { key: d.key, items: d.items.map(function (it) {
          return { id: it.ex.id, name: exName(it.ex), sets: it.sets, reps: it.reps, rest: it.rest };
        }) };
      }) }, null, 2), t('planExported'));
    });
    $('plan-print').addEventListener('click', function () { window.print(); });

    renderDashIfVisible();
    track('program_complete', { days: ctx.days, goal: ctx.goal });
  }

  function planRowAction(e) {
    var dayAdd=e.target.closest('[data-plan-day-add]');
    if(dayAdd&&S.plan&&S.plan.days){startPlanDayV7(Number(dayAdd.dataset.planDayAdd),false);return;}
    var swapBtn = e.target.closest('[data-plan-swap]');
    if (swapBtn) {
      var ex = BY_ID[swapBtn.dataset.planSwap];
      if (!ex) return;
      var alt = swapCandidates(ex, 'same')[0];
      if (!alt) { showToast(t('swapNone')); return; }
      var row = swapBtn.closest('.plan-ex');
      var nameBtn = qs('.plan-ex-name', row);
      nameBtn.textContent = exName(alt);
      nameBtn.dataset.open = alt.id;
      swapBtn.dataset.planSwap = alt.id;
      var tag = qs('.meta-tag', row);
      if (tag) tag.textContent = labelEq(alt.equip);
      var addBtn = qs('[data-plan-add]', row);
      if (addBtn) addBtn.dataset.planAdd = alt.id;
      showToast(t('planSwapped'));
      return;
    }
    var addBtn2 = e.target.closest('[data-plan-add]');
    if (addBtn2) {
      var id = addBtn2.dataset.planAdd;
      if (inWorkout(id)) { showToast(t('inWorkout')); return; }
      addToWorkout(id);
      return;
    }
    var delBtn = e.target.closest('[data-plan-del]');
    if (delBtn) {
      var r = delBtn.closest('.plan-ex');
      if (r) r.remove();
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
    var withVal = S.diary.filter(function (d) { return typeof d[field] === 'number'; });
    if (withVal.length < 2) return null;
    var newest = new Date(withVal[0].date).getTime();
    var target = newest - days * 86400000;
    var past = null;
    for (var i = 0; i < withVal.length; i++) {
      if (new Date(withVal[i].date).getTime() <= target) { past = withVal[i]; break; }
    }
    if (!past) past = withVal[withVal.length - 1];
    if (past === withVal[0]) return null;
    return withVal[0][field] - past[field];
  }

  function diaryAvg(field, days) {
    var cutoff = Date.now() - days * 86400000;
    var vals = S.diary.filter(function (d) {
      return typeof d[field] === 'number' && new Date(d.date).getTime() >= cutoff;
    }).map(function (d) { return d[field]; });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  function progressChart() {
    var pts = S.diary.filter(function (d) { return typeof d.weight === 'number'; })
      .slice(0, 60).reverse();
    if (pts.length < 2) return '<p class="tiny">' + esc(t('chartNeedMore')) + '</p>';

    var W = 560, H = 200, PADL = 38, PADR = 10, PADT = 14, PADB = 24;
    var values = pts.map(function (p) { return p.weight; });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (max - min < 1) { max = max + 0.5; min = min - 0.5; }
    var pad = (max - min) * 0.12;
    min -= pad; max += pad;

    var x = function (i) { return PADL + (i / (pts.length - 1)) * (W - PADL - PADR); };
    var y = function (v) { return PADT + (1 - (v - min) / (max - min)) * (H - PADT - PADB); };

    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.weight).toFixed(1); }).join(' ');

    // скользящее среднее за 7 точек
    var avg = pts.map(function (_, i) {
      var from = Math.max(0, i - 6);
      var slice = values.slice(from, i + 1);
      return slice.reduce(function (a, b) { return a + b; }, 0) / slice.length;
    });
    var avgLine = avg.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');

    var grid = '', labels = '';
    for (var g = 0; g <= 3; g++) {
      var val = min + ((max - min) * g) / 3;
      var yy = y(val).toFixed(1);
      grid += '<line class="prog-grid" x1="' + PADL + '" y1="' + yy + '" x2="' + (W - PADR) + '" y2="' + yy + '"/>';
      labels += '<text class="prog-axis" x="4" y="' + (Number(yy) + 3.5).toFixed(1) + '">' + val.toFixed(1) + '</text>';
    }
    var first = pts[0].date.slice(5), last = pts[pts.length - 1].date.slice(5);
    labels += '<text class="prog-axis" x="' + PADL + '" y="' + (H - 6) + '">' + esc(first) + '</text>' +
      '<text class="prog-axis" x="' + (W - PADR) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(last) + '</text>';

    var dots = pts.map(function (p, i) {
      return '<circle class="prog-dot" cx="' + x(i).toFixed(1) + '" cy="' + y(p.weight).toFixed(1) + '" r="3"><title>' + esc(p.date + ' · ' + p.weight.toFixed(1) + ' ' + t('kg')) + '</title></circle>';
    }).join('');

    return '<div class="prog-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(t('chartAria', { n: pts.length })) + '">' + grid + labels +
      '<path class="prog-avg" d="' + avgLine + '"/>' +
      '<path class="prog-line" d="' + line + '"/>' + dots + '</svg>' +
      '<p class="tiny v8-chart-legend">' + esc(t('chartLegend')) + '</p></div>';
  }

  function renderProgress() {
    var out = $('prog-out');
    if (!out) return;
    if (!S.diary.length) {
      out.innerHTML = '<div class="empty"><b>' + esc(t('diaryEmptyT')) + '</b><p>' + esc(t('diaryEmptyD')) + '</p></div>';
      out.setAttribute('data-filled', 'false');
      return;
    }

    var d7 = diaryDelta('weight', 7), d14 = diaryDelta('weight', 14), d30 = diaryDelta('weight', 30);
    var waist30 = diaryDelta('waist', 30);
    var avg7 = diaryAvg('weight', 7);
    var fmtD = function (v, unit) {
      if (v === null) return '—';
      return (v > 0 ? '+' : '') + v.toFixed(1) + ' ' + unit;
    };

    var st = dashSignal();
    var html = '<div class="v8-diary-head">' +
        '<p class="eyebrow v8-m0">' + esc(t('diaryTitle')) + '</p>' + signal(st.state, st.label) +
      '</div>' +
      progressChart() +
      '<div class="prog-deltas">' +
        '<div class="kpi kpi-accent"><span>' + esc(t('diaryAvg7')) + '</span><b>' +
          (avg7 === null ? '—' : avg7.toFixed(1) + ' ' + t('kg')) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('diary7')) + '</span><b>' + esc(fmtD(d7, t('kg'))) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('diary14')) + '</span><b>' + esc(fmtD(d14, t('kg'))) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('diary30')) + '</span><b>' + esc(fmtD(d30, t('kg'))) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('diaryWaist')) + '</span><b>' + esc(fmtD(waist30, t('cm'))) + '</b></div>' +
      '</div>' +
      '<p class="v8-muted-copy">' + esc(diaryVerdict(d14, waist30)) + '</p>' +
      coachNote({
        t: { ru: 'Не меняй план по одному измерению', en: 'Never change a plan on a single measurement' },
        d: { ru: 'Одна точка на графике почти всегда объясняется водой, солью или содержимым кишечника. Решение принимается по направлению линии за две-три недели.',
             en: 'One point on the chart is almost always water, salt or gut content. Decisions come from the direction of the line over two or three weeks.' },
        a: { ru: 'Смотри на среднюю линию — пунктир на графике. Отдельные точки нужны только для того, чтобы её построить.',
             en: 'Watch the dashed average line. Individual points exist only to build it.' }
      }, { compact: true }) +
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
    if (d14 === null) return t('diaryNoTrend');
    var goal = S.profile.goal;
    if (goal === 'fat') {
      if (d14 < -0.2) return t('diaryFatOk');
      if (waist30 !== null && waist30 < -1) return t('diaryFatWaist');
      return t('diaryFatFlat');
    }
    if (goal === 'muscle' || goal === 'strength') {
      if (d14 > 0.1) return t('diaryGainOk');
      return t('diaryGainFlat');
    }
    return t('diaryNeutral');
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
  var DATA_KEYS = ['fav', 'workout', 'lang', 'theme', 'density', 'profile', 'meta', 'history', 'diary', 'kbju', 'tips', 'coach', 'rest'];

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
  var EN2 = {
    /* навигация */
    'nav.cta': 'Discuss your goal',
    'nav.gTools': 'Tools', 'nav.gMethod': 'Method', 'nav.gAuthor': 'Pavel Markov',
    'nav.library': 'Exercises', 'nav.libraryS': '1,324 movements with step-by-step technique',
    'nav.workoutS': 'Today\u2019s session, rest timer and run mode',
    'nav.nutritionS': 'Calorie target, macros and a weekly check-in',
    'nav.program': 'Weekly plan', 'nav.programS': 'A training structure built for your conditions',
    'nav.progress': 'Progress', 'nav.progressS': 'Weight, waist, sleep and how you feel over time',
    'nav.method': 'The MARKOV MADE system', 'nav.methodS': 'Seven steps from goal to adjustment',
    'nav.knowledge': 'Knowledge base', 'nav.knowledgeS': '45 briefings: training, technique, nutrition, recovery',
    'nav.how': 'How to use it', 'nav.howS': 'Four steps through the site',
    'nav.about': 'About Pavel', 'nav.aboutS': 'The approach, the principles and the limits',
    'nav.contact': 'Personal coaching', 'nav.contactS': 'A quick enquiry in 15 seconds',
    'nav.faqS': 'Common questions about the site and the work',
    'mnav.program': 'Weekly plan', 'mnav.progress': 'My progress',
    'mnav.method': 'The MARKOV MADE system', 'mnav.knowledge': 'Knowledge base', 'mnav.about': 'About Pavel',

    /* hero и консоль */
    'hero.lede': 'Find the movement for the muscle you are training and the equipment you actually have, check the technique, build the session, work out your nutrition and understand what to change next. Tools and coaching notes in one interface, no sign-up.',
    'hero.byline': 'A training system by Pavel Markov',
    'hero.ctaSecondary': 'Discuss your goal with Pavel',
    'console.eyebrow': 'Quick start with Pavel',
    'console.title': 'Four answers and you know where to begin',
    'console.text': 'Goal, setting, experience and time — four inputs that build the starting session blueprint.',
    'console.disclaimer': 'This is initial guidance. A final plan also accounts for health, limitations, recovery and your real schedule.',
    'console.logoAlt': 'MARKOV MADE GYM — Pavel Markov’s fitness direction',
    'console.qGoal': 'Goal', 'console.qPlace': 'Where you train', 'console.qLevel': 'Experience',
    'console.qTime': 'Time you have today',
    'console.goalFat': 'Lose fat', 'console.goalMuscle': 'Build muscle',
    'console.goalStrength': 'Get stronger', 'console.goalHealth': 'Health and tone',
    'console.placeGym': 'At the gym', 'console.placeHome': 'At home', 'console.placeMixed': 'It varies',
    'console.lvlBeginner': 'Starting out', 'console.lvlMedium': 'I train regularly', 'console.lvlAdvanced': 'Over two years',
    'console.time30': '30 minutes', 'console.time50': '50 minutes', 'console.time70': '70 minutes',
    'console.hint': 'Answer four short questions — the recommendation appears after the final choice.',

    /* dashboard и онбординг */
    'dash.eyebrow': 'Your personal loop', 'dash.title': 'My system', 'dash.edit': 'Change settings',
    'onb.eyebrow': 'One-minute setup', 'onb.title': 'Four questions and the site adapts',
    'onb.text': 'Answers stay on this device only, are never sent anywhere and can be changed at any time.',
    'onb.skip': 'Skip', 'onb.back': 'Back',

    /* быстрые действия */
    'start.qaTitle': 'Quick actions',
    'qa.findT': 'Find an exercise', 'qa.findS': 'Search by muscle, movement or equipment',
    'qa.workoutT': 'Build a session', 'qa.workoutS': 'Order, sets, rest and a timer',
    'qa.kbjuT': 'Calculate macros', 'qa.kbjuS': 'Calorie target, macros and what to track',
    'qa.askT': 'Ask Pavel a question', 'qa.askS': 'A quick enquiry in 15 seconds',

    /* метод */
    'method.eyebrow': 'Method', 'method.title': 'The MARKOV MADE system',
    'method.text': 'A working sequence from goal and context to feedback and adjustment.',
    'ux.methodSteps': '7 steps', 'ux.methodData': 'data over guesswork', 'ux.methodMedical': 'not a medical protocol',
    'ux.muscleStep1': '01 area', 'ux.muscleStep2': '02 muscle', 'ux.muscleStep3': '03 exercises',
    'ux.muscleFlowAria': 'Selection steps', 'ux.flowZone': 'Area', 'ux.flowMuscle': 'Muscle', 'ux.flowExercises': 'Exercises',
    'ux.progressLocal': 'browser only', 'ux.progressTrend': 'track the trend', 'ux.progressOptional': 'optional',
    'ux.progressMeasures': 'Measurements', 'ux.progressState': 'Condition', 'ux.progressContext': 'Week context',
    'ux.kbPractice': 'straight to practice', 'ux.kbMedical': 'medical questions go to a doctor',

    /* библиотека и карточка */
    'lib.coachMode': 'Coach mode',
    'modal.dose': 'Dosing and progression', 'modal.swapT': 'Need a substitute',
    'modal.swapHint': 'Pick a reason and we will show the nearest alternatives for the same target muscle and the equipment you have.',

    /* тренировка */
    'workout.run': 'Start the session', 'workout.finish': 'Finish and save', 'workout.print': 'Print or PDF',
    'workout.timerStart': 'Start rest', 'workout.nameL': 'Session name', 'workout.namePh': 'Upper body, day 1',
    'workout.dateL': 'Date', 'workout.noteL': 'Session note',
    'workout.notePh': 'How it felt, what worked, what to move',
    'workout.ioT': 'Export and import', 'workout.export': 'Export JSON', 'workout.import': 'Import JSON',
    'workout.ioL': 'Session data as JSON', 'workout.histT': 'Recent sessions',

    /* сверка */
    'checkin.eyebrow': 'Weekly check-in', 'checkin.title': 'What to do with your calories next',
    'checkin.text': 'Fill in your two-week averages — the check-in will tell you whether to change calories or gather more data first.',
    'checkin.prev': 'Last week\u2019s average weight, kg', 'checkin.now': 'This week\u2019s average weight, kg',
    'checkin.waist': 'Waist this week', 'checkin.wDown': 'Went down', 'checkin.wSame': 'No change', 'checkin.wUp': 'Went up',
    'checkin.strength': 'Working weights', 'checkin.sUp': 'Going up', 'checkin.sSame': 'Holding', 'checkin.sDown': 'Dropping',
    'checkin.hunger': 'Hunger', 'checkin.hLow': 'Calm', 'checkin.hMid': 'Noticeable but manageable', 'checkin.hHigh': 'Strong, getting in the way',
    'checkin.sleep': 'Sleep', 'checkin.slGood': '7 hours or more', 'checkin.slMid': '6–7 hours', 'checkin.slBad': 'Under 6 hours',
    'checkin.adherence': 'How closely you followed the plan',
    'checkin.aHigh': 'Almost every day on plan', 'checkin.aMid': 'Off plan on 1–2 days', 'checkin.aLow': 'Rough estimates only',
    'checkin.calc': 'Show the verdict',
    'checkin.hint': 'The logic is deliberately conservative: with thin data it will suggest waiting rather than changing your intake.',

    /* план */
    'plan.advT': 'Additional parameters',
    'plan.style': 'Preferred style', 'plan.styleBalanced': 'Balanced', 'plan.styleFree': 'Free weights',
    'plan.styleMachine': 'Machines and cables', 'plan.styleMinimal': 'Minimal equipment',
    'plan.recovery': 'Recovery', 'plan.recGood': 'Good: 7+ hours of sleep', 'plan.recMid': 'Average', 'plan.recLow': 'Poor: short sleep, stress',
    'plan.cardio': 'Cardio', 'plan.cardioNone': 'Not needed', 'plan.cardioLight': 'Easy', 'plan.cardioMixed': 'Easy plus intervals',
    'plan.steps': 'Steps per day', 'plan.steps1': 'Under 5 thousand', 'plan.steps2': '5–8 thousand', 'plan.steps3': 'Over 8 thousand',
    'plan.avoid': 'Movements to exclude', 'plan.avoidPh': 'Barbell squat, deadlift, dips',
    'plan.avoidHint': 'Comma separated. Matches by name and by target muscle are removed from the selection.',
    'plan.limits': 'Limiting areas', 'plan.limShoulders': 'Shoulder', 'plan.limBack': 'Lower back',
    'plan.limKnee': 'Knee', 'plan.limElbow': 'Elbow',
    'plan.limHint': 'Marked areas get less volume and movements with a more controlled path. This is not medical advice — pain needs a doctor.',

    /* прогресс */
    'prog.eyebrow': 'Feedback', 'prog.title': 'My progress',
    'prog.text': 'An optional diary: weight, waist, sleep and how you feel. Entries live in this browser only — no sign-up, nothing is sent anywhere.',
    'prog.date': 'Date', 'prog.weight': 'Weight, kg', 'prog.waist': 'Waist, cm', 'prog.sleep': 'Sleep, hours',
    'prog.mood': 'How you feel', 'prog.m5': 'Great', 'prog.m4': 'Good', 'prog.m3': 'Normal', 'prog.m2': 'Not great', 'prog.m1': 'Bad',
    'prog.hunger': 'Hunger', 'prog.hun1': 'Calm', 'prog.hun2': 'Moderate', 'prog.hun3': 'Strong',
    'prog.fatigue': 'Fatigue', 'prog.f1': 'Low', 'prog.f2': 'Medium', 'prog.f3': 'High',
    'prog.lift': 'Key strength marker', 'prog.liftPh': 'Squat 5×80 kg',
    'prog.note': 'Comment', 'prog.notePh': 'What is worth remembering about this week',
    'prog.save': 'Save entry', 'prog.export': 'Export JSON', 'prog.import': 'Import JSON', 'prog.clear': 'Clear the diary',
    'prog.ioL': 'Diary entries as JSON',

    /* база знаний */
    'kb.eyebrow': 'Knowledge base', 'kb.title': 'Briefings by Pavel Markov',
    'kb.text': 'Short practical pieces: the takeaway, what to do about it and a coach\u2019s note. No diagnoses, treatment plans or prescriptions — those are questions for a doctor.',
    'kb.searchL': 'Search the knowledge base', 'kb.searchPh': 'Rest, protein, plateau, warm-up…',
    'kb.catAll': 'All', 'kb.catTraining': 'Training', 'kb.catTechnique': 'Technique',
    'kb.catNutrition': 'Nutrition', 'kb.catRecovery': 'Recovery', 'kb.catSaved': 'Saved',

    /* об авторе */
    'about.eyebrow': 'Author of the system', 'about.title': 'Pavel Markov',
    'about.lede': 'MARKOV MADE GYM was not built as another list of exercises. The job was different: to shorten the path from "what do I do today" to a sound training decision — which movement to pick, why it is there, how to control the technique and when the plan needs changing.',
    'about.text2': 'Most gym mistakes are not bad exercises but decisions made without context: a programme that does not fit your schedule, a weight that does not fit your technique, a deficit that does not fit your life. The tools here cover exactly that part: choice, structure and feedback.',
    'about.p1t': 'The decision comes before the exercise',
    'about.p1d': 'A movement is chosen for the job, the equipment and your ability to control it. How popular it is does not appear on that list.',
    'about.p2t': 'Progression beats variety',
    'about.p2d': 'A programme repeated for weeks outperforms any programme swapped every month for the sake of novelty.',
    'about.p3t': 'Decisions come from data',
    'about.p3d': 'Weekly average weight, waist, working weights, sleep. One metric almost always lies — so we read several.',
    'about.p4t': 'Honest limits',
    'about.p4d': 'This site does not diagnose and does not replace a doctor. Where pain or a medical question begins, a coach\u2019s responsibility ends.',
    'about.photoNote': 'Pavel Markov is the author of the system and every practical tool inside MARKOV MADE GYM.',
    'about.noteK': 'A personal note',
    'about.noteD': 'You can use these tools as long as you like and buy nothing — they cover exercise selection, the shape of your week and your nutrition numbers. Personal coaching is for where context decides: limitations, a packed schedule, a stall, or a specific deadline. If you are not sure which of those you are in, just write and describe the task in two sentences.',
    'about.cta': 'Discuss your goal with Pavel',

    /* заявка */
    'lead.formTitle': 'Quick enquiry', 'lead.formTime': '≈ 15 seconds',
    'lead.contact': 'Telegram or another contact', 'lead.contactPh': '@username, email or phone',
    'lead.goal': 'Goal',
    'lead.gFat': 'Lose fat', 'lead.gMuscle': 'Build muscle', 'lead.gStrength': 'Increase strength',
    'lead.gProgram': 'Get a programme', 'lead.gNutrition': 'Sort out nutrition',
    'lead.gReturn': 'Come back after a break', 'lead.gOther': 'Something else',
    'lead.send': 'Discuss your goal with Pavel', 'lead.direct': 'Message on Telegram right away',
    'lead.moreT': 'Add details — Pavel will understand the task faster',
    'lead.moreTime': 'One or two more minutes. Every field is optional.',
    'lead.notSet': 'Not specified',
    'lead.exp': 'Training experience', 'lead.expBeginner': 'Starting or coming back',
    'lead.expMedium': 'Training regularly', 'lead.expAdvanced': 'Over two years',
    'lead.schedule': 'Schedule', 'lead.schedulePh': '3 sessions a week, evenings',
    'lead.limits': 'Injuries and limitations', 'lead.limitsPh': 'What bothers you or what you cannot do',
    'lead.nutrition': 'Nutrition right now', 'lead.nutritionPh': 'I count calories / I eat as it comes',
    'lead.tried': 'What you have already tried', 'lead.triedPh': 'Which programmes and approaches you ran and how they ended',
    'lead.when': 'Best time to reach you', 'lead.whenPh': 'Weekdays after 7pm',
    'lead.asksT': 'Or pick a ready-made topic — the message writes itself:',
    'lead.privacy': 'The form never sends anything on its own: it assembles the text and opens Telegram, where you send it yourself. No "sent" status is shown here, because the site cannot confirm delivery.',

    /* быстрая заявка и режим выполнения */
    'sheet.title': 'Ask Pavel a question',
    'sheet.text': 'Pick a topic — the message assembles itself. You can edit it before sending.',
    'sheet.msgL': 'Message', 'sheet.msgPh': 'Describe the task in two sentences',
    'sheet.note': 'The site cannot send the message for you: it copies the text and opens Telegram, where you press Send.',
    'sheet.send': 'Copy and open Telegram', 'sheet.full': 'Open the full form',
    'run.title': 'Run mode', 'run.prev': 'Back', 'run.rest': 'Rest', 'run.next': 'Next set',
    'fab.label': 'Ask Pavel a question',
    'mfb.filters': 'Filters', 'mfb.workout': 'Session', 'mfb.ask': 'Pavel',

    /* данные и футер */
    'data.title': 'My data',
    'data.text': 'Settings, saved exercises, sessions, history, plans, calculations and the diary are stored in this browser only. Nothing goes to a server and there is no account. Clearing your browser data deletes all of it permanently — which is why export exists.',
    'data.export': 'Export all data', 'data.import': 'Load from a file', 'data.clear': 'Delete all data',
    'data.ioL': 'All data as JSON',
    'footer.colProduct': 'Tools', 'footer.colMethod': 'Method', 'footer.colHelp': 'Pavel Markov',

    /* aria */
    'aria.coach': 'Coach mode', 'aria.rest': 'Rest duration',
    'aria.kbCats': 'Categories', 'aria.swapWhy': 'Reason for the substitution'
  };
  for (var _k in EN2) { if (Object.prototype.hasOwnProperty.call(EN2, _k)) EN[_k] = EN2[_k]; }

  /* Рантайм-строки нового слоя. */
  var T2 = {
    /* единицы */
    kg: { ru: 'кг', en: 'kg' }, cm: { ru: 'см', en: 'cm' }, hrs: { ru: 'ч сна', en: 'h sleep' },
    'ultimate.kbjuBody': { ru: 'Параметры тела', en: 'Body' },
    'ultimate.kbjuActivity': { ru: 'Активность и тренировки', en: 'Activity & training' },
    'ultimate.kbjuGoal': { ru: 'Цель и темп', en: 'Goal & pace' },
    dashWorkoutSets: { ru: 'выполнено подходов: {done} / {total}', en: 'sets completed: {done} / {total}' },
    nextResume: { ru: 'Продолжи активную тренировку', en: 'Resume your active workout' },
    nextResumeWhy: { ru: 'Сессия уже начата — не теряй текущие подходы', en: 'The session is already in progress — keep the logged sets' },
    nextStart: { ru: 'Тренировка собрана — переходи к выполнению', en: 'Your workout is ready — start the session' },
    nextStartWhy: { ru: 'Упражнения и рабочие подходы уже готовы', en: 'Exercises and working sets are already prepared' },
    nextSave: { ru: 'Все подходы выполнены — зафиксируй результат', en: 'All sets are complete — save the result' },
    nextSaveWhy: { ru: 'История нужна для сравнения следующей тренировки', en: 'Saving it gives the next session a real comparison point' },
    nextRefresh: { ru: 'Обнови дневник прогресса', en: 'Refresh your progress log' },
    nextRefreshWhy: { ru: 'Последняя запись была {n} дней назад', en: 'Your last entry was {n} days ago' },
    continuityReady: { ru: 'Тренировка готова', en: 'Workout ready' },
    continuityActive: { ru: 'Активная тренировка', en: 'Active workout' },
    continuityStart: { ru: 'Начать тренировку', en: 'Start workout' },
    continuityResume: { ru: 'Продолжить тренировку', en: 'Resume workout' },
    continuityElapsed: { ru: 'в работе {v}', en: 'active {v}' },
    mobileNavAria: { ru: 'Основная навигация', en: 'Primary navigation' },
    mobileHome: { ru: 'Главная', en: 'Home' }, mobileLibrary: { ru: 'Библиотека', en: 'Library' },
    mobileWorkout: { ru: 'Тренировка', en: 'Workout' }, mobileProgress: { ru: 'Прогресс', en: 'Progress' }, mobileMore: { ru: 'Ещё', en: 'More' },
    runJumpSet: { ru: 'Перейти к подходу {i}', en: 'Go to set {i}' },
    runUsePrevious: { ru: 'Повторить предыдущий результат', en: 'Reuse previous result' },
    runUsePreviousValue: { ru: '{v}', en: '{v}' },
    histDetails: { ru: 'Подходы', en: 'Sets' }, histHideDetails: { ru: 'Скрыть', en: 'Hide' },
    histSet: { ru: 'Подход {i}', en: 'Set {i}' },
    progressEvidence: { ru: 'Основание: {diary} записей дневника · {sessions} тренировок за 30 дней', en: 'Evidence: {diary} diary entries · {sessions} sessions in 30 days' },

    /* авторский компонент */
    coachKicker: { ru: 'Рекомендация Павла', en: 'Pavel\u2019s take' },
    coachOnExercise: { ru: 'Из практики', en: 'From practice' },
    whyThis: { ru: 'Почему я это рекомендую?', en: 'Why do I recommend this?' },
    whyLimit: { ru: 'Это отправная точка. Подбор идёт по правилам и учитывает только указанные параметры — он ничего не знает о травмах, подвижности и истории тренировок.',
                en: 'This is a starting point. The suggestion runs on rules and uses only the parameters you gave — it knows nothing about injuries, mobility or training history.' },

    /* режим тренера: библиотека */
    whyNoResults: { ru: 'По выбранным фильтрам нет ни одного упражнения', en: 'No exercises match the current filters' },
    whyZone: { ru: 'Выбрана зона: {v}', en: 'Selected area: {v}' },
    whyMuscle: { ru: 'Выбрана мышца: {v}', en: 'Selected muscle: {v}' },
    whyEquip: { ru: 'Выбрано оборудование: {v}', en: 'Selected equipment: {v}' },
    whyCount: { ru: 'Найдено движений: {n}', en: 'Movements found: {n}' },

    /* режим тренера: тренировка */
    whyEmptyWorkout: { ru: 'В тренировке пока нет упражнений', en: 'The session has no exercises yet' },
    whyWorkoutEx: { ru: 'Упражнений в сессии: {n}', en: 'Exercises in the session: {n}' },
    whyWorkoutSets: { ru: 'Суммарно рабочих подходов: {n}', en: 'Total working sets: {n}' },
    whyWorkoutZones: { ru: 'Задействовано зон тела: {n}', en: 'Body areas involved: {n}' },

    /* консоль */
    whyGoal: { ru: 'Задача: {v}', en: 'Goal: {v}' },
    whyPlace: { ru: 'Место тренировки: {v}', en: 'Training location: {v}' },
    whyLevel: { ru: 'Опыт: {v}', en: 'Experience: {v}' },
    whyTime: { ru: 'Времени сегодня: {v} мин', en: 'Time today: {v} min' },
    consoleNext: { ru: 'Ближайшее действие:', en: 'Next action:' },
    consoleLibrary: { ru: 'Открыть библиотеку', en: 'Open the library' },
    consoleAsk: { ru: 'Задать вопрос', en: 'Ask a question' },
    actKbju: { ru: 'Рассчитать КБЖУ', en: 'Calculate macros' },
    actPlan: { ru: 'Собрать план недели', en: 'Build the weekly plan' },
    actWorkout: { ru: 'Открыть тренировку', en: 'Open the session' },
    actProgress: { ru: 'Записать в дневник', en: 'Log in the diary' },
    onbSaved: { ru: 'Настройки сохранены на этом устройстве', en: 'Settings saved on this device' },

    /* dashboard */
    dashNoGoal: { ru: 'не выбрана', en: 'not set' },
    dashGoal: { ru: 'Задача', en: 'Goal' },
    dashDays: { ru: '{n} дня в неделю', en: '{n} days a week' },
    dashNotSet: { ru: 'частота не указана', en: 'frequency not set' },
    dashFav: { ru: 'Сохранено', en: 'Saved' },
    dashFavS: { ru: 'движений в избранном', en: 'movements in your list' },
    dashFavEmpty: { ru: 'список пока пуст', en: 'the list is still empty' },
    dashWorkout: { ru: 'Тренировка', en: 'Session' },
    dashWorkoutS: { ru: 'выполнено упражнений: {n}', en: 'exercises done: {n}' },
    dashWorkoutEmpty: { ru: 'на сегодня не собрана', en: 'nothing built for today' },
    dashKbju: { ru: 'Норма калорий', en: 'Calorie target' },
    dashNotCounted: { ru: 'ещё не рассчитана', en: 'not calculated yet' },
    dashPlan: { ru: 'План недели', en: 'Weekly plan' },
    dashPlanS: { ru: 'тренировочных дней', en: 'training days' },
    dashNoPlan: { ru: 'ещё не собран', en: 'not built yet' },
    dashDiary: { ru: 'Последний вес', en: 'Latest weight' },
    dashDiaryS: { ru: 'запись от {d}', en: 'entry from {d}' },
    dashNoDiary: { ru: 'дневник пуст', en: 'the diary is empty' },

    /* следующий шаг */
    nextLibrary: { ru: 'Начни с подбора движений под свою зону', en: 'Start by picking movements for your area' },
    nextLibraryWhy: { ru: 'Пока ничего не сохранено — библиотека даст точку отсчёта', en: 'Nothing saved yet — the library gives you a starting point' },
    nextWorkout: { ru: 'Собери тренировку на сегодня', en: 'Build today\u2019s session' },
    nextWorkoutWhy: { ru: 'Избранное есть, но сессия на сегодня пустая', en: 'You have saved movements but no session for today' },
    nextKbju: { ru: 'Рассчитай ориентир по калориям', en: 'Work out your calorie reference' },
    nextKbjuWhy: { ru: 'Тренировки без питания решают только половину задачи', en: 'Training without nutrition solves only half the job' },
    nextPlan: { ru: 'Собери структуру недели', en: 'Build the shape of your week' },
    nextPlanWhy: { ru: 'Разовая тренировка — это ещё не программа', en: 'A single session is not a programme yet' },
    nextDiary: { ru: 'Начни записывать вес и талию', en: 'Start logging weight and waist' },
    nextDiaryWhy: { ru: 'Без двух-трёх точек оценить динамику нельзя', en: 'Without two or three data points there is no trend to read' },
    nextKeep: { ru: 'Держи режим и записывай данные две недели', en: 'Hold the routine and log data for two weeks' },
    nextKeepWhy: { ru: 'Всё основное настроено — дальше решает регулярность', en: 'The essentials are set — consistency decides from here' },

    /* сигналы */
    sigNone: { ru: 'Мало данных', en: 'Not enough data' },
    sigOk: { ru: 'Нормально', en: 'On track' },
    sigWatch: { ru: 'Нужно наблюдать', en: 'Worth watching' },
    sigChange: { ru: 'Стоит изменить', en: 'Worth changing' },

    /* карточка упражнения */
    kindLabel: { ru: 'Тип движения', en: 'Movement type' },
    levelLabel: { ru: 'Уровень', en: 'Level' },
    repsLabel: { ru: 'Повторения', en: 'Reps' },
    restLabel: { ru: 'Отдых', en: 'Rest' },
    rirLabel: { ru: 'Запас до отказа', en: 'Reps in reserve' },
    keyLabel: { ru: 'Ключевой контроль', en: 'Key control point' },
    errLabel: { ru: 'Типичная ошибка', en: 'Common mistake' },
    whenSwapLabel: { ru: 'Когда заменить', en: 'When to swap it' },
    easierLabel: { ru: 'Как упростить', en: 'How to make it easier' },
    harderLabel: { ru: 'Как усложнить', en: 'How to make it harder' },
    kindCompound: { ru: 'Базовое, многосуставное', en: 'Compound, multi-joint' },
    kindAccessory: { ru: 'Дополнительное', en: 'Accessory' },
    kindIsolation: { ru: 'Изолирующее', en: 'Isolation' },
    lvlEasy: { ru: 'Доступный старт', en: 'Accessible start' },
    lvlMid: { ru: 'Средний', en: 'Intermediate' },
    lvlHard: { ru: 'Требует опыта', en: 'Needs experience' },

    /* замена */
    swapWhyEquip: { ru: 'Та же целевая мышца, другое оборудование: {v}', en: 'Same target muscle, different equipment: {v}' },
    swapWhyGroup: { ru: 'Близкая мышечная группа: {v}', en: 'Adjacent muscle group: {v}' },
    swapWhyEasier: { ru: 'Проще контролировать технику', en: 'Easier to control technically' },
    swapWhyHarder: { ru: 'Сложнее технически, больше потенциал нагрузки', en: 'Harder technically, more room to load' },
    swapWhySame: { ru: 'Та же мышца, оборудование: {v}', en: 'Same muscle, equipment: {v}' },
    swapNotIdentical: { ru: 'Полностью идентичных замен не бывает — это ближайшие альтернативы.',
                        en: 'No substitute is ever identical — these are the nearest alternatives.' },
    swapNone: { ru: 'Под эту причину подходящих вариантов не нашлось. Попробуй другую причину.',
                en: 'No suitable options for that reason. Try a different one.' },
    openShort: { ru: 'Открыть', en: 'Open' },

    /* таймер и режим выполнения */
    timerStart: { ru: 'Старт отдыха', en: 'Start rest' },
    timerStop: { ru: 'Остановить', en: 'Stop' },
    timerDone: { ru: 'Отдых закончен — следующий подход', en: 'Rest is over — next set' },
    'run.next': { ru: 'Следующий подход', en: 'Next set' },
    'run.restLeft': { ru: 'Отдых {v}', en: 'Rest {v}' },
    runSet: { ru: 'подход', en: 'set' },
    runSkip: { ru: 'Пропустить упражнение', en: 'Skip this exercise' },
    runProgress: { ru: 'Упражнение {i} из {n}', en: 'Exercise {i} of {n}' },
    runFinished: { ru: 'Готово', en: 'Done' },
    runFinish: { ru: 'Закрыть', en: 'Close' },
    runDoneTitle: { ru: 'Тренировка пройдена', en: 'Session complete' },
    runDoneText: { ru: 'Отметь фактические веса в списке и сохрани сессию — на следующей тренировке будет от чего отталкиваться.',
                   en: 'Log your actual weights in the list and save the session — the next one will have a reference point.' },

    /* история */
    histSaved: { ru: 'Тренировка сохранена в историю', en: 'Session saved to history' },
    histEmpty: { ru: 'Сохранённых тренировок пока нет. Завершённая сессия попадёт сюда и её можно будет повторить.',
                 en: 'No saved sessions yet. A finished session lands here and can be repeated.' },
    histMeta: { ru: '{n} упражнений, выполнено {d}', en: '{n} exercises, {d} done' },
    histRepeat: { ru: 'Повторить', en: 'Repeat' },
    histDelete: { ru: 'Удалить из истории', en: 'Delete from history' },
    histRepeated: { ru: 'Тренировка загружена в текущую сессию', en: 'Session loaded as your current one' },

    /* экспорт и импорт */
    ioBadJson: { ru: 'Не получилось прочитать JSON — проверь текст', en: 'Could not read the JSON — check the text' },
    ioBadShape: { ru: 'Структура файла не подходит', en: 'The file structure does not match' },
    ioNothing: { ru: 'В данных нет ничего, что можно загрузить', en: 'Nothing in the data can be loaded' },
    ioImported: { ru: 'Загружено упражнений: {n}', en: 'Exercises loaded: {n}' },
    ioRestored: { ru: 'Восстановлено разделов: {n}. Страница перезагрузится', en: 'Sections restored: {n}. The page will reload' },
    dataConfirm: { ru: 'Удалить все локальные данные: настройки, избранное, тренировки, историю, планы и дневник? Отменить будет нельзя.',
                   en: 'Delete all local data: settings, saved exercises, sessions, history, plans and the diary? This cannot be undone.' },
    dataCleared: { ru: 'Данные удалены. Страница перезагрузится', en: 'Data deleted. The page will reload' },

    /* КБЖУ */
    whyKbjuFormula: { ru: 'Формула расчёта: {v}', en: 'Calculation formula: {v}' },
    whyKbjuActivity: { ru: 'Учтены пол, возраст, рост, вес, активность и темп', en: 'Sex, age, height, weight, activity and pace are accounted for' },
    whyKbjuNoHistory: { ru: 'Не учтены: история питания, лекарства, состояние здоровья', en: 'Not accounted for: nutrition history, medication, health status' },
    kbjuWatchT: { ru: 'Что отслеживать 2–3 недели', en: 'What to track for 2–3 weeks' },
    kbjuUncertainty: { ru: 'Точность расчёта — примерно ±10 %. Это ориентир для старта, а не измеренная величина: реальный расход становится понятен только по динамике веса за две-три недели.',
                       en: 'Accuracy is roughly ±10 %. This is a starting reference, not a measurement: your real expenditure only becomes clear from two or three weeks of weight data.' },
    kbjuHowStart: { ru: 'Как начать.', en: 'How to start.' },
    kbjuHowStartText: { ru: 'Держи цифру неизменной две недели и взвешивайся каждое утро в одинаковых условиях. Решение принимается по среднему за неделю, а не по отдельному дню.',
                        en: 'Hold the number for two weeks and weigh in every morning under the same conditions. Decisions come from the weekly average, never from one day.' },
    kbjuNever: { ru: 'Чего не делать.', en: 'What not to do.' },
    kbjuNeverText: { ru: 'Не снижай калории при каждой остановке веса, не опускай белок и жиры ниже нижних границ и не оценивай результат по одному взвешиванию.',
                     en: 'Do not cut calories at every stall, do not push protein or fat below their floors, and do not judge the result from a single weigh-in.' },
    kbjuToCheckin: { ru: 'Перейти к недельной сверке', en: 'Go to the weekly check-in' },

    /* сверка */
    checkinResult: { ru: 'Вывод сверки', en: 'Check-in verdict' },
    checkinDelta: { ru: 'Изменение веса', en: 'Weight change' },
    checkinAbs: { ru: 'В килограммах', en: 'In kilograms' },
    whyCheckPct: { ru: 'Изменение среднего веса: {v} %', en: 'Change in average weight: {v} %' },
    whyCheckGoal: { ru: 'Цель: {v}', en: 'Goal: {v}' },
    whyCheckSignals: { ru: 'Силовые: {s}. Талия: {w}', en: 'Strength: {s}. Waist: {w}' },
    errPickGoal: { ru: 'Выбери цель — это одна кнопка', en: 'Pick a goal — it is a single tap' },

    /* план */
    planWhyT: { ru: 'Почему такой сплит.', en: 'Why this split.' },
    planWarmT: { ru: 'Разминка.', en: 'Warm-up.' },
    planSkipT: { ru: 'Если пропустил тренировку.', en: 'If you miss a session.' },
    planSwapT: { ru: 'Когда менять упражнение.', en: 'When to swap an exercise.' },
    planDurationT: { ru: 'Сколько работать по плану.', en: 'How long to run this plan.' },
    planRecoveryWarn: { ru: 'При плохом восстановлении начни с нижней границы подходов и добавляй объём только после двух спокойных недель.',
                        en: 'With poor recovery, start at the lower end of the set range and add volume only after two calm weeks.' },
    planCardioLight: { ru: '20–40 минут спокойного кардио 2–3 раза в неделю, после силовой или в отдельный день.',
                       en: '20–40 minutes of easy cardio 2–3 times a week, after lifting or on a separate day.' },
    planCardioMixed: { ru: 'Основа — спокойное кардио 2–3 раза в неделю плюс один интервальный блок. Не ставь интервалы перед силовой.',
                       en: 'Base of easy cardio 2–3 times a week plus one interval block. Never put intervals before a lifting session.' },
    planSwapBtn: { ru: 'Заменить', en: 'Swap' },
    planAddOne: { ru: 'В тренировку', en: 'To session' },
    planDrop: { ru: 'Убрать', en: 'Remove' },
    planSwapped: { ru: 'Упражнение заменено', en: 'Exercise swapped' },
    planDropped: { ru: 'Упражнение убрано из плана', en: 'Exercise removed from the plan' },
    planExport: { ru: 'Экспорт плана', en: 'Export the plan' },
    planExported: { ru: 'План скопирован в буфер обмена', en: 'Plan copied to the clipboard' },
    whyPlanDays: { ru: 'Тренировочных дней в неделю: {n}', en: 'Training days per week: {n}' },
    whyPlanTime: { ru: 'Длительность сессии: {n} мин', en: 'Session length: {n} min' },
    whyPlanPlace: { ru: 'Доступное оборудование: {v}', en: 'Available equipment: {v}' },
    whyPlanLevel: { ru: 'Уровень: {v}', en: 'Level: {v}' },
    whyPlanLimits: { ru: 'Ограничивающие зоны: {v}', en: 'Limiting areas: {v}' },
    'workout.print': { ru: 'Печать или PDF', en: 'Print or PDF' },

    /* дневник */
    diarySaved: { ru: 'Запись сохранена', en: 'Entry saved' },
    diaryNeedValue: { ru: 'Укажи хотя бы вес или талию', en: 'Enter at least weight or waist' },
    diaryDelete: { ru: 'Удалить запись', en: 'Delete entry' },
    diaryTitle: { ru: 'Динамика', en: 'Trend' },
    diaryEmptyT: { ru: 'Дневник пока пуст', en: 'The diary is still empty' },
    diaryEmptyD: { ru: 'Достаточно веса раз в день и талии раз в неделю. Через две недели появится линия, по которой уже можно принимать решения.',
                   en: 'Weight once a day and waist once a week is enough. In two weeks you will have a line worth acting on.' },
    diaryAvg7: { ru: 'Средний вес, 7 дней', en: 'Average weight, 7 days' },
    diary7: { ru: 'За 7 дней', en: 'Over 7 days' },
    diary14: { ru: 'За 14 дней', en: 'Over 14 days' },
    diary30: { ru: 'За 30 дней', en: 'Over 30 days' },
    diaryWaist: { ru: 'Талия за 30 дней', en: 'Waist over 30 days' },
    diaryNoTrend: { ru: 'Записей пока мало: для оценки направления нужно минимум две недели наблюдений.',
                    en: 'Too few entries: reading a direction needs at least two weeks of data.' },
    diaryFatOk: { ru: 'Динамика соответствует снижению жира. Пока средний вес идёт вниз, а силовые держатся, менять рацион не нужно.',
                  en: 'The trend matches fat loss. While the average weight falls and your lifts hold, there is nothing to change.' },
    diaryFatWaist: { ru: 'Вес почти не двигается, но талия уменьшилась. Это нормальная ситуация: состав тела меняется, даже когда цифра на весах стоит.',
                     en: 'Weight is barely moving but the waist has come down. That is a normal situation: composition changes even when the scale does not.' },
    diaryFatFlat: { ru: 'Динамика остановилась. Сначала проверь точность подсчёта и количество шагов, и только потом трогай калории.',
                    en: 'The trend has stalled. Check tracking accuracy and step count first, and only then touch calories.' },
    diaryGainOk: { ru: 'Вес растёт в разумном темпе. Следи, чтобы вместе с ним росли и рабочие веса.',
                   en: 'Weight is rising at a sensible pace. Make sure your working weights rise with it.' },
    diaryGainFlat: { ru: 'Вес стоит. Если рабочие веса при этом растут — всё в порядке, если нет — добавь 100–150 ккал.',
                     en: 'Weight is flat. If your lifts are still going up that is fine; if not, add 100–150 kcal.' },
    diaryNeutral: { ru: 'Вес держится в своём коридоре. Для поддержания это и есть нужный результат.',
                    en: 'Weight is holding inside its corridor. For maintenance that is exactly the result you want.' },
    chartNeedMore: { ru: 'Для графика нужно минимум две записи с весом.', en: 'The chart needs at least two entries with weight.' },
    chartLegend: { ru: 'Сплошная линия — измерения, пунктир — скользящее среднее за 7 записей. Решения принимают по пунктиру.',
                   en: 'Solid line: measurements. Dashed line: 7-entry moving average. Decisions come from the dashed line.' },
    chartAria: { ru: 'График веса по {n} записям дневника', en: 'Weight chart across {n} diary entries' },

    /* база знаний */
    kbCount: { ru: 'Показано материалов: {n} из {total}', en: 'Showing {n} of {total} briefings' },
    kbPractice: { ru: 'Что делать на практике', en: 'What to do about it' },
    kbSave: { ru: 'Сохранить', en: 'Save' },
    kbUnsave: { ru: 'Убрать из сохранённых', en: 'Remove from saved' },
    kbOpenTool: { ru: 'Открыть: {v}', en: 'Open: {v}' },
    kbEmptyT: { ru: 'Ничего не нашлось', en: 'Nothing found' },
    kbEmptyD: { ru: 'Попробуй другое слово или сними фильтр по категории.', en: 'Try another word or clear the category filter.' },

    /* заявка */
    'lead.exp': { ru: 'Опыт', en: 'Experience' },
    'lead.format': { ru: 'Формат', en: 'Format' },
    'lead.start': { ru: 'Старт', en: 'Start' },
    'lead.schedule': { ru: 'График', en: 'Schedule' },
    'lead.limits': { ru: 'Ограничения', en: 'Limitations' },
    'lead.nutrition': { ru: 'Питание', en: 'Nutrition' },
    'lead.tried': { ru: 'Что пробовал', en: 'Already tried' },
    'lead.when': { ru: 'Время связи', en: 'Best time' },
    leadReadyT: { ru: 'Заявка подготовлена.', en: 'Your enquiry is ready.' },
    leadReadyD: { ru: 'Текст скопирован в буфер обмена, Telegram открыт в новой вкладке. Сайт не может отправить сообщение за тебя — последний шаг остаётся за тобой.',
                  en: 'The text is on your clipboard and Telegram has opened in a new tab. The site cannot send it for you — the last step is yours.' },
    leadStep1: { ru: 'Перейди во вкладку с Telegram', en: 'Switch to the Telegram tab' },
    leadStep2: { ru: 'Вставь текст в поле сообщения', en: 'Paste the text into the message field' },
    leadStep3: { ru: 'Нажми «Отправить»', en: 'Press Send' },
    leadRecopy: { ru: 'Скопировать ещё раз', en: 'Copy again' },
    leadOpenTg: { ru: 'Открыть Telegram', en: 'Open Telegram' },
    leadPopup: { ru: 'Браузер заблокировал новую вкладку — открой Telegram кнопкой ниже',
                 en: 'The browser blocked the new tab — open Telegram with the button below' },
    sheetEmpty: { ru: 'Напиши хотя бы пару слов', en: 'Write at least a couple of words' },
    sheetSent: { ru: 'Текст скопирован — вставь его в Telegram', en: 'Text copied — paste it into Telegram' }
  };
  for (var _t in T2) { if (Object.prototype.hasOwnProperty.call(T2, _t)) T[_t] = T2[_t]; }

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
      if (name === 'workout') { scrollToId('workout'); return; }
      if (name === 'progress') { scrollToId('progress'); return; }
      if (name === 'checkin') { scrollToId('nutrition'); $('c-prev').focus(); return; }
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
    $('run-stage').addEventListener('change', function (e) {
      var field = e.target.closest('[data-run-field]');
      var item = S.workout[runState.ex];
      if (!field || !item) return;
      var value=String(field.value||'').slice(0,field.dataset.runField==='reps'?24:40); item[field.dataset.runField]=value;
      var log=ensureSetLog(item),set=log[Math.max(0,runState.set-1)]; if(set)set[field.dataset.runField]=value;
      saveWorkout(); renderWorkout(); saveRunSession();
    });
    $('run-stage').addEventListener('click', function (e) {
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
      S.diary = clean.sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 400);
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
    $('data-clear').addEventListener('click', clearAll);

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
    store.set(K.theme, S.theme);
    var dark = S.theme === 'obsidian';
    qs('#theme-toggle .ico-dark').hidden = !dark;
    qs('#theme-toggle .ico-light').hidden = dark;
    qsa('#theme-switch-m [data-theme]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.theme === S.theme));
    });
    var colors = { obsidian: '#08090B', soft: '#E8E1D5', ivory: '#F6F4F0' };
    var labels = {
      obsidian: { ru: 'Тёмная', en: 'Dark' },
      soft: { ru: 'Мягкая', en: 'Soft' },
      ivory: { ru: 'Светлая', en: 'Light' }
    };
    var meta = qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors[S.theme]);
    var next = themes[(themes.indexOf(S.theme) + 1) % themes.length];
    $('theme-toggle').setAttribute('aria-label', (S.lang === 'en' ? 'Switch to ' : 'Переключить на тему: ') + labels[next][S.lang]);
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

    [qs('#lang-switch'), qs('#lang-switch-m')].forEach(function (group) {
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

  function bindLibrary() {
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

    // Делегирование по всем группам фильтров
    qs('.filters-body').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter-kind]');
      if (!btn) return;
      var kind = btn.dataset.filterKind, value = btn.dataset.filterValue;
      if (kind === 'zone') toggleInArray(S.zones, value);
      else if (kind === 'muscle') toggleInArray(S.muscles, value);
      else if (kind === 'equip') toggleInArray(S.equipment, value);
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
      else if (kind === 'equip') toggleInArray(S.equipment, value);
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

    // Анимация только по наведению и только на устройствах с мышью
    if (FINE_POINTER.matches) {
      $('grid').addEventListener('pointerover', function (e) {
        if (REDUCED_MOTION.matches) return;
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
    }

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
      var lines = [exName(ex), labelZone(ex.zone) + ' · ' + labelMu(ex.target) + ' · ' + labelEq(ex.equip), ''];
      exSteps(ex).forEach(function (step, i) { lines.push((i + 1) + '. ' + step); });
      lines.push('', 'markovmade.com/gym');
      copyText(lines.join('\n'));
    });
  }

  function bindWorkout() {
    var list = $('workout-list');

    list.addEventListener('click', function (e) {
      if(e.target.closest('[data-resume-session]')){openRun();return;}
      var item = e.target.closest('.workout-item');
      var open = e.target.closest('[data-open]');
      if (open) { openExercise(open.dataset.open, open); return; }
      if (!item) return;
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

  function bindTools() {
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
      if (kind === 'equip') { S.equipment = [value]; }
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
    function show(){var opts=renderDiscovery(host,input.value);index=-1;input.removeAttribute('aria-activedescendant');input.setAttribute('aria-expanded',String(!!opts.length));}
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
  function renderProgramWizard(){
    var wiz=$('plan-wizard'); if(!wiz) return;
    var titles=wizardStepTitles(), count=titles.length, stepNav=qs('.wizard-steps',wiz);
    if(stepNav)stepNav.setAttribute('aria-label',S.lang==='en'?'Programme steps':'Шаги программы');
    qsa('.wizard-tab',wiz).forEach(function(b,i){b.innerHTML='<b>'+String(i+1).padStart(2,'0')+'</b>'+esc(titles[i]);b.setAttribute('aria-current',i===wizardState.step?'step':'false');});
    qsa('.wizard-pane',wiz).forEach(function(p,i){p.dataset.active=String(i===wizardState.step);p.hidden=i!==wizardState.step;});
    var bar=qs('.wizard-progress>i',wiz);if(bar)bar.style.width=((wizardState.step+1)/count*100)+'%';
    $('wizard-back').hidden=wizardState.step===0;$('wizard-next').hidden=wizardState.step===count-1;$('plan-build').hidden=wizardState.step!==count-1;
    $('wizard-back').textContent=S.lang==='en'?'Back':'Назад';$('wizard-next').textContent=S.lang==='en'?'Continue':'Продолжить';
    $('wizard-status').textContent=(wizardState.step+1)+' / '+count;
    var selected=function(id){var el=$(id);return el&&el.selectedOptions&&el.selectedOptions[0]?el.selectedOptions[0].textContent:'—';};
    $('wizard-summary').innerHTML='<div class="wizard-summary-item"><span>'+esc(S.lang==='en'?'Goal':'Цель')+'</span><b>'+esc(selected('p-goal'))+'</b></div><div class="wizard-summary-item"><span>'+esc(S.lang==='en'?'Schedule':'График')+'</span><b>'+esc(selected('p-days'))+' × '+esc(selected('p-time'))+'</b></div><div class="wizard-summary-item"><span>'+esc(S.lang==='en'?'Place':'Место')+'</span><b>'+esc(selected('p-place'))+'</b></div><div class="wizard-summary-item"><span>'+esc(S.lang==='en'?'Priority':'Приоритет')+'</span><b>'+esc(selected('p-focus'))+'</b></div>';
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
    var panes=qs('.wizard-panes',wiz),groups=[['p-goal'],['p-level'],['p-days','p-time'],['p-place','p-style'],['p-focus'],['p-recovery','p-cardio','p-steps','p-avoid']];
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

  function progressIntelligenceHtml(){
    if(!S.diary.length) return '';
    var latestWeight=S.diary.filter(function(d){return typeof d.weight==='number';})[0];
    var latestWaist=S.diary.filter(function(d){return typeof d.waist==='number';})[0];
    var d30=diaryDelta('weight',30), w30=diaryDelta('waist',30), sleep=diaryAvg('sleep',14), mood=diaryAvg('mood',14);
    var latestLift=S.diary.filter(function(d){return !!d.lift;})[0];
    var cutoff30=Date.now()-30*86400000,recentSessions=S.history.filter(function(h){var ts=Date.parse(h.date||'');return isFinite(ts)&&ts>=cutoff30;}),recentWorkSets=recentSessions.reduce(function(sum,h){return sum+totalCompletedHistorySets(h);},0);
    function delta(v,unit){ return v===null?t('progressNeedMore'):(v>0?'+':'')+v.toFixed(1)+' '+unit; }
    function metric(label,value,sub){ return '<div class="intel-metric"><span>'+esc(label)+'</span><b>'+esc(value||'—')+'</b><small>'+esc(sub||'')+'</small></div>'; }
    var action=diaryVerdict(diaryDelta('weight',14),w30);
    return '<div class="progress-intel"><div class="progress-intel-head"><div><h3>'+esc(t('progressIntel'))+'</h3><p>'+esc(t('progressIntelSub'))+'</p></div>'+signal(dashSignal().state,dashSignal().label)+'</div><div class="intel-metrics">'+
      metric(t('progressWeight'),latestWeight?latestWeight.weight.toFixed(1)+' '+t('kg'):'—',delta(d30,t('kg')))+
      metric(t('progressWaist'),latestWaist?latestWaist.waist.toFixed(1)+' '+t('cm'):'—',delta(w30,t('cm')))+
      metric(t('progressSleep'),sleep===null?'—':sleep.toFixed(1)+' '+t('hrs'),sleep===null?t('progressNeedMore'):'')+
      metric(t('progressMood'),mood===null?'—':mood.toFixed(1)+' / 5',mood===null?t('progressNeedMore'):'')+
      metric(t('progressStrength'),latestLift?latestLift.lift:'—',latestLift?latestLift.date:t('progressNeedMore'))+
      metric(t('progressSessions'),recentSessions.length?String(recentSessions.length):'—',recentSessions.length?'30 '+(S.lang==='en'?'days':'дней'):t('progressNeedMore'))+
      metric(t('progressWorkSets'),recentWorkSets?String(recentWorkSets):'—',recentSessions.length?'30 '+(S.lang==='en'?'days':'дней'):t('progressNeedMore'))+
      '</div><div class="intel-evidence">'+esc(t('progressEvidence',{diary:S.diary.length,sessions:recentSessions.length}))+'</div><div class="intel-action"><span class="intel-action-icon" aria-hidden="true">'+premiumIcon('progress')+'</span><div><b>'+esc(t('progressAction'))+'</b><p>'+esc(action)+'</p></div></div></div>';
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
    nav.innerHTML='<a href="#home" data-mobile-dest="home">'+premiumIcon('home')+'<span>'+esc(S.lang==='en'?'Today':'Сегодня')+'</span></a><a href="#library" data-mobile-dest="library">'+premiumIcon('search')+'<span>'+esc(S.lang==='en'?'Library':'Библиотека')+'</span></a><a href="#workout" data-mobile-dest="workout">'+premiumIcon('workout')+count+'<span>'+esc(S.lang==='en'?'Workout':'Тренировка')+'</span></a><a href="#progress" data-mobile-dest="progress">'+premiumIcon('progress')+'<span>'+esc(S.lang==='en'?'Progress':'Прогресс')+'</span></a><a href="#more" data-mobile-dest="more">'+premiumIcon('menu')+'<span>'+esc(S.lang==='en'?'More':'Ещё')+'</span></a>';
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
  renderProgress=function(){ _renderProgressV3(); var out=$('prog-out'); if(out&&S.diary.length&&!qs('.progress-intel',out)){ var box=document.createElement('div'); box.innerHTML=progressIntelligenceHtml(); if(box.firstElementChild) out.insertBefore(box.firstElementChild,out.firstChild); } };

  var _renderTimerV3=renderTimer;
  renderTimer=function(){ _renderTimerV3(); ensureMobileRestTimer(); var sticky=$('mobile-rest-timer'); if(sticky){ $('mobile-rest-clock').textContent=fmtClock(restTimer.left); sticky.dataset.open=String(MOBILE_MQ.matches&&(restTimer.running||restTimer.left>0)&&!runOpen()); sticky.classList.toggle('is-raised',!!($('mfb')&&$('mfb').getAttribute('data-open')==='true')); var toggle=qs('[data-mobile-rest="toggle"]',sticky); if(toggle){ toggle.textContent=restTimer.running?'Ⅱ':'▶'; toggle.setAttribute('aria-label',restTimer.running?t('timerPause'):t('timerResume')); } } $('timer-toggle').textContent=restTimer.running?t('timerPause'):(restTimer.left>0&&restTimer.left!==S.rest?t('timerResume'):t('timerStart')); if($('run-rest')) $('run-rest').textContent=restTimer.running?t('run.restLeft',{v:fmtClock(restTimer.left)}):t('run.rest'); };

  var _applyLangV3=applyLang;
  applyLang=function(initial){ _applyLangV3(initial); decorateConsoleIcons(); decorateUnitInputs(); qsa('#kbju-form [data-i18n^=\"ultimate.\"]').forEach(function(el){el.textContent=t(el.getAttribute('data-i18n'));}); if($('plan-wizard'))renderProgramWizard(); renderFilterResets(); if($('bodymap-hover'))$('bodymap-hover').dataset.open='false'; renderContinuityStrip(); ensureMobileAppNav(); };

  var _openExerciseV3=openExercise;
  openExercise=function(id,trigger){ saveRecentExercise(id); return _openExerciseV3(id,trigger); };

  function initProductionV3(){
    decorateConsoleIcons(); initDiscovery(); initFilterResets(); initProgramWizard(); initBodyMapTooltip(); initV3Units(); ensureMobileRestTimer();
    var nav=$('muscle-navigator'); if(nav){ nav.addEventListener('pointerdown',function(e){ var z=e.target.closest('[data-body-zone]'); if(!z)return; e.preventDefault(); var value=z.dataset.bodyZone; S.zones=[value];S.muscles=[];S.limit=PAGE;renderMuscleBoard();renderFilters();renderResults(); }); }
    window.setInterval(function(){ if(runOpen())renderRun(); },1000);
  }


  /* ========================================================================
     20. PRODUCTION V5 HARDENING
     Correctness -> data integrity -> usability -> accessibility -> performance.
     This layer deliberately preserves the proven V4 business logic and contracts.
     ======================================================================== */
  var APP_VERSION = '2026.08-v8';
  var BACKUP_SCHEMA = 4;
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
  DATA_KEYS=['fav','workout','lang','theme','density','profile','meta','history','diary','kbju','tips','coach','rest','recentSearch','recentExercises','runSession','plan','settings','schema','workoutSchema','historySchema'];
  var BACKUP_LABELS = {
    fav:{ru:'избранное',en:'favorites'},workout:{ru:'тренировка',en:'workout'},lang:{ru:'язык',en:'language'},theme:{ru:'тема',en:'theme'},density:{ru:'плотность сетки',en:'grid density'},profile:{ru:'профиль',en:'profile'},meta:{ru:'данные тренировки',en:'workout meta'},history:{ru:'история',en:'history'},diary:{ru:'дневник прогресса',en:'progress diary'},kbju:{ru:'питание',en:'nutrition'},tips:{ru:'сохранённые материалы',en:'saved knowledge'},coach:{ru:'режим тренера',en:'coach mode'},rest:{ru:'настройка отдыха',en:'rest timer preset'},recentSearch:{ru:'недавние поиски',en:'recent searches'},recentExercises:{ru:'недавние упражнения',en:'recent exercises'},runSession:{ru:'активная сессия',en:'active session'},plan:{ru:'активная программа',en:'active programme'},settings:{ru:'настройки логирования',en:'logging settings'},schema:{ru:'схема данных',en:'schema'},workoutSchema:{ru:'схема тренировки',en:'workout schema'},historySchema:{ru:'схема истории',en:'history schema'}
  };
  function backupLabel(name){var pair=BACKUP_LABELS[name];return pair?(S.lang==='en'?pair.en:pair.ru):name;}
  function jsonValue(raw){ try{return JSON.parse(raw);}catch(e){return null;} }
  function validateBackupValue(name, raw){
    if (typeof raw !== 'string' || raw.length > 5000000) return null;
    if (name==='lang') return (raw==='ru'||raw==='en') ? raw : null;
    if (name==='theme') return ['obsidian','soft','ivory'].indexOf(raw)!==-1 ? raw : null;
    if (name==='density') return ['compact','default','roomy'].indexOf(raw)!==-1 ? raw : null;
    if (name==='coach') return (raw==='0'||raw==='1') ? raw : null;
    if (name==='rest') return [60,90,120,180].indexOf(Number(raw))!==-1 ? String(Number(raw)) : null;
    if (name==='schema'||name==='workoutSchema'||name==='historySchema') return /^\d{1,3}$/.test(raw) ? raw : null;
    var value=jsonValue(raw);
    if (value===null) return null;
    if (name==='fav') return JSON.stringify(Array.isArray(value)?value.map(String).filter(function(id){return !!BY_ID[id];}).slice(0,EX.length):[]);
    if (name==='workout') return JSON.stringify(Array.isArray(value)?value.filter(function(x){return x&&BY_ID[String(x.id)];}).map(normalizeWorkoutRecord).slice(0,80):[]);
    if (name==='profile') {
      if (!value||typeof value!=='object'||Array.isArray(value)) return null;
      return JSON.stringify({goal:String(value.goal||'').slice(0,40),level:String(value.level||'').slice(0,40),place:String(value.place||'').slice(0,40),days:String(value.days||'').slice(0,8),typicalSessionMinutes:String(value.typicalSessionMinutes||'').slice(0,8),equipmentAvailability:Array.isArray(value.equipmentAvailability)?value.equipmentAvailability.map(String).slice(0,32):[],focus:String(value.focus||'balanced').slice(0,40),limitations:Array.isArray(value.limitations)?value.limitations.map(String).slice(0,16):[],recoveryBaseline:String(value.recoveryBaseline||'mid').slice(0,20),done:!!value.done,skipped:!!value.skipped});
    }
    if (name==='meta') {
      if (!value||typeof value!=='object'||Array.isArray(value)) return null;
      return JSON.stringify({name:String(value.name||'').slice(0,80),date:String(value.date||'').slice(0,10),note:String(value.note||'').slice(0,600),planDay:Number.isInteger(Number(value.planDay))?Number(value.planDay):null});
    }
    if (name==='history') return JSON.stringify(Array.isArray(value)?value.filter(function(x){return x&&Array.isArray(x.items);}).slice(0,20):[]);
    if (name==='diary') return JSON.stringify(Array.isArray(value)?value.filter(function(x){return x&&typeof x.date==='string';}).slice(0,400):[]);
    if (name==='tips') return JSON.stringify(Array.isArray(value)?value.map(String).slice(0,200):[]);
    if (name==='recentSearch') return JSON.stringify(Array.isArray(value)?value.map(String).filter(Boolean).slice(0,8):[]);
    if (name==='recentExercises') return JSON.stringify(Array.isArray(value)?value.map(String).filter(function(id){return !!BY_ID[id];}).slice(0,8):[]);
    if (name==='runSession') {
      if (!value||typeof value!=='object'||Date.now()-Number(value.startedAt||0)>8*3600000) return JSON.stringify(null);
      return JSON.stringify(value);
    }
    if(name==='kbju')return(value&&typeof value==='object'&&!Array.isArray(value))?JSON.stringify(value):null;
    if(name==='plan'){var restored=restorePlanV7(value);return restored?JSON.stringify(serialisePlanV7(restored)):JSON.stringify(null);}
    if(name==='settings')return(value&&typeof value==='object'&&!Array.isArray(value))?JSON.stringify({rir:!!value.rir,rpe:!!value.rpe}):null;
    return null;
  }
  exportAll = function(){
    var payload={v:BACKUP_SCHEMA,kind:'mmg-backup',app:'MARKOV MADE GYM',appVersion:APP_VERSION,exportedAt:new Date().toISOString(),data:{}};
    DATA_KEYS.forEach(function(name){var raw=store.get(K[name]);if(raw!=null)payload.data[name]=raw;});
    return JSON.stringify(payload,null,2);
  };
  function analyzeBackup(raw){
    var parsed;
    try{parsed=JSON.parse(raw);}catch(e){return{ok:false,code:'json'};}
    if(!parsed||parsed.kind!=='mmg-backup'||!parsed.data||typeof parsed.data!=='object'||Array.isArray(parsed.data))return{ok:false,code:'shape'};
    if(Number(parsed.v||0)>BACKUP_SCHEMA)return{ok:false,code:'future'};
    var staged={},changed=[],invalid=[];
    DATA_KEYS.forEach(function(name){
      if(!Object.prototype.hasOwnProperty.call(parsed.data,name))return;
      var clean=validateBackupValue(name,parsed.data[name]);
      if(clean===null){invalid.push(name);return;}
      staged[name]=clean;
      if(store.get(K[name])!==clean)changed.push(name);
    });
    if(!Object.keys(staged).length)return{ok:false,code:'empty'};
    if(invalid.length)return{ok:false,code:'invalid',invalid:invalid};
    return{ok:true,staged:staged,changed:changed,sourceVersion:String(parsed.appVersion||parsed.v||'legacy')};
  }
  function backupPreviewText(report){
    var list=report.changed.slice(0,10).map(function(n){return '• '+backupLabel(n);}).join('\n');
    var more=Math.max(0,report.changed.length-10);
    if(S.lang==='en')return 'Backup validated. Changes: '+report.changed.length+'\n\n'+(list||'No values differ.')+(more?'\n• +'+more+' more':'')+'\n\nA rollback snapshot will be kept on this device. Import now?';
    return 'Резервная копия проверена. Изменений: '+report.changed.length+'\n\n'+(list||'Значения не отличаются.')+(more?'\n• ещё '+more:'')+'\n\nПеред импортом сохранится локальная точка отката. Импортировать?';
  }
  importAll = function(raw){
    var report=analyzeBackup(raw);
    if(!report.ok){
      var msg=report.code==='json'?t('ioBadJson'):report.code==='future'?(S.lang==='en'?'This backup was created by a newer app version.':'Эта копия создана более новой версией приложения.'):(S.lang==='en'?'Backup validation failed. Current data was not changed.':'Проверка резервной копии не пройдена. Текущие данные не изменены.');
      showToast(msg); return false;
    }
    if(!report.changed.length){showToast(S.lang==='en'?'Backup is valid; nothing to change.':'Копия корректна; изменений нет.');return true;}
    if(!window.confirm(backupPreviewText(report)))return false;
    var rollback=exportAll(); store.set(K.rollbackBackup,rollback);
    var failed=[];
    Object.keys(report.staged).forEach(function(name){if(store.set(K[name],report.staged[name])===false)failed.push(name);});
    if(failed.length){
      var rb=analyzeBackup(rollback); if(rb.ok)Object.keys(rb.staged).forEach(function(name){store.set(K[name],rb.staged[name]);});
      showToast(S.lang==='en'?'Import could not be written safely; previous data was restored.':'Не удалось безопасно записать импорт; предыдущие данные восстановлены.');
      return false;
    }
    showToast(t('ioRestored',{n:Object.keys(report.staged).length}));
    window.setTimeout(function(){window.location.reload();},650); return true;
  };
  clearAll = function(){
    if(!window.confirm(t('dataConfirm')))return;
    DATA_KEYS.forEach(function(name){if(K[name])store.remove(K[name]);});
    [K.restTimer,K.lastBackup,K.rollbackBackup,K.legacyFav,K.legacyWorkout,K.legacyLang,K.legacyTheme].forEach(function(key){if(key)store.remove(key);});
    Object.keys(memoryStore).filter(function(key){return key.indexOf('mmg.recovery.')===0;}).forEach(function(key){store.remove(key);});
    if(storageOk){try{for(var i=window.localStorage.length-1;i>=0;i--){var key=window.localStorage.key(i);if(key&&key.indexOf('mmg.recovery.')===0)window.localStorage.removeItem(key);}}catch(e){}}
    showToast(t('dataCleared')); window.setTimeout(function(){window.location.reload();},550);
  };

  function downloadBackup(){
    var text=exportAll(), blob=new Blob([text],{type:'application/json;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='markov-made-gym-backup-'+todayISO()+'.json'; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(function(){URL.revokeObjectURL(url);},1200); store.set(K.lastBackup,String(Date.now())); renderDataStatus();
    showToast(S.lang==='en'?'Backup downloaded.':'Резервная копия скачана.'); track('data_exported',{format:'json'});
  }
  function ensureImportFileInput(){
    var input=$('data-import-file'); if(input)return input;
    input=document.createElement('input'); input.type='file'; input.id='data-import-file'; input.accept='.json,application/json'; input.hidden=true; document.body.appendChild(input);
    input.addEventListener('change',function(){
      var file=input.files&&input.files[0]; if(!file)return;
      if(file.size>5000000){showToast(S.lang==='en'?'Backup is too large.':'Файл резервной копии слишком большой.');input.value='';return;}
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
    window.mmgDiagnostics={version:APP_VERSION,storagePersistent:storageOk,get storageWarnings(){return storageWarnings.slice();},exerciseCount:EX.length,backupSchema:BACKUP_SCHEMA};
  }



  /* ========================================================================
     21. FLAGSHIP PRODUCT OS V8
     V7 state contracts retained; V8 owns the canonical presentation and shell.
     No network. No fake AI. Existing storage contracts remain readable.
     ======================================================================== */
  var V7_ROUTES={home:['home'],library:['library'],workout:['workout'],progress:['progress'],more:['more'],tools:['tools'],program:['program'],nutrition:['nutrition'],knowledge:['knowledge'],method:['method'],about:['about'],how:['how'],faq:['faq'],contact:['contact'],settings:['settings']};
  var V7_ROUTE_IDS=Object.keys(V7_ROUTES).reduce(function(a,k){a[k]=1;return a;},{});
  var v7ProgramStartTracked=false;
  var V7_COPY={
    ru:{home:'Сегодня',library:'Библиотека',workout:'Тренировка',progress:'Прогресс',more:'Ещё',program:'Программа',nutrition:'Питание',knowledge:'База знаний',method:'Метод',settings:'Настройки',about:'Павел Марков',moreTitle:'Разделы системы',homeSub:'Следующее действие, текущий план и обратная связь — без лишней навигации.',moreSub:'Программа, питание, знания и настройки — вторичный уровень, когда он действительно нужен.',settingsSub:'Интерфейс, расширенное логирование и контроль данных.',next:'Следующее действие',continueRun:'Продолжить тренировку',continueRunWhy:'Активная сессия сохранена на этом устройстве.',startReady:'Начать подготовленную тренировку',startReadyWhy:'Упражнения уже собраны — можно переходить в Run Mode.',startPlan:'Начать следующий день программы',startPlanWhy:'План уже готов. Следующий день можно перенести в тренировку одним действием.',finishProfile:'Завершить настройку',finishProfileWhy:'Цель и условия нужны, чтобы программа и рекомендации использовали один контекст.',checkin:'Сделать недельный check-in',checkinWhy:'Свежая обратная связь важнее ещё одного нового инструмента.',buildPlan:'Собрать программу',buildPlanWhy:'Программа свяжет библиотеку с сегодняшней тренировкой и следующими днями.',discover:'Найти первое упражнение',discoverWhy:'Начни с целевой мышцы и доступного оборудования.',open:'Открыть',plan:'План',last:'Последняя сессия',trend:'Динамика',kcal:'Питание',noPlan:'Нет активной программы',noHistory:'Пока нет завершённых тренировок',noTrend:'Недостаточно данных',notCalculated:'Не рассчитано',completed:'выполнено',days:'дней',sets:'подходов',quickLibrary:'Найти упражнение',quickLibraryS:'По мышце или оборудованию',quickWorkout:'Моя тренировка',quickWorkoutS:'Собрать или продолжить',quickProgram:'Программа',quickProgramS:'Следующий тренировочный день',quickProgress:'Check-in',quickProgressS:'Вес, талия и восстановление',appearance:'Оформление',logging:'Логирование',coach:'Рекомендации',data:'Мои данные',rir:'Показывать RIR',rpe:'Показывать RPE',coachOn:'Контекстные подсказки',export:'Скачать резервную копию',import:'Импортировать',clear:'Удалить все данные',advanced:'Расширенный check-in',recovery:'Восстановление',recoveryLow:'Низкое',recoveryMid:'Нормальное',recoveryHigh:'Хорошее',utilities:'Дополнительно',whyProgress:'Почему',tryWeight:'Можно попробовать',evidenceTwo:'2 тренировки подряд — верх диапазона во всех завершённых подходах.',programmeDay:'День программы',startDay:'Начать день',settingsDataText:'Данные остаются в браузере. Экспорт создаёт резервную копию перед переносом или очисткой устройства.',confidenceLow:'Мало данных',confidenceMedium:'Средняя уверенность',confidenceEnough:'Данных достаточно',exerciseHistory:'Прошлый результат',nutritionFeedback:'Связь с динамикой',nutritionKeep:'Не меняй калории автоматически: сначала проверь соблюдение и накопи устойчивый тренд.',weekComplete:'Неделя выполнена — сверить прогресс',weekCompleteWhy:'Все дни программы на этой неделе завершены. Следующий полезный шаг — короткая обратная связь, а не ещё одна тренировка.'},
    en:{home:'Today',library:'Library',workout:'Workout',progress:'Progress',more:'More',program:'Programme',nutrition:'Nutrition',knowledge:'Knowledge',method:'Method',settings:'Settings',about:'Pavel Markov',moreTitle:'System sections',homeSub:'Next action, active plan and feedback — without unnecessary navigation.',moreSub:'Programme, nutrition, knowledge and settings — the secondary layer when you need it.',settingsSub:'Interface, advanced logging and local data controls.',next:'Next action',continueRun:'Resume workout',continueRunWhy:'The active session is preserved on this device.',startReady:'Start prepared workout',startReadyWhy:'The exercises are ready — continue directly into Run Mode.',startPlan:'Start the next programme day',startPlanWhy:'The plan is ready. Move the next day into today’s workout with one action.',finishProfile:'Finish setup',finishProfileWhy:'Goal and context let the programme and recommendations share one source of truth.',checkin:'Do a weekly check-in',checkinWhy:'Fresh feedback is more useful than another new tool.',buildPlan:'Build a programme',buildPlanWhy:'A programme connects the library to today’s workout and the next sessions.',discover:'Find the first exercise',discoverWhy:'Start with the target muscle and equipment you actually have.',open:'Open',plan:'Plan',last:'Last session',trend:'Trend',kcal:'Nutrition',noPlan:'No active programme',noHistory:'No completed sessions yet',noTrend:'Not enough data',notCalculated:'Not calculated',completed:'completed',days:'days',sets:'sets',quickLibrary:'Find exercise',quickLibraryS:'By muscle or equipment',quickWorkout:'My workout',quickWorkoutS:'Build or resume',quickProgram:'Programme',quickProgramS:'Next training day',quickProgress:'Check-in',quickProgressS:'Weight, waist and recovery',appearance:'Appearance',logging:'Logging',coach:'Recommendations',data:'My data',rir:'Show RIR',rpe:'Show RPE',coachOn:'Contextual guidance',export:'Download backup',import:'Import',clear:'Delete all data',advanced:'Advanced check-in',recovery:'Recovery',recoveryLow:'Low',recoveryMid:'Normal',recoveryHigh:'Good',utilities:'More options',whyProgress:'Why',tryWeight:'You can try',evidenceTwo:'2 sessions in a row — top of the rep range in every completed set.',programmeDay:'Programme day',startDay:'Start day',settingsDataText:'Data stays in this browser. Export a backup before moving or clearing the device.',confidenceLow:'Low confidence',confidenceMedium:'Medium confidence',confidenceEnough:'Enough data',exerciseHistory:'Previous performance',nutritionFeedback:'Trend context',nutritionKeep:'Do not change calories automatically: verify adherence and collect a stable trend first.',weekComplete:'Week complete — review progress',weekCompleteWhy:'Every programme day for this week is complete. The next useful action is feedback, not another session.'}
  };
  V7_COPY.ru.tools='Инструменты';
  V7_COPY.en.tools='Gym tools';
  function v7c(key){var pack=V7_COPY[S.lang==='en'?'en':'ru'];return pack[key]||key;}
  function v7RouteFromHash(){var h=(location.hash||'#home').slice(1).split('?')[0];if(h==='top'||!h)return'home';return V7_ROUTE_IDS[h]?h:'home';}
  function v7Returning(){return !!(profileComplete()||S.workout.length||S.history.length||S.diary.length||S.plan||S.kbjuLast||S.favorites.length);}
  function v7CurrentWeekKey(){var d=new Date(),day=(d.getDay()+6)%7;d.setHours(12,0,0,0);d.setDate(d.getDate()-day);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function v7EnsurePlanWeek(){if(!S.plan)return;var wk=v7CurrentWeekKey();if(S.plan.weekKey&&S.plan.weekKey!==wk){S.plan.weekKey=wk;S.plan.completedDays=[];savePlanV7();}else if(!S.plan.weekKey)S.plan.weekKey=wk;}
  function v7NextPlanDay(){if(!S.plan||!Array.isArray(S.plan.days)||!S.plan.days.length)return -1;v7EnsurePlanWeek();var done=Array.isArray(S.plan.completedDays)?S.plan.completedDays:[];for(var i=0;i<S.plan.days.length;i++)if(done.indexOf(i)===-1)return i;return -1;}
  function v7NextAction(){
    var total=S.workout.reduce(function(a,w){return a+(Number(w.sets)||0);},0),done=S.workout.reduce(function(a,w){return a+completedSetCount(w);},0);
    var active=S.runSession&&Date.now()-Number(S.runSession.startedAt||0)<8*3600000&&done<total;
    if(active)return{type:'resume',title:v7c('continueRun'),why:v7c('continueRunWhy'),evidence:[done+' / '+total+' '+v7c('sets')]};
    if(S.workout.length&&done<total)return{type:'run',title:v7c('startReady'),why:v7c('startReadyWhy'),evidence:[S.workout.length+' '+(S.lang==='en'?'exercises':'упражнений'),total+' '+v7c('sets')]};
    var pday=v7NextPlanDay();if(S.plan&&pday>=0)return{type:'planDay',day:pday,title:v7c('startPlan'),why:v7c('startPlanWhy'),evidence:[v7c('programmeDay')+' '+(pday+1)+' / '+S.plan.days.length]};
    if(S.plan&&S.plan.days&&S.plan.completedDays&&S.plan.completedDays.length>=S.plan.days.length)return{type:'progress',title:v7c('weekComplete'),why:v7c('weekCompleteWhy'),evidence:[S.plan.completedDays.length+' / '+S.plan.days.length]};
    if(!profileComplete())return{type:'profile',title:v7c('finishProfile'),why:v7c('finishProfileWhy'),evidence:[]};
    var last=S.diary[0],age=last&&last.date?Math.floor((Date.now()-Date.parse(last.date+'T12:00:00'))/86400000):999;
    if(S.history.length&&age>7)return{type:'checkin',title:v7c('checkin'),why:v7c('checkinWhy'),evidence:[age+' '+v7c('days')]};
    if(!S.plan)return{type:'program',title:v7c('buildPlan'),why:v7c('buildPlanWhy'),evidence:[]};
    return{type:'library',title:v7c('discover'),why:v7c('discoverWhy'),evidence:[]};
  }
  function v7DateLabel(){try{return new Intl.DateTimeFormat(S.lang==='en'?'en-GB':'ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(new Date());}catch(e){return todayISO();}}
  function v7PlanSummary(){if(!S.plan||!S.plan.days)return{v:'—',s:v7c('noPlan')};var done=(S.plan.completedDays||[]).length;return{v:done+' / '+S.plan.days.length,s:(S.lang==='en'?'sessions ':'тренировок ')+v7c('completed')};}
  function v7TrendSummary(){if(S.diary.length<2)return{v:'—',s:v7c('noTrend')};var d=diaryDelta('weight',14);if(d===null)return{v:'—',s:v7c('noTrend')};return{v:(d>0?'+':'')+d.toFixed(1)+' '+t('kg'),s:S.lang==='en'?'14-day weight change':'изменение веса за 14 дней'};}
  function renderV7Home(){var host=$('home');if(!host)return;$('v7-home-kicker').textContent=v7c('home');$('v7-home-sub').textContent=v7c('homeSub');$('v7-home-date').textContent=v7DateLabel();var next=v7NextAction(),title=next.title,why=next.why;var ev=(next.evidence||[]).map(function(x){return'<span class="v7-evidence">'+esc(x)+'</span>';}).join('');var secondary=next.type==='planDay'?'<button class="btn btn-quiet" type="button" data-v7-route="program">'+esc(v7c('program'))+'</button>':'';$('v7-home-next').innerHTML='<span class="v7-next-label">'+esc(v7c('next'))+'</span><h2 class="v7-next-title">'+esc(title)+'</h2><p class="v7-next-copy">'+esc(why)+'</p>'+(ev?'<div class="v7-next-evidence">'+ev+'</div>':'')+'<div class="v7-next-actions"><button class="btn btn-primary" type="button" data-v7-action="'+esc(next.type)+'"'+(next.day!=null?' data-v7-day="'+next.day+'"':'')+'>'+esc(title)+'</button>'+secondary+'</div>';
    var plan=v7PlanSummary(),last=S.history[0],trend=v7TrendSummary();$('v7-home-plan').innerHTML='<span>'+esc(v7c('plan'))+'</span><b>'+(S.plan?esc(S.lang==='en'?'Active programme':'Активная программа'):esc(v7c('noPlan')))+'</b><strong>'+esc(plan.v)+'</strong><small>'+esc(plan.s)+'</small>';$('v7-home-last').innerHTML='<span>'+esc(v7c('last'))+'</span><b>'+esc(last?last.name:v7c('noHistory'))+'</b><strong>'+esc(last?String(last.items.length):'—')+'</strong><small>'+esc(last?(last.date+' · '+totalCompletedHistorySets(last)+' '+v7c('sets')):v7c('noHistory'))+'</small>';$('v7-home-progress').innerHTML='<span>'+esc(v7c('trend'))+'</span><b>'+esc(S.diary.length?(S.lang==='en'?'Feedback is current':'Обратная связь сохранена'):v7c('noTrend'))+'</b><strong>'+esc(trend.v)+'</strong><small>'+esc(trend.s)+'</small>';$('v7-home-nutrition').innerHTML='<span>'+esc(v7c('kcal'))+'</span><b>'+esc(S.kbjuLast?(S.lang==='en'?'Current target':'Текущий ориентир'):v7c('notCalculated'))+'</b><strong>'+esc(S.kbjuLast?String(S.kbjuLast.target):'—')+'</strong><small>'+esc(S.kbjuLast?t('kcal'):v7c('notCalculated'))+'</small>';
    var cmds=[['library','search','quickLibrary','quickLibraryS'],['workout','workout','quickWorkout','quickWorkoutS'],['program','program','quickProgram','quickProgramS'],['progress','progress','quickProgress','quickProgressS']];$('v7-home-quick').innerHTML=cmds.map(function(c){return'<button class="v7-command" type="button" data-v7-route="'+c[0]+'"><i aria-hidden="true">'+premiumIcon(c[1])+'</i><span><b>'+esc(v7c(c[2]))+'</b><small>'+esc(v7c(c[3]))+'</small></span></button>';}).join('');
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
  function renderV7Settings(){if(!$('settings'))return;$('v7-settings-sub').textContent=v7c('settingsSub');$('v7-theme-title').textContent=v7c('appearance');$('v7-log-title').textContent=v7c('logging');$('v7-coach-title').textContent=v7c('coach');$('v7-data-title').textContent=v7c('data');$('v7-log-text').textContent=S.lang==='en'?'RIR/RPE stay hidden unless you explicitly enable them.':'RIR/RPE скрыты, пока вы явно их не включите.';$('v7-coach-text').textContent=S.lang==='en'?'Show contextual explanations and guidance.':'Показывать контекстные объяснения и рекомендации.';$('v7-data-text').textContent=v7c('settingsDataText');var themes=[['obsidian',S.lang==='en'?'Dark':'Тёмная'],['soft',S.lang==='en'?'Soft':'Мягкая'],['ivory',S.lang==='en'?'Light':'Светлая']];$('v7-theme-actions').innerHTML=themes.map(function(x){return'<button class="btn '+(S.theme===x[0]?'btn-primary':'btn-solid')+' btn-sm" type="button" data-v7-theme="'+x[0]+'">'+esc(x[1])+'</button>';}).join('');$('v7-logging-actions').innerHTML='<button class="v7-setting-toggle" type="button" data-v7-setting="rir" aria-pressed="'+String(!!S.settings.rir)+'"><span>'+esc(v7c('rir'))+'</span><b>'+(S.settings.rir?'ON':'OFF')+'</b></button><button class="v7-setting-toggle" type="button" data-v7-setting="rpe" aria-pressed="'+String(!!S.settings.rpe)+'"><span>'+esc(v7c('rpe'))+'</span><b>'+(S.settings.rpe?'ON':'OFF')+'</b></button>';$('v7-coach-actions').innerHTML='<button class="v7-setting-toggle" type="button" data-v7-coach aria-pressed="'+String(!!S.coachOn)+'"><span>'+esc(v7c('coachOn'))+'</span><b>'+(S.coachOn?'ON':'OFF')+'</b></button>';$('v7-data-actions').innerHTML='<button class="btn btn-solid btn-sm" type="button" data-v7-data="export">'+esc(v7c('export'))+'</button><button class="btn btn-solid btn-sm" type="button" data-v7-data="import">'+esc(v7c('import'))+'</button><button class="btn btn-quiet btn-sm btn-danger" type="button" data-v7-data="clear">'+esc(v7c('clear'))+'</button>';
  }
  function renderV7Nav(){qsa('[data-v7-nav]').forEach(function(el){el.textContent=v7c(el.dataset.v7Nav);});var moreSub={program:S.lang==='en'?'Weekly structure and the next workout':'Структура недели и следующая тренировка',nutrition:S.lang==='en'?'Calories, macros and feedback':'Калории, макросы и обратная связь',knowledge:S.lang==='en'?'Practical contextual guides':'Практические разборы по контексту',method:S.lang==='en'?'Decision framework':'Логика принятия решений',settings:S.lang==='en'?'Interface, logging and data':'Интерфейс, логирование и данные',about:S.lang==='en'?'Author and system boundaries':'Автор и границы системы'};qsa('[data-v7-more]').forEach(function(el){el.textContent=v7c(el.dataset.v7More);});qsa('[data-v7-more-sub]').forEach(function(el){el.textContent=moreSub[el.dataset.v7MoreSub]||'';});var mt=qs('[data-v7-mobile-title]');if(mt)mt.textContent=v7c('moreTitle');}
  function v7FocusRoute(route){var el=$(route==='home'&&!v7Returning()? 'hero-title' : route==='home'?'v7-home-title': route==='more'?'v7-more-title':route==='settings'?'v7-settings-title':route+'-title');if(el){el.setAttribute('tabindex','-1');requestAnimationFrame(function(){try{el.focus({preventScroll:true});}catch(e){}var anchor=el.closest('section')||el;anchor.scrollIntoView({block:'start',behavior:'auto'});});}else window.scrollTo(0,0);}
  function applyV7Route(focus){var route=v7RouteFromHash();document.body.dataset.v7Route=route;var ids=['home','system','start','method','muscles','library','workout','nutrition','program','progress','knowledge','about','how','faq','contact','more','settings'];ids.forEach(function(id){var el=$(id);if(el)el.hidden=true;});var hero=qs('.hero');if(hero)hero.hidden=true;var returning=v7Returning();if(route==='home'){if(returning){$('home').hidden=false;renderV7Home();}else{if(hero)hero.hidden=false;$('start').hidden=false;}}else{(V7_ROUTES[route]||[]).forEach(function(id){var el=$(id);if(el)el.hidden=false;});}if(route==='program'){if(!v7ProgramStartTracked){track('program_start',{});v7ProgramStartTracked=true;}var pf=$('plan-form');if(pf&&!pf.dataset.v7Prefilled){prefillPlan();pf.dataset.v7Prefilled='true';renderProgramWizard();}}var footer=qs('.footer');if(footer)footer.hidden=!(['more','settings','about','method','knowledge','how','faq','contact'].indexOf(route)!==-1);qsa('.v7-primary-nav>.v7-nav-link').forEach(function(a){var on=a.getAttribute('href')==='#'+route;a.toggleAttribute('aria-current',on);if(on)a.setAttribute('aria-current','page');});var nav=$('mobile-app-nav');if(nav)qsa('[data-mobile-dest]',nav).forEach(function(a){var on=a.dataset.mobileDest===route;a.classList.toggle('is-active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});syncV7Floating();renderV8Shell(route,!!focus);if(focus)v7FocusRoute(route);}
  function navigateV7(route,focus){route=V7_ROUTE_IDS[route]?route:'home';if(location.hash!=='#'+route)location.hash=route;else{applyV7Route(focus!==false);}}
  function syncV7Floating(){var route=v7RouteFromHash(),bar=$('mfb');if(bar){var show=MOBILE_MQ.matches&&route==='library';bar.setAttribute('data-open',String(show));}var sticky=$('mobile-rest-timer');if(sticky)sticky.classList.toggle('is-raised',!!(bar&&bar.getAttribute('data-open')==='true'));}
  function startPlanDayV7(dayIndex,startRun){if(!S.plan||!S.plan.days)return;v7EnsurePlanWeek();var day=S.plan.days[dayIndex];if(!day)return;S.workout=day.items.map(function(it){return normalizeWorkoutRecord({id:it.ex.id,sets:it.sets,reps:it.reps,weight:'',done:false,setLog:[]});});S.meta.name=(S.lang==='en'?'Day ':'День ')+(dayIndex+1)+' · '+(DAY_NAMES[day.key]?(DAY_NAMES[day.key][S.lang]||DAY_NAMES[day.key].ru):day.key);S.meta.date=todayISO();S.meta.note='';S.meta.planDay=dayIndex;saveWorkout();saveMeta();renderWorkout();renderResults();track('program_day_start',{day:dayIndex+1});navigateV7('workout',true);showToast(t('planDayAdded',{n:dayIndex+1}));if(startRun)setTimeout(openRun,80);}
  function parseRepUpperV7(value){var nums=String(value||'').match(/\d+(?:[.,]\d+)?/g);if(!nums||!nums.length)return null;return Math.max.apply(null,nums.map(function(x){return Number(x.replace(',','.'));}).filter(isFinite));}
  function progressionAdviceV7(id,item){var upper=parseRepUpperV7(item&&item.reps);if(!upper)return null;var rows=[];for(var i=0;i<S.history.length&&rows.length<2;i++){var hit=(S.history[i].items||[]).filter(function(x){return x.id===id;})[0];if(!hit||!Array.isArray(hit.setLog))continue;var complete=hit.setLog.filter(function(x){return x&&x.completed;});if(!complete.length||complete.length<(Number(hit.sets)||complete.length))continue;var ok=complete.every(function(x){return Number(String(x.reps||'').replace(',','.'))>=upper&&isFinite(Number(String(x.weight||'').replace(',','.')))&&Number(String(x.weight||'').replace(',','.'))>0;});if(ok)rows.push(complete);}if(rows.length<2)return null;var latest=rows[0],base=Math.max.apply(null,latest.map(function(x){return Number(String(x.weight).replace(',','.'));}));if(!isFinite(base)||base<=0)return null;var ex=BY_ID[id],lower=ex&&['upper legs','lower legs'].indexOf(ex.zone)!==-1,compound=ex&&exKind(ex)==='compound';var inc=lower?2.5:(compound?2:1);return{weight:Math.round((base+inc)*10)/10,inc:inc};}
  function addProgressionAdviceV7(){qsa('#workout-list .workout-item').forEach(function(row){var item=S.workout.filter(function(w){return w.id===row.dataset.id;})[0],main=qs('.workout-main',row);if(!item||!main||qs('.workout-progression',main))return;var adv=progressionAdviceV7(item.id,item);if(!adv)return;var box=document.createElement('div');box.className='workout-progression';box.innerHTML='<span aria-hidden="true">↗</span><span><b>'+esc(v7c('tryWeight'))+' '+adv.weight+' '+esc(t('kg'))+'</b><small>'+esc(v7c('evidenceTwo'))+'</small></span>';var prev=qs('.workout-previous',main);if(prev)prev.insertAdjacentElement('afterend',box);else main.appendChild(box);});}
  function initV7WorkoutUtilities(){var side=qs('.workout-side');if(!side||$('v7-session-tools'))return;var details=document.createElement('details');details.id='v7-session-tools';details.className='v7-session-tools';details.innerHTML='<summary>'+esc(v7c('utilities'))+'</summary><div class="v7-session-tools-body"></div>';var body=qs('.v7-session-tools-body',details);['w-copy','w-share','w-print','w-clear'].forEach(function(id){var el=$(id);if(el)body.appendChild(el);});['w-name','w-date','w-note'].forEach(function(fid){var field=$(fid);if(field&&field.closest('.field'))body.appendChild(field.closest('.field'));});var io=$('w-io');if(io){var d=io.closest('details');if(d)body.appendChild(d);}side.appendChild(details);}
  function initV7ProgressQuick(){var grid=qs('.progress-form-grid');if(!grid||$('g-recovery-v7'))return;var waist=$('g-waist'),field=document.createElement('div');field.className='field';field.innerHTML='<label for="g-recovery-v7">'+esc(v7c('recovery'))+'</label><select class="select" id="g-recovery-v7"><option value="1">'+esc(v7c('recoveryLow'))+'</option><option value="2" selected>'+esc(v7c('recoveryMid'))+'</option><option value="3">'+esc(v7c('recoveryHigh'))+'</option></select>';if(waist&&waist.closest('.field'))waist.closest('.field').insertAdjacentElement('afterend',field);var labels=qsa('.form-section-label',grid);if(labels.length<2)return;var adv=document.createElement('details');adv.className='v7-advanced-checkin';adv.innerHTML='<summary>'+esc(v7c('advanced'))+'</summary><div class="v7-advanced-checkin-grid"></div>';var advGrid=qs('.v7-advanced-checkin-grid',adv);var move=['g-sleep','g-mood','g-hunger','g-fatigue','g-lift','g-note'];labels.slice(1).forEach(function(l){if(l.parentNode)advGrid.appendChild(l);});move.forEach(function(id){var el=$(id);if(el&&el.closest('.field'))advGrid.appendChild(el.closest('.field'));});grid.appendChild(adv);var save=$('prog-save');if(save)save.textContent=S.lang==='en'?'Save check-in':'Сохранить check-in';}
  function renderV7RunAdvanced(){var stage=$('run-stage');if(!stage||!S.settings)return;var inputs=qs('.run-current-inputs',stage);if(!inputs)return;var item=S.workout[runState.ex],set=item?ensureSetLog(item)[Math.max(0,runState.set-1)]:null;if(!set)return;if(S.settings.rir&&!qs('[data-run-field="rir"]',inputs)){var l=document.createElement('label');l.textContent='RIR';l.innerHTML+=' <input type="number" inputmode="numeric" min="0" max="10" step="1" data-run-field="rir" value="'+esc(set.rir||'')+'">';inputs.appendChild(l);}if(S.settings.rpe&&!qs('[data-run-field="rpe"]',inputs)){var l2=document.createElement('label');l2.textContent='RPE';l2.innerHTML+=' <input type="number" inputmode="decimal" min="1" max="10" step="0.5" data-run-field="rpe" value="'+esc(set.rpe||'')+'">';inputs.appendChild(l2);}}
  function v7DiaryConfidence(){var valid=S.diary.filter(function(d){return d&&d.date&&(typeof d.weight==='number'||typeof d.waist==='number');});if(valid.length<3)return{level:'low',label:v7c('confidenceLow'),detail:valid.length+' '+(S.lang==='en'?'measurements':'измерения')};var dates=valid.map(function(d){return Date.parse(d.date+'T12:00:00');}).filter(isFinite);var span=dates.length>1?(Math.max.apply(null,dates)-Math.min.apply(null,dates))/86400000:0;if(valid.length>=6&&span>=21)return{level:'enough',label:v7c('confidenceEnough'),detail:valid.length+' · '+Math.round(span/7)+' '+(S.lang==='en'?'weeks':'нед.')};return{level:'medium',label:v7c('confidenceMedium'),detail:valid.length+' · '+Math.max(1,Math.round(span/7))+' '+(S.lang==='en'?'weeks':'нед.')};}
  function renderV7ExerciseHistory(id){var info=qs('#modal .modal-info'),swap=$('swap-reasons');if(!info||!swap)return;var host=$('modal-history-v7');if(!host){host=document.createElement('section');host.id='modal-history-v7';host.className='v7-ex-history';var block=swap.closest('div');if(block&&block.parentNode)block.parentNode.insertBefore(host,block);else info.appendChild(host);}var sessions=[];for(var i=0;i<S.history.length&&sessions.length<3;i++){var h=S.history[i],hit=(h.items||[]).filter(function(x){return x.id===id;})[0];if(hit)sessions.push({entry:h,item:hit});}if(!sessions.length){host.hidden=true;host.innerHTML='';return;}var latest=sessions[0],sets=Array.isArray(latest.item.setLog)?latest.item.setLog.filter(function(x){return x&&x.completed;}):[];var chips=sets.slice(0,6).map(function(x){var main=(x.weight?x.weight+' × ':'')+(x.reps||'—'),extra=[];if(x.rir)extra.push('RIR '+x.rir);if(x.rpe)extra.push('RPE '+x.rpe);return'<span class="v7-history-set">'+esc(main)+(extra.length?'<small>'+esc(extra.join(' · '))+'</small>':'')+'</span>';}).join('');if(!chips)chips='<span class="v7-history-set">'+esc((latest.item.weight?latest.item.weight+' · ':'')+(latest.item.sets||'—')+' × '+(latest.item.reps||'—'))+'</span>';host.hidden=false;host.innerHTML='<div class="v7-ex-history-head"><h3>'+esc(v7c('exerciseHistory'))+'</h3><span>'+esc(latest.entry.date||'')+(sessions.length>1?' · '+sessions.length+' '+(S.lang==='en'?'sessions':'сессии'):'')+'</span></div><div class="v7-ex-history-result">'+chips+'</div>'; }
  function renderV7NutritionContext(ctx){var out=$('kbju-out');if(!out)return;var old=qs('.v7-nutrition-feedback',out);if(old)old.remove();var confidence=v7DiaryConfidence(),delta=diaryDelta('weight',14),goal=kbjuGoalKey(ctx.goal),text='';if(delta===null||S.diary.length<2){text=S.lang==='en'?'There is not enough progress data to adjust the target. Keep the current estimate and collect at least a few comparable check-ins.':'Недостаточно данных прогресса для корректировки. Сохрани текущий ориентир и накопи несколько сопоставимых check-in.';}else if(goal==='cut'){text=delta<-.2?(S.lang==='en'?'The 14-day weight direction supports the current fat-loss target. No calorie change is justified yet.':'Направление веса за 14 дней поддерживает текущую цель снижения. Оснований менять калории пока нет.'):(S.lang==='en'?'The 14-day trend does not yet clearly support fat loss. Check adherence and collect more data before changing the target.':'14-дневный тренд пока не подтверждает снижение достаточно уверенно. Проверь соблюдение и накопи больше данных до изменения калорий.');}else if(goal==='bulk'){text=delta>.1?(S.lang==='en'?'The 14-day direction supports the current gain target. Keep the target while performance and recovery remain acceptable.':'14-дневное направление поддерживает текущую цель набора. Сохрани ориентир, пока силовые и восстановление остаются приемлемыми.'):(S.lang==='en'?'The 14-day trend is still flat or uncertain. Do not raise calories automatically; verify adherence and collect more data.':'14-дневный тренд пока плоский или неопределённый. Не повышай калории автоматически — сначала проверь соблюдение и накопи данные.');}else{text=Math.abs(delta)<=.5?(S.lang==='en'?'The 14-day weight trend is broadly stable and consistent with maintenance.':'14-дневный тренд веса в целом стабилен и соответствует поддержанию.'):(S.lang==='en'?'Weight is moving outside a stable range. Keep collecting comparable data before changing the target.':'Вес движется вне стабильного диапазона. Накопи сопоставимые данные до изменения ориентира.');}var box=document.createElement('div');box.className='v7-nutrition-feedback';box.innerHTML='<div class="v7-nutrition-feedback-head"><h3>'+esc(v7c('nutritionFeedback'))+'</h3><span class="v7-confidence" data-level="'+confidence.level+'"><b>'+esc(confidence.label)+'</b><span>'+esc(confidence.detail)+'</span></span></div><p>'+esc(text)+'</p><small>'+esc(v7c('nutritionKeep'))+'</small>';out.appendChild(box);}
  var V8_ROUTE_META={
    ru:{home:['CONTROLLED PERFORMANCE','Следующее решение'],library:['MOVEMENT DATABASE','1324 упражнения'],workout:['TRAINING LOG','Текущая сессия'],progress:['FEEDBACK LOOP','Динамика и решение'],more:['SYSTEM','Инструменты и настройки'],tools:['TOOLS','Калькуляторы нагрузки'],program:['PROGRAMME','Структура недели'],nutrition:['NUTRITION','Ориентир и динамика'],knowledge:['KNOWLEDGE','Практические разборы'],method:['METHOD','Логика системы'],settings:['SYSTEM','Локальные настройки'],about:['MARKOV MADE','Автор и границы'],how:['GUIDE','Как пользоваться'],faq:['HELP','Частые вопросы'],contact:['COACHING','Персональная адаптация']},
    en:{home:['CONTROLLED PERFORMANCE','Next decision'],library:['MOVEMENT DATABASE','1,324 exercises'],workout:['TRAINING LOG','Current session'],progress:['FEEDBACK LOOP','Trend and decision'],more:['SYSTEM','Tools and settings'],tools:['TOOLS','Load calculators'],program:['PROGRAMME','Weekly structure'],nutrition:['NUTRITION','Target and trend'],knowledge:['KNOWLEDGE','Practical guides'],method:['METHOD','System logic'],settings:['SYSTEM','Local settings'],about:['MARKOV MADE','Author and boundaries'],how:['GUIDE','How to use'],faq:['HELP','Common questions'],contact:['COACHING','Personal adaptation']}
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
  function renderV8Shell(route,animate){
    route=route||v7RouteFromHash();var returning=v7Returning();document.body.dataset.v8Returning=returning?'true':'false';document.body.dataset.v8Ready='true';
    var meta=v8RouteMeta(route),k=$('v8-context-kicker'),t8=$('v8-context-title'),m8=$('v8-context-meta'),lt=$('v8-context-local-text');
    if(k)k.textContent=meta.k;if(t8)t8.textContent=meta.t;if(m8)m8.textContent=meta.m;if(lt)lt.textContent=S.lang==='en'?'Saved on this device':'Сохранено на устройстве';
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
    window.addEventListener('hashchange',function(){applyV7Route(true);track('home_action',{route:v7RouteFromHash()});});
    window.addEventListener('hashchange',function(){var route=v7RouteFromHash();if(dataRouteNeedsLibrary(route))ensureData().then(refreshDataDependentUI);});
    document.addEventListener('click',function(e){var startRun=e.target.closest('[data-v8-start-run]');if(startRun){e.preventDefault();openRun();return;}var r=e.target.closest('a[data-v7-route],button[data-v7-route]');if(r){e.preventDefault();navigateV7(r.dataset.v7Route,true);return;}var a=e.target.closest('[data-v7-action]');if(a){var type=a.dataset.v7Action;if(type==='resume'||type==='run')openRun();else if(type==='planDay')startPlanDayV7(Number(a.dataset.v7Day)||0,true);else if(type==='profile'){navigateV7('home',false);var panel=qs('.hero-panel');if(panel){panel.scrollIntoView({block:'start'});var first=qs('.console-opt',panel);if(first)first.focus();}}else if(type==='checkin'){navigateV7('progress',true);setTimeout(function(){if($('g-weight'))$('g-weight').focus();},80);}else navigateV7(V7_ROUTE_IDS[type]?type:(type==='program'?'program':'library'),true);track('home_action',{action:type});return;}var th=e.target.closest('[data-v7-theme]');if(th){S.theme=th.dataset.v7Theme;applyTheme();renderV7Settings();return;}var st=e.target.closest('[data-v7-setting]');if(st){var key=st.dataset.v7Setting;S.settings[key]=!S.settings[key];saveSettings();renderV7Settings();if(runOpen())renderRun();return;}if(e.target.closest('[data-v7-coach]')){$('coach-switch').click();renderV7Settings();return;}var data=e.target.closest('[data-v7-data]');if(data){var map={export:'data-export',import:'data-import',clear:'data-clear'};var target=$(map[data.dataset.v7Data]);if(target)target.click();return;}},true);
    if(window.MutationObserver){var mo=new MutationObserver(function(){renderV7Home();syncV7Floating();});['workout-list','hist','prog-out','plan-out'].forEach(function(id){var el=$(id);if(el)mo.observe(el,{childList:true,subtree:false,attributes:true,attributeFilter:['data-filled']});});}
    applyV7Route(false);window.mmgV7={navigate:navigateV7,get route(){return v7RouteFromHash();},render:renderV7All};window.mmgV8=window.mmgV7;
  }

  /* Wrap proven renderers instead of duplicating business logic. */
  var _renderSystemV7=renderSystem;renderSystem=function(){_renderSystemV7();if(document.body&&document.body.dataset.v7Ready==='true')applyV7Route(false);};
  var _renderWorkoutV7=renderWorkout;renderWorkout=function(){_renderWorkoutV7();addProgressionAdviceV7();renderV7Home();};
  var _renderHistoryV7=renderHistory;renderHistory=function(){_renderHistoryV7();renderV7Home();};
  var _renderProgressV7=renderProgress;renderProgress=function(){_renderProgressV7();renderV7Home();};
  var _renderRunV7=renderRun;renderRun=function(){_renderRunV7();renderV7RunAdvanced();};
  var _openExerciseProductOSV7=openExercise;openExercise=function(id,trigger,silent){var result=_openExerciseProductOSV7(id,trigger,silent);renderV7ExerciseHistory(id);return result;};
  var _decorateKbjuProductOSV7=decorateKbju;decorateKbju=function(ctx){var result=_decorateKbjuProductOSV7(ctx);renderV7NutritionContext(ctx);renderV7Home();return result;};
  var _progressIntelligenceHtmlProductOSV7=progressIntelligenceHtml;progressIntelligenceHtml=function(){var html=_progressIntelligenceHtmlProductOSV7();if(!html)return html;var c=v7DiaryConfidence(),badge='<div class="v7-confidence" data-level="'+c.level+'"><b>'+esc(c.label)+'</b><span>'+esc(c.detail)+'</span></div>';return html.replace('<div class="intel-metrics">',badge+'<div class="intel-metrics">');};
  var _applyLangProductOSV7=applyLang;applyLang=function(initial){_applyLangProductOSV7(initial);renderV7All();if(S.activeId)renderV7ExerciseHistory(S.activeId);};
  var _scrollToIdProductOSV7=scrollToId;scrollToId=function(id){if(V7_ROUTE_IDS[id]){navigateV7(id,true);return;}_scrollToIdProductOSV7(id);};
  var _scrollToLibraryProductOSV7=scrollToLibrary;scrollToLibrary=function(){navigateV7('library',false);requestAnimationFrame(function(){var el=$('library');if(el)el.scrollIntoView({block:'start',behavior:REDUCED_MOTION.matches?'auto':'smooth'});});};


  async function init() {
    var initialRoute = (location.hash || '#home').slice(1).split('?')[0];
    var needsData = dataRouteNeedsLibrary(initialRoute);
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

    captureRu();
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
