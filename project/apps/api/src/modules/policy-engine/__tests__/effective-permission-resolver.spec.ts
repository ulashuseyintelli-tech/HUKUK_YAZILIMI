import { EffectivePermissionResolver } from '../effective-permission-resolver.service';
import { ActionCode } from '../types/action-code.enum';
import {
  ActionClass,
  Capacity,
  DecisionSource,
  GuidedOpenDecision,
} from '../types/effective-permission.types';
import {
  ACTION_TO_CASE_PERMISSION,
  CASE_PERMISSION_TO_ACTION,
  classifyAction,
  decide,
  DecideParams,
  isOfficeAdminCapacity,
  isQualifiedForValidity,
} from '../effective-permission-mapping';

/**
 * P2a CORE — EffectivePermissionResolver unit + mapping testleri.
 * KESİN KURAL: resolver hiçbir aksiyonu engellemez (enforced=false, mode=observe).
 */

const baseDecide = (over: Partial<DecideParams>): DecideParams => ({
  actionCode: ActionCode.EDIT_CASE,
  actionClass: ActionClass.L1,
  capacity: 'LAWYER',
  tenantOk: true,
  hasCaseMembership: true,
  caseGrantPresent: false,
  isOfficeAdmin: false,
  fullAuthority: false,
  ...over,
});

describe('decide() — saf 4-katman karar', () => {
  it('tenant yanlışsa DENY_TENANT_BOUNDARY', () => {
    const r = decide(baseDecide({ tenantOk: false }));
    expect(r.decision).toBe(GuidedOpenDecision.DENY_TENANT_BOUNDARY);
    expect(r.decisionSource).toBe(DecisionSource.TENANT_BOUNDARY);
  });

  it('SIGN + kalifiye olmayan (INTERN) → ROUTE_REQUIRED / VALIDITY_ROUTE', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.SIGN, actionClass: ActionClass.L4, capacity: 'INTERN' }));
    expect(r.decision).toBe(GuidedOpenDecision.ROUTE_REQUIRED);
    expect(r.decisionSource).toBe(DecisionSource.VALIDITY_ROUTE);
  });

  it('SIGN + kalifiye (LAWYER) → ALLOW', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.SIGN, actionClass: ActionClass.L4, capacity: 'LAWYER' }));
    expect(r.decision).toBe(GuidedOpenDecision.ALLOW);
  });

  it('fullAuthority validity-route’u AŞAMAZ (INTERN SIGN hâlâ ROUTE)', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.SIGN, actionClass: ActionClass.L4, capacity: 'INTERN', fullAuthority: true }));
    expect(r.decision).toBe(GuidedOpenDecision.ROUTE_REQUIRED);
  });

  it('UYAP_SEND → HARDWARE_REQUIRED / HARDWARE', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.UYAP_SEND, actionClass: ActionClass.L4, capacity: 'PARTNER' }));
    expect(r.decision).toBe(GuidedOpenDecision.HARDWARE_REQUIRED);
    expect(r.decisionSource).toBe(DecisionSource.HARDWARE);
  });

  it('fullAuthority hardware’ı AŞAMAZ (UYAP_SEND hâlâ HARDWARE)', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.UYAP_SEND, actionClass: ActionClass.L4, fullAuthority: true }));
    expect(r.decision).toBe(GuidedOpenDecision.HARDWARE_REQUIRED);
  });

  it('fullAuthority guarded-edge confirm’i kaldırır (CLOSE_CASE → ALLOW / FULL_AUTHORITY)', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.CLOSE_CASE, actionClass: ActionClass.L3, fullAuthority: true }));
    expect(r.decision).toBe(GuidedOpenDecision.ALLOW);
    expect(r.decisionSource).toBe(DecisionSource.FULL_AUTHORITY);
  });

  it('APPROVE_EXPENSE → APPROVAL_REQUIRED', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.APPROVE_EXPENSE, actionClass: ActionClass.L3 }));
    expect(r.decision).toBe(GuidedOpenDecision.APPROVAL_REQUIRED);
  });

  it('CLOSE_CASE → CONFIRM_REQUIRED', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.CLOSE_CASE, actionClass: ActionClass.L3 }));
    expect(r.decision).toBe(GuidedOpenDecision.CONFIRM_REQUIRED);
  });

  it('L2 CHANGE_STATUS + case-member → ALLOW (caseGrant → CASE_GRANT)', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.CHANGE_STATUS, actionClass: ActionClass.L2, hasCaseMembership: true, caseGrantPresent: true }));
    expect(r.decision).toBe(GuidedOpenDecision.ALLOW);
    expect(r.decisionSource).toBe(DecisionSource.CASE_GRANT);
  });

  it('L2 CHANGE_STATUS + non-member + office-admin değil → CONFIRM_REQUIRED', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.CHANGE_STATUS, actionClass: ActionClass.L2, hasCaseMembership: false, isOfficeAdmin: false }));
    expect(r.decision).toBe(GuidedOpenDecision.CONFIRM_REQUIRED);
  });

  it('L2 non-member ama office-admin → ALLOW', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.CHANGE_STATUS, actionClass: ActionClass.L2, hasCaseMembership: false, isOfficeAdmin: true }));
    expect(r.decision).toBe(GuidedOpenDecision.ALLOW);
  });

  it('L1 açık EDIT_CASE → ALLOW / OPEN (grant yoksa)', () => {
    const r = decide(baseDecide({ actionCode: ActionCode.EDIT_CASE, actionClass: ActionClass.L1, caseGrantPresent: false }));
    expect(r.decision).toBe(GuidedOpenDecision.ALLOW);
    expect(r.decisionSource).toBe(DecisionSource.OPEN);
  });
});

