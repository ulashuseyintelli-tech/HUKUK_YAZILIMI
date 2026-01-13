# Requirements Document

## Introduction

Case Policy Engine (CPE), icra takip sisteminde karar mekanizmasını tekilleştiren merkezi bir bileşendir. Sistemdeki tüm aksiyonlar (UYAP gönderimi, masraf talebi, borçluya mesaj, haciz tetikleme vb.) için tek bir otorite sağlar. Mevcut durumda dağınık olan gate kontrolleri, rule engine'ler ve controller içi if'ler yerine, tek bir soru noktası oluşturur.

## Glossary

- **CPE (Case_Policy_Engine)**: Merkezi karar motoru servisi
- **Fact**: Sistemdeki bir gerçek (boolean/date/number/string) - örn: "tebligat edildi mi", "masraf ödendi mi"
- **Fact_Store**: Fact'leri saklayan ve sorgulayan bileşen
- **State**: Bir scope için mevcut aşama (örn: TEBLIGAT_BEKLENIYOR, KESINLESTI)
- **State_Machine**: Durum geçişlerini yöneten bileşen
- **Gate**: Aksiyonu bloke eden koşul (kilit/masraf/eksik veri vb.)
- **Gate_Checker**: Gate'leri kontrol eden bileşen
- **Rule_Engine**: Facts + State üzerinden öneri çıkaran bileşen
- **Scope**: Kararın bağlandığı seviye (CASE | DEBTOR | ASSET | EXPENSE)
- **Context**: Scope'a özgü tanımlayıcılar { debtorId?, assetId?, expenseId? }
- **Action_Code**: Sistemdeki bir aksiyonun benzersiz kodu (örn: UYAP_SEND, REQUEST_EXPENSE)
- **Policy_Decision**: CPE'nin bir aksiyon için verdiği karar (allowed/denied + reason)
- **Decision_Log**: Her kararın gerekçeli kaydı

## Requirements

### Requirement 1: Tek Soru Noktası

**User Story:** As a developer, I want a single authority for action permissions, so that I don't have to check multiple services for the same decision.

#### Acceptance Criteria

1. WHEN any action is requested, THE CPE SHALL be the only service that determines if the action is allowed
2. WHEN a controller needs to check action permission, THE CPE SHALL provide a `canPerformAction(caseId, actionCode, context)` method
3. THE CPE SHALL return a PolicyDecision containing: allowed (boolean), reason (string), code (string), and optional blockedBy, state, factsUsed, decisionId fields
4. IF any service bypasses CPE for action permission, THEN THE System SHALL log a warning and the action SHALL be blocked in production mode

### Requirement 2: Fact Store

**User Story:** As a system, I want a centralized fact storage, so that all decisions are based on the same source of truth.

#### Acceptance Criteria

1. THE Fact_Store SHALL store facts with keys following the pattern: `{scope}.{id}.{key}` (e.g., `case.has_power_of_attorney`, `debtor.123.notification_delivered`)
2. THE Fact_Store SHALL support fact types: boolean, number, string, date, json
3. WHEN a fact is requested, THE Fact_Store SHALL first check cache, then database
4. WHEN a fact is updated, THE Fact_Store SHALL invalidate the cache for that caseId
5. THE Fact_Store SHALL provide a `getFacts(caseId, context)` method returning a normalized map
6. THE Fact_Store SHALL use the existing IcrabotFact table as the persistence layer

### Requirement 3: Computed Facts

**User Story:** As a system, I want derived facts to be calculated consistently, so that time-based and calculated values are always accurate.

#### Acceptance Criteria

1. THE CPE SHALL support computed facts through a ComputedFactProvider interface
2. WHEN a computed fact is requested, THE Fact_Store SHALL delegate to the appropriate provider
3. THE ComputedFactProvider SHALL calculate derived values such as `days_since_notification`, `total_debt_amount`, `has_valid_address`
4. WHEN computing facts, THE ComputedFactProvider SHALL use scope chain resolution: ASSET → DEBTOR → CASE

### Requirement 4: Hierarchical State Machine

**User Story:** As a system, I want state management at multiple levels, so that case, debtor, asset, and expense states are tracked independently.

#### Acceptance Criteria

