import type { Prisma } from '@prisma/client';

/**
 * K3-L (owner kararı 2026-09-28) — dosyada onay bekleyen çek tazminatı oluşum talebi var mı? YALNIZ OKUMA; formation
 * tablolarına yazmaz. Hesap özeti "onay bekliyor" durumunu göstermek için kullanır.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.getCalculationSummary() → kesin tazminat kalemi yokken durum
 * /// </remarks>
 */
export async function hasPendingCheckPenaltyFormation(
  db: Pick<Prisma.TransactionClient, 'claimItemFormationIntent' | 'officeApprovalRequest'>,
  tenantId: string,
  caseId: string,
): Promise<boolean> {
  const intents = await db.claimItemFormationIntent.findMany({
    where: { tenantId, caseId, componentSubtypeCode: 'CHECK_PENALTY' },
    select: { approvalRequestId: true },
  });
  if (intents.length === 0) return false;
  const pending = await db.officeApprovalRequest.count({
    where: { tenantId, id: { in: intents.map((intent) => intent.approvalRequestId) }, status: 'PENDING_APPROVAL' },
  });
  return pending > 0;
}
