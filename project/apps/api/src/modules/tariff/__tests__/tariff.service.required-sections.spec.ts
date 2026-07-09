/**
 * FEE-TARIFF-2026-001A-TEST — regresyon kilidi.
 *
 * PR #997, `TariffService.toSharedFormat()`'a fail-closed bir guard ekledi: 5 zorunlu
 * bölümden (fixed_fees/rate_fees/postage/interest_rates/penalties) biri eksikse artık
 * sessizce {} / 0 üretmek yerine `MissingTariffSectionError` fırlatıyor. Bu guard'ın kendisi
 * committed bir test taşımıyordu (yalnız ad-hoc js-yaml reprodüksiyonuyla doğrulanmıştı) —
 * bu dosya o boşluğu kapatır ve gerçek 2025.yaml/2026.yaml dosyalarına karşı çalışır.
 */

import { TariffService, MissingTariffSectionError, TariffData } from '../tariff.service';

describe('TariffService — fail-closed required tariff sections (FEE-TARIFF-2026-001A)', () => {
  let service: TariffService;

  beforeEach(() => {
    // Gerçek apps/api/src/config/tariffs/{2025,2026}.yaml dosyalarını okur (mock yok).
    service = new TariffService();
  });

  it('1) 2025.yaml tam yapı ile başarılı parse/convert olur', () => {
    const tariff = service.getTariff(2025);
    expect(tariff).not.toBeNull();
    expect(tariff!.year).toBe(2025);
    expect(tariff!.penalties).toBeDefined();
    expect(Object.keys(tariff!.penalties).length).toBeGreaterThan(0);
  });

  it('2) 2026.yaml penalties eksik olduğu için MissingTariffSectionError fırlatır', () => {
    expect(() => service.getTariff(2026)).toThrow(MissingTariffSectionError);
  });

  it('3) hata year=2026 ve section=penalties taşır', () => {
    expect.assertions(3);
    try {
      service.getTariff(2026);
    } catch (e: any) {
      expect(e).toBeInstanceOf(MissingTariffSectionError);
      expect(e.year).toBe(2026);
      expect(e.section).toBe('penalties');
    }
  });

  it('4) fixed_fees/rate_fees/postage/interest_rates/penalties alanlarından herhangi biri eksikse sessiz {} veya 0 dönmez, MissingTariffSectionError fırlatır', () => {
    const completeData: TariffData = {
      version: 1,
      year: 2099,
      effective_date: '2099-01-01',
      fixed_fees: { x: { amount: 1, label: 'x', item_type: 'FEE', applies_to: [] } },
      rate_fees: { x: { rate: 0.1, label: 'x', item_type: 'FEE', base: 'principal', applies_to: [] } },
      postage: { x: { amount: 1, label: 'x', description: 'x' } },
      interest_rates: { TRY: { YASAL: [{ start_date: '2099-01-01', rate: 10 }] } },
      penalties: { x: { default_rate: 0.1, label: 'x' } },
    };
    const requiredSections: Array<keyof TariffData> = [
      'fixed_fees',
      'rate_fees',
      'postage',
      'interest_rates',
      'penalties',
    ];

    for (const section of requiredSections) {
      const broken = { ...completeData, [section]: undefined } as unknown as TariffData;
      expect(() => (service as any).toSharedFormat(broken)).toThrow(MissingTariffSectionError);
      try {
        (service as any).toSharedFormat(broken);
      } catch (e: any) {
        expect(e.section).toBe(section);
      }
    }
  });

  it('5) native TypeError beklenmez; isimli domain/config error (MissingTariffSectionError) beklenir', () => {
    expect.assertions(2);
    try {
      service.getTariff(2026);
    } catch (e: any) {
      expect(e).not.toBeInstanceOf(TypeError);
      expect(e.name).toBe('MissingTariffSectionError');
    }
  });
});
