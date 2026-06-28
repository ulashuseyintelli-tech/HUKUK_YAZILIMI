/**
 * TM3 Faz C C-1 — ClientOffsetService testleri (Müvekkil Mahsubu).
 *
 * Kapsam:
 *  - GÜVENLİK (explicit, dormant @CpeRequired'a güvenilmez): PARTNER/MANAGER apply+reverse; diğer roller 403;
 *    sahte approvalRef yetki vermez; @CpeRequired future-metadata MEVCUT ama service-level guard bağımsız çalışır.
 *  - createOffset: happy APPLY; amount<=min(payableOutstanding,expenseUnpaid); cross-currency/foreign-leg reject;
 *    prior APPLY available'ı düşürür; idempotency (pre + in-tx replay/conflict); advisory-lock; audit DIRECT_CAPABILITY; approvalRef=null.
 *  - reverseOffset: happy REVERSAL (ayrı immutable row, aynı amount); reason≥10; original yok→404; REVERSAL reverse edilemez;
 *    double-reversal→409; idempotency replay.
 *  - eligibility: available>0 payable bucket + unpaid>0 expense listelenir; sıfır/currency-mismatch elenir.
 *  - listOffsets: tenant+client scope + filtre.
 */
import 'reflect-metadata';
import { BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClientOffsetService } from '../client-offset.service';
import { ClientSettlementReadService } from '../client-settlement-read.service';
import { ClientOffsetController } from '../client-offset.controller';
import { CPE_ACTION_CODE_KEY } from '../../policy-engine/decorators/cpe-required.decorator';
import { ActionCode } from '../../policy-engine/types/action-code.enum';

const D = (n: number) => new Prisma.Decimal(n);
const PARTNER = { lawyer: { lawyerRank: 'PARTNER' }, staffMember: null };
const MANAGER = { lawyer: null, staffMember: { staffType: 'MANAGER' } };
const PLAIN_LAWYER = { lawyer: { lawyerRank: 'LAWYER' }, staffMember: null };

// payable=1000 (1 confirmed CLIENT_PAYABLE line), expense unpaid=1000 (ER total 1000 / paid 0)
function makeDb(opts: any = {}) {
  const db: any = {
    user: { findUnique: jest.fn().mockResolvedValue('user' in opts ? opts.user : PARTNER) },
    caseClient: {
      findFirst: jest.fn().mockResolvedValue('cc' in opts ? opts.cc : { id: 'cc-A' }),
      findMany: jest.fn().mockResolvedValue(opts.ccList ?? []),
    },
    expenseRequest: {
      findFirst: jest.fn().mockResolvedValue(
        'er' in opts ? opts.er : { id: 'er-1', totalAmount: D(1000), paidTotal: D(0), currency: 'TRY' },
      ),
      findMany: jest.fn().mockResolvedValue(opts.erList ?? []),
    },
    collectionDispositionLine: {
      findMany: jest.fn().mockResolvedValue(opts.payableLines ?? [{ amount: D(1000), disposition: { collectionId: 'col1' } }]),
    },
    collection: { findMany: jest.fn().mockResolvedValue(opts.confirmed ?? [{ id: 'col1' }]) },
    clientPayout: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: opts.paid ?? null } }) },
    clientOffset: {
      findUnique: jest.fn().mockResolvedValue(opts.existing ?? null),
      findFirst: jest.fn().mockResolvedValue(opts.alreadyReversed ?? null),
      create: jest.fn().mockResolvedValue({ id: opts.newId ?? 'off-new' }),
      findMany: jest.fn().mockResolvedValue(opts.offsetList ?? []),
      aggregate: jest.fn().mockImplementation((args: any) => {
        const w = args.where ?? {};
        if (w.payableCaseId !== undefined) {
          return Promise.resolve({ _sum: { amount: w.kind === 'APPLY' ? (opts.offPayApply ?? null) : (opts.offPayRev ?? null) } });
        }
        if (w.expenseRequestId !== undefined) {
          return Promise.resolve({ _sum: { amount: w.kind === 'APPLY' ? (opts.offExpApply ?? null) : (opts.offExpRev ?? null) } });
        }
        return Promise.resolve({ _sum: { amount: null } });
      }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  db.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(db));
  return db;
}

const audit = () => ({ logInTransaction: jest.fn().mockResolvedValue(undefined) }) as any;
const svc = (db: any, a: any = audit()) => ({
  service: new ClientOffsetService(db, a, new ClientSettlementReadService(db)),
  audit: a,
});

