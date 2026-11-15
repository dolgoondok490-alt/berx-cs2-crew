-- =========================================================
-- 006 — BERX RANKED & BRP (additive migration)
-- Supabase → SQL Editor → New query → paste → Run (нэг удаа). Дахин ажиллуулахад аюулгүй (idempotent).
-- Шаардлага: 005_match_history.sql өмнө нь ажилласан байх.
-- Одоо байгаа хүснэгт/өгөгдлийг УСТГАХГҮЙ, RESET ХИЙХГҮЙ:
--   • berx_matches-д nullable "lock" багана нэмнэ (agent-ийн түгжсэн төрөл/roster/дүрэм).
--   • berx_ingest_match-ийг шинэчилнэ: match_type + lock-ийг ЗӨВХӨН анх бичигдэхэд хадгална (revision өөрчлөхгүй).
--   • Шинэ хүснэгт: berx_ranking_settings, berx_ratings, berx_ranked_matches, berx_rating_changes (ledger), berx_ranking_audit.
-- Бүх feature flag АНХДАГЧААР УНТРААЛТТАЙ — migration ажилласнаар хэнд ч BRP олгогдохгүй.
-- Буцаах: 006_rankings_rollback.sql (docs/RANKING.md-г үзнэ үү).
-- =========================================================

alter table berx_matches add column if not exists lock jsonb;

-- ---------- Тохиргоо (ганц мөр) ----------
create table if not exists berx_ranking_settings (
  id           int primary key default 1 check (id = 1),
  enabled      boolean not null default false,          -- нийт Ranked
  competitive  boolean not null default false,          -- Ranked Competitive 5v5
  aim          boolean not null default false,          -- Ranked AIM 1v1/2v2 (BERX Guard баталгаажсаны дараа л)
  formula      text not null default 'competitive-v1' check (formula in ('competitive-v1')),
  enabled_at   bigint,                                  -- анх асаасан агшин: үүнээс өмнө эхэлсэн тоглолт хэзээ ч BRP авахгүй
  rules        jsonb not null default '{}'::jsonb,      -- anti-farming / sanity тохиргоо (lib/ranking.js DEFAULT_RULES)
  updated_by   text,
  updated_at   bigint not null default 0
);
insert into berx_ranking_settings (id) values (1) on conflict (id) do nothing;

-- ---------- Тоглогчийн одоогийн BRP (ledger-ээс үүссэн кэш; үнэн = berx_rating_changes) ----------
-- Мөр байхгүй = 1000 BRP, ranked тоглоогүй. Хуучин хэрэглэгчид мөн 1000-аас эхэлнэ (retroactive BRP байхгүй).
create table if not exists berx_ratings (
  user_id        text primary key,
  steam_id       text not null check (steam_id ~ '^7656119[0-9]{10}$'),
  brp            int  not null default 1000 check (brp >= 0),
  peak           int  not null default 1000,
  ranked_matches int  not null default 0 check (ranked_matches >= 0),
  wins           int  not null default 0 check (wins >= 0),
  losses         int  not null default 0 check (losses >= 0),
  last_change_id bigint,
  last_match_at  bigint,
  created_at     bigint not null,
  updated_at     bigint not null,
  check (peak >= brp)
);
create index if not exists berx_ratings_brp_idx on berx_ratings (brp desc, peak desc, wins desc, user_id);

-- ---------- Тоглолт бүрийн ганц шийдвэр (PK = match_id → давхар олголт боломжгүй) ----------
create table if not exists berx_ranked_matches (
  match_id    text primary key references berx_matches(id) on delete restrict,
  mode        text not null check (mode in ('competitive', 'aim1v1', 'aim2v2')),
  status      text not null check (status in ('rated', 'not_eligible', 'review', 'rejected', 'error')),
  reason      text not null check (length(reason) between 1 and 64),
  formula     text check (formula is null or length(formula) <= 32),
  revision    int  not null default 1,               -- шийдвэр гарах үеийн тоглолтын revision
  flag        text check (flag is null or length(flag) <= 64),   -- ж: revised_after_rating (дахин олгохгүй, admin шалгана)
  proposal    jsonb,                                  -- review: тооцоолсон өөрчлөлт (admin зөвшөөрвөл яг үүгээр)
  note        text check (note is null or length(note) <= 300),
  decided_by  text,                                   -- null = автомат, бусад = admin user id
  decided_at  bigint not null,
  updated_at  bigint not null
);
create index if not exists berx_ranked_matches_status_idx on berx_ranked_matches (status, decided_at desc);

