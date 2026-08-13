import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PortalDocumentsPage from '../page';

/**
 * WSMR-A4g — PORTAL BELGE İNDİRME / SİLME.
 *
 * `handleDownload` iki ayrı biçimde yalan söylüyordu:
 *   1. `res.ok` değilse HİÇBİR ŞEY olmuyordu — tıklama izsiz yutuluyordu.
 *   2. Gövde hiç doğrulanmadan indiriliyordu: sunucu JSON hata gövdesi dönse
 *      bile o gövde belge adıyla diske yazılıyordu (0 bayt / "Yetkiniz yok"
 *      metni, `.pdf` uzantısıyla).
 *
 * `handleDelete` de sessizdi: kullanıcı onay diyalogunu KABUL ettikten sonra
 * silme başarısız olursa hiçbir uyarı çıkmıyordu.
 *
 * A3g'de kurulan `downloadVerified` primitifi bu yüzeye bağlandı.
 */

const TOKEN = 'portal-test-token';

const DOCS = [
  {
    id: 'd1',
    type: 'VEKALET',
    title: 'Vekaletname',
    fileName: 'vekalet.pdf',
    fileSize: 1024,
    // Silme dugmesi YALNIZ PENDING belgelerde render edilir (sayfanin kendi kurali).
    status: 'PENDING',
    createdAt: '2026-08-01T10:00:00.000Z',
  },
];

let fetchMock: ReturnType<typeof vi.fn>;
let clickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.localStorage.setItem('portal_token', TOKEN);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', vi.fn(() => true));
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.URL.revokeObjectURL = vi.fn();
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const okList = () => ({ ok: true, json: () => Promise.resolve(DOCS) });

function routeFetch(handlers: { download?: () => unknown; del?: () => unknown }) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/download')) {
      return Promise.resolve(
        handlers.download?.() ?? { ok: true, blob: () => Promise.resolve(new Blob(['%PDF-1.4 gercek'], { type: 'application/pdf' })) },
      );
    }
    if (init?.method === 'DELETE') return Promise.resolve(handlers.del?.() ?? { ok: true });
    return Promise.resolve(okList());
  });
}

const clickDownload = async () => fireEvent.click(await screen.findByTitle('İndir'));
const clickDelete = async () => fireEvent.click(await screen.findByTitle('Sil'));

describe('Portal belge indirme', () => {
  it('HTTP hatasi: indirme TETIKLENMEZ ve hata gorunur', async () => {
    routeFetch({ download: () => ({ ok: false, status: 403, json: () => Promise.resolve({}) }) });
    render(<PortalDocumentsPage />);
    await clickDownload();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('SIFIR BAYT govde: dosya diske yazilmaz, hata gorunur', async () => {
    routeFetch({
      download: () => ({ ok: true, blob: () => Promise.resolve(new Blob([], { type: 'application/pdf' })) }),
    });
    render(<PortalDocumentsPage />);
    await clickDownload();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('JSON HATA GOVDESI belge gibi indirilmez', async () => {
    routeFetch({
      download: () => ({
        ok: true,
        blob: () => Promise.resolve(new Blob([JSON.stringify({ message: 'Yetkiniz yok' })], { type: 'application/json' })),
      }),
    });
    render(<PortalDocumentsPage />);
    await clickDownload();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('gecerli govde: indirme TETIKLENIR ve hata YOK', async () => {
    routeFetch({});
    render(<PortalDocumentsPage />);
    await clickDownload();

    await vi.waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
    // Object URL her durumda serbest birakilir (sizinti yok).
    expect(window.URL.revokeObjectURL).toHaveBeenCalled();
  });
});

describe('Portal belge silme', () => {
  it('silme basarisiz: gorunur hata verir', async () => {
    routeFetch({ del: () => ({ ok: false, status: 500, json: () => Promise.resolve({}) }) });
    render(<PortalDocumentsPage />);
    await clickDelete();

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('ag hatasi: gorunur hata verir', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.reject(new Error('Failed to fetch'));
      return Promise.resolve(okList());
    });
    render(<PortalDocumentsPage />);
    await clickDelete();

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('silme basarili: hata YOK ve liste yeniden okunur', async () => {
    routeFetch({});
    render(<PortalDocumentsPage />);
    await screen.findByTitle('Sil');
    const listCallsBefore = fetchMock.mock.calls.filter(
      (c) => !String(c[0]).includes('/download') && c[1]?.method !== 'DELETE',
    ).length;

    await clickDelete();

    await vi.waitFor(() => {
      const listCallsAfter = fetchMock.mock.calls.filter(
        (c) => !String(c[0]).includes('/download') && c[1]?.method !== 'DELETE',
      ).length;
      expect(listCallsAfter).toBeGreaterThan(listCallsBefore);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
