# Canonicalization Register

**Durum:** Living document — governance kaydı, implementasyon değil.
**Son güncelleme:** 2026-07-21 (RCV-CLAIM-FORM-P02-S05-I01 formal closure)
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
| CAN-CUT-01 | Due / ClaimItem | `DueModal` + `ClaimItemPanel` aynı case detay sayfasında paralel render (`cases/[id]/page.tsx:63,68,2806,3974`) | `ClaimItem` + `interest-engine` | CUTOVER | pr-a4-0-tool+pr-a4-2-synthetic-evidence-implemented / pr-a4-3-owner-legal-crosswalk-frozen / pr-a4-r1-dormant-contract-implemented / pr-a4-n0-shared-projection-policy-recorded / pr-a4-n1-dormant-adapter-implemented / pr-a4-n2-shared-numeric-xml-projection-active / pr-a5-1-dormant-relation-projection-batch-contract-implemented / production-empirical-evidence-absent / cutover-not-authorized | P1 | Critical | High |
| CAN-CUT-02 | Hesap Özeti / interest-engine | `case.service.ts:3826-3866` `getCalculationSummary` faiz=0 stub, `TODO: interest-engine entegrasyonu tamamlandığında aktif edilecek`; `BalanceShadowDiffPanel` zaten mevcut | Balance Engine target canonical calculation authority; target application grain `LegalCalculationBucket` | CUTOVER | allocation-authority amendment active; target persistence analysis required; PR #407 CLOSED/UNMERGED, requirements preserved, code discarded; cutover not authorized | P1 | Critical | High |
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
- **Disposition:** **OPEN / CUTOVER NOT AUTHORIZED.** VER-05 **OPEN / PR-1A + PR-1B + PR-1C + PR-A2 + PR-A3 + PR-A4-0 + PR-A4-2 + PR-A4-R1 + PR-A4-N1 + PR-A4-N2 IMPLEMENTED / PR-A4-3 D1–D9 OWNER-APPROVED / PR-A4-R1 CONTRACT + PR-A4-N1 ADAPTER CANONICAL / PR-A4-N0 SHARED PROJECTION POLICY RECORDED / PR-A4-N2 NUMERIC XML CONSUMER ACTIVE / PRODUCTION EMPIRICAL EVIDENCE ABSENT / CUTOVER NOT AUTHORIZED** olarak devam eder.
- **Status update (2026-07-10, VER-05 / PR-0):** `pnpm --filter @hukuk/api inventory:due-claimitem -- --tenant <tenantId>` tenant-zorunlu, deterministic JSON+özet üreten salt-okunur envanter aracını sağlar. Sorgu tek transaction içinde `REPEATABLE READ READ ONLY` ayarlar ve yalnız SELECT/CTE kullanır; Due sync ile backfill marker'ları ayrı raporlanır, açıklama/kişisel veri dışa verilmez. Araç `MATCHED_PAIR`, `DUPLICATE_PAIR`, `AMOUNT_OR_TYPE_DRIFT`, `ORPHANED_SYNC`, `MARKER_MISSING`, `DUE_ONLY`, `CLAIM_ITEM_ONLY`, `NAFAKA_EXPECTED_DUE_ONLY` ve `EXPECTED_CANCELLED_TOMBSTONE` sınıflarını üretir.
- **Owner semantic decisions (2026-07-10, D1–D6 FROZEN):** `originalAmount` yaratılış sonrası provenance olarak korunur; `demandedAmount` canonical takip tutarı, `amount` onun geçici mirror'ıdır ve sıfır demanded değeri fallback nedeni değildir. ClaimItem→Due reverse-write yoktur. Generic Due update ile NAFAKA sınırı iki yönde geçilemez. Fatura tek KDV-dahil brüt `PRINCIPAL` üretir, KDV kırılımı `metadata.kdv` içinde kalır ve ayrı invoice `TAX_KDV` üretilmez. Normal API Due hard-delete yapmaz; passivation actor/reason/time ve immutable audit gerektirir, marker'lı ClaimItem aynı transaction'da `CANCELLED` olur. D6 schema/migration/retention ayrıntıları ayrı runtime workstream'idir.
- **Interest Boundary owner decisions (2026-07-11, PR-A0 / A1–A5 FROZEN):** `TICARI_DEGISEN=COMMERCIAL_AVANS_3095_2_2`; legacy `TICARI` yalnız compatibility mirror'dır ve hesaplama/UYAP otoritesi değildir. Principal `YOK`, actor/reason/time audit'li explicit `NO_INTEREST` niyetidir; type/code boş kalır ve `YOKSUN` değildir. `ClaimItem.interestTypeCode` kanonik finansal otorite, `Due.interestTypeCode` ingress/provenance, legacy `interestType` geçici projection'dır; reverse authority yoktur. Sabit/akdi oran `ClaimItem.interestRate` yüzde olarak persist edilir, engine decimal projection kullanır; variable-rate kod oranı null, sıfır oran `NO_INTEREST`tir. UYAP rich canonical code'dan merkezi/exhaustive üretilir; legacy-only adapter açık, unknown/ambiguous fail-closed ve sessiz fallback yasaktır. **Exact rich-code→UYAP-code tablosu frozen değildir.** PR-A0 docs-only kapanmıştır. **PR-A1, PR #1099 ile CLOSED / ADDITIVE RICH INTEREST PERSISTENCE IMPLEMENTED:** `Due.interestTypeCode` ve `ClaimItem.interestTypeCode` nullable/dormant eklendi; legacy alanlar, tarihsel satırlar ve runtime authority değişmedi. **PR-A2, PR #1106 ile CLOSED / RUNTIME IMPLEMENTED:** write admission aktiftir. **PR-A3, PR #1112 ile CLOSED / RUNTIME IMPLEMENTED:** CaseBalance read authority rich-first uygulanmıştır. **PR-A4-0, PR #1122 ile CLOSED / READ-ONLY INVENTORY TOOL IMPLEMENTED:** rich-code/UYAP readiness diagnostic'i teslim edilmiştir; gerçek tenant execution yapılmamış ve exact mapping dondurulmamıştır. PR-A4 aşağıda kayıtlı inventory-review ve owner/hukuk kabul kapılarına bağlıdır; PR-A5 yetkilendirilmemiştir. Bu kayıt backfill, exact UYAP mapping/projection, ReportService/SummaryEngine veya genel balance cutover yetkisi vermez.
- **PR-A2 runtime status (2026-07-11):** Ortak fail-closed rich-interest admission sözleşmesi aktif Step 5 UI, Due ingress, Due→ClaimItem tek yönlü bridge ve `CLAIM_ITEM_HIGH_IMPACT_CHANGE` OfficeApproval request/executor yüzeylerinde uygulanmıştır. `YOK`, actor/reason/server-time audit'li explicit `NO_INTEREST` olarak taşınır ve `YOKSUN`a çevrilmez; fixed code'larda pozitif finite yüzde zorunlu, variable-rate code'larda oran null'dır. Unknown/ambiguous değerler sessiz legacy/YASAL fallback üretmez. Nested `dues.N.interestType` doğrulama hataları kullanıcıya indeksli biçimde sunulur. Schema/migration, tarihsel mutation/backfill, read/calculation authority, UYAP projection ve cutover değişmemiştir.
- **PR-A3 runtime status (2026-07-11):** `ClaimItem.interestTypeCode`, CaseBalance/ClaimBucket hesap zincirinde canonical read authority'dir. ClaimItem legacy `interestType` yalnız `YASAL`/`TICARI`/`SABIT` strict compatibility input'udur; Case fallback yalnız ClaimItem rich ve legacy authority ikisi de yokken çalışır. Rich/legacy uyumsuzluğunda rich kazanır ve identifier/code/category içeren mirror-drift diagnostic üretilir. `NO_INTEREST` tüm faiz config ve fallback'lerini bastırır; fixed rich kodlar persisted yüzdeyi engine decimal'ına dönüştürür, variable kodlar exact RateProvider code ile ilerler. Presentation rich-first ve unknown fail-closed'dur. Write authority, schema/migration, tarihsel veri, UYAP, ReportService/SummaryEngine ve cutover değişmemiştir.
- **PR-A4-0 inventory status (2026-07-11):** `pnpm --filter @hukuk/api inventory:rich-interest-uyap -- --tenant <tenantId> --mode <summary|detailed>` tenant-scoped, deterministic ve salt-okunur readiness inventory'sidir. Tek `REPEATABLE READ, READ ONLY` transaction, yalnız SELECT/CTE ve bounded `ClaimItem.id` keyset pagination kullanır. 11 rich kod, rich/legacy mirror drift, `NO_INTEREST` audit, fixed-rate readiness, numeric `1..99` ile `FAIZT000xx` exporter çakışmaları, silent fallback ve mevduat term-provenance belirsizliği ayrı raporlanır; detailed çıktı ham metadata/açıklama içermez. Tool mapping otoritesi veya mutation/cutover yetkisi üretmez. **Gerçek tenant inventory çalıştırılmadı.**
- **PR-A4-2 diagnostic fixture status (2026-07-12):** PR #1130 (squash `dbdb1f026f5f53a228b903c8b388ec977eff68a2`) ve eksik FAIZT-only dalını kapatan coverage repair PR #1131 (squash `e06a5e0a6f4d3eb2f2d81b8cac4d1352b4ff6ee5`) **CLOSED / CANONICAL DIAGNOSTIC FIXTURE IMPLEMENTED** durumundadır. Disposable test DB'ye özel machine-readable manifest 36 persisted + 2 classifier-only fixture taşır; 11/11 rich code, integrity, `NO_INTEREST`, fixed/variable, altı mevduat kodunun SHORT/LONG/AMBIGUOUS dalları ve `EQUIVALENT/CONFLICT/NUMERIC_ONLY/FAIZT_ONLY/MISSING/SILENT_FALLBACK_RISK` exporter ilişkileri deterministic summary JSON + detailed NDJSON golden ile doğrulanır. Test-only fail-closed AST guard numeric ve FAIZT production mapping/fallback kaynaklarını çalıştırmadan gözlemler; XML/exporter/submit çağrısı yoktur. **Synthetic evidence AVAILABLE ve observed exporter-model parity VERIFIED; production empirical evidence ABSENT; exact legal/UYAP mapping NOT DECIDED.** Bu teknik kanıt exporter authority veya legal mapping kabulü değildir.
- **PR-A4-3 owner/legal crosswalk decisions (2026-07-12, D1–D9 FROZEN):** `LEGAL_3095` numeric `1` / FAIZT `FAIZT00002`; `COMMERCIAL_AVANS_3095_2_2` numeric `4` / FAIZT `FAIZT00007` ve `TTK_1530`dan ayrı canonical identity; `TTK_1530` numeric `2` / FAIZT `FAIZT00017` ve korunmuş legal-basis provenance; `CONTRACTUAL` numeric `6`, pozitif kullanıcı oranı zorunlu, FAIZT unverified/fail-closed; `COMMERCIAL_FIXED` iki code-space'te unverified/fail-closed. Deposit SHORT/LONG canonical identity değildir; yalnız açık legal-basis veya projection context ile seçilebilir. Tek canonical crosswalk bağımsız numeric/FAIZT sütunlarını yönetir; mekanik dönüşüm ve exporter→domain ters otoritesi yasaktır. Accepted hücreler `OWNER_LEGAL_ACCEPTED`, unverified hücreler fail-closed, `VERIFIED_OFFICIAL=NONE`dir. Synthetic evidence production evidence değildir; production empirical evidence `ABSENT / RESIDUAL RISK` kalır. Bu karar runtime mapping, exporter/projection, XML/submit, schema/migration, backfill veya cutover yetkisi vermez.
- **Supersession effect:** PR-A4-3, yukarıdaki PR-A0/PR-A4-2 dönemsel `exact mapping frozen değildir / NOT DECIDED` statüsünü yalnız açıkça seçilen hücreler için ileriye dönük `OWNER_LEGAL_ACCEPTED` olarak değiştirir. Unverified hücreler ve `VERIFIED_OFFICIAL=NONE` statüsü korunur.
- **PR-A4-R1 dormant contract status (2026-07-12):** PR #1158 (squash `4daac1375888a83abbe8e0eba267038299397cc1`) typed, immutable ve exhaustive canonical crosswalk registry'sini **CLOSED / CANONICAL / DORMANT CONTRACT IMPLEMENTED** olarak teslim etti. Seçili D1–D9 hücreleri `OWNER_LEGAL_ACCEPTED`, kalan hücreler code-less `UNVERIFIED / FAIL-CLOSED` kalır; `VERIFIED_OFFICIAL=NONE` ve production empirical evidence `ABSENT` durumları değişmez. Production consumer/import, numeric veya FAIZT exporter wiring, XML/submit enforcement, schema/migration/backfill ve cutover yoktur; bunlar bu kayıtla yetkilendirilmez.
- **PR-A4-N0 shared projection activation policy (2026-07-12):** Numeric UYAP preview, download ve case-bazlı submit tek shared projection authority kullanır; endpoint'e özgü ikinci mapper veya duplicate canonical projection oluşturulmaz. Legacy-only yol strict compatibility ile sınırlıdır; unknown, ambiguous ve unverified projection fail-closed olur, silent fallback yasaktır. Bu policy yalnız aktivasyon mimarisi ve yetki sınırını tanımlar: runtime consumer, numeric/FAIZT exporter wiring, submit payload/enforcement, production activation, schema/migration/backfill ve cutover `NOT AUTHORIZED` kalır. Shared runtime activation ve submit payload değişikliği ayrı explicit owner authorization ister. İlk eligible teknik iş `PR-A4-N1 — Dormant Numeric Projection Adapter`dır; bu kayıt N1'i implemente etmez veya yetkilendirmez.
- **PR-A4-N1 dormant numeric projection adapter status (2026-07-13):** PR #1172 canonical crosswalk'u tek numeric projection authority olarak kullanan typed, immutable ve deterministic adapter'ı **CLOSED / CANONICAL / DORMANT** olarak teslim eder. Unknown/unverified/ambiguous durumlar, rich/legacy mismatch, invalid fixed/variable rate ve explicit valid start-date eksikliği fail-closed olur; silent `99`, `dueDate` inference ve yeni mapping yoktur. Yalnız lossless legacy-only `YASAL → LEGAL_3095` strict compatibility korunur; tutarlı `NO_INTEREST` ayrı omission sonucudur. Production consumer/import, numeric/FAIZT exporter wiring, preview/download, XML/submit, schema/migration/backfill, production data ve cutover değişmez.
- **PR-A4-N2 shared numeric XML projection status (2026-07-13):** PR #1176 preview/download/submit payload'ın ortak `UyapXmlService.generateFromCase()` yolunu PR-A4-N1 adapter + canonical crosswalk'a bağlar ve **CLOSED / CANONICAL / SHARED NUMERIC XML PROJECTION ACTIVE** durumundadır. `PROJECTED` canonical numeric kodu, `NO_INTEREST` faiz-elementi omission'ını üretir; diğer sonuçlar tek sanitize fail-closed boundary'den çıkar. Aktif numeric `99`, `dueDate` başlangıç fallback'i ve exporter-içi duplicate mapper kaldırılmıştır. Tek production consumer `UyapXmlService`; submit execution/authorization/approval/idempotency/audit, FAIZT, crosswalk, schema/migration/backfill ve DB-write değişmez. Production evidence yoktur ve bu kayıt cutover yetkisi vermez.
- **PR-1A runtime status (2026-07-11):** Üç-tutar write contract tek normalizer ile ClaimItem public approval executor, internal create/update, auto-generate, rule generation, retained internal helpers ve Due→ClaimItem update sync yollarında uygulanmıştır. Normal update `originalAmount` yazmaz; `demandedAmount` ile legacy `amount` birlikte yazılır. Summary demanded mutation mevcut `CLAIM_ITEM_HIGH_IMPACT_CHANGE` approval hattına yönlendirilmiş, ilgili summary/payment-preview/case-total read yollarında canonical sıfır korunmuştur. Schema/migration ve historical data mutation yoktur.
- **PR-1B runtime status (2026-07-11):** Generic Due update `NAFAKA→non-NAFAKA` ve `non-NAFAKA→NAFAKA` geçişlerini mevcut Due tenant/case scoped okunduktan sonra ve herhangi bir Due/ClaimItem mutation'dan önce reddeder. Same-side ve type-omitted update korunur. ClaimItem, ClaimItem OfficeApproval executor ve summary demanded production yüzeylerinde Due write / `CaseService.updateDue` çağrısı static regression ile yasaklanmıştır; Due→ClaimItem bridge korunur. DueModal create modunda NAFAKA'yı sunar, edit modunda boundary-cross seçeneğini göstermez. Schema/migration ve historical data mutation yoktur.
- **Implementation disposition:** PR-1A, PR-1B, PR-1C, PR-A2, PR-A3, PR-A4-0, PR-A4-2, dormant contract PR-A4-R1, adapter PR-A4-N1, shared numeric XML consumer PR-A4-N2 ve dormant FAIZT relation/projection/batch contract PR-A5-1 uygulanmıştır; PR-A4-3 owner/legal mapping kararını, PR-A4-N0 shared projection policy'sini dondurur. **PR-A4-N2 numeric preview/download/submit-payload projection ACTIVE; submit execution, FAIZT consumer wiring ve cutover NOT AUTHORIZED:** runtime tüketimi yalnız `UyapXmlService` numeric XML yolu içindir; PR-A5-1 production consumer sayısı sıfırdır. PR-A5-2/runtime activation yetkisizdir. PR-1D schema-migration design gerektirir. Generator hardening, precautionary-cost lifecycle, D6 ve cutover bu uygulamaların kapsamı değildir. Sohbet içi R2/R3/R4 etiketleri repository'de ayrıca canonical hale gelmedikçe workstream statüsü taşımaz.
- **PR-A5 owner decision closure and PR-A5-1 implementation (2026-07-13):** `OD-A5-01` future batch export için `REJECT_ENTIRE_BATCH`; `OD-A5-02` `Due.type === NAFAKA` için typed, non-heuristic ve non-mutating Due-only exception; `OD-A5-03` unverified FAIZT için explicit fail-closed export blocker; `OD-A5-04` yalnız dormant contract sınırını dondurur. **PR-A5-1 CLOSED / CANONICAL / DORMANT CONTRACT IMPLEMENTED after approved merge; production consumer NONE. PR-A5-2, runtime activation ve production cutover NOT AUTHORIZED.** VER-05 ve CAN-CUT-01 açık kalır.
- **Required verification:** PR-A4 runtime analizi owner-accepted ve unverified hücreleri ayrı ele almalı; yalnız `OWNER_LEGAL_ACCEPTED` veya gelecekte kanıtlanacak `VERIFIED_OFFICIAL` hücreler projection adayı olabilir. Production empirical evidence eksikliği residual risk olarak korunur; sentetik fixture prevalence veya resmî doğrulama sayılmaz. Ayrı runtime analizi otomatik mutation, backfill, projection, submit veya cutover yetkisi üretmez.
- **Acceptance criteria:** Unverified hücreler fail-closed kalır; `OWNER_LEGAL_ACCEPTED` hiçbir zaman varsayımla `VERIFIED_OFFICIAL` yapılmaz. PR-A4-3 kararı `Due` write path, UYAP projection/exporter, ReportService/SummaryEngine, genel balance consumer cutover, schema/migration, backfill veya CAN-CUT-01 cutover yetkisi vermez; bunların her biri ayrı owner-authorized workstream gerektirir.

