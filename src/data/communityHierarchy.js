export function isCurrentCommunityWorkspace(communityId, workspaceCommunityId) {
  return Boolean(communityId && workspaceCommunityId && communityId === workspaceCommunityId);
}

export function getDepartmentDepth(nodes, nodeId) {
  let depth = 0;
  let current = nodes.find(({ id }) => id === nodeId);
  const visited = new Set();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = nodes.find(({ id }) => id === current.parentId);
  }
  return depth;
}

export function flattenDepartmentNodes(nodes, parentId = null, depth = 0, visited = new Set()) {
  return nodes
    .filter((node) => node.parentId === parentId && !visited.has(node.id))
    .flatMap((node) => {
      const nextVisited = new Set(visited).add(node.id);
      return [
        { ...node, depth },
        ...flattenDepartmentNodes(nodes, node.id, depth + 1, nextVisited),
      ];
    });
}

export function getDepartmentSubtreeIds(nodes, nodeId) {
  if (!nodes.some(({ id }) => id === nodeId)) return new Set();
  const ids = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach((node) => {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    });
  }
  return ids;
}

export function getDepartmentMemberIds(nodes, nodeId) {
  const subtreeIds = getDepartmentSubtreeIds(nodes, nodeId);
  return [...new Set(nodes
    .filter(({ id }) => subtreeIds.has(id))
    .flatMap(({ memberIds = [] }) => memberIds))];
}

export function getDepartmentAncestorIds(nodes, nodeId) {
  const ids = new Set();
  let current = nodes.find(({ id }) => id === nodeId);
  while (current && !ids.has(current.id)) {
    ids.add(current.id);
    current = current.parentId ? nodes.find(({ id }) => id === current.parentId) : null;
  }
  return ids;
}

export function getMemberDepartmentNode(nodes, memberId) {
  return nodes
    .filter(({ memberIds = [] }) => memberIds.includes(memberId))
    .sort((left, right) => getDepartmentDepth(nodes, right.id) - getDepartmentDepth(nodes, left.id))[0] ?? null;
}

export function assignUnassignedMembersToRoot(nodes, memberIds) {
  const root = nodes.find(({ parentId }) => parentId === null);
  if (!root) return nodes;

  const assignedIds = new Set(nodes.flatMap(({ memberIds: assigned = [] }) => assigned));
  const unassignedIds = memberIds.filter((memberId) => memberId && !assignedIds.has(memberId));
  if (!unassignedIds.length) return nodes;

  return nodes.map((node) => node.id === root.id
    ? { ...node, memberIds: [...new Set([...(node.memberIds ?? []), ...unassignedIds])] }
    : node);
}
