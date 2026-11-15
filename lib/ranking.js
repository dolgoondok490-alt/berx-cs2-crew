/* =========================================================
 * BERX RANKED & BRP — backend (Phase 3)
 *  • Тоглолт бүрийн шийдвэрийг ЗӨВХӨН сервер гаргана: agent → /api/server/agent/matches → ingest → rate(matchId).
 *    Browser-оос ирсэн дүн, төрөл, SteamID-д хэзээ ч итгэхгүй. match_type нь agent тоглолт эхлэхэд түгжсэн утга.
 *  • BRP-ийн албан ёсны эх сурвалж = berx_rating_changes (ledger). berx_ratings = ledger-ээс үүссэн кэш.
 *  • SQL: supabase/006_rankings.sql (berx_apply_rating — нэг transaction, давхар олголтгүй, 0-ээс доош орохгүй).
 *    JS mirror (applyLocal г.м.) нь локал JSON DB болон тестийн хуурамч Supabase-д — SQL-тэй ижил үр дүн (tests/ranking/sql.mjs).
 *  • Бүх flag анхдагчаар УНТРААЛТТАЙ.
 * ========================================================= */
'use strict';
const db = require('./db');

const FORMULA = 'competitive-v1';
const AIM_FORMULA = 'aim-fixed-v1';
const START_BRP = 1000;
const AIM_DELTA = 30;
const MIN_AGENT = '1.5.0';
const MODES = ['competitive', 'aim1v1', 'aim2v2'];
const SIZE = { competitive: 5, aim1v1: 1, aim2v2: 2 };
const STEAM = /^7656119\d{10}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Anti-farming / sanity — admin өөрчилж болно (хэт хатуу биш: зөрчил → шууд хасахгүй, admin шалгалт руу)
const DEFAULT_RULES = {
  min_rounds_competitive: 13,          // MR12-ийн хамгийн бага бодит тоглолт (13:0)
  min_duration_competitive_s: 900,     // 15 мин-аас богино 5v5 → шалгалт
  min_duration_aim_s: 60,
  min_participation: 0.5,              // roster-ийн тоглогч round-ын 50%-иас бага тоглосон (disconnect) → шалгалт
  max_same_lineup_24h_competitive: 3,  // яг ижил 2 баг 24 цагт 3-аас олон ranked → шалгалт
  max_same_lineup_24h_aim: 6
};
function cleanRules(r = {}) {
  const out = { ...DEFAULT_RULES };
  for (const [k, def] of Object.entries(DEFAULT_RULES)) {
    if (r[k] === undefined || r[k] === null || r[k] === '') continue;
    const v = Number(r[k]);
    const max = k === 'min_participation' ? 1 : k.includes('duration') ? 7200 : 100;
    if (!Number.isFinite(v) || v < 0 || v > max) throw bad(`${k}: 0-${max}`);
    out[k] = k === 'min_participation' ? Math.round(v * 100) / 100 : Math.round(v);
    void def;
  }
  return out;
}

/* ---------- Зэрэглэл ---------- */
const RANKS = [
  { id: 'rookie', name: 'ROOKIE', min: 0, max: 1999 },
  { id: 'hunter', name: 'HUNTER', min: 2000, max: 2999 },
  { id: 'reaper', name: 'REAPER', min: 3000, max: 3999 },
  { id: 'dominator', name: 'DOMINATOR', min: 4000, max: 4999 },
  { id: 'immortal', name: 'IMMORTAL', min: 5000, max: null }
];
const rankOf = (brp) => RANKS.slice().reverse().find(r => brp >= r.min) || RANKS[0];
const nextRank = (brp) => RANKS.find(r => r.min > brp) || null;

/* ---------- Шалтгаан (UI нь Монгол бичвэрийг js/pages/ranking.js-д харуулна) ---------- */
const REASONS = {
  ok: 'rated', ranking_disabled: 'not_eligible', mode_disabled: 'not_eligible', before_activation: 'not_eligible', old_agent: 'not_eligible',
  no_lock: 'not_eligible', not_completed: 'not_eligible', draw: 'not_eligible', first_to_10: 'not_eligible', guard_missing: 'not_eligible',
  roster_size: 'not_eligible', bots: 'not_eligible', unlinked_player: 'not_eligible', duplicate_player: 'not_eligible', duplicate_ref: 'not_eligible',
  rules_mismatch: 'review', extra_player: 'review', team_mismatch: 'review', low_participation: 'review', too_short: 'review', farming_lineup: 'review',
  error: 'error'
};

function bad(msg) { const e = new Error(msg); e.status = 400; return e; }
const clamp = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const r2 = (x) => Math.round(x * 100) / 100;
const verGte = (a, b) => {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return true;
};

/* =========================================================
 * Competitive performance score — competitive-v1 (тодорхой, 0–100, нэг оролт → нэг гаралт)
 *   Бүх хэмжүүр round-д ногдохоор (rp = тухайн тоглогчийн тоглосон round) → overtime, эрт гарсан тоглогч шударга.
 *   K/D 30%:   0.6·clamp(KPR/1.2) + 0.4·clamp(1 − DPR)          KPR = (kills − team_kills)/rp
 *   ADR 30%:   clamp(ADR/150)                                   damage бүртгэгдээгүй бол жинг бусдад хуваарилна
 *   Баг 25%:   clamp(share·n/2)  share = тоглогчийн impact / багийн нийт impact, impact = (K + 0.4·A [+ dmg/100]) / rp
 *              (багийн дундаж = 0.5; хоёр дахин их = 1.0). Багийн impact 0 бол 0.5 (тэнцүү).
 *   Assist 10%: clamp(APR/0.3)
 *   HS 5%:      HS/kills (kill 0 бол 0)
 *   Хэт өндөр утга (outlier) clamp-аар хязгаарлагдана. Ижил статистик → ижил оноо.
 * ========================================================= */
