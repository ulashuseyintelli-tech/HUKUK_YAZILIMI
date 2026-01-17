# Design Document: Explainable Policy Preview

## Overview

Bu tasarım, policy kararlarının (PASS/WARN/BLOCK) arkasındaki gerekçeleri kullanıcıya açıklayan bir katman ekler. Mevcut `CalcPreviewService` → `PolicyEngine.softCheck()` akışına entegre olur, ancak karar mekanizmasını DEĞİŞTİRMEZ.

**Temel Prensip:** Açıklama üretimi, karar üretiminden AYRI bir adımdır. PolicyEngine kararı verir, ExplanationService açıklar.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CalcPreviewService                                   │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │ InterestEngine  │    │   FeeEngine     │    │  PolicyEngine   │          │
│  │   .preview()    │    │   .preview()    │    │  .softCheck()   │          │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘          │
│           │                      │                      │                    │
│           │                      │                      ▼                    │
│           │                      │             ┌─────────────────┐          │
│           │                      │             │ PolicySoftCheck │          │
│           │                      │             │    Result       │          │
│           │                      │             │ {outcome,       │          │
│           │                      │             │  reasons[]}     │          │
│           │                      │             └────────┬────────┘          │
│           │                      │                      │                    │
│           │                      │                      ▼                    │
│           │                      │             ┌─────────────────┐          │
│           │                      │             │ Explanation     │ ◄── NEW  │
│           │                      │             │   Service       │          │
│           │                      │             │ .explain()      │          │
│           │                      │             └────────┬────────┘          │
│           │                      │                      │                    │
│           │                      │                      ▼                    │
│           │                      │             ┌─────────────────┐          │
│           │                      │             │ PolicyPreview   │          │
│           │                      │             │ {outcome,       │          │
│           │                      │             │  reasons[],     │          │
│           │                      │             │  explanations[]}│ ◄── NEW  │
│           │                      │             └────────┬────────┘          │
│           │                      │                      │                    │
│           └──────────────────────┼──────────────────────┘                    │
│                                  │                                           │
│                                  ▼                                           │
│                    ┌─────────────────────────┐                              │
│                    │   CalcPreviewResponse   │                              │
│                    │   + policy.explanations │                              │
│                    └─────────────────────────┘                              │
│                                  │                                           │
│                                  ▼                                           │
│                    ┌─────────────────────────┐                              │
│                    │     TraceCollector      │                              │
│                    │ POLICY_EXPLANATION_     │                              │
│                    │ GENERATED event         │                              │
│                    └─────────────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ExplanationService

