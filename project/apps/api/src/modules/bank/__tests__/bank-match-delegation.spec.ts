import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  BANK_REFERENCE_ALREADY_EXISTS,
  BankService,
} from '../bank.service';

/**
 * G3d + tenant guard - BankService banka hareketi/hesap erişimi.
 *
 * - Başarılı eşleştirme canonical command ile collectionService.create çağırır ve hareketi eşleştirir.
 * - Collection create hata verirse isMatched set edilmez.
 * - Tenant guard, id bazlı erişimlerde başka tenant kaydına yan etki üretmeden 404 verir.
 */

function buildService(createImpl: (...a: any[]) => any = async () => ({ id: 'col1' }), overrides: any = {}) {
  const update = jest.fn(async () => ({ count: 1 }));
  const financialWrites = {
    collection: jest.fn(),
    accountingJournalEntry: jest.fn(),
    icrabotTimelineEntry: jest.fn(),
    icrabotOutboxAction: jest.fn(),
    ledgerEntry: jest.fn(),
    ledgerAllocation: jest.fn(),
    collectionAllocation: jest.fn(),
    collectionOverpayment: jest.fn(),
    claimItem: jest.fn(),
  };
  const prisma: any = {
    $executeRaw: jest.fn(async () => 1),
    bankAccount: {
      findFirst: jest.fn(async () => ({
        id: 'acc1',
        tenantId: 't1',
        iban: 'TR000000000000000000000000',
        isIntegrated: true,
        integrationProvider: 'mock',
      })),
      update: jest.fn(async () => ({})),
      ...(overrides.bankAccount || {}),
    },
    bankTransaction: {
      findFirst: jest.fn(async () => ({
        id: 'tx1',
        tenantId: 't1',
        bankAccountId: 'acc1',
        amount: 500,
        currency: 'TRY',
        transactionDate: new Date('2026-01-01'),
        valueDate: new Date('2026-01-02'),
        transactionType: 'INCOMING',
        candidateStatus: 'SETTLED',
        settlementEvidenceId: 'evidence-1',
        externalSettledAt: new Date('2026-01-03T10:00:00.000Z'),
        description: 'EFT',
        referenceNo: 'REF-1',
        isMatched: false,
      })),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: 'tx-new', ...data })),
      updateMany: update,
      ...(overrides.bankTransaction || {}),
    },
    bankSettlementEvidence: {
      findUnique: jest.fn(async () => ({
        id: 'evidence-1',
        tenantId: 't1',
        source: 'SETTLEMENT_VERIFIER',
        outcome: 'SETTLED',
        observedAt: new Date('2026-01-03T10:00:00.000Z'),
      })),
      ...(overrides.bankSettlementEvidence || {}),
    },
    bankIntegrationLog: {
      create: jest.fn(async () => ({ id: 'log1' })),
      update: jest.fn(async () => ({})),
      ...(overrides.bankIntegrationLog || {}),
    },
    collection: { create: financialWrites.collection },
    accountingJournalEntry: { create: financialWrites.accountingJournalEntry },
    icrabotTimelineEntry: { create: financialWrites.icrabotTimelineEntry },
    icrabotOutboxAction: { create: financialWrites.icrabotOutboxAction },
    ledgerEntry: { create: financialWrites.ledgerEntry },
    ledgerAllocation: { create: financialWrites.ledgerAllocation },
    collectionAllocation: { create: financialWrites.collectionAllocation },
    collectionOverpayment: { create: financialWrites.collectionOverpayment },
    claimItem: { update: financialWrites.claimItem },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
  const coll = {
    create: jest.fn(createImpl),
    findById: jest.fn(async (_tenantId: string, id: string) => ({
      id,
      caseId: 'c1',
      sourceType: 'BANK_INTEGRATION',
      sourceId: 'tx1',
    })),
  };
  const audit = {
    logInTransaction: jest.fn(async () => undefined),
  };
  const svc = new BankService({} as any, prisma, coll as any, audit as any);
  jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
  return { svc, prisma, coll, audit, update, financialWrites };
}

