// BERX ARENA — SERVER API regression + Workshop map + AIM 1V1 end-to-end тест
//   жинхэнэ сайт (server/server.js → lib/handler.js) + жинхэнэ BERX Agent (agent/berx-agent.js)
//   + хуурамч Supabase + хуурамч CS2 (tests/server/fake-cs2.js: Workshop татах үед сервер "гацна", MatchZy sleep.cfg)
//   node tests/server/arena.mjs
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import net from 'net';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const until = async (f, ms, step = 400) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await f(); if (v) return v; } catch (e) { /* retry */ } await sleep(step); } return null; };
const procs = []; const run = (args, env, logf) => { const p = spawn('node', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); const w = fs.createWriteStream(logf); p.stdout.pipe(w); p.stderr.pipe(w); procs.push(p); return p; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-arena-'));
const SECRET = 'arena-agent-secret-' + 'y'.repeat(24), RCON_PW = 'rconArena';
const CS2 = path.join(tmp, 'steamcmd', 'steamapps', 'common', 'Counter-Strike Global Offensive');
fs.mkdirSync(path.join(CS2, 'game', 'csgo', 'cfg', 'MatchZy'), { recursive: true });
fs.mkdirSync(path.join(CS2, 'game', 'csgo', 'maps'), { recursive: true });
for (const m of ['mirage', 'dust2', 'inferno', 'nuke', 'ancient', 'anubis', 'cache']) fs.writeFileSync(path.join(CS2, 'game', 'csgo', 'maps', `de_${m}.vpk`), 'x');
fs.writeFileSync(path.join(CS2, 'game', 'csgo', 'cfg', 'MatchZy', 'config.cfg'), 'matchzy_autostart_mode 1\n');
const serverCfg = path.join(CS2, 'game', 'csgo', 'cfg', 'server.cfg'); fs.writeFileSync(serverCfg, 'hostname "BERX ARENA"\nrcon_password "' + RCON_PW + '"\n');
const serverCfgBefore = fs.readFileSync(serverCfg, 'utf8');

const [pgPort, sitePort, rconPort, ctlPort, evPort] = [await freePort(), await freePort(), await freePort(), await freePort(), await freePort()];
const rconLog = path.join(tmp, 'rcon.log'); fs.writeFileSync(rconLog, '');
run([path.join(ROOT, 'tests/skins/fake-supabase.js'), pgPort], {}, path.join(tmp, 'pg.log'));
run([path.join(ROOT, 'tests/server/fake-cs2.js'), rconPort, RCON_PW, rconLog, ctlPort, CS2, '6000'], {}, path.join(tmp, 'cs2.out'));
run([path.join(ROOT, 'server/server.js')], { PORT: sitePort, SUPABASE_URL: `http://127.0.0.1:${pgPort}`, SUPABASE_SECRET_KEY: 'sb_secret_TESTKEY123', SESSION_SECRET: 'arena_session_secret_arena_session_secret',
  ADMIN_LOGINS: 'a@berx.mn', SERVER_AGENT_SECRET: SECRET, SERVER_PASSWORD: 'friendpw' }, path.join(tmp, 'site.log'));
const B = `http://127.0.0.1:${sitePort}/api`, PG = `http://127.0.0.1:${pgPort}`, CTL = `http://127.0.0.1:${ctlPort}`;
await until(() => fetch(B + '/health').then(r => r.ok), 10000);
const cs2 = () => fetch(CTL + '/state').then(r => r.json());
const reg = async (nick, login, sid) => {
  const r = await fetch(B + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, login, password: 'secret1' }) });
  const c = r.headers.get('set-cookie').split(';')[0]; const all = await (await fetch(PG + '/__dump')).json(); const id = all.users.find(x => x.login === login).id;
  if (sid) await fetch(`${PG}/__patch?t=users&k=id&v=${id}`, { method: 'POST', body: JSON.stringify({ steam_id: sid }) });
  return { c, id };
};
const act = (u, type, payload) => fetch(B + '/action', { method: 'POST', headers: { cookie: u.c, 'content-type': 'application/json' }, body: JSON.stringify({ type, payload }) }).then(async r => ({ s: r.status, j: await r.json() }));
const get = (u) => fetch(B + '/server/state', { headers: { cookie: u.c } }).then(r => r.json());
const cmd = (u, type, args) => act(u, 'server.cmd', { type, args });
const lastCmd = async (u, type) => (await get(u)).commands.find(c => c.type === type);
const cmdDone = (u, type) => until(async () => { const c = await lastCmd(u, type); return c && ['done', 'failed'].includes(c.status) ? c : null; }, 30000);

