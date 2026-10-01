/**
 * K3-L TK-10: politika bekletmeli (ALLOWED_WITH_POLICY_HOLD) oluşum kaydı olan ClaimItem kimlikleri — SALT OKUMA.
 *
 * Bağlayıcı kural (RECEIVABLE-GOVERNANCE 23.7.8, RATIFIED — BINDING; decision-log RCV-CLAIM-FORM-P01):
 * ALLOWED_WITH_POLICY_HOLD kalemde InterestPolicy bağlanamaz, faiz hesaplanamaz ve tüketici borcu faizsiz de kabul
 * edemez. Kanonik hesap bu bilgiyi yalnız buradan okur; uygulama yetkisi owner GO 2026-10-01 (K3L-D2-REMAINING-R03 §2).
 *
 * Yalnız HALEFİ OLMAYAN (güncel) oluşum kaydına bakılır: sonraki sürüm kaydı bekletmeyi taşımıyorsa kalem bekletmeli
 * sayılmaz. Tenant + dosya kapsamlı; yazma yok.
 *
 * <remarks>Çağrıldığı yerler: CaseBalanceService.computeCaseBalance() → assembler girdisi (interestPolicyHold).</remarks>
 */

export const POLICY_HOLD_ADMISSION_RESULT = 'ALLOWED_WITH_POLICY_HOLD';

interface PolicyHoldSnapshotReader {
  claimFormationSnapshot?: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: { claimItemId: true };
    }) => Promise<Array<{ claimItemId: unknown }>>;
  };
}

export async function readPolicyHoldClaimItemIds(
  prisma: unknown,
  tenantId: string,
  caseId: string,
): Promise<Set<string>> {
  const client = (prisma as PolicyHoldSnapshotReader).claimFormationSnapshot;
  // Eski birim testlerinin kısmi Prisma mock'unda model yok → bekletme yok (üretimde model her zaman vardır).
  if (!client?.findMany) return new Set();
  const rows = await client.findMany({
    where: {
      tenantId,
      caseId,
      admissionResult: POLICY_HOLD_ADMISSION_RESULT,
      supersededBySnapshot: { is: null },
    },
    select: { claimItemId: true },
  });
  return new Set(rows.map((row) => String(row.claimItemId)));
}
