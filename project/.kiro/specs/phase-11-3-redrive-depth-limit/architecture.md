# Phase 11.3 — Redrive Chain Depth Limit: Mimari Diyagram

## Bileşen Akışı

```
┌─────────────────────────────────────────────────────────────────────┐
│                    POST /admin/manifest/dlq/{dlqId}/redrive        │
│                         ManifestAdminController                     │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐   │
│  │ 1. getById   │──▶│ 2. resolveCarrier │──▶│ 3. enforceDepth   │   │
│  │   (DLQ Repo) │   │   (Phase 11.2)    │   │   ★ Phase 11.3    │   │
│  └──────────────┘   └──────────────────┘   └────────┬──────────┘   │
│                                                      │              │
│                                              ┌───────▼────────┐    │
│                                              │  FAIL-CLOSED   │    │
│                                              │  try/catch     │    │
│                                              │  (Controller)  │    │
│                                              └───────┬────────┘    │
│                                                      │              │
│                          ┌───────────────────────────┼──────┐      │
│                          │ allowed?                   │      │      │
│                          │                            │      │      │
│                     ┌────▼────┐              ┌────────▼──┐   │      │
│                     │  YES    │              │    NO     │   │      │
│                     └────┬────┘              └────┬──────┘   │      │
│                          │                        │          │      │
│  ┌──────────────┐   ┌────▼────────┐    ┌─────────▼───────┐  │      │
│  │ 4. cloneFor  │◀──│ Continue    │    │ 409 Conflict    │  │      │
│  │   Redrive    │   │ redrive    │    │ + Audit log     │  │      │
│  └──────┬───────┘   └────────────┘    │ + Metric        │  │      │
│         │                              └─────────────────┘  │      │
│  ┌──────▼───────┐                                           │      │
│  │ 5. enforce   │                                           │      │
│  │   SizeLimit  │                                           │      │
│  └──────┬───────┘                                           │      │
│         │                                                   │      │
│  ┌──────▼───────┐                                           │      │
│  │ 6. atomic    │                                           │      │
│  │   Redrive    │                                           │      │
│  └──────────────┘                                           │      │
│                                                             │      │
└─────────────────────────────────────────────────────────────┘      │
                                                                      │
                                                                      │
┌─────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────┐
│                    enforceRedriveDepthLimit()                        │
│                    redrive-depth-enforcer.ts                         │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Step 1: POISON latch check (early exit)                    │     │
│  │                                                            │     │
│  │   dlqEntry.isPoison === true?                              │     │
│  │     ├─ YES → return { allowed: false, reason: POISON_ENTRY}│     │
│  │     │        + metric: POISON_ENTRY                        │     │
│  │     │        ⚡ Calculator NEVER called                     │     │
│  │     └─ NO  → continue to Step 2                            │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Step 2: Calculate depth                                    │     │
│  │                                                            │     │
│  │   calculateRedriveDepth(carrier, dlqRepo, maxDepth + 1)    │     │
│  │     → DepthCalculationResult { depth, chainBroken,         │     │
│  │                                cycleDetected, traversalMs } │     │
│  │                                                            │     │
│  │   + histogram: carrier_redrive_depth_total                 │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Step 3: Limit decision                                     │     │
│  │                                                            │     │
│  │   depth >= MAX_REDRIVE_DEPTH (3)?                          │     │
│  │     ├─ YES → markAsPoison(dlqId, reason)                   │     │
│  │     │        + metric: DEPTH_EXCEEDED                      │     │
│  │     │        return { allowed: false, DEPTH_EXCEEDED }     │     │
│  │     └─ NO  → return { allowed: true, currentDepth }        │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ⚠️  NOT: Enforcer kendi içinde try/catch YOKTUR.                   │
│      Fail-closed garantisi CONTROLLER katmanındadır.                │
│      DB hatası → exception propagate → controller catch →           │
│      500 DEPTH_CHECK_FAILED                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    calculateRedriveDepth()                           │
│                    redrive-depth-calculator.ts                       │
│                                                                     │
│  Input: carrier (V2), dlqRepo, maxTraversal (default: 4)            │
│                                                                     │
│  Algorithm:                                                         │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  currentParentId = carrier.parentCorrelationId              │    │
│  │  visited = Set<string>()                                    │    │
│  │  depth = 0                                                  │    │
│  │                                                             │    │
│  │  while (currentParentId && depth < maxTraversal):           │    │
│  │    ├─ visited.has(parentId)? → cycleDetected=true, BREAK    │    │
│  │    ├─ visited.add(parentId)                                 │    │
│  │    ├─ dlqRepo.findByCorrelationId(parentId)                 │    │
│  │    │   ├─ null / no carrierJson → chainBroken=true, BREAK   │    │
│  │    │   └─ found → JSON.parse(carrierJson)                   │    │
│  │    │       ├─ parse fail → chainBroken=true, BREAK          │    │
│  │    │       └─ OK → depth++, parentId = parent.parentCorrId  │    │
│  │    └─ loop                                                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Guarantees (PBT ile kanıtlanmış):                                  │
│    P1a: Her input sonlanır (termination)                            │
│    P1b: depth <= maxTraversal (bounded work)                        │
│    P1c: Döngüler tespit edilir (cycle detection)                    │
│    P1d: Zincir uzatma depth azaltmaz (monotonic)                    │
│    P1e: Temiz zincir → exact depth (accuracy)                       │
│    P1f: Kırık zincir → chainBroken=true (broken chain)              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    DLQ Repository Extensions                         │
│                    manifest-dlq.repository.ts                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ markAsPoison(dlqId, { reason })                             │    │
│  │   UPDATE manifest_dead_letter_queue                         │    │
│  │   SET is_poison = true, poison_reason = $reason             │    │
│  │   WHERE id = $dlqId                                         │    │
│  │                                                             │    │
│  │   ✓ Atomik (tek SQL statement)                              │    │
│  │   ✓ Latched (true → true, asla false'a dönmez)             │    │
│  │   ✓ Write-once contract (NNI-3) korunur                     │    │
│  │     (carrier kolonlarına DOKUNMAZ)                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ findByCorrelationId(correlationId)                          │    │
│  │   SELECT * FROM manifest_dead_letter_queue                  │    │
│  │   WHERE carrier_json IS NOT NULL                            │    │
│  │     AND carrier_json::jsonb->>'requestId' = $1              │    │
│  │   LIMIT 1                                                   │    │
│  │                                                             │    │
│  │   ✓ NULL carrier_json otomatik atlanır                      │    │
│  │   ✓ PostgreSQL JSONB operatörü ile index-friendly           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ query({ isPoison?: boolean })                               │    │
│  │   WHERE is_poison = $isPoison (opsiyonel filtre)            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘


## Fail-Closed Garanti Katmanları

```
Katman 1: Controller try/catch (★ ASIL GARANTİ)
├── enforceRedriveDepthLimit() çağrısı try bloğunda
├── ConflictException → re-throw (409)
├── Diğer tüm hatalar → 500 DEPTH_CHECK_FAILED
├── redriveRejectedMetric.inc({ reason: 'DEPTH_CHECK_FAILED' })
└── Sonuç: DB hatası, parse hatası, timeout → HEPSİ reject

