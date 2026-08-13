import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CasesPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4k — OKUNAMAYAN FİLTRE KAYNAĞI "SEÇENEK YOK" DEĞİLDİR.
 *
 * `loadLookupData` içindeki beş kaynağın her biri `.catch(() => boş)` ile
 * sessizce boşa düşüyordu. Bu listeler takip listesindeki FİLTRE menülerini
 * besliyor (müvekkil, avukat, personel, risk/aşama, icra dairesi + şehir).
 * Kaynak okunamadığında menü boş açılıyor; kullanıcı "bu büroda müvekkil yok"
 * ya da "bu aşama tanımlı değil" sonucuna varabiliyor, aradığı kaydı
 * filtreleyemeyip yok sanabiliyordu.
 *
 * Kural: boş menü ile okunamamış menü AYNI görünemez.
 */

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    getLawyers: vi.fn(),
    getCases: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mocked = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  getLawyers: ReturnType<typeof vi.fn>;
  getCases: ReturnType<typeof vi.fn>;
};

const LOOKUPS = { risk: [{ id: 'r1', name: 'Yüksek' }], asama: [{ id: 's1', name: 'Haciz' }] };

type Overrides = Partial<Record<'clients' | 'staff' | 'lookups' | 'offices' | 'cases', () => unknown>>;

function routeApi(o: Overrides = {}, lawyers?: () => unknown) {
  mocked.getLawyers.mockImplementation(() => lawyers?.() ?? Promise.resolve([]));
  // Takip listesi okumasi bu spec'in konusu DEGIL; temiz bir zemin icin basarili doner.
  mocked.getCases.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 1 } });
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/clients')) return Promise.resolve(o.clients?.() ?? { data: { data: [] } });
    if (u.startsWith('/staff')) return Promise.resolve(o.staff?.() ?? { data: { data: [] } });
    if (u.startsWith('/lookups')) return Promise.resolve(o.lookups?.() ?? { data: { data: LOOKUPS } });
    if (u.startsWith('/execution-offices')) {
      return Promise.resolve(o.offices?.() ?? { data: { data: [] } });
    }
    if (u.startsWith('/cases')) {
      return Promise.resolve(o.cases?.() ?? { data: { data: [], meta: { total: 0, totalPages: 1 } } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
}

const fail = () => Promise.reject(new Error('network down'));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Takip listesi — lookup kaynağı hatası', () => {
  it('muvekkil lookup HATASI: eksiklik ISIMLE bildirilir', async () => {
    routeApi({ clients: fail });
    render(<CasesPage />);

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/Müvekkiller/);
    expect(band.textContent).toMatch(/EKSİK/);
  });

  it('band, bos menunun "kayit yok" ANLAMINA GELMEDIGINI soyler', async () => {
    routeApi({ lookups: fail });
    render(<CasesPage />);

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/Boş görünmesi kayıt olmadığı anlamına gelmez/i);
  });

  it('birden cok kaynak hatasi TUMU bildirilir', async () => {
    routeApi({ clients: fail, offices: fail }, fail);
    render(<CasesPage />);

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/Müvekkiller/);
    expect(band.textContent).toMatch(/Avukatlar/);
    expect(band.textContent).toMatch(/İcra daireleri/);
  });

  it('bozuk govde (dizi degil) BASARI sayilmaz', async () => {
    routeApi({ staff: () => ({ data: { data: { nope: true } } }) });
    render(<CasesPage />);

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/Personel/);
  });

  it('lookups govdesi eksik alanli ise BASARI sayilmaz', async () => {
    // `risk` var ama `asama` yok -> sozlesme ihlali.
    routeApi({ lookups: () => ({ data: { data: { risk: [] } } }) });
    render(<CasesPage />);

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/Risk\/aşama tanımları/);
  });

  it('hepsi basarili: eksiklik bandi YOK', async () => {
    routeApi();
    render(<CasesPage />);

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('retry: YALNIZ lookup okumasi tekrarlanir ve basarida band kalkar', async () => {
    let attempt = 0;
    routeApi({
      clients: () => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error('geçici'))
          : Promise.resolve({ data: { data: [] } });
      },
    });
    render(<CasesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(attempt).toBe(2);
  });
});
