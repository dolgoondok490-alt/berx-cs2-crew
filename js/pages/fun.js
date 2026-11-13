/* Хөгжилдөх өрөө — Fun Room */
(function () {
  'use strict';
  const U = window.BerxUI, A = window.BerxAPI, S = window.BerxStore;
  const { esc, Avatar, CardHead, icon } = U;
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ui = () => (window.BerxApp.ui.fun ||= { mapResult: null, captain: null, captainPool: 'ready', challenge: null, flipped: false, quiz: null, memeText: '', memeImg: null });
  const LOOPS = 9, CELL = 140;

  function newQuiz() { return { order: shuffle(A.content.quiz.map((_, i) => i)).slice(0, 8), idx: 0, score: 0, picked: null, done: false }; }

  function quizBlock(u) {
    const q = u.quiz ||= newQuiz();
    if (q.done) {
      const pct = q.score / q.order.length;
      return `<div class="empty-state"><div class="e">${pct >= .8 ? '🏆' : pct >= .5 ? '😎' : '🤖'}</div><div class="display" style="font-size:30px;color:#fff">${q.score} / ${q.order.length}</div>
        <div>${pct >= .8 ? 'AIM GOD of knowledge!' : pct >= .5 ? 'Дажгүй шүү, rifler.' : 'BOT цол чамд очлоо...'}</div><button class="btn primary mt" data-action="quiz-restart">${icon('refresh')} Дахин тоглох</button></div>`;
    }
    const item = A.content.quiz[q.order[q.idx]];
    return `<div class="row between" style="font-size:12px;margin-bottom:6px"><span class="muted">Асуулт ${q.idx + 1} / ${q.order.length}</span><b class="accent">Оноо: ${q.score}</b></div>
      <div class="progress" style="margin-bottom:14px"><i style="width:${q.idx / q.order.length * 100}%"></i></div>
      <div style="font-weight:700;font-size:16px;margin-bottom:12px">${esc(item.q)}</div>
      ${item.a.map((a, i) => { let cls = ''; if (q.picked !== null) { if (i === item.c) cls = 'right'; else if (i === q.picked) cls = 'wrong'; }
        return `<button class="quiz-opt ${cls}" data-action="quiz-pick" data-i="${i}" ${q.picked !== null ? 'disabled' : ''}>${String.fromCharCode(65 + i)}. ${esc(a)}</button>`; }).join('')}
      ${q.picked !== null ? `<button class="btn primary block" data-action="quiz-next">${q.idx + 1 < q.order.length ? 'Дараагийн асуулт' : 'Үр дүн харах'} ${icon('arrow')}</button>` : ''}`;
  }

  function voteBlock() {
    const st = S.get(), me = A.me();
    const VOTE_KEY = A.lastMatchKey();
    const inv = VOTE_KEY && st.invites.find(i => i.id === VOTE_KEY);
    if (!inv) return '<div class="empty-state"><div class="e">🎮</div>Одоогоор дууссан тоглолт алга. Урилгаар тоглосны дараа энд санал өгнө.</div>';
    const players = Object.keys(inv.responses).filter(id => inv.responses[id] === 'yes' && A.member(id));
    if (!st.live && !st.matchVotes[VOTE_KEY]) S.set(s => { s.matchVotes[VOTE_KEY] = { kaze: { mvp: 'senzu', bot: 'b1t' }, senzu: { mvp: 'kaze', bot: 'b1t' }, nmgd: { mvp: 'senzu', bot: 'nmgd' } }; }, { silent: true });
    const votes = st.matchVotes[VOTE_KEY] || {};
    const mine = votes[me.id] || {};
    const tally = (k) => { const t = {}; Object.values(votes).forEach(v => v[k] && (t[v[k]] = (t[v[k]] || 0) + 1)); return t; };
    const tm = tally('mvp'), tb = tally('bot'), n = Object.keys(votes).length;
    const bars = (t, cls) => players.map(id => ({ id, n: t[id] || 0 })).sort((a, b) => b.n - a.n).map(x => `<div class="row" style="gap:8px;margin-bottom:6px">${Avatar(A.member(x.id), 24)}<span style="width:64px;font-size:12.5px;font-weight:600">${esc(A.member(x.id).nick)}</span><div class="bar" style="flex:1"><i style="width:${n ? x.n / n * 100 : 0}%;${cls === 'bot' ? 'background:linear-gradient(90deg,#6b6e76,#9a9ca3)' : ''}"></i></div><b class="mono" style="width:16px">${x.n}</b></div>`).join('');
    return `<div class="muted" style="font-size:12.5px;margin-bottom:10px">Сүүлийн тоглолт: <b style="color:#fff">${inv ? inv.type + ' · ' + U.fmtDate(inv.start) + ' · ' + A.maps.find(m => m.id === inv.map).name : 'Demo'}</b> · ${n} санал</div>
      <div class="grid cols" style="--c:1fr 1fr;gap:14px">
        <div><div style="font-weight:800;margin-bottom:8px">🔥 MVP</div><div class="row wrap" style="gap:6px;margin-bottom:12px">${players.map(id => `<button class="fp ${mine.mvp === id ? 'on' : ''}" data-action="vote-match" data-k="mvp" data-id="${id}">${Avatar(A.member(id), 22)}${esc(A.member(id).nick)}</button>`).join('')}</div>${bars(tm, 'mvp')}</div>
        <div><div style="font-weight:800;margin-bottom:8px">🤖 BOT</div><div class="row wrap" style="gap:6px;margin-bottom:12px">${players.map(id => `<button class="fp ${mine.bot === id ? 'on' : ''}" data-action="vote-match" data-k="bot" data-id="${id}">${Avatar(A.member(id), 22)}${esc(A.member(id).nick)}</button>`).join('')}</div>${bars(tb, 'bot')}</div>
      </div>`;
  }

  function memeBlock(u) {
    const st = S.get(), me = A.me();
    return `<div class="grid cols" style="--c:minmax(220px,300px) 1fr;gap:16px;align-items:start">
      <form class="col" id="meme-form">
        <label class="drop" id="meme-drop" for="meme-file">${u.memeImg ? `<img src="${u.memeImg}" alt="preview" style="border-radius:8px;max-height:160px;margin:0 auto">` : `${icon('upload').replace('<svg', '<svg style="width:26px;height:26px;margin:0 auto 6px;display:block"')}Зураг сонгох эсвэл энд чирж оруул<br><small class="dim">JPG/PNG/GIF — автоматаар жижгэрнэ</small>`}</label>
        <input type="file" id="meme-file" accept="image/*" class="sr">
        <input class="input" id="meme-text" placeholder="Caption / meme текст..." maxlength="140" value="${esc(u.memeText)}">
        <div class="row"><button class="btn primary" type="submit" style="flex:1">${icon('plus')} Нийтлэх</button>${u.memeImg ? '<button type="button" class="btn ghost" data-action="meme-clear">Цэвэрлэх</button>' : ''}</div>
        <div class="dim" style="font-size:11px">Clip (видео) нь Supabase Storage холбогдсоны дараа. Одоо зураг + текст.</div>
      </form>
      <div class="memes">${st.memes.map(mm => { const by = A.member(mm.by); const liked = mm.likes.includes(me.id); return `
        <div class="meme">${mm.img ? `<div class="pic" style="background-image:url(${mm.img})"></div>${mm.text ? `<div style="padding:10px 12px 0;font-weight:600;font-size:13px">${esc(mm.text)}</div>` : ''}` : `<div class="pic text">${esc(mm.text)}</div>`}
          <div class="meta">${Avatar(by, 24)}<b>${esc(by?.nick || '?')}</b><span class="dim">· ${U.timeAgo(mm.date)}</span>
            <button class="like ${liked ? 'on' : ''}" data-action="meme-like" data-id="${mm.id}">${icon('heart').replace('<svg', `<svg style="width:15px" ${liked ? 'fill="currentColor"' : ''}`)} ${mm.likes.length}</button>
            ${mm.by === me.id || me.admin ? `<button class="icon-btn" style="width:28px;height:28px" data-action="meme-del" data-id="${mm.id}" aria-label="Устгах">${icon('trash').replace('<svg', '<svg style="width:14px"')}</button>` : ''}</div></div>`; }).join('')}</div>
    </div>`;
  }

  function render() {
    const u = ui();
    const maps = A.maps;
    const strip = Array.from({ length: LOOPS }).flatMap(() => maps).map(m => `<div class="cell" style="${m.img ? `--img:url(${m.img})` : ''}"><span>${m.name}</span></div>`).join('');
    const pool = u.captainPool === 'ready' ? A.members().filter(m => S.get().availability[m.id] === 'yes') : A.members();
    return `
      ${U.Hero({ kicker: 'BERX CS2 CREW', title: 'FUN', accent: 'ROOM', lead: 'Тоглоом эхлэхээс өмнө эсвэл дараа нь — найзуудтайгаа хөгжилдөх орон зай.' })}
      <div class="fun-grid">
        <div class="card span-7">
          ${CardHead('map', 'Map Roulette', '<span class="muted" style="font-size:12px">Өнөөдрийн map-аа азаар сонго!</span>')}
          <div class="roulette" id="roulette"><div class="strip" id="strip">${strip}</div><div class="fadeL"></div><div class="fadeR"></div><div class="needle"></div></div>
          <div class="result-banner" id="map-result">${u.mapResult ? '🎯 ' + esc(u.mapResult) : '<span class="dim" style="font-size:15px">Эргүүлэхэд бэлэн</span>'}</div>
          <div class="row" style="justify-content:center;gap:10px"><button class="btn primary lg" data-action="spin-map" id="spin-btn">${icon('shuffle')} Санамсаргүй сонгох</button>
            ${u.mapResult ? `<button class="btn outline lg" data-action="map-to-invite">${icon('send')} Урилгад ашиглах</button>` : ''}</div>
        </div>

        <div class="card span-5">
          ${CardHead('crown', 'Captain Roulette', `<div class="seg"><button class="${u.captainPool === 'ready' ? 'on' : ''}" data-action="cap-pool" data-v="ready">🔥 Бэлэн</button><button class="${u.captainPool === 'all' ? 'on' : ''}" data-action="cap-pool" data-v="all">Бүгд</button></div>`)}
          <div class="captain-wheel" id="cap-wheel">${pool.map(m => `<div data-cid="${m.id}">${Avatar(m, 54, { cls: u.captain === m.id ? 'hl win' : '' })}</div>`).join('') || '<div class="dim">Бэлэн тоглогч алга — “Бүгд”-ийг сонго</div>'}</div>
          <div class="result-banner" id="cap-result">${u.captain ? '👑 ' + esc(A.member(u.captain)?.nick || '') + ' — CAPTAIN' : '<span class="dim" style="font-size:15px">Хэн удирдах вэ?</span>'}</div>
          <button class="btn primary block" data-action="spin-captain" ${pool.length < 2 ? 'disabled' : ''}>${icon('dice')} Captain сонгох</button>
        </div>

        <div class="card span-5">
          ${CardHead('zap', 'Random Challenge', '<span class="muted" style="font-size:12px">Тоглолтын хөгжилтэй даалгавар</span>')}
          <div class="challenge-card ${u.flipped ? 'flip' : ''}" id="chal"><div class="inner"><div class="face front">?</div><div class="face back" id="chal-text">${esc(u.challenge || '')}</div></div></div>
          <div class="row mt"><button class="btn primary" style="flex:1" data-action="challenge">${icon('refresh')} ${u.challenge ? 'Өөр даалгавар' : 'Даалгавар татах'}</button>
            ${u.challenge ? `<button class="btn" data-action="share-chat" data-text="${esc('🎯 Өнөөдрийн challenge: ' + u.challenge)}">${icon('chat')} Чатад</button>` : ''}</div>
        </div>

        <div class="card span-7">${CardHead('help', 'CS2 Quiz')}${quizBlock(u)}</div>
        <div class="card span-12">${CardHead('vote', 'MVP / BOT Vote', U.DemoTag('LOCAL'))}${voteBlock()}</div>
        <div class="card span-12">${CardHead('image', 'Meme Zone', '<span class="muted" style="font-size:12px">BERX-ийн meme цуглуулга</span>')}${memeBlock(u)}</div>
      </div>`;
  }

  /* ---------- animations ---------- */
  function spinMap() {
    const strip = document.getElementById('strip'), box = document.getElementById('roulette'); if (!strip || window.BerxApp.locked) return;
    window.BerxApp.locked = true;
    const btn = document.getElementById('spin-btn'); btn.disabled = true;
    const n = A.maps.length, pick = Math.floor(Math.random() * n);
    const target = (LOOPS - 2) * n + pick;
    strip.style.transition = 'none'; strip.style.transform = 'translateX(0)'; strip.offsetHeight;
    const x = target * CELL + CELL / 2 - box.clientWidth / 2 + (Math.random() - .5) * (CELL * .6);
    strip.style.transition = 'transform 4.2s cubic-bezier(.12,.72,.08,1)';
    strip.style.transform = `translateX(${-x}px)`;
    const res = document.getElementById('map-result'); res.className = 'result-banner'; res.innerHTML = '<span class="dim">Эргэж байна...</span>';
    setTimeout(() => {
      const name = A.maps[pick].name;
      ui().mapResult = name;
      res.innerHTML = '🎯 ' + name; res.className = 'result-banner pop';
      btn.disabled = false; window.BerxApp.locked = false;
      S.set(s => { s.lastMap = A.maps[pick].id; }, { silent: true });
      setTimeout(() => window.BerxApp.render(), 900);
    }, 4300);
  }

  function spinCaptain() {
    const nodes = [...document.querySelectorAll('#cap-wheel [data-cid]')]; if (nodes.length < 2 || window.BerxApp.locked) return;
    window.BerxApp.locked = true;
    const res = document.getElementById('cap-result'); res.className = 'result-banner'; res.innerHTML = '<span class="dim">Сонгож байна...</span>';
    const winner = Math.floor(Math.random() * nodes.length);
    const steps = nodes.length * 3 + winner;
    let i = 0;
    const tick = () => {
      nodes.forEach(n => n.firstElementChild.classList.remove('hl', 'win'));
      nodes[i % nodes.length].firstElementChild.classList.add('hl');
      if (i >= steps) {
        const id = nodes[winner].dataset.cid; nodes[winner].firstElementChild.classList.add('win');
        ui().captain = id; res.innerHTML = '👑 ' + esc(A.member(id).nick) + ' — CAPTAIN'; res.className = 'result-banner pop';
        window.BerxApp.locked = false; return;
      }
      i++; setTimeout(tick, 60 + Math.pow(i / steps, 3) * 380);
    };
    tick();
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 640, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', .72));
      };
      img.onerror = reject; img.src = url;
    });
  }

  const actions = {
    'spin-map'() { spinMap(); },
    'map-to-invite'() { const inv = window.BerxPages.invite.ui(); inv.draft.map = S.get().lastMap || 'mirage'; inv.draft.randomMap = false; location.hash = 'invite'; },
    'cap-pool'(el) { ui().captainPool = el.dataset.v; ui().captain = null; return true; },
    'spin-captain'() { spinCaptain(); },
    challenge() {
      const u = ui(), list = A.content.challenges.filter(c => c !== u.challenge);
      const card = document.getElementById('chal');
      const next = list[Math.floor(Math.random() * list.length)];
      if (u.flipped) { card.classList.remove('flip'); setTimeout(() => { u.challenge = next; document.getElementById('chal-text').textContent = next; card.classList.add('flip'); }, 450); }
      else { u.challenge = next; document.getElementById('chal-text').textContent = next; card.classList.add('flip'); }
      u.flipped = true;
      setTimeout(() => { if (!window.BerxApp.locked) window.BerxApp.render(); }, 1300);
    },
    'quiz-pick'(el) { const q = ui().quiz, item = A.content.quiz[q.order[q.idx]]; q.picked = +el.dataset.i; if (q.picked === item.c) q.score++; return true; },
    'quiz-next'() { const q = ui().quiz; q.picked = null; q.idx++; if (q.idx >= q.order.length) q.done = true; return true; },
    'quiz-restart'() { ui().quiz = newQuiz(); return true; },
    'vote-match'(el) { A.voteMatch(A.lastMatchKey(), el.dataset.k, el.dataset.id); },
    'meme-like'(el) { A.memeLike(el.dataset.id); },
    'meme-del'(el) { window.BerxApp.confirm('Энэ meme-г устгах уу?', () => A.memeDelete(el.dataset.id)); },
    'meme-clear'() { ui().memeImg = null; return true; }
  };

  function mount(root) {
    const file = root.querySelector('#meme-file'), drop = root.querySelector('#meme-drop'), form = root.querySelector('#meme-form'), txt = root.querySelector('#meme-text');
    const take = async (f) => { if (!f || !f.type.startsWith('image/')) return window.BerxApp.toast('Зөвхөн зураг оруулна уу', '⚠️'); try { ui().memeImg = await resizeImage(f); window.BerxApp.render(); } catch (e) { window.BerxApp.toast('Зураг уншиж чадсангүй', '⚠️'); } };
    file?.addEventListener('change', () => take(file.files[0]));
    drop?.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop?.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop?.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); });
    txt?.addEventListener('input', () => { ui().memeText = txt.value; });
    form?.addEventListener('submit', e => {
      e.preventDefault(); const u = ui();
      if (!u.memeImg && !u.memeText.trim()) return window.BerxApp.toast('Зураг эсвэл текст оруулна уу', '⚠️');
      A.memeCreate({ text: u.memeText.trim(), img: u.memeImg });
      u.memeImg = null; u.memeText = ''; window.BerxApp.toast('Meme нийтлэгдлээ 😂', '🖼️');
    });
  }

  window.BerxPages.fun = { render, actions, mount };
})();
