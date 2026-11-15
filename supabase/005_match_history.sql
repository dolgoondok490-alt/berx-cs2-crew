-- =========================================================
-- 005 — BERX MATCH HISTORY (нэмэлт, additive migration)
-- Supabase → SQL Editor → New query → paste → Run (нэг удаа)
-- Одоо байгаа хүснэгт, өгөгдөлд (users, skin_*, server_*, ...) ОГТ хүрэхгүй.
-- Дахин ажиллуулахад аюулгүй (idempotent). Буцаах: 005_match_history_rollback.sql
-- =========================================================
-- Албан ёсны дүнг зөвхөн итгэмжлэгдсэн сервер (BERX Agent → Vercel function, service_role) бичнэ.
-- Browser (anon/authenticated) эдгээр хүснэгтэд шууд хандахгүй: RLS асаалттай + policy байхгүй.
-- Цаг: бусад хүснэгтийн адил Unix milliseconds (bigint).

create table if not exists berx_matches (
  id             text primary key check (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  revision       int  not null default 1 check (revision between 1 and 1000),
  server_id      text not null check (server_id ~ '^[a-z0-9_-]{1,32}$'),
  source         text not null check (source in ('matchzy', 'cs2log')),
  external_ref   text check (external_ref is null or length(external_ref) <= 64),   -- ж: matchzy:12:0 (MatchZy matchid:map_number)
  agent_version  text check (agent_version is null or length(agent_version) <= 16),
  mode           text not null check (mode in ('competitive', 'aim1v1', 'aim2v2')),
  -- Ирээдүйн (ELO, Ranked/Casual, Season, Tournament) — Phase 1/2-д ашиглахгүй, ELO олгохгүй
  match_type     text not null default 'casual' check (match_type in ('casual', 'ranked', 'tournament')),
  season_id      text,
  map            text not null check (map ~ '^[a-z0-9_]{1,64}$'),
  workshop_id    text check (workshop_id is null or workshop_id ~ '^[0-9]{6,12}$'),
  aim_weapon     text check (aim_weapon is null or aim_weapon in ('ak47', 'm4a4', 'm4a1s', 'awp')),
  target_rounds  int  check (target_rounds is null or target_rounds between 1 and 99),
  status         text not null check (status in ('completed', 'aborted', 'interrupted')),
  status_reason  text check (status_reason is null or length(status_reason) <= 64),
  started_at     bigint not null,
  ended_at       bigint not null,
  duration_s     int  not null check (duration_s between 0 and 86400),
  rounds_played  int  not null check (rounds_played between 0 and 200),
  score_ct       int  not null check (score_ct between 0 and 99),     -- эцсийн талаар (CT/T)
  score_t        int  not null check (score_t between 0 and 99),
  winner         text check (winner is null or winner in ('CT', 'T', 'draw')),
  player_count   int  not null check (player_count between 0 and 20),
  has_damage     boolean not null default false,                       -- ADR найдвартай бүртгэгдсэн эсэх
  has_mvp        boolean not null default false,                       -- MVP найдвартай бүртгэгдсэн эсэх
  ingested_at    bigint not null,
  updated_at     bigint not null,
  check (ended_at >= started_at),
  check (status <> 'completed' or winner is not null),
  -- нэг сервер дээр нэг агшинд хоёр тоглолт эхлэхгүй → өөр id-тай давхардлыг хаана
  unique (server_id, started_at)
);
create index if not exists berx_matches_started_idx on berx_matches (started_at desc);
create index if not exists berx_matches_mode_started_idx on berx_matches (mode, started_at desc);

create table if not exists berx_match_players (
  match_id         text not null references berx_matches(id) on delete cascade,
  steam_id         text not null check (steam_id ~ '^7656119[0-9]{10}$'),   -- тогтвортой ID (нэр биш)
  name             text not null default '' check (length(name) <= 64),     -- зөвхөн харуулах
  team             text not null check (team in ('CT', 'T')),                -- тоглолтын төгсгөл дэх тал
  kills            int not null default 0 check (kills between 0 and 500),
  deaths           int not null default 0 check (deaths between 0 and 500),
  assists          int not null default 0 check (assists between 0 and 500),
  headshot_kills   int not null default 0 check (headshot_kills between 0 and 500),
  team_kills       int not null default 0 check (team_kills between 0 and 500),
  suicides         int not null default 0 check (suicides between 0 and 500),
  damage           int check (damage is null or damage between 0 and 100000),   -- null = бүртгэгдээгүй
  mvp              int check (mvp is null or mvp between 0 and 200),            -- null = бүртгэгдээгүй
  rounds_played    int not null default 0 check (rounds_played between 0 and 200),
  connected_at_end boolean not null default true,
  result           text check (result is null or result in ('win', 'loss', 'draw')),   -- зөвхөн completed
  -- профайлын хурдан query-д зориулсан хуулбар (berx_matches-аас)
  mode             text not null,
  status           text not null,
  started_at       bigint not null,
  check (headshot_kills <= kills),
  primary key (match_id, steam_id)
);
create index if not exists berx_match_players_steam_idx on berx_match_players (steam_id, started_at desc);

-- ---------- Ingest (transaction + idempotent) ----------
-- Нэг дуудлага = нэг transaction: тоглолт + тоглогчид хамт бичигдэнэ эсвэл огт бичигдэхгүй.
-- Ижил id + ижил/бага revision дахин ирвэл юу ч өөрчлөхгүй (duplicate). Өндөр revision → бүрэн солино.
create or replace function berx_ingest_match(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_id text := p->>'id';
  v_rev int := coalesce((p->>'revision')::int, 1);
  v_old int;
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_status text := p->>'status';
  v_winner text := nullif(p->>'winner', '');
  v_mode text := p->>'mode';
  v_started bigint := (p->>'started_at')::bigint;
  v_n int := coalesce(jsonb_array_length(p->'players'), 0);
begin
  if v_id is null or jsonb_typeof(p->'players') is distinct from 'array' then raise exception 'berx_ingest_match: invalid payload' using errcode = '22023'; end if;
  if v_n > 20 then raise exception 'berx_ingest_match: too many players' using errcode = '22023'; end if;
  select revision into v_old from berx_matches where id = v_id for update;
  if found and v_old >= v_rev then
    return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_id);
  end if;
  insert into berx_matches (id, revision, server_id, source, external_ref, agent_version, mode, map, workshop_id, aim_weapon, target_rounds,
    status, status_reason, started_at, ended_at, duration_s, rounds_played, score_ct, score_t, winner, player_count, has_damage, has_mvp, ingested_at, updated_at)
  values (v_id, v_rev, p->>'server_id', p->>'source', nullif(p->>'external_ref', ''), nullif(p->>'agent_version', ''), v_mode, p->>'map',
    nullif(p->>'workshop_id', ''), nullif(p->>'aim_weapon', ''), (p->>'target_rounds')::int, v_status, nullif(p->>'status_reason', ''),
    v_started, (p->>'ended_at')::bigint, greatest(0, (((p->>'ended_at')::bigint - v_started) / 1000))::int, (p->>'rounds_played')::int,
    (p->>'score_ct')::int, (p->>'score_t')::int, v_winner, v_n, coalesce((p->>'has_damage')::boolean, false), coalesce((p->>'has_mvp')::boolean, false), v_now, v_now)
  on conflict (id) do update set revision = excluded.revision, server_id = excluded.server_id, source = excluded.source, external_ref = excluded.external_ref,
    agent_version = excluded.agent_version, mode = excluded.mode, map = excluded.map, workshop_id = excluded.workshop_id, aim_weapon = excluded.aim_weapon,
    target_rounds = excluded.target_rounds, status = excluded.status, status_reason = excluded.status_reason, started_at = excluded.started_at,
    ended_at = excluded.ended_at, duration_s = excluded.duration_s, rounds_played = excluded.rounds_played, score_ct = excluded.score_ct,
    score_t = excluded.score_t, winner = excluded.winner, player_count = excluded.player_count, has_damage = excluded.has_damage,
    has_mvp = excluded.has_mvp, updated_at = excluded.updated_at;
  delete from berx_match_players where match_id = v_id;
  insert into berx_match_players (match_id, steam_id, name, team, kills, deaths, assists, headshot_kills, team_kills, suicides, damage, mvp,
    rounds_played, connected_at_end, result, mode, status, started_at)
  select v_id, x->>'steam_id', left(coalesce(x->>'name', ''), 64), x->>'team', (x->>'kills')::int, (x->>'deaths')::int, (x->>'assists')::int,
    (x->>'headshot_kills')::int, coalesce((x->>'team_kills')::int, 0), coalesce((x->>'suicides')::int, 0), (x->>'damage')::int, (x->>'mvp')::int,
    (x->>'rounds_played')::int, coalesce((x->>'connected_at_end')::boolean, true),
    case when v_status <> 'completed' then null when v_winner = 'draw' then 'draw' when v_winner = x->>'team' then 'win' else 'loss' end,
    v_mode, v_status, v_started
  from jsonb_array_elements(p->'players') as x;
  return jsonb_build_object('ok', true, 'duplicate', false, 'id', v_id);
end $$;

-- ---------- Эрх: зөвхөн server (service_role / sb_secret) ----------
alter table berx_matches       enable row level security;
alter table berx_match_players enable row level security;
revoke all on berx_matches, berx_match_players from anon, authenticated;
grant select, insert, update, delete on berx_matches, berx_match_players to service_role;
revoke all on function berx_ingest_match(jsonb) from public, anon, authenticated;
grant execute on function berx_ingest_match(jsonb) to service_role;
