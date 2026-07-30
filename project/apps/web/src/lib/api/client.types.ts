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

/** Kanonik adres türü (Prisma ClientAddressType). */
export type ClientAddressType = 'MERNIS' | 'TICARI' | 'TEBLIGAT' | 'FATURA' | 'BEYAN';

/**
 * ARC-07 I03 — staff adres okuma filtresi (GET /clients/:clientId/addresses?status=...).
 * `active` = yalnız `isCurrent:true` · `archived` = yalnız `isCurrent:false` · `all` = ikisi.
 */
export type ClientAddressListStatus = 'active' | 'archived' | 'all';

/**
 * ARC-07 I02 arşivleme payload'ı. `replacementPrimaryAddressId` YALNIZ birincil adres
 * arşivlenirken ve geride başka güncel adres kaldığında zorunludur; UI aday listesini
 * aynı müvekkilin GÜNCEL ve hedef-olmayan adreslerinden kurar.
 */
export interface ClientAddressArchivePayload {
  replacementPrimaryAddressId?: string;
}

/** ARC-07 I02 geri alma payload'ı. `makePrimary` yalnız AÇIK istekle birinciliği devreder. */
export interface ClientAddressRestorePayload {
  makePrimary?: boolean;
}

/** Çok-adres kaydı (Prisma ClientAddress). findOne() yalnız isCurrent:true satırları döner. */
export interface ClientAddress {
  id: string;
  clientId: string;
  type: ClientAddressType;
  street?: string | null;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  postalCode?: string | null;
  isPrimary: boolean;
  isCurrent: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  /** Task 4B: çok-adres listesi (yalnız isCurrent:true, isPrimary desc sıralı). Yoksa flat address alanları kullanılır. */
  addresses?: ClientAddress[];
  /** Vekalet tipi ayrı modülde; burada opak bırakıldı. */
  powerOfAttorneys?: unknown[];
  _count?: { cases?: number };
  /** Task 10A: portal erişim durumu (read-only). Açma/kapatma /settings/clients'ta kalır. */
  hasPortalAccess?: boolean;
  /** A2B: whitelist-select portalUser projeksiyonu (passwordHash/resetToken/2FA ASLA dönmez). */
  portalUser?: { email: string; lastLoginAt: string | null; loginCount: number } | null;
}

/**
 * ClientAddress-4: dedicated endpoint payload'ı (POST /clients/:clientId/addresses, PUT /addresses/:addressId).
 * `ClientAddressInput` ile KARIŞTIRMA — o, legacy settings/clients bulk-create'in flat address'e
 * çöken alt-girdisidir ve `type` alanı yoktur. Bu tip backend CreateClientAddressDto/UpdateClientAddressDto
 * ile birebir hizalı (type dahil).
 */
export interface ClientAddressWritePayload {
  type?: ClientAddressType;
  street?: string;
  city?: string;
  district?: string;
  region?: string;
  postalCode?: string;
  isPrimary?: boolean;
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
