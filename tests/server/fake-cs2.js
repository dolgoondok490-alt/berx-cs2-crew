// Тестийн хуурамч CS2 dedicated server (RCON) — Workshop map / MatchZy / convar-ыг бодитойгоор дуурайна:
//   • convar унших ("name" → "name = value") ба тавих ("name value")
//   • host_workshop_map: анх татахад сервер DOWNLOAD_MS хугацаанд ХАРИУ ӨГӨХГҮЙ (бодит CS2 шиг), steamapps\workshop\...-д .vpk үүсгэнэ
//   • map ачаалагдсаны дараа 1с-д MatchZy: autostart 0 → sleep.cfg, 1 → warmup.cfg (AIM тохиргоог дарж бичих эрсдэлийг шалгана)
//   • HTTP control (127.0.0.1:<ctl>): /state, /fail-next, /exec-sleep, /players
// node fake-cs2.js <rconPort> <password> <logFile> <ctlPort> <cs2Dir> [downloadMs]
'use strict';
const net = require('net'), fs = require('fs'), path = require('path'), http = require('http');
const [port, pass, logFile, ctlPort, cs2Dir, dlMsArg] = process.argv.slice(2);
const DOWNLOAD_MS = +dlMsArg || 6000;
const WORKSHOP = { '3469339086': 'aim_map_d' };   // бодит CS2 сервер: Workshop aim_map → runtime map нэр aim_map_d
const steamapps = path.resolve(cs2Dir, '..', '..');

const cv = {
  game_type: '0', game_mode: '1', sv_cheats: '0', bot_quota: '2', mp_autoteambalance: '1', mp_limitteams: '1', mp_freezetime: '15', mp_maxrounds: '24',
  mp_match_can_clinch: '1', mp_overtime_enable: '1', mp_halftime: '1', mp_team_intro_time: '6.5', mp_roundtime: '1.92', mp_roundtime_defuse: '1.92',
  mp_roundtime_hostage: '1.92', mp_round_restart_delay: '7', mp_startmoney: '800', mp_maxmoney: '16000', mp_afterroundmoney: '0', mp_buytime: '20',
  mp_buy_anywhere: '0', mp_free_armor: '0', mp_death_drop_gun: '1', mp_death_drop_grenade: '2', mp_death_drop_defuser: '1', mp_give_player_c4: '1',
  mp_ct_default_primary: '', mp_t_default_primary: '', mp_ct_default_secondary: 'weapon_hkp2000', mp_t_default_secondary: 'weapon_glock',
  mp_ct_default_grenades: '', mp_t_default_grenades: '', mp_weapons_allow_map_placed: '0', mp_match_end_restart: '0', mp_match_restart_delay: '15',
  mp_respawn_on_death_ct: '0', mp_respawn_on_death_t: '0', sv_infinite_ammo: '0', mp_friendlyfire: '0', mp_warmup_pausetimer: '0',
  mp_winlimit: '0', mp_equipment_reset_rounds: '0'
};
const S = { map: 'de_mirage', autostart: 1, busyUntil: 0, failNext: false, sleepAt: [], configLog: [], restarts: 0,
  logOn: false, logHttp: [], score: { ct: 0, t: 0 }, played: 0, over: false, noWinlimit: false, lockFreeze: false, gameOvers: 0,
  players: [{ userid: 2, name: 'DOK', steamid64: '76561198000000001', team: 3 }, { userid: 3, name: 'BOT Abe', steamid64: '0', team: 2, bot: true }] };
const log = (t) => fs.appendFileSync(logFile, `${Date.now()} ${t}\n`);

