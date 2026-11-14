// Statistics sync guard: FACEIT/Leetify key-гүй deployment (Preview) хадгалсан статистикийг дарж бичихгүй
//   node tests/stats/sync-guard.mjs   (сүлжээ шаардлагагүй; key-ийн утга бүгд хуурамч)
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import net from 'net';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-stats-'));
const procs = []; const run = (args, env, logf) => { const p = spawn('node', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); const w = fs.createWriteStream(logf); p.stdout.pipe(w); p.stderr.pipe(w); procs.push(p); return p; };
const pgPort = await freePort();
run([path.join(ROOT, 'tests/skins/fake-supabase.js'), pgPort], {}, path.join(tmp, 'pg.log'));
const PG = `http://127.0.0.1:${pgPort}`;
const FAKE_FACEIT = 'fake-faceit-key-0000', FAKE_LEETIFY = 'fake-leetify-key-0000';
const base = { SUPABASE_URL: PG, SUPABASE_SECRET_KEY: 'sb_secret_TESTKEY123', SESSION_SECRET: 'stats_session_secret_stats_session_secret', ADMIN_LOGINS: 'a@berx.mn',
  STEAM_API_KEY: '', FACEIT_API_KEY: '', LEETIFY_API_KEY: '', VERCEL_ENV: '' };
async function site(env, name) {
  const port = await freePort();
  run([path.join(ROOT, 'server/server.js')], { ...base, ...env, PORT: port }, path.join(tmp, name + '.log'));
  const B = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(B + '/health')).ok) break; } catch (e) { /* wait */ } await sleep(150); }
  return B;
}
const preview = await site({ VERCEL_ENV: 'preview' }, 'preview');          // Preview: key-гүй, ижил Supabase
const local = await site({}, 'local');                                      // локал хөгжүүлэлт: key-гүй
const prod = await site({ FACEIT_API_KEY: FAKE_FACEIT, LEETIFY_API_KEY: FAKE_LEETIFY, VERCEL_ENV: 'production' }, 'prod');
const dump = async () => (await (await fetch(PG + '/__dump')).json());
async function reg(B, nick, login, patch) {
  const r = await fetch(B + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, login, password: 'secret1' }) });
  const c = r.headers.get('set-cookie').split(';')[0]; const id = (await dump()).users.find(x => x.login === login).id;
  await fetch(`${PG}/__patch?t=users&k=id&v=${id}`, { method: 'POST', body: JSON.stringify(patch) }); return { c, id };
}
const sync = (B, u) => fetch(B + '/stats/sync', { method: 'POST', headers: { cookie: u.c, 'content-type': 'application/json' }, body: JSON.stringify({ force: true }) }).then(async r => ({ s: r.status, j: await r.json(), raw: JSON.stringify(await r.clone ? {} : {}) }));
const GOOD = { faceit: { elo: 2100, level: 10, nickname: 'dok' }, premierStats: { rating: 18500 }, periods: { all: { matches: 120 } }, matchHistory: [{ id: 'm1' }], matchCount: 120, warnings: [] };

// 1. Preview (key-гүй) → хадгалсан статистик хэвээр
const A = await reg(preview, 'DOK', 'a@berx.mn', { steam_id: '76561198000000001', live: GOOD, synced_at: Date.now() - 3600e3, faceit_elo: 2100, premier: 18500 });
let r = await sync(preview, A);
let u = (await dump()).users.find(x => x.id === A.id);
ok(r.s === 200 && r.j.skipped === true, 'Preview (FACEIT/Leetify key-гүй): sync-ийг алгасна');
ok(JSON.stringify(u.live) === JSON.stringify(GOOD) && u.faceit_elo === 2100 && u.premier === 18500, 'Preview хадгалсан FACEIT/Leetify статистикийг дарж бичээгүй');
ok(!JSON.stringify(u.live).includes('тохируулаагүй'), '"FACEIT_API_KEY тохируулаагүй" анхааруулга хадгалагдаагүй');

// 2. VERCEL_ENV-гүй ч key-гүй runtime → өмнөх FACEIT/Leetify өгөгдлийг устгахгүй
r = await sync(local, A); u = (await dump()).users.find(x => x.id === A.id);
ok(r.j.skipped === true && JSON.stringify(u.live) === JSON.stringify(GOOD), 'key-гүй runtime хадгалсан өгөгдлийг устгахгүй');

// 3. Локал хөгжүүлэлт, өмнөх өгөгдөлгүй → өмнөх шигээ ажиллана (анхааруулгатай)
const L = await reg(local, 'Local', 'l@berx.mn', { steam_id: '76561198000000003' });
r = await sync(local, L); u = (await dump()).users.find(x => x.id === L.id);
ok(r.s === 200 && !r.j.skipped && u.synced_at > 0 && u.live.warnings.includes('FACEIT_API_KEY тохируулаагүй'), 'локал (өгөгдөлгүй): хуучин зан төлөв хэвээр');

// 4. Production (key-тэй) → sync хийж бичнэ (энэ sandbox-оос FACEIT/Leetify хүрэхгүй тул алдааг warnings-д бичнэ, гэхдээ "тохируулаагүй" биш)
const P = await reg(prod, 'Kaze', 'k@berx.mn', { steam_id: '76561198000000002', live: GOOD, synced_at: Date.now() - 3600e3 });
r = await sync(prod, P); u = (await dump()).users.find(x => x.id === P.id);
ok(r.s === 200 && !r.j.skipped && u.synced_at > Date.now() - 60e3, 'Production (key-тэй): sync хийгдэж хадгалагдсан');
ok(!u.live.warnings.some(w => /FACEIT_API_KEY тохируулаагүй|LEETIFY_API_KEY тохируулаагүй/.test(w)), 'key-тэй үед "тохируулаагүй" анхааруулга гарахгүй');
const h = await (await fetch(prod + '/health')).json();
ok(h.faceit === true && h.leetify === true, 'health: faceit/leetify = true (зөвхөн boolean)');
const all = JSON.stringify(r.j) + JSON.stringify(h) + JSON.stringify(await dump());
ok(!all.includes(FAKE_FACEIT) && !all.includes(FAKE_LEETIFY), 'API key-ийн утга хариу, health, DB-д огт гарахгүй');
const logs = ['preview', 'local', 'prod'].map(n => fs.readFileSync(path.join(tmp, n + '.log'), 'utf8')).join('');
ok(!logs.includes(FAKE_FACEIT) && !logs.includes(FAKE_LEETIFY), 'API key server log-д гарахгүй');

console.log(`\n${pass} passed, ${fail} failed`);
for (const p of procs) p.kill();
process.exit(fail ? 1 : 0);
