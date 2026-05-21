---
status: active
review-trigger: "Phase 2 implementation başlamadan önce — her hard rule'un enforcement'ı doğrulanmalı"
phase: 2
---

# 12 — Implementation Readiness Pass

**This document maps accepted architectural rules to enforceable mechanisms.**

**Tarih:** 2026-05-20  
**Durum:** ✅ ACCEPTED (2026-05-20)  
**Bağımlılık:** Phase 1 Vocabulary Freeze (KAPALI, 2026-05-19)  
**Çıktı:** Her HR için somut enforcement mekanizması + gap analizi

---

## Yöntem

Her hard rule için:
1. **Mevcut kodda zaten enforce ediliyor mu?** → Dosya/satır kanıtı
2. **Enforce edilmiyorsa gap nedir?** → Somut mekanizma önerisi
3. **Priority:** P0 (Phase 2 blocker), P1 (Phase 2 içinde), P2 (Phase 2 sonrası)

**Stale audit koruması:** Bu tablodaki "Existing Coverage" sütunu yalnızca bu oturumda doğrulanmış dosya referanslarına dayanır.

---

## Özet İstatistik

| Durum | Sayı |
|-------|------|
| ✅ Zaten enforce ediliyor (tam) | 8 |
| ⚠️ Kısmen enforce ediliyor | 7 |
| ❌ Henüz enforce edilmiyor | 31 |
| **Toplam** | **46** |

| Priority | Sayı |
|----------|------|
| P0 (Phase 2 blocker) | 12 |
| P1 (Phase 2 içinde) | 22 |
| P2 (Phase 2 sonrası) | 12 |

---

## Ana Tablo


### HR-1 — Calculator imzasında `asOf` + `interpretationProfileId` zorunlu

| Alan | Değer |
|------|-------|
| **Enforcement Type** | TypeScript interface + runtime guard |
| **Existing Coverage** | ⚠️ Kısmen. `asOfDate` parametresi mevcut (`interest-engine/types.ts:85`). `interpretationProfileId` henüz yok. |
| **Gap** | `interpretationProfileId` parametresi calculator interface'ine eklenmeli. Runtime guard: eksikse throw. |
| **Implementation Step** | 1) `CalculationRequest` interface'e `interpretationProfileId: string` ekle. 2) Engine entry-point'te guard: `if (!req.interpretationProfileId) throw`. |
| **Owner** | dev |
| **Priority** | P0 |

### HR-2 — Calculator I/O yapamaz (no DB, no fetch, no fs)