Katman 2: Enforcer logic
├── isPoison check → immediate reject (no DB call)
├── depth >= MAX → markAsPoison + reject
├── depth < MAX → allow
└── ⚠️ Enforcer kendi içinde catch YOKTUR
    (hata controller'a propagate olur)

Katman 3: Calculator bounded traversal
├── maxTraversal sınırı → sonsuz döngü imkansız
├── visited Set → cycle detection
├── NULL/parse fail → chainBroken, traversal durur
└── Sonuç: Calculator her zaman sonlanır (P1a)
```

## POISON Latch Semantiği

```
                    ┌──────────────┐
                    │  is_poison   │
                    │  = false     │
                    └──────┬───────┘
                           │
                    depth >= MAX_REDRIVE_DEPTH
                           │
                    ┌──────▼───────┐
                    │  is_poison   │
                    │  = true      │◀──── GERİ DÖNÜŞSÜZ
                    │  (LATCHED)   │      markAsPoison() tekrar
                    └──────────────┘      çağrılsa bile true kalır
                           │
                    Her sonraki redrive talebi:
                    enforcer Step 1'de yakalanır
                    → POISON_ENTRY (calculator çağrılmaz)
```

## Metrik Topolojisi

```
carrier_redrive_depth_total (Histogram)
├── Buckets: [0, 1, 2, 3, 4, 5]
├── Emit: enforcer Step 2 sonrası
└── Kullanım: depth dağılımı izleme, alert threshold

carrier_redrive_rejected_total (Counter)
├── reason=DEPTH_EXCEEDED    → enforcer Step 3 (limit aşıldı)
├── reason=POISON_ENTRY      → enforcer Step 1 (zaten poison)
├── reason=DEPTH_CHECK_FAILED → controller catch (DB hatası)
├── reason=SIZE              → size limiter (mevcut)
├── reason=UPGRADE_FAILED    → carrier clone (mevcut)
└── reason=NOT_FOUND         → DLQ entry bulunamadı (mevcut)
```

## Phase 11.4 Entegrasyon Slotu

```
Controller redrive flow:
  1. getById(dlqId)              — mevcut
  2. resolveCarrierForRedrive    — Phase 11.2
  3. enforceRedriveDepthLimit    — Phase 11.3 ★
  4. ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  — Phase 11.4 SLOT ◄──
  │  enforceRedriveRateLimit?    │   (rate limit / backoff)
  │  cooldown check?             │
  └┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┘
  5. cloneCarrierForRedrive      — Phase 10.5
  6. enforceCarrierSizeLimit     — Phase 10.5
  7. atomicRedrive               — Phase 10.2
```

## Veri Akışı (Redrive Chain Örneği)

```
Original Job (depth=0)
  │ fail → DLQ
  ▼
DLQ Entry 1 [requestId=aaa, parent=∅]
  │ redrive (depth check: 0 < 3 ✓)
  ▼
Redriven Job 1 [parentCorrelationId=aaa]
  │ fail → DLQ
  ▼
DLQ Entry 2 [requestId=bbb, parent=aaa]
  │ redrive (depth check: 1 < 3 ✓)
  ▼
Redriven Job 2 [parentCorrelationId=bbb]
  │ fail → DLQ
  ▼
DLQ Entry 3 [requestId=ccc, parent=bbb]
  │ redrive (depth check: 2 < 3 ✓)
  ▼
Redriven Job 3 [parentCorrelationId=ccc]
  │ fail → DLQ
  ▼
DLQ Entry 4 [requestId=ddd, parent=ccc]
  │ redrive attempt (depth check: 3 >= 3 ✗)
  ▼
☠️ POISON [is_poison=true, reason=REDRIVE_DEPTH_EXCEEDED: depth=3, maxDepth=3]
  │ tüm sonraki redrive talepleri
  ▼
409 Conflict { code: 'POISON_ENTRY' }
```
