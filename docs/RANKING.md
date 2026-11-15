# BERX RANKED & BRP (Phase 3)

> Бүх тест симуляц (хуурамч CS2/MatchZy, хуурамч Supabase, хуурамч BERX Guard) болон түр PostgreSQL 16 дээр хийгдсэн.
> Бодит CS2 сервер, бодит CounterStrikeSharp плагин, production DB дээр **туршаагүй**.
> Бүх flag анхдагчаар **УНТРААЛТТАЙ** — migration, deploy хийсний дараа ч хэнд ч BRP олгогдохгүй.

## 1. Архитектур

```
CS2 (MatchZy / CS2 log) → BERX Agent 1.5.0 ──(Bearer SERVER_AGENT_SECRET)──► POST /api/server/agent/matches
   • тоглолт эхлэхэд (going_live / Match_Start)                   │ validateMatch + validateLock
     lock = {төрөл, roster CT/T SteamID64, bot тоо,               ▼
             дүрэм, BERX Guard, agent хувилбар}           berx_ingest_match (match_type, lock — анх л бичигдэнэ)
                                                                  │
                                                                  ▼ ranking.rate(matchId)  ← зөвхөн сервер
                                               decide(): flag, lock, roster, Steam холбоо, дүрэм, anti-farming
                                                                  │
                                                                  ▼
                                   berx_apply_rating (нэг transaction): berx_ranked_matches (PK=match_id, ганц шийдвэр)
                                                                       berx_ratings (FOR UPDATE, user_id дарааллаар)
                                                                       berx_rating_changes (ledger, зөвхөн нэмэгдэнэ)
```

* **Browser хэзээ ч эх сурвалж биш.** Төрөл (Ranked/Casual) нь agent-ийн түгжээнээс; BRP-ийг сервер тооцоолно. Admin командыг `server.cmd` backend дээр flag, agent хувилбар, Guard, First to 10-аар дахин шалгана. Agent ч Ranked AIM-д Guard-ийг өөрөө шалгана (давхар хамгаалалт).
* **Ledger** (`berx_rating_changes`) албан ёсны үнэн; `berx_ratings` нь кэш. `new_brp = prev_brp + delta`, `new_brp ≥ 0` check, `unique(match_id, user_id) where kind='match'`. service_role-д ч UPDATE/DELETE эрхгүй.
* Шийдвэрийн төлөв: `rated`, `not_eligible`, `review` (admin шалгалт, санал хадгалагдана), `rejected`, `error` (дахин тооцоолж болно).
* Шийдвэр гарсан тоглолтын шинэ revision → **дахин олгохгүй**, зөвхөн `flag = revised_after_rating` (admin харна).
* Casual тоглолт түүхэнд хадгалагдана, `berx_ranked_matches`-д ч орохгүй.
* Хуучин agent (1.4.0) `match_type` илгээдэггүй → бүгд Casual. 006 migration хийгээгүй үед сайт өмнөх шигээ ажиллана (Ranked сонголт "migration хийгдээгүй" шалтгаантай хаалттай).

Файлууд: `lib/ranking.js`, `lib/matches.js`, `lib/server.js`, `supabase/006_rankings.sql`, `supabase/006_rankings_rollback.sql`, `agent/berx-agent.js` (1.5.0), `agent/match-recorder.js`, `plugins/BerxGuard/`, `js/pages/ranking.js`, `js/pages/admin-ranking.js`, `js/ui/rank-emblems.js`, `css/ranking.css`.

## 2. Competitive performance — `competitive-v1`

Бүх хэмжүүр **тоглогчийн тоглосон round-д ногдохоор** (rp) → overtime, эрт гарсан тоглогч шударга. `kills = kills − team_kills`.

