import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AB-13 — BÜRO AYARLARI: "BUGÜN NE GİDECEK?" (ACT-12) ÖNİZLEMESİ OKUMA
 * HATASINDA "BUGÜN GÖNDERİLECEK TEBRİK YOK." İLE KARIŞMAZ.
 *
 * `loadOffice` içindeki `/greetings/today` alt-okuması eskiden yalnız
 * `console.error` ile YUTULUYORDU ve `todayGreetings`'i TAMAMEN BOŞ
 * dizilerle dolduruyordu — bu, "Bugün gönderilecek tebrik yok." (gerçekten-
 * boş) render'ıyla AYNI göründüğü için personel gerçek bir okuma arızasını
 * "bugün tebrik yok" sanıp doğum günü/yıldönümü/bayram tebriklerini
 * GÖNDERMEYİ ATLAYABİLİRDİ.
 *
 * KAPSAM (owner GO — seri zincir A4-AB-11→15, dilim 3): YALNIZ
 * `loadTodayGreetings` / `/greetings/today` okuma yolu. `loadOffice`'in
 * diğer alt-okumaları (office/smtp/sms/greeting-settings/escalation-
 * settings — zaten PR-2A1 ile kapsanmış outer catch) VE mutation yolları
 * (handleSendGreeting dahil) bu dilimin kapsamı DIŞINDADIR — dokunulmadı.
 */

let search = new URLSearchParams('section=greeting');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings/office',
  useSearchParams: () => search,
}));

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const OFFICE = { name: 'TELLI HUKUK', lawyers: [], bankAccounts: [] };
const STAFF: unknown[] = [];

const TODAY_GREETINGS_WITH_DATA = {
  birthdays: [{ id: 'c1', displayName: 'Ahmet Yılmaz' }],
  foundingAnniversaries: [],
  poaAnniversaries: [],
  specialDays: [],
  holidayClients: [],
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

/** Her GET URL'i açıkça kurulur; genel fallback mock YOK (mevcut office-mutation-matrix.spec.tsx deseniyle AYNI). */
function primeReads(over: Record<string, unknown> = {}) {
  mocked.get.mockImplementation((url: string) => {
    const map: Record<string, unknown> = {
      '/office': { data: OFFICE },
      '/office/smtp-settings': { data: {} },
      '/office/sms-settings': { data: {} },
      '/office/greeting-settings': { data: {} },
      '/office/escalation-settings': { data: {} },
      '/greetings/today': { data: { birthdays: [], foundingAnniversaries: [], poaAnniversaries: [], specialDays: [], holidayClients: [] } },
      '/staff': { data: { data: STAFF } },
      ...over,
    };
    const hit = map[url];
    if (hit instanceof Error) return Promise.reject(hit);
    if (hit && typeof (hit as any).then === 'function') return hit; // Promise doğrudan geçildi (deferred/gecikmeli senaryo)
    return Promise.resolve(hit ?? { data: {} });
  });
}

function drawer(): HTMLElement {
  return screen.getByRole('dialog');
}

/**
 * `drawer()` senkron `getByRole` kullanır — render'dan hemen sonra (henüz loading
 * spinner gösterilirken) çağrılırsa SENKRON throw eder. Bu yüzden drawer'ın
 * GERÇEKTEN belirmesi `waitFor` İÇİNDE beklenir, `within(...)` yalnız ONDAN SONRA
 * alınır (mevcut office-mutation-matrix.spec.tsx'teki renderSection deseniyle AYNI).
 */
async function openDrawerScope() {
  await waitFor(() => expect(drawer()).toBeTruthy());
  return within(drawer());
}

const netFail = () => Promise.reject(new TypeError('Failed to fetch'));

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  search = new URLSearchParams('section=greeting');
});

afterEach(() => cleanup());

