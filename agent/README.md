# BERX ARENA — CS2 сервер холбох заавар

```
Найзууд (CS2) ──UDP 27015──▶  ТАНЫ КОМПЬЮТЕР: CS2 Dedicated Server (+ Metamod, CounterStrikeSharp, MatchZy)
                                         ▲ RCON (зөвхөн 127.0.0.1)
                                         │
                                   BERX Agent (node)  ──HTTPS (гадагш)──▶  berx-cs2-crew.vercel.app  ⇄  Supabase
```

* CS2 сервер **Vercel дээр биш**, таны Windows компьютер дээр ажиллана.
* Agent зөвхөн сайт руу **гадагш** холбогдоно: сайтад зориулж порт нээх хэрэггүй.
* RCON нууц үг зөвхөн таны компьютерт (agent/.env, server.cfg) байна. GitHub, Vercel, браузерт хэзээ ч очихгүй.
* Сайтаас ирсэн команд бүрийг backend (admin эсэх + allowlist) болон agent (дахин allowlist) хоёулаа шалгана.
* Agent ажиллахгүй үед сайт **Offline / Not configured** гэж харуулна. Хуурамч мэдээлэл харуулахгүй.

---

## 1. Supabase — хүснэгт нэмэх (1 удаа)
Supabase → SQL Editor → `supabase/003_server.sql`-ийн агуулгыг хуулаад **Run**.

## 2. Vercel — нууц түлхүүр нэмэх (1 удаа)
Vercel → Project → Settings → Environment Variables:

| Нэр | Утга |
|---|---|
| `SERVER_AGENT_SECRET` | 24+ тэмдэгттэй санамсаргүй текст. Жишээ үүсгэх: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SERVER_PASSWORD` | (заавал биш) серверийн `sv_password`. Зөвхөн нэвтэрсэн гишүүдэд connect команд дотор очно |

Дараа нь **Deployments → Redeploy**.

## 3. CS2 сервер суулгах (Windows 10/11)
1. Хатуу дискэнд **~40GB** сул зай байгаа эсэхийг шалга.
2. Энэ repo-г татаж аваад (GitHub → Code → Download ZIP) задла.
3. **PowerShell → Run as Administrator**:
   ```powershell
   cd <repo>\agent\windows
   Set-ExecutionPolicy -Scope Process Bypass
   .\install-cs2.ps1 -Dir C:\cs2-server -ServerPassword "найзууддаа_өгөх_нууц_үг"
   ```
   Скрипт SteamCMD, CS2 сервер, Metamod:Source 2.x, CounterStrikeSharp, MatchZy-г татаж суулгаад `server.cfg`, firewall-ийг тохируулна.
   Төгсгөлд нь **RCON_PASSWORD** хэвлэнэ. Түүнийг 5-р алхамд ашиглана.
   Plugin татагдаагүй бол улаан мөрөнд гарсан холбоосоос zip-ийг татаад `C:\cs2-server\game\csgo` руу задла.
4. *(Зөвлөмж)* https://steamcommunity.com/dev/managegameservers (App ID **730**) дээр GSLT token аваад `start-cs2.bat`-ийн `GSLT=`-д оруул.
5. **Router-т port forward:** UDP + TCP **27015** → таны компьютерийн дотоод IP (жишээ 192.168.1.10). Гадаад IP-гаа https://api.ipify.org -оос хар.
   > Зарим интернэт (CGNAT) гаднаас порт нээх боломжгүй байдаг. Тэгвэл ISP-ээсээ "public IP" хүс, эсвэл Tailscale/ZeroTier ашигла.
6. `start-cs2.bat`-ийг ажиллуул. Серверийн консолд шалга:
   * `meta list` → Metamod + CounterStrikeSharp харагдана
   * `css_plugins list` → **MatchZy** харагдана

> ⚠️ CS2 шинэчлэгдэх бүрт: серверээ хаагаад `install-cs2.ps1`-г дахин ажиллуул (CS2-г шинэчилж, gameinfo.gi-г дахин засна).

## 4. Node.js суулгах
https://nodejs.org → **LTS** (18 эсвэл түүнээс дээш). `npm install` хэрэггүй.

## 5. Agent тохируулах
`agent\.env.example`-г `agent\.env` болгож хуулаад бөглө:

```
BERX_URL=https://berx-cs2-crew.vercel.app
SERVER_AGENT_SECRET=<Vercel дээрхтэй ЯГ ижил>
RCON_PASSWORD=<install-cs2.ps1-ийн хэвлэсэн>
PUBLIC_ADDRESS=<гадаад IP>:27015
CS2_DIR=C:\cs2-server
```

## 6. Agent асаах
`agent\windows\start-agent.bat`. Зөв ажиллавал:
```
✓ RCON холбогдлоо 127.0.0.1:27015
✓ MatchZy event сонсож байна: 127.0.0.1:27050
```
Сайтын **SERVER** цэс → **Online**, map, тоглогчид харагдана.

---

## Юу хэрхэн ажилладаг вэ
| Сайт дээрх үйлдэл | Сервер дээр |
|---|---|
| Map vote → Admin "Серверт тавих" | `changelevel de_xxx` |
| Mode | Competitive `game_type 0; game_mode 1` · Wingman `game_mode 2` · 1v1 · Practice (cheats, infinite ammo, buy anywhere) |
| Round time / Max rounds / Start money / Freeze time / FF / Overtime | `mp_*` cvar |
| Knife round | `matchzy_knife_enabled_default` (MatchZy) |
| Bots | `bot_add_ct`, `bot_add_t`, `bot_kick` |
| Warmup / Match start / restart / stop | `mp_warmup_*`, `css_start` (MatchZy), `mp_restartgame 1`, `css_restart` |
| Kick | `kickid <userid>` (SteamID64-өөр олно) |
| CT/T баг → "Серверт хэрэгжүүлэх" | `game\csgo\berx_match.json` бичээд `matchzy_loadmatch`. MatchZy тоглогчийг SteamID64-өөр нь зөв багт оруулна, жагсаалтад байхгүй хүнийг оруулахгүй |
| Оноо, Live/Finished | MatchZy event-ээс (`going_live`, `round_end`, `map_result`) |

## Map pool (7): Mirage, Dust II, Inferno, Nuke, Ancient, Anubis, Cache
* Cache 2026 оны 4-р сарын 28-нд CS2-т албан ёсоор (`de_cache`) нэмэгдсэн тул Workshop хэрэггүй. Сервер тэрнээс хойш **шинэчлэгдсэн** байх ёстой (`install-cs2.ps1` дахин ажиллуулах эсвэл SteamCMD `app_update 730 validate`).
* Agent map бүр серверт суусан эсэхийг шалгана: `CS2_DIR\game\csgo\maps\<map>.vpk` (CS2_DIR тохируулсан бол), эсвэл RCON `maps *`. Суугаагүй map сайт дээр **«Серверт алга»** гэж харагдаж, admin «Серверт тавих» товч идэвхгүй болно.
* `CS2_DIR` нь `game\csgo` хавтсыг агуулсан зам. SteamCMD-ээр суулгасан бол: `C:\cs2-server\steamcmd\steamapps\common\Counter-Strike Global Offensive`.
* (Заавал биш) Суугаагүй map-ыг Workshop-оос ачаалах: `agent\.env`-д `WORKSHOP_CACHE=<id>` → `host_workshop_map <id>`.

## Workshop map + AIM 1V1 (agent v1.3.0)

Агент хавтсанд эдгээр 3 файл **хамт** байна: `berx-agent.js`, `arena-modes.js`, `workshop-maps.json`
(`agent\.env`, `agent\.env.skins`-д хүрэхгүй). Шинэ тохиргоо шаардахгүй — `CS2_DIR` аль хэдийн тохируулсан байх ёстой
(Workshop татагдсан эсэхийг `...\steamapps\workshop\content\730\<id>`-ээс шалгана).

* **AIM / 1V1** табаас admin: map (aim_map), 1v1/2v2, AK-47/M4A4/M4A1-S/AWP, First to 10/13/16 → «AIM эхлүүлэх».
* Agent: одоогийн convar-уудыг `agent\.berx-arena-state.json`-д хадгална (нууц мэдээлэлгүй) → MatchZy `css_restart` +
  `matchzy_autostart_mode 0` (унтуулна) → `host_workshop_map <allowlist ID>` → сервер map-аа мэдээлсний дараа AIM тохиргоо
  (bot kick, team balance off, freezetime 0, `mp_maxrounds 2N-1` + clinch, зэвсэг, `mp_match_end_restart 1`) → буцааж уншиж шалгана.
* Сайтын төлөв: **Хүсэлт → Татаж байна → Ачаалж байна → Тохируулж байна → Бэлэн** / **Алдаа**. "Бэлэн" нь зөвхөн сервер
  тухайн map-ыг status-аар мэдээлж, тохиргоо батлагдсаны дараа гарна. Татах 15 мин, ачаалах 3 мин-ээс хэтэрвэл Алдаа.
* **Дахин тоглох** — тохиргоог (хэмжээ/зэвсэг/round) дахин хэрэгжүүлж `mp_restartgame 1`. Тоглолт дуусахад ижил map дээр дахин эхэлнэ.
* **AIM дуусгах** (эсвэл Competitive map «Серверт тавих», горим солих) — хадгалсан convar-ууд + MatchZy-ийн анхны
  `matchzy_autostart_mode` (`cfg\MatchZy\config.cfg`-оос уншина) сэргээгдээд competitive map руу шилжинэ.
* AIM үед MatchZy-г сэрээх командууд (баг түгжих, match start/stop, knife, bot нэмэх) сайт болон agent дээр хоёуланд нь хориотой.
* Skin Inventory: WeaponPaints / MariaDB-д хүрэхгүй. Сонгосон skin, хутга, бээлий, agent Workshop map дээр ч ажиллана
  (зэвсэг бүрийн skin T/CT loadout-аас — жишээ нь T багт M4 өгвөл таны T loadout-ийн M4 skin).

**Шинэ Workshop map нэмэх:** `agent/workshop-maps.json`-д нэг мөр (`id`, `category: aim|competitive`, `workshopId`,
`mapName` = map-ын дотоод нэр, `image` = Steam Workshop-ын жинхэнэ screenshot URL) → push/deploy → серверийн agent хавтсанд
шинэ `workshop-maps.json`-ыг хуулж agent-ийг дахин асаана. Сайт ба agent хоёулаа энэ allowlist-ээр шалгадаг.

## Алдаа засах
* **"SERVER_AGENT_SECRET Vercel дээрхтэй таарахгүй"**: хоёр газар ижил эсэхийг шалгаад Vercel-ээ Redeploy хий.
* **"RCON холбогдсонгүй"**: сервер `-usercon`-той асаагүй, эсвэл `rcon_password` agent/.env-тэй таарахгүй байна.
* **Тоглогчийн SteamID харагдахгүй / kick ажиллахгүй**: `DEBUG=1` болгоод agent-ийг асаа. `status_json keys:` мөрийг хуулж Claude-д үзүүл (CS2 update-ээр формат өөрчлөгдөж болно).
* **Knife / баг түгжих / css_start ажиллахгүй**: MatchZy суугаагүй байна (`css_plugins list`).
* **Найзууд холбогдож чадахгүй**: port forward 27015 UDP, Windows Firewall, GSLT token-оо шалга.
