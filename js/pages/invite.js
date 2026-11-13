/* Тоглох урилга — Play Invite */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI, S = window.BerxStore;
  const { icon, esc, Avatar, CardHead, AVAIL } = U;

  const TYPES = [
    { id: 'Premier', sub: 'Valve rating' }, { id: 'FACEIT', sub: 'ELO grind' },
    { id: 'LAN', sub: 'PC Club' }
  ];
  const MSGS = [
    'Өнөө орой {t} цагаас {type}. +100 ELO хийхгүй бол унтахгүй шүү муусайнуудаа.',
    'Stack ороод ELO нэмнэ шүү! 🔥 Хоцорсон хүн ALWAYS LATE шагнал авна.',
    '{type} {t}. Шалтаг хүлээж авахгүй 😤',
    'Нэг л тоглоод унтъя (4 тоглоно) 🌙',
    'Warmup 15 минут өмнө. Aim map заавал!'
  ];

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`; };
  function ui() {
    const app = window.BerxApp.ui;
    if (!app.invite) app.invite = { tab: 'active', selected: null, draft: null, excuse: {} };
    app.invite.excuse ||= {};
    if (!app.invite.draft) app.invite.draft = { type: 'FACEIT', date: today(), time: '21:00', slots: 5, map: 'mirage', randomMap: false, invited: A.members().map(m => m.id).filter(id => id !== A.me().id), message: '' };
    return app.invite;
  }

  function lobby(inv) {
    const me = A.me();
    const groups = { yes: [], maybe: [], late: [], no: [], none: [] };
    inv.invited.forEach(id => { const r = inv.responses[id]; (groups[r] || groups.none).push(id); });
    if (inv.responses[inv.createdBy] && !inv.invited.includes(inv.createdBy)) groups[inv.responses[inv.createdBy]].unshift(inv.createdBy);
    const yes = groups.yes.slice(0, inv.slots);
    const full = groups.yes.length >= inv.slots;
    const mp = A.maps.find(m => m.id === inv.map);
    const canAnswer = inv.status === 'active';
    return `
      <div class="card ${full ? 'glow' : ''}">
        ${CardHead('users', 'Live lobby', `<span class="display" style="font-size:24px"><span class="${full ? 'win' : 'accent'}">${groups.yes.length}</span><span class="dim"> / ${inv.slots}</span></span>`)}
        <div class="row wrap" style="gap:8px;margin-bottom:10px">
          <span class="chip accent type-${inv.type}">${inv.type}</span><span class="chip">${icon('cal').replace('<svg', '<svg style="width:13px"')} ${U.fmtDate(inv.start)}</span>
          <span class="chip">${icon('map').replace('<svg', '<svg style="width:13px"')} ${mp ? mp.name : 'Random'}</span>
          ${inv.status === 'cancelled' ? '<span class="chip loss">Цуцлагдсан</span>' : inv.start < Date.now() - 3 * 3600000 ? '<span class="chip">Дууссан</span>' : full ? '<span class="chip win">FULL STACK ✓</span>' : '<span class="chip warn">Бүрдэж байна</span>'}
        </div>
        <div class="muted" style="font-size:13px;margin-bottom:12px"><span style="display:inline-block;vertical-align:middle;margin-right:6px">${Avatar(A.member(inv.createdBy), 22)}</span><b style="color:#fff">${esc(A.member(inv.createdBy)?.nick)}</b>: “${esc(inv.message || '—')}”</div>
        <div class="lobby-slots">
          ${Array.from({ length: Math.min(inv.slots, 10) }).map((_, i) => yes[i]
            ? `<div class="slot filled">${Avatar(A.member(yes[i]), 66, { status: true, crown: yes[i] === inv.createdBy })}<span>${esc(A.member(yes[i]).nick)}</span></div>`
            : `<div class="slot"><span class="empty">+</span><span class="dim">Хоосон</span></div>`).join('')}
        </div>
        <div class="resp-groups">
          ${[['yes', '🔥 Тоглоно'], ['maybe', '🤔 Магадгүй'], ['late', '🐢 Хоцорно'], ['no', '💀 Тоглохгүй'], ['none', '⏳ Хариулаагүй']].map(([k, l]) => `
            <div class="resp-g"><h5><span>${l}</span><b>${groups[k].length}</b></h5><div class="mini">${groups[k].map(id => Avatar(A.member(id), 28)).join('')}</div></div>`).join('')}
        </div>
        ${excuseList(inv)}
        ${canAnswer ? `
          <div class="muted mt" style="font-size:12px;margin-bottom:8px">Таны хариулт</div>
          <div class="answer-bar">${['yes', 'maybe', 'late', 'no'].map(k => `<button class="btn ${inv.responses[me.id] === k ? 'primary' : ''}" data-action="respond" data-inv="${inv.id}" data-val="${k}">${AVAIL[k].e} ${AVAIL[k].s}</button>`).join('')}</div>
          ${['maybe', 'late', 'no'].includes(inv.responses[me.id]) ? excuseBox(inv) : ''}
          <div class="row mt wrap">
            ${full ? `<button class="btn primary" data-action="fullstack-demo" data-inv="${inv.id}">🎮 Тоглоом эхлүүлэх</button>` : `<button class="btn" disabled>🎮 Тоглоом эхлүүлэх (${groups.yes.length}/${inv.slots})</button>`}
            <button class="btn ghost" data-action="nudge" data-inv="${inv.id}">🔔 Хариулаагүйг сануулах</button>
            ${inv.createdBy === me.id ? `<button class="btn danger sm" style="margin-left:auto" data-action="cancel-invite" data-inv="${inv.id}">Цуцлах</button>` : ''}
          </div>` : ''}
      </div>`;
  }

  function excuseList(inv) {
    const ex = Object.entries(inv.excuses || {}).filter(([id]) => inv.responses[id] && inv.responses[id] !== 'yes' && A.member(id));
    if (!ex.length) return '';
    return `<div class="excuses mt"><div class="muted" style="font-size:12px;margin-bottom:6px">💬 Шалтгаанууд</div>
      ${ex.map(([id, t]) => `<div class="ex-row">${Avatar(A.member(id), 26)}<div><b>${esc(A.member(id).nick)}</b> <span class="dim">· ${AVAIL[inv.responses[id]].e} ${AVAIL[inv.responses[id]].s}</span><div>“${esc(t)}”</div></div></div>`).join('')}</div>`;
  }

  function excuseBox(inv) {
    const me = A.me(), cur = inv.excuses?.[me.id];
    const draft = ui().excuse[inv.id] ?? cur ?? '';
    const lbl = { maybe: 'Яагаад магадгүй гэж?', late: 'Яагаад хоцрох гэж?', no: 'Яагаад тоглохгүй гэж?' }[inv.responses[me.id]];
    return `<div class="excuse-box mt">
      <label for="lob-excuse" class="row between" style="font-size:12.5px;font-weight:700;margin-bottom:8px"><span>🎭 ${lbl} Шалтгаанаа бич</span><span class="dim" style="font-weight:500">${cur ? '✓ Илгээсэн' : 'Багийнхан харна'}</span></label>
      <textarea class="input" id="lob-excuse" data-inv="${inv.id}" rows="2" maxlength="140" placeholder="ж: Ажлаасаа оройтож гарна, 21:30-д орно">${esc(draft)}</textarea>
      <div class="row mt wrap" style="gap:8px">
        <button class="btn sm outline" data-action="gen-excuse" data-inv="${inv.id}">🎲 Шалтаг зохиож өг</button>
        <button class="btn sm primary" data-action="send-excuse" data-inv="${inv.id}" style="margin-left:auto">${icon('send')} ${cur ? 'Шинэчлэх' : 'Илгээх'}</button>
      </div></div>`;
  }

  function invItem(i, sel) {
    const yes = Object.values(i.responses).filter(v => v === 'yes').length;
    const me = A.me();
    const my = i.responses[me.id];
    const done = i.start < Date.now() - 3 * 3600000;
    const badge = i.status === 'cancelled' ? '<span class="chip loss">✕ Цуцлагдсан</span>'
      : done ? (yes >= i.slots ? '<span class="chip win">✓ Тоглосон</span>' : '<span class="chip">Дууссан</span>')
      : my ? `<span class="chip ${my === 'yes' ? 'win' : my === 'no' ? 'loss' : 'warn'}">${AVAIL[my].e} ${AVAIL[my].s}</span>` : '<span class="chip accent">Шинэ</span>';
    return `<div class="inv-item ${sel ? 'sel' : ''}" data-action="select-invite" data-inv="${i.id}">
      <span class="tic type-${i.type}">${i.type.slice(0, 3).toUpperCase()}</span>
      <div style="flex:1;min-width:0"><b>${i.type}</b> <span class="muted">· ${U.fmtDate(i.start)}</span><div class="dim" style="font-size:12px">${A.member(i.createdBy)?.nick} · ${yes}/${i.slots} тоглогч</div></div>${badge}</div>`;
  }

  function render() {
    const st = S.get(), me = A.me(), u = ui(), d = u.draft;
    const now = Date.now();
    let list;
    if (u.tab === 'active') list = st.invites.filter(i => i.status === 'active' && i.start > now - 3 * 3600000);
    else if (u.tab === 'received') list = st.invites.filter(i => i.invited.includes(me.id) && i.createdBy !== me.id);
    else list = st.invites.filter(i => i.status !== 'active' || i.start <= now - 3 * 3600000);
    list = [...list].sort((a, b) => b.start - a.start);
    if (!u.selected || !st.invites.find(i => i.id === u.selected)) u.selected = (A.activeInvites()[0] || st.invites[0] || {}).id;
    const sel = st.invites.find(i => i.id === u.selected);
    const msgLen = (d.message || '').length;

    return `
      ${U.Hero({ kicker: 'BERX CS2 CREW', title: 'PLAY', accent: 'INVITE' })}
      <div class="invite-grid">
        <form class="card" id="invite-form" autocomplete="off">
          ${CardHead('cal', 'Тоглох урилга үүсгэх')}
          <div class="type-pick">${TYPES.map(t => `<button type="button" class="${d.type === t.id ? 'on' : ''}" data-action="draft" data-k="type" data-v="${t.id}"><span class="type-${t.id}">${t.id.toUpperCase()}</span><small>${t.sub}</small></button>`).join('')}</div>
          <div class="grid mt" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">
            <div class="field"><label for="f-date">Өдөр</label><input class="input" type="date" id="f-date" data-draft="date" value="${d.date}" min="${today()}"></div>
            <div class="field"><label for="f-time">Эхлэх цаг</label><input class="input" type="time" id="f-time" data-draft="time" value="${d.time}"></div>
            <div class="field"><label for="f-slots">Тоглогч</label>${d.type === 'LAN'
              ? '<select class="input" id="f-slots" disabled title="LAN үед 10 хүн (5v5)"><option>10 · LAN 5v5</option></select>'
              : `<select class="input" id="f-slots" data-draft="slots">${[[2, 'Wingman 2v2'], [5, '5v5']].map(([v, l]) => `<option value="${v}" ${+d.slots === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</div>
          </div>
          <div class="row between mt" style="margin-bottom:8px"><label class="muted" style="font-size:12px;font-weight:600">Газрын зураг (Map)</label>
            <button type="button" class="row" data-action="draft" data-k="randomMap" data-v="${!d.randomMap}" style="gap:8px;font-size:12.5px">${icon('shuffle').replace('<svg', '<svg style="width:15px"')} Санамсаргүй <span class="toggle ${d.randomMap ? 'on' : ''}"></span></button></div>
          <div class="maps" style="${d.randomMap ? 'opacity:.35;pointer-events:none' : ''}">
            ${A.maps.map(m => `<button type="button" class="map-tile ${d.map === m.id ? 'on' : ''}" data-action="draft" data-k="map" data-v="${m.id}"><div class="im" style="${m.img ? `--img:url(${m.img})` : ''}"></div><span>${m.name}</span></button>`).join('')}
          </div>
          <div class="row between mt" style="margin-bottom:8px"><label class="muted" style="font-size:12px;font-weight:600">Урих найзууд (${d.invited.length})</label>
            <button type="button" class="link" data-action="draft-all">${d.invited.length === A.members().length - 1 ? 'Бүгдийг болиулах' : 'Бүгдийг урих'}</button></div>
          <div class="friend-pick">${A.members().filter(m => m.id !== me.id).map(m => `<button type="button" class="fp ${d.invited.includes(m.id) ? 'on' : ''}" data-action="draft-friend" data-id="${m.id}">${Avatar(m, 26, { status: true })}${esc(m.nick)}</button>`).join('')}</div>
          <div class="field mt"><label for="f-msg" class="row between"><span>Нэмэлт мессеж</span><button type="button" class="link" data-action="draft-msg">🎲 Санаа өг</button></label>
            <textarea class="input" id="f-msg" data-draft="message" maxlength="120" rows="2" placeholder="Жишээ: Өнөө орой stack ороод ELO нэмнэ шүү! 🔥">${esc(d.message)}</textarea>
            <div class="dim" style="font-size:11px;text-align:right" id="msg-count">${msgLen} / 120</div></div>
          <button class="btn primary lg block mt" type="submit" ${d.invited.length ? '' : 'disabled'}>${icon('send')} Урилга илгээх</button>
        </form>

        <div>
          ${sel ? lobby(sel) : '<div class="card empty-state"><div class="e">🎮</div>Урилга сонгоно уу</div>'}
          <div class="card mt">
            ${CardHead('history', 'Урилгууд')}
            <div class="seg" style="margin-bottom:8px">${[['active', 'Идэвхтэй'], ['received', 'Ирсэн'], ['history', 'Түүх']].map(([k, l]) => `<button class="${u.tab === k ? 'on' : ''}" data-action="inv-tab" data-tab="${k}">${l}</button>`).join('')}</div>
            ${list.length ? list.map(i => invItem(i, i.id === u.selected)).join('') : '<div class="empty-state">Энд урилга алга</div>'}
          </div>
        </div>

        <div class="card crew-side">
          ${CardHead('crew', 'BERX Crew', `<span class="win" style="font-size:12.5px;font-weight:700">${A.members().filter(m => A.presenceOf(m.id).site === 'online').length} онлайн</span>`)}
          <div class="list-rows">
            ${A.members().map(m => `<div class="lr">${Avatar(m, 38, { status: true })}<div style="flex:1;min-width:0"><div class="nm">${esc(m.nick)}</div>${U.StatusText(m.id)}</div>
              ${m.id === me.id ? '<span class="chip accent">Та</span>' : `<button class="btn sm ghost" data-action="quick-invite" data-id="${m.id}" title="Урих">${icon('plus')}</button>`}</div>`).join('')}
          </div>
          <div class="note mt">ℹ️ ${A.isLive() ? 'Ногоон = сайтад онлайн. 🎮 CS2 тоглож байна гэсэн тэмдэг Steam-ээс бодитоор ирнэ (Steam profile нийтэд нээлттэй бол).' : 'Онлайн төлөв нь энэ сайтын төлөв (Demo). Steam/CS2 дээр тоглож буй эсэх нь Steam Web API холбогдсоны дараа тусад нь харагдана.'}</div>
        </div>
      </div>`;
  }

  const actions = {
    draft(el) { const d = ui().draft; let v = el.dataset.v; if (v === 'true' || v === 'false') v = v === 'true'; d[el.dataset.k] = v;
      if (el.dataset.k === 'type') d.slots = v === 'LAN' ? 10 : (+d.slots === 10 ? 5 : d.slots); return true; },
    'draft-all'() { const d = ui().draft, all = A.members().map(m => m.id).filter(id => id !== A.me().id); d.invited = d.invited.length === all.length ? [] : all; return true; },
    'draft-friend'(el) { const d = ui().draft, id = el.dataset.id; d.invited = d.invited.includes(id) ? d.invited.filter(x => x !== id) : [...d.invited, id]; return true; },
    'draft-msg'() { const d = ui().draft; d.message = MSGS[Math.floor(Math.random() * MSGS.length)].replace('{t}', d.time).replace('{type}', d.type); return true; },
    'inv-tab'(el) { ui().tab = el.dataset.tab; return true; },
    'select-invite'(el) { ui().selected = el.dataset.inv; return true; },
    'quick-invite'(el) { const d = ui().draft; if (!d.invited.includes(el.dataset.id)) d.invited.push(el.dataset.id); document.getElementById('invite-form')?.scrollIntoView({ behavior: 'smooth' }); window.BerxApp.toast(`${A.member(el.dataset.id).nick} урилгын жагсаалтад нэмэгдлээ`, '➕'); return true; },
    'cancel-invite'(el) { window.BerxApp.confirm('Урилгыг цуцлах уу?', () => { A.cancelInvite(el.dataset.inv); A.notify('Урилга цуцлагдлаа', '✕', 'invite'); }); },
    nudge(el) {
      const inv = S.get().invites.find(i => i.id === el.dataset.inv);
      const pend = inv.invited.filter(id => !inv.responses[id]).map(id => A.member(id).nick);
      window.BerxApp.toast(pend.length ? `Сануулга илгээлээ: ${pend.join(', ')} (demo)` : 'Бүгд хариулсан байна 👌', '🔔');
    },
    'fullstack-demo'(el) { const inv = S.get().invites.find(i => i.id === el.dataset.inv); window.BerxApp.fullStack(inv?.slots); },
    'gen-excuse'(el) { ui().excuse[el.dataset.inv] = A.genExcuse(); return true; },
    'send-excuse'(el) {
      const t = (ui().excuse[el.dataset.inv] ?? document.getElementById('lob-excuse')?.value ?? '').trim();
      if (!t) { window.BerxApp.toast('Шалтгаанаа бичнэ үү ✍️', '⚠️'); return; }
      A.setExcuse(el.dataset.inv, t); delete ui().excuse[el.dataset.inv]; window.BerxApp.toast('Шалтгаан илгээгдлээ. EXCUSE MASTER-т +1 😏', '🎭');
    }
  };

  function submit(e) {
    e.preventDefault();
    const d = ui().draft;
    const [h, m] = d.time.split(':').map(Number);
    const dt = new Date(d.date + 'T00:00:00'); dt.setHours(h, m, 0, 0);
    if (dt.getTime() < Date.now() - 5 * 60000) { window.BerxApp.toast('Өнгөрсөн цаг сонгосон байна ⏰', '⚠️'); return; }
    const map = d.randomMap ? A.maps[Math.floor(Math.random() * A.maps.length)].id : d.map;
    const inv = A.createInvite({ type: d.type, start: dt.getTime(), slots: d.type === 'LAN' ? 10 : +d.slots, map, invited: [...d.invited], message: d.message.trim() || `${d.type} ${d.time}. Ирээрэй!` });
    ui().selected = inv.id; ui().tab = 'active';
    ui().draft = null;
    window.BerxApp.render();
    A.simulateResponses(inv.id);
  }

  function mount(root) {
    const form = root.querySelector('#invite-form');
    if (form) form.addEventListener('submit', submit);
    root.querySelectorAll('[data-draft]').forEach(el => el.addEventListener('input', () => {
      ui().draft[el.dataset.draft] = el.value;
      if (el.dataset.draft === 'message') { const c = root.querySelector('#msg-count'); if (c) c.textContent = el.value.length + ' / 120'; }
    }));
    const ex = root.querySelector('#lob-excuse');
    ex?.addEventListener('input', () => { ui().excuse[ex.dataset.inv] = ex.value; });
  }

  window.BerxPages = window.BerxPages || {};
  window.BerxPages.invite = { render, mount, actions, ui };
})();
