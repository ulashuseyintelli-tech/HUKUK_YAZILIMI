module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  // setupFiles: test framework + test-file modülleri (@prisma/client require) YÜKLENMEDEN önce çalışır
  // → DATABASE_URL'i fail-safe pinler, prod/.env sızıntısını engeller (bkz test/test-db-env.ts).
  setupFiles: ['<rootDir>/../test/jest-db-setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/../jest.setup.ts'],
  testRegex: '.*\\.spec\\.ts$',
  // manifest-retry-worker-safety: vitest ile yazılmış (import from 'vitest'); vitest kurulu DEĞİL →
  // jest'in çalıştırması anlamsız (module-not-found fail). jest'ten exclude (ayrı borç: vitest kur / jest'e çevir / sil).
  testPathIgnorePatterns: ['/node_modules/', 'manifest-retry-worker-safety\\.integration\\.spec\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
