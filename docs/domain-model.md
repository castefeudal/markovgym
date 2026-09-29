# MARKOV MADE GYM domain model

This describes the current browser data model and the persistence boundaries introduced for all-time training history. User records stay on the device.

## Current entities

| Entity | Current representation and storage |
| --- | --- |
| UserProfile | Goal, experience, training location, availability, focus, limitations, and recovery baseline. Stored in IndexedDB `userState`, with `mmg.profile.v1` as a compatibility mirror. |
| Exercise | Compact catalog record with id, RU/EN name, body area, equipment, target and secondary muscles, animation slug, and instructions. The bundled catalog contains 1,324 records. |
| CustomExercise | User-created bilingual exercise with body area, primary/secondary muscles, equipment, movement pattern, tracking type, laterality, compound flag, default dose, load increment, notes, optional local image, and timestamps. Stored in IndexedDB and included in current backup schema v9. |
| EquipmentProfile | Named, local set of available equipment. The selected profile filters the Library and constrains generated exercise choices without changing a saved workout. Stored in IndexedDB and included in current backup schema v9. |
| ExercisePreferences | Per-exercise preference: prefer, neutral, less often, avoid, unavailable, or user-marked discomfort. Favourite remains a separate saved-list action. Stored in IndexedDB and included in backup schema v9. |
| Substitution | A deterministic, explainable alternative ranking. The pure engine in `src/features/exercise/substitution-engine.mjs` filters unavailable and user-excluded exercises, then ranks muscle overlap, movement pattern, equipment, role, laterality, declared stability demand, location, experience, programme slot, favourites, and preferences. It returns the evidence labels used by the UI; it does not emit medical judgements. |
| Workout | Current ordered exercise list, target sets/reps/load, completion flags, per-set log, and optional group id/type. Stored in IndexedDB `userState`, with `mmg.workout.v2` as a compatibility mirror. |
| WorkoutGroup | An optional `superset`, `tri-set`, or `circuit` identity shared by grouped workout items. Run Mode alternates their sets by round; history and repeat preserve the group fields. Program-day grouping has not yet been added. |
| Set | A logged set with reps, load, distance, duration, completion, set role, and optional RIR/RPE. The fields saved depend on the exercise tracking type. Set normalization is in the workout domain in `app.js`. |
| Program | A weekly split with day definitions and the current week completion markers. Stored in IndexedDB `userState`, with `mmg.plan.v1` as a compatibility mirror. |
| Measurement | Date-keyed body diary values such as weight, waist, sleep, and recovery. Stored in IndexedDB `userState`, with `mmg.diary.v1` as a compatibility mirror. |
| NutritionDay | One date-keyed intake summary: calories, protein, optional fat/carbohydrates, optional accuracy, note, and optional same-day weight. Stored in IndexedDB `nutritionDays`; `mmg.nutritionLog.v1` remains a migration/backup compatibility copy. Weight also updates that date in the body diary. |
| UserState | Versioned IndexedDB record keyed by the existing domain storage key. It holds profile, current workout, program, measurements, nutrition calculation, notes, and settings as validated JSON strings while older app code transitions to repository reads. |
| Nutrition calculation | Current macro target calculation and last result. Daily NutritionDay records join by date with body measurements for adaptive expenditure; the Lab requires at least seven paired days and reports coverage, uncertainty, confidence, and its edge-mean smoothing window. |
| Calculator result | Pure calculation output with method, assumptions, range, and limitations in the Lab result contract. |
| EvidenceReference | Citation metadata in `data/evidence/calculators.json`, linked to supported calculator outputs. |

## Today decision contract

`src/features/today/decision-engine.mjs` receives recorded-state facts and returns one recommendation with machine-readable reasons, a confidence label, missing-data keys, and the next action. It contains no DOM access or localized copy; the UI translates the action while domain tests cover priority and missing-data rules.

## Workout history and migration

Completed workouts retain their date, duration, exercises, and structured set logs. IndexedDB database `markov-made-gym`, schema version 6, stores history, nutrition days, custom exercises, named equipment profiles, per-exercise preferences, and structured `userState` records. Existing LocalStorage values are copied only when the corresponding IndexedDB collection is empty; LocalStorage remains a compatibility mirror. Backups use `schemaVersion: 9` and export custom exercises, equipment profiles, exercise preferences, nutrition days, and complete IndexedDB-backed history.

The History view renders 20 records at a time and reveals more on request. Progression and history lookups use the complete in-memory history loaded from IndexedDB. If IndexedDB is unavailable, the application falls back to browser storage and reports the storage limitation through diagnostics.

## Planned model boundaries

Mesocycle, ProgressSignal, and CalculatorResult history are not yet independent persisted collections. Add them through versioned migrations and repository APIs rather than more unrelated LocalStorage keys. Preserve old backup fields when introducing those collections.
