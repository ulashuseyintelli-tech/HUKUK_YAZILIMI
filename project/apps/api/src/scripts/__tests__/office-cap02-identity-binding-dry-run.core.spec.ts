import {
  assertNoForbiddenSecretFields,
  dryRunIdentityBinding,
  type BindingInputRecord,
  type RepositorySnapshot,
} from '../office-cap02-identity-binding-dry-run.core';

/**
 * OFFICE-P2-CAP02-PERSONNEL-IDENTITY-BINDING-DRY-RUN-R01 doğrulama matrisi.
 *
 * Bu suite production'a hiçbir şey yazmayan saf çekirdeği sınar: her owner kontrolü
 * için en az bir kabul ve bir ret senaryosu vardır.
 */

const T1 = 'tenant-one-id';
const T2 = 'tenant-two-id';

const snapshot = (): RepositorySnapshot => ({
  tenantIdBySlug: { 't-one': T1, 't-two': T2 },
  profiles: [
    { profileType: 'LAWYER', profileId: 'law-bound', tenantId: T1, isActive: true, boundUserId: 'u-bound' },
    { profileType: 'LAWYER', profileId: 'law-free', tenantId: T1, isActive: true, boundUserId: null },
    { profileType: 'LAWYER', profileId: 'law-inactive', tenantId: T1, isActive: false, boundUserId: null },
    { profileType: 'STAFF_MEMBER', profileId: 'stf-free', tenantId: T1, isActive: true, boundUserId: null },
    { profileType: 'STAFF_MEMBER', profileId: 'stf-other-tenant', tenantId: T2, isActive: true, boundUserId: null },
  ],
  users: [
    { userId: 'u-bound', tenantId: T1, isActive: true, email: 'bound@t1.test' },
    { userId: 'u-free', tenantId: T1, isActive: true, email: 'free@t1.test' },
    { userId: 'u-inactive', tenantId: T1, isActive: false, email: 'inactive@t1.test' },
    { userId: 'u-other-tenant', tenantId: T2, isActive: true, email: 'other@t2.test' },
  ],
});

const base = (over: Partial<BindingInputRecord>): BindingInputRecord => ({
  tenantSlug: 't-one',
  profileType: 'LAWYER',
  profileId: 'law-free',
  disposition: 'BIND_EXISTING_USER',
  existingUserId: 'u-free',
  systemAccessRequired: true,
  authorizationGraphRequired: true,
  ...over,
});

const run = (records: BindingInputRecord[]) => dryRunIdentityBinding(records, snapshot());
const only = (records: BindingInputRecord[]) => run(records).records[0];

describe('gizlilik sınırı', () => {
  it('girdi paketinde TCKN/IBAN/parola/token varsa dry-run başlamaz', () => {
    expect(() =>
      assertNoForbiddenSecretFields([{ profileId: 'x', tckn: '11111111111' }]),
    ).toThrow(/IDENTITY_BINDING_INPUT_FORBIDDEN_FIELDS.*tckn/i);
    expect(() => assertNoForbiddenSecretFields([{ profileId: 'x', password: 'p' }])).toThrow();
    expect(() => assertNoForbiddenSecretFields([{ profileId: 'x', iban: 'TR..' }])).toThrow();
  });

  it('temiz paket geçer', () => {
    expect(() =>
      assertNoForbiddenSecretFields([{ profileId: 'x', profileType: 'LAWYER' }]),
    ).not.toThrow();
  });
});