const A = await reg('DOK', 'a@berx.mn', '76561198000000001'), K = await reg('Kaze', 'k@berx.mn', '76561198000000002'), N = await reg('Nomad', 'n@berx.mn', null);

/* ===================== 1. SERVER API regression (agent-гүй) ===================== */
console.log('\n== SERVER API regression');
ok((await fetch(B + '/server/state')).status === 401, 'нэвтрээгүй /server/state → 401');
let s = await get(K);
ok(s.configured === true && s.online === false && !s.server && !s.connect, 'agent-гүй: Offline, хуурамч өгөгдөлгүй');
ok(!('commands' in s), 'admin биш хэрэглэгч командын түүх харахгүй');
ok(s.catalog && s.catalog.workshop.some(m => m.id === 'aim_map' && m.workshopId === '3469339086') && s.catalog.competitive.length === 7, 'catalog: 7 competitive + aim_map (Workshop 3469339086)');
ok(s.arena === null, 'agent-гүй үед Workshop/AIM төлөв харуулахгүй');
for (const [h, exp] of [[{}, 401], [{ Authorization: 'Bearer wrong' }, 401], [{ Authorization: 'Bearer ' + SECRET.slice(0, -1) + 'z' }, 401]]) ok((await fetch(B + '/server/agent/poll', { headers: h })).status === exp, 'agent poll буруу нууц → ' + exp);
for (const [t, p] of [['server.cmd', { type: 'changemap', args: { map: 'nuke' } }], ['server.cmd', { type: 'aim_start', args: { map: 'aim_map', size: 1, weapon: 'ak47', rounds: 10 } }], ['server.shuffle', {}], ['server.move', { userId: K.id, team: 'CT' }]]) {
  const r = await act(K, t, p); ok(r.s >= 400, `admin биш ${t}${p.type ? ' ' + p.type : ''} → ${r.s} (${r.j.error})`);
}
ok((await act(N, 'server.join', { team: 'CT' })).s >= 400, 'Steam ID-гүй CT-д орохгүй');
ok((await act(K, 'server.vote', { map: 'inferno' })).s === 200 && (await act(K, 'server.vote', { map: 'aim_map' })).s >= 400, 'санал: competitive map OK, aim_map/буруу map татгалзана');
for (const [p, exp] of [[{ type: 'rcon', args: { cmd: 'quit' } }, false], [{ type: 'roundtime', args: { value: 999 } }, false], [{ type: 'kick', args: { steamId: 'abc; quit' } }, false],
  [{ type: 'aim_start', args: { map: 'aim_map', size: 3, weapon: 'ak47', rounds: 10 } }, false], [{ type: 'aim_start', args: { map: 'aim_map', size: 1, weapon: 'negev', rounds: 10 } }, false],
  [{ type: 'aim_start', args: { map: 'aim_map', size: 1, weapon: 'ak47', rounds: 11 } }, false], [{ type: 'aim_start', args: { map: '3469339086', size: 1, weapon: 'ak47', rounds: 10 } }, false],
  [{ type: 'workshop_map', args: { map: '123456789' } }, false], [{ type: 'aim_rematch', args: { size: 1, weapon: 'ak47', rounds: 10 } }, false]]) {
  const r = await cmd(A, p.type, p.args); ok((r.s === 200) === exp, `admin ${p.type} ${JSON.stringify(p.args)} → ${r.s} ${r.j.error || ''}`);
}
ok(!JSON.stringify(await get(A)).includes(RCON_PW) && !JSON.stringify(await get(A)).includes(SECRET), 'state-д RCON/agent нууц байхгүй');

