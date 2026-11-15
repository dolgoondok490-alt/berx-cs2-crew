/* BERX RANKING — Чансаа: миний зэрэглэл, BRP-ийн бодит түүх (ledger), сүүлийн чансаатай тоглолтууд, зэрэглэлийн заавар, нэгдсэн leaderboard.
 * Өгөгдөл: /api/berx/ranking/* — BRP-ийг зөвхөн сервер тооцоолно (browser хэзээ ч илгээхгүй). */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI, R = window.BerxRank;
  const { icon, esc, Hero, CardHead } = U;
  const ui = () => (window.BerxApp.ui.ranking ||= { me: null, board: null, loading: false, error: null, loaded: false });
  const get = (p) => fetch('api/berx/ranking/' + p, { credentials: 'same-origin', cache: 'no-store' }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Алдаа'), { status: r.status }); return j; });
  const rerender = () => window.BerxApp.render();
  const MODE = { competitive: 'Competitive 5v5', aim1v1: 'AIM 1v1', aim2v2: 'AIM 2v2' };
  const num = (n) => Number(n).toLocaleString('en-US');

  function load() {
    const u = ui(); if (u.loading) return;
    u.loading = true; u.error = null;
    Promise.all([get('me'), get('leaderboard')]).then(([me, board]) => { u.me = me; u.board = board; u.loaded = true; notifyFrom(me); })
      .catch(e => { u.error = e.status === 401 ? 'Нэвтрэх шаардлагатай.' : 'Чансааны мэдээлэл ачаалагдсангүй. Дахин оролдоно уу.'; u.loaded = true; })
      .finally(() => { u.loading = false; if (location.hash === '#ranking') rerender(); });
  }

  /* ---------- миний карт ---------- */
  function myCard(d) {
    const p = d.player, r = R.byId(p.rank), nx = p.next;
    const span = nx ? nx.min - r.min : 1, prog = nx ? Math.max(0, Math.min(100, Math.round((p.brp - r.min) / span * 100))) : 100;
    const last = p.last;
    return `<div class="card rk-card rk-${r.id}" style="--rk-glow:${r.glow}">
      <div class="rk-card-main">
        <div class="rk-card-em">${R.emblem(r.id, 112, { unranked: p.unranked })}</div>
        <div style="flex:1;min-width:0">
          <div class="kpi-label">Таны зэрэглэл</div>
          <div class="display rk-name">${p.unranked ? 'Чансаагүй' : esc(p.rankName)}</div>
          <div class="rk-brp"><b class="mono">${num(p.brp)}</b><span>BRP</span>${p.position ? `<span class="chip">#${p.position}</span>` : ''}</div>
          ${p.unranked ? '<div class="dim" style="font-size:12.5px">Анхны чансаатай тоглолтоо тоглоход 1000 BRP-ээс эхэлнэ.</div>' : ''}
          <div class="rk-next">
            <div class="row between" style="font-size:12px"><span class="dim">Дараагийн зэрэглэл</span><span>${nx ? `<b>${nx.name}</b> · ${num(nx.need)} BRP дутуу` : '<b>Хамгийн дээд зэрэглэл</b>'}</span></div>
            <div class="rk-bar"><i style="width:${prog}%"></i></div>
          </div>
        </div>
      </div>
      <div class="rk-stats">
        <div><span class="kpi-label">Оргил</span><b class="mono">${num(p.peak)}</b></div>
        <div><span class="kpi-label">Чансаатай тоглолт</span><b class="mono">${p.matches}</b></div>
        <div><span class="kpi-label">Хожил / Хожигдол</span><b class="mono">${p.wins} / ${p.losses}</b></div>
        <div><span class="kpi-label">Win rate</span><b class="mono">${p.winRate === null ? '—' : p.winRate + '%'}</b></div>
        <div><span class="kpi-label">Сүүлийн өөрчлөлт</span><b class="mono ${last ? (last.delta >= 0 ? 'win' : 'loss') : ''}">${last ? R.fmtDelta(last.delta) : '—'}</b></div>
      </div>
    </div>`;
  }

  /* ---------- BRP түүх (ledger-ийн бодит цэгүүд) ---------- */
  function historyChart(d) {
    const h = d.history || [];
    if (!h.length) return `<div class="card">${CardHead('trend', 'Чансааны түүх')}<div class="empty-state"><div class="e">📈</div>Чансаатай тоглолт хараахан алга — график таны анхны BRP өөрчлөлтөөс эхэлнэ.</div></div>`;
    const pts = [{ v: h[0].prev, t: 'Эхлэл' }, ...h.map(x => ({ v: x.brp, t: `${U.fmtDate(new Date(x.at))} · ${x.kind === 'adjustment' ? 'Admin засвар' : (x.result === 'win' ? 'Хожил' : 'Хожигдол')} ${R.fmtDelta(x.delta)}`, c: x.delta >= 0 ? '#39d27a' : '#ef4b4b' }))];
    return `<div class="card">${CardHead('trend', 'Чансааны түүх', `<span class="dim" style="font-size:11.5px">${h.length} өөрчлөлт</span>`)}${U.LineChart(pts, { label: 'BRP түүх', h: 190 })}</div>`;
  }

  function recentCard(d) {
    const list = d.recent || [];
    return `<div class="card">${CardHead('history', 'Сүүлийн чансаатай тоглолтууд')}
      ${list.length ? `<div class="rk-recent">${list.map(x => {
        const m = x.match || {};
        return `<button class="rk-rrow" data-action="rk-open" data-id="${esc(x.matchId)}">
          <span class="mh-res ${x.result}">${x.result === 'win' ? 'Хожил' : 'Хожигдол'}</span>
          <span class="rk-rmain"><b>${MODE[x.mode] || esc(x.mode || '')}</b><span class="dim">${m.map ? esc(String(m.map).replace(/^de_/, '')) + ' · ' : ''}${m.score_ct !== undefined ? m.score_ct + ':' + m.score_t + ' · ' : ''}${U.fmtDate(new Date(x.at))}</span></span>
          ${x.score !== null ? `<span class="rk-perf" title="Хувийн үзүүлэлт (0–100)"><span class="dim">Үзүүлэлт</span><b class="mono">${x.score.toFixed(1)}</b></span>` : '<span class="rk-perf"><span class="dim">AIM</span><b class="mono">±30</b></span>'}
          <span class="rk-delta mono ${x.delta >= 0 ? 'win' : 'loss'}">${R.fmtDelta(x.delta)} BRP</span>
        </button>`;
      }).join('')}</div>` : '<div class="empty-state"><div class="e">🎯</div>Чансаатай тоглолт хараахан тоглоогүй байна.</div>'}
    </div>`;
  }

  function guideCard() {
    return `<div class="card">${CardHead('crown', 'Зэрэглэлийн заавар')}
      <div class="rk-guide">${R.RANKS.map(r => `<div class="rk-gitem rk-${r.id}">${R.emblem(r.id, 46)}<div><b>${r.name}</b><span class="mono dim">${num(r.min)}${r.max ? '–' + num(r.max) : '+'} BRP</span></div></div>`).join('')}</div>
      <div class="rk-rules">
        <div><b>Competitive 5v5</b><span>Хожил <b class="win">+150…+230</b> · Хожигдол <b class="loss">−130…−200</b>. Хэдийг авах нь таны <b>хувийн үзүүлэлтээс</b> (K/D, ADR, багт оруулсан хувь нэмэр, assist, HS) хамаарна.</span></div>
        <div><b>AIM 1v1 / 2v2</b><span>Хожил <b class="win">+30</b> · Хожигдол <b class="loss">−30</b>. First to 10 тоглолт BRP-д нөлөөлөхгүй.</span></div>
        <div><b>Хэн тооцогдох вэ</b><span>Тоглолт эхлэхэд <b>Чансаатай</b> гэж түгжигдсэн, бүрэн 5v5 / 1v1 / 2v2 хүн, бүгд Steam-ээ BERX-тэй холбосон, тоглолт бүрэн дууссан. Энгийн (Casual) тоглолт түүхэнд хадгалагдах боловч BRP-д нөлөөлөхгүй.</span></div>
        <div><b>Эхлэл</b><span>Хүн бүр <b>1000 BRP</b>-ээс эхэлнэ, 0-ээс доош буухгүй. IMMORTAL (5000+) тоглогчид байраараа <b>IMMORTAL #N</b> гэж харагдана.</span></div>
      </div></div>`;
  }

  function boardCard(b, meId) {
    const rowH = (x) => `<tr class="${x.userId === meId ? 'me' : ''} ${x.unranked ? 'unranked' : ''}">
      <td class="mono rk-pos">${x.position ? '#' + x.position : '—'}</td>
      <td><button class="link rk-pl" data-action="open-profile" data-id="${esc(x.userId)}">${A.member(x.userId) ? U.Avatar(A.member(x.userId), 28) : ''}<b>${esc(x.nick)}</b>${x.userId === meId ? ' <span class="chip accent">Та</span>' : ''}</button></td>
      <td>${R.badge(x, { brp: false })}</td>
      <td class="mono"><b>${num(x.brp)}</b></td>
      <td class="mono hide-sm">${x.unranked ? '—' : num(x.peak)}</td>
      <td class="mono hide-sm">${x.matches}</td>
      <td class="mono">${x.winRate === null ? '—' : x.winRate + '%'}</td></tr>`;
    const head = '<thead><tr><th>#</th><th>Тоглогч</th><th>Зэрэглэл</th><th>BRP</th><th class="hide-sm">Оргил</th><th class="hide-sm">Тоглолт</th><th>Win%</th></tr></thead>';
    return `<div class="card">${CardHead('trophy', 'BERX чансааны жагсаалт', `<span class="dim" style="font-size:11.5px">${b.ranked.length} чансаатай · ${b.unranked.length} чансаагүй</span>`)}
      ${b.ranked.length ? `<div class="table-wrap"><table class="table rk-table">${head}<tbody>${b.ranked.map(rowH).join('')}</tbody></table></div>`
        : '<div class="empty-state"><div class="e">🏁</div>Чансаатай тоглолт хараахан тоглогдоогүй — эхний тоглолтын дараа жагсаалт энд гарна.</div>'}
      ${b.unranked.length ? `<details class="rk-unranked"><summary>Чансаагүй тоглогчид (${b.unranked.length}) — 1000 BRP, ranked тоглоогүй</summary><div class="table-wrap"><table class="table rk-table">${head}<tbody>${b.unranked.map(rowH).join('')}</tbody></table></div></details>` : ''}
      <div class="dim" style="font-size:11.5px;margin-top:10px">Эрэмбэ: BRP → оргил BRP → хожлын тоо → тэр BRP-д эрт хүрсэн нь. ${b.noSteam ? `${b.noSteam} гишүүн Steam холбоогүй тул жагсаалтад ороогүй.` : ''} FACEIT / Premier жагсаалт <a href="#leaderboard">Leaderboard</a> хэсэгт хэвээр.</div>
    </div>`;
  }

  function render() {
    const u = ui();
    const head = Hero({ kicker: 'BERX ARENA ///', title: 'BERX', accent: 'RANKING', lead: 'BERX ARENA серверийн чансаа — BRP (BERX Rank Points) нь зөвхөн серверээс бүртгэгдсэн чансаатай тоглолтоос тооцогдоно.' });
    if (!A.isLive()) return head + '<div class="card empty-state"><div class="e">🛰️</div>Чансаа зөвхөн BERX ARENA сервертэй холбогдсон сайтад харагдана.</div>';
    if (u.error) return head + `<div class="card empty-state"><div class="e">⚠️</div>${esc(u.error)}<div class="mt"><button class="btn sm outline" data-action="rk-retry">Дахин ачаалах</button></div></div>`;
    if (!u.me || !u.board) return head + '<div class="card empty-state"><div class="e">⏳</div>Чансаа ачаалж байна...</div>';
    const s = u.me.settings || {};
    const banner = !s.enabled ? '<div class="note warn mb" style="display:block">ℹ️ Чансаа одоогоор идэвхгүй байна. Admin асаасны дараа <b>Чансаатай</b> гэж эхлүүлсэн тоглолт л BRP өгнө. Одоогийн тоглолтууд Энгийн (Casual) байдлаар түүхэнд хадгалагдана.</div>'
      : `<div class="rk-flags">${['competitive', 'aim'].map(k => `<span class="chip ${s[k] ? 'win' : ''}">${k === 'competitive' ? 'Ranked Competitive' : 'Ranked AIM'}: ${s[k] ? 'идэвхтэй' : 'идэвхгүй'}</span>`).join('')}<span class="chip">Томъёо: ${esc(s.formula || '')}</span></div>`;
    const me = A.me();
    return head + banner + `<div class="grid rk-top">${myCard(u.me)}${historyChart(u.me)}</div>
      <div class="grid rk-mid">${recentCard(u.me)}${guideCard()}</div>
      ${boardCard(u.board, me && me.id)}`;
  }

  /* ---------- Зэрэглэл ахисан / буурсан мэдэгдэл (нэг удаа, хаагдана, давтагдахгүй) ---------- */
  const seenKey = () => 'berx.rank.seen.' + ((A.me() && A.me().id) || 'x');
  function readSeen() { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } }
  function writeSeen(id) { try { localStorage.setItem(seenKey(), String(id)); } catch (e) { /* хувийн горим — зөвхөн энэ сесс */ } memSeen = id; }
  let memSeen = 0;
  function notifyFrom(card) {
    const h = card && card.history; if (!h || !h.length) return;
    const last = h[h.length - 1], seen = Math.max(readSeen(), memSeen);
    if (!seen) { writeSeen(last.id); return; }            // анх удаа: хуучин өөрчлөлтийг мэдэгдэхгүй
    if (last.id <= seen) return;
    const before = h.filter(x => x.id > seen)[0];
    const from = R.rankOf(before ? before.prev : last.prev), to = R.rankOf(last.brp);
    writeSeen(last.id);
    if (from.id === to.id) return;
    const up = to.min > from.min, App = window.BerxApp;
    App.modal = U.Modal(`<div class="modal-body rk-up ${up ? 'up' : 'down'}" style="text-align:center">
      <div class="rk-up-em">${R.emblem(to.id, 132)}</div>
      <div class="kpi-label">${up ? 'Зэрэглэл ахилаа' : 'Зэрэглэл буурлаа'}</div>
      <h2 class="display" style="margin:4px 0">${to.name}</h2>
      <div class="dim">${from.name} → ${to.name} · <b class="mono">${num(last.brp)} BRP</b></div>
      <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary" data-action="close-modal">${up ? 'Гайхалтай!' : 'Ойлголоо'}</button></div>
    </div>`, { size: 'sm' });
    App.render();
  }
  // Апп ачаалсны дараа нэг удаа (хуудаснаас үл хамааран) шалгана
  function checkNotify() { if (!A.isLive() || !A.me()) return; get('me').then(notifyFrom).catch(() => {}); }

  /* ---------- Профайлын чансааны хэсэг (ProfileModal) ---------- */
  const prof = {};
  function profileBlock(m) {
    if (!A.isLive() || !m || !m.id) return '';
    const c = prof[m.id];
    if (!c || (Date.now() - c.at > 60e3 && !c.loading)) {
      prof[m.id] = { loading: true, at: Date.now(), data: c && c.data };
      get('users/' + encodeURIComponent(m.id)).then(d => { prof[m.id] = { at: Date.now(), data: d }; })
        .catch(() => { prof[m.id] = { at: Date.now(), error: true }; })
        .finally(() => {
          const App = window.BerxApp;
          if (App.modal && App.modal.includes(`data-rk-prof="${m.id}"`)) { App.modal = U.ProfileModal(m).replace('<div class="overlay"', '<div class="overlay mh-still"'); App.render(); }
        });
    }
    const x = prof[m.id], d = x.data;
    if (!d) return `<div class="rk-prof" data-rk-prof="${esc(m.id)}"><span class="dim">${x.error ? 'Чансаа ачаалагдсангүй' : 'Чансаа ачаалж байна...'}</span></div>`;
    const p = d.player, last = p.last;
    return `<div class="rk-prof rk-${p.rank}" data-rk-prof="${esc(m.id)}">
      ${R.emblem(p.rank, 54, { unranked: p.unranked })}
      <div class="rk-prof-main"><div class="kpi-label">BERX чансаа</div><b class="display">${p.unranked ? 'Чансаагүй' : esc(p.rankName)}</b></div>
      <div class="rk-prof-st"><span><b class="mono">${num(p.brp)}</b><small>BRP</small></span><span><b class="mono">${num(p.peak)}</b><small>Оргил</small></span>
        <span><b class="mono">${p.matches}</b><small>Ranked</small></span><span><b class="mono">${p.winRate === null ? '—' : p.winRate + '%'}</b><small>Win rate</small></span>
        <span><b class="mono ${last ? (last.delta >= 0 ? 'win' : 'loss') : ''}">${last ? R.fmtDelta(last.delta) : '—'}</b><small>Сүүлийн</small></span></div>
      <div class="rk-prof-links"><a class="chip" href="#ranking">Чансаа ${icon('arrow')}</a><a class="chip" href="#matches">Тоглолтын түүх</a></div>
    </div>`;
  }

  const actions = {
    'rk-retry'() { ui().loaded = false; load(); return true; },
    'rk-open'(el) { window.BerxPages.matches.openMatch(el.dataset.id); }
  };
  function mount() { const u = ui(); if (A.isLive() && !u.loading && !u.loaded) load(); }
  function unmount() { ui().loaded = false; }   // дахин орох бүрт шинэчилнэ
  window.BerxPages.ranking = { render, actions, mount, unmount, ui, checkNotify, notifyFrom, profileBlock };
})();
