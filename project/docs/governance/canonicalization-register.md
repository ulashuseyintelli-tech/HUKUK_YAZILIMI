# Canonicalization Register

**Durum:** Living document — governance kaydı, implementasyon değil.
**Son güncelleme:** 2026-07-11 (PR-A4-0 rich-interest/UYAP readiness inventory governance closure)
**Kaynak:** `canonicalizationsiniflandirmaraporu.md` (kullanıcı tarafından sağlanan sınıflandırma raporu) + repo kodu doğrulaması, base commit `e65dc08564c09bfbe6db09a680606ac3d4b1f828`.
**İlişkili dosya:** `canonicalization-policy.md` (sınıflandırma tanımları ve uygulama kuralları için bağlayıcı kaynak; bu register yalnız veri/kayıt tutar).

Bu register `active-roadmap.md` / `product-backlog.md` / `decision-log.md` / `master-triage-register.md` ile birlikte okunmalıdır, onların yerine geçmez. Buradaki hiçbir madde otomatik olarak implementasyona alınmaz; her biri ayrı GO-IMPLEMENT yetkisi gerektirir.

---

## 0. Sınıflandırma Özeti

| Kategori | Anlamı | Aksiyon önceliği |
|---|---|---|
| **ARCHITECTURAL_DRIFT** | Planlanmamış, organik çoğalmış çoklu-yazıcı / canonical bypass | Önce temizlenir |
| **DEAD_CODE** | Import/call/write path yok | Veri kontrolü sonrası temizlenir |
| **CUTOVER** | Bilinçli, devam eden legacy→canonical geçişi | Canonical bitene kadar korunur; yeni geliştirme yalnız canonical tarafa |
| **INTENTIONAL_BOUNDED_CONTEXT** | Duplicate gibi görünen kasıtlı ayrı domain sınırı | Dokunulmaz |

Tanımların ve uygulama kurallarının bağlayıcı metni `canonicalization-policy.md` içindedir.

---

## 1. Register Tablosu

