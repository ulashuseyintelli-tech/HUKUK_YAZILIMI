import { BadRequestException } from '@nestjs/common';
import { ThirdPartyService } from '../third-party.service';

function buildService(coll: any, overrides: any = {}) {
  const externalCase = {
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
  };
  const prisma: any = {
    externalCase: {
      findFirst: jest.fn(async () => externalCase),
      update: jest.fn(async ({ data }: any) => ({ id: 'ec1', ...data })),
      ...(overrides.externalCase || {}),
    },
    collection: {
      findFirst: jest.fn(async () => null),
      aggregate: jest.fn(async () => ({ _sum: { amount: 300 } })),
      ...(overrides.collection || {}),
    },
  };
  const guard = { assertActiveByCaseDebtorId: jest.fn() };
  const svc = new ThirdPartyService(prisma, coll, guard as any);
  return { svc, prisma, guard };
}

describe('ThirdPartyService.addExternalCaseCollection canonical routing', () => {
  it('EXTERNAL_CASE receipt ortak identity/provenance command ile Collection sınırına gider', async () => {
    const coll = { create: jest.fn(async () => ({ id: 'col1' })) };
    const { svc, prisma } = buildService(coll);

    await svc.addExternalCaseCollection(
      't1',
      'ec1',
      { amount: 300, date: '2026-07-01', notes: 'ilk ödeme' },
      'user-1',
      'corr-1',
    );

    expect(coll.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        caseId: 'case1',
        idempotencyKey: expect.stringMatching(/^external-case:ec1:[a-f0-9]{64}$/),
        amount: 300,
        currency: 'TRY',
        type: 'OTHER',
        channel: 'ICRA_DAIRESI',
        date: '2026-07-01T00:00:00.000Z',
        sourceType: 'EXTERNAL_CASE',
        sourceId: expect.stringMatching(/^ec1:[a-f0-9]{64}$/),
      }),
      'user-1',
      expect.objectContaining({
        correlationId: 'corr-1',
        producer: 'EXTERNAL_CASE_RECEIPT',
        actor: { type: 'HUMAN', userId: 'user-1' },
        causationId: expect.stringMatching(/^external-case-receipt:ec1:[a-f0-9]{64}$/),
      }),
    );
    expect(prisma.externalCase.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ receivedAmount: 300, attachmentStatus: 'TAHSIL_BASLADI' }),
    }));
  });

  it('retry aynı source/idempotency command üretir ve projection toplamını ikinci kez artırmaz', async () => {
    const coll = { create: jest.fn(async () => ({ id: 'col1' })) };
    const { svc, prisma } = buildService(coll);
    const input = { amount: 300, date: '2026-07-01', idempotencyKey: 'client-operation-1' };

    await svc.addExternalCaseCollection('t1', 'ec1', input, 'user-1');
    await svc.addExternalCaseCollection('t1', 'ec1', input, 'user-1');

    const firstDto = coll.create.mock.calls[0][1];
    const secondDto = coll.create.mock.calls[1][1];
    expect(secondDto.idempotencyKey).toBe(firstDto.idempotencyKey);
    expect(secondDto.sourceId).toBe(firstDto.sourceId);
    expect(prisma.externalCase.update.mock.calls.map((call: any[]) => call[0].data.receivedAmount))
      .toEqual([300, 300]);
  });

  it('post-commit projection hatasında retry aynı Collection fact\'ini replay eder ve projection\'ı yakınsar', async () => {
    let canonicalReceiptWrites = 0;
    let projectionAttempts = 0;
    const receipts = new Map<string, { id: string }>();
    const externalCase: any = {
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
    };
    const coll = {
      create: jest.fn(async (_tenantId: string, dto: any) => {
        const existing = receipts.get(dto.idempotencyKey);
        if (existing) return existing;

        canonicalReceiptWrites += 1;
        const collection = { id: 'col1' };
        receipts.set(dto.idempotencyKey, collection);
        return collection;
      }),
    };
    const externalCaseRepository = {
      findFirst: jest.fn(async () => externalCase),
      update: jest.fn(async ({ data }: any) => {
        projectionAttempts += 1;
        if (projectionAttempts === 1) throw new Error('external projection failed');
        Object.assign(externalCase, data);
        return externalCase;
      }),
    };
    const { svc } = buildService(coll, {
      externalCase: externalCaseRepository,
      collection: {
        findFirst: jest.fn(async () => null),
        aggregate: jest.fn(async () => ({ _sum: { amount: 300 } })),
      },
    });
    const input = { amount: 300, date: '2026-07-01', idempotencyKey: 'client-operation-1' };

    await expect(svc.addExternalCaseCollection('t1', 'ec1', input, 'user-1'))
      .rejects.toThrow('external projection failed');
    await expect(svc.addExternalCaseCollection('t1', 'ec1', input, 'user-1'))
      .resolves.toMatchObject({ receivedAmount: 300, attachmentStatus: 'TAHSIL_BASLADI' });

    expect(canonicalReceiptWrites).toBe(1);
    expect(coll.create).toHaveBeenCalledTimes(2);
    expect(coll.create.mock.calls[1][1]).toMatchObject({
      idempotencyKey: coll.create.mock.calls[0][1].idempotencyKey,
      sourceId: coll.create.mock.calls[0][1].sourceId,
    });
    expect(externalCaseRepository.update).toHaveBeenCalledTimes(2);
    expect(externalCase.notes.match(/\[Collection:/g)).toHaveLength(1);
  });

  it('Collection create başarısızsa ExternalCase receipt projection yazılmaz ve hata yutulmaz', async () => {
    const coll = { create: jest.fn(async () => { throw new Error('canonical create failed'); }) };
    const { svc, prisma } = buildService(coll);

    await expect(
      svc.addExternalCaseCollection('t1', 'ec1', { amount: 300 }, 'user-1'),
    ).rejects.toThrow('canonical create failed');
    expect(prisma.collection.aggregate).not.toHaveBeenCalled();
    expect(prisma.externalCase.update).not.toHaveBeenCalled();
  });

  it('syncToMainCase=false secondary receipt path fail-closed kapanır', async () => {
    const coll = { create: jest.fn() };
    const { svc, prisma } = buildService(coll);

    await expect(
      svc.addExternalCaseCollection('t1', 'ec1', { amount: 300, syncToMainCase: false }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(coll.create).not.toHaveBeenCalled();
    expect(prisma.externalCase.findFirst).not.toHaveBeenCalled();
    expect(prisma.externalCase.update).not.toHaveBeenCalled();
  });

  it('actor veya para birimi yoksa fail-closed kalır', async () => {
    const coll = { create: jest.fn() };
    const { svc, prisma } = buildService(coll, {
      externalCase: {
        findFirst: jest.fn(async () => ({
          id: 'ec1', tenantId: 't1', claimAmount: 1000, claimCurrency: '',
          attachmentStatus: 'ACIK', externalCaseNo: '2026/9', externalOffice: 'X',
          counterpartyName: 'Y', notes: null, caseDebtor: { case: { id: 'case1' } },
        })),
      },
    });

    await expect(svc.addExternalCaseCollection('t1', 'ec1', { amount: 300 }, ''))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.addExternalCaseCollection('t1', 'ec1', { amount: 300 }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(coll.create).not.toHaveBeenCalled();
    expect(prisma.externalCase.update).not.toHaveBeenCalled();
  });
});
