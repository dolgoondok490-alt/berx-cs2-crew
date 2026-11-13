/* =========================================================
 * BERX CS2 CREW — DEMO DATA (зөвхөн server-гүй preview горимд)
 * ---------------------------------------------------------
 * Бүх гишүүн, тоглолт, урилга нь ЖИШЭЭ. Production (Vercel + Supabase)
 * горимд энэ файл огт ачаалагдахгүй — app.js нь server олдоогүй үед л
 * динамикаар ачаална. js/data/content.js-ээс ӨМНӨ ачаалж болохгүй.
 * ========================================================= */
(function () {
  'use strict';
  const base = window.BERX_MOCK;
  if (!base) { console.error('content.js ачаалагдаагүй'); return; }
  const { rng, MAPS } = base;


  // skill: 0..1 — demo тоглолт үүсгэхэд ашиглана
  const MEMBERS = [
    { id: 'dok',    nick: 'DOK',    name: 'Dolgoon',  avatar: 'assets/avatars/dok.jpg',    captain: true,  admin: true,
      premier: 22450, faceitElo: 2315, title: 'ELO ахиулна, амьд үлдэнэ', steamId: '7656119XXXXXXXX01', faceitNick: 'DOK_berx',  skill: .78, lateness: .10 },
    { id: 'kaze',   nick: 'Kaze',   name: 'Kaze',     avatar: 'assets/avatars/kaze.jpg',   premier: 21980, faceitElo: 2245, title: 'Эхэлж орно, эхэлж үхнэ', steamId: '7656119XXXXXXXX02', faceitNick: 'kaze_mn', skill: .74, lateness: .15 },
    { id: 'senzu',  nick: 'Senzu',  name: 'Senzu',    avatar: 'assets/avatars/senzu.jpg',  premier: 23110, faceitElo: 2105, title: 'Нэг сум — нэг шалтаг', steamId: '7656119XXXXXXXX03', faceitNick: 'senzu_awp', skill: .76, lateness: .20 },
    { id: 'b1t',    nick: 'b1t_jr', name: 'Bilguun',  avatar: 'assets/avatars/b1t.jpg',    premier: 21540, faceitElo: 1995, title: 'Сансрын нисгэгч, газар буухгүй', steamId: '7656119XXXXXXXX04', faceitNick: 'b1t_jr', skill: .52, lateness: .30 },
    { id: 'nmgd',   nick: 'nmgd',   name: 'Namuun',   avatar: 'assets/avatars/nmgd.jpg',   premier: 20870, faceitElo: 1980, title: 'Clutch-аас айдаг doge', steamId: '7656119XXXXXXXX05', faceitNick: 'nmgd', skill: .66, lateness: .25 },
    { id: 'temka',  nick: 'Temka',  name: 'Temuulen', avatar: 'assets/avatars/temka.jpg',  premier: 20420, faceitElo: 1720, title: 'Flash шиднэ, өөрөө сохорно', steamId: '7656119XXXXXXXX06', faceitNick: 'temka_flash', skill: .60, lateness: .45 },
    { id: 'l1m0n',  nick: 'L1m0n',  name: 'Lkhagva',  avatar: 'assets/avatars/l1m0n.jpg',  premier: 19630, faceitElo: 1640, title: 'Ганцаараа явж, ганцаараа үхнэ', steamId: '7656119XXXXXXXX07', faceitNick: 'l1m0n', skill: .50, lateness: .35 },
    { id: 'munkh',  nick: 'Munkh',  name: 'Munkh-Erdene', avatar: 'assets/avatars/munkh.jpg', premier: 18900, faceitElo: 1460, title: 'Spray control? Тэр юу вэ', steamId: '7656119XXXXXXXX08', faceitNick: 'munkh_e', skill: .45, lateness: .20 },
    { id: 'zolboo', nick: 'Zolboo', name: 'Zolboo',   avatar: 'assets/avatars/zolboo.jpg', premier: 19140, faceitElo: 1580, title: 'Хаан нь хоцордог', steamId: '7656119XXXXXXXX09', faceitNick: 'zolboo_king', skill: .55, lateness: .55 }
  ];

  const DAY = 86400000;

  // Тоглолтын түүх: гишүүн бүрт сүүлийн 45 хоногийн demo тоглолтууд.
  function genMatches(member, idx) {
    const r = rng(1000 + idx * 97);
    const out = [];
    const now = Date.now();
    const n = 34 + Math.floor(r() * 14);
    for (let i = 0; i < n; i++) {
      const map = MAPS[Math.floor(r() * MAPS.length)];
      const type = r() < 0.55 ? 'FACEIT' : 'Premier';
      const winP = 0.35 + member.skill * 0.35;
      const win = r() < winP;
      const lose = 4 + Math.floor(r() * 9);
      const score = win ? `13 – ${lose}` : `${lose} – 13`;
      const rounds = 13 + lose;
      const kpr = 0.5 + member.skill * 0.45 + (r() - 0.5) * 0.35 + (win ? 0.08 : -0.06);
      const k = Math.max(3, Math.round(rounds * kpr));
      const d = Math.max(5, Math.round(rounds * (0.78 - member.skill * 0.18 + (r() - 0.5) * 0.25 + (win ? -0.06 : 0.06))));
      const a = Math.round(2 + r() * 8);
      const hsPct = Math.min(80, Math.max(20, Math.round(30 + member.skill * 30 + (r() - 0.5) * 22)));
      const adr = Math.round(55 + member.skill * 45 + (r() - 0.5) * 30 + (win ? 6 : -6));
      const rating = +(0.55 + (k / d) * 0.45 + (adr - 75) / 220).toFixed(2);
      const eloDelta = type === 'FACEIT' ? (win ? 18 + Math.floor(r() * 12) : -(18 + Math.floor(r() * 12))) : 0;
      const ratingDelta = type === 'Premier' ? (win ? 80 + Math.floor(r() * 160) : -(80 + Math.floor(r() * 160))) : 0;
      // ойрын хоногуудад илүү нягт
      const ageDays = Math.pow(i / n, 1.35) * 44 + r() * 0.8;
      out.push({
        id: `${member.id}-m${i}`, memberId: member.id,
        date: now - ageDays * DAY - Math.floor(r() * 4) * 3600000,
        map: map.id, type, result: win ? 'W' : 'L', score,
        k, d, a, hsPct, adr, rating, eloDelta, ratingDelta
      });
    }
    return out.sort((x, y) => y.date - x.date);
  }

  const MATCHES = {};
  MEMBERS.forEach((m, i) => { MATCHES[m.id] = genMatches(m, i); });

  // Awards — өмнөх долоо хоногуудын гараар/санал хураалтаар тогтсон ялагчид (demo)
  const PAST_MANUAL_AWARDS = {
    1: { CHICKEN: 'nmgd', ALWAYS_LATE: 'zolboo', AFK_KING: 'temka', EXCUSE_MASTER: 'b1t' },
    2: { CHICKEN: 'l1m0n', ALWAYS_LATE: 'temka', AFK_KING: 'zolboo', EXCUSE_MASTER: 'l1m0n' },
    3: { CHICKEN: 'munkh', ALWAYS_LATE: 'zolboo', AFK_KING: 'b1t', EXCUSE_MASTER: 'nmgd' }
  };

  // Энэ долоо хоногийн гараар бүртгэсэн тоолуур (demo эхлэл)
  const MANUAL_RECORDS = {
    late:   { zolboo: 3, temka: 2, b1t: 1, l1m0n: 1 },
    afk:    { temka: 2, zolboo: 1, b1t: 1 },
    excuse: { b1t: 3, l1m0n: 2, nmgd: 2, temka: 1 }
  };

  const EXCUSES_SAID = {
    dok: 'Би зүгээр л тактик туршсан.',
    kaze: 'Би зүгээр л warmup хийж байсан.',
    senzu: 'Өнөөдөр mouse glitched байна.',
    nmgd: 'Net lag байсан 100%.',
    temka: 'Гэрийнхэн орж ирсэн...',
    l1m0n: 'Нойр дутуу байсан.',
    b1t: 'Би зүгээр л уушиг байсан.',
    munkh: 'Шинэ sensitivity туршиж байна.',
    zolboo: 'Хаан хүн хоцордог юм.'
  };


  const MEMES = [
    { id: 'meme-1', by: 'kaze', text: 'Тэр мөч: 1v5 clutch-д ороод "би энийг авна" гэж хэлсэн ч 3 секундэд үхэх 💀', likes: ['dok', 'senzu'], img: null, date: Date.now() - 2 * DAY },
    { id: 'meme-2', by: 'senzu', text: 'b1t_jr flash шидэхэд: багийн 4 нь сохорсон, дайсан 0 😎', likes: ['dok', 'kaze', 'nmgd'], img: null, date: Date.now() - 3 * DAY },
    { id: 'meme-3', by: 'temka', text: '"Ганцхан тоглоод унтъя" — 04:12 цаг, 7 дахь тоглолт', likes: ['zolboo'], img: null, date: Date.now() - 5 * DAY }
  ];

  const CHAT = [
    { by: 'kaze', text: 'Өнөө орой хэдэн цагт вэ?', date: Date.now() - 3.2 * 3600000 },
    { by: 'dok', text: '21:00. FACEIT. Хоцорвол ALWAYS LATE шагнал чинийх 😤', date: Date.now() - 3.0 * 3600000 },
    { by: 'zolboo', text: 'Би жаахан хоцорч магадгүй 🐢', date: Date.now() - 2.4 * 3600000 },
    { by: 'senzu', text: 'Мэдээж хоцорно шүү дээ 😂', date: Date.now() - 2.3 * 3600000 }
  ];

  // Анхны урилгууд (demo)
  function todayAt(h, m) { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); }
  const INVITES = [
    { id: 'inv-seed-1', type: 'FACEIT', start: todayAt(21, 0), slots: 5, map: 'mirage', invited: ['dok', 'kaze', 'senzu', 'b1t', 'nmgd', 'temka', 'l1m0n', 'munkh', 'zolboo'],
      message: 'Өнөө орой 21:00 цагаас FACEIT. +100 ELO хийхгүй бол унтахгүй шүү муусайнуудаа.', createdBy: 'dok', createdAt: Date.now() - 4 * 3600000,
      responses: { dok: 'yes', kaze: 'yes', nmgd: 'yes', zolboo: 'late', temka: 'maybe', munkh: 'no' },
      excuses: { zolboo: 'Ажлаасаа 21:20-д гарна, шууд орно 🐢', temka: 'Гэрийнхэн оройн хоолонд дуудчихлаа, магадгүй амжина', munkh: 'Интернэт намайг үзэн яддаг. Маргааш заавал.' }, status: 'active' },
    { id: 'inv-seed-2', type: 'Premier', start: Date.now() - 1 * DAY - 2 * 3600000, slots: 5, map: 'ancient', invited: ['dok', 'kaze', 'senzu', 'b1t', 'nmgd'],
      message: 'Premier 25k хүрэх зам 🚀', createdBy: 'senzu', createdAt: Date.now() - 1.3 * DAY,
      responses: { dok: 'yes', kaze: 'yes', senzu: 'yes', b1t: 'yes', nmgd: 'yes' }, status: 'done' },
    { id: 'inv-seed-3', type: 'LAN', start: Date.now() - 4 * DAY, slots: 10, map: 'dust2', invited: ['dok', 'kaze', 'senzu', 'temka', 'zolboo', 'l1m0n'],
      message: 'PC Club дээр LAN 🍕 Pizza-гаа авчирна', createdBy: 'kaze', createdAt: Date.now() - 5 * DAY,
      responses: { dok: 'yes', kaze: 'yes', temka: 'no', zolboo: 'late' }, status: 'cancelled' }
  ];

  const AVAILABILITY = { dok: 'yes', kaze: 'yes', nmgd: 'yes', senzu: 'maybe', zolboo: 'late', munkh: 'no' };

  // Сайтын онлайн төлөв (DEMO). Steam/CS2 төлөв API холбогдоогүй тул "unknown".
  const PRESENCE = { dok: 'online', kaze: 'online', senzu: 'online', b1t: 'online', nmgd: 'online', temka: 'away', l1m0n: 'offline', munkh: 'offline', zolboo: 'offline' };
  const LAST_SEEN = { l1m0n: 2 * 3600000, munkh: 5 * 3600000, zolboo: 26 * 3600000 };


  Object.assign(base, {
    isDemo: true,
    MEMBERS, MATCHES, PAST_MANUAL_AWARDS, MANUAL_RECORDS, EXCUSES_SAID,
    MEMES, CHAT, INVITES, AVAILABILITY, PRESENCE, LAST_SEEN
  });
})();
