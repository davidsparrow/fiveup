-- Phase 5c: create the private Storage bucket that backs asset_screenshots.
-- Objects are stored at `<asset-id>/<file>`, and asset_screenshots.storage_path
-- holds that same object name so the read policy can join the two.
--
-- Guarded on `storage.buckets` existing, which is not a hypothetical. This is
-- the only migration in the repo that touches the `storage` schema, and it is
-- the one that made `supabase db diff` impossible: the CLI builds its shadow
-- database without the Storage service, so the shadow has an empty `storage`
-- schema owned by `supabase_storage_admin` — no `buckets`, no `objects`, and
-- no way for the migrating role to create them (it cannot `set role` to that
-- owner either). Replaying this file there failed with
-- `relation "storage.buckets" does not exist`, which stopped the replay at
-- migration 8 of 42 and meant the independent cross-check could not run at all
-- without holding this file aside by hand.
--
-- So the guard is not defensive clutter — it is what makes the whole migration
-- set replayable into a bare Postgres, which is the only way `db diff` can
-- offer a second opinion. The DDL below is plain, not dynamic `execute`:
-- PL/pgSQL binds SQL statements lazily, so statements in a branch that is
-- never taken are never parsed against the missing tables, and the audit's
-- `create policy` parser still reads them straight out of the file.
--
-- `drop policy if exists` before each `create policy` makes the file
-- re-runnable against a database that already has it. The whole block is one
-- transaction, so there is no window where a policy is missing.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice
      'storage schema has no buckets table (shadow database?) — skipping the asset-screenshots bucket and its policies';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('asset-screenshots', 'asset-screenshots', false)
  on conflict (id) do nothing;

  -- The uploading member owns their objects (write/read/update/delete).
  -- Supabase Storage sets objects.owner to the authenticated uid on upload.
  drop policy if exists "asset_screenshots_storage_owner_write" on storage.objects;
  create policy "asset_screenshots_storage_owner_write"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'asset-screenshots' and owner = auth.uid())
  with check (bucket_id = 'asset-screenshots' and owner = auth.uid());

  -- Anyone who can see the asset (owner, or an 'active' asset) can read its
  -- screenshots, matching the asset_screenshots table's own SELECT policy.
  drop policy if exists "asset_screenshots_storage_read_if_asset_visible" on storage.objects;
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
end $$;
