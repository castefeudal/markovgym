import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyPlan, splitFor } from '../src/features/program/plan-builder.mjs';

function catalog() {
  return [
    ...['chest', 'back', 'upper legs', 'shoulders', 'upper arms', 'waist', 'lower legs', 'lower arms'].flatMap((zone) =>
      Array.from({ length: 5 }, (_, index) => ({
        id: `${zone}-${index}`, zone, equip: index % 2 ? 'dumbbell' : 'machine', idx: index,
      }))),
  ];
}

test('split selection covers supported weekly frequencies and beginner recovery', () => {
  assert.deepEqual(splitFor(2, 'advanced', 'strength'), ['full', 'full']);
  assert.deepEqual(splitFor(3, 'beginner', 'muscle'), ['full', 'full', 'full']);
  assert.deepEqual(splitFor(3, 'advanced', 'strength'), ['push', 'pull', 'legs']);
  assert.deepEqual(splitFor(4, 'middle', 'muscle'), ['upper', 'lower', 'upper', 'lower']);
  assert.deepEqual(splitFor(5, 'middle', 'muscle'), ['push', 'pull', 'legs', 'upper', 'lower']);
  assert.equal(splitFor(6, 'middle', 'muscle').length, 6);
});

test('weekly builder respects equipment, preferences, focus, and goal dose', () => {
  const { week, perSession } = buildWeeklyPlan({
    goal: 'strength', level: 'advanced', days: 3, time: 60, focus: 'chest', recovery: 'low',
    allowedEquipment: ['dumbbell'], exercises: catalog(),
    scoreExercise: (exercise) => exercise.idx,
    isExerciseAllowed: (exercise) => !exercise.id.endsWith('-4'),
  });

  assert.equal(week.length, 3);
  assert.ok(perSession >= 3);
  assert.equal(week[0].items[0].ex.zone, 'chest');
  for (const day of week) {
    assert.ok(day.items.every(({ ex }) => ex.equip === 'dumbbell'));
    assert.ok(day.items.every(({ ex }) => !ex.id.endsWith('-4')));
    assert.ok(day.items.every(({ sets, reps, rest }) => sets >= 2 && reps === '3–6' && rest >= 150));
  }
});

test('weekly builder avoids duplicate exercises within each session and stays deterministic', () => {
  const input = { goal: 'muscle', level: 'beginner', days: 4, time: 45, allowedEquipment: ['machine', 'dumbbell'], exercises: catalog() };
  const first = buildWeeklyPlan(input);
  const second = buildWeeklyPlan(input);
  assert.deepEqual(first, second);
  for (const day of first.week) {
    const ids = day.items.map(({ ex }) => ex.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('weekly builder safely returns empty sessions when catalog filters remove every exercise', () => {
  const result = buildWeeklyPlan({ days: 3, exercises: catalog(), isExerciseAllowed: () => false });
  assert.equal(result.week.length, 3);
  assert.ok(result.week.every((day) => day.items.length === 0));
});
