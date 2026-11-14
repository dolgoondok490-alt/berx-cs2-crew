#!/usr/bin/env node
/* =========================================================
 * BERX Agent — таны компьютер дээр CS2 сервертэй хамт ажиллана
 * ---------------------------------------------------------
 *   CS2 Dedicated Server  ⇄ (RCON, localhost) ⇄  BERX Agent  ⇄ (HTTPS) ⇄  berx-cs2-crew.vercel.app
 *
 *  • Зөвхөн ГАДАГШ HTTPS хүсэлт: сайт руу порт нээх хэрэггүй.
 *  • RCON нууц үг энэ компьютерээс гарахгүй (сайт, GitHub, Supabase-д байхгүй).
 *  • Сайтаас ирсэн командыг allowlist-ээр дахин шалгаж, зөвхөн тодорхой RCON
 *    командууд руу хөрвүүлнэ. Дурын RCON текст хэзээ ч гүйцэтгэхгүй.
 *  • Node.js 18+ хэрэгтэй, npm install хэрэггүй.
 *
 *  Ажиллуулах:  node agent/berx-agent.js        (тохиргоо: agent/.env)
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');

const VERSION = '1.3.1';

/* ---------- тохиргоо ---------- */
(function loadEnv() {
  // .env (үндсэн, хөндөхгүй) + .env.skins (SKIN INVENTORY синкийн тусдаа тохиргоо, заавал биш)
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
function fatal(msg) { console.error('✖ ' + msg); process.exit(1); }
if (CFG.secret.length < 24) fatal('SERVER_AGENT_SECRET (24+ тэмдэгт) agent/.env-д тохируулна уу — Vercel дээрхтэй ИЖИЛ байх ёстой.');
if (!CFG.rconPassword) fatal('RCON_PASSWORD agent/.env-д тохируулна уу (server.cfg-ийн rcon_password-тэй ижил).');

/* =========================================================
 * Source RCON client (CS2: -usercon параметртэй асаана)
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
        this.pending.set(id, { auth: true, resolve: () => { this.ready = true; s.removeListener('error', fail); s.on('error', (e) => log('RCON алдаа:', e.message)); resolve(); }, reject: fail, chunks: [] });
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
      if (type === 2 && id === -1) { const p = [...this.pending.values()].find(x => x.auth); if (p) p.reject(new Error('RCON нууц үг буруу')); continue; }
      const p = this.pending.get(id);
      if (p && p.auth) { if (type === 2) { this.pending.delete(id); p.resolve(); } continue; }
      if (p) { p.chunks.push(body); clearTimeout(p.t); p.t = setTimeout(() => { this.pending.delete(id); p.resolve(p.chunks.join('')); }, 120); }
      // "end marker": хоосон хүсэлтийн хариу ирвэл өмнөх хариу дууссан гэсэн үг
      const end = [...this.pending.entries()].find(([, x]) => x.endFor === id);
      if (end) { const [eid, e] = end; this.pending.delete(eid); const q = this.pending.get(e.target); if (q) { clearTimeout(q.t); this.pending.delete(e.target); q.resolve(q.chunks.join('')); } }
    }
  }
  exec(cmd, timeout = 5000) {
    if (!this.ready || !this.sock) return Promise.reject(new Error('RCON холбогдоогүй'));
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
    await rcon.connect(); log('✓ RCON холбогдлоо', `${CFG.rconHost}:${CFG.rconPort}`);
    // MatchZy event-үүдийг энэ agent руу (зөвхөн localhost) илгээлгэнэ
    await rcon.exec(`matchzy_remote_log_url "http://127.0.0.1:${CFG.eventsPort}/matchzy"`).catch(() => {});
    await rcon.exec('matchzy_remote_log_header_key "X-Berx-Agent"').catch(() => {});
    await rcon.exec(`matchzy_remote_log_header_value "${eventSecret}"`).catch(() => {});
    state.lastPluginCheck = 0; state.lastMapCheck = 0;
    return true;
  } catch (e) { if (state.online !== false) log('✖ RCON холбогдсонгүй:', e.message); rcon.close(); return false; }
}

/* ---------- серверийн мэдээлэл унших ---------- */
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
  // 1) status_json (CS2) — бүтэц нь шинэчлэлээр өөрчлөгдөж болох тул уян хатан уншина
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
      return true;
    } catch (e) { dbg('status_json parse алдаа', e.message); }
  }
  // 2) энгийн status (SteamID байхгүй байж болно)
  const s = await rcon.exec('status');
  if (!s || !s.trim()) return false;   // сервер завгүй (жишээ нь Workshop map татаж/ачаалж байна)
  const mm = s.match(/\[1:\s*([\w]+)\s*\|/) || s.match(/map\s*:\s*([\w]+)/i); if (mm) state.map = mm[1];
  const hm = s.match(/hostname\s*:\s*(.+)/i); if (hm) state.hostname = hm[1].trim();
  const rows = []; for (const line of s.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\w+)\s+\d+\s*(\S*)\s+'(.*)'\s*$/);
    if (m && m[1] !== '65535') rows.push({ userid: +m[1], ping: +m[3], name: m[7], bot: m[6] === '' || /BOT/i.test(m[2]), steamId: null, team: null });
  }
  state.players = rows;
  return true;
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

