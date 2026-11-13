-- =========================================================
-- 003 — BERX ARENA (CS2 private server) хүснэгтүүд
-- Supabase → SQL Editor → New query → paste → Run (нэг удаа)
-- Одоо байгаа хүснэгт, өгөгдөлд хүрэхгүй.
-- =========================================================

-- Серверийн сүүлийн төлөв (agent 5 секунд тутам илгээнэ)
create table if not exists server_state (
  id text primary key,                 -- 'main'
  data jsonb not null default '{}',    -- map, players, phase, score, address...
  updated_at bigint not null
);

-- Сайт дээр сонгосон баг (SteamID64-аар серверт хэрэгжинэ)
create table if not exists server_teams (
  user_id text primary key references users(id) on delete cascade,
  team text not null check (team in ('CT', 'T', 'SPEC')),
  updated_at bigint not null
);

-- Map санал (хүн бүр 1)
create table if not exists server_votes (
  user_id text primary key references users(id) on delete cascade,
  map text not null,
  updated_at bigint not null
);

-- Admin командын дараалал (agent татаж, RCON-оор гүйцэтгэнэ)
create table if not exists server_commands (
  id text primary key,
  type text not null,
  args jsonb default '{}',
  status text not null default 'pending',  -- pending | sent | done | failed
  created_by text references users(id) on delete set null,
  created_at bigint not null,
  sent_at bigint,
  done_at bigint,
  ok boolean,
  output text
);
create index if not exists server_commands_created_idx on server_commands (created_at desc);

-- Эрх: зөвхөн server (service_role / sb_secret). Browser (anon) хандахгүй.
do $$
declare t text;
begin
  foreach t in array array['server_state','server_teams','server_votes','server_commands'] loop
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
