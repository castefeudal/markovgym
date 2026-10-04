import test from 'node:test';
import assert from 'node:assert/strict';
import { bindSessionLifecycle } from '../src/features/workout/session-lifecycle.mjs';

test('hidden/pagehide flush a live draft; a visible page does not rewrite it', async () => {
  const window = new EventTarget(), document = new EventTarget();
  document.visibilityState = 'visible';
  let active = true; const calls = [];
  const unbind = bindSessionLifecycle({ window, document, isActive: () => active,
    saveDraft: () => calls.push('draft'), saveSession: () => calls.push('session'),
    persistTimer: () => calls.push('timer'), flush: () => calls.push('flush'), onError: () => calls.push('error') });
  document.dispatchEvent(new Event('visibilitychange')); assert.deepEqual(calls, []);
  document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(calls, ['draft', 'session', 'timer', 'flush']);
  calls.length = 0; active = false; window.dispatchEvent(new Event('pagehide'));
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(calls, ['timer', 'flush']);
  unbind(); calls.length = 0; window.dispatchEvent(new Event('pagehide')); assert.deepEqual(calls, []);
});
