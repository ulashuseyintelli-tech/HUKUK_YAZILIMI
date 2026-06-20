/**
 * BUG-1B — party düşük-güven sinyali (amber ikon + %X, NON-BLOCKING). Eşik <70 (mevcut UI sınırı).
 *
 * Pure: isLowConfidence. Component: düşük→rozet görünür · ≥70→görünmez · yoksaylanan→görünmez.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...a: any[]) => apiGet(...a), post: (...a: any[]) => apiPost(...a) },
}));

import { DebtorStep, isLowConfidence } from '../components/debtor/DebtorStep';
import type { CaseDebtor } from '../types/debtor';

describe('BUG-1B isLowConfidence (eşik <70)', () => {
  it('69 → true, 70 → false', () => {
    expect(isLowConfidence(69)).toBe(true);
    expect(isLowConfidence(70)).toBe(false);
  });
  it('0 → true, 100 → false', () => {
    expect(isLowConfidence(0)).toBe(true);
    expect(isLowConfidence(100)).toBe(false);
  });
  it('undefined/null → false (bilinmeyen ≠ düşük)', () => {
    expect(isLowConfidence(undefined)).toBe(false);
    expect(isLowConfidence(null)).toBe(false);
  });
});

function Harness() {
  const [debtors, setDebtors] = useState<CaseDebtor[]>([]);
  return (
    <div>
      <div data-testid="count">{debtors.length}</div>
      <DebtorStep selectedDebtors={debtors} onDebtorsChange={setDebtors} />
    </div>
  );
}

const scanResult = (parties: any[]) => ({
  documentType: 'CEK',
  confidence: 90,
  suggestedCaseType: 'KAMBIYO',
  parties,
  debtInfo: { currency: 'TRY' },
  instruments: [],
});

async function openAndScan(container: HTMLElement, parties: any[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: scanResult(parties) }) }),
  );
  fireEvent.click(screen.getByText('Evrak Tara'));
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, {
    target: { files: [new File(['x'], 'cek.pdf', { type: 'application/pdf' })] },
  });
  fireEvent.click(await screen.findByText('Tara'));
  await screen.findByTestId('party-name-0');
}

const party = (confidence: number) => ({
  name: 'Şükrü Akdoğan',
  type: 'INDIVIDUAL',
  role: 'BORCLU',
  confidence,
});

describe('BUG-1B DebtorStep düşük-güven rozeti (component)', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockResolvedValue({ data: { data: [] } });
    apiPost.mockResolvedValue({ data: { data: { id: 'd1', type: 'INDIVIDUAL' } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('confidence 43 (<70) → rozet görünür', async () => {
    const { container } = render(<Harness />);
    await openAndScan(container, [party(43)]);
    const badge = screen.getByTestId('party-low-confidence-0');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('43');
  });

  it('confidence 90 (≥70) → rozet YOK', async () => {
    const { container } = render(<Harness />);
    await openAndScan(container, [party(90)]);
    expect(screen.queryByTestId('party-low-confidence-0')).toBeNull();
  });

  it('düşük-güven + yoksay → rozet KAYBOLUR', async () => {
    const { container } = render(<Harness />);
    await openAndScan(container, [party(43)]);
    expect(screen.getByTestId('party-low-confidence-0')).toBeTruthy();
    fireEvent.click(screen.getByText('Yoksay'));
    await waitFor(() => expect(screen.queryByTestId('party-low-confidence-0')).toBeNull());
  });
});
