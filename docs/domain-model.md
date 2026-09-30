# MARKOV MADE GYM domain model

This describes the current browser data model and the persistence boundaries introduced for all-time training history. User records stay on the device.

The browser entry is an ES module. `src/app/router.mjs` is the shared route registry, hash normalizer, and hash-change subscription adapter used by the app shell, bootstrap, and Lab UI. `src/app/state.mjs` owns the versioned initial state shape and defaults; the UI currently mutates one app-owned state object while hydration and feature orchestration remain in `app.js`. `src/persistence/local-first-store.mjs` owns the small key/value compatibility adapter, and `src/persistence/history-repository.mjs` owns IndexedDB schema and structured collection operations. The local-first adapter is covered without a DOM or browser runtime; its storage and IndexedDB ownership decisions are injected by the app.

## Current entities

| Entity | Current representation and storage |
| --- | --- |
| UserProfile | Goal, experience, training location, availability, focus, limitations, and recovery baseline. Stored in IndexedDB `userState`; its old LocalStorage value is migrated and removed after verification. |
| Exercise | Compact catalog record with id, RU/EN name, body area, equipment, target and secondary muscles, animation slug, and instructions. The bundled catalog contains 1,324 records. |
| CustomExercise | User-created bilingual exercise with body area, primary/secondary muscles, equipment, movement pattern, tracking type, laterality, compound flag, default dose, load increment, notes, optional local image, and timestamps. Stored in IndexedDB and included in backup schema v10. |
| EquipmentProfile | Named, local set of available equipment. The selected profile filters the Library and constrains generated exercise choices without changing a saved workout. Stored in IndexedDB and included in current backup schema v10. |
| ExercisePreferences | Per-exercise preference: prefer, neutral, less often, avoid, unavailable, or user-marked discomfort. Favourite remains a separate saved-list action. Stored in IndexedDB and included in backup schema v10. |
| Substitution | A deterministic, explainable alternative ranking. The pure engine in `src/features/exercise/substitution-engine.mjs` filters unavailable and user-excluded exercises, then ranks muscle overlap, movement pattern, equipment, role, laterality, declared stability demand, location, experience, programme slot, favourites, and preferences. It returns the evidence labels used by the UI; it does not emit medical judgements. |
| Workout | Current ordered exercise list, target sets/reps/load, completion flags, per-set log, and optional group id/type. Stored in IndexedDB `userState`; the legacy LocalStorage value is imported once and removed after hydration. |
| WorkoutGroup | An optional `superset`, `tri-set`, or `circuit` identity shared by grouped workout items. Run Mode alternates their sets by round; history and repeat preserve the group fields. Program-day grouping has not yet been added. |
| Set | A logged set with reps, load, distance, duration, completion, set role, and optional RIR/RPE. The fields saved depend on the exercise tracking type. Set normalization is in the workout domain in `app.js`. |
| Program | A weekly split with day definitions, selected 4/6/8-week block length, block start week, and current-week completion markers. The block status is derived from calendar weeks and is persisted with the existing plan context in IndexedDB `userState`; older LocalStorage plans migrate once. Older plans default to a four-week block anchored to the current week on first load. |
| Measurement | Date-keyed body diary values such as weight, waist, sleep, and recovery. Stored in IndexedDB `userState`; the old LocalStorage record is migrated once and then removed. |
| NutritionDay | One date-keyed intake summary: calories, protein, optional fat/carbohydrates, optional accuracy, note, and optional same-day weight. Stored in IndexedDB `nutritionDays`; the old `mmg.nutritionLog.v1` record is migrated once and then removed. Weight also updates that date in the body diary. |
| WeeklyNutritionBudget | A derived, non-persisted view for the current Monday–Sunday calendar week. It compares logged dates through today with seven times the current daily target, deduplicates entries by date, and reports coverage and difference without recommending compensation. |
| WeeklyProgramReview | A dated, local check-in for performance trend, fatigue, soreness, joint discomfort, session difficulty, and adherence. The pure decision engine in `src/features/program/weekly-review.mjs` asks for another review or effort data when evidence is incomplete; it can suggest considering an easier week only after repeated decline, high fatigue, hard sessions, adequate adherence, and sufficient rated work sets. It never changes a programme automatically. |
| EvidenceReference | A local, versioned Lab method record with its formula or transformation, evidence classification, limitations, review date, and bibliography. Calculator cards map to an `evidenceId`; the loader validates links and does not fetch user data or remote metadata. |
| UserState | Versioned IndexedDB record keyed by the existing domain storage key. It holds profile, current workout, program, measurements, nutrition calculation, notes, and settings as validated JSON strings while older app code transitions to repository reads. |
| Nutrition calculation | Current macro target calculation and last result. Daily NutritionDay records join by date with body measurements for adaptive expenditure; the Lab requires at least seven paired days and reports coverage, uncertainty, confidence, and its edge-mean smoothing window. |
| Weight trend | `src/features/progress/weight-trend.mjs` reports the latest scale value, an arithmetic mean of readings in the latest 7 calendar days, a 7-day change against the previous window, a per-week 21-day rate, and measurement coverage. It leaves comparisons blank until each compared window contains at least three measurements; it does not interpolate missing days. |
| Calculator result | A local result with calculator id, timestamp, submitted inputs, concise output, formula version, and evidence reference when available. The most recent 500 records live in IndexedDB `userState` and are included in version 10 backups. |

