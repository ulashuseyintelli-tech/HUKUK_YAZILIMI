import {
  buildCanaryIdentity,
  decideCanaryProvision,
  isSyntheticIdentity,
  toCanaryProvisionAuditEvent,
  CANARY_EMAIL_DOMAIN,
  CANARY_SAFE_TENANT_SLUGS,
  type CanaryProvisionInput,
  type CanaryTenantFacts,
} from '../office-cap02-canary-provision.core';

/**
 * OFFICE-P2-CAP02-CANARY-PRINCIPAL-AND-CASE-PROVISION-I01 doğrulama matrisi.
 * Owner §7 test listesinin tamamı + kimlik deseni + audit kanıtı.
 */

const TENANT_ID = 'cmrgs24hq0001uanatffks93h';
const SLUG = 'local-development-office';
const RUN = 'r01g01';
const AT = '2026-07-28T21:00:00.000Z';

const input = (o: Partial<CanaryProvisionInput> = {}): CanaryProvisionInput => ({
  tenantId: TENANT_ID,
  tenantSlug: SLUG,
  canaryRunId: RUN,
  authorityRef: 'OWNER-R01G-2026-07-28',
  ...o,
});

const facts = (o: Partial<CanaryTenantFacts> = {}): CanaryTenantFacts => ({
  tenant: { id: TENANT_ID, slug: SLUG },
  nonCanaryUserCount: 0,
  nonCanaryCaseCount: 0,
  nonCanaryClientCount: 0,
  existing: { userId: null, lawyerId: null, caseId: null },
  ...o,
});

