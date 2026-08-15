import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TebligatPanel } from '../TebligatPanel';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AB-6 — `components/tebligat/TebligatPanel.tsx#loadData` OKUMA
 * HATASI SESSİZCE "HENÜZ TEBLİGAT OLUŞTURULMADI" YA DA BAYAT VERİ GİBİ
 * GÖRÜNMEZ.
 *
 * Erişilebilirlik doğrulandı: `cases/[id]/page.tsx:3081` → `<TebligatCard
 * readOnly={false}>` → `<TebligatPanel>` (bu dosyadan, `@/components/
 * tebligat/TebligatPanel`) — canlı, her zaman render edilen bir zincir.
 * DİKKAT: `TebligatCard` `caseDebtorId` GEÇMİYOR — bu yüzden `priorityCheck`
 * (TK m.10 adres önceliği) dalı ŞU AN canlı çağrıda hiç TETİKLENMİYOR.
 * `caseDebtorId` testleri bu KOD YOLUNUN (component seviyesinde gerçek ve
 * doğru) davranışını kilitler — ileride bir çağıran `caseDebtorId` verirse
 * fail-closed garantisi ZATEN kanıtlanmış olur.
 *
 * Eskiden okuma hatası yalnız `console.error` ile YUTULUYORDU;
 * `tebligatlar`/`summary`/`priorityCheck` state'i HİÇ değişmiyordu.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>;

const TEBLIGAT = {
  id: 't1',
  tebligatType: 'ODEME_EMRI',
  addressType: 'BILINEN',
  addressText: 'Örnek Mah. 1. Sk. No:1',
  recipientName: 'Test Alıcı',
  channel: 'PTT',
  status: 'HAZIRLANDI',
  preparedAt: '2026-06-01T10:00:00.000Z',
};
const SUMMARY = {
  total: 1, hazirlanan: 1, gonderilen: 0, teslimEdilen: 0,
  iadeGelen: 0, tebligEdilmisSayilan: 0, bekleyenIslem: 1,
};
const PRIORITY_MUST_BILINEN = {
  mustUseBilinen: true,
  canUseMernis: false,
  message: 'Önce bilinen adrese tebligat çıkarılmalıdır (TK m.10)',
  previousAttempts: [],
};

const networkError = () => Promise.reject(new Error('network down'));
const statusError = (status: number, message: string) => {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  return Promise.reject(e);
};

