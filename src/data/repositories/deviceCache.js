import { getPersistencePolicy } from '../persistence/policyRegistry.js';
import { rawRead, rawRemove, rawWrite } from '../persistence/rawLocalStore.js';

function assertDeviceKey(key) {
  if (getPersistencePolicy(key).authority !== 'device') {
    throw new Error(`DeviceCache에 저장할 수 없는 키입니다: ${key}`);
  }
}

export const deviceCache = {
  read(key, fallback) {
    assertDeviceKey(key);
    return rawRead(key, fallback);
  },
  write(key, value) {
    assertDeviceKey(key);
    rawWrite(key, value);
  },
  remove(key) {
    assertDeviceKey(key);
    rawRemove(key);
  },
};

