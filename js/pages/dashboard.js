/* Нүүр хуудас — Dashboard */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI, S = window.BerxStore;
  const { icon, esc, Avatar, CardHead, StatTile, Ring, AVAIL } = U;

  function countdownHTML(t) {
    const diff = t - Date.now();
    if (diff <= 0) return `<div class="chip win" style="height:34px;font-size:13px">🎮 Тоглолт эхэлсэн!</div>`;
    const h = Math.floor(diff / 3600000), m = Math.floor(diff / 60000) % 60, s = Math.floor(diff / 1000) % 60;
    return `<div class="countdown" data-countdown="${t}"><div><b>${U.pad(h)}</b><small>цаг</small></div><div><b>${U.pad(m)}</b><small>мин</small></div><div><b>${U.pad(s)}</b><small>сек</small></div></div>`;
  }

  function render() {
    const st = S.get(), me = A.me(), mems = A.members();
    const avail = st.availability;
    const ready = mems.filter(m => avail[m.id] === 'yes');
    const myStats = A.statsFor(me.id);
    const inv = A.activeInvites()[0];
    const top = A.leaderboard('premier', 'all').slice(0, 3);
    const shame = A.awards(0);
    const bot = shame.find(a => a.key === 'BOT'), late = shame.find(a => a.key === 'ALWAYS_LATE'), don = shame.find(a => a.key === 'ELO_DONATOR');
    const myAns = avail[me.id];
    const invYes = inv ? Object.values(inv.responses).filter(v => v === 'yes').length : 0;

    return `
      ${U.Hero({ kicker: 'CS2 · PREMIER · FACEIT · LAN', title: 'BERX', accent: 'CS2 CREW' })}
      <div class="dash-grid">
        <div class="card tonight">
          <div class="row" style="align-items:flex-start;gap:16px">
            <div style="flex:1">
              <span class="ico accent">${icon('cal')}</span>
              <h2 class="display" style="margin-top:6px">Өнөө орой<br>тоглох уу?</h2>
              <div class="muted" style="margin-top:8px;font-size:12.5px">Сонголтоо дар — бусад найзууд харна</div>
            </div>
            ${Ring(ready.length, 5, 'Бэлэн')}
          </div>
          <div class="opts">
            ${Object.entries(AVAIL).map(([k, v]) => `<button class="opt ${myAns === k ? 'on' : ''}" data-action="set-avail" data-val="${k}"><span class="e">${v.e}</span>${v.t}</button>`).join('')}
          </div>
          <div class="avstack mt">
            ${mems.filter(m => avail[m.id]).sort((a, b) => ['yes', 'late', 'maybe', 'no'].indexOf(avail[a.id]) - ['yes', 'late', 'maybe', 'no'].indexOf(avail[b.id]))
              .map(m => `<button data-action="open-profile" data-id="${m.id}" title="${esc(m.nick)} — ${AVAIL[avail[m.id]].s}">${Avatar(m, 44, { emo: AVAIL[avail[m.id]].e })}</button>`).join('')}
            <button class="slot" data-action="go" data-route="invite" title="Урилга үүсгэх"><span class="empty" style="width:44px;height:44px;font-size:20px">+</span></button>
          </div>
        </div>

        <div class="card">
          ${CardHead('invite', 'Өнөөдрийн идэвхтэй урилга', inv ? `<span class="chip accent type-${inv.type}">${inv.type}</span>` : '')}
          ${inv ? `
            <div class="row" style="gap:12px;margin-bottom:12px">${Avatar(A.member(inv.createdBy), 36)}<div style="flex:1;min-width:0"><b>${esc(A.member(inv.createdBy)?.nick)}</b> <span class="muted">урьж байна</span>
              <div class="muted" style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">“${esc(inv.message)}”</div></div></div>
            <div class="row between wrap" style="gap:12px">
              <div><div class="muted" style="font-size:12px;margin-bottom:6px">${U.fmtDate(inv.start)} · ${A.mapInfo(inv.map)?.name || 'Random'}</div>${countdownHTML(inv.start)}</div>
              <div style="text-align:right"><div class="display" style="font-size:30px"><span class="accent">${invYes}</span><span class="dim">/${inv.slots}</span></div><div class="muted" style="font-size:12px">лобби</div></div>
            </div>
            <div class="answer-bar mt">
              ${['yes', 'maybe', 'late', 'no'].map(k => `<button class="btn sm ${inv.responses[me.id] === k ? 'primary' : ''}" data-action="respond" data-inv="${inv.id}" data-val="${k}">${AVAIL[k].e} ${AVAIL[k].s}</button>`).join('')}
            </div>
            <button class="btn outline block mt" data-action="go" data-route="invite" data-inv="${inv.id}">Live lobby харах ${icon('arrow')}</button>
          ` : `<div class="empty-state"><div class="e">📭</div>Идэвхтэй урилга алга.<br><button class="btn primary mt" data-action="go" data-route="invite">${icon('plus')} Урилга үүсгэх</button></div>`}
        </div>

        <div class="card crew-card">
          ${CardHead('crew', `BERX баг <span class="muted" style="font-weight:500">(Онлайн ${mems.filter(m => A.presenceOf(m.id).site === 'online').length})</span>`, `<a class="link" href="#crew">Бүгд ${icon('arrow').replace('<svg', '<svg style="width:13px"')}</a>`)}
          <div class="list-rows">
            ${mems.slice(0, 6).map(m => `<button class="lr" style="text-align:left" data-action="open-profile" data-id="${m.id}">${Avatar(m, 36, { status: true })}
              <div style="flex:1;min-width:0"><div class="nm">${esc(m.nick)}</div>${U.StatusText(m.id)}</div>
              <span style="font-size:18px" title="${avail[m.id] ? AVAIL[avail[m.id]].s : 'Хариулаагүй'}">${avail[m.id] ? AVAIL[avail[m.id]].e : '<span class="dim" style="font-size:12px">—</span>'}</span>
              <span class="premier mono" style="font-weight:800">${(m.premier / 1000).toFixed(1)}k</span></button>`).join('')}
          </div>
        </div>
      </div>

      <div class="grid mt cols" style="--c:1.25fr 1fr">
        <div class="card">
          ${CardHead('stats', 'Миний статистик', `${U.DemoTag()}<a class="link" href="#stats">Бүрэн статистик ${icon('arrow').replace('<svg', '<svg style="width:13px"')}</a>`)}
          <div class="statrow">
            ${StatTile('Premier', `<span class="premier">${(myStats.premier ? myStats.premier.toLocaleString('en-US') : '—')}</span>`)}
            ${StatTile('FACEIT', `<span class="accent">${myStats.faceitElo.toLocaleString('en-US')}</span>`, null)}
            ${StatTile('K/D', myStats.kd.toFixed(2), myStats.delta.kd)}
            ${StatTile('HS%', myStats.hs + '%', myStats.delta.hs, { unit: '%' })}
            ${StatTile('Win Rate', `<span class="win">${myStats.wr}%</span>`, myStats.delta.wr, { unit: '%' })}
          </div>
        </div>
        <div class="card">
          ${CardHead('history', 'Сүүлийн тоглолтууд', `<a class="link" href="#stats">Бүгд ${icon('arrow').replace('<svg', '<svg style="width:13px"')}</a>`)}
          <div class="wl-row" style="grid-template-columns:repeat(5,1fr)">${myStats.last10.slice(0, 5).map(U.WLChip).join('')}</div>
          <div class="row mt" style="gap:4px">${myStats.last10.map(x => `<span class="wl-badge ${x.result}" style="width:24px;height:24px;font-size:11px">${x.result}</span>`).join('')}<span class="dim" style="font-size:11.5px;margin-left:6px">сүүлийн 10</span></div>
        </div>
      </div>

      <div class="grid mt cols" style="--c:1fr 1fr">
        <div class="card">
          ${CardHead('trophy', 'Leaderboard — Top 3', `<a class="link" href="#leaderboard">Бүгд ${icon('arrow').replace('<svg', '<svg style="width:13px"')}</a>`)}
          <div class="top3">${top.map((r, i) => `<button class="it" data-action="open-profile" data-id="${r.m.id}"><span class="medal g${i + 1}">${i + 1}</span>${Avatar(r.m, 34)}<b style="flex:1;text-align:left">${esc(r.m.nick)}</b><span class="premier mono" style="font-weight:800">${r.display}</span></button>`).join('')}</div>
        </div>
        <div class="card">
          ${CardHead('crown', 'Awards — энэ долоо хоног', `<a class="link" href="#awards">Үзэх ${icon('arrow').replace('<svg', '<svg style="width:13px"')}</a>`)}
          <div class="top3">
            ${[bot, don, late].filter(a => a && a.winner).map(a => `<div class="it"><span style="font-size:22px">${a.emoji}</span>${Avatar(a.winner.member, 34)}<div style="flex:1"><b>${esc(a.winner.member.nick)}</b> <span class="muted">— ${a.title}</span><div class="dim" style="font-size:11.5px">${esc(a.winner.value)}</div></div></div>`).join('')}
          </div>
        </div>
      </div>

      <div class="shortcuts mt">
        <a class="card hover shortcut" href="#leaderboard"><div class="txt">${icon('trophy', 'accent').replace('<svg', '<svg style="width:22px"')}<h3>Leaderboard</h3><p>BERX багийн дотоод чансаа</p></div><div class="art" style="--img:url(${window.BERX_MOCK.abs('assets/art/crown.jpg')})"></div></a>
        <a class="card hover shortcut" href="#awards"><div class="txt">${icon('crown', 'accent').replace('<svg', '<svg style="width:22px"')}<h3>Awards</h3><p>CARRY, AIM GOD, MVP... мөн BOT, AFK KING 😈</p></div><div class="art" style="--img:url(${window.BERX_MOCK.abs('assets/art/chicken.jpg')})"></div></a>
        <a class="card hover shortcut" href="#fun"><div class="txt">${icon('game', 'accent').replace('<svg', '<svg style="width:22px"')}<h3>Хөгжилдөх өрөө</h3><p>Map roulette, quiz, random challenge</p></div><div class="art" style="--img:url(${window.BERX_MOCK.abs('assets/art/dice.jpg')})"></div></a>
      </div>`;
  }

  let timer;
  function mount() {
    if (A.loadMatches && A.me()) A.loadMatches(A.me().id);
    clearInterval(timer);
    timer = setInterval(() => {
      document.querySelectorAll('[data-countdown]').forEach(el => {
        const t = +el.dataset.countdown, diff = t - Date.now();
        if (diff <= 0) { el.outerHTML = countdownHTML(t); return; }
        const b = el.querySelectorAll('b');
        b[0].textContent = U.pad(Math.floor(diff / 3600000));
        b[1].textContent = U.pad(Math.floor(diff / 60000) % 60);
        b[2].textContent = U.pad(Math.floor(diff / 1000) % 60);
      });
    }, 1000);
  }
  function unmount() { clearInterval(timer); }

  window.BerxPages = window.BerxPages || {};
  window.BerxPages.dashboard = { render, mount, unmount, countdownHTML };
})();
