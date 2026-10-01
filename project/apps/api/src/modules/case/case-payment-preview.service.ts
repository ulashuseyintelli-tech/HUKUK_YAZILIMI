import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { CaseDebtorLifecycleStatus, ClaimItemStatus, Prisma } from "@prisma/client";
import { hasRestrictedLiability, isItemLiableForDebtor } from "../claim-item/payer-liability-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { CaseBalanceService } from "../interest-engine/orchestration/case-balance.service";
import { toTurkeyCalendarDay, turkeyToday } from "../../common/turkey-calendar";
import {
  PaymentPreviewRequestDto,
  PaymentPreviewResponseDto,
} from "./dto/payment-preview.dto";

const CLOSED_FOR_COLLECTION = new Set(["HITAM", "INFAZ"]);
const ELIGIBLE_CLIENT_ROLES = ["ALACAKLI", "ORTAK_ALACAKLI"];
const DEFAULT_CURRENCY = "TRY";
const ZERO = new Prisma.Decimal(0);

type PreviewArgs = {
  tenantId: string;
  caseId: string;
  input: PaymentPreviewRequestDto;
};

type CurrencyResultLike = {
  currency?: string;
  result?: { totalDue?: unknown } | null;
};

function toDecimal(value: unknown): Prisma.Decimal {
  if (value == null) return new Prisma.Decimal(0);
  if (typeof value === "object" && "toString" in value) {
    return new Prisma.Decimal((value as { toString(): string }).toString());
  }
  return new Prisma.Decimal(String(value));
}

function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2);
}

function moneyToNumber(value: Prisma.Decimal): number {
  return roundMoney(value).toNumber();
}

function minMoney(left: Prisma.Decimal, right: Prisma.Decimal): Prisma.Decimal {
  return left.lessThanOrEqualTo(right) ? left : right;
}

function maxMoney(left: Prisma.Decimal, right: Prisma.Decimal): Prisma.Decimal {
  return left.greaterThanOrEqualTo(right) ? left : right;
}

function normalizeCurrency(value: string | undefined, fallback: string | null | undefined): string {
  const currency = (value || fallback || DEFAULT_CURRENCY).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BadRequestException("Odeme onizleme para birimi gecersiz");
  }
  return currency;
}

/**
 * K3-L KP-11: ödeme tarihi güne indirgenir. Takvim günü (YYYY-MM-DD) olduğu gibi; saatli girdi ANIN Türkiye takvimindeki
 * günü (önceden UTC günü: `…T01:30:00+03:00` bir önceki güne kayıyordu).
 */
function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const day = toTurkeyCalendarDay(value);
  if (day == null) {
    throw new BadRequestException("Odeme onizleme tarihi gecersiz");
  }
  return day;
}

