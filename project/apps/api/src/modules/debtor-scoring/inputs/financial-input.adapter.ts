import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { CaseBalanceService } from "../../interest-engine/orchestration/case-balance.service";
import { filterConfirmedCollections } from "../../../common/collection-confirmed.util";
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
 * K3-L TK-11 (REC-ALLOC-008: para birimleri arası toplam/dönüşüm YOK; eksik bağlam typed null):
 * kalan borç ve ödenen toplamı YALNIZ tek para biriminde üretilir. Birden çok para biriminde hesaplanmış sonuç,
 * hesaplanamamış (atlanmış) bir para birimi ya da dosya para biriminden farklı tahsilat varsa finansal girdi
 * NOT_AVAILABLE olur (skor motoru nötr puan verir); hiçbir toplam üretilmez.
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
      select: { principalAmount: true, currency: true },
    });
    if (!caseRow) {
      throw new NotFoundException("Case not found");
    }

    const warnings: string[] = [];

    const collections = await this.prisma.collection.findMany({
      where: { caseId, tenantId },
      select: { amount: true, status: true, currency: true },
    });
    const confirmed = filterConfirmedCollections(collections);
    // K3-L TK-11: para birimi bilinmeyen tahsilat güvenli sayılmaz (REC-ALLOC-008: eksik currency 0 DEĞİL)
    const paidCurrencies = new Set(confirmed.map((c) => (c.currency ? String(c.currency) : "UNKNOWN")));
    const confirmedPaidTotal = confirmed.reduce((sum, c) => sum + Number(c.amount), 0);

    const balance = await this.caseBalance.computeCaseBalance(tenantId, caseId, asOfDate);
    const computed = balance.currencyResults.filter((cr) => cr.result !== null);
    const anySkipped = balance.currencyResults.some((cr) => cr.result === null);
    const computedCurrency = computed.length === 1 ? computed[0].currency : null;
    const paidMatchesComputed =
      paidCurrencies.size === 0 || (computedCurrency !== null && paidCurrencies.size === 1 && paidCurrencies.has(computedCurrency));

    const isBalanceSafe =
      balance.diagnostics.fatal.length === 0 && computed.length === 1 && !anySkipped && paidMatchesComputed;

    if (isBalanceSafe) {
      const outstandingTotal = computed[0].result!.totalDue ?? 0;
      return {
        financial: { source: "BALANCE_AUTHORITY", outstandingTotal, confirmedPaidTotal },
        warnings,
      };
    }

    // K3-L TK-11: birden çok para birimi (sonuç ya da tahsilat) → toplam ÜRETİLMEZ, typed null
    const resultCurrencies = new Set(balance.currencyResults.map((cr) => cr.currency));
    const multiCurrency =
      resultCurrencies.size > 1 ||
      paidCurrencies.size > 1 ||
      (computedCurrency !== null && paidCurrencies.size === 1 && !paidCurrencies.has(computedCurrency));
    if (multiCurrency) {
      warnings.push(
        "FinancialInputAdapter: birden çok para birimi — REC-ALLOC-008 gereği para birimleri arası toplam/dönüşüm yapılmaz; finansal girdi kullanılamıyor",
      );
      return {
        financial: { source: "NOT_AVAILABLE", outstandingTotal: null, confirmedPaidTotal: null },
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

    // K3-L TK-11: ham fallback (principalAmount − tahsilat) yalnız tahsilatlar dosya para biriminde ise
    const caseCurrency = caseRow.currency ? String(caseRow.currency) : null;
    if (paidCurrencies.size > 0 && (caseCurrency === null || !paidCurrencies.has(caseCurrency))) {
      warnings.push(
        "FinancialInputAdapter: tahsilat para birimi dosya para biriminden farklı — REC-ALLOC-008 gereği fallback toplamı üretilmez",
      );
      return {
        financial: { source: "NOT_AVAILABLE", outstandingTotal: null, confirmedPaidTotal: null },
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
