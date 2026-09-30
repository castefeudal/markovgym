import test from 'node:test';
import assert from 'node:assert/strict';
import { CALCULATOR_HISTORY_LIMIT, cleanCalculatorResults, createCalculatorResult } from '../src/features/lab/calculator-history.mjs';

test('calculator results keep bounded, typed inputs and ignore unknown fields', () => {
  assert.deepEqual(createCalculatorResult({
    id: 'calc-1', calculatorId: 'e1rm', createdAt: '2026-09-30T12:00:00.000Z',
    title: 'Estimated one-rep max', summary: '120 kg', inputs: { weight: 100, reps: 5, unsafe: { value: 1 } },
    evidenceId: 'e1rm-estimate', formulaVersion: '1', unknown: 'ignored',
  }), {
    id: 'calc-1', calculatorId: 'e1rm', title: 'Estimated one-rep max', createdAt: '2026-09-30T12:00:00.000Z',
    summary: '120 kg', inputs: { weight: '100', reps: '5' },
    evidenceId: 'e1rm-estimate', formulaVersion: '1',
  });
});

test('calculator history drops malformed and duplicate results and applies a retention bound', () => {
  const row = (index) => ({ id: `calc-${index}`, calculatorId: 'pace', createdAt: '2026-09-30T12:00:00.000Z', summary: '5:00 min/km', inputs: {} });
  const input = [row(1), { ...row(1), summary: 'stale duplicate' }, { ...row(2), createdAt: 'invalid' }, ...Array.from({ length: CALCULATOR_HISTORY_LIMIT + 1 }, (_, index) => row(index + 3))];
  const clean = cleanCalculatorResults(input);
  assert.equal(clean.length, CALCULATOR_HISTORY_LIMIT);
  assert.equal(clean[0].summary, '5:00 min/km');
  assert.equal(clean.some(result => result.id === 'calc-2'), false);
});
