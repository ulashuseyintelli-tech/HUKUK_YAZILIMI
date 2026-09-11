# CLIENT İ10 — H3 VEKÂLET KABUL PAKETİ (R01 — düzenek + yerel doğrulama; canlı koşum YOK)

**Durum: CANLI GO'YA HAZIR — canlı koşum YAPILMADI.** Bu belge owner onayı ya da kapsam kararı
değildir. Canlı koşum ayrı, yazılı bir owner GO'su (`OWNER-GO-CLIENT-I10-<YYYYMMDD>-R<nn>`) ister (§10).

- Kapsam ve öncüller R02'den satır kaynaklı çıkarıldı (§1–§2). **İ4 ve İ5 İ10'un öncülü değildir.**
  Gerçek öncüllerin hepsi (İ3, İ7, İ8, İ9) kapalı.
- Düzenek: üç yeni betik ve `cl-lib.js` GO-ref deseninde `I10` (§4). Canlıda İ10 betikleri **yalnız
  İ10 GO ref'iyle** açılır; tüketilmiş İ9 GO'su dahil başka işin ref'i reddedilir. **Ürün kodu
  değişmedi.**
- Yerel doğrulama oturuma özel disposable DB'de, R27 derlemesiyle yapıldı: **7/7 senaryo DOĞRULANDI**
  (§7). Normal akış **PASS 10 · FAIL 0 · ÖLÇÜLEMEYEN 0**. 210 tablonun tamamında yazma farkı, 9
  satırlık envanterle birebir.

Sayaç **9/17**, hizmet kabulü **0/8 tam**. Bu paket ikisini de değiştirmez.

---

## 1. İ10'un kapsamı — KAYNAKTAN

R02 §3.3 satır 206, birebir:

> | **İ10** | **H3 vekâlet kabulü**: **A-1** VIEWER 403 · **A-2** elevated olmayan USER 403 · **A-3**
> yetkili 201 · **A-4** legacy upload 403 · `K9` yenileme (POA'sız capability etkisiz) | KAN |
> Beş gözlem PASS; yetkisiz denemelerde dosya/DB yazımı **0** | H3 | 0,5 gün |

A-1…A-4 tanımları `client-remaining-decisions-r01/RELEASE20-HANDOVER-R01.md` §5.2'dedir (satır 189-192):

| # | Adım | Beklenen |
|---|---|---|
| A-1 | VIEWER ile `POST /poa` | 403; vekâlet OLUŞMAZ |
| A-2 | Elevated olmayan USER ile `PUT /poa/:id` | 403 |
| A-3 | Yetkili aktör ile `POST /poa` | 201; kayıt OLUŞUR |
| A-4 | Legacy `POST /poa/:id/upload` yetkisiz aktörle | 403; dosya YAZILMAZ |

"Beş gözlem" = A-1 · A-2 · A-3 · A-4 · K9. K9'un önceki kanıtı T3'tedir
(`CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/WAVE5-TERMINAL-INTEGRATION-EVIDENCE-R01.md:102`,
`K9_NO_POA_INERT`). İ10 bu kanıtı canlı R27'de, sentetik tenant'ta yeniler.

**D-8** (aynı belge, satır 151-153): yazma potansiyeli olan her adım, "401/403 bekleniyor" denen
çağrılar dahil, yalnız sentetik olduğu doğrulanmış tenant'ta yapılır. İ10 gerçek bir tenant'a **hiç
çağrı yapmaz** (GET dahil).

## 2. Öncüller — satır kaynaklı

| Kaynak | Hüküm | İ10 için |
|---|---|---|
| R02 §3.3 satır 199 | "Hepsi İ7 + İ3'e bağlıdır." | İ3 **KAPALI** · İ7 **KAPALI** (canlı RELEASE22/R27) |
| R02 §5 satır 285-287 | Kabuller (İ3 + İ7 hazır; §3.5 gereği SIRALI): İ8 → İ9 → **İ10** → İ11 … | İ8 **KAPALI** · İ9 **KAPALI** (#2631) |
| R02 §3.5 satır 222-223 | İ9–İ16 sıralı; her koşum kendi tenant'ını üretir | İ10 kendi tenant'ını üretir (`cl-acc-<runId>`) |
| R02 §5 satır 293-294 | "hiçbir iş kendisinden sonra gelen bir işe bağlı değildir … İ4 yalnız İ16'yı açar." | **İ4 İ10'un öncülü değildir** |
| R02 §3.3 satır 211 | İ15: "KABUL-5 … + İ5 kararının uygulanması" | İ5'e bağlı olan **İ15**'tir (ve İ5a). Satır 206'da İ5 hükmü yoktur |
| İ1b belgesi satır 27-32 | İ10 ölçütü aynen alıntılı; "İ4 … ve İ5 … verilmiş sayılmadı — bu paket ikisine de dayanmaz." | ölçüt İ4/İ5'e dayanmaz |
| I6-HANDOFF satır 184-186 | "… Öncül: H3." | R02 satır 206'da H3 **"Hizmet"** sütunudur, bir iş bağımlılığı tanımlamaz. H3 kodunun canlı derlemede olduğu §7'de aynı dist dosyalarıyla ölçüldü |

**Sonuç:** İ10'un açık öncülü kalmadı. Eksik olan yalnız owner'ın canlı GO'su ve kapsam kararıdır (§10).
İ4 ve İ5 listede önce göründükleri için engel sayılmadı. Onlara bağlanan açık hüküm yukarıdaki
satırlardadır ve İ10'u kapsamaz.

## 3. Ölçüt haritası — her gözlem gerçek uca, aktöre ve yazma etkisine bağlı

Kurulum (§5.1) üç aktör üretir. **viewer** = VIEWER. **user** = USER, PARTNER bağı yok. **elevated** =
USER + PARTNER `Lawyer` bağı. `user` ile `elevated` aynı roldedir; fark **yalnız** PARTNER bağıdır.
ADMIN yolu kapalıdır. Böylece A-2/A-4'teki 403, rol eşiğinden değil **canonical elevated** kararından
gelir.

| Sıra | Kalem | Uç | Aktör | Beklenen | Yazma ölçümü |
|---|---|---|---|---|---|
| 1 | P-0v/u/e | `POST /auth/login` | üçü | 201 + token | yok (`login()` salt okuma + JWT) |
| 2 | P-0x | — | — | roller VIEWER / USER / USER | ölçüm geçerliliği |
| 3 | **A-1** | `POST /poa` (müvekkil P) | viewer | **403 `CLIENT_MUTATION_DENIED_VIEWER`** | POA 0→0 · audit 0→0 |
| 4 | **A-3** | `POST /poa` (müvekkil P) | elevated | **201** | POA +1 (ACTIVE, müvekkil P) · audit +1 `CLIENT_WORKSPACE_COMMAND` |
| 5 | **A-2** | `PUT /poa/:id` `{notaryCity}` | user | **403 `CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND`** | POA satır fotoğrafı (`updatedAt` dahil) aynı · audit aynı |
| 6 | **A-4** | `POST /poa/:id/upload` (geçerli 45 baytlık PDF) | user | **403 `CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND`** | satır fotoğrafı aynı · audit aynı · **iki kökte** `<tenantId>` dizini önce/sonra YOK, dosya 0 (§6) |
| 7 | **K9** | `GET /clients/N/effective-capabilities` | elevated | 200; dört capability `allowed=false` · `NO_VALID_POA` | yok. Ön koşul: N'nin dört düz bayrağı true, POA 0 |
| 8 | P-K9 | `GET /clients/P/effective-capabilities` | elevated | 200; `canCollect` ALLOWED, dayanak A-3 POA'sı; diğer üçü kapalı | ölçüm geçerliliği: K9'un her şeyi kapatan bozuk bir değerlendirici olmadığını gösterir |

- **Sıra:** A-2 ve A-4 var olan bir hedef ister, bu yüzden A-3'ten sonra gelir. A-1, A-3'ten önce
  koşulur: A-3'ün yinelenen-kayıt bastırması (aynı noter + aynı gün) A-1'in izini örtemez.
- **Doğru kapı:** her ret gözlemi beklenen `reasonCode`'u doğrular. Yanlış kapıdan gelen 400/403
  başarı sayılmaz. Upload controller'ı yetkiden **önce** `validatePoaUploadFile` (mime + boyut)
  çalıştırır. Bu yüzden A-4 geçerli bir PDF ile yapılır.
- **Dur kuralı:** bir yetkisiz deneme (A-1/A-2/A-4) 403 dışında yanıt verirse, istek hatası üretirse
  ya da yazma izi bırakırsa **sonraki yetkisiz deneme gönderilmez**. Kalanlar `ÇAĞRILMADI — <neden>`
  ile ÖLÇÜLEMEDİ yazılır. Ölçüt sessizce düşmez ve sonuç BAŞARILI olamaz (§7 F1/F2).
- **Müvekkil N'nin düz bayrakları Prisma ile yazılır.** Ürünün create yolu POA'sız kayıtta ahzu
  kabzayı false'a çeker (K9.4). "Düz bayrak true olsa bile etkisiz" durumu API ile üretilemez. Canlıdaki
  legacy durum bunu içerir: `WAVE4-EVIDENCE-R01.md:118` K9.5 — 15 müvekkil, 15 düz `canCollect`,
  13'ü geçerli POA'sız.

## 4. Düzenek — dosyalar ve tam kimlikler

Kök: `project/docs/governance/`. Canlı koşum yalnız `i10-run.js` üzerinden yapılır.

| Dosya | sha256 | R01'de |
|---|---|---|
| `client-live-acceptance-i10-r01/scripts/i10-run.js` | `7849595E02B67B91AEB7D94478D73F7C8D91D638A56CD3694A836280AA4828BC` | **YENİ** |
| `client-live-acceptance-i10-r01/scripts/i10-01-setup.js` | `6FC3EC138298A149C737E9EF9F69A48CE368DD219B3C76745036E1148504B79B` | **YENİ** |
| `client-live-acceptance-i10-r01/scripts/i10-02-poa.js` | `C9D847C60931B7707623D049A05674AC78707F9E689A5A4614A8050AAB302D29` | **YENİ** |
| `client-live-acceptance-i1b-r01/scripts/cl-lib.js` | `C3948BB5A0CABCC426AEC1EF0123E5BF842349F1002B1E010FBD0B5556E16B46` | **DEĞİŞTİ** |
| `client-live-acceptance-i1b-r01/scripts/cl-09-close-access.js` | `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` | değişmedi |
| `client-live-acceptance-i9-r01/scripts/i9-03-isolation.js` | `0EA99FD0F37B6625A0DE92EA6B361E12C592A9EB84CD3EE85823F43F0F109B6A` | değişmedi (İ9'dan yeniden kullanılır) |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | `DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7` | değişmedi |
| `f04-live-acceptance-r01/scripts/f04-lib.js` | `1D35429566BC0A0469F44ED028FEF829AF204A90C9A5565C6882EF99C6305CA8` | değişmedi |

| Dosya | İçerik |
|---|---|
| `i10-01-setup.js` | Tek transaction'da **7 satır**; EXPECTED sayımı transaction içinde (yarıda kesilme ROLLBACK). G-0 (`assertEnvironment`), İ10 GO kapısı, G-1 slug, G-3 çakışma. Parola yalnız bellekte. Kurulumdan önce komşu tenant izolasyon tabanı alınır. |
| `i10-02-poa.js` | §3'teki ölçümler + dur kuralı + A-4 dosya ayağı. Dosya ayağı: `CL_POA_UPLOAD_ROOT` (';' ile ayrılmış kökler). Her kök **listelenir**. Kök yoksa en yakın var olan ata listelenir. Listelenemeyen kök ÖLÇÜLEMEDİ'dir. `existsSync` kullanılmaz, çünkü erişim hatasında da `false` döner ve "dosya yok" gibi görünür. |
| `i10-run.js` | Ön kontroller → kurulum → ölçüm → `finally` kapanış (`cl-09`) → kapatma sonrası login **401** → `cl-09` tekrarı `alreadyClosed` → izolasyon (`i9-03`, kopya değil; makbuz adı `CL-I9-ISOLATION`). Ön kontroller G-0'dan ve her yazmadan **önce** çalışır: kütüphane yolları zorunlu; canlıda GO ref'i yalnız `OWNER-GO-CLIENT-I10-…`; iki kök i10-02'nin **aynı** fonksiyonuyla listelenebilir olmalı. Login bütçesi 3 + 1 = 4 (sınır IP başına 60 sn'de 10; 429 kanıt sayılmaz). |
| `cl-lib.js` | GO-ref deseni `I(1B\|8\|9)` → `I(1B\|8\|9\|10)` (3 satır, yorum ve mesaj dahil). Kapı testi **8/8 beklenen**: I10/I9/I1B biçimi kabul; I11, I100 ve ref'siz ret; `live` + oturum DB'si ret; `disposable` + oturum DB'si kabul. İ9 kaydındaki `1FE92E44…` İ9'un koşulduğu sürümdür ve tarihsel olarak doğrudur. İ10 komutu yeni hash'i denetler. |

**İ10'a özgü GO kapısı:** `cl-lib` deseni paket ailesinin bütün ref'lerini kabul eder. Bu yüzden
`i10-run`, `i10-01` ve `i10-02` canlıda ayrıca **yalnız** `OWNER-GO-CLIENT-I10-YYYYMMDD-Rnn` kabul
eder. Denetim saf ortam denetimidir: DB/HTTP'ye dokunmaz ve G-0'dan önce çalışır. Birim testi
**11/11 beklenen**. Canlı modda, ulaşılamaz hedefle (port 1) koşucu testi §7'de (G).

### 4.1 Ölçülen ürün ikilisi — İ10 davranışını belirleyen RELEASE22 dist dosyaları

Prova API'si ve canlı API **aynı dosyaları** çalıştırır (aynı yol, aynı bayt):
`C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22\project\apps\api\dist\apps\api\src\`.

| Dosya | sha256 | Rolü |
|---|---|---|
| `modules/poa/poa.service.js` | `5E570480321F219968FB955AF8E8563FA2B385874F50156D8411BD4F1644FF8C` | create / update / upload + yazma sırası |
| `modules/poa/poa.controller.js` | `E5445631B8E108C60CB9FC838BB2F253FD244F81588B6463E00DA167AC2D2EB5` | uçlar, upload ön doğrulaması |
| `modules/client/client-workspace-command-authority.js` | `D8373C726264631A214056135EBBE36BAA12BA3C91ECCD5F8E589E3F0940A9F6` | eşik, ret `reasonCode`, audit |
| `modules/client/client-poa-capability.js` | `7843B71A5195BA702EAB67175F8AD61AE177D342FE082BC539057FB3CA50FD1D` | K9 değerlendiricisi |
| `modules/client/client-poa-capability.controller.js` | `9DCE22FEDAEFD41DE0AAA447D6F640CD46EC9FD04F721C9E393EC2D6A2BB4DAA` | `effective-capabilities` ucu |
| `common/storage/runtime-storage-paths.js` | `34903502B40782287C5EAD3445161511679351493CA601F53F90D4634F2A9615` | POA kovası kökü |

---

## 5. CANLI YAZMA ENVANTERİ — yalnız sentetik tenant `cl-acc-<runId>`

Kaynak okuması (RELEASE22 @ `13740670`) ile oturuma özel DB'deki ölçüm aynıdır. Her koşumda
**210 tablonun tamamında**, `tenantId` kolonu olmayanlar dahil, satır sayısı farkı alındı (§7).

### 5.1 INSERT — 9 satır

| Adım | Tablo | Adet | İçerik |
|---|---|---|---|
| Kurulum (tek transaction) | `Tenant` | 1 | `cl-acc-<runId>` · `CL I10 <runId>` · lifecycle ACTIVE |
| | `User` | 3 | `viewer-` / `user-` / `elevated-<runId>@cl-acceptance.invalid` (RFC 2606, teslim edilemez) |
| | `Lawyer` | 1 | `lawyerRank=PARTNER`, `userId`=elevated |
| | `Client` | 2 | **P**: aktif, düz `canCollect=true` · **N**: aktif, dört düz bayrak true, POA YOK |
| A-3 | `ClientPowerOfAttorney` | 1 | müvekkil P · `CL I10 Noter <runId>` · GENEL · `isLimited=false` · `validUntil` YOK · `dateIssued`=dün · ACTIVE · avukat bağı YOK · dosya YOK |
| A-3 | `AuditLog` | 1 | `CLIENT_WORKSPACE_COMMAND` · `commandType=POA_CREATE` · `status=created` |

### 5.2 UPDATE

| Tablo | Satır | Alan | Adım |
|---|---|---|---|
| `User` | 3 | `isActive=false` + `tokenVersion++` | kapanış (`cl-09`) |
| `Case` | 0 | ACTIVE→CLOSED | kapanış; tenant'ta Case yok |

`Tenant`, `Lawyer` ve iki `Client` kurulumdan sonra **güncellenmez**. Bu, satır sürümüyle (Postgres
`xmin`) ölçüldü: dört kurulum satırı kurulum transaction'ının sürümünde kaldı, yalnız üç `User`
satırı yeni sürüm aldı (§7). POA'nın satır fotoğrafı (`updatedAt` dahil) A-2 ve A-4 boyunca
değişmedi. Tenant kapanıştan sonra da ACTIVE'dir.

**Yazmayan adımlar:**
- Login (P-0v/u/e ve doğrulama login'i): `login()` salt okuma + JWT; hız sınırlayıcı bellek içi `Map`.
- A-1/A-2/A-4 retleri: `runAuthorizedClientWorkspaceCommand` reddi execute ve audit'ten **önce** gelir.
- K9 / P-K9 GET'leri: salt okuma.

**Yazılmayan tablolar:** `PoaLawyer` (avukat bağı yok) · `PoaExpiryNotificationDelivery` · `Office` ·
`Case` · `CaseClient` · `ClientContact` · `Task`. **Dosya yazımı 0. DELETE yoktur.** Önceki alanlarda
(`cl-acc-afce215b`, `cl-acc-2ed1d6d0`, `cl-acc-d19ce2c7`) kullanıcı erişimi yeniden açılmaz, bu
alanlara dokunulmaz.

### 5.3 Yetki kapısı bozuksa en kötü durum — dur kuralıyla sınırlı

| İlk başarılı yetkisiz deneme | Oluşacak yazma (hepsi sentetik tenant içinde) | Sonrası |
|---|---|---|
| A-1 | +1 POA (müvekkil P) + 1 audit. A-3 aynı noter/gün nedeniyle yeni kayıt açmaz (`duplicate_suppressed`) ve FAIL olur | A-2 ve A-4 gönderilmez |
| A-2 | A-3 POA'sında `notaryCity` değişir + 1 audit | A-4 gönderilmez |
| A-4 | Servis önce `bucketDir` ile `<kök>\<tenantId>\` dizinini açar, `<poaId>_<zaman>.pdf` dosyasını (45 bayt sentetik PDF) yazar, sonra POA'da `filePath/fileSize/mimeType` günceller + 1 audit | son yetkisiz deneme |

En fazla **bir** yetkisiz yazma olur. Sonuç FAIL'dir. Oluşan satır/dosya **kanıt olarak kalır,
otomatik silinmez** ve owner'a raporlanır.

### 5.4 Kapanıştan sonra kalan durum

`cl-acc-<runId>`: **kullanıcı erişimleri kapalı; tenant ACTIVE, POA ACTIVE, kanıt korunuyor.** Üç
kullanıcı pasiftir; dağıtılmış JWT'ler `tokenVersion` ile geçersizdir. Müvekkil P ve N aktiftir; POA
(`isLimited=false`) ve audit satırı silinmez.

### 5.5 Açık kalan POA'yı zamanlanmış işlerin SEÇEMEME koşulları (RELEASE22 kaynağı)

POA tablosuna yazan çağrı noktaları: `poa.service.js` (istek yolu), `automation.service.js:212`
(cron) ve `scripts/client-workspace-live-smoke-seed.js` (elle koşulan betik). `clientPowerOfAttorney`
geçen dosyalar arasında zamanlanmış iş yalnız `automation.service.js`'tedir. Derlenmiş dekoratör
desenine göre ölçüldü; aynı desen bu dosyada beklenen 8 cron'u buldu.

| Cron | Seçim | Sentetik POA için |
|---|---|---|
| `AutomationService.updateExpiredPoas` (her gün 02:00) | tenant ACTIVE + `isLimited=true` + ACTIVE + `validUntil < now` | `isLimited=false` → **seçilmez** |
| `AutomationService.sendExpiringPoaNotifications` (her gün 09:00) | `POA_EXPIRY_NOTIFICATION_ENABLED` `true` değilse **erken döner**. Seçim `isLimited=true` + ACTIVE + `validUntil ∈ [now, pencere]` | bayrak canlı `.env`'de **yok**, makine/kullanıcı ortamında **tanımsız**. Açılsa bile `isLimited=false` / `validUntil` yok → **seçilmez** |
| `AutomationService.updateRiskScores` | tenant ACTIVE + Case ACTIVE | Case yok |
| `GreetingService` · `OperationalEscalationService` | Office gerektirir | Office yok |

### 5.6 Gerçek alıcıya gönderim — YOK

- POA modülünde e-posta/bildirim/olay çağrısı yoktur. Audit servisi yalnız `AuditLog` satırı yazar,
  dış hedefi yoktur. K9 yolu yazma yapmaz.
- Bütün adresler `.invalid`. Tenant'ta Office yok (ofis SMTP'si yok). POA'nın avukat bağı yok
  (bildirim alıcısı olamaz).
- POA süre bildirimi hem kapalıdır hem de bu kaydı seçemez (§5.5).

---

## 6. A-4 dosya ayağı — canlı kök ÖLÇÜLDÜ

| Halka | Kanıt (salt okuma) |
|---|---|
| Canlı API süreci | PID 46332 · ebeveyn `C:\Ops\hukuk\pwsh\pwsh.exe -File C:\Ops\hukuk\bin\start-api.ps1` |
| Başlatıcı | `start-api.ps1` (sha256 `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51`): `WorkDir = …\HY_W4_RELEASE22\project\apps\api` → `$psi.WorkingDirectory`. Alt sürece ortam ezmesi yok |
| `.env` | `…\apps\api\.env` satır 38 `HUKUK_DATA_ROOT=C:\Ops\hukuk\data`. `ConfigModule.forRoot({isGlobal:true})` `.env`'yi çalışma dizininden yükler |
| Öncelik | `HUKUK_DATA_ROOT` makine ve kullanıcı ortamında **tanımsız** (dotenv var olanı ezmez → çakışma yok) |
| Formül | `runtime-storage-paths.js`: `NODE_ENV=development` ve `HUKUK_DATA_ROOT` varsa `<kök>\uploads\poa\<tenantId>`. Yoksa eski düzen `<cwd>\data\uploads\poa\<tenantId>` |
| Prova | yetkili upload dosyayı `<HUKUK_DATA_ROOT>/uploads/poa/<tenantId>/` altına yazdı. Eski düzen adayına yazmadı. Satırdaki `filePath` aynı dizini gösterdi (§7 P) |
| Canlıda listelenebilirlik | `C:\Ops\hukuk\data\uploads\poa` **listelendi, öğe 0**. Eski düzen adayı `…\apps\api\data\uploads\poa` yok; en yakın ata `…\apps\api\data` listelendi |

Koşucu **iki kökü de** ölçer. Biri listelenemezse koşum hiç yazmadan durur (§7 U).

---

## 7. DOĞRULAMA — oturuma özel disposable DB, R27 derlemesi (2026-09-11)

Paylaşılan `hukuk_fix1_test` ve eski tenant'lar **kullanılmadı**. Canlı DB'ye ve canlı servislere
dokunulmadı.

### 7.1 Ortam ve kapılar

| Öğe | Değer |
|---|---|
| DB | konteyner `hy-i10-894280b1-db` · `postgres:16-alpine` · `127.0.0.1:5442` · `hukuk_i10_894280b1_test` · 130 migration · **210 tablo** · başlangıçta **tenant 0** |
| API | `HY_W4_RELEASE22` dist `main.js` sha256 `28D84796…E73F5` **beklenenle eşit** · `:8101` · komut satırı dist ile eşleşti · son tur PID 28368 |
| Bağlantılar | API'nin uzak uçlarının hepsi `127.0.0.1:5442`. Oturum DB'si dışında bağlantı **0** (her senaryodan sonra ölçüldü) |
| Dış etki | canlı `.env` yüklense bile ezilemeyecek biçimde: `EMAIL_PROVIDER=mock` · SMTP `127.0.0.1:1` · `PHASE9_REDIS_ENABLED=false` · gönderim/outbox/davet/FD bayrakları `false` |
| Depolama | `HUKUK_DATA_ROOT=<oturum>\i10s\data` · API çalışma dizini `<oturum>\i10s\api`. Koşucuya iki kök verildi: çalışan kök + eski düzen adayı |
| Koşucu | §4'teki nihai betikler (8 dosyanın hash'i koşumdan önce ve sonra **aynı**) · `CL_ENVIRONMENT=disposable` · `CL_SESSION_DB=5442/hukuk_i10_894280b1_test` · R22 kütüphaneleri |

### 7.2 Senaryolar — son tur (nihai hash'ler) · **7/7 DOĞRULANDI**

| Senaryo | runId | Ne yapıldı | Sonuç |
|---|---|---|---|
| **U** — ön kontrol reddi | `c1f29406` | ikinci kök yerine **dosya** verildi (listelenemez) | koşucu exit 1 · "A-4 dosya ayağı ÖLÇÜLEMEZ — hiçbir yazma yapılmadı" · G-0'a bile gelinmedi · tenant yok · 210 tabloda fark **0** |
| **S** — kurulum atomikliği | `7f2c536c` | `I10_ABORT_AFTER=user` (iki kullanıcıdan sonra hata) | exit 1 · tenant yok, kullanıcı 0, durum dosyası yok · 210 tabloda fark **0** (ROLLBACK) |
| **G** — İ10 GO kapısı | `60b22bc6` | canlı mod + **tüketilmiş İ9 ref'i**; hedef port 1 (ulaşılamaz) | `i10-run`, `i10-01`, `i10-02` üçü de exit 1, G-0'dan önce. İ10 biçimli ref bu kapıdan geçti ve G-0 hedef kapısına takıldı (port 1 ≠ 5432) · fark **0** |
| **F1** — dur kuralı | `7fb056bc` | vekil ilk `POST /poa`'ya (A-1) **sahte 201** döndü | A-1 FAIL · A-2/A-4 `ÇAĞRILMADI` · vekil kaydı: `POST /poa` 2 (ilki enjekte, ikincisi iletildi 201) · **PUT 0 · upload 0** · sonuç FAIL |
| **F2** — dur kuralı | `d81ea8b4` | vekil ilk `POST /poa`'nın soketini kopardı | A-1 ÖLÇÜLEMEDİ (`fetch failed`) · A-2/A-4 `ÇAĞRILMADI` · **PUT 0 · upload 0** · sonuç FAIL |
| **N** — normal akış | `e2b783db` | vekilsiz, doğrudan API | **PASS 10 · FAIL 0 · ÖLÇÜLEMEYEN 0** · sonuç PASS |
| **P** — dosya ayağı pozitif kontrolü (**yalnız prova**) | `2c91f080` | yetkili aktör upload yaptı (canlı pakette **yok**) | 201 · koşucunun ölçüm fonksiyonu dizini ve **1 dosyayı gördü** · yazma çalışan kökte, eski düzen adayında değil · `filePath` = `<HUKUK_DATA_ROOT>/uploads/poa/<tenantId>/…` · kapanış exit 0 |

F1, F2 ve N'nin **üçünde de** bağımsız ölçümler aynıdır:
- 210 tabloda fark = `{AuditLog 1 · Client 2 · ClientPowerOfAttorney 1 · Lawyer 1 · Tenant 1 · User 3}`,
  yani §5.1 ile **birebir**; başka tablo yok.
- `xmin`: Tenant/Lawyer/Client×2 kurulumdan beri güncellenmedi; User×3 güncellendi.
- Tenant ACTIVE · POA ACTIVE, `isLimited=false`, dosya yok · tek audit `POA_CREATE/created`.
- İki kökte tenant dizini yok (sürücünün koşucudan bağımsız ölçümü).
- Üç kullanıcı pasif · kapatma sonrası login **401** · `cl-09` tekrarı `alreadyClosed=true`.
- İzolasyon özeti eşit · API'nin oturum DB'si dışında bağlantısı 0.

F1/F2'nin **FAIL** olması beklenen davranıştır: ölçüt düşmedi, sessiz PASS üretilmedi.

### 7.3 Normal akış (N · `e2b783db`) ayrıntısı

| Kalem | Ölçüm |
|---|---|
| A-1 | 403 · `CLIENT_MUTATION_DENIED_VIEWER` · POA 0→0 · audit 0→0 |
| A-3 | 201 · POA 0→1 · audit 0→1 · ACTIVE · müvekkil P |
| A-2 | 403 · `CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND` · satır değişmedi · audit 1→1 |
| A-4 | 403 · `CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND` · tenant dizini yok→yok · dosya 0→0 · iki kök ölçüldü · satır değişmedi · audit 1→1 |
| K9 | 200 · collect/waive/settle/release = `false / NO_VALID_POA` · düz bayraklar true×4 · N'de POA 0 |
| P-K9 | 200 · `canCollect` = `true / ALLOWED` · dayanak = A-3 POA'sı |
| İzolasyon | kurulum `1948896f7b3347c2` (9 komşu tenant · client 18 · user 27) = kapanış `1948896f7b3347c2` |

**API günlüğü (iki prova örneği, bütün turlar):** "Yeni vekalet oluşturuldu" 11 · "Vekalet dosyası
yüklendi" **2 (yalnız iki P koşumu)** · yinelenen-kayıt bastırması 0 · `[scheduler] manuel tetik` 0 ·
ERROR 0 · stderr boş.

**Oturum DB'sinin son durumu:** 11 sentetik tenant (hepsi ACTIVE) · aktif kullanıcı **0** · POA 11,
dosyalı 2 (iki P).

### 7.4 Önceki turlar

| Tur | Betik durumu | Sonuç | Sonrası |
|---|---|---|---|
| 1 | dosya ayağı `existsSync` ile tek kök | F1/F2/N **3/3** | `existsSync` erişim hatasında da `false` döndüğü için dosya ayağı boşa bakabilirdi → sıkılaştırıldı |
| 2 | çok köklü, listelemeli dosya ayağı + ön kontrol | U/S/F1/F2/N/P **6/6** | `cl-lib` deseni tüketilmiş İ9 ref'ini de kabul ettiği için İ10 GO kapısı eklendi |
| 3 | **nihai** (§4 hash'leri) | U/S/G/F1/F2/N/P **7/7** | — |

Prova API'si her turdan sonra **PID + port eşleşmesiyle** kapatıldı (PID 40952, sonra 28368). Canlı API
aynı dist yolunu çalıştırdığı için komut satırına güvenilmedi. Canlı `:8080` PID 46332 ve `:3002` PID
47004 **değişmedi**. Oturum DB konteyneri **durduruldu, silinmedi** (kanıt). Kanıt klasörleri:
`C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i10s\`
→ `runs\` · `runs2\` · `runs3\` (günlükler, vekil kayıtları, runId rezervasyonları, hash kayıtları,
`summary.json`).

### 7.5 Bu doğrulamanın kanıtlamadığı

- Vekil yanıtı **simüle eder**. Gerçek kapıların davranışı normal akışta ölçüldü.
- İzolasyon özeti **sayı** düzeyindedir. Komşu satırlardaki güncellemeler kapsam dışıdır.
- 02:00 / 09:00 cron'ları provada tetiklenmedi. Seçilemezlik kaynağa dayanır (§5.5).
- Canlıda bir yazmanın kökü, yalnız yazma olursa kesinleşir. Canlı kök başlatıcı + `.env` + formül
  zinciriyle ve provadaki pozitif kontrolle belirlendi. Koşucu yine de iki adayı birlikte ölçer (§6).

---

## 8. Canlı koşum öncesi kapılar — GO anında, ilk yazmadan ÖNCE

| # | Kapı | Ölçüt |
|---|---|---|
| 1 | Çalışma kopyası | temiz `origin/main` · 8 dosyanın sha256'sı §4 ile **8/8 eşit** |
| 2 | Ürün ikilisi | `:8080`'de **tek dinleyici süreç**, komut satırı `HY_W4_RELEASE22\…\main.js` · R22 HEAD `137406701248858221d12be94a941f8837a2a245` · BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ` · §4.1'deki 6 dist dosyası **6/6 eşit** |
| 3 | Depolama/bayrak | `.env`'de `HUKUK_DATA_ROOT=C:\Ops\hukuk\data` değişmedi · `POA_EXPIRY_NOTIFICATION_ENABLED` yok |
| 4 | GO ref | biçim `OWNER-GO-CLIENT-I10-…` · kullanılmamış: origin/main, açık PR dalları ve durum kayıtlarında **0** |
| 5 | Paralel iş | bu makinede kabul/governance betiği çalıştıran süreç 0 · paralel OFFICE kabulü yok |
| 6 | Sakin pencere | saat başı cron'larından ve 02:00 / 09:00'dan uzak |
| 7 | runId | yazmadan önce diske kaydedilir; `cl-acc-<runId>` mevcut olmamalı |
| 8 | Koşucunun kendi ön kontrolleri | İ10 GO ref deseni · kütüphane yolları · iki kökün listelenebilirliği · G-0 (`127.0.0.1:5432/hukuk_db` + ref) |

## 9. Kesin komut (canlı, owner GO'sundan SONRA)

PowerShell 5.1 uyumludur. Çalışma yolu doğrulanmış **uzun yoldur** (8.3 kısa ad kullanılmaz).
`CL_LOGIN_PASSWORD` **verilmez**, koşucu parolayı bellekte üretir. Bağlantı sırrı yazdırılmaz.

**9.1 GO anında hazırlık — temiz çalışma kopyası ve kimlik**

```powershell
git -C 'C:\Development\HUKUK_YAZILIMI\project' fetch origin main
git -C 'C:\Development\HUKUK_YAZILIMI\project' worktree add --detach 'C:\Development\HY_WT\CL_I10LIVE' origin/main
$G = 'C:\Development\HY_WT\CL_I10LIVE\project\docs\governance'
$want = @{
  'client-live-acceptance-i10-r01\scripts\i10-run.js'            = '7849595E02B67B91AEB7D94478D73F7C8D91D638A56CD3694A836280AA4828BC'
  'client-live-acceptance-i10-r01\scripts\i10-01-setup.js'       = '6FC3EC138298A149C737E9EF9F69A48CE368DD219B3C76745036E1148504B79B'
  'client-live-acceptance-i10-r01\scripts\i10-02-poa.js'         = 'C9D847C60931B7707623D049A05674AC78707F9E689A5A4614A8050AAB302D29'
  'client-live-acceptance-i1b-r01\scripts\cl-lib.js'             = 'C3948BB5A0CABCC426AEC1EF0123E5BF842349F1002B1E010FBD0B5556E16B46'
  'client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js' = '012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4'
  'client-live-acceptance-i9-r01\scripts\i9-03-isolation.js'     = '0EA99FD0F37B6625A0DE92EA6B361E12C592A9EB84CD3EE85823F43F0F109B6A'
  'client-acceptance-harness-r01\scripts\ah-lib.js'              = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
  'f04-live-acceptance-r01\scripts\f04-lib.js'                   = '1D35429566BC0A0469F44ED028FEF829AF204A90C9A5565C6882EF99C6305CA8'
}
$D = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22\project\apps\api\dist\apps\api\src'
$dist = @{
  'modules\poa\poa.service.js'                              = '5E570480321F219968FB955AF8E8563FA2B385874F50156D8411BD4F1644FF8C'
  'modules\poa\poa.controller.js'                           = 'E5445631B8E108C60CB9FC838BB2F253FD244F81588B6463E00DA167AC2D2EB5'
  'modules\client\client-workspace-command-authority.js'    = 'D8373C726264631A214056135EBBE36BAA12BA3C91ECCD5F8E589E3F0940A9F6'
  'modules\client\client-poa-capability.js'                 = '7843B71A5195BA702EAB67175F8AD61AE177D342FE082BC539057FB3CA50FD1D'
  'modules\client\client-poa-capability.controller.js'      = '9DCE22FEDAEFD41DE0AAA447D6F640CD46EC9FD04F721C9E393EC2D6A2BB4DAA'
  'common\storage\runtime-storage-paths.js'                 = '34903502B40782287C5EAD3445161511679351493CA601F53F90D4634F2A9615'
}
$bad = 0
foreach ($k in $want.Keys) { if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $G $k)).Hash -ne $want[$k]) { $bad++; Write-Output "UYUSMAZ  $k" } }
foreach ($k in $dist.Keys) { if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $D $k)).Hash -ne $dist[$k]) { $bad++; Write-Output "UYUSMAZ  dist\$k" } }
Write-Output "hash uyusmazligi: $bad"   # 0 degilse DUR
```

**9.2 Koşum**

```powershell
$S = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i10live'
New-Item -ItemType Directory -Force -Path $S | Out-Null
$env:CL_ENVIRONMENT     = 'live'
$env:CL_OWNER_GO_REF    = '<OWNER-GO-CLIENT-I10-YYYYMMDD-Rnn>'
$env:CL_DATABASE_URL    = ((Get-Content -LiteralPath 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22\project\apps\api\.env' | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=','').Trim('"')
$env:CL_API_BASE_URL    = 'http://127.0.0.1:8080/api'
$env:CL_PRISMA_ROOT     = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/node_modules/@prisma/client'
$env:CL_BCRYPT_PATH     = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/node_modules/bcrypt'
$env:CL_POA_UPLOAD_ROOT = 'C:\Ops\hukuk\data\uploads\poa;C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22\project\apps\api\data\uploads\poa'
Remove-Item Env:\CL_SESSION_DB -ErrorAction SilentlyContinue
$env:CL_RUN_ID          = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
Add-Content -LiteralPath "$S\RUNID-RESERVATION.txt" -Value "$(Get-Date -Format o) runId=$($env:CL_RUN_ID) go=$($env:CL_OWNER_GO_REF)"
$env:CL_STATE_FILE      = "$S\i10-state-$($env:CL_RUN_ID).json"
node 'C:\Development\HY_WT\CL_I10LIVE\project\docs\governance\client-live-acceptance-i10-r01\scripts\i10-run.js'
```

- **Kütüphane yolları** açıkça verilmelidir. Koşucu, verilmezse hiçbir yazma yapmadan durur. Bunlar
  ölçüm kütüphanesidir, ölçülen ürün ikilisi değildir.
- **DB hedefi:** G-0 `live` için yalnız `127.0.0.1:5432/hukuk_db`'yi kabul eder. `CL_SESSION_DB`
  canlıda yok sayılır.
- **Dosya kökleri:** ikisi de ön kontrolde listelenir. Biri listelenemezse koşum başlamaz.

---

## 10. Owner kararına sunulan kapsam

Bu belge GO değildir. Canlı koşum için owner'ın yazılı kararı şu kalemleri kapsamalıdır:

1. **GO ref:** `OWNER-GO-CLIENT-I10-<YYYYMMDD>-R<nn>`. Koşucu başka işin ref'ini kabul etmez.
2. **Yazma:** yalnız `cl-acc-<runId>` sentetik tenant'ında **9 INSERT** (§5.1) ve **3 kullanıcı
   erişim iptali** (§5.2). Dur kuralıyla sınırlı en kötü durum da (§5.3) bu kapsamdadır: en fazla bir
   yetkisiz yazma; oluşursa satır/dosya kanıt olarak kalır.
3. **Dosya:** beklenen dosya yazımı **0**. Yalnız A-4 kapısı bozuksa tek bir 45 baytlık sentetik PDF
   `C:\Ops\hukuk\data\uploads\poa\<tenantId>\` altına düşebilir (§5.3). Otomatik silme yok.
4. **Kalan durum:** kullanıcı erişimleri kapalı; tenant ACTIVE, POA ACTIVE, kanıt korunuyor (§5.4).
5. **Sınırlar:** gerçek alıcıya ileti yok · paralel OFFICE kabulü, restart, yayın, flag değişikliği
   yok · belirsiz sonuçta veya komşu tenant farkında otomatik tekrar/silme yok.

## 11. Hata / yarıda kesilme kurtarması ve erişim kapatma

| Durum | Davranış |
|---|---|
| Yanlış/tüketilmiş GO ref · kütüphane yolu yok · dosya kökü listelenemiyor | ön kontrol → **hiçbir yazma yapılmaz** (§7 G, U) |
| Çakışma / hedef uyuşmazlığı | G-0/G-1/G-3 → hiçbir yazma yapılmaz |
| Kurulum yarıda kesilirse | tek transaction + EXPECTED transaction içinde → ROLLBACK, yetim satır 0 (§7 S) |
| Yetkisiz deneme 403 dışı / istek hatası / yazma izi | sonraki yetkisiz deneme gönderilmez; kapanış **yine çalışır**; sonuç BAŞARISIZ (§7 F1/F2) |
| Ölçüm FAIL/ÖLÇÜLEMEDİ | `finally` kapatmayı yine de çağırır |
| İzolasyon farkı / ölçülemezlik | sonuç BAŞARISIZ; toplam farklar makbuzda; otomatik tekrar yok |
| Durum dosyası yazılamazsa | kurulum **exit 4** verir ve kurtarma komutunu basar |
| Kapanış doğrulanamazsa | BAŞARILI verilmez |
| **Süreç zorla sonlanırsa** | aşağıdaki komut, **yalnız runId** ile |

```powershell
# §9.2'deki CL_ENVIRONMENT / CL_OWNER_GO_REF / CL_DATABASE_URL / CL_PRISMA_ROOT tanımlıyken (kapatma da yazmadır):
$env:CL_RUN_ID = '<runId>'
node 'C:\Development\HY_WT\CL_I10LIVE\project\docs\governance\client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js'
# İzolasyonu elle yeniden ölçmek (salt-okuma; durum dosyası gerekir):
$env:CL_STATE_FILE = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i10live\i10-state-<runId>.json'
node 'C:\Development\HY_WT\CL_I10LIVE\project\docs\governance\client-live-acceptance-i9-r01\scripts\i9-03-isolation.js'
```

`cl-09` üç `User` satırına `isActive=false` **ve** `tokenVersion++` yazar. Login **401** olur,
dağıtılmış JWT'ler de geçersizleşir. Tekrarı güvenlidir: ikinci çağrı `alreadyClosed=true ·
usersDeactivated=0 · exit 0` verir (§7'de her harness koşumunda ölçüldü). Kapanış POA'ya, müvekkillere
ve tenant yaşam döngüsüne dokunmaz.

---

## 12. Kapanış ölçütü ve ŞU ANKİ DURUM

| Gözlem | Durum | Dayanak |
|---|---|---|
| A-1 VIEWER 403 · yazma 0 | **HAZIR — canlıda ölçülmedi** | §7 N |
| A-2 elevated olmayan USER 403 · yazma 0 | **HAZIR — canlıda ölçülmedi** | §7 N |
| A-3 yetkili 201 · kayıt oluşur | **HAZIR — canlıda ölçülmedi** | §7 N |
| A-4 legacy upload 403 · dosya/DB yazımı 0 | **HAZIR — canlıda ölçülmedi** | §7 N · §6 |
| K9 POA'sız capability etkisiz | **HAZIR — canlıda ölçülmedi** | §7 N |

İ10, canlı koşumda beş gözlem PASS olur ve kapanış doğrulanırsa kapanır. O zaman sayaç 9/17 → 10/17
olur. Şu an **9/17**; hizmet kabulü **0/8 tam**.

## 13. Kapsam DIŞI

Deploy · migration · servis restartı · canlı flag değişikliği · gerçek alıcıya gönderim ·
`Office`/`Case` yazma · silme · gerçek tenant'a herhangi bir çağrı (GET dahil) · önceki alanlarda
(`cl-acc-afce215b`, `cl-acc-2ed1d6d0`, `cl-acc-d19ce2c7`) kullanıcı erişiminin yeniden açılması ·
**ürün kodu değişikliği** · B-2 ürün yaması · **İ11…İ15** · İ16/İ17 · OFFICE AK-2/AK-1a · başlatıcı
dayanıklılık işi.

---

## Ek — İ9 kaydında ifade düzeltmesi (owner talimatı, 2026-09-11)

`client-live-acceptance-i9-r01/CLIENT-LIVE-ACCEPTANCE-I9-R01.md` üzerinde:
- §13.5: "`cl-acc-d19ce2c7` kapalıdır" → "`cl-acc-d19ce2c7`: kullanıcı erişimleri kapalı; tenant ACTIVE,
  Task açık, kanıt korunuyor."
- §12: "alanlarının yeniden açılması" → "alanlarında kullanıcı erişiminin yeniden açılması".

İ9 **yeniden koşulmadı**; tüketilmiş GO (`OWNER-GO-CLIENT-I9-20260911-R01`) yeniden kullanılmadı.
Ölçümler ve karar değişmedi. Ayrı düzeltme PR'ı açılmadı; düzeltme bu kayıtla birlikte geldi.
