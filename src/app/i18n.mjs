/** @typedef {{ru?: string, en?: string} | string} TranslationEntry */

/**
 * Creates a runtime translator for the app's bilingual string catalog.
 * The locale provider is called for each lookup so language changes apply
 * without rebuilding the translator or mutating catalog entries.
 * @param {Record<string, TranslationEntry>} catalog
 * @param {() => string} localeProvider
 */
export function createTranslator(catalog, localeProvider) {
  return function translate(key, values) {
    const entry = catalog && catalog[key];
    if (entry == null) return String(key);
    const locale = String(localeProvider?.() || 'ru').split('-')[0];
    const template = typeof entry === 'string'
      ? entry
      : (entry[locale] || entry.ru || entry.en || String(key));
    return String(template).replace(/\{(\w+)\}/g, (token, name) => (
      values && Object.prototype.hasOwnProperty.call(values, name) ? values[name] : token
    ));
  };
}
