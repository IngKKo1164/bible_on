import { isSupabaseConfigured } from '../../lib/supabase.js';
import { getAuthenticatedContext, throwIfError } from './repositorySupport.js';

export const messageRepository = {
  configured: isSupabaseConfigured,

  async loadCurrent() {
    const { client, user } = await getAuthenticatedContext();
    const ownMembershipResult = await client.from('conversation_members').select('*').eq('user_id', user.id);
    const ownMemberships = throwIfError(ownMembershipResult);
    const conversationIds = ownMemberships.map(({ conversation_id }) => conversation_id);
    if (!conversationIds.length) return { conversations: [], members: [], profiles: [], messages: [], reactions: [], qtSessions: [] };
    const [conversations, members, messages, qtSessions] = await Promise.all([
      client.from('conversations').select('*').in('id', conversationIds).order('updated_at', { ascending: false }),
      client.from('conversation_members').select('*').in('conversation_id', conversationIds),
      client.from('messages').select('*').in('conversation_id', conversationIds).order('sequence'),
      client.from('qt_sessions').select('*').in('conversation_id', conversationIds),
    ]);
    [conversations, members, messages, qtSessions].forEach(throwIfError);
    const profileIds = [...new Set(members.data.map(({ user_id }) => user_id))];
    const messageIds = messages.data.map(({ id }) => id);
    const [profiles, reactions] = await Promise.all([
      profileIds.length ? client.rpc('get_visible_profile_cards', { target_user_ids: profileIds }) : Promise.resolve({ data: [], error: null }),
      messageIds.length ? client.from('message_reactions').select('*').in('message_id', messageIds) : Promise.resolve({ data: [], error: null }),
    ]);
    return {
      currentUserId: user.id,
      conversations: conversations.data,
      members: members.data,
      profiles: throwIfError(profiles),
      messages: messages.data,
      reactions: throwIfError(reactions),
      qtSessions: qtSessions.data,
    };
  },

  async create({ kind = 'direct', name = null, churchId = null, memberIds }) {
    const { client } = await getAuthenticatedContext();
    return throwIfError(await client.rpc('create_conversation', {
      conversation_kind: kind, conversation_name: name, target_church: churchId,
      member_ids: memberIds,
    }));
  },

  async invite(conversationId, memberIds) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('invite_conversation_members', {
      target_conversation: conversationId, member_ids: memberIds,
    }));
  },

  async send(conversationId, { type = 'text', body = '', payload = {} }) {
    const { client } = await getAuthenticatedContext();
    return throwIfError(await client.rpc('send_message', {
      target_conversation: conversationId, message_type: type,
      message_body: body, message_payload: payload,
    }));
  },

  async markRead(conversationId, sequence) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('mark_conversation_read', {
      target_conversation: conversationId, read_sequence: sequence,
    }));
  },

  async react(messageId, reaction) {
    const { client, user } = await getAuthenticatedContext();
    throwIfError(await client.from('message_reactions').delete()
      .eq('message_id', messageId).eq('user_id', user.id));
    if (reaction) throwIfError(await client.from('message_reactions').insert({
      message_id: messageId, user_id: user.id, reaction,
    }));
  },

  async deleteForMe(messageIds) {
    const { client, user } = await getAuthenticatedContext();
    throwIfError(await client.from('message_user_deletions').upsert(messageIds.map((messageId) => ({
      message_id: messageId, user_id: user.id,
    }))));
  },

  async cancel(messageId) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('cancel_message', { target_message: messageId }));
  },

  async createQt({ conversationId = null, name = null, churchId = null, memberIds, verseRef, verseText, translationId }) {
    const { client } = await getAuthenticatedContext();
    let resolvedConversationId = conversationId;
    if (!resolvedConversationId) {
      resolvedConversationId = throwIfError(await client.rpc('create_conversation', {
        conversation_kind: 'qt', conversation_name: name, target_church: churchId,
        member_ids: memberIds,
      }));
    }
    return throwIfError(await client.rpc('create_qt_session', {
      target_conversation: resolvedConversationId,
      target_verse_ref: verseRef,
      target_verse_text: verseText,
      target_translation: translationId,
    }));
  },

  subscribe(conversationIds, onChange) {
    if (!conversationIds?.length) return () => {};
    let channel;
    getAuthenticatedContext().then(({ client }) => {
      channel = client.channel(`messages:${conversationIds.slice().sort().join(',')}`);
      for (const id of conversationIds) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, onChange);
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${id}` }, onChange);
      }
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, onChange).subscribe();
    }).catch(() => {});
    return () => { if (channel) void channel.unsubscribe(); };
  },
};
