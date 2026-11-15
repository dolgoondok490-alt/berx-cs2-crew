// Тестийн хуурамч Supabase (PostgREST-ийн хэрэгтэй хэсэг). Production-д хэрэглэгдэхгүй.
const http = require('http'); const rows = {}; let rpcFail = 0;
let ingestLocal = null; try { ingestLocal = require('../../lib/matches.js').ingestLocal; } catch (e) { /* match history-гүй хувилбар */ } const port = +process.argv[2] || 3399; const KEY = 'sb_secret_TESTKEY123';
http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c;
  const u = new URL(req.url, 'http://x'); const t = u.pathname.split('/').pop();
  if (u.pathname === '/__patch') { const P = JSON.parse(b); rows[u.searchParams.get('t')] = (rows[u.searchParams.get('t')] || []).map(x => String(x[u.searchParams.get('k')]) === u.searchParams.get('v') ? { ...x, ...P } : x); res.writeHead(200); return res.end('{}'); }
  if (u.pathname === '/__insert') { (rows[u.searchParams.get('t')] ||= []).push(JSON.parse(b)); res.writeHead(200); return res.end('{}'); }
  if (u.pathname === '/__rpcfail') { rpcFail = +u.searchParams.get('n') || 0; res.writeHead(200); return res.end('{}'); }   // дараагийн N rpc → 503 (сүлжээ/DB тасалдал)
  if (u.pathname === '/__dump') { res.writeHead(200); return res.end(JSON.stringify(rows)); }
  if (req.headers.apikey !== KEY || req.headers.authorization) { res.writeHead(401); return res.end('{"message":"Invalid API key"}'); }
  if (u.pathname.includes('/realtime/')) { res.writeHead(202); return res.end(); }
  if (u.pathname === '/rest/v1/rpc/berx_ingest_match' && req.method === 'POST') {
    if (rpcFail > 0) { rpcFail--; res.writeHead(503); return res.end('{"message":"Service Unavailable"}'); }
    try { const r = ingestLocal(rows, JSON.parse(b).p); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(r)); }
    catch (e) { res.writeHead(e.status === 409 ? 409 : 400); return res.end(JSON.stringify({ code: e.status === 409 ? '23505' : '22023', message: e.message })); }
  }
  // BERX RANKED (006) функцуудын JS mirror — lib/ranking.js (SQL-тэй тэнцүү эсэхийг tests/ranking/sql.mjs шалгана)
  const RK = { berx_apply_rating: 'applyLocal', berx_adjust_rating: 'adjustLocal', berx_update_ranking_settings: 'settingsLocal', berx_ranking_summary: 'summaryLocal' };
  if (u.pathname.startsWith('/rest/v1/rpc/') && RK[t] && req.method === 'POST') {
    if (rpcFail > 0) { rpcFail--; res.writeHead(503); return res.end('{"message":"Service Unavailable"}'); }
    try { const fn = require('../../lib/ranking.js')[RK[t]]; const r = fn(rows, (JSON.parse(b || '{}') || {}).p || {}); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(r)); }
    catch (e) { res.writeHead(/duplicate key/.test(e.message) ? 409 : 400); return res.end(JSON.stringify({ code: /duplicate key/.test(e.message) ? '23505' : '22023', message: e.message })); }
  }
  rows[t] ||= [];
  const match = (x) => { for (const [k, v] of u.searchParams) { const m = v.match(/^eq\.(.*)$/); if (m && String(x[k]) !== decodeURIComponent(m[1])) return false; const i = v.match(/^in\.\((.*)\)$/); if (i && !i[1].split(',').map(s => decodeURIComponent(s).replace(/^"|"$/g, '')).includes(String(x[k]))) return false;
    const lt = v.match(/^lt\.(.*)$/); if (lt && !(+x[k] < +decodeURIComponent(lt[1]))) return false; const gte = v.match(/^gte\.(.*)$/); if (gte && !(+x[k] >= +decodeURIComponent(gte[1]))) return false; } return true; };
  if (req.method === 'GET') { let r = rows[t].filter(match); const ord = u.searchParams.get('order'); if (ord) { const [col, dir] = ord.split('.'); r = r.slice().sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); } const lim = u.searchParams.get('limit'); if (lim) r = r.slice(0, +lim); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(r)); }
  if (req.method === 'POST') { const row = JSON.parse(b); const oc = u.searchParams.get('on_conflict'); if (oc) { const ks = oc.split(','); const i = rows[t].findIndex(x => ks.every(k => String(x[k]) === String(row[k]))); if (i >= 0) rows[t][i] = { ...rows[t][i], ...row }; else rows[t].push(row); } else rows[t].push(row); res.writeHead(201); return res.end(); }
  if (req.method === 'PATCH') { const p = JSON.parse(b); rows[t] = rows[t].map(x => match(x) ? { ...x, ...p } : x); res.writeHead(204); return res.end(); }
  if (req.method === 'DELETE') { rows[t] = rows[t].filter(x => !match(x)); res.writeHead(204); return res.end(); }
}).listen(port, '127.0.0.1');
