import { Injectable } from '@nestjs/common';
import { CollectionDispositionLineType, Prisma } from '@prisma/client';
import {
  FINANCE_RISK_POLICY_VERSION,
  FinanceRiskActionCode,
  FinanceRiskCollectionDispositionInput,
  FinanceRiskDecision,
  FinanceRiskEvaluation,
  FinanceRiskReason,
  FinanceRiskReasonCode,
} from './finance-risk.types';

const DECISION_PRIORITY: Record<FinanceRiskDecision, number> = {
  [FinanceRiskDecision.ALLOW_DIRECT]: 0,
  [FinanceRiskDecision.REQUIRE_APPROVAL]: 1,
  [FinanceRiskDecision.MANUAL_REVIEW]: 2,
  [FinanceRiskDecision.BLOCK]: 3,
};

const BLOCK_REASONS = new Set<FinanceRiskReasonCode>([
  FinanceRiskReasonCode.AMOUNT_MISMATCH,
  FinanceRiskReasonCode.CURRENCY_MISMATCH,
  FinanceRiskReasonCode.TENANT_MISMATCH,
  FinanceRiskReasonCode.INVALID_SOURCE_STATE,
]);

const MANUAL_REVIEW_REASONS = new Set<FinanceRiskReasonCode>([
  FinanceRiskReasonCode.OTHER_BUCKET_USED,
  FinanceRiskReasonCode.MISSING_CORRELATION,
  FinanceRiskReasonCode.MANUAL_REVERSAL,
]);

const APPROVAL_REASONS = new Set<FinanceRiskReasonCode>([
  FinanceRiskReasonCode.POLICY_REQUIRES_APPROVAL,
  FinanceRiskReasonCode.POLICY_OVERRIDE,
  FinanceRiskReasonCode.FEE_THRESHOLD_EXCEEDED,
  FinanceRiskReasonCode.MANUAL_ADJUSTMENT,
  FinanceRiskReasonCode.HIGH_VALUE_TRANSACTION,
  FinanceRiskReasonCode.ROLE_RESTRICTION,
]);

@Injectable()
export class FinanceRiskEngine {
  /**
   * CollectionDisposition satir onerisi risk kararini uretir. Bu adim finansal etki yaratmaz; normal durumda domain
   * invariantlariyla devam eder, fakat OTHER/manual-review gibi satirlar approval'a cevrilmez.
   *
   * /// <remarks>
   * /// Cagrildigi yerler:
   * ///  - DispositionPostingService.recommend() -> POST /collection-dispositions/:id/recommend (oneri satirlari yazilmadan once)
   * ///  - FinanceRiskEngine unit tests -> pure decision coverage
   * /// </remarks>
   */
  evaluateCollectionDispositionRecommend(input: FinanceRiskCollectionDispositionInput): FinanceRiskEvaluation {
    const reasons = this.collectDispositionReasons(input);
    return this.buildEvaluation(FinanceRiskActionCode.COLLECTION_DISPOSITION_RECOMMEND, reasons, FinanceRiskDecision.ALLOW_DIRECT);
  }

  /**
   * CollectionDisposition POST risk kararini uretir. S9H'de mevcut P4 davranisi korunur: gecerli dagitim post'u
   * varsayilan olarak OfficeApproval gerektirir; manual-review/block kararlar OfficeApprovalRequest yaratmaz.
   *
   * /// <remarks>
   * /// Cagrildigi yerler:
   * ///  - DispositionPostingService.recommend() -> POST /collection-dispositions/:id/recommend (P4 approval intent yaratmadan once)
   * ///  - DispositionPostingService.post() -> POST /collection-dispositions/:id/post (defense-in-depth read)
   * ///  - FinanceRiskEngine unit tests -> pure decision coverage
   * /// </remarks>
   */
  evaluateCollectionDispositionPost(input: FinanceRiskCollectionDispositionInput): FinanceRiskEvaluation {
    const reasons = this.collectDispositionReasons(input);
    if (reasons.length === 0) {
      reasons.push({
        code: FinanceRiskReasonCode.POLICY_REQUIRES_APPROVAL,
        severity: 'HIGH',
        publicMessage: 'Dagitim kesinlesmeden once yetkili onayi gerekir.',
        internalMessage: `Policy ${FINANCE_RISK_POLICY_VERSION}: CollectionDisposition POST remains approval-backed; OfficeApproval is the approval consumer, not the executor.`,
        sourceType: 'CollectionDisposition',
        sourceId: input.dispositionId,
      });
    }
    return this.buildEvaluation(FinanceRiskActionCode.COLLECTION_DISPOSITION_POST, reasons, FinanceRiskDecision.REQUIRE_APPROVAL);
  }

