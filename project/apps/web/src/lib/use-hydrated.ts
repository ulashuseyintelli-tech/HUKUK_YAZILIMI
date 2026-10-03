'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * Bileşen React tarafından devralındı mı (hidrasyon bitti mi)?
 *
 * Sunucu HTML'i tarayıcıya React işleyicileri bağlanmadan ÖNCE ulaşır. O aralıkta `<form onSubmit>`
 * tarayıcının kendi (yerel) gönderimine açıktır: `onSubmit` çalışmaz, form varsayılan yöntemle gider.
 * Ölçüldü (2026-10-01, başsız Edge): `method` taşımayan giriş formu bu aralıkta gönderilince alanlar
 * adrese yazılıyordu (`/auth/login?tenantSlug=…&email=…&password=…`).
 *
 * Dönüş: sunucu çıktısında ve hidrasyon sırasında `false`, hidrasyon biter bitmez `true`. Yalnız
 * istemcide çizilen (sunucu HTML'inde bulunmayan) bileşende ilk çizimden itibaren `true` — yani
 * `false` değeri tam olarak "DOM'da form var ama işleyicisi yok" aralığını kapsar.
 *
 * Kullanım: gönder düğmesini `disabled={!hydrated || …}` ile kapat; forma ayrıca `method="post"` ver
 * (düğme kapalıyken de `form.submit()` gibi programatik gönderim mümkündür — yöntem POST olunca alanlar
 * adrese değil gövdeye gider).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