const WEIGHTS = { kd: 30, adr: 30, contribution: 25, assists: 10, hs: 5 };
function impactOf(p, hasDamage) {
  const rp = Math.max(1, p.rounds_played || 0), k = Math.max(0, (p.kills || 0) - (p.team_kills || 0));
  return (k + 0.4 * (p.assists || 0) + (hasDamage && p.damage !== null && p.damage !== undefined ? p.damage / 100 : 0)) / rp;
}
function performance(p, team, hasDamage) {
  const rp = p.rounds_played || 0;
  if (rp <= 0) return { score: 0, components: { kd: 0, adr: null, contribution: 0, assists: 0, hs: 0 }, weights_used: { ...WEIGHTS, adr: hasDamage ? WEIGHTS.adr : 0 }, rounds: 0, note: 'no_rounds' };
  const kills = Math.max(0, (p.kills || 0) - (p.team_kills || 0));
  const kpr = kills / rp, dpr = (p.deaths || 0) / rp, apr = (p.assists || 0) / rp;
  const dmgOk = hasDamage && p.damage !== null && p.damage !== undefined;
  const totalImpact = team.reduce((a, x) => a + impactOf(x, hasDamage), 0);
  const n = Math.max(1, team.length);
  const comp = {
    kd: 0.6 * clamp(kpr / 1.2) + 0.4 * clamp(1 - dpr),
    adr: dmgOk ? clamp(p.damage / rp / 150) : null,
    contribution: totalImpact > 0 ? clamp(impactOf(p, hasDamage) / totalImpact * n / 2) : 0.5,
    assists: clamp(apr / 0.3),
    hs: kills ? clamp((p.headshot_kills || 0) / (p.kills || 1)) : 0
  };
  // Дутуу (заавал биш) хэмжүүрийн жинг бусдад пропорционалаар хуваарилж, ямар жин ашигласныг хадгална
  const avail = Object.keys(WEIGHTS).filter(k => comp[k] !== null);
  const sumW = avail.reduce((a, k) => a + WEIGHTS[k], 0);
  const weights_used = Object.fromEntries(Object.keys(WEIGHTS).map(k => [k, comp[k] === null ? 0 : r2(WEIGHTS[k] * 100 / sumW)]));
  const score = r2(avail.reduce((a, k) => a + WEIGHTS[k] * comp[k], 0) / sumW * 100);
  return { score: Math.max(0, Math.min(100, score)), components: Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, v === null ? null : r2(v)])), weights_used,
    redistributed: avail.length < Object.keys(WEIGHTS).length ? Object.keys(WEIGHTS).filter(k => comp[k] === null) : [], rounds: rp };
}
// Хатуу хязгаар: хожил +150…+230, хожигдол −130…−200 (score 0–100 хооронд clamp хийгдсэн)
function competitiveDelta(result, score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  return result === 'win' ? Math.round(150 + 80 * s / 100) : -Math.round(200 - 70 * s / 100);
}
const aimDelta = (result) => (result === 'win' ? AIM_DELTA : -AIM_DELTA);

/* ---------- Lock (agent тоглолт эхлэхэд түгжсэн) — ingest үед шалгана ---------- */
function validateLock(l, mode) {
  if (!l || typeof l !== 'object' || Array.isArray(l)) throw bad('ranked тоглолтод lock заавал');
  const ids = (a, name) => {
    if (!Array.isArray(a) || a.length > 10) throw bad(`lock.roster.${name} буруу`);
    return a.map(s => { if (!STEAM.test(String(s))) throw bad(`lock.roster.${name}: SteamID64 буруу`); return String(s); });
  };
  const r = l.rules && typeof l.rules === 'object' ? l.rules : {};
  const out = {
    v: 1, type: 'ranked', locked_at: Number.isFinite(+l.locked_at) ? +l.locked_at : null,
    agent: typeof l.agent === 'string' && /^[\w.-]{1,16}$/.test(l.agent) ? l.agent : null,
    roster: { CT: ids(l.roster && l.roster.CT, 'CT'), T: ids(l.roster && l.roster.T, 'T') },
    bots: Number.isInteger(+l.bots) && +l.bots >= 0 && +l.bots < 64 ? +l.bots : 0,
    rules: {
      mode: MODES.includes(r.mode) ? r.mode : mode,
      map: typeof r.map === 'string' && /^[a-z0-9_]{1,64}$/.test(r.map) ? r.map : null,
      weapon: typeof r.weapon === 'string' && /^(ak47|m4a4|m4a1s|awp)$/.test(r.weapon) ? r.weapon : null,
      target_rounds: Number.isInteger(+r.target_rounds) && +r.target_rounds > 0 && +r.target_rounds < 100 ? +r.target_rounds : null,
      server_mode: typeof r.server_mode === 'string' && /^[\w-]{1,20}$/.test(r.server_mode) ? r.server_mode : null,
      cheats: r.cheats === true ? true : r.cheats === false ? false : null
    },
    guard: l.guard && typeof l.guard === 'object' ? { ok: l.guard.ok === true, version: typeof l.guard.version === 'string' ? l.guard.version.slice(0, 16) : null, checked_at: Number(l.guard.checked_at) || null } : null
  };
  if (out.agent === null) throw bad('lock.agent заавал');
  return out;
}

