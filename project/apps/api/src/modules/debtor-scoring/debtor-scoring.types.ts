/**
 * DEBTOR-SCORING-CANON Phase 2 / PR-2A — kanonik skor kontratları.
 *
 * Kaynak şartname: project/docs/design/debtor-scoring-canonicalization.md Bölüm 12
 * (M1-M7 owner kararları NİHAİ). Bu dosya persistence-bağımsızdır: Prisma/Nest/IO
 * import'u YASAK (statik saflık guard'ı ile kilitli). Girdi adaptörleri PR-2B'de,
 * servis orkestrasyonu PR-2C'de gelir.
 *
 * Frozen kararlar: Case-level skor; polarite yüksek = KÖTÜ; ağırlıklar
 * 25/25/20/15/15; eksik veri = nötr puan + dataGaps + warnings (confidence alanı
 * YOK); LEGAL_DEADLINE v1'de daima DATA_GAP; cross-case aggregate YOK.
 */

export type ScoreBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type FactorCode =
  | "FIN_RECOVERY"
  | "ASSET_COVERAGE"
  | "CASE_AGE"
  | "STAGE_PROGRESS"
  | "BEHAVIOR"
  | "LEGAL_DEADLINE";

export type FactorDirection = "RAISES" | "LOWERS" | "NEUTRAL";

export interface FactorContribution {
  factorCode: FactorCode;
  /** Faktörün kullandığı ham girdi özeti — explainability için. */
  rawInput: Record<string, unknown>;
  /** Bu faktörün skora kattığı puan (yüksek = riski ARTIRIR). */
  points: number;
  /** Faktörün v1 ağırlığı (M1: 25/25/20/15/15; LEGAL_DEADLINE 0). */
  maxPoints: number;
  direction: FactorDirection;
  note?: string;
}

export type InputSource =
  | "BALANCE_AUTHORITY"
  | "CONFIRMED_FILTER_FALLBACK"
  | "CASE_DEBTOR_FIELDS"
  | "TEBLIGAT"
  | "CASE"
  | "NOT_AVAILABLE";

export interface InputProvenance {
  financial: InputSource;
  asset: InputSource;
  service: InputSource;
  /** v1'de daima NOT_AVAILABLE — Legal Time Authority (M5) hazır olana kadar. */
  legalDeadline: InputSource;
}

export type DataGapCode =
  | "FINANCIAL_INPUT_UNAVAILABLE"
  | "ASSET_QUERY_NOT_RUN"
  | "SERVICE_NOT_INTEGRATED"
  | "LEGAL_TIME_AUTHORITY_PENDING"
  | "EARLY_LIFECYCLE";

export type DataGapEffect = "NEUTRALIZED" | "PARTIAL" | "EXCLUDED";

export interface DataGap {
  code: DataGapCode;
  factorCode: FactorCode;
  effect: DataGapEffect;
  note?: string;
}

export interface DebtorScoringResult {
  /** 0-100, yüksek = KÖTÜ (D1). Clamp'lidir. */
  score: number;
  /** LOW 0-24 · MEDIUM 25-49 · HIGH 50-74 · CRITICAL 75-100. */
  scoreBand: ScoreBand;
  /** Formül versiyonu — formül değişiminde artar; shadow ayrımının anahtarı. */
  calculationVersion: string;
  factorBreakdown: FactorContribution[];
  inputProvenance: InputProvenance;
  dataGaps: DataGap[];
  warnings: string[];
  /** Deterministik: motor saat OKUMAZ, calculatedAt = input.asOf. */
  calculatedAt: string;
  tenantId: string;
  caseId: string;
}

// ==================== ScoringInput (PR-2B adaptörlerinin üreteceği saf girdi) ====================

export type AssetChannelSignal = "UNKNOWN" | "YES" | "NO" | "PENDING" | "ERROR";

export type ServiceStatusSignal =
  | "NOT_STARTED"
  | "READY"
  | "SENT"
  | "DELIVERED"
  | "RETURNED"
  | "MUHTAR"
  | "ANNOUNCEMENT"
  | "FAILED"
  | "UNKNOWN";

export type WorkflowStageSignal =
  | "INITIAL"
  | "PAYMENT_ORDER"
  | "WAITING_RESPONSE"
  | "OBJECTION"
  | "ENFORCEMENT"
  | "SEIZURE"
  | "SALE_REQUEST"
  | "AUCTION"
  | "COLLECTION"
  | "PARTIAL_PAYMENT"
  | "FULL_PAYMENT"
  | "CLOSED"
  | "SUSPENDED";

export interface ScoringFinancialInput {
  source: "BALANCE_AUTHORITY" | "CONFIRMED_FILTER_FALLBACK" | "NOT_AVAILABLE";
  /** Kanonik kalan borç (balance authority ya da fallback). Bilinmiyorsa null. */
  outstandingTotal: number | null;
  /** Yalnız CONFIRMED / kanonik ödemeler toplamı. Bilinmiyorsa null. */
  confirmedPaidTotal: number | null;
}

export interface ScoringAssetInput {
  source: "CASE_DEBTOR_FIELDS" | "NOT_AVAILABLE";
  vehicle: AssetChannelSignal;
  realEstate: AssetChannelSignal;
  bank: AssetChannelSignal;
  sgkWage: AssetChannelSignal;
}

export interface ScoringCaseSignals {
  /** ISO tarih — dosya açılışı. */
  createdAt: string;
  workflowStage: WorkflowStageSignal;
  /** Lifecycle'dan türetilir (adapter işi) — motor lifecycle OKUMAZ. */
  hasObjection: boolean;
  /** Son CONFIRMED tahsilat tarihi (ISO) — yoksa null. */
  lastConfirmedPaymentAt: string | null;
}

export interface ScoringServiceInput {
  /** Case'te hiç Tebligat kaydı yoksa NOT_AVAILABLE (entegrasyon-yok ≠ tebliğ-edilemedi). */
  source: "TEBLIGAT" | "NOT_AVAILABLE";
  serviceStatus: ServiceStatusSignal;
}

export interface ScoringInput {
  tenantId: string;
  caseId: string;
  /** ISO — determinizmin kaynağı; motor sistem saatini OKUMAZ (statik guard kilitler). */
  asOf: string;
  financial: ScoringFinancialInput;
  asset: ScoringAssetInput;
  caseSignals: ScoringCaseSignals;
  service: ScoringServiceInput;
  /** Adapter'dan taşınan uyarılar (örn. iptal/iade geçmişi notu) — motora şeffaf geçer. */
  warnings?: string[];
}
