/**
 * Canonical route registry and hash parsing for the static app shell.
 * DOM visibility and focus remain in the application adapter.
 */
export const ROUTE_VIEWS = Object.freeze({
  home: Object.freeze(['home']),
  library: Object.freeze(['library']),
  workout: Object.freeze(['workout']),
  progress: Object.freeze(['progress']),
  more: Object.freeze(['more']),
  tools: Object.freeze(['tools']),
  program: Object.freeze(['program']),
  nutrition: Object.freeze(['nutrition']),
  knowledge: Object.freeze(['knowledge']),
  method: Object.freeze(['method']),
  about: Object.freeze(['about']),
  how: Object.freeze(['how']),
  faq: Object.freeze(['faq']),
  contact: Object.freeze(['contact']),
  settings: Object.freeze(['settings']),
});

const ROUTE_SET = new Set(Object.keys(ROUTE_VIEWS));

export function isKnownRoute(route) {
  return ROUTE_SET.has(String(route || ''));
}

export function normalizeRouteHash(hash) {
  const route = String(hash || '#home').replace(/^#/, '').split('?')[0].trim();
  if (!route || route === 'top' || !isKnownRoute(route)) return 'home';
  return route;
}

export function subscribeToHashChanges(target, routeFromHash, onChange) {
  if (!target || typeof target.addEventListener !== 'function' || typeof routeFromHash !== 'function' || typeof onChange !== 'function') {
    return () => {};
  }
  const handleChange = () => onChange(routeFromHash());
  target.addEventListener('hashchange', handleChange);
  return () => target.removeEventListener?.('hashchange', handleChange);
}
