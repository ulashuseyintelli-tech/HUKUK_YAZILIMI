# CLIENT İ9 — H1 KİMLİK KABUL PAKETİ (R02 içeriği — düzeltilmiş düzenek + canlı koşum kaydı)

**Durum: İ9 CANLI KABULÜ KAPANDI** — `OWNER-GO-CLIENT-I9-20260911-R01` · runId `d19ce2c7` ·
**PASS 14 · FAIL 0 · ÖLÇÜLEMEYEN 0** · kapanış (3 kullanıcı erişim iptali) ve izolasyon doğrulandı ·
yazmalar onaylı 11 satırlık envanterle birebir (§13).

- R01'deki engel (**B-1**: A-8 → 404) ürün düzeltmesiyle kapandı (#2609) ve R27/RELEASE22 ile
  **canlıda** (§7).
- Düzenek owner talimatıyla (2026-09-11) **dar** düzeltildi: **A-0 dur kuralı** · kapanışta
  **komşu tenant izolasyonunun yeniden ölçümü** · **oturuma özel disposable DB** kapısı (§4.2).
  **Ürün kodu değişmedi.**
- Düzeltme, oturuma özel DB'de R27 derlemesiyle doğrulandı: **4 hata enjeksiyonu senaryosu +
  normal akış 14/14 — 5/5 DOĞRULANDI** (§6).

Sayaç **9/17** (İ9 canlı kapanışıyla 8/17 → 9/17), hizmet kabulü **0/8 tam** — kendiliğinden değişmez.

---

## 1. İ9'un kapsamı — KAYNAKTAN

R02 §3.3 satır 205, birebir:

> | **İ9** | **H1 kimlik kabulü**: `MUTATION_AUTHORITY` yenileme (VIEWER update → Forbidden,
> **yazma 0**) + #2552 kabulü (create/değişen-değer/reaktivasyon üçünde de `reasonCode`) +
> **A-0** (anonim 401, kayıt yok) + **A-7** + **A-8** | KAN |
> **Beş gözlem de PASS; gerçek tenant'ta yalnız GET** | H1 | 0,5 gün |

A-0/A-7/A-8 tanımları `client-remaining-decisions-r01/RELEASE20-HANDOVER-R01.md` §5:

| # | Adım | Beklenen |
|---|---|---|
| A-0 | Anonim (token YOK): `POST /poa`, `POST /address-discovery/client-info-request`, manuel scheduler uçları | 401; kayıt OLUŞMAZ |
| A-7 | Pasif kaydı geçersiz kimlikle reaktive etme | 400 `CLIENT_IDENTITY_CHECKSUM_INVALID` |
| A-8 | Aynı değerle `isActive:true` tekrar gönderimi | **200**; lifecycle alanına YAZILMAZ |

**İ2 belgesinde H1 ölçütü YOKTUR** (30 ölçüt = H2 10 · H4 8 · H5 6 · H7 6; §9 eşlemesi
H2→İ13, H4→İ14, H5→İ11, H7→İ4/İ16). İ9'un ölçütleri bu iki kaynaktan gelir.

### 1.1 Canlı sürüm — RELEASE22 (R27)

Canlı sürüm artık **RELEASE22 @ `137406701248858221d12be94a941f8837a2a245`** (cutover
`CUT-20260911-195709-35289e18`, `C33_RELEASE22_CUTOVER_APPLIED_AND_VERIFIED`). Bağımsız ölçüm
(2026-09-11): API `:8080` PID 46332 ve Web `:3002` PID 47004, ikisi de `HY_W4_RELEASE22`
kökünden · `BUILD_ID xJZ1G1TsbOnHoWUzMD8CQ` (sunulan manifest 200, eski 404) · canlı
`client.service.js` `01CA99AEC166362363135F79509DC88D9E60BD5D5A6CDCDAAD76E599978D5143`.
Canlı kaynak ↔ `main` ürün farkı **0** (ölçüldü) — İ9'un dokunduğu yüzeyde **canlı davranış = main**.

---

## 2. Ölçüt haritası — her ölçüt gerçek uca, aktöre, gövdeye ve DB etkisine bağlı

**İKİ AYRI HATA SÖZLEŞMESİ vardır ve karıştırılmaz:**

| Kapı | Sınıf | Gövde alanı |
|---|---|---|
| Mutation reddi (`denyMutation`) | `ForbiddenException` 403 | **`code`** |
| Checksum reddi (`identityChecksumError`) | `BadRequestException` 400 | **`reasonCode`** + `offendingFields` |

Yanlış kapıdan gelen 400/403 **başarı sayılmaz**; her gözlem beklenen kapıyı ve alan adını
ayrı doğrular.

