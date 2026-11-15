/* =========================================================
 * BERX Match Recorder — тоглолтын түүх (agent дотор, I/O-гүй цэвэр логик)
 * ---------------------------------------------------------
 *  Эх сурвалж (таамаглахгүй, зохиохгүй):
 *   • Competitive 5v5 → MatchZy 0.9.x event (going_live → round_end → map_result).
 *       MatchZy өөрөө тоолсон хуримтлагдсан тоглогчийн статистик (kills/deaths/assists/HS/damage/MVP).
 *       Тоглолтын хил = MatchZy-ийн бодит хил. Warmup/knife round-д going_live байхгүй → тоологдохгүй.
 *   • AIM 1v1/2v2 → CS2 server log (logaddress_add_http, AIM-д MatchZy унтраалттай).
 *       killed / assisted killing / committed suicide / attacked (damage) / switched team / disconnected.
 *       MVP log-д байхгүй → null (харуулахгүй). Damage: "attacked" мөр ирсэн тоглолтод л (mp_logdetail).
 *  Тоглогчийн ID = SteamID64 (нэр зөвхөн харуулах). Bot, warmup, давхардсан мөр тоологдохгүй.
 *  Round тоглогдоогүй сегмент (warmup restart, тохиргооны restart) тоглолт болж бичигдэхгүй.
 * ========================================================= */
'use strict';
const crypto = require('crypto');

const STEAM64 = /^7656119\d{10}$/;
function steam64(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (STEAM64.test(s)) return s;
  const m = s.match(/^\[U:1:(\d+)\]$/); if (m) { const x = (BigInt(m[1]) + 76561197960265728n).toString(); return STEAM64.test(x) ? x : null; }
  const m2 = s.match(/^STEAM_\d:([01]):(\d+)$/); if (m2) { const x = (BigInt(m2[2]) * 2n + BigInt(m2[1]) + 76561197960265728n).toString(); return STEAM64.test(x) ? x : null; }
  return null;   // BOT, Console, 0 ...
}
const side = (t) => { const s = String(t || '').toLowerCase(); return s === 'ct' || s.startsWith('counter') ? 'CT' : s === 't' || s.startsWith('terror') ? 'T' : null; };
const other = (s) => (s === 'CT' ? 'T' : s === 'T' ? 'CT' : null);
const cleanMap = (m) => { const s = String(m || '').split(/[\\/]/).pop().toLowerCase(); return /^[a-z0-9_]{1,64}$/.test(s) ? s : null; };
const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f]/g, '').slice(0, 64);

