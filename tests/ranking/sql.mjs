// 006_rankings.sql — бодит PostgreSQL 16 дээр (production биш, түр DB). PGHOST/PGPORT/PGUSER (superuser) тохируулсан үед:
//   node tests/ranking/sql.mjs
// Шалгана: idempotent migration, rollback, RLS/эрх, ledger өөрчлөгдөшгүй, атомик, зэрэг дуудлага (concurrency), 0-ийн хил,
//          revision дахин олгохгүй, review/approve/reject, засвар+audit, ingest-ийн match_type/lock түгжээ, JS mirror = SQL.
import { execFileSync, spawn } from 'child_process'; import path from 'path'; import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
process.env.SUPABASE_URL = '';
const RK = require('../../lib/ranking.js');
const { validateMatch, ingestLocal } = require('../../lib/matches.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
if (!process.env.PGHOST) { console.log('SKIP: PGHOST тохируулаагүй'); process.exit(0); }
const DB = 'berx_rk_test_' + process.pid;
const psql = (sql, db = DB) => execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const file = (f) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-f', path.join(ROOT, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const fails = (sql) => { try { psql(sql); return null; } catch (e) { return String(e.stderr || e.message); } };
const J = (x) => `$j$${JSON.stringify(x)}$j$::jsonb`;
const rpc = (fn, p, role = 'service_role') => JSON.parse(psql(`set role ${role}; select ${fn}(${J(p)})::text`).split('\n').pop());
const asyncPsql = (sql) => new Promise((res) => { const p = spawn('psql', ['-X', '-q', '-At', '-d', DB, '-c', sql]); let o = '', e = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d); p.on('close', code => res({ code, out: o.trim(), err: e })); });