### CAN-CUT-02 — Hesap Özeti / interest-engine
- **Required verification:** `BalanceShadowDiffPanel` shadow-diff sonuçlarının GREEN olma durumu.
- **Acceptance criteria:** Faiz=0 stub olan `Hesap Özeti` görünümü kullanıcıya birincil/doğru sonuç gibi sunulmaz (guard/etiket); cutover tamamlanana kadar legacy hesaplamaya yeni iş mantığı eklenmez.
- **Implementation owner (2026-07-09 owner reconciliation; 2026-07-09 GOV-ADR-NAMING-000 ile adlandırma netleştirildi):** `CCB-001` (bkz. `product-backlog.md`) — bu maddenin canonical calculation cutover'ının implementation-authority/master stream'i. CAN-CUT-02, CCB-001'e bağımsız/rakip bir iş akışı DEĞİLDİR; CCB-001 altında bir milestone olarak izlenir. `ADR-012` main üzerinde DX-005 / Waiting & Progress Policy için kanoniktir ve bu hatta kullanılmaz. CCB-001 WIP branch'indeki `ADR-012-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md` referansı yalnız legacy/branch-local bağlamdır; main için kanonik ADR referansı değildir. FEE/Harç/Snapshot/Journal mimari hattının kanonik hedef numarası `ADR-013` olarak ayrılmıştır ve PR #1026 ile draft owner-review ADR dosyası oluşturulmuştur; CCB-001'in kendi mimari dokümanı `ADR-014` olarak kalır. Bu not statüyü değiştirmez: madde **OPEN/needs-owner-decision (guard)** olarak kalır; kapanışı yalnız CCB-001'in bu spesifik kapsamı karşılayan, main'e merge edilmiş bir deliverable ile ayrıca ve açıkça register'a işlenir.
- **RCV cross-pointer (RCV-GOV-001 / DEC-0030, 2026-07-13; canonical upon approved merge):** `RCV-P0/P1`, ayrı canonicalization veya implementation stream'i değildir; program identity/register anchor amacıyla `CCB-001` altındaki planning decomposition'dır. Bu pointer work-item execution/status ownership'ini değiştirmez; `CAN-CUT-01/VER-05`, `CAN-CUT-02/ADR-014` ve external-domain owner kayıtları ayrı canonical gate'ler olarak kalır. `RCV-P0-CP-01`, `Receivable Program Governance and Source Control` control-plane entry condition'ını; `RCV-P0-BAR-0021:PHASE1_ENTRY` ise ayrıca explicit owner GO'yu gerektirir. İlk aday yalnız `WAVE 0 / RCV-P1-T15-A`dır ve owner GO gelene kadar authorized/started değildir. RCV `WAVE 0`, ADR-014 split-plan W0 ile aynı değildir. Bu cross-pointer CAN-CUT-02'yi **CLOSE ETMEZ**; status **OPEN / needs-owner-decision**, representative evidence **ABSENT / BLOCKING**, PR-11 ve runtime cutover **NOT AUTHORIZED** kalır.

