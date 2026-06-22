import { describe, expect, it } from 'vitest';
import { buildCreateCaseDuesPayload, faturaDueFieldsFromDebtInfo, buildClaimDocumentFields } from '../lib/case-due-payload';

describe('buildCreateCaseDuesPayload', () => {
  it('create-case payload alacak faiz alanlarini dusurmez', () => {
    expect(
      buildCreateCaseDuesPayload([
        {
          type: 'PRINCIPAL',
          description: 'Ana alacak',
          amount: '1000',
          dueDate: '2026-01-01',
          interestType: 'YASAL',
          interestRate: 24,
          interestStartDate: '2026-01-02',
          interestEndDate: '2026-02-02',
          interestAmount: 123.45,
        },
      ]),
    ).toEqual([
      {
        type: 'PRINCIPAL',
        description: 'Ana alacak',
        amount: 1000,
        dueDate: '2026-01-01',
        interestType: 'YASAL',
        interestRate: 24,
        interestStartDate: '2026-01-02',
        interestEndDate: '2026-02-02',
        interestAmount: 123.45,
      },
    ]);
  });

  it('amount bos veya sifirsa kalemi gondermez', () => {
    expect(
      buildCreateCaseDuesPayload([
        { type: 'PRINCIPAL', amount: '', dueDate: '2026-01-01' },
        { type: 'INTEREST', amount: '0', dueDate: '2026-01-01' },
        { type: 'EXPENSE', amount: '50', dueDate: '2026-01-01' },
      ]),
    ).toHaveLength(1);
  });

  it('interestAmount yoksa metadata izi icin guvenli undefined kalir', () => {
    const [payload] = buildCreateCaseDuesPayload([
      {
        type: 'PRINCIPAL',
        amount: '1000',
        dueDate: '2026-01-01',
        interestType: 'YASAL',
      },
    ]);

    expect(payload.interestAmount).toBeUndefined();
  });
});

describe('faturaDueFieldsFromDebtInfo (G2b scan-only fatura)', () => {
  it('documentType=FATURA -> belge/KDV alanlari', () => {
    expect(
      faturaDueFieldsFromDebtInfo({ documentNo: 'F-2026-1', kdvRate: 20, kdvAmount: 200 }, 'FATURA'),
    ).toEqual({ sourceDocumentNo: 'F-2026-1', sourceDocumentType: 'FATURA', hasKdv: true, kdvRate: 20, kdvAmount: 200 });
  });

  it('FATURA ama KDV yok -> hasKdv=false, oran/tutar undefined', () => {
    const f = faturaDueFieldsFromDebtInfo({ documentNo: 'F-2' }, 'FATURA');
    expect(f.sourceDocumentType).toBe('FATURA');
    expect(f.sourceDocumentNo).toBe('F-2');
    expect(f.hasKdv).toBe(false);
    expect(f.kdvRate).toBeUndefined();
  });

  it('documentType FATURA degil -> bos {} (scan-only fatura siniri)', () => {
    expect(faturaDueFieldsFromDebtInfo({ documentNo: 'X', kdvRate: 20 }, 'CEK')).toEqual({});
    expect(faturaDueFieldsFromDebtInfo({ documentNo: 'X' }, undefined)).toEqual({});
  });
});

describe('buildCreateCaseDuesPayload — FATURA belge/KDV alanlari (G2b)', () => {
  it('5 FATURA alani payload icine tasinir; amount=KDV-dahil toplam', () => {
    const [p] = buildCreateCaseDuesPayload([
      { type: 'PRINCIPAL', amount: '1200', dueDate: '2026-01-01', sourceDocumentNo: 'F-1', sourceDocumentType: 'FATURA', hasKdv: true, kdvRate: 20, kdvAmount: 200 },
    ]);
    expect(p.sourceDocumentNo).toBe('F-1');
    expect(p.sourceDocumentType).toBe('FATURA');
    expect(p.hasKdv).toBe(true);
    expect(p.kdvRate).toBe(20);
    expect(p.kdvAmount).toBe(200);
    expect(p.amount).toBe(1200);
  });

  it('FATURA alani yoksa undefined (regresyon)', () => {
    const [p] = buildCreateCaseDuesPayload([{ type: 'PRINCIPAL', amount: '1000', dueDate: '2026-01-01' }]);
    expect(p.sourceDocumentNo).toBeUndefined();
    expect(p.sourceDocumentType).toBeUndefined();
    expect(p.hasKdv).toBeUndefined();
  });
});

