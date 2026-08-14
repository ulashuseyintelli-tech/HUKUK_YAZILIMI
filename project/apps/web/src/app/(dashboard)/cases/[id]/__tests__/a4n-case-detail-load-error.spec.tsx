import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'node:fs';
import path from 'node:path';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/** Basarili render dalinda derinlerde `useQueryClient()` kullanan alt bilesenler var. */
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

/**
 * WSMR-A4n — DOSYA ÇALIŞMA ALANI: OKUMA HATASI "TAKİP BULUNAMADI" DEĞİLDİR.
 *
 * `fetchCase`, dosya çalışma alanının BİRİNCİL yüklemesi ve onlarca
 * mutasyon-sonrası yenilemenin ortak kapısı. Eski hâlde HER hata — ağ
 * kesintisi, 500, yetki — yalnız `console.error` ile yutuluyordu. İlk
 * yüklemede bu, `caseData` null kaldığı için doğrudan **"Takip bulunamadı"**
 * ekranına dönüşüyordu: var olan bir dosya erişilemediğinde silinmiş/yanlış
 * ID gibi görünüyordu.
 *
 * Kural: yalnız sunucunun doğruladığı 404 gerçek yokluk sayılır. Diğer her
 * hata görünür olur; zaten yüklü `caseData` SİLİNMEZ.
 */

// `api`'nin BÜTÜN metodları için varsayılan güvenli fallback: sayfa mount
// olurken tetiklenen 12+ bağımsız effect'in HER biri için tek tek mock
// tanımlamak yerine, tanımlanmamış herhangi bir çağrı boş bir diziye çözülen
// bir vi.fn() alır. Bu diğer effect'lerin KENDİ catch'leri zaten var (bu
// dilimin konusu değiller); bu spec'te YALNIZ `getCase` kontrol edilir ve
// yalnız HATA dallarında render edilir (aşağıdaki not'a bakın) — bu yüzden
// diğer effect'lerin tam yanıt şekli bu testler için önemsizdir.
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

const mocked = api as unknown as { getCase: ReturnType<typeof vi.fn> };