- **RCV post-merge closure (2026-07-14):** PR #1222 squash `fcffb12941f33e36e6e42d9d742d0249eb210ab8` canonical main'e merge edilmiştir; DEC-0030 `CLOSED`, `RCV-P0-CP-01` entry condition `SATISFIED`dır. Owner GO alanı `UNSET` olduğundan `RCV-P0-BAR-0021:PHASE1_ENTRY` `OPEN` ve Phase 1 `NOT AUTHORIZED` kalır. Bu closure CAN-CUT-02'nin kendi status'unu değiştirmez: **OPEN / needs-owner-decision**; representative evidence, PR-11 ve runtime cutover yetkisizdir.

- **RCV-GOV-002 progression reconciliation (2026-07-14; canonical upon approved merge):** RCV-GOV-001 kapanışındaki `Owner GO = UNSET / Phase 1 NOT AUTHORIZED` durumu tarihsel olarak korunur. Sonraki explicit owner `GO-PHASE-1` ve task-scoped brief zinciri owner-supplied progression baseline olarak kaydedilir: Phase 1 Analysis, Consolidation, Target Architecture ve Implementation Roadmap `COMPLETE`; `RCV-P2-WS01-P01` PR #1249 / squash `52b35a0d668d6efdc043dde672b47fdd6f320cb1` ile `CLOSED`; next eligible task `RCV-P2-WS01-P02`dir fakat implementation authority **NOT GRANTED / OWNER GO REQUIRED**. Yeni Master Register ID veya program/register kimliği oluşturulmaz. CAN-CUT-02 bu kayıtla kapanmaz: **OPEN / needs-owner-decision**; `CAN-CUT-01/VER-05`, representative evidence/acceptance, PR-11, consumer switch, runtime cutover ve external-owner gate'leri değişmez.

- **RCV-GOV-002 post-merge closure (2026-07-14):** PR #1250 squash `d06a6743045beae4b0b2c79735a638633d833d0a` canonical main'e merge edilmiş ve RCV-GOV-002 `CLOSED / CANONICAL` olmuştur. Bu closure CAN-CUT-02'yi kapatmamış veya WS01-P02 authority'si üretmemiştir.

- **RCV-GOV-003 WS01 closure / WS02 entry reconciliation (2026-07-15; canonical upon approved merge):** `RCV-P2-WS01-P01` PR #1249 / `52b35a0d668d6efdc043dde672b47fdd6f320cb1`, P02 PR #1254 / `919e6e2e97fdc22efd9d3655682d4cabc4425cd9`, P03 PR #1259 / `fe4c954af49172c37502a0630adb048c441208f1` ve P04 PR #1264 / `c1df2f2e59fcd6f0ad62d7429eaef903cf197cbd` ile `CLOSED`dır. Owner-supplied disposition'a göre `WS01 roadmap = COMPLETE`; P01–P04 teknik paket zinciri tamamlanmış ve `WS01 = TECHNICALLY COMPLETE` olmuştur. Next eligible workstream `WS02 — Ingress, Lifecycle & Provenance`, next eligible task `RCV-P2-WS02-P01`dir; WS02 implementation authority **NOT GRANTED / OWNER GO REQUIRED** ve WS02 `NOT STARTED`dır. WS03–WS09 `NOT STARTED`dır. Yeni Master Register ID veya program/register kimliği oluşturulmaz. Bu teknik workstream kapanışı CAN-CUT-02'yi kapatmaz: **OPEN / needs-owner-decision**; `CAN-CUT-01/VER-05`, owner/legal/evidence/acceptance, representative evidence, PR-11, consumer switch, runtime cutover ve external-owner gate'leri değişmez.

- **RCV-GOV-003 post-merge closure (2026-07-15):** PR #1268 squash `6492478fd5c18112c305aed3d0ea12e15db94d1f` canonical main'e merge edilmiş ve RCV-GOV-003 `CLOSED / CANONICAL` olmuştur. Bu closure CAN-CUT-02'yi kapatmamış veya WS02 authority'si üretmemiştir.

- **RCV-GOV-004-R01 Phase 1 / WS01 / WS02 formal closure reconciliation (2026-07-16; canonical upon approved merge):** Canonical main'deki tarihsel `Phase 1 deliverables = COMPLETE`, `WS01 = TECHNICALLY COMPLETE` ve WS02'nin merged teknik paket zinciri formal closure standardıyla uzlaştırılır. Phase 1 Analysis, Consolidation, Target Architecture ve Implementation Roadmap `COMPLETE` olduğundan `PHASE 1 = CLOSED` kaydedilir. WS01 closure basis'i P01–P04 PR #1249/#1254/#1259/#1264 merged, her biri required CI `4/4 SUCCESS` ve RCV-GOV-003 governance reconciliation PR #1268'dir; tarihsel `TECHNICALLY COMPLETE` statüsü korunarak `WS01 = CLOSED` kaydedilir. WS02 closure basis'i P01 PR #1272 / `63f27aa9761b0ec99f685d04f6cde1f477af300e`, P02 PR #1278 / `54ef79af479b80d3602a018fb7bc9f454b30fff2`, P03 PR #1282 / `150f9d2818f6d9dea0a03c94073bdb4ea55967fb`, P04 PR #1286 / `37a86fd2b4f32d97d805f9f341b602204c61dd21`, required CI `4/4 SUCCESS` ve bu R01 governance reconciliation'ın approved merge'idir; tarihsel `TECHNICALLY COMPLETE` statüsü korunarak `WS02 = CLOSED` kaydedilir. Canonical etki yalnız bu R01 approved merge'iyle doğar. Current phase `RCV-P2`dir. Next eligible workstream `WS03 — Payment Fact & Collection Ingress`, next eligible task `RCV-P2-WS03-P01`dir; WS03 authorization **NOT GRANTED — OWNER GO REQUIRED** ve WS03–WS09 `NOT STARTED`dır. Canonical olmayan yerel RCV-GOV-004 taslağı ayrı bir register gerçeği oluşturmaz; bu R01 tarafından consume edilmiştir. Yeni Master Register ID veya program/register kimliği oluşturulmaz; RCV bounded-context ve `CCB-001` identity-only cross-pointer yapısı değişmez. Bu formal phase/workstream kapanışları CAN-CUT-02'yi kapatmaz: **OPEN / needs-owner-decision**; `CAN-CUT-01/VER-05`, owner/legal/evidence/acceptance, representative evidence, PR-11, consumer switch, runtime cutover ve external-owner gate'leri değişmez.

- **RCV-P2-WS03-P01 formal closure reconciliation (2026-07-16; canonical upon approved governance merge):** `RCV-P2-WS03-P01 — Collection Bypass Closure` implementation PR #1300 / squash `da8eef6204e3c85ac09f722d43f2f5803920fb16` ile canonical main'e merge edilmiş, required CI `4/4 SUCCESS` olmuş ve squash commit güncel canonical main'in atası olarak doğrulanmıştır. Implementation diff'inde schema, migration veya governance değişikliği yoktur; breaking public HTTP API değişikliği oluşmamıştır. Bu approved governance merge'iyle P01 `CLOSED / CANONICAL` olur. WS03 `OPEN` kalır. Canonical roadmap/register P01 sonrası successor task atamadığından next eligible task `UNSET — OWNER GO REQUIRED`dır; `RCV-P2-WS03-P02` `NOT AUTHORIZED / NOT STARTED` kalır ve bu kayıt eligibility ya da execution authority üretmez. Yeni Master Register ID veya program/register kimliği oluşturulmaz; RCV bounded-context ve `CCB-001` identity-only cross-pointer yapısı değişmez. `CAN-CUT-01/VER-05`, `CAN-CUT-02/ADR-014`, owner/legal/evidence/acceptance, representative evidence, PR-11, consumer switch, runtime cutover ve external-owner gate'leri değişmez.

