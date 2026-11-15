// BERX MATCH HISTORY — end-to-end: жинхэнэ сайт + жинхэнэ BERX Agent + хуурамч CS2 (MatchZy event, CS2 log) + хуурамч Supabase
//   Бүх event СИМУЛЯЦИ (бодит сервер дээр тест хийгээгүй).   node tests/matches/e2e.mjs
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import net from 'net';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const until = async (f, ms, step = 300) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await f(); if (v) return v; } catch (e) { /* retry */ } await sleep(step); } return null; };
const procs = new Set(); const run = (args, env, logf) => { const p = spawn('node', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); const w = fs.createWriteStream(logf, { flags: 'a' }); p.stdout.pipe(w); p.stderr.pipe(w); procs.add(p); p.on('exit', () => procs.delete(p)); return p; };
const stop = async (p, sig = 'SIGKILL') => { if (!p || p.exitCode !== null) return; const done = new Promise(r => p.once('exit', r)); p.kill(sig); await done; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-mh-'));
const SECRET = 'match-agent-secret-' + 'q'.repeat(24), RCON_PW = 'rconMatch';
const CS2 = path.join(tmp, 'steamcmd', 'steamapps', 'common', 'Counter-Strike Global Offensive');
fs.mkdirSync(path.join(CS2, 'game', 'csgo', 'cfg', 'MatchZy'), { recursive: true }); fs.mkdirSync(path.join(CS2, 'game', 'csgo', 'maps'), { recursive: true });
for (const m of ['mirage', 'dust2', 'inferno', 'nuke', 'ancient', 'anubis', 'cache']) fs.writeFileSync(path.join(CS2, 'game', 'csgo', 'maps', `de_${m}.vpk`), 'x');
fs.writeFileSync(path.join(CS2, 'game', 'csgo', 'cfg', 'MatchZy', 'config.cfg'), 'matchzy_autostart_mode 1\n');
const [pgPort, sitePort, rconPort, ctlPort, evPort] = [await freePort(), await freePort(), await freePort(), await freePort(), await freePort()];
const rconLog = path.join(tmp, 'rcon.log'); fs.writeFileSync(rconLog, '');
run([path.join(ROOT, 'tests/skins/fake-supabase.js'), pgPort], {}, path.join(tmp, 'pg.log'));
run([path.join(ROOT, 'tests/server/fake-cs2.js'), rconPort, RCON_PW, rconLog, ctlPort, CS2, '1500'], {}, path.join(tmp, 'cs2.out'));
const siteEnv = { PORT: sitePort, SUPABASE_URL: `http://127.0.0.1:${pgPort}`, SUPABASE_SECRET_KEY: 'sb_secret_TESTKEY123', SESSION_SECRET: 'match_session_secret_match_session_secret',
  ADMIN_LOGINS: 'a@berx.mn', SERVER_AGENT_SECRET: SECRET, SERVER_PASSWORD: 'friendpw' };
let site = run([path.join(ROOT, 'server/server.js')], siteEnv, path.join(tmp, 'site.log'));
const B = `http://127.0.0.1:${sitePort}/api`, PG = `http://127.0.0.1:${pgPort}`, CTL = `http://127.0.0.1:${ctlPort}`;
await until(() => fetch(B + '/health').then(r => r.ok), 10000);
const reg = async (nick, login, sid) => {
  const r = await fetch(B + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, login, password: 'secret1' }) });
  const c = r.headers.get('set-cookie').split(';')[0]; const all = await (await fetch(PG + '/__dump')).json(); const id = all.users.find(x => x.login === login).id;
  if (sid) await fetch(`${PG}/__patch?t=users&k=id&v=${id}`, { method: 'POST', body: JSON.stringify({ steam_id: sid }) });
  return { c, id, sid };
};
const SA = '76561198000000001', SK = '76561198000000002', ST = '76561198000000003', SB = '76561198000000004';
const A = await reg('DOK', 'a@berx.mn', SA), K = await reg('Kaze', 'k@berx.mn', SK), N = await reg('Nomad', 'n@berx.mn', null);
const api = (u, p) => fetch(B + p, { headers: u ? { cookie: u.c } : {} }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
const act = (u, type, payload) => fetch(B + '/action', { method: 'POST', headers: { cookie: u.c, 'content-type': 'application/json' }, body: JSON.stringify({ type, payload }) }).then(async r => ({ s: r.status, j: await r.json() }));
const cmd = (u, type, args) => act(u, 'server.cmd', { type, args });
const srv = (u) => fetch(B + '/server/state', { headers: { cookie: u.c } }).then(r => r.json());
const ingest = (body, h = {}) => fetch(B + '/server/agent/matches', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) }).then(r => r.status);
const mz = (e) => fetch(CTL + '/mz', { method: 'POST', body: JSON.stringify(e) }).then(r => r.json());
const emit = (lines) => fetch(CTL + '/emit', { method: 'POST', body: JSON.stringify(lines) });
const players = (list) => fetch(CTL + '/set-players', { method: 'POST', body: JSON.stringify(list) });
const listAll = (u, q = '') => api(u, '/berx/matches?limit=50' + q).then(r => r.j.items || []);
const waitCount = (n, q = '') => until(async () => { const l = await listAll(A, q); return l.length >= n ? l : null; }, 25000);
const U3 = (s) => `[U:1:${BigInt(s) - 76561197960265728n}]`;
const P = (name, uid, s, team) => `"${name}<${uid}><${U3(s)}><${team}>"`;
const DOK = P('DOK', 2, SA, 'CT'), KAZE = P('Kaze', 3, SK, 'TERRORIST');
const pos = () => `[${(Math.random() * 4000 - 2000).toFixed(0)} ${(Math.random() * 4000 - 2000).toFixed(0)} ${(Math.random() * 300).toFixed(0)}]`;   // бодит log-д тоглогчийн байрлал
const cmdDone = (type) => until(async () => { const c = (await srv(A)).commands.find(x => x.type === type); return c && ['done', 'failed'].includes(c.status) ? c : null; }, 30000);

