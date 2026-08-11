import { ClientFinancialDisclosureStatus, OfficeApprovalStatus } from '@prisma/client';

jest.mock('../client-financial-disclosure-writer.service', () => ({
  verifyPersistedDisclosureSnapshot: jest.fn().mockResolvedValue({ verdict: 'MATCH' }),
}));

import { ClientFinancialDisclosureApprovalService } from '../client-financial-disclosure-approval.service';
import {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INTENT_CONTRACT_VERSION,
} from '../client-financial-disclosure-approval.contract';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';

/**
 * PR-1.3 — TÜKETİLMİŞ ONAY KARARI RECONCILIATION.
 *
 * Generic Onay Kutusu FD talebini APPROVED yapıp domain geçişini atlamıştı; FD'nin
 * kendi tamamlama yolu talebin PENDING olmasını şart koştuğu için bildirim
 * KİLİTLENİYORDU. Bu suite kurtarmanın YALNIZ kanıt taşıdığını, karar ÜRETMEDİĞİNİ
 * ve yetki kapılarının aynen uygulandığını kilitler.
 */

const T = 'tenant-1';
const V = 'version-1';
const REQ = 'request-1';
const APPROVER = 'approver-1';
const REQUESTER = 'requester-1';
const DECIDED_AT = new Date('2026-08-10T22:19:40.780Z');

const INTENT = {
  contractVersion: CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INTENT_CONTRACT_VERSION,
  tenantId: T,
  disclosureId: 'root-1',
  disclosureVersionId: V,
  version: 1,
  snapshotHash: 'snap-1',
};

function baseVersion(over: Record<string, unknown> = {}) {
  return {
    id: V,
    tenantId: T,
    status: ClientFinancialDisclosureStatus.OFFICE_APPROVAL_PENDING,
    officeApprovalRequestId: REQ,
    officeApprovedById: null,
    officeApprovedAt: null,
    snapshotHash: 'snap-1',
    supersededAt: null,
    cancelledAt: null,
    reversedAt: null,
    ...over,
  };
}

function baseRequest(over: Record<string, unknown> = {}) {
  return {
    id: REQ,
    actionCode: CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
    targetType: CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
    targetRef: V,
    requesterUserId: REQUESTER,
    approverUserId: APPROVER,
    decidedAt: DECIDED_AT,
    savedIntent: INTENT,
    payloadHash: 'payload-1',
    status: OfficeApprovalStatus.APPROVED,
    ...over,
  };
}

/** Servisin private `readIntent`/`stableJsonHash` beklentisini karşılayan stub. */
function buildService(opts: {
  version?: Record<string, unknown>;
  request?: Record<string, unknown> | null;
  approverCandidate?: Record<string, unknown> | null;
  updateCount?: number;
}) {
  const updateMany = jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 });
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    clientFinancialDisclosureVersion: {
      findFirst: jest.fn().mockResolvedValue(baseVersion(opts.version ?? {})),
      updateMany,
    },
    officeApprovalRequest: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.request === null ? null : baseRequest(opts.request ?? {})),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(
        opts.approverCandidate === null
          ? null
          : {
              id: APPROVER,
              isActive: true,
              tenantId: T,
              lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false },
              ...(opts.approverCandidate ?? {}),
            },
      ),
    },
  };
  const prisma = { $transaction: (fn: (t: unknown) => unknown) => fn(tx) } as never;
  const service = new ClientFinancialDisclosureApprovalService(prisma);
  return { service, tx, updateMany };
}

/** Servisin gerçek hash fonksiyonuyla uyumlu payloadHash üret. */
function withMatchingHash(over: Record<string, unknown> = {}) {
  return { payloadHash: stableJsonHash(INTENT), ...over };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });
}

