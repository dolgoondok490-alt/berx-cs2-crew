// Тохиргоо → Server: зөвхөн admin (backend 401/403 + frontend харагдах байдал)
//   node tests/server/admin-settings.mjs                       — API (сүлжээгүй, хуурамч Supabase)
//   PLAYWRIGHT=<module path> CHROME_PATH=<chrome> SHOTS=<dir>  — + browser (desktop/mobile screenshot)
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import net from 'net';
import { fileURLToPath, pathToFileURL } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const procs = []; const run = (args, env, logf) => { const p = spawn('node', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); const w = fs.createWriteStream(logf); p.stdout.pipe(w); p.stderr.pipe(w); procs.push(p); return p; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-admset-'));
const SECRETS = { SESSION_SECRET: 'admset_session_secret_admset_session_secret', SERVER_AGENT_SECRET: 'admset-agent-secret-' + 'z'.repeat(24), FACEIT_API_KEY: 'fake-faceit-admset-0000',
  LEETIFY_API_KEY: 'fake-leetify-admset-0000', STEAM_API_KEY: 'fake-steam-admset-0000', SUPABASE_SECRET_KEY: 'sb_secret_TESTKEY123', SERVER_PASSWORD: 'friendpw-admset' };
const [pgPort, sitePort] = [await freePort(), await freePort()];
run([path.join(ROOT, 'tests/skins/fake-supabase.js'), pgPort], {}, path.join(tmp, 'pg.log'));
run([path.join(ROOT, 'server/server.js')], { PORT: sitePort, SUPABASE_URL: `http://127.0.0.1:${pgPort}`, ADMIN_LOGINS: 'a@berx.mn', SKINS_ENABLED: '1', ...SECRETS }, path.join(tmp, 'site.log'));
const ORIGIN = `http://127.0.0.1:${sitePort}`, B = ORIGIN + '/api', PG = `http://127.0.0.1:${pgPort}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/health')).ok) break; } catch (e) { /* wait */ } await sleep(150); }
const reg = async (nick, login, sid) => {
  const r = await fetch(B + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, login, password: 'secret1' }) });
  const c = r.headers.get('set-cookie').split(';')[0]; const id = (await (await fetch(PG + '/__dump')).json()).users.find(x => x.login === login).id;
  await fetch(`${PG}/__patch?t=users&k=id&v=${id}`, { method: 'POST', body: JSON.stringify({ steam_id: sid }) }); return { c, id };
};
const A = await reg('DOK', 'a@berx.mn', '76561198000000001'), K = await reg('Kaze', 'k@berx.mn', '76561198000000002');
const get = (p, u, h = {}) => fetch(B + p, { headers: { ...(u ? { cookie: u.c } : {}), ...h } });
const act = (u, type, payload) => fetch(B + '/action', { method: 'POST', headers: { ...(u ? { cookie: u.c } : {}), 'content-type': 'application/json' }, body: JSON.stringify({ type, payload }) });
const noSecret = (txt) => Object.values(SECRETS).every(v => !txt.includes(v));

/* ---------- 1. Нийтийн health: серверийн тохиргооны мэдээлэлгүй ---------- */
console.log('\n== /api/health');
let r = await get('/health'), h = await r.json();
ok(r.status === 200 && h.ok === true && h.steam === true && h.features && h.features.skins === true, 'health: апп асахад хэрэгтэй (ok, steam, features) хэвээр');
for (const k of ['db', 'faceit', 'leetify', 'steamApi', 'adminConfigured', 'sessionSecret', 'serverBridge', 'warning']) ok(!(k in h), `health: "${k}" нийтэд ил гарахгүй`);

/* ---------- 2. /api/admin/system: 401 / 403 / 200 ---------- */
console.log('\n== /api/admin/system');
r = await get('/admin/system'); ok(r.status === 401, 'нэвтрээгүй → 401');
r = await get('/admin/system', null, { cookie: 'berx_sid=forged.value' }); ok(r.status === 401, 'хуурамч session cookie → 401');
r = await get('/admin/system', K); ok(r.status === 403 && /Admin/.test((await r.json()).error), 'энгийн хэрэглэгч → 403');
r = await fetch(B + '/admin/system', { method: 'POST', headers: { cookie: K.c, 'content-type': 'application/json', 'x-admin': '1' }, body: JSON.stringify({ admin: true, is_admin: true }) });
ok(r.status === 403, 'энгийн хэрэглэгч "admin: true" гэх мэт хуурамч хүсэлт → 403');
r = await get('/admin/system', A); const sys = await r.json(); const sysTxt = JSON.stringify(sys);
ok(r.status === 200 && sys.db === 'supabase' && sys.faceit === true && sys.leetify === true && sys.steamApi === true && sys.adminConfigured === true && sys.sessionSecret === true && sys.serverBridge === true, 'admin → 200: DB, API key, admin/secret тохиргоо (boolean)');
ok(noSecret(sysTxt) && !/a@berx\.mn/.test(sysTxt), 'admin хариунд ч нууцын утга, ADMIN_LOGINS-ийн утга алга');

/* ---------- 3. Серверийн удирдлагын үйлдэл: энгийн хэрэглэгч → 403 ---------- */
console.log('\n== admin actions');
for (const [t, p] of [['server.cmd', { type: 'changemap', args: { map: 'nuke' } }], ['server.cmd', { type: 'freezetime', args: { value: 5 } }], ['server.shuffle', {}], ['server.move', { userId: K.id, team: 'CT' }],
  ['admin.toggle', { userId: A.id }], ['admin.remove', { userId: A.id }]]) {
  r = await act(K, t, p); ok(r.status === 403, `энгийн хэрэглэгч ${t}${p.type ? ' ' + p.type : ''} → 403`);
}
r = await act(null, 'server.cmd', { type: 'changemap', args: { map: 'nuke' } }); ok(r.status === 401, 'нэвтрээгүй server.cmd → 401');
r = await get('/debug/sources?steamId=76561198000000001', K); ok(r.status === 403, 'энгийн хэрэглэгч /debug/sources → 403');
r = await act(A, 'server.cmd', { type: 'changemap', args: { map: 'nuke' } }); ok(r.status === 200, 'admin server.cmd changemap → 200 (admin эрх хэвээр)');
r = await act(A, 'server.cmd', { type: 'rcon', args: { cmd: 'quit' } }); ok(r.status === 400, 'admin ч дурын RCON → 400 (allowlist хэвээр)');

/* ---------- 4. Энгийн хэрэглэгчийн эрх хэвээр ---------- */
console.log('\n== regular user features');
r = await get('/state', K); const st = await r.json(); ok(r.status === 200 && st.me === K.id && st.members.find(m => m.id === K.id).admin === false, 'энгийн хэрэглэгч: /state (admin биш)');
r = await get('/server/state', K); const ss = await r.json(); ok(r.status === 200 && !('commands' in ss), 'BERX ARENA (server state) нээлттэй, admin командын түүх харагдахгүй');
r = await act(K, 'server.join', { team: 'CT' }); ok(r.status === 200, 'энгийн хэрэглэгч багт орох (Competitive/AIM тоглолт)');
r = await act(K, 'server.vote', { map: 'inferno' }); ok(r.status === 200, 'map санал өгөх (одоогийн эрхээр)');
r = await get('/skins/state', K); ok(r.status === 200, 'Skin Inventory');
r = await act(K, 'skins.save', { loadout: { 2: { weapons: {}, knife: null, gloves: null, agent: null }, 3: { weapons: {}, knife: null, gloves: null, agent: null } } }); ok(r.status === 200, 'Skin хадгалах');
r = await get('/matches/' + K.id, K); ok(r.status === 200, 'Statistics (тоглолтын түүх)');
r = await act(K, 'profile.update', { nick: 'Kaze2', bio: 'hi' }); ok(r.status === 200, 'хувийн тохиргоо (профайл засах)');

/* ---------- 5. Browser: Тохиргоо цэс ---------- */
if (process.env.PLAYWRIGHT) {
  console.log('\n== browser');
  const { chromium } = await import(pathToFileURL(path.join(process.env.PLAYWRIGHT, 'index.mjs')).href);
  const SHOTS = process.env.SHOTS || null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = [], reqs = [];
  async function page(u, vp, tag) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addCookies([{ name: u.c.split('=')[0], value: u.c.split('=').slice(1).join('='), url: ORIGIN }]);
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(`${tag} ${e.message}`));
    p.on('request', q => { if (q.url().includes('/api/admin/system')) reqs.push(tag); });
    await p.goto(ORIGIN + '/#admin'); await p.waitForSelector('.page[data-page="admin"] .tabs', { timeout: 15000 });
    return p;
  }
  const tabs = (p) => p.$$eval('.page[data-page="admin"] .tabs button', e => e.map(b => b.dataset.v));
  for (const [vp, tag] of [[{ width: 1440, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'mobile']]) {
    const AP = await page(A, vp, 'admin-' + tag);
    ok(JSON.stringify(await tabs(AP)) === '["profile","members","system"]', `${tag} admin: Профайл, Гишүүд, Систем (Server) табууд`);
    await AP.click('[data-action="admin-tab"][data-v="system"]');
    await AP.waitForFunction(() => /Server холболт/.test(document.querySelector('.page').innerText), null, { timeout: 8000 });
    const txt = await AP.$eval('.page', e => e.innerText);
    ok(/Supabase/.test(txt) && /Key ✓/.test(txt) && noSecret(txt), `${tag} admin: Server хэсэг /api/admin/system-ээс (Supabase, Key ✓), нууцын утгагүй`);
    if (vp.width === 390) ok(await AP.evaluate(() => document.documentElement.scrollWidth <= 390), 'mobile admin Server: хэвтээ scroll алга');
    if (SHOTS) await AP.screenshot({ path: `${SHOTS}/settings-admin-server-${tag}.png`, fullPage: tag === 'desktop' });
    const KP = await page(K, vp, 'user-' + tag);
    ok(JSON.stringify(await tabs(KP)) === '["profile"]', `${tag} энгийн хэрэглэгч: зөвхөн «Миний профайл» (Систем/Server таб алга)`);
    ok(!/Server холболт/.test(await KP.$eval('.page', e => e.innerText)), `${tag} энгийн хэрэглэгч: Server мэдээлэл харагдахгүй`);
    // Гараар өөрчлөх оролдлого: tab төлөвийг "system" болгоод render
    await KP.evaluate(() => { window.BerxApp.ui.admin.tab = 'system'; window.BerxApp.render(); }); await KP.waitForTimeout(300);
    ok(!/Server холболт/.test(await KP.$eval('.page', e => e.innerText)) && (await KP.$eval('.tabs button.on', e => e.dataset.v)) === 'profile', `${tag} энгийн хэрэглэгч: tab-ыг гараар "system" болгосон ч Профайл руу буцна`);
    if (SHOTS) await KP.screenshot({ path: `${SHOTS}/settings-user-${tag}.png`, fullPage: tag === 'desktop' });
    for (const route of ['server', 'skins', 'stats', 'dashboard']) {
      await KP.goto(ORIGIN + '/#' + route); await KP.waitForTimeout(700);
      ok((await KP.$eval('.page', e => e.dataset.page)) === route, `${tag} энгийн хэрэглэгч: #${route} нээгдэнэ`);
    }
    await AP.context().close(); await KP.context().close();
  }
  ok(reqs.every(t => t.startsWith('admin-')), 'энгийн хэрэглэгчийн browser /api/admin/system руу хүсэлт илгээгээгүй');
  ok(errors.length === 0, 'console/page алдаа алга' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
}
const logs = fs.readFileSync(path.join(tmp, 'site.log'), 'utf8');
ok(noSecret(logs), 'site log-д нууцын утга алга');

console.log(`\n${pass} passed, ${fail} failed`);
for (const p of procs) p.kill();
process.exit(fail ? 1 : 0);
