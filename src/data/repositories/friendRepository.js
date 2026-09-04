import { isSupabaseConfigured } from '../../lib/supabase.js';
import { getAuthenticatedContext, throwIfError } from './repositorySupport.js';

export const friendRepository = {
  configured: isSupabaseConfigured,

  async findByNickname(nickname) {
    const { client } = await getAuthenticatedContext();
    return throwIfError(await client.rpc('find_profile_by_nickname', { target_nickname: nickname.trim() }))?.[0] ?? null;
  },

  async list() {
    const { client, user } = await getAuthenticatedContext();
    const friendshipResult = await client.from('friendships').select('*')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    const friendships = throwIfError(friendshipResult);
    const otherIds = [...new Set(friendships.map((row) => row.requester_id === user.id ? row.addressee_id : row.requester_id))];
    const profilesResult = otherIds.length
      ? await client.rpc('get_visible_profile_cards', { target_user_ids: otherIds })
      : { data: [], error: null };
    const profiles = new Map(throwIfError(profilesResult).map((row) => [row.id, row]));
    return friendships.map((row) => ({
      ...row,
      direction: row.requester_id === user.id ? 'sent' : 'received',
      profile: profiles.get(row.requester_id === user.id ? row.addressee_id : row.requester_id) ?? null,
    }));
  },

  async request(userId) {
    const { client } = await getAuthenticatedContext();
    return throwIfError(await client.rpc('request_friendship', { target_user: userId }));
  },

  async respond(friendshipId, accept) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('respond_friend_request', {
      friendship_id: friendshipId, accept_request: accept,
    }));
  },

  async remove(friendshipId) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.from('friendships').delete().eq('id', friendshipId));
  },

  async removeWithUser(userId) {
    const { client, user } = await getAuthenticatedContext();
    const match = throwIfError(await client.from('friendships').select('id')
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
      .maybeSingle());
    if (match) throwIfError(await client.from('friendships').delete().eq('id', match.id));
  },

  async block(userId) {
    const { client, user } = await getAuthenticatedContext();
    throwIfError(await client.from('user_blocks').upsert({ blocker_id: user.id, blocked_id: userId }));
  },

  async unblock(userId) {
    const { client, user } = await getAuthenticatedContext();
    throwIfError(await client.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', userId));
  },
};
