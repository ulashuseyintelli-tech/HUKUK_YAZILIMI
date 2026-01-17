# Phase 8: What-if Simulation + Condition-based Escalation — Tasks

## Sprint 1A — DiagnosticsAggregator + EvidenceGate + Thresholds

### 1. Evidence Types
- [x] 1.1 MetricType enum tanımla (error_rate, latency_p95, latency_p99, saturation_cpu, queue_depth, slo_burn_rate)
- [x] 1.2 EvidencePoint interface tanımla (metric, value, unit, windowSec, confidence, freshnessSec, source, timestamp)
- [x] 1.3 EvidenceSnapshot interface tanımla (snapshotId, tenantId, incidentId, capturedAt, points[], promoted?, derived?)
- [x] 1.4 EvidenceFlag type tanımla (LOW_CONFIDENCE, STALE_DATA, STALE_EVIDENCE)

### 2. DiagnosticsAggregator Adapters
- [x] 2.1 error_rate metric adapter implement et
- [x] 2.2 latency_p99 metric adapter implement et
- [x] 2.3 slo_burn_rate metric adapter implement et
- [x] 2.4 Confidence hesaplama logic'i implement et
- [x] 2.5 freshnessSec hesaplama logic'i implement et

### 3. EvidenceGate Implementation
- [x] 3.1 EvidenceGate service oluştur
- [x] 3.2 STALE_EVIDENCE flag logic (snapshotAgeSec > 60)
- [x] 3.3 LOW_CONFIDENCE flag logic (confidence < 0.5 for critical metrics)
- [x] 3.4 STALE_DATA flag logic (freshnessSec > 120)
- [x] 3.5 allowAutoEscalation output hesaplama
- [x] 3.6 allowPromote output hesaplama
- [x] 3.7 EvidenceGate fail response format (scenarios: [], blockedReason, blockedFlags)

### 4. Documentation
- [x] 4.1 Gate hierarchy dokümantasyonu (EvidenceGate → PolicyGuard → Executor)
- [x] 4.2 Evidence thresholds dokümantasyonu

### 5. Tests (Sprint 1A)
- [x] 5.1 Unit test: EvidenceGate flag generation
- [x] 5.2 Unit test: STALE_EVIDENCE threshold
- [x] 5.3 Unit test: LOW_CONFIDENCE threshold
- [x] 5.4 Unit test: STALE_DATA threshold
- [x] 5.5 Unit test: allowAutoEscalation logic
- [x] 5.6 Unit test: allowPromote logic

---

## Sprint 1B — SnapshotStore + TTL + Cleanup + Drift Utils ✅

### 6. SnapshotStore Implementation
- [x] 6.1 SnapshotStore interface tanımla
- [x] 6.2 save(snapshot) implement et
- [x] 6.3 get(snapshotId) implement et
- [x] 6.4 listByIncident(incidentId) implement et (capturedAt DESC)
- [x] 6.5 markPromoted(snapshotId) implement et (idempotent)
- [x] 6.6 deleteExpired() implement et (idempotent)

### 7. TTL Configuration
- [x] 7.1 snapshotRetentionHours config (default 72)
- [x] 7.2 promotedRetentionHours config (default 168 = 7 days)
- [x] 7.3 TTL hesaplama logic'i (createdAt bazlı)

### 8. Cleanup Job
- [x] 8.1 Cleanup job scheduler (configurable interval, default 10 min)
- [x] 8.2 deleteExpired() return value (silinen kayıt sayısı)
- [x] 8.3 Cleanup job logging
- [x] 8.4 Boolean concurrency lock (prevent overlapping runs)

### 9. SnapshotComparisonUtils (Drift)
- [x] 9.1 drift(metric) hesaplama: abs(new-old)/max(eps, old)
- [x] 9.2 DRIFT_WEIGHTS config implement et
- [x] 9.3 Weighted driftScore hesaplama (RMS formula)
- [x] 9.4 DRIFT_THRESHOLD config (0.15, >= comparison)
- [x] 9.5 No common metrics → driftScore=1.0 + noComparableMetrics flag
- [x] 9.6 eps constant: 1e-9 (fixed, not configurable)

