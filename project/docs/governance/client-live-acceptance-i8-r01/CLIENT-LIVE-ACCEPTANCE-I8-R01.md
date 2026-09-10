# CLIENT İ8 — CANLI KABUL ONAY PAKETİ (R01)

**Durum:** ONAY BEKLİYOR — canlı yazma YAPILMADI.
**Bu belge bir onay değildir.** Owner'ın yazılı GO'su olmadan hiçbir canlı yazma başlamaz.
**Öncül:** İ1b onayı (KAPANDI, sayaç 7/17) — R02:204'ün açık koşulu.

---

## 1. İ8'in kapsamı — KAYNAKTAN

R02 §3.3 satır 204, birebir:

> | **İ8** | **Sentetik alanın canlı sürümde doğrulanması** + erişim sonlandırma provası | KAN |
> Alan canlıda kurulu; yetkisiz denemelerde yazma 0; erişim kapatma çalışıyor
> (**öncül: İ1b onayı**) | tümü | 0,5 gün |

Kapanış ölçütü **üç bacaklıdır**:

| Bacak | Ölçüt |
|---|---|
| **B1** | Alan canlıda kurulu |
| **B2** | Yetkisiz denemelerde **yazma 0** |
| **B3** | Erişim kapatma çalışıyor |

Bağımlılık: R02 §3.3 başlığı — "Hepsi İ7 + İ3'e bağlıdır" (ikisi de KAPALI) ve §3.5 —
"İ9–İ16 aynı sentetik alanı kullanır. Bağımsızlıkları kanıtlanana kadar **SIRALI** koşulur:
**her koşum kendi tenant'ını üretir** veya bir öncekinin kalıcı durumunu bozmadığı gösterilir."

**Referans düzeltmesi:** R02'de **§4.4 YOKTUR** (§4 yalnız §4.1 taşır). "İ8+ ek kayıtlar"
hükmü **İ1b belgesinin §4.4**'üdür ve şunu der: bu kapsam "İ1b değildir; İ8…İ15 onayında
**ayrı** envanterle sunulur." Bu belgenin §5'i o envanterdir.

---

## 2. İ1b kanıtıyla ZATEN KARŞILANAN bacaklar — yeniden iş ÜRETİLMEDİ

İ1b (`fe55c70a`, GO ref `OWNER-GO-CLIENT-I1B-20260910-R01`, alan `cl-acc-afce215b`) kanıtı
**B1 ve B3'ü karşılar**. Bugün canlı DB'de **salt-okuma** ile tazelendi:

```
cl-acc-afce215b · toplam cl-acc- tenant: 1
rows       : user 1 · lawyer 1 · client 1 · case 1 · caseClient 1 · office 0 · clientContact 0
invariants : tenantLifecycle ACTIVE · activeUsers 0 · clientEmailNull true
             caseAutomationDisabled true · caseAutoModeFalse true
users      : [{ isActive: false, tokenVersion: 1 }]
```

| Bacak | İ1b kanıtı | Sonuç |
|---|---|---|
| **B1** Alan canlıda kurulu | 6 satır tek transaction'da COMMIT; canlı DB `127.0.0.1:5432/hukuk_db`; login 201 + `/auth/me` 200 ile **çalışır** olduğu ölçüldü | **KARŞILANDI** |
| **B3** Erişim kapatma çalışıyor | `cl-09`: `isActive=false` + `tokenVersion++` → aynı kimlikle login **401**, eski JWT ile `/auth/me` **401**; ikinci çağrı `alreadyClosed=true` (tekrar-güvenli); kalıcı cron maruziyeti `Case.status=CLOSED` ile kapatıldı | **KARŞILANDI** |
| **B2** Yetkisiz denemede yazma 0 | İ1b paketinde **YOK** — İ1b'nin ölçümü tahsis + erişim kapatmaydı | **AÇIK — İ8'in tek işi** |

**İ1b kapanışı ve 7/17 sayacı bu paketle DEĞİŞMEZ.**

---

## 3. Kalan bacak (B2) ve neden YENİ tenant gerekiyor

B2, farklı yetki bantlarından gelen **reddedilmiş yazma denemelerini** ister. Canlı alanın
bugünkü durumu bunu **yapısal olarak imkânsız kılar**:

- `cl-acc-afce215b`'de **tek** aktör var ve **pasiftir** (`isActive=false`, `tokenVersion=1`);
  login 401 döner → hiçbir yetki bandı ölçülemez.
- Onu yeniden açmak `isActive=true` yazmak demektir; bu **İ1b'nin B3 kanıtını bozar**.
- `Case` CLOSED'dur; açmak kalıcı `updateRiskScores` maruziyetini geri getirir.

