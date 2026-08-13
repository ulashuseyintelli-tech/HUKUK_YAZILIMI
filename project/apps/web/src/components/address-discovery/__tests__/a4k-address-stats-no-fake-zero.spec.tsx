import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AddressResearchWidget } from '../AddressResearchWidget';
import { api } from '@/lib/api';

/**
 * WSMR-A4k — UYDURMA ADRES İSTATİSTİĞİ.
 *
 * Dört kaynağın her biri `.catch(() => [])` ile sessizce boş diziye düşüyordu ve
 * widget bu boş dizilerden SAYIM üretip ekrana kesin bir olgu gibi basıyordu:
 * **"0 adres"**. Adres okuması başarısızken borçlunun hiç adresi yokmuş gibi
 * görünüyordu — avukat adres araştırmasını tamamlanmış sanabilir ya da gereksiz
 * yere yeni UYAP sorgusu açabilirdi.
 *
 * Erişilebilirlik (kanıt): `cases/[id]/page.tsx:4172` → `<DebtorDetailDrawer>` →
 * `DebtorDetailDrawer.tsx:618` → `<AddressResearchWidget>`. Self-reference DEĞİL;
 * zincir route sayfasına kadar takip edildi.
 */

vi.mock('@/lib/api', () => ({
  api: {
    getDebtorAddresses: vi.fn(),
    getUyapQueriesForDebtor: vi.fn(),
    getInstitutionLettersForDebtor: vi.fn(),
    getClientInfoRequestsForCase: vi.fn(),
    sendClientInfoRequest: vi.fn(),
  },
}));

vi.mock('../modals/ClientInfoRequestModal', () => ({ ClientInfoRequestModal: () => null }));
vi.mock('../modals/UyapQueryModal', () => ({ UyapQueryModal: () => null }));
vi.mock('../modals/UyapQueryResponseModal', () => ({ UyapQueryResponseModal: () => null }));
vi.mock('../modals/InstitutionLetterModal', () => ({ InstitutionLetterModal: () => null }));

const mocked = api as unknown as {
  getDebtorAddresses: ReturnType<typeof vi.fn>;
  getUyapQueriesForDebtor: ReturnType<typeof vi.fn>;
  getInstitutionLettersForDebtor: ReturnType<typeof vi.fn>;
  getClientInfoRequestsForCase: ReturnType<typeof vi.fn>;
};

const ADDRESSES = [
  { id: 'a1', source: 'UYAP_QUERY' },
  { id: 'a2', source: 'INSTITUTION_LETTER' },
];

const props = { caseId: 'case-1', caseDebtorId: 'cd-1', debtorId: 'dbt-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getDebtorAddresses.mockResolvedValue(ADDRESSES);
  mocked.getUyapQueriesForDebtor.mockResolvedValue([{ id: 'q1', status: 'PENDING' }]);
  mocked.getInstitutionLettersForDebtor.mockResolvedValue([]);
  mocked.getClientInfoRequestsForCase.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe('Adres istatistiği — birincil kaynak hatası', () => {
  it('adres okumasi HATA: "0 adres" YAZILMAZ, gorunur hata cikar', async () => {
    mocked.getDebtorAddresses.mockRejectedValue(new Error('network down'));
    render(<AddressResearchWidget {...props} />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('0 adres')).toBeNull();
  });

  it('hata mesaji "adres YOK" ANLAMINA GELMEDIGINI acikca soyler', async () => {
    mocked.getDebtorAddresses.mockRejectedValue(new Error('network down'));
    render(<AddressResearchWidget {...props} />);

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/OLMADIĞI anlamına gelmez/i);
  });

  it('bozuk govde (dizi degil) SAYIM URETMEZ', async () => {
    mocked.getDebtorAddresses.mockResolvedValue({ unexpected: true });
    render(<AddressResearchWidget {...props} />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('0 adres')).toBeNull();
  });

  it('retry: YALNIZ okuma tekrarlanir ve basarida sayim gelir', async () => {
    mocked.getDebtorAddresses
      .mockRejectedValueOnce(new Error('geçici'))
      .mockResolvedValue(ADDRESSES);
    render(<AddressResearchWidget {...props} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('2 adres')).toBeTruthy();
    expect(mocked.getDebtorAddresses).toHaveBeenCalledTimes(2);
  });

  it('GERCEKTEN bos: "0 adres" DOGRU ve hata bandi YOK', async () => {
    mocked.getDebtorAddresses.mockResolvedValue([]);
    render(<AddressResearchWidget {...props} />);

    expect(await screen.findByText('0 adres')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Adres istatistiği — ikincil kaynak hatası', () => {
  it('UYAP sorgulari okunamadi: adres sayimi KORUNUR, eksiklik ISIMLE bildirilir', async () => {
    mocked.getUyapQueriesForDebtor.mockRejectedValue(new Error('network down'));
    render(<AddressResearchWidget {...props} />);

    // Birincil kaynak saglam -> adres sayimi gecerli.
    expect(await screen.findByText('2 adres')).toBeTruthy();
    const band = screen.getByRole('alert');
    expect(band.textContent).toMatch(/UYAP sorguları/);
    expect(band.textContent).toMatch(/EKSİK olabilir/i);
  });

  it('birden cok ikincil kaynak hatasi TUMU bildirilir', async () => {
    mocked.getUyapQueriesForDebtor.mockRejectedValue(new Error('x'));
    mocked.getInstitutionLettersForDebtor.mockRejectedValue(new Error('y'));
    render(<AddressResearchWidget {...props} />);

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/UYAP sorguları/);
    expect(band.textContent).toMatch(/Müzekkereler/);
  });

  it('hepsi basarili: eksiklik bandi YOK', async () => {
    render(<AddressResearchWidget {...props} />);

    expect(await screen.findByText('2 adres')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