const CREATE = (over: any = {}) => ({
  clientId: 'cl-1',
  currency: 'TRY',
  payableCaseId: 'case-P',
  payableCaseClientId: 'cc-A',
  expenseCaseId: 'case-E',
  expenseRequestId: 'er-1',
  amount: '400',
  idempotencyKey: 'k1',
  ...over,
});
const REVERSE = (over: any = {}) => ({ reason: 'Hatalı mahsup düzeltmesi', idempotencyKey: 'rk1', ...over });
const APPLY_ROW = (over: any = {}) => ({
  id: 'off-1',
  kind: 'APPLY',
  clientId: 'cl-1',
  amount: D(400),
  currency: 'TRY',
  payableCaseId: 'case-P',
  payableCaseClientId: 'cc-A',
  expenseCaseId: 'case-E',
  expenseRequestId: 'er-1',
  reversesOffsetId: null,
  ...over,
});

describe('ClientOffsetService.createOffset', () => {
  it('happy APPLY: amount<=min(payable,expense) → created + advisory-lock + kind=APPLY + approvalRef=null + audit DIRECT_CAPABILITY', async () => {
    const db = makeDb();
    const { service, audit: a } = svc(db);
    const res = await service.createOffset('t1', 'u1', CREATE({ amount: '400' }));
    expect(res).toEqual({ created: true, offsetId: 'off-new' });
    expect(db.$executeRaw).toHaveBeenCalled(); // pg_advisory_xact_lock
    expect(db.clientOffset.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'APPLY', approvalRef: null, createdById: 'u1', amount: D(400), reversesOffsetId: null }) }),
    );
    expect(a.logInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ action: 'CLIENT_OFFSET_CREATED', metadata: expect.objectContaining({ authorizationMode: 'DIRECT_CAPABILITY' }) }),
    );
  });

  it('amount > min(payable,expense) → BadRequest OFFSET_EXCEEDS_AVAILABLE (expense unpaid sınırlar)', async () => {
    const db = makeDb({ er: { id: 'er-1', totalAmount: D(300), paidTotal: D(0), currency: 'TRY' } });
    await expect(svc(db).service.createOffset('t1', 'u1', CREATE({ amount: '500' }))).rejects.toThrow(BadRequestException);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });

  it('amount == min(payable,expense) → boundary created', async () => {
    const db = makeDb({ er: { id: 'er-1', totalAmount: D(300), paidTotal: D(0), currency: 'TRY' } });
    const res = await svc(db).service.createOffset('t1', 'u1', CREATE({ amount: '300' }));
    expect(res.created).toBe(true);
  });

  it('foreign payable leg (caseClient bulunamadı) → BadRequest', async () => {
    const db = makeDb({ cc: null });
    await expect(svc(db).service.createOffset('t1', 'u1', CREATE())).rejects.toThrow(BadRequestException);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });

  it('foreign/cancelled expense leg (ExpenseRequest bulunamadı) → BadRequest', async () => {
    const db = makeDb({ er: null });
    await expect(svc(db).service.createOffset('t1', 'u1', CREATE())).rejects.toThrow(BadRequestException);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });

  it('cross-currency (expense leg currency≠dto.currency) → BadRequest', async () => {
    const db = makeDb({ er: { id: 'er-1', totalAmount: D(1000), paidTotal: D(0), currency: 'USD' } });
    await expect(svc(db).service.createOffset('t1', 'u1', CREATE({ currency: 'TRY' }))).rejects.toThrow(/[Cc]ross-currency/);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });

  it('amount <= 0 → BadRequest', async () => {
    const db = makeDb();
    await expect(svc(db).service.createOffset('t1', 'u1', CREATE({ amount: '0' }))).rejects.toThrow(BadRequestException);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });

  it('prior APPLY available payable\'ı düşürür (computeOutstanding offset term): 400 reject / 300 ok', async () => {
    // payable gross 1000, prior APPLY 700 → available 300
    const reject = makeDb({ offPayApply: D(700) });
    await expect(svc(reject).service.createOffset('t1', 'u1', CREATE({ amount: '400' }))).rejects.toThrow(BadRequestException);
    const ok = makeDb({ offPayApply: D(700) });
    const res = await svc(ok).service.createOffset('t1', 'u1', CREATE({ amount: '300' }));
    expect(res.created).toBe(true);
  });

  it('idempotency replay (pre-lock aynı payload) → created:false, create çağrılmaz', async () => {
    const db = makeDb({ existing: { ...APPLY_ROW(), id: 'off-existing' } });
    const res = await svc(db).service.createOffset('t1', 'u1', CREATE({ amount: '400' }));
    expect(res).toEqual({ created: false, offsetId: 'off-existing', idempotentReplay: true });
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });

  it('idempotency conflict (aynı key farklı amount) → ConflictException', async () => {
    const db = makeDb({ existing: { ...APPLY_ROW(), id: 'off-existing', amount: D(999) } });
    await expect(svc(db).service.createOffset('t1', 'u1', CREATE({ amount: '400' }))).rejects.toThrow(ConflictException);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });

  it('in-tx dup (pre null, lock altında bulunur) → replay, create çağrılmaz', async () => {
    const db = makeDb();
    db.clientOffset.findUnique
      .mockResolvedValueOnce(null) // pre-lock
      .mockResolvedValueOnce({ ...APPLY_ROW(), id: 'off-existing' }); // in-tx
    const res = await svc(db).service.createOffset('t1', 'u1', CREATE({ amount: '400' }));
    expect(res.created).toBe(false);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });
});