1. THE State_Machine SHALL support four scopes: CASE, DEBTOR, ASSET, EXPENSE
2. WHEN a state is requested, THE State_Machine SHALL return the current state for the given scope and context
3. THE State_Machine SHALL load state definitions from compiled stage_flows YAML at build time
4. THE State_Machine SHALL provide `getCurrentState(caseId, scope, context)` method
5. THE State_Machine SHALL provide `canTransition(currentState, actionCode)` method
6. IF a transition is not defined in the state flow, THEN THE State_Machine SHALL return { allowed: false, reason: "Invalid transition" }

### Requirement 5: Gate Checker

**User Story:** As a system, I want to block actions based on business rules, so that invalid operations are prevented.

#### Acceptance Criteria

1. THE Gate_Checker SHALL load gate definitions from compiled locks_and_gates YAML at build time
2. WHEN checking gates, THE Gate_Checker SHALL evaluate all applicable gates for the action
3. THE Gate_Checker SHALL support two severity levels: HARD (blocks action) and SOFT (warns but allows)
4. WHEN a HARD gate is triggered, THE CPE SHALL deny the action with the gate's reason
5. WHEN a SOFT gate is triggered, THE CPE SHALL allow the action but include a warning in the response
6. THE Gate_Checker SHALL provide `checkGates(caseId, actionCode, facts, context)` returning GateResult

### Requirement 6: Rule Engine for Next Actions

**User Story:** As a user, I want to see recommended next actions, so that I know what steps to take for a case.

#### Acceptance Criteria

1. THE Rule_Engine SHALL load rule definitions from compiled decision_rules YAML at build time
2. WHEN evaluating rules, THE Rule_Engine SHALL use facts, state, and computed metrics
3. THE Rule_Engine SHALL return recommendations with: actionCode, priority (1-100), reason, scope, context
4. THE CPE SHALL provide `getNextActions(caseId, scope?, context?)` method
5. WHEN generating recommendations, THE Rule_Engine SHALL optionally pre-check gates for each action

### Requirement 7: Decision Logging

**User Story:** As an auditor, I want all decisions logged with rationale, so that I can trace why actions were allowed or denied.

#### Acceptance Criteria

1. WHEN any decision is made, THE CPE SHALL write to DecisionLog
2. THE DecisionLog SHALL include: id, caseId, actionCode, scope, context, allowed, code, reason, factsUsed (keys only), stateSnapshot, gateCode (if applicable), traceId, createdAt
3. THE DecisionLog SHALL NOT store raw fact values containing personal data (KVKK compliance)
4. THE DecisionLog SHALL store a factsSnapshotHash for debugging purposes
5. WHEN a decision is logged, THE CPE SHALL return the decisionId in the PolicyDecision

### Requirement 8: Action Execution Callback with Idempotency

**User Story:** As a system, I want state updates after action execution, so that the system reflects the new reality without duplicate processing.

#### Acceptance Criteria

1. THE CPE SHALL provide `onActionExecuted(caseId, actionCode, context, result, executionId)` callback
2. WHEN an action is executed successfully, THE callback SHALL update the state via State_Machine
3. WHEN an action is executed successfully, THE callback SHALL write new facts to Fact_Store
4. IF the action execution fails, THEN THE callback SHALL NOT update state or facts
5. THE CPE SHALL require an executionId (UUID) for each action execution to ensure idempotency
6. IF the same executionId is processed twice, THEN THE callback SHALL return the previous result without re-processing (no-op)
7. THE CPE SHALL implement optimistic locking with state version (CAS: compare-and-swap) to prevent concurrent state updates
8. IF a concurrent update is detected, THEN THE callback SHALL return a CONCURRENT_MODIFICATION error and the caller SHALL retry

### Requirement 8.1: Concurrency Control

**User Story:** As a system, I want to prevent race conditions, so that concurrent action requests don't corrupt state.

#### Acceptance Criteria

1. THE CPE SHALL acquire a decision lock (caseId + scope + contextId) before evaluating canPerformAction for high-risk actions
2. THE lock SHALL have a maximum TTL of 30 seconds to prevent deadlocks
3. IF a lock cannot be acquired within 5 seconds, THEN THE CPE SHALL return a LOCK_TIMEOUT error
4. THE State_Machine SHALL use version numbers for state records to detect concurrent modifications

### Requirement 9: YAML Compilation

