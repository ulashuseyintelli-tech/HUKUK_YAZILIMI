/**
 * Müvekkil yazma (create/edit) yardımcıları — Task 7A.
 *
 * Task 7 design-gate bulgusu (KRİTİK, owner-locked 2026-07-02): ClientService.update() contacts
 * (phones/emails) alanlarını `if (data.phones || data.emails) { deleteMany + recreate }` ile
 * yönetir — payload'da yalnızca BİRİ gönderilirse diğer tip TAMAMEN SİLİNİR; hiç gönderilmezse
 * (undefined) contacts'a HİÇ dokunulmaz (Prisma undefined-skip). Bu yüzden native v1 edit formu
 * phones/emails'i ASLA payload'a koymaz (salt-okuma gösterir, düzenleme ayrı akışta kalır).
 *
 * Genelleştirilmiş kural (owner eklentisi): v1'de düzenlenemeyen HİÇBİR alan payload'a girmez.
 * Gizli/gösterilmeyen alan için null/varsayılan değer GÖNDERİLMEZ — anahtar tamamen omit edilir
 * (undefined → JSON.stringify onu düşürür → Prisma dokunmaz → mevcut veri korunur).
 */
import type { Client } from './api/client.types';
import {
  clientPrimaryAddress,
  clientPrimaryEmail,
  clientPrimaryPhone,
} from './client-display';

export type ClientFormType = 'PERSON' | 'COMPANY' | 'PUBLIC';

export interface ClientFormValues {
  type: ClientFormType;
  firstName: string;
  lastName: string;
  companyName: string;
  tckn: string;
  vkn: string;
  taxOffice: string;
  /** Yalnız create'te düzenlenebilir; edit'te salt-okuma gösterim için hydrate edilir. */
  phone: string;
  /** Yalnız create'te düzenlenebilir; edit'te salt-okuma gösterim için hydrate edilir. */
  email: string;
  address: string;
  city: string;
  district: string;
  region: string;
  canCollect: boolean;
  canWaive: boolean;
  canSettle: boolean;
  canRelease: boolean;
  notes: string;
}

export function emptyClientFormValues(): ClientFormValues {
  return {
    type: 'PERSON',
    firstName: '',
    lastName: '',
    companyName: '',
    tckn: '',
    vkn: '',
    taxOffice: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    district: '',
    region: '',
    canCollect: true,
    canWaive: false,
    canSettle: false,
    canRelease: false,
    notes: '',
  };
}

/** Edit formu hydration: mevcut Client kaydından form state kurar (GET /clients/:id sonrası). */
export function clientFormValuesFromClient(client: Client): ClientFormValues {
  const type: ClientFormType =
    client.type === 'COMPANY' || client.type === 'PUBLIC' ? client.type : 'PERSON';
  return {
    type,
    firstName: client.firstName || '',
    lastName: client.lastName || '',
    companyName: client.companyName || '',
    tckn: client.tckn || '',
    vkn: client.vkn || '',
    taxOffice: client.taxOffice || '',
    phone: clientPrimaryPhone(client) || '',
    email: clientPrimaryEmail(client) || '',
    address: client.address || '',
    city: client.city || '',
    district: client.district || '',
    region: client.region || '',
    canCollect: client.canCollect ?? true,
    canWaive: client.canWaive ?? false,
    canSettle: client.canSettle ?? false,
    canRelease: client.canRelease ?? false,
    notes: client.notes || '',
  };
}

const TCKN_RE = /^\d{11}$/;
const VKN_RE = /^\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Format-only client-side ön-kontrol (backend Matches regex'iyle hizalı: 11/10 hane).
 * Mod-10/11 checksum burada YOK — backend create()'te ayrıca zorunlu kılınır (Faz1, yalnız create);
 * checksum reddi 400 olarak zaten doğru şekilde yüzeye çıkar (submit sonrası hata gösterimi).
 */
export function validateClientForm(form: ClientFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.type === 'PERSON') {
    if (!form.firstName.trim()) errors.firstName = 'Ad zorunludur';
    if (!form.lastName.trim()) errors.lastName = 'Soyad zorunludur';
    if (!TCKN_RE.test(form.tckn.trim())) errors.tckn = 'TCKN 11 haneli rakam olmalı';
  } else {
    if (!form.companyName.trim()) errors.companyName = 'Kurum adı zorunludur';
    if (!VKN_RE.test(form.vkn.trim())) errors.vkn = 'VKN 10 haneli rakam olmalı';
  }
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) {
    errors.email = 'Geçerli e-posta giriniz';
  }
  return errors;
}

function addressEntries(form: ClientFormValues) {
  const hasAddress =
    form.address.trim() || form.city.trim() || form.district.trim() || form.region.trim();
  if (!hasAddress) return undefined;
  return [
    {
      street: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      district: form.district.trim() || undefined,
      region: form.region.trim() || undefined,
      isPrimary: true,
    },
  ];
}

/** POST /clients gövdesi. Yeni müvekkilde henüz contacts yok → phones/emails GÜVENLE gönderilir. */
export function buildCreateClientPayload(form: ClientFormValues): Record<string, unknown> {
  return {
    type: form.type,
    firstName: form.type === 'PERSON' ? form.firstName.trim() : undefined,
    lastName: form.type === 'PERSON' ? form.lastName.trim() : undefined,
    companyName: form.type !== 'PERSON' ? form.companyName.trim() : undefined,
    tckn: form.type === 'PERSON' ? form.tckn.trim() : undefined,
    vkn: form.type !== 'PERSON' ? form.vkn.trim() : undefined,
    taxOffice: form.taxOffice.trim() || undefined,
    phones: form.phone.trim()
      ? [{ type: 'MOBILE', value: form.phone.trim(), isPrimary: true }]
      : undefined,
    emails: form.email.trim() ? [{ value: form.email.trim(), isPrimary: true }] : undefined,
    addresses: addressEntries(form),
    canCollect: form.canCollect,
    canWaive: form.canWaive,
    canSettle: form.canSettle,
    canRelease: form.canRelease,
    notes: form.notes.trim() || undefined,
  };
}

/**
 * PUT /clients/:id gövdesi. `phones`/`emails` BİLEREK YOK (yukarıdaki kritik bulgu). Gender,
 * tebrik alanları (birthDate/foundingDate/poaStartDate/sendXGreeting/greetingChannel),
 * detsisNo/mersisNo/ticaretSicilNo/companyType/nationality/isForeigner/postalCode/identityNo/
 * isActive de v1'de düzenlenemez → hiçbiri buradan gönderilmez (owner'ın genelleştirdiği kural).
 */
export function buildEditClientPayload(form: ClientFormValues): Record<string, unknown> {
  return {
    type: form.type,
    firstName: form.type === 'PERSON' ? form.firstName.trim() : undefined,
    lastName: form.type === 'PERSON' ? form.lastName.trim() : undefined,
    companyName: form.type !== 'PERSON' ? form.companyName.trim() : undefined,
    tckn: form.type === 'PERSON' ? form.tckn.trim() : undefined,
    vkn: form.type !== 'PERSON' ? form.vkn.trim() : undefined,
    taxOffice: form.taxOffice.trim() || undefined,
    addresses: addressEntries(form),
    canCollect: form.canCollect,
    canWaive: form.canWaive,
    canSettle: form.canSettle,
    canRelease: form.canRelease,
    notes: form.notes.trim() || undefined,
  };
}

/** Edit formunda salt-okuma gösterilecek mevcut adres özeti (client-display reuse). */
export function currentAddressSummary(client: Client): string | null {
  return clientPrimaryAddress(client);
}