describe('classifyAction()', () => {
  it.each<[ActionCode, ActionClass]>([
    [ActionCode.SIGN, ActionClass.L4],
    [ActionCode.UYAP_SEND, ActionClass.L4],
    [ActionCode.TRIGGER_HACIZ, ActionClass.L4],
    [ActionCode.APPROVE_EXPENSE, ActionClass.L3],
    [ActionCode.CLOSE_CASE, ActionClass.L3],
    [ActionCode.CHANGE_STATUS, ActionClass.L2],
    [ActionCode.EDIT_PARTIES, ActionClass.L2],
    [ActionCode.EDIT_CASE, ActionClass.L1],
    [ActionCode.UYAP_QUERY, ActionClass.L1],
  ])('%s → %s', (action, cls) => {
    expect(classifyAction(action)).toBe(cls);
  });
});

describe('casePermissions ↔ ActionCode mapping', () => {
  it('canEditCase → EDIT_CASE; hasSignatureAuthority → SIGN', () => {
    expect(CASE_PERMISSION_TO_ACTION.canEditCase).toBe(ActionCode.EDIT_CASE);
    expect(CASE_PERMISSION_TO_ACTION.hasSignatureAuthority).toBe(ActionCode.SIGN);
  });

  it('receiveNotifications permission DEĞİL (haritada yok)', () => {
    expect(CASE_PERMISSION_TO_ACTION.receiveNotifications).toBeUndefined();
  });

  it('ters harita: EDIT_CASE → canEditCase; SIGN ters haritada YOK (ayrı boolean alan)', () => {
    expect(ACTION_TO_CASE_PERMISSION[ActionCode.EDIT_CASE]).toBe('canEditCase');
    expect(ACTION_TO_CASE_PERMISSION[ActionCode.SIGN]).toBeUndefined();
  });

  it('capacity yardımcıları', () => {
    expect(isQualifiedForValidity('LAWYER')).toBe(true);
    expect(isQualifiedForValidity('INTERN')).toBe(false);
    expect(isQualifiedForValidity('SEKRETER' as Capacity)).toBe(false);
    expect(isOfficeAdminCapacity('PARTNER')).toBe(true);
    expect(isOfficeAdminCapacity('LAWYER')).toBe(false);
  });
});