/* ---------- 1. Албан ёсны дүн: зөвхөн итгэмжлэгдсэн agent ---------- */
console.log('\n== ingest security');
const fake = { id: '11111111-1111-4111-8111-111111111111', server_id: 'main', source: 'cs2log', mode: 'aim1v1', map: 'aim_map1v1cfg', aim_weapon: 'awp', target_rounds: 10,
  status: 'completed', started_at: Date.now() - 60000, ended_at: Date.now(), rounds_played: 10, score_ct: 10, score_t: 0, winner: 'CT', players: [{ steam_id: SK, name: 'Kaze', team: 'CT', kills: 99, deaths: 0, assists: 0, headshot_kills: 99, rounds_played: 10 }] };
ok(await ingest({ match: fake }) === 401, 'Authorization-гүй → 401');
ok(await ingest({ match: fake }, { Authorization: 'Bearer ' + SECRET.slice(0, -1) + 'x' }) === 401, 'буруу agent secret → 401');
ok(await ingest({ match: fake }, { cookie: K.c }) === 401, 'нэвтэрсэн хэрэглэгчийн browser session → 401 (browser дүн илгээж чадахгүй)');
ok(await ingest({ match: { ...fake, players: [{ ...fake.players[0], steam_id: 'Kaze' }] } }, { Authorization: 'Bearer ' + SECRET }) === 400, 'agent secret-тэй ч буруу өгөгдөл → 400');
ok((await fetch(B + '/berx/matches', { method: 'POST', headers: { cookie: K.c, 'content-type': 'application/json' }, body: JSON.stringify({ match: fake }) })).status === 405, 'POST /api/berx/matches (browser) → 405');
ok((await act(K, 'match.save', { match: fake })).s === 400, '/api/action-оор дүн бичих боломжгүй');
ok((await api(null, '/berx/matches')).s === 401 && (await api(null, '/berx/players/' + SA + '/stats')).s === 401, 'нэвтрээгүй → Match History 401');
ok((await listAll(A)).length === 0, 'хуурамч дүн бичигдээгүй');

