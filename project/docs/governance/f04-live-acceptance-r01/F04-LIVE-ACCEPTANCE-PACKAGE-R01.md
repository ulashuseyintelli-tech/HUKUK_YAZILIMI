# F04 CANLI KABUL PAKETİ — R01

```text
DURUM             : PROVASI GEÇTİ / CANLI ÇALIŞTIRMA ONAYI BEKLİYOR
KAYNAK            : owner GO "F04 — somut canlı kabul paketini hazırla" (2026-09-07)
HEDEF SÜRÜM       : RELEASE20 — canlı kaynak 08ce8e2559b4d1d67fcee245413de510209507f3
CANLIDA YAPILAN   : HİÇBİR ŞEY — bu tur canlı tenant/finansal kayıt OLUŞTURMADI
PROVA ORTAMI      : disposable PostgreSQL 16 (127.0.0.1:5439) + canlı RELEASE20 dist'inin
                    ayrı bir örneği (port 8099, izole cwd, canlı servislere DOKUNULMADI)
CANLI DB          : ÖLÇÜLDÜ — prova öncesi/sonrası karşılaştırma `changed: 0`, "CANLI DB DEĞİŞMEDİ"
IMPLEMENTATION AUTHORITY: NONE — bu belge canlı çalıştırma yetkisi ÜRETMEZ
```

