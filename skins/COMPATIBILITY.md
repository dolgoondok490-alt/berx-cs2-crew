# BERX SKIN INVENTORY — Plugin compatibility report

Шалгасан огноо: 2026-11-15. Эх сурвалж: plugin-уудын GitHub repo (source code, csproj, git tag), Steam Support.
Production сервер дээр **юу ч суулгаагүй, өөрчлөөгүй** — энэ тайлан болон скриптүүд зөвхөн бэлтгэл.

## 1. WeaponPaints (Nereziel/cs2-WeaponPaints)

| | |
|---|---|
| Сонгосон release | **build-472** (tag `build-472`, commit `3b2eb5f9`, 2026-11-02), plugin version **3.3a** — хамгийн сүүлийн release |
| Release asset | `WeaponPaints.zip` (repo-ийн `build.yml` workflow үүсгэдэг: `addons/counterstrikesharp/plugins/WeaponPaints/` + `addons/counterstrikesharp/gamedata/weaponpaints.json`) |
| Target framework | **net10.0** |
| CounterStrikeSharp API | compile: `CounterStrikeSharp.API 1.0.378`, `[MinimumApiVersion(338)]` |
| Бусад сан (zip дотор) | Dapper 2.1.89, MySqlConnector 2.6.2, Newtonsoft.Json 13.0.4 |
| Windows | CounterStrikeSharp-ийн managed plugin (платформоос үл хамаарах .NET dll) + `gamedata/weaponpaints.json` (Windows/Linux signature-тэй) |
| DB | MySQL / MariaDB — plugin эхний ачаалалт дээр хүснэгтүүдээ өөрөө үүсгэнэ |

### Таны CounterStrikeSharp 1.0.380-тай нийцэх эсэх
* CounterStrikeSharp **v1.0.380** (2026-11-12) нь мөн **net10.0** — WeaponPaints build-472 (net10.0)-тай runtime таарна.
* API 380 ≥ MinimumApiVersion 338, compile хувилбар 1.0.378 ≤ 1.0.380 → **нийцтэй** (minor update).
* Анхаарах: 2026 оны 4-р сараас өмнөх WeaponPaints build-үүд net8.0 байсан; хуучин build-ийг 1.0.380 дээр **бүү** суулга.
* `00-check.ps1` нь CSS хувилбар, `.NET 10` runtime хавтас, Metamod, MatchZy, `FollowCS2ServerGuidelines`-ийг шалгана.

### Шаардлагатай хамаарлууд (WeaponPaints README)
| Plugin | Хувилбар (сүүлийн tag) | Framework | Тэмдэглэл |
|---|---|---|---|
| MenuManagerCS2 (NickFox007) | 1.4.1 | net8.0, CSS API 1.0.305 | |
| PlayerSettingsCS2 (NickFox007) | 0.9.4 | net8.0, CSS API 1.0.365 | |
| AnyBaseLibCS2 (NickFox007) | 0.9.4 | net8.0 | |

Эдгээр нь net8.0 build. CounterStrikeSharp-ийн .NET 10 host дээр net8 plugin ачаалагдах ёстой (таны MatchZy ч net8). Гэхдээ бид
тест сервер дээр ажиллуулж шалгаагүй — `06-verify-plugin.ps1` (`css_plugins list`) заавал ажиллуулна.

### DB schema (build-472, `Utility.cs` — `skins/sql/weaponpaints-build-472-schema.sql`-д өөрчлөлтгүй хуулсан)
| Хүснэгт | Түлхүүр | Тэмдэглэл |
|---|---|---|
| `wp_player_skins` | UNIQUE(steamid, weapon_team, weapon_defindex) | paint, wear (float), seed, nametag, stattrak, stattrak_count, sticker_0..4, keychain. **Хутга, бээлийн finish мөн энд** (тухайн defindex-ээр) |
| `wp_player_knife` | UNIQUE(steamid, weapon_team) | `knife` = `weapon_knife_karambit` гэх мэт |
| `wp_player_gloves` | UNIQUE(steamid, weapon_team) | `weapon_defindex` = бээлийн загвар |
| `wp_player_agents` | UNIQUE(steamid) | `agent_ct`, `agent_t` = `ctm_st6/ctm_st6_variante` гэх мэт |
| `wp_player_music`, `wp_player_pins` | | энэ төсөлд ашиглахгүй |

