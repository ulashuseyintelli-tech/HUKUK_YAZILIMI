/**
 * PR-N3-pure — OCR enstrüman → CaseInstrument / bağlı ClaimItem SAF dönüşüm birim testi.
 * Kararlar: docs/case-instrument-canonical-design.md
 *   D4 (enum eşleme, FATURA/DIGER→null) · K2 (CEK→presentment, SENET/BONO/POLICE→maturity) ·
 *   Corollary-2 (currency korunur, sessiz TRY-default yok) · K1 (instrumentId bağ) ·
 *   INVARIANT (CaseInstrument zorunlulukları gevşemez; eksikse sessiz create YOK → null).
 */

import { InstrumentType, ClaimItemType } from '@prisma/client';
import {
  mapOcrInstrumentTypeToCaseInstrumentType,
  resolveCaseInstrumentType,
  buildCaseInstrumentData,
  buildInstrumentPrincipalClaimItemData,
} from '../ocr-instrument-to-case-instrument.mapper';
import { CaseInstrumentInputDto, OcrInstrumentInputType, Currency } from '../dto/case.dto';

const input = (over: Partial<CaseInstrumentInputDto>): CaseInstrumentInputDto =>
  ({
    type: OcrInstrumentInputType.CEK,
    amount: 1000,
    issueDate: '2026-01-10',
    documentNo: 'CK-1',
    currency: Currency.TRY,
    ...over,
  } as CaseInstrumentInputDto);

describe('mapOcrInstrumentTypeToCaseInstrumentType (D4)', () => {
  const expected: Array<[OcrInstrumentInputType, InstrumentType | null]> = [
    [OcrInstrumentInputType.CEK, InstrumentType.CEK],
    [OcrInstrumentInputType.SENET, InstrumentType.SENET],
    [OcrInstrumentInputType.POLICE, InstrumentType.POLICE],
    [OcrInstrumentInputType.FATURA, null],
    [OcrInstrumentInputType.DIGER, null],
  ];

  it.each(expected)('%s → %s', (ocrType, caseType) => {
    expect(mapOcrInstrumentTypeToCaseInstrumentType(ocrType)).toBe(caseType);
  });

  it('tüm OcrInstrumentInputType eşlemede tanımlı (exhaustive)', () => {
    for (const t of Object.values(OcrInstrumentInputType)) {
      expect(() => mapOcrInstrumentTypeToCaseInstrumentType(t)).not.toThrow();
    }
    expect(expected).toHaveLength(Object.values(OcrInstrumentInputType).length);
  });
});

describe('resolveCaseInstrumentType — INVARIANT (eksikse sessiz create yok)', () => {
  it('tam kambiyo → kanonik tür döner', () => {
    expect(resolveCaseInstrumentType(input({ type: OcrInstrumentInputType.CEK }))).toBe(InstrumentType.CEK);
    expect(resolveCaseInstrumentType(input({ type: OcrInstrumentInputType.SENET }))).toBe(InstrumentType.SENET);
    expect(resolveCaseInstrumentType(input({ type: OcrInstrumentInputType.POLICE }))).toBe(InstrumentType.POLICE);
  });

  it('FATURA/DIGER → null (kambiyo değil)', () => {
    expect(resolveCaseInstrumentType(input({ type: OcrInstrumentInputType.FATURA }))).toBeNull();
    expect(resolveCaseInstrumentType(input({ type: OcrInstrumentInputType.DIGER }))).toBeNull();
  });

  it('documentNo eksik/boş/boşluk → null (serialNo şart)', () => {
    expect(resolveCaseInstrumentType(input({ documentNo: undefined }))).toBeNull();
    expect(resolveCaseInstrumentType(input({ documentNo: '' }))).toBeNull();
    expect(resolveCaseInstrumentType(input({ documentNo: '   ' }))).toBeNull();
  });

  it('amount eksik/0/negatif → null', () => {
    expect(resolveCaseInstrumentType(input({ amount: undefined }))).toBeNull();
    expect(resolveCaseInstrumentType(input({ amount: 0 }))).toBeNull();
    expect(resolveCaseInstrumentType(input({ amount: -5 }))).toBeNull();
  });

  it('currency eksik → null (sessiz TRY yok)', () => {
    expect(resolveCaseInstrumentType(input({ currency: undefined }))).toBeNull();
  });

  it('issueDate eksik → null (şema-zorunlu)', () => {
    expect(resolveCaseInstrumentType(input({ issueDate: undefined }))).toBeNull();
  });
});

