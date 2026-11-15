-- =========================================================
-- 007 — BERX RANKING: database hardening (defense in depth)
-- Supabase → SQL Editor → New query → paste → Run. Дахин ажиллуулахад аюулгүй (idempotent).
-- Шаардлага: 005_match_history.sql, 006_rankings.sql өмнө нь ажилласан байх. 006-г ӨӨРЧЛӨХГҮЙ.
--
-- berx_apply_rating-ийг солино: backend-ийн илгээсэн BRP-д шууд итгэхгүй, хадгалагдсан албан ёсны тоглолттой тулгана.
--   • BRP хязгаар: Competitive хожил +150…+230, хожигдол −200…−130; AIM хожил яг +30, хожигдол яг −30.
--   • Тоглогч: өөрчлөлт бүр түгжсэн roster-ын (lock) яг нэг тоглогч, бүх roster хамрагдсан, users.steam_id ↔ user_id таарна.
--   • Дүн (win/loss): berx_match_players-ийн эцсийн багаас + berx_matches.winner-оос DB өөрөө тооцоолж тулгана.
--   • Revision: p.revision = хадгалсан тоглолтын revision; хуучирсан (flag-тай / өөр revision) саналыг зөвшөөрөх боломжгүй.
--   • Approve: admin-ийн илгээсэн өөрчлөлт биш, хадгалсан proposal-ыг ашиглана (зөрвөл татгалзана).
--   • Ranked + completed + CT/T ялагч + lock заавал; AIM: First to 10 биш, BERX Guard ok.
--   • Flag: enabled + тухайн горимын flag, enabled_at ≤ тоглолт эхэлсэн / түгжсэн агшин.
-- Томъёо, зэрэглэлийн хил, 0-ийн доод хил, ledger/audit, атомик байдал, давхар хамгаалалт ӨӨРЧЛӨГДӨХГҮЙ.
-- Автомат (agent→backend) дуудлагад шалгалт унавал BRP олгохгүй, шийдвэрийг 'error' төлөвөөр (шалтгаантай) бичнэ →
--   Settings → Чансаа → "Алдаа" хэсэгт харагдаж, agent-ийн дахин илгээлтийн давталт үүсэхгүй.
-- Буцаах: 007_ranking_hardening_rollback.sql (006-ийн функцийг яг хуучнаар сэргээнэ).
-- =========================================================

-- ---------- Шалгагч: null = зөв, эсвэл шалтгаан (≤ 300) ----------
create or replace function berx_rating_validate(p_match_id text, p_changes jsonb) returns text
language plpgsql stable security invoker set search_path = public as $$
declare
  m record;
  s berx_ranking_settings%rowtype;
  v_ct text[]; v_t text[]; v_all text[];
  v_size int; v_team_ct text; v_team_t text; v_win text[];
  v_n int; c jsonb; v_uid text; v_dc numeric; v_sc numeric;
