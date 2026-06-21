/**
 * PR-3b — InstrumentReviewTable (RTL): render, seçim toggle, düzenleme, needsReview, evidence.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstrumentReviewTable } from '../components/debtor/InstrumentReviewTable';
import { ReviewRow, Instrument } from '../components/debtor/ocr-instrument';

const makeRows = (): ReviewRow[] => [
  {
    selected: true,
    instrument: {
      type: 'CEK',
      currency: 'TRY',
      documentNo: '0265895',
      amount: 400000,
      dueDate: '2025-11-25',
      drawerName: 'GORKA A.Ş.',
      confidence: 90,
      sourcePages: [1, 2],
      pageRange: [1, 2],
    },
  },
  {
    selected: true,
    instrument: {
      type: 'CEK',
      currency: 'TRY',
      documentNo: '0265896',
      amount: 425000,
      dueDate: '2025-12-15',
      confidence: 60,
      groupConfidence: 0.5,
      needsReview: true,
      duplicateCandidateReason: 'sayfa 4: yalnız tutar — kontrol edin',
      evidenceText: 'Çek No 0265896 Tutar 425.000',
      sourcePages: [3, 4],
      pageRange: [3, 4],
    },
  },
];

describe('PR-3b InstrumentReviewTable', () => {
  it('N satır + N checkbox render eder', () => {
    render(<InstrumentReviewTable rows={makeRows()} onChange={() => {}} />);
    expect(screen.getByTestId('instrument-row-0')).toBeTruthy();
    expect(screen.getByTestId('instrument-row-1')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByDisplayValue('0265895')).toBeTruthy(); // N4a: No artık input (display value)
  });

  it('checkbox toggle → onChange (selected flip)', () => {
    const onChange = vi.fn();
    render(<InstrumentReviewTable rows={makeRows()} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Satır 1 seç'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].selected).toBe(false);
  });

  it('tutar düzenle → onChange (amount güncellenir)', () => {
    const onChange = vi.fn();
    render(<InstrumentReviewTable rows={makeRows()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Satır 1 tutar'), { target: { value: '999' } });
    expect(onChange.mock.calls[0][0][0].instrument.amount).toBe(999);
  });

  it('BUG-X: senet satırı Vade input KORUR + düzenlenir (çek-dışı davranış değişmez)', () => {
    const onChange = vi.fn();
    const rows: ReviewRow[] = [
      {
        selected: true,
        instrument: { type: 'SENET', currency: 'TRY', documentNo: 'SN-1', amount: 1000, issueDate: '2026-01-10', dueDate: '2026-03-01', confidence: 90 },
      },
    ];
    render(<InstrumentReviewTable rows={rows} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Satır 1 vade'), { target: { value: '2026-04-01' } });
    expect(onChange.mock.calls[0][0][0].instrument.dueDate).toBe('2026-04-01');
  });

  it('needsReview satır → reason + evidenceText görünür', () => {
    render(<InstrumentReviewTable rows={makeRows()} onChange={() => {}} />);
    expect(screen.getByText(/sayfa 4: yalnız tutar/)).toBeTruthy();
    expect(screen.getByText(/Kanıt: Çek No 0265896/)).toBeTruthy();
  });

  it('sayfa aralığı gösterilir', () => {
    render(<InstrumentReviewTable rows={makeRows()} onChange={() => {}} />);
    expect(screen.getAllByText('Sayfa 1-2').length).toBeGreaterThan(0);
  });

  it('N4a: belge no düzenle → onChange (documentNo güncellenir)', () => {
    const onChange = vi.fn();
    render(<InstrumentReviewTable rows={makeRows()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Satır 1 belge no'), { target: { value: 'YENI-1' } });
    expect(onChange.mock.calls[0][0][0].instrument.documentNo).toBe('YENI-1');
  });

  it('N4a: keşide (issueDate) düzenle → onChange (issueDate güncellenir)', () => {
    const onChange = vi.fn();
    render(<InstrumentReviewTable rows={makeRows()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Satır 1 keşide'), { target: { value: '2026-01-10' } });
    expect(onChange.mock.calls[0][0][0].instrument.issueDate).toBe('2026-01-10');
  });

  it('BUG-X: çek keşide YOK (issueDate + dueDate ikisi de boş) → incomplete uyarısı', () => {
    // makeRows artık dueDate fallback ile TAM sayılır; gerçek eksiklik = iki tarih de boş.
    const rows: ReviewRow[] = [
      { selected: true, instrument: { type: 'CEK', currency: 'TRY', documentNo: 'CK-1', amount: 1000, confidence: 90 } },
    ];
    render(<InstrumentReviewTable rows={rows} onChange={() => {}} />);
    expect(screen.getByTestId('instrument-incomplete-0')).toBeTruthy();
  });

  it('N4a: tam enstrüman → incomplete uyarısı YOK', () => {
    const complete: ReviewRow[] = [
      {
        selected: true,
        instrument: { type: 'CEK', currency: 'TRY', documentNo: 'CK-1', amount: 1000, issueDate: '2026-01-10', confidence: 90 },
      },
    ];
    render(<InstrumentReviewTable rows={complete} onChange={() => {}} />);
    expect(screen.queryByTestId('instrument-incomplete-0')).toBeNull();
  });
});

describe('BUG-X — çek tarih/vade modeli (render)', () => {
  const cek = (over: Partial<Instrument> = {}): ReviewRow => ({
    selected: true,
    instrument: { type: 'CEK', currency: 'TRY', documentNo: 'CK-1', amount: 1000, confidence: 90, ...over },
  });
  const senet = (over: Partial<Instrument> = {}): ReviewRow => ({
    selected: true,
    instrument: {
      type: 'SENET', currency: 'TRY', documentNo: 'SN-1', amount: 2000,
      issueDate: '2026-01-10', dueDate: '2026-03-01', confidence: 90, ...over,
    },
  });

  it('tüm satırlar çek → "Vade" kolonu ve vade input GÖSTERİLMEZ', () => {
    render(
      <InstrumentReviewTable
        rows={[cek({ issueDate: '2025-07-07' }), cek({ documentNo: 'CK-2', issueDate: '2025-08-08' })]}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText('Vade')).toBeNull();
    expect(screen.queryByLabelText('Satır 1 vade')).toBeNull();
  });

  it('çek dueDate-only → keşide alanı dueDate fallback gösterir + incomplete YOK', () => {
    render(<InstrumentReviewTable rows={[cek({ dueDate: '2025-11-25' })]} onChange={() => {}} />);
    expect((screen.getByLabelText('Satır 1 keşide') as HTMLInputElement).value).toBe('2025-11-25');
    expect(screen.queryByTestId('instrument-incomplete-0')).toBeNull();
  });

  it('çek iki tarih (issueDate≠dueDate) → keşide uyarısı görünür; keşide=issueDate (swap yok)', () => {
    render(<InstrumentReviewTable rows={[cek({ issueDate: '2025-07-07', dueDate: '2025-12-30' })]} onChange={() => {}} />);
    expect(screen.getByTestId('cek-date-warn-0')).toBeTruthy();
    expect((screen.getByLabelText('Satır 1 keşide') as HTMLInputElement).value).toBe('2025-07-07');
  });

  it('karışık (çek + senet) → "Vade" kolonu VAR; çek satırı vade input YOK, senet satırı vade input VAR', () => {
    render(<InstrumentReviewTable rows={[cek({ issueDate: '2025-07-07' }), senet()]} onChange={() => {}} />);
    expect(screen.getByText('Vade')).toBeTruthy();
    expect(screen.queryByLabelText('Satır 1 vade')).toBeNull(); // çek
    expect(screen.getByLabelText('Satır 2 vade')).toBeTruthy(); // senet
  });

  // ── HOTFIX: iki-tarih uyarısı aksiyone edilebilir (ikinci tarih gizlenmez) ──
  it('HOTFIX: çek iki tarih → uyarıda ikinci tarih (TR) açıkça GÖRÜNÜR + "keşide yap" butonu', () => {
    render(<InstrumentReviewTable rows={[cek({ issueDate: '2025-07-07', dueDate: '2025-12-30' })]} onChange={() => {}} />);
    expect(screen.getByTestId('cek-date-warn-detail-0').textContent).toContain('30.12.2025'); // GİZLENMEZ
    expect(screen.getByTestId('cek-date-apply-0').textContent).toContain('30.12.2025 keşide yap');
  });

  it('HOTFIX: "keşide yap" tık → issueDate=dueDate (otomatik DEĞİL); dueDate KORUNUR', () => {
    const onChange = vi.fn();
    render(<InstrumentReviewTable rows={[cek({ issueDate: '2025-07-07', dueDate: '2025-12-30' })]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('cek-date-apply-0'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0][0].instrument;
    expect(updated.issueDate).toBe('2025-12-30');
    expect(updated.dueDate).toBe('2025-12-30'); // silinmez (backend presentmentDate)
  });

  it('HOTFIX: issueDate === dueDate → uyarı detayı + ikon GÖSTERİLMEZ', () => {
    render(<InstrumentReviewTable rows={[cek({ issueDate: '2025-12-30', dueDate: '2025-12-30' })]} onChange={() => {}} />);
    expect(screen.queryByTestId('cek-date-warn-detail-0')).toBeNull();
    expect(screen.queryByTestId('cek-date-warn-0')).toBeNull();
  });
});

describe('C-PR — Lehtar (payee) kolonu', () => {
  const row = (over: Partial<Instrument> = {}): ReviewRow => ({
    selected: true,
    instrument: { type: 'CEK', currency: 'TRY', documentNo: 'CK-1', amount: 1000, issueDate: '2025-12-30', confidence: 90, ...over },
  });

  it('"Lehtar" kolonu + düzenlenebilir input render eder', () => {
    render(<InstrumentReviewTable rows={[row()]} onChange={() => {}} />);
    expect(screen.getByText('Lehtar')).toBeTruthy();
    expect(screen.getByLabelText('Satır 1 lehtar')).toBeTruthy();
  });

  it('payeeName VARSA input değeri gösterir', () => {
    render(<InstrumentReviewTable rows={[row({ payeeName: 'Müvekkil A.Ş.' })]} onChange={() => {}} />);
    expect((screen.getByLabelText('Satır 1 lehtar') as HTMLInputElement).value).toBe('Müvekkil A.Ş.');
  });

  it('Lehtar düzenle → onChange payeeName günceller (≠Client/Party, auto-match yok)', () => {
    const onChange = vi.fn();
    render(<InstrumentReviewTable rows={[row()]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Satır 1 lehtar'), { target: { value: 'Yeni Lehtar' } });
    expect(onChange.mock.calls[0][0][0].instrument.payeeName).toBe('Yeni Lehtar');
  });
});
