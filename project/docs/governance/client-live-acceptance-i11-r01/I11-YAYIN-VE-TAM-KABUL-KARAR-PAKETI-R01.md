# CLIENT İ11 — YAYIN + YÖNTEM T + TAM KABUL: TEK KARAR PAKETİ (R01)

```text
BELGE     : I11-YAYIN-VE-TAM-KABUL-KARAR-PAKETI-R01
YETKİ     : owner GO 2026-09-12 "İ11 YÖNTEM T / YAYIN VE KABUL HAZIRLIĞI" (hazırlık)
DURUM     : HAZIRLIK — CANLI DEĞİŞİKLİK YOK · yayın/restart yetkisi YOK · V1 BAŞLATILMADI
CANLI     : RELEASE22 `137406701248858221d12be94a941f8837a2a245` · web BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ`
ADAY      : DONDURULMAMIŞ — ölçüm anı `e65ff5dec16ec034e3f572c861fbbd7b4c3df7bb` (§A.1)
YAPILMAYAN: derleme · cutover · deploy · restart · .env değişikliği · migration · canlı DB yazma
```

**Ön koşul kararı (owner GO madde 1):** B-I11-3'ün canlıya geçmesi artık **İ11'in ön koşuludur**.
İ11 canlı kabulü, onarım canlı ikilide görünmeden başlatılmaz.

Sıra: **A. Yayın → B. İ11'i yeni kimliklere bağla → C. Geçici SMTP hedefi → D. Tam İ11 kabulü →
E. Bağlantı/kullanıcı kapanışı → F. Özgün SMTP'ye dönüş ve doğrulama.** Her adım ayrı owner
kararıdır; bu belge hiçbirini yürütmez.

---

## A. YAYIN — B-I11-3'ün canlıya geçmesi

### A.1 Aday kimliği — **DONDURULMAMIŞ**

| Konu | Değer | Kanıt |
|---|---|---|
| Ölçüm anındaki main | `e65ff5dec16ec034e3f572c861fbbd7b4c3df7bb` (#2645 squash) | ÖLÇÜLDÜ 2026-09-12 |
| Canlı kaynak | `137406701248858221d12be94a941f8837a2a245` — main'in **atası** | ÖLÇÜLDÜ |
| Araya giren commit | **32** | ÖLÇÜLDÜ |

**UYARI — aday hareketli hedeftir.** Bu paketin hazırlığı sırasında main **iki kez** ilerledi
(#2641 → #2643 → #2645); ilk ölçümde yalnız iki ürün PR'ı görünüyordu, sonuncusunda **üç**.
Aday SHA'sı **owner kararıyla dondurulmalı** ve ürün farkı **dondurma anında yeniden ölçülmelidir**:

```bash
LIVE=137406701248858221d12be94a941f8837a2a245
git fetch origin main && git rev-parse origin/main
git diff --name-only $LIVE..origin/main -- project/apps \
  | grep -vE "\.spec\.ts$|__tests__/|\.test\.ts$|ci-manifests/" | sort
