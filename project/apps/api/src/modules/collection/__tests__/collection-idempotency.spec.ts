/**
 * P0-1 (S9) — CollectionService.create idempotency unit tests (mock-prisma, DB'siz).
 *
 * Kapsam:
 *  - idempotencyKey ZORUNLU (eksikse BadRequestException, tx açılmaz)
 *  - fast-path replay (aynı key + aynı canonical command → mevcut tahsilat, create yok)
 *  - fast-path conflict (aynı key + farklı command → IDEMPOTENCY_SEMANTIC_CONFLICT)
 *  - advisory-lock altında race re-check (lock dup → replay)
 *  - normal create (advisory lock + idempotencyKey ile yazım)
 *  - P2002 race → key ile mevcut bulunur → replay
 *  - P2002 external dedup → key satırı yok → DUPLICATE_EXTERNAL_PAYMENT
 */
import { CollectionService } from '../collection.service';
import { CollectionType } from '../dto/collection.dto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildCollectionSemanticCommandEvidence } from '../collection-semantic-command';

function setup(
  opts: { preExisting?: any; lockedDup?: any; createThrows?: unknown } = {},
) {
  // ACCT-CUTOVER-3E4B2H2A: create() sonrası writeCollectionRecordedJournal
  // çalışır ve collection'ın amount/currency/date alanlarını okur — minimal
  // {id} mock'u normalizeSourceHashAmount'ta "undefined" hash hatası verir.
  const created = {
    id: 'col-new',
    tenantId: 't1',
    caseId: 'c1',
    caseDebtorId: null,
    amount: 5000,
    currency: 'TRY',
    date: new Date('2026-07-03T00:00:00.000Z'),
    valueDate: null,
    status: 'CONFIRMED',
    createdAt: new Date('2026-07-03T00:00:01.000Z'),
  };
  const tx: any = {
    // P0-1: advisory xact lock — mock no-op.
    $executeRaw: jest.fn(async () => 0),
    case: {
      findFirst: jest.fn(async () => ({ id: 'c1', caseStatus: 'DERDEST', currency: 'TRY' })),
    },
    claimItem: {
      findMany: jest.fn(async () => []),
    },
    collection: {
      // lock altında race re-check
      findUnique: jest.fn(async () => opts.lockedDup ?? null),
      findFirst: jest.fn(),
      create: opts.createThrows
        ? jest.fn(async () => {
            throw opts.createThrows;
          })
        : jest.fn(async ({ data }: any) => ({ ...created, confirmedAt: data.confirmedAt })),
    },
    collectionAllocation: { create: jest.fn() },
    collectionOverpayment: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    collection: {
      // tx öncesi fast-path
      findUnique: jest.fn(async () => opts.preExisting ?? null),
      // findById (create sonunda) — istenen id'yi döndür
      findFirst: jest.fn(async ({ where }: any) => ({ id: where.id, allocations: [] })),
    },
  };
  const domainEvent: any = { appendInTransaction: jest.fn(async () => ({})) };
  const guard: any = { assertActiveByCaseDebtorId: jest.fn() };
  // ACCT-CUTOVER-3E4B2H2A: 5. ctor arg (journalWriter) — mock write() ile gerçek
  // AccountingJournalWriterService/DB'ye düşmeyi engeller (P0-1 testleri journal
  // davranışını değil idempotency'i hedefler).
  const journalWriter: any = { write: jest.fn(async () => ({ ok: true, output: { status: 'CREATED', journalEntryId: 'journal-mock' } })) };
  const auditService: any = {
    log: jest.fn(async () => undefined),
    logInTransaction: jest.fn(async () => undefined),
  };
  const svc = new CollectionService(
    prisma,
    domainEvent,
    guard,
    undefined,
    journalWriter,
    undefined,
    auditService,
  );
  jest.spyOn(svc as any, 'autoAllocateInTx').mockResolvedValue(undefined);
  jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
  return { svc, prisma, tx, domainEvent, auditService };
}

const baseDto = {
  caseId: 'c1',
  idempotencyKey: 'key-1',
  amount: 5000,
  currency: 'TRY',
  date: '2026-07-03',
  type: CollectionType.CASH,
} as any;

function evidenceFor(
  dto: any = baseDto,
  userId = 'u1',
  producer = 'COLLECTION_SERVICE_COMPATIBILITY' as const,
) {
  const evidence = buildCollectionSemanticCommandEvidence({
    tenantId: 't1',
    dto: {
      channel: 'BANKA',
      ...dto,
      date: new Date(dto.date).toISOString(),
    },
    actor: { type: 'HUMAN', userId },
    producer,
  });
  return {
    commandFingerprintVersion: evidence.fingerprintVersion,
    commandFingerprint: evidence.commandFingerprint,
    commandCanonicalPayload: evidence.commandCanonicalPayload,
  };
}

const existingRow = {
  id: 'col-existing',
  ...evidenceFor(),
};

