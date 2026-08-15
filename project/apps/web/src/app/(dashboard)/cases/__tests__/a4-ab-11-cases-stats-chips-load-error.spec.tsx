import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import CasesPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AB-11 — TAKİP LİSTESİ: "SAHİPSİZ" / "HUKUKİ SORUMLU AVUKAT EKSİK" UYUM
 * ROZETLERİ OKUMA HATASINDA SESSİZCE 0 GÖSTERMEZ.
 *
 * `fetchCases` içinde `/cases/stats` eskiden satır-içi
 * `.then(...).catch(() => {})` ile çağrılıyordu — okuma hatası TAMAMEN
 * yutuluyordu. Bu iki rozet (SAHİPSİZ-DOSYALAR-G1b / WP-3a) uyum-izleme
 * göstergeleridir; sessizce 0'da kalmaları, gerçek bir backend arızasını
 * "hiç sahipsiz/eksik dosya yok" gibi göstererek GERÇEK bir uyum sorununu
 * gizleyebilir.
 *
 * Kural: okuma hatası görünür + yalnız BU kaynağa (fetchStats) retry sunar;
 * gerçek sıfır ("0") ile "bilinmiyor" (rozet numarasız) hiçbir zaman
 * KARIŞMAZ; önceki başarılı sayaç bir SONRAKİ okuma başarısız olursa
 * SİLİNMEZ (bayat olarak korunur).
 *
 * NOT: `api.get`'in `/cases/stats` dönüş şekli (`{ data: { ownerless, legalResponsibleMissing } }`)
 * ve genel mock kurulumu `a4o-cases-list-load-error.spec.tsx` (WSMR-A4o) ile AYNI kaynaktan
 * miras alınır — bu dilim ana `fetchCases`/`getCases` sözleşmesini yeniden doğrulamaz.
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

const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  type: 'ICRA',
  status: 'ACTIVE',
  debtors: [],
  createdAt: '2026-08-01T10:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lookup kaynakları (WSMR-A4k kapsamı) — bu dilimde HEP başarılı döner. */
function applyLookupDefaults(statsImpl?: (url: string) => Promise<any>) {
  mocked.getLawyers.mockResolvedValue([]);
  mocked.getCases.mockResolvedValue({ data: [REAL_CASE], meta: { total: 1, totalPages: 1 } });
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/cases/stats')) {
      return statsImpl ? statsImpl(u) : Promise.resolve({ data: { ownerless: 3, legalResponsibleMissing: 2 } });
    }
    if (u.startsWith('/clients')) return Promise.resolve({ data: { data: [] } });
    if (u.startsWith('/staff')) return Promise.resolve({ data: { data: [] } });
    if (u.startsWith('/lookups')) return Promise.resolve({ data: { data: { risk: [], asama: [] } } });
    if (u.startsWith('/execution-offices')) return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
  });
}

const networkError = () => Promise.reject(new Error('network down'));
const serverError = () => Promise.reject(Object.assign(new Error('sunucu hatası'), { status: 500 }));

/**
 * Sayfada BAŞKA hızlı-filtre chip'leri de (durum/tür filtreleri) aynı rakamları
 * (0/1/9 vb.) tesadüfen taşıyabilir — page-wide `getByText('N')` BELİRSİZ olur.
 * Bu yardımcı, YALNIZ etiketiyle eşleşen chip düğmesinin KENDİ rozet span'ini okur.
 * Rozet YOKSA (count===undefined -> QuickFilterChip hiç basmaz) `null` döner.
 */
