-- =========================================================
-- 008 — BERX RANKING: нэг удаагийн түүхэн Competitive тоглолтын BRP нөхөн бүртгэл (historical import)
-- Supabase → SQL Editor → Run. Дахин ажиллуулахад аюулгүй. Шаардлага: 005, 006, 007.
--
-- ⚠ Энэ migration ӨӨРӨӨ BRP ӨӨРЧЛӨХГҮЙ. Зөвхөн механизм нэмнэ:
--   1. berx_historical_approve  — admin баталсан manifest (яг match ID + revision + өгөгдлийн fingerprint)
--   2. berx_historical_import   — dry_run=true: бүх шалгалт + яг ижил тооцоо, ЮУ Ч БИЧИХГҮЙ (rollback)
--                                 dry_run=false: нэг transaction-д бүх тоглолтыг цагийн дарааллаар хэрэгжүүлнэ
--   3. berx_historical_reverse  — шаардлагатай бол аудиттай НӨХӨХ (compensating) засвар; ledger-ийн мөр устгахгүй
--
-- Хамрах хүрээ (generic биш, санаатайгаар хатуу):
--   • Зөвхөн 2026-11-15 (Улаанбаатар, UTC+8) өдөр эхэлсэн, MatchZy-ээс бүртгэгдсэн, completed, CT/T ялагчтай
--     Competitive, анх Casual (lock-гүй), өмнө нь ямар ч BRP шийдвэргүй тоглолт.
--   • Нийт 4-өөс илүү тоглолт manifest-д орох боломжгүй (бүх batch нийлбэр). Тоглолт бүр зөвхөн нэг удаа.
--   • Тоглолтын төрөл, оноо, статистик, lock огт өөрчлөгдөхгүй (Casual хэвээр; "Чансаанд нөхөн бүртгэсэн").
--   • enabled_at, feature flag, ердийн Ranked шалгалт (007) өөрчлөгдөхгүй.
--   • Ердийн rating ба historical import нэг тоглолтод хоёулаа олгож чадахгүй (berx_ranked_matches PK +
--     ledger-ийн unique(match_id, user_id)).
-- Эрх: зөвхөн service_role / SQL Editor (postgres). anon/authenticated ажиллуулж чадахгүй.
-- Буцаах: 008_historical_rating_import_rollback.sql (import ажиллаагүй үед л). Import-ийн дараа → berx_historical_reverse.
-- =========================================================

-- ---------- Шийдвэрийн гарал үүсэл ----------
alter table berx_ranked_matches add column if not exists origin text not null default 'live';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'berx_ranked_matches_origin_chk') then
    alter table berx_ranked_matches add constraint berx_ranked_matches_origin_chk check (origin in ('live', 'historical_import'));
  end if;
end $$;

-- ---------- Manifest (admin баталсан яг жагсаалт) ----------
create table if not exists berx_historical_import_manifest (
  batch_id            text not null check (batch_id ~ '^[a-z0-9-]{3,40}$'),
  seq                 int  not null check (seq between 1 and 4),
  match_id            text not null references berx_matches(id) on delete restrict,
  approved_revision   int  not null check (approved_revision >= 1),
  fingerprint         text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  started_at          bigint not null,
  original_match_type text not null,
  formula             text not null check (formula = 'competitive-v1'),
  approved_by         text not null,
  approval_reason     text not null check (length(approval_reason) between 10 and 300),
  status              text not null default 'approved' check (status in ('approved', 'imported', 'cancelled', 'reversed')),
  approved_at         bigint not null,
  imported_at         bigint,
  primary key (batch_id, seq)
);
create unique index if not exists berx_hist_manifest_match_uq on berx_historical_import_manifest (match_id) where status <> 'cancelled';
alter table berx_historical_import_manifest enable row level security;
revoke all on berx_historical_import_manifest from anon, authenticated;
grant select, insert, update on berx_historical_import_manifest to service_role;
revoke delete, truncate on berx_historical_import_manifest from service_role;

