// BERX SKIN INVENTORY — бүрэн end-to-end тест (CI: MariaDB 11.4 + MySQL 8.4)
//   жинхэнэ сайт (server/server.js) + жинхэнэ BERX Agent + жинхэнэ MySQL/MariaDB
//   + хуурамч Supabase + хуурамч CS2 RCON + унтрааж/асааж болох TCP proxy (DB outage)
// Шаардлага: MYSQL_HOST, MYSQL_PORT, MYSQL_ROOT_PASSWORD; agent/node_modules/mysql2
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import net from 'net';
import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mysql = require(path.join(ROOT, 'agent/node_modules/mysql2/promise'));
const CAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/skins-catalog.json')));
const H = process.env.MYSQL_HOST || '127.0.0.1', P = +process.env.MYSQL_PORT || 3306, ROOTPW = process.env.MYSQL_ROOT_PASSWORD || 'root';
const out = []; const ok = (c, m) => { out.push((c ? 'PASS ' : 'FAIL ') + m); console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const until = async (f, ms, step = 500) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await f(); if (v) return v; } catch (e) { /* retry */ } await sleep(step); } return null; };
const procs = []; const run = (cmd, args, env, logf) => { const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); const w = fs.createWriteStream(logf); p.stdout.pipe(w); p.stderr.pipe(w); procs.push(p); return p; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-skins-'));
const DB = 'berx_wp_e2e', AGENT_PW = 'agent_' + Math.random().toString(36).slice(2), SECRET = 'e2e-agent-secret-' + 'x'.repeat(24), RCON_PW = 'rconE2E';
const A_SID = '76561198000000001', B_SID = '76561198000000002';

// ---------- MySQL: DB + хязгаарлагдмал хэрэглэгч + WeaponPaints build-472 schema ----------
const admin = await mysql.createConnection({ host: H, port: P, user: 'root', password: ROOTPW, multipleStatements: true });
await admin.query(`DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB} CHARACTER SET utf8mb4;`);
await admin.query(`USE ${DB}; ` + fs.readFileSync(path.join(ROOT, 'skins/sql/weaponpaints-build-472-schema.sql'), 'utf8'));
await admin.query(`DROP USER IF EXISTS 'berx_agent'@'%'; CREATE USER 'berx_agent'@'%' IDENTIFIED BY '${AGENT_PW}'; GRANT SELECT, INSERT, UPDATE, DELETE ON ${DB}.* TO 'berx_agent'@'%'; FLUSH PRIVILEGES;`);
const [ver] = await admin.query('SELECT VERSION() AS v'); console.log('DB server:', ver[0].v);

// ---------- TCP proxy (DB outage симуляц) ----------
let proxyUp = true; const sockets = new Set();
const proxyPort = await freePort();
net.createServer(c => { if (!proxyUp) return c.destroy(); const u = net.connect(P, H); sockets.add(c); sockets.add(u); c.pipe(u); u.pipe(c); const end = () => { c.destroy(); u.destroy(); }; c.on('error', end); u.on('error', end); c.on('close', end); u.on('close', end); }).listen(proxyPort, '127.0.0.1');
const dbDown = () => { proxyUp = false; for (const s of sockets) s.destroy(); sockets.clear(); }, dbUp = () => { proxyUp = true; };

// ---------- сайт + хуурамч Supabase + хуурамч RCON ----------
const [pgPort, sitePort, rconPort, evPort] = [await freePort(), await freePort(), await freePort(), await freePort()];
run('node', [path.join(ROOT, 'tests/skins/fake-supabase.js'), pgPort], {}, path.join(tmp, 'pg.log'));
const rconLog = path.join(tmp, 'rcon.log'); fs.writeFileSync(rconLog, '');
run('node', [path.join(ROOT, 'tests/skins/fake-rcon.js'), rconPort, RCON_PW, rconLog, A_SID], {}, path.join(tmp, 'rcon.out'));
await sleep(400);
run('node', [path.join(ROOT, 'server/server.js')], { PORT: sitePort, SUPABASE_URL: `http://127.0.0.1:${pgPort}`, SUPABASE_SECRET_KEY: 'sb_secret_TESTKEY123', SESSION_SECRET: 'e2e_session_secret_e2e_session_secret',
  ADMIN_LOGINS: 'a@berx.mn', SERVER_AGENT_SECRET: SECRET, SKINS_ENABLED: '1', SKINS_SYNC_ENABLED: '1' }, path.join(tmp, 'site.log'));
