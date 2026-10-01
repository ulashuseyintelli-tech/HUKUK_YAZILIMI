/**
 * K3-L KP-2 (owner kararı 2026-10-01) — dosya faiz türünün kaynağı:
 *  - Yeni dosyada tür istekte açıkça gelmediyse şema varsayılanı (YASAL) KESİN tercih sayılmaz: kaynak SYSTEM_DEFAULT yazılır.
 *  - Mevcut dosyaların faiz türü DEĞİŞTİRİLMEZ; kaynağı doğrulanamayan eski YASAL uyarıyla gösterilir, geçersiz sayılmaz.
 *  - TK-13 (yeni dosya kısmı): açıkça seçilmiş YASAL belge şablonunda "belirtilmemiş" sayılıp TİCARİ ile ezilmez; kaynağı
 *    bilinmeyen eski YASAL'da mevcut şablon davranışı korunur.
 */
import { CaseService } from '../case.service';
import { TemplateEngineService } from '../../template-engine/template-engine.service';
import {
  caseInterestTypeSourceForCreate,
  isExplicitCaseInterestType,
  isUnconfirmedDefaultLegalInterest,
  readCaseInterestTypeSource,
} from '../../../common/case-interest-type-source';

const STOP = '__STOP_AFTER_CASE_CREATE__';

function createHarness() {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
  const caseCreate = jest.fn(async (_args: any) => {
    throw new Error(STOP);
  });
  (service as any).validateSubCategoryRules = () => {};
  (service as any).resolveInlinePartiesInTx = jest.fn(async () => {});
  (service as any).validateDebtorOwnershipBeforeCreate = jest.fn(async () => {});
  (service as any).prisma = {
    user: { findFirst: jest.fn(async () => ({ id: 'u1' })) },
    case: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (cb: any) =>
      cb({ executionOffice: { findUnique: jest.fn(async () => null) }, case: { create: caseCreate } }),
    ),
  };
  return { service, caseCreate };
}

function templateService(): TemplateEngineService {
  const feeEngine: any = { getInterestRate: jest.fn((_currency: string, type: string) => (type === 'TICARI' ? 48 : 24)) };
  return new TemplateEngineService({} as any, feeEngine, { log: jest.fn() } as any);
}

describe('K3-L KP-2: kaynak yardımcıları', () => {
  it('açılış kaynağı: tür istekte varsa REQUEST_EXPLICIT, yoksa SYSTEM_DEFAULT', () => {
    expect(caseInterestTypeSourceForCreate('YASAL')).toBe('REQUEST_EXPLICIT');
    expect(caseInterestTypeSourceForCreate('TICARI')).toBe('REQUEST_EXPLICIT');
    expect(caseInterestTypeSourceForCreate(undefined)).toBe('SYSTEM_DEFAULT');
    expect(caseInterestTypeSourceForCreate(null)).toBe('SYSTEM_DEFAULT');
    expect(caseInterestTypeSourceForCreate('')).toBe('SYSTEM_DEFAULT');
  });

  it('okuma: kayıt yoksa ya da tanınmıyorsa null (eski dosya: bilinmiyor) — tahmin yok', () => {
    expect(readCaseInterestTypeSource({ interestTypeSource: 'REQUEST_EXPLICIT' })).toBe('REQUEST_EXPLICIT');
    expect(readCaseInterestTypeSource({ interestTypeSource: 'SYSTEM_DEFAULT' })).toBe('SYSTEM_DEFAULT');
    expect(readCaseInterestTypeSource(null)).toBeNull();
    expect(readCaseInterestTypeSource({})).toBeNull();
    expect(readCaseInterestTypeSource({ interestTypeSource: 'USER' })).toBeNull();
    expect(readCaseInterestTypeSource(['REQUEST_EXPLICIT'])).toBeNull();
    expect(isExplicitCaseInterestType({ interestTypeSource: 'SYSTEM_DEFAULT' })).toBe(false);
  });

  it('teyitsiz varsayılan yalnız YASAL için: başka tür varsayılandan gelemez', () => {
    expect(isUnconfirmedDefaultLegalInterest('YASAL', null)).toBe(true);
    expect(isUnconfirmedDefaultLegalInterest('YASAL', { interestTypeSource: 'SYSTEM_DEFAULT' })).toBe(true);
    expect(isUnconfirmedDefaultLegalInterest('YASAL', { interestTypeSource: 'REQUEST_EXPLICIT' })).toBe(false);
    expect(isUnconfirmedDefaultLegalInterest('TICARI', null)).toBe(false);
  });
});

describe('K3-L KP-2: dosya açılışında faiz türü kaynağı yazılır', () => {
  it('tür istekte yok → YASAL varsayılanı yazılır ama kaynağı SYSTEM_DEFAULT (kesin tercih değil)', async () => {
    const { service, caseCreate } = createHarness();
    await expect(service.create('tenant-1', { fileNumber: 'F-1', type: 'GENERAL_EXECUTION' } as any, 'user-1')).rejects.toThrow(STOP);

    const data = caseCreate.mock.calls[0][0].data;
    expect(data.interestType).toBe('YASAL');
    expect(data.metadata).toEqual({ interestTypeSource: 'SYSTEM_DEFAULT' });
  });

  it.each(['YASAL', 'TICARI', 'SABIT'])('tür istekte açıkça %s → kaynağı REQUEST_EXPLICIT', async (interestType) => {
    const { service, caseCreate } = createHarness();
    await expect(
      service.create('tenant-1', { fileNumber: 'F-2', type: 'GENERAL_EXECUTION', interestType } as any, 'user-1'),
    ).rejects.toThrow(STOP);

    const data = caseCreate.mock.calls[0][0].data;
    expect(data.interestType).toBe(interestType);
    expect(data.metadata).toEqual({ interestTypeSource: 'REQUEST_EXPLICIT' });
  });
});

describe('K3-L TK-13 (yeni dosya kısmı): şablon açıkça seçilmiş YASAL\'ı TİCARİ ile ezmez', () => {
  const determine = (record: Record<string, unknown>) => (templateService() as any).determineInterestInfo(record);
  const CEK_CASE = { type: 'CHECK', subCategory: 'CEK', currency: 'TRY', interestType: 'YASAL' };

  it('çek dosyası + açıkça seçilmiş YASAL → şablon YASAL kullanır (önceden TİCARİ)', () => {
    const info = determine({ ...CEK_CASE, metadata: { interestTypeSource: 'REQUEST_EXPLICIT' } });
    expect(info).toMatchObject({ type: 'YASAL', rate: 24 });
  });

  it('çek dosyası + kaynağı bilinmeyen eski YASAL → mevcut davranış korunur (TİCARİ); dosya kaydı değişmez', () => {
    const record = { ...CEK_CASE, metadata: null };
    const info = determine(record);
    expect(info).toMatchObject({ type: 'TICARI', rate: 48 });
    expect(record.interestType).toBe('YASAL');
  });

  it('çek dosyası + sistem varsayılanı YASAL → kesin tercih sayılmaz (mevcut davranış: TİCARİ)', () => {
    expect(determine({ ...CEK_CASE, metadata: { interestTypeSource: 'SYSTEM_DEFAULT' } })).toMatchObject({ type: 'TICARI' });
  });

  it('YASAL dışı tür her zaman kayıttaki gibi', () => {
    expect(determine({ ...CEK_CASE, interestType: 'SABIT', metadata: null })).toMatchObject({ type: 'SABIT' });
  });
});
