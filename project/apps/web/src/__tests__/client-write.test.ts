import { describe, it, expect } from 'vitest';
import {
  buildCreateClientPayload,
  buildEditClientPayload,
  clientFormValuesFromClient,
  emptyClientFormValues,
  validateClientForm,
  type ClientFormValues,
} from '@/lib/client-write';
import type { Client } from '@/lib/api/client.types';

const personForm = (over: Partial<ClientFormValues> = {}): ClientFormValues => ({
  ...emptyClientFormValues(),
  type: 'PERSON',
  firstName: 'Ali',
  lastName: 'Veli',
  tckn: '10000000146',
  phone: '05551234567',
  email: 'ali@example.com',
  address: 'Levent Mah.',
  city: 'İstanbul',
  district: 'Beşiktaş',
  region: 'Bölge 1',
  ...over,
});

const companyForm = (over: Partial<ClientFormValues> = {}): ClientFormValues => ({
  ...emptyClientFormValues(),
  type: 'COMPANY',
  companyName: 'ACME A.Ş.',
  vkn: '1234567890',
  ...over,
});

describe('validateClientForm', () => {
  it('PERSON: ad/soyad/tckn zorunlu', () => {
    const errors = validateClientForm(emptyClientFormValues());
    expect(errors.firstName).toBeTruthy();
    expect(errors.lastName).toBeTruthy();
    expect(errors.tckn).toBeTruthy();
  });

  it('COMPANY/PUBLIC: kurum adı/vkn zorunlu', () => {
    const errors = validateClientForm({ ...emptyClientFormValues(), type: 'COMPANY' });
    expect(errors.companyName).toBeTruthy();
    expect(errors.vkn).toBeTruthy();
    expect(errors.firstName).toBeUndefined();
  });

  it('geçerli form: hata yok', () => {
    expect(validateClientForm(personForm())).toEqual({});
    expect(validateClientForm(companyForm())).toEqual({});
  });

  it("TCKN/VKN yanlış uzunlukta reddedilir (format-only, checksum backend'de)", () => {
    expect(validateClientForm(personForm({ tckn: '123' })).tckn).toBeTruthy();
    expect(validateClientForm(companyForm({ vkn: '123' })).vkn).toBeTruthy();
  });

  it('geçersiz e-posta formatı reddedilir', () => {
    expect(validateClientForm(personForm({ email: 'not-an-email' })).email).toBeTruthy();
  });

  it('boş e-posta serbest (opsiyonel alan)', () => {
    expect(validateClientForm(personForm({ email: '' })).email).toBeUndefined();
  });
});

describe('buildCreateClientPayload', () => {
  it('phones/emails/addresses dahil eder (yeni müvekkilde contacts yok, güvenli)', () => {
    const payload = buildCreateClientPayload(personForm());
    expect(payload.phones).toEqual([{ type: 'MOBILE', value: '05551234567', isPrimary: true }]);
    expect(payload.emails).toEqual([{ value: 'ali@example.com', isPrimary: true }]);
    expect(payload.addresses).toEqual([
      { street: 'Levent Mah.', city: 'İstanbul', district: 'Beşiktaş', region: 'Bölge 1', isPrimary: true },
    ]);
  });

  it('PERSON: firstName/lastName/tckn dolu, companyName/vkn undefined', () => {
    const payload = buildCreateClientPayload(personForm());
    expect(payload.firstName).toBe('Ali');
    expect(payload.companyName).toBeUndefined();
    expect(payload.vkn).toBeUndefined();
  });

  it('COMPANY: companyName/vkn dolu, firstName/lastName/tckn undefined', () => {
    const payload = buildCreateClientPayload(companyForm());
    expect(payload.companyName).toBe('ACME A.Ş.');
    expect(payload.firstName).toBeUndefined();
    expect(payload.lastName).toBeUndefined();
    expect(payload.tckn).toBeUndefined();
  });

  it('boş telefon/e-posta/adres → undefined (JSON.stringify düşürür)', () => {
    const payload = buildCreateClientPayload(
      personForm({ phone: '', email: '', address: '', city: '', district: '', region: '' }),
    );
    expect(payload.phones).toBeUndefined();
    expect(payload.emails).toBeUndefined();
    expect(payload.addresses).toBeUndefined();
  });

  it('JSON.stringify undefined anahtarları gerçekten düşürür (wire-level teyit)', () => {
    const payload = buildCreateClientPayload(personForm({ phone: '', email: '' }));
    const wire = JSON.parse(JSON.stringify(payload));
    expect('phones' in wire).toBe(false);
    expect('emails' in wire).toBe(false);
  });
});