### 10. Tests (Sprint 1B) — 49 tests passing
- [x] 10.1 Unit test: SnapshotStore save/get (18 tests)
- [x] 10.2 Unit test: TTL cleanup logic
- [x] 10.3 Unit test: deleteExpired return value (idempotent)
- [x] 10.4 Unit test: driftScore calculation (22 tests)
- [x] 10.5 Unit test: drift weights application
- [x] 10.6 Unit test: driftScore determinism (same inputs → same output)
- [x] 10.7 Unit test: boundary cases (driftScore == 0.15 → block)
- [x] 10.8 Unit test: empty snapshots → driftScore=1.0
- [x] 10.9 Unit test: cleanup job concurrency lock (9 tests)

---

## Sprint 2 — Simulation Engine + Determinism + Explainability

Sprint 2 üç ana parçadan oluşur:
- A) Simulation Contract (determinism garantisi)
- B) Scenario Library (golden scenarios)
- C) Evidence + Snapshot entegrasyonu (explainability)

### Sprint 2A — Simulation Contract + Determinism ✅

#### 11. ISimulationEngine Interface
- [x] 11.1 ISimulationEngine interface tanımla
- [x] 11.2 SimulationInput type (incidentId, config, seed)
- [x] 11.3 SimulationOutput type (runId, snapshots[], driftScore, verdict, evidenceChain)
- [x] 11.4 Determinism guarantee: same seed → same output

#### 12. SimulationClock (Injectable)
- [x] 12.1 ISimulationClock interface
- [x] 12.2 RealSimulationClock implementation
- [x] 12.3 FakeSimulationClock for tests (manual tick)
- [x] 12.4 Clock injection mechanism

#### 13. SimulationScheduler (Injectable)
- [x] 13.1 ISimulationScheduler interface
- [x] 13.2 IntervalScheduler implementation (prod)
- [x] 13.3 ManualTickScheduler for tests
- [x] 13.4 Scheduler injection mechanism

#### 14. Seed-based Determinism
- [x] 14.1 PRNG with seed (mulberry32)
- [x] 14.2 Seed-based action ordering tiebreaks (deterministicSort)
- [x] 14.3 Seed-based scenario generation order
- [x] 14.4 Seed etki alanı dokümantasyonu
- [x] 14.5 Determinism test: 10 runs with same seed → same hash (KING TEST)

### Sprint 2B — Golden Scenarios + Drift Explainability ✅

#### 15. Drift Explainability (Single Source of Truth)
- [x] 15.1 drift-utils.ts refactored as SINGLE SOURCE OF TRUTH
- [x] 15.2 DriftResult interface with missingInBaseline + missingInCurrent separation
- [x] 15.3 MetricDrift interface with full explainability
- [x] 15.4 topContributors sorted: weightedContribution DESC, metric ASC (tie-break)
- [x] 15.5 NaN/Infinity protection via Number.isFinite checks
- [x] 15.6 roundDriftScore() helper for deterministic comparison
- [x] 15.7 simulation.types.ts imports DriftResult from drift-utils (no duplication)
- [x] 15.8 SimulationEngine uses calculateDrift directly (no re-processing)

#### 16. Golden Scenarios (Contract Tests)
- [x] 16.1 GOLDEN_NORMAL - low drift, PROCEED
- [x] 16.2 GOLDEN_PARTIAL_METRICS - some metrics missing, partial overlap
- [x] 16.3 GOLDEN_NO_COMMON - no common metrics, drift=1.0, BLOCK_DRIFT
- [x] 16.4 GOLDEN_HIGH_DRIFT - drift >= 0.15, BLOCK_DRIFT
- [x] 16.5 GOLDEN_BOUNDARY - at threshold (>= 0.15), BLOCK_DRIFT
- [x] 16.6 GOLDEN_STALE_EVIDENCE - evidence gate fail, BLOCK_EVIDENCE (gate priority)
- [x] 16.7 Contract hash stability tests (stable fields only, not entire snapshot)
- [x] 16.8 extractStableFields() for deterministic contract hashing

