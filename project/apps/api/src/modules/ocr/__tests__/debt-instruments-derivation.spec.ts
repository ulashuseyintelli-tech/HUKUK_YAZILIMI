/**
 * PR-1 — Çoklu enstrüman altyapısı: instruments[] türetme/garanti (saf fonksiyonlar).
 *
 * scanDebtDocument şu an tek debtInfo döndürüyor (çoklu çıkarım PR-2). Bu PR yalnız:
 *  - DebtDocumentResult'a instruments[] ekler (kanonik),
 *  - boşsa debtInfo'dan TEK instrument türetir (geriye uyumluluk),
 *  - çoklu (PR-2) zaten doluysa ASLA ezmez.
 * Testin değeri: eski tek-belge akışının kırılmadığını + çoklu'nun korunduğunu kanıtlamak.
 */

import {
  deriveInstrumentsFromDebtInfo,
  ensureInstruments,
  DebtDocumentResult,
  Instrument,
} from '../ocr.service';

function baseResult(over: Partial<DebtDocumentResult> = {}): DebtDocumentResult {
  return {
    documentType: 'CEK',
    parties: [],
    debtInfo: { currency: 'TRY' },
    suggestedCaseType: 'KAMBIYO',
    confidence: 80,
    ...over,
  };
}

describe('PR-1 deriveInstrumentsFromDebtInfo — tek-belge türetme', () => {
  it('debtInfo amount varsa → tek instrument (alanlar + tip + confidence kopyalanır)', () => {
    const r = baseResult({
      documentType: 'CEK',
      debtInfo: { currency: 'TRY', amount: 400000, dueDate: '2025-11-25', documentNo: '0265895', issueDate: '2025-01-01' },
      bankInfo: { bankName: 'X Bank', branchName: 'Merkez', iban: 'TR00' },
      confidence: 90,
    });
    const out = deriveInstrumentsFromDebtInfo(r);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: 'CEK',
      documentNo: '0265895',
      amount: 400000,
      currency: 'TRY',
      dueDate: '2025-11-25',
      issueDate: '2025-01-01',
      bankName: 'X Bank',
      branchName: 'Merkez',
      iban: 'TR00',
      confidence: 90,
    });
  });

  it('documentType KIRA/CARI_HESAP/SOZLESME → instrument.type DIGER', () => {
    for (const dt of ['KIRA', 'CARI_HESAP', 'SOZLESME'] as const) {
      const out = deriveInstrumentsFromDebtInfo(baseResult({ documentType: dt, debtInfo: { currency: 'TRY', amount: 100 } }));
      expect(out[0].type).toBe('DIGER');
    }
  });

  it('SENET / FATURA tipleri birebir map edilir', () => {
    expect(deriveInstrumentsFromDebtInfo(baseResult({ documentType: 'SENET', debtInfo: { currency: 'TRY', amount: 1 } }))[0].type).toBe('SENET');
    expect(deriveInstrumentsFromDebtInfo(baseResult({ documentType: 'FATURA', debtInfo: { currency: 'TRY', amount: 1 } }))[0].type).toBe('FATURA');
  });

  it('yalnız documentNo (amount yok) bile → tek instrument (hasData)', () => {
    const out = deriveInstrumentsFromDebtInfo(baseResult({ debtInfo: { currency: 'TRY', documentNo: '0265896' } }));
    expect(out).toHaveLength(1);
    expect(out[0].documentNo).toBe('0265896');
  });

  it('anlamlı borç verisi yoksa (amount/no/dueDate hepsi yok) → boş dizi', () => {
    expect(deriveInstrumentsFromDebtInfo(baseResult({ debtInfo: { currency: 'TRY' } }))).toEqual([]);
  });
});

describe('PR-1 ensureInstruments — kanonik garanti + çoklu koruma', () => {
  it('çoklu instruments ZATEN doluysa AYNEN korunur (PR-2 ezilmez)', () => {
    const multi: Instrument[] = [
      { type: 'CEK', documentNo: '0265895', currency: 'TRY', amount: 400000, confidence: 95 },
      { type: 'CEK', documentNo: '0265896', currency: 'TRY', amount: 400000, confidence: 95 },
    ];
    const r = baseResult({ instruments: multi, debtInfo: { currency: 'TRY', amount: 1, documentNo: 'YOKSAYILMALI' } });
    const out = ensureInstruments(r);
    expect(out).toHaveLength(2);
    expect(out).toBe(multi); // aynı referans → türetme yapılmadı
  });

  it('instruments boşsa debtInfo’dan tek eleman türetilir', () => {
    const r = baseResult({ instruments: [], debtInfo: { currency: 'TRY', amount: 425000, documentNo: '0265898' } });
    const out = ensureInstruments(r);
    expect(out).toHaveLength(1);
    expect(out[0].documentNo).toBe('0265898');
  });

  it('instruments yok + debtInfo boş → boş dizi', () => {
    expect(ensureInstruments(baseResult({ debtInfo: { currency: 'TRY' } }))).toEqual([]);
  });
});