- **RCV-P2-WS03-P02 formal closure reconciliation (2026-07-16; canonical upon approved governance merge):** `RCV-P2-WS03-P02 — Receipt-to-Ledger Atomicity and Ingress Convergence Contract` implementation PR #1316 / squash `208588d7fd065b4aaf8e29d08a4675deec395411` ile canonical main'e merge edilmiş, required CI `4/4 SUCCESS` olmuş ve squash commit güncel canonical main'in atası olarak doğrulanmıştır. Implementation yalnız iki convergence contract test dosyasını değiştirmiştir; production behavior, production kodu, schema/migration, public API ve governance değişikliği yoktur. Bu approved governance merge'iyle P02 `FORMALLY CLOSED / CANONICAL` olur; WS03 `OPEN` kalır. Canonical roadmap/register P02 sonrası successor task atamadığından next eligible task `UNSET — OWNER GO REQUIRED` olarak korunur; `RCV-P2-WS03-P03` `NOT AUTHORIZED / NOT STARTED`tır ve bu kayıt eligibility ya da execution authority üretmez. Yeni Master Register ID veya program/register kimliği oluşturulmaz; RCV bounded-context ve `CCB-001` identity-only cross-pointer yapısı değişmez. `CAN-CUT-01/VER-05`, `CAN-CUT-02/ADR-014`, owner/legal/evidence/acceptance, representative evidence, PR-11, consumer switch, runtime cutover ve external-owner gate'leri değişmez.

- **RCV-P2-WS03-P03 owner decision and contract ratification (2026-07-17; canonical upon approved governance merge):** Owner, P03'ü mevcut `RECORD_COLLECTION` action'ının ilk dar OFFICE object-scope enforcement consumer'ı olarak ve dört public receipt endpoint'i için optional `confirmationToken` input + `ALLOW` veya `GuardedEdgeOutcomeEnvelope` response kullanan additive/non-breaking contract'ı onaylamıştır. Contract status `RATIFIED`; implementation authorization `NONE`dır. Dört endpoint `POST /collections`, `POST /cases/:id/collections`, `POST /bank/transactions/:id/match` ve `POST /external-cases/:id/collection`dır; her biri tenant-scoped `caseId` resolver ve fail-closed permission/confirmation boundary'sine tabidir. Enforcement idempotency fast-path ve bütün financial write'lardan önce çalışmalıdır; observe-only resolver veya decorator-only işaretleme authority değildir. Bu kayıt yeni action, role, permission, approval, `MANAGER` kapsamı, schema, migration, WS04, global OFFICE enforcement ya da execution authority üretmez; `OFF/OD-08` direct-report/team sınırını ve global office-wide erişim için ayrı explicit permission gerekliliğini korur. Next eligible task `RCV-P2-WS03-P03 — GO-IMPLEMENT`tır; ayrı owner GO zorunludur.

- **RCV-P2-WS03-P03 formal closure reconciliation (2026-07-17; canonical upon approved governance merge):** Ratified contract PR #1328 / squash `507fa7d017cd8de308aa7907296366ae360681c8` canonical main'dedir. `RCV-P2-WS03-P03 — Receipt Object-Scope Authorization Contract` implementation PR #1333 / squash `1be0e64abdd5aed81f3304cc0f6517804a0f93e1` ile canonical main'e merge edilmiş, required CI `4/4 SUCCESS` olmuş ve squash commit güncel canonical main'in atası olarak doğrulanmıştır. Implementation dört public receipt endpoint'inde authorization'ı idempotency fast-path ve bütün financial write'lardan önce çalıştırır; fail-closed no-write evidence ile P01/P02 contract'larını korur. PR #1333 tam olarak 11 dosya (sekiz production + üç test) değiştirmiştir; schema, migration, governance implementation diff'i, allocation/WS04 kapsamı veya breaking public API değişikliği yoktur. Bu approved governance merge'iyle P03 `FORMALLY CLOSED / CANONICAL` olur; WS03 `OPEN` kalır. Canonical roadmap/register P03 sonrası successor task atamadığından next eligible task `UNSET — OWNER GO REQUIRED`dır; `RCV-P2-WS03-P04` `NOT AUTHORIZED / NOT STARTED` kalır ve bu kayıt eligibility ya da execution authority üretmez. Yeni Master Register ID veya program/register kimliği oluşturulmaz; RCV bounded-context ve `CCB-001` identity-only cross-pointer yapısı değişmez. `REC-AUTH-011/012`, `CAN-CUT-01/VER-05`, `CAN-CUT-02/ADR-014`, owner/legal/evidence/acceptance, representative evidence, PR-11, consumer switch, runtime cutover ve external-owner gate'leri değişmez.

- **RCV-P2-WS03 formal closure / WS04 entry gate reconciliation (2026-07-17; canonical upon approved governance merge):** WS03 closure basis'i P01 implementation PR #1300 / squash `da8eef6204e3c85ac09f722d43f2f5803920fb16` ile governance PR #1306 / squash `95be1647d6b0cc8d9faa3120ecd02f33bc3f9e49`; P02 implementation/evidence PR #1316 / squash `208588d7fd065b4aaf8e29d08a4675deec395411` ile governance PR #1318 / squash `15c8e114a4844516ec27bc9072a583451d36c49f`; P03 contract PR #1328 / squash `507fa7d017cd8de308aa7907296366ae360681c8`, implementation PR #1333 / squash `1be0e64abdd5aed81f3304cc0f6517804a0f93e1` ve governance PR #1341 / squash `3dac354d676ca06aef8555a0dd30aced299cf423` kanıtlarıdır. Yedi PR'ın required CI sonucu `4/4 SUCCESS`tır ve bütün squash commit'ler pre-closure canonical main `44a8ef592e8c3cf0b26a8674ac50ca9b6c6c4680` ancestry'sindedir. `REC-AUTH-010` authority'si `COLLECTION`, status'u `CURRENT PARTIAL` kalır; evidence sınırı `IDEMPOTENCY CONFIRMED / CANONICAL PUBLIC RECEIPT TENANT / OBJECT-SCOPE GATES CONFIRMED / PROVIDER FINALITY OPEN UNDER RC-COL / W2.2` olarak uzlaştırılır. Provider lifecycle/finality `RC-COL/W2.2C` ve `W2.3`e; allocation authority `WS04 / ACT-28 / REC-AUTH-011/012`ye; refund/reversal ayrı owner/legal-gated hatta; evidence/cutover `CAN-CUT-01 / CAN-CUT-02 / VER-05`e yönlendirilir. Approved governance merge'iyle WS03 `CLOSED / CANONICAL`; `RCV-P2-WS03-P04` `NOT AUTHORIZED / NOT REQUIRED`; WS04 `NOT AUTHORIZED / NOT STARTED` olur. Yalnız sonraki aday `WS04 / ACT-28 — GO-ANALYZE — OWNER GO REQUIRED`dır. Bu kayıt ACT-28 kapsamını, `REC-AUTH-011/012/015` veya Collection W2.2/W2.3 semantiğini değiştirmez ve WS04 execution authority'si üretmez.

- **RCV-P2-WS04-P01 authority contract ratification (2026-07-17; canonical upon approved governance merge):** Owner, duplicate allocator için `DA-4 — DRIFT BASELINE ONLY / DISPOSITION DEFERRED`, `CollectionAllocation` için `CA-1 — COMPATIBILITY PROJECTION`, `ClaimItem.collectedAmount` için `CM-1 — RECONCILED CACHE` kararlarını vermiştir. Equality, allowed-divergence, not-comparable ve fail-closed-drift sınıfları ratifiye edilmiştir. `LedgerAllocation` persisted legal allocation authority'si, runtime allocation calculation-only olarak korunur; net confirmed LedgerAllocation per ClaimItem ile collectedAmount parity'si zorunludur; ledger mevcutken CollectionAllocation legal fallback olamaz; legacy allocator activation sessiz kalamaz. İlk implementation paketi yalnız authority/comparison tipleri, classifier, static writer/reader ve runtime no-write guard'ları, cache/projection reconciliation evidence'i, same-input parity harness, legacy activation diagnostic'i ve disposable-PostgreSQL drift-injection evidence'ıdır. Contract status `RATIFIED`; implementation authorization `NONE`dır. Allocator birleştirme/kaldırma, ortak kernel, persisted-first reader switch, CollectionAllocation write stop, collectedAmount migration/removal, TBK100 veya hukuki sonuç değişikliği, historical mutation/backfill, schema/migration, consumer cutover ve WS05 yetkisizdir. Next eligible task `RCV-P2-WS04-P01 — GO-IMPLEMENT`; ayrı owner GO zorunludur.

- **RCV-P2-WS04-P01 formal closure reconciliation (2026-07-18; canonical upon approved governance merge):** Ratified contract PR #1364 / squash `e5b019cac3cabe3df4e64a3c32f528d092cf734f` canonical main'dedir. `RCV-P2-WS04-P01 — Persisted Legal Allocation / Derived-State Authority Contract and Drift Baseline` implementation PR #1366 / squash `a3b9463ac81992130952060f48e5acfec1fcdbf2` ile canonical main'e merge edilmiş, required CI `4/4 SUCCESS` olmuş ve squash commit pre-closure canonical main'in atası olarak doğrulanmıştır. Dokuz dosyalık bounded implementation `DA-4`/`CA-1`/`CM-1` sınırlarını korur ve yalnız ratified drift baseline'ı uygular. Allocation sonucu/TBK100 semantiği, reader/consumer authority, historical data, public API, governance implementation yüzeyi, schema ve migration değişmemiştir. Bu approved governance merge'iyle P01 `FORMALLY CLOSED / CANONICAL`; WS04 `OPEN` olur. `ACT-28` ve `REC-AUTH-011/012` open reconciliation ile allocator disposition ertelemesi korunur. Canonical roadmap/register P01 sonrasında successor task atamadığından next eligible task `UNSET — OWNER GO REQUIRED`dır; `RCV-P2-WS04-P02` `NOT AUTHORIZED / NOT STARTED` kalır ve bu kayıt eligibility veya execution authority üretmez. `CCB-001` identity-only cross-pointer, `CAN-CUT-01/VER-05`, `CAN-CUT-02/ADR-014`, representative evidence, PR-11, consumer switch, runtime cutover, provider finality, refund/reversal ve owner/legal/evidence/acceptance gate'leri değişmez.

