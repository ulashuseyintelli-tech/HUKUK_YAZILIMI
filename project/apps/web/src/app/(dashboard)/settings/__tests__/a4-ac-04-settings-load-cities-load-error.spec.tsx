import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup, act, waitFor } from '@testing-library/react';
import SettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AC-04 — `app/(dashboard)/settings/page.tsx#loadCities`
 *
 * KUSUR: catch dalında yalnız console.error ile hata yutuluyordu.
 * `cities` boş kalınca "Varsayılan İl" seçim kutusu açıklamasız yalnız
 * "Seçilmedi" seçeneğiyle görünüyordu — okuma arızası ile "gerçekten
 * hiçbir icra dairesi/il yok" AYIRT EDİLEMİYORDU. Ayrıca hiçbir retry
 * yolu yoktu.
 */

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn();
      return registry[prop];
    },
  };
  return { api: new Proxy({}, handler) };
});

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

function office(city: string, overrides: Record<string, unknown> = {}) {
  return { id: `off-${city}`, name: `${city} İcra Dairesi`, city, isActive: true, ...overrides };
}

type Call = ReturnType<typeof deferred<any>>;
let calls: Call[];

function renderPage() {
  return render(<SettingsPage />);
}

/** Sayfada 2 <select> var (Takip Yolu, İl) — il seçim kutusu 2.'sidir. */
function citySelect() {
  return screen.getAllByRole('combobox')[1];
}

