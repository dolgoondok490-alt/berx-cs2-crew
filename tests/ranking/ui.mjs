// BERX RANKING — UI (desktop/mobile). Өгөгдөл: agent-ийн ingest endpoint-оор (SIMULATED) оруулж, сервер өөрөө BRP тооцоолно.
//   PLAYWRIGHT=<module path> [CHROME_PATH=...] [SHOTS=<dir>] node tests/ranking/ui.mjs
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import net from 'net';
import { fileURLToPath, pathToFileURL } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const procs = []; const run = (args, env, logf) => { const p = spawn('node', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); const w = fs.createWriteStream(logf); p.stdout.pipe(w); p.stderr.pipe(w); procs.push(p); return p; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-rkui-'));
const SECRET = 'rkui-agent-secret-' + 'v'.repeat(24);
const SHOTS = process.env.SHOTS || null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const [pgPort, sitePort] = [await freePort(), await freePort()];
run([path.join(ROOT, 'tests/skins/fake-supabase.js'), pgPort], {}, path.join(tmp, 'pg.log'));
run([path.join(ROOT, 'server/server.js')], { PORT: sitePort, SUPABASE_URL: `http://127.0.0.1:${pgPort}`, SUPABASE_SECRET_KEY: 'sb_secret_TESTKEY123', SESSION_SECRET: 'rkui_session_secret_rkui_session_secret',
  ADMIN_LOGINS: 'a@berx.mn', SERVER_AGENT_SECRET: SECRET }, path.join(tmp, 'site.log'));
const ORIGIN = `http://127.0.0.1:${sitePort}`, B = ORIGIN + '/api', PG = `http://127.0.0.1:${pgPort}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/health')).ok) break; } catch (e) { /* wait */ } await sleep(150); }
const reg = async (nick, login, sid) => {
  const r = await fetch(B + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, login, password: 'secret1' }) });
  const c = r.headers.get('set-cookie').split(';')[0]; const id = (await (await fetch(PG + '/__dump')).json()).users.find(x => x.login === login).id;
  if (sid) await fetch(`${PG}/__patch?t=users&k=id&v=${id}`, { method: 'POST', body: JSON.stringify({ steam_id: sid }) });
  return { c, id, sid, nick };
};
const S = (n) => (76561198000000000n + BigInt(n)).toString();
const NICKS = ['DOK', 'Kaze', 'Tuya', 'Bat', 'Temka', 'Zolboo', 'Munkh', 'Senzu', 'Nmgd', 'L1m0n', 'Saraa', 'Enkh'];
const U = []; for (let i = 0; i < 12; i++) U.push(await reg(NICKS[i], i === 0 ? 'a@berx.mn' : `p${i}@berx.mn`, S(i + 1)));
await reg('Guest', 'g@berx.mn', null); await reg('Nomad', 'n@berx.mn', S(40));
const [A, K] = U;
const act = (u, type, payload) => fetch(B + '/action', { method: 'POST', headers: { cookie: u.c, 'content-type': 'application/json' }, body: JSON.stringify({ type, payload }) }).then(async r => ({ s: r.status, j: await r.json() }));

/* ---------- өгөгдөл (SIMULATED: agent ingest → сервер BRP тооцоолно) ---------- */
const base = Date.UTC(2026, 10, 10, 10, 0);
// Тестийн хуурамч DB-д: чансаа тоглолтуудаас өмнө асаалттай байсан (retroactive биш)
await fetch(PG + '/__insert?t=berx_ranking_settings', { method: 'POST', body: JSON.stringify({ id: 1, enabled: true, competitive: true, aim: true, formula: 'competitive-v1', enabled_at: base - 86400e3,
  rules: { min_duration_competitive_s: 900, min_duration_aim_s: 60, max_same_lineup_24h_competitive: 100, max_same_lineup_24h_aim: 100 }, updated_by: A.id, updated_at: base - 86400e3 }) });
let seq = 0; const uuid = () => `${String(++seq).padStart(8, '0')}-0000-4000-8000-${String(seq).padStart(12, '0')}`;
const post = async (m) => { const r = await fetch(B + '/server/agent/matches', { method: 'POST', headers: { authorization: 'Bearer ' + SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ match: m }) }); if (r.status !== 200) console.log('seed', r.status, await r.text()); return m; };
const MAPS = ['de_mirage', 'de_inferno', 'de_nuke', 'de_ancient', 'de_dust2', 'de_anubis'];
const pst = (i, team, k, d, a, hs, dmg, rp) => ({ steam_id: S(i + 1), name: NICKS[i] || 'Ghost', team, kills: k, deaths: d, assists: a, headshot_kills: hs, damage: dmg, mvp: Math.floor(k / 6), rounds_played: rp });
async function comp(n, ct, t, ctWins, o = {}) {
  const at = base + n * 3 * 3600e3, rp = ctWins ? 13 + 10 : 13 + 9, sc = ctWins ? [13, 10] : [9, 13];
  const lock = { v: 1, type: 'ranked', locked_at: at, agent: '1.5.0', roster: { CT: ct.map(i => S(i + 1)), T: t.map(i => S(i + 1)) }, bots: 0, rules: { mode: 'competitive', map: MAPS[n % MAPS.length], server_mode: 'competitive', cheats: false } };
  const k = (i, j, team) => { const s = (i * 7 + n * 3 + j * 5) % 11; return pst(i, team, 9 + s + (j === 0 ? 8 : 0), 13 + (s % 6), 2 + (s % 5), 3 + (s % 7), 1100 + s * 140 + (j === 0 ? 700 : 0), rp); };
  return post({ id: uuid(), server_id: 'main', source: 'matchzy', external_ref: `matchzy:berx-${n}:0`, agent_version: '1.5.0', mode: 'competitive', map: MAPS[n % MAPS.length], status: 'completed',
    started_at: at, ended_at: at + 2400e3, rounds_played: rp, score_ct: sc[0], score_t: sc[1], winner: ctWins ? 'CT' : 'T', has_damage: true, has_mvp: true, match_type: 'ranked', lock,
    players: [...ct.map((i, j) => k(i, j, 'CT')), ...t.map((i, j) => k(i, j, 'T'))], ...o });
}
async function aim(n, a, b, aWins, o = {}) {
  const at = base + n * 3 * 3600e3 + 1800e3, lock = { v: 1, type: 'ranked', locked_at: at, agent: '1.5.0', roster: { CT: [S(a + 1)], T: [S(b + 1)] }, bots: 0, rules: { mode: 'aim1v1', map: 'aim_map1v1cfg', weapon: 'awp', target_rounds: 13 }, guard: { ok: true, version: '1.0.0' } };
  return post({ id: uuid(), server_id: 'main', source: 'cs2log', agent_version: '1.5.0', mode: 'aim1v1', map: 'aim_map1v1cfg', workshop_id: '3418431100', aim_weapon: 'awp', target_rounds: 13, status: 'completed',
    started_at: at, ended_at: at + 420e3, rounds_played: aWins ? 20 : 21, score_ct: aWins ? 13 : 8, score_t: aWins ? 7 : 13, winner: aWins ? 'CT' : 'T', has_damage: true, has_mvp: false, match_type: 'ranked', lock,
    players: [pst(a, 'CT', aWins ? 13 : 8, aWins ? 7 : 13, 0, 6, 1600, 20), pst(b, 'T', aWins ? 7 : 13, aWins ? 13 : 8, 0, 3, 1000, 20)], ...o });
}
const T1 = [0, 1, 2, 3, 4], T2 = [5, 6, 7, 8, 9];
for (let n = 0; n < 7; n++) { await comp(n, n % 2 ? T2 : T1, n % 2 ? T1 : T2, n % 2 === 0 || n === 3 ? true : n === 5); if (n % 2) await aim(n, 0, 1, n !== 5); }
await comp(7, T1, [5, 6, 7, 8, 9], false);
await post({ id: uuid(), server_id: 'main', source: 'cs2log', agent_version: '1.5.0', mode: 'aim1v1', map: 'aim_map1v1cfg', workshop_id: '3418431100', aim_weapon: 'ak47', target_rounds: 10, status: 'completed',
  started_at: base + 25 * 3600e3, ended_at: base + 25 * 3600e3 + 300e3, rounds_played: 14, score_ct: 10, score_t: 4, winner: 'CT', has_damage: true, has_mvp: false, players: [pst(0, 'CT', 10, 4, 0, 5, 1100, 14), pst(1, 'T', 4, 10, 0, 1, 500, 14)] }); // casual
await comp(9, [0, 1, 2, 3, 4], [5, 6, 7, 8, 30]);   // S(31) бүртгэлгүй → not_eligible
await comp(10, T1, T2, true, { ended_at: base + 30 * 3600e3 + 400e3 }); // хэт богино → review
// Admin засвараар бусад зэрэглэлийг харуулах (бүгд audit-тай)
for (const [i, d] of [[10, 1000], [10, 1000], [10, 1000], [10, 1000], [10, 600], [11, 1000], [11, 1000], [11, 1000], [11, 1000], [11, 400], [2, 1000], [2, 1000], [0, 500]]) await act(A, 'ranking.adjust', { userId: U[i].id, delta: d, reason: 'UI test seed (simulated)' });
const dump = await (await fetch(PG + '/__dump')).json();
const dec = Object.fromEntries((dump.berx_ranked_matches || []).map(x => [x.match_id, x.status]));
ok(Object.values(dec).filter(s => s === 'rated').length === 11 && Object.values(dec).includes('review') && Object.values(dec).includes('not_eligible'), `seed: ${dump.berx_matches.length} тоглолт (simulated) → ${Object.values(dec).filter(s => s === 'rated').length} rated, 1 review, 1 not_eligible, 1 casual`);
// Simulated heartbeat (agent 1.5.0, Guard илрээгүй) — server хуудсын Ranked сонголтын төлөвт
await fetch(B + '/server/agent/heartbeat', { method: 'POST', headers: { authorization: 'Bearer ' + SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ online: true, map: 'de_mirage', phase: 'warmup', players: [], matchzy: true, agentVersion: '1.5.0', matchType: 'ranked',
  guard: { ok: false, version: null, error: 'not_installed' }, arena: { mode: 'competitive', aim: null, workshop: null, installed: { aim_map1v1cfg: true }, catalog: ['aim_map1v1cfg'] } }) });

/* ---------- browser ---------- */
const { chromium } = await import(pathToFileURL(path.join(process.env.PLAYWRIGHT, 'index.mjs')).href);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errors = [];
async function page(u, vp, tag) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: u.c.split('=')[0], value: u.c.split('=').slice(1).join('='), url: ORIGIN }]);
  await ctx.route(/images\.steamusercontent\.com|steamcdn|avatars\.(steamstatic|akamai)|fonts\.(googleapis|gstatic)/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="#2c3a2a"/></svg>' }));
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(`${tag} ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${tag} console ${m.text()}`); });
  return p;
}
const D = await page(A, { width: 1440, height: 900 }, 'desktop');
// Анх удаа нээхэд хуучин өөрчлөлтийг мэдэгдэхгүй (seen тэмдэглэгдэнэ)
await D.goto(ORIGIN + '/#ranking'); await D.waitForSelector('.rk-card', { timeout: 15000 }); await D.waitForTimeout(400);
console.log('\n== BERX RANKING page');
ok(await D.$eval('.sidebar a[href="#ranking"]', a => a.textContent.includes('BERX RANKING')) && !!(await D.$('.sidebar a[href="#leaderboard"]')), 'nav: "BERX RANKING" + FACEIT/Premier Leaderboard хэвээр');
ok(!(await D.$('.modal .rk-up')), 'анх нээхэд хуучин өөрчлөлтийн мэдэгдэл гарахгүй');
const me = await (await fetch(B + '/berx/ranking/me', { headers: { cookie: A.c } })).json();
let txt = await D.$eval('.rk-card', e => e.textContent.replace(/\s+/g, ' '));
ok(txt.includes(me.player.rankName) && txt.includes(me.player.brp.toLocaleString('en-US')) && /Таны зэрэглэл/.test(txt) && /Дараагийн зэрэглэл/.test(txt), `миний карт: ${me.player.rankName} ${me.player.brp} BRP, дараагийн зэрэглэл`);
ok(new RegExp(`${me.player.wins} / ${me.player.losses}`).test(txt) && txt.includes(String(me.player.matches)), 'карт: хожил/хожигдол, чансаатай тоглолтын тоо');
ok((await D.$$('.chart svg circle')).length === me.history.length + 1, `BRP түүхийн график: ledger-ийн ${me.history.length} бодит цэг (+эхлэл)`);
ok((await D.$$('.rk-rrow')).length === Math.min(10, me.recent.length) && await D.$eval('.rk-rrow', e => /BRP/.test(e.textContent)), 'сүүлийн чансаатай тоглолтууд (BRP өөрчлөлттэй)');
ok((await D.$$('.rk-gitem')).length === 5 && await D.$eval('.rk-guide', e => ['ROOKIE', 'HUNTER', 'REAPER', 'DOMINATOR', 'IMMORTAL'].every(n => e.textContent.includes(n))), 'зэрэглэлийн заавар: 5 эх тэмдэг');
ok(await D.$eval('.rk-rules', e => /\+150…\+230/.test(e.textContent) && /−130…−200/.test(e.textContent) && /First to 10 тоглолт BRP-д нөлөөлөхгүй/.test(e.textContent)), 'дүрэм: BRP хязгаар, First to 10');
const lbRows = await D.$$eval('.rk-table:not(details .rk-table) tbody tr', e => e.map(r => r.textContent.replace(/\s+/g, ' ')));
ok(/IMMORTAL #1/.test(lbRows[0]) && /Saraa/.test(lbRows[0]) && /IMMORTAL #2/.test(lbRows[1]) && /Enkh/.test(lbRows[1]), 'leaderboard: IMMORTAL #1, #2 байраар');
ok(lbRows.some(r => /REAPER|DOMINATOR/.test(r)) && lbRows.some(r => /HUNTER|ROOKIE/.test(r)), 'leaderboard: олон зэрэглэл');
ok(await D.$eval('.rk-table tr.me', e => /Та/.test(e.textContent)), 'leaderboard: таны мөр тодорсон');
ok(await D.$eval('.rk-unranked summary', e => /Чансаагүй тоглогчид/.test(e.textContent)), 'чансаагүй тоглогчид тусдаа');
if (SHOTS) { await D.screenshot({ path: SHOTS + '/r1-desktop-ranking.png', fullPage: true }); }
// эмблемийн зураг
if (SHOTS) {
  await D.evaluate(() => { const R = window.BerxRank; const w = document.createElement('div'); w.id = 'em-sheet'; w.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0b0b0d;display:flex;gap:36px;align-items:center;justify-content:center;flex-wrap:wrap;padding:40px';
    w.innerHTML = R.RANKS.map(r => `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;color:#eee;font:800 15px Inter,sans-serif;letter-spacing:.06em">${R.emblem(r.id, 150)}<span>${r.name}</span><span style="color:#888;font-weight:600;font-size:12px">${r.min}${r.max ? '–' + r.max : '+'} BRP</span></div>`).join(''); document.body.appendChild(w); });
  await D.screenshot({ path: SHOTS + '/r0-emblems.png' }); await D.evaluate(() => document.getElementById('em-sheet').remove());
}

