# WP-1c-0 — Audit `userId` Call-Site Envanteri

> Durum: **ENVANTER (WP-1c-0).** Kod sweep YOK; bu doküman sınıflandırma + alt-PR planıdır.
> Tarih: 2026-06-23 · Baz: `main@f83c1d6` · Üst bağlam: [[case-responsibility-canonical-model-design.md]] WP-1c
> İlke: her call-site `dosya:satır` ile iğnelenir; karar = userId-required / system-null / migration-null / done.

---

## 0. Hedef ve kural

WP-1c'nin amacı **"her audit event'te userId dolsun" DEĞİL.** Doğru hedef:

> **Her USER-DRIVEN audit event'inde actor `userId` dolu olmalı.
> Her non-user-driven (system/cron/migration/integration) event actor/source'u metadata'da AÇIKÇA bildirmeli.**

Bu envanter, kod sweep'e başlamadan önce TÜM audit yazım noktalarını sınıflandırır.

---

## 1. Kapsam: hangi audit kanalı?

WP-1c **yalnız ana `AuditService.log(...)` → `AuditLog` tablosu** kanalını hedefler (`AuditLog.userId` alanı).
`AuditLog` modeli `userId/userName/oldValues/newValues/metadata` taşır (`schema.prisma`); `AuditService.log(AuditLogInput)` bunları kabul eder (`audit/audit.service.ts`).

### Kapsam DIŞI (ayrı audit/event altyapıları — kendi actor/source mekanizmaları var)
| Altyapı | Mekanizma | Neden kapsam dışı |
|---|---|---|
| Escalation (case-task / operasyonel) | `CaseTaskEscalationEvent` / operasyonel event tabloları (append-only) | Ayrı tablo; system-driven cron; AuditLog'a yazmaz |
| Görev otomatik kapanış | `Task.completedByUserId` + `resolutionType=AUTO_SYSTEM` (WP-PERF-1) | AuditLog değil; system-null zaten bilinçli + metadata-eş değer |
| break-glass / diagnostics / manifest / playbook / simulation / interest-engine prisma-audit | Kendi audit servis/tabloları (`logAccessAttempt`, `logEvent`, vb.) | Ayrı subsistem; ayrı actor modeli; `AuditService.log` DEĞİL |
| Migration/backfill | SQL migration | `audit.log` çağırmaz |
| `caseEvent` / NOTE_ADDED / TEBLIGAT (timeline) | Ayrı event/note kaydı (`case.service.ts` 2397/2569…) | `AuditService.log` değil; timeline mekanizması |

**Sonuç:** Ana `AuditService` yalnız **3 dosyada** inject edilir (`: AuditService` taraması, non-test):
`case.service.ts` · `responsible-candidates.service.ts` · `ocr-feedback.service.ts` (+ `audit.controller.ts` = salt-okuma sorgu, yazmaz).

---

## 2. Tüm `AuditService.log` call-site'ları (TAM liste)

`auditService.log` taraması (non-test) → 15 call-site. `responsible-candidates`+`ocr-feedback` ZATEN userId taşıyor.

