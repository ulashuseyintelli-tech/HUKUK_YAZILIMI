# Task 8.1 — Fail-Closed Semantik Düzeltme + Transaction Gate Patch

## Tarih & Bağlam

- **Tarih:** 2026-02-07
- **Tetikleyen:** Task 8 kısmi kabul review'ı (3 tur iterasyon)
- **Bağımlılık:** Task 8 (Controller entegrasyonu) DONE, Task 7 (Metrikler) PENDING
- **Amaç:** Task 7'ye geçmeden önce fail-closed semantiğini düzelt + rate limit gate'i atomicRedrive tx'ine taşı

## Kararlar (LOCKED — 2026-02-07 16:57 TRT)

### Karar 1: RATE_LIMIT_CHECK_FAILED → 409 (non-retriable)

**Önceki:** `InternalServerErrorException` (HTTP 500) + `RATE_LIMIT_CHECK_FAILED`
**Yeni:** `ConflictException` (HTTP 409) + `REDRIVE_RATE_LIMIT_CHECK_FAILED`

**Gerekçe:**
- Fail-closed = güvenlik freni → "retry yapma" sinyali vermeli
- 500 retry'ı teşvik eder; 409 deterministik reject verir
- Client contract: `REDRIVE_RATE_LIMIT_CHECK_FAILED` (409) **non-retriable**
- Body: `{ code, message: 'Rate limit check failed — redrive rejected (fail-closed)', dlqId }`

### Karar 2: TOCTOU → Gate'i atomicRedrive Transaction İçine Al

**Önceki:** `checkRateLimit` controller'da read-only, `onRedriveEnqueued` ayrı persist
**Yeni:** Double-check pattern:
1. **Pre-check** (controller): `checkRateLimit(dlqEntry, now)` — optimistic, DB lock yok, UX hızı
2. **Tx gate** (atomicRedrive): `FOR UPDATE` lock sonrası `now < next_allowed_redrive_at` → reject

**Pre-check asla fail-open olamaz (Şart 1):**
- Pre-check hata verirse (Date parse, NaN, vb.) → 409 `REDRIVE_RATE_LIMIT_CHECK_FAILED`
- `atomicRedrive`'a geçilmez

**Tx gate status+cooldown birlikte (Şart 2):**
- Status guard (mevcut): DLQ_OPEN değilse → reject
- Cooldown guard (yeni): `now < next_allowed_redrive_at` → reject `RATE_LIMITED`
- Tek transaction'da deterministik

### Karar 3: All-or-Nothing — Persist Failure Ortadan Kalkar

**Önceki:** `recordRedriveSuccess` ayrı çağrı, persist fail → 200 (state drift)
**Yeni:** `atomicRedrive` tx içinde:
- Status guard
- Cooldown guard (`now < next_allowed_redrive_at`)
- DLQ status update (DLQ_OPEN → DLQ_REDROVE)
- Retry job insert
- Rate limit state update (`redrive_count++`, `last_redriven_at`, `next_allowed_redrive_at`)

Ya hepsi commit olur, ya hiçbiri. Ayrı "persist failure" senaryosu kalmaz.

### Karar +: checkRateLimit Controller'da Kalır (Early Reject)

**Rol:** UX optimizasyonu + güvenlik freni
- DB lock açmadan hızlı 409 + `waitSeconds` dönmek
- %99 case'de transaction'a girmeden reject
- Hata → reject (fail-open yok)

**Gerçek gate:** `atomicRedrive` tx'inde — `FOR UPDATE` lock sonrası