/* ---------- Match History ---------- */
console.log('\n== Match History integration');
await D.goto(ORIGIN + '/#matches'); await D.waitForSelector('.mh-row', { timeout: 15000 });
const rows = await D.$$eval('.mh-row', e => e.map(r => ({ id: r.dataset.id, t: r.textContent.replace(/\s+/g, ' ') })));
ok(rows.some(r => /RANKED/.test(r.t) && /[+−]\d+ BRP/.test(r.t)) && rows.some(r => /CASUAL/.test(r.t)), 'жагсаалт: RANKED / CASUAL шошго, таны BRP өөрчлөлт');
if (SHOTS) await D.screenshot({ path: SHOTS + '/r2-desktop-match-history.png' });
const rated = dump.berx_matches.find(m => m.mode === 'competitive' && dec[m.id] === 'rated' && m.lock.roster.CT.includes(S(1)));
await D.evaluate(id => window.BerxPages.matches.openMatch(id), rated.id); await D.waitForSelector('.mh-table');
const th = await D.$$eval('.mh-team.ct .mh-table th', e => e.map(x => x.textContent));
ok(th.includes('Үзүүлэлт') && th.includes('BRP'), 'дэлгэрэнгүй: "Үзүүлэлт" ба "BRP" багана');
ok(await D.$eval('.modal', e => /Чансаатай тоглолт — BRP өөрчлөлт тооцогдсон/.test(e.textContent) && /competitive-v1/.test(e.textContent) && /хувийн үзүүлэлт/.test(e.textContent)), 'дэлгэрэнгүй: Монгол тайлбар, томъёо, таны үзүүлэлт');
if (SHOTS) await D.screenshot({ path: SHOTS + '/r3-desktop-ranked-details.png' });
await D.click('.modal .x'); await D.waitForTimeout(150);
const ne = dump.berx_matches.find(m => dec[m.id] === 'not_eligible');
await D.evaluate(id => window.BerxPages.matches.openMatch(id), ne.id); await D.waitForSelector('.mh-table');
ok(await D.$eval('.modal', e => /Энэ тоглолт BRP-д нөлөөлөхгүй: Steam-ээ BERX бүртгэлтэй холбоогүй тоглогч оролцсон/.test(e.textContent)), 'not_eligible: яагаад BRP өгөөгүйг Монголоор');
await D.click('.modal .x'); await D.waitForTimeout(150);
const cas = dump.berx_matches.find(m => m.match_type === 'casual');
await D.evaluate(id => window.BerxPages.matches.openMatch(id), cas.id); await D.waitForSelector('.mh-table');
ok(await D.$eval('.modal', e => /Энгийн тоглолт — энэ тоглолт BRP-д нөлөөлөхгүй/.test(e.textContent)) && !(await D.$$eval('.mh-table th', e => e.map(x => x.textContent))).includes('BRP'), 'Casual: тайлбартай, BRP багана алга');
await D.click('.modal .x'); await D.waitForTimeout(150);

