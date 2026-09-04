import { isSupabaseConfigured } from '../../lib/supabase.js';
import { getAuthenticatedContext, throwIfError } from './repositorySupport.js';

function mapProfile(row) {
  return row ? {
    id: row.id,
    name: row.display_name,
    nickname: row.nickname ?? '',
    avatarPath: row.avatar_path ?? '',
    verseRef: row.representative_verse_ref ?? '',
    representativeVerse: row.representative_verse_text ?? '',
  } : null;
}

function mapChurch(row) {
  return row ? {
    id: row.id,
    name: row.name,
    profileImagePath: row.profile_image_path ?? '',
    verseRef: row.representative_verse_ref ?? '',
    representativeVerse: row.representative_verse_text ?? '',
    autoJoin: row.auto_join,
    active: row.active,
  } : null;
}

export const churchRepository = {
  configured: isSupabaseConfigured,

  async search(query) {
    const { client } = await getAuthenticatedContext();
    const normalized = query.trim().replace(/[%_]/g, '');
    if (!normalized) return [];
    const result = await client.from('churches').select('*')
      .ilike('normalized_name', `%${normalized.toLowerCase()}%`).eq('active', true).limit(12);
    return throwIfError(result).map(mapChurch);
  },

  async loadWorkspace(preferredChurchId = null) {
    const { client, user } = await getAuthenticatedContext();
    const membershipResult = await client.from('church_memberships').select('*')
      .eq('user_id', user.id).in('status', ['active', 'pending']).order('joined_at', { ascending: false });
    const memberships = throwIfError(membershipResult);
    const activeMemberships = memberships.filter(({ status }) => status === 'active');
    const membership = activeMemberships.find(({ church_id }) => church_id === preferredChurchId)
      ?? activeMemberships[0] ?? null;
    if (!membership) return { church: null, membership: null, pendingMemberships: memberships, departments: [], members: [], announcements: [], worshipServices: [] };

    const churchId = membership.church_id;
    const [church, departments, memberRows, assignments, managers, announcements, worship] = await Promise.all([
      client.from('churches').select('*').eq('id', churchId).single(),
      client.from('departments').select('*').eq('church_id', churchId).order('depth').order('created_at'),
      client.from('church_memberships').select('*').eq('church_id', churchId).eq('status', 'active'),
      client.from('department_members').select('*').eq('church_id', churchId),
      client.from('department_managers').select('*').eq('church_id', churchId),
      client.from('church_announcements').select('*').eq('church_id', churchId).order('created_at', { ascending: false }),
      client.from('worship_services').select('*').eq('church_id', churchId).order('service_at', { ascending: true, nullsFirst: false }),
    ]);
    [church, departments, memberRows, assignments, managers, announcements, worship].forEach(throwIfError);
    const userIds = memberRows.data.map(({ user_id }) => user_id);
    const profileResult = userIds.length
      ? await client.from('profiles').select('*').in('id', userIds)
      : { data: [], error: null };
    const profiles = new Map(throwIfError(profileResult).map((profile) => [profile.id, mapProfile(profile)]));
    const assignmentsByUser = new Map(assignments.data.map((row) => [row.user_id, row]));
    const managerDepartments = new Map();
    managers.data.forEach((row) => managerDepartments.set(row.user_id, [...(managerDepartments.get(row.user_id) ?? []), row.department_id]));
    return {
      church: mapChurch(church.data),
      membership,
      pendingMemberships: memberships.filter(({ status }) => status === 'pending'),
      departments: departments.data.map((row) => ({ ...row, parentId: row.parent_id, churchId: row.church_id })),
      members: memberRows.data.map((row) => ({
        ...profiles.get(row.user_id),
        userId: row.user_id,
        churchRole: row.church_role,
        title: row.title ?? '',
        departmentId: assignmentsByUser.get(row.user_id)?.department_id ?? null,
        managedDepartmentIds: managerDepartments.get(row.user_id) ?? [],
      })),
      announcements: announcements.data,
      worshipServices: worship.data,
    };
  },

  async create(name) {
    const { client } = await getAuthenticatedContext();
    return throwIfError(await client.rpc('create_church', {
      church_name: name.trim(), normalized_church_name: name.trim().toLowerCase(),
    }));
  },

  async requestMembership(churchId) {
    const { client } = await getAuthenticatedContext();
    return throwIfError(await client.rpc('request_church_membership', { target_church: churchId }));
  },

  async respondMembership(churchId, userId, accept) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('respond_church_membership', {
      target_church: churchId, target_user: userId, accept_request: accept,
    }));
  },

  async leave(churchId) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('leave_church', { target_church: churchId }));
  },

  async transferAdmin(churchId, userId) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('transfer_church_admin', { target_church: churchId, target_user: userId }));
  },

  async saveProfile(churchId, profile) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.from('churches').update({
      name: profile.name,
      normalized_name: profile.name.trim().toLowerCase(),
      profile_image_path: profile.profileImagePath || null,
      representative_verse_ref: profile.verseRef || null,
      representative_verse_text: profile.representativeVerse || null,
      auto_join: Boolean(profile.autoJoin),
      updated_at: new Date().toISOString(),
    }).eq('id', churchId));
  },

  async createDepartment(churchId, parentId, name) {
    const { client, user } = await getAuthenticatedContext();
    return throwIfError(await client.from('departments').insert({
      church_id: churchId, parent_id: parentId, name: name.trim(), created_by: user.id,
    }).select().single());
  },

  async deleteDepartment(departmentId) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('delete_department', { target_department: departmentId }));
  },

  async moveMembers(userIds, departmentId) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('move_department_members', {
      target_user_ids: userIds, destination_department: departmentId,
    }));
  },

  async setMemberTitle(churchId, userId, title) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('set_church_member_title', {
      target_church: churchId, target_user: userId, target_title: title,
    }));
  },

  async removeMember(churchId, userId) {
    const { client } = await getAuthenticatedContext();
    throwIfError(await client.rpc('remove_church_member', { target_church: churchId, target_user: userId }));
  },

  async saveAnnouncement(churchId, announcement) {
    const { client, user } = await getAuthenticatedContext();
    const row = {
      church_id: churchId,
      visibility_department_id: announcement.departmentId || null,
      title: announcement.title.trim(), content: announcement.content,
      created_by: user.id, updated_at: new Date().toISOString(),
    };
    if (announcement.id) row.id = announcement.id;
    return throwIfError(await client.from('church_announcements').upsert(row).select().single());
  },

  async saveWorshipService(churchId, service) {
    const { client, user } = await getAuthenticatedContext();
    const row = {
      church_id: churchId,
      visibility_department_id: service.departmentId || null,
      status: service.status ?? 'pending', title: service.title.trim(),
      service_at: service.serviceAt || null, core_verse_ref: service.coreVerseRef,
      support_verse_ref: service.supportVerseRef || null, hymn: service.hymn || null,
      description: service.description || null, pastor: service.pastor || null,
      created_by: user.id, updated_at: new Date().toISOString(),
    };
    if (service.id) row.id = service.id;
    return throwIfError(await client.from('worship_services').upsert(row).select().single());
  },

  subscribe(churchId, onChange) {
    if (!churchId) return () => {};
    let channel;
    getAuthenticatedContext().then(({ client }) => {
      channel = client.channel(`church:${churchId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'church_announcements', filter: `church_id=eq.${churchId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'worship_services', filter: `church_id=eq.${churchId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'church_memberships', filter: `church_id=eq.${churchId}` }, onChange)
        .subscribe();
    }).catch(() => {});
    return () => { if (channel) void channel.unsubscribe(); };
  },
};
