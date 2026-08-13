import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Header } from '../header';
import { api } from '@/lib/api';

/**
 * WSMR-A4j — GLOBAL ARAMADA KAYNAK HATASI ≠ "SONUÇ YOK".
 *
 * `Header` dashboard'un TÜM sayfalarında render edilir
 * (`app/(dashboard)/layout.tsx:36` → `<Header />`), dolayısıyla bu yüzey geneldir.
 *
 * Eski hâlde üç arama kaynağının her biri `.catch(() => ({ data: [] }))` ile
 * sessizce boş diziye düşüyordu. Render tarafı tam olarak bu durumda
 * **"Sonuç bulunamadı"** basıyor. Yani `/cases` erişilemezken gerçekten VAR OLAN
 * bir takip aranınca ekran "yok" diyor; avukat dosyanın bulunmadığı sonucuna
 * varabilirdi.
 *
 * Kural: "hiç sonuç yok" ancak ÜÇ kaynak da DOĞRULANMIŞ biçimde boş döndüğünde
 * yazılabilir. Kısmi başarısızlık gizlenmez, eksik kaynak isimle söylenir.
 */

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { name: 'Test', surname: 'Kullanıcı', role: 'LAWYER' }, logout: vi.fn() }),
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

const CASE_ROW = { id: 'c1', fileNumber: '2026/123', type: 'ILAMSIZ' };
const CLIENT_ROW = { id: 'cl1', name: 'Ayşe Yılmaz', tckn: '11111111111' };
const DEBTOR_ROW = { id: 'd1', name: 'Mehmet Demir', identityNo: '22222222222' };

/** Kaynak basina ayri yanit kurgulanabilen yonlendirici. */
function routeSearch(h: { cases?: () => unknown; clients?: () => unknown; debtors?: () => unknown }) {
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/cases')) return Promise.resolve(h.cases?.() ?? { data: [CASE_ROW] });
    if (u.startsWith('/clients')) return Promise.resolve(h.clients?.() ?? { data: [CLIENT_ROW] });
    if (u.startsWith('/debtors')) return Promise.resolve(h.debtors?.() ?? { data: [DEBTOR_ROW] });
    return Promise.resolve({ data: [] });
  });
}

const fail = () => Promise.reject(new Error('network down'));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

/** Arama kutusuna yaz ve 300ms debounce'u ilerlet. */
async function search(term = 'yilmaz') {
  const input = screen.getAllByPlaceholderText(/Takip, müvekkil, borçlu ara/)[0];
  fireEvent.change(input, { target: { value: term } });
  await vi.advanceTimersByTimeAsync(350);
}

describe('Global arama — kaynak hatası', () => {
  it('UC KAYNAK DA hata: "Sonuç bulunamadı" YAZILMAZ, gorunur hata cikar', async () => {
    routeSearch({ cases: fail, clients: fail, debtors: fail });
    render(<Header />);
    await search();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Sonuç bulunamadı')).toBeNull();
  });

  it('hata mesaji "kayit yok" ANLAMINA GELMEDIGINI acikca soyler', async () => {
    routeSearch({ cases: fail, clients: fail, debtors: fail });
    render(<Header />);
    await search();

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/Kayıt bulunmadığı anlamına GELMEZ/i);
  });

  it('KISMI hata: basarili kaynaklar listelenir, eksik kaynak ISIMLE soylenir', async () => {
    routeSearch({ cases: fail });
    render(<Header />);
    await search();

    // Musteri ve borclu sonuclari GORUNUR.
    expect(await screen.findByText('Ayşe Yılmaz')).toBeTruthy();
    expect(screen.getByText('Mehmet Demir')).toBeTruthy();
    // Eksik kaynak gizlenmez.
    const band = screen.getByRole('alert');
    expect(band.textContent).toMatch(/Takipler/);
    expect(band.textContent).toMatch(/EKSİK olabilir/i);
  });

  it('bozuk govde (dizi degil) BASARI sayilmaz — o kaynak hatali isaretlenir', async () => {
    routeSearch({ clients: () => ({ data: { unexpected: true } }) });
    render(<Header />);
    await search();

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/Müvekkiller/);
    // Digerleri yine listelenir.
    expect(screen.getByText('2026/123')).toBeTruthy();
  });

  it('GERCEKTEN bos: hata YOK, "Sonuç bulunamadı" yazilir', async () => {
    routeSearch({
      cases: () => ({ data: [] }),
      clients: () => ({ data: [] }),
      debtors: () => ({ data: [] }),
    });
    render(<Header />);
    await search();

    expect(await screen.findByText('Sonuç bulunamadı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hepsi basarili: sonuclar listelenir, hata bandi YOK', async () => {
    routeSearch({});
    render(<Header />);
    await search();

    expect(await screen.findByText('2026/123')).toBeTruthy();
    expect(screen.getByText('Ayşe Yılmaz')).toBeTruthy();
    expect(screen.getByText('Mehmet Demir')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('BAYAT hata yeni aramada temizlenir', async () => {
    routeSearch({ cases: fail });
    render(<Header />);
    await search('ilk');
    expect(await screen.findByRole('alert')).toBeTruthy();

    routeSearch({});
    await search('ikinci');

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