## Mimari: Double-Check Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Controller (redriveDlqEntry)                      │
│                                                                      │
│  1. getById(dlqId) → dlqEntry                                       │
│  2. resolveCarrierForRedrive(dlqEntry)                               │
│  3. enforceRedriveDepthLimit (Phase 11.3)                            │
│                                                                      │
│  4. ★ PRE-CHECK: checkRateLimit(dlqEntry, now)                       │
│     ├─ RATE_LIMITED → 409 (fast reject, no DB lock)                  │
│     ├─ CHECK_FAILED (throw) → 409 REDRIVE_RATE_LIMIT_CHECK_FAILED   │
│     └─ ALLOWED → continue                                           │
│                                                                      │
│  5. Backoff compute: computeNextAllowedAt(now, redriveCount, ...)    │
│     → nextAllowedRedriveAt (Date)                                    │
│                                                                      │
│  6. cloneCarrierForRedrive                                           │
│  7. enforceCarrierSizeLimit                                          │
│                                                                      │
│  8. ★ atomicRedrive(dlqId, redrivenBy, null, {                       │
│        now, nextAllowedRedriveAt                                     │
│     })                                                               │
│     ├─ TX: FOR UPDATE lock                                           │
│     ├─ TX: Status guard (DLQ_OPEN check)                             │
│     ├─ TX: ★ Cooldown guard (now < next_allowed_redrive_at → reject) │
│     ├─ TX: DLQ UPDATE (status + redriven_at + redriven_by           │
│     │       + redrive_count++ + last_redriven_at                     │
│     │       + next_allowed_redrive_at)                               │
│     ├─ TX: Existing job check                                        │
│     ├─ TX: Retry job INSERT                                          │
│     └─ TX: COMMIT (all-or-nothing)                                   │
│                                                                      │
│  9. 200 response (redriveCount, nextAllowedRedriveAt)                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## atomicRedrive Signature Değişikliği

```typescript
// ÖNCE (Phase 10.2)
atomicRedrive(
  dlqId: string,
  redrivenBy: string,
  nextAttemptAt?: Date | null,
): Promise<{ dlqEntry: DlqEntry; newJobId: string }>

// SONRA (Phase 11.4 patch)
atomicRedrive(
  dlqId: string,
  redrivenBy: string,
  nextAttemptAt?: Date | null,
  rateLimitGate?: {
    now: Date;
    nextAllowedRedriveAt: Date;
  },
): Promise<{ dlqEntry: DlqEntry; newJobId: string }>
```

**Separation of concerns:**
- `rateLimitGate.now` → repo sadece `now < existing.next_allowed_redrive_at` compare yapar
- `rateLimitGate.nextAllowedRedriveAt` → repo sadece bu değeri yazar
- Backoff policy hesabı controller'da kalır (domain logic)
- Repo policy bilmez — sadece timestamp compare + write

**Backward compat:** `rateLimitGate` optional — geçilmezse mevcut davranış korunur (Phase 10.2 callers etkilenmez)

## Transaction SQL (Yeni Akış)

```sql
-- atomicRedrive transaction (Phase 11.4 patch)

-- 0. Lock entry
SELECT ... FROM manifest_dead_letter_queue
WHERE id = $dlqId::uuid
FOR UPDATE;

-- Status guards (mevcut)
-- IF status != 'DLQ_OPEN' → DlqRedriveError

-- ★ 1. Cooldown guard (YENİ)
-- IF rateLimitGate provided AND existing.next_allowed_redrive_at IS NOT NULL
--    AND $now < existing.next_allowed_redrive_at
-- → DlqRedriveError('RATE_LIMITED', { nextAllowedAt, waitSeconds })

-- 2. DLQ UPDATE (genişletilmiş)
UPDATE manifest_dead_letter_queue
SET
  status = 'DLQ_REDROVE',
  redriven_at = NOW(),
  redriven_by = $redrivenBy,
  -- ★ Rate limit state (YENİ — aynı UPDATE'te)
  redrive_count = COALESCE(redrive_count, 0) + 1,
  last_redriven_at = $rateLimitGate.now,
  next_allowed_redrive_at = $rateLimitGate.nextAllowedRedriveAt,
  rate_limit_reason = NULL
WHERE id = $dlqId::uuid AND status = 'DLQ_OPEN'
RETURNING ...;

-- 3. Existing job check (mevcut)
-- 4. Retry job INSERT (mevcut)
-- COMMIT
```

## Controller Akış Değişikliği

