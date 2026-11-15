// 007_ranking_hardening.sql — бодит PostgreSQL 16 (түр DB, production биш). PGHOST/PGPORT/PGUSER (superuser):
//   node tests/ranking/hardening.mjs
// Буруу BRP хэмжээ, буруу дүн, буруу тоглогч, хуучирсан revision, давхар олголт, feature flag, тоглолтын төлөв,
// 0-ийн доод хил, approve-ын хуучирсан/өөрчилсөн санал, backend-ийн бодит payload (lib/ranking.js decide) нийцтэй эсэх.
import { execFileSync, spawn } from 'child_process'; import path from 'path'; import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
process.env.SUPABASE_URL = '';
const RK = require('../../lib/ranking.js');
const { validateMatch } = require('../../lib/matches.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
if (!process.env.PGHOST) { console.log('SKIP: PGHOST тохируулаагүй'); process.exit(0); }
const DB = 'berx_rk7_test_' + process.pid;
const psql = (sql, db = DB) => execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const file = (f) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-f', path.join(ROOT, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const J = (x) => `$j$${JSON.stringify(x)}$j$::jsonb`;
const rpc = (fn, p) => JSON.parse(psql(`set role service_role; select ${fn}(${J(p)})::text`).split('\n').pop());
const fails = (sql) => { try { psql(sql); return null; } catch (e) { return String(e.stderr || e.message); } };
const rpcFails = (p) => fails(`set role service_role; select berx_apply_rating(${J(p)})`);
const asyncPsql = (sql) => new Promise((res) => { const p = spawn('psql', ['-X', '-q', '-At', '-d', DB, '-c', sql]); let o = '', e = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d); p.on('close', code => res({ code, out: o.trim(), err: e })); });

