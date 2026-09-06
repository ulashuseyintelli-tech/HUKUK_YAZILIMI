/**
 * OWN-12 ADIM C (owner GO 2026-09-06, Faz 2) — ORTAK FORM MODELI DAVRANIS KILIDI.
 *
 * Iki kopya halinde duran hesaplar tek yere alindi:
 *  - kilit/gorunurluk hesabi (`ClientForm` + `settings/clients` `ClientModal`)
 *  - ortak alan kumesi ve tarama birlestirmesi (`cases/new` `NewClientModal`)
 * Bu suite mantigin DEGISMEDIGINI kilitler: yetki gorunurlugu (OWN-13) ve tarama girisleri
 * aynen korunur.
 */
import { describe, it, expect } from 'vitest';

import {
  CLIENT_CAPABILITIES_DENIED,
  deriveClientFormLockState,
  SENSITIVE_FIELD_LOCK_REASON,
  VIEWER_MUTATION_LOCK_REASON,
  type ClientMutationCapabilities,
} from '@/lib/client-mutation-capabilities';
import {
  applyScannedClientFields,
  buildClientCoreFields,
  emptyClientCoreFields,
  emptyClientSharedFormFields,
} from '@/lib/client-form-fields';
import { clientFormValuesFromClient, emptyClientFormValues } from '@/lib/client-write';

const FULL: ClientMutationCapabilities = {
  canCreate: true,
  canUpdateStandard: true,
  canUpdateSensitive: true,
  canManageLifecycle: true,
};
const STANDARD_ONLY: ClientMutationCapabilities = { ...FULL, canUpdateSensitive: false };

describe('OWN-12 C — deriveClientFormLockState (OWN-13 gorunurlugu)', () => {
  it('SINYAL YOK (bilinmiyor): hicbir sey kilitlenmez — eski cagiran davranisi', () => {
    for (const mode of ['create', 'edit'] as const) {
      const state = deriveClientFormLockState(undefined, mode);
      expect(state.mutationBlocked).toBe(false);
      expect(state.sensitiveLocked).toBe(false);
      expect(state.identityDisabled).toBe(false);
    }
  });

  it('TAM YETKI: hicbir sey kilitlenmez', () => {
    for (const mode of ['create', 'edit'] as const) {
      expect(deriveClientFormLockState(FULL, mode).identityDisabled).toBe(false);
    }
  });

  it('VIEWER (tumu kapali): her iki modda da mutasyon KAPALI ve gerekce VIEWER metnidir', () => {
    for (const mode of ['create', 'edit'] as const) {
      const state = deriveClientFormLockState(CLIENT_CAPABILITIES_DENIED, mode);
      expect(state.mutationBlocked).toBe(true);
      expect(state.identityDisabled).toBe(true);
      expect(state.lockReason).toBe(VIEWER_MUTATION_LOCK_REASON);
    }
  });

  it('CREATE, hassas-update ayriminin ISTISNASIDIR: hassas yetki olmasa da create ACIK', () => {
    const state = deriveClientFormLockState(STANDARD_ONLY, 'create');
    expect(state.mutationBlocked).toBe(false);
    expect(state.sensitiveLocked).toBe(false);
    expect(state.identityDisabled).toBe(false);
  });

  it('EDIT + hassas yetki YOK: yalniz kimlik alanlari kilitlenir, gerekce HASSAS metnidir', () => {
    const state = deriveClientFormLockState(STANDARD_ONLY, 'edit');
    expect(state.mutationBlocked).toBe(false);
    expect(state.sensitiveLocked).toBe(true);
    expect(state.identityDisabled).toBe(true);
    expect(state.lockReason).toBe(SENSITIVE_FIELD_LOCK_REASON);
  });

  it('mutasyon kapali + hassas kapali birlikte: gerekce VIEWER metnini onceler', () => {
    const state = deriveClientFormLockState(CLIENT_CAPABILITIES_DENIED, 'edit');
    expect(state.lockReason).toBe(VIEWER_MUTATION_LOCK_REASON);
  });
});

