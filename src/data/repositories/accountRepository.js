import { isSupabaseConfigured, requireSupabase, supabase } from '../../lib/supabase.js';
import { getOrCreateInstallationId } from '../persistence/persistenceContext.js';
import {
  completeOutboxMutation,
  enqueueOutboxMutation,
  failOutboxMutation,
  listOutboxMutations,
  markOutboxMutationSyncing,
} from '../persistence/outbox.js';
import { accountCache } from './accountCache.js';

const PROFILE_KEY = 'bibleon.personalProfile';
const PREFERENCE_KEYS = [
  'bibleon.accountOnboardingV1',
  'bibleon.defaultTranslation',
  'bibleon.themePreference',
  'bibleon.themeControlMode',
  'bibleon.darkModeStart',
  'bibleon.darkModeEnd',
];

function remoteAvatarPath(avatarImage) {
  if (!avatarImage || avatarImage.startsWith('data:') || avatarImage.startsWith('blob:')) return null;
  return avatarImage;
}

function profileRow(userId, profile) {
  const nickname = profile.nickname?.trim();
  return {
    id: userId,
    display_name: profile.name?.trim() || '바이블온 사용자',
    nickname: nickname && nickname !== '온유빛' ? nickname : null,
    avatar_path: profile.avatarPath ?? remoteAvatarPath(profile.avatarImage),
    representative_verse_ref: profile.verseRef || null,
    representative_verse_text: profile.representativeVerse || null,
    primary_community_id: profile.primaryCommunityId || null,
    featured_achievement_id: profile.featuredAchievementId || null,
    profile_data: {
      featuredAchievementName: profile.featuredAchievementName || '',
    },
  };
}

function mapProfile(profile) {
  if (!profile) return null;
  return {
    name: profile.display_name,
    nickname: profile.nickname ?? '',
    avatarImage: profile.avatar_path ?? '',
    avatarPath: profile.avatar_path ?? '',
    verseRef: profile.representative_verse_ref ?? '',
    representativeVerse: profile.representative_verse_text ?? '',
    primaryCommunityId: profile.primary_community_id ?? '',
    featuredAchievementId: profile.featured_achievement_id ?? '',
    featuredAchievementName: profile.profile_data?.featuredAchievementName ?? '',
  };
}

function mapPreferences(preferences) {
  if (!preferences) return null;
  return {
    defaultTranslation: preferences.default_translation,
    themePreference: preferences.theme_preference,
    themeControlMode: preferences.theme_control_mode,
    darkModeStart: preferences.dark_mode_start?.slice(0, 5),
    darkModeEnd: preferences.dark_mode_end?.slice(0, 5),
    timezone: preferences.timezone,
    onboarding: preferences.onboarding ?? {},
  };
}

async function currentUser(client) {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user;
}

async function beginMutations(userId, entries, resource) {
  const ids = [];
  for (const [key, payload] of entries) {
    const mutation = await enqueueOutboxMutation({
      userId,
      authority: 'account',
      domain: 'account-foundation',
      resource,
      key,
      payload,
    });
    if (mutation) {
      ids.push(mutation.id);
      await markOutboxMutationSyncing(mutation.id);
    }
  }
  return ids;
}

async function finishMutations(ids, error = null) {
  await Promise.all(ids.map((id) => (
    error ? failOutboxMutation(id, error) : completeOutboxMutation(id)
  )));
}

function buildPreferenceRow(userId, preferences) {
  const row = {
    user_id: userId,
    default_translation: preferences.defaultTranslation ?? 'KRV',
    theme_preference: preferences.themePreference ?? 'light',
    theme_control_mode: preferences.themeControlMode ?? 'always',
    dark_mode_start: preferences.darkModeStart ?? '21:00',
    dark_mode_end: preferences.darkModeEnd ?? '07:00',
    timezone: preferences.timezone ?? 'Asia/Seoul',
  };
  if (preferences.onboarding !== undefined) row.onboarding = preferences.onboarding;
  return row;
}

