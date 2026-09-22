# P1 (OFFICE A3) PENCERE B — CANLI UYGULAMA VE KABUL KAYDI

| alan | değer |
|---|---|
| Dayanak | Owner Pencere B GO'su (2026-09-22) ve devam talimatları. Yönerge: `../R26-P1-JOINT-TRANSITION-R01.md` §4 Pencere B |
| Uygulanan komut paketi | **R03**, `SHA256SUMS` `8417DF3AD563A1C1192A6438D1D73D670CFF7B24EAA65D393C93A7AF9BC2FE73` (41 dosya; kopyası `p1-window-b/R03-commands/`, 41/41 eşit) |
| İnceleme | Codex/P1 (görev `01a07087`): R01 **BLOCKED**, R02 **UYGUN DEĞİL** (süreç sahipliği), R03 **UYGUN** (41/41). Kararlar owner üzerinden iletildi |
| Roller | **OFFICE `a8d9121a`**: tek uygulama yürütücüsü (owner talimatıyla). **Owner**: yalnız yönetici gerektiren pwsh 7 satırları. **CLIENT `22a15dd1`**: bağımsız doğrulayıcı (B6/B7). **Codex/P1**: inceleyici |
| Sonuç | **P1 CANLIDA. A3 kabul ölçütleri kanıtlı PASS → A3 KAPANDI** (dar kapsam: launcher DB yeniden deneme düzeltmesinin kurulu çift olarak canlıya alınması + mühür + kimlik + sağlık + tek örnek + geri dönüş hazırlığı) |
| Kapsam dışı | Canlıda DB arızası **üretilmedi**; kodsuz `exit 23` yeniden deneme yolu canlıda tetiklenmedi. Bu yol #2681 ile izole testlerde kanıtlıdır. Hizmet kabulü 0/8 ve OFFICE genel finali bu kayıtla **değişmez** |

## 1. Pencere koordinasyonu

