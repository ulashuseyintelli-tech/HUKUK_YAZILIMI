import { describe, expect, it } from 'vitest';
import { buildCreateCaseDuesPayload, faturaDueFieldsFromDebtInfo, buildClaimDocumentFields, mapClaimKalemTuruToDueType, resolveDueInterestType } from '../lib/case-due-payload';

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

describe("mapClaimKalemTuruToDueType (PR-i1 — genel fer'i/masraf foundation)", () => {
  it('ana/bilinen kalemTuru → PRINCIPAL (no-op-today)', () => {
    for (const k of ['CEK', 'SENET', 'FATURA', 'KIRA', 'AIDAT', 'ASIL_ALACAK', 'KREDI', 'BANKA', 'IPOTEK', 'REHIN', 'ILAM', 'NAFAKA']) {
      expect(mapClaimKalemTuruToDueType(k)).toBe('PRINCIPAL');
    }
  });

  it("genel fer'i kalemTuru → doğru DueType", () => {
    expect(mapClaimKalemTuruToDueType('MASRAF')).toBe('EXPENSE');
    expect(mapClaimKalemTuruToDueType('YARGILAMA_GIDERI')).toBe('EXPENSE');
    expect(mapClaimKalemTuruToDueType('VEKALET_UCRETI')).toBe('VEKALET_UCRETI');
    expect(mapClaimKalemTuruToDueType('ISLEMIS_FAIZ')).toBe('INTEREST');
    expect(mapClaimKalemTuruToDueType('CEZAI_SART')).toBe('CEZAI_SART'); // → backend CONTRACTUAL_PENALTY
    expect(mapClaimKalemTuruToDueType('HARC')).toBe('HARC');
    expect(mapClaimKalemTuruToDueType('DIGER_FERI')).toBe('OTHER');
  });

  it("mevcut nested ILAM_* kalemTuru → doğru DueType", () => {
    expect(mapClaimKalemTuruToDueType('ILAM_YARGILAMA_GIDERI')).toBe('EXPENSE');
    expect(mapClaimKalemTuruToDueType('ILAM_VEKALET_UCRETI')).toBe('VEKALET_UCRETI');
    expect(mapClaimKalemTuruToDueType('ILAM_ISLEMIS_FAIZ')).toBe('INTEREST');
  });

  it('bilinmeyen/boş/undefined → PRINCIPAL (güvenli default)', () => {
    expect(mapClaimKalemTuruToDueType('___X___')).toBe('PRINCIPAL');
    expect(mapClaimKalemTuruToDueType('')).toBe('PRINCIPAL');
    expect(mapClaimKalemTuruToDueType(undefined)).toBe('PRINCIPAL');
  });
});

describe("resolveDueInterestType (PR-i2 — fer'i faiz uygunlaştırma)", () => {
  it('INTEREST (işlemiş faiz) → undefined (kalem faizin kendisi)', () => {
    expect(resolveDueInterestType('INTEREST', 'YASAL')).toBeUndefined();
    expect(resolveDueInterestType('INTEREST', 'YOK')).toBeUndefined();
    expect(resolveDueInterestType('INTEREST', undefined)).toBeUndefined();
  });

  it('"YOK" → undefined (geçersiz tip payload\'a sızmaz)', () => {
    expect(resolveDueInterestType('EXPENSE', 'YOK')).toBeUndefined();
    expect(resolveDueInterestType('PRINCIPAL', 'YOK')).toBeUndefined();
  });

  it("fer'i geçerli tip korunur", () => {
    expect(resolveDueInterestType('EXPENSE', 'YASAL')).toBe('YASAL');
    expect(resolveDueInterestType('VEKALET_UCRETI', 'YASAL')).toBe('YASAL');
  });

  it('PRINCIPAL mevcut davranış korunur (raw geçer · undefined→YASAL)', () => {
    expect(resolveDueInterestType('PRINCIPAL', 'TICARI')).toBe('TICARI');
    expect(resolveDueInterestType('PRINCIPAL', undefined)).toBe('YASAL');
    expect(resolveDueInterestType('PRINCIPAL', '')).toBe('YASAL');
  });
});
