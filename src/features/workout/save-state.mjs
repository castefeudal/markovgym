/** A completed draft already in history must not offer another Save action. */
export function workoutAlreadySaved(workout, history) {
  if (!workout?.length) return false;
  return (history || []).some(session => session.items?.length === workout.length && workout.every((item, index) => {
    const saved = session.items[index];
    if (saved.id !== item.id || !item.setLog?.length || saved.setLog?.length !== item.setLog.length) return false;
    return item.setLog.every((set, position) => {
      const previous = saved.setLog[position];
      return set.completed && Number(set.completedAt) > 0 && previous.completed
        && set.completedAt === previous.completedAt
        && ['weight', 'reps', 'distance', 'duration', 'type', 'rir', 'rpe', 'note'].every(field => String(set[field] ?? '') === String(previous[field] ?? ''));
    });
  }));
}
