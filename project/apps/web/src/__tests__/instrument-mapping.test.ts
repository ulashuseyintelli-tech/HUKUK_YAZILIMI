/**
 * PR-3a — instrumentsToDues saf mapping testleri (frontend-only, UI YOK).
 * N enstrüman → N alacak kalemi (1:1). UI/seçim/wiring PR-3b'de.
 */

import { describe, it, expect } from 'vitest';
import {
  instrumentsToDues,
  instrumentToCaseInstrumentPayload,
  INSTRUMENT_TYPE_LABELS,
  Instrument,
} from '../components/debtor/ocr-instrument';

const inst = (over: Partial<Instrument>): Instrument =>
  ({ type: 'CEK', currency: 'TRY', confidence: 90, ...over } as Instrument);

describe('PR-3a instrumentsToDues — N enstrüman → N due (1:1)', () => {
  it('N enstrüman → N due, sıra korunur', () => {
    const out = instrumentsToDues([
      inst({ documentNo: '0265895', amount: 400000, dueDate: '2025-11-25' }),
      inst({ documentNo: '0265896', amount: 425000, dueDate: '2025-12-15' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].amount).toBe('400000');
    expect(out[1].amount).toBe('425000');
    expect(out.every((d) => d.type === 'PRINCIPAL')).toBe(true);
  });

  it('amount sayı → string; amount yoksa boş string', () => {
    const out = instrumentsToDues([inst({ amount: 1000 }), inst({ amount: undefined })]);
    expect(out[0].amount).toBe('1000');
    expect(out[1].amount).toBe('');
  });

  it('dueDate: enstrümanınki kullanılır; yoksa defaultDueDate', () => {
    const out = instrumentsToDues(
      [inst({ dueDate: '2025-11-25' }), inst({ dueDate: undefined })],
      '2026-01-01',
    );
    expect(out[0].dueDate).toBe('2025-11-25');
    expect(out[1].dueDate).toBe('2026-01-01'); // default
  });

  it('dueDate yok + default yok → boş string (deterministik, Date.now YOK)', () => {
    expect(instrumentsToDues([inst({ dueDate: undefined })])[0].dueDate).toBe('');
  });

  it('description: documentNo varsa numaralı + tür etiketi; yoksa yalnız tür', () => {
    expect(instrumentsToDues([inst({ type: 'CEK', documentNo: '0265895' })])[0].description).toBe(
      '0265895 numaralı Çek (asıl alacak)',
    );
    expect(instrumentsToDues([inst({ type: 'SENET', documentNo: undefined })])[0].description).toBe(
      'Senet (asıl alacak)',
    );
  });

  it('boş girdi → boş dizi', () => {
    expect(instrumentsToDues([])).toEqual([]);
  });

  it('tip etiketleri (CEK/SENET/POLICE/FATURA/DIGER)', () => {
    expect(INSTRUMENT_TYPE_LABELS.CEK).toBe('Çek');
    expect(INSTRUMENT_TYPE_LABELS.SENET).toBe('Senet');
    expect(INSTRUMENT_TYPE_LABELS.POLICE).toBe('Poliçe');
    expect(INSTRUMENT_TYPE_LABELS.FATURA).toBe('Fatura');
    expect(INSTRUMENT_TYPE_LABELS.DIGER).toBe('Belge');
  });

  it('bilinmeyen tip → "Belge" fallback (savunmacı)', () => {
    const out = instrumentsToDues([inst({ type: 'XXX' as any, documentNo: '1' })]);
    expect(out[0].description).toBe('1 numaralı Belge (asıl alacak)');
  });
});

describe('PR-N4a instrumentToCaseInstrumentPayload — Instrument → CaseInstrumentInputDto şekli', () => {
  it('alanları DTO şekline eşler (type/documentNo/amount/currency/issueDate/dueDate/banka/keşideci)', () => {
    const p = instrumentToCaseInstrumentPayload(
      inst({
        type: 'SENET',
        documentNo: 'SN-7',
        amount: 5000,
        currency: 'USD',
        issueDate: '2026-01-10',
        dueDate: '2026-03-01',
        bankName: 'X Bank',
        branchName: 'Kadıköy',
        drawerName: 'Ali',
      }),
    );
    expect(p).toEqual({
      type: 'SENET',
      documentNo: 'SN-7',
      amount: 5000,
      currency: 'USD',
      issueDate: '2026-01-10',
      dueDate: '2026-03-01',
      bankName: 'X Bank',
      branchName: 'Kadıköy',
      drawerName: 'Ali',
    });
  });

  it('payeeName taşınmaz (OCR Instrument\'ta yok); opsiyoneller undefined kalır', () => {
    const p = instrumentToCaseInstrumentPayload(
      inst({ documentNo: 'CK-1', amount: 100, currency: 'TRY', issueDate: '2026-01-10' }),
    );
    expect(p.dueDate).toBeUndefined();
    expect(p.bankName).toBeUndefined();
    expect('payeeName' in p).toBe(false);
  });
});
