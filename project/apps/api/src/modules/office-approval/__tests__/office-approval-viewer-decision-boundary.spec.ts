/**
 * VIEWER ONAY KARARI SINIRI (owner GO 2026-09-10, AK-1a eki) — birim düzeyi kanıtlar (DB YOK).
 *
 * Giriş yollarını HTTP spec'i kanıtlar (office-approval-viewer-decision-boundary.http.spec.ts); bu dosya üç şeyi kilitler:
 *  1) TEK KURAL: karar yasağı OFFICE yazma yasağıyla aynı yüklemdir; FD dormant servisindeki kopya pariteyle kilitlidir.
 *  2) ROL KAYNAĞI: karar anında DB'den okunan rol (çağıranın beyanı ya da önceki durum değil). DBIND §5 öz-onay
 *     istisnası VIEWER'a açılmaz; ret, karar transaction'ı açılmadan verilir.
 *  3) BAĞLAM AYRIMI: okuma yüklemleri (inbox/detay görünürlüğü, FD çalışma alanı) ve yürütme/kurtarma yolları bu turda
 *     DEĞİŞMEDİ; kayıtlı (geçmiş) kararların idempotent yanıtı değişmez.
 */
import { ForbiddenException } from '@nestjs/common';
import { ClientFinancialDisclosureStatus, OfficeApprovalStatus, UserRole } from '@prisma/client';

jest.mock('../../client-financial-disclosure/client-financial-disclosure-writer.service', () => ({
  ...jest.requireActual('../../client-financial-disclosure/client-financial-disclosure-writer.service'),
  verifyPersistedDisclosureSnapshot: jest.fn().mockResolvedValue({ verdict: 'MATCH' }),
}));

import { OfficeApprovalService } from '../office-approval.service';
import { PayoutApprovalPolicy } from '../client-payout-approval.policy';
import {
  assertApprovalDecisionRole,
  isOfficeWriteDeniedForRole,
  OFFICE_APPROVAL_DECISION_DENIED_VIEWER,
} from '../office-write-role.policy';
import { ClientFinancialDisclosureApprovalService } from '../../client-financial-disclosure/client-financial-disclosure-approval.service';
import {
  isDisclosureApproverEligible,
  isDisclosureDecisionRoleDenied,
} from '../../client-financial-disclosure/client-financial-disclosure-approval-eligibility';
import {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INTENT_CONTRACT_VERSION,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
} from '../../client-financial-disclosure/client-financial-disclosure-approval.contract';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';

const TENANT = 't1';
const REQUESTER = 'u-req';
const DENIED = 'OFFICE_APPROVAL_DECISION_DENIED_VIEWER';

type Role = 'ADMIN' | 'USER' | 'VIEWER';
type Lawyer = { lawyerRank: string; canApproveOfficeActions: boolean };
type UserRow = { id: string; role: Role; lawyer: Lawyer | null };
type Row = Record<string, any>;

const PARTNER: Lawyer = { lawyerRank: 'PARTNER', canApproveOfficeActions: false };
const MANAGER: Lawyer = { lawyerRank: 'MANAGER', canApproveOfficeActions: false };
const DELEGATE: Lawyer = { lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true };

const pending = (id: string, actionCode: string, over: Row = {}): Row => {
  const savedIntent = { kind: actionCode, ref: id };
  return {
    id,
    tenantId: TENANT,
    actionCode,
    targetType: 'LegalCase',
    targetRef: `case-${id}`,
    requesterUserId: REQUESTER,
    approverUserId: null,
    status: 'PENDING_APPROVAL',
    executionStatus: 'NOT_RUN',
    savedIntent,
    payloadHash: stableJsonHash(savedIntent),
    replacementSavedIntent: null,
    replacementPayloadHash: null,
    reason: null,
    decisionNote: null,
    idempotencyKey: null,
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    decidedAt: null,
    executedAt: null,
    expiresAt: null,
    ...over,
  };
};

