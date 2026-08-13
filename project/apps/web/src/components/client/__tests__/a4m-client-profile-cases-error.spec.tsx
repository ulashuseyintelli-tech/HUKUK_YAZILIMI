import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ClientProfile } from '../client-profile';
import { api } from '@/lib/api';

/**
 * WSMR-A4m — DOSYALAR SEKMESİ: OKUMA HATASI "BAĞLI DOSYA BULUNAMADI" DEĞİLDİR.
 *
 * `api.getCases({ clientId })` başarısız olunca eski hâlde `setCases([])`
 * çağrılıyor, bu da "Bağlı dosya bulunamadı" render'ını tetikliyordu ve genel
 * bakış kartında "Dosya: 0" gösteriliyordu — müvekkilin dosyaları OLDUĞU
 * hâlde okunamadığında hiç yokmuş gibi görünüyordu.
 *
 * Erişilebilirlik: `app/(dashboard)/clients/[clientId]/page.tsx:59` →
 * `<ClientProfile clientId={clientId} />` (route sayfasından doğrudan render).
 */

vi.mock('@/lib/api', () => ({
  api: {
    getClient: vi.fn(),
    getCases: vi.fn(),
    getClientOperatingSnapshot: vi.fn(),
    getClientActionCatalog: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/clients/c1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

const mocked = api as unknown as {
  getClient: ReturnType<typeof vi.fn>;
  getCases: ReturnType<typeof vi.fn>;
  getClientOperatingSnapshot: ReturnType<typeof vi.fn>;
  getClientActionCatalog: ReturnType<typeof vi.fn>;
};

const CLIENT = {
  data: {
    id: 'c1',
    type: 'PERSON',
    displayName: 'Ayşe Yılmaz',
    powerOfAttorneys: [],
    addresses: [],
    contacts: [],
  },
};

const CASES = { data: [{ id: 'case-1', fileNumber: '2026/1', caseStatus: 'ACTIVE' }] };

const SNAPSHOT = {
  data: {
    clientId: 'c1',
    health: 'healthy',
    riskLevel: 'low',
    contact: { status: 'complete', missingFields: [], followUpStatus: null, openTaskCount: 0, overdueTaskCount: 0, nextFollowUpAt: null, escalationLevel: null },
    poa: { status: 'active', activeCount: 1, nearestValidUntil: null },
    intake: { status: 'none', latestSubmission: null, latestLink: null },
    notification: { status: 'none', latest: null },
    signals: [],
  },
};
const ACTION_CATALOG = { data: [] as unknown[] };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getClientOperatingSnapshot.mockResolvedValue(SNAPSHOT);
  mocked.getClientActionCatalog.mockResolvedValue(ACTION_CATALOG);
});
afterEach(() => cleanup());

const clickCasesTab = async () => fireEvent.click(await screen.findByRole('tab', { name: /Dosyalar/ }));

describe('ClientProfile — dosyalar sekmesi okuma hatası', () => {
  it('HATASI: "bağlı dosya bulunamadı" YAZILMAZ, gorunur hata cikar', async () => {
    mocked.getClient.mockResolvedValue(CLIENT);
    mocked.getCases.mockRejectedValue(new Error('network down'));
    render(<ClientProfile clientId="c1" />);
    await clickCasesTab();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Bağlı dosya bulunamadı')).toBeNull();
  });

  it('genel bakis karti sahte "0" GOSTERMEZ', async () => {
    mocked.getClient.mockResolvedValue(CLIENT);
    mocked.getCases.mockRejectedValue(new Error('network down'));
    render(<ClientProfile clientId="c1" />);

    // "Dosya" etiketli kart hata durumunda "0" DEGIL "—" gosterir.
    const label = await screen.findByText('Dosya');
    const card = label.closest('div')!.parentElement as HTMLElement;
    await vi.waitFor(() => expect(card.textContent).toContain('—'));
    expect(card.textContent).not.toMatch(/\b0\b/);
  });

  it('bozuk govde (dizi degil) BASARI sayilmaz', async () => {
    mocked.getClient.mockResolvedValue(CLIENT);
    mocked.getCases.mockResolvedValue({ data: { unexpected: true } });
    render(<ClientProfile clientId="c1" />);
    await clickCasesTab();

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('GERCEKTEN bos: hata YOK, "bağlı dosya bulunamadı" DOGRU', async () => {
    mocked.getClient.mockResolvedValue(CLIENT);
    mocked.getCases.mockResolvedValue({ data: [] });
    render(<ClientProfile clientId="c1" />);
    await clickCasesTab();

    expect(await screen.findByText('Bağlı dosya bulunamadı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry: yalniz dosya okumasi tekrarlanir, muvekkil yeniden cekilmez', async () => {
    let attempt = 0;
    mocked.getClient.mockResolvedValue(CLIENT);
    mocked.getCases.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('geçici')) : Promise.resolve(CASES);
    });
    render(<ClientProfile clientId="c1" />);
    await clickCasesTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(attempt).toBe(2);
    expect(mocked.getClient).toHaveBeenCalledTimes(1);
  });

  it('basarili okuma: dosya gorunur, hata YOK', async () => {
    mocked.getClient.mockResolvedValue(CLIENT);
    mocked.getCases.mockResolvedValue(CASES);
    render(<ClientProfile clientId="c1" />);
    await clickCasesTab();

    expect(await screen.findByText('2026/1')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
