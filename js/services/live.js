/* =========================================================
 * LIVE MODE — server (Vercel function + Supabase) холбогдсон үед
 * ---------------------------------------------------------
 * BerxAPI-ийн mutation-уудыг server рүү (POST api/action) дамжуулж,
 * GET api/state-ээр бүх найзын нэгдсэн төлөвийг татна.
 * Шинэчлэл: Supabase Realtime broadcast ("berx" channel) → дахин татах.
 * Realtime тохируулаагүй бол 5 секунд тутам polling.
 * ========================================================= */
(function () {
  'use strict';
  const S = window.BerxStore, A = window.BerxAPI;
  let refreshing = null, again = false, lastFull = 0, autoSynced = false;
  const matchCache = {}, inflight = {};
  const toast = (t, i) => document.dispatchEvent(new CustomEvent('berx:toast', { detail: { text: t, icon: i } }));
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  async function api(path, body) {
    const r = await fetch('api/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok) { const err = new Error(j.error || ('HTTP ' + r.status)); err.status = r.status; throw err; }
    return j;
  }

  async function refresh() {
    if (refreshing) { again = true; return refreshing; }
    refreshing = (async () => {
      try {
        const st = await api('state');
        if (!st.me) { if (S.get().session) S.set(s => { s.session = null; }); return; }
        S.set(s => {
          const read = new Set(s.readNotifs || []);
          Object.assign(s, {
            session: { userId: st.me }, members: st.members, presence: st.presence, lastSeen: st.lastSeen, availability: st.availability,
            invites: st.invites, chat: st.chat, memes: st.memes, votes: st.votes, matchVotes: st.matchVotes, manual: st.manual,
            lastExcuse: st.lastExcuse, history: st.history, lastMatchKey: st.lastMatchKey,
            notifications: st.notifications.map(n => ({ ...n, read: read.has(n.id) }))
          });
        });
      } catch (e) {
        if (e.status === 401) S.set(s => { s.session = null; });
      } finally {
        refreshing = null;
        if (again) { again = false; refresh(); }
      }
    })();
    return refreshing;
  }

  async function act(type, payload) {
    try {
      const r = await api('action', { type, payload });
      if (r.fullstack) fullstack(r.fullstack);
    } catch (e) { toast(e.message, '⚠️'); }
    return refresh();
  }
  function fullstack(slots) {
    if (Date.now() - lastFull < 6000) return; lastFull = Date.now();
    document.dispatchEvent(new CustomEvent('berx:fullstack', { detail: { slots } }));
  }

  /* ---------- realtime ---------- */
  let timer = null, debounce = null;
  function kick() { clearTimeout(debounce); debounce = setTimeout(refresh, 150); }
  function startRealtime(cfg) {
    const poll = (ms) => { clearInterval(timer); timer = setInterval(() => { if (!document.hidden && S.get().session) refresh(); }, ms); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.get().session) refresh(); });
    if (!cfg) { poll(5000); return; }
    poll(60000); // fallback
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.onload = () => {
      try {
        const client = window.supabase.createClient(cfg.url, cfg.key);
        client.channel('berx').on('broadcast', { event: 'changed' }, (msg) => {
          if (msg && msg.payload && msg.payload.fullstack) fullstack(msg.payload.fullstack);
          if (msg && msg.payload && msg.payload.server) { document.dispatchEvent(new Event('berx:server')); return; } // зөвхөн SERVER хуудас шинэчлэгдэнэ
          if (S.get().session) kick();
        }).subscribe();
      } catch (e) { poll(5000); }
    };
    s.onerror = () => poll(5000);
    document.head.appendChild(s);
  }

  // Нэвтэрсний дараа: өөрийн статистик 30 минутаас хуучин бол автоматаар шинэчилнэ
  function autoSync() {
    const m = A.me && A.me();
    if (autoSynced || !m || !m.steamId) return;
    autoSynced = true;
    // Хуучин бүтэцтэй (needsResync) эсвэл 30 минутаас хуучин бол дахин татна
    if ((m.live && m.live.needsResync) || !m.syncedAt || Date.now() - m.syncedAt > 30 * 60e3) A.syncStats(m.id).then(r => { if (r && r.ok && !r.cached) toast('Статистик автоматаар шинэчлэгдлээ 🔄', '📊'); });
  }
  document.addEventListener('berx:login', () => { autoSynced = false; autoSync(); });

  /* ---------- BerxAPI override ---------- */
  function enable(health) {
    S.switchToLive();
    const me = () => A.me();
    Object.assign(A, {
      async register({ nick, login, password }) { try { await api('auth/register', { nick, login, password }); await refresh(); return { ok: true }; } catch (e) { return { error: e.message }; } },
      async login(login, password) { try { await api('auth/login', { login, password }); await refresh(); document.dispatchEvent(new Event('berx:login')); return { ok: true }; } catch (e) { return { error: e.message }; } },
      logout() { api('auth/logout', {}).finally(() => { S.set(s => { s.session = null; }); }); },
      account(id) { const m = A.member(id); return m && m.login ? { login: m.login.startsWith('steam:') ? 'Steam ' + m.login.slice(6) : m.login, kind: m.loginKind } : null; },
      setAvailability(value) { const id = me().id; S.set(s => { s.availability[id] = value; }); act('avail', { value }); },
      createInvite(data) {
        const inv = { id: newId(), status: 'active', createdBy: me().id, createdAt: Date.now(), responses: { [me().id]: 'yes' }, excuses: {}, ...data };
        S.set(s => { s.invites.unshift(inv); });
        act('invite.create', { id: inv.id, type: data.type, start: data.start, slots: data.slots, map: data.map, invited: data.invited, message: data.message });
        return inv;
      },
      respond(inviteId, answer) {
        const id = me().id; S.set(s => { const i = s.invites.find(x => x.id === inviteId); if (i) i.responses[id] = answer; });
        act('invite.respond', { inviteId, answer }); return S.get().invites.find(x => x.id === inviteId);
      },
      setExcuse(inviteId, text) { const id = me().id; S.set(s => { const i = s.invites.find(x => x.id === inviteId); if (i) (i.excuses ||= {})[id] = text; }); act('invite.excuse', { inviteId, text }); },
      cancelInvite(inviteId) { act('invite.cancel', { inviteId }); },
      sendChat(text) { if (!String(text).trim()) return; const m = { id: newId(), by: me().id, text: String(text).trim(), date: Date.now() }; S.set(s => { s.chat.push(m); }); act('chat.send', { id: m.id, text: m.text }); },
      notify(text, icon) { toast(text, icon); }, // мэдэгдлийг server үүсгэнэ
      simulateResponses() { /* live горимд дуурайлт байхгүй */ },
      voteChicken(target) { const id = me().id; S.set(s => { s.votes.CHICKEN[id] = target; }); act('vote.chicken', { target }); },
      voteMatch(key, k, target) { act('vote.match', { key, k, target }); },
      record(kind, userId, delta) { act('record.add', { kind, userId, delta }); },
      memeCreate({ text, img }) { act('meme.create', { id: newId(), text, img }); },
      memeLike(id) { act('meme.like', { id }); },
      memeDelete(id) { act('meme.delete', { id }); },
      async profileUpdate(f) {
        try { await api('action', { type: 'profile.update', payload: f }); await refresh(); return { ok: true }; }
        catch (e) { return { error: e.message }; }
      },
      setAvatar({ dataUrl, preset } = {}) { act('profile.avatar', { dataUrl, preset }); },
      adminToggle(userId) { act('admin.toggle', { userId }); },
      adminRemove(userId) { act('admin.remove', { userId }); },
      async syncStats(userId, force) {
        try {
          const r = await api('stats/sync', { userId, force: !!force }); await refresh();
          delete matchCache[userId || me().id]; await A.loadMatches(userId || me().id);
          return { ok: true, source: 'live', cached: !!r.cached, warnings: r.warnings || [] };
        } catch (e) { return { error: e.message }; }
      },
      // Тоглолтын дэлгэрэнгүй түүх (FACEIT + Leetify) — хэрэгтэй үед л татна
      async loadMatches(userId) {
        const m = A.member(userId); if (!m || !m.syncedAt) return;
        const key = userId + ':' + m.syncedAt;
        if (matchCache[userId] === key || inflight[userId]) return;
        inflight[userId] = true;
        try {
          const r = await api('matches/' + encodeURIComponent(userId));
          matchCache[userId] = key;
          const list = Array.isArray(r.matches) ? r.matches : Array.isArray(r.matchHistory) ? r.matchHistory : []; // number/object ирвэл хоосон array
          S.set(s => { s.matchDetails = { ...(s.matchDetails || {}), [userId]: list }; });
        } catch (e) { /* ignore */ } finally { delete inflight[userId]; }
      },
      async demoSteamLogin() { location.href = 'api/auth/steam'; return { ok: true }; },
      async checkSteamSession() { await refresh(); return A.me(); },
      refresh, markRead(ids) { S.set(s => { s.readNotifs = [...new Set([...(s.readNotifs || []), ...ids])].slice(-200); s.notifications.forEach(n => { if (ids.includes(n.id)) n.read = true; }); }); }
    });
    startRealtime(health.realtime);
    return refresh().then(() => autoSync());
  }

  window.BerxLive = { enable, refresh };
})();
