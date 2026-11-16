// agent/rcon.js + agent/guard.js — unit (тусгай RCON сервер, сүлжээ шаардлагагүй). node tests/server/rcon-guard-unit.mjs
import net from 'net'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Rcon } = require('../../agent/rcon.js');
const { parseGuard, createGuard } = require('../../agent/guard.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const G = 'BERX_GUARD ok v=1.0.0 enforcing=0 cheats=0 killed=0 reverts=0 blocked=0';

/* ---------- 1. Parser ---------- */
console.log('\n== guard status parser');
let p = parseGuard(G);
ok(p.state === 'ok' && p.version === '1.0.0' && p.enforcing === false && p.cheats === false && p.killed === 0 && p.blocked === 0, 'v1.0.0-ийн бодит хариу');
p = parseGuard('L 11/16/2026 - 19:00:01: [CSS] something\r\n  \x1b[32m' + G.replace('enforcing=0', 'enforcing=1').replace('killed=0', 'killed=1').replace(/ /g, '  ') + '\x1b[0m  \r\nother line\r\n');
ok(p.state === 'ok' && p.enforcing === true && p.killed === 1, 'өмнө/хойно console мөр, \\r\\n, ANSI, давхар зай');
ok(parseGuard('BERX_GUARD\tok\tv=1.0.0\tenforcing=1\tcheats=1').cheats === true, 'tab тусгаарлагч, cheats=1');
ok(parseGuard('BERX_GUARD degraded v=1.0.0 enforcing=0 cheats=0').state === 'degraded', 'degraded');
ok(parseGuard("Unknown command 'css_berx_guard_status'!").state === 'not_installed', 'плагин алга (Unknown command)');
ok(parseGuard('').state === 'empty' && parseGuard('  \r\n ').state === 'empty' && parseGuard(null).state === 'empty', 'хоосон хариу');
ok(parseGuard('[CSS] error: plugin exception').state === 'invalid' && parseGuard('BERX_GUARD maybe v=1').state === 'invalid', 'танигдаагүй хариу');
ok(parseGuard('BERX_GUARD ok v=1.0.0').enforcing === null, 'enforcing талбаргүй → null (баталгаажсан биш)');

/* ---------- 2. RCON сервер (тест) ---------- */
function server(handler, opts = {}) {
  const st = { conns: 0, cmds: [], overlap: 0, sockets: new Set(), authFail: false };
  const pk = (id, type, body) => { const b = Buffer.from(body); const x = Buffer.alloc(14 + b.length); x.writeInt32LE(10 + b.length, 0); x.writeInt32LE(id, 4); x.writeInt32LE(type, 8); b.copy(x, 12); return x; };
  const srv = net.createServer(s => {
    st.conns++; st.sockets.add(s); s.on('close', () => st.sockets.delete(s)); s.on('error', () => {});
    let buf = Buffer.alloc(0), busy = false; const conn = { n: st.conns, stalled: false };
    const write = async (b) => { if (opts.fragment) { for (let i = 0; i < b.length; i += 3) { s.write(b.slice(i, i + 3)); await sleep(1); } } else s.write(b); };
    const q = []; let running = false;
    const pump = async () => {
      if (running) return; running = true;
      while (q.length) {
        const { id, type, body } = q.shift();
        if (type === 3) { if (st.authFail) { await write(pk(-1, 2, '')); continue; } await write(pk(id, 0, '')); await write(pk(id, 2, '')); continue; }
        st.cmds.push(body);
        if (busy) st.overlap++;
        busy = true;
        const r = await handler(body, conn, st);
        busy = false;
        if (r === null || conn.stalled) continue;                    // хариу өгөхгүй
        for (const part of [].concat(r)) await write(pk(id, 0, part));
      }
      running = false;
    };
    s.on('data', d => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 4) { const n = buf.readInt32LE(0); if (buf.length < n + 4) break; q.push({ id: buf.readInt32LE(4), type: buf.readInt32LE(8), body: buf.slice(12, 4 + n - 2).toString() }); buf = buf.slice(4 + n); }
      pump();
    });
    st.raw = (b) => s.write(b);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ port: srv.address().port, st, close: () => { for (const s of st.sockets) s.destroy(); srv.close(); } })));
}
const echo = (b) => (b.startsWith('echo ') ? b.slice(5) : null);

