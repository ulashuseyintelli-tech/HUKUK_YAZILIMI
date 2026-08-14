import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ExecutionOfficesPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4s — İCRA DAİRELERİ (ADMIN): OKUMA HATASI "BULUNAMADI" DEĞİLDİR.
 *
 * `loadOffices`'in catch dalı yalnız `console.error` ile hatayı yutuyordu.
 * `offices` başlangıç değeri (`[]`) olduğu için bu, doğrudan "İcra dairesi
 * bulunamadı" render'i ile AYNI ekrana düşüyordu.
 *
 * Sayfadaki mevcut `message` state'i (mutasyon geri bildirimi, 3sn'de
 * kendiliğinden kaybolur) bu amaç için KULLANILMADI — okuma hatası KALICI
 * bir görünürlük ve yeniden-deneme gerektirir; ayrı `officesLoadError`
 * state'i eklendi.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

const OFFICE = { id: 'o1', name: 'Ankara 5. İcra Dairesi', city: 'Ankara', isActive: true };
const LIST_OK = { data: { data: [OFFICE] } };
const LIST_EMPTY = { data: { data: [] } };

const networkError = () => Promise.reject(new Error('network down'));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('İcra daireleri — loadOffices okuma hatası', () => {
  it('AG HATASI: "İcra dairesi bulunamadı" YAZILMAZ, gorunur hata + retry cikar', async () => {
    mocked.get.mockImplementation(networkError);
    render(<ExecutionOfficesPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('İcra dairesi bulunamadı')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "İcra dairesi bulunamadı" DOGRU', async () => {
    mocked.get.mockResolvedValue(LIST_EMPTY);
    render(<ExecutionOfficesPage />);

    expect(await screen.findByText('İcra dairesi bulunamadı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry -> SUCCESS_DATA: gercek kayit gorunur, hata kalkar', async () => {
    let attempt = 0;
    mocked.get.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('network down')) : Promise.resolve(LIST_OK);
    });
    render(<ExecutionOfficesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('Ankara 5. İcra Dairesi')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('basarili yukleme: gercek kayit gorunur, hata YOK', async () => {
    mocked.get.mockResolvedValue(LIST_OK);
    render(<ExecutionOfficesPage />);

    expect(await screen.findByText('Ankara 5. İcra Dairesi')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
