// BERX RANKED & BRP — цэвэр логикийн unit тест (томъёо, хязгаар, эрх, ledger mirror, leaderboard, agent lock, сайтын шалгалт)
//   node tests/ranking/unit.mjs   (сүлжээ, DB шаардлагагүй)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
process.env.SUPABASE_URL = ''; process.env.SUPABASE_SECRET_KEY = '';
const RK = require('../../lib/ranking.js');
const { validateMatch } = require('../../lib/matches.js');
const { MatchRecorder } = require('../../agent/match-recorder.js');
const server = require('../../lib/server.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

/* ---------- 1. BRP хязгаар (хатуу) ---------- */
console.log('\n== BRP ranges');
let wmin = 1e9, wmax = -1e9, lmin = 1e9, lmax = -1e9, intsOnly = true, mono = true, prevW = -1e9, prevL = -1e9;
for (let s = 0; s <= 100; s += 0.01) {
  const w = RK.competitiveDelta('win', s), l = RK.competitiveDelta('loss', s);
  wmin = Math.min(wmin, w); wmax = Math.max(wmax, w); lmin = Math.min(lmin, l); lmax = Math.max(lmax, l);
  if (!Number.isInteger(w) || !Number.isInteger(l)) intsOnly = false;
  if (w < prevW || l < prevL) mono = false; prevW = w; prevL = l;
}
ok(wmin === 150 && wmax === 230, `хожил +150…+230 (бодит ${wmin}…${wmax})`);
ok(lmin === -200 && lmax === -130, `хожигдол −200…−130 (бодит ${lmin}…${lmax})`);
ok(intsOnly, 'BRP өөрчлөлт үргэлж бүхэл тоо');
ok(mono, 'илүү сайн үзүүлэлт → хэзээ ч бага BRP биш (монотон)');
ok(RK.competitiveDelta('win', 50) === 190 && RK.competitiveDelta('loss', 50) === -165, 'score 50: +190 / −165 (round(150+80·s/100), round(200−70·s/100))');
ok(RK.competitiveDelta('win', 999) === 230 && RK.competitiveDelta('loss', -5) === -200 && RK.competitiveDelta('win', NaN) === 150, 'хязгаараас гарсан/буруу score → clamp');
ok(RK.aimDelta('win') === 30 && RK.aimDelta('loss') === -30, 'AIM ±30 тогтмол');

/* ---------- 2. competitive-v1 үзүүлэлт ---------- */
console.log('\n== performance score (competitive-v1)');
const P = (o) => ({ steam_id: '76561198000000001', kills: 20, deaths: 15, assists: 5, headshot_kills: 10, team_kills: 0, damage: 2400, rounds_played: 24, team: 'CT', ...o });
const team5 = (me) => [me, P({ steam_id: '2', kills: 15, deaths: 17, assists: 4, damage: 1900 }), P({ steam_id: '3', kills: 12, deaths: 18, assists: 6, damage: 1500 }), P({ steam_id: '4', kills: 18, deaths: 16, assists: 3, damage: 2100 }), P({ steam_id: '5', kills: 10, deaths: 19, assists: 8, damage: 1300 })];
const me = P({});
const a = RK.performance(me, team5(me), true);
ok(a.score >= 0 && a.score <= 100 && Math.round(a.score * 100) === a.score * 100, `0–100, 2 оронтой (${a.score})`);
ok(JSON.stringify(a) === JSON.stringify(RK.performance(P({}), team5(P({})), true)), 'тодорхой: ижил оролт → яг ижил гаралт');
ok(a.weights_used.kd === 30 && a.weights_used.adr === 30 && a.weights_used.contribution === 25 && a.weights_used.assists === 10 && a.weights_used.hs === 5, 'жин 30/30/25/10/5');
const nod = RK.performance({ ...me, damage: null }, team5(me).map(x => ({ ...x, damage: null })), false);
ok(nod.components.adr === null && nod.weights_used.adr === 0 && Math.abs(Object.values(nod.weights_used).reduce((x, y) => x + y, 0) - 100) < 0.05 && nod.redistributed.includes('adr'),
  `damage алга → ADR-ийн жин бусдад хуваарилагдсан, тэмдэглэгдсэн (${JSON.stringify(nod.weights_used)})`);
const zero = RK.performance(P({ kills: 0, deaths: 0, assists: 0, headshot_kills: 0, damage: 0 }), [P({ kills: 0, deaths: 0, assists: 0, headshot_kills: 0, damage: 0 })], true);
ok(Number.isFinite(zero.score) && zero.components.hs === 0 && zero.components.contribution === 0.5, `0 kill / 0 death → NaN гарахгүй (${zero.score})`);
const ot = RK.performance(P({ kills: 40, deaths: 30, assists: 10, headshot_kills: 20, damage: 4800, rounds_played: 48 }), [P({ kills: 40, deaths: 30, assists: 10, headshot_kills: 20, damage: 4800, rounds_played: 48 }), P({ steam_id: '2', kills: 40, deaths: 30, assists: 10, headshot_kills: 20, damage: 4800, rounds_played: 48 })], true);
const reg = RK.performance(P({ kills: 20, deaths: 15, assists: 5, headshot_kills: 10, damage: 2400, rounds_played: 24 }), [P({}), P({ steam_id: '2' })], true);
ok(ot.score === reg.score, `overtime: round-д ногдохоор хэвийнжүүлсэн (48 round = 24 round-ын 2 дахин → ижил ${ot.score})`);
const out = RK.performance(P({ kills: 80, deaths: 0, assists: 40, headshot_kills: 80, damage: 20000 }), team5(P({ kills: 80, deaths: 0, assists: 40, headshot_kills: 80, damage: 20000 })), true);
ok(out.score <= 100 && Object.values(out.components).every(v => v === null || (v >= 0 && v <= 1)), `outlier: бүрэлдэхүүн бүр [0,1]-д clamp (${out.score})`);
const eq1 = RK.performance(P({ steam_id: 'x' }), [P({ steam_id: 'x' }), P({ steam_id: 'y' })], true), eq2 = RK.performance(P({ steam_id: 'y' }), [P({ steam_id: 'x' }), P({ steam_id: 'y' })], true);
ok(eq1.score === eq2.score, 'ижил статистиктай 2 тоглогч → ижил оноо');
const better = RK.performance(P({ kills: 28, damage: 3200 }), team5(P({ kills: 28, damage: 3200 })), true);
ok(better.score > a.score, `илүү kill/damage → өндөр оноо (${better.score} > ${a.score})`);
const tk = RK.performance(P({ team_kills: 5 }), team5(P({ team_kills: 5 })), true);
ok(tk.score < a.score, 'team kill нь kill-ээс хасагдана');
const dc = RK.performance(P({ kills: 10, deaths: 7, assists: 2, headshot_kills: 5, damage: 1200, rounds_played: 12 }), team5(me), true);
ok(dc.rounds === 12 && dc.score > 0, 'хагас тоглосон тоглогч: өөрийн тоглосон round-аар хэвийнжүүлнэ');

/* ---------- 3. Lock шалгалт ---------- */
console.log('\n== lock validation');
const S = (n) => (76561198000000000n + BigInt(n)).toString();
const CT5 = [1, 2, 3, 4, 5].map(S), T5 = [6, 7, 8, 9, 10].map(S);
const lockC = { v: 1, type: 'ranked', locked_at: Date.UTC(2026, 10, 15, 10), agent: '1.5.0', roster: { CT: CT5, T: T5 }, bots: 0, rules: { mode: 'competitive', map: 'de_mirage', server_mode: 'competitive', cheats: false }, guard: null };
ok(throws(() => RK.validateLock(null, 'competitive'), /lock/), 'ranked + lock байхгүй → 400');
ok(throws(() => RK.validateLock({ ...lockC, roster: { CT: ['Dok'], T: [] } }, 'competitive'), /SteamID64/), 'lock roster-т буруу SteamID → 400');
ok(throws(() => RK.validateLock({ ...lockC, agent: undefined }, 'competitive'), /agent/), 'lock.agent заавал');
const vl = RK.validateLock({ ...lockC, extra: 'x', rules: { ...lockC.rules, evil: 1 } }, 'competitive');
ok(!('extra' in vl) && !('evil' in vl.rules), 'lock-ийн мэдэгдэхгүй талбар хаягдана');

/* ---------- 4. Шийдвэр (eligibility) ---------- */
console.log('\n== eligibility decisions');
const T0 = Date.UTC(2026, 10, 15, 12);
const settings = { enabled: true, competitive: true, aim: true, enabled_at: T0 - 86400e3, rules: {} };
const users = Object.fromEntries([...CT5, ...T5].map((s, i) => [s, { id: 'u' + String(i).padStart(2, '0') }]));
const ps = (score) => [...CT5.map((s, i) => P({ steam_id: s, team: 'CT', kills: 20 - i * 2, deaths: 14 + i, damage: 2200 - i * 150, rounds_played: 24 })), ...T5.map((s, i) => P({ steam_id: s, team: 'T', kills: 17 - i * 2, deaths: 16 + i, damage: 2000 - i * 150, rounds_played: 24 }))];
const M = (o = {}) => ({ id: 'm1', mode: 'competitive', match_type: 'ranked', status: 'completed', winner: 'CT', score_ct: 13, score_t: 11, rounds_played: 24, map: 'de_mirage', started_at: T0, ended_at: T0 + 2400e3, duration_s: 2400,
  has_damage: true, agent_version: '1.5.0', lock: lockC, ...o });
const ctx = (o = {}) => ({ settings, users, recentLineups: [], duplicateRef: false, now: T0, ...o });
let d = RK.decide(M(), ps(), ctx());
ok(d.status === 'rated' && d.changes.length === 10, 'бүрэн 5v5, бүгд холбогдсон → rated, 10 өөрчлөлт');
ok(d.changes.filter(c => c.result === 'win').every(c => c.delta_calc >= 150 && c.delta_calc <= 230) && d.changes.filter(c => c.result === 'loss').every(c => c.delta_calc <= -130 && c.delta_calc >= -200), 'ялагч +150…+230, ялагдагч −130…−200');
ok(d.changes.every(c => c.detail.weights_used && c.detail.formula === 'competitive-v1' && c.reason), 'өөрчлөлт бүрт score, жин, томъёо, шалтгаан хадгалагдана');
ok(d.changes.map(c => c.user_id).join() === d.changes.map(c => c.user_id).sort().join(), 'өөрчлөлт user_id-аар эрэмбэлэгдсэн (түгжээний дараалал)');
// Halftime: эцэст тал солигдсон (CT бүлэг → T тал) — бүлгээр шалгана
const swapped = ps().map(p => ({ ...p, team: p.team === 'CT' ? 'T' : 'CT' }));
d = RK.decide(M({ winner: 'T', score_ct: 11, score_t: 13 }), swapped, ctx());
ok(d.status === 'rated' && d.changes.filter(c => c.result === 'win').map(c => c.steam_id).sort().join() === CT5.slice().sort().join(), 'halftime-ийн дараа тал солигдсон ч зөв бүлэг ялагч');
const R = (o, c = {}, players = ps()) => RK.decide(M(o), players, ctx(c));
ok(R({}, { settings: { ...settings, enabled: false } }).reason === 'ranking_disabled', 'нийт flag унтраалттай → not_eligible');
ok(R({}, { settings: { ...settings, competitive: false } }).reason === 'mode_disabled', 'Competitive flag унтраалттай → not_eligible');
ok(R({ lock: null }).reason === 'no_lock', 'lock алга → not_eligible');
ok(R({ lock: { ...lockC, agent: '1.4.0' }, agent_version: '1.4.0' }).reason === 'old_agent', 'хуучин agent → not_eligible');
ok(R({ started_at: settings.enabled_at - 1 }).reason === 'before_activation', 'чансаа асахаас өмнө эхэлсэн → retroactive BRP байхгүй');
ok(R({}, { settings: { ...settings, enabled_at: null } }).reason === 'before_activation', 'enabled_at алга → олгохгүй');
ok(R({ status: 'aborted', winner: null }).reason === 'not_completed' && R({ status: 'interrupted', winner: null }).reason === 'not_completed', 'aborted / interrupted → not_eligible');
ok(R({ winner: 'draw', score_ct: 12, score_t: 12 }).reason === 'draw', 'тэнцээ → not_eligible');
ok(R({ lock: { ...lockC, bots: 1 } }).reason === 'bots', 'bot оролцсон → not_eligible');
ok(R({ lock: { ...lockC, roster: { CT: CT5.slice(0, 4), T: T5 } } }).reason === 'roster_size', '4v5 → not_eligible');
ok(R({ lock: { ...lockC, roster: { CT: [...CT5.slice(0, 4), T5[0]], T: T5 } } }).reason === 'duplicate_player', 'хоёр багт ижил тоглогч → not_eligible');
const u2 = { ...users }; delete u2[T5[2]];
ok(R({}, { users: u2 }).reason === 'unlinked_player', 'Steam холбоогүй тоглогч → not_eligible');
ok(R({}, { duplicateRef: true }).reason === 'duplicate_ref', 'ижил MatchZy match ID аль хэдийн тооцогдсон → not_eligible');
ok(R({ lock: { ...lockC, rules: { ...lockC.rules, cheats: true } } }).status === 'review', 'sv_cheats 1-тэй түгжигдсэн → шалгалт');
ok(R({ lock: { ...lockC, rules: { ...lockC.rules, server_mode: 'practice' } } }).reason === 'rules_mismatch', 'practice горим → шалгалт');
d = R({}, {}, [...ps(), P({ steam_id: S(99), team: 'T', rounds_played: 10 })]);
ok(d.status === 'review' && d.reason === 'extra_player' && d.proposal && d.proposal.changes.length === 10, 'түгжээнд байгаагүй тоглогч → шалгалт (санал хадгалагдсан)');
d = R({}, {}, ps().map(p => p.steam_id === T5[0] ? { ...p, team: 'CT' } : p));
ok(d.status === 'review' && d.reason === 'team_mismatch' && d.proposal === null, 'тоглогч баг сольсон → шалгалт, BRP тооцох боломжгүй (proposal null)');
d = R({}, {}, ps().map(p => p.steam_id === CT5[1] ? { ...p, rounds_played: 6 } : p));
ok(d.status === 'review' && d.note.includes('low_participation'), 'disconnect (round-ын <50%) → шалгалт');
d = R({}, {}, ps().filter(p => p.steam_id !== CT5[4]));
ok(d.status === 'review' && d.note.includes('low_participation'), 'roster-ийн тоглогч огт бүртгэгдээгүй → шалгалт');
ok(R({ duration_s: 300 }).reason === 'too_short' && R({ rounds_played: 10, score_ct: 10, score_t: 0 }).note.includes('too_short'), 'хэт богино → шалгалт');
const key = RK.lineupKey(CT5, T5);
ok(R({}, { recentLineups: [key, key] }).status === 'rated' && R({}, { recentLineups: [key, key, key] }).reason === 'farming_lineup', 'ижил бүрэлдэхүүн 24ц-т 3 → 4 дэх нь шалгалт (anti-farming)');
ok(RK.lineupKey(T5, CT5) === key && RK.lineupKey(CT5.slice().reverse(), T5) === key, 'бүрэлдэхүүний түлхүүр тал/дарааллаас үл хамаарна');
ok(R({}, { settings: { ...settings, rules: { max_same_lineup_24h_competitive: 10 } }, recentLineups: [key, key, key] }).status === 'rated', 'admin дүрэм өөрчилж болно');
// AIM
const SA = S(1), SB = S(6), SC = S(2), SD = S(7);
const lockA = (o = {}) => ({ v: 1, type: 'ranked', locked_at: T0, agent: '1.5.0', roster: { CT: [SA], T: [SB] }, bots: 0, rules: { mode: 'aim1v1', map: 'aim_map1v1cfg', weapon: 'awp', target_rounds: 13 }, guard: { ok: true, version: '1.0.0' }, ...o });
const AM = (o = {}) => M({ mode: 'aim1v1', map: 'aim_map1v1cfg', aim_weapon: 'awp', target_rounds: 13, score_ct: 13, score_t: 9, rounds_played: 22, duration_s: 400, has_damage: true, lock: lockA(), ...o });
const aps = [P({ steam_id: SA, team: 'CT', rounds_played: 22 }), P({ steam_id: SB, team: 'T', rounds_played: 22 })];
d = RK.decide(AM(), aps, ctx());
ok(d.status === 'rated' && d.changes.find(c => c.steam_id === SA).delta_calc === 30 && d.changes.find(c => c.steam_id === SB).delta_calc === -30 && d.formula === 'aim-fixed-v1', 'AIM 1v1 ranked → ±30');
ok(RK.decide(AM({ target_rounds: 10, score_ct: 10, lock: lockA({ rules: { mode: 'aim1v1', map: 'aim_map1v1cfg', weapon: 'awp', target_rounds: 10 } }) }), aps, ctx()).reason === 'first_to_10', 'First to 10 → хэзээ ч BRP биш');
ok(RK.decide(AM({ lock: lockA({ guard: null }) }), aps, ctx()).reason === 'guard_missing' && RK.decide(AM({ lock: lockA({ guard: { ok: false } }) }), aps, ctx()).reason === 'guard_missing', 'BERX Guard идэвхгүй → Ranked AIM BRP байхгүй');
ok(RK.decide(AM(), aps, ctx({ settings: { ...settings, aim: false } })).reason === 'mode_disabled', 'AIM flag унтраалттай → not_eligible');
ok(RK.decide(AM({ aim_weapon: 'ak47' }), aps, ctx()).reason === 'rules_mismatch', 'зэвсэг түгжсэнээс өөр → шалгалт');
const l22 = lockA({ roster: { CT: [SA, SC], T: [SB, SD] }, rules: { mode: 'aim2v2', map: 'aim_map1v1cfg', weapon: 'awp', target_rounds: 13 } });
d = RK.decide(AM({ mode: 'aim2v2', lock: l22 }), [...aps, P({ steam_id: SC, team: 'CT', rounds_played: 22 }), P({ steam_id: SD, team: 'T', rounds_played: 22 })], ctx());
ok(d.status === 'rated' && d.changes.length === 4, 'AIM 2v2 ranked → 4 тоглогч ±30');
ok(RK.decide(AM({ mode: 'aim2v2', lock: lockA({ roster: { CT: [SA], T: [SB] }, rules: { ...l22.rules } }) }), aps, ctx()).reason === 'roster_size', 'AIM 2v2 гэхдээ 1v1 roster → not_eligible');

/* ---------- 5. Ledger mirror (applyLocal) ---------- */
console.log('\n== ledger (JS mirror)');
const DB = { berx_matches: [{ id: 'm1', mode: 'competitive', match_type: 'ranked', status: 'completed', winner: 'CT' }, { id: 'm2', mode: 'aim1v1', match_type: 'ranked', status: 'completed', winner: 'T' }, { id: 'mc', mode: 'aim1v1', match_type: 'casual', status: 'completed', winner: 'T' }] };
const ch = (uid, result, dc, score = null) => ({ user_id: uid, steam_id: S(+uid.slice(1) + 1), result, delta_calc: dc, score, reason: 'x' });
let r = RK.applyLocal(DB, { action: 'auto', match_id: 'm1', revision: 1, status: 'rated', reason: 'ok', formula: 'competitive-v1', changes: [ch('u1', 'win', 200, 70), ch('u2', 'loss', -150, 40)] }, 1000);
ok(r.status === 'rated' && DB.berx_ratings.find(x => x.user_id === 'u1').brp === 1200 && DB.berx_ratings.find(x => x.user_id === 'u2').brp === 850, 'шинэ тоглогч 1000-аас эхэлж, өөрчлөлт хэрэгжсэн');
r = RK.applyLocal(DB, { action: 'auto', match_id: 'm1', revision: 1, status: 'rated', reason: 'ok', changes: [ch('u1', 'win', 200)] }, 1001);
ok(r.existing && DB.berx_rating_changes.length === 2 && DB.berx_ratings.find(x => x.user_id === 'u1').brp === 1200, 'ижил тоглолт дахин → давхар олгохгүй');
r = RK.applyLocal(DB, { action: 'auto', match_id: 'm1', revision: 2, status: 'rated', reason: 'ok', changes: [ch('u1', 'win', 230)] }, 1002);
ok(r.existing && r.flag === 'revised_after_rating' && DB.berx_rating_changes.length === 2, 'шийдвэрийн дараах revision → flag, дахин олгохгүй');
DB.berx_ratings.find(x => x.user_id === 'u2').brp = 20;
r = RK.applyLocal(DB, { action: 'auto', match_id: 'm2', revision: 1, status: 'rated', reason: 'ok', changes: [ch('u2', 'loss', -30), ch('u1', 'win', 30)] }, 1003);
const u2c = DB.berx_rating_changes.find(x => x.match_id === 'm2' && x.user_id === 'u2');
ok(u2c.delta === -20 && u2c.delta_calc === -30 && u2c.new_brp === 0 && DB.berx_ratings.find(x => x.user_id === 'u2').brp === 0, '0-ээс доош орохгүй (delta_calc −30 → бодит −20, 0 BRP)');
ok(DB.berx_rating_changes.every(c => c.new_brp === c.prev_brp + c.delta), 'ledger: new = prev + delta');
ok(throws(() => RK.applyLocal(DB, { action: 'auto', match_id: 'mc', status: 'rated', reason: 'ok', changes: [ch('u1', 'win', 30)] }, 1004), /not a completed ranked/), 'Casual тоглолтод BRP олгох оролдлого → татгалзана (SQL-ийн давхар хамгаалалт)');
ok(throws(() => RK.applyLocal(DB, { action: 'auto', match_id: 'nope', status: 'rated', changes: [] })), 'байхгүй тоглолт → алдаа');
// review → approve / reject
DB.berx_matches.push({ id: 'm3', mode: 'aim1v1', match_type: 'ranked', status: 'completed', winner: 'CT' }, { id: 'm4', mode: 'aim1v1', match_type: 'ranked', status: 'completed', winner: 'CT' });
RK.applyLocal(DB, { action: 'auto', match_id: 'm3', status: 'review', reason: 'extra_player', proposal: { changes: [ch('u1', 'win', 30), ch('u2', 'loss', -30)] }, changes: [] }, 1005);
ok(DB.berx_rating_changes.filter(c => c.match_id === 'm3').length === 0, 'review → BRP хөдлөхгүй');
ok(throws(() => RK.applyLocal(DB, { action: 'approve', match_id: 'm3', admin_id: 'adm', note: 'ok', changes: [] }), /reason required/), 'зөвшөөрөхөд шалтгаан (5+) заавал');
RK.applyLocal(DB, { action: 'approve', match_id: 'm3', admin_id: 'adm', note: 'checked replay', changes: [ch('u1', 'win', 30), ch('u2', 'loss', -30)] }, 1006);
ok(DB.berx_rating_changes.filter(c => c.match_id === 'm3').length === 2 && DB.berx_ranked_matches.find(x => x.match_id === 'm3').decided_by === 'adm' && DB.berx_ranking_audit.some(a => a.action === 'review_approve'), 'admin зөвшөөрөл → BRP + audit');
ok(throws(() => RK.applyLocal(DB, { action: 'approve', match_id: 'm3', admin_id: 'adm', note: 'again!!', changes: [ch('u1', 'win', 30)] }), /not in review/), 'дахин зөвшөөрөх боломжгүй');
RK.applyLocal(DB, { action: 'auto', match_id: 'm4', status: 'review', reason: 'too_short', changes: [] }, 1007);
RK.applyLocal(DB, { action: 'reject', match_id: 'm4', admin_id: 'adm', note: 'test match' }, 1008);
ok(DB.berx_ranked_matches.find(x => x.match_id === 'm4').status === 'rejected' && !DB.berx_rating_changes.some(c => c.match_id === 'm4'), 'татгалзсан → BRP байхгүй');
// adjustments
ok(throws(() => RK.adjustLocal(DB, { user_id: 'u1', steam_id: S(2), delta: 50, reason: 'abc', admin_id: 'adm' }), /reason/), 'засварт шалтгаан заавал');
ok(throws(() => RK.adjustLocal(DB, { user_id: 'u1', steam_id: S(2), delta: 5000, reason: 'too much', admin_id: 'adm' }), /1\.\.1000/), 'засвар ±1000-аас их → татгалзана');
r = RK.adjustLocal(DB, { user_id: 'u2', steam_id: S(3), delta: -100, reason: 'cheating confirmed', admin_id: 'adm' }, 1009);
ok(r.new_brp === 0 && r.delta === 0, 'засвар ч 0-ээс доош оруулахгүй');
r = RK.adjustLocal(DB, { user_id: 'u1', steam_id: S(2), delta: 100, reason: 'restore lost match', admin_id: 'adm' }, 1010);
ok(r.prev_brp === 1260 && r.new_brp === 1360 && DB.berx_ranking_audit.filter(a => a.action === 'adjust').length === 2, 'засвар ledger + audit-д');
const sm = RK.summaryLocal(DB);
ok(sm.gained === DB.berx_rating_changes.reduce((x, c) => x + Math.max(0, c.delta), 0) && sm.net === sm.gained - sm.lost && sm.adjustments === 2, `inflation нийлбэр (+${sm.gained} / −${sm.lost})`);
// settings
const T2 = {};
let s2 = RK.settingsLocal(T2, { admin_id: 'adm', competitive: true }, 500);
ok(!s2.enabled && s2.competitive && s2.enabled_at === null, 'тохиргоо: анхдагч бүгд унтраалттай, enabled_at хоосон');
s2 = RK.settingsLocal(T2, { admin_id: 'adm', enabled: true }, 600); s2 = RK.settingsLocal(T2, { admin_id: 'adm', enabled: false }, 700); s2 = RK.settingsLocal(T2, { admin_id: 'adm', enabled: true }, 800);
ok(s2.enabled_at === 600 && T2.berx_ranking_audit.length === 4, 'enabled_at = анх асаасан агшин (дахин асаахад өөрчлөгдөхгүй), audit бүр');
ok(throws(() => RK.cleanRules({ min_participation: 3 })) && RK.cleanRules({ max_same_lineup_24h_aim: '9' }).max_same_lineup_24h_aim === 9, 'дүрмийн утга шалгагдана');

/* ---------- 6. Зэрэглэл, leaderboard ---------- */
console.log('\n== ranks & leaderboard');
ok(RK.rankOf(0).id === 'rookie' && RK.rankOf(1999).id === 'rookie' && RK.rankOf(2000).id === 'hunter' && RK.rankOf(2999).id === 'hunter' && RK.rankOf(3000).id === 'reaper'
  && RK.rankOf(4000).id === 'dominator' && RK.rankOf(4999).id === 'dominator' && RK.rankOf(5000).id === 'immortal' && RK.rankOf(99999).id === 'immortal', 'зэрэглэлийн хил 2000/3000/4000/5000');
const rs = [
  { user_id: 'a', steam_id: S(1), brp: 5200, peak: 5300, wins: 40, losses: 10, ranked_matches: 50, last_match_at: 5 },
  { user_id: 'b', steam_id: S(2), brp: 5200, peak: 5300, wins: 40, losses: 12, ranked_matches: 52, last_match_at: 3 },
  { user_id: 'c', steam_id: S(3), brp: 5600, peak: 5600, wins: 60, losses: 5, ranked_matches: 65, last_match_at: 9 },
  { user_id: 'd', steam_id: S(4), brp: 2100, peak: 2500, wins: 10, losses: 9, ranked_matches: 19, last_match_at: 1 },
  { user_id: 'gone', steam_id: S(9), brp: 9000, peak: 9000, wins: 1, losses: 0, ranked_matches: 1, last_match_at: 1 }];
const us = [{ id: 'a', nick: 'A', steam_id: S(1) }, { id: 'b', nick: 'B', steam_id: S(2) }, { id: 'c', nick: 'C', steam_id: S(3) }, { id: 'd', nick: 'D', steam_id: S(4) }, { id: 'e', nick: 'E', steam_id: S(5) }, { id: 'f', nick: 'F', steam_id: null }];
const b = RK.board({ rs, us });
ok(b.ranked.map(x => x.userId).join() === 'c,b,a,d', `эрэмбэ: BRP → оргил → хожил → эрт хүрсэн (${b.ranked.map(x => x.userId).join()})`);
ok(b.ranked[0].immortal === 1 && b.ranked[1].immortal === 2 && b.ranked[2].immortal === 3 && !b.ranked[3].immortal, 'IMMORTAL #1..#3 байраар');
ok(b.unranked.length === 1 && b.unranked[0].userId === 'e' && b.unranked[0].brp === 1000 && b.unranked[0].unranked && b.noSteam === 1, 'чансаагүй (1000, тусдаа), Steam холбоогүй тоологдсон');
ok(!b.ranked.some(x => x.userId === 'gone'), 'устсан хэрэглэгч жагсаалтад орохгүй');
ok(JSON.stringify(RK.board({ rs: rs.slice().reverse(), us })) === JSON.stringify(b), 'оролтын дарааллаас үл хамааран ижил жагсаалт (deterministic)');

/* ---------- 7. Ingest validation (match_type, lock) ---------- */
console.log('\n== ingest validation');
const base = { id: '0a0a0a0a-0000-4000-8000-000000000001', server_id: 'main', source: 'cs2log', mode: 'aim1v1', map: 'aim_map1v1cfg', aim_weapon: 'awp', target_rounds: 13, status: 'completed',
  started_at: T0, ended_at: T0 + 400e3, rounds_played: 22, score_ct: 13, score_t: 9, winner: 'CT', players: [{ steam_id: SA, team: 'CT', kills: 13, deaths: 9, assists: 0, headshot_kills: 5, rounds_played: 22 }] };
let v = validateMatch(base, T0 + 500e3);
ok(v.match_type === 'casual' && v.lock === null, 'match_type байхгүй (хуучин agent) → casual');
ok(validateMatch({ ...base, match_type: 'tournament' }, T0 + 500e3).match_type === 'casual', 'танихгүй төрөл → casual');
ok(throws(() => validateMatch({ ...base, match_type: 'ranked' }, T0 + 500e3), /lock/), 'ranked + lock байхгүй → 400');
v = validateMatch({ ...base, match_type: 'ranked', lock: lockA() }, T0 + 500e3);
ok(v.match_type === 'ranked' && v.lock.roster.CT[0] === SA && v.lock.guard.ok === true, 'ranked + зөв lock → хүлээн авна');
ok(validateMatch({ ...base, lock: lockA() }, T0 + 500e3).lock === null, 'casual тоглолтод lock хадгалахгүй');

/* ---------- 8. Agent recorder lock ---------- */
console.log('\n== agent recorder lock');
let clock = T0; const ids = (() => { let i = 0; return () => `00000000-0000-4000-8000-${String(++i).padStart(12, '0')}`; })();
const rec = new MatchRecorder({ serverId: 'main', agentVersion: '1.5.0', now: () => clock, newId: ids });
rec.setRoster([{ steamId: SA, name: 'DOK', team: 'CT' }, { steamId: SB, name: 'Kaze', team: 'T' }, { steamId: '0', name: 'BOT', team: 'T', bot: true }, { steamId: S(50), name: 'Spec', team: 'SPEC' }]);
const aimCtx = { mode: 'aim1v1', map: 'aim_map1v1cfg', workshop_id: '3418431100', aim_weapon: 'awp', target_rounds: 13, ranked: true, guard: { ok: true, version: '1.0.0', checkedAt: T0 } };
rec.onLog('11/15/2026 - 12:00:00.000 - World triggered "Match_Start" on "aim_map1v1cfg"', { aim: aimCtx });
const L = rec.live.lock;
ok(L && L.type === 'ranked' && L.roster.CT.join() === SA && L.roster.T.join() === SB && L.bots === 1 && L.agent === '1.5.0' && L.guard.ok && L.rules.target_rounds === 13, 'Match_Start-д төрөл, roster (SPEC/bot-гүй), bot тоо, дүрэм, guard түгжигдсэн');
aimCtx.ranked = false; rec.setRoster([{ steamId: SA, team: 'CT' }, { steamId: S(77), team: 'T' }]);
ok(rec.live.lock.roster.T.join() === SB && rec.live.lock.type === 'ranked', 'тоглолтын явцад төрөл/roster өөрчлөгдсөн ч түгжээ хэвээр');
rec.onLog('11/15/2026 - 12:00:01.000 - World triggered "Match_Start" on "aim_map1v1cfg"', { aim: { ...aimCtx, ranked: true, target_rounds: 10 } });
ok(rec.live.lock === null, 'First to 10 → agent ч lock үүсгэхгүй (casual)');
rec.onLog('11/15/2026 - 12:00:02.000 - World triggered "Match_Start" on "aim_map1v1cfg"', { aim: { ...aimCtx, ranked: false } });
ok(rec.live.lock === null, 'casual AIM → lock байхгүй');
const rec2 = new MatchRecorder({ serverId: 'main', agentVersion: '1.5.0', now: () => clock, newId: ids });
rec2.setRoster([...CT5.map(s => ({ steamId: s, team: 'CT' })), ...T5.map(s => ({ steamId: s, team: 'T' }))]);
rec2.onMatchZy({ event: 'going_live', matchid: 7, map_number: 0 }, { map: 'de_mirage', type: 'ranked', serverMode: 'competitive', cheats: false });
ok(rec2.live.lock && rec2.live.lock.roster.CT.length === 5 && rec2.live.lock.roster.T.length === 5 && rec2.live.lock.rules.server_mode === 'competitive' && rec2.live.lock.rules.cheats === false, 'Competitive going_live → 5v5 roster түгжигдсэн');
rec2.live.rounds = 24; rec2.live.score = { ct: 13, t: 11 }; rec2.live.decided = 'CT'; for (const p of Object.values(rec2.live.players)) p.rounds_played = 24; clock += 1000; const em = rec2.end('completed', 'game_over');
ok(em.match_type === 'ranked' && em.lock.roster.CT.length === 5, 'дууссан тоглолтын payload-д match_type + lock');
ok(validateMatch(em, clock + 1000).match_type === 'ranked', 'agent-ийн payload сайтын шалгалтыг давна');

/* ---------- 9. Сайт: Ranked команд шалгалт ---------- */
console.log('\n== site command checks');
const inst = { installed: true, enabled: true, competitive: true, aim: true };
let av = server.rankedAvailability(inst, { agentVersion: '1.5.0', guard: { ok: true, version: '1.0.0' } });
ok(av.competitive.ok && av.aim.ok, 'бүгд бэлэн → Competitive / AIM Ranked боломжтой');
av = server.rankedAvailability(inst, { agentVersion: '1.4.0' });
ok(!av.competitive.ok && /1\.5\.0/.test(av.competitive.why) && !av.aim.ok, 'хуучин agent → Ranked боломжгүй (шалтгаантай)');
av = server.rankedAvailability(inst, { agentVersion: '1.5.0', guard: { ok: false } });
ok(av.competitive.ok && !av.aim.ok && /Guard/.test(av.aim.why), 'Guard алга → зөвхөн Ranked AIM хаагдана');
av = server.rankedAvailability({ ...inst, aim: false }, { agentVersion: '1.5.0', guard: { ok: true } });
ok(!av.aim.ok && /идэвхгүй/.test(av.aim.why), 'AIM flag унтраалттай → шалтгаан');
av = server.rankedAvailability({ ...inst, installed: false }, { agentVersion: '1.5.0', guard: { ok: true } });
ok(!av.competitive.ok && /006/.test(av.competitive.why), 'migration хийгдээгүй → шалтгаан');
ok(server.validateCommand('aim_start', { map: 'aim_map1v1cfg', size: 1, weapon: 'awp', rounds: 13, ranked: true }).ranked === true, 'aim_start ranked аргумент allowlist-д');
ok(!('ranked' in server.validateCommand('aim_rematch', { size: 1, weapon: 'awp', rounds: 13 })), 'aim_rematch ranked байхгүй → agent одоогийнхыг хадгална');
ok(throws(() => server.validateCommand('match_type', { value: 'tournament' })) && server.validateCommand('match_type', { value: 'ranked' }).value === 'ranked', 'match_type allowlist');
ok(server.FIRST_TO_10 === 'First to 10 тоглолт BRP-д нөлөөлөхгүй.', 'First to 10 мессеж');
const ca = server.cleanArena({ aim: { map: 'aim_map1v1cfg', size: 1, weapon: 'awp', rounds: 10, ranked: true }, workshop: null });
ok(ca.aim.ranked === false, 'heartbeat: First to 10 + ranked → сайт ranked гэж харуулахгүй');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