Pencere B teyitleri (Pencere A'dan ayrı, yeni) şu oturumlardan alındı:
- CLIENT, AUTH-01, Disk Temizliği, OFFICE 33-F04, OFFICE 33;
- Codex/P1: owner üzerinden, 14:06 Türkiye saati.

Pencere boyunca teyit geri çekilmedi. Çakışan işlem bildirilmedi.

Pencere sırasında başka bir oturumdan PR #2748 açıldı (AGENTS.md/process-rules). Merge edilmedi; bu kayıt ona dokunmaz.

**Yürütme ortamı** (`evidence/ROLE-AND-EXECUTION-NOTE.txt`):
- Ajan araç süreçleri yükseltilmemiş (Orta bütünlük `S-1-16-8192`) ve adımlar arasında oturum sürekliliği yok.
- Bu yüzden P0 + B2–B5 + B8 owner'ın açık **yönetici pwsh 7** penceresinde çalıştı. Yükleyici her blok dosyasını R03 `SHA256SUMS`'a karşı doğruladı ve **bayt-özdeş** içeriği `. { }` ile çalıştırdı.
- Çıktı `Start-Transcript` ile kanıt dizinine yazıldı; OFFICE doğrudan okudu.
- UAC atlatma yapılmadı.

## 2. Adımlar

| adım | yürüten / yetki | sonuç | kanıt (sha256) | CLIENT (sha256) |
|---|---|---|---|---|
| B0 kapı S1 | owner, normal WinPS | **PASS 16/16**. S1 = R26 uygulaması, üçlü `P1-ONCESI` | `gate-S1-B0.json` `C20B7568A5AE3681B802A49DBB4C2A4B634FD209DDA38CA95A0418E54EE3905D` | — |
| B1 pin + Preflight + mühür girdisi | **OFFICE**, normal pwsh 7 | **PASS**. 6 pin eşit; `P1_READ_ONLY_PREFLIGHT_PASS`; closure 994/994, 286559809 bayt; ACL korumalı, yasaklı ACE 0 | `seal-inputs-B1.json` `3968E292F6FB818EC2DC9D5B015FE9538EBC57976FD1A06CD2232656E933D53B` | — |
| P0 + B2 yedek | owner, yönetici pwsh 7 | **PASS**. Yedek `D:\Development\HUKUK_YAZILIMI\P1-A3-APPLY-20260922T123919272Z`: `start-api.ps1` `CC634BBF`, host `691BC146`, SDDL eşit, görev XML'leri, manifest | transcript | — |
| B3 durdur + sessizlik + kopyala | aynı pencere | **PASS**. Sessizlik 0/0/0. Kurulu `DDCCD091`/`27099BDF`. Web/readiness/manifest değişmedi; ACL eşit; görevler Disabled | transcript | — |
| **B4 üretim yolu mühür** | aynı pencere | **`api --verify-seal`=0, `web --verify-seal`=0**. Servisler başlamadan önce | transcript | — |
| B5 başlat | aynı pencere | **PASS**. API **35 s**, 401, kimlik EXACT `L50204\|N50204\|P56996\|H67176`. Ancak bundan sonra WEB: **6 s**, 200, EXACT `L52732\|N52732\|P52836\|H65220`. `Preflight -Installed` PASS | transcript | — |
| B6 kapı S2 | **OFFICE**, normal | **PASS 16/16**. Üçlü `P1-SONRASI` (`DDCCD091`/`27099BDF`/`F39F7A54`); R26 uygulaması korunmuş (API `A8B17A38`, WEB `C17E7B13`/`5waeMoFG`, cfg `C43DEB5A`); tek dinleyici 8080=50204, 3002=52732 | `gate-S2-B6.json` `66ACF0E91C92D7C1D103B266C246CCBFFF4FE1DCD0E497776D01F76508B4D4C1` | PASS, kapı betiği kullanılmadı: `B6-S2.json` `805BAE4C99565B97BE93D45F539B001F29C4F649F4F857A4B781D71AF8C339DC` |
| B7 R26 geri dönüş **yalnız -SelfTest** | **OFFICE**, normal | **PASS**. R25B yedeği eşit; `baslatici uclusu=P1-SONRASI \| tanimli=True`. Gerçek geri dönüş **yok** | `B7-rollback-selftest-output.txt` `7C6D09B998E94E3C50C3B708F76B7A0224C068304EB65527BD9922717A41EC17` | PASS; yedekler kendi tarifiyle yeniden ölçüldü: `B7-backup.json` `231F22F9E51ABE840B51363614578BB4551C97305A4A67BD986BD7512F43C029` |
| B8 sağlık + tek örnek | owner, aynı yönetici pencere | **PASS**. Canlı ağaç = B5 imzası; 401/200; ikinci zamanlanmış başlatmada imza değişmedi, yeni ağaç yok | transcript | — |
| B8 log incelemesi | **OFFICE**, salt okuma | **PASS** (ayrıntı §3) | `B8-log-review.txt` `E5877D34B54DA3CF3CEC5FDC7D08AA8F12B9CACC8689D94F9E9EB4FAAF36B5FD` | — |

**Transcript** (P0–B8, owner yönetici oturumu; `Stop-Transcript` 16:29:10 yerel): `evidence/elevated-transcript.txt` `E290923C752658B7AACD5DD53FB17B11FA2FE1D0F2A94DC6F96755FF307D7162`. Sır taraması 0.

Başarısızlık dalına (R1) gerek olmadı.

## 3. B8 log incelemesi (`C:\Ops\hukuk\logs`, 15:49 yerel sonrası)

- **API:**
  - Host tarafında 1 `begin`, launcher pini `DDCCD091` ok, pwsh ACL + closure 994/994 ok, child job'a atomik bağlı.
  - Launcher (R02) tarafında DB probu **1/24'te** `exit=0` (yeniden deneme yok). **Tek child** `pid=50204` (R23 entry), `STARTED port=8080`.
- **WEB:** Host 1 `begin`, pin `F39F7A54` ok, closure ok. **Tek child** `pid=52732`, `STARTED port=3002`.
- **Hata:** Hata, pin/closure/bind, retry ya da çakışma satırı **0**.
- **B8 ikinci başlatma:** Yeni `launcher begin` ya da `host begin` **yok** (IgnoreNew).
- **Süreler:**
  - API host begin → STARTED ≈ **33 s**; kapı ölçümü **35 s**.
  - WEB ≈ **5 s**; kapı ölçümü **6 s**.
  - Kesinti: API ≈ 36 s, WEB ≈ 43 s.

  Bu süreler yeni bir SLA değildir.

## 4. Son durum = S2

| kalem | değer |
|---|---|
| `start-api.ps1` / host / `start-web.ps1` | `DDCCD09157E0AAF209AB38316A33815A0298FFACBC9006ED62F35F137F86219C` / `27099BDF66C83A44B3061D65AE2DAF24EADB523EE4F464179C2F53BB6C78DEAB` / `F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0` |
| Uygulama | R26: API `A8B17A38…53A0`, WEB `C17E7B13…5326`, BUILD_ID `5waeMoFGGMTLAYmn9oJvW`, cfg `C43DEB5A…5B5C` |
| Süreç kimliği | API `L50204\|N50204\|P56996\|H67176`, WEB `L52732\|N52732\|P52836\|H65220` |
| Geri dönüş | **P1:** R03 `R1-geri-yukle.ps1` + yedek `P1-A3-APPLY-20260922T123919272Z` (→ S1). **R26:** R02 `r26-rollback.ps1` `43C1202F…` + R25B yedekleri (→ S3); SelfTest P1-SONRASI altında PASS. İkisi birden gerekirse önce P1, sonra R26 (yönerge §3) |

## 5. A3 kapanış ölçütleri → kanıt

| ölçüt (yönerge §6 / runbook §3) | kanıt |
|---|---|
| P1 Preflight taze PASS | B1 |
| Kurulu çift üretim yolunda; api ve web `--verify-seal` = 0, servisler başlamadan önce | B3 + B4 (transcript) |
| İki servis kimliği (host→launcher→node) + sağlık | B5 (EXACT + 401/200) |
| Tek örnek | B8 (imza sabit; log'da ikinci başlatma izi yok) |
| Canlı üçlü `P1-SONRASI` | B6 + CLIENT |
| R26 uygulama kimliği korunmuş | B6 + CLIENT |
| Geri dönüş hazırlığı | B2 yedeği (P1) + B7 + CLIENT (R26) |

**A3 KAPANDI** (dar kapsam). Canlı DB arızası üretilmedi. Hizmet kabulü 0/8 ve OFFICE genel finali açık. AUTH-01 kapanışı (#2747) değişmedi.

## 6. Korunanlar

- `D:\Development\HUKUK_YAZILIMI\P1-A3-APPLY-20260922T123919272Z` (P1 geri yükleme yedeği)
- `HY_R26_RELEASE_EVIDENCE` (R25B yedekleri) ve `HY_R24_RELEASE_EVIDENCE`
- Canlı `…\apps\web\.next.pre-r26-20260922-073147Z`
- `HY_P1_WINDOW_B_EVIDENCE` (kaynak kanıtlar)
- `HY_P1_WINDOW_B_COMMANDS\R02` ve `R03`
- `HY_P1_A3_codex\P1-delivery`

Bu kayıt merge sonrası değiştirilmez.
