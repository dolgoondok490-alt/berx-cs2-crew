/* =========================================================
 * Локал хөгжүүлэлтийн server (Node 18+, dependency байхгүй)
 *   node server/server.js   →  http://localhost:3000
 * Production-д Vercel ашиглана (api/index.js). Логик нь адилхан: lib/handler.js
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

// .env (repo root эсвэл server/) уншина
for (const f of [path.join(__dirname, '..', '.env'), path.join(__dirname, '.env')]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const PORT = +process.env.PORT || 3000;
const { handle } = require('../lib/handler');
const db = require('../lib/db');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
const PRIVATE = ['server', 'lib', 'api', 'data', 'supabase', 'node_modules'].map(d => path.join(ROOT, d));

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handle(req, res);
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep) || PRIVATE.some(d => file.startsWith(d)) || path.basename(file).startsWith('.')) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`BERX CS2 CREW → http://localhost:${PORT}`);
  console.log(`DB: ${db.name === 'supabase' ? 'Supabase' : 'local data/db.json'}`);
});
