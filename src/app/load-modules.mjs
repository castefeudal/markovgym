/**
 * Loads independent application modules without coupling the loader to the DOM.
 * Each importer can fail on its own so optional features keep their existing
 * fallback behavior while successful modules are still available.
 *
 * @param {Record<string, () => Promise<unknown>>} importers
 * @param {(key: string, error: unknown) => void} [onError]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadModuleSet(importers, onError = () => {}) {
  const entries = Object.entries(importers || {});
  const loaded = await Promise.all(entries.map(async ([key, importer]) => {
    try {
      return [key, await importer()];
    } catch (error) {
      onError(key, error);
      return [key, null];
    }
  }));
  return Object.freeze(Object.fromEntries(loaded));
}

/**
 * Starts independent domain imports together. IndexedDB initialization and
 * migrations remain the application adapter's responsibility after loading.
 * @param {(key: string, error: unknown) => void} [onError]
 */
export function loadAppModules(onError) {
  return loadModuleSet({
    router: () => import('./router.mjs'),
    i18n: () => import('./i18n.mjs'),
    workoutGroups: () => import('../../tools/workout-groups.mjs'),
    today: () => import('../features/today/decision-engine.mjs'),
    mesocycle: () => import('../features/program/mesocycle.mjs'),
    weeklyReview: () => import('../features/program/weekly-review.mjs'),
    weightTrend: () => import('../features/progress/weight-trend.mjs'),
    nutritionAnalytics: () => import('../features/nutrition/nutrition-analytics.mjs'),
    substitutions: () => import('../features/exercise/substitution-engine.mjs'),
    personalRecords: () => import('../features/workout/pr-engine.mjs'),
    calculatorHistory: () => import('../features/lab/calculator-history.mjs'),
    persistence: () => import('../persistence/history-repository.mjs'),
  }, onError);
}
