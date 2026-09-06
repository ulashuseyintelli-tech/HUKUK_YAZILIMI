/**
 * OWN-12 ADIM C (owner GO 2026-09-06, Faz 2) — MUVEKKIL FORMLARININ ORTAK ALAN MODELI.
 *
 * Web'de uc muvekkil formu vardir:
 *   1. `NewClientModal`  — `cases/new` sihirbazi (vekaletname TARAMASI ile doldurulur)
 *   2. `ClientModal`     — `settings/clients` (tarama sihirbazi + duzenleme)
 *   3. `ClientForm`      — `/clients/new` ve `/clients/:id/edit` (native sayfa formu)
 * Ucu de AYNI kimlik/iletisim/adres alanlarini ve AYNI vekalet yetki bayraklarini tasiyordu;
 * her biri kendi nesne literalini ve kendi tarama-birlestirme blogunu tutuyordu. Bu dosya o
 * ORTAK alan kumesini ve tarama birlestirmesini tek yere alir.
 *
 * KAPSAM SINIRI (bilerek): formlarin KENDINE OZGU alanlari (ClientModal'daki `gender`, notlar,
 * `ClientForm`'un yapisal adres akisi) ve JSX'leri BURAYA TASINMAZ. Tarama girisleri, sihirbaz
 * vekalet akisi ve yetki gorunurlugu DEGISMEZ; bu modul yalniz ortak veri seklini paylasir.
 * Vekalet ALANLARI form durumunda tutulur ama `/clients` govdesine GITMEZ — ayirma
 * `lib/poa-ux.ts` icindeki `stripPoaFields` ile yapilir (kopya YOK).
 */

export type ClientFormPartyType = 'PERSON' | 'COMPANY' | 'PUBLIC';

/** Uc formun HEPSINDE bulunan kimlik alanlari. */
export interface ClientIdentityFields {
  type: ClientFormPartyType;
  firstName: string;
  lastName: string;
  tckn: string;
  companyName: string;
  vkn: string;
  taxOffice: string;
}

/** Uc formun HEPSINDE bulunan vekalet yetki bayraklari. */
export interface ClientAuthorityFlags {
  canCollect: boolean;
  canWaive: boolean;
  canSettle: boolean;
  canRelease: boolean;
}

/**
 * CEKIRDEK ortak alanlar: kimlik + yetki bayraklari.
 *
 * Iletisim (telefon/e-posta) ve adres BILEREK disaridadir: `settings/clients` bunlari DIZI
 * olarak (coklu iletisim + yapisal adres), `cases/new` ve `ClientForm` ise DUZ alan olarak
 * tutar. O farklar baglama ozgudur ve korunur.
 */
export type ClientCoreFormFields = ClientIdentityFields & ClientAuthorityFlags;

/** Cekirdek alanlarin bos degerleri (`canCollect` VARSAYILAN ACIK — uc formda da ayni). */
export function emptyClientCoreFields(): ClientCoreFormFields {
  return {
    type: 'PERSON',
    firstName: '',
    lastName: '',
    tckn: '',
    companyName: '',
    vkn: '',
    taxOffice: '',
    canCollect: true,
    canWaive: false,
    canSettle: false,
    canRelease: false,
  };
}

/**
 * Cekirdek alanlarin BASLANGIC degerlerini kaynaklardan kurar.
 *
 * ONCELIK (uc formda da ayni): tarama sonucu → mevcut kayit → varsayilan.
 * Metin alanlarinda `||` (bos metin bir sonraki kaynaga duser), boolean bayraklarda `??`
 * (kayittaki acik `false` KORUNUR). `companyNameFallback`, `settings/clients` formunun
 * `client.name` yedegini bozmadan tasimak icindir.
 */
