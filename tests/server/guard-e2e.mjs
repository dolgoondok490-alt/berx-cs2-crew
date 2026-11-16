// BERX Guard / RCON — end-to-end (agent 1.5.1): жинхэнэ сайт + жинхэнэ BERX Agent + хуурамч CS2 (RCON эвдрэл, BERX Guard ДУУРАЙЛАГА) + хуурамч Supabase
//   Бүх зүйл СИМУЛЯЦИ — бодит CS2 / CounterStrikeSharp дээр туршаагүй.   node tests/server/guard-e2e.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-guard-'));
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

// Launcher-ийн AgentLogTail-ийн дүрэм (launcher/src/BerxLauncher/Core/Logging.cs): сүүлийн "✖" мөр сүүлийн "✓" мөрөөс шинэ бол → Agent Error → SERVER OFFLINE
const agentLog = path.join(tmp, 'agent.log');
const launcherSaysError = (fromLine = 0) => {
  const lines = fs.readFileSync(agentLog, 'utf8').split('\n').slice(fromLine);
  let lastErr = -1, lastOk = -1;
  lines.forEach((l, i) => { if (l.includes('✖')) lastErr = i; else if (!l.includes('⚠') && l.includes('✓')) lastOk = i; });
  return lastErr > lastOk ? lines[lastErr] : null;
};
const logLines = () => fs.readFileSync(agentLog, 'utf8').split('\n').length - 1;   // сүүлийн хоосон мөрийг тоолохгүй
const guardSet = (q) => fetch(CTL + '/guard?' + q);
const rconSet = (q) => fetch(CTL + '/rcon?' + q);
const rconCmds = () => fs.readFileSync(rconLog, 'utf8');

/* ---------- Agent + ranking flags ---------- */
console.log('\n== setup');
const agentEnv = { BERX_AGENT_ENV: path.join(tmp, 'agent.env'), BERX_ARENA_STATE: path.join(tmp, 'arena.json'), BERX_MATCHES_STATE: path.join(tmp, 'matches.json'), MATCH_RETRY_MS: '400', ARENA_VERIFY_MS: '5000' };
fs.writeFileSync(path.join(tmp, 'agent.env'), `BERX_URL=http://127.0.0.1:${sitePort}\nSERVER_AGENT_SECRET=${SECRET}\nRCON_HOST=127.0.0.1\nRCON_PORT=${rconPort}\nRCON_PASSWORD=${RCON_PW}\nEVENTS_PORT=${evPort}\nPOLL_MS=1000\nCS2_DIR=${CS2}\n`);
const agent = run([path.join(ROOT, 'agent/berx-agent.js')], agentEnv, agentLog);
ok((await act(A, 'ranking.settings', { enabled: true, competitive: true, aim: true, rules: { min_duration_aim_s: 0 }, reason: 'guard e2e simulation' })).s === 200, 'чансаа + Ranked AIM flag (зөвхөн тестийн DB)');
let st = await until(async () => { const x = await srv(A); return x.online && x.ranked && x.ranked.guard && x.ranked.guard.ok ? x : null; }, 25000);
ok(st && st.ranked.agentOk && st.ranked.aim.ok, 'agent 1.5.1 online, Guard баталгаажсан (status)');
ok(/BERX Agent v1\.5\.1/.test(fs.readFileSync(agentLog, 'utf8')), 'agent хувилбар 1.5.1');
ok(/echo BERX_RCON_END_\d+/.test(rconCmds()), 'Guard уншилт echo маркертай (хариуны төгсгөл найдвартай)');
await players([{ userid: 2, name: 'DOK', steamid64: S(1), team: 3 }, { userid: 3, name: 'Kaze', steamid64: S(2), team: 2 }]);

const aimStart = async (ranked, extra = {}) => { const t = Date.now(); const r = await cmd(A, 'aim_start', { map: 'aim_map1v1cfg', size: 1, weapon: 'awp', rounds: 13, ranked, ...extra }); return { r, c: r.s === 200 ? await cmdDone('aim_start', t - 1) : null }; };
const rematch = async (ranked) => { const t = Date.now(); const r = await cmd(A, 'aim_rematch', { size: 1, weapon: 'awp', rounds: 13, ranked }); return { r, c: r.s === 200 ? await cmdDone('aim_rematch', t - 1) : null }; };
const ready = () => until(async () => { const x = await srv(A); return x.arena && x.arena.workshop && x.arena.workshop.phase === 'ready' ? x : null; }, 40000);

