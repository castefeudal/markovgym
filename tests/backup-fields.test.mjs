import test from 'node:test';
import assert from 'node:assert/strict';
import { backupEnvelopeError, parseBackupJson, validateBackupField } from '../src/features/backup/backup-fields.mjs';
import { cleanMeasurements } from '../src/persistence/history-repository.mjs';

const parse = (value) => JSON.parse(value);

test('backup envelope parser distinguishes malformed JSON, invalid shape and future schemas', () => {
  assert.equal(parseBackupJson('{'), null);
  assert.equal(backupEnvelopeError(null, 10), 'shape');
  assert.equal(backupEnvelopeError({ kind: 'mmg-backup', data: [] }, 10), 'shape');
  assert.equal(backupEnvelopeError({ kind: 'mmg-backup', data: {}, schemaVersion: 11 }, 10), 'future');
  assert.equal(backupEnvelopeError({ kind: 'mmg-backup', data: {}, v: 10 }, 10), null);
});

test('simple backup settings accept only known values and normalize numeric rest', () => {
  assert.equal(validateBackupField('lang', 'en'), 'en');
  assert.equal(validateBackupField('lang', 'fr'), null);
  assert.equal(validateBackupField('theme', 'ivory'), 'ivory');
  assert.equal(validateBackupField('theme', 'system'), null);
  assert.equal(validateBackupField('rest', '090'), '90');
  assert.equal(validateBackupField('schema', '999'), '999');
  assert.equal(validateBackupField('schema', '1000'), null);
});

test('backup history and references drop malformed or unknown exercise records', () => {
  const adapters = {
    exerciseExists: (id) => id === 'row' || id === 'press',
    exerciseLimit: 4,
    normalizeWorkoutRecord: (item) => ({ id: item.id, sets: 3, setLog: [] }),
  };
  assert.deepEqual(parse(validateBackupField('fav', JSON.stringify(['row', 'missing', 'press']), adapters)), ['row', 'press']);
  assert.deepEqual(parse(validateBackupField('recentExercises', JSON.stringify(['missing', 'row']), adapters)), ['row']);
  assert.deepEqual(parse(validateBackupField('workout', JSON.stringify([{ id: 'row' }, { id: 'missing' }]), adapters)), [{ id: 'row', sets: 3, setLog: [] }]);
  assert.deepEqual(parse(validateBackupField('history', JSON.stringify([{ items: [] }, {}, null]))), [{ items: [] }]);
  assert.equal(validateBackupField('diary', JSON.stringify([{ date: '2026-10-01' }, {}, { date: 5 }]), { cleanMeasurements }), null);
  const measurements = [{ date: '2026-10-01', weight: 80.4, sleep: 7.5, note: 'Weekly check-in' }];
  assert.deepEqual(parse(validateBackupField('diary', JSON.stringify(measurements), { cleanMeasurements })), cleanMeasurements(measurements));
});

test('profile and workout metadata are bounded and have stable defaults', () => {
  const profile = parse(validateBackupField('profile', JSON.stringify({ goal: 'x'.repeat(60), focus: '', limitations: ['a'.repeat(50)] })));
  assert.equal(profile.goal.length, 40);
  assert.equal(profile.focus, 'balanced');
  assert.equal(profile.limitations[0].length, 50);
  const meta = parse(validateBackupField('meta', JSON.stringify({ name: 'n'.repeat(100), planDay: '2' })));
  assert.equal(meta.name.length, 80);
  assert.equal(meta.planDay, 2);
  assert.equal(validateBackupField('meta', '[]'), null);
});

test('domain-specific collections require their validators and reject partial nutrition imports', () => {
  assert.equal(validateBackupField('customExercises', '[]'), null);
  assert.equal(validateBackupField('customExercises', '[]', { cleanCustomExercises: (rows) => rows }), '[]');
  assert.equal(validateBackupField('nutritionLog', '[{"date":"bad"}]', { cleanNutritionDays: () => [] }), null);
  assert.equal(validateBackupField('nutritionLog', '[]', { cleanNutritionDays: (rows) => rows }), '[]');
  assert.equal(validateBackupField('exercisePreferences', '{}', { cleanExercisePreferences: () => ({}) }), '{}');
  assert.equal(validateBackupField('calculatorHistory', '[]', { cleanCalculatorResults: () => [] }), '[]');
});

test('backup plan adaptation and expired run sessions use injected app context', () => {
  assert.equal(validateBackupField('plan', '{}', { restorePlan: () => null, serializePlan: (plan) => plan }), 'null');
  assert.equal(validateBackupField('plan', '{"days":[]}', { restorePlan: (plan) => plan, serializePlan: (plan) => ({ days: plan.days }) }), '{"days":[]}');
  const expired = validateBackupField('runSession', '{"startedAt":1}', { now: 8 * 3600000 + 2 });
  assert.equal(expired, 'null');
  assert.equal(validateBackupField('runSession', '{"startedAt":50}', { now: 100 }), '{"startedAt":50}');
});

test('settings backup preserves only bounded equipment load overrides', () => {
  const settings = validateBackupField('settings', JSON.stringify({
    rir: true, rpe: false, reading: 'large', loadIncrements: { '0001': 1.25, '0002': 50 },
  }), { cleanLoadIncrementOverrides: (value) => ({ '0001': Number(value['0001']) }) });
  assert.deepEqual(parse(settings), { rir: true, rpe: false, reading: 'large', loadIncrements: { '0001': 1.25 } });
});
