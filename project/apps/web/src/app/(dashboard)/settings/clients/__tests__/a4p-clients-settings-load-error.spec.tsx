import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ClientsSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4p — MÜVEKKİL AYARLARI SAYFASI: OKUMA HATASI "KAYIT YOK" DEĞİLDİR.
 *
 * Bu dosyada AYNI kusur ailesinin dört BAĞIMSIZ örneği vardı — her biri kendi
 * `try/catch`'inde yalnız `console.error` ile yutuluyordu:
 *
 *  1. `loadClients` (ana liste)     → "Henüz müvekkil eklenmedi" ile KARIŞIYORDU.
 *  2. `ClientPoaModal#loadPoas`     → "Henüz vekalet kaydı yok" ile KARIŞIYORDU.
 *  3. `ClientPoaModal#loadLawyers`  → boş dönen avukat listesi "atanacak avukat
 *                                     yok" gibi görünüyordu (POA formu kilitli).
 *  4. `SendEmailModal#loadTemplates`→ boş dönen şablon menüsü "şablon yok" gibi
 *                                     görünüyordu (gönderimi ENGELLEMEZ, opsiyonel).
 *
 * Kural: her okuma hatası GÖRÜNÜR olur + yeniden-deneme sunar; zaten yüklü veri
 * SİLİNMEZ. `api.get("/clients/lifecycle-eligibility")` ve
 * `api.getAuthCapabilities` gibi BİLEREK fail-closed (yetki sinyali) desenler bu
 * dilimin kapsamı DIŞINDADIR — dokunulmadı.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

let searchParams = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/components/client/PoaScannerWizard', () => ({ PoaScannerWizard: () => null }));
vi.mock('@/components/bulk-email-modal', () => ({ BulkEmailModal: () => null }));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

const CLIENT = { id: 'cli-1', type: 'PERSON', name: 'Ayşe Yılmaz', firstName: 'Ayşe', lastName: 'Yılmaz' };
const POA = { id: 'poa-1', notaryName: 'Ankara 5. Noter', status: 'ACTIVE', dateIssued: '2026-01-01' };
const LAWYER = { id: 'law-1', name: 'Mehmet', surname: 'Kaya' };
const TEMPLATE = { id: 'tpl-1', name: 'Genel Bilgilendirme', subject: 'Konu', body: 'Metin' };

const networkError = () => Promise.reject(new Error('network down'));

type Routes = Partial<{
  clients: () => unknown;
  poas: () => unknown;
  lawyers: () => unknown;
  templates: () => unknown;
}>;

function routeApi(o: Routes = {}) {
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes('lifecycle-eligibility')) return Promise.resolve({ data: { data: { eligible: false } } });
    if (/^\/clients\/[^/?]+$/.test(u)) return Promise.resolve({ data: { data: CLIENT } });
    if (u.startsWith('/clients')) return Promise.resolve(o.clients?.() ?? { data: { data: [CLIENT] } });
    if (u.startsWith('/poa/client/')) return Promise.resolve(o.poas?.() ?? { data: [POA] });
    if (u.startsWith('/lawyers')) return Promise.resolve(o.lawyers?.() ?? { data: { data: [LAWYER] } });
    if (u.startsWith('/client-notifications/templates')) return Promise.resolve(o.templates?.() ?? { data: [TEMPLATE] });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams('');
});
afterEach(() => cleanup());

describe('Ana liste — loadClients okuma hatası', () => {
  it('AG HATASI: "Henüz müvekkil eklenmedi" YAZILMAZ, gorunur hata + retry cikar', async () => {
    routeApi({ clients: networkError });
    render(<ClientsSettingsPage />);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Müvekkiller yüklenemedi/.test(a.textContent || ''))).toBe(true);
    expect(screen.queryByText('Henüz müvekkil eklenmedi')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "Henüz müvekkil eklenmedi" DOGRU', async () => {
    routeApi({ clients: () => ({ data: { data: [] } }) });
    render(<ClientsSettingsPage />);

    expect(await screen.findByText('Henüz müvekkil eklenmedi')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry -> SUCCESS_DATA: gercek muvekkil gorunur, hata kalkar', async () => {
    let attempt = 0;
    routeApi({
      clients: () => {
        attempt += 1;
        return attempt === 1 ? Promise.reject(new Error('network down')) : { data: { data: [CLIENT] } };
      },
    });
    render(<ClientsSettingsPage />);

    const retryBtns = await screen.findAllByRole('button', { name: 'Tekrar dene' });
    fireEvent.click(retryBtns[0]);

    expect(await screen.findByText('Ayşe Yılmaz')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('ClientPoaModal — loadPoas okuma hatası', () => {
  const openPoaModal = async () => fireEvent.click((await screen.findAllByTitle('Vekaletler'))[0]);

  it('AG HATASI: "Henüz vekalet kaydı yok" YAZILMAZ, gorunur hata + retry cikar', async () => {
    routeApi({ poas: networkError });
    render(<ClientsSettingsPage />);
    await screen.findByText('Ayşe Yılmaz');
    await openPoaModal();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Vekaletler yüklenemedi/.test(a.textContent || ''))).toBe(true);
    expect(screen.queryByText('Henüz vekalet kaydı yok')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "Henüz vekalet kaydı yok" DOGRU', async () => {
    routeApi({ poas: () => ({ data: [] }) });
    render(<ClientsSettingsPage />);
    await screen.findByText('Ayşe Yılmaz');
    await openPoaModal();

    expect(await screen.findByText('Henüz vekalet kaydı yok')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('basarili yukleme: gercek vekalet kaydi gorunur, hata YOK', async () => {
    routeApi({});
    render(<ClientsSettingsPage />);
    await screen.findByText('Ayşe Yılmaz');
    await openPoaModal();

    expect(await screen.findByText('Ankara 5. Noter')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ClientPoaModal — loadLawyers okuma hatası', () => {
  const openPoaModal = async () => fireEvent.click((await screen.findAllByTitle('Vekaletler'))[0]);

  it('AG HATASI: gorunur hata cikar (avukat menusu sessizce bos KALMAZ)', async () => {
    routeApi({ lawyers: networkError });
    render(<ClientsSettingsPage />);
    await screen.findByText('Ayşe Yılmaz');
    await openPoaModal();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Avukatlar yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });
});

describe('SendEmailModal — loadTemplates okuma hatası', () => {
  const openEmailModal = async () => fireEvent.click((await screen.findAllByTitle('E-posta Gönder'))[0]);

  it('AG HATASI: gorunur hata cikar (sablon menusu sessizce bos KALMAZ, gonderim ENGELLENMEZ)', async () => {
    routeApi({ templates: networkError });
    render(<ClientsSettingsPage />);
    await screen.findByText('Ayşe Yılmaz');
    await openEmailModal();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Şablonlar yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });

  it('basarili yukleme: sablon secenegi gorunur, hata YOK', async () => {
    routeApi({});
    render(<ClientsSettingsPage />);
    await screen.findByText('Ayşe Yılmaz');
    await openEmailModal();

    expect(await screen.findByText('Genel Bilgilendirme')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
