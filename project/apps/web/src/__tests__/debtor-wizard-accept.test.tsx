/**
 * BUG-2b — bulk accept tüm borçluları korur (stale-closure regresyon testi).
 *
 * Eski kod handleAcceptParty'de `onDebtorsChange([...selectedDebtors, x])` kullanıyordu;
 * handleAcceptAllDebtors döngüsünde her tur AYNI (bayat) selectedDebtors closure'ını okuyup
 * yalnız SONUNCU borçluyu bırakıyordu. Functional update (prev=>[...prev,x]) → hepsi korunur.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...a: any[]) => apiGet(...a), post: (...a: any[]) => apiPost(...a) },
}));

import { DebtorStep } from '../components/debtor/DebtorStep';
import type { CaseDebtor } from '../types/debtor';

function Harness() {
  const [debtors, setDebtors] = useState<CaseDebtor[]>([]);
  return (
    <div>
      <div data-testid="count">{debtors.length}</div>
      <DebtorStep selectedDebtors={debtors} onDebtorsChange={setDebtors} />
    </div>
  );
}

const SCAN_RESULT = {
  documentType: 'CEK',
  confidence: 90,
  suggestedCaseType: 'KAMBIYO',
  parties: [
    { name: 'Şükrü Akdoğan', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 },
    { name: 'Mehmet Demir', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 88 },
  ],
  debtInfo: { currency: 'TRY' },
  instruments: [],
};

describe('BUG-2b DebtorStep bulk accept', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockResolvedValue({ data: { data: [] } }); // loadDebtors → boş rehber
    let n = 0;
    apiPost.mockImplementation(() => {
      n += 1;
      return Promise.resolve({ data: { data: { id: `d${n}`, type: 'INDIVIDUAL' } } });
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: SCAN_RESULT }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('2 borçlu parti → "Tümünü Ekle" → ikisi de listede (count=2)', async () => {
    const { container } = render(<Harness />);

    // Sihirbazı aç
    fireEvent.click(screen.getByText('Evrak Tara'));

    // Dosya seç
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'cek.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Tara → fetch (mock) → wizardResult
    fireEvent.click(await screen.findByText('Tara'));

    // Sonuç paneli render olunca tümünü ekle
    fireEvent.click(await screen.findByText('Tümünü Ekle'));

    // KRİTİK: ikisi de korunmalı (eski stale-closure 1 bırakırdı)
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(apiPost).toHaveBeenCalledTimes(2);
  });

  it('TEK KELİME isim → "Ekle" POST ETMEZ + hata GÖRÜNÜR + listeye eklenmez', async () => {
    const single = {
      ...SCAN_RESULT,
      parties: [{ name: 'Şükrü', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: single }) }),
    );

    const { container } = render(<Harness />);
    fireEvent.click(screen.getByText('Evrak Tara'));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'cek.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(await screen.findByText('Tara'));

    // Per-party "Ekle" (Tümünü Ekle DEĞİL — o wizard'ı kapatıp hatayı gizlerdi)
    fireEvent.click(await screen.findByText('Ekle', { exact: true }));

    // Hata sonuç panelinde GÖRÜNMELİ · POST yapılmamalı · liste boş kalmalı
    expect(await screen.findByText(/ad ve soyad ayrıştırılamadı/)).toBeTruthy();
    expect(apiPost).not.toHaveBeenCalled();
    expect(screen.getByTestId('count').textContent).toBe('0');
  });
});