begin
  select id, mode, match_type, status, winner, target_rounds, started_at, lock into m from berx_matches where id = p_match_id;
  if not found then return 'match_not_found'; end if;

  -- ----- Feature flag, идэвхжсэн агшин -----
  select * into s from berx_ranking_settings where id = 1;
  if not found or not s.enabled then return 'ranking_disabled'; end if;
  if (m.mode = 'competitive' and not s.competitive) or (m.mode in ('aim1v1', 'aim2v2') and not s.aim) then return 'mode_disabled'; end if;
  if s.enabled_at is null or m.started_at < s.enabled_at then return 'before_activation'; end if;
  if jsonb_typeof(m.lock) is distinct from 'object' then return 'no_lock'; end if;
  if (m.lock->>'locked_at') ~ '^[0-9]+$' and (m.lock->>'locked_at')::bigint < s.enabled_at then return 'before_activation'; end if;

  -- ----- Тоглолт -----
  if m.match_type is distinct from 'ranked' then return 'not_ranked'; end if;
  if m.status is distinct from 'completed' then return 'not_completed'; end if;
  if m.winner is null or m.winner not in ('CT', 'T') then return 'draw_or_no_winner'; end if;
  if m.mode in ('aim1v1', 'aim2v2') then
    if m.target_rounds = 10 or (m.lock->'rules'->>'target_rounds') = '10' then return 'first_to_10'; end if;
    if coalesce(m.lock->'guard'->>'ok', 'false') <> 'true' then return 'guard_missing'; end if;
  end if;
  if coalesce((m.lock->>'bots')::int, 0) > 0 then return 'bots'; end if;

  -- ----- Түгжсэн roster -----
  if jsonb_typeof(m.lock->'roster'->'CT') is distinct from 'array' or jsonb_typeof(m.lock->'roster'->'T') is distinct from 'array' then return 'no_roster'; end if;
  select coalesce(array_agg(x), '{}') into v_ct from jsonb_array_elements_text(m.lock->'roster'->'CT') x;
  select coalesce(array_agg(x), '{}') into v_t  from jsonb_array_elements_text(m.lock->'roster'->'T') x;
  v_size := case m.mode when 'competitive' then 5 when 'aim1v1' then 1 when 'aim2v2' then 2 end;
  if cardinality(v_ct) <> v_size or cardinality(v_t) <> v_size then return 'roster_size'; end if;
  v_all := v_ct || v_t;
  if (select count(distinct x) from unnest(v_all) x) <> cardinality(v_all) then return 'duplicate_player'; end if;

  -- ----- Эцсийн баг (тал биш — бүлэг; halftime-д зөв) → ялагч бүлэг -----
  if (select count(*) from berx_match_players where match_id = m.id and steam_id = any(v_all)) <> cardinality(v_all) then return 'roster_player_missing'; end if;
  select min(team) into v_team_ct from berx_match_players where match_id = m.id and steam_id = any(v_ct) having count(distinct team) = 1;
  select min(team) into v_team_t  from berx_match_players where match_id = m.id and steam_id = any(v_t)  having count(distinct team) = 1;
  if v_team_ct is null or v_team_t is null or v_team_ct = v_team_t then return 'team_mismatch'; end if;
  v_win := case when v_team_ct = m.winner then v_ct else v_t end;

  -- ----- Өөрчлөлтүүд: яг roster, яг нэг удаа, зөв хэрэглэгч, зөв дүн, зөв хэмжээ -----
  if jsonb_typeof(p_changes) is distinct from 'array' then return 'no_changes'; end if;
  v_n := jsonb_array_length(p_changes);
  if v_n <> cardinality(v_all) then return 'changes_count'; end if;
  if (select count(distinct x->>'steam_id') from jsonb_array_elements(p_changes) x where x->>'steam_id' = any(v_all)) <> v_n then return 'changes_not_roster'; end if;
  if (select count(distinct x->>'user_id') from jsonb_array_elements(p_changes) x) <> v_n then return 'duplicate_user'; end if;
  for c in select x from jsonb_array_elements(p_changes) x loop
    select id into v_uid from users where steam_id = c->>'steam_id';
    if v_uid is null or v_uid is distinct from c->>'user_id' then return 'user_steam_mismatch'; end if;
    if c->>'result' is distinct from (case when (c->>'steam_id') = any(v_win) then 'win' else 'loss' end) then return 'wrong_result'; end if;
    if coalesce(c->>'delta_calc', '') !~ '^-?[0-9]{1,4}$' then return 'bad_delta'; end if;
    v_dc := (c->>'delta_calc')::numeric;
    if m.mode = 'competitive' then
      if c->>'result' = 'win' and v_dc not between 150 and 230 then return 'delta_out_of_range'; end if;
      if c->>'result' = 'loss' and v_dc not between -200 and -130 then return 'delta_out_of_range'; end if;
      if coalesce(c->>'score', '') !~ '^[0-9]+(\.[0-9]+)?$' then return 'bad_score'; end if;
      v_sc := (c->>'score')::numeric;
      if v_sc < 0 or v_sc > 100 then return 'bad_score'; end if;
    else
      if (c->>'result' = 'win' and v_dc <> 30) or (c->>'result' = 'loss' and v_dc <> -30) then return 'delta_out_of_range'; end if;
    end if;
  end loop;
  return null;
end $$;

