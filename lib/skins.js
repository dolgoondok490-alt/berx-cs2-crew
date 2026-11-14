/* =========================================================
 * BERX SKIN INVENTORY — сервер тал (Vercel function)
 * ---------------------------------------------------------
 *  Feature flags (Vercel env, анхдагчаар УНТРААЛТТАЙ):
 *    SKINS_ENABLED=1        → сайт дээрх SKIN INVENTORY хуудас, loadout хадгалах API
 *    SKINS_SYNC_ENABLED=1   → BERX Agent loadout-ыг WeaponPaints MySQL руу синк хийх endpoint
 *
 *  Аюулгүй байдал:
 *    • SteamID64-ийг ЗӨВХӨН нэвтэрсэн session-ий хэрэглэгчийн (users.steam_id) мөрөөс авна.
 *      Browser-ээс ирсэн steamId огт ашиглагдахгүй.
 *    • Item бүрийг WeaponPaints build-472-ийн өгөгдлөөс үүсгэсэн каталогоор шалгана
 *      (defindex+paint хослол, float хүрээ, seed, StatTrak боломж, agent-ийн баг).
 *    • Supabase-д зөвхөн service key-ээр (server) хандана; хүснэгтүүдэд RLS асаалттай.
 *    • Энэ систем тоглогчдын жинхэнэ Steam inventory-д item өгөхгүй, эзэмшил гэж харуулахгүй.
 * ========================================================= */
'use strict';
const db = require('./db');
const CATALOG = require('../assets/data/skins-catalog.json');

const TEAMS = ['2', '3'];                      // WeaponPaints: 2 = T, 3 = CT
const SEED_MAX = CATALOG.meta.seedMax || 1000;
const MAX_WEAPONS_PER_TEAM = 70;
const MAX_FAVORITES = 300;
const now = () => Date.now();
const enabled = () => process.env.SKINS_ENABLED === '1';
const syncEnabled = () => enabled() && process.env.SKINS_SYNC_ENABLED === '1';

/* ---------- каталогийн индекс ---------- */
const byId = new Map(CATALOG.items.map(i => [i.id, i]));
const weaponByDef = new Map(CATALOG.weapons.map(w => [w.d, w]));
const knifeDefs = new Set(CATALOG.weapons.filter(w => w.c === 'knives').map(w => w.d));
const gloveDefs = new Set(CATALOG.weapons.filter(w => w.c === 'gloves').map(w => w.d));
const agentByModel = new Map(CATALOG.items.filter(i => i.k === 'agent').map(i => [i.m, i]));

class ValidationError extends Error {}
const bad = (m) => { throw new ValidationError(m); };
const isInt = (v) => Number.isInteger(v);

function wearSeed(src, item, label) {
  const wear = Number(src.wear), seed = Number(src.seed);
  const [lo, hi] = item.f || [0, 1];
  if (!Number.isFinite(wear) || wear < lo - 1e-9 || wear > hi + 1e-9) bad(`${label}: wear ${lo}–${hi} хооронд байх ёстой`);
  if (!isInt(seed) || seed < 0 || seed > SEED_MAX) bad(`${label}: pattern seed 0–${SEED_MAX} бүхэл тоо`);
  return { wear: Math.round(Math.max(wear, 0.000001) * 1e6) / 1e6, seed };
}
function statTrak(src, item, label) {
  const st = src.st === 1 || src.st === true ? 1 : 0;
  if (st && !item.st) bad(`${label}: StatTrak энэ item-д байхгүй`);
  return st;
}
function nameTag(v, label) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v);
  if (s.length > 20 || /[\u0000-\u001f\u007f<>"'`\\;]/.test(s)) bad(`${label}: name tag 20 тэмдэгт хүртэл, тусгай тэмдэгтгүй`);
  return s;
}

/** Browser-ээс ирсэн loadout-ыг бүрэн шалгаж, зөвхөн зөвшөөрөгдсөн талбартай цэвэр хуулбар буцаана. */
function sanitizeLoadout(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Loadout буруу');
  const out = {};
  for (const k of Object.keys(input)) if (!TEAMS.includes(k)) bad('Баг зөвхөн T (2) эсвэл CT (3)');
  for (const team of TEAMS) {
    const t = input[team] || {};
    const res = { weapons: {}, knife: null, gloves: null, agent: null };
    const weapons = t.weapons || {};
    if (typeof weapons !== 'object' || Array.isArray(weapons)) bad('weapons буруу');
    const keys = Object.keys(weapons);
    if (keys.length > MAX_WEAPONS_PER_TEAM) bad('Хэт олон зэвсэг');
    for (const key of keys) {
      const d = Number(key), w = weapons[key] || {};
      const def = weaponByDef.get(d);
      if (!isInt(d) || !def || def.c === 'knives' || def.c === 'gloves') bad(`Зэвсэг ${key} буруу`);
      const p = Number(w.p);
      const item = byId.get(`${d}-${p}`);
      if (!item || item.k !== 'weapon') bad(`${def.wn}: skin ${w.p} энэ зэвсэгт байхгүй`);
      res.weapons[d] = { p, ...wearSeed(w, item, item.wn + ' | ' + item.n), st: statTrak(w, item, item.n), tag: nameTag(w.tag, item.n) };
    }
    if (t.knife) {
      const d = Number(t.knife.d), p = Number(t.knife.p || 0);
      if (!knifeDefs.has(d)) bad('Хутганы загвар буруу');
      const item = byId.get(`${d}-${p}`);
      if (!item || item.k !== 'knife') bad('Хутганы finish буруу');
      res.knife = { d, w: weaponByDef.get(d).w, p, ...(p ? wearSeed(t.knife, item, 'Хутга') : { wear: 0.000001, seed: 0 }), st: statTrak(t.knife, item, 'Хутга'), tag: nameTag(t.knife.tag, 'Хутга') };
    }
    if (t.gloves) {
      const d = Number(t.gloves.d), p = Number(t.gloves.p);
      const item = byId.get(`${d}-${p}`);
      if (!gloveDefs.has(d) || !item || item.k !== 'gloves') bad('Бээлий буруу');
      res.gloves = { d, p, ...wearSeed(t.gloves, item, 'Бээлий') };
    }
    if (t.agent) {
      const a = agentByModel.get(String(t.agent));
      if (!a || String(a.t) !== team) bad('Agent буруу эсвэл өөр багийнх');
      res.agent = a.m;
    }
    out[team] = res;
  }
  return out;
}

function sanitizeFavorites(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(String).filter(id => byId.has(id)))].slice(0, MAX_FAVORITES);
}

