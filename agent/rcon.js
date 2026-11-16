/* =========================================================
 * Source RCON client (CS2: -usercon параметртэй асаана) — v1.5.1
 * packet: int32 size | int32 id | int32 type | body\0 | \0
 *
 * 1.5.1-ийн засвар:
 *  • Бүх exec ДАРААЛЛААР (нэг удаад нэг хүсэлт). Өмнө нь tick, skins sync, командууд зэрэг илгээгдэж,
 *    хариуны төгсгөлийг "120ms чимээгүй" таамаглалаар тогтоодог байсан.
 *  • query(): хариуны төгсгөлийг найдвартай тогтоохын тулд командын дараа `echo BERX_RCON_END_<id>` маркер илгээнэ.
 *    Сервер командуудыг дарааллаар гүйцэтгэдэг тул маркер ирэхэд өмнөх командын бүх хариу (олон пакет ч) ирсэн байна.
 *    Үр дүн: { status: 'ok'|'empty'|'timeout'|'closed'|'error', body, ms } — хоосон хариу, timeout, тасарсан холболтыг ялгана.
 *  • exec() хуучин зан төлөвтэй (timeout → '' ) — бусад кодын нийцлийн тулд; гэхдээ timeout/хоосон хариуг тоолно.
 *  • Хэт том/буруу хэмжээтэй пакет (урсгал эвдэрсэн) → холболтыг хааж, дахин холбогдоно.
 *  • TCP keepalive.
 * ========================================================= */
'use strict';
const net = require('net');

const MAX_PACKET = 1 << 20;
const END_PREFIX = 'BERX_RCON_END_';

