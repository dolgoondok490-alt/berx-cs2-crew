#!/usr/bin/env node
/* BERX Guard / RCON оношилгоо — ЗӨВХӨН УНШИНА (css_berx_guard_status + echo). Серверийн тохиргоо, Guard-ийг өөрчлөхгүй.
 *   cd agent && node tools/guard-diagnose.js [тоо=5]
 * agent/.env-ийн RCON_HOST/RCON_PORT/RCON_PASSWORD-ийг ашиглана. Нууц үгийг хэвлэхгүй.
 * Гаралт: оролдлого бүрийн RCON төлөв (ok/empty/timeout/closed), Guard ангилал, хугацаа, дахин холболт. */
'use strict';
const fs = require('fs'); const path = require('path');
const { Rcon } = require('../rcon');
const { parseGuard, createGuard } = require('../guard');

const envFile = process.env.BERX_AGENT_ENV || path.join(__dirname, '..', '.env');
const env = {};
try { for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
catch (e) { console.error('✖ agent/.env уншигдсангүй:', e.message); process.exit(1); }
const host = env.RCON_HOST || '127.0.0.1', port = +(env.RCON_PORT || 27015), pw = env.RCON_PASSWORD;
if (!pw) { console.error('✖ RCON_PASSWORD алга'); process.exit(1); }
const N = Math.max(1, Math.min(50, +process.argv[2] || 5));

(async () => {
  const rcon = new Rcon(host, port, pw, { log: (...a) => console.log('  [rcon]', ...a) });
  const t0 = Date.now();
  try { await rcon.connect(); console.log(`RCON ${host}:${port} холбогдлоо (${Date.now() - t0}ms)`); }
  catch (e) { console.log(`✖ RCON ${host}:${port} холбогдсонгүй: ${e.message}`); process.exit(2); }
  console.log('\n— Шууд уншилт (query, retry-гүй):');
  for (let i = 1; i <= N; i++) {
    const q = await rcon.query('css_berx_guard_status', { timeout: 4000 });
    const p = parseGuard(q.body);
    console.log(`  #${i}: rcon=${q.status} ${q.ms}ms → guard=${p.state}${p.version ? ' v' + p.version : ''}${p.enforcing !== undefined && p.enforcing !== null ? ' enforcing=' + (p.enforcing ? 1 : 0) : ''}${p.cheats !== undefined && p.cheats !== null ? ' cheats=' + (p.cheats ? 1 : 0) : ''}`);
    if (p.state !== 'ok') console.log('       хариу:', JSON.stringify(q.body.slice(0, 300)));
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('\n— Agent-ийн логик (3 оролдлого, timeout → дахин холболт):');
  const g = createGuard({ query: (c) => rcon.query(c, { timeout: 4000 }), reconnect: () => rcon.reconnect(), log: (m) => console.log('  ' + m) });
  const r = await g.status();
  console.log(`  дүн: ${r.ok ? '✓' : '⚠'} state=${r.state} version=${r.version || '-'} enforcing=${r.enforcing ? 1 : 0} cheats=${r.cheats ? 1 : 0} attempts=${r.attempts}${r.error ? ' error=' + r.error : ''}`);
  console.log('\nRCON статистик:', JSON.stringify(rcon.health()));
  rcon.close();
  process.exit(r.ok ? 0 : 3);
})();
