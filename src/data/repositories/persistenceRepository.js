import { getPersistencePolicy } from '../persistence/policyRegistry.js';
import { accountCache } from './accountCache.js';
import { communityRepository } from './communityRepository.js';
import { deviceCache } from './deviceCache.js';

export function readStoredValue(key, fallback) {
  const { authority } = getPersistencePolicy(key);
  if (authority === 'device') return deviceCache.read(key, fallback);
  if (authority === 'account') return accountCache.read(key, fallback);
  if (authority === 'shared') return communityRepository.readCached(key, fallback);
  throw new Error(`${authority} 데이터는 JSON 캐시로 읽을 수 없습니다: ${key}`);
}

export function writeStoredValue(key, value, options) {
  const { authority } = getPersistencePolicy(key);
  if (authority === 'device') return deviceCache.write(key, value);
  if (authority === 'account') return accountCache.write(key, value, options);
  if (authority === 'shared') return communityRepository.writeCached(key, value, options);
  throw new Error(`${authority} 데이터는 JSON 캐시에 저장할 수 없습니다: ${key}`);
}

export function removeStoredValue(key, options) {
  const { authority } = getPersistencePolicy(key);
  if (authority === 'device') return deviceCache.remove(key);
  if (authority === 'account') return accountCache.remove(key, options);
  if (authority === 'shared') return communityRepository.removeCached(key, options);
  throw new Error(`${authority} 데이터는 JSON 캐시에서 제거할 수 없습니다: ${key}`);
}