/* ---------- CS2 log мөр ---------- */
const P = '"(.{0,96}?)<(\\d+)><([^<>]*)><([^<>]*)>"';          // "Name<userid><[U:1:N]|BOT><CT|TERRORIST|...>"
const POS = '(?: \\[[^\\]]*\\])?';
const RE = {
  kill: new RegExp(`^${P}${POS} killed ${P}${POS} with "([^"]*)"(.*)$`),
  assist: new RegExp(`^${P} assisted killing ${P}`),
  suicide: new RegExp(`^${P}${POS} committed suicide with "([^"]*)"`),
  attacked: new RegExp(`^${P}${POS} attacked ${P}${POS} with "([^"]*)" \\(damage "(\\d+)"\\) \\(damage_armor "(\\d+)"\\) \\(health "(\\d+)"\\)`),
  switched: /^"(.{0,96}?)<(\d+)><([^<>]*)>" switched from team <([^<>]*)> to <([^<>]*)>/,
  disconnected: new RegExp(`^${P} disconnected`),
  entered: new RegExp(`^${P} entered the game`),
  score: /^Team "(CT|TERRORIST)" triggered "([^"]+)" \(CT "(\d+)"\) \(T "(\d+)"\)/,
  gameover: /^Game Over:.*?score (\d+):(\d+)/,
  world: /^World triggered "([A-Za-z_]+)"/
};
// "11/15/2026 - 06:16:00.123 - <event>"  эсвэл  "L 11/15/2026 - 06:16:00: <event>"
function splitLine(line) {
  const t = String(line || '').replace(/\r$/, '');
  const m = t.match(/^(?:L )?(\d\d\/\d\d\/\d{4} - \d\d:\d\d:\d\d(?:\.\d+)?)(?: - |: )(.*)$/);
  return m ? { ts: m[1], body: m[2] } : { ts: null, body: t.trim() };
}
function parseLog(line) {
  const { body } = splitLine(line); let m;
  const who = (o) => ({ name: cleanName(m[o]), steam: steam64(m[o + 2]), team: side(m[o + 3]), bot: /^BOT$/i.test(m[o + 2]) });
  if ((m = body.match(RE.kill))) return { type: 'kill', a: who(1), v: who(5), weapon: m[9], headshot: /\(headshot\)/.test(m[10]) };
  if ((m = body.match(RE.attacked))) return { type: 'attacked', a: who(1), v: who(5), damage: +m[10], health: +m[12] };
  if ((m = body.match(RE.assist))) return { type: 'assist', a: who(1), v: who(5) };
  if ((m = body.match(RE.suicide))) return { type: 'suicide', v: who(1) };
  if ((m = body.match(RE.switched))) return { type: 'switch', p: { name: cleanName(m[1]), steam: steam64(m[3]), bot: /^BOT$/i.test(m[3]), team: side(m[5]) } };
  if ((m = body.match(RE.disconnected))) return { type: 'disconnect', p: who(1) };
  if ((m = body.match(RE.entered))) return { type: 'enter', p: who(1) };
  if ((m = body.match(RE.score))) return { type: 'score', ct: +m[3], t: +m[4], winner: m[1] === 'CT' ? 'CT' : 'T' };
  if ((m = body.match(RE.gameover))) return { type: 'gameover', ct: +m[1], t: +m[2] };
  if (/^Game Over:/.test(body)) return { type: 'gameover' };
  if ((m = body.match(RE.world))) {
    if (m[1] === 'Match_Start' || m[1] === 'Game_Commencing') return { type: 'restart' };
    if (m[1] === 'Round_Start') return { type: 'roundstart' };
    if (m[1] === 'Warmup_Start') return { type: 'warmup' };
  }
  return null;
}

const STALE_MS = 3 * 3600e3, OFFLINE_MS = 10 * 60e3, SEEN_MAX = 2000, DEDUPE_MS = 1500;   // давхар бүртгэлийн дахин хүргэлт ms дотор ирнэ
const blankPlayer = (steam, name, team) => ({ steam_id: steam, name: cleanName(name), team, kills: 0, deaths: 0, assists: 0, headshot_kills: 0, team_kills: 0,
  suicides: 0, damage: 0, mvp: 0, rounds_played: 0, connected: true });

