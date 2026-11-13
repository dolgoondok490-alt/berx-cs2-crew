/* =========================================================
 * Steam Web API · FACEIT Data API v4 · Leetify Public API v3
 * Бүгд server талд, key-ээр. Хариуг нэг стандарт хэлбэрт хувиргана.
 * ========================================================= */
'use strict';
const KEY = {
  steam: () => process.env.STEAM_API_KEY || '',
  faceit: () => process.env.FACEIT_API_KEY || '',
  leetify: () => process.env.LEETIFY_API_KEY || ''
};
const LEETIFY_BASE = () => (process.env.LEETIFY_BASE_URL || 'https://api-public.cs-prod.leetify.com').replace(/\/$/, '');
const FACEIT_BASE = 'https://open.faceit.com/data/v4';
const DAY = 864e5;

async function getJSON(url, headers = {}, timeout = 9000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) { const body = await r.text().catch(() => ''); throw new Error(`${new URL(url).host}${new URL(url).pathname} ${r.status} ${body.slice(0, 120)}`); }
    return await r.json();
  } catch (e) { if (e.name === 'AbortError') throw new Error(`${new URL(url).host} timeout`); throw e; }
  finally { clearTimeout(t); }
}
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };
const mapId = (name) => String(name || '').toLowerCase().replace(/^(de|cs|ar)_/, '').replace(/\s+/g, '') || 'unknown';
function toMs(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) { const n = +v; return n < 1e12 ? n * 1000 : n; }
  const t = Date.parse(v); return Number.isFinite(t) ? t : null;
}
// Leetify rating: API нь 0.031 гэх мэт буцаадаг, сайт дээр +3.10 гэж харуулдаг → ×100
const lrScale = (v) => { const n = num(v); if (n === null) return null; return Math.round((Math.abs(n) < 1 ? n * 100 : n) * 100) / 100; };
const pct = (v) => { const n = num(v); if (n === null) return null; return n <= 1 && n > 0 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10; };