| Alan | Değer |
|------|-------|
| **Enforcement Type** | ESLint `no-restricted-imports` + CI grep gate |
| **Existing Coverage** | ⚠️ Kısmen. `.eslintrc.js` faiz formülü dışı hesabı yasaklıyor ama calculator modülünde DB/fetch import yasağı yok. |
| **Gap** | `interest-engine/` altında `PrismaService`, `fetch`, `fs` import'u yasaklanmalı. |
| **Implementation Step** | `.eslintrc.js` overrides'a `interest-engine/**` için `no-restricted-imports` pattern ekle: `['**/prisma/**', 'node-fetch', 'fs', 'fs/promises']`. |
| **Owner** | lint-config |
| **Priority** | P1 |

### HR-3 — Calculator event emit edemez ve fact write yapamaz

| Alan | Değer |
|------|-------|
| **Enforcement Type** | ESLint `no-restricted-imports` |
| **Existing Coverage** | ❌ Yok. |
| **Gap** | `interest-engine/` altında event-runtime, fact-store, outbox import'u yasaklanmalı. |
| **Implementation Step** | `.eslintrc.js` overrides'a pattern ekle: `['**/v28-engine/**', '**/event-runtime/**', '**/fact-store/**']`. |
| **Owner** | lint-config |
| **Priority** | P1 |

### HR-4 — `IcrabotTimelineEntry` tablolarına UPDATE yasak (DB trigger)

| Alan | Değer |
|------|-------|
| **Enforcement Type** | DB trigger (BEFORE UPDATE → RAISE EXCEPTION) |
| **Existing Coverage** | ❌ Yok. Prisma schema'da (`schema.prisma:5540`) model tanımlı ama UPDATE/DELETE trigger yok. |
| **Gap** | Migration: `CREATE TRIGGER prevent_timeline_update BEFORE UPDATE ON "IcrabotTimelineEntry" FOR EACH ROW EXECUTE FUNCTION raise_immutable_error()`. |
| **Implementation Step** | Yeni Prisma migration: `prevent_timeline_update` + `prevent_timeline_delete` trigger'ları. |
| **Owner** | DB-migration |
| **Priority** | P0 |

### HR-5 — `IcrabotTimelineEntry` ve `IcrabotFactAudit` tablolarına DELETE yasak (DB trigger)

| Alan | Değer |
|------|-------|
| **Enforcement Type** | DB trigger (BEFORE DELETE → RAISE EXCEPTION) |
| **Existing Coverage** | ❌ Yok. Aynı durum HR-4 ile. `IcrabotFactAudit` (`schema.prisma:5497`) için de trigger yok. |
| **Gap** | Migration: `prevent_fact_audit_update`, `prevent_fact_audit_delete`, `prevent_timeline_delete`. |
| **Implementation Step** | HR-4 ile aynı migration'da. Tek `raise_immutable_error()` fonksiyonu, 4 trigger. |
| **Owner** | DB-migration |
| **Priority** | P0 |

### HR-6 — Engine kodu ≤ 2500 LOC

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (LOC counter script) |
| **Existing Coverage** | ❌ Yok. Mevcut `v28-engine/` modülü ~150 LOC (engine-run.service.ts). Sınır altında ama gate yok. |
| **Gap** | CI script: `wc -l` on `core-runtime/event-runtime/**/*.ts` (test hariç) ≤ 2500. |
| **Implementation Step** | `apps/api/scripts/ci-7-engine-loc-gate.sh` — glob count, threshold check. |
| **Owner** | dev-ops |
| **Priority** | P2 |

### HR-7 — 3 somut kullanımı olmadan base class yasak

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Human review (PR checklist) |
| **Existing Coverage** | ❌ Yok. |
| **Gap** | PR template'e checklist item: "Yeni abstract class/interface → 3 concrete implementation göster". |
| **Implementation Step** | `.github/PULL_REQUEST_TEMPLATE.md` güncelle. |
| **Owner** | dev |
| **Priority** | P2 |

### HR-8 — Yeni event tanımı için spec dokümanı zorunlu (CI gate)

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (grep for new event type → check spec exists) |
| **Existing Coverage** | ❌ Yok. |
| **Gap** | Yeni event type eklenmesi `07-event-taxonomy-v1.md`'de kayıtlı olmalı. CI: event type string'i taxonomy'de yoksa fail. |
| **Implementation Step** | `apps/api/scripts/ci-8-event-taxonomy-gate.sh` — event type registry vs code diff. |
| **Owner** | dev-ops |
| **Priority** | P1 |

### HR-9 — Yeni mimari bileşen için "hangi legal failure'ı engelliyor" cevabı zorunlu

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Human review (PR checklist) |
| **Existing Coverage** | ❌ Yok. |
| **Gap** | PR template'e: "Yeni modül/servis → hangi legal failure'ı engelliyor?" sorusu. |
| **Implementation Step** | `.github/PULL_REQUEST_TEMPLATE.md` güncelle. |
| **Owner** | dev |
| **Priority** | P2 |

### HR-10 — Stabilization fix'leri target architecture yönünde olmalı

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Human review |
| **Existing Coverage** | ❌ Yok (ama stabilization sprint kapalı — pratik risk düşük). |
| **Gap** | Minimal. PR review disiplini yeterli. |
| **Implementation Step** | PR template'e not. |
| **Owner** | dev |
| **Priority** | P2 |

### HR-11 — Per-aggregate `aggregate_version` monotonic ve gap-free (DB unique constraint)

| Alan | Değer |
|------|-------|
| **Enforcement Type** | DB migration (new column + UNIQUE constraint) |
| **Existing Coverage** | ❌ Yok. Kolon mevcut değil (dosya aramasında bulunamadı). Sadece spec'lerde tanımlı. |
| **Gap** | `IcrabotTimelineEntry` (veya yeni event tablosu) üzerine `aggregate_version BIGINT` + `UNIQUE(case_id, aggregate_version)`. |
| **Implementation Step** | Prisma migration: kolon ekle, mevcut satırlar için `ROW_NUMBER()` ile backfill, constraint ekle. |
| **Owner** | DB-migration |
| **Priority** | P0 |

### HR-12 — `Money` value object her yerde currency taşımalı

| Alan | Değer |
|------|-------|
| **Enforcement Type** | TypeScript type system |
| **Existing Coverage** | ✅ Tam. `packages/types/src/money.ts:43` → `interface Money { amountMinor: bigint; currency: Currency }`. `interest-engine/types/common.types.ts:30` → `class Money` (amount + currency). Her iki tanım currency taşıyor. |
| **Gap** | Yok (Faz 1'de TRY-only validator opsiyonel). |
| **Implementation Step** | — |
| **Owner** | — |
| **Priority** | — |

### HR-13 — Frontend may not infer legal truth

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (forbidden pattern scan) + ESLint |
| **Existing Coverage** | ⚠️ Kısmen. `scripts/check-single-source.js` frontend'te TCMB rate table, faiz formülü gibi pattern'leri tarıyor. AMA `apps/web/src/lib/interest-type-resolver` hâlâ mevcut ve kullanılıyor (`ProfessionalClaimItemForm.tsx:26`). |
| **Gap** | `interest-type-resolver` backend'e taşınmalı (Phase 2 task). CI gate: `check-single-source.js`'e `interest-type-resolver` pattern eklenmeli. |
| **Implementation Step** | 1) `check-single-source.js` FORBIDDEN_PATTERNS'a `interest-type-resolver` ekle. 2) Backend endpoint yaz. 3) Frontend'i backend'e bağla. |
| **Owner** | dev |
| **Priority** | P1 |

### HR-14 — Domain enum'lar tek kaynaktan (`@hukuk/domain`) import edilmeli

| Alan | Değer |
|------|-------|
| **Enforcement Type** | ESLint `no-restricted-imports` + CI gate |
| **Existing Coverage** | ⚠️ Kısmen. `.eslintrc.js:45-56` deprecated modül import'larını yasaklıyor. Ama `packages/types` → `@hukuk/domain` rename henüz yapılmadı. |
| **Gap** | Rename sonrası: eski path'lerden import yasağı. |
| **Implementation Step** | Phase 2 task 14 (packages/types → packages/domain rename) sonrası ESLint pattern güncelle. |
| **Owner** | lint-config |
| **Priority** | P1 |

### HR-15 — PolicyGateService DB write yapamaz (decision log dışında)

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (AST scan) |
| **Existing Coverage** | ⚠️ Kısmen. `case-policy-engine.service.ts` Prisma inject ediyor ama sadece `findUnique` (read) kullanıyor. `fact-store.service.ts` ise `upsert` + `create` yapıyor (fact write + audit). Decision log yazımı `cpeDecisionLog.create` ile yapılıyor (izinli). |
| **Gap** | `fact-store.service.ts` policy-engine modülü içinde ama **write** yapıyor. Mimari karar: FactStore write'ı v28-engine'e delege edilmeli (03-vocabulary-unification #15). Geçiş sürecinde: CI gate `policy-engine/` altında `prisma.*.create|update|upsert` pattern'ini tarar, allowlist: `cpeDecisionLog`, `cpeExecutionLog`. |
| **Implementation Step** | `apps/api/scripts/ci-9-policy-write-gate.sh` — grep + allowlist. |
| **Owner** | dev-ops |
| **Priority** | P1 |

### HR-16 — EventRuntimeService legal authorization kararı veremez

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (import scan) |
| **Existing Coverage** | ❌ Yok. |
| **Gap** | `v28-engine/` (veya gelecek `core-runtime/event-runtime/`) altında `policy-engine` import'u yasak. |
| **Implementation Step** | `.eslintrc.js` overrides: `v28-engine/**` için `no-restricted-imports` → `['**/policy-engine/**']`. |
| **Owner** | lint-config |
| **Priority** | P1 |

### HR-17 — CaseService direkt outbox yazamaz (EventRuntime üzerinden)

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (import/usage scan) |
| **Existing Coverage** | ❌ Yok. `case.service.ts` henüz event emission yapmıyor (grep sonucu boş). |
| **Gap** | Phase 2'de event emission eklendiğinde: `case/` modülünde `IcrabotOutboxAction` doğrudan create yasak. |
| **Implementation Step** | `.eslintrc.js` veya CI script: `case/**` altında `outboxAction.create` pattern yasak. |
| **Owner** | lint-config |
| **Priority** | P1 |

### HR-18 — `@deprecated` alias'lar sunset tarihinden sonra otomatik silinir

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (tarih karşılaştırma + import scan) |
| **Existing Coverage** | ❌ Yok. Sunset tarihleri belirlenmiş (2026-06-16 sunset, 2026-06-30 removal) ama CI gate yazılmamış. |
| **Gap** | CI script: `@deprecated` JSDoc tag'li dosyaları bul, sunset tarihini parse et, bugünün tarihiyle karşılaştır, yeni import varsa fail. |
| **Implementation Step** | `apps/api/scripts/ci-10-deprecated-sunset-gate.sh` (veya .ts). |
| **Owner** | dev-ops |
| **Priority** | P1 |

### HR-19 — Every architectural item must be classified (YAML frontmatter)

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (frontmatter lint) |
| **Existing Coverage** | ⚠️ Kısmen. `legal-kernel/` altındaki belgeler frontmatter taşıyor (doğrulandı: 00, 07, 08, 09, 10, 11, 92, PHASE-1-CHECKPOINT). Ama CI gate yok. |
| **Gap** | CI script: `.kiro/specs/legal-kernel/**/*.md` ve `90-future-work/**/*.md` dosyalarında YAML frontmatter + valid `status` field kontrolü. |
| **Implementation Step** | `apps/api/scripts/ci-11-frontmatter-gate.sh` — `grep -L '^---'` + status enum validation. Önce warning, vocabulary unification + 2 hafta sonra fail. |
| **Owner** | dev-ops |
| **Priority** | P2 |

### HR-20 — Event payload'ında calculator çıktısı veya projection alanı bulunamaz

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (event payload schema validation) + human review |
| **Existing Coverage** | ❌ Yok. Event payload'ları henüz formal schema'da değil. |
| **Gap** | Event payload TypeScript interface'lerinde `balance`, `totalInterest`, `allocation` gibi computed field'lar yasak. CI: event type interface'lerini tarar. |
| **Implementation Step** | Phase 2 task 13 (DomainEventIngestService) ile birlikte: event payload interface'leri yazılırken forbidden field listesi + CI grep. |
| **Owner** | dev |
| **Priority** | P1 |

### HR-21 — Event naming `NOUN_PAST_PARTICIPLE` formatında

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (regex validation) |
| **Existing Coverage** | ❌ Yok. Mevcut event'ler (PAYMENT_RECEIVED, CASE_OPENED, vb.) zaten bu formatta ama gate yok. |
| **Gap** | Event type registry'de her entry `^[A-Z]+_[A-Z]+$` (NOUN_PAST_PARTICIPLE) formatında olmalı. |
| **Implementation Step** | `ci-8-event-taxonomy-gate.sh` içine regex check ekle. |
| **Owner** | dev-ops |
| **Priority** | P1 |

### HR-22 — Yeni event tipi tanımlamak için ADR + event taxonomy revize zorunlu

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (HR-8 ile birleşik) + human review |
| **Existing Coverage** | ❌ Yok. |
| **Gap** | HR-8 gate'i yeterli: yeni event type code'da varsa taxonomy'de de olmalı. ADR zorunluluğu PR review'da enforce edilir. |
| **Implementation Step** | HR-8 ile aynı gate. PR template'e "Yeni event → ADR linki" checklist. |
| **Owner** | dev |
| **Priority** | P1 |

### HR-23 — `PAYMENT_REVERSED`, `CASE_RESUMED`, `CASE_REOPENED` `caused_by` zorunlu

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime guard (event ingestion validation) + CI gate |
| **Existing Coverage** | ❌ Yok. Bu event'ler henüz formal olarak emit edilmiyor. |
| **Gap** | `DomainEventIngestService.appendInTransaction()` içinde: bu 3 event type için `caused_by` field yoksa reject. |
| **Implementation Step** | Phase 2 task 13 (DomainEventIngestService) içinde validation rule. |
| **Owner** | dev |
| **Priority** | P0 |

### HR-24 — Operational event'ler `case_events` tablolarına yazılamaz

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime guard (event type classification) |
| **Existing Coverage** | ❌ Yok. Operational event kavramı henüz implement edilmedi. |
| **Gap** | Event type enum'da `layer: 'DOMAIN' | 'OPERATIONAL'` ayrımı. Ingestion service: `OPERATIONAL` layer event'i domain tabloya yazarsa reject. |
| **Implementation Step** | Phase 2 task 13 ile birlikte. |
| **Owner** | dev |
| **Priority** | P1 |

### HR-25 — Otomatik reaksiyonlar legal consequence inference yapamaz

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Human review + CI gate (forbidden action in auto-trigger context) |
| **Existing Coverage** | ❌ Yok. |
| **Gap** | v28-engine rule handler'larında: `CASE_CLOSED`, `CASE_REOPENED`, `PAYMENT_REVERSED` emit yasak (sadece projection update, flag set, audit log izinli). |
| **Implementation Step** | CI grep: rule handler dosyalarında forbidden event emit pattern. |
| **Owner** | dev |
| **Priority** | P1 |

### HR-26 — Closure, reopen, policy override, identity correction, enforcement action avukat kararı gerektirir

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime guard (actor validation) |
| **Existing Coverage** | ⚠️ Kısmen. `CasePolicyEngine` closed case'te action'ları blokluyor (integration test kanıtı). Ama generic "actor must be human" guard yok. |
| **Gap** | Event ingestion'da: bu action type'lar için `actor.type === 'HUMAN'` zorunlu. `SYSTEM` actor ile emit edilemez. |
| **Implementation Step** | Phase 2 task 13: actor validation middleware. |
| **Owner** | dev |
| **Priority** | P0 |

### HR-27 — Forbidden chain pattern'leri CI gate ile engellenir

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime validation (replay validator) + CI gate |
| **Existing Coverage** | ❌ Yok. |
| **Gap** | Replay validator: event stream'de forbidden chain tespit edilirse alarm. CI: forbidden chain test coverage zorunlu. |
| **Implementation Step** | Phase 2 task 13 sonrası: replay validator modülü. |
| **Owner** | dev |
| **Priority** | P1 |

### HR-28 — PolicyGate event log'a yazamaz, sadece decision log'a

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (HR-15 ile birleşik) |
| **Existing Coverage** | ⚠️ Kısmen. HR-15 ile aynı durum. PolicyGate `cpeDecisionLog.create` yapıyor (izinli). Event log'a (IcrabotTimelineEntry, IcrabotCaseFact) doğrudan yazma `fact-store.service.ts` üzerinden yapılıyor — bu delege edilmeli. |
| **Gap** | HR-15 gate'i bu rule'u da kapsar. |
| **Implementation Step** | HR-15 ile aynı. |
| **Owner** | dev-ops |
| **Priority** | P1 |

### HR-29 — `recorded_at` server-side set edilir, client override edilemez

| Alan | Değer |
|------|-------|
| **Enforcement Type** | DB default + runtime guard |
| **Existing Coverage** | ✅ Tam. `IcrabotTimelineEntry.createdAt` → `@default(now())` (schema.prisma). `IcrabotFactAudit.createdAt` → `@default(now())`. Client override mümkün değil (Prisma `create` data'sında `createdAt` verilmezse DB default). |
| **Gap** | Yok (mevcut Prisma schema zaten zorluyor). Ek güvence: ingestion service'te `recorded_at` field'ı input'tan strip edilir. |
| **Implementation Step** | Phase 2 task 13'te input sanitization. |
| **Owner** | dev |
| **Priority** | P1 |

### HR-30 — Calculator imzasında `asOf` parametresi zorunlu

| Alan | Değer |
|------|-------|
| **Enforcement Type** | TypeScript interface |
| **Existing Coverage** | ✅ Tam. `CalculationRequest` interface'inde `asOfDate: string` zorunlu field (`interest-engine/types.ts:85`). Tüm test'ler `asOfDate` sağlıyor. |
| **Gap** | Yok. |
| **Implementation Step** | — |
| **Owner** | — |
| **Priority** | — |

### HR-31 — `effective_from < recorded_at` (retroactive) → audit log'da `is_retroactive: true`

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime guard (event ingestion) |
| **Existing Coverage** | ❌ Yok. `effective_from` field henüz event payload'larında implement edilmedi. |
| **Gap** | Event ingestion service: `if (event.effective_from < event.recorded_at)` → audit flag set. |
| **Implementation Step** | Phase 2 task 13 içinde. |
| **Owner** | dev |
| **Priority** | P1 |

### HR-32 — Sealed artifacts retroactive recalc'tan etkilenmez

| Alan | Değer |
|------|-------|
| **Enforcement Type** | DB trigger (write-once) + runtime guard |
| **Existing Coverage** | ✅ Tam. `bundle_seal_events` tablosu write-once trigger ile korunuyor (`migration 20260202110000`, `bundle_seal_event_guard` trigger). `SimulationSnapshot` `calcHash` UNIQUE constraint. `evidence_objects` insert guard trigger mevcut. |
| **Gap** | Yok (mevcut altyapı zaten zorluyor). |
| **Implementation Step** | — |
| **Owner** | — |
| **Priority** | — |

### HR-33 — `effective_from` earliest event'ten önceyse `retroactive_override` zorunlu

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime guard (event ingestion validation) |
| **Existing Coverage** | ❌ Yok. |
| **Gap** | Event ingestion: `effective_from < earliest_event.occurred_at` → `retroactive_override` field zorunlu (authorized_by, authorization_reason, references). Yoksa reject. |
| **Implementation Step** | Phase 2 task 13 içinde validation rule. |
| **Owner** | dev |
| **Priority** | P0 |

### HR-34 — Event header'a `occurred_at_confidence` zorunlu

| Alan | Değer |
|------|-------|
| **Enforcement Type** | TypeScript interface + runtime guard |
| **Existing Coverage** | ❌ Yok. Mevcut event header'larında bu field yok. |
| **Gap** | Event header interface'e `occurred_at_confidence: 'SYSTEM_VERIFIED' | 'EXTERNAL_SIGNED' | 'USER_DECLARED'` ekle. Ingestion: yoksa reject. |
| **Implementation Step** | Phase 2 task 13 (event header definition). |
| **Owner** | dev |
| **Priority** | P0 |

### HR-35 — Sealed artifact üretiminde 10 context field snapshot'a yazılır

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime guard (seal service validation) |
| **Existing Coverage** | ✅ Tam. `SimulationSnapshot` Prisma modeli `calcHash` (output_hash), `requestJson` (input context) taşıyor. `BundleSealService` seal sırasında hash computation yapıyor. `determinism.ts` canonical JSON + SHA-256. Mevcut altyapı 10 field'ın çoğunu zaten persist ediyor. |
| **Gap** | Minimal. `interpretation_profile_id` ve `allocation_policy_id` field'ları henüz snapshot'a yazılmıyor (bu kavramlar Faz 1'de tanımlandı, implement edilmedi). |
| **Implementation Step** | Phase 2'de `INTEREST_POLICY_ASSIGNED` implement edildiğinde snapshot context genişletilir. |
| **Owner** | dev |
| **Priority** | P1 |

### HR-36 — Yeni implicit rule için 4 mandatory filter sorusu zorunlu

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (YAML schema validation) |
| **Existing Coverage** | ❌ Yok. Mevcut 5 implicit rule doğru formatta yazılmış (10-implicit-rules.md) ama CI gate yok. |
| **Gap** | CI script: `10-implicit-rules.md` parse → her rule block'ta 4 `why_not_*` field var mı? |
| **Implementation Step** | `apps/api/scripts/ci-12-implicit-rule-gate.sh` (veya Node script). |
| **Owner** | dev-ops |
| **Priority** | P2 |

### HR-37 — Implicit rule sayısı 10'u geçemez

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (count check) |
| **Existing Coverage** | ❌ Yok. Şu an 5 rule (sınır altında). |
| **Gap** | CI script: `10-implicit-rules.md`'de `rule_id:` satır sayısı ≤ 10. |
| **Implementation Step** | HR-36 gate'i ile birleşik. |
| **Owner** | dev-ops |
| **Priority** | P2 |

### HR-38 — Implicit rule kategorileri 5 ile sınırlı

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (enum validation) |
| **Existing Coverage** | ❌ Yok. |
| **Gap** | CI script: `category:` field'ı `AUDIT_SAFETY|REPLAY_SAFETY|HUMAN_WORKFLOW|LEGAL_EDGE_CASE|INTEGRATION_AMBIGUITY` dışında değer alırsa fail. |
| **Implementation Step** | HR-36 gate'i ile birleşik. |
| **Owner** | dev-ops |
| **Priority** | P2 |

### HR-39 — Event APPEND domain mutation transaction'ı ile aynı tx içinde

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime architecture (API design) + CI gate |
| **Existing Coverage** | ❌ Yok. `case.service.ts` henüz event emission yapmıyor. |
| **Gap** | `DomainEventIngestService.appendInTransaction(tx, event)` API'si — tx parametresi zorunlu. CI lint: domain mutation içeren tx'te `appendInTransaction` çağrısı var mı? |
| **Implementation Step** | Phase 2 task 13 (DomainEventIngestService skeleton). CI gate: Phase 2 task 15. |
| **Owner** | dev |
| **Priority** | P0 |

### HR-40 — External dispatch outbox-backed olmalı

| Alan | Değer |
|------|-------|
| **Enforcement Type** | CI gate (direct API call scan) + runtime architecture |
| **Existing Coverage** | ✅ Tam. Mevcut `IcrabotOutboxAction` modeli outbox pattern'i implement ediyor. `v28-engine` dispatch outbox üzerinden yapılıyor (v28_factstore_actions/dispatch_outbox.py kanıtı). |
| **Gap** | Yok (mevcut altyapı zaten outbox-backed). Yeni servisler için: CI gate `case/` veya `collection/` altında doğrudan HTTP call (fetch/axios) yasak. |
| **Implementation Step** | `check-single-source.js`'e veya yeni CI gate'e: domain service'lerde bare fetch yasağı (CI-1 zaten bunu kısmen yapıyor). |
| **Owner** | dev-ops |
| **Priority** | P2 |

### HR-41 — Outbox sealed row'ları immutable (UPDATE/DELETE DB trigger ile yasak)

| Alan | Değer |
|------|-------|
| **Enforcement Type** | DB trigger |
| **Existing Coverage** | ❌ Yok. `IcrabotOutboxAction` tablosunda `status` update ediliyor (pending→sent→done). Sealed row (status=SENT, sealed_at IS NOT NULL) koruması yok. |
| **Gap** | Migration: `BEFORE UPDATE ON "IcrabotOutboxAction"` → `IF OLD.status IN ('done','dead') AND OLD.sealed_at IS NOT NULL THEN RAISE EXCEPTION`. |
| **Implementation Step** | Prisma migration: outbox sealed row trigger. |
| **Owner** | DB-migration |
| **Priority** | P1 |

### HR-42 — External event ingestion `idempotency_key` ile dedupe edilmeli

| Alan | Değer |
|------|-------|
| **Enforcement Type** | DB constraint + runtime guard |
| **Existing Coverage** | ✅ Tam. `IcrabotOutboxAction.idempotencyKey` → `@unique` constraint (schema.prisma). Duplicate insert DB-level reject. |
| **Gap** | Outbox için mevcut. Event ingestion (yeni DomainEventIngestService) için de `event_id` UNIQUE constraint gerekecek. |
| **Implementation Step** | Phase 2 task 13: event tablosunda `event_id` UNIQUE. |
| **Owner** | dev |
| **Priority** | P0 |

### HR-43 — PolicyGate `canPerformAction()` domain command transaction'ı dışında

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime architecture (call ordering) + CI gate |
| **Existing Coverage** | ✅ Tam. `CasePolicyEngine.canPerformAction()` kendi Prisma call'larını yapıyor (read-only), domain tx'e katılmıyor. Decision log kendi tx'inde yazılıyor. |
| **Gap** | Yok (mevcut mimari zaten bunu zorluyor — PolicyGate ayrı servis, tx paylaşmıyor). |
| **Implementation Step** | — |
| **Owner** | — |
| **Priority** | — |

### HR-44 — Outbox append, domain mutation ve event append AYNI TRANSACTION içinde

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime architecture (API design) |
| **Existing Coverage** | ❌ Yok. Mevcut `case.service.ts` event emission yapmıyor. v28-engine (Python) `transaction.atomic()` ile yapıyor ama NestJS tarafında henüz yok. |
| **Gap** | `DomainEventIngestService.appendInTransaction(tx, event)` + outbox row aynı tx. HR-39 ile birleşik. |
| **Implementation Step** | Phase 2 task 13. |
| **Owner** | dev |
| **Priority** | P0 |

### HR-45 — Domain mutation succeeds only if event append succeeds (yarı durum yasak)

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime architecture (single tx rollback) |
| **Existing Coverage** | ❌ Yok (NestJS tarafında). Python v28-engine `transaction.atomic()` ile bunu sağlıyor. |
| **Gap** | HR-39 + HR-44 ile aynı mekanizma: `prisma.$transaction()` içinde hem domain write hem event append. Biri fail → tüm tx rollback. |
| **Implementation Step** | Phase 2 task 13. |
| **Owner** | dev |
| **Priority** | P0 |

### HR-46 — Outbox worker retry policy failure mode sınıflandırması

| Alan | Değer |
|------|-------|
| **Enforcement Type** | Runtime configuration + human review |
| **Existing Coverage** | ⚠️ Kısmen. v28-engine dispatch_outbox.py: retry (status=failed, next_retry_at set) vs dead-letter (status=dead) ayrımı mevcut. NestJS tarafında henüz outbox worker yok. |
| **Gap** | NestJS outbox worker yazıldığında: failure mode enum (RETRY_SAFE, QUARANTINE, HALT) + ADR for new mode. |
| **Implementation Step** | Phase 2 task 13 sonrası: outbox worker implementation. |
| **Owner** | dev |
| **Priority** | P1 |

---

## Enforcement Mekanizma Özeti (Tip Bazında)

| Enforcement Type | HR Sayısı | Mevcut | Eksik |
|-----------------|-----------|--------|-------|
| DB trigger | 4 (HR-4,5,41,11) | 0 | 4 |
| DB constraint | 3 (HR-11,12,42) | 2 | 1 |
| TypeScript interface | 4 (HR-1,30,34,12) | 2 | 2 |
| ESLint rule | 6 (HR-2,3,14,16,17,18) | 1 kısmen | 5 |
| CI gate script | 14 (HR-6,8,15,19,20,21,22,25,27,36,37,38,39,40) | 0 | 14 |
| Runtime guard | 10 (HR-23,24,26,29,31,33,34,42,44,45) | 2 | 8 |
| Human review | 4 (HR-7,9,10,46) | 0 | 4 |
| Write-once (mevcut) | 3 (HR-32,35,43) | 3 | 0 |

---

## P0 Blocker Listesi (Phase 2 başlamadan önce çözülmeli)

| # | HR | Kısa Tanım | Mekanizma | Tahmini Süre |
|---|-----|------------|-----------|--------------|
| 1 | HR-1 | `interpretationProfileId` calculator'a ekle | TS interface + guard | 2h |
| 2 | HR-4+5 | Timeline/FactAudit immutability triggers | DB migration | 4h |
| 3 | HR-11 | `aggregate_version` kolon + constraint | DB migration + backfill | 4h |
| 4 | HR-23 | `caused_by` validation (3 event type) | Runtime guard | 2h |
| 5 | HR-26 | Actor type validation (human-required actions) | Runtime guard | 3h |
| 6 | HR-33 | Retroactive override validation | Runtime guard | 2h |
| 7 | HR-34 | `occurred_at_confidence` header field | TS interface + guard | 2h |
| 8 | HR-39 | `appendInTransaction(tx, event)` API | Service skeleton | 4h |
| 9 | HR-42 | Event `event_id` UNIQUE constraint | DB migration | 1h |
| 10 | HR-44 | Same-tx atomicity (mutation+event+outbox) | Architecture | (HR-39 ile) |
| 11 | HR-45 | Yarı durum yasak (rollback guarantee) | Architecture | (HR-39 ile) |

**Toplam P0 tahmini:** ~24 saat (3 iş günü konsantre çalışma)

> **Not:** HR-39, HR-44, HR-45 aynı implementation'ın farklı yüzleri — `DomainEventIngestService` skeleton'ı (Phase 2 task 13) bunların üçünü birden çözer.

---

## Mevcut CI Altyapısı (Kanıt)

Doğrulanmış mevcut enforcement mekanizmaları:

| Mekanizma | Dosya | Ne Yapıyor |
|-----------|-------|------------|
| ESLint `no-restricted-syntax` | `apps/api/.eslintrc.js:27-42` | Faiz formülü (x/365, x/36500) ve `toFixed()` yasağı — interest-engine dışında |
| ESLint `no-restricted-imports` | `apps/api/.eslintrc.js:45-56` | `rule-engine` ve `validation-gate` deprecated import yasağı |
| CI-1 Bare fetch gate | `apps/api/scripts/ci-1-bare-fetch-gate.sh` | Production path'te bare `fetch()` kontrolü |
| CI-2 PII log leak gate | `apps/api/scripts/ci-2-pii-log-leak-gate.sh` | Log'larda PII sızıntısı kontrolü |
| CI-3 Scheduler unbounded gate | `apps/api/scripts/ci-3-scheduler-unbounded-gate.sh` | Scheduler sınırsız çalışma kontrolü |
| CI-4 Trust proxy gate | `apps/api/scripts/ci-4-trust-proxy-gate.sh` | Trust proxy konfigürasyonu |
| CI-5 Scheduler metrics gate | `apps/api/scripts/ci-5-scheduler-metrics-gate.sh` | Scheduler metrik kontrolü |
| CI-6 Symbol token singleton gate | `apps/api/scripts/ci-6-symbol-token-singleton-gate.sh` | DI token singleton kontrolü |
| ADR-007 check | `.github/workflows/ci.yml:22-25` | `req.idempotencyContext` doğrudan atama yasağı |
| Frontend forbidden patterns | `scripts/check-single-source.js` | Frontend'te TCMB rate table, hardcoded oran yasağı |
| Frontend money leaks | `scripts/check-money-leaks.ts` | Frontend'te faiz formülü yasağı |
| Sweep: ESLint Architecture | `.github/workflows/sweep.yml:58-85` | Chaos import yasağı, module boundary |
| Sweep: Module Boundary | `.github/workflows/sweep.yml` | Modül sınır kontrolü |
| DB trigger: evidence_object_insert_guard | `migration 20260202110000` | Sealed bundle'a yazma yasağı |
| DB trigger: bundle_seal_event_guard | `migration 20260202110000` | Seal event sadece SEALED bundle'a |
| DB: IcrabotOutboxAction.idempotencyKey UNIQUE | `schema.prisma` | Outbox idempotency |
| DB: SimulationSnapshot.calcHash UNIQUE | `schema.prisma` | Snapshot determinism |
| Hash chain: audit-chain.service.ts | `icrabot/enterprise/audit-chain.service.ts` | prevHash → SHA-256 chain |

---

## Yeni CI Gate Planı (ci-7 → ci-12)

| Gate | Dosya | HR Coverage | Priority |
|------|-------|-------------|----------|
| ci-7 | `ci-7-engine-loc-gate.sh` | HR-6 | P2 |
| ci-8 | `ci-8-event-taxonomy-gate.sh` | HR-8, HR-21, HR-22 | P1 |
| ci-9 | `ci-9-policy-write-gate.sh` | HR-15, HR-28 | P1 |
| ci-10 | `ci-10-deprecated-sunset-gate.sh` | HR-18 | P1 |
| ci-11 | `ci-11-frontmatter-gate.sh` | HR-19 | P2 |
| ci-12 | `ci-12-implicit-rule-gate.sh` | HR-36, HR-37, HR-38 | P2 |

---

## ESLint Genişletme Planı

```javascript
// .eslintrc.js'e eklenecek overrides (Phase 2)
overrides: [
  // HR-2, HR-3: Calculator I/O + event emit yasağı
  {
    files: ['**/modules/interest-engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/prisma/**'], message: 'HR-2: Calculator DB erişimi yasak' },
          { group: ['node-fetch', 'axios'], message: 'HR-2: Calculator fetch yasak' },
          { group: ['fs', 'fs/promises'], message: 'HR-2: Calculator fs yasak' },
          { group: ['**/v28-engine/**', '**/event-runtime/**'], message: 'HR-3: Calculator event emit yasak' },
          { group: ['**/fact-store/**'], message: 'HR-3: Calculator fact write yasak' },
        ],
      }],
    },
  },
  // HR-16: EventRuntime policy import yasağı
  {
    files: ['**/modules/icrabot/v28-engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/policy-engine/**'], message: 'HR-16: EventRuntime legal auth kararı veremez' },
        ],
      }],
    },
  },
  // HR-17: CaseService outbox direct write yasağı
  {
    files: ['**/modules/case/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/outbox/**'], message: 'HR-17: CaseService direkt outbox yazamaz' },
        ],
      }],
    },
  },
]
```

---

## DB Migration Planı (tek migration dosyası)

```sql
-- Migration: 2026XXXX_legal_kernel_immutability_gates