/* ---------- Профайл ---------- */
console.log('\n== profile');
await D.goto(ORIGIN + '/#ranking'); await D.waitForSelector('.rk-table');
await D.click(`.rk-table [data-action="open-profile"][data-id="${K.id}"]`);
await D.waitForSelector('.rk-prof .rk-prof-st', { timeout: 8000 });
txt = await D.$eval('.rk-prof', e => e.textContent.replace(/\s+/g, ' '));
const kc = await (await fetch(B + '/berx/ranking/users/' + K.id, { headers: { cookie: A.c } })).json();
ok(txt.includes(kc.player.brp.toLocaleString('en-US')) && txt.includes(kc.player.rankName) && /Оргил/.test(txt) && /Ranked/.test(txt) && /Win rate/.test(txt) && /Сүүлийн/.test(txt), 'профайл: зэрэглэл, BRP, оргил, ranked тоо, win rate, сүүлийн өөрчлөлт');
ok(!!(await D.$('.rk-prof a[href="#ranking"]')) && !!(await D.$('.rk-prof a[href="#matches"]')), 'профайл: чансаа / тоглолтын түүх холбоос');
if (SHOTS) await D.screenshot({ path: SHOTS + '/r4-desktop-profile.png' });
await D.click('.modal .x'); await D.waitForTimeout(150);