/** Gerçek OfficeApprovalService + sahte prisma. Kullanıcı satırları DEĞİŞTİRİLEBİLİR (karar anı ölçümü için). */
function officeHarness(users: Record<string, UserRow>, requests: Row[]) {
  const store = new Map<string, Row>(requests.map((r) => [r.id, { ...r }]));
  const prisma: any = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const u = users[where.id];
        if (!u) return null;
        return {
          id: u.id,
          role: u.role,
          isActive: true,
          tenantId: TENANT,
          staffMember: null,
          lawyer: u.lawyer ? { ...u.lawyer, tenantId: TENANT, tckn: null } : null,
        };
      }),
    },
    officeApprovalRequest: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        store.has(where.id) ? { ...store.get(where.id) } : null,
      ),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; status: string }; data: Row }) => {
        const row = store.get(where.id);
        if (!row || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const audit = { log: jest.fn(async (_entry: Record<string, unknown>) => undefined) };
  const domainSync = { syncAfterDecision: jest.fn(async (_tx: unknown, _updated: unknown) => undefined) };
  const svc = new OfficeApprovalService(prisma, audit as never, domainSync as never);
  const resetCalls = () => {
    prisma.$transaction.mockClear();
    prisma.officeApprovalRequest.updateMany.mockClear();
    audit.log.mockClear();
    domainSync.syncAfterDecision.mockClear();
  };
  const expectNoWrites = (requestId: string) => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
    expect(domainSync.syncAfterDecision).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(store.get(requestId)).toMatchObject({ status: 'PENDING_APPROVAL', approverUserId: null, decidedAt: null });
  };
  return { svc, prisma, store, resetCalls, expectNoWrites };
}

const expectDecisionDenied = (err: unknown) => {
  expect(err).toBeInstanceOf(ForbiddenException);
  expect((err as ForbiddenException).getResponse()).toMatchObject({ code: DENIED });
};

describe('1) tek kural — VIEWER onay kararı veremez', () => {
  it(`VIEWER → 403 ${DENIED}`, () => {
    let caught: unknown;
    try {
      assertApprovalDecisionRole('VIEWER');
    } catch (e) {
      caught = e;
    }
    expectDecisionDenied(caught);
    expect(OFFICE_APPROVAL_DECISION_DENIED_VIEWER).toBe(DENIED);
  });

  it.each([UserRole.ADMIN, UserRole.USER, undefined, null])(
    '%s → rol kapısından geçer (rütbe/delege kuralları AYRICA uygulanır)',
    (role) => {
      expect(() => assertApprovalDecisionRole(role)).not.toThrow();
    },
  );

  it('karar yasağı OFFICE yazma yasağıyla AYNI yüklemdir; FD dormant kopyası pariteyle kilitli (drift = FAIL)', () => {
    const samples: unknown[] = [...Object.values(UserRole), undefined, null, '', 'viewer', 'Viewer', ' VIEWER', 0, {}];
    for (const role of samples) {
      let officeDecisionDenied = false;
      try {
        assertApprovalDecisionRole(role);
      } catch {
        officeDecisionDenied = true;
      }
      expect({ role, officeDecision: officeDecisionDenied, fdDecision: isDisclosureDecisionRoleDenied(role) }).toEqual({
        role,
        officeDecision: isOfficeWriteDeniedForRole(role),
        fdDecision: isOfficeWriteDeniedForRole(role),
      });
    }
    expect(Object.values(UserRole).filter((r) => isDisclosureDecisionRoleDenied(r))).toEqual([UserRole.VIEWER]);
  });
});

