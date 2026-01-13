// Module
export { PolicyEngineModule } from './policy-engine.module';

// Main Service
export { CasePolicyEngine } from './case-policy-engine.service';

// Types
export * from './types';

// Fact Store
export {
  FactStoreService,
  ComputedFactRegistry,
  ComputedFactProvider,
  FactMap,
  FactValue,
} from './fact-store';

// State Machine
export {
  StateMachineService,
  IcraType,
  StageDefinition,
  StateInfo,
  TransitionResult,
  ApplyTransitionResult,
  CompiledStateFlow,
  RULE_VERSION,
  getStateFlow,
  getValidStages,
  isTerminalStage,
} from './state-machine';

// Gate Checker
export {
  GateCheckerService,
  GateSeverity,
  GateWarning,
  GateResult,
  CompiledGate,
  COMPILED_GATES,
  getGatesForAction,
} from './gate-checker';

// Rule Engine
export {
  RuleEngineService,
  ComputedMetrics,
  RecommendedAction,
  CompiledRule,
  COMPILED_RULES,
  getActiveRules,
  getRulesForStage,
} from './rule-engine';

// Decision Logger
export {
  DecisionLoggerService,
  ExecutionRecorderService,
} from './decision-logger';

// Decorators
export {
  CpeRequired,
  CpeRequiredGuard,
  ScopeResolvers,
  ScopeResolverFn,
  CaseIdResolverFn,
  defaultCaseIdResolver,
} from './decorators';

// Version Tracking
export {
  getRuleVersion,
  getRuleVersionString,
  getRuleVersionHash,
  getRuleVersionInfo,
  CompositeRuleVersion,
} from './version/rule-version';

// Deprecated Usage Tracking
export { DeprecatedUsageTrackerService } from './deprecated-usage-tracker.service';