-- ---------- Тоглолтын албан ёсны өгөгдлийн fingerprint (dry run → import хооронд өөрчлөгдвөл татгалзана) ----------
-- ⚠ docs/historical-import/export.sql доторх илэрхийлэлтэй ЯГ ИЖИЛ байх ёстой (тест шалгана).
create or replace function berx_match_fingerprint(p_id text) returns text
language sql stable security invoker set search_path = public as $$
  select encode(sha256(convert_to(
    (select concat_ws('|', m.id, m.revision, m.mode, m.status, m.source, m.match_type, coalesce(m.map, '~'), coalesce(m.score_ct::text, '~'), coalesce(m.score_t::text, '~'),
            coalesce(m.winner, '~'), coalesce(m.rounds_played::text, '~'), m.has_damage::text, m.started_at, coalesce(m.ended_at::text, '~'))
       from berx_matches m where m.id = p_id)
    || '#' ||
    coalesce((select string_agg(concat_ws('|', x.steam_id, coalesce(x.team, '~'), coalesce(x.kills::text, '~'), coalesce(x.deaths::text, '~'), coalesce(x.assists::text, '~'),
                     coalesce(x.headshot_kills::text, '~'), coalesce(x.team_kills::text, '~'), coalesce(x.damage::text, '~'), coalesce(x.rounds_played::text, '~')), ';' order by x.steam_id)
                from berx_match_players x where x.match_id = p_id), ''),
    'UTF8')), 'hex')
$$;

create or replace function berx_rank_name(p_brp int) returns text language sql immutable as $$
  select case when p_brp >= 5000 then 'IMMORTAL' when p_brp >= 4000 then 'DOMINATOR' when p_brp >= 3000 then 'REAPER' when p_brp >= 2000 then 'HUNTER' else 'ROOKIE' end
$$;

-- ---------- Түүхэн тоглолтын шалгалт (null = зөв) ----------
create or replace function berx_historical_validate(p_match_id text, p_changes jsonb) returns text
language plpgsql stable security invoker set search_path = public as $$
declare
  m record; c jsonb; v_uid text; v_dc numeric; v_sc numeric; v_n int; v_min int;