/* ---------------- Steam ---------------- */
async function steamSummary(steamId) {
  if (!KEY.steam()) return null;
  const j = await getJSON(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${KEY.steam()}&steamids=${steamId}`);
  const p = j?.response?.players?.[0]; if (!p) return null;
  // gameid 730 = Counter-Strike 2 (profile нийтэд нээлттэй үед л харагдана)
  return { nick: p.personaname, avatar: p.avatarfull, personaState: p.personastate, inGame: String(p.gameid || '') === '730' };
}

/* ---------------- FACEIT ---------------- */
async function faceit(steamId) {
  if (!KEY.faceit()) return null;
  const H = { Authorization: `Bearer ${KEY.faceit()}` };
  let player = await getJSON(`${FACEIT_BASE}/players?game=cs2&game_player_id=${steamId}`, H);
  if (!player?.player_id) player = await getJSON(`${FACEIT_BASE}/players?game=csgo&game_player_id=${steamId}`, H);
  if (!player?.player_id) return { notFound: true };
  const g = player.games?.cs2 || {};
  const [st, hist] = await Promise.all([
    getJSON(`${FACEIT_BASE}/players/${player.player_id}/stats/cs2`, H).catch(() => null),
    getJSON(`${FACEIT_BASE}/players/${player.player_id}/games/cs2/stats?offset=0&limit=30`, H).catch(() => null)
  ]);
  const L = st?.lifetime || {};
  const matches = (hist?.items || []).map(it => {
    const s = it.stats || it;
    const k = num(pick(s, 'Kills')), d = num(pick(s, 'Deaths')), a = num(pick(s, 'Assists'));
    const score = String(pick(s, 'Score', 'Final Score') || '').replace(/\s/g, '').replace('/', ' – ');
    const res = String(pick(s, 'Result') ?? '');
    return {
      id: 'fc-' + (pick(s, 'Match Id', 'Match ID') || Math.random().toString(36).slice(2)),
      type: 'FACEIT', date: toMs(pick(s, 'Match Finished At', 'Finished At', 'Updated At', 'Created At', 'Date')),
      map: mapId(pick(s, 'Map')), result: res === '1' ? 'W' : res === '0' ? 'L' : (res || '?'),
      score: score || '—', k, d, a,
      kd: num(pick(s, 'K/D Ratio')) ?? (k !== null && d ? +(k / d).toFixed(2) : null),
      hsPct: num(pick(s, 'Headshots %')), adr: num(pick(s, 'ADR')),
      mvps: num(pick(s, 'MVPs')), rating: null, eloDelta: null, ratingDelta: null
    };
  }); // FACEIT аль хэдийн шинэ → хуучин дарааллаар ирдэг; огноогүй мөрийг хаяхгүй
  matches.sort((x, y) => (y.date || 0) - (x.date || 0));
  return {
    playerId: player.player_id, nickname: player.nickname, elo: g.faceit_elo ?? null, level: g.skill_level ?? null,
    url: player.faceit_url ? String(player.faceit_url).replace('{lang}', 'en') : null,
    lifetime: {
      kd: num(L['Average K/D Ratio']), wr: num(L['Win Rate %']), hs: num(L['Average Headshots %']),
      adr: num(pick(L, 'ADR', 'Average Damage per Round')), matches: num(L['Matches']), wins: num(L['Wins']),
      longestStreak: num(L['Longest Win Streak']), currentStreak: num(L['Current Win Streak'])
    },
    matches
  };
}

/* ---------------- Leetify ---------------- */
function leetifyHeaders() { return { Authorization: `Bearer ${KEY.leetify()}`, _leetify_key: KEY.leetify() }; }
// Premier-ийг баталгаатай ялгах: recent_matches.rank_type === 11 (CS2 Premier),
// эсвэл data_source 'matchmaking' бөгөөд rank нь CS Rating (1000+) байвал. Competitive map rank нь 1–18.
function leetifyType(source, rankType, rank) {
  const s = String(source || '').toLowerCase();
  if (s === 'faceit') return 'FACEIT';
  if (s.includes('wingman')) return 'Wingman';
  if (s === 'matchmaking_competitive') return 'Competitive';
  if (s === 'renown') return 'Renown';
  if ((s === 'matchmaking' || s === 'premier') && rank && rank > 100) return 'Premier'; // CS Rating (Competitive map rank нь 1–18)
  if (rankType !== null && rankType !== undefined) return +rankType === 11 ? 'Premier' : (s === 'matchmaking' ? 'Competitive' : (LT_SOURCE[s] || 'Matchmaking'));
  if (s === 'matchmaking' || s === 'premier') return rank && rank > 100 ? 'Premier' : (rank ? 'Competitive' : 'Premier');
  return LT_SOURCE[s] || 'Matchmaking';
}
const LT_SOURCE = { matchmaking: 'Premier', premier: 'Premier', matchmaking_competitive: 'Competitive', matchmaking_wingman: 'Wingman', faceit: 'FACEIT', renown: 'Renown' };
async function leetify(steamId) {
  if (!KEY.leetify()) return null;
  const H = leetifyHeaders();
  const [prof, games] = await Promise.all([
    getJSON(`${LEETIFY_BASE()}/v3/profile?steam64_id=${steamId}`, H),
    getJSON(`${LEETIFY_BASE()}/v3/profile/matches?steam64_id=${steamId}`, H).catch(() => null)
  ]);
  if (!prof) return { notFound: true };
  const recent = Array.isArray(prof.recent_matches) ? prof.recent_matches : [];
  const rankById = {}; recent.forEach(r => { if (r && r.id) rankById[r.id] = r; });
  const list = Array.isArray(games) ? games : Array.isArray(games?.matches) ? games.matches : Array.isArray(games?.data) ? games.data : [];
  const matches = list.slice(0, 60).map(g => {
    const me = (g.stats || []).find(p => String(p.steam64_id) === String(steamId));
    if (!me) return null;
    const rec = rankById[g.id] || {};
    const k = num(me.total_kills), d = num(me.total_deaths), a = num(me.total_assists);
    // Оноо, үр дүн: тоглогчийн өөрийн rounds_won / rounds_lost (баталгаатай), үгүй бол team_scores
    let won = num(me.rounds_won), lost = num(me.rounds_lost);
    if (won === null || lost === null) {
      const myTeam = pick(me, 'initial_team_number', 'team_number'); const ts = g.team_scores || [];
      won = num(ts.find(t => t.team_number === myTeam)?.score); lost = num(ts.find(t => t.team_number !== myTeam)?.score);
    }
    const outcome = String(pick(rec, 'outcome') || '').toLowerCase();
    const result = won !== null && lost !== null ? (won > lost ? 'W' : won < lost ? 'L' : 'T') : outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : outcome === 'tie' ? 'T' : '?';
    const rounds = num(me.rounds_count) || ((won || 0) + (lost || 0));
    const dmg = num(me.total_damage), hsK = num(me.total_hs_kills);
    const rank = num(pick(rec, 'rank')), rankType = pick(rec, 'rank_type') ?? null;
    return {
      id: 'lt-' + g.id, type: leetifyType(g.data_source, rankType, rank), source: g.data_source,
      date: toMs(g.finished_at), map: mapId(g.map_name), result,
      score: won !== null && lost !== null ? `${won} – ${lost}` : (Array.isArray(rec.score) ? rec.score.join(' – ') : '—'),
      k, d, a, kd: num(me.kd_ratio) !== null ? +num(me.kd_ratio).toFixed(2) : k !== null && d ? +(k / d).toFixed(2) : null,
      hsPct: hsK !== null && k ? Math.round(hsK / k * 100) : null,
      adr: num(me.dpr) !== null ? Math.round(num(me.dpr) * 10) / 10 : dmg !== null && rounds ? Math.round(dmg / rounds) : null,
      rating: lrScale(me.leetify_rating), rank, rankType, eloDelta: null, ratingDelta: null
    };
  }).filter(Boolean).sort((x, y) => (y.date || 0) - (x.date || 0));
  // Matches endpoint хоосон бол profile.recent_matches-аар (K/D-гүй)
  const fallback = !matches.length ? recent.map(r => ({
    id: 'lt-' + r.id, type: leetifyType(r.data_source, r.rank_type ?? null, num(r.rank)), source: r.data_source, date: toMs(r.finished_at), map: mapId(r.map_name),
    result: String(r.outcome || '').toLowerCase() === 'win' ? 'W' : String(r.outcome || '').toLowerCase() === 'loss' ? 'L' : 'T',
    score: Array.isArray(r.score) ? r.score.join(' – ') : '—', k: null, d: null, a: null, kd: null, hsPct: null, adr: null,
    rating: lrScale(r.leetify_rating), rank: num(r.rank), eloDelta: null, ratingDelta: null
  })).filter(m => m.date) : [];
  const all = matches.length ? matches : fallback;
  // Premier rating-ийн өөрчлөлт: тоглолт бүрийн rank-ийг өмнөхтэй нь харьцуулна
  const prem = all.filter(m => m.type === 'Premier');
  prem.forEach((m, i) => { const prev = prem.slice(i + 1).find(x => x.rank); if (m.rank && prev) m.ratingDelta = m.rank - prev.rank; });
  return {
    name: prof.name, premier: num(prof.ranks?.premier), faceitElo: num(prof.ranks?.faceit_elo), faceitLevel: num(prof.ranks?.faceit),
    winrate: pct(prof.winrate), totalMatches: num(prof.total_matches), privacy: prof.privacy_mode || null,
    rating: prof.rating || null, matches: all
  };
}

/* ---------------- Aggregate ---------------- */
function agg(list) {
  const withKd = list.filter(m => m.k !== null && m.d !== null);
  const k = withKd.reduce((s, m) => s + m.k, 0), d = withKd.reduce((s, m) => s + m.d, 0), a = withKd.reduce((s, m) => s + (m.a || 0), 0);
  const avg = (key) => { const v = list.map(m => m[key]).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const decided = list.filter(m => m.result === 'W' || m.result === 'L');
  return {
    matches: list.length, k, d, a, kd: d ? +(k / d).toFixed(2) : null,
    wr: decided.length ? Math.round(decided.filter(m => m.result === 'W').length / decided.length * 100) : null,
    hs: avg('hsPct') !== null ? Math.round(avg('hsPct')) : null, adr: avg('adr') !== null ? Math.round(avg('adr')) : null,
    rating: avg('rating') !== null ? +avg('rating').toFixed(2) : null,
    premierDelta: list.filter(m => m.ratingDelta).reduce((s, m) => s + m.ratingDelta, 0)
  };
}
function windows(all) {
  const now = Date.now();
  const inW = (days, off = 0) => all.filter(m => m.date <= now - off * days * DAY && m.date > now - (off + 1) * days * DAY);
  return {
    periods: { day: agg(inW(1)), week: agg(inW(7)), month: agg(inW(30)), all: agg(all) },
    weeks: [0, 1, 2, 3].map(w => agg(inW(7, w)))
  };
}

/** Бүх эх үүсвэрээс татаж нэгтгэнэ. Алдаа гарвал warnings-д бичээд үргэлжилнэ. */
async function fetchAll(steamId) {
  const warnings = [];
  const safe = async (name, fn) => { try { return await fn(); } catch (e) { warnings.push(`${name}: ${e.message}`); return null; } };
  const [sum, fc, lt] = await Promise.all([safe('Steam', () => steamSummary(steamId)), safe('FACEIT', () => faceit(steamId)), safe('Leetify', () => leetify(steamId))]);
  if (!KEY.steam()) warnings.push('STEAM_API_KEY тохируулаагүй');
  if (!KEY.faceit()) warnings.push('FACEIT_API_KEY тохируулаагүй'); else if (fc?.notFound) warnings.push('FACEIT данс олдсонгүй (Steam-ээ FACEIT-тэй холбосон эсэхийг шалга)');
  if (!KEY.leetify()) warnings.push('LEETIFY_API_KEY тохируулаагүй'); else if (lt?.notFound) warnings.push('Leetify профайл олдсонгүй (leetify.com-д Steam-ээрээ нэг нэвтэрнэ)');
  else if (lt && lt.privacy === 'private') warnings.push('Leetify профайл private байна');
  const fcOk = fc && !fc.notFound ? fc : null, ltOk = lt && !lt.notFound ? lt : null;
  const fcMatches = fcOk?.matches || [];
  const ltMatches = (ltOk?.matches || []).filter(m => m.type !== 'FACEIT' || !fcMatches.length); // FACEIT давхардлыг хасна
  const all = [...fcMatches, ...ltMatches].sort((x, y) => y.date - x.date);
  const premierList = ltMatches.filter(m => m.type === 'Premier');
  const { periods, weeks } = windows(all);
  if (fcOk && fcOk.lifetime && fcOk.lifetime.adr == null && fcMatches.length) fcOk.lifetime.adr = agg(fcMatches).adr; // lifetime-д ADR байхгүй бол сүүлийн тоглолтуудаас
  const L = fcOk?.lifetime || {};
  periods.all = { ...periods.all, kd: L.kd ?? periods.all.kd, wr: L.wr ?? periods.all.wr, hs: L.hs ?? periods.all.hs, adr: L.adr ?? periods.all.adr,
    matches: Math.max(L.matches || 0, ltOk?.totalMatches || 0, periods.all.matches) };
  const premAgg = agg(premierList);
  return {
    summary: sum,
    premier: ltOk?.premier || null,
    faceitElo: fcOk?.elo ?? ltOk?.faceitElo ?? null,
    faceitNick: fcOk?.nickname || null,
    live: {
      kd: periods.all.kd, wr: periods.all.wr, hs: periods.all.hs, adr: periods.all.adr, matches: periods.all.matches,
      faceitLevel: fcOk?.level ?? ltOk?.faceitLevel ?? null, recent: all.slice(0, 10).map(m => m.result),
      inGame: !!sum?.inGame, personaState: sum?.personaState ?? null,
      faceit: fcOk ? { elo: fcOk.elo, level: fcOk.level, nickname: fcOk.nickname, url: fcOk.url, lifetime: fcOk.lifetime, recent: agg(fcMatches.slice(0, 20)) } : null,
      premierStats: ltOk ? { rating: ltOk.premier, wr: premAgg.wr ?? ltOk.winrate, kd: premAgg.kd, hs: premAgg.hs, adr: premAgg.adr, matches: premierList.length,
        leetifyRating: premAgg.rating, totalMatches: ltOk.totalMatches, overallWr: ltOk.winrate, skill: ltOk.rating } : null,
      periods, weeks
    },
    matches: all.slice(0, 60),
    warnings
  };
}

module.exports = { steamSummary, fetchAll, keys: () => ({ steamApi: !!KEY.steam(), faceit: !!KEY.faceit(), leetify: !!KEY.leetify() }),
  _raw: { faceit, leetify, getJSON, leetifyHeaders, LEETIFY_BASE, FACEIT_BASE } };
