/* =========================================================
 * BERX MATCH HISTORY — backend
 *   • POST /api/server/agent/matches   (Bearer SERVER_AGENT_SECRET)  — албан ёсны дүн, зөвхөн BERX Agent
 *   • GET  /api/berx/matches?mode=&mine=1&before=&limit=            — нэвтэрсэн гишүүд
 *   • GET  /api/berx/matches/<id>
 *   • GET  /api/berx/players/<steamId64>/stats?mode=
 * Browser-оос ирсэн дүнг хэзээ ч хүлээж авахгүй. Нууц (service_role, agent secret) frontend-д хэзээ ч гарахгүй.
 * ========================================================= */
'use strict';
const db = require('./db');
const ranking = require('./ranking');
let CATALOG = []; try { CATALOG = require('../agent/arena-modes').loadCatalog(); } catch (e) { CATALOG = []; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STEAM = /^7656119\d{10}$/;
const MODES = ['competitive', 'aim1v1', 'aim2v2'];
const STATUSES = ['completed', 'aborted', 'interrupted'];
const WEAPONS = ['ak47', 'm4a4', 'm4a1s', 'awp'];
const MIN_TS = Date.UTC(2024, 0, 1);

function bad(msg) { const e = new Error(msg); e.status = 400; throw e; }
const int = (v, min, max, name) => { const x = Number(v); if (!Number.isInteger(x) || x < min || x > max) bad(`${name}: ${min}-${max} бүхэл тоо`); return x; };
const optInt = (v, min, max, name) => (v === null || v === undefined ? null : int(v, min, max, name));
const str = (v, re, name, opt = false) => { if (opt && (v === null || v === undefined || v === '')) return null; if (typeof v !== 'string' || !re.test(v)) bad(`${name} буруу`); return v; };

// Agent-ийн илгээсэн тоглолтын дүнг хатуу шалгана (DB-ийн check-ээс өмнө, ойлгомжтой алдаатай)
function validateMatch(p, now = Date.now()) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) bad('payload буруу');
  const m = {
    id: str(p.id, UUID, 'id'), revision: optInt(p.revision, 1, 1000, 'revision') || 1,
    server_id: str(p.server_id, /^[a-z0-9_-]{1,32}$/, 'server_id'), source: str(p.source, /^(matchzy|cs2log)$/, 'source'),
    external_ref: str(p.external_ref, /^[\w:.-]{1,64}$/, 'external_ref', true), agent_version: str(p.agent_version, /^[\w.-]{1,16}$/, 'agent_version', true),
    mode: str(p.mode, /^(competitive|aim1v1|aim2v2)$/, 'mode'), map: str(p.map, /^[a-z0-9_]{1,64}$/, 'map'),
    workshop_id: str(p.workshop_id, /^\d{6,12}$/, 'workshop_id', true), aim_weapon: str(p.aim_weapon, /^(ak47|m4a4|m4a1s|awp)$/, 'aim_weapon', true),
    target_rounds: optInt(p.target_rounds, 1, 99, 'target_rounds'), status: str(p.status, /^(completed|aborted|interrupted)$/, 'status'),
    status_reason: str(p.status_reason, /^[\w .:-]{1,64}$/, 'status_reason', true),
    started_at: int(p.started_at, MIN_TS, now + 300000, 'started_at'), ended_at: int(p.ended_at, MIN_TS, now + 300000, 'ended_at'),
    rounds_played: int(p.rounds_played, 0, 200, 'rounds_played'), score_ct: int(p.score_ct, 0, 99, 'score_ct'), score_t: int(p.score_t, 0, 99, 'score_t'),
    winner: p.winner === null || p.winner === undefined ? null : str(p.winner, /^(CT|T|draw)$/, 'winner'),
    has_damage: p.has_damage === true, has_mvp: p.has_mvp === true,
    // Ranked/Casual: agent тоглолт эхлэхэд түгжсэн. Байхгүй/бусад → casual. Ranked бол lock (roster, дүрэм, guard) заавал.
    match_type: p.match_type === 'ranked' ? 'ranked' : 'casual'
  };
  m.lock = m.match_type === 'ranked' ? ranking.validateLock(p.lock, m.mode) : null;
  if (m.ended_at < m.started_at || m.ended_at - m.started_at > 86400000) bad('хугацаа буруу');
  if (m.mode === 'competitive' && (m.aim_weapon || m.target_rounds)) bad('competitive-д AIM тохиргоо байхгүй');
  if (m.mode !== 'competitive' && (!m.aim_weapon || !m.target_rounds)) bad('AIM тоглолтод зэвсэг, round тоо заавал');
  if (m.status === 'completed') {
    if (!m.winner) bad('completed тоглолтод ялагч заавал');
    if (m.winner === 'draw' ? m.score_ct !== m.score_t : (m.winner === 'CT' ? m.score_ct <= m.score_t : m.score_t <= m.score_ct)) bad('ялагч оноотой таарахгүй');
    if (m.target_rounds && Math.max(m.score_ct, m.score_t) !== m.target_rounds) bad('AIM: ялагч зорилтот round-д хүрээгүй');
  } else if (m.winner) bad('дуусаагүй тоглолтод ялагч байхгүй');
  if (m.score_ct + m.score_t > m.rounds_played) bad('оноо round-ын тооноос их');
  if (!Array.isArray(p.players) || p.players.length > 20) bad('players буруу');
  const seen = new Set();
  m.players = p.players.map((x, i) => {
    if (!x || typeof x !== 'object') bad(`players[${i}] буруу`);
    const pl = {
      steam_id: str(x.steam_id, STEAM, `players[${i}].steam_id`), name: typeof x.name === 'string' ? x.name.replace(/[\u0000-\u001f]/g, '').slice(0, 64) : '',
      team: str(x.team, /^(CT|T)$/, `players[${i}].team`), kills: int(x.kills, 0, 500, 'kills'), deaths: int(x.deaths, 0, 500, 'deaths'),
      assists: int(x.assists, 0, 500, 'assists'), headshot_kills: int(x.headshot_kills, 0, 500, 'headshot_kills'),
      team_kills: optInt(x.team_kills, 0, 500, 'team_kills') || 0, suicides: optInt(x.suicides, 0, 500, 'suicides') || 0,
      damage: m.has_damage ? int(x.damage, 0, 100000, 'damage') : null, mvp: m.has_mvp ? int(x.mvp, 0, 200, 'mvp') : null,
      rounds_played: int(x.rounds_played, 0, 200, 'rounds_played'), connected_at_end: x.connected_at_end !== false
    };
    if (pl.headshot_kills > pl.kills) bad('headshot > kills');
    if (pl.rounds_played > m.rounds_played) bad('тоглогчийн round тоглолтынхоос их');
    if (seen.has(pl.steam_id)) bad('давхардсан SteamID'); seen.add(pl.steam_id);
    return pl;
  });
  return m;
}