describe('buildClaimDocumentFields (PR-2c-2 — manuel belge alanları)', () => {
  it('FATURA → sourceDocumentNo=faturaNo · issueDate=faturaTarihi · sourceDocumentType=FATURA', () => {
    expect(
      buildClaimDocumentFields({ kalemTuru: 'FATURA', faturaBilgileri: { faturaNo: 'FTR-1', faturaTarihi: '2026-02-15' } }),
    ).toEqual({ sourceDocumentType: 'FATURA', sourceDocumentNo: 'FTR-1', issueDate: '2026-02-15' });
  });

  it('İLAM → ilamMahkeme/EsasNo/KararNo · issueDate=ilamTarihi · sourceDocumentType=ILAM (davaTarihi YOK)', () => {
    expect(
      buildClaimDocumentFields({
        kalemTuru: 'ILAM',
        ilamBilgileri: { mahkemeAdi: 'Ankara 1. AHM', esasNo: '2024/123', kararNo: '2025/45', ilamTarihi: '2025-06-20' },
      }),
    ).toEqual({
      sourceDocumentType: 'ILAM',
      ilamMahkeme: 'Ankara 1. AHM',
      ilamEsasNo: '2024/123',
      ilamKararNo: '2025/45',
      issueDate: '2025-06-20',
    });
  });

  it('KİRA → kiraDonemBaslangic/Bitis · sourceDocumentType=KIRA', () => {
    expect(
      buildClaimDocumentFields({ kalemTuru: 'KIRA', kiraBilgileri: { donemBaslangic: '2026-01-01', donemBitis: '2026-03-31' } }),
    ).toEqual({ sourceDocumentType: 'KIRA', kiraDonemBaslangic: '2026-01-01', kiraDonemBitis: '2026-03-31' });
  });

  it('boş alt-nesne → yalnız sourceDocumentType (boş string alan EKLENMEZ)', () => {
    expect(buildClaimDocumentFields({ kalemTuru: 'FATURA', faturaBilgileri: { faturaNo: '', faturaTarihi: '' } })).toEqual({ sourceDocumentType: 'FATURA' });
  });

  it('CEK/SENET/diğer → {} (dokunulmaz; instruments track)', () => {
    expect(buildClaimDocumentFields({ kalemTuru: 'CEK', cekBilgileri: { cekSeriNo: 'A-1' } } as any)).toEqual({});
    expect(buildClaimDocumentFields({ kalemTuru: 'SENET' })).toEqual({});
    expect(buildClaimDocumentFields({ kalemTuru: 'ASIL_ALACAK' })).toEqual({});
  });
});

describe('buildCreateCaseDuesPayload — PR-2c-2 belge alanları passthrough', () => {
  it('issueDate/ilam*/sourceDocumentType payload içine taşınır', () => {
    const [p] = buildCreateCaseDuesPayload([
      {
        type: 'PRINCIPAL', amount: '5000', dueDate: '2026-01-01',
        sourceDocumentType: 'ILAM', ilamMahkeme: 'X AHM', ilamEsasNo: '2024/1', ilamKararNo: '2025/2', issueDate: '2025-06-20',
      },
    ]);
    expect(p.sourceDocumentType).toBe('ILAM');
    expect(p.ilamMahkeme).toBe('X AHM');
    expect(p.ilamEsasNo).toBe('2024/1');
    expect(p.ilamKararNo).toBe('2025/2');
    expect(p.issueDate).toBe('2025-06-20');
  });

  it('kira dönem alanları payload içine taşınır', () => {
    const [p] = buildCreateCaseDuesPayload([
      { type: 'PRINCIPAL', amount: '3000', dueDate: '2026-01-01', sourceDocumentType: 'KIRA', kiraDonemBaslangic: '2026-01-01', kiraDonemBitis: '2026-03-31' },
    ]);
    expect(p.kiraDonemBaslangic).toBe('2026-01-01');
    expect(p.kiraDonemBitis).toBe('2026-03-31');
  });

  it('PR-2c-2 alanları yoksa undefined (regresyon)', () => {
    const [p] = buildCreateCaseDuesPayload([{ type: 'PRINCIPAL', amount: '1000', dueDate: '2026-01-01' }]);
    expect(p.issueDate).toBeUndefined();
    expect(p.ilamEsasNo).toBeUndefined();
    expect(p.kiraDonemBaslangic).toBeUndefined();
  });
});
