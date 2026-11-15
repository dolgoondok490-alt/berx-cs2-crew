// 005_match_history.sql — бодит PostgreSQL дээр (production биш, түр DB).
//   PGHOST/PGPORT/PGUSER (superuser) тохируулсан үед: node tests/matches/sql.mjs
import { execFileSync } from 'child_process'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { validateMatch, ingestLocal } = require('../../lib/matches.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
if (!process.env.PGHOST) { console.log('SKIP: PGHOST тохируулаагүй'); process.exit(0); }
const DB = 'berx_mh_test_' + process.pid;
const psql = (sql, db = DB, extra = []) => execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, ...extra, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const file = (f) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-f', path.join(ROOT, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const fails = (sql) => { try { psql(sql); return null; } catch (e) { return String(e.stderr || e.message); } };
psql(`create database ${DB}`, 'postgres');
try {
  for (const r of ['anon', 'authenticated', 'service_role']) psql(`do $$ begin if not exists (select 1 from pg_roles where rolname='${r}') then create role ${r} nologin${r === 'service_role' ? ' bypassrls' : ''}; end if; end $$`);
  // Одоо байгаа өгөгдөл (users, skin_loadouts) migration/rollback-д хөндөгдөхгүйг шалгана
  psql(`create table users (id text primary key, steam_id text); insert into users values ('u1','76561197960266729');
        create table skin_loadouts (steam_id text primary key, loadout jsonb); insert into skin_loadouts values ('76561197960266729','{"2":{}}');`);
  file('supabase/005_match_history.sql'); file('supabase/005_match_history_rollback.sql'); file('supabase/005_match_history.sql'); file('supabase/005_match_history.sql');
  ok(psql(`select count(*) from information_schema.tables where table_name in ('berx_matches','berx_match_players')`) === '2', 'migration → rollback → migration ×2 (idempotent)');
  ok(psql(`select (select count(*) from users) || ',' || (select count(*) from skin_loadouts)`) === '1,1', 'одоо байгаа users / skin_loadouts хөндөгдөөгүй');
  ok(psql(`select string_agg(relname || '=' || relrowsecurity, ',' order by relname) from pg_class where relname in ('berx_matches','berx_match_players')`) === 'berx_match_players=true,berx_matches=true', 'RLS асаалттай (2 хүснэгт)');

  const now = Date.UTC(2026, 10, 15, 6, 30);
  const S = (n) => (76561197960265728n + BigInt(n)).toString();
  const base = { id: '0a0a0a0a-0000-4000-8000-000000000001', revision: 1, server_id: 'main', source: 'cs2log', external_ref: null, agent_version: '1.4.0',
    mode: 'aim1v1', map: 'aim_map1v1cfg', workshop_id: '3418431100', aim_weapon: 'awp', target_rounds: 10, status: 'completed', status_reason: null,
    started_at: now - 600000, ended_at: now, rounds_played: 17, score_ct: 10, score_t: 7, winner: 'CT', has_damage: true, has_mvp: false,
    players: [{ steam_id: S(1001), name: "Dok 'q\"<3", team: 'CT', kills: 25, deaths: 12, assists: 1, headshot_kills: 14, team_kills: 0, suicides: 0, damage: 2100, mvp: null, rounds_played: 17, connected_at_end: true },
      { steam_id: S(1002), name: 'Kaze', team: 'T', kills: 12, deaths: 25, assists: 0, headshot_kills: 3, team_kills: 0, suicides: 1, damage: 1200, mvp: null, rounds_played: 17, connected_at_end: true }] };
  const m = validateMatch(base, now + 1000);
  const call = (x, role = 'service_role') => psql(`set role ${role}; select berx_ingest_match($j$${JSON.stringify(x)}$j$::jsonb)::text`).split('\n').pop();
  let r = JSON.parse(call(m));
  ok(r.ok && r.duplicate === false, 'service_role: berx_ingest_match → бичигдсэн');
  ok(JSON.parse(call(m)).duplicate === true && psql('select count(*) from berx_match_players') === '2', 'ижил ID/revision дахин → duplicate, давхардаагүй');
  ok(psql(`select string_agg(steam_id || ':' || result || ':' || duration_s, ',' order by steam_id) from berx_match_players join berx_matches on id = match_id`) === `${S(1001)}:win:600,${S(1002)}:loss:600`, 'win/loss SQL-д тооцоологдсон, duration_s');
  ok(psql(`select name from berx_match_players where steam_id='${S(1001)}'`) === "Dok 'q\"<3", 'тусгай тэмдэгттэй нэр аюулгүй (SQL injection-гүй)');
  // JS (локал DB / тестийн хуурамч Supabase) = SQL
  const T = {}; ingestLocal(T, m, now);
  const sqlRows = JSON.parse(psql(`select json_agg(x order by steam_id)::text from (select steam_id, team, kills, deaths, assists, headshot_kills, damage, mvp, rounds_played, result, mode, status, started_at from berx_match_players) x`));
  const jsRows = T.berx_match_players.map(x => ({ steam_id: x.steam_id, team: x.team, kills: x.kills, deaths: x.deaths, assists: x.assists, headshot_kills: x.headshot_kills, damage: x.damage, mvp: x.mvp, rounds_played: x.rounds_played, result: x.result, mode: x.mode, status: x.status, started_at: x.started_at })).sort((a, b) => a.steam_id.localeCompare(b.steam_id));
  ok(JSON.stringify(sqlRows) === JSON.stringify(jsRows), 'JS ingestLocal нь SQL функцтэй яг ижил мөр үүсгэнэ');
  // revision 2 → тоглогчдыг бүрэн солино (хуучин мөр үлдэхгүй)
  r = JSON.parse(call({ ...m, revision: 2, players: [m.players[0]] }));
  ok(!r.duplicate && psql('select count(*) from berx_match_players') === '1' && psql('select player_count from berx_matches') === '1', 'өндөр revision → transaction дотор бүрэн солигдсон');
  // өөр ID, ижил сервер+цаг → unique
  ok(/berx_matches_server_id_started_at_key|duplicate key/.test(fails(`set role service_role; select berx_ingest_match($j$${JSON.stringify({ ...m, id: '0a0a0a0a-0000-4000-8000-000000000002' })}$j$::jsonb)`) || ''), 'өөр ID-тай давхардал (server_id, started_at) → татгалзана');
  // transaction: тоглогч буруу бол тоглолт ч бичигдэхгүй
  const bad = { ...m, id: '0a0a0a0a-0000-4000-8000-000000000003', started_at: now - 100000, players: [{ ...m.players[0], steam_id: 'Dok' }] };
  ok(!!fails(`set role service_role; select berx_ingest_match($j$${JSON.stringify(bad)}$j$::jsonb)`) && psql(`select count(*) from berx_matches where id='${bad.id}'`) === '0', 'буруу тоглогч → бүхэлдээ rollback (хагас бичигдэхгүй)');
  ok(!!fails(`set role service_role; select berx_ingest_match($j$${JSON.stringify({ ...m, id: '0a0a0a0a-0000-4000-8000-000000000004', started_at: now - 50000, players: [{ ...m.players[0], headshot_kills: 99 }] })}$j$::jsonb)`), 'check constraint: headshot > kills');
  ok(!!fails(`set role service_role; select berx_ingest_match($j$${JSON.stringify({ ...m, id: '0a0a0a0a-0000-4000-8000-000000000005', started_at: now - 40000, status: 'completed', winner: null })}$j$::jsonb)`), 'check: completed тоглолтод ялагч заавал');
  // эрх: browser role-ууд
  ok(/permission denied/.test(fails('set role anon; select * from berx_matches') || ''), 'anon: SELECT хориотой');
  ok(/permission denied/.test(fails('set role authenticated; select * from berx_match_players') || ''), 'authenticated: SELECT хориотой');
  ok(/permission denied/.test(fails(`set role anon; select berx_ingest_match('{}'::jsonb)`) || ''), 'anon: berx_ingest_match ажиллуулах эрхгүй');
  ok(/permission denied/.test(fails(`set role authenticated; insert into berx_matches (id) values ('x')`) || ''), 'authenticated: INSERT хориотой');
  // rollback
  file('supabase/005_match_history_rollback.sql');
  ok(psql(`select count(*) from information_schema.tables where table_name like 'berx_match%'`) === '0' && psql(`select count(*) from pg_proc where proname='berx_ingest_match'`) === '0', 'rollback: зөвхөн match history объектууд устсан');
  ok(psql(`select (select count(*) from users) || ',' || (select count(*) from skin_loadouts)`) === '1,1', 'rollback-ийн дараа users / skin_loadouts хэвээр');
} catch (e) { ok(false, 'SQL алдаа: ' + (e.stderr || e.message)); }
finally { try { psql(`drop database if exists ${DB}`, 'postgres'); } catch (e) { /* ignore */ } }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
