/**
 * OWN-12 ADIM C — KAPANIS OLCUTU: ortak modelin GERCEKTEN TUKETILDIGI statik kanit.
 *
 * Owner kuralı (2026-09-06): "Ortak mantigin yalniz dosyaya cikarilmis olmasi degil, ilgili
 * tuketiciler tarafindan KULLANILMASI kapanis olcutudur."
 *
 * Deger esitligini olcen davranis testleri bunu KANITLAMAZ: kopya bir uygulama da ayni degerleri
 * uretebilir (nitekim birlestirmeden onceki kod da uretiyordu). Bu guard kaynak metni okur ve
 * uc muvekkil formunun ortak modulu import edip kullandigini dogrular. Ayrica ayrisan bir kopyanin
 * geri gelmesini engeller: elle yazilmis cekirdek varsayilan bloklari REDDEDILIR.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_SRC = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(WEB_SRC, rel), 'utf8');

const SHARED_MODULE = 'client-form-fields';

describe('OWN-12 C — ortak cekirdek model tuketiciler tarafindan KULLANILIYOR', () => {
  it('cases/new (NewClientModal) ortak modeli kullanir', () => {
    const src = read('app/(dashboard)/cases/new/page.tsx');
    expect(src).toContain(SHARED_MODULE);
    expect(src).toContain('emptyClientSharedFormFields(');
    expect(src).toContain('applyScannedClientFields(');
  });

  it('settings/clients (ClientModal) cekirdek baslangic degerlerini ortak modelden kurar', () => {
    const src = read('app/(dashboard)/settings/clients/page.tsx');
    expect(src).toContain(SHARED_MODULE);
    expect(src).toContain('buildClientCoreFields(');
    // Kilit/gorunurluk hesabi da ortak modelden gelir (kopya hesap geri gelmemeli).
    expect(src).toContain('deriveClientFormLockState(');
  });

  it('ClientForm (client-write + bilesen) ortak cekirdegi kullanir', () => {
    const lib = read('lib/client-write.ts');
    expect(lib).toContain(SHARED_MODULE);
    expect(lib).toContain('emptyClientCoreFields(');
    expect(lib).toContain('buildClientCoreFields(');

    const component = read('components/client/client-form.tsx');
    expect(component).toContain('deriveClientFormLockState(');
  });

  it('KOPYA HESAP YOK: kilit hesabi yalniz ortak modulde tanimli', () => {
    const capabilities = read('lib/client-mutation-capabilities.ts');
    expect(capabilities).toContain('export function deriveClientFormLockState');

    for (const rel of [
      'app/(dashboard)/settings/clients/page.tsx',
      'components/client/client-form.tsx',
    ]) {
      const src = read(rel);
      // Tuketicilerde yeniden hesaplanan `mutationBlocked = capabilities ? ...` KALMAMALI.
      expect(src).not.toMatch(/const\s+mutationBlocked\s*=\s*capabilities\s*\?/);
      expect(src).not.toMatch(/const\s+sensitiveLocked\s*=\s*capabilities\s*\?/);
    }
  });

  it('KOPYA VARSAYILAN YOK: api.ts hata yollari kanonik yardimciyi kullanir', () => {
    const src = read('lib/api.ts');
    expect(src).toContain('buildApiHttpError(');
    // Elle kurulan `new Error(error.message || ...)` yollari KALMAMALI.
    expect(src).not.toMatch(/new Error\(\s*error\.message\s*\|\|/);
  });
});