/* ---------- 2. Agent ---------- */
const MSTATE = path.join(tmp, 'matches.json');
const agentEnv = { BERX_AGENT_ENV: path.join(tmp, 'agent.env'), BERX_ARENA_STATE: path.join(tmp, 'arena.json'), BERX_MATCHES_STATE: MSTATE, MATCH_RETRY_MS: '400', ARENA_VERIFY_MS: '5000' };
fs.writeFileSync(path.join(tmp, 'agent.env'), `BERX_URL=http://127.0.0.1:${sitePort}\nSERVER_AGENT_SECRET=${SECRET}\nRCON_HOST=127.0.0.1\nRCON_PORT=${rconPort}\nRCON_PASSWORD=${RCON_PW}\nEVENTS_PORT=${evPort}\nPOLL_MS=1000\nCS2_DIR=${CS2}\n`);
const agentLog = path.join(tmp, 'agent.log');
let agent = run([path.join(ROOT, 'agent/berx-agent.js')], agentEnv, agentLog);
ok(!!await until(async () => { const x = await srv(A); return x.online && x.server.matchzy; }, 20000), 'agent v1.4.0 online');
await players([{ userid: 2, name: 'DOK', steamid64: SA, team: 3 }, { userid: 3, name: 'Kaze', steamid64: SK, team: 2 }, { userid: 4, name: 'BOT Abe', steamid64: '0', team: 2, bot: true }]);
ok(!!await until(async () => (await mz({ event: 'series_start', matchid: 0 })).status === 200, 5000), 'agent MatchZy remote log-ийг (localhost + нууц header) тохируулсан → event 200');

/* ---------- 3. Competitive (MatchZy) ---------- */
console.log('\n== competitive (MatchZy events)');
const st = (k, d, a, hs, dmg, mvp, rp) => ({ kills: k, deaths: d, assists: a, headshot_kills: hs, damage: dmg, mvp, rounds_played: rp, team_kills: 0, suicides: 0, kast: 75 });
const team = (score, ps) => ({ id: 'x', name: 'team', series_score: 0, score, score_ct: 0, score_t: 0, players: ps });
const comp = (mid, rows, winner, ev = 'round_end') => ({ event: ev, matchid: mid, map_number: 0, round_number: rows.n, winner,
  team1: team(rows.s1, [{ steamid: SA, name: 'DOK', stats: rows.a }, { steamid: '0', name: 'BOT Abe', stats: st(5, 0, 0, 0, 500, 0, 1) }]), team2: team(rows.s2, [{ steamid: SK, name: 'Kaze', stats: rows.k }]) });
ok((await mz(comp(1, { n: 1, s1: 1, s2: 0, a: st(1, 0, 0, 1, 100, 1, 1), k: st(0, 1, 0, 0, 20, 0, 1) }, { side: 'ct', team: 'team1' }))).status === 200, 'warmup/knife round_end (going_live-аас өмнө) — хүлээж авсан ч тоологдохгүй');
await mz({ event: 'going_live', matchid: 1, map_number: 0 });
await mz(comp(1, { n: 1, s1: 1, s2: 0, a: st(2, 0, 0, 1, 180, 1, 1), k: st(0, 1, 0, 0, 40, 0, 1) }, { side: 'ct', team: 'team1' }));
await mz(comp(1, { n: 13, s1: 13, s2: 10, a: st(28, 15, 4, 14, 2650, 7, 23), k: st(15, 28, 2, 4, 1700, 3, 23) }, { side: 't', team: 'team1' }));
await mz(comp(1, { n: 13, s1: 13, s2: 10, a: st(28, 15, 4, 14, 2650, 7, 23), k: st(15, 28, 2, 4, 1700, 3, 23) }, { side: 't', team: 'team1' }, 'map_result'));
let l = await waitCount(1);
ok(l && l[0].mode === 'competitive' && l[0].status === 'completed' && l[0].winner === 'T' && l[0].score_t === 13 && l[0].score_ct === 10 && l[0].map === 'de_mirage', 'competitive completed: team1 (T тал) 13:10, de_mirage');
let d = (await api(K, '/berx/matches/' + l[0].id)).j;
let dok = d.players.find(p => p.steamId === SA), kz = d.players.find(p => p.steamId === SK);
ok(d.players.length === 2 && dok.kills === 28 && dok.headshotKills === 14 && dok.damage === 2650 && dok.mvp === 7 && dok.result === 'win' && kz.result === 'loss', 'scoreboard: MatchZy статистик, damage, MVP, win/loss; bot хасагдсан');
ok(kz.isMe && !dok.isMe && dok.member && dok.member.nick === 'DOK', 'нэвтэрсэн хэрэглэгч (Kaze) тодорч, SteamID-аар гишүүнтэй холбогдсон');
ok(!JSON.stringify(d).includes(SECRET) && !JSON.stringify(d).includes('TESTKEY'), 'хариунд нууц алга');

