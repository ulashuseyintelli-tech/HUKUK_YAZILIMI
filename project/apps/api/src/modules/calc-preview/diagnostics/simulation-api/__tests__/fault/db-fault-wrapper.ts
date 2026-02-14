/**
 * DB Fault Wrapper — Injectable fault hooks for Prisma operations
 *
 * Wraps promote store and escalation repo mock factories with
 * op-based fault injection. Used by fault injection tests to
 * simulate DB timeouts, connection resets, and ack-lost scenarios.
 *
 * @see .kiro/specs/fault-injection-harness/design.md — D2.1, D2.2
 */

import {
  FaultInjector,
  DbOp,
  createTimeoutError,
  createConnResetError,
} from './fault-injector';

// ============================================================================
// Promote Store Mock with Fault Injection
// ============================================================================

export interface MockPromoteRecord {
  id: string;
  requestId: string;
  incidentId: string;
  runId: string;
  status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  resultRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a mock PromoteRequestStore with fault injection support.
 *
 * Fault modes:
 * - timeout: INSERT throws TimeoutError
 * - conn_reset: INSERT throws ConnectionResetError
 * - ack_lost: INSERT succeeds in DB but throws to caller (simulates ack-lost)
 */
export function createFaultablePromoteStore(injector: FaultInjector) {
  const db = new Map<string, MockPromoteRecord>();

  function makeKey(incidentId: string, runId: string): string {
    return `${incidentId}::${runId}`;
  }

  return {
    db,

    async claimOrGet(
      incidentId: string,
      runId: string,
      requestId: string,
    ): Promise<{ record: MockPromoteRecord; isNew: boolean }> {
      const fault = injector.getDbFault('promote_insert');
      const key = makeKey(incidentId, runId);

      if (fault === 'timeout') {
        throw createTimeoutError('promote_insert');
      }

      if (fault === 'conn_reset') {
        throw createConnResetError('promote_insert');
      }

      // Check for existing (P2002 path)
      const existing = db.get(key);
      if (existing) {
        return { record: existing, isNew: false };
      }

      // INSERT
      const now = new Date();
      const record: MockPromoteRecord = {
        id: `id-${requestId}`,
        requestId,
        incidentId,
        runId,
        status: 'IN_PROGRESS',
        resultRef: null,
        createdAt: now,
        updatedAt: now,
      };
      db.set(key, record);

      // ack_lost: write committed but caller sees failure
      if (fault === 'ack_lost') {
        throw createTimeoutError('promote_insert (ack_lost — row committed)');
      }

      return { record, isNew: true };
    },

    async get(incidentId: string, runId: string): Promise<MockPromoteRecord | null> {
      const fault = injector.getDbFault('promote_select');
      if (fault === 'timeout') {
        throw createTimeoutError('promote_select');
      }
      return db.get(makeKey(incidentId, runId)) ?? null;
    },

    async markSucceeded(incidentId: string, runId: string): Promise<void> {
      const fault = injector.getDbFault('promote_update');
      if (fault === 'timeout') {
        throw createTimeoutError('promote_update');
      }
      const key = makeKey(incidentId, runId);
      const record = db.get(key);
      if (record) {
        record.status = 'SUCCEEDED';
        record.updatedAt = new Date();
      }
    },

    async markFailed(incidentId: string, runId: string): Promise<void> {
      const key = makeKey(incidentId, runId);
      const record = db.get(key);
      if (record) {
        record.status = 'FAILED';
        record.updatedAt = new Date();
      }
    },
  };
}

// ============================================================================
// Escalation State Mock with CAS Fault Injection
// ============================================================================

export interface MockEscalationState {
  incidentId: string;
  currentLevel: 'NONE' | 'L1' | 'L2' | 'L3';
  lastTransitionAt: string;
  holdDownUntil: string | null;
  stableWindowCounter: number;
  stableWindowStartedAt: string | null;
  version: number;
}

/**
 * Creates a mock EscalationStateRepository with CAS fault injection.
 *
 * Fault modes:
 * - timeout: CAS UPDATE throws TimeoutError
 * - conn_reset: CAS UPDATE throws ConnectionResetError
 *
 * CAS semantics: version check on saveStateWithCas.
 */
export function createFaultableEscalationRepo(injector: FaultInjector) {
  const states = new Map<string, MockEscalationState>();

  return {
    states,

    async getState(incidentId: string): Promise<MockEscalationState | null> {
      return states.get(incidentId) ?? null;
    },

    async initState(incidentId: string): Promise<MockEscalationState> {
      const state: MockEscalationState = {
        incidentId,
        currentLevel: 'NONE',
        lastTransitionAt: new Date().toISOString(),
        holdDownUntil: null,
        stableWindowCounter: 0,
        stableWindowStartedAt: null,
        version: 1,
      };
      states.set(incidentId, state);
      return state;
    },

    async saveStateWithCas(
      incidentId: string,
      newState: Partial<MockEscalationState>,
      expectedVersion: number,
    ): Promise<MockEscalationState> {
      const fault = injector.getDbFault('escalation_update_cas');

      if (fault === 'timeout') {
        throw createTimeoutError('escalation_update_cas');
      }
      if (fault === 'conn_reset') {
        throw createConnResetError('escalation_update_cas');
      }

      const current = states.get(incidentId);
      if (!current) {
        throw new Error(`State not found for ${incidentId}`);
      }

      // CAS check
      if (current.version !== expectedVersion) {
        throw new CasMockConflictError(incidentId, expectedVersion);
      }

      // Apply update
      const updated: MockEscalationState = {
        ...current,
        ...newState,
        version: current.version + 1,
      };
      states.set(incidentId, updated);
      return updated;
    },
  };
}

export class CasMockConflictError extends Error {
  constructor(
    public readonly incidentId: string,
    public readonly expectedVersion: number,
  ) {
    super(`CAS conflict for ${incidentId} at version ${expectedVersion}`);
    this.name = 'CasMockConflictError';
  }
}
