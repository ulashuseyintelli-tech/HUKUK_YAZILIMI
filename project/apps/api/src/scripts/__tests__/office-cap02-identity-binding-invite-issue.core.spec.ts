import {
  buildInviteIssuePlan,
  decideInviteIssue,
  parseInviteIssuePackage,
  type InviteIssueFacts,
  type InviteIssueRecord,
} from '../office-cap02-identity-binding-invite-issue.core';

/**
 * OFFICE-P2-IDENTITY-COMPLETION-R01 — invite-issue karar çekirdeği doğrulama matrisi.
 * Her owner guard'ı için en az bir kabul ve bir ret senaryosu vardır; hiçbir test DB'ye
 * dokunmaz (çekirdek saf).
 */

const T1 = 'tenant-one-id';

const record = (over: Partial<InviteIssueRecord> = {}): InviteIssueRecord => ({
  tenantSlug: 't-one',
  staffMemberId: 'stf-1',
  canonicalEmail: 'kisi@ofis.test',
  userName: 'Kişi',
  userSurname: 'Bir',
  userRole: 'USER',
  ...over,
});

const facts = (over: Partial<InviteIssueFacts> = {}): InviteIssueFacts => ({
  tenantId: T1,
  staff: {
    staffMemberId: 'stf-1',
    tenantId: T1,
    isActive: true,
    userId: null,
    profileEmail: 'kisi@ofis.test',
  },
  existingUserIdWithEmail: null,
  boundUserEmail: null,
  ...over,
});

// ---------------------------------------------------------------------------
// parseInviteIssuePackage
// ---------------------------------------------------------------------------

describe('parseInviteIssuePackage', () => {
  const valid = () => [
    {
      tenantSlug: 't-one',
      staffMemberId: 'stf-1',
      canonicalEmail: 'kisi@ofis.test',
      userName: 'Kişi',
      userSurname: 'Bir',
      userRole: 'USER',
    },
  ];

  it('geçerli paket kabul edilir', () => {
    const parsed = parseInviteIssuePackage(valid());
    expect(parsed.issues).toEqual([]);
    expect(parsed.records).toHaveLength(1);
  });

  it('dizi olmayan / boş paket reddedilir', () => {
    expect(parseInviteIssuePackage('x').issues[0].code).toBe('PACKAGE_NOT_ARRAY');
    expect(parseInviteIssuePackage([]).issues[0].code).toBe('PACKAGE_EMPTY');
  });

  it('bilinmeyen alan ve eksik alan fail-closed', () => {
    const withUnknown = parseInviteIssuePackage([{ ...valid()[0], fazla: 1 }]);
    expect(withUnknown.records).toEqual([]);
    expect(withUnknown.issues).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_FIELD', detail: 'fazla' }),
    );

    const missing = { ...valid()[0] } as Record<string, unknown>;
    delete missing.canonicalEmail;
    const withMissing = parseInviteIssuePackage([missing]);
    expect(withMissing.records).toEqual([]);
    expect(withMissing.issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD', detail: 'canonicalEmail' }),
    );
  });

  it('rol sözlüğü: yalnız USER|VIEWER (ADMIN reddedilir)', () => {
    const parsed = parseInviteIssuePackage([{ ...valid()[0], userRole: 'ADMIN' }]);
    expect(parsed.records).toEqual([]);
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_FIELD_VALUE', detail: 'userRole: ADMIN' }),
    );
  });

  it('NEGATİF — duplicate identity: aynı personel veya aynı e-posta pakette iki kez', () => {
    const dupStaff = parseInviteIssuePackage([
      valid()[0],
      { ...valid()[0], canonicalEmail: 'baska@ofis.test' },
    ]);
    expect(dupStaff.records).toEqual([]);
    expect(dupStaff.issues).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_STAFF_IN_PACKAGE', detail: 'stf-1' }),
    );

    const dupEmail = parseInviteIssuePackage([
      valid()[0],
      { ...valid()[0], staffMemberId: 'stf-2', canonicalEmail: 'KISI@ofis.test ' },
    ]);
    expect(dupEmail.records).toEqual([]);
    expect(dupEmail.issues).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_EMAIL_IN_PACKAGE' }),
    );
  });
});

// ---------------------------------------------------------------------------
// decideInviteIssue
// ---------------------------------------------------------------------------

