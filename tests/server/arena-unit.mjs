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
const aim = cat.find(m => m.id === 'aim_map');
ok(aim && aim.workshopId === '3469339086' && aim.mapName === 'aim_map' && aim.category === 'aim', 'catalog: aim_map = Workshop 3469339086 (aim)');
ok(aim.image && aim.image.startsWith('https://images.steamusercontent.com/ugc/'), 'catalog: жинхэнэ Steam Workshop screenshot URL');
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
for (const [r, mr] of [[10, '19'], [13, '25'], [16, '31']]) ok(A.aimConfig({ size: 1, weapon: 'ak47', rounds: r }).includes('mp_maxrounds ' + mr), `First to ${r} → mp_maxrounds ${mr} (+ clinch)`);
const cfg = A.aimConfig({ size: 2, weapon: 'm4a1s', rounds: 13 });
for (const c of ['bot_kick', 'bot_quota 0', 'mp_autoteambalance 0', 'mp_limitteams 0', 'mp_freezetime 0', 'mp_match_can_clinch 1', 'mp_halftime 0', 'mp_ct_default_primary weapon_m4a1_silencer', 'mp_t_default_primary weapon_m4a1_silencer', 'mp_match_end_restart 1', 'mp_restartgame 1'])
  ok(cfg.includes(c), 'AIM cfg: ' + c);
ok(A.aimConfig({ size: 1, weapon: 'm4a4', rounds: 10 }).includes('mp_t_default_primary weapon_m4a1'), 'M4A4 = weapon_m4a1');
ok(A.aimConfig({ size: 1, weapon: 'awp', rounds: 10 }).includes('mp_ct_default_primary weapon_awp'), 'AWP = weapon_awp');
ok(!cfg.some(c => /matchzy|css_|exec |rcon|quit|host_/.test(c)), 'AIM cfg: MatchZy/exec/rcon/quit команд агуулахгүй');
ok(cfg.every(c => /^[\w .:"\-]+$/.test(c)), 'AIM cfg: agent-ийн аюулгүй тэмдэгтийн шалгалтыг давна');
for (const bad of [{ size: 3, weapon: 'ak47', rounds: 10 }, { size: 1, weapon: 'negev', rounds: 10 }, { size: 1, weapon: 'ak47', rounds: 30 }, { size: '1; quit', weapon: 'ak47', rounds: 10 }, { size: 1, weapon: 'weapon_ak47', rounds: 10 }])
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
ok(rc.includes('mp_freezetime 7') && rc.includes('mp_maxrounds 30') && rc.includes('mp_t_default_primary ""') && rc.length === A.SNAPSHOT_CVARS.length, 'restoreCommands: snapshot сэргээх, аюултай утгыг хаяна');
ok(rc.every(c => /^[\w .:"\-]+$/.test(c)), 'restoreCommands: аюулгүй тэмдэгт');

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
const dirs = A.workshopDirs(cs2, '3469339086');
ok(dirs.content[0] === path.join(tmp, 'steamcmd', 'steamapps', 'workshop', 'content', '730', '3469339086'), 'Workshop зам: SteamCMD steamapps\\workshop\\content\\730\\<id> ' + dirs.content[0]);
ok(A.workshopDirs(cs2, '1; quit').content.length === 0, 'Workshop зам: буруу ID → хоосон');
ok(JSON.stringify(A.workshopFiles(cs2, '3469339086')) === '{"installed":false,"downloading":false}', 'workshopFiles: алга');
fs.mkdirSync(dirs.downloads[0], { recursive: true });
ok(A.workshopFiles(cs2, '3469339086').downloading === true, 'workshopFiles: татаж байна');
fs.mkdirSync(dirs.content[0], { recursive: true }); fs.writeFileSync(path.join(dirs.content[0], '3469339086.vpk'), 'x');
ok(A.workshopFiles(cs2, '3469339086').installed === true, 'workshopFiles: .vpk бий → татагдсан');
ok(A.workshopFiles('', '3469339086') === null, 'workshopFiles: CS2_DIR алга → тодорхойгүй (null)');
for (const [m, exp] of [['aim_map', true], ['workshop/3469339086/aim_map', true], ['workshop\\3469339086\\aim_map', true], ['de_mirage', false], ['aim_map2', false], [null, false]]) ok(A.isOnMap(m, aim) === exp, `isOnMap(${m}) = ${exp}`);

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

// ---------- сайтын allowlist + heartbeat шүүлт ----------
ok(!!throws(() => srv.validateCommand('aim_start', { map: 'de_mirage', size: 1, weapon: 'ak47', rounds: 10 })), 'сайт: competitive map-аар aim_start татгалзана');
ok(!!throws(() => srv.validateCommand('workshop_map', { map: 'aim_map' })), 'сайт: aim map-ыг workshop_map-аар ачаалахгүй (AIM-ээр л)');
ok(!!throws(() => srv.validateCommand('rcon', { cmd: 'host_workshop_map 1' })), 'сайт: дурын RCON команд байхгүй');
ok(JSON.stringify(srv.validateCommand('aim_stop', { map: 'inferno' })) === '{"map":"inferno"}', 'сайт: aim_stop competitive map');
const cl = srv.cleanArena({ mode: 'aim', aim: { map: 'aim_map', size: 9, weapon: 'ak47', rounds: 10 }, workshop: { id: 'evil', phase: 'ready' }, installed: { aim_map: true, evil: true }, catalog: ['aim_map', 'evil'] });
ok(cl.aim === null && cl.mode === 'competitive' && cl.workshop === null && JSON.stringify(cl.installed) === '{"aim_map":true}' && JSON.stringify(cl.agentCatalog) === '["aim_map"]', 'heartbeat: catalog-т байхгүй/буруу утгыг хаяна');
const cl2 = srv.cleanArena({ aim: { map: 'aim_map', size: 2, weapon: 'awp', rounds: 16, since: 5 }, workshop: { id: 'aim_map', phase: 'ready', error: 'x'.repeat(999) } });
ok(cl2.mode === 'aim' && cl2.aim.size === 2 && cl2.workshop.workshopId === '3469339086' && cl2.workshop.error.length === 240, 'heartbeat: зөв AIM төлөв хадгална, текст урт хязгаартай');

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
