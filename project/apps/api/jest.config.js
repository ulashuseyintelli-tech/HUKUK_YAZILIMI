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
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // E-G2a: '@shared/types' tsconfig paths'te tanımlı (→ packages/types/src). Runtime (nest start)
    // path'leri çözer; jest için '@/' deseniyle paralel map gerekir (value-import çözümü).
    '^@shared/types$': '<rootDir>/../../../packages/types/src',
    '^@shared/types/(.*)$': '<rootDir>/../../../packages/types/src/$1',
  },
};
