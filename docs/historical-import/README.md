# Түүхэн 4 Competitive тоглолтын BRP нөхөн бүртгэл (2026-11-15, UB)

Зөвхөн эдгээр 4 тоглолт, энэ дарааллаар: **Anubis 19:11 (4:13) → Ancient 19:38 (13:8) → Cache 20:12 (10:13) → Mirage 20:52 (13:11)**.
AIM 1v1 Aim_map1v1cfg 17:54 (6:10) нь First to 10 тул **оруулахгүй**. Өөр тоглолт оруулахгүй.

## Хамгаалалт
* Тоглолтын төрөл **Casual хэвээр**, оноо/статистик/lock өөрчлөгдөхгүй; UI-д "Чансаанд нөхөн бүртгэсэн".
* `enabled_at`, feature flag, ердийн Ranked шалгалт (007) хөндөгдөхгүй.
* `berx_historical_approve` зөвхөн: 2026-11-15 UB өдрийн, MatchZy, completed, CT/T ялагчтай, Competitive, lock-гүй Casual, өмнө нь шийдвэргүй тоглолт; бүх batch нийлбэр ≤ 4; тоглолт бүр нэг удаа.
* Manifest нь яг match ID + revision + өгөгдлийн SHA-256 fingerprint-ийг түгжинэ. Import-ын агшинд бүгдийг дахин шалгана; өөрчлөгдсөн бол татгалзана.
* DB өөрөө шалгана: яг 10 бүртгэлтэй тоглогч (5+5), дүн нь эцсийн баг + ялагчаас, BRP хязгаар (+150…+230 / −200…−130), BRP ↔ үзүүлэлт (competitive-v1, ±1 дугуйралт), оролцоо ≥ 50%, статистикийн бүрэн бүтэн байдал.
* 4 тоглолт **нэг transaction**; аль нэг нь унавал юу ч бичигдэхгүй. Дахин ажиллуулбал `already_imported` (давхар олголтгүй). Ердийн rating ба import нэг тоглолтод хоёулаа олгох боломжгүй.
* Зөвхөн `service_role` / SQL Editor. anon/authenticated ажиллуулж чадахгүй.
* Migration өөрөө BRP өөрчлөхгүй.

## Алхам (бүгд таны зөвшөөрлөөр)
1. **Export (read-only)** — SQL Editor-т `docs/historical-import/export.sql` → Run → гаралтын JSON нүдийг бүхэлд нь хуулж `export.json` болгон надад өгнө. (006 хангалттай, юу ч бичихгүй.)
2. **Offline dry run** — `node scripts/historical-dry-run.mjs export.json --out out --admin <таны users.id>` → `report.md/csv/json` + SQL. Аль нэг тоглолт шалгалтад унавал SQL үүсгэхгүй, шалтгааныг бичнэ.
   Таны users.id: `select id, nick from users where login = '<admin login>';`
3. Та dry run-ийг **батална**.
4. Backup (доор) → `007_ranking_hardening.sql` → `008_historical_rating_import.sql` (BRP өөрчлөхгүй).
5. `out/1-approve.sql` → manifest (BRP өөрчлөхгүй).
6. `out/2-dry-run.sql` → production дээрх SQL dry run (юу ч бичихгүй); гаралт `report.json`-той яг таарах ёстой.
7. `out/3-execute.sql` → бодит import (нэг transaction). `out/4-verify.sql`-ээр шалгана.

## Backup (4-өөс өмнө)
Supabase → Database → Backups (snapshot огноог тэмдэглэ), мөн SQL Editor:
```sql
create table backup_20261115_berx_ratings as select * from berx_ratings;
create table backup_20261115_berx_rating_changes as select * from berx_rating_changes;
create table backup_20261115_berx_ranked_matches as select * from berx_ranked_matches;
create table backup_20261115_berx_ranking_audit as select * from berx_ranking_audit;
create table backup_20261115_berx_matches as select * from berx_matches;
create table backup_20261115_berx_match_players as select * from berx_match_players;
```

## Буцаах / засах
* Import-оос өмнө: `008_historical_rating_import_rollback.sql`, дараа нь `007_ranking_hardening_rollback.sql` (өгөгдөл хөндөхгүй). 008 rollback нь import хийгдсэн бол татгалзана.
* Import-ын дараа: **ledger-ийн мөр устгахгүй.** `out/reverse.sql` (`berx_historical_reverse`) — тоглогч бүрт нөхөх adjustment бичиж, ranked/хожил/хожигдлын тоог буцааж, шийдвэрт `historical_reversed` тэмдэглэж, audit үлдээнэ. Нэг тоглогчийн засвар бол Settings → Чансаа → гараар засвар (шалтгаан, audit).
* Хязгаар: reverse нь оргил BRP (peak)-ийг бууруулахгүй; 0-ийн хил хэрэгжсэн тоглогчийн буцаалт яг тэнцүү биш байж болно (тайланд харагдана).