git diff --name-only $LIVE..origin/main -- project/apps/api/prisma project/pnpm-lock.yaml
```

### A.2 Ürün farkları — **yalnız #2643 DEĞİL** (ölçüm anı `e65ff5de`)

**Üç ürün PR'ı / 7 kaynak dosyası / +399 −97 satır:**

| PR | Kapsam | Dosyalar |
|---|---|---|
| **#2643** `d199c8dc` | **B-I11-3** — public intake ham token'ı hata kaydına yazılmaz; rota şekli korunur | `error-log.sanitize.ts` (+40 −2) |
| **#2641** `b9fd97a1` | **OFFICE create sırası** — satır içi avukat create'i müvekkil yazmasından ÖNCE; ofis oto-oluşturma avukat+audit ile aynı transaction'a alındı | `case.service.ts` · `lawyer.service.ts` |
| **#2645** `e65ff5de` | **OFFICE dar atomiklik** — satır içi taraf yazmaları dosya `$transaction`'ına katılır (yeni ortak yardımcı) | `party-write-tx.ts` (**YENİ**, +107) · `case.service.ts` · `client.service.ts` · `debtor.service.ts` · `lawyer.service.ts` · `office-write-role.policy.ts` |

**Sonuç:** aday, B-I11-3 onarımının yanında **OFFICE/CLIENT create yolunun davranışını da**
değiştirir (dosya oluşturma sırası, transaction sınırı, taraf yazmaları). Yayın kabulü bu nedenle
**yalnız B-I11-3'ü değil, #2641 ve #2645'in kabul ölçütlerini de** kapsamalıdır; bu iki kalem
OFFICE hattının kayıtlarındadır. **"Sadece log maskeleme çıkıyor" demek ölçümle çelişir.**

### A.3 Geri dönüşü kolaylaştıran ölçümler

| Konu | Ölçüm | Sonuç |
|---|---|---|
| Prisma migration farkı | **0 dosya** | DB geri alma **GEREKMEZ** |
| `schema.prisma` | **değişmedi** | şema uyumu korunur |
| `package.json` / `pnpm-lock.yaml` | **değişmedi** | `node_modules` katmanı aynı |
| `apps/web` | **değişmedi** | web davranışı aynı (yeniden derlemede **BUILD_ID değişebilir** — §B.2) |

→ Geri dönüş **saf kök değişimidir**: canlı hattı RELEASE22 köküne geri almak yeterlidir.

### A.4 Geri dönüş paketi — kesin kimlikler (ÖLÇÜLDÜ)

| Konu | Değer |
|---|---|
| Geri dönüş kökü | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22` |
| Kök HEAD | `137406701248858221d12be94a941f8837a2a245` |
| web BUILD_ID | `xJZ1G1TsbOnHoWUzMD8CQ` |
| api `dist/.../main.js` | `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` |
| Canlı başlatıcı `start-api.ps1` | `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` |
| Canlı başlatıcı `start-web.ps1` | `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` |
| Süreç denetimi | **Zamanlanmış Görev** `HukukPlatform-API` / `HukukPlatform-Web` (ikisi de `Running`) — servis değil |
| Yerleşik geri dönüş | C33 motoru **R-01**: `bin` ön görüntüsü 3/3 + görevler Enable+Start (RELEASE22-R27 §5) |

### A.5 Yayının yürütücüsü

Aday derlemesi (yeni kök), **C33 KATMAN 1** aday paketi, ratifikasyon, mühür ve cutover
**OFFICE/C33 yayın hattının** işidir (mevcut yordam: `release22-candidate-r01/`). CLIENT oturumu
bu adımları yürütmez; girdi olarak §A.1–A.4'ü verir. **Bu talimat yayın veya restart yetkisi
değildir.**

---

## B. İ11 PAKETİNİ YENİ KİMLİKLERE BAĞLAMA (yayından SONRA, mekanik)

### B.1 Değişecek bağlar

| İ11 paketindeki bağ | Şu anki değer | Yayından sonra |
|---|---|---|
| §9 `K-BLD` release HEAD | `137406701248858221d12be94a941f8837a2a245` | **yeni canlı SHA** |
| §9 `K-BLD` BUILD_ID | `xJZ1G1TsbOnHoWUzMD8CQ` | **yeniden ölçülür** |
| §9 `$dist` — 12 ürün hash'i | §4.1 tablosu | **yeniden ölçülür** |
| §9 `$REL` kök yolu | `HY_W4_RELEASE22` | **yeni kök** |
| §9 blok sha256 | `7A10D817…F62D0` | **yeniden hesaplanır ve gömülür** |
| §7.6 B-I11-3 satırı | "main'de, canlıda değil" | **"canlıda"** + K-INTAKE'in gerekçesi güncellenir |

### B.2 Ölçülebilir beklenti (varsayım DEĞİL)

İ11'in 12 ürün dosyasının **hiçbirinin kaynağı** aday farkında yer almıyor (§A.2 listesiyle
karşılaştırıldı) → yeniden derlemede **12 hash'in de aynı kalması beklenir**. Değişirse bu bir
**derleme farkıdır** (kod farkı değil) ve kapanış kaydına **öyle yazılır**; "aynı çıktı" varsayılmaz,
ölçülür. `apps/web` değişmemesine rağmen **BUILD_ID'nin yeniden derlemede değişmesi olağandır** —
K-BLD bu yüzden yeni değerle güncellenir, eski değerle "değişmedi" denmez.

### B.3 Bağlama komutu (yayından sonra çalıştırılır)