describe('tenant fence — yalniz canary-safe tenant', () => {
  it('dogru tenant + bos veri -> APPLY', () => {
    const d = decideCanaryProvision(input(), facts());
    expect(d.kind).toBe('APPLY');
    expect(d.failures).toEqual([]);
  });

  it('allowlist disinda slug -> FAIL_CLOSED', () => {
    const d = decideCanaryProvision(
      input({ tenantSlug: 'telli-hukuk' }),
      facts({ tenant: { id: TENANT_ID, slug: 'telli-hukuk' } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_SLUG_NOT_CANARY_SAFE');
  });

  it('tenant bulunamadi -> FAIL_CLOSED', () => {
    const d = decideCanaryProvision(input(), facts({ tenant: null }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_NOT_FOUND');
  });

  it('id uyusmazligi -> FAIL_CLOSED', () => {
    const d = decideCanaryProvision(
      input(),
      facts({ tenant: { id: 'baska-tenant-id', slug: SLUG } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_ID_MISMATCH');
  });

  it('slug uyusmazligi -> FAIL_CLOSED', () => {
    const d = decideCanaryProvision(
      input(),
      facts({ tenant: { id: TENANT_ID, slug: 'baska-slug' } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_SLUG_MISMATCH');
  });

  it('semada Tenant aktiflik alani YOK — sahte aktiflik varsayimi uretilmez', () => {
    // `Tenant` modelinde lifecycle bayragi bulunmadigi icin "aktif mi" kontrolu
    // YAPILMAZ; uydurma bir alan da eklenmez. Karar yalnizca kanitlanabilir olgulara dayanir.
    const d = decideCanaryProvision(input(), facts());
    expect(d.kind).toBe('APPLY');
    expect(JSON.stringify(d.failures)).not.toContain('INACTIVE');
  });

  it('allowlist yalniz local-development-office icerir', () => {
    expect([...CANARY_SAFE_TENANT_SLUGS]).toEqual(['local-development-office']);
  });
});

describe('bosluk KANITLANIR, varsayilmaz', () => {
  it.each([
    ['nonCanaryUserCount', { nonCanaryUserCount: 1 }, 'TENANT_HAS_REAL_USERS'],
    ['nonCanaryCaseCount', { nonCanaryCaseCount: 1 }, 'TENANT_HAS_REAL_CASES'],
    ['nonCanaryClientCount', { nonCanaryClientCount: 1 }, 'TENANT_HAS_REAL_CLIENTS'],
  ])('%s > 0 -> FAIL_CLOSED', (_label, over, code) => {
    const d = decideCanaryProvision(input(), facts(over as Partial<CanaryTenantFacts>));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain(code);
  });

  it('birden fazla ihlal HEPSI raporlanir', () => {
    const d = decideCanaryProvision(
      input({ tenantSlug: 'telli-hukuk' }),
      facts({ tenant: null, nonCanaryUserCount: 4, nonCanaryCaseCount: 8 }),
    );
    expect(d.failures).toEqual(
      expect.arrayContaining([
        'TENANT_SLUG_NOT_CANARY_SAFE',
        'TENANT_NOT_FOUND',
        'TENANT_HAS_REAL_USERS',
        'TENANT_HAS_REAL_CASES',
      ]),
    );
  });
});

describe('idempotency ve kismi fixture', () => {
  it('fixture tamsa -> ALREADY_APPLIED', () => {
    const d = decideCanaryProvision(
      input(),
      facts({ existing: { userId: 'u', lawyerId: 'l', caseId: 'c' } }),
    );
    expect(d.kind).toBe('ALREADY_APPLIED');
    expect(d.failures).toEqual([]);
  });

  it.each([
    [{ userId: 'u', lawyerId: null, caseId: null }],
    [{ userId: 'u', lawyerId: 'l', caseId: null }],
    [{ userId: null, lawyerId: null, caseId: 'c' }],
  ])('kismi fixture %p -> FAIL_CLOSED, sessiz onarim YOK', (existing) => {
    const d = decideCanaryProvision(input(), facts({ existing } as Partial<CanaryTenantFacts>));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('PARTIAL_CANARY_FIXTURE');
  });
});

describe('sentetik kimlik', () => {
  it('uretilen alanlar runId tasir ve teslim edilemez domain kullanir', () => {
    const id = buildCanaryIdentity(RUN);
    expect(id.email).toBe(`office-cap02-canary-${RUN}@${CANARY_EMAIL_DOMAIN}`);
    expect(id.name).toBe('CANARY OFFICE CAP02 R01G01');
    expect(id.caseReference).toBe('CANARY-OFFICE-CAP02-R01G01');
    expect(id.email).toContain('@invalid.example');
  });

  it('ayni runId ayni kimligi verir (deterministik)', () => {
    expect(buildCanaryIdentity(RUN)).toEqual(buildCanaryIdentity(RUN));
  });

  it('gercege benzeyen kimlik REDDEDILIR', () => {
    const fake = { email: 'ulastelli@tellihukuk.com', name: 'Ulas Telli', caseReference: '2026/123' };
    expect(isSyntheticIdentity(fake, RUN)).toBe(false);
  });

  it('domain degistirilirse REDDEDILIR', () => {
    const near = { ...buildCanaryIdentity(RUN), email: `office-cap02-canary-${RUN}@tellihukuk.com` };
    expect(isSyntheticIdentity(near, RUN)).toBe(false);
  });

  it.each(['', 'X', 'BUYUK', 'has space', 'cok-uzun-'.repeat(6)])(
    'gecersiz runId %p -> FAIL_CLOSED',
    (runId) => {
      const d = decideCanaryProvision(input({ canaryRunId: runId }), facts());
      expect(d.kind).toBe('FAIL_CLOSED');
      expect(d.failures).toContain('INVALID_RUN_ID');
    },
  );
});

describe('audit kaniti', () => {
  it('committedRecordCount cagirandan gelir, karar turunden TURETILMEZ', () => {
    const d = decideCanaryProvision(input(), facts());
    expect(toCanaryProvisionAuditEvent(input(), d, AT, 0).committedRecordCount).toBe(0);
    expect(toCanaryProvisionAuditEvent(input(), d, AT, 3).committedRecordCount).toBe(3);
  });

  it('olay sentetik oldugunu kendi icinde tasir ve saat disaridan gelir', () => {
    const d = decideCanaryProvision(input(), facts());
    const e = toCanaryProvisionAuditEvent(input(), d, AT, 3);
    expect(e.eventType).toBe('OFFICE_CAP02_CANARY_FIXTURE_PROVISIONED');
    expect(e.synthetic).toBe(true);
    expect(e.occurredAt).toBe(AT);
    expect(e.decision).toBe('APPLY');
  });

  it('FAIL_CLOSED olayinda failure kodlari tasinir', () => {
    const d = decideCanaryProvision(input({ tenantSlug: 'telli-hukuk' }), facts());
    const e = toCanaryProvisionAuditEvent(input({ tenantSlug: 'telli-hukuk' }), d, AT, 0);
    expect(e.decision).toBe('FAIL_CLOSED');
    expect(e.failures).toContain('TENANT_SLUG_NOT_CANARY_SAFE');
    expect(e.committedRecordCount).toBe(0);
  });
});

describe('cekirdek safligi', () => {
  it('modul yalniz karar/kimlik/audit yuzeyini export eder', () => {
    // Yazim yapan hicbir sey export edilmez: cekirdek DB'ye dokunamaz.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../office-cap02-canary-provision.core');
    expect(Object.keys(mod).sort()).toEqual([
      'CANARY_EMAIL_DOMAIN',
      'CANARY_SAFE_TENANT_SLUGS',
      'buildCanaryIdentity',
      'decideCanaryProvision',
      'isSyntheticIdentity',
      'toCanaryProvisionAuditEvent',
    ]);
  });
});