/* ===================== 2. Agent асаах ===================== */
console.log('\n== Agent v1.3.0');
const ARENA_STATE = path.join(tmp, 'arena-state.json');
const agentEnv = { BERX_AGENT_ENV: path.join(tmp, 'agent.env'), BERX_ARENA_STATE: ARENA_STATE, ARENA_VERIFY_MS: '5000' };
fs.writeFileSync(path.join(tmp, 'agent.env'), `BERX_URL=http://127.0.0.1:${sitePort}\nSERVER_AGENT_SECRET=${SECRET}\nRCON_HOST=127.0.0.1\nRCON_PORT=${rconPort}\nRCON_PASSWORD=${RCON_PW}\nEVENTS_PORT=${evPort}\nPOLL_MS=2000\nPUBLIC_ADDRESS=203.0.113.5:27015\nCS2_DIR=${CS2}\n`);
const agentLog = path.join(tmp, 'agent.log');
let agent = run([path.join(ROOT, 'agent/berx-agent.js')], agentEnv, agentLog);
s = await until(async () => { const x = await get(A); return x.online && x.arena ? x : null; }, 20000);
ok(!!s, 'agent холбогдож online + Workshop/AIM төлөв илгээнэ');
ok(s && s.server.map === 'de_mirage' && s.server.matchzy === true && s.arena.mode === 'competitive' && s.arena.installed.aim_map === false && s.arena.agentCatalog.includes('aim_map'), 'эхний төлөв: competitive, aim_map серверт татагдаагүй');
ok(s && s.connect && s.connect.command.includes('203.0.113.5:27015'), 'connect команд');
// pre-AIM: админ тохиргоо (snapshot-д ороод сэргээгдэх ёстой)
for (const [t, a] of [['freezetime', { value: 7 }], ['maxrounds', { value: 30 }], ['roundtime', { value: 3 }]]) { await cmd(A, t, a); }
await until(async () => { const c = await cs2(); return c.cv.mp_freezetime === '7' && c.cv.mp_maxrounds === '30' && c.cv.mp_roundtime_hostage === '3'; }, 15000);
await sleep(1500);
const before = (await cs2()).cv;
ok(before.mp_freezetime === '7' && before.mp_maxrounds === '30', 'competitive тохиргоо: freezetime 7, maxrounds 30, roundtime 3');

