#!/usr/bin/env node
/* =========================================================
 * BERX Agent â€” Ñ‚Ð°Ð½Ñ‹ ÐºÐ¾Ð¼Ð¿ÑŒÑŽÑ‚ÐµÑ€ Ð´ÑÑÑ€ CS2 ÑÐµÑ€Ð²ÐµÑ€Ñ‚ÑÐ¹ Ñ…Ð°Ð¼Ñ‚ Ð°Ð¶Ð¸Ð»Ð»Ð°Ð½Ð°
 * ---------------------------------------------------------
 *   CS2 Dedicated Server  â‡„ (RCON, localhost) â‡„  BERX Agent  â‡„ (HTTPS) â‡„  berx-cs2-crew.vercel.app
 *
 *  â€¢ Ð—Ó©Ð²Ñ…Ó©Ð½ Ð“ÐÐ”ÐÐ“Ð¨ HTTPS Ñ…Ò¯ÑÑÐ»Ñ‚: ÑÐ°Ð¹Ñ‚ Ñ€ÑƒÑƒ Ð¿Ð¾Ñ€Ñ‚ Ð½ÑÑÑ… Ñ…ÑÑ€ÑÐ³Ð³Ò¯Ð¹.
 *  â€¢ RCON Ð½ÑƒÑƒÑ† Ò¯Ð³ ÑÐ½Ñ ÐºÐ¾Ð¼Ð¿ÑŒÑŽÑ‚ÐµÑ€ÑÑÑ Ð³Ð°Ñ€Ð°Ñ…Ð³Ò¯Ð¹ (ÑÐ°Ð¹Ñ‚, GitHub, Supabase-Ð´ Ð±Ð°Ð¹Ñ…Ð³Ò¯Ð¹).
 *  â€¢ Ð¡Ð°Ð¹Ñ‚Ð°Ð°Ñ Ð¸Ñ€ÑÑÐ½ ÐºÐ¾Ð¼Ð°Ð½Ð´Ñ‹Ð³ allowlist-ÑÑÑ€ Ð´Ð°Ñ…Ð¸Ð½ ÑˆÐ°Ð»Ð³Ð°Ð¶, Ð·Ó©Ð²Ñ…Ó©Ð½ Ñ‚Ð¾Ð´Ð¾Ñ€Ñ…Ð¾Ð¹ RCON
 *    ÐºÐ¾Ð¼Ð°Ð½Ð´ÑƒÑƒÐ´ Ñ€ÑƒÑƒ Ñ…Ó©Ñ€Ð²Ò¯Ò¯Ð»Ð½Ñ. Ð”ÑƒÑ€Ñ‹Ð½ RCON Ñ‚ÐµÐºÑÑ‚ Ñ…ÑÐ·ÑÑ Ñ‡ Ð³Ò¯Ð¹Ñ†ÑÑ‚Ð³ÑÑ…Ð³Ò¯Ð¹.
 *  â€¢ Node.js 18+ Ñ…ÑÑ€ÑÐ³Ñ‚ÑÐ¹, npm install Ñ…ÑÑ€ÑÐ³Ð³Ò¯Ð¹.
 *
 *  ÐÐ¶Ð¸Ð»Ð»ÑƒÑƒÐ»Ð°Ñ…:  node agent/berx-agent.js        (Ñ‚Ð¾Ñ…Ð¸Ñ€Ð³Ð¾Ð¾: agent/.env)
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');

const VERSION = '1.2.0';

/* ---------- Ñ‚Ð¾Ñ…Ð¸Ñ€Ð³Ð¾Ð¾ ---------- */
(function loadEnv() {
  // .env (Ò¯Ð½Ð´ÑÑÐ½, Ñ…Ó©Ð½Ð´Ó©Ñ…Ð³Ò¯Ð¹) + .env.skins (SKIN INVENTORY ÑÐ¸Ð½ÐºÐ¸Ð¹Ð½ Ñ‚ÑƒÑÐ´Ð°Ð° Ñ‚Ð¾Ñ…Ð¸Ñ€Ð³Ð¾Ð¾, Ð·Ð°Ð°Ð²Ð°Ð» Ð±Ð¸Ñˆ)
  const main = process.env.BERX_AGENT_ENV || path.join(__dirname, '.env');
  for (const f of [main, path.join(path.dirname(main), '.env.skins')]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  }
})();
const CFG = {
  site: (process.env.BERX_URL || 'https://berx-cs2-crew.vercel.app').replace(/\/$/, ''),
  secret: process.env.SERVER_AGENT_SECRET || '',
  rconHost: process.env.RCON_HOST || '127.0.0.1',
  rconPort: +process.env.RCON_PORT || 27015,
  rconPassword: process.env.RCON_PASSWORD || '',
  publicAddress: process.env.PUBLIC_ADDRESS || '',
  cs2Dir: process.env.CS2_DIR || '',
  eventsPort: +process.env.EVENTS_PORT || 27050,
  pollMs: Math.max(2000, +process.env.POLL_MS || 5000),
  maxPlayers: +process.env.MAX_PLAYERS || 12,
  debug: process.env.DEBUG === '1'
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const dbg = (...a) => CFG.debug && log('[debug]', ...a);
function fatal(msg) { console.error('âœ– ' + msg); process.exit(1); }
if (CFG.secret.length < 24) fatal('SERVER_AGENT_SECRET (24+ Ñ‚ÑÐ¼Ð´ÑÐ³Ñ‚) agent/.env-Ð´ Ñ‚Ð¾Ñ…Ð¸Ñ€ÑƒÑƒÐ»Ð½Ð° ÑƒÑƒ â€” Vercel Ð´ÑÑÑ€Ñ…Ñ‚ÑÐ¹ Ð˜Ð–Ð˜Ð› Ð±Ð°Ð¹Ñ… Ñ‘ÑÑ‚Ð¾Ð¹.');
if (!CFG.rconPassword) fatal('RCON_PASSWORD agent/.env-Ð´ Ñ‚Ð¾Ñ…Ð¸Ñ€ÑƒÑƒÐ»Ð½Ð° ÑƒÑƒ (server.cfg-Ð¸Ð¹Ð½ rcon_password-Ñ‚ÑÐ¹ Ð¸Ð¶Ð¸Ð»).');

/* =========================================================
 * Source RCON client (CS2: -usercon Ð¿Ð°Ñ€Ð°Ð¼ÐµÑ‚Ñ€Ñ‚ÑÐ¹ Ð°ÑÐ°Ð°Ð½Ð°)
 * packet: int32 size | int32 id | int32 type | body\0 | \0
 * ========================================================= */
class Rcon {
  constructor(host, port, password) { Object.assign(this, { host, port, password }); this.sock = null; this.id = 10; this.buf = Buffer.alloc(0); this.pending = new Map(); this.ready = false; }
  packet(id, type, body) {
    const b = Buffer.from(body, 'utf8'); const p = Buffer.alloc(14 + b.length);
    p.writeInt32LE(10 + b.length, 0); p.writeInt32LE(id, 4); p.writeInt32LE(type, 8); b.copy(p, 12); p.writeInt16LE(0, 12 + b.length); return p;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      const fail = (e) => { this.ready = false; reject(e); };
      s.setTimeout(8000, () => { s.destroy(new Error('RCON timeout')); });
      s.once('error', fail);
      s.on('data', (d) => this.onData(d));
      s.on('close', () => { this.ready = false; this.sock = null; for (const [, p] of this.pending) p.reject(new Error('RCON closed')); this.pending.clear(); });
      s.once('connect', () => {
        this.sock = s; s.setTimeout(0);
        const id = ++this.id;
        this.pending.set(id, { auth: true, resolve: () => { this.ready = true; s.removeListener('error', fail); s.on('error', (e) => log('RCON Ð°Ð»Ð´Ð°Ð°:', e.message)); resolve(); }, reject: fail, chunks: [] });
        s.write(this.packet(id, 3, this.password));
      });
    });
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 4) {
      const size = this.buf.readInt32LE(0); if (this.buf.length < size + 4) break;
      const id = this.buf.readInt32LE(4), type = this.buf.readInt32LE(8);
      const body = this.buf.slice(12, 4 + size - 2).toString('utf8');
      this.buf = this.buf.slice(4 + size);
      if (type === 2 && id === -1) { const p = [...this.pending.values()].find(x => x.auth); if (p) p.reject(new Error('RCON Ð½ÑƒÑƒÑ† Ò¯Ð³ Ð±ÑƒÑ€ÑƒÑƒ')); continue; }
      const p = this.pending.get(id);
      if (p && p.auth) { if (type === 2) { this.pending.delete(id); p.resolve(); } continue; }
      if (p) { p.chunks.push(body); clearTimeout(p.t); p.t = setTimeout(() => { this.pending.delete(id); p.resolve(p.chunks.join('')); }, 120); }
      // "end marker": Ñ…Ð¾Ð¾ÑÐ¾Ð½ Ñ…Ò¯ÑÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…Ð°Ñ€Ð¸Ñƒ Ð¸Ñ€Ð²ÑÐ» Ó©Ð¼Ð½Ó©Ñ… Ñ…Ð°Ñ€Ð¸Ñƒ Ð´ÑƒÑƒÑÑÐ°Ð½ Ð³ÑÑÑÐ½ Ò¯Ð³
      const end = [...this.pending.entries()].find(([, x]) => x.endFor === id);
      if (end) { const [eid, e] = end; this.pending.delete(eid); const q = this.pending.get(e.target); if (q) { clearTimeout(q.t); this.pending.delete(e.target); q.resolve(q.chunks.join('')); } }
    }
  }
  exec(cmd, timeout = 5000) {
    if (!this.ready || !this.sock) return Promise.reject(new Error('RCON Ñ…Ð¾Ð»Ð±Ð¾Ð³Ð´Ð¾Ð¾Ð³Ò¯Ð¹'));
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const entry = { resolve, reject, chunks: [] };
      this.pending.set(id, entry);
      const guard = setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve(entry.chunks.join('')); } }, timeout);
      const done = entry.resolve; entry.resolve = (v) => { clearTimeout(guard); done(v); };
      this.sock.write(this.packet(id, 2, cmd));
    });
  }
  close() { try { this.sock && this.sock.destroy(); } catch (e) { /* ignore */ } }
}