```powershell
# Yeni canli kok ve SHA belirlendikten sonra 12 urun hash'ini YENIDEN olc:
$D = '<YENI_KOK>\project\apps\api\dist\apps\api\src'
$files = @(
  'modules\address-discovery\address-discovery.controller.js',
  'modules\address-discovery\client-info-request.service.js',
  'modules\client-intake-review\client-intake-review.controller.js',
  'modules\client-intake-review\client-intake-review-authorization.service.js',
  'modules\client-intake-promotion\client-intake-promotion.controller.js',
  'modules\client-intake-promotion\client-intake-promotion.service.js',
  'modules\client-intake-link\client-intake-link.service.js',
  'modules\client-intake-public\client-intake-public.service.js',
  'modules\client-intake-public\public-intake-rate-limit.guard.js',
  'modules\notification\email-provider.service.js',
  'modules\client\client-workspace-command-authority.js',
  'modules\client\client-mutation-policy.js')
foreach ($f in $files) { '{0}  {1}' -f (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $D $f)).Hash, $f }
# Ayrica: onarimin CANLIDA oldugunu DOGRULA (bos donerse yayin etkili DEGIL):
Select-String -LiteralPath (Join-Path $D 'modules\error-log\error-log.sanitize.js') -Pattern 'redactSecretPathSegments' -Quiet
```

**Kapı:** son satır `True` dönmeden İ11 canlı kabulü başlatılmaz (ön koşul, GO madde 1).

---

## C. YÖNTEM T — geçici SMTP hedefi

### C.1 Süreç genelindeki etki — kapsam beyanı

`SMTP_HOST`/`SMTP_PORT` **süreç genelinde** geçerlidir: pencere boyunca **API sürecinden çıkan her
e-posta** — hangi kullanıcı işlemi ya da zamanlanmış iş üretirse üretsin — yerel yakalayıcıya gider,
**dışarı çıkmaz**. Bu, A-0i yetki kapısı bozulsa bile dış gönderimin engellenmesini sağlayan
özelliktir (engel kapı üstünde değil, **taşıma altındadır**).

**Pencerede normal gönderim üreten kullanıcı işlemleri nasıl kontrol edilecek:**

| Yol | Tetikleyici | Kontrol |
|---|---|---|
| Kullanıcı daveti (`LOGIN_INVITE_PROVISIONING_ENABLED=true`) | kullanıcı | pencere kısa; öncesi/sonrası `UserInvite` sayımı |
| Parola sıfırlama | kullanıcı | öncesi/sonrası sayım + yakalayıcı kaydı |
| FD yayınlama (`CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED=true`) | kullanıcı | aynı |
| Masraf bildirimi | kullanıcı | aynı |
| Bilgi talebi (`client-info-request`) | kullanıcı | aynı |

**Yöntem:** pencere **öncesi** ve **sonrası** 16 iletim tablosunun sayımı alınır (`ro-mail-rate.js`
deseni); fark = pencerede üretilen gönderim. Fark, yakalayıcı kaydındaki iletilerle **birebir
eşleştirilir**. Ölçülen taban: son 30 günde **toplam 2 satır**, son 24 saatte **0** → beklenen fark 0.

**Zamanlanmış işler nasıl kontrol edilecek:**

| Bayrak | Canlı değer (ÖLÇÜLDÜ) | Sonuç |
|---|---|---|
| `CLIENT_STATEMENT_MONTHLY_DELIVERY` | **true** | **Posta üreten TEK açık zamanlanmış iş.** Cron: **her ayın 1'i 03:00 (Europe/Istanbul)** → pencere bu saatin dışında seçilir (**K-T5 kapısı**) |
| `POA_EXPIRY_NOTIFICATION_ENABLED` | tanımsız | kapalı |
| `CASE_TASK_ESCALATION_ENABLED` | tanımsız | kapalı |
| `OPERATIONAL_ESCALATION_ENABLED` | tanımsız | kapalı |
| `GREETING_ENABLED` | tanımsız | kapalı |
| `ICRABOT_OUTBOX_CRON_ENABLED` | true | `IcrabotEmailLog` **toplam 0** — gözlenen posta üretimi yok |

**Başka tenant'a ait ileti yakalanırsa:** **OTOMATİK YENİDEN GÖNDERİM YOK.** İleti yakalayıcı
kaydında kalır, owner'a bildirilir, ne yapılacağına **owner** karar verir. Geri dönüş yine de
uygulanır.

### C.2 Kapılar

