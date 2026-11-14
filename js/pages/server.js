/* SERVER — BERX ARENA (CS2 private dedicated server) */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI, S = window.BerxStore;
  const { icon, esc, Avatar, CardHead } = U;
  const ui = () => (window.BerxApp.ui.server ||= { data: null, loading: false, error: null, busy: {}, form: {}, tab: null, aim: { size: 1, weapon: 'ak47', rounds: 10 }, aimTouched: false });
  const PHASE = { warmup: ['Warmup', 'warn'], live: ['LIVE', 'win'], finished: ['Finished', ''], practice: ['Practice', 'accent'], unknown: ['—', ''] };
  const MODE = { competitive: 'Competitive 5v5', wingman: 'Wingman 2v2', '1v1': '1v1', practice: 'Practice' };
  const WS_PHASE = { requested: ['Хүсэлт илгээгдлээ', 'warn', 0], downloading: ['Workshop-оос татаж байна', 'warn', 1], loading: ['Map ачаалж байна', 'warn', 2],
    configuring: ['AIM тохиргоо хэрэгжүүлж байна', 'warn', 3], ready: ['Бэлэн', 'win', 4], error: ['Алдаа', 'loss', -1] };
  const WEAPON_LABELS = { ak47: 'AK-47', m4a4: 'M4A4', m4a1s: 'M4A1-S', awp: 'AWP' };
  const wsList = (d) => (d && d.catalog && d.catalog.workshop) || [];
  // Серверийн map нэр workshop catalog-ийн аль map вэ ("aim_map", "workshop/3469339086/aim_map")
  const wsOf = (d, name) => { if (!name) return null; const n = String(name).toLowerCase().replace(/\\/g, '/'); return wsList(d).find(m => (m.mapNames || [m.mapName]).some(x => n === x || n.endsWith('/' + x)) || n.includes('/' + m.workshopId + '/')) || null; };
  const aimLabel = (a) => a ? `AIM ${a.size}v${a.size} · ${WEAPON_LABELS[a.weapon] || a.weapon} · First to ${a.rounds}` : '';

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

  // "de_cache", "workshop/123/de_cache" → "cache"
  const mapIdOf = (name) => name ? String(name).split('/').pop().replace(/^(de|cs)_/, '') : null;

  function statusCard(d) {
    const s = d.server, me = A.me();
    if (d.demo) return `<div class="card srv-offline"><div class="srv-dot off"></div><div><div class="display" style="font-size:24px">NOT CONFIGURED</div><div class="muted">Энэ бол preview (demo). Бодит сервер зөвхөн Vercel дээрх сайтад холбогдоно.</div></div></div>`;
    if (!d.configured) return `<div class="card srv-offline"><div class="srv-dot off"></div><div><div class="display" style="font-size:24px">NOT CONFIGURED</div><div class="muted">Сервер холбогдоогүй байна. ${me && me.admin ? 'Vercel дээр <code>SERVER_AGENT_SECRET</code> тохируулаад таны компьютер дээр BERX Agent-ийг асаана (agent/README.md).' : 'Admin серверийг тохируулахыг хүлээнэ үү.'}</div></div></div>`;
    if (!d.online) return `<div class="card srv-offline"><div class="srv-dot off"></div><div><div class="display" style="font-size:24px">OFFLINE</div><div class="muted">${d.lastSeen ? 'Сүүлд ' + U.timeAgo(d.lastSeen) + ' холбогдсон.' : 'Agent хараахан холбогдоогүй байна.'} Сервер эсвэл BERX Agent асаалттай эсэхийг шалгана уу.</div></div></div>`;
    const ws = wsOf(d, s.map);
    const mp = ws ? { name: ws.name, img: ws.image } : s.map ? A.mapInfo(mapIdOf(s.map)) : null;
    const aim = d.arena && d.arena.aim;
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
        <div><div class="kpi-label">Горим</div><div style="font-weight:800;font-size:16px;margin-top:6px">${aim ? `<span class="accent">${esc(aimLabel(aim))}</span>` : esc(MODE[s.mode] || s.mode || '—')}</div>${ws ? '<div class="dim" style="font-size:11.5px">Steam Workshop map</div>' : ''}</div>
        <div class="srv-score">${s.score ? `<span class="ct">CT</span><b class="ct">${s.score.ct}</b><span class="dim">:</span><b class="t">${s.score.t}</b><span class="t">T</span>` : '<span class="dim">Оноо —</span>'}</div>
      </div>
      ${d.connect ? `<div class="row wrap mt" style="gap:10px">
        <a class="btn primary lg" href="${esc(d.connect.steamUrl)}">${icon('game')} Серверт холбогдох</a>
        <button class="btn lg" data-action="srv-copy" data-text="${esc(d.connect.command)}">${icon('copy')} Connect команд хуулах</button>
        <code class="srv-code">connect ${esc(d.connect.address)}${d.connect.hasPassword ? '; password ••••••' : ''}</code>
      </div>` : '<div class="dim mt" style="font-size:12px">Холбогдох хаяг тохируулаагүй (agent-ийн PUBLIC_ADDRESS).</div>'}
    </div>`;
  }

  /* ---------- Workshop ачаалалтын явц (сервер өөрөө батлахаас өмнө "Бэлэн" гэж хэзээ ч харуулахгүй) ---------- */
  function workshopBanner(d) {
    const w = d.arena && d.arena.workshop; if (!w || w.phase === 'idle') return '';
    const m = wsList(d).find(x => x.id === w.id) || { name: w.id };
    const [label, cls, step] = WS_PHASE[w.phase] || ['—', '', 0];
    if (w.phase === 'ready' && !w.warning) return '';
    const steps = ['Татах', 'Ачаалах', 'Тохируулах', 'Бэлэн'];
    return `<div class="card mt ws-banner ${w.phase}">
      <div class="row" style="gap:12px;align-items:center">
        ${w.phase === 'error' ? '<span class="ws-ic loss">✖</span>' : w.phase === 'ready' ? '<span class="ws-ic win">✓</span>' : '<span class="ws-spin" aria-hidden="true"></span>'}
        <div style="min-width:0;flex:1"><b>${esc(m.name)}</b> <span class="chip ${cls}" style="height:20px;font-size:10.5px">${esc(label)}</span>
          <div class="dim" style="font-size:12px">Workshop ${esc(w.workshopId || '')}${w.since ? ' · ' + U.timeAgo(w.since) + ' эхэлсэн' : ''}${!d.online && w.phase !== 'error' ? ' · сервер map ачаалж байх үед түр хариу өгөхгүй байж болно' : ''}</div></div>
      </div>
      ${w.phase === 'error' ? `<div class="loss mt" style="font-size:12.5px">${esc(w.error || 'Тодорхойгүй алдаа')}</div>`
        : `<div class="ws-steps mt">${steps.map((t, i) => `<div class="ws-step ${step > i + 1 || (step === 4 && i === 3) ? 'done' : step === i + 1 || (step === 0 && i === 0) ? 'cur' : ''}"><i></i><span>${t}</span></div>`).join('')}</div>`}
      ${w.warning ? `<div class="note warn mt" style="font-size:12px">⚠️ ${esc(w.warning)}</div>` : ''}
    </div>`;
  }

  function mapsCard(d) {
    const u = ui(), aim = d.arena && d.arena.aim;
    const tab = u.tab || (aim ? 'aim' : 'competitive');
    const aimCount = wsList(d).filter(m => m.category === 'aim').length;
    return `<div class="card">
      <div class="srv-tabs" role="tablist">
        <button role="tab" class="${tab === 'competitive' ? 'on' : ''}" aria-selected="${tab === 'competitive'}" data-action="srv-tab" data-tab="competitive">COMPETITIVE <span class="dim">${(d.maps || A.LAN_MAPS).length}</span></button>
        <button role="tab" class="${tab === 'aim' ? 'on' : ''}" aria-selected="${tab === 'aim'}" data-action="srv-tab" data-tab="aim">AIM / 1V1 <span class="dim">${aimCount}</span>${aim ? '<i class="srv-tab-live">●</i>' : ''}</button>
      </div>
      ${tab === 'aim' ? aimSection(d) : mapVote(d)}
    </div>`;
  }

  function aimSection(d) {
    const me = A.me(), admin = me && me.admin, online = d.online, ar = d.arena || null, aim = ar && ar.aim;
    const list = wsList(d).filter(m => m.category === 'aim');
    if (!list.length) return '<div class="dim" style="padding:14px 2px">AIM map тохируулаагүй байна.</div>';
    const agentOld = d.online && !ar;      // v1.3.0-аас өмнөх agent Workshop/AIM мэдээлэл илгээдэггүй
    const f = ui().aim;
    if (aim && !ui().aimTouched) { f.size = aim.size; f.weapon = aim.weapon; f.rounds = aim.rounds; }
    const seg = (k, vals, lbl) => `<div class="seg sm">${vals.map(v => `<button class="${String(f[k]) === String(v) ? 'on' : ''}" data-action="aim-set" data-k="${k}" data-v="${v}">${esc(lbl(v))}</button>`).join('')}</div>`;
    const w = ar && ar.workshop;
    return `
      ${aim ? `<div class="aim-live">
        <div style="flex:1;min-width:0"><div class="kpi-label">Идэвхтэй</div><div class="display" style="font-size:20px">${esc(aimLabel(aim))}</div>
          <div class="dim" style="font-size:12px">${esc((list.find(m => m.id === aim.map) || { name: aim.map }).name)}${w && w.runtimeMap ? ` (${esc(w.runtimeMap)})` : ''}${w ? ' · ' + esc((WS_PHASE[w.phase] || [''])[0]) : ''}</div></div>
        ${d.server && d.server.score && !ar.result ? `<div class="aim-score"><span class="ct">CT</span><b class="ct">${d.server.score.ct}</b><span class="dim">:</span><b class="t">${d.server.score.t}</b><span class="t">T</span></div>` : ''}
      </div>
      ${ar.result ? `<div class="aim-result ${ar.result.winner === 'CT' ? 'ct' : 't'}">
        <div class="display" style="font-size:22px">🏆 ${ar.result.winner === 'CT' ? 'Counter-Terrorists' : 'Terrorists'} ялав</div>
        <div class="aim-final"><span class="ct">CT</span><b class="ct">${ar.result.ct}</b><span class="dim">:</span><b class="t">${ar.result.t}</b><span class="t">T</span></div>
        <div class="dim" style="font-size:12px">First to ${ar.result.rounds}${(ar.result.names[ar.result.winner] || []).length ? ' · ' + esc(ar.result.names[ar.result.winner].join(', ')) : ''}${ar.result.at ? ' · ' + U.timeAgo(ar.result.at) : ''} · «Дахин тоглох» дарахад 0:0-ээс эхэлнэ</div>
      </div>` : ''}
      ${d.aimSkins ? `<div class="note ${d.aimSkins.T && d.aimSkins.CT ? '' : 'warn'}" style="display:block;font-size:12px;margin-bottom:10px;overflow-wrap:anywhere">🎨 Таны ${esc(WEAPON_LABELS[d.aimSkins.weapon] || d.aimSkins.weapon)} skin: T ${d.aimSkins.T ? '✓' : '✗ default'} · CT ${d.aimSkins.CT ? '✓' : '✗ default'}${d.aimSkins.T && d.aimSkins.CT ? '' : ` — AIM-д хоёр багт ижил зэвсэг өгдөг ч WeaponPaints таны <b>тухайн үеийн багийн</b> loadout-ийг хэрэглэдэг. <a href="#skins">SKIN INVENTORY</a>-д ${!d.aimSkins.T && !d.aimSkins.CT ? 'T ба CT' : !d.aimSkins.T ? 'T' : 'CT'} багт мөн сонгоно уу.`}</div>` : ''}` : ''}
      <div class="ws-maps">${list.map(m => {
        const inst = ar && ar.installed ? ar.installed[m.id] : null, cur = aim && aim.map === m.id;
        const known = !ar || (ar.agentCatalog || []).includes(m.id);
        return `<div class="ws-map ${cur ? 'current' : ''}">
          <div class="ws-pic" style="${m.image ? `--img:url('${esc(m.image)}')` : ''}" role="img" aria-label="${esc(m.name)} screenshot (Steam Workshop)">
            <span class="ws-badge">WORKSHOP</span>${cur ? '<span class="srv-now">● ОДОО</span>' : ''}
            <span class="nm">${esc(m.name)}</span>
          </div>
          <div class="ws-meta">
            <div class="dim" style="font-size:12px">${m.author ? 'by ' + esc(m.author) + ' · ' : ''}${m.sizeMB ? m.sizeMB + ' MB · ' : ''}${m.teamSizes.map(n => n + 'v' + n).join(' / ')}</div>
            <div class="row wrap" style="gap:6px;margin-top:6px">
              ${inst === true ? '<span class="chip win" style="height:20px;font-size:10.5px">Серверт татагдсан</span>' : inst === false ? '<span class="chip warn" style="height:20px;font-size:10.5px">Анх ачаалахад татна</span>' : ''}
              ${!known ? '<span class="chip loss" style="height:20px;font-size:10.5px" title="agent\\workshop-maps.json-оо шинэчилнэ үү">Agent-д алга</span>' : ''}
              <a class="chip" style="height:20px;font-size:10.5px" href="${esc(m.source)}" target="_blank" rel="noopener noreferrer">Steam ${icon('ext')}</a>
            </div>
          </div>
        </div>`;
      }).join('')}</div>
      ${admin ? `<div class="aim-form">
        ${agentOld ? '<div class="note warn mb">⚠️ Серверийн BERX Agent хуучин байна — Workshop/AIM-д agent v1.3.0 хэрэгтэй (README).</div>' : ''}
        <div class="adm-row"><span>Багийн хэмжээ</span>${seg('size', (d.catalog && d.catalog.sizes) || [1, 2], v => v + 'v' + v)}</div>
        <div class="adm-row"><span>Зэвсэг</span>${seg('weapon', Object.keys((d.catalog && d.catalog.weapons) || WEAPON_LABELS), v => WEAPON_LABELS[v] || v)}</div>
        <div class="adm-row"><span>Round</span>${seg('rounds', (d.catalog && d.catalog.rounds) || [10, 13, 16, 30, 60], v => 'First to ' + v)}</div>
        <div class="dim" style="font-size:11.5px;margin:4px 0 10px">Bot байхгүй · team balance/limit OFF · freezetime 0 · round хооронд 1с · buy menu байхгүй · round бүр сонгосон зэвсэг, бүтэн сум, 100 HP, kevlar+helmet. Аль нэг баг N round хожиход дуусна (тал солихгүй, overtime байхгүй). MatchZy AIM-ийн үед унтаж, Competitive руу буцахад өмнөх тохиргоо сэргээгдэнэ.</div>
        <div class="row wrap" style="gap:8px">
          ${aim ? `<button class="btn primary" data-action="aim-rematch" ${online && w && ['ready', 'configuring', 'error'].includes(w.phase) ? '' : 'disabled'}>↻ Дахин тоглох (0:0) / тохиргоо хэрэгжүүлэх</button>`
            : `<button class="btn primary" data-action="aim-start" data-map="${esc(list[0].id)}" ${online && !agentOld ? '' : 'disabled'}>▶ AIM эхлүүлэх · ${esc(list[0].name)}</button>`}
          ${aim && w && w.phase === 'error' ? `<button class="btn" data-action="aim-start" data-map="${esc(aim.map)}" ${online ? '' : 'disabled'}>Map-ыг дахин ачаалах</button>` : ''}
        </div>
        ${aim ? `<div class="aim-back"><span>Competitive руу буцах:</span>
          <select class="input" id="aim-back-map" aria-label="Буцах map" style="height:36px;width:auto">${(d.maps || A.LAN_MAPS).map(id => `<option value="${id}">${esc(A.mapInfo(id).name)}</option>`).join('')}</select>
          <button class="btn danger" data-action="aim-stop" ${online ? '' : 'disabled'}>■ AIM дуусгах</button></div>` : ''}
      </div>` : `<div class="dim" style="font-size:12.5px;margin-top:10px">${aim ? 'AIM тоглолт явагдаж байна — серверт холбогдоод тоглоорой.' : 'AIM горимыг admin эхлүүлнэ.'}</div>`}`;
  }

  function mapVote(d) {
    const me = A.me(), online = d.online;
    const total = Object.values(d.votes || {}).reduce((a, b) => a + b, 0);
    const cur = d.server && d.server.map ? mapIdOf(d.server.map) : null;
    const avail = (d.server && d.server.mapsAvailable) || {};
    const aim = d.arena && d.arena.aim;
    return `
      <div class="row between" style="margin:2px 0 10px"><span class="muted" style="font-size:12px">Map-д санал өгөх${aim ? ' · <span class="accent">AIM идэвхтэй — «Серверт тавих» нь AIM-ийг дуусгаж өмнөх тохиргоог сэргээнэ</span>' : ''}</span><span class="muted" style="font-size:12px">${total} санал</span></div>
      <div class="srv-maps">${(d.maps || A.LAN_MAPS).map(id => {
        const m = A.mapInfo(id), n = (d.votes || {})[id] || 0, mine = d.myVote === id, pct = total ? Math.round(n / total * 100) : 0;
        const missing = avail[id] === false;   // agent шалгаад серверт олдоогүй
        return `<div class="srv-map ${mine ? 'mine' : ''} ${cur === id ? 'current' : ''} ${missing ? 'missing' : ''}">
          <button class="srv-map-pic" data-action="srv-vote" data-map="${id}" aria-pressed="${mine}" style="${m.img ? `--img:url(${m.img})` : ''}">
            ${cur === id ? '<span class="srv-now">● ОДОО</span>' : ''}${missing ? '<span class="srv-missing" title="CS2 серверт энэ map суугаагүй байна (SteamCMD-ээр CS2-оо шинэчилнэ үү)">Серверт алга</span>' : ''}<span class="nm">${esc(m.name)}</span></button>
          <div class="srv-vote-bar"><i style="width:${pct}%"></i></div>
          <div class="row between" style="font-size:12px;margin-top:4px"><span class="${mine ? 'accent' : 'muted'}">${mine ? '✓ Таны санал' : 'Санал өгөх'}</span><b>${n}</b></div>
          ${me && me.admin ? `<button class="btn sm outline block" style="margin-top:6px" data-action="srv-cmd" data-type="changemap" data-arg-map="${id}" ${online && !missing ? '' : 'disabled'} ${missing ? 'title="Серверт суугаагүй"' : ''}>Серверт тавих</button>` : ''}
        </div>`;
      }).join('')}</div>`;
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
      ${CardHead('crew', 'Баг сонгох', me.admin ? `<button class="btn sm" data-action="srv-shuffle">${icon('shuffle')} Санамсаргүй хуваах</button><button class="btn sm primary" data-action="srv-cmd" data-type="apply_teams" ${d.online && !(d.arena && d.arena.aim) ? '' : 'disabled'} title="MatchZy-аар SteamID64-ээр түгжинэ">${icon('send')} Серверт хэрэгжүүлэх</button>` : '')}
      ${d.arena && d.arena.aim ? `<div class="note mb">🎯 AIM ${d.arena.aim.size}v${d.arena.aim.size}: баг бүрт ${d.arena.aim.size} хүн. Сервер дээр багаа тоглоом дотроо сонгоно (MatchZy түгжээ AIM-д ашиглагдахгүй).</div>` : ''}
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
      ${workshopBanner(d)}
      <div class="grid mt cols" style="--c:1fr 1.15fr">${mapsCard(d)}${teamsCard(d)}</div>
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
    'srv-tab'(el) { ui().tab = el.dataset.tab === 'aim' ? 'aim' : 'competitive'; return true; },
    'aim-set'(el) { const f = ui().aim, k = el.dataset.k; if (!['size', 'weapon', 'rounds'].includes(k)) return; f[k] = k === 'weapon' ? el.dataset.v : Number(el.dataset.v); ui().aimTouched = true; return true; },
    'aim-start'(el) {
      const f = ui().aim, map = el.dataset.map, m = wsList(ui().data).find(x => x.id === map) || { name: map };
      window.BerxApp.confirm(`${m.name} дээр AIM ${f.size}v${f.size} (${WEAPON_LABELS[f.weapon]}, First to ${f.rounds}) эхлүүлэх үү? Одоогийн тоглолт зогсож, сервер Workshop map ачаална. Одоогийн серверийн тохиргоо хадгалагдаж, Competitive руу буцахад сэргээгдэнэ.`,
        () => { ui().aimTouched = false; cmd('aim_start', { map, size: f.size, weapon: f.weapon, rounds: f.rounds }, 'AIM 1V1 эхлүүлэх'); });
    },
    'aim-rematch'() { const f = ui().aim; ui().aimTouched = false; cmd('aim_rematch', { size: f.size, weapon: f.weapon, rounds: f.rounds }, 'AIM дахин тоглох'); },
    'aim-stop'() {
      const map = document.getElementById('aim-back-map')?.value || 'mirage';
      window.BerxApp.confirm(`AIM-ийг дуусгаж, өмнөх серверийн тохиргоог сэргээн ${A.mapInfo(map).name} (Competitive) руу шилжих үү?`, () => { ui().tab = 'competitive'; cmd('aim_stop', { map }, 'Competitive руу буцах'); });
    },
    'srv-kick'(el) { window.BerxApp.confirm(`${el.dataset.name}-г серверээс kick хийх үү?`, () => cmd('kick', { steamId: el.dataset.steam }, 'Kick')); },
    'srv-copy'(el) { (navigator.clipboard?.writeText(el.dataset.text) || Promise.reject()).then(() => window.BerxApp.toast('Connect команд хуулагдлаа — CS2 console-д paste хийнэ (~ товч)', '📋')).catch(() => window.BerxApp.toast('Хуулах боломжгүй', '⚠️')); }
  };

  let timer = null;
  const onPing = () => fetchState();
  function mount(root) {
    // app.js нь render бүрт mount-ыг дууддаг — timer-ийг дахин эхлүүлбэл (6с-ээс олон render) polling хэзээ ч ажиллахгүй
    if (!timer) timer = setInterval(() => { if (!document.hidden && window.BerxApp.route === 'server') fetchState(); }, 6000);
    document.removeEventListener('berx:server', onPing); document.addEventListener('berx:server', onPing);
    root.querySelectorAll('[data-srv-form]').forEach(el => el.addEventListener('input', () => { ui().form[el.dataset.srvForm] = el.value; }));
    root.querySelectorAll('[data-srv-move]').forEach(el => el.addEventListener('change', () => act('server.move', { userId: el.dataset.srvMove, team: el.value }, 'Баг солигдлоо')));
  }
  function unmount() { clearInterval(timer); timer = null; document.removeEventListener('berx:server', onPing); ui().data = null; }

  window.BerxPages.server = { render, mount, unmount, actions, fetchState };
})();