-- ---------- Ledger (албан ёсны, зөвхөн нэмэгдэнэ) ----------
create table if not exists berx_rating_changes (
  id          bigserial primary key,
  kind        text not null check (kind in ('match', 'adjustment')),
  match_id    text references berx_matches(id) on delete restrict,
  user_id     text not null,
  steam_id    text not null check (steam_id ~ '^7656119[0-9]{10}$'),
  mode        text check (mode is null or mode in ('competitive', 'aim1v1', 'aim2v2')),
  result      text check (result is null or result in ('win', 'loss')),
  score       numeric(5,2) check (score is null or score between 0 and 100),   -- хувийн үзүүлэлт (Competitive)
  delta_calc  int not null,                     -- томъёоны утга
  delta       int not null,                     -- бодитоор хэрэгжсэн (0-ээс доош орохгүй)
  prev_brp    int not null check (prev_brp >= 0),
  new_brp     int not null check (new_brp >= 0),
  formula     text,
  detail      jsonb,                            -- бүрэлдэхүүн, weights_used, шалтгаан
  reason      text not null check (length(reason) between 1 and 300),
  created_by  text,                             -- adjustment: admin user id
  created_at  bigint not null,
  check (new_brp = prev_brp + delta),
  check ((kind = 'match' and match_id is not null and result is not null) or (kind = 'adjustment' and match_id is null and result is null and created_by is not null))
);
create unique index if not exists berx_rating_changes_match_user_uq on berx_rating_changes (match_id, user_id) where kind = 'match';
create index if not exists berx_rating_changes_user_idx on berx_rating_changes (user_id, id desc);
create index if not exists berx_rating_changes_created_idx on berx_rating_changes (created_at desc);

-- ---------- Admin audit ----------
create table if not exists berx_ranking_audit (
  id         bigserial primary key,
  action     text not null check (length(action) <= 32),
  target     text check (target is null or length(target) <= 64),
  detail     jsonb,
  reason     text check (reason is null or length(reason) <= 300),
  admin_id   text not null,
  created_at bigint not null
);
create index if not exists berx_ranking_audit_created_idx on berx_ranking_audit (created_at desc);

-- ---------- Ingest (005-ийн шинэчилсэн хувилбар): match_type + lock анх л бичигдэнэ ----------
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
  v_type text := case when p->>'match_type' = 'ranked' then 'ranked' else 'casual' end;
  v_lock jsonb := case when jsonb_typeof(p->'lock') = 'object' then p->'lock' else null end;
begin
  if v_id is null or jsonb_typeof(p->'players') is distinct from 'array' then raise exception 'berx_ingest_match: invalid payload' using errcode = '22023'; end if;
  if v_n > 20 then raise exception 'berx_ingest_match: too many players' using errcode = '22023'; end if;
  if v_type = 'ranked' and v_lock is null then raise exception 'berx_ingest_match: ranked without lock' using errcode = '22023'; end if;
  select revision into v_old from berx_matches where id = v_id for update;
  if found and v_old >= v_rev then
    return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_id);
  end if;
  insert into berx_matches (id, revision, server_id, source, external_ref, agent_version, mode, match_type, lock, map, workshop_id, aim_weapon, target_rounds,
    status, status_reason, started_at, ended_at, duration_s, rounds_played, score_ct, score_t, winner, player_count, has_damage, has_mvp, ingested_at, updated_at)
  values (v_id, v_rev, p->>'server_id', p->>'source', nullif(p->>'external_ref', ''), nullif(p->>'agent_version', ''), v_mode, v_type, v_lock, p->>'map',
    nullif(p->>'workshop_id', ''), nullif(p->>'aim_weapon', ''), (p->>'target_rounds')::int, v_status, nullif(p->>'status_reason', ''),
    v_started, (p->>'ended_at')::bigint, greatest(0, (((p->>'ended_at')::bigint - v_started) / 1000))::int, (p->>'rounds_played')::int,
    (p->>'score_ct')::int, (p->>'score_t')::int, v_winner, v_n, coalesce((p->>'has_damage')::boolean, false), coalesce((p->>'has_mvp')::boolean, false), v_now, v_now)
  on conflict (id) do update set revision = excluded.revision, server_id = excluded.server_id, source = excluded.source, external_ref = excluded.external_ref,
    agent_version = excluded.agent_version, mode = excluded.mode, map = excluded.map, workshop_id = excluded.workshop_id, aim_weapon = excluded.aim_weapon,
    target_rounds = excluded.target_rounds, status = excluded.status, status_reason = excluded.status_reason, started_at = excluded.started_at,
    ended_at = excluded.ended_at, duration_s = excluded.duration_s, rounds_played = excluded.rounds_played, score_ct = excluded.score_ct,
    score_t = excluded.score_t, winner = excluded.winner, player_count = excluded.player_count, has_damage = excluded.has_damage,
    has_mvp = excluded.has_mvp, updated_at = excluded.updated_at;
    -- match_type, lock: санаатайгаар шинэчлэхгүй (тоглолт эхлэхэд түгжигдсэн)
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

