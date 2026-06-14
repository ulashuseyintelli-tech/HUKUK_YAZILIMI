/**
 * G4c-3: BalanceShadowCompareService — summary-engine (incumbent) vs computeBalance (G4c-1) GÖZLEM.
 *
 * READ-ONLY DIAGNOSTIC. İki motoru yan yana koşar, FARKI raporlar. CANLI bakiyeyi/route'ları
 * DEĞİŞTİRMEZ; persist/trigger/migration/cutover YOK.
 *
 * Ayrışma (kanıt): summary-engine DEPOLANMIŞ INTEREST + per-item collected düşümü; computeBalance
 * SEGMENT faizi + TBK100 payment allocation → bakiyeler uyuşmaz. interestDelta ana kaynağı izole eder.
 * Bu metrikler ileride LEGAL cutover kararına (Av. sign-off) kanıt; cutover AYRI gate.
 *
 * <remarks>Çağrıldığı yerler: BalanceShadowCompareController GET /balance-compare/case/:caseId.</remarks>
 */

import { Injectable } from '@nestjs/common';
import { SummaryEngineService } from '../summary-engine/summary-engine.service';
import { CaseBalanceService, CaseBalanceResult } from '../interest-engine/orchestration/case-balance.service';

export type MatchStatus = 'MATCH' | 'DIVERGENT' | 'SUMMARY_ONLY' | 'ENGINE_ONLY';

export interface CurrencyComparison {
  currency: string;
  /** summary-engine sonBorc (yalnız case.currency; diğer currency'lerde null). */
  summarySonBorc: number | null;
  /** computeBalance totalDue (per-currency). */
  engineTotalDue: number | null;
  /** engineTotalDue − summarySonBorc. */
  delta: number | null;
  /** delta / summarySonBorc * 100 (summarySonBorc=0 → null). */
  deltaPercent: number | null;
  /** summary takipSonrasiFaiz (yalnız case.currency). */
  summaryInterest: number | null;
  /** computeBalance totalInterest (segment). */
  engineInterest: number | null;
  /** engineInterest − summaryInterest (ANA ayrışma metriği: stored vs recomputed faiz). */
  interestDelta: number | null;
  matchStatus: MatchStatus;
}

export interface BalanceShadowCompareResult {
  caseId: string;
  asOfDate: string;
  summaryCurrency: string | null;
  /** summary-engine throw ederse (ör. case yok) mesaj; engine sonucu yine döner. */
  summaryError: string | null;
  engineSource: CaseBalanceResult['source'];
  comparisons: CurrencyComparison[];
  /** computeBalance diagnostics passthrough (gözlem). */
  engineDiagnostics: CaseBalanceResult['diagnostics'];
}

/** 1 kuruş eşiği (Q-c). */
const MATCH_EPSILON = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class BalanceShadowCompareService {
  constructor(
    private readonly summary: SummaryEngineService,
    private readonly engine: CaseBalanceService,
  ) {}

  /**
   * Bir case için iki motorun bakiyesini karşılaştırır (read-only gözlem).
   *
   * <remarks>Çağrıldığı yerler: BalanceShadowCompareController.getShadowCompare().</remarks>
   */
  async compare(tenantId: string, caseId: string, asOfDate: string): Promise<BalanceShadowCompareResult> {
    // summary-engine (tek-currency; case yok ise THROW → yakala)
    let summarySonBorc: number | null = null;
    let summaryInterest: number | null = null;
    let summaryCurrency: string | null = null;
    let summaryError: string | null = null;
    try {
      const summaryResult = await this.summary.calculateSummary(tenantId, caseId, new Date(asOfDate));
      summaryCurrency = summaryResult.currency ?? null;
      summarySonBorc = summaryResult.totals.sonBorc ?? null;
      summaryInterest = summaryResult.totals.takipSonrasiFaiz ?? null;
    } catch (e) {
      summaryError = e instanceof Error ? e.message : String(e);
    }

    // computeBalance (per-currency; case yok ise diagnostic, throw etmez)
    const engineResult = await this.engine.computeCaseBalance(tenantId, caseId, asOfDate);

    // currency birleşimi: summary (case.currency) ∪ engine currency'leri
    const currencies = new Set<string>();
    if (summaryCurrency) currencies.add(summaryCurrency);
    for (const cr of engineResult.currencyResults) currencies.add(cr.currency);

    const comparisons: CurrencyComparison[] = [];
    for (const currency of currencies) {
      const engineEntry = engineResult.currencyResults.find((c) => c.currency === currency);
      const engineTotalDue = engineEntry?.result?.totalDue ?? null;
      const engineInterest = engineEntry?.result?.totalInterest ?? null;

      const isSummaryCurrency = currency === summaryCurrency;
      const cmpSummarySonBorc = isSummaryCurrency ? summarySonBorc : null;
      const cmpSummaryInterest = isSummaryCurrency ? summaryInterest : null;

      const hasSummary = cmpSummarySonBorc != null;
      const hasEngine = engineTotalDue != null;

      const delta = hasSummary && hasEngine ? round2(engineTotalDue! - cmpSummarySonBorc!) : null;
      const deltaPercent =
        delta != null && cmpSummarySonBorc != null && cmpSummarySonBorc !== 0
          ? round2((delta / cmpSummarySonBorc) * 100)
          : null;
      const interestDelta =
        engineInterest != null && cmpSummaryInterest != null
          ? round2(engineInterest - cmpSummaryInterest)
          : null;

      let matchStatus: MatchStatus;
      if (hasSummary && hasEngine) {
        matchStatus = Math.abs(delta as number) < MATCH_EPSILON ? 'MATCH' : 'DIVERGENT';
      } else if (hasSummary) {
        matchStatus = 'SUMMARY_ONLY';
      } else {
        matchStatus = 'ENGINE_ONLY';
      }

      comparisons.push({
        currency,
        summarySonBorc: cmpSummarySonBorc,
        engineTotalDue,
        delta,
        deltaPercent,
        summaryInterest: cmpSummaryInterest,
        engineInterest,
        interestDelta,
        matchStatus,
      });
    }

    return {
      caseId,
      asOfDate,
      summaryCurrency,
      summaryError,
      engineSource: engineResult.source,
      comparisons,
      engineDiagnostics: engineResult.diagnostics,
    };
  }
}
