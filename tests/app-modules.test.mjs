import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleSet } from '../src/app/load-modules.mjs';

test('loadModuleSet starts independent imports together and returns keyed modules', async () => {
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  let secondStarted = false;
  const loading = loadModuleSet({
    first: () => first,
    second: async () => { secondStarted = true; return { value: 2 }; },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(secondStarted, true);
  releaseFirst({ value: 1 });
  assert.deepEqual(await loading, {
    first: { value: 1 },
    second: { value: 2 },
  });
});

test('loadModuleSet isolates a rejected optional import and reports its key', async () => {
  const failures = [];
  const result = await loadModuleSet({
    available: async () => 'ready',
    optional: async () => { throw new Error('missing optional module'); },
  }, (key, error) => failures.push([key, error.message]));

  assert.deepEqual(result, { available: 'ready', optional: null });
  assert.deepEqual(failures, [['optional', 'missing optional module']]);
});