async function writeOnboarding(client, user, payload) {
  const [profileResult, preferencesResult, deviceResult] = await Promise.all([
    client.from('profiles').upsert(profileRow(user.id, {
      ...payload.profile,
      name: payload.displayName?.trim() || user.user_metadata?.display_name || '바이블온 사용자',
    }), { onConflict: 'id' }),
    client.from('user_preferences').upsert({
      user_id: user.id,
      onboarding: payload.onboarding,
    }, { onConflict: 'user_id' }),
    client.from('device_installations').upsert({
      user_id: user.id,
      installation_id: getOrCreateInstallationId(),
      platform: 'web',
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,installation_id' }),
  ]);
  return profileResult.error || preferencesResult.error || deviceResult.error;
}

async function retryPendingAccountFoundation(client, user) {
  const pending = (await listOutboxMutations(user.id))
    .filter((mutation) => mutation.domain === 'account-foundation');
  const groups = new Map();
  for (const mutation of pending) {
    const group = groups.get(mutation.resource) ?? [];
    group.push(mutation);
    groups.set(mutation.resource, group);
  }

  for (const [resource, mutations] of groups) {
    const ids = mutations.map(({ id }) => id);
    await Promise.all(ids.map(markOutboxMutationSyncing));
    let error = null;
    try {
      const payload = mutations[0].payload;
      if (resource === 'profile') {
        ({ error } = await client.from('profiles').upsert(profileRow(user.id, payload), { onConflict: 'id' }));
      } else if (resource === 'preferences') {
        ({ error } = await client.from('user_preferences').upsert(buildPreferenceRow(user.id, payload), { onConflict: 'user_id' }));
      } else if (resource === 'onboarding') {
        error = await writeOnboarding(client, user, payload);
      }
    } catch (caughtError) {
      error = caughtError;
    }
    await finishMutations(ids, error);
  }
}

async function migrateLocalAccountFoundation(client, user) {
  const migrationKey = 'account-foundation-v1';
  const { data: completedMigration, error: migrationReadError } = await client
    .from('client_migrations')
    .select('migration_key')
    .eq('user_id', user.id)
    .eq('migration_key', migrationKey)
    .maybeSingle();
  if (migrationReadError) throw migrationReadError;
  if (completedMigration) return;

  const [profileResult, preferencesResult] = await Promise.all([
    client.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    client.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (preferencesResult.error) throw preferencesResult.error;

  const localProfile = accountCache.read(PROFILE_KEY, {}, { userId: user.id });
  const localOnboarding = accountCache.read('bibleon.accountOnboardingV1', {}, { userId: user.id });
  const localThemePreference = accountCache.read('bibleon.themePreference', 'light', { userId: user.id });
  const localThemeControlMode = accountCache.read(
    'bibleon.themeControlMode',
    ['system', 'schedule'].includes(localThemePreference) ? localThemePreference : 'always',
    { userId: user.id }
  );
  const remoteProfile = profileResult.data ?? {};
  const remotePreferences = preferencesResult.data ?? {};
  const shouldUseLocalName = !remoteProfile.display_name
    || remoteProfile.display_name === '바이블온 사용자';

  const [profileWrite, preferencesWrite] = await Promise.all([
    client.from('profiles').upsert(profileRow(user.id, {
      name: shouldUseLocalName
        ? (localProfile.name || user.user_metadata?.display_name || '바이블온 사용자')
        : remoteProfile.display_name,
      nickname: remoteProfile.nickname || localProfile.nickname,
      avatarImage: remoteProfile.avatar_path || localProfile.avatarImage,
      verseRef: remoteProfile.representative_verse_ref || localProfile.verseRef,
      representativeVerse: remoteProfile.representative_verse_text || localProfile.representativeVerse,
      primaryCommunityId: remoteProfile.primary_community_id || localProfile.primaryCommunityId,
      featuredAchievementId: remoteProfile.featured_achievement_id || localProfile.featuredAchievementId,
      featuredAchievementName: remoteProfile.profile_data?.featuredAchievementName
        || localProfile.featuredAchievementName,
    }), { onConflict: 'id' }),
    client.from('user_preferences').upsert({
      user_id: user.id,
      default_translation: accountCache.read('bibleon.defaultTranslation', remotePreferences.default_translation || 'KRV', { userId: user.id }),
      theme_preference: accountCache.read('bibleon.themePreference', remotePreferences.theme_preference || 'light', { userId: user.id }),
      theme_control_mode: localThemeControlMode || remotePreferences.theme_control_mode || 'always',
      dark_mode_start: accountCache.read('bibleon.darkModeStart', remotePreferences.dark_mode_start || '21:00', { userId: user.id }),
      dark_mode_end: accountCache.read('bibleon.darkModeEnd', remotePreferences.dark_mode_end || '07:00', { userId: user.id }),
      timezone: remotePreferences.timezone || 'Asia/Seoul',
      onboarding: { ...localOnboarding, ...(remotePreferences.onboarding ?? {}) },
    }, { onConflict: 'user_id' }),
  ]);
  const writeError = profileWrite.error || preferencesWrite.error;
  if (writeError) throw writeError;

  const { error: markerError } = await client.from('client_migrations').upsert({
    user_id: user.id,
    migration_key: migrationKey,
    batch_id: getOrCreateInstallationId(),
  }, { onConflict: 'user_id,migration_key' });
  if (markerError) throw markerError;
}

export const accountRepository = {
  configured: isSupabaseConfigured,

  async loadCurrentAccount() {
    if (!supabase) return null;
    const user = await currentUser(supabase);
    if (!user) return null;
    await migrateLocalAccountFoundation(supabase, user);
    await retryPendingAccountFoundation(supabase, user);

    const [profileResult, preferencesResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (preferencesResult.error) throw preferencesResult.error;

    return {
      user,
      profile: mapProfile(profileResult.data),
      preferences: mapPreferences(preferencesResult.data),
    };
  },

  async saveProfile(profile) {
    if (!supabase) return { mode: 'local' };
    const user = await currentUser(supabase);
    if (!user) return { mode: 'local', reason: 'signed-out' };

    const mutationIds = await beginMutations(user.id, [[PROFILE_KEY, profile]], 'profile');
    let error = null;
    try {
      ({ error } = await supabase.from('profiles').upsert(profileRow(user.id, profile), { onConflict: 'id' }));
    } catch (caughtError) {
      error = caughtError;
    }
    await finishMutations(mutationIds, error);
    if (error) throw error;
    return { mode: 'supabase' };
  },

  async savePreferences(preferences) {
    if (!supabase) return { mode: 'local' };
    const user = await currentUser(supabase);
    if (!user) return { mode: 'local', reason: 'signed-out' };

    const mutationIds = await beginMutations(
      user.id,
      PREFERENCE_KEYS.map((key) => [key, preferences]),
      'preferences'
    );
    let error = null;
    try {
      ({ error } = await supabase
        .from('user_preferences')
        .upsert(buildPreferenceRow(user.id, preferences), { onConflict: 'user_id' }));
    } catch (caughtError) {
      error = caughtError;
    }
    await finishMutations(mutationIds, error);
    if (error) throw error;
    return { mode: 'supabase' };
  },

  async saveOnboarding({ displayName, onboarding, profile = {} }) {
    if (!supabase) return { mode: 'local' };
    const user = await currentUser(supabase);
    if (!user) return { mode: 'local', reason: 'signed-out' };

    const client = requireSupabase();
    const payload = { displayName, onboarding, profile };
    const mutationIds = await beginMutations(user.id, [
      [PROFILE_KEY, payload],
      ...PREFERENCE_KEYS.map((key) => [key, payload]),
    ], 'onboarding');
    let error = null;
    try {
      error = await writeOnboarding(client, user, payload);
    } catch (caughtError) {
      error = caughtError;
    }
    await finishMutations(mutationIds, error);
    if (error) throw error;

    const { error: migrationError } = await client.from('client_migrations').upsert({
      user_id: user.id,
      migration_key: 'account-foundation-v1',
      batch_id: getOrCreateInstallationId(),
    }, { onConflict: 'user_id,migration_key' });
    if (migrationError) throw migrationError;
    return { mode: 'supabase' };
  },

  async retryPendingMutations() {
    if (!supabase) return { mode: 'local' };
    const user = await currentUser(supabase);
    if (!user) return { mode: 'local', reason: 'signed-out' };
    await retryPendingAccountFoundation(supabase, user);
    return { mode: 'supabase' };
  },
};