/* ===================== 3. Workshop татах + AIM эхлүүлэх ===================== */
console.log('\n== aim_start: aim_map 1v1 AWP first to 10');
let r = await cmd(A, 'aim_start', { map: 'aim_map', size: 1, weapon: 'awp', rounds: 10 });
ok(r.s === 200, 'admin aim_start дараалалд орлоо');
const seen = new Set(); let premature = null, sawBusyOnline = false;
const fin = await until(async () => {
  const st = await get(A), c = await cs2(), w = st.arena && st.arena.workshop;
  if (w) seen.add(w.phase);
  if (w && w.phase === 'ready' && !(c.map === 'aim_map' && c.cv.mp_ct_default_primary === 'weapon_awp' && c.cv.mp_maxrounds === '19')) premature = { phase: w.phase, map: c.map, cv: c.cv.mp_ct_default_primary };
  if (c.busy && w && w.phase === 'downloading') sawBusyOnline = true;
  return w && ['ready', 'error'].includes(w.phase) ? st : null;
}, 60000, 300);
ok(!!fin && fin.arena.workshop.phase === 'ready', 'Workshop map бэлэн болов: ' + (fin && JSON.stringify(fin.arena.workshop)));
ok(seen.has('downloading'), 'сайт "Workshop-оос татаж байна" төлөв харуулсан: ' + [...seen].join(' → '));
ok(sawBusyOnline, 'сервер татаж байх үед (RCON хариугүй) downloading гэж үнэн мэдээлсэн');
ok(seen.has('configuring') || seen.has('loading'), 'ачаалах/тохируулах үе шат харагдсан');
ok(premature === null, 'map ачаалагдаж, AIM тохиргоо батлагдахаас ӨМНӨ "Бэлэн" гэж хэзээ ч мэдээлээгүй ' + JSON.stringify(premature));
let c = await cs2();
ok(c.map === 'aim_map' && fin.server.map === 'aim_map', 'сервер бодитоор aim_map дээр');
ok(c.autostart === 0 && c.restarts >= 1, 'MatchZy: css_restart + matchzy_autostart_mode 0 (унтсан)');
ok(c.cv.mp_maxrounds === '19' && c.cv.mp_freezetime === '0' && c.cv.mp_autoteambalance === '0' && c.cv.mp_limitteams === '0' && c.cv.bot_quota === '0' && c.cv.mp_t_default_primary === 'weapon_awp' && c.cv.mp_match_end_restart === '1', 'AIM тохиргоо: first to 10 (maxrounds 19), freezetime 0, balance off, bot 0, AWP, дуусахад дахин эхэлнэ');
ok(!c.players.some(p => p.bot), 'bot kick хийгдсэн');
const lines = fs.readFileSync(rconLog, 'utf8').split('\n');
const idx = (re) => lines.findIndex(l => re.test(l));
ok(idx(/ css_restart$/) < idx(/ matchzy_autostart_mode 0$/) && idx(/ matchzy_autostart_mode 0$/) < idx(/ host_workshop_map 3469339086$/), 'дараалал: css_restart → autostart 0 → host_workshop_map');
const sleepAt = c.sleepAt[c.sleepAt.length - 1], awpAt = c.configLog.filter(x => x.k === 'mp_ct_default_primary' && x.v === 'weapon_awp').map(x => x.t).pop();
ok(sleepAt && awpAt && awpAt > sleepAt, 'AIM тохиргоо MatchZy sleep.cfg-ийн ДАРАА хэрэгжсэн (дарагдаагүй)');
ok(fin.server.mode === 'aim' && fin.arena.aim && fin.arena.aim.weapon === 'awp' && fin.arena.installed.aim_map === true, 'сайт: AIM идэвхтэй, aim_map серверт татагдсан');
ok(fs.existsSync(path.join(tmp, 'steamcmd', 'steamapps', 'workshop', 'content', '730', '3469339086', '3469339086.vpk')), 'Workshop .vpk SteamCMD steamapps\\workshop\\content\\730-д');
const snapFile = JSON.parse(fs.readFileSync(ARENA_STATE, 'utf8'));
ok(snapFile.snapshot && snapFile.snapshot.values.mp_freezetime === '7' && snapFile.snapshot.values.mp_maxrounds === '30' && snapFile.matchzyAutostart === 1, 'өмнөх тохиргоо (snapshot) + MatchZy autostart=1 хадгалагдсан');
ok(!JSON.stringify(snapFile).includes(RCON_PW) && !JSON.stringify(snapFile).includes(SECRET), 'arena төлөвийн файлд нууц мэдээлэл алга');

/* ===================== 4. AIM-ийн үеийн хамгаалалт ===================== */
console.log('\n== AIM үеийн хамгаалалт');
s = await get(K);
ok(s.cap.CT === 1 && s.cap.T === 1, 'AIM 1v1: баг бүр 1 хүн');
ok((await act(K, 'server.join', { team: 'CT' })).s === 200, 'Kaze CT-д орлоо');
r = await act(A, 'server.join', { team: 'CT' }); ok(r.s >= 400, '1v1: CT дүүрсэн → ' + r.j.error);
for (const t of ['apply_teams', 'match_start', 'knife']) { r = await cmd(A, t, t === 'knife' ? { value: true } : {}); ok(r.s >= 400 && /AIM/.test(r.j.error), `AIM үед ${t} татгалзана (MatchZy-г сэрээхгүй)`); }
// MatchZy/өөр cfg AIM тохиргоог дарж бичвэл agent дахин хэрэгжүүлнэ
await fetch(CTL + '/exec-sleep');
ok(!!await until(async () => (await cs2()).cv.mp_maxrounds === '19', 20000), 'AIM тохиргоо өөрчлөгдвөл agent автоматаар сэргээнэ');