```typescript
// calc-preview/explanation/explanation.service.ts

@Injectable()
export class ExplanationService {
  constructor(
    private readonly reasonCodeRegistry: ReasonCodeRegistry,
    private readonly traceCollector: TraceCollectorService,
    private readonly metricsService: CalcPreviewMetricsService,
  ) {}

  /**
   * PolicyEngine sonucunu açıklamalara çevirir
   * @param softCheckResult - PolicyEngine'den gelen sonuç
   * @returns Açıklamalar dizisi (boş olabilir, null OLMAZ)
   */
  explain(softCheckResult: PolicySoftCheckResult): ExplanationResult {
    try {
      const explanations = this.generateExplanations(softCheckResult);
      const enforced = this.enforceInvariant(softCheckResult.outcome, explanations);
      
      this.emitTraceEvent(softCheckResult, enforced);
      
      return {
        explanations: enforced,
        degraded: false,
      };
    } catch (error) {
      return this.handleDegradedMode(softCheckResult, error);
    }
  }

  private generateExplanations(result: PolicySoftCheckResult): PolicyExplanation[] {
    if (result.outcome === 'PASS') {
      return []; // PASS için açıklama yok
    }

    return result.reasons.map(reason => {
      const entry = this.reasonCodeRegistry.get(reason.code);
      
      if (!entry) {
        this.metricsService.incrementCounter('explanation_unknown_code', { code: reason.code });
        return this.createFallbackExplanation(reason.code);
      }

      return {
        reasonCode: reason.code,
        message: entry.messageTr,
        severity: entry.severity,
        suggestedAction: entry.suggestedAction,
        sourceRule: entry.sourceRule,
      };
    });
  }

  private enforceInvariant(
    outcome: PolicyOutcome,
    explanations: PolicyExplanation[],
  ): PolicyExplanation[] {
    // CORE INVARIANT: BLOCK → explanations.length > 0
    if (outcome === 'BLOCK' && explanations.length === 0) {
      this.logger.critical('[ExplanationService] INVARIANT VIOLATION: BLOCK with no explanations');
      this.metricsService.incrementCounter('explanation_fallback_used');
      
      return [{
        reasonCode: 'UNKNOWN_BLOCK_REASON',
        message: 'İşlem engellenmiştir. Detaylı bilgi için destek ekibiyle iletişime geçin.',
        severity: 'ERROR',
        suggestedAction: 'Destek talebi oluşturun veya 0850 XXX XX XX numaralı hattı arayın.',
      }];
    }

    // Severity'ye göre sırala: ERROR > WARNING > INFO
    return this.sortBySeverity(explanations);
  }

  private sortBySeverity(explanations: PolicyExplanation[]): PolicyExplanation[] {
    const severityOrder = { ERROR: 0, WARNING: 1, INFO: 2 };
    return [...explanations].sort((a, b) => 
      severityOrder[a.severity] - severityOrder[b.severity]
    );
  }

  private createFallbackExplanation(code: string): PolicyExplanation {
    return {
      reasonCode: code,
      message: 'Bu kural hakkında detaylı bilgi mevcut değil.',
      severity: 'WARNING',
      suggestedAction: 'Lütfen destek ekibiyle iletişime geçin.',
    };
  }

  private handleDegradedMode(
    result: PolicySoftCheckResult,
    error: Error,
  ): ExplanationResult {
    this.logger.error('[ExplanationService] Degraded mode', { error: error.message });
    this.metricsService.incrementCounter('explanation_degraded');
    
    this.traceCollector.addEvent({
      eventType: 'POLICY_EXPLANATION_FAILED',
      timestamp: new Date().toISOString(),
      error: error.message,
      policyOutcome: result.outcome,
    });

    return {
      explanations: [{
        reasonCode: 'EXPLANATION_SERVICE_UNAVAILABLE',
        message: 'Açıklama servisi geçici olarak kullanılamıyor.',
        severity: 'WARNING',
        suggestedAction: 'Lütfen daha sonra tekrar deneyin.',
      }],
      degraded: true,
    };
  }

  private emitTraceEvent(
    result: PolicySoftCheckResult,
    explanations: PolicyExplanation[],
  ): void {
    const severityCounts = {
      error: explanations.filter(e => e.severity === 'ERROR').length,
      warning: explanations.filter(e => e.severity === 'WARNING').length,
      info: explanations.filter(e => e.severity === 'INFO').length,
    };

    this.traceCollector.addEvent({
      eventType: 'POLICY_EXPLANATION_GENERATED',
      timestamp: new Date().toISOString(),
      policyOutcome: result.outcome,
      explanationCount: explanations.length,
      reasonCodes: explanations.map(e => e.reasonCode),
      severityCounts,
      fallbackUsed: explanations.some(e => e.reasonCode === 'UNKNOWN_BLOCK_REASON'),
    });
  }
}
```

### 2. ReasonCodeRegistry