| ID | Domain | Current Parallel Path | Canonical Owner | Classification | Action | Priority | Risk | Confidence |
|---|---|---|---|---|---|---|---|---|
| CAN-DRIFT-01 | icrabot notification | `send_email`/`send_sms` provider-success olmadan `status:'sent'` yazma sorunu PR #981 / `CAN-P0-001` ile remediate edildi; remaining follow-up: schema default kararı + webhook ghost/fake-sent hattı (`CAN-P0-008`) | Gerçek provider entegrasyonu (henüz yok) | ARCHITECTURAL_DRIFT (remediated for email/SMS) | monitor follow-ups | P0 (closed for email/SMS) | Critical | High |
| CAN-DRIFT-02 | icrabot ↔ Case | `job-monitor.service.ts:136,174`, `icrabot.service.ts:118,358`, `task-orchestrator.service.ts:307`, `action-handler.service.ts:571` — doğrudan `prisma.case.update` | `CaseService` | ARCHITECTURAL_DRIFT | fix | P0 | High | High |
| CAN-DRIFT-03 | Case workflow | `workflowStage` alanına `workflow-engine.service.ts:262`, `icrabot.service.ts:361`, `task-orchestrator.service.ts:301`, `scheduler.service.ts:74,107,294,658`, `case.service.ts` ayrı ayrı yazıyor; tek owner servis yok | `CaseWorkflowStageService` (henüz yok) | ARCHITECTURAL_DRIFT | fix | P0 | High | High |
| CAN-DEAD-01 | Case stage history | `CaseStageHistory` yalnız `state-machine.service.ts:314` `updateMany` ile kapatılıyor; hiç `create` yok | `CaseLifecycle` veya tamamlanacak `CaseStageHistory` | DEAD_CODE (yarım özellik) | needs-owner-decision | P1 | Medium-High | High |
| CAN-DEAD-02 | AddressMissingTask | Yalnız `debtor.service.ts:916` `.count()` okuması var; hiçbir yerde create/update bulunamadı | `AddressTask`/`Task` | DEAD_CODE | inventory → delete | P1 | Low | Medium |
| CAN-DEAD-03 | GreetingQueue | Yalnız `schema.prisma:4674`; kodda sıfır referans | `ClientNotification` | DEAD_CODE | inventory → delete | P1 | Low | High |
| CAN-DEAD-04 | Notifications FE | `components/notifications/*` dışarıdan hiç import edilmiyor | `settings/notifications` aktif sayfası | DEAD_CODE | delete | P1 | Low | High |
| CAN-DEAD-05 | AutoReminderRules | `auto-reminder-rules.tsx:44,52,58` yalnız localStorage; dışarıdan import yok | Task/Calendar backend (product kararı) | DEAD_CODE | delete | P1 | Low | High |
| CAN-DEAD-06 | LawyerCalendar | `lawyer-calendar.tsx:27-35` hardcoded mock event array; dışarıdan import yok | `CalendarService` `/calendar/events` | DEAD_CODE | delete | P1 | Low | High |
| CAN-CUT-01 | Due / ClaimItem | `DueModal` + `ClaimItemPanel` aynı case detay sayfasında paralel render (`cases/[id]/page.tsx:63,68,2806,3974`) | `ClaimItem` + `interest-engine` | CUTOVER | pr-a4-0-tool-implemented / real-tenant-review-required / cutover-not-authorized | P1 | Critical | High |
| CAN-CUT-02 | Hesap Özeti / interest-engine | `case.service.ts:3826-3866` `getCalculationSummary` faiz=0 stub, `TODO: interest-engine entegrasyonu tamamlandığında aktif edilecek`; `BalanceShadowDiffPanel` zaten mevcut | `interest-engine` (`case-balance.service.ts`) | CUTOVER | needs-owner-decision (guard) | P1 | Critical | High |
| CAN-CUT-03 | DebtorAddress | Bare `AddressService` vs `DebtorService.updateAddress/deleteAddress` (nested, `debtor.service.ts:1417,1587`); `debtor-address-canonical.spec.ts` canonical mapping testi mevcut | `AddressService` | CUTOVER | adapter | P1 | Medium-High | High |
| CAN-CUT-04 | validation-gate / policy-engine | `validation-gate.service.ts:9` `@deprecated ... Phase 3 sonunda silinecek` ama satır 89-110'da canlı, controller tarafından çağrılan pre-haciz risk endpoint'i var | `policy-engine` | CUTOVER | adapter | P1 | Medium-High | High |
| CAN-CUT-05 | ClaimItemPanel recalculate | `ClaimItemPanel.tsx:133` → `claim-item.controller.ts:179-185` çalışıyor (404 değil); FE yorumunda "deprecated recalculate/add-interest uçları" | `interest-engine` | CUTOVER | needs-owner-decision | P2 | Medium | High |
| CAN-IBC-01 | IcrabotTask | `action-handler.service.ts:596` gerçek `.create()` çağrısı; icrabot'un kendi task modeli | icrabot (kendi bounded context'i) | INTENTIONAL_BOUNDED_CONTEXT | do-not-touch | P2 | Low | High |

---

## 2. Madde Detayları — Required Verification & Acceptance Criteria

### CAN-DRIFT-01 — icrabot notification truth
- **Status update (2026-07-09, GOV-REGISTER-SYNC-001):** Email/SMS fake-sent write path'i `CAN-P0-001` kapsamında remediate edildi (PR #981, `action-handler.service.ts` + `action-handler-notification-truth.spec.ts`). Bu register satırı artık yeni bir email/SMS implementasyon yetkisi vermez.
- **Remaining follow-ups:** (1) `IcrabotEmailLog`/`IcrabotSmsLog` `@default("sent")` schema-default owner kararı, (2) webhook action handler / `IcrabotWebhookLog` ghost model ve fake-sent pattern doğrulaması (`CAN-P0-008`). Bunlar ayrı follow-up/monitoring konularıdır; CAN-DRIFT-01 email/SMS kapanışını geri açmaz.
- **Required verification:** `IcrabotEmailLog`/`IcrabotSmsLog.status` alanını okuyan bir frontend ekranı veya rapor var mı taranmalı.
- **Acceptance criteria:** Provider success dönmeden hiçbir kayıt `sent` yazmaz; test provider mock success olmadan `sent` yazılmadığını doğrular; `send_notification` (status alanı yok) kapsam dışıdır.

### CAN-DRIFT-02 — icrabot → Case bypass
- **Required verification:** Bot + kullanıcı concurrent update senaryosunda `CaseService` canonical yoldan geçirildiğinde davranış farkı var mı.
- **Acceptance criteria:** icrabot modülündeki tüm `Case` update'leri `CaseService` (veya iç canonical command) üzerinden geçer; yeni kodda doğrudan `prisma.case.update` kalmaz.