**User Story:** As a developer, I want YAML rules compiled at build time, so that runtime errors are caught early.

#### Acceptance Criteria

1. THE System SHALL compile YAML files (stage_flows, decision_rules, locks_and_gates) at build time
2. IF YAML compilation fails, THEN THE build SHALL fail with descriptive error
3. THE compiled rules SHALL be validated for: unreachable states, dead-end states, missing action mappings
4. THE System SHALL generate a ruleVersion hash for each compilation
5. THE DecisionLog SHALL include the ruleVersion used for each decision

### Requirement 10: Performance

**User Story:** As a user, I want fast permission checks, so that the UI remains responsive.

#### Acceptance Criteria

1. THE canPerformAction method SHALL complete in p95 < 150ms with cache
2. THE Fact_Store cache SHALL have a TTL of 10-30 seconds per caseId
3. WHEN cache is cold, THE canPerformAction method SHALL complete in p95 < 500ms

### Requirement 11: Strangler Pattern Migration

**User Story:** As a developer, I want gradual migration to CPE, so that existing functionality is not disrupted.

#### Acceptance Criteria

1. THE existing expense-gate.service SHALL be converted to a CPE adapter
2. THE existing stage-trigger.service SHALL use getNextActions from CPE
3. THE existing rule-engine services (both) SHALL be merged into CPE's Rule_Engine
4. WHEN migration is complete, THE old services SHALL be marked as deprecated
5. THE System SHALL support a feature flag to enable/disable CPE enforcement per action
6. THE System SHALL provide a @CpeRequired() decorator for controllers to enforce CPE checks on critical actions
7. IF a controller action marked with @CpeRequired() bypasses CPE, THEN THE System SHALL throw an error in production mode

### Requirement 12: Failure Semantics

**User Story:** As a system, I want predictable behavior when components fail, so that high-risk actions are protected.

#### Acceptance Criteria

1. THE CPE SHALL define a risk level (HIGH, MEDIUM, LOW) for each ActionCode
2. WHEN a Gate_Checker error occurs for a HIGH risk action, THE CPE SHALL default to HARD block (fail-closed)
3. WHEN a Gate_Checker error occurs for a LOW risk action, THE CPE SHALL default to SOFT warn (fail-open)
4. WHEN a Fact_Store error occurs for a HIGH risk action, THE CPE SHALL default to HARD block
5. WHEN a Fact_Store error occurs for a LOW risk action, THE CPE SHALL return cached facts if available, otherwise SOFT warn
6. THE CPE SHALL log all fail-closed and fail-open decisions with error details
7. WHEN a @CpeRequired scopeResolver error occurs, THE CPE SHALL apply the resolverFailureMode defined in the High-Risk Action Matrix
8. FOR HIGH risk actions, THE resolverFailureMode SHALL be fail-closed (block + log)
9. FOR LOW risk actions, THE resolverFailureMode SHALL be fail-open (warn + log) or soft-block as defined in the matrix
10. THE High-Risk Action Matrix SHALL define resolverFailureMode for each ActionCode

### Requirement 13: Decision Log Retention

**User Story:** As a system administrator, I want decision logs managed efficiently, so that storage doesn't grow unbounded.

#### Acceptance Criteria

1. THE DecisionLog SHALL retain records for 90 days in the primary table
2. AFTER 90 days, THE DecisionLog records SHALL be archived to a separate archive table or cold storage
3. THE archived records SHALL be retained for 7 years for legal compliance
4. THE System SHALL support querying archived records with a separate API endpoint

### Requirement 14: Execution Record

**User Story:** As an auditor, I want to track action executions separately from decisions, so that I can see what actually happened.

#### Acceptance Criteria

1. THE CPE SHALL maintain an ExecutionRecord table separate from DecisionLog
2. THE ExecutionRecord SHALL include: executionId, caseId, actionCode, context, startedAt, finishedAt, status (SUCCESS/FAILED/NOOP), errorCode, stateBeforeHash, stateAfterHash, ruleVersion
3. WHEN onActionExecuted is called, THE CPE SHALL create an ExecutionRecord
4. THE ExecutionRecord SHALL be used for idempotency checks (duplicate executionId detection)
5. THE ExecutionRecord SHALL have a retention policy of 90 days + archive (same as DecisionLog)
