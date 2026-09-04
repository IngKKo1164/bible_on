import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateLegacyLocalData } from '../../src/data/persistence/persistenceContext.js';

class MemoryLocalStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('legacy personal data moves to guest scope while shared data is discarded', () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: new MemoryLocalStorage({
      'bibleon.installationIdV1': JSON.stringify('test-installation'),
      'bibleon.verseNotes': JSON.stringify({ 'john-1-1': '개인 메모' }),
      'bibleon.churchConversations': JSON.stringify([{ id: 'legacy-room' }]),
    }),
  };

  try {
    const result = migrateLegacyLocalData();
    assert.deepEqual(result.copiedAccountKeys, ['bibleon.verseNotes']);
    assert.deepEqual(result.discardedSharedKeys, ['bibleon.churchConversations']);
    assert.equal(globalThis.window.localStorage.getItem('bibleon.verseNotes'), null);
    assert.equal(globalThis.window.localStorage.getItem('bibleon.churchConversations'), null);
    assert.deepEqual(
      JSON.parse(globalThis.window.localStorage.getItem('bibleon.guest.test-installation.verseNotes')),
      { 'john-1-1': '개인 메모' }
    );
  } finally {
    globalThis.window = previousWindow;
  }
});