const resultOf = (status, winner, team) => (status !== 'completed' ? null : winner === 'draw' ? 'draw' : winner === team ? 'win' : 'loss');

// SQL berx_ingest_match-ийн JS хувилбар (локал JSON DB болон тестийн хуурамч Supabase). Нэг утгатай: tests/matches/sql.mjs харьцуулна.
function ingestLocal(T, m, now = Date.now()) {
  T.berx_matches ||= []; T.berx_match_players ||= [];
  const i = T.berx_matches.findIndex(r => r.id === m.id);
  if (i >= 0 && T.berx_matches[i].revision >= m.revision) return { ok: true, duplicate: true, id: m.id };
  const clash = T.berx_matches.find(r => r.id !== m.id && r.server_id === m.server_id && +r.started_at === +m.started_at);
  if (clash) { const e = new Error('duplicate key value violates unique constraint (server_id, started_at)'); e.status = 409; throw e; }
  const { players, ...row } = m;
  const keep = i >= 0 ? { match_type: T.berx_matches[i].match_type, lock: T.berx_matches[i].lock ?? null } : { match_type: m.match_type || 'casual', lock: m.lock || null };   // анх л бичигдэнэ
  const full = { ...row, ...keep, season_id: null, duration_s: Math.max(0, Math.floor((m.ended_at - m.started_at) / 1000)), player_count: players.length,
    ingested_at: i >= 0 ? T.berx_matches[i].ingested_at : now, updated_at: now };
  if (i >= 0) T.berx_matches[i] = full; else T.berx_matches.push(full);
  T.berx_match_players = T.berx_match_players.filter(r => r.match_id !== m.id);
  for (const p of players) T.berx_match_players.push({ match_id: m.id, ...p, result: resultOf(m.status, m.winner, p.team), mode: m.mode, status: m.status, started_at: m.started_at });
  return { ok: true, duplicate: false, id: m.id };
}

/* ---------- Нэгтгэл (профайл) ----------
 * Зөвхөн completed тоглолт. K/D, HS%, ADR нь НИЙТ дүнгээс (тоглолт бүрийн харьцааны дундаж биш).
 * ADR: зөвхөн damage бүртгэгдсэн тоглолтуудын нийт damage / тэдгээрийн нийт round. */
