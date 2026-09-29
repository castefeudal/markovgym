import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSubstitutions } from '../src/features/exercise/substitution-engine.mjs';

const source = {
  id: 'press-main', target: 'pectorals', group: 'chest', zone: 'chest',
  secondary: ['triceps', 'anterior-deltoid'], movementPattern: 'horizontal-press',
  laterality: 'bilateral', stabilityRequirement: 'supported', compound: true, equip: 'barbell',
};

const candidates = [
  { id: 'dumbbell-press', target: 'pectorals', group: 'chest', zone: 'chest', secondary: ['triceps'], movementPattern: 'horizontal-press', laterality: 'bilateral', stabilityRequirement: 'supported', equip: 'dumbbell' },
  { id: 'cable-fly', target: 'pectorals', group: 'chest', zone: 'chest', secondary: [], movementPattern: 'horizontal-adduction', laterality: 'bilateral', equip: 'cable' },
  { id: 'triceps-press', target: 'triceps', group: 'chest', zone: 'chest', secondary: ['pectorals'], movementPattern: 'elbow-extension', laterality: 'bilateral', equip: 'dumbbell' },
  { id: 'machine-press', target: 'pectorals', group: 'chest', zone: 'chest', secondary: ['triceps'], movementPattern: 'horizontal-press', laterality: 'bilateral', equip: 'leverage machine' },
  { id: 'unrelated-row', target: 'lats', group: 'back', zone: 'back', secondary: ['biceps'], movementPattern: 'horizontal-pull', laterality: 'bilateral', equip: 'dumbbell' },
  { id: 'unavailable-press', target: 'pectorals', group: 'chest', zone: 'chest', secondary: [], equip: 'barbell' },
  { id: 'avoided-press', target: 'pectorals', group: 'chest', zone: 'chest', secondary: [], equip: 'dumbbell' },
];

test('substitution ranking is deterministic and returns the signals behind its order', () => {
  const ranked = rankSubstitutions({
    exercise: source,
    candidates,
    availableEquipment: ['dumbbell', 'cable', 'leverage machine'],
    preferenceById: { 'dumbbell-press': 'prefer', 'cable-fly': 'lessOften', 'avoided-press': 'avoid' },
    favouriteIds: ['dumbbell-press'],
    location: 'home',
    experience: 'medium',
    roleById: { 'press-main': 'compound', 'dumbbell-press': 'compound', 'cable-fly': 'isolation' },
    levelById: { 'dumbbell-press': 'medium', 'cable-fly': 'beginner' },
    homeEquipment: ['dumbbell'],
    limit: 6,
  });

  assert.equal(ranked[0].exercise.id, 'dumbbell-press');
  assert.deepEqual(ranked[0].reasons, [
    'same_primary', 'supporting_muscle', 'same_movement', 'same_role', 'same_laterality', 'same_stability',
    'available_equipment', 'preferred', 'favourite', 'location_match', 'experience_match',
  ]);
  assert.ok(ranked.some(({ exercise }) => exercise.id === 'triceps-press'));
  assert.ok(!ranked.some(({ exercise }) => ['unrelated-row', 'unavailable-press', 'avoided-press'].includes(exercise.id)));
});

test('substitution reason filters respect equipment and explicit skill context', () => {
  const context = {
    exercise: source,
    candidates,
    availableEquipment: ['dumbbell', 'cable', 'leverage machine'],
    homeEquipment: ['dumbbell'],
    guidedEquipment: ['cable', 'leverage machine'],
    freeWeightEquipment: ['barbell', 'dumbbell'],
    roleById: { 'dumbbell-press': 'compound', 'cable-fly': 'isolation' },
    levelById: { 'dumbbell-press': 'advanced', 'cable-fly': 'beginner', 'machine-press': 'beginner' },
  };

  assert.deepEqual(rankSubstitutions({ ...context, reason: 'busy' }).map(({ exercise }) => exercise.equip).includes('barbell'), false);
  assert.ok(rankSubstitutions({ ...context, reason: 'home' }).every(({ exercise }) => context.homeEquipment.includes(exercise.equip)));
  assert.ok(rankSubstitutions({ ...context, reason: 'hard' }).every(({ exercise }) => context.levelById[exercise.id] === 'beginner'));
  assert.ok(rankSubstitutions({ ...context, reason: 'noequip' }).every(({ exercise }) => exercise.equip !== source.equip));
});
