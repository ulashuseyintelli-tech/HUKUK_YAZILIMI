# Design Document

## Overview

Case Policy Engine (CPE) is the central decision authority for the legal enforcement (icra) system. It consolidates all permission checks, state management, and action recommendations into a single service. The design follows a layered architecture with clear separation between fact storage, state management, gate checking, and rule evaluation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CASE POLICY ENGINE (CPE)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │ Fact Store   │───▶│ Gate Checker │───▶│ State Machine│           │
│  │ + Computed   │    │ (HARD/SOFT)  │    │ (Hierarchical)│          │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
│         │                   │                   │                    │
│         ▼                   ▼                   ▼                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │ Computed     │    │ Rule Engine  │    │ Decision     │           │
│  │ Fact Provider│    │ (Next Actions)│   │ Logger       │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │           PUBLIC API                     │
        │  canPerformAction(caseId, action, ctx)  │
        │  getNextActions(caseId, scope?, ctx?)   │
        │  onActionExecuted(caseId, action, ctx)  │
        └─────────────────────────────────────────┘
```

## Components and Interfaces

### 1. CasePolicyEngine (Main Service)

```typescript
@Injectable()
export class CasePolicyEngine {
  constructor(
    private factStore: FactStore,
    private stateMachine: StateMachine,
    private gateChecker: GateChecker,
    private ruleEngine: RuleEngine,
    private decisionLogger: DecisionLogger,
    private lockService: DistributedLockService,
    private executionRegistry: ExecutionRegistry, // For idempotency
  ) {}

  async canPerformAction(
    caseId: string,
    actionCode: ActionCode,
    context?: ActionContext,
  ): Promise<PolicyDecision> {
    const riskLevel = ACTION_RISK_LEVELS[actionCode];
    
    // For HIGH risk actions, acquire decision lock
    if (riskLevel === 'HIGH') {
      const lockKey = `cpe:decision:${caseId}:${context?.debtorId || ''}:${context?.assetId || ''}`;
      const lock = await this.lockService.acquire(lockKey, { ttl: 30000, waitTimeout: 5000 });
      if (!lock) {
        return { allowed: false, code: 'LOCK_TIMEOUT', reason: 'Başka bir işlem devam ediyor' };
      }
      try {
        return await this.evaluateDecision(caseId, actionCode, context, riskLevel);
      } finally {
        await this.lockService.release(lock);
      }
    }
    
    return this.evaluateDecision(caseId, actionCode, context, riskLevel);
  }

  private async evaluateDecision(
    caseId: string,
    actionCode: ActionCode,
    context: ActionContext | undefined,
    riskLevel: RiskLevel,
  ): Promise<PolicyDecision> {
    try {
      // 1. Gather facts
      const facts = await this.factStore.getFacts(caseId, context);
      
      // 2. Get current state
      const state = await this.stateMachine.getCurrentState(caseId, context);
      
      // 3. Check gates (HARD gates block, SOFT gates warn)
      const gateResult = await this.gateChecker.checkGates(caseId, actionCode, facts, context);
      if (gateResult.blocked) {
        return this.logAndReturn(caseId, actionCode, context, {
          allowed: false,
          reason: gateResult.reason,
          code: 'GATE_BLOCKED',
          blockedBy: { gateCode: gateResult.gateCode },
          state,
          factsUsed: gateResult.factsUsed,
        });
      }
      
      // 4. Check state transition
      const transitionResult = this.stateMachine.canTransition(state, actionCode);
      if (!transitionResult.allowed) {
        return this.logAndReturn(caseId, actionCode, context, {
          allowed: false,
          reason: transitionResult.reason,
          code: 'INVALID_TRANSITION',
          state,
        });
      }
      
      // 5. Allow with optional soft warnings
      return this.logAndReturn(caseId, actionCode, context, {
        allowed: true,
        reason: 'OK',
        code: 'OK',
        state,
        warnings: gateResult.softWarnings,
      });
    } catch (error) {
      // Fail-closed for HIGH risk, fail-open for LOW risk
      return this.handleError(caseId, actionCode, context, error, riskLevel);
    }
  }