function aggregate(rows) {
  const done = rows.filter(r => r.status === 'completed');
  const sum = (k, list = done) => list.reduce((a, r) => a + (+r[k] || 0), 0);
  const withDmg = done.filter(r => r.damage !== null && r.damage !== undefined);
  const kills = sum('kills'), deaths = sum('deaths'), hs = sum('headshot_kills');
  const wins = done.filter(r => r.result === 'win').length, losses = done.filter(r => r.result === 'loss').length, draws = done.filter(r => r.result === 'draw').length;
  const dmgRounds = sum('rounds_played', withDmg);
  return {
    matches: done.length, wins, losses, draws, winRate: done.length ? Math.round(wins / done.length * 1000) / 10 : null,
    kills, deaths, assists: sum('assists'), headshotKills: hs,
    kd: done.length ? (deaths ? Math.round(kills / deaths * 100) / 100 : kills) : null,
    hsPct: kills ? Math.round(hs / kills * 1000) / 10 : null,
    adr: withDmg.length && dmgRounds ? Math.round(sum('damage', withDmg) / dmgRounds * 10) / 10 : null, adrMatches: withDmg.length,
    roundsPlayed: sum('rounds_played'), unfinished: rows.length - done.length
  };
}

/* ---------- DB ---------- */
async function ingest(m) {
  if (db.name === 'supabase') return db.rpc('berx_ingest_match', { p: m });
  return db.local(T => ingestLocal(T, m));
}
const wsOf = (r) => (r.workshop_id && CATALOG.find(c => c.workshopId === r.workshop_id)) || null;
const imageOf = (r) => { const e = wsOf(r); return e ? e.image : null; };
const MATCH_COLS = 'id,server_id,source,mode,match_type,map,workshop_id,aim_weapon,target_rounds,status,status_reason,started_at,ended_at,duration_s,rounds_played,score_ct,score_t,winner,player_count,has_damage,has_mvp';
const PLAYER_COLS = 'match_id,steam_id,name,team,kills,deaths,assists,headshot_kills,team_kills,suicides,damage,mvp,rounds_played,connected_at_end,result,mode,status,started_at';
async function membersBySteam() {
  const us = await db.select('users', { columns: 'id,nick,steam_id,avatar,avatar_v' });
  return Object.fromEntries(us.filter(u => u.steam_id).map(u => [u.steam_id, u]));
}
function pub(r, extra = {}) { const ws = wsOf(r); return { ...Object.fromEntries(MATCH_COLS.split(',').map(k => [k, r[k] ?? null])), image: imageOf(r), map_title: ws ? ws.name : null, ...extra }; }

async function list(me, q) {
  const mode = MODES.includes(q.get('mode')) ? q.get('mode') : null;
  const limit = Math.min(50, Math.max(1, +q.get('limit') || 20));
  const before = /^\d{10,16}$/.test(q.get('before') || '') ? +q.get('before') : null;
  const mine = q.get('mine') === '1';
  if (mine && !me.steam_id) return { items: [], next: null, needSteam: true };
  let rows;
  if (mine) {
    const f = { eq: { steam_id: me.steam_id, ...(mode ? { mode } : {}) }, order: 'started_at.desc', limit: limit + 1, columns: 'match_id,team,result,started_at' };
    if (before) f.lt = { started_at: before };
    const mp = await db.select('berx_match_players', f);
    const ms = mp.length ? await db.select('berx_matches', { in: { id: mp.map(x => x.match_id) }, columns: MATCH_COLS }) : [];
    const byId = Object.fromEntries(ms.map(r => [r.id, r]));
    rows = mp.map(x => byId[x.match_id]).filter(Boolean);
  } else {
    const f = { order: 'started_at.desc', limit: limit + 1, columns: MATCH_COLS };
    if (mode) f.eq = { mode };
    if (before) f.lt = { started_at: before };
    rows = await db.select('berx_matches', f);
  }
  const more = rows.length > limit; rows = rows.slice(0, limit);
  // Нэвтэрсэн хэрэглэгчийн үр дүн (тоглосон бол)
  const mineRows = me.steam_id && rows.length ? await db.select('berx_match_players', { eq: { steam_id: me.steam_id }, in: { match_id: rows.map(r => r.id) }, columns: 'match_id,team,result' }) : [];
  const myBy = Object.fromEntries(mineRows.map(x => [x.match_id, x]));
  const rk = await ranking.matchInfo(rows.map(r => r.id), me.id);   // Casual тоглолтын түүхэн нөхөн бүртгэлийг ч харуулна
  return { items: rows.map(r => pub(r, { me: myBy[r.id] ? { team: myBy[r.id].team, result: myBy[r.id].result } : null, ranking: rankPub(r, rk[r.id]) })), next: more ? rows[rows.length - 1].started_at : null };
}

