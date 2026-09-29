import test from 'node:test';
import assert from 'node:assert/strict';
import { getCalculatorEvidenceId, getLabEvidence, getLocalizedLabEvidence, loadLabEvidenceRegistry, validateCalculatorEvidenceMap } from '../src/features/lab/evidence-registry.mjs';

const calculatorIds = [
  'lab-e1rm', 'lab-percent', 'lab-plates', 'lab-warmup', 'lab-volume', 'lab-muscles', 'lab-bmr', 'lab-goal',
  'lab-protein', 'lab-macros', 'lab-fiber', 'lab-bmi', 'lab-ffmi', 'lab-target-bf', 'lab-hr', 'lab-pace',
  'lab-riegel', 'lab-convert', 'lab-adaptive', 'lab-personal-summary', 'lab-planning',
];

test('every MARKOV MADE LAB calculator is mapped to a valid, reviewed evidence or method record', () => {
  const registry = loadLabEvidenceRegistry();
  assert.equal(validateCalculatorEvidenceMap(calculatorIds), true);
  assert.equal(Object.keys(registry).length, calculatorIds.length);
  for (const id of calculatorIds) {
    const evidence = getLabEvidence(getCalculatorEvidenceId(id));
    assert.equal(evidence.lastReviewed, '2026-09-30');
    assert.ok(evidence.version);
    assert.ok(evidence.formula);
    assert.ok(evidence.limitations);
    for (const reference of evidence.references) {
      assert.match(reference.url, /^https:\/\//);
      assert.ok(reference.title && reference.organisation && reference.year && reference.kind);
    }
  }
});

test('evidence loader exposes Russian copy and rejects unknown identifiers', () => {
  const evidence = getLocalizedLabEvidence('resting-energy-estimates', 'ru');
  assert.equal(evidence.title, 'Формулы основного обмена');
  assert.match(evidence.limitations, /популяционные оценки/);
  assert.equal(getLabEvidence('unknown'), null);
  assert.equal(getCalculatorEvidenceId('not-a-calculator'), null);
  assert.equal(validateCalculatorEvidenceMap([...calculatorIds, 'not-a-calculator']), false);
});
