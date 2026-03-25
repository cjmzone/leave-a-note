-- Leave a Note MVP schema
-- Run this in your Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  note_text text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint posts_note_text_length check (char_length(trim(note_text)) between 1 and 280)
);

create index if not exists posts_created_at_desc_idx
  on public.posts (created_at desc);

create table if not exists public.post_rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  last_post_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint post_rate_limits_ip_hash_last_post_date_unique unique (ip_hash, last_post_date)
);

create index if not exists post_rate_limits_lookup_idx
  on public.post_rate_limits (ip_hash, last_post_date);

-- Storage bucket assumption for uploads:
--   Name: post-images
--   Public: true
-- You can create it in the Supabase Dashboard (Storage -> New bucket).
