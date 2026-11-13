# BERX CS2 CREW

**BAD AIM. LOW ELO.** — найзуудын CS2 платформ: тоглох урилга, live lobby, Steam нэвтрэлт, Premier/FACEIT статистик, Leaderboard, Awards, Fun Room.

## Бүтэц
```
index.html, css/, js/, assets/   Frontend (framework-гүй, build хэрэггүй)
  js/data/mock.js                DEMO өгөгдөл (server-гүй preview-д л)
  js/services/store.js           Төлөв
  js/services/api.js             UI-ийн өгөгдлийн давхарга (demo горим)
  js/services/live.js            LIVE горим: бүх үйлдлийг server руу, realtime шинэчлэл
  js/ui/components.js            Sidebar, Header, PlayerCard, AwardCard, ProfileModal...
  js/pages/*.js                  dashboard, invite, crew, stats, leaderboard, awards, fun, admin
api/index.js                     Vercel serverless function (бүх /api/*)
lib/handler.js                   API: бүртгэл, нэвтрэлт, Steam OpenID, урилга, чат, санал...
lib/db.js                        Supabase (PostgREST) эсвэл локал JSON файл
lib/sources.js                   Steam Web API · FACEIT Data API · Leetify
supabase/schema.sql              Өгөгдлийн сангийн хүснэгтүүд
server/server.js                 Локал хөгжүүлэлтийн server
```
Сайт `api/health` хариу авбал **LIVE** горимд (жинхэнэ бүртгэл, бүх найз нэг өгөгдөл), авахгүй бол **DEMO** горимд ажиллана.

---

## 🚀 Интернэтэд байршуулах (бүгд үнэгүй)

### 1. Supabase — өгөгдлийн сан
1. https://supabase.com → **New project** (нэр: `berx`, бүс: Singapore эсвэл Tokyo).
2. **SQL Editor → New query** → `supabase/schema.sql`-ийн агуулгыг бүхэлд нь paste → **Run**.
3. **Project Settings → API Keys**-ээс:
   - Project URL → `SUPABASE_URL`
   - **Secret** key (`sb_secret_...`) → `SUPABASE_SECRET_KEY` ⚠️ нууц (хуучин нэр `SUPABASE_SERVICE_ROLE_KEY` ч ажиллана)
4. Дараа нь `supabase/002_permissions.sql`-ийг мөн ажиллуул (Data API эрх). Сүүлийн query бүх мөрөнд `service_role=true`, `anon=false` гэж харуулна.
   - **Publishable** (anon) key → `SUPABASE_PUBLISHABLE_KEY`

### 2. API key-ууд
| Key | Хаанаас | Юунд |
|---|---|---|
| `STEAM_API_KEY` | https://steamcommunity.com/dev/apikey | nickname, avatar, «CS2 тоглож байна» |
| `FACEIT_API_KEY` | https://developers.faceit.com → App → API Keys → **Server side** | FACEIT ELO, level, K/D, WR, HS% |
| `LEETIFY_API_KEY` | Leetify developer API | Premier rating |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | нэвтрэлтийн cookie-г гарын үсэглэх |

Steam нэвтрэлт өөрөө key шаардахгүй — key-гүй ч нэвтэрнэ, зөвхөн статистик/avatar дутна.

### 3. Vercel — сайт + API
1. https://vercel.com → GitHub-аар нэвтэр → **Add New → Project** → `berx-cs2-crew` → **Import**.
2. Framework Preset: **Other**. Build Command, Output Directory хоосон.
3. **Environment Variables**: `ADMIN_LOGINS`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SESSION_SECRET`, `STEAM_API_KEY`, `FACEIT_API_KEY`, `LEETIFY_API_KEY`.
4. **Deploy** → `https://berx-cs2-crew.vercel.app` маягийн хаяг гарна.
5. (Заавал биш) `ALLOWED_STEAM_IDS=7656...,7656...` — зөвхөн эдгээр Steam данс нэвтэрнэ.

Шалгах: `https://<хаяг>/api/health` → `"db":"supabase"` ба `"realtime":{...}` гарвал бүх зүйл холбогдсон.

**Admin эрх:** `ADMIN_LOGINS`-д өөрийн нэвтрэх имэйл, утас эсвэл SteamID64-өө бич (таслалаар хэд хэдийг). Тэр бүртгэл нэвтрэх үед автоматаар Admin болно, бусад хэн ч admin болохгүй. Хувийн мэдээлэл код/GitHub-д орохгүй.

### 🔐 Нууцлал
- Бүх key зөвхөн Vercel-ийн Environment Variables-д. Код болон GitHub дээр **хэзээ ч** байхгүй (`.env` нь `.gitignore`-д).
- Supabase хүснэгтүүдэд RLS асаалттай, `anon`/`authenticated`-аас бүх эрх хураагдсан → browser (publishable key) өгөгдөлд хүрэхгүй. Зөвхөн server function `sb_secret` key-ээр (`apikey` header) хандана.
- Нууц үг `scrypt`-ээр hash-лагдана. Session нь HttpOnly, HMAC гарын үсэгтэй cookie.

---

## 🎮 SERVER (BERX ARENA) — өөрийн CS2 сервер
Сайтын **SERVER** цэс таны Windows компьютер дээрх CS2 Dedicated Server-тэй **BERX Agent**-ээр холбогдоно.
Бүх заавар: [`agent/README.md`](agent/README.md) (Supabase `003_server.sql`, Vercel `SERVER_AGENT_SECRET`, `install-cs2.ps1`, `start-agent.bat`).

## 💻 Локал дээр ажиллуулах
```
cp .env.example .env     # хүсвэл key-ээ бөглө (Supabase-гүй бол data/db.json-д хадгална)
node server/server.js    # → http://localhost:3000   (Node 18+, npm install хэрэггүй)
```

## ✏️ Засварлах
- Claude Code-д энэ repo-г холбоод юу өөрчлөхөө хэлэхэд → commit → Vercel автоматаар шинэчилнэ.
- Жижиг текстийг GitHub вэб дээрээс шууд засаж болно (файл → ✏️).

## Анхаарах
- Supabase-ийн үнэгүй төсөл 7 хоног ашиглагдахгүй бол түр зогсдог — dashboard-оос сэргээнэ, өгөгдөл устахгүй.
- Vercel Hobby нь зөвхөн хувийн, арилжааны бус хэрэглээнд.
- Leetify-ийн хариуны бүтцийг (`ranks.premier`) өөрийн key-ээр нэг шалгаарай. Өөр бол `lib/sources.js` → `leetifyPremier()`.
- Тоглолт тус бүрийн түүх, Leaderboard-ийн өдөр/7 хоногийн шүүлтүүр одоогоор FACEIT lifetime статистикаас л. Дараагийн шат: FACEIT match history API.