/* ---------- Зэрэглэл ахисан мэдэгдэл ---------- */
console.log('\n== rank-up notification');
const crossing = me.history.findIndex(h => window_rank(h.prev) !== window_rank(h.brp));
function window_rank(b) { return b >= 5000 ? 4 : b >= 4000 ? 3 : b >= 3000 ? 2 : b >= 2000 ? 1 : 0; }
ok(crossing >= 0, 'ledger-т зэрэглэлийн хил давсан өөрчлөлт байна');
const seenId = crossing > 0 ? me.history[crossing - 1].id : 1;
await D.evaluate(([k, v]) => localStorage.setItem(k, String(v)), ['berx.rank.seen.' + A.id, seenId]);
await D.reload(); await D.waitForSelector('.modal .rk-up', { timeout: 10000 });
ok(await D.$eval('.modal .rk-up', e => /Зэрэглэл (ахилаа|буурлаа)/.test(e.textContent)), 'шинэ зэрэглэл → мэдэгдэл (Зэрэглэл ахилаа)');
if (SHOTS) await D.screenshot({ path: SHOTS + '/r5-desktop-rank-up.png' });
await D.click('.modal [data-action="close-modal"].btn'); await D.waitForTimeout(200);
await D.reload(); await D.waitForSelector('.rk-card'); await D.waitForTimeout(800);
ok(!(await D.$('.modal .rk-up')), 'хаасны дараа дахин гарахгүй');