/* ===================== 5. Дахин тоглох (тохиргоо солих) ===================== */
console.log('\n== aim_rematch: 2v2 M4A1-S first to 16');
r = await cmd(A, 'aim_rematch', { size: 2, weapon: 'm4a1s', rounds: 16 }); ok(r.s === 200, 'aim_rematch дараалалд');
let done = await cmdDone(A, 'aim_rematch'); ok(done && done.status === 'done', 'aim_rematch done: ' + (done && done.output));
ok(!!await until(async () => { const x = await get(A); return x.arena.workshop.phase === 'ready' && x.arena.aim.size === 2 ? x : null; }, 20000), 'дахин бэлэн, 2v2');
c = await cs2();
ok(c.cv.mp_maxrounds === '31' && c.cv.mp_ct_default_primary === 'weapon_m4a1_silencer' && c.map === 'aim_map', 'first to 16 (31), M4A1-S, map солигдоогүй');
ok(fs.readFileSync(rconLog, 'utf8').split('\n').filter(l => / mp_restartgame 1$/.test(l)).length >= 2, 'mp_restartgame 1 — тоглолт дахин эхэлсэн');
ok((await get(K)).cap.CT === 2 && (await act(A, 'server.join', { team: 'CT' })).s === 200, '2v2: CT-д 2 дахь хүн орж болно');

/* ===================== 6. Agent restart — AIM төлөв үргэлжилнэ ===================== */
console.log('\n== agent restart');
agent.kill(); await sleep(800);
agent = run([path.join(ROOT, 'agent/berx-agent.js')], agentEnv, agentLog + '.2');
ok(!!await until(async () => { const x = await get(A); return x.online && x.arena && x.arena.mode === 'aim' && x.arena.workshop.phase === 'ready' ? x : null; }, 20000), 'agent дахин асахад AIM төлөв, snapshot хадгалагдсан');

/* ===================== 7. Competitive руу буцах — тохиргоо сэргээх ===================== */
console.log('\n== aim_stop → inferno');
r = await cmd(A, 'aim_stop', { map: 'inferno' }); ok(r.s === 200, 'aim_stop дараалалд');
done = await cmdDone(A, 'aim_stop'); ok(done && done.status === 'done', 'aim_stop done: ' + (done && done.output));
c = await cs2();
ok(c.map === 'de_inferno', 'сервер de_inferno руу шилжсэн');
ok(c.autostart === 1, 'MatchZy autostart 1 сэргээгдсэн (warmup/ready систем дахин ажиллана)');
const diff = Object.keys(before).filter(k => k !== 'mp_warmup_pausetimer' && before[k] !== c.cv[k]);
ok(diff.length === 0, 'бүх convar AIM-ээс өмнөх утгаараа сэргэсэн' + (diff.length ? ': ' + diff.map(k => `${k} ${before[k]}≠${c.cv[k]}`).join(', ') : ''));
s = await until(async () => { const x = await get(A); return x.arena && x.arena.mode === 'competitive' && x.server.map === 'de_inferno' ? x : null; }, 15000);
ok(!!s && s.cap.CT === 5 && s.server.mode === 'competitive', 'сайт: Competitive, баг 5v5');
ok(JSON.parse(fs.readFileSync(ARENA_STATE, 'utf8')).aim === null, 'arena төлөв цэвэрлэгдсэн');
ok(fs.readFileSync(serverCfg, 'utf8') === serverCfgBefore, 'server.cfg өөрчлөгдөөгүй');