/* =========================================================
 * Шийдвэр (цэвэр функц): тоглолт BRP авах эсэх, хэн хэд авах
 *  ctx: { settings, users: { steam → {id} }, recentLineups: [lineupKey], duplicateRef: bool, now }
 * ========================================================= */
const lineupKey = (g1, g2) => [g1.slice().sort().join(','), g2.slice().sort().join(',')].sort().join('|');
function decide(m, players, ctx) {
  const S = ctx.settings || {}, rules = cleanRules(S.rules || {});
  const out = (reason, extra = {}) => ({ status: REASONS[reason], reason, formula: m.mode === 'competitive' ? FORMULA : AIM_FORMULA, ...extra });
  if (!S.enabled) return out('ranking_disabled');
  if (m.mode === 'competitive' ? !S.competitive : !S.aim) return out('mode_disabled');
  const L = m.lock;
  if (!L || !L.roster) return out('no_lock');
  if (!verGte(L.agent || m.agent_version, MIN_AGENT)) return out('old_agent');
  if (!S.enabled_at || +m.started_at < +S.enabled_at || (L.locked_at && +L.locked_at < +S.enabled_at)) return out('before_activation');
  if (m.status !== 'completed') return out('not_completed');
  if (m.winner === 'draw' || !['CT', 'T'].includes(m.winner)) return out('draw');
  if (m.mode !== 'competitive' && (+m.target_rounds === 10 || +L.rules.target_rounds === 10)) return out('first_to_10');
  if (m.mode !== 'competitive' && !(L.guard && L.guard.ok)) return out('guard_missing');
  if (L.bots > 0) return out('bots');
  const g1 = L.roster.CT, g2 = L.roster.T, n = SIZE[m.mode];
  if (g1.length !== n || g2.length !== n) return out('roster_size', { note: `${g1.length}v${g2.length}` });
  const all = [...g1, ...g2];
  if (new Set(all).size !== all.length) return out('duplicate_player');
  const unlinked = all.filter(s => !ctx.users[s]);
  if (unlinked.length) return out('unlinked_player', { note: `${unlinked.length} тоглогч` });
  if (ctx.duplicateRef) return out('duplicate_ref');

  // ----- Үүнээс доош: асуудалтай бол шалгалт (review). Тооцоолсон санал (proposal)-ыг хадгална -----
  const byS = Object.fromEntries(players.map(p => [p.steam_id, p]));
  const rosterSet = new Set(all);
  const flags = [];
  const R = L.rules || {};
  if ((R.mode && R.mode !== m.mode) || (R.map && R.map !== m.map) || (m.mode !== 'competitive' && ((R.weapon && R.weapon !== m.aim_weapon) || (R.target_rounds && R.target_rounds !== m.target_rounds)))
      || (m.mode === 'competitive' && ((R.server_mode && R.server_mode !== 'competitive') || R.cheats === true))) flags.push('rules_mismatch');
  if (players.some(p => !rosterSet.has(p.steam_id) && (p.rounds_played > 0 || p.kills || p.deaths))) flags.push('extra_player');
  // Тал (halftime-д солигдоно) биш, бүлэг шалгана: roster-ийн бүлэг бүр нэг багт, хоёр бүлэг өөр багт
  const teamOf = (g) => { const t = new Set(g.map(s => byS[s] && byS[s].team).filter(Boolean)); return t.size === 1 ? [...t][0] : null; };
  const t1 = teamOf(g1), t2 = teamOf(g2);
  const teamsOk = t1 && t2 && t1 !== t2;
  if (!teamsOk) flags.push('team_mismatch');
  const minR = Math.ceil((m.rounds_played || 0) * rules.min_participation);
  if (all.some(s => !byS[s] || (byS[s].rounds_played || 0) < minR)) flags.push('low_participation');
  const minDur = m.mode === 'competitive' ? rules.min_duration_competitive_s : rules.min_duration_aim_s;
  const dur = Number.isFinite(+m.duration_s) ? +m.duration_s : Math.floor((m.ended_at - m.started_at) / 1000);
  if (dur < minDur || (m.mode === 'competitive' && m.rounds_played < rules.min_rounds_competitive)) flags.push('too_short');
  const key = lineupKey(g1, g2);
  const maxSame = m.mode === 'competitive' ? rules.max_same_lineup_24h_competitive : rules.max_same_lineup_24h_aim;
  if ((ctx.recentLineups || []).filter(k => k === key).length >= maxSame) flags.push('farming_lineup');

  let changes = null;
  if (teamsOk) {
    const winners = t1 === m.winner ? g1 : g2;
    changes = all.map(s => {
      const p = byS[s] || { steam_id: s, kills: 0, deaths: 0, assists: 0, headshot_kills: 0, rounds_played: 0, damage: null, team: null };
      const result = winners.includes(s) ? 'win' : 'loss';
      if (m.mode === 'competitive') {
        const team = players.filter(x => x.team === p.team && rosterSet.has(x.steam_id));
        const perf = performance(p, team, !!m.has_damage);
        const d = competitiveDelta(result, perf.score);
        return { user_id: ctx.users[s].id, steam_id: s, result, score: perf.score, delta_calc: d,
          detail: { formula: FORMULA, ...perf, stats: { kills: p.kills, deaths: p.deaths, assists: p.assists, headshot_kills: p.headshot_kills, team_kills: p.team_kills || 0, damage: m.has_damage ? p.damage : null, rounds_played: p.rounds_played } },
          reason: `${result === 'win' ? 'Хожил' : 'Хожигдол'} · хувийн үзүүлэлт ${perf.score.toFixed(1)}` };
      }
      return { user_id: ctx.users[s].id, steam_id: s, result, score: null, delta_calc: aimDelta(result), detail: { formula: AIM_FORMULA, fixed: AIM_DELTA, target_rounds: m.target_rounds },
        reason: `${result === 'win' ? 'Хожил' : 'Хожигдол'} · AIM ±${AIM_DELTA}` };
    }).sort((a, b) => (a.user_id < b.user_id ? -1 : 1));
  }
  if (flags.length) return { ...out(flags[0]), note: flags.join(','), proposal: changes ? { changes } : null };
  return { ...out('ok'), changes };
}

