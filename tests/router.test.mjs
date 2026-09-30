import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownRoute, normalizeRouteHash, ROUTE_VIEWS, subscribeToHashChanges } from '../src/app/router.mjs';

test('route registry exposes one view mapping for every supported route', () => {
  assert.ok(Object.isFrozen(ROUTE_VIEWS));
  assert.equal(Object.keys(ROUTE_VIEWS).length, 15);
  for (const [route, views] of Object.entries(ROUTE_VIEWS)) {
    assert.equal(isKnownRoute(route), true);
    assert.ok(Object.isFrozen(views));
    assert.equal(views.length, 1);
  }
});

test('hash parsing handles direct routes, query suffixes, aliases and unknown input', () => {
  assert.equal(normalizeRouteHash('#library'), 'library');
  assert.equal(normalizeRouteHash('#progress?period=90'), 'progress');
  assert.equal(normalizeRouteHash('#top'), 'home');
  assert.equal(normalizeRouteHash(''), 'home');
  assert.equal(normalizeRouteHash('#missing'), 'home');
  assert.equal(normalizeRouteHash('#workout/extra'), 'home');
});

test('one route subscription reports the current normalized route and can be removed', () => {
  const listeners = new Map();
  const target = {
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); },
  };
  let hash = '#progress?range=90d';
  const routes = [];
  const unsubscribe = subscribeToHashChanges(target, () => normalizeRouteHash(hash), (route) => routes.push(route));
  listeners.get('hashchange')();
  hash = '#unknown';
  listeners.get('hashchange')();
  unsubscribe();
  assert.deepEqual(routes, ['progress', 'home']);
  assert.equal(listeners.has('hashchange'), false);
});
