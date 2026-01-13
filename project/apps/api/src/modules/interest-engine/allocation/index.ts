/**
 * Allocation Engine Module Exports
 * 
 * TBK 100 HARD RULE + Soft Policy Tie-breaker
 */

export { 
  TBK100AllocatorService,
  DebtState,
  DebtComponent,
  TBK100AllocationOptions,
  AllocationResult,
  DEFAULT_ANCILLARY_PRIORITY,
} from './tbk100-allocator.service';

export {
  ClaimPriorityService,
  ClaimPriorityRule,
  ClaimWithInterest,
} from './claim-priority.service';

export {
  AllocationEngineService,
  AllocationOptions,
  InterestCalculatorFn,
  ClaimDebtState,
  AllocationEngineResult,
} from './allocation-engine.service';
