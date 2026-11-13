/* Steam Web API · FACEIT Data API · Leetify — бүгд server талд, key-ээр */
'use strict';
const STEAM_API_KEY = () => process.env.STEAM_API_KEY || '';
const FACEIT_API_KEY = () => process.env.FACEIT_API_KEY || '';
const LEETIFY_API_KEY = () => process.env.LEETIFY_API_KEY || '';
const LEETIFY_PROFILE_URL = () => process.env.LEETIFY_PROFILE_URL || 'https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=';

async function getJSON(url, headers = {}, timeout = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

async function steamSummary(steamId) {
  if (!STEAM_API_KEY()) return null;
  const j = await getJSON(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY()}&steamids=${steamId}`);
  const p = j?.response?.players?.[0]; if (!p) return null;
  // gameid 730 = Counter-Strike 2 (profile нийтэд нээлттэй үед л харагдана)
  return { nick: p.personaname, avatar: p.avatarfull, personaState: p.personastate, inGame: String(p.gameid || '') === '730' };
}

async function faceitStats(steamId) {
  if (!FACEIT_API_KEY()) return null;
  const H = { Authorization: `Bearer ${FACEIT_API_KEY()}` };
  const base = 'https://open.faceit.com/data/v4';
  const player = await getJSON(`${base}/players?game=cs2&game_player_id=${steamId}`, H);
  if (!player?.player_id) return { notFound: true };
  const g = player.games?.cs2 || {};
  const st = await getJSON(`${base}/players/${player.player_id}/stats/cs2`, H);
  const L = st?.lifetime || {};
  return {
    nickname: player.nickname, elo: g.faceit_elo ?? null, level: g.skill_level ?? null,
    kd: num(L['Average K/D Ratio']), wr: num(L['Win Rate %']), hs: num(L['Average Headshots %']),
    adr: num(L['ADR'] ?? L['Average Damage per Round']), matches: num(L['Matches']),
    recent: Array.isArray(L['Recent Results']) ? L['Recent Results'].map(x => (String(x) === '1' ? 'W' : 'L')) : []
  };
}

async function leetifyPremier(steamId) {
  if (!LEETIFY_API_KEY()) return null;
  const j = await getJSON(LEETIFY_PROFILE_URL() + steamId, { Authorization: `Bearer ${LEETIFY_API_KEY()}`, _leetify_key: LEETIFY_API_KEY() });
  if (!j) return { notFound: true };
  // TODO: өөрийн key-ээр хариуны бүтцийг шалгах (ranks.premier гэж үзсэн)
  return { premier: num(j?.ranks?.premier ?? j?.premier ?? j?.ranks?.premier_rating) };
}

/** Бүх эх үүсвэрээс нэгтгэж татна. Алдаа гарвал warnings-д бичээд үргэлжилнэ. */
async function fetchAll(steamId) {
  const warnings = [];
  const safe = async (name, fn) => { try { return await fn(); } catch (e) { warnings.push(`${name}: ${e.message}`); return null; } };
  const [sum, fc, lt] = await Promise.all([safe('Steam', () => steamSummary(steamId)), safe('FACEIT', () => faceitStats(steamId)), safe('Leetify', () => leetifyPremier(steamId))]);
  if (!STEAM_API_KEY()) warnings.push('STEAM_API_KEY тохируулаагүй');
  if (!FACEIT_API_KEY()) warnings.push('FACEIT_API_KEY тохируулаагүй'); else if (fc?.notFound) warnings.push('FACEIT данс олдсонгүй');
  if (!LEETIFY_API_KEY()) warnings.push('LEETIFY_API_KEY тохируулаагүй'); else if (lt && !lt.premier) warnings.push('Premier rating олдсонгүй');
  return {
    summary: sum,
    premier: lt?.premier || null, faceitElo: fc?.elo || null, faceitNick: fc?.nickname || null,
    live: { kd: fc?.kd ?? null, wr: fc?.wr ?? null, hs: fc?.hs ?? null, adr: fc?.adr ?? null, matches: fc?.matches ?? null,
      faceitLevel: fc?.level ?? null, recent: fc?.recent || [], inGame: !!sum?.inGame, personaState: sum?.personaState ?? null },
    warnings
  };
}

module.exports = { steamSummary, fetchAll, keys: () => ({ steamApi: !!STEAM_API_KEY(), faceit: !!FACEIT_API_KEY(), leetify: !!LEETIFY_API_KEY() }) };
