# OFFICE A-03…A-07 — Canlı Kabul Koşum Planı (R01)

**Durum:** HAZIRLIK — koşum **BAŞLAMADI** ve bu belge koşum yetkisi **ÜRETMEZ**
**Ön koşul:** cutover tamamlanmış olacak; pencereyi ana yürütücü ilan edecek
**Kapsam:** A-03 · A-04 · A-05 · A-06 · A-07 canlı kabul koşumunun sırası, yazma envanteri,
bayrak yönetimi ve geri alma adımları

> **Bu belge bir kabul satırı KAPATMAZ.** İzole prova başarısı canlı kapanış sayılmaz.
> A-07 için tamamlanmış olan yalnız **uygulama ve izole prova**dır (`2187a78b`); A-07'nin
> kabul satırı **canlı sentetik tenant'ta gerçek yürütme iziyle** dolacaktır.

---

## 1. Koşum sırası — tek oturum, tek sentetik tenant

Tümü **aynı** `off-acc-<runId>` tenant'ında ve **tek yürütücü** altında koşar
(`ow-run.js`; parolalar yalnız bellekte, kapanış `finally` yolunda, **çıkış kodu beyaz
listesi YOK**).

| Sıra | Adım | Ön koşul | Çıktı |
|---|---|---|---|
| 0 | **Kurulum** (9 satır, atomik) | G-0 ortam kapısı + G-0b API/DB bağı doğrulandı; izlenen tenant kümesi **boş değil** | `ow-state.json` (sır içermez) |
| 1 | **A-03** ayar yüzeyi PUT (S-01…S-08) | kurulum COMMIT | Office satırında yalnız hedef alan değişir; banka hesabı net 0 |
| 2 | **A-04** avukat + personel yazma | A-03 bitti | avukat/personel oluştur→güncelle→sil, net 0 |
| 3 | **A-05** personel okuma | A-04'ün personeli mevcut | yazma YOK |
| 4 | **A-06** raporlama hattı | iki kullanıcı mevcut | 1 `ReportingLine` (assign→end, **kayıt korunur**) |
| 5 | **A-07** onay akışı + kontrollü yürütme | Case + `OfficeApprovalRequest` fixture'ı; **bayrak açık** | yürütme izi + kesin bağ |
| 6 | **Kapanış** `revoke-access` | her hâlükârda (`finally`) | `User` satırlarında 2 alan |

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

### 3.1 Açma adımları
1. Koşum penceresi ilan edilmiş ve cutover tamamlanmış olacak.
2. `.env`'e `OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED=true` eklenir (**tek satır**;
   başka anahtar değiştirilmez).
3. API yeniden başlatılır; **eski dinleyicinin gerçekten öldüğü** ve yeni PID doğrulanır.
4. Bayrağın etkin olduğu, A-07 adımının kendisiyle doğrulanır (ayrı bir "flag probe" isteği
   **gerekmez**; kapalıyken uç zaten 403 döner).

### 3.2 GERİ ALMA adımları (koşum sonunda **zorunlu**)
1. `.env`'den satır **kaldırılır** (veya `=false` yapılır — kaldırmak tercih edilir: yokluk
   zaten fail-safe kapalıdır).
2. API yeniden başlatılır; yeni PID doğrulanır.
3. **Doğrulama:** kontrollü uca istek → **403 `OFFICE_APPROVAL_CONTROLLED_EXECUTION_DISABLED`**.
   Bu doğrulanmadan koşum kapanmış sayılmaz.
4. Geri alma **başarısız olsa bile** sentetik hesapların erişimi `revoke-access` ile
   kapatılmış olacağı için uç **yetkisiz aktörle kullanılamaz**; yine de bayrak açık
   bırakılmaz ve durum **açıkça raporlanır**.

> Bu üç kalem (dosya/mekanizma · yeniden başlatma · geri alma) **paket envanterine** girer.

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
