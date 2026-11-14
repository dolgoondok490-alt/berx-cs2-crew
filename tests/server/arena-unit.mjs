// BERX ARENA — Workshop/AIM цэвэр логикийн unit тест (сүлжээ, сервергүй):  node tests/server/arena-unit.mjs
import { createRequire } from 'module'; import fs from 'fs'; import os from 'os'; import path from 'path';
const require = createRequire(import.meta.url);
const A = require('../../agent/arena-modes.js');
const srv = require('../../lib/server.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const throws = (f) => { try { f(); return null; } catch (e) { return e.message; } };

// ---------- catalog ----------
const cat = A.loadCatalog();
const aim = cat.find(m => m.id === 'aim_map1v1cfg');
ok(aim && aim.workshopId === '3418431100' && aim.name === 'Aim_map1v1cfg' && aim.mapName === 'aim_map1v1cfg' && JSON.stringify(aim.mapNames) === '["aim_map1v1cfg"]' && aim.category === 'aim', 'catalog: Aim_map1v1cfg = Workshop 3418431100, бодит runtime нэр aim_map1v1cfg (Workshop файлаас)');
ok(cat.length === 1 && !cat.some(m => m.workshopId === '3469339086' || m.id === 'aim_map'), 'catalog: хуучин aim_map (3469339086) солигдсон');
ok(aim.author === 'loganburgerking' && aim.sizeMB === 25.3 && aim.source === 'https://steamcommunity.com/sharedfiles/filedetails/?id=3418431100', 'catalog: зохиогч, хэмжээ, Workshop холбоос');
ok(A.validateCatalog({ maps: [{ id: 'aim_old', category: 'aim', workshopId: '123456', mapName: 'aim_old' }] })[0].mapNames[0] === 'aim_old', 'catalog: хуучин "mapName" талбарыг дэмжинэ');
ok(aim.image === 'https://images.steamusercontent.com/ugc/59211109400850510/68AFD410A45A6409B4C6F6D9EF625373D3302E4E/', 'catalog: Workshop хуудасны жинхэнэ preview зураг');
ok(JSON.stringify(aim.teamSizes) === '[1,2]', 'catalog: 1v1 / 2v2');
ok(srv.CATALOG.length === cat.length && srv.CATALOG[0].workshopId === aim.workshopId, 'сайт ба agent ИЖИЛ catalog файл ашиглана');
for (const [bad, why] of [
  [{ maps: [{ id: 'x', category: 'aim', workshopId: '3469339086', mapName: 'aim_map' }] }, 'хэт богино id'],
  [{ maps: [{ id: 'aim_x', category: 'aim', workshopId: '12; quit', mapName: 'aim_map' }] }, 'workshopId тоо биш'],
  [{ maps: [{ id: 'aim_x', category: 'aim', workshopId: '3469339086', mapName: 'aim map;quit' }] }, 'mapName тэмдэгт'],
  [{ maps: [{ id: 'aim_x', category: 'surf', workshopId: '3469339086', mapName: 'aim_map' }] }, 'category'],
  [{ maps: [{ id: 'aim_a', category: 'aim', workshopId: '3469339086', mapName: 'a' + 'a' }, { id: 'aim_b', category: 'aim', workshopId: '3469339086', mapName: 'bb' }] }, 'давхардсан Workshop ID']
]) ok(!!throws(() => A.validateCatalog(bad)), 'catalog татгалзана: ' + why);
ok(A.validateCatalog({ maps: [{ id: 'aim_x', category: 'aim', workshopId: '123456', mapName: 'aim_x', image: 'https://evil.example/x.png' }] })[0].image === null, 'catalog: Steam-ээс өөр зургийн URL хаягдана');

// ---------- AIM тохиргоо ----------
for (const r of [10, 13, 16, 30, 60]) {
  const c = A.aimConfig({ size: 1, weapon: 'ak47', rounds: r });
  ok(c.includes('mp_winlimit ' + r) && c.includes('mp_maxrounds ' + (4 * r - 1)), `First to ${r} → mp_winlimit ${r}, maxrounds ${4 * r - 1} (хязгаар болохгүй)`);
  const f = A.aimConfig({ size: 1, weapon: 'ak47', rounds: r }, { winlimit: false });
  ok(f.includes('mp_winlimit 0') && f.includes('mp_maxrounds ' + (2 * r - 1)) && f.includes('mp_match_can_clinch 1'), `fallback First to ${r} → maxrounds ${2 * r - 1} + clinch`);
}
ok(JSON.stringify(A.ROUNDS) === '[10,13,16,30,60]', 'round сонголт: 10, 13, 16, 30, 60');
ok(!A.aimConfig({ size: 1, weapon: 'ak47', rounds: 10 }, { restart: false }).includes('mp_restartgame 1') && A.aimConfig({ size: 1, weapon: 'ak47', rounds: 10 }).includes('mp_restartgame 1'), 'тоглолтын дундах засвар mp_restartgame-гүй (оноо тэглэхгүй)');
const exp = A.aimExpect({ size: 1, weapon: 'awp', rounds: 60 });
ok(exp.required.sv_cheats === '0' && exp.required.mp_timelimit === '0' && exp.required.mp_ct_default_secondary === 'weapon_usp_silencer' && exp.required.mp_t_default_secondary === 'weapon_glock', 'readback required: sv_cheats 0, timelimit 0, USP/Glock (map-ын sv_cheats 1 / 60 мин / Deagle-ийн эсрэг)');
ok(exp.required.mp_freezetime === '0' && exp.required.mp_round_restart_delay === '1' && exp.required.bot_quota === '0' && exp.required.mp_limitteams === '0' && exp.required.mp_autoteambalance === '0' && exp.required.mp_buytime === '0' && exp.required.mp_halftime === '0', 'readback required: freezetime 0, round restart delay 1, bot 0, balance/limit off, buytime 0, тал солихгүй');
ok(exp.optional.mp_winlimit === '60' && exp.optional.mp_equipment_reset_rounds === '1', 'readback optional: mp_winlimit 60, equipment reset 1');
const cfg = A.aimConfig({ size: 2, weapon: 'm4a1s', rounds: 13 });
for (const c of ['bot_kick', 'bot_quota 0', 'mp_autoteambalance 0', 'mp_limitteams 0', 'mp_freezetime 0', 'mp_round_restart_delay 1', 'mp_buytime 0', 'mp_equipment_reset_rounds 1', 'mp_overtime_enable 0', 'mp_match_can_clinch 1', 'mp_halftime 0', 'mp_ct_default_primary weapon_m4a1_silencer', 'mp_t_default_primary weapon_m4a1_silencer', 'mp_match_end_restart 1', 'mp_restartgame 1'])
  ok(cfg.includes(c), 'AIM cfg: ' + c);
ok(A.aimConfig({ size: 1, weapon: 'm4a4', rounds: 10 }).includes('mp_t_default_primary weapon_m4a1'), 'M4A4 = weapon_m4a1');
ok(A.aimConfig({ size: 1, weapon: 'awp', rounds: 10 }).includes('mp_ct_default_primary weapon_awp'), 'AWP = weapon_awp');
ok(!cfg.some(c => /matchzy|css_|exec |rcon|quit|host_/.test(c)), 'AIM cfg: MatchZy/exec/rcon/quit команд агуулахгүй');
ok(cfg.every(c => /^[\w .:"\-]+$/.test(c)), 'AIM cfg: agent-ийн аюулгүй тэмдэгтийн шалгалтыг давна');
for (const bad of [{ size: 3, weapon: 'ak47', rounds: 10 }, { size: 1, weapon: 'negev', rounds: 10 }, { size: 1, weapon: 'ak47', rounds: 20 }, { size: 1, weapon: 'ak47', rounds: 61 }, { size: '1; quit', weapon: 'ak47', rounds: 10 }, { size: 1, weapon: 'weapon_ak47', rounds: 10 }])
  ok(!!throws(() => A.aimSettings(bad, aim)), 'aimSettings татгалзана ' + JSON.stringify(bad));
ok(JSON.stringify(A.aimSettings({ size: '2', weapon: 'awp', rounds: '16' }, aim)) === '{"size":2,"weapon":"awp","rounds":16}', 'aimSettings: string тоог хөрвүүлнэ');

// ---------- convar задлах / snapshot / сэргээлт ----------
ok(A.parseCvar('mp_freezetime = 15', 'mp_freezetime') === '15', 'parseCvar: энгийн');
ok(A.parseCvar('  mp_ct_default_primary = weapon_m4a1 ( def. "" )\n client', 'mp_ct_default_primary') === 'weapon_m4a1', 'parseCvar: тайлбартай мөр');
ok(A.parseCvar('mp_t_default_primary = ""', 'mp_t_default_primary') === '', 'parseCvar: хоосон string');
ok(A.parseCvar('mp_roundtime = 1.920000', 'mp_roundtime') === '1.920000', 'parseCvar: бутархай');
ok(A.parseCvar('sv_cheats = false', 'sv_cheats') === '0', 'parseCvar: bool');
ok(A.parseCvar('Unknown command "mp_x"', 'mp_x') === null && A.parseCvar('', 'mp_x') === null, 'parseCvar: олдоогүй → null');
ok(A.parseCvar('mp_ct_default_primary = "x; quit"', 'mp_ct_default_primary') === null, 'parseCvar: аюултай утга → null');
const snap = await A.readSnapshot(async (c) => c === 'mp_freezetime' ? 'mp_freezetime = 7' : c === 'mp_maxrounds' ? 'mp_maxrounds = 30' : '');
ok(snap.values.mp_freezetime === '7' && snap.values.mp_maxrounds === '30' && snap.fallback.includes('mp_roundtime'), 'readSnapshot: уншсан утга + уншиж чадаагүйг анхдагчаар');
const rc = A.restoreCommands({ values: { ...snap.values, mp_t_default_primary: 'x; quit' } });
ok(rc.includes('mp_freezetime 7') && rc.includes('mp_maxrounds 30') && rc.includes('mp_t_default_primary ""') && rc.length === A.SNAPSHOT_CVARS.length - 2, 'restoreCommands: snapshot сэргээх, аюултай утгыг хаяна');
ok(!snap.fallback.includes('mp_respawn_immunitytime') && !rc.some(c => /^(mp_respawn_immunitytime|mp_warmup_online_enabled) /.test(c)), 'анхдагч нь тодорхойгүй convar-ыг уншиж чадаагүй бол таамаг утга тавихгүй');
const snap2 = await A.readSnapshot(async (c) => c === 'mp_respawn_immunitytime' ? 'mp_respawn_immunitytime = 4' : c === 'mp_timelimit' ? 'mp_timelimit = 25' : '');
const rc2 = A.restoreCommands(snap2);
ok(rc2.includes('mp_respawn_immunitytime 4') && rc2.includes('mp_timelimit 25'), 'уншсан бол map-ын өөрчилсөн convar-ыг (immunity, timelimit) сэргээнэ');
const legacy = A.restoreCommands({ values: { mp_freezetime: '7' } });
ok(legacy.includes('mp_timelimit 0') && legacy.includes('bot_dont_shoot 0') && legacy.includes('sv_disable_immunity_alpha 0') && legacy.includes('sv_cheats 0') && !legacy.some(c => /immunitytime|warmup_online/.test(c)), 'v1.3.1-ийн хуучин snapshot: шинэ convar-ыг competitive анхдагчаар сэргээнэ');
ok(rc.every(c => /^[\w .:"\-]+$/.test(c)), 'restoreCommands: аюулгүй тэмдэгт');

// ---------- Map-ын өөрийн тохиргоо (бодит Aim_map1v1cfg entity) ↔ round guard ----------
const MAPFIX = JSON.parse(fs.readFileSync(new URL('./fixtures/aim_map1v1cfg-entities.json', import.meta.url), 'utf8'));
ok(MAPFIX.workshopId === aim.workshopId && MAPFIX.mapName === aim.mapName, 'fixture: бодит map-аас задалсан entity — catalog-той таарна');
const mapCmds = [...MAPFIX.onMapSpawn, ...MAPFIX.onNewGame, ...MAPFIX.onNewGameRelay];
for (const [w, r] of [['awp', 10], ['ak47', 60], ['m4a1s', 13]]) for (const wl of [true, false]) {
  const st = { size: 1, weapon: w, rounds: r }, g = A.aimGuard(st, { winlimit: wl }), req = A.aimExpect(st, { winlimit: wl }).required;
  const conflicts = mapCmds.map(c => c.split(' ')).filter(([k, v]) => k in req && String(req[k]) !== v).map(([k]) => k);
  ok(conflicts.length >= 6 && conflicts.every(k => g.some(c => c.startsWith(k + ' '))), `guard ${w} first to ${r}${wl ? '' : ' (fallback)'}: map-ын зөрчилтэй ${conflicts.length} convar-ыг бүгдийг дахин тавина (${conflicts.join(', ')})`);
}
const g = A.aimGuard({ size: 1, weapon: 'awp', rounds: 10 });
ok(g[0] === 'sv_cheats 0' && !g.includes('mp_restartgame 1') && !g.includes('bot_kick') && !g.includes('mp_warmup_end'), 'guard: sv_cheats 0 эхэнд; mp_restartgame/bot_kick/warmup_end байхгүй (оноо тэглэхгүй)');
ok(['mp_round_restart_delay 1', 'mp_t_default_primary weapon_awp', 'mp_t_default_secondary weapon_glock', 'mp_ct_default_secondary weapon_usp_silencer', 'mp_maxrounds 39', 'mp_winlimit 10', 'mp_timelimit 0', 'mp_startmoney 0', 'mp_freezetime 0'].every(c => g.includes(c)), 'guard: delay 1, AWP, USP/Glock, First to 10, timelimit 0, мөнгө 0, freeze 0');
ok(g.every(c => /^[\w .:"\-]+$/.test(c)), 'guard: agent-ийн аюулгүй тэмдэгтийн шалгалтыг давна');
ok(A.GUARD_CHECK.every(k => k in A.aimExpect({ size: 1, weapon: 'awp', rounds: 10 }).required), 'guard-ын хоёр дахь шалгалтын convar бүр required readback-д бий');
const mapCvars = mapCmds.map(c => c.split(' ')[0]).filter(k => k !== 'game_alias');
ok(mapCvars.every(k => A.SNAPSHOT_CVARS.includes(k)) && A.SNAPSHOT_CVARS.includes('game_type') && A.SNAPSHOT_CVARS.includes('game_mode'), 'map-ын өөрчилдөг convar бүр (game_alias custom → game_type/game_mode) Competitive руу буцахад сэргээгдэнэ');
ok(A.aimConfig({ size: 1, weapon: 'ak47', rounds: 10 }).includes('mp_timelimit 0'), 'AIM cfg: mp_timelimit 0 (map-ын 60 минутын хязгаарыг цуцална)');

// ---------- MatchZy autostart (cfg уншина, өөрчлөхгүй) ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berx-arena-'));
const cs2 = path.join(tmp, 'steamcmd', 'steamapps', 'common', 'Counter-Strike Global Offensive');
fs.mkdirSync(path.join(cs2, 'game', 'csgo', 'cfg', 'MatchZy'), { recursive: true });
ok(A.readMatchzyAutostart(cs2) === 1 && A.readMatchzyAutostart('') === 1, 'MatchZy autostart: файлгүй → 1');
fs.writeFileSync(path.join(cs2, 'game', 'csgo', 'cfg', 'MatchZy', 'config.cfg'), '// x\nmatchzy_autostart_mode 2\n');
ok(A.readMatchzyAutostart(cs2) === 2, 'MatchZy autostart: config.cfg-оос');
fs.writeFileSync(path.join(cs2, 'game', 'csgo', 'cfg', 'MatchZy', 'config_override.cfg'), 'matchzy_autostart_mode "0"\n');
ok(A.readMatchzyAutostart(cs2) === 0, 'MatchZy autostart: config_override.cfg давамгайлна');

// ---------- Workshop файл / map танилт ----------
const dirs = A.workshopDirs(cs2, '3418431100');
ok(dirs.content[0] === path.join(tmp, 'steamcmd', 'steamapps', 'workshop', 'content', '730', '3418431100'), 'Workshop зам: SteamCMD steamapps\\workshop\\content\\730\\<id> ' + dirs.content[0]);
ok(A.workshopDirs(cs2, '1; quit').content.length === 0, 'Workshop зам: буруу ID → хоосон');
ok(JSON.stringify(A.workshopFiles(cs2, '3418431100')) === '{"installed":false,"downloading":false,"names":[]}', 'workshopFiles: алга');
fs.mkdirSync(dirs.downloads[0], { recursive: true });
ok(A.workshopFiles(cs2, '3418431100').downloading === true, 'workshopFiles: татаж байна');
fs.mkdirSync(dirs.content[0], { recursive: true });
// Бодит dedicated server-ийн файлын бүтэц (3469339086 дээр шалгасан): <id>_dir.vpk + <id>_000.vpk
fs.writeFileSync(path.join(dirs.content[0], '3418431100_dir.vpk'), 'x'); fs.writeFileSync(path.join(dirs.content[0], '3418431100_000.vpk'), 'x');
let wf = A.workshopFiles(cs2, '3418431100');
ok(wf.installed === true && JSON.stringify(wf.names) === '[]', 'workshopFiles: <id>_dir.vpk + <id>_000.vpk → татагдсан, файлын нэрийг map нэр гэж андуурахгүй (regression)');
fs.writeFileSync(path.join(dirs.content[0], '3418431100.vpk'), 'x');
ok(JSON.stringify(A.workshopFiles(cs2, '3418431100').names) === '[]', 'workshopFiles: Steam client-ийн <id>.vpk бүтэц ч map нэр биш');
ok(A.workshopFiles('', '3418431100') === null, 'workshopFiles: CS2_DIR алга → тодорхойгүй (null)');
fs.writeFileSync(path.join(dirs.content[0], 'aim_extra.vpk'), 'x');
wf = A.workshopFiles(cs2, '3418431100');
ok(JSON.stringify(wf.names) === '["aim_extra"]', 'workshopFiles: id-аас өөр нэртэй .vpk байвал нэмэлт нэр болгоно');
ok(!A.isOnMap('aim_extra', aim) && A.isOnMap('aim_extra', aim, wf.names), 'нэмэлт нэрээр таних (catalog-ийн mapNames үндсэн)');
for (const [m, exp] of [['aim_map1v1cfg', true], ['AIM_MAP1V1CFG', true], ['workshop/3418431100/aim_map1v1cfg', true], ['workshop\\3418431100\\aim_map1v1cfg', true],
  ['aim_map_1v1cfg', false], ['aim_map', false], ['aim_map_d', false], ['workshop/3469339086/aim_map_d', false], ['aim_map1v1cfg2', false], ['de_mirage', false], [null, false]]) ok(A.isOnMap(m, aim) === exp, `isOnMap(${m}) = ${exp}`);

// ---------- төлөвийн машин: "Бэлэн" зөвхөн сервер батлахад ----------
const t0 = 1_000_000;
let p = { phase: 'requested', since: t0 };
p = A.nextPhase(p, { now: t0 + 1000, onMap: false, files: { installed: false, downloading: true }, rconOk: false, configVerified: false }); ok(p.phase === 'downloading', 'phase: файл алга → downloading');
p = A.nextPhase(p, { now: t0 + 5000, onMap: false, files: { installed: true }, rconOk: false, configVerified: false }); ok(p.phase === 'loading', 'phase: .vpk бий, map солигдоогүй → loading');
p = A.nextPhase(p, { now: t0 + 6000, onMap: true, files: { installed: true }, rconOk: false, configVerified: true }); ok(p.phase === 'loading', 'phase: RCON хариу өгөхгүй бол map-ыг баталсан гэж үзэхгүй');
p = A.nextPhase(p, { now: t0 + 7000, onMap: true, files: { installed: true }, rconOk: true, configVerified: false }); ok(p.phase === 'configuring', 'phase: сервер map-аа мэдээлсэн, тохиргоо баталгаажаагүй → configuring');
p = A.nextPhase(p, { now: t0 + 9000, onMap: true, files: { installed: true }, rconOk: true, configVerified: true }); ok(p.phase === 'ready' && p.readyAt === t0 + 9000, 'phase: map + тохиргоо баталсан → ready');
let e = A.nextPhase({ phase: 'downloading', since: t0 }, { now: t0 + A.DOWNLOAD_TIMEOUT_MS + 1, onMap: false, files: { installed: false }, rconOk: true }); ok(e.phase === 'error' && /15 минут/.test(e.error), 'phase: татах хугацаа хэтэрсэн → error');
e = A.nextPhase({ phase: 'loading', since: t0, loadingAt: t0 }, { now: t0 + A.LOAD_TIMEOUT_MS + 1, onMap: false, files: { installed: true }, rconOk: true }); ok(e.phase === 'error', 'phase: ачаалах хугацаа хэтэрсэн → error');
e = A.nextPhase({ phase: 'requested', since: t0 }, { now: t0 + 2000, onMap: false, files: null, rconOk: false }); ok(e.phase === 'downloading', 'phase: CS2_DIR алга, сервер хариугүй → downloading');
ok(A.nextPhase({ phase: 'error', error: 'x' }, { now: t0, onMap: true, rconOk: true, configVerified: true }).phase === 'error', 'phase: error-оос өөрөө ready болохгүй');
ok(A.workshopCommandError('Failed to download workshop item 1') && A.workshopCommandError('Unknown command "host_workshop_map"') && !A.workshopCommandError('') && !A.workshopCommandError('Loading map...'), 'host_workshop_map хариуны алдаа таних');

// ---------- CS2 log → оноо, First to N дүн ----------
const L = (x) => A.parseLogLine('11/15/2026 - 04:21:00.123 - ' + x);
ok(JSON.stringify(L('Team "CT" triggered "SFUI_Notice_CTs_Win" (CT "5") (T "3")')) === '{"type":"round","winner":"CT","ct":5,"t":3}', 'log: CT round хожил → 5:3');
ok(L('Team "TERRORIST" triggered "SFUI_Notice_Terrorists_Win" (CT "5") (T "4")').winner === 'T', 'log: T round хожил');
ok(L('Game Over: competitive mg_active aim_map1v1cfg score 59:60 after 41 min').type === 'gameover', 'log: Game Over');
ok(L('World triggered "Round_Start"').type === 'roundstart' && L('World triggered "Round_End"') === null, 'log: Round_Start → round guard');
ok(L('World triggered "Match_Start" on "aim_map1v1cfg"').type === 'restart' && L('"DOK<2><[U:1:1]><CT>" say "gg"') === null, 'log: Match_Start → 0:0, бусад мөр үл хамаарна');
ok(A.resultOf({ ct: 59, t: 59 }, 60) === null, 'First to 60: 59:59 → дуусаагүй');
ok(JSON.stringify(A.resultOf({ ct: 60, t: 59 }, 60)) === '{"winner":"CT","ct":60,"t":59}', 'First to 60: 60:59 → CT ялна');
ok(A.resultOf({ ct: 12, t: 60 }, 60).winner === 'T' && A.resultOf({ ct: 13, t: 9 }, 13).winner === 'CT' && A.resultOf({ ct: 12, t: 12 }, 13) === null, 'First to N: зөвхөн N-д хүрсэн баг');
ok(A.WEAPON_DEF.ak47 === 7 && A.WEAPON_DEF.m4a4 === 16 && A.WEAPON_DEF.m4a1s === 60 && A.WEAPON_DEF.awp === 9, 'AIM зэвсгийн WeaponPaints defindex');

// ---------- сайтын allowlist + heartbeat шүүлт ----------
ok(!!throws(() => srv.validateCommand('aim_start', { map: 'de_mirage', size: 1, weapon: 'ak47', rounds: 10 })), 'сайт: competitive map-аар aim_start татгалзана');
ok(!!throws(() => srv.validateCommand('workshop_map', { map: 'aim_map1v1cfg' })), 'сайт: aim map-ыг workshop_map-аар ачаалахгүй (AIM-ээр л)');
ok(!!throws(() => srv.validateCommand('rcon', { cmd: 'host_workshop_map 1' })), 'сайт: дурын RCON команд байхгүй');
ok(JSON.stringify(srv.validateCommand('aim_stop', { map: 'inferno' })) === '{"map":"inferno"}', 'сайт: aim_stop competitive map');
const cl = srv.cleanArena({ mode: 'aim', aim: { map: 'aim_map1v1cfg', size: 9, weapon: 'ak47', rounds: 10 }, workshop: { id: 'evil', phase: 'ready' }, installed: { aim_map1v1cfg: true, evil: true }, catalog: ['aim_map1v1cfg', 'evil'] });
ok(cl.aim === null && cl.mode === 'competitive' && cl.workshop === null && JSON.stringify(cl.installed) === '{"aim_map1v1cfg":true}' && JSON.stringify(cl.agentCatalog) === '["aim_map1v1cfg"]', 'heartbeat: catalog-т байхгүй/буруу утгыг хаяна');
const cl2 = srv.cleanArena({ aim: { map: 'aim_map1v1cfg', size: 2, weapon: 'awp', rounds: 16, since: 5 }, workshop: { id: 'aim_map1v1cfg', phase: 'ready', error: 'x'.repeat(999), runtimeMap: 'aim_map1v1cfg' } });
ok(cl2.mode === 'aim' && cl2.aim.size === 2 && cl2.workshop.workshopId === '3418431100' && cl2.workshop.error.length === 240, 'heartbeat: зөв AIM төлөв хадгална, текст урт хязгаартай');
const old = srv.cleanArena({ mode: 'aim', aim: { map: 'aim_map', size: 1, weapon: 'ak47', rounds: 10 }, workshop: { id: 'aim_map', phase: 'ready' }, installed: { aim_map: true }, catalog: ['aim_map'] });
ok(old.aim === null && old.workshop === null && JSON.stringify(old.installed) === '{}', 'хуучин agent (aim_map) heartbeat → сайт хуучин map-ыг харуулахгүй');

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
