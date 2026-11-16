/* =========================================================
 * BERX Guard (CounterStrikeSharp плагин) — төлөв унших, асаах/унтраах (agent v1.5.1)
 * Плагины хариу (v1.0.0): "BERX_GUARD ok v=1.0.0 enforcing=0 cheats=0 killed=0 reverts=0 blocked=0"
 *  • Хариуны өмнө/хойно бусад console мөр, \r\n, ANSI өнгө, илүү зай байж болно.
 *  • Ангилал: ok | degraded | not_installed | empty | timeout | rcon_down | invalid
 *  • Зөвхөн "ok" + v=… л баталгаажсан гэж үзнэ. Ranked AIM: ok + enforcing=1 + cheats=0 заавал (тойрох зам байхгүй).
 * ========================================================= */
'use strict';

const LINE = /BERX_GUARD[ \t]+(ok|degraded)[ \t]+v=([0-9A-Za-z._-]{1,16})([^\r\n]*)/;
const clean = (s) => String(s == null ? '' : s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');

function parseGuard(text) {
  const t = clean(text);
  const m = LINE.exec(t);
  if (m) {
    const kv = {};
    for (const x of m[3].matchAll(/(\w+)=([^\s]+)/g)) kv[x[1]] = x[2];
    const bool = (k) => (kv[k] === '1' ? true : kv[k] === '0' ? false : null);
    const num = (k) => (/^\d+$/.test(kv[k] || '') ? +kv[k] : null);
    return { state: m[1], version: m[2], enforcing: bool('enforcing'), cheats: bool('cheats'), killed: num('killed'), reverts: num('reverts'), blocked: num('blocked'), raw: m[0].trim() };
  }
  if (!t.trim()) return { state: 'empty' };
  if (/unknown command/i.test(t)) return { state: 'not_installed', raw: t.trim().slice(0, 160) };
  return { state: 'invalid', raw: t.replace(/\s+/g, ' ').trim().slice(0, 160) };
}

const MESSAGES = {
  ok: 'ажиллаж байна', degraded: 'плагин ачаалагдсан ч бүрэн ажиллахгүй (degraded)', not_installed: 'плагин серверт алга (Unknown command)',
  empty: 'RCON хоосон хариу өгсөн', timeout: 'RCON хариу өгсөнгүй (timeout)', rcon_down: 'RCON холбогдоогүй', invalid: 'танигдаагүй хариу'
};

/**
 * @param {object} o
 * @param {(cmd:string)=>Promise<{status:string, body:string, error?:string}>} o.query  — rcon.query
 * @param {()=>Promise<void>} o.reconnect   — RCON-ыг шинээр холбох
 * @param {()=>boolean} [o.canReconnect]     — сервер завгүй (map татаж/ачаалж) үед false
 */
function createGuard({ query, reconnect, canReconnect = () => true, log = () => {}, sleep = (ms) => new Promise(r => setTimeout(r, ms)), attempts = 3, retryDelayMs = 400 }) {
  async function run(cmd) {
    let last = null, n = 0;
    for (n = 1; n <= attempts; n++) {
      let r;
      try { r = await query(cmd); } catch (e) { r = { status: 'error', body: '', error: e.message }; }
      const p = parseGuard(r.body);
      let state = p.state;
      if (!['ok', 'degraded', 'not_installed'].includes(state)) {
        if (r.status === 'timeout') state = 'timeout';
        else if (r.status === 'closed' || r.status === 'error') state = 'rcon_down';
      }
      last = { ...p, state, rconStatus: r.status, ms: r.ms || 0 };
      // Тодорхой хариу (ok / degraded / плагин алга) → дахин оролдох шаардлагагүй
      if (['ok', 'degraded', 'not_installed'].includes(state)) break;
      log(`⚠ BERX Guard (${cmd}): ${MESSAGES[state] || state}${p.raw ? ' — ' + p.raw : ''} · оролдлого ${n}/${attempts}`);
      if (n >= attempts) break;
      if (['timeout', 'rcon_down'].includes(state) && n >= 1 && canReconnect()) {
        try { await reconnect(); log('↻ BERX Guard: RCON-ыг шинээр холболоо'); } catch (e) { log('⚠ BERX Guard: RCON дахин холбогдсонгүй — ' + e.message); }
      } else await sleep(retryDelayMs * n);
    }
    const ok = last.state === 'ok';
    return {
      ok, state: last.state, version: last.version || null, enforcing: last.enforcing === true, cheats: last.cheats === true,
      killed: last.killed ?? null, reverts: last.reverts ?? null, blocked: last.blocked ?? null,
      attempts: n > attempts ? attempts : n, checkedAt: Date.now(),
      error: ok ? null : `${last.state}${last.raw ? ': ' + last.raw : ''}`.slice(0, 160)
    };
  }
  // Ranked AIM-д: баталгаажсан + enforcing=1 + cheats=0 байх ёстой. Хамгаалалтыг ХЭЗЭЭ Ч тойрохгүй.
  const enforced = (g) => !!(g && g.ok && g.enforcing === true && g.cheats === false);
  return { run, status: () => run('css_berx_guard_status'), enable: () => run('css_berx_guard_on'), disable: () => run('css_berx_guard_off'), enforced, MESSAGES };
}

module.exports = { parseGuard, createGuard, MESSAGES };