async function detail(me, id) {
  if (!UUID.test(id)) return null;
  const [r] = await db.select('berx_matches', { eq: { id }, columns: MATCH_COLS });
  if (!r) return null;
  const ps = await db.select('berx_match_players', { eq: { match_id: id }, columns: PLAYER_COLS });
  const mem = await membersBySteam();
  const players = ps.map(p => {
    const u = mem[p.steam_id];
    return { steamId: p.steam_id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, assists: p.assists, headshotKills: p.headshot_kills,
      teamKills: p.team_kills, suicides: p.suicides, damage: r.has_damage ? p.damage : null, mvp: r.has_mvp ? p.mvp : null, roundsPlayed: p.rounds_played,
      connectedAtEnd: p.connected_at_end, result: p.result, isMe: !!me.steam_id && p.steam_id === me.steam_id,
      member: u ? { id: u.id, nick: u.nick } : null };
  }).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const rk = (await ranking.matchInfo([id], me.id))[id] || null;
  if (rk) for (const pl of players) { const c = rk.changes[pl.steamId]; pl.brp = c ? { delta: c.delta, score: c.score, brp: c.brp, weights: c.weights, components: c.components } : null; }
  return pub(r, { players, ranking: rankPub(r, rk) });
}
// Жагсаалт/дэлгэрэнгүйд харуулах шийдвэр (Casual → null). Шийдвэр хараахан гараагүй ranked → pending.
function rankPub(r, rk) {
  // Casual тоглолт: зөвхөн admin баталсан түүхэн нөхөн бүртгэл (008) байвал (төрөл нь Casual хэвээр)
  if (r.match_type !== 'ranked') return rk && rk.origin === 'historical_import' ? { status: rk.status, reason: rk.reason, formula: rk.formula || null, flag: rk.flag || null, me: rk.me || null, historical: true } : null;
  if (!rk) return { status: 'pending', reason: null, me: null };
  return { status: rk.status, reason: rk.reason, formula: rk.formula || null, flag: rk.flag || null, me: rk.me || null };
}

async function playerStats(steamId, q) {
  if (!STEAM.test(steamId)) return null;
  const mode = MODES.includes(q.get('mode')) ? q.get('mode') : null;
  const rows = await db.select('berx_match_players', { eq: { steam_id: steamId, ...(mode ? { mode } : {}) }, order: 'started_at.desc', limit: 1000, columns: PLAYER_COLS });
  const recent = rows.slice(0, 10);
  const ms = recent.length ? await db.select('berx_matches', { in: { id: recent.map(x => x.match_id) }, columns: MATCH_COLS }) : [];
  const byId = Object.fromEntries(ms.map(r => [r.id, r]));
  return { steamId, mode: mode || 'all', ...aggregate(rows),
    recent: recent.filter(x => byId[x.match_id]).map(x => pub(byId[x.match_id], { me: { team: x.team, result: x.result, kills: x.kills, deaths: x.deaths, assists: x.assists } })) };
}

async function handle(req, res, p, { send, readBody, me, agentAuthorized }) {
  try {
    if (p === '/server/agent/matches') {
      if (!agentAuthorized(req)) return send(res, 401, { error: 'agent unauthorized' });
      if (req.method !== 'POST') return send(res, 405, { error: 'POST' });
      const body = await readBody(req);
      const m = validateMatch(body && body.match);
      const r = await ingest(m);
      // Ranked: сервер өөрөө шийдвэрлэнэ (idempotent). Шийдвэр DB-д бичигдэж чадаагүй бол 500 → agent дахин илгээж, дахин оролдоно.
      const rk = await ranking.rate(m.id);
      return send(res, 200, { ok: true, duplicate: !!(r && r.duplicate), id: m.id, ranking: rk ? { status: rk.status, reason: rk.reason || null } : null });
    }
    if (!me) return send(res, 401, { error: 'Нэвтрэх шаардлагатай' });
    if (req.method !== 'GET') return send(res, 405, { error: 'GET' });
    const u = new URL(req.url, 'http://x');
    if (p === '/berx/matches') return send(res, 200, await list(me, u.searchParams));
    let m = p.match(/^\/berx\/matches\/([\w-]{36})$/);
    if (m) { const d = await detail(me, m[1]); return d ? send(res, 200, d) : send(res, 404, { error: 'Тоглолт олдсонгүй' }); }
    m = p.match(/^\/berx\/players\/(\d{17})\/stats$/);
    if (m) { const s = await playerStats(m[1], u.searchParams); return s ? send(res, 200, s) : send(res, 400, { error: 'SteamID буруу' }); }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    const st = e.status || (/23505|duplicate key|unique constraint/i.test(e.message) ? 409 : /22023|23514|violates check/i.test(e.message) ? 400 : 500);
    return send(res, st, { error: st === 500 ? 'Серверийн алдаа' : e.message });
  }
}

module.exports = { handle, validateMatch, ingestLocal, aggregate, resultOf, MODES, STATUSES, WEAPONS };
