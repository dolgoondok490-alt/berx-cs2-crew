/* =========================================================
 * BERX Agent — SKIN INVENTORY → WeaponPaints MySQL синк
 * ---------------------------------------------------------
 *  Анхдагчаар УНТРААЛТТАЙ. Зөвхөн agent/.env.skins дотор SKINS_SYNC_ENABLED=1 үед ажиллана.
 *  (agent/.env-ийг өөрчлөх шаардлагагүй.)
 *
 *  Урсгал:  сайт (/api/server/agent/skins/pending)  →  энэ модуль  →  MySQL (localhost)  →  ack
 *           тоглогч серверт байвал: RCON "wp_refresh <steamid64>" (WeaponPaints build-472-ийн
 *           console-only команд; DB-ээс дахин уншина). Ачаалал асинхрон тул 2.5с дараа дахин илгээнэ.
 *
 *  Аюулгүй байдал / найдвартай байдал:
 *    • Бүх SQL parameterized (mysql2 execute), steamid / тоо / нэрийг дахин шалгана.
 *    • Нэг тоглогчийн бүх өөрчлөлт нэг transaction-д (бүтэн төлөв → idempotent).
 *    • Эхлэхдээ information_schema-аас WeaponPaints-ийн хүснэгт, багана, UNIQUE индексийг шалгана.
 *      Таарахгүй бол синк хийхгүй (таамаглахгүй).
 *    • MySQL / сайт түр унтарвал ack хийхгүй → сайт pending хэвээр → backoff-оор дахин оролдоно.
 *    • StatTrak тоолуур, sticker, keychain баганыг ХӨНДӨХГҮЙ (plugin өөрөө бичдэг).
 *    • RCON-оор зөвхөн "wp_refresh <17 оронтой SteamID64>" илгээнэ — хэрэглэгчийн өгсөн текст огт явахгүй.
 * ========================================================= */
'use strict';

const REQUIRED = {
  wp_player_skins: ['steamid', 'weapon_team', 'weapon_defindex', 'weapon_paint_id', 'weapon_wear', 'weapon_seed', 'weapon_nametag', 'weapon_stattrak', 'weapon_stattrak_count'],
  wp_player_knife: ['steamid', 'weapon_team', 'knife'],
  wp_player_gloves: ['steamid', 'weapon_team', 'weapon_defindex'],
  wp_player_agents: ['steamid', 'agent_ct', 'agent_t']
};
const UNIQUE = {
  wp_player_skins: ['steamid', 'weapon_team', 'weapon_defindex'],
  wp_player_knife: ['steamid', 'weapon_team'],
  wp_player_gloves: ['steamid', 'weapon_team'],
  wp_player_agents: ['steamid']
};
const STEAM = /^7656119\d{10}$/;
const KNIFE = /^weapon_(knife_[a-z0-9_]+|knife|bayonet)$/;
const MODEL = /^[a-z0-9_]+\/[a-z0-9_]+$/;

function cfgFromEnv(env) {
  return {
    enabled: env.SKINS_SYNC_ENABLED === '1',
    host: env.WP_DB_HOST || '127.0.0.1', port: +env.WP_DB_PORT || 3306,
    database: env.WP_DB_NAME || '', user: env.WP_DB_USER || '', password: env.WP_DB_PASSWORD || '',
    pollMs: Math.max(5000, +env.SKINS_POLL_MS || 10000),
    refresh: env.SKINS_REFRESH !== '0'
  };
}

