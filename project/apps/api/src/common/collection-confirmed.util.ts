import { CollectionStatus } from "@prisma/client";

/**
 * Tahsilat (Collection) status filtresi — COLLECTION-STATUS-FILTER-HOTFIX.
 *
 * Kural: yalnız CONFIRMED tahsilat "tahsil edildi" sayılır; PENDING (henüz
 * onaylanmamış), CANCELLED (iptal) ve REFUNDED (iade) toplam/oran/sayım
 * metriklerine dahil edilmez. Kanonik DebtorScoring hattı gelene kadar
 * collection-tabanlı metrik hesapları bu helper'ları kullanır
 * (bkz. project/docs/design/debtor-scoring-canonicalization.md Bölüm 3/9).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - RiskService.calculateCollectionScore() / calculateBehaviorScore() -> risk faktör hesapları
 * - AutomationService.calculateRiskScore() / getRiskFactors() -> nightly Case.riskScore cron'u
 * - AiService.buildSuggestionPrompt() / buildPredictionPrompt() / getRuleBasedPrediction() -> AI metrikleri
 * - FactStoreService.getComputedMetrics() -> collectedAmount / collectionRate
 * </remarks>
 */
export interface CollectionStatusLike {
  status?: CollectionStatus | string | null;
}

export function isConfirmedCollection(collection: CollectionStatusLike | null | undefined): boolean {
  return collection?.status === CollectionStatus.CONFIRMED;
}

export function filterConfirmedCollections<T extends CollectionStatusLike>(
  collections: readonly T[] | null | undefined,
): T[] {
  return (collections ?? []).filter((c) => isConfirmedCollection(c));
}

export function sumConfirmedCollections<T extends CollectionStatusLike & { amount: unknown }>(
  collections: readonly T[] | null | undefined,
): number {
  return filterConfirmedCollections(collections).reduce(
    (sum, c) => sum + Number(c.amount),
    0,
  );
}