/* ---------- state ---------- */
const rcon = new Rcon(CFG.rconHost, CFG.rconPort, CFG.rconPassword);
const state = { online: false, map: null, mode: 'competitive', phase: 'unknown', score: null, players: [], hostname: null, matchzy: false,
  settings: {}, appliedTeamsVersion: null, lastSettingsAt: 0, lastPluginCheck: 0 };
const eventSecret = crypto.randomBytes(16).toString('hex');

async function ensureRcon() {
  if (rcon.ready) return true;
  try {
    await rcon.connect(); log('âœ“ RCON Ñ…Ð¾Ð»Ð±Ð¾Ð³Ð´Ð»Ð¾Ð¾', `${CFG.rconHost}:${CFG.rconPort}`);
    // MatchZy event-Ò¯Ò¯Ð´Ð¸Ð¹Ð³ ÑÐ½Ñ agent Ñ€ÑƒÑƒ (Ð·Ó©Ð²Ñ…Ó©Ð½ localhost) Ð¸Ð»Ð³ÑÑÐ»Ð³ÑÐ½Ñ
    await rcon.exec(`matchzy_remote_log_url "http://127.0.0.1:${CFG.eventsPort}/matchzy"`).catch(() => {});
    await rcon.exec('matchzy_remote_log_header_key "X-Berx-Agent"').catch(() => {});
    await rcon.exec(`matchzy_remote_log_header_value "${eventSecret}"`).catch(() => {});
    state.lastPluginCheck = 0; state.lastMapCheck = 0;
    return true;
  } catch (e) { if (state.online !== false) log('âœ– RCON Ñ…Ð¾Ð»Ð±Ð¾Ð³Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹:', e.message); rcon.close(); return false; }
}

