import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import TasksPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AC-05 — `app/(dashboard)/tasks/page.tsx#loadLookups`
 *
 * KUSUR: `Promise.all([api.get('/cases?limit=100'), api.get('/users')])` +
 * yalnız `console.error` ile HER İKİ kaynak da SESSİZCE boş kalıyordu.
 * `cases`/`users` BAĞIMSIZDIR (ayrı, OPSİYONEL <select> alanlarını besler —
 * `handleSave`'de `caseId`/`assigneeId` ikisi de `undefined` gidebilir, TEK
 * zorunlu alan `title`'dir) — bu yüzden bir kaynağın hatası diğerinin
 * başarılı verisini SİLMEMELİ ve hangi kaynağın hata verdiği AYRI AYRI
 * görünür olmalı (kısmi başarı desteklenir — WSMR-A4l `cases/new/page.tsx
 * #loadExistingData` emsaliyle aynı bağımsız-kaynak ilkesi).
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

function caseItem(fileNumber: string, overrides: Record<string, unknown> = {}) {
  return { id: `case-${fileNumber}`, fileNumber, ...overrides };
}
function userItem(name: string, surname: string, overrides: Record<string, unknown> = {}) {
  return { id: `user-${name}`, name, surname, ...overrides };
}

type Call = { url: string; d: ReturnType<typeof deferred<any>> };
let calls: Call[];

function callsFor(prefix: string) {
  return calls.filter((c) => c.url.startsWith(prefix));
}

function primeGet() {
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/tasks')) return Promise.resolve({ data: { data: [] } });
    const d = deferred<any>();
    calls.push({ url: u, d });
    return d.promise;
  });
}

function renderPage() {
  return render(<TasksPage />);
}

async function openModal() {
  const btn = screen.getByRole('button', { name: /^Yeni Görev$/ });
  await act(async () => {
    fireEvent.click(btn);
  });
}

/**
 * Modalda 4 <select> var: Durum, Öncelik, İlgili Dosya, Atanan Kişi (bu
 * sırayla). Lookup'ları besleyen ikisi son iki indeks (2, 3).
 */
function lookupSelects() {
  const all = screen.getAllByRole('combobox');
  return { caseSel: all[2], userSel: all[3] };
}

