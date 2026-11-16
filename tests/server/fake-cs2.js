// Тестийн хуурамч CS2 dedicated server (RCON) — Workshop map / MatchZy / convar-ыг бодитойгоор дуурайна:
//   • convar унших ("name" → "name = value") ба тавих ("name value")
//   • host_workshop_map: анх татахад сервер DOWNLOAD_MS хугацаанд ХАРИУ ӨГӨХГҮЙ (бодит CS2 шиг), steamapps\workshop\...-д .vpk үүсгэнэ
//   • map ачаалагдсаны дараа 1с-д MatchZy: autostart 0 → sleep.cfg, 1 → warmup.cfg (AIM тохиргоог дарж бичих эрсдэлийг шалгана)
//   • Workshop map-ын өөрийн point_servercommand (fixtures/aim_map1v1cfg-entities.json — бодит map-аас задалсан):
//     map ачаалах / mp_restartgame → OnMapSpawn + OnNewGame (sv_cheats 1, AK/Deagle, maxrounds 200 ...), round бүр → OnMapSpawn.
//     Round бүрийн эхэнд тоглогчийн авах зэвсэг (spawn) ба round дуусахад хэрэглэсэн restart delay-г бүртгэнэ.
//   • HTTP control (127.0.0.1:<ctl>): /state, /fail-next, /exec-sleep, /players, /map-every-round
// node fake-cs2.js <rconPort> <password> <logFile> <ctlPort> <cs2Dir> [downloadMs]
'use strict';
const net = require('net'), fs = require('fs'), path = require('path'), http = require('http');
const [port, pass, logFile, ctlPort, cs2Dir, dlMsArg] = process.argv.slice(2);
const DOWNLOAD_MS = +dlMsArg || 6000;
const MAPFIX = require('./fixtures/aim_map1v1cfg-entities.json');
const WORKSHOP = { [MAPFIX.workshopId]: MAPFIX.mapName };   // бодит Workshop файлаас шалгасан runtime map нэр
const MAP_LOGIC = { [MAPFIX.mapName]: MAPFIX };
const steamapps = path.resolve(cs2Dir, '..', '..');

const cv = {
  game_type: '0', game_mode: '1', sv_cheats: '0', bot_quota: '2', mp_autoteambalance: '1', mp_limitteams: '1', mp_freezetime: '15', mp_maxrounds: '24',
  mp_match_can_clinch: '1', mp_overtime_enable: '1', mp_halftime: '1', mp_team_intro_time: '6.5', mp_roundtime: '1.92', mp_roundtime_defuse: '1.92',
  mp_roundtime_hostage: '1.92', mp_round_restart_delay: '7', mp_startmoney: '800', mp_maxmoney: '16000', mp_afterroundmoney: '0', mp_buytime: '20',
  mp_buy_anywhere: '0', mp_free_armor: '0', mp_death_drop_gun: '1', mp_death_drop_grenade: '2', mp_death_drop_defuser: '1', mp_give_player_c4: '1',
  mp_ct_default_primary: '', mp_t_default_primary: '', mp_ct_default_secondary: 'weapon_hkp2000', mp_t_default_secondary: 'weapon_glock',
  mp_ct_default_grenades: '', mp_t_default_grenades: '', mp_weapons_allow_map_placed: '0', mp_match_end_restart: '0', mp_match_restart_delay: '15',
  mp_respawn_on_death_ct: '0', mp_respawn_on_death_t: '0', sv_infinite_ammo: '0', mp_friendlyfire: '0', mp_warmup_pausetimer: '0',
  mp_winlimit: '0', mp_equipment_reset_rounds: '0',
  mp_timelimit: '0', bot_dont_shoot: '0', sv_disable_immunity_alpha: '0', mp_respawn_immunitytime: '4', mp_warmup_online_enabled: '1', mp_logdetail: '0'
};
const S = { map: 'de_mirage', autostart: 1, busyUntil: 0, failNext: false, sleepAt: [], configLog: [], restarts: 0,
  logOn: false, logHttp: [], score: { ct: 0, t: 0 }, played: 0, over: false, noWinlimit: false, lockFreeze: false, gameOvers: 0,
  mapCmds: 0, everyRound: false, spawns: [], roundEnds: [], cheatsOnAt: null, cheatsWindows: [],
  players: [{ userid: 2, name: 'DOK', steamid64: '76561198000000001', team: 3 }, { userid: 3, name: 'BOT Abe', steamid64: '0', team: 2, bot: true }] };