class MatchRecorder {
  constructor(o = {}) {
    this.serverId = o.serverId || 'main'; this.agentVersion = o.agentVersion || null;
    this.now = o.now || Date.now; this.newId = o.newId || (() => crypto.randomUUID());
    this.live = null; this.out = []; this.roster = []; this.offlineSince = null;
    this.seen = new Map();
    this.log = o.log || (() => {});
  }
  /* ---------- нийтлэг ---------- */
  setRoster(players) {   // agent-ийн status_json (5с тутам): одоо серверт байгаа хүмүүс + баг
    this.roster = (players || []).filter(p => !p.bot).map(p => ({ steam: steam64(p.steamId), name: cleanName(p.name), team: side(p.team) })).filter(p => p.steam);
  }
  player(steam, name, team) {
    const L = this.live; if (!L || !steam) return null;
    let p = L.players[steam];
    if (!p) p = L.players[steam] = blankPlayer(steam, name, team || null);
    if (name) p.name = cleanName(name);
    if (team) p.team = team;
    return p;
  }
  start(o) {
    this.live = { id: this.newId(), started_at: this.now(), score: { ct: 0, t: 0 }, rounds: 0, players: {}, decided: null, has_damage: false, has_mvp: false,
      lastEventAt: this.now(), health: {}, ...o };
    for (const r of this.roster) if (r.team) this.player(r.steam, r.name, r.team);
    this.log(`● Тоглолт эхэллээ: ${o.mode} ${o.map} (${this.live.id.slice(0, 8)})`);
    return this.live;
  }
  // Тоглолтыг дуусгах. Round тоглогдоогүй бол бичихгүй (warmup/тохиргооны restart).
  end(status, reason) {
    const L = this.live; if (!L) return null; this.live = null;
    if (L.rounds <= 0) { this.log(`○ Тоглолт бичигдсэнгүй (round тоглогдоогүй: ${reason})`); return null; }
    let winner = null;
    if (L.decided) { status = 'completed'; winner = L.decided; }
    else if (status === 'completed') {
      if (L.mode === 'competitive') winner = L.score.ct > L.score.t ? 'CT' : L.score.t > L.score.ct ? 'T' : 'draw';
      else { status = 'aborted'; reason = 'ended_before_target'; }    // AIM: зорилтот round-д хүрэлгүй дууссан
    }
    if (status === 'completed') reason = null;
    const players = Object.values(L.players)
      .filter(p => p.team && (p.rounds_played > 0 || p.kills || p.deaths || p.assists))
      .map(p => ({ steam_id: p.steam_id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, assists: p.assists, headshot_kills: Math.min(p.headshot_kills, p.kills),
        team_kills: p.team_kills, suicides: p.suicides, damage: L.has_damage ? p.damage : null, mvp: L.has_mvp ? p.mvp : null,
        rounds_played: Math.min(p.rounds_played, L.rounds), connected_at_end: !!p.connected }));
    const m = { id: L.id, revision: 1, server_id: this.serverId, source: L.source, external_ref: L.ext || null, agent_version: this.agentVersion,
      mode: L.mode, map: L.map, workshop_id: L.workshop_id || null, aim_weapon: L.aim_weapon || null, target_rounds: L.target_rounds || null,
      status, status_reason: reason || null, started_at: L.started_at, ended_at: Math.max(L.started_at, this.now()), rounds_played: L.rounds,
      score_ct: L.score.ct, score_t: L.score.t, winner: status === 'completed' ? winner : null, has_damage: L.has_damage, has_mvp: L.has_mvp, players };
    this.out.push(m);
    this.log(`■ Тоглолт: ${m.mode} ${m.map} ${m.score_ct}:${m.score_t} — ${m.status}${reason ? ' (' + reason + ')' : ''}, ${players.length} тоглогч`);
    return m;
  }
  drain() { const o = this.out; this.out = []; return o; }
  // Agent-ийн тогтмол шалгалт: map солигдсон, горим солигдсон, сервер унасан, event ирэхгүй удсан
  check(ctx = {}) {
    const L = this.live; if (!L) { this.offlineSince = null; return; }
    const map = cleanMap(ctx.map);
    if (ctx.online === false) { this.offlineSince ||= this.now(); if (this.now() - this.offlineSince > OFFLINE_MS) return this.end('interrupted', 'server_offline'); }
    else this.offlineSince = null;
    // Горим солигдсон нь map солигдохоос илүү тодорхой шалтгаан (AIM ↔ Competitive хоёулаа map солино)
    if (L.source === 'matchzy' && ctx.aim) return this.end('aborted', 'mode_changed');
    if (L.source === 'cs2log' && ctx.aim === false) return this.end(L.decided ? 'completed' : 'aborted', 'returned_to_competitive');
    if (ctx.online !== false && map && map !== L.map) return this.end(L.decided ? 'completed' : 'aborted', 'map_changed');
    if (this.now() - L.lastEventAt > STALE_MS) return this.end('interrupted', 'no_events');
  }

