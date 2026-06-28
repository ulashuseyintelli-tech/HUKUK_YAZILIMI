import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { CaseDebtorLifecycleStatus, ClaimItemStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CaseBalanceService } from "../interest-engine/orchestration/case-balance.service";
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

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException("Odeme onizleme tarihi gecersiz");
  }
  return parsed.toISOString().slice(0, 10);
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
    const asOfDate = paymentDate || new Date().toISOString().slice(0, 10);

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

    const currentOutstandingAmount = await this.readCurrentOutstanding(
      tenantId,
      caseId,
      currency,
      asOfDate,
      warnings,
    );

    const paymentAmount = roundMoney(amount);
    const appliedAmount = roundMoney(minMoney(paymentAmount, currentOutstandingAmount));
    const overpaymentAmount = roundMoney(maxMoney(ZERO, paymentAmount.minus(currentOutstandingAmount)));
    const projectedOutstandingAmount = roundMoney(maxMoney(ZERO, currentOutstandingAmount.minus(paymentAmount)));
    if (overpaymentAmount.greaterThan(0)) {
      warnings.push("PAYMENT_EXCEEDS_CURRENT_OUTSTANDING");
    }

    const distributionPreview = await this.buildDistributionPreview(
      caseId,
      paymentAmount,
    );
    if (distributionPreview.status === "MANUAL_REQUIRED") {
      warnings.push("NO_ELIGIBLE_CASE_CLIENT_FOR_DISTRIBUTION");
    }
    if (distributionPreview.requiresClientSelection) {
      warnings.push("CLIENT_SELECTION_REQUIRED_FOR_DISTRIBUTION");
    }

    return {
      nonPersistent: true,
      caseId,
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
        const fromBalance = this.extractOutstandingFromBalance(balance, currency);
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

  private extractOutstandingFromBalance(balance: unknown, currency: string): Prisma.Decimal | null {
    const currencyResults = (balance as { currencyResults?: CurrencyResultLike[] })?.currencyResults;
    if (!Array.isArray(currencyResults)) return null;

    const exact = currencyResults.find((row) => row.currency === currency && row.result);
    const candidate = exact || currencyResults.find((row) => row.result);
    const totalDue = candidate?.result?.totalDue;
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
      const demandedAmount = toDecimal(item.demandedAmount);
      const demanded = demandedAmount.isZero() ? toDecimal(item.amount) : demandedAmount;
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