-- ---------- berx_apply_rating (006-ийн хувилбарыг хатууруулсан) ----------
create or replace function berx_apply_rating(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_action text := coalesce(p->>'action', 'auto');
  v_mid text := p->>'match_id';
  v_rev int;
  v_status text := p->>'status';
  v_reason text := left(coalesce(p->>'reason', ''), 64);
  v_note text := left(p->>'note', 300);
  v_changes jsonb := p->'changes';
  v_err text;
  v_ins int := 0;
  r berx_ranked_matches%rowtype;
  m record;
  c jsonb;
  v_prev int; v_delta int; v_new int; v_cid bigint;
  v_ids text[];
  v_out jsonb := '[]'::jsonb;
begin
  if v_mid is null or v_action not in ('auto', 'approve', 'reject') then raise exception 'berx_apply_rating: invalid payload' using errcode = '22023'; end if;
  if coalesce(p->>'revision', '') !~ '^[0-9]{1,9}$' then raise exception 'berx_apply_rating: revision required' using errcode = '22023'; end if;
  v_rev := (p->>'revision')::int;
  -- Тоглолтын мөрийг түгжинэ: шийдвэрийн явцад ingest (шинэ revision) зэрэг орж ирэхгүй
  select id, mode, match_type, status, winner, revision into m from berx_matches where id = v_mid for update;
  if not found then raise exception 'berx_apply_rating: match not found' using errcode = '22023'; end if;
  if v_rev <> m.revision then raise exception 'berx_apply_rating: stale revision (got %, stored %)', v_rev, m.revision using errcode = '22023'; end if;

  if v_action = 'auto' then
    if v_status not in ('rated', 'not_eligible', 'review', 'error') then raise exception 'berx_apply_rating: bad status' using errcode = '22023'; end if;
    if v_status = 'rated' then
      v_err := berx_rating_validate(v_mid, v_changes);
      if v_err is not null then      -- BRP олгохгүй, admin-д харагдах алдаа болгоно
        v_status := 'error'; v_reason := 'error'; v_note := left('db_validation: ' || v_err, 300);
      end if;
    end if;
    insert into berx_ranked_matches (match_id, mode, status, reason, formula, revision, proposal, note, decided_at, updated_at)
    values (v_mid, m.mode, v_status, v_reason, p->>'formula', v_rev, case when v_status = 'review' then p->'proposal' end, v_note, v_now, v_now)
    on conflict (match_id) do nothing;
    get diagnostics v_ins = row_count;
    select * into r from berx_ranked_matches where match_id = v_mid for update;
    if v_ins = 0 then
      if r.status = 'error' then
        update berx_ranked_matches set status = v_status, reason = v_reason, formula = p->>'formula', revision = v_rev,
          proposal = case when v_status = 'review' then p->'proposal' end, note = v_note, decided_at = v_now, updated_at = v_now
        where match_id = v_mid returning * into r;
      else
        if v_rev > r.revision and r.status in ('rated', 'review') then
          update berx_ranked_matches set flag = 'revised_after_rating', revision = v_rev, updated_at = v_now where match_id = v_mid returning * into r;
        end if;
        return jsonb_build_object('ok', true, 'existing', true, 'status', r.status, 'reason', r.reason, 'flag', r.flag);
      end if;
    end if;
    if v_status <> 'rated' then
      return jsonb_build_object('ok', true, 'existing', false, 'status', v_status, 'reason', v_reason, 'validation', v_err);
    end if;
  else
    select * into r from berx_ranked_matches where match_id = v_mid for update;
    if not found or r.status <> 'review' then raise exception 'berx_apply_rating: match is not in review' using errcode = '22023'; end if;
    if coalesce(p->>'admin_id', '') = '' then raise exception 'berx_apply_rating: admin required' using errcode = '22023'; end if;
    if length(coalesce(p->>'note', '')) < 5 then raise exception 'berx_apply_rating: reason required' using errcode = '22023'; end if;
    if v_action = 'approve' then
      -- Хуучирсан санал: шийдвэрийн дараа тоглолт шинэчлэгдсэн эсвэл өөр revision-д тооцоолсон
      if r.flag is not null or r.revision <> m.revision then raise exception 'berx_apply_rating: proposal is outdated (revision changed) — reject instead' using errcode = '22023'; end if;
      if jsonb_typeof(r.proposal->'changes') is distinct from 'array' or jsonb_array_length(r.proposal->'changes') = 0 then raise exception 'berx_apply_rating: no stored proposal' using errcode = '22023'; end if;
      -- Зөвхөн хадгалсан саналыг хэрэгжүүлнэ; илгээсэн өөрчлөлт зөрвөл татгалзана
      if jsonb_typeof(v_changes) = 'array' and jsonb_array_length(v_changes) > 0 and
         (select coalesce(jsonb_agg(jsonb_build_array(x->>'user_id', x->>'steam_id', x->>'result', x->>'delta_calc') order by x->>'user_id'), '[]') from jsonb_array_elements(v_changes) x)
         is distinct from
         (select coalesce(jsonb_agg(jsonb_build_array(x->>'user_id', x->>'steam_id', x->>'result', x->>'delta_calc') order by x->>'user_id'), '[]') from jsonb_array_elements(r.proposal->'changes') x)
      then raise exception 'berx_apply_rating: changes differ from stored proposal' using errcode = '22023'; end if;
      v_changes := r.proposal->'changes';
      v_err := berx_rating_validate(v_mid, v_changes);
      if v_err is not null then raise exception 'berx_apply_rating: validation failed: %', v_err using errcode = '22023'; end if;
    end if;
    insert into berx_ranking_audit (action, target, detail, reason, admin_id, created_at)
      values ('review_' || v_action, v_mid, jsonb_build_object('previous_reason', r.reason, 'revision', m.revision), left(p->>'note', 300), p->>'admin_id', v_now);
    if v_action = 'reject' then
      update berx_ranked_matches set status = 'rejected', note = left(p->>'note', 300), decided_by = p->>'admin_id', decided_at = v_now, updated_at = v_now where match_id = v_mid;
      return jsonb_build_object('ok', true, 'status', 'rejected');
    end if;
    update berx_ranked_matches set status = 'rated', note = left(p->>'note', 300), decided_by = p->>'admin_id', decided_at = v_now, updated_at = v_now where match_id = v_mid;
  end if;

  -- ----- rated: ledger (006-тай ижил: user_id дарааллаар түгжинэ, 0-ийн доод хил) -----
  select array_agg(x->>'user_id' order by x->>'user_id') into v_ids from jsonb_array_elements(v_changes) x;
  insert into berx_ratings (user_id, steam_id, created_at, updated_at)
    select x->>'user_id', x->>'steam_id', v_now, v_now from jsonb_array_elements(v_changes) x order by x->>'user_id'
    on conflict (user_id) do nothing;
  perform 1 from berx_ratings where user_id = any(v_ids) order by user_id for update;

  for c in select x from jsonb_array_elements(v_changes) x order by x->>'user_id' loop
    select brp into v_prev from berx_ratings where user_id = c->>'user_id';
    v_delta := greatest((c->>'delta_calc')::int, -v_prev);
    v_new := v_prev + v_delta;
    insert into berx_rating_changes (kind, match_id, user_id, steam_id, mode, result, score, delta_calc, delta, prev_brp, new_brp, formula, detail, reason, created_at)
      values ('match', v_mid, c->>'user_id', c->>'steam_id', m.mode, c->>'result', (c->>'score')::numeric, (c->>'delta_calc')::int, v_delta, v_prev, v_new,
              coalesce(p->>'formula', r.formula), c->'detail', left(coalesce(c->>'reason', 'match'), 300), v_now)
      returning id into v_cid;
    update berx_ratings set brp = v_new, peak = greatest(peak, v_new), steam_id = c->>'steam_id', ranked_matches = ranked_matches + 1,
      wins = wins + (c->>'result' = 'win')::int, losses = losses + (c->>'result' = 'loss')::int,
      last_change_id = v_cid, last_match_at = v_now, updated_at = v_now
    where user_id = c->>'user_id';
    v_out := v_out || jsonb_build_object('user_id', c->>'user_id', 'delta', v_delta, 'new_brp', v_new, 'change_id', v_cid);
  end loop;
  return jsonb_build_object('ok', true, 'existing', false, 'status', 'rated', 'changes', v_out);
end $$;

-- ---------- Эрх: зөвхөн server (service_role) ----------
revoke all on function berx_rating_validate(text, jsonb), berx_apply_rating(jsonb) from public, anon, authenticated;
grant execute on function berx_rating_validate(text, jsonb), berx_apply_rating(jsonb) to service_role;