/** Сайтаас ирсэн loadout-ыг agent тал дахин шалгаж MySQL мөр болгоно (тоо, хүрээ, нэрийн хэлбэр). */
function toRows(steamId, loadout) {
  if (!STEAM.test(steamId)) throw new Error('steamId буруу');
  const num = (v, lo, hi, int) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) throw new Error('утга буруу: ' + v); return n; };
  const out = { skins: [], knives: [], gloves: [], agent: { ct: null, t: null } };
  for (const team of [2, 3]) {
    const t = (loadout && loadout[team]) || {};
    for (const [d, w] of Object.entries(t.weapons || {})) {
      out.skins.push({ team, defindex: num(d, 1, 99999, true), paint: num(w.p, 1, 999999, true), wear: num(w.wear, 0, 1), seed: num(w.seed, 0, 1000, true),
        nametag: w.tag ? String(w.tag).slice(0, 20) : null, stattrak: w.st ? 1 : 0 });
    }
    if (t.knife) {
      if (!KNIFE.test(t.knife.w || '')) throw new Error('knife буруу');
      out.knives.push({ team, knife: t.knife.w });
      if (Number(t.knife.p) > 0) out.skins.push({ team, defindex: num(t.knife.d, 1, 99999, true), paint: num(t.knife.p, 1, 999999, true), wear: num(t.knife.wear, 0, 1), seed: num(t.knife.seed, 0, 1000, true), nametag: t.knife.tag ? String(t.knife.tag).slice(0, 20) : null, stattrak: t.knife.st ? 1 : 0 });
    }
    if (t.gloves) {
      const d = num(t.gloves.d, 1, 99999, true);
      out.gloves.push({ team, defindex: d });
      out.skins.push({ team, defindex: d, paint: num(t.gloves.p, 1, 999999, true), wear: num(t.gloves.wear, 0, 1), seed: num(t.gloves.seed, 0, 1000, true), nametag: null, stattrak: 0 });
    }
    if (t.agent) {
      if (!MODEL.test(t.agent)) throw new Error('agent буруу');
      out.agent[team === 3 ? 'ct' : 't'] = t.agent;
    }
  }
  return out;
}

