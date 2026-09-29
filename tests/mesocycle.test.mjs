import test from 'node:test';
import assert from 'node:assert/strict';
import { mesocycleStatus } from '../src/features/program/mesocycle.mjs';

test('mesocycle progress follows Monday calendar weeks and completes at its selected length', () => {
  assert.deepEqual(mesocycleStatus({ startWeek: '2026-09-28', durationWeeks: 4, today: '2026-09-30' }), {
    status: 'active', weekNumber: 1, durationWeeks: 4, startWeek: '2026-09-28',
  });
  assert.equal(mesocycleStatus({ startWeek: '2026-09-28', durationWeeks: 4, today: '2026-10-19' }).weekNumber, 4);
  assert.equal(mesocycleStatus({ startWeek: '2026-09-28', durationWeeks: 4, today: '2026-10-26' }).status, 'complete');
});

test('mesocycle status handles dates before a block and rejects invalid contracts', () => {
  assert.equal(mesocycleStatus({ startWeek: '2026-10-05', today: '2026-10-01' }).status, 'upcoming');
  assert.equal(mesocycleStatus({ startWeek: '2026-02-30', today: '2026-03-02' }).status, 'insufficient');
  assert.equal(mesocycleStatus({ startWeek: '2026-09-28', durationWeeks: 20, today: '2026-10-01' }).status, 'insufficient');
});
