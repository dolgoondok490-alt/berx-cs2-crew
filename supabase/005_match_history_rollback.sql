-- =========================================================
-- 005 ROLLBACK — BERX MATCH HISTORY-г буцаах
-- АНХААР: тоглолтын түүх (berx_matches, berx_match_players) БҮРМӨСӨН устана.
-- Бусад хүснэгтэд (users, skin_*, server_*, ...) хүрэхгүй.
--
-- 1) Эхлээд нөөцлөх (Supabase → SQL Editor):
--      create table berx_matches_backup        as table berx_matches;
--      create table berx_match_players_backup  as table berx_match_players;
--    эсвэл: Supabase → Database → Backups, эсвэл
--      pg_dump --data-only -t berx_matches -t berx_match_players "<connection string>" > berx_matches.sql
-- 2) Дараа нь доорхыг ажиллуулна.
-- 3) Сэргээх бол: 005_match_history.sql-г дахин ажиллуулаад
--      insert into berx_matches select * from berx_matches_backup;
--      insert into berx_match_players select * from berx_match_players_backup;
-- =========================================================
drop function if exists berx_ingest_match(jsonb);
drop table if exists berx_match_players;
drop table if exists berx_matches;
