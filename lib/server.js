/* =========================================================
 * BERX ARENA — CS2 private server bridge (server тал)
 * ---------------------------------------------------------
 *  Сайт (Vercel)  ⇄  Supabase  ⇄  BERX Agent (таны Windows PC)  ⇄  CS2 (RCON)
 *
 *  • Agent нь зөвхөн ГАДАГШ HTTPS хүсэлт илгээнэ (Vercel рүү). Сайт руу порт
 *    нээх шаардлагагүй, RCON нууц үг хэзээ ч сайт/Supabase-д очихгүй.
 *  • Agent ⇄ сайт: Authorization: Bearer <SERVER_AGENT_SECRET>
 *  • Admin команд: зөвхөн allowlist-д байгаа төрөл, утгын хязгаартай.
 *    Agent мөн өөрийн allowlist-ээр дахин шалгана (давхар хамгаалалт).
 *  • Сервер холбогдоогүй / heartbeat 25с-ээс хуучин бол Offline. Хуурамч
 *    online төлөв, тоглогч, ping ХЭЗЭЭ Ч үүсгэхгүй.
 * ========================================================= */
'use strict';
const crypto = require('crypto');
const db = require('./db');

const MAPS = ['mirage', 'dust2', 'inferno', 'nuke', 'ancient', 'anubis', 'cache'];
const TEAM_CAP = { CT: 5, T: 5, SPEC: 10 };
const STALE_MS = 25e3;
const now = () => Date.now();
const uid = () => crypto.randomUUID();
const isSteam = (s) => /^7656119\d{10}$/.test(String(s || ''));

