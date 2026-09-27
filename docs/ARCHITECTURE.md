# MARKOV MADE GYM — architecture contract

## Product rule

The application is a local-first training, progression and nutrition system. Every primary screen should answer at least one question:

1. What is happening?
2. What does it mean?
3. What should I do next?

## Migration strategy

No big-bang rewrite. Existing user data keys and proven flows remain compatible while features move behind modular boundaries.

## Feature boundaries

- Today: next action and current context.
- Train: workout building, Run Mode and history.
- Library: exercise discovery, technique and substitutions.
- Program: persistent training structure.
- Progress: training, muscle, body, recovery and consistency signals.
- Nutrition: starting targets and data-informed adjustment.
- Lab: pure calculators, evidence, interpretation and saved results.
- Settings: appearance, logging, privacy and data lifecycle.

## Lab contract

Calculation logic must not depend on the DOM. UI modules consume pure functions.

Every calculator should expose:
- result;
- range/uncertainty when meaningful;
- confidence;
- interpretation;
- assumptions;
- limitations;
- evidence/formula version.

No fabricated precision, medical diagnosis or proprietary-algorithm cloning.

## Persistence

- local-first is the default;
- schema changes are versioned;
- old localStorage keys remain readable during migration;
- large future collections should move to IndexedDB behind a repository abstraction;
- import is validated before active state is replaced.

## Design

Components use semantic design tokens. Feature CSS must not redefine global theme colors.

## Quality gate

A change is production-ready only after syntax, unit/smoke, generated-file drift, E2E, accessibility and visual smoke checks pass.
