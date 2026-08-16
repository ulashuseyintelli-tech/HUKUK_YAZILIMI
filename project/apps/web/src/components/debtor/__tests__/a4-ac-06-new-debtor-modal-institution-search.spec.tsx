import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup, act, fireEvent } from '@testing-library/react';
import { NewDebtorModal } from '../NewDebtorModal';
import { DebtorType } from '@/types/debtor';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AC-06 — `components/debtor/NewDebtorModal.tsx` (Kamu Kurumu
 * adı/DETSİS otomatik tamamlama arama yolu, `PublicInstitutionFields`
 * içindeki `timer`/`runSearch`).
 *
 * KUSUR: catch dalında yalnız console.error ile hata yutuluyordu — arama
 * hatası "Sonuç bulunamadı. Manuel olarak girebilirsiniz." (GERÇEK boşlukla
 * AYNI) ile ayırt edilemiyordu. Jenerasyon token'ı olmadan ESKİ sorgunun
 * geç gelen yanıtı YENİ sorgunun sonucunu ezebiliyordu.
 *
 * ÜRÜN KARARI (repository kanıtı): otomatik tamamlama TAMAMEN opsiyonel/
 * yardımcıdır — "Kurum Adı" manuel girişi bağımsız her zaman kullanılabilir
 * bir alandır (submitDebtor'da yalnız institutionName zorunlu, DETSİS
 * ZORUNLU DEĞİL). Arama hatası bu yüzden manuel girişi ASLA bloklamaz.
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

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function institution(name: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `inst-${name}`,
    detsisNo: `DETSIS-${name}`,
    name,
    category: 'BAKANLIK',
    city: 'Ankara',
    ...overrides,
  };
}

type Call = { url: string; d: ReturnType<typeof deferred<any>> };
let calls: Call[];

function primeGet() {
  mocked.get.mockImplementation((url: string) => {
    const d = deferred<any>();
    calls.push({ url: String(url), d });
    return d.promise;
  });
}

function renderModal() {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const result = render(
    <NewDebtorModal initialType={DebtorType.PUBLIC_INSTITUTION} onSave={onSave} onClose={onClose} />,
  );
  return { ...result, onSave, onClose };
}

function searchInput() {
  return screen.getByPlaceholderText('Kurum adı veya DETSİS no yazın...');
}

