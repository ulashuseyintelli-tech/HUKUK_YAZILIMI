/** @jest-environment node */
import 'reflect-metadata';
import { OfficeApprovalShadowService } from '../office-approval-shadow.service';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';

/**
 * P4-2/P4-3 — OfficeApprovalShadowService testleri.
 * P4-2 (off/observe): PARTNER→ALLOW · diğer→WOULD_REQUIRE_APPROVAL · off→no-op · observe→audit+karar (create YOK·leak yok·best-effort).
 * P4-3 (enforce): PARTNER→ALLOW (create YOK·envelope YOK) · non-PARTNER→OfficeApprovalRequest create + APPROVAL_REQUIRED envelope ·
 *   savedIntent=ham niyet · idempotencyKey deterministik · leak yok · FAIL-CLOSED (create hatası YUTULMAZ).
 */

const baseInput = {
  actorUserId: 'u1',
  tenantId: 't1',
  actionCode: 'CHANGE_STATUS',
  targetType: 'LegalCase',
  targetRef: 'c1',
  payload: { status: 'ACIZ', reason: 'x' as string | null },
};

const make = (opts: {
  flag?: string;
  user?: unknown;
  userThrows?: boolean;
  createReturns?: unknown;
  createThrows?: boolean;
}) => {
  const config = {
    get: jest.fn((k: string) => (k === 'OFFICE_APPROVAL_CHANGE_STATUS_GATE' ? opts.flag : undefined)),
  };
  const userFindUnique = opts.userThrows
    ? jest.fn().mockRejectedValue(new Error('db boom'))
    : jest.fn().mockResolvedValue(opts.user ?? null);
  // prisma.officeApprovalRequest.create shadow servisinden HİÇ çağrılmamalı (create yalnız officeApproval.createPendingRequest üzerinden).
  const prisma = { user: { findUnique: userFindUnique }, officeApprovalRequest: { create: jest.fn() } };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const createPendingRequest = opts.createThrows
    ? jest.fn().mockRejectedValue(new Error('create boom'))
    : jest.fn().mockResolvedValue(opts.createReturns ?? { id: 'req-1', status: 'PENDING_APPROVAL' });
  const officeApproval = { createPendingRequest };
  const svc = new OfficeApprovalShadowService(
    config as never,
    prisma as never,
    audit as never,
    officeApproval as never,
  );
  return { svc, config, prisma, audit, officeApproval };
};

const u = (over: Record<string, unknown> = {}) => ({
  id: 'u1', isActive: true, tenantId: 't1', lawyer: null, staffMember: null, ...over,
});
const partner = () => u({ lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } });
const lawyerPlain = () => u({ lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: false } });
const delegated = () => u({ lawyer: { lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true } });
const staff = () => u({ staffMember: { staffType: 'SEKRETER' } });