/* ---------- 4. API/сүлжээний тасалдал → bounded retry ---------- */
console.log('\n== API failure + retry');
await fetch(PG + '/__rpcfail?n=3');
await mz({ event: 'going_live', matchid: 2, map_number: 0 });
await mz(comp(2, { n: 13, s1: 6, s2: 13, a: st(10, 20, 1, 3, 1500, 1, 19), k: st(20, 10, 3, 9, 2300, 6, 19) }, { side: 'ct', team: 'team2' }, 'map_result'));
l = await waitCount(2);
const alog = () => fs.readFileSync(agentLog, 'utf8');
ok(l && (alog().match(/Тоглолт илгээгдсэнгүй \(500\)/g) || []).length === 3 && /Тоглолт сайтад хадгалагдлаа/.test(alog()), 'Supabase 3 удаа 503 → agent backoff-оор дахин илгээж хадгалсан');
ok(l.filter(x => x.mode === 'competitive').length === 2, 'давхардаагүй (2 тоглолт)');

/* ---------- 5. Agent restart (competitive дундуур) ---------- */
console.log('\n== agent restart / persistent queue');
await mz({ event: 'going_live', matchid: 3, map_number: 0 });
await mz(comp(3, { n: 5, s1: 4, s2: 1, a: st(7, 2, 0, 3, 600, 2, 5), k: st(2, 7, 0, 1, 300, 0, 5) }, { side: 'ct', team: 'team1' }));
await sleep(800); await stop(agent);
ok(JSON.parse(fs.readFileSync(MSTATE, 'utf8')).recorder.live.ext === 'matchzy:3:0', 'agent гэнэт унтарсан: live тоглолт .berx-matches.json-д хадгалагдсан');
agent = run([path.join(ROOT, 'agent/berx-agent.js')], agentEnv, agentLog);
await until(async () => (await srv(A)).online, 15000); await sleep(1500);
await mz(comp(3, { n: 13, s1: 13, s2: 3, a: st(25, 6, 2, 12, 2100, 8, 16), k: st(6, 25, 1, 2, 900, 1, 16) }, { side: 'ct', team: 'team1' }, 'map_result'));
l = await waitCount(3);
d = l && (await api(A, '/berx/matches/' + l[0].id)).j;
ok(d && d.status === 'completed' && d.score_ct === 13 && d.players.find(p => p.steamId === SA).kills === 25, 'restart-ын дараа MatchZy-ийн хуримтлагдсан статистикаар completed (25 kill)');
// сайт унтарсан үед дууссан тоглолт → дараалалд → agent restart → сэргээж илгээнэ
await stop(site);
await mz({ event: 'going_live', matchid: 4, map_number: 0 });
await mz(comp(4, { n: 13, s1: 13, s2: 11, a: st(22, 18, 5, 9, 2400, 5, 24), k: st(18, 22, 4, 7, 2200, 4, 24) }, { side: 'ct', team: 'team1' }, 'map_result'));
ok(!!await until(() => JSON.parse(fs.readFileSync(MSTATE, 'utf8')).queue.items.length === 1, 8000), 'сайт унтарсан → дүн дискэн дараалалд');
await stop(agent);
site = run([path.join(ROOT, 'server/server.js')], siteEnv, path.join(tmp, 'site.log'));
await until(() => fetch(B + '/health').then(r => r.ok), 10000);
agent = run([path.join(ROOT, 'agent/berx-agent.js')], agentEnv, agentLog);
l = await waitCount(4);
ok(l && l.length === 4 && /Илгээгдээгүй 1 тоглолт дараалалд/.test(alog()), 'agent restart → дарааллаас сэргээж хадгалсан (алдагдаагүй, давхардаагүй)');
await until(async () => (await srv(A)).online, 15000);