describe('ACT-12 önizleme — okuma hatası sınıfları', () => {
  it('[1] AĞ HATASI: "Bugün gönderilecek tebrik yok." YAZILMAZ, görünür hata + retry çıkar', async () => {
    primeReads({ '/greetings/today': netFail() });
    render(<OfficeSettingsPage />);

    const d = await openDrawerScope();
    await waitFor(() => expect(d.getByRole('alert')).toBeTruthy());
    expect(d.queryByText('Bugün gönderilecek tebrik yok.')).toBeNull();
    expect(d.getByRole('button', { name: /Tekrar dene/ })).toBeTruthy();
  });

  it('[2] MALFORMED gövde (obje değil): görünür hata çıkar, çökme YOK', async () => {
    primeReads({ '/greetings/today': { data: [] } });
    render(<OfficeSettingsPage />);

    const d = await openDrawerScope();
    await waitFor(() => expect(d.getByRole('alert')).toBeTruthy());
    expect(d.queryByText('Bugün gönderilecek tebrik yok.')).toBeNull();
  });

  it('[3] GERÇEKTEN boş: hata YOK, "Bugün gönderilecek tebrik yok." DOĞRU', async () => {
    primeReads(); // varsayılan: tüm diziler gerçekten boş, başarılı
    render(<OfficeSettingsPage />);

    const d = await openDrawerScope();
    await waitFor(() => expect(d.getByText('Bugün gönderilecek tebrik yok.')).toBeTruthy());
    expect(d.queryByRole('alert')).toBeNull();
  });

  it('[4] başarılı yükleme: gerçek tebrik satırı görünür, hata YOK', async () => {
    primeReads({ '/greetings/today': { data: TODAY_GREETINGS_WITH_DATA } });
    render(<OfficeSettingsPage />);

    const d = await openDrawerScope();
    await waitFor(() => expect(d.getByText('Ahmet Yılmaz')).toBeTruthy());
    expect(d.queryByRole('alert')).toBeNull();
    expect(d.getByRole('button', { name: 'Gönder' })).toBeTruthy();
  });
});

describe('ACT-12 önizleme — retry YALNIZ /greetings/today tekrar dener', () => {
  it('[5] retry -> SUCCESS_DATA: hata kalkar, gerçek tebrik satırı görünür', async () => {
    let attempt = 0;
    mocked.get.mockImplementation((url: string) => {
      if (url === '/greetings/today') {
        attempt += 1;
        return attempt === 1 ? netFail() : Promise.resolve({ data: TODAY_GREETINGS_WITH_DATA });
      }
      const map: Record<string, unknown> = {
        '/office': { data: OFFICE }, '/office/smtp-settings': { data: {} }, '/office/sms-settings': { data: {} },
        '/office/greeting-settings': { data: {} }, '/office/escalation-settings': { data: {} }, '/staff': { data: { data: STAFF } },
      };
      return Promise.resolve(map[url] ?? { data: {} });
    });
    render(<OfficeSettingsPage />);

    const d = await openDrawerScope();
    await waitFor(() => expect(d.getByRole('alert')).toBeTruthy());
    fireEvent.click(d.getByRole('button', { name: /Tekrar dene/ }));

    await waitFor(() => expect(d.queryByRole('alert')).toBeNull());
    expect(d.getByText('Ahmet Yılmaz')).toBeTruthy();
  });

  it('[6] retry YALNIZ /greetings/today kaynağını çağırır (diğer okumalar TEKRAR ÇAĞRILMAZ)', async () => {
    let greetingsAttempt = 0;
    const callLog: string[] = [];
    mocked.get.mockImplementation((url: string) => {
      callLog.push(url);
      if (url === '/greetings/today') {
        greetingsAttempt += 1;
        return greetingsAttempt === 1 ? netFail() : Promise.resolve({ data: TODAY_GREETINGS_WITH_DATA });
      }
      const map: Record<string, unknown> = {
        '/office': { data: OFFICE }, '/office/smtp-settings': { data: {} }, '/office/sms-settings': { data: {} },
        '/office/greeting-settings': { data: {} }, '/office/escalation-settings': { data: {} }, '/staff': { data: { data: STAFF } },
      };
      return Promise.resolve(map[url] ?? { data: {} });
    });
    render(<OfficeSettingsPage />);

    const d = await openDrawerScope();
    await waitFor(() => expect(d.getByRole('alert')).toBeTruthy());
    const officeCallsBefore = callLog.filter((u) => u === '/office').length;

    fireEvent.click(d.getByRole('button', { name: /Tekrar dene/ }));
    await waitFor(() => expect(d.queryByRole('alert')).toBeNull());

    expect(greetingsAttempt).toBe(2);
    expect(callLog.filter((u) => u === '/office').length).toBe(officeCallsBefore); // ana /office YENİDEN ÇAĞRILMADI
  });
});

