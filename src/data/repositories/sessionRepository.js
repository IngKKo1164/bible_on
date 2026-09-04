import { getKeysByAuthority } from '../persistence/policyRegistry.js';
import { clearOutboxForUser } from '../persistence/outbox.js';
import { scopedStorageKey, setActivePersistenceUser } from '../persistence/persistenceContext.js';
import { rawRemove } from '../persistence/rawLocalStore.js';

export async function clearAccountDeviceData(userId) {
  if (!userId) return;
  for (const authority of ['account', 'shared']) {
    for (const key of getKeysByAuthority(authority)) {
      rawRemove(scopedStorageKey(key, { userId }));
    }
  }
  await clearOutboxForUser(userId);
}

export async function finishLogout(userId) {
  await clearAccountDeviceData(userId);
  setActivePersistenceUser(null);
}