/* ---------- Admin командын allowlist ---------- */
const int = (min, max) => (v) => { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Утга ${min}–${max} хооронд байх ёстой`); return n; };
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';
const oneOf = (list) => (v) => { if (!list.includes(v)) throw new Error('Зөвшөөрөгдөөгүй утга'); return v; };
const COMMANDS = {
  changemap: { args: { map: oneOf(MAPS) }, label: 'Map солих' },
  mode: { args: { value: oneOf(['competitive', 'wingman', '1v1', 'practice']) }, label: 'Тоглоомын горим' },
  roundtime: { args: { value: int(1, 60) }, label: 'Round time (мин)' },
  maxrounds: { args: { value: int(1, 60) }, label: 'Max rounds' },
  startmoney: { args: { value: int(0, 60000) }, label: 'Start money' },
  freezetime: { args: { value: int(0, 60) }, label: 'Freeze time (сек)' },
  friendlyfire: { args: { value: bool }, label: 'Friendly fire' },
  overtime: { args: { value: bool }, label: 'Overtime' },
  knife: { args: { value: bool }, label: 'Knife round' },
  infinite_ammo: { args: { value: bool }, label: 'Infinite ammo' },
  bot_add: { args: { team: oneOf(['CT', 'T']) }, label: 'Bot нэмэх' },
  bot_kick: { args: {}, label: 'Bot хасах' },
  warmup_start: { args: {}, label: 'Warmup эхлүүлэх' },
  warmup_end: { args: {}, label: 'Warmup дуусгах' },
  match_start: { args: {}, label: 'Match эхлүүлэх' },
  match_restart: { args: {}, label: 'Match restart' },
  match_stop: { args: {}, label: 'Match зогсоох' },
  kick: { args: { steamId: (v) => { if (!isSteam(v)) throw new Error('SteamID64 буруу'); return String(v); } }, label: 'Kick' },
  apply_teams: { args: {}, label: 'Багийг серверт хэрэгжүүлэх' }
};
function validateCommand(type, args = {}) {
  const def = COMMANDS[type]; if (!def) throw new Error('Зөвшөөрөгдөөгүй команд');
  const out = {};
  for (const [k, fn] of Object.entries(def.args)) out[k] = fn(args[k]);
  return out;
}

/* ---------- Agent нэвтрэлт ---------- */
function agentAuthorized(req) {
  const secret = process.env.SERVER_AGENT_SECRET || '';
  if (secret.length < 24) return false; // тохируулаагүй эсвэл хэт богино
  const h = String(req.headers.authorization || '');
  const got = h.startsWith('Bearer ') ? h.slice(7) : '';
  const a = crypto.createHash('sha256').update(got).digest(), b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ---------- Төлөв ---------- */
async function readState() {
  const row = (await db.select('server_state', { eq: { id: 'main' }, limit: 1 }))[0];
  const configured = !!process.env.SERVER_AGENT_SECRET;
  if (!row) return { configured, online: false, lastSeen: null, data: null };
  const fresh = now() - row.updated_at < STALE_MS;
  return { configured, online: fresh && !!(row.data && row.data.online), lastSeen: row.updated_at, data: row.data || {} };
}

async function teamsWithUsers() {
  const [teams, users] = await Promise.all([db.select('server_teams', {}), db.select('users', { columns: 'id,nick,steam_id,avatar,avatar_v' })]);
  const byId = Object.fromEntries(users.map(u => [u.id, u]));
  const out = { CT: [], T: [], SPEC: [] };
  teams.sort((a, b) => a.updated_at - b.updated_at).forEach(t => { const u = byId[t.user_id]; if (u && out[t.team]) out[t.team].push({ userId: u.id, nick: u.nick, steamId: u.steam_id || null }); });
  const version = teams.reduce((m, t) => Math.max(m, t.updated_at || 0), 0);
  return { teams: out, version };
}

async function publicState(me) {
  const [st, tw, votes, cmds] = await Promise.all([
    readState(), teamsWithUsers(), db.select('server_votes', {}),
    me.is_admin ? db.select('server_commands', { order: 'created_at.desc', limit: 12 }) : Promise.resolve([])
  ]);
  const d = st.data || {};
  const tally = {}; MAPS.forEach(m => tally[m] = 0); votes.forEach(v => { if (tally[v.map] !== undefined) tally[v.map]++; });
  const myVote = (votes.find(v => v.user_id === me.id) || {}).map || null;
  let connect = null;
  if (st.online && d.address) {
    const pw = process.env.SERVER_PASSWORD || '';
    // Нууц үг зөвхөн нэвтэрсэн гишүүнд; RCON нууц үг огт энд байхгүй
    connect = { address: d.address, hasPassword: !!pw, command: `connect ${d.address}${pw ? `; password ${pw}` : ''}`, steamUrl: `steam://connect/${d.address}${pw ? '/' + encodeURIComponent(pw) : ''}` };
  }
  return {
    configured: st.configured, online: st.online, lastSeen: st.lastSeen,
    server: st.online ? {
      map: d.map || null, mode: d.mode || null, phase: d.phase || null, score: d.score || null,
      players: Array.isArray(d.players) ? d.players.slice(0, 40) : [], playerCount: Array.isArray(d.players) ? d.players.filter(p => !p.bot).length : null,
      bots: Array.isArray(d.players) ? d.players.filter(p => p.bot).length : 0, maxPlayers: d.maxPlayers || null, matchzy: !!d.matchzy, hostname: d.hostname || null, settings: d.settings || null,
      mapsAvailable: d.mapsAvailable || null
    } : null,
    connect, teams: tw.teams, teamsVersion: tw.version, appliedTeamsVersion: d.appliedTeamsVersion || null, cap: TEAM_CAP,
    votes: tally, myVote, maps: MAPS,
    commands: me.is_admin ? cmds.map(c => ({ id: c.id, type: c.type, label: (COMMANDS[c.type] || {}).label || c.type, args: c.args, status: c.status, ok: c.ok, output: c.output ? String(c.output).slice(0, 200) : null, createdAt: c.created_at })) : undefined,
    commandTypes: me.is_admin ? Object.fromEntries(Object.entries(COMMANDS).map(([k, v]) => [k, v.label])) : undefined
  };
}