function loadMap(m) {
  S.map = m; S.mapLoadedAt = Date.now(); log(`#MAPLOAD ${m}`);
  // MatchZy OnMapStart → 1с дараа AutoStart (0 = sleep.cfg, 1 = warmup)
  setTimeout(() => {
    if (S.autostart === 0) { Object.assign(cv, { mp_maxrounds: '24', mp_freezetime: '15', mp_ct_default_primary: '', mp_t_default_primary: '', mp_autoteambalance: '1', mp_limitteams: '1', bot_quota: '0' }); S.sleepAt.push(Date.now()); log('#MATCHZY sleep.cfg'); }
    else { cv.mp_warmup_pausetimer = '1'; log('#MATCHZY warmup.cfg'); }
  }, 1000);
}
// CS2 HTTP log: logaddress_add_http-ээр бүртгэсэн хаяг руу мөрүүдийг POST хийнэ (log on үед)
function emit(lines) {
  if (!S.logOn) return;
  const ts = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) + ' - ' + new Date().toTimeString().slice(0, 8) + '.000';
  const body = lines.map(l => `${ts} - ${l}`).join('\n');
  for (const u of S.logHttp) fetch(u, { method: 'POST', body }).catch(() => {});
}
function playRound(winner) {
  if (S.over) return;
  S.played++;
  if (winner === 'CT' || winner === 'T') S.score[winner === 'CT' ? 'ct' : 't']++;
  if (winner === 'CT' || winner === 'T') emit([`Team "${winner === 'CT' ? 'CT' : 'TERRORIST'}" triggered "SFUI_Notice_${winner === 'CT' ? 'CTs' : 'Terrorists'}_Win" (CT "${S.score.ct}") (T "${S.score.t}")`]);
  else emit(['World triggered "SFUI_Notice_Round_Draw"']);
  const wl = +cv.mp_winlimit, mr = +cv.mp_maxrounds, half = Math.floor(mr / 2);
  const end = (wl > 0 && (S.score.ct >= wl || S.score.t >= wl)) || S.played >= mr || (+cv.mp_match_can_clinch && (S.score.ct > half || S.score.t > half));
  if (end) { S.over = true; S.gameOvers++; emit([`Game Over: competitive mg_active ${S.map} score ${S.score.ct}:${S.score.t} after 3 min`]); }
}
function restartGame() { S.score = { ct: 0, t: 0 }; S.played = 0; S.over = false; emit(['World triggered "Match_Start" on "' + S.map + '"']); }
function run(body) {
  log(body);
  const c = body.trim(), w = c.split(/\s+/);
  if (c === 'status_json') return JSON.stringify({ server: { map: S.map, hostname: 'BERX ARENA', clients: S.players } });
  if (c === 'status') return `hostname: BERX ARENA\n[1: ${S.map} | main lump | mapload]`;
  if (c === 'css_plugins list') return '[#1:LOADED]: "MatchZy"\n[#2:LOADED]: "WeaponPaints"';
  if (c === 'maps *') return 'de_mirage.vpk de_dust2.vpk de_inferno.vpk de_nuke.vpk de_ancient.vpk de_anubis.vpk de_cache.vpk';
  if (w[0] === 'changelevel') { loadMap(w[1]); return ''; }
  if (w[0] === 'host_workshop_map') {
    if (S.failNext) { S.failNext = false; return `Failed to download workshop item ${w[1]}`; }
    const mapName = WORKSHOP[w[1]]; if (!mapName) return `Failed to download workshop item ${w[1]}`;
    const content = path.join(steamapps, 'workshop', 'content', '730', w[1]), dl = path.join(steamapps, 'workshop', 'downloads', '730', w[1]);
    const have = fs.existsSync(path.join(content, w[1] + '.vpk'));
    const ms = have ? 300 : DOWNLOAD_MS;
    S.busyUntil = Date.now() + ms;            // сервер энэ хугацаанд RCON-д хариу өгөхгүй
    if (!have) fs.mkdirSync(dl, { recursive: true });
    setTimeout(() => { fs.mkdirSync(content, { recursive: true }); fs.writeFileSync(path.join(content, w[1] + '.vpk'), 'vpk'); fs.rmSync(dl, { recursive: true, force: true }); loadMap(mapName); }, ms - 100);
    return '';
  }
  if (w[0] === 'matchzy_autostart_mode') { if (w[1] !== undefined) S.autostart = +w[1]; return ''; }
  if (c === 'css_restart') { S.restarts++; return ''; }
  if (c === 'mp_restartgame 1') { log('#RESTARTGAME'); restartGame(); return ''; }
  if (c === 'log') return S.logOn ? 'currently logging to: file, console, http' : 'not currently logging';
  if (c === 'log on') { S.logOn = true; return ''; }
  if (c === 'log off') { S.logOn = false; return ''; }
  if (w[0] === 'logaddress_add_http') { const u = c.match(/"([^"]+)"/)[1]; if (!S.logHttp.includes(u)) S.logHttp.push(u); return ''; }
  if (w[0] === 'logaddress_del_http') { const u = c.match(/"([^"]+)"/)[1]; S.logHttp = S.logHttp.filter(x => x !== u); return ''; }
  if (w[0] === 'mp_winlimit' && w.length > 1 && S.noWinlimit) return '';          // энэ сервер mp_winlimit-ийг үл тоомсорлоно (fallback тест)
  if (w[0] === 'mp_freezetime' && w.length > 1 && S.lockFreeze) return '';       // тохиргоо дарагдсаар (алдааны тест)
  if (c === 'bot_kick') { S.players = S.players.filter(p => !p.bot); return ''; }
  if (w[0] === 'wp_refresh') return '[WeaponPaints] Refresh process completed.';
  if (/^\w+$/.test(c) && Object.prototype.hasOwnProperty.call(cv, c)) return `${c} = ${cv[c]}`;
  if (w.length >= 2 && Object.prototype.hasOwnProperty.call(cv, w[0])) {
    let v = c.slice(w[0].length).trim(); if (v.startsWith('"')) v = v.slice(1, v.lastIndexOf('"'));
    cv[w[0]] = v; S.configLog.push({ t: Date.now(), k: w[0], v }); return '';
  }
  return '';
}
const pk = (id, type, body) => { const b = Buffer.from(body); const p = Buffer.alloc(14 + b.length); p.writeInt32LE(10 + b.length, 0); p.writeInt32LE(id, 4); p.writeInt32LE(type, 8); b.copy(p, 12); return p; };
net.createServer(s => {
  let buf = Buffer.alloc(0), authed = false; s.on('error', () => {});
  const pump = () => {
    if (Date.now() < S.busyUntil) return setTimeout(pump, S.busyUntil - Date.now() + 5);   // "завгүй" сервер: хариу хойшилно
    while (buf.length >= 4) {
      const n = buf.readInt32LE(0); if (buf.length < n + 4) break;
      const id = buf.readInt32LE(4), t = buf.readInt32LE(8), body = buf.slice(12, 4 + n - 2).toString(); buf = buf.slice(4 + n);
      if (t === 3) { authed = body === pass; s.write(pk(id, 0, '')); s.write(pk(authed ? id : -1, 2, '')); continue; }
      if (!authed) continue;
      s.write(pk(id, 0, run(body)));
      if (Date.now() < S.busyUntil) return setTimeout(pump, S.busyUntil - Date.now() + 5);
    }
  };
  s.on('data', d => { buf = Buffer.concat([buf, d]); pump(); });
}).listen(+port, '127.0.0.1');

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/fail-next') S.failNext = true;
  if (u.pathname === '/round') playRound(u.searchParams.get('w'));
  if (u.pathname === '/rounds') { for (const x of (u.searchParams.get('seq') || '').split(',')) playRound(x); }
  if (u.pathname === '/no-winlimit') S.noWinlimit = u.searchParams.get('v') !== '0';
  if (u.pathname === '/lock-freeze') { S.lockFreeze = u.searchParams.get('v') !== '0'; if (S.lockFreeze) cv.mp_freezetime = '15'; }
  if (u.pathname === '/exec-sleep') { Object.assign(cv, { mp_maxrounds: '24', mp_freezetime: '15', mp_ct_default_primary: '', mp_t_default_primary: '' }); log('#MATCHZY sleep.cfg (manual)'); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ map: S.map, autostart: S.autostart, busy: Date.now() < S.busyUntil, cv, sleepAt: S.sleepAt, restarts: S.restarts, configLog: S.configLog.slice(-200), players: S.players,
    logOn: S.logOn, logHttp: S.logHttp, score: S.score, played: S.played, over: S.over, gameOvers: S.gameOvers }));
}).listen(+ctlPort, '127.0.0.1');
