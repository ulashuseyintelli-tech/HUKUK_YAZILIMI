import { AssetQueryStatus } from "@prisma/client";

/**
 * CLIENT-P2-U03-TRACK-A-I02: raw CaseDebtor asset-query alanlarının (AssetQueryStatus)
 * curated client-facing durumlara dönüştürülmesi (POL-D §21/BP-06 §23; I06 §33.5;
 * Track-A-A02 analiz kararı). Bu API-owned semantic mapping'dir — web yalnız curated
 * durum → Türkçe etiket eşlemesi yapar, ham Prisma enum değerini hiç yorumlamaz.
 *
 * Kaynak sınırı: yalnız CaseDebtor.assetVehicle/assetRealEstate/assetBank/assetSgkWage/
 * assetLastQueryAt. `AssetQuery` modeli (resultData/errorMessage/requestedBy/reason/
 * idempotencyKey/job status) bu fonksiyonun girdisi DEĞİLDİR ve olamaz.
 */
export type CuratedAssetQueryState =
  | "NOT_QUERIED"
  | "FOUND"
  | "NOT_FOUND"
  | "RESULT_PENDING"
  | "RESULT_UNAVAILABLE";

export interface CuratedAssetQuery {
  vehicle: CuratedAssetQueryState;
  realEstate: CuratedAssetQueryState;
  bank: CuratedAssetQueryState;
  sgkWage: CuratedAssetQueryState;
  lastQueryAt: Date | null;
}

export interface RawCaseDebtorAssetFields {
  assetVehicle: string;
  assetRealEstate: string;
  assetBank: string;
  assetSgkWage: string;
  assetLastQueryAt: Date | null;
}

const RAW_TO_CURATED: Record<string, CuratedAssetQueryState> = {
  [AssetQueryStatus.UNKNOWN]: "NOT_QUERIED",
  [AssetQueryStatus.YES]: "FOUND",
  [AssetQueryStatus.NO]: "NOT_FOUND",
  [AssetQueryStatus.PENDING]: "RESULT_PENDING",
  [AssetQueryStatus.ERROR]: "RESULT_UNAVAILABLE",
};

/**
 * Fail-safe: bilinmeyen veya gelecekte şemaya eklenecek bir ham değer daima
 * RESULT_UNAVAILABLE'a düşer — asla ham token client'a sızmaz, asla çökmez.
 */
function mapAssetQueryStatus(raw: string): CuratedAssetQueryState {
  return RAW_TO_CURATED[raw] ?? "RESULT_UNAVAILABLE";
}

export function toCuratedAssetQuery(raw: RawCaseDebtorAssetFields): CuratedAssetQuery {
  return {
    vehicle: mapAssetQueryStatus(raw.assetVehicle),
    realEstate: mapAssetQueryStatus(raw.assetRealEstate),
    bank: mapAssetQueryStatus(raw.assetBank),
    sgkWage: mapAssetQueryStatus(raw.assetSgkWage),
    lastQueryAt: raw.assetLastQueryAt,
  };
}
