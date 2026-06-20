/**
 * BUG-3 — Party review (edit / rol değiştir / yoksay) testleri.
 *
 * Pure: buildInitialPartyRows · isDebtorRole · selectablePartyRows.
 * Component: edit→payload · ALACAKLI→BORCLU Ekle çıkar · yoksay bulk dışı · ALACAKLI bulk dışı ·
 *            bulk hata→wizard açık+görünür · yeni scan→partyRows yeniden kurulur.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...a: any[]) => apiGet(...a), post: (...a: any[]) => apiPost(...a) },
}));

import {
  DebtorStep,
  buildInitialPartyRows,
  isDebtorRole,
  selectablePartyRows,
} from '../components/debtor/DebtorStep';
import type { CaseDebtor } from '../types/debtor';

// ──────────────── PURE ────────────────
describe('BUG-3 pure helpers', () => {
  it('isDebtorRole: ALACAKLI hariç hepsi true', () => {
    for (const r of ['BORCLU', 'KEFIL', 'CIRANTA', 'AVAL', 'MUTESELSIL']) {
      expect(isDebtorRole(r)).toBe(true);
    }
    expect(isDebtorRole('ALACAKLI')).toBe(false);
  });

  it('buildInitialPartyRows: draft kopya + ignored/added=false', () => {
    const rows = buildInitialPartyRows([
      { name: 'A B', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 },
    ] as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].ignored).toBe(false);
    expect(rows[0].added).toBe(false);
    expect(rows[0].draft.name).toBe('A B');
  });

  it('buildInitialPartyRows: boş/undefined → []', () => {
    expect(buildInitialPartyRows(undefined as any)).toEqual([]);
    expect(buildInitialPartyRows([])).toEqual([]);
  });

  it('selectablePartyRows: ignored/added/ALACAKLI hariç', () => {
    const rows = [
      { draft: { role: 'BORCLU' }, ignored: false, added: false },
      { draft: { role: 'ALACAKLI' }, ignored: false, added: false },
      { draft: { role: 'BORCLU' }, ignored: true, added: false },
      { draft: { role: 'KEFIL' }, ignored: false, added: true },
    ] as any;
    const sel = selectablePartyRows(rows);
    expect(sel).toHaveLength(1);
    expect(sel[0].draft.role).toBe('BORCLU');
  });
});

// ──────────────── COMPONENT ────────────────
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

function stubScan(parties: any[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: scanResult(parties) }) }),
  );
}

async function openAndScan(container: HTMLElement, parties: any[]) {
  stubScan(parties);
  fireEvent.click(screen.getByText('Evrak Tara'));
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, {
    target: { files: [new File(['x'], 'cek.pdf', { type: 'application/pdf' })] },
  });
  fireEvent.click(await screen.findByText('Tara'));
  await screen.findByTestId('party-name-0');
}

describe('BUG-3 DebtorStep party review (component)', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockResolvedValue({ data: { data: [] } });
    let n = 0;
    apiPost.mockImplementation(() => {
      n += 1;
      return Promise.resolve({ data: { data: { id: `d${n}`, type: 'INDIVIDUAL' } } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('edit sonrası Ekle düzeltilmiş payload gönderir', async () => {
    const { container } = render(<Harness />);
    await openAndScan(container, [
      { name: 'Süreyya Avcıoğlan', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 },
    ]);
    fireEvent.change(screen.getByTestId('party-name-0'), { target: { value: 'Şükrü Akdoğan' } });
    fireEvent.click(screen.getByTestId('party-accept-0'));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const payload = apiPost.mock.calls[0][1];
    expect(payload.firstName).toBe('Şükrü');
    expect(payload.lastName).toBe('Akdoğan');
    expect('name' in payload).toBe(false);
  });

  it('ALACAKLI iken Ekle yok; BORCLU yapınca Ekle çıkar', async () => {
    const { container } = render(<Harness />);
    await openAndScan(container, [
      { name: 'Ali Veli', type: 'INDIVIDUAL', role: 'ALACAKLI', confidence: 90 },
    ]);
    expect(screen.queryByTestId('party-accept-0')).toBeNull();
    fireEvent.change(screen.getByTestId('party-role-0'), { target: { value: 'BORCLU' } });
    expect(screen.getByTestId('party-accept-0')).toBeTruthy();
  });

  it('yoksaylanan parti Tümünü Ekle\'ye girmez', async () => {
    const { container } = render(<Harness />);
    await openAndScan(container, [
      { name: 'Bir Kisi', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 },
      { name: 'Iki Kisi', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 },
    ]);
    fireEvent.click(screen.getAllByText('Yoksay')[0]); // ilk partiyi yoksay
    fireEvent.click(screen.getByText('Tümünü Ekle'));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('ALACAKLI kalan parti bulk\'a girmez', async () => {
    const { container } = render(<Harness />);
    await openAndScan(container, [
      { name: 'Borclu Kisi', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 },
      { name: 'Alacakli Kisi', type: 'INDIVIDUAL', role: 'ALACAKLI', confidence: 90 },
    ]);
    fireEvent.click(screen.getByText('Tümünü Ekle'));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('bulk\'ta hata varsa wizard kapanmaz ve hata görünür', async () => {
    const { container } = render(<Harness />);
    await openAndScan(container, [
      { name: 'Şükrü', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 }, // tek-kelime → fail
      { name: 'Geçerli Kişi', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 },
    ]);
    fireEvent.click(screen.getByText('Tümünü Ekle'));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1)); // yalnız geçerli olan
    expect(await screen.findByText(/ad ve soyad ayrıştırılamadı/)).toBeTruthy();
    expect(screen.getByTestId('party-name-0')).toBeTruthy(); // wizard hâlâ açık
  });

  it('yeni scan gelince partyRows yeniden kurulur', async () => {
    const { container } = render(<Harness />);
    await openAndScan(container, [
      { name: 'İlk Parti', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 },
    ]);
    expect((screen.getByTestId('party-name-0') as HTMLInputElement).value).toBe('İlk Parti');

    fireEvent.click(screen.getByText('Yeni Tara')); // resetWizard
    stubScan([{ name: 'İkinci Parti', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 }]);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(['y'], 'cek2.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(await screen.findByText('Tara'));
    await waitFor(() =>
      expect((screen.getByTestId('party-name-0') as HTMLInputElement).value).toBe('İkinci Parti'),
    );
    expect(screen.queryByDisplayValue('İlk Parti')).toBeNull();
  });
});
