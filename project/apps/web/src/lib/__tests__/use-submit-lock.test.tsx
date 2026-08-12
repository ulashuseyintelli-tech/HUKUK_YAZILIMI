import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSubmitLock, useKeyedSubmitLock } from '../use-submit-lock';

/**
 * PR-2A1 — çift gönderim kilidinin sözleşmesi.
 *
 * Kilitlenen üç davranış:
 *  1. SENKRON kilit — aynı tick içindeki ikinci çağrı hiç başlamaz (state bayrakları geç
 *     güncellendiği için `saving` tek başına yetmez).
 *  2. `finally` ile serbest bırakma — istisna atan çağrı bileşeni KALICI kilitlemez.
 *  3. Unmount yolu — bekleyen çağrı unmount'tan sonra da çökmemeli; `isMounted()` çağrı
 *     noktasına unmount sonrası setState yapmama imkânı verir.
 */

/** Dışarıdan çözülebilen promise — "uçuşta" durumu deterministik test etmek için. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useSubmitLock — senkron çift gönderim kilidi', () => {
  it('aynı tick içindeki ikinci çağrı HİÇ başlamaz', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const d = deferred();
    const fn = vi.fn(() => d.promise);

    let second: unknown;
    await act(async () => {
      const first = result.current.run(fn);
      second = await result.current.run(fn); // kilit doluyken — hiç çalışmamalı
      d.resolve();
      await first;
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(second).toBeUndefined();
  });

  it('üç hızlı tık TEK mutation üretir', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const d = deferred();
    const fn = vi.fn(() => d.promise);

    await act(async () => {
      const a = result.current.run(fn);
      result.current.run(fn);
      result.current.run(fn);
      d.resolve();
      await a;
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ilk çağrı bittikten SONRA yeniden gönderilebilir', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const fn = vi.fn(async () => 'ok');

    await act(async () => {
      await result.current.run(fn);
      await result.current.run(fn);
    });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('istisna atan çağrı kilidi SERBEST bırakır (kalıcı kilit yok)', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const boom = vi.fn(async () => {
      throw new Error('patladi');
    });

    await act(async () => {
      await expect(result.current.run(boom)).rejects.toThrow('patladi');
    });

    expect(result.current.isLocked()).toBe(false);

    const ok = vi.fn(async () => 'ok');
    await act(async () => {
      await result.current.run(ok);
    });
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('hata ÇAĞIRANA iletilir — yutulmaz', async () => {
    const { result } = renderHook(() => useSubmitLock());
    await act(async () => {
      await expect(
        result.current.run(async () => {
          throw new Error('sunucu reddetti');
        }),
      ).rejects.toThrow('sunucu reddetti');
    });
  });

  it('uçuşta iken isLocked true, bittiğinde false', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const d = deferred();

    let pending: Promise<unknown>;
    await act(async () => {
      pending = result.current.run(() => d.promise);
      expect(result.current.isLocked()).toBe(true);
      d.resolve();
      await pending;
    });

    expect(result.current.isLocked()).toBe(false);
  });

  it('unmount sonrası bekleyen çağrı çökmez ve isMounted false döner', async () => {
    const { result, unmount } = renderHook(() => useSubmitLock());
    const d = deferred();

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(() => d.promise);
    });

    unmount();
    expect(result.current.isMounted()).toBe(false);

    d.resolve();
    await expect(pending).resolves.toBeUndefined();
  });

  it('unmount sonrası istisna atan bekleyen çağrı da kilidi bırakır', async () => {
    const { result, unmount } = renderHook(() => useSubmitLock());
    const d = deferred();

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(() => d.promise);
    });

    unmount();
    d.reject(new Error('unmount sirasinda hata'));
    await expect(pending).rejects.toThrow('unmount sirasinda hata');
    expect(result.current.isLocked()).toBe(false);
  });
});

describe('useKeyedSubmitLock — satır bazlı kilit (pessimistic silme)', () => {
  it('AYNI satıra ikinci tık hiç başlamaz', async () => {
    const { result } = renderHook(() => useKeyedSubmitLock());
    const d = deferred();
    const fn = vi.fn(() => d.promise);

    let second: unknown;
    await act(async () => {
      const first = result.current.run('row-1', fn);
      second = await result.current.run('row-1', fn);
      d.resolve();
      await first;
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(second).toBeUndefined();
  });

  it('FARKLI satırlar birbirini BLOKLAMAZ', async () => {
    const { result } = renderHook(() => useKeyedSubmitLock());
    const d1 = deferred();
    const d2 = deferred();
    const f1 = vi.fn(() => d1.promise);
    const f2 = vi.fn(() => d2.promise);

    await act(async () => {
      const a = result.current.run('row-1', f1);
      const b = result.current.run('row-2', f2);
      d1.resolve();
      d2.resolve();
      await Promise.all([a, b]);
    });

    expect(f1).toHaveBeenCalledTimes(1);
    expect(f2).toHaveBeenCalledTimes(1);
  });

  it('hata sonrası aynı satır yeniden denenebilir', async () => {
    const { result } = renderHook(() => useKeyedSubmitLock());
    const boom = vi.fn(async () => {
      throw new Error('silinemedi');
    });

    await act(async () => {
      await expect(result.current.run('row-1', boom)).rejects.toThrow('silinemedi');
    });

    expect(result.current.isLocked('row-1')).toBe(false);

    const ok = vi.fn(async () => 'ok');
    await act(async () => {
      await result.current.run('row-1', ok);
    });
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
