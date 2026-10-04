/** Keep edits, imports, rollback and clearing in one collection-write order. */
export function createPreferenceWriter(getRepository) {
  let pending = Promise.resolve();
  return value => {
    const snapshot = { ...value };
    pending = pending.catch(() => {}).then(() => getRepository().replaceExercisePreferences(snapshot));
    return pending;
  };
}
