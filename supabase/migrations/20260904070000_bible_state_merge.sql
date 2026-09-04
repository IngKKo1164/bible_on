create or replace function public.merge_user_bible_state(
  incoming_read_verse_ids jsonb,
  incoming_reading_state jsonb,
  incoming_progress_history jsonb,
  incoming_recent_passages jsonb
)
returns public.user_bible_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state public.user_bible_state;
  result_state public.user_bible_state;
  current_cycle bigint;
  incoming_cycle bigint;
  merged_reads jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(incoming_read_verse_ids) <> 'array'
    or jsonb_typeof(incoming_reading_state) <> 'object'
    or jsonb_typeof(incoming_progress_history) <> 'object'
    or jsonb_typeof(incoming_recent_passages) <> 'array' then
    raise exception 'invalid bible state payload';
  end if;

  select * into current_state
  from public.user_bible_state
  where user_id = auth.uid()
  for update;

  if not found then
    insert into public.user_bible_state(
      user_id, read_verse_ids, reading_state, progress_history, recent_passages
    ) values (
      auth.uid(), incoming_read_verse_ids, incoming_reading_state,
      incoming_progress_history, incoming_recent_passages
    ) returning * into result_state;
    return result_state;
  end if;

  current_cycle := coalesce((current_state.reading_state->>'cycle')::bigint, 1);
  incoming_cycle := coalesce((incoming_reading_state->>'cycle')::bigint, 1);

  if incoming_cycle > current_cycle then
    update public.user_bible_state
    set read_verse_ids = incoming_read_verse_ids,
        reading_state = incoming_reading_state,
        progress_history = incoming_progress_history,
        recent_passages = incoming_recent_passages,
        updated_at = now()
    where user_id = auth.uid()
    returning * into result_state;
    return result_state;
  end if;

  if incoming_cycle < current_cycle then return current_state; end if;

  select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
  into merged_reads
  from (
    select distinct value
    from jsonb_array_elements_text(current_state.read_verse_ids || incoming_read_verse_ids)
  ) values_to_merge;

  update public.user_bible_state
  set read_verse_ids = merged_reads,
      reading_state = current_state.reading_state || incoming_reading_state,
      progress_history = jsonb_build_object(
        'cycle', incoming_cycle,
        'points', coalesce(current_state.progress_history->'points', '{}'::jsonb)
          || coalesce(incoming_progress_history->'points', '{}'::jsonb)
      ),
      recent_passages = incoming_recent_passages,
      updated_at = now()
  where user_id = auth.uid()
  returning * into result_state;
  return result_state;
end;
$$;

revoke all on function public.merge_user_bible_state(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.merge_user_bible_state(jsonb, jsonb, jsonb, jsonb) to authenticated;
