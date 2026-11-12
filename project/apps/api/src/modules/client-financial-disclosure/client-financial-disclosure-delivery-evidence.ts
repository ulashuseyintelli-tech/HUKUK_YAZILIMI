import type { Prisma } from '@prisma/client';
import {
  CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS,
  CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ENTITY,
  isClientFinancialDisclosureApprovedDispatchReceipt,
  isClientFinancialDisclosureApprovedProvider,
} from './client-financial-disclosure-publication.contract';

export type DisclosureDeliveryEvidence = 'NONE' | 'REJECTED' | 'ACCEPTED' | 'UNKNOWN';

export interface DisclosureDeliveryEvidenceVersion {
  readonly id: string;
  readonly tenantId: string;
  readonly disclosureId: string;
  readonly version: number;
  readonly status: string;
  readonly sendRequestedAt: Date | null;
  readonly providerMessageId: string | null;
  readonly providerAcceptedAt: Date | null;
  readonly sendFailureCode: string | null;
  readonly publishedAt: Date | null;
}

/** Same attempt-bound evidence is used by command gates and curated office capabilities. */
export async function loadDisclosureDeliveryEvidence(
  db: Pick<Prisma.TransactionClient, 'auditLog'>,
  versions: readonly DisclosureDeliveryEvidenceVersion[],
  configuredProvider?: string,
): Promise<Map<string, DisclosureDeliveryEvidence>> {
  const claimed = versions.filter((v) => v.sendRequestedAt != null && v.publishedAt == null);
  const audits = claimed.length === 0 ? [] : await db.auditLog.findMany({
    where: {
      OR: claimed.map((v) => ({ tenantId: v.tenantId, entityId: v.id })),
      entityType: CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ENTITY,
      action: { in: [CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SENT, CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SEND_FAILED] },
      actorType: 'SYSTEM',
      decisionResult: 'ALLOWED',
    },
    select: { tenantId: true, entityId: true, action: true, metadata: true },
  });
  return new Map(versions.map((v): [string, DisclosureDeliveryEvidence] => {
    if (v.publishedAt != null) return [v.id, 'NONE'];
    const hasReceipt = v.providerMessageId != null || v.providerAcceptedAt != null;
    if (v.sendRequestedAt == null) {
      return [v.id, hasReceipt || v.sendFailureCode != null || v.status === 'SEND_FAILED' ? 'UNKNOWN' : 'NONE'];
    }
    const matching = audits.filter((a) => {
      const m = a.metadata;
      if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
      return a.tenantId === v.tenantId && a.entityId === v.id &&
        m.disclosureId === v.disclosureId && m.version === v.version &&
        m.sendRequestedAt === v.sendRequestedAt!.toISOString() &&
        isClientFinancialDisclosureApprovedProvider(m.provider) &&
        (configuredProvider === undefined || isClientFinancialDisclosureApprovedDispatchReceipt(configuredProvider, m.provider));
    });
    if (hasReceipt) {
      const accepted = typeof v.providerMessageId === 'string' && v.providerMessageId.trim().length > 0 &&
        v.providerAcceptedAt instanceof Date && matching.some((a) => {
          const m = a.metadata as Prisma.JsonObject;
          return a.action === CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SENT &&
            m.providerMessageId === v.providerMessageId &&
            m.providerAcceptedAt === v.providerAcceptedAt!.toISOString();
        });
      return [v.id, accepted ? 'ACCEPTED' : 'UNKNOWN'];
    }
    const failures = matching.filter((a) => a.action === CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SEND_FAILED);
    const rejected = v.status === 'SEND_FAILED' && v.sendFailureCode != null && failures.length > 0 &&
      !matching.some((a) => a.action === CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SENT) && failures.every((a) => {
      const m = a.metadata as Prisma.JsonObject;
      return a.action === CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SEND_FAILED &&
        m.deliveryOutcome === 'REJECTED' && m.failureCode === v.sendFailureCode;
    });
    return [v.id, rejected ? 'REJECTED' : 'UNKNOWN'];
  }));
}