function routeApi(overrides: {
  list?: () => unknown;
  summary?: () => unknown;
  priority?: () => unknown;
} = {}) {
  mockedGet.mockImplementation((url: string) => {
    if (url.includes('/tebligat/summary')) {
      return Promise.resolve(overrides.summary ? overrides.summary() : { data: SUMMARY });
    }
    if (url.includes('/tebligat/check-priority')) {
      return Promise.resolve(overrides.priority ? overrides.priority() : { data: null });
    }
    if (url.includes('/tebligat/case')) {
      return Promise.resolve(overrides.list ? overrides.list() : { data: [TEBLIGAT] });
    }
    return Promise.resolve({ data: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  routeApi();
});
afterEach(() => cleanup());

function findLoadAlert(alerts: HTMLElement[]) {
  return alerts.find((a) => /Tebligat verileri yüklenemedi/.test(a.textContent || ''));
}

describe('canlı yol (caseId, TebligatCard davranışıyla aynı) — okuma hatası sınıfları', () => {
  it('başarılı yükleme: gerçek kayıt görünür, hata YOK', async () => {
    render(<TebligatPanel caseId="c1" />);
    expect(await screen.findByText('Test Alıcı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('GERÇEKTEN boş: hata YOK, "Henüz tebligat oluşturulmadı" DOĞRU', async () => {
    routeApi({ list: () => ({ data: [] }) });
    render(<TebligatPanel caseId="c1" />);

    expect(await screen.findByText('Henüz tebligat oluşturulmadı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('AĞ HATASI: "Henüz tebligat oluşturulmadı" YAZILMAZ, görünür hata + retry çıkar', async () => {
    routeApi({ list: networkError });
    render(<TebligatPanel caseId="c1" />);

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findLoadAlert(alerts)).toBeTruthy();
    expect(screen.queryByText('Henüz tebligat oluşturulmadı')).toBeNull();
  });

  it('403: görünür hata çıkar', async () => {
    routeApi({ list: () => statusError(403, 'Yasak') });
    render(<TebligatPanel caseId="c1" />);

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findLoadAlert(alerts)).toBeTruthy();
  });

  it('500: görünür hata çıkar', async () => {
    routeApi({ summary: () => statusError(500, 'Sunucu hatası') });
    render(<TebligatPanel caseId="c1" />);

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findLoadAlert(alerts)).toBeTruthy();
  });

  it('MALFORMED liste gövdesi (dizi değil): görünür hata çıkar, .map() TypeError sızmaz', async () => {
    routeApi({ list: () => ({ data: { notAnArray: true } }) });
    render(<TebligatPanel caseId="c1" />);

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findLoadAlert(alerts)).toBeTruthy();
  });

  it('MALFORMED özet gövdesi (obje değil/null): görünür hata çıkar', async () => {
    routeApi({ summary: () => ({ data: null }) });
    render(<TebligatPanel caseId="c1" />);

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findLoadAlert(alerts)).toBeTruthy();
  });
});

describe('retry — YALNIZ okuma tekrarlanır, mutation ÇAĞRILMAZ', () => {
  it('retry -> SUCCESS_DATA: gerçek kayıt görünür, hata tamamen kalkar, POST hiç ÇAĞRILMAZ', async () => {
    let attempt = 0;
    routeApi({
      list: () => {
        attempt += 1;
        return attempt === 1 ? networkError() : { data: [TEBLIGAT] };
      },
    });
    render(<TebligatPanel caseId="c1" />);

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    const retryBtn = findLoadAlert(alerts)!.querySelector('button')!;
    fireEvent.click(retryBtn);

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 5000 });
    expect(await screen.findByText('Test Alıcı')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('hızlı çift tıklama İKİNCİ isteği başlatmaz (in-flight guard, tek aktif retry)', async () => {
    routeApi({ list: networkError });
    render(<TebligatPanel caseId="c1" />);

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    const retryBtn = findLoadAlert(alerts)!.querySelector('button')!;

    const callsBeforeRetry = mockedGet.mock.calls.filter((c) => String(c[0]).includes('/tebligat/case')).length;
    fireEvent.click(retryBtn);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      const callsAfter = mockedGet.mock.calls.filter((c) => String(c[0]).includes('/tebligat/case')).length;
      expect(callsAfter).toBe(callsBeforeRetry + 1);
    }, { timeout: 5000 });
  });
});

describe('unmount sonrası state güncellemesi engellenir', () => {
  it('yanıt unmount SONRASI gelirse React uyarısı/çökme OLUŞMAZ', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveList: (v: unknown) => void;
    mockedGet.mockImplementation((url: string) => {
      if (url.includes('/tebligat/case')) {
        return new Promise((resolve) => { resolveList = resolve; });
      }
      return Promise.resolve({ data: SUMMARY });
    });

    const { unmount } = render(<TebligatPanel caseId="c1" />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());

    unmount();
    resolveList!({ data: [TEBLIGAT] });
    await new Promise((r) => setTimeout(r, 0));

    const unmountedUpdateWarning = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("Can't perform a React state update on an unmounted component"),
    );
    expect(unmountedUpdateWarning).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('mevcut veri korunur — SONRAKİ okuma hatasında ÖNCEKİ kayıt silinmez', () => {
  it('ilk yükleme başarılı (kayıt görünür) -> caseId değişimiyle tetiklenen 2. okuma BAŞARISIZ -> ÖNCEKİ kayıt EKRANDA KALIR + yeni hata bandı çıkar', async () => {
    let attempt = 0;
    mockedGet.mockImplementation((url: string) => {
      if (url.includes('/tebligat/summary')) return Promise.resolve({ data: SUMMARY });
      if (url.includes('/tebligat/case')) {
        attempt += 1;
        return attempt === 1 ? Promise.resolve({ data: [TEBLIGAT] }) : networkError();
      }
      return Promise.resolve({ data: null });
    });

    const { rerender } = render(<TebligatPanel caseId="c1" />);
    expect(await screen.findByText('Test Alıcı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    // caseId degisimi loadData'yi yeniden tetikler (useEffect deps) — bu turda BASARISIZ.
    rerender(<TebligatPanel caseId="c2" />);

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findLoadAlert(alerts)).toBeTruthy();
    // ÖNCEKİ (başarıyla yüklenmiş) kayıt SİLİNMEDİ — hâlâ ekranda.
    expect(screen.getByText('Test Alıcı')).toBeTruthy();
  });
});

describe('TK m.10 adres önceliği (caseDebtorId) — okunamazsa fail-closed', () => {
  it('priorityCheck BAŞARIYLA yüklenirse mustUseBilinen uygulanır (regresyon-koruma)', async () => {
    routeApi({ priority: () => ({ data: PRIORITY_MUST_BILINEN }) });
    render(<TebligatPanel caseId="c1" caseDebtorId="d1" />);
    await screen.findByText('Test Alıcı');
    // Ana panel BİLE priorityCheck.message'ı gösterir (Adres Öncelik Uyarısı) —
    // modal açılınca AYNI metin ikinci kez basılır, bu yüzden findAllByText.
    await waitFor(async () => {
      expect((await screen.findAllByText(/Önce bilinen adrese tebligat çıkarılmalıdır/)).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByText('Yeni Tebligat').closest('button')!);
    await waitFor(async () => {
      expect((await screen.findAllByText(/Önce bilinen adrese tebligat çıkarılmalıdır/)).length).toBeGreaterThanOrEqual(2);
    });
  });

  it('priorityCheck okuma hatası: "kısıtlama yok" SANILMAZ — fail-closed uyarı + kilit çıkar', async () => {
    routeApi({ priority: networkError });
    render(<TebligatPanel caseId="c1" caseDebtorId="d1" />);
    await screen.findByText('Test Alıcı');

    // Ana okuma hatası bandı çıkar (priority da loadData'nın parçası).
    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findLoadAlert(alerts)).toBeTruthy();

    fireEvent.click(screen.getByText('Yeni Tebligat').closest('button')!);
    expect(
      await screen.findByText(/Adres önceliği kontrolü yüklenemedi; güvenlik için yalnızca bilinen adrese izin veriliyor/),
    ).toBeTruthy();
  });
});
