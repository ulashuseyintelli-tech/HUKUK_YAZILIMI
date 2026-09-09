# OFFICE A-03…A-07 — Canlı Kabul Koşum Planı (R01, **R02 eki ile**)

**Durum:** HAZIRLIK — koşum **BAŞLAMADI** ve bu belge koşum yetkisi **ÜRETMEZ**
**Ön koşul:** cutover tamamlanmış olacak; pencereyi ana yürütücü ilan edecek
**Kapsam:** A-03 · A-04 · A-05 · A-06 · A-07 canlı kabul koşumunun sırası, yazma envanteri,
bayrak yönetimi ve geri alma adımları
**R02 eki (2026-09-08):** §3.3 kesinti sonucu + iki seçenek · §3.4 yeniden başlatma
doğrulaması · §3.5 bayrağın yetki yerine geçmediğinin pozitif ölçümü
**R03 eki (2026-09-08):** owner **(a)'yı seçti ve pencereyi DARALTTI** — bayrak yalnız
**A-07 yürütme adımı** için açılır (§1 tablosu 5a–5d, §3.1, §3.2 `finally`, §3.6 dört kalem)

> **Bu belge bir kabul satırı KAPATMAZ.** İzole prova başarısı canlı kapanış sayılmaz.
> A-07 için tamamlanmış olan yalnız **uygulama ve izole prova**dır (`2187a78b`); A-07'nin
> kabul satırı **canlı sentetik tenant'ta gerçek yürütme iziyle** dolacaktır.

---

## 1. Koşum sırası — tek oturum, tek sentetik tenant

Tümü **aynı** `off-acc-<runId>` tenant'ında ve **tek yürütücü** altında koşar
(`ow-run.js`; parolalar yalnız bellekte, kapanış `finally` yolunda, **çıkış kodu beyaz
listesi YOK**).

| Sıra | Adım | **Bayrak** | Ön koşul | Çıktı |
|---|---|---|---|---|
| 0 | **Kurulum** (9 satır, atomik) | **KAPALI** | G-0 ortam kapısı + G-0b API/DB bağı doğrulandı; izlenen tenant kümesi **boş değil** | `ow-state.json` (sır içermez) |
| 1 | **A-03** ayar yüzeyi PUT (S-01…S-08) | **KAPALI** | kurulum COMMIT | Office satırında yalnız hedef alan değişir; banka hesabı net 0 |
| 2 | **A-04** avukat + personel yazma | **KAPALI** | A-03 bitti | avukat/personel oluştur→güncelle→sil, net 0 |
| 3 | **A-05** personel okuma | **KAPALI** | A-04'ün personeli mevcut | yazma YOK |
| 4 | **A-06** raporlama hattı | **KAPALI** | iki kullanıcı mevcut | 1 `ReportingLine` (assign→end, **kayıt korunur**) |
| 5a | **A-07 HAZIRLIK** — aktörler, `Case` + `OfficeApprovalRequest` fixture'ı, ölçüm hazırlığı | **KAPALI** | A-06 bitti | fixture hazır; hiçbir yürütme yapılmadı |
| 5b | **BAYRAK AÇ** + API restart | KAPALI → **AÇIK** | 5a tamam | §3.4 doğrulaması geçti |
| 5c | **A-07 yürütme adımı** | **AÇIK** | 5b doğrulandı | yürütme izi + kesin bağ |
| 5d | **BAYRAK KAPAT** + API restart | AÇIK → **KAPALI** | her hâlükârda (`finally`) | uç **403** döner (§3.4) |
| 6 | **Kapanış** `revoke-access` | KAPALI | her hâlükârda (`finally`) | `User` satırlarında 2 alan |

> **Bayrak penceresi YALNIZ 5b–5d arasıdır** (owner kararı). A-03…A-06 ve A-07'nin
> **hazırlığı** bayrak KAPALIYKEN koşar — kontrollü uca ihtiyaçları yoktur. Pencere böylece
> tüm kabul koşumu değil, **yalnız A-07'nin yürütme adımı** kadardır.

**Neden bu sıra:** A-05 A-04'ün ürettiği personeli okur; A-06 kurulumun iki kullanıcısını
kullanır; A-07 en son gelir çünkü tek geri alınamayan adımdır (yürütme izi korunur).