beforeEach(() => {
  calls = [];
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeGet();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WSMR-A4-AC-05 — tasks#loadLookups okuma hatası', () => {
  it('1) ilk yükleme: istekler beklerken hata bandı YOK', async () => {
    renderPage();
    await screen.findByRole('button', { name: /^Yeni Görev$/ });
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await openModal();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => {
      callsFor('/cases')[0].d.resolve({ data: { data: [] } });
      callsFor('/users')[0].d.resolve({ data: { data: [] } });
    });
  });

  it('2) her iki kaynağın da başarılı DOLU sonucu', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.resolve({ data: { data: [caseItem('2026/1')] } });
      callsFor('/users')[0].d.resolve({ data: { data: [userItem('Ahmet', 'Yılmaz')] } });
    });
    await openModal();
    const { caseSel, userSel } = lookupSelects();
    expect(within(caseSel).getByRole('option', { name: '2026/1' })).toBeInTheDocument();
    expect(within(userSel).getByRole('option', { name: 'Ahmet Yılmaz' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('3) sözleşme destekliyor — gerçek boş sonuç hata bandı ÜRETMEZ', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.resolve({ data: { data: [] } });
      callsFor('/users')[0].d.resolve({ data: { data: [] } });
    });
    await openModal();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const { caseSel, userSel } = lookupSelects();
    expect(within(caseSel).getAllByRole('option')).toHaveLength(1);
    expect(within(userSel).getAllByRole('option')).toHaveLength(1);
  });

  it('4) cases — network hatası görünür bant üretir', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.reject(new Error('Network Error'));
      callsFor('/users')[0].d.resolve({ data: { data: [] } });
    });
    await openModal();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('5) cases — HTTP hatası görünür bant, teknik detay sızdırmadan', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.reject({ message: 'Sunucu hatası (500)', status: 500 });
      callsFor('/users')[0].d.resolve({ data: { data: [] } });
    });
    await openModal();
    const alertEl = await screen.findByRole('alert');
    expect(alertEl.textContent).toMatch(/Dosyalar yüklenemedi|Sunucu hatası/);
  });

  it('6) cases — malformed gövde crash etmez, hata olarak işlenir', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.resolve({ data: { data: { not: 'array' } } });
      callsFor('/users')[0].d.resolve({ data: { data: [] } });
    });
    await openModal();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('7) users — network hatası görünür bant üretir', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.resolve({ data: { data: [] } });
      callsFor('/users')[0].d.reject(new Error('Network Error'));
    });
    await openModal();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('8) users — HTTP hatası görünür bant', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.resolve({ data: { data: [] } });
      callsFor('/users')[0].d.reject({ message: 'Sunucu hatası (500)', status: 500 });
    });
    await openModal();
    const alertEl = await screen.findByRole('alert');
    expect(alertEl.textContent).toMatch(/Kullanıcılar yüklenemedi|Sunucu hatası/);
  });

  it('9) users — malformed gövde crash etmez, hata olarak işlenir', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.resolve({ data: { data: [] } });
      callsFor('/users')[0].d.resolve({ data: { data: null } });
    });
    await openModal();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('10) tam hata görünürlüğü + sahte empty-state ile karışmama (aynı anda İKİ hata)', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.reject(new Error('cases boom'));
      callsFor('/users')[0].d.reject(new Error('users boom'));
    });
    await openModal();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(2);
    // Her iki secim kutusu da yalniz "Seciniz" ile kalir AMA bu durum
    // GORUNUR iki ayri hata bandiyla birlikte sunulur - sessiz bosluk degil.
    const { caseSel, userSel } = lookupSelects();
    expect(within(caseSel).getAllByRole('option')).toHaveLength(1);
    expect(within(userSel).getAllByRole('option')).toHaveLength(1);
  });

  it('11) kısmi başarı — cases BAŞARISIZ iken users BAŞARILI verisi KORUNUR (ve tersi)', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.reject(new Error('cases boom'));
      callsFor('/users')[0].d.resolve({ data: { data: [userItem('Ahmet', 'Yılmaz')] } });
    });
    await openModal();
    const { caseSel, userSel } = lookupSelects();
    // cases hatalı: yalniz "Seciniz" + hata bandi
    expect(within(caseSel).getAllByRole('option')).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    // users BASARILI: cases'in hatasi users'in verisini SILMEMIS
    expect(within(userSel).getByRole('option', { name: 'Ahmet Yılmaz' })).toBeInTheDocument();
  });

  it('12) hata varken form YALNIZ title ile GÜVENLE kaydedilebilir (eksik lookup formu bloklamaz)', async () => {
    mocked.post.mockResolvedValueOnce({ data: {} });
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.reject(new Error('cases boom'));
      callsFor('/users')[0].d.reject(new Error('users boom'));
    });
    await openModal();
    await screen.findAllByRole('alert');

    const titleInput = screen.getByPlaceholderText('Görev başlığı');
    fireEvent.change(titleInput, { target: { value: 'Yeni görev' } });
    const saveBtn = screen.getByRole('button', { name: /Kaydet/i });
    expect(saveBtn).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    await waitFor(() =>
      expect(mocked.post).toHaveBeenCalledWith(
        '/tasks',
        expect.objectContaining({ title: 'Yeni görev', caseId: undefined, assigneeId: undefined }),
      ),
    );
  });

  it('13) hata -> retry -> başarı (cases)', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.reject(new Error('boom'));
      callsFor('/users')[0].d.resolve({ data: { data: [] } });
    });
    await openModal();
    await screen.findByRole('alert');

    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });
    await act(async () => {
      retryBtn.click();
    });
    await waitFor(() => expect(callsFor('/cases').length).toBe(2));
    await act(async () => {
      callsFor('/cases')[1].d.resolve({ data: { data: [caseItem('2026/9')] } });
    });
    const { caseSel } = lookupSelects();
    expect(await within(caseSel).findByRole('option', { name: '2026/9' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('14) retry YALNIZ yetkili lookup kaynağını çağırır — diğer lookup ve task mutation tetiklenmez', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.reject(new Error('boom'));
      callsFor('/users')[0].d.resolve({ data: { data: [] } });
    });
    await openModal();
    await screen.findByRole('alert');

    const usersCallsBefore = callsFor('/users').length;
    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });
    await act(async () => {
      retryBtn.click();
    });
    await waitFor(() => expect(callsFor('/cases').length).toBe(2));
    // users tekrar cagrilmadi, hicbir mutation (post/put/delete) tetiklenmedi.
    expect(callsFor('/users').length).toBe(usersCallsBefore);
    expect(mocked.post).not.toHaveBeenCalled();
    expect(mocked.put).not.toHaveBeenCalled();
    expect(mocked.delete).not.toHaveBeenCalled();
  });

  it('15-16-17) başarılı veri KORUNUR + geç ESKİ success/rejection güncel state\'i DEĞİŞTİRMEZ (iki örtüşen istek)', async () => {
    // Bu bilesende retry YALNIZ hata sonrasi gorunur oldugundan (mount-only
    // useEffect + yalniz-hata-tetikli retry, DIS bir "her zaman acik refresh"
    // butonu YOK), "basarili veri -> AYRI bir sonraki cagri basarisiz olur"
    // akisi normal UI akisiyla DOGRUDAN tetiklenemez (retry banner basari
    // sonrasi kaybolur). Ayni garanti - GERCEK, DOLU basari verisi ekranda
    // iken bir SONRAKI (bu durumda ortusen) yanitin onu BOZMAMASI - asagida
    // iki es zamanli retry cagrisi (senkron cift-tiklama, in-flight
    // bayraginin retry akisinda BILEREK sifirlanmasindan yararlanarak) ile
    // dogrudan kurulur ve kanitlanir.
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.reject(new Error('ilk deneme başarısız'));
      callsFor('/users')[0].d.resolve({ data: { data: [] } });
    });
    await openModal();
    const retryBtn = await screen.findByRole('button', { name: /Tekrar dene/i });

    await act(async () => {
      retryBtn.click();
      retryBtn.click();
    });
    await waitFor(() => expect(callsFor('/cases').length).toBe(3));
    const staleCall = callsFor('/cases')[1];
    const freshCall = callsFor('/cases')[2];

    // Once FRESH (guncel token) cagriyi BASARILI yap - gercek, dolu veri.
    await act(async () => {
      freshCall.d.resolve({ data: { data: [caseItem('2026/GUNCEL')] } });
    });
    const { caseSel } = lookupSelects();
    expect(await within(caseSel).findByRole('option', { name: '2026/GUNCEL' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // ESKI (stale) cagri GEC BASARIYLA doner - jenerasyon token'i UYUSMADIGI
    // icin bu yanit ATLANMALI, guncel "2026/GUNCEL" verisi BOZULMAMALI.
    await act(async () => {
      staleCall.d.resolve({ data: { data: [caseItem('2026/ESKI')] } });
    });
    expect(screen.queryByRole('option', { name: '2026/ESKI' })).not.toBeInTheDocument();
    expect(within(caseSel).getByRole('option', { name: '2026/GUNCEL' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('18) çift retry -> tek ek istek (disabled + in-flight koruması)', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.reject(new Error('boom'));
      callsFor('/users')[0].d.resolve({ data: { data: [] } });
    });
    await openModal();
    const retryBtn = await screen.findByRole('button', { name: /Tekrar dene/i });

    await act(async () => {
      retryBtn.click();
    });
    expect(retryBtn).toBeDisabled();
    await act(async () => {
      retryBtn.click();
    });
    await waitFor(() => expect(callsFor('/cases').length).toBeGreaterThanOrEqual(2));
    expect(callsFor('/cases').length).toBe(2);
  });

  it('19) unmount sonrası state yazılmaz (crash/uyarı yok)', async () => {
    const { unmount } = renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    const c = callsFor('/cases')[0];
    const u = callsFor('/users')[0];
    unmount();
    await act(async () => {
      c.d.resolve({ data: { data: [caseItem('2026/1')] } });
      u.d.reject(new Error('boom'));
    });
    // Assertion yok — hedef unmount sonrası setState uyarısı/throw ÜRETMEMEK.
  });

  it('20) hata durumunda false-success oluşmaz (form otomatik gönderilmiş/kapanmış gibi görünmez)', async () => {
    renderPage();
    await waitFor(() => expect(callsFor('/cases').length).toBe(1));
    await waitFor(() => expect(callsFor('/users').length).toBe(1));
    await act(async () => {
      callsFor('/cases')[0].d.reject(new Error('boom'));
      callsFor('/users')[0].d.reject(new Error('boom'));
    });
    await openModal();
    await screen.findAllByRole('alert');
    // Modal hala acik, hicbir mutation tetiklenmedi, "Kaydediliyor..." gibi
    // sahte-basari durumu yok.
    expect(screen.getByRole('button', { name: /^Kaydet$/ })).toBeInTheDocument();
    expect(mocked.post).not.toHaveBeenCalled();
    expect(mocked.put).not.toHaveBeenCalled();
  });
});