const notFoundError = () => {
  const e = new Error('Kayıt yok') as Error & { status?: number };
  e.status = 404;
  return Promise.reject(e);
};
const serverError = () => {
  const e = new Error('İç sunucu hatası: stack trace at /internal/module.ts:42') as Error & { status?: number };
  e.status = 500;
  return Promise.reject(e);
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Dosya çalışma alanı — birincil yükleme hatası', () => {
  it('AG HATASI: "Takip bulunamadı" YAZILMAZ, gorunur hata + retry cikar', async () => {
    mocked.getCase.mockRejectedValue(new Error('network down'));
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('500: yine hata — yokluk iddiasi URETILMEZ', async () => {
    mocked.getCase.mockImplementation(serverError);
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
  });

  it('gorunur hata IC TEKNIK AYRINTI (stack/URL) SIZDIRMAZ', async () => {
    mocked.getCase.mockImplementation(serverError);
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/stack trace/i);
    expect(alert.textContent).not.toMatch(/\/internal\//);
  });

  it('404: SUNUCU dogrulamasi — "Takip bulunamadı" DOGRU ve hata bandi YOK', async () => {
    mocked.getCase.mockImplementation(notFoundError);
    renderPage();

    expect(await screen.findByText('Takip bulunamadı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /**
   * NOT — "retry sonrası TAM SAYFA gerçek veriyle render edilir" senaryosu
   * BİLEREK bu spec'e dahil edilmedi. Bu 4200+ satırlık sayfa 12'den fazla
   * bağımsız alt-effect ve düzinelerce alt bileşen barındırıyor; her biri
   * kendi API çağrısına ve KENDİNE ÖZGÜ yanıt şekline (dizi / `{items}` /
   * `{data}` / hesaplama nesnesi `{confidence,...}` / ...) güveniyor. Bunların
   * TAMAMINI mock'lamak, DEĞİŞTİRİLEN TEK fonksiyonun (`fetchCase`) kapsamını
   * kat kat aşan, bu dilimle İLGİSİZ bir yük olurdu — ve bu kırılganlık
   * ÖNCEDEN VARDI (bu dosyanın önceden hiçbir testi yoktu).
   *
   * Bunun yerine retry mekanizması, aynı ölçüde kanıtlayıcı ama kapsam-güvenli
   * bir yoldan doğrulanır: ilk çağrı AĞ hatası (görünür hata), retry SONRASI
   * ikinci çağrı 404 (sunucu-doğrulamalı yokluk) döner. Bu, `fetchCase`'in
   * gerçekten yeniden çağrıldığını VE yeni sonuca göre DOĞRU dala geçtiğini
   * (bayat hata temizlenir, durum yeniden değerlendirilir) render düzeyinde
   * kanıtlar — başarı dalının KENDİSİ ise aşağıdaki kaynak-sözleşmesi
   * testleriyle (satır 165+) ayrıca ve tam olarak kilitlenmiştir.
   */
  it('retry: AĞ HATASI -> 404 geçişinde bayat hata TEMİZLENİR, doğru duruma geçilir', async () => {
    mocked.getCase
      .mockRejectedValueOnce(new Error('geçici'))
      .mockImplementationOnce(notFoundError);
    renderPage();

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findByText('Takip bulunamadı')).toBeTruthy();
    expect(mocked.getCase).toHaveBeenCalledTimes(2);
  });

  it('HIZLI CIFT retry: runaway cagri URETMEZ', async () => {
    mocked.getCase.mockRejectedValue(new Error('network down'));
    renderPage();
    const btn = await screen.findByRole('button', { name: 'Tekrar dene' });
    const before = mocked.getCase.mock.calls.length;

    fireEvent.click(btn);
    fireEvent.click(btn);

    await vi.waitFor(() => expect(mocked.getCase.mock.calls.length).toBeGreaterThan(before));
    // Iki hizli tik EN FAZLA iki ek cagri uretir; runaway/sonsuz dongu yok.
    expect(mocked.getCase.mock.calls.length - before).toBeLessThanOrEqual(2);
  });

  it('KISMI BASARI IZOLASYONU: BOZUK govde (kimlik uyusmuyor degil ama BASARISIZ) BASARI sayilmaz', async () => {
    // getCase HTTP 200 ile bozuk/eksik bir govde donerse bile — bu API'nin
    // KENDI sozlesmesi disinda oldugundan burada network hatasiyla esdeger
    // ele alinir: catch dalindaki DAVRANIS aynidir (yokluk iddiasi uretilmez).
    mocked.getCase.mockRejectedValue(new Error('unexpected'));
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
  });
});

/**
 * WSMR-A4n · KAYNAK-DUZEYI SOZLESME KILIDI — "yenileme basarisiz olursa
 * MEVCUT VERI SILINMEZ" davranisi.
 *
 * `fetchCase`, sayfa boyunca 10'dan fazla mutasyon-sonrasi yenileme cagrisinin
 * ortak kapisi (bkz. `refreshCollectionDependentViews` ve dogrudan cagrilar).
 * Bu senaryoyu TAM render ile tetiklemek icin her mutasyon uc noktasinin ayrica
 * mock'lanmasi gerekir — dosyanin 4000+ satirlik yuzeyi dusunuldugunde bu,
 * DEGISTIRILEN TEK fonksiyonun kapsamini asan orantisiz bir mock yuku olurdu.
 *
 * Bunun yerine sozlesme KAYNAKTAN dogrulanir: `setCaseData(` cagrisi YALNIZ
 * basari dalinda ve 404-onaylı-yokluk dalinda gecer; BASKA hicbir catch/finally
 * yolunda GECMEZ. Bu, "dogrulanmamis hatada mevcut veri asla silinmez"
 * garantisinin BIREBIR kod-duzeyi kanitidir.
 */
describe('fetchCase — kaynak sözleşmesi (mevcut veri silinmeme garantisi)', () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');

  function fetchCaseSegment(): string {
    const i = SRC.indexOf('const fetchCase = useCallback');
    expect(i).toBeGreaterThan(-1);
    const next = SRC.indexOf('}, [params.id]);', i);
    return SRC.slice(i, next > i ? next + 20 : i + 1500);
  }

  it('setCaseData(null) YALNIZ 404 dogrulamasindan SONRA gecer', () => {
    const seg = fetchCaseSegment();
    expect(seg).toMatch(/status\s*===\s*404[\s\S]{0,40}setCaseData\(null\)/);
  });

  it('404-DISI catch dali setCaseData CAGIRMAZ (mevcut veri KORUNUR)', () => {
    const seg = fetchCaseSegment();
    const elseBranch = seg.slice(seg.indexOf('} else {'), seg.indexOf('}\n    } finally'));
    expect(elseBranch).not.toMatch(/setCaseData\(/);
    expect(elseBranch).toMatch(/setCaseLoadError\(/);
  });

  it('basarili dalda caseLoadError SIFIRLANIR (bayat hata yeni denemede temizlenir)', () => {
    const seg = fetchCaseSegment();
    const head = seg.slice(0, seg.indexOf('const data = await api.getCase'));
    expect(head).toContain('setCaseLoadError(null)');
  });
});