---

## 2. Yazma envanteri — **ÜÇ AYRI KATEGORİ**

> **Satır sayısı ile güncelleme işlemi sayısı KARIŞTIRILMAZ.** `OfficeApprovalRequest`
> yürütme boyunca **iki kez güncellenir** ama **bir** satırdır.

### 2.1 Kurulum — **9 YENİ SATIR** (tek transaction, atomik)
`Tenant` · `Office` · `User`(ADMIN, F01 pozitif) · `Lawyer`(PARTNER) · `User`(personel,
F01 negatif) · `StaffMember` · `Lawyer`(ikinci) — **7 satır**
\+ **A-07 ön satırları: 2** → `Case` (zorunlu alanlar yalnız `tenantId`+`fileNumber`+`type`;
`clientId` **opsiyonel**, Client zinciri GEREKMEZ) ve `OfficeApprovalRequest`
(`CHANGE_STATUS`/`LegalCase`, `APPROVED`, `savedIntent`).

**Case'in `caseStatus` varsayılanı `DERDEST`; intent hedefi bundan FARKLI seçilir** —
aksi halde K5 staleness devreye girer (`caseStatus zaten hedef` → STALE) ve **yürütme izi
hiç oluşmaz**.

#### 2.1.1 A-07 ön koşul kontrol listesi — **yürütme izinin oluşmadığı BEŞ yol**

Kaynakta doğrulandı (`apps/api/src/modules/office-approval/office-approval-executor.service.ts`,
aday `2187a78b`). **Kritik ayrım görünürlüktür:** ilk iki satır isteği *başarılı gösterir*.

| # | Koşul | Davranış | Görünürlük |
|---|---|---|---|
| **K5** | `case` YOK **∨** `caseStatus` **zaten** `intent.status` (`:193`) | `markExecutionStale` → `STALE` | ⚠ **SESSİZ** — 2xx döner, iz YOK |
| **—** | `savedIntent` şekil-geçersiz / bozuk `CHANGE_STATUS` (`:105`) | `markExecutionFailed` → `FAILED` | ⚠ **SESSİZ** — 2xx döner, iz YOK |
| **K6** | `executionStatus ≠ NOT_RUN` (`:85`) | `ConflictException` | **409** — gürültülü |
| **K3** | eşzamanlı/çift claim; `NOT_RUN→RUNNING` CAS (`:111`) | `ConflictException` | **409** — gürültülü |
| **—** | `approverUserId` boş (bozuk/legacy satır) (`:94`) | `ConflictException` | **409** — gürültülü |

**Neden önemli:** iki SESSİZ yolda `execute` başarılı görünür, ama `CaseStatusHistory` üzerinde
`approvalRequestId`/`approvalAttempt` bağı **hiç yazılmaz**; `reconcile` bu bağı arayamadığı için
**`BELİRSİZ`** döner (`EXECUTION_EVIDENCE_NOT_FOUND`) ve **A-07 sessizce kapanamaz**. Yanlış başarı
değil — *ölçülemezlik*. A-07'nin ıskalanmasının en olası yolu budur.

**Fixture zorunlulukları (koşumdan önce tek tek doğrulanır):**

1. `Case.caseStatus` **DERDEST dışı** bir başlangıç **VE** `intent.status` bundan **farklı**.
2. `OfficeApprovalRequest.executionStatus` = **`NOT_RUN`** (fixture yeniden kullanılmaz).
3. `approverUserId` **dolu** (`APPROVED`/`APPROVED_WITH_CHANGES` yolundan gelmiş olmalı).
4. `savedIntent` **şekil-geçerli** (`status` ∈ `LegalCaseStatus`).
5. **Her `execute` denemesi TEK KEZ** koşulur; K6 fixture'ı tüketir.

**409 kuralı:** `409` alınırsa *"zaten yapıldı"* **VARSAYILMAZ**. İz doğrudan aranır
(`CaseStatusHistory` üzerinde `approvalRequestId` = talep id **VE** `approvalAttempt` = `retryCount`).
Bulunamazsa sonuç **ÖLÇÜLEMEDİ**'dir; PASS **değildir**.