Bu yüzden R02 §3.5'in **birinci** seçeneği uygulanır: **İ8 kendi tenant'ını üretir.**
`cl-acc-afce215b`'ye **hiçbir yazma yapılmaz** (tek istisna §5.3'teki *reddedilmesi ölçülen*
denemedir — yazma değil, RED ölçümüdür).

---

## 4. Düzenek — dosyalar ve kimlikler

Yol: `project/docs/governance/client-live-acceptance-i8-r01/scripts/`

| Dosya | sha256 | İş |
|---|---|---|
| `i8-01-setup.js` | `89FEE58EF484CDC31983A119B49FCC110D9F9C7A7AB93691FEA4B38FBE51AFD4` | 6 satır, tek transaction, EXPECTED **transaction içinde** |
| `i8-02-unauthorized.js` | `F7E82D02BF75BDAE53224652A5FE28163EF72F4032DECD58917037FD967537BA` | P-0/P-0x geçerlilik · U-1…U-4 · P-1/P-2 pozitif · U-6 izolasyon |
| `i8-run.js` | `489D4B4D2D235CD4EC99B53AE6CDE2FF9F6BDD1109EA745740821633BB1EF188` | tek yürütücü; `finally` kapatma + doğrulama + tekrar |

**Paket değişikliği (tek satırlık, İ1b paketinde):**
`client-live-acceptance-i1b-r01/scripts/cl-lib.js` — GO-ref biçim kapısı
`OWNER-GO-CLIENT-I1B-…` → `OWNER-GO-CLIENT-I(1B|8)-…`.
Yeni sha256: `A1DCB89BCC6FFC6EBE34433C9DCFC786CAC0809EBDD4AF3B21CD9C272817F446`.
Kapı **gevşetilmedi**: canlıda hâlâ owner'ın yazılı ref'i ZORUNLUdur; yalnız İ8'in kendi
ref'i de biçime uyar. Ref'in gerçekliği owner kanalındadır, betik onu **üretmez**.

Kapatma için **kopya betik yazılmadı**: `cl-09-close-access.js` (İ1b, `fe55c70a`) doğrudan
çağrılır — İ5b'de doğrulanmış runId-tabanlı kurtarma mekanizması.

### 4.1 Ölçümün geçerliliği — rol adı yetki kanıtı DEĞİL

`user` ve `elevated` **bilerek aynı roldedir** (`USER`). Aradaki tek fark PARTNER `Lawyer`
bağıdır. `P-0x` bunu koşumda ölçer. Böylece "hassas alan reddi" rol adından değil **yetki
bağından** okunur (`classifyClientField` FAIL-CLOSED: `phone` standart, `tckn` hassas;
eşik `role==='ADMIN' || isApproverEligible`).

---

## 5. CANLI YAZMA ENVANTERİ — tam liste

### 5.1 YENİ satırlar (6, tek transaction, İ8'in KENDİ tenant'ında)

| # | Tablo | İçerik |
|---|---|---|
| 1 | `Tenant` | `cl-acc-<runId>`, lifecycle **ACTIVE** (login için zorunlu) |
| 2 | `User` | `viewer-<runId>@cl-acceptance.invalid`, rol **VIEWER** |
| 3 | `User` | `user-<runId>@cl-acceptance.invalid`, rol **USER** |
| 4 | `User` | `elevated-<runId>@cl-acceptance.invalid`, rol **USER** |
| 5 | `Lawyer` | `lawyerRank PARTNER`, `userId` = (4) |
| 6 | `Client` | `type PERSON`, **e-posta YOK** |

**Owner'ın açıkça istediği bildirim:** bu koşum **yeni alan ve yeni aktör GEREKTİRİR** —
1 yeni tenant + **3 yeni aktör**. Mevcut sentetik kullanıcı pasiftir ve **açılmaz**;
mevcut `Case` CLOSED'dur ve **açılmaz**.

**YAZILMAYANLAR:** `Case` ve `CaseClient` **yazılmaz** → `updateRiskScores` yüklemi
(tenant ACTIVE **+ Case ACTIVE**) hiçbir Case seçemez; **kalıcı cron maruziyeti yapısal
olarak 0'dır**. `Office` **yazılmaz** (Yol A gönderim ucu hiç açılmaz, `getOrCreate`
çağıran uç kullanılmaz). `ClientContact` yazılmaz. E-posta alanı boş → aylık teslim
cron'u `resolveRecipientEmail` null → `SKIPPED_NO_RECIPIENT`.

### 5.2 GÜNCELLEMELER (İ8'in kendi tenant'ında)