/* =========================================================
 * JS mirror of SQL (локал DB, тестийн хуурамч Supabase) — tests/ranking/sql.mjs нь SQL-тэй харьцуулна
 * ========================================================= */
function sqlErr(msg) { const e = new Error(msg); e.status = 400; e.code = '22023'; return e; }
function tables(T) {
  for (const t of ['berx_ratings', 'berx_ranked_matches', 'berx_rating_changes', 'berx_ranking_audit']) T[t] ||= [];
  T.berx_ranking_settings ||= [];
  if (!T.berx_ranking_settings.length) T.berx_ranking_settings.push({ id: 1, enabled: false, competitive: false, aim: false, formula: FORMULA, enabled_at: null, rules: {}, updated_by: null, updated_at: 0 });
  T._seq ||= { changes: 0, audit: 0 };
  return T;
}
function applyLocal(T, p, now = Date.now()) {
  tables(T);
  const action = p.action || 'auto', mid = p.match_id;
  if (!mid || !['auto', 'approve', 'reject'].includes(action)) throw sqlErr('berx_apply_rating: invalid payload');
  const m = (T.berx_matches || []).find(x => x.id === mid);
  if (!m) throw sqlErr('berx_apply_rating: match not found');
  const RM = T.berx_ranked_matches; let r = RM.find(x => x.match_id === mid);
  const rev = +p.revision || 1, status = p.status, reason = String(p.reason || '').slice(0, 64);
  if (action === 'auto') {
    if (!['rated', 'not_eligible', 'review', 'error'].includes(status)) throw sqlErr('berx_apply_rating: bad status');
    const row = { match_id: mid, mode: m.mode, status, reason, formula: p.formula || null, revision: rev, flag: null, proposal: status === 'review' ? (p.proposal || null) : null,
      note: p.note ? String(p.note).slice(0, 300) : null, decided_by: null, decided_at: now, updated_at: now };
    if (r) {
      if (r.status !== 'error') {
        if (rev > r.revision && ['rated', 'review'].includes(r.status)) Object.assign(r, { flag: 'revised_after_rating', revision: rev, updated_at: now });
        return { ok: true, existing: true, status: r.status, reason: r.reason, flag: r.flag };
      }
      Object.assign(r, { ...row, flag: r.flag });
    } else RM.push(r = row);
    if (status !== 'rated') return { ok: true, existing: false, status, reason };
  } else {
    if (!r || r.status !== 'review') throw sqlErr('berx_apply_rating: match is not in review');
    if (!p.admin_id) throw sqlErr('berx_apply_rating: admin required');
    if (String(p.note || '').length < 5) throw sqlErr('berx_apply_rating: reason required');
    T.berx_ranking_audit.push({ id: ++T._seq.audit, action: 'review_' + action, target: mid, detail: { previous_reason: r.reason }, reason: String(p.note).slice(0, 300), admin_id: p.admin_id, created_at: now });
    Object.assign(r, { status: action === 'reject' ? 'rejected' : 'rated', note: String(p.note).slice(0, 300), decided_by: p.admin_id, decided_at: now, updated_at: now });
    if (action === 'reject') return { ok: true, status: 'rejected' };
  }
  if (m.match_type !== 'ranked' || m.status !== 'completed' || !['CT', 'T'].includes(m.winner)) throw sqlErr('berx_apply_rating: match is not a completed ranked match');
  const changes = Array.isArray(p.changes) ? p.changes.slice().sort((a, b) => (a.user_id < b.user_id ? -1 : 1)) : [];
  if (!changes.length) throw sqlErr('berx_apply_rating: no changes');
  const out = [];
  for (const c of changes) {
    if (!['win', 'loss'].includes(c.result)) throw sqlErr('berx_apply_rating: bad result');
    if (T.berx_rating_changes.some(x => x.kind === 'match' && x.match_id === mid && x.user_id === c.user_id)) throw sqlErr('duplicate key value violates unique constraint "berx_rating_changes_match_user_uq"');
    let rt = T.berx_ratings.find(x => x.user_id === c.user_id);
    if (!rt) T.berx_ratings.push(rt = { user_id: c.user_id, steam_id: c.steam_id, brp: START_BRP, peak: START_BRP, ranked_matches: 0, wins: 0, losses: 0, last_change_id: null, last_match_at: null, created_at: now, updated_at: now });
    const prev = rt.brp, delta = Math.max(Math.trunc(c.delta_calc), -prev), nb = prev + delta, id = ++T._seq.changes;
    T.berx_rating_changes.push({ id, kind: 'match', match_id: mid, user_id: c.user_id, steam_id: c.steam_id, mode: m.mode, result: c.result, score: c.score === null || c.score === undefined ? null : r2(+c.score),
      delta_calc: Math.trunc(c.delta_calc), delta, prev_brp: prev, new_brp: nb, formula: p.formula || null, detail: c.detail || null, reason: String(c.reason || 'match').slice(0, 300), created_by: null, created_at: now });
    Object.assign(rt, { brp: nb, peak: Math.max(rt.peak, nb), steam_id: c.steam_id, ranked_matches: rt.ranked_matches + 1, wins: rt.wins + (c.result === 'win' ? 1 : 0),
      losses: rt.losses + (c.result === 'loss' ? 1 : 0), last_change_id: id, last_match_at: now, updated_at: now });
    out.push({ user_id: c.user_id, delta, new_brp: nb, change_id: id });
  }
  return { ok: true, existing: false, status: 'rated', changes: out };
}
function adjustLocal(T, p, now = Date.now()) {
  tables(T);
  const delta = Number(p.delta), reason = String(p.reason || '').trim();
  if (!p.user_id || !p.admin_id) throw sqlErr('berx_adjust_rating: invalid payload');
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) throw sqlErr('berx_adjust_rating: delta must be 1..1000');
  if (reason.length < 5) throw sqlErr('berx_adjust_rating: reason required');
  let rt = T.berx_ratings.find(x => x.user_id === p.user_id);
  if (!rt) T.berx_ratings.push(rt = { user_id: p.user_id, steam_id: p.steam_id, brp: START_BRP, peak: START_BRP, ranked_matches: 0, wins: 0, losses: 0, last_change_id: null, last_match_at: null, created_at: now, updated_at: now });
  const prev = rt.brp, nb = Math.max(0, prev + delta), id = ++T._seq.changes;
  T.berx_rating_changes.push({ id, kind: 'adjustment', match_id: null, user_id: p.user_id, steam_id: p.steam_id, mode: null, result: null, score: null, delta_calc: delta, delta: nb - prev,
    prev_brp: prev, new_brp: nb, formula: null, detail: null, reason: reason.slice(0, 300), created_by: p.admin_id, created_at: now });
  Object.assign(rt, { brp: nb, peak: Math.max(rt.peak, nb), last_change_id: id, updated_at: now });
  T.berx_ranking_audit.push({ id: ++T._seq.audit, action: 'adjust', target: p.user_id, detail: { delta: nb - prev, requested: delta, prev, new: nb, change_id: id }, reason: reason.slice(0, 300), admin_id: p.admin_id, created_at: now });
  return { ok: true, prev_brp: prev, new_brp: nb, delta: nb - prev, change_id: id };
}
function settingsLocal(T, p, now = Date.now()) {
  tables(T); if (!p.admin_id) throw sqlErr('berx_update_ranking_settings: admin required');
  const s = T.berx_ranking_settings[0];
  for (const k of ['enabled', 'competitive', 'aim']) if (typeof p[k] === 'boolean') s[k] = p[k];
  if (p.rules && typeof p.rules === 'object') s.rules = p.rules;
  if (!s.enabled_at && s.enabled) s.enabled_at = now;
  Object.assign(s, { updated_by: p.admin_id, updated_at: now });
  T.berx_ranking_audit.push({ id: ++T._seq.audit, action: 'settings', target: 'ranking', detail: { enabled: s.enabled, competitive: s.competitive, aim: s.aim, rules: s.rules }, reason: p.reason ? String(p.reason).slice(0, 300) : null, admin_id: p.admin_id, created_at: now });
  return { ...s };
}
function summaryLocal(T) {
  tables(T); const C = T.berx_rating_changes;
  const by_mode = {};
  for (const c of C.filter(x => x.kind === 'match')) { const b = by_mode[c.mode] ||= { gained: 0, lost: 0, changes: 0 }; b.gained += Math.max(0, c.delta); b.lost -= Math.min(0, c.delta); b.changes++; }
  const decisions = {}; for (const r of T.berx_ranked_matches) decisions[r.status] = (decisions[r.status] || 0) + 1;
  return { gained: C.reduce((a, c) => a + Math.max(0, c.delta), 0), lost: C.reduce((a, c) => a - Math.min(0, c.delta), 0), net: C.reduce((a, c) => a + c.delta, 0),
    adjustments: C.filter(c => c.kind === 'adjustment').length, by_mode, decisions, players: T.berx_ratings.filter(r => r.ranked_matches > 0).length };
}