## Today decision contract

`src/features/today/decision-engine.mjs` receives recorded-state facts and returns one recommendation with machine-readable reasons, a confidence label, missing-data keys, and the next action. Both Today cards use this same decision function. It prioritizes an active run, saving a completed workout, starting a prepared workout, reviewing an elapsed programme block, starting the next programme day, overdue body check-in, today's nutrition record, a completed-week review, profile setup, programme creation, and the first workout when there is no training history. The module contains no DOM access or localized copy; the UI maps actions to translated copy and routes while domain tests cover priority and missing-data rules.

## Progression decision contract

`tools/progression.mjs` applies double progression only to completed working sets for exercises tracked as weight-and-reps or bodyweight-plus-added-load. Warm-up, drop, failure, back-off, and AMRAP roles are excluded; assisted-weight, duration, distance, and reps-only tracking cannot produce a load increase. Mixed working loads or explicit mixed units return insufficient evidence. A recommendation includes the target rep range, next load, unit, reason, completed-set evidence, and a confidence label whose basis is the number of qualifying working sets. Maximal-effort top-range sets (RIR 0 or RPE 10) hold the load.

## Workout history and migration

Completed workouts retain their date, duration, exercises, and structured set logs. IndexedDB database `markov-made-gym`, schema version 6, stores history, nutrition days, custom exercises, named equipment profiles, per-exercise preferences, and structured `userState` records. Existing LocalStorage values are copied only when the corresponding IndexedDB record is missing; missing identities are merged into partial collections without replacing current IndexedDB rows. After successful hydration, IndexedDB-backed app state is cached in memory and its legacy LocalStorage copies are removed; subsequent writes go to IndexedDB. Theme, language, density, and small readability preferences remain available in LocalStorage for first paint. On an IndexedDB write failure, a recovery copy is written to LocalStorage and a diagnostic warning is recorded; these recovery values are not treated as authoritative during normal hydration. Backups use `schemaVersion: 10` and export custom exercises, equipment profiles, exercise preferences, nutrition days, calculator history, and complete IndexedDB-backed workout history.

The History view renders 20 records at a time and reveals more on request. Progression, history lookups, and MARKOV MADE LAB use the complete in-memory history loaded from IndexedDB. If IndexedDB is unavailable during migration, the application attempts the legacy browser-storage fallback and reports the storage limitation through diagnostics. The compatibility store uses memory for the active tab, LocalStorage for small first-paint keys and recovery copies, and the IndexedDB repository for keys declared database-owned after hydration.

The Nutrition weekly budget is derived from the saved daily target and date-keyed nutrition entries. It never fills unlogged dates with estimates and does not persist a second aggregate that could drift from the source records.

Command-palette candidate search and ranking live in `src/features/command-palette/search.mjs`; the app supplies localized labels and domain match functions, then handles navigation and rendering. The search module has no DOM access.

The compact exercise dataset is decoded by `src/data/exercise-repository.mjs` into the shared runtime shape. Custom exercise records use the same runtime adapter, keeping dataset decoding and custom-record mapping outside the UI layer.

Workout and set normalization live in `src/features/workout/workout-records.mjs`; Run Mode consumes normalized set roles, completed state and grouping metadata from this pure module.

User-declared exercise preference values and their recommendation ranking weights live in `src/features/exercise/preferences.mjs`; the UI injects the current exercise catalog for validation and supplies translated reason labels.

Developer diagnostics expose schema and migration state, local record counts, current route, service-worker control and the latest local error/storage warning. The panel reads application state in the browser and does not transmit it.

## Planned model boundaries

The selected programme block is currently part of the plan context; it does not yet have an independent repository. ProgressSignal is still derived in feature logic rather than stored as a versioned domain record. CalculatorResult records are persisted in the existing `userState` collection and included in schema v10 backups; move them to a dedicated collection only with a versioned migration.