describe('EffectivePermissionResolver.resolve() — mock Prisma (observe-mode)', () => {
  const makePrisma = (over: any = {}) => ({
    user: { findUnique: jest.fn() },
    caseLawyer: { findFirst: jest.fn() },
    caseStaff: { findFirst: jest.fn() },
    ...over,
  });

  it('avukat (LAWYER) + case-member + canEditCase grant → ALLOW / CASE_GRANT, observe', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1', lawyer: { id: 'law1', lawyerRank: 'LAWYER' }, staffMember: null });
    prisma.caseLawyer.findFirst.mockResolvedValue({ casePermissions: { canEditCase: true }, hasSignatureAuthority: false });
    const r = new EffectivePermissionResolver(prisma as any);
    const d = await r.resolve({ actorUserId: 'u1', tenantId: 't1', caseId: 'c1', actionCode: ActionCode.EDIT_CASE });
    expect(d.decision).toBe(GuidedOpenDecision.ALLOW);
    expect(d.decisionSource).toBe(DecisionSource.CASE_GRANT);
    expect(d.capacity).toBe('LAWYER');
    expect(d.hasCaseMembership).toBe(true);
    expect(d.caseGrantPresent).toBe(true);
    expect(d.mode).toBe('observe');
    expect(d.enforced).toBe(false);
  });

  it('stajyer avukat SIGN → ROUTE_REQUIRED (validity-route)', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', tenantId: 't1', lawyer: { id: 'law2', lawyerRank: 'INTERN' }, staffMember: null });
    prisma.caseLawyer.findFirst.mockResolvedValue({ casePermissions: {}, hasSignatureAuthority: true });
    const r = new EffectivePermissionResolver(prisma as any);
    const d = await r.resolve({ actorUserId: 'u2', tenantId: 't1', caseId: 'c1', actionCode: ActionCode.SIGN });
    expect(d.decision).toBe(GuidedOpenDecision.ROUTE_REQUIRED);
    expect(d.wouldRequireRoute).toBe(true);
    expect(d.enforced).toBe(false);
  });

  it('bilinmeyen kullanıcı → DENY_TENANT_BOUNDARY', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const r = new EffectivePermissionResolver(prisma as any);
    const d = await r.resolve({ actorUserId: 'ghost', tenantId: 't1', caseId: 'c1', actionCode: ActionCode.EDIT_CASE });
    expect(d.decision).toBe(GuidedOpenDecision.DENY_TENANT_BOUNDARY);
    expect(d.wouldDenyTenantBoundary).toBe(true);
  });

  it('tenant mismatch → DENY_TENANT_BOUNDARY', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u3', tenantId: 'tX', lawyer: { id: 'law3', lawyerRank: 'PARTNER' }, staffMember: null });
    prisma.caseLawyer.findFirst.mockResolvedValue(null);
    const r = new EffectivePermissionResolver(prisma as any);
    const d = await r.resolve({ actorUserId: 'u3', tenantId: 't1', caseId: 'c1', actionCode: ActionCode.EDIT_CASE });
    expect(d.decision).toBe(GuidedOpenDecision.DENY_TENANT_BOUNDARY);
  });

  it('sekreter non-member CHANGE_STATUS → CONFIRM_REQUIRED', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u4', tenantId: 't1', lawyer: null, staffMember: { id: 'st1', staffType: 'SEKRETER' } });
    prisma.caseStaff.findFirst.mockResolvedValue(null);
    const r = new EffectivePermissionResolver(prisma as any);
    const d = await r.resolve({ actorUserId: 'u4', tenantId: 't1', caseId: 'c1', actionCode: ActionCode.CHANGE_STATUS });
    expect(d.decision).toBe(GuidedOpenDecision.CONFIRM_REQUIRED);
    expect(d.capacity).toBe('SEKRETER');
    expect(d.hasCaseMembership).toBe(false);
  });

  it('office-wide action (caseId yok) → üyelik aranmaz; L1 ALLOW/OPEN', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u5', tenantId: 't1', lawyer: { id: 'law5', lawyerRank: 'MANAGER' }, staffMember: null });
    const r = new EffectivePermissionResolver(prisma as any);
    const d = await r.resolve({ actorUserId: 'u5', tenantId: 't1', actionCode: ActionCode.EDIT_CASE });
    expect(d.hasCaseMembership).toBe(false);
    expect(d.decision).toBe(GuidedOpenDecision.ALLOW);
    expect(d.decisionSource).toBe(DecisionSource.OPEN);
    expect(prisma.caseLawyer.findFirst).not.toHaveBeenCalled();
  });

  it('her durumda enforced=false ve mode=observe (engelleme yok kanıtı)', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u6', tenantId: 't1', lawyer: null, staffMember: { id: 'st6', staffType: 'MUHASEBE' } });
    prisma.caseStaff.findFirst.mockResolvedValue({ canEdit: false, canApprove: true, canView: true });
    const r = new EffectivePermissionResolver(prisma as any);
    for (const action of [ActionCode.SIGN, ActionCode.UYAP_SEND, ActionCode.CLOSE_CASE, ActionCode.EDIT_CASE]) {
      const d = await r.resolve({ actorUserId: 'u6', tenantId: 't1', caseId: 'c1', actionCode: action });
      expect(d.enforced).toBe(false);
      expect(d.mode).toBe('observe');
    }
  });
});
