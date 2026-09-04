import assert from 'node:assert/strict';
import test from 'node:test';
import { scopedStorageKey } from '../../src/data/persistence/persistenceContext.js';

test('two accounts never resolve to the same local cache key', () => {
  const first = scopedStorageKey('bibleon.verseNotes', { userId: 'account-a' });
  const second = scopedStorageKey('bibleon.verseNotes', { userId: 'account-b' });
  assert.equal(first, 'bibleon.account.account-a.verseNotes');
  assert.equal(second, 'bibleon.account.account-b.verseNotes');
  assert.notEqual(first, second);
});

test('guest records are isolated by installation', () => {
  const first = scopedStorageKey('bibleon.readVerseIdsV2', { userId: null, installationId: 'device-a' });
  const second = scopedStorageKey('bibleon.readVerseIdsV2', { userId: null, installationId: 'device-b' });
  assert.equal(first, 'bibleon.guest.device-a.readVerseIdsV2');
  assert.notEqual(first, second);
});

