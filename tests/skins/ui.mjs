// BERX SKIN INVENTORY v2 — browser UI тест (Playwright + жинхэнэ сайт + хуурамч Supabase)
//   node tests/skins/ui.mjs            (PLAYWRIGHT=<playwright module path>, CHROME_PATH=<chromium>, CHECK_REMOTE_IMAGES=1 — CI-д Steam CDN зураг шалгана)
//   SHOTS=<dir> → desktop/mobile screenshot хадгална
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import net from 'net';
import { fileURLToPath, pathToFileURL } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pwPath = process.env.PLAYWRIGHT ? pathToFileURL(path.join(process.env.PLAYWRIGHT, 'index.mjs')).href : 'playwright';
const { chromium } = await import(pwPath);
const CAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/skins-catalog.json')));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const procs = []; const run = (args, env, logf) => { const p = spawn('node', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); const w = fs.createWriteStream(logf); p.stdout.pipe(w); p.stderr.pipe(w); procs.push(p); return p; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-skui-'));
const SHOTS = process.env.SHOTS || null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const [pgPort, sitePort] = [await freePort(), await freePort()];
run([path.join(ROOT, 'tests/skins/fake-supabase.js'), pgPort], {}, path.join(tmp, 'pg.log'));
run([path.join(ROOT, 'server/server.js')], { PORT: sitePort, SUPABASE_URL: `http://127.0.0.1:${pgPort}`, SUPABASE_SECRET_KEY: 'sb_secret_TESTKEY123', SESSION_SECRET: 'skui_session_secret_skui_session_secret',
  ADMIN_LOGINS: 'a@berx.mn', SERVER_AGENT_SECRET: 'skui-agent-secret-' + 'q'.repeat(24), SKINS_ENABLED: '1', SKINS_SYNC_ENABLED: '1' }, path.join(tmp, 'site.log'));
const B = `http://127.0.0.1:${sitePort}`, PG = `http://127.0.0.1:${pgPort}`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch (e) { /* wait */ } await sleep(200); }
const reg = async (nick, login, sid) => {
  const r = await fetch(B + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, login, password: 'secret1' }) });
  const c = r.headers.get('set-cookie').split(';')[0]; const all = await (await fetch(PG + '/__dump')).json(); const id = all.users.find(x => x.login === login).id;
  await fetch(`${PG}/__patch?t=users&k=id&v=${id}`, { method: 'POST', body: JSON.stringify({ steam_id: sid }) }); return { c, id, sid };
};
const SID = '76561198000000001', SID2 = '76561198000000002';
const A = await reg('DOK', 'a@berx.mn', SID), K = await reg('Kaze', 'k@berx.mn', SID2);
const dbRow = async (sid) => ((await (await fetch(PG + '/__dump')).json()).skin_loadouts || []).find(r => r.steam_id === sid) || null;

// ---- Хуучин UI-аар хадгалсан loadout (production-д байгаа хэлбэр) — бүгд хадгалагдах ёстой ----
const pick = (f) => CAT.items.find(f);
const ak = pick(i => i.w === 'weapon_ak47' && i.st), m4 = pick(i => i.w === 'weapon_m4a1' && i.p > 0), kar = pick(i => i.w === 'weapon_knife_karambit' && i.p > 0);
const bfly0 = pick(i => i.w === 'weapon_knife_butterfly' && i.p === 0), glv = pick(i => i.k === 'gloves'), agCT = pick(i => i.k === 'agent' && i.t === 3), agT = pick(i => i.k === 'agent' && i.t === 2);
// CS2-ийн багийн зэвсэг (шаардлагаас): зөвхөн T / зөвхөн CT; бусад нь хоёр багт
const T_ONLY = ['weapon_ak47', 'weapon_galilar', 'weapon_sg556', 'weapon_mac10', 'weapon_tec9', 'weapon_glock', 'weapon_sawedoff', 'weapon_g3sg1'];
const CT_ONLY = ['weapon_m4a1', 'weapon_m4a1_silencer', 'weapon_famas', 'weapon_aug', 'weapon_mp9', 'weapon_fiveseven', 'weapon_usp_silencer', 'weapon_hkp2000', 'weapon_mag7', 'weapon_scar20'];
const GUNS = CAT.weapons.filter(w => !['knives', 'gloves'].includes(w.c));
const gunsFor = (t) => GUNS.filter(w => !(t === 2 ? CT_ONLY : T_ONLY).includes(w.w));
const defOf = (w) => String(CAT.weapons.find(x => x.w === w).d);
const mid = (i, k = .5) => Math.round((i.f[0] + (i.f[1] - i.f[0]) * k) * 1e4) / 1e4;
const OLD = {
  '3': { weapons: { [m4.d]: { p: m4.p, wear: mid(m4, .2), seed: 77, st: 0, tag: null }, [ak.d]: { p: ak.p, wear: mid(ak, .4), seed: 5, st: 0, tag: 'LEGACY' } }, knife: { d: kar.d, w: kar.w, p: kar.p, wear: mid(kar), seed: 412, st: 0, tag: null }, gloves: { d: glv.d, p: glv.p, wear: mid(glv), seed: 7 }, agent: agCT.m },
  '2': { weapons: { [ak.d]: { p: ak.p, wear: mid(ak, .3), seed: 661, st: 1, tag: 'OLD' } }, knife: { d: bfly0.d, w: bfly0.w, p: 0, wear: 0.000001, seed: 0, st: 0, tag: null }, gloves: null, agent: agT.m }
};
let r = await fetch(B + '/api/action', { method: 'POST', headers: { cookie: K.c, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'skins.save', payload: { loadout: OLD } }) });
ok(r.ok, 'хуучин UI-ийн хэлбэрээр хадгалсан loadout (Kaze) — save API');
const oldSaved = (await dbRow(SID2)).loadout;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errors = [];
async function page(u, vp, tag) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addCookies([{ name: u.c.split('=')[0], value: u.c.split('=').slice(1).join('='), url: B }]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${tag} pageerror ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|ERR_NAME|ERR_CONNECTION|ERR_BLOCKED|fonts\.g|jsdelivr|net::ERR/.test(m.text())) errors.push(`${tag} console ${m.text()}`); });
  return p;
}
const D = await page(A, { width: 1440, height: 900 }, 'desktop');
await D.goto(B + '/#skins'); await D.waitForSelector('.skx-grid', { timeout: 15000 });
const cards = () => D.$$eval('.skx-grid .skx-card', els => els.map(e => ({ key: e.dataset.key, kind: e.dataset.kind, d: e.dataset.d, has: e.classList.contains('has'), name: e.querySelector('b').textContent, wn: e.querySelector('.skx-wn').textContent, rc: getComputedStyle(e).getPropertyValue('--rc').trim() })));
const cat = async (c) => { await D.click(`.skx-cats [data-v="${c}"]`); await D.waitForTimeout(120); };
const open = async (sel) => { await D.click(sel); await D.waitForSelector('.skx-pick'); };
const save = async () => { await D.click('[data-action="skx-save"]'); await D.waitForFunction(() => !document.querySelector('[data-action="skx-save"]') || !document.querySelector('[data-action="skx-save"]').textContent.includes('Хадгалж')); await D.waitForTimeout(250); };