describe('2) rol kaynağı — karar anında DB\'den okunan rol', () => {
  it('aynı kullanıcı USER iken onaylar; DB rolü VIEWER\'a düşünce SONRAKİ karar 403 ve yazma YOK (önceki onay aynen kalır)', async () => {
    const users: Record<string, UserRow> = { 'u-x': { id: 'u-x', role: 'USER', lawyer: PARTNER } };
    const h = officeHarness(users, [pending('oar-a', 'CHANGE_STATUS'), pending('oar-b', 'CHANGE_STATUS')]);
    await expect(h.svc.approve('oar-a', 'u-x', 'uygun')).resolves.toMatchObject({ status: 'APPROVED', approverUserId: 'u-x' });

    users['u-x'].role = 'VIEWER'; // oturum/JWT değişmeden yalnız DB rolü düşürüldü
    h.resetCalls();
    const err = await h.svc.approve('oar-b', 'u-x', 'uygun').catch((e: unknown) => e);
    expectDecisionDenied(err);
    h.expectNoWrites('oar-b');
    // Geçmiş karar DEĞİŞMEZ: önceki onay kaydı olduğu gibi kalır.
    expect(h.store.get('oar-a')).toMatchObject({ status: 'APPROVED', approverUserId: 'u-x' });
  });

  it('DBIND §5 öz-onay istisnası VIEWER\'a açılmaz: VIEWER-PARTNER kendi CLIENT_PAYOUT_POST talebini onaylayamaz', async () => {
    const h = officeHarness({ 'u-vp': { id: 'u-vp', role: 'VIEWER', lawyer: PARTNER } }, [
      pending('oar-self', 'CLIENT_PAYOUT_POST', { requesterUserId: 'u-vp' }),
    ]);
    const err = await h.svc.approve('oar-self', 'u-vp', 'uygun').catch((e: unknown) => e);
    expectDecisionDenied(err);
    h.expectNoWrites('oar-self');
  });

  const METHODS: Array<[string, (s: OfficeApprovalService) => Promise<unknown>]> = [
    ['approve', (s) => s.approve('oar-g', 'u-vd', 'uygun')],
    ['reject', (s) => s.reject('oar-g', 'u-vd', 'gerekce')],
    ['requestRevision', (s) => s.requestRevision('oar-g', 'u-vd', 'duzeltme')],
    ['approveWithChanges', (s) => s.approveWithChanges('oar-g', 'u-vd', { kind: 'degisik' }, 'not')],
  ];

  it.each(METHODS)(
    'servis sınırı (%s): delege VIEWER → 403; karar transaction\'ı AÇILMAZ, domain senkronu ve audit YOK',
    async (_name, call) => {
      const h = officeHarness({ 'u-vd': { id: 'u-vd', role: 'VIEWER', lawyer: DELEGATE } }, [pending('oar-g', 'CHANGE_STATUS')]);
      const err = await call(h.svc).catch((e: unknown) => e);
      expectDecisionDenied(err);
      h.expectNoWrites('oar-g');
    },
  );
});

// ── FD dormant servis harness'ı (consumed-approval-recovery-r01 deseni) ───────────────────────────
const V = 'fdv-1';
const FD_REQ = 'oar-fd-1';
const DECIDED_AT = new Date('2026-09-01T10:00:00.000Z');
const INTENT = {
  contractVersion: CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INTENT_CONTRACT_VERSION,
  tenantId: TENANT,
  disclosureId: 'fd-root',
  disclosureVersionId: V,
  version: 1,
  snapshotHash: 'snap-1',
};
const VIEWER_PARTNER: UserRow = { id: 'u-vp', role: 'VIEWER', lawyer: PARTNER };

const fdVersion = (over: Row = {}): Row => ({
  id: V,
  tenantId: TENANT,
  disclosureId: 'fd-root',
  version: 1,
  status: ClientFinancialDisclosureStatus.OFFICE_APPROVAL_PENDING,
  snapshotHash: 'snap-1',
  officeApprovalRequestId: FD_REQ,
  officeApprovedById: null,
  officeApprovedAt: null,
  contentApprovedById: null,
  supersededAt: null,
  cancelledAt: null,
  reversedAt: null,
  ...over,
});

const fdRequest = (over: Row = {}): Row => ({
  id: FD_REQ,
  actionCode: CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
  targetType: CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
  targetRef: V,
  requesterUserId: REQUESTER,
  approverUserId: null,
  decidedAt: null,
  savedIntent: INTENT,
  payloadHash: stableJsonHash(INTENT),
  status: OfficeApprovalStatus.PENDING_APPROVAL,
  ...over,
});

