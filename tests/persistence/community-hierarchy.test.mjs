import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignUnassignedMembersToRoot,
  flattenDepartmentNodes,
  getDepartmentAncestorIds,
  getDepartmentMemberIds,
  getDepartmentSubtreeIds,
  getMemberDepartmentNode,
  isCurrentCommunityWorkspace,
} from '../../src/data/communityHierarchy.js';

const departments = [
  { id: 'root', parentId: null, name: '공동체', memberIds: ['admin'] },
  { id: 'youth', parentId: 'root', name: '청년부', memberIds: ['a', 'b'] },
  { id: 'media', parentId: 'youth', name: '미디어팀', memberIds: ['b', 'c'] },
  { id: 'adult', parentId: 'root', name: '장년부', memberIds: ['d'] },
];

test('missing community ids never match an empty server workspace', () => {
  assert.equal(isCurrentCommunityWorkspace('', undefined), false);
  assert.equal(isCurrentCommunityWorkspace(undefined, undefined), false);
  assert.equal(isCurrentCommunityWorkspace('community-a', 'community-a'), true);
  assert.equal(isCurrentCommunityWorkspace('community-a', 'community-b'), false);
});

test('department counts include descendants without counting a member twice', () => {
  assert.deepEqual(getDepartmentMemberIds(departments, 'root').sort(), ['a', 'admin', 'b', 'c', 'd']);
  assert.deepEqual(getDepartmentMemberIds(departments, 'youth').sort(), ['a', 'b', 'c']);
  assert.deepEqual(getDepartmentMemberIds(departments, 'missing'), []);
});

test('department traversal preserves hierarchy and selects the deepest direct assignment', () => {
  assert.deepEqual([...getDepartmentSubtreeIds(departments, 'youth')].sort(), ['media', 'youth']);
  assert.deepEqual([...getDepartmentAncestorIds(departments, 'media')].sort(), ['media', 'root', 'youth']);
  assert.equal(getMemberDepartmentNode(departments, 'b')?.id, 'media');
  assert.deepEqual(flattenDepartmentNodes(departments).map(({ id, depth }) => [id, depth]), [
    ['root', 0],
    ['youth', 1],
    ['media', 2],
    ['adult', 1],
  ]);
});

test('malformed circular department links do not loop forever', () => {
  const circular = [
    { id: 'a', parentId: 'b', memberIds: ['one'] },
    { id: 'b', parentId: 'a', memberIds: ['two'] },
  ];
  assert.deepEqual([...getDepartmentAncestorIds(circular, 'a')].sort(), ['a', 'b']);
  assert.equal(getMemberDepartmentNode(circular, 'one')?.id, 'a');
});

test('members without a department fall back to the community root', () => {
  const normalized = assignUnassignedMembersToRoot(departments, ['admin', 'a', 'unassigned']);
  assert.deepEqual(normalized.find(({ id }) => id === 'root').memberIds.sort(), ['admin', 'unassigned']);
  assert.equal(getMemberDepartmentNode(normalized, 'unassigned')?.id, 'root');
  assert.equal(assignUnassignedMembersToRoot([], ['admin']).length, 0);
});
