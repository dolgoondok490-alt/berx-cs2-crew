/* =========================================================
 * BERX CS2 CREW — CONTENT / CONFIG (production-д ч ачаална)
 * ---------------------------------------------------------
 * Map жагсаалт, шалтаг үүсгэгч — хуурамч хэрэглэгч БАЙХГҮЙ.
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
  // Map pool — бодит CS2 screenshot-ууд (assets/maps). server: CS2 серверийн map нэр.
  const MAPS = [
    { id: 'mirage',  name: 'Mirage',  server: 'de_mirage',  img: abs('assets/maps/cs2-mirage-guide-1791486155990.webp') },
    { id: 'dust2',   name: 'Dust II', server: 'de_dust2',   img: abs('assets/maps/Cs2_dust2.webp') },
    { id: 'inferno', name: 'Inferno', server: 'de_inferno', img: abs('assets/maps/De_infernoCS2BSite.jpeg') },
    { id: 'nuke',    name: 'Nuke',    server: 'de_nuke',    img: abs('assets/maps/cs2-nuke-update.webp') },
    { id: 'ancient', name: 'Ancient', server: 'de_ancient', img: abs('assets/maps/De_ancient_cs2.webp') },
    { id: 'anubis',  name: 'Anubis',  server: 'de_anubis',  img: abs('assets/maps/CS2_Anubis_B_site.webp') },
    { id: 'cache',   name: 'Cache',   server: 'de_cache',   img: abs('assets/maps/De_cache_cs2.webp') }
  ];


  const EXCUSE_PARTS = {
    subject: ['Mouse маань', 'Интернэт', 'Гэрийнхэн', 'Миний муур', 'Steam', 'Windows', 'Миний headset', 'Монитор маань', 'Хөрш', 'Миний гар', 'Router', 'Ээж'],
    action: ['update хийж байна', 'намайг үзэн яддаг', 'намайг FACEIT-аас ban хийчихлээ', 'гацчихлаа', 'reboot хийхийг шаардаж байна', 'drift хийгээд байна',
             '120Hz-ээс 60Hz болчихлоо', 'намайг оройн хоолонд дуудчихлаа', 'чимээ гаргаад байна', 'хаягаа мартчихлаа', 'хүйтэн байна гээд ажиллахгүй байна'],
    tail: ['.', ', 10 минут өгөөч.', '. Дараагийн удаа заавал.', ', гэхдээ сэтгэлээрээ та нартай хамт.', '. Шалтаг биш, баримт.', '. Энэ удаад үнэхээр.', ' 😭', '. GG wp.']
  };

  // Демо өгөгдлийн хоосон суурь — mock.js ачаалагдвал дүүргэнэ
  window.BERX_MOCK = {
    isDemo: false,
    MAPS, EXCUSE_PARTS, rng, abs,
    MEMBERS: [], MATCHES: {}, PAST_MANUAL_AWARDS: {}, MANUAL_RECORDS: { late: {}, afk: {}, excuse: {} }, EXCUSES_SAID: {},
    CHAT: [], INVITES: [], AVAILABILITY: {}, PRESENCE: {}, LAST_SEEN: {},
    DEMO_PASSWORD: 'berx1234'
  };
})();
