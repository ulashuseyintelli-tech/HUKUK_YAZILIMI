import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BalanceWidget } from '../BalanceWidget';
import { api } from '@/lib/api';

/**
 * WSMR-A4f — OKUMA HATASI ≠ "BAKİYE 0".
 *
 * `BalanceWidget`, `getCaseBalance` hata verdiğinde uydurma bir bakiye kaydı
 * üretiyordu: `balance: 0`, `lowThreshold: 500`, `isLow: true`. Ekranda bu
 * "0 ₺ · Eşik: 500 ₺ · Bakiye düşük" olarak GERÇEK bir mali rakam gibi
 * görünüyor, üstelik "Masraf Talebi Oluştur" çağrısını da açıyordu.
 *
 * Kural: mali rakam yalnız DOĞRULANMIŞ yanıttan gelir. Okuma başarısızsa
 * rakam değil, görünür hata + salt-okuma tekrar denemesi gösterilir.
 */

vi.mock('@/lib/api', () => ({
  api: { getCaseBalance: vi.fn() },
}));

const mocked = api as unknown as { getCaseBalance: ReturnType<typeof vi.fn> };

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

const REAL_BALANCE = {
  id: 'b1',
  caseId: 'c1',
  balance: 1250,
  lowThreshold: 500,
  isLow: false,
  recentLedger: [],
};

describe('BalanceWidget — okuma hatası', () => {
  it('hata: UYDURMA rakam GÖSTERMEZ, görünür hata verir', async () => {
    mocked.getCaseBalance.mockRejectedValue(new Error('network down'));
    const onCreateExpenseRequest = vi.fn();
    render(<BalanceWidget caseId="c1" onCreateExpenseRequest={onCreateExpenseRequest} />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    // Sahte "0 ₺" ve uydurma "Eşik: 500 ₺" ekranda OLMAMALI.
    expect(screen.queryByText(/0 ₺/)).toBeNull();
    expect(screen.queryByText(/Eşik:/)).toBeNull();
    expect(screen.queryByText('Bakiye düşük')).toBeNull();
    // Sahte "dusuk bakiye" uzerinden masraf talebi cagrisi da acilmaz.
    expect(screen.queryByRole('button', { name: 'Masraf Talebi Oluştur' })).toBeNull();
    expect(onCreateExpenseRequest).not.toHaveBeenCalled();
  });

  it('bozuk gövde (balance sayı değil): rakam gibi işlenmez, hata verir', async () => {
    mocked.getCaseBalance.mockResolvedValue({ id: 'b1', caseId: 'c1' });
    render(<BalanceWidget caseId="c1" />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/₺/)).toBeNull();
  });

  it('başarılı okuma: gerçek rakam gösterilir, hata YOK', async () => {
    mocked.getCaseBalance.mockResolvedValue(REAL_BALANCE);
    render(<BalanceWidget caseId="c1" />);

    expect(await screen.findByText(/1\.250 ₺/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry: yalnız okuma tekrarlanır ve başarıda hata temizlenir', async () => {
    mocked.getCaseBalance
      .mockRejectedValueOnce(new Error('geçici'))
      .mockResolvedValue(REAL_BALANCE);
    render(<BalanceWidget caseId="c1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText(/1\.250 ₺/)).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mocked.getCaseBalance).toHaveBeenCalledTimes(2);
  });

  it('compact modda da hata durumunda sahte rakam basılmaz', async () => {
    mocked.getCaseBalance.mockRejectedValue(new Error('network down'));
    render(<BalanceWidget caseId="c1" compact />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/0 ₺/)).toBeNull();
  });
});