  async onActionExecuted(
    caseId: string,
    actionCode: ActionCode,
    context: ActionContext | undefined,
    result: ActionResult,
    executionId: string, // UUID - required for idempotency
  ): Promise<ExecutionResponse> {
    // Check for duplicate execution
    const existing = await this.executionRegistry.get(executionId);
    if (existing) {
      return existing; // Return previous result (no-op)
    }
    
    if (result?.success) {
      // Apply state transition with optimistic locking
      const transitionResult = await this.stateMachine.applyTransition(
        caseId, 
        actionCode, 
        context,
        result.expectedStateVersion, // CAS check
      );
      
      if (!transitionResult.success && transitionResult.code === 'VERSION_MISMATCH') {
        return { success: false, code: 'CONCURRENT_MODIFICATION', shouldRetry: true };
      }
      
      await this.factStore.writeFactsFromAction(caseId, actionCode, context, result);
    }
    
    // Register execution for idempotency
    const response = { success: true, stateVersion: transitionResult.newVersion };
    await this.executionRegistry.set(executionId, response, { ttl: 86400000 }); // 24h TTL
    
    return response;
  }

  async getNextActions(
    caseId: string,
    scope?: Scope,
    context?: ActionContext,
  ): Promise<RecommendedAction[]> {
    const facts = await this.factStore.getFacts(caseId, context);
    const state = await this.stateMachine.getCurrentState(caseId, context);
    const computedMetrics = await this.factStore.getComputedMetrics(caseId, context);
    
    return this.ruleEngine.evaluate(caseId, facts, state, computedMetrics, scope, context);
  }

  private handleError(
    caseId: string,
    actionCode: ActionCode,
    context: ActionContext | undefined,
    error: Error,
    riskLevel: RiskLevel,
  ): PolicyDecision {
    this.logger.error(`CPE error for ${actionCode}`, error);
    
    if (riskLevel === 'HIGH') {
      // Fail-closed: block the action
      return this.logAndReturn(caseId, actionCode, context, {
        allowed: false,
        reason: 'Sistem hatası - güvenlik nedeniyle işlem engellendi',
        code: 'SYSTEM_ERROR_BLOCKED',
      });
    }
    
    // Fail-open: allow with warning
    return this.logAndReturn(caseId, actionCode, context, {
      allowed: true,
      reason: 'OK (sistem uyarısı)',
      code: 'OK_WITH_WARNING',
      warnings: [{ code: 'SYSTEM_ERROR', message: 'Bazı kontroller yapılamadı' }],
    });
  }
}
```

### 2. FactStore

```typescript
interface FactStore {
  getFacts(caseId: string, context?: ActionContext): Promise<FactMap>;
  getFact(caseId: string, factKey: string): Promise<FactValue | null>;
  writeFact(caseId: string, factKey: string, value: FactValue): Promise<void>;
  invalidateCache(caseId: string): Promise<void>;
  getComputedMetrics(caseId: string, context?: ActionContext): Promise<ComputedMetrics>;
}

// Fact key format: {scope}.{id?}.{key}
// Examples:
// - case.has_power_of_attorney
// - case.is_archived
// - debtor.abc123.notification_delivered
// - debtor.abc123.days_since_notification (computed)
// - asset.xyz789.type
// - asset.xyz789.has_prior_liens
// - expense.opening.paid
```

### 3. ComputedFactProvider

```typescript
interface ComputedFactProvider {
  readonly factKey: string;
  readonly dependsOn: string[]; // Other fact keys this provider depends on
  compute(caseId: string, context?: ActionContext, facts?: FactMap): Promise<FactValue>;
}

// Example providers:
class DaysSinceNotificationProvider implements ComputedFactProvider {
  readonly factKey = 'debtor.*.days_since_notification';
  readonly dependsOn = ['debtor.*.notification_date']; // Depends on notification_date
  
