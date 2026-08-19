/**
 * OFFICE-AUTH-PUBLIC-USER-PROJECTION-R02 — auth public-user allowlist sözleşmesi.
 *
 * ÖNCEKİ SÖZLEŞME (F-B01-01, SUPERSEDED): `/auth/me` için BLACKLIST
 * (`AUTH_ME_CREDENTIAL_FIELDS = ["passwordHash","tokenVersion"]` + `delete`). Blacklist,
 * şemaya sonradan eklenen her alanı sessizce sızdırdığı için fail-open'dı ve `login`/
 * `register` yüzeylerini hiç kapsamıyordu (`sanitizeUser` da yalnız `passwordHash` düşürüyordu).
 *
 * R02 SÖZLEŞMESİ: TEK merkezi ALLOWLIST (`toPublicAuthUser` / `toPublicAuthTenant`),
 * register · login · `/auth/me` yüzeylerinin ÜÇÜNDE de kullanılır. Bu spec sözleşmeyi
 * differential olarak kilitler: çıktının anahtar kümesi allowlist ile BİREBİR eşit olmalıdır.
 *
 * Buradaki credential-benzeri değerlerin tamamı SENTETİKTİR.
 */
import {
  PUBLIC_AUTH_TENANT_FIELDS,
  PUBLIC_AUTH_USER_FIELDS,
  toPublicAuthTenant,
  toPublicAuthUser,
} from '../user-public-projection';

/** Prisma `User` satırının TÜM skaler alanları + `include: { tenant: true }` ile gelen tenant. */
const fullUserRow = (over: Record<string, unknown> = {}) =>
  ({
    id: 'u1',
    tenantId: 't1',
    email: 'ada@invalid.example',
    passwordHash: 'SYNTHETIC-NOT-A-REAL-BCRYPT',
    name: 'Ada',
    surname: 'Lovelace',
    role: 'USER',
    isActive: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    tokenVersion: 3,
    passwordChangedAt: new Date('2026-01-01T00:00:00Z'),
    tenant: {
      id: 't1',
      name: 'TENANT AD',
      slug: 'tenant-slug',
      plan: 'PRO',
      settings: { internal: 'TENANT-INTERNAL-CONFIG' },
      accountType: 'PROFESSIONAL',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-02T00:00:00Z'),
    },
    ...over,
  }) as never;

const FORBIDDEN_USER_KEYS = [
  'password',
  'passwordHash',
  'tokenVersion',
  'passwordChangedAt',
  'isActive',
  'createdAt',
  'updatedAt',
];
const FORBIDDEN_TENANT_KEYS = ['settings', 'plan', 'accountType', 'createdAt', 'updatedAt'];

