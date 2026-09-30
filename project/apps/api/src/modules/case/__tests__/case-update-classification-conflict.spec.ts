/**
 * K3-L (owner GO 2026-09-30 madde 3) — güncelleme yollarında dosya açılışındaki belge türü sözleşmesi
 * (`case-classification-consistency.ts`): kambiyo alt formu ↔ kambiyo takip türü belge türü (çek ↔ senet) çelişemez.
 *
 * PUT /cases/:id takip türünü değiştiremez (DTO'da yok) → alt form KAMBİYO formuna değişirken sonuç durum mevcut takip
 * türüyle denetlenir. POST /cases/batch-update takip türünü değiştirebilir → hedef dosyaların MEVCUT alt formuyla denetlenir.
 * İlgisiz güncellemeler engellenmez; hukuki tercih (kambiyo dışı takip türü) denetlenmez.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CaseService } from '../case.service';
import { kambiyoSubFormsConflictingWith } from '../case-classification-consistency';

const TAKIP = { 'tt-cek': 'KAMBIYO_CEK', 'tt-senet': 'KAMBIYO_SENET', 'tt-ilamsiz': 'ILAMSIZ_GENEL' } as Record<string, string>;

function setup(existing: Record<string, unknown> = {}) {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
  const caseUpdate = jest.fn(async ({ data }: any) => ({ id: 'case-1', fileNumber: 'F-1', ...data }));
  const caseUpdateMany = jest.fn(async () => ({ count: 1 }));
  const caseFindFirst = jest.fn(async () => ({ id: 'case-1', fileNumber: 'F-1', subType: 'FORM_10_CEK' }));
  (service as any).findOne = jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1', fileNumber: 'F-1', ...existing }));
  (service as any).auditService = { log: jest.fn(async () => undefined) };
  (service as any).prisma = {
    court: { findFirst: jest.fn(async () => ({ id: 'crt-1' })) },
    lookupTakipTuru: { findFirst: jest.fn(async ({ where }: any) => (TAKIP[where.id] ? { code: TAKIP[where.id] } : null)) },
    case: { update: caseUpdate, updateMany: caseUpdateMany, findFirst: caseFindFirst },
  };
  return { service, caseUpdate, caseUpdateMany, caseFindFirst };
}

describe('PUT /cases/:id — alt form değişikliği mevcut takip türüyle belge türü olarak çelişemez', () => {
  it('çek takip türlü dosyada alt form bono / poliçeye → 400 kararlı kod, yazma YOK', async () => {
    for (const subType of ['FORM_10_BONO', 'FORM_10_POLICE']) {
      const { service, caseUpdate, caseUpdateMany } = setup({ subType: 'FORM_10_CEK', takipTuruId: 'tt-cek' });
      const err = await service.update('tenant-1', 'case-1', { subType } as any, 'user-1').catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({ code: 'CASE_CLASSIFICATION_DOCUMENT_KIND_CONFLICT' });
      expect(caseUpdate).not.toHaveBeenCalled();
      expect(caseUpdateMany).not.toHaveBeenCalled();
    }
  });

  it('uyumlu kambiyo alt formuna geçiş kabul; yazma takip türü değişmediyse koşullu', async () => {
    const { service, caseUpdateMany, caseUpdate } = setup({ subType: 'FORM_10', takipTuruId: 'tt-senet' });
    await service.update('tenant-1', 'case-1', { subType: 'FORM_10_BONO', notes: 'n' } as any, 'user-1');
    expect(caseUpdateMany).toHaveBeenCalledWith({
      where: { id: 'case-1', tenantId: 'tenant-1', takipTuruId: 'tt-senet' },
      data: expect.objectContaining({ subType: 'FORM_10_BONO', notes: 'n' }),
    });
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it('denetimden sonra takip türü değiştiyse (koşullu yazma 0 satır) → 409, sessiz çelişki yok', async () => {
    const { service, caseUpdateMany } = setup({ subType: 'FORM_10', takipTuruId: 'tt-cek' });
    caseUpdateMany.mockResolvedValueOnce({ count: 0 });
    const err = await service.update('tenant-1', 'case-1', { subType: 'FORM_10_CEK' } as any, 'user-1').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'CASE_CLASSIFICATION_CHANGED_CONCURRENTLY' });
  });

  it.each([
    ['alt forma dokunmayan güncelleme (kayıt önceden çelişkili olsa bile)', { subType: 'FORM_10_BONO', takipTuruId: 'tt-cek' }, { notes: 'x' }],
    ['alt form aynı değer', { subType: 'FORM_10_BONO', takipTuruId: 'tt-cek' }, { subType: 'FORM_10_BONO' }],
    ['kambiyo dışı / alt formsuz forma geçiş', { subType: 'FORM_10_CEK', takipTuruId: 'tt-senet' }, { subType: 'FORM_10' }],
    ['kambiyo dışı takip türü (hukuki tercih)', { subType: 'FORM_10', takipTuruId: 'tt-ilamsiz' }, { subType: 'FORM_10_CEK' }],
    ['takip türü seçilmemiş', { subType: 'FORM_10', takipTuruId: null }, { subType: 'FORM_10_CEK' }],
  ])('%s → engellenmez, tek yazma yapılır', async (_label, existing, dto) => {
    const { service, caseUpdate, caseUpdateMany } = setup(existing);
    await expect(service.update('tenant-1', 'case-1', dto as any, 'user-1')).resolves.toBeTruthy();
    // alt form kambiyoya değişirken (takip türü kambiyo dışı olsa da) yazma koşulludur: eşzamanlı takip türü değişikliği
    // çelişki sızdıramaz; diğer durumlarda olağan yazma
    expect(caseUpdate.mock.calls.length + caseUpdateMany.mock.calls.length).toBe(1);
  });
});

describe('POST /cases/batch-update — takip türü değişikliği hedef dosyaların alt formuyla çelişemez', () => {
  function batchSetup(conflicts: Array<{ id: string; fileNumber: string; subType: string }>, written = 2, expected = 2) {
    const stub = {} as any;
    const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
    const findMany = jest.fn(async () => conflicts);
    const updateMany = jest.fn(async () => ({ count: written }));
    const tx = { case: { count: jest.fn(async () => expected), updateMany } };
    (service as any).validateLookupIds = jest.fn(async () => undefined);
    (service as any).auditService = { log: jest.fn(async () => undefined) };
    (service as any).prisma = {
      lookupTakipTuru: { findFirst: jest.fn(async ({ where }: any) => ({ code: TAKIP[where.id] })) },
      case: { findMany, updateMany },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    return { service, findMany, updateMany, tx };
  }

  it('çelişen dosya varsa 400 + çelişen dosyalar listesi; HİÇBİR dosya güncellenmez', async () => {
    const { service, findMany, updateMany } = batchSetup([{ id: 'c1', fileNumber: '2026/1', subType: 'FORM_10_CEK' }]);
    const err = await service.batchUpdate('tenant-1', ['c1', 'c2'], { takipTuruId: 'tt-senet' }, 'user-1').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({
      code: 'CASE_CLASSIFICATION_DOCUMENT_KIND_CONFLICT',
      conflicts: [{ caseId: 'c1', fileNumber: '2026/1', subType: 'FORM_10_CEK' }],
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['c1', 'c2'] }, tenantId: 'tenant-1', subType: { in: ['FORM_10_CEK'] } },
    }));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('çelişki yoksa koşullu yazma (alt formu boş olanlar dahil); eşzamanlı değişiklikte sayı tutmazsa 409 (işlem geri alınır)', async () => {
    const ok = batchSetup([]);
    await expect(ok.service.batchUpdate('tenant-1', ['c1', 'c2'], { takipTuruId: 'tt-cek' }, 'user-1')).resolves.toEqual({ updatedCount: 2 });
    expect(ok.tx.case.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['c1', 'c2'] },
        tenantId: 'tenant-1',
        OR: [{ subType: null }, { subType: { notIn: ['FORM_10_BONO', 'FORM_10_POLICE'] } }],
      },
      data: { takipTuruId: 'tt-cek' },
    });

    const raced = batchSetup([], 1, 2);
    const err = await raced.service.batchUpdate('tenant-1', ['c1', 'c2'], { takipTuruId: 'tt-cek' }, 'user-1').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'CASE_CLASSIFICATION_CHANGED_CONCURRENTLY' });
  });

  it('kambiyo dışı takip türü ya da takip türüne dokunmayan toplu güncelleme denetlenmez (mevcut yazma)', async () => {
    for (const updates of [{ takipTuruId: 'tt-ilamsiz' }, { riskId: 'r1' }, { takipTuruId: null }]) {
      const { service, findMany, updateMany } = batchSetup([]);
      await service.batchUpdate('tenant-1', ['c1'], updates as any, 'user-1');
      expect(findMany).not.toHaveBeenCalled();
      expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['c1'] }, tenantId: 'tenant-1' } }));
    }
  });
});

describe('kambiyoSubFormsConflictingWith — aynı eşleme tablosundan', () => {
  it('çek takip türü ↔ senet formları; senet takip türü ↔ çek formu; kambiyo dışı → boş', () => {
    expect(kambiyoSubFormsConflictingWith('KAMBIYO_CEK')).toEqual(['FORM_10_BONO', 'FORM_10_POLICE']);
    expect(kambiyoSubFormsConflictingWith('KAMBIYO_SENET')).toEqual(['FORM_10_CEK']);
    expect(kambiyoSubFormsConflictingWith('ILAMSIZ_GENEL')).toEqual([]);
    expect(kambiyoSubFormsConflictingWith(undefined)).toEqual([]);
  });
});
