-- =========================================================
-- 004 — BERX SKIN INVENTORY (нэмэлт, additive migration)
-- Supabase → SQL Editor → New query → paste → Run (нэг удаа)
-- Одоо байгаа хүснэгт, өгөгдлийг өөрчлөхгүй. Дахин ажиллуулахад аюулгүй (idempotent).
-- =========================================================

-- Хэрэглэгч бүрийн loadout (SteamID64-аар). Сайт дээр хадгалсан СОНГОЛТ — Steam inventory биш.
create table if not exists skin_loadouts (
  steam_id   text primary key check (steam_id ~ '^7656119[0-9]{10}$'),
  user_id    text references users(id) on delete cascade,
  loadout    jsonb not null default '{}',     -- {"2": {...T...}, "3": {...CT...}} — backend шалгасан
  favorites  jsonb not null default '[]',
  version    bigint not null default 0,       -- хадгалах бүрт +1 (agent синкийн курсор)
  updated_at bigint not null
);
create index if not exists skin_loadouts_user_idx on skin_loadouts (user_id);

-- BERX Agent-ийн синкийн төлөв (WeaponPaints MySQL руу бичсэн эсэх, серверт хэрэгжсэн эсэх)
create table if not exists skin_sync (
  steam_id   text primary key references skin_loadouts(steam_id) on delete cascade,
  version    bigint not null default 0,
  status     text not null default 'pending' check (status in ('pending', 'ok', 'error')),
  error      text,
  synced_at  bigint,
  applied_at bigint                           -- тоглогч серверт байхад wp_refresh илгээсэн хугацаа
);

-- ---------- Эрх: зөвхөн server (service_role / sb_secret) ----------
-- Сайт Supabase Auth ашигладаггүй (өөрийн session cookie). Тиймээс browser-т (anon/authenticated)
-- ямар ч эрх өгөхгүй, RLS асаалттай + policy байхгүй = шууд хандалт бүрэн хаалттай.
-- "Хэрэглэгч зөвхөн өөрийн loadout-ыг өөрчилнө" дүрмийг Vercel function нь session-ий
-- users.steam_id-ээр хэрэгжүүлнэ (browser-ийн steamId-д хэзээ ч итгэхгүй).
alter table skin_loadouts enable row level security;
alter table skin_sync     enable row level security;
revoke all on skin_loadouts, skin_sync from anon, authenticated;
grant select, insert, update, delete on skin_loadouts, skin_sync to service_role;

-- Буцаах (rollback): drop table if exists skin_sync; drop table if exists skin_loadouts;