> `FOR NO KEY UPDATE` kilidi ve kapanmış F04 uygulaması (#2512) **değiştirilmedi**. Canlı API'ye
> prototype/bariyer enjeksiyonu, servis değişikliği ve yeniden deployment **yapılmadı ve
> yapılmayacaktır**. PR #2543'e dokunulmadı.

---

## 1. Paket ne yapar, ne yapmaz

**Yapar:** F04'ün *serileştirme* bacağının canlı sürümde gerçekten çalıştığını, canlı API'ye
gerçek HTTP isteği göndererek ve PostgreSQL'in kendi kilit görüşünü (`pg_blocking_pids`) delil
alarak kanıtlar. Ayrıca tenant sınırının canlıda korunduğunu doğrular.

**Yapmaz:** on KABUL senaryosunun tamamını canlıda kurmaz — dokuzu kod enjeksiyonu ister
(§5). Gerçek müvekkil verisine yazmaz, dış bildirim üretmez, mevcut kaydı güncellemez/silmez.

---

## 2. Hedef sentetik alan

`demo-firma` **kullanılmaz** (PR #2542 ile kanıtlandı: gerçek ofisle paylaşılan kullanıcı
domainleri, 7 aktörün audit izi, canlı muhasebe akışı). `c36-smoke-principal`,
`c36-smoke-principal-2` ve `local-development-office` **kullanılmaz** (başka programların
ölçüm alanları). Paket **kendi tenant'ını üretir**.

| Öğe | Değer |
|---|---|
| Tenant slug | `f04-acc-<8 hex>` — her koşumda yeni; prefix bu pakete ayrılmıştır |
| Aktör | 1 `User` (ADMIN) + 1 `Lawyer` (`lawyerRank: PARTNER`) — `isApproverEligible` ön koşulu |
| Aktör e-postası | `f04-<sfx>@f04-acceptance.invalid` — RFC 2606 ayrılmış TLD, **teslim edilemez** |
| Müvekkil / dosya | 1 `Client` (PERSON) · 1 `Case` (`GENERAL_EXECUTION`) · 1 `CaseClient` (ALACAKLI) |
| Tahsilat | 1 `Collection` — **100,00 TRY**, `TAHSILAT`, `status: CONFIRMED` — A2 kilidinin hedef satırı |
| Masraf | 1 `ExpenseRequest` — **100,00 TRY**, `paidTotal 0,00`, `SENT` / `expenseApprovalStatus APPROVED` |
| Onay | 1 `OfficeApprovalRequest` — `COLLECTION_DISPOSITION_POST`, `APPROVED` (P4 kaydı) |
| Dağıtım | 1 `CollectionDisposition` — **100,00 TRY**, `DISTRIBUTION_APPROVED`, `SINGLE_CASE_CLIENT` |
| Dağıtım satırı | 1 `CollectionDispositionLine` — `CLIENT_EXPENSE_REIMBURSEMENT`, **100,00 TRY** |

Tutarlar bilinçli olarak **dağıtım toplamı = tahsilat tutarı = masraf tutarı = 100,00 TRY**
seçilmiştir: tek satırlık dağıtım, artık/kalan üretmez ve beklenen sonuç aritmetik olarak tektir.

### 2.1 Azami yazma kapsamı

**Varsayılan koşum tam olarak 11 satır yazar** (yukarıdaki tablo) ve **mevcut hiçbir satırı
güncellemez veya silmez**. Posting adımı bunlara kendi çıktısını ekler: 1 `CollectionDisposition`
güncellemesi (POSTED), 1 `CollectionDispositionExpenseApplication` (APPLY), 2 `AccountingJournalEntry`
+ satırları, 1 `AuditLog`. Provada ölçülen toplam etki: `collection 1 · disposition 1 · journal 3 ·
expenseApplication 1 · audit 1`.

**Geri alınabilirlik — ölçülmüş kısıt:** `IcrabotTimelineEntry` veritabanı seviyesinde silinemez.
Provada doğrudan SQL ile doğrulandı:

```text
ERROR: immutable_violation: DELETE on "IcrabotTimelineEntry" is forbidden. Legal facts are immutable.
```

Bu yüzden **varsayılan kurulum bu kaydı hiç yazmaz**; paket canlıya geri alınamaz hiçbir satır
bırakmaz. Kayıt yalnız `F04_WITH_REVERSAL_PRECONDITIONS=1` ile (A2-EXT, §6) yazılır ve o seçenek
**ayrı onay ister**.

---

## 3. Kullanılacak ürün/API yolları ve yetki

| Adım | Yol | Yetki | Not |
|---|---|---|---|
| Oturum | `POST /api/auth/login` | — | AUTH-01: `email` + `password` + **`tenantSlug` zorunlu**. Yanıt `{ token, user, tenant }` |
| Ölçüm | `POST /api/collection-dispositions/:id/post` | `JwtAuthGuard` + servis içi capability: PARTNER/yetkilendirilmiş avukat + `DISTRIBUTION_APPROVED` + P4 approval-record | F04'ün ölçülen yolu |
| Sınır | aynı uç, başka tenant'ın `:id`'si | aynı | KABUL-5 karşılığı; **reddedilmesi beklenir** |

Kurulum adımı ürün API'si yerine doğrudan Prisma yazması kullanır. Gerekçe: CONFIRMED tahsilat +
APPROVED dağıtım durumunu ürün akışından üretmek çok sayıda ek onay/iş akışı kaydı ve yan etki
tetikler; doğrudan yazma **daha dar** ve daha öngörülebilir bir yazma kapsamı verir. **Ölçülen
davranış** (posting) her koşulda gerçek HTTP üzerinden çalışır.

---

## 4. Risk değerlendirmesi (mevcut kod üzerinden)

| Risk | Değerlendirme | Dayanak |
|---|---|---|
| Gerçek tenant'a bağlantı | **YOK.** Üretilen tenant yeni; `Collection`/`Case`/`Client` bağları yalnız kendi içinde. Çapraz tenant sızıntısı ölçüldü: `Collection`↔`Case` tenant uyuşmazlığı **0** | PR #2542 ölçümü + G-2 kapısı |
| Dış bildirim (e-posta/SMS) | **YOK.** `DispositionPostingService` bağımlılıkları: `PrismaService`, `OfficeApprovalService`, `ClientSettlementReadService`, `FinanceRiskEngine`, `FinanceApprovalIntentBuilder`, `AccountingJournalWriterService` — bildirim servisi **yok**; dosyada `notification`/`email`/`sms` çağrısı **0** | `disposition-posting.service.ts` |
| Bildirim kuyruğuna düşme | Provada ölçüldü: `notificationQueue 0 · clientNotification 0 · clientStatementDeliveryLedger 0 · poaExpiryNotificationDelivery 0` | V-7 kapısı |
| Gerçek alıcıya ulaşma | Aktör e-postası `*.invalid` (RFC 2606) — bir gönderim yanlışlıkla tetiklense bile teslim edilemez | §2 |
| Ortak/çapraz rapor etkisi | Sentetik tenant global toplamlara katılır (ör. tüm-tenant sayımları). Tenant-scoped olmayan bir rapor **tespit edilmedi**; ayrım gerektiğinde slug prefix'i `f04-acc-` ile filtrelenebilir | §2 |
| Canlı posting yolunu bloke etme | Kilit **yalnız bu paketin kendi Collection satırında**; başka satır/tablo kilitlenmez. Süre sınırlı ve fail-closed (§6.2) | G-4/G-5 |
| Muhasebe defterine test satırı | **Gerçekleşir** ve kalıcıdır (dağıtım journal'ı). Bu bilinçli bir maliyettir; dispozisyon seçenekleri §8'de | — |

---

## 5. On KABUL senaryosunun canlı karşılığı

Kaynak: `f04-posting-reversal-race.db-gated.integration.spec.ts` (10 senaryo, disposable
PostgreSQL, **10/10 PASS** — canlı SHA'nın F04 kod yüzeyiyle birebir aynı kaynakta doğrulandı).

| Senaryo | Neyi doğrular | Canlıda? | Gerekçe |
|---|---|---|---|
| **KABUL-A2** | gerçek transaction, posting'in Collection kilidinde **bekler** | **EVET — bu paket** | Bariyer gerektirmez; kilit dışarıdan kontrollü tutulur (§6) |
| **KABUL-5** | başka tenant'ın dağıtımı post **edilemez** | **EVET — bu paket** | Saf yetki/kapsam kontrolü, zamanlama gerektirmez (§7) |
| KABUL-C | kilit modu FK'nın örtülü `KEY SHARE`'ini **bloklamaz** | **DOLAYLI — bu paket** | A2'de posting kilit sonrası **başarıyla tamamlanıyor**; `FOR UPDATE` olsaydı FK zinciri deadlock üretirdi. Ayrı bir negatif kontrol canlıda kurulamaz |
| KABUL-A | posting kilidi önce alır, cancel bekler | HAYIR | Cancel executor'ı barrier ile başlatmayı gerektirir |
| KABUL-1 | posting bayat CONFIRMED görüntüsüyle girerse finansal etki **bırakmaz** | HAYIR | `assertCollectionConfirmed` çağrısının **içine** bariyer gerekir |
| KABUL-2 | bayat pre-post reversal POSTED'i **ezemez** | HAYIR | Reversal servisinin bayat görüntüyle çağrılması gerekir |
| KABUL-3 | tekrarlı `PAYMENT_REVERSED` çift etki **üretmez** | HAYIR (A2-EXT'e bağlı) | `PAYMENT_REVERSED` üretimi + silinemez timeline kaydı ister |
| KABUL-4 | iptal önce kazanırsa posting POSTED **yazamaz** | HAYIR | İki akışın commit sırasının kontrolü gerekir |
| KABUL-B | transaction ortasındaki hata kalıcı yazım **bırakmaz** | HAYIR | Journal writer'a hata enjeksiyonu gerekir |
| KABUL-D | gecikmiş posting + offset + payout **döngü kurmaz** | HAYIR | Çok adımlı bariyer dizisi gerekir |

**Özet:** canlıda gerçekten doğrulanabilen üç şey vardır — (i) posting'in satır kilidini alması ve
kilitliyken ilerlememesi, (ii) kilit kalkınca doğru finansal sonucu üretmesi, (iii) tenant sınırı.
Kalan yedi senaryonun regresyon kilidi **disposable entegrasyon testidir** ve bu paket onu canlı
kabul yerine **koymaz**.

---

## 6. KABUL-A2 canlı karşılığı — `f04-02-a2-race.js`

### 6.1 Yöntem

1. Hedef `Collection` satırı ayrı bir bağlantıda `SELECT ... FOR NO KEY UPDATE` ile kilitlenir
   (tek satır, tenant kapsamlı).
2. Gerçek HTTP `POST /api/collection-dispositions/:id/post` gönderilir.
3. PostgreSQL'e sorulur: kilidi tutan pid başka bir transaction'ı bloke ediyor mu?
   Bekleyen sorgu metni posting'in kendi kilit cümlesi olmalıdır.
4. İstek **henüz tamamlanmamış** olmalıdır.
5. Kilit bırakılır; istek tamamlanır; posting/bakiye/audit sonucu doğrulanır.

### 6.2 Kilit güvenliği ve süre sınırı

- `SET LOCAL lock_timeout = '5s'` ve `SET LOCAL idle_in_transaction_session_timeout` uygulanır.
- Kilit **varsayılan 2000 ms**, **tavan 4000 ms** tutulur (`F04_LOCK_HOLD_MS`).
- **Neden tavan var:** posting akışı Prisma interactive transaction kullanır ve `timeout`u
  override etmez → Prisma varsayılanı **5000 ms** geçerlidir. Provada kilit 8000 ms tutulduğunda
  posting **P2028 ile HTTP 500** döndü. Bu bir F04 kusuru **değil**, ölçüm kurgusunun kusuruydu;
  paket bu yüzden tavanlıdır ve bu bulgu burada kayıtlıdır.
- Hata veya timeout durumunda Prisma transaction'ı **ROLLBACK** eder → kilit bırakılır. Script
  ayrıca kapanışta "kilit sızıntısı" kontrolü yapar (A2-13) ve hata yolunda da ölçer.

### 6.3 Beklenen sonuçlar (12 kontrol)

| # | Beklenen |
|---|---|
| A2-0 | `DISTRIBUTION_APPROVED` + `CONFIRMED`, `postedAt` yok |
| A2-1 | login 200/201, token alınır |
| A2-4 | `pg_blocking_pids`: kilidimiz en az bir transaction'ı bloke ediyor |
| A2-5 | bekleyen sorgu: `SELECT "status" FROM "Collection" WHERE "id"=$1 AND "caseId"=$2 AND "tenantId"=$3 FOR NO KEY UPDATE` |
| A2-6 | HTTP isteği kilit tutulurken **tamamlanmamış** |
| A2-7 | kilit bırakılınca istek **201** |
| A2-8 | istek süresi kilit süresinin en az %60'ı (gerçekten bekledi) |
| A2-9 | `POSTED` + `postedAt` dolu + `manualReversalRequiredAt` **yok** |
| A2-10 | masraf uygulaması **1 APPLY / 0 REVERSAL** |
| A2-11 | `COLLECTION_DISTRIBUTION_POSTED` journal'ı yazıldı |
| A2-12 | audit izi oluştu |
| A2-13 | kilit sızıntısı yok |

---

## 7. KABUL-5 canlı karşılığı — `f04-05-tenant-boundary.js` (isteğe bağlı)

İki sentetik tenant üretilir; A'nın aktörü B'nin dağıtımını post etmeyi dener. Beklenen: **2xx
değil** ve B tarafında `status`/`postedAt`/journal/masraf uygulaması **değişmez**. Bu adım kendi
başına hiçbir satır yazmaz.

---

## 8. Koşum sonrası dispozisyon — silme **varsayılan değildir**

| Mod | Ne yapar | Ne zaman |
|---|---|---|
| **`preserve` (VARSAYILAN)** | Hiçbir kayıt silinmez/değiştirilmez; yazma **0**. Sentetik tenant kalıcı kabul kanıtı olarak durur; `f04-acc-` prefix'i onu gerçek ofisten ve diğer programlardan ayırır | Önerilen. Muhasebe defterinden satır kaldırmaz |
| `reverse` | Ürünün **kendi** tersleme yolu (iptal → `PAYMENT_REVERSED` → POSTED tersleme: `manualReversalRequiredAt` + reimbursement REVERSAL). Veri **silmez**, politikaya uygun ters kayıt üretir | Muhasebe izinin kapatılması istenirse. **Bu script yürütmez** — A2-EXT kapsamı, ayrı onay ister ve silinemez timeline kaydı üretir |
| `purge` | Sentetik tenant ve tüm satırları silinir. Yalnız `F04_CONFIRM_PURGE=YES-DELETE-SYNTHETIC-F04-TENANT` ile | Yalnız owner açık talimatıyla. Provada **"TEMİZ — sentetik tenant ve satırları KALMADI"** doğrulandı (varsayılan 11 satırlık kurulumda) |

`purge` her koşulda **sonuç doğrulaması** yapar; kalıntı varsa `EKSİK TEMİZLİK` verdict'i verir ve
sıfırdan farklı çıkış kodu döndürür.

---

## 9. Başarısızlıkta toparlama

| Durum | Otomatik davranış | Gerekli müdahale |
|---|---|---|
| Kilit alınamadı (`lock_timeout`) | Transaction ROLLBACK, kilit yok | Yok; adım tekrar edilebilir |
| Bekleme gözlenemedi | Kilit bırakılır, adım FAIL | Yok; posting ya hiç başlamamış ya da kilit yolu değişmiş → bulgu olarak raporlanır |
| Posting 500 (P2028) | Kilit zaten bırakılmıştır | `F04_LOCK_HOLD_MS` düşürülür (≤4000). Dağıtım `DISTRIBUTION_APPROVED` kalır, finansal iz oluşmaz |
| Posting kısmen yazdı | — | Ürün zaten transaction içinde çalışır (KABUL-B); `03-verify` kalıcı durumu bağımsız ölçer |
| Script çöktü | Prisma transaction ROLLBACK | `03-verify` çalıştırılır; kilit sızıntısı V-6 ile ölçülür |
| Sentetik tenant yarım kaldı | — | `04-teardown` `preserve` (varsayılan) veya owner onayıyla `purge` |

**Canlı posting yolu riski:** kilit yalnız bu paketin kendi satırındadır; gerçek bir tahsilatın
posting'i **etkilenmez**. En kötü durumda etkilenen tek şey paketin kendi sentetik dağıtımıdır.

---

## 10. Prova sonuçları (disposable — **canlı kabul değildir**)

Ortam: disposable PostgreSQL 5439 + canlı RELEASE20 dist'inin ayrı örneği (port 8099, izole cwd).
Canlı servisler (8080 / 3002) çalışmaya devam etti; canlı DB'ye **tek bir yazma yapılmadı**.

| Adım | Sonuç |
|---|---|
| `01-setup` | **11/11** satır (geri alınamaz kayıt üretmeden) |
| `02-a2-race` | **12/12 PASS** — kilit 2005 ms, bekleyen pid gözlendi, HTTP 201, istek 2064 ms |
| `03-verify` | **8/8 PASS** — POSTED, 1 APPLY/0 REVERSAL, net uygulanan 100, kalan 0, journal + audit, izolasyon, sızıntı yok, bildirim yok |
| `05-tenant-boundary` | **4/4 PASS** — çapraz post **HTTP 404**, hedef tenant değişmedi |
| `04-teardown preserve` | yazma **0** |
| `04-teardown purge` | **"TEMİZ — sentetik tenant ve satırları KALMADI"** |
| Güvenlik kapıları | `telli-hukuk` → G-1 reddi · `demo-firma` → G-1 reddi · purge token'sız → reddedildi · `reverse` → yürütmedi |
| Canlı DB karşılaştırması | `changed: 0` — **"CANLI DB DEĞİŞMEDİ"** |

Provada yakalanan ve düzeltilen kusurlar: (1) login'in `tenantSlug` zorunluluğu, (2) 80 karakterlik
sorgu kırpması `FOR NO KEY UPDATE`'i gizliyordu, (3) 8000 ms kilit posting'i P2028'e düşürüyordu,
(4) izolasyon kapısı boş izleme kümesiyle PASS veriyordu, (5) `IcrabotTimelineEntry` silinemediği
için purge yarım kalıyordu → kurulum artık o kaydı hiç yazmıyor.

---

## 11. Canlı çalıştırma için istenen onay

```bash
export F04_DATABASE_URL="<canlı DATABASE_URL>"
export F04_API_BASE_URL="http://127.0.0.1:8080/api"
export F04_STATE_FILE="<oturum dizini>/f04-state.json"

node f04-01-setup.js          # 11 satır, yeni f04-acc-* tenant
node f04-02-a2-race.js        # KABUL-A2 canlı karşılığı (12 kontrol)
node f04-03-verify.js         # bağımsız nihai doğrulama (8 kontrol)
node f04-04-teardown.js       # preserve (varsayılan): yazma 0
```

**Onay istenen kapsam:** yukarıdaki dört adım, tek bir `f04-acc-*` tenant'ında, toplam **11 satır
kurulum + posting'in kendi çıktısı**; kilit **≤4 saniye**; dış bildirim yok; gerçek tenant'a
dokunulmaz. KABUL-5 (§7) ve A2-EXT (§8 `reverse`) **ayrıca** onaylanmalıdır.

Onay verilirse koşum sonucu ve kalıcı durum ayrı bir kayıtla raporlanır; kabul ölçütlerinin
tamamı karşılanırsa F04 canlı kabul kapsamı kapatılabilir — aksi halde beklenen/gerçekleşen
sonuç farkı bulgu olarak kaydedilir.
