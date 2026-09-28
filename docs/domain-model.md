# MARKOV MADE GYM domain model

This describes the current browser data model and the persistence boundaries introduced for all-time training history. User records stay on the device.

## Current entities

| Entity | Current representation and storage |
| --- | --- |
| UserProfile | Goal, experience, training location, availability, focus, limitations, and recovery baseline. Stored under `mmg.profile.v1`. |
| Exercise | Compact catalog record with id, RU/EN name, body area, equipment, target and secondary muscles, animation slug, and instructions. The bundled catalog contains 1,324 records. |
| CustomExercise | User-created bilingual exercise with body area, primary/secondary muscles, equipment, movement pattern, tracking type, laterality, compound flag, default dose, load increment, notes, optional local image, and timestamps. Stored in IndexedDB and exported in backup schema v6. |
| Workout | Current ordered exercise list, target sets/reps/load, completion flags, and per-set log. Stored under `mmg.workout.v2`. |
| Set | A logged set with reps, load, completion, set role, and optional RIR/RPE. Set normalization is in the workout domain in `app.js`. |
| Program | A weekly split with day definitions and the current week completion markers. Stored under `mmg.plan.v1`. |
| Measurement | Date-keyed body diary values such as weight, waist, sleep, and recovery. Stored under `mmg.diary.v1`. |
| Nutrition calculation | Current macro target calculation and last result. A full daily intake diary is not yet part of the persisted model. |
| Calculator result | Pure calculation output with method, assumptions, range, and limitations in the Lab result contract. |
| EvidenceReference | Citation metadata in `data/evidence/calculators.json`, linked to supported calculator outputs. |

## Today decision contract

`src/features/today/decision-engine.mjs` receives recorded-state facts and returns one recommendation with machine-readable reasons, a confidence label, missing-data keys, and the next action. It contains no DOM access or localized copy; the UI translates the action while domain tests cover priority and missing-data rules.

## Workout history and migration

Completed workouts retain their date, duration, exercises, and set logs. IndexedDB database `markov-made-gym`, schema version 2, stores history records by id with no record-count cap and custom exercises in a separate keyed collection. On first open, valid legacy entries from `mmg.history.v1` and `mmg.customExercises.v1` are copied once; the legacy keys remain compatibility mirrors. Backups use `schemaVersion: 6` and export all custom exercises and the complete IndexedDB-backed history.

The History view renders 20 records at a time and reveals more on request. Progression and history lookups use the complete in-memory history loaded from IndexedDB. If IndexedDB is unavailable, the application falls back to browser storage and reports the storage limitation through diagnostics.

## Planned model boundaries

EquipmentProfile, ExercisePreference, NutritionDay, Mesocycle, ProgressSignal, and CalculatorResult history are not yet independent persisted collections. Add them through versioned migrations and repository APIs rather than more unrelated LocalStorage keys. Preserve old backup fields when introducing those collections.
