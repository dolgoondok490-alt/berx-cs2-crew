// BERX Match Recorder — unit (I/O-гүй). node tests/matches/recorder-unit.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { MatchRecorder, MatchQueue, parseLog, steam64 } = require('../../agent/match-recorder.js');
const { validateMatch, aggregate, ingestLocal } = require('../../lib/matches.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

// ---------- туслах: бодит CS2 log мөр ----------
let clock = Date.UTC(2026, 10, 15, 6, 0, 0), ms = 0;
const ts = () => { ms += 7; const d = new Date(clock + ms); return `11/15/2026 - ${d.toISOString().slice(11, 19)}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`; };
const L = (body) => `${ts()} - ${body}`;
const U = (n) => `[U:1:${n}]`, S = (n) => (76561197960265728n + BigInt(n)).toString();
const pl = (name, uid, n, team) => `"${name}<${uid}><${n === 'BOT' ? 'BOT' : U(n)}><${team}>"`;
const A1 = pl('Dok', 2, 1001, 'CT'), B1 = pl('Kaze <3', 3, 1002, 'TERRORIST'), A2 = pl('Bat', 4, 1003, 'CT'), B2 = pl('Tuya', 5, 1004, 'TERRORIST'), BOT = pl('BOT Eli', 9, 'BOT', 'TERRORIST');
const kill = (a, v, w = 'ak47', hs = false) => L(`${a} [10 20 30] killed ${v} [40 50 60] with "${w}"${hs ? ' (headshot)' : ''}`);
const score = (side, ct, t) => L(`Team "${side}" triggered "SFUI_Notice_${side === 'CT' ? 'CTs' : 'Terrorists'}_Win" (CT "${ct}") (T "${t}")`);
const att = (a, v, dmg, hp) => L(`${a} [1 2 3] attacked ${v} [4 5 6] with "ak47" (damage "${dmg}") (damage_armor "3") (health "${hp}") (armor "90") (hitgroup "chest")`);
let n = 0; const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const mk = () => new MatchRecorder({ serverId: 'main', agentVersion: '1.4.0', now: () => clock + ms, newId: ids });
const AIM1 = { aim: { mode: 'aim1v1', map: 'workshop/3418431100/aim_map1v1cfg', workshop_id: '3418431100', aim_weapon: 'awp', target_rounds: 3 } };

/* ---------- 1. parser + SteamID ---------- */
console.log('\n== parser');
ok(steam64('[U:1:1001]') === S(1001) && steam64('BOT') === null && steam64('STEAM_1:1:500') === (76561197960265728n + 1001n).toString(), 'SteamID3/SteamID → SteamID64, BOT → null');
let e = parseLog(kill(A1, B1, 'awp', true));
ok(e.type === 'kill' && e.a.steam === S(1001) && e.v.steam === S(1002) && e.v.name === 'Kaze <3' && e.headshot && e.a.team === 'CT' && e.v.team === 'T', 'kill мөр: нэр дотор "<" байсан ч SteamID, тал, headshot зөв');
ok(parseLog(kill(A1, B1)).headshot === false, 'headshot-гүй kill');
ok(parseLog(L(`${A1} assisted killing ${B1}`)).type === 'assist' && parseLog(L(`${A1} flash-assisted killing ${B1}`)) === null, 'assist; flash-assist тусдаа (тоологдохгүй)');
ok(parseLog(`L 11/15/2026 - 06:00:01: ${A1} [1 2 3] killed ${B1} [4 5 6] with "awp"`).type === 'kill', 'хуучин "L ...:" формат ч уншигдана');

/* ---------- 2. AIM 1v1 бүтэн тоглолт ---------- */
console.log('\n== AIM 1v1');
let R = mk(); R.setRoster([{ steamId: S(1001), name: 'Dok', team: 'CT' }, { steamId: S(1002), name: 'Kaze', team: 'T' }, { steamId: null, name: 'BOT x', bot: true }]);
R.onLog([kill(A1, B1), kill(B1, A1)].join('\n'), AIM1);                      // warmup — live тоглолт байхгүй
ok(!R.live && !R.out.length, 'Match_Start-аас өмнөх (warmup) kill тоологдохгүй');
R.onLog(L('World triggered "Match_Start" on "aim_map1v1cfg"'), AIM1);
ok(R.live && R.live.mode === 'aim1v1' && R.live.map === 'aim_map1v1cfg' && R.live.players[S(1001)] && R.live.players[S(1002)], 'Match_Start → AIM тоглолт, roster-оос 2 тоглогч');
const r1 = [L('World triggered "Round_Start"'), att(A1, B1, 27, 73), att(A1, B1, 120, 0), kill(A1, B1, 'awp', true), score('CT', 1, 0)];
R.onLog(r1.join('\n'), AIM1);
R.onLog(r1.join('\n'), AIM1);                                                  // HTTP давхар илгээлт
const r2 = [L('World triggered "Round_Start"'), kill(B1, A1, 'awp'), L(`${A1} assisted killing ${B1}`), kill(BOT, A1), kill(A1, BOT), score('TERRORIST', 1, 1)];
const r3 = [L('World triggered "Round_Start"'), L(`${B1} [1 1 1] committed suicide with "world"`), score('CT', 2, 1)];
const r4 = [L('World triggered "Round_Start"'), att(B1, A1, 40, 60), att(pl('Dok', 2, 1001, 'CT'), A1, 10, 50), kill(A1, B1, 'awp'), score('CT', 3, 1), L('World triggered "Round_End"'), L('Game Over: competitive mg_active aim_map1v1cfg score 3:1 after 2 min')];
R.onLog([...r2, ...r3, ...r4].join('\n'), AIM1);
let out = R.drain(); let m = out[0];
ok(out.length === 1 && m.status === 'completed' && m.winner === 'CT' && m.score_ct === 3 && m.score_t === 1 && m.rounds_played === 4, 'AIM completed: CT 3:1 (first to 3), 4 round');
let a = m.players.find(p => p.steam_id === S(1001)), b = m.players.find(p => p.steam_id === S(1002));
ok(a.kills === 2 && a.headshot_kills === 1 && a.deaths === 2 && a.assists === 1, 'Dok: 2 kill (давхар мөр, bot-ыг алсныг тоолоогүй), 1 HS, 2 death (bot-д алагдсан нь death), 1 assist');
ok(b.kills === 1 && b.deaths === 3 && b.suicides === 1, 'Kaze: 1 kill, 3 death (1 нь suicide)');
ok(a.damage === 100 && b.damage === 40 && m.has_damage, 'ADR damage: overkill тоологдоогүй (27+73=100), өөрийгөө шархдуулсан орохгүй');
ok(a.rounds_played === 4 && b.rounds_played === 4 && m.has_mvp === false && a.mvp === null, '4 round тоглосон; MVP log-д байхгүй → null');
ok(m.aim_weapon === 'awp' && m.target_rounds === 3 && m.workshop_id === '3418431100' && m.source === 'cs2log', 'AIM тохиргоо, Workshop ID');
ok(!m.players.some(p => !/^7656119/.test(p.steam_id)), 'bot тоглогчийн жагсаалтад алга');
let v; try { v = validateMatch(m, clock + ms + 1000); } catch (x) { v = x; }
ok(v && v.id === m.id, 'backend validateMatch: зөв дүн хүлээж авна ' + (v && v.message || ''));

{ const R9 = mk(); R9.setRoster([{ steamId: S(1001), team: 'CT' }, { steamId: S(1002), team: 'T' }]); R9.onLog(L('World triggered "Match_Start" on "aim_map1v1cfg"'), AIM1);
  const same = '11/15/2026 - 06:10:00.000 - ' + `${A1} [1 1 1] killed ${B1} [2 2 2] with "awp"`;
  R9.onLog(same + '\n' + score('CT', 1, 0), AIM1); R9.onLog(same + '\n' + score('CT', 2, 0), AIM1);
  ok(R9.live.players[S(1001)].kills === 2, 'ms-гүй timestamp-тэй ижил текст бүхий 2 бодит kill (өөр round) хоёулаа тоологдоно'); }
/* ---------- 3. Rematch → шинэ ID, тохиргооны restart бичигдэхгүй ---------- */
console.log('\n== rematch / restarts');
R.onLog(L('World triggered "Match_Start" on "aim_map1v1cfg"'), AIM1);
const id2 = R.live.id;
R.onLog(L('World triggered "Match_Start" on "aim_map1v1cfg"'), AIM1);          // round-гүй restart (тохиргоо)
ok(R.drain().length === 0 && R.live.id !== id2, 'round тоглогдоогүй restart → бичигдэхгүй, шинэ ID');
R.onLog([kill(A1, B1), score('CT', 1, 0)].join('\n'), AIM1);
const id3 = R.live.id;
R.onLog(L('World triggered "Match_Start" on "aim_map1v1cfg"'), AIM1);          // rematch дунд нь
out = R.drain();
ok(out.length === 1 && out[0].id === id3 && out[0].status === 'aborted' && out[0].status_reason === 'restarted' && out[0].winner === null, 'дуусаагүй тоглолтын дундуур rematch → aborted (restarted), ялагчгүй');
ok(R.live.id !== id3 && R.live.id !== m.id, 'rematch → ШИНЭ match ID');

/* ---------- 4. Competitive руу буцах / ялагч тодорсон ч Game Over ирээгүй ---------- */
R.onLog([kill(A1, B1), score('CT', 1, 0), kill(A1, B1), score('CT', 2, 0), kill(A1, B1), score('CT', 3, 0)].join('\n'), AIM1);
R.check({ map: 'de_mirage', online: true, aim: false });
out = R.drain();
ok(out.length === 1 && out[0].status === 'completed' && out[0].winner === 'CT', 'зорилтод хүрсний дараа Competitive руу буцвал completed хэвээр');
R.onLog(L('World triggered "Match_Start" on "aim_map1v1cfg"'), AIM1); R.onLog([kill(A1, B1), score('CT', 1, 0)].join('\n'), AIM1);
R.check({ map: 'aim_map1v1cfg', online: true, aim: false });
out = R.drain();
ok(out.length === 1 && out[0].status === 'aborted' && out[0].status_reason === 'returned_to_competitive', 'дуусаагүй AIM → Competitive руу буцах → aborted (returned_to_competitive)');

/* ---------- 5. AIM 2v2: багийн kill, disconnect/reconnect, баг солих ---------- */
console.log('\n== AIM 2v2');
const AIM2 = { aim: { ...AIM1.aim, mode: 'aim2v2', target_rounds: 2, aim_weapon: 'ak47' } };
R = mk(); R.setRoster([{ steamId: S(1001), team: 'CT', name: 'Dok' }, { steamId: S(1003), team: 'CT', name: 'Bat' }, { steamId: S(1002), team: 'T', name: 'Kaze' }, { steamId: S(1004), team: 'T', name: 'Tuya' }]);
R.onLog(L('World triggered "Match_Start" on "aim_map1v1cfg"'), AIM2);
R.onLog([kill(A1, A2), kill(B1, A1), kill(B2, A2), L(`${B2} assisted killing ${A1}`), score('TERRORIST', 0, 1), L(`${A2} disconnected (reason "Disconnect")`)].join('\n'), AIM2);
R.setRoster([{ steamId: S(1001), team: 'CT' }, { steamId: S(1002), team: 'T' }, { steamId: S(1004), team: 'T' }]);
R.onLog([kill(A1, B1), score('CT', 1, 1)].join('\n'), AIM2);
R.setRoster([{ steamId: S(1001), team: 'CT' }, { steamId: S(1003), team: 'CT' }, { steamId: S(1002), team: 'T' }, { steamId: S(1004), team: 'T' }]);
R.onLog([L(`${pl('Bat', 6, 1003, '')} entered the game`), L(`"Bat<6><${U(1003)}>" switched from team <Unassigned> to <CT>`), kill(pl('Bat', 6, 1003, 'CT'), B2, 'ak47', true), kill(pl('Bat', 6, 1003, 'CT'), B1), score('CT', 2, 1), L('Game Over: competitive mg_active aim_map1v1cfg score 2:1 after 3 min')].join('\n'), AIM2);
m = R.drain()[0];
const by = Object.fromEntries(m.players.map(p => [p.steam_id, p]));
ok(m.mode === 'aim2v2' && m.status === 'completed' && m.winner === 'CT' && m.players.length === 4, 'AIM 2v2 completed, 4 тоглогч');
ok(by[S(1001)].team_kills === 1 && by[S(1001)].kills === 1 && by[S(1003)].deaths === 2, 'багийн kill: kill-д орохгүй (team_kills), хохирогчид death');
ok(by[S(1003)].kills === 2 && by[S(1003)].headshot_kills === 1 && by[S(1003)].rounds_played === 2 && by[S(1003)].connected_at_end, 'disconnect→reconnect: нэг SteamID-д нэгтгэгдсэн, тасарсан round тоологдоогүй (2/3)');
ok(by[S(1004)].assists === 1 && by[S(1004)].kills === 1, 'assist (зөвхөн дайсныг алахад)');

/* ---------- 6. Competitive (MatchZy 0.9.2 event) ---------- */
console.log('\n== Competitive / MatchZy');
const mzPl = (sid, name, k, d, a, hs, dmg, mvp, rp) => ({ steamid: sid, name, stats: { kills: k, deaths: d, assists: a, headshot_kills: hs, damage: dmg, mvp, rounds_played: rp, team_kills: 0, suicides: 0, kast: 70 } });
const team = (score, players) => ({ id: 't', name: 'x', series_score: 0, score, score_ct: 0, score_t: 0, players });
R = mk(); R.setRoster([{ steamId: S(1001), team: 'CT' }, { steamId: S(1002), team: 'T' }]);
R.onMatchZy({ event: 'round_end', matchid: 7, map_number: 0, team1: team(1, []), team2: team(0, []), winner: { side: 'ct', team: 'team1' } }, { map: 'de_mirage' });
ok(!R.live, 'going_live-аас өмнөх (knife/warmup) round_end тоологдохгүй');
R.onMatchZy({ event: 'going_live', matchid: 7, map_number: 0 }, { map: 'de_mirage' });
const ext = R.live.ext;
R.onMatchZy({ event: 'round_end', matchid: 7, map_number: 0, round_number: 1, winner: { side: 'ct', team: 'team1' },
  team1: team(1, [mzPl(S(1001), 'Dok', 2, 0, 0, 1, 180, 1, 1), { steamid: '0', name: 'BOT', stats: { kills: 9 } }]), team2: team(0, [mzPl(S(1002), 'Kaze', 0, 1, 0, 0, 40, 0, 1)]) }, { map: 'de_mirage' });
// halftime: team1 нь T тал руу шилжсэн
R.onMatchZy({ event: 'round_end', matchid: 7, map_number: 0, round_number: 13, winner: { side: 't', team: 'team1' },
  team1: team(13, [mzPl(S(1001), 'Dok', 30, 10, 4, 15, 2600, 6, 22)]), team2: team(9, [mzPl(S(1002), 'Kaze', 12, 25, 3, 5, 1500, 2, 22)]) }, { map: 'de_mirage' });
R.onMatchZy({ event: 'round_end', matchid: 7, map_number: 0, round_number: 13, winner: { side: 't', team: 'team1' },
  team1: team(13, [mzPl(S(1001), 'Dok', 30, 10, 4, 15, 2600, 6, 22)]), team2: team(9, [mzPl(S(1002), 'Kaze', 12, 25, 3, 5, 1500, 2, 22)]) }, { map: 'de_mirage' });   // давхар event
R.onMatchZy({ event: 'map_result', matchid: 7, map_number: 0, winner: { side: 't', team: 'team1' },
  team1: team(13, [mzPl(S(1001), 'Dok', 30, 10, 4, 15, 2600, 6, 22)]), team2: team(9, [mzPl(S(1002), 'Kaze', 12, 25, 3, 5, 1500, 2, 22)]) }, { map: 'de_mirage' });
m = R.drain()[0];
ok(m.mode === 'competitive' && m.source === 'matchzy' && m.external_ref === ext && m.status === 'completed', 'MatchZy going_live → map_result = completed');
ok(m.winner === 'T' && m.score_t === 13 && m.score_ct === 9 && m.rounds_played === 22, 'halftime-ийн дараа: team1 T талд 13:9 ялсан → winner T, оноо зөв талд');
a = m.players.find(p => p.steam_id === S(1001));
ok(a.team === 'T' && a.kills === 30 && a.headshot_kills === 15 && a.damage === 2600 && a.mvp === 6 && m.has_damage && m.has_mvp, 'MatchZy-ийн хуримтлагдсан статистик (давхар event-д ч нэмэгдээгүй), damage+MVP');
ok(m.players.length === 2, 'MatchZy bot (steamid 0) хасагдсан');
try { v = validateMatch(m, clock + ms + 1000); } catch (x) { v = x; } ok(v && v.id === m.id, 'competitive дүн validate ' + (v.message || ''));
// MatchZy .restart → going_live дахин → өмнөх тоглолт aborted
R.onMatchZy({ event: 'going_live', matchid: 8, map_number: 0 }, { map: 'de_inferno' });
R.onMatchZy({ event: 'round_end', matchid: 8, map_number: 0, winner: { side: 'ct', team: 'team1' }, team1: team(2, [mzPl(S(1001), 'Dok', 3, 1, 0, 1, 300, 1, 3)]), team2: team(1, [mzPl(S(1002), 'Kaze', 1, 3, 0, 0, 200, 1, 3)]) }, { map: 'de_inferno' });
R.onMatchZy({ event: 'going_live', matchid: 8, map_number: 0 }, { map: 'de_inferno' });
out = R.drain(); ok(out.length === 1 && out[0].status === 'aborted' && out[0].status_reason === 'restarted' && out[0].score_ct === 2, 'MatchZy restart → өмнөх aborted (restarted)');
// AIM руу шилжих → competitive aborted
R.onMatchZy({ event: 'round_end', matchid: 8, map_number: 0, winner: { side: 'ct', team: 'team1' }, team1: team(1, [mzPl(S(1001), 'Dok', 1, 0, 0, 0, 100, 1, 1)]), team2: team(0, []) }, { map: 'de_inferno' });
R.check({ map: 'de_inferno', online: true, aim: true });
out = R.drain(); ok(out.length === 1 && out[0].status_reason === 'mode_changed', 'Competitive дундуур AIM эхэлсэн → aborted (mode_changed)');

/* ---------- 7. Тасалдал: сервер унах, agent restart ---------- */
console.log('\n== interruption / agent restart');
R = mk(); R.setRoster([{ steamId: S(1001), team: 'CT' }, { steamId: S(1002), team: 'T' }]);
R.onLog(L('World triggered "Match_Start" on "aim_map1v1cfg"'), AIM1); R.onLog([kill(A1, B1), score('CT', 1, 0)].join('\n'), AIM1);
let saved = JSON.parse(JSON.stringify(R.toJSON()));
let R2 = mk(); R2.restore(saved); out = R2.drain();
ok(out.length === 1 && out[0].status === 'interrupted' && out[0].status_reason === 'agent_restart' && out[0].players.find(p => p.steam_id === S(1001)).kills === 1, 'AIM дундуур agent restart → interrupted (бүртгэсэн бодит тоо хэвээр)');
R = mk(); R.onMatchZy({ event: 'going_live', matchid: 9 }, { map: 'de_nuke' });
R.onMatchZy({ event: 'round_end', matchid: 9, winner: { side: 'ct', team: 'team1' }, team1: team(1, [mzPl(S(1001), 'Dok', 1, 0, 0, 0, 100, 1, 1)]), team2: team(0, [mzPl(S(1002), 'Kaze', 0, 1, 0, 0, 0, 0, 1)]) }, { map: 'de_nuke' });
saved = JSON.parse(JSON.stringify(R.toJSON())); R2 = mk(); R2.restore(saved);
ok(R2.live && R2.drain().length === 0, 'Competitive дундуур agent restart → үргэлжилнэ (MatchZy хуримтлагдсан)');
R2.onMatchZy({ event: 'map_result', matchid: 9, winner: { side: 'ct', team: 'team1' }, team1: team(13, [mzPl(S(1001), 'Dok', 20, 5, 1, 9, 2000, 5, 18)]), team2: team(5, [mzPl(S(1002), 'Kaze', 5, 20, 0, 1, 900, 0, 18)]) }, { map: 'de_nuke' });
m = R2.drain()[0]; ok(m && m.status === 'completed' && m.players.find(p => p.steam_id === S(1001)).kills === 20, 'restart-ын дараа map_result → бүрэн completed');
R = mk(); R.onMatchZy({ event: 'going_live', matchid: 10 }, { map: 'de_nuke' });
R.onMatchZy({ event: 'round_end', matchid: 10, winner: { side: 't', team: 'team2' }, team1: team(0, [mzPl(S(1001), 'Dok', 0, 1, 0, 0, 0, 0, 1)]), team2: team(1, [mzPl(S(1002), 'Kaze', 1, 0, 0, 1, 100, 1, 1)]) }, { map: 'de_nuke' });
R.check({ online: false }); ms += 11 * 60e3; R.check({ online: false });
out = R.drain(); ok(out.length === 1 && out[0].status === 'interrupted' && out[0].status_reason === 'server_offline', 'сервер 10+ мин унтарсан → interrupted');
R = mk(); R.onMatchZy({ event: 'going_live', matchid: 11 }, { map: 'de_nuke' });
R.onMatchZy({ event: 'round_end', matchid: 11, winner: { side: 'ct', team: 'team1' }, team1: team(1, [mzPl(S(1001), 'Dok', 1, 0, 0, 0, 100, 1, 1)]), team2: team(0, []) }, { map: 'de_nuke' });
R.check({ map: 'de_dust2', online: true }); out = R.drain();
ok(out.length === 1 && out[0].status === 'aborted' && out[0].status_reason === 'map_changed', 'дуусаагүй байхад map солигдсон → aborted (map_changed)');

/* ---------- 8. Queue: backoff, dedupe, rejected ---------- */
console.log('\n== queue');
let t = 1000; const Q = new MatchQueue({ now: () => t, rand: () => 0.5 });
Q.add({ id: 'a' }); Q.add({ id: 'a' }); Q.add({ id: 'b' });
ok(Q.items.length === 2, 'нэг ID-г дахин дараалалд оруулахгүй');
let it = Q.due(); ok(Q.result(it, 503, 'down') === 'retry' && it.nextAt === t + 5000, 'сүлжээ/5xx → retry, 5с backoff');
Q.result(it, 0, 'ECONNREFUSED'); ok(it.nextAt === t + 10000, '2 дахь алдаа → 10с');
for (let i = 0; i < 12; i++) Q.result(it, 500, 'x'); ok(it.nextAt - t === 300000, 'backoff дээд хязгаар 5 мин');
ok(Q.result(it, 401, 'auth') === 'retry', '401 (secret буруу/солигдсон) → устгахгүй, retry');
ok(Q.result(it, 404, 'Not found') === 'retry' && Q.items.includes(it), '404 (agent сайтаас өмнө шинэчлэгдсэн) → алдагдахгүй, retry');
ok(Q.due().match.id === 'b' && Q.result(Q.due(), 400, 'bad') === 'rejected' && Q.rejected.length === 1, '400 (буруу өгөгдөл) → rejected, дахин илгээхгүй');
t += 400000; it = Q.due(); ok(Q.result(it, 200) === 'sent' && Q.items.length === 0, '200 → дарааллаас хасагдсан');
const Q2 = new MatchQueue(); Q2.restore(JSON.parse(JSON.stringify({ items: [{ match: { id: 'z' }, attempts: 3, nextAt: 9e15 }] })));
ok(Q2.due() && Q2.due().match.id === 'z', 'agent restart → дараалал сэргэж, шууд илгээнэ');

/* ---------- 9. Backend: validate хамгаалалт, aggregate ---------- */
console.log('\n== backend validate / aggregate');
const good = JSON.parse(JSON.stringify(out[0] || m));
const bad = (f, msg) => { const x = JSON.parse(JSON.stringify(good)); f(x); let e2 = null; try { validateMatch(x, clock + ms + 1000); } catch (er) { e2 = er; } ok(e2 && e2.status === 400, 'validate татгалзана: ' + msg); };
bad(x => { x.players[0].steam_id = 'Dok'; }, 'нэр/буруу SteamID');
bad(x => { x.players.push({ ...x.players[0] }); }, 'давхардсан SteamID');
bad(x => { x.players[0].headshot_kills = x.players[0].kills + 1; }, 'headshot > kills');
bad(x => { x.status = 'completed'; x.winner = 'CT'; x.score_ct = 0; x.score_t = 1; }, 'ялагч оноотой таарахгүй');
bad(x => { x.score_ct = 99; }, 'оноо > round');
bad(x => { x.id = 'abc'; }, 'match ID формат');
bad(x => { x.mode = 'aim1v1'; }, 'AIM-д зэвсэг/round заавал');
bad(x => { x.started_at = Date.now() + 864e5 * 30; x.ended_at = x.started_at; }, 'ирээдүйн огноо');
const rows = [
  { status: 'completed', result: 'win', kills: 20, deaths: 10, assists: 2, headshot_kills: 10, damage: 2000, rounds_played: 20 },
  { status: 'completed', result: 'loss', kills: 1, deaths: 10, assists: 0, headshot_kills: 0, damage: null, rounds_played: 10 },
  { status: 'aborted', result: null, kills: 50, deaths: 0, assists: 0, headshot_kills: 50, damage: 5000, rounds_played: 5 }];
const g = aggregate(rows);
ok(g.matches === 2 && g.wins === 1 && g.losses === 1 && g.winRate === 50 && g.unfinished === 1, 'aggregate: зөвхөн completed (aborted орохгүй)');
ok(g.kd === 1.05 && g.hsPct === 47.6, 'K/D = нийт 21/20 (дундаж биш), HS% = 10/21');
ok(g.adr === 100 && g.adrMatches === 1, 'ADR = damage бүртгэгдсэн тоглолтоос л (2000/20)');
const g0 = aggregate([]); ok(g0.matches === 0 && g0.kd === null && g0.adr === null && g0.winRate === null, 'тоглолтгүй → null (0 зохиохгүй)');
const T = {}; const vm = validateMatch(good, clock + ms + 1000);
ok(ingestLocal(T, vm).duplicate === false && ingestLocal(T, vm).duplicate === true && T.berx_matches.length === 1 && T.berx_match_players.length === vm.players.length, 'ingest idempotent: ижил ID дахин → duplicate, давхардахгүй');
let clash = null; try { ingestLocal(T, { ...vm, id: '00000000-0000-4000-8000-999999999999' }); } catch (x) { clash = x; }
ok(clash && clash.status === 409, 'өөр ID, ижил сервер+эхэлсэн цаг → 409');

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