| Kapı | Ölçüt |
|---|---|
| **K-T0** | `.env` ön görüntüsü yedeklenir; yedek sha256 = kaynak. **Geri dönüşün TEK girdisi** |
| **K-T1** | Yakalayıcı **yalnız `127.0.0.1`**'de dinliyor (`LocalAddress` kontrolü; `0.0.0.0` reddedilir) |
| **K-T2** | Yakalayıcı **AUTH İLAN ETMİYOR** — canlı EHLO yanıtı okunur, `AUTH` geçerse DURUR. (Ölçüldü: AUTH ilan edilmezse nodemailer `AUTH` komutunu **hiç göndermez**; parola süreç dışına çıkmaz) |
| **K-T3** | Yakalayıcının **loopback dışı bağlantısı 0** → dış iletim yok |
| **K-T4** | `:8080` tek dinleyici + komut satırı beklenen kök dist |
| **K-T5** | **Sakin pencere**: ayın 1'i 02:00–05:00 aralığı reddedilir (aylık ekstre cron'u) |
| **K-T7/K-T8** | `.env`'de `SMTP_HOST`/`SMTP_PORT` birer kez geçmeli; değişim sonrası fark **tam 4 satır** (2 eski + 2 yeni) — fazlası varsa DURUR |
| **K-T9** | Restart **bütçe içinde** tamamlandı (yeni PID) |
| **K-T10** | **Çalışan API gerçekten yeni hedefi kullanıyor**: süreç başlangıcı `.env` yazımından **sonra** + `:465` bağlantısı **0** |

> **K-T10 sınırı:** bu kapı "eski yapılandırmayla çalışmıyor" kanıtıdır; hedefin gerçekten
> yakalayıcı olduğunun **kesin** kanıtı ilk gönderimde yakalayıcıya ileti düşmesidir (A-5 ölçümü).
> İleti düşmezse A-5 zaten FAIL olur — sessiz geçiş yoktur.

### C.3 Süre bütçesi ve aşım davranışı

**Her restart için bütçe: 180 s.** Gerekçe: ölçülen emsal **39,467 s** (RELEASE22 cutover, API **+**
Web) — ama **geçmiş süre garantili üst sınır sayılmaz**: 2026-09-11'de reboot + logon beklemesi
başlatıcıyı **35,5 dakikaya** çıkarmıştı (RELEASE22 Ek C.1). Bütçe bu yüzden ~4,5× pay taşır.

