# BERX SKIN INVENTORY

Сайт дээр CS2 cosmetic (skin, хутга, бээлий, agent) сонгож хувийн loadout хадгалаад, BERX ARENA сервер дээр **WeaponPaints** plugin-аар хэрэгжүүлэх систем.

> ⚠️ **Анхдагчаар бүхэлдээ УНТРААЛТТАЙ.** Valve-ийн дүрмийн эрсдэлтэй (GSLT ban) — эхлээд [`COMPATIBILITY.md`](COMPATIBILITY.md)-г уншина уу.
> Production сервер дээр юу ч суулгаагүй. Бүх алхам таны тодорхой зөвшөөрлөөр.

```
Сайт (Vercel, SKINS_ENABLED)  →  Supabase skin_loadouts (SteamID64 = session-оос)
        ↑ хадгалах / төлөв                   ↓ pending (SKINS_SYNC_ENABLED)
     Тоглогч                         BERX Agent (.env.skins)  →  MariaDB 127.0.0.1 (berx_weaponpaints)
                                              ↓ тоглогч серверт байвал                ↑ уншина
                                      RCON "wp_refresh <steamid64>"  →  CS2 + WeaponPaints build-472
```

## Файлууд
| Зам | Юу |
|---|---|
| `js/pages/skins.js`, `css/app.css` | SKIN INVENTORY хуудас (Inventory, Миний loadout, T/CT, preview, favorites, синк төлөв) |
| `assets/data/skins-catalog.json`, `tools/build-skins-catalog.py` | Item каталог (WeaponPaints build-472 + ByMykel CSGO-API) |
| `lib/skins.js` | API, шалгалт, agent endpoint, feature flag |
| `supabase/004_skins.sql` | Нэмэлт migration (`skin_loadouts`, `skin_sync`, RLS) |
| `agent/skins-sync.js`, `agent/.env.skins.example`, `agent/package.json` | Agent → MySQL синк (mysql2) |
| `skins/sql/weaponpaints-build-472-schema.sql` | Plugin-ийн CREATE TABLE (өөрчлөлтгүй) |
| `skins/windows/*.ps1` | Windows шалгах / суулгах / буцаах скриптүүд |
| `tests/skins/*`, `.github/workflows/skins.yml` | Тестүүд (MariaDB 11.4 + MySQL 8.4) |

## Feature flags
| Хаана | Хувьсагч | Үр дүн |
|---|---|---|
| Vercel | `SKINS_ENABLED=1` | Цэс + хуудас + loadout хадгалах. Байхгүй бол хуудас нуугдаж API 404 |
| Vercel | `SKINS_SYNC_ENABLED=1` | Agent-ийн `/api/server/agent/skins/*` endpoint (SKINS_ENABLED-тэй хамт) |
| Windows | `agent\.env.skins` → `SKINS_SYNC_ENABLED=1` | Agent MySQL руу бичнэ |

## 1. Урьдчилан харах (эрсдэлгүй — серверт хүрэхгүй)
1. Supabase SQL Editor → `supabase/004_skins.sql` → Run (нэмэлт хүснэгт, одоо байгаа өгөгдөлд хүрэхгүй).
2. Vercel → Settings → Environment Variables → `SKINS_ENABLED=1` (**зөвхөн Preview** environment-д) → `skins-inventory` branch-ийн preview deployment-ийг Redeploy.
3. Preview URL дээр Steam-ээр нэвтэрч SKIN INVENTORY-г турш. Сонголт Supabase-д хадгалагдана, серверт юу ч очихгүй («Серверийн синк идэвхгүй»).

## 2. Локал MariaDB (Windows, Administrator PowerShell)
```powershell
cd <repo>\skins\windows
Set-ExecutionPolicy -Scope Process Bypass
.\00-check.ps1            # зөвхөн шалгана
.\02-prepare-mariadb.ps1  # MariaDB (байхгүй бол winget санал болгоно), bind-address=127.0.0.1
.\04-configure-db.ps1     # DB berx_weaponpaints, хэрэглэгч wp_plugin + berx_agent, schema, agent\.env.skins (SYNC=0)
```
* 3306 порт **зөвхөн 127.0.0.1** дээр. Firewall, router, VPS дээр 3306-г **бүү** нээ (WireGuard зөвхөн 27015).
* `wp_plugin` — plugin (SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER/INDEX), `berx_agent` — agent (SELECT/INSERT/UPDATE/DELETE, DROP эрхгүй).
* Нууц үгс: `C:\berx-skins\secrets\db-users.json` (зөвхөн таны хэрэглэгч уншина). `agent\.env` **өөрчлөгдөхгүй**.