describe('BIND_EXISTING_USER', () => {
  it('aynı tenant, aktif profil, aktif ve serbest User -> PASS + yazım planlanır', () => {
    const r = only([base({})]);
    expect(r.verdict).toBe('PASS');
    expect(r.plannedMutation).toBe('BIND_EXISTING_USER');
  });

  it('var olmayan User reddedilir', () => {
    expect(only([base({ existingUserId: 'yok' })]).failures).toContain('EXISTING_USER_NOT_FOUND');
  });

  it('pasif User reddedilir', () => {
    expect(only([base({ existingUserId: 'u-inactive' })]).failures).toContain('EXISTING_USER_INACTIVE');
  });

  it('CROSS-TENANT User reddedilir', () => {
    expect(only([base({ existingUserId: 'u-other-tenant' })]).failures).toContain(
      'EXISTING_USER_TENANT_MISMATCH',
    );
  });

  it('başka profile bağlı User reddedilir', () => {
    expect(only([base({ existingUserId: 'u-bound' })]).failures).toContain(
      'EXISTING_USER_BOUND_TO_ANOTHER_PROFILE',
    );
  });

  it('zaten başka User a bağlı profil reddedilir', () => {
    const r = only([base({ profileId: 'law-bound', existingUserId: 'u-free' })]);
    expect(r.failures).toContain('PROFILE_ALREADY_BOUND_TO_ANOTHER_USER');
  });

  it('pasif profil reddedilir', () => {
    expect(only([base({ profileId: 'law-inactive' })]).failures).toContain('PROFILE_INACTIVE');
  });

  it('var olmayan profil reddedilir', () => {
    expect(only([base({ profileId: 'yok' })]).failures).toContain('PROFILE_NOT_FOUND');
  });

  it('profil başka tenant ta ise reddedilir', () => {
    const r = only([base({ profileType: 'STAFF_MEMBER', profileId: 'stf-other-tenant' })]);
    expect(r.failures).toContain('PROFILE_TENANT_MISMATCH');
  });

  it('bilinmeyen tenantSlug reddedilir', () => {
    expect(only([base({ tenantSlug: 'yok' })]).failures).toContain('TENANT_UNKNOWN');
  });

  it('existingUserId eksikse reddedilir', () => {
    expect(only([base({ existingUserId: null })]).failures).toContain('EXISTING_USER_REQUIRED');
  });

  it('yeni-user alanları bu disposition da yasaktır', () => {
    expect(only([base({ newUserEmail: 'x@t1.test' })]).failures).toContain(
      'EXISTING_USER_FIELDS_FORBIDDEN',
    );
  });

  it('IDEMPOTENCY: zaten aynı User a bağlıysa PASS ama yazım planlanmaz', () => {
    const r = only([base({ profileId: 'law-bound', existingUserId: 'u-bound' })]);
    expect(r.verdict).toBe('PASS');
    expect(r.plannedMutation).toBe('NONE');
  });

  it('aynı User iki profile hedeflenirse ikisi de reddedilir', () => {
    const out = run([
      base({ profileId: 'law-free', existingUserId: 'u-free' }),
      base({ profileType: 'STAFF_MEMBER', profileId: 'stf-free', existingUserId: 'u-free' }),
    ]);
    expect(out.records.every((r) => r.failures.includes('DUPLICATE_TARGET_USER_IN_INPUT'))).toBe(true);
    expect(out.eligibleForOperate).toBe(false);
  });

  it('aynı profil iki kez girilirse reddedilir', () => {
    const out = run([base({}), base({ existingUserId: 'u-bound' })]);
    expect(out.records.every((r) => r.failures.includes('DUPLICATE_PROFILE_IN_INPUT'))).toBe(true);
  });
});

describe('CREATE_NEW_USER', () => {
  const create = (over: Partial<BindingInputRecord> = {}) =>
    only([
      base({
        disposition: 'CREATE_NEW_USER',
        existingUserId: null,
        newUserName: 'Yeni Kisi',
        newUserEmail: 'yeni@t1.test',
        newUserRole: 'USER',
        ...over,
      }),
    ]);

  it('gerekçeli, benzersiz e-posta, izinli rol -> PASS + create planlanır', () => {
    const r = create();
    expect(r.verdict).toBe('PASS');
    expect(r.plannedMutation).toBe('CREATE_USER_AND_BIND');
  });

  it('DUMMY USER YASAĞI: gerekçe yoksa reddedilir', () => {
    const r = create({ systemAccessRequired: false, authorizationGraphRequired: false });
    expect(r.failures).toContain('NEW_USER_NOT_JUSTIFIED');
    expect(r.plannedMutation).toBe('NONE');
  });

  it('tenant içinde çakışan e-posta reddedilir', () => {
    expect(create({ newUserEmail: 'Free@T1.test' }).failures).toContain('NEW_USER_EMAIL_NOT_UNIQUE');
  });

  it('izinsiz rol reddedilir', () => {
    expect(create({ newUserRole: 'ADMIN' }).failures).toContain('NEW_USER_ROLE_NOT_ALLOWED');
  });

  it('eksik zorunlu alan reddedilir', () => {
    expect(create({ newUserEmail: null }).failures).toContain('NEW_USER_FIELDS_REQUIRED');
  });

  it('girdi içinde tekrar eden yeni e-posta reddedilir', () => {
    const rec = base({
      disposition: 'CREATE_NEW_USER',
      existingUserId: null,
      newUserName: 'A',
      newUserEmail: 'ayni@t1.test',
      newUserRole: 'USER',
    });
    const out = run([rec, { ...rec, profileType: 'STAFF_MEMBER', profileId: 'stf-free' }]);
    expect(
      out.records.every((r) => r.failures.includes('NEW_USER_EMAIL_DUPLICATE_IN_INPUT')),
    ).toBe(true);
  });

  it('zaten bağlı profile yeni user açılamaz', () => {
    expect(create({ profileId: 'law-bound' }).failures).toContain(
      'PROFILE_ALREADY_BOUND_TO_ANOTHER_USER',
    );
  });
});

