// Агентын синкийн логик — хуурамч MySQL драйвер (SQL бичлэг, transaction, алдаа, backoff)
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { createSkinsSync, toRows } = require('../../agent/skins-sync.js');
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
const SID = '76561198000000001';
const LO = { '3': { weapons: { 7: { p: 180, wear: 0.2, seed: 5, st: 1, tag: 'BERX' } }, knife: { d: 507, w: 'weapon_knife_karambit', p: 38, wear: 0.01, seed: 3 }, gloves: { d: 5030, p: 10037, wear: 0.3, seed: 9 }, agent: 'ctm_st6/ctm_st6_variante' },
             '2': { weapons: {}, knife: { d: 507, w: 'weapon_knife_karambit', p: 0, wear: 0.000001, seed: 0 }, gloves: null, agent: null } };
const r = toRows(SID, LO);
ok(r.skins.length === 3 && r.knives.length === 2 && r.gloves.length === 1 && r.agent.ct && !r.agent.t, 'toRows maps weapons/knife finish/glove finish/agent');
for (const [n, sid, lo] of [['bad steamid', '123', LO], ['bad knife', SID, { '3': { knife: { d: 507, w: 'weapon_knife_karambit; DROP', p: 0 } } }], ['bad agent', SID, { '2': { agent: "x'); --" } }], ['wear > 1', SID, { '3': { weapons: { 7: { p: 1, wear: 2, seed: 0 } } } }]])
  { let t = false; try { toRows(sid, lo); } catch (e) { t = true; } ok(t, 'toRows rejects ' + n); }

function fakeMysql({ failConnect = () => false, schemaOk = true } = {}) {
  const log = [];
  const conn = { async beginTransaction() { log.push('BEGIN'); }, async commit() { log.push('COMMIT'); }, async rollback() { log.push('ROLLBACK'); }, release() {},
    async execute(sql, params) { log.push([sql.replace(/\s+/g, ' ').slice(0, 60), params]); if (params.some(p => typeof p === 'string' && /DROP|;/.test(p))) throw new Error('injection reached SQL'); return [[]]; } };
  const cols = [], idx = [];
  const REQ = require('../../agent/skins-sync.js').REQUIRED, UNI = require('../../agent/skins-sync.js').UNIQUE;
  for (const [t, cs] of Object.entries(REQ)) { cs.forEach(c => cols.push({ t, c, dt: c === 'weapon_wear' ? 'float' : 'int' })); if (schemaOk) UNI[t].forEach((c, i) => idx.push({ t, i: 'u_' + t, c, nu: 0, s: i + 1 })); }
  return { log, createPool() { if (failConnect()) { const e = new Error('connect ECONNREFUSED'); e.code = 'ECONNREFUSED'; return { async execute() { throw e; }, async getConnection() { throw e; }, async end() {} }; }
      return { async execute(sql) { return /COLUMNS/.test(sql) ? [cols] : /STATISTICS/.test(sql) ? [idx] : [[]]; }, async getConnection() { return conn; }, async end() {} }; } };
}
const env = { SKINS_SYNC_ENABLED: '1', WP_DB_NAME: 'wp', WP_DB_USER: 'u', WP_DB_PASSWORD: 'p', SKINS_POLL_MS: '5000' };
const acks = [], rcon = [];
let down = true;
const m = fakeMysql({ failConnect: () => down });
const s = createSkinsSync({ env, mysql: m, log: () => {}, getPlayers: () => [{ steamId: SID, bot: false }],
  rconExec: async (c) => { rcon.push(c); return '[WeaponPaints] Skins refreshed'; },
  api: async (p, body) => { if (p === 'skins/pending') return { items: [{ steamId: SID, version: 4, loadout: LO }] }; acks.push(body); return { ok: true }; } });
await s.tick();
ok(acks.length === 0 && s.status().db === 'error', 'DB down → no ack, status error (site keeps pending)');
down = false; await s.tick(); ok(acks.length === 0, 'backoff respected (no immediate retry)');
await new Promise(r => setTimeout(r, 5200)); await s.tick();
ok(acks.length === 1 && acks[0].ok && acks[0].version === 4 && acks[0].applied === true, 'after recovery: synced + acked + applied');
ok(m.log.filter(x => x === 'BEGIN').length === 1 && m.log.includes('COMMIT'), 'single transaction committed');
ok(rcon[0] === 'wp_refresh ' + SID, 'wp_refresh sent for online player');
const sqls = m.log.filter(Array.isArray).map(x => x[0]);
ok(sqls.every(q => !/76561198/.test(q)), 'steamid only as parameter, never in SQL text');
ok(sqls.some(q => /INSERT INTO `wp_player_knife`/.test(q)) && sqls.some(q => /INSERT INTO `wp_player_agents`/.test(q)) && !sqls.some(q => /stattrak_count/.test(q)), 'knife/agents upserted; stattrak_count never written');
const bad = createSkinsSync({ env, mysql: fakeMysql({ schemaOk: false }), log: () => {}, getPlayers: () => [], rconExec: async () => '', api: async () => { throw new Error('should not call site'); } });
await bad.tick(); ok(bad.status().schema === 'mismatch' && /UNIQUE/.test(bad.status().error), 'schema without UNIQUE index → sync refused: ' + bad.status().error.slice(0, 80));
const off = createSkinsSync({ env: {}, log: () => {} }); ok(off.enabled === false, 'disabled by default');
console.log(out.join('\n')); const f = out.filter(x => x.startsWith('FAIL')).length; console.log(f, 'failures'); process.exit(f ? 1 : 0);