/* ---------- Server: Ranked/Casual ---------- */
console.log('\n== server ranked selector');
await D.goto(ORIGIN + '/#server'); await D.waitForSelector('.adm-panel', { timeout: 15000 });
ok(await D.$eval('.adm-panel', e => /Дараагийн тоглолтын төрөл/.test(e.textContent) && /RANKED/.test(e.textContent)) && !!(await D.$('.adm-panel [data-action="comp-type"][data-v="ranked"].on')), 'Competitive: дараагийн тоглолтын төрөл (Чансаатай сонгогдсон)');
await D.click('[data-action="srv-tab"][data-tab="aim"]'); await D.waitForSelector('.aim-form');
ok(await D.$eval('.aim-form [data-action="aim-type"][data-v="ranked"]', b => b.disabled) && await D.$eval('.aim-form', e => /First to 10 тоглолт BRP-д нөлөөлөхгүй/.test(e.textContent)), 'AIM: First to 10 (анхдагч) → Чансаатай идэвхгүй, шалтгаантай');
await D.click('.aim-form [data-action="aim-set"][data-k="rounds"][data-v="13"]'); await D.waitForTimeout(150);
ok(await D.$eval('.aim-form [data-action="aim-type"][data-v="ranked"]', b => b.disabled) && await D.$eval('.aim-form', e => /BERX Guard плагин серверт илрээгүй/.test(e.textContent)), 'AIM first to 13: Guard илрээгүй → Чансаатай идэвхгүй (шалтгаантай)');
ok(!!(await D.$('.aim-form [data-action="aim-type"][data-v="casual"].on')), 'анхдагч: Энгийн тоглолт');
if (SHOTS) { await D.$eval('.aim-form', e => e.scrollIntoView()); await D.screenshot({ path: SHOTS + '/r6-desktop-server-aim-type.png' }); }

