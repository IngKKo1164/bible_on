import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeAccountValue, reconcileVersionedNote } from '../../src/data/persistence/mergePolicy.js';

test('read progress from two devices is merged without losing verse ids', () => {
  assert.deepEqual(
    mergeAccountValue('bibleon.readVerseIdsV2', ['john-1-1'], ['john-1-2', 'john-1-1']),
    ['john-1-1', 'john-1-2']
  );
});

test('simultaneous note edits preserve a conflict instead of overwriting', () => {
  const server = { text: '첫 번째 기기의 메모', version: 3, deviceId: 'device-a' };
  const result = reconcileVersionedNote(server, {
    text: '두 번째 기기의 메모',
    baseVersion: 2,
    deviceId: 'device-b',
    updatedAt: '2026-09-04T02:00:00.000Z',
  });
  assert.equal(result.status, 'conflict');
  assert.equal(result.note.text, server.text);
  assert.equal(result.conflict.incoming.text, '두 번째 기기의 메모');
});

