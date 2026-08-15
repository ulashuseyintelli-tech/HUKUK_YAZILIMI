import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AB-12 — DOSYA ÇALIŞMA ALANI: MÜVEKKİL "İŞ KARTI" DRAWER'I (clientStats)
 * OKUMA HATASI SESSİZCE "0 AKTİF DOSYA / UYARI YOK" GİBİ GÖRÜNMEZ.
 *
 * `fetchClientStats` (`api.getCases({ clientId })`), müvekkil detay drawer'ının
 * "Dosya Yoğunluğu" / "Finansal Durum" / "Uyarılar" panellerini besler.
 * `staleCases30d` / `nearExpiryCases` alanları, bir avukatın YAKLAŞAN süre veya
 * DURGUN dosya UYARISINI görüp görmeyeceğini belirler — eskiden okuma hatası
 * yalnız `console.error` ile YUTULUYORDU, `clientStats` hep `null` kalıyor ve
 * uyarı göstergesi SESSİZCE hiç görünmüyordu (gerçekte uyarı olsa bile).
 *
 * KAPSAM (owner GO — seri zincir A4-AB-11→15, dilim 2): YALNIZ
 * `fetchClientStats` / bu drawer'ın kendi okuma yolu. Ana dosya verisi
 * (`fetchCase`), dispositions, expense-three-view VE mutation yolları bu
 * dilimin kapsamı DIŞINDADIR — dokunulmadı.
 */

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn().mockResolvedValue([]);
      return registry[prop];
    },
  };
  return { api: new Proxy({}, handler) };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-1' }),
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/cases/case-1',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const TEST_CLIENT = {
  id: 'client-1',
  displayName: 'Test Müvekkil A.Ş.',
  name: 'Test Müvekkil A.Ş.',
  type: 'COMPANY',
  vkn: '1234567890',
  phone: '5551234567',
  isActive: true,
};

const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  principalAmount: 15000,
  debtors: [],
  caseClients: [{ id: 'cc-1', role: 'ALACAKLI', client: TEST_CLIENT }],
  lawyers: [],
  claimItems: [],
};

const networkError = () => Promise.reject(new Error('network down'));