| Бүрэлдэхүүн | Жин | Томъёо (0–1-д clamp) |
|---|---|---|
| K/D | 30% | `0.6·min(1, KPR/1.2) + 0.4·max(0, 1 − DPR)` |
| ADR | 30% | `min(1, damage/rp/150)` — damage бүртгэгдээгүй бол жинг бусдад пропорционалаар хуваарилж, `weights_used`-д хадгална |
| Багт оруулсан хувь нэмэр | 25% | `min(1, share·n/2)`; `impact = (K + 0.4·A + dmg/100)/rp`, `share = impact / багийн нийт impact` (багийн дундаж = 0.5). Нийт 0 бол 0.5 |
| Assist | 10% | `min(1, APR/0.3)` |
| HS | 5% | `HS/kills` (kill 0 бол 0) |

`score = Σ жин·бүрэлдэхүүн` (0–100, 2 орон). Хожил: `round(150 + 80·score/100)` (+150…+230). Хожигдол: `−round(200 − 70·score/100)` (−200…−130). Өрсөлдөгчийн рейтингээр тохируулахгүй. Ижил оролт → ижил гаралт.

**Жишээ** (24 round, багийн бусад: 15/17, 12/18, 18/16, 10/19):

| Тоглогч | K/D/A, HS, DMG | Бүрэлдэхүүн (kd, adr, баг, assist, hs) | Score | Хожвол | Хожигдвол |
|---|---|---|---|---|---|
| Дундаж-сайн | 20/15/5, 10 HS, 2400 | .57, .67, .65, .69, .50 | 62.65 | **+200** | **−156** |
| Сул | 10/19/8, 3 HS, 1300 | .29, .36, .37, 1.0, .30 | 40.31 | **+182** | **−172** |
| Од тоглогч | 35/10/6, 20 HS, 3900 | .83, 1.0, .92, .83, .57 | 89.17 | **+221** | **−138** |
| Damage алга | 20/15/5 | ADR жин → kd 42.86, баг 35.71, assist 14.29, hs 7.14 | 60.78 | +199 | −157 |

**AIM 1v1 / 2v2:** хожил +30, хожигдол −30 (тогтмол). **First to 10 хэзээ ч BRP өөрчлөхгүй** — UI, сайт, agent, шийдвэр 4 түвшинд хаана.

## 3. Хэн BRP авах вэ (eligibility)

`not_eligible` (эцсийн): flag унтраалттай · Ranked идэвхжихээс өмнө эхэлсэн (`enabled_at`, retroactive байхгүй) · agent < 1.5.0 / lock алга · aborted/interrupted · тэнцээ · First to 10 · AIM-д Guard идэвхгүй · bot · roster 5v5/1v1/2v2 биш · давхардсан тоглогч · Steam-ээ BERX-тэй холбоогүй тоглогч · ижил MatchZy match ID аль хэдийн тооцогдсон.

`review` (admin шалгалт, тооцоолсон санал хадгалагдана): дүрэм түгжсэнээс өөр (map, зэвсэг, round, practice, sv_cheats) · түгжээнд байгаагүй тоглогч · баг тоглолтын явцад өөрчлөгдсөн (тал биш, бүлгээр шалгана — halftime зөв) · roster-ийн тоглогч round-ын 50%-иас бага тоглосон (disconnect) · хэт богино · ижил бүрэлдэхүүн 24 цагт хэт олон (anti-farming).

Anti-farming / sanity дүрэм (Settings → Чансаа-д өөрчилнө): `min_rounds_competitive 13`, `min_duration_competitive_s 900`, `min_duration_aim_s 60`, `min_participation 0.5`, `max_same_lineup_24h_competitive 3`, `max_same_lineup_24h_aim 6`. Зөрчил нь шууд хасдаггүй — шалгалт руу оруулна.

## 4. Feature flags ба аюулгүй идэвхжүүлэлт

`berx_ranking_settings` (ганц мөр): `enabled`, `competitive`, `aim` — бүгд `false`. Зөвхөн admin (backend `is_admin`) Settings → **Чансаа** табаас өөрчилнө, шалтгаан бичнэ, бүгд `berx_ranking_audit`-д.