describe('ClientOffsetService.reverseOffset', () => {
  it('happy REVERSAL: ayrı immutable row (kind=REVERSAL, reversesOffsetId, aynı amount) + audit DIRECT_CAPABILITY', async () => {
    const db = makeDb();
    db.clientOffset.findFirst.mockResolvedValueOnce(APPLY_ROW()).mockResolvedValueOnce(null); // original / not-already-reversed
    db.clientOffset.create.mockResolvedValue({ id: 'rev-new' });
    const { service, audit: a } = svc(db);
    const res = await service.reverseOffset('t1', 'u1', 'off-1', REVERSE());
    expect(res).toEqual({ created: true, offsetId: 'rev-new', reversesOffsetId: 'off-1' });
    expect(db.clientOffset.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'REVERSAL', reversesOffsetId: 'off-1', amount: D(400), approvalRef: null }) }),
    );
    expect(a.logInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ action: 'CLIENT_OFFSET_REVERSED', metadata: expect.objectContaining({ authorizationMode: 'DIRECT_CAPABILITY' }) }),
    );
  });

  it('reason <10 karakter → BadRequest', async () => {
    const db = makeDb();
    await expect(svc(db).service.reverseOffset('t1', 'u1', 'off-1', REVERSE({ reason: 'kısa' }))).rejects.toThrow(BadRequestException);
  });

  it('original bulunamadı → NotFound', async () => {
    const db = makeDb();
    db.clientOffset.findFirst.mockResolvedValue(null);
    await expect(svc(db).service.reverseOffset('t1', 'u1', 'yok', REVERSE())).rejects.toThrow(NotFoundException);
  });

  it('REVERSAL reverse edilemez (yalnız APPLY) → BadRequest', async () => {
    const db = makeDb();
    db.clientOffset.findFirst.mockResolvedValue(APPLY_ROW({ kind: 'REVERSAL', reversesOffsetId: 'off-0' }));
    await expect(svc(db).service.reverseOffset('t1', 'u1', 'off-1', REVERSE())).rejects.toThrow(BadRequestException);
  });

  it('double-reversal → ConflictException OFFSET_ALREADY_REVERSED, create çağrılmaz', async () => {
    const db = makeDb();
    db.clientOffset.findFirst.mockResolvedValueOnce(APPLY_ROW()).mockResolvedValueOnce({ id: 'rev-existing' });
    await expect(svc(db).service.reverseOffset('t1', 'u1', 'off-1', REVERSE())).rejects.toThrow(ConflictException);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });

  it('reverse idempotency replay (pre aynı payload) → created:false', async () => {
    const db = makeDb();
    db.clientOffset.findFirst.mockResolvedValue(APPLY_ROW()); // original
    db.clientOffset.findUnique.mockResolvedValue({
      id: 'rev-existing', clientId: 'cl-1', currency: 'TRY', payableCaseId: 'case-P', payableCaseClientId: 'cc-A',
      expenseCaseId: 'case-E', expenseRequestId: 'er-1', amount: D(400), kind: 'REVERSAL', reversesOffsetId: 'off-1',
    });
    const res = await svc(db).service.reverseOffset('t1', 'u1', 'off-1', REVERSE());
    expect(res.created).toBe(false);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });
});

