/* BERX Match History — BERX ARENA серверийн тоглолтын түүх + тоглолтын дэлгэрэнгүй (scoreboard)
 * Өгөгдөл: /api/berx/* (зөвхөн BERX Agent-ийн илгээсэн албан ёсны дүн). Бүртгэгдээгүй утгыг (ADR, MVP) зохиохгүй — "—". */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI;
  const { icon, esc, Hero, CardHead } = U;
  const MODE = { competitive: 'Competitive 5v5', aim1v1: 'AIM 1v1', aim2v2: 'AIM 2v2' };
  const STATUS = { completed: 'Дууссан', aborted: 'Зогсоосон', interrupted: 'Тасалдсан' };
  const REASON = { restarted: 'Тоглолтыг дахин эхлүүлсэн', returned_to_competitive: 'Competitive руу буцсан', mode_changed: 'Горим солигдсон',
    map_changed: 'Map солигдсон', server_offline: 'Сервер унтарсан', agent_restart: 'BERX Agent дахин асаагдсан — зарим үйл явдал бүртгэгдээгүй байж болно',
    no_events: 'Серверээс мэдээлэл ирэхээ больсон', warmup: 'Warmup руу орсон', ended_before_target: 'Зорилтот оноонд хүрэлгүй дууссан' };
  const FILTERS = [['all', 'Бүгд'], ['competitive', 'Competitive'], ['aim1v1', 'AIM 1v1'], ['aim2v2', 'AIM 2v2'], ['mine', 'Миний тоглолтууд']];
  const WEAPON = { ak47: 'AK-47', m4a4: 'M4A4', m4a1s: 'M4A1-S', awp: 'AWP' };
  const ui = () => (window.BerxApp.ui.matches ||= { filter: 'all', items: [], next: null, loading: false, error: null, key: null, more: false, needSteam: false });
  const cache = {};   // тоглогчийн BERX статистик: `${steam}|${mode}` → { loading, data, error }

  const get = (p) => fetch('api/berx/' + p, { credentials: 'same-origin', cache: 'no-store' }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Алдаа'), { status: r.status }); return j; });
  const rerender = () => window.BerxApp.render();
  const has = (v) => v !== null && v !== undefined;

  /* ---------- туслах ---------- */
  function mapOf(m) {
    const name = String(m.map || '').replace(/^de_/, '');
    const info = A.mapInfo(name);
    const pretty = m.workshop_id ? (m.map_title || m.map) : info.name;   // Workshop: catalog-ийн нэр (Aim_map1v1cfg)
    return { name: pretty, img: m.image || info.img || null };
  }
  const dur = (s) => { if (!has(s)) return '—'; const h = Math.floor(s / 3600), mi = Math.floor(s % 3600 / 60); return h ? `${h}ц ${mi}м` : `${mi || (s ? '<1' : 0)} мин`; };
  // fmtDate нь өнөөдөр/өчигдөр бол цагийг өөрөө оруулдаг — давхардуулахгүй
  const when = (t) => { const d = new Date(+t), f = U.fmtDate(d); return /\d:\d\d/.test(f) ? f : `${f} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const kd = (k, d) => (d ? k / d : k);
  const pct = (a, b) => (b ? Math.round(a / b * 100) : null);
  function resultChip(m) {
    if (m.me && m.me.result) return `<span class="mh-res ${m.me.result}">${{ win: 'Хожсон', loss: 'Хожигдсон', draw: 'Тэнцсэн' }[m.me.result]}</span>`;
    if (m.status !== 'completed') return `<span class="mh-res st ${m.status}">${STATUS[m.status]}</span>`;
    return m.winner === 'draw' ? '<span class="mh-res draw">Тэнцсэн</span>' : `<span class="mh-res side ${m.winner === 'CT' ? 'ct' : 't'}">${m.winner} ялсан</span>`;
  }
  function score(m) {
    const w = m.status === 'completed' ? m.winner : null;
    return `<span class="mh-score"><b class="ct ${w === 'CT' ? 'won' : ''}">${m.score_ct}</b><i>:</i><b class="t ${w === 'T' ? 'won' : ''}">${m.score_t}</b></span>`;
  }
  function row(m) {
    const mp = mapOf(m);
    return `<button class="mh-row" data-action="mh-open" data-id="${esc(m.id)}" aria-label="${esc(mp.name)} тоглолтын дэлгэрэнгүй">
      <span class="mh-thumb" style="${mp.img ? `--img:url('${esc(mp.img)}')` : ''}"></span>
      <span class="mh-main"><b>${esc(mp.name)}</b><span class="mh-sub"><span class="mh-mode ${esc(m.mode)}">${MODE[m.mode] || esc(m.mode)}</span>${m.aim_weapon ? `<span class="dim">${WEAPON[m.aim_weapon] || ''} · first to ${m.target_rounds}</span>` : ''}</span></span>
      ${score(m)}
      <span class="mh-meta"><span>${when(m.started_at)}</span><span class="dim">${dur(m.duration_s)} · ${m.player_count} тоглогч</span></span>
      ${resultChip(m)}
    </button>`;
  }

  /* ---------- жагсаалт ---------- */
  function load(reset) {
    const u = ui(); const key = u.filter;
    if (reset) { u.items = []; u.next = null; u.error = null; u.needSteam = false; u.loaded = null; }
    u.loading = true; u.key = key;
    const q = new URLSearchParams({ limit: '15' });
    if (key === 'mine') q.set('mine', '1'); else if (key !== 'all') q.set('mode', key);
    if (!reset && u.next) q.set('before', u.next);
    get('matches?' + q).then(j => {
      if (u.key !== key) return;
      u.items = reset ? j.items : u.items.concat(j.items); u.next = j.next; u.needSteam = !!j.needSteam; u.loaded = key;
    }).catch(e => { if (u.key === key) u.error = e.status === 401 ? 'Нэвтрэх шаардлагатай.' : 'Тоглолтын түүх ачаалагдсангүй. Дахин оролдоно уу.'; })
      .finally(() => { if (u.key === key) { u.loading = false; if (location.hash === '#matches') rerender(); } });
  }

  function render() {
    const u = ui();
    const head = Hero({ kicker: 'BERX ARENA ///', title: 'ТОГЛОЛТЫН', accent: 'ТҮҮХ', lead: 'BERX ARENA серверт тоглосон Competitive болон AIM тоглолтууд — серверээс шууд бүртгэгдсэн бодит дүн.' });
    if (!A.isLive()) return head + '<div class="card empty-state"><div class="e">🛰️</div>Тоглолтын түүх зөвхөн BERX ARENA сервертэй холбогдсон сайтад харагдана.</div>';
    const tabs = `<div class="tabs mh-tabs" role="tablist">${FILTERS.map(([k, l]) => `<button role="tab" aria-selected="${u.filter === k}" class="${u.filter === k ? 'on' : ''}" data-action="mh-filter" data-v="${k}">${l}</button>`).join('')}</div>`;
    let body;
    if (u.error) body = `<div class="card empty-state"><div class="e">⚠️</div>${esc(u.error)}<div class="mt"><button class="btn sm outline" data-action="mh-retry">Дахин ачаалах</button></div></div>`;
    else if (u.needSteam) body = '<div class="card empty-state"><div class="e">🔗</div>Steam ID холбоогүй тул таны тоглолтыг тодорхойлох боломжгүй. Тохиргоо → Профайл хэсэгт Steam-ээ холбоно уу.</div>';
    else if (!u.items.length && u.loading) body = '<div class="card empty-state"><div class="e">⏳</div>Тоглолтын түүх ачаалж байна...</div>';
    else if (!u.items.length) body = `<div class="card empty-state"><div class="e">🎮</div>${u.filter === 'mine' ? 'Та BERX ARENA серверт бүртгэгдсэн тоглолт хараахан тоглоогүй байна.' : 'Энэ ангилалд бүртгэгдсэн тоглолт алга.'}</div>`;
    else body = `<div class="card mh-list">${CardHead('history', 'Сүүлийн тоглолтууд', `<span class="dim" style="font-size:11.5px">${u.items.length} тоглолт</span>`)}${u.items.map(row).join('')}
      ${u.next ? `<div class="mh-more"><button class="btn outline" data-action="mh-more" ${u.loading ? 'disabled' : ''}>${u.loading ? 'Ачаалж байна...' : 'Цааш үзэх'}</button></div>` : ''}</div>`;
    return head + tabs + body;
  }

  /* ---------- дэлгэрэнгүй (modal) ---------- */
  function avatarOf(p) {
    const m = p.member && A.member(p.member.id);
    if (m) return U.Avatar(m, 30);
    return `<span class="mh-av">${esc((p.name || '?').trim().charAt(0).toUpperCase() || '?')}</span>`;
  }
  function teamTable(d, side) {
    const ps = d.players.filter(p => p.team === side);
    const won = d.status === 'completed' && d.winner === side;
    const sc = side === 'CT' ? d.score_ct : d.score_t;
    const cols = ['K', 'D', 'A', 'K/D', 'HS%', ...(d.has_damage ? ['ADR'] : []), ...(d.has_mvp ? ['MVP'] : [])];
    return `<div class="mh-team ${side === 'CT' ? 'ct' : 't'}">
      <div class="mh-team-h"><b>${side === 'CT' ? 'Counter-Terrorists' : 'Terrorists'}</b><span class="mh-team-s">${sc}</span>${won ? '<span class="mh-res win">Ялсан</span>' : ''}</div>
      ${ps.length ? `<div class="table-wrap"><table class="table mh-table"><thead><tr><th>Тоглогч</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>
      ${ps.map(p => `<tr class="${p.isMe ? 'me' : ''}"><td><div class="mh-pl">${avatarOf(p)}<span><b>${esc(p.member ? p.member.nick : p.name || 'Тоглогч')}</b>${p.isMe ? ' <span class="chip accent">Та</span>' : ''}${!p.connectedAtEnd ? ' <span class="dim" title="Тоглолт дуусахад серверээс гарсан байсан">· гарсан</span>' : ''}</span></div></td>
        <td class="mono">${p.kills}</td><td class="mono">${p.deaths}</td><td class="mono">${p.assists}</td>
        <td class="mono ${kd(p.kills, p.deaths) >= 1 ? 'win' : 'loss'}">${kd(p.kills, p.deaths).toFixed(2)}</td><td class="mono">${has(pct(p.headshotKills, p.kills)) ? pct(p.headshotKills, p.kills) + '%' : '—'}</td>
        ${d.has_damage ? `<td class="mono">${has(p.damage) && p.roundsPlayed ? Math.round(p.damage / p.roundsPlayed) : '—'}</td>` : ''}${d.has_mvp ? `<td class="mono">${has(p.mvp) ? p.mvp : '—'}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>` : '<div class="dim" style="padding:10px 4px">Тоглогч бүртгэгдээгүй</div>'}</div>`;
  }
  function detailHTML(st) {
    if (st.loading) return U.Modal('<div class="modal-body"><div class="empty-state"><div class="e">⏳</div>Ачаалж байна...</div></div>', { size: 'lg' });
    if (st.error) return U.Modal(`<div class="modal-body"><div class="empty-state"><div class="e">⚠️</div>${esc(st.error)}</div></div>`, { size: 'lg' });
    const d = st.data, mp = mapOf(d);
    const notes = [!d.has_damage ? 'ADR — энэ тоглолтод damage бүртгэгдээгүй.' : null, !d.has_mvp ? 'MVP — энэ тоглолтод бүртгэгдээгүй.' : null].filter(Boolean);
    return U.Modal(`
      <div class="mh-hero" style="${mp.img ? `--img:url('${esc(mp.img)}')` : ''}">
        <div class="mh-hero-in">
          <div class="row wrap" style="gap:8px"><span class="mh-mode ${esc(d.mode)}">${MODE[d.mode]}</span>${d.status !== 'completed' ? `<span class="mh-res st ${d.status}">${STATUS[d.status]}</span>` : ''}</div>
          <h2 class="display">${esc(mp.name)}</h2>
          <div class="dim">${when(d.started_at)} · ${dur(d.duration_s)}${d.aim_weapon ? ` · ${WEAPON[d.aim_weapon]} · first to ${d.target_rounds}` : ''} · ${d.rounds_played} round</div>
        </div>
        <div class="mh-final">${score(d)}<div class="dim" style="font-size:12px;text-align:center">${d.status === 'completed' ? (d.winner === 'draw' ? 'Тэнцсэн' : `${d.winner === 'CT' ? 'Counter-Terrorists' : 'Terrorists'} ялсан`) : 'Ялагч тодроогүй'}</div></div>
      </div>
      <div class="modal-body">
        ${d.status !== 'completed' ? `<div class="note warn mb" style="display:block">ℹ️ Энэ тоглолт ${STATUS[d.status].toLowerCase()}: ${esc(REASON[d.status_reason] || 'шалтгаан тодорхойгүй')}. Хожил/хожигдолд тооцогдохгүй.</div>` : ''}
        <div class="mh-teams">${teamTable(d, 'CT')}${teamTable(d, 'T')}</div>
        ${notes.length ? `<div class="dim mt" style="font-size:11.5px">${notes.join(' ')}</div>` : ''}
      </div>`, { size: 'lg' });
  }
  function openMatch(id) {
    const App = window.BerxApp; const st = { loading: true };
    App.modal = detailHTML(st); rerender();
    get('matches/' + encodeURIComponent(id)).then(d => { st.loading = false; st.data = d; })
      .catch(e => { st.loading = false; st.error = e.status === 404 ? 'Тоглолт олдсонгүй.' : 'Дэлгэрэнгүй ачаалагдсангүй.'; })
      // ачаалсны дараах шинэчлэлт: modal-ийн нээгдэх animation-ийг дахин тоглуулахгүй (анивчихгүй)
      .finally(() => { if (App.modal) { App.modal = detailHTML(st).replace('<div class="overlay"', '<div class="overlay mh-still"'); rerender(); } });
  }

  /* ---------- тоглогчийн BERX статистик (Статистик → BERX ARENA таб) ---------- */
  function playerStats(steam, mode) {
    const k = steam + '|' + mode;
    if (!cache[k]) {
      cache[k] = { loading: true };
      get(`players/${steam}/stats` + (mode !== 'all' ? '?mode=' + mode : '')).then(d => { cache[k] = { data: d }; })
        .catch(() => { cache[k] = { error: true }; }).finally(() => { if (location.hash === '#stats') rerender(); });
    }
    return cache[k];
  }

  const actions = {
    'mh-filter'(el) { const u = ui(); if (u.filter !== el.dataset.v) { u.filter = el.dataset.v; load(true); } return true; },
    'mh-more'() { const u = ui(); if (!u.loading && u.next) load(false); return true; },
    'mh-retry'() { load(true); return true; },
    'mh-open'(el) { openMatch(el.dataset.id); }
  };
  // app.js mount-ийг render бүрт дуудна → зөвхөн ачаалаагүй шүүлтүүрийг нэг удаа татна
  function mount() { const u = ui(); if (A.isLive() && !u.loading && !u.error && u.loaded !== u.filter) load(true); }
  window.BerxPages.matches = { render, actions, mount, ui, openMatch, playerStats, MODE, mapOf, when, resultChip, score, row };
})();
