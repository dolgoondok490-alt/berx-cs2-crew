/* =========================================================
 * BERX API — бүх /api/* хүсэлтийг энд шийднэ
 * Vercel: api/index.js  ·  Локал: server/server.js
 * ========================================================= */
'use strict';
const crypto = require('crypto');
const db = require('./db');
const sources = require('./sources');

const BASE_URL = () => (process.env.BASE_URL || '').replace(/\/$/, '');
const SECRET = () => process.env.SESSION_SECRET || 'dev-only-secret-change-me';
const ALLOWED_STEAM = () => (process.env.ALLOWED_STEAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const TZ_OFFSET = 8 * 3600e3; // Улаанбаатар (UTC+8)
const now = () => Date.now();

/* ---------- utils ---------- */
const sign = (v) => crypto.createHmac('sha256', SECRET()).update(v).digest('base64url');
function makeSession(uid) { const v = Buffer.from(JSON.stringify({ uid, exp: now() + 60 * 864e5 })).toString('base64url'); return v + '.' + sign(v); }
function readSession(req) {
  const c = Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=')).filter(x => x[0]));
  const raw = c.berx_sid; if (!raw) return null;
  const [v, s] = raw.split('.'); if (!v || !s) return null;
  const good = sign(v); if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return null;
  try { const d = JSON.parse(Buffer.from(v, 'base64url').toString()); return d.exp > now() ? d : null; } catch { return null; }
}
const isHttps = (req) => (req.headers['x-forwarded-proto'] || '').includes('https') || BASE_URL().startsWith('https');
const cookie = (req, val, maxAge) => `berx_sid=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
function origin(req) { if (BASE_URL()) return BASE_URL(); const proto = isHttps(req) ? 'https' : 'http'; return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`; }
function send(res, code, obj, headers = {}) { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); for (const [k, v] of Object.entries(headers)) res.setHeader(k, v); res.end(JSON.stringify(obj)); }
function redirect(res, to, headers = {}) { res.statusCode = 302; res.setHeader('Location', to); for (const [k, v] of Object.entries(headers)) res.setHeader(k, v); res.end(); }
async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 3e6) throw new Error('Body хэт том'); chunks.push(c); }
  const t = Buffer.concat(chunks).toString(); return t ? JSON.parse(t) : {};
}
const uid = () => crypto.randomUUID();
const isId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(s);
const str = (v, max) => String(v ?? '').trim().slice(0, max);
function dayKey(t = now()) { return new Date(t + TZ_OFFSET).toISOString().slice(0, 10); }
function weekKey(offset = 0) {
  const d = new Date(now() + TZ_OFFSET - offset * 7 * 864e5); d.setUTCHours(0, 0, 0, 0);
  const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const w = 1 + Math.round(((d - y) / 864e5 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}
function normalizeLogin(v) {
  v = String(v || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { kind: 'email', value: v.toLowerCase() };
  const d = v.replace(/[\s\-()]/g, '');
  if (/^\+?\d{8,15}$/.test(d)) { const x = d.replace(/^\+/, ''); return { kind: 'phone', value: '+' + (x.length === 8 ? '976' + x : x) }; }
  return null;
}
function hashPass(p) { const salt = crypto.randomBytes(16).toString('hex'); return `scrypt$${salt}$${crypto.scryptSync(p, salt, 32).toString('hex')}`; }
function checkPass(p, stored) {
  const [alg, salt, h] = String(stored || '').split('$'); if (alg !== 'scrypt') return false;
  const a = crypto.scryptSync(p, salt, 32), b = Buffer.from(h, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const isDataImg = (s) => typeof s === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
const PRESETS = ['dok', 'kaze', 'b1t', 'senzu', 'nmgd', 'temka', 'l1m0n', 'munkh', 'zolboo'].map(k => `assets/avatars/${k}.jpg`);

/* ---------- realtime ping (Supabase Broadcast REST) ---------- */
async function ping(payload = {}) {
  if (!db.SUPABASE_URL || !db.SUPABASE_KEY) return;
  try {
    await fetch(`${db.SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST', headers: { apikey: db.SUPABASE_KEY, Authorization: `Bearer ${db.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: 'berx', event: 'changed', payload: { at: now(), ...payload }, private: false }] })
    });
  } catch (e) { console.warn('broadcast failed', e.message); }
}
async function notify(text, icon = '🔔', link = null) {
  await db.insert('notifications', { id: uid(), text: str(text, 200), icon, link, created_at: now() });
}

/* ---------- users ---------- */
async function getUser(id) { return (await db.select('users', { eq: { id }, limit: 1 }))[0] || null; }
async function addRecord(kind, userId, delta) {
  const week = weekKey();
  const row = (await db.select('records', { eq: { week, kind, user_id: userId }, limit: 1 }))[0];
  await db.upsert('records', { week, kind, user_id: userId, n: Math.max(0, (row?.n || 0) + delta) }, ['week', 'kind', 'user_id']);
}
async function createUser(fields) {
  const first = (await db.select('users', { limit: 1 })).length === 0;
  const u = { id: uid(), nick: 'Player', login: null, kind: null, pass_hash: null, steam_id: null, avatar: '', avatar_v: now(), bio: 'Шинэ гишүүн 🐣', faceit_nick: '',
    premier: 0, faceit_elo: 0, live: null, stats_source: null, synced_at: null, is_admin: first, created_at: now(), last_seen: now(), ...fields };
  await db.insert('users', u);
  await notify(`${u.nick} BERX багт нэгдлээ 🎉`, '👋', 'crew');
  return u;
}
function avatarUrl(u) { if (!u.avatar) return ''; return isDataImg(u.avatar) ? `api/avatar/${u.id}?v=${u.avatar_v || 0}` : u.avatar; }
async function syncStats(user) {
  if (!user.steam_id) return { error: 'Steam холбоогүй' };
  const r = await sources.fetchAll(user.steam_id);
  const patch = { live: r.live, stats_source: 'live', synced_at: now() };
  if (r.premier) patch.premier = r.premier;
  if (r.faceitElo) patch.faceit_elo = r.faceitElo;
  if (r.faceitNick) patch.faceit_nick = r.faceitNick;
  if (r.summary?.avatar && !isDataImg(user.avatar)) { patch.avatar = r.summary.avatar; patch.avatar_v = now(); }
  await db.update('users', { id: user.id }, patch);
  return { ok: true, warnings: r.warnings };
}

/* ---------- state ---------- */
async function buildState(me) {
  const t = now();
  if (!me.last_seen || t - me.last_seen > 45e3) await db.update('users', { id: me.id }, { last_seen: t });
  const wk = weekKey();
  const [users, avail, invites, chat, memes, votes, mvotes, records, notes] = await Promise.all([
    db.select('users', { order: 'created_at.asc' }),
    db.select('availability', { eq: { day: dayKey() } }),
    db.select('invites', { order: 'start_at.desc', limit: 40 }),
    db.select('chat', { order: 'created_at.desc', limit: 120 }),
    db.select('memes', { order: 'created_at.desc', limit: 30, columns: 'id,user_id,text,likes,created_at,has_img' }),
    db.select('votes', { in: { week: [wk, weekKey(1), weekKey(2), weekKey(3)] } }),
    db.select('match_votes', {}),
    db.select('records', { in: { week: [wk, weekKey(1), weekKey(2), weekKey(3)] } }),
    db.select('notifications', { order: 'created_at.desc', limit: 40 })
  ]);
  const invIds = invites.map(i => i.id);
  const resp = invIds.length ? await db.select('responses', { in: { invite_id: invIds } }) : [];
  const presence = {}, lastSeen = {};
  users.forEach(u => { const ago = t - (u.id === me.id ? t : u.last_seen || 0); presence[u.id] = ago < 150e3 ? 'online' : ago < 15 * 60e3 ? 'away' : 'offline'; lastSeen[u.id] = u.last_seen || null; });
  const lastExcuse = {};
  [...resp].filter(r => r.excuse).sort((a, b) => a.updated_at - b.updated_at).forEach(r => { lastExcuse[r.user_id] = r.excuse; });
  const weekMap = (rows, keyFn) => { const o = {}; rows.forEach(r => { (o[keyFn(r)] ||= []).push(r); }); return o; };
  const topOf = (counts) => { let best = null, n = 0; Object.entries(counts).forEach(([k, v]) => { if (v > n) { best = k; n = v; } }); return best; };
  const history = {};
  [1, 2, 3].forEach(w => {
    const k = weekKey(w), h = {};
    const ch = {}; votes.filter(v => v.week === k && v.award === 'CHICKEN').forEach(v => ch[v.target] = (ch[v.target] || 0) + 1);
    if (topOf(ch)) h.CHICKEN = topOf(ch);
    [['late', 'ALWAYS_LATE'], ['afk', 'AFK_KING'], ['excuse', 'EXCUSE_MASTER']].forEach(([kind, award]) => {
      const c = {}; records.filter(r => r.week === k && r.kind === kind).forEach(r => c[r.user_id] = r.n); const top = topOf(c); if (top) h[award] = top;
    });
    history[w] = h;
  });
  const manual = { late: {}, afk: {}, excuse: {} };
  records.filter(r => r.week === wk).forEach(r => { (manual[r.kind] ||= {})[r.user_id] = r.n; });
  const chicken = {}; votes.filter(v => v.week === wk && v.award === 'CHICKEN').forEach(v => chicken[v.voter] = v.target);
  const matchVotes = {}; mvotes.forEach(v => { ((matchVotes[v.match_key] ||= {})[v.voter] = { mvp: v.mvp, bot: v.bot }); });
  const respBy = weekMap(resp, r => r.invite_id);
  const lastMatch = invites.filter(i => i.status !== 'cancelled' && i.start_at < t).sort((a, b) => b.start_at - a.start_at)[0];
  return {
    me: me.id,
    members: users.map(u => ({ id: u.id, nick: u.nick, name: u.nick, avatar: avatarUrl(u), customAvatar: isDataImg(u.avatar), title: u.bio || '', steamId: u.steam_id || '', faceitNick: u.faceit_nick || '',
      premier: u.premier || 0, faceitElo: u.faceit_elo || 0, live: u.live || null, statsSource: u.stats_source || null, syncedAt: u.synced_at || null, admin: !!u.is_admin,
      login: u.id === me.id ? (u.login || (u.steam_id ? 'steam:' + u.steam_id : '')) : undefined, loginKind: u.id === me.id ? (u.kind || (u.steam_id ? 'steam' : '')) : undefined })),
    presence, lastSeen,
    availability: Object.fromEntries(avail.map(a => [a.user_id, a.value])),
    invites: invites.map(i => {
      const rs = respBy[i.id] || [];
      return { id: i.id, type: i.type, start: i.start_at, slots: i.slots, map: i.map, invited: i.invited || [], message: i.message, createdBy: i.created_by, createdAt: i.created_at, status: i.status,
        responses: Object.fromEntries(rs.map(r => [r.user_id, r.answer])), excuses: Object.fromEntries(rs.filter(r => r.excuse).map(r => [r.user_id, r.excuse])) };
    }),
    chat: chat.reverse().map(c => ({ id: c.id, by: c.user_id, text: c.text, date: c.created_at })),
    memes: memes.map(m => ({ id: m.id, by: m.user_id, text: m.text, likes: m.likes || [], date: m.created_at, img: m.has_img ? `api/meme-img/${m.id}` : null })),
    votes: { CHICKEN: chicken }, matchVotes, manual, lastExcuse, history,
    lastMatchKey: lastMatch ? lastMatch.id : null,
    notifications: notes.map(n => ({ id: n.id, text: n.text, icon: n.icon, link: n.link, date: n.created_at }))
  };
}

/* ---------- actions ---------- */
const ACTIONS = {
  async avail(me, p) {
    if (!['yes', 'maybe', 'late', 'no'].includes(p.value)) throw new Error('Буруу сонголт');
    await db.upsert('availability', { user_id: me.id, day: dayKey(), value: p.value }, ['user_id', 'day']);
  },
  async 'invite.create'(me, p) {
    if (!isId(p.id)) throw new Error('id');
    if (!['Premier', 'FACEIT', 'LAN'].includes(p.type)) throw new Error('Төрөл буруу');
    const slots = p.type === 'LAN' ? 10 : [2, 5].includes(+p.slots) ? +p.slots : 5;
    const invited = (Array.isArray(p.invited) ? p.invited : []).filter(isId).slice(0, 30);
    await db.insert('invites', { id: p.id, type: p.type, start_at: +p.start || now(), slots, map: str(p.map, 20), invited, message: str(p.message, 120), created_by: me.id, status: 'active', created_at: now() });
    await db.upsert('responses', { invite_id: p.id, user_id: me.id, answer: 'yes', excuse: null, updated_at: now() }, ['invite_id', 'user_id']);
    await notify(`${me.nick} шинэ ${p.type} урилга илгээлээ (${invited.length} найз)`, '📨', 'invite');
  },
  async 'invite.respond'(me, p) {
    if (!['yes', 'maybe', 'late', 'no'].includes(p.answer)) throw new Error('Буруу хариулт');
    const inv = (await db.select('invites', { eq: { id: p.inviteId }, limit: 1 }))[0]; if (!inv || inv.status !== 'active') throw new Error('Урилга олдсонгүй');
    const rs = await db.select('responses', { eq: { invite_id: inv.id } });
    const prev = rs.find(r => r.user_id === me.id);
    const before = rs.filter(r => r.answer === 'yes').length;
    await db.upsert('responses', { invite_id: inv.id, user_id: me.id, answer: p.answer, excuse: p.answer === 'yes' ? null : (prev?.excuse || null), updated_at: now() }, ['invite_id', 'user_id']);
    if (!(inv.invited || []).includes(me.id)) await db.update('invites', { id: inv.id }, { invited: [...(inv.invited || []), me.id] });
    if (p.answer === 'late' && prev?.answer !== 'late') await addRecord('late', me.id, 1);
    const after = before - (prev?.answer === 'yes' ? 1 : 0) + (p.answer === 'yes' ? 1 : 0);
    const lbl = { yes: 'тоглоно 🔥', maybe: 'магадгүй 🤔', late: 'хоцорно 🐢', no: 'тоглохгүй 💀' }[p.answer];
    await notify(`${me.nick}: ${lbl}`, '💬', 'invite');
    if (before < inv.slots && after >= inv.slots) { await notify(`FULL STACK READY! ${inv.type} ${inv.slots}/${inv.slots} 🎮🔥`, '🎮', 'invite'); return { fullstack: inv.slots }; }
  },
  async 'invite.excuse'(me, p) {
    const text = str(p.text, 140); if (!text) throw new Error('Хоосон');
    const r = (await db.select('responses', { eq: { invite_id: p.inviteId, user_id: me.id }, limit: 1 }))[0];
    if (!r || r.answer === 'yes') throw new Error('Эхлээд хариулна уу');
    await db.update('responses', { invite_id: p.inviteId, user_id: me.id }, { excuse: text, updated_at: now() });
    if (!r.excuse) await addRecord('excuse', me.id, 1);
  },
  async 'invite.cancel'(me, p) {
    const inv = (await db.select('invites', { eq: { id: p.inviteId }, limit: 1 }))[0]; if (!inv) throw new Error('Олдсонгүй');
    if (inv.created_by !== me.id && !me.is_admin) throw new Error('Эрх байхгүй');
    await db.update('invites', { id: inv.id }, { status: 'cancelled' });
    await notify(`${me.nick} урилгаа цуцаллаа`, '✕', 'invite');
  },
  async 'chat.send'(me, p) {
    const text = str(p.text, 300); if (!text) return;
    await db.insert('chat', { id: isId(p.id) ? p.id : uid(), user_id: me.id, text, created_at: now() });
  },
  async 'meme.create'(me, p) {
    const text = str(p.text, 140); const img = p.img && isDataImg(p.img) && p.img.length < 400e3 ? p.img : null;
    if (!text && !img) throw new Error('Хоосон');
    await db.insert('memes', { id: isId(p.id) ? p.id : uid(), user_id: me.id, text, img, has_img: !!img, likes: [], created_at: now() });
  },
  async 'meme.like'(me, p) {
    const m = (await db.select('memes', { eq: { id: p.id }, limit: 1, columns: 'id,likes' }))[0]; if (!m) return;
    const likes = m.likes || []; await db.update('memes', { id: m.id }, { likes: likes.includes(me.id) ? likes.filter(x => x !== me.id) : [...likes, me.id] });
  },
  async 'meme.delete'(me, p) {
    const m = (await db.select('memes', { eq: { id: p.id }, limit: 1, columns: 'id,user_id' }))[0]; if (!m) return;
    if (m.user_id !== me.id && !me.is_admin) throw new Error('Эрх байхгүй');
    await db.remove('memes', { id: m.id });
  },
  async 'vote.chicken'(me, p) {
    if (!isId(p.target) || p.target === me.id) throw new Error('Буруу');
    await db.upsert('votes', { week: weekKey(), award: 'CHICKEN', voter: me.id, target: p.target }, ['week', 'award', 'voter']);
  },
  async 'vote.match'(me, p) {
    if (!isId(p.key) || !['mvp', 'bot'].includes(p.k) || !isId(p.target)) throw new Error('Буруу');
    const cur = (await db.select('match_votes', { eq: { match_key: p.key, voter: me.id }, limit: 1 }))[0] || {};
    await db.upsert('match_votes', { match_key: p.key, voter: me.id, mvp: cur.mvp || null, bot: cur.bot || null, [p.k]: p.target }, ['match_key', 'voter']);
  },
  async 'record.add'(me, p) {
    if (!['late', 'afk', 'excuse'].includes(p.kind) || !isId(p.userId)) throw new Error('Буруу');
    await addRecord(p.kind, p.userId, p.delta < 0 ? -1 : 1);
  },
  async 'profile.update'(me, p) {
    const patch = {};
    if (p.nick !== undefined) { const n = str(p.nick, 16); if (n.length < 2) throw new Error('Nickname дор хаяж 2 тэмдэгт'); patch.nick = n; }
    if (p.bio !== undefined) patch.bio = str(p.bio, 160);
    if (p.faceitNick !== undefined) patch.faceit_nick = str(p.faceitNick, 40);
    if (p.steamId !== undefined) {
      const s = str(p.steamId, 20);
      if (s && !/^7656119\d{10}$/.test(s)) throw new Error('Steam ID буруу (7656119... 17 оронтой)');
      if (s && s !== me.steam_id) {
        const taken = (await db.select('users', { eq: { steam_id: s }, limit: 1 }))[0];
        if (taken && taken.id !== me.id) throw new Error('Энэ Steam ID өөр хэрэглэгчид холбогдсон');
      }
      patch.steam_id = s || null;
    }
    await db.update('users', { id: me.id }, patch);
  },
  async 'profile.avatar'(me, p) {
    let a = '';
    if (p.dataUrl) { if (!isDataImg(p.dataUrl) || p.dataUrl.length > 200e3) throw new Error('Зураг буруу/хэт том'); a = p.dataUrl; }
    else if (p.preset) { if (!PRESETS.includes(p.preset)) throw new Error('Буруу'); a = p.preset; }
    await db.update('users', { id: me.id }, { avatar: a, avatar_v: now() });
  },
  async 'admin.toggle'(me, p) {
    if (!me.is_admin) throw new Error('Admin эрх хэрэгтэй'); if (p.userId === me.id) throw new Error('Өөрийгөө өөрчлөх боломжгүй');
    const u = await getUser(p.userId); if (u) await db.update('users', { id: u.id }, { is_admin: !u.is_admin });
  },
  async 'admin.remove'(me, p) {
    if (!me.is_admin) throw new Error('Admin эрх хэрэгтэй'); if (p.userId === me.id) throw new Error('Өөрийгөө хасах боломжгүй');
    await db.remove('users', { id: p.userId });
  }
};

/* ---------- router ---------- */
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  // vercel.json rewrite: /api/(.*) → /api/index?path=$1
  const forced = /^\/api(\/index)?\/?$/.test(url.pathname) && url.searchParams.get('path');
  if (forced !== null && forced !== false) url.searchParams.delete('path');
  const p = forced ? '/' + forced.replace(/^\//, '') : (url.pathname.replace(/^\/api/, '') || '/');
  const sess = readSession(req);
  try {
    if (p === '/health') {
      return send(res, 200, { ok: true, db: db.name, steam: true, ...sources.keys(),
        realtime: db.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY ? { url: db.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY } : null,
        warning: process.env.VERCEL && db.name === 'file' ? 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY тохируулаагүй — Vercel дээр өгөгдөл хадгалагдахгүй' : undefined });
    }
    /* --- auth --- */
    if (p === '/auth/register' && req.method === 'POST') {
      const b = await readBody(req); const L = normalizeLogin(b.login); const nick = str(b.nick, 16);
      if (!L) return send(res, 400, { error: 'Имэйл эсвэл утасны дугаараа зөв оруулна уу' });
      if (nick.length < 2) return send(res, 400, { error: 'Nickname дор хаяж 2 тэмдэгт' });
      if (String(b.password || '').length < 6) return send(res, 400, { error: 'Нууц үг дор хаяж 6 тэмдэгт' });
      if ((await db.select('users', { eq: { login: L.value }, limit: 1 })).length) return send(res, 409, { error: 'Энэ ' + (L.kind === 'email' ? 'имэйл' : 'утас') + ' бүртгэлтэй байна. Нэвтэрнэ үү.' });
      const u = await createUser({ nick, login: L.value, kind: L.kind, pass_hash: hashPass(String(b.password)) });
      await ping();
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, makeSession(u.id), 60 * 86400) });
    }
    if (p === '/auth/login' && req.method === 'POST') {
      const b = await readBody(req); const L = normalizeLogin(b.login);
      if (!L) return send(res, 400, { error: 'Имэйл эсвэл утасны дугаараа зөв оруулна уу' });
      const u = (await db.select('users', { eq: { login: L.value }, limit: 1 }))[0];
      if (!u) return send(res, 404, { error: 'Бүртгэл олдсонгүй. Эхлээд бүртгүүлнэ үү.' });
      if (!checkPass(String(b.password || ''), u.pass_hash)) return send(res, 401, { error: 'Нууц үг буруу байна' });
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, makeSession(u.id), 60 * 86400) });
    }
    if (p === '/auth/logout') return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
    if (p === '/auth/steam') {
      const base = origin(req);
      const q = new URLSearchParams({ 'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'checkid_setup', 'openid.return_to': `${base}/api/auth/steam/return`, 'openid.realm': base,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select', 'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select' });
      return redirect(res, `${STEAM_OPENID}?${q}`);
    }
    if (p === '/auth/steam/return') {
      const base = origin(req), q = url.searchParams;
      if (q.get('openid.mode') !== 'id_res' || !String(q.get('openid.return_to') || '').startsWith(base) || q.get('openid.op_endpoint') !== STEAM_OPENID) return redirect(res, `${base}/?steam_error=invalid`);
      const body = new URLSearchParams(); for (const [k, v] of q) if (k.startsWith('openid.')) body.set(k, v); body.set('openid.mode', 'check_authentication');
      let valid = false;
      try { const r = await fetch(STEAM_OPENID, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); valid = /is_valid\s*:\s*true/.test(await r.text()); } catch (e) { console.error(e.message); }
      const m = String(q.get('openid.claimed_id') || '').match(/^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/);
      if (!valid || !m) return redirect(res, `${base}/?steam_error=verify`);
      const steamId = m[1];
      if (ALLOWED_STEAM().length && !ALLOWED_STEAM().includes(steamId)) return redirect(res, `${base}/?steam_error=not_allowed`);
      let user = (await db.select('users', { eq: { steam_id: steamId }, limit: 1 }))[0];
      const current = sess && await getUser(sess.uid);
      if (!user && current && !current.steam_id) { await db.update('users', { id: current.id }, { steam_id: steamId }); user = { ...current, steam_id: steamId }; } // одоогийн данс руу Steam холбох
      if (!user) {
        let sum = null; try { sum = await sources.steamSummary(steamId); } catch (e) { /* ignore */ }
        user = await createUser({ nick: str(sum?.nick || 'Steam_' + steamId.slice(-4), 16), steam_id: steamId, avatar: sum?.avatar || '' });
      }
      try { await syncStats(user); } catch (e) { console.warn('sync', e.message); }
      await ping();
      return redirect(res, `${base}/#dashboard`, { 'Set-Cookie': cookie(req, makeSession(user.id), 60 * 86400) });
    }
    /* --- images (cacheable) --- */
    const img = p.match(/^\/(avatar|meme-img)\/([A-Za-z0-9_-]+)$/);
    if (img) {
      const row = img[1] === 'avatar' ? await getUser(img[2]) : (await db.select('memes', { eq: { id: img[2] }, limit: 1 }))[0];
      const data = row && (img[1] === 'avatar' ? row.avatar : row.img);
      if (!isDataImg(data)) { res.statusCode = 404; return res.end(); }
      const [, mime, b64] = data.match(/^data:(image\/\w+);base64,(.*)$/);
      res.statusCode = 200; res.setHeader('Content-Type', mime); res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.end(Buffer.from(b64, 'base64'));
    }
    /* --- нэвтэрсэн хэрэглэгч шаардлагатай --- */
    const me = sess && await getUser(sess.uid);
    if (!me) return send(res, 401, { error: 'Нэвтрээгүй' }, sess ? { 'Set-Cookie': cookie(req, '', 0) } : {});
    if (p === '/state') return send(res, 200, await buildState(me));
    if (p === '/stats/sync' && req.method === 'POST') {
      const b = await readBody(req); const target = b.userId && b.userId !== me.id ? await getUser(b.userId) : me;
      if (!target) return send(res, 404, { error: 'Олдсонгүй' });
      const r = await syncStats(target); await ping();
      return send(res, r.error ? 400 : 200, r);
    }
    if (p === '/action' && req.method === 'POST') {
      const b = await readBody(req); const fn = ACTIONS[b.type];
      if (!fn) return send(res, 400, { error: 'Тодорхойгүй үйлдэл' });
      const out = await fn(me, b.payload || {});
      await ping(out && out.fullstack ? { fullstack: out.fullstack } : {});
      return send(res, 200, { ok: true, ...(out || {}) });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    return send(res, /Supabase/.test(e.message) ? 500 : 400, { error: e.message || 'Алдаа' });
  }
}

module.exports = { handle, weekKey, dayKey };