### CAN-DRIFT-03 — workflowStage single owner
- **Required verification:** Mevcut 4 yazıcı için characterization test; caseStatus tekilleştirme deseninin workflowStage'e taşınmadan önce güncel repo üzerinde tekrar doğrulanması gerekir.
- **Acceptance criteria:** `CaseWorkflowStageService` oluşturulur; state-machine, workflow-engine, icrabot, scheduler aynı API'yi çağırır; doğrudan `prisma.case.update({ workflowStage })` yeni kodda kalmaz.

### CAN-DEAD-01 — CaseStageHistory
- **Required verification:** Tabloda veri var mı, rapor/audit tüketicisi var mı.
- **Acceptance criteria:** Owner kararı belgelenir: ya `create()` mekanizması tamamlanır ya da `CaseLifecycle` canonical ilan edilip `CaseStageHistory` deprecate edilir. Karar verilmeden silme yapılmaz.

### CAN-DEAD-02 — AddressMissingTask
- **Required verification:** DB'de satır sayısı; gizli/dolaylı bir yazım yolu (örn. raw SQL, migration seed) olup olmadığı kontrol edilir.
- **Acceptance criteria:** Veri yoksa migration ile kaldırılır; veri varsa temizlik ertelenir ve okuma yolu belgelenir.

### CAN-DEAD-03 — GreetingQueue
- **Required verification:** DB'de satır sayısı.
- **Acceptance criteria:** Veri yoksa migration ile kaldırılır.

### CAN-DEAD-04 — components/notifications/*
- **Required verification:** Build sonrası import grafiği tekrar doğrulanır (bu registerin oluşturulduğu tarihte zaten boş bulundu).
- **Acceptance criteria:** Import doğrulaması sonrası dizin silinir; build/test kırılmaz.

### CAN-DEAD-05 — AutoReminderRules
- **Required verification:** Product kararı: hatırlatıcı gerçek bir backend'e mi bağlanacak yoksa kaldırılacak mı.
- **Acceptance criteria:** Karar belgelenir; kaldırma yönünde karar çıkarsa import yokluğu teyit edilip component silinir.

### CAN-DEAD-06 — LawyerCalendar
- **Required verification:** Product kararı: gerçek `/calendar/events` API'sine mi bağlanacak yoksa kaldırılacak mı.
- **Acceptance criteria:** Karar belgelenir; kaldırma yönünde karar çıkarsa import yokluğu teyit edilip component silinir.