/* ---------- DB wrappers ---------- */
const isSb = () => db.name === 'supabase';
const call = (fn, local, p) => (isSb() ? db.rpc(fn, { p }) : db.local(T => local(T, p)));
const applyRating = (p) => call('berx_apply_rating', applyLocal, p);
const adjustRating = (p) => call('berx_adjust_rating', adjustLocal, p);
const updateSettings = (p) => call('berx_update_ranking_settings', settingsLocal, p);
const summary = () => (isSb() ? db.rpc('berx_ranking_summary', {}) : db.local(T => summaryLocal(T)));

async function getSettings() {
  let s = null, installed = true;
  try { s = (await db.select('berx_ranking_settings', { eq: { id: 1 }, limit: 1 }))[0]; } catch (e) { s = null; installed = false; }   // 006 хараахан ажиллаагүй → бүгд унтраалттай
  s = s || { id: 1, enabled: false, competitive: false, aim: false, formula: FORMULA, enabled_at: null, rules: {} };
  return { enabled: !!s.enabled, competitive: !!s.competitive, aim: !!s.aim, formula: s.formula || FORMULA, enabled_at: s.enabled_at ? +s.enabled_at : null,
    rules: cleanRules(s.rules || {}), updated_at: +s.updated_at || 0, installed };
}
async function usersBySteam(steams) {
  if (!steams.length) return {};
  const us = await db.select('users', { in: { steam_id: steams }, columns: 'id,nick,steam_id' });
  return Object.fromEntries(us.filter(u => u.steam_id).map(u => [u.steam_id, u]));
}

