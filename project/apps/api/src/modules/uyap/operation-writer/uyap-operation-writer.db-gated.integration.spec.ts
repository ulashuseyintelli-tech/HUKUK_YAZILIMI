import { PrismaClient } from '@prisma/client';
import { UyapOperationWriterService } from './uyap-operation-writer.service';
import {
  newUyapOperationIdempotencyKey,
  UyapOperationEnvelope,
} from './uyap-operation-writer.types';
import {
  UyapOperationClaimLostError,
  UyapOperationIdempotencyConflictError,
  UyapOperationNotFoundError,
} from './uyap-operation-writer.errors';

/**
 * UYAP-OPERATION-ATTEMPT-WRITER-P05B — disposable PostgreSQL 16 integration.
 *
 * Advisory-lock serileştirmesini, lineage doğruluğunu ve optimistic-concurrency'yi GERÇEK
 * eşzamanlılık altında kanıtlar. TEST_DATABASE_URL yoksa suite atlanır.
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/hukuk_test
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe('UYAP-P05B writer — disposable DB', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  const service = new UyapOperationWriterService(prisma as any);

  let tenantA: string;
  let tenantB: string;
  let userA: string;
  let caseA: string;
  let envelope: UyapOperationEnvelope;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttempt"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapOperation"');

    const stamp = Date.now();
    tenantA = (await prisma.tenant.create({ data: { name: 'P5B A', slug: `p5b-a-${stamp}` } })).id;
    tenantB = (await prisma.tenant.create({ data: { name: 'P5B B', slug: `p5b-b-${stamp}` } })).id;
    userA = (
      await prisma.user.create({
        data: { tenantId: tenantA, email: `p5b-${stamp}@t.test`, name: 'Aktör', surname: 'K' },
      })
    ).id;
    caseA = (
      await prisma.case.create({
        data: { tenantId: tenantA, fileNumber: `P5B-${stamp}`, type: 'GENERAL_EXECUTION' },
      })
    ).id;

    envelope = {
      tenantId: tenantA,
      caseId: caseA,
      operationType: 'HACIZ_TALEBI',
      actorUserId: userA,
      actingLawyerId: null,
      representedPartyId: null,
      approverId: null,
      signatureOwnerId: null,
    };
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttempt"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapOperation"');
    await prisma.case.deleteMany({ where: { id: caseA } });
    await prisma.user.deleteMany({ where: { id: userA } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  it('operation + attempt#1 tek transaction’da yazılır; DB default’ları doğru', async () => {
    const result = await service.createOperationWithFirstAttempt({
      idempotencyKey: newUyapOperationIdempotencyKey(),
      envelope,
    });

    expect(result.created).toBe(true);
    expect(result.operation.version).toBe(1);
    expect(result.operation.internalState).toBe('DRAFT');
    expect(result.firstAttempt.attemptNumber).toBe(1);
    expect(result.firstAttempt.previousAttemptId).toBeNull();
    expect(result.firstAttempt.providerState).toBe('NOT_DISPATCHED');
    expect(result.firstAttempt.legalEffectState).toBe('NONE');
  });

  it('aynı key + aynı envelope → IDEMPOTENT_REUSE, yeni satır YOK', async () => {
    const key = newUyapOperationIdempotencyKey();
    const first = await service.createOperationWithFirstAttempt({ idempotencyKey: key, envelope });
    const second = await service.createOperationWithFirstAttempt({ idempotencyKey: key, envelope });

    expect(second.created).toBe(false);
    expect(second.reason).toBe('IDEMPOTENT_REUSE');
    expect(second.operation.id).toBe(first.operation.id);
    expect(await prisma.uyapAttempt.count({ where: { operationId: first.operation.id } })).toBe(1);
  });

  it('aynı key + farklı envelope → IdempotencyConflictError', async () => {
    const key = newUyapOperationIdempotencyKey();
    await service.createOperationWithFirstAttempt({ idempotencyKey: key, envelope });
    await expect(
      service.createOperationWithFirstAttempt({
        idempotencyKey: key,
        envelope: { ...envelope, operationType: 'FARKLI_TIP' },
      }),
    ).rejects.toThrow(UyapOperationIdempotencyConflictError);
  });

  it('EŞZAMANLI aynı-key create → tam 1 created, kalanlar reuse (advisory lock kanıtı)', async () => {
    const key = newUyapOperationIdempotencyKey();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.createOperationWithFirstAttempt({ idempotencyKey: key, envelope }),
      ),
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    const ids = new Set(results.map((r) => r.operation.id));
    expect(ids.size).toBe(1);
    expect(await prisma.uyapAttempt.count({ where: { operationId: [...ids][0] } })).toBe(1);
  });

  it('appendRetryAttempt: attemptNumber 2, previousAttemptId = attempt#1', async () => {
    const created = await service.createOperationWithFirstAttempt({
      idempotencyKey: newUyapOperationIdempotencyKey(),
      envelope,
    });

    const retry = await service.appendRetryAttempt({ tenantId: tenantA, operationId: created.operation.id });

    expect(retry.attemptNumber).toBe(2);
    expect(retry.previousAttemptId).toBe(created.firstAttempt.id);
  });

  it('EŞZAMANLI retry append → gap-free monotonic, duplicate YOK', async () => {
    const created = await service.createOperationWithFirstAttempt({
      idempotencyKey: newUyapOperationIdempotencyKey(),
      envelope,
    });
    const operationId = created.operation.id;

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.appendRetryAttempt({ tenantId: tenantA, operationId })),
    );
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(5);

    const numbers = (
      await prisma.uyapAttempt.findMany({ where: { operationId }, orderBy: { attemptNumber: 'asc' } })
    ).map((a) => a.attemptNumber);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('cross-tenant: başka tenant’ın operation’ına append REDDEDİLİR', async () => {
    const created = await service.createOperationWithFirstAttempt({
      idempotencyKey: newUyapOperationIdempotencyKey(),
      envelope,
    });
    await expect(
      service.appendRetryAttempt({ tenantId: tenantB, operationId: created.operation.id }),
    ).rejects.toThrow(UyapOperationNotFoundError);
  });

  it('compareAndBumpVersion: yalnız version artar, state alanları DEĞİŞMEZ', async () => {
    const created = await service.createOperationWithFirstAttempt({
      idempotencyKey: newUyapOperationIdempotencyKey(),
      envelope,
    });

    const bumped = await service.compareAndBumpVersion({
      id: created.operation.id,
      tenantId: tenantA,
      expectedVersion: 1,
    });
    expect(bumped.version).toBe(2);

    const row = await prisma.uyapOperation.findUniqueOrThrow({ where: { id: created.operation.id } });
    expect(row.version).toBe(2);
    expect(row.internalState).toBe(created.operation.internalState);
    expect(row.cancelledAt).toBeNull();
  });

  it('compareAndBumpVersion: yanlış version veya cross-tenant → ClaimLostError', async () => {
    const created = await service.createOperationWithFirstAttempt({
      idempotencyKey: newUyapOperationIdempotencyKey(),
      envelope,
    });
    await expect(
      service.compareAndBumpVersion({ id: created.operation.id, tenantId: tenantA, expectedVersion: 99 }),
    ).rejects.toThrow(UyapOperationClaimLostError);
    await expect(
      service.compareAndBumpVersion({ id: created.operation.id, tenantId: tenantB, expectedVersion: 1 }),
    ).rejects.toThrow(UyapOperationClaimLostError);
  });

  it('EŞZAMANLI compareAndBumpVersion → tam 1 kazanır', async () => {
    const created = await service.createOperationWithFirstAttempt({
      idempotencyKey: newUyapOperationIdempotencyKey(),
      envelope,
    });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        service.compareAndBumpVersion({ id: created.operation.id, tenantId: tenantA, expectedVersion: 1 }),
      ),
    );
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);

    const row = await prisma.uyapOperation.findUniqueOrThrow({ where: { id: created.operation.id } });
    expect(row.version).toBe(2);
  });

  it('WithinTransaction caller-tx’e kompoze olur ve ROLLBACK propagate eder', async () => {
    const key = newUyapOperationIdempotencyKey();

    await expect(
      prisma.$transaction(async (tx) => {
        await service.createOperationWithFirstAttemptWithinTransaction(tx, { idempotencyKey: key, envelope });
        throw new Error('caller-rollback');
      }),
    ).rejects.toThrow('caller-rollback');

    expect(await prisma.uyapOperation.count({ where: { tenantId: tenantA, idempotencyKey: key } })).toBe(0);
  });

  it('writer UyapRequestLog’a HİÇ yazmaz (dual-write yok)', async () => {
    const before = await prisma.uyapRequestLog.count();
    const created = await service.createOperationWithFirstAttempt({
      idempotencyKey: newUyapOperationIdempotencyKey(),
      envelope,
    });
    await service.appendRetryAttempt({ tenantId: tenantA, operationId: created.operation.id });
    await service.compareAndBumpVersion({ id: created.operation.id, tenantId: tenantA, expectedVersion: 1 });

    expect(await prisma.uyapRequestLog.count()).toBe(before);
  });
});