/* ---------- ÑÐµÑ€Ð²ÐµÑ€Ð¸Ð¹Ð½ Ð¼ÑÐ´ÑÑÐ»ÑÐ» ÑƒÐ½ÑˆÐ¸Ñ… ---------- */
const TEAMNUM = { 1: 'SPEC', 2: 'T', 3: 'CT' };
function normTeam(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return TEAMNUM[v] || null;
  const s = String(v).toLowerCase();
  if (s.includes('counter') || s === 'ct' || s === '3') return 'CT';
  if (s.includes('terror') || s === 't' || s === '2') return 'T';
  if (s.includes('spec') || s === '1') return 'SPEC';
  return null;
}
function steam64(v) {
  if (!v) return null; const s = String(v);
  if (/^7656119\d{10}$/.test(s)) return s;
  const m = s.match(/\[U:1:(\d+)\]/); if (m) return (BigInt(m[1]) + 76561197960265728n).toString();
  const m2 = s.match(/STEAM_\d:(\d):(\d+)/); if (m2) return (BigInt(m2[2]) * 2n + BigInt(m2[1]) + 76561197960265728n).toString();
  return null;
}
async function readStatus() {
  // 1) status_json (CS2) â€” Ð±Ò¯Ñ‚ÑÑ† Ð½ÑŒ ÑˆÐ¸Ð½ÑÑ‡Ð»ÑÐ»ÑÑÑ€ Ó©Ó©Ñ€Ñ‡Ð»Ó©Ð³Ð´Ó©Ð¶ Ð±Ð¾Ð»Ð¾Ñ… Ñ‚ÑƒÐ» ÑƒÑÐ½ Ñ…Ð°Ñ‚Ð°Ð½ ÑƒÐ½ÑˆÐ¸Ð½Ð°
  const raw = await rcon.exec('status_json').catch(() => '');
  const i = raw.indexOf('{');
  if (i >= 0) {
    try {
      const j = JSON.parse(raw.slice(i, raw.lastIndexOf('}') + 1));
      dbg('status_json keys:', Object.keys(j), j.server ? Object.keys(j.server) : '');
      const srv = j.server || j;
      const list = srv.clients || j.clients || srv.players || j.players || [];
      state.map = srv.map || srv.map_name || j.map || state.map;
      state.hostname = srv.hostname || srv.name || state.hostname;
      state.players = (Array.isArray(list) ? list : []).map(p => ({
        name: p.name || p.player_name || '?', steamId: steam64(p.steamid64 || p.steamid || p.xuid || p.steam_id || p.accountid && `[U:1:${p.accountid}]`),
        bot: !!(p.bot || p.is_bot || p.fakeplayer || p.isbot), ping: p.ping ?? p.latency ?? null,
        team: normTeam(p.team ?? p.teamnum ?? p.team_num ?? p.team_name), userid: p.userid ?? p.user_id ?? p.slot ?? p.id ?? null
      })).filter(p => p.name !== 'SourceTV');
      return;
    } catch (e) { dbg('status_json parse Ð°Ð»Ð´Ð°Ð°', e.message); }
  }
  // 2) ÑÐ½Ð³Ð¸Ð¹Ð½ status (SteamID Ð±Ð°Ð¹Ñ…Ð³Ò¯Ð¹ Ð±Ð°Ð¹Ð¶ Ð±Ð¾Ð»Ð½Ð¾)
  const s = await rcon.exec('status');
  const mm = s.match(/\[1:\s*([\w]+)\s*\|/) || s.match(/map\s*:\s*([\w]+)/i); if (mm) state.map = mm[1];
  const hm = s.match(/hostname\s*:\s*(.+)/i); if (hm) state.hostname = hm[1].trim();
  const rows = []; for (const line of s.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\w+)\s+\d+\s*(\S*)\s+'(.*)'\s*$/);
    if (m && m[1] !== '65535') rows.push({ userid: +m[1], ping: +m[3], name: m[7], bot: m[6] === '' || /BOT/i.test(m[2]), steamId: null, team: null });
  }
  state.players = rows;
}
const SETTINGS = ['mp_roundtime', 'mp_maxrounds', 'mp_startmoney', 'mp_freezetime', 'mp_friendlyfire', 'mp_overtime_enable', 'sv_infinite_ammo', 'game_mode', 'game_type'];
async function readSettings() {
  const out = {};
  for (const c of SETTINGS) { const r = await rcon.exec(c).catch(() => ''); const m = r.match(new RegExp(c + '\\s*=\\s*([\\-\\d.]+|true|false)', 'i')); if (m) out[c] = m[1]; }
  state.settings = out;
  const gm = +out.game_mode, gt = +out.game_type;
  if (gt === 0 && gm === 2) state.mode = 'wingman'; else if (state.mode === 'wingman') state.mode = 'competitive';
}
async function checkPlugins() {
  const r = await rcon.exec('css_plugins list').catch(() => '');
  state.matchzy = /matchzy/i.test(r);
}

