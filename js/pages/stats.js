/* Статистик — Statistics */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI;
  const { icon, esc, Avatar, CardHead, StatTile } = U;
  const ui = () => (window.BerxApp.ui.stats ||= { member: null, tab: 'overview', lbTab: 'premier', histType: 'all' });

  function render() {
    const u = ui();
    if (!u.member || !A.member(u.member)) u.member = A.me().id;
    const m = A.member(u.member), s = A.statsFor(m.id);
    const trendPts = s.trend.map(t => ({ v: t.elo, t: U.fmtDate(t.date) }));
    const lbRows = A.leaderboard(u.lbTab === 'faceit' ? 'elo' : u.lbTab === 'kd' ? 'kd' : 'premier', 'all');
    const avgRating = Math.round(A.members().reduce((a, x) => a + x.premier, 0) / A.members().length);
    let hist = s.recent; if (u.histType !== 'all') hist = hist.filter(x => x.type === u.histType);

    const tabBody = {
      overview: `
        <div class="statrow mt">
          ${StatTile('K/D Ratio', s.kd.toFixed(2), s.delta.kd, { ic: 'target' })}
          ${StatTile('Win Rate', s.wr + '%', s.delta.wr, { ic: 'trophy', unit: '%' })}
          ${StatTile('Headshot %', s.hs + '%', s.delta.hs, { ic: 'skull', unit: '%' })}
          ${StatTile('ADR', s.adr, null, { ic: 'zap' })}
          ${StatTile('Avg Rating', s.rating.toFixed(2), null, { ic: 'stats' })}
        </div>
        <div class="statrow mt cols4">
          ${StatTile('Нийт match', s.matches)}${StatTile('Kills', s.k)}${StatTile('Deaths', s.d)}${StatTile('Assists', s.a)}
        </div>
        <div class="grid mt cols" style="--c:1.25fr 1fr">
          <div class="card">${CardHead('history', 'Сүүлийн тоглолтууд', `<button class="link" data-action="stats-tab" data-v="history">Бүгдийг харах ${icon('arrow').replace('<svg', '<svg style="width:13px"')}</button>`)}${s.recent.slice(0, 5).map(U.MatchRow).join('')}</div>
          <div class="col" style="gap:18px">
            <div class="card">${CardHead('map', 'Газрын Win Rate')}${mapBlock(s)}</div>
            <div class="card">${CardHead('trend', 'FACEIT ELO trend <span class="muted" style="font-weight:500">(сүүлийн 20)</span>', `<span class="${s.trend.at(-1).elo >= s.trend[0].elo ? 'win' : 'loss'}" style="font-weight:800;font-size:12.5px">${s.trend.at(-1).elo - s.trend[0].elo >= 0 ? '▲ +' : '▼ '}${s.trend.at(-1).elo - s.trend[0].elo}</span>`)}${U.LineChart(trendPts, { label: 'ELO trend', h: 150 })}</div>
          </div>
        </div>
        <div class="card mt">${CardHead('history', 'Сүүлийн 10 тоглолтын W/L')}<div class="wl-row">${s.last10.map(U.WLChip).join('')}</div></div>`,
      history: `
        <div class="card mt">${CardHead('history', 'Тоглолтын түүх', `<div class="seg">${['all', 'FACEIT', 'Premier'].map(k => `<button class="${u.histType === k ? 'on' : ''}" data-action="stats-hist" data-v="${k}">${k === 'all' ? 'Бүгд' : k}</button>`).join('')}</div>`)}
          ${hist.map(U.MatchRow).join('') || '<div class="empty-state">Тоглолт алга</div>'}</div>`,
      maps: `
        <div class="card mt">${CardHead('map', 'Газар тус бүрийн статистик')}
          <div class="table-wrap"><table class="table"><thead><tr><th>Map</th><th>Тоглосон</th><th>Win rate</th><th>K/D</th><th>ADR</th><th style="width:30%"></th></tr></thead><tbody>
          ${A.maps.slice(0, 6).map(mp => { const l = A.matchesOf(m.id).filter(x => x.map === mp.id); const g = A.aggregate(l); return `<tr><td><div class="row"><div style="width:54px;height:34px;border-radius:6px;background:url(${mp.img}) center/cover"></div><b>${mp.name}</b></div></td><td>${g.matches}</td><td class="${g.wr >= 50 ? 'win' : 'loss'}"><b>${g.wr}%</b></td><td>${g.kd.toFixed(2)}</td><td>${g.adr}</td><td><div class="bar"><i style="width:${g.wr}%"></i></div></td></tr>`; }).join('')}
          </tbody></table></div></div>`,
      trend: `
        <div class="card mt">${CardHead('trend', 'FACEIT ELO өсөлт / бууралт')}${U.LineChart(trendPts, { label: 'ELO', h: 260 })}</div>
        <div class="card mt">${CardHead('stats', 'Rating — тоглолт бүрээр')}${U.LineChart(s.recent.slice().reverse().map(x => ({ v: x.rating * 100, t: A.maps.find(mp => mp.id === x.map).name, c: x.result === 'W' ? '#39d27a' : '#ef4b4b' })), { label: 'rating x100', h: 200 })}<div class="dim" style="font-size:11.5px">Rating × 100. Ногоон = ялалт, улаан = ялагдал.</div></div>`
    };

    return `
      ${U.Hero({ kicker: 'CS2 CREW ///', title: 'STATISTICS', lead: 'Багийн гишүүдийн тоглоомын статистик, эрэмбэ, хөгжил.' })}
      ${m.statsSource === 'live'
        ? `<div class="note mb" style="background:rgba(57,210,122,.08);border-color:rgba(57,210,122,.3);color:#b9f3cf">● <span><b>LIVE</b> — Premier (Leetify), FACEIT ELO/K/D/WR/HS (FACEIT Data API) ${s.syncedAt ? U.timeAgo(s.syncedAt) + ' шинэчлэгдсэн' : ''}. Тоглолт тус бүрийн түүх demo хэвээр.</span></div>`
        : `<div class="note warn mb">🧪 <span><b>DEMO өгөгдөл.</b> ${m.steamId ? 'Steam холбогдсон ч server асаагүй тул demo статистик.' : 'Steam холбоогүй.'} Server (server/server.js) асаахад Steam-ээр нэвтэрсэн хүний Premier + FACEIT статистик бодитоор татагдана.</span></div>`}
      <div class="stats-layout">
        <div>
          <div class="card prof-card">
            <div class="pic">${m.avatar ? `<img src="${m.avatar}" alt="${esc(m.nick)}">` : `<div class="av" style="width:100%;height:100%"><div class="ph" style="border-radius:0;font-size:52px">${esc(m.nick[0])}</div></div>`}</div>
            <div style="min-width:0">
              <div class="row"><span class="display" style="font-size:34px">${esc(m.nick)}</span>${m.captain ? '<span style="font-size:22px">👑</span>' : ''}</div>
              <div class="accent display" style="font-size:14px">BERX CREW</div>
              ${U.StatusText(m.id)}
              <div class="muted" style="font-size:12.5px;margin-top:4px">“${esc(m.title)}”</div>
              <div class="row wrap mt" style="gap:8px">${U.SourceTag(m)}${m.steamId ? `<button class="btn sm outline" data-action="sync-stats" data-id="${m.id}">🔄 Шинэчлэх</button>` : ''}</div>
              <select class="input mt" style="height:36px;max-width:220px" data-stats-member aria-label="Гишүүн сонгох">${A.members().map(x => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.nick)}</option>`).join('')}</select>
            </div>
            <div class="kpis" style="display:contents">
              <div><div class="kpi-label"><span class="premier">▮▮▮</span> Premier rating</div><div class="big-num">${(s.premier ? s.premier.toLocaleString('en-US') : '—')}</div><div class="${s.ratingGain >= 0 ? 'win' : 'loss'}" style="font-size:12px;font-weight:700">${s.ratingGain >= 0 ? '▲ +' : '▼ '}${s.ratingGain} <span class="dim">(бүх demo)</span></div></div>
              <div><div class="kpi-label"><span class="accent">◢</span> FACEIT ELO</div><div class="big-num">${s.faceitElo.toLocaleString('en-US')}</div><div class="${s.eloGain >= 0 ? 'win' : 'loss'}" style="font-size:12px;font-weight:700">${s.eloGain >= 0 ? '▲ +' : '▼ '}${s.eloGain}</div></div>
              <div style="text-align:center">${U.LevelBadge(s.level).replace('class="lvl', 'style="width:54px;height:54px;font-size:20px;margin:0 auto" class="lvl')}<div class="display" style="font-size:16px;margin-top:6px">LVL ${s.level}</div></div>
            </div>
          </div>
          <div class="tabs mt">
            ${[['overview', 'stats', 'Ерөнхий'], ['history', 'history', 'Тоглолтын түүх'], ['maps', 'map', 'Газрын статистик'], ['trend', 'trend', 'ELO график']].map(([k, ic, l]) => `<button class="${u.tab === k ? 'on' : ''}" data-action="stats-tab" data-v="${k}">${icon(ic)} ${l}</button>`).join('')}
          </div>
          ${tabBody[u.tab]}
        </div>
        <div class="col" style="gap:18px">
          <div class="card lb-mini">
            ${CardHead('trophy', '<span class="display">BERX Crew Leaderboard</span>')}
            <div class="seg" style="width:100%;margin-bottom:6px">${[['premier', 'Premier'], ['faceit', 'FACEIT'], ['kd', 'K/D']].map(([k, l]) => `<button style="flex:1" class="${u.lbTab === k ? 'on' : ''}" data-action="stats-lb" data-v="${k}">${l}</button>`).join('')}</div>
            ${lbRows.map(r => `<button class="r" style="width:100%;text-align:left;${r.m.id === m.id ? 'background:rgba(255,106,0,.08);border-radius:8px' : ''}" data-action="stats-member" data-id="${r.m.id}">
              ${r.rank <= 3 ? `<span class="medal g${r.rank}">${r.rank}</span>` : `<span class="dim" style="text-align:center">${r.rank}</span>`}${Avatar(r.m, 30)}<b>${esc(r.m.nick)}</b>
              <span class="mono ${u.lbTab === 'premier' ? 'premier' : u.lbTab === 'faceit' ? 'accent' : ''}" style="font-weight:800">${r.display}</span><span class="dim mono" style="font-size:11.5px">${r.agg.kd.toFixed(2)}</span></button>`).join('')}
          </div>
          <div class="card" style="background:linear-gradient(90deg,rgba(20,21,24,.95),rgba(20,21,24,.6)),url(assets/art/hero.jpg) right/cover">
            <div class="kpi-label">Crew average Premier</div><div class="big-num">${avgRating.toLocaleString('en-US')}</div>
          </div>
          <div class="card">
            ${CardHead('lock', 'Өгөгдлийн эх үүсвэр')}
            <div class="kv">${Object.entries(A.SOURCES).map(([k, v]) => `<span class="muted">${{ stats: 'FACEIT stats', premier: 'Premier', steam: 'Steam төлөв', realtime: 'Realtime', auth: 'Нэвтрэлт' }[k]}</span><span class="dim" style="font-size:12px">${v.target}</span><span class="chip ${v.mode === 'none' ? 'loss' : 'demo'}">${v.label}</span>`).join('')}</div>
          </div>
        </div>
      </div>`;
  }

  function mapBlock(s) {
    return `<div class="row" style="gap:18px;align-items:center">${U.Donut(s.wr, 'Нийт Win Rate')}<div style="flex:1" class="col">
      ${Object.entries(s.mapWR).sort((a, b) => b[1].wr - a[1].wr).slice(0, 5).map(([id, v]) => `<div><div class="row between" style="font-size:12px"><span>${A.maps.find(m => m.id === id).name}</span><b>${v.wr}%</b></div><div class="bar"><i style="width:${v.wr}%"></i></div></div>`).join('')}
    </div></div>`;
  }

  const actions = {
    'stats-tab'(el) { ui().tab = el.dataset.v; return true; },
    'stats-hist'(el) { ui().histType = el.dataset.v; return true; },
    'stats-lb'(el) { ui().lbTab = el.dataset.v; return true; },
    'stats-member'(el) { ui().member = el.dataset.id; window.scrollTo({ top: 0, behavior: 'smooth' }); return true; }
  };
  function mount(root) {
    root.querySelector('[data-stats-member]')?.addEventListener('change', e => { ui().member = e.target.value; window.BerxApp.render(); });
  }
  window.BerxPages.stats = { render, actions, mount, ui };
})();
