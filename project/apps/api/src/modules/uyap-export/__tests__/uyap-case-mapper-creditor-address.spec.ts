/**
 * CLIENT-ARC-07-OFFICIAL-CONSUMER-ADAPTER-I07 — UYAP mapper alacaklı adresi retarget'ı.
 *
 * `mapClientToTaraf()` artık ORTAK `resolveClientAddress()` kullanır. Kapsam: UYAP çıktısı
 * (`kisi.adres`) — borçlu/DebtorAddress yolu DOKUNULMADI (ayrı, kapsam dışı).
 */
import { ClientType } from '@prisma/client';
import { UyapCaseMapperService } from '../uyap-case-mapper.service';

type Harness = {
  mapClientToTaraf(client: any, rol: 'ALACAKLI' | 'BORCLU'): { kisi: { adres?: { il: string; ilce: string; tamAdres: string } } };
};

function harness() {
  const mapper = new UyapCaseMapperService({} as any);
  return mapper as unknown as Harness;
}

const BASE_CLIENT = {
  type: ClientType.INDIVIDUAL,
  tckn: '12345678901',
  vkn: null,
  firstName: 'Ada',
  lastName: 'Müvekkil',
  companyName: null,
  displayName: null,
};

describe('ARC-07 I07 — UyapCaseMapperService.mapClientToTaraf() adres retarget', () => {
  it('[1] yapısal BİRİNCİL ClientAddress VARSA UYAP adresi ONDAN üretilir', () => {
    const client = {
      ...BASE_CLIENT,
      address: 'Legacy Cadde',
      city: 'LegacyŞehir',
      district: 'LegacyİlçE',
      addresses: [
        { street: 'Yapısal Cadde', city: 'İstanbul', district: 'Kadıköy', isPrimary: true },
      ],
    };
    const taraf = harness().mapClientToTaraf(client, 'ALACAKLI');
    expect(taraf.kisi.adres).toEqual({
      il: 'İstanbul',
      ilce: 'Kadıköy',
      tamAdres: 'Yapısal Cadde, Kadıköy/İstanbul',
    });
  });

  it('[2] yapısal satır YOKSA legacy flat kolona AÇIKÇA düşer (davranış korunur)', () => {
    const client = {
      ...BASE_CLIENT,
      address: 'Legacy Cadde',
      city: 'İstanbul',
      district: 'Kadıköy',
      addresses: [],
    };
    const taraf = harness().mapClientToTaraf(client, 'ALACAKLI');
    expect(taraf.kisi.adres).toEqual({ il: 'İstanbul', ilce: 'Kadıköy', tamAdres: 'Legacy Cadde, Kadıköy/İstanbul' });
  });

  it('[3] `addresses` HİÇ verilmemişse (I01 öncesi çağıran şekli) legacy\'e düşer', () => {
    const client = { ...BASE_CLIENT, address: 'Legacy Cadde', city: 'İstanbul', district: null };
    const taraf = harness().mapClientToTaraf(client, 'ALACAKLI');
    expect(taraf.kisi.adres?.tamAdres).toBe('Legacy Cadde, İstanbul');
  });

  it('[4] hiçbir kaynak yoksa `kisi.adres` HİÇ üretilmez (eski davranışla aynı)', () => {
    const client = { ...BASE_CLIENT, address: null, city: null, district: null, addresses: [] };
    const taraf = harness().mapClientToTaraf(client, 'ALACAKLI');
    expect(taraf.kisi.adres).toBeUndefined();
  });

  it('[5] DİŞ — resolver bypass edilip ham `client.address` okunsaydı yapısal öncelik KAYBOLURDU', () => {
    // Bu test resolver'ın GERÇEKTEN çağrıldığını dolaylı kanıtlar: yapısal satır legacy'den
    // FARKLI bir değer taşıyor; eski ham-okuma davranışı legacy'i (Legacy Cadde) döndürürdü.
    const client = {
      ...BASE_CLIENT,
      address: 'Legacy Cadde',
      city: 'LegacyŞehir',
      addresses: [{ street: 'Yapısal Cadde', city: 'İstanbul', isPrimary: true }],
    };
    const taraf = harness().mapClientToTaraf(client, 'ALACAKLI');
    expect(taraf.kisi.adres?.tamAdres).toContain('Yapısal Cadde');
    expect(taraf.kisi.adres?.tamAdres).not.toContain('Legacy Cadde');
  });

  it('[6] BORÇLU rolünde de AYNI resolver kullanılır (rol resolver mantığını değiştirmez)', () => {
    const client = { ...BASE_CLIENT, address: 'Cadde', city: 'İstanbul', district: null, addresses: [] };
    const taraf = harness().mapClientToTaraf(client, 'BORCLU');
    expect(taraf.kisi.adres?.tamAdres).toBe('Cadde, İstanbul');
  });
});
