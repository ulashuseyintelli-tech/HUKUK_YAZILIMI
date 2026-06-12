/**
 * DB gerektiren integration suite'leri için fail-safe gate.
 *
 * DATABASE_URL yoksa (yani TEST_DATABASE_URL verilmemişse — bkz test/test-db-env.ts setupFiles)
 * tüm suite `describe.skip` ile atlanır → default `npx jest` dev DB'ye bağlanmaz, kırmızı olmaz.
 * TEST_DATABASE_URL güvenli disposable verilince DATABASE_URL dolar → suite çalışır.
 *
 * Kullanım: `describeDb('...', () => { ... })` (outer describe yerine).
 */
export const describeDb: jest.Describe = process.env.DATABASE_URL ? describe : describe.skip;