-- 1. Shared function
CREATE OR REPLACE FUNCTION raise_immutable_error()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_VIOLATION: % on % is forbidden',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = '45010';
END;
$$ LANGUAGE plpgsql;

-- 2. HR-4: IcrabotTimelineEntry UPDATE yasak
CREATE TRIGGER prevent_timeline_update
  BEFORE UPDATE ON "IcrabotTimelineEntry"
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

-- 3. HR-5: IcrabotTimelineEntry DELETE yasak
CREATE TRIGGER prevent_timeline_delete
  BEFORE DELETE ON "IcrabotTimelineEntry"
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

-- 4. HR-5: IcrabotFactAudit UPDATE yasak
CREATE TRIGGER prevent_fact_audit_update
  BEFORE UPDATE ON "IcrabotFactAudit"
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

-- 5. HR-5: IcrabotFactAudit DELETE yasak
CREATE TRIGGER prevent_fact_audit_delete
  BEFORE DELETE ON "IcrabotFactAudit"
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

-- 6. HR-11: aggregate_version (Phase 2 task 13 ile birlikte)
-- ALTER TABLE "IcrabotTimelineEntry" ADD COLUMN aggregate_version BIGINT;
-- + backfill + UNIQUE(caseId, aggregate_version)
```

---

## Phase 2 Execution Order (12'den sonra)

Bu belge Phase 2 roadmap'ini (PHASE-1-CHECKPOINT.md §Phase 2 Roadmap) **enforcement-aware** hale getirir:

| Sıra | Task | Bağımlılık | HR Coverage |
|------|------|------------|-------------|
| 1 | DB migration (immutability triggers) | — | HR-4, HR-5 |
| 2 | `interpretationProfileId` interface ekle | — | HR-1 |
| 3 | ESLint genişletme (HR-2,3,16,17) | — | HR-2, HR-3, HR-16, HR-17 |
| 4 | DomainEventIngestService skeleton | 1, 2 | HR-23, HR-26, HR-29, HR-31, HR-33, HR-34, HR-39, HR-42, HR-44, HR-45 |
| 5 | `aggregate_version` migration | 4 | HR-11 |
| 6 | CI gate scripts (ci-7..ci-12) | 3, 4 | HR-6, HR-8, HR-15, HR-18, HR-19, HR-21, HR-22, HR-28, HR-36-38 |
| 7 | `packages/types` → `packages/domain` rename | — | HR-14 |
| 8 | Frontend `interest-type-resolver` migration | 4, 7 | HR-13 |
| 9 | Outbox sealed row trigger | 4 | HR-41 |
| 10 | PR template update | — | HR-7, HR-9, HR-10 |

---

## DoD (Definition of Done)

- [x] 46 hard rule tamamı tabloda
- [x] Her HR için Existing Coverage (dosya/satır kanıtı veya "yok")
- [x] Her HR için Gap + Implementation Step
- [x] Priority assignment (P0/P1/P2)
- [x] P0 blocker listesi + süre tahmini
- [x] Mevcut CI altyapısı envanteri (kanıtlı)
- [x] Yeni CI gate planı
- [x] ESLint genişletme planı (code snippet)
- [x] DB migration planı (SQL snippet)
- [x] Phase 2 execution order (enforcement-aware)
- [x] **ulas onayı (2026-05-20)**

---

## Onay

**Decision Status:** Accepted  
**Accepted On:** 2026-05-20  
**Accepted By:** ulas

---

## Phase 2 Sprint 1 Disiplin Kuralı (onay ile birlikte)

> **No new architectural ideas during first implementation sprint.**

Sprint 1'in tek amacı: **make the accepted semantics mechanically enforceable.**

Yasak:
- ❌ Yeni framework üretmek
- ❌ Yeni event katmanı düşünmek
- ❌ Generic runtime yazmak
- ❌ Mevcut 46 HR dışında yeni kural eklemek

İzinli:
- ✅ Mevcut 46 HR'ı enforce etmek
- ✅ DB trigger, ESLint rule, CI gate yazmak
- ✅ `DomainEventIngestService` skeleton (minimal: append, validate, aggregate_version, caused_by, actor, outbox append — hepsi bu)

---

## P0 Execution Order (onaylı sıra)

| Sıra | İş | Niye Bu Sırada |
|------|-----|----------------|
| **1** | `aggregate_version` + UNIQUE constraint | Ordering, replay, causality, append discipline bunun üstüne oturuyor. Event append semantics bu olmadan güvenli değil. |
| **2** | Immutability triggers (IcrabotTimelineEntry + IcrabotFactAudit) | Immutable = DB-enforced, not convention-enforced. |
| **3** | `DomainEventIngestService` skeleton | Bridge semantics, same-tx append, caused_by, actor validation, confidence propagation — merkezi enforcement noktası. |

**DomainEventIngestService uyarısı:** İlk versiyon sadece şunları yapar:
1. `appendInTransaction(tx, event)` — same-tx guarantee
2. `aggregate_version` increment — monotonic + gap-free
3. `caused_by` validation — 3 event type için zorunlu
4. `actor.type` validation — human-required actions
5. `occurred_at_confidence` validation — header field zorunlu
6. `retroactive_override` validation — effective_from guard
7. Outbox row append — same tx

**Generic enterprise event framework'e dönüşmesi YASAK.**

---

## Sonraki Adım

> "Phase 2 Sprint 1 başlıyor. İlk iş: `aggregate_version` migration."