describe('BankService.matchTransaction delegation (G3d)', () => {
  it('T2: SETTLED aday -> canonical Collection command + isMatched set', async () => {
    const { svc, prisma, coll, update } = buildService(async () => ({ id: 'col1' }));

    await svc.matchTransaction('tx1', 'c1', 'u1', 't1');

    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx1', tenantId: 't1' },
    });
    expect(prisma.bankSettlementEvidence.findUnique).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: 't1', id: 'evidence-1' } },
    });
    expect(coll.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        caseId: 'c1',
        idempotencyKey: 'bank-transaction:tx1',
        amount: 500,
        currency: 'TRY',
        type: 'BANK_TRANSFER',
        channel: 'BANKA',
        sourceType: 'BANK_INTEGRATION',
        sourceId: 'tx1',
      }),
      'u1',
      {
        correlationId: undefined,
        causationId: 'bank-transaction:tx1',
        producer: 'BANK_TRANSACTION_MATCH',
        actor: { type: 'HUMAN', userId: 'u1' },
      },
      prisma,
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isMatched: true, matchedCollectionId: 'col1' }),
      }),
    );
  });

  it('retry: aynı canonical eşleşme Collection replay döndürür ve ikinci create/update yapmaz', async () => {
    const { svc, prisma, coll, update } = buildService(undefined, {
      bankTransaction: {
        findFirst: jest.fn(async () => ({
          id: 'tx1',
          tenantId: 't1',
          amount: 500,
          currency: 'TRY',
          transactionDate: new Date('2026-01-01'),
          transactionType: 'INCOMING',
          isMatched: true,
          matchedCaseId: 'c1',
          matchedCollectionId: 'col1',
        })),
      },
    });

    await expect(svc.matchTransaction('tx1', 'c1', 'u1', 't1')).resolves.toMatchObject({
      collection: { id: 'col1' },
    });
    expect(coll.findById).toHaveBeenCalledWith('t1', 'col1', prisma);
    expect(coll.create).not.toHaveBeenCalled();
    expect(prisma.bankSettlementEvidence.findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('CAS projection kazanamazsa outer transaction fail-closed olur', async () => {
    const { svc, coll, update, audit } = buildService();
    update.mockResolvedValueOnce({ count: 0 });

    await expect(svc.matchTransaction('tx1', 'c1', 'u1', 't1')).rejects.toMatchObject({
      response: { code: 'BANK_TRANSACTION_MATCH_CONCURRENT_CONFLICT' },
    });

    expect(coll.create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('fail-closed: outgoing hareket Collection üretmez', async () => {
    const { svc, coll, update } = buildService(undefined, {
      bankTransaction: {
        findFirst: jest.fn(async () => ({
          id: 'tx-out', tenantId: 't1', amount: 500, currency: 'TRY',
          transactionDate: new Date('2026-01-01'), transactionType: 'OUTGOING', isMatched: false,
        })),
      },
    });

    await expect(svc.matchTransaction('tx-out', 'c1', 'u1', 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(coll.create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('fail-closed: başka dosyayla eşleşmiş hareket yeniden yönlendirilemez', async () => {
    const { svc, coll, update } = buildService(undefined, {
      bankTransaction: {
        findFirst: jest.fn(async () => ({
          id: 'tx1', tenantId: 't1', amount: 500, currency: 'TRY',
          transactionDate: new Date('2026-01-01'), transactionType: 'INCOMING', isMatched: true,
          matchedCaseId: 'other-case', matchedCollectionId: 'col-other',
        })),
      },
    });

    await expect(svc.matchTransaction('tx1', 'c1', 'u1', 't1')).rejects.toBeInstanceOf(ConflictException);
    expect(coll.create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['PENDING', 'BANK_RECEIPT_SETTLEMENT_REQUIRED'],
    ['REJECTED', 'BANK_RECEIPT_CANDIDATE_REJECTED'],
    [null, 'BANK_RECEIPT_CANDIDATE_STATUS_UNKNOWN'],
  ])(
    'fail-closed: %s aday canonical Collection veya finansal etki üretmez',
    async (candidateStatus, errorCode) => {
      const { svc, coll, update, financialWrites } = buildService(undefined, {
        bankTransaction: {
          findFirst: jest.fn(async () => ({
            id: 'tx1',
            tenantId: 't1',
            amount: 500,
            currency: 'TRY',
            transactionDate: new Date('2026-01-01'),
            transactionType: 'INCOMING',
            candidateStatus,
            isMatched: false,
          })),
        },
      });

      await expect(svc.matchTransaction('tx1', 'c1', 'u1', 't1')).rejects.toMatchObject({
        response: { code: errorCode },
      });
      expect(coll.create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      for (const write of Object.values(financialWrites)) {
        expect(write).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    {
      name: 'settlement evidence pointer eksik',
      transaction: { settlementEvidenceId: null },
      evidence: undefined,
      errorCode: 'BANK_RECEIPT_SETTLEMENT_EVIDENCE_REQUIRED',
    },
    {
      name: 'evidence aynı tenant içinde bulunamıyor',
      transaction: {},
      evidence: null,
      errorCode: 'BANK_RECEIPT_SETTLEMENT_EVIDENCE_INVALID',
    },
    {
      name: 'evidence başka tenant kaydı döndürüyor',
      transaction: {},
      evidence: { tenantId: 't2' },
      errorCode: 'BANK_RECEIPT_SETTLEMENT_EVIDENCE_INVALID',
    },
    {
      name: 'provider evidence yolu deferred',
      transaction: {},
      evidence: { source: 'VALIDATED_PROVIDER_ATTESTATION' },
      errorCode: 'BANK_RECEIPT_SETTLEMENT_EVIDENCE_SOURCE_UNSUPPORTED',
    },
    {
      name: 'evidence sonucu SETTLED değil',
      transaction: {},
      evidence: { outcome: 'REJECTED' },
      errorCode: 'BANK_RECEIPT_SETTLEMENT_EVIDENCE_OUTCOME_INVALID',
    },
    {
      name: 'external settlement zamanı eksik',
      transaction: { externalSettledAt: null },
      evidence: {},
      errorCode: 'BANK_RECEIPT_EXTERNAL_SETTLED_AT_REQUIRED',
    },
    {
      name: 'external settlement zamanı evidence ile uyuşmuyor',
      transaction: { externalSettledAt: new Date('2026-01-03T10:00:01.000Z') },
      evidence: {},
      errorCode: 'BANK_RECEIPT_SETTLEMENT_TIME_MISMATCH',
    },
  ])(
    'fail-closed evidence tuple: $name ise sıfır write üretir',
    async ({ transaction, evidence, errorCode }) => {
      const canonicalEvidence = {
        id: 'evidence-1',
        tenantId: 't1',
        source: 'SETTLEMENT_VERIFIER',
        outcome: 'SETTLED',
        observedAt: new Date('2026-01-03T10:00:00.000Z'),
        ...evidence,
      };
      const { svc, prisma, coll, update, financialWrites } = buildService(undefined, {
        bankTransaction: {
          findFirst: jest.fn(async () => ({
            id: 'tx1',
            tenantId: 't1',
            amount: 500,
            currency: 'TRY',
            transactionDate: new Date('2026-01-01'),
            transactionType: 'INCOMING',
            candidateStatus: 'SETTLED',
            settlementEvidenceId: 'evidence-1',
            externalSettledAt: new Date('2026-01-03T10:00:00.000Z'),
            isMatched: false,
            ...transaction,
          })),
        },
        bankSettlementEvidence: {
          findUnique: jest.fn(async () => evidence === null ? null : canonicalEvidence),
        },
      });

      await expect(svc.matchTransaction('tx1', 'c1', 'u1', 't1')).rejects.toMatchObject({
        response: { code: errorCode },
      });
      if (transaction.settlementEvidenceId === null) {
        expect(prisma.bankSettlementEvidence.findUnique).not.toHaveBeenCalled();
      } else {
        expect(prisma.bankSettlementEvidence.findUnique).toHaveBeenCalledWith({
          where: { tenantId_id: { tenantId: 't1', id: 'evidence-1' } },
        });
      }
      expect(coll.create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      for (const write of Object.values(financialWrites)) {
        expect(write).not.toHaveBeenCalled();
      }
    },
  );

  it('auto-match yalnız tenant-scoped PENDING adayı keşfeder; Collection olmadan receipt eşleşmesi persist etmez', async () => {
    const { svc, prisma, update } = buildService(undefined, {
      bankTransaction: {
        findFirst: jest.fn(async () => ({
          id: 'tx1', tenantId: 't1', candidateStatus: 'PENDING',
          transactionType: 'INCOMING', description: 'Dosya 2026/42', referenceNo: 'R1',
        })),
      },
    });
    prisma.case = { findFirst: jest.fn(async () => ({ id: 'c1' })) };

    await expect((svc as any).tryAutoMatch('tx1', 't1')).resolves.toBe(false);
    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx1', tenantId: 't1', candidateStatus: 'PENDING' },
    });
    expect(prisma.case.findFirst).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('auto-match PENDING olmayan veya legacy-unknown hareketi aday kabul etmez', async () => {
    const { svc, prisma, coll, update } = buildService(undefined, {
      bankTransaction: { findFirst: jest.fn(async () => null) },
    });
    prisma.case = { findFirst: jest.fn(async () => ({ id: 'c1' })) };

    await expect((svc as any).tryAutoMatch('tx-legacy', 't1')).resolves.toBe(false);

    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx-legacy', tenantId: 't1', candidateStatus: 'PENDING' },
    });
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(coll.create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('T3: closed-case (create throw) -> isMatched set edilmez, hata fırlar', async () => {
    const { svc, update } = buildService(async () => {
      throw new Error('Kapalı dosyaya tahsilat eklenemez');
    });

    await expect(svc.matchTransaction('tx1', 'c1', 'u1', 't1')).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('BankService.syncTransactions candidate ingress (W2.2B)', () => {
  const incoming = {
    transactionDate: new Date('2026-07-17T09:00:00.000Z'),
    valueDate: new Date('2026-07-17T09:00:00.000Z'),
    amount: 1250,
    currency: 'TRY',
    transactionType: 'INCOMING' as const,
    description: 'Dosya 2026/42 tahsilat adayı',
    referenceNo: 'REF-IN-1',
    bankReferenceId: 'BANK-IN-1',
  };
  const persistedIncoming = {
    id: 'tx-existing',
    tenantId: 't1',
    bankAccountId: 'acc1',
    ...incoming,
    candidateStatus: null,
  };

  it('yeni incoming hareketi PENDING candidate olarak yazar ve finansal etki üretmez', async () => {
    const { svc, prisma, coll, update, financialWrites } = buildService(undefined, {
      bankTransaction: { findFirst: jest.fn(async () => null) },
    });
    jest.spyOn(svc as any, 'fetchTransactions').mockResolvedValue([incoming]);
    const tryAutoMatch = jest.spyOn(svc as any, 'tryAutoMatch').mockResolvedValue(false);

    await expect(svc.syncTransactions('acc1', 't1')).resolves.toMatchObject({
      success: true,
      transactionCount: 1,
      newTransactions: 1,
      matchedTransactions: 0,
    });

    expect(prisma.bankTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        bankAccountId: 'acc1',
        transactionType: 'INCOMING',
        candidateStatus: 'PENDING',
        bankReferenceId: 'BANK-IN-1',
      }),
    });
    expect(tryAutoMatch).toHaveBeenCalledWith('tx-new', 't1');
    expect(coll.create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    for (const write of Object.values(financialWrites)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('outgoing hareketi candidate lifecycle başlatmadan persist eder', async () => {
    const { svc, prisma, coll, financialWrites } = buildService(undefined, {
      bankTransaction: { findFirst: jest.fn(async () => null) },
    });
    jest.spyOn(svc as any, 'fetchTransactions').mockResolvedValue([{
      ...incoming,
      transactionType: 'OUTGOING',
      referenceNo: 'REF-OUT-1',
      bankReferenceId: 'BANK-OUT-1',
    }]);
    const tryAutoMatch = jest.spyOn(svc as any, 'tryAutoMatch').mockResolvedValue(false);

    await expect(svc.syncTransactions('acc1', 't1')).resolves.toMatchObject({
      success: true,
      newTransactions: 1,
      matchedTransactions: 0,
    });

    const createData = prisma.bankTransaction.create.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      transactionType: 'OUTGOING',
      bankReferenceId: 'BANK-OUT-1',
    });
    expect(createData).not.toHaveProperty('candidateStatus');
    expect(tryAutoMatch).not.toHaveBeenCalled();
    expect(coll.create).not.toHaveBeenCalled();
    for (const write of Object.values(financialWrites)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('duplicate sync mevcut legacy-unknown row için ikinci row, backfill veya finansal etki üretmez', async () => {
    const { svc, prisma, coll, update, financialWrites } = buildService(undefined, {
      bankTransaction: { findFirst: jest.fn(async () => persistedIncoming) },
    });
    jest.spyOn(svc as any, 'fetchTransactions').mockResolvedValue([incoming]);
    const tryAutoMatch = jest.spyOn(svc as any, 'tryAutoMatch').mockResolvedValue(false);

    await expect(svc.syncTransactions('acc1', 't1')).resolves.toMatchObject({
      success: true,
      transactionCount: 1,
      newTransactions: 0,
      matchedTransactions: 0,
    });

    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        bankAccountId: 'acc1',
        bankReferenceId: 'BANK-IN-1',
      },
    });
    expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(tryAutoMatch).not.toHaveBeenCalled();
    expect(coll.create).not.toHaveBeenCalled();
    for (const write of Object.values(financialWrites)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['amount', { amount: 1251 }],
    ['currency', { currency: 'EUR' }],
    ['transactionDate', { transactionDate: new Date('2026-07-18T09:00:00.000Z') }],
    ['valueDate', { valueDate: new Date('2026-07-18T09:00:00.000Z') }],
  ])('aynı reference + farklı %s için deterministic conflict döner', async (_field, patch) => {
    const { svc, prisma, coll, financialWrites } = buildService(undefined, {
      bankTransaction: {
        findFirst: jest.fn(async () => ({ ...persistedIncoming, ...patch })),
      },
    });
    jest.spyOn(svc as any, 'fetchTransactions').mockResolvedValue([incoming]);
    const tryAutoMatch = jest.spyOn(svc as any, 'tryAutoMatch').mockResolvedValue(false);

    await expect(svc.syncTransactions('acc1', 't1')).resolves.toMatchObject({
      success: false,
      errorCode: BANK_REFERENCE_ALREADY_EXISTS,
      newTransactions: 0,
      matchedTransactions: 0,
    });

    expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
    expect(tryAutoMatch).not.toHaveBeenCalled();
    expect(coll.create).not.toHaveBeenCalled();
    for (const write of Object.values(financialWrites)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('P2002 race aynı semantic payload ise mevcut satırı replay eder', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persistedIncoming);
    const { svc, prisma } = buildService(undefined, {
      bankTransaction: {
        findFirst,
        create: jest.fn(async () => {
          throw Object.assign(new Error('unique violation'), { code: 'P2002' });
        }),
      },
    });
    jest.spyOn(svc as any, 'fetchTransactions').mockResolvedValue([incoming]);
    const tryAutoMatch = jest.spyOn(svc as any, 'tryAutoMatch').mockResolvedValue(false);

    await expect(svc.syncTransactions('acc1', 't1')).resolves.toMatchObject({
      success: true,
      newTransactions: 0,
      matchedTransactions: 0,
    });
    expect(prisma.bankTransaction.create).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(tryAutoMatch).not.toHaveBeenCalled();
  });

  it('P2002 race farklı semantic payload ise stable domain conflict döner', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...persistedIncoming, amount: 999 });
    const { svc, prisma, coll, financialWrites } = buildService(undefined, {
      bankTransaction: {
        findFirst,
        create: jest.fn(async () => {
          throw Object.assign(new Error('unique violation'), { code: 'P2002' });
        }),
      },
    });
    jest.spyOn(svc as any, 'fetchTransactions').mockResolvedValue([incoming]);
    const tryAutoMatch = jest.spyOn(svc as any, 'tryAutoMatch').mockResolvedValue(false);

    await expect(svc.syncTransactions('acc1', 't1')).resolves.toMatchObject({
      success: false,
      errorCode: BANK_REFERENCE_ALREADY_EXISTS,
      newTransactions: 0,
      matchedTransactions: 0,
    });
    expect(prisma.bankTransaction.create).toHaveBeenCalledTimes(1);
    expect(tryAutoMatch).not.toHaveBeenCalled();
    expect(coll.create).not.toHaveBeenCalled();
    for (const write of Object.values(financialWrites)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it.each([undefined, '', '   '])(
    'null/empty reference %p için duplicate lookup yapmadan null persist eder',
    async bankReferenceId => {
      const findFirst = jest.fn();
      const { svc, prisma } = buildService(undefined, {
        bankTransaction: { findFirst },
      });
      jest.spyOn(svc as any, 'fetchTransactions').mockResolvedValue([
        { ...incoming, bankReferenceId },
      ]);
      jest.spyOn(svc as any, 'tryAutoMatch').mockResolvedValue(false);

      await expect(svc.syncTransactions('acc1', 't1')).resolves.toMatchObject({
        success: true,
        newTransactions: 1,
      });
      expect(findFirst).not.toHaveBeenCalled();
      expect(prisma.bankTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ bankReferenceId: null }),
      });
    },
  );
});

describe('BankService tenant guard', () => {
  it('getBalance: başka tenant hesabında 404 döner', async () => {
    const { svc, prisma } = buildService(undefined, {
      bankAccount: { findFirst: jest.fn(async () => null) },
    });

    await expect(svc.getBalance('acc-other', 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bankAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'acc-other', tenantId: 't1' },
    });
  });

  it('syncTransactions: başka tenant hesabında yan etki üretmeden 404 döner', async () => {
    const { svc, prisma } = buildService(undefined, {
      bankAccount: { findFirst: jest.fn(async () => null) },
    });

    await expect(svc.syncTransactions('acc-other', 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bankIntegrationLog.create).not.toHaveBeenCalled();
    expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
  });

  it('getTransactions: hesap tenant içinde değilse hareketleri listelemez', async () => {
    const { svc, prisma } = buildService(undefined, {
      bankAccount: { findFirst: jest.fn(async () => null) },
    });

    await expect(svc.getTransactions('acc-other', 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bankTransaction.findMany).not.toHaveBeenCalled();
  });

  it('getTransactions: hareket sorgusuna tenantId ekler', async () => {
    const { svc, prisma } = buildService();

    await svc.getTransactions('acc1', 't1', { transactionType: 'INCOMING', limit: 25 });

    expect(prisma.bankTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          bankAccountId: 'acc1',
          transactionType: 'INCOMING',
        }),
        take: 25,
      }),
    );
  });

  it('matchTransaction: başka tenant hareketinde collection oluşturmaz ve 404 döner', async () => {
    const { svc, prisma, coll, update } = buildService(undefined, {
      bankTransaction: { findFirst: jest.fn(async () => null) },
    });

    await expect(svc.matchTransaction('tx-other', 'c1', 'u1', 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx-other', tenantId: 't1' },
    });
    expect(coll.create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
