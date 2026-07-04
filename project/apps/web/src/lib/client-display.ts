/**
 * Müvekkil görünüm yardımcıları (Task 4A) — SAF, yan-etkisiz.
 *
 * Tek-kaynak: /clients listesi ve /clients/:id detayı (client-profile) AYNI türetmeleri kullanır
 * (kod tekrarından kaçın). Kanonik tip: `@/lib/api/client.types` (Client). Backend GET /clients/:id
 * düz adres kolonları (address/city/district/region) + ClientContact kanal satırları döndürür;
 * ClientAddress alt-sistemi v1'de YOK → adres düz okunur.
 */
import type { Client, ClientContact, ClientType } from './api/client.types';

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

/** Düz adres birleşimi (ClientAddress alt-sistemi v1'de YOK; yalnız düz kolonlar). */
export function clientPrimaryAddress(
  client: Pick<Client, 'address' | 'district' | 'city' | 'region' | 'postalCode'>,
): string | null {
  const locality = [client.district, client.city].filter((p) => p && String(p).trim()).join('/');
  const parts = [client.address, locality, client.region, client.postalCode].filter(
    (p) => p && String(p).trim(),
  );
  return parts.length ? parts.join(', ') : null;
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
