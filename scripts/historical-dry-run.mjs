#!/usr/bin/env node
// BERX — түүхэн 4 Competitive тоглолтын BRP нөхөн бүртгэлийн DRY RUN (зөвхөн унших, DB-д юу ч бичихгүй).
//   node scripts/historical-dry-run.mjs <export.json> [--out dir] [--batch hist-20261115] [--admin <users.id>]
// Оролт: docs/historical-import/export.sql-ийн гаралт (production-оос read-only).
// Тооцоо: lib/ranking.js — албан ёсны competitive-v1 (performance, competitiveDelta, rankOf). Тусдаа томъёо БАЙХГҮЙ.
// Гаралт: report.md / report.csv / report.json + SQL (1-approve, 2-dry-run, 3-execute, 4-verify, reverse).
// Аль нэг тоглолт шалгалтад унавал SQL үүсгэхгүй, шалтгааныг тайланд бичнэ (таамаглахгүй).
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const RK = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/ranking.js'));

// Таны заасан яг 4 тоглолт (Улаанбаатарын цаг, UTC+8), энэ дарааллаар
export const TARGETS = [
  { map: 'anubis', time: '19:11', ct: 4, t: 13 },
  { map: 'ancient', time: '19:38', ct: 13, t: 8 },
  { map: 'cache', time: '20:12', ct: 10, t: 13 },
  { map: 'mirage', time: '20:52', ct: 13, t: 11 }
];
export const EXCLUDED_AIM = { map: 'aim_map1v1cfg', time: '17:54', ct: 6, t: 10 };
const STEAM = /^7656119\d{10}$/;
const local = (ms) => { const d = new Date(+ms + 8 * 3600e3); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16), full: d.toISOString().slice(0, 19).replace('T', ' ') + ' UB' }; };
const mapKey = (m) => String(m || '').toLowerCase().replace(/^(de|cs|aim)_/, '');

export function parseExport(text) {
  let j = JSON.parse(text.trim().replace(/^﻿/, ''));
  if (Array.isArray(j)) j = j[0];
  if (j && j.berx_historical_export) j = typeof j.berx_historical_export === 'string' ? JSON.parse(j.berx_historical_export) : j.berx_historical_export;
  if (!j || !Array.isArray(j.day_matches)) throw new Error('export.json буруу: day_matches алга');
  return j;
}

