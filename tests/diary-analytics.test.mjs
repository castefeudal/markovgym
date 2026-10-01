import test from 'node:test';
import assert from 'node:assert/strict';
import { diaryAverage, diaryDelta } from '../src/features/progress/diary-analytics.mjs';

const day = (n) => `2026-09-${String(n).padStart(2, '0')}`;

test('diary delta sorts entries and compares against the newest reading at the requested interval', () => {
  const entries = [
    { date: day(30), weight: 72 },
    { date: day(10), weight: 74 },
    { date: day(20), weight: 73 },
  ];
  assert.equal(diaryDelta(entries, 'weight', 7), -1);
  assert.equal(diaryDelta(entries, 'weight', 14), -2);
  assert.equal(diaryDelta(entries, 'weight', 30), -2);
});

test('diary delta ignores invalid values and returns null without a comparison point', () => {
  assert.equal(diaryDelta([{ date: day(30), sleep: 7 }, { date: 'bad', sleep: 8 }], 'sleep', 7), null);
  assert.equal(diaryDelta([{ date: day(30), sleep: NaN }, { date: day(20), sleep: 6 }], 'sleep', 7), null);
  assert.equal(diaryDelta([{ date: day(30), sleep: 7 }], 'sleep', 7), null);
});

test('diary average uses the requested cutoff and ignores malformed records', () => {
  const entries = [
    { date: '2026-09-29', sleep: 8 },
    { date: '2026-09-28', sleep: 6 },
    { date: '2026-09-01', sleep: 2 },
    { date: '2026-09-30', sleep: Infinity },
  ];
  const now = Date.parse('2026-09-30T12:00:00Z');
  assert.equal(diaryAverage(entries, 'sleep', 3, now), 7);
  assert.equal(diaryAverage([], 'sleep', 14, now), null);
  assert.equal(diaryAverage(entries, 'sleep', -1, now), null);
});