/* ---------- MatchZy event-Ò¯Ò¯Ð´ (localhost HTTP) ---------- */
http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/matchzy' || req.headers['x-berx-agent'] !== eventSecret) { res.writeHead(404); return res.end(); }
  let body = ''; req.on('data', c => { body += c; if (body.length > 2e5) req.destroy(); });
  req.on('end', () => {
    res.writeHead(200); res.end('ok');
    let e; try { e = JSON.parse(body); } catch { return; }
    const ev = String(e.event || '').toLowerCase(); dbg('MatchZy event', ev);
    const sideOf = (t, def) => normTeam(t && t.side) || def;
    const scoreFrom = () => {
      const t1 = e.team1 || {}, t2 = e.team2 || {};
      if (t1.score === undefined && t2.score === undefined) return;
      const s1 = sideOf(t1, 'CT'), sc = { ct: 0, t: 0 };
      sc[s1 === 'CT' ? 'ct' : 't'] = +t1.score || 0; sc[s1 === 'CT' ? 't' : 'ct'] = +t2.score || 0; state.score = sc;
    };
    if (ev === 'going_live' || ev === 'round_end' || ev === 'round_start') { state.phase = 'live'; scoreFrom(); }
    else if (ev === 'map_result' || ev === 'series_end') { state.phase = 'finished'; scoreFrom(); }
    else if (ev === 'series_start' || ev === 'match_config_load' || ev === 'knife_round_start') { state.phase = ev === 'knife_round_start' ? 'live' : 'warmup'; state.score = { ct: 0, t: 0 }; }
    else if (ev === 'map_picked' || ev === 'side_picked') { /* ignore */ }
    heartbeat().catch(() => {});
  });
}).listen(CFG.eventsPort, '127.0.0.1', () => log(`âœ“ MatchZy event ÑÐ¾Ð½ÑÐ¾Ð¶ Ð±Ð°Ð¹Ð½Ð°: 127.0.0.1:${CFG.eventsPort}`))
  .on('error', (e) => log('âš  Event port Ð½ÑÑÐ³Ð´ÑÑÐ½Ð³Ò¯Ð¹:', e.message));

/* ---------- Allowlist: ÑÐ°Ð¹Ñ‚Ñ‹Ð½ ÐºÐ¾Ð¼Ð°Ð½Ð´ â†’ RCON ---------- */
const MAPS = { mirage: 'de_mirage', dust2: 'de_dust2', inferno: 'de_inferno', nuke: 'de_nuke', ancient: 'de_ancient', anubis: 'de_anubis', cache: 'de_cache' };
// Ð¡ÐµÑ€Ð²ÐµÑ€Ñ‚ ÑÑƒÑƒÐ³Ð°Ð°Ð³Ò¯Ð¹ map-Ñ‹Ð³ Workshop-Ð¾Ð¾Ñ Ð°Ñ‡Ð°Ð°Ð»Ð°Ñ… (Ð·Ð°Ð°Ð²Ð°Ð» Ð±Ð¸Ñˆ): agent/.env-Ð´ WORKSHOP_CACHE=<workshop id> Ð³ÑÑ… Ð¼ÑÑ‚
const WORKSHOP = Object.fromEntries(Object.keys(MAPS).map(id => [id, process.env['WORKSHOP_' + id.toUpperCase()]]).filter(([, v]) => /^\d{6,12}$/.test(v || '')));