/* ===================== 8. AIM → changemap: мөн сэргээнэ, 2 дахь удаа татахгүй ===================== */
console.log('\n== дахин AIM (татагдсан) → changemap nuke');
await cmd(A, 'aim_start', { map: 'aim_map', size: 1, weapon: 'ak47', rounds: 13 });
const t1 = Date.now(); const seen2 = new Set();
const fin2 = await until(async () => { const x = await get(A); if (x.arena && x.arena.workshop) seen2.add(x.arena.workshop.phase); return x.arena && x.arena.workshop && x.arena.workshop.phase === 'ready' && x.arena.aim && x.arena.aim.rounds === 13 ? x : null; }, 30000, 300);
ok(!!fin2 && !seen2.has('downloading'), `татагдсан map дахин татахгүй (${Math.round((Date.now() - t1) / 1000)}с, ${[...seen2].join(' → ')})`);
c = await cs2(); ok(c.cv.mp_maxrounds === '25' && c.cv.mp_ct_default_primary === 'weapon_ak47', 'first to 13 (25), AK-47');
await cmd(A, 'changemap', { map: 'nuke' }); done = await cmdDone(A, 'changemap');
c = await cs2();
ok(done && done.status === 'done' && /сэргээлээ/.test(done.output) && c.map === 'de_nuke' && c.autostart === 1 && c.cv.mp_maxrounds === '30' && c.cv.mp_freezetime === '7', 'AIM үед changemap → эхлээд тохиргоо сэргээж Competitive руу буцна');

/* ===================== 9. Workshop алдаа — success гэж хэзээ ч хэлэхгүй ===================== */
console.log('\n== Workshop алдаа');
await fetch(CTL + '/fail-next');
r = await cmd(A, 'aim_start', { map: 'aim_map', size: 1, weapon: 'ak47', rounds: 10 }); ok(r.s === 200, 'aim_start (алдаа гаргах) дараалалд ' + (r.j.error || ''));
done = await cmdDone(A, 'aim_start');
s = await get(A);
ok(done && done.status === 'failed' && /ачаалагдсангүй/.test(done.output), 'host_workshop_map алдаа → команд failed: ' + (done && done.output));
ok(s.arena.workshop && s.arena.workshop.phase === 'error' && s.server.map === 'de_nuke', 'сайт: Алдаа төлөв, map солигдоогүй (Бэлэн гэж хэлээгүй)');
await cmd(A, 'aim_stop', { map: 'mirage' }); done = await cmdDone(A, 'aim_stop');
c = await cs2(); ok(c.map === 'de_mirage' && c.autostart === 1 && c.cv.mp_freezetime === '7', 'алдааны дараа aim_stop → тохиргоо сэргээж mirage');

/* ===================== 10. RCON аюулгүй байдал ===================== */
const all = fs.readFileSync(rconLog, 'utf8').split('\n').filter(l => /^\d+ /.test(l) && !/ #/.test(l)).map(l => l.replace(/^\d+ /, ''));
const badCmd = all.filter(l => /;|\bquit\b|\bexec\b|rcon_password|sv_password|\bexit\b/.test(l) || !/^[\w .:"\-/]+$/.test(l));
ok(badCmd.length === 0, `agent-ийн илгээсэн ${all.length} RCON команд бүгд allowlist-ийн хэлбэртэй` + (badCmd.length ? ': ' + badCmd.join(' | ') : ''));
const hw = all.filter(l => l.startsWith('host_workshop_map')); ok(hw.length >= 2 && hw.every(l => l === 'host_workshop_map 3469339086'), 'host_workshop_map зөвхөн allowlist-ийн ID-аар');
const logs = fs.readFileSync(agentLog, 'utf8') + fs.readFileSync(agentLog + '.2', 'utf8');
ok(!logs.includes(RCON_PW) && !logs.includes(SECRET), 'agent log-д нууц үг/secret алга');

console.log(`\n${pass} passed, ${fail} failed`);
for (const p of procs) p.kill();
if (fail) { console.log('\n--- agent.log (сүүлийн 40) ---\n' + logs.split('\n').slice(-40).join('\n')); }
process.exit(fail ? 1 : 0);