/* ---------- 6. AIM 1v1 (CS2 log) ---------- */
console.log('\n== AIM 1v1 / rematch / 2v2 / return');
ok((await cmd(A, 'aim_start', { map: 'aim_map1v1cfg', size: 1, weapon: 'awp', rounds: 10 })).s === 200, 'AIM 1v1 AWP first to 10');
ok(!!await until(async () => { const x = await srv(A); return x.arena && x.arena.workshop && x.arena.workshop.phase === 'ready'; }, 40000), 'AIM бэлэн');
await players([{ userid: 2, name: 'DOK', steamid64: SA, team: 3 }, { userid: 3, name: 'Kaze', steamid64: SK, team: 2 }]);
await sleep(2500);
const att = (a, v, dmg, hp) => `${a} ${pos()} attacked ${v} ${pos()} with "awp" (damage "${dmg}") (damage_armor "0") (health "${hp}") (armor "0") (hitgroup "chest")`;
// 10 CT, 2 T: DOK 10 kill (6 HS), Kaze 2 kill
for (let i = 0; i < 12; i++) {
  const ctWins = i !== 3 && i !== 7;
  await emit(ctWins ? [att(DOK, KAZE, 115, 0), `${DOK} ${pos()} killed ${KAZE} ${pos()} with "awp"${i % 2 ? ' (headshot)' : ''}`] : [att(KAZE, DOK, 100, 0), `${KAZE} ${pos()} killed ${DOK} ${pos()} with "awp"`]);
  await sleep(60); await fetch(CTL + '/round?w=' + (ctWins ? 'CT' : 'T')); await sleep(120);
}
l = await until(async () => { const x = await listAll(A, '&mode=aim1v1'); return x.length ? x : null; }, 15000);
d = l && (await api(A, '/berx/matches/' + l[0].id)).j;
dok = d && d.players.find(p => p.steamId === SA); kz = d && d.players.find(p => p.steamId === SK);
ok(d && d.status === 'completed' && d.winner === 'CT' && d.score_ct === 10 && d.score_t === 2 && d.aim_weapon === 'awp' && d.target_rounds === 10 && d.map === 'aim_map1v1cfg', 'AIM 1v1 completed 10:2 (AWP, first to 10, aim_map1v1cfg)');
ok(dok.kills === 10 && dok.headshotKills === 4 && dok.deaths === 2 && kz.kills === 2 && kz.deaths === 10 && dok.roundsPlayed === 12, 'AIM K/D/HS log-оос яг тоологдсон, 12 round');
ok(d.has_damage && dok.damage === 1000 && kz.damage === 200 && d.has_mvp === false && dok.mvp === null, 'damage: overkill-гүй (100×10), MVP бүртгэгдээгүй → null');
ok(d.workshop_id === '3418431100' && l[0].image && l[0].image.startsWith('https://images.steamusercontent.com/'), 'Workshop ID + map зураг (catalog)');
ok(/mp_logdetail 3/.test(fs.readFileSync(rconLog, 'utf8')), 'AIM-д damage log (mp_logdetail 3) асаасан');
// Rematch → шинэ ID, дараа нь 2v2 rematch → Competitive руу буцах (дундуур)
const firstId = l[0].id;
ok((await cmd(A, 'aim_rematch', { size: 2, weapon: 'ak47', rounds: 13 })).s === 200, 'rematch: 2v2 AK first to 13');
await players([{ userid: 2, name: 'DOK', steamid64: SA, team: 3 }, { userid: 5, name: 'Tuya', steamid64: ST, team: 3 }, { userid: 3, name: 'Kaze', steamid64: SK, team: 2 }, { userid: 6, name: 'Bat', steamid64: SB, team: 2 }]);
ok(!!await cmdDone('aim_rematch') && !!await until(async () => { const x = await srv(A); return x.arena.workshop.phase === 'ready' && x.server.score && x.server.score.ct === 0; }, 20000), 'rematch гүйцэтгэгдэж бэлэн (0:0)');
await sleep(2000);
await emit([`${DOK} ${pos()} killed ${KAZE} ${pos()} with "ak47" (headshot)`, `${P('Tuya', 5, ST, 'CT')} assisted killing ${KAZE}`]); await sleep(60); await fetch(CTL + '/round?w=CT'); await sleep(200);
await emit([`${P('Bat', 6, SB, 'TERRORIST')} ${pos()} killed ${P('Tuya', 5, ST, 'CT')} ${pos()} with "ak47"`]); await sleep(60); await fetch(CTL + '/round?w=T'); await sleep(1500);
ok((await cmd(A, 'aim_stop', { map: 'mirage' })).s === 200, 'Competitive руу буцах (тоглолт дуусаагүй)');
const l2 = await until(async () => { const x = await listAll(A, '&mode=aim2v2'); return x.length ? x : null; }, 20000);
d = l2 && (await api(A, '/berx/matches/' + l2[0].id)).j;
ok(d && d.id !== firstId && d.mode === 'aim2v2' && d.status === 'aborted' && d.status_reason === 'returned_to_competitive' && d.winner === null, 'AIM 2v2: шинэ ID, Competitive руу буцахад aborted (ялагчгүй)');
ok(d && d.players.length === 4 && d.players.find(p => p.steamId === ST).assists === 1 && d.players.every(p => p.result === null), '2v2: 4 тоглогч, assist, дуусаагүй тул win/loss-гүй');
ok(!!await until(async () => /mp_logdetail 0/.test(fs.readFileSync(rconLog, 'utf8')), 15000), 'Competitive руу буцахад mp_logdetail өмнөх утга (0) руу сэргэсэн');

