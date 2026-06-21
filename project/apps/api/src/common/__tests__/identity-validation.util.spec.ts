/**
 * BUG-1A — TCKN/VKN checksum doğrulama testleri (saf). Tüm örnekler SENTETİK (gerçek PII yok, KVKK).
 */
import {
  isValidTckn,
  isValidVkn,
  sanitizeOcrIdentityNo,
  looksLikeCompanyName,
  inferPartyType,
} from '../identity-validation.util';

describe('BUG-1A isValidTckn', () => {
  it('geçerli TCKN → true', () => {
    expect(isValidTckn('10000000146')).toBe(true); // kanonik sentetik test TCKN
  });
  it('checksum bozuk → false', () => {
    expect(isValidTckn('12345678901')).toBe(false);
    expect(isValidTckn('10000000140')).toBe(false);
  });
  it('yanlış uzunluk (10/12 hane) → false', () => {
    expect(isValidTckn('1000000014')).toBe(false);
    expect(isValidTckn('100000001460')).toBe(false);
  });
  it('ilk hane 0 → false', () => {
    expect(isValidTckn('01000000146')).toBe(false);
  });
  it('rakam dışı / boş / null → false', () => {
    expect(isValidTckn('abcdefghijk')).toBe(false);
    expect(isValidTckn('')).toBe(false);
    expect(isValidTckn(null)).toBe(false);
    expect(isValidTckn(undefined)).toBe(false);
  });
  it('boşluk/nokta temizlenir', () => {
    expect(isValidTckn('100 000 00146')).toBe(true);
  });
});

describe('BUG-1A isValidVkn', () => {
  it('geçerli VKN → true', () => {
    expect(isValidVkn('1234567890')).toBe(true);
    expect(isValidVkn('1111111114')).toBe(true);
  });
  it('checksum bozuk → false', () => {
    expect(isValidVkn('1111111110')).toBe(false);
  });
  it('yanlış uzunluk (9/11 hane) → false', () => {
    expect(isValidVkn('123456789')).toBe(false);
    expect(isValidVkn('12345678901')).toBe(false);
  });
  it('boş/null → false', () => {
    expect(isValidVkn('')).toBe(false);
    expect(isValidVkn(null)).toBe(false);
  });
});

describe('BUG-1A sanitizeOcrIdentityNo (tip-katı)', () => {
  it('INDIVIDUAL + geçerli TCKN → temiz rakam', () => {
    expect(sanitizeOcrIdentityNo('10000000146', 'INDIVIDUAL')).toBe('10000000146');
  });
  it('INDIVIDUAL + 10-hane misread (Şükrü senaryosu) → undefined (DÜŞER)', () => {
    expect(sanitizeOcrIdentityNo('1234567890', 'INDIVIDUAL')).toBeUndefined();
  });
  it('INDIVIDUAL + checksum bozuk TCKN → undefined', () => {
    expect(sanitizeOcrIdentityNo('12345678901', 'INDIVIDUAL')).toBeUndefined();
  });
  it('COMPANY + geçerli VKN → temiz rakam', () => {
    expect(sanitizeOcrIdentityNo('1234567890', 'COMPANY')).toBe('1234567890');
  });
  it('COMPANY + TCKN-benzeri 11-hane → undefined (şirkete TCKN kabul edilmez)', () => {
    expect(sanitizeOcrIdentityNo('10000000146', 'COMPANY')).toBeUndefined();
  });
  it('PUBLIC_INSTITUTION → pass-through (kural yok, dokunma)', () => {
    expect(sanitizeOcrIdentityNo('123', 'PUBLIC_INSTITUTION')).toBe('123');
  });
  it('boş/null → undefined', () => {
    expect(sanitizeOcrIdentityNo('', 'INDIVIDUAL')).toBeUndefined();
    expect(sanitizeOcrIdentityNo(null, 'COMPANY')).toBeUndefined();
  });
});

describe('BUG looksLikeCompanyName — unvan eki sezgisi (diyakritik-duyarsız)', () => {
  it('ANONİM ŞİRKETİ (diyakritikli) → true', () => {
    expect(looksLikeCompanyName('GORKA KOZMETİK SANAYİ VE TİCARET ANONİM ŞİRKETİ')).toBe(true);
  });
  it('diyakritiksiz "ANONIM SIRKETI" (OCR katlaması) → true', () => {
    expect(looksLikeCompanyName('GORKA KOZMETIK ANONIM SIRKETI')).toBe(true);
  });
  it('LTD. ŞTİ. / A.Ş. / AŞ / LİMİTED ŞİRKETİ → true', () => {
    expect(looksLikeCompanyName('XYZ İNŞAAT LTD. ŞTİ.')).toBe(true);
    expect(looksLikeCompanyName('ABC GIDA A.Ş.')).toBe(true);
    expect(looksLikeCompanyName('ABC GIDA AŞ')).toBe(true);
    expect(looksLikeCompanyName('DEF TEKSTİL LİMİTED ŞİRKETİ')).toBe(true);
  });
  it('gerçek şahıs adı → false (regresyon yok)', () => {
    expect(looksLikeCompanyName('AHMET YILMAZ')).toBe(false);
    expect(looksLikeCompanyName('Ayşe Kaya')).toBe(false);
    expect(looksLikeCompanyName('Hasan Aslan')).toBe(false); // "ASLAN" → yanlış-pozitif DEĞİL
    expect(looksLikeCompanyName('Başak Demir')).toBe(false); // "BAŞAK" → yanlış-pozitif DEĞİL
  });
  it('boş / null / undefined → false', () => {
    expect(looksLikeCompanyName('')).toBe(false);
    expect(looksLikeCompanyName(null)).toBe(false);
    expect(looksLikeCompanyName(undefined)).toBe(false);
  });
});

describe('BUG inferPartyType — kimlik no önceliği + isim sezgisi', () => {
  it('geçerli VKN (10 hane) → COMPANY (isim ne olursa olsun)', () => {
    expect(inferPartyType('Herhangi İsim', '1234567890')).toBe('COMPANY');
    expect(inferPartyType('AHMET YILMAZ', '1234567890')).toBe('COMPANY'); // kimlik > isim
  });
  it('geçerli TCKN (11 hane) → INDIVIDUAL', () => {
    expect(inferPartyType('Herhangi İsim', '10000000146')).toBe('INDIVIDUAL');
  });
  it('kimlik no yok + unvan eki → COMPANY', () => {
    expect(inferPartyType('GORKA KOZMETİK SANAYİ VE TİCARET ANONİM ŞİRKETİ')).toBe('COMPANY');
  });
  it('kimlik no yok + şahıs adı → INDIVIDUAL (varsayılan, regresyon yok)', () => {
    expect(inferPartyType('AHMET YILMAZ')).toBe('INDIVIDUAL');
    expect(inferPartyType('AHMET YILMAZ', undefined)).toBe('INDIVIDUAL');
    expect(inferPartyType('AHMET YILMAZ', null)).toBe('INDIVIDUAL');
  });
  it('geçersiz/eksik kimlik no → isim sezgisine düşer', () => {
    expect(inferPartyType('ABC GIDA A.Ş.', '0000')).toBe('COMPANY');
    expect(inferPartyType('AHMET YILMAZ', '0000')).toBe('INDIVIDUAL');
  });
});
