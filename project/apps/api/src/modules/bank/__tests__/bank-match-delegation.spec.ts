/**
 * G3d — BankService.matchTransaction → CollectionService delegasyonu.
 *
 *  - BAŞARILI: collectionService.create çağrılır + bankTransaction.isMatched set.
 *  - CLOSED-CASE (create throw): isMatched SET EDİLMEZ + hata yeniden fırlatılır.
 */

import { BankService } from '../bank.service';

function buildService(createImpl: (...a: any[]) => any) {
  const update = jest.fn(async () => ({}));
  const prisma: any = {
    bankTransaction: {
      findUnique: jest.fn(async () => ({
        id: 'tx1',
        tenantId: 't1',
        amount: 500,
        currency: 'TRY',
        transactionDate: new Date('2026-01-01'),
        description: 'EFT',
        isMatched: false,
      })),
      update,
    },
  };
  const coll = { create: jest.fn(createImpl) };
  const svc = new BankService({} as any, prisma, coll as any);
  jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
  return { svc, prisma, coll, update };
}

describe('BankService.matchTransaction delegation (G3d)', () => {
  it('T2: başarılı → collectionService.create + isMatched set', async () => {
    const { svc, coll, update } = buildService(async () => ({ id: 'col1' }));

    await svc.matchTransaction('tx1', 'c1', 'u1');

    expect(coll.create).toHaveBeenCalledWith(
      't1',
      // BANK_INTEGRATION: sourceType artık etiketli (şema-gate kapandı, undefined değil)
      expect.objectContaining({ caseId: 'c1', amount: 500, channel: 'BANKA', sourceType: 'BANK_INTEGRATION' }),
      'u1',
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isMatched: true, matchedCollectionId: 'col1' }),
      }),
    );
  });

  it('T3: closed-case (create throw) → isMatched SET EDİLMEZ, hata fırlar', async () => {
    const { svc, update } = buildService(async () => {
      throw new Error('Kapalı dosyaya tahsilat eklenemez');
    });

    await expect(svc.matchTransaction('tx1', 'c1', 'u1')).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});
