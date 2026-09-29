export const HISTORY_DATABASE = 'markov-made-gym';
export const HISTORY_SCHEMA_VERSION = 5;

const HISTORY_STORE = 'history';
const CUSTOM_EXERCISE_STORE = 'customExercises';
const EQUIPMENT_PROFILE_STORE = 'equipmentProfiles';
const EXERCISE_PREFERENCE_STORE = 'exercisePreferences';
const USER_STATE_STORE = 'userState';
const EXERCISE_PREFERENCE_VALUES = new Set(['prefer', 'neutral', 'lessOften', 'avoid', 'unavailable', 'discomfort']);
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
      if (!db.objectStoreNames.contains(EQUIPMENT_PROFILE_STORE)) db.createObjectStore(EQUIPMENT_PROFILE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(EXERCISE_PREFERENCE_STORE)) db.createObjectStore(EXERCISE_PREFERENCE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(USER_STATE_STORE)) db.createObjectStore(USER_STATE_STORE, { keyPath: 'key' });
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

export function cleanEquipmentProfiles(entries) {
  if (!Array.isArray(entries)) return [];
  const ids = new Set();
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const id = String(entry.id || '').slice(0, 80);
    const nameRu = String(entry.nameRu || '').trim().slice(0, 80);
    const nameEn = String(entry.nameEn || '').trim().slice(0, 80);
    if (!id || ids.has(id) || !nameRu || !nameEn) return [];
    ids.add(id);
    const equipment = Array.isArray(entry.equipment)
      ? [...new Set(entry.equipment.map((value) => String(value).trim().slice(0, 64)).filter(Boolean))].slice(0, 64)
      : [];
    const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt.slice(0, 40) : '';
    return [{ id, nameRu, nameEn, equipment, createdAt, updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt.slice(0, 40) : createdAt, builtIn: Boolean(entry.builtIn) }];
  });
}

export function cleanExercisePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([id, preference]) => id.length > 0 && id.length <= 80 && EXERCISE_PREFERENCE_VALUES.has(preference) && preference !== 'neutral')
    .slice(0, 1324));
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

  async function readEquipmentProfiles() {
    const tx = db.transaction(EQUIPMENT_PROFILE_STORE, 'readonly');
    return cleanEquipmentProfiles(await requestResult(tx.objectStore(EQUIPMENT_PROFILE_STORE).getAll()));
  }

  async function replaceEquipmentProfiles(entries) {
    const records = cleanEquipmentProfiles(entries);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(EQUIPMENT_PROFILE_STORE, 'readwrite');
      const store = tx.objectStore(EQUIPMENT_PROFILE_STORE);
      store.clear();
      records.forEach((entry) => store.put(entry));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save equipment profiles'));
      tx.onabort = () => reject(tx.error || new Error('Equipment profile save was aborted'));
    });
    return records.length;
  }

  async function migrateLegacyEquipmentProfiles(entries) {
    const existing = await readEquipmentProfiles();
    if (!existing.length && Array.isArray(entries) && entries.length) await replaceEquipmentProfiles(entries);
    return readEquipmentProfiles();
  }

  async function readExercisePreferences() {
    const tx = db.transaction(EXERCISE_PREFERENCE_STORE, 'readonly');
    const records = await requestResult(tx.objectStore(EXERCISE_PREFERENCE_STORE).getAll());
    return cleanExercisePreferences(Object.fromEntries(records.map(({ id, preference }) => [id, preference])));
  }

  async function replaceExercisePreferences(value) {
    const records = Object.entries(cleanExercisePreferences(value)).map(([id, preference]) => ({ id, preference }));
    await new Promise((resolve, reject) => {
      const tx = db.transaction(EXERCISE_PREFERENCE_STORE, 'readwrite');
      const store = tx.objectStore(EXERCISE_PREFERENCE_STORE);
      store.clear();
      records.forEach((record) => store.put(record));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save exercise preferences'));
      tx.onabort = () => reject(tx.error || new Error('Exercise preference save was aborted'));
    });
    return records.length;
  }

  async function migrateLegacyExercisePreferences(value) {
    const existing = await readExercisePreferences();
    if (!Object.keys(existing).length && Object.keys(cleanExercisePreferences(value)).length) await replaceExercisePreferences(value);
    return readExercisePreferences();
  }

  async function readUserState() {
    const tx = db.transaction(USER_STATE_STORE, 'readonly');
    const records = await requestResult(tx.objectStore(USER_STATE_STORE).getAll());
    return Object.fromEntries(records.filter((record) => record && typeof record.key === 'string' && typeof record.value === 'string' && record.value.length <= 50_000_000).map(({ key, value }) => [key, value]));
  }

  async function migrateLegacyUserState(legacyState) {
    const existing = await readUserState();
    const missing = Object.entries(legacyState || {}).filter(([key, value]) => typeof value === 'string' && value.length <= 50_000_000 && !Object.hasOwn(existing, key));
    if (missing.length) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(USER_STATE_STORE, 'readwrite');
        const store = tx.objectStore(USER_STATE_STORE);
        missing.forEach(([key, value]) => store.put({ key, value }));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not migrate local user state'));
        tx.onabort = () => reject(tx.error || new Error('User state migration was aborted'));
      });
    }
    return readUserState();
  }

  async function writeUserState(key, value) {
    if (typeof key !== 'string' || !key || key.length > 160 || typeof value !== 'string' || value.length > 50_000_000) throw new TypeError('Invalid user state record');
    await new Promise((resolve, reject) => {
      const tx = db.transaction(USER_STATE_STORE, 'readwrite');
      tx.objectStore(USER_STATE_STORE).put({ key, value });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save user state'));
      tx.onabort = () => reject(tx.error || new Error('User state save was aborted'));
    });
  }

  async function deleteUserState(key) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(USER_STATE_STORE, 'readwrite');
      tx.objectStore(USER_STATE_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not delete user state'));
      tx.onabort = () => reject(tx.error || new Error('User state deletion was aborted'));
    });
  }

  async function clearUserState() {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(USER_STATE_STORE, 'readwrite');
      tx.objectStore(USER_STATE_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not clear user state'));
      tx.onabort = () => reject(tx.error || new Error('User state clear was aborted'));
    });
  }

  return Object.freeze({
    schemaVersion: HISTORY_SCHEMA_VERSION,
    readAll,
    replaceAll,
    migrateLegacy,
    readCustomExercises,
    replaceCustomExercises,
    migrateLegacyCustomExercises,
    readEquipmentProfiles,
    replaceEquipmentProfiles,
    migrateLegacyEquipmentProfiles,
    readExercisePreferences,
    replaceExercisePreferences,
    migrateLegacyExercisePreferences,
    readUserState,
    migrateLegacyUserState,
    writeUserState,
    deleteUserState,
    clearUserState,
    close: () => db.close(),
  });
}

export { cleanHistory, newestFirst };
