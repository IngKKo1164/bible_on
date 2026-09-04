import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearOutboxForUser,
  completeOutboxMutation,
  enqueueOutboxMutation,
  failOutboxMutation,
  getOutboxSummary,
} from '../../src/data/persistence/outbox.js';

test('offline mutation remains queued and can complete after reconnect', async () => {
  const userId = 'offline-user';
  await clearOutboxForUser(userId);
  const queued = await enqueueOutboxMutation({
    userId,
    authority: 'account',
    key: 'bibleon.personalProfile',
    payload: { name: '김온유' },
  });
  await failOutboxMutation(queued.id, new Error('offline'));
  assert.deepEqual(await getOutboxSummary(userId), { total: 1, pending: 0, syncing: 0, failed: 1 });

  const retried = await enqueueOutboxMutation({
    userId,
    authority: 'account',
    key: 'bibleon.personalProfile',
    payload: { name: '김온유' },
  });
  assert.equal((await getOutboxSummary(userId)).pending, 1);
  await completeOutboxMutation(retried.id);
  assert.equal((await getOutboxSummary(userId)).total, 0);
});

