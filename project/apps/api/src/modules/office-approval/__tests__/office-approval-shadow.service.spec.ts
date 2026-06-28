/** @jest-environment node */
import 'reflect-metadata';
import { OfficeApprovalShadowService } from '../office-approval-shadow.service';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';

/**
 * P4-2 — OfficeApprovalShadowService (CHANGE_STATUS approval SHADOW) testleri.
 * KESİN: PARTNER→ALLOW · diğer herkes→WOULD_REQUIRE_APPROVAL (delege KENDİ talebinde bypass YOK) ·
 * off→no-op · observe→audit+karar · OfficeApprovalRequest OLUŞTURMAZ · ham payload audit'e SIZMAZ · best-effort.
 */

const baseInput = {
  actorUserId: 'u1',
  tenantId: 't1',
  actionCode: 'CHANGE_STATUS',
  targetType: 'LegalCase',
  targetRef: 'c1',
  payload: { status: 'ACIZ', reason: 'x' as string | null },
};

const make = (opts: { flag?: string; user?: unknown; userThrows?: boolean }) => {
  const config = {
    get: jest.fn((k: string) => (k === 'OFFICE_APPROVAL_CHANGE_STATUS_GATE' ? opts.flag : undefined)),
  };
  const userFindUnique = opts.userThrows
    ? jest.fn().mockRejectedValue(new Error('db boom'))
    : jest.fn().mockResolvedValue(opts.user ?? null);
  // officeApprovalRequest.create mevcut AMA çağrılmamalı (shadow request OLUŞTURMAZ)
  const prisma = { user: { findUnique: userFindUnique }, officeApprovalRequest: { create: jest.fn() } };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new OfficeApprovalShadowService(config as never, prisma as never, audit as never);
  return { svc, config, prisma, audit };
};

const u = (over: Record<string, unknown> = {}) => ({
  id: 'u1', isActive: true, tenantId: 't1', lawyer: null, staffMember: null, ...over,
});
const partner = () => u({ lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } });
const lawyerPlain = () => u({ lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: false } });
const delegated = () => u({ lawyer: { lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true } });
const staff = () => u({ staffMember: { staffType: 'SEKRETER' } });

describe('P4-2 OfficeApprovalShadowService — flag', () => {
  it("flag 'off'/unset/'enforce' → no-op (evaluated:false; user-lookup ve audit ÇAĞRILMAZ)", async () => {
    for (const flag of [undefined, 'off', 'enforce', 'ON', 'xyz']) {
      const { svc, prisma, audit } = make({ flag });
      const res = await svc.evaluate({ ...baseInput, payload: undefined });
      expect(res).toEqual({ flagMode: 'off', evaluated: false });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    }
  });
});

