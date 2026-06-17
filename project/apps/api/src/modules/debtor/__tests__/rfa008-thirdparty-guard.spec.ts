/**
 * RFA-008 — ThirdParty.create duplicate guard (idempotent).
 *
 * Guard yokken aynı 89-ihbarname muhatabı 2× eklenince sessiz duplicate oluyordu (unique yok).
 * Fix: caseDebtor-scoped dedup → identityNo otoriter; yoksa type+normalize-isim. Eşleşme → mevcut
 * döndür (_existingReturned), yeni satır yok. 409 yok, overwrite yok.
 */

import { ThirdPartyService } from '../third-party.service';

function build(siblings: any[]) {
  const prisma = {
    caseDebtor: { findFirst: jest.fn().mockResolvedValue({ id: 'cd1', case: { tenantId: 't1' } }) },
    thirdParty: {
      findMany: jest.fn().mockResolvedValue(siblings),
      create: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: 'NEW', ...a.data })),
    },
  };
  const svc = new ThirdPartyService(prisma as any, {} as any);
  return { svc, prisma };
}

describe('RFA-008 ThirdPartyService.create dedup', () => {
  it('aynı caseDebtor + aynı identityNo → MEVCUT döner, create ÇAĞRILMAZ', async () => {
    const { svc, prisma } = build([{ id: 'TP1', type: 'BANKA', name: 'X Bankası', identityNo: '1111111111' }]);
    const res: any = await svc.create('t1', 'cd1', { type: 'BANKA', name: 'X Bankası A.Ş.', identityNo: '1111111111', address: 'a' } as any);
    expect(res.id).toBe('TP1');
    expect(res._existingReturned).toBe(true);
    expect(prisma.thirdParty.create).not.toHaveBeenCalled();
  });

  it('identityNo aynı + type FARKLI → yine mevcut döner, overwrite YOK (type korunur)', async () => {
    const { svc, prisma } = build([{ id: 'TP2', type: 'ISVEREN', name: 'Ahmet', identityNo: '222' }]);
    const res: any = await svc.create('t1', 'cd1', { type: 'BANKA', name: 'Ahmet', identityNo: '222', address: 'a' } as any);
    expect(res.id).toBe('TP2');
    expect(res.type).toBe('ISVEREN'); // overwrite yok
    expect(prisma.thirdParty.create).not.toHaveBeenCalled();
  });

  it('kimliksiz + aynı type + aynı isim → MEVCUT döner', async () => {
    const { svc, prisma } = build([{ id: 'TP3', type: 'KIRACI', name: 'Ahmet Yılmaz', identityNo: null }]);
    const res: any = await svc.create('t1', 'cd1', { type: 'KIRACI', name: '  ahmet   YILMAZ ', address: 'a' } as any);
    expect(res.id).toBe('TP3');
    expect(res._existingReturned).toBe(true);
    expect(prisma.thirdParty.create).not.toHaveBeenCalled();
  });

  it('kimliksiz + aynı isim FARKLI type → YENİ create (kiracı Ahmet ≠ işveren Ahmet)', async () => {
    const { svc, prisma } = build([{ id: 'TP4', type: 'KIRACI', name: 'Ahmet Yılmaz', identityNo: null }]);
    await svc.create('t1', 'cd1', { type: 'ISVEREN', name: 'Ahmet Yılmaz', address: 'a' } as any);
    expect(prisma.thirdParty.create).toHaveBeenCalledTimes(1);
  });

  it('aynı isim FARKLI identityNo → YENİ create (kimlik otoriter)', async () => {
    const { svc, prisma } = build([{ id: 'TP5', type: 'BANKA', name: 'X', identityNo: '333' }]);
    await svc.create('t1', 'cd1', { type: 'BANKA', name: 'X', identityNo: '444', address: 'a' } as any);
    expect(prisma.thirdParty.create).toHaveBeenCalledTimes(1);
  });

  it('hiç sibling yok → düz create', async () => {
    const { svc, prisma } = build([]);
    await svc.create('t1', 'cd1', { type: 'BANKA', name: 'Yeni', identityNo: '555', address: 'a' } as any);
    expect(prisma.thirdParty.create).toHaveBeenCalledTimes(1);
    expect(prisma.thirdParty.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', caseDebtorId: 'cd1', name: 'Yeni' });
  });
});