/* ---------- Admin → Чансаа ---------- */
console.log('\n== admin ranking');
await D.goto(ORIGIN + '/#admin'); await D.waitForSelector('[data-action="admin-tab"][data-v="ranking"]');
await D.click('[data-action="admin-tab"][data-v="ranking"]'); await D.waitForSelector('.rk-sum', { timeout: 10000 });
txt = await D.$eval('.page', e => e.textContent.replace(/\s+/g, ' '));
ok(/Feature flag/.test(txt) && /competitive-v1/.test(txt) && /Нийт олгосон/.test(txt) && /Нийт хассан/.test(txt), 'admin: flag, томъёо, inflation');
ok((await D.$$('.rka-item [data-action="rka-review"][data-v="approve"]')).length === 1 && /Хэт богино тоглолт/.test(txt), 'admin: шалгалтын дараалал (хэт богино)');
ok(/adjust/.test(txt) && /UI test seed/.test(txt), 'admin: audit');
await D.selectOption('[data-rka-player]', U[10].id); await D.waitForSelector('.rka-ledger .mono', { timeout: 8000 });
ok(await D.$eval('.page', e => /IMMORTAL/.test(e.textContent)) && !!(await D.$('[data-action="rka-adjust"]')), 'admin: тоглогчийн ledger + засварын форм');
if (SHOTS) await D.screenshot({ path: SHOTS + '/r7-desktop-admin-ranking.png', fullPage: true });
const Kp = await page(K, { width: 1440, height: 900 }, 'member');
await Kp.goto(ORIGIN + '/#admin'); await Kp.waitForSelector('.page[data-page="admin"]');
ok(!(await Kp.$('[data-action="admin-tab"][data-v="ranking"]')), 'энгийн гишүүнд "Чансаа" таб харагдахгүй');

