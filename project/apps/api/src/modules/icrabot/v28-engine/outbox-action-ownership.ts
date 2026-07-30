/**
 * W3-F02-OUTBOX-CONSUMER-TENANT-OWNERSHIP-R01 — outbox consumer'in caseId->tenant
 * sahipligini tek noktadan dogrulamasi.
 *
 * `case-scope.ts`daki `isCaseInScope`/`assertCaseInScope`'tan KASITLI olarak AYRI:
 * o fonksiyonlar dis-yuzeyli (HTTP) enumeration-direncini icin not-found ile
 * mismatch'i AYNI sonuca (false / ayni NotFoundException) COKER. Buradaki cagiran
 * DISIS bir HTTP istemcisi DEGIL, ic dispatch mekanizmasidir; sonuc bir HTTP
 * yanitina ASLA yansimaz (yalniz dead-letter lastError JSON'una ve operasyonel
 * log satirina yazilir) — bu yuzden RESOURCE_NOT_FOUND ile TENANT_MISMATCH ayrimi
 * varlik-sizintisi riski TASIMAZ ve brief §9 geregi acikca ayri raporlanir.
 *
 * `tenant-resolver.ts`daki `resolveTenantIdOrThrow`'tan da AYRI: o, EKSIK bir
 * tenantId'yi caseId'den COZMEK icindir (fallback-resolution; "Adim C"da action-
 * handler'dan KALDIRILDI cunku outbox.tenantId DB-NOT NULL). Bu fonksiyon EKSIK
 * bir degeri COZMEZ — HALIHAZIRDA VAR olan `action.tenantId`'nin GERCEK Case
 * sahipligiyle ESLESTIGINI dogrular. Iki ayri kaygidir; biri digerinin yerine GECMEZ.
 */

export type OutboxActionOwnershipResult =
  | { ok: true; tenantId: string; resourceType: 'Case'; resourceId: string }
  | {
      ok: false;
      reason: 'RESOURCE_NOT_FOUND' | 'TENANT_MISMATCH';
      resourceType: 'Case';
      resourceId: string;
    };

/** Case sahiplik sorgusu icin gereken minimal Prisma yuzeyi. */
export interface CaseOwnershipReader {
  case: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; tenantId: true };
    }) => Promise<{ id: string; tenantId: string } | null>;
  };
}

/**
 * `caseId`'nin gercekten `declaredTenantId`'ye ait olup olmadigini dogrular.
 *
 * Tek authoritative kaynak: Case kaydinin kendi `tenantId`'si (brief §6 — payload/
 * action tenantId'si TEK BASINA authority DEGILDIR). DB hatasi burada YUTULMAZ —
 * cagiranin (dispatch) mevcut try/catch'i disinda cagrilmasi GEREKIR ki transient
 * DB hatalari mevcut retry/backoff yoluna gitsin, TENANT_MISMATCH ile AYNI
 * (non-retryable) kategoriye KARISMASIN.
 */
export async function resolveOutboxActionOwnership(
  client: CaseOwnershipReader,
  caseId: string,
  declaredTenantId: string,
): Promise<OutboxActionOwnershipResult> {
  const found = await client.case.findUnique({
    where: { id: caseId },
    select: { id: true, tenantId: true },
  });

  if (!found) {
    return { ok: false, reason: 'RESOURCE_NOT_FOUND', resourceType: 'Case', resourceId: caseId };
  }
  if (found.tenantId !== declaredTenantId) {
    return { ok: false, reason: 'TENANT_MISMATCH', resourceType: 'Case', resourceId: caseId };
  }
  return { ok: true, tenantId: found.tenantId, resourceType: 'Case', resourceId: caseId };
}
