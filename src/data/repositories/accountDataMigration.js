import { getKeysByAuthority } from '../persistence/policyRegistry.js';
import {
  getGuestMergeStatus,
  getOrCreateInstallationId,
  scopedStorageKey,
  setGuestMergeStatus,
} from '../persistence/persistenceContext.js';
import { mergeAccountValue } from '../persistence/mergePolicy.js';
import { rawHas, rawRead, rawRemove } from '../persistence/rawLocalStore.js';
import { accountCache } from './accountCache.js';

export function hasGuestAccountData() {
  const installationId = getOrCreateInstallationId();
  return getKeysByAuthority('account').some((key) => rawHas(scopedStorageKey(key, {
    userId: null,
    installationId,
  })));
}

function collectNoteConflicts(accountNotes, guestNotes) {
  if (!accountNotes || !guestNotes) return [];
  return Object.keys(guestNotes).flatMap((verseId) => {
    const accountText = accountNotes[verseId];
    const guestText = guestNotes[verseId];
    if (!accountText || accountText === guestText) return [];
    return [{
      id: `${verseId}:${Date.now()}`,
      verseId,
      accountText,
      guestText,
      detectedAt: new Date().toISOString(),
    }];
  });
}

export function importGuestAccountData(userId) {
  if (!userId) throw new Error('게스트 데이터를 가져오려면 로그인한 사용자 ID가 필요합니다.');
  const installationId = getOrCreateInstallationId();
  const conflicts = [];

  for (const key of getKeysByAuthority('account')) {
    if (key === 'bibleon.verseNoteConflictsV1') continue;
    const guestContext = { userId: null, installationId };
    const guestKey = scopedStorageKey(key, guestContext);
    if (!rawHas(guestKey)) continue;

    const guestValue = rawRead(guestKey, undefined);
    const accountValue = accountCache.read(key, undefined, { userId });
    if (key === 'bibleon.verseNotes') {
      conflicts.push(...collectNoteConflicts(accountValue, guestValue));
    }
    accountCache.write(key, mergeAccountValue(key, accountValue, guestValue), {
      context: { userId },
    });
    rawRemove(guestKey);
  }

  if (conflicts.length) {
    const existing = accountCache.read('bibleon.verseNoteConflictsV1', [], { userId });
    accountCache.write('bibleon.verseNoteConflictsV1', [...existing, ...conflicts], {
      context: { userId },
    });
  }

  setGuestMergeStatus(userId, 'imported');
  return { imported: true, conflicts: conflicts.length };
}

export function keepGuestAccountDataSeparate(userId) {
  setGuestMergeStatus(userId, 'kept-separate');
}

export function shouldAskToImportGuestData(userId) {
  return Boolean(userId) && !getGuestMergeStatus(userId) && hasGuestAccountData();
}