### CAN-CUT-01 — Due / ClaimItem
- **Disposition:** **OPEN / CUTOVER NOT AUTHORIZED.** VER-05 **OPEN / PR-1A + PR-1B + PR-1C + PR-A2 + PR-A3 + PR-A4-0 IMPLEMENTED / REAL TENANT INVENTORY REVIEW PENDING** olarak devam eder.
- **Status update (2026-07-10, VER-05 / PR-0):** `pnpm --filter @hukuk/api inventory:due-claimitem -- --tenant <tenantId>` tenant-zorunlu, deterministic JSON+özet üreten salt-okunur envanter aracını sağlar. Sorgu tek transaction içinde `REPEATABLE READ READ ONLY` ayarlar ve yalnız SELECT/CTE kullanır; Due sync ile backfill marker'ları ayrı raporlanır, açıklama/kişisel veri dışa verilmez. Araç `MATCHED_PAIR`, `DUPLICATE_PAIR`, `AMOUNT_OR_TYPE_DRIFT`, `ORPHANED_SYNC`, `MARKER_MISSING`, `DUE_ONLY`, `CLAIM_ITEM_ONLY`, `NAFAKA_EXPECTED_DUE_ONLY` ve `EXPECTED_CANCELLED_TOMBSTONE` sınıflarını üretir.
- **Owner semantic decisions (2026-07-10, D1–D6 FROZEN):** `originalAmount` yaratılış sonrası provenance olarak korunur; `demandedAmount` canonical takip tutarı, `amount` onun geçici mirror'ıdır ve sıfır demanded değeri fallback nedeni değildir. ClaimItem→Due reverse-write yoktur. Generic Due update ile NAFAKA sınırı iki yönde geçilemez. Fatura tek KDV-dahil brüt `PRINCIPAL` üretir, KDV kırılımı `metadata.kdv` içinde kalır ve ayrı invoice `TAX_KDV` üretilmez. Normal API Due hard-delete yapmaz; passivation actor/reason/time ve immutable audit gerektirir, marker'lı ClaimItem aynı transaction'da `CANCELLED` olur. D6 schema/migration/retention ayrıntıları ayrı runtime workstream'idir.
- **Interest Boundary owner decisions (2026-07-11, PR-A0 / A1–A5 FROZEN):** `TICARI_DEGISEN=COMMERCIAL_AVANS_3095_2_2`; legacy `TICARI` yalnız compatibility mirror'dır ve hesaplama/UYAP otoritesi değildir. Principal `YOK`, actor/reason/time audit'li explicit `NO_INTEREST` niyetidir; type/code boş kalır ve `YOKSUN` değildir. `ClaimItem.interestTypeCode` kanonik finansal otorite, `Due.interestTypeCode` ingress/provenance, legacy `interestType` geçici projection'dır; reverse authority yoktur. Sabit/akdi oran `ClaimItem.interestRate` yüzde olarak persist edilir, engine decimal projection kullanır; variable-rate kod oranı null, sıfır oran `NO_INTEREST`tir. UYAP rich canonical code'dan merkezi/exhaustive üretilir; legacy-only adapter açık, unknown/ambiguous fail-closed ve sessiz fallback yasaktır. **Exact rich-code→UYAP-code tablosu frozen değildir.** PR-A0 docs-only kapanmıştır. **PR-A1, PR #1099 ile CLOSED / ADDITIVE RICH INTEREST PERSISTENCE IMPLEMENTED:** `Due.interestTypeCode` ve `ClaimItem.interestTypeCode` nullable/dormant eklendi; legacy alanlar, tarihsel satırlar ve runtime authority değişmedi. **PR-A2, PR #1106 ile CLOSED / RUNTIME IMPLEMENTED:** write admission aktiftir. **PR-A3, PR #1112 ile CLOSED / RUNTIME IMPLEMENTED:** CaseBalance read authority rich-first uygulanmıştır. **PR-A4-0, PR #1122 ile CLOSED / READ-ONLY INVENTORY TOOL IMPLEMENTED:** rich-code/UYAP readiness diagnostic'i teslim edilmiştir; gerçek tenant execution yapılmamış ve exact mapping dondurulmamıştır. PR-A4 aşağıda kayıtlı inventory-review ve owner/hukuk kabul kapılarına bağlıdır; PR-A5 yetkilendirilmemiştir. Bu kayıt backfill, exact UYAP mapping/projection, ReportService/SummaryEngine veya genel balance cutover yetkisi vermez.
- **PR-A2 runtime status (2026-07-11):** Ortak fail-closed rich-interest admission sözleşmesi aktif Step 5 UI, Due ingress, Due→ClaimItem tek yönlü bridge ve `CLAIM_ITEM_HIGH_IMPACT_CHANGE` OfficeApproval request/executor yüzeylerinde uygulanmıştır. `YOK`, actor/reason/server-time audit'li explicit `NO_INTEREST` olarak taşınır ve `YOKSUN`a çevrilmez; fixed code'larda pozitif finite yüzde zorunlu, variable-rate code'larda oran null'dır. Unknown/ambiguous değerler sessiz legacy/YASAL fallback üretmez. Nested `dues.N.interestType` doğrulama hataları kullanıcıya indeksli biçimde sunulur. Schema/migration, tarihsel mutation/backfill, read/calculation authority, UYAP projection ve cutover değişmemiştir.
- **PR-A3 runtime status (2026-07-11):** `ClaimItem.interestTypeCode`, CaseBalance/ClaimBucket hesap zincirinde canonical read authority'dir. ClaimItem legacy `interestType` yalnız `YASAL`/`TICARI`/`SABIT` strict compatibility input'udur; Case fallback yalnız ClaimItem rich ve legacy authority ikisi de yokken çalışır. Rich/legacy uyumsuzluğunda rich kazanır ve identifier/code/category içeren mirror-drift diagnostic üretilir. `NO_INTEREST` tüm faiz config ve fallback'lerini bastırır; fixed rich kodlar persisted yüzdeyi engine decimal'ına dönüştürür, variable kodlar exact RateProvider code ile ilerler. Presentation rich-first ve unknown fail-closed'dur. Write authority, schema/migration, tarihsel veri, UYAP, ReportService/SummaryEngine ve cutover değişmemiştir.
- **PR-A4-0 inventory status (2026-07-11):** `pnpm --filter @hukuk/api inventory:rich-interest-uyap -- --tenant <tenantId> --mode <summary|detailed>` tenant-scoped, deterministic ve salt-okunur readiness inventory'sidir. Tek `REPEATABLE READ, READ ONLY` transaction, yalnız SELECT/CTE ve bounded `ClaimItem.id` keyset pagination kullanır. 11 rich kod, rich/legacy mirror drift, `NO_INTEREST` audit, fixed-rate readiness, numeric `1..99` ile `FAIZT000xx` exporter çakışmaları, silent fallback ve mevduat term-provenance belirsizliği ayrı raporlanır; detailed çıktı ham metadata/açıklama içermez. Tool mapping otoritesi veya mutation/cutover yetkisi üretmez. **Gerçek tenant inventory çalıştırılmadı.**
- **PR-1A runtime status (2026-07-11):** Üç-tutar write contract tek normalizer ile ClaimItem public approval executor, internal create/update, auto-generate, rule generation, retained internal helpers ve Due→ClaimItem update sync yollarında uygulanmıştır. Normal update `originalAmount` yazmaz; `demandedAmount` ile legacy `amount` birlikte yazılır. Summary demanded mutation mevcut `CLAIM_ITEM_HIGH_IMPACT_CHANGE` approval hattına yönlendirilmiş, ilgili summary/payment-preview/case-total read yollarında canonical sıfır korunmuştur. Schema/migration ve historical data mutation yoktur.
- **PR-1B runtime status (2026-07-11):** Generic Due update `NAFAKA→non-NAFAKA` ve `non-NAFAKA→NAFAKA` geçişlerini mevcut Due tenant/case scoped okunduktan sonra ve herhangi bir Due/ClaimItem mutation'dan önce reddeder. Same-side ve type-omitted update korunur. ClaimItem, ClaimItem OfficeApproval executor ve summary demanded production yüzeylerinde Due write / `CaseService.updateDue` çağrısı static regression ile yasaklanmıştır; Due→ClaimItem bridge korunur. DueModal create modunda NAFAKA'yı sunar, edit modunda boundary-cross seçeneğini göstermez. Schema/migration ve historical data mutation yoktur.
- **Implementation disposition:** PR-1A, PR-1B, PR-1C, PR-A2, PR-A3 ve PR-A4-0 uygulanmıştır. **PR-A4 blocked:** gerçek tenant inventory execution+review, exporter authority kararı, numeric-vs-FAIZT code-space seçimi, deposit short/long semantiği, CONTRACTUAL exact mapping kabulü ve COMMERCIAL_FIXED exact mapping kabulü gerektirir. PR-A5 yetkilendirilmemiştir. PR-1D schema-migration design gerektirir. Generator hardening, precautionary-cost lifecycle, D6 ve cutover bu uygulamaların kapsamı değildir.
- **Required verification:** PR-A4-0 aracı ayrı owner/operasyon yetkisiyle açıkça seçilen tenant üzerinde salt-okunur çalıştırılmalı; sanitize çıktı gözden geçirilmeli ve exporter/rich-code sınıfları owner/hukuk mapping kararına sunulmalıdır. Koşum otomatik mutation, backfill veya follow-up yetkisi üretmez.
- **Acceptance criteria:** Envanter review ve exact mapping/authority kararları tamamlanmadan `Due` write path veya UYAP projection cutover'ı yapılmaz. PR-0, semantic-decision closure, PR-1A runtime contract, PR-A2 write admission, PR-A3 CaseBalance read authority ve PR-A4-0 diagnostic tool; gerçek tenant review, reconciliation/backfill, UYAP projection, ReportService/SummaryEngine veya genel balance consumer cutover, schema/migration ya da CAN-CUT-01 cutover yetkisi vermez. Bunların her biri sonuçlara bağlı ayrı owner-authorized workstream gerektirir.

