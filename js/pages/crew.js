/* BERX баг — Crew Members */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI;
  const { icon, Avatar } = U;
  const ui = () => (window.BerxApp.ui.crew ||= { filter: 'all', view: 'grid', q: '' });

  function render() {
    const u = ui(), me = A.me();
    const all = A.members();
    const online = all.filter(m => A.presenceOf(m.id).site !== 'offline');
    let list = u.filter === 'online' ? online : u.filter === 'offline' ? all.filter(m => A.presenceOf(m.id).site === 'offline') : all;
    if (u.q) list = list.filter(m => (m.nick + ' ' + m.name).toLowerCase().includes(u.q.toLowerCase()));
    const avgP = Math.round(all.reduce((s, m) => s + m.premier, 0) / all.length);
    const avgE = Math.round(all.reduce((s, m) => s + m.faceitElo, 0) / all.length);
    const avail = window.BerxStore.get().availability;
    return `
      ${U.Hero({ kicker: 'CREW ROSTER', title: 'BERX', accent: 'CREW' })}
      <div class="card crew-stats">
        <div class="team row" style="gap:14px"><div class="emblem">B</div><div><div class="display" style="font-size:22px">BERX CS2 CREW</div><div class="muted">Найзууд. CS2. Өрсөлдөөн.</div></div></div>
        <div><div class="n">${all.length}</div><div class="l">Гишүүд</div></div>
        <div><div class="n win">${Object.values(avail).filter(v => v === 'yes').length}</div><div class="l">Өнөөдөр бэлэн</div></div>
        <div><div class="n premier">${avgP.toLocaleString('en-US')}</div><div class="l">Дундаж Premier</div></div>
        <div><div class="n accent">${avgE.toLocaleString('en-US')}</div><div class="l">Дундаж FACEIT ELO</div></div>
        <div>${me.admin ? `<button class="btn outline" data-action="go" data-route="admin" data-tab="members">${icon('plus')} Гишүүн нэмэх</button>` : ''}</div>
      </div>
      ${U.SectionTitle('Crew Roster', 'BERX-ийн үндсэн бүрэлдэхүүн', `
        <input id="crew-q" class="input" style="height:38px;width:170px" placeholder="Хайх..." data-crew-q value="${U.esc(u.q)}" aria-label="Гишүүн хайх">
        <div class="seg">${[['all', `Бүгд (${all.length})`], ['online', `🟢 Онлайн (${online.length})`], ['offline', `Оффлайн (${all.length - online.length})`]].map(([k, l]) => `<button class="${u.filter === k ? 'on' : ''}" data-action="crew-filter" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="seg"><button class="${u.view === 'grid' ? 'on' : ''}" data-action="crew-view" data-v="grid" aria-label="Grid">${icon('grid').replace('<svg', '<svg style="width:16px"')}</button><button class="${u.view === 'list' ? 'on' : ''}" data-action="crew-view" data-v="list" aria-label="List">${icon('list').replace('<svg', '<svg style="width:16px"')}</button></div>`)}
      <div class="players ${u.view === 'list' ? 'list' : ''}">
        ${list.length ? list.map(m => U.PlayerCard(m, { me: m.id === me.id })).join('') : '<div class="card empty-state"><div class="e">🕵️</div>Тохирох гишүүн олдсонгүй</div>'}
      </div>
      <div class="note mt">ℹ️ Avatar дээрх emoji = өнөө оройн төлөв. Ногоон цэг = сайтад онлайн (Demo). Steam/CS2 тоглож буй төлөв API холбогдоогүй тул харуулаагүй.</div>`;
  }

  const actions = {
    'crew-filter'(el) { ui().filter = el.dataset.v; return true; },
    'crew-view'(el) { ui().view = el.dataset.v; return true; }
  };
  function mount(root) {
    const q = root.querySelector('[data-crew-q]');
    q?.addEventListener('input', () => { ui().q = q.value; window.BerxApp.render(); });
  }
  window.BerxPages.crew = { render, actions, mount };
})();
