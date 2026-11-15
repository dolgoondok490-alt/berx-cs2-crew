// BERX Match History — UI (desktop/mobile). Өгөгдөл: agent-ийн ingest endpoint-оор (SIMULATED) оруулна.
//   PLAYWRIGHT=<module path> [CHROME_PATH=...] [SHOTS=<dir>] node tests/matches/ui.mjs
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import net from 'net';
import { fileURLToPath, pathToFileURL } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const procs = []; const run = (args, env, logf) => { const p = spawn('node', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); const w = fs.createWriteStream(logf); p.stdout.pipe(w); p.stderr.pipe(w); procs.push(p); return p; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-mhui-'));
const SECRET = 'mhui-agent-secret-' + 'w'.repeat(24);
const SHOTS = process.env.SHOTS || null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const [pgPort, sitePort] = [await freePort(), await freePort()];
run([path.join(ROOT, 'tests/skins/fake-supabase.js'), pgPort], {}, path.join(tmp, 'pg.log'));
run([path.join(ROOT, 'server/server.js')], { PORT: sitePort, SUPABASE_URL: `http://127.0.0.1:${pgPort}`, SUPABASE_SECRET_KEY: 'sb_secret_TESTKEY123', SESSION_SECRET: 'mhui_session_secret_mhui_session_secret',
  ADMIN_LOGINS: 'a@berx.mn', SERVER_AGENT_SECRET: SECRET }, path.join(tmp, 'site.log'));
const ORIGIN = `http://127.0.0.1:${sitePort}`, B = ORIGIN + '/api', PG = `http://127.0.0.1:${pgPort}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/health')).ok) break; } catch (e) { /* wait */ } await sleep(150); }
const reg = async (nick, login, sid) => {
  const r = await fetch(B + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, login, password: 'secret1' }) });
  const c = r.headers.get('set-cookie').split(';')[0]; const id = (await (await fetch(PG + '/__dump')).json()).users.find(x => x.login === login).id;
  if (sid) await fetch(`${PG}/__patch?t=users&k=id&v=${id}`, { method: 'POST', body: JSON.stringify({ steam_id: sid }) });
  return { c, id, sid };
};
const S = (n) => '7656119800000000' + n;
const A = await reg('DOK', 'a@berx.mn', S(1)), K = await reg('Kaze', 'k@berx.mn', S(2)), T = await reg('Tuya', 't@berx.mn', S(3)), N = await reg('Nomad', 'n@berx.mn', null);
await reg('Bat', 'b@berx.mn', S(4)); await reg('Saraa', 's@berx.mn', S(5)); await reg('Enkh', 'e@berx.mn', S(6));

/* ---------- өгөгдөл (simulated agent дүн) ---------- */
const base = Date.UTC(2026, 10, 14, 10, 0);
let seq = 0; const uuid = () => `${String(++seq).padStart(8, '0')}-0000-4000-8000-${String(seq).padStart(12, '0')}`;
const pl = (n, name, team, k, d, a, hs, dmg, mvp, rp, extra = {}) => ({ steam_id: S(n), name, team, kills: k, deaths: d, assists: a, headshot_kills: hs, damage: dmg, mvp, rounds_played: rp, ...extra });
const matches = [];
const comp = (i, map, ct, t, players, o = {}) => matches.push({ id: uuid(), server_id: 'main', source: 'matchzy', external_ref: `matchzy:${i}:0`, agent_version: '1.4.0', mode: 'competitive', map,
  status: 'completed', started_at: base - i * 3600e3, ended_at: base - i * 3600e3 + 38 * 60e3, rounds_played: ct + t, score_ct: ct, score_t: t, winner: ct > t ? 'CT' : t > ct ? 'T' : 'draw', has_damage: true, has_mvp: true, players, ...o });
comp(1, 'de_mirage', 13, 9, [pl(1, 'DOK', 'CT', 24, 14, 5, 12, 2310, 5, 22), pl(4, 'Bat', 'CT', 17, 15, 6, 7, 1820, 2, 22), pl(6, 'Enkh', 'CT', 12, 16, 4, 5, 1400, 1, 22),
  pl(2, 'Kaze', 'T', 19, 17, 3, 9, 1990, 3, 22), pl(5, 'Saraa', 'T', 15, 18, 7, 4, 1650, 1, 22), pl(3, 'Tuya', 'T', 10, 17, 2, 3, 1100, 0, 22)]);
comp(2, 'de_inferno', 11, 13, [pl(1, 'DOK', 'CT', 21, 19, 2, 10, 2050, 3, 24), pl(2, 'Kaze', 'T', 22, 16, 4, 11, 2300, 5, 24)]);
comp(3, 'de_nuke', 7, 13, [pl(1, 'DOK', 'T', 25, 9, 3, 13, 2400, 6, 20), pl(2, 'Kaze', 'CT', 9, 25, 1, 2, 1100, 1, 20)], { winner: 'T' });
comp(4, 'de_ancient', 4, 6, [pl(1, 'DOK', 'CT', 8, 7, 1, 4, 900, null, 10), pl(4, 'Bat', 'T', 7, 8, 2, 3, 800, null, 10)], { status: 'aborted', status_reason: 'restarted', winner: null, has_mvp: false });
const aim = (i, mode, weapon, target, ct, t, players, o = {}) => matches.push({ id: uuid(), server_id: 'main', source: 'cs2log', agent_version: '1.4.0', mode, map: 'aim_map1v1cfg', workshop_id: '3418431100',
  aim_weapon: weapon, target_rounds: target, status: 'completed', started_at: base - i * 3600e3 + 1800e3, ended_at: base - i * 3600e3 + 1800e3 + 9 * 60e3, rounds_played: ct + t, score_ct: ct, score_t: t,
  winner: ct > t ? 'CT' : 'T', has_damage: true, has_mvp: false, players, ...o });
aim(1, 'aim1v1', 'awp', 10, 10, 7, [pl(1, 'DOK', 'CT', 10, 7, 0, 6, 1700, null, 17), pl(2, 'Kaze', 'T', 7, 10, 0, 3, 1180, null, 17)]);
aim(2, 'aim2v2', 'ak47', 13, 9, 13, [pl(1, 'DOK', 'CT', 11, 13, 2, 7, 1650, null, 22), pl(4, 'Bat', 'CT', 8, 13, 3, 4, 1300, null, 22), pl(2, 'Kaze', 'T', 14, 9, 2, 9, 1800, null, 22), pl(5, 'Saraa', 'T', 12, 10, 4, 6, 1500, null, 22)]);
aim(3, 'aim1v1', 'ak47', 16, 5, 3, [pl(1, 'DOK', 'CT', 5, 3, 0, 2, 0, null, 8), pl(2, 'Kaze', 'T', 3, 5, 0, 1, 0, null, 8)], { status: 'interrupted', status_reason: 'agent_restart', winner: null, has_damage: false });
for (let i = 0; i < 12; i++) aim(10 + i, 'aim1v1', i % 2 ? 'm4a1s' : 'awp', 10, 10, i % 7, [pl(4, 'Bat', 'CT', 10, i % 7, 0, 4, 0, null, 10 + i % 7), pl(5, 'Saraa', 'T', i % 7, 10, 0, Math.min(1, i % 7), 0, null, 10 + i % 7)], { has_damage: false });
for (const m of matches) { const r = await fetch(B + '/server/agent/matches', { method: 'POST', headers: { authorization: 'Bearer ' + SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ match: m }) }); if (r.status !== 200) console.log('seed', r.status, await r.text()); }
ok(true, `seed: ${matches.length} тоглолт (agent ingest-ээр, simulated)`);

/* ---------- browser ---------- */
const { chromium } = await import(pathToFileURL(path.join(process.env.PLAYWRIGHT, 'index.mjs')).href);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errors = [];
async function page(u, vp, tag) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: u.c.split('=')[0], value: u.c.split('=').slice(1).join('='), url: ORIGIN }]);
  await ctx.route(/images\.steamusercontent\.com|steamcdn|avatars\.(steamstatic|akamai)/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="#2c3a2a"/></svg>' }));
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(`${tag} ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${tag} console ${m.text()}`); });
  return p;
}
const rows = (p) => p.$$eval('.mh-row', e => e.map(r => ({ id: r.dataset.id, txt: r.textContent.replace(/\s+/g, ' '), res: (r.querySelector('.mh-res') || {}).textContent })));
const D = await page(A, { width: 1440, height: 900 }, 'desktop');
await D.goto(ORIGIN + '/#matches'); await D.waitForSelector('.mh-row', { timeout: 15000 });
console.log('\n== Match History');
ok(await D.$eval('.sidebar a[href="#matches"]', a => a.textContent.includes('Тоглолтын түүх')), 'sidebar: "Тоглолтын түүх"');
let r = await rows(D);
ok(r.length === 15 && !!(await D.$('[data-action="mh-more"]')), 'эхний 15 тоглолт + "Цааш үзэх"');
const mir = r.find(x => /Mirage/.test(x.txt));
ok(r[0].txt.includes('Aim_map1v1cfg') && r[0].txt.includes('AIM 1v1') && /AWP · first to 10/.test(r[0].txt) && r[0].res === 'Хожсон', 'хамгийн сүүлийнх: AIM 1v1 Aim_map1v1cfg (catalog нэр), AWP first to 10, "Хожсон"');
ok(mir && !mir.txt.includes('de_mirage') && mir.txt.includes('Competitive 5v5') && mir.res === 'Хожсон' && /13\s*:\s*9/.test(mir.txt), 'Competitive: "Mirage" (нэр), 13:9, таны үр дүн');
ok(await D.$$eval('.mh-thumb', e => e.slice(0, 3).every(x => /url\(/.test(getComputedStyle(x).backgroundImage))), 'map зураг (Competitive: local, AIM: Workshop)');
await D.click('[data-action="mh-more"]'); await D.waitForFunction(() => document.querySelectorAll('.mh-row').length === 19, null, { timeout: 8000 });
ok(!(await D.$('[data-action="mh-more"]')), 'бүх 19 ачаалагдсаны дараа "Цааш үзэх" алга');
r = await rows(D);
ok(r.some(x => /Тасалдсан/.test(x.res)) && r.some(x => /Зогсоосон/.test(x.res)), 'дуусаагүй тоглолтод "Тасалдсан" / "Зогсоосон"');
ok(r.filter(x => /CT ялсан|T ялсан/.test(x.res)).length === 12, 'өөрөө тоглоогүй тоглолтод ялагч тал (CT/T ялсан)');
for (const [f, n, re] of [['competitive', 4, /Competitive 5v5/], ['aim1v1', 14, /AIM 1v1/], ['aim2v2', 1, /AIM 2v2/], ['mine', 7, /./]]) {
  await D.click(`[data-action="mh-filter"][data-v="${f}"]`); await D.waitForFunction((n) => document.querySelectorAll('.mh-row').length === Math.min(n, 15) && !document.querySelector('.mh-tabs ~ .card .e'), n, { timeout: 8000 }).catch(() => {});
  r = await rows(D); ok(r.length === Math.min(n, 15) && r.every(x => re.test(x.txt)), `шүүлтүүр ${f}: ${r.length}`);
}
ok(r.every(x => /Хожсон|Хожигдсон|Тэнцсэн|Тасалдсан|Зогсоосон/.test(x.res)), '"Миний тоглолтууд": бүгдэд таны үр дүн');
if (SHOTS) { await D.click('[data-action="mh-filter"][data-v="all"]'); await D.waitForSelector('.mh-row'); await D.screenshot({ path: SHOTS + '/1-desktop-match-history.png' }); }

/* ---------- дэлгэрэнгүй ---------- */
console.log('\n== Match details');
await D.click('[data-action="mh-filter"][data-v="all"]'); await D.waitForSelector('.mh-row');
await D.click('.mh-row:has-text("Mirage")'); await D.waitForSelector('.mh-table');
ok(await D.$eval('.modal', e => /Mirage/.test(e.textContent) && /13\s*:\s*9/.test(e.querySelector('.mh-final').textContent) && /Counter-Terrorists ялсан/.test(e.textContent) && /38 мин/.test(e.textContent)), 'дэлгэрэнгүй: map, оноо 13:9, ялагч, хугацаа');
const th = await D.$$eval('.mh-team.ct .mh-table th', e => e.map(x => x.textContent));
ok(JSON.stringify(th) === JSON.stringify(['Тоглогч', 'K', 'D', 'A', 'K/D', 'HS%', 'ADR', 'MVP']), 'scoreboard багана: K, D, A, K/D, HS%, ADR, MVP');
const me = await D.$eval('.mh-table tr.me', e => e.textContent);
ok(/DOK/.test(me) && /Та/.test(me) && /24/.test(me) && /1\.71/.test(me) && /50%/.test(me) && /105/.test(me), 'та (DOK) тодорсон: 24 kill, K/D 1.71, HS 50%, ADR 105');
ok((await D.$$('.mh-team.ct tbody tr')).length === 3 && (await D.$$('.mh-team.t tbody tr')).length === 3, 'хоёр багийн roster (3 + 3)');
if (SHOTS) await D.screenshot({ path: SHOTS + '/2-desktop-match-details.png' });
await D.click('.modal .x'); await D.waitForTimeout(150);
// AIM, damage/MVP-гүй, тасалдсан
const interrupted = matches.find(m => m.status === 'interrupted');
await D.evaluate(id => window.BerxPages.matches.openMatch(id), interrupted.id); await D.waitForSelector('.mh-table');
const ith = await D.$$eval('.mh-team.ct .mh-table th', e => e.map(x => x.textContent));
ok(!ith.includes('ADR') && !ith.includes('MVP') && await D.$eval('.modal', e => /ADR — энэ тоглолтод damage бүртгэгдээгүй/.test(e.innerText) && /MVP — энэ тоглолтод бүртгэгдээгүй/.test(e.innerText)), 'бүртгэгдээгүй ADR/MVP багана нуугдаж, тайлбартай (зохиосон утгагүй)');
ok(await D.$eval('.modal', e => /тасалдсан: BERX Agent дахин асаагдсан/.test(e.innerText) && /Хожил\/хожигдолд тооцогдохгүй/.test(e.innerText) && /Ялагч тодроогүй/.test(e.innerText)), 'тасалдсан тоглолтын тайлбар, ялагчгүй');
ok(await D.$eval('.modal', e => /AWP|AK-47/.test(e.innerText) && /first to 16/.test(e.innerText)), 'AIM: зэвсэг, first to N');
await D.keyboard.press('Escape'); await D.click('.modal .x').catch(() => {}); await D.waitForTimeout(150);

/* ---------- профайл (Статистик → BERX ARENA) ---------- */
console.log('\n== BERX profile');
const api = await (await fetch(B + `/berx/players/${S(1)}/stats`, { headers: { cookie: A.c } })).json();
await D.goto(ORIGIN + '/#stats'); await D.waitForSelector('[data-action="stats-tab"][data-v="berx"]', { timeout: 15000 });
const tabs = await D.$$eval('[data-action="stats-tab"]', e => e.map(x => x.dataset.v));
ok(['overview', 'faceit', 'premier', 'berx', 'maps', 'trend'].every(t => tabs.includes(t)), 'FACEIT/Premier табууд хэвээр + тусдаа "BERX ARENA" таб');
await D.click('[data-action="stats-tab"][data-v="berx"]'); await D.waitForSelector('.statrow .stat', { timeout: 8000 }); await D.waitForTimeout(400);
let txt = await D.$eval('.page', e => e.textContent.replace(/\s+/g, ' '));
// DOK: дууссан 5 (Mirage W, Inferno L, Nuke W, AIM1v1 W, AIM2v2 L); Ancient (aborted), AIM (interrupted) нийт дүнд орохгүй
ok(api.matches === 5 && api.wins === 3 && api.losses === 2 && api.unfinished === 2 && /Тоглолт\s*5\D/.test(txt) && /60%/.test(txt), 'профайл: 5 дууссан, 3W 2L, Win Rate 60% (зогсоосон/тасалдсан орохгүй)');
ok(api.kills === 91 && api.deaths === 62 && api.kd === 1.47 && /1\.47/.test(txt) && /Нийт kill: 91/.test(txt) && /Дуусаагүй: 2/.test(txt), 'K/D 91/62 = 1.47 (нийт дүнгээс), нийт kill 91, дуусаагүй 2');
ok(api.adr === Math.round((2310 + 2050 + 2400 + 1700 + 1650) / (22 + 24 + 20 + 17 + 22) * 10) / 10 && txt.includes(String(api.adr)), 'ADR = нийт damage / нийт round: ' + api.adr);
ok((await D.$$('.mh-list .mh-row')).length === 7, 'сүүлийн BERX тоглолтууд (7, бүх төлөвтэй)');
if (SHOTS) await D.screenshot({ path: SHOTS + '/3-desktop-berx-profile.png', fullPage: true });
await D.click('[data-action="stats-berx-mode"][data-v="aim1v1"]'); await D.waitForFunction(() => /Тоглолт\s*1\D/.test((document.querySelector('.statrow') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
txt = await D.$eval('.statrow', e => e.textContent.replace(/\s+/g, ' '));
ok(/Тоглолт\s*1\D/.test(txt) && /1\.43/.test(txt), 'горим AIM 1v1: 1 тоглолт, K/D 10/7 = 1.43');
await D.click('[data-action="stats-berx-mode"][data-v="all"]');
// тоглолтгүй гишүүн / Steam-гүй гишүүн
await D.selectOption('[data-stats-member]', N.id); await D.waitForTimeout(400);
ok(/Steam ID холбоогүй тул BERX ARENA-ийн тоглолтыг тодорхойлох боломжгүй/.test(await D.$eval('.page', e => e.textContent)), 'Steam-гүй гишүүн: тодорхой Монгол мессеж');
const ctx2 = await page(T, { width: 1440, height: 900 }, 'tuya');
await ctx2.goto(ORIGIN + '/#stats'); await ctx2.waitForSelector('[data-action="stats-tab"][data-v="berx"]'); await ctx2.click('[data-action="stats-tab"][data-v="berx"]');
await ctx2.waitForFunction(() => /тоглолт хараахан тоглоогүй|Тоглолт/.test((document.querySelector('.page') || {}).textContent || ''), null, { timeout: 8000 });
await fetch(PG + '/__patch?t=users&k=id&v=' + T.id, { method: 'POST', body: JSON.stringify({ steam_id: S(9) }) });   // тоглолтгүй SteamID
await ctx2.reload(); await ctx2.waitForSelector('[data-action="stats-tab"][data-v="berx"]'); await ctx2.click('[data-action="stats-tab"][data-v="berx"]');
await ctx2.waitForFunction(() => /хараахан тоглоогүй/.test((document.querySelector('.page') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
ok(/Tuya BERX ARENA серверт бүртгэгдсэн тоглолт хараахан тоглоогүй байна/.test(await ctx2.$eval('.page', e => e.textContent)), 'тоглолтгүй гишүүн: Монгол хоосон төлөв (0 зохиохгүй)');
if (SHOTS) await ctx2.screenshot({ path: SHOTS + '/4-desktop-berx-empty.png' });

/* ---------- алдааны төлөв ---------- */
await D.route('**/api/berx/matches?*', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }), { times: 1 });
await D.goto(ORIGIN + '/#dashboard'); await D.waitForTimeout(300);
await D.evaluate(() => { window.BerxApp.ui.matches = null; }); await D.goto(ORIGIN + '/#matches');
await D.waitForFunction(() => /ачаалагдсангүй/.test((document.querySelector('.page') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
ok(/Тоглолтын түүх ачаалагдсангүй/.test(await D.$eval('.page', e => e.textContent)) && !!(await D.$('[data-action="mh-retry"]')), 'API алдаа → ойлгомжтой мессеж + "Дахин ачаалах"');
await D.click('[data-action="mh-retry"]'); await D.waitForSelector('.mh-row');
ok((await D.$$('.mh-row')).length === 15, 'Дахин ачаалах → жагсаалт');

/* ---------- mobile ---------- */
console.log('\n== mobile');
const M = await page(A, { width: 390, height: 844 }, 'mobile');
await M.goto(ORIGIN + '/#matches'); await M.waitForSelector('.mh-row');
ok(await M.evaluate(() => document.documentElement.scrollWidth <= 390), 'mobile 390: хэвтээ scroll алга');
ok(await M.$$eval('.mh-row', e => e.slice(0, 5).every(r => r.getBoundingClientRect().right <= 390 && r.querySelector('.mh-res').getBoundingClientRect().right <= 390)), 'mobile: мөр бүр дэлгэц дотор (үр дүнгийн шошго харагдана)');
if (SHOTS) await M.screenshot({ path: SHOTS + '/5-mobile-match-history.png' });
await M.click('.mh-row >> nth=0'); await M.waitForSelector('.mh-table');
ok(await M.evaluate(() => { const m = document.querySelector('.modal'); return m.getBoundingClientRect().width <= 390 && m.scrollWidth <= m.clientWidth + 1; }), 'mobile дэлгэрэнгүй: modal дэлгэцэнд багтана');
if (SHOTS) await M.screenshot({ path: SHOTS + '/6-mobile-match-details.png' });
await M.click('.modal .x');
await M.goto(ORIGIN + '/#stats'); await M.waitForSelector('[data-action="stats-tab"][data-v="berx"]'); await M.click('[data-action="stats-tab"][data-v="berx"]'); await M.waitForSelector('.statrow .stat'); await M.waitForTimeout(300);
ok(await M.evaluate(() => document.documentElement.scrollWidth <= 390), 'mobile BERX профайл: хэвтээ scroll алга');
if (SHOTS) { await M.evaluate(() => document.querySelector('[data-action="stats-tab"][data-v="berx"]').scrollIntoView()); await M.screenshot({ path: SHOTS + '/7-mobile-berx-profile.png' }); }

/* ---------- бусад хуудас ---------- */
for (const route of ['dashboard', 'stats', 'server', 'admin']) { await D.goto(ORIGIN + '/#' + route); await D.waitForTimeout(700); ok((await D.$eval('.page', e => e.dataset.page)) === route, 'хуудас render: ' + route); }
ok(errors.length === 0, 'console/page алдаа алга' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close(); for (const p of procs) p.kill();
process.exit(fail ? 1 : 0);
