# Phase 8: What-if Simulation + Condition-based Escalation — Design

## 1. Bileşenler

### 1.1 DiagnosticsAggregator

Kaynaklardan metric toplar (Prometheus/app metrics).

**Sorumluluklar:**
- EvidencePoint üretir: value, confidence, freshnessSec, timestamp, windowSec
- Metric source abstraction sağlar
- Confidence hesaplama

### 1.2 SnapshotStore

Evidence snapshot'larını persist eder.

```typescript
interface SnapshotStore {
  save(snapshot: EvidenceSnapshot): Promise<string>;
  get(snapshotId: string): Promise<EvidenceSnapshot | null>;
  listByIncident(incidentId: string): Promise<EvidenceSnapshot[]>;
  markPromoted(snapshotId: string): Promise<void>;
  deleteExpired(): Promise<number>; // cleanup job için
}
```

**TTL Cleanup Job:**
- Default retention: 72h
- Promoted snapshots: ayrı retention (örn. 7 gün)
- Periyodik cleanup

### 1.3 SimulationStore

Simülasyon sonuçlarını persist eder.

```typescript
type SimulationStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_TIMEOUT'
  | 'FAILED'
  | 'BLOCKED_EVIDENCE_GATE';

interface SimulationStore {
  save(result: SimulationResult): Promise<void>;
  get(simulationId: string): Promise<SimulationResult | null>;
  listByTenant(
    tenantId: string,
    options?: { status?: SimulationStatus; limit?: number }
  ): Promise<SimulationResult[]>;
  updateStatus(simulationId: string, status: SimulationStatus): Promise<void>;
}
```

### 1.4 EvidenceGate (Gate #1)

Snapshot kalitesini değerlendirir.

**Input:** EvidenceSnapshot

**Output:**
- flags[] (LOW_CONFIDENCE, STALE_DATA, STALE_EVIDENCE)
- allowAutoEscalation
- allowPromote

**Hard Rule:** allow=false ise downstream gate'ler çalışmaz.

**EvidenceGate Fail Davranışı:**
```typescript
// EvidenceGate fail olduğunda response:
{
  scenarios: [],
  ranking: [],
  blockedReason: "EVIDENCE_GATE_FAILED",
  blockedFlags: ["LOW_CONFIDENCE", "STALE_DATA"], // tetiklenen flag'ler
  autoEscalationAllowed: false,
  promoteAllowed: false
}
```

### 1.5 PlaybookRegistry + ImpactHeuristicRegistry

- Playbook YAML parse eder
- Action içindeki expectedImpact alanlarını registry'ye koyar

**YAML Örneği:**
```yaml
actions:
  - type: increase_timeout
    params: { factor: 1.2 }
    expectedImpact:
      error_rate: { direction: decrease, confidence: 0.7 }
      latency_p99: { direction: increase, confidence: 0.9 }
```

### 1.6 SimulationEngine

**Özellikler:**
- Side-effect yok: SimulationContext(mode=dry_run, MockActionExecutor, SimulatedClock)
- Deterministik: seed ile ordering/jitter senkronize

**Çıktı:** Scenario[] + ScenarioRanking[] + flags[]

### 1.6.1 Seed-based Determinism (Sprint 2)

```typescript
/**
 * Mulberry32 PRNG - fast, deterministic, good distribution
 * Same seed → same sequence of random numbers
 */
function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

interface ISimulationEngine {
  simulate(input: SimulationInput): Promise<SimulationOutput>;
}

interface SimulationInput {
  incidentId: string;
  tenantId: string;
  config: SimulationOptions;
  seed: number;
  baselineSnapshot?: EvidenceSnapshot;
}

interface SimulationOutput {
  runId: string;
  snapshots: EvidenceSnapshot[];
  driftScore: number;
  verdict: 'PROCEED' | 'BLOCK_DRIFT' | 'BLOCK_EVIDENCE' | 'BLOCK_POLICY';
  evidenceChain: EvidenceChain;
  scenarios: Scenario[];
  ranking: ScenarioRanking[];
  compute: ComputeInfo;
}
```

