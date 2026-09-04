create or replace function public.can_view_profile(target_user uuid, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select actor = target_user or (
    not exists (
      select 1 from public.user_blocks
      where (blocker_id = actor and blocked_id = target_user)
         or (blocker_id = target_user and blocked_id = actor)
    ) and (
      exists (
        select 1 from public.friendships
        where status in ('pending', 'accepted')
          and ((requester_id = actor and addressee_id = target_user)
            or (requester_id = target_user and addressee_id = actor))
      ) or exists (
        select 1
        from public.church_memberships mine
        join public.church_memberships theirs on theirs.church_id = mine.church_id
        where mine.user_id = actor and theirs.user_id = target_user
          and mine.status = 'active' and theirs.status = 'active'
      ) or exists (
        select 1
        from public.conversation_members mine
        join public.conversation_members theirs
          on theirs.conversation_id = mine.conversation_id
        where mine.user_id = actor and theirs.user_id = target_user
      )
    )
  );
$$;

create or replace function public.save_verse_note(
  target_verse_id text,
  target_note text,
  expected_version bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_note public.verse_notes;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if nullif(btrim(target_verse_id), '') is null then raise exception 'verse id required'; end if;

  select * into current_note
  from public.verse_notes
  where user_id = auth.uid() and verse_id = target_verse_id
  for update;

  if not found then
    if coalesce(expected_version, 0) <> 0 then
      return jsonb_build_object('status', 'conflict', 'verseId', target_verse_id,
        'note', null, 'version', 0, 'updatedAt', null);
    end if;
    insert into public.verse_notes(user_id, verse_id, note, version)
    values (auth.uid(), target_verse_id, target_note, 1)
    returning * into current_note;
    return jsonb_build_object('status', 'saved', 'verseId', current_note.verse_id,
      'note', current_note.note, 'version', current_note.version,
      'updatedAt', current_note.updated_at);
  end if;

  if current_note.version <> coalesce(expected_version, 0) then
    insert into public.verse_note_conflicts(user_id, verse_id, server_note, incoming_note)
    values (auth.uid(), target_verse_id, current_note.note, target_note);
    return jsonb_build_object('status', 'conflict', 'verseId', current_note.verse_id,
      'note', current_note.note, 'version', current_note.version,
      'updatedAt', current_note.updated_at);
  end if;

  update public.verse_notes
  set note = target_note, version = version + 1, updated_at = now()
  where user_id = auth.uid() and verse_id = target_verse_id
  returning * into current_note;
  return jsonb_build_object('status', 'saved', 'verseId', current_note.verse_id,
    'note', current_note.note, 'version', current_note.version,
    'updatedAt', current_note.updated_at);
end;
$$;

create or replace function public.delete_verse_note(
  target_verse_id text,
  expected_version bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_note public.verse_notes;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into current_note
  from public.verse_notes
  where user_id = auth.uid() and verse_id = target_verse_id
  for update;

  if not found then
    return jsonb_build_object('status', 'deleted', 'verseId', target_verse_id,
      'version', coalesce(expected_version, 0));
  end if;

  if current_note.version <> coalesce(expected_version, 0) then
    insert into public.verse_note_conflicts(user_id, verse_id, server_note, incoming_note)
    values (auth.uid(), target_verse_id, current_note.note, '');
    return jsonb_build_object('status', 'conflict', 'verseId', current_note.verse_id,
      'note', current_note.note, 'version', current_note.version,
      'updatedAt', current_note.updated_at);
  end if;

  delete from public.verse_notes
  where user_id = auth.uid() and verse_id = target_verse_id;
  return jsonb_build_object('status', 'deleted', 'verseId', target_verse_id,
    'version', current_note.version + 1);
end;
$$;

revoke all on function public.save_verse_note(text, text, bigint) from public, anon;
revoke all on function public.delete_verse_note(text, bigint) from public, anon;
grant execute on function public.save_verse_note(text, text, bigint) to authenticated;
grant execute on function public.delete_verse_note(text, bigint) to authenticated;