- **RCV-P2-WS04-P02 evidence-package formal closure reconciliation (2026-07-18; canonical upon approved governance merge):** `RCV-P2-WS04-P02 — Allocation Evidence Qualification and Consumer Read-Authority Baseline` evidence implementation PR #1378 / squash `34e43329bf2428cac609dfe3403d32db7cbcbdce` ile canonical main'e merge edilmiş, required CI `4/4 SUCCESS` olmuş ve squash commit pre-closure canonical main'in atası olarak doğrulanmıştır. Dört dosyalık evidence-only paket static inventory/runtime-no-write guard'ını, synthetic PM-01–PM-18 parity matrisini, disposable PostgreSQL MH-01–MH-11 mixed-history evidence'ını, 20/20 `collectedAmount` consumer manifest'ini ve fingerprint/checksum manifest kontratını canonical hale getirir. PM-01–PM-16 `EQUALITY`, PM-17 `FAIL_CLOSED_DRIFT`, PM-18 beklenen `NOT_COMPARABLE`; canonical graph'ta legacy allocator activation gözlenmemiş ve negative diagnostic PASS olmuştur. Representative veya production-derived data ve production observation `NOT EXECUTED / NOT AUTHORIZED`; disposition readiness `NOT ASSESSED`tır. `DA-4` / `CA-1` / `CM-1` `ACTIVE SAFE-HOLD`, `ACT-28` ve `REC-AUTH-011/012` `OPEN` kalır. Runtime davranışı, allocation/TBK100 sonucu, allocator/reader disposition'ı, historical mutation/backfill, public API, governance implementation yüzeyi, schema ve migration değişmemiştir. Bu approved governance merge'iyle yalnız P02 evidence paketi `FORMALLY CLOSED / CANONICAL`; WS04 `OPEN` kalır. Canonical roadmap/register successor atamadığından next eligible task `UNSET — OWNER GO REQUIRED`dır; `RCV-P2-WS04-P03` `NOT AUTHORIZED / NOT STARTED` kalır ve bu kayıt representative/production evidence, disposition, eligibility veya execution authority üretmez.

- **RCV-P2-WS04-P03 representative replay package contract ratification (2026-07-18; canonical upon approved governance merge):** Owner, `RCV-P2-WS04-P03 — Representative Allocation Replay and Consumer Read-Authority Qualification` package contract'ını ratifiye etmiştir. Contract; owner-approved distributional base + ayrı edge-case supplement seçimini, local owner/office environment'ı, no-egress ve DB-enforced `REPEATABLE READ, READ ONLY` sınırını, P02 frozen-input/fingerprint reuse'ını, backend+web consumer manifest exact-match guard'ını, `EQUALITY` / yalnız explicit `HELD` ile `ALLOWED_DIVERGENCE` / PASS olmayan `NOT_COMPARABLE` / `FAIL_CLOSED_DRIFT` sınıflarını ve PII-safe opaque-reference/checksum evidence zincirini tanımlar. Raw local data repository, CI, cloud, third party veya external AI'a çıkamaz; source masking pipeline'ı zorunlu tutulmaz fakat manifest/review/repository outputs raw PII, business-visible ID, credential, free text veya case payload taşıyamaz. Contract status `RATIFIED / CANONICAL UPON APPROVED GOVERNANCE MERGE`; `implementationAuthorization = NONE`, `dataAccess = NOT_AUTHORIZED`, `evidenceExecution = NOT_AUTHORIZED`, `productionObservation = NOT_AUTHORIZED`dır. Allocation-specific reader/adapter hazırlığı, dataset seçimi, data access, execution, evidence acceptance, allocator/reader disposition ve cutover ayrı owner gate'leridir. `DA-4` / `CA-1` / `CM-1` `ACTIVE SAFE-HOLD`; `ACT-28` ve `REC-AUTH-011/012` `OPEN`; WS04 `OPEN` kalır. Next action yalnız ayrı owner GO ile P03 reader/adapter implementation veya data-access request'tir; bu kayıt ikisini de başlatmaz.

- **RCV-P2-WS04-P03 reader/adapter formal closure reconciliation (2026-07-18; canonical upon approved governance merge):** Ratified package contract PR #1389 / squash `07e91dfeab09a3ee3e42640546b7be4510133848` canonical main'dedir. `RCV-P2-WS04-P03 — Representative Replay Reader / Manifest Adapter` implementation PR #1394 / squash `6a19fef806980ab6d1a40dd0cf940f6a3918293b` ile canonical main'e merge edilmiş, required CI `4/4 SUCCESS` olmuş ve squash commit pre-closure canonical main'in atası olarak doğrulanmıştır. Beş dosyalık bounded implementation yalnız default-disabled, local-only, read-only `AllocationFrozenInputV1` reader/mapper'ı; dataset-manifest validation adapter'ını; backend+web consumer manifestini; opaque-reference/PII-safe checksum evidence manifestini; no-egress/read-only/default-disabled guard'ları ve synthetic/disposable characterization testlerini canonical hale getirir. Production import/call-site, replay veya representative/production data access, production observation, runtime behavior, allocator/reader authority, public API, governance implementation yüzeyi, historical mutation/backfill, schema ve migration değişmemiştir. Bu approved governance merge'iyle P03 reader/adapter implementation'ı `FORMALLY CLOSED / CANONICAL`; WS04 `OPEN` kalır. `dataAccess`, `evidenceExecution` ve `productionObservation` `NOT AUTHORIZED`; disposition readiness `NOT ASSESSED`; `DA-4` / `CA-1` / `CM-1` `ACTIVE SAFE-HOLD`; `ACT-28` ve `REC-AUTH-011/012` `OPEN` kalır. Next eligible action yalnız `P03 DATA-ACCESS / EVIDENCE-EXECUTION AUTHORIZATION REQUEST — OWNER GO REQUIRED`dır; bu kayıt data access, replay, evidence acceptance, disposition, consumer switch, cutover veya yeni implementation authority üretmez.

- **RCV-P2-WS04-P03-A replay preflight/launch-package formal closure reconciliation — CLOSED / CANONICAL (2026-07-18):** `RCV-P2-WS04-P03-A — Replay Preflight and Launch Package Preparation` implementation PR #1406 / squash `661f99079039d1026f17a26311727fc93c9b733d` ile canonical main'e merge edilmiş, governance PR #1410 / squash `238d72a43c7e900f250e981466fe4b84a2a5cf38` ile formal status kaydı tamamlanmış, required CI `4/4 SUCCESS` olmuş ve squash commit canonical main'in atası olarak doğrulanmıştır. Altı dosyalık bounded implementation yalnız default-disabled local replay CLI/provider'ını, dataset/access/session manifest şablonlarını, DB-enforced read-only ve externally attested no-egress preflight'ını, create-once owner-controlled output guard'ını ve PII-safe output kontrollerini synthetic/disposable characterization ile hazırlar. Production call-site, gerçek veya representative data access, representative replay, evidence execution, production observation, runtime behavior, public API, governance implementation yüzeyi, historical mutation/backfill, schema ve migration değişmemiştir. P03-A launch package `FORMALLY CLOSED / CANONICAL`; WS04 `OPEN` kalır. `dataAccess`, `evidenceExecution` ve `productionObservation` `NOT AUTHORIZED`; representative replay `NOT EXECUTED`; disposition readiness `NOT ASSESSED`; `DA-4` / `CA-1` / `CM-1` `ACTIVE SAFE-HOLD`; `ACT-28` ve `REC-AUTH-011/012` `OPEN` kalır. Next eligible action yalnız `P03 DATA-ACCESS / EVIDENCE-EXECUTION AUTHORIZATION REQUEST — SEPARATE OWNER GO REQUIRED`dır; bu kayıt dataset seçimi, data access, replay, evidence acceptance, disposition, consumer switch, cutover veya yeni implementation authority üretmez.

- **RCV-P2-WS04 allocation-authority constitutional amendment (2026-07-18; canonical upon approved governance merge):** ClaimItem legal source/provenance/calculation input olarak kalır ve target payment/legal-application target'ı değildir. Target grain canonical Receivable snapshot'tan üretilen `LegalCalculationBucket`; target effect `LegalApplication`; lineage açıklaması ayrı `ApplicationAttribution` fact'idir. Current ClaimItem-keyed `LedgerAllocation` AS-IS/legacy persistence, `CollectionAllocation` compatibility projection only ve `ClaimItem.collectedAmount` deprecated/non-authoritative derived cache olarak sınıflandırılır. Balance Engine target authority fakat `SHADOW_ONLY`; cutover yoktur. P01/P02 `AMENDMENT REQUIRED`, P03 `SUPERSEDED / REQUIRES REDESIGN`, P03-A `CONFIRMED — SAFETY INFRASTRUCTURE ONLY`, P03-B `SUPERSEDED / DO NOT EXECUTE`dır. Eski implementation/CI/closure kanıtları korunur. Schema/migration likely required fakat design/implementation unauthorized; ACT-28 ve REC-AUTH-011/012 OPEN; replay/data/production observation/WS05/WS06 hard-hold. PR #407 `HOLD / DO NOT MERGE`; amendment sonrası ayrı read-only semantic triage owner-gated'dir.

- **RCV-P2-WS04-PR407-RD01-R01 balance-exposure contract ratification (2026-07-19; canonical upon approved governance merge):** PR #407 disposition `COORDINATED REDESIGN REQUIRED`; code extraction `NONE`, business-rule/test-scenario reuse `YES`tir. Stable `bucketContextKey` snapshot-specific `bucketInstanceId`den ayrılır; `LegalApplication` bucket context + application-time snapshot + rule version + effective time'a bağlanır; `ApplicationAttribution` ayrı ve non-authoritative'dir. Per-currency/category gross/applied/remaining exposure exact-cent reconcile edilir; held receipt exposure dışı, missing/stale typed-null ve fail-closed'dur. Public projection category-level, sub-bucket/source trace restricted diagnostic'tir. Authority enum `SHADOW_ONLY/CANONICAL/LEGACY_COMPATIBILITY`, current value yalnız `SHADOW_ONLY`dır. PR #407 OPEN/HOLD kalır. Target persistence analysis `READ-ONLY AUTHORIZED`; schema/migration design/implementation, runtime/API, consumer switch ve cutover yetkisizdir. ACT-28 ve REC-AUTH-011/012 OPEN; next eligible action owner-gated target-persistence read-only design analysis'tir.

