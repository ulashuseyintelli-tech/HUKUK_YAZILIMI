const path = require('path');

// DV-198/f karar (b): ts-jest yalıtılmış çeviri (isolatedModules) yalnız `import` satırlarına bakarak
// karar verir; `@Req() req: Request` gibi süslenmiş imzadaki `express` tip içe aktarımını tip bilgili
// moddaki gibi eleyemez ve `require('express')` üretir. `express` @hukuk/api'nin doğrudan bağımlılığı
// değildir (pnpm yalnız @nestjs/platform-express altında kurar) → testte AYNI kopyaya eşlenir.
// Yüklenen modül gerçek express'tir (platform-express'in kullandığı tek kopya); `Request` / `Response`
// adları çalışma zamanında tanımsız olduğundan süsleyici meta verisi tip bilgili moddaki gibi `Object` kalır.
const EXPRESS_ENTRY = require.resolve('express', {
  paths: [path.dirname(require.resolve('@nestjs/platform-express/package.json'))],
});

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  // setupFiles: test framework + test-file modülleri (@prisma/client require) YÜKLENMEDEN önce çalışır
  // → DATABASE_URL'i fail-safe pinler, prod/.env sızıntısını engeller (bkz test/test-db-env.ts).
  setupFiles: ['<rootDir>/../test/jest-db-setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/../jest.setup.ts'],
  testRegex: '.*\\.spec\\.ts$',
  // manifest-retry-worker-safety 2026-09-20'de Jest'e uyarlandi (vitest import'u kaldirildi) →
  // dosyaya ozel dislama KALDIRILDI. Genel dislama (/node_modules/) korunur.
  testPathIgnorePatterns: ['/node_modules/'],
  // DV-198/f karar (b): tip bilgili çeviri (dil hizmeti) yerine dosya başına yalıtılmış çeviri.
  // Kurulu ts-jest 29.4.6'da ts-jest seçeneği `isolatedModules` kullanımdan kalkmıştır (v30'da
  // kaldırılacak); geçerli yol tsconfig `isolatedModules`'tır. Üretim tsconfig'i DEĞİŞMEZ: aşağıdaki
  // satır içi `tsconfig` nesnesi yalnız jest dönüşümünde tsconfig.json'un üzerine eklenir.
  // Tip denetimi jest'te zaten kapalıdır (`diagnostics: false`); CI'daki `tsc --noEmit -p
  // tsconfig.prod.json` adımı değişmez.
  // Bilinen sınır: tip bilgisi gerektiren süsleyici meta verisi (enum / dize birleşimi takma adıyla
  // yazılmış alan ve parametreler — tip bilgili modda `String`) yalıtılmış modda `Object` olur;
  // üretim derlemesi (tsc) etkilenmez. Ölçüm ve etki DV-198/f PR gövdesindedir.
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false, tsconfig: { isolatedModules: true } }],
  },
  // DV-198/f: süreç başına yığın görünürlüğü (her test dosyası satırına "N MB heap size" ekler);
  // yalnız günlük çıktısıdır, test seçimini / sonucunu değiştirmez.
  logHeapUsage: true,
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // E-G2a: '@shared/types' tsconfig paths'te tanımlı (→ packages/types/src). Runtime (nest start)
    // path'leri çözer; jest için '@/' deseniyle paralel map gerekir (value-import çözümü).
    '^@shared/types$': '<rootDir>/../../../packages/types/src',
    '^@shared/types/(.*)$': '<rootDir>/../../../packages/types/src/$1',
    // DV-198/f: yukarıdaki EXPRESS_ENTRY açıklamasına bakınız (yalnız tam `express` adı).
    '^express$': EXPRESS_ENTRY,
  },
};