function createSkinsSync({ env, api, rconExec, getPlayers, log, mysql: injectedMysql }) {
  const C = cfgFromEnv(env);
  const status = { enabled: C.enabled, db: 'unknown', schema: 'unknown', lastSync: null, synced: 0, pending: null, error: null };
  if (!C.enabled) return { status: () => status, tick: async () => {}, enabled: false, checkSchema: async () => null };

  let mysql = injectedMysql;
  if (!mysql) {
    try { mysql = require('mysql2/promise'); }
    catch (e) { status.error = 'mysql2 суугаагүй: agent хавтсанд "npm install" ажиллуулна уу'; log('✖ Skins:', status.error); return { status: () => status, tick: async () => {}, enabled: true, checkSchema: async () => null }; }
  }
  if (!C.database || !C.user) { status.error = 'WP_DB_NAME / WP_DB_USER тохируулаагүй (agent/.env.skins)'; log('✖ Skins:', status.error); }

  let pool = null, schemaOk = false, backoff = 0, nextAt = 0, busy = false;

  async function getPool() {
    if (pool) return pool;
    pool = mysql.createPool({ host: C.host, port: C.port, user: C.user, password: C.password, database: C.database, connectionLimit: 2, waitForConnections: true, connectTimeout: 5000, timezone: 'Z', supportBigNumbers: true });
    return pool;
  }

  async function checkSchema() {
    const p = await getPool();
    const names = Object.keys(REQUIRED);
    const [cols] = await p.execute(`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS dt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${names.map(() => '?').join(',')})`, names);
    const [idx] = await p.execute(`SELECT TABLE_NAME AS t, INDEX_NAME AS i, COLUMN_NAME AS c, NON_UNIQUE AS nu, SEQ_IN_INDEX AS s FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${names.map(() => '?').join(',')}) ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`, names);
    const problems = [];
    for (const [t, need] of Object.entries(REQUIRED)) {
      const have = new Set(cols.filter(r => r.t === t).map(r => r.c));
      if (!have.size) { problems.push(`${t} хүснэгт алга`); continue; }
      const miss = need.filter(c => !have.has(c)); if (miss.length) problems.push(`${t}: багана алга (${miss.join(', ')})`);
      const uniq = {}; idx.filter(r => r.t === t && Number(r.nu) === 0).forEach(r => (uniq[r.i] ||= []).push(r.c));
      if (!Object.values(uniq).some(c => c.join(',') === UNIQUE[t].join(','))) problems.push(`${t}: UNIQUE(${UNIQUE[t].join(', ')}) индекс алга`);
    }
    const numeric = cols.find(r => r.t === 'wp_player_skins' && r.c === 'weapon_wear');
    if (numeric && !/float|double|decimal/i.test(numeric.dt)) problems.push('weapon_wear float биш');
    return problems;
  }

  async function writeLoadout(steamId, loadout) {
    const rows = toRows(steamId, loadout);
    const p = await getPool();
    const conn = await p.getConnection();
    try {
      await conn.beginTransaction();
      for (const team of [2, 3]) {
        const mine = rows.skins.filter(r => r.team === team);
        for (const r of mine) {
          await conn.execute(
            'INSERT INTO `wp_player_skins` (`steamid`, `weapon_team`, `weapon_defindex`, `weapon_paint_id`, `weapon_wear`, `weapon_seed`, `weapon_nametag`, `weapon_stattrak`) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE `weapon_paint_id` = VALUES(`weapon_paint_id`), `weapon_wear` = VALUES(`weapon_wear`), `weapon_seed` = VALUES(`weapon_seed`), `weapon_nametag` = VALUES(`weapon_nametag`), `weapon_stattrak` = VALUES(`weapon_stattrak`)',
            [steamId, team, r.defindex, r.paint, r.wear, r.seed, r.nametag, r.stattrak]);
        }
        const keep = [...new Set(mine.map(r => r.defindex))];
        if (keep.length) await conn.execute(`DELETE FROM \`wp_player_skins\` WHERE \`steamid\` = ? AND \`weapon_team\` = ? AND \`weapon_defindex\` NOT IN (${keep.map(() => '?').join(',')})`, [steamId, team, ...keep]);
        else await conn.execute('DELETE FROM `wp_player_skins` WHERE `steamid` = ? AND `weapon_team` = ?', [steamId, team]);

        const k = rows.knives.find(r => r.team === team);
        if (k) await conn.execute('INSERT INTO `wp_player_knife` (`steamid`, `weapon_team`, `knife`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `knife` = VALUES(`knife`)', [steamId, team, k.knife]);
        else await conn.execute('DELETE FROM `wp_player_knife` WHERE `steamid` = ? AND `weapon_team` = ?', [steamId, team]);

        const g = rows.gloves.find(r => r.team === team);
        if (g) await conn.execute('INSERT INTO `wp_player_gloves` (`steamid`, `weapon_team`, `weapon_defindex`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `weapon_defindex` = VALUES(`weapon_defindex`)', [steamId, team, g.defindex]);
        else await conn.execute('DELETE FROM `wp_player_gloves` WHERE `steamid` = ? AND `weapon_team` = ?', [steamId, team]);
      }
      // Сайтын loadout нь T/CT тусдаа: "хоёр багт" (2, 3-аас өөр) хуучин мөрийг цэвэрлэнэ, эс бөгөөс давхардана
      for (const t of ['wp_player_skins', 'wp_player_knife', 'wp_player_gloves'])
        await conn.execute(`DELETE FROM \`${t}\` WHERE \`steamid\` = ? AND \`weapon_team\` NOT IN (2, 3)`, [steamId]);
      if (rows.agent.ct || rows.agent.t)
        await conn.execute('INSERT INTO `wp_player_agents` (`steamid`, `agent_ct`, `agent_t`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `agent_ct` = VALUES(`agent_ct`), `agent_t` = VALUES(`agent_t`)', [steamId, rows.agent.ct, rows.agent.t]);
      else await conn.execute('DELETE FROM `wp_player_agents` WHERE `steamid` = ?', [steamId]);
      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch (x) { /* ignore */ }
      throw e;
    } finally { conn.release(); }
  }

  async function refreshIfOnline(steamId) {
    if (!C.refresh || !STEAM.test(steamId)) return false;
    const online = (getPlayers() || []).some(p => p.steamId === steamId && !p.bot);
    if (!online) return false;
    const cmd = 'wp_refresh ' + steamId;   // зөвхөн шалгасан 17 оронтой тоо
    const out = await rconExec(cmd);
    if (/Unknown command/i.test(out)) throw new Error('wp_refresh команд алга — WeaponPaints ачаалагдаагүй эсвэл CommandWpEnabled=false');
    setTimeout(() => { rconExec(cmd).catch(() => {}); }, 2500);   // plugin DB-ээс асинхрон уншдаг тул 2 дахь удаа
    return !/not found/i.test(out);
  }

  async function tick() {
    if (busy || Date.now() < nextAt || !C.database) return;
    busy = true;
    try {
      if (!schemaOk) {
        const problems = await checkSchema();
        status.db = 'ok';
        if (problems.length) { status.schema = 'mismatch'; status.error = 'WeaponPaints schema: ' + problems.join('; '); throw Object.assign(new Error(status.error), { schema: true }); }
        schemaOk = true; status.schema = 'ok'; status.error = null;
        log('✓ Skins: WeaponPaints MySQL schema шалгалт OK');
      }
      let res;
      try { res = await api('skins/pending'); }
      catch (e) { if (/ 404/.test(e.message)) { status.pending = null; status.error = 'Сайт дээр SKINS_SYNC_ENABLED унтраалттай'; backoff = 0; nextAt = Date.now() + 60e3; return; } throw e; }
      status.pending = (res.items || []).length;
      for (const it of res.items || []) {
        try {
          await writeLoadout(it.steamId, it.loadout);
          let applied = false;
          try { applied = await refreshIfOnline(it.steamId); } catch (e) { log('⚠ Skins: wp_refresh:', e.message); }
          await api('skins/ack', { steamId: it.steamId, version: it.version, ok: true, applied });
          status.synced++; status.lastSync = Date.now();
          log(`✓ Skins: ${it.steamId} v${it.version} синк хийгдлээ${applied ? ' · тоглоомд хэрэгжүүлэв' : ''}`);
        } catch (e) {
          if (e.code && /^(ECONN|PROTOCOL|ER_ACCESS|ETIMEDOUT|ER_LOCK)/.test(e.code)) throw e;   // DB түр алдаа → бүхэлд нь дахин оролдоно
          log('✖ Skins:', it.steamId, e.message);
          await api('skins/ack', { steamId: it.steamId, version: it.version, ok: false, error: e.message.slice(0, 200) }).catch(() => {});
        }
      }
      status.db = 'ok'; if (status.schema === 'ok') status.error = null; backoff = 0;
    } catch (e) {
      if (!e.schema) { status.db = 'error'; status.error = e.message; schemaOk = false; }
      backoff = Math.min(backoff ? backoff * 2 : C.pollMs, 120e3); nextAt = Date.now() + backoff;
      log('✖ Skins:', e.message, `(дахин оролдох: ${Math.round(backoff / 1000)}с)`);
      if (pool && !e.schema) { const p = pool; pool = null; p.end().catch(() => {}); }
    } finally { busy = false; }
  }

  log(`Skins sync идэвхтэй → MySQL ${C.host}:${C.port}/${C.database || '?'} (хэрэглэгч ${C.user || '?'})`);
  return { status: () => ({ ...status }), tick, enabled: true, checkSchema, pollMs: C.pollMs, close: () => pool && pool.end() };
}

module.exports = { createSkinsSync, toRows, cfgFromEnv, REQUIRED, UNIQUE };

/* CLI: node skins-sync.js --check-schema   (agent/.env + agent/.env.skins уншина) */
if (require.main === module && process.argv.includes('--check-schema')) {
  const path = require('path'), fs = require('fs');
  for (const f of ['.env', '.env.skins']) {
    const p = path.join(__dirname, f); if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  }
  const s = createSkinsSync({ env: { ...process.env, SKINS_SYNC_ENABLED: '1' }, api: async () => ({}), rconExec: async () => '', getPlayers: () => [], log: console.log });
  s.checkSchema().then(p => { if (p && p.length) { console.log('✖ Schema:', p.join('\n  ')); process.exit(2); } console.log('✓ WeaponPaints schema OK'); process.exit(0); })
    .catch(e => { console.log('✖', e.message); process.exit(1); });
}
