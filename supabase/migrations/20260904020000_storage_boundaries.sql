-- Private buckets are created up front. Church and message writes remain denied until
-- their membership tables exist, so a guessed object path never grants access.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('avatars', 'avatars', false, 5242880),
  ('church-media', 'church-media', false, 10485760),
  ('message-attachments', 'message-attachments', false, 26214400)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy "avatar owners can upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar owners can update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar owners can delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "authenticated users can view avatars"
on storage.objects for select
to authenticated
using (bucket_id = 'avatars');

