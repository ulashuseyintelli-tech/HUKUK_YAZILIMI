/**
 * CLIENT-ARC-07-OFFICIAL-CONSUMER-ADAPTER-I07 — ortak ClientAddress çözücü.
 *
 * KANONİK OTORİTE: `CLIENT-GOVERNANCE-CHARTER.md` §49 (ARC-07 kanonik tren, I07 dilimi).
 *
 * SAF ve DETERMİNİSTİK: veritabanına erişmez, yan etkisi yoktur. `apps/web/src/lib/
 * client-display.ts`'teki `clientResolvedAddress()`/`clientAddressLine()` desenini
 * BİREBİR yansıtır — iki paket ayrı derlendiği için kod PAYLAŞILAMAZ, ama sıralama
 * kuralı ve birleştirme biçimi AYNIDIR; iki tarafta farklı adres görünmesi riski budur.
 *
 * Deterministik sıra (web ile aynı):
 *   1. aktif (`isCurrent=true`) `isPrimary=true` ClientAddress
 *   2. mevcut kararlı sıradaki ilk aktif ClientAddress (çağıran: isPrimary desc, createdAt asc)
 *   3. açık legacy düz alan fallback'i (Client.address/city/district/region/postalCode)
 *   4. adres yok
 *
 * KAPSAM SINIRI (I07): bu modül flat alan YAZIMINI durdurmaz, backfill yapmaz, yalnız
 * OKUMA yönünü resmi tüketiciler için tek kaynağa indirger.
 */

export interface ClientAddressResolverRow {
  street?: string | null;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  postalCode?: string | null;
  isPrimary: boolean;
}

export interface ClientAddressResolverInput {
  /** @deprecated legacy düz kolon — yapısal satır yoksa fallback olarak okunur. */
  address?: string | null;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  postalCode?: string | null;
  /**
   * Çağıran bu diziyi ÖNCEDEN filtrelemiş OLMALIDIR: yalnız `isCurrent=true` satırlar,
   * `isPrimary desc, createdAt asc` sıralı (I01/I03 ile aynı Prisma sorgu deseni). Bu
   * modül isCurrent/sıralama YORUMLAMAZ — I01'in invariant resolver'ı bunu zaten yapar.
   */
  addresses?: ClientAddressResolverRow[] | null;
}

export type ClientAddressResolverSource = 'structured' | 'legacy' | 'none';

export interface ResolvedClientAddress {
  /** Görünen tek satır; `source === 'none'` ise null. */
  line: string | null;
  source: ClientAddressResolverSource;
  /** Ayrı il/ilçe alanı bekleyen tüketiciler için (UYAP, template-engine). */
  city: string | null;
  district: string | null;
  /** Yapısal satır var mı — I01 boşluğu (üzerine referans) için bilgi amaçlı. */
  hasStructured: boolean;
}

/** Trim edilmiş, boş olmayan değeri döner; aksi halde null. */
function cleaned(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

/**
 * Parçaları birleştirir. HER parça TRIM EDİLİR — `CLIENT-DOCUMENT-ADDRESS-OUTPUT-DEFECT-R01`'in
 * kendi düzeltmesi (`caseData.client?.address?.trim()`) bu davranışı zaten gerektiriyordu;
 * resolver o garantiyi KAYBETMEZ (test `[5b]` bunu kanıtlar).
 */
function joinAddressParts(parts: {
  street?: string | null;
  district?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
}): string | null {
  const street = cleaned(parts.street);
  const district = cleaned(parts.district);
  const city = cleaned(parts.city);
  const region = cleaned(parts.region);
  const postalCode = cleaned(parts.postalCode);

  const locality = [district, city].filter(Boolean).join('/');
  const joined = [street, locality || null, region, postalCode].filter(Boolean);
  return joined.length ? joined.join(', ') : null;
}

/**
 * Resmi tüketiciler (UYAP mapper, document/template servisleri) için tek çözüm noktası.
 * Girdi `addresses` çağıran tarafından `isCurrent=true` + sıralı verilmelidir.
 */
export function resolveClientAddress(input: ClientAddressResolverInput): ResolvedClientAddress {
  const rows = Array.isArray(input.addresses) ? input.addresses : [];
  const hasStructured = rows.length > 0;
  const picked = rows.find((r) => r.isPrimary) ?? rows[0];

  if (picked) {
    return {
      line: joinAddressParts(picked),
      source: 'structured',
      city: picked.city ?? null,
      district: picked.district ?? null,
      hasStructured,
    };
  }

  const legacyLine = joinAddressParts({
    street: input.address,
    district: input.district,
    city: input.city,
    region: input.region,
    postalCode: input.postalCode,
  });
  if (legacyLine) {
    return {
      line: legacyLine,
      source: 'legacy',
      city: input.city ?? null,
      district: input.district ?? null,
      hasStructured,
    };
  }

  return { line: null, source: 'none', city: null, district: null, hasStructured };
}