```typescript
// ÖNCE (Task 8)
// 4. checkRateLimit → reject or allow
// 5-6. clone + size
// 7. atomicRedrive(dlqId, redrivenBy, null)
// 8. onRedriveEnqueued(dlqId, now, count, repo) ← AYRI PERSIST

// SONRA (Task 8.1)
// 4. checkRateLimit → reject or allow (PRE-CHECK, fail-closed)
// 5. computeNextAllowedAt(now, count, config) → backoffResult
// 6-7. clone + size
// 8. atomicRedrive(dlqId, redrivenBy, null, {
//      now, nextAllowedRedriveAt: backoffResult.nextAllowedAt
//    }) ← TX İÇİNDE HER ŞEY
// 9. 200 response (redriveCount from tx result)
```

**Kaldırılan:** `onRedriveEnqueued` controller'dan çağrılmaz. Persist tx'te olur.
**Kaldırılan:** `recordRedriveSuccess` ayrı çağrı yok. SQL doğrudan tx'te.
**Kalan:** `checkRateLimit` pre-check olarak kalır (UX + fail-closed).
**Kalan:** `onRedriveEnqueued` fonksiyonu silinmez — ileride başka call path kullanabilir. Ama controller artık çağırmaz.

## HTTP Response Matrisi (Final — Phase 11.3 + 11.4)

| Durum | HTTP | code | Retriable? | Mutasyon | Gate |
|-------|------|------|------------|----------|------|
| POISON (11.3) | 409 | `POISON_ENTRY` | ❌ | Yok | Controller |
| Depth aşıldı (11.3) | 409 | `REDRIVE_DEPTH_EXCEEDED` | ❌ | poison set | Controller |
| Depth check fail (11.3) | 409 | `DEPTH_CHECK_FAILED` | ❌ | Yok | Controller |
| Rate limited (pre-check) | 409 | `REDRIVE_RATE_LIMITED` | ⏳ waitSeconds | Yok | Controller |
| Rate limited (tx gate) | 409 | `REDRIVE_RATE_LIMITED` | ⏳ waitSeconds | Yok | Tx |
| Rate check fail | 409 | `REDRIVE_RATE_LIMIT_CHECK_FAILED` | ❌ | Yok | Controller |
| Carrier upgrade fail | 400 | `INVALID_CARRIER` | ❌ | Yok | Controller |
| Carrier size exceeded | 413 | `CARRIER_SIZE_EXCEEDED` | ❌ | Yok | Controller |
| Already redriven | 409 | `ALREADY_REDRIVEN` | ❌ | Yok | Tx |
| Already resolved | 409 | `ALREADY_RESOLVED` | ❌ | Yok | Tx |
| Already queued | 409 | `ALREADY_QUEUED` | ❌ | Yok | Tx |
| Not found | 404 | `NOT_FOUND` | ❌ | Yok | Tx |
| Success | 200 | `REDRIVEN` | — | redrive + rate state | Tx |

## Concurrency Model

```
Request A ──► pre-check: ALLOWED ──► atomicRedrive tx
Request B ──► pre-check: ALLOWED ──► atomicRedrive tx (concurrent)

Tx A: FOR UPDATE lock acquired
Tx A: cooldown guard → ALLOWED
Tx A: UPDATE + INSERT → COMMIT → 200

Tx B: FOR UPDATE lock → WAITS for Tx A
Tx B: lock acquired → status = DLQ_REDROVE
Tx B: status guard → ALREADY_REDRIVEN (409)

Sonuç: Tek entry, tek redrive. TOCTOU yok.
```

```
Request C ──► pre-check: RATE_LIMITED (fast 409, no tx)
Sonuç: DB lock açılmadı, hızlı reject.
```

## Test DoD (Definition of Done)

### Zorunlu Testler

