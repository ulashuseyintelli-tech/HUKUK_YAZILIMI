/**
 * G1 KÖPRÜSÜ — DueType → ClaimItemType mapper birim testi (T1).
 *
 * Hukuki kararlar: tbk100-legal-decisions-ledger R1/R2.
 * EXHAUSTIVE eşleme + silent default yasağı doğrulanır.
 */

import { ClaimItemType, DocumentSourceType } from '@prisma/client';
import { mapDueTypeToClaimItemType, buildClaimItemData } from '../due-to-claim-item.mapper';
import { DueType, DueDto, InterestType } from '../dto/case.dto';

describe('mapDueTypeToClaimItemType (G1)', () => {
  const expected: Array<[DueType, ClaimItemType | null]> = [
    [DueType.PRINCIPAL, ClaimItemType.PRINCIPAL],
    [DueType.INTEREST, ClaimItemType.INTEREST],
    [DueType.EXPENSE, ClaimItemType.EXPENSE],
    [DueType.VEKALET_UCRETI, ClaimItemType.ATTORNEY_FEE],
    [DueType.HARC, ClaimItemType.FEE],
    [DueType.TAZMINAT, ClaimItemType.PENALTY],
    [DueType.CEZAI_SART, ClaimItemType.CONTRACTUAL_PENALTY],
    [DueType.KIRA, ClaimItemType.PRINCIPAL],
    [DueType.AIDAT, ClaimItemType.PRINCIPAL],
    [DueType.KOMISYON, ClaimItemType.EXPENSE],
    [DueType.PRIM, ClaimItemType.PRINCIPAL],
    [DueType.OTHER, ClaimItemType.OTHER],
    [DueType.NAFAKA, null],
  ];

  it.each(expected)('%s → %s', (dueType, claimItemType) => {
    expect(mapDueTypeToClaimItemType(dueType)).toBe(claimItemType);
  });

  it('tüm DueType değerleri eşlemede tanımlı (exhaustive)', () => {
    for (const dt of Object.values(DueType)) {
      expect(() => mapDueTypeToClaimItemType(dt as DueType)).not.toThrow();
    }
    expect(expected).toHaveLength(Object.values(DueType).length);
  });

  it('NAFAKA → null (Due-only takvim, ClaimItem üretilmez)', () => {
    expect(mapDueTypeToClaimItemType(DueType.NAFAKA)).toBeNull();
  });

  it('bilinmeyen DueType → throw (silent default yasak)', () => {
    expect(() => mapDueTypeToClaimItemType('___UNKNOWN___' as DueType)).toThrow();
  });
});

describe('buildClaimItemData (G1)', () => {
  const due: DueDto = {
    type: DueType.PRINCIPAL,
    description: 'Asıl Alacak',
    amount: 1000,
    dueDate: '2026-01-01',
  };

  it('üç-tutar açılışta eşitlenir + tenantId/caseId/itemType set', () => {
    const data = buildClaimItemData('tenant-1', 'case-1', due, ClaimItemType.PRINCIPAL);
    expect(data.tenantId).toBe('tenant-1');
    expect(data.caseId).toBe('case-1');
    expect(data.itemType).toBe(ClaimItemType.PRINCIPAL);
    expect(data.originalAmount).toBe(1000);
    expect(data.demandedAmount).toBe(1000);
    expect(data.amount).toBe(1000);
    expect(data.currency).toBe('TRY');
    expect(data.description).toBe('Asıl Alacak');
    expect(data.dueDate).toEqual(new Date('2026-01-01'));
  });

  it('DB-backed faiz girdilerini ClaimItem alanlarina, interestAmount izini metadataya tasir', () => {
    const data = buildClaimItemData(
      'tenant-1',
      'case-1',
      {
        ...due,
        interestType: InterestType.YASAL,
        interestRate: 24,
        interestStartDate: '2026-01-02',
        interestEndDate: '2026-02-02',
        interestAmount: 123.45,
      },
      ClaimItemType.PRINCIPAL,
    );

    expect(data.interestType).toBe(InterestType.YASAL);
    expect(data.interestRate).toBe(24);
    expect(data.interestStartDate).toEqual(new Date('2026-01-02'));
    expect(data.interestEndDate).toEqual(new Date('2026-02-02'));
    expect(data.metadata).toEqual({
      dueInterest: {
        interestAmount: 123.45,
      },
    });
    expect((data as any).interestAmount).toBeUndefined();
  });

  it('interestAmount yoksa metadata yazmadan guvenli calisir', () => {
    const data = buildClaimItemData(
      'tenant-1',
      'case-1',
      {
        ...due,
        interestType: InterestType.YASAL,
      },
      ClaimItemType.PRINCIPAL,
    );

    expect(data.interestType).toBe(InterestType.YASAL);
    expect(data.metadata).toBeUndefined();
  });
});

