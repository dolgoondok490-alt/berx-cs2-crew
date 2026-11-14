/* =========================================================
 * BERX SKIN INVENTORY — сонголт хийх, хувийн loadout (T / CT)
 * ---------------------------------------------------------
 *  • Каталог: assets/data/skins-catalog.json (WeaponPaints build-472 + ByMykel CSGO-API)
 *  • Live: /api/skins/state + /api/action (skins.save | skins.favorites | skins.clear)
 *    SteamID64-ийг сервер session-оос авна. Feature flag (SKINS_ENABLED) унтраалттай бол хуудас харагдахгүй.
 *  • Demo (backend-гүй preview): localStorage-д хадгална.
 *  • Эдгээр нь тоглогчийн Steam inventory-д байгаа item биш — зөвхөн BERX ARENA серверийн сонголт.
 * ========================================================= */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI;
  const { esc, icon } = U;

  const CATS = [
    ['pistols', 'Pistols'], ['rifles', 'Rifles'], ['smgs', 'SMGs'], ['heavy', 'Heavy'], ['snipers', 'Sniper rifles'],
    ['knives', 'Knives'], ['gloves', 'Gloves'], ['agents', 'Agents'], ['fav', '★ Favorites']
  ];
  const PAGE = 48;
  const TEAM_NAME = { 2: 'T', 3: 'CT' };
  const WEAR = [[0.07, 'Factory New'], [0.15, 'Minimal Wear'], [0.38, 'Field-Tested'], [0.45, 'Well-Worn'], [1.01, 'Battle-Scarred']];
  const wearName = (w) => (WEAR.find(([max]) => w < max) || WEAR[4])[1];
  const DEMO_KEY = 'berx_skins_demo_v1';

  let catalog = null, loading = null, byId = null, weaponByDef = null;
  const S = {
    tab: 'inventory', cat: 'rifles', team: 3, q: '', weapon: '', rarity: '', limit: PAGE,
    sel: null,                     // preview хийж буй item id
    edit: null,                    // { wear, seed, st, tag, teams: [2,3] }
    saved: null, draft: null, favorites: [], version: 0, status: null, err: null, saving: false, poll: null
  };

  /* ---------- өгөгдөл ---------- */
  function img(i, size) {
    if (!i) return '';
    const base = /^https?:/.test(i) ? i : catalog.meta.cdn + i;
    return /steamstatic\.com\/economy\/image\//.test(base) && size ? `${base}/${size}` : base;
  }
  async function loadCatalog() {
    if (catalog) return catalog;
    loading ||= fetch('assets/data/skins-catalog.json', { cache: 'force-cache' }).then(r => { if (!r.ok) throw new Error('catalog ' + r.status); return r.json(); });
    catalog = await loading;
    byId = new Map(catalog.items.map(i => [i.id, i]));
    weaponByDef = new Map(catalog.weapons.map(w => [w.d, w]));
    return catalog;
  }
  const empty = () => ({ 2: { weapons: {}, knife: null, gloves: null, agent: null }, 3: { weapons: {}, knife: null, gloves: null, agent: null } });
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const live = () => A.isLive();

  async function loadState() {
    S.err = null;
    try {
      if (live()) {
        const r = await fetch('api/skins/state', { credentials: 'same-origin', cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
        S.status = j; S.saved = j.loadout; S.favorites = j.favorites || []; S.version = j.version;
      } else {
        let d = null; try { d = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { /* ignore */ }
        S.saved = d ? d.loadout : empty(); S.favorites = d ? d.favorites : []; S.version = d ? d.version : 0;
        S.status = { demo: true };
      }
      if (!S.draft) S.draft = clone(S.saved);
    } catch (e) { S.err = e.message; }
  }

  async function post(type, payload) {
    const r = await fetch('api/action', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }

  const dirty = () => S.saved && S.draft && JSON.stringify(S.saved) !== JSON.stringify(S.draft);

  /* ---------- loadout туслахууд ---------- */
  function selectionOf(item, team) {
    const t = S.draft[team];
    if (item.k === 'weapon') { const w = t.weapons[item.d]; return w && w.p === item.p ? w : null; }
    if (item.k === 'knife') return t.knife && t.knife.d === item.d && t.knife.p === item.p ? t.knife : null;
    if (item.k === 'gloves') return t.gloves && t.gloves.d === item.d && t.gloves.p === item.p ? t.gloves : null;
    if (item.k === 'agent') return t.agent === item.m ? { m: item.m } : null;
    return null;
  }
  const teamsFor = (item) => item.k === 'agent' ? [item.t] : [2, 3];
  const selectedTeams = (item) => teamsFor(item).filter(t => selectionOf(item, t));

  function apply(item, e, teams) {
    for (const team of teams) {
      const t = S.draft[team];
      const v = { wear: e.wear, seed: e.seed };
      if (item.k === 'weapon') t.weapons[item.d] = { p: item.p, ...v, st: e.st && item.st ? 1 : 0, tag: e.tag || null };
      else if (item.k === 'knife') t.knife = { d: item.d, w: item.w, p: item.p, ...(item.p ? v : { wear: 0.000001, seed: 0 }), st: e.st && item.st ? 1 : 0, tag: e.tag || null };
      else if (item.k === 'gloves') t.gloves = { d: item.d, p: item.p, ...v };
      else if (item.k === 'agent' && team === item.t) t.agent = item.m;
    }
  }
  function unselect(item, teams) {
    for (const team of teams) {
      const t = S.draft[team];
      if (item.k === 'weapon' && t.weapons[item.d] && t.weapons[item.d].p === item.p) delete t.weapons[item.d];
      if (item.k === 'knife' && t.knife && t.knife.d === item.d) t.knife = null;
      if (item.k === 'gloves' && t.gloves && t.gloves.d === item.d) t.gloves = null;
      if (item.k === 'agent' && t.agent === item.m) t.agent = null;
    }
  }
  function editorFor(item) {
    const cur = selectionOf(item, S.team) || selectionOf(item, S.team === 2 ? 3 : 2);
    const [lo, hi] = item.f || [0, 1];
    const def = Math.min(hi, Math.max(lo, 0.01));
    return { wear: cur && cur.wear !== undefined ? cur.wear : def, seed: cur && cur.seed !== undefined ? cur.seed : 0, st: cur ? cur.st || 0 : 0, tag: cur ? cur.tag || '' : '',
      teams: item.k === 'agent' ? [item.t] : (selectedTeams(item).length ? selectedTeams(item) : [S.team]) };
  }
  const itemFromSel = (k, team) => {
    const t = S.draft[team];
    if (k === 'knife') return t.knife ? byId.get(`${t.knife.d}-${t.knife.p}`) : null;
    if (k === 'gloves') return t.gloves ? byId.get(`${t.gloves.d}-${t.gloves.p}`) : null;
    if (k === 'agent') return t.agent ? byId.get('a-' + t.agent) : null;
    return null;
  };

  /* ---------- шүүлтүүр ---------- */
  function filtered() {
    const q = S.q.trim().toLowerCase();
    let list = S.cat === 'fav' ? S.favorites.map(id => byId.get(id)).filter(Boolean) : catalog.items.filter(i => i.c === S.cat);
    if (S.cat === 'agents') list = list.filter(i => i.t === S.team);
    if (S.weapon) list = list.filter(i => String(i.d) === S.weapon);
    if (S.rarity) list = list.filter(i => i.r === S.rarity);
    if (q) list = list.filter(i => (i.n + ' ' + i.wn).toLowerCase().includes(q));
    const order = catalog.meta.rarityOrder;
    return list.slice().sort((a, b) => (order.indexOf(b.r) - order.indexOf(a.r)) || a.wn.localeCompare(b.wn) || a.n.localeCompare(b.n));
  }

  /* ---------- UI хэсгүүд ---------- */
  function syncBadge() {
    const st = S.status || {};
    if (st.demo) return chip('dim', 'Demo — зөвхөн энэ хөтөчид хадгалагдана');
    if (dirty()) return chip('warn', 'Хадгалаагүй өөрчлөлт');
    if (!S.version) return chip('dim', 'Loadout хоосон');
    if (!st.syncEnabled) return chip('dim', `Сайтад хадгалсан (v${S.version}) · Серверийн синк идэвхгүй`);
    const s = st.sync;
    if (s && s.status === 'error') return chip('loss', 'Синкийн алдаа: ' + esc(s.error || ''));
    if (!s || s.version < S.version) return chip('warn', st.server && st.server.online ? 'Серверт синк хүлээгдэж байна…' : 'Сервер offline — асахад синк хийнэ');
    if (s.appliedAt && s.appliedAt >= (S.status.updatedAt || 0)) return chip('win', 'Тоглоомд хэрэгжсэн ✓');
    return chip('win', 'WeaponPaints DB-д бичигдсэн ✓ · Дараагийн удаа серверт ороход/респаунд хэрэгжинэ');
  }
  const chip = (cls, t) => `<span class="sk-sync ${cls}"><i></i>${t}</span>`;

  function card(i) {
    const sel = selectedTeams(i), fav = S.favorites.includes(i.id);
    return `<div class="sk-card ${S.sel === i.id ? 'on' : ''} ${sel.length ? 'picked' : ''}" style="--rc:${i.rc}" data-action="sk-preview" data-id="${esc(i.id)}" tabindex="0">
      <button class="sk-fav ${fav ? 'on' : ''}" data-action="sk-fav" data-id="${esc(i.id)}" aria-label="Favorite" title="Favorite">${icon('heart')}</button>
      <div class="sk-img"><img onerror="this.classList.add('sk-noimg')" loading="lazy" decoding="async" src="${esc(img(i.i, '256fx192f'))}" alt="${esc(i.wn + ' | ' + i.n)}"></div>
      <div class="sk-meta"><b title="${esc(i.n)}">${esc(i.n)}</b><span>${esc(i.wn)}</span></div>
      <div class="sk-foot"><span class="sk-r">${esc(i.r)}</span>${sel.map(t => `<span class="sk-t t${t}">${TEAM_NAME[t]}</span>`).join('')}</div>
    </div>`;
  }

  function previewPanel() {
    const i = S.sel && byId.get(S.sel);
    if (!i) return `<div class="sk-prev empty"><div class="e">🎯</div><b>Item сонгоно уу</b><p class="muted">Карт дээр дарж урьдчилан харах, wear, pattern seed тохируулаад loadout-доо нэмнэ.</p></div>`;
    const e = S.edit, [lo, hi] = i.f || [0, 1];
    const hasWear = i.k !== 'agent' && !(i.k === 'knife' && i.p === 0);
    const sel = selectedTeams(i);
    return `<div class="sk-prev" style="--rc:${i.rc}">
      <div class="sk-prev-img"><img onerror="this.classList.add('sk-noimg')" src="${esc(img(i.i, '512fx384f'))}" alt="${esc(i.n)}"></div>
      <div class="sk-prev-h"><div><div class="muted" style="font-size:12px">${esc(i.wn)}</div><h3>${i.st && e.st ? '<span class="st">StatTrak™</span> ' : ''}${esc(i.n)}</h3></div><span class="sk-r big">${esc(i.r)}</span></div>
      ${hasWear ? `
      <label class="sk-lbl" for="sk-wear"><span>Wear (float)</span><b id="sk-wear-v">${Number(e.wear).toFixed(4)} · ${wearName(e.wear)}</b></label>
      <input type="range" id="sk-wear" min="${lo}" max="${hi}" step="0.0001" value="${e.wear}" class="sk-range">
      <div class="row between dim" style="font-size:11px"><span>${lo}</span><span>${hi}</span></div>
      <div class="grid cols" style="--c:1fr 1fr;gap:10px;margin-top:10px">
        <div class="field"><label for="sk-seed">Pattern seed (0–${catalog.meta.seedMax})</label><input class="input" id="sk-seed" type="number" min="0" max="${catalog.meta.seedMax}" step="1" value="${e.seed}"></div>
        ${i.k !== 'gloves' ? `<div class="field"><label for="sk-tag">Name tag</label><input class="input" id="sk-tag" maxlength="20" value="${esc(e.tag || '')}" placeholder="заавал биш"></div>` : '<div></div>'}
      </div>
      ${i.st ? `<label class="sk-check"><input type="checkbox" id="sk-st" ${e.st ? 'checked' : ''}> StatTrak™ (тоолуур серверт тоолно)</label>` : ''}` : ''}
      ${i.k === 'agent' ? `<div class="note" style="margin-top:8px">Agent нь зөвхөн ${TEAM_NAME[i.t]} багт хэрэглэгдэнэ.</div>` : `
      <div class="sk-lbl" style="margin-top:12px"><span>Баг</span></div>
      <div class="seg sk-teams">${[[2, 'T'], [3, 'CT']].map(([t, l]) => `<button class="${e.teams.includes(t) ? 'on' : ''}" data-action="sk-team-toggle" data-t="${t}">${l}</button>`).join('')}</div>`}
      <div class="row wrap mt" style="gap:8px">
        <button class="btn primary" data-action="sk-apply">${icon('plus')} ${sel.length ? 'Шинэчлэх' : 'Loadout-д нэмэх'}</button>
        ${sel.length ? `<button class="btn" data-action="sk-unselect">Default болгох</button>` : ''}
        <button class="btn ghost" data-action="sk-fav" data-id="${esc(i.id)}">${icon('heart')} ${S.favorites.includes(i.id) ? 'Favorite-оос хасах' : 'Favorite'}</button>
      </div>
    </div>`;
  }

  function slot(label, item, data, kind, team) {
    return `<div class="sk-slot ${item ? '' : 'empty'}" style="${item ? `--rc:${item.rc}` : ''}">
      <div class="sk-slot-img">${item ? `<img onerror="this.classList.add('sk-noimg')" loading="lazy" src="${esc(img(item.i, '256fx192f'))}" alt="">` : '<span>Default</span>'}</div>
      <div style="min-width:0;flex:1"><div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">${label}</div>
        <b class="sk-ell">${item ? esc(item.n) : 'Default'}</b>
        ${item && data && data.wear !== undefined && !(kind === 'knife' && !data.p) && kind !== 'agent' ? `<div class="dim" style="font-size:11px">${Number(data.wear).toFixed(3)} · seed ${data.seed}${data.st ? ' · ST' : ''}</div>` : ''}</div>
      ${item ? `<button class="icon-btn sm" data-action="sk-open" data-id="${esc(item.id)}" title="Засах">${icon('edit')}</button><button class="icon-btn sm" data-action="sk-reset-slot" data-kind="${kind}" data-team="${team}" ${kind === 'weapon' ? `data-d="${item.d}"` : ''} title="Default болгох">${icon('x')}</button>` : ''}
    </div>`;
  }

  function loadoutView() {
    const team = S.team, t = S.draft[team];
    const groups = {};
    for (const [d, w] of Object.entries(t.weapons)) {
      const it = byId.get(`${d}-${w.p}`); if (!it) continue;
      (groups[it.c] ||= []).push(slot(it.wn, it, w, 'weapon', team));
    }
    const count = Object.keys(t.weapons).length + (t.knife ? 1 : 0) + (t.gloves ? 1 : 0) + (t.agent ? 1 : 0);
    return `<div class="sk-loadout">
      <div class="sk-slots top">${slot('Хутга', itemFromSel('knife', team), t.knife, 'knife', team)}${slot('Бээлий', itemFromSel('gloves', team), t.gloves, 'gloves', team)}${slot('Agent', itemFromSel('agent', team), null, 'agent', team)}</div>
      ${CATS.filter(([c]) => groups[c]).map(([c, l]) => `<div class="sk-grp"><h4>${l}</h4><div class="sk-slots">${groups[c].join('')}</div></div>`).join('')
        || (count ? '' : `<div class="empty-state"><div class="e">🎒</div>${TEAM_NAME[team]} loadout хоосон. Inventory-оос item сонгоно уу.</div>`)}
    </div>`;
  }

  function summary() {
    const c = (team) => { const t = S.draft[team]; return Object.keys(t.weapons).length + (t.knife ? 1 : 0) + (t.gloves ? 1 : 0) + (t.agent ? 1 : 0); };
    const k = itemFromSel('knife', S.team), g = itemFromSel('gloves', S.team), a = itemFromSel('agent', S.team);
    return `<div class="card sk-sum">
      <div class="row between"><b>Loadout</b><div class="seg sm">${[3, 2].map(t => `<button class="${S.team === t ? 'on' : ''}" data-action="sk-setteam" data-t="${t}">${TEAM_NAME[t]} · ${c(t)}</button>`).join('')}</div></div>
      <div class="sk-mini">${[['Хутга', k], ['Бээлий', g], ['Agent', a]].map(([l, it]) => `<div class="sk-mini-it" title="${esc(it ? it.wn + ' | ' + it.n : l + ': Default')}" style="${it ? `--rc:${it.rc}` : ''}">${it ? `<img onerror="this.classList.add('sk-noimg')" src="${esc(img(it.i, '128fx96f'))}" alt="">` : `<span>${l}</span>`}</div>`).join('')}</div>
      <div class="mt">${syncBadge()}</div>
      <div class="row wrap mt" style="gap:8px">
        <button class="btn primary" data-action="sk-save" ${dirty() && !S.saving ? '' : 'disabled'}>${S.saving ? 'Хадгалж байна…' : 'Хадгалах'}</button>
        <button class="btn" data-action="sk-revert" ${dirty() ? '' : 'disabled'}>Буцаах</button>
        <button class="btn danger sm" style="margin-left:auto" data-action="sk-clear">${icon('trash')} Бүгдийг цэвэрлэх</button>
      </div>
    </div>`;
  }

  function render() {
    const hero = U.Hero({ kicker: 'BERX ARENA · SERVER COSMETICS', title: 'SKIN', accent: 'INVENTORY', lead: 'BERX ARENA сервер дээр л хэрэглэгдэх сонголт. Энэ нь таны Steam inventory-д item өгөхгүй, эзэмшил биш.' });
    if (!catalog || !S.draft) {
      if (S.err) return hero + `<div class="card empty-state"><div class="e">⚠️</div>${esc(S.err)}<br><button class="btn mt" data-action="sk-retry">Дахин оролдох</button></div>`;
      return hero + '<div class="card empty-state"><div class="e">⏳</div>Inventory ачаалж байна…</div>';
    }
    const list = filtered(), shown = list.slice(0, S.limit);
    const weapons = S.cat === 'fav' || S.cat === 'agents' ? [] : catalog.weapons.filter(w => w.c === S.cat);
    const rarities = [...new Set(catalog.items.filter(i => S.cat === 'fav' ? S.favorites.includes(i.id) : i.c === S.cat).map(i => i.r))];
    return `${hero}
      <div class="sk-layout">
        <div class="card sk-main">
          <div class="row between wrap" style="gap:10px;margin-bottom:12px">
            <div class="seg">${[['inventory', 'Inventory'], ['loadout', 'Миний loadout']].map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-action="sk-tab" data-v="${k}">${l}</button>`).join('')}</div>
            <div class="seg sk-teamseg">${[[3, 'CT'], [2, 'T']].map(([t, l]) => `<button class="${S.team === t ? 'on' : ''} t${t}" data-action="sk-setteam" data-t="${t}">${l} loadout</button>`).join('')}</div>
          </div>
          ${S.tab === 'loadout' ? loadoutView() : `
          <nav class="sk-cats" aria-label="Ангилал">${CATS.map(([c, l]) => `<button class="${S.cat === c ? 'on' : ''}" data-action="sk-cat" data-v="${c}">${l}</button>`).join('')}</nav>
          <div class="sk-filters">
            <input class="input" id="sk-q" placeholder="Хайх: Asiimov, AK-47..." value="${esc(S.q)}" aria-label="Хайх">
            ${weapons.length ? `<select class="input" id="sk-weapon" aria-label="Зэвсэг"><option value="">Бүх зэвсэг</option>${weapons.map(w => `<option value="${w.d}" ${S.weapon === String(w.d) ? 'selected' : ''}>${esc(w.wn)}</option>`).join('')}</select>` : ''}
            <select class="input" id="sk-rarity" aria-label="Rarity"><option value="">Бүх rarity</option>${catalog.meta.rarityOrder.filter(r => rarities.includes(r)).map(r => `<option ${S.rarity === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
            <span class="dim" style="font-size:12px;white-space:nowrap">${list.length} item</span>
          </div>
          ${shown.length ? `<div class="sk-grid">${shown.map(card).join('')}</div>` : `<div class="empty-state"><div class="e">🔍</div>${S.cat === 'fav' ? 'Favorite хоосон' : 'Олдсонгүй'}</div>`}
          ${list.length > S.limit ? `<div style="text-align:center;margin-top:14px"><button class="btn" data-action="sk-more">Цааш үзэх (${list.length - S.limit})</button></div>` : ''}`}
        </div>
        <aside class="sk-side">
          ${summary()}
          <div class="card">${previewPanel()}</div>
          <div class="note" style="font-size:11.5px">ℹ️ Сонголт сайт дээр хадгалагдаж, admin зөвшөөрсөн үед BERX Agent WeaponPaints руу синк хийнэ. «Хадгалсан» ба «Тоглоомд хэрэгжсэн» төлөв тусдаа харагдана.</div>
        </aside>
      </div>`;
  }

  /* ---------- үйлдлүүд ---------- */
  const rr = () => window.BerxApp.render();
  const toast = (t, i) => window.BerxApp.toast(t, i);
  const actions = {
    'sk-tab'(el) { S.tab = el.dataset.v; return true; },
    'sk-cat'(el) { S.cat = el.dataset.v; S.weapon = ''; S.rarity = ''; S.limit = PAGE; return true; },
    'sk-setteam'(el) { S.team = +el.dataset.t; if (S.sel) S.edit = editorFor(byId.get(S.sel)); return true; },
    'sk-more'() { S.limit += PAGE; return true; },
    'sk-retry'() { S.err = null; init(); return true; },
    'sk-preview'(el, e) { if (e && e.target.closest('.sk-fav')) return; S.sel = el.dataset.id; S.edit = editorFor(byId.get(S.sel)); if (innerWidth < 1100) setTimeout(() => document.querySelector('.sk-prev')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30); return true; },
    'sk-open'(el) { const i = byId.get(el.dataset.id); if (!i) return; S.sel = i.id; S.edit = editorFor(i); S.tab = 'inventory'; S.cat = i.c; S.weapon = ''; S.rarity = ''; S.q = ''; return true; },
    'sk-team-toggle'(el) { const t = +el.dataset.t, e = S.edit; e.teams = e.teams.includes(t) ? e.teams.filter(x => x !== t) : [...e.teams, t]; if (!e.teams.length) e.teams = [t]; return true; },
    'sk-apply'() {
      const i = byId.get(S.sel); if (!i) return;
      const e = S.edit, [lo, hi] = i.f || [0, 1];
      const seed = Math.round(Number(e.seed));
      if (!(e.wear >= lo && e.wear <= hi)) return toast(`Wear ${lo}–${hi} хооронд`, '⚠️');
      if (!(seed >= 0 && seed <= catalog.meta.seedMax)) return toast(`Seed 0–${catalog.meta.seedMax}`, '⚠️');
      if (e.tag && (e.tag.length > 20 || /[<>"'`\\;]/.test(e.tag))) return toast('Name tag 20 тэмдэгт хүртэл, тусгай тэмдэгтгүй', '⚠️');
      apply(i, { ...e, seed }, i.k === 'agent' ? [i.t] : e.teams);
      toast(`${i.wn} | ${i.n} → ${(i.k === 'agent' ? [i.t] : e.teams).map(t => TEAM_NAME[t]).join(' + ')} (хадгалаагүй)`, '🎯');
      return true;
    },
    'sk-unselect'() { const i = byId.get(S.sel); if (i) unselect(i, teamsFor(i)); return true; },
    'sk-reset-slot'(el) {
      const t = S.draft[+el.dataset.team], k = el.dataset.kind;
      if (k === 'weapon') delete t.weapons[el.dataset.d]; else t[k] = null;
      return true;
    },
    'sk-revert'() { S.draft = clone(S.saved); if (S.sel) S.edit = editorFor(byId.get(S.sel)); return true; },
    async 'sk-fav'(el) {
      const id = el.dataset.id;
      S.favorites = S.favorites.includes(id) ? S.favorites.filter(x => x !== id) : [id, ...S.favorites];
      rr();
      try {
        if (live()) await post('skins.favorites', { favorites: S.favorites });
        else localStorage.setItem(DEMO_KEY, JSON.stringify({ loadout: S.saved, favorites: S.favorites, version: S.version }));
      } catch (e) { toast(e.message, '⚠️'); }
    },
    async 'sk-save'() {
      if (!dirty() || S.saving) return;
      S.saving = true; rr();
      try {
        if (live()) { const j = await post('skins.save', { loadout: S.draft }); S.version = j.skins.version; await loadState(); S.draft = clone(S.saved); startPoll(); }
        else { S.version++; S.saved = clone(S.draft); localStorage.setItem(DEMO_KEY, JSON.stringify({ loadout: S.saved, favorites: S.favorites, version: S.version })); }
        toast('Loadout хадгалагдлаа', '💾');
      } catch (e) { toast(e.message, '⚠️'); }
      S.saving = false; rr();
    },
    'sk-clear'() {
      window.BerxApp.confirm('T болон CT loadout-ын БҮХ сонголтыг цэвэрлэж хадгалах уу? Favorite хэвээр үлдэнэ.', async () => {
        try {
          if (live()) { await post('skins.clear', { confirm: 'CLEAR' }); S.draft = null; await loadState(); startPoll(); }
          else { S.saved = empty(); S.draft = empty(); S.version++; localStorage.setItem(DEMO_KEY, JSON.stringify({ loadout: S.saved, favorites: S.favorites, version: S.version })); }
          toast('Loadout цэвэрлэгдлээ', '🧹');
        } catch (e) { toast(e.message, '⚠️'); }
        rr();
      });
    }
  };

  function startPoll() {
    clearInterval(S.poll);
    if (!live() || !S.status || !S.status.syncEnabled) return;
    let n = 0;
    S.poll = setInterval(async () => {
      if (++n > 40 || location.hash !== '#skins') return clearInterval(S.poll);
      const wasDirty = dirty(), keep = S.draft;
      await loadState(); if (wasDirty) S.draft = keep;
      const s = S.status && S.status.sync;
      if (s && s.version >= S.version && s.status === 'ok' && (s.appliedAt || !S.status.server.inGame)) clearInterval(S.poll);
      if (!document.activeElement || !document.activeElement.closest('.sk-prev')) rr();
    }, 6000);
  }

  async function init() {
    try { await loadCatalog(); } catch (e) { S.err = 'Каталог ачаалагдсангүй: ' + e.message; }
    if (!S.err) await loadState();
    rr();
    if (S.status && S.status.sync && S.status.sync.version < S.version) startPoll();
  }

  function mount(root) {
    if (!catalog || !S.draft) { if (!loading || S.err) init(); else loading.then(() => { if (!S.draft) init(); }); }
    const q = root.querySelector('#sk-q');
    let qt; q?.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { S.q = q.value; S.limit = PAGE; rr(); }, 180); });
    root.querySelector('#sk-weapon')?.addEventListener('change', (e) => { S.weapon = e.target.value; S.limit = PAGE; rr(); });
    root.querySelector('#sk-rarity')?.addEventListener('change', (e) => { S.rarity = e.target.value; S.limit = PAGE; rr(); });
    const wear = root.querySelector('#sk-wear');
    wear?.addEventListener('input', () => { S.edit.wear = Number(wear.value); const v = root.querySelector('#sk-wear-v'); if (v) v.textContent = `${S.edit.wear.toFixed(4)} · ${wearName(S.edit.wear)}`; });
    root.querySelector('#sk-seed')?.addEventListener('input', (e) => { S.edit.seed = Number(e.target.value); });
    root.querySelector('#sk-tag')?.addEventListener('input', (e) => { S.edit.tag = e.target.value; });
    root.querySelector('#sk-st')?.addEventListener('change', (e) => { S.edit.st = e.target.checked ? 1 : 0; rr(); });
  }
  function unmount() { clearInterval(S.poll); }

  window.BerxPages = window.BerxPages || {};
  window.BerxPages.skins = { render, actions, mount, unmount, _state: S };
})();