describe('OWN-12 C — ortak alan modeli', () => {
  it('bos form varsayilanlari: PERSON ve canCollect ACIK (mevcut davranis)', () => {
    const form = emptyClientSharedFormFields();
    expect(form.type).toBe('PERSON');
    expect(form.canCollect).toBe(true);
    expect(form.canWaive).toBe(false);
    expect(form.canSettle).toBe(false);
    expect(form.canRelease).toBe(false);
    expect(form.firstName).toBe('');
    expect(form.poaNumber).toBe('');
  });

  it('TARAMA: dolu alanlar uygulanir, `clientType` tur alanina eslenir', () => {
    const next = applyScannedClientFields(emptyClientSharedFormFields(), {
      clientType: 'COMPANY',
      companyName: 'Ornek A.S.',
      vkn: '4540536920',
      poaNumber: '12345',
      notaryName: 'Kadikoy 3. Noterligi',
    });
    expect(next.type).toBe('COMPANY');
    expect(next.companyName).toBe('Ornek A.S.');
    expect(next.vkn).toBe('4540536920');
    expect(next.poaNumber).toBe('12345');
    expect(next.notaryName).toBe('Kadikoy 3. Noterligi');
  });

  it('TARAMA: bos/eksik deger kullanicinin ELLE girdigini SILMEZ', () => {
    const prev = { ...emptyClientSharedFormFields(), firstName: 'Ayse', phone: '5551112233' };
    const next = applyScannedClientFields(prev, { firstName: '', lastName: 'Yilmaz' });
    expect(next.firstName).toBe('Ayse');
    expect(next.phone).toBe('5551112233');
    expect(next.lastName).toBe('Yilmaz');
  });

  it('TARAMA: yetki bayraginda ACIK `false` KORUNUR (bos deger sayilmaz)', () => {
    const next = applyScannedClientFields(emptyClientSharedFormFields(), {
      canCollect: false,
      canWaive: true,
    });
    expect(next.canCollect).toBe(false);
    expect(next.canWaive).toBe(true);
  });

  it('TARAMA: yetki bayragi taramada YOKSA mevcut deger korunur', () => {
    const prev = { ...emptyClientSharedFormFields(), canSettle: true };
    const next = applyScannedClientFields(prev, { firstName: 'Ali' });
    expect(next.canSettle).toBe(true);
    expect(next.canCollect).toBe(true);
  });

  it('TARAMA: sonuc yoksa form DEGISMEZ', () => {
    const prev = emptyClientSharedFormFields();
    expect(applyScannedClientFields(prev, null)).toBe(prev);
    expect(applyScannedClientFields(prev, undefined)).toBe(prev);
  });

  it('TARAMA: formun KENDINE OZGU alanlari dokunulmadan gecer', () => {
    const prev = { ...emptyClientSharedFormFields(), gender: 'K', note: 'ozel' };
    const next = applyScannedClientFields(prev, { firstName: 'Ali' });
    expect(next.gender).toBe('K');
    expect(next.note).toBe('ozel');
    expect(next.firstName).toBe('Ali');
  });
});

describe('OWN-12 C — cekirdek alan modeli UC tuketici tarafindan da kullaniliyor', () => {
  it('bos cekirdek: PERSON + canCollect ACIK', () => {
    const core = emptyClientCoreFields();
    expect(core.type).toBe('PERSON');
    expect(core.canCollect).toBe(true);
    expect(core.canWaive).toBe(false);
    expect(core.taxOffice).toBe('');
  });

  it('ONCELIK: tarama → mevcut kayit → varsayilan', () => {
    const core = buildClientCoreFields({
      scanned: { firstName: 'Taramadan', tckn: '10000000146' },
      client: { firstName: 'Kayittan', lastName: 'Soyad', tckn: '12345678028', taxOffice: 'Kadikoy' },
    });
    expect(core.firstName).toBe('Taramadan'); // tarama kazanir
    expect(core.tckn).toBe('10000000146');
    expect(core.lastName).toBe('Soyad'); // taramada yok → kayit
    expect(core.taxOffice).toBe('Kadikoy');
  });

  it('BOOLEAN: kayittaki acik `false` KORUNUR (metin kuralina duşmez)', () => {
    const core = buildClientCoreFields({ client: { canCollect: false, canSettle: true } });
    expect(core.canCollect).toBe(false);
    expect(core.canSettle).toBe(true);
    expect(core.canWaive).toBe(false);
  });

  it('companyNameFallback: settings/clients formunun `client.name` yedegi KORUNUR', () => {
    const withFallback = buildClientCoreFields({
      client: { name: 'Eski Unvan A.S.' },
      companyNameFallback: 'Eski Unvan A.S.',
    });
    expect(withFallback.companyName).toBe('Eski Unvan A.S.');
    // Yedek verilmezse bos kalir (diger formlarin davranisi).
    expect(buildClientCoreFields({ client: { name: 'Eski Unvan A.S.' } }).companyName).toBe('');
  });

  it('ClientForm (client-write): bos form cekirdek varsayilanlari AYNI', () => {
    const form = emptyClientFormValues();
    const core = emptyClientCoreFields();
    expect(form.type).toBe(core.type);
    expect(form.canCollect).toBe(core.canCollect);
    expect(form.canWaive).toBe(core.canWaive);
    expect(form.canSettle).toBe(core.canSettle);
    expect(form.canRelease).toBe(core.canRelease);
    expect(form.taxOffice).toBe(core.taxOffice);
    // Bu formun KENDI alanlari korunur.
    expect(form.region).toBe('');
    expect(form.notes).toBe('');
  });

  it('ClientForm hydration: cekirdek alanlar kayittan, tur daraltmasi KORUNUR', () => {
    const hydrated = clientFormValuesFromClient({
      type: 'INDIVIDUAL',
      firstName: 'Ayse',
      lastName: 'Yilmaz',
      tckn: '10000000146',
      canCollect: false,
      notes: 'not',
    } as any);
    // Bilinmeyen/desteklenmeyen tur PERSON'a duser (bu formun sozlesmesi DEGISMEDI).
    expect(hydrated.type).toBe('PERSON');
    expect(hydrated.firstName).toBe('Ayse');
    expect(hydrated.tckn).toBe('10000000146');
    expect(hydrated.canCollect).toBe(false);
    expect(hydrated.notes).toBe('not');
  });

  it('cases/new alan kumesi cekirdegi GENISLETIR (kendi duz iletisim/adres alanlariyla)', () => {
    const shared = emptyClientSharedFormFields();
    const core = emptyClientCoreFields();
    for (const key of Object.keys(core) as Array<keyof typeof core>) {
      expect(shared[key]).toEqual(core[key]);
    }
    expect(shared.phone).toBe('');
    expect(shared.poaNumber).toBe('');
  });
});