  /* ---------- AIM: CS2 log ---------- */
  // ctx.aim = { mode:'aim1v1'|'aim2v2', map, workshop_id, aim_weapon, target_rounds }  (AIM бэлэн үед л)
  onLog(text, ctx = {}) {
    // Давхардсан хүргэлт (logaddress давхар бүртгэгдсэн, HTTP дахин илгээлт) = яг ижил POST body.
    // Мөр бүрээр биш body-гоор шалгана: нэг секундэд ижил текст бүхий 2 бодит event-ийг алдахгүй.
    const body = String(text);
    const key = crypto.createHash('sha1').update(body).digest('hex'), now = this.now();
    if (this.seen.has(key) && now - this.seen.get(key) < DEDUPE_MS) return;
    this.seen.set(key, now);
    if (this.seen.size > SEEN_MAX) for (const [k, t] of this.seen) { if (now - t > DEDUPE_MS || this.seen.size > SEEN_MAX) this.seen.delete(k); else break; }
    for (const line of body.split('\n')) {
      if (!line.trim()) continue;
      const ev = parseLog(line); if (ev) this.logEvent(ev, ctx);
    }
  }
  logEvent(ev, ctx) {
    const aim = ctx.aim;
    if (ev.type === 'restart') {
      if (this.live) this.end(this.live.decided ? 'completed' : 'aborted', this.live.source === 'cs2log' ? 'restarted' : 'mode_changed');
      if (aim) this.start({ source: 'cs2log', mode: aim.mode, map: cleanMap(aim.map), workshop_id: aim.workshop_id, aim_weapon: aim.aim_weapon, target_rounds: aim.target_rounds });
      return;
    }
    const L = this.live; if (!L || L.source !== 'cs2log') return;     // live AIM тоглолт байхгүй бол (warmup г.м.) юу ч тоолохгүй
    L.lastEventAt = this.now();
    if (ev.type === 'warmup') return this.end(L.decided ? 'completed' : 'aborted', 'warmup');
    if (ev.type === 'gameover') return this.end('completed', 'game_over');   // оноо = round бүрийн "Team ... (CT "x") (T "y")" мөрөөс
    if (L.decided) return;                       // ялагч тодорхой болсны дараах мөр (win panel) тоологдохгүй
    if (ev.type === 'roundstart') { L.health = {}; return; }
    if (ev.type === 'score') return this.applyScore(ev.ct, ev.t, true);
    if (ev.type === 'switch') { if (ev.p.steam && !ev.p.bot) { const p = this.player(ev.p.steam, ev.p.name, ev.p.team); if (p) p.connected = true; } return; }
    if (ev.type === 'disconnect') { const p = ev.p.steam && L.players[ev.p.steam]; if (p) p.connected = false; return; }
    if (ev.type === 'enter') { const p = ev.p.steam && this.player(ev.p.steam, ev.p.name, ev.p.team); if (p) p.connected = true; return; }
    if (ev.type === 'suicide') {
      const v = ev.v.steam && this.player(ev.v.steam, ev.v.name, ev.v.team); if (!v) return;
      v.deaths++; v.suicides++; return;
    }
    if (ev.type === 'kill') {
      const v = ev.v.steam && this.player(ev.v.steam, ev.v.name, ev.v.team);
      if (v) v.deaths++;                                                    // хүний үхэл (хэн ч алсан)
      const a = ev.a.steam && this.player(ev.a.steam, ev.a.name, ev.a.team);
      if (!a || !v) return;                                                 // bot оролцсон kill тоологдохгүй
      if (a === v) { a.suicides++; return; }
      if (a.team && a.team === v.team) { a.team_kills++; return; }
      a.kills++; if (ev.headshot) a.headshot_kills++;
      return;
    }
    if (ev.type === 'assist') {
      const a = ev.a.steam && L.players[ev.a.steam], v = ev.v.steam && L.players[ev.v.steam];
      if (a && v && a !== v && ev.a.team && ev.a.team !== ev.v.team) a.assists++;
      return;
    }
    if (ev.type === 'attacked') {
      if (!ev.v.steam || !ev.a.steam) return;
      L.has_damage = true;
      const prev = L.health[ev.v.steam] ?? 100, now = Math.max(0, Math.min(100, ev.health));
      L.health[ev.v.steam] = now;
      if (ev.a.steam === ev.v.steam || !ev.a.team || ev.a.team === ev.v.team) return;     // өөрийгөө/багийнхнаа — ADR-д орохгүй
      const a = this.player(ev.a.steam, ev.a.name, ev.a.team); if (a) a.damage += Math.max(0, Math.min(ev.damage, prev - now));  // overkill тоологдохгүй
    }
  }
  applyScore(ct, t, roundEnded) {
    const L = this.live; const prev = L.score.ct + L.score.t;
    L.score = { ct, t }; const total = ct + t;
    if (roundEnded && total > prev) {
      L.rounds = total;
      // Тухайн round-ын төгсгөлд серверт байсан (баг сонгосон) хүн бүр round тоглосон
      const present = new Set(Object.values(L.players).filter(p => p.connected && p.team).map(p => p.steam_id));
      for (const r of this.roster) if (r.team) { this.player(r.steam, r.name, r.team); present.add(r.steam); }
      for (const s of present) L.players[s].rounds_played += total - prev;
      L.health = {};
    }
    if (L.target_rounds && (ct >= L.target_rounds || t >= L.target_rounds) && ct !== t) L.decided = ct > t ? 'CT' : 'T';
  }