/* ---------- Map ÑÐµÑ€Ð²ÐµÑ€Ñ‚ ÑÑƒÑƒÑÐ°Ð½ ÑÑÑÑ…Ð¸Ð¹Ð³ ÑˆÐ°Ð»Ð³Ð°Ñ… (Ñ‚Ð°Ð°Ð¼Ð°Ð³Ð»Ð°Ñ…Ð³Ò¯Ð¹) ----------
 *  1) CS2_DIR Ñ‚Ð¾Ñ…Ð¸Ñ€ÑƒÑƒÐ»ÑÐ°Ð½ Ð±Ð¾Ð»: game/csgo/maps/<map>.vpk Ñ„Ð°Ð¹Ð» Ð±Ð°Ð¹Ð³Ð°Ð° ÑÑÑÑ…
 *  2) Ò¯Ð³Ò¯Ð¹ Ð±Ð¾Ð» RCON "maps *" Ð¶Ð°Ð³ÑÐ°Ð°Ð»Ñ‚
 *  3) Ð°Ð»ÑŒ Ð½ÑŒ Ñ‡ Ð±Ð¾Ð»Ð¾Ñ…Ð³Ò¯Ð¹ Ð±Ð¾Ð» Ñ‚Ð¾Ð´Ð¾Ñ€Ñ…Ð¾Ð¹Ð³Ò¯Ð¹ (null) â€” ÑÐ°Ð¹Ñ‚ Ð°Ð½Ñ…Ð°Ð°Ñ€ÑƒÑƒÐ»Ð³Ð° Ñ…Ð°Ñ€ÑƒÑƒÐ»Ð°Ñ…Ð³Ò¯Ð¹, changelevel-Ð¸Ð¹Ð½ Ñ…Ð°Ñ€Ð¸ÑƒÐ³Ð°Ð°Ñ€ ÑˆÐ°Ð»Ð³Ð°Ð½Ð° */
let installed = null;
async function checkMaps() {
  const dir = CFG.cs2Dir && path.join(CFG.cs2Dir, 'game', 'csgo', 'maps');
  if (dir && fs.existsSync(dir)) {
    installed = Object.fromEntries(Object.entries(MAPS).map(([id, m]) => [id, fs.existsSync(path.join(dir, m + '.vpk')) || fs.existsSync(path.join(dir, m + '.bsp'))]));
  } else {
    const r = await rcon.exec('maps *').catch(() => '');
    installed = /\bde_\w+/.test(r) ? Object.fromEntries(Object.entries(MAPS).map(([id, m]) => [id, new RegExp('\\b' + m + '\\b').test(r)])) : null;
  }
  const missing = installed ? Object.keys(installed).filter(id => !installed[id]) : [];
  if (missing.length) log('âš  Ð¡ÐµÑ€Ð²ÐµÑ€Ñ‚ ÑÑƒÑƒÐ³Ð°Ð°Ð³Ò¯Ð¹ map:', missing.map(id => MAPS[id] + (WORKSHOP[id] ? ` (Workshop ${WORKSHOP[id]} Ð°ÑˆÐ¸Ð³Ð»Ð°Ð½Ð°)` : '')).join(', '));
  dbg('maps installed:', installed);
}
const mapsAvailable = () => installed ? Object.fromEntries(Object.keys(MAPS).map(id => [id, !!(installed[id] || WORKSHOP[id])])) : null;
const n = (v, min, max) => { const x = Math.round(Number(v)); if (!Number.isFinite(x) || x < min || x > max) throw new Error(`ÑƒÑ‚Ð³Ð° ${min}-${max}`); return x; };
const b = (v) => (v === true || v === 1 || v === '1' || v === 'true');
const curMap = () => (state.map && /^[\w]+$/.test(state.map) ? state.map : 'de_mirage');
const PRACTICE = ['sv_cheats 1', 'mp_limitteams 0', 'mp_autoteambalance 0', 'mp_freezetime 0', 'mp_roundtime 60', 'mp_roundtime_defuse 60', 'mp_buy_anywhere 1',
  'mp_buytime 9999', 'mp_maxmoney 60000', 'mp_startmoney 60000', 'sv_infinite_ammo 1', 'ammo_grenade_limit_total 5', 'sv_grenade_trajectory_prac_pipreview 1', 'mp_warmup_end', 'mp_restartgame 1'];
