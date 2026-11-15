# BERX Match History (Phase 1 + 2) — суулгах, нөөцлөх, буцаах

> Бүх алхмыг **таны зөвшөөрлийн дараа**, тоглолт явагдаагүй үед хийнэ. CS2 сервер, MatchZy, WeaponPaints,
> `server.cfg`, `agent\.env`-д **хүрэхгүй**. CS2 серверийг дахин асаах шаардлагагүй (зөвхөн BERX Agent-ийг).

## Архитектур (товч)

```
Competitive 5v5:  MatchZy 0.9.2 ──(going_live / round_end / map_result, localhost + нууц header)──┐
AIM 1v1 / 2v2:    CS2 log (logaddress_add_http, AIM-д л)  ──(killed / assisted / attacked / score)──┤
                                                                                                    ▼
                         BERX Agent v1.4.0 — match-recorder.js (тооцоо) + match-history.js (.berx-matches.json дараалал)
                                    │  POST /api/server/agent/matches  (Bearer SERVER_AGENT_SECRET, 5с→5мин backoff)
                                    ▼
                 Vercel: lib/matches.js (хатуу шалгалт) → Supabase rpc berx_ingest_match (1 transaction, idempotent)
                                    │
             berx_matches + berx_match_players (RLS, зөвхөн service_role)  →  GET /api/berx/* (нэвтэрсэн гишүүд)
```

* Албан ёсны дүнг **зөвхөн** agent (SERVER_AGENT_SECRET) бичнэ. Browser-ийн session-оор бичих боломжгүй (401/405).
* Тоглогчийн ID = SteamID64. Bot, warmup, knife round, round тоглогдоогүй restart бичигдэхгүй.
* Төлөв: `completed` (ялагчтай) · `aborted` (restart, Competitive руу буцах, map солих) · `interrupted` (agent restart AIM дундуур, сервер 10+ мин унтарсан, 3 цаг event-гүй).
* Профайлын нэгтгэл зөвхөн `completed`-ээр; K/D, HS%, ADR нь **нийт** дүнгээс.

## Production-д нэвтрүүлэх дараалал (яг энэ дарааллаар)

1. **Supabase нөөц** — Supabase → Database → Backups (эсвэл PITR) дээр сүүлийн нөөц байгааг шалгана.
   Migration нь зөвхөн **шинэ** хүснэгт нэмдэг (одоо байгаа өгөгдөлд хүрэхгүй), гэхдээ урьдчилан нөөцлөх нь зөв.
2. **SQL migration** — Supabase → SQL Editor → New query → `supabase/005_match_history.sql`-г бүхэлд нь paste → Run.
   Шалгах: `select count(*) from berx_matches;` → `0`.
3. **Сайт** — PR-ыг `main` руу merge → Vercel Production **Ready** болохыг хүлээнэ.
   Шалгах: сайт → «Тоглолтын түүх» хуудас «Энэ ангилалд бүртгэгдсэн тоглолт алга» гэж харагдана (алдаа биш).
   > Сайтыг SQL-ээс өмнө deploy хийвэл Match History хуудас алдаа харуулна, agent-ийн дүн дараалалд хүлээнэ (алдагдахгүй).
4. **BERX Agent v1.4.0** — тоглолт явагдаагүй үед (доорх заавар). Зөвхөн agent-ийг дахин асаана.
   > Agent-ийг сайтаас өмнө шинэчилсэн ч дүн алдагдахгүй: 404 → дараалалд хадгалж дахин оролдоно.
5. **Шалгах** — богино AIM 1v1 (First to 10) эсвэл Competitive тоглолт тоглоод «Тоглолтын түүх»-д гарч ирэхийг харна.
   Agent log: `● Тоглолт эхэллээ ...` → `■ Тоглолт: ... completed` → `✓ Тоглолт сайтад хадгалагдлаа`.

## BERX Agent шинэчлэх (Windows PowerShell)

Өөрчлөгдсөн 3 файл: `berx-agent.js` (шинэчлэгдсэн), `match-recorder.js`, `match-history.js` (шинэ).
`arena-modes.js`, `workshop-maps.json` v1.3.2-тэй **яг ижил** (хөндөхгүй). `.env`, `.env.skins`-д хүрэхгүй.

