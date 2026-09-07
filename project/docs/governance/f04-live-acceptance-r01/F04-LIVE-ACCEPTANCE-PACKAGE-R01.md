# F04 CANLI KABUL PAKETİ — R01 (revizyon **R03**: kalan hata yolları)

```text
DURUM             : R03 ONARIMI PROVASI GEÇTİ / CANLI ÇALIŞTIRMA ONAYI BEKLİYOR
KABUL KAPSAMI     : **posting'in kilit beklemesi ve finansal sonucu**
                    (bütün F04 yarış kabulü DEĞİLDİR — §5)
KAYNAK            : owner GO "kalan hata yollarını tamamla / canlı yazma yok" (2026-09-07)
HEDEF SÜRÜM       : RELEASE20 — canlı kaynak 08ce8e2559b4d1d67fcee245413de510209507f3
CANLIDA YAPILAN   : HİÇBİR ŞEY — bu tur da canlı tenant/finansal kayıt OLUŞTURMADI
CANLI DB          : ölçüldü, prova öncesi/sonrası `changed: 0` — "CANLI DB DEĞİŞMEDİ"
IMPLEMENTATION AUTHORITY: NONE — bu belge canlı çalıştırma yetkisi ÜRETMEZ
```

> `FOR NO KEY UPDATE` kilidi ve kapanmış F04 uygulaması (#2512) **değiştirilmedi**. Canlı API'ye
> prototype/bariyer enjeksiyonu, servis değişikliği ve yeniden deployment **yok**. PR #2543'e
> dokunulmadı.

## R03'te tamamlanan hata yolları

| # | Kalan kusur | Onarım |
|---|---|---|
| 1 | Bütçe yalnız gözlemi kapsıyordu | Bütçe kilit alındıktan sonraki **bütün** işlemleri kapsar; her adımda `assertWithinBudget` |
| 2 | DB korumaları bütçeden gevşekti (`lock_timeout` sabit 5 s, idle bütçe+15 s) | **Bütçeyle uyumlu**: `lock_timeout` = bütçe, `statement_timeout` ve `idle_in_transaction_session_timeout` = bütçe + tolerans |
| 3 | Süre aşımı sessiz kalabiliyordu | Kilit bütçe+tolerans üzerinde tutulursa `A2-BUDGET` **FAIL** — süre aşımı PASS sayılmaz |
| 4 | Kilit sonlanması dolaylı ölçülüyordu | `pg_stat_activity` ile **doğrudan** doğrulama (oturum/`xact_start`/bloke edilen) — **başarı ve hata yollarının ikisinde de** |
| 5 | Erişim sonlandırma yalnız başarılı akışta | **Tek yürütücü** `f04-run.js`; `finally` bloğunda çalışır — kurulum/A2/doğrulama başarısız olsa da hesap kapanır |
| 6 | State yazılamazsa akış kopuyordu | Yürütücü `runId` ile kurtarır ve kapatmayı yine yapar |
| 7 | Envanter ölçüm hatası kapatmayı engelliyordu | Envanter yalnız rapor; ölçülemezse **kapatma yine yürür**, sonuç `EKSİK - kapanış DOĞRULANAMADI` diye raporlanır |
| 8 | Parola stdout'a basılıyordu | **Hiç basılmaz**: yürütücü bellekte üretip alt sürecin ortamına geçirir; state'e de yazılmaz |
| 9 | Belirsiz sonuçta POSTED değilse "gerçekleşmedi" deniyordu | Tamamlanma kanıtı yoksa sonuç **BELİRSİZ bırakılır**; POST **tekrarlanmaz** |

## R02'de düzeltilenler

| # | Kusur | Onarım |
|---|---|---|
| 1 | Gözlem ve kilit tutma **ayrı** bütçelerdeydi; gözlem gecikirse kilit uzardı | **Ortak süre bütçesi**: kilidin alındığı andan başlar, gözlem + tutmayı birlikte kapsar; dolunca transaction kapanır. Tek bir gözlem sorgusu bile bütçeyle yarıştırılır |
| 2 | Ön koşul FAIL olsa da posting gönderiliyordu | Ön koşul FAIL → **posting başlatılmaz**, yazma denemesi yok |
| 3 | Gözlem hatası "kilit/bildirim yok"a dönüşüyordu | **Fail-closed**: ölçülemeyen zorunlu sonuç `OLCULEMEDI` olarak FAIL eder ve sıfırdan farklı çıkar |
| 4 | İstemci timeout'u başarısızlık sayılıyordu | HTTP timeout sunucu işlemini **iptal etmez**: sonuç `BELIRSIZ` işaretlenir, kalıcı durumdan salt-okuma **uzlaştırılır**, **tekrar gönderim yok** |
| 5 | Finansal doğrulama yüzeyseldi | Journal **türü/sayısı**, satır **tutarları/para birimi/hesap kodları/dengesi**, **kaynak+idempotency bağı**, **APPLY tutarı**, **doğru audit olayı** |
| 6 | Kurulum 11 ayrı yazma; yarıda kesilirse yetim kayıt | **Atomik** (tek transaction) |
| 7 | Commit sonrası durum dosyası yazılamazsa koşum kaybolurdu | **Kurtarılabilir `runId`** (8 hex, sır içermez, slug'a gömülü) + `f04-00-recover-state.js`; yazılamazsa nonzero çıkış |
| 8 | Parola durum dosyasında düz JSON'daydı | Parola **saklanmaz**; `F04_LOGIN_PASSWORD` ile verilir, üretilirse bir kez stdout'a basılır |
| 9 | Sentetik hesabın erişimi açık kalıyordu | **`revoke-access`** modu: `isActive=false` + `tokenVersion++`; finansal/audit kanıt **korunur** |
| 10 | `purge`/`reverse` canlıda çalışabilirdi | **Canlı kapsam dışı**: `F04_ENVIRONMENT` verilmezse ortam **live** sayılır ve ikisi de reddedilir |

---

## 1. Hedef sentetik alan

`demo-firma` **kullanılmaz** (PR #2542: gerçek ofisle paylaşılan kullanıcı domainleri, 7 aktörün
audit izi, canlı muhasebe akışı). `c36-smoke-principal`, `c36-smoke-principal-2`,
`local-development-office` **kullanılmaz** (başka programların ölçüm alanları). Paket kendi
tenant'ını üretir: `f04-acc-<runId>`.

| Öğe | Değer |
|---|---|
| Aktör | 1 `User` (ADMIN) + 1 `Lawyer` (PARTNER) — `isApproverEligible` ön koşulu |
| Aktör e-postası | `f04-<runId>@f04-acceptance.invalid` — RFC 2606, **teslim edilemez** |
| Müvekkil / dosya | 1 `Client` (PERSON) · 1 `Case` (`GENERAL_EXECUTION`) · 1 `CaseClient` (ALACAKLI) |
| Tahsilat | 1 `Collection` — **100,00 TRY**, `CONFIRMED` — A2 kilidinin hedef satırı |
| Masraf | 1 `ExpenseRequest` — **100,00 TRY**, `paidTotal 0,00`, `SENT`/`APPROVED` |
| Onay | 1 `OfficeApprovalRequest` — `COLLECTION_DISPOSITION_POST`, `APPROVED` |
| Dağıtım | 1 `CollectionDisposition` — **100,00 TRY**, `DISTRIBUTION_APPROVED` + 1 satır (`CLIENT_EXPENSE_REIMBURSEMENT`, 100,00) |

### 1.1 Tam yazma kapsamı

**Kurulum: tam 11 satır** (atomik), mevcut hiçbir satır güncellenmez/silinmez.
**Posting'in ürettiği (9 kalem):** 1 `CollectionDisposition` güncellemesi (`POSTED` + `postedAt`), **1 `OfficeApprovalRequest` güncellemesi** (`executionStatus = SUCCEEDED` + `executedAt`; kaynak: `office-approval.service` → `markExecutionSucceeded` → `markExecution`), 1 `CollectionDispositionExpenseApplication`
(APPLY 100,00), **2** `AccountingJournalEntry` + **4** `AccountingJournalLine`, 1 `AuditLog`.
**Kapanışta (`revoke-access`, canlı koşumun kullandığı mod — isteğe bağlı DEĞİL):** 1 `User` satırında 2 alan (`isActive`, `tokenVersion`).

**Toplam canlı etki: 11 yeni kurulum satırı + posting akışının 9 kalemi + kapanışta 1 `User` satırı güncellemesi.** Bunların içinde **mevcut satır güncellemesi 3 tanedir**: `CollectionDisposition`, `OfficeApprovalRequest`, `User`. Kalanlar yeni satırdır.

**Geri alınamaz kayıt: YOK.** `IcrabotTimelineEntry` DB seviyesinde silinemez
(`immutable_violation: DELETE ... is forbidden. Legal facts are immutable.`) — bu yüzden varsayılan
kurulum onu **hiç yazmaz**; yalnız `F04_WITH_REVERSAL_PRECONDITIONS=1` (A2-EXT, ayrı onay) yazar.

---

## 2. Ürün/API yolları ve yetki

| Adım | Yol | Yetki |
|---|---|---|
| Oturum | `POST /api/auth/login` | AUTH-01: `email` + `password` + **`tenantSlug` zorunlu**; yanıt `{ token, ... }` |
| Ölçüm | `POST /api/collection-dispositions/:id/post` | `JwtAuthGuard` + servis içi: PARTNER/yetkili avukat + `DISTRIBUTION_APPROVED` + P4 approval-record |
| Sınır | aynı uç, başka tenant'ın `:id`'si | aynı — **reddedilmesi beklenir** |

Kurulum ürün API'si yerine doğrudan Prisma yazması kullanır: CONFIRMED tahsilat + APPROVED dağıtım
durumunu ürün akışından üretmek çok daha geniş bir yazma kapsamı ve yan etki doğurur. **Ölçülen
davranış (posting) her koşulda gerçek HTTP üzerindendir.**

---

## 3. Risk değerlendirmesi (kod üzerinden)

| Risk | Değerlendirme |
|---|---|
| Gerçek tenant'a bağlantı | **YOK** — yeni tenant; G-1/G-2 kapıları yasak slug'ları fail-closed reddeder |
| Dış bildirim | **YOK** — `DispositionPostingService` bağımlılıkları prisma/officeApproval/readService/financeRisk/approvalIntentBuilder/journalWriter; dosyada `notification|email|sms` çağrısı **0**. V-9 ayrıca ölçer ve **sayılamazsa FAIL eder** |
| Gerçek alıcıya ulaşma | Aktör e-postası `*.invalid` — teslim edilemez |
| Canlı posting yolunu bloke etme | Kilit yalnız paketin kendi satırında; hata/timeout'ta ROLLBACK. **Süre üst sınırı kodla ≤4 s'ye ZORLANMIYOR** — bkz. §11 Bilinen kusur A |
| Ortak/çapraz rapor | Sentetik tenant global toplamlara katılır; `f04-acc-` prefix'i ile filtrelenebilir. Tenant-scoped olmayan rapor tespit edilmedi |
| Muhasebe defterine kalıcı satır | **Gerçekleşir** (2 journal + 4 satır). Bilinçli maliyet; dispozisyon §7 |

---

## 4. KABUL-A2 canlı karşılığı

### 4.1 Yöntem
Hedef `Collection` satırı ayrı bağlantıda `FOR NO KEY UPDATE` ile kilitlenir → gerçek HTTP posting
gönderilir → `pg_blocking_pids` ile posting'in beklediği kanıtlanır → kilit bırakılır → sonuç
doğrulanır.

### 4.2 Ortak süre bütçesi
`F04_LOCK_BUDGET_MS` — varsayılan **3500 ms**, tavan **4000 ms**. **Bu bir üst sınır garantisi DEĞİLDİR; ölçülen katmanlar §11'de.** Bütçe **kilidin alındığı anda
başlar** ve gözlem + tutmayı birlikte kapsar; tek bir gözlem sorgusu bile bütçeyle yarıştırılır.
Bütçe dolarsa transaction kapanır (kilit bırakılır) ve adım FAIL eder.

**Tavan neden 4000:** posting Prisma interactive transaction `timeout`unu override etmez → varsayılan
**5000 ms** geçerlidir. R01 provasında 8000 ms kilit posting'i **P2028/HTTP 500**'e düşürdü; bu bir
F04 kusuru değil, ölçüm kurgusunun kusuruydu.

### 4.3 Kontroller (9)
A2-0 ön koşul (FAIL → posting başlatılmaz) · A2-1 login · A2-4 `pg_blocking_pids` beklemesi ·
A2-5 bekleyen sorgu `FOR NO KEY UPDATE` cümlesi · A2-6 istek kilitte bekliyor · A2-7 kilit sonrası
tamamlandı (veya belirsizse **uzlaştırıldı**) · A2-8 süre farkı · A2-9 POSTED + `postedAt` ·
A2-10 kilit sızıntısı yok (ölçülemezse FAIL).

---

## 5. On senaryonun canlı karşılığı

| Canlıda doğrulanabilir | Dolaylı | Canlıda kurulamaz |
|---|---|---|
| **KABUL-A2** (kilit beklemesi + finansal sonuç), **KABUL-5** (tenant sınırı) | **KABUL-C** (posting kilit sonrası tamamlanıyor; `FOR UPDATE` olsaydı FK zinciri deadlock verirdi) | A, 1, 2, 3, 4, B, D — `jest.spyOn` prototip bariyeri gerektirir |

Kalan yedinin regresyon kilidi disposable entegrasyon testidir (canlı SHA `08ce8e25` kod yüzeyiyle
**10/10 PASS**) ve **canlı kabul yerine konmaz**. **Bu paket bütün F04 yarış kabulünü kapatmaz.**

---

## 6. Finansal doğrulama (V-1..V-9)

Tek sentetik işlem için **ölçülmüş** beklentiler:

| # | Beklenen |
|---|---|
| V-1 | `POSTED` + `postedAt` + `manualReversalRequiredAt` yok + tutar 100 |
| V-2 | **Tam 2 journal**: `COLLECTION_DISTRIBUTION_POSTED` ×1, `COLLECTION_DISPOSITION_EXPENSE_APPLICATION_APPLIED` ×1 (fazlası = mükerrer/yanlış → FAIL) |
| V-3 | **Tam 4 satır**; her journal DEBIT = CREDIT = **100,00 TRY**; hesaplar: dağıtım `CASH_CLEARING`/`CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE`, uygulama `CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE`/`CLIENT_EXPENSE_RECEIVABLE` |
| V-4 | `idempotencyKey` **benzersiz**, tenant + kaynak kimliği gömülü; satırlar doğru `collectionId`/`dispositionLineId`'ye bağlı |
| V-5 | **Tam 1 APPLY** (100,00) / 0 REVERSAL, doğru `expenseRequestId`; net uygulanan 100, kalan 0 |
| V-6 | `OFFICE_APPROVAL_EXECUTION_SUCCEEDED` ×1, doğru aktör; FAIL/DENIED olay yok |
| V-7a/b | İzolasyon: izlenen tenant'lar değişmedi (boş küme = FAIL); global artış bilgisi |
| V-8 | Kilit/transaction sızıntısı yok (**ölçülemezse FAIL**) |
| V-9 | Dış bildirim üretilmedi (**sayılamayan model = FAIL**) |

**Ürünün kendi koruması (ölçüldü):** `AccountingJournalEntry` üzerinde
`@@unique(tenantId, sourceType, sourceId, sourceAction)` vardır — aynı kaynak için ikinci bir
`posted` journal **veritabanı seviyesinde engellenir**.

---

## 7. Koşum sonrası dispozisyon

| Mod | Ne yapar | Canlıda? |
|---|---|---|
| **`preserve`** (varsayılan) | Yazma **0**; envanter raporlanır. Sentetik tenant kanıt olarak durur | ✅ |
| **`revoke-access`** | **Canlıda önerilen kapanış.** `isActive=false` + `tokenVersion++` → mevcut JWT'ler geçersiz, yeni login **401**. Finansal/audit kayıtlara **dokunulmaz** ve bu doğrulanır | ✅ |
| `reverse` | Ürünün kendi ters kayıt yolu (A2-EXT) | ❌ **Canlı kapsam dışı** |
| `purge` | Sentetik tenant + tüm satırlar silinir | ❌ **Canlı kapsam dışı** (yalnız `F04_ENVIRONMENT=disposable` + token) |

`F04_ENVIRONMENT` verilmezse ortam **live** kabul edilir (fail-safe).

---

## 8. Başarısızlıkta toparlama

| Durum | Otomatik davranış | Müdahale |
|---|---|---|
| Ön koşul FAIL | Posting **başlatılmaz**; yazma yok | Durum incelenir |
| Bütçe dolar | Transaction kapanır, kilit bırakılır, FAIL | Bütçe/ortam gözden geçirilir. **Not:** posting isteği o an gönderilmiş olabilir ve tamamlanabilir — kalıcı durum `03-verify` ile okunur |
| Gözlem yapılamaz | `OLCULEMEDI` + nonzero | Ölçüm koşulları düzeltilip tekrarlanır; sonuç "kilit yok" sayılmaz |
| HTTP belirsiz | **Tekrar gönderilmez**; kalıcı durum salt-okuma uzlaştırılır | Uzlaşma sonucu rapordadır |
| Kurulum yarıda kesilir | Transaction ROLLBACK → **hiçbir satır kalmaz** | Yok |
| Durum dosyası yazılamaz | Nonzero + kurtarma talimatı | `F04_RUN_ID=<runId> node f04-00-recover-state.js` |
| Script çöker | Prisma ROLLBACK | `03-verify` bağımsız ölçer |

---

## 9. Prova sonuçları (disposable — **canlı kabul değildir**)

Canlı RELEASE20 dist'inin ayrı örneği (port 8099, izole cwd) + disposable PG 5439. Canlı servisler
(8080 / 3002) çalışmaya devam etti; **canlı DB'ye tek yazma yok** (`changed: 0`).

| Adım | Sonuç |
|---|---|
| `f04-run.js` (tek yürütücü) | **BAŞARILI** — setup 0 · A2 0 · verify 0 · revoke-access 0; parola çıktıda ve state'te **yok** (tarandı) |
| `01-setup` (atomik) | **11/11**, parola basılmadı, kurtarma kimliği üretildi |
| `02-a2-race` | **9/9 PASS** — kilit 752 ms / bütçe 3500 ms; A2-7 **doğrudan** doğrulama: `oturum=idle · açıkTransaction=false · bloke edilen=0` |
| `03-verify` | **10/10 PASS** — 2 journal, 4 satır, DEBIT=CREDIT=100, benzersiz idempotency, 1 APPLY, doğru audit |
| `04-teardown revoke-access` | erişim kapandı, kanıt korundu (`ERISIM SONLANDIRILDI - finansal/audit kanit KORUNDU`) |
| `06-negative-controls` | **12/12 PASS** (aşağıda) |
| Canlı DB karşılaştırması | `changed: 0` — **"CANLI DB DEĞİŞMEDİ"** |

### 9.1 Negatif kontroller — bozuk durumlar doğru reddedildi

| # | Senaryo | Gözlenen |
|---|---|---|
| NC-0 | bozulmamış koşum | verify exit 0 |
| NC-1 | kurulum yarıda kesilir | setup nonzero · **tenant oluşmadı** · durum dosyası yazılmadı |
| NC-2 | geciken kilit gözlemi (bütçe 1 ms) | exit 3 · "bütçe doldu" · **kilit sızıntısı 0** |
| NC-3 | başarısız kilit gözlemi | exit 3 · `OLCULEMEDI` · yanlış "kilit yok" iddiası **yok** |
| NC-4 | ön koşul sağlanmıyor | exit 3 · "ON KOSUL SAGLANMADI" · **journal sayısı değişmedi** |
| NC-5 | fazladan/yanlış journal | exit 2 · **V-2 FAIL** · ayrıca aynı kaynakta çift journal **DB unique kısıtıyla engellendi** |
| NC-6 | eksik audit | exit 2 · **V-6 FAIL** · audit geri yüklendi |
| NC-7 | sayılamayan bildirim | exit 2 · **V-9 `OLCULEMEDI`** · yanlış "bildirim yok" iddiası **yok** |
| NC-8 | belirsiz HTTP sonucu (istemci 800 ms'de kesildi, kilit 3,1 s tutuldu) | kalıcı durum `DISTRIBUTION_APPROVED` → **BELİRSİZ bırakıldı**, "gerçekleşmedi" **denmedi**, **POST tekrarlanmadı** |
| NC-9 | A2 başarısız (bütçe 1 ms) | yürütücü nonzero · **aktif kullanıcı 0** — `finally` erişimi kapattı |
| NC-10 | durum dosyası silindi | `runId` ile kurtarıldı · revoke 0 · **aktif kullanıcı 0** |
| NC-11 | envanter ölçülemiyor (`AuditLog` erişilemez) | **aktif kullanıcı 0** (kapatma engellenmedi) · verdict `EKSİK - kapanış DOĞRULANAMADI` · nonzero |

Negatif kontroller **yalnız `F04_ENVIRONMENT=disposable`** ile çalışır (veri bozar, tablo adı
değiştirir). Ürettiği tüm tenant'lar koşum sonunda purge edilir ("TEMİZ").

---

## 10. Canlı çalıştırma için istenen onay

```bash
export F04_DATABASE_URL="<canlı DATABASE_URL>"
export F04_API_BASE_URL="http://127.0.0.1:8080/api"
export F04_STATE_FILE="<oturum dizini>/f04-state.json"

# TEK YÜRÜTÜCÜ — parolayı bellekte üretir, hiçbir yere yazmaz;
# kurulum/A2/doğrulama başarısız olsa bile `finally` ile erişimi kapatır.
node f04-run.js
```

**Onaylanması istenen tam yazma kapsamı:** tek bir `f04-acc-<runId>` tenant'ında **11 kurulum satırı
+ posting akışının 9 kalemi + kapanışta 1 kullanıcı satırında 2 alan** (`revoke-access`: `isActive`, `tokenVersion`); bunlardan **3'ü mevcut satır güncellemesidir** (`CollectionDisposition`, `OfficeApprovalRequest`, `User`); kilit süresi için **§11 Bilinen kusur A** geçerlidir — kodla zorlanan bir ≤4 s garantisi YOKTUR; dış bildirim
yok; gerçek tenant'a dokunulmaz; geri alınamaz kayıt üretilmez.

**Kabul kapsamı: "posting'in kilit beklemesi ve finansal sonucu."** Bu koşum başarılı olsa bile
**bütün F04 yarış kabulü kapanmaz** — kalan yedi senaryo canlıda kurulamaz (§5). KABUL-5 (§2 sınır
adımı, +11 satırlık ikinci tenant) ve A2-EXT (`reverse`) **ayrıca** onaylanmalıdır.

---

## 11. Bilinen kusurlar — gelecekteki kullanım öncesi düzeltilecek

> Owner tespiti (2026-09-07) ve `OFFİCE 33 - F04` oturumunun genişletmesi; **her ikisi de kaynakta**
> **doğrulandı**. Bu kusurlar #2549'da kaydedilen koşumu (runId `ccd471d3`, paket `060e1e37`,
> canlı RELEASE20 `08ce8e25`, squash `05f67a28`) **geçersiz kılmaz** — o koşumda kilit 750 ms
> ölçüldü ve hesap kapatıldı. Kusurlar paketin **gelecekteki** kullanımını ilgilendirir.

### Kusur A — kilit süresi kodla ≤4 s'ye zorlanmıyor

Belge "garanti" kelimesini hiç kullanmadı; ancak onay istenen kapsam cümlesinde "kilit ≤4 saniye"
**bir sınır olarak sunuldu** ve bu sınır **kodla zorlanmıyor**. İfade `LOCK_BUDGET_MS` tavanına (max 4000)
aitti, kodun uyguladığı eşiklere değil. Gerçekte üç ayrı katman var:

| Katman | Değer (varsayılan) | Kaynak |
|---|---|---|
| `assertWithinBudget` — yalnız **transaction içi** adımlar | 3500 ms | `f04-02-a2-race.js` |
| `A2-BUDGET` FAIL eşiği | `LOCK_BUDGET_MS + DB_GUARD_SLACK_MS` = **5000 ms** | `f04-02-a2-race.js:185` |
| Prisma `$transaction` dış sınırı | `LOCK_BUDGET_MS + DB_GUARD_SLACK_MS + 5000` = **10000 ms** | `f04-02-a2-race.js:164` |
| `statement_timeout` / `idle_in_transaction_session_timeout` | 5000 ms | `f04-02-a2-race.js:112-114` |

Sonuç: **4000–5000 ms arası tutulan kilit hiçbir kontrolü düşürmez**; 5000 ms üstünde `A2-BUDGET`
FAIL verir ama kilit o süreyi **zaten tutmuş** olur. Ayrıca `assertWithinBudget` kilidin
bırakılma (commit/rollback) kuyruğunu kapsamaz.

**Düzeltme yönü:** garanti metni ile assertion eşiği aynı sayıdan türemeli; dış sınır (Prisma tx
timeout) bütçeyi aşmayacak şekilde bağlanmalı.

### Kusur B — yürütücü commit sonrası hatada hesabı açık bırakabilir

`f04-run.js:82` yalnız `setupCode === 0 || setupCode === 4` durumunda kapatma yapıyor; diğer her
çıkış "kurulum commit edilmedi" sayılıyor. Ancak `f04-01-setup.js`'te satır 222'deki
`if (written.length !== EXPECTED) throw`, `$transaction` (satır 104) **commit ettikten sonra**
çalışır ve **exit 1** üretir. Yani tetikleyici yalnız SIGKILL/timeout (124) değil — **commit
sonrası herhangi bir hata** aynı fail-open'a düşer ve sentetik hesap **açık kalır**.

**Düzeltme yönü:** çıkış kodu beyaz listesi yerine, **durum dosyası veya `runId` ile tenant
bulunabiliyorsa her çıkış kodunda kapatma denenmeli** (bilinmeyen çıkış "yapılmadı" sayılmaz).

### Kayıt düzeltmesi

`revoke-access` sırasındaki **kullanıcı satırı güncellemesi** (`isActive`, `tokenVersion`) erişim
kapanışı kanıtı olarak kayıtlıydı ama **yazma envanterinde ayrı kalem sayılmamıştı**; §1.1 ve §10
bu revizyonda düzeltildi.