const HANDLERS = {
  changemap: (a) => {
    const m = MAPS[a.map]; if (!m) throw new Error('map Ð·Ó©Ð²ÑˆÓ©Ó©Ñ€Ó©Ð³Ð´Ó©Ó©Ð³Ò¯Ð¹');
    const cmd = installed && installed[a.map] === false
      ? (WORKSHOP[a.map] ? `host_workshop_map ${WORKSHOP[a.map]}` : null)
      : `changelevel ${m}`;
    if (!cmd) throw new Error(`${m} ÑÐµÑ€Ð²ÐµÑ€Ñ‚ ÑÑƒÑƒÐ³Ð°Ð°Ð³Ò¯Ð¹ Ð±Ð°Ð¹Ð½Ð°. SteamCMD-ÑÑÑ€ CS2-Ð¾Ð¾ ÑˆÐ¸Ð½ÑÑ‡Ð¸Ð»Ð½Ñ Ò¯Ò¯ (app_update 730 validate).`);
    state.score = null; state.phase = 'warmup'; return [cmd];
  },
  mode: (a) => {
    if (a.value === 'competitive') { state.mode = 'competitive'; return ['game_type 0', 'game_mode 1', 'sv_cheats 0', `changelevel ${curMap()}`]; }
    if (a.value === 'wingman') { state.mode = 'wingman'; return ['game_type 0', 'game_mode 2', 'sv_cheats 0', `changelevel ${curMap()}`]; }
    if (a.value === '1v1') { state.mode = '1v1'; return ['game_type 0', 'game_mode 1', 'sv_cheats 0', 'mp_maxrounds 16', 'mp_overtime_enable 1', `changelevel ${curMap()}`]; }
    if (a.value === 'practice') { state.mode = 'practice'; state.phase = 'practice'; return PRACTICE; }
    throw new Error('Ð³Ð¾Ñ€Ð¸Ð¼ Ð·Ó©Ð²ÑˆÓ©Ó©Ñ€Ó©Ð³Ð´Ó©Ó©Ð³Ò¯Ð¹');
  },
  roundtime: (a) => { const v = n(a.value, 1, 60); return [`mp_roundtime ${v}`, `mp_roundtime_defuse ${v}`, `mp_roundtime_hostage ${v}`]; },
  maxrounds: (a) => [`mp_maxrounds ${n(a.value, 1, 60)}`],
  startmoney: (a) => [`mp_startmoney ${n(a.value, 0, 60000)}`],
  freezetime: (a) => [`mp_freezetime ${n(a.value, 0, 60)}`],
  friendlyfire: (a) => [`mp_friendlyfire ${b(a.value) ? 1 : 0}`],
  overtime: (a) => [`mp_overtime_enable ${b(a.value) ? 1 : 0}`],
  knife: (a) => { if (!state.matchzy) throw new Error('Knife round-Ð´ MatchZy plugin Ñ…ÑÑ€ÑÐ³Ñ‚ÑÐ¹'); return [`matchzy_knife_enabled_default ${b(a.value) ? 'true' : 'false'}`]; },
  infinite_ammo: (a) => b(a.value) ? ['sv_cheats 1', 'sv_infinite_ammo 1'] : ['sv_infinite_ammo 0'],
  bot_add: (a) => [a.team === 'T' ? 'bot_add_t' : 'bot_add_ct'],
  bot_kick: () => ['bot_kick'],
  warmup_start: () => { state.phase = 'warmup'; return ['mp_warmup_start']; },
  warmup_end: () => ['mp_warmup_end'],
  match_start: () => { state.score = { ct: 0, t: 0 }; return state.matchzy ? ['css_start'] : ['mp_warmup_end', 'mp_restartgame 1']; },
  match_restart: () => { state.score = { ct: 0, t: 0 }; return ['mp_restartgame 1']; },
  match_stop: () => { state.phase = 'finished'; return state.matchzy ? ['css_restart'] : ['mp_warmup_start']; },
  kick: (a) => {
    const p = state.players.find(x => x.steamId === a.steamId);
    if (!p) throw new Error('Ð¢Ð¾Ð³Ð»Ð¾Ð³Ñ‡ ÑÐµÑ€Ð²ÐµÑ€Ñ‚ Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹');
    if (p.userid === null || p.userid === undefined || !/^\d+$/.test(String(p.userid))) throw new Error('userid Ñ‚Ð¾Ð´Ð¾Ñ€Ñ…Ð¾Ð¹Ð³Ò¯Ð¹');
    return [`kickid ${p.userid}`];
  }
};

