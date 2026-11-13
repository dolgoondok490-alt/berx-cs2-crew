/* Статистик — Statistics (FACEIT + Premier/Leetify) */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI;
  const { icon, esc, Avatar, CardHead, StatTile } = U;
  const ui = () => (window.BerxApp.ui.stats ||= { member: null, tab: 'overview', lbTab: 'premier' });
  const has = (v) => v !== null && v !== undefined && !Number.isNaN(+v);
  const f = (v, d = 0, suf = '') => has(v) ? (+v).toFixed(d) + suf : '—';
  const big = (v) => has(v) && +v ? (+v).toLocaleString('en-US') : '—';

  function matchTable(list, opts = {}) {
    if (!list.length) return `<div class="empty-state"><div class="e">🎮</div>${opts.empty || 'Тоглолт олдсонгүй'}</div>`;
    return list.map(x => U.MatchRow(x, opts)).join('');
  }
  function aggOf(list) { return A.aggregate(list); }

  function render() {
    const u = ui();
    if (!u.member || !A.member(u.member)) u.member = A.me().id;
    const m = A.member(u.member), s = A.statsFor(m.id);
    const live = s.source === 'live';
    const all = s.all || s.recent || [];
    const fcList = all.filter(x => x.type === 'FACEIT');
    const prList = all.filter(x => x.type === 'Premier');
    const fc = live ? (s.faceit || null) : { elo: m.faceitElo, level: s.level, nickname: m.faceitNick, lifetime: { ...aggOf(fcList), matches: fcList.length }, url: null };
    const fl = fc ? (fc.lifetime || {}) : {};
    const prAgg = aggOf(prList);
    const ps = live ? (s.premierStats || null) : { rating: m.premier, wr: prAgg.wr, kd: prAgg.kd, hs: prAgg.hs, adr: prAgg.adr, matches: prList.length, leetifyRating: prAgg.rating };
    const lbRows = A.leaderboard(u.lbTab === 'faceit' ? 'elo' : u.lbTab === 'kd' ? 'kd' : 'premier', 'all');
    const withPrem = A.members().filter(x => x.premier);
    const avgRating = withPrem.length ? Math.round(withPrem.reduce((a, x) => a + x.premier, 0) / withPrem.length) : 0;
    const loading = live && !s.loaded ? '<div class="empty-state"><div class="e">⏳</div>Тоглолтын түүх ачаалж байна...</div>' : null;
    const premTrend = prList.filter(x => has(x.rank)).slice(0, 25).reverse().map(x => ({ v: x.rank, t: A.mapInfo(x.map).name + ' · ' + U.fmtDate(x.date), c: x.result === 'W' ? '#39d27a' : '#ef4b4b' }));
    const kdTrend = all.filter(x => has(x.k) && has(x.d)).slice(0, 25).reverse().map(x => ({ v: +(x.k / Math.max(1, x.d)).toFixed(2), t: x.type + ' · ' + A.mapInfo(x.map).name, c: x.result === 'W' ? '#39d27a' : '#ef4b4b' }));
    const demoTrend = !live ? s.trend.map(t => ({ v: t.elo, t: U.fmtDate(t.date) })) : null;

    const tabBody = {
      overview: `
        <div class="statrow mt">
          ${StatTile('K/D Ratio', f(s.kd, 2), s.delta.kd || null, { ic: 'target' })}
          ${StatTile('Win Rate', f(s.wr, 0, '%'), s.delta.wr || null, { ic: 'trophy', unit: '%' })}
          ${StatTile('Headshot %', f(s.hs, 0, '%'), s.delta.hs || null, { ic: 'skull', unit: '%' })}
          ${StatTile('ADR', f(s.adr), null, { ic: 'zap' })}
          ${StatTile('Нийт match', big(s.matches), null, { ic: 'stats' })}
        </div>
        <div class="grid mt cols" style="--c:1.25fr 1fr">
          <div class="card">${CardHead('history', 'Сүүлийн тоглолтууд', `<button class="link" data-action="stats-tab" data-v="${fcList.length >= prList.length ? 'faceit' : 'premier'}">Бүгд ${icon('arrow').replace('<svg', '<svg style="width:13px"')}</button>`)}${loading || matchTable(all.slice(0, 6), { rank: true, empty: m.steamId ? 'Тоглолт олдсонгүй' : 'Steam ID холбоогүй' })}</div>
          <div class="col" style="gap:18px">
            <div class="card">${CardHead('map', 'Газрын Win Rate')}${mapBlock(s)}</div>
            <div class="card">${CardHead('history', 'Сүүлийн 10 тоглолтын W/L')}${s.last10.length ? `<div class="wl-row" style="grid-template-columns:repeat(5,1fr)">${s.last10.map(U.WLChip).join('')}</div>` : (loading || '<div class="empty-state">—</div>')}</div>
          </div>
        </div>`,
      faceit: !fc ? `<div class="card mt empty-state"><div class="e">🔍</div>FACEIT данс олдсонгүй. Steam данс чинь FACEIT-тэй холбогдсон эсэхийг шалгаад «Шинэчлэх» дар.</div>` : `
        <div class="card mt row wrap" style="gap:18px">
          ${U.LevelBadge(fc.level || s.level).replace('class="lvl', 'style="width:58px;height:58px;font-size:22px" class="lvl')}
          <div><div class="kpi-label"><span class="accent">◢</span> FACEIT ELO</div><div class="big-num accent">${big(fc.elo)}</div></div>
          <div><div class="kpi-label">Nickname</div><div style="font-weight:800;font-size:18px">${esc(fc.nickname || '—')}</div></div>
          ${fc.url ? `<a class="btn sm outline" style="margin-left:auto" href="${esc(fc.url)}" target="_blank" rel="noopener">${icon('ext')} FACEIT профайл</a>` : ''}
        </div>
        <div class="statrow mt">
          ${StatTile('K/D', f(fl.kd, 2), null, { ic: 'target' })}${StatTile('Win Rate', f(fl.wr, 0, '%'), null, { ic: 'trophy' })}
          ${StatTile('Headshot %', f(fl.hs, 0, '%'), null, { ic: 'skull' })}${StatTile('ADR', f(fl.adr, 1), null, { ic: 'zap' })}
          ${StatTile('Matches', big(fl.matches), null, { ic: 'stats' })}
        </div>
        ${has(fl.longestStreak) ? `<div class="row wrap mt" style="gap:8px"><span class="chip">🏆 Хожил: ${big(fl.wins)}</span><span class="chip">🔥 Хамгийн урт ялалтын цуврал: ${fl.longestStreak}</span><span class="chip">📈 Одоогийн цуврал: ${f(fl.currentStreak)}</span></div>` : ''}
        <div class="card mt">${CardHead('history', `FACEIT тоглолтууд <span class="muted" style="font-weight:500">(${fcList.length})</span>`, live ? '<span class="dim" style="font-size:11.5px">ELO өөрчлөлтийг FACEIT API өгдөггүй</span>' : '')}${loading || matchTable(fcList)}</div>`,
      premier: !ps ? `<div class="card mt empty-state"><div class="e">🔍</div>Premier статистик олдсонгүй. leetify.com-д Steam-ээрээ нэг удаа нэвтэрч, профайлаа public болгоод «Шинэчлэх» дар.</div>` : `
        <div class="card mt row wrap" style="gap:24px">
          <div><div class="kpi-label"><span class="premier">▮▮▮</span> Premier rating</div><div class="big-num premier">${big(ps.rating || m.premier)}</div></div>
          ${has(s.ratingGain) && s.ratingGain ? `<div><div class="kpi-label">Сүүлийн 30 хоног</div><div class="big-num ${s.ratingGain >= 0 ? 'win' : 'loss'}" style="font-size:26px">${s.ratingGain > 0 ? '+' : ''}${s.ratingGain}</div></div>` : ''}
          ${has(ps.leetifyRating) ? `<div><div class="kpi-label">Leetify rating</div><div class="big-num" style="font-size:26px">${ps.leetifyRating > 0 ? '+' : ''}${f(ps.leetifyRating, 2)}</div></div>` : ''}
          ${m.steamId ? `<a class="btn sm outline" style="margin-left:auto" href="https://leetify.com/app/profile/${esc(m.steamId)}" target="_blank" rel="noopener">${icon('ext')} Leetify</a>` : ''}
        </div>
        <div class="statrow mt">
          ${StatTile('K/D', f(ps.kd, 2), null, { ic: 'target' })}${StatTile('Win Rate', f(ps.wr, 0, '%'), null, { ic: 'trophy' })}
          ${StatTile('Headshot %', f(ps.hs, 0, '%'), null, { ic: 'skull' })}${StatTile('ADR', f(ps.adr), null, { ic: 'zap' })}
          ${StatTile('Premier match', big(ps.matches), null, { ic: 'stats' })}
        </div>
        ${premTrend.length > 1 ? `<div class="card mt">${CardHead('trend', 'Premier rating өөрчлөлт')}${U.LineChart(premTrend, { label: 'Premier rating', h: 190 })}</div>` : ''}
        <div class="card mt">${CardHead('history', `Premier тоглолтууд <span class="muted" style="font-weight:500">(${prList.length})</span>`)}${loading || matchTable(prList, { rank: true })}</div>`,
      maps: `
        <div class="card mt">${CardHead('map', 'Газар тус бүрийн статистик', '<span class="dim" style="font-size:11.5px">Татсан бүх тоглолтоор</span>')}
          ${loading || `<div class="table-wrap"><table class="table"><thead><tr><th>Map</th><th>Тоглосон</th><th>Win rate</th><th>K/D</th><th>ADR</th><th style="width:30%"></th></tr></thead><tbody>
          ${[...new Set([...A.maps.map(x => x.id), ...all.map(x => x.map)])].map(id => { const l = all.filter(x => x.map === id); return { id, g: aggOf(l) }; }).filter(r => r.g.matches || A.maps.some(x => x.id === r.id)).sort((a, b) => b.g.matches - a.g.matches)
            .map(({ id, g }) => { const mp = A.mapInfo(id); return `<tr><td><div class="row"><div style="width:54px;height:34px;border-radius:6px;background:${mp.img ? `url(${mp.img}) center/cover` : 'linear-gradient(135deg,#3a3f46,#1c1e22)'}"></div><b>${esc(mp.name)}</b></div></td><td>${g.matches}</td><td class="${g.wr >= 50 ? 'win' : 'loss'}"><b>${g.matches ? g.wr + '%' : '—'}</b></td><td>${g.matches && g.d ? g.kd.toFixed(2) : '—'}</td><td>${g.adr || '—'}</td><td><div class="bar"><i style="width:${g.wr}%"></i></div></td></tr>`; }).join('')}
          </tbody></table></div>`}</div>`,
      trend: `
        ${live ? '' : `<div class="card mt">${CardHead('trend', 'FACEIT ELO өсөлт / бууралт')}${U.LineChart(demoTrend, { label: 'ELO', h: 240 })}</div>`}
        ${premTrend.length > 1 ? `<div class="card mt">${CardHead('trend', 'Premier rating')}${U.LineChart(premTrend, { label: 'Premier', h: 220 })}</div>` : ''}
        <div class="card mt">${CardHead('stats', 'K/D — тоглолт бүрээр')}${loading || U.LineChart(kdTrend, { label: 'K/D', h: 200 })}<div class="dim" style="font-size:11.5px">Ногоон = ялалт, улаан = ялагдал.</div></div>`
    };
    if (!tabBody[u.tab]) u.tab = 'overview';

    const note = live
      ? `<div class="note mb" style="background:rgba(57,210,122,.08);border-color:rgba(57,210,122,.3);color:#b9f3cf">● <span><b>LIVE</b> — FACEIT Data API + Leetify ${s.syncedAt ? '· ' + U.timeAgo(s.syncedAt) + ' шинэчлэгдсэн' : ''}${s.warnings && s.warnings.length ? `<br><span style="color:#ffd99a">⚠️ ${s.warnings.map(esc).join(' · ')}</span>` : ''}</span></div>`
      : A.isLive()
        ? `<div class="note warn mb">ℹ️ <span>${m.steamId ? 'Статистик хараахан татагдаагүй байна — «Шинэчлэх» дар.' : 'Steam ID холбоогүй. Тохиргоо → Профайл хэсэгт Steam ID-гаа оруулаад «Статистик татах» дар, эсвэл Steam-ээр нэвтэр.'}</span></div>`
        : `<div class="note warn mb">🧪 <span><b>DEMO өгөгдөл.</b> Vercel дээрх жинхэнэ сайтад FACEIT, Leetify-аас бодитоор татагдана.</span></div>`;

    return `
      ${U.Hero({ kicker: 'CS2 CREW ///', title: 'STATISTICS', lead: 'FACEIT болон Premier статистик, тоглолтын түүх.' })}
      ${note}
      <div class="stats-layout">
        <div>
          <div class="card prof-card">
            <div class="pic">${m.avatar ? `<img src="${m.avatar}" alt="${esc(m.nick)}">` : `<div class="av" style="width:100%;height:100%"><div class="ph" style="border-radius:0;font-size:52px">${esc(m.nick[0])}</div></div>`}</div>
            <div style="min-width:0">
              <div class="row"><span class="display" style="font-size:34px">${esc(m.nick)}</span>${m.captain ? '<span style="font-size:22px">👑</span>' : ''}</div>
              <div class="accent display" style="font-size:14px">BERX CREW</div>
              ${U.StatusText(m.id)}
              <div class="muted" style="font-size:12.5px;margin-top:4px">“${esc(m.title)}”</div>
              <div class="row wrap mt" style="gap:8px">${U.SourceTag(m)}${m.steamId ? `<button class="btn sm outline" data-action="sync-stats" data-id="${m.id}" data-force="1">🔄 Шинэчлэх</button>` : ''}</div>
              <select class="input mt" style="height:36px;max-width:220px" data-stats-member aria-label="Гишүүн сонгох">${A.members().map(x => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.nick)}</option>`).join('')}</select>
            </div>
            <div class="kpis" style="display:contents">
              <div><div class="kpi-label"><span class="premier">▮▮▮</span> Premier rating</div><div class="big-num">${big(m.premier)}</div>${has(s.ratingGain) && s.ratingGain ? `<div class="${s.ratingGain >= 0 ? 'win' : 'loss'}" style="font-size:12px;font-weight:700">${s.ratingGain >= 0 ? '▲ +' : '▼ '}${s.ratingGain} <span class="dim">(30 хоног)</span></div>` : ''}</div>
              <div><div class="kpi-label"><span class="accent">◢</span> FACEIT ELO</div><div class="big-num">${big(m.faceitElo)}</div></div>
              <div style="text-align:center">${U.LevelBadge(s.level).replace('class="lvl', 'style="width:54px;height:54px;font-size:20px;margin:0 auto" class="lvl')}<div class="display" style="font-size:16px;margin-top:6px">LVL ${s.level || '—'}</div></div>
            </div>
          </div>
          <div class="tabs mt">
            ${[['overview', 'stats', 'Ерөнхий'], ['faceit', 'zap', 'FACEIT'], ['premier', 'trophy', 'Premier'], ['maps', 'map', 'Газрын статистик'], ['trend', 'trend', 'График']].map(([k, ic, l]) => `<button class="${u.tab === k ? 'on' : ''}" data-action="stats-tab" data-v="${k}">${icon(ic)} ${l}</button>`).join('')}
          </div>
          ${tabBody[u.tab]}
        </div>
        <div class="col" style="gap:18px">
          <div class="card lb-mini">
            ${CardHead('trophy', '<span class="display">BERX Crew Leaderboard</span>')}
            <div class="seg" style="width:100%;margin-bottom:6px">${[['premier', 'Premier'], ['faceit', 'FACEIT'], ['kd', 'K/D']].map(([k, l]) => `<button style="flex:1" class="${u.lbTab === k ? 'on' : ''}" data-action="stats-lb" data-v="${k}">${l}</button>`).join('')}</div>
            ${lbRows.map(r => `<button class="r" style="width:100%;text-align:left;${r.m.id === m.id ? 'background:rgba(255,106,0,.08);border-radius:8px' : ''}" data-action="stats-member" data-id="${r.m.id}">
              ${r.rank <= 3 ? `<span class="medal g${r.rank}">${r.rank}</span>` : `<span class="dim" style="text-align:center">${r.rank}</span>`}${Avatar(r.m, 30)}<b>${esc(r.m.nick)}</b>
              <span class="mono ${u.lbTab === 'premier' ? 'premier' : u.lbTab === 'faceit' ? 'accent' : ''}" style="font-weight:800">${r.value ? r.display : '—'}</span><span class="dim mono" style="font-size:11.5px">${r.agg.kd ? (+r.agg.kd).toFixed(2) : ''}</span></button>`).join('')}
          </div>
          <div class="card" style="background:linear-gradient(90deg,rgba(20,21,24,.95),rgba(20,21,24,.6)),url(assets/art/hero.jpg) right/cover">
            <div class="kpi-label">Crew average Premier</div><div class="big-num">${avgRating ? avgRating.toLocaleString('en-US') : '—'}</div>
          </div>
        </div>
      </div>`;
  }

  function mapBlock(s) {
    const rows = Object.entries(s.mapWR).filter(([, v]) => v.played).sort((a, b) => b[1].played - a[1].played).slice(0, 5);
    if (!rows.length) return '<div class="empty-state">Тоглолт алга</div>';
    return `<div class="row" style="gap:18px;align-items:center">${U.Donut(Math.round(s.wr || 0), 'Win Rate')}<div style="flex:1" class="col">
      ${rows.map(([id, v]) => `<div><div class="row between" style="font-size:12px"><span>${esc(A.mapInfo(id).name)} <span class="dim">(${v.played})</span></span><b>${v.wr}%</b></div><div class="bar"><i style="width:${v.wr}%"></i></div></div>`).join('')}
    </div></div>`;
  }

  const actions = {
    'stats-tab'(el) { ui().tab = el.dataset.v; return true; },
    'stats-lb'(el) { ui().lbTab = el.dataset.v; return true; },
    'stats-member'(el) { ui().member = el.dataset.id; window.scrollTo({ top: 0, behavior: 'smooth' }); return true; }
  };
  function mount(root) {
    root.querySelector('[data-stats-member]')?.addEventListener('change', e => { ui().member = e.target.value; window.BerxApp.render(); });
    const id = ui().member;
    if (A.loadMatches && id) A.loadMatches(id);
  }
  window.BerxPages.stats = { render, actions, mount, ui };
})();