/* ---------- MatchZy event-үүд (localhost HTTP) ---------- */
http.createServer((req, res) => {
  // CS2 server log (AIM горимын оноо): logaddress_add_http "http://127.0.0.1:<EVENTS_PORT>/cs2log/<token>" — token нь зөвхөн энэ agent-д
  if (req.method === 'POST' && typeof onCs2Log === 'function' && arenaLogToken() && req.url === '/cs2log/' + arenaLogToken()) {
    let body = ''; req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => { res.writeHead(200); res.end('ok'); try { onCs2Log(body); } catch (e) { dbg('cs2log', e.message); } });
    return;
  }
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
}).listen(CFG.eventsPort, '127.0.0.1', () => log(`✓ MatchZy event сонсож байна: 127.0.0.1:${CFG.eventsPort}`))
  .on('error', (e) => log('⚠ Event port нээгдсэнгүй:', e.message));

/* ---------- Allowlist: сайтын команд → RCON ---------- */
const MAPS = { mirage: 'de_mirage', dust2: 'de_dust2', inferno: 'de_inferno', nuke: 'de_nuke', ancient: 'de_ancient', anubis: 'de_anubis', cache: 'de_cache' };
// Серверт суугаагүй map-ыг Workshop-оос ачаалах (заавал биш): agent/.env-д WORKSHOP_CACHE=<workshop id> гэх мэт
const WORKSHOP = Object.fromEntries(Object.keys(MAPS).map(id => [id, process.env['WORKSHOP_' + id.toUpperCase()]]).filter(([, v]) => /^\d{6,12}$/.test(v || '')));

/* ---------- Map серверт суусан эсэхийг шалгах (таамаглахгүй) ----------
 *  1) CS2_DIR тохируулсан бол: game/csgo/maps/<map>.vpk файл байгаа эсэх
 *  2) үгүй бол RCON "maps *" жагсаалт
 *  3) аль нь ч болохгүй бол тодорхойгүй (null) — сайт анхааруулга харуулахгүй, changelevel-ийн хариугаар шалгана */
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
  if (missing.length) log('⚠ Серверт суугаагүй map:', missing.map(id => MAPS[id] + (WORKSHOP[id] ? ` (Workshop ${WORKSHOP[id]} ашиглана)` : '')).join(', '));
  dbg('maps installed:', installed);
}
const mapsAvailable = () => installed ? Object.fromEntries(Object.keys(MAPS).map(id => [id, !!(installed[id] || WORKSHOP[id])])) : null;
const n = (v, min, max) => { const x = Math.round(Number(v)); if (!Number.isFinite(x) || x < min || x > max) throw new Error(`утга ${min}-${max}`); return x; };
const b = (v) => (v === true || v === 1 || v === '1' || v === 'true');
const curMap = () => (state.map && /^[\w]+$/.test(state.map) ? state.map : 'de_mirage');
const PRACTICE = ['sv_cheats 1', 'mp_limitteams 0', 'mp_autoteambalance 0', 'mp_freezetime 0', 'mp_roundtime 60', 'mp_roundtime_defuse 60', 'mp_buy_anywhere 1',
  'mp_buytime 9999', 'mp_maxmoney 60000', 'mp_startmoney 60000', 'sv_infinite_ammo 1', 'ammo_grenade_limit_total 5', 'sv_grenade_trajectory_prac_pipreview 1', 'mp_warmup_end', 'mp_restartgame 1'];
const HANDLERS = {
  changemap: (a) => {
    const m = MAPS[a.map]; if (!m) throw new Error('map зөвшөөрөгдөөгүй');
    const cmd = installed && installed[a.map] === false
      ? (WORKSHOP[a.map] ? `host_workshop_map ${WORKSHOP[a.map]}` : null)
      : `changelevel ${m}`;
    if (!cmd) throw new Error(`${m} серверт суугаагүй байна. SteamCMD-ээр CS2-оо шинэчилнэ үү (app_update 730 validate).`);
    state.score = null; state.phase = 'warmup'; return [cmd];
  },
  mode: (a) => {
    if (a.value === 'competitive') { state.mode = 'competitive'; return ['game_type 0', 'game_mode 1', 'sv_cheats 0', `changelevel ${curMap()}`]; }
    if (a.value === 'wingman') { state.mode = 'wingman'; return ['game_type 0', 'game_mode 2', 'sv_cheats 0', `changelevel ${curMap()}`]; }
    if (a.value === '1v1') { state.mode = '1v1'; return ['game_type 0', 'game_mode 1', 'sv_cheats 0', 'mp_maxrounds 16', 'mp_overtime_enable 1', `changelevel ${curMap()}`]; }
    if (a.value === 'practice') { state.mode = 'practice'; state.phase = 'practice'; return PRACTICE; }
    throw new Error('горим зөвшөөрөгдөөгүй');
  },
  roundtime: (a) => { const v = n(a.value, 1, 60); return [`mp_roundtime ${v}`, `mp_roundtime_defuse ${v}`, `mp_roundtime_hostage ${v}`]; },
  maxrounds: (a) => [`mp_maxrounds ${n(a.value, 1, 60)}`],
  startmoney: (a) => [`mp_startmoney ${n(a.value, 0, 60000)}`],
  freezetime: (a) => [`mp_freezetime ${n(a.value, 0, 60)}`],
  friendlyfire: (a) => [`mp_friendlyfire ${b(a.value) ? 1 : 0}`],
  overtime: (a) => [`mp_overtime_enable ${b(a.value) ? 1 : 0}`],
  knife: (a) => { if (!state.matchzy) throw new Error('Knife round-д MatchZy plugin хэрэгтэй'); return [`matchzy_knife_enabled_default ${b(a.value) ? 'true' : 'false'}`]; },
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
    if (!p) throw new Error('Тоглогч серверт олдсонгүй');
    if (p.userid === null || p.userid === undefined || !/^\d+$/.test(String(p.userid))) throw new Error('userid тодорхойгүй');
    return [`kickid ${p.userid}`];
  }
};

