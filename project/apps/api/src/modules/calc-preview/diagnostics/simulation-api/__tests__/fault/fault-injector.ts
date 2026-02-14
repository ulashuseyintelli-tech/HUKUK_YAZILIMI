/**
 * FaultInjector — Deterministic Fault Injection Harness
 *
 * Provides controlled, seeded fault injection for testing fault tolerance
 * contracts across promote store, escalation repo, audit adapter,
 * feature flag, and clock surfaces.
 *
 * Determinism: fixed seed + scenario-id → same fault every run (no random).
 *
 * @see .kiro/specs/fault-injection-harness/design.md — D1
 */

// ============================================================================
// Types
// ============================================================================

export type DbOp =
  | 'promote_insert'
  | 'promote_update'
  | 'promote_select'
  | 'escalation_update_cas';

export type DbFaultMode = 'timeout' | 'conn_reset' | 'ack_lost';
export type AuditFaultMode = 'timeout' | 'conn_reset' | 'async_reject';
export type FlagFaultMode = 'toggle_mid_flight';
export type ClockFaultMode = 'jump_backward';

export interface FaultSpec {
  db?: { op: DbOp; mode: DbFaultMode };
  audit?: { mode: AuditFaultMode };
  flag?: { mode: FlagFaultMode };
  clock?: { mode: ClockFaultMode };
}

// ============================================================================
// FaultInjector Interface
// ============================================================================

export interface FaultInjector {
  injectDb(op: DbOp, mode: DbFaultMode): void;
  injectAudit(mode: AuditFaultMode): void;
  injectFlag(mode: FlagFaultMode): void;
  injectClock(mode: ClockFaultMode): void;
  reset(): void;
  getDbFault(op: DbOp): DbFaultMode | null;
  getAuditFault(): AuditFaultMode | null;
  getFlagFault(): FlagFaultMode | null;
  getClockFault(): ClockFaultMode | null;
}

// ============================================================================
// Default Implementation
// ============================================================================

export class DefaultFaultInjector implements FaultInjector {
  private dbFaults = new Map<DbOp, DbFaultMode>();
  private auditFault: AuditFaultMode | null = null;
  private flagFault: FlagFaultMode | null = null;
  private clockFault: ClockFaultMode | null = null;

  injectDb(op: DbOp, mode: DbFaultMode): void {
    this.dbFaults.set(op, mode);
  }

  injectAudit(mode: AuditFaultMode): void {
    this.auditFault = mode;
  }

  injectFlag(mode: FlagFaultMode): void {
    this.flagFault = mode;
  }

  injectClock(mode: ClockFaultMode): void {
    this.clockFault = mode;
  }

  reset(): void {
    this.dbFaults.clear();
    this.auditFault = null;
    this.flagFault = null;
    this.clockFault = null;
  }

  getDbFault(op: DbOp): DbFaultMode | null {
    return this.dbFaults.get(op) ?? null;
  }

  getAuditFault(): AuditFaultMode | null {
    return this.auditFault;
  }

  getFlagFault(): FlagFaultMode | null {
    return this.flagFault;
  }

  getClockFault(): ClockFaultMode | null {
    return this.clockFault;
  }
}

// ============================================================================
// Fault Scenario Registry (deterministic, seeded)
// ============================================================================

export interface FaultScenario {
  id: string;
  surface: string;
  fault: string;
  expectedContract: string;
  /** Expected HTTP status class. null = internal/swallowed (no HTTP response). */
  expectedHttpClass: number | null;
  tier: 0 | 1 | 2;
  active: boolean;
}

export const FAULT_SCENARIOS: FaultScenario[] = [
  { id: 'F1',  surface: 'promote_store',    fault: 'db_insert_timeout',       expectedContract: '500_no_partial_row',       expectedHttpClass: 500, tier: 0, active: true },
  { id: 'F3',  surface: 'audit_adapter',    fault: 'audit_write_fail',        expectedContract: 'main_unchanged_no_throw',  expectedHttpClass: null, tier: 1, active: true },
  { id: 'F4',  surface: 'escalation_repo',  fault: 'cas_update_timeout',      expectedContract: '500_state_unchanged',      expectedHttpClass: 500, tier: 0, active: true },
  { id: 'F5',  surface: 'promote_store',    fault: 'ack_lost_retry',          expectedContract: 'p2002_select_idempotent',  expectedHttpClass: 202, tier: 0, active: true },
  { id: 'F6',  surface: 'phase7_pipeline',  fault: 'external_api_fault',      expectedContract: 'phase7_placeholder',       expectedHttpClass: null, tier: 2, active: false },
  { id: 'F7',  surface: 'phase7_pipeline',  fault: 'partial_response',        expectedContract: 'phase7_placeholder',       expectedHttpClass: null, tier: 2, active: false },
  { id: 'F9',  surface: 'evaluate_escalation', fault: 'clock_jump_backward',  expectedContract: 'hold_cooldown',            expectedHttpClass: null, tier: 1, active: true },
  { id: 'F10', surface: 'promote_store',    fault: 'duplicate_insert_race',   expectedContract: 'p2002_select_idempotent',  expectedHttpClass: 202, tier: 0, active: true },
  { id: 'F11', surface: 'escalation_repo',  fault: 'concurrent_stale_state',  expectedContract: 'cas_retry_or_409',         expectedHttpClass: 409, tier: 1, active: true },
  { id: 'F13', surface: 'audit_dedupe',     fault: 'unbounded_keys',          expectedContract: 'bounded_lru_cache',        expectedHttpClass: null, tier: 0, active: true },
  { id: 'F14', surface: 'promote_pipeline', fault: 'flag_toggle_mid_flight',  expectedContract: 'live_env_read_documented', expectedHttpClass: 503, tier: 1, active: true },
];

/**
 * Deterministic scenario selection by seed + scenario-id.
 * No randomness — same seed always selects same scenario.
 */
export function selectScenario(seed: number, scenarioId: string): FaultScenario | undefined {
  return FAULT_SCENARIOS.find((s) => s.id === scenarioId);
}

/**
 * Get all active scenarios for a given tier.
 */
export function getActiveScenariosByTier(tier: 0 | 1 | 2): FaultScenario[] {
  return FAULT_SCENARIOS.filter((s) => s.tier === tier && s.active);
}

// ============================================================================
// Error factories for fault simulation
// ============================================================================

export function createTimeoutError(surface: string): Error {
  const err = new Error(`${surface}: operation timed out`);
  err.name = 'TimeoutError';
  return err;
}

export function createConnResetError(surface: string): Error {
  const err = new Error(`${surface}: connection reset by peer`);
  err.name = 'ConnectionResetError';
  return err;
}

export function createP2002Error(): { code: string; meta: { target: string[] } } & Error {
  const err = new Error('Unique constraint failed') as any;
  err.code = 'P2002';
  err.meta = { target: ['incidentId', 'runId'] };
  err.name = 'PrismaClientKnownRequestError';
  return err;
}