console.log('\n== RCON client');
{
  const S = await server(async (b) => echo(b) ?? (b === 'css_berx_guard_status' ? G : b === 'multi' ? ['part1 ', 'part2'] : b === 'silent' ? '' : 'x'), { fragment: true });
  const r = new Rcon('127.0.0.1', S.port, 'pw'); await r.connect();
  let q = await r.query('css_berx_guard_status');
  ok(q.status === 'ok' && parseGuard(q.body).state === 'ok', 'хэсэгчилсэн (3 байт) пакеттай хариу бүрэн угсрагдсан');
  q = await r.query('multi');
  ok(q.status === 'ok' && q.body === 'part1 part2', 'олон пакеттай хариу echo маркер хүртэл цуглуулсан');
  q = await r.query('silent');
  ok(q.status === 'empty' && q.body === '', 'хоосон хариу → status "empty" (timeout биш)');
  const res = await Promise.all([r.query('css_berx_guard_status'), r.exec('multi'), r.query('silent'), r.exec('css_berx_guard_status'), r.query('multi')]);
  ok(S.st.overlap === 0 && res[0].status === 'ok' && res[1] === 'part1 part2' && res[2].status === 'empty' && parseGuard(res[3]).state === 'ok' && res[4].body === 'part1 part2', 'зэрэг 5 хүсэлт → дараалан (давхцалгүй), хариу бүр зөв эзэндээ');
  r.close(); S.close();
}
{
  // CS2 гаралтыг дараагийн (маркерын) хариунд хийсэн тохиолдол
  const S = await server(async (b, c, st) => (b === 'late' ? '' : b.startsWith('echo ') ? ['late-output\n', b.slice(5)] : 'x'));
  const r = new Rcon('127.0.0.1', S.port, 'pw'); await r.connect();
  const q = await r.query('late');
  ok(q.status === 'ok' && q.body.includes('late-output') && !q.body.includes('BERX_RCON_END'), 'маркерын хариунд хоцорч ирсэн гаралтыг ч авна (маркергүй)');
  r.close(); S.close();
}
{
  const S = await server(async (b, c) => (c.n === 1 && b === 'css_berx_guard_status' ? (c.stalled = true, null) : echo(b) ?? G));
  const r = new Rcon('127.0.0.1', S.port, 'pw'); await r.connect();
  const t0 = Date.now(); const q = await r.query('css_berx_guard_status', { timeout: 600 });
  ok(q.status === 'timeout' && Date.now() - t0 < 1500 && r.stats.timeouts === 1, 'хариугүй (TCP нээлттэй) → status "timeout"');
  ok(await r.exec('anything', 400) === '', 'exec (хуучин нийцэл): timeout → ""');
  await r.reconnect();
  const q2 = await r.query('css_berx_guard_status');
  ok(q2.status === 'ok' && S.st.conns === 2 && r.stats.reconnects === 1, 'reconnect → шинэ холболтоор хариу авсан');
  r.close(); S.close();
}
{
  const S = await server(async (b, c, st) => { if (b === 'boom') { for (const s of st.sockets) s.destroy(); return null; } return echo(b) ?? 'x'; });
  const r = new Rcon('127.0.0.1', S.port, 'pw'); await r.connect();
  const q = await r.query('boom');
  ok(q.status === 'closed' && !r.ready, 'холболт тасарсан → status "closed", ready=false');
  S.close();
}
{
  const S = await server(async (b, c, st) => { if (b === 'bad') { st.raw(Buffer.from([0xff, 0xff, 0xff, 0x7f, 1, 2, 3, 4])); return null; } return echo(b) ?? 'x'; });
  const r = new Rcon('127.0.0.1', S.port, 'pw'); await r.connect();
  const q = await r.query('bad', { timeout: 800 });
  ok(q.status === 'closed' && r.stats.desync === 1 && !r.ready, 'буруу хэмжээтэй пакет (урсгал эвдэрсэн) → холболтыг хааж дахин холбогдох боломжтой');
  S.close();
}
{
  const S = await server(async () => 'x'); S.st.authFail = true;
  const r = new Rcon('127.0.0.1', S.port, 'bad');
  let err = ''; try { await r.connect(); } catch (e) { err = e.message; }
  ok(/нууц үг/.test(err) && !r.ready, 'нууц үг буруу → reject');
  S.close();
}

