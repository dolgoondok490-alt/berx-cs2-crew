/* =========================================================
 * DB adapter — нэг интерфейс, хоёр хэрэгжүүлэлт:
 *   • Supabase (PostgREST)  — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY байвал
 *   • Local JSON файл (data/db.json) — локал хөгжүүлэлт, туршилтад
 * Ашиглалт:
 *   select(table, { eq, gte, lt, in, order: 'col.desc', limit })
 *   insert(table, row) · upsert(table, row, ['pk1','pk2'])
 *   update(table, eq, patch) · remove(table, eq)
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Шинэ sb_secret_ key нь JWT биш → зөвхөн apikey header-т явна (Authorization-д хийвэл "Invalid JWT").
// Хуучин service_role (eyJ...) JWT бол Authorization-д ч давхар явуулна.
const isJwt = (k) => /^eyJ/.test(k);
function authHeaders() { return isJwt(SB_KEY) ? { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } : { apikey: SB_KEY }; }

/* ---------- Supabase (PostgREST) ---------- */
function supabaseAdapter() {
  const H = { ...authHeaders(), 'Content-Type': 'application/json' };
  const enc = (v) => encodeURIComponent(String(v));
  function qs(f = {}) {
    const p = [];
    for (const [k, v] of Object.entries(f.eq || {})) p.push(`${k}=eq.${enc(v)}`);
    for (const [k, v] of Object.entries(f.gte || {})) p.push(`${k}=gte.${enc(v)}`);
    for (const [k, v] of Object.entries(f.lt || {})) p.push(`${k}=lt.${enc(v)}`);
    for (const [k, v] of Object.entries(f.in || {})) p.push(`${k}=in.(${v.map(x => '"' + String(x).replace(/"/g, '') + '"').map(enc).join(',')})`);
    if (f.order) p.push(`order=${f.order}`);
    if (f.limit) p.push(`limit=${f.limit}`);
    p.push(`select=${f.columns || '*'}`);
    return p.join('&');
  }
  async function req(method, url, body, prefer) {
    const r = await fetch(url, { method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) {
      const t = await r.text();
      const hint = /42501|permission denied/i.test(t) ? ' → supabase/002_permissions.sql-г SQL Editor-т ажиллуулна уу'
        : /PGRST205|schema cache|does not exist/i.test(t) ? ' → supabase/schema.sql ажиллуулсан эсэхийг шалгана уу'
        : r.status === 401 ? ' → SUPABASE_SECRET_KEY (sb_secret_...) зөв эсэхийг шалгана уу' : '';
      throw new Error(`Supabase ${method} ${r.status}: ${t.slice(0, 160)}${hint}`);
    }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  const base = (t) => `${SB_URL}/rest/v1/${t}`;
  return {
    name: 'supabase',
    select: (t, f) => req('GET', `${base(t)}?${qs(f)}`),
    insert: (t, row) => req('POST', base(t), row, 'return=minimal'),
    upsert: (t, row, keys) => req('POST', `${base(t)}?on_conflict=${keys.join(',')}`, row, 'resolution=merge-duplicates,return=minimal'),
    update: (t, eq, patch) => req('PATCH', `${base(t)}?${qs({ eq }).replace(/&?select=\*/, '')}`, patch, 'return=minimal'),
    remove: (t, eq) => req('DELETE', `${base(t)}?${qs({ eq }).replace(/&?select=\*/, '')}`, null, 'return=minimal')
  };
}

/* ---------- Local JSON файл ---------- */
function fileAdapter() {
  const file = path.resolve(__dirname, '..', 'data', 'db.json');
  let db = {};
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { db = {}; }
  const save = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); };
  const tbl = (t) => (db[t] ||= []);
  const match = (row, f = {}) =>
    Object.entries(f.eq || {}).every(([k, v]) => String(row[k]) === String(v)) &&
    Object.entries(f.gte || {}).every(([k, v]) => row[k] >= v) &&
    Object.entries(f.lt || {}).every(([k, v]) => row[k] < v) &&
    Object.entries(f.in || {}).every(([k, v]) => v.map(String).includes(String(row[k])));
  return {
    name: 'file',
    async select(t, f = {}) {
      let rows = tbl(t).filter(r => match(r, f)).map(r => ({ ...r }));
      if (f.order) { const [c, d] = f.order.split('.'); rows.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (d === 'desc' ? -1 : 1)); }
      if (f.limit) rows = rows.slice(0, f.limit);
      return rows;
    },
    async insert(t, row) { tbl(t).push({ ...row }); save(); },
    async upsert(t, row, keys) {
      const rows = tbl(t); const i = rows.findIndex(r => keys.every(k => String(r[k]) === String(row[k])));
      if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ ...row }); save();
    },
    async update(t, eq, patch) { tbl(t).forEach((r, i, a) => { if (match(r, { eq })) a[i] = { ...r, ...patch }; }); save(); },
    async remove(t, eq) { db[t] = tbl(t).filter(r => !match(r, { eq })); save(); }
  };
}

const configured = !!(SB_URL && SB_KEY);
module.exports = configured ? supabaseAdapter() : fileAdapter();
module.exports.SUPABASE_URL = SB_URL;
module.exports.SUPABASE_KEY = SB_KEY;
module.exports.authHeaders = authHeaders;
