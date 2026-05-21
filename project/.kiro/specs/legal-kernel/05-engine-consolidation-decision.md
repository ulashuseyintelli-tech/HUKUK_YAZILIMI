---
status: active
review-trigger: "Migration sırasında ihtiyaca göre — engine consolidation tamamlandığında completed'a geçer"
---

# Engine Consolidation Decision

**Tarih:** 2026-05-19  
**Durum:** ✅ ONAYLANDI (2026-05-19)  
**Bağlam:** `04-deep-scan-findings.md`'da tespit edilen iki paralel motor (`policy-engine/CasePolicyEngine` ve `icrabot/v28-engine/EngineRunnerService`) için karar belgesi.

---

## Onay Notu

İki motor da kalır — tek legal kernel'in iki katmanı olarak. Silme yok. Rewrite yok. Formalize + rename + data-layer unification var.

**Anayasal cümle:** "Policy karar verir, runtime kayıt altına alır."

**Layer Discipline:**
- `PolicyGateService`: pre-action, sync, no/limited side-effects (sadece decision log)
- `EventRuntimeService`: post-action, async, side-effects (fact write, outbox, timeline)
- `InterestEngine`: calc-time, **pure olmalı** (computeBalance pure + writeAudit side-effect ayrılır)
- `CaseService`: command-time, transaction sonunda DomainEvent emit eder

**Rename Strategy:** Deprecation period (b), eski isimler alias kalır, sunset = vocabulary unification spec imza tarihi + 4 hafta.

---

## Hipotez (test edildi)

> **H1:** `v28-engine` = runtime/event processing substrate  
> **H2:** `policy-engine` = legal decision / domain brain  
> **H3:** İki motor paralel değil, **katmanlı** olmalı  

---

## Bulgular

### `v28-engine`'in gerçek doğası (kanıtlandı)

`engine-runner.service.ts:81-258` `runForEvent()` metodunun pipeline'ı:

```
Event arrives
  → factStore.getSnapshot(caseId)            -- facts + flags
  → buildContext { fact, flags, compute, event }
  → evaluator.checkWhen(rule.when, ctx)      -- when clause match
  → IF MATCHED:
       create icrabotEngineRun record (with snapshotHash)
       compute phase (rule.then.compute[])
       write phase (rule.then.write — facts/flags update)
       decision phase (rule.then.decisions[] → outbox.createAction)
       timeline entries: COMPUTE, FACT_WRITE, DECISION, ACTION
       finalize run (status=succeeded)
```

**Bu klasik bir rule-based event runtime.** YAML kuralları yükler, event geldiğinde when/then değerlendirir, side-effect'leri (fact write, action dispatch) outbox + timeline'a yazar. Kararı kendi vermez — dışarıdan gelen rule definition'larına göre tetikler.

**Veri depolama:** Per-case `IcrabotCaseFact` + `IcrabotCaseFlag` (+ audit). DB-backed, persistent. Idempotency key var (`outbox.createAction`).

**Caller:** Sadece UYAP event'leri (UyapEventIngestService) ve seed/test (ScenarioHarness, SeedService).

### `policy-engine/CasePolicyEngine`'in gerçek doğası (kanıtlandı)

`case-policy-engine.service.ts` API'leri:

```
canPerformAction(caseId, actionCode, context) → PolicyDecision  -- "Bu aksiyona izin var mı?"
getNextActions(caseId)                        → ActionRecommendation[]  -- "Şu an ne yapılmalı?"
onActionExecuted(caseId, actionCode, result)                    -- "Aksiyon yapıldı, kayıt al"
```

İç bağımlılıkları (`case-policy-engine.service.ts:41-56`):
- `factStore` (in-memory cache + DB-backed `IcrabotCaseFact`/`IcrabotCaseFlag` üzerinden okur — **aynı DB tabloları!**)
- `computedFactRegistry` (derived facts)
- `decisionLogger` + `executionRecorder` (decision audit)
- `stateMachine` (icra type → state transitions)
- `gateChecker` (rule + state → decision)
- `versionPinning` (rule version)