- **RCV-COL-XD-001A legal-application boundary canonicalization (2026-07-19; canonical upon approved governance merge):** XD-001 owner kararı Receivable'ın canonical bucket/TBK100 policy, Collection'ın receipt lifecycle/execution orchestration sahibi olduğunu; target `LegalApplication` persistence'ın tek-yazıcı cross-domain boundary gerektirdiğini ve dual authority'nin yasak olduğunu ratifiye eder. ClaimItem application target/payment-state/allocation authority değildir; collectedAmount yeni reader/writer'a kapalıdır. CollectionAllocation bağımsız/fallback authority değildir. Physical persistence owner/aggregate seçilmemiştir; `ApplicationBatch` dahil alternatifler TPA-02 salt-okunur analizine bırakılır. ACT-28 ve REC-AUTH-011/012 physical persistence/cutover kapanana kadar OPEN; schema/migration/writer/cutover/retirement yetkisizdir. Next eligible task `TPA-02 — GO-ANALYZE REQUIRED`dır.

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

---

## 4. Governance Contract Canonicalization Records

### RCV-CLAIM-FORM-P01-R01 — Claim Component Taxonomy and Formation Admission

```text
CONTRACT STATUS           RATIFIED / CLOSED / CANONICAL UPON APPROVED MERGE
COMPONENT TAXONOMY        TWO-LEVEL
CANONICAL CATEGORIES      PRINCIPAL / COST / ANCILLARY / ACCRUED_INTEREST
OTHER                     NEW WRITE DENIED / LEGACY_ONLY
UNKNOWN COMPONENT         UNSUPPORTED_COMPONENT / FAIL-CLOSED
GENERIC DOCUMENT FALLBACK PROHIBITED
FUTURE INTEREST           INTERESTPOLICY ONLY
FORMATION SNAPSHOT        CLAIMFORMATIONSNAPSHOTV1
RUNTIME ENFORCEMENT       NOT IMPLEMENTED
IMPLEMENTATION AUTHORITY  NONE
SCHEMA / MIGRATION        NOT AUTHORIZED
LEGACY MUTATION / BACKFILL NOT AUTHORIZED
ACT-28 / REC-AUTH-011/012 OPEN / UNCHANGED
NEXT ELIGIBLE TASK        UNSET — OWNER GO REQUIRED
```

Bu kayıt yalnız `SYSTEM-CONSTITUTION` v1.4 ve `RECEIVABLE-GOVERNANCE` v1.4 içindeki
owner-ratified ClaimItem formation normunu indeksler. Component subtype registry'nin
runtime/persistence tasarımını seçmez; `INTEREST/PRE_INTEREST/POST_INTEREST/OTHER` legacy
kayıtlarını değiştirmez; Collection/shared-boundary, `LegalApplication`, `ApplicationBatch`,
payment orchestration, Balance Engine, replay/data access veya cutover authority üretmez.
`ALLOWED_WITH_POLICY_HOLD`, yalnız temel alacak ve hukuki classification kesin olduğu halde
interest eligibility `UNRESOLVED` olduğunda kullanılır; `UNRESOLVED` hiçbir zaman otomatik
`NO_INTEREST` değildir.

### RCV-CLAIM-FORM-P02-S01-GOV — Rule Engine Unsupported Component Batch Preflight Closure

```text
IMPLEMENTATION             FORMALLY CLOSED / CANONICAL UPON APPROVED GOVERNANCE MERGE
IMPLEMENTATION PR          #1439
IMPLEMENTATION SQUASH      5cab26213fac935c3b905cec6b5e56fc2c8c7bd5
REQUIRED CI                4/4 PASS
TARGETED TESTS             16/16 PASS
WRITER/ROUTING/PROVENANCE  69/69 PASS
CLAIMITEM REGRESSION       204/204 PASS
RULE ENGINE PREFLIGHT      IMPLEMENTED
UNSUPPORTED COMPONENT      FAIL-CLOSED
INVALID BATCH WRITES       ROUTER / CLAIMITEM / AUDIT / EVENT = 0
EXPENSE FALLBACK           NO OTHER / PRINCIPAL WRITE
SUPPORTED MAPPINGS         UNCHANGED
RUNTIME ENFORCEMENT        PARTIAL — P02-S01 ONLY
SCHEMA / MIGRATION         NONE
PUBLIC API                 NONE
LEGACY DATA                UNCHANGED
COLLECTION/SHARED BOUNDARY UNCHANGED
NEXT CLAIM-FORMATION TASK  UNSET — OWNER GO REQUIRED
```

Bu kayıt P01-R01'in tarihsel `RUNTIME ENFORCEMENT NOT IMPLEMENTED` contract kapanışını
yeniden yazmaz; PR #1439 ile canonical olan ilk bounded runtime-compliance dilimini append-only
olarak kaydeder. `POST_INTEREST_RULE`, explicit `OTHER`, generic-document fallback, web
`kalemTuru` fallback, human direct-entry ve formation snapshot/persistence residual gap'leri
`OPEN` kalır. ACT-28 ve REC-AUTH-011/012 `OPEN / UNCHANGED`dır. Bu closure başka
implementation, schema/migration, legacy mutation, Collection/shared-boundary task'ı, replay,
data access veya cutover authority üretmez.

### RCV-CLAIM-FORM-P02-S02-I01-GOV — Direct POST_INTEREST_RULE ClaimItem Admission Guard Closure

```text
IMPLEMENTATION             FORMALLY CLOSED / CANONICAL UPON APPROVED GOVERNANCE MERGE
IMPLEMENTATION PR          #1444
IMPLEMENTATION SQUASH      6565190e34080578b15a9bd87d50439f7bdc68f6
REQUIRED CI                4/4 PASS
TARGETED TESTS             19/19 PASS
CLAIMITEM REGRESSION       207/207 PASS
ACTIVE TEMPLATE COVERAGE   7/7 PASS
POST_INTEREST_RULE         DIRECT CLAIMITEM ADMISSION DENIED
ERROR CONTRACT             UNSUPPORTED_COMPONENT
REQUIRED / OPTIONAL        BOTH FAIL-CLOSED
INVALID BATCH WRITES       ROUTER / CLAIMITEM / AUDIT / EVENT / OUTBOX = 0
PARTIAL BATCH WRITE        0
SUPPORTED MAPPINGS         UNCHANGED
PREVIEW / YAML / POLICY    UNCHANGED
LEGACY POST_INTEREST       UNCHANGED / LEGACY_ONLY
RUNTIME ENFORCEMENT        PARTIAL — S01 + S02-I01 ONLY
SCHEMA / MIGRATION         NONE
PUBLIC API                 NONE
COLLECTION/SHARED BOUNDARY UNCHANGED
NEXT CLAIM-FORMATION TASK  UNSET — OWNER GO REQUIRED
```

Bu kayıt P01-R01 ve P02-S01 tarihsel kapanışlarını silmez veya yeniden yazmaz. PR #1444,
direct Rule Engine ClaimItem admission map'indeki `POST_INTEREST_RULE → POST_INTEREST`
yolunu kaldırmış ve required/optional ayrımı olmadan mevcut batch-preflight ile ilk writer
çağrısından önce fail-closed durdurmuştur. Preview endpoint'i, YAML template'leri,
`INTEREST_POLICY_ASSIGNED` yolu ve tarihsel `POST_INTEREST` kayıtları değişmemiştir.
Explicit `OTHER`, generic-document fallback, web `kalemTuru` fallback, human direct-entry
ve formation snapshot/persistence residual gap'leri `OPEN` kalır. ACT-28 ve
REC-AUTH-011/012 `OPEN / UNCHANGED`dır. Bu closure başka implementation, schema/migration,
legacy mutation, Collection/shared-boundary task'ı, replay, data access veya cutover
authority üretmez.

### RCV-CLAIM-FORM-P02-S03-I01-GOV — Generic Document ClaimItem Admission Guard Closure

```text
IMPLEMENTATION             FORMALLY CLOSED / CANONICAL UPON APPROVED GOVERNANCE MERGE
IMPLEMENTATION PR          #1454
IMPLEMENTATION SQUASH      31f9309e87f50d0bd5717893c752ca11a1365cd6
REQUIRED CI                4/4 PASS
TARGETED DOCUMENT TESTS    12/12 PASS
CLAIMITEM REGRESSION       215/215 PASS
PRODUCTION TYPESCRIPT      PASS
NEST BUILD                 PASS
CHANGED-FILE ESLINT        PASS
STATIC/SCOPE/DIFF/SECRET   PASS
GENERIC DOCUMENT FALLBACK  PROHIBITED
UNSUPPORTED TYPES          SOZLESME / BORC_SENEDI / KREDI / DIGER
ERROR CONTRACT             UNSUPPORTED_COMPONENT
INVALID REQUEST WRITES     ROUTER / CLAIMITEM / AUDIT / EVENT / OUTBOX = 0
SUPPORTED DOCUMENT MAPPING UNCHANGED
FATURA BEHAVIOR            UNCHANGED
PUBLIC ENUM / API          UNCHANGED
RUNTIME ENFORCEMENT        PARTIAL — S01 + S02-I01 + S03-I01 ONLY
SCHEMA / MIGRATION         NONE
LEGACY DATA                UNCHANGED
COLLECTION/SHARED BOUNDARY UNCHANGED
NEXT CLAIM-FORMATION TASK  UNSET — OWNER GO REQUIRED
```

Bu kayıt P01-R01, P02-S01 ve P02-S02-I01 tarihsel kapanışlarını silmez veya yeniden yazmaz.
PR #1454, `SOZLESME`, `BORC_SENEDI`, `KREDI` ve `DIGER` document type'larının sessizce
`PRINCIPAL` ClaimItem üretmesini kaldırmış ve mevcut `UNSUPPORTED_COMPONENT` sözleşmesiyle
ilk writer/router çağrısından önce fail-closed durdurmuştur. Desteklenen document mapping'leri,
`FATURA` davranışı ve public enum/API değişmemiştir. Explicit `OTHER`, web `kalemTuru`
fallback, human direct-entry ve formation snapshot/persistence residual gap'leri `OPEN`
kalır. ACT-28 ve REC-AUTH-011/012 `OPEN / UNCHANGED`dır. Bu closure başka implementation,
schema/migration, legacy mutation, Collection/shared-boundary task'ı, replay, data access
veya cutover authority üretmez.

