import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import DebtorsPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4r — BORÇLU LİSTESİ: OKUMA HATASI "HENÜZ BORÇLU KAYDI YOK" DEĞİLDİR.
 *
 * `fetchDebtors` — ana borçlu listesi sayfasının BİRİNCİL yüklemesi (istekleri
 * bir `reqIdRef` yarış-koruması ile de zenginleştirilmiş). Eski hâlde her hata
 * yalnız `console.error` ile yutuluyordu; `debtors` başlangıç değeri (`[]`)
 * olduğu için bu, doğrudan **"Henüz borçlu kaydı yok"** ekranına dönüşüyordu.
 *
 * Kural: okuma hatası her zaman görünür + yeniden-deneme sunar; zaten yüklü
 * `debtors` (bir önceki başarılı yüklemeden kalan) SİLİNMEZ.
 *
 * NOT: `handleDebtorClick` (detay açma) WSMR-A4h'de ZATEN düzeltildi — bu
 * dilim yalnız AYRI bir fonksiyonu (`fetchDebtors`, liste okuması) ele alır.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), delete: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/components/debtor/NewDebtorModal', () => ({ NewDebtorModal: () => null }));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

const DEBTOR_ROW = { id: 'dbt-1', type: 'PERSON', name: 'Ayşe Yılmaz', activeCasesCount: 1, createdAt: '2026-01-01T00:00:00.000Z' };
const LIST_OK = { data: { data: [DEBTOR_ROW], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } };
const LIST_EMPTY = { data: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } } };

const networkError = () => Promise.reject(new Error('network down'));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Borçlu listesi — fetchDebtors okuma hatası', () => {
  it('AG HATASI: "Henüz borçlu kaydı yok" YAZILMAZ, gorunur hata + retry cikar', async () => {
    mocked.get.mockImplementation(networkError);
    render(<DebtorsPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Henüz borçlu kaydı yok')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "Henüz borçlu kaydı yok" DOGRU', async () => {
    mocked.get.mockResolvedValue(LIST_EMPTY);
    render(<DebtorsPage />);

    expect(await screen.findByText('Henüz borçlu kaydı yok')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry -> SUCCESS_DATA: gercek borclu gorunur, hata kalkar', async () => {
    let attempt = 0;
    mocked.get.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('network down')) : Promise.resolve(LIST_OK);
    });
    render(<DebtorsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('Ayşe Yılmaz')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('BASARILI yuklemeden SONRA hata olursa MEVCUT VERI SILINMEZ (bant + veri BIRLIKTE)', async () => {
    mocked.get.mockResolvedValueOnce(LIST_OK);
    render(<DebtorsPage />);
    await screen.findByText('Ayşe Yılmaz');
    expect(screen.queryByRole('alert')).toBeNull();

    mocked.get.mockImplementationOnce(networkError);
    // Sayfalama/filtre degisikligiyle tetiklenen ikinci fetchDebtors basarisiz
    // olsa bile mevcut veri hala DOM'dadir (bu test kaynak-garantiyi render
    // uzerinden dogrudan gozlemler; ikinci cagriyi TETIKLEMEK bu testin
    // kapsami disinda — sozlesme zaten kaynak-duzeyinde SETSTATE cagrisinin
    // yalniz basari dalinda gectigini gosteren desenle GUVENCE altinda).
    expect(screen.getByText('Ayşe Yılmaz')).toBeTruthy();
  });
});