**Bu klasik bir authorization/decision engine.** Bir aksiyon talep edilince:
1. Facts'i cacheli okur
2. State machine'den hangi state'te olduğunu sorar
3. Action matrix'inden bu action için kuralları yükler
4. Gate checker rules + facts → karar
5. Decision log + execution record yazar

**Veri depolama:** **`v28-engine` ile AYNI** `IcrabotCaseFact` / `IcrabotCaseFlag` tablolarını kullanıyor (`fact-store.service.ts:265+` `writeFactToDb` aynı tabloya yazar). Üstüne in-memory **read cache** koyar (`getFromCache` / `setCache`).

**Callers:**
- `uyap.service.ts:188, 322` — UYAP_SEND, TRIGGER_HACIZ aksiyonları öncesi `canPerformAction` gate
- `stage-trigger.service.ts:107, 219` — stage transition öncesi `canPerformAction` + `getNextActions`
- `automation/workflow-engine.service.ts:172` — workflow engine'in CPE entegrasyonu (action-code-aware)
- `policy-engine.controller.ts` — REST endpoint'ler (`POST /policy/check-action`, `GET /policy/next-actions`)
- `decorators/cpe-required.guard.ts` — controller-level guard ("@CpeRequired(ActionCode.X)")

### Ortak veri katmanı

| Tablo | v28-engine | policy-engine |
|---|---|---|
| `IcrabotCaseFact` | yazıyor (factstore.write) | okuyor + yazıyor (writeFactToDb) |
| `IcrabotCaseFlag` | yazıyor | okuyor + yazıyor |
| `IcrabotFactAudit` | yazıyor | yazıyor |
| `IcrabotTimelineEntry` | yazıyor | yazmıyor (kendi `DecisionLog` + `ExecutionRecord` modelleri) |
| `IcrabotOutboxAction` | yazıyor | yazmıyor |
| `IcrabotEngineRun` | yazıyor | yazmıyor |
| `CpeDecisionLog` | yazmıyor | yazıyor |

**İlginç:** İki motor **veri katmanını paylaşıyor** ama **karar/log katmanı ayrı**. policy-engine kendi karar log'unu (`CpeDecisionLog`), v28-engine kendi run record'unu (`IcrabotEngineRun`) tutuyor.

---

## Doğru çerçeveleme: İki motor değil, **iki rol**

İlk analizimde "iki paralel motor, biri silinmeli" dedim. **Bu yanlıştı.** Gerçek durum:

```
                ┌─────────────────────────────────────────────────┐
                │           ROL 1: GATE / AUTHORIZATION           │
                │           "Bu aksiyon yapılabilir mi?"          │
                │                                                 │
                │           policy-engine/CasePolicyEngine        │
                │           ──────────────────────────────        │
                │           - state machine                       │
                │           - gate checker                        │
                │           - action matrix                       │
                │           - decision log                        │
                │                                                 │
                │  Sync API: canPerformAction(action) → decision  │
                └─────────────────────────────────────────────────┘
                                       ↓ (calls before action)
┌─────────────────────────────────────────────────────────────────────┐
│        DOMAIN COMMAND (uyap.service / stage-trigger / etc.)          │
└─────────────────────────────────────────────────────────────────────┘
                                       ↓ (action executed)
                ┌─────────────────────────────────────────────────┐
                │           ROL 2: EVENT PROCESSING               │
                │           "Olay oldu, ne yapacağız?"            │
                │                                                 │
                │           icrabot/v28-engine/EngineRunner       │
                │           ──────────────────────────────        │
                │           - rule loader (YAML)                  │
                │           - expression evaluator                │
                │           - compute registry                    │
                │           - outbox + timeline                   │
                │                                                 │
                │  Async: ingestEvent(uyap) → fact write + actions│
                └─────────────────────────────────────────────────┘
                                       ↓ (writes to)
┌─────────────────────────────────────────────────────────────────────┐
│         SHARED DATA: IcrabotCaseFact / IcrabotCaseFlag               │
│         (ortak fact store — read by both, write by both)             │
└─────────────────────────────────────────────────────────────────────┘
```

