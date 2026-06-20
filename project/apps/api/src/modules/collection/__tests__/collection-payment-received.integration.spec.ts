/**
 * Collection Service — PAYMENT_RECEIVED Integration Tests
 *
 * Phase 2 Sprint 2B
 *
 * Coverage:
 * - Test 1: Normal payment → collection + event + outbox in same tx
 * - Test 2: Closed case (HITAM/INFAZ) → BadRequestException, nothing created
 * - Test 3: External duplicate sourceId → ConflictException, no new event
 * - Test 4: PAYMENT_RECEIVED payload has no allocation fields
 * - Test 5: Currency empty → event payload has explicit 'TRY'
 * - Test 6: forDebtorId present → appears in payload
 * - Test 7: autoAllocateInTx fail → full rollback (collection + event + outbox gone)
 * - Test 8: EXTERNAL_SIGNED without evidence → HR-34 fail
 *
 * Requires: DATABASE_URL pointing to test database with migrations applied.
 */
import { CaseDebtorLifecycleStatus, PrismaClient } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CollectionService } from '../collection.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { CreateCollectionDto, CollectionSource, CollectionType } from '../dto/collection.dto';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const describeIf = DATABASE_URL ? describe : describe.skip;

describeIf('CollectionService — PAYMENT_RECEIVED Integration', () => {
  let prisma: PrismaClient;
  let service: CollectionService;
  let domainEventIngest: DomainEventIngestService;
  let testTenantId: string;
  let testClientId: string;
  let testCaseId: string;
  let testCaseDebtorId: string;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    });
    await prisma.$connect();
    domainEventIngest = new DomainEventIngestService();
    service = new CollectionService(
      prisma as any,
      domainEventIngest,
      new CaseDebtorLifecycleGuardService(prisma as any)
    );
  });

  afterEach(async () => {
    await cleanupTenant(testTenantId);
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
  });

  async function cleanupTenant(tenantId?: string) {
    if (!tenantId) return;

    await (prisma as any).collectionAllocation.deleteMany({
      where: { collection: { tenantId } },
    });
    await (prisma as any).icrabotOutboxAction.deleteMany({
      where: { tenantId },
    });
    await (prisma as any).icrabotTimelineEntry.deleteMany({
      where: { tenantId },
    });
    await prisma.collection.deleteMany({ where: { tenantId } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });

    createdTenantIds.delete(tenantId);
  }

  beforeEach(async () => {
    // Create tenant-scoped case, client, debtor, and CaseDebtor for each test.
    testTenantId = `test-tenant-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(testTenantId);

    await prisma.tenant.create({
      data: { id: testTenantId, name: 'Test Tenant', slug: `test-${randomUUID().slice(0, 8)}` },
    });

    const client = await prisma.client.create({
      data: {
        tenantId: testTenantId,
        displayName: 'Test Muvekkil',
        type: 'INDIVIDUAL',
      },
    });
    testClientId = client.id;

    const debtor = await prisma.debtor.create({
      data: {
        tenantId: testTenantId,
        name: 'Test Borclu',
        type: 'INDIVIDUAL',
      },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId: testTenantId,
        clientId: client.id,
        fileNumber: `TEST-${randomUUID().slice(0, 6)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
      },
    });
    testCaseId = caseRow.id;

    const caseDebtor = await prisma.caseDebtor.create({
      data: {
        caseId: testCaseId,
        debtorId: debtor.id,
        role: 'ASIL_BORCLU',
      },
    });
    testCaseDebtorId = caseDebtor.id;
  });

  function buildDto(overrides: Partial<CreateCollectionDto> = {}): CreateCollectionDto {
    return {
      caseId: testCaseId,
      amount: 5000,
      type: CollectionType.BANK_TRANSFER,
      date: new Date().toISOString(),
      ...overrides,
    } as CreateCollectionDto;
  }

  async function createCaseDebtorFixture(tenantId: string, caseId: string) {
    const debtor = await prisma.debtor.create({
      data: {
        tenantId,
        name: `Test Borclu ${randomUUID().slice(0, 6)}`,
        type: 'INDIVIDUAL',
      },
    });

    return prisma.caseDebtor.create({
      data: {
        caseId,
        debtorId: debtor.id,
        role: 'ASIL_BORCLU',
      },
    });
  }

  async function createForeignTenantCaseDebtorFixture() {
    const tenantId = `foreign-tenant-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: 'Foreign Tenant', slug: `foreign-${randomUUID().slice(0, 8)}` },
    });

    const client = await prisma.client.create({
      data: {
        tenantId,
        displayName: 'Foreign Muvekkil',
        type: 'INDIVIDUAL',
      },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `FOREIGN-${randomUUID().slice(0, 6)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
      },
    });

    return createCaseDebtorFixture(tenantId, caseRow.id);
  }

  describe('PR-2a: caseDebtorId integrity guard', () => {
    it('accepts a CaseDebtor attached to the same case and tenant', async () => {
      const result = await service.create(
        testTenantId,
        buildDto({ caseDebtorId: testCaseDebtorId }),
        'test-user-1',
      );

      expect(result.caseDebtorId).toBe(testCaseDebtorId);
    });

    it('rejects a passive CaseDebtor before creating collection, event, or outbox rows', async () => {
      await prisma.caseDebtor.update({
        where: { id: testCaseDebtorId },
        data: { lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE },
      });

      await expect(
        service.create(
          testTenantId,
          buildDto({ caseDebtorId: testCaseDebtorId }),
          'test-user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(prisma.collection.count({ where: { tenantId: testTenantId } })).resolves.toBe(0);
      await expect((prisma as any).icrabotTimelineEntry.count({ where: { tenantId: testTenantId } })).resolves.toBe(0);
      await expect((prisma as any).icrabotOutboxAction.count({ where: { tenantId: testTenantId } })).resolves.toBe(0);
    });

    it('rejects orphan caseDebtorId before creating a collection', async () => {
      await expect(
        service.create(
          testTenantId,
          buildDto({ caseDebtorId: `missing-${randomUUID()}` }),
          'test-user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(prisma.collection.count({ where: { tenantId: testTenantId } })).resolves.toBe(0);
    });

    it('rejects a CaseDebtor attached to another case in the same tenant', async () => {
      const otherCase = await prisma.case.create({
        data: {
          tenantId: testTenantId,
          clientId: testClientId,
          fileNumber: `TEST-OTHER-${randomUUID().slice(0, 6)}`,
          type: 'GENERAL_EXECUTION',
          caseStatus: 'DERDEST',
          status: 'ACTIVE',
        },
      });
      const otherCaseDebtor = await createCaseDebtorFixture(testTenantId, otherCase.id);

      await expect(
        service.create(
          testTenantId,
          buildDto({ caseDebtorId: otherCaseDebtor.id }),
          'test-user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(prisma.collection.count({ where: { tenantId: testTenantId } })).resolves.toBe(0);
    });

    it('rejects a CaseDebtor from another tenant', async () => {
      const foreignCaseDebtor = await createForeignTenantCaseDebtorFixture();

      await expect(
        service.create(
          testTenantId,
          buildDto({ caseDebtorId: foreignCaseDebtor.id }),
          'test-user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(prisma.collection.count({ where: { tenantId: testTenantId } })).resolves.toBe(0);
    });
  });

  // ── Test 1: Normal payment creates collection + event + outbox ─────────

  describe('Test 1: Normal payment → same-tx atomic creation', () => {
    it('creates collection row, PAYMENT_RECEIVED event, and outbox row', async () => {
      const dto = buildDto({ sourceType: CollectionSource.MANUAL });
      const result = await service.create(testTenantId, dto, 'test-user-1');

      // Collection exists
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(Number(result.amount)).toBe(5000);

      // Event exists (timeline entry with PAYMENT_RECEIVED)
      const event = await (prisma as any).icrabotTimelineEntry.findFirst({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });
      expect(event).not.toBeNull();
      expect(event.aggregateVersion).toBe(BigInt(1));

      // Outbox exists
      const outbox = await (prisma as any).icrabotOutboxAction.findFirst({
        where: {
          caseId: testCaseId,
          actionType: 'EVENT_PUBLISHED:PAYMENT_RECEIVED',
        },
      });
      expect(outbox).not.toBeNull();
    });
  });

  // ── Test 2: Closed case → reject ──────────────────────────────────────

  describe('Test 2: Closed case → BadRequestException', () => {
    it('HITAM case rejects payment, nothing created', async () => {
      // Set case to HITAM
      await prisma.case.update({
        where: { id: testCaseId },
        data: { caseStatus: 'HITAM' },
      });

      const dto = buildDto();

      await expect(
        service.create(testTenantId, dto, 'test-user-1'),
      ).rejects.toThrow(/Kapalı dosyaya tahsilat eklenemez/);

      // No collection created
      const collections = await prisma.collection.findMany({
        where: { caseId: testCaseId },
      });
      expect(collections).toHaveLength(0);

      // No event created
      const events = await (prisma as any).icrabotTimelineEntry.findMany({
        where: { caseId: testCaseId },
      });
      expect(events).toHaveLength(0);
    });

    it('INFAZ case also rejects', async () => {
      await prisma.case.update({
        where: { id: testCaseId },
        data: { caseStatus: 'INFAZ' },
      });

      await expect(
        service.create(testTenantId, buildDto(), 'test-user-1'),
      ).rejects.toThrow(/Kapalı dosyaya/);
    });
  });

  // ── Test 3: External duplicate → ConflictException ────────────────────

  describe('Test 3: External duplicate sourceId → ConflictException', () => {
    it('rejects duplicate BANK_SEIZURE with same sourceId', async () => {
      const dto = buildDto({
        sourceType: CollectionSource.BANK_SEIZURE,
        sourceId: 'BANK-TX-12345',
      });

      // First payment succeeds
      await service.create(testTenantId, dto, 'test-user-1');

      // Second payment with same sourceId fails
      await expect(
        service.create(testTenantId, dto, 'test-user-1'),
      ).rejects.toThrow(/Duplicate payment/);

      // Only one event exists
      const events = await (prisma as any).icrabotTimelineEntry.findMany({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });
      expect(events).toHaveLength(1);
    });

    it('MANUAL source allows same amount without conflict', async () => {
      const dto = buildDto({ sourceType: CollectionSource.MANUAL });

      await service.create(testTenantId, dto, 'test-user-1');
      const result2 = await service.create(testTenantId, dto, 'test-user-1');

      expect(result2).toBeDefined();

      // Two events exist
      const events = await (prisma as any).icrabotTimelineEntry.findMany({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });
      expect(events).toHaveLength(2);
    });
  });

  // ── Test 4: Payload has no allocation fields ──────────────────────────

  describe('Test 4: PAYMENT_RECEIVED payload — no allocation', () => {
    it('event payload contains amount/currency/source but NOT allocation breakdown', async () => {
      const dto = buildDto({ amount: 7500, currency: 'TRY' });
      await service.create(testTenantId, dto, 'test-user-1');

      const event = await (prisma as any).icrabotTimelineEntry.findFirst({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });

      const payload = event.body.payload;

      // Present
      expect(payload.amount).toBe(7500);
      expect(payload.currency).toBe('TRY');
      expect(payload.sourceType).toBeDefined();
      expect(payload.collectionId).toBeDefined();

      // Absent (Anayasa C: allocation = projection, not event)
      expect(payload.allocatedToPrincipal).toBeUndefined();
      expect(payload.allocatedToInterest).toBeUndefined();
      expect(payload.allocatedToExpense).toBeUndefined();
      expect(payload.remainingBalance).toBeUndefined();
      expect(payload.allocationBreakdown).toBeUndefined();
    });
  });

  // ── Test 5: Currency normalization ────────────────────────────────────

  describe('Test 5: Currency empty → explicit TRY in event', () => {
    it('event payload has TRY when DTO currency is undefined', async () => {
      const dto = buildDto();
      delete (dto as any).currency; // simulate empty

      await service.create(testTenantId, dto, 'test-user-1');

      const event = await (prisma as any).icrabotTimelineEntry.findFirst({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });

      expect(event.body.payload.currency).toBe('TRY');
    });
  });

  // ── Test 6: forDebtorId propagation ───────────────────────────────────

  describe('Test 6: forDebtorId → payload', () => {
    it('caseDebtorId appears as forDebtorId in event payload', async () => {
      const dto = buildDto({ caseDebtorId: testCaseDebtorId });
      await service.create(testTenantId, dto, 'test-user-1');

      const event = await (prisma as any).icrabotTimelineEntry.findFirst({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });

      expect(event.body.payload.forDebtorId).toBe(testCaseDebtorId);
    });

    it('forDebtorId absent when caseDebtorId not provided', async () => {
      const dto = buildDto();
      await service.create(testTenantId, dto, 'test-user-1');

      const event = await (prisma as any).icrabotTimelineEntry.findFirst({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });

      expect(event.body.payload.forDebtorId).toBeUndefined();
    });
  });

  // ── Test 7: autoAllocate fail → full rollback ─────────────────────────

  describe('Test 7: Allocation failure → full rollback', () => {
    it('if autoAllocate throws, collection + event + outbox all rolled back', async () => {
      // Sabotage: create a case with invalid state that will cause allocation to fail
      // We'll use a spy to force autoAllocateInTx to throw
      const originalMethod = (service as any).autoAllocateInTx.bind(service);
      (service as any).autoAllocateInTx = async () => {
        throw new Error('ALLOCATION_FAILURE: simulated projection crash');
      };

      const dto = buildDto({ autoAllocate: true });

      await expect(
        service.create(testTenantId, dto, 'test-user-1'),
      ).rejects.toThrow(/ALLOCATION_FAILURE/);

      // Full rollback: no collection
      const collections = await prisma.collection.findMany({
        where: { caseId: testCaseId },
      });
      expect(collections).toHaveLength(0);

      // Full rollback: no event
      const events = await (prisma as any).icrabotTimelineEntry.findMany({
        where: { caseId: testCaseId },
      });
      expect(events).toHaveLength(0);

      // Full rollback: no outbox
      const outbox = await (prisma as any).icrabotOutboxAction.findMany({
        where: { caseId: testCaseId },
      });
      expect(outbox).toHaveLength(0);

      // Restore
      (service as any).autoAllocateInTx = originalMethod;
    });
  });

  // ── Test 8: EXTERNAL_SIGNED without evidence → HR-34 fail ────────────

  describe('Test 8: EXTERNAL_SIGNED without evidence → HR-34 rejection', () => {
    it('BANK_SEIZURE without sourceId → event validation fails, nothing persisted', async () => {
      const dto = buildDto({
        sourceType: CollectionSource.BANK_SEIZURE,
        // sourceId intentionally omitted → occurredAtEvidence will be undefined
        // But BANK_SEIZURE maps to EXTERNAL_SIGNED confidence
      });
      // Remove sourceId explicitly
      delete (dto as any).sourceId;

      await expect(
        service.create(testTenantId, dto, 'test-user-1'),
      ).rejects.toThrow(); // HR-34: EvidenceMissingError

      // Nothing persisted
      const collections = await prisma.collection.findMany({
        where: { caseId: testCaseId },
      });
      expect(collections).toHaveLength(0);

      const events = await (prisma as any).icrabotTimelineEntry.findMany({
        where: { caseId: testCaseId },
      });
      expect(events).toHaveLength(0);
    });

    it('BANK_SEIZURE with sourceId → succeeds (evidence present)', async () => {
      const dto = buildDto({
        sourceType: CollectionSource.BANK_SEIZURE,
        sourceId: 'BANK-EVIDENCE-REF-001',
      });

      const result = await service.create(testTenantId, dto, 'test-user-1');
      expect(result).toBeDefined();

      const event = await (prisma as any).icrabotTimelineEntry.findFirst({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });
      expect(event.body.header.occurredAtConfidence).toBe('EXTERNAL_SIGNED');
      expect(event.body.header.occurredAtEvidence).toBe('BANK-EVIDENCE-REF-001');
    });
  });
});