describe('buildCaseInstrumentData', () => {
  it('alanları + tenant/case eşler; documentNo→serialNo, branchName→bankBranch', () => {
    const data = buildCaseInstrumentData(
      't1',
      'c1',
      input({ documentNo: 'CK-1', bankName: 'X Bank', branchName: 'Kadıköy', drawerName: 'Ali', payeeName: 'Veli' }),
      InstrumentType.CEK,
    );
    expect(data.tenantId).toBe('t1');
    expect(data.caseId).toBe('c1');
    expect(data.instrumentType).toBe(InstrumentType.CEK);
    expect(data.serialNo).toBe('CK-1');
    expect(data.bankName).toBe('X Bank');
    expect(data.bankBranch).toBe('Kadıköy');
    expect(data.drawerName).toBe('Ali');
    expect(data.payeeName).toBe('Veli');
    expect(data.amount).toBe(1000);
    expect(data.issueDate).toEqual(new Date('2026-01-10'));
  });

  it('K2 tarih: CEK → presentmentDate (maturityDate null)', () => {
    const data = buildCaseInstrumentData('t1', 'c1', input({ type: OcrInstrumentInputType.CEK, dueDate: '2026-03-01' }), InstrumentType.CEK);
    expect(data.presentmentDate).toEqual(new Date('2026-03-01'));
    expect(data.maturityDate).toBeNull();
  });

  it('K2 tarih: SENET → maturityDate (presentmentDate null)', () => {
    const data = buildCaseInstrumentData('t1', 'c1', input({ type: OcrInstrumentInputType.SENET, dueDate: '2026-03-01' }), InstrumentType.SENET);
    expect(data.maturityDate).toEqual(new Date('2026-03-01'));
    expect(data.presentmentDate).toBeNull();
  });

  it('K2 tarih: POLICE → maturityDate (CEK-dışı)', () => {
    const data = buildCaseInstrumentData('t1', 'c1', input({ type: OcrInstrumentInputType.POLICE, dueDate: '2026-04-01' }), InstrumentType.POLICE);
    expect(data.maturityDate).toEqual(new Date('2026-04-01'));
    expect(data.presentmentDate).toBeNull();
  });

  it('Corollary-2: currency KORUNUR (sessiz TRY-default YOK)', () => {
    expect(buildCaseInstrumentData('t1', 'c1', input({ currency: Currency.USD }), InstrumentType.CEK).currency).toBe('USD');
    expect(buildCaseInstrumentData('t1', 'c1', input({ currency: Currency.TRY }), InstrumentType.CEK).currency).toBe('TRY');
  });

  it('dueDate yoksa iki tarih de null', () => {
    const data = buildCaseInstrumentData('t1', 'c1', input({ dueDate: undefined }), InstrumentType.CEK);
    expect(data.maturityDate).toBeNull();
    expect(data.presentmentDate).toBeNull();
  });
});

describe('buildInstrumentPrincipalClaimItemData (K1 bağ + Corollary-2)', () => {
  it('PRINCIPAL + üç-tutar eşit + instrumentId bağ + currency korunur', () => {
    const data = buildInstrumentPrincipalClaimItemData('t1', 'c1', 'inst-1', input({ amount: 5000, currency: Currency.EUR, documentNo: 'CK-9' }));
    expect(data.itemType).toBe(ClaimItemType.PRINCIPAL);
    expect(data.originalAmount).toBe(5000);
    expect(data.demandedAmount).toBe(5000);
    expect(data.amount).toBe(5000);
    expect(data.instrumentId).toBe('inst-1');
    expect(data.currency).toBe('EUR');
    expect(data.description).toContain('CK-9');
  });
});