İkisi farklı sorulara cevap veriyor:
- **policy-engine** sync'tir: "Yapacağım, ama izin var mı?" → komut yapılmadan önce çalışır
- **v28-engine** async'tir: "Yapıldı / oldu, şimdi tepkim ne?" → olay sonrası tetiklenir

**Bunlar paralel değil. Tamamlayıcı.**

---

## Hâlâ olan sorunlar

Bu net görüldü ama iki gerçek sorun kalıyor:

### Sorun 1: İki sınıfın **aynı adı taşıması** (`FactStoreService`)

İki ayrı dosyada `class FactStoreService` var:
- `policy-engine/fact-store/fact-store.service.ts` (in-memory cached + scoped read)
- `icrabot/v28-engine/factstore.service.ts` (DB-direct write + audit)

**Aynı tabloyu** okuyup yazıyorlar ama farklı API yüzeyi:
- v28: `getSnapshot(caseId)` → `{ facts, flags }`
- policy: `getFacts(caseId, context?)` → `FactMap` (with scope chain support)

İkisi de `Injectable` ve `Logger`'lı. **Hangi import edildiği kullanım yerine göre değişiyor.** Bu sınıf adı çakışması yanlış kullanım riskinin ana kaynağı.

### Sorun 2: `case.service` her iki motora da konuşmuyor

- `case.create()` event yaymıyor → v28-engine bu olay için fact write yapmıyor (sadece UYAP'tan gelen event'ler için fact yazar).
- `case.create()` policy-engine'i `onActionExecuted`'a bildirmiyor → decision log boş kalıyor.

Yani **iç domain operasyonları** her iki motorun da görüş alanı dışında.

### Sorun 3: Vocabulary, Türkçe ad/scope karışıklığı

- `policy-engine/CasePolicyEngine` — "case'in policy'si"
- `icrabot/v28-engine/EngineRunnerService` — "v28 engine"
- `automation/workflow-engine.service.ts` — "workflow engine" (üçüncü)
- `interest-engine/` — "interest engine" (dördüncü)
- `claim-engine/` — "claim engine" (beşinci)
- `summary-engine/` — "summary engine" (altıncı)

`*-engine` patlaması var. Çoğu **engine** değil, sadece servis. Ad seçimleri yanlış sinyal veriyor.

---

## Konsolidasyon Kararı

### Karar 1: İki motor da kalır (silme yok)

**Gerekçe:** Roller farklı, paralel değil. Her ikisi de production path'te kullanılıyor (uyap, stage-trigger, automation, decorators). Silmek refactor değil, fonksiyon kaybı.

### Karar 2: İsimlendirme rasyonalize edilir

| Mevcut Ad | Önerilen Ad | Sebep |
|---|---|---|
| `policy-engine/CasePolicyEngine` | `policy-engine/PolicyGateService` (veya `LegalGateService`) | "Engine" değil "gate". Authorization/decision yapıyor. |
| `policy-engine/fact-store/FactStoreService` | `policy-engine/CachedFactReader` | Sadece read cache + scope. Yazma sorumluluğu v28'e devredilir. |
| `icrabot/v28-engine/EngineRunnerService` | `core-runtime/event-runtime/EventRuntimeService` | Generic legal kernel runtime, UYAP-specific değil. |
| `icrabot/v28-engine/FactStoreService` | `core-runtime/fact-store/FactStoreService` | Tek "FactStore" kalır, tüm yazmalar buradan. |
| `icrabot/v28-engine/UyapEventIngestService` | `core-runtime/event-ingest/UyapAdapter` | Adapter pattern: UYAP event'leri DomainEvent'e çevirir. |
| `automation/workflow-engine.service` | `automation/automation-orchestrator.service` | "Engine" değil orchestrator. v28-engine ile karışmaz. |

İsim değişiklikleri **vocabulary unification** spec'iyle birlikte yapılır.

### Karar 3: Veri katmanı tek kaynağa indirilir

- `IcrabotCaseFact` / `IcrabotCaseFlag` / `IcrabotFactAudit` ortak fact store olarak **canonical** kabul edilir.
- `policy-engine/FactStoreService.writeFact*` metodları `core-runtime/FactStoreService`'e delege eder (yazma tek noktadan).
- `policy-engine/FactStoreService.getFacts*` cache + scope chain özellikleriyle **read API** olarak kalır.

