# Design Document — Phase 12: Redrive Operational Safeguards

## Genel Bakış (Overview)

Phase 12, mevcut `POST /dlq/:dlqId/redrive` endpoint'ine iki operasyonel katman ekler:
1. `atomicRedrive` tx duration histogram — contention/yavaşlama görünürlüğü
2. Kill-switch — incident anında redrive'ı tamamen devre dışı bırakma

Yeni iş mantığı eklenmez. Mevcut Phase 11.4 metrik isimleri ve label contract'ları değişmez.

**Config flag ismi (LOCKED):** `REDRIVE_DISABLED` — tek isim, başka alias yok.

## Mimari (Architecture)

### Entegrasyon Noktası — Controller Flow (Güncel)

```
POST /dlq/:dlqId/redrive

  0. ★ Kill-switch check (SHORT-CIRCUIT — en başta)
     ├─ REDRIVE_DISABLED=true → 503 + REDRIVE_DISABLED (hiçbir downstream çağrı yok)
     ├─ carrier_redrive_disabled_total.inc()
     └─ return (getById, depth check, rate check, atomicRedrive HİÇBİRİ çağrılmaz)

  1. getById(dlqId)                    — mevcut
  2. resolveCarrierForRedrive          — mevcut (Phase 11.2)
  3. enforceRedriveDepthLimit          — mevcut (Phase 11.3)
  4. checkRateLimit (PRE-CHECK)        — mevcut (Phase 11.4)
  5. computeNextAllowedAt              — mevcut (Phase 11.4)
  6. cloneCarrierForRedrive            — mevcut
  7. enforceCarrierSizeLimit           — mevcut

  8. ★ TX Duration measurement START (Date.now())
  9. atomicRedrive(rateLimitGate?)     — mevcut (Phase 11.4)
     ├─ FOR UPDATE lock
     ├─ Status guard + Cooldown guard
     ├─ UPDATE + INSERT
     └─ COMMIT / ROLLBACK
 10. ★ TX Duration measurement END (try/finally — her outcome'da observe)
     └─ redriveeTxDurationHistogram.observe(elapsed)

 11. Success metrics + audit          — mevcut
```

**Kritik tasarım kararları:**
- Kill-switch Step 0'da — `getById` bile çağrılmaz (zero downstream impact)
- TX duration Step 8–10'da — `try/finally` ile rollback/error dahil her path ölçülür
- Gauge startup'ta set edilir, runtime'da her request'te güncellenmez (statik flag)

## Bileşenler ve Arayüzler (Components and Interfaces)

### 1. Kill-Switch Guard

Kill-switch kontrolü controller method'unun en başında yapılır. NestJS guard veya inline check olabilir; Phase 12'de inline check tercih edilir (minimal scope, tek endpoint).

```typescript
// manifest-admin.controller.ts — redriveDlqEntry() method'unun EN BAŞI

async redriveDlqEntry(
  @Param('dlqId') dlqId: string,
  @Req() req: Request,
): Promise<DlqRedriveResponseDto> {
  // Step 0: Kill-switch (SHORT-CIRCUIT)
  if (isRedriveDisabled()) {
    redriveDisabledMetric.inc();
    throw new ServiceUnavailableException({
      code: 'REDRIVE_DISABLED',
      message: 'Redrive is temporarily disabled by operator',
      retryable: false,
    });
  }

  // ... mevcut flow (Step 1–11) değişmez ...
}
```

```typescript
// redrive-kill-switch.ts

/**
 * Check if redrive is disabled via environment variable.
 * LOCKED: Config flag name = REDRIVE_DISABLED
 *
 * Reads process.env.REDRIVE_DISABLED at call time.
 * Values: 'true' (case-insensitive) → disabled; anything else → enabled.
 */
export function isRedriveDisabled(): boolean {
  return process.env.REDRIVE_DISABLED?.toLowerCase() === 'true';
}
```

