/* Тохиргоо → Чансаа (зөвхөн admin). Бүх шийдвэрийг backend дахин шалгана (403), шалтгаан заавал, audit-тай.
 *  • Feature flag: нийт / Competitive / AIM   • Томъёоны хувилбар   • Anti-farming дүрэм
 *  • Inflation: нийт олгосон / хассан BRP     • Шалгалтын дараалал (зөвшөөрөх / татгалзах)
 *  • Алдаа (дахин тооцоолох)                  • Тоглогчийн ledger, гараар засвар (±1–1000, шалтгаантай) */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI, R = window.BerxRank;
  const { esc, CardHead, icon } = U;
  const st = { data: null, loading: false, error: null, player: null, playerId: '', playerData: null };
  const MODE = { competitive: 'Competitive', aim1v1: 'AIM 1v1', aim2v2: 'AIM 2v2' };
  const RULE_LABEL = {
    min_rounds_competitive: 'Competitive: хамгийн бага round', min_duration_competitive_s: 'Competitive: хамгийн бага хугацаа (сек)',
    min_duration_aim_s: 'AIM: хамгийн бага хугацаа (сек)', min_participation: 'Хамгийн бага оролцоо (0–1)',
    max_same_lineup_24h_competitive: 'Competitive: ижил бүрэлдэхүүн / 24ц', max_same_lineup_24h_aim: 'AIM: ижил бүрэлдэхүүн / 24ц'
  };
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const rerender = () => window.BerxApp.render();

  function load() {
    if (st.loading) return; st.loading = true; st.error = null;
    fetch('api/admin/ranking', { credentials: 'same-origin', cache: 'no-store' }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j; })
      .then(j => { st.data = j; }).catch(e => { st.error = e.message; }).finally(() => { st.loading = false; if (location.hash === '#admin') rerender(); });
  }
  function loadPlayer(id) {
    st.playerId = id; st.playerData = null; if (!id) return rerender();
    fetch('api/admin/ranking/users/' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (st.playerId === id) st.playerData = j; }).catch(() => { st.playerData = { failed: true }; }).finally(rerender);
  }
  async function act(type, payload, okMsg) {
    try {
      const r = await fetch('api/action', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      window.BerxApp.toast(okMsg, '✅'); st.data = null; load(); if (st.playerId) loadPlayer(st.playerId);
      return j;
    } catch (e) { window.BerxApp.toast(e.message, '⚠️'); return null; }
  }
  const val = (id) => (document.getElementById(id) || {}).value || '';

  function matchLine(x) {
    const m = x.match || {};
    return `<span class="dim" style="font-size:12px">${MODE[x.mode] || esc(x.mode)} · ${m.map ? esc(m.map) : '?'} ${m.score_ct !== undefined ? m.score_ct + ':' + m.score_t : ''} · ${m.started_at ? U.fmtDate(new Date(+m.started_at)) : ''} · <code>${esc(String(x.matchId).slice(0, 8))}</code></span>`;
  }

  function render() {
    if (!A.isLive()) return '<div class="card empty-state"><div class="e">🛰️</div>Чансааны тохиргоо зөвхөн live сайтад.</div>';
    if (!st.data && !st.error) { load(); return '<div class="card empty-state"><div class="e">⏳</div>Ачаалж байна…</div>'; }
    if (st.error) return `<div class="card empty-state"><div class="e">⚠️</div>${esc(st.error)}<div class="mt"><button class="btn sm outline" data-action="rka-reload">Дахин</button></div></div>`;
    const d = st.data, s = d.settings, sum = d.summary || {};
    const flag = (k, label, hint) => `<div class="adm-row"><span>${label}<br><span class="dim" style="font-size:11px">${hint}</span></span>
      <div class="seg sm"><button class="${s[k] ? 'on' : ''}" data-action="rka-flag" data-k="${k}" data-v="1">ON</button><button class="${!s[k] ? 'on' : ''}" data-action="rka-flag" data-k="${k}" data-v="0">OFF</button></div></div>`;
    const members = A.members().slice().sort((a, b) => String(a.nick).localeCompare(String(b.nick)));
    const pd = st.playerData;
    return `
    ${!s.installed ? '<div class="note warn mb" style="display:block">⚠️ supabase/006_rankings.sql хараахан ажиллаагүй байна — чансаа бүрэн унтраалттай. docs/RANKING.md-ийн дарааллыг баримтална уу.</div>' : ''}
    <div class="grid cols" style="--c:1fr 1fr">
      <div class="card">
        ${CardHead('rank', 'Feature flag', `<span class="chip">Томъёо: ${esc(s.formula)}</span>`)}
        ${flag('enabled', 'Чансаа (нийт)', 'Унтраавал ямар ч тоглолт BRP авахгүй')}
        ${flag('competitive', 'Ranked Competitive 5v5', 'Agent 1.5.0+ шаардлагатай')}
        ${flag('aim', 'Ranked AIM 1v1 / 2v2', 'BERX Guard серверт баталгаажсаны дараа л')}
        <div class="field mt"><label for="rka-reason">Өөрчлөлтийн шалтгаан (audit)</label><input class="input" id="rka-reason" maxlength="300" placeholder="ж: Agent 1.5.0 суулгаж шалгасан"></div>
        <div class="dim" style="font-size:11.5px;margin-top:8px">Анх асаасан: ${s.enabled_at ? U.fmtDate(new Date(s.enabled_at)) : '—'} · Үүнээс өмнө эхэлсэн тоглолт хэзээ ч BRP авахгүй.</div>
      </div>
      <div class="card">
        ${CardHead('trend', 'BRP inflation')}
        <div class="rk-sum">
          <div><span class="kpi-label">Нийт олгосон</span><b class="mono win">+${num(sum.gained)}</b></div>
          <div><span class="kpi-label">Нийт хассан</span><b class="mono loss">−${num(sum.lost)}</b></div>
          <div><span class="kpi-label">Цэвэр</span><b class="mono">${sum.net >= 0 ? '+' : '−'}${num(Math.abs(sum.net || 0))}</b></div>
          <div><span class="kpi-label">Чансаатай тоглогч</span><b class="mono">${num(sum.players)}</b></div>
        </div>
        <div class="kv mt" style="font-size:12.5px">${Object.entries(sum.by_mode || {}).map(([k, v]) => `<span class="muted">${MODE[k] || esc(k)}</span><span class="dim">${num(v.changes)} өөрчлөлт</span><span class="mono"><span class="win">+${num(v.gained)}</span> / <span class="loss">−${num(v.lost)}</span></span>`).join('') || '<span class="dim">BRP өөрчлөлт хараахан алга</span>'}</div>
        <div class="row wrap mt" style="gap:6px">${Object.entries(sum.decisions || {}).map(([k, v]) => `<span class="chip">${esc(R.STATUS[k] || k)}: ${v}</span>`).join('')}${sum.adjustments ? `<span class="chip warn">Гар засвар: ${sum.adjustments}</span>` : ''}</div>
      </div>
    </div>

    <div class="card mt">
      ${CardHead('history', 'Шалгалтын дараалал', `<span class="chip ${d.review.length ? 'warn' : ''}">${d.review.length}</span>`)}
      ${d.review.length ? d.review.map(x => `<div class="rka-item">
        <div style="flex:1;min-width:0"><b>${esc(R.REASON[x.reason] || x.reason)}</b>${x.flag ? ` <span class="chip warn">${esc(x.flag)}</span>` : ''}<br>${matchLine(x)}
          ${x.note ? `<div class="dim" style="font-size:11.5px">Илэрсэн: ${esc(x.note)}</div>` : ''}
          ${x.proposal ? `<div class="rka-prop">${x.proposal.map(c => `<span class="chip ${c.result === 'win' ? 'win' : 'loss'}">${esc(c.nick)} ${R.fmtDelta(c.delta)}${c.score !== null && c.score !== undefined ? ` · ${(+c.score).toFixed(1)}` : ''}</span>`).join('')}</div>` : '<div class="dim" style="font-size:11.5px">Баг тодорхойгүй тул BRP тооцох боломжгүй — зөвхөн татгалзана.</div>'}</div>
        <div class="col" style="gap:6px;min-width:220px"><input class="input" id="rkn-${esc(x.matchId)}" maxlength="300" placeholder="Шалтгаан (заавал, 5+ тэмдэгт)" style="height:34px">
          <div class="row" style="gap:6px"><button class="btn sm primary" data-action="rka-review" data-id="${esc(x.matchId)}" data-v="approve" ${x.proposal ? '' : 'disabled'}>Зөвшөөрөх</button><button class="btn sm danger" data-action="rka-review" data-id="${esc(x.matchId)}" data-v="reject">Татгалзах</button><button class="btn sm ghost" data-action="rka-open" data-id="${esc(x.matchId)}">Тоглолт</button></div></div>
      </div>`).join('') : '<div class="dim" style="padding:8px 2px">Шалгалт хүлээж буй тоглолт алга.</div>'}
      ${d.flagged.length ? `<h4 class="mt">Шийдвэрийн дараа шинэчлэгдсэн (дахин олгоогүй)</h4>${d.flagged.map(x => `<div class="rka-item"><div style="flex:1"><b>${esc(R.STATUS[x.status])}</b> <span class="chip warn">${esc(x.flag)}</span><br>${matchLine(x)}</div><button class="btn sm ghost" data-action="rka-open" data-id="${esc(x.matchId)}">Тоглолт</button></div>`).join('')}` : ''}
      ${d.errors.length ? `<h4 class="mt">Алдаа</h4>${d.errors.map(x => `<div class="rka-item"><div style="flex:1"><b class="loss">Алдаа</b> <span class="dim">${esc(x.note || '')}</span><br>${matchLine(x)}</div><button class="btn sm" data-action="rka-retry" data-id="${esc(x.matchId)}">${icon('refresh')} Дахин тооцоолох</button></div>`).join('')}` : ''}
    </div>

    <div class="grid cols mt" style="--c:1fr 1fr">
      <div class="card">
        ${CardHead('users', 'Тоглогчийн BRP түүх / засвар')}
        <div class="field"><label for="rka-player">Тоглогч</label><select class="input" id="rka-player" data-rka-player><option value="">— сонгох —</option>${members.map(m => `<option value="${esc(m.id)}" ${st.playerId === m.id ? 'selected' : ''}>${esc(m.nick)}${m.steamId ? '' : ' (Steam алга)'}</option>`).join('')}</select></div>
        ${st.playerId ? (!pd ? '<div class="dim mt">Ачаалж байна…</div>' : pd.failed ? '<div class="loss mt">Ачаалагдсангүй</div>' : `
          <div class="row mt" style="gap:10px">${R.badge(pd.player)}<span class="dim" style="font-size:12px">оргил ${num(pd.player.peak)} · ${pd.player.matches} ranked</span></div>
          <div class="rka-ledger mt">${pd.history.slice().reverse().slice(0, 30).map(h => `<div><span class="mono ${h.delta >= 0 ? 'win' : 'loss'}">${R.fmtDelta(h.delta)}</span><span class="mono dim">${num(h.prev)}→${num(h.brp)}</span><span>${esc(h.kind === 'adjustment' ? '✎ ' + h.reason : h.reason)}</span><span class="dim">${U.fmtDate(new Date(h.at))}</span></div>`).join('') || '<span class="dim">Өөрчлөлт алга</span>'}</div>
          <div class="grid cols mt" style="--c:110px 1fr;gap:8px"><input class="input" id="rka-delta" type="number" min="-1000" max="1000" step="1" placeholder="±BRP" style="height:36px"><input class="input" id="rka-adj-reason" maxlength="300" placeholder="Шалтгаан (заавал)" style="height:36px"></div>
          <button class="btn sm danger mt" data-action="rka-adjust">Гараар засах (audit-тай)</button>`) : ''}
      </div>
      <div class="card">
        ${CardHead('gear', 'Anti-farming / sanity дүрэм')}
        ${Object.keys(RULE_LABEL).map(k => `<div class="adm-row"><label for="rkr-${k}">${RULE_LABEL[k]} <span class="dim">(анхдагч ${d.defaults[k]})</span></label><input class="input" id="rkr-${k}" type="number" step="${k === 'min_participation' ? '0.05' : '1'}" min="0" value="${esc(s.rules[k])}" style="height:34px;width:100px"></div>`).join('')}
        <div class="dim" style="font-size:11.5px">Зөрчил гарсан тоглолт шууд хасагдахгүй — admin шалгалт руу орно.</div>
        <button class="btn sm primary mt" data-action="rka-rules">Дүрэм хадгалах</button>
      </div>
    </div>

    <div class="card mt">
      ${CardHead('lock', 'Audit (сүүлийн 30)')}
      <div class="rka-ledger">${d.audit.map(a => `<div><span class="chip">${esc(a.action)}</span><span>${esc(a.admin || '')}</span><span>${esc(a.reason || '')}${a.target ? ` <code class="dim">${esc(String(a.target).slice(0, 12))}</code>` : ''}</span><span class="dim">${U.fmtDate(new Date(a.at))}</span></div>`).join('') || '<span class="dim">Бүртгэл алга</span>'}</div>
    </div>`;
  }

  const actions = {
    'rka-reload'() { st.data = null; st.error = null; load(); return true; },
    'rka-flag'(el) {
      const k = el.dataset.k, on = el.dataset.v === '1', reason = val('rka-reason').trim();
      const label = { enabled: 'Чансаа (нийт)', competitive: 'Ranked Competitive', aim: 'Ranked AIM' }[k];
      const warn = on && k === 'aim' ? ' BERX Guard плагин серверт суусан, бодитоор шалгагдсан эсэхийг баталгаажуулна уу.' : '';
      window.BerxApp.confirm(`«${label}»-ийг ${on ? 'АСААХ' : 'УНТРААХ'} уу?${warn}`, () => act('ranking.settings', { [k]: on, reason }, `${label}: ${on ? 'асаалаа' : 'унтраалаа'}`));
    },
    'rka-rules'() {
      const rules = {}; for (const k of Object.keys(RULE_LABEL)) rules[k] = val('rkr-' + k);
      act('ranking.settings', { rules, reason: val('rka-reason').trim() || 'rules update' }, 'Дүрэм хадгалагдлаа');
    },
    'rka-review'(el) {
      const id = el.dataset.id, decision = el.dataset.v, note = val('rkn-' + id).trim();
      if (note.length < 5) return window.BerxApp.toast('Шалтгаан заавал (5+ тэмдэгт)', '⚠️');
      window.BerxApp.confirm(decision === 'approve' ? 'Тооцоолсон BRP-г олгох уу? (буцаах боломжгүй — дараа нь зөвхөн гар засвараар)' : 'Энэ тоглолтыг BRP-гүй болгох уу?',
        () => act('ranking.review', { matchId: id, decision, note }, decision === 'approve' ? 'BRP олгогдлоо' : 'Татгалзлаа'));
    },
    'rka-retry'(el) { act('ranking.retry', { matchId: el.dataset.id }, 'Дахин тооцоолсон'); },
    'rka-open'(el) { window.BerxPages.matches.openMatch(el.dataset.id); },
    'rka-adjust'() {
      const delta = Number(val('rka-delta')), reason = val('rka-adj-reason').trim();
      if (!Number.isInteger(delta) || !delta || Math.abs(delta) > 1000) return window.BerxApp.toast('Өөрчлөлт ±1…1000 бүхэл тоо', '⚠️');
      if (reason.length < 5) return window.BerxApp.toast('Шалтгаан заавал (5+ тэмдэгт)', '⚠️');
      const m = A.member(st.playerId);
      window.BerxApp.confirm(`${m ? m.nick : ''}-ийн BRP-г ${R.fmtDelta(delta)} засах уу? Ledger болон audit-д бүртгэгдэнэ.`, () => act('ranking.adjust', { userId: st.playerId, delta, reason }, 'BRP засагдлаа'));
    }
  };
  function mount(root) { root.querySelector('[data-rka-player]')?.addEventListener('change', (e) => loadPlayer(e.target.value)); }
  function reset() { st.data = null; st.error = null; }
  window.BerxAdminRanking = { render, actions, mount, reset };
})();