let lastTeams = { teams: { CT: [], T: [], SPEC: [] }, version: null };
function writeMatchConfig() {
  if (!state.matchzy) throw new Error('Ð‘Ð°Ð³Ð¸Ð¹Ð³ SteamID64-ÑÑÑ€ Ñ‚Ò¯Ð³Ð¶Ð¸Ñ…ÑÐ´ MatchZy plugin Ñ…ÑÑ€ÑÐ³Ñ‚ÑÐ¹');
  if (!CFG.cs2Dir) throw new Error('CS2_DIR Ñ‚Ð¾Ñ…Ð¸Ñ€ÑƒÑƒÐ»Ð°Ð°Ð³Ò¯Ð¹ (agent/.env)');
  const dir = path.join(CFG.cs2Dir, 'game', 'csgo');
  if (!fs.existsSync(dir)) throw new Error('CS2_DIR Ð±ÑƒÑ€ÑƒÑƒ: ' + dir + ' Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹');
  const t = lastTeams.teams;
  const pl = (arr) => Object.fromEntries(arr.filter(p => /^7656119\d{10}$/.test(p.steamId || '')).map(p => [p.steamId, String(p.nick).replace(/["\\]/g, '').slice(0, 24)]));
  const per = Math.max(1, t.CT.length, t.T.length);
  const cfg = {
    matchid: 'berx-' + Date.now(), num_maps: 1, maplist: [curMap()], map_sides: ['team1_ct'], skip_veto: true, clinch_series: true,
    players_per_team: state.mode === 'wingman' ? Math.min(2, per) : state.mode === '1v1' ? 1 : Math.min(5, per),
    team1: { name: 'BERX CT', players: pl(t.CT) }, team2: { name: 'BERX T', players: pl(t.T) },
    spectators: { players: pl(t.SPEC) }
  };
  fs.writeFileSync(path.join(dir, 'berx_match.json'), JSON.stringify(cfg, null, 2));
  return ['matchzy_loadmatch berx_match.json'];
}

async function runCommand(c) {
  try {
    let cmds;
    if (c.type === 'apply_teams') cmds = writeMatchConfig();
    else { const h = HANDLERS[c.type]; if (!h) throw new Error('Ð—Ó©Ð²ÑˆÓ©Ó©Ñ€Ó©Ð³Ð´Ó©Ó©Ð³Ò¯Ð¹ ÐºÐ¾Ð¼Ð°Ð½Ð´: ' + c.type); cmds = h(c.args || {}); }
    let out = '';
    for (const x of cmds) { if (!/^[\w .:"\-]+$/.test(x)) throw new Error('ÐÑŽÑƒÐ»Ñ‚Ð°Ð¹ Ñ‚ÑÐ¼Ð´ÑÐ³Ñ‚'); out += (await rcon.exec(x)).slice(0, 300); }
    if (c.type === 'apply_teams') state.appliedTeamsVersion = lastTeams.version;
    if (/Unknown command/i.test(out)) throw new Error('Ð¡ÐµÑ€Ð²ÐµÑ€ ÐºÐ¾Ð¼Ð°Ð½Ð´Ñ‹Ð³ Ñ‚Ð°Ð½Ð¸Ñ…Ð³Ò¯Ð¹ Ð±Ð°Ð¹Ð½Ð°: ' + out.trim().slice(0, 160));
    if (/changelevel failed|failed to load|map not found|not found on server|invalid map/i.test(out)) throw new Error('Map Ð°Ñ‡Ð°Ð°Ð»Ð°Ð³Ð´ÑÐ°Ð½Ð³Ò¯Ð¹: ' + out.trim().slice(0, 160));
    log('âœ“', c.type, JSON.stringify(c.args || {}));
    state.lastSettingsAt = 0;
    return { ok: true, output: out.trim().slice(0, 500) };
  } catch (e) { log('âœ–', c.type, e.message); return { ok: false, output: e.message }; }
}

/* ---------- ÑÐ°Ð¹Ñ‚Ñ‚Ð°Ð¹ Ñ…Ð°Ñ€Ð¸Ð»Ñ†Ð°Ñ… ---------- */
async function api(pathname, body) {
  const r = await fetch(CFG.site + '/api/server/agent/' + pathname, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + CFG.secret, 'Content-Type': 'application/json', 'User-Agent': 'berx-agent/' + VERSION,
...(CFG.site === 'https://berx-cs2-crew-git-skins-inventory-berx.vercel.app' && process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
    : {}) },
    body: body ? JSON.stringify(body) : undefined, redirect: CFG.site.includes('git-skins-inventory') ? 'error' : 'follow', signal: AbortSignal.timeout(15000)
  });
  if (r.status === 401) throw new Error('Ð¡Ð°Ð¹Ñ‚ agent-Ð¸Ð¹Ð³ Ñ‚Ð°Ð½Ð¸Ñ…Ð³Ò¯Ð¹ Ð±Ð°Ð¹Ð½Ð° â€” SERVER_AGENT_SECRET Vercel Ð´ÑÑÑ€Ñ…Ñ‚ÑÐ¹ Ñ‚Ð°Ð°Ñ€Ð°Ñ…Ð³Ò¯Ð¹ Ð±Ð°Ð¹Ð½Ð°');
  if (!r.ok) throw new Error('Ð¡Ð°Ð¹Ñ‚ ' + r.status);
  return r.json();
}
async function heartbeat() {
  const humans = state.players.filter(p => !p.bot);
  return api('heartbeat', {
    online: state.online, map: state.map, mode: state.mode, phase: state.phase, score: state.score,
    players: state.players, maxPlayers: CFG.maxPlayers, address: CFG.publicAddress || null, hostname: state.hostname,
    matchzy: state.matchzy, appliedTeamsVersion: state.appliedTeamsVersion, settings: state.settings, agentVersion: VERSION, humans: humans.length, mapsAvailable: mapsAvailable(),
    skins: skins && skins.enabled ? skins.status() : undefined
  });
}

let busy = false, lastErr = '';
async function tick() {
  if (busy) return; busy = true;
  try {
    state.online = await ensureRcon();
    if (state.online) {
      try {
        await readStatus();
        if (Date.now() - state.lastPluginCheck > 60e3) { await checkPlugins(); state.lastPluginCheck = Date.now(); }
        if (!state.lastMapCheck || Date.now() - state.lastMapCheck > 600e3) { await checkMaps(); state.lastMapCheck = Date.now(); }
        if (Date.now() - state.lastSettingsAt > 30e3) { await readSettings(); state.lastSettingsAt = Date.now(); }
      } catch (e) { log('âš  Ð¢Ó©Ð»Ó©Ð² ÑƒÐ½ÑˆÐ¸Ñ…Ð°Ð´ Ð°Ð»Ð´Ð°Ð°:', e.message); }
    } else { state.players = []; }
    await heartbeat();
    const poll = await api('poll');
    if (poll.teams) lastTeams = { teams: poll.teams, version: poll.teamsVersion };
    for (const c of poll.commands || []) {
      const res = state.online ? await runCommand(c) : { ok: false, output: 'Ð¡ÐµÑ€Ð²ÐµÑ€ offline (RCON Ñ…Ð¾Ð»Ð±Ð¾Ð³Ð´Ð¾Ð¾Ð³Ò¯Ð¹)' };
      await api('result', { id: c.id, ...res });
    }
    if (lastErr) { log('âœ“ Ð¡Ð°Ð¹Ñ‚Ñ‚Ð°Ð¹ Ñ…Ð¾Ð»Ð±Ð¾Ð»Ñ‚ ÑÑÑ€Ð³ÑÐ»ÑÑ'); lastErr = ''; }
  } catch (e) { if (e.message !== lastErr) log('âœ–', e.message); lastErr = e.message; }
  finally { busy = false; }
}

/* ---------- SKIN INVENTORY ÑÐ¸Ð½Ðº (Ð·Ð°Ð°Ð²Ð°Ð» Ð±Ð¸Ñˆ, Ð°Ð½Ñ…Ð´Ð°Ð³Ñ‡Ð°Ð°Ñ€ ÑƒÐ½Ñ‚Ñ€Ð°Ð°Ð»Ñ‚Ñ‚Ð°Ð¹) ---------- */
let skins = null;
try {
  const { createSkinsSync } = require('./skins-sync');
  skins = createSkinsSync({ env: process.env, api: (p, body) => api(p, body), rconExec: (c) => rcon.exec(c), getPlayers: () => state.players, log });
  if (skins.enabled) setInterval(() => { skins.tick().catch(e => log('âœ– Skins:', e.message)); }, skins.pollMs || 10000).unref();
} catch (e) { if (process.env.SKINS_SYNC_ENABLED === '1') log('âœ– Skins Ð¼Ð¾Ð´ÑƒÐ»ÑŒ Ð°Ñ‡Ð°Ð°Ð»Ð°Ð³Ð´ÑÐ°Ð½Ð³Ò¯Ð¹:', e.message); }

log(`BERX Agent v${VERSION} â†’ ${CFG.site}`);
log(`RCON ${CFG.rconHost}:${CFG.rconPort} Â· public: ${CFG.publicAddress || '(Ñ‚Ð¾Ñ…Ð¸Ñ€ÑƒÑƒÐ»Ð°Ð°Ð³Ò¯Ð¹)'} Â· CS2_DIR: ${CFG.cs2Dir || '(Ñ‚Ð¾Ñ…Ð¸Ñ€ÑƒÑƒÐ»Ð°Ð°Ð³Ò¯Ð¹)'}`);
tick(); setInterval(tick, CFG.pollMs);
let stopping = false;
const bye = async () => {
  if (stopping) return; stopping = true;
  log('Ð—Ð¾Ð³ÑÐ¾Ð¶ Ð±Ð°Ð¹Ð½Ð°... (ÑÐ°Ð¹Ñ‚Ð°Ð´ offline Ð¸Ð»Ð³ÑÑÐ½Ñ)'); state.online = false; state.players = [];
  try { await Promise.race([heartbeat(), new Promise(r => setTimeout(r, 5000))]); } catch (e) { /* ignore */ }
  process.exit(0);
};
process.on('SIGINT', bye); process.on('SIGTERM', bye);

/* BERX ARENA Launcher-Ð¸Ð¹Ð½ Ð°ÑŽÑƒÐ»Ð³Ò¯Ð¹ Ð·Ð¾Ð³ÑÐ¾Ð¾Ñ… Ð´Ð¾Ñ…Ð¸Ð¾: agent Ñ…Ð°Ð²Ñ‚ÑÐ°Ð½Ð´ ".berx-stop" Ñ„Ð°Ð¹Ð» Ò¯Ò¯ÑÐ²ÑÐ» Ð·Ð¾Ð³ÑÐ¾Ð½Ð¾ */
const STOP_FILE = process.env.BERX_AGENT_STOP_FILE || path.join(__dirname, '.berx-stop');
try { fs.unlinkSync(STOP_FILE); } catch (e) { /* Ñ…ÑƒÑƒÑ‡Ð¸Ð½ Ð´Ð¾Ñ…Ð¸Ð¾ */ }
setInterval(() => { if (fs.existsSync(STOP_FILE)) { try { fs.unlinkSync(STOP_FILE); } catch (e) { /* ignore */ } log('Launcher-ÑÑÑ Ð·Ð¾Ð³ÑÐ¾Ð¾Ñ… Ð´Ð¾Ñ…Ð¸Ð¾ Ð¸Ñ€Ð»ÑÑ'); bye(); } }, 1000).unref();

module.exports = { Rcon, HANDLERS, steam64, normTeam };