const B = `http://127.0.0.1:${sitePort}/api`, PG = `http://127.0.0.1:${pgPort}`;
await until(() => fetch(B + '/health').then(r => r.ok), 10000);
const reg = async (nick, login, sid) => { const r = await fetch(B + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, login, password: 'secret1' }) }); const c = r.headers.get('set-cookie').split(';')[0]; const all = await (await fetch(PG + '/__dump')).json(); const id = all.users.find(x => x.login === login).id; await fetch(`${PG}/__patch?t=users&k=id&v=${id}`, { method: 'POST', body: JSON.stringify({ steam_id: sid }) }); return { c, id }; };
const act = (u, type, payload) => fetch(B + '/action', { method: 'POST', headers: { cookie: u.c, 'content-type': 'application/json' }, body: JSON.stringify({ type, payload }) }).then(async r => ({ s: r.status, j: await r.json() }));
const state = (u) => fetch(B + '/skins/state', { headers: { cookie: u.c } }).then(r => r.json());
const A = await reg('DOK', 'a@berx.mn', A_SID), Bu = await reg('Kaze', 'b@berx.mn', B_SID);

const pick = (c, f) => CAT.items.find(i => i.c === c && f(i));
const ak = pick('rifles', i => i.w === 'weapon_ak47' && i.st), usp = pick('pistols', i => i.w === 'weapon_usp_silencer'), kn = pick('knives', i => i.w === 'weapon_knife_karambit' && i.p > 0),
  gl = pick('gloves', () => true), agCT = pick('agents', i => i.t === 3), agT = pick('agents', i => i.t === 2);
const mid = (i, k = 0.5) => Math.round((i.f[0] + (i.f[1] - i.f[0]) * k) * 1e4) / 1e4;
const LO = (akWear) => ({ '3': { weapons: { [ak.d]: { p: ak.p, wear: akWear, seed: 661, st: 1, tag: 'BERX' }, [usp.d]: { p: usp.p, wear: mid(usp), seed: 12 } }, knife: { d: kn.d, p: kn.p, wear: mid(kn), seed: 412 }, gloves: { d: gl.d, p: gl.p, wear: mid(gl), seed: 7 }, agent: agCT.m },
  '2': { weapons: { [ak.d]: { p: ak.p, wear: akWear, seed: 1 } }, knife: { d: kn.d, p: 0 }, agent: agT.m } });

let r = await act(A, 'skins.save', { loadout: LO(mid(ak, .3)) }); ok(r.s === 200, 'A saves loadout via website API');
r = await act(Bu, 'skins.save', { loadout: { '3': { weapons: { [usp.d]: { p: usp.p, wear: mid(usp), seed: 3 } } } } }); ok(r.s === 200, 'B saves loadout');

// ---------- BERX Agent (жинхэнэ) ----------
fs.writeFileSync(path.join(tmp, 'agent.env'), `BERX_URL=http://127.0.0.1:${sitePort}\nSERVER_AGENT_SECRET=${SECRET}\nRCON_HOST=127.0.0.1\nRCON_PORT=${rconPort}\nRCON_PASSWORD=${RCON_PW}\nEVENTS_PORT=${evPort}\nPOLL_MS=2000\nPUBLIC_ADDRESS=203.0.113.9:27015\n`);
fs.writeFileSync(path.join(tmp, '.env.skins'), `SKINS_SYNC_ENABLED=1\nWP_DB_HOST=127.0.0.1\nWP_DB_PORT=${proxyPort}\nWP_DB_NAME=${DB}\nWP_DB_USER=berx_agent\nWP_DB_PASSWORD=${AGENT_PW}\nSKINS_POLL_MS=5000\nSKINS_REFRESH=1\n`);
const agentLog = path.join(tmp, 'agent.log');
run('node', [path.join(ROOT, 'agent/berx-agent.js')], { BERX_AGENT_ENV: path.join(tmp, 'agent.env') }, agentLog);

const synced = (u, v) => until(async () => { const s = await state(u); return s.sync && s.sync.status === 'ok' && s.sync.version >= v ? s : null; }, 40000);
let sA = await synced(A, 1); ok(!!sA, 'A loadout synced by agent (site shows ok)');
ok(sA && sA.sync.appliedAt > 0, 'A online → applied in game (wp_refresh) status');
let sB = await synced(Bu, 1); ok(sB && !sB.sync.appliedAt, 'B offline → synced to DB but not marked applied');

