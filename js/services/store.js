/* =========================================================
 * STORE — клиент талын төлөв (state) + localStorage
 * ---------------------------------------------------------
 * АНХААР: localStorage нь зөвхөн ЭНЭ хөтөч дотор хадгалагдана.
 * Найзуудын хооронд синк хийгдэхгүй. Дараагийн шатанд
 * Supabase Database + Realtime-аар солигдоно (api.js-г үз).
 * ========================================================= */
(function () {
  'use strict';
  let KEY = 'berx.crew.v2';
  let ready = false;                       // initDemo() эсвэл switchToLive() дуудагдтал хадгалахгүй
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // Хуурамч өгөгдөлгүй хоосон төлөв (production/live болон эхлэлийн төлөв)
  function emptyState(live) {
    return { live: !!live, session: null, members: [], accounts: [], availability: {}, presence: {}, lastSeen: {}, invites: [], notifications: [], readNotifs: [],
      chat: [], memes: [], manual: { late: {}, afk: {}, excuse: {} }, votes: { CHICKEN: {} }, matchVotes: {}, lastExcuse: {}, history: {}, lastMatchKey: null,
      prefs: { simulate: false, sound: false }, lastMap: null };
  }

  // DEMO (server-гүй preview) — js/data/mock.js ачаалагдсаны дараа л дуудна
  function initialState() {
    const M = window.BERX_MOCK || {};
    if (!M.isDemo) return emptyState(false);
    return {
      session: null,                       // { userId }
      // DEMO бүртгэл. Бодит хувилбарт Supabase Auth (email+password, phone+password/OTP) хадгална.
      accounts: M.MEMBERS.map(m => ({ userId: m.id, login: m.id + '@berx.mn', kind: 'email', hash: null, demo: true, createdAt: Date.now() - 30 * 86400000 })),
      members: clone(M.MEMBERS).map(m => ({ ...m, skill: undefined, lateness: undefined })),
      availability: clone(M.AVAILABILITY),
      presence: clone(M.PRESENCE),
      invites: clone(M.INVITES),
      notifications: [
        { id: 'n1', text: 'DOK өнөө оройн FACEIT урилга илгээлээ', icon: '📨', link: 'invite', date: Date.now() - 4 * 3600000, read: false },
        { id: 'n2', text: 'Kaze урилгыг зөвшөөрлөө 🔥', icon: '✅', link: 'invite', date: Date.now() - 3.5 * 3600000, read: false },
        { id: 'n3', text: 'Энэ долоо хоногийн Awards — CHICKEN санал хураалт нээгдлээ 🐔', icon: '🏆', link: 'awards', date: Date.now() - 20 * 3600000, read: true }
      ],
      chat: clone(M.CHAT),
      lastExcuse: {},                      // { userId: 'хамгийн сүүлийн шалтаг' }
      memes: [],
      manual: clone(M.MANUAL_RECORDS),
      votes: { CHICKEN: { kaze: 'nmgd', senzu: 'nmgd', temka: 'l1m0n' } },     // энэ долоо хоногийн санал
      matchVotes: {},                      // { matchId: { voterId: { mvp, bot } } }
      prefs: { simulate: true, sound: false },
      lastMap: null
    };
  }

  let state = emptyState(false);

  const listeners = new Set();
  let saveTimer = null;

  function persist() {
    if (!ready) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) {
        // Квот хэтэрвэл meme зургуудыг хасаад дахин оролдоно
        try {
          const lite = { ...state, memes: state.memes.map(m => ({ ...m, img: null })) };
          localStorage.setItem(KEY, JSON.stringify(lite));
        } catch (_) { /* хадгалах боломжгүй — санах ойд ажиллана */ }
      }
    }, 120);
  }

  window.BerxStore = {
    get: () => state,
    set(mutator, opts = {}) {
      mutator(state);
      persist();
      if (!opts.silent) listeners.forEach(fn => fn(state));
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    initDemo() {
      KEY = 'berx.crew.v2'; ready = true;
      try { const raw = localStorage.getItem(KEY); state = raw ? Object.assign(initialState(), JSON.parse(raw)) : initialState(); }
      catch (e) { state = initialState(); }
      state.live = false;
    },
    // Server (live) горим: demo өгөгдлийг огт ашиглахгүй, хоосон төлөвөөс эхэлнэ
    switchToLive() {
      KEY = 'berx.live.v1'; ready = true;
      const empty = emptyState(true);
      let cached = {};
      try { cached = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { cached = {}; }
      // localStorage-д хадгалагдсан хуучин matchDetails (жишээ нь 520 гэсэн тоо) → зөвхөн array-г үлдээнэ
      if (cached.matchDetails && typeof cached.matchDetails === 'object') cached.matchDetails = Object.fromEntries(Object.entries(cached.matchDetails).filter(([, v]) => Array.isArray(v)));
      else delete cached.matchDetails;
      state = Object.assign(empty, cached, { live: true, prefs: { simulate: false } });
      listeners.forEach(fn => fn(state));
    },
    reset() {
      const session = state.session;
      state = initialState();
      state.session = session;
      persist();
      listeners.forEach(fn => fn(state));
    }
  };
})();