-- ---------- BRP хэрэгжүүлэх (нэг transaction, concurrency-safe) ----------
-- p: { action: auto|approve|reject, match_id, revision, mode, status, reason, formula, proposal, note, admin_id,
--      changes: [{ user_id, steam_id, result, score, delta_calc, detail, reason }] }
-- • berx_ranked_matches PK → нэг тоглолтод ганц шийдвэр. Зэрэг ирсэн 2 дуудлагын 2 дахь нь өмнөхийн шийдвэрийг буцаана.
-- • Тоглогчдын мөрийг user_id дарааллаар FOR UPDATE түгжинэ (deadlock-гүй), 0-ээс доош орохгүй (delta = greatest(calc, -prev)).
-- • Шийдвэр гарсан тоглолтын шинэ revision → дахин олгохгүй, flag = revised_after_rating (admin шалгана).
create or replace function berx_apply_rating(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_action text := coalesce(p->>'action', 'auto');
  v_mid text := p->>'match_id';
  v_rev int := coalesce((p->>'revision')::int, 1);
  v_status text := p->>'status';
  v_reason text := left(coalesce(p->>'reason', ''), 64);
  v_ins int := 0;
  r berx_ranked_matches%rowtype;
  m record;
  c jsonb;
  v_prev int; v_delta int; v_new int; v_cid bigint;
  v_ids text[];
  v_out jsonb := '[]'::jsonb;
begin
  if v_mid is null or v_action not in ('auto', 'approve', 'reject') then raise exception 'berx_apply_rating: invalid payload' using errcode = '22023'; end if;
  select id, mode, match_type, status, winner, revision into m from berx_matches where id = v_mid for share;
  if not found then raise exception 'berx_apply_rating: match not found' using errcode = '22023'; end if;

  if v_action = 'auto' then
    if v_status not in ('rated', 'not_eligible', 'review', 'error') then raise exception 'berx_apply_rating: bad status' using errcode = '22023'; end if;
    insert into berx_ranked_matches (match_id, mode, status, reason, formula, revision, proposal, note, decided_at, updated_at)
    values (v_mid, m.mode, v_status, v_reason, p->>'formula', v_rev, case when v_status = 'review' then p->'proposal' end, left(p->>'note', 300), v_now, v_now)
    on conflict (match_id) do nothing;
    get diagnostics v_ins = row_count;
    select * into r from berx_ranked_matches where match_id = v_mid for update;
    if v_ins = 0 then
      if r.status = 'error' then                                  -- өмнө нь алдаа гарсан → дахин шийдвэрлэнэ
        update berx_ranked_matches set status = v_status, reason = v_reason, formula = p->>'formula', revision = v_rev,
          proposal = case when v_status = 'review' then p->'proposal' end, note = left(p->>'note', 300), decided_at = v_now, updated_at = v_now
        where match_id = v_mid returning * into r;
      else
        if v_rev > r.revision and r.status in ('rated', 'review') then
          update berx_ranked_matches set flag = 'revised_after_rating', revision = v_rev, updated_at = v_now where match_id = v_mid returning * into r;
        end if;
        return jsonb_build_object('ok', true, 'existing', true, 'status', r.status, 'reason', r.reason, 'flag', r.flag);
      end if;
    end if;
    if v_status <> 'rated' then
      return jsonb_build_object('ok', true, 'existing', false, 'status', v_status, 'reason', v_reason);
    end if;
  else
    select * into r from berx_ranked_matches where match_id = v_mid for update;
    if not found or r.status <> 'review' then raise exception 'berx_apply_rating: match is not in review' using errcode = '22023'; end if;
    if coalesce(p->>'admin_id', '') = '' then raise exception 'berx_apply_rating: admin required' using errcode = '22023'; end if;
    if length(coalesce(p->>'note', '')) < 5 then raise exception 'berx_apply_rating: reason required' using errcode = '22023'; end if;
    insert into berx_ranking_audit (action, target, detail, reason, admin_id, created_at)
      values ('review_' || v_action, v_mid, jsonb_build_object('previous_reason', r.reason), left(p->>'note', 300), p->>'admin_id', v_now);
    if v_action = 'reject' then
      update berx_ranked_matches set status = 'rejected', note = left(p->>'note', 300), decided_by = p->>'admin_id', decided_at = v_now, updated_at = v_now where match_id = v_mid;
      return jsonb_build_object('ok', true, 'status', 'rejected');
    end if;
    update berx_ranked_matches set status = 'rated', note = left(p->>'note', 300), decided_by = p->>'admin_id', decided_at = v_now, updated_at = v_now where match_id = v_mid;
  end if;

  -- ----- rated: хамгаалалтын давхар шалгалт (JS шийдвэрээс үл хамааран) -----
  if m.match_type <> 'ranked' or m.status <> 'completed' or m.winner not in ('CT', 'T') then
    raise exception 'berx_apply_rating: match is not a completed ranked match' using errcode = '22023';
  end if;
  if jsonb_typeof(p->'changes') is distinct from 'array' or jsonb_array_length(p->'changes') = 0 then raise exception 'berx_apply_rating: no changes' using errcode = '22023'; end if;

  select array_agg(x->>'user_id' order by x->>'user_id') into v_ids from jsonb_array_elements(p->'changes') x;
  insert into berx_ratings (user_id, steam_id, created_at, updated_at)
    select x->>'user_id', x->>'steam_id', v_now, v_now from jsonb_array_elements(p->'changes') x order by x->>'user_id'
    on conflict (user_id) do nothing;
  perform 1 from berx_ratings where user_id = any(v_ids) order by user_id for update;

  for c in select x from jsonb_array_elements(p->'changes') x order by x->>'user_id' loop
    if c->>'result' not in ('win', 'loss') then raise exception 'berx_apply_rating: bad result' using errcode = '22023'; end if;
    select brp into v_prev from berx_ratings where user_id = c->>'user_id';
    v_delta := greatest((c->>'delta_calc')::int, -v_prev);
    v_new := v_prev + v_delta;
    insert into berx_rating_changes (kind, match_id, user_id, steam_id, mode, result, score, delta_calc, delta, prev_brp, new_brp, formula, detail, reason, created_at)
      values ('match', v_mid, c->>'user_id', c->>'steam_id', m.mode, c->>'result', (c->>'score')::numeric, (c->>'delta_calc')::int, v_delta, v_prev, v_new,
              p->>'formula', c->'detail', left(coalesce(c->>'reason', 'match'), 300), v_now)
      returning id into v_cid;
    update berx_ratings set brp = v_new, peak = greatest(peak, v_new), steam_id = c->>'steam_id', ranked_matches = ranked_matches + 1,
      wins = wins + (c->>'result' = 'win')::int, losses = losses + (c->>'result' = 'loss')::int,
      last_change_id = v_cid, last_match_at = v_now, updated_at = v_now
    where user_id = c->>'user_id';
    v_out := v_out || jsonb_build_object('user_id', c->>'user_id', 'delta', v_delta, 'new_brp', v_new, 'change_id', v_cid);
  end loop;
  return jsonb_build_object('ok', true, 'existing', false, 'status', 'rated', 'changes', v_out);
end $$;

-- ---------- Admin засвар (шалтгаан заавал, хязгаартай, audit) ----------
create or replace function berx_adjust_rating(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_uid text := p->>'user_id';
  v_delta int := (p->>'delta')::int;
  v_reason text := btrim(coalesce(p->>'reason', ''));
  v_admin text := coalesce(p->>'admin_id', '');
  v_prev int; v_new int; v_cid bigint;
begin
  if v_uid is null or v_admin = '' then raise exception 'berx_adjust_rating: invalid payload' using errcode = '22023'; end if;
  if v_delta is null or v_delta = 0 or abs(v_delta) > 1000 then raise exception 'berx_adjust_rating: delta must be 1..1000' using errcode = '22023'; end if;
  if length(v_reason) < 5 then raise exception 'berx_adjust_rating: reason required' using errcode = '22023'; end if;
  insert into berx_ratings (user_id, steam_id, created_at, updated_at) values (v_uid, p->>'steam_id', v_now, v_now) on conflict (user_id) do nothing;
  select brp into v_prev from berx_ratings where user_id = v_uid for update;
  v_new := greatest(0, v_prev + v_delta);
  insert into berx_rating_changes (kind, user_id, steam_id, delta_calc, delta, prev_brp, new_brp, reason, created_by, created_at)
    values ('adjustment', v_uid, p->>'steam_id', v_delta, v_new - v_prev, v_prev, v_new, left(v_reason, 300), v_admin, v_now) returning id into v_cid;
  update berx_ratings set brp = v_new, peak = greatest(peak, v_new), last_change_id = v_cid, updated_at = v_now where user_id = v_uid;
  insert into berx_ranking_audit (action, target, detail, reason, admin_id, created_at)
    values ('adjust', v_uid, jsonb_build_object('delta', v_new - v_prev, 'requested', v_delta, 'prev', v_prev, 'new', v_new, 'change_id', v_cid), left(v_reason, 300), v_admin, v_now);
  return jsonb_build_object('ok', true, 'prev_brp', v_prev, 'new_brp', v_new, 'delta', v_new - v_prev, 'change_id', v_cid);
end $$;

-- ---------- Тохиргоо шинэчлэх (audit-тай) ----------
create or replace function berx_update_ranking_settings(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  s berx_ranking_settings%rowtype;
begin
  if coalesce(p->>'admin_id', '') = '' then raise exception 'berx_update_ranking_settings: admin required' using errcode = '22023'; end if;
  select * into s from berx_ranking_settings where id = 1 for update;
  update berx_ranking_settings set
    enabled = coalesce((p->>'enabled')::boolean, enabled),
    competitive = coalesce((p->>'competitive')::boolean, competitive),
    aim = coalesce((p->>'aim')::boolean, aim),
    rules = case when jsonb_typeof(p->'rules') = 'object' then p->'rules' else rules end,
    enabled_at = case when enabled_at is null and coalesce((p->>'enabled')::boolean, enabled) then v_now else enabled_at end,
    updated_by = p->>'admin_id', updated_at = v_now
  where id = 1 returning * into s;
  insert into berx_ranking_audit (action, target, detail, reason, admin_id, created_at)
    values ('settings', 'ranking', jsonb_build_object('enabled', s.enabled, 'competitive', s.competitive, 'aim', s.aim, 'rules', s.rules), left(p->>'reason', 300), p->>'admin_id', v_now);
  return to_jsonb(s);
end $$;

-- ---------- Inflation / нийт дүн (admin) ----------
create or replace function berx_ranking_summary() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'gained', coalesce((select sum(delta) from berx_rating_changes where delta > 0), 0),
    'lost', coalesce((select -sum(delta) from berx_rating_changes where delta < 0), 0),
    'net', coalesce((select sum(delta) from berx_rating_changes), 0),
    'adjustments', (select count(*) from berx_rating_changes where kind = 'adjustment'),
    'by_mode', coalesce((select jsonb_object_agg(mode, x) from (select mode, jsonb_build_object('gained', sum(greatest(delta, 0)), 'lost', -sum(least(delta, 0)), 'changes', count(*)) x
                         from berx_rating_changes where kind = 'match' group by mode) t), '{}'::jsonb),
    'decisions', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from berx_ranked_matches group by status) t), '{}'::jsonb),
    'players', (select count(*) from berx_ratings where ranked_matches > 0));
