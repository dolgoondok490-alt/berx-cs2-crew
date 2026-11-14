/* =========================================================
 * BERX SKIN INVENTORY — weapon-first inventory (T / CT loadout)
 * ---------------------------------------------------------
 *  • Inventory: зэвсэг бүр НЭГ card (сонгосон skin эсвэл default зураг), ангиллаар (silhouette icon).
 *  • Card дээр дарахад зөвхөн тэр зэвсгийн skin-тэй picker нээгдэнэ → Save = одоогийн skins.save API.
 *    Амжилттай хадгалсны дараа л card шинэчлэгдэнэ; алдаа гарвал picker нээлттэй үлдэж алдааг харуулна.
 *  • Хутга / Бээлий: эхлээд төрөл (model), дараа нь skin. Agent: тухайн багийн agent-ууд.
 *  • Каталог: assets/data/skins-catalog.json (WeaponPaints build-472 + ByMykel CSGO-API) — ID-г ӨӨРЧЛӨХГҮЙ.
 *    Default зураг/icon: assets/weapons (WeaponPaints-ийн Valve default render, tools/build-weapon-assets.py).
 *  • Live: /api/skins/state + /api/action (skins.save | skins.favorites | skins.clear). SteamID-г сервер session-оос авна.
 *  • Demo (backend-гүй preview): localStorage. Эдгээр нь Steam inventory-ийн item биш — зөвхөн BERX ARENA серверт.
 * ========================================================= */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI;
  const { esc, icon } = U;

  const CATS = [['all', 'All'], ['knives', 'Knives'], ['gloves', 'Gloves'], ['rifles', 'Rifles'], ['snipers', 'Sniper Rifles'], ['pistols', 'Pistols'], ['smgs', 'SMGs'], ['heavy', 'Heavy'], ['agents', 'Agents']];
  const GUN_CATS = ['rifles', 'snipers', 'pistols', 'smgs', 'heavy'];
  // Inventory-д харуулах дараалал (catalog-ийн зэвсгийн дотоод нэрээр; ID өөрчлөхгүй)
  const ORDER = ['weapon_ak47', 'weapon_m4a1', 'weapon_m4a1_silencer', 'weapon_aug', 'weapon_sg556', 'weapon_famas', 'weapon_galilar',
    'weapon_awp', 'weapon_ssg08', 'weapon_scar20', 'weapon_g3sg1',
    'weapon_deagle', 'weapon_usp_silencer', 'weapon_glock', 'weapon_p250', 'weapon_fiveseven', 'weapon_elite', 'weapon_tec9', 'weapon_hkp2000', 'weapon_cz75a', 'weapon_revolver',
    'weapon_mac10', 'weapon_mp9', 'weapon_mp7', 'weapon_mp5sd', 'weapon_ump45', 'weapon_p90', 'weapon_bizon',
    'weapon_nova', 'weapon_xm1014', 'weapon_sawedoff', 'weapon_mag7', 'weapon_m249', 'weapon_negev', 'weapon_taser'];
  // CS2-ийн зөвхөн нэг талд худалдаалагддаг зэвсэг (мэдээллийн badge — сервер/WeaponPaints хоёр талд нь зөвшөөрнө)
  const CT_ONLY = new Set(['weapon_m4a1', 'weapon_m4a1_silencer', 'weapon_aug', 'weapon_famas', 'weapon_scar20', 'weapon_usp_silencer', 'weapon_hkp2000', 'weapon_fiveseven', 'weapon_mp9', 'weapon_mag7']);
  const T_ONLY = new Set(['weapon_ak47', 'weapon_galilar', 'weapon_sg556', 'weapon_g3sg1', 'weapon_glock', 'weapon_tec9', 'weapon_mac10', 'weapon_sawedoff']);
  const TEAM_NAME = { 2: 'T', 3: 'CT' };
  const WEAR = [[0.07, 'Factory New', 'FN'], [0.15, 'Minimal Wear', 'MW'], [0.38, 'Field-Tested', 'FT'], [0.45, 'Well-Worn', 'WW'], [1.01, 'Battle-Scarred', 'BS']];
  const wearOf = (w) => WEAR.find(([max]) => w < max) || WEAR[4];
  const DEMO_KEY = 'berx_skins_demo_v1';
  const DEF = (name) => `assets/weapons/${name}.webp`;
  // CSS custom property доторх url() нь css/skins.css-ээс хамаарч шийдэгддэг тул бүтэн URL болгоно
  const ICON = (c) => new URL(`assets/weapons/icons/${c}.png`, document.baseURI).href;
  const SAVE_FAIL = 'Хадгалж чадсангүй. Дахин оролдоно уу.';

  let catalog = null, loading = null, byId = null, weaponByDef = null, itemsByDef = null, agentsByTeam = null;
  const S = {
    cat: 'all', team: 3,
    saved: null, favorites: [], version: 0, status: null, err: null,
    pick: null,               // { kind, d, step, sel, edit, both, q, rarity, favOnly, err, scroll }
    saving: false, flash: null, poll: null
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
    const c = await loading;
    byId = new Map(c.items.map(i => [i.id, i]));
    weaponByDef = new Map(c.weapons.map(w => [w.d, w]));
    itemsByDef = new Map(); agentsByTeam = { 2: [], 3: [] };
    for (const i of c.items) {
      if (i.k === 'agent') { (agentsByTeam[i.t] || []).push(i); continue; }
      if (!itemsByDef.has(i.d)) itemsByDef.set(i.d, []);
      itemsByDef.get(i.d).push(i);
    }
    catalog = c;
    return catalog;
  }
  const empty = () => ({ 2: { weapons: {}, knife: null, gloves: null, agent: null }, 3: { weapons: {}, knife: null, gloves: null, agent: null } });
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const live = () => A.isLive();
  const teamOf = (lo, t) => (lo && lo[t]) || { weapons: {}, knife: null, gloves: null, agent: null };
  const rank = (r) => catalog.meta.rarityOrder.indexOf(r);
  const sortItems = (list) => list.slice().sort((a, b) => ((b.p === 0) - (a.p === 0)) || (rank(b.r) - rank(a.r)) || a.n.localeCompare(b.n));   // Vanilla → rarity → нэр

  async function loadState() {
    S.err = null;
    try {
      if (live()) {
        const r = await fetch('api/skins/state', { credentials: 'same-origin', cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
        S.status = j; S.saved = j.loadout || empty(); S.favorites = j.favorites || []; S.version = j.version;
      } else {
        let d = null; try { d = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { /* ignore */ }
        S.saved = d ? d.loadout : empty(); S.favorites = d ? d.favorites || [] : []; S.version = d ? d.version : 0;
        S.status = { demo: true };
      }
    } catch (e) { S.err = e.message; }
  }
  async function post(type, payload) {
    const r = await fetch('api/action', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }
  const demoWrite = () => localStorage.setItem(DEMO_KEY, JSON.stringify({ loadout: S.saved, favorites: S.favorites, version: S.version }));

  /* ---------- хадгалсан сонголт → catalog item ---------- */
  function savedOf(kind, d, team) {
    const t = teamOf(S.saved, team);
    if (kind === 'weapon') { const w = t.weapons[d]; return w ? { data: w, item: byId.get(`${d}-${w.p}`) || null } : null; }
    if (kind === 'knife') return t.knife ? { data: t.knife, item: byId.get(`${t.knife.d}-${t.knife.p}`) || null } : null;
    if (kind === 'gloves') return t.gloves ? { data: t.gloves, item: byId.get(`${t.gloves.d}-${t.gloves.p}`) || null } : null;
    if (kind === 'agent') return t.agent ? { data: { m: t.agent }, item: byId.get('a-' + t.agent) || null } : null;
    return null;
  }
  const countTeam = (team) => { const t = teamOf(S.saved, team); return Object.keys(t.weapons).length + (t.knife ? 1 : 0) + (t.gloves ? 1 : 0) + (t.agent ? 1 : 0); };
  const gunsOf = (c) => catalog.weapons.filter(w => w.c === c).sort((a, b) => ORDER.indexOf(a.w) - ORDER.indexOf(b.w));

  /* ---------- төлөв: хэрэглэгчид ойлгомжтой бичиг (логик нь хэвээр: сайтад хадгалсан → серверт синк → тоглоомд) ----------
   *  Version, sync, database, API зэрэг техникийн мэдээллийг харуулахгүй. Серверт бодитоор синк хийгдээгүй бол "Серверт бэлэн" гэхгүй. */
  const chip = (cls, t) => `<span class="sk-sync ${cls}"><i></i>${t}</span>`;
  function syncBadge() {
    const st = S.status || {};
    if (S.saving) return chip('warn', 'Хадгалж байна...');
    if (!S.version) return '';
    if (st.demo || !st.syncEnabled) return chip('dim', 'Сонголт хадгалагдсан');
    const s = st.sync;
    if (s && s.status === 'error') return chip('dim', 'Сонголт хадгалагдсан');            // серверт хэрэгжээгүй — бэлэн гэж хэлэхгүй
    if (!s || s.version < S.version) return st.server && st.server.online ? chip('warn', 'Серверт илгээж байна...') : chip('dim', 'Сервер асахад идэвхжинэ');
    if (s.appliedAt && s.appliedAt >= (st.updatedAt || 0)) return chip('win', 'Тоглоомд идэвхтэй');
    return chip('win', 'Серверт бэлэн');
  }

  /* ---------- Inventory card ---------- */
  function cardHTML({ key, kind, d, label, sub, item, data, defImg, badge, onTeam }) {
    const has = !!item, st = data && data.st && kind !== 'agent', w = data && data.wear !== undefined && has && item.p !== 0 && kind !== 'agent' ? wearOf(Number(data.wear))[2] : '';
    return `<button class="skx-card ${has ? 'has' : 'def'} ${S.flash === key ? 'flash' : ''}" style="--rc:${has ? item.rc : 'transparent'}" data-action="skx-open" data-kind="${kind}" ${d !== undefined ? `data-d="${d}"` : ''} data-key="${esc(key)}" aria-label="${esc(label + ': ' + (has ? item.n : 'Default'))}">
      ${badge ? `<span class="skx-badge">${esc(badge)}</span>` : ''}${st ? '<span class="skx-st">ST™</span>' : ''}${onTeam ? `<span class="skx-eq">${esc(onTeam)}</span>` : ''}
      <span class="skx-img"><img loading="lazy" decoding="async" src="${esc(has ? img(item.i, '256fx192f') : defImg)}" alt="" onerror="this.classList.add('sk-noimg')"></span>
      <span class="skx-txt"><span class="skx-wn">${esc(sub || label)}</span><b>${has ? esc(item.n) : 'Default'}</b>${w ? `<em>${w}</em>` : ''}</span>
      <i class="skx-rl"></i>
    </button>`;
  }
  function gunCard(w) {
    const s = savedOf('weapon', w.d, S.team);
    const other = S.team === 2 ? CT_ONLY.has(w.w) && 'CT зэвсэг' : T_ONLY.has(w.w) && 'T зэвсэг';
    return cardHTML({ key: 'w-' + w.d, kind: 'weapon', d: w.d, label: w.wn, item: s && s.item, data: s && s.data, defImg: DEF(w.w), badge: other || '' });
  }
  function slotCard(kind) {
    const s = savedOf(kind, null, S.team);
    const label = kind === 'knife' ? 'Хутга' : kind === 'gloves' ? 'Бээлий' : 'Agent';
    return cardHTML({ key: kind, kind, label, sub: s && s.item ? `${label} · ${s.item.wn}` : label, item: s && s.item, data: s && s.data, defImg: DEF(kind === 'knife' ? 'weapon_knife' : kind === 'gloves' ? 'gloves' : 'agent') });
  }
  function typeCard(kind, w) {          // Knives / Gloves ангилал: төрөл бүр нэг card
    const s = savedOf(kind, null, S.team), eq = s && s.data.d === w.d;
    const first = kind === 'gloves' ? sortItems(itemsByDef.get(w.d) || [])[0] : null;
    return cardHTML({ key: (kind === 'knife' ? 'kt-' : 'gt-') + w.d, kind, d: w.d, label: w.wn, item: eq ? s.item : null, data: eq ? s.data : null,
      defImg: kind === 'knife' ? DEF(w.w) : (first ? img(first.i, '256fx192f') : DEF('gloves')), onTeam: eq ? 'Сонгосон' : '' });
  }
  function agentCard(a) {               // Agents ангилал: тухайн багийн agent бүр (сонгосон нь тодорно)
    const eq = teamOf(S.saved, S.team).agent === a.m, key = 'a-' + a.m;
    return `<button class="skx-card agent ${eq ? 'has' : 'def'} ${S.flash === key ? 'flash' : ''}" style="--rc:${eq ? a.rc : 'transparent'}" data-action="skx-open" data-kind="agent" data-d="${esc(a.m)}" data-key="${esc(key)}" aria-label="${esc('Agent: ' + a.n)}">
      ${eq ? '<span class="skx-eq">Сонгосон</span>' : ''}
      <span class="skx-img"><img loading="lazy" decoding="async" src="${esc(img(a.i, '256fx192f'))}" alt="" onerror="this.classList.add('sk-noimg')"></span>
      <span class="skx-txt"><span class="skx-wn">${esc(a.wn)}</span><b>${esc(a.n)}</b></span><i class="skx-rl"></i>
    </button>`;
  }
  function gridCards() {
    if (S.cat === 'all') return [slotCard('knife'), slotCard('gloves'), slotCard('agent'), ...GUN_CATS.flatMap(c => gunsOf(c).map(gunCard))];
    if (S.cat === 'knives') return [slotCard('knife'), ...catalog.weapons.filter(w => w.c === 'knives').map(w => typeCard('knife', w))];
    if (S.cat === 'gloves') return [slotCard('gloves'), ...catalog.weapons.filter(w => w.c === 'gloves').map(w => typeCard('gloves', w))];
    if (S.cat === 'agents') return [slotCard('agent'), ...sortItems(agentsByTeam[S.team]).map(agentCard)];
    return gunsOf(S.cat).map(gunCard);
  }
  function catCount(c) {
    const t = teamOf(S.saved, S.team);
    if (c === 'all') return countTeam(S.team);
    if (c === 'knives') return t.knife ? 1 : 0;
    if (c === 'gloves') return t.gloves ? 1 : 0;
    if (c === 'agents') return t.agent ? 1 : 0;
    return gunsOf(c).filter(w => t.weapons[w.d]).length;
  }

  /* ---------- Picker ---------- */
  const defaultsFor = (item, prev) => {
    const [lo, hi] = item.f || [0, 1];
    return { wear: Math.min(hi, Math.max(lo, 0.01)), seed: 0, st: prev && prev.st && item.st ? 1 : 0, tag: prev ? prev.tag || '' : '' };
  };
  function openPick(kind, d) {
    const p = { kind, d, step: 'skin', sel: null, edit: null, both: false, q: '', rarity: '', favOnly: false, err: null, scroll: 0 };
    const s = kind === 'agent' ? null : savedOf(kind, kind === 'weapon' ? d : null, S.team);
    if (kind === 'knife' || kind === 'gloves') {
      if (d === undefined || d === null) { p.d = s ? s.data.d : null; p.step = s ? 'skin' : 'type'; }
      else p.d = Number(d);
    }
    if (kind === 'weapon') p.d = Number(d);
    if (kind === 'agent') {
      const cur = teamOf(S.saved, S.team).agent;
      p.sel = d ? 'a-' + d : cur ? 'a-' + cur : null;
    } else if (s && s.item && (kind === 'weapon' || s.data.d === p.d)) {
      p.sel = s.item.id; p.edit = { wear: s.data.wear ?? defaultsFor(s.item).wear, seed: s.data.seed ?? 0, st: s.data.st ? 1 : 0, tag: s.data.tag || '' };
      const o = savedOf(kind, kind === 'weapon' ? d : null, S.team === 2 ? 3 : 2);
      p.both = !!(o && o.item && o.item.id === s.item.id);
    }
    S.pick = p;
  }
  function pickTitle(p) {
    if (p.kind === 'weapon') return weaponByDef.get(p.d).wn;
    if (p.kind === 'agent') return `Agent · ${TEAM_NAME[S.team]}`;
    const base = p.kind === 'knife' ? 'Хутга' : 'Бээлий';
    return p.step === 'type' || !p.d ? base + ' — төрөл сонгох' : `${base} · ${weaponByDef.get(p.d).wn}`;
  }
  function pickList(p) {
    let list = p.kind === 'agent' ? agentsByTeam[S.team].slice() : (itemsByDef.get(p.d) || []).slice();
    const q = p.q.trim().toLowerCase();
    if (q) list = list.filter(i => (i.n + ' ' + i.wn).toLowerCase().includes(q));
    if (p.rarity) list = list.filter(i => i.r === p.rarity);
    if (p.favOnly) list = list.filter(i => S.favorites.includes(i.id));
    return sortItems(list);
  }
  function savedItemId(p, team) {
    const s = p.kind === 'agent' ? (teamOf(S.saved, team).agent ? { item: byId.get('a-' + teamOf(S.saved, team).agent) } : null) : savedOf(p.kind, p.kind === 'weapon' ? p.d : null, team);
    return s && s.item ? s.item.id : null;
  }
  function typeStep(p) {
    const kind = p.kind, cur = savedOf(kind, null, S.team);
    const types = catalog.weapons.filter(w => w.c === (kind === 'knife' ? 'knives' : 'gloves'));
    return `<div class="skx-types">${types.map(w => {
      const first = kind === 'gloves' ? sortItems(itemsByDef.get(w.d) || [])[0] : null;
      const eq = cur && cur.data.d === w.d;
      return `<button class="skx-type ${eq ? 'on' : ''}" data-action="skx-type" data-d="${w.d}">
        <span class="skx-img"><img loading="lazy" src="${esc(kind === 'knife' ? DEF(w.w) : first ? img(first.i, '256fx192f') : DEF('gloves'))}" alt="" onerror="this.classList.add('sk-noimg')"></span>
        <b>${esc(w.wn)}</b><span class="dim">${(itemsByDef.get(w.d) || []).length} skin${eq ? ' · сонгосон' : ''}</span></button>`;
    }).join('')}</div>`;
  }
  function skinList(p) {
    const list = pickList(p), here = savedItemId(p, S.team), there = p.kind === 'agent' ? null : savedItemId(p, S.team === 2 ? 3 : 2);
    const all = p.kind === 'agent' ? agentsByTeam[S.team] : (itemsByDef.get(p.d) || []);
    const rar = catalog.meta.rarityOrder.filter(r => all.some(i => i.r === r));
    return `<div class="skx-tools">
        <input class="input" id="skx-q" placeholder="Skin хайх…" value="${esc(p.q)}" aria-label="Skin хайх" autocomplete="off">
        <select class="input" id="skx-rarity" aria-label="Rarity"><option value="">Бүх rarity</option>${rar.map(r => `<option ${p.rarity === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <button class="skx-favf ${p.favOnly ? 'on' : ''}" data-action="skx-favonly" aria-pressed="${p.favOnly}" title="Зөвхөн favorite">${icon('heart')}</button>
        <span class="dim skx-n">${list.length}</span>
      </div>
      ${list.length ? `<div class="skx-skins">${list.map(i => `<div class="skx-skin ${p.sel === i.id ? 'on' : ''}" style="--rc:${i.rc}">
          <button class="skx-skin-b" data-action="skx-sel" data-id="${esc(i.id)}" aria-pressed="${p.sel === i.id}">
            <span class="skx-img"><img loading="lazy" decoding="async" src="${esc(img(i.i, '256fx192f'))}" alt="" onerror="this.classList.add('sk-noimg')"></span>
            <b>${esc(i.n)}</b><span class="skx-r">${esc(i.r)}</span>
            ${here === i.id ? '<span class="skx-tag on">Хадгалсан</span>' : there === i.id ? `<span class="skx-tag">${TEAM_NAME[S.team === 2 ? 3 : 2]}</span>` : ''}
          </button>
          <button class="skx-fav ${S.favorites.includes(i.id) ? 'on' : ''}" data-action="skx-fav" data-id="${esc(i.id)}" aria-label="Favorite" title="Favorite">${icon('heart')}</button>
          <i class="skx-rl"></i></div>`).join('')}</div>`
        : `<div class="empty-state"><div class="e">🔍</div>${p.favOnly ? 'Favorite skin алга' : 'Олдсонгүй'}</div>`}`;
  }
  function changed(p) {
    if (!p.sel) return false;
    const it = byId.get(p.sel);
    if (p.kind === 'agent') return savedItemId(p, it.t) !== it.id;
    const teams = p.both ? [2, 3] : [S.team];
    return teams.some(t => {
      const s = savedOf(p.kind, p.kind === 'weapon' ? p.d : null, t);
      if (!s || !s.item || s.item.id !== it.id) return true;
      if (it.p === 0) return false;
      const e = p.edit, d = s.data;
      return Math.abs(Number(d.wear) - Number(e.wear)) > 1e-6 || Number(d.seed) !== Math.round(Number(e.seed)) || (!!d.st) !== (!!e.st && !!it.st) || (d.tag || '') !== (p.kind === 'gloves' ? '' : (e.tag || ''));
    });
  }
  function previewPane(p) {
    const it = p.sel ? byId.get(p.sel) : null;
    const s = p.kind === 'agent' ? null : savedOf(p.kind, p.kind === 'weapon' ? p.d : null, S.team);
    const hasSaved = p.kind === 'agent' ? !!teamOf(S.saved, S.team).agent : !!s;
    const fallback = p.kind === 'weapon' ? DEF(weaponByDef.get(p.d).w) : p.kind === 'knife' ? DEF(p.d ? weaponByDef.get(p.d).w : 'weapon_knife') : DEF(p.kind === 'gloves' ? 'gloves' : 'agent');
    const e = p.edit || {}, [lo, hi] = (it && it.f) || [0, 1];
    const tune = it && p.kind !== 'agent' && it.p !== 0;
    const other = TEAM_NAME[S.team === 2 ? 3 : 2];
    return `<div class="skx-prev ${it ? '' : 'def'}" style="--rc:${it ? it.rc : 'transparent'}">
        <div class="skx-prev-img"><img src="${esc(it ? img(it.i, '512fx384f') : fallback)}" alt="${esc(it ? it.n : 'Default')}" onerror="this.classList.add('sk-noimg')"></div>
        <div class="skx-prev-h"><div style="min-width:0"><div class="dim" style="font-size:12px">${esc(it ? it.wn : pickTitle(p))}</div>
          <h3>${it && it.st && e.st && tune ? '<span class="st">StatTrak™</span> ' : ''}${esc(it ? it.n : 'Default')}</h3></div>${it ? `<span class="skx-r big">${esc(it.r)}</span>` : ''}</div>
      </div>
      ${tune ? `<button class="skx-tune-t ${p.tune ? 'open' : ''}" data-action="skx-tune" aria-expanded="${!!p.tune}">Float ${Number(e.wear).toFixed(3)} · Seed ${esc(String(e.seed))}${it.st && e.st ? ' · StatTrak™' : ''}${e.tag ? ' · ' + esc(e.tag) : ''}<span>${p.tune ? '▴' : '▾'}</span></button>
      <div class="skx-tune ${p.tune ? 'open' : ''}">
        <label class="sk-lbl" for="skx-wear"><span>Float / Wear</span><b id="skx-wear-v">${Number(e.wear).toFixed(4)} · ${wearOf(Number(e.wear))[1]}</b></label>
        <input type="range" id="skx-wear" min="${lo}" max="${hi}" step="0.0001" value="${e.wear}" class="sk-range">
        <div class="row between dim" style="font-size:11px"><span>${lo}</span><span>${hi}</span></div>
        <div class="skx-two">
          <div class="field"><label for="skx-seed">Pattern seed (0–${catalog.meta.seedMax})</label><input class="input" id="skx-seed" type="number" min="0" max="${catalog.meta.seedMax}" step="1" value="${esc(String(e.seed))}"></div>
          ${p.kind !== 'gloves' ? `<div class="field"><label for="skx-tag">Name tag</label><input class="input" id="skx-tag" maxlength="20" value="${esc(e.tag || '')}" placeholder="заавал биш" autocomplete="off"></div>` : '<div></div>'}
        </div>
        ${it.st ? `<label class="sk-check"><input type="checkbox" id="skx-st" ${e.st ? 'checked' : ''}> StatTrak™ (kill тоолуурыг сервер тоолно)</label>` : ''}
      </div>` : ''}
      ${p.kind !== 'agent' && it ? `<label class="sk-check skx-both"><input type="checkbox" id="skx-both" ${p.both ? 'checked' : ''}> ${other} loadout-д мөн хадгалах</label>` : ''}
      ${p.kind === 'agent' && it ? `<div class="note" style="font-size:12px;margin-top:8px">Agent зөвхөн ${TEAM_NAME[it.t]} багт хэрэглэгдэнэ.</div>` : ''}
      ${p.err ? `<div class="skx-err" role="alert">⚠️ ${esc(p.err)}</div>` : ''}
      <div class="skx-actions">
        <button class="btn primary" data-action="skx-save" ${it && changed(p) && !S.saving ? '' : 'disabled'}>${S.saving ? 'Хадгалж байна…' : 'Хадгалах'}</button>
        ${hasSaved ? `<button class="btn" data-action="skx-reset" ${S.saving ? 'disabled' : ''}>Default болгох</button>` : ''}
      </div>`;
  }
  function picker() {
    const p = S.pick; if (!p) return '';
    const typeMode = (p.kind === 'knife' || p.kind === 'gloves') && (p.step === 'type' || !p.d);
    return `<div class="skx-ov" data-action="skx-ov">
      <div class="skx-pick" role="dialog" aria-modal="true" aria-label="${esc(pickTitle(p))}">
        <div class="skx-pick-h">
          ${(p.kind === 'knife' || p.kind === 'gloves') && !typeMode ? `<button class="icon-btn" data-action="skx-types" title="Төрөл сонгох" aria-label="Төрөл сонгох">←</button>` : ''}
          <div style="min-width:0;flex:1"><div class="dim" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">${TEAM_NAME[S.team]} loadout</div><h2>${esc(pickTitle(p))}</h2></div>
          <span class="skx-teamchip t${S.team}">${TEAM_NAME[S.team]}</span>
          <button class="icon-btn" data-action="skx-close" aria-label="Хаах">${icon('x')}</button>
        </div>
        <div class="skx-pick-b">
          <div class="skx-pl" id="skx-pl">${typeMode ? typeStep(p) : skinList(p)}</div>
          <div class="skx-pr">${previewPane(p)}</div>
        </div>
      </div>
    </div>`;
  }

  /* ---------- хуудас ---------- */
  function header() {
    return `<div class="skx-head">
      <div class="skx-title"><span class="skx-kicker">BERX ARENA · SERVER COSMETICS</span><h1>SKIN <em>INVENTORY</em></h1></div>
      <div class="skx-teamsw" role="group" aria-label="Баг">${[[3, 'CT'], [2, 'T']].map(([t, l]) => `<button class="t${t} ${S.team === t ? 'on' : ''}" data-action="skx-team" data-t="${t}" aria-pressed="${S.team === t}">${l}<span>${countTeam(t)}</span></button>`).join('')}</div>
      <div class="skx-sync">${syncBadge()}</div>
      <button class="btn sm ghost skx-clear" data-action="skx-clear" title="T болон CT loadout-ыг бүхэлд нь цэвэрлэх">${icon('trash')} Бүгдийг цэвэрлэх</button>
    </div>
    <div class="skx-note">BERX ARENA сервер дээр л хэрэглэгдэх сонголт — Steam inventory-д item өгөхгүй, эзэмшил биш.</div>`;
  }
  function render() {
    if (!catalog || !S.saved) {
      const top = `<div class="skx-head"><div class="skx-title"><span class="skx-kicker">BERX ARENA · SERVER COSMETICS</span><h1>SKIN <em>INVENTORY</em></h1></div></div>`;
      if (S.err) return top + `<div class="card empty-state"><div class="e">⚠️</div>${/Steam/.test(S.err) ? 'Steam данс холбоно уу (Тохиргоо → Профайл).' : 'Ачаалж чадсангүй. Дахин оролдоно уу.'}<br><button class="btn mt" data-action="skx-retry">Дахин оролдох</button></div>`;
      return top + '<div class="card empty-state"><div class="e">⏳</div>Inventory ачаалж байна…</div>';
    }
    return `<div class="skx">
      ${header()}
      <nav class="skx-cats" aria-label="Ангилал">${CATS.map(([c, l]) => { const n = catCount(c); return `<button class="${S.cat === c ? 'on' : ''}" data-action="skx-cat" data-v="${c}" aria-pressed="${S.cat === c}">
        ${c === 'all' ? `<i class="skx-ic all">${icon('grid')}</i>` : `<i class="skx-ic" style="--ic:url('${ICON(c)}')"></i>`}<span>${l}</span>${n ? `<em>${n}</em>` : ''}</button>`; }).join('')}</nav>
      <div class="skx-grid">${gridCards().join('')}</div>
      ${picker()}
    </div>`;
  }

  /* ---------- хадгалах (одоогийн skins.save API) ---------- */
  function validEdit(it, e) {
    const [lo, hi] = it.f || [0, 1], seed = Number(e.seed);
    if (!(Number(e.wear) >= lo && Number(e.wear) <= hi)) return `Float ${lo}–${hi} хооронд байх ёстой`;
    if (!Number.isInteger(seed) || seed < 0 || seed > catalog.meta.seedMax) return `Pattern seed 0–${catalog.meta.seedMax} бүхэл тоо байх ёстой`;
    if (e.tag && (e.tag.length > 20 || /[<>"'`\\;]/.test(e.tag) || /[\u0000-\u001f]/.test(e.tag))) return 'Name tag 20 тэмдэгт хүртэл, < > " \' ` \\ ; тэмдэгтгүй';
    return null;
  }
  async function commit(next, okMsg, flashKey) {
    S.saving = true; if (S.pick) S.pick.err = null; rr();
    try {
      if (live()) {
        const j = await post('skins.save', { loadout: next });
        S.saved = next; S.version = (j.skins && j.skins.version) || S.version;
        await loadState();                       // серверийн хадгалсан хувилбар + sync төлөв
        startPoll();
      } else { S.version++; S.saved = next; demoWrite(); }
      S.pick = null; S.flash = flashKey; setTimeout(() => { if (S.flash === flashKey) { S.flash = null; if (location.hash === '#skins') rr(); } }, 1600);
      toast('Сонголт хадгалагдсан', '💾');
    } catch (e) {
      if (S.pick) S.pick.err = SAVE_FAIL; else toast(SAVE_FAIL, '⚠️');
    }
    S.saving = false; rr();
  }
  function keyFor(p, team) {
    if (p.kind === 'weapon') return 'w-' + p.d;
    if (p.kind === 'agent') return S.cat === 'agents' ? 'a-' + byId.get(p.sel).m : 'agent';
    return S.cat === 'knives' && p.kind === 'knife' ? 'kt-' + p.d : S.cat === 'gloves' && p.kind === 'gloves' ? 'gt-' + p.d : p.kind;
  }

  /* ---------- үйлдлүүд ---------- */
  const rr = () => window.BerxApp.render();
  const toast = (t, i) => window.BerxApp.toast(t, i);
  const actions = {
    'skx-cat'(el) { S.cat = el.dataset.v; return true; },
    'skx-team'(el) { S.team = +el.dataset.t; if (S.pick) S.pick = null; return true; },
    'skx-retry'() { S.err = null; init(); return true; },
    'skx-open'(el) { const k = el.dataset.kind; openPick(k, k === 'agent' ? el.dataset.d : el.dataset.d !== undefined ? +el.dataset.d : undefined); return true; },
    'skx-ov'(el, e) { if (e && e.target === el && !S.saving) { S.pick = null; return true; } },
    'skx-close'() { if (!S.saving) { S.pick = null; return true; } },
    'skx-types'() { if (S.pick) { S.pick.step = 'type'; S.pick.err = null; S.pick.scroll = 0; } return true; },
    'skx-type'(el) {
      const p = S.pick; p.d = +el.dataset.d; p.step = 'skin'; p.q = ''; p.rarity = ''; p.scroll = 0; p.err = null;
      const s = savedOf(p.kind, null, S.team);
      if (s && s.item && s.data.d === p.d) { p.sel = s.item.id; p.edit = { wear: s.data.wear ?? 0.01, seed: s.data.seed ?? 0, st: s.data.st ? 1 : 0, tag: s.data.tag || '' }; }
      else { p.sel = null; p.edit = null; }
      return true;
    },
    'skx-sel'(el) {
      const p = S.pick, it = byId.get(el.dataset.id); if (!p || !it) return;
      const s = p.kind === 'agent' ? null : savedOf(p.kind, p.kind === 'weapon' ? p.d : null, S.team);
      p.sel = it.id; p.err = null;
      p.edit = s && s.item && s.item.id === it.id ? { wear: s.data.wear ?? 0.01, seed: s.data.seed ?? 0, st: s.data.st ? 1 : 0, tag: s.data.tag || '' } : defaultsFor(it, p.edit);
      return true;
    },
    'skx-tune'() { if (S.pick) S.pick.tune = !S.pick.tune; return true; },
    'skx-favonly'() { if (S.pick) S.pick.favOnly = !S.pick.favOnly; return true; },
    async 'skx-fav'(el) {
      const id = el.dataset.id, prev = S.favorites.slice();
      S.favorites = S.favorites.includes(id) ? S.favorites.filter(x => x !== id) : [id, ...S.favorites];
      rr();
      try { if (live()) await post('skins.favorites', { favorites: S.favorites }); else demoWrite(); }
      catch (e) { S.favorites = prev; toast(SAVE_FAIL, '⚠️'); rr(); }
    },
    'skx-save'() {
      const p = S.pick; if (!p || !p.sel || S.saving) return;
      const it = byId.get(p.sel), next = clone(S.saved || empty());
      for (const t of [2, 3]) next[t] = teamOf(next, t);
      if (p.kind === 'agent') { next[it.t].agent = it.m; return commit(next, `${it.n} → ${TEAM_NAME[it.t]} agent хадгалагдлаа`, keyFor(p)); }
      const e = { ...p.edit, seed: Math.round(Number(p.edit.seed)) };
      if (it.p !== 0) { const bad = validEdit(it, e); if (bad) { p.err = bad; return true; } }
      const teams = p.both ? [2, 3] : [S.team];
      for (const t of teams) {
        const v = { wear: Math.round(Number(e.wear) * 1e6) / 1e6, seed: e.seed };
        if (p.kind === 'weapon') next[t].weapons[it.d] = { p: it.p, ...v, st: e.st && it.st ? 1 : 0, tag: e.tag || null };
        else if (p.kind === 'knife') next[t].knife = { d: it.d, w: it.w, p: it.p, ...(it.p ? v : { wear: 0.000001, seed: 0 }), st: e.st && it.st && it.p ? 1 : 0, tag: it.p ? e.tag || null : null };
        else if (p.kind === 'gloves') next[t].gloves = { d: it.d, p: it.p, ...v };
      }
      return commit(next, `${it.wn} | ${it.n} → ${teams.map(t => TEAM_NAME[t]).join(' + ')} хадгалагдлаа`, keyFor(p));
    },
    'skx-reset'() {
      const p = S.pick; if (!p || S.saving) return;
      const next = clone(S.saved || empty()); for (const t of [2, 3]) next[t] = teamOf(next, t);
      const teams = p.both && p.kind !== 'agent' ? [2, 3] : [S.team];
      for (const t of teams) {
        if (p.kind === 'weapon') delete next[t].weapons[p.d];
        else next[t][p.kind] = null;
      }
      const name = p.kind === 'weapon' ? weaponByDef.get(p.d).wn : p.kind === 'knife' ? 'Хутга' : p.kind === 'gloves' ? 'Бээлий' : 'Agent';
      return commit(next, `${name} → default (${teams.map(t => TEAM_NAME[t]).join(' + ')})`, p.kind === 'weapon' ? 'w-' + p.d : p.kind);
    },
    'skx-clear'() {
      window.BerxApp.confirm('T болон CT loadout-ын БҮХ сонголтыг цэвэрлэж хадгалах уу? Favorite хэвээр үлдэнэ.', async () => {
        try {
          if (live()) { await post('skins.clear', { confirm: 'CLEAR' }); await loadState(); startPoll(); }
          else { S.saved = empty(); S.version++; demoWrite(); }
          toast('Сонголт хадгалагдсан', '🧹');
        } catch (e) { toast(SAVE_FAIL, '⚠️'); }
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
      await loadState();
      const s = S.status && S.status.sync;
      if (s && s.version >= S.version && s.status === 'ok' && (s.appliedAt || !(S.status.server && S.status.server.inGame))) clearInterval(S.poll);
      if (!S.pick) rr();                         // picker нээлттэй үед хэрэглэгчийн оруулгыг таслахгүй
    }, 6000);
  }

  async function init() {
    try { await loadCatalog(); } catch (e) { S.err = 'Каталог ачаалагдсангүй: ' + e.message; }
    if (!S.err) await loadState();
    rr();
    if (S.status && S.status.sync && S.status.sync.version < S.version) startPoll();
  }

  let keyBound = false;
  function onKey(e) { if (e.key === 'Escape' && S.pick && !S.saving && location.hash === '#skins') { S.pick = null; rr(); } }
  function mount(root) {
    if (!catalog || !S.saved) { if (!loading || S.err) init(); else loading.then(() => { if (!S.saved) init(); }); }
    if (!keyBound) { document.addEventListener('keydown', onKey); keyBound = true; }
    document.body.classList.toggle('skx-lock', !!S.pick);
    // Ангиллын мөр (mobile дээр хэвтээ scroll): render хийхэд байрлалаа алдахгүй, идэвхтэй ангилал харагдана
    const nav = root.querySelector('.skx-cats');
    if (nav) {
      nav.scrollLeft = S.navScroll || 0;
      const on = nav.querySelector('button.on');
      if (on && (on.offsetLeft < nav.scrollLeft || on.offsetLeft + on.offsetWidth > nav.scrollLeft + nav.clientWidth)) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
      S.navScroll = nav.scrollLeft;
      nav.addEventListener('scroll', () => { S.navScroll = nav.scrollLeft; }, { passive: true });
    }
    const p = S.pick; if (!p) return;
    // render бүрт DOM шинэчлэгддэг тул жагсаалтын scroll, хайлтын focus-ийг сэргээнэ
    const pl = root.querySelector('#skx-pl');
    if (pl) { pl.scrollTop = p.scroll || 0; pl.addEventListener('scroll', () => { p.scroll = pl.scrollTop; }, { passive: true }); }
    const q = root.querySelector('#skx-q');
    if (q) {
      if (p.focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
      let qt; q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { p.q = q.value; p.focusQ = true; p.scroll = 0; rr(); }, 160); });
      q.addEventListener('blur', () => { p.focusQ = false; });
    }
    root.querySelector('#skx-rarity')?.addEventListener('change', (e) => { p.rarity = e.target.value; p.scroll = 0; rr(); });
    const wear = root.querySelector('#skx-wear');
    wear?.addEventListener('input', () => { p.edit.wear = Number(wear.value); const v = root.querySelector('#skx-wear-v'); if (v) v.textContent = `${p.edit.wear.toFixed(4)} · ${wearOf(p.edit.wear)[1]}`; syncSave(root); });
    root.querySelector('#skx-seed')?.addEventListener('input', (e) => { p.edit.seed = e.target.value === '' ? '' : Number(e.target.value); syncSave(root); });
    root.querySelector('#skx-tag')?.addEventListener('input', (e) => { p.edit.tag = e.target.value; syncSave(root); });
    root.querySelector('#skx-st')?.addEventListener('change', (e) => { p.edit.st = e.target.checked ? 1 : 0; rr(); });
    root.querySelector('#skx-both')?.addEventListener('change', (e) => { p.both = e.target.checked; rr(); });
  }
  // Оруулга өөрчлөгдөхөд (render хийлгүй) Save товчийн идэвхийг шинэчилнэ
  function syncSave(root) { const b = root.querySelector('[data-action="skx-save"]'); if (b && S.pick) b.disabled = !(S.pick.sel && changed(S.pick) && !S.saving); }
  function unmount() { clearInterval(S.poll); S.pick = null; document.body.classList.remove('skx-lock'); }

  window.BerxPages = window.BerxPages || {};
  window.BerxPages.skins = { render, actions, mount, unmount, _state: S };
})();
