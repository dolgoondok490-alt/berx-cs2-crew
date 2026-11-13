/* =========================================================
 * APP — router, shell, global actions
 * ========================================================= */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI, S = window.BerxStore, PAGES = window.BerxPages;
  const { icon, esc, Avatar } = U;
  const ROUTES = ['dashboard', 'invite', 'crew', 'stats', 'leaderboard', 'awards', 'fun', 'server', 'admin'];
  const root = document.getElementById('app');

  const App = window.BerxApp = {
    ui: {}, locked: false, pendingRender: false, booting: true,
    route: 'dashboard', openMenu: null, modal: null, chatOpen: false, sideOpen: false, authTab: 'register',
    render, toast, confirm, fullStack
  };

  function currentRoute() { const h = (location.hash || '').slice(1); return ROUTES.includes(h) ? h : 'dashboard'; }

  const STEAM_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-9.96 9.04l5.35 2.21a2.83 2.83 0 0 1 1.6-.49h.15l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.42v.13a2.83 2.83 0 0 1-5.62.46L2.35 14.9A10 10 0 1 0 12 2Zm-4.05 15.2-1.22-.5a2.13 2.13 0 1 0 1.17-2.9l1.27.52a1.57 1.57 0 1 1-1.22 2.88Zm9.48-7.55a2.51 2.51 0 1 0-2.51 2.51 2.52 2.52 0 0 0 2.5-2.5Zm-4.4 0a1.89 1.89 0 1 1 1.88 1.88 1.89 1.89 0 0 1-1.88-1.88Z"/></svg>';

  function steamDemoModal() {
    return U.Modal(`<div class="modal-body">
      <div class="row" style="gap:10px;margin-bottom:6px"><span class="steam-badge">${STEAM_ICON}</span><h3 style="margin:0;font-size:20px">Steam-ээр нэвтрэх</h3><span class="chip demo">DEMO</span></div>
      <p class="muted" style="font-size:13px;margin:6px 0 14px">Энэ preview дээр server ажиллахгүй тул Steam руу шилжих боломжгүй. Steam profile линкээ оруулбал demo статистиктай профайл үүснэ. <b>Server (server/server.js) асаасан үед</b> жинхэнэ Steam нэвтрэлт нээгдэж, Premier + FACEIT статистик бодитоор татагдана.</p>
      <form id="steam-demo" class="col" style="gap:12px">
        <div class="field"><label for="sd-id">Steam profile линк эсвэл SteamID64</label><input class="input" id="sd-id" placeholder="https://steamcommunity.com/profiles/7656119..." required></div>
        <div class="field"><label for="sd-nick">Nickname (заавал биш)</label><input class="input" id="sd-nick" maxlength="16" placeholder="Steam нэр"></div>
        <div id="sd-err" class="loss" style="min-height:18px;font-size:13px"></div>
        <button class="btn lg block steam-btn" type="submit">${STEAM_ICON} Үргэлжлүүлэх</button>
      </form></div>`, { size: 'sm' });
  }

  /* ---------- Auth: бүртгүүлэх / нэвтрэх ---------- */
  function loginView() {
    const reg = App.authTab === 'register';
    return `<div class="login">
      <div class="art"><div class="txt"><div class="brand"><div class="logo" style="font-size:64px">BER<b>X</b></div><div class="sub" style="font-size:16px">CS2 CREW</div></div><div class="side-motto" style="font-size:24px;margin-top:18px">BAD AIM.<br>LOW ELO.<span></span></div></div></div>
      <div class="panel">
        <div class="seg" style="margin-bottom:18px;align-self:flex-start"><button class="${reg ? '' : 'on'}" data-action="auth-tab" data-v="login">Нэвтрэх</button><button class="${reg ? 'on' : ''}" data-action="auth-tab" data-v="register">Бүртгүүлэх</button></div>
        <h1 class="display" style="font-size:40px;margin:0 0 4px">${reg ? 'Бүртгүүлэх' : 'Нэвтрэх'}</h1>
        <p class="muted" style="margin:0 0 20px">${reg ? 'Имэйл эсвэл утасны дугаар, нууц үгээрээ бүртгүүлээд BERX багт нэгд.' : 'Имэйл эсвэл утасны дугаар, нууц үгээрээ нэвтэр.'}</p>
        <button class="btn lg block steam-btn" data-action="steam-login">${STEAM_ICON} Steam-ээр ${reg ? 'бүртгүүлэх' : 'нэвтрэх'}</button>
        <div class="muted" style="font-size:12px;margin:8px 0 0;text-align:center">Premier, FACEIT статистик чинь автоматаар татагдана ⚡</div>
        <div class="or"><span>эсвэл имэйл / утсаар</span></div>
        <form id="auth-form" class="col" style="gap:12px" autocomplete="on" novalidate>
          ${reg ? `<div class="field"><label for="a-nick">Gaming nickname</label><input class="input" id="a-nick" name="nick" maxlength="16" placeholder="ж: Bat_awp" autocomplete="nickname" required></div>` : ''}
          <div class="field"><label for="a-login">Имэйл эсвэл утасны дугаар</label><input class="input" id="a-login" name="login" placeholder="you@mail.com эсвэл 9911 2233" autocomplete="username" inputmode="email" required></div>
          <div class="field"><label for="a-pass">Нууц үг</label><input class="input" id="a-pass" name="password" type="password" placeholder="${reg ? 'Дор хаяж 6 тэмдэгт' : '••••••'}" autocomplete="${reg ? 'new-password' : 'current-password'}" required></div>
          ${reg ? `<div class="field"><label for="a-pass2">Нууц үг давтах</label><input class="input" id="a-pass2" name="password2" type="password" autocomplete="new-password" required></div>
` : ''}
          <div id="auth-err" class="loss" style="min-height:18px;font-size:13px"></div>
          <button class="btn primary lg block" type="submit">${reg ? 'Бүртгүүлээд орох' : 'Lobby руу орох'} ${icon('arrow')}</button>
        </form>
        <div class="muted" style="font-size:13px;margin-top:14px;text-align:center">${reg ? 'Бүртгэлтэй юу? <button class="link" data-action="auth-tab" data-v="login">Нэвтрэх</button>' : 'Бүртгэлгүй юу? <button class="link" data-action="auth-tab" data-v="register">Бүртгүүлэх</button>'}</div>
        ${A.isLive() ? '<div class="dim" style="font-size:11.5px;margin-top:14px">🔐 Нууц үг шифрлэгдэж хадгалагдана. Steam-ээр орвол Premier, FACEIT статистик чинь автоматаар татагдана.</div>' : `
        ${reg ? '' : `<div class="note mt">🧪 <span>Demo гишүүнээр турших: <button class="link" data-action="demo-login">dok@berx.mn / ${esc(window.BERX_MOCK.DEMO_PASSWORD)}</button></span></div>`}
        <div class="dim" style="font-size:11.5px;margin-top:12px">🔐 Preview (DEMO): бүртгэл зөвхөн энэ хөтөч дотор хадгалагдана. Vercel дээр байршуулсан хувилбарт бүх найзын бүртгэл нэг дор хадгалагдана.</div>`}
      </div></div>`;
  }

  /* ---------- Shell ---------- */
  function shell() {
    const st = S.get(), me = A.me();
    const page = PAGES[App.route];
    const ctx = {
      me, openMenu: App.openMenu, notifications: st.notifications, unread: st.notifications.filter(n => !n.read).length,
      readyCount: Object.values(st.availability).filter(v => v === 'yes').length,
      pendingInvites: A.activeInvites().filter(i => i.invited.includes(me.id) && !i.responses[me.id]).length
    };
    return `<div class="app">
      <aside class="sidebar ${App.sideOpen ? 'open' : ''}">${U.Sidebar(App.route, ctx)}</aside>
      ${App.sideOpen ? '<div class="scrim" data-action="toggle-menu"></div>' : ''}
      <div class="main">
        <header class="topbar">${U.Header(App.route, ctx)}</header>
        <main class="content"><div class="page" data-page="${App.route}">${page.render()}</div></main>
      </div>
      ${App.chatOpen ? chatDrawer() : `<button class="chat-fab" data-action="toggle-chat" aria-label="Crew chat">${icon('chat')}</button>`}
      ${App.modal || ''}
    </div>`;
  }

  function chatDrawer() {
    const st = S.get(), me = A.me();
    return `<aside class="drawer" data-stop>
      <div class="dh">${icon('chat', 'accent').replace('<svg', '<svg style="width:22px"')}<b style="font-size:16px">Crew chat</b><span class="chip demo">LOCAL</span><button class="icon-btn" style="margin-left:auto" data-action="toggle-chat" aria-label="Хаах">${icon('x')}</button></div>
      <div class="msgs" id="msgs">${st.chat.map(c => { const m = A.member(c.by); const mine = c.by === me.id; return `<div class="msg ${mine ? 'mine' : ''}">${mine ? '' : Avatar(m, 28)}<div>${mine ? '' : `<div class="who">${esc(m?.nick || '?')} · ${U.timeAgo(c.date)}</div>`}<div class="bub">${esc(c.text)}</div></div></div>`; }).join('')}</div>
      <form id="chat-form"><input class="input" id="chat-in" placeholder="Мессеж бичих..." autocomplete="off" maxlength="300"><button class="btn primary" type="submit" aria-label="Илгээх">${icon('send')}</button></form>
    </aside>`;
  }

  /* ---------- Render ---------- */
  let mountedPage = null;
  function render() {
    if (App.booting) return;
    if (App.locked) { App.pendingRender = true; return; }
    const ae = document.activeElement;
    const focusId = ae && ae.id ? ae.id : null;
    const sel = focusId && 'selectionStart' in ae ? [ae.selectionStart, ae.selectionEnd] : null;
    const scrollMsgs = document.getElementById('msgs');
    const atBottom = !scrollMsgs || scrollMsgs.scrollHeight - scrollMsgs.scrollTop - scrollMsgs.clientHeight < 40;

    if (!S.get().session || !A.me()) {
      root.innerHTML = loginView() + (App.modal || '');
      document.getElementById('auth-form').addEventListener('submit', onAuth);
      document.getElementById('steam-demo')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const res = await A.demoSteamLogin(document.getElementById('sd-id').value, document.getElementById('sd-nick').value.trim());
        if (res.error) { document.getElementById('sd-err').textContent = '✕ ' + res.error; return; }
        App.modal = null; toast(`Steam холбогдлоо: ${A.me().nick} 🎮 (demo stats)`, '✅'); render();
      });
      return;
    }
    const prev = mountedPage;
    if (prev && prev !== App.route && PAGES[prev]?.unmount) PAGES[prev].unmount();
    root.innerHTML = shell();
    const pageEl = root.querySelector('.page');
    if (prev === App.route) pageEl.style.animation = 'none';
    mountedPage = App.route;
    PAGES[App.route].mount?.(pageEl);
    // chat
    const cf = document.getElementById('chat-form');
    if (cf) {
      cf.addEventListener('submit', e => { e.preventDefault(); const i = document.getElementById('chat-in'); A.sendChat(i.value); i.value = ''; });
      const msgs = document.getElementById('msgs'); if (atBottom) msgs.scrollTop = msgs.scrollHeight;
    }
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (_) {} } }
  }

  async function onAuth(e) {
    e.preventDefault();
    const f = new FormData(e.target), err = document.getElementById('auth-err'), btn = e.target.querySelector('[type=submit]');
    const fail = (m) => { err.textContent = '✕ ' + m; e.target.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 }); btn.disabled = false; };
    btn.disabled = true;
    let res;
    if (App.authTab === 'register') {
      if (f.get('password') !== f.get('password2')) return fail('Нууц үг таарахгүй байна');
      res = await A.register({ nick: f.get('nick'), login: f.get('login'), password: f.get('password') });
    } else res = await A.login(f.get('login'), f.get('password'));
    if (res.error) return fail(res.error);
    toast(`Тавтай морил, ${A.me().nick}! 🎮`, '👋');
  }

  /* ---------- Toast / confirm / full stack ---------- */
  function toast(text, ic = '🔔') {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `<span style="font-size:18px">${ic}</span><span>${esc(text)}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 3200);
    while (box.children.length > 4) box.firstChild.remove();
  }
  let confirmCb = null;
  function confirm(text, cb) {
    confirmCb = cb;
    App.modal = U.Modal(`<div class="modal-body"><h3 style="margin:0 0 8px;font-size:20px">Баталгаажуулах</h3><p class="muted">${esc(text)}</p>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" data-action="close-modal">Болих</button><button class="btn primary" data-action="confirm-yes">Тийм</button></div></div>`, { size: 'sm' });
    render();
  }
  function fullStack(slots = 5) {
    const o = document.createElement('div'); o.className = 'fullstack';
    o.innerHTML = `<div class="box"><div style="font-size:60px">🎮🔥</div><h1>FULL STACK<br>READY</h1><p>${slots} / ${slots} · LET'S GO</p></div>`;
    document.body.appendChild(o);
    const colors = ['#ff6a00', '#ffb15c', '#ffffff', '#39d27a', '#a678ff'];
    for (let i = 0; i < 90; i++) {
      const c = document.createElement('i'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's'; c.style.animationDelay = Math.random() * .5 + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`; document.body.appendChild(c);
      setTimeout(() => c.remove(), 4200);
    }
    setTimeout(() => { o.style.transition = 'opacity .4s'; o.style.opacity = 0; setTimeout(() => o.remove(), 400); }, 2600);
  }

  /* ---------- Global actions ---------- */
  const actions = {
    go(el) {
      const r = el.dataset.route;
      if (el.dataset.inv) PAGES.invite.ui().selected = el.dataset.inv;
      if (el.dataset.member) PAGES.stats.ui().member = el.dataset.member;
      if (el.dataset.tab && r === 'admin') PAGES.admin.ui().tab = el.dataset.tab;
      App.modal = null; App.openMenu = null;
      if (location.hash.slice(1) === r) render(); else location.hash = r;
    },
    'toggle-menu'() { App.sideOpen = !App.sideOpen; return true; },
    'toggle-notif'() { App.openMenu = App.openMenu === 'notif' ? null : 'notif'; return true; },
    'toggle-user'() { App.openMenu = App.openMenu === 'user' ? null : 'user'; return true; },
    'notif-readall'() { if (A.markRead) A.markRead(S.get().notifications.map(n => n.id)); else S.set(s => s.notifications.forEach(n => n.read = true)); },
    'notif-open'(el) { const n = S.get().notifications.find(x => x.id === el.dataset.id); if (A.markRead) A.markRead([el.dataset.id]); else S.set(s => { s.notifications.find(x => x.id === el.dataset.id).read = true; }, { silent: true }); App.openMenu = null; if (n?.link) { if (location.hash.slice(1) === n.link) render(); else location.hash = n.link; } else render(); },
    'open-profile'(el) { const m = A.member(el.dataset.id); if (!m) return; App.openMenu = null; App.modal = U.ProfileModal(m); return true; },
    'close-modal'() { App.modal = null; confirmCb = null; return true; },
    'confirm-yes'() { const cb = confirmCb; App.modal = null; confirmCb = null; cb && cb(); return true; },
    'invite-member'(el) { const d = PAGES.invite.ui().draft; if (!d.invited.includes(el.dataset.id)) d.invited.push(el.dataset.id); App.modal = null; toast(`${A.member(el.dataset.id).nick} урилгын жагсаалтад нэмэгдлээ`, '➕'); location.hash === '#invite' ? render() : (location.hash = 'invite'); },
    'set-avail'(el) { A.setAvailability(el.dataset.val); toast(`Таны төлөв: ${U.AVAIL[el.dataset.val].e} ${U.AVAIL[el.dataset.val].t}`, '✅'); },
    respond(el) {
      A.respond(el.dataset.inv, el.dataset.val);
      if (el.dataset.val !== 'yes' && App.route !== 'invite') { PAGES.invite.ui().selected = el.dataset.inv; toast('Lobby дээр шалтгаанаа бичээрэй 🎭', '✍️'); location.hash = 'invite'; }
    },
    'toggle-chat'() { App.chatOpen = !App.chatOpen; return true; },
    'share-chat'(el) { A.sendChat(el.dataset.text); App.chatOpen = true; return true; },
    copy(el) { const t = el.dataset.text; (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast('Хуулагдлаа ✓', '📋')).catch(() => toast('Хуулах боломжгүй — гараар хуулна уу', '⚠️')); },
    logout() { App.openMenu = null; A.logout(); },
    'switch-user'() {
      App.openMenu = null;
      App.modal = U.Modal(`<div class="modal-body"><h3 style="margin:0 0 4px;font-size:20px">Өөр гишүүнээр турших</h3>
        <p class="muted" style="margin:0 0 16px;font-size:13px">Demo: localStorage найзуудын хооронд синк хийдэггүй тул нэг хөтөч дотор өөр гишүүн болж урилгад хариулж, lobby бүрдэхийг турших боломжтой.</p>
        <div class="who-pick">${A.members().map(m => `<button class="${m.id === A.me().id ? 'on' : ''}" data-action="do-switch" data-id="${m.id}">${Avatar(m, 44)}${esc(m.nick)}</button>`).join('')}</div></div>`, { size: 'sm' });
      return true;
    },
    'do-switch'(el) { S.set(s => { s.session = { userId: el.dataset.id }; s.presence[el.dataset.id] = 'online'; }); App.modal = null; toast(`Одоо та ${A.me().nick} 🎭`, '🔁'); render(); },
    'auth-tab'(el) { App.authTab = el.dataset.v; return true; },
    'steam-login'() {
      if (A.backend && A.backend.steam) { location.href = 'api/auth/steam'; return; }
      App.modal = steamDemoModal(); return true;
    },
    'sync-stats'(el) {
      const id = el.dataset.id || A.me().id; el.disabled = true; el.innerHTML = '⏳ Татаж байна...';
      A.syncStats(id, true).then(r => {
        const msg = r.error ? r.error : r.source === 'live' ? (r.cached ? 'Саяхан шинэчилсэн (1 минутын дараа дахин)' : 'Статистик шинэчлэгдлээ ✓ FACEIT + Leetify') : 'Demo статистик шинэчлэгдлээ (server холбогдоогүй)';
        toast(msg, r.error ? '⚠️' : '🔄');
        if (r.warnings && r.warnings.length) toast(r.warnings[0], '⚠️');
        render();
      });
    },
    'demo-login'() { document.getElementById('a-login').value = 'dok@berx.mn'; document.getElementById('a-pass').value = window.BERX_MOCK.DEMO_PASSWORD; }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    // dropdown-оос гадуур дарвал хаах
    if (App.openMenu && !e.target.closest('[data-stop]') && !(el && /toggle-(notif|user)/.test(el.dataset.action))) { App.openMenu = null; if (!el) { render(); return; } }
    if (!el) return;
    // modal доторх товшилт overlay-д хүрэхгүй
    if (el.dataset.action === 'close-modal' && el.classList.contains('overlay') && e.target.closest('[data-stop]')) return;
    const name = el.dataset.action;
    const page = PAGES[App.route];
    const fn = (page.actions && page.actions[name]) || actions[name];
    if (!fn) return;
    if (el.tagName === 'A' || el.type === 'submit') e.preventDefault();
    const rerender = fn(el, e);
    if (rerender === true) render();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (App.modal || App.openMenu || App.chatOpen || App.sideOpen) { App.modal = null; App.openMenu = null; App.sideOpen = false; App.chatOpen = false; render(); } }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[tabindex="0"][data-action]')) { e.preventDefault(); e.target.click(); }
  });

  window.addEventListener('hashchange', () => { App.route = currentRoute(); App.sideOpen = false; App.openMenu = null; App.modal = null; render(); window.scrollTo(0, 0); });
  S.subscribe(() => render());
  document.addEventListener('berx:toast', (e) => toast(e.detail.text, e.detail.icon));
  document.addEventListener('berx:fullstack', (e) => fullStack(e.detail?.slots));
  setInterval(() => { if (App.pendingRender && !App.locked) { App.pendingRender = false; render(); } }, 400);

  App.route = currentRoute();
  // 1) Server (Vercel/локал) байгаа эсэхийг шалгана → байвал LIVE, үгүй бол DEMO (preview)
  root.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center"><div class="brand" style="align-items:center"><div class="logo" style="font-size:54px">BER<b>X</b></div><div class="sub">LOADING...</div></div></div>';
  const timeout = new Promise(r => setTimeout(() => r(null), 10000)); // Vercel cold start-д хангалттай
  const loadScript = (src) => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error(src + ' ачаалагдсангүй')); document.head.appendChild(s); });
  Promise.race([A.detectBackend(), timeout]).then(async b => {
    if (!b || !window.BerxLive) {
      // DEMO: server олдсонгүй (preview) → жишээ өгөгдлийг энд л ачаална
      try { await loadScript('js/data/mock.js'); } catch (e) { console.warn(e.message); }
      S.initDemo();
    } else {
      await window.BerxLive.enable(b);
      const q = new URLSearchParams(location.search);
      if (q.get('steam_error')) { toast({ invalid: 'Steam нэвтрэлт амжилтгүй', verify: 'Steam баталгаажуулалт амжилтгүй', not_allowed: 'Энэ Steam данс зөвшөөрөгдөөгүй' }[q.get('steam_error')] || 'Steam алдаа', '⚠️'); history.replaceState(null, '', location.pathname + location.hash); }
      else if (A.me() && document.referrer.includes('steamcommunity.com')) toast(`Steam-ээр нэвтэрлээ: ${A.me().nick} 🎮`, '✅');
    }
    App.booting = false;
    render();
  }).catch(err => {
    console.error(err);
    App.booting = false;
    root.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:24px;text-align:center"><div><div class="logo display" style="font-size:44px">BERX</div><p class="muted">Ачаалахад алдаа гарлаа. Хуудсаа дахин ачаална уу.</p><pre style="color:#ff8b8b;white-space:pre-wrap;font-size:12px">${esc(err.message)}</pre><button class="btn primary" onclick="location.reload()">Дахин ачаалах</button></div></div>`;
  });
})();