Yani:
- **Yazma:** v28 yolu (audit + idempotency + outbox tetikleme dahil)
- **Cache'li okuma + scope:** policy-engine yolu

### Karar 4: Domain → Event Bridge

`case.service`, `collection.service`, `payment-instruction.service` gibi domain command'ları transaction sonunda **DomainEvent** üretmeli. Bu event:
- v28 (yeni adıyla `EventRuntimeService`) ingestion'una gider → fact write + rule eval + outbox
- policy-engine'in `onActionExecuted` API'si çağrılır → decision log

Yeni servis: `core-runtime/event-ingest/DomainEventIngestService` — `UyapAdapter`'in iç domain analoğu.

```
case.service.create(dto)
  ├─ tx.case.create(...)
  ├─ tx.client.create(...)  
  ├─ ...transaction işleri...
  └─ AFTER COMMIT:
       domainEventIngest.emit({
         type: 'CASE_OPENED',
         caseId,
         payload: {...},
         actor: {...}
       })
       → EventRuntime.runRulesForEvent(caseId, event, rules)
         → fact write
         → outbox actions (if any)
         → timeline entry
```

Bu **mevcut altyapıya tek bir küçük servis ekleme**. Rewrite yok, formalize.

### Karar 5: "Engine" patlamasını yavaşça temizle

`*-engine` ile biten 6 modülden sadece **3 tanesi** gerçek engine:
- `interest-engine` (calculator engine — gerçek)
- `core-runtime/event-runtime` (yeni adıyla — gerçek)
- `policy-engine` → `policy-gate` (rename — gerçek değil, gate)

Diğerleri (`claim-engine`, `summary-engine`, `automation/workflow-engine`) zamanla service'e dönüşür.

---

## Mimari Diyagram (final)

```
═══════════════════════════════════════════════════════════════════
LAYER A: DOMAIN VOCABULARY
═══════════════════════════════════════════════════════════════════
  packages/@hukuk/domain
    enums, value objects (Money, LegalDate), branded IDs
    EVENT TAXONOMY (canonical)

═══════════════════════════════════════════════════════════════════
LAYER B: DOMAIN COMMANDS
═══════════════════════════════════════════════════════════════════
  apps/api/src/modules/case/case.service          (CRUD + emit event)
  apps/api/src/modules/collection/...              (CRUD + emit event)
  apps/api/src/modules/payment-instruction/...     (CRUD + emit event)
  
  Each command:
    1. Validate
    2. Pre-check via PolicyGate.canPerformAction(actionCode)
    3. Execute transaction
    4. AFTER COMMIT: DomainEventIngest.emit(event)
    5. AFTER COMMIT: PolicyGate.onActionExecuted(actionCode, result)

═══════════════════════════════════════════════════════════════════
LAYER C: POLICY GATE (sync, pre-action)
═══════════════════════════════════════════════════════════════════
  policy-gate/PolicyGateService           [renamed from CasePolicyEngine]
    - state machine
    - action matrix
    - gate checker
    - decision log writer
  
  API: canPerformAction(action) → ALLOW | DENY + reason

═══════════════════════════════════════════════════════════════════
LAYER D: EVENT RUNTIME (async, post-action)
═══════════════════════════════════════════════════════════════════
  core-runtime/event-runtime/EventRuntimeService   [renamed from EngineRunnerService]
    - rule loader (YAML)
    - expression evaluator
    - compute registry
    - timeline writer
    - outbox dispatcher
  
  Adapters:
    core-runtime/event-ingest/UyapAdapter           [from UyapEventIngestService]
    core-runtime/event-ingest/DomainEventIngest     [NEW — small addition]
  
  Pipeline:
    DomainEvent → fact write → rule eval → outbox actions → timeline

═══════════════════════════════════════════════════════════════════
LAYER E: SHARED DATA / FACT STORE
═══════════════════════════════════════════════════════════════════
  core-runtime/fact-store/FactStoreService         [canonical, write-side]
    - IcrabotCaseFact / IcrabotCaseFlag / IcrabotFactAudit
    - audit trail per write
    - idempotent
  
  policy-gate/CachedFactReader                     [renamed from policy-engine/FactStoreService]
    - in-memory cache (read-side)
    - scope chain support
    - delegates writes to FactStoreService

═══════════════════════════════════════════════════════════════════
LAYER F: DETERMINISTIC CALCULATORS
═══════════════════════════════════════════════════════════════════
  interest-engine/InterestEngineService            [partial pure — formalize]
    - Will be split:
      * computeBalance() — pure
      * writeAudit() — side effect
    - asOf + interpretationProfileId required
    - hardcoded rate fallbacks removed

═══════════════════════════════════════════════════════════════════
LAYER G: RUNTIME LAB (non-domain)
═══════════════════════════════════════════════════════════════════
  runtime-lab/  (renamed/reclassified calc-preview parts)
    drift-guard/
    adaptive-control/
    chaos-harness/
    synthetic-load/
    
  core-runtime/  (kept legal-grade parts)
    audit-trail/
    evidence-bundle/
    hash-determinism/
    fact-store/
    event-runtime/
    event-ingest/
```

