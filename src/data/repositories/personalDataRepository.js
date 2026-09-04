import { isSupabaseConfigured } from '../../lib/supabase.js';
import { getAuthenticatedContext, runAccountMutation, throwIfError } from './repositorySupport.js';

const noteVersions = new Map();
const lastNotes = new Map();
const lastHighlights = new Map();

function mapBibleState(row) {
  return {
    readVerseIds: row?.read_verse_ids ?? [],
    readingState: row?.reading_state ?? { cycle: 1, eligible: true },
    readingProgressHistory: row?.progress_history ?? { cycle: 1, points: {} },
    recentPassages: row?.recent_passages ?? [],
  };
}

function mapNotes(rows) {
  const notes = {};
  const metadata = {};
  noteVersions.clear();
  lastNotes.clear();
  for (const row of rows ?? []) {
    notes[row.verse_id] = row.note;
    metadata[row.verse_id] = {
      version: Number(row.version),
      createdAt: Date.parse(row.created_at),
      updatedAt: Date.parse(row.updated_at),
    };
    noteVersions.set(row.verse_id, Number(row.version));
    lastNotes.set(row.verse_id, row.note);
  }
  return { notes, metadata };
}

function mapHighlights(rows) {
  const highlights = {};
  lastHighlights.clear();
  for (const row of rows ?? []) {
    highlights[row.verse_id] = row.style;
    lastHighlights.set(row.verse_id, JSON.stringify(row.style));
  }
  return highlights;
}

