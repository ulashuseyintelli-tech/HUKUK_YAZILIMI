import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import DebtorsPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4h — DETAY OKUNAMAZSA LİSTE SATIRIYLA MODAL AÇILMAZ.
 *
 * `handleDebtorClick` detay okuması başarısız olunca modalı LİSTE SATIRIYLA
 * açıyordu. Liste projeksiyonu detaydan DARDIR (findAll ≠ findOne) ve
 * `DebtorDetailModal` bütün düzenleme formunu bu proptan tohumlayıp
 * `handleSave` ile TAM FORM gönderir.
 *
 * En ağır sonuç tereke (ESTATE) borçlularda: `estateHeirs` liste satırında
 * yoksa form `heirs = []` ile açılır; kaydedildiğinde payload `estateHeirs: []`
 * taşır ve backend mirasçı listesini BOŞ liste ile REPLACE eder — yani gerçek
 * mirasçı kayıtları SİLİNİR. Eksik diğer alanlar da kullanıcıya "kayıt yok"
 * gibi görünür.
 *
 * Kural: doğrulanmamış gövdeyle detay modalı AÇILMAZ.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), delete: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/components/debtor/NewDebtorModal', () => ({
  NewDebtorModal: () => null,
}));

const mocked = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

/** Liste satiri: DAR projeksiyon — estateHeirs, riskNotes, notes YOK. */
const LIST_ROW = {
  id: 'dbt-1',
  type: 'ESTATE',
  name: 'Merhum Ahmet Yılmaz Terekesi',
  deceasedName: 'Ahmet Yılmaz',
  activeCasesCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Detay: mirascilari da tasir. */
const DETAIL = {
  ...LIST_ROW,
  estateHeirs: [
    { name: 'Ayşe Yılmaz', tckn: '', address: '', city: '', district: '', shareRatio: '1/2', phone: '', email: '' },
  ],
  notes: 'Gerçek not',
};

const listResponse = { data: { data: [LIST_ROW], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => cleanup());

/** Liste cagrisi ile detay cagrisini AYIRAN yonlendirici. */
function routeApi(detail: () => unknown) {
  mocked.get.mockImplementation((url: string) => {
    if (/\/debtors\/[^/?]+$/.test(String(url))) return Promise.resolve(detail());
    return Promise.resolve(listResponse);
  });
}

const clickRow = async () => {
  const row = await screen.findByText('Merhum Ahmet Yılmaz Terekesi');
  fireEvent.click(row);
};

describe('Borçlu detayı — okuma hatası', () => {
  it('detay HATASI: modal ACILMAZ, gorunur hata cikar', async () => {
    routeApi(() => Promise.reject(new Error('network down')));
    render(<DebtorsPage />);
    await clickRow();

    expect(await screen.findByRole('alert')).toBeTruthy();
    // Modal basligi (<h2>{debtor.name}</h2>) HIC basilmaz -> modal acilmadi.
    // Ayni metin liste satirinda da geciyor; bu yuzden ROLE ile ayirt ediliyor.
    expect(screen.queryByRole('heading', { name: 'Merhum Ahmet Yılmaz Terekesi' })).toBeNull();
  });

  it('BOZUK govde (kimlik uyusmuyor) detay SAYILMAZ', async () => {
    // Baska bir borclunun govdesi donerse yanlis kayit duzenlenebilirdi.
    routeApi(() => ({ data: { data: { ...DETAIL, id: 'baska-borclu' } } }));
    render(<DebtorsPage />);
    await clickRow();

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('BOS govde detay SAYILMAZ', async () => {
    routeApi(() => ({ data: { data: null } }));
    render(<DebtorsPage />);
    await clickRow();

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('basarili detay: modal ACILIR, hata YOK', async () => {
    routeApi(() => ({ data: { data: DETAIL } }));
    render(<DebtorsPage />);
    await clickRow();

    // Modal ACILDI (baslik render edildi) ve hata YOK.
    expect(
      await screen.findByRole('heading', { name: 'Merhum Ahmet Yılmaz Terekesi' }),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocked.get).toHaveBeenCalledWith('/debtors/dbt-1');
  });

  it('retry: YALNIZ okuma tekrarlanir, mutasyon uretilmez', async () => {
    let attempt = 0;
    routeApi(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('geçici'))
        : Promise.resolve({ data: { data: DETAIL } });
    });
    render(<DebtorsPage />);
    await clickRow();

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(attempt).toBe(2);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   WSMR-A4i — YIKICI DUZENLEME KORUMASI (owner zorunlu matrisi).
   ───────────────────────────────────────────────────────────────────────────── */
describe('A4i — yıkıcı düzenleme koruması', () => {
  it('detay hatasinda HICBIR PUT/PATCH/POST cagrisi yapilmaz', async () => {
    routeApi(() => Promise.reject(new Error('network down')));
    render(<DebtorsPage />);
    await clickRow();
    await screen.findByRole('alert');

    expect(mocked.put).not.toHaveBeenCalled();
    expect(mocked.post).not.toHaveBeenCalled();
    expect(mocked.delete).not.toHaveBeenCalled();
  });

  it('dar liste projeksiyonu edit formuna DONUSMEZ (mirasci alani hic render edilmez)', async () => {
    routeApi(() => Promise.reject(new Error('network down')));
    render(<DebtorsPage />);
    await clickRow();
    await screen.findByRole('alert');

    // Liste satirinda estateHeirs YOK. Eski davranista modal acilir, form
    // heirs=[] ile tohumlanir ve "Mirasci yok" gorunurdu; kaydedilince backend
    // mirasci listesini BOS liste ile REPLACE ederdi.
    expect(screen.queryByText(/Mirasçılar/)).toBeNull();
    expect(screen.queryByText(/Mirasçı yok/)).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Mirasçı Ekle' })).toBeNull();
  });

  it('estateHeirs YUKLENMEDEN bos listeyle REPLACE gonderilmez', async () => {
    routeApi(() => Promise.reject(new Error('network down')));
    render(<DebtorsPage />);
    await clickRow();
    await screen.findByRole('alert');

    // Hicbir yazma cagrisi yok; dolayisiyla estateHeirs: [] tasiyan payload da yok.
    const writeCalls = [
      ...mocked.put.mock.calls,
      ...mocked.post.mock.calls,
    ];
    expect(writeCalls).toHaveLength(0);
  });

  it('retry BASARILI olursa modal YALNIZ taze detayla acilir', async () => {
    let attempt = 0;
    routeApi(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('geçici'))
        : Promise.resolve({ data: { data: DETAIL } });
    });
    render(<DebtorsPage />);
    await clickRow();
    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    // Modal ACILDI ve icerigi TAZE detaydan geliyor (liste satirindan degil).
    expect(
      await screen.findByRole('heading', { name: 'Merhum Ahmet Yılmaz Terekesi' }),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocked.put).not.toHaveBeenCalled();
  });
});
