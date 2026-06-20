/**
 * G3d — ThirdPartyService.addExternalCaseCollection → CollectionService delegasyonu.
 *
 * Alacak haczi tahsilatı ana dosyaya kanonik yoldan yansır:
 * sourceType=EXTERNAL_CASE + sourceId=externalCaseId (idempotency/duplicate guard).
 */

import { ThirdPartyService } from '../third-party.service';

function buildService(coll: any) {
  const prisma: any = {
    externalCase: {
      findFirst: jest.fn(async () => ({
        id: 'ec1',
        tenantId: 't1',
        receivedAmount: 0,
        claimAmount: 1000,
        claimCurrency: 'TRY',
        attachmentStatus: 'ACIK',
        externalCaseNo: '2026/9',
        externalOffice: 'X İcra Dairesi',
        counterpartyName: 'Y Ltd',
        notes: null,
        caseDebtor: { case: { id: 'case1' } },
      })),
      update: jest.fn(async () => ({ id: 'ec1' })),
    },
  };
  const caseDebtorLifecycleGuard = { assertActiveByCaseDebtorId: jest.fn() };
  const svc = new ThirdPartyService(prisma, coll, caseDebtorLifecycleGuard as any);
  return { svc, prisma };
}

describe('ThirdPartyService.addExternalCaseCollection delegation (G3d)', () => {
  it('T5: kanonik create EXTERNAL_CASE sourceType + sourceId ile çağrılır', async () => {
    const coll = { create: jest.fn(async () => ({ id: 'col1' })) };
    const { svc } = buildService(coll);

    await svc.addExternalCaseCollection('t1', 'ec1', { amount: 300 });

    expect(coll.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        caseId: 'case1',
        amount: 300,
        type: 'OTHER',
        sourceType: 'EXTERNAL_CASE',
        sourceId: 'ec1',
      }),
    );
  });

  it('T5b: syncToMainCase=false → ana dosyaya yansıtılmaz (create çağrılmaz)', async () => {
    const coll = { create: jest.fn(async () => ({ id: 'col1' })) };
    const { svc } = buildService(coll);

    await svc.addExternalCaseCollection('t1', 'ec1', { amount: 300, syncToMainCase: false });

    expect(coll.create).not.toHaveBeenCalled();
  });
});
