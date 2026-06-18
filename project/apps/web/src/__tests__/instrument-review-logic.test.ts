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
  buildInitialReviewRows,
  isInstrumentComplete,
  hasIncompleteSelected,
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

describe('PR-N1 buildInitialReviewRows — needsReview default-unselected', () => {
  it('needsReview=true → satır default SEÇİLİ DEĞİL', () => {
    expect(buildInitialReviewRows([inst({ needsReview: true })])[0].selected).toBe(false);
  });

  it('needsReview=false/undefined → satır default seçili', () => {
    expect(buildInitialReviewRows([inst({ needsReview: false })])[0].selected).toBe(true);
    expect(buildInitialReviewRows([inst({})])[0].selected).toBe(true);
  });

  it('karışık liste: yalnız needsReview olanlar seçilmez, sıra korunur', () => {
    const rows = buildInitialReviewRows([
      inst({ documentNo: 'A' }),
      inst({ documentNo: 'B', needsReview: true }),
      inst({ documentNo: 'C' }),
    ]);
    expect(rows.map((r) => r.selected)).toEqual([true, false, true]);
    expect(rows.map((r) => r.instrument.documentNo)).toEqual(['A', 'B', 'C']);
  });

  it('enstrümanın KOPYASINI taşır (orijinali mutasyona uğratmaz)', () => {
    const src = inst({ documentNo: 'X' });
    const rows = buildInitialReviewRows([src]);
    expect(rows[0].instrument).not.toBe(src);
    rows[0].instrument.amount = 999;
    expect(src.amount).toBeUndefined();
  });
});

describe('PR-N4a isInstrumentComplete — CaseInstrument zorunlu alanları', () => {
  const full = () => inst({ documentNo: 'CK-1', amount: 1000, issueDate: '2026-01-10' });

  it('tam (no+tutar>0+currency+keşide) → true', () => {
    expect(isInstrumentComplete(full())).toBe(true);
  });

  it('documentNo eksik/boş/boşluk → false', () => {
    expect(isInstrumentComplete(inst({ amount: 1000, issueDate: '2026-01-10' }))).toBe(false);
    expect(isInstrumentComplete({ ...full(), documentNo: '' })).toBe(false);
    expect(isInstrumentComplete({ ...full(), documentNo: '   ' })).toBe(false);
  });

  it('issueDate eksik → false', () => {
    expect(isInstrumentComplete({ ...full(), issueDate: undefined })).toBe(false);
  });

  it('amount eksik/0/negatif → false', () => {
    expect(isInstrumentComplete({ ...full(), amount: undefined })).toBe(false);
    expect(isInstrumentComplete({ ...full(), amount: 0 })).toBe(false);
    expect(isInstrumentComplete({ ...full(), amount: -5 })).toBe(false);
  });

  it('currency eksik → false', () => {
    expect(isInstrumentComplete({ ...full(), currency: undefined as any })).toBe(false);
  });
});

describe('PR-N4a hasIncompleteSelected + accept gating', () => {
  const full = () => inst({ documentNo: 'CK-1', amount: 1000, issueDate: '2026-01-10' });

  it('hepsi tam → false; biri eksik → true; boş → false', () => {
    expect(hasIncompleteSelected([full(), full()])).toBe(false);
    expect(hasIncompleteSelected([full(), inst({ amount: 1000 })])).toBe(true);
    expect(hasIncompleteSelected([])).toBe(false);
  });

  it('accept gating: tablo+seçili+tam → ENABLED; seçili+eksik VEYA seçim yok → DISABLED', () => {
    const ok = [full(), full()];
    expect(isAcceptDisabled(true, ok.length) || hasIncompleteSelected(ok)).toBe(false); // enabled
    const bad = [full(), inst({ amount: 1000 })];
    expect(isAcceptDisabled(true, bad.length) || hasIncompleteSelected(bad)).toBe(true); // disabled (eksik)
    expect(isAcceptDisabled(true, 0) || hasIncompleteSelected([])).toBe(true); // disabled (seçim yok)
  });
});