/* ---------- Тоглолтыг үнэлэх (ingest-ийн дараа; idempotent) ---------- */
async function rate(matchId, now = Date.now()) {
  const [m] = await db.select('berx_matches', { eq: { id: matchId }, limit: 1 });
  if (!m || m.match_type !== 'ranked') return null;                 // Casual → BRP огт хөндөхгүй
  const [prev] = await db.select('berx_ranked_matches', { eq: { match_id: matchId }, limit: 1 });
  const base = { action: 'auto', match_id: m.id, revision: +m.revision || 1, mode: m.mode };
  if (prev && prev.status !== 'error') {
    // Шийдвэр гарсан тоглолт: шинэ revision → SQL нь зөвхөн flag тавина (дахин олгохгүй). Бусад үед өөрчлөлтгүй.
    if ((+m.revision || 1) > (+prev.revision || 1) && ['rated', 'review'].includes(prev.status)) return applyRating({ ...base, status: 'review', reason: prev.reason });
    return { ok: true, existing: true, status: prev.status, reason: prev.reason, flag: prev.flag || null };
  }
  let d;
  try {
    const players = await db.select('berx_match_players', { eq: { match_id: matchId } });
    const settings = await getSettings();
    const L = m.lock || {};
    const roster = [...((L.roster && L.roster.CT) || []), ...((L.roster && L.roster.T) || [])];
    const users = await usersBySteam(roster);
    // 24 цагийн доторх ижил бүрэлдэхүүнтэй rated тоглолт (anti-farming)
    const recent = await db.select('berx_ranked_matches', { eq: { status: 'rated', mode: m.mode }, gte: { decided_at: now - 86400e3 }, columns: 'match_id' });
    const rms = recent.length ? await db.select('berx_matches', { in: { id: recent.map(r => r.match_id) }, columns: 'id,lock' }) : [];
    const recentLineups = rms.filter(x => x.id !== m.id && x.lock && x.lock.roster).map(x => lineupKey(x.lock.roster.CT || [], x.lock.roster.T || []));
    let duplicateRef = false;
    if (m.external_ref) {
      const same = (await db.select('berx_matches', { eq: { external_ref: m.external_ref }, columns: 'id,match_type' })).filter(x => x.id !== m.id && x.match_type === 'ranked');
      if (same.length) duplicateRef = (await db.select('berx_ranked_matches', { in: { match_id: same.map(x => x.id) }, eq: { status: 'rated' }, columns: 'match_id' })).length > 0;
    }
    d = decide(m, players, { settings, users, recentLineups, duplicateRef, now });
  } catch (e) { d = { status: 'error', reason: 'error', formula: null, note: String(e.message || e).slice(0, 300) }; }
  return applyRating({ ...base, status: d.status, reason: d.reason, formula: d.formula, note: d.note || null, proposal: d.proposal || null, changes: d.status === 'rated' ? d.changes : [] });
}

/* =========================================================
 * Унших API (нэвтэрсэн гишүүд)
 * ========================================================= */