/* ---------- mobile ---------- */
console.log('\n== mobile 390');
const M = await page(A, { width: 390, height: 844 }, 'mobile');
await M.goto(ORIGIN + '/#ranking'); await M.waitForSelector('.rk-card'); await M.waitForTimeout(500);
await M.click('.modal [data-action="close-modal"].btn').catch(() => {});
ok(await M.evaluate(() => document.documentElement.scrollWidth <= 390), 'mobile ranking: хэвтээ scroll алга');
ok(await M.$$eval('.rk-card, .rk-table', e => e.every(x => x.getBoundingClientRect().right <= 392)), 'mobile: карт, жагсаалт дэлгэцэнд багтана');
if (SHOTS) { await M.screenshot({ path: SHOTS + '/r8-mobile-ranking.png' }); await M.screenshot({ path: SHOTS + '/r9-mobile-ranking-full.png', fullPage: true }); }
await M.goto(ORIGIN + '/#matches'); await M.waitForSelector('.mh-row');
ok(await M.evaluate(() => document.documentElement.scrollWidth <= 390) && await M.$$eval('.mh-row', e => e.slice(0, 5).every(r => r.getBoundingClientRect().right <= 390)), 'mobile Match History: RANKED шошготой мөр дэлгэцэнд');
if (SHOTS) await M.screenshot({ path: SHOTS + '/r10-mobile-match-history.png' });
await M.evaluate(id => window.BerxPages.matches.openMatch(id), rated.id); await M.waitForSelector('.mh-table');
ok(await M.evaluate(() => { const m = document.querySelector('.modal'); return m.getBoundingClientRect().width <= 390; }), 'mobile дэлгэрэнгүй: modal дэлгэцэнд');
if (SHOTS) await M.screenshot({ path: SHOTS + '/r11-mobile-ranked-details.png' });
await M.click('.modal .x');
await M.goto(ORIGIN + '/#admin'); await M.waitForSelector('[data-action="admin-tab"][data-v="ranking"]'); await M.click('[data-action="admin-tab"][data-v="ranking"]'); await M.waitForSelector('.rk-sum');
ok(await M.evaluate(() => document.documentElement.scrollWidth <= 390), 'mobile admin чансаа: хэвтээ scroll алга');
if (SHOTS) await M.screenshot({ path: SHOTS + '/r12-mobile-admin-ranking.png', fullPage: true });

for (const route of ['dashboard', 'stats', 'leaderboard', 'server', 'matches', 'ranking', 'admin']) { await D.goto(ORIGIN + '/#' + route); await D.waitForTimeout(600); ok((await D.$eval('.page', e => e.dataset.page)) === route, 'хуудас render: ' + route); }
ok(errors.length === 0, 'console/page алдаа алга' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close(); for (const p of procs) p.kill();
process.exit(fail ? 1 : 0);
