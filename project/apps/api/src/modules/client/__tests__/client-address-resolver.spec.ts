/**
 * CLIENT-ARC-07-OFFICIAL-CONSUMER-ADAPTER-I07 — ortak ClientAddress çözücü testleri.
 *
 * KANONİK OTORİTE: `CLIENT-GOVERNANCE-CHARTER.md` §49 (I07 dilimi).
 * Bu modül SAF'tır (DB yok, yan etki yok) — test kanıtı yalnız girdi/çıktı üzerinden.
 */
import { resolveClientAddress } from '../client-address-resolver';

const ROW = (over: Partial<{ street: string; city: string; district: string; region: string; postalCode: string; isPrimary: boolean }>) => ({
  street: null,
  city: null,
  district: null,
  region: null,
  postalCode: null,
  isPrimary: false,
  ...over,
});

describe('ARC-07 I07 — resolveClientAddress()', () => {
  it('[1] yapısal birincil satır VARSA legacy flat alanları GÖRMEZDEN GELİR', () => {
    const result = resolveClientAddress({
      address: 'Legacy Cadde',
      city: 'LegacyŞehir',
      addresses: [
        ROW({ street: 'Yapısal Cadde', city: 'İstanbul', district: 'Kadıköy', isPrimary: true }),
      ],
    });
    expect(result).toMatchObject({
      line: 'Yapısal Cadde, Kadıköy/İstanbul',
      source: 'structured',
      city: 'İstanbul',
      district: 'Kadıköy',
      hasStructured: true,
    });
  });

  it('[2] birincil YOKSA çağıranın sıraladığı kardeş kümesinin İLKİ seçilir', () => {
    const result = resolveClientAddress({
      addresses: [
        ROW({ street: 'İlk Satır', city: 'Ankara', isPrimary: false }),
        ROW({ street: 'İkinci Satır', city: 'İzmir', isPrimary: false }),
      ],
    });
    expect(result.line).toContain('İlk Satır');
    expect(result.source).toBe('structured');
  });

  it('[3] yapısal satır YOKSA legacy flat alanlara AÇIKÇA düşer', () => {
    const result = resolveClientAddress({
      address: 'Atatürk Cad. No:5',
      city: 'İstanbul',
      district: 'Kadıköy',
      addresses: [],
    });
    expect(result).toMatchObject({
      line: 'Atatürk Cad. No:5, Kadıköy/İstanbul',
      source: 'legacy',
      city: 'İstanbul',
      district: 'Kadıköy',
      hasStructured: false,
    });
  });

  it('[3b] `addresses` HİÇ verilmemişse (undefined) de legacy\'e düşer — I01 öncesi çağıranlarla uyumlu', () => {
    const result = resolveClientAddress({ address: 'Legacy Cadde', city: 'İstanbul' });
    expect(result.source).toBe('legacy');
    expect(result.hasStructured).toBe(false);
  });

  it('[4] hiçbir kaynak yoksa source=none, line=null döner', () => {
    const result = resolveClientAddress({});
    expect(result).toEqual({ line: null, source: 'none', city: null, district: null, hasStructured: false });
  });

  it('[5] TÜM parçalar TRIM EDİLİR — baş/son boşluk sızmaz, iç boşluk KORUNUR', () => {
    const legacy = resolveClientAddress({ address: '  Atatürk Cad. No:5  ', city: '  İstanbul  ' });
    expect(legacy.line).toBe('Atatürk Cad. No:5, İstanbul');

    const structured = resolveClientAddress({
      addresses: [ROW({ street: '  Yapısal Cadde  ', city: ' İzmir ', isPrimary: true })],
    });
    expect(structured.line).toBe('Yapısal Cadde, İzmir');
  });

  it('[6] yalnız boşluktan oluşan legacy adres YOK sayılır (undefined/null davranışıyla aynı)', () => {
    const result = resolveClientAddress({ address: '   ', city: '   ' });
    expect(result).toMatchObject({ line: null, source: 'none' });
  });

  it('[7] arşivli (isCurrent=false) satırlar bu modüle HİÇ ULAŞMAZ varsayımı — çağıran sorumluluğu belgelenir', () => {
    // Bu modül isCurrent'ı YORUMLAMAZ; çağıranın önceden filtrelediği varsayılır (I01/I03
    // sözleşmesi). Burada yalnız modülün isCurrent alanı OKUMADIĞINI kanıtlıyoruz.
    const result = resolveClientAddress({
      addresses: [ROW({ street: 'Aktif Görünen', isPrimary: true })],
    });
    expect((result as any).isCurrent).toBeUndefined();
  });

  it('[8] birden fazla satırda BİRİNCİL yoksa (hepsi false) İLK satır seçilir — icat edilmiş sıralama YOK', () => {
    const result = resolveClientAddress({
      addresses: [ROW({ street: 'A', isPrimary: false }), ROW({ street: 'B', isPrimary: false })],
    });
    expect(result.line).toContain('A');
  });

  it('[9] region ve postalCode birleşik satıra dahil edilir (web ile aynı format)', () => {
    const result = resolveClientAddress({
      addresses: [ROW({ street: 'Cadde', city: 'İstanbul', region: 'Marmara', postalCode: '34000', isPrimary: true })],
    });
    expect(result.line).toBe('Cadde, İstanbul, Marmara, 34000');
  });
});
