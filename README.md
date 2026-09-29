# MARKOV MADE GYM

**Local-first training, progression and nutrition system.**

MARKOV MADE GYM is a browser-first fitness operating system for planning training, running sessions, logging performance, tracking progress, working with nutrition targets and turning personal history into transparent decisions — without requiring an account.

**Live:** https://castefeudal.github.io/markovgym/

## Product capabilities

- **Today** — the next relevant action, including a review when a selected training block ends, instead of a dashboard full of noise.
- **Library** — 1,324 exercises with multilingual instructions, search, filters, body map, media, technique guidance and substitutions.
- **Custom exercises** — add bilingual movements with muscle, equipment, movement, laterality, tracking, default dose, load increment, notes and an optional local image; they participate in search, workout, programme, history and backup flows.
- **Equipment profiles** — switch between gym, home, travel and custom equipment sets; Library filters and generated exercise choices follow the active profile while an in-progress workout remains intact.
- **Exercise preferences** — mark exercises preferred, less often, avoided, unavailable or uncomfortable; recommendations honor those choices, explain plan selections and preserve preferences in backups.
- **Transparent substitutions** — deterministic alternatives ranked by muscle overlap, movement pattern, equipment availability, exercise role, laterality, experience and personal preference, with the matching signals shown beside each option.
- **Workout / Run Mode** — workout building, one-hand set logging, adjustable load/reps, quick set notes, add/remove/undo set controls, exercise-specific tracking, set roles, RPE/RIR, stable live session clock, rest flow, searchable session history and quiet personal-record notices. Lab warm-up ramps can be inserted before an unstarted weighted exercise and stay out of working-volume and progression calculations.
- **Supersets / circuits** — group adjacent unstarted exercises as a superset, tri-set or circuit. Run Mode alternates sets by round, rests between rounds and carries group structure into history and repeated workouts.
- **Progression** — the deterministic double-progression rule evaluates completed working sets only, exposes its evidence and holds the load until the rep floor is met; warm-up, drop, failure, back-off and AMRAP sets do not distort that recommendation.
- **Program** — persistent weekly training structure with a selected 4/6/8-week block, calendar-week progress and a clear end-of-block review state.
- **Progress** — training and body signals from locally recorded data.
- **Nutrition** — calorie and macro planning integrated with the rest of the system.
- **MARKOV MADE LAB** — strength, training, nutrition, body-composition, cardio and conversion calculators with uncertainty and limitations surfaced.
- **Local-first data** — profile, workout, program, measurements, nutrition settings, notes and app settings migrate into IndexedDB `userState`; history, custom exercises, equipment profiles and exercise preferences use dedicated IndexedDB collections. LocalStorage remains a compatibility mirror.
- **All-time workout history** — existing saved sessions migrate from the legacy local-storage key into IndexedDB; the legacy key remains a recent-session compatibility mirror.
- **Daily nutrition log and weight trend** — record calories and protein with optional macros, confidence and a same-date weigh-in; paired intake and weight flow into the transparent adaptive-expenditure estimate. Progress shows the latest scale reading, 7-day mean, 7-day change, 21-day rate and observation coverage without filling gaps. Nutrition compares logged intake with seven times the current daily calorie target, reports covered days and the remaining difference without treating it as a debt or compensation goal. The date-keyed log is stored in IndexedDB and included in validated backups.
- **Versioned backup** — exports use the `markov-made-gym` schema envelope and preserve workout history, nutrition days, custom exercises, equipment profiles and exercise preferences.
- **On-device diagnostics** — Settings shows app and storage schema versions, migration state, local record counts, active route, service worker control and the latest local error or storage warning. Diagnostics remain in the browser.
- **PWA / offline shell** — installable static web application with controlled caching and update lifecycle.
- **RU / EN interface** plus 9-language exercise instruction data.

## MARKOV MADE LAB

The Lab is a first-class calculation workspace rather than a collection of isolated widgets.

Current calculation modules include:

- Epley + Brzycki e1RM range;
- load by %1RM;
- plate loading with available pairs;
- warm-up ramp;
- local training volume and weekly muscle-set summaries;
- Mifflin–St Jeor BMR and optional Katch–McArdle estimate;
- TDEE range;
- rate-based goal calories;
- protein range and macro planner;
- fiber planning reference;
- BMI and waist-to-height screening metrics;
- lean/fat mass, FFMI and normalized FFMI;
- target weight at target body-fat assumption;
- HR / HRR zones;
- pace, speed and Riegel race-time estimate;
- common unit conversions;
- adaptive energy-expenditure estimate when enough paired intake + body-weight data exist.

