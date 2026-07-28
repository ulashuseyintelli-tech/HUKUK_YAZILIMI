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
 * - RC-COL / W1.1: cent remainder → exact ledger allocation + overpayment
 * - Test 7 / PATCH A3: post-allocation failure → full financial-chain rollback
 * - Test 8: EXTERNAL_SIGNED without evidence → HR-34 fail
 *
 * Requires: DATABASE_URL pointing to test database with migrations applied.
 */
import { CaseDebtorLifecycleStatus, Prisma, PrismaClient } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CollectionService } from '../collection.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { CreateCollectionDto, CollectionSource, CollectionType } from '../dto/collection.dto';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { AccountingJournalWriterService } from '../../accounting-journal/accounting-journal.writer';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const describeIf = DATABASE_URL ? describe : describe.skip;

interface AllocationReadObservation {
  claimItemIds: string[];
  collectedAmounts: number[];
  demandedAmounts: number[];
}

function createControlledAllocationReadProbe() {
  let arrivals = 0;
  let firstReleased = false;
  let resolveFirstArrival!: () => void;
  let resolveSecondArrival!: () => void;
  let resolveFirstRelease!: () => void;
  const observations: AllocationReadObservation[] = [];
  const firstArrival = new Promise<void>((resolve) => { resolveFirstArrival = resolve; });
  const secondArrival = new Promise<void>((resolve) => { resolveSecondArrival = resolve; });
  const firstReleaseSignal = new Promise<void>((resolve) => { resolveFirstRelease = resolve; });

  return {
    async observe(claimItems: any[]) {
      observations.push({
        claimItemIds: claimItems.map((item) => item.id),
        collectedAmounts: claimItems.map((item) => Number(item.collectedAmount)),
        demandedAmounts: claimItems.map((item) => Number(item.demandedAmount)),
      });
      arrivals += 1;
      if (arrivals === 1) {
        resolveFirstArrival();
        await firstReleaseSignal;
      } else if (arrivals === 2) {
        resolveSecondArrival();
      }
    },
    waitForFirstArrival: () => firstArrival,
    waitForSecondArrival: () => secondArrival,
    releaseFirst() {
      if (firstReleased) return;
      firstReleased = true;
      resolveFirstRelease();
    },
    get arrivals() { return arrivals; },
    get observations() { return observations; },
  };
}