### 2.2 Yürütme — **4 YENİ SATIR + 2 FARKLI MEVCUT SATIR güncellemesi**
**Yeni satırlar (4):** `AuditLog` ×2 (`OFFICE_APPROVAL_EXECUTION_STARTED` + `..._SUCCEEDED`)
· `CaseStatusHistory` ×1 (bağ alanları dolu) · `DecisionLog` ×1.

**Güncellenen mevcut satırlar (2 SATIR, 3 güncelleme işlemi):**
`OfficeApprovalRequest` — **bir satır, iki kez** güncellenir (claim: `NOT_RUN→RUNNING` +
`runningStartedAt`; terminal: `→SUCCEEDED` + `executedAt`) · `Case` — **bir satır, bir kez**
(`caseStatus`, `isAutomationEnabled`, `nextActionAt`).

**Yan etki YOK (ölçüldü):** `case-status.service.ts` içinde notification/timeline/outbox
referansı **0**; `Case`/`CaseStatusHistory`/`DecisionLog` üzerinde **DB tetikleyicisi yok**.
Bu yolda **silinemeyen kayıt üretilmez**.

### 2.3 Kapanış — **AYRICA sayılır**
`revoke-access`: sentetik `User` satırlarında `isActive=false` + `tokenVersion++`.
**2 kullanıcı × 2 alan.** Finansal/audit/yürütme kayıtlarına **dokunulmaz** ve bu doğrulanır.

---

## 3. Bayrak yönetimi — `OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED`

| Kalem | Ölçülen gerçek |
|---|---|
| **Dosya/mekanizma** | Canlı API `.env` (`<release>/project/apps/api/.env`). `AppModule` `ConfigModule.forRoot({ isGlobal: true })` kullanıyor ve `ignoreEnvFile` **yok** → `.env` **boot'ta** `process.env`'e yüklenir. |
| **Yeniden başlatma** | **GEREKLİ.** Servis `process.env`'i her çağrıda okur (boot'ta önbelleğe **almaz**), ama çalışan bir sürecin `process.env`'i spawn anında sabitlenir → değer ancak **API yeniden başlatılınca** değişir. |
| **Etkilenen süreçler** | Yalnız API süreci. Web (Next) süreci ve cron davranışı **etkilenmez** — bayrak `OFFICE_APPROVAL_EXECUTOR_ENABLED`'dan **bağımsızdır** ve genel cron'u açıp kapatmaz. |
| **Varsayılan** | KAPALI (yokluk dahil). **Bayrak açıkken de** ADMIN + F01 + sunucuda çözülen tenant/ofis + kapsam kontrolleri zorunludur; bayrak yetki yerine geçmez. |

### 3.1 Açma adımları — **yalnız A-07 yürütme adımından hemen önce**

**Bayrak RELEASE21 normal başlangıcında KAPALIDIR** ve A-03…A-06 ile A-07 hazırlığı boyunca
**kapalı kalır** (owner kararı). Açma, ancak aşağıdakiler tamamlandıktan sonra yapılır:

1. Cutover tamamlanmış ve koşum penceresi ana yürütücü tarafından **ilan edilmiş** olacak.
2. A-03…A-06 koşulmuş; **A-07 aktörleri, fixture'ı ve ölçümleri hazırlanmış** olacak (5a).
3. `.env`'e `OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED=true` eklenir (**tek satır**;
   başka anahtar değiştirilmez).
4. API yeniden başlatılır; **eski dinleyicinin gerçekten öldüğü** ve yeni PID doğrulanır (§3.4).
5. Ardından **yalnız** A-07 yürütme adımı (5c) koşar.

### 3.2 GERİ ALMA adımları — **`finally` yolunda; BAŞARISIZLIKTA DA yürütülür**

> Owner şartı: *"Başarısızlık hâlinde de kapatma ve erişim sonlandırma adımları yürütülsün."*
> Bayrak kapatma, `revoke-access` ile **aynı disiplindedir**: A-07 ortasında hata olsa,
> süreç kesilse veya ölçüm düşse bile **bayrak kapatılır ve erişim sonlandırılır**.
> Kapatma kararı çıkış koduna **değil**, "bayrak şu an açık mı" ölçümüne dayanır.
1. `.env`'den satır **kaldırılır** (veya `=false` yapılır — kaldırmak tercih edilir: yokluk
   zaten fail-safe kapalıdır).
