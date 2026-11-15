-- =========================================================
-- 006 ROLLBACK — BERX RANKED & BRP
-- ⚠ Эхлээд ЗААВАЛ: Settings → Чансаа → бүх flag унтраах (энэ нь өгөгдөл устгадаггүй, хамгийн аюулгүй буцаалт).
-- ⚠ Энэ файл BRP ledger, рейтинг, audit-ийг БҮРМӨСӨН устгана. Ажиллуулахаас өмнө backup авна:
--     Supabase → Database → Backups, эсвэл docs/RANKING.md-ийн "Backup" хэсгийн COPY командууд.
-- berx_matches / berx_match_players (тоглолтын түүх) ХӨНДӨГДӨХГҮЙ — зөвхөн 006-д нэмсэн "lock" багана хасагдана.
-- match_type баганын утга ('ranked') хэвээр үлдэнэ (005-ийн багана), гэхдээ BRP-д нөлөөгүй.
-- =========================================================
begin;
drop function if exists berx_apply_rating(jsonb);
drop function if exists berx_adjust_rating(jsonb);
drop function if exists berx_update_ranking_settings(jsonb);
drop function if exists berx_ranking_summary();
drop table if exists berx_rating_changes;
drop table if exists berx_ranked_matches;
drop table if exists berx_ratings;
drop table if exists berx_ranking_audit;
drop table if exists berx_ranking_settings;
-- 005-ийн ingest функцийг яг хуучнаар нь сэргээнэ (match_type/lock-гүй)
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
alter table berx_matches drop column if exists lock;
revoke all on function berx_ingest_match(jsonb) from public, anon, authenticated;
grant execute on function berx_ingest_match(jsonb) to service_role;
commit;
