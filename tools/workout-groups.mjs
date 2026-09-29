const GROUP_TYPES = new Set(['superset', 'tri-set', 'circuit']);

export function normalizeWorkoutGroup(groupId, groupType) {
  const id = String(groupId || '').slice(0, 48);
  const type = String(groupType || '');
  return id && GROUP_TYPES.has(type) ? { groupId: id, groupType: type } : { groupId: '', groupType: '' };
}

/** Return set coordinates in workout order, interleaving each grouped round. */
export function workoutExecutionOrder(items = []) {
  const order = [];
  const processedGroups = new Set();
  for (let index = 0; index < items.length;) {
    const item = items[index] || {};
    const group = normalizeWorkoutGroup(item.groupId, item.groupType);
    if (!group.groupId) {
      const count = Math.max(1, Math.min(20, Number(item.sets) || 1));
      for (let set = 1; set <= count; set += 1) order.push({ ex: index, set });
      index += 1;
      continue;
    }
    if (processedGroups.has(group.groupId)) { index += 1; continue; }
    processedGroups.add(group.groupId);

    const members = [];
    items.forEach((candidate, candidateIndex) => {
      const next = normalizeWorkoutGroup(candidate.groupId, candidate.groupType);
      if (next.groupId === group.groupId && next.groupType === group.groupType) members.push({ ex: candidateIndex, sets: Math.max(1, Math.min(20, Number(candidate.sets) || 1)) });
    });
    const rounds = Math.max(...members.map((member) => member.sets));
    for (let round = 1; round <= rounds; round += 1) {
      members.forEach((member) => {
        if (round <= member.sets) order.push({ ex: member.ex, set: round });
      });
    }
    index += 1;
  }
  return order;
}