describe('P4-2 OfficeApprovalShadowService — flag', () => {
  it("flag 'off'/unset/bilinmeyen → no-op (evaluated:false; user-lookup/audit/create ÇAĞRILMAZ). 'enforce' artık AKTİF (no-op değil).", async () => {
    for (const flag of [undefined, 'off', 'ON', 'xyz', 'OBSERVED', 'ENFORCED']) {
      const { svc, prisma, audit, officeApproval } = make({ flag });
      const res = await svc.evaluate({ ...baseInput, payload: undefined });
      expect(res).toEqual({ flagMode: 'off', evaluated: false });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
      expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
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

describe('P4-2 OfficeApprovalShadowService — observe: audit + no-side-effect + gizlilik', () => {
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

  it('observe: OfficeApprovalRequest OLUŞTURMAZ (createPendingRequest ve prisma.create çağrılmaz) + envelope YOK', async () => {
    const { svc, prisma, officeApproval } = make({ flag: 'observe', user: staff() });
    const r = await svc.evaluate(baseInput);
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
    expect(prisma.officeApprovalRequest.create).not.toHaveBeenCalled();
    expect(r.envelope).toBeUndefined();
    expect(r.requestId).toBeUndefined();
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

describe('P4-3 OfficeApprovalShadowService — enforce (CHANGE_STATUS approval CREATE path)', () => {
  it('flag enforce → flagMode "enforce" (off DEĞİL)', async () => {
    const { svc } = make({ flag: 'enforce', user: partner() });
    const r = await svc.evaluate(baseInput);
    expect(r.flagMode).toBe('enforce');
  });

  // Acceptance 1: PARTNER requester → ALLOW → request YOK → mevcut CHANGE_STATUS çalışır (envelope YOK)
  it('PARTNER → ALLOW: createPendingRequest ÇAĞRILMAZ, envelope/requestId YOK, audit YOK', async () => {
    const { svc, officeApproval, audit } = make({ flag: 'enforce', user: partner() });
    const r = await svc.evaluate(baseInput);
    expect(r).toMatchObject({ flagMode: 'enforce', evaluated: true, decision: 'ALLOW', reasonCode: 'PARTNER_SELF_AUTHORITY' });
    expect(r.envelope).toBeUndefined();
    expect(r.requestId).toBeUndefined();
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled(); // shadow audit yalnız observe'de
  });

  // Acceptance 2: non-PARTNER lawyer → OfficeApprovalRequest PENDING_APPROVAL create + APPROVAL_REQUIRED envelope
  it('non-PARTNER avukat → OfficeApprovalRequest create (PENDING) + APPROVAL_REQUIRED envelope', async () => {
    const { svc, officeApproval } = make({ flag: 'enforce', user: lawyerPlain(), createReturns: { id: 'req-42', status: 'PENDING_APPROVAL' } });
    const r = await svc.evaluate(baseInput);
    expect(officeApproval.createPendingRequest).toHaveBeenCalledTimes(1);
    const arg = officeApproval.createPendingRequest.mock.calls[0][0];
    expect(arg).toMatchObject({ tenantId: 't1', actionCode: 'CHANGE_STATUS', targetType: 'LegalCase', targetRef: 'c1', requesterUserId: 'u1' });
    expect(arg.savedIntent).toEqual({ status: 'ACIZ', reason: 'x' }); // Acceptance 5: savedIntent = ham niyet (immutable iletilir)
    expect(typeof arg.idempotencyKey).toBe('string'); // Acceptance 7
    expect(r.requestId).toBe('req-42');
    expect(r.decision).toBe('WOULD_REQUIRE_APPROVAL');
    expect(r.envelope).toBeDefined();
    expect(r.envelope!.outcome).toBe('APPROVAL_REQUIRED');
    expect(r.envelope!.axis).toBe('GUIDED_OPEN_PERMISSION');
    expect(r.envelope!.actionCode).toBe('CHANGE_STATUS');
    expect(r.envelope!.approval).toEqual({ requestId: 'req-42', status: 'PENDING_APPROVAL' });
    expect(r.envelope!.target).toMatchObject({ resourceType: 'LegalCase', caseId: 'c1' });
  });

  // Acceptance 3: delegated non-PARTNER → kendi talebinde yine request create
  it('delege non-PARTNER (canApprove true) → KENDİ talebinde yine create (bypass YOK)', async () => {
    const { svc, officeApproval } = make({ flag: 'enforce', user: delegated() });
    const r = await svc.evaluate(baseInput);
    expect(officeApproval.createPendingRequest).toHaveBeenCalledTimes(1);
    expect(r.envelope!.reasonCode).toBe('DELEGATED_NO_SELF_APPROVE');
  });

  // Acceptance 4: staff / unlinked → request create
  it('staff → create + envelope (STAFF_NOT_APPROVER)', async () => {
    const { svc, officeApproval } = make({ flag: 'enforce', user: staff() });
    const r = await svc.evaluate(baseInput);
    expect(officeApproval.createPendingRequest).toHaveBeenCalledTimes(1);
    expect(r.envelope!.reasonCode).toBe('STAFF_NOT_APPROVER');
  });

  it('unlinked → create + envelope (UNLINKED) [non-ALLOW her zaman create]', async () => {
    const { svc, officeApproval } = make({ flag: 'enforce', user: u() });
    const r = await svc.evaluate(baseInput);
    expect(officeApproval.createPendingRequest).toHaveBeenCalledTimes(1);
    expect(r.envelope!.reasonCode).toBe('UNLINKED');
  });

  // Acceptance 7: idempotencyKey deterministik
  it('idempotency: aynı (aktör+hedef+niyet) → AYNI idempotencyKey', async () => {
    const { svc, officeApproval } = make({ flag: 'enforce', user: lawyerPlain() });
    await svc.evaluate(baseInput);
    await svc.evaluate(baseInput);
    const k1 = officeApproval.createPendingRequest.mock.calls[0][0].idempotencyKey;
    const k2 = officeApproval.createPendingRequest.mock.calls[1][0].idempotencyKey;
    expect(k1).toBe(k2);
  });

  it('idempotency: farklı niyet (status değişir) → FARKLI idempotencyKey', async () => {
    const { svc, officeApproval } = make({ flag: 'enforce', user: lawyerPlain() });
    await svc.evaluate(baseInput);
    await svc.evaluate({ ...baseInput, payload: { status: 'BATAK', reason: 'x' } });
    const k1 = officeApproval.createPendingRequest.mock.calls[0][0].idempotencyKey;
    const k2 = officeApproval.createPendingRequest.mock.calls[1][0].idempotencyKey;
    expect(k1).not.toBe(k2);
  });

  // Acceptance 9: envelope/result ham reason/savedIntent SIZDIRMAZ
  it('GİZLİLİK: envelope ham reason/savedIntent İÇERMEZ', async () => {
    const { svc } = make({ flag: 'enforce', user: lawyerPlain() });
    const r = await svc.evaluate({ ...baseInput, payload: { status: 'ACIZ', reason: 'GIZLI_GEREKCE' } });
    const blob = JSON.stringify(r.envelope);
    expect(blob).not.toContain('GIZLI_GEREKCE');
    expect(blob).not.toContain('savedIntent');
  });

  // FAIL-CLOSED: create hata verirse enforce THROW eder (observe gibi YUTMAZ → sessizce mutasyona düşülmez)
  it('FAIL-CLOSED: createPendingRequest hata verirse enforce THROW eder (yutmaz)', async () => {
    const { svc } = make({ flag: 'enforce', user: lawyerPlain(), createThrows: true });
    await expect(svc.evaluate(baseInput)).rejects.toThrow('create boom');
  });
});