describe('ClientOffsetService.getEligibility', () => {
  it('available>0 payable bucket + unpaid>0 expense listelenir', async () => {
    const db = makeDb({
      ccList: [{ id: 'cc-A', caseId: 'case-P', role: 'ALACAKLI', case: { fileNumber: '2026/1' } }],
      payableLines: [{ amount: D(500), disposition: { collectionId: 'col1' } }],
      confirmed: [{ id: 'col1' }],
      erList: [{ id: 'er-1', caseId: 'case-E', totalAmount: D(300), paidTotal: D(0), currency: 'TRY', status: 'PENDING', case: { fileNumber: '2026/2' } }],
    });
    const res = await svc(db).service.getEligibility('t1', 'cl-1', 'TRY');
    expect(res.eligiblePayableBuckets).toHaveLength(1);
    expect(res.eligiblePayableBuckets[0]).toEqual(expect.objectContaining({ payableCaseClientId: 'cc-A', availableOutstanding: '500' }));
    expect(res.eligibleExpenseRequests).toHaveLength(1);
    expect(res.eligibleExpenseRequests[0]).toEqual(expect.objectContaining({ expenseRequestId: 'er-1', unpaidAmount: '300' }));
  });

  it('sıfır-available payable + currency-mismatch/sıfır-unpaid expense → elenir', async () => {
    const db = makeDb({
      ccList: [{ id: 'cc-A', caseId: 'case-P', role: 'ALACAKLI', case: { fileNumber: '2026/1' } }],
      payableLines: [],
      confirmed: [],
      erList: [
        { id: 'er-usd', caseId: 'case-E', totalAmount: D(300), paidTotal: D(0), currency: 'USD', status: 'PENDING', case: { fileNumber: '2026/2' } },
        { id: 'er-paid', caseId: 'case-E', totalAmount: D(300), paidTotal: D(300), currency: 'TRY', status: 'PENDING', case: { fileNumber: '2026/3' } },
      ],
    });
    const res = await svc(db).service.getEligibility('t1', 'cl-1', 'TRY');
    expect(res.eligiblePayableBuckets).toHaveLength(0);
    expect(res.eligibleExpenseRequests).toHaveLength(0);
  });
});

describe('ClientOffsetService.listOffsets', () => {
  it('tenant+client scope + filtre ile findMany', async () => {
    const db = makeDb({ offsetList: [APPLY_ROW()] });
    const res = await svc(db).service.listOffsets('t1', 'cl-1', { currency: 'TRY', kind: 'APPLY' });
    expect(res).toHaveLength(1);
    expect(db.clientOffset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1', clientId: 'cl-1', currency: 'TRY', kind: 'APPLY' }) }),
    );
  });
});

describe('ClientOffsetService — GÜVENLİK (explicit PARTNER/MANAGER; dormant @CpeRequired\'a güvenilmez)', () => {
  it('non-admin createOffset → 403 Forbidden, create çağrılmaz', async () => {
    const db = makeDb({ user: PLAIN_LAWYER });
    await expect(svc(db).service.createOffset('t1', 'u1', CREATE())).rejects.toThrow(ForbiddenException);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });

  it('non-admin reverseOffset → 403 Forbidden, create çağrılmaz', async () => {
    const db = makeDb({ user: PLAIN_LAWYER });
    db.clientOffset.findFirst.mockResolvedValue(APPLY_ROW());
    await expect(svc(db).service.reverseOffset('t1', 'u1', 'off-1', REVERSE())).rejects.toThrow(ForbiddenException);
    expect(db.clientOffset.create).not.toHaveBeenCalled();
  });

  it('PARTNER apply yapabilir', async () => {
    const db = makeDb({ user: PARTNER });
    const res = await svc(db).service.createOffset('t1', 'u1', CREATE({ amount: '400' }));
    expect(res.created).toBe(true);
  });

  it('MANAGER (staffType) apply yapabilir', async () => {
    const db = makeDb({ user: MANAGER });
    const res = await svc(db).service.createOffset('t1', 'u1', CREATE({ amount: '400' }));
    expect(res.created).toBe(true);
  });

  it('sahte approvalRef yetki vermez: non-admin → 403; PARTNER başarısında approvalRef=null (DIRECT_CAPABILITY)', async () => {
    // approvalRef public DTO\'da yok; client gönderse bile guard kapasiteye bakar.
    const nonAdmin = makeDb({ user: PLAIN_LAWYER });
    await expect(
      svc(nonAdmin).service.createOffset('t1', 'u1', CREATE({ approvalRef: 'FORGED-TOKEN' } as any)),
    ).rejects.toThrow(ForbiddenException);
    const partner = makeDb({ user: PARTNER });
    await svc(partner).service.createOffset('t1', 'u1', CREATE({ approvalRef: 'FORGED-TOKEN' } as any));
    expect(partner.clientOffset.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalRef: null }) }),
    );
  });

  it('@CpeRequired future-metadata controller\'da MEVCUT ama service-level guard bağımsız çalışır', () => {
    expect(Reflect.getMetadata(CPE_ACTION_CODE_KEY, ClientOffsetController.prototype.create)).toBe(ActionCode.CLIENT_OFFSET_APPLY);
    expect(Reflect.getMetadata(CPE_ACTION_CODE_KEY, ClientOffsetController.prototype.reverse)).toBe(ActionCode.CLIENT_OFFSET_REVERSE);
  });
});