async function typeQuery(text: string) {
  fireEvent.change(searchInput(), { target: { value: text } });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  calls = [];
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeGet();
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

describe('WSMR-A4-AC-06 — NewDebtorModal kamu kurumu/DETSİS otomatik tamamlama', () => {
  it('1) modal açılışında IDLE — istek yok, dropdown yok', () => {
    renderModal();
    expect(calls.length).toBe(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('2) minimum karakter altındaki input arama YAPMAZ', async () => {
    renderModal();
    await typeQuery('a');
    await advance(500);
    expect(calls.length).toBe(0);
  });

  it('3) debounce süresinden ÖNCE endpoint çağrılmaz', async () => {
    renderModal();
    await typeQuery('ma');
    await advance(200);
    expect(calls.length).toBe(0);
  });

  it('4) debounce sonrasında EXACT sorguyla çağrı yapılır', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('/public-institutions/search?q=maliye&limit=15');
  });

  it('5) başarılı DOLU sonuç render edilir', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.resolve({ data: [institution('Maliye Bakanlığı')] });
    });
    expect(screen.getByText('Maliye Bakanlığı')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('6) sözleşme destekliyor — gerçek boş sonuç "Sonuç bulunamadı" gösterir, hata bandı YOK', async () => {
    renderModal();
    await typeQuery('xyzxyz');
    await advance(300);
    await act(async () => {
      calls[0].d.resolve({ data: [] });
    });
    expect(screen.getByText(/Sonuç bulunamadı/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('7) network hatası — görünür bant üretir', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.reject(new Error('Network Error'));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('8) HTTP hatası — görünür bant, teknik detay sızdırmadan', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.reject({ message: 'Sunucu hatası (500)', status: 500 });
    });
    const alertEl = screen.getByRole('alert');
    expect(alertEl.textContent).toMatch(/Kamu kurumu araması yapılamadı|Sunucu hatası/);
  });

  it('9) malformed gövde crash etmez, hata olarak işlenir', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.resolve({ data: { not: 'array' } });
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('10-11) hata görünürlüğü + "Sonuç bulunamadı" ile ASLA KARIŞMAZ', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.reject(new Error('boom'));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/Sonuç bulunamadı/)).not.toBeInTheDocument();
  });

  it('12) yeni input yazıldığında ESKİ bekleyen timer iptal edilir (yalnız SON sorgu çağrılır)', async () => {
    renderModal();
    await typeQuery('ma');
    await advance(150); // debounce tamamlanmadan
    await typeQuery('mal');
    await advance(150); // ilk timer'ın orijinal 300ms'i burada dolardı ama iptal edildi
    expect(calls.length).toBe(0); // henüz "mal" için de 300ms dolmadı
    await advance(150); // "mal" için toplam 300ms tamamlandı
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain('q=mal&');
  });

  it('13-14) A sorgusu -> B sorgusu geçişi, geç ESKİ (A) success YENİ (B) sonucunu DEĞİŞTİRMEZ', async () => {
    renderModal();
    await typeQuery('ankara');
    await advance(300);
    expect(calls.length).toBe(1);
    const callA = calls[0];

    await typeQuery('istanbul');
    await advance(300);
    expect(calls.length).toBe(2);
    const callB = calls[1];

    // B ÖNCE başarıyla döner (gerçek, güncel sonuç).
    await act(async () => {
      callB.d.resolve({ data: [institution('İstanbul Valiliği')] });
    });
    expect(screen.getByText('İstanbul Valiliği')).toBeInTheDocument();

    // A GEÇ başarıyla döner — jenerasyon token'ı UYUŞMADIĞI için bu yanıt
    // ATLANMALI, B'nin güncel sonucu BOZULMAMALI.
    await act(async () => {
      callA.d.resolve({ data: [institution('Ankara Büyükşehir')] });
    });
    expect(screen.queryByText('Ankara Büyükşehir')).not.toBeInTheDocument();
    expect(screen.getByText('İstanbul Valiliği')).toBeInTheDocument();
  });

  it('15) geç ESKİ (A) rejection YENİ (B) state\'ini DEĞİŞTİRMEZ (hata bandı sızmaz)', async () => {
    renderModal();
    await typeQuery('ankara');
    await advance(300);
    const callA = calls[0];

    await typeQuery('istanbul');
    await advance(300);
    const callB = calls[1];

    await act(async () => {
      callB.d.resolve({ data: [institution('İstanbul Valiliği')] });
    });
    expect(screen.getByText('İstanbul Valiliği')).toBeInTheDocument();

    await act(async () => {
      callA.d.reject(new Error('A için geç red'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('İstanbul Valiliği')).toBeInTheDocument();
  });

  it('16) input minimum karakter altına indiğinde ESKİ sonuçlar temizlenir + geç gelen ESKİ yanıt yazılmaz', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    const callA = calls[0];
    await act(async () => {
      callA.d.resolve({ data: [institution('Maliye Bakanlığı')] });
    });
    expect(screen.getByText('Maliye Bakanlığı')).toBeInTheDocument();

    await typeQuery('m'); // minimum karakterin altına indi
    expect(screen.queryByText('Maliye Bakanlığı')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('17) input tamamen temizlendiğinde sonuç/hata/loading temizlenir', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.reject(new Error('boom'));
    });
    screen.getByRole('alert');

    await typeQuery('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sonuç bulunamadı/)).not.toBeInTheDocument();
  });

  it('18) aynı sorgu için çift retry -> tek ek istek (disabled + in-flight koruması)', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.reject(new Error('boom'));
    });
    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });

    await act(async () => {
      retryBtn.click();
    });
    expect(retryBtn).toBeDisabled();
    await act(async () => {
      retryBtn.click();
    });
    expect(calls.length).toBe(2); // yalnız 1 ek istek (ilk hata + 1 retry)
  });

  it('19-20) hata -> retry -> başarı, retry YALNIZ exact sorguyu çağırır (mutation TETİKLENMEZ)', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.reject(new Error('boom'));
    });
    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });

    await act(async () => {
      retryBtn.click();
    });
    expect(calls.length).toBe(2);
    expect(calls[1].url).toBe('/public-institutions/search?q=maliye&limit=15');
    expect(mocked.post).not.toHaveBeenCalled();
    expect(mocked.put).not.toHaveBeenCalled();

    await act(async () => {
      calls[1].d.resolve({ data: [institution('Maliye Bakanlığı')] });
    });
    expect(screen.getByText('Maliye Bakanlığı')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('21) sonuç seçimi doğru kurum adını ve DETSİS değerini forma yazar', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.resolve({ data: [institution('Maliye Bakanlığı', { detsisNo: '123456' })] });
    });
    const resultBtn = screen.getByText('Maliye Bakanlığı').closest('button')!;
    await act(async () => {
      resultBtn.click();
    });

    const nameInput = screen.getByDisplayValue('Maliye Bakanlığı') as HTMLInputElement;
    expect(nameInput).toBeInTheDocument();
    const detsisInput = screen.getByPlaceholderText('detsis.gov.tr') as HTMLInputElement;
    expect(detsisInput.value).toBe('123456');
  });

  it('22) arama hatası borçlu-oluşturuldu/false-success izlenimi ÜRETMEZ', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.reject(new Error('boom'));
    });
    screen.getByRole('alert');
    expect(mocked.post).not.toHaveBeenCalled();
    expect(mocked.put).not.toHaveBeenCalled();
    // Kaydet butonu hala mevcut/modal kapanmadı.
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeInTheDocument();
  });

  it('23-24-26) modal kapanırken (unmount) pending timer çalışmaz, pending response state yazmaz, uyarı/hata üretmez', async () => {
    const { unmount } = renderModal();
    await typeQuery('maliye');
    await advance(300);
    const call = calls[0];
    unmount();
    // Unmount SONRASI hem hâlâ bekleyen bir timer (yoktu, zaten ateşlendi)
    // hem de in-flight isteğin GEÇ yanıtı state yazmaya ÇALIŞMAMALI.
    await act(async () => {
      call.d.resolve({ data: [institution('Maliye Bakanlığı')] });
    });
    // Assertion yok — hedef unmount sonrası setState uyarısı/throw ÜRETMEMEK.
  });

  it('25) tip değişip geri dönünce (remount) önceki arama state\'i TAŞINMAZ', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.resolve({ data: [institution('Maliye Bakanlığı')] });
    });
    expect(screen.getByText('Maliye Bakanlığı')).toBeInTheDocument();

    // Başka bir türe geç (PublicInstitutionFields UNMOUNT olur) sonra geri dön.
    const companyBtn = screen.getByRole('button', { name: /Tüzel Kişi/i });
    await act(async () => {
      companyBtn.click();
    });
    const institutionBtn = screen.getByRole('button', { name: /Kamu Kurumu/i });
    await act(async () => {
      institutionBtn.click();
    });

    expect(screen.queryByText('Maliye Bakanlığı')).not.toBeInTheDocument();
    expect((searchInput() as HTMLInputElement).value).toBe('');
    expect(calls.length).toBe(1); // yeniden mount otomatik arama TETİKLEMEDİ
  });

  it('27) manuel giriş, arama hatası sırasında dahi bağımsız ve engelsiz çalışır', async () => {
    renderModal();
    await typeQuery('maliye');
    await advance(300);
    await act(async () => {
      calls[0].d.reject(new Error('boom'));
    });
    screen.getByRole('alert');

    // "Kurum Adı" manuel alanı: label'ın kardeşi olan input üzerinden erişilir.
    const nameLabel = screen.getByText('Kurum Adı', { exact: false });
    const nameField = nameLabel.parentElement!.querySelector('input') as HTMLInputElement;
    fireEvent.change(nameField, { target: { value: 'Elle Girilen Kurum' } });
    expect(nameField.value).toBe('Elle Girilen Kurum');
    // Hata bandı hâlâ orada, manuel girişi ENGELLEMEDİ.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
