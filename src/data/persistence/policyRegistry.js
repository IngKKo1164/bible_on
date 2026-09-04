const ACCOUNT_KEYS = [
  'bibleon.accountOnboardingV1',
  'bibleon.achievementsV1',
  'bibleon.activeHomeChatV1',
  'bibleon.darkModeEnd',
  'bibleon.darkModeStart',
  'bibleon.defaultTranslation',
  'bibleon.highlightedVerses',
  'bibleon.homeChatRoomsV1',
  'bibleon.homeTestMessagesV2',
  'bibleon.lastHighlightStyle',
  'bibleon.memoSortMode',
  'bibleon.personalProfile',
  'bibleon.readingProgressHistoryV1',
  'bibleon.readingStateV1',
  'bibleon.readVerseIdsV2',
  'bibleon.recentPassages',
  'bibleon.themeControlMode',
  'bibleon.themePreference',
  'bibleon.verseNoteConflictsV1',
  'bibleon.verseNoteMeta',
  'bibleon.verseNotes',
];

const SHARED_KEYS = [
  'bibleon.approvedChurchMembers',
  'bibleon.blockedFriendIds',
  'bibleon.churchAdminMemberId',
  'bibleon.churchAnnouncements',
  'bibleon.churchAutoJoin',
  'bibleon.churchConversations',
  'bibleon.churchJoinRequests',
  'bibleon.churchMemberRoles',
  'bibleon.churchProfilesV1',
  'bibleon.currentChurchAccess',
  'bibleon.currentChurchId',
  'bibleon.departmentNodes',
  'bibleon.friendIds',
  'bibleon.qtRooms',
  'bibleon.sentFriendRequestIds',
  'bibleon.versePopularityV1',
  'bibleon.worshipPreparations',
];

const DEVICE_KEYS = [
  'bibleon.activePersistenceUserV1',
  'bibleon.guestMergeStatusV1',
  'bibleon.installationIdV1',
  'bibleon.legacyMigrationV1',
];

export const persistencePolicies = Object.freeze({
  ...Object.fromEntries(ACCOUNT_KEYS.map((key) => [key, Object.freeze({ authority: 'account' })])),
  ...Object.fromEntries(SHARED_KEYS.map((key) => [key, Object.freeze({ authority: 'shared' })])),
  ...Object.fromEntries(DEVICE_KEYS.map((key) => [key, Object.freeze({ authority: 'device' })])),
});

export const persistenceAuthorities = Object.freeze([
  'device',
  'account',
  'shared',
  'storage',
  'static',
]);

export function getPersistencePolicy(key) {
  const policy = persistencePolicies[key];
  if (!policy) {
    throw new Error(`등록되지 않은 저장 키입니다: ${key}`);
  }
  return policy;
}

export function getKeysByAuthority(authority) {
  return Object.entries(persistencePolicies)
    .filter(([, policy]) => policy.authority === authority)
    .map(([key]) => key);
}

export function keySuffix(key) {
  return key.startsWith('bibleon.') ? key.slice('bibleon.'.length) : key;
}