begin
  select * into m from berx_matches where id = p_match_id;
  if not found then return 'match_not_found'; end if;
  if m.mode is distinct from 'competitive' then return 'not_competitive'; end if;
  if m.source is distinct from 'matchzy' then return 'not_matchzy'; end if;
  if m.status is distinct from 'completed' then return 'not_completed'; end if;
  if m.winner is null or m.winner not in ('CT', 'T') then return 'draw_or_no_winner'; end if;
  if m.match_type is distinct from 'casual' or m.lock is not null then return 'not_historical_casual'; end if;
  if m.started_at < 1794672000000 or m.started_at >= 1794758400000 then return 'outside_import_window'; end if;
  if m.score_ct is null or m.score_t is null or (m.winner = 'CT' and m.score_ct <= m.score_t) or (m.winner = 'T' and m.score_t <= m.score_ct) then return 'score_winner_mismatch'; end if;
  if coalesce(m.rounds_played, 0) < 1 or m.rounds_played < m.score_ct + m.score_t then return 'rounds_mismatch'; end if;

  -- Тоглогчид: яг 10 хүн, 5 CT + 5 T, зөв SteamID64, бодит статистик
  if (select count(*) from berx_match_players where match_id = m.id) <> 10 then return 'player_count'; end if;
  if (select count(*) from berx_match_players where match_id = m.id and team = 'CT') <> 5 or (select count(*) from berx_match_players where match_id = m.id and team = 'T') <> 5 then return 'team_size'; end if;
  if exists (select 1 from berx_match_players where match_id = m.id and steam_id !~ '^7656119[0-9]{10}$') then return 'bad_steam_id'; end if;
  if exists (select 1 from berx_match_players where match_id = m.id and (kills < 0 or deaths < 0 or assists < 0 or headshot_kills < 0 or headshot_kills > kills
             or coalesce(damage, 0) < 0 or rounds_played is null or rounds_played < 0 or rounds_played > m.rounds_played)) then return 'bad_statistics'; end if;
  if exists (select 1 from berx_match_players mp where mp.match_id = m.id and not exists (select 1 from users u where u.steam_id = mp.steam_id)) then return 'unlinked_player'; end if;
  v_min := ceil(m.rounds_played * 0.5);
  if exists (select 1 from berx_match_players where match_id = m.id and rounds_played < v_min) then return 'low_participation'; end if;

  -- Өөрчлөлтүүд: яг эдгээр 10 тоглогч, нэг удаа, зөв хэрэглэгч, бодит дүн, зөвшөөрөгдсөн BRP
  if jsonb_typeof(p_changes) is distinct from 'array' then return 'no_changes'; end if;
  v_n := jsonb_array_length(p_changes);
  if v_n <> 10 then return 'changes_count'; end if;
  if (select count(distinct x->>'steam_id') from jsonb_array_elements(p_changes) x
       where exists (select 1 from berx_match_players mp where mp.match_id = m.id and mp.steam_id = x->>'steam_id')) <> 10 then return 'changes_not_roster'; end if;
  if (select count(distinct x->>'user_id') from jsonb_array_elements(p_changes) x) <> 10 then return 'duplicate_user'; end if;
  for c in select x from jsonb_array_elements(p_changes) x loop
    select id into v_uid from users where steam_id = c->>'steam_id';
    if v_uid is null or v_uid is distinct from c->>'user_id' then return 'user_steam_mismatch'; end if;
    if c->>'result' is distinct from (select case when mp.team = m.winner then 'win' else 'loss' end from berx_match_players mp where mp.match_id = m.id and mp.steam_id = c->>'steam_id') then return 'wrong_result'; end if;
    if coalesce(c->>'delta_calc', '') !~ '^-?[0-9]{1,4}$' then return 'bad_delta'; end if;
    v_dc := (c->>'delta_calc')::numeric;
    if (c->>'result' = 'win' and v_dc not between 150 and 230) or (c->>'result' = 'loss' and v_dc not between -200 and -130) then return 'delta_out_of_range'; end if;
    if coalesce(c->>'score', '') !~ '^[0-9]+(\.[0-9]+)?$' then return 'bad_score'; end if;
    v_sc := (c->>'score')::numeric;
    if v_sc < 0 or v_sc > 100 then return 'bad_score'; end if;
    -- competitive-v1-ийн хамаарал: delta = f(score) (±1 — JS/SQL бутархайн дугуйралт)
    if abs(v_dc - (case when c->>'result' = 'win' then round(150 + 0.8 * v_sc) else -round(200 - 0.7 * v_sc) end)) > 1 then return 'delta_score_mismatch'; end if;
  end loop;
  return null;
end $$;

