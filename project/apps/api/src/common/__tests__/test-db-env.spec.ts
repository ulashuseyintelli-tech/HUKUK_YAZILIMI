/**
 * Test-infra fail-safe guard — resolveTestDatabaseUrl (DB-free unit).
 * Kabul: default skip · dev hukuk_db throw · non-test isim throw · güvenli disposable runs.
 */
import { resolveTestDatabaseUrl } from '../../../test/test-db-env';

describe('resolveTestDatabaseUrl (test-infra fail-safe)', () => {
  it('TEST_DATABASE_URL yok → "" (gelen DATABASE_URL/.env yok sayılır)', () => {
    expect(
      resolveTestDatabaseUrl({
        DATABASE_URL: 'postgresql://postgres:1@localhost:5432/hukuk_db?schema=public',
      } as any),
    ).toBe('');
  });

  it('TEST_DATABASE_URL dev hukuk_db → THROW', () => {
    expect(() =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: 'postgresql://postgres:1@localhost:5432/hukuk_db?schema=public',
      } as any),
    ).toThrow(/hukuk_db|dev/i);
  });

  it('TEST_DATABASE_URL non-test isim (hukuk_prod) → THROW', () => {
    expect(() =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: 'postgresql://postgres:1@localhost:5432/hukuk_prod',
      } as any),
    ).toThrow(/güvenli değil|test\/gate/i);
  });

  it('TEST_DATABASE_URL güvenli disposable (hukuk_test_gate) → kendisi', () => {
    const u = 'postgresql://postgres:1@localhost:5432/hukuk_test_gate?schema=public';
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: u } as any)).toBe(u);
  });

  it('hukuk_*_gate kalıbı kabul edilir', () => {
    const u = 'postgresql://postgres:1@localhost:5432/hukuk_bridge_gate';
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: u } as any)).toBe(u);
  });

  it('geçersiz URL → THROW', () => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: 'not-a-url' } as any)).toThrow();
  });
});