describe('ACT-12 önizleme — hata sırasında önceki liste', () => {
  it('[7] başarılı yükleme sonrası ikinci okuma (sayfa yeniden mount) başarısız olursa ÖNCEKİ liste tarzı KORUMA aynı mekanizmayla çalışır (kaynak-kilidi)', () => {
    // NOT: bu widget'ın TEK tetikleyicisi mount + hata-kapılı retry'dır (A4-AB-7/8
    // benzeri mimari sınır) — "başarı sonrası SONRAKİ mount'ta hata" senaryosu bu
    // sayfada gözlemlenebilir bağımsız bir ikinci tetikleyici ÜRETMEZ. Bu yüzden
    // "önceki veri silinmez" değişmezi KAYNAK-KİLİDİ testiyle doğrulanır: catch
    // bloğu setTodayGreetings(...) ÇAĞIRMAZ.
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../page.tsx'), 'utf8');
    const catchMatch = src.match(/const loadTodayGreetings[\s\S]*?catch \(e\) \{([\s\S]*?)\} finally \{/);
    expect(catchMatch).not.toBeNull();
    expect(catchMatch![1]).not.toMatch(/setTodayGreetings\(/);
  });

  it('[8] retry BAŞARILI olduktan sonra tekrar başarısız olursa ÖNCEKİ (retry\'nin getirdiği) veri KORUNUR + bayat bandı', async () => {
    let attempt = 0;
    mocked.get.mockImplementation((url: string) => {
      if (url === '/greetings/today') {
        attempt += 1;
        if (attempt === 1) return netFail();
        if (attempt === 2) return Promise.resolve({ data: TODAY_GREETINGS_WITH_DATA });
        return netFail();
      }
      const map: Record<string, unknown> = {
        '/office': { data: OFFICE }, '/office/smtp-settings': { data: {} }, '/office/sms-settings': { data: {} },
        '/office/greeting-settings': { data: {} }, '/office/escalation-settings': { data: {} }, '/staff': { data: { data: STAFF } },
      };
      return Promise.resolve(map[url] ?? { data: {} });
    });
    render(<OfficeSettingsPage />);

    const d = await openDrawerScope();
    await waitFor(() => expect(d.getByRole('alert')).toBeTruthy());
    fireEvent.click(d.getByRole('button', { name: /Tekrar dene/ }));
    await waitFor(() => expect(d.getByText('Ahmet Yılmaz')).toBeTruthy());
    expect(d.queryByRole('alert')).toBeNull();

    // Üçüncü deneme: hata bandı artık YOK (başarı sonrası kalktı), bu yüzden
    // her zaman görünür "Yenile" ikonu kullanılır — BAŞARISIZ olur.
    fireEvent.click(d.getByTitle('Yenile'));
    await waitFor(() => expect(d.getByRole('alert')).toBeTruthy());
    // ÖNCEKİ (retry #1'in getirdiği) veri HÂLÂ ekranda — SİLİNMEDİ.
    expect(d.getByText('Ahmet Yılmaz')).toBeTruthy();
    expect(d.getByText(/bayat olabilir/)).toBeTruthy();
  });
});

describe('ACT-12 önizleme — jenerasyon/unmount güvenliği', () => {
  it('[9] çift hızlı retry tıklaması: in-flight guard İKİNCİ isteği hiç başlatmaz', async () => {
    const dGreet = deferred<any>();
    let attempt = 0;
    mocked.get.mockImplementation((url: string) => {
      if (url === '/greetings/today') {
        attempt += 1;
        if (attempt === 1) return netFail();
        return dGreet.promise;
      }
      const map: Record<string, unknown> = {
        '/office': { data: OFFICE }, '/office/smtp-settings': { data: {} }, '/office/sms-settings': { data: {} },
        '/office/greeting-settings': { data: {} }, '/office/escalation-settings': { data: {} }, '/staff': { data: { data: STAFF } },
      };
      return Promise.resolve(map[url] ?? { data: {} });
    });
    render(<OfficeSettingsPage />);

    const d = await openDrawerScope();
    await waitFor(() => expect(d.getByRole('alert')).toBeTruthy());
    const retryBtn = d.getByRole('button', { name: /Tekrar dene/ });
    fireEvent.click(retryBtn);
    fireEvent.click(retryBtn); // in-flight guard + disabled attribute -> YOK SAYILMALI
    await waitFor(() => expect(attempt).toBe(2)); // 1 ilk + 1 retry, İKİNCİ retry YOK

    dGreet.resolve({ data: TODAY_GREETINGS_WITH_DATA });
    await waitFor(() => expect(d.queryByRole('alert')).toBeNull());
  });

  it('[10] unmount sonrası gecikmeli yanıt state güncellemesi/unhandled rejection ÜRETMEZ', async () => {
    const rejections: unknown[] = [];
    const onUnhandledRejection = (err: unknown) => rejections.push(err);
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      const dGreet = deferred<any>();
      mocked.get.mockImplementation((url: string) => {
        if (url === '/greetings/today') return dGreet.promise;
        const map: Record<string, unknown> = {
          '/office': { data: OFFICE }, '/office/smtp-settings': { data: {} }, '/office/sms-settings': { data: {} },
          '/office/greeting-settings': { data: {} }, '/office/escalation-settings': { data: {} }, '/staff': { data: { data: STAFF } },
        };
        return Promise.resolve(map[url] ?? { data: {} });
      });
      const { unmount } = render(<OfficeSettingsPage />);
      await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
      unmount();
      dGreet.resolve({ data: TODAY_GREETINGS_WITH_DATA });
      await new Promise((r) => setTimeout(r, 0));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});
