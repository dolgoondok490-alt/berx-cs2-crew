/* =========================================================
 * UI COMPONENTS — цэвэр функцууд: (props) => HTML string
 * Логик байхгүй, зөвхөн дүрслэл. Framer/React руу шилжүүлэхэд
 * функц бүрийг нэг React component болгоход хялбар.
 * ========================================================= */
(function () {
  'use strict';
  const API = () => window.BerxAPI;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  function timeAgo(t) {
    const s = Math.max(1, (Date.now() - t) / 1000);
    if (s < 60) return 'дөнгөж сая';
    if (s < 3600) return Math.floor(s / 60) + 'м өмнө';
    if (s < 86400) return Math.floor(s / 3600) + 'ц өмнө';
    return Math.floor(s / 86400) + ' өдрийн өмнө';
  }
  function fmtDate(t) {
    const d = new Date(t), now = new Date();
    const same = d.toDateString() === now.toDateString();
    const tm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (same) return 'Өнөөдөр ' + tm;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Өчигдөр ' + tm;
    const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
    if (d.toDateString() === tmr.toDateString()) return 'Маргааш ' + tm;
    return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${tm}`;
  }

  /* ---------- Icons (inline SVG, stroke) ---------- */
  const P = {
    home: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>',
    invite: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    crew: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><circle cx="18" cy="9" r="3"/><path d="M17 15c3 0 5 2 5 5"/>',
    stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    skull: '<path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v3h10v-3c1.5-1 3-3 3-6a8 8 0 0 0-8-8Z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 19v-2M14 19v-2"/>',
    game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r="1"/><circle cx="18" cy="13.5" r="1"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/>',
    shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    map: '<path d="m9 3-6 3v15l6-3 6 3 6-3V3l-6 3z"/><path d="M9 3v15M15 6v15"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2"/><circle cx="16" cy="16" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="16" cy="8" r="1.2"/><circle cx="8" cy="16" r="1.2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    vote: '<path d="m9 12 2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
    crown: '<path d="m2 18 2-11 5 5 3-7 3 7 5-5 2 11Z"/>',
    ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    switch: '<path d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>'
  };
  const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;

  const AVAIL = {
    yes:   { e: '🔥', t: 'Тоглоно', s: 'Тоглоно' },
    maybe: { e: '🤔', t: 'Магадгүй', s: 'Магадгүй' },
    late:  { e: '🐢', t: 'Жаахан хоцорно', s: 'Хоцорно' },
    no:    { e: '💀', t: 'Амжихгүй', s: 'Тоглохгүй' }
  };
  const PRES = { online: 'Онлайн', away: 'Түр холдсон', offline: 'Оффлайн' };

  function Avatar(m, size = 40, opts = {}) {
    if (!m) return '';
    const p = opts.status ? API().presenceOf(m.id).site : null;
    const inner = m.avatar ? `<img src="${esc(m.avatar)}" alt="${esc(m.nick)}" loading="lazy">` : `<div class="ph" style="font-size:${size * .38}px">${esc((m.nick || '?')[0])}</div>`;
    return `<div class="av ${opts.ring ? 'ring' : ''} ${opts.cls || ''}" style="width:${size}px;height:${size}px" title="${esc(m.nick)}">${inner}
      ${p ? `<span class="st ${p}"></span>` : ''}${opts.emo ? `<span class="emo">${opts.emo}</span>` : ''}${opts.crown ? '<span class="crown">👑</span>' : ''}</div>`;
  }

  function StatusText(id) {
    const p = API().presenceOf(id);
    let t = PRES[p.site];
    if (p.site === 'offline' && p.lastSeen) t += ' · ' + timeAgo(p.lastSeen);
    const cs = p.steam && p.steam.inGame ? ' <span class="chip accent" style="height:18px;font-size:10px">🎮 CS2 тоглож байна</span>' : '';
    return `<span class="status-txt ${p.site}">${t}</span>${cs}`;
  }

  function SourceTag(m) {
    if (!m) return '';
    if (m.statsSource === 'live') return `<span class="chip win" style="height:20px;font-size:10.5px" title="Steam/FACEIT-ээс татсан · ${m.syncedAt ? timeAgo(m.syncedAt) : ''}">● STEAM LIVE</span>`;
    if (m.steamId && m.statsSource === 'demo') return '<span class="chip demo" title="Steam холбогдсон, статистик demo (server холбогдоогүй)">STEAM · DEMO</span>';
    if (m.steamId) return '<span class="chip demo">STEAM</span>';
    return '<span class="chip" style="height:20px;font-size:10.5px">Steam холбоогүй</span>';
  }
  const DemoTag = (t = 'DEMO') => API().isLive() ? '' : `<span class="chip demo" title="Жишээ өгөгдөл — бодит API холбогдоогүй">${t}</span>`;

  const NAV = [
    { id: 'dashboard', label: 'Нүүр', ic: 'home' },
    { id: 'invite', label: 'Тоглох урилга', ic: 'invite' },
    { id: 'crew', label: 'BERX баг', ic: 'crew' },
    { id: 'stats', label: 'Статистик', ic: 'stats' },
    { id: 'leaderboard', label: 'Leaderboard', ic: 'trophy' },
    { id: 'awards', label: 'Awards', ic: 'crown' },
    { id: 'fun', label: 'Хөгжилдөх өрөө', ic: 'game' }
  ];

  function Sidebar(route, ctx) {
    return `
      <a class="brand" href="#dashboard"><div class="logo">BER<b>X</b></div><div class="sub">CS2 CREW</div></a>
      <nav class="nav">
        ${NAV.map(n => `<a href="#${n.id}" class="${route === n.id ? 'active' : ''}">${icon(n.ic)}<span>${n.label}</span>${n.id === 'invite' && ctx.pendingInvites ? `<span class="badge">${ctx.pendingInvites}</span>` : ''}</a>`).join('')}
        <div class="nav-sep"></div>
        <a href="#admin" class="${route === 'admin' ? 'active' : ''}">${icon('gear')}<span>Тохиргоо</span></a>
      </nav>
      <div class="side-status">
        <div class="row between"><span class="muted" style="font-size:12px">${icon('clock', 'dim').replace('<svg', '<svg style="width:14px;height:14px"')} Багийн төлөв</span>${DemoTag('LOCAL')}</div>
        <div class="big"><span class="accent">${Math.min(5, ctx.readyCount)}</span><span class="dim"> / 5</span></div>
        <div class="muted" style="font-size:11.5px">Өнөө орой тоглох бэлэн</div>
        <div class="bars5">${[0, 1, 2, 3, 4].map(i => `<i class="${i < ctx.readyCount ? 'on' : ''}"></i>`).join('')}</div>
      </div>
      <div class="side-motto">BAD AIM.<br>LOW ELO.<span></span></div>`;
  }

  function Header(route, ctx) {
    const me = ctx.me;
    const crumb = (NAV.find(n => n.id === route) || { label: route === 'admin' ? 'Тохиргоо' : '' }).label;
    return `
      <button class="icon-btn menu-btn" data-action="toggle-menu" aria-label="Цэс">${icon('menu')}</button>
      <div class="crumb">BERX CS2 CREW / ${esc(crumb).toUpperCase()}</div>
      <div style="position:relative">
        <button class="icon-btn" data-action="toggle-notif" aria-label="Мэдэгдэл">${icon('bell')}${ctx.unread ? `<span class="dot-badge">${ctx.unread}</span>` : ''}</button>
        ${ctx.openMenu === 'notif' ? NotificationCenter(ctx.notifications) : ''}
      </div>
      <div style="position:relative">
        <button class="user-btn" data-action="toggle-user">${Avatar(me, 40, { status: true })}
          <div class="nm-wrap"><div class="nm">${esc(me.nick)}</div>${StatusText(me.id)}</div>${icon('chev', 'dim').replace('<svg', '<svg style="width:16px"')}</button>
        ${ctx.openMenu === 'user' ? UserMenu(me) : ''}
      </div>`;
  }

  function NotificationCenter(list) {
    return `<div class="dropdown" data-stop>
      <div class="dd-head">Мэдэгдэл <button class="link" data-action="notif-readall">Бүгдийг уншсан</button></div>
      ${list.length ? list.slice(0, 15).map(n => `
        <button class="dd-item ${n.read ? '' : 'unread'}" data-action="notif-open" data-id="${n.id}">
          <span style="font-size:20px">${n.icon || '🔔'}</span><span><div class="t">${esc(n.text)}</div><div class="tm">${timeAgo(n.date)}</div></span>
        </button>`).join('') : '<div class="empty-state">Мэдэгдэл алга</div>'}
    </div>`;
  }

  function UserMenu(me) {
    return `<div class="dropdown" style="width:260px" data-stop>
      <div class="dd-head" style="justify-content:flex-start;gap:10px">${Avatar(me, 36)}<div><div>${esc(me.nick)}</div><div class="dim" style="font-size:12px;font-weight:500">${me.steamId ? 'Steam холбогдсон' : 'Steam холбоогүй'}${me.admin ? ' · Admin' : ''}</div></div></div>
      <button class="dd-item" data-action="open-profile" data-id="${me.id}">${icon('users')} <span class="t">Миний профайл</span></button>
      <button class="dd-item" data-action="go" data-route="admin" data-tab="profile">${icon('edit')} <span class="t">Профайл засах</span></button>
      ${API().isLive() ? '' : `<button class="dd-item" data-action="switch-user">${icon('switch')} <span class="t">Өөр гишүүнээр турших <span class="chip demo" style="margin-left:4px">DEMO</span></span></button>`}
      <button class="dd-item" data-action="logout">${icon('logout')} <span class="t">Гарах</span></button>
    </div>`;
  }

  function Hero({ kicker = 'BERX CS2 CREW', title, accent = '', lead = '', img }) {
    return `<section class="hero" ${img ? `style="--hero-img:url(${img})"` : ''}>
      <span class="corner tl"></span><span class="corner br"></span>
      <div class="kicker">${esc(kicker)}</div>
      <h1>${esc(title)}${accent ? ` <em>${esc(accent)}</em>` : ''}</h1>
      ${lead ? `<p class="lead">${lead}</p>` : '<div class="motto">BAD AIM. LOW ELO.</div>'}
    </section>`;
  }

  function SectionTitle(title, sub = '', right = '') {
    return `<div class="sec-title"><span class="slash">//</span><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="right">${right}</div>` : ''}</div>`;
  }

  function CardHead(ic, title, right = '') {
    return `<div class="card-h"><span class="ico">${icon(ic)}</span><h3>${title}</h3>${right ? `<div class="right">${right}</div>` : ''}</div>`;
  }

  function StatTile(label, value, delta = null, opts = {}) {
    let d = '';
    if (delta !== null && delta !== undefined && delta !== 0) d = `<span class="d ${delta > 0 ? 'win' : 'loss'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}${opts.unit || ''}</span>`;
    return `<div class="stat"><div class="k">${opts.ic ? icon(opts.ic).replace('<svg', '<svg style="width:14px;height:14px;color:var(--accent)"') : ''}${label}</div><div class="v ${opts.cls || ''}">${value}</div>${d}</div>`;
  }

  function Ring(n, total, label) {
    const C = 2 * Math.PI * 50, pct = Math.min(1, n / total);
    return `<div class="ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="50"/><circle class="fg" cx="60" cy="60" r="50" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
      <div class="lbl"><div><b>${n}<span class="dim" style="font-size:20px"> / ${total}</span></b><small>${label}</small></div></div></div>`;
  }

  function LevelBadge(level) { return `<span class="lvl l${level}">${level}</span>`; }

  function PlayerCard(m, opts = {}) {
    const lvl = API().faceitLevel(m.faceitElo);
    const av = window.BerxStore.get().availability[m.id];
    return `<div class="card hover pcard ${opts.me ? 'glow' : ''}" data-action="open-profile" data-id="${m.id}" tabindex="0">
      ${Avatar(m, 76, { status: true, emo: av ? AVAIL[av].e : '' })}
      <div style="min-width:0">
        <div class="nm">${esc(m.nick)} ${m.captain ? '<span title="Captain">👑</span>' : ''}</div>
        ${StatusText(m.id)}
        <div>${m.captain ? '<span class="role cap">👑 Captain</span> ' : ''}${SourceTag(m)}</div>
      </div>
      <div><div class="mini-h">FACEIT</div>${LevelBadge(lvl)}</div>
      <div class="pr-col"><div class="mini-h">PREMIER</div><div class="pr mono">${(m.premier ? m.premier.toLocaleString('en-US') : '—')}</div></div>
    </div>`;
  }

  function MatchRow(x) {
    const mp = API().maps.find(m => m.id === x.map);
    const kd = x.k / Math.max(1, x.d);
    return `<div class="match-row">
      <div class="thumb" style="${mp.img ? `--img:url(${mp.img})` : ''}"></div>
      <div><b>${mp.name}</b><div class="dim" style="font-size:11.5px"><span class="${x.type === 'Premier' ? 'premier' : 'accent'}">◆</span> ${x.type} · ${fmtDate(x.date)}</div></div>
      <span class="wl-badge ${x.result}">${x.result}</span>
      <b class="mono">${x.score}</b>
      <div class="hide-s kda mono">${x.k} / ${x.d} / ${x.a}<div class="dim" style="font-size:11px">K/D/A · ${x.hsPct}% HS · ${x.adr} ADR</div></div>
      <b class="rt mono ${kd >= 1 ? 'win' : 'loss'}">${kd.toFixed(2)}</b>
    </div>`;
  }

  function WLChip(x) {
    const mp = API().maps.find(m => m.id === x.map);
    return `<div class="wl ${x.result}" style="${mp.img ? `--img:url(${mp.img})` : ''}" title="${mp.name} · ${x.type} · ${fmtDate(x.date)}">
      <div class="m">${mp.name}</div><div class="r">${x.result}</div><div class="s">${x.score.replace(' – ', '-')}</div></div>`;
  }

  function LineChart(points, opts = {}) {
    const W = 520, H = opts.h || 170, pl = 40, pr = 10, pt = 12, pb = 22;
    if (points.length < 2) return '<div class="empty-state">Өгөгдөл хангалтгүй</div>';
    const vals = points.map(p => p.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    const padv = (max - min) * .15 || 10; min -= padv; max += padv;
    const x = i => pl + i * (W - pl - pr) / (points.length - 1);
    const y = v => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const area = `${d} L${x(points.length - 1)},${H - pb} L${pl},${H - pb} Z`;
    const ticks = [0, .5, 1].map(t => min + (max - min) * t);
    const id = 'g' + Math.random().toString(36).slice(2, 7);
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'chart')}">
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff6a00" stop-opacity=".35"/><stop offset="1" stop-color="#ff6a00" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map(t => `<line class="gridline" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pl - 6}" y="${y(t) + 3}" text-anchor="end">${Math.round(t)}</text>`).join('')}
      <path d="${area}" fill="url(#${id})"/>
      <path d="${d}" fill="none" stroke="#ff7a14" stroke-width="2.5" stroke-linejoin="round" style="stroke-dasharray:2000;stroke-dashoffset:2000;animation:draw 1.4s var(--ease) forwards"/>
      ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="3.2" fill="${p.c || '#ff7a14'}" stroke="#111" stroke-width="1.5"><title>${esc(p.t || '')}: ${p.v}</title></circle>`).join('')}
    </svg></div><style>@keyframes draw{to{stroke-dashoffset:0}}</style>`;
  }

  function Donut(pct, label) {
    const C = 2 * Math.PI * 42;
    return `<div class="ring" style="width:130px;height:130px"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="42" style="stroke-width:10"/><circle class="fg" cx="50" cy="50" r="42" style="stroke-width:10" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/></svg>
      <div class="lbl"><div><b>${pct}%</b><small>${label}</small></div></div></div>`;
  }

  function AwardCard(a, opts = {}) {
    const w = a.winner;
    const srcLbl = { auto: 'Авто · stats', vote: 'Санал хураалт', manual: 'Гараар бүртгэл' }[a.source];
    return `<div class="card hover award ${opts.highlight ? 'gold' : ''}">
      <span class="src">${srcLbl}</span>
      <div class="txt">
        <div class="t"><span class="e">${a.emoji}</span>${a.title}</div>
        <div class="desc">${a.desc}</div>
        <div class="who">${w ? `${Avatar(w.member, 42)}<div><b>${esc(w.member.nick)}</b><small>${esc(w.value)}</small></div>` : '<span class="dim">Одоогоор ялагч алга</span>'}</div>
      </div>
      ${a.art ? `<div class="art" style="--img:url(${a.art})"></div>` : `<div class="art emoji">${a.emoji}</div>`}
    </div>`;
  }

  function Modal(inner, opts = {}) {
    return `<div class="overlay" data-action="close-modal"><div class="modal ${opts.size || ''}" data-stop role="dialog" aria-modal="true">
      <button class="icon-btn x" data-action="close-modal" aria-label="Хаах">${icon('x')}</button>${inner}</div></div>`;
  }

  function ProfileModal(m) {
    const s = API().statsFor(m.id);
    const meId = API().me().id;
    const av = window.BerxStore.get().availability[m.id];
    const pts = s.trend.map(t => ({ v: t.elo, t: fmtDate(t.date) }));
    return Modal(`
      <div class="pm-head">
        ${Avatar(m, 110, { status: true, ring: true })}
        <div style="flex:1;min-width:0">
          <div class="row wrap"><h2 class="display">${esc(m.nick)}</h2>${m.captain ? '<span class="chip accent">👑 Captain</span>' : ''}${SourceTag(m)}</div>
          <div class="muted" style="margin:2px 0 8px">“${esc(m.title || '')}”</div>
          <div class="row wrap">${StatusText(m.id)}${SourceTag(m)}
            <span class="chip ${av === 'yes' ? 'win' : av === 'no' ? 'loss' : av ? 'warn' : ''}">${av ? AVAIL[av].e + ' ' + AVAIL[av].s : '— Хариулаагүй'}</span>
            ${m.statsSource === 'live' ? '' : '<span class="chip" title="Бодит Steam төлөв зөвхөн server холбогдсон үед">Steam төлөв: тодорхойгүй</span>'}</div>
        </div>
      </div>
      <div class="modal-body">
        <div class="pm-grid">
          ${StatTile('Premier', `<span class="premier">${(s.premier ? s.premier.toLocaleString('en-US') : '—')}</span>`)}
          ${StatTile('FACEIT ELO', s.faceitElo.toLocaleString('en-US') + ` <span style="font-size:14px" class="muted">LVL ${s.level}</span>`)}
          ${StatTile('K/D', s.kd.toFixed(2), null, { cls: s.kd >= 1 ? 'win' : 'loss' })}
          ${StatTile('Win rate', s.wr + '%')}
          ${StatTile('HS%', s.hs + '%')}
          ${StatTile('ADR', s.adr)}
          ${StatTile('Matches', s.matches)}
          ${StatTile('K / D / A', `<span style="font-size:19px">${s.k}/${s.d}/${s.a}</span>`)}
        </div>
        <div class="grid mt cols" style="--c:1.2fr 1fr">
          <div class="card" style="padding:14px">${CardHead('trend', 'FACEIT ELO trend', DemoTag())}${LineChart(pts, { label: 'ELO trend', h: 150 })}</div>
          <div class="card" style="padding:14px">${CardHead('history', 'Сүүлийн 10')}<div class="wl-row" style="grid-template-columns:repeat(5,1fr)">${s.last10.map(WLChip).join('')}</div></div>
        </div>
        <div class="row wrap mt">
          ${m.id !== meId ? `<button class="btn primary" data-action="invite-member" data-id="${m.id}">${icon('send')} Тоглолтод урих</button>` : `<button class="btn primary" data-action="go" data-route="admin" data-tab="profile">${icon('edit')} Профайл засах</button>`}
          <button class="btn" data-action="go" data-route="stats" data-member="${m.id}">${icon('stats')} Бүтэн статистик</button>
          <a class="btn ghost" href="https://steamcommunity.com/profiles/${esc(m.steamId)}" target="_blank" rel="noopener">${icon('ext')} Steam</a>
          <a class="btn ghost" href="https://www.faceit.com/en/players/${esc(m.faceitNick)}" target="_blank" rel="noopener">${icon('ext')} FACEIT</a>
        </div>
        <p class="dim" style="font-size:11.5px;margin:12px 0 0">Steam/FACEIT холбоос нь жишээ ID-тай. Гишүүн өөрийн профайлаас бодит ID-гаа оруулна.</p>
      </div>`);
  }

  window.BerxUI = { esc, icon, timeAgo, fmtDate, pad, AVAIL, PRES, NAV, Avatar, StatusText, DemoTag, SourceTag, Sidebar, Header, NotificationCenter, Hero, SectionTitle, CardHead, StatTile, Ring, LevelBadge, PlayerCard, MatchRow, WLChip, LineChart, Donut, AwardCard, Modal, ProfileModal };
})();