### case.service.ts (13 call-site)
| # | satır | Metot | action / entityType | userId şu an? | Metot userId alıyor mu? | Sürücü | Karar |
|---|------|-------|---------------------|---------------|--------------------------|--------|-------|
| 1 | 1444 | `auditStaffAssignment` (← `create`) | CREATE / CASE_STAFF | ❌ | helper HAYIR (create EVET) | user | **userId-required** (create'ten thread) |
| 2 | 1990 | `create` | CREATE / CASE | ❌ | EVET (`userId?`) | user | **userId-required** |
| 3 | 2005 | `create` (WP-1d-pre) | CREATE / CASE · OWNER_INITIALIZED | ✅ | EVET | user | ✅ DONE (#413) |
| 4 | 2028 | `create` (ASSIGN-4b demote) | UPDATE / CASE_LAWYER | ❌ | EVET | user (create içi oto-dedupe) | **userId-required** |
| 5 | 2135 | `update` | UPDATE / CASE | ❌ | **HAYIR** | user (PATCH) | **add param + controller** |
| 6 | 2157 | `delete` | DELETE / CASE | ❌ | **HAYIR** | user (DELETE) | **add param + controller** |
| 7 | 2334 | `batchUpdate` | UPDATE / CASE | ❌ | **HAYIR** | user (toplu) | **add param + controller** |
| 8 | 2808 | `updateCaseLawyer` | UPDATE / CASE_LAWYER | ❌ | **HAYIR** | user (PATCH lawyers) | **add param + controller** |
| 9 | 2972 | `addCaseLawyer` | CREATE / CASE_LAWYER | ❌ | **HAYIR** | user (POST lawyers) | **add param + controller** |
| 10 | 2983 | `addCaseLawyer` (promote) | UPDATE / CASE_LAWYER | ❌ | **HAYIR** | user | **add param + controller** |
| 11 | 3048 | `removeCaseLawyer` | DELETE / CASE_LAWYER | ❌ | **HAYIR** | user (DELETE lawyers) | **add param + controller** |
| 12 | 3059 | `removeCaseLawyer` (auto-promote) | UPDATE / CASE_LAWYER | ❌ | **HAYIR** | user | **add param + controller** |
| 13 | 3224 | `updateCaseStaff` | UPDATE / CASE_STAFF | ❌ | **HAYIR** | user (PATCH staff) | **add param + controller** |

### Diğer dosyalar (✅ zaten userId taşıyor — dokunma)
| dosya:satır | Metot | userId | Not |
|---|---|---|---|
| responsible-candidates.service.ts:248 | `assignResponsiblePerson` | ✅ | WP-1a (#410) |
| ocr-feedback.service.ts:45 | OCR feedback | ✅ | actor zaten geçiyor |

---

## 3. Sınıflandırma sonucu (kullanıcı çerçevesi)

| Sürücü türü | Bu kanalda var mı? | Açıklama |
|---|---|---|
| **user-driven** | ✅ 13/13 case call-site | Hepsi controller'dan tetiklenir; `userId` zorunlu olmalı |
| system/cron-driven | ❌ (bu kanalda yok) | Escalation/scheduler AYRI event tablosu kullanır |
| migration/backfill | ❌ | SQL migration; audit.log yok |
| integration/unknown | ❌ | Dış entegrasyon AuditLog'a yazmaz |

> **KRİTİK BULGU:** `AuditLog` kanalındaki TÜM yazımlar **user-driven**. "System-null meşru mu?" ikilemi
> bu kanalda **YOK** — system event'leri başka tablolarda. Dolayısıyla WP-1c hedefi tek cümleye iner:
> **case.service.ts'teki 13 audit call-site'ına `userId` aktar.** userId sweep ENTERPRISE-GENELİ değil,
> **tamamen case.service.ts içinde** (task/report/escalation modüllerinde AuditService.log YOK).

---

## 4. Alt-PR planı (tek dev sweep YOK)

Kullanıcının WP-1c-1(case)/c-2(task)/c-3(remaining) planı, AuditLog footprint'i case.service'te yoğunlaştığı
için şöyle daralır (task/remaining bu kanalda BOŞ):

| Alt-PR | Kapsam | Call-site | Controller değişimi | Boyut |
|---|---|---|---|---|
| **WP-1c-0** | Bu envanter (docs) | — | yok | küçük |
| **WP-1c-1** | `create` yolu audit'leri (#1,2,4) — create ZATEN userId alır; 3 audit'e + `auditStaffAssignment`'a thread et | 1444·1990·2028 | **YOK** (create controller userId geçiyor) | küçük |
| **WP-1c-2** | CASE mutasyonları: `update`·`delete`·`batchUpdate` — userId param + controller `@CurrentUser("id")` | 2135·2157·2334 | 3 endpoint | orta |
| **WP-1c-3** | CASE_LAWYER + CASE_STAFF mutasyonları: `updateCaseLawyer`·`addCaseLawyer`·`removeCaseLawyer`·`updateCaseStaff` | 2808·2972·2983·3048·3059·3224 | 4 endpoint | orta |

**İlk kod PR'ı = WP-1c-1** (en küçük, controller'a dokunmaz; create userId'sini mevcut audit'lere bağlar).
Her alt-PR: hedefli spec (audit userId geçti) + tsc.prod; api-only → web testi yok; auto-merge.

**WP-1d (temporal) ön-koşulu:** en az WP-1c-1 + WP-1c-2 (CASE çekirdeği) bitmeli. CASE_LAWYER/CASE_STAFF (c-3)
temporal CASE owner sorgusu için zorunlu değil ama tamlık için önerilir.

---

## 5. Kritik kural (her alt-PR'da)

```text
User-driven audit event MUST have actor userId.
Non-user-driven event MUST declare actor/source in metadata (bu kanalda yok; system events ayrı tabloda).
```
Bu kanalda `userId=null` bırakılacak meşru bir case audit yok → her 13 call-site userId taşımalı.

---

## 6. WP-1c-0 kabul kriteri (bu doküman)
- ✅ Kod değişikliği yok (yalnız docs).
- ✅ TÜM `AuditService.log` call-site'ları listelendi (taranarak: `: AuditService` injector + `auditService.log`).
- ✅ Her call-site için karar (userId-required / done / out-of-scope-kanal).
- ✅ Alt-PR planı (c-1/c-2/c-3) çıktı.
- ✅ `assignResponsiblePerson`(WP-1a) · create-owner audit(WP-1d-pre) · `createdById`(WP-1b) DONE işaretli.
- ✅ Out-of-scope audit altyapıları (escalation/task-closure/break-glass/diagnostics/migration) gerekçeli ayrıldı.

## 7. Non-goals
- ❌ Kod sweep (alt-PR'larda). ❌ system-event tablolarına dokunma. ❌ yeni audit alanı/kolon.
- ❌ `actorType`/`source` enum'u (gerekirse mevcut `metadata`'ya serbest alan; yeni enum yok).
