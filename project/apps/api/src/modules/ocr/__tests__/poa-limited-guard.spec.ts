/**
 * Süreli-vekalet parser fix testleri.
 * Bug: AI/parser, müvekkilin kimlik-kartı geçerlilik tarihini / düzenleme tarihini vekaletin
 * SÜRESİ sanıp "Süreli Vekalet ...e kadar" üretiyordu (gerçek HÜSEYİN DEMİRBAŞ vekaleti: 11/02/2026,
 * süreli ibaresi YOK → yanlışlıkla 30.11.2022'e kadar süreli denmişti).
 */

import { OcrService, sanitizeLimitedPoa } from '../ocr.service';

describe('sanitizeLimitedPoa (sureli vekalet sağduyu guard)', () => {
  it('validUntil yoksa → süresiz (uydurma süreli engellenir)', () => {
    expect(sanitizeLimitedPoa(true, undefined, '2026-02-11')).toEqual({ isLimited: false, validUntil: undefined });
  });

  it('validUntil < poaDate (kimlik-kartı/eski tarih karışması) → süresiz', () => {
    // gerçek bug senaryosu: poaDate 2026, validUntil 2022 → mantıksız → süresiz
    expect(sanitizeLimitedPoa(true, '2022-11-30', '2026-02-11')).toEqual({ isLimited: false, validUntil: undefined });
  });

  it('validUntil == poaDate (düzenleme tarihini bitiş sanma) → süresiz', () => {
    // ekran görüntüsündeki durum: "30.11.2022'e kadar" = düzenleme tarihiyle aynı
    expect(sanitizeLimitedPoa(true, '2022-11-30', '2022-11-30')).toEqual({ isLimited: false, validUntil: undefined });
  });

  it('validUntil > poaDate → GERÇEK süreli korunur', () => {
    expect(sanitizeLimitedPoa(true, '2030-01-01', '2026-02-11')).toEqual({ isLimited: true, validUntil: '2030-01-01' });
  });

  it('isLimited=false → her hâlükârda süresiz', () => {
    expect(sanitizeLimitedPoa(false, '2030-01-01', '2026-02-11')).toEqual({ isLimited: false, validUntil: undefined });
  });

  it('poaDate yoksa ve validUntil varsa → korunur (kıyas yapılamaz)', () => {
    expect(sanitizeLimitedPoa(true, '2030-01-01', undefined)).toEqual({ isLimited: true, validUntil: '2030-01-01' });
  });
});

describe('OcrService.parsePoaWithRules (entegrasyon)', () => {
  const buildService = () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as any; // OPENAI yok → kural yolu
    return new OcrService(config);
  };

  it('süresiz vekalet (açık "tarihine kadar geçerlidir" YOK) → isLimited=false', () => {
    const svc = buildService();
    // HÜSEYİN DEMİRBAŞ benzeri: düzenleme tarihi + kimlik kartı geçerlilik tarihi var, süreli ibaresi YOK
    const text =
      'VEKALETNAME 11/02/2026 tarihinde GAZİOSMANPAŞA 15. Noteri huzurunda yevmiye 02378 sayi ile ' +
      'HÜSEYİN DEMİRBAŞ TCKN 63433142860 30.11.2032 gecerlilik tarihli Kimlik Kartina istinaden ' +
      'Av. FATMA ULUCA TELLİ ve Av. ULAŞ HÜSEYİN TELLİ yi ahzu kabza feragat sulh yetkileriyle vekil tayin etmistir.';
    const r = (svc as any).parsePoaWithRules(text);
    expect(r.isLimited).toBe(false);
    expect(r.validUntil).toBeUndefined();
    expect(r.poaDate).toBe('2026-02-11'); // ilk tarih = düzenleme tarihi
  });

  it('gerçek süreli ("...tarihine kadar geçerlidir", bitiş > düzenleme) → isLimited=true', () => {
    const svc = buildService();
    const text =
      'VEKALETNAME 11/02/2026 tarihinde duzenlenmistir. Bu vekalet 01/01/2030 tarihine kadar gecerlidir. ' +
      'Av. ULAŞ HÜSEYİN TELLİ vekil tayin edilmistir.';
    const r = (svc as any).parsePoaWithRules(text);
    expect(r.isLimited).toBe(true);
    expect(r.validUntil).toBe('2030-01-01');
  });

  it('açık ibare olsa bile bitiş <= düzenleme ise guard eler → isLimited=false', () => {
    const svc = buildService();
    const text =
      'VEKALETNAME 11/02/2026 tarihinde duzenlenmistir. 30/11/2022 tarihine kadar gecerlidir. ' +
      'Av. ULAŞ HÜSEYİN TELLİ vekil.';
    const r = (svc as any).parsePoaWithRules(text);
    expect(r.isLimited).toBe(false);
    expect(r.validUntil).toBeUndefined();
  });
});
