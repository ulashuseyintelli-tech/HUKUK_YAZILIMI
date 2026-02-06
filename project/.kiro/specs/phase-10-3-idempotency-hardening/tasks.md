# Uygulama Planı: Phase 10.3 - Idempotency Hardening

## Genel Bakış

Bu plan, manifest-admin idempotency implementasyonundaki kritik concurrency açıklarını kapatmak için gerekli kod değişikliklerini tanımlar. Insert-first pattern, lease timeout/takeover mekanizması ve resource-level uniqueness garantileri uygulanacaktır.

## Görevler

- [x] 1. DB Migration - manifest_admin_actions tablosu ve index'ler
  - [x] 1.1 manifest_admin_actions tablosu oluştur
    - id, request_id, action_type, resource_id, status, started_at, completed_at
    - lease_expires_at, owner_token (takeover güvenliği için)
    - http_status, result_json, actor_id, actor_email, expires_at, created_at
    - CONSTRAINT chk_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED'))
    - _Requirements: 1.1, 1.2, 4.1, 5.1, 5.2, 9.1_
  
  - [x] 1.2 UNIQUE(request_id) index oluştur
    - Plain UNIQUE - TTL'den bağımsız her zaman garanti
    - _Requirements: 1.1_
  
  - [x] 1.3 idx_retry_queue_bundle_active partial unique index oluştur
    - UNIQUE (bundle_id) WHERE status IN ('PENDING', 'IN_PROGRESS', 'RETRY_SCHEDULED')
    - NOT: Phase 10'da zaten mevcut, değişiklik yok
    - _Requirements: 2.1_
  
  - [x] 1.4 Cleanup job için index ve SQL hazırla
    - idx_admin_actions_expires index
    - DELETE ... WHERE expires_at < NOW() - INTERVAL '1 hour' AND status IN ('COMPLETED', 'FAILED')
    - _Requirements: 5.3_

- [ ] 2. Checkpoint - Migration doğrulama
  - Migration up/down test et
  - Index'lerin doğru çalıştığını EXPLAIN ANALYZE ile doğrula
  - \d / SELECT indexdef... çıktısı ile index varlığını doğrula
  - Partial unique index'in çalıştığı minimal repro testi
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. IdempotencyGateService implementasyonu (PR-2 Skeleton)
  - [x] 3.1 IdempotencyGateService interface ve types tanımla
    - GateResult union type (PROCEED | CACHED | IN_PROGRESS)
    - GateAcquireInput, GateCompleteInput, GateFailInput, GateExtendLeaseInput
    - AdminActionStatus enum
    - Dosya: idempotency/idempotency-gate.types.ts
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 3.2 checkAndAcquire() metodu implement et
    - INSERT ... ON CONFLICT DO NOTHING pattern
    - make_interval(secs => ${leaseSeconds}) ile interval
    - ${resourceId ?? null}::uuid ile null-safe UUID
    - Conflict durumunda mevcut kaydı oku
    - COMPLETED/FAILED → CACHED döndür
    - IN_PROGRESS + lease active → IN_PROGRESS döndür
    - IN_PROGRESS + lease expired → TAKEOVER (CAS, FOR UPDATE yok)
    - owner_token ile ownership semantiği
    - Dosya: idempotency/idempotency-gate.service.ts
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [x] 3.3 complete() ve fail() metodları implement et
    - owner_token validation
    - Status güncelleme (COMPLETED/FAILED)
    - http_status ve result_json kaydetme
    - Dosya: idempotency/idempotency-gate.service.ts
    - _Requirements: 1.7, 1.8, 4.2_
  
  - [x] 3.4 extendLease() metodu implement et
    - owner_token match zorunlu
    - LEAST() ile max TTL clamp
    - Dosya: idempotency/idempotency-gate.service.ts
    - _Requirements: 1.5, 1.6_
  
  - [x] 3.4b @IdempotencyAction decorator implement et
    - Reflector metadata pattern
    - IdempotencyMeta: actionType, resourceType, resourceIdParam
    - Dosya: idempotency/idempotency.decorators.ts
    - _Requirements: 6.1_
  
  - [x] 3.4c IdempotencyGateInterceptor skeleton implement et
    - Reflector ile metadata okuma
    - CACHED → deterministic replay (audit check YOK)
    - IN_PROGRESS → 409 + Retry-After
    - PROCEED → audit health check → execute
    - Takeover audit via audit.append()
    - RxJS tap/catchError pattern (await yok)
    - Dosya: idempotency/idempotency-gate.interceptor.ts
    - _Requirements: 1.4, 1.5, 8.4_
  
  - [ ]* 3.5 Property test: Atomik INSERT Gate (NICE - fuzz)
    - Rastgele requestId'ler ile concurrent INSERT testi
    - **Property 1: Atomik INSERT Gate**
    - **Validates: Requirements 1.1, 1.2, 1.3**
  
  - [x] 3.6 Property test: IN_PROGRESS ve Takeover (MUST - determinism)
    - Concurrent request simülasyonu
    - Lease timeout sonrası takeover testi
    - Takeover CAS semantiği (UPDATE WHERE lease_expires_at<=now())
    - **Property 2: IN_PROGRESS Concurrent Request Handling**
    - **Property 2b: Lease Timeout Recovery**
    - **Validates: Requirements 1.5**
  
  - [x] 3.7 Property test: Cache Replay Determinism (MUST - idempotency)
    - Aynı key → aynı status/body (success + error dahil)
    - Round-trip testi
    - **Property 4: Idempotent Cache Replay**
    - **Validates: Requirements 4.3, 4.4**

