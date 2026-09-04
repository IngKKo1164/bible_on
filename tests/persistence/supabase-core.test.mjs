import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMessageViewModel } from '../../src/data/repositories/messageViewAdapter.js';

const coreSqlUrl = new URL('../../supabase/migrations/20260904030000_core_application.sql', import.meta.url);
const noteSqlUrl = new URL('../../supabase/migrations/20260904060000_profile_and_note_sync.sql', import.meta.url);
const departmentSqlUrl = new URL('../../supabase/migrations/20260904080000_department_management_rpcs.sql', import.meta.url);

test('core shared and personal tables all enable RLS', async () => {
  const sql = await readFile(coreSqlUrl, 'utf8');
  const tables = [
    'churches', 'church_memberships', 'departments', 'department_members',
    'friendships', 'user_blocks', 'conversations', 'conversation_members',
    'messages', 'message_reactions', 'message_user_deletions', 'qt_sessions',
    'church_announcements', 'worship_services', 'notifications', 'user_bible_state',
    'verse_notes', 'verse_note_conflicts', 'verse_highlights', 'user_achievements',
    'home_ai_threads',
  ];
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});

test('invited conversation members cannot read messages from before the invitation', async () => {
  const sql = await readFile(coreSqlUrl, 'utf8');
  assert.match(sql, /select next_sequence into first_visible/i);
  assert.match(sql, /visible_from_sequence, invited_by/i);
  assert.match(sql, /target_sequence >= cm\.visible_from_sequence/i);
});

test('note writes use optimistic versions and preserve conflicts', async () => {
  const sql = await readFile(noteSqlUrl, 'utf8');
  assert.match(sql, /current_note\.version <> coalesce\(expected_version, 0\)/i);
  assert.match(sql, /insert into public\.verse_note_conflicts/i);
  assert.match(sql, /version = version \+ 1/i);
});

test('department deletion moves subtree members to the parent first', async () => {
  const coreSql = await readFile(coreSqlUrl, 'utf8');
  const managementSql = await readFile(departmentSqlUrl, 'utf8');
  assert.match(coreSql, /insert into public\.department_members[\s\S]*select target_church, parent_department, dm\.user_id/i);
  assert.match(coreSql, /delete from public\.departments where id = target_department/i);
  assert.match(managementSql, /revoke delete on public\.departments from authenticated/i);
});

test('message adapter computes unread counts from shared read sequences', () => {
  const model = buildMessageViewModel({
    currentUserId: 'user-a',
    conversations: [{ id: 'room', kind: 'direct', name: null, updated_at: '2026-09-04T10:00:00Z', created_at: '2026-09-04T09:00:00Z' }],
    members: [
      { conversation_id: 'room', user_id: 'user-a', visible_from_sequence: 1, last_read_sequence: 1 },
      { conversation_id: 'room', user_id: 'user-b', visible_from_sequence: 1, last_read_sequence: 0 },
    ],
    profiles: [
      { id: 'user-a', display_name: '나' },
      { id: 'user-b', display_name: '친구' },
    ],
    messages: [
      { id: 'm1', conversation_id: 'room', sender_id: 'user-b', sequence: 1, content_type: 'text', body: '첫 메시지', payload: {}, created_at: '2026-09-04T09:10:00Z' },
      { id: 'm2', conversation_id: 'room', sender_id: 'user-b', sequence: 2, content_type: 'text', body: '새 메시지', payload: {}, created_at: '2026-09-04T09:20:00Z' },
    ],
    reactions: [],
    qtSessions: [],
  });
  assert.equal(model.conversations[0].unread, 1);
  assert.equal(model.conversations[0].name, '친구');
});