Calculation logic is kept outside DOM code in pure modules and covered by unit tests. Scientific / official method metadata is versioned under `data/evidence/`.

## Product principles

1. Useful decisions over decorative dashboards.
2. Clear actions over dense screens.
3. Evidence-aware ranges over false precision.
4. Personal recorded data over invented scores.
5. Local-first operation over mandatory accounts.
6. One coherent system over disconnected calculators.
7. Transparent rules over “AI magic”.

## Architecture

The application is currently delivered as a static GitHub Pages PWA while being migrated progressively away from the older monolithic structure.

Key files:

```text
app-body.html                 source body for the generated shell
scripts/build-index.mjs       deterministic index builder
index.html                    generated production entry
app.js                        current core application runtime
app.css                       current core styles
src/features/today/           pure Today next-action decision rules
src/features/workout/         pure personal-record detection against completed history
src/persistence/              versioned IndexedDB repositories for history, nutrition and user-created data
gym-tools.js                  MARKOV MADE LAB UI integration
lab.css                       Lab presentation layer
tools/gym-calculators.mjs     original pure gym calculations
tools/lab-calculators.mjs     expanded pure Lab calculation engine
data/evidence/                formula/source registry
data/exercises-compact.json   lightweight exercise data
data/exercises.json           full exercise dataset
sw.js                         PWA service worker
tests/                        unit, smoke, E2E, accessibility and visual tests
```

The migration rule is **production-safe evolution, not a big-bang rewrite**. Existing local user data and working flows must remain compatible while modules are extracted.

## Development

Requirements: current Node.js and npm.

```bash
npm ci
npm run syntax
npm test
npm run build:index
npm run e2e
```

Combined foundation gate:

```bash
npm run quality
```

The Playwright matrix covers Chromium desktop, Chromium mobile, Firefox and WebKit. Accessibility tests use Axe in addition to flow-level checks.

## CI

`.github/workflows/quality.yml` runs on pushes and pull requests to `main`. `.github/workflows/pages.yml` publishes the exact commit only after its `Quality` push workflow succeeds; GitHub Pages must use **GitHub Actions** as its source:

```text
install
→ syntax
→ unit / smoke
→ production index build
→ Chromium / Firefox / WebKit E2E
→ accessibility checks contained in the E2E suite
→ GitHub Pages deploy after green Quality
```

A production change is not considered healthy merely because the page renders; calculator correctness, stored-state flows, responsive behaviour and browser compatibility are part of the quality gate.

## Privacy

MARKOV MADE GYM is local-first.

- No account is required for the core product.
- Training and nutrition data are not intentionally uploaded by the application.
- Export/import is designed as the portability path for local data.
- Calculator outputs are estimates and planning tools, not medical diagnoses.

## Exercise dataset

The project includes **1,324 exercises** with:

- category / body part;
- equipment;
- primary target and supporting muscles;
- step-by-step instructions;
- instruction content in **9 languages**: English, Spanish, Italian, Turkish, Russian, Chinese, Hindi, Polish and Korean;
- 180×180 thumbnail and animated exercise media where provided.

Approximate distribution in the shipped dataset:

| Body part | Count |
|---|---:|
| Upper arms | 292 |
| Upper legs | 227 |
| Back | 203 |
| Waist | 169 |
| Chest | 163 |
| Shoulders | 143 |
| Lower legs | 59 |
| Lower arms | 37 |
| Cardio | 29 |
| Neck | 2 |

The machine-readable schema is in `data/exercises.schema.json`.

## Data shape

A typical exercise record contains:

```json
{
  "id": "0001",
  "name": "3/4 sit-up",
  "body_part": "waist",
  "equipment": "body weight",
  "target": "abs",
  "secondary_muscles": ["hip flexors", "lower back"],
  "instructions": {
    "ru": "...",
    "en": "..."
  },
  "image": "images/0001-2gPfomN.jpg",
  "gif_url": "videos/0001-2gPfomN.gif",
  "attribution": "© Gym visual — https://gymvisual.com/"
}
```

## Media licensing and attribution

Code, tooling, dataset structure and instruction text are covered by the repository license terms.

Exercise images and GIFs have separate media terms. They are credited to **Gym visual** and must retain the attribution and restrictions documented in:

- `LICENSE`
- `NOTICE.md`

Do not remove media attribution metadata when changing the media pipeline.

## Repository status

MARKOV MADE GYM is no longer positioned as a standalone “exercise dataset browser”. The dataset remains an important subsystem, but the product target is a complete personal system for:

**what to do today → perform the workout → log it → understand progress → choose the next load → manage nutrition and body-composition decisions.**
