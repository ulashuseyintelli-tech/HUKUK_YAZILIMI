/**
 * Case-keyed v28 yuzeyleri icin paylasilan tenant kapsam kapisi.
 *
 * V28-TENANT-ISOLATION-SECURITY-CLOSEOUT-R01.
 *
 * NEDEN AYRI BIR KAPI GEREKIYOR:
 * v28 tablolarinin buyuk kismi (`IcrabotCaseFact`, `IcrabotCaseFlag`,
 * `IcrabotFactAudit`, `IcrabotEngineRun`) `tenantId` kolonu TASIMAZ ve `Case`'e
 * Prisma relation'i YOKTUR. Bu yuzden bu tablolardaki sorgular kendi baslarina
 * bir tenant predicate'i tasiyamaz (bkz. STRUCTURAL_GAP kaydi). Tek authoritative
 * tenant kaynagi `Case.tenantId`'dir; kapsam bu nedenle hedef Case'in sahipligi
 * DOGRUDAN dogrulanarak kurulur.
 *
 * `IcrabotTimelineEntry` tenantId TASIR (nullable, forward-only) ve
 * `IcrabotOutboxAction` NOT NULL tasir; oralarda ek olarak gercek kolon
 * predicate'i de kullanilir (defense in depth).
 *
 * KULLANIM KURALI:
 * - Mutation yollarinda kapi, mutation ile AYNI transaction client'i ile
 *   cagrilir → check-then-write (TOCTOU) penceresi olusmaz.
 * - Read yollarinda ayni prisma client ile cagrilabilir.
 * - `platform` kapsami YALNIZ dahili sistem surecleri icindir (cron); hicbir
 *   controller bu kapsami uretemez (bkz. `tenantScopeFromRequestUser`).
 */
import { NotFoundException } from '@nestjs/common';
import { OutboxScope } from './outbox-scope';

/** `Case` sahiplik sorgusu icin gereken minimal Prisma yuzeyi. */
export interface CaseScopeReader {
  case: {
    findFirst: (args: {
      where: { id: string; tenantId?: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
    findMany?: (args: {
      where: { id: { in: string[] }; tenantId?: string };
      select: { id: true };
    }) => Promise<Array<{ id: string }>>;
  };
}

/**
 * Tek bir case'in cagiranin kapsaminda oldugunu dogrular; degilse fail-closed reddeder.
 *
 * ENUMERATION DIRENCI: bulunamayan case ile baska tenant'a ait case AYNI
 * `NotFoundException` ve AYNI mesaj sablonu ile reddedilir. Cagiran, bir case'in
 * var olup olmadigini bu yanittan cikaramaz.
 *
 * /// <remarks>
 * /// Cagrildigi yerler:
 * /// - FactStoreService.* -> tum case-keyed fact/flag/audit yuzeyleri
 * /// - TimelineService.* -> case-keyed timeline yuzeyleri
 * /// - EngineRunService.* -> case-keyed run yuzeyleri
 * /// </remarks>
 */
export async function assertCaseInScope(
  client: CaseScopeReader,
  caseId: string,
  scope: OutboxScope,
): Promise<void> {
  if (!(await isCaseInScope(client, caseId, scope))) {
    throw new NotFoundException(`Case not found: ${caseId}`);
  }
}

/**
 * `assertCaseInScope`'un boolean varyanti.
 *
 * Cagiranin, kapsam disi kaydi "bulunamadi" gibi sunmasi gereken yerlerde
 * kullanilir (orn. entryId/runId ile gelen tekil okuma): kapsam disi kayit ile
 * hic olmayan kayit AYNI sonucu (`null`) uretir → varlik sizintisi olmaz.
 *
 * Bos/gecersiz caseId fail-closed olarak kapsam disi sayilir.
 */
export async function isCaseInScope(
  client: CaseScopeReader,
  caseId: string | null | undefined,
  scope: OutboxScope,
): Promise<boolean> {
  if (scope.kind === 'platform') return true;
  if (typeof caseId !== 'string' || caseId.length === 0) return false;

  const owned = await client.case.findFirst({
    where: { id: caseId, tenantId: scope.tenantId },
    select: { id: true },
  });

  return owned !== null && owned !== undefined;
}

/**
 * Verilen case kimliklerinden YALNIZ cagiranin kapsamindakileri dondurur.
 *
 * Bulk/enumeration yuzeylerinde kullanilir: kapsam disi kimlikler sessizce
 * elenir, hata mesajiyla varliklari ifsa EDILMEZ. Bos girdi bos sonuc verir
 * (DB'ye gidilmez).
 *
 * /// <remarks>
 * /// Cagrildigi yerler:
 * /// - FactStoreService.getBulkSnapshots() -> POST /icrabot/v28/facts/bulk-snapshot
 * /// - FactStoreService.getCasesWithFlag() -> GET /icrabot/v28/facts/by-flag/:key
 * /// </remarks>
 */
export async function filterCaseIdsInScope(
  client: CaseScopeReader,
  caseIds: string[],
  scope: OutboxScope,
): Promise<string[]> {
  const unique = Array.from(new Set(caseIds.filter((id) => typeof id === 'string' && id.length > 0)));
  if (unique.length === 0) return [];
  if (scope.kind === 'platform') return unique;

  if (typeof client.case.findMany !== 'function') {
    // Fail-closed: toplu dogrulama yapilamiyorsa hicbir kimlik kapsamda sayilmaz.
    return [];
  }

  const owned = await client.case.findMany({
    where: { id: { in: unique }, tenantId: scope.tenantId },
    select: { id: true },
  });

  const ownedIds = new Set(owned.map((c) => c.id));
  return unique.filter((id) => ownedIds.has(id));
}