describe('buildClaimItemData — FATURA G2a (referenceNo + sourceDocumentType + KDV metadata)', () => {
  const base: DueDto = { type: DueType.PRINCIPAL, amount: 1200, dueDate: '2026-01-01' };

  it('fatura Due → referenceNo=faturaNo · sourceDocumentType=FATURA · PRINCIPAL=KDV-dahil toplam · metadata.kdv', () => {
    const data = buildClaimItemData('t', 'c', {
      ...base,
      sourceDocumentNo: 'F-2026-1',
      sourceDocumentType: DocumentSourceType.FATURA,
      hasKdv: true,
      kdvRate: 20,
      kdvAmount: 200,
    }, ClaimItemType.PRINCIPAL);
    expect(data.referenceNo).toBe('F-2026-1');
    expect(data.sourceDocumentType).toBe(DocumentSourceType.FATURA);
    expect(data.amount).toBe(1200); // O-2=A: genel toplam (KDV dahil)
    expect(data.itemType).toBe(ClaimItemType.PRINCIPAL); // ayrı TAX_KDV kalemi YOK
    expect((data.metadata as any).kdv).toEqual({ hasKdv: true, kdvRate: 20, kdvAmount: 200 });
  });

  it('KDV/belge yok → referenceNo/sourceDocumentType/metadata set EDİLMEZ (regresyon)', () => {
    const data = buildClaimItemData('t', 'c', base, ClaimItemType.PRINCIPAL);
    expect(data.referenceNo).toBeUndefined();
    expect(data.sourceDocumentType).toBeUndefined();
    expect(data.metadata).toBeUndefined();
  });

  it('faiz + KDV metadata BİRLİKTE birleşir (dueInterest + kdv)', () => {
    const data = buildClaimItemData('t', 'c', { ...base, interestAmount: 50, hasKdv: true, kdvRate: 18 }, ClaimItemType.PRINCIPAL);
    expect((data.metadata as any).dueInterest).toEqual({ interestAmount: 50 });
    expect((data.metadata as any).kdv).toEqual({ hasKdv: true, kdvRate: 18 });
  });

  it('hasKdv=false → metadata.kdv yazılmaz (referenceNo yine taşınır)', () => {
    const data = buildClaimItemData('t', 'c', { ...base, sourceDocumentNo: 'F-2', sourceDocumentType: DocumentSourceType.FATURA, hasKdv: false, kdvRate: 20 }, ClaimItemType.PRINCIPAL);
    expect(data.referenceNo).toBe('F-2');
    expect(data.metadata).toBeUndefined();
  });
});

describe('buildClaimItemData — PR-2c (İLAM referenceNo/metadata.ilam · KİRA metadata.kira · issueDate)', () => {
  const base: DueDto = { type: DueType.PRINCIPAL, amount: 5000, dueDate: '2026-01-01' };

  it('İLAM → referenceNo birleşik "esas E. / karar K." + metadata.ilam yapısal + issueDate', () => {
    const data = buildClaimItemData('t', 'c', {
      ...base,
      sourceDocumentType: DocumentSourceType.ILAM,
      ilamMahkeme: 'Ankara 1. Asliye Hukuk',
      ilamEsasNo: '2024/123',
      ilamKararNo: '2025/45',
      davaTarihi: '2024-03-10',
      issueDate: '2025-06-20',
    }, ClaimItemType.PRINCIPAL);
    expect(data.referenceNo).toBe('2024/123 E. / 2025/45 K.');
    expect(data.sourceDocumentType).toBe(DocumentSourceType.ILAM);
    expect(data.issueDate).toEqual(new Date('2025-06-20'));
    expect((data.metadata as any).ilam).toEqual({
      mahkemeAdi: 'Ankara 1. Asliye Hukuk',
      esasNo: '2024/123',
      kararNo: '2025/45',
      davaTarihi: '2024-03-10',
    });
  });

  it('İLAM yalnız esasNo → referenceNo "esas E." (karar yok) + metadata.ilam tek alan', () => {
    const data = buildClaimItemData('t', 'c', { ...base, ilamEsasNo: '2024/9' }, ClaimItemType.PRINCIPAL);
    expect(data.referenceNo).toBe('2024/9 E.');
    expect((data.metadata as any).ilam).toEqual({ esasNo: '2024/9' });
  });

  it('KİRA → metadata.kira={donemBaslangic,donemBitis}; ilam yoksa referenceNo undefined', () => {
    const data = buildClaimItemData('t', 'c', {
      ...base,
      sourceDocumentType: DocumentSourceType.KIRA,
      kiraDonemBaslangic: '2026-01-01',
      kiraDonemBitis: '2026-03-31',
    }, ClaimItemType.PRINCIPAL);
    expect((data.metadata as any).kira).toEqual({ donemBaslangic: '2026-01-01', donemBitis: '2026-03-31' });
    expect(data.sourceDocumentType).toBe(DocumentSourceType.KIRA);
    expect(data.referenceNo).toBeUndefined();
  });

  it('issueDate → ClaimItem.issueDate (FATURA tarihi); ilam yokken referenceNo=sourceDocumentNo korunur', () => {
    const data = buildClaimItemData('t', 'c', {
      ...base,
      sourceDocumentNo: 'F-9',
      sourceDocumentType: DocumentSourceType.FATURA,
      issueDate: '2026-02-15',
    }, ClaimItemType.PRINCIPAL);
    expect(data.referenceNo).toBe('F-9');
    expect(data.issueDate).toEqual(new Date('2026-02-15'));
  });

  it('İLAM metadata + mevcut KDV/faiz metadata BİRLİKTE birleşir (regresyon)', () => {
    const data = buildClaimItemData('t', 'c', {
      ...base,
      ilamEsasNo: '2024/7',
      interestAmount: 50,
      hasKdv: true,
      kdvRate: 20,
    }, ClaimItemType.PRINCIPAL);
    expect((data.metadata as any).ilam).toEqual({ esasNo: '2024/7' });
    expect((data.metadata as any).dueInterest).toEqual({ interestAmount: 50 });
    expect((data.metadata as any).kdv).toEqual({ hasKdv: true, kdvRate: 20 });
  });

  it('PR-2c alanları yoksa issueDate/metadata set EDİLMEZ (regresyon)', () => {
    const data = buildClaimItemData('t', 'c', base, ClaimItemType.PRINCIPAL);
    expect(data.issueDate).toBeUndefined();
    expect(data.metadata).toBeUndefined();
  });
});