  async compute(caseId: string, context?: ActionContext, facts?: FactMap): Promise<number> {
    const notificationDate = facts?.get(`debtor.${context?.debtorId}.notification_date`);
    if (!notificationDate) return -1;
    return differenceInDays(new Date(), new Date(notificationDate as string));
  }
}

class TotalDebtAmountProvider implements ComputedFactProvider {
  readonly factKey = 'case.total_debt_amount';
  readonly dependsOn = ['case.principal_amount', 'case.interest_amount', 'case.expense_amount'];
  
  async compute(caseId: string): Promise<number> {
    // Calculate from dues, interest, etc.
  }
}

// Provider Registry with Dependency Resolution
class ComputedFactRegistry {
  private providers: Map<string, ComputedFactProvider> = new Map();
  private computeOrder: string[] = []; // Topologically sorted
  
  register(provider: ComputedFactProvider): void {
    this.providers.set(provider.factKey, provider);
    this.recomputeOrder();
  }
  
  private recomputeOrder(): void {
    // Topological sort based on dependsOn
    // Throws error if cycle detected
    this.computeOrder = this.topologicalSort();
  }
  
  async computeAll(caseId: string, context?: ActionContext, baseFacts?: FactMap): Promise<FactMap> {
    const facts = new Map(baseFacts);
    for (const factKey of this.computeOrder) {
      const provider = this.providers.get(factKey);
      if (provider) {
        const value = await provider.compute(caseId, context, facts);
        facts.set(factKey, value);
      }
    }
    return facts;
  }
}
```

### 4. StateMachine (Hierarchical)

```typescript
interface StateMachine {
  getCurrentState(caseId: string, context?: ActionContext): Promise<StateInfo>;
  canTransition(currentState: StateInfo, actionCode: ActionCode): TransitionResult;
  applyTransition(caseId: string, actionCode: ActionCode, context?: ActionContext): Promise<StateInfo>;
}

interface StateInfo {
  scope: Scope;
  currentState: string;
  contextId?: string; // debtorId, assetId, etc.
}

// Scope hierarchy for fact resolution:
// ASSET → DEBTOR → CASE
// When checking a gate for ASSET scope, facts from DEBTOR and CASE are also available
```

**State Flow Compilation:**

```typescript
// BUILD-TIME COMPILATION PIPELINE (CI/CD)
// =========================================
// 1. CI runs: npm run compile:rules
// 2. YAML files are parsed and validated
// 3. TypeScript/JSON artifacts are generated
// 4. Artifacts are committed to dist/ or bundled
// 5. Runtime loads pre-compiled artifacts (NO YAML parsing at runtime)

// This ensures:
// - Parse errors caught at build time, not production startup
// - Deterministic behavior across deployments
// - No YAML library needed in production bundle

interface CompiledStateFlow {
  icraType: IcraType;
  stages: string[];
  transitions: Map<string, Map<ActionCode, string>>; // fromState → actionCode → toState
  stageRequirements: Map<string, StageRequirement>;
  compiledAt: string; // ISO timestamp
  version: string; // Git commit hash or semantic version
}

// Compile script (scripts/compile-rules.ts):
// 1. Load stage_flows_v3.yaml
// 2. Validate: no unreachable states, no dead-ends, all actions defined
// 3. Generate: src/policy-engine/compiled/state-flows.compiled.ts
// 4. Generate: version hash from content

// Validation at compile time:
// - No unreachable states
// - No dead-end states (except terminal states)
// - All action codes are defined in ActionCode enum
// - All transitions have valid target states
// - Cycle detection in state graph (warn, not error - some cycles are valid)
```

### 5. GateChecker

```typescript
interface GateChecker {
  checkGates(
    caseId: string,
    actionCode: ActionCode,
    facts: FactMap,
    context?: ActionContext,
  ): Promise<GateResult>;
}

interface GateResult {
  blocked: boolean;
  gateCode?: string;
  reason: string;
  severity: 'HARD' | 'SOFT';
  factsUsed: string[];
  softWarnings?: GateWarning[];
}

