/**
 * PR-3b — InstrumentReviewTable (RTL): render, seçim toggle, düzenleme, needsReview, evidence.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstrumentReviewTable } from '../components/debtor/InstrumentReviewTable';
import { ReviewRow } from '../components/debtor/ocr-instrument';

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
    expect(screen.getByText('0265895')).toBeTruthy();
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

  it('vade düzenle → onChange (dueDate güncellenir)', () => {
    const onChange = vi.fn();
    render(<InstrumentReviewTable rows={makeRows()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Satır 1 vade'), { target: { value: '2026-01-01' } });
    expect(onChange.mock.calls[0][0][0].instrument.dueDate).toBe('2026-01-01');
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
});