describe('P4-2 OfficeApprovalShadowService — karar matrisi (observe)', () => {
  it('PARTNER requester → ALLOW (PARTNER_SELF_AUTHORITY)', async () => {
    const { svc } = make({ flag: 'observe', user: partner() });
    const r = await svc.evaluate(baseInput);
    expect(r).toMatchObject({ flagMode: 'observe', evaluated: true, decision: 'ALLOW', reasonCode: 'PARTNER_SELF_AUTHORITY', requesterCapacity: 'PARTNER' });
  });

  it('non-PARTNER avukat (canApprove false) → WOULD_REQUIRE_APPROVAL (NON_AUTHORITY_LAWYER)', async () => {
    const { svc } = make({ flag: 'observe', user: lawyerPlain() });
    const r = await svc.evaluate(baseInput);
    expect(r).toMatchObject({ decision: 'WOULD_REQUIRE_APPROVAL', reasonCode: 'NON_AUTHORITY_LAWYER', requesterCapacity: 'LAWYER' });
  });

  it('delege onaycı (canApprove true, non-PARTNER) → WOULD_REQUIRE_APPROVAL (DELEGATED_NO_SELF_APPROVE) — KENDİ talebinde bypass YOK', async () => {
    const { svc } = make({ flag: 'observe', user: delegated() });
    const r = await svc.evaluate(baseInput);
    expect(r).toMatchObject({ decision: 'WOULD_REQUIRE_APPROVAL', reasonCode: 'DELEGATED_NO_SELF_APPROVE' });
  });

  it('staff → WOULD_REQUIRE_APPROVAL (STAFF_NOT_APPROVER)', async () => {
    const { svc } = make({ flag: 'observe', user: staff() });
    const r = await svc.evaluate(baseInput);
    expect(r).toMatchObject({ decision: 'WOULD_REQUIRE_APPROVAL', reasonCode: 'STAFF_NOT_APPROVER', requesterCapacity: 'SEKRETER' });
  });

  it('unlinked user → WOULD_REQUIRE_APPROVAL (UNLINKED)', async () => {
    const { svc } = make({ flag: 'observe', user: u() });
    const r = await svc.evaluate(baseInput);
    expect(r).toMatchObject({ decision: 'WOULD_REQUIRE_APPROVAL', reasonCode: 'UNLINKED', requesterCapacity: 'UNKNOWN' });
  });

  it('inactive user (PARTNER bile) → ACTOR_NOT_RESOLVABLE', async () => {
    const { svc } = make({ flag: 'observe', user: u({ isActive: false, lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } }) });
    const r = await svc.evaluate(baseInput);
    expect(r).toMatchObject({ decision: 'WOULD_REQUIRE_APPROVAL', reasonCode: 'ACTOR_NOT_RESOLVABLE' });
  });

  it('cross-tenant user → ACTOR_NOT_RESOLVABLE (approver sayılmaz)', async () => {
    const { svc } = make({ flag: 'observe', user: u({ tenantId: 't-OTHER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } }) });
    const r = await svc.evaluate({ ...baseInput, tenantId: 't1' });
    expect(r).toMatchObject({ decision: 'WOULD_REQUIRE_APPROVAL', reasonCode: 'ACTOR_NOT_RESOLVABLE' });
  });

  it('bulunamayan user (null) → ACTOR_NOT_RESOLVABLE', async () => {
    const { svc } = make({ flag: 'observe', user: null });
    const r = await svc.evaluate(baseInput);
    expect(r).toMatchObject({ decision: 'WOULD_REQUIRE_APPROVAL', reasonCode: 'ACTOR_NOT_RESOLVABLE' });
  });
});

describe('P4-2 OfficeApprovalShadowService — audit + no-side-effect + gizlilik', () => {
  it('observe: OFFICE_APPROVAL_SHADOW_EVALUATED audit yazılır (decision+flagMode+payloadHash)', async () => {
    const { svc, audit } = make({ flag: 'observe', user: lawyerPlain() });
    await svc.evaluate(baseInput);
    expect(audit.log).toHaveBeenCalledTimes(1);
    const a = audit.log.mock.calls[0][0];
    expect(a.action).toBe('OFFICE_APPROVAL_SHADOW_EVALUATED');
    expect(a.userId).toBe('u1'); // truthful requester
    expect(a.metadata).toMatchObject({ actionCode: 'CHANGE_STATUS', targetRef: 'c1', decision: 'WOULD_REQUIRE_APPROVAL', flagMode: 'observe', requesterUserId: 'u1' });
    expect(a.metadata.payloadHash).toBe(stableJsonHash({ status: 'ACIZ', reason: 'x' }));
  });

  it("OfficeApprovalRequest OLUŞTURMAZ (WOULD_REQUIRE_APPROVAL durumunda bile create çağrılmaz)", async () => {
    const { svc, prisma } = make({ flag: 'observe', user: staff() });
    await svc.evaluate(baseInput);
    expect(prisma.officeApprovalRequest.create).not.toHaveBeenCalled();
  });

  it("GİZLİLİK: ham status/reason audit metadata icine SIZMAZ (yalnız payloadHash)", async () => {
    const { svc, audit } = make({ flag: 'observe', user: lawyerPlain() });
    await svc.evaluate({ ...baseInput, payload: { status: 'ACIZ', reason: 'GIZLI_GEREKCE' } });
    const blob = JSON.stringify(audit.log.mock.calls[0][0]);
    expect(blob).not.toContain('GIZLI_GEREKCE');
    expect(blob).not.toContain('savedIntent');
    expect(audit.log.mock.calls[0][0].metadata.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('best-effort: user-lookup hata verirse (observe) → evaluated:false, THROW ETMEZ (akış bozulmaz)', async () => {
    const { svc, audit } = make({ flag: 'observe', userThrows: true });
    const r = await svc.evaluate(baseInput);
    expect(r).toEqual({ flagMode: 'observe', evaluated: false });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('payload yoksa audit payloadHash içermez', async () => {
    const { svc, audit } = make({ flag: 'observe', user: partner() });
    await svc.evaluate({ ...baseInput, payload: undefined });
    expect('payloadHash' in audit.log.mock.calls[0][0].metadata).toBe(false);
  });
});
