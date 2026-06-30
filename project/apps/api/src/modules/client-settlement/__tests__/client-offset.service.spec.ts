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
    user: {
      findUnique: jest.fn().mockResolvedValue('user' in opts ? opts.user : PARTNER),
      findFirst: jest.fn().mockResolvedValue(opts.userDetail ?? { id: 'u1', name: 'Ayşe', surname: 'Yılmaz' }),
      findMany: jest.fn().mockResolvedValue(opts.auditUsers ?? [{ id: 'u1', name: 'Ayşe', surname: 'Yılmaz' }]),
    },
    caseClient: {
      findFirst: jest.fn().mockResolvedValue('cc' in opts ? opts.cc : { id: 'cc-A', role: 'ALACAKLI' }),
      findMany: jest.fn().mockResolvedValue(opts.ccList ?? []),
    },
    case: {
      findFirst: jest.fn().mockImplementation((args: any) => {
        if (args.where?.id === 'case-P') return Promise.resolve(opts.payableCase ?? { id: 'case-P', fileNumber: '2026/1', executionFileNumber: '2026/EX-1' });
        if (args.where?.id === 'case-E') return Promise.resolve(opts.expenseCase ?? { id: 'case-E', fileNumber: '2026/2', executionFileNumber: '2026/EX-2' });
        return Promise.resolve(null);
      }),
    },
    expenseRequest: {
      findFirst: jest.fn().mockResolvedValue(
        'er' in opts ? opts.er : { id: 'er-1', totalAmount: D(1000), paidTotal: D(0), currency: 'TRY', status: 'PENDING', packageCode: 'UYAP_PRE', stageCode: 'OPENING', requestItems: [{ label: 'Peşin harç' }] },
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
    // FAZ-1b: computeExpenseRemaining reimbursement application terimleri (offset testlerinde application yok → null = 0).
    collectionDispositionExpenseApplication: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue(opts.auditRows ?? []),
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
    const res = await svc(db).service.getEligibility('t1', 'u1', 'cl-1', 'TRY');
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
    const res = await svc(db).service.getEligibility('t1', 'u1', 'cl-1', 'TRY');
    expect(res.eligiblePayableBuckets).toHaveLength(0);
    expect(res.eligibleExpenseRequests).toHaveLength(0);
  });

  // C-2a — canApply UX flag (güvenlik DEĞİL)
  it('canApply true (PARTNER)', async () => {
    const db = makeDb({ user: PARTNER });
    const res = await svc(db).service.getEligibility('t1', 'u1', 'cl-1', 'TRY');
    expect(res.canApply).toBe(true);
  });

  it('canApply true (MANAGER staffType)', async () => {
    const db = makeDb({ user: MANAGER });
    const res = await svc(db).service.getEligibility('t1', 'u1', 'cl-1', 'TRY');
    expect(res.canApply).toBe(true);
  });

  it('canApply false (non-admin)', async () => {
    const db = makeDb({ user: PLAIN_LAWYER });
    const res = await svc(db).service.getEligibility('t1', 'u1', 'cl-1', 'TRY');
    expect(res.canApply).toBe(false);
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

const PREVIEW = (over: any = {}) => ({
  clientId: 'cl-1',
  currency: 'TRY',
  payableCaseId: 'case-P',
  payableCaseClientId: 'cc-A',
  expenseCaseId: 'case-E',
  expenseRequestId: 'er-1',
  amount: '400',
  ...over,
});

describe('ClientOffsetService.previewOffset (C-2a, non-persistent)', () => {
  it('before/after/net/max/netUnchanged döner; hesap BACKEND\'de (after=before−amount, net korunur)', async () => {
    // payable 1000, expense unpaid 600 → max 600; amount 400
    const db = makeDb({ er: { id: 'er-1', totalAmount: D(600), paidTotal: D(0), currency: 'TRY' } });
    const res = await svc(db).service.previewOffset('t1', 'u1', PREVIEW({ amount: '400' }));
    expect(res).toEqual({
      payableBefore: '1000',
      payableAfter: '600',
      expenseBefore: '600',
      expenseAfter: '200',
      netBefore: '400',
      netAfter: '400',
      maxAmount: '600',
      netUnchanged: true,
    });
  });

  it('amount > max → OFFSET_EXCEEDS_AVAILABLE (BadRequest)', async () => {
    const db = makeDb({ er: { id: 'er-1', totalAmount: D(300), paidTotal: D(0), currency: 'TRY' } });
    await expect(svc(db).service.previewOffset('t1', 'u1', PREVIEW({ amount: '500' }))).rejects.toThrow(BadRequestException);
  });

  it('MUTATE YOK: ClientOffset create EDİLMEZ', async () => {
    const db = makeDb();
    await svc(db).service.previewOffset('t1', 'u1', PREVIEW({ amount: '400' }));
    expect(db.clientOffset.create).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled(); // advisory-lock yok (non-persistent)
  });

  it('AUDIT YOK: logInTransaction çağrılmaz', async () => {
    const db = makeDb();
    const { service, audit: a } = svc(db);
    await service.previewOffset('t1', 'u1', PREVIEW({ amount: '400' }));
    expect(a.logInTransaction).not.toHaveBeenCalled();
  });

  it('cross-currency (expense leg currency≠dto.currency) → BadRequest', async () => {
    const db = makeDb({ er: { id: 'er-1', totalAmount: D(1000), paidTotal: D(0), currency: 'USD' } });
    await expect(svc(db).service.previewOffset('t1', 'u1', PREVIEW({ currency: 'TRY' }))).rejects.toThrow(/[Cc]ross-currency/);
  });

  it('createOffset ile AYNI canonical kaynak: prior APPLY payableBefore\'ı düşürür (computeOutstanding reuse)', async () => {
    // payable gross 1000, prior APPLY 700 → payableBefore 300 (computeOutstanding offset term reuse)
    const db = makeDb({ offPayApply: D(700) });
    const res = await svc(db).service.previewOffset('t1', 'u1', PREVIEW({ amount: '100' }));
    expect(res.payableBefore).toBe('300');
    expect(res.maxAmount).toBe('300'); // min(300, 1000)
  });

  it('non-admin preview YAPABİLİR (read) ama apply YAPAMAZ (403)', async () => {
    const previewDb = makeDb({ user: PLAIN_LAWYER });
    const res = await svc(previewDb).service.previewOffset('t1', 'u1', PREVIEW({ amount: '400' }));
    expect(res.netUnchanged).toBe(true); // preview başarılı (admin değil)
    const applyDb = makeDb({ user: PLAIN_LAWYER });
    await expect(svc(applyDb).service.createOffset('t1', 'u1', CREATE())).rejects.toThrow(ForbiddenException);
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

describe('ClientOffsetService.getOffsetDetail', () => {
  it('tenant-scoped detail: source labels + actor + sanitized audit döner; raw metadata/canReverse/alreadyReversed üretmez', async () => {
    const db = makeDb({
      auditRows: [
        {
          action: 'CLIENT_OFFSET_CREATED',
          userId: 'u1',
          userName: null,
          description: 'Müvekkil mahsubu uygulandı (400 TRY)',
          createdAt: new Date('2026-06-20T10:00:00.000Z'),
          metadata: { authorizationMode: 'DIRECT_CAPABILITY', reason: 'raw metadata görünmemeli' },
        },
      ],
    });
    db.clientOffset.findFirst
      .mockResolvedValueOnce(APPLY_ROW({ id: 'off-1', createdById: 'u1', createdAt: new Date('2026-06-20T09:00:00.000Z'), reason: null }))
      .mockResolvedValueOnce({ id: 'rev-1' });

    const { service, audit: a } = svc(db);
    const res = await service.getOffsetDetail('t1', 'off-1');

    expect(db.clientOffset.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: 'off-1', tenantId: 't1' } }));
    expect(db.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'case-P', tenantId: 't1' } }));
    expect(db.caseClient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'cc-A', client: { tenantId: 't1' }, case: { tenantId: 't1' } }) }),
    );
    expect(db.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', entityType: 'ClientOffset', entityId: 'off-1' } }),
    );
    expect(res.offset).toEqual(expect.objectContaining({ id: 'off-1', amount: '400', createdBy: { id: 'u1', displayName: 'Ayşe Yılmaz' }, reversedByOffsetId: 'rev-1' }));
    expect(res.sourceSummary.payable).toEqual(expect.objectContaining({ caseNumber: '2026/1', role: 'ALACAKLI', label: '2026/1 · ALACAKLI' }));
    expect(res.sourceSummary.expense).toEqual(expect.objectContaining({ caseNumber: '2026/2', status: 'PENDING', label: '2026/2 · Peşin harç' }));
    expect(res.auditEvents[0]).toEqual(
      expect.objectContaining({ action: 'CLIENT_OFFSET_CREATED', actor: { id: 'u1', displayName: 'Ayşe Yılmaz' }, safeSummary: 'Müvekkil mahsubu uygulandı (400 TRY)' }),
    );
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain('authorizationMode');
    expect(serialized).not.toContain('raw metadata görünmemeli');
    expect(res as any).not.toHaveProperty('canReverse');
    expect(res as any).not.toHaveProperty('alreadyReversed');
    expect(db.clientOffset.create).not.toHaveBeenCalled();
    expect(a.logInTransaction).not.toHaveBeenCalled();
  });

  it('cross-tenant veya bulunmayan offset için hard NotFound döner ve source/audit okunmaz', async () => {
    const db = makeDb();
    db.clientOffset.findFirst.mockResolvedValueOnce(null);

    await expect(svc(db).service.getOffsetDetail('tenant-A', 'foreign-offset')).rejects.toThrow(NotFoundException);
    expect(db.case.findFirst).not.toHaveBeenCalled();
    expect(db.auditLog.findMany).not.toHaveBeenCalled();
  });
});

describe('ClientOffsetController.detail', () => {
  it('tenantId request contextten alınır ve service detail projection çağrılır', async () => {
    const service = { getOffsetDetail: jest.fn().mockResolvedValue({ offset: { id: 'off-1' }, sourceSummary: {}, auditEvents: [] }) } as any;
    const controller = new ClientOffsetController(service);

    await controller.detail({ user: { tenantId: 't1', id: 'u1' } }, 'off-1');

    expect(service.getOffsetDetail).toHaveBeenCalledWith('t1', 'off-1');
  });
});