// 008_historical_rating_import.sql + scripts/historical-dry-run.mjs — бодит PostgreSQL 16 (түр DB, SIMULATED өгөгдөл).
//   node tests/ranking/historical.mjs   (PGHOST/PGPORT/PGUSER superuser)
import { execFileSync } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { dryRun, parseExport, sqlFiles, markdown, csv } from '../../scripts/historical-dry-run.mjs';
const require = createRequire(import.meta.url);
process.env.SUPABASE_URL = '';
const { validateMatch } = require('../../lib/matches.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
if (!process.env.PGHOST) { console.log('SKIP: PGHOST тохируулаагүй'); process.exit(0); }
const DB = 'berx_hist_test_' + process.pid;
const run = (args, env = {}) => execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }).trim();
const psql = (sql, db = DB) => run(['-d', db, '-c', sql]);
const file = (f, db = DB) => run(['-d', db, '-f', path.join(ROOT, f)]);
const fails = (sql) => { try { psql(sql); return null; } catch (e) { return String(e.stderr || e.message); } };
const J = (x) => `$j$${JSON.stringify(x)}$j$::jsonb`;
const svc = (fn, p) => JSON.parse(psql(`set role service_role; select ${fn}(${J(p)})::text`).split('\n').pop());
const svcFails = (fn, p) => fails(`set role service_role; select ${fn}(${J(p)})`);
const sqlScript = (s) => run(['-d', DB, '-c', 'set role service_role;', '-c', s]);
const snap = () => psql(`select (select count(*) from berx_rating_changes) || '/' || (select count(*) from berx_ratings) || '/' || (select coalesce(sum(brp), 0) from berx_ratings) || '/' || (select count(*) from berx_ranked_matches) || '/' || (select count(*) from berx_ranking_audit where action <> 'historical_approve')`);