function applyRealContractDefaults() {
  mocked.getCase.mockResolvedValue(REAL_CASE);
  mocked.getCaseDebtors.mockResolvedValue({
    summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 },
    items: [],
  });
  mocked.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  mocked.getActiveCaseFeeAgreement.mockResolvedValue(null);
  mocked.getCaseDues.mockResolvedValue([]);
  mocked.getCaseCollections.mockResolvedValue([]);
  mocked.getCollectionDispositionsByCase.mockResolvedValue([]);
  mocked.getExpenseThreeViewForCase.mockResolvedValue([]);
  mocked.getCaseResponsibilityAt.mockResolvedValue({
    caseId: REAL_CASE.id,
    asOf: new Date().toISOString(),
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' },
    horizon: {},
  });
  mocked.getCaseResponsibilityHistory.mockResolvedValue({
    caseId: REAL_CASE.id,
    from: null,
    to: null,
    events: [],
    horizon: {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  applyRealContractDefaults();
});
afterEach(() => cleanup());

/** Müvekkil satırına tıklayıp drawer'ı açar (ilk açılış VEYA aynı müvekkil için yeniden açılış). */
async function openClientDrawer() {
  const row = await screen.findByText(TEST_CLIENT.displayName);
  fireEvent.click(row);
}

/** Drawer başlığındaki X (kapat) düğmesine tıklar — erişilebilir isim TAŞIMADIĞI için ikon üzerinden bulunur. */
function closeClientDrawer(container: HTMLElement) {
  const closeBtn = container.querySelector('svg.lucide-x')?.closest('button');
  if (!closeBtn) throw new Error('drawer close button not found');
  fireEvent.click(closeBtn);
}

/**
 * "Dosya Yoğunluğu" panelindeki "Aktif" değerini SCOPED okur — sayfada BAŞKA
 * bir "Aktif" etiketi (dosya/müvekkil durum rozeti) de olabildiği için
 * page-wide `getByText('Aktif')` BELİRSİZDİR.
 */
function activeCasesValue(): string | null {
  const heading = screen.getByText((_content, el) => el?.tagName === 'H4' && (el.textContent || '').includes('Dosya Yoğunluğu'));
  const panel = heading.closest('div');
  if (!panel) throw new Error('Dosya Yoğunluğu panel not found');
  const label = within(panel).getByText('Aktif');
  const valueEl = label.previousElementSibling;
  return valueEl ? valueEl.textContent : null;
}

describe('Müvekkil iş kartı drawer — clientStats okuma hatası sınıfları', () => {
  it('[1] AĞ HATASI: görünür hata + retry çıkar, "0 aktif dosya" İDDİA ETMEZ', async () => {
    mocked.getCases.mockImplementation(networkError);
    renderPage();
    await openClientDrawer();

    const alert = await screen.findByRole('alert');
    expect(/Müvekkil istatistikleri yüklenemedi/.test(alert.textContent || '')).toBe(true);
  });

  it('[2] 500: görünür hata çıkar', async () => {
    mocked.getCases.mockImplementation(() => {
      const e = new Error('Sunucu hatası') as Error & { status?: number };
      e.status = 500;
      return Promise.reject(e);
    });
    renderPage();
    await openClientDrawer();
    await screen.findByRole('alert');
  });

  it('[3] MALFORMED gövde (dizi değil): görünür hata çıkar, .forEach/.filter TypeError sızmaz', async () => {
    mocked.getCases.mockResolvedValue({ notAnArray: true } as any);
    renderPage();
    await openClientDrawer();
    await screen.findByRole('alert');
  });

  it('[4] GERÇEKTEN boş (0 dosya): hata YOK, sayaçlar 0 gösterir', async () => {
    mocked.getCases.mockResolvedValue({ data: [] });
    renderPage();
    await openClientDrawer();

    await waitFor(() => expect(screen.getByText('Aktif')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('[5] başarılı yükleme: gerçek sayaçlar render edilir, hata YOK', async () => {
    mocked.getCases.mockResolvedValue({
      data: [
        { id: 'c1', status: 'ACTIVE', currency: 'TRY', principalAmount: 1000, caseDate: '2026-01-01', updatedAt: new Date().toISOString() },
        { id: 'c2', status: 'ACTIVE', currency: 'TRY', principalAmount: 2000, caseDate: '2026-01-01', updatedAt: new Date().toISOString() },
      ],
    });
    renderPage();
    await openClientDrawer();

    await waitFor(() => expect(screen.getByText('Aktif')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Müvekkil iş kartı drawer — retry YALNIZ clientStats tekrar dener', () => {
  it('[6] retry -> SUCCESS_DATA: hata kalkar, sayaçlar görünür', async () => {
    let attempt = 0;
    mocked.getCases.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? networkError() : Promise.resolve({ data: [] });
    });
    renderPage();
    await openClientDrawer();

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mocked.getCases).toHaveBeenCalledTimes(2);
  });

  it('[7] çift hızlı retry tıklaması: in-flight guard İKİNCİ isteği hiç başlatmaz', async () => {
    let resolveSecond!: (v: any) => void;
    let attempt = 0;
    mocked.getCases.mockImplementation(() => {
      attempt += 1;
      if (attempt === 1) return networkError();
      return new Promise((r) => {
        resolveSecond = r;
      });
    });
    renderPage();
    await openClientDrawer();
    await screen.findByRole('alert');

    const retryBtn = screen.getByRole('button', { name: 'Tekrar dene' });
    fireEvent.click(retryBtn);
    fireEvent.click(retryBtn); // in-flight guard + disabled attribute -> YOK SAYILMALI
    await waitFor(() => expect(mocked.getCases).toHaveBeenCalledTimes(2)); // 1 ilk + 1 retry, İKİNCİ YOK

    resolveSecond({ data: [] });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('Müvekkil iş kartı drawer — hata sırasında önceki veri', () => {
  it('[8] başarılı yükleme sonrası drawer kapanıp AYNI müvekkil için yeniden açılırsa ve okuma başarısız olursa ÖNCEKİ veri KORUNUR + bayat bandı', async () => {
    let attempt = 0;
    mocked.getCases.mockImplementation(() => {
      attempt += 1;
      if (attempt === 1) {
        return Promise.resolve({
          data: [{ id: 'c1', status: 'ACTIVE', currency: 'TRY', principalAmount: 1000, caseDate: '2026-01-01', updatedAt: new Date().toISOString() }],
        });
      }
      return networkError();
    });
    const { container } = renderPage();
    await openClientDrawer();
    await waitFor(() => expect(activeCasesValue()).toBe('1'));
    expect(screen.queryByRole('alert')).toBeNull();

    // Drawer'ı kapat, AYNI müvekkil için tekrar aç -> fetchClientStats İKİNCİ kez
    // çağrılır ve bu kez BAŞARISIZ olur.
    closeClientDrawer(container);
    await openClientDrawer();

    await screen.findByRole('alert');
    // ÖNCEKİ sayaç (1) HÂLÂ ekranda — SİLİNMEDİ, yalnız bayat olduğu bantta belirtildi.
    expect(activeCasesValue()).toBe('1');
    expect(screen.getByText(/bayat olabilir/)).toBeTruthy();
  });

  it('[9] geç gelen ESKİ yanıt YENİ (yeniden-açılış sonrası) state\'i ezmez (jenerasyon token)', async () => {
    const dOld = (() => {
      let resolve!: (v: any) => void;
      const promise = new Promise<any>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    })();
    let attempt = 0;
    mocked.getCases.mockImplementation(() => {
      attempt += 1;
      // 1. çağrı (ilk açılış) = ESKİ, GEÇ gelecek (dOld ile kontrol edilir).
      // 2. çağrı (kapat+yeniden aç) = YENİ, HEMEN döner ve KAZANMALI.
      return attempt === 1 ? dOld.promise : Promise.resolve({ data: [{ id: 'c9', status: 'ACTIVE', currency: 'TRY', principalAmount: 1, caseDate: '2026-01-01', updatedAt: new Date().toISOString() }] });
    });
    const { container } = renderPage();
    await openClientDrawer();

    // İlk istek (dOld) HENÜZ çözülmeden drawer kapatılıp AYNI müvekkil için
    // yeniden açılıyor -> İKİNCİ istek (call 2) tetiklenir ve HEMEN başarıyla döner.
    closeClientDrawer(container);
    await openClientDrawer();
    // fetchClientStats effect'ten fire-and-forget çağrılır (await EDİLMEZ) — devamı
    // (api.getCases sonrası) bir mikrotask olarak çalışır; act() bunu OTOMATİK
    // sarmaz. Diğer bekleyen mikrotaskların yerleşmesi için kısa bir flush.
    await new Promise((r) => setTimeout(r, 0));
    await waitFor(() => {
      expect(activeCasesValue()).toBe('1');
    }); // call 2'nin sonucu

    // Şimdi dOld'un (call 1) GECİKMİŞ 2-kayıtlık yanıtı çözülüyor — YENİ (call 2,
    // activeCases=1) state'ini EZMEMELİ.
    dOld.resolve({
      data: [
        { id: 'stale-1', status: 'ACTIVE', currency: 'TRY', principalAmount: 1, caseDate: '2026-01-01', updatedAt: new Date().toISOString() },
        { id: 'stale-2', status: 'ACTIVE', currency: 'TRY', principalAmount: 1, caseDate: '2026-01-01', updatedAt: new Date().toISOString() },
      ],
    });
    await new Promise((r) => setTimeout(r, 0));
    // activeCases HÂLÂ 1 — dOld'un ESKİ yanıtı state'i EZMEDİ (ezseydi 2 olurdu).
    expect(activeCasesValue()).toBe('1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('[10] unmount sonrası gecikmeli yanıt state güncellemesi/unhandled rejection ÜRETMEZ', async () => {
    const rejections: unknown[] = [];
    const onUnhandledRejection = (err: unknown) => rejections.push(err);
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      let resolveIt!: (v: any) => void;
      mocked.getCases.mockImplementation(
        () =>
          new Promise((r) => {
            resolveIt = r;
          }),
      );
      const { unmount } = renderPage();
      await openClientDrawer();
      unmount();
      resolveIt({ data: [] });
      await new Promise((r) => setTimeout(r, 0));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});
