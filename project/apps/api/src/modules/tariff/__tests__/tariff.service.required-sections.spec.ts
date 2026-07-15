/**
 * FEE-TARIFF-2026-001A-TEST — regresyon kilidi.
 *
 * PR #997, `TariffService.toSharedFormat()`'a fail-closed bir guard ekledi: 5 zorunlu
 * bölümden (fixed_fees/rate_fees/postage/interest_rates/penalties) biri eksikse artık
 * sessizce {} / 0 üretmek yerine `MissingTariffSectionError` fırlatıyor. Bu guard'ın kendisi
 * committed bir test taşımıyordu (yalnız ad-hoc js-yaml reprodüksiyonuyla doğrulanmıştı) —
 * bu dosya o boşluğu kapatır.
 *
 * DÜZELTME (2026-07-15, GO-ANALYZE + owner onayı): dosya ilk yazıldığında (PR #1015,
 * 2026-07-10 00:21) gerçek 2026.yaml, aynı günün erken saatlerinde eklenen `penalties`
 * bölümünü ZATEN içeriyordu (PR #1004, 2026-07-09 22:03) — "2026.yaml penalties eksik"
 * varsayımı test yazılırken bile geçersizdi (stale-on-arrival), sonradan bayatlamadı.
 * Gerçek 2025.yaml/2026.yaml dosyalarını "eksik fixture" gibi kullanan testler kaldırıldı;
 * yerine test-only, kasıtlı-eksik bir fixture ile TariffService'in gerçek
 * loadAllTariffs() → toSharedFormat() zincirini (yalnız fs sınırında mock) egzersiz eden
 * bir blok geldi. Production kodu ve production tariff YAML dosyaları bu değişiklikte
 * dokunulmamıştır.
 */

import * as fs from 'fs';
import * as path from 'path';
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

  describe('test-only kasıtlı-eksik fixture — gerçek dosya yükleme/parse/validation zinciri (fs mock sınırında)', () => {
    // Production'daki gerçek 2025.yaml/2026.yaml dosyalarına HİÇ dokunulmaz: yalnız
    // fs.existsSync/readdirSync/readFileSync bu describe kapsamında mocklanır; TariffService
    // kaynağı, js-yaml parse'ı ve toSharedFormat() required-section guard'ı DEĞİŞTİRİLMEMİŞ,
    // gerçek koddur — mock yalnız işletim sistemi dosya-okuma sınırını sahteler.
    const FIXTURE_COMPLETE_YEAR = 9001;
    const FIXTURE_MISSING_PENALTIES_YEAR = 9002;

    const FIXTURE_COMPLETE_YAML = `
version: 1
year: ${FIXTURE_COMPLETE_YEAR}
effective_date: '${FIXTURE_COMPLETE_YEAR}-01-01'
fixed_fees:
  x:
    amount: 1
    label: x
    item_type: FEE
    applies_to: []
rate_fees:
  x:
    rate: 0.1
    label: x
    item_type: FEE
    base: principal
    applies_to: []
postage:
  x:
    amount: 1
    label: x
    description: x
interest_rates:
  TRY:
    YASAL:
      - start_date: '${FIXTURE_COMPLETE_YEAR}-01-01'
        rate: 10
penalties:
  x:
    default_rate: 0.1
    label: x
`;

    const FIXTURE_MISSING_PENALTIES_YAML = `
version: 1
year: ${FIXTURE_MISSING_PENALTIES_YEAR}
effective_date: '${FIXTURE_MISSING_PENALTIES_YEAR}-01-01'
fixed_fees:
  x:
    amount: 1
    label: x
    item_type: FEE
    applies_to: []
rate_fees:
  x:
    rate: 0.1
    label: x
    item_type: FEE
    base: principal
    applies_to: []
postage:
  x:
    amount: 1
    label: x
    description: x
interest_rates:
  TRY:
    YASAL:
      - start_date: '${FIXTURE_MISSING_PENALTIES_YEAR}-01-01'
        rate: 10
`;

    let existsSpy: jest.SpyInstance;
    let readdirSpy: jest.SpyInstance;
    let readFileSpy: jest.SpyInstance;

    function mockConfigDir(fileName: string, yamlContent: string) {
      existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      readdirSpy = (jest.spyOn(fs, 'readdirSync') as any).mockReturnValue([fileName]);
      readFileSpy = (jest.spyOn(fs, 'readFileSync') as any).mockImplementation((filePath: any) => {
        if (path.basename(filePath) === fileName) {
          return yamlContent;
        }
        throw new Error(`Beklenmeyen readFileSync çağrısı (mock kapsamı dışı): ${filePath}`);
      });
    }

    afterEach(() => {
      existsSpy?.mockRestore();
      readdirSpy?.mockRestore();
      readFileSpy?.mockRestore();
    });

    it('tam (eksiksiz) fixture: gerçek load/parse zincirinden başarıyla geçer', () => {
      mockConfigDir(`${FIXTURE_COMPLETE_YEAR}.yaml`, FIXTURE_COMPLETE_YAML);
      const svc = new TariffService();
      const tariff = svc.getTariff(FIXTURE_COMPLETE_YEAR);
      expect(tariff).not.toBeNull();
      expect(tariff!.year).toBe(FIXTURE_COMPLETE_YEAR);
      expect(tariff!.penalties).toBeDefined();
      expect(Object.keys(tariff!.penalties).length).toBeGreaterThan(0);
    });

    describe('penalties eksik fixture', () => {
      let svc: TariffService;

      beforeEach(() => {
        mockConfigDir(`${FIXTURE_MISSING_PENALTIES_YEAR}.yaml`, FIXTURE_MISSING_PENALTIES_YAML);
        svc = new TariffService();
      });

      it('gerçek load/parse/validation zincirinde MissingTariffSectionError fırlatır', () => {
        expect(() => svc.getTariff(FIXTURE_MISSING_PENALTIES_YEAR)).toThrow(MissingTariffSectionError);
      });

      it('hata year ve section alanlarını doğru taşır', () => {
        expect.assertions(3);
        try {
          svc.getTariff(FIXTURE_MISSING_PENALTIES_YEAR);
        } catch (e: any) {
          expect(e).toBeInstanceOf(MissingTariffSectionError);
          expect(e.year).toBe(FIXTURE_MISSING_PENALTIES_YEAR);
          expect(e.section).toBe('penalties');
        }
      });

      it('native TypeError beklenmez; isimli MissingTariffSectionError beklenir', () => {
        expect.assertions(2);
        try {
          svc.getTariff(FIXTURE_MISSING_PENALTIES_YEAR);
        } catch (e: any) {
          expect(e).not.toBeInstanceOf(TypeError);
          expect(e.name).toBe('MissingTariffSectionError');
        }
      });
    });
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
});