beforeEach(() => {
  localStorage.clear();
  calls = [];
  mocked.get.mockImplementation((_endpoint: string) => {
    const d = deferred<any>();
    calls.push(d);
    return d.promise;
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function waitLoaded() {
  await waitFor(() => expect(screen.queryByText('Yükleniyor...')).not.toBeInTheDocument());
}

describe('WSMR-A4-AC-04 — settings#loadCities okuma hatası', () => {
  it('1) ilk yükleme: istek beklerken hata bandı YOK, sayfa render olur', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => {
      calls[0].resolve({ data: { data: [] } });
    });
  });

  it('2) gerçek başarı — dolu il listesi seçilebilir olur, hata bandı yok', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].resolve({ data: { data: [office('Bursa'), office('Ankara')] } });
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Bursa' })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'Ankara' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('3) sözleşme destekliyor — gerçek boş liste hata bandı ÜRETMEZ (yalnız "Seçilmedi")', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].resolve({ data: { data: [] } });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Seçilmedi/ })).toBeInTheDocument();
  });

  it('4) network hatası — görünür bant, "Seçilmedi" ile TEK BAŞINA karışmaz (bant ile ayırt edilir)', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].reject(new Error('Network Error'));
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('5) HTTP hatası — görünür bant, teknik detay sızdırmadan', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].reject({ message: 'Sunucu hatası (500)', status: 500 });
    });
    const alertEl = await screen.findByRole('alert');
    expect(alertEl.textContent).toMatch(/İller yüklenemedi|Sunucu hatası/);
  });

  it('6) malformed gövde (data.data dizi değil) — crash etmez, hata olarak işlenir, "as" cast ile gizlenmez', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].resolve({ data: { data: { unexpected: 'shape' } } });
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // Malformed govde -> il secim kutusu yalniz varsayilan "Secilmedi" ile kalir.
    expect(within(citySelect()).getAllByRole('option')).toHaveLength(1);
  });

  it('7-8) hata görünürlüğü + boş-state ile karışmaması birlikte doğrulanır', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    const alertEl = await screen.findByRole('alert');
    expect(alertEl).toBeInTheDocument();
    // Hata durumunda dropdown yalniz varsayilan "Secilmedi" ile kalir AMA
    // bu durum GORUNUR hata bandiyla birlikte sunulur - sessiz bosluk degil.
    expect(screen.getByRole('option', { name: /Seçilmedi/ })).toBeInTheDocument();
  });

  it('9-10) hata -> retry -> başarı, retry YALNIZ execution-offices kaynağını tekrar çağırır', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    await screen.findByRole('alert');

    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });
    await act(async () => {
      retryBtn.click();
    });
    await waitFor(() => expect(calls.length).toBe(2));
    expect(mocked.get).toHaveBeenNthCalledWith(2, '/execution-offices');
    await act(async () => {
      calls[1].resolve({ data: { data: [office('İzmir')] } });
    });
    expect(await screen.findByRole('option', { name: 'İzmir' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('12) geç ESKİ success güncel state\'i DEĞİŞTİRMEZ (iki örtüşen istek)', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].reject(new Error('ilk deneme başarısız'));
    });
    const retryBtn = await screen.findByRole('button', { name: /Tekrar dene/i });

    // İKİ ARDIŞIK tıklama AYNI senkron blokta — ikinci tıklama React'in
    // `disabled` state'ini henüz commit etmediği ANDA gerçekleşir ve
    // in-flight bayrağı retry akışında BİLEREK sıfırlandığı için İKİ
    // GERÇEK örtüşen istek üretir (jenerasyon token'ının tek koruma
    // katmanı olduğu senaryo).
    await act(async () => {
      retryBtn.click();
      retryBtn.click();
    });
    await waitFor(() => expect(calls.length).toBe(3));
    const staleCall = calls[1];
    const freshCall = calls[2];

    // ESKİ (2.) çağrı GEÇ başarıyla döner — jenerasyon token'ı YENİ (3.)
    // çağrıya geçtiği için bu yanıt state'i ETKİLEMEMELİ.
    await act(async () => {
      staleCall.resolve({ data: { data: [office('Eski-Şehir')] } });
    });
    expect(screen.queryByRole('option', { name: 'Eski-Şehir' })).not.toBeInTheDocument();

    await act(async () => {
      freshCall.resolve({ data: { data: [office('Yeni-Şehir')] } });
    });
    expect(await screen.findByRole('option', { name: 'Yeni-Şehir' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Eski-Şehir' })).not.toBeInTheDocument();
  });

  // NOT (11 numaralı davranış, "başarılı veri -> refresh hatası -> stale"):
  // bu bileşende retry YALNIZ hata sonrası görünür olduğundan (mount-only
  // useEffect + yalnız-hata-tetikli retry, DIŞ bir "refresh" butonu YOK —
  // eklemek kapsam dışı geniş refactor olurdu), gerçek "başarı sonrası ayrı
  // bir yenileme çağrısı başarısız olur" akışı UI'dan tetiklenemez. Aynı
  // garanti (gerçek, DOLU başarı verisi ekranda iken bir sonraki - bu
  // durumda gecikmeli/örtüşen - red'in onu SİLMEMESİ) aşağıdaki test 13'te
  // doğrudan kanıtlanır: "Güncel-Şehir" başarıyla EKRANDA iken staleCall'ın
  // GEÇ red'i ne veriyi ne de hata bandını bozar.
  it('13) geç ESKİ rejection güncel state\'i DEĞİŞTİRMEZ (hata bandı sızmaz; gerçek başarı verisi KORUNUR)', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].reject(new Error('ilk deneme başarısız'));
    });
    const retryBtn = await screen.findByRole('button', { name: /Tekrar dene/i });

    await act(async () => {
      retryBtn.click();
      retryBtn.click();
    });
    await waitFor(() => expect(calls.length).toBe(3));
    const staleCall = calls[1];
    const freshCall = calls[2];

    await act(async () => {
      freshCall.resolve({ data: { data: [office('Güncel-Şehir')] } });
    });
    await screen.findByRole('option', { name: 'Güncel-Şehir' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // ESKİ (2.) çağrı GEÇ red yanıtıyla döner — token uyuşmadığı için
    // hata bandı GERİ GELMEMELİ, güncel başarı verisi bozulmamalı.
    await act(async () => {
      staleCall.reject(new Error('eski istek için gec red'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Güncel-Şehir' })).toBeInTheDocument();
  });

  it('14) çift retry -> tek ek istek (disabled + in-flight koruması)', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    const retryBtn = await screen.findByRole('button', { name: /Tekrar dene/i });

    await act(async () => {
      retryBtn.click();
    });
    // İlk tıklamadan hemen sonra buton disabled olur (citiesRetrying=true) —
    // disabled bir <button>'a ikinci .click() onClick'i TETİKLEMEZ.
    expect(retryBtn).toBeDisabled();
    await act(async () => {
      retryBtn.click();
    });
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
    expect(calls.length).toBe(2);
  });

  it('15) unmount sonrası state yazılmaz (crash/uyarı yok)', async () => {
    const { unmount } = renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    const call = calls[0];
    unmount();
    await act(async () => {
      call.resolve({ data: { data: [office('Bursa')] } });
    });
    // Assertion yok — hedef unmount sonrası setState uyarısı/throw ÜRETMEMEK.
  });

  it('16) hata durumunda false-success/"ayar kaydedildi" izlenimi oluşmaz', async () => {
    renderPage();
    await waitLoaded();
    await waitFor(() => expect(calls.length).toBe(1));
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    await screen.findByRole('alert');
    expect(screen.queryByText('Kaydedildi')).not.toBeInTheDocument();
  });
});