```typescript
// calc-preview/explanation/reason-code-registry.ts

export interface ReasonCodeEntry {
  code: string;
  messageKey: string;           // i18n key for future
  messageTr: string;            // Turkish message
  severity: 'INFO' | 'WARNING' | 'ERROR';
  suggestedAction: string;
  sourceRule?: string;
}

@Injectable()
export class ReasonCodeRegistry {
  private readonly registry: Map<string, ReasonCodeEntry>;

  constructor() {
    this.registry = new Map(MVP_REASON_CODES.map(entry => [entry.code, entry]));
  }

  get(code: string): ReasonCodeEntry | undefined {
    return this.registry.get(code);
  }

  has(code: string): boolean {
    return this.registry.has(code);
  }

  getAllCodes(): string[] {
    return Array.from(this.registry.keys());
  }
}

// MVP Reason Codes
export const MVP_REASON_CODES: ReasonCodeEntry[] = [
  {
    code: 'STATUTE_OF_LIMITATIONS',
    messageKey: 'policy.statute_of_limitations',
    messageTr: 'Zamanaşımı süresi dolmuş olabilir. Alacağın zamanaşımı durumunu kontrol edin.',
    severity: 'ERROR',
    suggestedAction: 'Zamanaşımı süresini hesaplayın veya hukuki danışmanlık alın.',
    sourceRule: 'TBK m.146-161',
  },
  {
    code: 'INVALID_CLAIM_TYPE',
    messageKey: 'policy.invalid_claim_type',
    messageTr: 'Seçilen alacak türü bu işlem için geçerli değil.',
    severity: 'ERROR',
    suggestedAction: 'Alacak türünü kontrol edin ve uygun türü seçin.',
    sourceRule: 'ClaimTypeValidator',
  },
  {
    code: 'AMOUNT_EXCEEDS_LIMIT',
    messageKey: 'policy.amount_exceeds_limit',
    messageTr: 'Talep edilen tutar izin verilen üst limiti aşıyor.',
    severity: 'ERROR',
    suggestedAction: 'Tutarı kontrol edin veya birden fazla takip açmayı değerlendirin.',
    sourceRule: 'AmountLimitValidator',
  },
  {
    code: 'MISSING_REQUIRED_FIELD',
    messageKey: 'policy.missing_required_field',
    messageTr: 'Zorunlu alanlardan biri eksik.',
    severity: 'ERROR',
    suggestedAction: 'Tüm zorunlu alanları doldurun.',
    sourceRule: 'RequiredFieldValidator',
  },
  {
    code: 'DATE_RANGE_INVALID',
    messageKey: 'policy.date_range_invalid',
    messageTr: 'Tarih aralığı geçersiz. Başlangıç tarihi bitiş tarihinden sonra olamaz.',
    severity: 'ERROR',
    suggestedAction: 'Tarihleri kontrol edin ve düzeltin.',
    sourceRule: 'DateRangeValidator',
  },
  {
    code: 'HIGH_INTEREST_RATE_WARNING',
    messageKey: 'policy.high_interest_rate',
    messageTr: 'Hesaplanan faiz oranı normalden yüksek görünüyor.',
    severity: 'WARNING',
    suggestedAction: 'Faiz türünü ve oranını doğrulayın.',
    sourceRule: 'InterestRateValidator',
  },
  {
    code: 'DEBTOR_COUNT_WARNING',
    messageKey: 'policy.debtor_count',
    messageTr: 'Borçlu sayısı yüksek. Harç hesaplaması etkilenebilir.',
    severity: 'INFO',
    suggestedAction: 'Harç tutarını kontrol edin.',
    sourceRule: 'DebtorCountValidator',
  },
];
```

### 3. CalcPreviewService Integration

```typescript
// calc-preview/calc-preview.service.ts (modification)

@Injectable()
export class CalcPreviewService {
  constructor(
    // ... existing dependencies
    private readonly explanationService: ExplanationService, // NEW
  ) {}

  async preview(request: CalcPreviewRequest): Promise<CalcPreviewResponse> {
    // ... existing code for interest and fee

    // Policy check (existing)
    const policyResult = await this.policyEngine.softCheck(policyInput);

    // NEW: Generate explanations
    const explanationResult = this.explanationService.explain(policyResult);

    // Build response with explanations
    return {
      // ... existing fields
      policy: {
        outcome: policyResult.outcome,
        reasons: policyResult.reasons,
        explanations: explanationResult.explanations,  // NEW
      },
      explanationsDegraded: explanationResult.degraded, // NEW
    };
  }
}
```