/* ---------- 1. Weapon-first inventory + ангилал ---------- */
console.log('\n== inventory');
const navLabels = await D.$$eval('.skx-cats button span', e => e.map(x => x.textContent));
ok(JSON.stringify(navLabels) === JSON.stringify(['All', 'Knives', 'Gloves', 'Rifles', 'Sniper Rifles', 'Pistols', 'SMGs', 'Heavy', 'Agents']), 'ангилал: All, Knives, Gloves, Rifles, Sniper Rifles, Pistols, SMGs, Heavy, Agents');
ok((await D.$eval('.skx-cats button.on', e => e.dataset.v)) === 'all', 'анхдагч: All');
// Бодитоор render хийгдэх mask URL (CSS-ээс хамааран шийдэгдсэн) → файл ачаалагдах ёстой (өмнө css/assets/... болж 404 байсан)
const icons = await D.$$eval('.skx-cats button', e => e.filter(b => b.dataset.v !== 'all').map(b => { const i = b.querySelector('.skx-ic'), cs = getComputedStyle(i); return { v: b.dataset.v, mask: cs.webkitMaskImage || cs.maskImage, w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, color: cs.backgroundColor }; }));
const urls = icons.map(i => (i.mask.match(/url\("?([^")]+)"?\)/) || [])[1]);
ok(icons.length === 8 && urls.every((u, k) => u && u.startsWith(B + '/assets/weapons/icons/' + icons[k].v + '.png')), '8 icon-ийн mask URL зөв шийдэгдсэн: ' + urls.map(u => (u || '').replace(B, '')).join(' '));
ok((await Promise.all(urls.map(u => fetch(u).then(r => r.ok && r.headers.get('content-type') === 'image/png')))).every(Boolean), '8 icon файл бодитоор ачаалагдана (PNG)');
ok(icons.every(i => i.w === icons[0].w && i.h === icons[0].h && i.w >= 40), `icon бүр ижил хэмжээтэй (${icons[0].w}×${icons[0].h})`);
ok(icons.every(i => i.color === 'rgb(161, 163, 170)'), 'идэвхгүй icon саарал');
await D.click('.skx-cats [data-v="rifles"]'); await D.waitForTimeout(120);
ok(await D.$eval('.skx-cats button.on .skx-ic', e => getComputedStyle(e).backgroundColor === 'rgb(255, 141, 51)') && await D.$eval('.skx-cats button.on', e => getComputedStyle(e).color === 'rgb(255, 141, 51)'), 'идэвхтэй icon + нэр BERX улбар шар');
const iconTop = await D.$eval('.skx-cats button.on', b => { const i = b.querySelector('.skx-ic').getBoundingClientRect(), t = b.querySelector('span').getBoundingClientRect(); return i.bottom <= t.top + 1 && Math.abs((i.left + i.right) / 2 - (t.left + t.right) / 2) < 2; });
ok(iconTop, 'icon нэрийн дээр, голлосон');
await D.click('.skx-cats [data-v="all"]'); await D.waitForTimeout(120);
let all = await cards();
const guns = gunsFor(3);
ok(all.length === 3 + guns.length, `All (CT): хутга + бээлий + agent + ${guns.length} зэвсэг (зэвсэг бүр НЭГ card) = ${all.length}`);
ok(new Set(all.filter(c => c.kind === 'weapon').map(c => c.d)).size === guns.length, 'зэвсэг давхардалгүй');
ok(all.every(c => !c.has), 'шинэ хэрэглэгч: бүх card default');
const wset = (list) => new Set(list.filter(c => c.kind === 'weapon').map(c => CAT.weapons.find(w => String(w.d) === c.d).w));
let ws = wset(all);
ok(T_ONLY.every(w => !ws.has(w)), 'CT All: T-only зэвсэг (AK-47, Galil AR, SG 553, MAC-10, Tec-9, Glock-18, Sawed-Off, G3SG1) огт харагдахгүй');
ok(CT_ONLY.every(w => ws.has(w)) && gunsFor(2).filter(w => !T_ONLY.includes(w.w)).every(w => ws.has(w.w)), 'CT All: CT-only 10 зэвсэг + хоёр талын бүх зэвсэг харагдана');
await D.click('.skx-teamsw [data-t="2"]'); await D.waitForTimeout(150);
ws = wset(await cards());
ok(CT_ONLY.every(w => !ws.has(w)) && T_ONLY.every(w => ws.has(w)) && ws.size === gunsFor(2).length, `T All: CT-only зэвсэг алга, T-only 8 + хоёр талын = ${ws.size}`);
const tc = await cards(); ok(['knife', 'gloves', 'agent'].every(k => tc.find(c => c.key === k)), 'T: хутга, бээлий, agent хоёр багт хэвээр');
await D.click('.skx-teamsw [data-t="3"]'); await D.waitForTimeout(150);
await cat('pistols'); let pc = await cards();
ok(JSON.stringify(pc.map(c => c.wn)) === JSON.stringify(['Desert Eagle', 'USP-S', 'P250', 'Five-SeveN', 'Dual Berettas', 'P2000', 'CZ75-Auto', 'R8 Revolver']), 'CT Pistols: Glock-18, Tec-9 алга (заасан дарааллаар)');
for (const t of [3, 2]) {
  await D.click(`.skx-teamsw [data-t="${t}"]`); await D.waitForTimeout(120);
  for (const c of ['rifles', 'snipers', 'pistols', 'smgs', 'heavy']) {
    await cat(c); const x = await cards(), exp = gunsFor(t).filter(w => w.c === c).map(w => String(w.d)).sort();
    ok(JSON.stringify(x.map(k => k.d).sort()) === JSON.stringify(exp), `${t === 2 ? 'T' : 'CT'} ${c}: ${exp.length} зэвсэг (зөвхөн тухайн багийнх)`);
  }
}
await D.click('.skx-teamsw [data-t="3"]'); await D.waitForTimeout(120);
// Гараар өөрчилсөн хүсэлт: CT дээр нөгөө багийн зэвсгийн picker нээгдэхгүй
await D.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'skx-open'; b.dataset.kind = 'weapon'; b.dataset.d = '7'; b.id = 'forged'; document.querySelector('.skx-grid').appendChild(b); });
await D.click('#forged'); await D.waitForTimeout(150);
ok(!(await D.$('.skx-pick')), 'CT дээр AK-47-ийн picker-ийг хүчээр нээх оролдлого → нээгдэхгүй');
await cat('knives'); ok((await cards()).length === 21, 'Knives: хутганы slot + 20 төрөл');
await cat('gloves'); ok((await cards()).length === 9, 'Gloves: бээлийн slot + 8 төрөл');
await cat('agents'); let ag = await cards();
ok(ag.length === 1 + CAT.items.filter(i => i.k === 'agent' && i.t === 3).length && ag.slice(1).every(c => CAT.items.find(i => i.m === c.d).t === 3), 'Agents (CT): зөвхөн CT agent-ууд');
await cat('rifles');
const cols = await D.$eval('.skx-grid', e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
ok(cols >= 5 && cols <= 7, `desktop 1440: нэг мөрөнд ${cols} card (5–7)`);
const defImgs = await D.$$eval('.skx-card.def img', e => e.map(i => ({ src: i.src, w: i.naturalWidth })));
ok(defImgs.length === gunsFor(3).filter(w => w.c === 'rifles').length && defImgs.every(i => i.w > 0 && i.src.includes('/assets/weapons/')), 'default зэвсгийн зураг (local WebP) бүгд ачаалагдсан');
const sameSize = await D.$$eval('.skx-grid .skx-card', e => new Set(e.map(x => Math.round(x.getBoundingClientRect().width) + 'x' + Math.round(x.getBoundingClientRect().height))).size);
ok(sameSize === 1, 'card бүр ижил хэмжээтэй');
if (SHOTS) { await cat('all'); await D.screenshot({ path: SHOTS + '/1-desktop-inventory-empty.png' }); await cat('rifles'); }

/* ---------- 2. Picker: зөвхөн тухайн зэвсгийн skin ---------- */
console.log('\n== picker');
await D.click('.skx-teamsw [data-t="2"]'); await D.waitForTimeout(150); await cat('rifles');
await open('.skx-card[data-d="7"]');
ok((await D.$eval('.skx-pick-h h2', e => e.textContent)) === 'AK-47', 'AK-47 дарахад picker: AK-47');
const akSkins = CAT.items.filter(i => i.d === 7);
let ids = await D.$$eval('.skx-skin-b', e => e.map(x => x.dataset.id));
ok(ids.length === akSkins.length && ids.every(id => id.startsWith('7-')), `зөвхөн AK-47-ийн ${akSkins.length} skin (бусад зэвсэг алга)`);
const target = akSkins.find(i => i.st && /Asiimov|Redline|Vulcan|Bloodsport|Neon Rider|Fire Serpent/.test(i.n)) || akSkins.find(i => i.st);
await D.fill('#skx-q', target.n.slice(0, 6)); await D.waitForTimeout(400);
ids = await D.$$eval('.skx-skin-b', e => e.map(x => x.dataset.id));
ok(ids.includes(target.id) && ids.length < akSkins.length, `хайлт "${target.n.slice(0, 6)}" → ${ids.length}`);
ok(await D.evaluate(() => document.activeElement && document.activeElement.id === 'skx-q'), 'хайлтын талбар focus алдахгүй');
await D.fill('#skx-q', ''); await D.waitForTimeout(400);
await D.selectOption('#skx-rarity', target.r); await D.waitForTimeout(150);
ids = await D.$$eval('.skx-skin-b', e => e.map(x => x.dataset.id));
ok(ids.length > 0 && ids.every(id => CAT.items.find(i => i.id === id).r === target.r), 'rarity шүүлт: ' + target.r);
ok(await D.$eval('[data-action="skx-save"]', b => b.disabled), 'skin сонгоогүй үед Save идэвхгүй');
await D.click(`.skx-skin-b[data-id="${target.id}"]`); await D.waitForTimeout(150);
ok(await D.$eval('.skx-prev h3', (e, n) => e.textContent.includes(n), target.n), 'том preview: ' + target.n);
// буруу seed → алдаа, хадгалагдахгүй
await D.fill('#skx-seed', '5000'); await save();
ok(await D.$eval('.skx-err', e => /Pattern seed/.test(e.textContent)), 'seed 5000 → ойлгомжтой алдаа');
ok(!(await dbRow(SID)), 'буруу утга серверт хадгалагдаагүй');
await D.fill('#skx-seed', '661'); await D.fill('#skx-tag', 'BERX');
await D.$eval('#skx-wear', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, String(mid(target, .25)));
if (target.st) await D.check('#skx-st');
await save();
ok(!(await D.$('.skx-pick')), 'Save амжилттай → picker хаагдсан');
let row = await dbRow(SID), w7 = row && row.loadout['2'].weapons['7'];
ok(w7 && w7.p === target.p && w7.seed === 661 && w7.tag === 'BERX' && Math.abs(w7.wear - mid(target, .25)) < 1e-4 && w7.st === (target.st ? 1 : 0), 'skins.save API: T AK-47 paint/float/seed/StatTrak/name tag яг хадгалагдсан');
ok(!row.loadout['3'].weapons['7'], 'CT loadout хөндөгдөөгүй');
ok(!(await D.$('#skx-both')), 'AK-47 (T-only): "CT loadout-д мөн хадгалах" сонголт харагдахгүй');
let akCard = (await cards()).find(c => c.d === '7');
ok(akCard.has && akCard.name === target.n && akCard.rc.toLowerCase() === target.rc.toLowerCase(), 'card шууд шинэ skin-ээр: нэр + rarity өнгө');
ok(await D.$eval('.skx-card[data-d="7"] img', i => !i.src.includes('/assets/weapons/')), 'card дээр skin-ий бодит зураг (catalog)');

/* ---------- 3. T / CT ---------- */
console.log('\n== T / CT');
await D.click('.skx-teamsw [data-t="3"]'); await D.waitForTimeout(150);
let rc = await cards();
ok(!rc.find(c => c.d === '7') && rc.find(c => c.d === '16') && !(await D.$('.skx-badge')), 'CT рүү шилжихэд жагсаалт шууд: AK-47 алга, M4A4 бий (badge биш, шүүлт)');
ok((await D.$eval('.skx-teamsw [data-t="2"] span', e => e.textContent)) === '1' && (await D.$eval('.skx-teamsw [data-t="3"] span', e => e.textContent)) === '0', 'багийн тоо: T 1 (AK), CT 0');
await D.click('.skx-teamsw [data-t="2"]'); await D.waitForTimeout(150);
rc = await cards(); ok(!rc.find(c => c.d === '16') && rc.find(c => c.d === '7').name === target.n, 'T рүү буцахад M4A4 алга, AK-47 T skin-тэйгээ');
// хоёр талын зэвсэг (Desert Eagle): T ба CT тусдаа skin
const deSkins = CAT.items.filter(i => i.d === 1 && i.p > 0), deT = deSkins[0], deCT = deSkins[1];
await cat('pistols'); await open('.skx-card[data-d="1"]'); ok(!!(await D.$('.skx-skin-b')), 'T Pistols: Desert Eagle (хоёр талын) нээгдэнэ');
await D.click(`.skx-skin-b[data-id="${deT.id}"]`); ok(!!(await D.$('#skx-both')), 'хоёр талын зэвсэгт "CT loadout-д мөн хадгалах" харагдана'); await save();
await D.click('.skx-teamsw [data-t="3"]'); await D.waitForTimeout(150);
ok(!(await cards()).find(c => c.d === '1').has, 'CT Desert Eagle default (T-ийн сонголт CT-д нөлөөлөхгүй)');
await open('.skx-card[data-d="1"]'); await D.click(`.skx-skin-b[data-id="${deCT.id}"]`); await save();
row = await dbRow(SID);
ok(row.loadout['2'].weapons['1'].p === deT.p && row.loadout['3'].weapons['1'].p === deCT.p, 'T ба CT тусдаа: T Deagle ≠ CT Deagle');
// хоёр багт хамт (P250 — хоёр талын)
const p250 = CAT.items.find(i => i.d === 36 && i.p > 0);
await open('.skx-card[data-d="36"]'); await D.click(`.skx-skin-b[data-id="${p250.id}"]`); await D.check('#skx-both'); await save();
row = await dbRow(SID);
ok(row.loadout['2'].weapons['36'] && row.loadout['3'].weapons['36'] && row.loadout['2'].weapons['36'].p === p250.p, '"T loadout-д мөн хадгалах" → хоёр багт (P250)');
// CT-only (USP-S): нөгөө багт хадгалах сонголтгүй, зөвхөн CT
const usp = CAT.items.find(i => i.d === 61 && i.p > 0);
await open('.skx-card[data-d="61"]'); await D.click(`.skx-skin-b[data-id="${usp.id}"]`);
ok(!(await D.$('#skx-both')), 'USP-S (CT-only): "T loadout-д мөн хадгалах" харагдахгүй'); await save();
row = await dbRow(SID); ok(row.loadout['3'].weapons['61'] && !row.loadout['2'].weapons['61'], 'USP-S зөвхөн CT-д хадгалагдсан');
// picker нээлттэй үед баг солих → аюулгүй хаагдана
await open('.skx-card[data-d="61"]');
await D.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'skx-team'; b.dataset.t = '2'; b.id = 'tsw'; document.body.appendChild(b); b.click(); }); await D.waitForTimeout(150);
ok(!(await D.$('.skx-pick')) && !(await cards()).find(c => c.d === '61'), 'USP-S picker нээлттэй үед T рүү солиход picker хаагдаж, USP-S жагсаалтаас алга');
await D.click('.skx-teamsw [data-t="3"]'); await D.waitForTimeout(150);