$$;

-- ---------- Эрх: зөвхөн server (service_role / sb_secret). Browser шууд хандахгүй ----------
alter table berx_ranking_settings enable row level security;
alter table berx_ratings          enable row level security;
alter table berx_ranked_matches   enable row level security;
alter table berx_rating_changes   enable row level security;
alter table berx_ranking_audit    enable row level security;
revoke all on berx_ranking_settings, berx_ratings, berx_ranked_matches, berx_rating_changes, berx_ranking_audit from anon, authenticated;
grant select, insert, update on berx_ranking_settings, berx_ratings, berx_ranked_matches to service_role;
grant select, insert on berx_rating_changes, berx_ranking_audit to service_role;          -- ledger/audit: UPDATE/DELETE эрхгүй
revoke update, delete, truncate on berx_rating_changes, berx_ranking_audit from service_role;   -- Supabase default privileges-ийг ч хаана
grant usage, select on sequence berx_rating_changes_id_seq, berx_ranking_audit_id_seq to service_role;
revoke all on function berx_ingest_match(jsonb), berx_apply_rating(jsonb), berx_adjust_rating(jsonb), berx_update_ranking_settings(jsonb), berx_ranking_summary() from public, anon, authenticated;
grant execute on function berx_ingest_match(jsonb), berx_apply_rating(jsonb), berx_adjust_rating(jsonb), berx_update_ranking_settings(jsonb), berx_ranking_summary() to service_role;
