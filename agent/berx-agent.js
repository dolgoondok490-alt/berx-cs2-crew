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

const VERSION = '1.1.0';

/* ---------- тохиргоо ---------- */
(function loadEnv() {
  const f = process.env.BERX_AGENT_ENV || path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
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
      return;
    } catch (e) { dbg('status_json parse алдаа', e.message); }
  }
  // 2) энгийн status (SteamID байхгүй байж болно)
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

/* ---------- MatchZy event-үүд (localhost HTTP) ---------- */
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

async function runCommand(c) {
  try {
    let cmds;
    if (c.type === 'apply_teams') cmds = writeMatchConfig();
    else { const h = HANDLERS[c.type]; if (!h) throw new Error('Зөвшөөрөгдөөгүй команд: ' + c.type); cmds = h(c.args || {}); }
    let out = '';
    for (const x of cmds) { if (!/^[\w .:"\-]+$/.test(x)) throw new Error('Аюултай тэмдэгт'); out += (await rcon.exec(x)).slice(0, 300); }
    if (c.type === 'apply_teams') state.appliedTeamsVersion = lastTeams.version;
    if (/Unknown command/i.test(out)) throw new Error('Сервер командыг танихгүй байна: ' + out.trim().slice(0, 160));
    if (/changelevel failed|failed to load|map not found|not found on server|invalid map/i.test(out)) throw new Error('Map ачаалагдсангүй: ' + out.trim().slice(0, 160));
    log('✓', c.type, JSON.stringify(c.args || {}));
    state.lastSettingsAt = 0;
    return { ok: true, output: out.trim().slice(0, 500) };
  } catch (e) { log('✖', c.type, e.message); return { ok: false, output: e.message }; }
}

/* ---------- сайттай харилцах ---------- */
async function api(pathname, body) {
  const r = await fetch(CFG.site + '/api/server/agent/' + pathname, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + CFG.secret, 'Content-Type': 'application/json', 'User-Agent': 'berx-agent/' + VERSION },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000)
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
    matchzy: state.matchzy, appliedTeamsVersion: state.appliedTeamsVersion, settings: state.settings, agentVersion: VERSION, humans: humans.length, mapsAvailable: mapsAvailable()
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
      } catch (e) { log('⚠ Төлөв уншихад алдаа:', e.message); }
    } else { state.players = []; }
    await heartbeat();
    const poll = await api('poll');
    if (poll.teams) lastTeams = { teams: poll.teams, version: poll.teamsVersion };
    for (const c of poll.commands || []) {
      const res = state.online ? await runCommand(c) : { ok: false, output: 'Сервер offline (RCON холбогдоогүй)' };
      await api('result', { id: c.id, ...res });
    }
    if (lastErr) { log('✓ Сайттай холболт сэргэлээ'); lastErr = ''; }
  } catch (e) { if (e.message !== lastErr) log('✖', e.message); lastErr = e.message; }
  finally { busy = false; }
}

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

module.exports = { Rcon, HANDLERS, steam64, normTeam };