describe('buildEditClientPayload — Task 7 KRİTİK regresyon koruması', () => {
  it("phones/emails anahtarları KESİNLİKLE payload'da yok", () => {
    const payload = buildEditClientPayload(personForm());
    expect('phones' in payload).toBe(false);
    expect('emails' in payload).toBe(false);
    expect(payload.phones).toBeUndefined();
    expect(payload.emails).toBeUndefined();
  });

  it('wire-level (JSON.stringify sonrası) teyit: phones/emails anahtarı yok', () => {
    const payload = buildEditClientPayload(personForm());
    const wire = JSON.parse(JSON.stringify(payload));
    expect('phones' in wire).toBe(false);
    expect('emails' in wire).toBe(false);
  });

  it("v1'de düzenlenemeyen alanlar (gender/tebrik/detsis/mersis/vb.) payload'da yok", () => {
    const payload = buildEditClientPayload(personForm()) as Record<string, unknown>;
    for (const key of [
      'gender',
      'birthDate',
      'foundingDate',
      'poaStartDate',
      'sendBirthdayGreeting',
      'sendAnniversaryGreeting',
      'sendHolidayGreeting',
      'greetingChannel',
      'detsisNo',
      'mersisNo',
      'ticaretSicilNo',
      'companyType',
      'nationality',
      'isForeigner',
      'postalCode',
      'identityNo',
      'isActive',
      'phone',
      'email',
    ]) {
      expect(key in payload).toBe(false);
    }
  });

  it('adres ve yetkiler dahil edilir (v1 düzenlenebilir alanlar)', () => {
    const payload = buildEditClientPayload(personForm());
    expect(payload.addresses).toEqual([
      { street: 'Levent Mah.', city: 'İstanbul', district: 'Beşiktaş', region: 'Bölge 1', isPrimary: true },
    ]);
    expect(payload.canCollect).toBe(true);
  });

  it('kimlik alanları create ile aynı tip-bazlı ayrımı korur', () => {
    const payload = buildEditClientPayload(companyForm());
    expect(payload.companyName).toBe('ACME A.Ş.');
    expect(payload.firstName).toBeUndefined();
  });
});

describe('clientFormValuesFromClient — edit hydration', () => {
  it('Client kaydından form state kurar, phone/email salt-okuma için hydrate edilir', () => {
    const client: Partial<Client> = {
      type: 'PERSON',
      firstName: 'Ayşe',
      lastName: 'Kara',
      tckn: '10000000146',
      address: 'Kadıköy Mah.',
      city: 'İstanbul',
      district: 'Kadıköy',
      region: 'Bölge 2',
      canCollect: true,
      canWaive: true,
      contacts: [
        { id: '1', type: 'MOBILE', value: '0532', isPrimary: true },
        { id: '2', type: 'EMAIL', value: 'ayse@example.com', isPrimary: true },
      ],
    };
    const form = clientFormValuesFromClient(client as Client);
    expect(form.firstName).toBe('Ayşe');
    expect(form.tckn).toBe('10000000146');
    expect(form.phone).toBe('0532');
    expect(form.email).toBe('ayse@example.com');
    expect(form.canWaive).toBe(true);
  });
});