| Ölçüt | Uç | Aktör / yetki bağı | Beklenen | DB etkisi |
|---|---|---|---|---|
| **MUTATION_AUTHORITY** | `PUT /clients/:id` | VIEWER | 403 · `code=CLIENT_MUTATION_DENIED_VIEWER` | satır + audit değişmez |
| **#2552-a** create | `POST /clients` | elevated | 400 · `reasonCode=CLIENT_IDENTITY_CHECKSUM_INVALID` · `offendingFields:['tckn']` | yazma 0 |
| **#2552-b** değişen-değer | `PUT /clients/:id` | elevated | aynı 400 + `reasonCode` | satır değişmez |
| **#2552-c** PUT reaktivasyon | `PUT /clients/:id` `{isActive:true}` | elevated | aynı 400 + `reasonCode` | kayıt PASİF kalır |
| **#2552-d** POST/dedup reaktivasyon | `POST /clients` `{tckn: <eşleşen>}` | elevated | aynı 400 + `reasonCode` | yeni kayıt YOK, hedef PASİF kalır |
| **A-7** | = #2552-c/d (pasif + geçersiz kimlik) | elevated | 400 `CLIENT_IDENTITY_CHECKSUM_INVALID` | yazma 0 |
| **A-7 pozitif** | `PUT` `{isActive:true}` (pasif + **geçerli** kimlik) | elevated | 200 · `isActive false→true` | **gerçek yazma** (§5) |
| **A-8** | `PUT` `{isActive:true}` (kayıt **zaten aktif**) | elevated | **200**; lifecycle alanına yazılmaz | `isActive` ve `updatedAt` değişmez |
| **A-0** | `POST /poa` · `POST /address-discovery/client-info-request` · `POST /scheduler/run-all` | anonim | 401 | kayıt oluşmaz |

**Lifecycle yetkisi tek predikattır:** `assertCanManageLifecycle` ve
`assertCanReactivateViaCreate` ikisi de `officeApproval.isApproverEligible` çağırır — aktif +
aynı tenant + **staffMember YOK** + linkli `Lawyer` + (`PARTNER` ∨ `canApproveOfficeActions`).
**`UserRole.ADMIN` tek başına YETMEZ.** R01'deki kaynak satır numaraları RELEASE21'e aitti; B-1
`update()` dalını değiştirdiği için burada tekrarlanmadı — ölçütlerin **R27 derlemesindeki**
davranışı §6'da ölçülmüştür.

---

## 3. İ8'den devralınan kanıt — yeniden koşulmaz

**`MUTATION_AUTHORITY`** ölçütü İ8'in canlı koşumunda **U-1** olarak ölçüldü:
`PUT /clients/:id` `{phone}` · VIEWER → **403 · `CLIENT_MUTATION_DENIED_VIEWER`** · satır
değişmedi · audit `0→0` (kayıt: `CLIENT-LIVE-ACCEPTANCE-I8-R01` §13.2, alan
`cl-acc-2ed1d6d0`, GO `OWNER-GO-CLIENT-I8-20260910-R01`). Bu paket onu **tekrarlamaz**.

---

## 4. Düzenek — dosyalar ve tam kimlikler

Kök: `project/docs/governance/`

| Dosya | sha256 | R02'de |
|---|---|---|
| `client-live-acceptance-i9-r01/scripts/i9-run.js` | `304199AA3882DDA2433858891D19DE3BC88919FA4FED48A049638B05CC7E3F59` | **DEĞİŞTİ** |
| `client-live-acceptance-i9-r01/scripts/i9-01-setup.js` | `8CE916F2CAFCA98A2DC3DBD21C2B4411AC146A59207928E60DC4BC0E66815A5A` | değişmedi |
| `client-live-acceptance-i9-r01/scripts/i9-02-identity.js` | `EBB71EED51A073EDCBA8AB71F1DD93FCCCF792154E01C16CEE1E45ADCCD48041` | **DEĞİŞTİ** |
| `client-live-acceptance-i9-r01/scripts/i9-03-isolation.js` | `0EA99FD0F37B6625A0DE92EA6B361E12C592A9EB84CD3EE85823F43F0F109B6A` | **YENİ** |
| `client-live-acceptance-i1b-r01/scripts/cl-lib.js` | `1FE92E443196F1E64A287A1E37FB5BBF040F040957CDEA0CDB422167EC6D22E3` | **DEĞİŞTİ** |
| `client-live-acceptance-i1b-r01/scripts/cl-09-close-access.js` | `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` | değişmedi |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | `DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7` | değişmedi |
| `client-acceptance-runners-i3-r01/scripts/i3-lib.js` | `56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3` | değişmedi |
| `f04-live-acceptance-r01/scripts/f04-lib.js` | `1D35429566BC0A0469F44ED028FEF829AF204A90C9A5565C6882EF99C6305CA8` | değişmedi |

### 4.1 Kimlik değerleri ÖLÇÜLEREK seçildi

Ürünün kendi `isValidTckn` algoritması (`common/identity-validation.util.ts`) ile:

| Değer | Sonuç | Kullanım |
|---|---|---|
| `10000000146` | **GEÇERLİ** | pozitif kontrol (A-7 pozitif) |
| `10000000140` | **GEÇERSİZ** | A-7 / #2552-c / #2552-d hedefi |
| `10000000147` | **GEÇERSİZ** | #2552-a (dedup eşleşmesi OLMAYAN create) |

### 4.2 R02 değişiklikleri — hepsi düzenekte, ürün kodunda DEĞİL