// Gate definition (compiled from YAML):
interface CompiledGate {
  gateCode: string;
  actionCodes: ActionCode[]; // Which actions this gate applies to
  condition: (facts: FactMap, context?: ActionContext) => boolean;
  severity: 'HARD' | 'SOFT';
  reason: string;
}

// Example gates:
// EXPENSE_REQUIRED_FOR_UYAP_SEND:
//   actionCodes: [UYAP_SEND]
//   condition: !facts['expense.opening.paid']
//   severity: HARD
//   reason: "UYAP'a gönderim için açılış masrafı ödenmeli."

// DEBTOR_ADDRESS_MISSING:
//   actionCodes: [SEND_NOTIFICATION]
//   condition: !facts['debtor.*.has_valid_address']
//   severity: HARD
//   reason: "Borçlunun geçerli adresi yok."
```

### 6. RuleEngine

```typescript
interface RuleEngine {
  evaluate(
    caseId: string,
    facts: FactMap,
    state: StateInfo,
    computedMetrics: ComputedMetrics,
    scope?: Scope,
    context?: ActionContext,
  ): Promise<RecommendedAction[]>;
}

interface RecommendedAction {
  actionCode: ActionCode;
  priority: number; // 1-100, lower is higher priority
  reason: string;
  scope: Scope;
  context?: ActionContext;
  gatePreCheck?: GateResult; // Optional pre-check result
}

// Rule definition (compiled from YAML):
interface CompiledRule {
  ruleId: string;
  when: (facts: FactMap, state: StateInfo, metrics: ComputedMetrics) => boolean;
  then: {
    actionCode: ActionCode;
    priority: number;
    reason: string;
    scope: Scope;
  };
}
```

### 7. DecisionLogger

```typescript
interface DecisionLogger {
  log(
    caseId: string,
    actionCode: ActionCode,
    context: ActionContext | undefined,
    decision: PolicyDecision,
    facts: FactMap,
    state: StateInfo,
    traceId: string,
    ruleVersion: string,
  ): Promise<string>; // Returns decisionId
}

// DecisionLog table schema:
// - id: string (cuid)
// - caseId: string
// - actionCode: string
// - scope: string
// - contextJson: json (debtorId, assetId, etc. - no PII)
// - allowed: boolean
// - code: string (OK, GATE_BLOCKED, INVALID_TRANSITION, etc.)
// - reason: string
// - factsUsedKeys: string[] (only keys, no values for KVKK)
// - factsSnapshotHash: string (for debugging)
// - stateSnapshot: json
// - gateCode: string?
// - traceId: string
// - ruleVersion: string
// - createdAt: datetime
```

## Data Models

### ActionCode Enum

```typescript
enum ActionCode {
  // UYAP Actions
  UYAP_SEND = 'UYAP_SEND',
  UYAP_QUERY = 'UYAP_QUERY',
  
  // Expense Actions
  REQUEST_EXPENSE = 'REQUEST_EXPENSE',
  RECORD_EXPENSE_PAYMENT = 'RECORD_EXPENSE_PAYMENT',
  
  // Notification Actions
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
  SEND_DEBTOR_MSG = 'SEND_DEBTOR_MSG',
  
  // Asset Actions
  QUERY_ASSETS = 'QUERY_ASSETS',
  QUERY_BANK_ACCOUNTS = 'QUERY_BANK_ACCOUNTS',
  QUERY_VEHICLES = 'QUERY_VEHICLES',
  
  // Enforcement Actions
  TRIGGER_HACIZ = 'TRIGGER_HACIZ',
  REQUEST_SALE = 'REQUEST_SALE',
  
  // Case Lifecycle
  FINALIZE_CASE = 'FINALIZE_CASE',
  ARCHIVE_CASE = 'ARCHIVE_CASE',
  REOPEN_CASE = 'REOPEN_CASE',
}
```

### Scope Enum

```typescript
enum Scope {
  CASE = 'CASE',
  DEBTOR = 'DEBTOR',
  ASSET = 'ASSET',
  EXPENSE = 'EXPENSE',
}
```

### PolicyDecision

```typescript
interface PolicyDecision {
  allowed: boolean;
  reason: string;
  code: DecisionCode;
  blockedBy?: { gateCode: string };
  state?: StateInfo;
  factsUsed?: string[];
  warnings?: GateWarning[];
  decisionId?: string;
}