### RCV-CLAIM-FORM-P02-S04-I01-GOV — Direct Rule Engine Explicit OTHER ClaimItem Admission Guard Closure

```text
IMPLEMENTATION             FORMALLY CLOSED / CANONICAL UPON APPROVED GOVERNANCE MERGE
IMPLEMENTATION PR          #1460
IMPLEMENTATION SQUASH      3f9204d022af4320b1319adf1c8e62d06f903226
REQUIRED CI                4/4 PASS
TARGETED ADMISSION TESTS   23/23 PASS
CLAIMITEM REGRESSION       219/219 PASS
PRODUCTION TYPESCRIPT      PASS
NEST BUILD                 PASS
CHANGED-FILE ESLINT        PASS
STATIC/SCOPE/DIFF          PASS
EXPLICIT OTHER             DIRECT RULE ENGINE ADMISSION DENIED
ERROR CONTRACT             UNSUPPORTED_COMPONENT
INVALID BATCH WRITES       ROUTER / CLAIMITEM / AUDIT / EVENT / OUTBOX = 0
REQUIRED / OPTIONAL OTHER  BOTH FAIL-CLOSED
TAHLIYE_KIRA               FAIL-CLOSED / WRITE 0
ILAMLI_DOVIZ               FAIL-CLOSED / WRITE 0
SUPPORTED MAPPINGS         UNCHANGED
LEGACY OTHER               UNCHANGED / LEGACY_ONLY
PUBLIC ENUM / API          UNCHANGED
RUNTIME ENFORCEMENT        PARTIAL — S01 + S02-I01 + S03-I01 + S04-I01 ONLY
SCHEMA / MIGRATION         NONE
LEGACY DATA                UNCHANGED
COLLECTION/SHARED BOUNDARY UNCHANGED
NEXT CLAIM-FORMATION TASK  UNSET — OWNER GO REQUIRED
```

Bu kayıt P01-R01, P02-S01, P02-S02-I01 ve P02-S03-I01 tarihsel kapanışlarını silmez veya
yeniden yazmaz. PR #1460, direct Rule Engine ClaimItem batch'inde explicit `OTHER`
admission'ını kaldırmış ve required/optional `OTHER` ile `TAHLIYE_KIRA` ve `ILAMLI_DOVIZ`
çıktılarını mevcut `UNSUPPORTED_COMPONENT` sözleşmesiyle ilk writer/router çağrısından önce
fail-closed durdurmuştur. Desteklenen mapping'ler, public enum/API ve mevcut `OTHER`
kayıtları/readers `LEGACY_ONLY / UNCHANGED` kalır. Due explicit `OTHER` / web fallback,
Precautionary `DIGER` / unknown, human direct-entry ve formation snapshot/subtype registry
residual gap'leri `OPEN` kalır. ACT-28 ve REC-AUTH-011/012 `OPEN / UNCHANGED`dır. Bu closure
başka implementation, schema/migration, legacy mutation, Collection/shared-boundary task'ı,
replay, data access veya cutover authority üretmez.

### RCV-CLAIM-MASTER-TRIAGE-R01-GOV — Claim Formation Program Re-Anchor

```text
RE-ANCHOR STATUS           FORMALLY CLOSED / CANONICAL UPON APPROVED GOVERNANCE MERGE
PROGRAM                    RECEIVABLE
PHASE                      RCV-P2
WORKSTREAM                 CLAIM FORMATION
P01-R01                    FORMALLY CLOSED / CANONICAL — PR #1433
P02-S01                    FORMALLY CLOSED / CANONICAL — PR #1439 / #1441
P02-S02-I01                FORMALLY CLOSED / CANONICAL — PR #1444 / #1448
P02-S03-I01                FORMALLY CLOSED / CANONICAL — PR #1454 / #1457
P02-S04-I01                FORMALLY CLOSED / CANONICAL — PR #1460 / #1463
RUNTIME ENFORCEMENT        PARTIAL — S01 + S02-I01 + S03-I01 + S04-I01 ONLY
S05-I01 DISPOSITION        SELECTED / NOT AUTHORIZED
S05-I01 LOCAL STATE        LOCAL PATCH / NON-CANONICAL / FROZEN
S05-I01 RESUME STATUS      RESUME CANDIDATE
NEXT CLAIM-FORMATION TASK  RCV-CLAIM-FORM-P02-S05-I01
IMPLEMENTATION AUTHORITY   NONE — SEPARATE OWNER GO REQUIRED
```

Claim Formation lane'i ClaimItem formation/component/source/legal-basis/interest-policy-input/
versioning/provenance/snapshot fact'leriyle sınırlıdır. Genel RCV/WS04 pointer'ları tarihsel
olarak korunur fakat Claim Formation successor authority'si değildir. `TPA-04B` ve `RCV-COL/*`
Collection'a; `LegalApplication` persistence shared boundary'ye; Balance/TBK100 implementation'ı
Receivable Calculation'a `BOUNDARY EXIT` olarak yönlenir.

Phase exit için bütün formation writer'larının admission guard tüketmesi; unknown/default
`PRINCIPAL`/`OTHER` fallback'lerinin ve legacy-only new-write yüzeylerinin kapanması; future
interest'in yalnız `InterestPolicy` olması; mandatory formation context ile human-entry
legal/provenance gate'inin tamamlanması; snapshot/subtype disposition ve legacy inventory
kararının kapanması; bütün package governance closure'larının canonical olması ve runtime
`PARTIAL` statüsünün kapanması gerekir.

S05-I01 dışında açık residual sıralaması seçilmemiştir. Existing `OTHER` update/PATCH, web
`kalemTuru`/nested-ilam/OCR fallback, precautionary `DIGER`/unknown, human direct-entry,
mandatory context, `ClaimFormationSnapshotV1`, subtype registry/versioning ve legacy component
inventory `OPEN` kalır. Bu kayıt S05-I01 implementation'ını, local patch mutation'ını veya
başka residual/foreign task'ı başlatmaz.

### RCV-CLAIM-FORM-P02-S05-I01-GOV — New DueType.OTHER Create Admission Guard Closure

```text
IMPLEMENTATION             FORMALLY CLOSED / CANONICAL UPON APPROVED GOVERNANCE MERGE
IMPLEMENTATION PR          #1479
IMPLEMENTATION SQUASH      4947da38277fa2fde8d46d3b51e3aa31e6d98c2e
REQUIRED CI                4/4 PASS
TARGETED ADMISSION TESTS   29/29 PASS
CASE/DUE+CLAIMITEM TESTS   295 PASS / 10 SKIP
PRODUCTION TYPESCRIPT      PASS
NEST BUILD                 PASS
DIFF-AWARE ESLINT          PASS
STATIC WRITE-ORDER/SCOPE   PASS
DIFF/SECRET/GENERATED      PASS
NEW DUETYPE.OTHER CREATE   DENIED
ERROR CONTRACT             UNSUPPORTED_COMPONENT
POST /cases WRITES         TRANSACTION / CASE / DUE / PARTY / CLAIMITEM / AUDIT / EVENT / OUTBOX = 0
POST /cases/:id/dues       TRANSACTION / DUE / CLAIMITEM / AUDIT / EVENT / OUTBOX = 0
SUPPORTED DUE TYPES        UNCHANGED
EXISTING OTHER             READ / UPDATE / LIFECYCLE UNCHANGED / LEGACY_ONLY
PUBLIC ENUM / API          UNCHANGED
WEB/ILAM/OCR/BACKFILL      UNCHANGED
RUNTIME ENFORCEMENT        PARTIAL — S01 + S02-I01 + S03-I01 + S04-I01 + S05-I01 ONLY
SCHEMA / MIGRATION         NONE
COLLECTION/SHARED BOUNDARY UNCHANGED
OLD FROZEN PATCH           SUPERSEDED / CLEANUP PENDING SEPARATE OWNER GO
NEXT CLAIM-FORMATION TASK  UNSET — OWNER GO REQUIRED
```

Bu kayıt P01-R01 ile P02-S01/S02-I01/S03-I01/S04-I01 tarihsel kapanışlarını silmez veya
yeniden yazmaz. PR #1479 yalnız yeni `DueType.OTHER` create admission'ını iki public create
yüzeyinde ilk transaction/write öncesinde fail-closed kapatmıştır. Existing `OTHER`
update/`PRINCIPAL → OTHER` PATCH, web `kalemTuru`/nested-ilam/OCR fallback, Precautionary
`DIGER`/unknown, human direct-entry, mandatory formation context, `ClaimFormationSnapshotV1`,
subtype registry/versioning ve legacy component inventory `OPEN` kalır. ACT-28 ve
REC-AUTH-011/012 `OPEN / UNCHANGED`dır. Frozen S05 patch'i merged implementation tarafından
supersede edilmiştir; cleanup ayrı owner GO bekler. Bu closure başka implementation,
schema/migration, legacy mutation, Collection/shared-boundary task'ı, TPA-04B, Balance/TBK100,
replay/data access, cutover veya foreign task authority'si üretmez.

