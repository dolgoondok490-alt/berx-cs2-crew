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
  const M = window.BERX_MOCK;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function initialState() {
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
      memes: clone(M.MEMES),
      manual: clone(M.MANUAL_RECORDS),
      votes: { CHICKEN: { kaze: 'nmgd', senzu: 'nmgd', temka: 'l1m0n' } },     // энэ долоо хоногийн санал
      matchVotes: {},                      // { matchId: { voterId: { mvp, bot } } }
      prefs: { simulate: true, sound: false },
      lastMap: null
    };
  }

  let state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? Object.assign(initialState(), JSON.parse(raw)) : initialState();
  } catch (e) { state = initialState(); }

  const listeners = new Set();
  let saveTimer = null;

  function persist() {
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
    // Server (live) горим: demo өгөгдлийг огт ашиглахгүй, хоосон төлөвөөс эхэлнэ
    switchToLive() {
      KEY = 'berx.live.v1';
      const empty = { live: true, session: null, members: [], accounts: [], availability: {}, presence: {}, lastSeen: {}, invites: [], notifications: [], readNotifs: [],
        chat: [], memes: [], manual: { late: {}, afk: {}, excuse: {} }, votes: { CHICKEN: {} }, matchVotes: {}, lastExcuse: {}, history: {}, lastMatchKey: null,
        prefs: { simulate: false, sound: false }, lastMap: null };
      let cached = {};
      try { cached = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { cached = {}; }
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
