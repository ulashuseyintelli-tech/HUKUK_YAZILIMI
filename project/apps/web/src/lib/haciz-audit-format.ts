import { PreHacizRiskLevel } from "./api";

/**
 * PR-D4e-7: Haciz audit görüntüleme için SAF etiket/biçim yardımcıları (READ-ONLY surfacing).
 * Backend metadata'sı normalize EDİLMEZ; yalnız ham id/enum → okunur etiket. D4e-5 sinyalleri sabit.
 */

export const RISK_LABEL: Record<PreHacizRiskLevel, string> = { YUKSEK: "Yüksek", ORTA: "Orta", DUSUK: "Düşük", YOK: "Yok" };

export const RISK_BADGE: Record<PreHacizRiskLevel, string> = {
  YUKSEK: "bg-red-100 text-red-800 border-red-300",
  ORTA: "bg-amber-100 text-amber-800 border-amber-300",
  DUSUK: "bg-yellow-50 text-yellow-700 border-yellow-200",
  YOK: "bg-gray-100 text-gray-600 border-gray-200",
};

const REASON_LABEL: Record<string, string> = {
  INTEL_90D_MISSING: "Son 90 günde doğrulanmış saha istihbaratı yok",
  INTEL_VERIFIED_ABSENT_RECENT: "Borçlunun adreste bulunmadığı saha teyidi var",
  INTEL_NO_ADDRESS: "Borçlunun kayıtlı adresi yok",
  INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY: "E-tebligat var ama fiziksel teyit yok",
  INTEL_ADDRESS_UNVERIFIED: "Tebligat adresi fiili saha doğrulamasından geçmemiş",
};

const TARGET_LABEL: Record<string, string> = { BANK: "Banka", VEHICLE: "Araç", PROPERTY: "Taşınmaz", SALARY: "Maaş" };

/** Bilinmeyen risk seviyesi → "Yok" (graceful). */
export function riskLabel(level?: PreHacizRiskLevel | null): string {
  return RISK_LABEL[(level as PreHacizRiskLevel) || "YOK"] || "Yok";
}

export function riskBadge(level?: PreHacizRiskLevel | null): string {
  return RISK_BADGE[(level as PreHacizRiskLevel) || "YOK"] || RISK_BADGE.YOK;
}

/** Bilinmeyen reasonId → ham id (kaybetme; ileride yeni sinyal eklenirse görünür kalır). */
export function reasonLabel(reasonId: string): string {
  return REASON_LABEL[reasonId] || reasonId;
}

export function targetLabel(targetType?: string | null): string {
  return TARGET_LABEL[targetType || ""] || targetType || "Haciz";
}