describe('ALREADY_BOUND', () => {
  it('gerçekten bağlıysa PASS ve yazım YOK', () => {
    const r = only([
      base({ disposition: 'ALREADY_BOUND', profileId: 'law-bound', existingUserId: 'u-bound' }),
    ]);
    expect(r.verdict).toBe('PASS');
    expect(r.plannedMutation).toBe('NONE');
  });

  it('aslında bağlı değilse reddedilir', () => {
    const r = only([base({ disposition: 'ALREADY_BOUND', profileId: 'law-free', existingUserId: null })]);
    expect(r.failures).toContain('ALREADY_BOUND_MISMATCH');
  });

  it('beyan edilen User gerçek bağdan farklıysa reddedilir', () => {
    const r = only([
      base({ disposition: 'ALREADY_BOUND', profileId: 'law-bound', existingUserId: 'u-free' }),
    ]);
    expect(r.failures).toContain('ALREADY_BOUND_MISMATCH');
  });
});

describe('NO_USER_REQUIRED / KEEP_OUTSIDE_AUTHORIZATION_GRAPH', () => {
  it('authorization graph gerekmiyorsa PASS ve yazım YOK', () => {
    const r = only([
      base({
        disposition: 'NO_USER_REQUIRED',
        existingUserId: null,
        systemAccessRequired: false,
        authorizationGraphRequired: false,
      }),
    ]);
    expect(r.verdict).toBe('PASS');
    expect(r.plannedMutation).toBe('NONE');
  });

  it('authorization graph gerekiyorsa User sız bırakılamaz', () => {
    const r = only([
      base({
        disposition: 'KEEP_OUTSIDE_AUTHORIZATION_GRAPH',
        existingUserId: null,
        systemAccessRequired: false,
        authorizationGraphRequired: true,
      }),
    ]);
    expect(r.failures).toContain('AUTHORIZATION_GRAPH_WITHOUT_USER');
  });
});

describe('UNRESOLVED ve rapor toplamı', () => {
  it('UNRESOLVED kayıt ne PASS ne FAIL sayılır ve yazım üretmez', () => {
    const r = only([base({ disposition: 'UNRESOLVED', existingUserId: null })]);
    expect(r.verdict).toBe('UNRESOLVED');
    expect(r.plannedMutation).toBe('NONE');
  });

  it('UNRESOLVED varken bile FAIL yoksa operate uygundur', () => {
    const out = run([
      base({}),
      base({ profileType: 'STAFF_MEMBER', profileId: 'stf-free', disposition: 'UNRESOLVED', existingUserId: null }),
    ]);
    expect(out.total).toBe(2);
    expect(out.pass).toBe(1);
    expect(out.unresolved).toBe(1);
    expect(out.fail).toBe(0);
    expect(out.plannedMutations).toBe(1);
    expect(out.eligibleForOperate).toBe(true);
  });

  it('tek bir FAIL tüm paketi operate dışı bırakır', () => {
    const out = run([base({}), base({ profileId: 'law-inactive', existingUserId: 'u-bound' })]);
    expect(out.fail).toBeGreaterThan(0);
    expect(out.eligibleForOperate).toBe(false);
  });

  it('boş paket operate uygun ama yazımsızdır', () => {
    const out = run([]);
    expect(out).toMatchObject({ total: 0, pass: 0, fail: 0, plannedMutations: 0, eligibleForOperate: true });
  });
});
