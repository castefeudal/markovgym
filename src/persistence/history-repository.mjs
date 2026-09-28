export const HISTORY_DATABASE = 'markov-made-gym';
export const HISTORY_SCHEMA_VERSION = 1;

const HISTORY_STORE = 'history';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function cleanHistory(entries) {
  if (!Array.isArray(entries)) return [];
  const ids = new Set();
  return entries.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.items)) return [];
    const copy = structuredClone(entry);
    if (!copy.id) copy.id = `legacy-${String(copy.date || 'unknown')}-${index}`;
    copy.id = String(copy.id);
    const baseId = copy.id;
    let suffix = 1;
    while (ids.has(copy.id)) copy.id = `${baseId}-${++suffix}`;
    ids.add(copy.id);
    return [copy];
  });
}

function newestFirst(entries) {
  return entries.sort((a, b) => {
    const date = String(b.date || '').localeCompare(String(a.date || ''));
    return date || String(b.id).localeCompare(String(a.id));
  });
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DATABASE, HISTORY_SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another tab'));
  });
}

export async function createHistoryRepository() {
  const db = await openDatabase();

  async function readAll() {
    const tx = db.transaction(HISTORY_STORE, 'readonly');
    return newestFirst(await requestResult(tx.objectStore(HISTORY_STORE).getAll()));
  }

  async function replaceAll(entries) {
    const records = cleanHistory(entries);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const store = tx.objectStore(HISTORY_STORE);
      store.clear();
      records.forEach((entry) => store.put(entry));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save workout history'));
      tx.onabort = () => reject(tx.error || new Error('Workout history save was aborted'));
    });
    return records.length;
  }

  async function migrateLegacy(entries) {
    const existing = await readAll();
    if (!existing.length && Array.isArray(entries) && entries.length) await replaceAll(entries);
    return readAll();
  }

  return Object.freeze({
    schemaVersion: HISTORY_SCHEMA_VERSION,
    readAll,
    replaceAll,
    migrateLegacy,
    close: () => db.close(),
  });
}

export { cleanHistory, newestFirst };