async function allRatings() {
  const [rs, us] = await Promise.all([db.select('berx_ratings', {}).catch(() => []), db.select('users', { columns: 'id,nick,steam_id,avatar,avatar_v' })]);   // 006 ажиллаагүй → бүгд 1000
  return { rs, us };
}
// Тодорхой (deterministic) эрэмбэ: BRP ↓, оргил ↓, хожил ↓, сүүлд тоглосон ↑ (эрт хүрсэн нь дээр), user_id ↑
const order = (a, b) => b.brp - a.brp || b.peak - a.peak || b.wins - a.wins || (+a.last_match_at || 0) - (+b.last_match_at || 0) || (a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0);
function board({ rs, us }) {
  const byU = Object.fromEntries(us.map(u => [u.id, u]));
  const ranked = rs.filter(r => byU[r.user_id]).map(r => ({ ...r, brp: +r.brp, peak: +r.peak, wins: +r.wins, losses: +r.losses, ranked_matches: +r.ranked_matches })).sort(order)
    .map((r, i) => ({ position: i + 1, userId: r.user_id, nick: byU[r.user_id].nick, avatar: byU[r.user_id].avatar || null, avatar_v: byU[r.user_id].avatar_v || null, steamId: byU[r.user_id].steam_id || r.steam_id,
      brp: r.brp, peak: r.peak, rank: rankOf(r.brp).id, matches: r.ranked_matches, wins: r.wins, losses: r.losses,
      winRate: r.ranked_matches ? Math.round(r.wins / r.ranked_matches * 1000) / 10 : null, lastMatchAt: r.last_match_at ? +r.last_match_at : null }));
  // IMMORTAL #N = IMMORTAL доторх байр (BRP-ээр эрэмбэлсэн тул нийт байртай ижил)
  let imm = 0; for (const r of ranked) if (r.rank === 'immortal') r.immortal = ++imm;
  const has = new Set(rs.map(r => r.user_id));
  const unranked = us.filter(u => u.steam_id && !has.has(u.id)).sort((a, b) => String(a.nick).localeCompare(String(b.nick)) || (a.id < b.id ? -1 : 1))
    .map(u => ({ position: null, userId: u.id, nick: u.nick, avatar: u.avatar || null, avatar_v: u.avatar_v || null, steamId: u.steam_id, brp: START_BRP, peak: START_BRP, rank: 'rookie', matches: 0, wins: 0, losses: 0, winRate: null, unranked: true }));
  const noSteam = us.filter(u => !u.steam_id).length;
  return { ranked, unranked, noSteam };
}
async function playerCard(userId, opts = {}) {
  const [{ rs, us }, settings] = await Promise.all([allRatings(), getSettings()]);
  const u = us.find(x => x.id === userId); if (!u) return null;
  const b = board({ rs, us });
  const row = b.ranked.find(x => x.userId === userId) || b.unranked.find(x => x.userId === userId) || { userId, nick: u.nick, brp: START_BRP, peak: START_BRP, rank: 'rookie', matches: 0, wins: 0, losses: 0, winRate: null, unranked: true, position: null };
  const hist = (await db.select('berx_rating_changes', { eq: { user_id: userId }, order: 'id.desc', limit: opts.limit || 100 }).catch(() => [])).map(c => ({
    id: +c.id, kind: c.kind, matchId: c.match_id, mode: c.mode, result: c.result, score: c.score === null ? null : +c.score, delta: +c.delta, deltaCalc: +c.delta_calc,
    prev: +c.prev_brp, brp: +c.new_brp, reason: c.reason, at: +c.created_at, historical: !!(c.detail && c.detail.historical_import), detail: opts.detail ? c.detail : undefined }));
  const ids = hist.filter(h => h.matchId).slice(0, 10).map(h => h.matchId);
  const ms = ids.length ? await db.select('berx_matches', { in: { id: ids }, columns: 'id,mode,map,workshop_id,score_ct,score_t,winner,started_at,aim_weapon,target_rounds' }) : [];
  const byM = Object.fromEntries(ms.map(m => [m.id, m]));
  const nx = nextRank(row.brp);
  return {
    settings: { enabled: settings.enabled, competitive: settings.competitive, aim: settings.aim, formula: settings.formula },
    player: { ...row, steamId: u.steam_id || null, rankName: row.rank === 'immortal' && row.immortal ? `IMMORTAL #${row.immortal}` : rankOf(row.brp).name,
      next: nx ? { id: nx.id, name: nx.name, min: nx.min, need: nx.min - row.brp } : null, last: hist[0] || null },
    history: hist.slice().reverse(),
    recent: hist.filter(h => h.matchId).slice(0, 10).map(h => ({ ...h, match: byM[h.matchId] || null }))
  };
}
// Тоглолтын дэлгэрэнгүй/жагсаалтад: шийдвэр + өөрчлөлтүүд
async function matchInfo(ids, meId) {
  if (!ids.length) return {};
  let rm = [], ch = [];
  try {
    [rm, ch] = await Promise.all([db.select('berx_ranked_matches', { in: { match_id: ids } }),   // '*' — 008-ийн origin багана байхгүй үед ч ажиллана
      db.select('berx_rating_changes', { in: { match_id: ids }, columns: 'match_id,user_id,steam_id,result,score,delta,delta_calc,prev_brp,new_brp,detail' })]);
  } catch (e) { return {}; }     // 006 ажиллаагүй
  const out = {};
  for (const r of rm) out[r.match_id] = { status: r.status, reason: r.reason, formula: r.formula, flag: r.flag || null, origin: r.origin || 'live', changes: {} };
  for (const c of ch) {
    const o = out[c.match_id] ||= { status: 'rated', reason: 'ok', changes: {} };
    o.changes[c.steam_id] = { delta: +c.delta, score: c.score === null ? null : +c.score, prev: +c.prev_brp, brp: +c.new_brp, mine: c.user_id === meId,
      weights: c.detail && c.detail.weights_used ? c.detail.weights_used : null, components: c.detail && c.detail.components ? c.detail.components : null };
    if (c.user_id === meId) o.me = { delta: +c.delta, score: c.score === null ? null : +c.score };
  }
  return out;
}

/* =========================================================
 * Admin
 * ========================================================= */
async function adminOverview() {
  const [settings, sum, review, errors, audit, recent] = await Promise.all([
    getSettings(), summary(),
    db.select('berx_ranked_matches', { eq: { status: 'review' }, order: 'decided_at.desc', limit: 50 }),
    db.select('berx_ranked_matches', { eq: { status: 'error' }, order: 'decided_at.desc', limit: 20 }),
    db.select('berx_ranking_audit', { order: 'id.desc', limit: 30 }),
    db.select('berx_ranked_matches', { order: 'decided_at.desc', limit: 30 })
  ]);
  const flagged = recent.filter(r => r.flag && r.status !== 'review');
  const ids = [...new Set([...review, ...errors, ...flagged, ...recent].map(r => r.match_id))];
  const ms = ids.length ? await db.select('berx_matches', { in: { id: ids }, columns: 'id,mode,map,score_ct,score_t,winner,started_at,status,agent_version' }) : [];
  const byM = Object.fromEntries(ms.map(m => [m.id, m]));
  const us = await db.select('users', { columns: 'id,nick' }); const nick = Object.fromEntries(us.map(u => [u.id, u.nick]));
  const pub = (r) => ({ matchId: r.match_id, mode: r.mode, status: r.status, reason: r.reason, note: r.note || null, flag: r.flag || null, formula: r.formula, decidedAt: +r.decided_at,
    decidedBy: r.decided_by ? (nick[r.decided_by] || r.decided_by) : null, proposal: r.proposal && r.proposal.changes ? r.proposal.changes.map(c => ({ nick: nick[c.user_id] || c.steam_id, result: c.result, score: c.score, delta: c.delta_calc })) : null, match: byM[r.match_id] || null });
  return { settings, defaults: DEFAULT_RULES, summary: sum, review: review.map(pub), errors: errors.map(pub), flagged: flagged.map(pub), recent: recent.map(pub),
    audit: audit.map(a => ({ id: +a.id, action: a.action, target: a.target, detail: a.detail, reason: a.reason, admin: nick[a.admin_id] || a.admin_id, at: +a.created_at })) };
}