### CAN-CUT-02 — Hesap Özeti / interest-engine
- **Required verification:** `BalanceShadowDiffPanel` shadow-diff sonuçlarının GREEN olma durumu.
- **Acceptance criteria:** Faiz=0 stub olan `Hesap Özeti` görünümü kullanıcıya birincil/doğru sonuç gibi sunulmaz (guard/etiket); cutover tamamlanana kadar legacy hesaplamaya yeni iş mantığı eklenmez.
- **Implementation owner (2026-07-09 owner reconciliation; 2026-07-09 GOV-ADR-NAMING-000 ile adlandırma netleştirildi):** `CCB-001` (bkz. `product-backlog.md`) — bu maddenin canonical calculation cutover'ının implementation-authority/master stream'i. CAN-CUT-02, CCB-001'e bağımsız/rakip bir iş akışı DEĞİLDİR; CCB-001 altında bir milestone olarak izlenir. `ADR-012` main üzerinde DX-005 / Waiting & Progress Policy için kanoniktir ve bu hatta kullanılmaz. CCB-001 WIP branch'indeki `ADR-012-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md` referansı yalnız legacy/branch-local bağlamdır; main için kanonik ADR referansı değildir. FEE/Harç/Snapshot/Journal mimari hattının kanonik hedef numarası `ADR-013` olarak ayrılmıştır ve PR #1026 ile draft owner-review ADR dosyası oluşturulmuştur; CCB-001'in kendi mimari dokümanı `ADR-014` olarak kalır. Bu not statüyü değiştirmez: madde **OPEN/needs-owner-decision (guard)** olarak kalır; kapanışı yalnız CCB-001'in bu spesifik kapsamı karşılayan, main'e merge edilmiş bir deliverable ile ayrıca ve açıkça register'a işlenir.

