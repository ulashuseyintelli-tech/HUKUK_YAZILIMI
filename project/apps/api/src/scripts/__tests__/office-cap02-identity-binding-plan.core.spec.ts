import {
  dryRunIdentityBinding,
  type BindingInputRecord,
  type RepositorySnapshot,
} from '../office-cap02-identity-binding-dry-run.core';
import {
  buildOperatePlan,
  parseBindingInputPackage,
  type OperatePlanContext,
} from '../office-cap02-identity-binding-plan.core';

/**
 * OFFICE-P2-IDENTITY-COMPLETION-R01 — plan çekirdeği doğrulama matrisi.
 *
 * İki saf halkayı sınar: (1) girdi paketinin fail-closed yapısal doğrulaması,
 * (2) dry-run raporundan deterministik operate planı üretimi. Plan üretimi, core
 * sözleşmesiyle pariteyi korumak için GERÇEK `dryRunIdentityBinding` üzerinden sürülür.
 */

const T1 = 'tenant-one-id';
const T2 = 'tenant-two-id';

const snapshot = (): RepositorySnapshot => ({
  tenantIdBySlug: { 't-one': T1, 't-two': T2 },
  profiles: [
    { profileType: 'STAFF_MEMBER', profileId: 'stf-free', tenantId: T1, isActive: true, boundUserId: null },
    { profileType: 'STAFF_MEMBER', profileId: 'stf-bound', tenantId: T1, isActive: true, boundUserId: 'u-bound' },
    { profileType: 'STAFF_MEMBER', profileId: 'stf-inactive', tenantId: T1, isActive: false, boundUserId: null },
    { profileType: 'LAWYER', profileId: 'law-free', tenantId: T1, isActive: true, boundUserId: null },
  ],
  users: [
    { userId: 'u-free', tenantId: T1, isActive: true, email: 'free@t1.test' },
    { userId: 'u-bound', tenantId: T1, isActive: true, email: 'bound@t1.test' },
    { userId: 'u-inactive', tenantId: T1, isActive: false, email: 'inactive@t1.test' },
    { userId: 'u-other-tenant', tenantId: T2, isActive: true, email: 'other@t2.test' },
  ],
});

const record = (over: Partial<BindingInputRecord>): BindingInputRecord => ({
  tenantSlug: 't-one',
  profileType: 'STAFF_MEMBER',
  profileId: 'stf-free',
  disposition: 'BIND_EXISTING_USER',
  existingUserId: 'u-free',
  newUserName: null,
  newUserEmail: null,
  newUserRole: null,
  systemAccessRequired: true,
  authorizationGraphRequired: true,
  ...over,
});

const ctx = (over: Partial<OperatePlanContext> = {}): OperatePlanContext => ({
  tenantIdBySlug: { 't-one': T1, 't-two': T2 },
  profileUpdatedAtByKey: {
    'STAFF_MEMBER:stf-free': '2026-08-13T10:00:00.000Z',
    'STAFF_MEMBER:stf-bound': '2026-08-13T10:00:01.000Z',
    'STAFF_MEMBER:stf-inactive': '2026-08-13T10:00:02.000Z',
    'LAWYER:law-free': '2026-08-13T10:00:03.000Z',
  },
  userUpdatedAtById: {
    'u-free': '2026-08-13T11:00:00.000Z',
    'u-bound': '2026-08-13T11:00:01.000Z',
    'u-inactive': '2026-08-13T11:00:02.000Z',
    'u-other-tenant': '2026-08-13T11:00:03.000Z',
  },
  authorityRef: 'OFFICE-P2-IDENTITY-COMPLETION-R01-D1',
  ...over,
});

const planFor = (records: BindingInputRecord[], ctxOver: Partial<OperatePlanContext> = {}) =>
  buildOperatePlan(records, dryRunIdentityBinding(records, snapshot()), ctx(ctxOver));

// ---------------------------------------------------------------------------
// 1) parseBindingInputPackage — fail-closed yapısal doğrulama
// ---------------------------------------------------------------------------

