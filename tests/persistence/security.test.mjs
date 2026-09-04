import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateStorageObjectPath } from '../../src/data/repositories/mediaRepository.js';

test('account tables enable RLS and bind writes to auth.uid()', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20260904010000_account_foundation.sql', import.meta.url), 'utf8');
  assert.match(sql, /alter table public\.profiles enable row level security/i);
  assert.match(sql, /alter table public\.user_preferences enable row level security/i);
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = id\)/i);
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
});

test('Plus entitlement is readable by its owner but not client-writable', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20260905010000_plus_entitlements.sql', import.meta.url), 'utf8');
  assert.match(sql, /alter table public\.user_subscriptions enable row level security/i);
  assert.match(sql, /grant select on public\.user_subscriptions to authenticated/i);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)[^;]*user_subscriptions[^;]*authenticated/i);
});

test('community memberships are capped and representative community must be active', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20260905013000_community_model.sql', import.meta.url), 'utf8');
  assert.match(sql, /community_kind in \('church', 'club', 'small_group', 'community'\)/i);
  assert.match(sql, /if active_count >= 3 then/i);
  assert.match(sql, /primary community must be an active membership/i);
  assert.match(sql, /create trigger church_memberships_active_limit/i);
});

test('forged Storage paths are rejected before upload', () => {
  assert.equal(validateStorageObjectPath({
    bucket: 'avatars',
    path: 'user-a/avatar.png',
    userId: 'user-a',
  }), true);
  assert.throws(() => validateStorageObjectPath({
    bucket: 'avatars',
    path: 'user-b/avatar.png',
    userId: 'user-a',
  }), /허용되지 않은 Storage 경로/);
  assert.throws(() => validateStorageObjectPath({
    bucket: 'message-attachments',
    path: 'conversation-b/file.pdf',
    userId: 'user-a',
    conversationIds: ['conversation-a'],
  }), /허용되지 않은 Storage 경로/);
});
