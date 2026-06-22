import { describe, expect, it } from 'vitest';
import { buildCreateCaseDuesPayload, faturaDueFieldsFromDebtInfo } from '../lib/case-due-payload';

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