/* ---------- 3. Guard client (retry / reconnect) ---------- */
console.log('\n== guard client');
const mk = (seq, o = {}) => { const calls = []; let i = 0, rc = 0; const g = createGuard({ query: async (cmd) => { calls.push(cmd); return seq[Math.min(i++, seq.length - 1)]; }, reconnect: async () => { rc++; }, sleep: async () => {}, canReconnect: o.canReconnect, log: () => {} }); return { g, calls, rc: () => rc }; };
let t = mk([{ status: 'empty', body: '' }, { status: 'ok', body: G }]);
let g = await t.g.status();
ok(g.ok && g.state === 'ok' && g.attempts === 2 && t.rc() === 0, 'хоосон хариу → дахин оролдоход ok');
t = mk([{ status: 'timeout', body: '' }, { status: 'ok', body: G }]);
g = await t.g.status();
ok(g.ok && t.rc() === 1 && g.attempts === 2, 'timeout → RCON дахин холбож → ok');
t = mk([{ status: 'timeout', body: '' }, { status: 'ok', body: G }], { canReconnect: () => false });
g = await t.g.status();
ok(g.ok && t.rc() === 0, 'сервер map ачаалж байх үед дахин холбохгүй (зөвхөн дахин оролдоно)');
t = mk([{ status: 'ok', body: "Unknown command 'css_berx_guard_status'!" }]);
g = await t.g.status();
ok(!g.ok && g.state === 'not_installed' && t.calls.length === 1, 'плагин алга → дахин оролдохгүй, not_installed');
t = mk([{ status: 'ok', body: 'BERX_GUARD degraded v=1.0.0 enforcing=0 cheats=0' }]);
g = await t.g.status();
ok(!g.ok && g.state === 'degraded' && g.version === '1.0.0', 'degraded → баталгаажаагүй');
t = mk([{ status: 'timeout', body: '' }]);
g = await t.g.status();
ok(!g.ok && g.state === 'timeout' && g.attempts === 3 && t.calls.length === 3 && t.rc() === 2, 'тасралтгүй timeout → 3 оролдлого (хязгаартай), state timeout');
t = mk([{ status: 'closed', body: '' }, { status: 'ok', body: 'garbage' }, { status: 'ok', body: 'garbage' }]);
g = await t.g.status();
ok(!g.ok && g.state === 'invalid', 'танигдаагүй хариу → invalid');
t = mk([{ status: 'ok', body: G.replace('enforcing=0', 'enforcing=1') }]);
ok(t.g.enforced(await t.g.enable()), 'enforced: ok + enforcing=1 + cheats=0');
ok(!t.g.enforced({ ok: true, enforcing: true, cheats: true }) && !t.g.enforced({ ok: true, enforcing: false, cheats: false }) && !t.g.enforced({ ok: false, enforcing: true, cheats: false }), 'enforced: cheats=1 / enforcing=0 / баталгаажаагүй → false');

/* ---------- 4. Ranked AIM-ийн явцад Guard алдагдвал түгжээнд тэмдэглэх ---------- */
console.log('\n== match lock: guard lost');
{
  const os = await import('os'), fs = await import('fs'), path = await import('path');
  const { createMatchHistory } = require('../../agent/match-history.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-mh-'));
  const h = createMatchHistory({ env: { BERX_MATCHES_STATE: path.join(dir, 's.json') }, version: '1.5.1', send: async () => ({ status: 200 }) });
  const SA = '76561198000000001', SB = '76561198000000002';
  h._rec.setRoster([{ steamId: SA, name: 'A', team: 'CT' }, { steamId: SB, name: 'B', team: 'T' }]);
  h._rec.onLog('11/16/2026 - 19:00:00.000 - World triggered "Match_Start" on "aim_map1v1cfg"', { aim: { mode: 'aim1v1', map: 'aim_map1v1cfg', workshop_id: '3418431100', aim_weapon: 'awp', target_rounds: 13, ranked: true, guard: { ok: true, version: '1.0.0', checkedAt: 1 } } });
  ok(h._rec.live.lock.guard.ok === true, 'Match_Start: Guard ok түгжигдсэн');
  ok(h.markGuardLost(123) === true && h._rec.live.lock.guard.ok === false && h._rec.live.lock.guard.lost_at === 123, 'Guard алдагдсан → lock.guard.ok=false (сайт BRP өгөхгүй: guard_missing)');
  ok(h.markGuardLost(456) === false, 'дахин тэмдэглэхгүй');
  h._rec.onLog('11/16/2026 - 19:00:01.000 - World triggered "Match_Start" on "aim_map1v1cfg"', { aim: { mode: 'aim1v1', map: 'aim_map1v1cfg', workshop_id: '3418431100', aim_weapon: 'awp', target_rounds: 13, ranked: false } });
  ok(h.markGuardLost(789) === false, 'Casual тоглолтод нөлөөгүй');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