**Neden inline check (guard değil)?**
- Tek endpoint'e uygulanır — guard overhead gereksiz
- `POST /resolve` etkilenmemeli — guard scope'u daraltmak karmaşıklık ekler
- Test'te `process.env` mock'u yeterli — DI gerektirmez

### 2. TX Duration Measurement

`atomicRedrive` çağrısı `try/finally` ile sarılır. Outcome ne olursa olsun (success, DlqRedriveError, unexpected error) histogram observe edilir.

```typescript
// manifest-admin.controller.ts — atomicRedrive çağrısı etrafında

// Step 8: TX duration start
const txStart = Date.now();
try {
  // Step 9: atomicRedrive (mevcut — değişmez)
  const { dlqEntry: updatedDlqEntry, newJobId } = await this.dlqRepo.atomicRedrive(
    dlqId,
    redrivenBy,
    null,
    { now, nextAllowedRedriveAt: backoffResult.nextAllowedAt },
  );

  // ... success metrics + audit (mevcut) ...
} finally {
  // Step 10: observe ALWAYS — tek yer, tek sefer, her outcome (success/reject/error)
  redriveTxDurationHistogram.observe((Date.now() - txStart) / 1000);
}
```

**Neden `try/finally` pattern?**
- Observe tek yerden — double-observe riski sıfır
- `finally` bloğu commit, rollback, DlqRedriveError, unexpected error hepsinde çalışır
- Success path'te observe'dan sonra ek işlem (metrics, audit) `try` bloğunda kalır — `finally` sadece duration observe eder

**Ölçüm hassasiyeti:** `Date.now()` ms çözünürlük — tx süreleri tipik 10–500ms aralığında, ms yeterli. `process.hrtime()` gereksiz hassasiyet.

### 3. Metrik Tanımları

```typescript
// carrier-lifecycle-metrics.ts — Phase 12 eklentileri

/**
 * Histogram for atomicRedrive transaction duration (seconds).
 * Measures: tx begin → commit/rollback (Date.now() delta).
 * Labels: none (outcome ayrımı mevcut counter'lardan cross-query ile yapılır).
 * Emitted on EVERY atomicRedrive call — success, reject, error.
 *
 * Buckets: standard HTTP latency buckets (seconds).
 *
 * Phase 12: Redrive Operational Safeguards
 */
export const redriveTxDurationHistogram = new SimpleHistogram(
  'carrier_redrive_tx_duration_seconds',
  'atomicRedrive transaction duration in seconds',
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);
```

```typescript
/**
 * Gauge for kill-switch state (0 = off, 1 = on).
 * Labels: none.
 * Set at application startup based on REDRIVE_DISABLED env var.
 * Runtime'da her request'te güncellenmez — statik flag.
 *
 * Phase 12: Redrive Operational Safeguards
 */
class SimpleGauge {
  private value = 0;

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  set(value: number): void {
    this.value = value;
  }

  get(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}

export const redriveKillSwitchGauge = new SimpleGauge(
  'carrier_redrive_kill_switch_active',
  'Redrive kill-switch state (0=off, 1=on)',
);
```

```typescript
/**
 * Counter for redrive requests rejected by kill-switch (503).
 * Labels: none.
 *
 * Phase 12: Redrive Operational Safeguards
 */
export const redriveDisabledMetric = new SimpleCounter(
  'carrier_redrive_disabled_total',
  'Redrive requests rejected by kill-switch',
  [],
);
```

### 4. Gauge Lifecycle

```typescript
// Gauge initialization — controller constructor veya module onModuleInit

// Option B: NestJS OnModuleInit lifecycle hook'unda (LOCKED — tercih edilen)
onModuleInit() {
  redriveKillSwitchGauge.set(isRedriveDisabled() ? 1 : 0);
}
```

**Lifecycle kararı (LOCKED):**
- Gauge `onModuleInit()` lifecycle hook'unda set edilir — controller constructor'dan daha güvenli (DI tam hazır, lazy init riski yok)
- Config reload mekanizması yok — env var değişikliği restart gerektirir (Kubernetes pod restart / rolling update)
- Runtime'da gauge güncellenmez — her request'te `process.env` okunur ama gauge sadece init'te set edilir
- Bu, gauge'ın "son bilinen durum" göstermesi anlamına gelir — restart olmadan env değişirse gauge stale kalır ama `isRedriveDisabled()` doğru çalışır