psql(`create database ${DB}`, 'postgres');
try {
  for (const r of ['anon', 'authenticated', 'service_role']) psql(`do $$ begin if not exists (select 1 from pg_roles where rolname='${r}') then create role ${r} nologin${r === 'service_role' ? ' bypassrls' : ''}; end if; end $$`);
  const S = (n) => (76561198000000000n + BigInt(n)).toString();
  psql(`create table users (id text primary key, nick text, steam_id text unique); insert into users select 'u' || lpad(g::text, 2, '0'), 'P' || g, (76561198000000000 + g)::text from generate_series(1, 12) g;
        create table skin_loadouts (steam_id text primary key, loadout jsonb); insert into skin_loadouts values ('${S(1)}', '{}');`);
  // Supabase-ийн default privileges-ийг дуурайна (service_role-д бүх эрх) — ledger-ийн UPDATE/DELETE-ийг migration хааж буйг шалгахын тулд
  psql(`alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant all on sequences to service_role;`);

  /* ---------- migration ---------- */
  file('supabase/005_match_history.sql');
  const T0 = Date.UTC(2026, 10, 15, 6);
  // 006-аас ӨМНӨ бичигдсэн хуучин тоглолт (Phase 1/2)
  const old = validateMatch({ id: '0a0a0a0a-0000-4000-8000-0000000000aa', server_id: 'main', source: 'cs2log', mode: 'aim1v1', map: 'aim_map1v1cfg', aim_weapon: 'awp', target_rounds: 13, status: 'completed',
    started_at: T0 - 90000e3, ended_at: T0 - 89000e3, rounds_played: 20, score_ct: 13, score_t: 7, winner: 'CT', players: [{ steam_id: S(1), team: 'CT', kills: 13, deaths: 7, assists: 0, headshot_kills: 3, rounds_played: 20 }] }, T0);
  rpc('berx_ingest_match', old);
  file('supabase/006_rankings.sql'); file('supabase/006_rankings.sql');
  file('supabase/006_rankings_rollback.sql');
  ok(psql(`select count(*) from information_schema.tables where table_name like 'berx_rank%' or table_name in ('berx_ratings','berx_rating_changes')`) === '0' && psql(`select count(*) from information_schema.columns where table_name='berx_matches' and column_name='lock'`) === '0', 'rollback: 006-ийн хүснэгт, багана бүрэн хасагдсан');
  ok(JSON.parse(JSON.stringify(rpc('berx_ingest_match', { ...old, id: '0a0a0a0a-0000-4000-8000-0000000000ab', started_at: old.started_at + 1, ended_at: old.ended_at + 1 }))).ok, 'rollback-ийн дараа 005-ийн ingest хэвийн');
  file('supabase/006_rankings.sql'); file('supabase/006_rankings.sql');
  ok(psql(`select count(*) from information_schema.tables where table_name in ('berx_ranking_settings','berx_ratings','berx_ranked_matches','berx_rating_changes','berx_ranking_audit')`) === '5', 'migration → rollback → migration ×2 (idempotent)');
  ok(psql(`select (select count(*) from users) || ',' || (select count(*) from skin_loadouts) || ',' || (select count(*) from berx_matches) || ',' || (select count(*) from berx_match_players)`) === '12,1,2,2', 'одоо байгаа users / skin / Match History хөндөгдөөгүй');
  ok(psql(`select enabled || ',' || competitive || ',' || aim || ',' || coalesce(enabled_at::text, 'null') from berx_ranking_settings`) === 'false,false,false,null', 'бүх flag анхдагчаар унтраалттай, enabled_at хоосон');
  ok(psql(`select count(*) from berx_ratings`) === '0' && psql(`select match_type from berx_matches where id='${old.id}'`) === 'casual', 'retroactive BRP байхгүй, хуучин тоглолт casual хэвээр');
  ok(psql(`select string_agg(relname || '=' || relrowsecurity, ',' order by relname) from pg_class where relname in ('berx_ranking_settings','berx_ratings','berx_ranked_matches','berx_rating_changes','berx_ranking_audit')`)
    === 'berx_ranked_matches=true,berx_ranking_audit=true,berx_ranking_settings=true,berx_rating_changes=true,berx_ratings=true', 'RLS асаалттай (5 хүснэгт)');

  /* ---------- эрх ---------- */
  for (const t of ['berx_ratings', 'berx_rating_changes', 'berx_ranked_matches', 'berx_ranking_settings', 'berx_ranking_audit']) {
    ok(/permission denied/.test(fails(`set role anon; select * from ${t}`) || '') && /permission denied/.test(fails(`set role authenticated; select * from ${t}`) || ''), `anon/authenticated: ${t} SELECT хориотой`);
  }
  ok(/permission denied/.test(fails(`set role authenticated; update berx_ratings set brp = 99999`) || ''), 'authenticated: BRP шууд засах боломжгүй');
  for (const f of ["berx_apply_rating('{}'::jsonb)", "berx_adjust_rating('{}'::jsonb)", "berx_update_ranking_settings('{}'::jsonb)", 'berx_ranking_summary()'])
    ok(/permission denied/.test(fails(`set role authenticated; select ${f}`) || '') && /permission denied/.test(fails(`set role anon; select ${f}`) || ''), `browser role: ${f.split('(')[0]} ажиллуулах эрхгүй`);

  /* ---------- ingest: match_type + lock түгжээ ---------- */
  const lockA = (a, b) => ({ v: 1, type: 'ranked', locked_at: T0, agent: '1.5.0', roster: { CT: a, T: b }, bots: 0, rules: { mode: a.length === 1 ? 'aim1v1' : 'aim2v2', map: 'aim_map1v1cfg', weapon: 'awp', target_rounds: 13 }, guard: { ok: true, version: '1.0.0' } });
  let n = 0;
  const aim = (a, b, winner = 'CT', o = {}) => validateMatch({ id: `0b0b0b0b-0000-4000-8000-${String(++n).padStart(12, '0')}`, server_id: 'main', source: 'cs2log', agent_version: '1.5.0', mode: 'aim1v1', map: 'aim_map1v1cfg', aim_weapon: 'awp',
    target_rounds: 13, status: 'completed', started_at: T0 + n * 1000, ended_at: T0 + n * 1000 + 400e3, rounds_played: 22, score_ct: winner === 'CT' ? 13 : 9, score_t: winner === 'CT' ? 9 : 13, winner,
    match_type: 'ranked', lock: lockA([a], [b]), players: [{ steam_id: a, team: 'CT', kills: 13, deaths: 9, assists: 0, headshot_kills: 4, rounds_played: 22 }, { steam_id: b, team: 'T', kills: 9, deaths: 13, assists: 0, headshot_kills: 2, rounds_played: 22 }], ...o }, T0 + 9e9);
  const m1 = aim(S(1), S(2));
  rpc('berx_ingest_match', m1);
  ok(psql(`select match_type || ',' || (lock->'roster'->'CT'->>0) from berx_matches where id='${m1.id}'`) === `ranked,${S(1)}`, 'ingest: ranked + lock хадгалагдсан');
  rpc('berx_ingest_match', { ...m1, revision: 2, match_type: 'casual', lock: null });
  ok(psql(`select match_type || ',' || (lock is not null) || ',' || revision from berx_matches where id='${m1.id}'`) === 'ranked,true,2', 'revision: match_type/lock өөрчлөгдөхгүй (эхлэхэд түгжсэн)');
  ok(/ranked without lock/.test(fails(`set role service_role; select berx_ingest_match(${J({ ...aim(S(3), S(4)), lock: null })})`) || ''), 'SQL: ranked + lock байхгүй → татгалзана');

  /* ---------- apply: үндсэн ---------- */
  const chg = (m, deltaW = 30) => [{ user_id: 'u' + m.lock.roster.CT[0].slice(-2), steam_id: m.lock.roster.CT[0], result: m.winner === 'CT' ? 'win' : 'loss', delta_calc: m.winner === 'CT' ? deltaW : -deltaW, reason: 'AIM', detail: { fixed: 30 } },
    { user_id: 'u' + m.lock.roster.T[0].slice(-2), steam_id: m.lock.roster.T[0], result: m.winner === 'T' ? 'win' : 'loss', delta_calc: m.winner === 'T' ? deltaW : -deltaW, reason: 'AIM', detail: { fixed: 30 } }];
  const ap = (m, o = {}) => ({ action: 'auto', match_id: m.id, revision: m.revision || 1, mode: m.mode, status: 'rated', reason: 'ok', formula: 'aim-fixed-v1', ...o, changes: o.changes || chg(m) });
  let r = rpc('berx_apply_rating', ap(m1, { revision: 2 }));
  ok(r.status === 'rated' && psql(`select string_agg(user_id || '=' || brp, ',' order by user_id) from berx_ratings`) === 'u01=1030,u02=970', 'rated: 1000-аас эхэлж ±30');
  r = rpc('berx_apply_rating', ap(m1, { revision: 2 }));
  ok(r.existing && psql('select count(*) from berx_rating_changes') === '2', 'ижил тоглолт дахин → давхар олголт байхгүй');
  r = rpc('berx_apply_rating', ap(m1, { revision: 3, status: 'review', reason: 'ok' }));
  ok(r.existing && r.flag === 'revised_after_rating' && psql('select count(*) from berx_rating_changes') === '2', 'шийдвэрийн дараах revision → зөвхөн flag, дахин олгохгүй');
  ok(/unique|duplicate key/.test(fails(`set role service_role; insert into berx_rating_changes (kind, match_id, user_id, steam_id, result, delta_calc, delta, prev_brp, new_brp, reason, created_at) values ('match', '${m1.id}', 'u01', '${S(1)}', 'win', 30, 30, 1030, 1060, 'x', 1)`) || ''), 'unique(match_id, user_id): ledger-т давхар мөр орохгүй');
  ok(/check/.test(fails(`set role service_role; insert into berx_rating_changes (kind, user_id, steam_id, delta_calc, delta, prev_brp, new_brp, reason, created_by, created_at) values ('adjustment', 'u01', '${S(1)}', 5, 5, 1030, 1099, 'x', 'a', 1)`) || ''), 'check: new_brp = prev_brp + delta');
  ok(/permission denied/.test(fails(`set role service_role; update berx_rating_changes set delta = 999`) || '') && /permission denied/.test(fails(`set role service_role; delete from berx_rating_changes`) || ''), 'ledger: service_role ч UPDATE/DELETE хийж чадахгүй (зөвхөн нэмэгдэнэ)');
  ok(/violates foreign key|restrict/.test(fails(`delete from berx_matches where id='${m1.id}'`) || ''), 'BRP олгосон тоглолтыг Match History-оос устгах боломжгүй (restrict)');
  // casual тоглолтод олгох оролдлого
  const mcB = aim(S(5), S(6)), mc = { ...mcB, match_type: 'casual', lock: null }; rpc('berx_ingest_match', mc);
  ok(/not a completed ranked match/.test(fails(`set role service_role; select berx_apply_rating(${J(ap(mc, { changes: chg(mcB) }))})`) || '') && psql(`select count(*) from berx_ranked_matches where match_id='${mc.id}'`) === '0', 'Casual тоглолтод BRP → татгалзаж, бүхэлдээ rollback (шийдвэр ч үлдэхгүй)');
  // атомик: 2 дахь тоглогч алдаатай → эхнийх нь ч бичигдэхгүй
  const ma = aim(S(7), S(8)); rpc('berx_ingest_match', ma);
  const badC = chg(ma); badC[1].result = 'draw';
  ok(!!fails(`set role service_role; select berx_apply_rating(${J(ap(ma, { changes: badC }))})`) && psql(`select count(*) from berx_ratings where user_id in ('u07','u08')`) === '0' && psql(`select count(*) from berx_ranked_matches where match_id='${ma.id}'`) === '0', 'атомик: алдаа гарвал хагас бичигдэхгүй');
  // not_eligible → BRP хөдлөхгүй, дараа нь rated болгох боломжгүй
  r = rpc('berx_apply_rating', ap(ma, { status: 'not_eligible', reason: 'unlinked_player', changes: [] }));
  r = rpc('berx_apply_rating', ap(ma));
  ok(r.existing && r.status === 'not_eligible' && psql(`select count(*) from berx_rating_changes where match_id='${ma.id}'`) === '0', 'not_eligible шийдвэр эцсийнх (дахин дуудахад олгохгүй)');
  // error → дахин оролдлого
  const me = aim(S(9), S(10)); rpc('berx_ingest_match', me);
  rpc('berx_apply_rating', ap(me, { status: 'error', reason: 'error', changes: [] }));
  r = rpc('berx_apply_rating', ap(me));
  ok(r.status === 'rated' && psql(`select status from berx_ranked_matches where match_id='${me.id}'`) === 'rated', 'error төлөвтэй → дахин тооцоолж болно');

  /* ---------- 0-ийн хил ---------- */
  psql(`update berx_ratings set brp = 15 where user_id = 'u10'`);
  const mz = aim(S(9), S(10)); rpc('berx_ingest_match', mz);
  rpc('berx_apply_rating', ap(mz));
  ok(psql(`select delta_calc || ',' || delta || ',' || new_brp from berx_rating_changes where match_id='${mz.id}' and user_id='u10'`) === '-30,-15,0' && psql(`select brp from berx_ratings where user_id='u10'`) === '0', '0-ээс доош орохгүй: −30 → −15 (0 BRP)');
  ok(/check/.test(fails(`set role service_role; update berx_ratings set brp = -1 where user_id='u10'`) || ''), 'check: brp >= 0');

  /* ---------- concurrency ---------- */
  // (а) ижил тоглолтыг 8 зэрэг дуудлага → ганц шийдвэр, ганц удаа олгоно
  const mp = aim(S(11), S(12)); rpc('berx_ingest_match', mp);
  const res = await Promise.all(Array.from({ length: 8 }, () => asyncPsql(`set role service_role; select berx_apply_rating(${J(ap(mp))})::text`)));
  const outs = res.map(x => { try { return JSON.parse(x.out.split('\n').pop()); } catch (e) { return { err: x.err }; } });
  ok(outs.filter(o => o.status === 'rated' && !o.existing).length === 1 && outs.filter(o => o.existing).length === 7 && psql(`select count(*) from berx_rating_changes where match_id='${mp.id}'`) === '2'
    && psql(`select brp from berx_ratings where user_id='u11'`) === '1030', `8 зэрэг дуудлага → 1 олголт, 7 "existing" (${outs.map(o => o.existing ? 'E' : o.status ? 'R' : 'X').join('')})`);
  // (б) нэг тоглогч 6 өөр тоглолтод зэрэг → бүх өөрчлөлт хадгалагдана (lost update байхгүй)
  const ms = Array.from({ length: 6 }, (_, i) => aim(S(3), S(4), i % 3 === 0 ? 'T' : 'CT'));
  for (const m of ms) rpc('berx_ingest_match', m);
  const before3 = 1000, exp3 = before3 + ms.reduce((x, m) => x + (m.winner === 'CT' ? 30 : -30), 0);
  await Promise.all(ms.map(m => asyncPsql(`set role service_role; select berx_apply_rating(${J(ap(m))})::text`)));
  ok(psql(`select brp || ',' || ranked_matches || ',' || wins || ',' || losses from berx_ratings where user_id='u03'`) === `${exp3},6,4,2`, `зэрэг 6 тоглолт нэг тоглогчид → ${exp3} BRP, 6 тоглолт (lost update-гүй)`);
  ok(psql(`select bool_and(new_brp = prev_brp + delta) from berx_rating_changes`) === 't' && psql(`with x as (select user_id, sum(delta) s from berx_rating_changes group by user_id) select bool_and(r.brp = 1000 + x.s) from berx_ratings r join x using (user_id) where user_id <> 'u10'`) === 't',
    'ledger-ийн нийлбэр = berx_ratings (кэш ledger-тэй таарна; u10-г тест гараар 15 болгосон тул хассан)');
  // (в) хоёр тоглогчийг эсрэг дарааллаар түгжих 2 тоглолт зэрэг → deadlock-гүй
  const x1 = aim(S(5), S(6)), x2 = aim(S(6), S(5)); rpc('berx_ingest_match', x1); rpc('berx_ingest_match', x2);
  const dl = await Promise.all([x1, x2].map(m => asyncPsql(`set role service_role; select berx_apply_rating(${J(ap(m))})::text`)));
  ok(dl.every(x => x.code === 0 && !/deadlock/.test(x.err)) && psql(`select brp from berx_ratings where user_id='u05'`) === '1000', 'эсрэг дараалал → deadlock-гүй (user_id-аар эрэмбэлж түгжинэ)');

  /* ---------- review / approve / reject / adjust / settings ---------- */
  const mr = aim(S(1), S(2)); rpc('berx_ingest_match', mr);
  rpc('berx_apply_rating', ap(mr, { status: 'review', reason: 'extra_player', proposal: { changes: chg(mr) }, changes: [] }));
  ok(psql(`select count(*) from berx_rating_changes where match_id='${mr.id}'`) === '0' && psql(`select proposal is not null from berx_ranked_matches where match_id='${mr.id}'`) === 't', 'review: BRP хөдлөхгүй, санал хадгалагдсан');
  ok(/reason required/.test(fails(`set role service_role; select berx_apply_rating(${J({ action: 'approve', match_id: mr.id, admin_id: 'u01', note: 'ok', changes: chg(mr) })})`) || ''), 'approve: шалтгаан заавал');
  rpc('berx_apply_rating', { action: 'approve', match_id: mr.id, admin_id: 'u01', note: 'watched demo', formula: 'aim-fixed-v1', changes: chg(mr) });
  ok(psql(`select count(*) from berx_rating_changes where match_id='${mr.id}'`) === '2' && psql(`select decided_by from berx_ranked_matches where match_id='${mr.id}'`) === 'u01' && psql(`select count(*) from berx_ranking_audit where action='review_approve'`) === '1', 'approve → BRP + audit');
  ok(/not in review/.test(fails(`set role service_role; select berx_apply_rating(${J({ action: 'approve', match_id: mr.id, admin_id: 'u01', note: 'second time', changes: chg(mr) })})`) || ''), 'дахин approve → татгалзана');
  const mj = aim(S(1), S(2)); rpc('berx_ingest_match', mj);
  rpc('berx_apply_rating', ap(mj, { status: 'review', reason: 'too_short', changes: [] }));
  rpc('berx_apply_rating', { action: 'reject', match_id: mj.id, admin_id: 'u01', note: 'test game' });
  ok(psql(`select status from berx_ranked_matches where match_id='${mj.id}'`) === 'rejected' && psql(`select count(*) from berx_rating_changes where match_id='${mj.id}'`) === '0', 'reject → BRP байхгүй');
  ok(/reason required/.test(fails(`set role service_role; select berx_adjust_rating(${J({ user_id: 'u01', steam_id: S(1), delta: 10, reason: 'no', admin_id: 'u01' })})`) || ''), 'засвар: шалтгаан заавал');
  ok(/1\.\.1000/.test(fails(`set role service_role; select berx_adjust_rating(${J({ user_id: 'u01', steam_id: S(1), delta: 1001, reason: 'too much', admin_id: 'u01' })})`) || ''), 'засвар: ±1000 хязгаар');
  const b1 = +psql(`select brp from berx_ratings where user_id='u01'`);
  r = rpc('berx_adjust_rating', { user_id: 'u01', steam_id: S(1), delta: -50, reason: 'cheat penalty', admin_id: 'u12' });
  ok(r.new_brp === b1 - 50 && psql(`select count(*) from berx_ranking_audit where action='adjust' and admin_id='u12'`) === '1' && psql(`select kind || ',' || created_by from berx_rating_changes where id=${r.change_id}`) === 'adjustment,u12', 'засвар → ledger (adjustment) + audit');
  let s = rpc('berx_update_ranking_settings', { admin_id: 'u01', enabled: true, aim: true, reason: 'guard verified' });
  const ea = s.enabled_at;
  s = rpc('berx_update_ranking_settings', { admin_id: 'u01', enabled: false }); s = rpc('berx_update_ranking_settings', { admin_id: 'u01', enabled: true });
  ok(s.enabled && s.aim && !s.competitive && s.enabled_at === ea && psql(`select count(*) from berx_ranking_audit where action='settings'`) === '3', 'тохиргоо: enabled_at анхных хэвээр, audit бүр');
  const sum = JSON.parse(psql(`set role service_role; select berx_ranking_summary()::text`).split('\n').pop());
  ok(sum.gained === +psql('select sum(delta) from berx_rating_changes where delta > 0') && sum.net === sum.gained - sum.lost && sum.adjustments === 1 && sum.decisions.rated >= 1, `inflation summary (+${sum.gained} / −${sum.lost})`);

  /* ---------- JS mirror = SQL ---------- */
  psql(`create database ${DB}_m`, 'postgres');
  const DB2 = DB + '_m';
  const psql2 = (sql) => execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', DB2, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    psql2(`create table users (id text primary key, nick text, steam_id text unique)`);
    for (const f of ['supabase/005_match_history.sql', 'supabase/006_rankings.sql']) execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB2, '-f', path.join(ROOT, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const T = {};
    const seq = [];
    n = 500;
    for (let i = 0; i < 14; i++) seq.push(aim(S(1 + (i % 3)), S(4 + (i % 2)), i % 4 === 0 ? 'T' : 'CT'));
    const call2 = (fn, p) => JSON.parse(psql2(`select ${fn}(${J(p)})::text`).split('\n').pop());
    for (const [i, m] of seq.entries()) {
      ingestLocal(T, m, 1); call2('berx_ingest_match', m);
      const p = i === 5 ? ap(m, { status: 'review', reason: 'too_short', proposal: { changes: chg(m, 30) }, changes: [] }) : i === 9 ? ap(m, { status: 'not_eligible', reason: 'draw', changes: [] }) : ap(m, { changes: chg(m, 30 + i * 37) });
      RK.applyLocal(T, p, 1); call2('berx_apply_rating', p);
      if (i === 3) { RK.applyLocal(T, p, 1); call2('berx_apply_rating', p); }
      if (i === 7) { const q = { user_id: 'u04', steam_id: S(4), delta: -700, reason: 'floor test', admin_id: 'u01' }; RK.adjustLocal(T, q, 1); call2('berx_adjust_rating', q); }
    }
    const ap5 = { action: 'approve', match_id: seq[5].id, admin_id: 'u01', note: 'approved', formula: 'aim-fixed-v1', changes: chg(seq[5], 30) };
    RK.applyLocal(T, ap5, 1); call2('berx_apply_rating', ap5);
    const sqlR = JSON.parse(psql2(`select json_agg(x order by user_id)::text from (select user_id, brp, peak, ranked_matches, wins, losses from berx_ratings) x`));
    const jsR = T.berx_ratings.map(x => ({ user_id: x.user_id, brp: x.brp, peak: x.peak, ranked_matches: x.ranked_matches, wins: x.wins, losses: x.losses })).sort((a, b) => a.user_id.localeCompare(b.user_id));
    ok(JSON.stringify(sqlR) === JSON.stringify(jsR), 'JS applyLocal/adjustLocal = SQL (berx_ratings)');
    const sqlL = JSON.parse(psql2(`select json_agg(x order by id)::text from (select id, kind, match_id, user_id, delta_calc, delta, prev_brp, new_brp from berx_rating_changes) x`));
    const jsL = T.berx_rating_changes.map(x => ({ id: x.id, kind: x.kind, match_id: x.match_id, user_id: x.user_id, delta_calc: x.delta_calc, delta: x.delta, prev_brp: x.prev_brp, new_brp: x.new_brp }));
    ok(JSON.stringify(sqlL) === JSON.stringify(jsL), `JS = SQL (ledger ${jsL.length} мөр, 0-ийн хил, засвар, review→approve)`);
    const sqlD = psql2(`select string_agg(match_id || ':' || status || ':' || coalesce(flag, '-'), ',' order by match_id) from berx_ranked_matches`);
    const jsD = T.berx_ranked_matches.slice().sort((a, b) => a.match_id.localeCompare(b.match_id)).map(x => `${x.match_id}:${x.status}:${x.flag || '-'}`).join(',');
    ok(sqlD === jsD, 'JS = SQL (шийдвэрүүд)');
    const sqlS = JSON.parse(psql2('select berx_ranking_summary()::text')), jsS = RK.summaryLocal(T);
    ok(sqlS.gained === jsS.gained && sqlS.lost === jsS.lost && sqlS.net === jsS.net && sqlS.adjustments === jsS.adjustments, 'JS = SQL (inflation summary)');
  } finally { psql(`drop database if exists ${DB2}`, 'postgres'); }

  /* ---------- rollback (өгөгдөлтэй) ---------- */
  const hist = psql('select count(*) from berx_matches') + ',' + psql('select count(*) from berx_match_players');
  file('supabase/006_rankings_rollback.sql');
  ok(psql('select count(*) from berx_matches') + ',' + psql('select count(*) from berx_match_players') === hist && psql(`select count(*) from information_schema.tables where table_name in ('berx_ratings','berx_rating_changes')`) === '0', 'rollback: Match History хадгалагдаж, BRP хүснэгтүүд хасагдсан');
} finally { psql(`drop database if exists ${DB}`, 'postgres'); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