/* ---------- 7. Match History API: шүүлтүүр, хуудаслалт, профайл ---------- */
console.log('\n== Match History API');
const all = await listAll(A);
ok(all.length === 6 && (await listAll(A, '&mode=competitive')).length === 4 && (await listAll(A, '&mode=aim1v1')).length === 1 && (await listAll(A, '&mode=aim2v2')).length === 1, 'шүүлтүүр: бүгд 6, competitive 4, AIM 1v1 1, AIM 2v2 1');
ok(all.every((x, i) => !i || all[i - 1].started_at >= x.started_at), 'шинэ нь эхэндээ');
const p1 = (await api(A, '/berx/matches?limit=4')).j, p2 = (await api(A, '/berx/matches?limit=4&before=' + p1.next)).j;
ok(p1.items.length === 4 && p1.next && p2.items.length === 2 && !p2.next && !p2.items.some(x => p1.items.some(y => y.id === x.id)), 'хуудаслалт (cursor): 4 + 2, давхардалгүй');
ok((await api(A, '/berx/matches?mine=1')).j.items.length === 6 && (await api(N, '/berx/matches?mine=1')).j.needSteam === true, '"Миний тоглолт": Steam-гүй хэрэглэгчид тодорхой төлөв');
ok(all.find(x => x.mode === 'aim1v1').me.result === 'win', 'жагсаалтад өөрийн үр дүн (win)');
let ps = (await api(K, `/berx/players/${SA}/stats`)).j;
// completed: comp1 (win 28/15/hs14 dmg2650 r23), comp2 (loss 10/20 hs3 1500 r19), comp3 (win 25/6 hs12 2100 r16), comp4 (win 22/18 hs9 2400 r24), aim1v1 (win 10/2 hs4 dmg1000 r12)
ok(ps.matches === 5 && ps.wins === 4 && ps.losses === 1 && ps.winRate === 80 && ps.unfinished === 1, 'профайл: зөвхөн completed (5), 4W 1L, 80%, 1 дуусаагүй');
ok(ps.kills === 95 && ps.deaths === 61 && ps.kd === 1.56 && ps.headshotKills === 42 && ps.hsPct === 44.2, 'нийт 95/61 → K/D 1.56, HS% 42/95 = 44.2');
ok(ps.adr === Math.round((2650 + 1500 + 2100 + 2400 + 1000) / (23 + 19 + 16 + 24 + 12) * 10) / 10, 'ADR = нийт damage / нийт round: ' + ps.adr);
const pa = (await api(K, `/berx/players/${SA}/stats?mode=aim1v1`)).j;
ok(pa.matches === 1 && pa.kills === 10 && pa.kd === 5 && pa.recent.length === 1, 'горимоор: AIM 1v1');
const pn = (await api(K, `/berx/players/${ST}/stats`)).j;
ok(pn.matches === 0 && pn.kd === null && pn.adr === null && pn.unfinished === 1, 'зөвхөн дуусаагүй тоглолттой → 0 match, null утгууд');
ok((await api(K, '/berx/matches/00000000-0000-4000-8000-000000000000')).s === 404 && (await api(K, '/berx/players/123/stats')).s === 404, 'буруу ID → 404');

console.log(`\n${pass} passed, ${fail} failed`);
for (const p of procs) p.kill('SIGKILL');
process.exit(fail ? 1 : 0);