| Ne | Kaç | Neden |
|---|---|---|
| `Client.phone` → `5550000002` | 1 | **P-1 pozitif kontrol**: uç gerçekten yazabiliyor mu (yoksa "yazma 0" ölçümü boş kalır) |
| `Client.tckn` → `10000000146` | 1 | **P-2 pozitif kontrol**: hassas alan yetkiliyle yazılabiliyor. Değer **sentetik**, checksum geçerli, **gerçek kişi verisi değil** |
| `User.isActive=false` + `tokenVersion++` | 3 | Kapanış (`cl-09`) |
| `Case.status` | **0** | Case yok |
| `AuditLog` | ürünün kendi yazdığı kayıtlar | P-1/P-2 başarılı olduğu için ürün audit yazar; **sayısı ölçülmedi**, **silinmez** |

**Silme YOK.** Hiçbir satır DELETE edilmez.

### 5.3 İ1b alanına (`cl-acc-afce215b`) yapılacak tek dokunuş: RED ÖLÇÜMÜ

`U-4`, yabancı tenant kaydına yazma denemesinin reddedildiğini ölçer. Hedef **yalnız**
`cl-acc-` önekli tenant'lar arasından seçilir (`slug startsWith 'cl-acc-'`, kendi tenant'ı
hariç) — **gerçek müvekkil, gerçek kişi veya başka programın tenant'ı seçilmez**. Canlıda
bugün tek aday `cl-acc-afce215b`'dir.

Kaynak bağı: `client.service.ts update()` `:1718-1720`'de `assertActorTenantMatches` +
`assertCanUpdateClient` **ilk `$transaction`'dan (`:1818`) önce** koşar → reddedilen istek
**hiçbir şey yazmaz, audit dahil**. Ölçüm bunu bağımsız doğrular: hedefte `phone`
değişmedi **ve** hedef tenant'ın `AuditLog` sayısı değişmedi. Yani **İ1b alanına yazma 0**;
kapanışı bozulmaz.

Yabancı `cl-acc-` tenant bulunamazsa U-4 **ÖLÇÜLEMEDİ** olur ve koşum FAIL verir —
ölçülemeyen PASS sayılmaz.

### 5.4 Sır politikası

Parola `CL_LOGIN_PASSWORD` ile yalnız **bellekte** üretilir/taşınır; alt sürece yalnız
ortam değişkeni olarak geçer. Durum dosyasına, çıktıya, log'a veya repoya **yazılmaz**
(`G-4 assertNoSecrets` durum nesnesini yazmadan önce tarar). JWT yalnız bellekte tutulur.

---

## 6. Yerel doğrulama — disposable ortamda ÖLÇÜLDÜ

Ortam: `127.0.0.1:5439/hukuk_fix1_test` (kap `hy-fix1-testdb`) + derlenmiş API
`http://127.0.0.1:8098/api`. **Canlı DB'ye 0 yazma.**

### 6.0 DÜZELTME — ölçülen ikilinin kimliği (R01 ilk sürümünde YANLIŞ yazılmıştı)

Bu belgenin ilk sürümü provanın "RELEASE21 derlenmiş API" üzerinde koştuğunu söylüyordu.
**Yanlıştır.** Prova başlatıcısı (`scratchpad/i5b/start-api.js`) sabit olarak şu ikiliyi
başlatır: `HY_W4_RELEASE20/project/apps/api/dist/apps/api/src/main.js`. Koşum sırasında
8098'i dinleyen süreç ölçüldü ve komut satırı bu yolu gösterdi.

| Ne | Kimlik | Kaynak |
|---|---|---|
| **Ölçülen ikili** | **RELEASE20** @ `08ce8e2559b4d1d67fcee245413de510209507f3` (derleme 2026-09-07 10:51) | `.git/worktrees/HY_W4_RELEASE20/HEAD` |
| Canlı sürüm | RELEASE21 @ `2187a78b1621f168605920cdffccb17381dc171a` | `.git/worktrees/HY_W4_RELEASE21/HEAD` |
| Ölçüm kütüphaneleri (Prisma/bcrypt) | RELEASE21 yollarından | §7 komut bloğu |

Betiklerin sha256'sı **değiştirilmedi** (§4 tablosu geçerli); `i8-02-unauthorized.js`
başlığındaki "ÜRÜN DAYANAĞI (RELEASE21)" ifadesi, dayanağın **okunduğu kaynağı** belirtir —
provanın koştuğu ikili yukarıdaki RELEASE20 dist'tir.

**Ölçüm hâlâ geçerli mi — iddia değil, ÖLÇÜM:** R20→R21 arası `apps/api/src` altında
**32 dosya** değişti (15 spec · 17 ürün). İ8'in dokunduğu her yüzey karşılaştırıldı:

| Dosya | R20 ↔ R21 |
|---|---|
| `client.service.ts` (yetki kontrolü `:1718-1720`, ilk `$transaction` `:1818`, audit) | **BİREBİR AYNI** |
| `client-mutation-policy.ts` (`classifyClientField`, `CLIENT_MUTATION_DENIED_*`) | **BİREBİR AYNI** |
| `auth.service.ts` · `auth.controller.ts` (login 201/401, `tokenVersion`, `isActive`) | **BİREBİR AYNI** |
| `common/identity-validation.util.ts` (`isValidTckn`) | **BİREBİR AYNI** |
| `client-identity-checksum.util.ts` | FARKLI |

Tek fark olan `client-identity-checksum.util.ts`, **yalnız geçersiz** kimlikte fırlatılan
gövdeyi yapılandırır (`reasonCode` + `offendingFields` eklenir; HTTP 400 ve kullanıcı metni
korunur). **P-2 geçerli** bir TCKN (`10000000146`) yazar → bu yol hiç tetiklenmez. Değişen
diğer ürün dosyaları (case-status, client-approval, client-intake-link, client-statement,
expense-request, lawyer, office-approval, office) İ8'in kullandığı üç uca
(`POST /auth/login`, `GET /auth/me`, `PUT /clients/:id`) girmez; `Lawyer` satırı API'den
değil doğrudan Prisma ile yazılır.

**Kaynak eşdeğerliği tek başına yeterli DEĞİLDİR.** Bu tablo yalnız "aynı davranış beklenir"
der; *ölçülmüş* sonuç üretmez. Bu yüzden aşağıdaki §6.1'de senaryolar **gerçekten RELEASE21
derlemesi üzerinde** yeniden koşuldu. §6'daki RELEASE20 sonuçları **tarihsel kanıt olarak
korunur** (silinmedi, değiştirilmedi).

### 6.1 RELEASE21 DERLEMESİ ÜZERİNDE KOŞUM (disposable) — runId `27e60365`

Senaryolar **genişletilmedi**; §6'daki aynı 11 gözlem, aynı betiklerle koşuldu.

**Başlatmadan önceki kapılar (fail-closed, hepsi ölçüldü):**

| Kapı | Ölçüm |
|---|---|
| Paket/hash bağı | 5/5 betik diskte, `origin/main` blob'unda ve §4 tablosunda **birebir aynı** |
| Çalıştırılan derleme | `HY_W4_RELEASE21/project/apps/api/dist/apps/api/src/main.js` · sha256 `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` (beklenen değerle eşleşti) |
| Derlemenin kaynağı | RELEASE21 @ `2187a78b1621f168605920cdffccb17381dc171a` (`.git/worktrees/HY_W4_RELEASE21/HEAD`); web `BUILD_ID g91HUaBesekB-R2rRawQj` |
| DB hedefi | `127.0.0.1:5439/hukuk_fix1_test` — **disposable** (canlı `5432/hukuk_db` başlatıcı tarafından reddedilir) |
| Hedef port | **8099** boş; canlı portlar (8080/3002/3000/3001/5432) hedef olarak **seçilemez** |
| Süreç öldürme | **YOK** — başlatıcı hiçbir süreci sonlandırmaz; port doluysa başlamaz |

