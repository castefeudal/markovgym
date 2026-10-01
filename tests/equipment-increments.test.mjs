import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLoadIncrementOverrides, equipmentLoadIncrement, loadEquipmentKind } from '../src/features/workout/equipment-increments.mjs';

test('equipment kinds map to distinct and explainable progression increments', () => {
  assert.equal(loadEquipmentKind('barbell'), 'barbell');
  assert.equal(loadEquipmentKind('smith machine'), 'smith');
  assert.equal(loadEquipmentKind('dumbbell'), 'dumbbell');
  assert.equal(loadEquipmentKind('cable'), 'cable');
  assert.equal(loadEquipmentKind('leverage machine'), 'machine');
  assert.equal(equipmentLoadIncrement({ id: 'b', equip: 'barbell' }), 2.5);
  assert.equal(equipmentLoadIncrement({ id: 's', equip: 'smith machine' }), 2.5);
  assert.equal(equipmentLoadIncrement({ id: 'd', equip: 'dumbbell' }), 1);
  assert.equal(equipmentLoadIncrement({ id: 'c', equip: 'cable' }), 2.5);
  assert.equal(equipmentLoadIncrement({ id: 'm', equip: 'leverage machine' }), 2.5);
});

test('explicit custom and user increments take priority over equipment defaults', () => {
  assert.equal(equipmentLoadIncrement({ id: 'd', equip: 'dumbbell', custom: true, loadIncrement: 1.5 }), 1.5);
  assert.equal(equipmentLoadIncrement({ id: 'd', equip: 'dumbbell' }, { d: 2 }), 2);
  assert.equal(equipmentLoadIncrement({ id: 'd', equip: 'dumbbell' }, { d: 100 }), 1);
});

test('load increment overrides are bounded and retain independent ids', () => {
  assert.deepEqual(cleanLoadIncrementOverrides({ a: 1.25, b: '2.5', c: 0, d: 21, e: Infinity }), { a: 1.25, b: 2.5 });
  const one = cleanLoadIncrementOverrides({ a: 1 });
  const two = cleanLoadIncrementOverrides({ a: 2 });
  assert.equal(one.a, 1);
  assert.equal(two.a, 2);
});
