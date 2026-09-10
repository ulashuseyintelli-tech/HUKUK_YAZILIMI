# CLIENT İ9 — H1 KİMLİK KABUL PAKETİ (R01)

**Durum: CANLI ONAYA HAZIR DEĞİL.** Yerel doğrulama **13/14** ile tamamlandı; bir kabul
ölçütü (**A-8**) ürün davranışı nedeniyle **karşılanmıyor** (§7 B-1). Canlı yazma YAPILMADI.
Sayaç **8/17**, hizmet kabulü **0/8 tam** — bu paket ikisini de değiştirmez.

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

### 1.1 Canlı RELEASE21 davranışı ile main'deki sonraki AK değişikliklerinin AYRIMI

Canlı sürüm **RELEASE21 @ `2187a78b1621f168605920cdffccb17381dc171a`**. RELEASE21 → `main`
arasında **34 commit** var; ölçüldü:

| Yüzey | R21 ↔ main ürün dosyası farkı |
|---|---|
| `modules/client` | **0** |
| `modules/auth` | **0** |
| `common` | **0** |

Değişen ürün dosyaları yalnız `case`, `lawyer`, `office-approval`, `seed` altındadır
(AK-2 #2599/#2602 ve AK-1a #2604). **İ9'un dokunduğu yüzeyde canlı davranış = main davranışı**;
AK değişiklikleri bu kabulün konusu DEĞİLDİR ve canlıda zaten YOKTUR.

---

## 2. Ölçüt haritası — her ölçüt gerçek uca, aktöre, gövdeye ve DB etkisine bağlı

**İKİ AYRI HATA SÖZLEŞMESİ vardır ve karıştırılmaz** (RELEASE21 kaynağından ölçüldü):

| Kapı | Sınıf | Gövde alanı |
|---|---|---|
| Mutation reddi (`denyMutation`) | `ForbiddenException` 403 | **`code`** |
| Checksum reddi (`identityChecksumError`) | `BadRequestException` 400 | **`reasonCode`** + `offendingFields` |

Yanlış kapıdan gelen 400/403 **başarı sayılmaz**; her gözlem beklenen kapıyı ve alan adını
ayrı doğrular.

| Ölçüt | Uç | Aktör / yetki bağı | Beklenen | DB etkisi | Kaynak (RELEASE21) |
|---|---|---|---|---|---|
| **MUTATION_AUTHORITY** | `PUT /clients/:id` | VIEWER | 403 · `code=CLIENT_MUTATION_DENIED_VIEWER` | satır + audit değişmez | `decideClientUpdate` VIEWER dalı |
| **#2552-a** create | `POST /clients` | elevated | 400 · `reasonCode=CLIENT_IDENTITY_CHECKSUM_INVALID` · `offendingFields:['tckn']` | yazma 0 | `assertCreateIdentityChecksum` `:1556` (ilk tx `:1575`) |
| **#2552-b** değişen-değer | `PUT /clients/:id` | elevated | aynı 400 + `reasonCode` | satır değişmez | `assertChangedIdentityChecksum` `:1755` (tx `:1818`) |
| **#2552-c** PUT reaktivasyon | `PUT /clients/:id` `{isActive:true}` | elevated | aynı 400 + `reasonCode` | kayıt PASİF kalır | `assertReactivationIdentityChecksum` `:1759` |
| **#2552-d** POST/dedup reaktivasyon | `POST /clients` `{tckn: <eşleşen>}` | elevated | aynı 400 + `reasonCode` | yeni kayıt YOK, hedef PASİF kalır | `:1500` → `:1503` (ilk tx `:1506`) |
| **A-7** | = #2552-c/d (pasif + geçersiz kimlik) | elevated | 400 `CLIENT_IDENTITY_CHECKSUM_INVALID` | yazma 0 | aynı |
| **A-7 pozitif** | `PUT` `{isActive:true}` (pasif + **geçerli** kimlik) | elevated | 200 · `isActive false→true` | **gerçek yazma** | `lifecycleGuard` + `updateMany` |
| **A-8** | `PUT` `{isActive:true}` (kayıt **zaten aktif**) | elevated | **200**; lifecycle alanına yazılmaz | `isActive` değişmez | `isActive: lifecycleTransition ? data.isActive : undefined` |
| **A-0** | `POST /poa` · `POST /address-discovery/client-info-request` · `POST /scheduler/run-all` | anonim | 401 | kayıt oluşmaz | üç controller da sınıf düzeyinde `@UseGuards(JwtAuthGuard)` |

**Lifecycle yetkisi tek predikattır:** `assertCanManageLifecycle` ve
`assertCanReactivateViaCreate` ikisi de `officeApproval.isApproverEligible` çağırır —
aktif + aynı tenant + **staffMember YOK** + linkli `Lawyer` + (`PARTNER` ∨
`canApproveOfficeActions`). **`UserRole.ADMIN` tek başına YETMEZ.**

---

## 3. İ8'den devralınan kanıt — yeniden koşulmadı

**`MUTATION_AUTHORITY`** ölçütü İ8'in canlı koşumunda **U-1** olarak ölçüldü:
`PUT /clients/:id` `{phone}` · VIEWER → **403 · `CLIENT_MUTATION_DENIED_VIEWER`** · satır
değişmedi · audit `0→0` (kayıt: `CLIENT-LIVE-ACCEPTANCE-I8-R01` §13.2, alan
`cl-acc-2ed1d6d0`, GO `OWNER-GO-CLIENT-I8-20260910-R01`). Bu paket onu **tekrarlamaz**;
canlı koşumda da tekrarlanmayacaktır.

---

## 4. Düzenek — dosyalar ve tam kimlikler

Yol: `project/docs/governance/client-live-acceptance-i9-r01/scripts/`

| Dosya | sha256 |
|---|---|
| `i9-01-setup.js` | `8CE916F2CAFCA98A2DC3DBD21C2B4411AC146A59207928E60DC4BC0E66815A5A` |
| `i9-02-identity.js` | `99DF9EBB9367178EEDA772DD497F2AB393D95A8A9046A78B8366339B74C70749` |
| `i9-run.js` | `681F5E6B8C7A8DB441DCCDE94C5E8DF1FD193F769C26C267297CE9527A54C574` |
| `client-live-acceptance-i1b-r01/scripts/cl-lib.js` | `0BA0E53C47C3E6A9C1639D94B10217F9CC8F484F78F5171CD73202DE5E79EEAA` |
| `client-live-acceptance-i1b-r01/scripts/cl-09-close-access.js` | `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` |

**Paket değişikliği (tek satır):** `cl-lib.js` GO-ref biçim kapısı `I(1B|8)` → `I(1B|8|9)`.
Kapı **gevşemez**: canlıda owner'ın yazılı ref'i hâlâ ZORUNLUdur ve kütüphane ref ÜRETMEZ.

**Yeniden kullanılan mevcut düzenekler:** kapatma için İ1b'nin `cl-09-close-access.js`
(kopya yazılmadı); "yazma 0" kanıtı için İ3'ün `i3-lib` yardımcıları
(`safeCapture` / `unchanged` — fotoğraf alınamazsa **PASS üretemez**); izolasyon tabanı için
İ1a'nın `ah-lib.isolationFingerprint`.

### 4.1 Kimlik değerleri ÖLÇÜLEREK seçildi

Ürünün kendi `isValidTckn` algoritması (`common/identity-validation.util.ts`) yerel olarak
koşuldu:

| Değer | Sonuç | Kullanım |
|---|---|---|
| `10000000146` | **GEÇERLİ** | pozitif kontrol (A-7 pozitif) |
| `10000000140` | **GEÇERSİZ** | A-7 / #2552-c / #2552-d hedefi |
| `10000000147` | **GEÇERSİZ** | #2552-a (dedup eşleşmesi OLMAYAN create) |

Üçü de 11 hane ve ilk hanesi 0 değil → uzunluk/format kapısına takılmaz, **yalnız checksum
düşer**. Değerler uydurulmadı.

---

## 5. CANLI YAZMA ENVANTERİ

### 5.1 INSERT — 8 satır, tek transaction, İ9'un KENDİ tenant'ında

| # | Tablo | İçerik |
|---|---|---|
| 1 | `Tenant` | `cl-acc-<runId>`, lifecycle **ACTIVE** |
| 2 | `User` | `viewer-<runId>@cl-acceptance.invalid` · **VIEWER** |
| 3 | `User` | `user-<runId>@cl-acceptance.invalid` · **USER** (PARTNER bağı YOK) |
| 4 | `User` | `elevated-<runId>@cl-acceptance.invalid` · **USER** |
| 5 | `Lawyer` | `lawyerRank=PARTNER`, `userId`=(4) |
| 6 | `Client A` | aktif, kimlik YOK, e-posta YOK |
| 7 | `Client B` | **PASİF**, `tckn=10000000140` (**geçersiz**) |
| 8 | `Client D` | **PASİF**, `tckn=10000000146` (**geçerli**) |

**Neden geçersiz kimlik doğrudan Prisma ile yazılıyor:** ürünün create yolu checksum
kapısından geçer → geçersiz kimlikli kayıt **API üzerinden üretilemez**. Canlıdaki 7 pasif
geçersiz-checksum kaydı da legacy veridir; bu kurulum o durumu birebir yansıtır.
**Ürün kodu değiştirilmez.**

### 5.2 UPDATE — ölçümün ürettiği gerçek yazmalar

| Ne | Kaç | Hangi gözlem |
|---|---|---|
| `Client D.isActive false→true` | 1 | **A-7 pozitif** (gerçek DB etkisi kanıtı) |
| Kapanışta `User.isActive=false` + `tokenVersion++` | 3 | `cl-09` |

**Doğal audit etkisi:** başarılı reaktivasyon ürünün kendi `CLIENT_REACTIVATE`/`CLIENT_UPDATE`
audit satırını yazar (provada tenant audit `0→1` ölçüldü). Bu satırlar **silinmez**.
Reddedilen denemelerin hiçbiri audit yazmaz (provada `0→0` ölçüldü).

**YAZILMAYAN:** `Case` · `CaseClient` (→ `updateRiskScores` hiçbir Case seçemez; kalıcı cron
maruziyeti **yapısal olarak 0**) · `Office` · `ClientContact`. **DELETE yoktur.**
`cl-acc-afce215b` (İ1b) ve `cl-acc-2ed1d6d0` (İ8) **açılmaz, dokunulmaz**.

### 5.3 Reaktivasyon kapsamı

Reaktivasyon YALNIZ İ9'un kendi `Client D` satırında yapılır. Ürünün iki reaktivasyon yolu da
ölçülür (`PUT` ve `POST`/dedup) ama **yazma yalnız geçerli kimlikli kendi kaydımızda**
gerçekleşir; geçersiz kimlikli `Client B` her iki yolda da PASİF kalır.

---

## 6. Yerel doğrulama — RELEASE21 derlemesi, disposable ortam

**Kimliği doğrulanmış derleme:** `HY_W4_RELEASE21/project/apps/api/dist/apps/api/src/main.js`
· sha256 `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` · kaynak
`2187a78b…`. Başlatmadan önce dist hash'i beklenen değerle eşlendi, DB hedefi
`127.0.0.1:5439/hukuk_fix1_test` (disposable) doğrulandı, **canlı portlar hedef seçilemez** ve
başlatıcı **hiçbir süreci öldürmez**. Başladıktan sonra dinleyen PID'in komut satırı dist
yoluyla eşlendi; API↔DB bağı **süreç düzeyinde** ölçüldü (5439'a 3 ESTABLISHED, 5432'ye **0**)
ve bogus login **401** ile desteklendi. Canlı API (PID 50716) ve Web (PID 22440) **dokunulmadı**.

**Koşum — runId `cd66cd74`, tenant `cl-acc-cd66cd74`:**

```
[S1] KURULUM COMMIT EDILDI — 8/8 satir
  OK   P-0e  elevated oturum acabiliyor            HTTP 201
  OK   P-0u  user oturum acabiliyor                HTTP 201
  OK   P-0x  OLCUM GECERLI: user ve elevated AYNI rolde (USER), fark YALNIZ PARTNER bagi
  OK   N-1   #2552-a CREATE          400 · reasonCode=CLIENT_IDENTITY_CHECKSUM_INVALID · offendingFields=["tckn"] · client 3->3 · audit 0->0
  OK   N-2   #2552-b DEGISEN-DEGER   400 · ayni reasonCode · kalici degisiklik YOK
  OK   N-3   #2552-c PUT REAKTIVASYON 400 · ayni reasonCode · isActive=false · kalici degisiklik YOK
  OK   N-4   #2552-d POST/DEDUP      400 · ayni reasonCode · yeni kayit YOK · client 3->3 · audit 0->0
  OK   L-1   PARTNER bagi OLMAYAN USER reaktivasyonu 403 · isActive=false · kalici degisiklik YOK
  OK   P-1   A-7 POZITIF             200 · isActive false->true YAZILDI
  FAIL A-8a  AYNI degerle isActive:true → beklenen 200, olculen **HTTP 404**
  OK   A-8b  LIFECYCLE alanina YAZILMAZ · isActive true->true · updatedAt degismedi · audit 1->1
  OK   A0-1  ANONIM POST /poa                                   401 · client 3->3 · audit 1->1
  OK   A0-2  ANONIM POST /address-discovery/client-info-request  401 · client 3->3 · audit 1->1
  OK   A0-3  ANONIM POST /scheduler/run-all                      401 · client 3->3 · audit 1->1

I9 H1 KIMLIK KABULU: PASS 13 · FAIL 1 · OLCULEMEYEN 0  (toplam 14)
[DOGRULAMA] kapatma sonrasi login=401 · [TEKRAR] alreadyClosed=true exit=0
```

Reddedilen her denemede **ilgili satır ve audit değişmezliği** ayrı ölçüldü (`i3-lib.unchanged`;
fotoğraf alınamazsa PASS üretilemez). Pozitif kontrol **gerçek DB etkisiyle** doğrulandı.

---

## 7. BULGULAR

### B-1 · A-8 ölçütü KARŞILANMIYOR — İ9'u BLOKE EDER

**Gözlem:** kayıt zaten aktifken `PUT /clients/:id` `{isActive:true}` → **HTTP 404
"Müvekkil bulunamadı"**. Kayıt DB'de duruyor (aynı ölçüm onu okuyabildi).

**Zincir — iki ayağı da ölçüldü:**
1. `update()` no-op istekte Prisma'ya **tüm alanları `undefined`** olan bir `data` verir
   (`isActive: lifecycleTransition ? data.isActive : undefined`; geçiş yok → `undefined`).
2. Prisma ölçümü (disposable): `data={hepsi undefined}` → **`count=0`** · `data={}` →
   **`count=0`** · `data={name: AYNI değer}` → `count=1`.
3. Ürün `count===0` dalında: `lifecycleTransition` varsa 409 `CLIENT_STATE_CHANGED`,
   **yoksa `NotFoundException` → 404**.

**Ölçüte göre değerlendirme:** A-8 = *"200; lifecycle alanına YAZILMAZ"*. İkinci yarı
**karşılanıyor** (A-8b PASS: `isActive` değişmedi, `updatedAt` bile değişmedi, lifecycle
audit'i oluşmadı). **Birinci yarı (200) karşılanmıyor.** R02:205 kapanış ölçütü *"Beş gözlem
de PASS"* dediği için bu **İ9'u BLOKE EDER**; beklenti gevşetilmez.

**Etki:** yazma güvenliği açısından zararsız (fazladan yazma YOK, yetki/kimlik kapıları
etkilenmiyor). Etki **sözleşmeseldir**: istemci, var olan bir kaydı "bulunamadı" olarak
görür; idempotent yeniden gönderim (aynı değeri tekrar yazma) 404 üretir. `remove()` yolunda
aynı desen ayrıca ele alınmıştır (`count===0` → 404, orada kayıt gerçekten yok olabilir).

**Ürün işi AÇILMADI** (owner: kendiliğinden ürün işi açma). Karar owner'ındır; iki seçenek
görünür: (a) no-op update'i 200 ile döndüren dar düzeltme, (b) ölçütün "200" lafzının
gözden geçirilmesi. Bu paket ikisini de **önermez, uygulamaz**.

### B-2 · Lifecycle ret gövdesi sözleşme farkı — İ9'u BLOKE ETMEZ

**Gözlem:** PARTNER bağı olmayan USER `PUT` ile reaktivasyon denediğinde **403** döner ve
**yazma 0**'dır (L-1 PASS), fakat gövde **stabil kod taşımaz** (`code` alanı YOK) — ret
`assertCanManageLifecycle`'ın düz `ForbiddenException(string)`'inden gelir. Aynı yetki kararı
**create/dedup** yolunda `denyMutation` üzerinden **`code=CLIENT_MUTATION_DENIED_LIFECYCLE`**
ile bildirilir.

**Neden bloke etmez:** İ9'un ölçüt kümesinde (MUTATION_AUTHORITY · #2552 · A-0 · A-7 · A-8)
"lifecycle reddinin stabil kod taşıması" **yoktur**. `MUTATION_AUTHORITY` ölçütü VIEWER
mutation reddini kapsar ve o yol `denyMutation` kullanır (İ8'de tam kodla ölçüldü).
Bu fark kayda geçirilir; **ürün işi açılmaz**.

---

## 8. A-0 · `POST /scheduler/run-all` — KAPSAM UYARISI

Bu uç **iş başlatan** bir uçtur. Anonim reddi (401) `@Controller('scheduler')` üzerindeki
sınıf düzeyi `@UseGuards(JwtAuthGuard)` ile sağlanır ve provada 401 ölçülmüştür.

**"Yazma yok" varsayımıyla sunulmaz:** eğer bu guard bozulur veya kaldırılırsa aynı çağrı
**kimliksiz olarak** `run-all` / `check/payment-orders` / `check/nafaka` / `check/mts` /
`check/uyap-retry` akışlarını tetikleyebilir. Bu akışlar **tenant'a bağlı iş üretir** ve
gerçek tenant'lardaki kayıtlar üzerinde çalışabilir; sonuç yalnız 401 gözlemiyle sınırlı
kalmaz. Bu nedenle:

- Canlı koşumda bu çağrı **yalnız anonim** (token YOK) yapılır; kimlikli varyantı KOŞULMAZ.
- Beklenen sonuç **401**'dir; **401 dışında herhangi bir sonuç alınırsa koşum DURDURULUR**,
  ölçüm FAIL verir ve durum owner'a bildirilir — "muhtemelen zararsızdır" denmez.
- Ölçüm ayrıca çağrı öncesi/sonrası tenant client ve audit sayımlarını karşılaştırır.

---

## 9. Kesin komut (canlı, onaydan SONRA)

```powershell
$env:CL_ENVIRONMENT  = 'live'
$env:CL_OWNER_GO_REF = '<owner GO ref>'          # OWNER-GO-CLIENT-I9-YYYYMMDD-Rnn
$env:CL_DATABASE_URL = 'postgresql://<user>:<pass>@127.0.0.1:5432/hukuk_db'
$env:CL_API_BASE_URL = 'http://127.0.0.1:8080/api'
$env:CL_PRISMA_ROOT  = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/node_modules/@prisma/client'
$env:CL_BCRYPT_PATH  = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/node_modules/bcrypt'
$env:CL_RUN_ID       = '<8 hex — YAZMADAN ONCE belirlenir ve kayda gecer>'
$env:CL_STATE_FILE   = '<paket disi yol>\i9-state.json'
node .\project\docs\governance\client-live-acceptance-i9-r01\scripts\i9-run.js
```

**Canlı hedef ölçümle doğrulanmıştır:** API `:8080` (PID 50716, RELEASE21 dist) ·
Web `:3002` (PID 22440). Kapılar: G-0 ortam · G-1 slug öneki · G-2 tenant sahipliği ·
G-3 çakışma · G-4 sır taraması. Login bütçesi 3 < 10/dk; **429 kanıt sayılmaz**.

---

## 10. Hata / yarıda kesilme kurtarması ve erişim-oturum kapatma

| Durum | Davranış |
|---|---|
| Kurulum yarıda kesilirse | Tek transaction + EXPECTED **transaction içinde** → ROLLBACK, yetim satır 0 (`I9_ABORT_AFTER` ile sınanabilir) |
| Ölçüm FAIL/ÖLÇÜLEMEDİ verirse | `finally` kapatmayı **yine de** çağırır (çıkış kodundan ve ölçüm sonucundan bağımsız) |
| Süreç zorla sonlanırsa | Kurtarma **yalnız runId** ile: `$env:CL_RUN_ID='<runId>'; node .\project\docs\governance\client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js` (tekrar-güvenli, İ5b'de ölçüldü) |
| Durum dosyası yazılamazsa | Betik **exit 4** verir ve kurtarma komutunu basar |
| Çakışma / hedef uyuşmazlığı | G-1/G-2/G-3 → **hiçbir yazma yapılmaz** |
| Kapanış doğrulanamazsa | **BAŞARILI verilmez** |

**Erişim ve oturum kapatma:** `cl-09` üç `User` satırında `isActive=false` **ve**
`tokenVersion++` yazar → login **401**, dağıtılmış JWT'ler de geçersizleşir. Provada
doğrulandı: kapatma sonrası login **401**, ikinci çağrı `alreadyClosed=true /
usersDeactivated=0 / exit 0`.

---

## 11. Kapanış ölçütü ve ŞU ANKİ DURUM

| Ölçüt | Durum | Dayanak |
|---|---|---|
| `MUTATION_AUTHORITY` | **KARŞILANDI** | İ8 U-1, canlı (`cl-acc-2ed1d6d0`) |
| #2552 — create | **KARŞILANDI** (yerel) | N-1 |
| #2552 — değişen-değer | **KARŞILANDI** (yerel) | N-2 |
| #2552 — reaktivasyon (PUT + POST/dedup) | **KARŞILANDI** (yerel) | N-3 · N-4 |
| A-0 (üç uç) | **KARŞILANDI** (yerel) | A0-1/2/3 |
| A-7 | **KARŞILANDI** (yerel) | N-3/N-4 + P-1 pozitif |
| **A-8** | **KARŞILANMIYOR** | **B-1: 200 yerine 404** |

**İ9 KAPANMAZ.** Sayaç **8/17** kalır, hizmet kabulü **0/8 tam** kalır.
Canlı koşum, B-1 hakkında owner kararı verilmeden anlamlı bir kapanış üretmez: aynı ürün
canlıda da aynı 404'ü döndürecektir (R21 ↔ main farkı bu yüzeyde **0**).

---

## 12. Kapsam DIŞI

Deploy · migration · servis restartı · canlı flag değişikliği · gerçek alıcıya gönderim ·
`Office`/`Case` yazma · silme · gerçek tenant'ta **GET dışında** herhangi bir çağrı ·
İ1b/İ8 alanlarının yeniden açılması · **ürün kodu değişikliği** · **İ10…İ15**.
