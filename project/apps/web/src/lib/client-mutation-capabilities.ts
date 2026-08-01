/**
 * CLIENT-OWN-13-MUTATION-AUTHORIZATION-I01 — FE tarafı capability sinyali.
 *
 * KURAL (owner): frontend yetki politikasını KENDİ BAŞINA YENİDEN HESAPLAMAZ. Burada rol
 * karşılaştırması, allowlist veya eşik mantığı YOKTUR — backend'in
 * `GET /clients/lifecycle-eligibility` yanıtındaki `capabilities` nesnesi olduğu gibi
 * tüketilir. API enforcement authority olarak KALIR; bu sinyal yalnız kontrolleri
 * disabled + gerekçeli göstermek içindir (ACT-11 deseniyle birebir).
 *
 * Geriye uyumluluk (owner req. 12): yanıtın mevcut `eligible` alanı DEĞİŞMEDİ; `capabilities`
 * additive'dir. SİNYAL YOKSA (eski API, ağ hatası, alan hiç dönmediyse) sonuç `undefined`'dır
 * ve UI HİÇBİR ŞEYİ KİLİTLEMEZ — "bilinmiyor" ile "backend hayır dedi" AYNI ŞEY DEĞİLDİR.
 * Yokluğu yasak saymak eski API'ye karşı çalışan istemciyi kilitler ve tek bir ağ hatası
 * müvekkil oluşturmayı imkânsız kılardı. Bu bir güvenlik boşluğu DEĞİLDİR: yetkiyi API
 * uygular (fail-closed, 9 mutation teeth ile kanıtlı); buradaki sinyal salt görünürlüktür.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface ClientMutationCapabilities {
  canCreate: boolean;
  canUpdateStandard: boolean;
  canUpdateSensitive: boolean;
  canManageLifecycle: boolean;
}

/** Backend açıkça "hayır" dediğinde kullanılan tam-kapalı sonuç (test/fixture kolaylığı). */
export const CLIENT_CAPABILITIES_DENIED: ClientMutationCapabilities = {
  canCreate: false,
  canUpdateStandard: false,
  canUpdateSensitive: false,
  canManageLifecycle: false,
};

/**
 * Backend yanıtını NORMALIZE eder.
 * - Nesne YOKSA → `undefined` (BİLİNMİYOR; UI kilitlemez, API yine de uygular).
 * - Nesne VARSA → yalnız gerçek `true` kabul edilir; eksik/`"true"`/`1` gibi değerler false.
 * Burada rol karşılaştırması veya eşik hesabı YAPILMAZ.
 */
export function normalizeClientCapabilities(raw: unknown): ClientMutationCapabilities | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const c = raw as Partial<Record<keyof ClientMutationCapabilities, unknown>>;
  return {
    canCreate: c.canCreate === true,
    canUpdateStandard: c.canUpdateStandard === true,
    canUpdateSensitive: c.canUpdateSensitive === true,
    canManageLifecycle: c.canManageLifecycle === true,
  };
}

/** Hassas alanların neden kilitli olduğunu açıklayan tek kaynak metin. */
export const SENSITIVE_FIELD_LOCK_REASON =
  'Bu alanlar hukuki kimlik veya temsil yetkisi niteliğindedir; değiştirmek için ADMIN veya yetkilendirilmiş avukat yetkisi gerekir.';

export const VIEWER_MUTATION_LOCK_REASON =
  'Görüntüleyici (VIEWER) rolü müvekkil kaydı oluşturamaz veya değiştiremez.';

export function useClientMutationCapabilities(): ClientMutationCapabilities | undefined {
  // Başlangıç `undefined` = BİLİNMİYOR: fetch tamamlanana kadar kontroller kilitlenmez
  // (yanlışlıkla "yasak" göstermek yerine API'nin kararını bekleriz).
  const [caps, setCaps] = useState<ClientMutationCapabilities | undefined>(undefined);

  useEffect(() => {
    let active = true;
    api
      .get('/clients/lifecycle-eligibility')
      .then((res) => {
        if (!active) return;
        setCaps(normalizeClientCapabilities((res as any)?.data?.data?.capabilities));
      })
      .catch(() => {
        // Ağ/yetki hatası → BİLİNMİYOR. Kilitlemeyiz; yetkisiz istek API'de 403 alır.
        if (active) setCaps(undefined);
      });
    return () => {
      active = false;
    };
  }, []);

  return caps;
}