2. API yeniden başlatılır; yeni PID doğrulanır.
3. **Doğrulama:** kontrollü uca istek → **403 `OFFICE_APPROVAL_CONTROLLED_EXECUTION_DISABLED`**.
   Bu doğrulanmadan koşum kapanmış sayılmaz.
4. Geri alma **başarısız olsa bile** sentetik hesapların erişimi `revoke-access` ile
   kapatılmış olacağı için uç **yetkisiz aktörle kullanılamaz**; yine de bayrak açık
   bırakılmaz ve durum **açıkça raporlanır**.

> Bu üç kalem (dosya/mekanizma · yeniden başlatma · geri alma) **paket envanterine** girer.

### 3.3 ⚠ KESİNTİ SONUCU — bu koşum **kendi kesintisini üretir**

Bayrağın yalnız yeniden başlatmayla değişebilmesinin doğrudan bir işletme sonucu vardır:
**bayrağı açmak bir API yeniden başlatması, kapatmak bir tane daha.** Yani canlı kabul,
cutover'ın kesintisine **ek olarak** kısa kesinti(ler) doğurur.

> Bu kalem **yayın paketinin kesinti/kilit bütçesine** girer. Owner kesinti bütçesini
> onaylarken bunu görmelidir. Aşağıdaki iki seçenek sunulur; **seçim owner'ındır.**

> ⚠ **Aşağıdaki tablo, owner'a SUNULAN seçeneklerin tarihsel kaydıdır.** (a) satırındaki
> akış, owner'ın seçtiği NİHAİ akış **DEĞİLDİR** — owner (a)'yı seçip pencereyi daha da
> daralttı. **Uygulanacak akış §1 tablosu (5a–5d) ve §3.1'dir.** Bu tabloyu bağlamından
> kopararak alıntılamayın; hemen altındaki KARAR kutusuyla birlikte okuyun.

| | **(a) Dar pencere** — iki ek yeniden başlatma | **(b) Tek ek yeniden başlatma** |
|---|---|---|
| Akış (**sunulan hâli — nihai değil**) | Cutover bayrak **yokken** yapılır → bayrak aç + restart → A-03…A-07 → bayrak kaldır + restart | Bayrak cutover'ın `.env`'ine konur → cutover'ın **kendi** restart'ı etkinleştirir → A-03…A-07 → bayrak kaldır + restart |
| Ek kesinti | **2** | **1** |
| Ucun canlıda etkin kaldığı süre | Yalnız kabul penceresi — **en dar** | Cutover anından kabul bitene kadar — **daha geniş** |
| Owner lafzıyla uyum | "Varsayılan KAPALI + **kontrollü açılma**" ifadesine daha yakın | "Kontrollü açılması ve koşum sonunda kapatılması" ifadesiyle **gerilimli** |

**Bu belgenin tavsiyesi: (a).** Gerekçe: kontrollü uç yalnız kabul penceresinde canlıda
etkin olur; güvenlik yüzeyi en dar tutulur.

> ### ✅ KARAR (owner, 2026-09-08): **(a) SEÇİLDİ — ve pencere daha da DARALTILDI**
>
> Owner (a)'yı seçti, ama tarif ettiği pencere yukarıdaki (a)'dan **daha dardır**:
> bayrak **RELEASE21 normal başlangıcında kapalı** olacak ve **A-03…A-06 ile A-07
> hazırlığı boyunca kapalı kalacak**; yalnız **A-07 yürütme adımı** için açılıp hemen
> sonra kapatılacak (§1 tablosu 5a–5d ve §3.1 buna göre yazıldı).
>
> Bu, bu belgenin ilk (a) tarifinden bir **daraltmadır** ve owner'ın tercihidir:
> ilk tarif bayrağı tüm kabul koşumu boyunca açık bırakıyordu.
>
> **Bu seçim hazırlık kararını kapatır.** Bayrak seçimi yeniden sorulmaz. Somut yayın
> paketi **ratifiye edilmeden** canlı bayrak değişimi veya koşum **başlatılmaz**.

### 3.4 Her yeniden başlatmanın **kendi doğrulaması** vardır

"Restart yaptım" **yeterli değildir**; her yeniden başlatmadan sonra ölçülür:

1. **Yeni PID** — eski dinleyicinin gerçekten öldüğü ve PID'in değiştiği.
2. **Port dinlemede** — API isteğe yanıt veriyor.
3. **Bayrağın beklenen durumu UÇTAN teyit edilir** — `.env`'e bakmak yetmez:
   - açma sonrası: kontrollü uç **yetkili aktörle çalışır** (A-07 adımının kendisi kanıttır),
   - kapatma sonrası: kontrollü uç **403 `OFFICE_APPROVAL_CONTROLLED_EXECUTION_DISABLED`** döner.

### 3.5 Bayrağın **yetki yerine geçmediği** POZİTİF olarak ölçülür

Bayrak **AÇIKKEN** yetkisiz aktörle kontrollü uç çağrılır ve **reddedildiği** gösterilir:

| Aktör | Beklenen |
|---|---|
| `staffMember` bağlı kullanıcı (F01 negatif) | **403** |
| ADMIN olmayan yetkili avukat | **403** (`..._ADMIN_REQUIRED`) |
| Anonim | **401** |

Bu ölçüm olmadan "bayrak yetki yerine geçmez" iddiası **kanıtlanmış sayılmaz** — yalnız
kodda böyle yazması yeterli değildir.

### 3.6 Pakete yazılacak dört kalem (owner ismen sıraladı)

| # | Kalem | Değer |
|---|---|---|
| 1 | **Restart sayısı** | **2** — biri açma (5b), biri kapatma (5d). Başarısızlık hâlinde de kapatma restart'ı yürütülür, yani **en az 2** her koşumda. |
| 2 | **Etkilenen süreçler** | **Yalnız API süreci.** Web (Next) süreci ve genel cron davranışı etkilenmez — bayrak `OFFICE_APPROVAL_EXECUTOR_ENABLED`'dan bağımsızdır ve genel cron'u açıp kapatmaz. |
| 3 | **Toplam kesinti bütçesi** | **Ölçülen başlangıç→hazır: ~3,3 s** (izole ortamda iki örnek: **3264 ms** ve **3271 ms**; ölçüt: `POST /api/auth/login` boş gövdeye **400** dönene kadar). Buna **kapatma süresi eklenir**. İki restart için **beklenen toplam ≈ 7–10 s**; **güvenli tavan 60 s** önerilir. ⚠ Bu ölçüm **izole ortamda** alınmıştır; canlıda soğuk dosya sistemi ve daha büyük veri nedeniyle farklı olabilir — **canlı değer koşum sırasında ölçülüp rapora yazılacaktır**, bu satır tahmin değil **baz çizgidir**. |
| 4 | **Toparlanma ölçütü** | Bir restart "başarılı/sağlıklı" **ancak şu üçü birlikte** sağlanınca sayılır: **(i)** eski dinleyici süreci **gerçekten ölmüş** ve PID **değişmiş**; **(ii)** port dinlemede ve `POST /api/auth/login` boş gövdeye **400** dönüyor (uygulama yalnız ayakta değil, **istek işliyor**); **(iii)** bayrağın beklenen durumu **uçtan** teyit edilmiş (açma sonrası uç yetkili aktörle çalışır; kapatma sonrası **403 `OFFICE_APPROVAL_CONTROLLED_EXECUTION_DISABLED`**). Üçünden biri sağlanmazsa restart **başarısız** sayılır ve koşum **durur**. |

> Owner şartı: *"Kapanışı yalnız env dosyasından değil, çalışan süreç ve kontrollü ucun
> reddetme davranışı üzerinden doğrulayın."* — §3.4 bunu zaten karşılar; §3.2 gereği
> **başarısızlık yoluna da** uygulanır.

---

## 4. Pin penceresi kısıtı (bağlayıcı)

Koşum `off-acc-<runId>` tenant'ı + aktör kullanıcıları **yaratır** → canlı paket
`dbSnapshot` pin'ini **oynatır**. Bu yüzden:

- Canlı kabul **cutover tamamlandıktan SONRA** başlar.
- Pencereyi **ana yürütücü ilan eder**; ilandan önce canlıya **yazma yapılmaz**.
- Pin ölçümü ile mühür arasındaki pencerede canlıya tenant/kullanıcı yaratan **hiçbir iş**
  koşturulmaz.
- İzole ortamda (disposable @5439) bu kısıt **yoktur**.