describe('reconcileConsumedOfficeApproval — kanıt taşır, karar üretmez', () => {
  it('KAYITLI kararı uygular; approver ve decidedAt AYNEN korunur', async () => {
    const { service, updateMany } = buildService({ request: withMatchingHash() });

    const result = await service.reconcileConsumedOfficeApproval({
      tenantId: T,
      disclosureVersionId: V,
      actorUserId: APPROVER,
    });

    expect(result.status).toBe(ClientFinancialDisclosureStatus.OFFICE_APPROVED);
    expect(result.replayed).toBe(false);

    const data = updateMany.mock.calls[0][0].data;
    expect(data.officeApprovedById).toBe(APPROVER);
    // recovery çalıştığı an DEĞİL, kaydedilen karar zamanı yazılır
    expect(data.officeApprovedAt).toBe(DECIDED_AT);

    const where = updateMany.mock.calls[0][0].where;
    expect(where.status).toBe(ClientFinancialDisclosureStatus.OFFICE_APPROVAL_PENDING);
    expect(where.officeApprovedById).toBeNull();
  });

  it('TALEBİ yeniden mutate ETMEZ', async () => {
    const { service, tx } = buildService({ request: withMatchingHash() });
    await service.reconcileConsumedOfficeApproval({
      tenantId: T,
      disclosureVersionId: V,
      actorUserId: APPROVER,
    });
    expect(tx.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('İDEMPOTENT: zaten OFFICE_APPROVED ise yeni geçiş üretmez', async () => {
    const { service, updateMany } = buildService({
      version: {
        status: ClientFinancialDisclosureStatus.OFFICE_APPROVED,
        officeApprovedById: APPROVER,
      },
    });
    const result = await service.reconcileConsumedOfficeApproval({
      tenantId: T,
      disclosureVersionId: V,
      actorUserId: APPROVER,
    });
    expect(result.replayed).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('EŞZAMANLI recovery: ikinci çağrı 0 satır görürse CONCURRENT_TRANSITION', async () => {
    const { service } = buildService({ request: withMatchingHash(), updateCount: 0 });
    await expectCode(
      service.reconcileConsumedOfficeApproval({
        tenantId: T,
        disclosureVersionId: V,
        actorUserId: APPROVER,
      }),
      'DISCLOSURE_APPROVAL_CONCURRENT_TRANSITION',
    );
  });

  it('YANLIŞ CALLER: kararı vermeyen kullanıcı taşıyamaz', async () => {
    const { service } = buildService({ request: withMatchingHash() });
    await expectCode(
      service.reconcileConsumedOfficeApproval({
        tenantId: T,
        disclosureVersionId: V,
        actorUserId: 'someone-else',
      }),
      'DISCLOSURE_APPROVAL_NOT_ELIGIBLE',
    );
  });

  it('SELF-APPROVAL: requester ile approver aynıysa reddedilir', async () => {
    const { service } = buildService({
      request: withMatchingHash({ requesterUserId: APPROVER }),
    });
    await expectCode(
      service.reconcileConsumedOfficeApproval({
        tenantId: T,
        disclosureVersionId: V,
        actorUserId: APPROVER,
      }),
      'DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN',
    );
  });

  it('ELIGIBILITY yeniden doğrulanır: approver artık yetkili değilse reddedilir', async () => {
    const { service } = buildService({
      request: withMatchingHash(),
      approverCandidate: { lawyer: null },
    });
    await expectCode(
      service.reconcileConsumedOfficeApproval({
        tenantId: T,
        disclosureVersionId: V,
        actorUserId: APPROVER,
      }),
      'DISCLOSURE_APPROVAL_NOT_ELIGIBLE',
    );
  });

  it('PAYLOAD/SNAPSHOT uyuşmazlığı → STALE_SNAPSHOT', async () => {
    const { service } = buildService({ request: { payloadHash: 'bozuk-hash' } });
    await expectCode(
      service.reconcileConsumedOfficeApproval({
        tenantId: T,
        disclosureVersionId: V,
        actorUserId: APPROVER,
      }),
      'DISCLOSURE_APPROVAL_STALE_SNAPSHOT',
    );
  });

  it('YANLIŞ actionCode/targetType/targetRef → REQUEST_MISMATCH', async () => {
    for (const bad of [
      { actionCode: 'CHANGE_STATUS' },
      { targetType: 'LegalCase' },
      { targetRef: 'baska-version' },
    ]) {
      const { service } = buildService({ request: withMatchingHash(bad) });
      await expectCode(
        service.reconcileConsumedOfficeApproval({
          tenantId: T,
          disclosureVersionId: V,
          actorUserId: APPROVER,
        }),
        'DISCLOSURE_APPROVAL_REQUEST_MISMATCH',
      );
    }
  });

  it('PENDING talep recovery DEĞİL normal yoldur → STATUS_INVALID', async () => {
    const { service } = buildService({
      request: withMatchingHash({ status: OfficeApprovalStatus.PENDING_APPROVAL }),
    });
    await expectCode(
      service.reconcileConsumedOfficeApproval({
        tenantId: T,
        disclosureVersionId: V,
        actorUserId: APPROVER,
      }),
      'DISCLOSURE_APPROVAL_STATUS_INVALID',
    );
  });

  it('REJECTED / APPROVED_WITH_CHANGES / CANCELLED kanıt DEĞİLDİR', async () => {
    for (const status of [
      OfficeApprovalStatus.REJECTED,
      OfficeApprovalStatus.APPROVED_WITH_CHANGES,
      OfficeApprovalStatus.CANCELLED,
    ]) {
      const { service } = buildService({ request: withMatchingHash({ status }) });
      await expectCode(
        service.reconcileConsumedOfficeApproval({
          tenantId: T,
          disclosureVersionId: V,
          actorUserId: APPROVER,
        }),
        'DISCLOSURE_APPROVAL_UNSUPPORTED_CONSUMED_DECISION',
      );
    }
  });

  it('EKSİK karar kaydı (approver/decidedAt yok) kanıt DEĞİLDİR', async () => {
    for (const bad of [{ approverUserId: null }, { decidedAt: null }]) {
      const { service } = buildService({ request: withMatchingHash(bad) });
      await expectCode(
        service.reconcileConsumedOfficeApproval({
          tenantId: T,
          disclosureVersionId: V,
          actorUserId: APPROVER,
        }),
        'DISCLOSURE_APPROVAL_UNSUPPORTED_CONSUMED_DECISION',
      );
    }
  });

  it('TALEP bulunamazsa REQUEST_NOT_FOUND', async () => {
    const { service } = buildService({ request: null });
    await expectCode(
      service.reconcileConsumedOfficeApproval({
        tenantId: T,
        disclosureVersionId: V,
        actorUserId: APPROVER,
      }),
      'DISCLOSURE_APPROVAL_REQUEST_NOT_FOUND',
    );
  });

  it('VERSİYON beklenen durumda değilse STATUS_INVALID (genel status-advance DEĞİL)', async () => {
    const { service } = buildService({
      version: { status: ClientFinancialDisclosureStatus.DRAFT },
      request: withMatchingHash(),
    });
    await expectCode(
      service.reconcileConsumedOfficeApproval({
        tenantId: T,
        disclosureVersionId: V,
        actorUserId: APPROVER,
      }),
      'DISCLOSURE_APPROVAL_STATUS_INVALID',
    );
  });
});