class Rcon {
  constructor(host, port, password, opts = {}) {
    Object.assign(this, { host, port, password });
    this.sock = null; this.id = 10; this.buf = Buffer.alloc(0); this.pending = new Map(); this.ready = false;
    this.chain = Promise.resolve();
    this.log = opts.log || (() => {});
    this.quietMs = opts.quietMs || 120;
    this.markerGraceMs = opts.markerGraceMs || 1500;
    this.stats = { timeouts: 0, empty: 0, consecutiveTimeouts: 0, lastDataAt: 0, lastOkAt: 0, reconnects: 0, desync: 0, connectedAt: 0 };
  }
  packet(id, type, body) {
    const b = Buffer.from(body, 'utf8'); const p = Buffer.alloc(14 + b.length);
    p.writeInt32LE(10 + b.length, 0); p.writeInt32LE(id, 4); p.writeInt32LE(type, 8); b.copy(p, 12); p.writeInt16LE(0, 12 + b.length); return p;
  }
  connect(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const s = net.createConnection({ host: this.host, port: this.port });
      const fail = (e) => { this.ready = false; if (!settled) { settled = true; reject(e); } try { s.destroy(); } catch (x) { /* ignore */ } };
      s.setTimeout(timeoutMs, () => fail(new Error('RCON timeout (холбогдох)')));
      s.once('error', fail);
      s.on('data', (d) => this.onData(d, s));
      s.on('close', () => {
        if (this.sock === s) { this.ready = false; this.sock = null; this.buf = Buffer.alloc(0); }
        for (const [id, p] of this.pending) { if (p.sock === s) { clearTimeout(p.t); clearTimeout(p.guard); this.pending.delete(id); p.reject(new Error('RCON closed')); } }
        if (!settled) { settled = true; reject(new Error('RCON closed')); }
      });
      s.once('connect', () => {
        this.sock = s; this.buf = Buffer.alloc(0);
        try { s.setKeepAlive(true, 10000); s.setNoDelay(true); } catch (e) { /* ignore */ }
        const id = ++this.id;
        this.pending.set(id, { auth: true, sock: s, resolve: () => {
          s.setTimeout(0); this.ready = true; this.stats.connectedAt = Date.now(); this.stats.consecutiveTimeouts = 0;
          s.removeListener('error', fail); s.on('error', (e) => this.log('⚠ RCON алдаа:', e.message));
          if (!settled) { settled = true; resolve(); }
        }, reject: fail, chunks: [] });
        s.write(this.packet(id, 3, this.password));
      });
    });
  }
  onData(d, s) {
    if (s && s !== this.sock) return;                       // хуучин socket-ийн үлдэгдэл
    this.stats.lastDataAt = Date.now();
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 4) {
      const size = this.buf.readInt32LE(0);
      if (size < 10 || size > MAX_PACKET) {                 // урсгал эвдэрсэн → дахин холбогдоно
        this.stats.desync++; this.log('⚠ RCON пакетын хэмжээ буруу (' + size + ') — холболтыг шинэчилнэ');
        this.buf = Buffer.alloc(0); this.close(); return;
      }
      if (this.buf.length < size + 4) break;                // хэсэгчилсэн пакет — үлдсэнийг хүлээнэ
      const id = this.buf.readInt32LE(4), type = this.buf.readInt32LE(8);
      const body = this.buf.slice(12, 4 + size - 2).toString('utf8');
      this.buf = this.buf.slice(4 + size);
      if (type === 2 && id === -1) { const p = [...this.pending.values()].find(x => x.auth); if (p) p.reject(new Error('RCON нууц үг буруу')); continue; }
      const p = this.pending.get(id);
      if (p && p.auth) { if (type === 2) { this.pending.delete(id); p.resolve(); } continue; }
      if (!p) continue;                                      // хугацаа нь дууссан эсвэл хариу хэрэггүй (send)
      if (p.marker) { p.onMarker(body); continue; }
      p.chunks.push(body);
      if (p.onChunk) p.onChunk();
      if (p.quiet) { clearTimeout(p.t); p.t = setTimeout(() => this.finish(id, 'ok'), this.quietMs); }
    }
  }
  finish(id, status) {
    const p = this.pending.get(id); if (!p) return;
    this.pending.delete(id); clearTimeout(p.t); clearTimeout(p.guard);
    p.resolve(status);
  }
  // Дараалал: нэг удаад нэг exec/query (хариуны хил холилдохгүй)
  enqueue(fn) {
    const run = () => fn();
    const p = this.chain.then(run, run);
    this.chain = p.then(() => {}, () => {});
    return p;
  }
  // Хариу хэрэггүй convar тавих команд: хүлээхгүйгээр илгээнэ (AIM тохиргооны дарааллыг хурдан хэрэгжүүлэх).
  send(cmd) {
    if (!this.ready || !this.sock) return false;
    this.sock.write(this.packet(++this.id, 2, cmd)); return true;
  }
  // Нийцтэй exec: хариу (хоосон ч байж болно), timeout үед '' буцаана.
  exec(cmd, timeout = 5000) {
    return this.enqueue(() => this.execNow(cmd, timeout).then(r => r.body));
  }
  execNow(cmd, timeout) {
    if (!this.ready || !this.sock) return Promise.reject(new Error('RCON холбогдоогүй'));
    const sock = this.sock, t0 = Date.now();
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const entry = { sock, chunks: [], quiet: true, reject };
      entry.resolve = (status) => {
        const body = entry.chunks.join('');
        if (status === 'timeout') this.noteTimeout(); else this.noteOk(body);
        resolve({ status: status === 'timeout' ? 'timeout' : body.trim() ? 'ok' : 'empty', body, ms: Date.now() - t0 });
      };
      entry.guard = setTimeout(() => this.finish(id, entry.chunks.length ? 'ok' : 'timeout'), timeout);
      this.pending.set(id, entry);
      sock.write(this.packet(id, 2, cmd));
    });
  }
  // Найдвартай унших: команд + echo маркер. Хариуны төгсгөлийг маркераар тогтооно.
  query(cmd, { timeout = 4000 } = {}) {
    return this.enqueue(() => this.queryNow(cmd, timeout)).catch(e => ({ status: /closed|холбогдоогүй/i.test(e.message) ? 'closed' : 'error', body: '', error: e.message, ms: 0 }));
  }
  queryNow(cmd, timeout) {
    if (!this.ready || !this.sock) return Promise.reject(new Error('RCON холбогдоогүй'));
    const sock = this.sock, t0 = Date.now();
    return new Promise((resolve, reject) => {
      const id = ++this.id, mid = ++this.id, token = END_PREFIX + id;
      const entry = { sock, chunks: [], quiet: false, reject };
      const marker = { sock, marker: true, chunks: [], reject };
      let done = false;
      const end = (status) => {
        if (done) return; done = true;
        clearTimeout(entry.guard); clearTimeout(entry.t); this.pending.delete(id); this.pending.delete(mid);
        // CS2 зарим гаралтыг дараагийн хариунд оруулж болзошгүй — маркерын хариуны маркераас бусад хэсгийг нэмнэ
        const extra = marker.chunks.join('').split(/\r?\n/).filter(l => l.trim() && !l.includes(token)).join('\n');
        const body = entry.chunks.join('') + (extra ? '\n' + extra : '');
        if (status === 'timeout') this.noteTimeout(); else this.noteOk(body);
        if (status === 'nomarker') this.stats.markerMissing = (this.stats.markerMissing || 0) + 1;
        resolve({ status: status === 'timeout' ? 'timeout' : body.trim() ? 'ok' : 'empty', body, ms: Date.now() - t0, marker: status === 'ok' });
      };
      entry.resolve = () => {};
      // echo маркер ирэхгүй сервер (эсвэл echo гаралтгүй) байсан ч: командын өөрийн хариу ирснээс хойш
      // markerGraceMs чимээгүй болвол дууссан гэж үзнэ (огт хариугүй үед л "timeout").
      entry.onChunk = () => { clearTimeout(entry.t); entry.t = setTimeout(() => end('nomarker'), this.markerGraceMs); };
      marker.onMarker = (b) => { marker.chunks.push(b); if (marker.chunks.join('').includes(token)) end('ok'); };
      marker.resolve = () => {};
      entry.guard = setTimeout(() => end('timeout'), timeout);
      this.pending.set(id, entry); this.pending.set(mid, marker);
      sock.write(this.packet(id, 2, cmd));
      sock.write(this.packet(mid, 2, 'echo ' + token));
    });
  }
  noteTimeout() { this.stats.timeouts++; this.stats.consecutiveTimeouts++; }
  noteOk(body) { this.stats.consecutiveTimeouts = 0; this.stats.lastOkAt = Date.now(); if (!body.trim()) this.stats.empty++; }
  async reconnect() {
    this.stats.reconnects++;
    this.close();
    await new Promise(r => setTimeout(r, 200));
    await this.connect();
  }
  health() {
    return { ready: this.ready, ...this.stats, pending: this.pending.size };
  }
  close() { this.ready = false; try { this.sock && this.sock.destroy(); } catch (e) { /* ignore */ } this.sock = null; }
}

module.exports = { Rcon, END_PREFIX };
