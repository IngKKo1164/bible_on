import { isSupabaseConfigured, requireSupabase, supabase } from '../../lib/supabase.js';
import { setActivePersistenceUser } from '../persistence/persistenceContext.js';
import { finishLogout } from './sessionRepository.js';

function getRedirectUrl() {
  if (typeof window === 'undefined') return undefined;
  return new URL('/onboarding', window.location.origin).toString();
}

export async function signInWithSocialProvider(provider) {
  if (!isSupabaseConfigured) return { mode: 'preview' };
  const configuredProvider = provider === 'naver'
    ? import.meta.env.VITE_SUPABASE_NAVER_PROVIDER_ID?.trim()
    : provider;
  if (!configuredProvider) throw new Error('네이버 로그인 제공자 설정이 아직 완료되지 않았어요.');

  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: configuredProvider,
    options: { redirectTo: getRedirectUrl(), skipBrowserRedirect: false },
  });
  if (error) throw error;
  return { mode: 'supabase', ...data };
}

export async function linkSocialIdentity(provider) {
  if (!isSupabaseConfigured) return { mode: 'preview' };
  const configuredProvider = provider === 'naver'
    ? import.meta.env.VITE_SUPABASE_NAVER_PROVIDER_ID?.trim()
    : provider;
  if (!configuredProvider) throw new Error('네이버 계정 연동 설정이 아직 완료되지 않았어요.');

  const client = requireSupabase();
  const { data, error } = await client.auth.linkIdentity({
    provider: configuredProvider,
    options: { redirectTo: window.location.href, skipBrowserRedirect: false },
  });
  if (error) throw error;
  return { mode: 'supabase', ...data };
}

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    setActivePersistenceUser(session?.user?.id ?? null);
    callback(event, session);
  });
  return () => data.subscription.unsubscribe();
}

export async function signOutCurrentAccount() {
  if (!supabase) return { mode: 'preview' };
  const session = await getCurrentSession();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  await finishLogout(session?.user?.id);
  return { mode: 'supabase' };
}