/* ---------- 4. Reset ---------- */
await cat('pistols'); await open('.skx-card[data-d="1"]');
await D.click('[data-action="skx-reset"]'); await D.waitForTimeout(300);
row = await dbRow(SID);
ok(!row.loadout['3'].weapons['1'] && row.loadout['2'].weapons['1'] && !(await cards()).find(c => c.d === '1').has, 'Reset to default: зөвхөн CT Desert Eagle устсан, T хэвээр');

/* ---------- 5. Хутга / бээлий / agent ---------- */
console.log('\n== knife / gloves / agents');
await cat('all'); await open('.skx-card[data-key="knife"]');
ok((await D.$$('.skx-type')).length === 20 && (await D.$eval('.skx-pick-h h2', e => e.textContent)).includes('төрөл'), 'Хутга: эхлээд 20 төрөл');
await D.click('.skx-type[data-d="507"]'); await D.waitForTimeout(150);
ids = await D.$$eval('.skx-skin-b', e => e.map(x => x.dataset.id));
ok(ids.length === CAT.items.filter(i => i.d === 507).length && ids.every(id => id.startsWith('507-')) && ids[0] === '507-0', 'Karambit-ийн skin-үүд (Vanilla эхэнд)');
const kSkin = CAT.items.find(i => i.d === 507 && i.p > 0);
await D.click(`.skx-skin-b[data-id="${kSkin.id}"]`); await save();
row = await dbRow(SID);
ok(row.loadout['3'].knife && row.loadout['3'].knife.d === 507 && row.loadout['3'].knife.w === 'weapon_knife_karambit' && row.loadout['3'].knife.p === kSkin.p, 'хутга: Karambit + skin хадгалагдсан');
ok((await cards()).find(c => c.key === 'knife').name === kSkin.n, 'хутганы card шинэчлэгдсэн');
await cat('knives'); ok(await D.$eval('.skx-card[data-key="kt-507"] .skx-eq', e => e.textContent === 'Сонгосон'), 'Knives: Karambit "Сонгосон"');
await cat('all'); await open('.skx-card[data-key="gloves"]');
ok((await D.$$('.skx-type')).length === 8, 'Бээлий: эхлээд 8 төрөл');
const g = CAT.items.find(i => i.k === 'gloves' && i.d === 5030);
await D.click('.skx-type[data-d="5030"]'); await D.click(`.skx-skin-b[data-id="${g.id}"]`); await save();
row = await dbRow(SID); ok(row.loadout['3'].gloves && row.loadout['3'].gloves.d === 5030 && row.loadout['3'].gloves.p === g.p, 'бээлий: Sport Gloves + skin');
await cat('agents'); const ag3 = CAT.items.find(i => i.k === 'agent' && i.t === 3);
await open(`.skx-card[data-d="${ag3.m}"]`);
ids = await D.$$eval('.skx-skin-b', e => e.map(x => x.dataset.id));
ok(ids.every(id => CAT.items.find(i => i.id === id).t === 3), 'agent picker: зөвхөн CT agent');
await save(); row = await dbRow(SID);
ok(row.loadout['3'].agent === ag3.m && !row.loadout['2'].agent, 'agent CT-д хадгалагдсан');
await D.click('.skx-teamsw [data-t="2"]'); await D.waitForTimeout(100);
ag = await cards(); ok(ag.slice(1).every(c => CAT.items.find(i => i.m === c.d).t === 2), 'T рүү шилжихэд зөвхөн T agent-ууд');
await D.click('.skx-teamsw [data-t="3"]');

