import { getPersistencePolicy } from '../persistence/policyRegistry.js';
import { getActivePersistenceUser, scopedStorageKey } from '../persistence/persistenceContext.js';
import { enqueueOutboxMutation } from '../persistence/outbox.js';
import { rawHas, rawRead, rawRemove, rawWrite } from '../persistence/rawLocalStore.js';

function assertAccountKey(key) {
  if (getPersistencePolicy(key).authority !== 'account') {
    throw new Error(`AccountCache에 저장할 수 없는 키입니다: ${key}`);
  }
}

export const accountCache = {
  read(key, fallback, context) {
    assertAccountKey(key);
    return rawRead(scopedStorageKey(key, context), fallback);
  },
  has(key, context) {
    assertAccountKey(key);
    return rawHas(scopedStorageKey(key, context));
  },
  write(key, value, options = {}) {
    assertAccountKey(key);
    rawWrite(scopedStorageKey(key, options.context), value);
    const userId = options.context?.userId ?? getActivePersistenceUser();
    if (userId && options.enqueue === true) {
      void enqueueOutboxMutation({ userId, authority: 'account', key, payload: value });
    }
  },
  remove(key, options = {}) {
    assertAccountKey(key);
    rawRemove(scopedStorageKey(key, options.context));
    const userId = options.context?.userId ?? getActivePersistenceUser();
    if (userId && options.enqueue === true) {
      void enqueueOutboxMutation({ userId, authority: 'account', key, operation: 'delete', payload: null });
    }
  },
};