`weapon_team`: **2 = T, 3 = CT**, бусад утга = хоёр баг (`WeaponSynchronization.cs`).

### Refresh команд (шалгасан)
`Commands.cs`: `wp_refresh <steamid64|all>` — **зөвхөн серверийн консол/RCON** (тоглогч дуудвал үл тооно),
`CommandWpEnabled` болон `SkinEnabled` true байх ёстой. Тоглогчийн өгөгдлийг MySQL-ээс дахин уншаад бээлий, зэвсэг, agent-ийг дахин өгнө.
Анхаар: DB-ээс унших нь асинхрон, тэр даруй хэрэглэдэг тул нэг удаагийн дуудлага өмнөх сонголтыг хэрэглэж магадгүй →
BERX Agent 2.5 секундын дараа 2 дахь удаа илгээнэ.

### Дэмжих / дэмжихгүй
| Боломж | Төлөв |
|---|---|
| Зэвсгийн skin, wear, seed | ✅ сайт + синк |
| Хутганы загвар + finish | ✅ |
| Бээлий (загвар + finish) | ✅ |
| Agent (T / CT тус тусдаа) | ✅ |
| T / CT тусдаа loadout | ✅ (plugin `weapon_team` 2/3) |
| StatTrak (асаах/унтраах) | ✅ `weapon_stattrak`. Тоолуурыг (`weapon_stattrak_count`) plugin өөрөө бичдэг — синк **хөндөхгүй** |
| Name tag | ✅ `weapon_nametag` (20 тэмдэгт, тусгай тэмдэгтгүй) |
| Sticker, keychain | ❌ хойшлуулсан — schema-д бий ч байрлал (x/y/scale/rotation) засварлах UI, баталгаажуулалт шаардлагатай |
| Music kit, pin | ❌ хамрахгүй (хүсэлтэд байхгүй) |

### Item өгөгдөл
`assets/data/skins-catalog.json` — WeaponPaints build-472-ийн `website/data/{skins,gloves,agents}_en.json` (plugin-ийн яг ашигладаг
defindex / paint / knife нэр / agent model) + ByMykel/CSGO-API (commit 4827888)-ийн rarity, float хүрээ, StatTrak, ангилал, Steam CDN зураг.
2067/2067 skin, 94/94 бээлий, 63/63 agent тохирсон (таарахгүй бол build script алдаа өгнө). Үүсгэх: `tools/build-skins-catalog.py`.

## 2. Valve-ийн дүрэм ба эрсдэл ⚠️

* **Steam Support (CS2 — GSLT Bans):** тоглогчийн inventory-г худал харуулах mod ажиллуулдаг server operator-уудад GSLT ban өгдөг;
  эзэмшээгүй хутга (жишээ нь vanilla Karambit) өгөх нь хүртэл ban авах шалтгаан болно; хэн харж байгаагаас үл хамааран
  эзэмшээгүй item үүсгэх/дуурайхыг хориглоно.
* GSLT ban **буцаагдахгүй**. Ban авсан operator-ийн Steam данс **матчмейкинг cooldown** авч, тэр хугацаанд **CS2 item арилжаа хийх боломжгүй** болно.
* WeaponPaints-ийн өөрийн README: plugin нь CounterStrikeSharp-ийн `FollowCS2ServerGuidelines`-ийг **false** болгохыг шаарддаг, "Use at your own risk".
* Тоглогчид (серверт тоглосноор) ban авахгүй — эрсдэл нь **серверийн эзэн / GSLT эзэмшигчид**.
* GSLT ашиглаагүй (зөвхөн IP-ээр холбогддог) сервер ч Valve-ийн дүрмийн хүрээнд хэвээр; ирээдүйд GSLT тавих бол энэ эрсдэл шууд хамаарна.
* Энэ систем тоглогчдод бодит Steam inventory-ийн item **өгөхгүй**, эзэмшил гэж **харуулахгүй** (сайт дээр тодорхой бичсэн).

**Зөвлөмж:** Идэвхжүүлэхээс өмнө эрсдэлийг хүлээн зөвшөөрөх эсэхээ шийд. `FollowCS2ServerGuidelines`-ийг унтраах, plugin суулгах
алхмууд тус тусдаа тодорхой switch + бичгээр баталгаажуулалт шаарддаг (`05-install-plugin.ps1`).