psql(`create database ${DB}`, 'postgres');
try {
  for (const r of ['anon', 'authenticated', 'service_role']) psql(`do $$ begin if not exists (select 1 from pg_roles where rolname='${r}') then create role ${r} nologin${r === 'service_role' ? ' bypassrls' : ''}; end if; end $$`);
  const S = (n) => (76561198000000000n + BigInt(n)).toString();
  psql(`create table users (id text primary key, nick text, steam_id text unique); insert into users select 'u' || lpad(g::text, 2, '0'), 'P' || g, (76561198000000000 + g)::text from generate_series(1, 14) g; grant select, insert, update, delete on users to service_role; revoke all on users from anon, authenticated;`);   // = 002_permissions.sql
  psql(`alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant all on sequences to service_role;`);
  file('supabase/005_match_history.sql'); file('supabase/006_rankings.sql');
  file('supabase/007_ranking_hardening.sql'); file('supabase/007_ranking_hardening.sql');
  ok(true, 'migration 005 → 006 → 007 ×2 (idempotent)');

  const T0 = Date.UTC(2026, 10, 15, 6);
  const setFlags = (o) => psql(`update berx_ranking_settings set ${Object.entries(o).map(([k, v]) => `${k} = ${v === null ? 'null' : v}`).join(', ')} where id = 1`);
  setFlags({ enabled: true, competitive: true, aim: true, enabled_at: T0 - 3600e3 });
  const settings = () => ({ ...JSON.parse(psql(`select row_to_json(s)::text from berx_ranking_settings s`)), rules: { min_duration_competitive_s: 0, min_duration_aim_s: 0, max_same_lineup_24h_competitive: 99, max_same_lineup_24h_aim: 99 } });
  const usersMap = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [S(i + 1), { id: 'u' + String(i + 1).padStart(2, '0') }]));

  let n = 0;
  const id = () => `0c0c0c0c-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const pl = (s, team, k, d, rp, dmg = 2000) => ({ steam_id: s, team, kills: k, deaths: d, assists: 3, headshot_kills: Math.floor(k / 2), damage: dmg, rounds_played: rp });
  function comp(o = {}, lockO = {}) {
    const ct = [1, 2, 3, 4, 5].map(S), t = [6, 7, 8, 9, 10].map(S), at = T0 + (++n) * 60e3;
    const lock = { v: 1, type: 'ranked', locked_at: at, agent: '1.5.0', roster: { CT: ct, T: t }, bots: 0, rules: { mode: 'competitive', map: 'de_mirage', server_mode: 'competitive', cheats: false }, guard: null, ...lockO };
    return validateMatch({ id: id(), server_id: 'main', source: 'matchzy', agent_version: '1.5.0', mode: 'competitive', map: 'de_mirage', status: 'completed', started_at: at, ended_at: at + 2400e3,
      rounds_played: 23, score_ct: 13, score_t: 10, winner: 'CT', has_damage: true, match_type: 'ranked', lock,
      players: [...ct.map((s, i) => pl(s, 'CT', 22 - i * 3, 14 + i, 23, 2600 - i * 300)), ...t.map((s, i) => pl(s, 'T', 19 - i * 3, 15 + i, 23, 2300 - i * 300))], ...o }, T0 + 9e9);
  }
  function aim(o = {}, lockO = {}) {
    const at = T0 + (++n) * 60e3;
    const lock = { v: 1, type: 'ranked', locked_at: at, agent: '1.5.0', roster: { CT: [S(11)], T: [S(12)] }, bots: 0, rules: { mode: 'aim1v1', map: 'aim_map1v1cfg', weapon: 'awp', target_rounds: 13 }, guard: { ok: true, version: '1.0.0' }, ...lockO };
    return validateMatch({ id: id(), server_id: 'main', source: 'cs2log', agent_version: '1.5.0', mode: 'aim1v1', map: 'aim_map1v1cfg', aim_weapon: 'awp', target_rounds: 13, status: 'completed',
      started_at: at, ended_at: at + 400e3, rounds_played: 20, score_ct: 13, score_t: 7, winner: 'CT', has_damage: true, match_type: 'ranked', lock,
      players: [pl(S(11), 'CT', 13, 7, 20, 1500), pl(S(12), 'T', 7, 13, 20, 900)], ...o }, T0 + 9e9);
  }
  const ingest = (m) => { rpc('berx_ingest_match', m); return m; };
  const stored = (m) => JSON.parse(psql(`select row_to_json(x)::text from berx_matches x where id='${m.id}'`));
  const players = (m) => JSON.parse(psql(`select coalesce(json_agg(x), '[]')::text from berx_match_players x where match_id='${m.id}'`));
  // backend-ийн rate()-тэй яг ижил payload (lib/ranking.js decide)
  const decided = (m) => { const sm = stored(m); return { sm, d: RK.decide(sm, players(m), { settings: settings(), users: usersMap, recentLineups: [], duplicateRef: false, now: Date.now() }) }; };
  const payload = (m, o = {}) => { const { sm, d } = decided(m); return { action: 'auto', match_id: m.id, revision: sm.revision, mode: sm.mode, status: d.status, reason: d.reason, formula: d.formula, proposal: d.proposal || null, changes: d.changes || [], ...o }; };
  const ledger = (m) => +psql(`select count(*) from berx_rating_changes where match_id='${m.id}'`);
  const dec = (m) => psql(`select status || '|' || coalesce(note, '') from berx_ranked_matches where match_id='${m.id}'`);
  // Автомат дуудлага: шалгалт унавал BRP олгохгүй, 'error' + шалтгаан
  const rejected = (m, p, why, label) => {
    const r = rpc('berx_apply_rating', p);
    const good = r.status === 'error' && ledger(m) === 0 && dec(m).startsWith('error|db_validation: ' + why);
    ok(good, `${label} → BRP олгоогүй, error (${why})${good ? '' : ' :: ' + JSON.stringify(r) + ' ' + dec(m)}`);
    psql(`delete from berx_ranked_matches where match_id='${m.id}'`);   // дараагийн оролдлогын төлөө (тест л)
  };

  /* ---------- 1. Backend-ийн бодит payload нийцтэй ---------- */
  console.log('\n== valid payloads (lib/ranking.js decide → SQL)');
  let m = ingest(comp());
  let r = rpc('berx_apply_rating', payload(m));
  ok(r.status === 'rated' && ledger(m) === 10, 'Competitive 5v5: backend-ийн payload хүлээн авагдсан (10 өөрчлөлт)');
  ok(psql(`select bool_and(case when result='win' then delta between 150 and 230 else delta between -200 and -130 end) from berx_rating_changes where match_id='${m.id}'`) === 't', 'Competitive BRP хязгаарт');
  const swapped = comp({ winner: 'T', score_ct: 10, score_t: 13 });
  swapped.players = swapped.players.map(x => ({ ...x, team: x.team === 'CT' ? 'T' : 'CT' }));
  m = ingest(swapped); r = rpc('berx_apply_rating', payload(m));
  ok(r.status === 'rated' && psql(`select string_agg(steam_id, ',' order by steam_id) from berx_rating_changes where match_id='${m.id}' and result='win'`) === [1, 2, 3, 4, 5].map(S).join(','), 'halftime-ийн дараа тал солигдсон: DB зөв бүлгийг ялагч гэж тооцсон');
  m = ingest(aim()); r = rpc('berx_apply_rating', payload(m));
  ok(r.status === 'rated' && psql(`select string_agg(delta::text, ',' order by delta) from berx_rating_changes where match_id='${m.id}'`) === '-30,30', 'AIM 1v1: ±30 хүлээн авагдсан');

  /* ---------- 2. Буруу BRP хэмжээ ---------- */
  console.log('\n== invalid BRP amounts');
  const tamper = (base, f) => { const p = JSON.parse(JSON.stringify(base)); f(p.changes); return p; };
  const cm = ingest(comp()), cp = payload(cm);
  const W = (cs) => cs.find(c => c.result === 'win'), L = (cs) => cs.find(c => c.result === 'loss');
  rejected(cm, tamper(cp, cs => { W(cs).delta_calc = 231; }), 'delta_out_of_range', 'Competitive хожил +231');
  rejected(cm, tamper(cp, cs => { W(cs).delta_calc = 149; }), 'delta_out_of_range', 'Competitive хожил +149');
  rejected(cm, tamper(cp, cs => { W(cs).delta_calc = 5000; }), 'delta_out_of_range', 'Competitive хожил +5000');
  rejected(cm, tamper(cp, cs => { L(cs).delta_calc = -201; }), 'delta_out_of_range', 'Competitive хожигдол −201');
  rejected(cm, tamper(cp, cs => { L(cs).delta_calc = -129; }), 'delta_out_of_range', 'Competitive хожигдол −129');
  rejected(cm, tamper(cp, cs => { L(cs).delta_calc = 150; }), 'delta_out_of_range', 'Competitive хожигдолд эерэг BRP');
  rejected(cm, tamper(cp, cs => { W(cs).delta_calc = 180.5; }), 'bad_delta', 'бутархай BRP');
  rejected(cm, tamper(cp, cs => { W(cs).delta_calc = '200; drop table x'; }), 'bad_delta', 'тоо биш BRP');
  rejected(cm, tamper(cp, cs => { W(cs).score = 101; }), 'bad_score', 'үзүүлэлт 101');
  rejected(cm, tamper(cp, cs => { W(cs).score = null; }), 'bad_score', 'Competitive үзүүлэлтгүй');
  const am = ingest(aim()), apl = payload(am);
  rejected(am, tamper(apl, cs => { W(cs).delta_calc = 31; }), 'delta_out_of_range', 'AIM хожил +31');
  rejected(am, tamper(apl, cs => { W(cs).delta_calc = 200; }), 'delta_out_of_range', 'AIM хожил Competitive хэмжээгээр (+200)');
  rejected(am, tamper(apl, cs => { L(cs).delta_calc = -29; }), 'delta_out_of_range', 'AIM хожигдол −29');
  rejected(am, tamper(apl, cs => { L(cs).delta_calc = 0; }), 'delta_out_of_range', 'AIM хожигдол 0');

  /* ---------- 3. Буруу дүн ---------- */
  console.log('\n== incorrect results');
  rejected(cm, tamper(cp, cs => { L(cs).result = 'win'; L(cs).delta_calc = 200; }), 'wrong_result', 'ялагдагчийг ялагч болгох');
  rejected(cm, tamper(cp, cs => { W(cs).result = 'loss'; W(cs).delta_calc = -150; }), 'wrong_result', 'ялагчийг ялагдагч болгох');
  rejected(am, tamper(apl, cs => { cs.forEach(c => { c.result = 'win'; c.delta_calc = 30; }); }), 'wrong_result', 'AIM: хоёулаа хожсон');
  rejected(am, tamper(apl, cs => { L(cs).result = 'draw'; }), 'wrong_result', 'дүн "draw"');

  /* ---------- 4. Буруу тоглогч ---------- */
  console.log('\n== invalid players');
  rejected(cm, tamper(cp, cs => { cs[0].steam_id = S(13); cs[0].user_id = 'u13'; }), 'changes_not_roster', 'roster-т байхгүй тоглогч');
  rejected(cm, tamper(cp, cs => { cs.pop(); }), 'changes_count', 'roster-ийн 1 тоглогч дутуу (9 өөрчлөлт)');
  rejected(cm, tamper(cp, cs => { cs.push({ ...cs[0], user_id: 'u14', steam_id: S(14) }); }), 'changes_count', '11 дэх тоглогч нэмэх');
  rejected(cm, tamper(cp, cs => { cs[1] = { ...cs[0] }; }), 'changes_not_roster', 'ижил тоглогч 2 удаа');
  rejected(cm, tamper(cp, cs => { cs[0].user_id = 'u14'; }), 'user_steam_mismatch', 'user_id ↔ SteamID зөрүүтэй (өөр хүнд BRP)');
  rejected(cm, tamper(cp, cs => { const a = cs[0].user_id; cs[0].user_id = cs[1].user_id; cs[1].user_id = a; }), 'user_steam_mismatch', '2 тоглогчийн user_id сольсон');
  psql(`update users set steam_id = null where id = 'u12'`);
  rejected(am, apl, 'user_steam_mismatch', 'Steam холболтоо салгасан тоглогч');
  psql(`update users set steam_id = '${S(12)}' where id = 'u12'`);
  const badRoster = ingest(comp({}, { roster: { CT: [1, 2, 3, 4].map(S), T: [6, 7, 8, 9, 10].map(S) } }));
  rejected(badRoster, payload(badRoster, { status: 'rated', reason: 'ok', changes: cp.changes }), 'roster_size', '4v5 lock');
  const tm = comp(); tm.players = tm.players.map(x => x.steam_id === S(6) ? { ...x, team: 'CT' } : x); ingest(tm);
  rejected(tm, { ...payload(tm), status: 'rated', reason: 'ok', changes: cp.changes.map(c => ({ ...c })) }, 'team_mismatch', 'тоглогч баг сольсон');

  /* ---------- 5. Тоглолтын төлөв ---------- */
  console.log('\n== match states');
  const forced = (mm, label, why) => { ingest(mm); const base = mm.mode === 'competitive' ? cp : apl; rejected(mm, { action: 'auto', match_id: mm.id, revision: 1, status: 'rated', reason: 'ok', formula: 'x', changes: base.changes }, why, label); };
  forced(aim({ target_rounds: 10, score_ct: 10, score_t: 7 }, { rules: { mode: 'aim1v1', map: 'aim_map1v1cfg', weapon: 'awp', target_rounds: 10 } }), 'First to 10', 'first_to_10');
  forced(aim({}, { rules: { mode: 'aim1v1', map: 'aim_map1v1cfg', weapon: 'awp', target_rounds: 10 } }), 'First to 10 (lock-ийн дүрэм)', 'first_to_10');
  forced(aim({}, { guard: { ok: false } }), 'AIM, Guard идэвхгүй', 'guard_missing');
  forced({ ...aim(), match_type: 'casual', lock: null }, 'Casual', 'no_lock');
  const cas = aim(); ingest({ ...cas, match_type: 'casual' }); psql(`update berx_matches set lock = ${J(cas.lock)} where id='${cas.id}'`);
  rejected(cas, { action: 'auto', match_id: cas.id, revision: 1, status: 'rated', reason: 'ok', changes: apl.changes }, 'not_ranked', 'Casual (lock-той байсан ч)');
  forced(aim({ status: 'aborted', winner: null }), 'aborted', 'not_completed');
  forced(aim({ status: 'interrupted', winner: null }), 'interrupted', 'not_completed');
  forced(comp({ winner: 'draw', score_ct: 12, score_t: 12, rounds_played: 24 }), 'тэнцээ', 'draw_or_no_winner');
  forced(comp({}, { bots: 2 }), 'bot оролцсон', 'bots');
  const caseC = ingest(comp());
  ok(/not in review/.test(rpcFails({ action: 'approve', match_id: caseC.id, revision: 1, admin_id: 'u01', note: 'force approve', changes: cp.changes }) || ''), 'review биш тоглолтыг approve-оор хүчээр олгох боломжгүй');

  /* ---------- 6. Feature flag, идэвхжсэн агшин ---------- */
  console.log('\n== feature flags & activation');
  const fm = ingest(comp()), fp = payload(fm);
  setFlags({ enabled: false }); rejected(fm, fp, 'ranking_disabled', 'нийт flag OFF'); setFlags({ enabled: true });
  setFlags({ competitive: false }); rejected(fm, fp, 'mode_disabled', 'Competitive flag OFF');
  const fa = ingest(aim()), fap = payload(fa);
  ok(fap.status === 'rated', '(Competitive OFF үед AIM хэвийн)'); setFlags({ competitive: true });
  setFlags({ aim: false }); rejected(fa, fap, 'mode_disabled', 'AIM flag OFF'); setFlags({ aim: true });
  setFlags({ enabled_at: null }); rejected(fm, fp, 'before_activation', 'enabled_at хоосон'); setFlags({ enabled_at: T0 - 3600e3 });
  const early = ingest(comp({ started_at: T0 - 7200e3, ended_at: T0 - 5000e3 }));
  rejected(early, { ...fp, match_id: early.id }, 'before_activation', 'идэвхжихээс өмнө эхэлсэн (retroactive)');
  const earlyLock = comp(); earlyLock.lock.locked_at = T0 - 7200e3; ingest(earlyLock);
  rejected(earlyLock, { ...fp, match_id: earlyLock.id }, 'before_activation', 'lock идэвхжихээс өмнө');
  setFlags({ enabled: false });
  r = rpc('berx_apply_rating', { action: 'auto', match_id: fa.id, revision: 1, status: 'not_eligible', reason: 'ranking_disabled', changes: [] });
  ok(r.status === 'not_eligible' && ledger(fa) === 0, 'flag OFF үед not_eligible шийдвэр бичигдэнэ (BRP-гүй)');
  setFlags({ enabled: true });

  /* ---------- 7. Хуучирсан revision ---------- */
  console.log('\n== stale revisions');
  const sm = ingest(comp()); const sp = payload(sm);
  rpc('berx_ingest_match', { ...sm, revision: 2 });
  ok(/stale revision/.test(rpcFails(sp) || '') && ledger(sm) === 0 && psql(`select count(*) from berx_ranked_matches where match_id='${sm.id}'`) === '0', 'хуучин revision (1 < 2) → татгалзсан, юу ч бичигдээгүй');
  ok(/stale revision/.test(rpcFails({ ...sp, revision: 3 }) || ''), 'ирээдүйн revision (3 > 2) → татгалзсан');
  ok(/revision required/.test(rpcFails({ ...sp, revision: undefined }) || ''), 'revision заавал');
  ok(rpc('berx_apply_rating', payload(sm)).status === 'rated', 'зөв revision (2) → rated');
  // review → flag → approve боломжгүй
  const rv = ingest(comp()); const rvp = payload(rv);
  rpc('berx_apply_rating', { ...rvp, status: 'review', reason: 'extra_player', proposal: { changes: rvp.changes }, changes: [] });
  rpc('berx_ingest_match', { ...rv, revision: 2 });
  r = rpc('berx_apply_rating', { ...rvp, revision: 2, status: 'review', reason: 'extra_player', changes: [] });
  ok(r.existing && r.flag === 'revised_after_rating', 'review хүлээж байхад тоглолт шинэчлэгдсэн → flag');
  ok(/outdated/.test(rpcFails({ action: 'approve', match_id: rv.id, revision: 2, admin_id: 'u01', note: 'approve old proposal', changes: rvp.changes }) || '') && ledger(rv) === 0, 'хуучирсан саналыг approve → татгалзсан');
  ok(/stale revision/.test(rpcFails({ action: 'approve', match_id: rv.id, revision: 1, admin_id: 'u01', note: 'approve old revision', changes: rvp.changes }) || ''), 'хуучин revision-тай approve → татгалзсан');
  ok(rpc('berx_apply_rating', { action: 'reject', match_id: rv.id, revision: 2, admin_id: 'u01', note: 'outdated, rejected' }).status === 'rejected', 'хуучирсан саналыг reject хийх боломжтой');

  /* ---------- 8. Approve: зөвхөн хадгалсан санал ---------- */
  console.log('\n== approve uses stored proposal');
  const ap1 = ingest(comp()); const app = payload(ap1);
  rpc('berx_apply_rating', { ...app, status: 'review', reason: 'too_short', proposal: { changes: app.changes }, changes: [] });
  ok(/differ from stored proposal/.test(rpcFails({ action: 'approve', match_id: ap1.id, revision: 1, admin_id: 'u01', note: 'tampered approve', changes: tamper(app, cs => { W(cs).delta_calc = 230; }).changes }) || ''), 'approve-д өөрчилсөн BRP илгээх → татгалзсан');
  r = rpc('berx_apply_rating', { action: 'approve', match_id: ap1.id, revision: 1, admin_id: 'u01', note: 'checked demo', changes: [] });
  ok(r.status === 'rated' && ledger(ap1) === 10 && psql(`select count(*) from berx_ranking_audit where action='review_approve' and target='${ap1.id}'`) === '1', 'approve → хадгалсан санал хэрэгжсэн + audit');
  const ap2 = ingest(comp()); const ap2p = payload(ap2);
  rpc('berx_apply_rating', { ...ap2p, status: 'review', reason: 'too_short', proposal: { changes: tamper(ap2p, cs => { W(cs).delta_calc = 999; }).changes }, changes: [] });
  ok(/validation failed: delta_out_of_range/.test(rpcFails({ action: 'approve', match_id: ap2.id, revision: 1, admin_id: 'u01', note: 'bad proposal', changes: [] }) || '') && ledger(ap2) === 0 && psql(`select status from berx_ranked_matches where match_id='${ap2.id}'`) === 'review', 'хадгалсан санал өөрөө буруу → approve татгалзсан, review хэвээр (rollback)');
  setFlags({ competitive: false });
  const ap3 = ingest(comp()); const ap3p = payload(ap3);
  setFlags({ competitive: true }); const ap3ok = payload(ap3); setFlags({ competitive: false });
  rpc('berx_apply_rating', { ...ap3p, status: 'review', reason: 'too_short', proposal: { changes: ap3ok.changes }, changes: [] });
  ok(/mode_disabled/.test(rpcFails({ action: 'approve', match_id: ap3.id, revision: 1, admin_id: 'u01', note: 'flag is off', changes: [] }) || ''), 'flag OFF үед approve → татгалзсан');
  setFlags({ competitive: true });

  /* ---------- 9. Давхар олголт, concurrency, error → retry ---------- */
  console.log('\n== duplicates');
  const dm = ingest(comp()); const dp = payload(dm);
  const res = await Promise.all(Array.from({ length: 8 }, () => asyncPsql(`set role service_role; select berx_apply_rating(${J(dp)})::text`)));
  const outs = res.map(x => { try { return JSON.parse(x.out.split('\n').pop()); } catch (e) { return {}; } });
  ok(outs.filter(o => o.status === 'rated' && !o.existing).length === 1 && outs.filter(o => o.existing).length === 7 && ledger(dm) === 10, '8 зэрэг дуудлага → 1 удаа олгосон');
  ok(rpc('berx_apply_rating', dp).existing && ledger(dm) === 10, 'дахин дуудлага → давхар олголтгүй');
  ok(/unique|duplicate key/.test(fails(`set role service_role; insert into berx_rating_changes (kind, match_id, user_id, steam_id, result, delta_calc, delta, prev_brp, new_brp, reason, created_at) values ('match', '${dm.id}', 'u01', '${S(1)}', 'win', 200, 200, 1, 201, 'x', 1)`) || ''), 'unique(match_id, user_id) хэвээр');
  ok(/permission denied/.test(fails(`set role service_role; update berx_rating_changes set delta = 1`) || '') && /permission denied/.test(fails(`set role service_role; delete from berx_ranking_audit`) || ''), 'ledger/audit өөрчлөгдөшгүй хэвээр');
  const em = ingest(comp()); const ep = payload(em);
  rpc('berx_apply_rating', tamper(ep, cs => { W(cs).delta_calc = 400; }));
  ok(dec(em).startsWith('error|db_validation') && ledger(em) === 0, 'буруу payload → error төлөв (admin "Алдаа"-нд)');
  ok(rpc('berx_apply_rating', ep).status === 'rated' && ledger(em) === 10, 'error → зөв payload-оор дахин тооцоолох боломжтой (retry)');

  /* ---------- 10. 0-ийн доод хил ---------- */
  console.log('\n== zero floor');
  psql(`update berx_ratings set brp = 12 where user_id = 'u12'`);
  const zm = ingest(aim()); rpc('berx_apply_rating', payload(zm));
  ok(psql(`select delta_calc || ',' || delta || ',' || new_brp from berx_rating_changes where match_id='${zm.id}' and user_id='u12'`) === '-30,-12,0', '0-ийн доод хил хэвээр: −30 → −12 (0 BRP)');

  /* ---------- 11. Эрх ---------- */
  console.log('\n== permissions');
  ok(/permission denied/.test(fails(`set role authenticated; select berx_rating_validate('x', '[]'::jsonb)`) || '') && /permission denied/.test(fails(`set role anon; select berx_apply_rating('{}'::jsonb)`) || ''), 'browser role-д функц ажиллуулах эрхгүй');

  /* ---------- 12. Rollback ---------- */
  console.log('\n== rollback');
  const before = psql('select count(*) from berx_rating_changes') + '/' + psql('select count(*) from berx_ranked_matches');
  file('supabase/007_ranking_hardening_rollback.sql');
  ok(psql(`select count(*) from pg_proc where proname = 'berx_rating_validate'`) === '0' && psql('select count(*) from berx_rating_changes') + '/' + psql('select count(*) from berx_ranked_matches') === before, 'rollback: 006-ийн функц сэргэсэн, өгөгдөл хөндөгдөөгүй');
  file('supabase/007_ranking_hardening.sql');
  ok(psql(`select count(*) from pg_proc where proname = 'berx_rating_validate'`) === '1', 'rollback → дахин 007 ажиллана');
} finally { psql(`drop database if exists ${DB}`, 'postgres'); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
