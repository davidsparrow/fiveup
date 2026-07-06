-- Phase 5c: create the private Storage bucket that backs asset_screenshots.
-- Objects are stored at `<asset-id>/<file>`, and asset_screenshots.storage_path
-- holds that same object name so the read policy can join the two.

insert into storage.buckets (id, name, public)
values ('asset-screenshots', 'asset-screenshots', false)
on conflict (id) do nothing;

-- The uploading member owns their objects (write/read/update/delete). Supabase
-- Storage sets objects.owner to the authenticated uid on upload.
create policy "asset_screenshots_storage_owner_write"
on storage.objects for all
to authenticated
using (bucket_id = 'asset-screenshots' and owner = auth.uid())
with check (bucket_id = 'asset-screenshots' and owner = auth.uid());

-- Anyone who can see the asset (owner, or an 'active' asset) can read its
-- screenshots, matching the asset_screenshots table's own SELECT policy.
create policy "asset_screenshots_storage_read_if_asset_visible"
on storage.objects for select
to authenticated
using (
  bucket_id = 'asset-screenshots'
  and exists (
    select 1
    from public.asset_screenshots ascr
    join public.assets a on a.id = ascr.asset_id
    where ascr.storage_path = storage.objects.name
      and (a.owner_user_id = auth.uid() or a.status = 'active')
  )
);
