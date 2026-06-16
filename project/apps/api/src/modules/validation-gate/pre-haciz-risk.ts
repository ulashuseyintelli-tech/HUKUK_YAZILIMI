/**
 * PR-D4e-4 — Haciz öncesi saha istihbaratı RİSK SKOR read-model (SAF, portable, KALICI YAZIM YOK).
 *
 * Bağımsız saf modül (D-1 kararı): validation-gate.service @deprecated olduğu için skor mantığı
 * o servise GÖMÜLMEZ; burada durur ki policy-engine'e taşıma temiz olsun. Tek görevi: önceden
 * üretilmiş sinyalleri (checkPreHacizIntelligence) ağırlık/seviye/neden modeline çevirmek.
 *
 * Net sınır: SKOR BLOK DEĞİL, karar destektir. Skor read'de hesaplanır, hiçbir yere yazılmaz.
 * Ham sayısal skor UI'da gösterilmez (D-2); yalnız sıralama + hesap içi kullanılır.
 *
 * Ağırlık şeması (D-3 kararı):
 *   INTEL_ADDRESS_UNVERIFIED            = YÜKSEK
 *   INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY  = YÜKSEK
 *   INTEL_90D_MISSING                   = ORTA
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - ValidationGateService.checkPreHacizIntelligence() → sinyalleri debtors[]+overallLevel'e zenginleştirir
 * </remarks>
 */

export type RiskSeverity = "HIGH" | "MEDIUM" | "LOW";
export type RiskLevel = "YOK" | "DUSUK" | "ORTA" | "YUKSEK";

/** Sinyal-id → ağırlık. Bilinmeyen sinyal LOW kabul edilir (graceful). */
export const PRE_HACIZ_SIGNAL_WEIGHTS: Record<string, { severity: RiskSeverity; points: number }> = {
  INTEL_ADDRESS_UNVERIFIED: { severity: "HIGH", points: 40 },
  INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY: { severity: "HIGH", points: 40 },
  INTEL_90D_MISSING: { severity: "MEDIUM", points: 20 },
};

const SEVERITY_TO_LEVEL: Record<RiskSeverity, RiskLevel> = { HIGH: "YUKSEK", MEDIUM: "ORTA", LOW: "DUSUK" };
const LEVEL_ORDER: Record<RiskLevel, number> = { YOK: 0, DUSUK: 1, ORTA: 2, YUKSEK: 3 };
const DEFAULT_WEIGHT = { severity: "LOW" as RiskSeverity, points: 10 };

export interface PreHacizSignal {
  id: string;
  message: string;
}

export interface PreHacizReason {
  id: string;
  message: string;
  severity: RiskSeverity;
}

export interface DebtorRisk {
  debtorId: string;
  name: string;
  /** Seviye = sinyaller arasındaki EN YÜKSEK önem (tek YÜKSEK sinyal → borçlu YÜKSEK). */
  level: RiskLevel;
  /** Toplam puan (0-100). Yalnız sıralama/hesap içi; UI'da ham sayı gösterilmez. */
  score: number;
  /** Önem azalan sıralı nedenler. */
  reasons: PreHacizReason[];
}

const weightOf = (id: string) => PRE_HACIZ_SIGNAL_WEIGHTS[id] || DEFAULT_WEIGHT;

/** Tek borçlunun sinyallerini risk modeline çevirir. Sinyal yoksa level=YOK, score=0. */
export function scoreDebtorSignals(debtorId: string, name: string, signals: PreHacizSignal[]): DebtorRisk {
  const reasons: PreHacizReason[] = signals.map((s) => ({ id: s.id, message: s.message, severity: weightOf(s.id).severity }));
  // Önem azalan sırala (YÜKSEK önce).
  reasons.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const score = Math.min(100, signals.reduce((sum, s) => sum + weightOf(s.id).points, 0));

  // Seviye = en yüksek önem (max severity); sinyal yoksa YOK.
  let level: RiskLevel = "YOK";
  for (const r of reasons) {
    const l = SEVERITY_TO_LEVEL[r.severity];
    if (LEVEL_ORDER[l] > LEVEL_ORDER[level]) level = l;
  }

  return { debtorId, name, level, score, reasons };
}

function severityRank(s: RiskSeverity): number {
  return s === "HIGH" ? 3 : s === "MEDIUM" ? 2 : 1;
}

/** Dosya-geneli rollup = borçlular arasındaki en yüksek seviye. */
export function rollupOverallLevel(debtors: DebtorRisk[]): RiskLevel {
  let level: RiskLevel = "YOK";
  for (const d of debtors) {
    if (LEVEL_ORDER[d.level] > LEVEL_ORDER[level]) level = d.level;
  }
  return level;
}

/**
 * Borçlu-bazlı sinyalleri tam read-model'e çevirir: risk azalan sıralı debtors[] + overallLevel.
 * SADECE sinyali olan borçlular döner (sinyalsiz borçlu = gürültü, dışarıda bırakılır → UI susar).
 */
export function buildPreHacizRisk(
  input: { debtorId: string; name: string; signals: PreHacizSignal[] }[]
): { debtors: DebtorRisk[]; overallLevel: RiskLevel } {
  const debtors = input
    .filter((d) => d.signals.length > 0)
    .map((d) => scoreDebtorSignals(d.debtorId, d.name, d.signals));

  // Risk azalan: önce seviye, eşitlikte skor.
  debtors.sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || b.score - a.score);

  return { debtors, overallLevel: rollupOverallLevel(debtors) };
}
