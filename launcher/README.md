# BERX ARENA Launcher

Windows 11 дээрх CS2 dedicated server, WireGuard **BERX-ARENA** tunnel болон BERX Agent-ийг нэг товчоор удирдах програм.

```
START  →  WireGuard BERX-ARENA асаах → VPS 10.66.66.1 ping (handshake) → cs2.exe -dedicated → RCON бэлэн → BERX Agent
STOP   →  Agent аюулгүй зогсох (сайтад Offline) → CS2 "quit" (RCON) → зөвхөн BERX-ARENA tunnel унтраах
```

* **Нэг EXE**: `BERX ARENA Launcher.exe` (~400 KB). Windows 11-д суугаа .NET Framework 4.8 дээр ажиллана, нэмэлт runtime хэрэггүй.
* CS2 серверийг дахин **татахгүй**. Одоо байгаа сервер, WireGuard, Node.js, agent-ийг ашиглана.
* `server.cfg`, `agent\.env`-ийг **өөрчлөхгүй**. `.env`-ээс зөвхөн RCON host/port/нууц үгийг уншина.
* Таны **CS2 тоглоом** (Steam хавтас дахь `cs2.exe`) хэзээ ч хөндөгдөхгүй. Launcher зөвхөн тохиргоонд заасан замаас ажиллаж буй `cs2.exe`-г удирдана.
* Бусад VPN tunnel, програмыг хөндөхгүй.

