/* =========================================================
 * BERX Match History — agent-ийн хэсэг (MatchRecorder + дараалал + хадгалах + илгээх)
 *   • Төлөв: agent/.berx-matches.json (live тоглолт + илгээгдээгүй дүн). Атомик бичилт (tmp → rename).
 *   • Илгээх: POST /api/server/agent/matches (Bearer SERVER_AGENT_SECRET), bounded backoff 5с → 5мин.
 *   • MATCH_HISTORY=0 → бүрэн унтраалттай (одоогийн agent-ийн зан төлөв хэвээр).
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { MatchRecorder, MatchQueue } = require('./match-recorder');

function createMatchHistory({ env = process.env, dir = __dirname, version, log = () => {}, send }) {
  const enabled = env.MATCH_HISTORY !== '0';
  const serverId = /^[a-z0-9_-]{1,32}$/.test(env.SERVER_ID || '') ? env.SERVER_ID : 'main';
  const file = env.BERX_MATCHES_STATE || path.join(dir, '.berx-matches.json');
  const rec = new MatchRecorder({ serverId, agentVersion: version, log: (m) => log(m) });
  const queue = new MatchQueue({ baseMs: +env.MATCH_RETRY_MS || 5000 });
  let dirty = false, sending = false, saveTimer = null;

  function save() {
    if (!enabled) return;
    try {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, recorder: rec.toJSON(), queue: queue.toJSON() }));
      fs.renameSync(tmp, file); dirty = false;
    } catch (e) { log('⚠ Тоглолтын төлөв хадгалагдсангүй: ' + e.message); }
  }
  const saveSoon = () => { dirty = true; if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; if (dirty) save(); }, 300); };
  function collect() { const done = rec.drain(); for (const m of done) queue.add(m); if (done.length) { save(); flush(); } else saveSoon(); }

  if (enabled) {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      queue.restore(j.queue); rec.restore(j.recorder);
      if (queue.items.length) log(`↻ Илгээгдээгүй ${queue.items.length} тоглолт дараалалд байна`);
      collect();
    } catch (e) { if (e.code !== 'ENOENT') log('⚠ .berx-matches.json уншигдсангүй — шинээр эхэлнэ: ' + e.message); }
  }

  async function flush() {
    if (!enabled || sending) return;
    sending = true;
    try {
      for (let item = queue.due(); item; item = queue.due()) {
        let status = 0, error = '';
        try { const r = await send(item.match); status = r.status; error = r.error || ''; } catch (e) { status = 0; error = e.message; }
        const res = queue.result(item, status, error);
        if (res === 'sent') log(`✓ Тоглолт сайтад хадгалагдлаа (${item.match.mode} ${item.match.score_ct}:${item.match.score_t}, ${item.match.id.slice(0, 8)})`);
        else if (res === 'rejected') log(`✖ Сайт тоглолтыг хүлээж аваагүй (${status}): ${error} — дахин илгээхгүй`);
        else { log(`⚠ Тоглолт илгээгдсэнгүй (${status || 'сүлжээ'}) — ${Math.round((item.nextAt - Date.now()) / 1000)}с дараа дахин`); save(); break; }
        save();
      }
    } finally { sending = false; }
  }

  return {
    enabled,
    onMatchZy(e, ctx) { if (!enabled) return; rec.onMatchZy(e, ctx); collect(); },
    onLog(body, ctx) { if (!enabled) return; rec.onLog(body, ctx); collect(); },
    // agent tick бүр (5с): roster, map/горим/онлайн шалгалт, дараалал илгээх
    tick(ctx) { if (!enabled) return; rec.setRoster(ctx.players); rec.check(ctx); collect(); flush().catch(() => {}); },
    save,
    status: () => ({ enabled, live: rec.live ? { mode: rec.live.mode, rounds: rec.live.rounds } : null, queued: queue.items.length, rejected: queue.rejected.length }),
    _rec: rec, _queue: queue
  };
}

module.exports = { createMatchHistory };
