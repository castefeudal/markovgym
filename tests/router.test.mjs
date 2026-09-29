import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownRoute, normalizeRouteHash, ROUTE_VIEWS } from '../src/app/router.mjs';

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