const q = async (sql, args = []) => (await admin.query(sql, args))[0];
let skins = await q(`SELECT * FROM ${DB}.wp_player_skins WHERE steamid = ? ORDER BY weapon_team, weapon_defindex`, [A_SID]);
const row = (team, d) => skins.find(x => x.weapon_team === team && x.weapon_defindex === d);
ok(skins.length === 5, `A wp_player_skins rows = 5 (CT ak, usp, knife finish, glove finish + T ak): ${skins.length}`);
ok(row(3, ak.d) && row(3, ak.d).weapon_paint_id === ak.p && Math.abs(row(3, ak.d).weapon_wear - mid(ak, .3)) < 1e-4 && row(3, ak.d).weapon_seed === 661 && row(3, ak.d).weapon_stattrak === 1 && row(3, ak.d).weapon_nametag === 'BERX', 'CT AK row: paint/wear/seed/StatTrak/nametag exact');
ok(row(3, kn.d) && row(3, kn.d).weapon_paint_id === kn.p && !row(2, kn.d), 'knife finish row only on CT (T has vanilla)');
ok(row(3, gl.d) && row(3, gl.d).weapon_paint_id === gl.p, 'glove finish stored under glove defindex');
const knives = await q(`SELECT * FROM ${DB}.wp_player_knife WHERE steamid = ? ORDER BY weapon_team`, [A_SID]);
ok(knives.length === 2 && knives.every(k => k.knife === 'weapon_knife_karambit'), 'wp_player_knife T+CT = weapon_knife_karambit');
const gloves = await q(`SELECT * FROM ${DB}.wp_player_gloves WHERE steamid = ?`, [A_SID]);
ok(gloves.length === 1 && gloves[0].weapon_team === 3 && gloves[0].weapon_defindex === gl.d, 'wp_player_gloves CT only');
const agents = await q(`SELECT * FROM ${DB}.wp_player_agents WHERE steamid = ?`, [A_SID]);
ok(agents.length === 1 && agents[0].agent_ct === agCT.m && agents[0].agent_t === agT.m, 'wp_player_agents CT/T models');
const bRows = await q(`SELECT * FROM ${DB}.wp_player_skins WHERE steamid = ?`, [B_SID]);
ok(bRows.length === 1 && bRows[0].weapon_defindex === usp.d, 'B isolated: only own row');
const rc = fs.readFileSync(rconLog, 'utf8');
ok(rc.split('\n').filter(l => l === 'wp_refresh ' + A_SID).length >= 2, 'wp_refresh <A> sent (twice, async reload)');
ok(!rc.includes('wp_refresh ' + B_SID), 'no wp_refresh for offline B');
ok(rc.split('\n').filter(Boolean).every(l => /^(status_json|status|css_plugins list|wp_refresh 7656119\d{10}|mp_\w+|sv_\w+|game_\w+|matchzy_[\w ".:\/-]+|maps \*|changelevel de_\w+)$/.test(l)), 'RCON received only allowlisted commands');

// StatTrak тоолуур хадгалагдана, wear шинэчлэгдэнэ
await q(`UPDATE ${DB}.wp_player_skins SET weapon_stattrak_count = 42 WHERE steamid = ? AND weapon_team = 3 AND weapon_defindex = ?`, [A_SID, ak.d]);
await q(`INSERT INTO ${DB}.wp_player_skins (steamid, weapon_team, weapon_defindex, weapon_paint_id) VALUES (?, 0, 1, 37)`, [A_SID]); // хуучин "хоёр баг" мөр
const before = (await state(A)).version;
await act(A, 'skins.save', { loadout: LO(mid(ak, .7)) });
await synced(A, before + 1);
skins = await q(`SELECT * FROM ${DB}.wp_player_skins WHERE steamid = ?`, [A_SID]);
ok(row(3, ak.d) && row(3, ak.d).weapon_stattrak_count === 42 && Math.abs(row(3, ak.d).weapon_wear - mid(ak, .7)) < 1e-4, 'resync: wear updated, StatTrak counter (42) preserved');
ok(!skins.some(x => x.weapon_team === 0), 'legacy team-0 row cleaned (website loadout authoritative)');
const cnt1 = skins.length;

// Item хасах → мөр устна; idempotent
const lo2 = LO(mid(ak, .7)); delete lo2['3'].weapons[usp.d]; lo2['3'].gloves = null;
let v = (await state(A)).version; await act(A, 'skins.save', { loadout: lo2 }); await synced(A, v + 1);
skins = await q(`SELECT * FROM ${DB}.wp_player_skins WHERE steamid = ?`, [A_SID]);
ok(skins.length === cnt1 - 2 && !(await q(`SELECT 1 FROM ${DB}.wp_player_gloves WHERE steamid = ?`, [A_SID])).length, 'removed USP + gloves → rows deleted');
await fetch(`${PG}/__patch?t=skin_sync&k=steam_id&v=${A_SID}`, { method: 'POST', body: JSON.stringify({ status: 'pending' }) }); // дахин синк хүчээр
await until(async () => (await state(A)).sync.status === 'ok', 20000);
ok((await q(`SELECT COUNT(*) n FROM ${DB}.wp_player_skins WHERE steamid = ?`, [A_SID]))[0].n === cnt1 - 2, 'idempotent: re-sync of same version changes nothing');

// DB outage → pending хэвээр, сэргэсний дараа синк
dbDown();
v = (await state(A)).version; await act(A, 'skins.save', { loadout: LO(mid(ak, .5)) });
await sleep(9000);
let s = await state(A); ok(s.sync.version < v + 1, 'DB down: new version stays pending (not acked)');
ok(s.server && s.server.agentSkins && s.server.agentSkins.db === 'error', 'agent reports db=error to site');
dbUp();
s = await synced(A, v + 1); ok(!!s, 'DB back: agent retries and syncs');

// Эвдэрсэн мөр (API-г тойрч) бусдыг хаахгүй
await fetch(`${PG}/__patch?t=skin_loadouts&k=steam_id&v=${B_SID}`, { method: 'POST', body: JSON.stringify({ loadout: { '3': { weapons: { 99999: { p: 1, wear: .1, seed: 1 } } } }, version: 99 }) });
v = (await state(A)).version; await act(A, 'skins.save', { loadout: LO(mid(ak, .4)) });
ok(!!(await synced(A, v + 1)), 'corrupt row of B does not block A');
s = await state(Bu); ok(s.sync.status === 'error' && /буруу/.test(s.sync.error), 'B corrupt row marked error: ' + s.sync.error);
ok(!(await q(`SELECT 1 FROM ${DB}.wp_player_skins WHERE steamid = ? AND weapon_defindex = 99999`, [B_SID])).length, 'invalid item never reached MySQL');

// Хамгийн бага эрх
const ag = await mysql.createConnection({ host: H, port: P, user: 'berx_agent', password: AGENT_PW, database: DB });
let denied = false; try { await ag.query('DROP TABLE wp_player_pins'); } catch (e) { denied = /denied/i.test(e.message); } ok(denied, 'berx_agent cannot DROP tables (least privilege)');
await ag.end();

// Одоо байгаа серверийн удирдлага хэвийн (map солих)
r = await act(A, 'server.cmd', { type: 'changemap', args: { map: 'anubis' } }); ok(r.s === 200, 'admin map change queued');
ok(!!(await until(() => fs.readFileSync(rconLog, 'utf8').includes('changelevel de_anubis'), 15000)), 'existing server control still works (changelevel de_anubis)');
const hb = await until(async () => { const j = await fetch(B + '/server/state', { headers: { cookie: A.c } }).then(r => r.json()); return j.online ? j : null; }, 10000);
ok(hb && hb.online, 'server online status unaffected');

// Нууц мэдээлэл log-д алга
const logs = fs.readFileSync(agentLog, 'utf8') + fs.readFileSync(path.join(tmp, 'site.log'), 'utf8');
ok(!logs.includes(AGENT_PW) && !logs.includes(RCON_PW) && !logs.includes(SECRET), 'no DB/RCON/agent secrets in logs');

console.log('\n---- agent.log (tail)\n' + fs.readFileSync(agentLog, 'utf8').split('\n').filter(l => /Skins|✖|⚠/.test(l)).slice(-15).join('\n'));
for (const p of procs) p.kill(); await admin.end();
const fails = out.filter(x => x.startsWith('FAIL')).length; console.log(`\n${out.length - fails}/${out.length} passed`); process.exit(fails ? 1 : 0);
