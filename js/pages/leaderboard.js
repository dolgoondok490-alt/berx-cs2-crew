/* Leaderboard */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI;
  const { esc, Avatar, CardHead } = U;
  const ui = () => (window.BerxApp.ui.lb ||= { metric: 'premier', period: 'all' });
  const PERIODS = [['day', 'Өдөр'], ['week', '7 хоног'], ['month', 'Сар'], ['all', 'Бүх хугацаа']];

  function move(r) {
    const d = r.prevRank - r.rank;
    if (d > 0) return `<span class="mv up">▲ ${d}</span>`;
    if (d < 0) return `<span class="mv down">▼ ${-d}</span>`;
    return '<span class="mv same">—</span>';
  }

  function render() {
    const u = ui(), me = A.me();
    const rows = A.leaderboard(u.metric, u.period);
    const def = A.METRICS[u.metric];
    const top = rows.slice(0, 3);
    const order = [top[1], top[0], top[2]].filter(Boolean);
    const valCls = u.metric === 'premier' ? 'premier' : u.metric === 'elo' ? 'accent' : '';
    const ratingMetric = u.metric === 'premier' || u.metric === 'elo';
    return `
      ${U.Hero({ kicker: 'BERX CREW RANKING', title: 'LEADER', accent: 'BOARD' })}
      <div class="row wrap between mb" style="gap:12px">
        <div class="seg">${Object.entries(A.METRICS).map(([k, v]) => `<button class="${u.metric === k ? 'on' : ''}" data-action="lb-metric" data-v="${k}">${v.label}</button>`).join('')}</div>
        <div class="row" style="gap:8px">${U.DemoTag()}<div class="seg">${PERIODS.map(([k, l]) => `<button class="${u.period === k ? 'on' : ''}" data-action="lb-period" data-v="${k}">${l}</button>`).join('')}</div></div>
      </div>
      ${ratingMetric && u.period !== 'all' ? `<div class="note mb">ℹ️ ${def.label} нь одоогийн утга. Хугацааны шүүлтүүр нь rank-ийн өөрчлөлтийг (сум) тооцоход ашиглагдана.</div>` : ''}
      <div class="podium">
        ${order.map(r => { const p = r.rank; return `<div class="pod p${p}" data-action="open-profile" data-id="${r.m.id}" style="cursor:pointer">
          ${p === 1 ? '<div style="font-size:30px;margin-bottom:-4px">👑</div>' : ''}
          ${Avatar(r.m, p === 1 ? 104 : 84)}
          <div class="nm">${esc(r.m.nick)}</div><div class="val ${valCls}">${r.display}</div>
          <div class="dim" style="font-size:12px">${move(r)}</div>
          <div class="base">${p}</div></div>`; }).join('')}
      </div>
      <div class="card">
        ${CardHead('trophy', `Ranking — ${def.label}`, `<span class="muted" style="font-size:12px">${PERIODS.find(p => p[0] === u.period)[1]}</span>`)}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>#</th><th>Хөдөлгөөн</th><th>Тоглогч</th>
            ${[['premier', 'Premier'], ['elo', 'FACEIT ELO'], ['kd', 'K/D'], ['wr', 'Win %'], ['hs', 'HS %'], ['eloGain', '± ELO'], ['matches', 'Match']].map(([k, l]) => `<th class="sortable ${u.metric === k ? 'sorted' : ''}" data-action="lb-metric" data-v="${k}">${l}${u.metric === k ? ' ↓' : ''}</th>`).join('')}
          </tr></thead>
          <tbody>${rows.map(r => `<tr class="${r.m.id === me.id ? 'me' : ''}" data-action="open-profile" data-id="${r.m.id}" style="cursor:pointer">
            <td>${r.rank <= 3 ? `<span class="medal g${r.rank}">${r.rank}</span>` : `<b class="dim" style="padding-left:8px">${r.rank}</b>`}</td>
            <td>${move(r)}</td>
            <td><div class="row">${Avatar(r.m, 34, { status: true })}<div><b>${esc(r.m.nick)}</b>${r.m.id === me.id ? ' <span class="chip accent" style="height:18px;font-size:10px">Та</span>' : ''}<div style="margin-top:2px">${U.SourceTag(r.m)}</div></div></div></td>
            <td class="premier mono" style="font-weight:700">${(r.m.premier ? r.m.premier.toLocaleString('en-US') : '—')}</td>
            <td class="accent mono" style="font-weight:700">${r.m.faceitElo.toLocaleString('en-US')} <span class="dim" style="font-size:11px">L${A.faceitLevel(r.m.faceitElo)}</span></td>
            <td class="mono ${r.agg.kd >= 1 ? 'win' : 'loss'}">${r.agg.matches ? r.agg.kd.toFixed(2) : '—'}</td>
            <td class="mono">${r.agg.matches ? r.agg.wr + '%' : '—'}</td>
            <td class="mono">${r.agg.matches ? r.agg.hs + '%' : '—'}</td>
            <td class="mono ${r.agg.eloGain >= 0 ? 'win' : 'loss'}">${r.agg.eloGain > 0 ? '+' : ''}${r.agg.eloGain}</td>
            <td class="mono">${r.agg.matches}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>`;
  }
  const actions = {
    'lb-metric'(el) { ui().metric = el.dataset.v; return true; },
    'lb-period'(el) { ui().period = el.dataset.v; return true; }
  };
  window.BerxPages.leaderboard = { render, actions };
})();
