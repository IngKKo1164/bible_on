import { createClient } from '@supabase/supabase-js';

const runtimeEnv = import.meta.env ?? {};
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = (
  runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY
  || runtimeEnv.VITE_SUPABASE_ANON_KEY
)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  }
  return supabase;
}