function chipBadge(label: string): string | null {
  const labelSpan = screen.getByText(label);
  const button = labelSpan.closest('button');
  if (!button) throw new Error(`chip button not found for label: ${label}`);
  const spans = button.querySelectorAll('span');
  // spans[0] = label span; spans[1] (varsa) = rozet span'i.
  return spans.length > 1 ? spans[1].textContent : null;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe('Takip listesi — uyum rozetleri (Sahipsiz / Hukuki Sorumlu Avukat Eksik) başarı', () => {
  it('[1] ilk yükleme başarılı: gerçek sayaçlar (3 / 2) rozet olarak render edilir, hata YOK', async () => {
    applyLookupDefaults();
    render(<CasesPage />);
    await screen.findByText(REAL_CASE.fileNumber);
    await waitFor(() => expect(chipBadge('Sahipsiz')).toBe('3'));
    expect(chipBadge('Hukuki Sorumlu Avukat Eksik')).toBe('2');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('[2] gerçek sıfır (0/0) doğru render edilir — hata bandıyla KARIŞMAZ', async () => {
    applyLookupDefaults(() => Promise.resolve({ data: { ownerless: 0, legalResponsibleMissing: 0 } }));
    render(<CasesPage />);
    await screen.findByText(REAL_CASE.fileNumber);
    await waitFor(() => expect(chipBadge('Sahipsiz')).toBe('0'));
    expect(chipBadge('Hukuki Sorumlu Avukat Eksik')).toBe('0');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Takip listesi — uyum rozetleri okuma hatası', () => {
  it('[3] network hatası: rozetler numarasız kalır (sahte "0" YOK), görünür ERROR + retry', async () => {
    applyLookupDefaults(networkError);
    render(<CasesPage />);
    await screen.findByText(REAL_CASE.fileNumber);

    const alert = await screen.findByRole('alert');
    expect(/Uyum sayaçları yüklenemedi/.test(alert.textContent || '')).toBe(true);
    // Rozetler render edilir ama SAYI YOK (undefined -> QuickFilterChip rozet basmaz).
    expect(chipBadge('Sahipsiz')).toBeNull();
    expect(chipBadge('Hukuki Sorumlu Avukat Eksik')).toBeNull();
  });

  it('[4] 500 hatası: aynı şekilde görünür ERROR, sahte sayaç YOK', async () => {
    applyLookupDefaults(serverError);
    render(<CasesPage />);
    await screen.findByText(REAL_CASE.fileNumber);
    await screen.findByRole('alert');
    expect(chipBadge('Sahipsiz')).toBeNull();
    expect(chipBadge('Hukuki Sorumlu Avukat Eksik')).toBeNull();
  });

  it('[5] malformed gövde (data yok) → ERROR sayılır, çökme YOK', async () => {
    applyLookupDefaults(() => Promise.resolve({ notData: true }));
    render(<CasesPage />);
    await screen.findByText(REAL_CASE.fileNumber);
    await screen.findByRole('alert');
  });

  it('[6] retry başarı: hata kalkar, gerçek sayaçlar render edilir', async () => {
    let call = 0;
    applyLookupDefaults((u) => {
      if (u.startsWith('/cases/stats')) {
        call++;
        return call === 1 ? networkError() : Promise.resolve({ data: { ownerless: 5, legalResponsibleMissing: 1 } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    render(<CasesPage />);
    await screen.findByText(REAL_CASE.fileNumber);
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(chipBadge('Sahipsiz')).toBe('5');
    expect(chipBadge('Hukuki Sorumlu Avukat Eksik')).toBe('1');
  });

  it('[7] retry YALNIZ /cases/stats kaynağını çağırır — getCases TEKRAR çağrılmaz', async () => {
    applyLookupDefaults(networkError);
    render(<CasesPage />);
    await screen.findByText(REAL_CASE.fileNumber);
    await screen.findByRole('alert');

    const getCasesCallsBefore = mocked.getCases.mock.calls.length;
    const statsCallsBefore = mocked.get.mock.calls.filter((c) => String(c[0]).startsWith('/cases/stats')).length;

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    await waitFor(() =>
      expect(mocked.get.mock.calls.filter((c) => String(c[0]).startsWith('/cases/stats')).length).toBe(
        statsCallsBefore + 1,
      ),
    );
    // Ana takip listesi kaynağı (getCases) YENİDEN ÇAĞRILMADI — yalnız stats retry edildi.
    expect(mocked.getCases.mock.calls.length).toBe(getCasesCallsBefore);
  });
});

describe('Takip listesi — uyum rozetleri hata sırasında önceki sayaç', () => {
  it('[8] başarılı sayaç sonrası filtre-tetikli yenileme başarısız olursa ÖNCEKİ sayaç KORUNUR + bayat bandı', async () => {
    let call = 0;
    applyLookupDefaults((u) => {
      if (u.startsWith('/cases/stats')) {
        call++;
        return call === 1
          ? Promise.resolve({ data: { ownerless: 4, legalResponsibleMissing: 0 } })
          : networkError();
      }
      return Promise.resolve({ data: { data: [] } });
    });
    render(<CasesPage />);
    await screen.findByText(REAL_CASE.fileNumber);
    await waitFor(() => expect(chipBadge('Sahipsiz')).toBe('4'));
    expect(screen.queryByRole('alert')).toBeNull();

    // "Sahipsiz" chip'e tıklamak filters.noOwner'ı değiştirir -> useEffect fetchCases'i
    // YENİDEN tetikler -> fetchStats İKİNCİ kez çağrılır ve bu kez BAŞARISIZ olur.
    fireEvent.click(screen.getByText('Sahipsiz'));

    await screen.findByRole('alert');
    // ÖNCEKİ sayaç (4) HÂLÂ ekranda — SİLİNMEDİ, yalnız bayat olduğu bantta belirtildi.
    expect(chipBadge('Sahipsiz')).toBe('4');
    expect(screen.getByText(/bayat olabilir/)).toBeTruthy();
  });
});

describe('Takip listesi — uyum rozetleri jenerasyon/unmount güvenliği', () => {
  it('[9] geç gelen ESKİ yanıt YENİ state\'i ezmez (jenerasyon token)', async () => {
    const d1 = deferred<any>();
    let call = 0;
    applyLookupDefaults((u) => {
      if (u.startsWith('/cases/stats')) {
        call++;
        // call 1 = ESKİ (geç gelecek, bayat) — call 2 = YENİ (hemen döner, KAZANMALI).
        return call === 1
          ? d1.promise
          : Promise.resolve({ data: { ownerless: 9, legalResponsibleMissing: 6 } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    render(<CasesPage />);
    await screen.findByText(REAL_CASE.fileNumber);

    // İlk fetchStats (call 1) HENÜZ çözülmeden, filtre değişimiyle İKİNCİ bir
    // fetchCases -> fetchStats (call 2) tetiklenir ve bu HEMEN başarıyla döner.
    fireEvent.click(screen.getByText('Sahipsiz'));
    await waitFor(() => expect(chipBadge('Sahipsiz')).toBe('9'));
    expect(chipBadge('Hukuki Sorumlu Avukat Eksik')).toBe('6');

    // Şimdi call 1'in GECİKMİŞ (ESKİ: 2/3) yanıtı çözülüyor — daha YENİ (9/6)
    // state'i EZMEMELİ.
    d1.resolve({ data: { ownerless: 2, legalResponsibleMissing: 3 } });
    await new Promise((r) => setTimeout(r, 0));
    expect(chipBadge('Sahipsiz')).toBe('9');
    expect(chipBadge('Hukuki Sorumlu Avukat Eksik')).toBe('6');
  });

  it('[10] unmount sonrası gecikmeli yanıt state güncellemesi/unhandled rejection ÜRETMEZ', async () => {
    const rejections: unknown[] = [];
    const onUnhandledRejection = (err: unknown) => rejections.push(err);
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      const d = deferred<any>();
      applyLookupDefaults(() => d.promise);
      const { unmount } = render(<CasesPage />);
      await screen.findByText(REAL_CASE.fileNumber);
      unmount();
      d.resolve({ data: { ownerless: 7, legalResponsibleMissing: 7 } });
      await new Promise((r) => setTimeout(r, 0));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});