## Суулгах
1. `BERX ARENA Launcher.exe`-г дурын хавтаст хуулна (жишээ `C:\BERX\`).
2. Анх нээхэд Windows SmartScreen "Unknown publisher" гэж анхааруулж магадгүй (код гарын үсэггүй). **More info → Run anyway**.
3. **Тохиргоо → Desktop shortcut үүсгэх**.
4. **Шинэ `berx-cs2-crew-main\agent\berx-agent.js`-ийг хуулж тавина.** STOP дарахад agent сайтад Offline мэдэгдээд аюулгүй зогсдог болсон. Хуучин agent-тэй ч ажиллана, гэхдээ тэр үед процессыг хаана, сайт ~25 секундын дараа Offline болно.

## Анхны тохиргоо (таны систем дээр бэлэн утгууд)
| Тохиргоо | Утга |
|---|---|
| CS2 server | `C:\cs2-server\steamcmd\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe` |
| Arguments | `-dedicated -console -usercon -port 27015 +game_type 0 +game_mode 1 +map de_mirage` |
| Agent хавтас | `C:\Users\<та>\Downloads\berx-cs2-crew-main\agent` |
| WireGuard tunnel | `BERX-ARENA` → VPS `10.66.66.1` |
| Connect хаяг | `202.179.6.146:27015` |
| RCON | `agent\.env`-ээс (`RCON_HOST=192.168.1.18`, `RCON_PORT`, `RCON_PASSWORD`) |

Тохиргоо: `%LOCALAPPDATA%\BERX ARENA Launcher\settings.json` (нууц үг хадгалахгүй).
Log: `%LOCALAPPDATA%\BERX ARENA Launcher\logs\` (`launcher.log`, `agent.log`). Нууц үг, secret, WireGuard түлхүүр log-д `••••` болж далдлагдана.

## Administrator эрх
Launcher энгийн эрхээр ажиллана. **Зөвхөн WireGuard tunnel асаах/унтраах** үед Windows UAC цонх гарч зөвшөөрөл асууна:
* асаах: `wireguard.exe /installtunnelservice "C:\Program Files\WireGuard\Data\Configurations\BERX-ARENA.conf.dpapi"`
* унтраах: `wireguard.exe /uninstalltunnelservice BERX-ARENA`

Энэ нь WireGuard програмын **Activate / Deactivate** товчтой яг адил. Tunnel-ийн тохиргоо, түлхүүр WireGuard-д хэвээр үлдэнэ.
UAC асуухыг хүсэхгүй бол **Тохиргоо → WireGuard tunnel-ийг launcher асааж/унтраана**-г унтраагаад tunnel-ээ WireGuard програмаар асаалттай байлгаж болно.

## Төлөв
| Карт | Эх сурвалж |
|---|---|
| WireGuard Active/Inactive | Windows service `WireGuardTunnel$BERX-ARENA` + VPS ping |
| CS2 Running/Stopped/Error | Тохиргооны замтай `cs2.exe` процесс (Error = санаандгүй унтарсан) |
| BERX Agent Running/Stopped/Error | `node berx-agent.js` процесс + agent log-ийн сүүлийн алдаа |
| RCON Connected | Жинхэнэ RCON холболт |
| Map, тоглогч | RCON `status_json` / `status` |
| Uptime, CPU, RAM | CS2 серверийн процесс |
| Latency | VPS `10.66.66.1` руу ping |

**SERVER ONLINE** = tunnel + CS2 + RCON + Agent бүгд ажиллаж байгаа. Мэдээлэл байхгүй үед "—" харагдана, хуурамч тоо гаргахгүй.

## Боломжууд
* START / STOP / RESTART (давхар асаахгүй; аль хэдийн ажиллаж буй хэсгийг алгасна)
* System tray: Start, Stop, Restart, вэбсайт, connect хаяг хуулах, гарах
* X дарахад tray-д үлдэнэ. Launcher-ээс гарахад сервер ажилласаар байна (Тохиргоонд өөрчилж болно)
* Windows асахад автоматаар нээх, нээгдэхэд серверийг автоматаар START хийх (сонголт)
* Live logs (Launcher / Agent шүүлтүүр, хуулах)
* Алдаа гарвал аль алхам, юуг шалгах вэ гэдгийг улаан мөрөнд тодорхой харуулна

## Алдаа → шийдэл
| Мессеж | Юу хийх |
|---|---|
| WireGuard tunnel асаасангүй … цуцалсан | UAC цонхонд **Yes** дарна |
| VPS 10.66.66.1 хариу өгөхгүй | VPS асаалттай эсэх, WireGuard програм дээр handshake байгаа эсэхийг шалгана |
| UDP 27015 порт эзлэгдсэн | Өөр CS2 сервер ажиллаж байна. Task Manager-ээс шалгана |
| CS2 сервер асаад унтарлаа | Серверийн консол цонхны алдааг харна (CS2 update бол `install-cs2.ps1`) |
| RCON нууц үг буруу | `agent\.env`-ийн `RCON_PASSWORD` ба `server.cfg`-ийн `rcon_password` ижил байх |
| RCON … хариу өгсөнгүй | Arguments-д `-usercon` байгаа эсэх, `RCON_HOST` (192.168.1.18) зөв эсэх |
| BERX Agent асаад унтарлаа | Алдааны мөрөнд agent log-ийн сүүлийн мөр байна (жишээ нь SERVER_AGENT_SECRET) |

## Build хийх (хөгжүүлэгчид)
```powershell
cd launcher
.\build.ps1            # тест + build → dist\BERX ARENA Launcher.exe
.\build.ps1 -Shortcut  # + Desktop shortcut
```
.NET SDK 8+ хэрэгтэй. GitHub Actions (`.github/workflows/launcher.yml`) Windows дээр бүх тестийг ажиллуулж EXE-г artifact болгон гаргана.

### Тестүүд
* **Unit (симуляц):** START дараалал, давхар асаахгүй, хэрэглэгчийн CS2 тоглоомыг хөндөхгүй, STOP дараалал (agent → quit → tunnel), хуучин agent, `start-agent.bat` давталт, хугацаа хэтэрсэн сервер, алдааны бүх нөхцөл (exe/.env/secret/Node алга, UAC цуцлах, VPS ping, порт эзлэгдсэн, сервер унтрах, RCON нууц үг/timeout, agent унтрах), log-д нууц гарахгүй, RCON протокол, status parser.
* **Windows end-to-end (жинхэнэ процесс, тусгаарласан temp хавтас):** хуурамч CS2 сервер (RCON) + хуурамч "тоглоом" cs2.exe + жинхэнэ `berx-agent.js` + хуурамч сайт → START, давхар START, ONLINE төлөв, STOP (graceful quit, сайтад Offline), RESTART. Тоглоом хөндөгдөөгүйг шалгана.
* **UI end-to-end:** EXE-г `--start --stop-after` горимоор ажиллуулж ONLINE болохыг шалгаад скриншот авна.

Production CS2 сервер, жинхэнэ WireGuard tunnel-ийг тест огт хөндөхгүй.
