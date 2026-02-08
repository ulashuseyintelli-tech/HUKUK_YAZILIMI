# Phase 11.1 — Worker Inbound Degraded Mode: Requirements

**Status:** LOCKED  
**Created:** 2026-02-06  
**Depends On:** Phase 10.5 (LOCKED)

---

## Overview

Worker inbound boundary'de gelen carrier context doğrulanır.
Hatalı/uyumsuz/oversize carrier → degraded mode → job çalışmaya devam eder.

**Temel Garanti:** Job ASLA carrier sorunları nedeniyle fail olmaz.

---

## Functional Requirements

### FR-11.1.1: Carrier Validation at Worker Boundary

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.1.1.1 | Worker inbound'da carrier `validateInboundCarrier()` ile doğrulanmalı | P2 |
| FR-11.1.1.2 | Validation, parse öncesi byte-level size check yapmalı (CPU/DoS guard) | P2 |
| FR-11.1.1.3 | Validation sonucu `InboundValidationResult` tipinde dönmeli | P2 |

### FR-11.1.2: Degraded Mode Behavior

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.1.2.1 | Invalid carrier job failure'a SEBEP OLMAMALI | P2 |
| FR-11.1.2.2 | Invalid carrier → warn log + metric emit | P2 |
| FR-11.1.2.3 | Invalid carrier → ALS/idempotency context DEVRE DIŞI | P2 |
| FR-11.1.2.4 | Job degraded correlation ile çalışmaya devam etmeli | P2 |
| FR-11.1.2.5 | Degraded mode'da minimal context üretilmeli (safe subset) | P2 |

### FR-11.1.3: Carrier Input Classification

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.1.3.1 | VALID_V2: version=2, schema OK → ACCEPT, FULL context | P2 |
| FR-11.1.3.2 | VALID_V1: version=1, schema OK → ACCEPT (upgrade to V2), FULL context | P2 |
| FR-11.1.3.3 | VERSION_MISMATCH: version not in {1,2} → DROP_AND_MINIMAL | P2 |
| FR-11.1.3.4 | MALFORMED: null/undefined/non-object/JSON parse fail → DROP_AND_MINIMAL | P2 |
| FR-11.1.3.5 | TYPE_ERROR: field type mismatch → DROP_AND_MINIMAL | P2 |
| FR-11.1.3.6 | MISSING_REQUIRED: required field missing → DROP_AND_MINIMAL | P2 |
| FR-11.1.3.7 | OVERSIZE: byte size > MAX_CARRIER_BYTES → DROP_AND_MINIMAL, parse attempt yok | P2 |
| FR-11.1.3.8 | UPGRADE_FAILED: V1→V2 upgrade exception → DROP_AND_MINIMAL | P2 |

### FR-11.1.4: Minimal Context

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.1.4.1 | Minimal context şu alanları İÇERMELİ: carrierVersion, actionId, requestId, dropReason, receivedAt | P2 |
| FR-11.1.4.2 | Minimal context serbest-form nested payload İÇERMEMELİ | P2 |
| FR-11.1.4.3 | Minimal context user-provided large blob İÇERMEMELİ | P2 |

### FR-11.1.5: Audit Event Extension

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.1.5.1 | Audit event `degradedContext` alanı İÇERMELİ (degraded mode'da) | P2 |
| FR-11.1.5.2 | `degradedContext.reason` FIXED ENUM değerlerinden biri olmalı | P2 |
| FR-11.1.5.3 | `degradedContext.carrierSnapshot` max 500 char, sanitized olmalı | P2 |
| FR-11.1.5.4 | carrierSnapshot serialization hatası audit emission'ı BLOKLAMAMALI | P2 |

### FR-11.1.6: Metrics

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.1.6.1 | Counter: `carrier_inbound_total{outcome, reason}` | P2 |
| FR-11.1.6.2 | outcome label: "accepted" \| "degraded" | P2 |
| FR-11.1.6.3 | reason label: CarrierDropReason enum (FIXED) | P2 |
| FR-11.1.6.4 | Sampling yok; düşük cardinality | P2 |

---

## Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-11.1.1 | Validation overhead per job | < 1ms |
| NFR-11.1.2 | Oversize check (byte-level) | O(1) — no parse |
| NFR-11.1.3 | Zero job failures from carrier issues | 100% |

---

## Hard Limits (Policy Constants)

| Constant | Value | Rationale |
|----------|-------|-----------|
| MAX_CARRIER_BYTES | 4096 (4KB) | Mevcut `MAX_CARRIER_SIZE_BYTES` ile uyumlu |
| MAX_CARRIER_SNAPSHOT_CHARS | 500 | Audit event boyut kontrolü |
| OVERSIZE byte check | Pre-parse | CPU/DoS guard |

---

## Invariants

1. `outcome === 'accepted'` ⇒ carrier FULL context ile ALS'e yazılır
2. `outcome === 'degraded'` ⇒ carrier MINIMAL context ile ALS'e yazılır VEYA ALS devre dışı
3. `outcome === 'degraded'` ⇒ `degradedContext` audit event'te mevcut
4. OVERSIZE carrier → JSON.parse ÇAĞRILMAZ (byte check pre-parse, spy ile test kanıtı ZORUNLU)
5. Job completion (success/failure) carrier validation sonucundan BAĞIMSIZ
6. `mode === 'FULL'` ⇒ `reason` alanı YOKTUR (undefined)
7. `mode === 'MINIMAL'` ⇒ `reason` alanı ZORUNLUDUR
8. Truncated inbound carrier (valid V2, kısa failureHistory) → ACCEPT as FULL (truncation ≠ invalid)
9. `normalizeInboundCarrier()` consumer path'lerinde ÇAĞRILMAMALI (grep ile doğrulanır)

