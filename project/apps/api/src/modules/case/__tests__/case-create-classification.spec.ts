/**
 * K3-L (#2847 bulgusu) — CaseService.create() sınıflandırma alanlarını (takip türü / aşama / risk / durum etiketi /
 * mahiyet tipi / mahiyet kodu) YAZAR ve lookup id'lerini tenant'a göre doğrular.
 *
 * Kusur: CreateCaseDto bu alanları kabul ediyor, fakat create() `tx.case.create` verisine YAZMIYORDU → sihirbazda
 * "Kambiyo - Çek" seçilen dosya takipTuruId=NULL açılıyor, belge üretimi açık takip yolu seçimini bulamıyordu.
 * Düzeltme: batchUpdate ile AYNI tenant kuralı (validateLookupIds), tx ÖNCESİ; alanlar İSTEĞE BAĞLI kalır.
 *
 * Test deseni (case-create-sorumlu-personel.spec ile aynı): mock prisma + $transaction passthrough; `case.create`
 * sentinel fırlatır → yazılan `data` yakalanır.
 */

import { BadRequestException } from '@nestjs/common';
import { CaseService } from '../case.service';

const STOP = '__STOP_AFTER_CASE_CREATE__';

type LookupTable = 'lookupTakipTuru' | 'lookupAsama' | 'lookupRisk' | 'lookupDurumEtiketi' | 'lookupMahiyetTipi';
const LOOKUP_TABLES: LookupTable[] = ['lookupTakipTuru', 'lookupAsama', 'lookupRisk', 'lookupDurumEtiketi', 'lookupMahiyetTipi'];

/** foreign: bu tablolarda id bu tenant'ta YOK (başka büro / geçersiz) */
function setup(foreign: LookupTable[] = []) {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
  const caseCreate = jest.fn(async (_args: any) => {
    throw new Error(STOP);
  });
  const transaction = jest.fn(async (cb: any) =>
    cb({ executionOffice: { findUnique: jest.fn(async () => null) }, case: { create: caseCreate } }),
  );
  (service as any).validateSubCategoryRules = () => {};
  (service as any).resolveInlinePartiesInTx = jest.fn(async () => {});
  (service as any).validateDebtorOwnershipBeforeCreate = jest.fn(async () => {});

  const lookups = Object.fromEntries(
    LOOKUP_TABLES.map((table) => [
      table,
      { findFirst: jest.fn(async (args: any) => (foreign.includes(table) ? null : { id: args.where.id })) },
    ]),
  ) as Record<LookupTable, { findFirst: jest.Mock }>;

  (service as any).prisma = {
    ...lookups,
    user: { findFirst: jest.fn(async () => ({ id: 'u1' })) },
    case: { findFirst: jest.fn(async () => null) },
    $transaction: transaction,
  };
  return { service, caseCreate, transaction, lookups };
}

const CLASSIFICATION = {
  takipTuruId: 'tt-kambiyo-cek',
  asamaId: 'as-dosya-acildi',
  riskId: 'rk-orta',
  durumEtiketiId: 'de-takipte',
  mahiyetTipiId: 'mt-cek',
  mahiyetKodu: 'CEK',
};

describe('K3-L CaseService.create() — sınıflandırma alanları yazılır + tenant doğrulaması', () => {
  it('verilen TÜM sınıflandırma alanları case.create verisine olduğu gibi yazılır; her lookup tenant kapsamında sorgulanır', async () => {
    const { service, caseCreate, lookups } = setup();
    await expect(service.create('tenant-1', { fileNumber: 'F-1', type: 'CHECK', ...CLASSIFICATION } as any, 'user-1')).rejects.toThrow(STOP);

    expect(caseCreate.mock.calls[0][0].data).toMatchObject(CLASSIFICATION);
    expect(lookups.lookupTakipTuru.findFirst).toHaveBeenCalledWith({ where: { id: 'tt-kambiyo-cek', tenantId: 'tenant-1' } });
    expect(lookups.lookupAsama.findFirst).toHaveBeenCalledWith({ where: { id: 'as-dosya-acildi', tenantId: 'tenant-1' } });
    expect(lookups.lookupRisk.findFirst).toHaveBeenCalledWith({ where: { id: 'rk-orta', tenantId: 'tenant-1' } });
    expect(lookups.lookupDurumEtiketi.findFirst).toHaveBeenCalledWith({ where: { id: 'de-takipte', tenantId: 'tenant-1' } });
    expect(lookups.lookupMahiyetTipi.findFirst).toHaveBeenCalledWith({ where: { id: 'mt-cek', tenantId: 'tenant-1' } });
  });

  it.each(LOOKUP_TABLES)('%s başka büroya ait / geçersiz → 400; transaction HİÇ başlamaz (kısmi kayıt yok)', async (table) => {
    const { service, caseCreate, transaction } = setup([table]);
    await expect(service.create('tenant-1', { fileNumber: 'F-2', type: 'CHECK', ...CLASSIFICATION } as any, 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(caseCreate).not.toHaveBeenCalled();
  });

  it('İSTEĞE BAĞLI: sınıflandırma verilmezse lookup sorgusu yapılmaz, alanlar yazılmaz (NULL kalır; türetme/varsayılan YOK)', async () => {
    const { service, caseCreate, lookups } = setup();
    await expect(service.create('tenant-1', { fileNumber: 'F-3', type: 'GENERAL_EXECUTION' } as any, 'user-1')).rejects.toThrow(STOP);

    for (const table of LOOKUP_TABLES) expect(lookups[table].findFirst).not.toHaveBeenCalled();
    const data = caseCreate.mock.calls[0][0].data;
    for (const key of Object.keys(CLASSIFICATION)) expect(data[key]).toBeUndefined();
  });

  it('boş string alanlar yazılmaz ve sorgulanmaz (web `|| undefined` ile aynı)', async () => {
    const { service, caseCreate, lookups } = setup();
    const empty = Object.fromEntries(Object.keys(CLASSIFICATION).map((k) => [k, '']));
    await expect(service.create('tenant-1', { fileNumber: 'F-4', type: 'GENERAL_EXECUTION', ...empty } as any, 'user-1')).rejects.toThrow(STOP);

    for (const table of LOOKUP_TABLES) expect(lookups[table].findFirst).not.toHaveBeenCalled();
    const data = caseCreate.mock.calls[0][0].data;
    for (const key of Object.keys(CLASSIFICATION)) expect(data[key]).toBeUndefined();
  });

  it('dosya türü/alt türü sınıflandırmadan TÜRETİLMEZ: takip türü kambiyo olsa da type/subType istekteki gibi', async () => {
    const { service, caseCreate } = setup();
    await expect(
      service.create('tenant-1', { fileNumber: 'F-5', type: 'GENERAL_EXECUTION', ...CLASSIFICATION } as any, 'user-1'),
    ).rejects.toThrow(STOP);
    const data = caseCreate.mock.calls[0][0].data;
    expect(data.type).toBe('GENERAL_EXECUTION');
    expect(data.subType).toBeUndefined();
  });
});