/* ---------- Хэрэглэгчийн үйлдлүүд (/api/action) ---------- */
const ACTIONS = {
  async 'server.vote'(me, p) {
    if (!MAPS.includes(p.map)) throw new Error('Map буруу');
    await db.upsert('server_votes', { user_id: me.id, map: p.map, updated_at: now() }, ['user_id']);
  },
  async 'server.join'(me, p) {
    const team = p.team;
    if (!TEAM_CAP[team]) throw new Error('Баг буруу');
    if (team !== 'SPEC' && !me.steam_id) throw new Error('Багт нэгдэхийн тулд Steam ID-гаа холбоно уу (Тохиргоо → Профайл)');
    const rows = await db.select('server_teams', { eq: { team } });
    if (rows.filter(r => r.user_id !== me.id).length >= TEAM_CAP[team]) throw new Error(`${team === 'CT' ? 'Counter-Terrorists' : team === 'T' ? 'Terrorists' : 'Spectator'} баг дүүрсэн байна`);
    await db.upsert('server_teams', { user_id: me.id, team, updated_at: now() }, ['user_id']);
  },
  async 'server.leave'(me) { await db.remove('server_teams', { user_id: me.id }); },
  async 'server.move'(me, p) {
    if (!me.is_admin) throw new Error('Admin эрх хэрэгтэй');
    if (p.team === 'NONE') return db.remove('server_teams', { user_id: p.userId });
    if (!TEAM_CAP[p.team]) throw new Error('Баг буруу');
    const u = (await db.select('users', { eq: { id: p.userId }, limit: 1, columns: 'id,steam_id' }))[0]; if (!u) throw new Error('Хэрэглэгч олдсонгүй');
    const rows = await db.select('server_teams', { eq: { team: p.team } });
    if (rows.filter(r => r.user_id !== u.id).length >= TEAM_CAP[p.team]) throw new Error('Баг дүүрсэн');
    await db.upsert('server_teams', { user_id: u.id, team: p.team, updated_at: now() }, ['user_id']);
  },
  async 'server.shuffle'(me) {
    if (!me.is_admin) throw new Error('Admin эрх хэрэгтэй');
    const rows = (await db.select('server_teams', {})).filter(r => r.team !== 'SPEC');
    for (let i = rows.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    const t = now();
    for (let i = 0; i < rows.length; i++) await db.upsert('server_teams', { user_id: rows[i].user_id, team: i % 2 ? 'T' : 'CT', updated_at: t + i }, ['user_id']);
  },
  async 'server.cmd'(me, p) {
    if (!me.is_admin) throw new Error('Admin эрх хэрэгтэй'); // frontend-ээс гадна BACKEND дээр шалгана
    const args = validateCommand(p.type, p.args || {});
    const pending = await db.select('server_commands', { eq: { status: 'pending' } });
    if (pending.length >= 20) throw new Error('Хэт олон хүлээгдэж буй команд байна — сервер холбогдсон эсэхийг шалгана уу');
    await db.insert('server_commands', { id: uid(), type: p.type, args, status: 'pending', created_by: me.id, created_at: now() });
  }
};

/* ---------- /api/server/* ---------- */
async function handle(req, res, p, ctx) {
  const { send, readBody, me, ping } = ctx;
  // --- Agent endpoints (Bearer SERVER_AGENT_SECRET) ---
  if (p.startsWith('/server/agent/')) {
    if (!agentAuthorized(req)) return send(res, 401, { error: 'agent unauthorized' });
    if (p === '/server/agent/heartbeat' && req.method === 'POST') {
      const b = await readBody(req);
      const clean = {
        online: b.online !== false, map: typeof b.map === 'string' ? b.map.slice(0, 40) : null, mode: b.mode ? String(b.mode).slice(0, 20) : null,
        phase: ['warmup', 'live', 'finished', 'practice', 'unknown'].includes(b.phase) ? b.phase : 'unknown',
        score: b.score && typeof b.score === 'object' ? { ct: Number(b.score.ct) || 0, t: Number(b.score.t) || 0 } : null,
        players: (Array.isArray(b.players) ? b.players : []).slice(0, 40).map(x => ({ name: String(x.name || '').slice(0, 32), steamId: isSteam(x.steamId) ? String(x.steamId) : null, team: ['CT', 'T', 'SPEC'].includes(x.team) ? x.team : null, bot: !!x.bot, ping: Number.isFinite(+x.ping) ? Math.round(+x.ping) : null, userid: Number.isFinite(+x.userid) ? +x.userid : null })),
        maxPlayers: Number(b.maxPlayers) || null, address: typeof b.address === 'string' && /^[\w.\-]+:\d{2,5}$/.test(b.address) ? b.address : null,
        hostname: b.hostname ? String(b.hostname).slice(0, 64) : null, matchzy: !!b.matchzy, appliedTeamsVersion: Number(b.appliedTeamsVersion) || null,
        settings: b.settings && typeof b.settings === 'object' ? Object.fromEntries(Object.entries(b.settings).slice(0, 20).map(([k, v]) => [String(k).slice(0, 40), String(v).slice(0, 20)])) : null,
        agentVersion: b.agentVersion ? String(b.agentVersion).slice(0, 12) : null,
        // Серверт суусан эсэх (agent шалгана): true = бий, false = алга, байхгүй = тодорхойгүй (хуучин agent)
        skins: b.skins && typeof b.skins === 'object' ? { enabled: !!b.skins.enabled, db: String(b.skins.db || '').slice(0, 12), schema: String(b.skins.schema || '').slice(0, 12),
          lastSync: Number(b.skins.lastSync) || null, pending: Number.isFinite(+b.skins.pending) ? +b.skins.pending : null, error: b.skins.error ? String(b.skins.error).slice(0, 200) : null } : null,
        mapsAvailable: b.mapsAvailable && typeof b.mapsAvailable === 'object'
          ? Object.fromEntries(MAPS.filter(m => typeof b.mapsAvailable[m] === 'boolean').map(m => [m, b.mapsAvailable[m]])) : null
      };
      const prev = (await db.select('server_state', { eq: { id: 'main' }, limit: 1 }))[0];
      await db.upsert('server_state', { id: 'main', data: clean, updated_at: now() }, ['id']);
      // Төлөв мэдэгдэхүйц өөрчлөгдсөн үед л сайт руу realtime ping (хэт олон ping-ээс сэргийлнэ)
      const pd = (prev && prev.data) || {};
      const changed = !prev || now() - prev.updated_at > STALE_MS || pd.map !== clean.map || pd.phase !== clean.phase || JSON.stringify(pd.score) !== JSON.stringify(clean.score) || (pd.players || []).length !== clean.players.length;
      if (changed) await ping({ server: true });
      return send(res, 200, { ok: true });
    }
    if (p === '/server/agent/poll') {
      const pending = (await db.select('server_commands', { eq: { status: 'pending' }, order: 'created_at.asc', limit: 10 }));
      for (const c of pending) await db.update('server_commands', { id: c.id }, { status: 'sent', sent_at: now() });
      const tw = await teamsWithUsers();
      return send(res, 200, { commands: pending.map(c => ({ id: c.id, type: c.type, args: c.args || {} })), teams: tw.teams, teamsVersion: tw.version });
    }
    if (p === '/server/agent/result' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.id) return send(res, 400, { error: 'id' });
      await db.update('server_commands', { id: String(b.id) }, { status: b.ok ? 'done' : 'failed', ok: !!b.ok, output: String(b.output || '').slice(0, 2000), done_at: now() });
      await ping({ server: true });
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Not found' });
  }
  // --- Хэрэглэгчийн endpoint ---
  if (!me) return send(res, 401, { error: 'Нэвтрээгүй' });
  if (p === '/server/state') return send(res, 200, await publicState(me));
  return send(res, 404, { error: 'Not found' });
}

module.exports = { handle, ACTIONS, COMMANDS, MAPS, validateCommand, agentAuthorized };