async function waitForAdvisoryLockWaiter(prisma: PrismaClient): Promise<number> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const [row] = await prisma.$queryRaw<Array<{ waiting: number }>>`
      SELECT COUNT(*)::int AS waiting
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND NOT granted
    `;
    if (row.waiting > 0) return row.waiting;
  }
  throw new Error('Second collection transaction did not become an advisory-lock waiter.');
}

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
    await prisma.accountingJournalEntry.deleteMany({ where: { tenantId } });
    await prisma.collectionOverpayment.deleteMany({ where: { tenantId } });
    await prisma.ledgerEntry.deleteMany({ where: { tenantId } });
    // IcrabotTimelineEntry BİLEREK silinmiyor: DB trigger'ı (prevent_timeline_delete,
    // 00000000000001_legal_kernel_triggers migration.sql:169-172) her DELETE'i errcode 45010
    // ("immutable_violation: Legal facts are immutable") ile reddediyor — legal-fact append-only
    // ilkesi test cleanup'ında da geçerli. Güvenli: bu tablo Case'e FK'siz (bare scalar caseId,
    // schema.prisma model IcrabotTimelineEntry — tek @relation runId→IcrabotEngineRun SetNull),
    // ve her test beforeEach'te taze randomUUID tenantId/caseId ürettiği için (satır ~87,~111)
    // kalan satırlar hiçbir sonraki testin scoped assertion'ıyla çakışmaz — yetim ama zararsız.
    await prisma.collection.deleteMany({ where: { tenantId } });
    await prisma.claimItem.deleteMany({ where: { tenantId } });
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
      idempotencyKey: randomUUID(), // P0-1: her buildDto() taze key → varsayılan farklı tahsilat
      amount: 5000,
      type: CollectionType.BANK_TRANSFER,
      date: new Date().toISOString(),
      ...overrides,
    } as CreateCollectionDto;
  }

  async function createCurrencyBoundaryService(): Promise<CollectionService> {
    const summaryEngine = new SummaryEngineService(
      prisma as any,
      new TBK100AllocatorService(),
    );
    await summaryEngine.onModuleInit();
    return new CollectionService(
      prisma as any,
      new DomainEventIngestService(),
      new CaseDebtorLifecycleGuardService(prisma as any),
      summaryEngine,
      new AccountingJournalWriterService(prisma as any),
    );
  }

  async function readCurrencyBoundaryState(claimItemId: string) {
    const [
      collections,
      journalEntries,
      journalLines,
      events,
      ledgerEntries,
      ledgerAllocations,
      claimItem,
      overpayments,
      outbox,
      compatAllocations,
      auditLogs,
    ] = await Promise.all([
      prisma.collection.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
      prisma.accountingJournalEntry.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
      prisma.accountingJournalLine.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
      (prisma as any).icrabotTimelineEntry.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
      prisma.ledgerEntry.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
      prisma.ledgerAllocation.count({ where: { claimItemId } }),
      prisma.claimItem.findUniqueOrThrow({ where: { id: claimItemId } }),
      prisma.collectionOverpayment.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
      (prisma as any).icrabotOutboxAction.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
      prisma.collectionAllocation.count({
        where: { collection: { tenantId: testTenantId, caseId: testCaseId } },
      }),
      prisma.auditLog.count({ where: { tenantId: testTenantId } }),
    ]);

    return {
      collections,
      journalEntries,
      journalLines,
      events,
      ledgerEntries,
      ledgerAllocations,
      collectedAmount: Number(claimItem.collectedAmount),
      overpayments,
      outbox,
      compatAllocations,
      auditLogs,
    };
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
    it('rejects duplicate BANK_SEIZURE with same sourceId (FARKLI idempotencyKey)', async () => {
      // İki AYRI istek (farklı idempotencyKey) ama AYNI dış-kaynak sourceId → external dedup.
      const base = {
        sourceType: CollectionSource.BANK_SEIZURE,
        sourceId: 'BANK-TX-12345',
      };

      // First payment succeeds
      await service.create(testTenantId, buildDto(base), 'test-user-1');

      // Second payment, different key but same external sourceId → external dedup fires
      await expect(
        service.create(testTenantId, buildDto(base), 'test-user-1'),
      ).rejects.toThrow(/Duplicate payment/);

      // Only one event exists
      const events = await (prisma as any).icrabotTimelineEntry.findMany({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });
      expect(events).toHaveLength(1);
    });
  });

  // ── Test 3b: İdempotency (P0-1 / S9) ──────────────────────────────────
  describe('Test 3b: idempotencyKey davranışı', () => {
    it('AYNI idempotencyKey → replay: ikinci create yeni tahsilat/olay yaratmaz', async () => {
      const dto = buildDto({ sourceType: CollectionSource.MANUAL });

      const first = await service.create(testTenantId, dto, 'test-user-1');
      const second = await service.create(testTenantId, dto, 'test-user-1'); // aynı key → replay

      expect(second.id).toBe(first.id); // aynı tahsilat döner

      const events = await (prisma as any).icrabotTimelineEntry.findMany({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });
      expect(events).toHaveLength(1); // tek olay
    });

    it('FARKLI idempotencyKey, aynı tutar/tarih → meşru ikinci ödeme: iki tahsilat', async () => {
      await service.create(testTenantId, buildDto({ sourceType: CollectionSource.MANUAL }), 'test-user-1');
      await service.create(testTenantId, buildDto({ sourceType: CollectionSource.MANUAL }), 'test-user-1');

      const events = await (prisma as any).icrabotTimelineEntry.findMany({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });
      expect(events).toHaveLength(2); // kaba (case,amount,date) unique OLSAYDI bu bloklanırdı
    });

    it('AYNI idempotencyKey + FARKLI payload → IDEMPOTENCY_KEY_CONFLICT (sessiz eski-kayıt dönmez)', async () => {
      const key = randomUUID();
      await service.create(testTenantId, buildDto({ idempotencyKey: key, amount: 5000 }), 'test-user-1');

      await expect(
        service.create(testTenantId, buildDto({ idempotencyKey: key, amount: 9999 }), 'test-user-1'),
      ).rejects.toThrow(/IDEMPOTENCY_KEY_CONFLICT|farklı payload/);
    });

    it('eksik idempotencyKey → BadRequestException (nullable key ile create edilemez)', async () => {
      const dto = buildDto();
      delete (dto as any).idempotencyKey;

      // RCV-P2-WS03-P01 (#1300) sonrası tüm canonical command doğrulama hataları
      // aynı jenerik mesajı paylaşır (collection-receipt-command.ts:commandError);
      // ayırt edici alan message metni değil, machine-readable `code`.
      await expect(
        service.create(testTenantId, dto, 'test-user-1'),
      ).rejects.toMatchObject({
        response: { code: 'COLLECTION_COMMAND_IDEMPOTENCY_KEY_REQUIRED' },
      });
    });

    it('paralel AYNI idempotencyKey (race) → tek tahsilat', async () => {
      const dto = buildDto({ sourceType: CollectionSource.MANUAL });

      const results = await Promise.allSettled([
        service.create(testTenantId, dto, 'test-user-1'),
        service.create(testTenantId, dto, 'test-user-1'),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      // İkisi de replay/başarı dönebilir ama tek tahsilat/olay olmalı.
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      const collections = await prisma.collection.findMany({ where: { tenantId: testTenantId } });
      expect(collections).toHaveLength(1);
      const events = await (prisma as any).icrabotTimelineEntry.findMany({
        where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
      });
      expect(events).toHaveLength(1);
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

  describe('RCV-COL-CURRENCY-BOUNDARY-01: fail-closed currency integrity', () => {
    async function createClaimItem(currency: string) {
      return prisma.claimItem.create({
        data: {
          tenantId: testTenantId,
          caseId: testCaseId,
          itemType: 'PRINCIPAL',
          originalAmount: 100,
          demandedAmount: 100,
          amount: 100,
          currency,
          liableDebtorIds: [],
        },
      });
    }

    const emptyState = {
      collections: 0,
      journalEntries: 0,
      journalLines: 0,
      events: 0,
      ledgerEntries: 0,
      ledgerAllocations: 0,
      collectedAmount: 0,
      overpayments: 0,
      outbox: 0,
      compatAllocations: 0,
      auditLogs: 0,
    };

    it('aynı explicit currency ile admission/ledger zinciri çalışır ve replay yeni write üretmez', async () => {
      await prisma.case.update({
        where: { id: testCaseId },
        data: { currency: 'USD' },
      });
      const claimItem = await createClaimItem('USD');
      const currencyService = await createCurrencyBoundaryService();
      const request = buildDto({
        idempotencyKey: `currency-success-${randomUUID()}`,
        amount: 50,
        currency: 'USD',
        sourceType: CollectionSource.MANUAL,
        autoAllocate: false,
      });

      const first = await currencyService.create(testTenantId, request, 'test-user-1');
      const replay = await currencyService.create(testTenantId, request, 'test-user-1');
      const [collection, ledgerEntry, state] = await Promise.all([
        prisma.collection.findUniqueOrThrow({ where: { id: first.id } }),
        prisma.ledgerEntry.findFirstOrThrow({
          where: { tenantId: testTenantId, caseId: testCaseId, collectionId: first.id },
        }),
        readCurrencyBoundaryState(claimItem.id),
      ]);

      expect(replay.id).toBe(first.id);
      expect(collection.currency).toBe('USD');
      expect(ledgerEntry.currency).toBe('USD');
      expect(state).toMatchObject({
        collections: 1,
        journalEntries: 1,
        journalLines: 2,
        events: 1,
        ledgerEntries: 1,
        ledgerAllocations: 1,
        collectedAmount: 50,
        outbox: 1,
        compatAllocations: 0,
        auditLogs: 1,
      });
    });

    it('Collection/Case mismatch bütün finansal zinciri ilk write öncesi reddeder', async () => {
      const claimItem = await createClaimItem('TRY');
      const currencyService = await createCurrencyBoundaryService();

      await expect(currencyService.create(testTenantId, buildDto({
        currency: 'USD',
        sourceType: CollectionSource.MANUAL,
      }), 'test-user-1')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'COLLECTION_CURRENCY_MISMATCH',
          collectionCurrency: 'USD',
          caseCurrency: 'TRY',
        }),
      });

      await expect(readCurrencyBoundaryState(claimItem.id)).resolves.toEqual(emptyState);
    });

    it('aktif ClaimItem currency mismatch ilk write öncesi fail-closed olur', async () => {
      const claimItem = await createClaimItem('USD');
      const currencyService = await createCurrencyBoundaryService();

      await expect(currencyService.create(testTenantId, buildDto({
        currency: 'TRY',
        sourceType: CollectionSource.MANUAL,
      }), 'test-user-1')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'COLLECTION_CURRENCY_MISMATCH',
          caseCurrency: 'TRY',
          allocationCurrencies: ['USD'],
        }),
      });

      await expect(readCurrencyBoundaryState(claimItem.id)).resolves.toEqual(emptyState);
    });

    it('allocator ledger currency drift üretirse transaction içindeki tüm önceki write\'ları rollback eder', async () => {
      const claimItem = await createClaimItem('TRY');
      const summaryEngine = new SummaryEngineService(
        prisma as any,
        new TBK100AllocatorService(),
      );
      await summaryEngine.onModuleInit();
      const driftSummaryEngine = {
        allocatePaymentToLedgerInTx: jest.fn(async (...args: any[]) => {
          const result = await (summaryEngine.allocatePaymentToLedgerInTx as any)(...args);
          return {
            ...result,
            ledgerEntry: result.ledgerEntry
              ? { ...result.ledgerEntry, currency: 'USD' }
              : result.ledgerEntry,
          };
        }),
      };
      const currencyService = new CollectionService(
        prisma as any,
        new DomainEventIngestService(),
        new CaseDebtorLifecycleGuardService(prisma as any),
        driftSummaryEngine as any,
        new AccountingJournalWriterService(prisma as any),
      );

      await expect(currencyService.create(testTenantId, buildDto({
        currency: 'TRY',
        sourceType: CollectionSource.MANUAL,
      }), 'test-user-1')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'COLLECTION_CURRENCY_MISMATCH',
          collectionCurrency: 'TRY',
          caseCurrency: 'TRY',
          ledgerCurrency: 'USD',
        }),
      });

      expect(driftSummaryEngine.allocatePaymentToLedgerInTx).toHaveBeenCalledTimes(1);
      await expect(readCurrencyBoundaryState(claimItem.id)).resolves.toEqual(emptyState);
    });

    it('başka tenant Case kimliği currency authority olarak kullanılamaz', async () => {
      const claimItem = await createClaimItem('TRY');
      const foreignCaseDebtor = await createForeignTenantCaseDebtorFixture();
      const currencyService = await createCurrencyBoundaryService();

      await expect(currencyService.create(testTenantId, buildDto({
        caseId: foreignCaseDebtor.caseId,
        currency: 'TRY',
        sourceType: CollectionSource.MANUAL,
      }), 'test-user-1')).rejects.toThrow(/Dosya bulunamadı/);

      await expect(readCurrencyBoundaryState(claimItem.id)).resolves.toEqual(emptyState);
      await expect(prisma.collection.count({
        where: { caseId: foreignCaseDebtor.caseId },
      })).resolves.toBe(0);
    });

    it('eşzamanlı aynı-key mismatch istekleri tek bir partial write bile bırakmaz', async () => {
      const claimItem = await createClaimItem('TRY');
      const currencyService = await createCurrencyBoundaryService();
      const request = buildDto({
        idempotencyKey: `currency-race-${randomUUID()}`,
        currency: 'USD',
        sourceType: CollectionSource.MANUAL,
      });

      const results = await Promise.allSettled([
        currencyService.create(testTenantId, request, 'test-user-1'),
        currencyService.create(testTenantId, request, 'test-user-2'),
      ]);

      expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).toMatchObject({
            response: expect.objectContaining({ code: 'COLLECTION_CURRENCY_MISMATCH' }),
          });
        }
      }
      await expect(readCurrencyBoundaryState(claimItem.id)).resolves.toEqual(emptyState);
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

  // ── RC-COL / W1.1: exact cent remainder characterization ──────────────

  describe('RC-COL / W1.1: ledger cent-remainder characterization', () => {
    it('preserves a one-cent payment remainder as exact HELD overpayment without drift', async () => {
      const claimItems = await Promise.all(
        [1, 2, 3].map((sortOrder) => prisma.claimItem.create({
          data: {
            tenantId: testTenantId,
            caseId: testCaseId,
            itemType: 'PRINCIPAL',
            originalAmount: new Prisma.Decimal('33.33'),
            demandedAmount: new Prisma.Decimal('33.33'),
            amount: new Prisma.Decimal('33.33'),
            currency: 'TRY',
            liableDebtorIds: [],
            sortOrder,
          },
        })),
      );

      const summaryEngine = new SummaryEngineService(
        prisma as any,
        new TBK100AllocatorService(),
      );
      await summaryEngine.onModuleInit();
      const exactMoneyService = new CollectionService(
        prisma as any,
        new DomainEventIngestService(),
        new CaseDebtorLifecycleGuardService(prisma as any),
        summaryEngine,
        new AccountingJournalWriterService(prisma as any),
      );

      const collection = await exactMoneyService.create(testTenantId, buildDto({
        amount: 100,
        currency: 'TRY',
        sourceType: CollectionSource.MANUAL,
        autoAllocate: false,
      }), 'test-user-1');

      const [ledgerEntry, allocations, persistedClaimItems, overpayment] = await Promise.all([
        prisma.ledgerEntry.findFirstOrThrow({
          where: {
            tenantId: testTenantId,
            caseId: testCaseId,
            collectionId: collection.id,
            entryType: 'PAYMENT',
          },
        }),
        prisma.ledgerAllocation.findMany({
          where: { claimItemId: { in: claimItems.map((item) => item.id) } },
          orderBy: { allocationOrder: 'asc' },
        }),
        prisma.claimItem.findMany({
          where: { id: { in: claimItems.map((item) => item.id) } },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.collectionOverpayment.findFirstOrThrow({
          where: {
            tenantId: testTenantId,
            caseId: testCaseId,
            collectionId: collection.id,
          },
        }),
      ]);

      const zero = new Prisma.Decimal(0);
      const paymentAmount = new Prisma.Decimal(ledgerEntry.amount);
      const allocationTotal = allocations.reduce(
        (sum, allocation) => sum.plus(allocation.amount),
        zero,
      );
      const demandedTotal = persistedClaimItems.reduce(
        (sum, item) => sum.plus(item.demandedAmount),
        zero,
      );
      const collectedTotal = persistedClaimItems.reduce(
        (sum, item) => sum.plus(item.collectedAmount),
        zero,
      );
      const remainingDebt = demandedTotal.minus(collectedTotal);
      const overpaymentAmount = new Prisma.Decimal(overpayment.amount);
      const overpaymentRemaining = new Prisma.Decimal(overpayment.remainingAmount);
      const accountedPayment = allocationTotal.plus(overpaymentAmount);
      const unaccountedRemainder = paymentAmount.minus(accountedPayment);

      expect(allocations).toHaveLength(3);
      expect(allocations.map((allocation) => allocation.amount.toFixed(2)))
        .toEqual(['33.33', '33.33', '33.33']);
      expect(paymentAmount.toFixed(2)).toBe('100.00');
      expect(allocationTotal.toFixed(2)).toBe('99.99');
      expect(demandedTotal.toFixed(2)).toBe('99.99');
      expect(collectedTotal.toFixed(2)).toBe('99.99');
      expect(remainingDebt.toFixed(2)).toBe('0.00');
      expect(overpaymentAmount.toFixed(2)).toBe('0.01');
      expect(overpaymentRemaining.toFixed(2)).toBe('0.01');
      expect(overpayment.status).toBe('HELD');
      expect(overpayment.currency).toBe('TRY');
      expect(accountedPayment.toFixed(2)).toBe('100.00');
      expect(unaccountedRemainder.toFixed(2)).toBe('0.00');
      expect(allocationTotal.lessThanOrEqualTo(demandedTotal)).toBe(true);
      expect(remainingDebt.greaterThanOrEqualTo(0)).toBe(true);
      expect(overpaymentRemaining.greaterThanOrEqualTo(0)).toBe(true);
    });
  });

  // ── Test 7 / PATCH A3: post-allocation failure → full rollback ────────

  describe('PATCH A3: mid-transaction rollback characterization', () => {
    it('rolls back the complete financial chain after a deterministic post-allocation failure', async () => {
      const claimItem = await prisma.claimItem.create({
        data: {
          tenantId: testTenantId,
          caseId: testCaseId,
          itemType: 'PRINCIPAL',
          originalAmount: 100,
          demandedAmount: 100,
          amount: 100,
          currency: 'TRY',
          liableDebtorIds: [],
        },
      });

      const readFinancialChain = async (db: any): Promise<Record<string, number>> => {
        const [
          collections,
          journalEntries,
          journalLines,
          events,
          ledgerEntries,
          ledgerAllocations,
          claimItems,
          persistedClaimItem,
          overpayments,
          outbox,
          compatAllocations,
        ] = await Promise.all([
          db.collection.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
          db.accountingJournalEntry.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
          db.accountingJournalLine.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
          db.icrabotTimelineEntry.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
          db.ledgerEntry.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
          db.ledgerAllocation.count({ where: { claimItemId: claimItem.id } }),
          db.claimItem.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
          db.claimItem.findUniqueOrThrow({ where: { id: claimItem.id } }),
          db.collectionOverpayment.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
          db.icrabotOutboxAction.count({ where: { tenantId: testTenantId, caseId: testCaseId } }),
          db.collectionAllocation.count({
            where: { collection: { tenantId: testTenantId, caseId: testCaseId } },
          }),
        ]);

        return {
          collections,
          journalEntries,
          journalLines,
          events,
          ledgerEntries,
          ledgerAllocations,
          claimItems,
          collectedAmount: Number(persistedClaimItem.collectedAmount),
          demandedAmount: Number(persistedClaimItem.demandedAmount),
          overpayments,
          outbox,
          compatAllocations,
        };
      };

      const summaryEngine = new SummaryEngineService(
        prisma as any,
        new TBK100AllocatorService(),
      );
      await summaryEngine.onModuleInit();
      const rollbackService = new CollectionService(
        prisma as any,
        new DomainEventIngestService(),
        new CaseDebtorLifecycleGuardService(prisma as any),
        summaryEngine,
        new AccountingJournalWriterService(prisma as any),
      );

      let preFailureSnapshot: Record<string, number> | undefined;
      const originalAutoAllocate = (rollbackService as any).autoAllocateInTx.bind(rollbackService);
      const failurePoint = jest
        .spyOn(rollbackService as any, 'autoAllocateInTx')
        .mockImplementation(async (tx: any, ...args: any[]) => {
          await originalAutoAllocate(tx, ...args);
          preFailureSnapshot = await readFinancialChain(tx);
          throw new Error('PATCH_A3_FAILURE_POINT: post-allocation rollback probe');
        });

      try {
        await expect(
          rollbackService.create(testTenantId, buildDto({
            amount: 150,
            currency: 'TRY',
            sourceType: CollectionSource.MANUAL,
            autoAllocate: true,
          }), 'test-user-1'),
        ).rejects.toThrow(/PATCH_A3_FAILURE_POINT/);

        expect(failurePoint).toHaveBeenCalledTimes(1);
        expect(preFailureSnapshot).toEqual({
          collections: 1,
          journalEntries: 1,
          journalLines: 2,
          events: 2,
          ledgerEntries: 1,
          ledgerAllocations: 1,
          claimItems: 1,
          collectedAmount: 100,
          demandedAmount: 100,
          overpayments: 1,
          outbox: 2,
          compatAllocations: 1,
        });

        await expect(readFinancialChain(prisma as any)).resolves.toEqual({
          collections: 0,
          journalEntries: 0,
          journalLines: 0,
          events: 0,
          ledgerEntries: 0,
          ledgerAllocations: 0,
          claimItems: 1,
          collectedAmount: 0,
          demandedAmount: 100,
          overpayments: 0,
          outbox: 0,
          compatAllocations: 0,
        });
      } finally {
        failurePoint.mockRestore();
      }
    }, 30_000);
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

  describe('PATCH A2: allocation concurrency characterization', () => {
    it('farklı key ile aynı ClaimItem hedefleyen iki create çağrısının kalıcı concurrency sonucunu sabitler', async () => {
      const claimItem = await prisma.claimItem.create({
        data: {
          tenantId: testTenantId,
          caseId: testCaseId,
          itemType: 'PRINCIPAL',
          originalAmount: 100,
          demandedAmount: 100,
          amount: 100,
          currency: 'TRY',
          liableDebtorIds: [],
        },
      });

      const concurrencyPrisma = new PrismaClient({
        datasources: { db: { url: DATABASE_URL } },
      });
      await concurrencyPrisma.$connect();

      const allocationReads = createControlledAllocationReadProbe();
      let canonicalAllocationLockAttempts = 0;
      let resolveSecondCaseLockAttempt!: () => void;
      const secondCaseLockAttempt = new Promise<void>((resolve) => {
        resolveSecondCaseLockAttempt = resolve;
      });

      concurrencyPrisma.$use(async (params, next) => {
        const rawQuery = (params.args as any)?.[0];
        const queryText = String(rawQuery?.sql ?? rawQuery?.text ?? rawQuery ?? '');
        const isCanonicalAllocationLock =
          params.action === 'executeRaw' &&
          queryText.includes('COL-LOCK-001: canonical allocation lock');
        if (isCanonicalAllocationLock) {
          canonicalAllocationLockAttempts += 1;
          if (canonicalAllocationLockAttempts === 2) resolveSecondCaseLockAttempt();
        }

        const result = await next(params);
        const isTargetAllocationRead =
          params.model === 'Case' &&
          params.action === 'findFirst' &&
          (params.args as any)?.where?.id === testCaseId &&
          Boolean((params.args as any)?.include?.claimItems);
        if (isTargetAllocationRead) {
          await allocationReads.observe((result as any)?.claimItems ?? []);
        }
        return result;
      });

      const summaryEngine = new SummaryEngineService(
        concurrencyPrisma as any,
        new TBK100AllocatorService(),
      );
      await summaryEngine.onModuleInit();
      const concurrencyService = new CollectionService(
        concurrencyPrisma as any,
        new DomainEventIngestService(),
        new CaseDebtorLifecycleGuardService(concurrencyPrisma as any),
        summaryEngine,
        new AccountingJournalWriterService(concurrencyPrisma as any),
      );

      const paymentDate = '2026-07-13T12:00:00.000Z';
      const firstCall = concurrencyService.create(testTenantId, buildDto({
        idempotencyKey: `a2-first-${randomUUID()}`,
        amount: 75,
        currency: 'TRY',
        date: paymentDate,
        sourceType: CollectionSource.MANUAL,
        autoAllocate: false,
      }), 'test-user-1');
      const calls: Array<ReturnType<CollectionService['create']>> = [firstCall];

      try {
        await allocationReads.waitForFirstArrival();

        const secondCall = concurrencyService.create(testTenantId, buildDto({
          idempotencyKey: `a2-second-${randomUUID()}`,
          amount: 75,
          currency: 'TRY',
          date: paymentDate,
          sourceType: CollectionSource.MANUAL,
          autoAllocate: false,
        }), 'test-user-2');
        calls.push(secondCall);

        await secondCaseLockAttempt;
        const advisoryLockWaiters = await waitForAdvisoryLockWaiter(prisma);
        expect(canonicalAllocationLockAttempts).toBe(2);
        expect(advisoryLockWaiters).toBe(1);
        expect(allocationReads.arrivals).toBe(1);

        allocationReads.releaseFirst();
        const results = await Promise.allSettled(calls);
        expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
        await allocationReads.waitForSecondArrival();

        expect(allocationReads.arrivals).toBe(2);
        expect(allocationReads.observations.map((observation) => observation.claimItemIds))
          .toEqual([[claimItem.id], [claimItem.id]]);
        expect(allocationReads.observations.map((observation) => observation.collectedAmounts))
          .toEqual([[0], [75]]);
        expect(allocationReads.observations.map((observation) => observation.demandedAmounts))
          .toEqual([[100], [100]]);

        const [
          collections,
          ledgerEntries,
          allocations,
          persistedClaimItem,
          journalEntries,
          events,
          overpaymentEvents,
          outbox,
          compatAllocations,
          overpayments,
        ] = await Promise.all([
          prisma.collection.findMany({ where: { tenantId: testTenantId, caseId: testCaseId } }),
          prisma.ledgerEntry.findMany({
            where: { tenantId: testTenantId, caseId: testCaseId, entryType: 'PAYMENT' },
          }),
          prisma.ledgerAllocation.findMany({ where: { claimItemId: claimItem.id } }),
          prisma.claimItem.findUniqueOrThrow({ where: { id: claimItem.id } }),
          prisma.accountingJournalEntry.findMany({
            where: { tenantId: testTenantId, sourceType: 'COLLECTION', sourceAction: 'recorded' },
          }),
          (prisma as any).icrabotTimelineEntry.findMany({
            where: { caseId: testCaseId, type: 'PAYMENT_RECEIVED' },
          }),
          (prisma as any).icrabotTimelineEntry.findMany({
            where: { caseId: testCaseId, type: 'OVERPAYMENT_RECORDED' },
          }),
          (prisma as any).icrabotOutboxAction.findMany({
            where: { tenantId: testTenantId, caseId: testCaseId },
          }),
          prisma.collectionAllocation.findMany({
            where: { collection: { tenantId: testTenantId, caseId: testCaseId } },
          }),
          prisma.collectionOverpayment.findMany({ where: { tenantId: testTenantId, caseId: testCaseId } }),
        ]);

        const collectionIds = new Set(collections.map((collection) => collection.id));
        const ledgerEntryIds = new Set(ledgerEntries.map((entry) => entry.id));
        const allocatedAmount = allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
        const demandedAmount = Number(persistedClaimItem.demandedAmount);
        const consumedAmount = Number(persistedClaimItem.collectedAmount);

        expect(collections).toHaveLength(2);
        expect(ledgerEntries).toHaveLength(2);
        expect(allocations).toHaveLength(2);
        expect(journalEntries).toHaveLength(2);
        expect(events).toHaveLength(2);
        expect(overpaymentEvents).toHaveLength(1);
        expect(outbox).toHaveLength(3);
        expect(compatAllocations).toHaveLength(0);
        expect(overpayments).toHaveLength(1);
        expect(ledgerEntries.every((entry) => entry.collectionId && collectionIds.has(entry.collectionId))).toBe(true);
        expect(new Set(ledgerEntries.map((entry) => entry.collectionId))).toEqual(collectionIds);
        expect(allocations.every((allocation) => ledgerEntryIds.has(allocation.ledgerEntryId))).toBe(true);
        expect(allocations.map((allocation) => Number(allocation.amount)).sort((a, b) => a - b))
          .toEqual([25, 75]);
        expect(allocatedAmount).toBe(100);
        expect(consumedAmount).toBe(100);
        expect(demandedAmount).toBe(100);
        expect(demandedAmount - consumedAmount).toBe(0);
        expect(allocatedAmount).toBeLessThanOrEqual(demandedAmount);
        expect(canonicalAllocationLockAttempts).toBe(2);
        expect(Number(overpayments[0].amount)).toBe(50);
        expect(Number(overpayments[0].remainingAmount)).toBe(50);
      } finally {
        allocationReads.releaseFirst();
        await Promise.allSettled(calls);
        await concurrencyPrisma.$disconnect();
      }
    }, 30_000);
  });
});
