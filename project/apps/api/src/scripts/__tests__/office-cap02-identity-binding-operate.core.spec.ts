import {
  decideIdentityBinding,
  reconcileIdentityBinding,
  toIdentityBindingAuditEvent,
  type BindingFacts,
  type BindingOperationInput,
  type LockedProfileRow,
  type LockedUserRow,
  type ReconciliationFacts,
} from '../office-cap02-identity-binding-operate.core';

/**
 * OFFICE-P2-CAP02-PERSONNEL-IDENTITY-BINDING-OPERATE-I01 karar matrisi.
 * Owner'ın dokuz kontrolü + idempotency + fail-closed davranışı.
 */

const TENANT = 'cmm61v99600007a6smfkarha9';
const PROFILE = 'cmqfccvme0001zwm1lpmmg48u';
const TARGET_USER = 'cmqw5igtz000b12fgfilmvst9';
const INACTIVE_DUP = 'cmqw5gmma000512fguan81afl';
const PROFILE_UPDATED_AT = '2026-06-29T08:03:38.388Z';
const USER_UPDATED_AT = '2026-06-27T09:26:30.117Z';

const input = (o: Partial<BindingOperationInput> = {}): BindingOperationInput => ({
  tenantId: TENANT,
  profileType: 'LAWYER',
  profileId: PROFILE,
  targetUserId: TARGET_USER,
  authorityRef: 'OFFICE-P2-CAP02-PERSONNEL-AND-SHADOW-FULL-ACTIVATION-OWNER-R01',
  expectedProfileUpdatedAt: PROFILE_UPDATED_AT,
  expectedUserUpdatedAt: USER_UPDATED_AT,
  ...o,
});

const profileRow = (o: Partial<LockedProfileRow> = {}): LockedProfileRow => ({
  profileType: 'LAWYER',
  profileId: PROFILE,
  tenantId: TENANT,
  isActive: true,
  userId: null,
  updatedAt: PROFILE_UPDATED_AT,
  ...o,
});

const userRow = (o: Partial<LockedUserRow> = {}): LockedUserRow => ({
  userId: TARGET_USER,
  tenantId: TENANT,
  isActive: true,
  updatedAt: USER_UPDATED_AT,
  ...o,
});

const facts = (o: Partial<BindingFacts> = {}): BindingFacts => ({
  profile: profileRow(),
  targetUser: userRow(),
  otherLawyerBindings: [],
  staffMemberBindings: [],
  ...o,
});

const decide = (i: Partial<BindingOperationInput> = {}, f: Partial<BindingFacts> = {}) =>
  decideIdentityBinding(input(i), facts(f));

describe('APPLY — tüm kontroller geçince', () => {
  it('temiz durumda bağ kurulabilir', () => {
    const d = decide();
    expect(d.kind).toBe('APPLY');
    expect(d.failures).toHaveLength(0);
  });
});

describe('IDEMPOTENCY', () => {
  it('aynı bağ zaten varsa ALREADY_APPLIED, yazım yok', () => {
    const d = decide({}, { profile: profileRow({ userId: TARGET_USER }) });
    expect(d.kind).toBe('ALREADY_APPLIED');
    expect(d.failures).toHaveLength(0);
  });

  it('ALREADY_APPLIED, profil pasifleşmiş olsa bile no-op kalır', () => {
    const d = decide({}, { profile: profileRow({ userId: TARGET_USER, isActive: false }) });
    expect(d.kind).toBe('ALREADY_APPLIED');
  });

  it('ALREADY_APPLIED, satır preflight ten sonra değişmiş olsa bile no-op kalır', () => {
    const d = decide(
      {},
      { profile: profileRow({ userId: TARGET_USER, updatedAt: '2026-07-28T00:00:00.000Z' }) },
    );
    expect(d.kind).toBe('ALREADY_APPLIED');
  });
});

