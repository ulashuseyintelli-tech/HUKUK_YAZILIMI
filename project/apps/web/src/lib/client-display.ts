/**
 * Müvekkil görünüm yardımcıları (Task 4A) — SAF, yan-etkisiz.
 *
 * Tek-kaynak: /clients listesi ve /clients/:id detayı (client-profile) AYNI türetmeleri kullanır
 * (kod tekrarından kaçın). Kanonik tip: `@/lib/api/client.types` (Client).
 *
 * ADRES (VER-02 düzeltmesi): `ClientAddress` alt-sistemi ARTIK VAR. GET /clients/:id hem düz
 * kolonları (address/city/district/region — legacy, korunur) hem `addresses[]` satırlarını
 * (yalnız isCurrent:true, isPrimary desc) döner. Görünen adres `clientResolvedAddress()` ile
 * TEK yerden çözülür; header ve Adres sekmesi bunu paylaşır (eskiden header düz kolonları,
 * sekme yapısal satırları okuyordu → aynı ekranda iki farklı adres görünebiliyordu).
 * `clientPrimaryAddress()` artık YALNIZ açık legacy-fallback adımıdır, doğrudan kullanılmaz.
 */
import type { Client, ClientAddress, ClientContact, ClientType } from './api/client.types';

export type ClientTypeKind = 'PERSON' | 'COMPANY' | 'PUBLIC';

/** Kanonik ClientType → görünüm kümesi. INDIVIDUAL (@deprecated) ve bilinmeyen → PERSON (güvenli varsayılan). */
export function clientTypeKind(type?: ClientType | string | null): ClientTypeKind {
  if (type === 'COMPANY') return 'COMPANY';
  if (type === 'PUBLIC') return 'PUBLIC';
  return 'PERSON';
}

export function clientTypeLabel(type?: ClientType | string | null): string {
  switch (clientTypeKind(type)) {
    case 'COMPANY':
      return 'Kurum';
    case 'PUBLIC':
      return 'Kamu';
    default:
      return 'Şahıs';
  }
}

/** PERSON → TCKN, COMPANY/PUBLIC → VKN (etiket + değer). Değer yoksa null. */
export function clientIdentity(
  client: Pick<Client, 'type' | 'tckn' | 'vkn'>,
): { label: string; value: string | null } {
  if (clientTypeKind(client.type) === 'PERSON') {
    return { label: 'TCKN', value: client.tckn ?? null };
  }
  return { label: 'VKN', value: client.vkn ?? null };
}

const PHONE_TOKENS = ['MOBILE', 'PHONE', 'TEL', 'FAX', 'GSM'];

function isPhoneChannel(type?: string | null): boolean {
  const up = (type ?? '').toUpperCase();
  return PHONE_TOKENS.some((t) => up.includes(t));
}

function isEmailChannel(type?: string | null): boolean {
  return (type ?? '').toUpperCase().includes('EMAIL');
}

function pickChannel(
  contacts: ClientContact[] | undefined,
  predicate: (type?: string | null) => boolean,
): string | null {
  const matches = (contacts ?? []).filter((c) => predicate(c.type) && !!c.value);
  const primary = matches.find((c) => c.isPrimary) ?? matches[0];
  return primary?.value ?? null;
}

/** Birincil telefon: önce ClientContact kanalı (isPrimary önceliği), sonra @deprecated düz `phone`. */
export function clientPrimaryPhone(client: Pick<Client, 'contacts' | 'phone'>): string | null {
  return pickChannel(client.contacts, isPhoneChannel) ?? client.phone ?? null;
}

/** Birincil e-posta: önce ClientContact kanalı (isPrimary önceliği), sonra @deprecated düz `email`. */
export function clientPrimaryEmail(client: Pick<Client, 'contacts' | 'email'>): string | null {
  return pickChannel(client.contacts, isEmailChannel) ?? client.email ?? null;
}

/**
 * LEGACY düz adres birleşimi (yalnız `Client.address/city/district/region/postalCode`).
 *
 * VER-02: bu artık `clientResolvedAddress()`'in SON adımıdır (açık legacy fallback), tek başına
 * "müvekkilin adresi" olarak KULLANILMAZ — yapısal `ClientAddress` satırı varsa o kazanır.
 */
export function clientPrimaryAddress(
  client: Pick<Client, 'address' | 'district' | 'city' | 'region' | 'postalCode'>,
): string | null {
  const locality = [client.district, client.city].filter((p) => p && String(p).trim()).join('/');
  const parts = [client.address, locality, client.region, client.postalCode].filter(
    (p) => p && String(p).trim(),
  );
  return parts.length ? parts.join(', ') : null;
}

/** Tek bir `ClientAddress` satırının görünen metni. Adres bölümü ve header AYNI formatı kullanır. */
export function clientAddressLine(
  a: Pick<ClientAddress, 'street' | 'district' | 'city' | 'region' | 'postalCode'>,
): string {
  const locality = [a.district, a.city].filter((p) => p && String(p).trim()).join('/');
  const parts = [a.street, locality, a.region, a.postalCode].filter((p) => p && String(p).trim());
  return parts.length ? parts.join(', ') : '—';
}

export type ClientAddressSource = 'structured' | 'legacy' | 'none';

export interface ResolvedClientAddress {
  /** Görünen metin; `source === 'none'` ise null. */
  text: string | null;
  source: ClientAddressSource;
  /** Yapısal (ClientAddress) satır var mı — legacy formların yanıltıcı başarı vermemesi için. */
  hasStructured: boolean;
}

/**
 * VER-02 KANONİK ADRES ÇÖZÜMÜ — header ve Adres sekmesi bunu PAYLAŞIR (çoğaltma YOK).
 *
 * Deterministik sıra:
 *   1. aktif `isPrimary=true` ClientAddress
 *   2. mevcut kararlı sıradaki ilk aktif ClientAddress (backend: isPrimary desc, createdAt asc)
 *   3. açık legacy düz alan fallback'i
 *   4. adres yok
 *
 * Yapısal satır ile düz alanlar ÇELİŞİRSE yapısal KAZANIR. `isCurrent` semantiği burada
 * YORUMLANMAZ: backend `findOne()` zaten yalnız `isCurrent:true` satırları döner (arşivleme
 * ARC-07 kapsamındadır, bu fonksiyon onu ne uygular ne varsayar).
 */
export function clientResolvedAddress(
  client: Pick<Client, 'address' | 'district' | 'city' | 'region' | 'postalCode' | 'addresses'>,
): ResolvedClientAddress {
  const rows = Array.isArray(client.addresses) ? client.addresses : [];
  const hasStructured = rows.length > 0;
  const picked = rows.find((a) => a.isPrimary) ?? rows[0];
  if (picked) {
    return { text: clientAddressLine(picked), source: 'structured', hasStructured };
  }
  const legacy = clientPrimaryAddress(client);
  return legacy
    ? { text: legacy, source: 'legacy', hasStructured }
    : { text: null, source: 'none', hasStructured };
}

/** Görünen ad zinciri: displayName → companyName → ad soyad → @deprecated name → varsayılan. */
export function clientDisplayName(
  client: Pick<Client, 'displayName' | 'companyName' | 'firstName' | 'lastName' | 'name'>,
): string {
  const fullName = [client.firstName, client.lastName].filter(Boolean).join(' ').trim();
  return (
    client.displayName ||
    client.companyName ||
    fullName ||
    client.name ||
    'İsimsiz Müvekkil'
  );
}