function p2002(target?: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique violation', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: target ? { target } : undefined,
  });
}

describe('CollectionService.create — P0-1 idempotency', () => {
  it('eksik idempotencyKey → BadRequestException, tx açılmaz', async () => {
    const { svc, prisma } = setup();
    const noKey = { ...baseDto };
    delete noKey.idempotencyKey;
    await expect(svc.create('t1', noKey, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fast-path replay: aynı key + aynı canonical command → mevcut tahsilat döner, create edilmez', async () => {
    const { svc, prisma, tx } = setup({ preExisting: existingRow });
    const res: any = await svc.create('t1', baseDto, 'u1');
    expect(res.id).toBe('col-existing');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.collection.create).not.toHaveBeenCalled();
  });

  it('fast-path conflict: aynı key + farklı amount → IDEMPOTENCY_SEMANTIC_CONFLICT + güvenli audit', async () => {
    const { svc, auditService } = setup({ preExisting: existingRow });
    await expect(
      svc.create('t1', { ...baseDto, amount: 9999 }, 'u1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'IDEMPOTENCY_SEMANTIC_CONFLICT',
      }),
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COLLECTION_IDEMPOTENCY_SEMANTIC_CONFLICT',
        metadata: expect.objectContaining({
          idempotencyKeyDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
          existingFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
          incomingFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
          actorAuthorityDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    );
    expect(JSON.stringify(auditService.log.mock.calls[0][0])).not.toContain(
      baseDto.idempotencyKey,
    );
  });

  it('lock re-check: pre-existing yok ama lock altında race dup → replay, ikinci create yok', async () => {
    const { svc, tx } = setup({ preExisting: null, lockedDup: existingRow });
    const res: any = await svc.create('t1', baseDto, 'u1');
    expect(tx.$executeRaw).toHaveBeenCalled(); // advisory lock alındı
    expect(res.id).toBe('col-existing');
    expect(tx.collection.create).not.toHaveBeenCalled();
  });

  it('normal create: pre-existing yok → advisory lock + idempotencyKey ile yazılır', async () => {
    const { svc, tx } = setup();
    const res: any = await svc.create('t1', baseDto, 'u1');
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.collection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'key-1',
          commandFingerprintVersion: 'RCV-COL-CMD/v1',
          commandFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
          commandCanonicalPayload: expect.stringContaining(
            '"schemaVersion":"RCV-COL-CMD/v1"',
          ),
          status: 'CONFIRMED',
          confirmedAt: expect.any(Date),
        }),
      }),
    );
    expect(res.id).toBe('col-new');
  });

  it('P2002 race: create unique-violation → key ile mevcut bulunur → replay', async () => {
    const { svc, prisma } = setup({ createThrows: p2002() });
    // fast-path: yok (tx'e gir) → create P2002 → catch: key ile bulundu (aynı canonical command) → replay
    prisma.collection.findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(existingRow);
    const res: any = await svc.create('t1', baseDto, 'u1');
    expect(res.id).toBe('col-existing');
  });

  it('P2002 external dedup: key satırı YOK + meta.target=source_dedupe → DUPLICATE_EXTERNAL_PAYMENT', async () => {
    const { svc } = setup({ createThrows: p2002('Collection_source_dedupe_key') });
    // fast-path + catch findUnique null → external index patladı
    await expect(svc.create('t1', baseDto, 'u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('İLGİSİZ P2002 (başka unique): key satırı yok + meta.target farklı → AYNEN fırlatılır (yanlış etiket yok)', async () => {
    const raw = p2002('SomeOther_unique_key');
    const { svc } = setup({ createThrows: raw });
    await expect(svc.create('t1', baseDto, 'u1')).rejects.toBe(raw);
  });

  it('legacy fingerprint taşımayan satırı replay saymaz; fail-closed reddeder', async () => {
    const { svc } = setup({
      preExisting: {
        id: 'col-legacy',
        commandFingerprintVersion: null,
        commandFingerprint: null,
        commandCanonicalPayload: null,
      },
    });
    await expect(svc.create('t1', baseDto, 'u1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'IDEMPOTENCY_LEGACY_UNVERIFIABLE',
      }),
    });
  });

  it('aynı key + aynı finansal alan fakat farklı actor authority conflict üretir', async () => {
    const { svc } = setup({ preExisting: existingRow });
    await expect(svc.create('t1', baseDto, 'u2')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'IDEMPOTENCY_SEMANTIC_CONFLICT',
      }),
    });
  });

  it('fingerprint version mismatch fail-closed sonuç üretir', async () => {
    const { svc } = setup({
      preExisting: {
        ...existingRow,
        commandFingerprintVersion: 'RCV-COL-CMD/v2',
      },
    });
    await expect(svc.create('t1', baseDto, 'u1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'IDEMPOTENCY_FINGERPRINT_VERSION_UNSUPPORTED',
      }),
    });
  });
});