export function dryRun(ex, opts = {}) {
  const issues = [], notes = [];
  const day = ex.day_matches;
  // ---------- 1. Яг 4 тоглолтыг тодорхойлох (map + цаг + оноо + горим; зөвхөн map-аар биш) ----------
  const picked = TARGETS.map((tg) => {
    const exact = day.filter(m => m.mode === 'competitive' && mapKey(m.map) === tg.map && +m.score_ct === tg.ct && +m.score_t === tg.t && local(m.started_at).time === tg.time && local(m.started_at).date === '2026-11-15');
    if (exact.length === 1) return { tg, m: exact[0] };
    const near = day.filter(m => m.mode === 'competitive' && mapKey(m.map) === tg.map && +m.score_ct === tg.ct && +m.score_t === tg.t
      && Math.abs((+m.started_at + 8 * 3600e3) % 86400e3 - (+tg.time.slice(0, 2) * 3600e3 + +tg.time.slice(3) * 60e3)) <= 3 * 60e3);
    if (exact.length === 0 && near.length === 1) { notes.push(`${tg.map} ${tg.time}: эхлэх цаг ${local(near[0].started_at).time} (≤3 мин зөрүү) — map/оноогоор нэг л тоглолт таарсан`); return { tg, m: near[0] }; }
    issues.push(`${tg.map} ${tg.time} ${tg.ct}:${tg.t}: ${exact.length || near.length ? 'олон тоглолт таарсан — тодорхойгүй' : 'тоглолт олдсонгүй'} (exact ${exact.length}, ±3мин ${near.length})`);
    return { tg, m: null };
  });
  const ids = new Set(picked.filter(x => x.m).map(x => x.m.id));
  if (ids.size !== picked.filter(x => x.m).length) issues.push('нэг тоглолт хоёр зорилтод таарсан');

  // ---------- 2. Тоглолт бүрийг шалгах ----------
  for (const { tg, m } of picked) {
    if (!m) continue;
    const tag = `${tg.map} ${tg.time}`;
    const P = m.players || [];
    const bad = (why) => issues.push(`${tag} (${m.id}): ${why}`);
    if (m.status !== 'completed') bad(`status=${m.status}`);
    if (m.source !== 'matchzy') bad(`source=${m.source}`);
    if (m.match_type !== 'casual' || m.lock_present) bad(`match_type=${m.match_type}, lock=${m.lock_present}`);
    if (m.decision || +m.ledger_rows > 0) bad('аль хэдийн BRP шийдвэр/ledger мөртэй');
    if (!['CT', 'T'].includes(m.winner) || (m.winner === 'CT' ? +m.score_ct <= +m.score_t : +m.score_t <= +m.score_ct)) bad(`ялагч/оноо зөрүүтэй (winner=${m.winner})`);
    if (!(+m.rounds_played >= +m.score_ct + +m.score_t)) bad(`rounds_played=${m.rounds_played} < ${+m.score_ct + +m.score_t}`);
    if (P.length !== 10) bad(`тоглогчийн тоо ${P.length} (10 байх ёстой)`);
    if (P.filter(p => p.team === 'CT').length !== 5 || P.filter(p => p.team === 'T').length !== 5) bad(`баг: CT ${P.filter(p => p.team === 'CT').length}, T ${P.filter(p => p.team === 'T').length}`);
    for (const p of P) {
      if (!STEAM.test(p.steam_id)) bad(`SteamID64 буруу: ${p.steam_id}`);
      if (!p.user_id) bad(`BERX бүртгэлтэй холбогдоогүй SteamID: ${p.steam_id} (${p.name})`);
      if ([p.kills, p.deaths, p.assists, p.headshot_kills].some(v => v === null || v === undefined || v < 0) || p.headshot_kills > p.kills) bad(`статистик буруу: ${p.steam_id}`);
      if (!(p.rounds_played >= Math.ceil(+m.rounds_played * 0.5))) bad(`оролцоо бага: ${p.name} ${p.rounds_played}/${m.rounds_played}`);
      if (p.rounds_played > +m.rounds_played) bad(`rounds_played хэтэрсэн: ${p.name}`);
    }
    if (new Set(P.map(p => p.steam_id)).size !== P.length) bad('давхардсан SteamID');
    if (new Set(P.map(p => p.user_id).filter(Boolean)).size !== P.filter(p => p.user_id).length) bad('нэг BERX бүртгэлд 2 SteamID');
    if (!m.has_damage) notes.push(`${tag}: damage бүртгэгдээгүй → ADR-ийн 30% жинг бусдад хуваарилна (weights_used-д тэмдэглэнэ)`);
    if (!/^[0-9a-f]{64}$/.test(m.fingerprint || '')) bad('fingerprint алга');
  }
  const order = picked.filter(x => x.m).map(x => +x.m.started_at);
  if (order.some((t, i) => i && t <= order[i - 1])) issues.push('цагийн дараалал буруу');

  // ---------- 3. Хасагдсан тоглолтууд ----------
  const aim = day.filter(m => mapKey(m.map) === 'map1v1cfg' && local(m.started_at).time === EXCLUDED_AIM.time);
  const exclusions = day.filter(m => !ids.has(m.id)).map(m => ({ id: m.id, map: m.map, mode: m.mode, local: local(m.started_at).full, score: `${m.score_ct}:${m.score_t}`, status: m.status,
    target_rounds: m.target_rounds, reason: m.mode !== 'competitive' ? (+m.target_rounds === 10 ? 'AIM First to 10 — хэзээ ч BRP биш' : 'AIM — import-ын хүрээнд биш') : 'жагсаалтад заагаагүй' }));

  // ---------- 4. Анхны BRP ----------
  const ratings = Object.fromEntries((ex.ratings || []).map(r => [r.user_id, r]));
  if ((ex.ratings || []).length || +(ex.ledger_summary || {}).rows > 0) notes.push(`Одоо байгаа рейтинг: ${(ex.ratings || []).length} мөр, ledger ${(ex.ledger_summary || {}).rows} — эдгээр тоглогчид одоогийн балансаасаа эхэлнэ (түүхийг дахин бичихгүй).`);
  const bal = {}, init = {}, agg = {};
  const result = { matches: [], leaderboard: [], totals: {}, issues, notes, exclusions, aim_excluded: aim.map(m => ({ id: m.id, local: local(m.started_at).full, score: `${m.score_ct}:${m.score_t}`, target_rounds: m.target_rounds })),
    batch_id: opts.batch || 'hist-20261115', formula: RK.FORMULA, settings: ex.settings || null, exported_at: ex.exported_at };
  if (issues.length) return result;

  // ---------- 5. Албан ёсны томъёогоор цагийн дарааллаар ----------
  for (const { tg, m } of picked) {
    const P = m.players;
    const rows = P.map(p => {
      const team = P.filter(x => x.team === p.team);
      const perf = RK.performance(p, team, !!m.has_damage);
      const res = p.team === m.winner ? 'win' : 'loss';
      const dc = RK.competitiveDelta(res, perf.score);
      if (!(p.user_id in bal)) { const r = ratings[p.user_id]; bal[p.user_id] = r ? +r.brp : RK.START_BRP; init[p.user_id] = bal[p.user_id]; }
      const prev = bal[p.user_id], delta = Math.max(dc, -prev), nb = prev + delta;
      bal[p.user_id] = nb;
      const a = agg[p.user_id] ||= { user_id: p.user_id, nick: p.nick, steam_id: p.steam_id, wins: 0, losses: 0, change: 0 };
      a.wins += res === 'win'; a.losses += res === 'loss'; a.change += delta;
      return { nick: p.nick, name: p.name, user_id: p.user_id, steam_id: p.steam_id, team: p.team, result: res, kills: p.kills, deaths: p.deaths, assists: p.assists,
        hs_pct: p.kills ? Math.round(p.headshot_kills / p.kills * 1000) / 10 : 0, adr: m.has_damage && p.damage !== null ? Math.round(p.damage / Math.max(1, p.rounds_played) * 10) / 10 : null,
        rounds_played: p.rounds_played, score: perf.score, components: perf.components, weights_used: perf.weights_used, redistributed: perf.redistributed,
        prev, delta_calc: dc, delta, new: nb, rank_before: RK.rankOf(prev).name, rank_after: RK.rankOf(nb).name,
        change: { user_id: p.user_id, steam_id: p.steam_id, result: res, score: perf.score, delta_calc: dc,
          detail: { formula: RK.FORMULA, ...perf, stats: { kills: p.kills, deaths: p.deaths, assists: p.assists, headshot_kills: p.headshot_kills, team_kills: p.team_kills || 0, damage: m.has_damage ? p.damage : null, rounds_played: p.rounds_played } },
          reason: `${res === 'win' ? 'Хожил' : 'Хожигдол'} · хувийн үзүүлэлт ${perf.score.toFixed(1)}` } };
    }).sort((a, b) => (a.team === b.team ? b.score - a.score : a.team === m.winner ? -1 : 1));
    result.matches.push({ seq: result.matches.length + 1, match_id: m.id, revision: +m.revision, fingerprint: m.fingerprint, map: m.map, local: local(m.started_at).full, utc: new Date(+m.started_at).toISOString(),
      started_at: +m.started_at, score_ct: +m.score_ct, score_t: +m.score_t, winner: m.winner, rounds_played: +m.rounds_played, has_damage: !!m.has_damage, source: m.source, status: m.status,
      original_match_type: m.match_type, external_ref: m.external_ref, rows });
  }
  result.leaderboard = Object.values(agg).map(a => ({ ...a, initial: init[a.user_id], final: bal[a.user_id], rank: RK.rankOf(bal[a.user_id]).name }))
    .sort((a, b) => b.final - a.final || b.wins - a.wins || (a.user_id < b.user_id ? -1 : 1)).map((a, i) => ({ position: i + 1, ...a }));
  const all = result.matches.flatMap(x => x.rows);
  result.totals = { awarded: all.reduce((s, r) => s + Math.max(0, r.delta), 0), deducted: all.reduce((s, r) => s - Math.min(0, r.delta), 0), net: all.reduce((s, r) => s + r.delta, 0),
    floor_applied: all.filter(r => r.delta !== r.delta_calc).length, players: result.leaderboard.length };
  return result;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const dq = (o) => `$berx$${JSON.stringify(o)}$berx$::jsonb`;
export function sqlFiles(r, admin) {
  const A = admin || 'REPLACE_WITH_ADMIN_USER_ID';
  const reason = 'Approved one-time historical import of 4 Competitive matches (2026-11-15 UB) — dry run reviewed';
  const approve = { batch_id: r.batch_id, admin_id: A, reason, formula: r.formula, matches: r.matches.map(m => ({ match_id: m.match_id, revision: m.revision, fingerprint: m.fingerprint })) };
  const imp = (dry) => ({ batch_id: r.batch_id, admin_id: A, reason, dry_run: dry, matches: r.matches.map(m => ({ match_id: m.match_id, revision: m.revision, fingerprint: m.fingerprint, changes: m.rows.map(x => x.change) })) });
  const head = (t) => `-- ${t}\n-- batch ${r.batch_id} · formula ${r.formula} · generated from production export ${r.exported_at ? new Date(+r.exported_at).toISOString() : ''}\n`;
  return {
    '1-approve.sql': head('1. Manifest батлах (BRP өөрчлөхгүй). 007, 008 migration-ий дараа.') + `select berx_historical_approve(${dq(approve)});\n`,
    '2-dry-run.sql': head('2. SQL dry run — production-д бүх шалгалт + тооцоо, ЮУ Ч БИЧИХГҮЙ. Гаралтыг report.json-той харьцуулна.') + `select jsonb_pretty(berx_historical_import(${dq(imp(true))}));\n`,
    '3-execute.sql': head('3. ⚠ БОДИТ IMPORT — зөвхөн dry run-ийг баталсны дараа. Нэг transaction, дахин ажиллуулахад аюулгүй (already_imported).') + `select jsonb_pretty(berx_historical_import(${dq(imp(false))}));\n`,
    '4-verify.sql': head('4. Шалгах (read-only)') + `select m.seq, m.match_id, m.status, m.imported_at, (select count(*) from berx_rating_changes c where c.match_id = m.match_id) ledger_rows
  from berx_historical_import_manifest m where m.batch_id = ${q(r.batch_id)} order by m.seq;
select u.nick, r.brp, r.peak, r.ranked_matches, r.wins, r.losses from berx_ratings r join users u on u.id = r.user_id order by r.brp desc;
select action, target, reason, created_at from berx_ranking_audit where action like 'historical%' order by id;\n`,
    'reverse.sql': head('⚠ Зөвхөн буцаах шаардлагатай бол: аудиттай нөхөх засвар (ledger-ийн мөр устгахгүй).') + `select berx_historical_reverse(${dq({ batch_id: r.batch_id, admin_id: A, reason: 'Reverse historical import — <write the reason here>' })});\n`
  };
}

const f1 = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(1));
const sg = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
export function markdown(r) {
  const L = [`# BERX — түүхэн BRP нөхөн бүртгэлийн DRY RUN`, '', `Batch: \`${r.batch_id}\` · Томъёо: \`${r.formula}\` · Export: ${r.exported_at ? new Date(+r.exported_at).toISOString() : '—'}`, '',
    '> Dry run — DB-д юу ч бичээгүй. Тооцоо: lib/ranking.js (албан ёсны competitive-v1).', ''];
  if (r.issues.length) { L.push('## ⛔ Шалгалтад унасан — import боломжгүй', '', ...r.issues.map(i => `- ${i}`), ''); }
  if (r.notes.length) L.push('## Тэмдэглэл', '', ...r.notes.map(i => `- ${i}`), '');
  for (const m of r.matches) {
    L.push(`## ${m.seq}. ${m.map} — ${m.local} — CT ${m.score_ct} : ${m.score_t} T (ялагч ${m.winner})`, '',
      `Match ID \`${m.match_id}\` · revision ${m.revision} · ${m.source} · ${m.status} · анхны төрөл ${m.original_match_type} · UTC ${m.utc} · ${m.rounds_played} round · damage ${m.has_damage ? 'бий' : 'алга'}`, '',
      '| Тоглогч | SteamID64 | Баг | Дүн | K/D/A | HS% | ADR | Round | Үзүүлэлт | Өмнөх BRP | Тооцсон Δ | Бодит Δ | Шинэ BRP | Зэрэглэл |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...m.rows.map(x => `| ${x.nick} | ${x.steam_id} | ${x.team} | ${x.result === 'win' ? 'Хожил' : 'Хожигдол'} | ${x.kills}/${x.deaths}/${x.assists} | ${f1(x.hs_pct)} | ${f1(x.adr)} | ${x.rounds_played} | ${x.score.toFixed(2)} | ${x.prev} | ${sg(x.delta_calc)} | ${sg(x.delta)} | ${x.new} | ${x.rank_after} |`), '');
  }
  if (r.leaderboard.length) {
    L.push('## Нийт жагсаалт (4 тоглолтын дараа)', '', '| # | Тоглогч | Анхны BRP | Хожил | Хожигдол | Нийт өөрчлөлт | Эцсийн BRP | Зэрэглэл |', '|---|---|---|---|---|---|---|---|',
      ...r.leaderboard.map(a => `| ${a.position} | ${a.nick} | ${a.initial} | ${a.wins} | ${a.losses} | ${sg(a.change)} | ${a.final} | ${a.rank} |`), '',
      `**Нийт олгосон:** +${r.totals.awarded} · **Нийт хассан:** −${r.totals.deducted} · **Цэвэр:** ${sg(r.totals.net)} · 0-ийн хил хэрэгжсэн: ${r.totals.floor_applied} · Тоглогч: ${r.totals.players}`, '');
  }
  L.push('## Хасагдсан тоглолтууд (2026-11-15)', '', ...r.exclusions.map(e => `- ${e.local} · ${e.map} · ${e.mode} · ${e.score} · ${e.status} — ${e.reason} (\`${e.id}\`)`), '',
    r.aim_excluded.length ? `✅ AIM First to 10 (17:54, ${r.aim_excluded.map(a => a.score).join(', ')}) хасагдсан.` : '⚠ 17:54-ийн AIM тоглолт export-д олдсонгүй.', '',
    '✅ Өөр түүхэн тоглолт ороогүй — зөвхөн дээрх 4 match ID.', '');
  return L.join('\n');
}
export function csv(r) {
  const rows = [['seq', 'match_id', 'revision', 'map', 'local_start', 'nick', 'steam_id', 'team', 'result', 'kills', 'deaths', 'assists', 'hs_pct', 'adr', 'rounds_played', 'score', 'prev_brp', 'delta_calc', 'delta', 'new_brp', 'rank_after']];
  for (const m of r.matches) for (const x of m.rows) rows.push([m.seq, m.match_id, m.revision, m.map, m.local, x.nick, x.steam_id, x.team, x.result, x.kills, x.deaths, x.assists, x.hs_pct, x.adr ?? '', x.rounds_played, x.score, x.prev, x.delta_calc, x.delta, x.new, x.rank_after]);
  return rows.map(r2 => r2.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  if (!a[0]) { console.error('usage: node scripts/historical-dry-run.mjs <export.json> [--out dir] [--batch id] [--admin users.id]'); process.exit(2); }
  const out = arg('--out', 'historical-dry-run'); fs.mkdirSync(out, { recursive: true });
  const r = dryRun(parseExport(fs.readFileSync(a[0], 'utf8')), { batch: arg('--batch') });
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(r, null, 2));
  fs.writeFileSync(path.join(out, 'report.md'), markdown(r));
  fs.writeFileSync(path.join(out, 'report.csv'), csv(r));
  if (!r.issues.length) for (const [f, s] of Object.entries(sqlFiles(r, arg('--admin')))) fs.writeFileSync(path.join(out, f), s);
  console.log(r.issues.length ? `⛔ ${r.issues.length} асуудал — SQL үүсгээгүй (report.md)` : `✅ ${r.matches.length} тоглолт, ${r.totals.players} тоглогч · +${r.totals.awarded} / −${r.totals.deducted} → ${out}/`);
  process.exit(r.issues.length ? 1 : 0);
}
