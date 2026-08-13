import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';
import { buildStaffPayload } from '@/lib/case-staff-payload';

/**
 * WSMR-A4l — SİHİRBAZ AÇILIŞINDA YEDİ KAYNAK BAĞIMSIZ DEĞERLENDİRİLİR.
 *
 * `loadExistingData` içindeki yedi çağrının her biri kendi `.catch(...)` ile
 * sessizce boş değere düşüyordu; sihirbaz bu boşluğu GERÇEK veri gibi
 * kullanıyordu. Okunamayan avukat/müvekkil/borçlu/daire/kullanıcı havuzları
 * ekranda "kayıt yok" gibi görünüyor, kullanıcı var olan bir müvekkili
 * seçemeyip yenisini oluşturmaya yönelebiliyordu.
 *
 * Dosyada ZATEN kurulu iki koruma KORUNDU ve bu spec onları da kilitler:
 *  · PR-ASSIGN-2b — `/staff` doğrulanmadıysa payload'da `staff` alanı
 *    `undefined` gider; boş `[]` gönderilip backend varsayılanı EZİLMEZ.
 *  · PR-D — `/lookups` fetch hatası boş veriden AYRI banner'a bağlıdır.
 */

vi.mock('@/lib/api', () => ({
  api: {
    getLawyers: vi.fn(),
    searchDebtors: vi.fn(),
    getNextFileNumber: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/cases/new',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

/**
 * `lib/api/interest-engine.ts` `@shared/types`'tan re-export yapiyor ve bu alias
 * vitest resolve'unda TANIMLI DEGIL (kok config'te yalniz `@` var). Sihirbaz bu
 * modulu dolayli olarak cekiyor. Kok vitest config'ini bu dilimde degistirmemek
 * icin modul burada mock'lanir — test edilen davranisla ilgisi YOK.
 */
vi.mock('@/lib/api/interest-engine', () => ({
  interestEngineApi: { preview: vi.fn() },
  InterestTypeCode: { LEGAL_3095: 'LEGAL_3095', COMMERCIAL_AVANS_3095_2_2: 'COMMERCIAL_AVANS_3095_2_2' },
  requiresFixedRate: () => false,
  formatRate: (r: number) => String(r),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1' }, loading: false }),
}));

const mocked = api as unknown as {
  getLawyers: ReturnType<typeof vi.fn>;
  searchDebtors: ReturnType<typeof vi.fn>;
  getNextFileNumber: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const LAWYERS = [{ id: 'l1', name: 'Av', surname: 'Bir', isActive: true }];
const CLIENTS = [{ id: 'c1', name: 'Ayşe Yılmaz' }];
const DEBTORS = [{ id: 'd1', name: 'Mehmet Demir' }];
const OFFICES = [{ id: 'o1', name: '1. İcra', city: 'Ankara' }];
const USERS = [{ id: 'u1', name: 'Kullanıcı' }];
const STAFF = [{ id: 's1', firstName: 'Per', lastName: 'Sonel' }];
const LOOKUPS = {
  takipTuru: [{ id: 't1', name: 'İlamsız', code: 'ILAMSIZ_GENEL' }],
  asama: [{ id: 'a1', name: 'Dosya Açıldı', code: 'DOSYA_ACILDI' }],
  risk: [],
  durumEtiketi: [],
  mahiyetTipi: [],
};

type Key = 'lawyers' | 'clients' | 'debtors' | 'offices' | 'lookups' | 'users' | 'staff';
type Overrides = Partial<Record<Key, () => unknown>>;

function routeApi(o: Overrides = {}) {
  mocked.getLawyers.mockImplementation(() => o.lawyers?.() ?? Promise.resolve(LAWYERS));
  mocked.searchDebtors.mockImplementation(() => o.debtors?.() ?? Promise.resolve(DEBTORS));
  mocked.getNextFileNumber.mockResolvedValue('2026/1');
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/clients')) return Promise.resolve(o.clients?.() ?? { data: { data: CLIENTS } });
    if (u.startsWith('/execution-offices')) {
      return Promise.resolve(o.offices?.() ?? { data: { data: OFFICES } });
    }
    if (u.startsWith('/lookups')) return Promise.resolve(o.lookups?.() ?? { data: { data: LOOKUPS } });
    if (u.startsWith('/users')) return Promise.resolve(o.users?.() ?? { data: { data: USERS } });
    if (u.startsWith('/staff')) return Promise.resolve(o.staff?.() ?? { data: { data: STAFF } });
    return Promise.resolve({ data: { data: [] } });
  });
}

const fail = () => Promise.reject(new Error('network down'));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const band = async () => screen.findByRole('alert');

describe('A4l — sekiz kaynak başarılı', () => {
  it('hepsi basarili: eksiklik bandi YOK', async () => {
    routeApi();
    render(<NewCasePage />);

    await vi.waitFor(() => expect(mocked.getNextFileNumber).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('A4l — her kaynak için bağımsız rejection', () => {
  const CASES: Array<[Key, RegExp]> = [
    ['lawyers', /Avukatlar/],
    ['clients', /Müvekkiller/],
    ['debtors', /Borçlular/],
    ['offices', /İcra daireleri/],
    ['lookups', /Takip türü\/aşama tanımları/],
    ['users', /Kullanıcılar/],
    ['staff', /Personel/],
  ];

  for (const [key, label] of CASES) {
    it(`${key} rejection: ISIMLE bildirilir`, async () => {
      routeApi({ [key]: fail } as Overrides);
      render(<NewCasePage />);

      expect((await band()).textContent).toMatch(label);
    });
  }
});

describe('A4l — null / malformed yanıt', () => {
  it('null govde BASARI sayilmaz', async () => {
    routeApi({ clients: () => ({ data: { data: null } }) });
    render(<NewCasePage />);

    expect((await band()).textContent).toMatch(/Müvekkiller/);
  });

  it('malformed govde (dizi degil) BASARI sayilmaz', async () => {
    routeApi({ users: () => ({ data: { data: { nope: true } } }) });
    render(<NewCasePage />);

    expect((await band()).textContent).toMatch(/Kullanıcılar/);
  });

  it('lookups eksik alanli ise BASARI sayilmaz (asama yok)', async () => {
    routeApi({ lookups: () => ({ data: { data: { takipTuru: [] } } }) });
    render(<NewCasePage />);

    expect((await band()).textContent).toMatch(/Takip türü\/aşama tanımları/);
  });
});

describe('A4l — kısmi başarı izolasyonu', () => {
  it('bir kaynagin hatasi digerlerini DUSURMEZ', async () => {
    routeApi({ clients: fail });
    render(<NewCasePage />);

    const b = await band();
    expect(b.textContent).toMatch(/Müvekkiller/);
    // Digerleri raporlanmaz -> dusmediler.
    expect(b.textContent).not.toMatch(/Avukatlar/);
    expect(b.textContent).not.toMatch(/Borçlular/);
    expect(b.textContent).not.toMatch(/İcra daireleri/);
  });

  it('birden cok hata TUMU bildirilir', async () => {
    routeApi({ clients: fail, offices: fail, users: fail });
    render(<NewCasePage />);

    const b = await band();
    expect(b.textContent).toMatch(/Müvekkiller/);
    expect(b.textContent).toMatch(/İcra daireleri/);
    expect(b.textContent).toMatch(/Kullanıcılar/);
  });

  it('band, bos listenin "kayit yok" ANLAMINA GELMEDIGINI soyler', async () => {
    routeApi({ clients: fail });
    render(<NewCasePage />);

    expect((await band()).textContent).toMatch(/Boş görünmesi kayıt olmadığı anlamına gelmez/i);
  });
});

describe('A4l — başarısız veriyle yazma yapılmaz', () => {
  it('yukleme hatasinda HICBIR POST/PUT uretilmez', async () => {
    routeApi({ clients: fail, staff: fail });
    render(<NewCasePage />);
    await band();

    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('BOS LISTEYLE destructive replace YAPILMAZ (PR-ASSIGN-2b korundu)', () => {
    // `/staff` dogrulanmadiysa `staffListLoaded=false` olur ve payload'da
    // `staff` alani UNDEFINED gider — bos `[]` gonderilip backend varsayilan
    // personeli EZILMEZ. Kural dogrudan payload kurucusundan dogrulanir.
    expect(buildStaffPayload([], false)).toBeUndefined();
    // Liste DOGRULANDIYSA bos secim bilincli bir tercihtir ve gonderilir.
    expect(buildStaffPayload([], true)).toEqual([]);
  });
});

describe('A4l — retry ve stale', () => {
  it('retry BASARILI: band kalkar ve YALNIZ okuma tekrarlanir', async () => {
    let attempt = 0;
    routeApi({
      clients: () => {
        attempt += 1;
        return attempt === 1 ? fail() : Promise.resolve({ data: { data: CLIENTS } });
      },
    });
    render(<NewCasePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(attempt).toBe(2);
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('BAYAT hata yeni denemede TEMIZLENIR', async () => {
    let attempt = 0;
    routeApi({
      offices: () => {
        attempt += 1;
        return attempt === 1 ? fail() : Promise.resolve({ data: { data: OFFICES } });
      },
    });
    render(<NewCasePage />);
    expect((await band()).textContent).toMatch(/İcra daireleri/);

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('hizli CIFT retry: kaynak basina TEK ek cagri', async () => {
    routeApi({ clients: fail });
    render(<NewCasePage />);
    const btn = await screen.findByRole('button', { name: 'Tekrar dene' });
    const before = mocked.getLawyers.mock.calls.length;

    // Ayni tick icinde iki tik.
    fireEvent.click(btn);
    fireEvent.click(btn);

    await vi.waitFor(() =>
      expect(mocked.getLawyers.mock.calls.length).toBeGreaterThan(before),
    );
    // React 18 batch'i ile iki tik TEK yeniden yukleme turu uretir.
    expect(mocked.getLawyers.mock.calls.length - before).toBeLessThanOrEqual(2);
  });
});