## 3. Agent синкийг сервергүйгээр шалгах
1. Repo-ийн `agent\berx-agent.js` (v1.2.0), `agent\skins-sync.js`, `agent\package.json`-ийг agent хавтас руу хуулна.
2. `.\07-verify-schema.ps1` (mysql2 суулгаад schema шалгана).
3. Vercel: `SKINS_SYNC_ENABLED=1` (Preview), `agent\.env.skins`: `SKINS_SYNC_ENABLED=1`, `BERX_URL` (agent\.env) нь preview URL биш production бол синк production сайтаас татна — тест хийхдээ анхаар.
4. Agent-ийг дахин асаахад (launcher STOP → START эсвэл зөвхөн agent) сайтад хадгалсан loadout MySQL-д бичигдэнэ: `.\08-verify-sync.ps1 -SteamId 7656119...`
   Plugin суугаагүй тул тоглоомд хэрэгжихгүй — зөвхөн DB.

## 4. Идэвхжүүлэх (ЭРСДЭЛ хүлээн зөвшөөрсний дараа)
1. `COMPATIBILITY.md`-ийн "Valve-ийн дүрэм ба эрсдэл" хэсгийг уншина.
2. `.\03-stage-plugin.ps1` — build-472 + MenuManager 1.4.1, PlayerSettings 0.9.4, AnyBaseLib 0.9.4 татаж `C:\berx-skins\staging`-д бэлтгэнэ, SHA256 хэвлэнэ, game хавтастай зөрчил шалгана.
3. **Launcher-ээр серверээ STOP** (скриптүүд серверийг унтраахгүй/асаахгүй).
4. `.\05-install-plugin.ps1 -IUnderstandValveGsltRisk` — нөөцлөөд зөвхөн ШИНЭ файл хуулна (CSS core, Metamod, MatchZy-д хүрэхгүй), `BERX-SKINS` гэж бичиж баталгаажуулна.
   WeaponPaints бүрэн ажиллахад `FollowCS2ServerGuidelines=false` хэрэгтэй: тусдаа `-AlsoDisableServerGuidelines` + `DISABLE-GUIDELINES` баталгаажуулалт.
5. Launcher-ээр START → `.\06-verify-plugin.ps1` (`css_plugins list`, `wp_refresh`).
6. Vercel **Production**: `SKINS_ENABLED=1`, `SKINS_SYNC_ENABLED=1` → Redeploy. `agent\.env.skins`: `SKINS_SYNC_ENABLED=1` → agent дахин асаана.
7. `.\08-verify-sync.ps1 -SteamId <таны>` — сайт дээр «Тоглоомд хэрэгжсэн ✓».

## 5. Буцаах (Rollback)
| Түвшин | Алхам |
|---|---|
| Сайт | Vercel → `SKINS_ENABLED`, `SKINS_SYNC_ENABLED` устгах → Redeploy (цэс алга болно, өгөгдөл хадгалагдана) |
| Agent | `agent\.env.skins` → `SKINS_SYNC_ENABLED=0` (эсвэл файлыг устгах) → agent дахин асаах |
| Plugin | Launcher STOP → `.\99-rollback.ps1` (manifest-ийн файлуудыг устгаж, core.json-ийг сэргээнэ) → START |
| DB | `.\99-rollback.ps1 -DropDatabase` (berx_weaponpaints + хэрэглэгчид) |
| Supabase | `drop table if exists skin_sync; drop table if exists skin_loadouts;` |
| Бүрэн нөөц | `C:\berx-skins\backups\<огноо>.zip` (CSS configs/plugins/shared/gamedata, Metamod, gameinfo.gi, server.cfg) |

## Аюулгүй байдал
* SteamID64-ийг **зөвхөн** нэвтэрсэн session-ий `users.steam_id`-ээс; browser-ийн илгээсэн steamId-г үл тооно.
* Item бүр каталогоор шалгагдана (defindex+paint, skin бүрийн float хүрээ, seed 0–1000 бүхэл, StatTrak боломж, agent баг, name tag).
* Agent давхар шалгана, бүх SQL parameterized, нэг тоглогчийн өөрчлөлт нэг transaction, StatTrak тоолуурт хүрэхгүй.
* RCON-оор зөвхөн `wp_refresh <17 оронтой SteamID64>`. Вэб хэрэглэгч ямар ч RCON текст илгээж чадахгүй.
* Supabase: RLS асаалттай, anon/authenticated эрхгүй; MySQL нууц үг, RCON, agent secret сайт/GitHub-д хэзээ ч очихгүй.
