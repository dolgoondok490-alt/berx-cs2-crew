// BERX RANKED — end-to-end: жинхэнэ сайт + жинхэнэ BERX Agent v1.5.0 + хуурамч CS2 (MatchZy event, CS2 log, BERX Guard ДУУРАЙЛАГА) + хуурамч Supabase
//   Бүх event СИМУЛЯЦИ — бодит CS2 сервер, бодит CounterStrikeSharp плагин дээр туршаагүй.   node tests/ranking/e2e.mjs
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import net from 'net';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const usedPorts = new Set();
const freePort = async () => { for (;;) { const p = await new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const x = s.address().port; s.close(() => r(x)); }); }); if (!usedPorts.has(p)) { usedPorts.add(p); return p; } } };   // 2 сервис ижил порт авахаас сэргийлнэ
const until = async (f, ms, step = 300) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await f(); if (v) return v; } catch (e) { /* retry */ } await sleep(step); } return null; };
const procs = new Set(); const run = (args, env, logf) => { const p = spawn('node', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); const w = fs.createWriteStream(logf, { flags: 'a' }); p.stdout.pipe(w); p.stderr.pipe(w); procs.add(p); p.on('exit', () => procs.delete(p)); return p; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-rk-'));
const SECRET = 'rank-agent-secret-' + 'z'.repeat(24), RCON_PW = 'rconRank';
const CS2 = path.join(tmp, 'steamcmd', 'steamapps', 'common', 'Counter-Strike Global Offensive');
fs.mkdirSync(path.join(CS2, 'game', 'csgo', 'cfg', 'MatchZy'), { recursive: true }); fs.mkdirSync(path.join(CS2, 'game', 'csgo', 'maps'), { recursive: true });
for (const m of ['mirage', 'dust2', 'inferno', 'nuke', 'ancient', 'anubis', 'cache']) fs.writeFileSync(path.join(CS2, 'game', 'csgo', 'maps', `de_${m}.vpk`), 'x');
fs.writeFileSync(path.join(CS2, 'game', 'csgo', 'cfg', 'MatchZy', 'config.cfg'), 'matchzy_autostart_mode 1\n');
const [pgPort, sitePort, rconPort, ctlPort, evPort] = [await freePort(), await freePort(), await freePort(), await freePort(), await freePort()];
const rconLog = path.join(tmp, 'rcon.log'); fs.writeFileSync(rconLog, '');
run([path.join(ROOT, 'tests/skins/fake-supabase.js'), pgPort], {}, path.join(tmp, 'pg.log'));
run([path.join(ROOT, 'tests/server/fake-cs2.js'), rconPort, RCON_PW, rconLog, ctlPort, CS2, '1500'], { FAKE_GUARD: '1' }, path.join(tmp, 'cs2.out'));
const siteEnv = { PORT: sitePort, SUPABASE_URL: `http://127.0.0.1:${pgPort}`, SUPABASE_SECRET_KEY: 'sb_secret_TESTKEY123', SESSION_SECRET: 'rank_session_secret_rank_session_secret',
  ADMIN_LOGINS: 'a@berx.mn', SERVER_AGENT_SECRET: SECRET, SERVER_PASSWORD: 'friendpw' };
run([path.join(ROOT, 'server/server.js')], siteEnv, path.join(tmp, 'site.log'));
const B = `http://127.0.0.1:${sitePort}/api`, PG = `http://127.0.0.1:${pgPort}`, CTL = `http://127.0.0.1:${ctlPort}`;
await until(() => fetch(B + '/health').then(r => r.ok), 10000);
const reg = async (nick, login, sid) => {
  const r = await fetch(B + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, login, password: 'secret1' }) });
  const c = r.headers.get('set-cookie').split(';')[0]; const all = await (await fetch(PG + '/__dump')).json(); const id = all.users.find(x => x.login === login).id;
  if (sid) await fetch(`${PG}/__patch?t=users&k=id&v=${id}`, { method: 'POST', body: JSON.stringify({ steam_id: sid }) });
  return { c, id, sid, nick };
};
const S = (n) => (76561198000000000n + BigInt(n)).toString();
const NICKS = ['DOK', 'Kaze', 'Tuya', 'Bat', 'Temka', 'Zolboo', 'Munkh', 'Senzu', 'Nmgd', 'L1m0n'];
const U = [];
for (let i = 0; i < 10; i++) U.push(await reg(NICKS[i], i === 0 ? 'a@berx.mn' : `p${i}@berx.mn`, S(i + 1)));
const [A, K] = U;
const NOSTEAM = await reg('Guest', 'g@berx.mn', null);
const api = (u, p) => fetch(B + p, { headers: u ? { cookie: u.c } : {} }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
const act = (u, type, payload) => fetch(B + '/action', { method: 'POST', headers: { cookie: u.c, 'content-type': 'application/json' }, body: JSON.stringify({ type, payload }) }).then(async r => ({ s: r.status, j: await r.json() }));
const cmd = (u, type, args) => act(u, 'server.cmd', { type, args });
const srv = (u) => fetch(B + '/server/state', { headers: { cookie: u.c } }).then(r => r.json());
const mz = (e) => fetch(CTL + '/mz', { method: 'POST', body: JSON.stringify(e) }).then(r => r.json());
const emit = (lines) => fetch(CTL + '/emit', { method: 'POST', body: JSON.stringify(lines) });
const players = (list) => fetch(CTL + '/set-players', { method: 'POST', body: JSON.stringify(list) });
const ctl = () => fetch(CTL + '/state').then(r => r.json());
const dump = () => fetch(PG + '/__dump').then(r => r.json());
const cmdDone = (type, after = 0) => until(async () => { const c = (await srv(A)).commands.find(x => x.type === type && x.createdAt > after); return c && ['done', 'failed'].includes(c.status) ? c : null; }, 40000);
const listAll = (u, q = '') => api(u, '/berx/matches?limit=50' + q).then(r => r.j.items || []);
const waitMatches = (n) => until(async () => { const l = await listAll(A); return l.length >= n ? l : null; }, 30000);
const decision = (id) => until(async () => { const d = await dump(); return (d.berx_ranked_matches || []).find(x => x.match_id === id) || null; }, 15000);

/* ---------- 1. Эрх (backend дээр) ---------- */
console.log('\n== permissions');
ok((await act(K, 'ranking.settings', { enabled: true })).s === 403, 'энгийн гишүүн: чансааны flag өөрчлөх → 403');
ok((await act(K, 'ranking.adjust', { userId: K.id, delta: 500, reason: 'free brp pls' })).s === 403, 'энгийн гишүүн: BRP засах → 403');
ok((await act(K, 'ranking.review', { matchId: '00000000-0000-4000-8000-000000000000', decision: 'approve', note: 'xxxxx' })).s === 403, 'энгийн гишүүн: review → 403');
ok((await api(K, '/admin/ranking')).s === 403 && (await api(K, `/admin/ranking/users/${A.id}`)).s === 403, 'энгийн гишүүн: admin чансааны мэдээлэл → 403');
ok((await api(null, '/berx/ranking/me')).s === 401 && (await api(null, '/berx/ranking/leaderboard')).s === 401, 'нэвтрээгүй → 401');
ok((await act(A, 'ranking.adjust', { userId: K.id, delta: 50, reason: '' })).s === 400, 'admin: шалтгаангүй засвар → 400');
const me0 = (await api(K, '/berx/ranking/me')).j;
ok(me0.player.brp === 1000 && me0.player.unranked && me0.history.length === 0 && me0.settings.enabled === false, 'эхлэл: 1000 BRP, чансаагүй, түүх хоосон, чансаа унтраалттай');
const lb0 = (await api(K, '/berx/ranking/leaderboard')).j;
ok(lb0.ranked.length === 0 && lb0.unranked.length === 10 && lb0.noSteam === 1, 'leaderboard: 10 чансаагүй (1000), Steam-гүй 1 тоологдсон');

/* ---------- 2. Agent v1.5.0 + Guard ---------- */
console.log('\n== agent 1.5.0 + BERX Guard (simulated)');
const agentEnv = { BERX_AGENT_ENV: path.join(tmp, 'agent.env'), BERX_ARENA_STATE: path.join(tmp, 'arena.json'), BERX_MATCHES_STATE: path.join(tmp, 'matches.json'), MATCH_RETRY_MS: '400', ARENA_VERIFY_MS: '5000' };
fs.writeFileSync(path.join(tmp, 'agent.env'), `BERX_URL=http://127.0.0.1:${sitePort}\nSERVER_AGENT_SECRET=${SECRET}\nRCON_HOST=127.0.0.1\nRCON_PORT=${rconPort}\nRCON_PASSWORD=${RCON_PW}\nEVENTS_PORT=${evPort}\nPOLL_MS=1000\nCS2_DIR=${CS2}\n`);
const agentLog = path.join(tmp, 'agent.log');
run([path.join(ROOT, 'agent/berx-agent.js')], agentEnv, agentLog);
let st = await until(async () => { const x = await srv(A); return x.online && x.server.matchzy && x.ranked && x.ranked.guard ? x : null; }, 20000);
if (!st) console.log('cs2.out:', fs.readFileSync(path.join(tmp, 'cs2.out'), 'utf8').slice(-800), '\nagent.log:', fs.readFileSync(agentLog, 'utf8').slice(-1200));
ok(st && st.ranked.agentOk && st.ranked.guard.ok && st.ranked.guard.version === '1.0.0', 'agent 1.5.0 online, BERX Guard илэрсэн (status-оор, зөвхөн уншсан)');
ok(st && !st.ranked.competitive.ok && /идэвхгүй/.test(st.ranked.competitive.why) && st.ranked.matchType === 'casual', 'чансаа унтраалттай → Ranked боломжгүй, анхдагч Casual');
ok((await ctl()).guard.enforcing === false, 'Guard хамгаалалт анхдагчаар унтраалттай (Practice-д нөлөөгүй)');
let r = await cmd(A, 'match_type', { value: 'ranked' });
ok(r.s === 400 && /идэвхгүй/.test(r.j.error), 'flag унтраалттай үед Ranked Competitive → сервер татгалзсан');
r = await cmd(A, 'aim_start', { map: 'aim_map1v1cfg', size: 1, weapon: 'awp', rounds: 13, ranked: true });
ok(r.s === 400, 'flag унтраалттай үед Ranked AIM → татгалзсан');
ok((await cmd(K, 'match_type', { value: 'ranked' })).s === 403, 'энгийн гишүүн Ranked/Casual сонгох боломжгүй');

/* ---------- 3. Admin асаана ---------- */
console.log('\n== admin enables');
r = await act(A, 'ranking.settings', { enabled: true, competitive: true, aim: true, rules: { min_duration_competitive_s: 0, min_duration_aim_s: 0 }, reason: 'e2e simulation' });
ok(r.s === 200 && r.j.settings.enabled && r.j.settings.enabled_at, 'admin: чансаа + Competitive + AIM асаав (audit)');
await sleep(300);
r = await cmd(A, 'aim_start', { map: 'aim_map1v1cfg', size: 1, weapon: 'awp', rounds: 10, ranked: true });
ok(r.s === 400 && r.j.error === 'First to 10 тоглолт BRP-д нөлөөлөхгүй.', 'Ranked + First to 10 → "First to 10 тоглолт BRP-д нөлөөлөхгүй."');

/* ---------- 4. Ranked Competitive 5v5 (MatchZy) ---------- */
console.log('\n== ranked competitive 5v5');
const roster = (ids) => ids.map((i, k) => ({ userid: 10 + i, name: NICKS[i] || 'X' + i, steamid64: i < 10 ? S(i + 1) : S(i + 1), team: k < 5 ? 3 : 2 }));
await players(roster([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
let t = Date.now();
ok((await cmd(A, 'match_type', { value: 'ranked' })).s === 200 && (await cmdDone('match_type', t - 1)).status === 'done', 'admin: дараагийн Competitive = Чансаатай (agent хүлээн авсан)');
ok(!!await until(async () => (await srv(A)).ranked.matchType === 'ranked', 10000), 'heartbeat: matchType ranked');
await sleep(5500);                                    // agent-ийн roster (status_json, 5с)
const stt = (k, d, a, hs, dmg, rp = 23) => ({ kills: k, deaths: d, assists: a, headshot_kills: hs, damage: dmg, mvp: 1, rounds_played: rp, team_kills: 0, suicides: 0 });
const team = (score, ps) => ({ id: 'x', name: 'team', series_score: 0, score, players: ps });
const compEv = (mid, ev, s1, s2, n, idsA, idsB, statsA, statsB, winner) => ({ event: ev, matchid: mid, map_number: 0, round_number: n, winner,
  team1: team(s1, idsA.map((i, k) => ({ steamid: S(i + 1), name: NICKS[i] || 'X', stats: statsA[k] }))), team2: team(s2, idsB.map((i, k) => ({ steamid: S(i + 1), name: NICKS[i] || 'X', stats: statsB[k] }))) });
const SA5 = [stt(28, 15, 4, 14, 2650), stt(20, 17, 6, 9, 2100), stt(17, 18, 5, 7, 1800), stt(14, 19, 7, 5, 1500), stt(9, 20, 3, 3, 1100)];
const SB5 = [stt(25, 17, 3, 12, 2400), stt(19, 18, 4, 8, 1900), stt(16, 20, 5, 6, 1600), stt(15, 20, 6, 4, 1450), stt(10, 22, 2, 2, 1000)];
await mz({ event: 'going_live', matchid: 101, map_number: 0 });
await sleep(300);
await mz(compEv(101, 'round_end', 13, 10, 23, [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], SA5, SB5, { side: 't', team: 'team1' }));
await mz(compEv(101, 'map_result', 13, 10, 23, [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], SA5, SB5, { side: 't', team: 'team1' }));
let l = await waitMatches(1);
let dec = l && await decision(l[0].id);
ok(l && l[0].match_type === 'ranked' && dec && dec.status === 'rated', 'Ranked 5v5 → бичигдэж, сервер өөрөө BRP тооцоолсон (rated)');
let db = await dump();
const lock = db.berx_matches.find(x => x.id === l[0].id).lock;
ok(lock && lock.roster.CT.length === 5 && lock.roster.T.length === 5 && lock.agent === '1.5.0' && lock.rules.server_mode === 'competitive', 'agent: going_live-д 5v5 roster, дүрэм түгжсэн');
const chg = db.berx_rating_changes.filter(c => c.match_id === l[0].id);
const wins = chg.filter(c => c.result === 'win'), losses = chg.filter(c => c.result === 'loss');
ok(chg.length === 10 && wins.length === 5 && wins.every(c => c.delta >= 150 && c.delta <= 230) && losses.every(c => c.delta <= -130 && c.delta >= -200), `ялагч +150…+230 (${wins.map(c => c.delta).join(',')}), ялагдагч −130…−200 (${losses.map(c => c.delta).join(',')})`);
ok(wins.find(c => c.steam_id === S(1)).delta > wins.find(c => c.steam_id === S(5)).delta, 'илүү сайн тоглосон (28 kill) нь сул тоглосноос (9 kill) их BRP авсан');
ok(chg.every(c => c.detail && c.detail.weights_used && c.score !== null && c.formula === 'competitive-v1'), 'өөрчлөлт бүрт хувийн үзүүлэлт, жин, томъёо хадгалагдсан');
let me = (await api(A, '/berx/ranking/me')).j;
ok(me.player.brp === 1000 + chg.find(c => c.steam_id === S(1)).delta && me.player.matches === 1 && me.player.wins === 1 && me.history.length === 1 && me.recent[0].matchId === l[0].id, `миний карт: ${me.player.brp} BRP, түүх, сүүлийн тоглолт`);
let det = (await api(K, '/berx/matches/' + l[0].id)).j;
ok(det.ranking.status === 'rated' && det.players.every(p => p.brp && typeof p.brp.delta === 'number') && det.ranking.me && det.ranking.me.delta === chg.find(c => c.steam_id === S(2)).delta, 'Match History: RANKED, тоглогч бүрийн BRP/үзүүлэлт, миний өөрчлөлт');
let lb = (await api(K, '/berx/ranking/leaderboard')).j;
ok(lb.ranked.length === 10 && lb.ranked[0].brp >= lb.ranked[9].brp && lb.ranked.every((x, i) => x.position === i + 1), 'leaderboard: 10 чансаатай, эрэмбэтэй');
// дахин ирсэн event (MatchZy давхар илгээлт) → давхар олголтгүй
await mz(compEv(101, 'map_result', 13, 10, 23, [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], SA5, SB5, { side: 't', team: 'team1' }));
await sleep(2500);
ok((await dump()).berx_rating_changes.filter(c => c.match_id === l[0].id).length === 10 && (await listAll(A)).length === 1, 'давхар event → шинэ тоглолт, давхар BRP үүсээгүй');

/* ---------- 5. Ranked, гэхдээ Steam холбоогүй тоглогч ---------- */
console.log('\n== ranked with unlinked player');
await players(roster([0, 1, 2, 3, 4, 5, 6, 7, 8, 14]));   // S(15) = BERX бүртгэлгүй
await sleep(5500);
await mz({ event: 'going_live', matchid: 102, map_number: 0 }); await sleep(300);
await mz(compEv(102, 'map_result', 13, 5, 18, [0, 1, 2, 3, 4], [5, 6, 7, 8, 14], SA5.map(x => ({ ...x, rounds_played: 18 })), SB5.map(x => ({ ...x, rounds_played: 18 })), { side: 'ct', team: 'team1' }));
l = await waitMatches(2);
dec = l && await decision(l[0].id);
ok(dec && dec.status === 'not_eligible' && dec.reason === 'unlinked_player' && !(await dump()).berx_rating_changes.some(c => c.match_id === l[0].id), 'бүртгэлгүй тоглогч → not_eligible, BRP хөдлөөгүй');
det = (await api(A, '/berx/matches/' + l[0].id)).j;
ok(det.match_type === 'ranked' && det.ranking.status === 'not_eligible' && det.ranking.reason === 'unlinked_player', 'Match History шалтгааныг харуулна (unlinked_player)');

/* ---------- 6. Casual Competitive ---------- */
console.log('\n== casual competitive');
await players(roster([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
t = Date.now(); await cmd(A, 'match_type', { value: 'casual' }); await cmdDone('match_type', t - 1);
await mz({ event: 'going_live', matchid: 103, map_number: 0 }); await sleep(300);
await mz(compEv(103, 'map_result', 13, 11, 24, [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], SA5, SB5, { side: 'ct', team: 'team1' }));
l = await waitMatches(3);
db = await dump();
ok(l[0].match_type === 'casual' && l[0].ranking === null && !db.berx_ranked_matches.some(x => x.match_id === l[0].id) && !db.berx_rating_changes.some(c => c.match_id === l[0].id), 'Casual → түүхэнд хадгалагдсан, BRP-д огт нөлөөлөөгүй');
ok(db.berx_matches.find(x => x.id === l[0].id).lock === null, 'Casual тоглолтод lock байхгүй');

/* ---------- 7. Ranked AIM 1v1 (Guard) ---------- */
console.log('\n== ranked AIM 1v1 with BERX Guard (simulated)');
const U3 = (s) => `[U:1:${BigInt(s) - 76561197960265728n}]`;
const P = (name, uid, s, tm) => `"${name}<${uid}><${U3(s)}><${tm}>"`;
const DOK = P('DOK', 2, S(1), 'CT'), KAZE = P('Kaze', 3, S(2), 'TERRORIST');
await players([{ userid: 2, name: 'DOK', steamid64: S(1), team: 3 }, { userid: 3, name: 'Kaze', steamid64: S(2), team: 2 }]);
t = Date.now();
r = await cmd(A, 'aim_start', { map: 'aim_map1v1cfg', size: 1, weapon: 'awp', rounds: 13, ranked: true });
ok(r.s === 200, 'Ranked AIM 1v1 AWP first to 13 → сайт зөвшөөрсөн');
ok(!!await until(async () => { const x = await srv(A); return x.arena && x.arena.workshop && x.arena.workshop.phase === 'ready' && x.arena.aim.ranked; }, 40000), 'AIM бэлэн, heartbeat: aim.ranked = true');
let c = await ctl();
ok(c.guard.enforcing && /css_berx_guard_on/.test(fs.readFileSync(rconLog, 'utf8')), 'agent: Ranked AIM-д BERX Guard хамгаалалтыг асаасан');
ok(c.guard.killed > 0 && /#GUARD point_servercommand killed/.test(fs.readFileSync(rconLog, 'utf8')), `map-ын point_servercommand (sv_cheats 1 г.м.) ажиллаагүй — дууриамал устгалт ${c.guard.killed}`);
const enforcedAt = Date.now();
await sleep(2500);
const att = (a, v, dmg, hp) => `${a} [0 0 0] attacked ${v} [10 10 0] with "awp" (damage "${dmg}") (damage_armor "0") (health "${hp}") (armor "0") (hitgroup "chest")`;
for (let i = 0; i < 15; i++) {
  const ctWins = i !== 4 && i !== 9;
  await emit(ctWins ? [att(DOK, KAZE, 115, 0), `${DOK} [0 0 0] killed ${KAZE} [1 1 0] with "awp"`] : [att(KAZE, DOK, 100, 0), `${KAZE} [0 0 0] killed ${DOK} [1 1 0] with "awp"`]);
  await sleep(60); await fetch(CTL + '/round?w=' + (ctWins ? 'CT' : 'T')); await sleep(120);
}
l = await until(async () => { const x = await listAll(A, '&mode=aim1v1'); return x.length ? x : null; }, 20000);
dec = l && await decision(l[0].id);
db = await dump();
const ac = db.berx_rating_changes.filter(x => x.match_id === (l && l[0].id));
ok(l && l[0].match_type === 'ranked' && l[0].score_ct === 13 && dec && dec.status === 'rated' && ac.find(x => x.steam_id === S(1)).delta === 30 && ac.find(x => x.steam_id === S(2)).delta === -30, 'Ranked AIM 13:2 → +30 / −30');
c = await ctl();
ok(!c.cheatsWindows.some(w => w.at >= enforcedAt && w.ms > 0) && c.cv.sv_cheats === '0', 'Guard идэвхтэй үед sv_cheats 1 болсон цонх байхгүй (симуляц)');
ok(db.berx_matches.find(x => x.id === l[0].id).lock.guard.ok === true, 'lock: guard ok тэмдэглэгдсэн');

/* ---------- 8. Casual rematch → Guard унтарна; Guard алга → Ranked AIM-ийг agent татгалзана ---------- */
console.log('\n== rematch casual / guard missing');
t = Date.now(); await cmd(A, 'aim_rematch', { size: 1, weapon: 'awp', rounds: 13, ranked: false });
const rc = await cmdDone('aim_rematch', t - 1);
ok(rc && rc.status === 'done' && /Энгийн/.test(rc.output) && !(await ctl()).guard.enforcing, 'Casual rematch → Guard унтарсан (Practice/infinite ammo-д саад болохгүй)');
await sleep(1500);
for (let i = 0; i < 13; i++) { await emit([`${KAZE} [0 0 0] killed ${DOK} [1 1 0] with "awp"`]); await sleep(40); await fetch(CTL + '/round?w=T'); await sleep(100); }
l = await until(async () => { const x = await listAll(A, '&mode=aim1v1'); return x.length >= 2 ? x : null; }, 20000);
ok(l && l[0].match_type === 'casual' && !(await dump()).berx_rating_changes.some(x => x.match_id === l[0].id), 'Casual AIM (rematch, шинэ ID) → BRP-гүй');
ok(l && l[0].id !== l[1].id, 'rematch бүр шинэ тоглолтын ID');
await fetch(CTL + '/guard?installed=0');
t = Date.now(); r = await cmd(A, 'aim_rematch', { size: 1, weapon: 'awp', rounds: 13, ranked: true });
const gm = await cmdDone('aim_rematch', t - 1);
ok(r.s === 200 && gm && gm.status === 'failed' && /BERX Guard/.test(gm.output), 'Guard алга → сайтын кэш ok байсан ч agent өөрөө Ranked AIM-ийг татгалзсан (давхар хамгаалалт)');
ok(!!await until(async () => { const x = await srv(A); return x.ranked && x.ranked.guard && x.ranked.guard.ok === false && !x.ranked.aim.ok; }, 10000), 'heartbeat: Guard алга → Ranked AIM хаагдсан (шалтгаантай)');
r = await cmd(A, 'aim_rematch', { size: 1, weapon: 'awp', rounds: 13, ranked: true });
ok(r.s === 400 && /Guard/.test(r.j.error), 'одоо сайт ч Ranked AIM-ийг татгалзана');
ok((await cmd(A, 'aim_rematch', { size: 1, weapon: 'awp', rounds: 13, ranked: false })).s === 200, 'Casual AIM Guard-гүй ч хэвийн ажиллана');
await fetch(CTL + '/guard?installed=1');
t = Date.now(); await cmd(A, 'aim_stop', { map: 'mirage' }); await cmdDone('aim_stop', t - 1);

/* ---------- 9. Review (admin) ---------- */
console.log('\n== review queue');
await act(A, 'ranking.settings', { rules: { min_duration_competitive_s: 900 }, reason: 'restore default' });
await players(roster([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
t = Date.now(); await cmd(A, 'match_type', { value: 'ranked' }); await cmdDone('match_type', t - 1);
await sleep(5500);
await mz({ event: 'going_live', matchid: 104, map_number: 0 }); await sleep(300);
await mz(compEv(104, 'map_result', 13, 9, 22, [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], SA5.map(x => ({ ...x, rounds_played: 22 })), SB5.map(x => ({ ...x, rounds_played: 22 })), { side: 'ct', team: 'team1' }));
l = await until(async () => { const x = await listAll(A, '&mode=competitive'); return x.length >= 4 ? x : null; }, 30000);
dec = l && await decision(l[0].id);
ok(dec && dec.status === 'review' && dec.reason === 'too_short' && dec.proposal && dec.proposal.changes.length === 10, 'хэт богино (симуляц хэдхэн секунд) → admin шалгалт, санал хадгалагдсан');
const brpBefore = (await api(A, '/berx/ranking/me')).j.player.brp;
let ov = (await api(A, '/admin/ranking')).j;
ok(ov.review.length === 1 && ov.review[0].matchId === l[0].id && ov.review[0].proposal.length === 10, 'admin: шалгалтын дараалалд харагдана');
ok((await act(A, 'ranking.review', { matchId: l[0].id, decision: 'approve', note: '' })).s === 400, 'шалтгаангүй зөвшөөрөл → 400');
r = await act(A, 'ranking.review', { matchId: l[0].id, decision: 'approve', note: 'simulation, verified lineup' });
ok(r.s === 200 && (await api(A, '/berx/ranking/me')).j.player.brp > brpBefore, 'admin зөвшөөрөл → BRP олгогдсон');
ok((await act(A, 'ranking.review', { matchId: l[0].id, decision: 'approve', note: 'second time!!' })).s === 400, 'дахин зөвшөөрөх → 400 (давхар олголтгүй)');

/* ---------- 10. Засвар + inflation ---------- */
console.log('\n== adjustments + summary');
const kb = (await api(K, '/berx/ranking/me')).j.player.brp;
r = await act(A, 'ranking.adjust', { userId: K.id, delta: 100, reason: 'server crash compensation' });
ok(r.s === 200 && (await api(K, '/berx/ranking/me')).j.player.brp === kb + 100, 'admin засвар +100 (шалтгаантай)');
ov = (await api(A, '/admin/ranking')).j;
const all = (await dump()).berx_rating_changes;
ok(ov.summary.gained === all.reduce((x, c) => x + Math.max(0, c.delta), 0) && ov.summary.lost === all.reduce((x, c) => x - Math.min(0, c.delta), 0) && ov.summary.adjustments === 1, `inflation: +${ov.summary.gained} / −${ov.summary.lost}`);
ok(ov.audit.some(a => a.action === 'adjust') && ov.audit.some(a => a.action === 'review_approve') && ov.audit.some(a => a.action === 'settings'), 'audit: засвар, review, тохиргоо');
const ph = (await api(A, `/admin/ranking/users/${K.id}`)).j;
ok(ph.history.some(h => h.kind === 'adjustment') && ph.history.some(h => h.detail), 'admin: тоглогчийн ledger (дэлгэрэнгүйтэй)');
const raw = JSON.stringify([await api(K, '/berx/ranking/me'), await api(K, '/berx/ranking/leaderboard'), ov, await srv(A)]);
ok(!raw.includes(SECRET) && !raw.includes('TESTKEY') && !raw.includes(RCON_PW), 'хариунд нууц (agent secret, service key, RCON) алга');

console.log(`\n${pass} passed, ${fail} failed`);
for (const p of procs) p.kill('SIGKILL');
process.exit(fail ? 1 : 0);
