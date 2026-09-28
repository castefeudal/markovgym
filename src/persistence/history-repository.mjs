export const HISTORY_DATABASE = 'markov-made-gym';
export const HISTORY_SCHEMA_VERSION = 2;

const HISTORY_STORE = 'history';
const CUSTOM_EXERCISE_STORE = 'customExercises';
const TRACKING_TYPES = new Set([
  'weight-reps', 'reps-only', 'duration', 'distance-duration',
  'weight-duration', 'assisted-weight', 'bodyweight-added-weight',
]);

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
      if (!db.objectStoreNames.contains(CUSTOM_EXERCISE_STORE)) db.createObjectStore(CUSTOM_EXERCISE_STORE, { keyPath: 'id' });
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

export function cleanCustomExercises(entries) {
  if (!Array.isArray(entries)) return [];
  const ids = new Set();
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const id = String(entry.id || '').slice(0, 80);
    const nameRu = String(entry.nameRu || '').trim().slice(0, 120);
    const nameEn = String(entry.nameEn || '').trim().slice(0, 120);
    const zone = String(entry.zone || '').trim().slice(0, 48);
    const target = String(entry.target || '').trim().slice(0, 48);
    const equip = String(entry.equip || '').trim().slice(0, 64);
    const trackingType = String(entry.trackingType || 'weight-reps');
    if (!id.startsWith('custom-') || ids.has(id) || !nameRu || !nameEn || !zone || !target || !equip || !TRACKING_TYPES.has(trackingType)) return [];
    ids.add(id);
    const number = (value, fallback, min, max) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
    };
    const laterality = ['bilateral', 'unilateral', 'alternating', 'none'].includes(entry.laterality)
      ? entry.laterality
      : 'bilateral';
    const secondary = Array.isArray(entry.secondary)
      ? [...new Set(entry.secondary.map((value) => String(value).trim().slice(0, 48)).filter(Boolean))].slice(0, 8)
      : [];
    const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt.slice(0, 40) : '';
    const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt.slice(0, 40) : createdAt;
    return [{
      id,
      nameRu,
      nameEn,
      zone,
      target,
      secondary,
      equip,
      movementPattern: String(entry.movementPattern || '').trim().slice(0, 48) || null,
      trackingType,
      laterality,
      compound: Boolean(entry.compound),
      defaultSets: number(entry.defaultSets, 3, 1, 20),
      defaultRepRange: String(entry.defaultRepRange || '8–12').trim().slice(0, 24),
      defaultRest: number(entry.defaultRest, 90, 15, 900),
      loadIncrement: number(entry.loadIncrement, 2.5, 0.1, 100),
      notes: String(entry.notes || '').trim().slice(0, 1000),
      image: typeof entry.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(entry.image) && entry.image.length <= 2_000_000 ? entry.image : null,
      createdAt,
      updatedAt,
    }];
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

  async function readCustomExercises() {
    const tx = db.transaction(CUSTOM_EXERCISE_STORE, 'readonly');
    return cleanCustomExercises(await requestResult(tx.objectStore(CUSTOM_EXERCISE_STORE).getAll()));
  }

  async function replaceCustomExercises(entries) {
    const records = cleanCustomExercises(entries);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CUSTOM_EXERCISE_STORE, 'readwrite');
      const store = tx.objectStore(CUSTOM_EXERCISE_STORE);
      store.clear();
      records.forEach((entry) => store.put(entry));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save custom exercises'));
      tx.onabort = () => reject(tx.error || new Error('Custom exercise save was aborted'));
    });
    return records.length;
  }

  async function migrateLegacyCustomExercises(entries) {
    const existing = await readCustomExercises();
    if (!existing.length && Array.isArray(entries) && entries.length) await replaceCustomExercises(entries);
    return readCustomExercises();
  }

  return Object.freeze({
    schemaVersion: HISTORY_SCHEMA_VERSION,
    readAll,
    replaceAll,
    migrateLegacy,
    readCustomExercises,
    replaceCustomExercises,
    migrateLegacyCustomExercises,
    close: () => db.close(),
  });
}

export { cleanHistory, newestFirst };