psql(`create database ${DB}`, 'postgres');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-hist-'));
try {
  for (const r of ['anon', 'authenticated', 'service_role']) psql(`do $$ begin if not exists (select 1 from pg_roles where rolname='${r}') then create role ${r} nologin${r === 'service_role' ? ' bypassrls' : ''}; end if; end $$`);
  const S = (n) => (76561198000000000n + BigInt(n)).toString();
  const NICK = ['DUKK', 'Kaze', 'Tuya', 'Bat', 'Temka', 'Zolboo', 'Munkh', 'Senzu', 'Nmgd', 'L1m0n', 'Saraa', 'Enkh', 'Guest'];
  psql(`create table users (id text primary key, nick text, login text, steam_id text unique);
        insert into users select 'u' || lpad(g::text, 2, '0'), (array[${NICK.map(n => `'${n}'`).join(',')}])[g], 'login' || g || '@x', (76561198000000000 + g)::text from generate_series(1, 12) g;
        grant select, insert, update, delete on users to service_role; revoke all on users from anon, authenticated;`);
  psql(`alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant all on sequences to service_role;`);
  for (const f of ['005_match_history', '006_rankings', '007_ranking_hardening', '008_historical_rating_import']) file(`supabase/${f}.sql`);
  file('supabase/008_historical_rating_import.sql');
  ok(true, 'migration 005 → 006 → 007 → 008 ×2');
  ok(psql(`select enabled || ',' || competitive || ',' || aim || ',' || coalesce(enabled_at::text, 'null') from berx_ranking_settings`) === 'false,false,false,null', 'production-тай адил: Ranked flag бүгд OFF, enabled_at хоосон');
  ok(psql('select count(*) from berx_rating_changes') === '0', 'migration BRP өөрчлөөгүй');

  /* ---------- SIMULATED 2026-11-15 өдрийн тоглолтууд (production-ийн бүтэцтэй) ---------- */
  const UB = (hh, mm, day = 15) => Date.UTC(2026, 10, day, hh - 8, mm);
  let n = 0; const id = () => `0d0d0d0d-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const stat = (i, team, k, d, a, hs, dmg, rp) => ({ steam_id: S(i), name: NICK[i - 1] || 'X', team, kills: k, deaths: d, assists: a, headshot_kills: hs, team_kills: 0, suicides: 0, damage: dmg, mvp: 1, rounds_played: rp });
  function comp(at, map, ct, t, ctIds, tIds, o = {}) {
    const rp = ct + t;
    const ps = [...ctIds.map((i, j) => stat(i, 'CT', 8 + ((i * 5 + j * 3 + n) % 14), 9 + ((i + j) % 8), 1 + (i % 5), 2 + ((i + n) % 6), 900 + ((i * 131 + n * 17) % 1700), rp)),
      ...tIds.map((i, j) => stat(i, 'T', 7 + ((i * 3 + j * 5 + n) % 15), 10 + ((i + j) % 7), 1 + ((i + 1) % 5), 2 + ((i * 2 + n) % 6), 850 + ((i * 97 + n * 23) % 1800), rp))];
    const m = validateMatch({ id: id(), server_id: 'main', source: 'matchzy', external_ref: `matchzy:berx-${n}:0`, agent_version: '1.4.0', mode: 'competitive', map, status: 'completed',
      started_at: at, ended_at: at + rp * 110e3, rounds_played: rp, score_ct: ct, score_t: t, winner: ct > t ? 'CT' : t > ct ? 'T' : 'draw', has_damage: true, has_mvp: true, players: ps, ...o }, UB(23, 59) + 9e9);
    svc('berx_ingest_match', m); return m;
  }
  const A10 = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]], B10 = [[1, 6, 3, 8, 11], [2, 7, 4, 9, 12]];
  const early = comp(UB(16, 2), 'de_dust2', 13, 5, ...A10);                                    // жагсаалтад байхгүй
  const aim = validateMatch({ id: id(), server_id: 'main', source: 'cs2log', agent_version: '1.4.0', mode: 'aim1v1', map: 'aim_map1v1cfg', workshop_id: '3418431100', aim_weapon: 'ak47', target_rounds: 10,
    status: 'completed', started_at: UB(17, 54), ended_at: UB(17, 54) + 300e3, rounds_played: 16, score_ct: 6, score_t: 10, winner: 'T', has_damage: true,
    players: [stat(1, 'CT', 6, 10, 0, 3, 700, 16), stat(2, 'T', 10, 6, 0, 4, 1100, 16)] }, UB(23, 59) + 9e9);
  svc('berx_ingest_match', aim);
  const M1 = comp(UB(19, 11), 'de_anubis', 4, 13, ...A10);
  const M2 = comp(UB(19, 38), 'de_ancient', 13, 8, ...B10);
  const M3 = comp(UB(20, 12), 'de_cache', 10, 13, ...A10);
  const M4 = comp(UB(20, 52), 'de_mirage', 13, 11, ...B10);
  const other = comp(UB(19, 40, 14), 'de_ancient', 13, 8, ...A10);                               // өөр өдөр
  // Өмнө нь байсан хууль ёсны рейтинг: u11 (admin засвар), u12 бага баланс → 0-ийн хил
  svc('berx_adjust_rating', { user_id: 'u11', steam_id: S(11), delta: 250, reason: 'pre-existing legit history', admin_id: 'u01' });
  svc('berx_adjust_rating', { user_id: 'u12', steam_id: S(12), delta: -880, reason: 'pre-existing legit penalty', admin_id: 'u01' });

  /* ---------- Export (read-only) ---------- */
  console.log('\n== read-only export');
  const exportSql = fs.readFileSync(path.join(ROOT, 'docs/historical-import/export.sql'), 'utf8');
  const exTxt = run(['-d', DB, '-c', exportSql], { PGOPTIONS: '-c default_transaction_read_only=on' });
  ok(exTxt.length > 100, 'export.sql read-only transaction-д ажилласан (бичих боломжгүй горим)');
  const ex = parseExport(exTxt);
  ok(ex.day_matches.length === 6 && !ex.day_matches.some(m => m.id === other.id), 'export: зөвхөн 2026-11-15 UB өдрийн 6 тоглолт');
  ok(ex.day_matches.every(m => m.fingerprint === psql(`select berx_match_fingerprint('${m.id}')`)), 'export.sql-ийн fingerprint = berx_match_fingerprint() (ижил илэрхийлэл)');
  ok(!/login|pass_hash|@x/.test(exTxt), 'export-д login/нууц үг алга');

  /* ---------- Offline dry run ---------- */
  console.log('\n== dry run (official lib/ranking.js)');
  const before0 = snap();
  const R = dryRun(ex, { batch: 'hist-20261115' });
  ok(R.issues.length === 0, 'бүх 4 тоглолт шалгалтад тэнцсэн' + (R.issues.length ? ': ' + R.issues.join('; ') : ''));
  ok(R.matches.map(m => m.match_id).join() === [M1, M2, M3, M4].map(m => m.id).join(), 'яг 4 match ID, цагийн дарааллаар (Anubis → Ancient → Cache → Mirage)');
  ok(R.aim_excluded.length === 1 && R.aim_excluded[0].id === aim.id && R.exclusions.some(e => e.id === aim.id && /First to 10/.test(e.reason)), 'AIM First to 10 (17:54, 6:10) хасагдсан');
  ok(R.exclusions.some(e => e.id === early.id) && R.exclusions.length === 2, 'жагсаалтад заагаагүй өөр тоглолт ороогүй');
  ok(R.matches.every(m => m.rows.length === 10) && R.matches.flatMap(m => m.rows).every(x => (x.result === 'win' ? x.delta_calc >= 150 && x.delta_calc <= 230 : x.delta_calc >= -200 && x.delta_calc <= -130)), '40 тоглогч бүгд тооцогдсон, BRP хязгаарт');
  const u11 = R.matches[1].rows.find(x => x.user_id === 'u11'), u12 = R.matches[1].rows.find(x => x.user_id === 'u12');
  ok(u11.prev === 1250 && u12.prev === 120, 'өмнөх хууль ёсны баланс хадгалагдсан (1250, 120)');
  const fl = R.matches.flatMap(m => m.rows).filter(x => x.delta !== x.delta_calc);
  ok(fl.every(x => x.new === 0 && x.delta === -x.prev), `0-ийн хил: ${fl.length} тохиолдол (delta = −prev)`);
  ok(snap() === before0, 'offline dry run DB-д юу ч бичээгүй');
  const files = sqlFiles(R, 'u01');
  for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(tmp, f), s);
  fs.writeFileSync(path.join(tmp, 'report.md'), markdown(R)); fs.writeFileSync(path.join(tmp, 'report.csv'), csv(R));
  ok(csv(R).split('\n').length === 42 && /Нийт олгосон/.test(markdown(R)), 'CSV (40 мөр) + markdown тайлан');

  /* ---------- Эрх ---------- */
  console.log('\n== permissions');
  for (const f of ['berx_historical_approve', 'berx_historical_import', 'berx_historical_reverse', 'berx_historical_cancel'])
    ok(/permission denied/.test(fails(`set role authenticated; select ${f}('{}'::jsonb)`) || '') && /permission denied/.test(fails(`set role anon; select ${f}('{}'::jsonb)`) || ''), `${f}: browser role ажиллуулж чадахгүй`);
  ok(/permission denied/.test(fails(`set role authenticated; select * from berx_historical_import_manifest`) || ''), 'manifest: browser role унших эрхгүй');

  /* ---------- Approve: зөвхөн яг зөвшөөрөгдсөн тоглолт ---------- */
  console.log('\n== approve manifest');
  const ap = (matches, o = {}) => ({ batch_id: 'x-' + Math.random().toString(36).slice(2, 8), admin_id: 'u01', reason: 'test approval reason', formula: 'competitive-v1', matches, ...o });
  const ref = (m, o = {}) => ({ match_id: m.id, revision: 1, fingerprint: psql(`select berx_match_fingerprint('${m.id}')`), ...o });
  ok(/not eligible: not_competitive/.test(svcFails('berx_historical_approve', ap([ref(aim)])) || ''), 'AIM First to 10 → татгалзсан');
  ok(/outside_import_window/.test(svcFails('berx_historical_approve', ap([ref(other)])) || ''), '2026-11-15-аас өөр өдрийн тоглолт → татгалзсан');
  const ab = comp(UB(21, 30), 'de_nuke', 5, 3, ...A10, { status: 'aborted', winner: null, score_ct: 5, score_t: 3 });
  ok(/not_completed/.test(svcFails('berx_historical_approve', ap([ref(ab)])) || ''), 'aborted → татгалзсан');
  const it = comp(UB(21, 40), 'de_nuke', 7, 6, ...A10, { status: 'interrupted', winner: null });
  ok(/not_completed/.test(svcFails('berx_historical_approve', ap([ref(it)])) || ''), 'interrupted → татгалзсан');
  const dr = comp(UB(21, 50), 'de_nuke', 12, 12, ...A10);
  ok(/draw_or_no_winner/.test(svcFails('berx_historical_approve', ap([ref(dr)])) || ''), 'тэнцээ → татгалзсан');
  const nine = comp(UB(22, 0), 'de_inferno', 13, 7, [1, 2, 3, 4, 5], [6, 7, 8, 9]);
  ok(/player_count|team_size/.test(svcFails('berx_historical_approve', ap([ref(nine)])) || ''), '9 тоглогч (бүрэн бус roster) → татгалзсан');
  const unl = comp(UB(22, 10), 'de_inferno', 13, 7, [1, 2, 3, 4, 5], [6, 7, 8, 9, 40]);
  ok(/unlinked_player/.test(svcFails('berx_historical_approve', ap([ref(unl)])) || ''), 'BERX-д бүртгэлгүй SteamID → татгалзсан');
  ok(/revision is 1, not 2/.test(svcFails('berx_historical_approve', ap([ref(M1, { revision: 2 })])) || ''), 'буруу revision → татгалзсан');
  ok(/fingerprint/.test(svcFails('berx_historical_approve', ap([ref(M1, { fingerprint: 'a'.repeat(64) })])) || ''), 'export-оос хойш өөрчлөгдсөн өгөгдөл (fingerprint) → татгалзсан');
  ok(/chronological/.test(svcFails('berx_historical_approve', ap([ref(M2), ref(M1)])) || ''), 'цагийн дараалал буруу → татгалзсан');
  ok(/admin_id/.test(svcFails('berx_historical_approve', ap([ref(M1)], { admin_id: 'REPLACE_WITH_ADMIN_USER_ID' })) || ''), 'admin_id орлуулаагүй → татгалзсан');
  ok(/reason/.test(svcFails('berx_historical_approve', ap([ref(M1)], { reason: 'short' })) || ''), 'батлах шалтгаан заавал');
  ok(psql('select count(*) from berx_historical_import_manifest') === '0', 'татгалзсан оролдлого manifest-д юу ч үлдээгээгүй');
  const dec = comp(UB(22, 20), 'de_inferno', 13, 9, ...A10);
  svc('berx_apply_rating', { action: 'auto', match_id: dec.id, revision: 1, mode: 'competitive', status: 'not_eligible', reason: 'ranking_disabled', changes: [] });
  ok(/already has a rating decision/.test(svcFails('berx_historical_approve', ap([ref(dec)])) || ''), 'аль хэдийн rating шийдвэртэй тоглолт → import боломжгүй');
  sqlScript(files['1-approve.sql']);
  const before1 = snap();
  ok(psql(`select string_agg(match_id || ':' || approved_revision || ':' || status, ',' order by seq) from berx_historical_import_manifest`) === [M1, M2, M3, M4].map(m => `${m.id}:1:approved`).join(','), '1-approve.sql: 4 тоглолт батлагдсан (BRP хөдлөөгүй)');
  ok(snap() === before1, 'manifest батлах нь BRP өөрчлөхгүй');
  ok(/limited to 4/.test(svcFails('berx_historical_approve', ap([ref(early)])) || ''), '5 дахь тоглолт → нийт 4-ийн хязгаар');
  ok(/batch already exists/.test(svcFails('berx_historical_approve', { ...ap([ref(early)]), batch_id: 'hist-20261115' }) || ''), 'ижил batch дахин → татгалзсан');

  /* ---------- SQL dry run ---------- */
  console.log('\n== SQL dry run (production-д ажиллуулах)');
  const dryOut = JSON.parse(sqlScript(files['2-dry-run.sql']).split('\n').filter(l => l.trim()).join('\n').replace(/^SET\s*/, ''));
  ok(dryOut.dry_run === true && dryOut.awarded === false && snap() === before1 && psql(`select count(*) from berx_historical_import_manifest where status='approved'`) === '4', 'SQL dry run: юу ч бичээгүй (ledger, рейтинг, шийдвэр, audit, manifest хэвээр)');
  const flat = (ms) => ms.flatMap(m => m.changes.map(c => `${m.match_id}:${c.user_id}:${c.prev_brp}:${c.delta_calc}:${c.delta}:${c.new_brp}:${c.rank_after}`)).sort().join('|');
  const toolFlat = R.matches.flatMap(m => m.rows.map(x => `${m.match_id}:${x.user_id}:${x.prev}:${x.delta_calc}:${x.delta}:${x.new}:${x.rank_after}`)).sort().join('|');
  ok(flat(dryOut.matches) === toolFlat, 'SQL dry run = offline dry run (40 мөр, яг ижил)');

  /* ---------- Бүтэлгүйтэл → бүхэлдээ rollback ---------- */
  console.log('\n== failure safety');
  const exec = (o) => JSON.parse(files['3-execute.sql'].match(/\$berx\$(.*)\$berx\$/s)[1]);
  const p3 = exec(); p3.matches[2].changes[0].delta_calc = 400;
  ok(/failed validation: delta_out_of_range/.test(svcFails('berx_historical_import', p3) || '') && snap() === before1 && psql(`select count(*) from berx_historical_import_manifest where status='imported'`) === '0', '3 дахь тоглолтын BRP буруу → 1, 2 дахь нь ч бичигдээгүй (batch atomic)');
  const p4 = exec(); const w = p4.matches[0].changes.find(c => c.result === 'win'); w.delta_calc = w.delta_calc === 230 ? 229 : 230;
  ok(/delta_score_mismatch|delta_out_of_range/.test(svcFails('berx_historical_import', p4) || ''), 'үзүүлэлттэй таарахгүй BRP (manipulated) → татгалзсан');
  const p5 = exec(); const lz = p5.matches[1].changes.find(c => c.result === 'loss'); lz.result = 'win'; lz.delta_calc = 190;
  ok(/wrong_result/.test(svcFails('berx_historical_import', p5) || ''), 'ялагдагчийг ялагч болгох → татгалзсан');
  const p6 = exec(); p6.matches[0].changes[0].user_id = 'u12';
  ok(/user_steam_mismatch|duplicate_user/.test(svcFails('berx_historical_import', p6) || ''), 'BRP-г өөр хэрэглэгч рүү → татгалзсан');
  const p7 = exec(); p7.matches[0].changes.pop();
  ok(/changes_count/.test(svcFails('berx_historical_import', p7) || ''), 'тоглогч дутуу → татгалзсан');
  const p8 = exec(); p8.matches[0].match_id = early.id;
  ok(/differs from manifest/.test(svcFails('berx_historical_import', p8) || ''), 'manifest-д байхгүй (батлаагүй) тоглолт → татгалзсан');
  const p9 = exec(); [p9.matches[0], p9.matches[1]] = [p9.matches[1], p9.matches[0]];
  ok(/differs from manifest/.test(svcFails('berx_historical_import', p9) || ''), 'дараалал өөрчилсөн → татгалзсан');
  const pa = exec(); pa.admin_id = 'nobody';
  ok(/admin_id/.test(svcFails('berx_historical_import', pa) || ''), 'admin биш → татгалзсан');
  // батлагдсаны дараа статистик өөрчлөгдсөн
  psql(`update berx_match_players set kills = kills + 5 where match_id = '${M3.id}' and steam_id = '${S(1)}'`);
  ok(/data changed after approval/.test(svcFails('berx_historical_import', exec()) || '') && snap() === before1, 'батлагдсаны дараа статистик өөрчлөгдсөн → татгалзсан');
  psql(`update berx_match_players set kills = kills - 5 where match_id = '${M3.id}' and steam_id = '${S(1)}'`);
  svc('berx_ingest_match', { ...M4, revision: 2 });
  ok(/changed \(revision 2/.test(svcFails('berx_historical_import', exec()) || '') && snap() === before1, 'тоглолтын шинэ revision → татгалзсан');
  psql(`update berx_matches set revision = 1 where id = '${M4.id}'`);    // (тест: revision-ийг эргүүлж, өгөгдөл ижил тул fingerprint таарна)
  ok(psql(`select berx_match_fingerprint('${M4.id}')`) === R.matches[3].fingerprint, '(revision сэргээсэн, fingerprint ижил)');

  /* ---------- Бодит import ---------- */
  console.log('\n== execute');
  const ex1 = JSON.parse(sqlScript(files['3-execute.sql']).split('\n').filter(l => l.trim()).join('\n').replace(/^SET\s*/, ''));
  ok(ex1.awarded === true && flat(ex1.matches) === toolFlat, 'import: бодит үр дүн = dry run (40 мөр)');
  const lg = psql(`select string_agg(match_id || ':' || user_id || ':' || prev_brp || ':' || delta_calc || ':' || delta || ':' || new_brp, '|' order by match_id, user_id) from berx_rating_changes where kind='match'`);
  ok(lg.split('|').length === 40 && lg.split('|').sort().join('|') === R.matches.flatMap(m => m.rows.map(x => `${m.match_id}:${x.user_id}:${x.prev}:${x.delta_calc}:${x.delta}:${x.new}`)).sort().join('|'), 'ledger: 40 мөр, prev/тооцсон/бодит/шинэ BRP');
  ok(psql(`select string_agg(user_id || '=' || brp || '/' || wins || '-' || losses, ',' order by user_id) from berx_ratings`) === R.leaderboard.slice().sort((a, b) => (a.user_id < b.user_id ? -1 : 1)).map(a => `${a.user_id}=${a.final}/${a.wins}-${a.losses}`).join(','), 'эцсийн BRP, хожил/хожигдол = dry run leaderboard');
  ok(psql(`select bool_and(detail->>'historical_import' = 'true' and detail ? 'rank_before' and detail ? 'rank_after' and detail ? 'weights_used' and detail->>'original_match_type' = 'casual' and reason like 'Чансаанд нөхөн бүртгэсэн%') from berx_rating_changes where kind='match'`) === 't', 'ledger detail: historical, зэрэглэл өмнө/дараа, тооцооны задаргаа, анхны төрөл');
  ok(psql(`select string_agg(distinct origin || ':' || status || ':' || reason, ',') from berx_ranked_matches where match_id in ('${M1.id}','${M2.id}','${M3.id}','${M4.id}')`) === 'historical_import:rated:historical_import' && psql(`select count(*) from berx_ranked_matches where origin = 'historical_import'`) === '4', 'шийдвэр: origin historical_import');
  ok(psql(`select string_agg(distinct match_type || ':' || (lock is null)::text, ',') from berx_matches where id in ('${M1.id}','${M2.id}','${M3.id}','${M4.id}')`) === 'casual:true', 'тоглолтын анхны төрөл Casual хэвээр, lock зохиогоогүй');
  ok(psql(`select string_agg(score_ct || ':' || score_t, ',' order by started_at) from berx_matches where id in ('${M1.id}','${M2.id}','${M3.id}','${M4.id}')`) === '4:13,13:8,10:13,13:11', 'бодит оноо өөрчлөгдөөгүй');
  ok(psql(`select count(*) from berx_ranking_audit where action='historical_import' and detail->>'batch_id'='hist-20261115' and detail ? 'approved_revision' and detail->>'formula'='competitive-v1' and detail->>'original_match_type'='casual' and detail->>'status'='imported' and admin_id='u01'`) === '4', 'audit: 4 historical_import (match, revision, batch, шалтгаан, admin, томъёо, анхны төрөл, төлөв)');
  ok(psql(`select string_agg(status, ',' order by seq) from berx_historical_import_manifest`) === 'imported,imported,imported,imported', 'manifest: imported');
  const after1 = snap();
  const ex2 = JSON.parse(sqlScript(files['3-execute.sql']).split('\n').filter(l => l.trim()).join('\n').replace(/^SET\s*/, ''));
  ok(ex2.already_imported === true && ex2.awarded === false && snap() === after1, 'дахин ажиллуулахад → already_imported, давхар олголтгүй');
  ok(/batch already exists|limited to 4/.test(svcFails('berx_historical_approve', ap([ref(M1)])) || ''), 'ижил тоглолтыг дахин батлах боломжгүй');
  // ердийн rating pipeline-аар дахин олгох оролдлого
  const r = svc('berx_apply_rating', { action: 'auto', match_id: M2.id, revision: 1, mode: 'competitive', status: 'rated', reason: 'ok', formula: 'competitive-v1', changes: ex1.matches[1].changes.map(c => ({ ...c, detail: {} })) });
  ok(r.existing === true && snap() === after1, 'нөхөн бүртгэсэн тоглолтыг ердийн rating-аар дахин олгох боломжгүй');
  ok(/unique|duplicate/.test(fails(`set role service_role; insert into berx_rating_changes (kind, match_id, user_id, steam_id, result, delta_calc, delta, prev_brp, new_brp, reason, created_at) values ('match', '${M1.id}', 'u01', '${S(1)}', 'win', 200, 200, 1, 201, 'x', 1)`) || ''), 'unique(match_id, user_id) — нэг тоглолтод давхар мөр орохгүй');
  ok(/permission denied/.test(fails(`set role service_role; update berx_rating_changes set delta = 0`) || '') && /permission denied/.test(fails(`set role service_role; delete from berx_rating_changes`) || ''), 'ledger өөрчлөгдөшгүй');
  // ердийн Ranked хэвээр
  ok(psql(`select enabled || ',' || competitive || ',' || aim || ',' || coalesce(enabled_at::text, 'null') from berx_ranking_settings`) === 'false,false,false,null', 'flag, enabled_at өөрчлөгдөөгүй');
  const ranked = validateMatch({ ...M1, id: id(), started_at: UB(23, 0), ended_at: UB(23, 40), match_type: 'ranked', external_ref: null,
    lock: { v: 1, type: 'ranked', locked_at: UB(23, 0), agent: '1.5.0', roster: { CT: [1, 2, 3, 4, 5].map(S), T: [6, 7, 8, 9, 10].map(S) }, bots: 0, rules: { mode: 'competitive' } } }, UB(23, 59) + 9e9);
  svc('berx_ingest_match', ranked);
  const rr = svc('berx_apply_rating', { action: 'auto', match_id: ranked.id, revision: 1, mode: 'competitive', status: 'rated', reason: 'ok', changes: ex1.matches[0].changes.map(c => ({ ...c, detail: {} })) });
  ok(rr.status === 'error' && /ranking_disabled/.test(psql(`select note from berx_ranked_matches where match_id='${ranked.id}'`)), 'ердийн Ranked: flag OFF үед BRP олгохгүй (007 хэвээр)');
  ok(psql(`set role service_role; select berx_historical_validate('${ranked.id}', '[]'::jsonb)`).split('\n').pop() === 'not_historical_casual', 'Ranked тоглолт import-д тэнцэхгүй (not_historical_casual)');

  /* ---------- Нөхөх засвар (reverse) ---------- */
  console.log('\n== compensating reversal');
  const rows0 = +psql('select count(*) from berx_rating_changes');
  const rv = svc('berx_historical_reverse', { batch_id: 'hist-20261115', admin_id: 'u01', reason: 'test reversal of historical import' });
  ok(rv.compensating_changes === 40 && +psql('select count(*) from berx_rating_changes') === rows0 + 40 && psql(`select count(*) from berx_rating_changes where kind='match' and match_id in ('${M1.id}','${M2.id}','${M3.id}','${M4.id}')`) === '40', 'reverse: 40 нөхөх adjustment нэмсэн, анхны ledger мөр устгаагүй');
  ok(psql(`select string_agg(user_id || '=' || brp || '/' || ranked_matches, ',' order by user_id) from berx_ratings where user_id not in ('u11','u12')`) === Array.from({ length: 10 }, (_, i) => `u${String(i + 1).padStart(2, '0')}=1000/0`).join(','), 'reverse: 0-ийн хил хүрээгүй тоглогчид 1000, ranked тоо 0 болсон');
  ok(psql(`select count(*) from berx_ranking_audit where action='historical_reverse'`) === '1' && psql(`select string_agg(distinct coalesce(flag, '-'), ',') from berx_ranked_matches where origin='historical_import'`) === 'historical_reversed', 'reverse: audit + шийдвэрт тэмдэг');
  ok(/only a fully imported/.test(svcFails('berx_historical_reverse', { batch_id: 'hist-20261115', admin_id: 'u01', reason: 'second reversal attempt' }) || ''), 'дахин reverse хийх боломжгүй');

  /* ---------- Rollback ---------- */
  console.log('\n== rollback guard');
  ok(/refused/.test((() => { try { file('supabase/008_historical_rating_import_rollback.sql'); return ''; } catch (e) { return String(e.stderr || e.message); } })()), '008 rollback: import хийсний дараа татгалзана (ledger-ийг хамгаална)');
  psql(`create database ${DB}_r`, 'postgres');
  try {
    run(['-d', DB + '_r', '-c', 'create table users (id text primary key, nick text, steam_id text unique)']);
    for (const f of ['005_match_history', '006_rankings', '007_ranking_hardening', '008_historical_rating_import', '008_historical_rating_import_rollback', '008_historical_rating_import']) file(`supabase/${f}.sql`, DB + '_r');
    ok(true, '008 → rollback → 008 (import хийгээгүй үед)');
  } finally { psql(`drop database if exists ${DB}_r`, 'postgres'); }
} finally { psql(`drop database if exists ${DB}`, 'postgres'); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