### CAN-CUT-03 — DebtorAddress
- **Required verification:** Bare ve nested route'ların davranış eşdeğerliği (`debtor-address-canonical.spec.ts` kapsamının yeterliliği).
- **Acceptance criteria:** Nested route `AddressService`'e delege eder (adapter); iki yol da aynı sonucu üretir; nested route'a yeni business logic eklenmez.

### CAN-CUT-04 — validation-gate / policy-engine
- **Required verification:** `validation-gate`'in satır 89-110'daki pre-haciz risk endpoint'ini hangi controller/consumer çağırıyor, aktif dış kullanıcı var mı.
- **Acceptance criteria:** İş mantığı `policy-engine`'e taşınır; `validation-gate` yalnız adapter olarak kalır; yeni business rule `validation-gate` içine eklenmez.

### CAN-CUT-05 — ClaimItemPanel recalculate
- **Required verification:** `interest-engine` geçişinin hangi aşamada olduğu; endpoint'in gerçek kullanıcı trafiği alıp almadığı.
- **Acceptance criteria:** Buton "kırık" olarak ele alınmaz (çalışıyor); interest-engine geçişi tamamlanınca ayrı kararla kaldırılır/redirect edilir; bu registerdaki karar verilmeden buton kaldırılmaz.

### CAN-IBC-01 — IcrabotTask
- **Required verification:** Yok — yalnız izleme; `Case`/`Task` gibi core aggregate'lere sızma olup olmadığı CAN-DRIFT-02 kapsamında ayrıca izlenir.
- **Acceptance criteria:** Dokunulmaz. icrabot'un kendi task modeli olarak kalır.

---

## 3. P0/P1/P2 Backlog

### P0 — Risk Durdurma (ARCHITECTURAL_DRIFT)
- CAN-DRIFT-01 — icrabot notification truth (email/SMS remediated by `CAN-P0-001`; remaining follow-ups monitored separately)
- CAN-DRIFT-02 — icrabot → Case bypass
- CAN-DRIFT-03 — workflowStage single owner

### P1 — Veri Kontrolü Sonrası Temizlik (DEAD_CODE) + Cutover Koruma (CUTOVER)
- CAN-DEAD-01 — CaseStageHistory (owner kararı)
- CAN-DEAD-02 — AddressMissingTask
- CAN-DEAD-03 — GreetingQueue
- CAN-DEAD-04 — components/notifications/*
- CAN-DEAD-05 — AutoReminderRules
- CAN-DEAD-06 — LawyerCalendar
- CAN-CUT-01 — Due / ClaimItem inventory
- CAN-CUT-02 — Hesap Özeti / interest-engine guard
- CAN-CUT-03 — DebtorAddress adapter
- CAN-CUT-04 — validation-gate → policy-engine adapter

### P2 — Düşük Öncelik / İzleme
- CAN-CUT-05 — ClaimItemPanel recalculate (owner kararı beklenir)
- CAN-IBC-01 — IcrabotTask (dokunma, yalnız izle)

---

**Onay Bekleniyor: YES** — bu register GO-ANALYZE/dokümantasyon kapsamındadır; hiçbir maddenin implementasyonu bu kayıtla başlamış sayılmaz. Her madde ayrı GO-IMPLEMENT yetkisi gerektirir.