const ACTIONS = {
  async 'ranking.settings'(me, p) {
    if (!me.is_admin) throw new Error('Admin эрх хэрэгтэй');
    const x = { admin_id: me.id, reason: p.reason ? String(p.reason).slice(0, 300) : null };
    for (const k of ['enabled', 'competitive', 'aim']) if (typeof p[k] === 'boolean') x[k] = p[k];
    if (p.rules !== undefined) x.rules = cleanRules(p.rules || {});
    return { settings: await updateSettings(x) };
  },
  async 'ranking.review'(me, p) {
    if (!me.is_admin) throw new Error('Admin эрх хэрэгтэй');
    if (!UUID.test(String(p.matchId || ''))) throw bad('matchId буруу');
    if (!['approve', 'reject'].includes(p.decision)) throw bad('decision буруу');
    const note = String(p.note || '').trim(); if (note.length < 5) throw bad('Шалтгаан заавал (5+ тэмдэгт)');
    const [r] = await db.select('berx_ranked_matches', { eq: { match_id: p.matchId }, limit: 1 });
    if (!r || r.status !== 'review') throw bad('Энэ тоглолт шалгалтад байхгүй');
    if (p.decision === 'approve' && !(r.proposal && Array.isArray(r.proposal.changes) && r.proposal.changes.length)) throw bad('Тооцоолох боломжгүй тоглолт (баг тодорхойгүй) — зөвхөн татгалзах боломжтой');
    const [m] = await db.select('berx_matches', { eq: { id: p.matchId }, limit: 1, columns: 'id,revision,mode' });
    return { result: await applyRating({ action: p.decision, match_id: p.matchId, revision: +m.revision || 1, admin_id: me.id, note, formula: r.formula,
      changes: p.decision === 'approve' ? r.proposal.changes : [] }) };
  },
  async 'ranking.adjust'(me, p) {
    if (!me.is_admin) throw new Error('Admin эрх хэрэгтэй');
    const [u] = await db.select('users', { eq: { id: String(p.userId || '') }, limit: 1, columns: 'id,steam_id' });
    if (!u) throw bad('Хэрэглэгч олдсонгүй');
    if (!u.steam_id) throw bad('Steam холбоогүй хэрэглэгч');
    const delta = Number(p.delta); if (!Number.isInteger(delta) || !delta || Math.abs(delta) > 1000) throw bad('Өөрчлөлт 1–1000 бүхэл тоо');
    const reason = String(p.reason || '').trim(); if (reason.length < 5) throw bad('Шалтгаан заавал (5+ тэмдэгт)');
    return { result: await adjustRating({ user_id: u.id, steam_id: u.steam_id, delta, reason, admin_id: me.id }) };
  },
  async 'ranking.retry'(me, p) {     // error төлөвтэй шийдвэрийг дахин тооцоолох (жишээ нь түр DB алдаа)
    if (!me.is_admin) throw new Error('Admin эрх хэрэгтэй');
    if (!UUID.test(String(p.matchId || ''))) throw bad('matchId буруу');
    return { result: await rate(p.matchId) };
  }
};

async function handle(req, res, p, { send, me }) {
  try {
    if (!me) return send(res, 401, { error: 'Нэвтрэх шаардлагатай' });
    if (req.method !== 'GET') return send(res, 405, { error: 'GET' });
    if (p === '/berx/ranking/me') return send(res, 200, await playerCard(me.id));
    if (p === '/berx/ranking/leaderboard') { const [b, s] = await Promise.all([allRatings().then(board), getSettings()]); return send(res, 200, { ...b, settings: { enabled: s.enabled, competitive: s.competitive, aim: s.aim } }); }
    let m = p.match(/^\/berx\/ranking\/users\/([A-Za-z0-9_-]{1,64})$/);
    if (m) { const c = await playerCard(m[1], { limit: 60 }); return c ? send(res, 200, c) : send(res, 404, { error: 'Олдсонгүй' }); }
    if (p === '/admin/ranking') { if (!me.is_admin) return send(res, 403, { error: 'Admin эрх хэрэгтэй' }); return send(res, 200, await adminOverview()); }
    m = p.match(/^\/admin\/ranking\/users\/([A-Za-z0-9_-]{1,64})$/);
    if (m) { if (!me.is_admin) return send(res, 403, { error: 'Admin эрх хэрэгтэй' }); const c = await playerCard(m[1], { limit: 500, detail: true }); return c ? send(res, 200, c) : send(res, 404, { error: 'Олдсонгүй' }); }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    const st = e.status || 500;
    return send(res, st, { error: st === 500 ? 'Серверийн алдаа' : e.message });
  }
}

module.exports = { handle, ACTIONS, rate, decide, performance, competitiveDelta, aimDelta, validateLock, applyLocal, adjustLocal, settingsLocal, summaryLocal, getSettings,
  board, rankOf, nextRank, lineupKey, cleanRules, matchInfo, RANKS, REASONS, DEFAULT_RULES, FORMULA, AIM_FORMULA, START_BRP, MIN_AGENT, verGte };