---

## 5. A-07 canlı adımı — kapsam ve **yasak**

**Ön koşul:** fixture **§2.1.1 kontrol listesini** geçmeden bu adım başlatılmaz.

**Yapılacak:** `CHANGE_STATUS`/`LegalCase` fixture'ı hazırlanır → kontrollü uçtan
`POST /office-approvals/:id/execute` → yürütme izi doğrulanır:
`OFFICE_APPROVAL_EXECUTION_STARTED` + `..._SUCCEEDED` · `executionStatus`
`NOT_RUN→RUNNING→SUCCEEDED` · `CaseStatusHistory` satırında
**`approvalRequestId` = talep id VE `approvalAttempt` = claim anındaki `retryCount`** ·
`DecisionLog` · `Case.caseStatus` hedefe eşit.

Ardından **reconcile senaryosu**: hedefli `POST /office-approvals/:id/reconcile` çağrılır ve
**kesin bağın bulunduğu**, işlemin **yeniden uygulanmadığı** doğrulanır.

**YASAK — canlıda YAPILMAZ:** kesinti enjeksiyonu. Commit-sonrası-kesinti senaryosu **yalnız
izole provada** kalır (orada koşuldu). Canlıda yalnız normal yürütme ve kanıt doğrulaması
yapılır.

**Ayrıca canlıda yapılmaz:** `purge` (yasak) · geriye dönük `approvalRequestId` doldurma ·
genel cron davranışına müdahale · `isF01ActorAuthorized` değişikliği.

---

## 6. Kapanış

`revoke-access` **varsayılan ve tek** canlı kapanış modudur; `finally` yolunda çalışır ve
**envanter hatası kapanışı engellemez**. Kapatma kararı çıkış koduna değil **"tenant gerçekten
var mı"** ölçümüne dayanır. `purge` canlıda **YASAK**.

**Kapanış doğrulaması:** `isActive=false` · `tokenVersion` arttı · `account-recovery/find-tenants`
→ `NONE` (kimlik bilgisi gerektirmeyen ayırt edici kanıt) · finansal/audit/yürütme kayıtları
**korundu**. Doğrulanamazsa sonuç **"kapanış DOĞRULANAMADI"** olarak raporlanır, sessiz geçilmez.

---

## 7. A-03…A-06 — provada düzeltilen kusurlar canlıda da geçerli

İzole provada (`91151957`) harness'ın **altı** kusuru yakalanıp düzeltildi; canlı koşum
**düzeltilmiş** harness ile yapılır ve aşağıdakiler canlıda da doğrulanır:

1. **Boş izleme kümesi → HARD FAIL** (canlıda gerçek komşu tenant'lar izlenir; seyirci
   tenant **gerekmez** ve kurulmaz).
2. "Hedef alan yazıldı" ölçütü **gönderilen değere eşitlik**tir (aynı-boolean kusur değildir).
3. Banka hesabı id'si yanıt şeklinden **türetilmez**.
4. Cross-tenant ölçütleri gerçek komşularla ölçülür (boş küme PASS sayılmaz).
5. **Login rate limit**: tek yürütücü oturumu **bir kez** açar (kilit `BLOCK_DURATION_MS`
   = **5 dakika**; adım başına login **yapılmaz**), sunucunun `retryAfter` değerine uyulur.
6. G-0b `429`'u **"yanlış DB"** diye raporlamaz; ayırt eder ve dürüstçe yazar.

A-03…A-06 kabul ölçütlerinin kendisi **A-02 §4**'tedir ve bu belge onları değiştirmez.

---

## 8. Sınırlar

- Bu belge **koşum yetkisi üretmez**; canlı kabul ayrı ve açıktır.
- **A-07 TAMAMLANMADI** — tamamlanan yalnız uygulaması ve izole provasıdır.
- Aday SHA **`2187a78b`**; kabul bayrağı canlıda **açılmadı**.
- **AK-1c residual'i AÇIK**: avukat bağı olmayan ADMIN'de ofis karşılaştırması yapısal olarak
  atlanır; kontrollü uçtaki doğrulama bunu **kapatmaz** ve kapattığı **iddia edilmez**.
- **IMPLEMENTATION AUTHORITY: NONE. PRODUCTION AUTHORITY: NONE.**
