import { isSupabaseConfigured, supabase } from '../../lib/supabase.js';

const FREE_PLAN = Object.freeze({
  plan: 'free',
  status: 'inactive',
  currentPeriodEnd: null,
});

function mapSubscription(row) {
  if (!row) return FREE_PLAN;
  const periodEnd = row.current_period_end ? Date.parse(row.current_period_end) : null;
  const activeStatus = row.status === 'active' || row.status === 'trialing';
  const periodActive = !periodEnd || periodEnd > Date.now();
  return {
    plan: row.plan === 'plus' && activeStatus && periodActive ? 'plus' : 'free',
    status: row.status,
    currentPeriodEnd: row.current_period_end ?? null,
  };
}

export const subscriptionRepository = {
  configured: isSupabaseConfigured,

  async loadCurrent() {
    if (!supabase) return FREE_PLAN;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) return FREE_PLAN;

    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('plan,status,current_period_end')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (error) throw error;
    return mapSubscription(data);
  },
};

