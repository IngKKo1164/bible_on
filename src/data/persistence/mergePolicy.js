function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeById(accountValue, guestValue) {
  const items = [...(Array.isArray(accountValue) ? accountValue : [])];
  const ids = new Set(items.map((item) => item?.id).filter(Boolean));
  for (const item of Array.isArray(guestValue) ? guestValue : []) {
    if (!item?.id || !ids.has(item.id)) items.push(item);
  }
  return items;
}

function mergeRecentPassages(accountValue, guestValue) {
  const items = [...(Array.isArray(accountValue) ? accountValue : [])];
  const seen = new Set(items.map((item) => `${item?.bookId}:${item?.chapter}`));
  for (const item of Array.isArray(guestValue) ? guestValue : []) {
    const id = `${item?.bookId}:${item?.chapter}`;
    if (!seen.has(id)) {
      items.push(item);
      seen.add(id);
    }
  }
  return items.slice(0, 10);
}

export function mergeAccountValue(key, accountValue, guestValue) {
  if (guestValue === undefined || guestValue === null) return accountValue;
  if (accountValue === undefined || accountValue === null) return guestValue;

  if (key === 'bibleon.readVerseIdsV2') {
    return [...new Set([...(Array.isArray(accountValue) ? accountValue : []), ...(Array.isArray(guestValue) ? guestValue : [])])];
  }
  if (key === 'bibleon.achievementsV1' || key === 'bibleon.homeChatRoomsV1') {
    return mergeById(accountValue, guestValue);
  }
  if (key === 'bibleon.recentPassages') return mergeRecentPassages(accountValue, guestValue);
  if (key === 'bibleon.verseNotes') {
    return { ...(isPlainObject(guestValue) ? guestValue : {}), ...(isPlainObject(accountValue) ? accountValue : {}) };
  }
  if (key === 'bibleon.verseNoteMeta' || key === 'bibleon.highlightedVerses') {
    return { ...(isPlainObject(guestValue) ? guestValue : {}), ...(isPlainObject(accountValue) ? accountValue : {}) };
  }
  if (isPlainObject(accountValue) && isPlainObject(guestValue)) {
    return { ...guestValue, ...accountValue };
  }

  // Existing account/server-backed values win for scalar preferences.
  return accountValue;
}

export function reconcileVersionedNote(serverNote, mutation) {
  const currentVersion = serverNote?.version ?? 0;
  if (mutation.baseVersion === currentVersion) {
    return {
      status: 'applied',
      note: {
        text: mutation.text,
        version: currentVersion + 1,
        updatedAt: mutation.updatedAt,
        deviceId: mutation.deviceId,
      },
      conflict: null,
    };
  }
  return {
    status: 'conflict',
    note: serverNote,
    conflict: {
      server: serverNote,
      incoming: mutation,
    },
  };
}

