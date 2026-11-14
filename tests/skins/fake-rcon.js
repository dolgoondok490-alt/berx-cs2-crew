// Тестийн хуурамч CS2 RCON: бүх командыг бичнэ, status_json-д "онлайн" тоглогчдыг өгнө, wp_refresh-д WeaponPaints-ийн хариуг дуурайна.
const net = require('net'), fs = require('fs');
const [port, pass, logFile, online] = process.argv.slice(2);
const players = (online || '').split(',').filter(Boolean).map((s, i) => ({ userid: i + 2, name: 'P' + i, steamid64: s, team: 3 }));
const pk = (id, type, body) => { const b = Buffer.from(body); const p = Buffer.alloc(14 + b.length); p.writeInt32LE(10 + b.length, 0); p.writeInt32LE(id, 4); p.writeInt32LE(type, 8); b.copy(p, 12); return p; };
let map = 'de_mirage';
net.createServer(s => { let buf = Buffer.alloc(0), authed = false; s.on('error', () => {});
  s.on('data', d => { buf = Buffer.concat([buf, d]);
    while (buf.length >= 4) { const n = buf.readInt32LE(0); if (buf.length < n + 4) break;
      const id = buf.readInt32LE(4), t = buf.readInt32LE(8), body = buf.slice(12, 4 + n - 2).toString(); buf = buf.slice(4 + n);
      if (t === 3) { authed = body === pass; s.write(pk(id, 0, '')); s.write(pk(authed ? id : -1, 2, '')); continue; }
      if (!authed) continue; fs.appendFileSync(logFile, body + '\n');
      const c = body.trim(), w = c.split(' '); let out = '';
      if (c === 'status_json') out = JSON.stringify({ server: { map, clients: players } });
      else if (w[0] === 'changelevel') map = w[1];
      else if (w[0] === 'wp_refresh') out = players.some(p => p.steamid64 === w[1]) ? `[WeaponPaints] Skins refreshed for P\n[WeaponPaints] Refresh process completed.` : `[WeaponPaints] Player with SteamID64 '${w[1]}' not found.`;
      else if (c === 'css_plugins list') out = '[#1:LOADED]: "MatchZy"\n[#2:LOADED]: "WeaponPaints"';
      s.write(pk(id, 0, out)); } }); }).listen(+port, '127.0.0.1');