**Başladıktan sonra çalışma yolu teyidi:** dinleyen PID `37584`'ün komut satırı okundu ve
beklenen dist yolunu **birebir** taşıdığı doğrulandı (başlatıcının kendi raporu kanıt
sayılmadı; `netstat` + `Win32_Process` ile bağımsız ölçüldü). API↔DB bağı ayrıca
bogus login ile sınandı: **HTTP 401** (500 değil → gerçekten bu DB'ye bağlı).

**Sonuç — RELEASE21 koşumu:**

```
[S0] ortam=disposable 127.0.0.1:5439/hukuk_fix1_test · slug=cl-acc-27e60365
[S0] izolasyon tabani: 1225 komsu tenant · digest fb2a6249740878b2
[S1] KURULUM COMMIT EDILDI — 6/6 satir
  OK  P-0v · P-0u · P-0e · P-0x · U-1 · U-2 · U-3 · U-4 · P-1 · P-2 · U-6
I8 YETKISIZ DENEME: PASS 11 · FAIL 0 · OLCULEMEYEN 0
[DOGRULAMA] kapatma sonrasi login=401 · [TEKRAR] alreadyClosed=true exit=0
    SONUC: BASARILI     result: PASS
```

**Kapanış sonrası bağımsız ölçüm:** `cl-acc-27e60365` → `user 3 · lawyer 1 · client 1 ·
case 0 · caseClient 0 · office 0 · clientContact 0`; `activeUsers 0`; 3/3 aktör
`isActive:false`, `tokenVersion:1`.

**Koşum sonrası:** yalnız kendi prova sürecim (PID 37584 / port 8099) kapatıldı; **canlı
API PID 50716 (:8080) ve Web PID 22440 (:3002) çalışmaya devam ediyor, dokunulmadı.**

**Tam akış (runId `c2d7bfa9`):**

```
[S1] KURULUM COMMIT EDILDI — 6/6 satir · tenant=cl-acc-c2d7bfa9
  OK   P-0v  viewer oturum acabiliyor
  OK   P-0u  user oturum acabiliyor
  OK   P-0e  elevated oturum acabiliyor
  OK   P-0x  OLCUM GECERLI: user ve elevated AYNI rolde, fark YALNIZ PARTNER bagi
  OK   U-1   VIEWER mutation REDDEDILIR (tam kod) ve YAZMA 0 (satir + audit)
  OK   U-2   PARTNER bagi OLMAYAN USER hassas alanda REDDEDILIR (tam kod), yazma 0
  OK   U-3   ANONIM istek 401 ile REDDEDILIR ve YAZMA 0
  OK   U-4   YABANCI tenant kaydina yazma REDDEDILIR ve HEDEFTE yazma 0
  OK   P-1   POZITIF: USER standart alani (phone) guncelleyebilir — uc calisiyor
  OK   P-2   POZITIF: PARTNER bagli elevated HASSAS alani (tckn) guncelleyebilir
  OK   U-6   komsu tenantlar DEGISMEDI (dagilim parmak izi)
I8 YETKISIZ DENEME: PASS 11 · FAIL 0 · OLCULEMEYEN 0
[KAPANIS] alan runId=c2d7bfa9 ile araniyor (cikis kodu ve olcum sonucu DIKKATE ALINMAZ)
[DOGRULAMA] kapatma sonrasi login=401 (beklenen 401)
[TEKRAR] cl-09 ikinci cagri: alreadyClosed=true usersDeactivated=0 exit=0
    kapanis: ERISIM SONLANDIRILDI + CRON MARUZIYETI KAPANDI - kanit KORUNDU
    SONUC: BASARILI     result: PASS
```

Reddedilen denemelerde ölçülen tam kodlar: `CLIENT_MUTATION_DENIED_VIEWER` (U-1),
`CLIENT_MUTATION_DENIED_SENSITIVE_FIELDS` (U-2) — mesaj metnine değil **koda** bakılır.

**Kapanış sonrası bağımsız ölçüm** (koşucunun raporu kanıt sayılmaz):

```
cl-acc-c2d7bfa9 · rows: user 3 · lawyer 1 · client 1 · case 0 · caseClient 0 · office 0 · clientContact 0
invariants: activeUsers 0 · tenantLifecycle ACTIVE · clientEmailNull true
users: 3/3 → isActive false, tokenVersion 1
```

**Atomiklik negatif kontrolü:** `I8_ABORT_AFTER=user` ile transaction iki `User` yazıldıktan
sonra düşürüldü → runId `2ab341f1` için `fieldExists: false`. **Yetim satır 0.**

**İzolasyon:** U-6, 1223 komşu tenant üzerinden dağılım parmak izini kurulum öncesi tabanla
karşılaştırdı → **digest eşleşti**.

**Bulunan ve düzeltilen kusur (kendi ölçüm hatam):** ilk provada `i8-run.js` makbuzu satır-sonu
deseniyle arıyordu; kapatma exit 0 ile **çalıştığı hâlde** makbuz okunamadığı için koşum
"kapanış DOĞRULANAMADI" verdi. Düzenek doğru davrandı (okunamayan kapanışı başarı saymadı).
Ayrıştırma İ1b'de doğrulanmış desene çevrildi; yukarıdaki PASS bu düzeltmeden **sonraki**
koşumdur. İlk provanın alanı (`cl-acc-53b3ab18`) bağımsız ölçümle **kapalı** doğrulandı
(3/3 kullanıcı `isActive:false`, `activeUsers 0`).

---

## 7. Canlı komutlar (PowerShell) — onaydan SONRA

```powershell
$env:CL_ENVIRONMENT   = 'live'
$env:CL_OWNER_GO_REF  = '<owner GO ref>'          # owner verir; betik URETMEZ
$env:CL_DATABASE_URL  = 'postgresql://<user>:<pass>@127.0.0.1:5432/hukuk_db'
$env:CL_API_BASE_URL  = 'http://127.0.0.1:8080/api'   # CANLI API — olculdu, asagi bkz.
$env:CL_PRISMA_ROOT   = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/node_modules/@prisma/client'
$env:CL_BCRYPT_PATH   = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/node_modules/bcrypt'
$env:CL_RUN_ID        = '<8 hex — YAZMADAN ONCE belirlenir ve kayda gecer>'
$env:CL_STATE_FILE    = '<paket disi yol>\i8-state.json'
node .\project\docs\governance\client-live-acceptance-i8-r01\scripts\i8-run.js
```

**Yazmadan önceki kapılar** (hepsi betikte, hepsi otomatik):
G-0 ortam (`live` ise GO ref zorunlu) · G-1 slug öneki `cl-acc-` · G-2 tenant sahipliği ·
G-3 çakışma (`slug` zaten varsa **yazma yok**) · G-4 sır taraması.

**Login bütçesi:** 3 aktör + 1 doğrulama = 4 < 10/dk (`LoginRateLimitGuard`). **429 kanıt
sayılmaz**; gelirse ilgili iddia ÖLÇÜLEMEDİ olur ve koşum FAIL verir.

---

## 8. Başarısızlık kurtarma ve erişim kapatma

- Kapatma **her koşulda** denenir: `finally` bloğu, alt betiklerin çıkış kodundan **ve**
  ölçüm sonucundan bağımsız çalışır (İ5b dersi).
- Süreç zorla sonlandırılırsa `finally` çalışmayabilir. Kurtarma **yalnız runId** ile,
  durum dosyası veya parola olmadan:
  ```powershell
  $env:CL_RUN_ID='<runId>'; node .\project\docs\governance\client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js
  ```
  Bu çağrı tekrar-güvenlidir (`alreadyClosed=true`, exit 0) ve İ5b'de ölçülerek doğrulanmıştır.
- Kurulum COMMIT edilip durum dosyası yazılamazsa betik **exit 4** verir ve kurtarma komutunu
  basar; yürütücü yine de kapatmayı çağırır.
- **Kapanış doğrulanamazsa BAŞARILI verilmez** (`closureOk` + login 401 + tekrar şartı).
- Kanıt kayıtları **korunur**; başka alanlar temizlenmez, toplu silme yapılmaz.

---

## 9. Kapanış ölçütleri — İ8 ne zaman KAPANIR

| # | Ölçüt | Nasıl ölçülür |
|---|---|---|
| 1 | **B1** alan canlıda kurulu | `i8-01` 6/6 COMMIT + P-0v/u/e üç aktörün de login'i |
| 2 | **B2** yetkisiz denemede yazma 0 | U-1…U-4 dördü de PASS: HTTP reddi **+ satır değişmedi + audit değişmedi**; P-1/P-2 pozitif kontrolleri PASS (yoksa ölçüm boş sayılır) |
| 3 | **B3** erişim kapatma çalışıyor | `cl-09` sonrası login **401** + `cl-09` tekrarında `alreadyClosed=true` |
| 4 | İzolasyon | U-6 komşu tenant parmak izi değişmedi |
| 5 | İ1b korunumu | `cl-acc-afce215b` satır sayıları ve `activeUsers 0` **değişmemiş** (bağımsız ölçüm) |

Hiçbiri ÖLÇÜLEMEDİ olamaz; ölçülemeyen sonuç PASS sayılmaz.

---

## 10. Kapsam DIŞI

Deploy · migration · servis restartı · canlı flag değişikliği · gerçek alıcıya gönderim ·
`Office` satırı yazma · İ1b alanının yeniden açılması · `Case` yazma · silme ·
**İ9…İ15 başlatma**. Sayaç bu paketle **7/17**'dir; hizmet kabulü **0/8** tamdır.

---

## 11. ONAY TALEBİ

İstenen: **canlı sentetik alan kurulumu + yetkisiz deneme ölçümü + erişim kapatma** için
yazılı owner GO'su. Ref biçimi `OWNER-GO-CLIENT-I8-YYYYMMDD-Rnn`.
**Ref'i owner verir; bu paket ref üretmez ve varsayılmış ref ile koşmaz.**

---

## 12. NİHAİ UYGULAMA PAKETİ — tek sayfa

### 12.1 Canlı hedefin ölçülmüş kimliği (DÜZELTME)

Bu belgenin önceki turunda "canlı serviste dinleyici yok" denmişti; **o sonuç geri
çekilmiştir.** Yanlış portlara (3000/3001) bakılmıştı. Ölçülen gerçek durum:

| Bileşen | Hedef | PID | Çalıştırılan yol | Başlangıç |
|---|---|---|---|---|
| **Canlı API** | `http://127.0.0.1:8080/api` | 50716 | `HY_W4_RELEASE21/project/apps/api/dist/apps/api/src/main.js` | 2026-09-10 13:05 |
| **Canlı Web** | `http://127.0.0.1:3002` | 22440 | `HY_W4_RELEASE21/project/apps/web/node_modules/next/dist/bin/next start --port 3002` | 2026-09-09 18:15 |

Kaynak: `Win32_Process.CommandLine` (salt-okuma) + kayıtlı hedef bilgisi
(`reference_runtime_local_ports_and_auth_routes`: API `8080/api`, Web `3002`). Kayıt
`next dev` diyordu; **ölçülen komut `next start`** (prod build, `BUILD_ID g91HUaBesekB-R2rRawQj`).
**Servis başlatılmadı, yeniden başlatılmadı, durdurulmadı.**

### 12.2 İ8 — R02'deki tam ad ve kapanış ölçütü

> **İ8 — "Sentetik alanın canlı sürümde doğrulanması + erişim sonlandırma provası"** (R02:204,
> sınıf KAN, hizmet "tümü", 0,5 gün).
> Ölçüt: *"Alan canlıda kurulu; yetkisiz denemelerde yazma 0; erişim kapatma çalışıyor
> (**öncül: İ1b onayı**)"*

| Bacak | Durum | Dayanak |
|---|---|---|
| **B1** alan canlıda kurulu | İ1b kanıtıyla **KARŞILANDI** | `cl-acc-afce215b` canlıda 6 satır COMMIT; login 201 + `/auth/me` 200 ölçüldü |
| **B3** erişim kapatma çalışıyor | İ1b kanıtıyla **KARŞILANDI** | `cl-09` → login 401, eski JWT 401, tekrar `alreadyClosed` |
| **B2** yetkisiz denemede yazma 0 | **AÇIK — bu koşumun konusu** | İ1b paketinde yoktu |

### 12.3 Kalan senaryolar ve disposable sonuçları (11/11)

| # | Senaryo | Beklenen | R20 koşumu | R21 koşumu |
|---|---|---|---|---|
| P-0v/u/e | üç aktör oturum açabiliyor | 201 | OK | OK |
| P-0x | ölçüm geçerliliği: `user` ve `elevated` **aynı rolde**, fark yalnız PARTNER bağı | doğru | OK | OK |
| U-1 | VIEWER `{phone}` | 403 `CLIENT_MUTATION_DENIED_VIEWER` + satır ve audit değişmedi | OK | OK |
| U-2 | PARTNER bağı olmayan USER `{tckn}` | 403 `CLIENT_MUTATION_DENIED_SENSITIVE_FIELDS` + yazma 0 | OK | OK |
| U-3 | anonim | 401 + yazma 0 | OK | OK |
| U-4 | yabancı `cl-acc-` tenant kaydına yazma | ≥400 + **hedefte** satır ve audit değişmedi | OK | OK |
| P-1 | USER standart alan (`phone`) | yazılır (uç çalışıyor) | OK | OK |
| P-2 | PARTNER bağlı elevated hassas alan (`tckn`) | yazılır | OK | OK |
| U-6 | komşu tenant dağılım parmak izi | değişmedi | OK | OK |

**Toplam: PASS 11 · FAIL 0 · ÖLÇÜLEMEYEN 0** (her iki derlemede de).

### 12.4 Üç aktörün rol/yetki bağı

| Aktör | `User.role` | Ek bağ | Beklenen yetki |
|---|---|---|---|
| `viewer-<runId>@cl-acceptance.invalid` | **VIEWER** | yok | hiçbir client mutation'ı yapamaz |
| `user-<runId>@cl-acceptance.invalid` | **USER** | yok | standart alan yazar, **hassas alan yazamaz** |
| `elevated-<runId>@cl-acceptance.invalid` | **USER** | `Lawyer{lawyerRank:'PARTNER', userId}` | hassas alan **yazar** |

Yetki rol adından değil bağdan gelir: eşik `role==='ADMIN' \|\| isApproverEligible`
(`client-mutation-policy.ts`). `user` ile `elevated` **aynı roldedir**; ADMIN yolu ikisinde
de kapalıdır. P-0x bu kurgunun bozulmadığını her koşumda ölçer.

### 12.5 Betik kimlikleri (tam sha256)

| Dosya | sha256 |
|---|---|
| `client-live-acceptance-i8-r01/scripts/i8-01-setup.js` | `89FEE58EF484CDC31983A119B49FCC110D9F9C7A7AB93691FEA4B38FBE51AFD4` |
| `client-live-acceptance-i8-r01/scripts/i8-02-unauthorized.js` | `F7E82D02BF75BDAE53224652A5FE28163EF72F4032DECD58917037FD967537BA` |
| `client-live-acceptance-i8-r01/scripts/i8-run.js` | `489D4B4D2D235CD4EC99B53AE6CDE2FF9F6BDD1109EA745740821633BB1EF188` |
| `client-live-acceptance-i1b-r01/scripts/cl-lib.js` | `A1DCB89BCC6FFC6EBE34433C9DCFC786CAC0809EBDD4AF3B21CD9C272817F446` |
| `client-live-acceptance-i1b-r01/scripts/cl-09-close-access.js` | `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` |

Koşumdan önce bu beş değer diskte **ve** `origin/main` blob'unda doğrulanır; uyuşmazsa koşulmaz.

### 12.6 Kesin komut (canlı, onaydan sonra)

```powershell
$env:CL_ENVIRONMENT  = 'live'
$env:CL_OWNER_GO_REF = '<owner GO ref>'
$env:CL_DATABASE_URL = 'postgresql://<user>:<pass>@127.0.0.1:5432/hukuk_db'
$env:CL_API_BASE_URL = 'http://127.0.0.1:8080/api'
$env:CL_PRISMA_ROOT  = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/node_modules/@prisma/client'
$env:CL_BCRYPT_PATH  = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/node_modules/bcrypt'
$env:CL_RUN_ID       = '<8 hex — YAZMADAN ONCE belirlenir ve kayda gecer>'
$env:CL_STATE_FILE   = '<paket disi yol>\i8-state.json'
node .\project\docs\governance\client-live-acceptance-i8-r01\scripts\i8-run.js
```

### 12.7 Altı INSERT ve iki pozitif kontrol UPDATE'i

**INSERT (tek transaction, İ8'in KENDİ tenant'ında):**

| # | Tablo | Alanlar |
|---|---|---|
| 1 | `Tenant` | `slug='cl-acc-<runId>'`, `name='CL I8 <runId>'`, lifecycle **ACTIVE** |
| 2 | `User` | `viewer-<runId>@cl-acceptance.invalid`, `role=VIEWER`, `passwordHash` (bcrypt) |
| 3 | `User` | `user-<runId>@cl-acceptance.invalid`, `role=USER` |
| 4 | `User` | `elevated-<runId>@cl-acceptance.invalid`, `role=USER` |
| 5 | `Lawyer` | `lawyerRank='PARTNER'`, `userId=`(4) |
| 6 | `Client` | `type='PERSON'`, `name='CL I8 Client <runId>'`, **email YOK** |

**UPDATE (pozitif kontrol, kendi `Client` satırında):** `phone → '5550000002'` (P-1) ·
`tckn → '10000000146'` (P-2, sentetik ve checksum geçerli, **gerçek kişi verisi değil**).

**YAZILMAYAN:** `Case` · `CaseClient` (→ `updateRiskScores` hiçbir Case seçemez, kalıcı cron
maruziyeti **yapısal olarak 0**) · `Office` · `ClientContact`. **DELETE yoktur.**
`AuditLog` satırlarını ürün kendi yazar (P-1/P-2 başarılı olduğu için); silinmez.

### 12.8 Hata / yarıda kesilme kurtarması

| Durum | Davranış |
|---|---|
| Kurulum yarıda kesilirse | Tek transaction + EXPECTED kontrolü **transaction içinde** → ROLLBACK, **yetim satır 0** (`I8_ABORT_AFTER=user` ile ölçüldü) |
| Ölçüm FAIL/ÖLÇÜLEMEDİ verirse | `finally` kapatmayı **yine de** çağırır (çıkış kodundan ve ölçüm sonucundan bağımsız) |
| Süreç zorla sonlanırsa | `finally` çalışmayabilir → kurtarma **yalnız runId** ile: `$env:CL_RUN_ID='<runId>'; node .\project\docs\governance\client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js` (tekrar-güvenli, İ5b'de ölçüldü) |
| Durum dosyası yazılamazsa | Betik **exit 4** verir ve kurtarma komutunu basar; yürütücü kapatmayı yine çağırır |
| Tenant çakışması / hedef uyuşmazlığı | G-1/G-2/G-3 kapıları → **hiçbir yazma yapılmaz** |
| Kapanış doğrulanamazsa | **BAŞARILI verilmez** (`closureOk` + login 401 + tekrar şartı) |

### 12.9 Üç aktörün erişiminin ve token'larının kapatılması

`cl-09-close-access.js` her üç `User` satırında **`isActive=false`** yazar **ve
`tokenVersion`'ı bir artırır**. `auth.service.ts` login yolunda `isActive` kontrolü, korumalı
uçlarda ise `tokenVersion` karşılaştırması vardır → **o ana kadar dağıtılmış JWT'ler de
geçersizleşir**. Ölçüm: kapatma sonrası login **401**, eski JWT ile `/auth/me` **401**;
disposable koşumlarda 3/3 aktör `isActive:false`, `tokenVersion:1` (0→1) olarak doğrulandı.
İkinci çağrı `alreadyClosed=true / usersDeactivated=0 / exit 0` verir.

### 12.10 Korunacaklar

`cl-acc-afce215b` (İ1b alanı) **KORUNUR**: yeniden açılmaz, kullanıcısı aktifleştirilmez,
`Case`'i ACTIVE'e çekilmez. Oradaki tek dokunuş U-4'ün **reddedilmesi ölçülen** yazma
denemesidir (yazma 0, audit dahil). Disposable prova alanları ve §6'daki RELEASE20 sonuçları
**tarihsel kanıt** olarak korunur.