export function buildClientCoreFields(source: {
  scanned?: Record<string, any> | null;
  client?: Record<string, any> | null;
  companyNameFallback?: string;
}): ClientCoreFormFields {
  const scanned = source.scanned ?? undefined;
  const client = source.client ?? undefined;
  const base = emptyClientCoreFields();
  return {
    type: (scanned?.clientType || client?.type || base.type) as ClientFormPartyType,
    firstName: scanned?.firstName || client?.firstName || base.firstName,
    lastName: scanned?.lastName || client?.lastName || base.lastName,
    tckn: scanned?.tckn || client?.tckn || base.tckn,
    companyName:
      scanned?.companyName || client?.companyName || source.companyNameFallback || base.companyName,
    vkn: scanned?.vkn || client?.vkn || base.vkn,
    taxOffice: scanned?.taxOffice || client?.taxOffice || base.taxOffice,
    canCollect: scanned?.canCollect ?? client?.canCollect ?? base.canCollect,
    canWaive: scanned?.canWaive ?? client?.canWaive ?? base.canWaive,
    canSettle: scanned?.canSettle ?? client?.canSettle ?? base.canSettle,
    canRelease: scanned?.canRelease ?? client?.canRelease ?? base.canRelease,
  };
}

/**
 * `cases/new` sihirbazinin alan kumesi: CEKIRDEK + duz iletisim/adres + vekaletname bilgisi.
 * Cekirdek kisim uc formda ORTAKTIR; kalani bu baglama ozgudur.
 */
export interface ClientSharedFormFields extends ClientCoreFormFields {
  phone: string;
  email: string;
  address: string;
  city: string;
  district: string;
  /** Vekaletname bilgisi — POST /poa govdesine gider, /clients govdesine GITMEZ. */
  poaNumber: string;
  poaDate: string;
  notaryName: string;
  notaryCity: string;
}

/** Bos form: `canCollect` VARSAYILAN OLARAK acik (mevcut davranis, uc formda da ayni). */
export function emptyClientSharedFormFields(): ClientSharedFormFields {
  return {
    ...emptyClientCoreFields(),
    phone: '',
    email: '',
    address: '',
    city: '',
    district: '',
    poaNumber: '',
    poaDate: '',
    notaryName: '',
    notaryCity: '',
  };
}

/**
 * Vekaletname TARAMA sonucunu ortak alanlara uygular.
 *
 * Semantik (mevcut davranisla BIREBIR):
 *  - Metin alanlari: taramada BOS/eksik ise MEVCUT deger korunur (`||`) — kullanicinin elle
 *    girdigi deger silinmez.
 *  - Boolean yetkiler: yalniz `undefined`/`null` ise mevcut deger korunur (`??`) — taramanin
 *    acikca `false` demesi KORUNUR.
 *  - `type`, taramanin `clientType` alanindan gelir (backend sozlesmesi).
 *  - Formun kendine ozgu alanlari (jenerik `T`) DOKUNULMADAN gecer.
 */
export function applyScannedClientFields<T extends ClientSharedFormFields>(
  prev: T,
  scanned: Record<string, any> | null | undefined,
): T {
  if (!scanned) return prev;
  return {
    ...prev,
    type: (scanned.clientType as ClientFormPartyType) || prev.type,
    firstName: scanned.firstName || prev.firstName,
    lastName: scanned.lastName || prev.lastName,
    tckn: scanned.tckn || prev.tckn,
    companyName: scanned.companyName || prev.companyName,
    vkn: scanned.vkn || prev.vkn,
    taxOffice: scanned.taxOffice || prev.taxOffice,
    phone: scanned.phone || prev.phone,
    email: scanned.email || prev.email,
    address: scanned.address || prev.address,
    city: scanned.city || prev.city,
    district: scanned.district || prev.district,
    canCollect: scanned.canCollect ?? prev.canCollect,
    canWaive: scanned.canWaive ?? prev.canWaive,
    canSettle: scanned.canSettle ?? prev.canSettle,
    canRelease: scanned.canRelease ?? prev.canRelease,
    poaNumber: scanned.poaNumber || prev.poaNumber,
    poaDate: scanned.poaDate || prev.poaDate,
    notaryName: scanned.notaryName || prev.notaryName,
    notaryCity: scanned.notaryCity || prev.notaryCity,
  };
}