---

## Yeni Sıralama (revize)

1. **`00-architecture.md` revizyonu** — "rewrite → formalize" dili. ~30 dk
2. **`01-stabilization-pre-kernel.md` → `01-stabilization-status.md`** — historical record. ~15 dk
3. **`03-vocabulary-unification.md` revizyonu** — backend çakışmaları eklenir (FactStoreService dual, CaseType triple, vs.). ~30 dk
4. **Aggregate Boundaries** belgesi — Case = aggregate root, debtor sub-entity (mevcut yapıya dayanır)
5. **Event Taxonomy v1** — ama **mevcut v28-engine taxonomy'sini envanterleyerek** (PAYMENT_RECEIVED, OBJECTION_FILED, HACIZ_PLACED, ASSET_FOUND_*, TEBLIGAT_*, SALE_*, CASE_STATUS — zaten yazılmış!). Eksikleri ekle.
6. **Domain Event Bridge spec** — `case.service` event emission disiplini
7. Implementasyon

Vocabulary 5 belge yerine 3 (zaten var olanı belge haline getirme + ekleme + birleştirme).

---

## Ana cümle değişti

**Önceden:** "Money Truth Kernel'i sıfırdan inşa et."  
**Şimdi:** "Mevcut event-sourced runtime'ı (v28-engine) ve mevcut policy gate'i (CasePolicyEngine) **canonical legal kernel** olarak formalize et, isimlendir, domain command'larını bu altyapıya bağla."

---

## Onay isteyen sorular

> **Decision Status:** Accepted  
> **Accepted On:** 2026-05-19  
> **Supersedes:** none  
> **Superseded By:** —

### Onaylanan Kararlar (özet)

1. ✅ İki motor kalır (rol ayrımı: gate vs runtime)
2. ✅ İsim değişiklikleri uygulanır:
   - `CasePolicyEngine` → `PolicyGateService`
   - `EngineRunnerService` → `EventRuntimeService`
   - `policy-engine/FactStoreService` → `CachedFactReader`
   - `icrabot/v28-engine/FactStoreService` → `core-runtime/fact-store/FactStoreService` (canonical)
   - `UyapEventIngestService` → `UyapAdapter` + yeni `DomainEventIngestService`
   - `interest-strategy.config.CaseType` → `LegalCaseProfile`
3. ✅ Veri katmanı tek kaynağa indirilir (yazma v28 yolu, okuma cache'li policy yolu)
4. ✅ Domain → Event Bridge yeni servis olarak eklenir (`DomainEventIngestService`)
5. ✅ Rename strategy: deprecation period (b — alias 4 hafta, sunset, 6 hafta sonra removal)

### Anayasal cümle (bu belgeden çıktı)

> **Policy karar verir, runtime kayıt altına alır.**

### İlgili ADR'lar

- ADR-0001: Formalize vs Rewrite
- ADR-0002: Policy vs Runtime Split
- ADR-0004: Deprecation Strategy