export const personalDataRepository = {
  configured: isSupabaseConfigured,

  async loadCurrent() {
    const { client, user } = await getAuthenticatedContext();
    const [bible, notes, conflicts, highlights, achievements, threads] = await Promise.all([
      client.from('user_bible_state').select('*').eq('user_id', user.id).maybeSingle(),
      client.from('verse_notes').select('*').eq('user_id', user.id),
      client.from('verse_note_conflicts').select('*').eq('user_id', user.id).is('resolved_at', null),
      client.from('verse_highlights').select('*').eq('user_id', user.id),
      client.from('user_achievements').select('*').eq('user_id', user.id).order('earned_at'),
      client.from('home_ai_threads').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
    ]);
    [bible, notes, conflicts, highlights, achievements, threads].forEach(throwIfError);
    const noteData = mapNotes(notes.data);
    return {
      hasRemoteData: Boolean(
        bible.data || notes.data?.length || conflicts.data?.length || highlights.data?.length
        || achievements.data?.length || threads.data?.length
      ),
      ...mapBibleState(bible.data),
      verseNotes: noteData.notes,
      verseNoteMeta: noteData.metadata,
      noteConflicts: conflicts.data ?? [],
      verseHighlights: mapHighlights(highlights.data),
      achievements: (achievements.data ?? []).map((row) => ({
        id: row.achievement_id,
        type: row.achievement_type,
        name: row.name,
        earnedAt: Date.parse(row.earned_at),
        ...(row.metadata ?? {}),
      })),
      homeChatRooms: (threads.data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        messages: row.messages,
        createdAt: Date.parse(row.created_at),
        updatedAt: Date.parse(row.updated_at),
        deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
      })),
    };
  },

  saveBibleState(state) {
    return runAccountMutation({
      domain: 'personal-data', resource: 'bible-state', key: 'bibleon.readVerseIdsV2', payload: state,
    }, async ({ client }) => {
      const result = await client.rpc('merge_user_bible_state', {
        incoming_read_verse_ids: state.readVerseIds,
        incoming_reading_state: state.readingState,
        incoming_progress_history: state.readingProgressHistory,
        incoming_recent_passages: state.recentPassages,
      });
      return mapBibleState(throwIfError(result));
    });
  },

  async syncNotes(notes) {
    const changedIds = new Set([
      ...Object.keys(notes),
      ...lastNotes.keys(),
    ]);
    const results = [];
    for (const verseId of changedIds) {
      const note = notes[verseId];
      if (note !== undefined && lastNotes.get(verseId) === note) continue;
      if (note === undefined && !lastNotes.has(verseId)) continue;
      const expectedVersion = noteVersions.get(verseId) ?? 0;
      const result = await runAccountMutation({
        domain: 'personal-data', resource: 'verse-note', key: `bibleon.verseNotes:${verseId}`,
        payload: { verseId, note: note ?? '', expectedVersion }, operation: note === undefined ? 'delete' : 'put',
      }, async ({ client }) => {
        const response = note === undefined
          ? await client.rpc('delete_verse_note', { target_verse_id: verseId, expected_version: expectedVersion })
          : await client.rpc('save_verse_note', { target_verse_id: verseId, target_note: note, expected_version: expectedVersion });
        return throwIfError(response);
      });
      results.push(result);
      if (result.status === 'conflict') {
        noteVersions.set(verseId, Number(result.version));
        if (result.note == null) lastNotes.delete(verseId);
        else lastNotes.set(verseId, result.note);
        continue;
      }
      if (note === undefined) {
        noteVersions.delete(verseId);
        lastNotes.delete(verseId);
      } else {
        noteVersions.set(verseId, Number(result.version));
        lastNotes.set(verseId, note);
      }
    }
    return results;
  },

  async syncHighlights(highlights) {
    const currentIds = new Set(Object.keys(highlights));
    const rows = Object.entries(highlights)
      .filter(([verseId, style]) => lastHighlights.get(verseId) !== JSON.stringify(style))
      .map(([verseId, style]) => ({ verse_id: verseId, style }));
    const removedIds = [...lastHighlights.keys()].filter((verseId) => !currentIds.has(verseId));
    if (!rows.length && !removedIds.length) return;
    await runAccountMutation({
      domain: 'personal-data', resource: 'verse-highlights', key: 'bibleon.highlightedVerses', payload: highlights,
    }, async ({ client, user }) => {
      if (rows.length) throwIfError(await client.from('verse_highlights').upsert(
        rows.map((row) => ({ ...row, user_id: user.id, updated_at: new Date().toISOString() })),
        { onConflict: 'user_id,verse_id' }
      ));
      if (removedIds.length) throwIfError(await client.from('verse_highlights')
        .delete().eq('user_id', user.id).in('verse_id', removedIds));
    });
    lastHighlights.clear();
    Object.entries(highlights).forEach(([id, style]) => lastHighlights.set(id, JSON.stringify(style)));
  },

  syncAchievements(achievements) {
    return runAccountMutation({
      domain: 'personal-data', resource: 'achievements', key: 'bibleon.achievementsV1', payload: achievements,
    }, async ({ client, user }) => {
      if (!achievements.length) return;
      throwIfError(await client.from('user_achievements').upsert(achievements.map((item) => ({
        user_id: user.id,
        achievement_id: item.id,
        achievement_type: item.type,
        name: item.name,
        earned_at: new Date(item.earnedAt).toISOString(),
        metadata: Object.fromEntries(Object.entries(item).filter(([key]) => !['id', 'type', 'name', 'earnedAt'].includes(key))),
      })), { onConflict: 'user_id,achievement_id' }));
    });
  },

  syncHomeChatRooms(rooms) {
    return runAccountMutation({
      domain: 'personal-data', resource: 'home-ai-threads', key: 'bibleon.homeChatRoomsV1', payload: rooms,
    }, async ({ client, user }) => {
      if (!rooms.length) return;
      throwIfError(await client.from('home_ai_threads').upsert(rooms.map((room) => ({
        id: room.id,
        user_id: user.id,
        title: room.title || '새 대화',
        messages: room.messages ?? [],
        deleted_at: room.deletedAt ? new Date(room.deletedAt).toISOString() : null,
        created_at: new Date(room.createdAt || Date.now()).toISOString(),
        updated_at: new Date(room.updatedAt || Date.now()).toISOString(),
      })), { onConflict: 'id' }));
    });
  },
};