  /* ---------- Competitive: MatchZy event ---------- */
  onMatchZy(e, ctx = {}) {
    const ev = String(e && e.event || '').toLowerCase();
    const ref = e && e.matchid !== undefined ? `matchzy:${e.matchid}:${e.map_number ?? 0}` : null;
    if (ev === 'going_live') {
      if (this.live) this.end(this.live.decided ? 'completed' : 'aborted', this.live.source === 'matchzy' ? 'restarted' : 'mode_changed');
      const map = cleanMap(ctx.map); if (!map) return;
      this.start({ source: 'matchzy', mode: 'competitive', map, ext: ref });
      return;
    }
    const L = this.live; if (!L || L.source !== 'matchzy') return;
    if (ref && L.ext && ref !== L.ext) return;                              // өөр тоглолтын хуучин event
    L.lastEventAt = this.now();
    if (ev === 'round_end' || ev === 'map_result' || ev === 'series_end') this.applyMatchZy(e);
    if (ev === 'map_result' || ev === 'series_end') {
      const w = e.winner || {}; const ws = side(w.side) || (w.team && L.team1Side ? (w.team === 'team1' ? L.team1Side : other(L.team1Side)) : null);
      L.decided = ws || (L.score.ct === L.score.t ? 'draw' : L.score.ct > L.score.t ? 'CT' : 'T');
      this.end('completed', 'game_over');
    }
  }
  applyMatchZy(e) {
    const L = this.live;
    const w = e.winner || {}; const ws = side(w.side);
    if (ws && (w.team === 'team1' || w.team === 'team2')) L.team1Side = w.team === 'team1' ? ws : other(ws);   // halftime-д тал солигдоно
    const t1 = e.team1 || {}, t2 = e.team2 || {};
    const s1 = L.team1Side || 'CT', s2 = other(s1);
    if (Number.isInteger(+t1.score) && Number.isInteger(+t2.score) && t1.score !== undefined && t2.score !== undefined) {
      const sc = { ct: 0, t: 0 }; sc[s1 === 'CT' ? 'ct' : 't'] = +t1.score; sc[s2 === 'CT' ? 'ct' : 't'] = +t2.score;
      L.score = sc; L.rounds = Math.max(L.rounds, sc.ct + sc.t);
    }
    for (const [team, s] of [[t1, s1], [t2, s2]]) {
      for (const pl of Array.isArray(team.players) ? team.players : []) {
        const steam = steam64(pl && pl.steamid); if (!steam) continue;        // bot / буруу ID
        const st = pl.stats || {}; const n = (k) => (Number.isFinite(+st[k]) && +st[k] >= 0 ? Math.floor(+st[k]) : 0);
        const p = this.player(steam, pl.name, s);
        // MatchZy-ийн утга нь тоглолтын эхнээс хуримтлагдсан → сүүлийн event = эцсийн дүн (давхардсан event аюулгүй)
        Object.assign(p, { kills: n('kills'), deaths: n('deaths'), assists: n('assists'), headshot_kills: n('headshot_kills'), team_kills: n('team_kills'),
          suicides: n('suicides'), rounds_played: n('rounds_played'), team: s });
        p.teamKey = team === t1 ? 'team1' : 'team2';
        if (st.damage !== undefined) { L.has_damage = true; p.damage = n('damage'); }
        if (st.mvp !== undefined) { L.has_mvp = true; p.mvp = n('mvp'); }
      }
    }
    // Тоглогчийн эцсийн тал = багийн одоогийн тал (халфтаймын дараа ч зөв)
    for (const p of Object.values(L.players)) if (p.teamKey) p.team = p.teamKey === 'team1' ? s1 : s2;
    const present = new Set(this.roster.map(r => r.steam));
    for (const p of Object.values(L.players)) p.connected = this.roster.length ? present.has(p.steam_id) : true;
  }

