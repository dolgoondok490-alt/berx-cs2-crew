/* Awards */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI, S = window.BerxStore;
  const { esc, Avatar, CardHead, icon } = U;
  const ui = () => (window.BerxApp.ui.awards ||= { week: 0, record: 'late' });
  const WEEKS = [[0, 'Энэ 7 хоног'], [1, '1 долоо хоногийн өмнө'], [2, '2 долоо хоногийн өмнө'], [3, '3 долоо хоногийн өмнө']];
  const REC = { late: '🐢 Хоцролт', afk: '💤 AFK', excuse: '🎭 Шалтаг' };

  function render() {
    const u = ui(), st = S.get(), me = A.me();
    const aw = A.awards(u.week);
    const tally = {}; Object.values(st.votes.CHICKEN || {}).forEach(t => tally[t] = (tally[t] || 0) + 1);
    const totalVotes = Object.values(tally).reduce((a, b) => a + b, 0);
    const myVote = (st.votes.CHICKEN || {})[me.id];
    let rows = A.members().map(m => ({ m, g: A.isLive() && m.live && m.live.periods ? A.fromPeriod(m.live.periods.month) : A.aggregate(A.matchesOf(m.id).filter(x => x.date > Date.now() - 30 * 86400000)) })).filter(r => r.g.matches);
    if (!rows.length) rows = A.members().filter(m => m.live && m.live.kd != null).map(m => ({ m, g: { kd: +m.live.kd, wr: Math.round(+m.live.wr || 0), eloGain: 0, d: '—', matches: m.live.matches } }));
    rows.sort((a, b) => a.g.kd - b.g.kd);
    const recs = st.manual[u.record] || {};

    return `
      ${U.Hero({ kicker: 'BERX CREW', title: 'CREW', accent: 'AWARDS', lead: 'Хэт нухацтай биш. Meme culture. Гэхдээ тоо худлаа хэлэхгүй 😈' })}
      ${U.SectionTitle('BERX Crew Awards', 'Долоо хоног бүрийн шагнал — авто статистик, санал хураалт, гараар бүртгэл', `
        ${U.DemoTag()}<select class="input" style="height:38px;width:220px" data-shame-week aria-label="Долоо хоног">${WEEKS.map(([k, l]) => `<option value="${k}" ${u.week === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      <div class="awards">${aw.map((a, i) => U.AwardCard(a, { highlight: i === 0 })).join('')}</div>

      <div class="shame-layout mt">
        <div class="card">
          ${CardHead('stats', 'Awards хүснэгт <span class="muted" style="font-weight:500">(сүүлийн 30 хоног)</span>')}
          <div class="table-wrap"><table class="table">
            <thead><tr><th>#</th><th>Тоглогч</th><th>K/D ↑</th><th>Win rate</th><th>± ELO</th><th>Үхэл</th><th>Шалтаг (сүүлийн)</th></tr></thead>
            <tbody>${rows.length ? '' : '<tr><td colspan="7" class="empty-state">Статистик алга — гишүүд Steam-ээ холбож «Статистик татах» дарна</td></tr>'}${rows.map((r, i) => `<tr>
              <td>${i < 3 ? ['💀', '🤡', '🐔'][i] : `<span class="dim">${i + 1}</span>`}</td>
              <td><div class="row">${Avatar(r.m, 30)}<b>${esc(r.m.nick)}</b></div></td>
              <td class="mono ${r.g.kd >= 1 ? 'win' : 'loss'}">${r.g.kd.toFixed(2)}</td>
              <td class="mono ${r.g.wr >= 50 ? 'win' : 'loss'}">${r.g.wr}%</td>
              <td class="mono ${r.g.eloGain >= 0 ? 'win' : 'loss'}">${r.g.eloGain > 0 ? '+' : ''}${r.g.eloGain}</td>
              <td class="mono">${r.g.d}</td>
              <td class="muted" style="white-space:normal;min-width:180px">“${esc(st.lastExcuse?.[r.m.id] || A.content.excusesSaid[r.m.id] || '—')}”</td></tr>`).join('')}</tbody>
          </table></div>
        </div>

        <div class="col" style="gap:18px">
          <div class="card">
            ${CardHead('vote', '🐔 CHICKEN санал хураалт', `<span class="muted" style="font-size:12px">${totalVotes} санал</span>`)}
            <div class="muted" style="font-size:12px;margin-bottom:8px">Энэ долоо хоногт хамгийн аймхай тоглосон хэн бэ? Нэг санал, өөрчилж болно.</div>
            ${A.members().filter(m => m.id !== me.id).map(m => { const n = tally[m.id] || 0, pct = totalVotes ? n / totalVotes * 100 : 0; return `
              <div class="vote-opt ${myVote === m.id ? 'mine' : ''}" data-action="vote-chicken" data-id="${m.id}" role="button" tabindex="0"><span class="fill" style="width:${pct}%"></span>${Avatar(m, 28)}<b>${esc(m.nick)} ${myVote === m.id ? '<span class="accent" style="font-size:11px">← таны санал</span>' : ''}</b><span class="mono muted">${n}</span></div>`; }).join('')}
          </div>
          <div class="card">
            ${CardHead('edit', 'Гараар бүртгэх')}
            <div class="muted" style="font-size:12px;margin-bottom:10px">Автоматаар хэмжих боломжгүй зүйлс. Урилгад “Хоцорно” гэвэл хоцролт, lobby дээр шалтаг бичвэл шалтаг автоматаар +1 болно.</div>
            <div class="seg" style="margin-bottom:10px">${Object.entries(REC).map(([k, l]) => `<button class="${u.record === k ? 'on' : ''}" data-action="shame-rec" data-v="${k}">${l}</button>`).join('')}</div>
            ${A.members().map(m => `<div class="row" style="padding:5px 0">${Avatar(m, 28)}<b style="flex:1">${esc(m.nick)}</b>
              <button class="btn sm ghost" data-action="rec-dec" data-id="${m.id}" aria-label="хасах">−</button><b class="mono" style="width:22px;text-align:center">${recs[m.id] || 0}</b><button class="btn sm outline" data-action="rec-inc" data-id="${m.id}" aria-label="нэмэх">+1</button></div>`).join('')}
          </div>
          <div class="card">
            ${CardHead('history', 'Шагналын түүх')}
            ${[1, 2, 3].map(w => { const a = A.awards(w); const pick = ['CARRY', 'BOT', 'CHICKEN', 'ALWAYS_LATE']; return `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="dim" style="font-size:11.5px;margin-bottom:6px">${WEEKS[w][1]}</div><div class="row wrap" style="gap:6px">
              ${a.filter(x => pick.includes(x.key) && x.winner).map(x => `<span class="chip">${x.emoji} ${esc(x.winner.member.nick)}</span>`).join('')}</div></div>`; }).join('')}
            <button class="btn sm ghost mt" data-action="shame-week" data-v="1">Өмнөх долоо хоногийг бүтнээр нь харах ${icon('arrow')}</button>
          </div>
        </div>
      </div>`;
  }

  const actions = {
    'vote-chicken'(el) { A.voteChicken(el.dataset.id); window.BerxApp.toast(`🐔 ${A.member(el.dataset.id).nick}-д санал өглөө`, '🗳️'); },
    'shame-rec'(el) { ui().record = el.dataset.v; return true; },
    'shame-week'(el) { ui().week = +el.dataset.v; window.scrollTo({ top: 0, behavior: 'smooth' }); return true; },
    'rec-inc'(el) { A.record(ui().record, el.dataset.id, 1); },
    'rec-dec'(el) { A.record(ui().record, el.dataset.id, -1); }
  };
  function mount(root) { root.querySelector('[data-shame-week]')?.addEventListener('change', e => { ui().week = +e.target.value; window.BerxApp.render(); }); }
  window.BerxPages.awards = { render, actions, mount };
})();