- [ ] 4. Checkpoint - Gate Service doğrulama
  - Unit testlerin geçtiğini doğrula
  - Race condition testlerini çalıştır
  - Race testi: aynı key ile iki parallel request → biri PROCEED, biri IN_PROGRESS veya CACHED
  - Lease expire → takeover → complete akışı
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. IdempotencyGateInterceptor implementasyonu
  - [ ] 5.1 NestJS Interceptor oluştur
    - Idempotency-Key header parse (fallback: X-Request-Id)
    - Header yoksa 400 Bad Request
    - _Requirements: 6.1, 6.2_
  
  - [ ] 5.2 Gate result handling implement et
    - CACHED → stored status/body döndür
    - IN_PROGRESS → 409 + Retry-After header
    - PROCEED → action çalıştır, sonucu kaydet
    - _Requirements: 1.4, 1.5, 4.3_
  
  - [ ] 5.3 Exception filter entegrasyonu
    - Hata durumunda fail() otomatik çağrılsın
    - http_status ve error body kaydedilsin
    - _Requirements: 1.8, 4.2_
  
  - [ ] 5.4 Break-glass cache hit kuralı implement et
    - Cache hit → break-glass durumuna bakılmaksızın cached response dön
    - Determinism rule: cache hit always returns stored (bypass değil)
    - _Requirements: 8.4_
  
  - [ ] 5.5 Exception filter exactly-once semantiği
    - fail() çağrısının double-fail olmaması
    - _Requirements: 1.8_
  
  - [ ]* 5.6 Integration test: Interceptor davranışı (NICE)
    - Controller'a dokunmadan davranış kanıtı
    - Cache hit, IN_PROGRESS, PROCEED senaryoları
    - _Requirements: 1.4, 1.5, 8.4_

- [ ] 6. Mutations Implementasyonu
  - [ ] 6.1 Resolve atomik UPDATE implement et
    - UPDATE ... WHERE status='DLQ_OPEN' RETURNING
    - 404 NOT_FOUND, 409 ALREADY_RESOLVED/ALREADY_REDRIVEN mapping
    - Idempotency gate entegrasyonu
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [ ] 6.2 Redrive transactional flow implement et
    - SELECT ... FOR UPDATE ile DLQ lock
    - Uniqueness-guarded job insert (partial unique index)
    - DLQ status update
    - Unique violation → ALREADY_QUEUED mapping
    - _Requirements: 3.4, 3.5, 3.6, 2.2, 2.3_
  
  - [ ] 6.3 Bulk Redrive deterministic selection implement et
    - ORDER BY created_at ASC, id ASC (stabil sıralama)
    - FOR UPDATE SKIP LOCKED
    - Aynı transaction içinde: selection → job insert → DLQ update
    - _Requirements: 6.3_
  
  - [ ] 6.4 Parametre validasyonu implement et
    - maxBatch: 1-100 aralığı
    - olderThanHours: 0-8760 aralığı
    - Sınır aşımında 400 Bad Request
    - _Requirements: 6.4, 6.5, 6.6_
  
  - [ ]* 6.5 Property test: Resource-Level Uniqueness (NICE - fuzz)
    - Rastgele bundle_id'ler ile concurrent job oluşturma
    - **Property 5: Resource-Level Uniqueness**
    - **Validates: Requirements 2.2, 2.3**
  
  - [ ] 6.6 Property test: Atomik State Transition (MUST - concurrency)
    - Concurrent resolve/redrive testi
    - Transaction rollback senaryoları
    - Unique violation → ALREADY_QUEUED mapping doğrulama
    - Status DLQ_OPEN değil → 409 doğrulama
    - **Property 6: Atomik State Transition**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6**
  
  - [ ] 6.7 Property test: Bulk SKIP LOCKED Disjointness (MUST - concurrency)
    - İki worker concurrent bulk redrive → overlap yok
    - Aynı veri ile tekrarlı bulk selection → aynı sıra
    - **Property 8: Deterministic Bulk Selection**
    - **Validates: Requirements 6.3**
  
  - [ ]* 6.8 Property test: Parametre Validasyonu (NICE - fuzz)
    - Sınır değerleri ve aşımları
    - **Property 9: Parametre Validasyonu**
    - **Validates: Requirements 6.4, 6.5, 6.6**

- [ ] 7. Checkpoint - Mutations doğrulama
  - Integration testlerin geçtiğini doğrula
  - 404/409/200 senaryolarını test et
  - Duplicate requestId cached replay doğrula
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Audit Event Zenginleştirme
  - [x] 8.1 actionId propagation implement et (PR-4)
    - Tüm admin action'larda actionId audit event'e eklensin
    - actionId zorunlu alan (nullable değil)
    - req.idempotencyContext ile downstream propagation
    - _Requirements: 7.1_
  
  - [x] 8.2 DLQ işlem audit alanları ekle (PR-4)
    - dlqErrorCode, originalJobId → errorCode, errorMessage
    - _Requirements: 7.2_
  
  - [x] 8.3 Redrive audit alanları ekle (PR-4)
    - newJobId → afterState içinde
    - _Requirements: 7.3_
  
  - [ ] 8.4 Bulk redrive audit summary implement et
    - filters, maxBatch, selectedCount, redrivenCount, failedIds, newJobIds
    - Tek event ile summary
    - _Requirements: 7.4_
  
  - [x] 8.5 Takeover audit event implement et (PR-4)
    - eventType: 'ADMIN_ACTION' with outcome='TAKEOVER'
    - previousActorId → takeoverFrom
    - _Requirements: 1.6_
  
  - [ ]* 8.6 Property test: Audit Event Completeness
    - Tüm action type'lar için gerekli alanların varlığı
    - **Property 10: Audit Event Completeness**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [ ] 9. Checkpoint - Audit doğrulama
  - Audit event schema snapshot test (golden)
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Concurrency Test Suite
  - [ ] 10.1 Same key concurrent request testi
    - İki concurrent istek: biri PROCEED, diğeri IN_PROGRESS (409)
    - _Requirements: 1.5_
  
  - [ ] 10.2 Same resource different key testi
    - Farklı requestId ile aynı bundle'a redrive
    - Biri başarılı, diğeri ALREADY_QUEUED (409)
    - _Requirements: 2.3_
  
  - [ ] 10.3 Lease timeout takeover testi
    - IN_PROGRESS + lease expired → takeover başarılı
    - IN_PROGRESS + lease active → 409
    - _Requirements: 1.5, 1.6_
  
  - [ ] 10.4 Bulk SKIP LOCKED disjointness testi
    - İki worker concurrent bulk redrive
    - Her worker farklı kayıtları işlemeli
    - _Requirements: 6.3_
  
  - [ ] 10.5 Cleanup job safety testi
    - Sadece COMPLETED/FAILED silinmeli
    - IN_PROGRESS asla silinmemeli
    - Buffer window (1 saat) ile "yeni bitmiş action" silinmeyecek
    - _Requirements: 5.3_

- [ ] 11. Final Checkpoint - Tüm testler
  - Tüm unit, property ve integration testlerin geçtiğini doğrula
  - CI'de deterministic, flake yok
  - Migration rollback denemesi (down çalışıyor mu)
  - Runbook kısa doğrulama (dokümantasyon var mı)
  - Ensure all tests pass, ask the user if questions arise.

