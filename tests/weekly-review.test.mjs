import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyReviewDecision } from '../src/features/program/weekly-review.mjs';

const repeatedDecline = [
  { weekStart: '2026-09-14', performance: 'declining', fatigue: 'high', sessionDifficulty: 4, adherence: 0.8 },
  { weekStart: '2026-09-21', performance: 'declining', fatigue: 'high', sessionDifficulty: 5, adherence: 1 },
];
const ratedSets = Array.from({ length: 6 }, (_, index) => ({
  completed: true, type: 'working', rir: index < 3 ? 1 : 2,
}));

test('weekly review suggests a deload only after repeated difficulty and enough rated working sets', () => {
  const result = weeklyReviewDecision({ reviews: repeatedDecline, completedWorkingSets: ratedSets, programmeAgeWeeks: 4 });
  assert.equal(result.recommendation, 'consider-deload');
  assert.equal(result.evidence.nearLimitRate, 0.5);
  assert.equal(result.evidence.consecutiveWeeks, 2);
  assert.ok(result.reasons.includes('high_fatigue_and_session_difficulty'));
});

test('weekly review keeps deload suggestions off when data or programme age is insufficient', () => {
  assert.equal(weeklyReviewDecision({}).recommendation, 'collect-feedback');
  assert.equal(weeklyReviewDecision({ reviews: repeatedDecline, programmeAgeWeeks: 4 }).recommendation, 'hold-and-review-next-week');
  assert.equal(weeklyReviewDecision({ reviews: repeatedDecline, completedWorkingSets: ratedSets, programmeAgeWeeks: 2 }).recommendation, 'hold-and-review-next-week');
});

test('discomfort is surfaced without a diagnosis and improving performance supports continuing the plan', () => {
  assert.equal(weeklyReviewDecision({ reviews: [{ weekStart: '2026-09-21', jointDiscomfort: true }] }).recommendation, 'review-discomfort');
  assert.equal(weeklyReviewDecision({ reviews: [{ weekStart: '2026-09-21', performance: 'improving', fatigue: 'moderate' }] }).recommendation, 'continue-plan');
});
