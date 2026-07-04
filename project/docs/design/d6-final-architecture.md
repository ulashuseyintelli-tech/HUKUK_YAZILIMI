# D6 Final Architecture

## Borçlu Kimlik/Adres Değişikliği — Çapraz-Dosya Etki Bildirimi Domaini

**Tarih:** 2026-07-04 · **Statü:** RATIFIED (owner, 2026-07-04 — bkz. Bölüm 0) · **Yetki:** Bu belge D6 domaininin kanonik mimari kaydıdır. `decision-log.md` 2026-07-04 satırlarından referans alınır.

---

## 0. OWNER RATİFİKASYONU (2026-07-04)

Bu belge, 14 ajanlı bir GO-ANALYZE workflow'unun (repo forensics × 6, bağımsız hukuki+mimari analiz × 2, adversarial kritik × 5, Opus sentez) ürettiği "D6 Final Mimari Kilit Belgesi" taslağının owner tarafından chat üzerinden ratifiye edilmiş halidir. Aşağıdaki metin owner'ın verdiği onay metninin birebir kaydıdır; Bölüm 1-8 orijinal GO-ANALYZE çıktısıdır (tarihsel/gerekçelendirme referansı olarak korunur).

```text
OWNER_DECISION: SECENEK B APPROVED.

P1 approved: D6B etiketi emekli. Bundan sonra kanonik adlar:
D6A-1, D6A-2, D6A-2-SURFACE, ESF, IAF.

P2 approved: DebtorCrossCaseImpactNotification modeli implement edilmeyecek.
Mevcut DebtorCrossCaseNotification yeterli ve kanonik modeldir.

P3 approved: Açık iş D6A-2-SURFACE'tir:
- listForRecipient()
- GET /debtors/cross-case-notifications?status=PENDING
- POST /debtors/cross-case-notifications/:id/acknowledge
- expiry cron
- no-recipient logger.warn
- create/transaction failure observability hook
- migration yok

P4 approved: Expiry cron automation.service.ts üzerinden orkestre edilecek,
domain service içine gömülmeyecek.

P5 approved: ESF ayrı epic olarak GO-ANALYZE'da kalacak.
D6A-2 endpointleri ESF'yi beklemeyecek.

P6 approved: IAF / generic bell-feed Option C olarak owner-gated kalacak.
Üçüncü kalıcı notification ihtiyacı ve gerçek merkezi UI kararı gelmeden
açılmayacak.

P7 approved: Collection/Tebligat traverse gerekçesi güncellenecek.
Eski scalar-only gerekçesi kullanılmayacak; sınır artık teknik değil
kavramsal/domain sınırıdır.

P8 approved: D6A-1 ve D6A-2 retroaktif olarak decision-log/product-backlog/
active-roadmap governance zincirine işlenecek.

Q1 owner answer:
Aktif case'in recipient'sız kalması teknik olarak mümkün kabul edilir ama
anomaly'dir. Notification generation diğer recipient'lar için devam eder.
Recipient bulunamayan case logger.warn + observability/reporting ile
görünür yapılır. DB-level invariant şu aşamada eklenmez.

Proceed with FAZ 0 docs-only governance update first.
No code. No migration.
After FAZ 0 review, prepare separate GO-IMPLEMENT proposal for
D6A-2-SURFACE.
```

