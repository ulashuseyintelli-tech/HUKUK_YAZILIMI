# Canonicalization Register

**Durum:** Living document — governance kaydı, implementasyon değil.
**Son güncelleme:** 2026-07-05
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
| CAN-CUT-01 | Due / ClaimItem | `DueModal` + `ClaimItemPanel` aynı case detay sayfasında paralel render (`cases/[id]/page.tsx:63,68,2806,3974`) | `ClaimItem` + `interest-engine` | CUTOVER | inventory | P1 | Critical | High |
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
- **Required verification:** Kaç case'de yalnız `Due`, kaç case'de yalnız `ClaimItem`, kaç case'de ikisi birden var; duplicate kayıt var mı (salt-okunur SQL envanteri).
- **Acceptance criteria:** Envanter tamamlanmadan `Due` write path kapatılmaz; kod değişikliği bu envanterden sonraki ayrı bir GO-IMPLEMENT'tir.

### CAN-CUT-02 — Hesap Özeti / interest-engine
- **Required verification:** `BalanceShadowDiffPanel` shadow-diff sonuçlarının GREEN olma durumu.
- **Acceptance criteria:** Faiz=0 stub olan `Hesap Özeti` görünümü kullanıcıya birincil/doğru sonuç gibi sunulmaz (guard/etiket); cutover tamamlanana kadar legacy hesaplamaya yeni iş mantığı eklenmez.
- **Implementation owner (2026-07-09 owner reconciliation):** `CCB-001` (bkz. `product-backlog.md`) — bu maddenin canonical calculation cutover'ının implementation-authority/master stream'i. CAN-CUT-02, CCB-001'e bağımsız/rakip bir iş akışı DEĞİLDİR; CCB-001 altında bir milestone olarak izlenir. Mimari otorite `ADR-012`'dir (CCB-001 WIP branch'inde tanımlı, henüz `main`'e merge edilmemiş — bu register o dosyaya link vermez). Bu not statüyü değiştirmez: madde **OPEN/needs-owner-decision (guard)** olarak kalır; kapanışı yalnız CCB-001'in bu spesifik kapsamı karşılayan, main'e merge edilmiş bir deliverable ile ayrıca ve açıkça register'a işlenir.

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
