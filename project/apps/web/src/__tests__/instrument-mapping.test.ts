/**
 * PR-3a — instrumentsToDues saf mapping testleri (frontend-only, UI YOK).
 * N enstrüman → N alacak kalemi (1:1). UI/seçim/wiring PR-3b'de.
 */

import { describe, it, expect } from 'vitest';
import {
  instrumentsToDues,
  instrumentToCaseInstrumentPayload,
  selectedInstrumentsToPayload,
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

  it('C-PR: payeeName YOKSA undefined; opsiyoneller undefined kalır', () => {
    const p = instrumentToCaseInstrumentPayload(
      inst({ documentNo: 'CK-1', amount: 100, currency: 'TRY', issueDate: '2026-01-10' }),
    );
    expect(p.dueDate).toBeUndefined();
    expect(p.bankName).toBeUndefined();
    expect(p.payeeName).toBeUndefined(); // C-PR: artık taşınır ama değer yoksa undefined
  });

  it('C-PR: payeeName VARSA payload\'a taşınır (lehtar OCR taslağı)', () => {
    const p = instrumentToCaseInstrumentPayload(
      inst({ documentNo: 'CK-1', amount: 100, currency: 'TRY', issueDate: '2026-01-10', payeeName: 'Müvekkil A.Ş.' }),
    );
    expect(p.payeeName).toBe('Müvekkil A.Ş.');
  });

  it('Faz 1b: endorsementNames + drawerIdentityNo VARSA payload\'a taşınır', () => {
    const p = instrumentToCaseInstrumentPayload(
      inst({
        documentNo: 'CK-1',
        amount: 100,
        currency: 'TRY',
        issueDate: '2026-01-10',
        drawerName: 'Borç A.Ş.',
        drawerIdentityNo: '3961146289',
        endorsementNames: ['Ciranta 1', 'Ciranta 2'],
      }),
    );
    expect(p.drawerIdentityNo).toBe('3961146289');
    expect(p.endorsementNames).toEqual(['Ciranta 1', 'Ciranta 2']);
  });

  it('Faz 1b: endorsementNames/drawerIdentityNo YOKSA undefined (geri uyum)', () => {
    const p = instrumentToCaseInstrumentPayload(
      inst({ documentNo: 'CK-1', amount: 100, currency: 'TRY', issueDate: '2026-01-10' }),
    );
    expect(p.drawerIdentityNo).toBeUndefined();
    expect(p.endorsementNames).toBeUndefined();
  });
});

describe('PR-N4b selectedInstrumentsToPayload — seçili → payload[] (REPLACE caller)', () => {
  const full = (over: Partial<Instrument> = {}) =>
    inst({ documentNo: 'CK-1', amount: 1000, currency: 'TRY', issueDate: '2026-01-10', ...over });

  it('tam enstrümanlar → payload[], sıra korunur', () => {
    const out = selectedInstrumentsToPayload([
      full({ documentNo: 'CK-1', amount: 1000 }),
      full({ type: 'SENET', documentNo: 'SN-2', amount: 2000 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.documentNo)).toEqual(['CK-1', 'SN-2']);
    expect(out.map((p) => p.type)).toEqual(['CEK', 'SENET']);
    expect(out[0].amount).toBe(1000);
  });

  it('eksik (no/keşide/tutar yok) ELENİR (savunmacı; N4a gating zaten engeller)', () => {
    const out = selectedInstrumentsToPayload([
      full({ documentNo: 'CK-OK', amount: 500 }), // tam
      inst({ amount: 1000 }), // documentNo + issueDate yok → elenir
      full({ documentNo: '', amount: 100 }), // documentNo boş → elenir
      full({ issueDate: undefined, amount: 100 }), // keşide yok → elenir
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].documentNo).toBe('CK-OK');
  });

  it('boş girdi → []', () => {
    expect(selectedInstrumentsToPayload([])).toEqual([]);
  });
});