1. **Pre-check: rate limited** → 409 `REDRIVE_RATE_LIMITED` + `waitSeconds`, repo hiç çağrılmıyor
2. **Pre-check: check failed (throw)** → 409 `REDRIVE_RATE_LIMIT_CHECK_FAILED`, repo hiç çağrılmıyor
3. **Tx gate: cooldown active** → 409 `REDRIVE_RATE_LIMITED` (pre-check geçti ama tx'te reject)
4. **Tx gate: all-or-nothing** → tx fail simülasyonu → enqueue yok, state yok (rollback)
5. **Concurrency: iki paralel call** → biri 200, diğeri 409 `ALREADY_REDRIVEN`
6. **Success: redriveCount + nextAllowedRedriveAt** response'ta doğru
7. **Backward compat: rateLimitGate undefined** → mevcut davranış korunur

### Mevcut Testlerin Güncellenmesi

- Fail-closed test: `InternalServerErrorException` → `ConflictException`, code → `REDRIVE_RATE_LIMIT_CHECK_FAILED`
- Persist failure test: **kaldırılır** (senaryo artık yok — tx all-or-nothing)
- Allowed tests: `recordRedriveSuccess` assertion → kaldırılır (tx içinde)

## Değişiklik Listesi (Implementation Checklist — ✅ TAMAMLANDI)

### 1. Repository (`manifest-dlq.repository.ts`) ✅

- [x] `IManifestDlqRepository.atomicRedrive` signature: `rateLimitGate?: { now: Date; nextAllowedRedriveAt: Date }` parametresi eklendi
- [x] `PrismaManifestDlqRepository.atomicRedrive` tx içine cooldown guard eklendi
- [x] DLQ UPDATE statement'ına rate limit kolonları eklendi (merged UPDATE)
- [x] `recordRedriveSuccess` metodu: deprecated doc notu eklendi

### 2. Controller (`manifest-admin.controller.ts`) ✅

- [x] `RATE_LIMIT_CHECK_FAILED` catch: `InternalServerErrorException` → `ConflictException` (409)
- [x] Error code: `RATE_LIMIT_CHECK_FAILED` → `REDRIVE_RATE_LIMIT_CHECK_FAILED`
- [x] Pre-check sonrası: `computeNextAllowedAt(now, redriveCount, config)` çağrısı eklendi
- [x] `atomicRedrive` çağrısına `rateLimitGate: { now, nextAllowedRedriveAt }` geçirildi
- [x] `onRedriveEnqueued` çağrısı **kaldırıldı** (tx içinde)
- [x] `RATE_LIMITED` from tx: `DlqRedriveError` → `ConflictException` (409) mapping eklendi
- [x] Persist failure try/catch bloğu **kaldırıldı**
- [x] Response: `redriveCount` ve `nextAllowedRedriveAt` tx result'tan alınıyor

### 3. Tests (`redrive-rate-limit-controller.spec.ts`) ✅

- [x] Fail-closed test: 500 → 409, code → `REDRIVE_RATE_LIMIT_CHECK_FAILED`
- [x] Persist failure test: **kaldırıldı** (senaryo yok)
- [x] Tx gate cooldown test: `atomicRedrive` mock `RATE_LIMITED` DlqRedriveError → 409
- [x] Tx gate all-or-nothing test: `atomicRedrive` mock genel hata → enqueue yok
- [x] Concurrency test: iki çağrı, biri success diğeri `ALREADY_REDRIVEN`
- [x] Allowed tests: `recordRedriveSuccess` assertion kaldırıldı
- [x] Backward compat test: `rateLimitGate` undefined → mevcut davranış

### 4. Rate Limiter (`redrive-rate-limiter.ts`) ✅

- [x] `onRedriveEnqueued`: doc'a "not called from controller anymore — tx handles persist" notu eklendi
- [x] `checkRateLimit`: doc'a "pre-check only — real gate is in atomicRedrive tx" notu eklendi

### 5. Spec Docs

- [x] `design.md`: Mimari diyagram güncelle (double-check pattern)
- [x] `design.md`: HTTP response matrisi güncelle
- [x] `design.md`: Fail-closed code snippet güncelle
- [x] `design.md`: `onRedriveEnqueued` controller'dan kaldırıldı notu
- [x] `architecture.md`: Persist semantiği güncelle (all-or-nothing)
- [x] `architecture.md`: Concurrency model ekle
- [x] `requirements.md`: Gereksinim 7.2 güncelle (500 → 409 + yeni code)
- [x] `requirements.md`: Gereksinim 5.1 güncelle (tx içinde atomik)
- [x] `requirements.md`: Gereksinim 7.1 ekle (Concurrency Safety NFR)
- [x] `tasks.md`: Task 8.1-patch ekle + Task 7 TODO notu