function fdHarness(opts: { version: Row; request: Row; actor: UserRow }) {
  const tx: any = {
    $executeRaw: jest.fn(async () => 1),
    clientFinancialDisclosureVersion: {
      findFirst: jest.fn(async () => ({ ...opts.version })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    officeApprovalRequest: {
      findFirst: jest.fn(async () => ({ ...opts.request })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: {
      findUnique: jest.fn(async () => ({
        id: opts.actor.id,
        role: opts.actor.role,
        isActive: true,
        tenantId: TENANT,
        lawyer: opts.actor.lawyer,
      })),
    },
  };
  const svc = new ClientFinancialDisclosureApprovalService({
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
  } as never);
  return { svc, tx };
}

describe('3) bağlam ayrımı — okuma ve yürütme bu turda DEĞİŞMEDİ', () => {
  it('OKUMA: isApproverEligible (inbox/detay görünürlüğü ve onu kullanan diğer kapılar) bağlı VIEWER için hâlâ true', async () => {
    const h = officeHarness(
      {
        'u-vp': { id: 'u-vp', role: 'VIEWER', lawyer: PARTNER },
        'u-vd': { id: 'u-vd', role: 'VIEWER', lawyer: DELEGATE },
      },
      [],
    );
    await expect(h.svc.isApproverEligible('u-vp', TENANT)).resolves.toBe(true);
    await expect(h.svc.isApproverEligible('u-vd', TENANT)).resolves.toBe(true);
  });

  it('YÜRÜTME: payout finalize yeniden denetimi (PayoutApprovalPolicy) DEĞİŞMEDİ — rol kapısı yalnız karar metotlarında', async () => {
    const h = officeHarness({ 'u-vm': { id: 'u-vm', role: 'VIEWER', lawyer: MANAGER } }, []);
    await expect(new PayoutApprovalPolicy(h.prisma).isEligible('u-vm', TENANT)).resolves.toBe(true);
  });

  it('OKUMA: FD çalışma alanı / yayın uygunluk yüklemi (isDisclosureApproverEligible) rol OKUMAZ — DEĞİŞMEDİ', () => {
    expect(isDisclosureApproverEligible({ id: 'u-vm', isActive: true, tenantId: TENANT, lawyer: MANAGER }, TENANT)).toBe(true);
  });

  it('GEÇMİŞ KARAR: VIEWER\'ın ÖNCEDEN kaydedilmiş FD ofis onayı için idempotent tekrar yine replayed döner; yazma YOK', async () => {
    const h = fdHarness({
      version: fdVersion({
        status: ClientFinancialDisclosureStatus.OFFICE_APPROVED,
        officeApprovedById: VIEWER_PARTNER.id,
        officeApprovedAt: DECIDED_AT,
      }),
      request: fdRequest({ status: OfficeApprovalStatus.APPROVED, approverUserId: VIEWER_PARTNER.id, decidedAt: DECIDED_AT }),
      actor: VIEWER_PARTNER,
    });
    const res = await h.svc.completeOfficeApproval({
      tenantId: TENANT,
      disclosureVersionId: V,
      approvalRequestId: FD_REQ,
      approverUserId: VIEWER_PARTNER.id,
    });
    expect(res).toMatchObject({ replayed: true, status: ClientFinancialDisclosureStatus.OFFICE_APPROVED });
    expect(h.tx.clientFinancialDisclosureVersion.updateMany).not.toHaveBeenCalled();
    expect(h.tx.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('YÜRÜTME/KURTARMA DEĞİŞMEDİ: kayıtlı kararı veren kişi kararını bildirime uygular (rol kapısı EKLENMEDİ — açık kalem)', async () => {
    const h = fdHarness({
      version: fdVersion(),
      request: fdRequest({ status: OfficeApprovalStatus.APPROVED, approverUserId: VIEWER_PARTNER.id, decidedAt: DECIDED_AT }),
      actor: VIEWER_PARTNER,
    });
    const res = await h.svc.reconcileConsumedOfficeApproval({
      tenantId: TENANT,
      disclosureVersionId: V,
      actorUserId: VIEWER_PARTNER.id,
    });
    expect(res).toMatchObject({ replayed: false, status: ClientFinancialDisclosureStatus.OFFICE_APPROVED });
    expect(h.tx.clientFinancialDisclosureVersion.updateMany).toHaveBeenCalledTimes(1);
    expect(h.tx.officeApprovalRequest.updateMany).not.toHaveBeenCalled(); // talep YENİDEN mutate edilmez
  });
});
