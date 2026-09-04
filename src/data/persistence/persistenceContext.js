import { getKeysByAuthority, getPersistencePolicy, keySuffix } from './policyRegistry.js';
import { rawHas, rawRead, rawRemove, rawWrite } from './rawLocalStore.js';

const ACTIVE_USER_KEY = 'bibleon.activePersistenceUserV1';
const INSTALLATION_KEY = 'bibleon.installationIdV1';
const LEGACY_MIGRATION_KEY = 'bibleon.legacyMigrationV1';
const GUEST_MERGE_STATUS_KEY = 'bibleon.guestMergeStatusV1';

let activeUserId = null;
let installationId = null;

function createId(prefix) {
  return globalThis.crypto?.randomUUID?.()
    ? `${prefix}-${globalThis.crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateInstallationId() {
  if (installationId) return installationId;
  installationId = rawRead(INSTALLATION_KEY, '');
  if (!installationId) {
    installationId = createId('install');
    rawWrite(INSTALLATION_KEY, installationId);
  }
  return installationId;
}

export function accountNamespace(userId) {
  return `bibleon.account.${userId}`;
}

export function guestNamespace(id = getOrCreateInstallationId()) {
  return `bibleon.guest.${id}`;
}

export function scopedStorageKey(key, context = {}) {
  const { authority } = getPersistencePolicy(key);
  if (authority === 'device') return key;
  if (authority === 'static' || authority === 'storage') {
    throw new Error(`${authority} 데이터는 로컬 JSON 저장소를 사용할 수 없습니다: ${key}`);
  }

  const userId = context.userId === undefined ? activeUserId : context.userId;
  const namespace = userId
    ? accountNamespace(userId)
    : guestNamespace(context.installationId ?? getOrCreateInstallationId());
  return `${namespace}.${keySuffix(key)}`;
}

export function setActivePersistenceUser(userId) {
  activeUserId = userId || null;
  rawWrite(ACTIVE_USER_KEY, activeUserId);
  return activeUserId;
}

export function getActivePersistenceUser() {
  return activeUserId;
}

export function initializePersistenceScope(userId = null) {
  getOrCreateInstallationId();
  migrateLegacyLocalData();
  setActivePersistenceUser(userId);
  return { userId: activeUserId, installationId };
}

export function migrateLegacyLocalData() {
  const marker = rawRead(LEGACY_MIGRATION_KEY, null);
  if (marker?.version === 1) return marker;

  const guestId = getOrCreateInstallationId();
  const copiedAccountKeys = [];
  const discardedSharedKeys = [];

  for (const key of getKeysByAuthority('account')) {
    if (!rawHas(key)) continue;
    const guestKey = scopedStorageKey(key, { userId: null, installationId: guestId });
    if (!rawHas(guestKey)) rawWrite(guestKey, rawRead(key, null));
    rawRemove(key);
    copiedAccountKeys.push(key);
  }

  for (const key of getKeysByAuthority('shared')) {
    if (!rawHas(key)) continue;
    rawRemove(key);
    discardedSharedKeys.push(key);
  }

  const result = {
    version: 1,
    installationId: guestId,
    copiedAccountKeys,
    discardedSharedKeys,
    migratedAt: new Date().toISOString(),
  };
  rawWrite(LEGACY_MIGRATION_KEY, result);
  return result;
}

export function readGuestMergeStatuses() {
  return rawRead(GUEST_MERGE_STATUS_KEY, {});
}

export function guestMergeStatusKey(userId) {
  return `${userId}:${getOrCreateInstallationId()}`;
}

export function getGuestMergeStatus(userId) {
  return readGuestMergeStatuses()[guestMergeStatusKey(userId)] ?? null;
}

export function setGuestMergeStatus(userId, status) {
  const statuses = readGuestMergeStatuses();
  statuses[guestMergeStatusKey(userId)] = {
    status,
    decidedAt: new Date().toISOString(),
  };
  rawWrite(GUEST_MERGE_STATUS_KEY, statuses);
}