const emptyLoadout = () => ({ '2': { weapons: {}, knife: null, gloves: null, agent: null }, '3': { weapons: {}, knife: null, gloves: null, agent: null } });

function requireSteam(me) {
  if (!enabled()) bad('SKIN INVENTORY идэвхгүй байна');
  if (!me) bad('Нэвтэрнэ үү');
  if (!/^7656119\d{10}$/.test(me.steam_id || '')) bad('Steam данс холбоно уу (Тохиргоо → Профайл) — loadout SteamID64-д хадгалагдана');
  return me.steam_id;
}

async function readRow(steamId) {
  return (await db.select('skin_loadouts', { eq: { steam_id: steamId }, limit: 1 }))[0] || null;
}
async function readSync(steamId) {
  return (await db.select('skin_sync', { eq: { steam_id: steamId }, limit: 1 }))[0] || null;
}

async function myState(me) {
  const steamId = requireSteam(me);
  const [row, sync, srv] = await Promise.all([readRow(steamId), readSync(steamId), db.select('server_state', { eq: { id: 'main' }, limit: 1 }).catch(() => [])]);
  const sd = (srv[0] && srv[0].data) || {};
  const online = !!srv[0] && sd.online !== false && now() - srv[0].updated_at < 25e3;
  return {
    enabled: true, syncEnabled: syncEnabled(),
    steamId, loadout: row ? row.loadout : emptyLoadout(), favorites: row ? row.favorites || [] : [],
    version: row ? Number(row.version) : 0, updatedAt: row ? row.updated_at : null,
    sync: sync ? { version: Number(sync.version), status: sync.status, error: sync.error || null, syncedAt: sync.synced_at, appliedAt: sync.applied_at || null } : null,
    server: { online, agentSkins: sd.skins || null, inGame: Array.isArray(sd.players) && sd.players.some(p => p.steamId === steamId) }
  };
}

async function save(me, p) {
  const steamId = requireSteam(me);
  const loadout = sanitizeLoadout(p.loadout);
  const prev = await readRow(steamId);
  const version = prev ? Number(prev.version) + 1 : 1;
  await db.upsert('skin_loadouts', { steam_id: steamId, user_id: me.id, loadout, favorites: prev ? prev.favorites || [] : [], version, updated_at: now() }, ['steam_id']);
  return { version };
}

async function favorites(me, p) {
  const steamId = requireSteam(me);
  const fav = sanitizeFavorites(p.favorites);
  const prev = await readRow(steamId);
  if (prev) await db.update('skin_loadouts', { steam_id: steamId }, { favorites: fav });
  else await db.upsert('skin_loadouts', { steam_id: steamId, user_id: me.id, loadout: emptyLoadout(), favorites: fav, version: 0, updated_at: now() }, ['steam_id']);
  return { favorites: fav };
}

