-- ============================================================
-- DropNook — Supabase schema
-- Project: manas-files (kjmkltoobfcywokldbpf, ap-south-1)
-- Run this once in the Supabase SQL Editor (or via psql).
-- ============================================================

-- ---------- 1. Metadata table --------------------------------

create table if not exists public.file_uploads (
  id          uuid primary key default gen_random_uuid(),
  filename    text        not null,
  mime_type   text        not null default 'application/octet-stream',
  size_bytes  bigint      not null check (size_bytes > 0 and size_bytes <= 5368709120),  -- 5 GB single-PUT ceiling
  storage_key text        not null unique,
  status      text        not null default 'uploaded',
  uploaded_at timestamptz not null default now()
);

create index if not exists file_uploads_uploaded_at_idx
  on public.file_uploads (uploaded_at desc);

-- ---------- 1b. Share / access-control columns -------------------
-- Added for the shareable-link features (share slug, password, expiry,
-- max downloads, download counter). Idempotent so re-running is safe.
alter table public.file_uploads
  add column if not exists slug            text,
  add column if not exists password_hash   text,
  add column if not exists expires_at      timestamptz,
  add column if not exists max_downloads   integer,
  add column if not exists download_count  integer not null default 0;

create unique index if not exists file_uploads_slug_key
  on public.file_uploads (slug);

-- Guard rails on the new optional columns.
alter table public.file_uploads
  drop constraint if exists file_uploads_max_downloads_positive;
alter table public.file_uploads
  add constraint file_uploads_max_downloads_positive
  check (max_downloads is null or max_downloads > 0);

-- ---------- 2. Row Level Security -----------------------------
-- The app is intentionally auth-less: RLS is enabled but the
-- policies below are permissive (matching the no-auth UX). The
-- server routes use the service role key, which bypasses RLS
-- anyway; these policies keep the anon key usable for reads.

alter table public.file_uploads enable row level security;

drop policy if exists "public read file_uploads" on public.file_uploads;
create policy "public read file_uploads"
  on public.file_uploads for select
  using (true);

drop policy if exists "public insert file_uploads" on public.file_uploads;
create policy "public insert file_uploads"
  on public.file_uploads for insert
  with check (true);

drop policy if exists "public delete file_uploads" on public.file_uploads;
create policy "public delete file_uploads"
  on public.file_uploads for delete
  using (true);

-- UPDATE is required for the download counter (download_count increments on
-- every download). Without this policy the anon-key updates silently match
-- zero rows, so share limits never trigger.
drop policy if exists "public update file_uploads" on public.file_uploads;
create policy "public update file_uploads"
  on public.file_uploads for update
  using (true)
  with check (true);

-- ---------- 3. Storage bucket ---------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 52428800)  -- 50 MB (Supabase free cap)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- The upload flow uses signed upload URLs (authorized by the
-- token), but these policies keep anon access well-defined too.

drop policy if exists "public upload to uploads" on storage.objects;
create policy "public upload to uploads"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'uploads');

drop policy if exists "public read uploads" on storage.objects;
create policy "public read uploads"
  on storage.objects for select
  to anon
  using (bucket_id = 'uploads');

drop policy if exists "public delete uploads" on storage.objects;
create policy "public delete uploads"
  on storage.objects for delete
  to anon
  using (bucket_id = 'uploads');