-- ---------- 1. Manifest батлах (BRP өөрчлөхгүй) ----------
-- p: { batch_id, admin_id, reason, formula: 'competitive-v1', matches: [{ match_id, revision, fingerprint }, ...] (цагийн дарааллаар) }
create or replace function berx_historical_approve(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_batch text := p->>'batch_id'; v_admin text := coalesce(p->>'admin_id', ''); v_reason text := btrim(coalesce(p->>'reason', ''));
  x jsonb; m record; v_seq int := 0; v_prev bigint := 0; v_fp text; v_err text;
begin
  if v_batch is null or v_batch !~ '^[a-z0-9-]{3,40}$' then raise exception 'historical: invalid batch_id' using errcode = '22023'; end if;
  if not exists (select 1 from users where id = v_admin) then raise exception 'historical: admin_id must be an existing user' using errcode = '22023'; end if;
  if length(v_reason) < 10 then raise exception 'historical: approval reason required (10+)' using errcode = '22023'; end if;
  if coalesce(p->>'formula', '') <> 'competitive-v1' then raise exception 'historical: formula must be competitive-v1' using errcode = '22023'; end if;
  if jsonb_typeof(p->'matches') is distinct from 'array' or jsonb_array_length(p->'matches') not between 1 and 4 then raise exception 'historical: 1..4 matches' using errcode = '22023'; end if;
  lock table berx_historical_import_manifest in share row exclusive mode;
  if exists (select 1 from berx_historical_import_manifest where batch_id = v_batch) then raise exception 'historical: batch already exists' using errcode = '22023'; end if;
  if (select count(*) from berx_historical_import_manifest where status <> 'cancelled') + jsonb_array_length(p->'matches') > 4 then raise exception 'historical: one-time import is limited to 4 matches in total' using errcode = '22023'; end if;
  for x in select e from jsonb_array_elements(p->'matches') e loop
    v_seq := v_seq + 1;
    select * into m from berx_matches where id = x->>'match_id' for share;
    if not found then raise exception 'historical: match % not found', x->>'match_id' using errcode = '22023'; end if;
    if m.revision <> (x->>'revision')::int then raise exception 'historical: match % revision is %, not %', m.id, m.revision, x->>'revision' using errcode = '22023'; end if;
    v_fp := berx_match_fingerprint(m.id);
    if v_fp <> x->>'fingerprint' then raise exception 'historical: match % data changed since export (fingerprint)', m.id using errcode = '22023'; end if;
    v_err := berx_historical_validate(m.id, '[]'::jsonb);
    if v_err is not null and v_err <> 'changes_count' then raise exception 'historical: match % not eligible: %', m.id, v_err using errcode = '22023'; end if;
    if exists (select 1 from berx_ranked_matches where match_id = m.id) or exists (select 1 from berx_rating_changes where match_id = m.id) then raise exception 'historical: match % already has a rating decision', m.id using errcode = '22023'; end if;
    if m.started_at <= v_prev then raise exception 'historical: matches must be in chronological order' using errcode = '22023'; end if;
    v_prev := m.started_at;
    insert into berx_historical_import_manifest (batch_id, seq, match_id, approved_revision, fingerprint, started_at, original_match_type, formula, approved_by, approval_reason, approved_at)
      values (v_batch, v_seq, m.id, m.revision, v_fp, m.started_at, m.match_type, 'competitive-v1', v_admin, left(v_reason, 300), v_now);
  end loop;
  insert into berx_ranking_audit (action, target, detail, reason, admin_id, created_at)
    values ('historical_approve', v_batch, jsonb_build_object('batch_id', v_batch, 'matches', p->'matches', 'formula', 'competitive-v1', 'status', 'approved'), left(v_reason, 300), v_admin, v_now);
  return jsonb_build_object('ok', true, 'batch_id', v_batch, 'matches', v_seq, 'status', 'approved');
end $$;

-- ---------- 2. Import (dry_run = true → зөвхөн урьдчилсан харагдац, юу ч бичихгүй) ----------
-- p: { batch_id, admin_id, reason, dry_run, matches: [{ match_id, revision, fingerprint,
--        changes: [{ user_id, steam_id, result, score, delta_calc, detail, reason }] }] (manifest-ийн дарааллаар) }
create or replace function berx_historical_import(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_batch text := p->>'batch_id'; v_admin text := coalesce(p->>'admin_id', ''); v_reason text := btrim(coalesce(p->>'reason', ''));
  v_dry boolean := coalesce((p->>'dry_run')::boolean, true);      -- анхдагч: dry run
  mf record; x jsonb; c jsonb; m record; v_i int := 0; v_err text;
  v_ids text[]; v_prev int; v_delta int; v_new int; v_cid bigint;
  v_out jsonb := '[]'::jsonb; v_mo jsonb;
  v_n_total int; v_n_imported int; v_n_approved int;
begin
  if v_batch is null then raise exception 'historical: batch_id required' using errcode = '22023'; end if;
  if not exists (select 1 from users where id = v_admin) then raise exception 'historical: admin_id must be an existing user' using errcode = '22023'; end if;
  if length(v_reason) < 10 then raise exception 'historical: reason required (10+)' using errcode = '22023'; end if;
  perform 1 from berx_historical_import_manifest where batch_id = v_batch order by seq for update;
  select count(*), count(*) filter (where status = 'imported'), count(*) filter (where status = 'approved') into v_n_total, v_n_imported, v_n_approved
    from berx_historical_import_manifest where batch_id = v_batch;
  if v_n_total = 0 then raise exception 'historical: unknown batch' using errcode = '22023'; end if;
  if v_n_imported = v_n_total then
    return jsonb_build_object('ok', true, 'batch_id', v_batch, 'already_imported', true, 'awarded', false);   -- idempotent: дахин олгохгүй
  end if;
  if v_n_approved <> v_n_total then raise exception 'historical: batch is not in approved state' using errcode = '22023'; end if;
  if jsonb_typeof(p->'matches') is distinct from 'array' or jsonb_array_length(p->'matches') <> v_n_total then raise exception 'historical: matches must equal the approved manifest' using errcode = '22023'; end if;

  begin   -- dry run-ийн үед энэ блок бүхэлдээ rollback болно (доорх BXDRY)
    -- Бүх тоглогчийн мөрийг user_id дарааллаар нэг дор түгжинэ (deterministic, deadlock-гүй)
    select array_agg(distinct c2->>'user_id' order by c2->>'user_id') into v_ids
      from jsonb_array_elements(p->'matches') x2, jsonb_array_elements(x2->'changes') c2;
    insert into berx_ratings (user_id, steam_id, created_at, updated_at)
      select distinct on (c2->>'user_id') c2->>'user_id', c2->>'steam_id', v_now, v_now
        from jsonb_array_elements(p->'matches') x2, jsonb_array_elements(x2->'changes') c2
       where c2->>'steam_id' ~ '^7656119[0-9]{10}$' order by c2->>'user_id'
      on conflict (user_id) do nothing;
    perform 1 from berx_ratings where user_id = any(v_ids) order by user_id for update;

    for mf in select * from berx_historical_import_manifest where batch_id = v_batch order by seq loop
      v_i := v_i + 1;
      x := p->'matches'->(v_i - 1);
      if x->>'match_id' is distinct from mf.match_id then raise exception 'historical: match order/ID differs from manifest at %', v_i using errcode = '22023'; end if;
      if (x->>'revision')::int is distinct from mf.approved_revision then raise exception 'historical: revision differs from manifest for %', mf.match_id using errcode = '22023'; end if;
      if x->>'fingerprint' is distinct from mf.fingerprint then raise exception 'historical: fingerprint differs from manifest for %', mf.match_id using errcode = '22023'; end if;
      select * into m from berx_matches where id = mf.match_id for update;
      if m.revision <> mf.approved_revision then raise exception 'historical: match % changed (revision % ≠ approved %)', m.id, m.revision, mf.approved_revision using errcode = '22023'; end if;
      if berx_match_fingerprint(m.id) <> mf.fingerprint then raise exception 'historical: match % data changed after approval', m.id using errcode = '22023'; end if;
      if exists (select 1 from berx_ranked_matches where match_id = m.id) or exists (select 1 from berx_rating_changes where match_id = m.id) then
        raise exception 'historical: match % already has a rating decision', m.id using errcode = '22023'; end if;
      v_err := berx_historical_validate(m.id, x->'changes');
      if v_err is not null then raise exception 'historical: match % failed validation: %', m.id, v_err using errcode = '22023'; end if;

      insert into berx_ranked_matches (match_id, mode, status, reason, formula, revision, note, decided_by, decided_at, updated_at, origin)
        values (m.id, m.mode, 'rated', 'historical_import', 'competitive-v1', m.revision, left('batch ' || v_batch || ': ' || v_reason, 300), v_admin, v_now, v_now, 'historical_import');
      v_mo := jsonb_build_object('match_id', m.id, 'revision', m.revision, 'map', m.map, 'started_at', m.started_at, 'score_ct', m.score_ct, 'score_t', m.score_t, 'winner', m.winner, 'changes', '[]'::jsonb);
      for c in select e from jsonb_array_elements(x->'changes') e order by e->>'user_id' loop
        select brp into v_prev from berx_ratings where user_id = c->>'user_id';
        v_delta := greatest((c->>'delta_calc')::int, -v_prev);
        v_new := v_prev + v_delta;
        insert into berx_rating_changes (kind, match_id, user_id, steam_id, mode, result, score, delta_calc, delta, prev_brp, new_brp, formula, detail, reason, created_at)
          values ('match', m.id, c->>'user_id', c->>'steam_id', m.mode, c->>'result', (c->>'score')::numeric, (c->>'delta_calc')::int, v_delta, v_prev, v_new, 'competitive-v1',
                  coalesce(c->'detail', '{}'::jsonb) || jsonb_build_object('historical_import', true, 'batch_id', v_batch, 'original_match_type', mf.original_match_type,
                    'rank_before', berx_rank_name(v_prev), 'rank_after', berx_rank_name(v_new)),
                  left('Чансаанд нөхөн бүртгэсэн · ' || coalesce(c->>'reason', c->>'result'), 300), v_now)
          returning id into v_cid;
        update berx_ratings set brp = v_new, peak = greatest(peak, v_new), steam_id = c->>'steam_id', ranked_matches = ranked_matches + 1,
          wins = wins + (c->>'result' = 'win')::int, losses = losses + (c->>'result' = 'loss')::int, last_change_id = v_cid, last_match_at = v_now, updated_at = v_now
          where user_id = c->>'user_id';
        v_mo := jsonb_set(v_mo, '{changes}', (v_mo->'changes') || jsonb_build_object('user_id', c->>'user_id', 'steam_id', c->>'steam_id', 'result', c->>'result',
                  'score', (c->>'score')::numeric, 'prev_brp', v_prev, 'delta_calc', (c->>'delta_calc')::int, 'delta', v_delta, 'new_brp', v_new,
                  'rank_before', berx_rank_name(v_prev), 'rank_after', berx_rank_name(v_new)));
      end loop;
      insert into berx_ranking_audit (action, target, detail, reason, admin_id, created_at)
        values ('historical_import', m.id, jsonb_build_object('batch_id', v_batch, 'match_id', m.id, 'approved_revision', mf.approved_revision, 'formula', 'competitive-v1',
                'original_match_type', mf.original_match_type, 'status', 'imported', 'fingerprint', mf.fingerprint, 'approved_by', mf.approved_by, 'approval_reason', mf.approval_reason),
                left(v_reason, 300), v_admin, v_now);
      update berx_historical_import_manifest set status = 'imported', imported_at = v_now where batch_id = v_batch and seq = mf.seq;
      v_out := v_out || v_mo;
    end loop;
    if v_dry then raise exception using errcode = 'BXDRY', message = 'historical dry run'; end if;
  exception when sqlstate 'BXDRY' then
    return jsonb_build_object('ok', true, 'batch_id', v_batch, 'dry_run', true, 'awarded', false, 'matches', v_out);
  end;
  return jsonb_build_object('ok', true, 'batch_id', v_batch, 'dry_run', false, 'awarded', true, 'matches', v_out);
end $$;

-- ---------- 3. Нөхөх засвар (ledger-ийн мөр устгахгүй; adjustment мөрөөр буцаана) ----------
create or replace function berx_historical_reverse(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_batch text := p->>'batch_id'; v_admin text := coalesce(p->>'admin_id', ''); v_reason text := btrim(coalesce(p->>'reason', ''));
  ch record; v_prev int; v_new int; v_cid bigint; v_n int := 0;
begin
  if not exists (select 1 from users where id = v_admin) then raise exception 'historical: admin_id must be an existing user' using errcode = '22023'; end if;
  if length(v_reason) < 10 then raise exception 'historical: reason required (10+)' using errcode = '22023'; end if;
  perform 1 from berx_historical_import_manifest where batch_id = v_batch order by seq for update;
  if not exists (select 1 from berx_historical_import_manifest where batch_id = v_batch) then raise exception 'historical: unknown batch' using errcode = '22023'; end if;
  if exists (select 1 from berx_historical_import_manifest where batch_id = v_batch and status <> 'imported') then raise exception 'historical: only a fully imported batch can be reversed' using errcode = '22023'; end if;
  perform 1 from berx_ratings where user_id in (select c.user_id from berx_rating_changes c join berx_historical_import_manifest mf on mf.match_id = c.match_id
     where mf.batch_id = v_batch and c.kind = 'match') order by user_id for update;
  -- Сүүлийнхээс эхлэн (урвуу дарааллаар) нөхөх adjustment бичнэ
  for ch in select c.* from berx_rating_changes c join berx_historical_import_manifest mf on mf.match_id = c.match_id
            where mf.batch_id = v_batch and c.kind = 'match' order by mf.seq desc, c.user_id loop
    select brp into v_prev from berx_ratings where user_id = ch.user_id;
    v_new := greatest(0, v_prev - ch.delta);
    insert into berx_rating_changes (kind, user_id, steam_id, delta_calc, delta, prev_brp, new_brp, detail, reason, created_by, created_at)
      values ('adjustment', ch.user_id, ch.steam_id, -ch.delta, v_new - v_prev, v_prev, v_new,
              jsonb_build_object('historical_reverse', true, 'batch_id', v_batch, 'match_id', ch.match_id, 'reverses_change_id', ch.id),
              left('Нөхөн бүртгэлийг буцаасан · ' || v_reason, 300), v_admin, v_now) returning id into v_cid;
    update berx_ratings set brp = v_new, ranked_matches = greatest(0, ranked_matches - 1),
      wins = greatest(0, wins - (ch.result = 'win')::int), losses = greatest(0, losses - (ch.result = 'loss')::int), last_change_id = v_cid, updated_at = v_now
      where user_id = ch.user_id;
    v_n := v_n + 1;
  end loop;
  update berx_ranked_matches set flag = 'historical_reversed', note = left('reversed: ' || v_reason, 300), updated_at = v_now
    where match_id in (select match_id from berx_historical_import_manifest where batch_id = v_batch);
  update berx_historical_import_manifest set status = 'reversed' where batch_id = v_batch;
  insert into berx_ranking_audit (action, target, detail, reason, admin_id, created_at)
    values ('historical_reverse', v_batch, jsonb_build_object('batch_id', v_batch, 'compensating_changes', v_n, 'status', 'reversed'), left(v_reason, 300), v_admin, v_now);
  return jsonb_build_object('ok', true, 'batch_id', v_batch, 'compensating_changes', v_n);
end $$;

-- ---------- Батлаагүй (import хийгээгүй) batch-ийг цуцлах ----------
create or replace function berx_historical_cancel(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; v_n int;
begin
  if not exists (select 1 from users where id = coalesce(p->>'admin_id', '')) then raise exception 'historical: admin_id must be an existing user' using errcode = '22023'; end if;
  if length(btrim(coalesce(p->>'reason', ''))) < 10 then raise exception 'historical: reason required (10+)' using errcode = '22023'; end if;
  update berx_historical_import_manifest set status = 'cancelled' where batch_id = p->>'batch_id' and status = 'approved';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'historical: nothing to cancel (only approved, not imported)' using errcode = '22023'; end if;
  insert into berx_ranking_audit (action, target, detail, reason, admin_id, created_at)
    values ('historical_cancel', p->>'batch_id', jsonb_build_object('batch_id', p->>'batch_id', 'status', 'cancelled', 'matches', v_n), left(p->>'reason', 300), p->>'admin_id', v_now);
  return jsonb_build_object('ok', true, 'cancelled', v_n);
end $$;

-- ---------- Эрх ----------
revoke all on function berx_match_fingerprint(text), berx_rank_name(int), berx_historical_validate(text, jsonb), berx_historical_approve(jsonb),
  berx_historical_import(jsonb), berx_historical_reverse(jsonb), berx_historical_cancel(jsonb) from public, anon, authenticated;
grant execute on function berx_match_fingerprint(text), berx_rank_name(int), berx_historical_validate(text, jsonb), berx_historical_approve(jsonb),
  berx_historical_import(jsonb), berx_historical_reverse(jsonb), berx_historical_cancel(jsonb) to service_role;