async function clearAll(me, p) {
  const steamId = requireSteam(me);
  if (p.confirm !== 'CLEAR') bad('Баталгаажуулалт хэрэгтэй');
  const prev = await readRow(steamId);
  const version = prev ? Number(prev.version) + 1 : 1;
  await db.upsert('skin_loadouts', { steam_id: steamId, user_id: me.id, loadout: emptyLoadout(), favorites: prev ? prev.favorites || [] : [], version, updated_at: now() }, ['steam_id']);
  return { version };
}

const ACTIONS = {
  async 'skins.save'(me, p) { return { skins: await save(me, p) }; },
  async 'skins.favorites'(me, p) { return { skins: await favorites(me, p) }; },
  async 'skins.clear'(me, p) { return { skins: await clearAll(me, p) }; }
};

/* ---------- Agent endpoint-ууд (Bearer SERVER_AGENT_SECRET) ----------
 *  GET  /api/server/agent/skins/pending  → хараахан синк хийгдээгүй loadout-ууд
 *  POST /api/server/agent/skins/ack      → { steamId, version, ok, error, applied }
 */
async function agentPending() {
  const [rows, syncs] = await Promise.all([db.select('skin_loadouts', {}), db.select('skin_sync', {})]);
  const done = new Map(syncs.map(s => [s.steam_id, s]));
  const pending = rows
    .filter(r => Number(r.version) > 0)
    .filter(r => { const s = done.get(r.steam_id); return !s || Number(s.version) < Number(r.version) || s.status !== 'ok'; })
    .filter(r => { const s = done.get(r.steam_id); return !(s && s.status === 'error' && /^Хадгалсан loadout буруу/.test(s.error || '') && Number(s.version) === Number(r.version)); })
    .sort((a, b) => a.updated_at - b.updated_at)
    .slice(0, 25);
  const items = [];
  for (const r of pending) {
    try { items.push({ steamId: r.steam_id, version: Number(r.version), loadout: sanitizeLoadout(r.loadout) }); }  // DB-д байсан ч дахин шалгана
    catch (e) {  // эвдэрсэн мөр бусдыг хаахгүй: алдаа тэмдэглээд алгасна
      const s = done.get(r.steam_id);
      if (!s || Number(s.version) !== Number(r.version) || s.status !== 'error')
        await db.upsert('skin_sync', { steam_id: r.steam_id, version: Number(r.version), status: 'error', error: 'Хадгалсан loadout буруу: ' + e.message, synced_at: now(), applied_at: s ? s.applied_at : null }, ['steam_id']);
    }
  }
  return items;
}

async function agentAck(b) {
  const steamId = String(b.steamId || '');
  if (!/^7656119\d{10}$/.test(steamId)) bad('steamId');
  const version = Number(b.version);
  if (!Number.isInteger(version) || version < 0) bad('version');
  const row = await readRow(steamId);
  if (!row) bad('loadout алга');
  const prev = await readSync(steamId);
  if (prev && Number(prev.version) > version && prev.status === 'ok') return { ignored: true };  // хуучин ack
  await db.upsert('skin_sync', {
    steam_id: steamId, version, status: b.ok ? 'ok' : 'error', error: b.ok ? null : String(b.error || 'алдаа').slice(0, 300),
    synced_at: now(), applied_at: b.ok && b.applied ? now() : (prev && prev.applied_at) || null
  }, ['steam_id']);
  return { ok: true };
}

async function handle(req, res, p, { send, readBody, me, agentAuthorized }) {
  try {
    if (p === '/skins/state') {
      if (!enabled()) return send(res, 404, { error: 'SKIN INVENTORY идэвхгүй', disabled: true });
      if (!me) return send(res, 401, { error: 'Нэвтэрнэ үү' });
      return send(res, 200, await myState(me));
    }
    if (p.startsWith('/server/agent/skins/')) {
      if (!agentAuthorized(req)) return send(res, 401, { error: 'agent' });
      if (!syncEnabled()) return send(res, 404, { error: 'SKINS_SYNC_ENABLED унтраалттай', disabled: true });
      if (p === '/server/agent/skins/pending' && req.method === 'GET') return send(res, 200, { items: await agentPending() });
      if (p === '/server/agent/skins/ack' && req.method === 'POST') return send(res, 200, await agentAck(await readBody(req)));
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    if (e instanceof ValidationError) return send(res, 400, { error: e.message });
    throw e;
  }
}

module.exports = { enabled, syncEnabled, ACTIONS, handle, sanitizeLoadout, sanitizeFavorites, ValidationError, CATALOG };