**Sonuç:** P1-P8 LOCKED. Q1 ANSWERED. Q2-Q6 (retention/purge, FK onDelete, i18n, Tebligat-köprü backlog'u, action-note ayrımı) hâlâ OWNER_DECISION_PENDING — bkz. Bölüm 5.3, D6A-2-SURFACE implementasyon teklifinden önce veya sırasında ayrıca ele alınmalı.

---

## 1. YÖNETİCİ ÖZETİ

**En kritik bulgu:** Kullanıcının yapıştırdığı "D6B — Debtor Core Data Integrity & Cross-Case Legal Impact Notification" dokümanının önerdiği yeni model (`DebtorCrossCaseImpactNotification`), bugün (2026-07-04) zaten MERGE EDİLMİŞ olan DBND-D6A-2 (`DebtorCrossCaseNotification`, PR #880, commit `373c5b87`, gerçek migration `20260704020428_d6_debtor_cross_case_notification`) ile alan-alan, karar-karar neredeyse birebir aynı problemi çözüyor. İki bağımsız analist bu çakışmayı kod okuyarak doğruladı. Yapıştırılan doküman muhtemelen bu kod merge olmadan önce veya ondan habersiz yazılmış; duplesi kapsam olarak gerçek koddan **daha eksik** (asıl canlı adres-düzenleme rotası `AddressService.update()`'ten habersiz). **Bu yeni model implement EDİLMEMELİDİR.** (RATIFIED: P2)

**En kritik karar:** D6 domaini üç ayrı parçaya net olarak ayrılmalı ve her biri farklı statü almalı: (a) çekirdek bildirim mekanizması KAPALI (D6A-1 + D6A-2), (b) D6A-2'nin dışa-açılan yüzü (okuma/acknowledge endpoint'i, expiry cron'u, sessiz-başarısızlık gözlemi) AÇIK-YENİ-DEĞER, (c) Entity Status Framework ve genel bildirim-feed altyapısı AYRI-EPIC. (RATIFIED: P1, P3, P5, P6)

**İkincil kritik bulgu (üç kez tekrarlanan hata):** D6A-2 gerçek bir migration içermesine rağmen `decision-log.md` / `product-backlog.md` / `active-roadmap.md`'ye tek satır yazılmadan merge edildi — CLAUDE.md'nin "Yeni fikir → Triage → Backlog → READY → Roadmap → Implementation" zinciri tamamen atlandı. Bu belgenin kendisi ve bu FAZ 0 çalışması, tam olarak bu açığı kapatmak için üretildi (RATIFIED: P8).

**Ayrıca:** D6A-2 bugün production'da eksiktir — `expireStaleNotifications()` hiçbir cron'a bağlı değil (30 günlük PENDING kayıtlar sınırsız birikiyor) ve `acknowledge()` hiçbir HTTP route'undan erişilemiyor (kimse gördüğü bildirimi kapatamıyor). Yani mekanizma "yazan ama okunamayan bir günlük" durumunda. Bu boşluk D6A-2-SURFACE olarak backlog'a işlendi (RATIFIED: P3).

---

## 2. İSİMLENDİRME DÜZELTMESİ (KANONİK — LOCKED)

"D6B" etiketi aynı gün içinde ÜÇ farklı şeye atandı ve bu tutarsızlık her downstream analizi kirletiyor. Aşağıdaki kanonik isimlendirme owner tarafından LOCKED edilmiştir; bu tablodan sonra "D6B" etiketi **hiçbir bağlamda kullanılmaz** (yasaklı-belirsiz terim).

| Kanonik isim | Ne olduğu | Önceki karışık etiketler | Statü |
|---|---|---|---|
| **D6A-1** | Borçlu detay drawer'ında pull/computed çapraz-dosya uyarı banner'ı (AuditLog+CaseDebtor okuyarak her çağrıda hesaplanır, tablosu yok) | "D6 cross-file alert (MVP)" | KAPALI (PR #878) |
| **D6A-2** | Kalıcı `DebtorCrossCaseNotification` tablosu + servis (backend-only, PENDING/ACKNOWLEDGED/EXPIRED) | "D6", "D6B" (pasted-doc), "DebtorCrossCaseNotification" | KAPALI-ÇEKİRDEK (PR #880) |
| **D6A-2-SURFACE** | D6A-2'nin eksik dışa-açılan yüzü: list/acknowledge endpoint'i + expiry cron + sessiz-başarısızlık gözlemi | (yok — bu belge tanımlıyor) | AÇIK-YENİ-DEĞER, READY (`product-backlog.md` D6A-2-SURFACE-1) |
| **ESF** (Entity Status Framework) | 11 dağınık `statusColors` haritasını + DebtorIssue + POA-expiry + D6A-2 durumunu tek bir `EntityStatusIndicator` DTO'suna toplayan salt-okuma sunum katmanı | pasted-doc "F2/F3" | AYRI-EPIC-BAŞLAMADI (`product-backlog.md` ESF-1) |
| **IAF** (Internal Alert Feed) | Gerçek genel cross-domain in-app bildirim/bell-feed altyapısı (henüz yok; `components/notifications/` tamamen ölü kod) | "D6B" (agent-memory, Option C Hybrid), "gerçek D6B" | AYRI-EPIC-BAŞLAMADI, owner-gated (`product-backlog.md` IAF-1) |

**Talep (RATIFIED):** Yapıştırılan dokümanın içeriği bir "D6B" veya yeni bir faz DEĞİLDİR — bu içerik **D6A-2-SURFACE** olarak yeniden çerçevelenir. Yeni faz adı almaz. "D6B" terimi tüm gelecek iletişimde emekliye ayrılır.

---

## 3. DOMAIN HARİTASI

| Parça | Statü | Kanıt |
|---|---|---|
| **D6A-1** (pull/computed banner) | 🟢 **KAPALI-DOKUNMA** | `debtor.service.ts:1478-1585` (`getCrossFileDebtorAlerts`), controller `:id/cross-file-alerts`, FE `DebtorDetailDrawer.tsx:220-238` banner, test 9/9 PASS. PR #878 (`ee35a1cb`). Migration yok. |
| **D6A-2 çekirdek** (persistent notification üretimi) | 🟢 **KAPALI-DOKUNMA** | `debtor-cross-case-notification.service.ts` (279 satır), `schema.prisma:1390-1453`, migration `20260704020428`, integration test 20 `it()` bloğu. PR #880 (`373c5b87`). AddressService birincil + DebtorService ikincil yol canlı. |
| **D6A-2-SURFACE** (list/ack endpoint, cron, gözlem) | 🔴 **AÇIK-YENİ-DEĞER, READY** | HTTP endpoint YOK (5 controller'da sıfır referans, grep-doğrulandı), `expireStaleNotifications()` cron'a bağlı değil, `resolveRecipients()` boş dönerse sessiz `continue` (`logger.warn` bile yok). |
| **ESF** (Entity Status Framework) | 🟡 **AYRI-EPIC, GO-ANALYZE'da kalır** | 11 bağımsız `statusColors`/`STATUS_COLORS` tanımı (aynı DERDEST/KAPALI kodu için 3 dosyada 3 renk + 2 value-tipi), paylaşılan tip paketi YOK, DebtorIssue zaten DERIVED (`debtor.service.ts:2132-2238`). Emsal: `OfficeApprovalRequest.targetType/targetRef` (`schema.prisma:8535-8579`). |
| **IAF** (genel bildirim feed) | 🟡 **AYRI-EPIC, owner-gated** | 3 bağımsız tablo (NotificationQueue/PoaExpiryNotificationDelivery/DebtorCrossCaseNotification), `components/notifications/` 6 dosya TAMAMEN ölü kod (mock-data, hiç import edilmiyor, enum çakışması). Option C Hybrid owner-gated (RATIFIED: P6). |

---

## 4. HER DOMAIN PARÇASI İÇİN MİMARİ KESİT

### 4.1 D6A-1 (KAPALI — kısa)
- **Aggregate Root:** Yok — bu bir **query/projection**, entity değil.
- **Ownership:** `DebtorService`. Kaynak `AuditLog` (DEBTOR_UPDATE/DEBTOR_ADDRESS_UPDATE) + `CaseDebtor`. Yabancı domaine dokunmuyor, ek state yok.
- **Lifecycle:** Yok (idempotent, her çağrıda taze hesap). Doğru bir DERIVED örneği.
- **PII:** Çok temiz — response'ta ham değer yok (kategori adı + ISO tarih + fileNumber/responsibleName); audit kaynağı da `debtor-audit.util.ts` ile maskeli.
- **Bilinen tek eksik (backlog-not):** `categories` alanı (identity/contact/name/address) backend'den dönüyor ama `DebtorDetailDrawer.tsx` render etmiyor — kullanıcı hangi kategorinin değiştiğini görmüyor. Düşük öncelik, bitmemiş UI job'ı, davranış bozuk değil.
- **DOKUNMA:** Çalışıyor, testli, FE'de canlı.

### 4.2 D6A-2 çekirdek (KAPALI — kısa)
- **Aggregate Root:** `DebtorCrossCaseNotification` — kendi identity'si (`id`, `dedupeKey @unique`), kendi lifecycle'ı olan gerçek olay-kaydı. Doğru seçim.
- **Ownership:** `debtor` modülü (`DebtorCrossCaseNotificationService`). Üretim mantığı tamamen debtor domain bilgisine bağlı — doğru.
- **Lifecycle:** PENDING → ACKNOWLEDGED | EXPIRED (3 değer). Yapıştırılan dokümanın 5-değerli (CREATED/VISIBLE/…/RESOLVED) modeline karşı **bu 3-değerli model doğru** — CREATED/VISIBLE ayrımı yalnız asenkron/gecikmeli teslimat sistemlerinde anlamlı; D6A-2 senkron/backend-only.
- **Notification Model:** `fieldGroup` ∈ {ADDRESS, KEP_ADDRESS, IDENTITY, NAME}. **CONTACT (phone/email) kasıtlı DIŞLANMIŞ** — telefon/e-posta değişikliği borçlunun dava'daki hukuki kimliğini (adres-tebligat/kimlik no/ad-unvan) etkilemiyor.
- **Recipient Resolution:** `CaseLawyer.isResponsible=true` öncelikli → yoksa tüm aktif avukatlar (FALLBACK_LAWYER) → ayrıca `CaseStaff.roleOnCase=TEBLIGAT` + `receiveNotifications=true`. Hepsinde `user.isActive` kontrolü var.
- **Audit Strategy:** Kendi tablosuna yazarken `AuditService.logInTransaction` ile `DEBTOR_CROSS_CASE_NOTIFICATION_CREATED/ACKNOWLEDGED` action'ları da yazılıyor. `changeSummary` sabit, PII-sızdırmaz Türkçe etiket — ADR-011 uyumlu.
- **Persistence:** Gerçek migration, tenant-scoped (`tenantId` FK Cascade + composite index `[tenantId, recipientUserId, status]`). Multitenant izolasyon doğru.
- **DOKUNMA (çekirdek üretim):** Testli, canlı. Ama dışa-açılan yüzü eksik → 4.3.

### 4.3 D6A-2-SURFACE (AÇIK-YENİ-DEĞER — DETAYLI, READY)

Bu, D6A-2'nin *tekrarı* değil, *eksik ayağıdır*. Çekirdek doğru üretiyor ama hiçbir dış arayüz yok — klasik "yarım bırakılmış vertical slice".

**Aggregate Root:** Yeni yok — mevcut `DebtorCrossCaseNotification` üzerinde okuma + durum-geçişi.

**API Contract (RATIFIED: P3):**

```
GET  /debtors/cross-case-notifications?status=PENDING
     Guard: JwtAuthGuard (D6A-1'in cross-file-alerts idiom'uyla aynı)
     recipientUserId = req.user.id  ← SERVER-SIDE ZORUNLU TÜRETME (client parametre VEREMEZ)
     tenantId        = req.user.tenantId ← aynı şekilde JWT'den
     Response: kendi dar DTO'su (aşağıda)

POST /debtors/cross-case-notifications/:id/acknowledge
     Guard: JwtAuthGuard
     Body: yok
     Servis: mevcut acknowledge(tenantId, id, recipientUserId) — where:{id, tenantId, recipientUserId, status:PENDING} compare-and-set ZATEN doğru/güvenli
     Response: { acknowledged: boolean }
```

**GÜVENLİK KİLİDİ (HIGH):** Her iki endpoint'te `tenantId` ve `recipientUserId` **yalnız `req.user`/JWT'den** türetilir; client query/body ile veremez. Mevcut `acknowledge()` bunu zaten doğru yapıyor; yeni controller bu sözleşmeyi bozarsa cross-tenant notification-id tahmin/deneme (IDOR) riski doğar.

**DTO Contract:**
```
{ id, debtorId, affectedCaseId, affectedCase: { fileNumber },
  fieldGroup, severity, changeSummary, status, createdAt, expiresAt }
```
Ham PII yok (changeSummary zaten sabit etiket) — ADR-011 uyumlu.

**Servis katmanı:** `listForRecipient()` metodu **servis'te YOKTUR** — yeni eklenir: basit `prisma.debtorCrossCaseNotification.findMany({ where:{ tenantId, recipientUserId, status } })` sarmalayıcısı. `acknowledge()` zaten var, doğrudan sarmalanır.

**Expiry cron (RATIFIED: P4):** Doğru emsal `automation.service.ts`: `checkNotificationExpiries()` (`@Cron EVERY_HOUR`) ve `sendExpiringPoaNotifications()` (`@Cron EVERY_DAY_AT_9AM`). Kritik idiom: **PoaExpiryNotificationDelivery kendi cron'unu taşımıyor** — merkezi `AutomationService` besliyor. D6A-2 cron'u da `debtor-cross-case-notification.service.ts` içine gömülmek yerine **`automation.service.ts`'e yeni bir `@Cron` metodu** olarak, parametresiz `expireStaleNotifications(undefined, new Date())` çağrısıyla eklenir.

**Sessiz-başarısızlık gözlemi (RATIFIED: Q1 + P3):**
1. **resolveRecipients() boş döner** (0 avukat + 0 tebligat-staff) → owner kararı: bu teknik olarak mümkün kabul edilir ama **anomaly**'dir. DB-level invariant/constraint EKLENMEZ. Fix: mevcut `if (recipients.length === 0) continue;` satırına `logger.warn` eklenir + observability/reporting'e düşer. Notification generation diğer affected case'ler için normal devam eder.
2. **recipients bulunur AMA create()/transaction başarısız olur** → try/catch + `logger.warn` yanına mevcut Hata Logları observability altyapısına bir event hook'u.

**Reporting Model:** 6+ rapor önerisi ayrı efor değildir — hepsi TEK `prisma.debtorCrossCaseNotification.groupBy()` ailesinin parametrik filtreleridir, yeni tablo/migration gerektirmez.

**Migration kilidi (RATIFIED: P3):** Önerilen 2 endpoint + rapor sorguları **mevcut şema (schema.prisma:1390-1428) ile birebir karşılanır, EK KOLON/MİGRASYON GEREKMEZ.**

**UI Responsibilities:** Ofis-içi "görülmemiş bildirimlerim" listesi (self-scoped) + acknowledge butonu. Acknowledge butonu, sabit-değiştirilemez şekilde şu ibareyle render edilmeli:

```
Gördüm.
Bu kayıt yalnızca bildirimi gördüğümü gösterir;
hukuki işlem yaptığım, kabul ettiğim veya riski giderdiğim anlamına gelmez.
```

(Owner önerisi — acknowledge ≠ hukuki kabul ≠ önlem alındı ≠ dosya işlemi tamamlandı.)

**Future Extension Rules:** Bu yüzey ESF'yi BEKLEMEZ — kendine özel basit REST + basit liste UI olarak yapılır.

### 4.4 ESF — Entity Status Framework (AYRI-EPIC, RATIFIED: P5)

- **Aggregate Root:** OLMAMALI — bu bir **read-model/projeksiyon katmanı**, persist edilen state'i yok.
- **Ownership:** Hiçbir tek domain modülüne ait değil; paylaşılan tip mekanizmasında.
- **Tasarım:** Yeni Prisma modeli DEĞİL. Paylaşılan `EntityStatusIndicator` TypeScript arayüzü + her domainin kendi salt-okuma provider fonksiyonu (adapter pattern, tablo değil):
```typescript
interface EntityStatusIndicator {
  sourceFramework: string;   // "DEBTOR_CROSS_CASE" | "DEBTOR_ISSUE" | "POA_EXPIRY" | ...
  severity: "INFO" | "WARNING" | "CRITICAL";
  label: string;             // PII-sızdırmaz, ADR-011 uyumlu sabit etiket
  count?: number;
  status: "PENDING" | "ACKNOWLEDGED" | "RESOLVED" | "NONE";
  detailRef?: { targetType: string; targetRef: string };
}
```
- **D6A-2 → ESF köprüsü (read-only):** Ayrı bir provider `debtorCrossCaseNotification.findMany` ile PENDING kayıtları okur, indicator'a map eder. **YAZMA yetkisi OLMAZ** — create/update yalnız `DebtorCrossCaseNotificationService` üzerinden.
- **MALİYET ÖN-KOŞULU:** "sadece bir interface" ucuz değildir — bugün BE/FE tipleri elle senkron tutuluyor, paylaşılan paket YOK. Yeni bir workspace paketi + build/export/tsconfig-path zinciri gerekebilir. **Bu netleşene kadar ESF GO-ANALYZE seviyesinde kalır.**

### 4.5 IAF — Internal Alert Feed (AYRI-EPIC, RATIFIED: P6)

- **Aggregate Root:** Yeni ve BAĞIMSIZ `InternalAlert` modeli (üç mevcut tabloyu tek generic/polymorphic tabloya sıkıştırmak referans-bütünlüğünü bozar).
- **PoaExpiryNotificationDelivery vs DebtorCrossCaseNotification = tekrar DEĞİL, kasıtlı izolasyon.**
- **Option C Hybrid KORUNUR (RATIFIED):** Yeni `InternalAlert` yalnız **(a)** üçüncü bağımsız kalıcı-bildirim ihtiyacı doğduğunda **VE (b)** gerçek bir merkezi UI yüzeyi (bell/feed) kararlaştırıldığında açılır. Bugün ikisi de gerçekleşmedi.

---

## 5. OWNER KARAR NOKTALARI

### 5.1 Zaten OWNER-LOCKED (repo-kanıtlı, değiştirilmez)
| # | Karar | Kanıt |
|---|---|---|
| L1 | D6A-1 pull/computed banner canlı ve doğru DERIVED | PR #878, test 9/9 |
| L2 | D6A-2 çekirdek üretimi (fieldGroup 4-grup, recipient resolution, dedupeKey, ADR-011 changeSummary) canlı | PR #880, test 20 it() |
| L3 | CONTACT (phone/email) tetikleyici DIŞINDA | kod satır 22 + test 5-6 |
| L4 | AddressService birincil + DebtorService ikincil yol ikisi de tetikliyor | test 16-19, owner-review commit `36690e6a` |
| L5 | acknowledged ≠ hukuki kabul (changeSummary sabit etiket) | ADR-011, schema yorumu |

### 5.2 RATIFIED (2026-07-04, owner chat onayı — LOCKED)
| # | Karar | Statü |
|---|---|---|
| P1 | Kanonik isimlendirme (D6A-1 / D6A-2 / D6A-2-SURFACE / ESF / IAF; "D6B" emekli) | **LOCKED** |
| P2 | Yapıştırılan `DebtorCrossCaseImpactNotification` modeli İMPLEMENTE EDİLMEZ (tam duplikasyon) | **LOCKED** |
| P3 | D6A-2-SURFACE = list/ack endpoint (self-scoped, JWT-zorunlu) + cron + sessiz-başarısızlık logu; migration SIFIR | **LOCKED**, backlog: `D6A-2-SURFACE-1` (READY) |
| P4 | Cron `automation.service.ts`'e eklenir (servise gömülmez) | **LOCKED** |
| P5 | ESF = paylaşılan TS arayüzü + provider pattern (yeni Prisma modeli değil); GO-ANALYZE'da kalır | **LOCKED**, backlog: `ESF-1` |
| P6 | IAF Option C korunur, tetik eşiği (a)+(b) netleşti | **LOCKED**, backlog: `IAF-1` |
| P7 | Collection/Tebligat traverse-etmeme gerekçesi güncellendi (teknik değil kavramsal sınır — D5 artık FK'li) | **LOCKED** |
| P8 | D6A-1/D6A-2 retroaktif olarak decision-log'a işlendi | **LOCKED** — bu FAZ 0 ile tamamlandı |

### 5.3 Hâlâ CEVAPSIZ (OWNER_DECISION_PENDING — D6A-2-SURFACE implementasyon teklifinden önce/sırasında ele alınmalı)
| # | Soru |
|---|---|
| Q1 | ~~Prod'da bir aktif Case'in hiç CaseLawyer'ı + hiç TEBLIGAT-staff'ı olması mümkün mü?~~ **ANSWERED (2026-07-04, bkz. Bölüm 0):** Evet, mümkün kabul edilir, anomaly sayılır; DB-level invariant eklenmez, `logger.warn` + observability yeterli. |
| Q2 | EXPIRED/ACKNOWLEDGED kayıtlar için retention/purge politikası ne olmalı? (KVKK saklama-süresi) |
| Q3 | `recipientUserId` FK'sinin User `onDelete` davranışı (Cascade/SetNull/Restrict) nedir? Personel ayrılınca PENDING bildirimler ne olur? |
| Q4 | changeSummary sabit-Türkçe-string kararı kalıcı mı? (i18n/export ihtiyacı çıkarsa backward-incompatible) |
| Q5 | "Adres/kritik alan değişti + borçlunun aktif Tebligat/Collection süreci var" senaryosu ayrı backlog maddesi mi? (D5 FK artık var, kavramsal sınır kararı gerekli) |
| Q6 | acknowledge veri modeline "gördüm" ≠ "önlem aldım" ayrımı için ayrı `actionTakenAt`/not alanı eklenmeli mi? |

---

## 6. RİSKLER / ANTI-PATTERN UYARILARI

**R1 (HIGH) — D6A-2 bugün production'da EKSİK:** Cron yok → PENDING kayıtlar sınırsız birikiyor; acknowledge endpoint'i yok → kimse kapatamıyor. Bu bir "gelecek iyileştirme" değil, **şu an var olan işlevsel boşluk**. D6A-2-SURFACE-1 bu boşluğu kapatır.

**R2 (HIGH) — İki sessiz-başarısızlık yolu:** (1) resolveRecipients boş → iz yok, (2) create() hata → sadece logger.warn. Avukatlık Kanunu m.34 özen borcu açısından iki yönde riskli. Q1 owner cevabı ile gözlem-seviyesinde (log+observability) çözüme bağlandı; DB-constraint bilinçli olarak ertelendi.

**R3 (HIGH) — Governance 3. kez atlanma riski (PROAKTİF, bu FAZ 0 ile kapatıldı):** D6A-1/D6A-2 governance dosyalarına hiç yazılmadan merge edildi. Bu belge + FAZ 0 governance kaydı bu açığı retroaktif olarak kapatır. **D6A-2-SURFACE implementasyonu, bu FAZ 0 tamamlanıp backlog'a işlenmeden başlamaz** — bu ilke owner tarafından da doğrulandı.

**R4 (MEDIUM) — KVKK m.12 yanlış bağlanmıştı:** Governance-trail sorunu KVKK m.12'nin konusu DEĞİL; bu bir CLAUDE.md süreç ihlali / kurumsal hesap-verebilirlik sorunudur.

**R5 (MEDIUM) — Tebligat m.35 kategori hatası düzeltildi:** D6A-2'nin Collection/Tebligat'a dokunmaması "yanlış adrese tebligat riski" değil; D6 bir bildirim mekanizması, adres-senkronizasyon mekanizması değil.

**R6 (MEDIUM) — acknowledge veri modeli eksik ayrım:** "gördüm" ile "önlem aldım" ayrılmıyor. UI-copy ile (Bölüm 4.3) kısmen ele alındı; Q6 kalıcı çözüm için açık.

**R7 (MEDIUM) — i18n:** changeSummary sabit Türkçe — bugün doğru (proje "her zaman Türkçe" ilkesi) ama Q4 ile kararlaştırılmalı.

**R8 (Doğrulanmış anti-pattern'ler — KORUNUR):** Event-bus kurmak, DERIVED/EVENT_SOURCED'i tek modelde eritmek, her alan değişikliğini tetiklemek → gerçek riskler, doğru kaçınıldı. Prisma enum yasağı NÜANSLI: D6A-2'nin kendi iç enum'ları doğru; yasak yalnız ESF'nin genel/çok-modüllü alanı için geçerli.

---

## 7. SOMUT SIRADAKİ ADIMLAR (sıralı)

**FAZ 0 — Governance düzeltmesi (docs-only) — BU BELGE İLE TAMAMLANDI:**
1. D6A-1/D6A-2 retroaktif `decision-log.md`'ye işlendi (P8).
2. Bu belge governance'a "D6 Final Architecture" olarak eklendi.
3. `product-backlog.md`'ye `D6A-2-SURFACE-1` / `ESF-1` / `IAF-1` eklendi.
4. Q1 owner tarafından cevaplandı.

**FAZ 1 — D6A-2-SURFACE (GO-IMPLEMENT'e HAZIR, ayrı teklif gerekir):** P3+P4. Migration SIFIR. Q2-Q6 (retention, FK-onDelete, i18n, Tebligat-köprü, action-note) implementasyon sırasında veya öncesinde triage edilmeli.

**FAZ 2 — ESF (GO-ANALYZE'da kalır):** P5. Önce "paylaşılan tip paketi var mı" ön-koşulu netleşmeli.

**FAZ 3 — IAF (owner-gated, beklemede):** P6. Tetik eşiği (a)+(b) gerçekleşene kadar açılmaz.

Fazlar birbirini bloklamaz.

---

## 8. KARAR LİSTESİ (owner formatı — FINAL)

| Boyut | Karar (tek satır) | STATUS |
|---|---|---|
| **Aggregate Root** | D6A-1=projeksiyon(yok); D6A-2=`DebtorCrossCaseNotification`; ESF/IAF=read-model/yeni-bağımsız | LOCKED |
| **Ownership** | D6A-1+D6A-2=`debtor` modülü; ESF=paylaşılan katman; IAF=yeni modül | LOCKED |
| **Lifecycle** | 3-değerli PENDING/ACKNOWLEDGED/EXPIRED (5-değerli pasted-doc reddedildi) | LOCKED |
| **Notification Model** | fieldGroup 4-grup, CONTACT dışlanmış; yeni `Impact` modeli İMPLEMENTE EDİLMEYECEK | LOCKED |
| **Recipient Resolution** | isResponsible→fallback-avukat→TEBLIGAT-staff; boş-dönüş LOGLANACAK, DB-constraint YOK | LOCKED |
| **Audit Strategy** | logInTransaction + sabit changeSummary (ADR-011); + iki sessiz-fail gözlemi | LOCKED |
| **Entity Status Integration** | ESF ayrı epic; D6A-2 salt-okuma provider ile besler; endpoint ESF'yi beklemez | LOCKED |
| **API Contract** | GET list + POST acknowledge, tenantId+recipientUserId JWT-zorunlu türetme | LOCKED |
| **DTO Contract** | Dar DTO (fileNumber+fieldGroup+severity+changeSummary+status), ham PII yok | LOCKED |
| **Persistence Model** | Mevcut şema yeterli, EK MİGRASYON YOK | LOCKED |
| **Reporting Model** | Tek groupBy ailesi; yeni tablo yok | LOCKED |
| **UI Responsibilities** | Self-scoped "görülmemiş bildirimlerim" + acknowledge; "yalnız görüldü" sabit ibaresi | LOCKED |
| **Future Extension Rules** | IAF eşiği (a)+(b); enum-yasağı yalnız ESF-genel; Collection/Tebligat=kavramsal sınır | LOCKED |

---

**GOVERNANCE NOTU:** P1-P8 owner tarafından 2026-07-04 tarihinde chat üzerinden ratifiye edilmiştir (Bölüm 0). Q2-Q6 hâlâ açıktır ve D6A-2-SURFACE-1 için ayrı GO-IMPLEMENT teklifi hazırlanırken veya owner tarafından ayrıca ele alınmalıdır. Bu belge `product-backlog.md` (D6A-2-SURFACE-1/ESF-1/IAF-1) ve `decision-log.md` (2026-07-04 satırları) ile birlikte okunmalıdır.
