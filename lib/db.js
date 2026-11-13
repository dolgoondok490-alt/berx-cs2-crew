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
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

/* ---------- Supabase (PostgREST) ---------- */
function supabaseAdapter() {
  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
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
    if (!r.ok) { const t = await r.text(); throw new Error(`Supabase ${method} ${r.status}: ${t.slice(0, 200)}`); }
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
