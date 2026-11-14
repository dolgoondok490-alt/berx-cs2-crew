// Хуурамч CS2 dedicated server: Source RCON (auth, status_json, status, quit). node.exe-г cs2.exe болгож хуулж ажиллуулна.
// args: <port> <password> <markerFile>
const net = require('net'), fs = require('fs');
const [port, pass, marker] = process.argv.slice(2);
const players = [
  { userid: 2, name: 'DOK', steamid64: '76561198000000001', team: 3 },
  { userid: 3, name: 'Kaze', steamid64: '76561198000000002', team: 2 },
  { userid: 4, name: 'BOT Albert', bot: true, team: 2 }
];
const pk = (id, type, body) => { const b = Buffer.from(body); const p = Buffer.alloc(14 + b.length); p.writeInt32LE(10 + b.length, 0); p.writeInt32LE(id, 4); p.writeInt32LE(type, 8); b.copy(p, 12); return p; };
const log = (m) => { try { fs.appendFileSync(marker, m + '\n'); } catch (e) {} };
// жинхэнэ CS2 шиг CPU бага зэрэг ачаална
setInterval(() => { let x = 0; for (let i = 0; i < 2e5; i++) x += i; }, 50);
net.createServer(s => {
  let buf = Buffer.alloc(0), authed = false;
  s.on('error', () => {});
  s.on('data', d => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 4) {
      const n = buf.readInt32LE(0); if (buf.length < n + 4) break;
      const id = buf.readInt32LE(4), t = buf.readInt32LE(8), body = buf.slice(12, 4 + n - 2).toString(); buf = buf.slice(4 + n);
      if (t === 3) { authed = body === pass; s.write(pk(id, 0, '')); s.write(pk(authed ? id : -1, 2, '')); if (!authed) log('authfail'); continue; }
      if (!authed) continue;
      const c = body.trim();
      if (c === 'status_json') s.write(pk(id, 0, JSON.stringify({ server: { map: 'de_mirage', hostname: 'BERX ARENA', max_players: 12, clients: players } })));
      else if (c === 'status') s.write(pk(id, 0, "hostname: BERX ARENA\nloaded spawngroup(  1)  : SV:  [1: de_mirage | main lump | mapload]\n"));
      else if (c === 'quit') { log('quit'); s.end(); setTimeout(() => process.exit(0), 300); }
      else s.write(pk(id, 0, ''));
    }
  });
}).listen(+port, '127.0.0.1', () => log('listening'));