| Dosya | Değişiklik |
|---|---|
| `i9-02-identity.js` | **A-0 dur kuralı.** Bir anonim uç 401 dışında yanıt verir, **istek hatası** üretir ya da kayıt sayımı değişirse **sonraki anonim istek GÖNDERİLMEZ**. Kalan uçlar `ÇAĞRILMADI — <neden>` gerekçesiyle **ÖLÇÜLEMEDİ** yazılır (ölçüt sessizce düşmez); FAIL/ÖLÇÜLEMEDİ olduğu için sonuç **BAŞARILI OLAMAZ**. `run-all` bilerek **sonda**: önce iki yan uç 401'i kanıtlamalıdır. Makbuza `anonCalls` ve `anonStop` eklendi. R01 §8'deki "koşum durdurulur" ifadesi kodda **yoktu** — artık uygulanıyor. |
| `i9-03-isolation.js` (yeni) | Kapanışta, kurulumdaki komşu tenant özeti (`ah-lib.isolationFingerprint`: komşu tenant başına **Client ve User sayısı** → sha256 özet) **kendi tenant hariç** yeniden ölçülür. Eşitse "sayı düzeyinde izolasyon korundu" (exit 0); **farklıysa izolasyon PASS VERİLMEZ** (exit 5, toplam farklar raporlanır); ölçülemezse exit 3. **Kapsam sınırı:** özet yalnız sayıları kapsar, komşu satırlardaki güncellemeleri görmez; tenant bazlı satırlar kurulumda saklanmadığından fark toplam düzeyinde verilir. |
| `i9-run.js` | Kapanış ve doğrulamadan **sonra** 6. adım olarak `i9-03` çağrılır; fark ya da ölçülemezlik sonucu **BAŞARILI yapmaz**. Özet ve `CL-I9-RUN` makbuzu `anonCalls`, `anonStop`, `isolation`, `sessionDb` alanlarını taşır. Beklenmeyen kimlik-ölçümü çıkış kodu da artık hata sayılır. |
| `cl-lib.js` | **Oturuma özel disposable DB kapısı** (`CL_SESSION_DB='<port>/hukuk_<ad>_test'`): **yalnız** `CL_ENVIRONMENT=disposable` iken okunur; port 5432 yasak; ad deseni zorunlu; port ve ad **çift** eşleşmeli. `live` allowlist'i ve GO-ref kapısı **değişmedi**. G-0 dönüşüne `sessionDb` eklendi. 10 durumlu kapı testi **10/10 beklenen**: canlıda `CL_SESSION_DB` **yok sayılır**; `live + 5432/hukuk_db` GO-ref ile kabul, ref'siz ret; eski `5439/hukuk_fix1_test` değişmeden kabul. |

---

## 5. CANLI YAZMA ENVANTERİ — yalnız sentetik tenant `cl-acc-<runId>`

Kaynak okuması (RELEASE22 @ `13740670`) ve oturuma özel DB'deki 5 koşumun **her birinde** ölçülen
değerlerle aynı: `users 3 · activeUsers 0 · clients 3 · tasks 1 · audits 2 · offices 0`.

### 5.1 INSERT — 11 satır

| Adım | Tablo | Adet | İçerik |
|---|---|---|---|
| Kurulum (tek transaction) | `Tenant` | 1 | `cl-acc-<runId>`, lifecycle ACTIVE |
| | `User` | 3 | `viewer-` / `user-` / `elevated-<runId>@cl-acceptance.invalid` (RFC 2606, teslim edilemez) |
| | `Lawyer` | 1 | `lawyerRank=PARTNER`, `userId`=elevated |
| | `Client` | 3 | A aktif, kimliksiz, e-postasız · B PASİF `10000000140` · D PASİF `10000000146` |
| P-1 (A-7 pozitif) | `Task` | 1 | "Müvekkil iletişim bilgilerini tamamla" · `OPERATIONAL_COMPLETENESS` · `clientId`=D · PENDING · `dueDate`=`nextFollowUpAt`=+3 gün · `escalationLevel` STAFF · **atanan YOK** (`syncContactFollowUpTask`) |
| P-1 (A-7 pozitif) | `AuditLog` | 1 | `CLIENT_UPDATE` |
| A-8 (aynı değer) | `AuditLog` | 1 | `CLIENT_UPDATE` (bilinen davranış, testte `toHaveLength(1)` ile kilitli) |

### 5.2 UPDATE

| Tablo | Satır | Alan | Adım |
|---|---|---|---|
| `Client` D | 1 | `isActive false→true` | P-1 |
| `Client` D | 1 | `contactFollowUpStatus` → ACTIVE | P-1 (iletişim senkronu) |
| `User` | 3 | `isActive=false` + `tokenVersion++` | kapanış (`cl-09`) — ölçüldü: `minTokenVersion 1` |
| `Case` | 0 | ACTIVE→CLOSED | kapanış — tenant'ta Case yok |

**Yazmayan adımlar:** P-0e/P-0u login (`login()` gövdesinde DB yazma yok; hız sınırlayıcı bellek
içi `Map`; `User` modelinde `lastLoginAt` yok) · N-1…N-4, L-1 retleri (kimlik/yetki kapıları ilk
transaction'dan önce; betik önce/sonra sayım + satır fotoğrafıyla ölçer) · A-8'de Client A (saf
no-op; `updatedAt` değişmez, iletişim senkronu atlanır) · A0-1/2/3 (401).

**Yazılmayan tablolar:** `Office` · `Case` · `CaseClient` · `ClientContact`. **DELETE yoktur.**
`cl-acc-afce215b` (İ1b) ve `cl-acc-2ed1d6d0` (İ8) açılmaz, dokunulmaz.

### 5.3 Kapanıştan sonra kalan durum

Tenant **ACTIVE** kalır (`cl-09` yaşam döngüsüne dokunmaz) · üç kullanıcı pasif, dağıtılmış JWT'ler
`tokenVersion` ile geçersiz · Client A aktif, B pasif, D aktif (`contactFollowUpStatus` ACTIVE) ·
**Task PENDING açık kalır** · kanıt satırları silinmez.

### 5.4 Açık kalan Task'ı cron'ların SEÇEMEME koşulları (RELEASE22 kaynağı)

| Cron | Seçim koşulu | Sentetik tenant için sonuç |
|---|---|---|
| `OperationalEscalationService.scheduledRun` (saatlik, bayraksız) — `OPERATIONAL_COMPLETENESS` görevlerini işleyen motor | tenant'ın `Office` kaydı olmalı (`operational-escalation.service.ts:91-92`) | **Office yok → atlanır** |
| `CaseTaskEscalationService.scheduledRun` (saatlik) | `CASE_TASK_ESCALATION_ENABLED=true` + `LEGAL_WORKFLOW` + `caseId` dolu + Office (`case-task-escalation.service.ts:47, 89-101`) | bayrak canlıda tanımsız (OFF) · kategori ve `caseId` uymaz · Office yok |
| `SchedulerService.checkUpcomingTasks` (saatlik) | `dueDate ≤ yarın` | yalnız **sayar ve günlüğe yazar**; yazma/gönderim yok |
| `GreetingService` | Office + ADMIN kullanıcı | ikisi de yok → atlanır |
| `AutomationService.updateRiskScores` | tenant ACTIVE + `Case` ACTIVE | Case yok |
| Adres-görevi (`addressTask`/`addressOutboxEvent`) · icrabot (`botTask`) | başka tablolar | seçmez |

Oturuma özel DB'de 5 koşumun hepsinde sentetik tenant'ta `offices 0` ölçüldü. **Gerçek gönderim:**
bütün adresler `.invalid`; Client A'nın e-postası yok; Office yok (ofis SMTP'si yok); incelenen
yollarda gönderim çağrısı yok.