| Aşım | Davranış |
|---|---|
| **T-9 (uygulama restart'ı) aşarsa** | Beklemeye devam **edilmez**; **derhal T-GERİDÖN** çalıştırılır. Otomatik tekrar YOK |
| **R-T2 (geri dönüş restart'ı) aşarsa** | `.env` **zaten ön görüntüdedir**; owner'a **derhal** bildirilir, görev durumu ve başlatıcı günlüğü **elle** incelenir. Otomatik tekrar YOK |

### C.4 Geri dönüş — koşum/state dosyasından BAĞIMSIZ

T-GERİDÖN bloğunun **tek girdisi** `.env` ön görüntü yedeğidir. Kabul koşumu hiç başlamamış, yarıda
kesilmiş veya başarısız olmuş olabilir; blok **her durumda tek başına** çalıştırılabilir ve
**idempotenttir** (env zaten ön görüntüyle aynıysa dosyaya dokunmaz). Yedek dosyası pencere kapanış
kaydına bağlandıktan **sonra** kaldırılır.

### C.5 Kesin komutlar

**T-UYGULA** — sha256 `7271829530BACB6E189AADF4629D47BB19B4C4EDDA996F5553C4674F18574903`
(PS 7 ve 5.1'de ayrıştırma hatası 0 · 7 kapı · 17 durdurucu):

```powershell
& {
  # T-UYGULA — YONTEM T: canli SMTP hedefini GECICI olarak yerel yakalayiciya cevirir.
  # Yayin (B-I11-3 canliya) TAMAMLANDIKTAN SONRA calistirilir. Kabul kosumunu BASLATMAZ.
  # Herhangi bir hata blogu durdurur; env DEGISMEDEN once tum kapilar gecilir.
  $ErrorActionPreference = 'Stop'
  $selfMark  = 'T-UYGULA-BLOK'

  $GoRef     = '<OWNER-GO-CLIENT-I11-YYYYMMDD-Rnn>'
  $SinkPort  = 2526
  $REL       = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22'   # YAYIN SONRASI: yeni canli kok
  $ENVF      = Join-Path $REL 'project\apps\api\.env'
  $BAK       = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11live\ENV-PREIMAGE.env'
  $BudgetSec = 180          # HER restart icin ust sinir; gecmis sure GARANTI DEGILDIR

  if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-I11-[0-9]{8}-R[0-9]{2}$') { throw "T-GO: ref bicimi gecersiz ('$GoRef')" }

  # ---- K-T0: on goruntu yedegi (geri donusun TEK girdisi) ----
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BAK) | Out-Null
  if (Test-Path -LiteralPath $BAK) { throw "K-T0: '$BAK' zaten var - onceki pencere kapanmamis olabilir; once geri donusu dogrula" }
  $preHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ENVF).Hash
  Copy-Item -LiteralPath $ENVF -Destination $BAK
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $BAK).Hash -ne $preHash) { throw 'K-T0: yedek hash degeri kaynakla esit DEGIL' }
  Write-Output "K-T0: env on goruntu sha256 = $preHash"
  Write-Output "K-T0: yedek = $BAK   (GERI DONUSUN TEK GIRDISI; kosum/state dosyasina BAGLI DEGIL)"

  # ---- K-T1: yakalayici YALNIZ loopback'te dinliyor ----
  $l = @(Get-NetTCPConnection -LocalPort $SinkPort -State Listen)
  if ($l.Count -ne 1) { throw "K-T1: :$SinkPort dinleyici sayisi $($l.Count) (1 olmali)" }
  if ($l[0].LocalAddress -ne '127.0.0.1') { throw "K-T1: yakalayici loopback DISINDA dinliyor ($($l[0].LocalAddress)) - disaridan erisilebilir" }
  $sinkPid = [int]$l[0].OwningProcess
  Write-Output "K-T1: yakalayici PID $sinkPid - yalniz 127.0.0.1:$SinkPort"

  # ---- K-T2: yakalayici AUTH ILAN ETMIYOR (canli SMTP parolasi HIC gonderilmesin) ----
  $cli = New-Object Net.Sockets.TcpClient
  $cli.Connect('127.0.0.1', $SinkPort)
  $st = $cli.GetStream(); $rd = New-Object IO.StreamReader($st); $wr = New-Object IO.StreamWriter($st)
  $wr.NewLine = "`r`n"; $wr.AutoFlush = $true
  $banner = $rd.ReadLine()
  $wr.WriteLine('EHLO kapi-olcumu')
  $lines = @()
  for ($i = 0; $i -lt 10; $i++) {
    $ln = $rd.ReadLine()
    if ($null -eq $ln) { break }
    $lines += $ln
    if ($ln -match '^\d{3} ') { break }
  }
  $wr.WriteLine('QUIT'); $cli.Close()
  Write-Output "K-T2: banner = $banner"
  foreach ($ln in $lines) { Write-Output "K-T2: ehlo> $ln" }
  if ($lines.Count -eq 0) { throw 'K-T2: EHLO yaniti alinamadi - KOR' }
  if (@($lines | Where-Object { $_ -match 'AUTH' }).Count -ne 0) { throw 'K-T2: yakalayici AUTH ILAN EDIYOR - canli SMTP parolasi gonderilir; AUTH ilan etmeyen surum kullanilmali' }
  Write-Output 'K-T2: AUTH ilan edilmiyor (parola HIC gonderilmez - olculdu)'

  # ---- K-T3: yakalayicinin DIS baglantisi YOK ----
  $sinkRemote = @(Get-NetTCPConnection -OwningProcess $sinkPid -ErrorAction SilentlyContinue |
    Where-Object { $_.State -ne 'Listen' -and $_.RemoteAddress -notin @('127.0.0.1', '::1', '0.0.0.0', '::') })
  if ($sinkRemote.Count -ne 0) { foreach ($c in $sinkRemote) { Write-Output "K-T3: $($c.RemoteAddress):$($c.RemotePort)" }; throw "K-T3: yakalayicinin loopback DISI baglantisi var ($($sinkRemote.Count)) - dis iletim riski" }
  Write-Output 'K-T3: yakalayicinin loopback disi baglantisi YOK'

  # ---- K-T4: canli API tek dinleyici + gorevler calisiyor ----
  $apiPids = @(Get-NetTCPConnection -LocalPort 8080 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($apiPids.Count -ne 1) { throw "K-T4: :8080 dinleyici surec sayisi $($apiPids.Count) (1 olmali)" }
  $oldPid = [int]$apiPids[0]
  $apiCl = (Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid").CommandLine
  if ($apiCl -notlike "*$([IO.Path]::GetFileName($REL))\project\apps\api\dist\apps\api\src\main.js*") { throw "K-T4: :8080 komut satiri '$REL' dist DEGIL" }
  $task = Get-ScheduledTask -TaskName 'HukukPlatform-API'
  Write-Output "K-T4: :8080 PID $oldPid - gorev durumu $($task.State)"

  # ---- K-T5: sakin pencere - posta ureten TEK acik zamanlanmis is ayin 1'i 03:00 (Europe/Istanbul) ----
  $now = Get-Date
  if ($now.Day -eq 1 -and $now.Hour -ge 2 -and $now.Hour -le 4) { throw 'K-T5: aylik ekstre gonderim penceresi (ayin 1i 02:00-05:00) - baska zaman secin' }
  Write-Output "K-T5: sakin pencere ($($now.ToString('yyyy-MM-dd HH:mm')) - aylik ekstre penceresi DISINDA)"

  # ---- PENCERE ONCESI ILETIM SAYIMLARI (pencerede uretileni ayirt etmek icin) ----
  $env:CL_DATABASE_URL = ((Get-Content -LiteralPath $ENVF | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=','').Trim('"')
  if (-not $env:CL_DATABASE_URL) { throw 'K-T6: DATABASE_URL okunamadi' }
  Write-Output 'K-T6: pencere oncesi iletim sayimlari ayri salt-okuma betigiyle alinmali (ro-mail-rate.js) - paket §B.4'

  # ---- DEGISIM: TAM IKI SATIR ----
  $lines2 = Get-Content -LiteralPath $ENVF
  $hostHit = @($lines2 | Where-Object { $_ -match '^\s*SMTP_HOST\s*=' }).Count
  $portHit = @($lines2 | Where-Object { $_ -match '^\s*SMTP_PORT\s*=' }).Count
  if ($hostHit -ne 1 -or $portHit -ne 1) { throw "K-T7: SMTP_HOST=$hostHit SMTP_PORT=$portHit (her biri 1 olmali)" }
  $new = $lines2 | ForEach-Object {
    if ($_ -match '^\s*SMTP_HOST\s*=') { 'SMTP_HOST=127.0.0.1' }
    elseif ($_ -match '^\s*SMTP_PORT\s*=') { "SMTP_PORT=$SinkPort" }
    else { $_ }
  }
  Set-Content -LiteralPath $ENVF -Value $new -Encoding UTF8
  $diff = @(Compare-Object (Get-Content -LiteralPath $BAK) (Get-Content -LiteralPath $ENVF) | Where-Object { $_.SideIndicator -ne '==' })
  if ($diff.Count -ne 4) { throw "K-T8: beklenen fark 4 satir (2 eski + 2 yeni), olculen $($diff.Count) - GERI DON" }
  Write-Output 'K-T8: env farki TAM IKI ANAHTAR (SMTP_HOST, SMTP_PORT)'

  # ---- RESTART (butce ile) ----
  $sw = [Diagnostics.Stopwatch]::StartNew()
  Stop-ScheduledTask -TaskName 'HukukPlatform-API'
  Start-Sleep -Seconds 2
  Get-Process -Id $oldPid -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName 'HukukPlatform-API'
  $newPid = 0
  while ($sw.Elapsed.TotalSeconds -lt $BudgetSec) {
    $p = @(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($p.Count -eq 1 -and [int]$p[0] -ne $oldPid) { $newPid = [int]$p[0]; break }
    Start-Sleep -Seconds 3
  }
  $sw.Stop()
  if ($newPid -eq 0) { throw "K-T9: API $BudgetSec sn icinde ayaga KALKMADI ($([int]$sw.Elapsed.TotalSeconds) sn) - DERHAL T-GERIDON blogunu calistir; otomatik tekrar YOK" }
  Write-Output "K-T9: API yeniden basladi - eski PID $oldPid -> yeni PID $newPid - kesinti $([int]$sw.Elapsed.TotalSeconds) sn (butce $BudgetSec)"

  # ---- K-T10: CALISAN API GERCEKTEN yeni hedefi kullaniyor ----
  $proc = Get-Process -Id $newPid
  $envWrite = (Get-Item -LiteralPath $ENVF).LastWriteTime
  if ($proc.StartTime -le $envWrite) { throw "K-T10: API baslangici ($($proc.StartTime)) env yazimindan ($envWrite) SONRA DEGIL - eski yapilandirma calisiyor olabilir" }
  $ext = @(Get-NetTCPConnection -OwningProcess $newPid -ErrorAction SilentlyContinue | Where-Object { $_.RemotePort -eq 465 })
  if ($ext.Count -ne 0) { throw "K-T10: API'nin :465 baglantisi var ($($ext.Count)) - dis relay hedefi surmus olabilir" }
  Write-Output "K-T10: API baslangici env yazimindan SONRA ($($proc.StartTime)) - :465 baglantisi 0"
  Write-Output ''
  Write-Output "HAZIR: gecici SMTP hedefi ETKIN (127.0.0.1:$SinkPort). Simdi paket §9 blogu, gonderim kapsami ACIK ile TEK KEZ."
  Write-Output "SONRA: sonuc ne olursa olsun T-GERIDON blogu. Yedek: $BAK (sha $preHash)"
}
```

**T-GERİDÖN** — sha256 `22BEC11DABA2CEA50067A5F20EF53EAF26C0EAD3495F4047D637C0ACA39ABA06`
(PS 7 ve 5.1'de ayrıştırma hatası 0 · 6 durdurucu · bağımsız çalışır):

```powershell
& {
  # T-GERIDON — YONTEM T geri donusu. KOSUM VE STATE DOSYASINDAN BAGIMSIZDIR:
  # tek girdisi env on goruntu yedegidir. Kabul kosumu hic baslamamis, yarida kesilmis
  # ya da basarisiz olmus olabilir; bu blok HER durumda tek basina calistirilabilir.
  # Sonuc ne olursa olsun calistirilir.
  $ErrorActionPreference = 'Stop'
  $selfMark  = 'T-GERIDON-BLOK'

  $REL       = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22'   # YAYIN SONRASI: yeni canli kok
  $ENVF      = Join-Path $REL 'project\apps\api\.env'
  $BAK       = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11live\ENV-PREIMAGE.env'
  $SinkPort  = 2526
  $BudgetSec = 180

  if (-not (Test-Path -LiteralPath $BAK)) { throw "R-T0: on goruntu yedegi YOK ($BAK) - elle mudahale gerekir, owner'a BILDIR" }
  $bakHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $BAK).Hash
  $curHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ENVF).Hash
  Write-Output "R-T0: yedek sha256 = $bakHash"
  Write-Output "R-T0: mevcut sha256 = $curHash"

  if ($curHash -eq $bakHash) {
    Write-Output 'R-T1: env ZATEN on goruntuyle AYNI - dosya geri yazilmayacak (idempotent)'
  } else {
    Copy-Item -LiteralPath $BAK -Destination $ENVF -Force
    $after = (Get-FileHash -Algorithm SHA256 -LiteralPath $ENVF).Hash
    if ($after -ne $bakHash) { throw "R-T1: geri yazma DOGRULANAMADI ($after != $bakHash) - owner'a BILDIR" }
    Write-Output 'R-T1: env on goruntuye geri yazildi - sha256 yedekle BIREBIR'
  }

  # ---- RESTART (butce ile) ----
  $apiPids = @(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  $oldPid = if ($apiPids.Count -eq 1) { [int]$apiPids[0] } else { 0 }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  Stop-ScheduledTask -TaskName 'HukukPlatform-API'
  Start-Sleep -Seconds 2
  if ($oldPid -ne 0) { Get-Process -Id $oldPid -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
  Start-ScheduledTask -TaskName 'HukukPlatform-API'
  $newPid = 0
  while ($sw.Elapsed.TotalSeconds -lt $BudgetSec) {
    $p = @(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($p.Count -eq 1 -and [int]$p[0] -ne $oldPid) { $newPid = [int]$p[0]; break }
    Start-Sleep -Seconds 3
  }
  $sw.Stop()
  if ($newPid -eq 0) {
    throw "R-T2: API $BudgetSec sn icinde ayaga KALKMADI ($([int]$sw.Elapsed.TotalSeconds) sn). env ZATEN ON GORUNTUDE. " +
          "OTOMATIK TEKRAR YOK - owner'a DERHAL bildir; gorev durumu ve baslatici gunlugu elle incelenmeli."
  }
  Write-Output "R-T2: API geri donusle basladi - PID $newPid - kesinti $([int]$sw.Elapsed.TotalSeconds) sn (butce $BudgetSec)"

  # ---- R-T3: ozgun hedef GERCEKTEN etkin ----
  $proc = Get-Process -Id $newPid
  $envWrite = (Get-Item -LiteralPath $ENVF).LastWriteTime
  if ($proc.StartTime -le $envWrite) { throw "R-T3: API baslangici ($($proc.StartTime)) env yazimindan SONRA DEGIL - restart ETKILI OLMAMIS olabilir" }
  $hostLine = @(Select-String -LiteralPath $ENVF -Pattern '^\s*SMTP_HOST\s*=')
  $portLine = @(Select-String -LiteralPath $ENVF -Pattern '^\s*SMTP_PORT\s*=')
  $hv = if ($hostLine.Count -eq 1) { (($hostLine[0].Line -replace '^\s*SMTP_HOST\s*=','').Trim()).Trim('"') } else { '(belirsiz)' }
  $pv = if ($portLine.Count -eq 1) { (($portLine[0].Line -replace '^\s*SMTP_PORT\s*=','').Trim()).Trim('"') } else { '(belirsiz)' }
  if ($hv -eq '127.0.0.1') { throw 'R-T3: SMTP_HOST hala loopback - geri donus TAMAMLANMADI' }
  Write-Output "R-T3: SMTP_HOST='$hv' SMTP_PORT='$pv' - ozgun hedef geri geldi; API baslangici env yazimindan SONRA"

  # ---- R-T4: yakalayiciyi durdur ----
  $l = @(Get-NetTCPConnection -LocalPort $SinkPort -State Listen -ErrorAction SilentlyContinue)
  foreach ($c in $l) { Get-Process -Id ([int]$c.OwningProcess) -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  $still = @(Get-NetTCPConnection -LocalPort $SinkPort -State Listen -ErrorAction SilentlyContinue)
  if ($still.Count -ne 0) { throw "R-T4: yakalayici hala dinliyor (:$SinkPort) - elle durdurulmali" }
  Write-Output "R-T4: yakalayici durduruldu - :$SinkPort bos"
  Write-Output ''
  Write-Output 'GERI DONUS TAMAM. Yakalayici kaydi YEREL kanit olarak saklanir (repoya girmez).'
  Write-Output 'Yakalanan iletiler arasinda SENTETIK tenant DISINDA alici varsa: OTOMATIK YENIDEN GONDERME YOK - owner''a bildir.'
  Write-Output "Yedek dosyasi ($BAK) pencere kapanis kaydina baglandiktan SONRA kaldirilir."
}
```

> Her iki blokta `$REL` **yayından sonra yeni canlı kökle** güncellenir (§B.1).

---

## D–F. Kabul, kapanış ve dönüş

| Adım | Ne | Kaynak |
|---|---|---|
| **D** | İ11 §9 bloğu, **gönderim kapsamı AÇIK** (`$SendGo` = GO ref, `$SmtpAck='EVET'`), **TEK KEZ** | İ11 paketi §9 |
| **E** | Kapanış: intake bağlantıları REVOKED (anonim 404) → kullanıcı erişimi + Case CLOSED → izolasyon | İ11 paketi §11 |
| **F** | **T-GERİDÖN** (sonuç ne olursa olsun) + doğrulama: `.env` sha256 = yedek · `SMTP_HOST` özgün · API başlangıcı env yazımından sonra · yakalayıcı durdu | §C.5 |

**Kanıt sınırı (değişmedi):** gerçek relay davranışı (kabul/ret/timeout) **İ12'nindir**; B-I11-1
nedeniyle bağlantının tıklanabilirliği **kanıtlanmaz** ve o kalem **açık H5 kusuru** olarak kalır.

**Başarıyla tamamlanırsa:** İ11'in üç gözlemi canlıda PASS → **İ11 kapanır**, sayaç **10/17 → 11/17**.

---

## G. AÇIK TEMİZLİK KALEMİ (ürün ve kabulü BEKLETMEZ)

**`C:\Development\HY_WT\CL_TOKENFIX` dizini duruyor** (373.693 girdi, pnpm `node_modules`).

- `git worktree remove --force` → yerli **"Filename too long"**; git kaydı düştü, dizin kaldı.
- Kayıtlı `robocopy /MIR /XJ` yordamı → araç kancası **"Remove-Item on system path '/XJ:' is blocked"**
  ile reddetti (yanlış-pozitif: komuttaki `Remove-Item` yalnız geçici boş kaynak dizini içindi).
- Kayıtlı adjudikasyon gereği **durduruldu**; aynı işlem başka yoldan yürütülmedi ve
  **kancayı aşacak alternatif silme yolu denenmeyecek**.

**Durum:** git worktree kaydı 0 · yerel/uzak dal 0 · açık PR 0 → yalnızca **disk artığı**. Hedefteki
4793 reparse noktasının **hiçbiri dizin dışına işaret etmiyor** (ölçüldü); kanonik `node_modules`
zaten yok. **Seçenekler:** (a) owner dizini kendisi siler, (b) kancayı tetiklemeyen bir silme yoluna
açık onay verir. **Bu kalem ürün onarımını ve kabul hazırlığını bekletmez.**
