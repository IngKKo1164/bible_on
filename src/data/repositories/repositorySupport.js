import { requireSupabase } from '../../lib/supabase.js';
import {
  completeOutboxMutation,
  enqueueOutboxMutation,
  failOutboxMutation,
  markOutboxMutationSyncing,
} from '../persistence/outbox.js';

export async function getAuthenticatedContext() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('로그인이 필요합니다.');
  return { client, user: data.user };
}

export async function runAccountMutation({ domain, resource, key, payload, operation = 'put' }, callback) {
  const { client, user } = await getAuthenticatedContext();
  const mutation = await enqueueOutboxMutation({
    userId: user.id,
    authority: 'account',
    domain,
    resource,
    key,
    payload,
    operation,
  });
  if (mutation) await markOutboxMutationSyncing(mutation.id);
  try {
    const result = await callback({ client, user });
    if (mutation) await completeOutboxMutation(mutation.id);
    return result;
  } catch (error) {
    if (mutation) await failOutboxMutation(mutation.id, error);
    throw error;
  }
}

export function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}
