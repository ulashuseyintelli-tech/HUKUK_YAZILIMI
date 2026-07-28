import type { DisclosureApproverCandidate } from './client-financial-disclosure-approval.contract';

/**
 * CLIENT-P2-U03-TRACK-B-I03 — §41.3 canonical approver yeterlilik PREDİKATI (SAF, IO-suz).
 *
 * Owner kararı (charter §41.2 KARAR 1/3, PR #1761):
 *
 * ```text
 * aktif  AND  ayni tenant  AND  linkli Lawyer
 * AND ( lawyerRank IN (PARTNER, MANAGER)  OR  canApproveOfficeActions = true )
 * ```
 *
 * Bu, `PayoutApprovalPolicy`'nin (PAYOUT-APPROVAL-2, 2026-07-04 owner kararı) kuralıyla
 * BİREBİR AYNIDIR. Paylaşılan `OfficeApprovalService.isApproverEligible()` KASITLI OLARAK
 * DEĞİŞTİRİLMEZ — genişleme başka hiçbir actionCode'a SIZMAZ (§41.3).
 *
 * §41.3 `SUPER_ADMIN` BULGUSU: repository'de `SUPER_ADMIN` adlı rol/enum/capability YOKTUR;
 * `UserRole` yalnız `ADMIN` / `USER` / `VIEWER` taşır ve finansal onay yetkisi orada TUTULMAZ.
 * `UserRole.ADMIN` finansal onaylayıcı SAYILMAZ — owner'ın "sıradan staff final approver
 * olamaz" kuralı ve lawyer-binding invariant'ı gereği. Yeni role enum'u ÜRETİLMEZ.
 *
 * Tek kaynak: hem Nest tarafındaki `ClientFinancialDisclosureApprovalPolicy` hem de dormant
 * `ClientFinancialDisclosureApprovalService` bu fonksiyonu çağırır → drift YOK.
 */
export const CLIENT_FINANCIAL_DISCLOSURE_APPROVER_RANKS = ['PARTNER', 'MANAGER'] as const;

export function isDisclosureApproverEligible(
  candidate: DisclosureApproverCandidate | null | undefined,
  tenantId: string,
): boolean {
  if (!candidate || !candidate.isActive || candidate.tenantId !== tenantId) return false;
  const lawyer = candidate.lawyer;
  if (!lawyer) return false; // Lawyer linki YOK → staff; final financial approver OLAMAZ.
  return (
    (typeof lawyer.lawyerRank === 'string' &&
      (CLIENT_FINANCIAL_DISCLOSURE_APPROVER_RANKS as readonly string[]).includes(
        lawyer.lawyerRank,
      )) ||
    lawyer.canApproveOfficeActions === true
  );
}

/** `isDisclosureApproverEligible` için canonical Prisma `select` — iki çağıran da aynısını okur. */
export const DISCLOSURE_APPROVER_CANDIDATE_SELECT = {
  id: true,
  isActive: true,
  tenantId: true,
  lawyer: { select: { lawyerRank: true, canApproveOfficeActions: true } },
} as const;