- **RCV-COL-TPA-02 target persistence architecture canonicalization (2026-07-19; canonical upon approved governance merge):** Owner Option D'yi ratifiye etmiştir. Target physical model independent `LegalApplicationBatch` aggregate'i; children immutable `LegalApplication[]` bucket-effect facts ve non-authoritative `ApplicationAttribution[]` lineage/provenance facts'tir. Receivable bucket/context/snapshot semantiği + TBK100 policy; Collection receipt lifecycle/idempotency/outer transaction orchestration sahibidir. RCV-COL Legal Application Boundary aggregate persistence'ın, `LegalApplicationWriter` ise yalnız canonical Collection transaction client ile çalışan tek logical writer'ın sahibidir. Bir APPLY batch'i bir Collection receipt'ine karşılık gelir; exact-cent conservation `receiptAmountMinor = Σ appliedAmountMinor + heldRemainderMinor`; replay authority `tenantId + idempotencyKey + commandHash`; same key/hash side-effect-free existing batch; different hash fail-closed conflict; full reversal linked append-only REVERSAL batch; UPDATE/DELETE yasak; partial reversal owner-gated; tenant-safe composite FK + `ON DELETE RESTRICT`; historical guessing/backfill ve dual authority yasaktır. `ClaimItem.collectedAmount` frozen legacy cache/retirement required; `CollectionAllocation` canonical-output-derived transitional projection only; `LedgerAllocation` historical legacy record/target-era authority prohibited. ACT-28 ve REC-AUTH-011/012 OPEN; `codex/rcv-ws04-p03-syn-01` disposition, PR #407 HOLD/conflicting, deterministic bucket identity, representative replay/evidence ve consumer-cutover authority blocker'ları açık kalır. Runtime/test/schema/migration/writer/replay/cutover/retirement change NONE; next `TPA-03 / SCHEMA-FOUNDATION ANALYSIS — OWNER GO-ANALYZE REQUIRED`.

- **RCV-COL-TPA-03 schema-foundation contract canonicalization (2026-07-20; canonical upon approved governance merge):** Owner Option B — Two-File Hybrid Schema Foundation kararını ratifiye etmiştir. Foundation `LegalApplicationBatch`, immutable `LegalApplication`, non-authoritative `ApplicationAttribution`; `LegalApplicationBatchType = APPLY / REVERSAL`; `LegalApplicationComponentType = COST / ANCILLARY / ACCRUED_INTEREST / PRINCIPAL` adlarını kullanır. Future implementation exact scope'u yalnız `schema.prisma` + tek additive `migration.sql`; writer-free, no-backfill ve runtime/consumer etkisi yoktur. Tenant-safe composite FK, `ON DELETE RESTRICT`, batch/application immutability, positive minor-unit amount, `(tenantId, idempotencyKey)` replay unique sınırı, commandHash conflict, linked append-only full reversal ve required/opaque/nonblank bucket identity ratifiye edilmiştir. Canonical exact-cent conservation korunur; aggregate-level enforcement ve bucket key generation writer-stage contract'a bırakılmıştır. `codex/rcv-ws04-p03-syn-01` TPA-03A schema foundation için non-blocking, writer/evidence/cutover için blocking; PR #407 HOLD/CONFLICTING/DO NOT MERGE/DO NOT REBASE; ACT-28 ve REC-AUTH-011/012 OPEN kalır. TPA-03A `OWNER GO-IMPLEMENT REQUIRED / NOT AUTHORIZED`; runtime/test/schema/migration/backfill/replay/cutover/retirement change NONE.

- **RCV-COL-TPA-03A schema-foundation formal closure reconciliation (2026-07-20; canonical upon approved governance merge):** Implementation PR #1449 / branch commit `8190a9cfbe9e793883d29d0f109b9ebc0f7d017d` / squash `63f0b0ea2cbef3f5d106ae3dfd8be6b770b5229f`, required CI `4/4 SUCCESS` ile canonical main'dedir. Exact two-file diff yalnız `schema.prisma` ve `20260720174245_legal_application_batch_foundation/migration.sql`dır. Additive `LegalApplicationBatch`, immutable `LegalApplication` ve non-authoritative `ApplicationAttribution`; tenant-safe composite FK, restrictive delete, replay/reversal/nonblank-bucket/positive-minor-unit checks ve altı immutable UPDATE/DELETE trigger'ıyla kurulmuştur. Existing rows unchanged; backfill/runtime writer/feature flag/test/consumer/legacy reader-writer change NONE. Exact-cent conservation enforcement ve bucket-key generation writer-stage'e deferred'dır. ACT-28 ve REC-AUTH-011/012 OPEN; target SHADOW_ONLY; synthetic corpus writer/evidence/cutover için BLOCKING; PR #407 HOLD/UNTOUCHED; writer/replay/evidence/cutover/retirement NOT AUTHORIZED. Önceki implementation worktree physical directory'si Windows uzun-yol nedeniyle unregistered operational residue olarak korunur; recursive delete yapılmaz. Next yalnız `TPA-04 — LEGALAPPLICATIONWRITER CONTRACT ANALYSIS / OWNER GO-ANALYZE REQUIRED`.

- **RCV-COL-TPA-04 LegalApplicationWriter contract canonicalization (2026-07-20; canonical upon approved governance merge):** Owner Option C — Target-Native Plan-Then-Persist / Dormant-First Single Writer kararını ratifiye etmiştir. `LegalApplicationWriter` yalnız official canonical Receivable snapshot + Receivable-owned target-native `LegalApplicationPlan` tüketir; TBK100 hesaplamaz ve ClaimItem/collectedAmount/LedgerAllocation/CollectionAllocation üzerinden target üretmez. Existing canonical Collection transaction client dışında endpoint, nested transaction veya second writer yoktur; production wiring/shadow persistence ve legacy-derived target yasaktır. Snapshot authority/availability fail-closed, bucket keys versioned canonical serialization + SHA-256, ClaimItem ID excluded; bigint same-currency/minor-unit conservation DB amendment ile writer öncesi enforce edilmelidir. Replay key/hash fail-closed; one Collection/one APPLY; full reversal linked append-only + same-case lock + exact inverse, partial reversal unauthorized; audit transaction-bound/allowlist-only ve replay side-effect-free'dir. Legacy runtime geçici korunur, yeni legacy reader/writer yasak; synthetic corpus target writer için superseded legacy evidence ve writer/evidence/cutover blocker; PR #407 HOLD/UNTOUCHED; ACT-28 ve REC-AUTH-011/012 OPEN. TPA-04A snapshot/bucket identity, B schema amendment, C pure plan, D dormant writer, E full reversal, F evidence ve G coordinated cutover sırasındaki tüm successor'lar OWNER GO REQUIRED / NOT AUTHORIZED. Runtime/test/schema/migration/feature/replay/cutover change NONE.

- **RCV-COL-TPA-04A canonical snapshot / bucket identity contract canonicalization (2026-07-20; canonical upon approved governance merge):** Owner Option C — Receipt-Bound Embedded Canonical Snapshot Envelope kararını ratifiye etmiştir. `CanonicalReceivableApplicationSnapshotV1`, yalnız tek canonical Collection receipt'ine bağlı LegalApplication plan/writer input'udur; Receivable semantics owner, RCV-COL boundary embedded persistence owner ve `LegalApplicationBatch` physical envelope'dur. Exact eligibility; target-receipt history exclusion; COL/OD-03 effective-date authority; provenance-date exclusion; explicit source/engine/rule/policy/rate/profile versions; COST/ANCILLARY completeness; transaction-consistent target-native/approved history; required currency/minor-unit; exact envelope; RCV-CAS/v1 RFC8785-based domain-restricted serialization/hash; stable `bucketContextKey`; snapshot-specific `bucketInstanceId`; ClaimItem/receipt/row/display/index exclusion; fail-closed readiness ve pure bigint `LegalApplicationPlan` canonicaldır. General presentation/Fee/Harç/Journal snapshot lifecycle ADR-013 altında OPEN; Balance Engine SHADOW_ONLY; schema/migration/hash implementation/writer/feature/cutover authority NONE. PR #407 HOLD/UNTOUCHED; PR #1460 ancestry reverified before merge; synthetic corpus writer/evidence/cutover BLOCKING; ACT-28 ve REC-AUTH-011/012 OPEN. Next yalnız `TPA-04B — WRITER EVIDENCE SCHEMA AMENDMENT ANALYSIS / OWNER GO-ANALYZE REQUIRED`; implementation NOT AUTHORIZED.

- **RCV-PR407-CLOSE-B-GOV final disposition supersession (2026-07-20; canonical upon approved governance merge):** Owner, önceki `C — KEEP OPEN / COORDINATED REDESIGN REQUIRED` lifecycle kararını supersede ederek `B — CLOSE / REQUIREMENTS PRESERVED / CODE DISCARDED` kararını ratifiye etmiştir. PR #407 unmerged kapatılır; rebase, conflict resolution, code extraction ve reuse yasaktır. Sekiz balance-exposure gereksiniminin canonical taşıyıcısı RD01/TPA zinciridir: ayrı gross/remaining principal-interest; principal için subtraction-derived değer yasağı; interest-only application principal'ı azaltmaz; no-application valid context'te gross=remaining; missing/stale/unverified typed-null fail-closed; cost/ancillary dahil exact-cent reconciliation; held receipt exposure dışı; cost/ancillary nedeniyle principal+interest genel claim-remaining invariant'ı değildir. Runtime/schema/migration/display/writer/consumer/cutover authority NONE; ACT-28, REC-AUTH-011/012, CAN-CUT-02 ve TPA-04B+ açık kalır.

- **RCV-COL-TPA-04B writer-evidence schema-amendment contract canonicalization (2026-07-20; canonical upon approved governance merge):** Owner, Two-File Required-Evidence Schema Amendment kontratını ratifiye etmiştir. Future exact implementation scope yalnız `schema.prisma` + tek yeni `migration.sql`; bütün yeni snapshot/version/effective-history/bucket-arithmetic evidence alanları required, default-free ve no-backfill'dir. `snapshotCanonicalPayload` exact canonical bytes için `TEXT`tir; JSONB yasaktır. Foundation tabloları lock sonrasında doluysa migration fail-closed durur. TPA-04A identity/format kuralları, per-batch bucket context/instance uniqueness, `receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor`, APPLY/REVERSAL bucket arithmetic ve full-HELD batch DB contract'ıdır. Serialization/hash recomputation writer-stage; exact-inverse full reversal TPA-04E'ye deferred'dır. `ApplicationAttribution` unchanged/non-authoritative; runtime/test/schema/migration/writer/replay/cutover change NONE. ACT-28 ve REC-AUTH-011/012 OPEN; PR #407 CLOSED/UNMERGED/NO FURTHER ACTION; synthetic corpus schema amendment için non-blocking, writer/evidence/cutover için blocking. Next yalnız `TPA-04B-ENTRY — OWNER GO-VERIFY REQUIRED / IMPLEMENTATION NOT AUTHORIZED`.
