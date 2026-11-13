-- =========================================================
-- BERX CS2 CREW — Supabase schema
-- Supabase → SQL Editor → New query → энэ файлыг бүхэлд нь paste → Run
-- =========================================================
-- Бүх хүснэгтэд RLS асаалттай, policy байхгүй = browser (publishable key)
-- өгөгдөлд шууд хүрэхгүй. Зөвхөн Vercel function (secret key) уншиж/бичнэ.

create table if not exists users (
  id text primary key,
  nick text not null,
  login text unique,             -- имэйл эсвэл +976 утас
  kind text,                     -- email | phone
  pass_hash text,
  steam_id text unique,
  avatar text default '',        -- URL эсвэл data:image (өөрийн зураг)
  avatar_v bigint default 0,
  bio text default '',
  faceit_nick text default '',
  premier int default 0,
  faceit_elo int default 0,
  live jsonb,                    -- FACEIT/Steam-ээс татсан K/D, WR, HS%...
  stats_source text,
  synced_at bigint,
  is_admin boolean default false,
  created_at bigint not null,
  last_seen bigint
);

create table if not exists availability (
  user_id text references users(id) on delete cascade,
  day text not null,             -- YYYY-MM-DD (Улаанбаатар)
  value text not null,           -- yes | maybe | late | no
  primary key (user_id, day)
);

create table if not exists invites (
  id text primary key,
  type text not null,            -- Premier | FACEIT | LAN
  start_at bigint not null,
  slots int not null default 5,
  map text,
  invited jsonb default '[]',
  message text default '',
  created_by text references users(id) on delete set null,
  status text default 'active',  -- active | cancelled
  created_at bigint not null
);
create index if not exists invites_start_idx on invites (start_at desc);

create table if not exists responses (
  invite_id text references invites(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  answer text not null,
  excuse text,
  updated_at bigint,
  primary key (invite_id, user_id)
);

create table if not exists chat (
  id text primary key,
  user_id text references users(id) on delete cascade,
  text text not null,
  created_at bigint not null
);
create index if not exists chat_created_idx on chat (created_at desc);

create table if not exists memes (
  id text primary key,
  user_id text references users(id) on delete cascade,
  text text default '',
  img text,                      -- data:image (жижгэрүүлсэн)
  has_img boolean default false,
  likes jsonb default '[]',
  created_at bigint not null
);

create table if not exists votes (
  week text not null, award text not null, voter text not null, target text not null,
  primary key (week, award, voter)
);

create table if not exists match_votes (
  match_key text not null, voter text not null, mvp text, bot text,
  primary key (match_key, voter)
);

create table if not exists records (
  week text not null, kind text not null, user_id text not null, n int default 0,
  primary key (week, kind, user_id)
);

create table if not exists notifications (
  id text primary key, text text not null, icon text, link text, created_at bigint not null
);

alter table users enable row level security;
alter table availability enable row level security;
alter table invites enable row level security;
alter table responses enable row level security;
alter table chat enable row level security;
alter table memes enable row level security;
alter table votes enable row level security;
alter table match_votes enable row level security;
alter table records enable row level security;
alter table notifications enable row level security;