enum DecisionCode {
  OK = 'OK',
  GATE_BLOCKED = 'GATE_BLOCKED',
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  MISSING_CONTEXT = 'MISSING_CONTEXT',
  CASE_NOT_FOUND = 'CASE_NOT_FOUND',
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Decision Determinism

*For any* caseId, actionCode, and context, if the facts and state are identical, THE CPE SHALL return the same PolicyDecision.

**Validates: Requirements 1.1, 1.3**

### Property 2: Gate Precedence

*For any* action request, if a HARD gate is triggered, THE CPE SHALL deny the action regardless of state transition validity.

**Validates: Requirements 5.4**

### Property 3: Decision Logging Completeness

*For any* call to canPerformAction, THE CPE SHALL write exactly one DecisionLog entry, whether the decision is allow or deny.

**Validates: Requirements 7.1, 7.2**

### Property 4: Fact Cache Consistency

*For any* fact update via writeFact, THE Fact_Store SHALL invalidate the cache such that subsequent getFacts calls return the updated value.

**Validates: Requirements 2.4**

### Property 5: State Transition Validity

*For any* state transition attempt, if the transition is not defined in the compiled state flow, THE State_Machine SHALL return allowed=false.

**Validates: Requirements 4.6**

### Property 6: Scope Chain Resolution

*For any* fact lookup in ASSET scope, THE Fact_Store SHALL also resolve facts from DEBTOR and CASE scopes in the chain.

**Validates: Requirements 3.4**

### Property 7: YAML Compilation Validation

*For any* YAML compilation, if there are unreachable states or undefined action mappings, THE build SHALL fail.

**Validates: Requirements 9.3**

### Property 8: Rule Version Traceability

*For any* DecisionLog entry, THE ruleVersion field SHALL match the hash of the compiled rules used for that decision.

**Validates: Requirements 9.4, 9.5**

## Error Handling

### YAML Compilation Errors

- **Unreachable State**: Build fails with error listing the unreachable states
- **Missing Action Mapping**: Build fails with error listing undefined action codes
- **Invalid Gate Condition**: Build fails with syntax error location

### Runtime Errors

- **Case Not Found**: Return `{ allowed: false, code: 'CASE_NOT_FOUND', reason: 'Dosya bulunamadı' }`
- **Missing Required Context**: Return `{ allowed: false, code: 'MISSING_CONTEXT', reason: 'Borçlu ID gerekli' }`
- **Fact Store Unavailable**: Log error, return `{ allowed: false, code: 'SYSTEM_ERROR', reason: 'Sistem hatası' }`

### Safe Defaults

- If a fact is missing and required by a HARD gate: Block the action
- If a fact is missing and required by a SOFT gate: Allow with warning
- If state cannot be determined: Block the action with 'INVALID_STATE' code

## Testing Strategy

### Unit Tests

- FactStore: Cache behavior, fact resolution, computed facts
- StateMachine: State transitions, invalid transitions, scope handling
- GateChecker: HARD/SOFT gate evaluation, fact-based conditions
- RuleEngine: Rule evaluation, priority sorting, scope filtering
- DecisionLogger: Log completeness, KVKK compliance

### Property-Based Tests

- Decision determinism: Same inputs → same outputs
- Gate precedence: HARD gates always block
- Logging completeness: Every decision is logged
- Cache consistency: Updates invalidate cache

### Integration Tests

- Full canPerformAction flow with real database
- getNextActions with various case states
- onActionExecuted state updates

### Golden Scenario Tests

- Real case snapshots with expected decisions
- Regression tests for critical business rules
- Migration validation: Old service behavior matches CPE behavior

## @CpeRequired Decorator and Interceptor

```typescript
// Decorator definition
export function CpeRequired(
  actionCode: ActionCode,
  scopeResolver?: (req: Request) => ActionContext,
) {
  return applyDecorators(
    SetMetadata('cpe:actionCode', actionCode),
    SetMetadata('cpe:scopeResolver', scopeResolver),
    UseInterceptors(CpeRequiredInterceptor),
  );
}

// Interceptor implementation with resolver error handling
@Injectable()
export class CpeRequiredInterceptor implements NestInterceptor {
  constructor(
    private cpe: CasePolicyEngine,
    private actionMatrix: HighRiskActionMatrix,
    private reflector: Reflector,
    private logger: Logger,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const actionCode = this.reflector.get<ActionCode>('cpe:actionCode', context.getHandler());
    const scopeResolver = this.reflector.get<Function>('cpe:scopeResolver', context.getHandler());
    const request = context.switchToHttp().getRequest();
    const caseId = request.params.caseId || request.body.caseId;
    
    // Resolve context with error handling
    let actionContext: ActionContext | undefined;
    try {
      actionContext = scopeResolver ? scopeResolver(request) : undefined;
    } catch (resolverError) {
      // Check resolverFailureMode from matrix
      const failureMode = this.actionMatrix.getResolverFailureMode(actionCode);
      this.logger.error(`ScopeResolver error for ${actionCode}`, resolverError);
      
      if (failureMode === 'FAIL_CLOSED') {
        throw new ForbiddenException({
          code: 'RESOLVER_ERROR_BLOCKED',
          reason: 'Context çözümlenemedi - güvenlik nedeniyle işlem engellendi',
          actionCode,
        });
      }
      // FAIL_OPEN: continue with undefined context + warning
      actionContext = undefined;
    }
    
    // Call CPE
    const decision = await this.cpe.canPerformAction(caseId, actionCode, actionContext);
    
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: decision.code,
        reason: decision.reason,
        blockedBy: decision.blockedBy,
        decisionId: decision.decisionId,
      });
    }
    
    // Attach decision to request for logging/tracing
    request.policyDecision = decision;
    
    return next.handle();
  }
}
```

## High-Risk Action Matrix Structure

```typescript
// docs/high-risk-action-matrix.md → compiled to this structure
interface ActionMatrixEntry {
  actionCode: ActionCode;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  failMode: 'CLOSED' | 'OPEN';
  resolverFailureMode: 'FAIL_CLOSED' | 'FAIL_OPEN' | 'SOFT_BLOCK';
  lockRequired: boolean;
  lockScope: 'CASE' | 'DEBTOR' | 'ASSET' | 'NONE';
  gateSeverity: 'HARD' | 'SOFT';
  cpeRequiredMandatory: boolean;
  scope: Scope;
  notes?: string;
}

// Example entries:
const ACTION_MATRIX: ActionMatrixEntry[] = [
  {
    actionCode: ActionCode.UYAP_SEND,
    riskLevel: 'HIGH',
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'CASE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'UYAP işlemleri geri alınamaz',
  },
  {
    actionCode: ActionCode.QUERY_ASSETS,
    riskLevel: 'LOW',
    failMode: 'OPEN',
    resolverFailureMode: 'FAIL_OPEN',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'SOFT',
    cpeRequiredMandatory: false,
    scope: Scope.DEBTOR,
    notes: 'Sadece sorgu, yan etkisi yok',
  },
  {
    actionCode: ActionCode.TRIGGER_HACIZ,
    riskLevel: 'HIGH',
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'ASSET',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.ASSET,
    notes: 'Haciz işlemi kritik, geri alınamaz',
  },
  {
    actionCode: ActionCode.REQUEST_EXPENSE,
    riskLevel: 'MEDIUM',
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'Masraf talebi müvekkile gider',
  },
  {
    actionCode: ActionCode.SEND_DEBTOR_MSG,
    riskLevel: 'MEDIUM',
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.DEBTOR,
    notes: 'Borçluya mesaj hukuki sonuç doğurur',
  },
];
```