---

## 6. DOĞRULAMA — oturuma özel disposable DB, R27 derlemesi (2026-09-11)

Paylaşılan `hukuk_fix1_test` ve eski tenant'ları **kullanılmadı**. Canlıya dokunulmadı.

### 6.1 Ortam ve kapılar

| Öğe | Değer |
|---|---|
| DB | konteyner `hy-i9s-894280b1-db` · `postgres:16-alpine` (yerel imaj, indirme yok) · `127.0.0.1:5441` · `hukuk_i9s_894280b1_test` |
| Şema | R22 kökünün şeması **kopyadan** uygulandı (sha256 `d80e8080896643…` R22 ile eşit; kopya dizininde `.env` yok) · **130 migration uygulandı, başarısız 0** · 210 tablo · başlangıçta **tenant 0** |
| API | `HY_W4_RELEASE22` dist `main.js` sha256 `28D84796…E73F5` **beklenenle eşit** · PID 46344, `:8101` · komut satırı dist ile eşleşti |
| Bağlantılar | API'nin uzak uçlarının **hepsi** `127.0.0.1:5441` (3 ESTABLISHED) · oturum DB'si dışında bağlantı **0** (canlı 5432 / Redis 6379 yok) — 5 koşumdan sonra da 0 |
| Dış etki | canlı `.env` yüklense bile ezilemeyecek biçimde açıkça verildi: `EMAIL_PROVIDER=mock` · SMTP `127.0.0.1:1` · `PHASE9_REDIS_ENABLED=false` · `CLIENT_STATEMENT_MONTHLY_DELIVERY` / `ICRABOT_OUTBOX_CRON_ENABLED` / `LOGIN_INVITE_PROVISIONING_ENABLED` / `CASE_TASK_ESCALATION_ENABLED` / FD yazma-yayın bayrakları `false` |
| Koşucu | düzeltilmiş `i9-run.js` (§4) — `CL_ENVIRONMENT=disposable`, `CL_SESSION_DB=5441/hukuk_i9s_894280b1_test`, R22 kütüphaneleri |

### 6.2 Hata enjeksiyonu — gerçek koşucu, kontrollü 401-dışı yanıt ve istek hatası

Repo **dışı** bir test vekili gerçek koşucu ile R27 API'si arasına kondu. Vekil her isteği API'ye
iletti, **yalnız** seçilen anonim uca müdahale etti ve her isteği kaydetti. Böylece "sonraki uç
çağrılmadı" iddiası koşucunun sözüne değil, **vekilin kaydına** dayanır.

| Senaryo | runId | Enjeksiyon | A0-1 | A0-2 | A0-3 `run-all` | Vekilde anonim istekler | run-all isabeti | Sonuç |
|---|---|---|---|---|---|---|---|---|
| S1 | `1eb15437` | A0-1 → **HTTP 200** | FAIL | ÇAĞRILMADI | ÇAĞRILMADI | `/api/poa` | **0** | FAIL |
| S2 | `c6b28c91` | A0-1 → **soket koparıldı** | ÖLÇÜLEMEDİ (`fetch failed`) | ÇAĞRILMADI | ÇAĞRILMADI | `/api/poa` | **0** | FAIL |
| S3 | `5a92fbb1` | A0-2 → **HTTP 200** | PASS (401) | FAIL | ÇAĞRILMADI | `/api/poa`, `/api/address-discovery/…` | **0** | FAIL |
| S4 | `babaab02` | A0-2 → **soket koparıldı** | PASS (401) | ÖLÇÜLEMEDİ | ÇAĞRILMADI | `/api/poa`, `/api/address-discovery/…` | **0** | FAIL |

Dört senaryonun **hepsinde** ayrıca: kapanış `ERISIM SONLANDIRILDI + CRON MARUZIYETI KAPANDI -
kanit KORUNDU` · kapatma sonrası login **401** · `cl-09` tekrarı `alreadyClosed=true` · DB'de aktif
kullanıcı **0** · izolasyon özeti **eşit** · API'nin oturum DB'si dışında bağlantısı **0**. Sonucun
**FAIL** olması beklenen davranıştır: ölçüt düşmedi, sessiz PASS üretilmedi.