1. Migration → deploy (flag унтраалттай) → сайт хэвийн ажиллаж буйг шалгана.
2. Agent 1.5.0 суулгах (§7). Server хуудсанд "BERX Agent 1.5.0+ шаардлагатай" шалтгаан алга болно.
3. `enabled` + `competitive` асаана (энэ агшин `enabled_at` болно). Нэг Casual тоглолт, дараа нь нэг Ranked 5v5 тоглож BRP-г шалгана.
4. **Ranked AIM:** BERX Guard-ийг суулгаж, бодит сервер дээр §8-ын шалгалтыг хийсний дараа л `aim` асаана. Тэр болтол Casual AIM хэвийн.
5. Асуудал гарвал flag-ийг унтраах нь хамгийн хурдан, өгөгдөл устгадаггүй буцаалт.

## 5. Production deployment-ийн яг дараалал (таны зөвшөөрлөөр)

1. **Backup** (§6).
2. Supabase → SQL Editor → `supabase/006_rankings.sql` ажиллуулах (idempotent; 005 заавал өмнө нь).
   Шалгах: `select * from berx_ranking_settings;` → `enabled=false, competitive=false, aim=false`.
3. PR merge → Vercel Production deploy Ready → сайт, Match History, Server хуудас хэвийн (Ranked сонголт хаалттай).
4. Agent 1.5.0 (§7) — тоглолт явагдаагүй үед.
5. (Сонголттой) BERX Guard плагин (§8) — тоглолт явагдаагүй үед, тусдаа зөвшөөрлөөр.
6. Flag-ууд (§4).

Environment variable шинээр нэмэх шаардлагагүй.

## 6. Backup ба rollback

**Backup (migration-ээс өмнө):** Supabase → Database → Backups (PITR/өдөр тутмын) эсвэл SQL Editor:
```sql
create table if not exists backup_berx_matches_20261115 as select * from berx_matches;
create table if not exists backup_berx_match_players_20261115 as select * from berx_match_players;
```
**Rollback түвшин:**
1. *Хамгийн аюулгүй:* Settings → Чансаа → бүх flag OFF. Өгөгдөл хэвээр, BRP олголт зогсоно.
2. *Код:* Vercel → өмнөх Production deployment-ийг "Promote" (006 хүснэгтүүд байгаа ч хуучин код тэднийг үл тоомсорлоно; ingest функц `match_type/lock`-ийг зөвхөн нэмж хадгална).
3. *DB бүрэн:* `supabase/006_rankings_rollback.sql` — BRP ledger, рейтинг, audit-ийг **бүрмөсөн устгана**, 005-ийн ingest функцийг сэргээнэ, Match History хөндөгдөхгүй. Өмнө нь ledger-ийг хадгална: `create table backup_berx_rating_changes as select * from berx_rating_changes;`
4. *Agent:* §7-ийн backup-аас `berx-agent.js`, `match-recorder.js`-ийг сэргээгээд дахин асаана (1.4.0 → бүх тоглолт Casual).
5. *Guard:* `addons/counterstrikesharp/plugins/BerxGuard` хавтсыг устгаад `css_plugins unload BerxGuard` эсвэл серверийг дараагийн завсарлагаанд restart.

## 7. Agent шинэчлэл (1.4.0 → 1.5.0) — таны зөвшөөрлөөр, тоглолт явагдаагүй үед

Өөрчлөгдсөн файл: зөвхөн `berx-agent.js`, `match-recorder.js`. `.env`, `server.cfg` хөндөхгүй. Commit-д pin хийсэн URL:

```powershell
$dir = "$env:USERPROFILE\Downloads\berx-cs2-crew-main\agent"
$c   = "e284d868d4acbed1e1fafd1e00cc332aeeb06ae9"
$raw = "https://raw.githubusercontent.com/dolgoondok490-alt/berx-cs2-crew/$c/agent"
$bak = "$dir\backup-1.4.0-$(Get-Date -f yyyyMMdd-HHmmss)"; New-Item -ItemType Directory $bak | Out-Null
Copy-Item "$dir\berx-agent.js","$dir\match-recorder.js" $bak
$want = @{ "berx-agent.js" = "196ed8cdacd7aec458e6545a6ed90071d718058855f56e8e33e26655c67f9c70";
           "match-recorder.js" = "916aaea6c3be03f36b77c2433505dac3d9d87a9dc48a7ef8c85cc3bda1844098" }
foreach ($f in $want.Keys) {
  Invoke-WebRequest "$raw/$f" -OutFile "$env:TEMP\$f"
  $h = (Get-FileHash "$env:TEMP\$f" -Algorithm SHA256).Hash.ToLower()
  if ($h -ne $want[$f]) { throw "SHA256 таарахгүй: $f ($h)" }
}
# Agent-ийг (launcher-ээр) зогсоосны дараа:
foreach ($f in $want.Keys) { Copy-Item "$env:TEMP\$f" "$dir\$f" -Force }
# Дахин асаах → лог: "BERX Agent v1.5.0"
```
Rollback: `Copy-Item "$bak\*" $dir -Force` → дахин асаана.

Agent 1.5.0-ийн өөрчлөлт: `match_type` команд (Competitive-ийн дараагийн төрөл, going_live-д түгжинэ), `aim_start/aim_rematch`-ийн `ranked`, roster/дүрэм/Guard-ийн lock, heartbeat-д `matchType`/`guard`, 60с тутам `css_berx_guard_status` (зөвхөн уншина), `sv_cheats`-ийг settings-д уншина (зөвхөн уншина). Ranked AIM эхлэхэд л `css_berx_guard_on`, гарах/Casual-д `css_berx_guard_off`.

## 8. BERX Guard (Ranked AIM-ийн хамгаалалт)

`plugins/BerxGuard` — CounterStrikeSharp **1.0.380 / net10.0** API-аар (серверийн DLL/XML-ээс шалгасан). CI (`berx-guard.yml`) build хийж `BerxGuard.dll` + SHA256 artifact гаргана. **Серверт суулгаагүй.**

Хийдэг зүйл (зөвхөн `enforcing=1` үед, анхдагч 0):
* `point_servercommand` entity-г spawn үед болон асаах агшинд `AcceptInput("Kill")`-ээр устгана → Aim_map1v1cfg-ийн `sv_cheats 1` г.м. map команд ажиллахгүй.
* `sv_cheats` 0-ээс өөр болбол `OnConVarChanged` + tick бүрийн шалгалтаар тэр даруй `sv_cheats 0`.
* Тоглогчийн cheat командыг (noclip, god, buddha, give, impulse, ent_fire, ent_create, setpos, setang, …) `AddCommandListener(Pre) → Stop`.
* Командууд зөвхөн серверийн console/RCON: `css_berx_guard_status | _on | _off`.

Суулгах (таны зөвшөөрлөөр, тоглолт явагдаагүй үед): artifact-ийн SHA256-г шалгаад `game\csgo\addons\counterstrikesharp\plugins\BerxGuard\BerxGuard.dll` → `css_plugins load BerxGuard` (эсвэл дараагийн restart).
Бодит сервер дээрх **шалгалт** (`aim` flag асаахаас өмнө, Casual-д):
1. `css_berx_guard_status` → `BERX_GUARD ok v=1.0.0 enforcing=0 …`
2. Casual AIM → `css_berx_guard_on` гараар → map ачаалж round эхлүүлэхэд `killed>0`, `sv_cheats` 0 хэвээр, тоглогчийн `noclip` ажиллахгүй.
3. `css_berx_guard_off` → Practice горимд `sv_cheats 1` хэвийн ажиллана.

**Хязгаарлалт:** client-ийн өөрийн cheat convar (r_*/mat_*) sv_cheats replication-оос хамаарна; Guard sv_cheats-ийг хэдэн frame дотор буцаадаг ч онолын хувьд маш богино цонх үлдэж болно (map команд нь устгагдсан тул ердийн замаар тохиолдох ёсгүй). Плагин бодит сервер дээр хараахан ажиллаж үзээгүй — **cheat бүрэн хаагдсан гэж үзэхгүй.**