function clientDisplayName(client: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
}): string | undefined {
  const personName = [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
  return client.displayName || client.companyName || personName || undefined;
}

@Injectable()
export class CasePaymentPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly caseBalanceService?: CaseBalanceService,
  ) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - CasePaymentPreviewController.previewPayment() -> POST /cases/:caseId/payment-preview (non-persistent odeme onizleme)
  /// </remarks>
  async preview({ tenantId, caseId, input }: PreviewArgs): Promise<PaymentPreviewResponseDto> {
    let amount: Prisma.Decimal;
    try {
      amount = toDecimal(input.amount);
    } catch {
      throw new BadRequestException("Odeme onizleme tutari pozitif olmali");
    }
    if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException("Odeme onizleme tutari pozitif olmali");
    }

    const paymentDate = normalizeDate(input.paymentDate);
    // K3-L KP-11: ödeme tarihi yoksa hesap tarihi Türkiye takvimine göre bugün; kullanılan tarih yanıtta açıkça döner
    const asOfDate = paymentDate || turkeyToday();

    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true, currency: true, caseStatus: true },
    });
    if (!caseRow) throw new NotFoundException("Dosya bulunamadi");

    const currency = normalizeCurrency(input.currency, caseRow.currency);
    await this.assertCaseDebtorScope(tenantId, caseId, input.caseDebtorId);

    const warnings: string[] = [];
    const blockingReasons: string[] = [];
    if (CLOSED_FOR_COLLECTION.has(String(caseRow.caseStatus || "").toUpperCase())) {
      blockingReasons.push("CASE_CLOSED_FOR_COLLECTION");
    }

    // K3-L (owner kararı 2026-09-28): yalnız bazı borçlulara bağlı kalem varsa ödeyen borçlu zorunlu; kalan borç
    // yalnız o borçlunun sorumlu olduğu kalemlerden (faiz hariç — borçlu bazlı kanonik bakiye ayrı iş).
    const payerScope = await this.resolvePayerScope(tenantId, caseId, currency, input.caseDebtorId);
    // K3-L (owner kararı 2026-09-29): tahsilat reddedilmez; hesabına ödeme yapılan borçlu belirsizse / sorumlu kalemi
    // yoksa kayıt yapılır ve mahsup BEKLETİLİR → önizlemede uyarı, uygulanan tutar 0.
    if (payerScope.status === "PAYER_REQUIRED") warnings.push("ALLOCATION_HELD_ON_BEHALF_DEBTOR_REQUIRED");
    if (payerScope.status === "PAYER_NOT_LIABLE") warnings.push("ALLOCATION_HELD_ON_BEHALF_DEBTOR_NOT_LIABLE");
    if (payerScope.status === "SCOPED") warnings.push("PAYER_SCOPED_OUTSTANDING_EXCLUDES_INTEREST");
    const allocationHeld = payerScope.status === "PAYER_REQUIRED" || payerScope.status === "PAYER_NOT_LIABLE";

    const currentOutstandingAmount =
      payerScope.status === "SCOPED"
        ? payerScope.outstanding
        : await this.readCurrentOutstanding(tenantId, caseId, currency, asOfDate, warnings);

    const paymentAmount = roundMoney(amount);
    const appliedAmount = allocationHeld ? ZERO : roundMoney(minMoney(paymentAmount, currentOutstandingAmount));
    const overpaymentAmount = allocationHeld
      ? ZERO
      : roundMoney(maxMoney(ZERO, paymentAmount.minus(currentOutstandingAmount)));
    const projectedOutstandingAmount = allocationHeld
      ? currentOutstandingAmount
      : roundMoney(maxMoney(ZERO, currentOutstandingAmount.minus(paymentAmount)));
    if (overpaymentAmount.greaterThan(0)) {
      warnings.push("PAYMENT_EXCEEDS_CURRENT_OUTSTANDING");
    }

    const baseDistributionPreview = await this.buildDistributionPreview(
      caseId,
      paymentAmount,
    );
    // K3-L: mahsup bekletilecekse dağıtım önizlemesi ÜRETİLMEZ — para henüz hiçbir borçlu hesabına düşmedi;
    // müvekkile dağıtılabilir tutar mahsup tamamlanınca belli olur.
    const distributionPreview: PaymentPreviewResponseDto["distributionPreview"] = allocationHeld
      ? {
          source: baseDistributionPreview.source,
          status: "BLOCKED",
          totalAmount: baseDistributionPreview.totalAmount,
          requiresClientSelection: false,
          lines: [],
        }
      : baseDistributionPreview;
    if (allocationHeld) warnings.push("DISTRIBUTION_DEFERRED_UNTIL_ALLOCATION_COMPLETED");
    if (distributionPreview.status === "MANUAL_REQUIRED") {
      warnings.push("NO_ELIGIBLE_CASE_CLIENT_FOR_DISTRIBUTION");
    }
    if (distributionPreview.requiresClientSelection) {
      warnings.push("CLIENT_SELECTION_REQUIRED_FOR_DISTRIBUTION");
    }

    return {
      nonPersistent: true,
      caseId,
      asOfDate,
      asOfDateSource: paymentDate ? "PAYMENT_DATE" : "TURKEY_TODAY_DEFAULT",
      input: {
        amount: moneyToNumber(paymentAmount),
        ...(paymentDate ? { paymentDate } : {}),
        currency,
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
        caseDebtorId: input.caseDebtorId || null,
      },
      acceptance: {
        wouldAccept: blockingReasons.length === 0,
        blockingReasons,
        warnings,
      },
      balanceImpact: {
        currentOutstandingAmount: moneyToNumber(currentOutstandingAmount),
        paymentAmount: moneyToNumber(paymentAmount),
        appliedAmount: moneyToNumber(appliedAmount),
        overpaymentAmount: moneyToNumber(overpaymentAmount),
        projectedOutstandingAmount: moneyToNumber(projectedOutstandingAmount),
      },
      distributionPreview,
    };
  }

  /**
   * K3-L — önizlemede ödeyen borçlu kapsamı. Kısıtlı kalem yoksa bugünkü davranış (UNRESTRICTED).
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - CasePaymentPreviewService.preview() → kalan borç ve kabul kararı
   * /// </remarks>
   */
  private async resolvePayerScope(
    tenantId: string,
    caseId: string,
    currency: string,
    caseDebtorId?: string,
  ): Promise<
    | { status: "UNRESTRICTED" }
    | { status: "PAYER_REQUIRED" }
    | { status: "PAYER_NOT_LIABLE" }
    | { status: "SCOPED"; outstanding: Prisma.Decimal }
  > {
    const items = await this.prisma.claimItem.findMany({
      where: { tenantId, caseId, currency, status: ClaimItemStatus.ACTIVE },
      select: { amount: true, demandedAmount: true, collectedAmount: true, isAllDebtorsLiable: true, liableDebtorIds: true },
    });
    if (!hasRestrictedLiability(items)) return { status: "UNRESTRICTED" };
    const payer = caseDebtorId
      ? await this.prisma.caseDebtor.findFirst({ where: { id: caseDebtorId, caseId }, select: { debtorId: true } })
      : null;
    if (!payer) return { status: "PAYER_REQUIRED" };
    const scoped = items.filter((item) => isItemLiableForDebtor(item, payer.debtorId));
    if (scoped.length === 0) return { status: "PAYER_NOT_LIABLE" };
    const outstanding = scoped.reduce((sum, item) => {
      const demanded = item.demandedAmount == null ? toDecimal(item.amount) : toDecimal(item.demandedAmount);
      return sum.plus(maxMoney(ZERO, demanded.minus(toDecimal(item.collectedAmount))));
    }, new Prisma.Decimal(0));
    return { status: "SCOPED", outstanding: roundMoney(outstanding) };
  }

  private async assertCaseDebtorScope(
    tenantId: string,
    caseId: string,
    caseDebtorId?: string,
  ): Promise<void> {
    if (caseDebtorId === undefined || caseDebtorId === null) return;
    if (caseDebtorId.trim() === "") {
      throw new BadRequestException("Odeme onizleme borclu baglantisi gecersiz");
    }

    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: {
        id: caseDebtorId,
        caseId,
        lifecycleStatus: CaseDebtorLifecycleStatus.ACTIVE,
        case: { tenantId },
      },
      select: { id: true },
    });
    if (!caseDebtor) {
      throw new BadRequestException("Odeme onizleme borclu baglantisi gecersiz");
    }
  }

  private async readCurrentOutstanding(
    tenantId: string,
    caseId: string,
    currency: string,
    asOfDate: string,
    warnings: string[],
  ): Promise<Prisma.Decimal> {
    if (this.caseBalanceService) {
      try {
        const balance = await this.caseBalanceService.computeCaseBalance(tenantId, caseId, asOfDate);
        const fromBalance = this.extractOutstandingFromBalance(balance, currency, warnings);
        if (fromBalance !== null) return fromBalance;
        warnings.push("CURRENT_BALANCE_UNAVAILABLE");
      } catch {
        warnings.push("CURRENT_BALANCE_UNAVAILABLE");
      }
    } else {
      warnings.push("CURRENT_BALANCE_SERVICE_UNAVAILABLE");
    }

    warnings.push("CLAIM_ITEM_READ_FALLBACK_USED");
    return this.readClaimItemOutstandingFallback(tenantId, caseId, currency);
  }

  private extractOutstandingFromBalance(
    balance: unknown,
    currency: string,
    warnings: string[],
  ): Prisma.Decimal | null {
    const currencyResults = (balance as { currencyResults?: CurrencyResultLike[] })?.currencyResults;
    if (!Array.isArray(currencyResults)) return null;

    // K3-L D2-P0: yalnız önizlenen para biriminin kanonik sonucu kullanılır. Bu para biriminde sonuç yoksa başka para
    // biriminin borcu bu para biriminin borcu SAYILMAZ (önceden ilk sonuçlu para birimine düşülüyordu); aynı para
    // birimindeki kalem okuma yedeğine geçilir ve bu açıkça uyarılır.
    const exact = currencyResults.find((row) => row.currency === currency && row.result);
    if (!exact) {
      if (currencyResults.some((row) => row.result)) warnings.push("CURRENT_BALANCE_CURRENCY_NOT_COMPUTED");
      return null;
    }
    const totalDue = exact.result?.totalDue;
    if (totalDue === undefined || totalDue === null) return null;

    try {
      const amount = toDecimal(totalDue);
      return amount.isFinite() ? roundMoney(maxMoney(ZERO, amount)) : null;
    } catch {
      return null;
    }
  }

  private async readClaimItemOutstandingFallback(
    tenantId: string,
    caseId: string,
    currency: string,
  ): Promise<Prisma.Decimal> {
    const claimItems = await this.prisma.claimItem.findMany({
      where: {
        tenantId,
        caseId,
        currency,
        status: { not: ClaimItemStatus.CANCELLED },
      },
      select: {
        amount: true,
        demandedAmount: true,
        collectedAmount: true,
      },
    });

    const total = claimItems.reduce((sum, item) => {
      const demanded = item.demandedAmount == null
        ? toDecimal(item.amount)
        : toDecimal(item.demandedAmount);
      const collected = toDecimal(item.collectedAmount);
      return sum.plus(maxMoney(ZERO, demanded.minus(collected)));
    }, new Prisma.Decimal(0));

    return roundMoney(total);
  }

  private async buildDistributionPreview(
    caseId: string,
    amount: Prisma.Decimal,
  ): Promise<PaymentPreviewResponseDto["distributionPreview"]> {
    const creditors = await this.prisma.caseClient.findMany({
      where: {
        caseId,
        role: { in: ELIGIBLE_CLIENT_ROLES },
      },
      select: {
        id: true,
        role: true,
        client: {
          select: {
            displayName: true,
            firstName: true,
            lastName: true,
            companyName: true,
          },
        },
      },
      orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
    });

    if (creditors.length === 0) {
      return {
        source: "UNKNOWN",
        status: "MANUAL_REQUIRED",
        totalAmount: moneyToNumber(amount),
        requiresClientSelection: false,
        lines: [],
      };
    }

    if (creditors.length > 1) {
      return {
        source: "CASE_CREDITOR_CLUSTER",
        status: "HELD_PENDING_DISTRIBUTION",
        totalAmount: moneyToNumber(amount),
        requiresClientSelection: true,
        lines: [],
      };
    }

    const creditor = creditors[0];
    return {
      source: "SINGLE_CASE_CLIENT",
      status: "HELD_PENDING_DISTRIBUTION",
      totalAmount: moneyToNumber(amount),
      requiresClientSelection: false,
      lines: [
        {
          type: "CLIENT_PAYABLE",
          amount: moneyToNumber(amount),
          caseClientId: creditor.id,
          ...(clientDisplayName(creditor.client) ? { clientName: clientDisplayName(creditor.client) } : {}),
        },
      ],
    };
  }
}
