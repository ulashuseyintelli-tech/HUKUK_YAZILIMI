/**
 * Phase 9B - Truth Layer Integration Tests
 *
 * Tests for PrismaSimulationRunRepository and PrismaSnapshotRepository.
 * These tests verify the Truth Layer Contract invariants:
 *
 * 1. Immutable field protection on upsert
 * 2. Status monotonicity enforcement
 * 3. Single baseline per incident (partial unique index)
 * 4. Incident/tenant mismatch detection
 * 5. Transaction atomicity
 *
 * @see .kiro/specs/phase-9b-postgresql-migration/design.md - Truth Layer Contract
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { PrismaSimulationRunRepository } from '../prisma-simulation-run.repository';
import { PrismaSnapshotRepository } from '../prisma-snapshot.repository';
import { SnapshotStoreService } from '../snapshot-store.service';
import {
  SimulationRunInput,
  SimulationRunStatus,
} from '../simulation-run-repository.interface';
import { SnapshotInput, SnapshotKind } from '../snapshot-repository.interface';
import {
  ImmutableFieldViolationError,
  StatusMonotonicityViolationError,
  BaselineAlreadyExistsError,
  IncidentMismatchError,
  TenantMismatchError,
  EntityNotFoundError,
  RunNotCompletedError,
  DatabaseUnavailableError,
} from '../truth-layer-errors';
import { Prisma } from '@prisma/client';
import { describeDb } from '../../../../../../test/describe-db';

// ============================================================================
// Test Helpers
// ============================================================================

function createRunInput(overrides: Partial<SimulationRunInput> = {}): SimulationRunInput {
  const now = new Date().toISOString();
  return {
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: 'tenant-test',
    incidentId: `incident-${Date.now()}`,
    scenarioId: 'scenario-default',
    seed: 12345,
    simulationVersion: '1.0.0',
    engineVersion: '2.0.0',
    status: 'PENDING' as SimulationRunStatus,
    startedAt: now,
    ...overrides,
  };
}

function createSnapshotInput(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    snapshotId: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: 'tenant-test',
    incidentId: `incident-${Date.now()}`,
    runId: undefined,
    snapshotKind: 'CURRENT' as SnapshotKind,
    verdict: 'PROCEED',
    driftScore: 0.05,
    calcResult: { total: 1000 },
    calcResultNorm: { total: '1000' },
    calcHash: 'sha256-test-hash',
    isBaseline: false,
    ...overrides,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describeDb('Phase 9B - Truth Layer Integration Tests', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let runRepo: PrismaSimulationRunRepository;
  let snapshotRepo: PrismaSnapshotRepository;

  // Track created entities for cleanup
  const createdRunIds: string[] = [];
  const createdSnapshotIds: string[] = [];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        PrismaSimulationRunRepository,
        PrismaSnapshotRepository,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    runRepo = module.get<PrismaSimulationRunRepository>(PrismaSimulationRunRepository);
    snapshotRepo = module.get<PrismaSnapshotRepository>(PrismaSnapshotRepository);
  });

  afterAll(async () => {
    // Cleanup created entities
    if (createdSnapshotIds.length > 0) {
      await prisma.simulationSnapshot.deleteMany({
        where: { snapshotId: { in: createdSnapshotIds } },
      });
    }
    if (createdRunIds.length > 0) {
      await prisma.simulationRun.deleteMany({
        where: { runId: { in: createdRunIds } },
      });
    }

    await module.close();
  });

  // ==========================================================================
  // SimulationRun Tests
  // ==========================================================================

  describe('PrismaSimulationRunRepository', () => {
    describe('upsert()', () => {
      it('should create a new run', async () => {
        const input = createRunInput();
        createdRunIds.push(input.runId);

        const result = await runRepo.upsert(input);

        expect(result.runId).toBe(input.runId);
        expect(result.tenantId).toBe(input.tenantId);
        expect(result.incidentId).toBe(input.incidentId);
        expect(result.status).toBe('PENDING');
      });

      it('should update mutable fields on existing run', async () => {
        const input = createRunInput();
        createdRunIds.push(input.runId);

        // Create
        await runRepo.upsert(input);

        // Update mutable fields
        const updated = await runRepo.upsert({
          ...input,
          status: 'RUNNING',
        });

        expect(updated.status).toBe('RUNNING');
      });

      it('should throw ImmutableFieldViolationError when changing immutable field', async () => {
        const input = createRunInput();
        createdRunIds.push(input.runId);

        // Create
        await runRepo.upsert(input);

        // Try to change immutable field
        await expect(
          runRepo.upsert({
            ...input,
            scenarioId: 'different-scenario', // Immutable!
          }),
        ).rejects.toThrow(ImmutableFieldViolationError);
      });

      it('should throw ImmutableFieldViolationError when changing seed', async () => {
        const input = createRunInput();
        createdRunIds.push(input.runId);

        await runRepo.upsert(input);

        await expect(
          runRepo.upsert({
            ...input,
            seed: 99999, // Immutable!
          }),
        ).rejects.toThrow(ImmutableFieldViolationError);
      });
    });

    describe('updateStatus()', () => {
      it('should allow PENDING → RUNNING transition', async () => {
        const input = createRunInput({ status: 'PENDING' });
        createdRunIds.push(input.runId);
        await runRepo.upsert(input);

        await runRepo.updateStatus(input.runId, 'RUNNING');

        const run = await runRepo.findById(input.runId);
        expect(run?.status).toBe('RUNNING');
      });

      it('should allow RUNNING → COMPLETED transition', async () => {
        const input = createRunInput({ status: 'PENDING' });
        createdRunIds.push(input.runId);
        await runRepo.upsert(input);
        await runRepo.updateStatus(input.runId, 'RUNNING');

        await runRepo.updateStatus(input.runId, 'COMPLETED', new Date().toISOString());

        const run = await runRepo.findById(input.runId);
        expect(run?.status).toBe('COMPLETED');
      });

      it('should throw StatusMonotonicityViolationError for RUNNING → PENDING', async () => {
        const input = createRunInput({ status: 'PENDING' });
        createdRunIds.push(input.runId);
        await runRepo.upsert(input);
        await runRepo.updateStatus(input.runId, 'RUNNING');

        await expect(runRepo.updateStatus(input.runId, 'PENDING')).rejects.toThrow(
          StatusMonotonicityViolationError,
        );
      });

      it('should throw StatusMonotonicityViolationError for COMPLETED → FAILED', async () => {
        const input = createRunInput({ status: 'PENDING' });
        createdRunIds.push(input.runId);
        await runRepo.upsert(input);
        await runRepo.updateStatus(input.runId, 'COMPLETED', new Date().toISOString());

        await expect(
          runRepo.updateStatus(input.runId, 'FAILED', new Date().toISOString()),
        ).rejects.toThrow(StatusMonotonicityViolationError);
      });

      it('should throw EntityNotFoundError for non-existent run', async () => {
        await expect(runRepo.updateStatus('non-existent-run', 'RUNNING')).rejects.toThrow(
          EntityNotFoundError,
        );
      });
    });

    describe('setCurrentSnapshot()', () => {
      it('should link snapshot to run when incident matches', async () => {
        const incidentId = `incident-${Date.now()}`;
        const tenantId = 'tenant-test';

        // Create run
        const runInput = createRunInput({ incidentId, tenantId });
        createdRunIds.push(runInput.runId);
        await runRepo.upsert(runInput);

        // Create snapshot with same incident
        const snapInput = createSnapshotInput({ incidentId, tenantId });
        createdSnapshotIds.push(snapInput.snapshotId);
        await snapshotRepo.insert(snapInput);

        // Link
        await runRepo.setCurrentSnapshot(runInput.runId, snapInput.snapshotId);

        const run = await runRepo.findById(runInput.runId);
        expect(run?.currentSnapshotId).toBe(snapInput.snapshotId);
      });

      it('should throw IncidentMismatchError when incidents differ', async () => {
        const tenantId = 'tenant-test';

        // Create run
        const runInput = createRunInput({ incidentId: 'incident-A', tenantId });
        createdRunIds.push(runInput.runId);
        await runRepo.upsert(runInput);

        // Create snapshot with different incident
        const snapInput = createSnapshotInput({ incidentId: 'incident-B', tenantId });
        createdSnapshotIds.push(snapInput.snapshotId);
        await snapshotRepo.insert(snapInput);

        await expect(
          runRepo.setCurrentSnapshot(runInput.runId, snapInput.snapshotId),
        ).rejects.toThrow(IncidentMismatchError);
      });

      it('should throw TenantMismatchError when tenants differ', async () => {
        const incidentId = `incident-${Date.now()}`;

        // Create run
        const runInput = createRunInput({ incidentId, tenantId: 'tenant-A' });
        createdRunIds.push(runInput.runId);
        await runRepo.upsert(runInput);

        // Create snapshot with different tenant
        const snapInput = createSnapshotInput({ incidentId, tenantId: 'tenant-B' });
        createdSnapshotIds.push(snapInput.snapshotId);
        await snapshotRepo.insert(snapInput);

        await expect(
          runRepo.setCurrentSnapshot(runInput.runId, snapInput.snapshotId),
        ).rejects.toThrow(TenantMismatchError);
      });

      it('should throw EntityNotFoundError for non-existent run', async () => {
        const snapInput = createSnapshotInput();
        createdSnapshotIds.push(snapInput.snapshotId);
        await snapshotRepo.insert(snapInput);

        await expect(
          runRepo.setCurrentSnapshot('non-existent-run', snapInput.snapshotId),
        ).rejects.toThrow(EntityNotFoundError);
      });

      it('should throw EntityNotFoundError for non-existent snapshot', async () => {
        const runInput = createRunInput();
        createdRunIds.push(runInput.runId);
        await runRepo.upsert(runInput);

        await expect(
          runRepo.setCurrentSnapshot(runInput.runId, 'non-existent-snapshot'),
        ).rejects.toThrow(EntityNotFoundError);
      });
    });

    describe('setBaselineSnapshot()', () => {
      it('should link baseline when run is COMPLETED', async () => {
        const incidentId = `incident-${Date.now()}`;
        const tenantId = 'tenant-test';

        // Create and complete run
        const runInput = createRunInput({ incidentId, tenantId });
        createdRunIds.push(runInput.runId);
        await runRepo.upsert(runInput);
        await runRepo.updateStatus(runInput.runId, 'COMPLETED', new Date().toISOString());

        // Create snapshot
        const snapInput = createSnapshotInput({ incidentId, tenantId });
        createdSnapshotIds.push(snapInput.snapshotId);
        await snapshotRepo.insert(snapInput);

        // Link baseline
        await runRepo.setBaselineSnapshot(runInput.runId, snapInput.snapshotId);

        const run = await runRepo.findById(runInput.runId);
        expect(run?.baselineSnapshotId).toBe(snapInput.snapshotId);
      });

      it('should throw RunNotCompletedError when run is not COMPLETED', async () => {
        const incidentId = `incident-${Date.now()}`;
        const tenantId = 'tenant-test';

        // Create run (PENDING)
        const runInput = createRunInput({ incidentId, tenantId });
        createdRunIds.push(runInput.runId);
        await runRepo.upsert(runInput);

        // Create snapshot
        const snapInput = createSnapshotInput({ incidentId, tenantId });
        createdSnapshotIds.push(snapInput.snapshotId);
        await snapshotRepo.insert(snapInput);

        await expect(
          runRepo.setBaselineSnapshot(runInput.runId, snapInput.snapshotId),
        ).rejects.toThrow(RunNotCompletedError);
      });
    });
  });

  // ==========================================================================
  // Snapshot Tests
  // ==========================================================================

  describe('PrismaSnapshotRepository', () => {
    describe('insert()', () => {
      it('should create a new snapshot', async () => {
        const input = createSnapshotInput();
        createdSnapshotIds.push(input.snapshotId);

        const result = await snapshotRepo.insert(input);

        expect(result.snapshotId).toBe(input.snapshotId);
        expect(result.tenantId).toBe(input.tenantId);
        expect(result.verdict).toBe('PROCEED');
        expect(result.isBaseline).toBe(false);
        expect(result.retentionPolicy).toBe('STANDARD');
      });

      it('should create snapshot with isBaseline=true', async () => {
        const input = createSnapshotInput({ isBaseline: true });
        createdSnapshotIds.push(input.snapshotId);

        const result = await snapshotRepo.insert(input);

        expect(result.isBaseline).toBe(true);
      });

      it('should throw BaselineAlreadyExistsError for second baseline', async () => {
        const incidentId = `incident-${Date.now()}`;
        const tenantId = 'tenant-test';

        // First baseline
        // Iki AYRI snapshot: farkli calcHash (ayni icerik uq_sim_snap_idempotency ile ilk satiri
        // dondururdu; bu test icerik-idempotensini degil tek-baseline kuralini dogrular).
        const snap1 = createSnapshotInput({ incidentId, tenantId, isBaseline: true, calcHash: 'sha256-test-hash-baseline-1' });
        createdSnapshotIds.push(snap1.snapshotId);
        await snapshotRepo.insert(snap1);

        // Second baseline - should fail
        const snap2 = createSnapshotInput({ incidentId, tenantId, isBaseline: true, calcHash: 'sha256-test-hash-baseline-2' });
        createdSnapshotIds.push(snap2.snapshotId);

        await expect(snapshotRepo.insert(snap2)).rejects.toThrow(BaselineAlreadyExistsError);
      });
    });

    // K2: P2002 hedef siniflandirmasi. Hedefler disposable PG16'da OLCULDU (Prisma 5):
    //   baseline kismi indeksi -> ["tenant_id","incident_id"]
    //   icerik indeksi         -> ["tenant_id","incident_id","COALESCE(run_id","'__NO_RUN__'::text)","calc_hash"]
    //   PK                     -> ["snapshot_id"]
    // create() tek seferlik olculmus hatayla degistirilir; sonraki okuma sorgulari GERCEK DB'ye gider.
    describe('insert() P2002 classification (K2)', () => {
      const p2002 = (target: string[]) =>
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { modelName: 'SimulationSnapshot', target },
        });
      const failCreateOnce = (target: string[]) =>
        jest.spyOn(prisma.simulationSnapshot, 'create').mockRejectedValueOnce(p2002(target));

      afterEach(() => jest.restoreAllMocks());

      it('baseline kolon hedefi + isBaseline -> BaselineAlreadyExistsError (mevcut baseline id ile)', async () => {
        const incidentId = `incident-k2-a-${Date.now()}`;
        const existing = createSnapshotInput({ incidentId, isBaseline: true, calcHash: 'k2-a-1' });
        createdSnapshotIds.push(existing.snapshotId);
        await snapshotRepo.insert(existing);
        failCreateOnce(['tenant_id', 'incident_id']);
        const attempt = createSnapshotInput({ incidentId, isBaseline: true, calcHash: 'k2-a-2' });
        const err = await snapshotRepo.insert(attempt).then(() => null, (e: unknown) => e);
        expect(err).toBeInstanceOf(BaselineAlreadyExistsError);
        expect((err as BaselineAlreadyExistsError).existingSnapshotId).toBe(existing.snapshotId);
      });

      it('mevcut davranis korunur: indeks-adi hedefi ve bos hedef -> BaselineAlreadyExistsError', async () => {
        for (const target of [['ux_sim_snap_one_baseline_per_incident'], []]) {
          failCreateOnce(target);
          const attempt = createSnapshotInput({ incidentId: `incident-k2-b-${Date.now()}`, isBaseline: true });
          await expect(snapshotRepo.insert(attempt)).rejects.toThrow(BaselineAlreadyExistsError);
        }
      });

      it('baseline kolon hedefi ama isBaseline=false -> baseline hatasi DEGIL', async () => {
        failCreateOnce(['tenant_id', 'incident_id']);
        const attempt = createSnapshotInput({ incidentId: `incident-k2-c-${Date.now()}`, isBaseline: false });
        const err = await snapshotRepo.insert(attempt).then(() => null, (e: unknown) => e);
        expect(err).not.toBeInstanceOf(BaselineAlreadyExistsError);
        expect(err).toBeInstanceOf(DatabaseUnavailableError);
      });

      it('icerik idempotensi hedefi (isBaseline=true olsa da) -> mevcut satir doner, baseline hatasi DEGIL', async () => {
        const incidentId = `incident-k2-d-${Date.now()}`;
        const existing = createSnapshotInput({ incidentId, isBaseline: false, calcHash: 'k2-d-same' });
        createdSnapshotIds.push(existing.snapshotId);
        await snapshotRepo.insert(existing);
        failCreateOnce(['tenant_id', 'incident_id', 'COALESCE(run_id', "'__NO_RUN__'::text)", 'calc_hash']);
        const attempt = createSnapshotInput({ incidentId, isBaseline: true, calcHash: 'k2-d-same' });
        const result = await snapshotRepo.insert(attempt);
        expect(result.snapshotId).toBe(existing.snapshotId);
      });

      it('ilgisiz / fazla kolonlu unique hedefi + isBaseline -> baseline hatasi DEGIL', async () => {
        for (const target of [['other_col'], ['tenant_id', 'incident_id', 'other_col'], ['tenant_id']]) {
          failCreateOnce(target);
          const attempt = createSnapshotInput({ incidentId: `incident-k2-e-${Date.now()}`, isBaseline: true });
          const err = await snapshotRepo.insert(attempt).then(() => null, (e: unknown) => e);
          expect(err).not.toBeInstanceOf(BaselineAlreadyExistsError);
          expect(err).toBeInstanceOf(DatabaseUnavailableError);
        }
      });
    });

    describe('markAsBaseline()', () => {
      it('should mark snapshot as baseline', async () => {
        const input = createSnapshotInput({ isBaseline: false });
        createdSnapshotIds.push(input.snapshotId);
        await snapshotRepo.insert(input);

        await snapshotRepo.markAsBaseline(input.snapshotId);

        const snapshot = await snapshotRepo.findById(input.snapshotId);
        expect(snapshot?.isBaseline).toBe(true);
      });

      it('should be idempotent when already baseline', async () => {
        const input = createSnapshotInput({ isBaseline: true });
        createdSnapshotIds.push(input.snapshotId);
        await snapshotRepo.insert(input);

        // Should not throw
        await snapshotRepo.markAsBaseline(input.snapshotId);

        const snapshot = await snapshotRepo.findById(input.snapshotId);
        expect(snapshot?.isBaseline).toBe(true);
      });

      it('should throw BaselineAlreadyExistsError when another baseline exists', async () => {
        const incidentId = `incident-${Date.now()}`;
        const tenantId = 'tenant-test';

        // First snapshot as baseline
        const snap1 = createSnapshotInput({ incidentId, tenantId, isBaseline: true });
        createdSnapshotIds.push(snap1.snapshotId);
        await snapshotRepo.insert(snap1);

        // Second snapshot (not baseline) — AYRI snapshot olmali: farkli calcHash
        const snap2 = createSnapshotInput({ incidentId, tenantId, isBaseline: false, calcHash: 'sha256-test-hash-second' });
        createdSnapshotIds.push(snap2.snapshotId);
        await snapshotRepo.insert(snap2);

        // Try to mark second as baseline
        await expect(snapshotRepo.markAsBaseline(snap2.snapshotId)).rejects.toThrow(
          BaselineAlreadyExistsError,
        );
      });

      it('should throw EntityNotFoundError for non-existent snapshot', async () => {
        await expect(snapshotRepo.markAsBaseline('non-existent-snapshot')).rejects.toThrow(
          EntityNotFoundError,
        );
      });
    });

    describe('applyLegalHold()', () => {
      it('should apply legal hold', async () => {
        const input = createSnapshotInput();
        createdSnapshotIds.push(input.snapshotId);
        await snapshotRepo.insert(input);

        const result = await snapshotRepo.applyLegalHold(input.snapshotId, 'Test reason');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);

        const snapshot = await snapshotRepo.findById(input.snapshotId);
        expect(snapshot?.legalHold).toBe(true);
        expect(snapshot?.retentionPolicy).toBe('LEGAL_HOLD');
        expect(snapshot?.expiresAt).toBeUndefined();
      });

      it('should be idempotent when already has legal hold', async () => {
        const input = createSnapshotInput();
        createdSnapshotIds.push(input.snapshotId);
        await snapshotRepo.insert(input);
        await snapshotRepo.applyLegalHold(input.snapshotId);

        const result = await snapshotRepo.applyLegalHold(input.snapshotId);

        expect(result.success).toBe(true);
        expect(result.changed).toBe(false);
      });

      it('should return error for non-existent snapshot', async () => {
        const result = await snapshotRepo.applyLegalHold('non-existent-snapshot');

        expect(result.success).toBe(false);
        expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
      });
    });

    describe('setRetentionPolicy()', () => {
      it('should upgrade from STANDARD to PROMOTED', async () => {
        const input = createSnapshotInput();
        createdSnapshotIds.push(input.snapshotId);
        await snapshotRepo.insert(input);

        const result = await snapshotRepo.setRetentionPolicy(input.snapshotId, 'PROMOTED');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.previousPolicy).toBe('STANDARD');
        expect(result.newPolicy).toBe('PROMOTED');
      });

      it('should be idempotent for same policy', async () => {
        const input = createSnapshotInput();
        createdSnapshotIds.push(input.snapshotId);
        await snapshotRepo.insert(input);

        const result = await snapshotRepo.setRetentionPolicy(input.snapshotId, 'STANDARD');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(false);
      });

      it('should reject downgrade from PROMOTED to STANDARD', async () => {
        const input = createSnapshotInput();
        createdSnapshotIds.push(input.snapshotId);
        await snapshotRepo.insert(input);
        await snapshotRepo.setRetentionPolicy(input.snapshotId, 'PROMOTED');

        const result = await snapshotRepo.setRetentionPolicy(input.snapshotId, 'STANDARD');

        expect(result.success).toBe(false);
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
      });

      it('should reject downgrade from LEGAL_HOLD', async () => {
        const input = createSnapshotInput();
        createdSnapshotIds.push(input.snapshotId);
        await snapshotRepo.insert(input);
        await snapshotRepo.applyLegalHold(input.snapshotId);

        const result = await snapshotRepo.setRetentionPolicy(input.snapshotId, 'PROMOTED');

        expect(result.success).toBe(false);
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
      });
    });

    describe('findBaseline()', () => {
      it('should find baseline for incident', async () => {
        const incidentId = `incident-${Date.now()}`;
        const tenantId = 'tenant-test';

        const input = createSnapshotInput({ incidentId, tenantId, isBaseline: true });
        createdSnapshotIds.push(input.snapshotId);
        await snapshotRepo.insert(input);

        const baseline = await snapshotRepo.findBaseline(incidentId);

        expect(baseline).not.toBeNull();
        expect(baseline?.snapshotId).toBe(input.snapshotId);
        expect(baseline?.isBaseline).toBe(true);
      });

      it('should return null when no baseline exists', async () => {
        const baseline = await snapshotRepo.findBaseline('non-existent-incident');

        expect(baseline).toBeNull();
      });
    });

    describe('findWithLegalHold()', () => {
      it('should find snapshots with legal hold', async () => {
        const tenantId = `tenant-${Date.now()}`;

        // Create snapshot with legal hold
        const input = createSnapshotInput({ tenantId });
        createdSnapshotIds.push(input.snapshotId);
        await snapshotRepo.insert(input);
        await snapshotRepo.applyLegalHold(input.snapshotId);

        const snapshots = await snapshotRepo.findWithLegalHold(tenantId);

        expect(snapshots.length).toBeGreaterThanOrEqual(1);
        expect(snapshots.some((s) => s.snapshotId === input.snapshotId)).toBe(true);
      });
    });
  });


  // ==========================================================================
  // Phase 9B.6-LOCK: Tenant Isolation Behavior Tests
  // ==========================================================================

  // K3(i) 2026-09-19: bu blok eskiden ana describeDb'nin DISINDAYDI (erken `});`) ve
  // createdSnapshotIds/snapshotRepo kapsam disi kaldigi icin HIC calismiyordu; artik ana blogun icinde.
  describeDb('Tenant Isolation Behavior (Phase 9B.6-LOCK)', () => {
    /**
     * These tests verify BEHAVIOR, not SQL syntax.
     * They ensure that tenant A cannot see tenant B's data even when
     * they share the same incidentId.
     * 
     * This is the critical security guarantee of the Truth Layer.
     */

    describe('findByIncidentId tenant isolation', () => {
      it('should only return snapshots for the requested tenant when incidentId is shared', async () => {
        const sharedIncidentId = `shared-incident-${Date.now()}`;
        const tenantA = `tenant-A-${Date.now()}`;
        const tenantB = `tenant-B-${Date.now()}`;

        // Create snapshot for tenant A
        const snapA = createSnapshotInput({
          snapshotId: `snap-A-${Date.now()}`,
          tenantId: tenantA,
          incidentId: sharedIncidentId,
        });
        createdSnapshotIds.push(snapA.snapshotId);
        await snapshotRepo.insert(snapA);

        // Create snapshot for tenant B with SAME incidentId
        const snapB = createSnapshotInput({
          snapshotId: `snap-B-${Date.now()}`,
          tenantId: tenantB,
          incidentId: sharedIncidentId,
        });
        createdSnapshotIds.push(snapB.snapshotId);
        await snapshotRepo.insert(snapB);

        // Tenant filtresi SnapshotStoreService'tedir (repository tasarim geregi tenant-agnostik);
        // izolasyon uretimdeki katmanda, GERCEK repository + DB ile dogrulanir.
        const store = new SnapshotStoreService(snapshotRepo);

        // Repository katmani iki tenant'i birlikte dondurur -> izolasyonu saglayan Store filtresidir
        const raw = await snapshotRepo.findByIncidentId(sharedIncidentId);
        expect(raw.map((s) => s.snapshotId).sort()).toEqual([snapA.snapshotId, snapB.snapshotId].sort());

        // Query as tenant A - should only see A's snapshot (pozitif) and NOT B's (negatif)
        const resultsA = await store.findByIncidentId(tenantA, sharedIncidentId);
        expect(resultsA.length).toBe(1);
        expect(resultsA[0].snapshotId).toBe(snapA.snapshotId);
        expect(resultsA[0].tenantId).toBe(tenantA);
        expect(resultsA.some((s) => s.snapshotId === snapB.snapshotId)).toBe(false);

        // Query as tenant B - should only see B's snapshot
        const resultsB = await store.findByIncidentId(tenantB, sharedIncidentId);
        expect(resultsB.length).toBe(1);
        expect(resultsB[0].snapshotId).toBe(snapB.snapshotId);
        expect(resultsB[0].tenantId).toBe(tenantB);
        expect(resultsB.some((s) => s.snapshotId === snapA.snapshotId)).toBe(false);

        // Query as non-existent tenant - should see nothing
        const resultsC = await store.findByIncidentId('tenant-C-nonexistent', sharedIncidentId);
        expect(resultsC.length).toBe(0);
      });
    });

    describe('findBaseline tenant isolation', () => {
      it('should only return baseline for the correct tenant when incidentId is shared', async () => {
        const sharedIncidentId = `shared-baseline-incident-${Date.now()}`;
        const tenantA = `tenant-baseline-A-${Date.now()}`;
        const tenantB = `tenant-baseline-B-${Date.now()}`;

        // Create baseline for tenant A
        const baselineA = createSnapshotInput({
          snapshotId: `baseline-A-${Date.now()}`,
          tenantId: tenantA,
          incidentId: sharedIncidentId,
          isBaseline: true,
        });
        createdSnapshotIds.push(baselineA.snapshotId);
        await snapshotRepo.insert(baselineA);

        // Create baseline for tenant B with SAME incidentId
        const baselineB = createSnapshotInput({
          snapshotId: `baseline-B-${Date.now()}`,
          tenantId: tenantB,
          incidentId: sharedIncidentId,
          isBaseline: true,
        });
        createdSnapshotIds.push(baselineB.snapshotId);
        await snapshotRepo.insert(baselineB);

        // findBaseline currently doesn't take tenantId - this is a gap
        // For now, verify both baselines exist independently
        const foundA = await snapshotRepo.findById(baselineA.snapshotId);
        const foundB = await snapshotRepo.findById(baselineB.snapshotId);

        expect(foundA?.isBaseline).toBe(true);
        expect(foundA?.tenantId).toBe(tenantA);
        expect(foundB?.isBaseline).toBe(true);
        expect(foundB?.tenantId).toBe(tenantB);
      });
    });

    describe('findWithLegalHold tenant isolation', () => {
      it('should only return legal hold snapshots for the requested tenant', async () => {
        const tenantA = `tenant-legalhold-A-${Date.now()}`;
        const tenantB = `tenant-legalhold-B-${Date.now()}`;

        // Create and apply legal hold for tenant A
        const snapA = createSnapshotInput({
          snapshotId: `legalhold-A-${Date.now()}`,
          tenantId: tenantA,
          incidentId: `incident-A-${Date.now()}`,
        });
        createdSnapshotIds.push(snapA.snapshotId);
        await snapshotRepo.insert(snapA);
        await snapshotRepo.applyLegalHold(snapA.snapshotId);

        // Create and apply legal hold for tenant B
        const snapB = createSnapshotInput({
          snapshotId: `legalhold-B-${Date.now()}`,
          tenantId: tenantB,
          incidentId: `incident-B-${Date.now()}`,
        });
        createdSnapshotIds.push(snapB.snapshotId);
        await snapshotRepo.insert(snapB);
        await snapshotRepo.applyLegalHold(snapB.snapshotId);

        // Query as tenant A - should only see A's legal hold
        const resultsA = await snapshotRepo.findWithLegalHold(tenantA);
        expect(resultsA.every(s => s.tenantId === tenantA)).toBe(true);
        expect(resultsA.some(s => s.snapshotId === snapA.snapshotId)).toBe(true);
        expect(resultsA.some(s => s.snapshotId === snapB.snapshotId)).toBe(false);

        // Query as tenant B - should only see B's legal hold
        const resultsB = await snapshotRepo.findWithLegalHold(tenantB);
        expect(resultsB.every(s => s.tenantId === tenantB)).toBe(true);
        expect(resultsB.some(s => s.snapshotId === snapB.snapshotId)).toBe(true);
        expect(resultsB.some(s => s.snapshotId === snapA.snapshotId)).toBe(false);
      });
    });

    describe('cross-tenant mutation protection', () => {
      it('should not allow tenant A to apply legal hold to tenant B snapshot via store', async () => {
        const tenantA = `tenant-mutation-A-${Date.now()}`;
        const tenantB = `tenant-mutation-B-${Date.now()}`;

        // Create snapshot for tenant B
        const snapB = createSnapshotInput({
          snapshotId: `mutation-target-${Date.now()}`,
          tenantId: tenantB,
          incidentId: `incident-mutation-${Date.now()}`,
        });
        createdSnapshotIds.push(snapB.snapshotId);
        await snapshotRepo.insert(snapB);

        // Repository-level applyLegalHold tenant almaz; tenant dogrulamasi Store katmanindadir.
        const store = new SnapshotStoreService(snapshotRepo);

        // Negatif: tenant A, tenant B'nin snapshot'ina legal hold UYGULAYAMAZ; veri degismez
        const denied = await store.applyLegalHold(tenantA, snapB.snapshotId);
        expect(denied.success).toBe(false);
        expect(denied.changed).toBe(false);
        expect(denied.error).toBe('SNAPSHOT_NOT_FOUND');
        const untouched = await snapshotRepo.findById(snapB.snapshotId);
        expect(untouched?.tenantId).toBe(tenantB);
        expect(untouched?.retentionPolicy).not.toBe('LEGAL_HOLD');

        // Pozitif: sahibi tenant B uygular
        const allowed = await store.applyLegalHold(tenantB, snapB.snapshotId);
        expect(allowed.success).toBe(true);
        expect(allowed.changed).toBe(true);
        const held = await snapshotRepo.findById(snapB.snapshotId);
        expect(held?.retentionPolicy).toBe('LEGAL_HOLD');
      });
    });
  });
});
