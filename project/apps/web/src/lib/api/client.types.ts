/**
 * Client (Müvekkil) — KANONİK frontend tip kaynağı (Task 3).
 *
 * Tek-kaynak: müvekkil tipi için bundan sonra BURASI esastır; component/sayfa-yerel
 * `Client`/`ClientData` interface'leri (özellikle uydurma 'REAL'|'LEGAL' enum'u) yerine
 * bu tipler kullanılmalı.
 *
 * Otorite: apps/api `prisma/schema.prisma` (enum ClientType) + `modules/client/dto/create-client.dto.ts`.
 * NOT (Task 3 analiz): backend GET/POST/PUT `{data}` zarfı döner; `@/lib/api` (api.ts) `api.get` bunu
 * BİR KEZ DAHA sarar → consumer'da çoğu yerde `res.data?.data`. Zarf normalizasyonu RISKY/geniş-blast
 * (177 dosya) → ayrı fork; bu dosya yalnız tip sınırını kurar, çağrı davranışını DEĞİŞTİRMEZ.
 */

/** Kanonik müvekkil türü. INDIVIDUAL @deprecated (eski kayıtlarda mevcut; yeni kayıt PERSON). */
export type ClientType = 'PERSON' | 'COMPANY' | 'PUBLIC' | 'INDIVIDUAL';

/** İletişim KANALI (Prisma ClientContact: kişi DEĞİL, telefon/e-posta satırı). */
export interface ClientContact {
  id: string;
  clientId?: string;
  /** Prisma'da serbest String: 'MOBILE' | 'PHONE' | 'EMAIL' | 'FAX' ... (enum değil). */
  type: string;
  value: string;
  label?: string | null;
  isPrimary?: boolean;
}

/**
 * Müvekkil okuma (response) şekli — backend Client modelinin FE'de kullanılan alanları.
 * Prisma nullable scalar'lar `string | null` (backend null döndürebilir).
 */
export interface Client {
  id: string;
  tenantId?: string;
  type: ClientType;
  displayName?: string | null;
  /** @deprecated displayName kullan (backend türetir). */
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  tckn?: string | null;
  vkn?: string | null;
  /** @deprecated tckn/vkn kullan. */
  identityNo?: string | null;
  companyName?: string | null;
  taxOffice?: string | null;
  gender?: string | null;
  detsisNo?: string | null;
  mersisNo?: string | null;
  ticaretSicilNo?: string | null;
  companyType?: string | null;
  nationality?: string | null;
  isForeigner?: boolean;
  /** @deprecated birincil değer contacts'tan türetilir. */
  email?: string | null;
  /** @deprecated birincil değer contacts'tan türetilir. */
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  postalCode?: string | null;
  canCollect?: boolean;
  canWaive?: boolean;
  canSettle?: boolean;
  canRelease?: boolean;
  notes?: string | null;
  birthDate?: string | null;
  foundingDate?: string | null;
  poaStartDate?: string | null;
  sendBirthdayGreeting?: boolean;
  sendAnniversaryGreeting?: boolean;
  sendHolidayGreeting?: boolean;
  greetingChannel?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  contacts?: ClientContact[];
  /** Vekalet tipi ayrı modülde; burada opak bırakıldı. */
  powerOfAttorneys?: unknown[];
  _count?: { cases?: number };
  /** Task 10A: portal erişim durumu (read-only). Açma/kapatma /settings/clients'ta kalır. */
  hasPortalAccess?: boolean;
}

/** Yazma payload alt-girdileri (CreateClientDto nested DTO'larıyla hizalı). */
export interface ClientContactInput {
  type?: string;
  value?: string;
  label?: string;
  isPrimary?: boolean;
}

export interface ClientAddressInput {
  street?: string;
  city?: string;
  district?: string;
  region?: string;
  postalCode?: string;
  isPrimary?: boolean;
}

/**
 * Müvekkil create/update payload — backend CreateClientDto/UpdateClientDto ile hizalı (Task 2).
 * Tüm alanlar opsiyonel (lenient validation: fazla alan düşer, 400 değil). `isActive` yalnız update.
 */
export interface ClientWritePayload {
  type?: ClientType;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  displayName?: string;
  name?: string;
  tckn?: string;
  vkn?: string;
  identityNo?: string;
  taxOffice?: string;
  gender?: string;
  detsisNo?: string;
  mersisNo?: string;
  ticaretSicilNo?: string;
  companyType?: string;
  nationality?: string;
  isForeigner?: boolean;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  region?: string;
  postalCode?: string;
  canCollect?: boolean;
  canWaive?: boolean;
  canSettle?: boolean;
  canRelease?: boolean;
  notes?: string;
  birthDate?: string;
  foundingDate?: string;
  poaStartDate?: string;
  sendBirthdayGreeting?: boolean;
  sendAnniversaryGreeting?: boolean;
  sendHolidayGreeting?: boolean;
  greetingChannel?: string;
  phones?: ClientContactInput[];
  emails?: ClientContactInput[];
  addresses?: ClientAddressInput[];
  /** Yalnız update. */
  isActive?: boolean;
}