## 9. Competitive-ийн бүрэн бүтэн байдлын хязгаар

BERX Ranked нь FACEIT/anti-cheat-ийн орлуулга биш. Wallhack/aimbot илрүүлэхгүй. Хамгаалалт: roster түгжээ, Steam-BERX холбоо, MatchZy-ийн бодит хил, sv_cheats/practice шалгалт, anti-farming, admin шалгалт, засвар + audit.

## 10. Мэдэгдэж буй хязгаарлалт, үлдсэн эрсдэл

* Бүх тест симуляц; бодит CS2/MatchZy/CSS дээр туршаагүй.
* BERX Guard build зөвхөн CI-д (локалд dotnet байхгүй); бодит зан төлөв баталгаажаагүй → `aim` flag унтраалттай байх ёстой.
* Competitive roster = going_live агшинд серверт CT/T-д байсан хүмүүс (status_json, 5с). Тэр агшинд холболт тасарсан тоглогч roster-оос дутвал `roster_size` болно.
* Admin-ийн Ranked/Casual сонголт тоглолт эхлэхэд түгжигдэнэ; явж буй тоглолтын явцад сольсон нь дараагийнхад л хамаарна.
* Agent restart-ын үед AIM тоглолт `interrupted` болдог (Phase 2-ийн зан төлөв) → BRP-гүй.
* `berx_ratings` нь кэш — ledger-ээс гадуур гараар засвал (жишээ нь SQL Editor-оос) зөрнө; зөвхөн `berx_adjust_rating` ашиглана.
* Inflation: ялагч ихэвчлэн ялагдагчаас их авна (+190 / −165 дундаж) → нийт BRP аажмаар өснө; Settings → Чансаа-д хянаж, шаардлагатай бол дараагийн томъёоны хувилбарт тохируулна.

## 11. 007 — Database hardening (defense in depth)

`supabase/007_ranking_hardening.sql` нь `berx_apply_rating`-ийг сольж, шинэ `berx_rating_validate(match_id, changes)`-ийг нэмнэ. Хүснэгт, өгөгдөл, томъёо, зэрэглэлийн хил өөрчлөгдөхгүй; backend код өөрчлөгдөхгүй.

DB өөрөө хадгалсан тоглолттой тулгана: BRP хэмжээ (Competitive +150…+230 / −200…−130, AIM яг ±30), roster-ийн яг тоглогчид, `users.steam_id ↔ user_id`, эцсийн багаас тооцсон win/loss, revision (хуучирсан/ирээдүйн → татгалзана), approve зөвхөн хадгалсан proposal-аар (flag-тай/өөрчилсөн → татгалзана), Ranked+completed+CT/T ялагч, First to 10 / Guard, flag + `enabled_at`.
Автомат дуудлагад шалгалт унавал BRP олгохгүй, шийдвэр `error` (`db_validation: <шалтгаан>`) болж Settings → Чансаа → Алдаа-нд харагдана.

Суулгах: (1) backup — `create table backup_berx_rating_changes_007 as select * from berx_rating_changes;` (2) Supabase SQL Editor → `007_ranking_hardening.sql` → Run. (3) Шалгах: `select proname from pg_proc where proname in ('berx_apply_rating','berx_rating_validate');` → 2 мөр. Deploy, agent, env шаардлагагүй.
Буцаах: `007_ranking_hardening_rollback.sql` (006-ийн функцийг яг сэргээнэ, өгөгдөл хөндөхгүй).

## 12. 008 — Түүхэн BRP нөхөн бүртгэл (нэг удаа)
`supabase/008_historical_rating_import.sql` — admin баталсан manifest-ээр 2026-11-15-ний 4 Competitive тоглолтыг BRP-д нөхөн бүртгэх механизм (migration өөрөө BRP өөрчлөхгүй). Дараалал, dry run, буцаалт: `docs/historical-import/README.md`.