describe('parseBindingInputPackage', () => {
  const valid = () => [
    {
      tenantSlug: 't-one',
      profileType: 'STAFF_MEMBER',
      profileId: 'stf-free',
      disposition: 'BIND_EXISTING_USER',
      existingUserId: 'u-free',
      systemAccessRequired: true,
      authorizationGraphRequired: true,
    },
  ];

  it('geçerli paket: kayıtlar normalize edilir (eksik opsiyoneller null)', () => {
    const parsed = parseBindingInputPackage(valid());
    expect(parsed.issues).toEqual([]);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].newUserEmail).toBeNull();
    expect(parsed.records[0].existingUserId).toBe('u-free');
  });

  it('dizi olmayan paket reddedilir', () => {
    const parsed = parseBindingInputPackage({ not: 'array' });
    expect(parsed.records).toEqual([]);
    expect(parsed.issues[0].code).toBe('PACKAGE_NOT_ARRAY');
  });

  it('boş paket reddedilir', () => {
    expect(parseBindingInputPackage([]).issues[0].code).toBe('PACKAGE_EMPTY');
  });

  it('obje olmayan kayıt reddedilir', () => {
    const parsed = parseBindingInputPackage(['metin']);
    expect(parsed.issues[0].code).toBe('RECORD_NOT_OBJECT');
  });

  it('bilinmeyen alan reddedilir (ikinci savunma hattı)', () => {
    const parsed = parseBindingInputPackage([{ ...valid()[0], surpriseField: 'x' }]);
    expect(parsed.records).toEqual([]);
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_FIELD', detail: 'surpriseField' }),
    );
  });

  it('zorunlu alan eksikse reddedilir', () => {
    const bad = { ...valid()[0] } as Record<string, unknown>;
    delete bad.disposition;
    delete bad.systemAccessRequired;
    const parsed = parseBindingInputPackage([bad]);
    expect(parsed.records).toEqual([]);
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD', detail: 'disposition' }),
    );
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD', detail: 'systemAccessRequired' }),
    );
  });

  it('sözlük dışı disposition/profileType/newUserRole reddedilir', () => {
    const parsed = parseBindingInputPackage([
      { ...valid()[0], disposition: 'AUTO_MATCH', profileType: 'INTERN', newUserRole: 'ADMIN' },
    ]);
    expect(parsed.records).toEqual([]);
    const details = parsed.issues.map((i) => i.detail);
    expect(details).toContain('disposition: AUTO_MATCH');
    expect(details).toContain('profileType: INTERN');
    expect(details).toContain('newUserRole: ADMIN');
  });

  it('boolean alan tip kontrolü fail-closed', () => {
    const parsed = parseBindingInputPackage([
      { ...valid()[0], systemAccessRequired: 'evet' },
    ]);
    expect(parsed.records).toEqual([]);
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_FIELD_VALUE' }),
    );
  });

  it('tek bozuk kayıt TÜM paketi reddeder (kısmi uygulama yasak)', () => {
    const parsed = parseBindingInputPackage([valid()[0], { bozuk: true }]);
    expect(parsed.records).toEqual([]);
    expect(parsed.issues.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2) buildOperatePlan — deterministik aksiyon planı
// ---------------------------------------------------------------------------

describe('buildOperatePlan', () => {
  it('PASS BIND_EXISTING_USER → RUN_OPERATE_BIND + preflight timestamp + authorityRef', () => {
    const plan = planFor([record({})]);
    expect(plan.executable).toBe(true);
    expect(plan.counts.RUN_OPERATE_BIND).toBe(1);
    expect(plan.entries[0].operateArgs).toEqual({
      tenantId: T1,
      profileType: 'STAFF_MEMBER',
      profileId: 'stf-free',
      targetUserId: 'u-free',
      expectedProfileUpdatedAt: '2026-08-13T10:00:00.000Z',
      expectedUserUpdatedAt: '2026-08-13T11:00:00.000Z',
      authorityRef: 'OFFICE-P2-IDENTITY-COMPLETION-R01-D1',
    });
  });

  it('authorityRef verilmediyse null taşınır (uydurma referans yok)', () => {
    const plan = planFor([record({})], { authorityRef: undefined });
    expect(plan.entries[0].operateArgs?.authorityRef).toBeNull();
  });

  it('PASS ALREADY_BOUND → NO_ACTION (idempotent, yazım planlanmaz)', () => {
    const plan = planFor([
      record({ profileId: 'stf-bound', disposition: 'ALREADY_BOUND', existingUserId: 'u-bound' }),
    ]);
    expect(plan.entries[0].action).toBe('NO_ACTION');
    expect(plan.entries[0].operateArgs).toBeNull();
    expect(plan.executable).toBe(true);
  });

  it('UNRESOLVED → PENDING_OWNER_FACT; plan yürütülebilirliğini BOZMAZ', () => {
    const plan = planFor([
      record({}),
      record({ profileId: 'law-free', profileType: 'LAWYER', disposition: 'UNRESOLVED', existingUserId: null }),
    ]);
    expect(plan.counts.PENDING_OWNER_FACT).toBe(1);
    expect(plan.counts.RUN_OPERATE_BIND).toBe(1);
    expect(plan.executable).toBe(true);
  });

  it('NEGATİF — pasif principal: pasif profile bağ FAIL → BLOCKED_FAIL', () => {
    const plan = planFor([record({ profileId: 'stf-inactive' })]);
    expect(plan.entries[0].action).toBe('BLOCKED_FAIL');
    expect(plan.entries[0].failures).toContain('PROFILE_INACTIVE');
    expect(plan.executable).toBe(false);
  });

  it('NEGATİF — pasif hedef User: EXISTING_USER_INACTIVE → BLOCKED_FAIL', () => {
    const plan = planFor([record({ existingUserId: 'u-inactive' })]);
    expect(plan.entries[0].action).toBe('BLOCKED_FAIL');
    expect(plan.entries[0].failures).toContain('EXISTING_USER_INACTIVE');
  });

  it('NEGATİF — cross-tenant hedef User → BLOCKED_FAIL', () => {
    const plan = planFor([record({ existingUserId: 'u-other-tenant' })]);
    expect(plan.entries[0].action).toBe('BLOCKED_FAIL');
    expect(plan.entries[0].failures).toContain('EXISTING_USER_TENANT_MISMATCH');
  });

  it('NEGATİF — duplicate identity: aynı profil pakette iki kez → her ikisi BLOCKED_FAIL', () => {
    const plan = planFor([record({}), record({})]);
    expect(plan.entries.map((e) => e.action)).toEqual(['BLOCKED_FAIL', 'BLOCKED_FAIL']);
    expect(plan.entries[0].failures).toContain('DUPLICATE_PROFILE_IN_INPUT');
  });

  it('PASS CREATE_NEW_USER → ISSUE_INVITE_CREATE_AND_BIND (yazım yolu auth/invite)', () => {
    const plan = planFor([
      record({
        disposition: 'CREATE_NEW_USER',
        existingUserId: null,
        newUserEmail: 'yeni@t1.test',
        newUserName: 'Yeni Kişi',
        newUserRole: 'USER',
      }),
    ]);
    expect(plan.entries[0].action).toBe('ISSUE_INVITE_CREATE_AND_BIND');
    expect(plan.entries[0].inviteArgs).toEqual({
      tenantSlug: 't-one',
      profileType: 'STAFF_MEMBER',
      profileId: 'stf-free',
      newUserEmail: 'yeni@t1.test',
      newUserName: 'Yeni Kişi',
      newUserRole: 'USER',
    });
    expect(plan.entries[0].operateArgs).toBeNull();
  });

  it('FAIL-CLOSED — profil preflight timestamp eksikse plan üretilmez', () => {
    const plan = planFor([record({})], { profileUpdatedAtByKey: {} });
    expect(plan.entries[0].action).toBe('BLOCKED_FAIL');
    expect(plan.entries[0].planIssues).toContain('PLAN_PROFILE_TIMESTAMP_MISSING');
    expect(plan.executable).toBe(false);
  });

  it('FAIL-CLOSED — hedef User timestamp eksikse plan üretilmez', () => {
    const plan = planFor([record({})], { userUpdatedAtById: {} });
    expect(plan.entries[0].planIssues).toContain('PLAN_USER_TIMESTAMP_MISSING');
    expect(plan.entries[0].action).toBe('BLOCKED_FAIL');
  });

  it('FAIL-CLOSED — plan bağlamında tenant yoksa PLAN_TENANT_UNKNOWN', () => {
    const plan = planFor([record({})], { tenantIdBySlug: {} });
    expect(plan.entries[0].planIssues).toContain('PLAN_TENANT_UNKNOWN: t-one');
    expect(plan.entries[0].action).toBe('BLOCKED_FAIL');
  });

  it('input/report uzunluk uyuşmazlığı fırlatır (yanlış kayda plan yasak)', () => {
    const records = [record({})];
    const report = dryRunIdentityBinding(records, snapshot());
    expect(() => buildOperatePlan([...records, record({ profileId: 'law-free' })], report, ctx())).toThrow(
      /IDENTITY_BINDING_PLAN_INPUT_REPORT_MISMATCH/,
    );
  });

  it('input/report kayıt kimliği uyuşmazlığı fırlatır', () => {
    const records = [record({})];
    const report = dryRunIdentityBinding(records, snapshot());
    const shuffled = [record({ profileId: 'law-free', profileType: 'LAWYER' })];
    expect(() => buildOperatePlan(shuffled, report, ctx())).toThrow(
      /IDENTITY_BINDING_PLAN_RECORD_MISMATCH/,
    );
  });
});