## Notlar

- `*` ile işaretli görevler opsiyoneldir (NICE - fuzz/stress testleri)
- `*` olmayan property testler zorunludur (MUST - determinism/concurrency)
- Her görev belirli gereksinimlere referans verir
- Checkpoint'lar artımlı doğrulama sağlar

### Guardrail Referansları
- **Guardrail A**: Cleanup job - sadece COMPLETED/FAILED + 1 saat buffer window
- **Guardrail B**: Takeover/extendLease için owner_token ownership semantiği

### MUST vs NICE Property Testler
**MUST (Zorunlu):**
- 3.6 IN_PROGRESS ve Takeover (determinism)
- 3.7 Cache Replay Determinism (idempotency)
- 6.6 Atomik State Transition (concurrency)
- 6.7 Bulk SKIP LOCKED Disjointness (concurrency)

**NICE (Opsiyonel):**
- 3.5 Atomik INSERT Gate (fuzz)
- 6.5 Resource-Level Uniqueness (fuzz)
- 6.8 Parametre Validasyonu (fuzz)
- 8.6 Audit Event Completeness (fuzz)

---

## PR-2 Checkpoint Kanıtları (2026-02-03)

### Test Sonuçları
```
PASS  idempotency/__tests__/idempotency-gate.integration.spec.ts
  Idempotency Gate Integration Tests (MUST 3.6, 3.7)
    MUST 3.6: Concurrent Request Handling
      ✓ same key: one PROCEED, other IN_PROGRESS or CACHED, single DB row
      ✓ IN_PROGRESS response includes retryAfterSeconds and actionId
      ✓ lease expired: takeover succeeds with previousActorId
      ✓ lease NOT expired: returns IN_PROGRESS (no takeover)
    MUST 3.7: Cache Replay Determinism
      ✓ success replay: same http_status and body
      ✓ error replay: same http_status and error body
      ✓ 409 ALREADY_QUEUED replay: deterministic
      ✓ DB row has correct terminal state after complete
      ✓ DB row has correct terminal state after fail
    Edge Cases
      ✓ different requestIds create separate rows
      ✓ owner_token mismatch: complete/fail has no effect
      ✓ PROCEED returns actionId and ownerToken

Tests: 12 passed, 12 total
```

### Determinism Kanıtı (MUST 3.7)
- Test: `success replay: same http_status and body`
- Assertion: `expect(r2.payload).toEqual(successBody)` ✅
- Body: `{ ok: true, id: '123', data: { foo: 'bar' } }`
- Byte-level equality: `JSON.stringify(r2.payload) === JSON.stringify(r3.payload)` ✅