let lastTeams = { teams: { CT: [], T: [], SPEC: [] }, version: null };
function writeMatchConfig() {
  if (!state.matchzy) throw new Error('Багийг SteamID64-ээр түгжихэд MatchZy plugin хэрэгтэй');
  if (!CFG.cs2Dir) throw new Error('CS2_DIR тохируулаагүй (agent/.env)');
  const dir = path.join(CFG.cs2Dir, 'game', 'csgo');
  if (!fs.existsSync(dir)) throw new Error('CS2_DIR буруу: ' + dir + ' олдсонгүй');
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

/* =========================================================
 * Workshop map + AIM 1V1 горим (agent/arena-modes.js, agent/workshop-maps.json)
 *  • Workshop ID-г зөвхөн workshop-maps.json-ийн allowlist-ээс авна.
 *  • AIM-д орохдоо одоогийн convar-уудыг .berx-arena-state.json-д хадгалж (нууц мэдээлэлгүй),
 *    Competitive руу буцахад сэргээнэ. MatchZy-г matchzy_autostart_mode 0-ээр унтуулна.
 *  • "Бэлэн" = сервер status-аар тэр map-ыг мэдээлж, AIM тохиргоог буцааж уншиж баталсан.
 * ========================================================= */
let arenaLib = null, CATALOG = [];
try { arenaLib = require('./arena-modes'); CATALOG = arenaLib.loadCatalog(); }
catch (e) { log('⚠ Workshop/AIM идэвхгүй: agent хавтсанд arena-modes.js, workshop-maps.json байгаа эсэхийг шалгана уу —', e.message); }
const wsEntry = (id) => CATALOG.find(m => m.id === id) || null;
const ARENA_CONFIG_TIMEOUT_MS = Math.max(10000, +process.env.ARENA_CONFIG_TIMEOUT_MS || 60000);  // map дээр гарснаас хойш тохиргоо батлах хугацаа
const ARENA_VERIFY_MS = Math.max(5000, +process.env.ARENA_VERIFY_MS || 30000);   // AIM тохиргоо өөрчлөгдсөн эсэхийг шалгах давтамж
const ARENA_FILE = process.env.BERX_ARENA_STATE || path.join(__dirname, '.berx-arena-state.json');
let arena = { aim: null, snapshot: null, matchzyAutostart: null, workshop: null, log: null, result: null };
try { const saved = JSON.parse(fs.readFileSync(ARENA_FILE, 'utf8')); if (saved && typeof saved === 'object') arena = { ...arena, ...saved }; } catch (e) { /* анх удаа */ }
const saveArena = () => { try { fs.writeFileSync(ARENA_FILE, JSON.stringify(arena, null, 2)); } catch (e) { log('⚠ Arena төлөв хадгалагдсангүй:', e.message); } };
if (arena.aim) { state.mode = 'aim'; log(`AIM горим үргэлжилж байна: ${arena.aim.map} (${arena.aim.size}v${arena.aim.size}, ${arena.aim.weapon}, first to ${arena.aim.rounds})`); }
function arenaLogToken() { return arena && arena.log && arena.log.token; }
const logUri = () => `http://127.0.0.1:${CFG.eventsPort}/cs2log/${arena.log.token}`;
// Агентын бүтээсэн командыг л RCON руу (хэрэглэгчийн текст биш); ; болон мөр шилжилт хэзээ ч орохгүй
const safe = (cmd) => { if (!/^[\w .:"\-/]+$/.test(cmd)) throw new Error('Аюултай тэмдэгт: ' + cmd); return cmd; };
// AIM-ийн оноог CS2 log-оос авах: logaddress_add_http (зөвхөн 127.0.0.1). Өмнө log унтраалттай байсан бол буцахад унтраана.
async function startAimLog() {
  if (!arena.log) {
    const st = await rcon.exec('log').catch(() => '');
    arena.log = { token: crypto.randomBytes(12).toString('hex'), wasOn: /currently logging to/i.test(st) && !/not currently logging/i.test(st) };
  }
  await rcon.exec('log on');
  await rcon.exec(safe(`logaddress_add_http "${logUri()}"`));
}
function stopAimLogCommands() {
  if (!arena.log) return [];
  return [safe(`logaddress_del_http "${logUri()}"`), ...(arena.log.wasOn ? [] : ['log off'])];
}
// Log мөр бүр: round-ын оноо, тоглолт дууссан, дахин эхэлсэн
function onCs2Log(body) {
  if (!arena.aim) return;
  let changed = false;
  for (const line of String(body).split(/\r?\n/)) {
    const ev = arenaLib.parseLogLine(line); if (!ev) continue;
    if (ev.type === 'round') {
      state.score = { ct: ev.ct, t: ev.t }; state.phase = 'live'; changed = true;
      const r = arenaLib.resultOf(state.score, arena.aim.rounds);
      if (r) { arena.result = { ...r, rounds: arena.aim.rounds, at: Date.now(), names: teamNames() }; state.phase = 'finished'; log(`🏆 AIM дууслаа: ${r.winner} ${r.ct}:${r.t} (first to ${arena.aim.rounds})`); saveArena(); }
    } else if (ev.type === 'gameover') {
      state.phase = 'finished'; changed = true;
      if (!arena.result) { const r = arenaLib.resultOf(state.score, arena.aim.rounds); if (r) { arena.result = { ...r, rounds: arena.aim.rounds, at: Date.now(), names: teamNames() }; saveArena(); } }
    } else if (ev.type === 'restart') { state.score = { ct: 0, t: 0 }; state.phase = 'live'; changed = true; }
  }
  if (changed) heartbeat().catch(() => {});
}
const teamNames = () => ({ CT: state.players.filter(p => p.team === 'CT' && !p.bot).map(p => p.name).slice(0, 5), T: state.players.filter(p => p.team === 'T' && !p.bot).map(p => p.name).slice(0, 5) });
const needArena = () => { if (!arenaLib || !CATALOG.length) throw new Error('Agent дээр Workshop/AIM модуль алга — agent хавтсанд arena-modes.js, workshop-maps.json хуулаад agent-ийг дахин асаана уу'); };
// AIM горимд MatchZy-г сэрээх эсвэл тохиргоог эвдэх командууд
const AIM_BLOCKED = ['apply_teams', 'match_start', 'match_stop', 'knife', 'bot_add', 'warmup_start'];
const sameVal = (a, b) => (a !== null && a !== '' && b !== '' && !isNaN(a) && !isNaN(b)) ? Number(a) === Number(b) : String(a) === String(b);

async function startWorkshop(entry, purpose) {
  arena.workshop = { id: entry.id, workshopId: entry.workshopId, purpose, phase: 'requested', since: Date.now(), error: null, warning: null };
  saveArena();
  // Анх татахад сервер хэсэг хугацаанд хариу өгөхгүй байж болно — хариу хүлээхгүй, төлөвийг tick-ээр шалгана
  const out = await rcon.exec(`host_workshop_map ${entry.workshopId}`, 8000).catch(() => '');
  const err = arenaLib.workshopCommandError(out);
  if (err) { arena.workshop.phase = 'error'; arena.workshop.error = err; saveArena(); throw new Error(err); }
  // Файлын системээс шууд: .vpk алга = татаж байна, бий = ачаалж байна (сервер хариу өгөхийг хүлээхгүй)
  const files = arenaLib.workshopFiles(CFG.cs2Dir, entry.workshopId);
  if (files) { arena.workshop.phase = files.installed ? 'loading' : 'downloading'; if (files.installed) arena.workshop.loadingAt = Date.now(); }
  arena.workshop.updatedAt = Date.now(); saveArena();
  log(`⇣ Workshop ${entry.workshopId} (${entry.mapName}) ${files && !files.installed ? 'татаж' : 'ачаалж'} байна...`);
  return out;
}
// Competitive руу буцах: snapshot сэргээх + MatchZy-ийн анхны autostart горим (map солихоос ӨМНӨ)
function leaveAimCommands() {
  if (!arena.aim) return [];
  const cmds = [...stopAimLogCommands(), ...arenaLib.restoreCommands(arena.snapshot)];
  if (state.matchzy || arena.matchzyAutostart !== null) cmds.push(`matchzy_autostart_mode ${[0, 1, 2].includes(arena.matchzyAutostart) ? arena.matchzyAutostart : 1}`);
  return cmds;
}
function clearAim() {
  arena = { aim: null, snapshot: null, matchzyAutostart: null, workshop: null, log: null, result: null };
  state.mode = 'competitive'; saveArena();
}
// Readback: бодит утгыг серверээс уншиж шалгана. required бүгд таарвал ok. optional таараагүйг жагсаана.
async function verifyAim() {
  const exp = arenaLib.aimExpect(arena.aim, { winlimit: arena.aim.winlimit !== false });
  const bad = [], badOpt = [];
  for (const [k, v] of Object.entries(exp.required)) {
    const got = arenaLib.parseCvar(await rcon.exec(k).catch(() => ''), k);
    if (got === null || !sameVal(got, v)) bad.push(`${k}=${got === null ? '?' : got} (хүлээгдсэн ${v})`);
  }
  for (const [k, v] of Object.entries(exp.optional)) {
    const got = arenaLib.parseCvar(await rcon.exec(k).catch(() => ''), k);
    if (got === null || !sameVal(got, v)) badOpt.push(k);
  }
  if (bad.length) dbg('AIM шалгалт:', bad.join(', '));
  return { ok: !bad.length, bad, badOpt };
}
async function applyAimConfig(opts = {}) {
  for (const x of arenaLib.aimConfig(arena.aim, { winlimit: arena.aim.winlimit !== false, restart: opts.restart })) await rcon.exec(safe(x));
  if (opts.restart !== false) { arena.result = null; state.score = { ct: 0, t: 0 }; }
  arena.workshop.configAt = Date.now();
  log(`✓ AIM тохиргоо: ${arena.aim.size}v${arena.aim.size}, ${arenaLib.WEAPON_LABELS[arena.aim.weapon]}, first to ${arena.aim.rounds}${opts.restart === false ? ' (дахин хэрэгжүүлэв, оноо хэвээр)' : ''}`);
}
// optional readback-ийн дүнгээр: mp_winlimit дэмжигдээгүй бол 2N-1 + clinch fallback; equipment reset алга бол анхааруулга
async function handleOptional(badOpt) {
  const w = [];
  if (badOpt.includes('mp_winlimit') && arena.aim.winlimit !== false) {
    arena.aim.winlimit = false; saveArena();
    log('⚠ Сервер mp_winlimit-ийг хүлээж авсангүй — First to N-ийг mp_maxrounds 2N-1 + clinch-ээр хэрэгжүүлнэ');
    await applyAimConfig(); return { reapplied: true };
  }
  if (arena.aim.winlimit === false) w.push('mp_winlimit дэмжигдээгүй тул First to N = mp_maxrounds 2N-1 (draw round гарвал тэнцээ байж болно)');
  if (badOpt.includes('mp_equipment_reset_rounds')) w.push('mp_equipment_reset_rounds-ийг сервер хүлээж аваагүй — амьд үлдсэн тоглогчийн сум round бүр бүрэн дүүрэхгүй байж болно');
  return { warning: w.join(' · ') || null };
}
const ARENA_HANDLERS = {
  async aim_start(a) {
    needArena();
    const entry = wsEntry(a.map);
    if (!entry || entry.category !== 'aim') throw new Error(`AIM map "${a.map}" agent-ийн workshop-maps.json-д алга — файлаа шинэчилнэ үү`);
    const s = arenaLib.aimSettings(a, entry);
    if (!arena.aim) {
      // Анх AIM-д орох: одоогийн серверийн тохиргоог хадгална (буцахад сэргээнэ)
      arena.snapshot = await arenaLib.readSnapshot((c) => rcon.exec(c));
      arena.matchzyAutostart = state.matchzy ? arenaLib.readMatchzyAutostart(CFG.cs2Dir) : null;
      if (arena.snapshot.fallback.length) log('⚠ Зарим convar-ыг уншиж чадсангүй, competitive анхдагч утгаар сэргээнэ:', arena.snapshot.fallback.join(', '));
      if (state.matchzy) { await rcon.exec('css_restart'); await rcon.exec('matchzy_autostart_mode 0'); }
    }
    await rcon.exec('game_type 0'); await rcon.exec('game_mode 1');
    arena.aim = { map: entry.id, ...s, since: Date.now(), winlimit: arena.aim ? arena.aim.winlimit : undefined };
    arena.result = null;
    await startAimLog();
    state.mode = 'aim'; state.phase = 'warmup'; state.score = null;
    const wf = arenaLib.workshopFiles(CFG.cs2Dir, entry.workshopId);
    if (arenaLib.isOnMap(state.map, entry, wf ? wf.names : []) && state.statusOk) {
      arena.workshop = { id: entry.id, workshopId: entry.workshopId, purpose: 'aim', phase: 'configuring', since: Date.now(), onMapAt: Date.now() - 3000, error: null, warning: null };
      saveArena();
      return { output: `${entry.mapName} аль хэдийн ачаалагдсан — AIM тохиргоог хэрэгжүүлж байна` };
    }
    saveArena();
    await startWorkshop(entry, 'aim');
    return { output: `host_workshop_map ${entry.workshopId} илгээгдлээ — татаж/ачаалж байна. "Бэлэн" төлөв сервер map-аа мэдээлсний дараа л гарна.` };
  },
  async aim_rematch(a) {
    needArena();
    if (!arena.aim) throw new Error('AIM горим идэвхгүй байна');
    const w = arena.workshop, entry = wsEntry(arena.aim.map), wf = arenaLib.workshopFiles(CFG.cs2Dir, entry.workshopId);
    const onMapNow = arenaLib.isOnMap(state.map, entry, wf ? wf.names : []);
    if (!w || !(['ready', 'configuring'].includes(w.phase) || (w.phase === 'error' && onMapNow))) throw new Error('AIM map хараахан бэлэн болоогүй байна');
    if (a && a.size !== undefined) Object.assign(arena.aim, arenaLib.aimSettings(a, entry));
    w.error = null; w.warning = null; w.verified = false;
    await startAimLog();
    await applyAimConfig();                       // mp_restartgame 1 → оноо 0:0, сонгосон тохиргоогоор
    w.phase = 'configuring'; w.onMapAt = Date.now() - 3000; saveArena();
    return { output: `Дахин эхэллээ: ${arena.aim.size}v${arena.aim.size}, ${arenaLib.WEAPON_LABELS[arena.aim.weapon]}, first to ${arena.aim.rounds}` };
  },
  async aim_stop(a) {
    const cmds = leaveAimCommands();
    for (const x of cmds) await rcon.exec(x);
    const restored = !!arena.aim;
    clearAim();
    const change = HANDLERS.changemap({ map: a.map });
    return { cmds: change, output: restored ? `Өмнөх серверийн тохиргоо (${cmds.length} команд) сэргээгдэж, Competitive руу буцлаа` : 'Competitive' };
  },
  async workshop_map(a) {
    needArena();
    const entry = wsEntry(a.map);
    if (!entry || entry.category !== 'competitive') throw new Error(`Workshop map "${a.map}" agent-ийн workshop-maps.json-д алга`);
    for (const x of leaveAimCommands()) await rcon.exec(x);
    if (arena.aim) clearAim();
    state.score = null; state.phase = 'warmup';
    await startWorkshop(entry, 'map');
    return { output: `host_workshop_map ${entry.workshopId} илгээгдлээ — татаж/ачаалж байна` };
  }
};

// Tick бүрт: Workshop ачаалалтын явц, AIM тохиргоо хэрэгжүүлэх/шалгах (сервер өөрөө батлахыг хүлээнэ)
async function arenaTick() {
  const w = arena.workshop; if (!w || !arenaLib) return;
  const entry = wsEntry(w.id); if (!entry) return;
  const now = Date.now(), before = JSON.stringify(w);
  const files = arenaLib.workshopFiles(CFG.cs2Dir, entry.workshopId);
  const onMap = state.online && state.statusOk && arenaLib.isOnMap(state.map, entry, files ? files.names : []);
  if (['requested', 'downloading', 'loading', 'configuring'].includes(w.phase)) {
    let configVerified = false;
    if (onMap && w.purpose === 'aim' && arena.aim) {
      w.onMapAt = w.onMapAt || now;
      if (w.runtimeMap !== state.map) { w.runtimeMap = state.map; log(`✓ Сервер map-аа мэдээллээ: ${state.map}`); }
      // MatchZy sleep.cfg / gamemode cfg map эхэлснээс ~1с дараа ажилладаг → 3с хүлээгээд AIM тохиргоо
      if (now - w.onMapAt >= 3000 && (!w.configAt || (now - w.configAt > 20000 && !w.verified))) await applyAimConfig();
      if (w.configAt && now - w.configAt >= 1000) {
        const v = await verifyAim();
        if (v.ok) {
          const o = await handleOptional(v.badOpt);
          if (!o.reapplied) { configVerified = w.verified = true; w.warning = o.warning || null; }
        } else if (now - w.onMapAt > ARENA_CONFIG_TIMEOUT_MS) {
          // Map ачаалагдсан ч тохиргоо баталгаажаагүй → "Бэлэн" ГЭЖ ХЭЛЭХГҮЙ
          w.phase = 'error'; w.error = 'Map ачаалагдсан боловч AIM тохиргоо баталгаажсангүй: ' + v.bad.slice(0, 4).join(', ') + ' — «Дахин тоглох» дарж дахин оролдоно уу';
        }
      }
    } else if (onMap) configVerified = true;
    if (w.phase !== 'error') Object.assign(w, arenaLib.nextPhase(w, { now, onMap, files, rconOk: state.online && state.statusOk, configVerified }));
    if (w.phase === 'ready') { w.verified = false; if (w.purpose === 'aim') { state.phase = 'live'; state.score = state.score || { ct: 0, t: 0 }; } log(`✓ Workshop map бэлэн: ${state.map}`); }
    if (w.phase === 'error') log('✖ Workshop:', w.error);
  } else if (w.phase === 'ready' && w.purpose === 'aim' && arena.aim && state.statusOk) {
    if (!onMap) { w.phase = 'error'; w.error = `Сервер өөр map руу шилжсэн (${state.map || '?'}) — AIM-ийг дахин эхлүүлэх эсвэл Competitive руу буцна уу`; log('⚠', w.error); }
    else if (now - (w.lastVerify || 0) > ARENA_VERIFY_MS) {
      w.lastVerify = now;
      const v = await verifyAim();
      // MatchZy/cfg тохиргоог дарж бичсэн бол дахин хэрэгжүүлнэ — тоглолтын оноог ТЭГЛЭХГҮЙ
      if (!v.ok) { log('⚠ AIM тохиргоо өөрчлөгдсөн байна (' + v.bad.slice(0, 3).join(', ') + ') — дахин хэрэгжүүлнэ'); await applyAimConfig({ restart: false }); }
    }
  }
  if (JSON.stringify(w) !== before) { w.updatedAt = now; saveArena(); }
}
function arenaStatus() {
  if (!arenaLib) return undefined;
  const w = arena.workshop;
  return {
    mode: arena.aim ? 'aim' : 'competitive',
    aim: arena.aim ? { map: arena.aim.map, size: arena.aim.size, weapon: arena.aim.weapon, rounds: arena.aim.rounds, since: arena.aim.since, winlimit: arena.aim.winlimit !== false } : null,
    workshop: w ? { id: w.id, workshopId: w.workshopId, purpose: w.purpose, phase: w.phase, error: w.error || null, warning: w.warning || null, since: w.since, updatedAt: w.updatedAt || w.since, runtimeMap: w.runtimeMap || null } : null,
    result: arena.result || null,
    installed: Object.fromEntries(CATALOG.map(m => { const f = arenaLib.workshopFiles(CFG.cs2Dir, m.workshopId); return [m.id, f ? f.installed : null]; })),
    catalog: CATALOG.map(m => m.id)
  };
}

async function runCommand(c) {
  try {
    let cmds, note = '';
    if (arena.aim && AIM_BLOCKED.includes(c.type)) throw new Error('AIM горимд энэ команд боломжгүй (MatchZy унтсан байна) — эхлээд Competitive руу буцна уу');
    let pre = [];
    // AIM-аас өөр map/горим руу шилжвэл өмнөх тохиргоог ЭХЛЭЭД сэргээнэ
    if (arena.aim && (c.type === 'changemap' || c.type === 'mode')) { pre = leaveAimCommands(); clearAim(); note = 'AIM-аас гарч өмнөх тохиргоог сэргээлээ. '; }
    if (c.type === 'apply_teams') cmds = writeMatchConfig();
    else if (ARENA_HANDLERS[c.type]) { const r = await ARENA_HANDLERS[c.type](c.args || {}); cmds = r.cmds || []; note += r.output || ''; }
    else { const h = HANDLERS[c.type]; if (!h) throw new Error('Зөвшөөрөгдөөгүй команд: ' + c.type); cmds = h(c.args || {}); }
    let out = '';
    // AIM-аас гарах сэргээлт (agent өөрөө бүтээсэн, log хаяг "/" агуулна) → safe() шалгалт; бусад команд хуучин дүрмээрээ
    for (const x of pre) await rcon.exec(safe(x));
    for (const x of cmds) { if (!/^[\w .:"\-]+$/.test(x)) throw new Error('Аюултай тэмдэгт'); out += (await rcon.exec(x)).slice(0, 300); }
    if (c.type === 'apply_teams') state.appliedTeamsVersion = lastTeams.version;
    if (/Unknown command/i.test(out)) throw new Error('Сервер командыг танихгүй байна: ' + out.trim().slice(0, 160));
    if (/changelevel failed|failed to load|map not found|not found on server|invalid map/i.test(out)) throw new Error('Map ачаалагдсангүй: ' + out.trim().slice(0, 160));
    log('✓', c.type, JSON.stringify(c.args || {}));
    state.lastSettingsAt = 0;
    return { ok: true, output: (note ? note + (out.trim() ? ' · ' : '') : '') + out.trim().slice(0, 500 - note.length) };
  } catch (e) { log('✖', c.type, e.message); return { ok: false, output: e.message }; }
}

/* ---------- сайттай харилцах ---------- */
// Vercel Preview (Deployment Protection): VERCEL_AUTOMATION_BYPASS_SECRET тохируулсан бол ЗӨВХӨН production бус
// *.vercel.app хаяг руу bypass header илгээнэ. Нэвтрэх хуудас руу redirect хийвэл алдаа гэж үзнэ.
const PRODUCTION_SITE = 'https://berx-cs2-crew.vercel.app';
const IS_PREVIEW = CFG.site !== PRODUCTION_SITE && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(CFG.site);
const PREVIEW_HEADERS = IS_PREVIEW && process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {};
async function api(pathname, body) {
  const r = await fetch(CFG.site + '/api/server/agent/' + pathname, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + CFG.secret, 'Content-Type': 'application/json', 'User-Agent': 'berx-agent/' + VERSION, ...PREVIEW_HEADERS },
    body: body ? JSON.stringify(body) : undefined, redirect: IS_PREVIEW ? 'error' : 'follow', signal: AbortSignal.timeout(15000)
  });
  if (r.status === 401) throw new Error('Сайт agent-ийг танихгүй байна — SERVER_AGENT_SECRET Vercel дээрхтэй таарахгүй байна');
  if (!r.ok) throw new Error('Сайт ' + r.status);
  return r.json();
}
async function heartbeat() {
  const humans = state.players.filter(p => !p.bot);
  return api('heartbeat', {
    online: state.online, map: state.map, mode: state.mode, phase: state.phase, score: state.score,
    players: state.players, maxPlayers: CFG.maxPlayers, address: CFG.publicAddress || null, hostname: state.hostname,
    matchzy: state.matchzy, appliedTeamsVersion: state.appliedTeamsVersion, settings: state.settings, agentVersion: VERSION, humans: humans.length, mapsAvailable: mapsAvailable(),
    skins: skins && skins.enabled ? skins.status() : undefined,
    arena: arenaStatus()
  });
}

let busy = false, lastErr = '';
async function tick() {
  if (busy) return; busy = true;
  try {
    state.online = await ensureRcon();
    if (state.online) {
      try {
        state.statusOk = await readStatus();
        // Сервер завгүй (Workshop татаж/ачаалж) үед удаан уншилтуудыг алгасна — heartbeat хоцрохгүй
        if (state.statusOk) {
          if (Date.now() - state.lastPluginCheck > 60e3) { await checkPlugins(); state.lastPluginCheck = Date.now(); }
          if (!state.lastMapCheck || Date.now() - state.lastMapCheck > 600e3) { await checkMaps(); state.lastMapCheck = Date.now(); }
          if (Date.now() - state.lastSettingsAt > 30e3) { await readSettings(); state.lastSettingsAt = Date.now(); }
        } else state.players = [];
      } catch (e) { log('⚠ Төлөв уншихад алдаа:', e.message); }
    } else { state.players = []; state.statusOk = false; }
    try { await arenaTick(); } catch (e) { log('⚠ Workshop/AIM:', e.message); }
    await heartbeat();
    const poll = await api('poll');
    if (poll.teams) lastTeams = { teams: poll.teams, version: poll.teamsVersion };
    let arenaCmd = false;
    for (const c of poll.commands || []) {
      const res = state.online ? await runCommand(c) : { ok: false, output: 'Сервер offline (RCON холбогдоогүй)' };
      await api('result', { id: c.id, ...res });
      if (ARENA_HANDLERS[c.type] || c.type === 'changemap' || c.type === 'mode') arenaCmd = true;
    }
    // Workshop/AIM эхэлсэн бол сайт шууд мэдэх ёстой (татах үед сервер удаан хариу өгөхгүй байж болно)
    if (arenaCmd) await heartbeat().catch(() => {});
    if (lastErr) { log('✓ Сайттай холболт сэргэлээ'); lastErr = ''; }
  } catch (e) { if (e.message !== lastErr) log('✖', e.message); lastErr = e.message; }
  finally { busy = false; }
}

/* ---------- SKIN INVENTORY синк (заавал биш, анхдагчаар унтраалттай) ---------- */
let skins = null;
try {
  const { createSkinsSync } = require('./skins-sync');
  skins = createSkinsSync({ env: process.env, api: (p, body) => api(p, body), rconExec: (c) => rcon.exec(c), getPlayers: () => state.players, log });
  if (skins.enabled) setInterval(() => { skins.tick().catch(e => log('✖ Skins:', e.message)); }, skins.pollMs || 10000).unref();
} catch (e) { if (process.env.SKINS_SYNC_ENABLED === '1') log('✖ Skins модуль ачаалагдсангүй:', e.message); }

log(`BERX Agent v${VERSION} → ${CFG.site}`);
log(`RCON ${CFG.rconHost}:${CFG.rconPort} · public: ${CFG.publicAddress || '(тохируулаагүй)'} · CS2_DIR: ${CFG.cs2Dir || '(тохируулаагүй)'}`);
tick(); setInterval(tick, CFG.pollMs);
let stopping = false;
const bye = async () => {
  if (stopping) return; stopping = true;
  log('Зогсож байна... (сайтад offline илгээнэ)'); state.online = false; state.players = [];
  try { await Promise.race([heartbeat(), new Promise(r => setTimeout(r, 5000))]); } catch (e) { /* ignore */ }
  process.exit(0);
};
process.on('SIGINT', bye); process.on('SIGTERM', bye);

/* BERX ARENA Launcher-ийн аюулгүй зогсоох дохио: agent хавтсанд ".berx-stop" файл үүсвэл зогсоно */
const STOP_FILE = process.env.BERX_AGENT_STOP_FILE || path.join(__dirname, '.berx-stop');
try { fs.unlinkSync(STOP_FILE); } catch (e) { /* хуучин дохио */ }
setInterval(() => { if (fs.existsSync(STOP_FILE)) { try { fs.unlinkSync(STOP_FILE); } catch (e) { /* ignore */ } log('Launcher-ээс зогсоох дохио ирлээ'); bye(); } }, 1000).unref();

module.exports = { Rcon, HANDLERS, ARENA_HANDLERS, steam64, normTeam };

