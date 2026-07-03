/**
 * P0-1 (S9) — CollectionService.create idempotency unit tests (mock-prisma, DB'siz).
 *
 * Kapsam:
 *  - idempotencyKey ZORUNLU (eksikse BadRequestException, tx açılmaz)
 *  - fast-path replay (aynı key + aynı payload → mevcut tahsilat, create yok)
 *  - fast-path conflict (aynı key + farklı payload → IDEMPOTENCY_KEY_CONFLICT)
 *  - advisory-lock altında race re-check (lock dup → replay)
 *  - normal create (advisory lock + idempotencyKey ile yazım)
 *  - P2002 race → key ile mevcut bulunur → replay
 *  - P2002 external dedup → key satırı yok → DUPLICATE_EXTERNAL_PAYMENT
 */
import { CollectionService } from '../collection.service';
import { CollectionType } from '../dto/collection.dto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

function setup(
  opts: { preExisting?: any; lockedDup?: any; createThrows?: unknown } = {},
) {
  const created = { id: 'col-new' };
  const tx: any = {
    // P0-1: advisory xact lock — mock no-op.
    $executeRaw: jest.fn(async () => 0),
    case: {
      findFirst: jest.fn(async () => ({ id: 'c1', caseStatus: 'DERDEST', currency: 'TRY' })),
    },
    collection: {
      // lock altında race re-check
      findUnique: jest.fn(async () => opts.lockedDup ?? null),
      findFirst: jest.fn(),
      create: opts.createThrows
        ? jest.fn(async () => {
            throw opts.createThrows;
          })
        : jest.fn(async () => created),
    },
    collectionAllocation: { create: jest.fn() },
    collectionOverpayment: { create: jest.fn() },
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
  const svc = new CollectionService(prisma, domainEvent, guard, undefined);
  jest.spyOn(svc as any, 'autoAllocateInTx').mockResolvedValue(undefined);
  jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
  return { svc, prisma, tx, domainEvent };
}

const baseDto = {
  caseId: 'c1',
  idempotencyKey: 'key-1',
  amount: 5000,
  currency: 'TRY',
  date: '2026-07-03',
  type: CollectionType.CASH,
} as any;

const existingRow = {
  id: 'col-existing',
  caseId: 'c1',
  amount: 5000,
  currency: 'TRY',
  date: new Date('2026-07-03'),
  sourceType: null,
  sourceId: null,
  caseDebtorId: null,
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
    const { idempotencyKey: _omit, ...noKey } = baseDto;
    await expect(svc.create('t1', noKey, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fast-path replay: aynı key + aynı payload → mevcut tahsilat döner, create edilmez', async () => {
    const { svc, prisma, tx } = setup({ preExisting: existingRow });
    const res: any = await svc.create('t1', baseDto, 'u1');
    expect(res.id).toBe('col-existing');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.collection.create).not.toHaveBeenCalled();
  });

  it('fast-path conflict: aynı key + farklı amount → IDEMPOTENCY_KEY_CONFLICT', async () => {
    const { svc } = setup({ preExisting: existingRow });
    await expect(
      svc.create('t1', { ...baseDto, amount: 9999 }, 'u1'),
    ).rejects.toBeInstanceOf(ConflictException);
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
        data: expect.objectContaining({ idempotencyKey: 'key-1' }),
      }),
    );
    expect(res.id).toBe('col-new');
  });

  it('P2002 race: create unique-violation → key ile mevcut bulunur → replay', async () => {
    const { svc, prisma } = setup({ createThrows: p2002() });
    // fast-path: yok (tx'e gir) → create P2002 → catch: key ile bulundu (aynı payload) → replay
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
});