#### 17. Tests (Sprint 2B) — 57 simulation tests + 89 evidence tests = 146 total
- [x] 17.1 Golden scenarios: 13 tests
- [x] 17.2 Drift utils: 22 tests (updated for new interface)
- [x] 17.3 Simulation engine: 18 tests (updated for DriftResult)
- [x] 17.4 Determinism: 12 tests
- [x] 17.5 Legal hold: 10 tests

### Sprint 2C — Retention Policy + Promotion Workflow + Audit ✅

#### 18. Retention Policy (Single Source of Truth)
- [x] 18.1 retention-policy.ts as SINGLE SOURCE OF TRUTH
- [x] 18.2 RETENTION_HOURS: STANDARD=72h, PROMOTED=168h, LEGAL_HOLD=null
- [x] 18.3 POLICY_RANK hierarchy: LEGAL_HOLD > PROMOTED > STANDARD
- [x] 18.4 isTransitionAllowed() - upgrade only, downgrade FORBIDDEN
- [x] 18.5 validateTransition() - returns PolicyTransitionResult
- [x] 18.6 calculateExpiresAt() - based on createdAt (NOT promotedAt)
- [x] 18.7 isExpired() - >= comparison (exactly at threshold = expired)

#### 19. Promotion Workflow
- [x] 19.1 markPromoted() returns MarkPromotedResult with changed flag
- [x] 19.2 markPromoted() - 404 for not found, idempotent for already promoted
- [x] 19.3 markPromoted() - no-op for LEGAL_HOLD (LEGAL_HOLD > PROMOTED)
- [x] 19.4 promotedAt immutable (first promote wins)
- [x] 19.5 applyLegalHold() convenience method
- [x] 19.6 setRetentionPolicy() with downgrade rejection (400)
- [x] 19.7 TTL based on createdAt, NOT promotedAt (promotion doesn't extend TTL)

#### 20. Audit Events
- [x] 20.1 SnapshotAuditEvent types (CREATED, PROMOTED, LEGAL_HOLD_APPLIED, POLICY_CHANGED, DELETED)
- [x] 20.2 ISnapshotAuditEmitter interface
- [x] 20.3 InMemorySnapshotAuditEmitter for testing
- [x] 20.4 Audit events only on actual change (not no-ops)
- [x] 20.5 Event includes previousPolicy, newPolicy, timestamp, actor

#### 21. Tests (Sprint 2C) — 58 simulation + 147 evidence = 205 total
- [x] 21.1 retention-policy.spec.ts: 34 tests
- [x] 21.2 promotion-workflow.spec.ts: 24 tests
- [x] 21.3 snapshot-store.spec.ts: 18 tests (updated)
- [x] 21.4 legal-hold.spec.ts: 11 tests (updated for downgrade forbidden)

### Sprint 2D — Incident Loop + Baseline Pointer ✅

#### 22. Incident Types
- [x] 22.1 Incident interface with baselineSnapshotId field
- [x] 22.2 IncidentStatus enum (OPEN, INVESTIGATING, MITIGATING, RESOLVED, CLOSED)
- [x] 22.3 IncidentSeverity enum (LOW, MEDIUM, HIGH, CRITICAL)
- [x] 22.4 BaselineSelectionResult interface
- [x] 22.5 BaselineProtectionResult interface
- [x] 22.6 IIncidentStore interface

#### 23. Baseline Resolver Service
- [x] 23.1 selectBaseline() - priority: PROMOTED > STANDARD
- [x] 23.2 protectBaseline() - apply LEGAL_HOLD (idempotent)
- [x] 23.3 selectAndProtectBaseline() - combined operation for simulation start
- [x] 23.4 getBaseline() - return snapshot data
- [x] 23.5 isBaselineProtected() - check protection status
- [x] 23.6 LEGAL_HOLD counts as PROMOTED source in selection

#### 24. Incident Store
- [x] 24.1 InMemoryIncidentStore implementation
- [x] 24.2 save/get incident
- [x] 24.3 setBaseline() - set baseline pointer
- [x] 24.4 clearBaseline() - clear baseline pointer
- [x] 24.5 create() convenience method
- [x] 24.6 listByTenant() for testing

#### 25. Tests (Sprint 2D) — 95 simulation + 147 evidence = 242 total
- [x] 25.1 baseline-resolver.spec.ts: 21 tests
- [x] 25.2 incident-store.spec.ts: 16 tests
- [x] 25.3 Baseline selection priority tests
- [x] 25.4 Baseline protection tests
- [x] 25.5 "Baseline deleted" scenario prevention tests

#### 26. IClock Interface Compatibility
- [x] 26.1 ClockService updated with setFakeTime/advanceHours for testing
- [x] 26.2 MockClockService updated for IClock compatibility
- [x] 26.3 All services accept IClock | ClockService for flexibility

#### 27. SimulationStore (Sprint 3)
- [ ] 27.1 ISimulationStore interface tanımla
- [ ] 27.2 SimulationStatus enum (PENDING, RUNNING, COMPLETED, FAILED, TIMEOUT)
- [ ] 27.3 save(result) implement et
- [ ] 27.4 get(simulationId) implement et
- [ ] 27.5 listByTenant(tenantId, options) implement et
- [ ] 27.6 updateStatus(simulationId, status) implement et

---

## Sprint 3 — API + Rate Limiting + ScenarioRanker + Promote

### 23. API Endpoints
- [ ] 23.1 POST /v1/simulations controller
- [ ] 23.2 GET /v1/simulations/{id} controller
- [ ] 23.3 Request/response DTOs
- [ ] 23.4 Version prefix (/v1/) routing

### 24. Simulation Rate Limiting
- [ ] 24.1 Concurrent limit check (status=RUNNING, max 3)
- [ ] 24.2 Daily limit check (last 24h CREATED, max 100)
- [ ] 24.3 429 TOO_MANY_SIMULATIONS response

### 25. ScenarioRanker
- [ ] 25.1 ScenarioRanker service oluştur
- [ ] 25.2 riskScore + expectedImpact scoring
- [ ] 25.3 Dominance calculation (Pareto)
- [ ] 25.4 Tradeoffs text generation

### 26. Condition-based Escalation + De-escalation
- [ ] 26.1 deEscalationThreshold field
- [ ] 26.2 deEscalationStableForSec field
- [ ] 26.3 autoResolveOnDeEscalation field
- [ ] 26.4 hysteresisFactor implementation
- [ ] 26.5 stableForSec (stable duration) implementation

### 27. ConditionEscalationEvaluator
- [ ] 27.1 Trigger logic: metric > threshold AND stableForSec >= 30
- [ ] 27.2 De-escalation logic: metric < threshold * hysteresisFactor
- [ ] 27.3 Jitter dampening
- [ ] 27.4 EvidenceGate integration (fail → block auto-escalation)
- [ ] 27.5 autoResolveOnDeEscalation handling

### 28. CounterfactualPolicyConfig
- [ ] 28.1 CounterfactualPolicyConfig interface
- [ ] 28.2 Default values implementation
- [ ] 28.3 Config injection mechanism
- [ ] 28.4 blockAutoPromoteOn enforcement
- [ ] 28.5 blockAutoEscalationOn enforcement
- [ ] 28.6 warnOnlyOn handling

### 29. PromoteService
- [ ] 29.1 PromoteService oluştur
- [ ] 29.2 Fresh snapshot acquisition
- [ ] 29.3 EvidenceGate check on promote
- [ ] 29.4 Drift guard implementation
- [ ] 29.5 409 DRIFT_TOO_HIGH response
- [ ] 29.6 RESIMULATE suggestion
- [ ] 29.7 Counterfactual policy block check
- [ ] 29.8 Phase 7 run integration
- [ ] 29.9 executionId return

### 30. Promote API
- [ ] 30.1 POST /v1/simulations/{id}/promote controller
- [ ] 30.2 PromoteRequest DTO
- [ ] 30.3 PromoteResponse DTO

### 31. Audit Events Wiring
- [ ] 31.1 SIMULATION_CREATED event
- [ ] 31.2 SIMULATION_COMPLETED event
- [ ] 31.3 SIMULATION_PROMOTE_REQUESTED event
- [ ] 31.4 SIMULATION_PROMOTE_BLOCKED event
- [ ] 31.5 SIMULATION_PROMOTED event

### 32. Tests (Sprint 3)
- [ ] 32.1 Golden test: full simulation → promote flow
- [ ] 32.2 Golden test: evidence gate block scenario
- [ ] 32.3 Golden test: drift block scenario
- [ ] 32.4 Integration test: promote drift block
- [ ] 32.5 Integration test: evidence gate block
- [ ] 32.6 Integration test: de-escalation autoResolve
- [ ] 32.7 Integration test: hysteresis behavior
- [ ] 32.8 Contract test: POST /v1/simulations/{id}/promote response schema

### 33. Documentation Updates
- [ ] 33.1 README: API versioning
- [ ] 33.2 README: promote safety (drift guard)
- [ ] 33.3 README: hysteresis/de-escalation behavior
- [ ] 33.4 README: counterfactual policy configuration

---

## Kırmızı Çizgiler Checklist

- [x] Gate hiyerarşisi net: EvidenceGate fail ⇒ stop
- [x] Snapshot TTL + cleanup zorunlu
- [x] DriftScore weights/threshold explicit (Sprint 1B)
- [x] CI exit code 0 (Jest setup file)
- [x] Seed'in etki alanı açık ve testli (Sprint 2A)
- [x] Drift explainability (topContributors + missingMetrics) (Sprint 2B)
- [x] RetentionPolicy: LEGAL_HOLD for indefinite retention (Sprint 2A)
- [x] topContributors deterministic sort (weightedContribution DESC, metric ASC) (Sprint 2B)
- [x] NaN/Infinity protection in drift calculation (Sprint 2B)
- [x] Golden scenarios contract tests (6 scenarios) (Sprint 2B)
- [x] Single source of truth: drift-utils.ts (Sprint 2B)
- [x] Single source of truth: retention-policy.ts (Sprint 2C)
- [x] Retention policy hierarchy: LEGAL_HOLD > PROMOTED > STANDARD (Sprint 2C)
- [x] Downgrade FORBIDDEN (400 Bad Request) (Sprint 2C)
- [x] TTL based on createdAt, NOT promotedAt (Sprint 2C)
- [x] Audit events only on actual change (Sprint 2C)
- [x] Baseline snapshot auto LEGAL_HOLD on simulation start (Sprint 2D)
- [x] Baseline selection priority: PROMOTED > STANDARD (Sprint 2D)
- [x] "Baseline deleted" scenario prevention (Sprint 2D)
- [x] IClock interface for testability (Sprint 2D)
- [ ] De-escalation ve autoResolve opsiyonlu ama spesifik
- [ ] CounterfactualPolicyConfig hard-coded değil, config'li
- [ ] Simulation compute timeout + partial results
- [ ] API versioning /v1 prefix
- [ ] Simulation rate limiting (concurrent + daily)
- [ ] ScenarioRanker (operator'a gerçek yardımcı)
- [ ] Simulation audit eventleri tam