const log = (t) => fs.appendFileSync(logFile, `${Date.now()} ${t}\n`);
// BERX Guard плагины ДУУРАЙЛАГА (тест): /guard?installed=1 → css_berx_guard_* хариулна, enforcing үед map-ын point_servercommand
// ажиллахгүй (entity устгагдсан), sv_cheats 0-ээс өөр болбол тэр даруй 0. Бодит CounterStrikeSharp биш.
S.guard = { installed: process.env.FAKE_GUARD === '1', enforcing: false, killed: 0, reverts: 0 };
const guardStatus = () => `BERX_GUARD ok v=1.0.0 enforcing=${S.guard.enforcing ? 1 : 0} cheats=${cv.sv_cheats === '1' ? 1 : 0} killed=${S.guard.killed} reverts=${S.guard.reverts} blocked=0`;
// convar тавих (agent ба map хоёулаа) — sv_cheats 1 байсан хугацааг хэмжинэ
function setCv(k, v) {
  if (k === 'sv_cheats') {
    if (v === '1' && cv.sv_cheats !== '1') S.cheatsOnAt = Date.now();
    if (v !== '1' && cv.sv_cheats === '1' && S.cheatsOnAt) { S.cheatsWindows.push({ at: S.cheatsOnAt, ms: Date.now() - S.cheatsOnAt }); S.cheatsOnAt = null; }
  }
  cv[k] = v;
  if (k === 'sv_cheats' && v !== '0' && S.guard.installed && S.guard.enforcing) { S.guard.reverts++; setCv('sv_cheats', '0'); }
}
// Map-ын point_servercommand: entity spawn-аас ~200ms дараа (logic_auto)
function fireMapLogic(kind) {
  const m = MAP_LOGIC[S.map]; if (!m) return;
  const map = S.map;
  setTimeout(() => {
    if (S.map !== map) return;
    if (S.guard.installed && S.guard.enforcing) { S.guard.killed++; log('#GUARD point_servercommand killed'); return; }
    const cmds = [...m.onMapSpawn, ...((kind !== 'round' || S.everyRound) ? [...m.onNewGame, ...m.onNewGameRelay] : [])];
    for (const c of cmds) {
      const [k, ...rest] = c.split(' '); const v = rest.join(' ');
      S.mapCmds++; log('#MAPCMD ' + c);
      if (k === 'game_alias' && v === 'custom') { setCv('game_type', '3'); setCv('game_mode', '0'); }
      else if (k === 'mp_freezetime' && S.lockFreeze) continue;   // "түгжсэн" тохиргоо map-д ч хамаарна
      else if (Object.prototype.hasOwnProperty.call(cv, k)) setCv(k, v);
    }
  }, 200);
}
// Шинэ round эхлэх: тоглогч тухайн үеийн convar-аар зэвсэг авна, дараа нь map-ын entity дахин spawn болно
function roundStart(kind) {
  S.spawns.push({ at: Date.now(), primary: cv.mp_t_default_primary, ctPrimary: cv.mp_ct_default_primary, secondary: cv.mp_t_default_secondary, ctSecondary: cv.mp_ct_default_secondary, cheats: cv.sv_cheats });
  emit(['World triggered "Round_Start"']);
  fireMapLogic(kind);
}

