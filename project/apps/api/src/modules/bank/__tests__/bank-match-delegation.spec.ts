import { NotFoundException } from '@nestjs/common';
import { BankService } from '../bank.service';

/**
 * G3d + tenant guard - BankService banka hareketi/hesap erişimi.
 *
 * - Başarılı eşleştirme collectionService.create çağırır ve hareketi eşleştirir.
 * - Collection create hata verirse isMatched set edilmez.
 * - Tenant guard, id bazlı erişimlerde başka tenant kaydına yan etki üretmeden 404 verir.
 */

function buildService(createImpl: (...a: any[]) => any = async () => ({ id: 'col1' }), overrides: any = {}) {
  const update = jest.fn(async () => ({}));
  const prisma: any = {
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
        amount: 500,
        currency: 'TRY',
        transactionDate: new Date('2026-01-01'),
        description: 'EFT',
        isMatched: false,
      })),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: 'tx-new', ...data })),
      update,
      ...(overrides.bankTransaction || {}),
    },
    bankIntegrationLog: {
      create: jest.fn(async () => ({ id: 'log1' })),
      update: jest.fn(async () => ({})),
      ...(overrides.bankIntegrationLog || {}),
    },
  };
  const coll = { create: jest.fn(createImpl) };
  const svc = new BankService({} as any, prisma, coll as any);
  jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
  return { svc, prisma, coll, update };
}

describe('BankService.matchTransaction delegation (G3d)', () => {
  it('T2: başarılı -> collectionService.create + isMatched set', async () => {
    const { svc, prisma, coll, update } = buildService(async () => ({ id: 'col1' }));

    await svc.matchTransaction('tx1', 'c1', 'u1', 't1');

    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx1', tenantId: 't1' },
    });
    expect(coll.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ caseId: 'c1', amount: 500, channel: 'BANKA', sourceType: 'BANK_INTEGRATION' }),
      'u1',
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isMatched: true, matchedCollectionId: 'col1' }),
      }),
    );
  });

  it('T3: closed-case (create throw) -> isMatched set edilmez, hata fırlar', async () => {
    const { svc, update } = buildService(async () => {
      throw new Error('Kapalı dosyaya tahsilat eklenemez');
    });

    await expect(svc.matchTransaction('tx1', 'c1', 'u1', 't1')).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
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