describe('FAIL_CLOSED — profil tarafı', () => {
  it('profil yoksa', () => {
    const d = decide({}, { profile: null });
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('PROFILE_NOT_FOUND');
  });

  it('profil başka tenant ta', () => {
    expect(decide({}, { profile: profileRow({ tenantId: 'baska-tenant' }) }).failures).toContain(
      'PROFILE_TENANT_MISMATCH',
    );
  });

  it('profil BAŞKA bir User a bağlı — asla üzerine yazılmaz', () => {
    const d = decide({}, { profile: profileRow({ userId: 'baska-user-id' }) });
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('PROFILE_BOUND_TO_ANOTHER_USER');
  });

  it('profil pasif', () => {
    expect(decide({}, { profile: profileRow({ isActive: false }) }).failures).toContain(
      'PROFILE_INACTIVE',
    );
  });

  it('profil satırı preflight ten sonra değişmiş', () => {
    expect(
      decide({}, { profile: profileRow({ updatedAt: '2026-07-28T12:00:00.000Z' }) }).failures,
    ).toContain('PROFILE_ROW_CHANGED_SINCE_PREFLIGHT');
  });
});

describe('FAIL_CLOSED — hedef User tarafı', () => {
  it('User yoksa', () => {
    expect(decide({}, { targetUser: null }).failures).toContain('TARGET_USER_NOT_FOUND');
  });

  it('User başka tenant ta', () => {
    expect(decide({}, { targetUser: userRow({ tenantId: 'baska-tenant' }) }).failures).toContain(
      'TARGET_USER_TENANT_MISMATCH',
    );
  });

  it('PASİF DUPLICATE hesap hedef alınamaz', () => {
    const d = decide(
      { targetUserId: INACTIVE_DUP },
      { targetUser: userRow({ userId: INACTIVE_DUP, isActive: false }) },
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TARGET_USER_INACTIVE');
  });

  it('User satırı preflight ten sonra değişmiş', () => {
    expect(
      decide({}, { targetUser: userRow({ updatedAt: '2026-07-28T12:00:00.000Z' }) }).failures,
    ).toContain('TARGET_USER_ROW_CHANGED_SINCE_PREFLIGHT');
  });

  it('User başka bir Lawyer a bağlı', () => {
    expect(decide({}, { otherLawyerBindings: ['baska-lawyer-id'] }).failures).toContain(
      'TARGET_USER_BOUND_TO_ANOTHER_LAWYER',
    );
  });

  it('User bir StaffMember a bağlı', () => {
    expect(decide({}, { staffMemberBindings: ['staff-id'] }).failures).toContain(
      'TARGET_USER_BOUND_TO_STAFF_MEMBER',
    );
  });

  it('aynı profilin kendi kaydı "başka Lawyer" sayılmaz', () => {
    expect(decide({}, { otherLawyerBindings: [PROFILE] }).kind).toBe('APPLY');
  });
});

describe('otorite', () => {
  it('authorityRef olmadan production binding yapılmaz', () => {
    const d = decide({ authorityRef: '' });
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('AUTHORITY_REF_MISSING');
  });
});

describe('audit kanıtı', () => {
  // OFFICE-P2-CAP02-IDENTITY-BINDING-DRY-RUN-AUDIT-REPAIR-I01
  // `mutated` KARAR TURUNDEN degil, FIILEN COMMIT EDILMIS satir sayisindan turer.
  const at = '2026-07-28T15:47:46.965Z';
  const applyDecision = () => decide();
  const alreadyApplied = () => decide({}, { profile: profileRow({ userId: TARGET_USER }) });
  const failClosed = () => decide({}, { profile: null });

  it('dry-run: karar APPLY ama hicbir satir commit edilmedi -> mutated false', () => {
    const ev = toIdentityBindingAuditEvent(input(), applyDecision(), at, 0);
    expect(ev.decision).toBe('APPLY');
    expect(ev.committedMutationCount).toBe(0);
    expect(ev.mutated).toBe(false);
  });

  it('gercek apply: 1 satir commit edildi -> mutated true', () => {
    const ev = toIdentityBindingAuditEvent(input(), applyDecision(), at, 1);
    expect(ev.committedMutationCount).toBe(1);
    expect(ev.mutated).toBe(true);
  });

  it('ALREADY_APPLIED -> mutated false', () => {
    const ev = toIdentityBindingAuditEvent(input(), alreadyApplied(), at, 0);
    expect(ev.decision).toBe('ALREADY_APPLIED');
    expect(ev.mutated).toBe(false);
  });

  it('FAIL_CLOSED -> mutated false', () => {
    const ev = toIdentityBindingAuditEvent(input(), failClosed(), at, 0);
    expect(ev.decision).toBe('FAIL_CLOSED');
    expect(ev.mutated).toBe(false);
  });

  it('rollback: APPLY kararindan sonra transaction geri alindi -> mutated false', () => {
    // Runner rollback'te audit'e 0 gecirir; karar APPLY kalsa da mutasyon YOKTUR.
    const ev = toIdentityBindingAuditEvent(input(), applyDecision(), at, 0);
    expect(ev.mutated).toBe(false);
    expect(ev.committedMutationCount).toBe(0);
  });

  it('mutated karar turune DEGIL, sayaca baglidir', () => {
    for (const d of [applyDecision(), alreadyApplied(), failClosed()]) {
      expect(toIdentityBindingAuditEvent(input(), d, at, 0).mutated).toBe(false);
      expect(toIdentityBindingAuditEvent(input(), d, at, 1).mutated).toBe(true);
    }
  });

  it('occurredAt dışarıdan verilir; modül sistem saatini okumaz', () => {
    const ev = toIdentityBindingAuditEvent(input(), decide(), '2026-01-01T00:00:00.000Z', 1);
    expect(ev.occurredAt).toBe('2026-01-01T00:00:00.000Z');
    expect(ev.eventType).toBe('OFFICE_CAP02_PERSONNEL_IDENTITY_BINDING');
    expect(ev.authorityRef).toContain('OWNER-R01');
  });
});

describe('post-commit reconciliation', () => {
  const recon = (o: Partial<ReconciliationFacts> = {}) =>
    reconcileIdentityBinding(input(), {
      profileUserId: TARGET_USER,
      lawyerBindingsForTargetUser: [PROFILE],
      staffBindingsForTargetUser: [],
      crossTenantBindingCount: 0,
      duplicateUserBindingCount: 0,
      inactiveDuplicateStillInactiveAndUnbound: true,
      ...o,
    });

  it('beklenen son durumda PASS', () => {
    expect(recon().pass).toBe(true);
  });

  it('profil beklenen User a bağlı değilse FAIL', () => {
    expect(recon({ profileUserId: null }).problems).toContain('profil beklenen User a bagli degil');
  });

  it('User birden fazla Lawyer a bağlıysa FAIL', () => {
    expect(recon({ lawyerBindingsForTargetUser: [PROFILE, 'x'] }).pass).toBe(false);
  });

  it('User ayrıca StaffMember a bağlıysa FAIL', () => {
    expect(recon({ staffBindingsForTargetUser: ['s'] }).pass).toBe(false);
  });

  it('cross-tenant bağ varsa FAIL', () => {
    expect(recon({ crossTenantBindingCount: 1 }).problems).toContain('cross-tenant bag tespit edildi');
  });

  it('duplicate User bağı varsa FAIL', () => {
    expect(recon({ duplicateUserBindingCount: 1 }).pass).toBe(false);
  });

  it('pasif duplicate hesap değişmişse FAIL', () => {
    expect(recon({ inactiveDuplicateStillInactiveAndUnbound: false }).problems).toContain(
      'pasif duplicate hesap degismis',
    );
  });
});