## Data Models

### PolicyExplanation

```typescript
export interface PolicyExplanation {
  reasonCode: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  suggestedAction: string;
  sourceRule?: string;
}
```

### ExplanationResult

```typescript
export interface ExplanationResult {
  explanations: PolicyExplanation[];
  degraded: boolean;
}
```

### PolicyPreviewData (Enhanced)

```typescript
export interface PolicyPreviewData {
  outcome: 'PASS' | 'WARN' | 'BLOCK';
  reasons: PolicyReason[];
  explanations: PolicyExplanation[];  // NEW
}
```

### Trace Event Payloads

```typescript
export interface PolicyExplanationGeneratedEvent {
  eventType: 'POLICY_EXPLANATION_GENERATED';
  timestamp: string;
  policyOutcome: 'PASS' | 'WARN' | 'BLOCK';
  explanationCount: number;
  reasonCodes: string[];
  severityCounts: {
    error: number;
    warning: number;
    info: number;
  };
  fallbackUsed: boolean;
}

export interface PolicyExplanationFailedEvent {
  eventType: 'POLICY_EXPLANATION_FAILED';
  timestamp: string;
  error: string;
  policyOutcome: 'PASS' | 'WARN' | 'BLOCK';
}
```

## Degraded Path Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEGRADED PATH FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CalcPreviewService                                                          │
│       │                                                                      │
│       ▼                                                                      │
│  PolicyEngine.softCheck()                                                    │
│       │                                                                      │
│       ▼ (success: {outcome: BLOCK, reasons: [...]})                         │
│       │                                                                      │
│  ExplanationService.explain()                                                │
│       │                                                                      │
│       ├──────────────────────────────────────────────────────────┐          │
│       │ HAPPY PATH                                                │          │
│       │                                                           │          │
│       ▼                                                           │          │
│  generateExplanations()                                           │          │
│       │                                                           │          │
│       ▼                                                           │          │
│  enforceInvariant()                                               │          │
│       │                                                           │          │
│       ├─── BLOCK + explanations.length > 0 ───▶ ✅ PASS          │          │
│       │                                                           │          │
│       └─── BLOCK + explanations.length = 0 ───▶ ⚠️ ADD FALLBACK  │          │
│            │                                                      │          │
│            ▼                                                      │          │
│       Log CRITICAL + emit metric + return fallback                │          │
│                                                                   │          │
│       ├──────────────────────────────────────────────────────────┘          │
│       │ ERROR PATH (catch block)                                             │
│       │                                                                      │
│       ▼                                                                      │
│  handleDegradedMode()                                                        │
│       │                                                                      │
│       ├─── Log ERROR                                                         │
│       ├─── Emit 'explanation_degraded' metric                                │
│       ├─── Emit POLICY_EXPLANATION_FAILED trace event                        │
│       │                                                                      │
│       ▼                                                                      │
│  Return {                                                                    │
│    explanations: [DEGRADED_EXPLANATION],                                     │
│    degraded: true                                                            │
│  }                                                                           │
│       │                                                                      │
│       ▼                                                                      │
│  CalcPreviewResponse                                                         │
│  {                                                                           │
│    policy: { outcome, reasons, explanations },                               │
│    explanationsDegraded: true  ◄── Frontend bunu görür                      │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Trace Event Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TRACE EVENT LIFECYCLE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. PRODUCER: ExplanationService                                             │
│     ├── emitTraceEvent() called after explanation generation                 │
│     └── Creates PolicyExplanationGeneratedEvent or PolicyExplanationFailed   │
│                                                                              │
│  2. COLLECTOR: TraceCollectorService                                         │
│     ├── addEvent() receives the event                                        │
│     ├── Validates event structure                                            │
│     ├── Adds to current trace context                                        │
│     └── Applies sampling rules                                               │
│                                                                              │
│  3. STORAGE: TraceStorageService                                             │
│     ├── Persists trace bundle (if sampled)                                   │
│     ├── Applies retention policy                                             │
│     └── Indexes by traceId, tenantId, timestamp                              │
│                                                                              │
│  4. CONSUMER: Trace API / Ops Dashboard                                      │
│     ├── GET /calc/trace/:traceId                                             │
│     ├── Filter by eventType = 'POLICY_EXPLANATION_GENERATED'                 │
│     └── Audit: who saw what explanation, when                                │
│                                                                              │
│  EVENT TIMING:                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Request Start ──▶ PolicyCheck ──▶ Explanation ──▶ TraceEvent ──▶ End │   │
│  │      t0              t1              t2              t3          t4   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  PII PROTECTION:                                                             │
│  ├── reasonCodes: ✅ (no PII)                                                │
│  ├── explanationCount: ✅ (no PII)                                           │
│  ├── severityCounts: ✅ (no PII)                                             │
│  ├── message: ❌ NOT INCLUDED (too verbose + potential PII in future)        │
│  └── suggestedAction: ❌ NOT INCLUDED (too verbose)                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: PASS Outcome Returns Empty Explanations

*For any* policy check result with outcome PASS, the ExplanationService SHALL return an empty explanations array.

**Validates: Requirements 1.3, 3.3**

### Property 2: BLOCK/WARN Outcome Returns Non-Empty Explanations (Core Invariant)

*For any* policy check result with outcome BLOCK or WARN, the ExplanationService SHALL return a non-empty explanations array (length > 0).

**Validates: Requirements 3.4, 6.1, 6.3**

### Property 3: Unknown Code Returns Fallback Explanation

*For any* reason code not in the ReasonCodeRegistry, the ExplanationService SHALL return a fallback explanation with the original code preserved.

**Validates: Requirements 2.2**

### Property 4: Explanations Ordered by Severity

*For any* explanations array with multiple items, items SHALL be ordered by severity: ERROR first, then WARNING, then INFO.

**Validates: Requirements 3.2**

### Property 5: Trace Event Emitted on Generation

*For any* successful explanation generation, a POLICY_EXPLANATION_GENERATED trace event SHALL be emitted with the correct payload structure.

**Validates: Requirements 4.1, 4.2**

### Property 6: Trace Event Contains No PII

*For any* trace event emitted by ExplanationService, the payload SHALL NOT contain PII fields (debtor names, TCKN, addresses, phone, email).

**Validates: Requirements 4.4**

### Property 7: Degraded Mode Preserves Policy Outcome

*For any* ExplanationService failure, the CalcPreviewResponse SHALL still contain the original policy outcome (PASS/WARN/BLOCK) and the explanationsDegraded flag SHALL be true.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

## Error Handling

| Error Type | Handling | Metric | Log Level |
|------------|----------|--------|-----------|
| Unknown reason code | Return fallback explanation | `explanation_unknown_code` | WARN |
| Invariant violation (BLOCK + empty) | Add fallback + continue | `explanation_fallback_used` | CRITICAL |
| ExplanationService exception | Degraded mode | `explanation_degraded` | ERROR |
| ReasonCodeRegistry not initialized | Degraded mode | `explanation_degraded` | ERROR |

## Testing Strategy

### Unit Tests
- ReasonCodeRegistry: all MVP codes exist, get/has methods work
- ExplanationService: each method in isolation
- Severity sorting: edge cases (empty, single, all same severity)

### Property-Based Tests
- Property 1-7 as defined above
- Minimum 100 iterations per property
- Use fast-check for TypeScript

### Integration Tests
- CalcPreviewService → ExplanationService → TraceCollector flow
- Degraded mode end-to-end
- Response structure validation

### Contract Tests
- Add PolicyExplanation to policy-engine contract
- Verify explanations field in CalcPreviewResponse
