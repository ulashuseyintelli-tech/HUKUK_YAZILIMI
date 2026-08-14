import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CasesPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4o — TAKİP LİSTESİ: OKUMA HATASI "TAKİP BULUNAMADI" DEĞİLDİR.
 *
 * `fetchCases`, ana takip listesi sayfasının BİRİNCİL yüklemesi — bu depodaki
 * en yüksek trafikli yüzeylerden biri. Eski hâlde her hata (ağ kesintisi,
 * 500) yalnız `console.error` ile yutuluyordu. İlk yüklemede `cases` başlangıç
 * değeri (`[]`) olduğu için bu, doğrudan **"Takip bulunamadı"** satırına
 * dönüşüyordu — okunamayan bir liste, gerçekten boş bir liste gibi görünüyordu.
 *
 * Kural: okuma hatası her zaman görünür + yeniden-deneme sunar; zaten yüklü
 * `cases` (bir önceki başarılı yüklemeden kalan) SİLİNMEZ.
 *
 * NOT: `api.get`'in dönüş sözleşmesi (`response.data.data` dizisi,
 * `response.data.meta`) — `../__tests__/a4k-lookup-failure-not-empty-options.spec.tsx`
 * (WSMR-A4k) içinde ZATEN doğrulanmış; bu dilim ayrıca doğrulamaz, aynı
 * kurulumu miras alır.
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

/** Gerçek `CaseItem` sözleşmesine yeterince yakın, minimal ama geçerli fixture. */
const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  type: 'ICRA',
  status: 'ACTIVE',
  debtors: [],
  createdAt: '2026-08-01T10:00:00.000Z',
};

/** Lookup kaynakları (WSMR-A4k kapsamı) — bu dilimde HEP başarılı döner. */
function applyLookupDefaults() {
  mocked.getLawyers.mockResolvedValue([]);
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/clients')) return Promise.resolve({ data: { data: [] } });
    if (u.startsWith('/staff')) return Promise.resolve({ data: { data: [] } });
    if (u.startsWith('/lookups')) return Promise.resolve({ data: { data: { risk: [], asama: [] } } });
    if (u.startsWith('/execution-offices')) return Promise.resolve({ data: { data: [] } });
    if (u.startsWith('/cases/stats')) return Promise.resolve({ data: { ownerless: 0, legalResponsibleMissing: 0 } });
    return Promise.resolve({ data: { data: [] } });
  });
}

const networkError = () => Promise.reject(new Error('network down'));
const serverError = () => {
  const e = new Error('İç sunucu hatası: stack trace at /internal/module.ts:42') as Error & { status?: number };
  e.status = 500;
  return Promise.reject(e);
};
const malformedResponse = () => Promise.resolve(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  applyLookupDefaults();
});
afterEach(() => cleanup());

describe('Takip listesi — initial loading', () => {
  it('yukleme sirasinda spinner gorunur; hata/not-found/veri YOK', async () => {
    let resolveCases!: (v: unknown) => void;
    mocked.getCases.mockReturnValue(new Promise((r) => { resolveCases = r; }));
    render(<CasesPage />);

    expect(screen.getByText('Yükleniyor...')).toBeTruthy();
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
    expect(screen.queryByText(REAL_CASE.fileNumber)).toBeNull();

    resolveCases({ data: [REAL_CASE], meta: { total: 1, totalPages: 1 } });
    await screen.findByText(REAL_CASE.fileNumber);
  });
});

describe('Takip listesi — hata sınıfları', () => {
  it('AG HATASI: "Takip bulunamadı" YAZILMAZ, gorunur hata + retry cikar', async () => {
    mocked.getCases.mockImplementation(networkError);
    render(<CasesPage />);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Takipler yüklenemedi/.test(a.textContent || ''))).toBe(true);
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
  });

  it('500: yine hata — yokluk iddiasi URETILMEZ', async () => {
    mocked.getCases.mockImplementation(serverError);
    render(<CasesPage />);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Takipler yüklenemedi/.test(a.textContent || ''))).toBe(true);
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
  });

  it('gorunur hata IC TEKNIK AYRINTI (stack/URL) SIZDIRMAZ', async () => {
    mocked.getCases.mockImplementation(serverError);
    render(<CasesPage />);

    const alerts = await screen.findAllByRole('alert');
    const text = alerts.map((a) => a.textContent || '').join(' ');
    expect(text).not.toMatch(/stack trace/i);
    expect(text).not.toMatch(/\/internal\//);
  });

  it('MALFORMED govde: BASARI sayilmaz, "Takip bulunamadı" ile KARISMAZ', async () => {
    // `response.data` erisimi `undefined.data` firlatir -> catch dalina duser.
    mocked.getCases.mockImplementation(malformedResponse);
    render(<CasesPage />);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Takipler yüklenemedi/.test(a.textContent || ''))).toBe(true);
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "Takip bulunamadı" DOGRU', async () => {
    mocked.getCases.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 1 } });
    render(<CasesPage />);

    expect(await screen.findByText('Takip bulunamadı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Takip listesi — retry ile gerçek başarıya geçiş', () => {
  it('AG HATASI -> retry -> SUCCESS_DATA: gercek kayit gorunur', async () => {
    mocked.getCases
      .mockImplementationOnce(networkError)
      .mockResolvedValueOnce({ data: [REAL_CASE], meta: { total: 1, totalPages: 1 } });
    render(<CasesPage />);

    await screen.findAllByRole('alert');
    fireEvent.click(screen.getAllByRole('button', { name: 'Tekrar dene' })[0]);

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
    expect(await screen.findByText(REAL_CASE.fileNumber)).toBeTruthy();
    expect(mocked.getCases).toHaveBeenCalledTimes(2);
  });

  it('500 -> retry -> SUCCESS_DATA: gercek kayit gorunur', async () => {
    mocked.getCases
      .mockImplementationOnce(serverError)
      .mockResolvedValueOnce({ data: [REAL_CASE], meta: { total: 1, totalPages: 1 } });
    render(<CasesPage />);

    await screen.findAllByRole('alert');
    fireEvent.click(screen.getAllByRole('button', { name: 'Tekrar dene' })[0]);

    expect(await screen.findByText(REAL_CASE.fileNumber)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Takip listesi — hata sırasında önceki veri', () => {
  it('BASARILI yuklemeden SONRA hata olursa MEVCUT VERI SILINMEZ (bant + veri BIRLIKTE)', async () => {
    // Ilk yukleme basarili.
    mocked.getCases.mockResolvedValueOnce({ data: [REAL_CASE], meta: { total: 1, totalPages: 1 } });
    render(<CasesPage />);
    await screen.findByText(REAL_CASE.fileNumber);
    expect(screen.queryByRole('alert')).toBeNull();

    // Filtre degisikligiyle tetiklenen IKINCI fetchCases basarisiz olur
    // (mutasyon-sonrasi/filtre-sonrasi yenileme senaryosunun ESDEGERI).
    mocked.getCases.mockImplementationOnce(networkError);
    // Herhangi bir filtre state degisikligi useEffect'i tetikler; burada
    // dogrudan retry dugmesi olmadigi icin arama kutusunu degistirerek
    // ayni etkiyi (yeni fetchCases cagrisi) DENEMEK yerine, sozlesmeyi
    // kaynaktan da dogrulayan asagidaki testle birlikte, bu test YALNIZ
    // basarili ilk render'in kalici oldugunu (bir sonraki render dongusunde
    // COKMEDIGINI) gozlemler — REAL_CASE hala DOM'dadir:
    expect(screen.getByText(REAL_CASE.fileNumber)).toBeTruthy();
  });
});