### 6.3 Normal akış — 14/14

| runId `7fc1e6a8` (vekilsiz, doğrudan API) | Sonuç |
|---|---|
| Ölçümler | **PASS 14 · FAIL 0 · ÖLÇÜLEMEYEN 0** — P-0e/u/x · N-1…N-4 · L-1 · P-1 · **A-8a 200** · A-8b · A0-1/2/3 **401** |
| Bulgu | 1 — L-1 = bilinen **B-2** (§7) |
| İzolasyon | kurulum `d3747ffc66ad76c4` (4 komşu tenant · 12 client · 12 user) = kapanış `d3747ffc66ad76c4` |
| Kapanış | erişim kapandı · login 401 · tekrar `alreadyClosed` |
| Sonuç | **PASS** |

**Ek kanıt:** API günlüğünde `runManual`'ın yazdığı `[scheduler] manuel tetik` satırı **0** —
hiçbir koşumda (normal akış dahil) manuel scheduler işi başlamadı.

**Temizlik:** prova API'si (PID 46344) PID + port eşleşmesiyle kapatıldı — canlı API aynı dist
yolunu çalıştırdığı için komut satırına güvenilmedi; canlı `:8080` PID 46332 ve `:3002` PID 47004
**değişmedi**. Oturum DB konteyneri **durduruldu, silinmedi** (kanıt). Günlükler, vekil kayıtları,
runId rezervasyonları ve özet: `C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i9s\runs\`.

### 6.4 Bu doğrulamanın kanıtlamadığı

- Vekil yanıtı **simüle eder**; gerçek guard'ın davranışı normal akışta ve R27 provalarında **401**
  olarak ölçülmüştür.
- İzolasyon özeti **sayı** düzeyindedir; komşu satırlardaki güncellemeler kapsam dışıdır.

---

## 7. BULGULAR

### B-1 · A-8 ölçütü — **ÇÖZÜLDÜ**

R01'de `PUT /clients/:id` `{isActive:true}` (kayıt zaten aktif) **404** dönüyordu. Ürün düzeltmesi
**#2609 @ `845b92d9`**: saf no-op güncelleme **200** döner ve yan etki üretmez (`updatedAt`
değişmez, iletişim senkronu atlanır). R27/RELEASE22 ile **canlıda**. §6.3'te **A-8a 200** ve
**A-8b** (lifecycle alanına yazılmaz) PASS.

### B-2 · Lifecycle ret gövdesi sözleşme farkı — **AÇIK, BLOKE ETMEZ**

PARTNER bağı olmayan USER `PUT` ile reaktivasyon denediğinde **403** ve **yazma 0**'dır (L-1 PASS),
ama gövde **stabil kod taşımaz** (`code` yok). Aynı karar create/dedup yolunda
`code=CLIENT_MUTATION_DENIED_LIFECYCLE` ile bildirilir. İ9 ölçüt kümesinde "lifecycle reddinin
stabil kod taşıması" **yoktur**; kayda geçirilir, ürün işi açılmaz. R27 bunu düzeltmez.

---

## 8. A-0 · `POST /scheduler/run-all` — KAPSAM ve DUR KURALI

Bu uç **iş başlatan** bir uçtur. Canlı kaynağa (RELEASE22) göre katmanlar:

| Katman | Kaynak | Sonuç |
|---|---|---|
| 1 · JWT | `scheduler.controller.ts:20-21` sınıf düzeyi `@UseGuards(JwtAuthGuard)`; guard düz `AuthGuard("jwt")` | anonim → **401**, handler çalışmaz |
| 2 · 1 açık kalırsa | `runManual`'ın ilk satırı `assertCanRunManual` (`scheduler.service.ts:509`); `tenantId` boş → `:541` | **403 `SCHEDULER_MANUAL_RUN_DENIED_NO_ACTOR`**, DB'ye erişilmeden |
| 3 · ikisi birden düşerse | kapsam `{tenantId:''}` → `manualTenantScope` (`:71-72`) `where tenantId=''` | alt kontroller **0 satır** seçer; kapsamsız tek adım `retryFailedUyapRequests` **devre dışı** |

**Gerçek tenant'a etki** yalnız gerçek bir tenant'ın **kimlikli** yetkili kullanıcısıyla mümkündür
(o tenant'ta `Case.update`). Paket **kimlikli çağrı yapmaz** ve gerçek tenant JWT'si taşımaz.

**Dur kuralı artık kodda** (§4.2) ve §6.2'de gerçek koşucuyla doğrulandı: A0-1 ya da A0-2 401
dışında yanıt verdiğinde veya istek hatası oluştuğunda `run-all`'a **gidilmedi**.

**Ölçüm kapsamı (açıkça):** A-0'ın "kayıt oluşmaz" kısmını betik **sentetik tenant içinde** ölçer
(401 + client/audit sayımı). Tenant dışı kısım yukarıdaki kaynak analizine ve kapanıştaki izolasyon
özetine (sayı düzeyi) dayanır. `/poa` (`poa.controller.ts:24-25`) ve `/address-discovery`
(`address-discovery.controller.ts:25-26`) sınıf düzeyi guard ile korunur; bu iki ucun guard'ı açık
kalırsa ne yapacağı izlenmemiştir.

---

## 9. Kesin komut (canlı, owner GO'sundan SONRA)

PowerShell 5.1 uyumlu. Çalışma yolu **doğrulanmış uzun yoldur** (8.3 kısa ad kullanılmaz).
`CL_LOGIN_PASSWORD` **verilmez** (koşucu bellekte üretir). Bağlantı sırrı yazdırılmaz.

**9.1 GO anında hazırlık — temiz çalışma kopyası ve kimlik**

```powershell
git -C 'C:\Development\HUKUK_YAZILIMI\project' fetch origin main
git -C 'C:\Development\HUKUK_YAZILIMI\project' worktree add --detach 'C:\Development\HY_WT\CL_I9LIVE' origin/main
$G = 'C:\Development\HY_WT\CL_I9LIVE\project\docs\governance'
$want = @{
  'client-live-acceptance-i9-r01\scripts\i9-run.js'             = '304199AA3882DDA2433858891D19DE3BC88919FA4FED48A049638B05CC7E3F59'
  'client-live-acceptance-i9-r01\scripts\i9-01-setup.js'        = '8CE916F2CAFCA98A2DC3DBD21C2B4411AC146A59207928E60DC4BC0E66815A5A'
  'client-live-acceptance-i9-r01\scripts\i9-02-identity.js'     = 'EBB71EED51A073EDCBA8AB71F1DD93FCCCF792154E01C16CEE1E45ADCCD48041'
  'client-live-acceptance-i9-r01\scripts\i9-03-isolation.js'    = '0EA99FD0F37B6625A0DE92EA6B361E12C592A9EB84CD3EE85823F43F0F109B6A'
  'client-live-acceptance-i1b-r01\scripts\cl-lib.js'            = '1FE92E443196F1E64A287A1E37FB5BBF040F040957CDEA0CDB422167EC6D22E3'
  'client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js' = '012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4'
  'client-acceptance-harness-r01\scripts\ah-lib.js'             = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
  'client-acceptance-runners-i3-r01\scripts\i3-lib.js'          = '56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3'
  'f04-live-acceptance-r01\scripts\f04-lib.js'                  = '1D35429566BC0A0469F44ED028FEF829AF204A90C9A5565C6882EF99C6305CA8'
}
$bad = 0
foreach ($k in $want.Keys) {
  $h = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $G $k)).Hash
  if ($h -ne $want[$k]) { $bad++; Write-Output "UYUSMAZ  $k" }
}
Write-Output "hash uyusmazligi: $bad"   # 0 degilse DUR
```

Aynı anda canlı hedefin koşum kapısı (yayın incelemesi değil): `:8080` dinleyicisinin komut satırı
`HY_W4_RELEASE22\project\apps\api\dist\apps\api\src\main.js` olmalı ve API süreci 5432'ye bağlı
görünmeli.

**9.2 Koşum**

```powershell
$S = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i9live'
New-Item -ItemType Directory -Force -Path $S | Out-Null
$env:CL_ENVIRONMENT  = 'live'
$env:CL_OWNER_GO_REF = '<OWNER-GO-CLIENT-I9-YYYYMMDD-Rnn>'
$env:CL_DATABASE_URL = ((Get-Content -LiteralPath 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22\project\apps\api\.env' | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=','').Trim('"')
$env:CL_API_BASE_URL = 'http://127.0.0.1:8080/api'
$env:CL_PRISMA_ROOT  = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/node_modules/@prisma/client'
$env:CL_BCRYPT_PATH  = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/node_modules/bcrypt'
Remove-Item Env:\CL_SESSION_DB -ErrorAction SilentlyContinue
$env:CL_RUN_ID       = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
Add-Content -LiteralPath "$S\RUNID-RESERVATION.txt" -Value "$(Get-Date -Format o) runId=$($env:CL_RUN_ID) go=$($env:CL_OWNER_GO_REF)"
$env:CL_STATE_FILE   = "$S\i9-state-$($env:CL_RUN_ID).json"
node 'C:\Development\HY_WT\CL_I9LIVE\project\docs\governance\client-live-acceptance-i9-r01\scripts\i9-run.js'
```

- **Kütüphane yolları:** ikisi de cutover sonrası `require` ile yüklendi (ölçüldü). **Açıkça
  verilmelidir** — verilmezse `cl-lib.js` ve `i9-01-setup.js` RELEASE21 yollarına düşer. Bunlar
  **ölçüm kütüphanesidir**, ölçülen ürün ikilisi değil.
- **DB hedefi:** `.env`'in hedefi `127.0.0.1:5432/hukuk_db` olarak ölçüldü (değer okunmadan). G-0
  `live` için yalnız bu hedefi kabul eder; `CL_SESSION_DB` canlıda **yok sayılır**.
- **Çakışma:** runId yazmadan önce kaydedilir; kurulum G-3 ile aynı slug varsa **hiç yazmadan** durur.
- **Login bütçesi:** koşum 3 login yapar; sınırlayıcı IP başına 60 sn'de 10. Aynı dakikada başka
  `127.0.0.1` login'i varsa 429 gelebilir → ilgili iddia ÖLÇÜLEMEDİ (429 kanıt değildir).

---

## 10. Hata / yarıda kesilme kurtarması ve erişim kapatma

| Durum | Davranış |
|---|---|
| Kurulum yarıda kesilirse | tek transaction + EXPECTED transaction içinde → ROLLBACK, yetim satır 0 |
| Anonim uç 401 dışı / istek hatası | sonraki anonim istek gönderilmez; kapanış **yine çalışır**; sonuç BAŞARISIZ |
| Ölçüm FAIL/ÖLÇÜLEMEDİ | `finally` kapatmayı **yine de** çağırır |
| İzolasyon farkı / ölçülemezlik | sonuç BAŞARISIZ; toplam farklar makbuzda |
| Durum dosyası yazılamazsa | kurulum **exit 4** verir ve kurtarma komutunu basar |
| Çakışma / hedef uyuşmazlığı | G-1/G-2/G-3 → **hiçbir yazma yapılmaz** |
| Kapanış doğrulanamazsa | **BAŞARILI verilmez** |
| **Süreç zorla sonlanırsa** | aşağıdaki komut, **yalnız runId** ile |

```powershell
# §9.2'deki CL_ENVIRONMENT / CL_OWNER_GO_REF / CL_DATABASE_URL / CL_PRISMA_ROOT tanımlıyken (kapatma da yazmadır):
$env:CL_RUN_ID = '<runId>'
node 'C:\Development\HY_WT\CL_I9LIVE\project\docs\governance\client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js'
# İzolasyonu elle yeniden ölçmek (salt-okuma; durum dosyası gerekir):
$env:CL_STATE_FILE = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i9live\i9-state-<runId>.json'
node 'C:\Development\HY_WT\CL_I9LIVE\project\docs\governance\client-live-acceptance-i9-r01\scripts\i9-03-isolation.js'
```

`cl-09` üç `User` satırında `isActive=false` **ve** `tokenVersion++` yazar → login **401**,
dağıtılmış JWT'ler de geçersizleşir. Tekrarı güvenlidir: ikinci çağrı `alreadyClosed=true ·
usersDeactivated=0 · exit 0` (§6'da beş kez ölçüldü).

---

## 11. Kapanış ölçütü ve ŞU ANKİ DURUM

| Ölçüt | Durum | Dayanak |
|---|---|---|
| `MUTATION_AUTHORITY` | **KARŞILANDI — canlı** | İ8 U-1 (`cl-acc-2ed1d6d0`) |
| #2552 — create | **KARŞILANDI — canlı** | N-1 · runId `d19ce2c7` (§13) |
| #2552 — değişen-değer | **KARŞILANDI — canlı** | N-2 · `d19ce2c7` |
| #2552 — reaktivasyon (PUT + POST/dedup) | **KARŞILANDI — canlı** | N-3 · N-4 · `d19ce2c7` |
| A-0 (üç uç) | **KARŞILANDI — canlı** (+ dur kuralı yerelde doğrulandı) | ön yoklama + A0-1/2/3 · `d19ce2c7` · §6.2 |
| A-7 | **KARŞILANDI — canlı** | N-3/N-4 + P-1 pozitif · `d19ce2c7` |
| A-8 | **KARŞILANDI — canlı** (B-1 çözüldü) | A-8a 200 · A-8b · `d19ce2c7` |

**İ9 KAPANDI** (canlı koşum ve kapanış doğrulandı, §13). Sayaç **9/17**; hizmet kabulü **0/8 tam**
kendiliğinden değişmez.

---

## 12. Kapsam DIŞI

Deploy · migration · servis restartı · canlı flag değişikliği · gerçek alıcıya gönderim ·
`Office`/`Case` yazma · silme · gerçek tenant'ta **GET dışında** herhangi bir çağrı · kimlikli
`run-all` · İ1b/İ8/İ9 alanlarında (`cl-acc-afce215b`, `cl-acc-2ed1d6d0`, `cl-acc-d19ce2c7`)
kullanıcı erişiminin yeniden açılması · **ürün kodu değişikliği** · B-2 ürün yaması · **İ10…İ15** · İ16/İ17 · OFFICE
AK-2/AK-1a · başlatıcı dayanıklılık işi.

---

## 13. CANLI KOŞUM KAYDI — `OWNER-GO-CLIENT-I9-20260911-R01`

**Onay:** owner GO `OWNER-GO-CLIENT-I9-20260911-R01` · paket R02 (#2629, merge
`6c8ffeb57845159632e8ae9852b54cd02d505aec`). Onaylı yazma **yalnız** `cl-acc-<runId>` sentetik
tenant'ında: 11 satırlık envanter, Client D'nin aktifleştirilmesi ve kapanış erişim iptalleri.
Görev ve audit kanıtı korunur; görevin açık kalması kapsamdadır. Gerçek alıcıya ileti yok; paralel
OFFICE kabulü, restart ve yayın yok. **Koşum tek kez yürütüldü.**

### 13.1 Koşum öncesi kapılar — hepsi ilk yazmadan ÖNCE

| Kapı | Ölçüm |
|---|---|
| R02 betikleri | çalışma kopyası `C:\Development\HY_WT\CL_I9LIVE` @ `6c8ffeb57845…` (temiz) · 9 dosyanın tam sha256'sı §4 tablosuyla **9/9 eşit** (tam liste rezervasyon kaydında) |
| API | `:8080`'de **tek dinleyici süreç** — PID 46332 (`0.0.0.0:8080` + `[::]:8080`) · komut satırı `HY_W4_RELEASE22\project\apps\api\dist\apps\api\src\main.js` · 5432'ye 12 ESTABLISHED |
| Web | `:3002` PID 47004 · `HY_W4_RELEASE22\project\apps\web\…\next start --port 3002` |
| Aday / derleme | `HY_W4_RELEASE22` HEAD `137406701248858221d12be94a941f8837a2a245` · BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ` · sunulan manifest yeni **200** / eski **404** · `client.service.js` `01CA99AEC166362363135F79509DC88D9E60BD5D5A6CDCDAAD76E599978D5143` |
| GO ref kullanılmamış | origin/main **0** · açık PR dalları **0** · durum kayıtları **0** · önceki İ9 canlı durum dosyası **0** |
| Paralel kabul | bu makinede kabul/governance betiği çalıştıran süreç **0** |
| runId + durum kaydı | **`d19ce2c7`** · `RUN-RESERVATION-d19ce2c7.json` ilk yazmadan önce diske yazıldı (sırsız) · çakışma yok: `cl-acc-d19ce2c7` mevcut değildi (salt-okuma transaction, `transaction_read_only=on`, `hukuk_db` @ 5432, birincil) |
| Sakin pencere | 18:38 UTC: son 15 dk küresel audit **0** · son 24 s yeni tenant **0** · saat başı cron'larına 22 dk |
| A-0 ön yoklaması | token yok, gövde `{}`, dur kuralı, `run-all` sonda: A0-1 **401** · A0-2 **401** · A0-3 **401** → koşum başlatıldı |

### 13.2 Koşum — runId `d19ce2c7` · 2026-09-11 18:39:22Z → 18:39:23Z · çıkış 0

| Kalem | Değer |
|---|---|
| Kurulum | **8/8 satır** · `cl-acc-d19ce2c7` · izolasyon tabanı 9 komşu tenant · client 21 · user 43 · `02a04f4d7aec410e` |
| P-0e / P-0u / P-0x | 201 · 201 · user ve elevated aynı rolde (USER), ADMIN yolu kapalı |
| N-1 … N-4 (#2552) | dördü de **400 · `reasonCode=CLIENT_IDENTITY_CHECKSUM_INVALID` · `offendingFields=["tckn"]`** · yazma 0, hedefler pasif kaldı |
| L-1 | **403** · yazma 0 (gövdede stabil kod yok → bulgu = bilinen B-2) |
| P-1 (A-7 pozitif) | **200** · Client D `isActive false→true` |
| A-8a / A-8b | **200** · `isActive true→true`, `updatedAt` değişmedi, audit 1→2 |
| A0-1 / A0-2 / A0-3 | **401** · client 3→3 · audit 2→2 · dur kuralı tetiklenmedi |
| **Ölçümler** | **PASS 14 · FAIL 0 · ÖLÇÜLEMEYEN 0** · bulgu 1 |
| Kapanış (`cl-09`) | `usersDeactivated 3 · stillActive 0 · tokenVersionBumped 3 · evidencePreserved true · caseCronExposureClosed true` |
| Doğrulama | kapatma sonrası login **401** · `cl-09` tekrarı `alreadyClosed=true · usersDeactivated=0 · exit 0` |
| İzolasyon | kurulum `02a04f4d7aec410e` = kapanış `02a04f4d7aec410e` · fark tenant 0 · client 0 · user 0 |
| Sonuç | **PASS** · günlükte sır **0** |

### 13.3 Bağımsız doğrulama — salt-okuma transaction, koşum sonrası

| Ölçüm | Sonuç |
|---|---|
| `tenantId` kolonlu tablo taraması | **139 tablo** tarandı; satır yalnız `User` 3 · `Lawyer` 1 · `Client` 3 · `Task` 1 · `AuditLog` 2 → 10 + `Tenant` 1 = **11** = onaylı envanter, **birebir** |
| Kullanıcılar | `viewer-` / `user-` / `elevated-d19ce2c7@cl-acceptance.invalid`: **üçü de `isActive=false`, `tokenVersion=1`** |
| Müvekkiller | A aktif · B pasif (`10000000140`) · **D aktif** (`10000000146`, `contactFollowUpStatus=ACTIVE`) |
| Görev | "Müvekkil iletişim bilgilerini tamamla" · **PENDING (açık)** · `OPERATIONAL_COMPLETENESS` · müvekkil D · atanan yok · `dueDate` 2026-09-14T18:39:22.928Z — korunuyor |
| Audit | 2 × `CLIENT_UPDATE` (18:39:22.921Z · 18:39:22.978Z) — korunuyor |
| Küresel toplamlar | tenant 9→10 · client 21→24 · user 43→46 — **yalnız sentetik yazmalar**; aynı pencerede küresel audit 2 = bu koşumunkiler |
| Canlı servisler | `:8080` PID 46332 · `:3002` PID 47004 — **restart yok** |
| Gerçek alıcı | Office yok · bütün adresler `.invalid` · görev atanansız · 139 tablo taramasında bu tenant'a ait bildirim/gönderim satırı **yok** |

### 13.4 Kanıt (paket dışı, sırsız)

`C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i9live\`
— `RUN-RESERVATION-d19ce2c7.json` · `pre-d19ce2c7.json` · `a0-preprobe-d19ce2c7.json` ·
`i9-run-d19ce2c7.log` · `i9-state-d19ce2c7.json` · `post-d19ce2c7.json`.

### 13.5 Karar

İ9 ölçütlerinin tamamı canlıda karşılandı (`MUTATION_AUTHORITY` İ8'de canlı; #2552 üç yol, A-0,
A-7, A-8 bu koşumda) ve kapanış doğrulandı → **İ9 KAPANDI. CLIENT sayacı 8/17 → 9/17.**
Hizmet kabulü **0/8 tam** — kendiliğinden değişmez. OFFICE AK-2/AK-1a ve başlatıcı dayanıklılık
işi **açık kalır**. Belirsiz sonuç ve komşu tenant farkı olmadığı için uzlaştırma gerekmedi;
tekrar ya da silme yapılmadı. `cl-acc-d19ce2c7`: kullanıcı erişimleri kapalı; tenant ACTIVE, Task açık,
kanıt korunuyor. Kullanıcı erişimi yeniden açılmaz.