/* ---------- 6. Save алдаа: хадгалаагүйг хадгалсан мэт харуулахгүй ---------- */
console.log('\n== save failure');
await cat('snipers'); await open('.skx-card[data-d="9"]');
const awp = CAT.items.find(i => i.d === 9 && i.p > 0);
await D.click(`.skx-skin-b[data-id="${awp.id}"]`);
await D.route('**/api/action', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Түр алдаа (тест)' }) }), { times: 1 });
await save();
ok(!!(await D.$('.skx-pick')) && await D.$eval('.skx-err', e => e.textContent.includes('Хадгалж чадсангүй. Дахин оролдоно уу.') && !e.textContent.includes('Түр алдаа')), 'Save алдаа → picker нээлттэй, "Хадгалж чадсангүй. Дахин оролдоно уу." (техникийн текстгүй)');
row = await dbRow(SID);
ok(!row.loadout['3'].weapons['9'], 'алдааны үед DB-д бичигдээгүй');
await D.keyboard.press('Escape'); await D.waitForTimeout(150);
ok(!(await D.$('.skx-pick')) && !(await cards()).find(c => c.d === '9').has, 'Escape → хаагдсан, AWP card default хэвээр (хадгалсан мэт харуулаагүй)');

/* ---------- 7. Favorites + sync төлөв ---------- */
await open('.skx-card[data-d="9"]');
await D.hover(`.skx-skin:has([data-id="${awp.id}"])`); await D.click(`.skx-skin:has([data-id="${awp.id}"]) .skx-fav`); await D.waitForTimeout(300);
row = await dbRow(SID); ok((row.favorites || []).includes(awp.id), 'favorite → skins.favorites API');
await D.click('[data-action="skx-favonly"]'); await D.waitForTimeout(100);
ids = await D.$$eval('.skx-skin-b', e => e.map(x => x.dataset.id));
ok(ids.length === 1 && ids[0] === awp.id, 'picker: зөвхөн favorite шүүлт');
await D.click('[data-action="skx-close"]');
await D.click('.skx-teamsw [data-t="2"]'); await D.waitForTimeout(150); await D.click('.skx-teamsw [data-t="3"]'); await D.waitForTimeout(150);
row = await dbRow(SID); ok((row.favorites || []).includes(awp.id), 'баг солиход favorite хадгалагдсан хэвээр');
const sync = (await D.$eval('.skx-sync', e => e.textContent)).trim();
const LABELS = ['Хадгалж байна...', 'Сонголт хадгалагдсан', 'Серверт илгээж байна...', 'Серверт бэлэн', 'Тоглоомд идэвхтэй', 'Сервер асахад идэвхжинэ'];
ok(LABELS.includes(sync), 'төлөв энгийн бичгээр: ' + sync);
ok(sync === 'Сервер асахад идэвхжинэ', 'agent/сервер offline үед "Серверт бэлэн" гэж хэлэхгүй');
// Төлөвийн логик хэвээр: бодит sync төлөв бүрт зөв бичиг (серверт синк хийгдээгүй бол "Серверт бэлэн" гарахгүй)
const label = (status, version) => D.evaluate(([st, v]) => { const S = window.BerxPages.skins._state, keep = [S.status, S.version]; S.status = st; S.version = v; window.BerxApp.render();
  const t = (document.querySelector('.skx-sync') || {}).textContent || ''; S.status = keep[0]; S.version = keep[1]; window.BerxApp.render(); return t.trim(); }, [status, version]);
const base = { syncEnabled: true, updatedAt: 1000, server: { online: true } };
ok(await label({ ...base, sync: { version: 4, status: 'ok' } }, 5) === 'Серверт илгээж байна...', 'сервер online, синк хүлээгдэж байна → "Серверт илгээж байна..."');
ok(await label({ ...base, server: { online: false }, sync: null }, 5) === 'Сервер асахад идэвхжинэ', 'сервер offline → "Сервер асахад идэвхжинэ"');
ok(await label({ ...base, sync: { version: 5, status: 'ok', appliedAt: null } }, 5) === 'Серверт бэлэн', 'DB-д синк хийгдсэн → "Серверт бэлэн"');
ok(await label({ ...base, sync: { version: 5, status: 'ok', appliedAt: 2000 } }, 5) === 'Тоглоомд идэвхтэй', 'тоглоомд хэрэгжсэн → "Тоглоомд идэвхтэй"');
ok(await label({ ...base, sync: { version: 5, status: 'error', error: 'ER_ACCESS_DENIED' } }, 5) === 'Сонголт хадгалагдсан', 'синкийн алдаа → "Серверт бэлэн" биш, техникийн алдаа харуулахгүй');
ok(await label({ ...base, syncEnabled: false }, 6) === 'Сонголт хадгалагдсан', 'синк идэвхгүй (v6) → "Сонголт хадгалагдсан" (version харуулахгүй)');
const vis = await D.$eval('.skx', e => e.innerText);
ok(!/\bv\d+\b|синк|sync|database|\bDB\b|\bAPI\b|HTTP|WeaponPaints|loadout хоосон/i.test(vis), 'хэрэглэгчийн UI-д version/sync/DB/API техникийн бичиг алга');
if (SHOTS) {
  await cat('all'); await D.screenshot({ path: SHOTS + '/2-desktop-inventory.png' });
  await cat('snipers'); await open('.skx-card[data-d="9"]'); await D.click(`.skx-skin-b[data-id="${awp.id}"]`); await D.waitForTimeout(200);
  await D.screenshot({ path: SHOTS + '/3-desktop-picker.png' }); await D.keyboard.press('Escape');
  await cat('all'); await open('.skx-card[data-key="knife"]'); await D.click('[data-action="skx-types"]'); await D.waitForTimeout(150); await D.screenshot({ path: SHOTS + '/4-desktop-knife-types.png' }); await D.keyboard.press('Escape');
  for (const [t, n] of [[3, 'ct'], [2, 't']]) { await D.click(`.skx-teamsw [data-t="${t}"]`); await cat('rifles'); await D.waitForTimeout(200); await D.screenshot({ path: `${SHOTS}/7-desktop-${n}-rifles.png` }); }
  await D.click('.skx-teamsw [data-t="3"]'); await cat('all');
}

/* ---------- 8. Хуучин loadout (өмнөх UI) бүрэн хадгалагдана ---------- */
console.log('\n== existing loadout compatibility');
const KP = await page(K, { width: 1280, height: 860 }, 'old-user');
await KP.goto(B + '/#skins'); await KP.waitForSelector('.skx-grid');
const kc = await KP.$$eval('.skx-grid .skx-card', els => els.map(e => ({ key: e.dataset.key, d: e.dataset.d, has: e.classList.contains('has'), name: e.querySelector('b').textContent })));
ok(kc.find(c => c.key === 'knife').name === kar.n && kc.find(c => c.key === 'gloves').name === glv.n && kc.find(c => c.key === 'agent').name === agCT.n && kc.find(c => c.d === String(m4.d)).name === m4.n, 'CT: хутга, бээлий, agent, M4A4 хуучин сонголт харагдана');
ok(!kc.find(c => c.d === String(ak.d)) && (await KP.$eval('.skx-teamsw [data-t="3"] span', e => e.textContent)) === '4', 'хуучин UI-аар CT-д хадгалсан AK-47 CT дээр харагдахгүй (тоонд ч орохгүй: M4A4 + хутга + бээлий + agent = 4)');
await KP.click('.skx-teamsw [data-t="2"]'); await KP.waitForTimeout(150);
const kt = await KP.$$eval('.skx-grid .skx-card', els => els.map(e => ({ key: e.dataset.key, d: e.dataset.d, has: e.classList.contains('has'), name: e.querySelector('b').textContent, st: !!e.querySelector('.skx-st') })));
ok(kt.find(c => c.key === 'knife').name === 'Vanilla' && kt.find(c => c.d === '7').name === ak.n && kt.find(c => c.d === '7').st && !kt.find(c => c.key === 'gloves').has, 'T: Vanilla butterfly, AK StatTrak, бээлийгүй');
// нэг зэвсэг өөрчлөхөд бусад бүх утга яг хэвээр
await KP.click('.skx-cats [data-v="smgs"]'); await KP.waitForTimeout(120);
ok(!(await KP.$('.skx-card[data-d="34"]')), 'T SMGs: MP9 (CT-only) алга');
await KP.click('.skx-card[data-d="17"]'); await KP.waitForSelector('.skx-pick');
const mac = CAT.items.find(i => i.d === 17 && i.p > 0);
await KP.click(`.skx-skin-b[data-id="${mac.id}"]`); await KP.click('[data-action="skx-save"]'); await KP.waitForTimeout(600);
const after = (await dbRow(SID2)).loadout;
const expect = JSON.parse(JSON.stringify(oldSaved)); expect['2'].weapons['17'] = after['2'].weapons['17'];
ok(after['2'].weapons['17'] && after['2'].weapons['17'].p === mac.p && JSON.stringify(after) === JSON.stringify(expect), 'шинэ UI-аар нэг skin нэмэхэд хуучин хутга/бээлий/agent/float/seed/StatTrak/tag бүгд ЯГ хэвээр');
ok(after['3'].weapons[String(ak.d)] && after['3'].weapons[String(ak.d)].tag === 'LEGACY', 'нуугдсан хуучин CT AK-47 өгөгдөл устаагүй (DB-д хэвээр)');

/* ---------- 9. Mobile ---------- */
console.log('\n== mobile');
const M = await page(A, { width: 390, height: 844 }, 'mobile');
await M.goto(B + '/#skins'); await M.waitForSelector('.skx-grid');
ok(await M.evaluate(() => document.documentElement.scrollWidth <= 390), 'mobile 390: хэвтээ scroll алга');
ok((await M.$eval('.skx-grid', e => getComputedStyle(e).gridTemplateColumns.split(' ').length)) === 2, 'mobile: 2 багана');
const mIcons = await M.$$eval('.skx-cats .skx-ic', e => e.map(i => { const r = i.getBoundingClientRect(); return r.width > 30 && r.height > 15; }));
ok(mIcons.length === 9 && mIcons.every(Boolean), 'mobile: ангилал бүр icon-той');
await M.click('.skx-cats [data-v="smgs"]'); await M.waitForTimeout(250);
ok(await M.$eval('.skx-cats', n => { const b = n.querySelector('button.on'), r = b.getBoundingClientRect(), nr = n.getBoundingClientRect(); return b.dataset.v === 'smgs' && r.left >= nr.left - 1 && r.right <= nr.right + 1; }), 'mobile: SMGs дарахад идэвхтэй ангилал харагдсан хэвээр (scroll хадгалагдана)');
await M.click('.skx-cats [data-v="all"]'); await M.waitForTimeout(150);
if (SHOTS) await M.screenshot({ path: SHOTS + '/5-mobile-inventory.png', fullPage: false });
await M.click('.skx-card[data-key="knife"]'); await M.waitForSelector('.skx-pick');
await M.click('.skx-skin-b >> nth=1'); await M.waitForTimeout(200);
const sb = await M.$eval('[data-action="skx-save"]', b => { const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
ok(sb.bottom <= 844 && sb.top >= 0, 'mobile picker: Save товч дэлгэц дотор харагдана');
ok(await M.evaluate(() => { const p = document.querySelector('.skx-pick').getBoundingClientRect(); return Math.round(p.width) === 390; }), 'mobile picker бүтэн дэлгэц');
if (SHOTS) await M.screenshot({ path: SHOTS + '/6-mobile-picker.png' });
if (SHOTS) { await M.keyboard.press('Escape'); for (const [t, n] of [[3, 'ct'], [2, 't']]) { await M.click(`.skx-teamsw [data-t="${t}"]`); await M.click('.skx-cats [data-v="pistols"]'); await M.waitForTimeout(250); await M.screenshot({ path: `${SHOTS}/8-mobile-${n}-pistols.png` }); } }
const T = await page(A, { width: 820, height: 1180 }, 'tablet');
await T.goto(B + '/#skins'); await T.waitForSelector('.skx-grid');
ok(await T.evaluate(() => document.documentElement.scrollWidth <= 820), 'tablet 820: хэвтээ scroll алга');

/* ---------- 10. Steam зураг (CI) + бусад хуудас ---------- */
if (process.env.CHECK_REMOTE_IMAGES === '1') {
  await D.goto(B + '/#skins'); await D.waitForSelector('.skx-grid'); await D.waitForTimeout(3000);
  const rem = await D.$$eval('.skx-card.has img', e => e.map(i => ({ src: i.src, w: i.naturalWidth })));
  ok(rem.length > 0 && rem.every(i => i.w > 0), `сонгосон skin-ий Steam зураг ачаалагдсан (${rem.length})`);
}
console.log('\n== other pages');
for (const route of ['dashboard', 'invite', 'stats', 'leaderboard', 'awards', 'admin', 'server', 'skins']) {
  await D.goto(B + '/#' + route); await D.waitForTimeout(900);
  const txt = await D.$eval('.page', e => e.innerText.length).catch(() => 0);
  ok(txt > 40 && (await D.$eval('.page', e => e.dataset.page)) === route, `хуудас render хийгдсэн: ${route} (${txt} тэмдэгт)`);
}
ok(errors.length === 0, 'console/page алдаа алга' + (errors.length ? ': ' + errors.join(' | ') : ''));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close(); for (const p of procs) p.kill();
process.exit(fail ? 1 : 0);
