import { getPersistencePolicy } from '../persistence/policyRegistry.js';
import { getActivePersistenceUser, scopedStorageKey } from '../persistence/persistenceContext.js';
import { enqueueOutboxMutation } from '../persistence/outbox.js';
import { rawRead, rawRemove, rawWrite } from '../persistence/rawLocalStore.js';

function assertSharedKey(key) {
  if (getPersistencePolicy(key).authority !== 'shared') {
    throw new Error(`CommunityRepository에 저장할 수 없는 키입니다: ${key}`);
  }
}

export const communityRepository = {
  readCached(key, fallback, context) {
    assertSharedKey(key);
    return rawRead(scopedStorageKey(key, context), fallback);
  },
  writeCached(key, value, options = {}) {
    assertSharedKey(key);
    rawWrite(scopedStorageKey(key, options.context), value);
    const userId = options.context?.userId ?? getActivePersistenceUser();
    if (userId && options.enqueue === true) {
      void enqueueOutboxMutation({ userId, authority: 'shared', key, payload: value });
    }
  },
  removeCached(key, options = {}) {
    assertSharedKey(key);
    rawRemove(scopedStorageKey(key, options.context));
    const userId = options.context?.userId ?? getActivePersistenceUser();
    if (userId && options.enqueue === true) {
      void enqueueOutboxMutation({ userId, authority: 'shared', key, operation: 'delete', payload: null });
    }
  },
};
