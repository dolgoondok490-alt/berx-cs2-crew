-- =========================================================
-- BERX — түүхэн import-ын dry run-д зориулсан ЗӨВХӨН УНШИХ (read-only) export.
-- Supabase → SQL Editor → paste → Run. Юу ч бичихгүй, өөрчлөхгүй (зөвхөн SELECT).
-- Гаралт: нэг JSON нүд → бүхлээр нь хуулж (Copy) export.json болгон хадгална.
-- 006 хангалттай (007/008 шаардлагагүй). Нууц мэдээлэл (login, нууц үг, токен) агуулахгүй.
-- Цонх: 2026-11-15 00:00–24:00 Улаанбаатар (UTC+8) = 1794672000000 … 1794758400000 ms.
-- =========================================================
with day as (
  select m.* from berx_matches m where m.started_at >= 1794672000000 and m.started_at < 1794758400000
), fp as (
  -- ⚠ supabase/008_historical_rating_import.sql → berx_match_fingerprint()-тэй ЯГ ИЖИЛ илэрхийлэл
  select d.id, encode(sha256(convert_to(
    (select concat_ws('|', m.id, m.revision, m.mode, m.status, m.source, m.match_type, coalesce(m.map, '~'), coalesce(m.score_ct::text, '~'), coalesce(m.score_t::text, '~'),
            coalesce(m.winner, '~'), coalesce(m.rounds_played::text, '~'), m.has_damage::text, m.started_at, coalesce(m.ended_at::text, '~'))
       from berx_matches m where m.id = d.id)
    || '#' ||
    coalesce((select string_agg(concat_ws('|', x.steam_id, coalesce(x.team, '~'), coalesce(x.kills::text, '~'), coalesce(x.deaths::text, '~'), coalesce(x.assists::text, '~'),
                     coalesce(x.headshot_kills::text, '~'), coalesce(x.team_kills::text, '~'), coalesce(x.damage::text, '~'), coalesce(x.rounds_played::text, '~')), ';' order by x.steam_id)
                from berx_match_players x where x.match_id = d.id), ''),
    'UTF8')), 'hex') as fingerprint
  from day d
)
select jsonb_pretty(jsonb_build_object(
  'export_version', 1,
  'exported_at', (extract(epoch from clock_timestamp()) * 1000)::bigint,
  'settings', (select to_jsonb(s) - 'updated_by' from berx_ranking_settings s where id = 1),
  'day_matches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'revision', d.revision, 'mode', d.mode, 'status', d.status, 'status_reason', d.status_reason, 'source', d.source, 'match_type', d.match_type,
        'lock_present', d.lock is not null, 'map', d.map, 'workshop_id', d.workshop_id, 'aim_weapon', d.aim_weapon, 'target_rounds', d.target_rounds,
        'score_ct', d.score_ct, 'score_t', d.score_t, 'winner', d.winner, 'rounds_played', d.rounds_played, 'has_damage', d.has_damage, 'has_mvp', d.has_mvp,
        'started_at', d.started_at, 'ended_at', d.ended_at, 'duration_s', d.duration_s, 'player_count', d.player_count, 'agent_version', d.agent_version,
        'external_ref', d.external_ref, 'fingerprint', f.fingerprint,
        'decision', (select to_jsonb(r) - 'proposal' from berx_ranked_matches r where r.match_id = d.id),
        'ledger_rows', (select count(*) from berx_rating_changes c where c.match_id = d.id),
        'players', (select coalesce(jsonb_agg(jsonb_build_object(
              'steam_id', p.steam_id, 'name', p.name, 'team', p.team, 'kills', p.kills, 'deaths', p.deaths, 'assists', p.assists, 'headshot_kills', p.headshot_kills,
              'team_kills', p.team_kills, 'suicides', p.suicides, 'damage', p.damage, 'mvp', p.mvp, 'rounds_played', p.rounds_played, 'connected_at_end', p.connected_at_end,
              'result', p.result, 'user_id', u.id, 'nick', u.nick) order by p.team, p.steam_id), '[]'::jsonb)
            from berx_match_players p left join users u on u.steam_id = p.steam_id where p.match_id = d.id)
      ) order by d.started_at) from day d join fp f on f.id = d.id), '[]'::jsonb),
  'ratings', coalesce((select jsonb_agg(to_jsonb(r) order by r.user_id) from berx_ratings r), '[]'::jsonb),
  'ledger_summary', jsonb_build_object('rows', (select count(*) from berx_rating_changes), 'match_rows', (select count(*) from berx_rating_changes where kind = 'match'),
      'adjustments', (select count(*) from berx_rating_changes where kind = 'adjustment'), 'decisions', (select count(*) from berx_ranked_matches))
)) as berx_historical_export;
