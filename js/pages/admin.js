/* Тохиргоо — Profile edit + Admin settings */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI, S = window.BerxStore;
  const { esc, Avatar, CardHead, icon } = U;
  const ui = () => (window.BerxApp.ui.admin ||= { tab: 'profile' });
  const AV_CHOICES = ['dok', 'kaze', 'b1t', 'senzu', 'nmgd', 'temka', 'l1m0n', 'munkh', 'zolboo'].map(k => `assets/avatars/${k}.jpg`);

  function profileTab(me) {
    const d = ui().pdraft || {}; const val = (k) => d[k] ?? me[k] ?? '';
    return `<form class="card" id="profile-form">
      ${CardHead('edit', 'Профайл засах')}
      <div class="row wrap" style="gap:18px;align-items:flex-start">
        <div class="col" style="align-items:center">
          <label class="avatar-up" for="p-avatar-file" title="Өөрийн зургаа оруулах">${Avatar(me, 104, { ring: true })}<span class="cam">${icon('upload')}</span></label>
          <input type="file" id="p-avatar-file" accept="image/*" class="sr">
          <div class="row" style="gap:6px"><label for="p-avatar-file" class="btn sm outline">${icon('upload')} Зураг оруулах</label>${me.customAvatar ? '<button type="button" class="btn sm ghost" data-action="remove-avatar">Хасах</button>' : ''}</div>
          <span class="dim" style="font-size:11.5px">эсвэл бэлэн avatar сонго</span>
          <div class="row wrap" style="gap:6px;max-width:220px;justify-content:center">${AV_CHOICES.map(a => `<button type="button" data-action="pick-avatar" data-v="${a}" style="border-radius:50%;${me.avatar === a ? 'box-shadow:0 0 0 2px var(--accent)' : ''}"><img src="${a}" alt="" style="width:34px;height:34px;border-radius:50%"></button>`).join('')}</div></div>
        <div class="grid cols" style="flex:1;min-width:min(260px,100%);--c:1fr 1fr;gap:12px">
          <div class="field" style="grid-column:span 2"><label>Нэвтрэх ${A.account(me.id)?.kind === 'phone' ? 'утас' : 'имэйл'}</label><input class="input" value="${esc(A.account(me.id)?.login || '—')}" readonly></div>
          <div class="field" style="grid-column:span 2"><label for="p-nick">Gaming nickname</label><input class="input" id="p-nick" name="nick" data-pd="nick" value="${esc(val('nick'))}" maxlength="16" required></div>
          <div class="field" style="grid-column:span 2"><label for="p-title" class="row between"><span>Bio</span><span class="dim" id="bio-count">${String(val('title')).length} / 160</span></label><textarea class="input" id="p-title" name="title" data-pd="title" rows="3" maxlength="160" placeholder="Өөрийнхөө тухай товч — ж: AWP-тай төрсөн, clutch-д айдаг 🐔">${esc(val('title'))}</textarea></div>
          <div class="field"><label for="p-steam">Steam ID (64-bit)</label><input class="input" id="p-steam" name="steamId" data-pd="steamId" value="${esc(val('steamId'))}" placeholder="7656119..."></div>
          <div class="field"><label for="p-faceit">FACEIT nickname</label><input class="input" id="p-faceit" name="faceitNick" data-pd="faceitNick" value="${esc(val('faceitNick'))}"></div>
          <div class="field" style="grid-column:span 2"><label>Premier / FACEIT</label><div class="row wrap" style="gap:10px;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.25);border:1px solid var(--line)">
            <span class="premier mono" style="font-weight:800">${me.premier ? me.premier.toLocaleString('en-US') : '—'}</span><span class="dim">Premier</span>
            <span class="accent mono" style="font-weight:800;margin-left:8px">${me.faceitElo ? me.faceitElo.toLocaleString('en-US') : '—'}</span><span class="dim">FACEIT ELO</span>
            <span class="dim" style="margin-left:auto;font-size:12px">🔒 Зөвхөн Steam/FACEIT-ээс автоматаар</span></div></div>
        </div>
      </div>
      <div class="note mt">ℹ️ Premier, FACEIT rating-ийг гараар оруулах боломжгүй — Steam ID оруулаад «Статистик татах» дарахад автоматаар орж ирнэ (server асаалттай үед бодитоор, эс бөгөөс demo).</div>
      <div class="row mt wrap"><button class="btn primary" type="submit">Хадгалах</button>${me.steamId ? `<button type="button" class="btn steam-btn" data-action="sync-stats" data-id="${me.id}">🔄 Статистик татах</button>` : ''}${U.SourceTag(me)}</div>
    </form>`;
  }

  // Төвөөс нь дөрвөлжин тайраад 256px JPEG болгоно (localStorage-д багтахаар)
  function squareImage(file, size) {
    return new Promise((resolve, reject) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = size;
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(u); resolve(c.toDataURL('image/jpeg', .85));
      };
      img.onerror = reject; img.src = u;
    });
  }

  function membersTab() {
    return `<div class="card">
      ${CardHead('crew', 'Гишүүд удирдах', `<span class="muted" style="font-size:12px">${A.members().length} гишүүн</span>`)}
      <div class="table-wrap"><table class="table"><thead><tr><th>Гишүүн</th><th>Steam</th><th>Premier</th><th>ELO</th><th>Эрх</th><th></th></tr></thead><tbody>
      ${A.members().map(m => `<tr><td><div class="row">${Avatar(m, 30)}<b>${esc(m.nick)}</b></div></td><td>${U.SourceTag(m)}</td><td class="premier mono">${m.premier}</td><td class="accent mono">${m.faceitElo}</td>
        <td><button class="chip ${m.admin ? 'accent' : ''}" data-action="toggle-admin" data-id="${m.id}">${m.admin ? 'Admin' : 'Гишүүн'}</button></td>
        <td>${m.id !== A.me().id ? `<button class="btn sm danger" data-action="remove-member" data-id="${m.id}">${icon('trash')} Хасах</button>` : '<span class="dim">Та</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="note mt">👋 Шинэ найзууд сайтын нүүрнээс өөрсдөө имэйл эсвэл утасны дугаараар бүртгүүлнэ. Энд зөвхөн эрх өгөх, хасах.</div>
    </div>`;
  }

  const mask = (l) => l.includes('@') ? l.replace(/^(.{2}).*(@.*)$/, '$1•••$2') : l.slice(0, 5) + '••••' + l.slice(-2);

  function systemTab() {
    const st = S.get();
    return `<div class="grid cols" style="--c:1fr 1fr">
      <div class="card">
        ${CardHead('lock', 'Бүртгэл')}
        <div class="muted" style="font-size:12.5px;margin-bottom:10px">Хүссэн хүн имэйл эсвэл утасны дугаар + нууц үгээр бүртгүүлж орно. ${st.accounts.length} бүртгэл байна (энэ хөтөч дотор).</div>
        ${st.accounts.slice(-5).reverse().map(a => { const m = A.member(a.userId); return m ? `<div class="row" style="padding:4px 0">${Avatar(m, 26)}<b style="flex:1">${esc(m.nick)}</b><span class="dim mono" style="font-size:12px">${esc(mask(a.login))}</span>${a.demo ? '<span class="chip demo">DEMO</span>' : ''}</div>` : ''; }).join('')}
      </div>
      <div class="card">
        ${CardHead('zap', 'Demo тохиргоо')}
        <button class="row between" style="width:100%;padding:8px 0" data-action="toggle-sim"><span><b>Найзуудын хариултыг дуурайх</b><div class="dim" style="font-size:12px">Урилга илгээхэд demo найзууд автоматаар хариулна, чатад хариу бичнэ</div></span><span class="toggle ${st.prefs.simulate ? 'on' : ''}"></span></button>
        <div class="row mt"><button class="btn danger" data-action="reset-demo">${icon('refresh')} Demo өгөгдлийг шинэчлэх</button></div>
      </div>
      <div class="card" style="grid-column:1/-1">
        ${CardHead('stats', 'Юу бодитоор ажиллаж байна?')}
        <div class="table-wrap"><table class="table"><thead><tr><th>Функц</th><th>Одоогийн төлөв</th><th>Дараагийн шат</th></tr></thead><tbody>
          ${[
            ['Navigation, цэс, modal, filter, animation', '<span class="chip win">Бодит</span>', '—'],
            ['Урилга үүсгэх / хариулах / lobby / FULL STACK', '<span class="chip warn">Local (энэ хөтөч)</span>', 'Supabase table + Realtime'],
            ['Өнөө орой тоглох төлөв', '<span class="chip warn">Local</span>', 'Supabase Realtime presence'],
            ['Найзуудын хариулт, чат хариу', '<span class="chip demo">DEMO simulation</span>', 'Бодит хэрэглэгчид'],
            ['Steam-ээр нэвтрэх', `<span class="chip ${A.backend ? 'win' : 'demo'}">${A.backend ? 'Бодит (server)' : 'DEMO (server асаагүй)'}</span>`, 'server/server.js — Steam OpenID'],
            ['Premier + FACEIT статистик татах', `<span class="chip ${A.backend ? 'win' : 'demo'}">${A.backend ? 'Бодит (server)' : 'DEMO'}</span>`, 'Leetify + FACEIT Data API (server key)'],
            ['Тоглолт тус бүрийн түүх, Leaderboard хугацаагаар, авто шагнал', '<span class="chip demo">DEMO data</span>', 'FACEIT match history + Leetify matches'],
            ['Санал хураалт, гараар бүртгэл, meme', '<span class="chip warn">Local</span>', 'Supabase DB + Storage'],
            ['Бүртгэл / нэвтрэлт (имэйл, утас, нууц үг)', '<span class="chip warn">Local (энэ хөтөч)</span>', 'Supabase Auth (email/phone + SMS баталгаажуулалт) + RLS'],
            ['Steam/CS2 тоглож буй төлөв', `<span class="chip ${A.backend ? 'win' : 'loss'}">${A.backend ? 'Бодит (STEAM_API_KEY)' : 'Холбогдоогүй'}</span>`, 'Steam Web API GetPlayerSummaries'],
            ['Notification', '<span class="chip warn">Local</span>', 'Supabase Realtime + Web Push']
          ].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="muted">${r[2]}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
    </div>`;
  }

  function liveSystemTab() {
    const h = A.backend || {}, n = A.members().length;
    const k = (ok, yes, no) => `<span class="chip ${ok ? 'win' : 'loss'}">${ok ? yes : no}</span>`;
    return `<div class="grid cols" style="--c:1fr 1fr">
      <div class="card">
        ${CardHead('lock', 'Server холболт')}
        <div class="kv">
          <span class="muted">Өгөгдлийн сан</span><span class="dim" style="font-size:12px">${h.db === 'supabase' ? 'Supabase Postgres' : 'Local файл (data/db.json)'}</span>${k(h.db === 'supabase', 'Supabase', 'Local')}
          <span class="muted">Realtime</span><span class="dim" style="font-size:12px">Supabase Broadcast</span>${k(!!h.realtime, 'Асаалттай', 'Polling 5с')}
          <span class="muted">Steam API</span><span class="dim" style="font-size:12px">nickname, avatar, CS2 төлөв</span>${k(h.steamApi, 'Key ✓', 'Key алга')}
          <span class="muted">FACEIT API</span><span class="dim" style="font-size:12px">ELO, level, K/D, WR, HS%</span>${k(h.faceit, 'Key ✓', 'Key алга')}
          <span class="muted">Leetify API</span><span class="dim" style="font-size:12px">Premier rating</span>${k(h.leetify, 'Key ✓', 'Key алга')}
        </div>
        ${h.warning ? `<div class="note warn mt">⚠️ ${esc(h.warning)}</div>` : ''}
      </div>
      <div class="card">
        ${CardHead('crew', 'Бүртгэл')}
        <div class="big-num">${n}</div><div class="muted">бүртгэлтэй гишүүн</div>
        <div class="note mt">Хүссэн хүн имэйл, утас эсвэл Steam-ээр бүртгүүлнэ. Admin эрхийг зөвхөн Vercel-ийн <code>ADMIN_LOGINS</code> тохиргоо (таны имэйл/утас/SteamID) өгнө. ${h.adminConfigured ? '' : '<b style="color:#ffb15c">⚠️ ADMIN_LOGINS тохируулаагүй байна.</b>'} Зөвхөн найзуудаа оруулах бол <code>ALLOWED_STEAM_IDS</code>.</div>
      </div>
    </div>`;
  }

  function render() {
    const u = ui(), me = A.me();
    if (u.tab === 'members' && !me.admin) u.tab = 'profile';
    return `
      ${U.Hero({ kicker: 'BERX CS2 CREW', title: 'ТОХИРГОО', lead: 'Профайл, гишүүд, бүртгэл, demo тохиргоо.' })}
      <div class="tabs mb" style="display:inline-flex;max-width:100%">
        <button class="${u.tab === 'profile' ? 'on' : ''}" data-action="admin-tab" data-v="profile">${icon('edit')} Миний профайл</button>
        ${me.admin ? `<button class="${u.tab === 'members' ? 'on' : ''}" data-action="admin-tab" data-v="members">${icon('crew')} Гишүүд</button>` : ''}
        <button class="${u.tab === 'system' ? 'on' : ''}" data-action="admin-tab" data-v="system">${icon('gear')} Систем</button>
      </div>
      ${u.tab === 'profile' ? profileTab(me) : u.tab === 'members' ? membersTab() : A.isLive() ? liveSystemTab() : systemTab()}`;
  }

  const actions = {
    'admin-tab'(el) { ui().tab = el.dataset.v; return true; },
    'pick-avatar'(el) { A.setAvatar({ preset: el.dataset.v }); },
    'remove-avatar'() { A.setAvatar({}); },
    'toggle-admin'(el) { if (el.dataset.id === A.me().id) return window.BerxApp.toast('Өөрийн admin эрхийг хасах боломжгүй', '⚠️'); A.adminToggle(el.dataset.id); },
    'remove-member'(el) { const m = A.member(el.dataset.id); window.BerxApp.confirm(`${m.nick}-г багаас хасах уу?`, () => A.adminRemove(m.id)); },
    'toggle-sim'() { S.set(s => { s.prefs.simulate = !s.prefs.simulate; }); },
    'reset-demo'() { window.BerxApp.confirm('Бүх local өөрчлөлт устаж, demo өгөгдөл анхны байдалдаа орно. Үргэлжлүүлэх үү?', () => { S.reset(); window.BerxApp.ui = {}; window.BerxApp.toast('Demo өгөгдөл шинэчлэгдлээ', '♻️'); }); }
  };

  function mount(root) {
    root.querySelectorAll('[data-pd]').forEach(el => el.addEventListener('input', () => {
      (ui().pdraft ||= {})[el.dataset.pd] = el.value;
      if (el.id === 'p-title') { const c = root.querySelector('#bio-count'); if (c) c.textContent = el.value.length + ' / 160'; }
    }));
    const file = root.querySelector('#p-avatar-file');
    file?.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      if (!f.type.startsWith('image/')) return window.BerxApp.toast('Зөвхөн зураг сонгоно уу', '⚠️');
      try {
        const url = await squareImage(f, 256);
        A.setAvatar({ dataUrl: url });
        window.BerxApp.toast('Avatar шинэчлэгдлээ 📸', '✅');
      } catch (e) { window.BerxApp.toast('Зураг уншиж чадсангүй', '⚠️'); }
    });
    root.querySelector('#profile-form')?.addEventListener('submit', async e => {
      e.preventDefault(); const f = new FormData(e.target); const prevSteam = A.me().steamId;
      const r = await A.profileUpdate({ nick: String(f.get('nick')).trim(), bio: String(f.get('title')).trim().slice(0, 160), steamId: String(f.get('steamId')).trim(), faceitNick: String(f.get('faceitNick')).trim() });
      if (r && r.error) return window.BerxApp.toast(r.error, '⚠️');
      const newSteam = String(f.get('steamId')).trim();
      if (A.isLive() && newSteam && newSteam !== (prevSteam || '')) { window.BerxApp.toast('Steam холбогдлоо — статистик татаж байна...', '🔄'); A.syncStats(A.me().id, true).then(() => window.BerxApp.render()); }
      ui().pdraft = null;
      window.BerxApp.toast('Профайл хадгалагдлаа ✓', '💾');
    });
  }
  window.BerxPages.admin = { render, actions, mount, ui };
})();
