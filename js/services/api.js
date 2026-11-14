/* =========================================================
 * API LAYER — UI ба өгөгдлийн эх үүсвэрийн хоорондох давхарга
 * ---------------------------------------------------------
 * UI зөвхөн BerxAPI-г дуудна. Одоо Demo adapter ажиллаж байна:
 *   - Гишүүд, урилга, санал, чат  → BerxStore (localStorage)
 *   - Тоглолтын статистик          → BERX_MOCK (жишээ өгөгдөл)
 *
 * Бодит хувилбарт солих газрууд (TODO):
 *   statsFor / matches   → server function: GET /api/faceit/players/:id/stats
 *                          (FACEIT Data API key зөвхөн server талд)
 *   premier rating       → server function: Leetify API (Steam ID-аар)
 *   presence (Steam)     → Steam Web API GetPlayerSummaries (server)
 *   invites/availability → Supabase table + Realtime channel
 *   auth                 → Supabase Auth + invite_codes table
 * API key-г frontend кодонд ХЭЗЭЭ Ч хийхгүй.
 * ========================================================= */
(function () {
  'use strict';
  const M = window.BERX_MOCK;
  const S = window.BerxStore;
  const DAY = 86400000;
  const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);

  const SOURCES = {
    stats:    { mode: 'demo', label: 'DEMO', target: 'FACEIT Data API' },
    premier:  { mode: 'demo', label: 'DEMO', target: 'Leetify API (Steam ID)' },
    steam:    { mode: 'none', label: 'Холбогдоогүй', target: 'Steam Web API' },
    realtime: { mode: 'local', label: 'Local only', target: 'Supabase Realtime' },
    auth:     { mode: 'demo', label: 'DEMO', target: 'Supabase Auth' }
  };

  function faceitLevel(elo) {
    const t = [500, 750, 900, 1050, 1200, 1350, 1530, 1750, 2000];
    for (let i = 0; i < t.length; i++) if (elo <= t[i]) return i + 1;
    return 10;
  }

  const PERIODS = { day: 1, week: 7, month: 30, all: 9999 };

  function members() { return S.get().members; }
  function member(id) { return members().find(m => m.id === id); }
  function me() { const s = S.get().session; return s ? member(s.userId) : null; }
  function matchesOf(id) {
    const st = S.get();
    if (st.live) { const v = st.matchDetails && st.matchDetails[id]; return Array.isArray(v) ? v : []; }
    const v = M.MATCHES && M.MATCHES[id]; return Array.isArray(v) ? v : [];
  }
  // Map жагсаалтад байхгүй (Overpass, Vertigo, Train...) map-д fallback
  function mapInfo(id) {
    const m = M.MAPS.find(x => x.id === id);
    if (m) return m;
    const name = String(id || '?').replace(/^\w/, c => c.toUpperCase());
    return { id, name: id === 'dust2' ? 'Dust II' : name, img: null };
  }
  // LAN урилгын map-ууд: invites.map баганад "mirage,dust2" хэлбэрээр (хуучин нэг map-тай урилгатай нийцтэй)
  const LAN_MAPS = ['mirage', 'dust2', 'inferno', 'nuke', 'ancient', 'anubis', 'cache'];
  function inviteMaps(inv) { return String((inv && inv.map) || '').split(',').map(s => s.trim()).filter(Boolean); }
  function inviteMapsLabel(inv) { return inviteMaps(inv).map(id => mapInfo(id).name).join(' · '); }
  const isLiveM = (m) => !!(S.get().live && m && m.live && m.live.periods && m.live.periods.all && Array.isArray(m.live.weeks));
  function inWindow(list, period, offset = 0) {
    if (!Array.isArray(list)) return [];
    const days = PERIODS[period] || 9999;
    const now = Date.now();
    const to = now - offset * days * DAY, from = to - days * DAY;
    return list.filter(x => x.date <= to && x.date > from);
  }

  function aggregate(list) {
    if (!Array.isArray(list)) list = [];
    const n = list.length;
    if (!n) return { matches: 0, kd: 0, wr: 0, hs: 0, adr: 0, rating: 0, k: 0, d: 0, a: 0, eloGain: 0, ratingGain: 0, wins: 0 };
    let k = 0, d = 0, a = 0, w = 0, eg = 0, rg = 0;
    const avg = (key) => { const v = list.map(x => x[key]).filter(x => x !== null && x !== undefined && !Number.isNaN(x)); return v.length ? v.reduce((s, x) => s + +x, 0) / v.length : 0; };
    list.forEach(m => { k += m.k || 0; d += m.d || 0; a += m.a || 0; w += m.result === 'W'; eg += m.eloDelta || 0; rg += m.ratingDelta || 0; });
    return { matches: n, k, d, a, wins: w, kd: +(k / Math.max(1, d)).toFixed(2), wr: Math.round(w / n * 100), hs: Math.round(avg('hsPct')), adr: Math.round(avg('adr')), rating: +avg('rating').toFixed(2), eloGain: eg, ratingGain: rg };
  }
  // Server-ийн бэлдсэн хугацааны нэгтгэл (live.periods / live.weeks) → aggregate хэлбэр
  function fromPeriod(p) {
    if (!p) return { matches: 0, kd: 0, wr: 0, hs: 0, adr: 0, rating: 0, k: 0, d: 0, a: 0, eloGain: 0, ratingGain: 0 };
    return { matches: p.matches || 0, kd: p.kd ?? 0, wr: p.wr ?? 0, hs: p.hs ?? 0, adr: p.adr ?? 0, rating: p.rating ?? 0, k: p.k || 0, d: p.d || 0, a: p.a || 0, eloGain: p.premierDelta || 0, ratingGain: p.premierDelta || 0 };
  }

  // Steam/FACEIT/Leetify-ээс татсан нэгдсэн статистик (member.live)
  function liveAgg(m) {
    const L = m && m.live; if (!L) return null;
    const o = {};
    ['kd', 'wr', 'hs', 'adr'].forEach(k => { if (typeof L[k] === 'number') o[k] = L[k]; });
    const cnt = typeof L.matchCount === 'number' ? L.matchCount : typeof L.matches === 'number' ? L.matches : null; // хуучин: matches = тоо
    if (cnt !== null) o.matches = cnt;
    return o;
  }

  function statsFor(id, period = 'all') {
    const mem = member(id); if (!mem) return null;
    const all = Array.isArray(matchesOf(id)) ? matchesOf(id) : [];
    const list = period === 'all' ? all : inWindow(all, period);
    const agg = aggregate(list);
    const mapWR = {};
    M.MAPS.slice(0, 6).forEach(mp => {
      const ml = all.filter(x => x.map === mp.id);
      mapWR[mp.id] = { played: ml.length, wr: ml.length ? Math.round(ml.filter(x => x.result === 'W').length / ml.length * 100) : 0 };
    });
    // ELO trend: одоогийн ELO-оос ухрааж тооцоолно
    const fm = all.filter(x => x.type === 'FACEIT').slice(0, 20);
    let e = mem.faceitElo; const trend = [{ elo: e, date: Date.now() }];
    fm.forEach(x => { e -= x.eloDelta; trend.unshift({ elo: e, date: x.date }); });
    const prev = aggregate(inWindow(all, 'month', 1));
    const live = liveAgg(mem);
    if (isLiveM(mem)) {
      const L = mem.live, P = L.periods;
      const prem = all.filter(x => x.type === 'Premier' && x.rank).slice(0, 25).reverse();
      const ltrend = prem.length ? prem.map(x => ({ elo: x.rank, date: x.date })) : [{ elo: mem.premier || 0, date: Date.now() }];
      const allMaps = [...new Set([...M.MAPS.map(x => x.id), ...all.map(x => x.map)])];
      const mwr = {};
      allMaps.forEach(id => { const ml = all.filter(x => x.map === id && (x.result === 'W' || x.result === 'L')); if (ml.length || M.MAPS.some(x => x.id === id)) mwr[id] = { played: ml.length, wr: ml.length ? Math.round(ml.filter(x => x.result === 'W').length / ml.length * 100) : 0 }; });
      const cur = fromPeriod(P.month), prv = fromPeriod(L.weeks && L.weeks[1]);
      const lifetime = fromPeriod(P.all);
      return {
        ...lifetime, ...(period === 'all' ? {} : fromPeriod(P[period])),
        source: 'live', syncedAt: mem.syncedAt || null, premier: mem.premier, faceitElo: mem.faceitElo, level: L.faceitLevel || faceitLevel(mem.faceitElo),
        faceit: L.faceit, premierStats: L.premierStats, warnings: L.warnings || [], loaded: !!(S.get().matchDetails && S.get().matchDetails[id]),
        mapWR: mwr, trend: ltrend, trendLabel: 'Premier rating', last10: all.slice(0, 10), recent: all.slice(0, 30), all,
        k: cur.k || lifetime.k, d: cur.d || lifetime.d, a: cur.a || lifetime.a,
        ratingGain: P.month?.premierDelta || 0, eloGain: 0,
        delta: { kd: cur.matches && prv.matches ? +(cur.kd - prv.kd).toFixed(2) : 0, wr: cur.matches && prv.matches ? cur.wr - prv.wr : 0, hs: cur.matches && prv.matches ? cur.hs - prv.hs : 0 },
        demo: false
      };
    }
    return {
      ...agg, ...(live || {}), source: mem.statsSource || 'demo', syncedAt: mem.syncedAt || null, premier: mem.premier, faceitElo: mem.faceitElo, level: faceitLevel(mem.faceitElo),
      mapWR, trend, last10: all.slice(0, 10), recent: all.slice(0, 20),
      delta: { kd: +(aggregate(inWindow(all, 'month')).kd - prev.kd).toFixed(2), wr: aggregate(inWindow(all, 'month')).wr - prev.wr, hs: aggregate(inWindow(all, 'month')).hs - prev.hs },
      demo: true
    };
  }

  const METRICS = {
    premier:  { label: 'Premier rating', fmt: v => v.toLocaleString('en-US'), get: (m, a) => m.premier },
    elo:      { label: 'FACEIT ELO', fmt: v => v.toLocaleString('en-US'), get: (m, a) => m.faceitElo },
    kd:       { label: 'K/D ratio', fmt: v => v.toFixed(2), get: (m, a) => a.kd },
    wr:       { label: 'Win rate', fmt: v => v + '%', get: (m, a) => a.wr },
    hs:       { label: 'Headshot %', fmt: v => v + '%', get: (m, a) => a.hs },
    eloGain:  { label: 'Хамгийн их rating нэмсэн', fmt: v => (v > 0 ? '+' : '') + v, get: (m, a) => a.eloGain },
    matches:  { label: 'Хамгийн олон тоглолт', fmt: v => v, get: (m, a) => a.matches }
  };

  function leaderboard(metric = 'premier', period = 'all') {
    const def = METRICS[metric];
    const rows = members().map(m => {
      if (isLiveM(m)) {
        const L = m.live;
        const cur = fromPeriod(L.periods[period] || L.periods.all);
        const prvAgg = period === 'all' ? fromPeriod(L.weeks[1]) : fromPeriod(period === 'week' ? L.weeks[1] : null);
        const delta = (L.periods.week && L.periods.week.premierDelta) || 0;
        const prevMember = { ...m, premier: (m.premier || 0) - delta };
        return { m, agg: cur, value: def.get(m, cur) || 0, prevValue: def.get(prevMember, prvAgg.matches ? prvAgg : cur) || 0 };
      }
      const all = matchesOf(m.id);
      let cur = aggregate(period === 'all' ? all : inWindow(all, period));
      if (period === 'all' && m.live) cur = { ...cur, ...liveAgg(m) };
      const prevPeriod = period === 'all' ? 'month' : period;
      const prv = aggregate(inWindow(all, prevPeriod, 1));
      // Rating/ELO-ийн өмнөх утгыг сүүлийн хугацааны өөрчлөлтөөр тооцоолно
      const prevMember = { ...m, premier: m.premier - cur.ratingGain, faceitElo: m.faceitElo - cur.eloGain };
      return { m, agg: cur, value: def.get(m, cur), prevValue: def.get(prevMember, prv) };
    });
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const prevSorted = [...rows].sort((a, b) => b.prevValue - a.prevValue);
    return sorted.map((r, i) => ({ ...r, rank: i + 1, prevRank: prevSorted.indexOf(r) + 1, display: def.fmt(r.value) }));
  }

  /* ---------- Awards ---------- */
  const AWARDS = [
    { key: 'CARRY', emoji: '👑', title: 'CARRY', desc: 'Хамгийн өндөр K/D', art: null, source: 'auto' },
    { key: 'AIM_GOD', emoji: '🎯', title: 'AIM GOD', desc: 'Хамгийн өндөр HS%', art: null, source: 'auto' },
    { key: 'MVP', emoji: '🔥', title: 'MVP', desc: 'Хамгийн өндөр дундаж rating', art: null, source: 'auto' },
    { key: 'CHICKEN', emoji: '🐔', title: 'CHICKEN', desc: 'Санал хураалтаар хамгийн аймхай', art: null, source: 'vote' },
    { key: 'BOT', emoji: '🤖', title: 'BOT', desc: 'Хамгийн бага K/D', art: null, source: 'auto' },
    { key: 'ELO_DONATOR', emoji: '📉', title: 'ELO DONATOR', desc: 'Хамгийн их ELO алдсан', art: null, source: 'auto' },
    { key: 'ALWAYS_LATE', emoji: '🐢', title: 'ALWAYS LATE', desc: 'Хамгийн олон удаа хоцорсон', art: null, source: 'manual' },
    { key: 'AFK_KING', emoji: '💤', title: 'AFK KING', desc: 'Хамгийн их AFK хийдэг', art: null, source: 'manual' },
    { key: 'EXCUSE_MASTER', emoji: '🎭', title: 'EXCUSE MASTER', desc: 'Хамгийн олон шалтаг', art: null, source: 'manual' }
  ];

  function maxBy(rows, f, dir = 1) {
    let best = null;
    rows.forEach(r => { if (r.agg.matches && (best === null || dir * f(r) > dir * f(best))) best = r; });
    return best;
  }
  function topCount(obj) {
    let best = null, n = 0;
    Object.entries(obj || {}).forEach(([k, v]) => { if (v > n) { best = k; n = v; } });
    return best ? { id: best, n } : null;
  }

  function awards(week = 0) {
    const st = S.get();
    let rows = members().map(m => ({ m, agg: isLiveM(m) ? fromPeriod(m.live.weeks && m.live.weeks[week]) : aggregate(inWindow(matchesOf(m.id), 'week', week)) }));
    const out = {};
    const pick = (key, r, val) => { out[key] = r ? { member: r.m, value: val(r) } : null; };
    const hasMatchData = rows.some(r => r.agg.matches);
    if (!hasMatchData && week === 0) {
      // Тоглолт тус бүрийн өгөгдөл байхгүй (live) → FACEIT lifetime статистикаар
      rows = members().filter(m => m.live && m.live.kd != null).map(m => ({ m, agg: { matches: m.live.matches || 1, kd: +m.live.kd, hs: +(m.live.hs || 0), wr: +(m.live.wr || 0) } }));
      pick('CARRY', maxBy(rows, r => r.agg.kd), r => 'K/D ' + r.agg.kd.toFixed(2));
      pick('AIM_GOD', maxBy(rows, r => r.agg.hs), r => 'HS ' + Math.round(r.agg.hs) + '%');
      pick('MVP', maxBy(rows, r => r.agg.wr), r => 'WR ' + Math.round(r.agg.wr) + '%');
      pick('BOT', rows.length > 1 ? maxBy(rows, r => r.agg.kd, -1) : null, r => 'K/D ' + r.agg.kd.toFixed(2));
      out.ELO_DONATOR = null;
    } else {
      pick('CARRY', maxBy(rows, r => r.agg.kd), r => 'K/D ' + r.agg.kd.toFixed(2));
      pick('AIM_GOD', maxBy(rows, r => r.agg.hs), r => 'HS ' + r.agg.hs + '%');
      const hasRating = rows.some(r => r.agg.matches && r.agg.rating);
      pick('MVP', hasRating ? maxBy(rows, r => r.agg.rating) : maxBy(rows, r => r.agg.kd * (r.agg.wr || 50)), r => hasRating ? (st.live ? 'Leetify ' : 'AVG R ') + r.agg.rating.toFixed(2) : 'K/D ' + r.agg.kd.toFixed(2) + ' · WR ' + r.agg.wr + '%');
      pick('BOT', rows.filter(r => r.agg.matches).length > 1 ? maxBy(rows, r => r.agg.kd, -1) : null, r => 'K/D ' + r.agg.kd.toFixed(2));
      const donor = maxBy(rows, r => r.agg.eloGain, -1);
      pick('ELO_DONATOR', donor && donor.agg.eloGain < 0 ? donor : null, r => r.agg.eloGain + (st.live ? ' Premier' : ' ELO'));
    }
    if (week === 0) {
      const tally = {}; Object.values(st.votes.CHICKEN || {}).forEach(t => tally[t] = (tally[t] || 0) + 1);
      const c = topCount(tally); out.CHICKEN = c && member(c.id) ? { member: member(c.id), value: c.n + ' санал' } : null;
      const l = topCount(st.manual.late); out.ALWAYS_LATE = l && member(l.id) ? { member: member(l.id), value: l.n + ' удаа хоцорсон' } : null;
      const a = topCount(st.manual.afk); out.AFK_KING = a && member(a.id) ? { member: member(a.id), value: a.n + ' удаа AFK' } : null;
      const e = topCount(st.manual.excuse); out.EXCUSE_MASTER = e && member(e.id) ? { member: member(e.id), value: e.n + ' шалтаг' } : null;
    } else {
      const past = (st.history && st.history[week]) || (st.live ? {} : (M.PAST_MANUAL_AWARDS || {})[week]) || {};
      ['CHICKEN', 'ALWAYS_LATE', 'AFK_KING', 'EXCUSE_MASTER'].forEach(k => {
        out[k] = past[k] && member(past[k]) ? { member: member(past[k]), value: 'Түүх' } : null;
      });
    }
    return AWARDS.map(a => ({ ...a, winner: out[a.key] }));
  }

  /* ---------- Notifications ---------- */
  function notify(text, icon = '🔔', link = null) {
    S.set(s => { s.notifications.unshift({ id: uid('n'), text, icon, link, date: Date.now(), read: false }); s.notifications = s.notifications.slice(0, 40); });
    document.dispatchEvent(new CustomEvent('berx:toast', { detail: { text, icon } }));
  }

  /* ---------- Invites ---------- */
  function createInvite(data) {
    const me_ = me();
    const inv = { id: uid('inv'), status: 'active', createdBy: me_.id, createdAt: Date.now(), responses: { [me_.id]: 'yes' }, ...data };
    S.set(s => { s.invites.unshift(inv); });
    notify(`${me_.nick} шинэ ${inv.type} урилга илгээлээ (${inv.invited.length} найз)`, '📨', 'invite');
    return inv;
  }
  function respond(inviteId, answer, who) {
    const userId = who || me().id;
    let full = false, inv;
    S.set(s => {
      inv = s.invites.find(i => i.id === inviteId); if (!inv) return;
      const before = Object.values(inv.responses).filter(v => v === 'yes').length;
      inv.responses[userId] = answer;
      if (!inv.invited.includes(userId)) inv.invited.push(userId);
      const after = Object.values(inv.responses).filter(v => v === 'yes').length;
      full = before < inv.slots && after >= inv.slots;
      if (answer === 'late') s.manual.late[userId] = (s.manual.late[userId] || 0) + 1;
    });
    const nm = member(userId)?.nick;
    const lbl = { yes: 'тоглоно 🔥', maybe: 'магадгүй 🤔', late: 'хоцорно 🐢', no: 'тоглохгүй 💀' }[answer];
    if (who) notify(`${nm}: ${lbl}`, '💬', 'invite');
    if (full) document.dispatchEvent(new CustomEvent('berx:fullstack', { detail: { inviteId, slots: inv.slots } }));
    return inv;
  }
  // Тоглохгүй / хоцорно / магадгүй гэсэн хүн шалтгаанаа бичнэ → Awards (EXCUSE MASTER)-д тоологдоно
  function setExcuse(inviteId, text, who) {
    const userId = who || me().id; text = String(text || '').trim().slice(0, 140); if (!text) return;
    S.set(s => {
      const inv = s.invites.find(i => i.id === inviteId); if (!inv) return;
      inv.excuses ||= {};
      if (!inv.excuses[userId]) s.manual.excuse[userId] = (s.manual.excuse[userId] || 0) + 1;
      inv.excuses[userId] = text; s.lastExcuse[userId] = text;
    });
  }
  function genExcuse() {
    const p = M.EXCUSE_PARTS, r = (a) => a[Math.floor(Math.random() * a.length)];
    return `${r(p.subject)} ${r(p.action)}${r(p.tail)}`;
  }
  function cancelInvite(id) { S.set(s => { const i = s.invites.find(x => x.id === id); if (i) i.status = 'cancelled'; }); }
  function activeInvites() {
    const now = Date.now();
    return S.get().invites.filter(i => i.status === 'active' && i.start > now - 3 * 3600000).sort((a, b) => a.start - b.start);
  }

  // DEMO: найзуудын хариултыг дуурайх (Admin дээр унтрааж болно)
  function simulateResponses(inviteId) {
    if (!S.get().prefs.simulate) return;
    const inv = S.get().invites.find(i => i.id === inviteId); if (!inv) return;
    const pending = inv.invited.filter(id => !inv.responses[id] && id !== me().id);
    const r = Math.random;
    pending.forEach((id, i) => {
      setTimeout(() => {
        const cur = S.get().invites.find(x => x.id === inviteId);
        if (!cur || cur.status !== 'active' || cur.responses[id]) return;
        const p = r(); const ans = p < .58 ? 'yes' : p < .74 ? 'maybe' : p < .88 ? 'late' : 'no';
        respond(inviteId, ans, id);
        if (ans !== 'yes' && r() < .8) setTimeout(() => setExcuse(inviteId, genExcuse(), id), 900);
      }, 1800 + i * 1500 + r() * 1200);
    });
  }

  function setAvailability(val, who) {
    const id = who || me().id;
    S.set(s => { s.availability[id] = val; });
  }

  function sendChat(text) {
    const m = me(); if (!text.trim()) return;
    S.set(s => { s.chat.push({ by: m.id, text: text.trim(), date: Date.now() }); s.chat = s.chat.slice(-120); });
    if (S.get().prefs.simulate && Math.random() < 0.6) {
      const others = members().filter(x => x.id !== m.id);
      const bot = others[Math.floor(Math.random() * others.length)];
      const replies = ['😂😂', 'GG', 'Ок, 5 мин', 'Би бэлэн 🔥', 'Энэ удаа хоцрохгүй ээ (хоцорно)', 'rush B?', 'ELO-гоо буцааж авна', 'BOT шагнал чинийх болох нь ээ 💀', '+1'];
      setTimeout(() => S.set(s => s.chat.push({ by: bot.id, text: replies[Math.floor(Math.random() * replies.length)], date: Date.now(), demo: true })), 1400 + Math.random() * 1500);
    }
  }

  /* ---------- Steam login + stats sync ----------
   * Backend (server/server.js) ажиллаж байвал:
   *   /auth/steam           → Steam OpenID нэвтрэлт
   *   /api/me               → нэвтэрсэн Steam хэрэглэгч
   *   /api/stats/:steam64   → Leetify (Premier) + FACEIT Data API + Steam Web API
   * Backend байхгүй (жишээ нь Claude artifact preview) бол DEMO горим.
   */
  let backend = null;
  async function detectBackend() {
    try {
      const r = await fetch('api/health', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) throw 0; const j = await r.json(); backend = j && j.ok ? j : null;
    } catch (e) { backend = null; }
    return backend;
  }
  function parseSteamId(input) {
    const v = String(input || '').trim();
    const m = v.match(/(7656119\d{10})/); if (m) return { id: m[1] };
    const vanity = v.match(/steamcommunity\.com\/id\/([^/?#]+)/i) || (/^[a-zA-Z0-9_-]{2,32}$/.test(v) ? [0, v] : null);
    if (vanity) return { vanity: vanity[1] };
    return null;
  }
  function hashNum(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function demoStats(steamId) {
    const r = M.rng(hashNum(steamId));
    const elo = Math.round(900 + r() * 1700);
    return { premier: Math.round(8000 + r() * 17000), faceitElo: elo, faceitNick: null,
      live: { kd: +(0.8 + r() * 0.65).toFixed(2), wr: Math.round(42 + r() * 20), hs: Math.round(35 + r() * 25), adr: Math.round(65 + r() * 30), matches: Math.round(80 + r() * 900), inGame: false } };
  }
  function applyStats(memberId, data, source) {
    S.set(s => {
      const m = s.members.find(x => x.id === memberId); if (!m) return;
      if (data.premier) m.premier = data.premier;
      if (data.faceitElo) m.faceitElo = data.faceitElo;
      if (data.faceitNick) m.faceitNick = data.faceitNick;
      if (data.avatar && !m.customAvatar && (!m.avatar || source === 'live')) m.avatar = data.avatar;
      m.live = { ...(m.live || {}), ...(data.live || {}) };
      m.statsSource = source; m.syncedAt = Date.now();
    });
  }
  async function syncStats(memberId) {
    const m = member(memberId); if (!m || !m.steamId) return { error: 'Steam холбоогүй байна' };
    if (backend) {
      try {
        const r = await fetch('api/stats/' + encodeURIComponent(m.steamId), { credentials: 'same-origin' });
        const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || r.status);
        applyStats(memberId, j, 'live'); return { ok: true, source: 'live', warnings: j.warnings || [] };
      } catch (e) { return { error: 'Статистик татаж чадсангүй: ' + e.message }; }
    }
    applyStats(memberId, demoStats(m.steamId), 'demo');
    return { ok: true, source: 'demo' };
  }
  function linkSteamMember({ steamId, nick, avatar }) {
    const st = S.get();
    let m = st.members.find(x => x.steamId === steamId);
    if (!m) {
      const id = 'st-' + steamId.slice(-8);
      S.set(s => { s.members.push({ id, nick: (nick || 'Steam_' + steamId.slice(-4)).slice(0, 16), name: nick || '', avatar: avatar || '', premier: 0, faceitElo: 1000, title: 'Шинэ гишүүн 🐣', steamId, faceitNick: '' });
        s.accounts.push({ userId: id, login: 'steam:' + steamId, kind: 'steam', hash: null, createdAt: Date.now() }); s.presence[id] = 'online'; });
      notify(`${nick || 'Шинэ гишүүн'} Steam-ээр BERX багт нэгдлээ 🎉`, '👋');
      m = member(id);
    } else if (!st.accounts.some(a => a.userId === m.id && a.kind === 'steam')) {
      S.set(s => s.accounts.push({ userId: m.id, login: 'steam:' + steamId, kind: 'steam', hash: null, createdAt: Date.now() }));
    }
    S.set(s => { s.session = { userId: m.id }; s.presence[m.id] = 'online'; });
    return m;
  }
  // DEMO: Steam profile link/ID-аар "нэвтрэх" (backend байхгүй үед)
  async function demoSteamLogin(input, nick) {
    const p = parseSteamId(input); if (!p) return { error: 'Steam profile линк эсвэл SteamID64 (7656119...) оруулна уу' };
    const steamId = p.id || ('7656119' + String(hashNum(p.vanity)).padStart(10, '0').slice(0, 10));
    const m = linkSteamMember({ steamId, nick: nick || p.vanity });
    await syncStats(m.id);
    return { ok: true };
  }
  // Бодит: /auth/steam-ээс буцаж ирсний дараа
  async function checkSteamSession() {
    if (!backend) return null;
    try {
      const r = await fetch('api/me', { credentials: 'same-origin', cache: 'no-store' }); if (!r.ok) return null;
      const j = await r.json(); if (!j.steamId) return null;
      const m = linkSteamMember(j); syncStats(m.id); return m;
    } catch (e) { return null; }
  }

  // Имэйл эсвэл утас (Монгол 8 оронтой, эсвэл +код)
  function normalizeLogin(v) {
    v = String(v || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { kind: 'email', value: v.toLowerCase() };
    const digits = v.replace(/[\s\-()]/g, '');
    if (/^\+?\d{8,15}$/.test(digits)) {
      const d = digits.replace(/^\+/, '');
      return { kind: 'phone', value: '+' + (d.length === 8 ? '976' + d : d) };
    }
    return null;
  }
  async function hashPass(login, pass) {
    const data = new TextEncoder().encode('berx:' + login + ':' + pass);
    try { const buf = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
    catch (e) { let h = 5381; for (const c of data) h = ((h << 5) + h + c) | 0; return 'x' + (h >>> 0).toString(16); }
  }

  function presenceOf(id) {
    const st_ = S.get(); const p = st_.presence[id] || 'offline';
    const last = st_.live ? (st_.lastSeen && st_.lastSeen[id] ? Date.now() - st_.lastSeen[id] : null) : (M.LAST_SEEN || {})[id];
    const m = member(id);
    // Steam төлөвийг зөвхөн бодит (live) өгөгдөл байгаа үед харуулна — хуурамчаар үүсгэхгүй
    const steam = m && m.statsSource === 'live' && m.live ? { inGame: !!m.live.inGame, persona: m.live.personaState } : null;
    return { site: p, lastSeen: last ? Date.now() - last : null, steam };
  }

  window.BerxAPI = {
    SOURCES, METRICS, AWARDS, PERIODS, maps: M.MAPS,
    members, member, me, matchesOf, mapInfo, fromPeriod, LAN_MAPS, inviteMaps, inviteMapsLabel, statsFor, leaderboard, awards, faceitLevel, aggregate,
    notify, createInvite, respond, setExcuse, genExcuse, cancelInvite, activeInvites, simulateResponses,
    setAvailability, sendChat, presenceOf, uid,
    content: { excuseParts: M.EXCUSE_PARTS, get excusesSaid() { return M.EXCUSES_SAID || {}; } },
    // ---------- Auth (DEMO) ----------
    // Бодит хувилбар: supabase.auth.signUp({ email | phone, password }) / signInWithPassword(...)
    detectBackend, get backend() { return backend; }, syncStats, demoSteamLogin, checkSteamSession, parseSteamId,
    normalizeLogin, async register({ nick, login, password }) {
      const L = normalizeLogin(login);
      if (!L) return { error: 'Имэйл эсвэл утасны дугаараа зөв оруулна уу' };
      if (!nick || nick.trim().length < 2) return { error: 'Nickname дор хаяж 2 тэмдэгт' };
      if (!password || password.length < 6) return { error: 'Нууц үг дор хаяж 6 тэмдэгт' };
      const st = S.get();
      if (st.accounts.some(a => a.login === L.value)) return { error: 'Энэ ' + (L.kind === 'email' ? 'имэйл' : 'утас') + ' бүртгэлтэй байна. Нэвтэрнэ үү.' };
      if (st.members.some(m => m.nick.toLowerCase() === nick.trim().toLowerCase())) return { error: 'Энэ nickname аль хэдийн бүртгэлтэй' };
      const id = 'u-' + Math.random().toString(36).slice(2, 9);
      const hash = await hashPass(L.value, password);
      S.set(s => {
        s.members.push({ id, nick: nick.trim(), name: nick.trim(), avatar: '', premier: 0, faceitElo: 1000, title: 'Шинэ гишүүн 🐣', steamId: '', faceitNick: '', isNew: true });
        s.accounts.push({ userId: id, login: L.value, kind: L.kind, hash, createdAt: Date.now() });
        s.presence[id] = 'online'; s.session = { userId: id };
      });
      notify(`${nick.trim()} BERX багт нэгдлээ 🎉`, '👋');
      return { ok: true };
    },
    async login(login, password) {
      const L = normalizeLogin(login);
      if (!L) return { error: 'Имэйл эсвэл утасны дугаараа зөв оруулна уу' };
      const acc = S.get().accounts.find(a => a.login === L.value);
      if (!acc || !S.get().members.find(m => m.id === acc.userId)) return { error: 'Бүртгэл олдсонгүй. Эхлээд бүртгүүлнэ үү.' };
      const ok = acc.demo ? password === M.DEMO_PASSWORD : acc.hash === await hashPass(L.value, password);
      if (!ok) return { error: 'Нууц үг буруу байна' };
      S.set(s => { s.session = { userId: acc.userId }; s.presence[acc.userId] = 'online'; });
      return { ok: true };
    },
    account(userId) { return S.get().accounts.find(a => a.userId === userId); },
    // ---- mutations (demo: local; live.js нь server рүү дамжуулна) ----
    voteChicken(target) { const id = me().id; S.set(s => { s.votes.CHICKEN ||= {}; s.votes.CHICKEN[id] = target; }); },
    record(kind, userId, delta) { S.set(s => { s.manual[kind] ||= {}; s.manual[kind][userId] = Math.max(0, (s.manual[kind][userId] || 0) + (delta < 0 ? -1 : 1)); }); },
    profileUpdate(f) { const id = me().id; S.set(s => { const m = s.members.find(x => x.id === id); if (f.nick) m.nick = f.nick; if (f.bio !== undefined) m.title = f.bio; if (f.steamId !== undefined) m.steamId = f.steamId; if (f.faceitNick !== undefined) m.faceitNick = f.faceitNick; }); return Promise.resolve({ ok: true }); },
    setAvatar({ dataUrl, preset } = {}) { const id = me().id; S.set(s => { const m = s.members.find(x => x.id === id); m.avatar = dataUrl || preset || ''; m.customAvatar = !!dataUrl; }); },
    adminToggle(uid_) { S.set(s => { const m = s.members.find(x => x.id === uid_); if (m) m.admin = !m.admin; }); },
    adminRemove(uid_) { S.set(s => { s.members = s.members.filter(x => x.id !== uid_); delete s.availability[uid_]; }); },
    isLive() { return !!S.get().live; },
    // Feature flag-ууд backend-ээс (/api/health). Demo preview (backend-гүй) үед SKIN INVENTORY локалаар туршина.
    features() { return backend ? (backend.features || {}) : { skins: true }; },
    logout() { S.set(s => { s.session = null; }); }
  };
})();
