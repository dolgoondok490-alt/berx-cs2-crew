/* BERX RANK — зэрэглэл, эх SVG тэмдэг (BERX-ийн өөрийн загвар: нэг ижил бамбайн хүрээ + "///" ховил + зэрэглэлийн дүрс)
 * FACEIT/Premier-ийн дүрсийг хуулаагүй. Өнгө: ROOKIE мөнгөлөг, HUNTER ногоон, REAPER ягаан-нил, DOMINATOR улаан-улбар, IMMORTAL алтан. */
(function () {
  'use strict';
  const RANKS = [
    { id: 'rookie', name: 'ROOKIE', min: 0, max: 1999, c1: '#e3e7ee', c2: '#7d8592', glow: 'rgba(200,206,216,.35)', mn: 'Шинэ анчин' },
    { id: 'hunter', name: 'HUNTER', min: 2000, max: 2999, c1: '#6cf0a3', c2: '#16804a', glow: 'rgba(57,210,122,.4)', mn: 'Анчин' },
    { id: 'reaper', name: 'REAPER', min: 3000, max: 3999, c1: '#c9a6ff', c2: '#5b2fb8', glow: 'rgba(166,120,255,.45)', mn: 'Хураагч' },
    { id: 'dominator', name: 'DOMINATOR', min: 4000, max: 4999, c1: '#ff9a4d', c2: '#c0260f', glow: 'rgba(255,90,31,.45)', mn: 'Ноёрхогч' },
    { id: 'immortal', name: 'IMMORTAL', min: 5000, max: null, c1: '#ffe27a', c2: '#b27400', glow: 'rgba(246,184,21,.5)', mn: 'Үхэшгүй' }
  ];
  const START = 1000;
  const rankOf = (brp) => RANKS.slice().reverse().find(r => brp >= r.min) || RANKS[0];
  const byId = (id) => RANKS.find(r => r.id === id) || RANKS[0];
  const nextRank = (brp) => RANKS.find(r => r.min > brp) || null;

  // Зэрэглэлийн дүрс (64×64 координат, төв ≈ 32,33)
  const SYMBOL = {
    // Бамбай + дээш сум (chevron)
    rookie: `<path d="M32 18 L44 23 V33 C44 41 38.5 46 32 48.5 C25.5 46 20 41 20 33 V23 Z" fill="none" stroke="#0d0e10" stroke-width="3" stroke-linejoin="round"/>
      <path d="M25 37 L32 30 L39 37" fill="none" stroke="#0d0e10" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    // Хараа (crosshair)
    hunter: `<circle cx="32" cy="33" r="11" fill="none" stroke="#0d0e10" stroke-width="3.2"/>
      <path d="M32 16 V24 M32 42 V50 M15 33 H23 M41 33 H49" stroke="#0d0e10" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="32" cy="33" r="2.6" fill="#0d0e10"/>`,
    // Гавал
    reaper: `<path d="M32 17 C23 17 18 23 18 30.5 C18 35.5 20.5 38.5 23.5 40 V45 H40.5 V40 C43.5 38.5 46 35.5 46 30.5 C46 23 41 17 32 17 Z" fill="#0d0e10"/>
      <ellipse cx="26.3" cy="31" rx="3.6" ry="4.2" fill="url(#ID-g)"/><ellipse cx="37.7" cy="31" rx="3.6" ry="4.2" fill="url(#ID-g)"/>
      <path d="M32 35 L30 39 H34 Z" fill="url(#ID-g)"/>
      <path d="M28 41.5 V45 M32 41.5 V45 M36 41.5 V45" stroke="url(#ID-g)" stroke-width="1.6"/>`,
    // Далавчтай дөл
    dominator: `<path d="M32 15 C34 21 39 23 39 31 C39 37 36 41.5 32 43 C28 41.5 25 37 25 31 C25 26 28 24 29 19 C30 22.5 31 23 32 15 Z" fill="#0d0e10"/>
      <path d="M32 26 C33 29 35.5 30.5 35.5 34 C35.5 37 34 39 32 39.8 C30 39 28.5 37 28.5 34 C28.5 31.5 30.5 30 32 26 Z" fill="url(#ID-g)"/>
      <path d="M23.5 33 C19 31 15.5 27 14 22 C17 25 20.5 26 23.5 26.2 Z M40.5 33 C45 31 48.5 27 50 22 C47 25 43.5 26 40.5 26.2 Z" fill="#0d0e10"/>
      <path d="M24 39 C20 38.5 16.5 36 14.5 32 C17.5 33.8 20.8 34.2 24 33.8 Z M40 39 C44 38.5 47.5 36 49.5 32 C46.5 33.8 43.2 34.2 40 33.8 Z" fill="#0d0e10"/>`,
    // Титэм
    immortal: `<path d="M17 25 L24.5 32 L32 19 L39.5 32 L47 25 L44 42 H20 Z" fill="#0d0e10" stroke="#0d0e10" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="20" y="44" width="24" height="4.5" rx="1.2" fill="#0d0e10"/>
      <path d="M32 29 L35 33.5 L32 38 L29 33.5 Z" fill="url(#ID-g)"/>
      <circle cx="17" cy="23.5" r="2.4" fill="#0d0e10"/><circle cx="32" cy="17.5" r="2.4" fill="#0d0e10"/><circle cx="47" cy="23.5" r="2.4" fill="#0d0e10"/>`
  };
  let seq = 0;
  function emblem(id, size = 56, opts = {}) {
    const r = byId(id), uid = 'rk' + (++seq) + Math.random().toString(36).slice(2, 6);
    const dim = opts.unranked ? ' opacity=".55"' : '';
    return `<svg class="rk-emblem rk-${r.id}" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${r.name}"${dim}>
      <defs><linearGradient id="${uid}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${r.c1}"/><stop offset="1" stop-color="${r.c2}"/></linearGradient>
        <linearGradient id="${uid}-e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <path d="M32 2.5 L58 12.5 V34.5 C58 49.5 46.5 58.5 32 62 C17.5 58.5 6 49.5 6 34.5 V12.5 Z" fill="#0d0e10"/>
      <path d="M32 5.5 L55 14.5 V34.5 C55 47.5 45 55.6 32 58.9 C19 55.6 9 47.5 9 34.5 V14.5 Z" fill="url(#${uid}-g)"/>
      <path d="M32 5.5 L55 14.5 V22 C44 19 20 19 9 22 V14.5 Z" fill="url(#${uid}-e)"/>
      <path d="M23 9.6 L20.4 14.6 M27.4 8 L24.8 13 M31.8 6.6 L29.2 11.6" stroke="#0d0e10" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
      ${SYMBOL[r.id].replace(/ID-g/g, uid + '-g')}
    </svg>`;
  }
  const label = (row) => (row && row.rank === 'immortal' && row.immortal ? `IMMORTAL #${row.immortal}` : byId(row ? row.rank : 'rookie').name);
  // Жижиг шошго: тэмдэг + нэр + BRP
  function badge(row, opts = {}) {
    const r = byId(row.rank || rankOf(row.brp).id);
    return `<span class="rk-badge rk-${r.id} ${row.unranked ? 'unranked' : ''}">${emblem(r.id, opts.size || 22, { unranked: row.unranked })}<b>${row.unranked ? 'Чансаагүй' : label(row)}</b>${opts.brp === false ? '' : `<span class="mono">${Number(row.brp).toLocaleString('en-US')}</span>`}</span>`;
  }

  const STATUS = { rated: 'BRP тооцогдсон', not_eligible: 'BRP-д тооцогдоогүй', review: 'Admin шалгалтад', rejected: 'Татгалзсан', error: 'Тооцоолох үед алдаа', pending: 'Шийдвэр хүлээгдэж байна' };
  const REASON = {
    ok: 'BRP тооцогдсон', ranking_disabled: 'Чансаа тухайн үед идэвхгүй байсан', mode_disabled: 'Энэ горимын Ranked идэвхгүй байсан',
    before_activation: 'Чансаа асахаас өмнө эхэлсэн тоглолт', old_agent: 'Серверийн BERX Agent хуучин (1.5.0+ шаардлагатай)', no_lock: 'Тоглолтын төрөл эхлэхэд түгжигдээгүй',
    not_completed: 'Тоглолт дуусаагүй (зогссон эсвэл тасалдсан)', draw: 'Тэнцсэн тоглолт BRP-д нөлөөлөхгүй', first_to_10: 'First to 10 тоглолт BRP-д нөлөөлөхгүй.',
    guard_missing: 'BERX Guard хамгаалалт идэвхгүй байсан', roster_size: 'Багийн бүрэлдэхүүн шаардлага хангаагүй (5v5 / 1v1 / 2v2 хүн)', bots: 'Bot оролцсон',
    unlinked_player: 'Steam-ээ BERX бүртгэлтэй холбоогүй тоглогч оролцсон', duplicate_player: 'Давхардсан тоглогч', duplicate_ref: 'Давхардсан тоглолт',
    rules_mismatch: 'Тоглолтын дүрэм түгжсэнээс өөрчлөгдсөн', extra_player: 'Түгжсэн бүрэлдэхүүнд байгаагүй тоглогч оролцсон', team_mismatch: 'Багийн бүрэлдэхүүн тоглолтын явцад өөрчлөгдсөн',
    low_participation: 'Тоглогч тоглолтын ихэнх хэсгийг тоглоогүй (гарсан)', too_short: 'Хэт богино тоглолт', farming_lineup: 'Ижил бүрэлдэхүүн 24 цагийн дотор олон удаа тоглосон',
    error: 'Тооцоолоход алдаа гарсан — admin шалгана'
  };
  const why = (rk) => (!rk ? '' : rk.status === 'review' ? `${REASON[rk.reason] || rk.reason} — admin шалгаж байна` : REASON[rk.reason] || STATUS[rk.status] || '');
  const fmtDelta = (d) => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d);

  window.BerxRank = { RANKS, START, rankOf, byId, nextRank, emblem, badge, label, STATUS, REASON, why, fmtDelta };
})();
