/**
 * BUG-4 — taranan ALACAKLI/lehtar ↔ müvekkil uyumsuzluk uyarısı.
 *
 * Pure: detectPayeeMismatch (ad nameMatchKey + identityNo güçlü-override; NON-BLOCKING).
 * Component: ALACAKLI≠müvekkil→uyarı · edit ile eşitle→uyarı kaybolur (BUG-3 entegrasyon) ·
 *            ALACAKLI==müvekkil→uyarı yok · yoksaylanan ALACAKLI→uyarı yok.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...a: any[]) => apiGet(...a), post: (...a: any[]) => apiPost(...a) },
}));

import { DebtorStep, detectPayeeMismatch } from '../components/debtor/DebtorStep';
import type { CaseDebtor } from '../types/debtor';

// ──────────────── PURE ────────────────
describe('BUG-4 detectPayeeMismatch', () => {
  it('ad eşleşirse → boş (uyarı yok)', () => {
    expect(detectPayeeMismatch([{ name: 'Şükrü Akdoğan' }], [{ name: 'Şükrü Akdoğan' }])).toEqual([]);
  });

  it('ad uyuşmazsa → eşleşmeyen adlar', () => {
    expect(
      detectPayeeMismatch([{ name: 'Süreyya Avcıoğlan' }], [{ name: 'Şükrü Akdoğan' }]),
    ).toEqual(['Süreyya Avcıoğlan']);
  });

  it('payee yok / creditor yok → boş', () => {
    expect(detectPayeeMismatch([], [{ name: 'X Y' }])).toEqual([]);
    expect(detectPayeeMismatch([{ name: 'X Y' }], [])).toEqual([]);
  });

  it('diakritik/büyük-küçük toleranslı (nameMatchKey)', () => {
    expect(detectPayeeMismatch([{ name: 'ŞÜKRÜ AKDOĞAN' }], [{ name: 'Şükrü Akdoğan' }])).toEqual([]);
  });

  it('identityNo GÜÇLÜ override: kimlik eşleşirse isim farkı önemsiz', () => {
    expect(
      detectPayeeMismatch(
        [{ name: 'Yanlış Okunan', identityNo: '12345678901' }],
        [{ name: 'Doğru Müvekkil', identityNo: '12345678901' }],
      ),
    ).toEqual([]);
  });

  it('boş isimli payee uyarı üretmez', () => {
    expect(detectPayeeMismatch([{ name: '   ' }], [{ name: 'Şükrü Akdoğan' }])).toEqual([]);
  });
});

// ──────────────── COMPONENT ────────────────
function Harness({ creditors }: { creditors: { name: string; identityNo?: string }[] }) {
  const [debtors, setDebtors] = useState<CaseDebtor[]>([]);
  return (
    <div>
      <div data-testid="count">{debtors.length}</div>
      <DebtorStep selectedDebtors={debtors} onDebtorsChange={setDebtors} creditors={creditors} />
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

describe('BUG-4 DebtorStep payee mismatch (component)', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockResolvedValue({ data: { data: [] } });
    apiPost.mockResolvedValue({ data: { data: { id: 'd1', type: 'INDIVIDUAL' } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  const ALACAKLI = (name: string) => ({ name, type: 'INDIVIDUAL', role: 'ALACAKLI', confidence: 90 });

  it('ALACAKLI ≠ müvekkil → uyarı görünür', async () => {
    const { container } = render(<Harness creditors={[{ name: 'Şükrü Akdoğan' }]} />);
    await openAndScan(container, [ALACAKLI('Süreyya Avcıoğlan')]);
    expect(screen.getByTestId('payee-mismatch')).toBeTruthy();
  });

  it('ALACAKLI adı müvekkile eşitlenince uyarı KAYBOLUR (BUG-3 edit entegrasyon)', async () => {
    const { container } = render(<Harness creditors={[{ name: 'Şükrü Akdoğan' }]} />);
    await openAndScan(container, [ALACAKLI('Süreyya Avcıoğlan')]);
    expect(screen.getByTestId('payee-mismatch')).toBeTruthy();
    fireEvent.change(screen.getByTestId('party-name-0'), { target: { value: 'Şükrü Akdoğan' } });
    await waitFor(() => expect(screen.queryByTestId('payee-mismatch')).toBeNull());
  });

  it('ALACAKLI == müvekkil → uyarı yok', async () => {
    const { container } = render(<Harness creditors={[{ name: 'Şükrü Akdoğan' }]} />);
    await openAndScan(container, [ALACAKLI('Şükrü Akdoğan')]);
    expect(screen.queryByTestId('payee-mismatch')).toBeNull();
  });

  it('yoksaylanan ALACAKLI → uyarı yok', async () => {
    const { container } = render(<Harness creditors={[{ name: 'Şükrü Akdoğan' }]} />);
    await openAndScan(container, [ALACAKLI('Süreyya Avcıoğlan')]);
    expect(screen.getByTestId('payee-mismatch')).toBeTruthy();
    fireEvent.click(screen.getByText('Yoksay'));
    await waitFor(() => expect(screen.queryByTestId('payee-mismatch')).toBeNull());
  });
});
