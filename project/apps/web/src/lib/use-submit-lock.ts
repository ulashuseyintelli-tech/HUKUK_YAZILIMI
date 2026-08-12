'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * PR-2A1 — EŞZAMANLI ÇİFT GÖNDERİM KİLİDİ (senkron).
 *
 * `isPending`/`saving` gibi state bayrakları AYNI TICK içinde güncellenmez: hızlı üç tık
 * üç mutation başlatır. Create yollarında bu, sunucuda üç kayıt demektir. (Aynı defekt
 * PR-1.2'de FD oluşturma yolunda gerçekten görüldü ve `useRef` kilidiyle kapatıldı.)
 *
 * Kilit SENKRONDUR: `run()` çağrıldığı anda ref set edilir, ikinci çağrı hiç başlamaz.
 * Serbest bırakma `finally` içindedir — istisna atsa da kilit AÇILIR, aksi hâlde tek bir
 * hata bileşeni kalıcı olarak kilitler.
 *
 * ── Owner kuralı (kilitli): retry ve idempotency ─────────────────────────────────────
 * Otomatik/tek-tık retry YALNIZ idempotency güvencesi olan işlemlerde sunulur. İdempotency
 * anahtarı olmayan CREATE işlemlerinde aynı istek körlemesine tekrarlanmaz — form açık
 * bırakılır ve kullanıcı kontrollü biçimde yeniden gönderir. Bu kilit o kuralın
 * "eşzamanlı tekrar yok" yarısını uygular.
 */
export function useSubmitLock() {
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      // Unmount: bekleyen çağrının `finally`'si hâlâ çalışır; `isMounted()` sayesinde
      // çağrı noktası unmount sonrası setState yapmaktan kaçınabilir.
      mounted.current = false;
    };
  }, []);

  /**
   * `fn` yalnız kilit boştaysa çalışır. Kilit doluyken çağrı `undefined` döner ve
   * HİÇBİR yan etki üretmez (istek gönderilmez).
   *
   * `fn` hata atarsa hata ÇAĞIRANA aynen iletilir (yutulmaz) — sessiz mutasyon
   * ailesini burada yeniden üretmeyiz; kilit yine de serbest bırakılır.
   */
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    try {
      return await fn();
    } finally {
      inFlight.current = false;
    }
  }, []);

  const isLocked = useCallback(() => inFlight.current, []);
  const isMounted = useCallback(() => mounted.current, []);

  return { run, isLocked, isMounted };
}

/**
 * ANAHTARLI kilit — satır bazlı işlemler için (pessimistic silme, satır içi durum değişimi).
 *
 * Owner kuralı: "Pessimistic delete sırasında tekrar tıklama engellenmeli; hata hâlinde
 * satır ve seçim durumu aynen korunmalı." Tek bir global kilit bunu karşılamaz — iki farklı
 * satırın silinmesi birbirini bloklamamalı, ama AYNI satıra ikinci tık hiç başlamamalı.
 */
export function useKeyedSubmitLock() {
  const inFlight = useRef<Set<string>>(new Set());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
      if (inFlight.current.has(key)) return undefined;
      inFlight.current.add(key);
      try {
        return await fn();
      } finally {
        inFlight.current.delete(key);
      }
    },
    [],
  );

  const isLocked = useCallback((key: string) => inFlight.current.has(key), []);
  const isMounted = useCallback(() => mounted.current, []);

  return { run, isLocked, isMounted };
}
