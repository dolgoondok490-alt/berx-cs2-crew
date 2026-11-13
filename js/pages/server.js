/* SERVER — BERX ARENA (CS2 private dedicated server) */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI, S = window.BerxStore;
  const { icon, esc, Avatar, CardHead } = U;
  const ui = () => (window.BerxApp.ui.server ||= { data: null, loading: false, error: null, busy: {}, form: {} });
  const PHASE = { warmup: ['Warmup', 'warn'], live: ['LIVE', 'win'], finished: ['Finished', ''], practice: ['Practice', 'accent'], unknown: ['—', ''] };
  const MODE = { competitive: 'Competitive 5v5', wingman: 'Wingman 2v2', '1v1': '1v1', practice: 'Practice' };

  async function fetchState() {
    const u = ui();
    if (!A.isLive()) { u.data = { configured: false, online: false, demo: true }; return; }
    u.loading = true;
    try {
      const r = await fetch('api/server/state', { credentials: 'same-origin', cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      u.data = j; u.error = null;
    } catch (e) { u.error = e.message; }
    finally { u.loading = false; }
    if (window.BerxApp.route === 'server') window.BerxApp.render();
  }

  async function act(type, payload, okMsg) {
    if (!A.isLive()) return window.BerxApp.toast('Preview (demo) горимд сервер холбогдохгүй', 'ℹ️');
    try {
      const r = await fetch('api/action', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      if (okMsg) window.BerxApp.toast(okMsg, '✅');
    } catch (e) { window.BerxApp.toast(e.message, '⚠️'); }
    fetchState();
  }
  const cmd = (type, args, label) => act('server.cmd', { type, args }, `${label || type} — серверт илгээгдлээ (дараалалд)`);

  function statusCard(d) {
    const s = d.server, me = A.me();
    if (d.demo) return `<div class="card srv-offline"><div class="srv-dot off"></div><div><div class="display" style="font-size:24px">NOT CONFIGURED</div><div class="muted">Энэ бол preview (demo). Бодит сервер зөвхөн Vercel дээрх сайтад холбогдоно.</div></div></div>`;
    if (!d.configured) return `<div class="card srv-offline"><div class="srv-dot off"></div><div><div class="display" style="font-size:24px">NOT CONFIGURED</div><div class="muted">Сервер холбогдоогүй байна. ${me && me.admin ? 'Vercel дээр <code>SERVER_AGENT_SECRET</code> тохируулаад таны компьютер дээр BERX Agent-ийг асаана (agent/README.md).' : 'Admin серверийг тохируулахыг хүлээнэ үү.'}</div></div></div>`;
    if (!d.online) return `<div class="card srv-offline"><div class="srv-dot off"></div><div><div class="display" style="font-size:24px">OFFLINE</div><div class="muted">${d.lastSeen ? 'Сүүлд ' + U.timeAgo(d.lastSeen) + ' холбогдсон.' : 'Agent хараахан холбогдоогүй байна.'} Сервер эсвэл BERX Agent асаалттай эсэхийг шалгана уу.</div></div></div>`;
    const mp = s.map ? A.mapInfo(String(s.map).replace(/^(de|cs)_/, '')) : null;
    const [ph, phCls] = PHASE[s.phase] || PHASE.unknown;
    return `<div class="card srv-status" style="${mp && mp.img ? `--img:url(${mp.img})` : ''}">
      <div class="srv-status-bg"></div>
      <div class="srv-row">
        <div class="srv-dot on"></div>
        <div><div class="display" style="font-size:22px;color:var(--win)">ONLINE</div><div class="muted" style="font-size:12px">${esc(s.hostname || 'BERX ARENA')}${s.matchzy ? ' · MatchZy' : ''}</div></div>
        <span class="chip ${phCls}" style="margin-left:auto">${ph}</span>
      </div>
      <div class="srv-grid">
        <div><div class="kpi-label">Map</div><div class="big-num" style="font-size:28px">${esc(mp ? mp.name : (s.map || '—'))}</div></div>
        <div><div class="kpi-label">Тоглогч</div><div class="big-num" style="font-size:28px">${s.playerCount ?? '—'}<span class="dim" style="font-size:18px">${s.maxPlayers ? ' / ' + s.maxPlayers : ''}</span></div>${s.bots ? `<div class="dim" style="font-size:11.5px">+${s.bots} bot</div>` : ''}</div>
        <div><div class="kpi-label">Горим</div><div style="font-weight:800;font-size:16px;margin-top:6px">${esc(MODE[s.mode] || s.mode || '—')}</div></div>
        <div class="srv-score">${s.score ? `<span class="ct">CT</span><b class="ct">${s.score.ct}</b><span class="dim">:</span><b class="t">${s.score.t}</b><span class="t">T</span>` : '<span class="dim">Оноо —</span>'}</div>
      </div>
      ${d.connect ? `<div class="row wrap mt" style="gap:10px">
        <a class="btn primary lg" href="${esc(d.connect.steamUrl)}">${icon('game')} Серверт холбогдох</a>
        <button class="btn lg" data-action="srv-copy" data-text="${esc(d.connect.command)}">${icon('copy')} Connect команд хуулах</button>
        <code class="srv-code">connect ${esc(d.connect.address)}${d.connect.hasPassword ? '; password ••••••' : ''}</code>
      </div>` : '<div class="dim mt" style="font-size:12px">Холбогдох хаяг тохируулаагүй (agent-ийн PUBLIC_ADDRESS).</div>'}
    </div>`;
  }

  function mapVote(d) {
    const me = A.me(), online = d.online;
    const total = Object.values(d.votes || {}).reduce((a, b) => a + b, 0);
    const cur = d.server && d.server.map ? String(d.server.map).replace(/^(de|cs)_/, '') : null;
    return `<div class="card">
      ${CardHead('map', 'Map сонгох', `<span class="muted" style="font-size:12px">${total} санал</span>`)}
      <div class="srv-maps">${(d.maps || A.LAN_MAPS).map(id => {
        const m = A.mapInfo(id), n = (d.votes || {})[id] || 0, mine = d.myVote === id, pct = total ? Math.round(n / total * 100) : 0;
        return `<div class="srv-map ${mine ? 'mine' : ''} ${cur === id ? 'current' : ''}">
          <button class="srv-map-pic" data-action="srv-vote" data-map="${id}" aria-pressed="${mine}" style="${m.img ? `--img:url(${m.img})` : ''}">
            ${cur === id ? '<span class="srv-now">● ОДОО</span>' : ''}<span class="nm">${esc(m.name)}</span></button>
          <div class="srv-vote-bar"><i style="width:${pct}%"></i></div>
          <div class="row between" style="font-size:12px;margin-top:4px"><span class="${mine ? 'accent' : 'muted'}">${mine ? '✓ Таны санал' : 'Санал өгөх'}</span><b>${n}</b></div>
          ${me && me.admin ? `<button class="btn sm outline block" style="margin-top:6px" data-action="srv-cmd" data-type="changemap" data-arg-map="${id}" ${online ? '' : 'disabled'}>Серверт тавих</button>` : ''}
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  function teamCol(d, team) {
    const me = A.me(), list = (d.teams && d.teams[team]) || [], cap = (d.cap || {})[team] || 5;
    const mine = list.some(p => p.userId === me.id);
    const full = list.length >= cap;
    const live = (d.server && d.server.players) || [];
    const name = team === 'CT' ? 'Counter-Terrorists' : 'Terrorists';
    return `<div class="team-col ${team.toLowerCase()}">
      <div class="team-head"><span class="team-badge">${team}</span><b>${name}</b><span class="dim" style="margin-left:auto">${list.length}/${cap}</span></div>
      <div class="team-slots">
        ${Array.from({ length: cap }).map((_, i) => { const p = list[i]; if (!p) return '<div class="team-slot empty"><span>Хоосон</span></div>';
          const m = A.member(p.userId); const inSrv = p.steamId && live.some(x => x.steamId === p.steamId);
          return `<div class="team-slot">${Avatar(m || { nick: p.nick }, 34)}<div style="min-width:0;flex:1"><b>${esc(p.nick)}</b><div class="dim" style="font-size:11px">${p.steamId ? (inSrv ? '<span class="win">● Серверт байна</span>' : 'Steam ✓') : '<span class="loss">Steam ID алга</span>'}</div></div>
            ${me.admin ? moveSelect(p.userId, team) : ''}</div>`; }).join('')}
      </div>
      ${mine ? `<button class="btn block" data-action="srv-leave">Багаас гарах</button>` : `<button class="btn ${team === 'CT' ? 'ct-btn' : 't-btn'} block" data-action="srv-join" data-team="${team}" ${full ? 'disabled' : ''}>${full ? 'Баг дүүрсэн' : 'Нэгдэх'}</button>`}
    </div>`;
  }
  function moveSelect(userId, cur) {
    return `<select class="input srv-move" data-srv-move="${userId}" aria-label="Баг солих">${[['CT', 'CT'], ['T', 'T'], ['SPEC', 'Spec'], ['NONE', 'Хасах']].map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  }

  function teamsCard(d) {
    const me = A.me();
    const spec = (d.teams && d.teams.SPEC) || [];
    const mySpec = spec.some(p => p.userId === me.id);
    const pendingApply = d.teamsVersion && d.appliedTeamsVersion !== d.teamsVersion;
    return `<div class="card">
      ${CardHead('crew', 'Баг сонгох', me.admin ? `<button class="btn sm" data-action="srv-shuffle">${icon('shuffle')} Санамсаргүй хуваах</button><button class="btn sm primary" data-action="srv-cmd" data-type="apply_teams" ${d.online ? '' : 'disabled'} title="MatchZy-аар SteamID64-ээр түгжинэ">${icon('send')} Серверт хэрэгжүүлэх</button>` : '')}
      ${!me.steamId ? '<div class="note warn mb">⚠️ CT/T багт нэгдэхийн тулд Steam ID холбох шаардлагатай (Тохиргоо → Профайл). Сервер таныг SteamID64-ээр таньж багт оруулна.</div>' : ''}
      <div class="teams-grid">${teamCol(d, 'CT')}<div class="vs display">VS</div>${teamCol(d, 'T')}</div>
      <div class="spec-row">
        <span class="team-badge spec">SPEC</span>
        <div class="row wrap" style="gap:8px;flex:1">${spec.length ? spec.map(p => `<span class="fp on">${Avatar(A.member(p.userId) || { nick: p.nick }, 22)}${esc(p.nick)}${me.admin ? moveSelect(p.userId, 'SPEC') : ''}</span>`).join('') : '<span class="dim" style="font-size:12.5px">Spectator алга</span>'}</div>
        ${mySpec ? '<button class="btn sm" data-action="srv-leave">Гарах</button>' : '<button class="btn sm" data-action="srv-join" data-team="SPEC">👁 Spectator</button>'}
      </div>
      ${me.admin && pendingApply ? `<div class="note mt">ℹ️ Сайт дээрх баг өөрчлөгдсөн. «Серверт хэрэгжүүлэх» дарахад MatchZy тоглогчдыг SteamID64-ээр нь багт түгжинэ (буруу багт орох боломжгүй).</div>` : ''}
    </div>`;
  }

  function adminPanel(d) {
    const s = d.server || {}, f = ui().form, dis = d.online ? '' : 'disabled';
    const st = s.settings || {};
    const numRow = (type, label, min, max, unit, cur) => `<div class="adm-row"><label for="srv-${type}">${label}${cur !== undefined && cur !== null ? ` <span class="dim">(одоо ${esc(cur)})</span>` : ''}</label>
      <div class="row" style="gap:6px"><input class="input" id="srv-${type}" type="number" min="${min}" max="${max}" value="${esc(f[type] ?? '')}" data-srv-form="${type}" placeholder="${min}–${max}${unit ? ' ' + unit : ''}" style="height:36px"><button class="btn sm primary" data-action="srv-num" data-type="${type}" ${dis}>Тавих</button></div></div>`;
    const togRow = (type, label) => `<div class="adm-row"><span>${label}</span><div class="seg"><button data-action="srv-cmd" data-type="${type}" data-arg-value="1" ${dis}>ON</button><button data-action="srv-cmd" data-type="${type}" data-arg-value="0" ${dis}>OFF</button></div></div>`;
    const live = (s.players || []).filter(p => !p.bot);
    return `<div class="card adm-panel">
      ${CardHead('gear', 'Admin Server Control', '<span class="chip accent">ADMIN</span>')}
      ${!d.online ? '<div class="note warn mb">Сервер offline — командууд идэвхгүй.</div>' : ''}
      <div class="adm-grid">
        <div class="adm-box">
          <h4>Горим</h4>
          <div class="seg" style="flex-wrap:wrap">${Object.entries(MODE).map(([k, l]) => `<button class="${s.mode === k ? 'on' : ''}" data-action="srv-cmd" data-type="mode" data-arg-value="${k}" ${dis}>${l}</button>`).join('')}</div>
          <h4 class="mt">Match</h4>
          <div class="row wrap" style="gap:6px">
            <button class="btn sm" data-action="srv-cmd" data-type="warmup_start" ${dis}>Warmup эхлүүлэх</button>
            <button class="btn sm" data-action="srv-cmd" data-type="warmup_end" ${dis}>Warmup дуусгах</button>
            <button class="btn sm primary" data-action="srv-cmd" data-type="match_start" ${dis}>▶ Match эхлүүлэх</button>
            <button class="btn sm" data-action="srv-cmd" data-type="match_restart" ${dis}>↻ Restart</button>
            <button class="btn sm danger" data-action="srv-cmd" data-type="match_stop" ${dis}>■ Зогсоох</button>
          </div>
          <h4 class="mt">Bot</h4>
          <div class="row wrap" style="gap:6px">
            <button class="btn sm ct-btn" data-action="srv-cmd" data-type="bot_add" data-arg-team="CT" ${dis}>+ CT bot</button>
            <button class="btn sm t-btn" data-action="srv-cmd" data-type="bot_add" data-arg-team="T" ${dis}>+ T bot</button>
            <button class="btn sm" data-action="srv-cmd" data-type="bot_kick" ${dis}>Бүх bot хасах</button>
          </div>
        </div>
        <div class="adm-box">
          <h4>Тохиргоо</h4>
          ${numRow('roundtime', 'Round time', 1, 60, 'мин', st.mp_roundtime)}
          ${numRow('maxrounds', 'Max rounds', 1, 60, '', st.mp_maxrounds)}
          ${numRow('startmoney', 'Start money', 0, 60000, '$', st.mp_startmoney)}
          ${numRow('freezetime', 'Freeze time', 0, 60, 'сек', st.mp_freezetime)}
        </div>
        <div class="adm-box">
          <h4>Сонголт</h4>
          ${togRow('friendlyfire', 'Friendly fire')}${togRow('overtime', 'Overtime')}${togRow('knife', 'Knife round')}${togRow('infinite_ammo', 'Infinite ammo')}
          <h4 class="mt">Тоглогч kick</h4>
          ${live.length ? live.map(p => `<div class="adm-row"><span>${esc(p.name)} ${p.team ? `<span class="chip" style="height:18px;font-size:10px">${p.team}</span>` : ''}</span>${p.steamId ? `<button class="btn sm danger" data-action="srv-kick" data-steam="${p.steamId}" data-name="${esc(p.name)}" ${dis}>Kick</button>` : '<span class="dim" style="font-size:11px">SteamID алга</span>'}</div>`).join('') : '<div class="dim" style="font-size:12.5px">Серверт тоглогч алга</div>'}
        </div>
      </div>
      <h4 class="mt">Командын түүх</h4>
      <div class="cmd-log">${(d.commands || []).length ? d.commands.map(c => `<div class="cmd-row"><span class="chip ${c.status === 'done' ? 'win' : c.status === 'failed' ? 'loss' : 'warn'}" style="height:20px;font-size:10.5px">${c.status}</span><b>${esc(c.label)}</b><span class="dim mono">${esc(Object.values(c.args || {}).join(' '))}</span><span class="dim" style="margin-left:auto;font-size:11px">${U.timeAgo(c.createdAt)}</span>${c.output && c.status === 'failed' ? `<div class="loss" style="width:100%;font-size:11.5px">${esc(c.output)}</div>` : ''}</div>`).join('') : '<div class="dim" style="font-size:12.5px">Команд алга</div>'}</div>
    </div>`;
  }

  function render() {
    const u = ui(), me = A.me();
    if (!u.data && !u.loading) { u.loading = true; setTimeout(fetchState, 0); }
    const d = u.data;
    return `
      ${U.Hero({ kicker: 'BERX CS2 CREW · PRIVATE SERVER', title: 'BERX', accent: 'ARENA', lead: 'Манай хувийн CS2 сервер — map сонго, багт нэгд, нэг товчоор холбогд.' })}
      ${u.error ? `<div class="note warn mb">⚠️ ${esc(u.error)}${/does not exist|PGRST205|schema cache/.test(u.error) ? ' — Supabase дээр supabase/003_server.sql ажиллуулна уу.' : ''}</div>` : ''}
      ${!d ? '<div class="card empty-state"><div class="e">⏳</div>Серверийн төлөв ачаалж байна...</div>' : `
      ${statusCard(d)}
      <div class="grid mt cols" style="--c:1fr 1.15fr">${mapVote(d)}${teamsCard(d)}</div>
      ${d.online && d.server && d.server.players && d.server.players.length ? `<div class="card mt">${CardHead('users', 'Серверт байгаа тоглогчид')}<div class="row wrap" style="gap:8px">${d.server.players.map(p => `<span class="chip ${p.team === 'CT' ? 'ct-chip' : p.team === 'T' ? 't-chip' : ''}">${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.ping !== null && p.ping !== undefined && !p.bot ? ` · ${p.ping}ms` : ''}</span>`).join('')}</div></div>` : ''}
      ${me && me.admin ? `<div class="mt">${adminPanel(d)}</div>` : ''}`}`;
  }

  const actions = {
    'srv-vote'(el) { act('server.vote', { map: el.dataset.map }); },
    'srv-join'(el) { act('server.join', { team: el.dataset.team }, el.dataset.team === 'SPEC' ? 'Spectator боллоо 👁' : `${el.dataset.team} багт нэгдлээ`); },
    'srv-leave'() { act('server.leave', {}); },
    'srv-shuffle'() { window.BerxApp.confirm('CT/T багийн гишүүдийг санамсаргүй хуваах уу?', () => act('server.shuffle', {}, 'Баг санамсаргүй хуваагдлаа 🎲')); },
    'srv-cmd'(el) {
      const args = {}; Object.keys(el.dataset).filter(k => k.startsWith('arg')).forEach(k => { args[k.slice(3).toLowerCase()] = el.dataset[k]; });
      const type = el.dataset.type, label = (ui().data && ui().data.commandTypes && ui().data.commandTypes[type]) || type;
      const danger = ['match_stop', 'match_restart', 'changemap', 'mode'].includes(type);
      if (danger) window.BerxApp.confirm(`«${label}${args.map ? ' → ' + A.mapInfo(args.map).name : args.value ? ' → ' + args.value : ''}» — серверт илгээх үү?`, () => cmd(type, args, label));
      else cmd(type, args, label);
    },
    'srv-num'(el) {
      const type = el.dataset.type, v = document.getElementById('srv-' + type)?.value;
      if (v === '' || v === undefined) return window.BerxApp.toast('Утга оруулна уу', '⚠️');
      cmd(type, { value: v }, (ui().data.commandTypes || {})[type]);
    },
    'srv-kick'(el) { window.BerxApp.confirm(`${el.dataset.name}-г серверээс kick хийх үү?`, () => cmd('kick', { steamId: el.dataset.steam }, 'Kick')); },
    'srv-copy'(el) { (navigator.clipboard?.writeText(el.dataset.text) || Promise.reject()).then(() => window.BerxApp.toast('Connect команд хуулагдлаа — CS2 console-д paste хийнэ (~ товч)', '📋')).catch(() => window.BerxApp.toast('Хуулах боломжгүй', '⚠️')); }
  };

  let timer = null;
  const onPing = () => fetchState();
  function mount(root) {
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden && window.BerxApp.route === 'server') fetchState(); }, 6000);
    document.removeEventListener('berx:server', onPing); document.addEventListener('berx:server', onPing);
    root.querySelectorAll('[data-srv-form]').forEach(el => el.addEventListener('input', () => { ui().form[el.dataset.srvForm] = el.value; }));
    root.querySelectorAll('[data-srv-move]').forEach(el => el.addEventListener('change', () => act('server.move', { userId: el.dataset.srvMove, team: el.value }, 'Баг солигдлоо')));
  }
  function unmount() { clearInterval(timer); document.removeEventListener('berx:server', onPing); ui().data = null; }

  window.BerxPages.server = { render, mount, unmount, actions, fetchState };
})();
