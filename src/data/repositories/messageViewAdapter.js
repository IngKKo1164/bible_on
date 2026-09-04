function formatMessageTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(value));
}

function profileToMember(profile, churchMember = null, church = null) {
  return {
    id: profile.id,
    name: profile.display_name,
    nickname: profile.nickname ?? '',
    avatarPath: profile.avatar_path ?? '',
    department: churchMember?.departmentName ?? profile.department_name ?? '',
    role: churchMember?.title || profile.title || (churchMember?.churchRole === 'admin' ? '관리자' : '성도'),
    verseRef: profile.representative_verse_ref ?? '',
    representativeVerse: profile.representative_verse_text ?? '',
    churchId: profile.church_id ?? church?.id ?? null,
    churchName: profile.church_name ?? church?.name ?? '',
    tone: 'violet',
  };
}

export function buildMessageViewModel(bundle, churchWorkspace = null) {
  const profileMap = new Map(bundle.profiles.map((profile) => [profile.id, profile]));
  const departmentMap = new Map((churchWorkspace?.departments ?? []).map((department) => [department.id, department.name]));
  const churchMemberMap = new Map((churchWorkspace?.members ?? []).map((member) => [member.userId, {
    ...member,
    departmentName: departmentMap.get(member.departmentId) ?? '',
  }]));
  const members = bundle.profiles
    .filter(({ id }) => id !== bundle.currentUserId)
    .map((profile) => profileToMember(
      profile,
      churchMemberMap.get(profile.id),
      churchMemberMap.has(profile.id) ? churchWorkspace?.church : null
    ));
  const rosterByConversation = new Map();
  bundle.members.forEach((member) => {
    rosterByConversation.set(member.conversation_id, [
      ...(rosterByConversation.get(member.conversation_id) ?? []), member,
    ]);
  });
  const reactionsByMessage = new Map();
  bundle.reactions.forEach((reaction) => {
    reactionsByMessage.set(reaction.message_id, [
      ...(reactionsByMessage.get(reaction.message_id) ?? []), reaction,
    ]);
  });
  const messagesByConversation = new Map();
  bundle.messages.forEach((row) => {
    const roster = rosterByConversation.get(row.conversation_id) ?? [];
    const sender = profileMap.get(row.sender_id);
    const unreadByCount = roster.filter((member) => (
      member.user_id !== row.sender_id
      && member.visible_from_sequence <= row.sequence
      && member.last_read_sequence < row.sequence
    )).length;
    const payload = row.payload ?? {};
    const message = {
      id: row.id,
      sequence: Number(row.sequence),
      from: row.sender_id === bundle.currentUserId ? 'me' : (row.sender_id ?? 'system'),
      author: sender?.display_name ?? (row.sender_id ? '알 수 없음' : '바이블온'),
      text: row.deleted_for_everyone_at ? '전송을 취소한 메시지입니다.' : row.body,
      time: formatMessageTime(row.created_at),
      unreadByCount,
      type: row.deleted_for_everyone_at ? 'unsent' : row.content_type.replace('_', '-'),
      reaction: reactionsByMessage.get(row.id)?.find(({ user_id }) => user_id === bundle.currentUserId)?.reaction ?? null,
      reactions: reactionsByMessage.get(row.id) ?? [],
    };
    if (row.content_type === 'bible') {
      message.type = 'bible-passage';
      message.referenceLabel = payload.referenceLabel ?? payload.reference ?? '말씀';
      message.passages = payload.passages ?? [];
    }
    if (row.content_type === 'qt_passage') {
      message.type = 'qt-passage';
      message.verse = {
        reference: payload.reference,
        text: payload.text,
        translationId: payload.translationId,
      };
    }
    messagesByConversation.set(row.conversation_id, [
      ...(messagesByConversation.get(row.conversation_id) ?? []), message,
    ]);
  });
  const qtByConversation = new Map(bundle.qtSessions.map((row) => [row.conversation_id, row]));
  const conversations = [];
  const qtRooms = [];
  bundle.conversations.forEach((row) => {
    const roster = rosterByConversation.get(row.id) ?? [];
    const participantIds = roster.map(({ user_id }) => user_id).filter((id) => id !== bundle.currentUserId);
    const participantProfiles = participantIds.map((id) => profileMap.get(id)).filter(Boolean);
    const ownMembership = roster.find(({ user_id }) => user_id === bundle.currentUserId);
    const messages = messagesByConversation.get(row.id) ?? [];
    const lastMessage = messages.at(-1);
    const firstName = participantProfiles.map(({ display_name }) => display_name).sort((a, b) => a.localeCompare(b, 'ko-KR'))[0];
    const name = row.name || (participantIds.length > 1 ? `${firstName} 외 ${participantIds.length - 1}명` : firstName) || '대화방';
    const common = {
      id: row.id,
      name,
      customName: row.name ?? '',
      participantIds,
      participantJoinedAt: Object.fromEntries(roster.map(({ user_id, visible_from_sequence }) => [user_id, Number(visible_from_sequence)])),
      messages,
      lastMessage: lastMessage?.text ?? '',
      time: formatMessageTime(row.updated_at),
      unread: messages.filter(({ sequence }) => sequence > Number(ownMembership?.last_read_sequence ?? 0)).length,
      department: participantIds.length > 1 ? '단체 채팅' : '',
      role: participantIds.length > 1 ? `${participantIds.length + 1}명` : '',
    };
    if (row.kind === 'qt') {
      const qt = qtByConversation.get(row.id);
      qtRooms.push({
        ...common,
        type: 'qt',
        verse: qt ? { reference: qt.verse_ref, text: qt.verse_text, translationId: qt.translation_id } : {},
        createdAt: Date.parse(row.created_at),
      });
    } else {
      conversations.push(common);
    }
  });
  return { members, conversations, qtRooms };
}
