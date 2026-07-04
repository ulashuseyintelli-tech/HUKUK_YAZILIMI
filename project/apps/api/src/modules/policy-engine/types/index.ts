// Action Code
export { ActionCode, RiskLevel, ACTION_RISK_LEVELS, getActionsByRiskLevel } from './action-code.enum';

// Effective Permission (Guided-Open per-user resolver — P2a)
export {
  GuidedOpenDecision,
  DecisionSource,
  ActionClass,
  Capacity,
  EffectivePermissionInput,
  EffectivePermissionDecision,
} from './effective-permission.types';

// Scope
export { Scope, SCOPE_HIERARCHY, getParentScopes, getScopeChain } from './scope.enum';

// Policy Decision
export {
  DecisionCode,
  GateWarning,
  StateInfo,
  PolicyDecision,
  ActionContext,
  ActionResult,
  ExecutionResponse,
  RecommendedAction,
} from './policy-decision.interface';

// Action Matrix
export {
  FailMode,
  ResolverFailureMode,
  LockScope,
  GateSeverity,
  ActionMatrixEntry,
  ACTION_MATRIX,
  getActionMatrixEntry,
  getResolverFailureMode,
  getFailMode,
  isLockRequired,
  isCpeRequiredMandatory,
} from './action-matrix.interface';
