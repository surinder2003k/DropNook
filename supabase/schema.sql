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
  size_bytes  bigint      not null check (size_bytes > 0 and size_bytes <= 52428800),
  storage_key text        not null unique,
  status      text        not null default 'uploaded',
  uploaded_at timestamptz not null default now()
);

create index if not exists file_uploads_uploaded_at_idx
  on public.file_uploads (uploaded_at desc);

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