  private collectDispositionReasons(input: FinanceRiskCollectionDispositionInput): FinanceRiskReason[] {
    const reasons: FinanceRiskReason[] = [];

    if (!input.tenantId) {
      reasons.push({
        code: FinanceRiskReasonCode.TENANT_MISMATCH,
        severity: 'BLOCKER',
        publicMessage: 'Tenant bilgisi dogrulanamadi; islem yapilamaz.',
        internalMessage: 'Finance risk evaluation received an empty tenantId.',
        sourceType: 'CollectionDisposition',
        sourceId: input.dispositionId,
      });
    }

    if (!input.currency || input.lines.some((line) => !line.amount)) {
      reasons.push({
        code: FinanceRiskReasonCode.CURRENCY_MISMATCH,
        severity: 'BLOCKER',
        publicMessage: 'Para birimi veya tutar bilgisi dogrulanamadi.',
        internalMessage: 'Finance risk evaluation requires currency and line amount data before approval can be requested.',
        sourceType: 'CollectionDisposition',
        sourceId: input.dispositionId,
      });
    }

    try {
      const total = new Prisma.Decimal(input.totalAmount);
      const sum = input.lines.reduce((acc, line) => acc.plus(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0));
      if (!sum.equals(total)) {
        reasons.push({
          code: FinanceRiskReasonCode.AMOUNT_MISMATCH,
          severity: 'BLOCKER',
          publicMessage: 'Dagitim toplami tahsilat tutariyla eslesmiyor; islem durduruldu.',
          internalMessage: `Line sum ${sum.toString()} does not match disposition total ${total.toString()}.`,
          sourceType: 'CollectionDisposition',
          sourceId: input.dispositionId,
        });
      }
    } catch {
      reasons.push({
        code: FinanceRiskReasonCode.AMOUNT_MISMATCH,
        severity: 'BLOCKER',
        publicMessage: 'Dagitim tutarlari dogrulanamadi; islem durduruldu.',
        internalMessage: 'Finance risk evaluation could not parse totalAmount or line amount as Decimal.',
        sourceType: 'CollectionDisposition',
        sourceId: input.dispositionId,
      });
    }

    if (input.manualReversalRequiredAt) {
      reasons.push({
        code: FinanceRiskReasonCode.MANUAL_REVERSAL,
        severity: 'HIGH',
        publicMessage: 'Bu dagitim manuel reversal takibi gerektiriyor; once inceleme gerekir.',
        internalMessage: 'manualReversalRequiredAt is set on the disposition source; approval cannot finalize the financial mutation safely.',
        sourceType: 'CollectionDisposition',
        sourceId: input.dispositionId,
      });
    }

    for (const [index, line] of input.lines.entries()) {
      if (line.type === CollectionDispositionLineType.OTHER) {
        reasons.push({
          code: FinanceRiskReasonCode.OTHER_BUCKET_USED,
          severity: 'HIGH',
          publicMessage: 'OTHER dagitim kalemi manuel inceleme gerektirir.',
          internalMessage: 'OTHER bucket is not auto-postable and must remain in manual review/suspense until a concrete policy exists.',
          field: `lines[${index}].type`,
          sourceType: 'CollectionDispositionLine',
          sourceId: line.id,
        });
      }
    }

    return reasons;
  }

  private buildEvaluation(
    actionCode: FinanceRiskActionCode,
    reasons: FinanceRiskReason[],
    fallbackDecision: FinanceRiskDecision,
  ): FinanceRiskEvaluation {
    const decision = this.resolveDecision(reasons, fallbackDecision);
    return {
      actionCode,
      decision,
      reasons,
      priorityRank: DECISION_PRIORITY[decision],
      canCreateOfficeApproval: decision === FinanceRiskDecision.REQUIRE_APPROVAL,
      canProceedDirectly: decision === FinanceRiskDecision.ALLOW_DIRECT,
      requiresManualReview: decision === FinanceRiskDecision.MANUAL_REVIEW,
      blocksMutation: decision === FinanceRiskDecision.BLOCK,
    };
  }

  private resolveDecision(reasons: FinanceRiskReason[], fallbackDecision: FinanceRiskDecision): FinanceRiskDecision {
    let decision = fallbackDecision;
    for (const reason of reasons) {
      const candidate = this.decisionForReason(reason.code);
      if (DECISION_PRIORITY[candidate] > DECISION_PRIORITY[decision]) decision = candidate;
    }
    return decision;
  }

  private decisionForReason(code: FinanceRiskReasonCode): FinanceRiskDecision {
    if (BLOCK_REASONS.has(code)) return FinanceRiskDecision.BLOCK;
    if (MANUAL_REVIEW_REASONS.has(code)) return FinanceRiskDecision.MANUAL_REVIEW;
    if (APPROVAL_REASONS.has(code)) return FinanceRiskDecision.REQUIRE_APPROVAL;
    return FinanceRiskDecision.ALLOW_DIRECT;
  }
}