describe('R02 — auth public-user ALLOWLIST', () => {
  it('T10: Prisma tam satırı verilse dahi yalnız allowlist çıkar (differential)', () => {
    const out = toPublicAuthUser(fullUserRow()) as unknown as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual([...PUBLIC_AUTH_USER_FIELDS, 'tenant'].sort());
    expect(Object.keys(out.tenant as Record<string, unknown>).sort()).toEqual(
      [...PUBLIC_AUTH_TENANT_FIELDS].sort(),
    );
  });

  it('T5: passwordHash yok (anahtar tamamen bulunmaz)', () => {
    const out = toPublicAuthUser(fullUserRow()) as unknown as Record<string, unknown>;
    expect('passwordHash' in out).toBe(false);
    expect(JSON.stringify(out)).not.toContain('SYNTHETIC-NOT-A-REAL-BCRYPT');
  });

  it('T6: tokenVersion yok', () => {
    const out = toPublicAuthUser(fullUserRow()) as unknown as Record<string, unknown>;
    expect('tokenVersion' in out).toBe(false);
  });

  it('T7: passwordChangedAt yok', () => {
    const out = toPublicAuthUser(fullUserRow()) as unknown as Record<string, unknown>;
    expect('passwordChangedAt' in out).toBe(false);
  });

  it('T8: Tenant.settings yok (ve diğer tenant-internal alanlar)', () => {
    const out = toPublicAuthUser(fullUserRow()) as unknown as Record<string, unknown>;
    const tenant = out.tenant as Record<string, unknown>;
    for (const key of FORBIDDEN_TENANT_KEYS) expect(key in tenant).toBe(false);
    expect(JSON.stringify(out)).not.toContain('TENANT-INTERNAL-CONFIG');
  });

  it('yasaklı User alanlarının HİÇBİRİ çıkmaz', () => {
    const out = toPublicAuthUser(fullUserRow()) as unknown as Record<string, unknown>;
    for (const key of FORBIDDEN_USER_KEYS) expect(key in out).toBe(false);
  });

  it('T9: şemaya sonradan eklenen hassas alan simülasyonu → sızmaz (fail-closed)', () => {
    const out = toPublicAuthUser(
      fullUserRow({
        mfaSecret: 'YENI-SIR',
        resetToken: 'RESET-TOKEN-DEGERI',
        inviteToken: 'INVITE-TOKEN-DEGERI',
      }),
    ) as unknown as Record<string, unknown>;
    const raw = JSON.stringify(out);
    expect(raw).not.toContain('YENI-SIR');
    expect(raw).not.toContain('RESET-TOKEN-DEGERI');
    expect(raw).not.toContain('INVITE-TOKEN-DEGERI');
    expect(Object.keys(out).sort()).toEqual([...PUBLIC_AUTH_USER_FIELDS, 'tenant'].sort());
  });

  it('izin verilen alanların DEĞERLERİ korunur', () => {
    const out = toPublicAuthUser(fullUserRow()) as unknown as Record<string, unknown>;
    expect(out).toMatchObject({
      id: 'u1',
      tenantId: 't1',
      email: 'ada@invalid.example',
      name: 'Ada',
      surname: 'Lovelace',
      role: 'USER',
    });
    expect((out.tenant as Record<string, unknown>).slug).toBe('tenant-slug');
  });

  it('tenant yoksa/null ise `tenant` anahtarı da YOKTUR (register yolu)', () => {
    const withoutTenant = toPublicAuthUser(fullUserRow({ tenant: undefined })) as unknown as Record<string, unknown>;
    expect('tenant' in withoutTenant).toBe(false);
    const nullTenant = toPublicAuthUser(fullUserRow({ tenant: null })) as unknown as Record<string, unknown>;
    expect('tenant' in nullTenant).toBe(false);
  });

  it('toPublicAuthTenant: yalnız allowlist alanları', () => {
    const out = toPublicAuthTenant({
      id: 't1',
      name: 'TENANT AD',
      slug: 'tenant-slug',
    }) as unknown as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual([...PUBLIC_AUTH_TENANT_FIELDS].sort());
  });

  it('T4: üç yüzey AYNI projeksiyonu kullanır → çıktı paritesi', () => {
    const row = fullUserRow();
    const meShape = toPublicAuthUser(row);
    const loginShape = toPublicAuthUser(row);
    const registerShape = toPublicAuthUser(fullUserRow({ tenant: undefined }));
    expect(loginShape).toEqual(meShape);
    expect(Object.keys(registerShape as unknown as Record<string, unknown>).sort()).toEqual(
      [...PUBLIC_AUTH_USER_FIELDS].sort(),
    );
  });

  it('T17: projeksiyon yalnız verilen satırdan kopyalar (cross-user/cross-tenant yok)', () => {
    const out = toPublicAuthUser(fullUserRow({ id: 'u-self', tenantId: 't-self' })) as unknown as Record<string, unknown>;
    expect(out.id).toBe('u-self');
    expect(out.tenantId).toBe('t-self');
    expect(JSON.stringify(out)).not.toContain('u-other');
  });

  it('idempotent: çıktı tekrar projeksiyondan geçerse değişmez', () => {
    const once = toPublicAuthUser(fullUserRow());
    expect(toPublicAuthUser(once)).toEqual(once);
  });
});
