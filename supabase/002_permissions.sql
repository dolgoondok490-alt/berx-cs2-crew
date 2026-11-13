-- =========================================================
-- 002 — Data API эрх (permission) + admin цэвэрлэгээ
-- schema.sql-ийг аль хэдийн ажиллуулсан бол ЭНИЙГ нэг удаа ажиллуул.
-- Supabase → SQL Editor → New query → paste → Run
-- =========================================================
-- 2026 оноос Supabase шинэ хүснэгтүүдийг Data API-д автоматаар нээхгүй болсон.
-- Манай сайт зөвхөн server (Vercel function, sb_secret key = service_role) дамжуулж
-- өгөгдөлд хандана. Тиймээс:
--   • service_role  → бүх эрх
--   • anon / authenticated (browser-ийн publishable key) → ЯМАР Ч эрхгүй

grant usage on schema public to service_role;

do $$
declare t text;
begin
  foreach t in array array['users','availability','invites','responses','chat','memes','votes','match_votes','records','notifications'] loop
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Өмнөх хувилбарт «анх бүртгүүлсэн хүн admin» байсныг цэвэрлэнэ.
-- Одооноос admin эрхийг зөвхөн Vercel-ийн ADMIN_LOGINS тохиргоо өгнө (дараагийн нэвтрэлтэд автоматаар).
update public.users set is_admin = false;

-- Шалгах: доорх query бүх мөрөнд service_role=true, anon=false гэж гарах ёстой
select c.relname as table_name,
       has_table_privilege('service_role', c.oid, 'select,insert,update,delete') as service_role,
       has_table_privilege('anon', c.oid, 'select') as anon,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated,
       c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;