```powershell
$Agent = "C:\BERX\agent"                     # өөрийн agent хавтас
$Ref   = "<MERGE_COMMIT_SHA>"                # merge хийсний дараах commit (эсвэл зөвшөөрсөн branch commit)
$Base  = "https://raw.githubusercontent.com/dolgoondok490-alt/berx-cs2-crew/$Ref/agent"
$Files = @{
  "berx-agent.js"     = "E527BBBA6EBC68613091DD3F51146D0EBB20919FD2242BC05D27595B9258088E"
  "match-recorder.js" = "28B52D2955F5A6A4B287C7E5FF1F3554CB69D3EB09A1F5E265CE014ADCED4539"
  "match-history.js"  = "1A6A95777C1B13357D5D0469F5C0ABAE199E8332EAF9D327C894B747558F7B47"
}
# 1) нөөц
$Backup = "$Agent\backup-v1.3.2-$(Get-Date -Format yyyyMMdd-HHmm)"
New-Item -ItemType Directory $Backup | Out-Null
Copy-Item "$Agent\berx-agent.js", "$Agent\arena-modes.js", "$Agent\workshop-maps.json" $Backup
# 2) татаж, SHA256 шалгах (таарахгүй бол юу ч солихгүй)
foreach ($f in $Files.Keys) {
  Invoke-WebRequest "$Base/$f" -OutFile "$env:TEMP\$f" -UseBasicParsing
  if ((Get-FileHash "$env:TEMP\$f" -Algorithm SHA256).Hash -ne $Files[$f]) { throw "SHA256 таарахгүй: $f" }
}
# 3) солих
foreach ($f in $Files.Keys) { Copy-Item "$env:TEMP\$f" "$Agent\$f" -Force }
"OK — нөөц: $Backup"
```

4) Agent-ийг зогсоож (цонхонд Ctrl+C эсвэл Launcher → Stop) дахин асаана. Log-д `BERX Agent v1.4.0` гарна.
CS2 серверийг дахин асаах **хэрэггүй**.

Заавал биш (`agent\.env`-д, байхгүй бол анхдагч):

| Хувьсагч | Анхдагч | Утга |
|---|---|---|
| `MATCH_HISTORY` | `1` | `0` → тоглолтын түүх бүрэн унтарна (v1.3.2-ийн зан төлөв) |
| `MATCH_DAMAGE_LOG` | `1` | `0` → AIM-д `mp_logdetail` хөндөхгүй (AIM-д ADR бүртгэгдэхгүй) |
| `SERVER_ID` | `main` | олон сервертэй болбол ялгах нэр |

## Буцаах (rollback)

* **Хамгийн хурдан (тоглолт бичихээ зогсоох):** `agent\.env`-д `MATCH_HISTORY=0` → agent restart. Бусад бүх зүйл хэвээр.
* **Agent:** нөөцөөс 3 файлыг буцааж хуулна (`match-recorder.js`, `match-history.js`-ийг устгах шаардлагагүй — v1.3.2 ашиглахгүй) → agent restart.
  ```powershell
  Copy-Item "$Backup\berx-agent.js" "$Agent\berx-agent.js" -Force
  ```
  `agent\.berx-matches.json` (илгээгдээгүй дүн) үлдэж болно — v1.3.2 үүнийг уншихгүй.
* **Сайт:** Vercel → Deployments → өмнөх Production deployment → «Promote to Production» (шууд), эсвэл GitHub дээр merge commit-ыг revert.
* **Database:** хүснэгтүүд additive тул үлдээхэд аюулгүй (сайтын хуучин хувилбар тэдгээрийг ашиглахгүй).
  Бүрэн устгах бол эхлээд нөөцлөөд `supabase/005_match_history_rollback.sql` (файлын толгойд нөөцлөх/сэргээх заавар бий).

## Мэдэгдэж буй хязгаарлалт

* Бүх тест **симуляцийн** event-ээр хийгдсэн (бодит сервер дээр тоглолт бүртгээгүй). Бодит CS2-ийн log мөрийн формат
  (killed / assisted killing / attacked) нь стандарт Source log-оор хийгдсэн; MatchZy event-ийн бүтцийг таны серверийн
  MatchZy 0.9.2 DLL-ээс шалгасан. Эхний бодит тоглолтыг Match History-д шалгана уу.
* AIM: MVP бүртгэгдэхгүй (CS2 log-д байхгүй). ADR зөвхөн `attacked` мөр ирсэн үед (`mp_logdetail`).
* AIM дундуур agent restart → тоглолт `interrupted` (restart-ын хооронд log алдагдана). Competitive үргэлжилнэ.
* Agent унтарсан үед MatchZy `map_result` алдагдвал тоглолт `aborted`/`interrupted` болно (дараагийн тоглолт, map солигдох эсвэл 3 цаг).
* Профайлын нэгтгэл нэг тоглогчийн сүүлийн 1000 тоглолтоор (ирээдүйд SQL view/leaderboard-оор өргөтгөнө).
