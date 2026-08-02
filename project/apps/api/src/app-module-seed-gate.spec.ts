/**
 * CLIENT-OWN-13-I02-R3 (owner D01/D02, RATIFIED) — SeedModule deployment-seviyesi runtime
 * closure testleri. `isSeedModuleEnabled()` SAF fonksiyon: gerçek NestJS bootstrap YOK,
 * DB YOK — yalnız process.env okur.
 *
 *  D01 — production'da KOŞULSUZ kapalı (flag'in değeri ÖNEMSİZ).
 *  D02 — test ortamında otomatik açık; diğer ortamlarda yalnız explicit flag ile açık,
 *        varsayılan kapalı.
 */
import { isSeedModuleEnabled } from './app.module';

describe('isSeedModuleEnabled (CLIENT-OWN-13-I02-R3 D01/D02)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('D01: production ortamında KOŞULSUZ kapalı (flag yokken)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CLIENT_SEED_ENDPOINTS_ENABLED;
    expect(isSeedModuleEnabled()).toBe(false);
  });

  it('D01: production + flag=true YİNE kapalı (flag production\'ı EZEMEZ)', () => {
    process.env.NODE_ENV = 'production';
    process.env.CLIENT_SEED_ENDPOINTS_ENABLED = 'true';
    expect(isSeedModuleEnabled()).toBe(false);
  });

  it('D02: test ortamında otomatik açık (flag yokken)', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.CLIENT_SEED_ENDPOINTS_ENABLED;
    expect(isSeedModuleEnabled()).toBe(true);
  });

  it('D02: non-production (development) + flag yok -> varsayılan kapalı', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CLIENT_SEED_ENDPOINTS_ENABLED;
    expect(isSeedModuleEnabled()).toBe(false);
  });

  it('D02: non-production (development) + flag=true -> açık', () => {
    process.env.NODE_ENV = 'development';
    process.env.CLIENT_SEED_ENDPOINTS_ENABLED = 'true';
    expect(isSeedModuleEnabled()).toBe(true);
  });

  it('D02: non-production + flag="TRUE" (büyük harf) -> açık (case-insensitive)', () => {
    process.env.NODE_ENV = 'development';
    process.env.CLIENT_SEED_ENDPOINTS_ENABLED = 'TRUE';
    expect(isSeedModuleEnabled()).toBe(true);
  });

  it('D02: non-production + flag="1" (yanlış değer) -> kapalı (yalnız "true" açar)', () => {
    process.env.NODE_ENV = 'development';
    process.env.CLIENT_SEED_ENDPOINTS_ENABLED = '1';
    expect(isSeedModuleEnabled()).toBe(false);
  });

  it('D02: NODE_ENV tanımsız + flag yok -> varsayılan kapalı', () => {
    delete process.env.NODE_ENV;
    delete process.env.CLIENT_SEED_ENDPOINTS_ENABLED;
    expect(isSeedModuleEnabled()).toBe(false);
  });
});
