create or replace function public.is_church_member_path(church_path text, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_memberships
    where church_id::text = church_path and user_id = actor and status = 'active'
  );
$$;

create or replace function public.is_church_admin_path(church_path text, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_memberships
    where church_id::text = church_path and user_id = actor
      and status = 'active' and church_role = 'admin'
  );
$$;

create or replace function public.is_conversation_member_path(conversation_path text, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id::text = conversation_path and user_id = actor
  );
$$;

create policy "church members view church media"
on storage.objects for select to authenticated
using (bucket_id = 'church-media' and public.is_church_member_path((storage.foldername(name))[1]));

create policy "church admins upload church media"
on storage.objects for insert to authenticated
with check (bucket_id = 'church-media' and public.is_church_admin_path((storage.foldername(name))[1]));

create policy "church admins update church media"
on storage.objects for update to authenticated
using (bucket_id = 'church-media' and public.is_church_admin_path((storage.foldername(name))[1]))
with check (bucket_id = 'church-media' and public.is_church_admin_path((storage.foldername(name))[1]));

create policy "church admins delete church media"
on storage.objects for delete to authenticated
using (bucket_id = 'church-media' and public.is_church_admin_path((storage.foldername(name))[1]));

create policy "conversation members view attachments"
on storage.objects for select to authenticated
using (bucket_id = 'message-attachments' and public.is_conversation_member_path((storage.foldername(name))[1]));

create policy "conversation members upload attachments"
on storage.objects for insert to authenticated
with check (bucket_id = 'message-attachments' and public.is_conversation_member_path((storage.foldername(name))[1]));

create policy "attachment owners delete files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'message-attachments'
  and owner_id = auth.uid()::text
  and public.is_conversation_member_path((storage.foldername(name))[1])
);

revoke execute on function public.is_church_member_path(text, uuid) from public, anon;
revoke execute on function public.is_church_admin_path(text, uuid) from public, anon;
revoke execute on function public.is_conversation_member_path(text, uuid) from public, anon;