  /* ---------- Хадгалах / сэргээх (agent restart) ---------- */
  toJSON() { return { v: 1, live: this.live, out: this.out }; }
  // AIM (log): restart-ын үеийн мөрүүд алдагдсан → "interrupted" (бүртгэгдсэн бодит тоо хэвээр, дутуу гэж тэмдэглэнэ)
  // Competitive (MatchZy): статистик нь хуримтлагдсан тул дараагийн event-ээр бүрэн үргэлжилнэ.
  restore(j) {
    if (!j || j.v !== 1) return;
    this.out = Array.isArray(j.out) ? j.out : [];
    if (j.live && j.live.id) {
      this.live = j.live; this.live.lastEventAt = this.now();
      if (this.live.source === 'cs2log') this.end('interrupted', 'agent_restart');
      else this.log(`↻ Competitive тоглолт үргэлжилж байна (${this.live.id.slice(0, 8)})`);
    }
  }
}

/* ---------- Илгээх дараалал (agent restart, сүлжээний алдаанаас хамгаална) ----------
 * items: [{ match, attempts, nextAt, lastError }] — agent/.berx-matches.json-д хадгалагдана.
 * Амжилттай (2xx, duplicate) → устгана. 400/409/422 (буруу өгөгдөл) → rejected (дахин илгээхгүй, лог). 401/404/405/429/5xx/сүлжээ → backoff. */
class MatchQueue {
  constructor(o = {}) { this.items = []; this.rejected = []; this.now = o.now || Date.now; this.max = o.max || 500; this.baseMs = o.baseMs || 5000; this.capMs = o.capMs || 300000; this.rand = o.rand || Math.random; }
  add(match) {
    if (this.items.some(x => x.match.id === match.id)) return;
    this.items.push({ match, attempts: 0, nextAt: 0, lastError: null });
    if (this.items.length > this.max) this.items.shift();
  }
  delay(attempts) { const d = Math.min(this.capMs, this.baseMs * 2 ** Math.max(0, attempts - 1)); return Math.round(d * (0.8 + this.rand() * 0.4)); }
  due() { return this.items.find(x => x.nextAt <= this.now()) || null; }
  result(item, status, error) {
    if (status >= 200 && status < 300) { this.items = this.items.filter(x => x !== item); return 'sent'; }
    // 401 (secret), 404/405 (сайт хараахан шинэчлэгдээгүй), 408/429 → дахин оролдоно; бусад 4xx = буруу өгөгдөл
    if (status >= 400 && status < 500 && ![401, 404, 405, 408, 429].includes(status)) {
      this.items = this.items.filter(x => x !== item); this.rejected.push({ id: item.match.id, status, error: String(error || '').slice(0, 200), at: this.now() });
      this.rejected = this.rejected.slice(-50); return 'rejected';
    }
    item.attempts++; item.lastError = String(error || status).slice(0, 200); item.nextAt = this.now() + this.delay(item.attempts); return 'retry';
  }
  toJSON() { return { items: this.items, rejected: this.rejected }; }
  restore(j) { if (j && Array.isArray(j.items)) this.items = j.items.filter(x => x && x.match && x.match.id).map(x => ({ ...x, nextAt: 0 })); if (j && Array.isArray(j.rejected)) this.rejected = j.rejected; }
}

module.exports = { MatchRecorder, MatchQueue, parseLog, splitLine, steam64, cleanMap, side };