**Seed Etki Alanı:**
- Action ordering tiebreaks (aynı priority'de sıralama)
- Scenario generation order
- Jitter values (if any)
- NOT affected: metric values, timestamps, external data

**Determinism Guarantee:**
```typescript
// Test: 10 runs with same seed → same hash
const results = [];
for (let i = 0; i < 10; i++) {
  const result = await engine.simulate(input);
  results.push(hash(result));
}
expect(new Set(results).size).toBe(1); // all same
```

### 1.7 ScenarioRanker

- riskScore ve expectedImpact üzerinden sıralar
- Tradeoff metni üretir ("daha düşük risk ama latency artışı" gibi)
- Dominance: Pareto (riskScore düşük + negatif etkiler az)

### 1.8 ConditionEscalationEvaluator

- Hysteresis + stable window + de-escalation destekler
- EvidenceGate fail ise auto escalation üretemez

### 1.9 PromoteService (Drift Guard)

1. Fresh snapshot alır
2. SnapshotComparisonUtils ile driftScore hesaplar
3. Drift threshold aşılırsa promote bloklar ve resimulate önerir
4. Aşılmazsa Phase 7 run endpoint'ine execution request üretir

### 1.10 Audit (PlaybookAuditService)

Simulation event tipleri:
- SIMULATION_CREATED
- SIMULATION_COMPLETED
- SIMULATION_PROMOTE_REQUESTED
- SIMULATION_PROMOTE_BLOCKED
- SIMULATION_PROMOTED

---

## 2. Veri Modelleri

### 2.1 EvidencePoint

```typescript
interface EvidencePoint {
  metric: MetricType;
  value: number;
  unit: string; // '%', 'ms', 'count', 'ratio'
  windowSec: number;
  confidence: number; // 0..1
  freshnessSec: number;
  source: 'prometheus' | 'app_metrics' | 'synthetic';
  timestamp: string; // ISO
}

type MetricType =
  | 'error_rate'
  | 'latency_p95'
  | 'latency_p99'
  | 'saturation_cpu'
  | 'queue_depth'
  | 'slo_burn_rate';
```

### 2.2 EvidenceSnapshot

```typescript
interface EvidenceSnapshot {
  snapshotId: string;
  tenantId: string;
  incidentId: string;
  capturedAt: string; // ISO
  points: EvidencePoint[];
  promoted?: boolean;
  derived?: {
    trend?: 'increasing' | 'decreasing' | 'stable';
    variance?: number;
  };
}
```

### 2.3 AssumptionSpec (Structured)

```typescript
type AssumptionType = 'constant' | 'linear_decay' | 'spike';

interface AssumptionSpec {
  metric: string;
  type: AssumptionType;
  value: number;
  durationSec: number;
  params?: {
    endValue?: number;       // linear_decay için
    spikeValue?: number;     // spike için
    spikeAtSec?: number;
    decayHalfLifeSec?: number;
  };
}
```

### 2.4 SimulationOptions

```typescript
interface SimulationOptions {
  timeHorizonSec: number;
  assumptions: AssumptionSpec[];
  seed: number;
  evidenceSnapshotId?: string;
  maxComputeTimeSec?: number; // default 30, max 120
}
```

### 2.5 SimulationResult

```typescript
interface SimulationResult {
  simulationId: string;
  tenantId: string;
  incidentId: string;
  status: SimulationStatus;
  evidenceSnapshotAt: string;
  snapshotAgeSec: number;
  flags: EvidenceFlag[];
  autoEscalationAllowed: boolean;
  promoteAllowed: boolean;
  scenarios: Scenario[];
  ranking: ScenarioRanking[];
  counterfactuals: Counterfactual[];
  counterfactualPolicyApplied: CounterfactualPolicyConfig;
  blockedReason?: string;
  blockedFlags?: EvidenceFlag[];
  compute: {
    startedAt: string;
    finishedAt?: string;
    computeTimeSec?: number;
    timedOut: boolean;
    completedScenarios: number;
    totalScenarios: number;
  };
  createdAt: string;
}

type EvidenceFlag = 'LOW_CONFIDENCE' | 'STALE_DATA' | 'STALE_EVIDENCE';
```

### 2.6 CounterfactualPolicyConfig

```typescript
type CounterfactualCategory =
  | 'MISSING_SIGNAL'
  | 'INSUFFICIENT_HISTORY'
  | 'CONFLICTING_SIGNALS'
  | 'ASSUMPTION_SENSITIVE';

interface CounterfactualPolicyConfig {
  blockAutoPromoteOn: CounterfactualCategory[];
  blockAutoEscalationOn: CounterfactualCategory[];
  warnOnlyOn: CounterfactualCategory[];
}

// Defaults
const DEFAULT_COUNTERFACTUAL_POLICY: CounterfactualPolicyConfig = {
  blockAutoPromoteOn: ['CONFLICTING_SIGNALS', 'MISSING_SIGNAL'],
  blockAutoEscalationOn: ['CONFLICTING_SIGNALS', 'MISSING_SIGNAL'],
  warnOnlyOn: ['INSUFFICIENT_HISTORY', 'ASSUMPTION_SENSITIVE'],
};
```

### 2.7 EscalationRuleSpec (Revize)

```typescript
interface EscalationRuleSpec {
  metric: MetricType;
  threshold: number;
  stableForSec: number; // default 30
  hysteresisFactor: number; // default 0.8
  deEscalationThreshold?: number; // default = threshold * hysteresisFactor
  deEscalationStableForSec?: number; // default 30
  autoResolveOnDeEscalation?: boolean; // default false
  maxEscalations: number;
  minIntervalSec: number;
  requiresEvidenceGate: boolean; // true
}
```

### 2.8 Drift Config

```typescript
const DRIFT_WEIGHTS: Record<MetricType, number> = {
  error_rate: 2.0,
  slo_burn_rate: 2.0,
  latency_p99: 1.0,
  latency_p95: 1.0,
  saturation_cpu: 0.5,
  queue_depth: 0.5,
};

const DRIFT_THRESHOLD = 0.15; // 15% weighted drift, >= blocks
```

### 2.8.1 DriftResult (Sprint 2 - Explainability)

```typescript
interface MetricDrift {
  metric: MetricType;
  baselineValue: number;
  currentValue: number;
  relativeDrift: number;      // abs(new-old)/max(eps, old)
  weightedContribution: number; // relativeDrift * weight
  weight: number;
}

interface DriftResult {
  driftScore: number;           // RMS of weighted contributions
  shouldBlock: boolean;         // driftScore >= DRIFT_THRESHOLD
  noComparableMetrics: boolean; // true if no common metrics
  
  // Explainability
  topContributors: MetricDrift[]; // sorted DESC by weightedContribution
  commonMetrics: MetricType[];
  missingInBaseline: MetricType[];
  missingInCurrent: MetricType[];
  
  // Audit trail
  baselineSnapshotId: string;
  currentSnapshotId: string;
  calculatedAt: string; // ISO
}
```

### 2.8.2 EvidenceChain (Sprint 2)

```typescript
interface EvidenceChain {
  baselineSnapshotId: string;
  currentSnapshotId: string;
  driftResult: DriftResult;
  gateResult: EvidenceGateResult;
  verdict: 'PROCEED' | 'BLOCK_DRIFT' | 'BLOCK_EVIDENCE' | 'BLOCK_POLICY';
  verdictReason?: string;
}
```

### 2.8.3 RetentionPolicy (Sprint 2)

```typescript
type RetentionPolicy = 'STANDARD' | 'PROMOTED' | 'LEGAL_HOLD';

interface RetentionConfig {
  STANDARD: { hours: 72 };
  PROMOTED: { hours: 168 }; // 7 days
  LEGAL_HOLD: { hours: null }; // indefinite, manual delete only
}

interface StoredSnapshot extends EvidenceSnapshot {
  createdAt: string;
  expiresAt: string | null; // null for LEGAL_HOLD
  promoted: boolean;
  promotedAt?: string;
  retentionPolicy: RetentionPolicy;
}
```

### 2.9 Scenario & Ranking

```typescript
interface Scenario {
  scenarioId: string;
  matchedPlaybook: string;
  plannedActions: PlannedAction[];
  wouldBlock: boolean;
  blockReasons?: string[];
  estimatedDurationSec: number;
  riskScore: number; // 0..1
  expectedImpact: ExpectedImpactSummary;
  notificationPlan: NotificationPlan;
  escalationPlan: EscalationPlan;
}

interface ScenarioRanking {
  scenarioId: string;
  rank: number;
  dominates: string[]; // hangi senaryolardan kesin iyi
  tradeoffs: string[]; // "lower risk but higher latency impact"
}

interface ExpectedImpactSummary {
  error_rate?: { direction: 'increase' | 'decrease'; confidence: number };
  latency_p99?: { direction: 'increase' | 'decrease'; confidence: number };
  // ... diğer metrikler
}
```

### 2.10 SimulationContext

```typescript
interface SimulationContext {
  mode: 'dry_run';
  clock: SimulatedClock;
  evidence: EvidenceSnapshot;
  actionExecutor: MockActionExecutor;
  policy: ActionPolicyGuard;
  heuristics: ImpactHeuristicRegistry;
}

interface SimulatedClock {
  now(): Date;
  advance(seconds: number): void;
  reset(): void;
}

interface MockActionExecutor {
  execute(action: PlannedAction): MockExecutionResult;
}

interface MockExecutionResult {
  appliedEffects: Record<string, number>; // örn. { timeout: 1.2, rate_limit: 0.9 }
  estimatedDurationSec: number;
}
```

---

## 3. Akışlar

### 3.1 Create Simulation (POST /v1/simulations)

```
┌─────────────────────────────────────────────────────────────────┐
│                    POST /v1/simulations                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Tenant Scope    │
                    │ Doğrulama       │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Rate Limit      │
                    │ Check           │
                    │ concurrent<=3   │
                    │ daily<=100      │
                    └────────┬────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │ evidenceSnapshot│             │ Fresh Snapshot  │
    │ Id varsa yükle  │             │ Al + Store'a    │
    └────────┬────────┘             │ Yaz             │
              │                     └────────┬────────┘
              └───────────────┬───────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ EvidenceGate    │
                    │ Değerlendir     │
                    └────────┬────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │ FAIL            │             │ PASS            │
    │ scenarios: []   │             │ SimulationEngine│
    │ blockedReason   │             │ Çalıştır        │
    │ blockedFlags    │             └────────┬────────┘
    └────────┬────────┘                       │
              │                               ▼
              │                     ┌─────────────────┐
              │                     │ ScenarioRanker  │
              │                     │ Çalıştır        │
              │                     └────────┬────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Audit:          │
                    │ SIMULATION_     │
                    │ CREATED +       │
                    │ COMPLETED       │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Response:       │
                    │ SimulationResult│
                    └─────────────────┘
```

### 3.2 Promote (POST /v1/simulations/{id}/promote)

```
┌─────────────────────────────────────────────────────────────────┐
│              POST /v1/simulations/{id}/promote                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Audit:          │
                    │ PROMOTE_        │
                    │ REQUESTED       │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Fresh Snapshot  │
                    │ Al (capturedAt2)│
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ EvidenceGate    │
                    │ Check           │
                    └────────┬────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │ FAIL            │             │ PASS            │
    │ PROMOTE_BLOCKED │             │ Drift Compare   │
    │ reason=evidence │             └────────┬────────┘
    │ 409/422         │                       │
    └─────────────────┘                       ▼
                                    ┌─────────────────┐
                                    │ driftScore      │
                                    │ Hesapla         │
                                    └────────┬────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                              ▼                               ▼
                    ┌─────────────────┐             ┌─────────────────┐
                    │ driftScore >    │             │ driftScore <=   │
                    │ threshold       │             │ threshold       │
                    │ PROMOTE_BLOCKED │             │ Counterfactual  │
                    │ reason=drift    │             │ Policy Check    │
                    │ 409 + RESIMULATE│             └────────┬────────┘
                    └─────────────────┘                       │
                                                              ▼
                                                    ┌─────────────────┐
                                                    │ PASS            │
                                                    │ PROMOTED        │
                                                    │ Phase 7 Run     │
                                                    │ executionId     │
                                                    └─────────────────┘
```

### 3.3 Condition-based Escalation Evaluation

Her evaluation döngüsünde:
1. Snapshot al
2. EvidenceGate → allowAutoEscalation?
3. Hysteresis + stableForSec ile trigger/de-trigger
4. autoResolveOnDeEscalation opsiyonel
5. Runtime loop guard Phase 7'deki ile uyumlu

---

## 4. API Yüzeyi

### POST /v1/simulations

**Request:**
```typescript
interface CreateSimulationRequest {
  incidentId: string;
  options: SimulationOptions;
}
```

**Response:**
```typescript
interface CreateSimulationResponse {
  simulationId: string;
  status: SimulationStatus;
  evidenceSnapshotAt: string;
  snapshotAgeSec: number;
  flags: EvidenceFlag[];
  autoEscalationAllowed: boolean;
  promoteAllowed: boolean;
  scenarios: Scenario[];
  ranking: ScenarioRanking[];
  counterfactuals: Counterfactual[];
  blockedReason?: string;
  blockedFlags?: EvidenceFlag[];
  compute: ComputeInfo;
}
```

### GET /v1/simulations/{id}

**Response:** SimulationResult (full)

### POST /v1/simulations/{id}/promote

**Request:**
```typescript
interface PromoteRequest {
  scenarioId: string;
}
```

**Response:**
```typescript
interface PromoteResponse {
  accepted: boolean;
  reason?: string;
  driftScore: number;
  newEvidenceSnapshotAt: string;
  executionId?: string; // accepted ise
}
```

---

## 5. Konfigürasyon

### 5.1 Evidence Thresholds

```typescript
const EVIDENCE_CONFIG = {
  STALE_EVIDENCE_THRESHOLD_SEC: 60,
  STALE_DATA_THRESHOLD_SEC: 120,
  LOW_CONFIDENCE_THRESHOLD: 0.5,
  CRITICAL_METRICS: ['error_rate', 'slo_burn_rate', 'latency_p99'],
};
```

### 5.2 Simulation Limits

```typescript
const SIMULATION_LIMITS = {
  MAX_COMPUTE_TIME_SEC: 120,
  DEFAULT_COMPUTE_TIME_SEC: 30,
  MAX_CONCURRENT_PER_TENANT: 3,
  MAX_DAILY_PER_TENANT: 100,
};
```

### 5.3 Snapshot Retention

```typescript
const SNAPSHOT_RETENTION = {
  DEFAULT_HOURS: 72,
  PROMOTED_DAYS: 7,
  CLEANUP_INTERVAL_HOURS: 1,
};
```

---

## 6. Error Codes

| Code | Name | Description |
|------|------|-------------|
| 409 | DRIFT_TOO_HIGH | Promote sırasında drift threshold aşıldı |
| 409 | EVIDENCE_GATE_FAILED | Evidence kalitesi yetersiz |
| 422 | INVALID_ASSUMPTIONS | Structured assumption validation hatası |
| 429 | TOO_MANY_SIMULATIONS | Rate limit aşıldı |
| 408 | SIMULATION_TIMEOUT | Compute timeout |

---

## 8. Golden Scenarios (Sprint 2)

Test ve validation için 6 golden scenario:

### 8.1 Normal Scenario

**Input:**
- Full metric set (error_rate, latency_p99, slo_burn_rate, saturation_cpu, queue_depth)
- All metrics fresh (freshnessSec < 120)
- All metrics confident (confidence >= 0.5)
- Baseline and current snapshots with small drift

**Expected:**
- EvidenceGate: PASS
- driftScore: < 0.15
- verdict: PROCEED
- scenarios: non-empty
- ranking: sorted

### 8.2 Partial Metrics Scenario

**Input:**
- Baseline: error_rate, latency_p99, slo_burn_rate
- Current: error_rate, latency_p99 (missing slo_burn_rate)

**Expected:**
- driftScore calculated only on common metrics
- missingInCurrent: ['slo_burn_rate']
- commonMetrics: ['error_rate', 'latency_p99']
- topContributors: only common metrics

### 8.3 Explode Scenario (Edge Values)

**Input:**
- Baseline: error_rate = 0 (edge case for division)
- Current: error_rate = 0.001
- Other metrics: normal

**Expected:**
- No NaN/Infinity in driftScore
- eps (1e-9) prevents division by zero
- driftScore: finite number

### 8.4 Schema Drift Scenario

**Input:**
- Baseline: metric_v1, metric_v2
- Current: metric_v3, metric_v4 (completely different)

**Expected:**
- noComparableMetrics: true
- driftScore: 1.0 (maximum)
- commonMetrics: []
- verdict: BLOCK_DRIFT

### 8.5 Time Travel Scenario

**Input:**
- Snapshot with capturedAt > now (future timestamp)

**Expected:**
- Validation error or
- snapshotAgeSec: negative → treated as STALE_EVIDENCE
- EvidenceGate: FAIL

### 8.6 Stale Evidence Scenario

**Input:**
- Snapshot with capturedAt = now - 120 seconds

**Expected:**
- snapshotAgeSec: 120
- flags: ['STALE_EVIDENCE']
- EvidenceGate: FAIL
- verdict: BLOCK_EVIDENCE
- scenarios: []

---

## 9. Injectable Dependencies (Sprint 2)

### 9.1 ISimulationClock

```typescript
interface ISimulationClock {
  now(): Date;
  advanceSeconds(seconds: number): void;
  reset(to?: Date): void;
}

class RealSimulationClock implements ISimulationClock {
  now(): Date { return new Date(); }
  advanceSeconds(): void { /* no-op in real clock */ }
  reset(): void { /* no-op */ }
}

class FakeSimulationClock implements ISimulationClock {
  private current: Date;
  
  constructor(initial: Date = new Date()) {
    this.current = initial;
  }
  
  now(): Date { return new Date(this.current); }
  
  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
  
  reset(to?: Date): void {
    this.current = to || new Date();
  }
}
```

### 9.2 ISimulationScheduler

```typescript
interface ISimulationScheduler {
  schedule(callback: () => void, intervalMs: number): void;
  tick(): void; // manual tick for tests
  stop(): void;
}

class IntervalScheduler implements ISimulationScheduler {
  private intervalId?: NodeJS.Timeout;
  
  schedule(callback: () => void, intervalMs: number): void {
    this.intervalId = setInterval(callback, intervalMs);
  }
  
  tick(): void { /* no-op in real scheduler */ }
  
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}

class ManualTickScheduler implements ISimulationScheduler {
  private callback?: () => void;
  
  schedule(callback: () => void): void {
    this.callback = callback;
  }
  
  tick(): void {
    this.callback?.();
  }
  
  stop(): void {
    this.callback = undefined;
  }
}
```


---

## 10. Bağımlılıklar

- Phase 7 Playbook altyapısı (PlaybookRegistry, ActionPolicyGuard, ActionExecutor)
- DiagnosticsAggregator (mevcut)
- Audit altyapısı (PlaybookAuditService)
- Sprint 1A/1B Evidence altyapısı (EvidenceGate, SnapshotStore, DriftUtils)