describe('decideInviteIssue', () => {
  it('aktif, bağsız, driftsiz, çakışmasız personel → ISSUE', () => {
    const d = decideInviteIssue(record(), facts());
    expect(d.kind).toBe('ISSUE');
    expect(d.failures).toEqual([]);
  });

  it('kanonik e-posta büyük/küçük harf ve boşluk normalize edilerek karşılaştırılır', () => {
    const d = decideInviteIssue(record({ canonicalEmail: ' KISI@OFIS.TEST ' }), facts());
    expect(d.kind).toBe('ISSUE');
  });

  it('tenant slug çözülemezse fail-closed', () => {
    const d = decideInviteIssue(record(), facts({ tenantId: null }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_UNKNOWN');
  });

  it('personel bulunamazsa fail-closed', () => {
    const d = decideInviteIssue(record(), facts({ staff: null }));
    expect(d.failures).toContain('STAFF_NOT_FOUND');
  });

  it('NEGATİF — cross-tenant: personel başka tenanttaysa fail-closed', () => {
    const d = decideInviteIssue(
      record(),
      facts({ staff: { ...facts().staff!, tenantId: 'tenant-two-id' } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('STAFF_TENANT_MISMATCH');
  });

  it('IDEMPOTENCY — kanonik hesaba zaten bağlıysa ALREADY_APPLIED (pasiflik kontrolünden ÖNCE)', () => {
    const d = decideInviteIssue(
      record(),
      facts({
        staff: { ...facts().staff!, userId: 'u-1', isActive: false },
        boundUserEmail: 'kisi@ofis.test',
      }),
    );
    expect(d.kind).toBe('ALREADY_APPLIED');
    expect(d.failures).toEqual([]);
  });

  it('farklı hesaba bağlıysa üzerine yazılmaz', () => {
    const d = decideInviteIssue(
      record(),
      facts({
        staff: { ...facts().staff!, userId: 'u-baska' },
        boundUserEmail: 'baska@ofis.test',
      }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('STAFF_BOUND_TO_DIFFERENT_USER');
  });

  it('NEGATİF — pasif principal: bağsız pasif personel fail-closed', () => {
    const d = decideInviteIssue(record(), facts({ staff: { ...facts().staff!, isActive: false } }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('STAFF_INACTIVE');
  });

  it('profil e-postası kanonik adrese eşit değilse drift fail-closed (owner kural 7)', () => {
    const d = decideInviteIssue(
      record(),
      facts({ staff: { ...facts().staff!, profileEmail: 'eski@adres.test' } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('PROFILE_EMAIL_DRIFT');
  });

  it('profil e-postası null ise de drift sayılır', () => {
    const d = decideInviteIssue(
      record(),
      facts({ staff: { ...facts().staff!, profileEmail: null } }),
    );
    expect(d.failures).toContain('PROFILE_EMAIL_DRIFT');
  });

  it('kanonik e-posta tenant içinde zaten User taşıyorsa beklenmeyen satır → fail-closed', () => {
    const d = decideInviteIssue(record(), facts({ existingUserIdWithEmail: 'u-mevcut' }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('CANONICAL_EMAIL_ALREADY_IN_USE');
  });
});

// ---------------------------------------------------------------------------
// buildInviteIssuePlan
// ---------------------------------------------------------------------------

describe('buildInviteIssuePlan', () => {
  it('ISSUE kararı exact before/after diff üretir; sayaçlar ve executable doğru', () => {
    const r = record();
    const f = facts();
    const plan = buildInviteIssuePlan([r], [decideInviteIssue(r, f)], { 'stf-1': f });
    expect(plan.executable).toBe(true);
    expect(plan.counts).toEqual({ ISSUE: 1, ALREADY_APPLIED: 0, FAIL_CLOSED: 0 });
    expect(plan.entries[0].diff).toEqual({
      before: { staffUserId: null, userExists: false, inviteExists: false },
      after: {
        staffUserId: 'NEW_PENDING_USER_ID',
        user: { email: 'kisi@ofis.test', role: 'USER', isActive: false, passwordHash: null },
        invite: { email: 'kisi@ofis.test', state: 'OPEN' },
      },
    });
  });

  it('FAIL_CLOSED varsa executable=false ve diff üretilmez', () => {
    const r = record();
    const f = facts({ staff: { ...facts().staff!, isActive: false } });
    const plan = buildInviteIssuePlan([r], [decideInviteIssue(r, f)], { 'stf-1': f });
    expect(plan.executable).toBe(false);
    expect(plan.entries[0].diff).toBeNull();
  });

  it('kayıt/karar uzunluk uyuşmazlığı fırlatır', () => {
    expect(() => buildInviteIssuePlan([record()], [], {})).toThrow(/INVITE_ISSUE_PLAN_MISMATCH/);
  });
});
