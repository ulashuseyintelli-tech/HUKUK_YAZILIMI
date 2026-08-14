import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { renderHook, cleanup, waitFor } from '@testing-library/react';
import { useCaseCalculation } from '../useCaseCalculation';
import { apiClient } from '@/lib/api/client';

/**
 * WSMR-A4-AB-3 — `useCaseCalculation` UNMOUNT/STALE-RESPONSE TEARDOWN YARIŞI.
 *
 * Owner talebi: A4-AB-2'nin CI'ında "Web Tests (vitest)" `useCaseCalculation.ts:144`
 * (`setLoading(false)` finally bloğu) kaynaklı bir `ReferenceError: window is not
 * defined` unhandled rejection'ıyla BAŞARISIZ oldu. Rerun'ın geçmesi hatanın
 * ZARARSIZ olduğunu DEĞİL, NONDETERMINISTIC olduğunu kanıtlar — açık kabul
 * borcu olarak burada KAPATILIYOR.
 *
 * KÖK NEDEN: hook hiçbir iptal/bayatlık koruması TAŞIMIYORDU — `await` sonrası
 * (başarı VEYA hata dalında, `finally` dahil) doğrudan `setState` çağrılıyordu.
 * Component gerçekten unmount olmuşsa veya `caseId`/`calculationDate` değişip
 * YENİ bir istek zaten başlatılmışsa (hızlı caseId değişimi), ESKİ (bayat)
 * isteğin geç gelen yanıtı/reddi HALA state'e YAZILIYORDU. Bu yalnız test-
 * ortamı gürültüsü DEĞİL, PRODUCTION'da da gerçek bir kusur: kullanıcı başka
 * bir dosyaya geçmişse eski dosyanın hesap özeti yanlışlıkla yeni ekrana
 * yazılabilirdi.
 *
 * FIX: `isMountedRef` (gerçek unmount) + `fetchTokenRef` (jenerasyon sayacı —
 * yalnız EN SON başlatılan isteğin sonucu state'e yazılır). Global rejection
 * suppression, boş catch, `typeof window` bandajı YOK — gerçek cancellation.
 */

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn() },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const RESULT_A = { caseId: 'case-A', hesapTarihi: '2026-08-01', toplamBorc: 1000 } as any;
const RESULT_B = { caseId: 'case-B', hesapTarihi: '2026-08-02', toplamBorc: 2000 } as any;

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe('aktif mount davranışı korunur (regresyon-koruma)', () => {
  it('başarılı fetch: data set edilir, loading false, error null', async () => {
    mockedGet.mockResolvedValue({ data: RESULT_A });
    const { result } = renderHook(() => useCaseCalculation({ caseId: 'case-A' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(RESULT_A);
    expect(result.current.error).toBeNull();
  });

  it('başarısız fetch: error set edilir, data null, loading false', async () => {
    mockedGet.mockRejectedValue(new Error('Sunucu hatası'));
    const { result } = renderHook(() => useCaseCalculation({ caseId: 'case-A' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Sunucu hatası');
    expect(result.current.data).toBeNull();
  });
});

describe('async işlem sürerken unmount', () => {
  it('unmount SONRASI promise BAŞARIYLA çözülürse React state-güncelleme hatası/unhandled rejection OLUŞMAZ', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { promise, resolve } = deferred<{ data: any }>();
    mockedGet.mockReturnValue(promise);

    const { unmount } = renderHook(() => useCaseCalculation({ caseId: 'case-A' }));
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));

    unmount();
    resolve({ data: RESULT_A });
    await new Promise((r) => setTimeout(r, 0));

    const unmountedUpdateWarning = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("Can't perform a React state update on an unmounted component"),
    );
    expect(unmountedUpdateWarning).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('rejection sonrası unmount', () => {
  it('unmount SONRASI promise REDDEDİLİRSE React state-güncelleme hatası/unhandled rejection OLUŞMAZ', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { promise, reject } = deferred<{ data: any }>();
    mockedGet.mockReturnValue(promise);

    const { unmount } = renderHook(() => useCaseCalculation({ caseId: 'case-A' }));
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));

    unmount();
    reject(new Error('geç gelen ağ hatası'));
    await new Promise((r) => setTimeout(r, 0));

    const unmountedUpdateWarning = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("Can't perform a React state update on an unmounted component"),
    );
    expect(unmountedUpdateWarning).toBe(false);
    // '[useCaseCalculation] Error:' console.error'u unmount SONRASI ARTIK basilmaz
    // (catch dali isMountedRef guard'inda erken doner) — best-effort log dahi
    // gecersiz bir istek icin URETILMEZ.
    const staleErrorLogged = errorSpy.mock.calls.some((c) => String(c[0]).includes('[useCaseCalculation] Error:'));
    expect(staleErrorLogged).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('StrictMode setup/cleanup/setup', () => {
  it('StrictMode çift-çağrı döngüsünde veri DOĞRU yüklenir, hata OLUŞMAZ', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedGet.mockResolvedValue({ data: RESULT_A });

    const { result } = renderHook(() => useCaseCalculation({ caseId: 'case-A' }), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(RESULT_A);
    expect(result.current.error).toBeNull();

    const reactWarning = errorSpy.mock.calls.some((c) => /Warning:/.test(String(c[0])));
    expect(reactWarning).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('hızlı caseId değişimi — eski yanıt geç gelirse yeni state EZİLMEZ', () => {
  it('A beklerken B\'ye geçilir, B önce döner, A SONRA (geç) döner — ekranda B kalır', async () => {
    const defA = deferred<{ data: any }>();
    const defB = deferred<{ data: any }>();
    mockedGet.mockImplementation((endpoint: string) => {
      if (endpoint.includes('case-A')) return defA.promise;
      if (endpoint.includes('case-B')) return defB.promise;
      return Promise.reject(new Error('unexpected endpoint'));
    });

    const { result, rerender } = renderHook(
      ({ caseId }) => useCaseCalculation({ caseId }),
      { initialProps: { caseId: 'case-A' } },
    );
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));

    rerender({ caseId: 'case-B' });
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));

    // B (en son başlatılan istek) önce çözülür.
    defB.resolve({ data: RESULT_B });
    await waitFor(() => expect(result.current.data).toEqual(RESULT_B));

    // A (bayat istek) SONRA, GEÇ çözülür — B'nin state'ini EZMEMELİ.
    defA.resolve({ data: RESULT_A });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.data).toEqual(RESULT_B);
  });
});

describe('timer/microtask environment teardown sonrasına kalır', () => {
  it('unmount SONRASI setTimeout ile GEÇ reddedilen istek process seviyesinde unhandled rejection ÜRETMEZ', async () => {
    const rejections: unknown[] = [];
    const handler = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', handler);
    try {
      mockedGet.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error('geç gelen ağ hatası (macrotask)')), 20);
          }),
      );

      const { unmount } = renderHook(() => useCaseCalculation({ caseId: 'case-1' }));
      await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));

      unmount();
      await new Promise((r) => setTimeout(r, 50));

      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', handler);
    }
  });
});
