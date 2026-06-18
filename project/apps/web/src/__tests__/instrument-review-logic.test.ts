/**
 * PR-3b — review accept davranış kararı (saf). KRİTİK: instruments>1 → çift-ekleme YOK
 * (yalnız onInstrumentsDetected); ≤1 → eski onDebtInfoDetected.
 */

import { describe, it, expect } from 'vitest';
import {
  decideScanAccept,
  acceptButtonLabel,
  isAcceptDisabled,
  shouldShowInstrumentTable,
  Instrument,
} from '../components/debtor/ocr-instrument';

const inst = (over: Partial<Instrument>): Instrument =>
  ({ type: 'CEK', currency: 'TRY', confidence: 90, ...over } as Instrument);

describe('PR-3b decideScanAccept — çift-ekleme önleme', () => {
  it('instruments.length > 1 → instruments mode (seçili); debtInfo ÇAĞRILMAZ', () => {
    const all = [inst({ documentNo: 'A' }), inst({ documentNo: 'B' })];
    const selected = [all[0]];
    const d = decideScanAccept(all, selected);
    expect(d.mode).toBe('instruments');
    if (d.mode === 'instruments') expect(d.instruments).toBe(selected);
  });

  it('instruments.length <= 1 → debtInfo mode (eski tek-kalem yol)', () => {
    expect(decideScanAccept([inst({})], []).mode).toBe('debtInfo');
    expect(decideScanAccept(undefined, []).mode).toBe('debtInfo');
    expect(decideScanAccept([], []).mode).toBe('debtInfo');
  });
});

describe('PR-3b buton etiketi / disabled / kapı', () => {
  it('tablo görünürken buton "Seçili evrakları ekle"; aksi "Tümünü Ekle"', () => {
    expect(acceptButtonLabel(true)).toBe('Seçili evrakları ekle');
    expect(acceptButtonLabel(false)).toBe('Tümünü Ekle');
  });

  it('tablo görünür + 0 seçim → disabled', () => {
    expect(isAcceptDisabled(true, 0)).toBe(true);
    expect(isAcceptDisabled(true, 2)).toBe(false);
    expect(isAcceptDisabled(false, 0)).toBe(false); // tablo yok → eski buton hep aktif
  });

  it('shouldShowInstrumentTable: yalnız >1 true (veri-bazlı kapı)', () => {
    expect(shouldShowInstrumentTable([inst({}), inst({})])).toBe(true);
    expect(shouldShowInstrumentTable([inst({})])).toBe(false);
    expect(shouldShowInstrumentTable(undefined)).toBe(false);
  });
});