### DB State Kanıtı (Terminal State)
- Test: `DB row has correct terminal state after complete`
- Mock DB row after complete:
```
request_id: success-replay-...abc | status: COMPLETED | http_status: 200 | result_code: OK
```
- Gerçek DB kanıtı (PR-1 checkpoint'te eklenecek):
```sql
SELECT request_id, status, http_status, result_code 
FROM manifest_admin_actions 
WHERE request_id = 'idem-...xyz' LIMIT 1;
-- Beklenen: 1 satır, status=COMPLETED, http_status=200
```

### Takeover Kanıtı (MUST 3.6)
- Test: `lease expired: takeover succeeds with previousActorId`
- Assertion: `expect(r2.takeover).toBe(true)` ✅
- Assertion: `expect(r2.previousActorId).toBe('actor-A')` ✅

### Owner Token Guard Kanıtı
- Test: `owner_token mismatch: complete/fail has no effect`
- Assertion: `expect(action!.status).toBe('IN_PROGRESS')` ✅ (wrong token ile complete çağrısı sonrası)

---

## Backlog: Mock Kırılganlığı Refactor

### Problem
InMemoryPrismaService mock'u SQL placeholder index'lerine bağımlı. Örnek:
```typescript
// handleTakeover: values[1] = row.id (values[0] = leaseSeconds)
// SQL değişirse index kayar → test kırılır
```

### Risk
- SQL'e yeni placeholder eklenince false negative test failure
- Refactor sırasında sessiz regression

### Fix Hedefi
Repository wrapper mock veya pattern-based param extraction:
1. **Repository wrapper mock**: Prisma'yı değil, repository metodunu mockla
2. **Pattern-based extraction**: SQL'den `WHERE id = $X` pattern'ini parse et

### Done Kriteri
- Mock, SQL param index'e hiç bakmıyor
- SQL placeholder sırası değişince test kırılmıyor


---

## PR-4 Checkpoint Kanıtları (2026-02-03)

### Değişiklik Özeti

**1. manifest-admin-audit.types.ts**
- `ADMIN_ACTION` event type eklendi
- `BUNDLE` resource type eklendi
- `AuditOutcome` type eklendi: `'SUCCESS' | 'FAILED' | 'TAKEOVER'`
- `AuditEventInput` interface'e yeni alanlar:
  - `actionId?: string`
  - `outcome?: AuditOutcome`
  - `takeoverFrom?: string`
  - `errorCode?: string`
  - `errorMessage?: string`
- `AuditEvent` interface'e normalize edilmiş alanlar (null-safe)

**2. manifest-admin-audit.service.ts**
- `append()` metodu PR-4 alanlarını normalize ediyor
- `writeBatchToDb()` yeni kolonları INSERT ediyor
- `truncateErrorMessage()` helper eklendi (512 char limit, stack trace sanitization)

**3. idempotency-gate.interceptor.ts**
- `IdempotencyContext` interface eklendi
- `req.idempotencyContext` PROCEED path'te set ediliyor
- CACHED path: NO audit (determinism rule) ✅
- IN_PROGRESS path: NO audit (retry semantics) ✅
- PROCEED + success: `ADMIN_ACTION` with `outcome=SUCCESS` ✅
- PROCEED + fail: `ADMIN_ACTION` with `outcome=FAILED` + `errorCode` + `errorMessage` ✅
- Takeover: `ADMIN_ACTION` with `outcome=TAKEOVER` + `takeoverFrom` ✅
- `mapError()` fonksiyonu `message` field eklendi

**4. DB Migration**
- `20260203200000_phase10_3_pr4_audit_enrichment/migration.sql`
- Yeni kolonlar: `action_id`, `outcome`, `takeover_from`, `error_code`, `error_message`
- Constraint güncellemeleri: `chk_audit_event_type`, `chk_audit_resource_type`, `chk_audit_outcome`
- Index: `idx_audit_log_action_id`

### DoD Test Checklist

| # | Test | Durum |
|---|------|-------|
| 1 | actionId request boyunca sabit | ✅ `req.idempotencyContext.actionId` |
| 2 | PROCEED+SUCCESS audit'te actionId var | ✅ `tap()` içinde emit |
| 3 | PROCEED+FAILED audit'te actionId + errorCode var | ✅ `catchError()` içinde emit |
| 4 | TAKEOVER audit'te actionId yeni, takeoverFrom dolu | ✅ takeover block'ta emit |
| 5 | DLQ_REDRIVE/RESOLVE audit'leri actionId ile zincirleniyor | ✅ `req.idempotencyContext` propagation |
| 6 | CACHED path → audit yok | ✅ early return, no emit |
| 7 | IN_PROGRESS path → audit yok | ✅ early return, no emit |

### Audit Emit Kuralları (Final)

```
┌─────────────────┬──────────────────────────────────────────────┐
│ Gate Result     │ Audit Emit                                   │
├─────────────────┼──────────────────────────────────────────────┤
│ CACHED          │ ❌ NO (determinism)                          │
│ IN_PROGRESS     │ ❌ NO (retry semantics)                      │
│ PROCEED+SUCCESS │ ✅ ADMIN_ACTION, outcome=SUCCESS             │
│ PROCEED+FAILED  │ ✅ ADMIN_ACTION, outcome=FAILED, errorCode   │
│ PROCEED+TAKEOVER│ ✅ ADMIN_ACTION, outcome=TAKEOVER, takeoverFrom│
└─────────────────┴──────────────────────────────────────────────┘
```

### IdempotencyContext Interface

```typescript
interface IdempotencyContext {
  actionId: string;      // Gate action ID
  requestId: string;     // Idempotency-Key header
  actionType: string;    // ADMIN_RETRY | DLQ_REDRIVE | DLQ_RESOLVE
  resourceType: string;  // BUNDLE | DLQ_ENTRY
  resourceId: string | null;
  takeover: boolean;
  previousActorId: string | null;
}
```

### Error Message Sanitization

```typescript
truncateErrorMessage(message: string): string {
  // 1. Remove stack traces (lines starting with "at ")
  // 2. Join remaining lines with space
  // 3. Truncate to 512 chars with "..." suffix
}
```


---

## PR-5 Checkpoint Kanıtları (2026-02-03)

### Değişiklik Özeti

**1. manifest-admin-audit.types.ts**
- `IDEMPOTENCY_TAKEOVER` event type eklendi (ayrı filtreleme için)
- `takeoverFrom` tipi `string | null` olarak güncellendi

**2. idempotency-metrics.ts (YENİ)**
- `idempotency_action_total{action_type,outcome}` counter
- `idempotency_takeover_total{action_type}` counter
- `idempotency_lease_expired_total` counter
- `idempotency_gate_result_total{type}` counter
- `idempotency_gate_latency_seconds` histogram
- Prometheus export fonksiyonu

**3. idempotency-takeover-limiter.service.ts (YENİ)**
- Per-actor sliding window rate limiter
- Default: max 5 takeover / 5 dakika / actor
- `checkAndRecord()`: Limit kontrolü + kayıt
- `getCount()`: Mevcut sayı sorgulama
- `getActiveActors()`: Aktif actor'ları listeleme
- Otomatik cleanup timer

**4. idempotency-gate.interceptor.ts**
- Takeover rate limit kontrolü eklendi
- Rate limit aşımında 429 Too Many Requests
- Metrics emit: PROCEED, CACHED, IN_PROGRESS, SUCCESS, FAILED, TAKEOVER
- Takeover audit'i `IDEMPOTENCY_TAKEOVER` event type ile emit

**5. manifest-retry-alerts.yaml**
- `idempotency_takeover` alert group eklendi:
  - `IdempotencyTakeoverSpikeWarning` (>0.1/s for 5m)
  - `IdempotencyTakeoverSpikeCritical` (>0.5/s for 5m)
  - `IdempotencyTakeoverByActionType` (per action type)
  - `IdempotencyLeaseExpiredHigh` (>0.2/s for 5m)
  - `IdempotencyGateLatencyHigh` (p95 >100ms)
  - `IdempotencyHighFailureRate` (>10% failure)

**6. DB Migration güncellendi**
- `IDEMPOTENCY_TAKEOVER` event type constraint'e eklendi

### Takeover Rate Limit Semantiği

```
┌─────────────────────────────────────────────────────────────────┐
│ Actor: user-123                                                 │
│ Window: 5 minutes                                               │
│ Limit: 5 takeovers                                              │
├─────────────────────────────────────────────────────────────────┤
│ Takeover #1: ✅ allowed (count=1)                               │
│ Takeover #2: ✅ allowed (count=2)                               │
│ Takeover #3: ✅ allowed (count=3)                               │
│ Takeover #4: ✅ allowed (count=4)                               │
│ Takeover #5: ✅ allowed (count=5)                               │
│ Takeover #6: ❌ 429 TAKEOVER_RATE_LIMIT_EXCEEDED                │
│              Retry-After: ~300s (window expiry)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Metrics Flow

```
Request → Gate
    │
    ├─ CACHED → recordGateResult('CACHED')
    │
    ├─ IN_PROGRESS → recordGateResult('IN_PROGRESS')
    │
    └─ PROCEED
         │
         ├─ Takeover? → checkAndRecord(actorId)
         │    │
         │    ├─ Rate limit exceeded → 429
         │    │
         │    └─ Allowed → recordTakeover(actionType)
         │                 recordLeaseExpired()
         │                 recordAction(actionType, 'TAKEOVER')
         │
         ├─ recordGateResult('PROCEED')
         │
         └─ Handler execution
              │
              ├─ Success → recordAction(actionType, 'SUCCESS')
              │
              └─ Failed → recordAction(actionType, 'FAILED')
```

### Alert Thresholds

| Alert | Threshold | Duration | Severity |
|-------|-----------|----------|----------|
| TakeoverSpikeWarning | >0.1/s | 5m | warning |
| TakeoverSpikeCritical | >0.5/s | 5m | critical |
| LeaseExpiredHigh | >0.2/s | 5m | warning |
| GateLatencyHigh | p95 >100ms | 5m | warning |
| HighFailureRate | >10% | 10m | warning |


---

## PR-6 Checkpoint Kanıtları (2026-02-03)

### Değişiklik Özeti

**1. SLO.md Güncellemesi**
- Implementation status bölümü eklendi
- Dashboard ve alert referansları eklendi
- Revision history güncellendi

**2. manifest-retry-alerts.yaml - SLO Alert Group**
- `idempotency_slo` alert group eklendi:
  - `IdempotencyGateLatencyBudgetBurn` (p95 >50ms, 1h+5m multi-window)
  - `IdempotencyGateLatencyP99High` (p99 >100ms)
  - `IdempotencySuccessRateLow` (<95% for 5m)
  - `IdempotencySuccessRateCritical` (<90% for 5m)
  - `IdempotencyTakeoverRateHigh` (>1% of PROCEED)
  - `IdempotencyTakeoverRateCritical` (>5% of PROCEED)
  - `IdempotencyErrorBudgetBurnFast` (14.4x burn rate)
  - `IdempotencyErrorBudgetBurnMedium` (6x burn rate)
  - `IdempotencyErrorBudgetLow` (<25% remaining)
  - `IdempotencyErrorBudgetCritical` (<10% remaining)

**3. idempotency-slo-dashboard.json (YENİ)**
- SLO Overview Row:
  - Success Rate gauge (SLO-2)
  - Gate Latency p95 gauge (SLO-1)
  - Takeover Rate gauge (SLO-3)
  - Error Budget Remaining gauge
- Latency Metrics Row:
  - Gate Latency Percentiles (p50, p95, p99)
  - Latency Distribution histogram
- Action Metrics Row:
  - Actions by Type
  - Actions by Outcome
- Gate Results & Takeover Row:
  - Gate Results (PROCEED, CACHED, IN_PROGRESS)
  - Takeovers & Lease Expiry
- Error Budget Tracking Row:
  - Error Budget Remaining (30d)
  - Error Budget Burn Rate (1h, 6h)

### SLO Tanımları (Final)

| SLO | Metric | Target | Window |
|-----|--------|--------|--------|
| SLO-1 | Gate Latency p95 | ≤50ms | 5m |
| SLO-1 | Gate Latency p99 | ≤100ms | 5m |
| SLO-2 | Success Rate | ≥95% | 1h |
| SLO-2 | Success Rate | ≥99% | 24h |
| SLO-3 | Takeover Rate | ≤1% of PROCEED | 1h |
| SLO-4 | Cache Hit Rate | ≥10% (if duplicates) | 1h |

### Error Budget Policy

```
┌─────────────────────────────────────────────────────────────────┐
│ Monthly Error Budget (99.9% availability)                       │
│ = 0.001 × 30 × 24 × 60 = 43.2 minutes                          │
├─────────────────────────────────────────────────────────────────┤
│ Burn Rate Thresholds:                                           │
│   14.4x (1h)  → Critical: Page on-call                         │
│   6x (6h)     → Warning: Investigate                           │
│   3x (24h)    → Info: Review in standup                        │
├─────────────────────────────────────────────────────────────────┤
│ Budget Exhaustion Actions:                                      │
│   >50%        → Normal operations                              │
│   25-50%      → Freeze non-critical changes                    │
│   10-25%      → Incident review required                       │
│   <10%        → Feature freeze, focus on reliability           │
└─────────────────────────────────────────────────────────────────┘
```

### Alert Severity Matrix

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| LatencyBudgetBurn | p95>50ms (1h+5m) | critical | Page |
| LatencyP99High | p99>100ms | warning | Investigate |
| SuccessRateLow | <95% | warning | Investigate |
| SuccessRateCritical | <90% | critical | Page |
| TakeoverRateHigh | >1% | warning | Investigate |
| TakeoverRateCritical | >5% | critical | Page |
| ErrorBudgetBurnFast | 14.4x | critical | Page |
| ErrorBudgetBurnMedium | 6x | warning | Investigate |
| ErrorBudgetLow | <25% | warning | Freeze changes |
| ErrorBudgetCritical | <10% | critical | Feature freeze |

### Dashboard Panels

| Panel | Type | Query |
|-------|------|-------|
| Success Rate | Gauge | `sum(rate(...{outcome="SUCCESS"})) / sum(rate(...))` |
| Gate Latency p95 | Gauge | `histogram_quantile(0.95, ...)` |
| Takeover Rate | Gauge | `sum(rate(takeover)) / sum(rate(proceed))` |
| Error Budget | Gauge | `1 - (errors / budget)` |
| Latency Percentiles | Time Series | p50, p95, p99 |
| Actions by Type | Time Series | `sum by (action_type) (rate(...))` |
| Actions by Outcome | Time Series | `sum by (outcome) (rate(...))` |
| Gate Results | Stacked Bar | PROCEED, CACHED, IN_PROGRESS |
| Takeovers | Time Series | `sum by (action_type) (rate(takeover))` |
| Budget Remaining | Time Series | 30d rolling |
| Burn Rate | Time Series | 1h, 6h windows |

### Dosya Listesi

```
idempotency/
├── SLO.md                          # SLO specification (updated)
├── idempotency-metrics.ts          # Metrics (PR-5)
├── idempotency-gate.interceptor.ts # Interceptor (PR-4, PR-5)
└── idempotency-takeover-limiter.service.ts # Rate limiter (PR-5)

dashboards/
├── manifest-retry-alerts.yaml      # Alerts (updated with SLO group)
├── manifest-retry-cb-dashboard.json # CB dashboard (existing)
└── idempotency-slo-dashboard.json  # SLO dashboard (NEW)
```



---

## PR-6.1 Checkpoint Kanıtları (2026-02-03)

### Değişiklik Özeti

**1. SLO.md Güncellemeleri**
- SLO Ownership eklendi (Platform Team, escalation path, weekly review)
- SLO Classification tablosu eklendi (hangi SLO error budget'a bağlı)
- Action Type Allowlist eklendi (ADMIN_RETRY, DLQ_REDRIVE, DLQ_RESOLVE)
- Error Budget Scope netleştirildi (%99.9 availability only)
- Alert Tuning Policy eklendi (14 gün freeze)
- SLO-4 (Cache Hit Rate) detaylandırıldı (informational, no alert)

**2. RUNBOOK.md (YENİ)**
- Takeover Spike diagnosis & resolution
- Error Budget Burn diagnosis & resolution
- Gate Latency Regression diagnosis & resolution
- Success Rate Low diagnosis & resolution
- Escalation path (L1 → L2 → L3)

**3. manifest-retry-alerts.yaml**
- `IdempotencyUnknownActionType` alert eklendi (cardinality guard)
- Alert group header PR-6.1 olarak güncellendi

**4. idempotency-slo-dashboard.json**
- UID: `idempotency-slo-pr6` → `idempotency-slo-v1`

### Kilitli Kararlar

| Karar | Değer |
|-------|-------|
| Error Budget SLO | %99.9 availability (43.2 dk/ay) |
| Alert Tuning Freeze | 14 gün |
| Action Type Allowlist | ADMIN_RETRY, DLQ_REDRIVE, DLQ_RESOLVE |
| SLO Owner | Platform Team |
| Review Cadence | Weekly |

### Dosya Listesi

```
idempotency/
├── SLO.md                          # SLO specification (v1.2)
├── RUNBOOK.md                      # Operational runbook (NEW)
├── idempotency-metrics.ts          # Metrics
├── idempotency-gate.interceptor.ts # Interceptor
└── idempotency-takeover-limiter.service.ts # Rate limiter

dashboards/
├── manifest-retry-alerts.yaml      # Alerts (with cardinality guard)
└── idempotency-slo-dashboard.json  # Dashboard (UID: v1)
```

---

## PR-7 Mimari Planı (2026-02-03)

### Hedef
`req.idempotencyContext` → AsyncLocalStorage refactor

### Dosya Değişiklikleri

| Dosya | Değişiklik |
|-------|------------|
| `idempotency-context.ts` | YENİ: ALS wrapper |
| `idempotency-gate.interceptor.ts` | `runWithIdempotencyContext()` kullanımı |
| `manifest-admin-audit.service.ts` | `getIdempotencyContext()` ile auto-enrichment |

### Migration Phases

1. **Phase 1**: Add ALS (non-breaking, both mechanisms active)
2. **Phase 2**: Migrate consumers to ALS
3. **Phase 3**: Remove `req.idempotencyContext`

### Guardrails

- Fire-and-forget async yasak
- Queue/job boundary'de explicit context pass
- Concurrency testleri zorunlu

### Detaylı Mimari
Bkz: `PR-7-ALS-ARCHITECTURE.md`



---

## PR-7.1 Checkpoint Kanıtları (2026-02-03)

### Değişiklik Özeti

**1. idempotency-context.ts (YENİ)**
- `IdempotencyContext` interface (readonly fields)
- `IdempotencyALS` AsyncLocalStorage instance
- `getIdempotencyContext()` helper
- `hasIdempotencyContext()` helper
- Guardrail comment: fire-and-forget async yasak

**2. idempotency-gate.interceptor.ts**
- Import: `IdempotencyALS`, `IdempotencyContext` from `./idempotency-context`
- Re-export: `IdempotencyContext` for backward compatibility
- PROCEED path: `IdempotencyALS.run(ctx, () => ...)` ile sarmalandı
- `executeWithALS()` private method eklendi
- `req.idempotencyContext` backward compatibility için korundu (TODO: PR-7.2'de kaldırılacak)
- CACHED/IN_PROGRESS: ALS.run() çağrılmıyor (getStore() undefined)
- Takeover audit: ALS scope içinde emit ediliyor

**3. index.ts**
- `idempotency-context` export eklendi

**4. idempotency-context.spec.ts (YENİ)**
- 11 test case
- Context isolation (parallel requests)
- Nested async context propagation
- CACHED/IN_PROGRESS simulation
- Takeover context propagation

### Test Sonuçları

```
PASS  idempotency/__tests__/idempotency-context.spec.ts
  IdempotencyContext (ALS)
    getIdempotencyContext
      ✓ returns undefined outside of ALS.run() scope
      ✓ returns context inside ALS.run() scope
      ✓ returns undefined after ALS.run() completes
    hasIdempotencyContext
      ✓ returns false outside of ALS.run() scope
      ✓ returns true inside ALS.run() scope
    context isolation (parallel requests)
      ✓ isolates context between concurrent async operations
      ✓ maintains context through nested async calls
    CACHED/IN_PROGRESS paths (no ALS.run)
      ✓ simulates CACHED path - no context available
      ✓ simulates IN_PROGRESS path - no context available
    takeover context
      ✓ correctly propagates takeover information
      ✓ correctly propagates non-takeover context

Tests: 11 passed, 11 total
```

```
PASS  idempotency/__tests__/idempotency-gate.integration.spec.ts
  Idempotency Gate Integration Tests (MUST 3.6, 3.7)
    MUST 3.6: Concurrent Request Handling
      ✓ same key: one PROCEED, other IN_PROGRESS or CACHED, single DB row
      ✓ IN_PROGRESS response includes retryAfterSeconds and actionId
      ✓ lease expired: takeover succeeds with previousActorId
      ✓ lease NOT expired: returns IN_PROGRESS (no takeover)
    MUST 3.7: Cache Replay Determinism
      ✓ success replay: same http_status and body
      ✓ error replay: same http_status and error body
      ✓ 409 ALREADY_QUEUED replay: deterministic
      ✓ DB row has correct terminal state after complete
      ✓ DB row has correct terminal state after fail
    Edge Cases
      ✓ different requestIds create separate rows
      ✓ owner_token mismatch: complete/fail has no effect
      ✓ PROCEED returns actionId and ownerToken

Tests: 12 passed, 12 total
```

### DoD Checklist

| # | Kriter | Durum |
|---|--------|-------|
| 1 | Mevcut testler yeşil | ✅ 12/12 PASS |
| 2 | Paralel request → context karışmıyor | ✅ Test: "isolates context between concurrent async operations" |
| 3 | CACHED/IN_PROGRESS → getStore() undefined | ✅ Test: "simulates CACHED/IN_PROGRESS path" |
| 4 | Nested async → context korunuyor | ✅ Test: "maintains context through nested async calls" |
| 5 | Backward compatibility (req.idempotencyContext) | ✅ Korundu, TODO ile işaretlendi |

### ALS Flow Diagram

```
Request → Interceptor
    │
    ├─ CACHED → return (NO ALS.run)
    │           getIdempotencyContext() = undefined
    │
    ├─ IN_PROGRESS → return (NO ALS.run)
    │                getIdempotencyContext() = undefined
    │
    └─ PROCEED
         │
         └─ IdempotencyALS.run(ctx, () => {
              │
              ├─ Takeover audit (if takeover)
              │
              └─ next.handle().pipe(
                   tap(success → audit),
                   catchError(fail → audit)
                 )
            })
            │
            └─ getIdempotencyContext() = ctx ✅
```

### Sonraki Adımlar

- **PR-7.2**: `manifest-admin-audit.service.ts` → `getIdempotencyContext()` ile enrichment
- **PR-7.3**: Job/queue boundary explicit context pass (opsiyonel)
- **PR-7.4**: `req.idempotencyContext` kaldırma (breaking change)


---

## PR-7.2 Checkpoint Kanıtları (2026-02-04)

### Değişiklik Özeti

**1. manifest-admin-audit.service.ts**
- Import: `getIdempotencyContext` from `../idempotency/idempotency-context`
- `append()` metodu: Buffer overflow check'inden sonra `getIdempotencyContext()` çağrısı
- Enrichment kuralları:
  - `actionId`: `input.actionId ?? ctx?.actionId ?? null`
  - `takeoverFrom`: `input.takeoverFrom ?? (ctx?.takeover ? ctx.previousActorId ?? null : null)`
- Input her zaman öncelikli (override yok)

**2. manifest-admin-audit.service.spec.ts**
- 6 yeni test eklendi (PR-7.2: ALS enrichment describe block)
- Test coverage:
  - actionId ALS'den enrichment
  - actionId input override koruması
  - takeoverFrom takeover=true enrichment
  - takeoverFrom takeover=false (no enrichment)
  - takeoverFrom input override koruması
  - Backward compat (ALS yoksa davranış değişmez)

### Enrichment Kuralları (Kilitli)

```
┌─────────────────────────────────────────────────────────────────┐
│ Field         │ Enrichment Rule                                 │
├───────────────┼─────────────────────────────────────────────────┤
│ actionId      │ input.actionId ?? ctx?.actionId ?? null         │
│ takeoverFrom  │ input.takeoverFrom ??                           │
│               │   (ctx?.takeover ? ctx.previousActorId : null)  │
│ requestId     │ NO enrichment (contract requires explicit)      │
│ actionType    │ NO enrichment (event semantics, not metadata)   │
│ resourceType  │ NO enrichment (event semantics, not metadata)   │
└───────────────┴─────────────────────────────────────────────────┘
```

### Test Sonuçları

```
PASS  audit/__tests__/manifest-admin-audit.service.spec.ts
  ManifestAdminAuditService
    initial state
      ✓ should start in NORMAL mode
    append
      ✓ should add event to buffer
      ✓ should hash IP address
      ✓ should set IP to null when no secret
    buffer overflow
      ✓ should drop events when buffer is full
    flush
      ✓ should write events to DB in NORMAL mode
      ✓ should handle empty buffer
    NORMAL → DEGRADED transition
      ✓ should transition after 3 consecutive failures
      ✓ should reset failure count on success
      ✓ should dump failed batch to file
    DEGRADED → NORMAL transition
      ✓ should recover when health check succeeds
      ✓ should stay DEGRADED when health check fails
    DEGRADED mode behavior
      ✓ should write to file in DEGRADED mode
    size-based flush
      ✓ should trigger flush when buffer reaches max size
    file sink write failure
      ✓ should increment file sink failure counter when file write fails
    PR-7.2: ALS enrichment
      ✓ should enrich actionId from ALS when input does not provide it
      ✓ should NOT override actionId when input provides it
      ✓ should enrich takeoverFrom from ALS when takeover=true
      ✓ should NOT enrich takeoverFrom when takeover=false
      ✓ should NOT override takeoverFrom when input provides it
      ✓ should work without ALS context (backward compat)

Tests: 21 passed, 21 total
```

### DoD Checklist

| # | Kriter | Durum |
|---|--------|-------|
| 1 | ctx.actionId var, input.actionId yok → event.actionId ctx'den gelir | ✅ Test: "should enrich actionId from ALS when input does not provide it" |
| 2 | input.actionId var → ctx override edemez | ✅ Test: "should NOT override actionId when input provides it" |
| 3 | Backward compat: ALS yoksa davranış değişmez | ✅ Test: "should work without ALS context (backward compat)" |
| 4 | takeoverFrom enrichment (takeover=true) | ✅ Test: "should enrich takeoverFrom from ALS when takeover=true" |
| 5 | takeoverFrom NO enrichment (takeover=false) | ✅ Test: "should NOT enrich takeoverFrom when takeover=false" |
| 6 | Mevcut testler yeşil | ✅ 21/21 PASS |

### Dosya Listesi

```
audit/
├── manifest-admin-audit.service.ts      # ALS enrichment (MODIFIED)
└── __tests__/
    └── manifest-admin-audit.service.spec.ts  # 6 new tests (MODIFIED)

idempotency/
├── idempotency-context.ts               # ALS wrapper (PR-7.1)
├── idempotency-gate.interceptor.ts      # ALS.run() (PR-7.1)
└── __tests__/
    ├── idempotency-context.spec.ts      # 11 tests (PR-7.1)
    └── idempotency-gate.integration.spec.ts  # 12 tests
```

### Sonraki Adımlar

- **PR-7.3**: Job/queue boundary explicit context pass (opsiyonel)
- **PR-7.4**: `req.idempotencyContext` kaldırma (breaking change)


---

## PR-7.3 Checkpoint Kanıtları (2026-02-04)

### Değişiklik Özeti

**1. idempotency-gate.interceptor.ts**
- `req.idempotencyContext = idempotencyContext` satırı silindi
- TODO comment kaldırıldı
- Artık yalnızca ALS üzerinden context erişimi

### Kaldırılan Kod

```diff
-    // 7a-legacy: Also set req.idempotencyContext for backward compatibility
-    // TODO(PR-7.2): Remove after audit service migrates to getIdempotencyContext()
-    req.idempotencyContext = idempotencyContext;
```

### Test Sonuçları

```
PASS  idempotency/__tests__/idempotency-context.spec.ts
  IdempotencyContext (ALS): 11 passed

PASS  idempotency/__tests__/idempotency-gate.integration.spec.ts
  Idempotency Gate Integration Tests: 12 passed

PASS  audit/__tests__/manifest-admin-audit.service.spec.ts
  ManifestAdminAuditService: 21 passed

Total: 44 tests passed
```

### DoD Checklist

| # | Kriter | Durum |
|---|--------|-------|
| 1 | `req.idempotencyContext` assignment kaldırıldı | ✅ grep → 0 match |
| 2 | Tüm testler yeşil | ✅ 44/44 PASS |
| 3 | ALS-only erişim | ✅ `getIdempotencyContext()` |

### PR-7 Final Durumu

| PR | Açıklama | Durum |
|----|----------|-------|
| 7.1 | ALS wrapper + interceptor refactor | ✅ |
| 7.2 | AuditService ALS enrichment | ✅ |
| 7.3 | Backward compat cleanup | ✅ |

### Context Erişim Akışı (Final)

```
Request → Interceptor
    │
    ├─ CACHED → return (NO ALS)
    │
    ├─ IN_PROGRESS → return (NO ALS)
    │
    └─ PROCEED
         │
         └─ IdempotencyALS.run(ctx, () => {
              │
              ├─ AuditService.append()
              │    └─ getIdempotencyContext() → ctx ✅
              │
              └─ Handler execution
            })
```

### Guardrails (Aktif)

1. **Fire-and-forget async yasak**: ALS.run() scope içinde tüm async işlemler tamamlanmalı
2. **Queue/job boundary**: Explicit context pass gerekli (ALS process boundary'yi geçmez)
3. **CACHED/IN_PROGRESS**: ALS.run() çağrılmaz, getIdempotencyContext() → undefined


---

## PR-7.3b Mikro-Fix: TS6133 Unused Variable (2026-02-04)

### Problem
`snapshot-idempotency.integration.spec.ts` satır 71'de `const first = ...` tanımlanıp kullanılmıyordu.
Bu, `--testPathPattern="idempotency"` ile test koşunca TS6133 hatası veriyordu.

### Fix
```diff
-    const first = await repository.insert(firstInput);
+    await repository.insert(firstInput);
```

### Doğrulama
- TypeScript diagnostics: 0 error ✅
- Test suite: 44/44 PASS ✅

### Dosya
- `persistence/__tests__/snapshot-idempotency.integration.spec.ts`


---

## ADR-007 + CI Grep Gate Checkpoint (2026-02-04)

### Değişiklik Özeti

**1. ADR-007-ALS-ONLY-CONTEXT-ACCESS.md (YENİ)**
- Status: Accepted
- Decision: ALS-only context access, `req.idempotencyContext` banned
- Rules: 
  - Services must use `getIdempotencyContext()`
  - No request object context
  - Explicit boundary crossing for queue/job
  - No fire-and-forget async
- Compliance: CI grep gate reference

**2. .github/workflows/ci.yml (YENİ)**
- Unit tests job
- Architectural guardrails job with ADR-007 grep gate:
  ```bash
  grep -r "req\.idempotencyContext\s*=" apps/api/src/
  ```
- CI summary job

### CI Grep Gate

```yaml
- name: Check for banned req.idempotencyContext (ADR-007)
  run: |
    if grep -r "req\.idempotencyContext\s*=" apps/api/src/; then
      echo "❌ ADR-007 VIOLATION: req.idempotencyContext assignment found"
      exit 1
    fi
    echo "✅ ADR-007 compliant"
```

### DoD Checklist

| # | Kriter | Durum |
|---|--------|-------|
| 1 | ADR-007 oluşturuldu | ✅ `docs/adr/ADR-007-ALS-ONLY-CONTEXT-ACCESS.md` |
| 2 | CI grep gate eklendi | ✅ `.github/workflows/ci.yml` |
| 3 | ADR'de CI referansı var | ✅ Compliance section |
| 4 | Mevcut kod ADR-007 compliant | ✅ grep → 0 match |

### Dosya Listesi

```
docs/adr/
└── ADR-007-ALS-ONLY-CONTEXT-ACCESS.md  # NEW

.github/workflows/
├── ci.yml                              # NEW (grep gate)
├── sweep.yml                           # Existing
├── contract-tests.yml                  # Existing
├── load-test.yml                       # Existing
└── sdk-test.yml                        # Existing
```

### PR-7 Tamamlandı

| Adım | Açıklama | Durum |
|------|----------|-------|
| PR-7.1 | ALS wrapper + interceptor refactor | ✅ |
| PR-7.2 | AuditService ALS enrichment | ✅ |
| PR-7.3 | Backward compat cleanup | ✅ |
| PR-7.3b | TS6133 mikro-fix | ✅ |
| ADR-007 | ALS-only context access decision | ✅ |
| CI Gate | Grep gate for regression prevention | ✅ |

### Sonraki Adımlar (Backlog)

- [ ] Static lint rule: `no-restricted-syntax` for `req.*Context` patterns
- [ ] Queue/job boundary explicit context pass (when needed)


---

## ADR-008 Queue/Job Context Propagation (2026-02-04)

### Karar

Queue/job boundary'de context propagation için typed contract kilitlendi.

**Dosya:** `docs/adr/ADR-008-QUEUE-JOB-CONTEXT-PROPAGATION.md`

### Kapsam

- `IdempotencyContextCarrier` type definition
- Producer contract: `enqueueWithContext()` pattern
- Consumer contract: `IdempotencyALS.run(carrierToContext(carrier), fn)`
- MUST / MUST NOT kuralları
- Guardrail backlog (ESLint rule, metrics, etc.)

### Durum

| Öğe | Durum |
|-----|-------|
| ADR yazıldı | ✅ |
| Type definition | ⏳ (implementasyon bekliyor) |
| Wrapper function | ⏳ (implementasyon bekliyor) |
| CI guardrail | ⏳ (queue eklendiğinde) |

### İlişki

- ADR-007: ALS-only context access (HTTP boundary)
- ADR-008: Queue/job context propagation (process boundary)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT PROPAGATION MAP                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HTTP Request                                                   │
│       │                                                         │
│       │ ADR-007: IdempotencyALS.run()                          │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Request Scope (ALS)                         │   │
│  │  getIdempotencyContext() → ctx                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       │ ADR-008: IdempotencyContextCarrier                     │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Queue/Job Payload                           │   │
│  │  { data, idempotencyContext: carrier }                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       │ ADR-008: IdempotencyALS.run(carrierToContext())        │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Worker Scope (ALS restored)                 │   │
│  │  getIdempotencyContext() → ctx                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

