-- =========================================================
-- 007 ROLLBACK — berx_apply_rating-ийг 006-ийн хувилбараар яг сэргээнэ, berx_rating_validate-г хасна.
-- Өгөгдөл (ledger, рейтинг, шийдвэр, audit) ХӨНДӨГДӨХГҮЙ. Хүснэгт өөрчлөхгүй.
-- =========================================================
begin;
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
drop function if exists berx_rating_validate(text, jsonb, boolean);
drop function if exists berx_rating_validate(text, jsonb);
revoke all on function berx_apply_rating(jsonb) from public, anon, authenticated;
grant execute on function berx_apply_rating(jsonb) to service_role;
commit;