/* ---------- 1. Хоосон хариу → дахин оролдоод амжилттай ---------- */
console.log('\n== empty response then retry');
let L0 = logLines();
await guardSet('empty=1');
let a = await aimStart(true);
ok(a.c && a.c.status === 'done', 'эхний Guard хариу хоосон → дахин оролдоод Ranked AIM эхэлсэн');
ok(/хоосон хариу.*оролдлого 1\/3/.test(fs.readFileSync(agentLog, 'utf8').split('\n').slice(L0).join('\n')), 'log: "RCON хоосон хариу өгсөн · оролдлого 1/3" (ангилалтай)');
ok(!!await ready() && (await ctl()).guard.enforcing, 'AIM бэлэн, Guard enforcing=1');

/* ---------- 2. Ranked AIM map reload / round start: плагин дахин ачаалагдсан ч Guard сэргэнэ ---------- */
console.log('\n== ranked AIM map reload');
let t = Date.now(); await cmd(A, 'aim_stop', { map: 'mirage' }); await cmdDone('aim_stop', t - 1);
await guardSet('resetOnMap=1');
L0 = logLines();
a = await aimStart(true);
ok(a.c && a.c.status === 'done', 'Ranked AIM (map дахин ачаалал)');
ok(!!await ready(), 'AIM бэлэн');
const reenabled = await until(async () => (await ctl()).guard.enforcing, 25000);
ok(reenabled && /#GUARD reset/.test(rconCmds()) && /BERX Guard Ranked AIM-ийн үед унтарсан байна/.test(fs.readFileSync(agentLog, 'utf8').split('\n').slice(L0).join('\n')), 'map ачаалалд Guard унтарсан (дууриамал) → agent илрүүлж дахин асаасан');
const rl = rconCmds(), iReset = rl.lastIndexOf('#GUARD reset'), iOn = rl.indexOf('css_berx_guard_on', iReset), iRestart = rl.indexOf('#RESTARTGAME', iReset);
ok(iOn > 0 && iRestart > iOn, 'тоглолт эхлэх (mp_restartgame / Match_Start)-ээс ӨМНӨ Guard дахин асаагдсан');
await guardSet('resetOnMap=0');

/* ---------- 3. Casual руу буцах → Guard унтарна ---------- */
console.log('\n== casual restoration');
let rm = await rematch(false);
ok(rm.c && rm.c.status === 'done' && !(await ctl()).guard.enforcing, 'Casual rematch → Guard унтарсан');
rm = await rematch(true);
ok(rm.c && rm.c.status === 'done' && (await ctl()).guard.enforcing, 'Ranked rematch → Guard дахин асаагдсан');
t = Date.now(); await cmd(A, 'aim_stop', { map: 'mirage' }); await cmdDone('aim_stop', t - 1);
ok(!(await ctl()).guard.enforcing, 'aim_stop (Competitive руу) → Guard унтарсан');
await guardSet('enforcing=1');                               // гар аргаар асаасан (оношилгоо)
t = Date.now(); await cmd(A, 'mode', { mode: 'practice' }); await cmdDone('mode', t - 1);
ok(!(await ctl()).guard.enforcing, 'Practice горим руу шилжихэд гар аргаар асаасан Guard унтарсан (sv_cheats шаардлагатай)');
t = Date.now(); await cmd(A, 'mode', { mode: 'competitive' }); await cmdDone('mode', t - 1);

/* ---------- 4. Timeout + reconnect (TCP нээлттэй, сервер хариу өгөхгүй) ---------- */
console.log('\n== stale RCON: timeout + reconnect');
const conns0 = (await ctl()).rconConnections;
L0 = logLines();
await rconSet('stall=1');
a = await aimStart(true);
ok(a.c && a.c.status === 'done', 'хариугүй болсон RCON холболт → Guard шалгалт дахин холбогдоод Ranked AIM эхэлсэн');
ok((await ctl()).rconConnections > conns0 && /RCON хариу өгсөнгүй \(timeout\)/.test(fs.readFileSync(agentLog, 'utf8').split('\n').slice(L0).join('\n')), 'log: timeout ангилал + шинэ RCON холболт');
ok(!!await ready(), 'AIM бэлэн (шинэ холболтоор)');

/* ---------- 5. Хэсэгчилсэн пакет ---------- */
console.log('\n== fragmented RCON packets');
await rconSet('fragment=1');
rm = await rematch(true);
ok(rm.c && rm.c.status === 'done' && (await ctl()).guard.enforcing, 'бүх RCON хариу 1–7 байтаар хэсэгчлэгдсэн ч Ranked rematch амжилттай');
await rconSet('fragment=0');

/* ---------- 6. Татгалзсан Ranked AIM → сервер/agent offline БИШ ---------- */
console.log('\n== rejected Ranked AIM without false offline');
const okBefore = launcherSaysError();
await guardSet('installed=0');
L0 = logLines();
rm = await rematch(true);
ok(rm.r.s === 200 && rm.c && rm.c.status === 'failed' && /плагин серверт алга/.test(rm.c.output), 'Guard алга → agent Ranked AIM-ийг татгалзсан (шалтгаан: плагин серверт алга)');
ok(!launcherSaysError(L0), 'agent log-д "✖" алга → launcher "Agent Error / SERVER OFFLINE" гэж харуулахгүй' + (okBefore ? '' : ''));
ok(/⚠ Команд амжилтгүй: aim_rematch/.test(fs.readFileSync(agentLog, 'utf8').split('\n').slice(L0).join('\n')), 'log: "⚠ Команд амжилтгүй" (командын түвшин)');
await sleep(3000);
st = await srv(A);
ok(st.online === true && agent.exitCode === null, 'сайт: сервер ONLINE хэвээр, agent процесс ажиллаж байна');
await guardSet('installed=1');
ok(!!await until(async () => { const x = await srv(A); return x.ranked && x.ranked.guard && x.ranked.guard.ok; }, 15000), 'Guard буцаж суусан → сайт дахин ok гэж харсан');
await guardSet('degraded=1');                                  // сайтын кэш ok хэвээр байх агшинд → agent өөрөө шалгаж татгалзах ёстой
rm = await rematch(true);
ok(rm.c && rm.c.status === 'failed' && /degraded/.test(rm.c.output) && !launcherSaysError(L0), 'degraded → татгалзсан, offline биш' + (rm.c ? ' :: ' + rm.c.output : ''));
await guardSet('degraded=0');
await until(async () => { const x = await srv(A); return x.ranked && x.ranked.guard && x.ranked.guard.ok; }, 15000);
await rematch(false);                                          // Casual → Guard унтарна (идэвхтэй Ranked AIM-ийн upkeep асаахгүй)
await guardSet('failOn=1');
rm = await rematch(true);
ok(rm.c && rm.c.status === 'failed' && /хамгаалалт баталгаажсангүй \(enforcing=0/.test(rm.c.output) && !(await ctl()).guard.enforcing, 'асаалт хэрэгжээгүй (enforcing=0) → татгалзсан, Guard унтраалттай үлдсэн' + (rm.c ? ' :: ' + rm.c.output : ''));
await guardSet('failOn=0');
ok(!launcherSaysError(L0) && (await srv(A)).online, 'бүх татгалзлын дараа launcher/сайт ONLINE');
rm = await rematch(false);
ok(rm.c && rm.c.status === 'done', 'Casual AIM Guard-гүйгээр хэвийн');

/* ---------- 7. Heartbeat RCON удааширсан ч тасрахгүй ---------- */
console.log('\n== heartbeat watchdog');
t = Date.now(); await cmd(A, 'aim_stop', { map: 'mirage' }); await cmdDone('aim_stop', t - 1);
await rconSet('stall=1');
await sleep(22000);
st = await srv(A);
ok(st.online === true && Date.now() - st.lastSeen < 15000, `RCON хариугүй үед ч heartbeat явсаар (lastSeen ${Math.round((Date.now() - st.lastSeen) / 1000)}с өмнө) — сайт OFFLINE гэж харуулаагүй`);

console.log(`\n${pass} passed, ${fail} failed`);
for (const p of procs) p.kill('SIGKILL');
process.exit(fail ? 1 : 0);
