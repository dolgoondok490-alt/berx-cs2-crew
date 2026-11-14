/* =========================================================
 * BERX ARENA — Workshop map + AIM 1V1 горим (agent ба сайт хоёулаа ашиглана)
 * ---------------------------------------------------------
 *  • Workshop map-ыг ЗӨВХӨН workshop-maps.json-д байгаа ID-аар (allowlist) ачаална.
 *  • Сайтаас ирэх утга бүрийг (map, 1v1/2v2, зэвсэг, round) энд дахин шалгана —
 *    RCON руу хэрэглэгчийн текст хэзээ ч шууд очихгүй, бүх команд энд үүснэ.
 *  • AIM горимд ороход өмнөх серверийн тохиргоог (convar snapshot) хадгалж,
 *    Competitive руу буцахад сэргээнэ. MatchZy-г matchzy_autostart_mode 0-ээр
 *    "унтуулж", буцахад анхны утгаар (cfg/MatchZy/config.cfg) нь сэргээнэ.
 *  • Map бодитоор ачаалагдсаныг сервер өөрөө (status) батлахаас өмнө "Бэлэн" гэж
 *    хэзээ ч мэдээлэхгүй; AIM тохиргоог буцааж уншиж шалгана.
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const WEAPONS = { ak47: 'weapon_ak47', m4a4: 'weapon_m4a1', m4a1s: 'weapon_m4a1_silencer', awp: 'weapon_awp' };
const WEAPON_LABELS = { ak47: 'AK-47', m4a4: 'M4A4', m4a1s: 'M4A1-S', awp: 'AWP' };
const WEAPON_DEF = { ak47: 7, m4a4: 16, m4a1s: 60, awp: 9 };   // WeaponPaints weapon_defindex (skin шалгалтад)
const SIZES = [1, 2];
const ROUNDS = [10, 13, 16, 30, 60];  // "First to N": аль нэг баг N round хожиход дуусна (mp_winlimit N; fallback mp_maxrounds 2N-1 + clinch)
const PHASES = ['idle', 'requested', 'downloading', 'loading', 'configuring', 'ready', 'error'];
const ID_RE = /^[a-z0-9_]{2,32}$/, WSID_RE = /^\d{6,12}$/, MAPNAME_RE = /^[a-z0-9_]{2,40}$/;

/* ---------- Catalog ---------- */
function validateCatalog(raw) {
  const maps = (raw && Array.isArray(raw.maps)) ? raw.maps : [];
  const seen = new Set(), out = [];
  for (const m of maps) {
    // mapNames: сервер (status) мэдээлэх БОДИТ map нэрс — эхнийх нь үндсэн. Хуучин "mapName" талбарыг ч дэмжинэ.
    const names = (Array.isArray(m && m.mapNames) ? m.mapNames : [m && m.mapName]).filter(Boolean).map(x => String(x).toLowerCase());
    if (!m || !ID_RE.test(m.id || '') || !WSID_RE.test(String(m.workshopId || '')) || !names.length || !names.every(n => MAPNAME_RE.test(n))) throw new Error('workshop-maps.json: буруу мөр ' + JSON.stringify(m && m.id));
    if (!['aim', 'competitive'].includes(m.category)) throw new Error('workshop-maps.json: category aim|competitive байх ёстой (' + m.id + ')');
    if (seen.has(m.id) || seen.has('ws' + m.workshopId)) throw new Error('workshop-maps.json: давхардсан ' + m.id);
    seen.add(m.id); seen.add('ws' + m.workshopId);
    const sizes = (Array.isArray(m.teamSizes) ? m.teamSizes : SIZES).map(Number).filter(n => SIZES.includes(n));
    out.push({
      id: m.id, name: String(m.name || m.id).slice(0, 40), category: m.category, workshopId: String(m.workshopId), mapName: names[0], mapNames: names,
      author: m.author ? String(m.author).slice(0, 40) : null, sizeMB: Number(m.sizeMB) || null, teamSizes: sizes.length ? sizes : SIZES,
      image: /^https:\/\/images\.steamusercontent\.com\/ugc\/[\w/]+\/?$/.test(m.image || '') ? m.image : null,
      source: `https://steamcommunity.com/sharedfiles/filedetails/?id=${m.workshopId}`
    });
  }
  return out;
}
function loadCatalog(file = path.join(__dirname, 'workshop-maps.json')) {
  return validateCatalog(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/* ---------- AIM тохиргоо (allowlist шалгалт) ---------- */
function aimSettings(input = {}, entry = null) {
  const size = Number(input.size), rounds = Number(input.rounds), weapon = String(input.weapon || '');
  if (!SIZES.includes(size) || (entry && !entry.teamSizes.includes(size))) throw new Error('Багийн хэмжээ 1v1 эсвэл 2v2 байх ёстой');
  if (!WEAPONS[weapon]) throw new Error('Зэвсэг AK-47, M4A4, M4A1-S, AWP-ийн нэг байх ёстой');
  if (!ROUNDS.includes(rounds)) throw new Error('First to ' + ROUNDS.join(', ') + '-ийн нэг байх ёстой');
  return { size, weapon, rounds };
}

// AIM горимд өөрчлөгдөх convar бүр (snapshot → сэргээлт). Утга нь snapshot уншиж чадаагүй үед ашиглах
// CS2 competitive-ийн анхдагч утга (map ачаалахад gamemode_competitive.cfg + MatchZy cfg дахин тавина).
const RESTORE_DEFAULTS = {
  game_type: '0', game_mode: '1', sv_cheats: '0',
  bot_quota: '0', mp_autoteambalance: '1', mp_limitteams: '1', mp_freezetime: '15', mp_maxrounds: '24', mp_match_can_clinch: '1',
  mp_overtime_enable: '1', mp_halftime: '1', mp_team_intro_time: '6.5', mp_roundtime: '1.92', mp_roundtime_defuse: '1.92', mp_roundtime_hostage: '1.92',
  mp_round_restart_delay: '7', mp_startmoney: '800', mp_maxmoney: '16000', mp_afterroundmoney: '0', mp_buytime: '20', mp_buy_anywhere: '0',
  mp_free_armor: '0', mp_death_drop_gun: '1', mp_death_drop_grenade: '2', mp_death_drop_defuser: '1', mp_give_player_c4: '1',
  mp_ct_default_primary: '', mp_t_default_primary: '', mp_ct_default_secondary: 'weapon_hkp2000', mp_t_default_secondary: 'weapon_glock',
  mp_ct_default_grenades: '', mp_t_default_grenades: '', mp_weapons_allow_map_placed: '0', mp_match_end_restart: '0', mp_match_restart_delay: '15',
  mp_respawn_on_death_ct: '0', mp_respawn_on_death_t: '0', sv_infinite_ammo: '0', mp_winlimit: '0', mp_equipment_reset_rounds: '0'
};
const SNAPSHOT_CVARS = Object.keys(RESTORE_DEFAULTS);
const q = (v) => (v === '' ? '""' : v);

// Map ачаалагдсаны ДАРАА (MatchZy sleep.cfg / gamemode cfg-ийн дараа) хэрэгжүүлнэ.
//  • First to N: mp_winlimit N — тэнцээ (draw) round байсан ч яг N хожилтоор дуусна; mp_maxrounds-ыг хязгаар болохооргүй том (4N-1).
//    Сервер mp_winlimit-ийг хүлээж авахгүй бол (readback) fallback: mp_maxrounds 2N-1 + mp_match_can_clinch 1.
//  • Overtime/тал солих байхгүй. Round бүр: шинэ зэвсэг + бүтэн сум (mp_equipment_reset_rounds 1), HP 100, kevlar+helmet.
function aimConfig(s, opts = {}) {
  const w = WEAPONS[s.weapon], N = s.rounds, winlimit = opts.winlimit !== false;
  return [
    'sv_cheats 0', 'bot_kick', 'bot_quota 0', 'mp_autoteambalance 0', 'mp_limitteams 0',
    'mp_freezetime 0', 'mp_team_intro_time 0', 'mp_warmup_end',
    ...(winlimit ? [`mp_winlimit ${N}`, `mp_maxrounds ${4 * N - 1}`] : ['mp_winlimit 0', `mp_maxrounds ${2 * N - 1}`]),
    'mp_match_can_clinch 1', 'mp_overtime_enable 0', 'mp_halftime 0',
    'mp_roundtime 2', 'mp_roundtime_defuse 2', 'mp_roundtime_hostage 2', 'mp_round_restart_delay 1',
    'mp_startmoney 0', 'mp_maxmoney 0', 'mp_afterroundmoney 0', 'mp_buytime 0', 'mp_buy_anywhere 0',
    'mp_free_armor 2', 'mp_death_drop_gun 0', 'mp_death_drop_grenade 0', 'mp_death_drop_defuser 0', 'mp_give_player_c4 0',
    `mp_ct_default_primary ${w}`, `mp_t_default_primary ${w}`, 'mp_ct_default_secondary weapon_usp_silencer', 'mp_t_default_secondary weapon_glock',
    'mp_ct_default_grenades ""', 'mp_t_default_grenades ""', 'mp_weapons_allow_map_placed 0', 'mp_equipment_reset_rounds 1',
    'mp_respawn_on_death_ct 0', 'mp_respawn_on_death_t 0', 'sv_infinite_ammo 0',
    'mp_match_end_restart 1', 'mp_match_restart_delay 30',   // дуусахад ӨӨР map руу шилжихгүй; 30с үр дүн харуулаад ижил тохиргоогоор дахин эхэлнэ
    ...(opts.restart === false ? [] : ['mp_restartgame 1'])   // тоглолтын дундах засварт (MatchZy/cfg дарж бичсэн) оноог тэглэхгүй
  ];
}
// Readback: required — заавал таарах (таарахгүй бол "Бэлэн" болохгүй); optional — сервер дэмжихгүй бол анхааруулга/fallback
const aimExpect = (s, opts = {}) => ({
  required: { mp_freezetime: '0', mp_round_restart_delay: '1', mp_autoteambalance: '0', mp_limitteams: '0', bot_quota: '0', mp_buytime: '0',
    mp_ct_default_primary: WEAPONS[s.weapon], mp_t_default_primary: WEAPONS[s.weapon], mp_halftime: '0', mp_overtime_enable: '0',
    mp_maxrounds: String(opts.winlimit === false ? 2 * s.rounds - 1 : 4 * s.rounds - 1) },
  optional: { ...(opts.winlimit === false ? {} : { mp_winlimit: String(s.rounds) }), mp_equipment_reset_rounds: '1' }
});

/* ---------- CS2 server log (logaddress_add_http → agent, зөвхөн 127.0.0.1) ----------
 *  Team "CT" triggered "SFUI_Notice_CTs_Win" (CT "5") (T "3")   → round-ын оноо
 *  World triggered "Match_Start" / "Game_Commencing"            → оноо 0:0
 *  Game Over: competitive ... score 10:7 after 3 min             → тоглолт дууссан */
function parseLogLine(line) {
  const t = String(line || '');
  let m = t.match(/Team "(CT|TERRORIST)" triggered "([^"]+)" \(CT "(\d+)"\) \(T "(\d+)"\)/);
  if (m) return { type: 'round', winner: m[1] === 'CT' ? 'CT' : 'T', ct: +m[3], t: +m[4] };
  m = t.match(/Game Over:.*?score (\d+):(\d+)/);
  if (m || /Game Over:/.test(t)) return { type: 'gameover', a: m ? +m[1] : null, b: m ? +m[2] : null };
  if (/World triggered "(Match_Start|Game_Commencing)"/.test(t)) return { type: 'restart' };
  return null;
}
// Тоглолтын дүн: N-д хүрсэн баг ялна. N-д хэн ч хүрээгүй бол (жишээ нь хүчээр зогсоосон) ялагчгүй.
function resultOf(score, rounds) {
  if (!score) return null;
  const ct = +score.ct || 0, t = +score.t || 0;
  if (ct >= rounds && ct > t) return { winner: 'CT', ct, t };
  if (t >= rounds && t > ct) return { winner: 'T', ct, t };
  return null;
}

/* ---------- RCON convar хариу задлах ---------- */
// "mp_freezetime = 15", "  mp_ct_default_primary = weapon_ak47 ...", 'name = "value"' гэх мэт
function parseCvar(output, name) {
  const m = String(output || '').match(new RegExp('(?:^|\\n)\\s*' + name + '\\s*=\\s*(.*)', 'i'));
  if (!m) return null;
  const rest = m[1].trim();
  let v = rest.startsWith('"') ? (rest.slice(1).split('"')[0]) : (rest.match(/^[\w.\-]*/) || [''])[0];
  if (/^(true|false)$/i.test(v)) v = /^true$/i.test(v) ? '1' : '0';
  return /^[\w.\-]{0,64}$/.test(v) ? v : null;
}
async function readSnapshot(exec) {
  const values = {}, fallback = [];
  for (const c of SNAPSHOT_CVARS) {
    const v = parseCvar(await exec(c).catch(() => ''), c);
    if (v === null) { values[c] = RESTORE_DEFAULTS[c]; fallback.push(c); } else values[c] = v;
  }
  return { values, fallback, takenAt: Date.now() };
}
function restoreCommands(snapshot) {
  const v = (snapshot && snapshot.values) || RESTORE_DEFAULTS;
  return SNAPSHOT_CVARS.map(c => `${c} ${q(/^[\w.\-]{0,64}$/.test(v[c] ?? '') ? (v[c] ?? '') : RESTORE_DEFAULTS[c])}`);
}

// MatchZy-ийн анхны autostart горим: cfg/MatchZy/config.cfg (+ config_override.cfg) — зөвхөн уншина
function readMatchzyAutostart(cs2Dir) {
  let mode = 1;
  if (!cs2Dir) return mode;
  for (const f of ['config.cfg', 'config_override.cfg']) {
    try {
      const txt = fs.readFileSync(path.join(cs2Dir, 'game', 'csgo', 'cfg', 'MatchZy', f), 'utf8');
      for (const line of txt.split(/\r?\n/)) { const m = line.match(/^\s*matchzy_autostart_mode\s+"?([0-2])"?/); if (m) mode = +m[1]; }
    } catch (e) { /* файл байхгүй */ }
  }
  return mode;
}

/* ---------- Workshop татагдсан эсэх (файлын системээс, таамаглахгүй) ---------- */
// SteamCMD суулгалт: <steamapps>\common\Counter-Strike Global Offensive → <steamapps>\workshop\content\730\<id>
function workshopDirs(cs2Dir, id) {
  if (!cs2Dir || !WSID_RE.test(String(id))) return { content: [], downloads: [] };
  const steamapps = path.resolve(cs2Dir, '..', '..');
  const roots = [steamapps, path.join(cs2Dir, 'game', 'bin', 'win64', 'steamapps'), path.join(cs2Dir, 'steamapps')];
  return {
    content: roots.map(r => path.join(r, 'workshop', 'content', '730', String(id))),
    downloads: roots.map(r => path.join(r, 'workshop', 'downloads', '730', String(id)))
  };
}
function workshopFiles(cs2Dir, id, fsx = fs) {
  if (!cs2Dir) return null;                                   // тодорхойгүй (CS2_DIR тохируулаагүй)
  const d = workshopDirs(cs2Dir, id);
  const list = (dir) => { try { return fsx.readdirSync(dir).filter(f => /\.vpk$/i.test(f)); } catch (e) { return []; } };
  const exists = (dir) => { try { return fsx.existsSync(dir); } catch (e) { return false; } };
  const vpks = d.content.flatMap(list);
  // .vpk-ийн нэр нь ихэвчлэн серверийн бодит map нэр (жишээ нь aim_map_d.vpk) — catalog-д нэмэлт баталгаа болгон ашиглана
  const names = [...new Set(vpks.map(f => f.replace(/\.vpk$/i, '').replace(/_dir$/i, '').toLowerCase()).filter(n => MAPNAME_RE.test(n) && n !== String(id)))];
  return { installed: vpks.length > 0, downloading: d.downloads.some(exists), names };
}

// Сервер мэдээлсэн map нэр энэ workshop map мөн эсэх: "aim_map", "workshop/3469339086/aim_map" г.м.
function isOnMap(serverMap, entry, extraNames = []) {
  if (!serverMap || !entry) return false;
  const s = String(serverMap).toLowerCase().replace(/\\/g, '/');
  const names = [...(entry.mapNames || [entry.mapName]), ...extraNames];
  return names.some(n => s === n || s.endsWith('/' + n)) || s.includes('/' + entry.workshopId + '/') || s === entry.workshopId;
}

/* ---------- Workshop ачаалалтын төлөв (цэвэр функц) ----------
 *  requested → downloading (файл алга / татаж байна) → loading (файл бий, map хараахан солигдоогүй)
 *  → configuring (сервер шинэ map-ыг мэдээлсэн) → ready (тохиргоо буцааж уншиж баталсан) | error (хугацаа хэтэрсэн) */
const DOWNLOAD_TIMEOUT_MS = 15 * 60e3, LOAD_TIMEOUT_MS = 3 * 60e3;
function nextPhase(cur, obs) {
  // obs: { now, onMap, files: {installed, downloading}|null, rconOk, configVerified }
  const p = { ...cur };
  if (!p || ['idle', 'error', 'ready'].includes(p.phase) && !obs.force) return p;
  const age = obs.now - (p.since || obs.now);
  if (obs.onMap && obs.rconOk) {
    if (p.phase !== 'configuring') { p.phase = 'configuring'; p.onMapAt = obs.now; }
    if (obs.configVerified) { p.phase = 'ready'; p.readyAt = obs.now; p.error = null; }
    return p;
  }
  if (obs.files && obs.files.installed) {
    if (p.phase !== 'loading') { p.phase = 'loading'; p.loadingAt = obs.now; }
    if (obs.now - (p.loadingAt || obs.now) > LOAD_TIMEOUT_MS) { p.phase = 'error'; p.error = 'Map татагдсан ч сервер ачаалсангүй (3 мин). Серверийн console-ийг шалгана уу.'; }
    return p;
  }
  if (obs.files && !obs.files.installed) { p.phase = 'downloading'; }
  else if (p.phase === 'requested' && !obs.rconOk) p.phase = 'downloading';   // CS2_DIR алга: сервер хариу өгөхгүй байгаа = татаж/ачаалж байна
  if (age > DOWNLOAD_TIMEOUT_MS) { p.phase = 'error'; p.error = 'Workshop map 15 минутад татагдсангүй. Серверийн интернэт, Steam холболт, Workshop ID-г шалгана уу.'; }
  return p;
}

// host_workshop_map-ийн шууд хариунаас алдаа илрүүлэх
function workshopCommandError(out) {
  const s = String(out || '');
  if (/Unknown command/i.test(s)) return 'Сервер host_workshop_map командыг танихгүй байна';
  if (/(failed|unable) to (download|find|load|mount)|invalid (workshop|map|file ?id)|workshop item .* not found/i.test(s)) return 'Workshop map ачаалагдсангүй: ' + s.trim().slice(0, 160);
  return null;
}

module.exports = {
  WEAPONS, WEAPON_LABELS, WEAPON_DEF, SIZES, ROUNDS, PHASES, SNAPSHOT_CVARS, RESTORE_DEFAULTS, DOWNLOAD_TIMEOUT_MS, LOAD_TIMEOUT_MS,
  validateCatalog, loadCatalog, aimSettings, aimConfig, aimExpect, parseCvar, readSnapshot, restoreCommands, parseLogLine, resultOf,
  readMatchzyAutostart, workshopDirs, workshopFiles, isOnMap, nextPhase, workshopCommandError
};