**Alternatif (scope dışı):** Her request'te gauge güncellemek — gereksiz overhead, env var zaten her çağrıda okunuyor.

### 5. resetAllMetrics() Güncellemesi

```typescript
export function resetAllMetrics(): void {
  // ... mevcut metrikler (Phase 10.5 – 11.4) ...

  // Phase 12: Operational safeguards
  redriveTxDurationHistogram.reset();
  redriveKillSwitchGauge.reset();
  redriveDisabledMetric.reset();
}
```

## Metrik Contract (LOCKED)

| Metrik | Tip | Labels | Cardinality | Emission |
|---|---|---|---|---|
| `carrier_redrive_tx_duration_seconds` | Histogram | none | 1 | Her `atomicRedrive` çağrısı (success + error) |
| `carrier_redrive_kill_switch_active` | Gauge | none | 1 | Startup'ta set (0 veya 1) |
| `carrier_redrive_disabled_total` | Counter | none | 1 | Kill-switch 503 dönüşünde |

**Mevcut metrikler değişmez** (Phase 11.4 LOCKED backward compat).

## Hata / Yanıt Matrisi (Phase 12 Eklentisi)

| Durum | HTTP | Code | Mutasyon | Gate |
|---|---|---|---|---|
| Kill-switch aktif | 503 | `REDRIVE_DISABLED` | Yok (short-circuit) | Controller Step 0 |

> Mevcut 409 yanıtları (RATE_LIMITED, DEPTH_EXCEEDED, vb.) değişmez.

## Doğruluk Özellikleri (Correctness Properties)

### Property 1: Kill-Switch Short-Circuit (INV-12.1)

*For any* request where `REDRIVE_DISABLED=true`, controller SHALL return 503 without calling `getById`, `enforceRedriveDepthLimit`, `checkRateLimit`, `computeNextAllowedAt`, `cloneCarrierForRedrive`, `enforceCarrierSizeLimit`, or `atomicRedrive`. Zero downstream side effects.

**Validates: Requirements 2.2, 2.4, 5.4**

### Property 2: TX Duration Always Observed (INV-12.2)

*For any* `atomicRedrive` call that completes (success), throws `DlqRedriveError` (reject), or throws unexpected error, the tx duration histogram SHALL be observed exactly once with a non-negative value.

**Validates: Requirements 1.1, 1.5**

### Property 3: Kill-Switch Scope Isolation (INV-12.3)

*For any* request to read-only DLQ endpoints (GET /dlq, GET /retry/dlq) or POST /dlq/:dlqId/resolve, kill-switch state SHALL NOT affect the response — these endpoints always operate normally regardless of `REDRIVE_DISABLED` value.

**Validates: Requirements 2.5, 2.6**

## Test Stratejisi (Testing Strategy)

**Kütüphane:** Jest (mevcut projede kullanılan test framework'ü)

### Unit Tests

1. **Kill-switch 503 test:** `process.env.REDRIVE_DISABLED = 'true'` → `redriveDlqEntry()` → 503 + `REDRIVE_DISABLED` code + `atomicRedrive` çağrılmamış
2. **Kill-switch off regression:** `process.env.REDRIVE_DISABLED = undefined` → mevcut davranış korunur (200 success path)
3. **Kill-switch gauge test:** init sonrası gauge = 1 (flag on) veya 0 (flag off)
4. **Kill-switch counter test:** 503 dönüşünde `carrier_redrive_disabled_total` artmış
5. **TX duration success test:** başarılı `atomicRedrive` sonrası histogram'da en az 1 observe var
6. **TX duration error test:** `atomicRedrive` hata fırlatınca histogram'da yine observe var (try/finally)
7. **TX duration reject test:** `atomicRedrive` RATE_LIMITED fırlatınca histogram observe var