function loadMap(m) {
  S.map = m; S.mapLoadedAt = Date.now(); log(`#MAPLOAD ${m}`);
  if (S.guard.resetOnMap) { S.guard.enforcing = false; log('#GUARD reset (plugin reload simulated)'); }
  fireMapLogic('load');
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
  S.roundEnds.push({ at: Date.now(), delay: cv.mp_round_restart_delay, maxrounds: cv.mp_maxrounds, timelimit: cv.mp_timelimit });
  if (winner === 'CT' || winner === 'T') S.score[winner === 'CT' ? 'ct' : 't']++;
  if (winner === 'CT' || winner === 'T') emit([`Team "${winner === 'CT' ? 'CT' : 'TERRORIST'}" triggered "SFUI_Notice_${winner === 'CT' ? 'CTs' : 'Terrorists'}_Win" (CT "${S.score.ct}") (T "${S.score.t}")`]);
  else emit(['World triggered "SFUI_Notice_Round_Draw"']);
  const wl = +cv.mp_winlimit, mr = +cv.mp_maxrounds, half = Math.floor(mr / 2);
  const end = (wl > 0 && (S.score.ct >= wl || S.score.t >= wl)) || S.played >= mr || (+cv.mp_match_can_clinch && (S.score.ct > half || S.score.t > half));
  if (end) { S.over = true; S.gameOvers++; emit([`Game Over: competitive mg_active ${S.map} score ${S.score.ct}:${S.score.t} after 3 min`]); }
  else roundStart('round');
}
function restartGame() { S.score = { ct: 0, t: 0 }; S.played = 0; S.over = false; emit(['World triggered "Match_Start" on "' + S.map + '"']); roundStart('restart'); }
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
    // Dedicated server (SteamCMD) дээрх бодит файлын бүтэц: <id>_dir.vpk + <id>_000.vpk (map нэр файлын нэрэнд байхгүй)
    const have = fs.existsSync(path.join(content, w[1] + '_dir.vpk'));
    const ms = have ? 300 : DOWNLOAD_MS;
    S.busyUntil = Date.now() + ms;            // сервер энэ хугацаанд RCON-д хариу өгөхгүй
    if (!have) fs.mkdirSync(dl, { recursive: true });
    setTimeout(() => { fs.mkdirSync(content, { recursive: true }); fs.writeFileSync(path.join(content, w[1] + '_dir.vpk'), 'vpk'); fs.writeFileSync(path.join(content, w[1] + '_000.vpk'), 'vpk'); fs.rmSync(dl, { recursive: true, force: true }); loadMap(mapName); }, ms - 100);
    return '';
  }
  // MatchZy remote log (agent RCON-оор тохируулна) — бодит MatchZy шиг event-ийг энэ URL руу header-тэй илгээнэ
  if (w[0] === 'matchzy_remote_log_url' && w[1]) { (S.mz ||= {}).url = c.match(/"([^"]+)"/)[1]; return ''; }
  if (w[0] === 'matchzy_remote_log_header_key' && w[1]) { (S.mz ||= {}).key = c.match(/"([^"]+)"/)[1]; return ''; }
  if (w[0] === 'matchzy_remote_log_header_value' && w[1]) { (S.mz ||= {}).value = c.match(/"([^"]+)"/)[1]; return ''; }
  if (w[0] === 'matchzy_autostart_mode') { if (w[1] !== undefined) S.autostart = +w[1]; return ''; }
  if (c === 'css_restart') { S.restarts++; return ''; }
  if (w[0] === 'echo') return c.slice(5);
  if (/^css_berx_guard_(status|on|off)$/.test(c)) {
    if (!S.guard.installed) return `Unknown command '${c}'!`;
    if (S.guard.empty > 0) { S.guard.empty--; return ''; }                 // CS2 хоосон хариу өгсөн (дууриамал)
    if (S.guard.degraded) return `BERX_GUARD degraded v=1.0.0 enforcing=0 cheats=0 killed=0 reverts=0 blocked=0`;
    if (c === 'css_berx_guard_on' && S.guard.failOn) return guardStatus();   // асаалт хэрэгжээгүй (дууриамал)
    if (c === 'css_berx_guard_on') { S.guard.enforcing = true; if (cv.sv_cheats !== '0') setCv('sv_cheats', '0'); }
    if (c === 'css_berx_guard_off') S.guard.enforcing = false;
    return guardStatus();
  }
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
    setCv(w[0], v); S.configLog.push({ t: Date.now(), k: w[0], v }); return '';
  }
  return '';
}
const pk = (id, type, body) => { const b = Buffer.from(body); const p = Buffer.alloc(14 + b.length); p.writeInt32LE(10 + b.length, 0); p.writeInt32LE(id, 4); p.writeInt32LE(type, 8); b.copy(p, 12); return p; };
const CONNS = new Set();
S.rconConnections = 0;
const out = (s, b) => {                                        // fragment горимд: пакетыг 1–7 байтаар хэсэглэн (дарааллаа хадгалан) илгээнэ
  if (!S.fragment && !(s.q && s.q.length)) return s.write(b);
  (s.q ||= []).push(b); if (s.q.length > 1) return;
  let i = 0; const step = () => {
    if (s.destroyed) return; const cur = s.q[0]; if (!cur) return;
    const n = 1 + (i % 7); s.write(cur.slice(i, i + n)); i += n;
    if (i >= cur.length) { s.q.shift(); i = 0; }
    if (s.q.length) setImmediate(step);
  }; step();
};
net.createServer(s => {
  let buf = Buffer.alloc(0), authed = false; s.on('error', () => {});
  const conn = { stalled: false }; CONNS.add(conn); S.rconConnections++; s.on('close', () => CONNS.delete(conn));
  const pump = () => {
    if (Date.now() < S.busyUntil) return setTimeout(pump, S.busyUntil - Date.now() + 5);   // "завгүй" сервер: хариу хойшилно
    while (buf.length >= 4) {
      const n = buf.readInt32LE(0); if (buf.length < n + 4) break;
      const id = buf.readInt32LE(4), t = buf.readInt32LE(8), body = buf.slice(12, 4 + n - 2).toString(); buf = buf.slice(4 + n);
      if (t === 3) { authed = body === pass; s.write(pk(id, 0, '')); s.write(pk(authed ? id : -1, 2, '')); continue; }
      if (!authed) continue;
      if (conn.stalled) { log('#STALLED ' + body); continue; }
      out(s, pk(id, 0, run(body)));
      if (Date.now() < S.busyUntil) return setTimeout(pump, S.busyUntil - Date.now() + 5);
    }
  };
  s.on('data', d => { buf = Buffer.concat([buf, d]); pump(); });
}).listen(+port, '127.0.0.1');

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let body = ''; for await (const c of req) body += c;
  // Тоглолтын түүхийн тест: MatchZy event, CS2 log мөр, серверийн тоглогчид
  if (u.pathname === '/mz') { const r = S.mz && S.mz.url ? await fetch(S.mz.url, { method: 'POST', headers: { 'content-type': 'application/json', [S.mz.key]: S.mz.value }, body }).then(x => x.status).catch(() => 0) : 0; res.writeHead(200); return res.end(JSON.stringify({ status: r })); }
  if (u.pathname === '/emit') { emit(JSON.parse(body)); res.writeHead(200); return res.end('{}'); }
  if (u.pathname === '/emit-raw') { const t = body; for (const x of S.logHttp) await fetch(x, { method: 'POST', body: t }).catch(() => {}); res.writeHead(200); return res.end('{}'); }
  if (u.pathname === '/set-players') { S.players = JSON.parse(body); res.writeHead(200); return res.end('{}'); }
  if (u.pathname === '/fail-next') S.failNext = true;
  if (u.pathname === '/guard') {
    const q = (k) => u.searchParams.get(k);
    if (q('installed') !== null) { S.guard.installed = q('installed') === '1'; if (!S.guard.installed) S.guard.enforcing = false; }
    if (q('empty') !== null) S.guard.empty = +q('empty');
    if (q('degraded') !== null) S.guard.degraded = q('degraded') === '1';
    if (q('failOn') !== null) S.guard.failOn = q('failOn') === '1';
    if (q('resetOnMap') !== null) S.guard.resetOnMap = q('resetOnMap') === '1';
    if (q('enforcing') !== null) S.guard.enforcing = q('enforcing') === '1';
  }
  // RCON-ын эвдрэл дууриах: stall=1 → одоогийн бүх холболт хариу өгөхөө больно (TCP нээлттэй хэвээр); fragment=1 → хариуг жижиг хэсгээр
  if (u.pathname === '/rcon') {
    if (u.searchParams.get('stall') === '1') { for (const c of CONNS) c.stalled = true; }
    if (u.searchParams.get('fragment') !== null) S.fragment = u.searchParams.get('fragment') === '1';
  }
  if (u.pathname === '/round') playRound(u.searchParams.get('w'));
  if (u.pathname === '/rounds') { for (const x of (u.searchParams.get('seq') || '').split(',')) playRound(x); }
  if (u.pathname === '/no-winlimit') S.noWinlimit = u.searchParams.get('v') !== '0';
  if (u.pathname === '/lock-freeze') { S.lockFreeze = u.searchParams.get('v') !== '0'; if (S.lockFreeze) cv.mp_freezetime = '15'; }
  if (u.pathname === '/map-every-round') S.everyRound = u.searchParams.get('v') !== '0';
  if (u.pathname === '/exec-sleep') { Object.assign(cv, { mp_maxrounds: '24', mp_freezetime: '15', mp_ct_default_primary: '', mp_t_default_primary: '' }); log('#MATCHZY sleep.cfg (manual)'); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ map: S.map, autostart: S.autostart, busy: Date.now() < S.busyUntil, cv, sleepAt: S.sleepAt, restarts: S.restarts, configLog: S.configLog.slice(-200), players: S.players,
    logOn: S.logOn, logHttp: S.logHttp, score: S.score, played: S.played, over: S.over, gameOvers: S.gameOvers,
    mapCmds: S.mapCmds, spawns: S.spawns.slice(-60), roundEnds: S.roundEnds.slice(-60), cheatsWindows: S.cheatsWindows.slice(-200), cheatsOnAt: S.cheatsOnAt, guard: S.guard, rconConnections: S.rconConnections }));
}).listen(+ctlPort, '127.0.0.1');
