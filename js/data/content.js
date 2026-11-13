/* =========================================================
 * BERX CS2 CREW — CONTENT / CONFIG (production-д ч ачаална)
 * ---------------------------------------------------------
 * Map жагсаалт, quiz, challenge, шалтаг үүсгэгч — хуурамч хэрэглэгч БАЙХГҮЙ.
 * Demo (хуурамч гишүүд, тоглолт) өгөгдөл нь js/data/mock.js-д бөгөөд
 * зөвхөн server-гүй preview горимд динамикаар ачаалагдана.
 * ========================================================= */
(function () {
  'use strict';

  // Deterministic random — demo өгөгдөл дахин ачаалахад өөрчлөгдөхгүй.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // CSS var(--img) доторх url() нь stylesheet-ээс хамаарч шийдэгддэг тул бүтэн URL болгоно
  const abs = (p) => p ? new URL(p, document.baseURI).href : null;
  const MAPS = [
    { id: 'mirage',  name: 'Mirage',  img: abs('assets/maps/mirage.jpg') },
    { id: 'inferno', name: 'Inferno', img: abs('assets/maps/inferno.jpg') },
    { id: 'anubis',  name: 'Anubis',  img: abs('assets/maps/anubis.jpg') },
    { id: 'nuke',    name: 'Nuke',    img: abs('assets/maps/nuke.jpg') },
    { id: 'ancient', name: 'Ancient', img: abs('assets/maps/ancient.jpg') },
    { id: 'dust2',   name: 'Dust II', img: abs('assets/maps/dust2.jpg') },
    { id: 'cache',   name: 'Cache',   img: abs('assets/maps/cache.jpg') }
  ];


  const CHALLENGES = [
    'Зөвхөн Deagle ашигла 🔫',
    'Хамгийн түрүүнд үхсэн хүн багийнхаа bot болно 🤖',
    'Knife kill хийхийг оролд 🔪',
    'Дараагийн тоглолтод хамгийн бага kill хийсэн хүн шинэ nickname авна 🏷️',
    'Pistol round-д зөвхөн P250 авна',
    'Бүх round-д нэг удаа "nice try" гэж хэлэх ёстой',
    'AWPer энэ тоглолтод rifle барина, rifler нь AWP',
    'Eco round бүрт rush B. Тайлбар хэрэггүй 🏃',
    'Хамгийн их flash-д өртсөн хүн дараагийн оройн хоол авна',
    'Smoke шидэхгүйгээр бүтэн half тогло',
    'Ялбал бүгд нэг ижил avatar тавина',
    'Clutch-д орсон хүн microphone-оо асааж тайлбарлана 🎙️'
  ];

  const EXCUSE_PARTS = {
    subject: ['Mouse маань', 'Интернэт', 'Гэрийнхэн', 'Миний муур', 'Steam', 'Windows', 'Миний headset', 'Монитор маань', 'Хөрш', 'Миний гар', 'Router', 'Ээж'],
    action: ['update хийж байна', 'намайг үзэн яддаг', 'намайг FACEIT-аас ban хийчихлээ', 'гацчихлаа', 'reboot хийхийг шаардаж байна', 'drift хийгээд байна',
             '120Hz-ээс 60Hz болчихлоо', 'намайг оройн хоолонд дуудчихлаа', 'чимээ гаргаад байна', 'хаягаа мартчихлаа', 'хүйтэн байна гээд ажиллахгүй байна'],
    tail: ['.', ', 10 минут өгөөч.', '. Дараагийн удаа заавал.', ', гэхдээ сэтгэлээрээ та нартай хамт.', '. Шалтаг биш, баримт.', '. Энэ удаад үнэхээр.', ' 😭', '. GG wp.']
  };

  const QUIZ = [
    { q: 'CS2-т нэг half хэдэн round-тай вэ (MR12)?', a: ['12', '15', '13', '16'], c: 0 },
    { q: 'Premier-ийн тоглолт хэдэн round-д ялснаар дуусдаг вэ?', a: ['16', '13', '12', '10'], c: 1 },
    { q: 'Bomb-ыг тэсрэхээс өмнө хэдэн секунд байдаг вэ?', a: ['35', '45', '40', '30'], c: 2 },
    { q: 'Defuse kit-тэй бол defuse хийх хугацаа?', a: ['10 сек', '7 сек', '5 сек', '3 сек'], c: 2 },
    { q: 'CS2-ийн smoke ямар онцлогтой болсон бэ?', a: ['Сумаар/HE-ээр түр сийрэгждэг', 'Өнгө нь улаан', 'Зөвхөн CT шиднэ', 'Дуу гаргадаг'], c: 0 },
    { q: 'AWP-ийн үнэ хэд вэ?', a: ['$4750', '$5000', '$4500', '$3700'], c: 0 },
    { q: 'FACEIT дээр хамгийн өндөр level хэд вэ?', a: ['10', '12', '20', '9'], c: 0 },
    { q: '"Entry" тоглогчийн гол үүрэг юу вэ?', a: ['Хамгийн түрүүнд сайт руу орж зай нээх', 'Bomb хамгаалах', 'Зөвхөн AWP барих', 'Тактик зохион байгуулах'], c: 0 },
    { q: 'CS2 ямар engine дээр бүтсэн бэ?', a: ['Source 2', 'Unreal 5', 'Source 1', 'Unity'], c: 0 },
    { q: 'Mirage дээрх "Connector"-ийг өөрөөр юу гэдэг вэ?', a: ['Jungle', 'Mid-ээс A руу гарах гарц', 'Banana', 'Long'], c: 1 },
    { q: 'Deagle headshot-оор (helmet-тэй) нэг сумаар алж чадах уу?', a: ['Тийм', 'Үгүй', 'Зөвхөн CT', 'Зөвхөн wallbang'], c: 0 },
    { q: 'Inferno дээрх "Banana" аль bombsite руу хөтөлдөг вэ?', a: ['A', 'B', 'Mid', 'CT spawn'], c: 1 }
  ];

  // Демо өгөгдлийн хоосон суурь — mock.js ачаалагдвал дүүргэнэ
  window.BERX_MOCK = {
    isDemo: false,
    MAPS, CHALLENGES, EXCUSE_PARTS, QUIZ, rng, abs,
    MEMBERS: [], MATCHES: {}, PAST_MANUAL_AWARDS: {}, MANUAL_RECORDS: { late: {}, afk: {}, excuse: {} }, EXCUSES_SAID: {},
    MEMES: [], CHAT: [], INVITES: [], AVAILABILITY: {}, PRESENCE: {}, LAST_SEEN: {},
    DEMO_PASSWORD: 'berx1234'
  };
})();
