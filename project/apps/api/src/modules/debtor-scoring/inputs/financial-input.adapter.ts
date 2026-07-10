import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { CaseBalanceService } from "../../interest-engine/orchestration/case-balance.service";
import { sumConfirmedCollections } from "../../../common/collection-confirmed.util";
import { ScoringFinancialInput } from "../debtor-scoring.types";

export interface FinancialInputResult {
  financial: ScoringFinancialInput;
  warnings: string[];
}

/**
 * DEBTOR-SCORING-CANON Phase 2 / PR-2B — kanonik finansal girdi adaptörü.
 *
 * Birincil kaynak: `CaseBalanceService.computeCaseBalance()` (interest-engine
 * orchestration; kanonik balance/payment authority). Güvenlik sinyali,
 * `computeCaseBalance`'ın KENDİ diagnostics/currencyResults çıktısından türetilir
 * (fatal diagnostic yok + en az bir para birimi hesaplanmış) — ağır, legacy
 * `CaseService.getCalculationSummary`'ye bağımlı `BalanceDisplayShadowDiffService`
 * BİLİNÇLİ OLARAK kullanılmaz (Bölüm 12.6'nın "servis-servise doğrudan" M7
 * kararına daha uygun, legacy-yolu tetiklemeyen daha hafif bir okuma).
 *
 * Güvensizse: yalnız CONFIRMED tahsilat + `Case.principalAmount` (açıkça
 * NON_AUTHORITATIVE ham deger) fallback'i. Hiçbir zaman Prisma write yapmaz.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - (PR-2C) DebtorScoringService.calculateCaseScore() -> ScoringInput.financial
 *   alanını doldurmak için çağırır. PR-2B'de henüz caller yoktur.
 * </remarks>
 */
@Injectable()
export class FinancialInputAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseBalance: CaseBalanceService,
  ) {}

  async build(tenantId: string, caseId: string, asOfDate: string): Promise<FinancialInputResult> {
    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { principalAmount: true },
    });
    if (!caseRow) {
      throw new NotFoundException("Case not found");
    }

    const warnings: string[] = [];

    const collections = await this.prisma.collection.findMany({
      where: { caseId, tenantId },
      select: { amount: true, status: true },
    });
    const confirmedPaidTotal = sumConfirmedCollections(collections);

    const balance = await this.caseBalance.computeCaseBalance(tenantId, caseId, asOfDate);
    const isBalanceSafe =
      balance.diagnostics.fatal.length === 0 &&
      balance.currencyResults.some((cr) => cr.result !== null);

    if (isBalanceSafe) {
      const outstandingTotal = balance.currencyResults
        .filter((cr) => cr.result !== null)
        .reduce((sum, cr) => sum + (cr.result!.totalDue ?? 0), 0);
      return {
        financial: { source: "BALANCE_AUTHORITY", outstandingTotal, confirmedPaidTotal },
        warnings,
      };
    }

    if (caseRow.principalAmount === null) {
      warnings.push(
        "FinancialInputAdapter: kanonik balance authority güvenli değil ve Case.principalAmount yok — finansal girdi kullanılamıyor",
      );
      return {
        financial: { source: "NOT_AVAILABLE", outstandingTotal: null, confirmedPaidTotal },
        warnings,
      };
    }

    warnings.push(
      "FinancialInputAdapter: kanonik balance authority güvenli değil — Case.principalAmount (NON_AUTHORITATIVE ham değer) - CONFIRMED tahsilat fallback'i kullanıldı",
    );
    const outstandingTotal = Math.max(0, Number(caseRow.principalAmount) - confirmedPaidTotal);
    return {
      financial: { source: "CONFIRMED_FILTER_FALLBACK", outstandingTotal, confirmedPaidTotal },
      warnings,
    };
  }
}
