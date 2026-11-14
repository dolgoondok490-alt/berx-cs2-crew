#!/usr/bin/env node
/* Зөвхөн УНШИХ/шалгах RCON команд (allowlist). agent/.env-ийн RCON_HOST/PORT/PASSWORD-ийг уншина.
 * usage: node rcon.js <agentDir> "css_plugins list" | "meta list" | "wp_refresh" | "status" */
'use strict';
const net = require('net'), fs = require('fs'), path = require('path');
const ALLOW = ['css_plugins list', 'meta list', 'wp_refresh', 'status'];
const [agentDir, cmd] = process.argv.slice(2);
if (!ALLOW.includes(cmd)) { console.error('Зөвшөөрөгдөөгүй команд. Allowlist: ' + ALLOW.join(' | ')); process.exit(2); }
const env = {};
for (const line of fs.readFileSync(path.join(agentDir, '.env'), 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const pk = (id, type, body) => { const b = Buffer.from(body); const p = Buffer.alloc(14 + b.length); p.writeInt32LE(10 + b.length, 0); p.writeInt32LE(id, 4); p.writeInt32LE(type, 8); b.copy(p, 12); return p; };
const s = net.connect(+env.RCON_PORT || 27015, env.RCON_HOST || '127.0.0.1');
let buf = Buffer.alloc(0), out = '', t;
s.setTimeout(6000, () => { console.error('RCON timeout'); process.exit(1); });
s.on('error', e => { console.error('RCON алдаа: ' + e.message); process.exit(1); });
s.on('connect', () => s.write(pk(1, 3, env.RCON_PASSWORD || '')));
s.on('data', d => {
  buf = Buffer.concat([buf, d]);
  while (buf.length >= 4) { const n = buf.readInt32LE(0); if (buf.length < n + 4) break; const id = buf.readInt32LE(4), type = buf.readInt32LE(8), body = buf.slice(12, 4 + n - 2).toString(); buf = buf.slice(4 + n);
    if (type === 2) { if (id === -1) { console.error('RCON нууц үг буруу'); process.exit(1); } s.write(pk(2, 2, cmd)); continue; }
    if (id === 2) { out += body; clearTimeout(t); t = setTimeout(() => { console.log(out.trim()); s.end(); process.exit(0); }, 400); } }
});
