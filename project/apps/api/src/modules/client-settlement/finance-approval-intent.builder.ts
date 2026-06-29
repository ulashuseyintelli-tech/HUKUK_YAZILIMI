import { Injectable } from '@nestjs/common';
import {
  FINANCE_RISK_POLICY_VERSION,
  FinanceRiskCollectionDispositionInput,
  FinanceRiskEvaluation,
  FinanceRiskReason,
} from './finance-risk.types';

export const FINANCE_APPROVAL_INTENT_VERSION = 'S9H_COLLECTION_DISPOSITION_POST_INTENT_V1';
export const FINANCE_APPROVAL_DETAIL_MASKING_CONTRACT_VERSION = 'S9H_FINANCE_APPROVAL_DETAIL_MASKING_V1';

export type FinanceApprovalVisibilityLevel = 'FULL' | 'SUMMARY' | 'MASKED' | 'HIDDEN';

export interface FinanceApprovalDetailMaskingRule {
  field: string;
  defaultLevel: FinanceApprovalVisibilityLevel;
  reason: string;
}

export interface FinanceApprovalDetailMaskingContract {
  version: string;
  summaryContainsRawSavedIntent: false;
  detailRequiresServerSideMasking: true;
  levels: FinanceApprovalVisibilityLevel[];
  sensitiveFields: FinanceApprovalDetailMaskingRule[];
}

export interface BuildCollectionDispositionPostIntentInput extends FinanceRiskCollectionDispositionInput {
  riskEvaluation: FinanceRiskEvaluation;
}

@Injectable()
export class FinanceApprovalIntentBuilder {
  /**
   * CollectionDisposition POST icin OfficeApproval savedIntent payload'ini olusturur.
   * Internal risk mesajlari bu payload'a yazilmaz; audit ve UI tarafina yalniz public aciklama tasinir.
   *
   * /// <remarks>
   * /// Cagrildigi yerler:
   * ///  - DispositionPostingService.recommend() -> POST /collection-dispositions/:id/recommend (approval-backed distribution intent)
   * ///  - FinanceRiskEngine/intent unit tests -> savedIntent masking contract coverage
   * /// </remarks>
   */
  buildCollectionDispositionPostIntent(input: BuildCollectionDispositionPostIntentInput) {
    return {
      version: FINANCE_APPROVAL_INTENT_VERSION,
      policyVersion: FINANCE_RISK_POLICY_VERSION,
      actionCode: input.riskEvaluation.actionCode,
      targetType: 'COLLECTION_DISPOSITION',
      targetRef: input.dispositionId,
      tenantId: input.tenantId,
      caseId: input.caseId,
      collectionId: input.collectionId,
      dispositionId: input.dispositionId,
      totalAmount: input.totalAmount,
      currency: input.currency,
      lines: input.lines.map((line) => ({
        id: line.id ?? null,
        type: line.type,
        amount: line.amount,
        caseClientId: line.caseClientId,
        note: line.note,
      })),
      risk: {
        decision: input.riskEvaluation.decision,
        priorityRank: input.riskEvaluation.priorityRank,
        reasons: input.riskEvaluation.reasons.map((reason) => this.toPublicReason(reason)),
      },
      visibility: this.buildFinanceApprovalDetailMaskingContract(),
    };
  }

  /**
   * OfficeApprovalRequest.reason alanina yazilacak kisa ve kullaniciya gosterilebilir aciklamayi uretir.
   *
   * /// <remarks>
   * /// Cagrildigi yerler:
   * ///  - DispositionPostingService.recommend() -> POST /collection-dispositions/:id/recommend (approval reason)
   * ///  - FinanceRiskEngine/intent unit tests -> public explanation coverage
   * /// </remarks>
   */
  buildOfficeApprovalReason(evaluation: FinanceRiskEvaluation): string {
    const messages = evaluation.reasons.map((reason) => reason.publicMessage).filter(Boolean);
    if (messages.length > 0) return messages.join(' | ');
    return 'Dagitim kesinlesmeden once yetkili onayi gerekir.';
  }

  /**
   * Finance approval detail payload'i icin server-side masking contract taslagi.
   * S9H bu contract'i belgeler/test eder; generic approval detail runtime masking S9G sonrasi ayri fazdir.
   *
   * /// <remarks>
   * /// Cagrildigi yerler:
   * ///  - FinanceApprovalIntentBuilder.buildCollectionDispositionPostIntent() -> savedIntent.visibility
   * ///  - FinanceRiskEngine/intent unit tests -> masking contract coverage
   * /// </remarks>
   */
  buildFinanceApprovalDetailMaskingContract(): FinanceApprovalDetailMaskingContract {
    return {
      version: FINANCE_APPROVAL_DETAIL_MASKING_CONTRACT_VERSION,
      summaryContainsRawSavedIntent: false,
      detailRequiresServerSideMasking: true,
      levels: ['FULL', 'SUMMARY', 'MASKED', 'HIDDEN'],
      sensitiveFields: [
        {
          field: 'lines.note',
          defaultLevel: 'MASKED',
          reason: 'Distribution notes may contain fee, offset, client or office policy context.',
        },
        {
          field: 'risk.reasons.privateExplanation',
          defaultLevel: 'HIDDEN',
          reason: 'Private risk explanation is intentionally not persisted in savedIntent.',
        },
        {
          field: 'policy.thresholdValues',
          defaultLevel: 'HIDDEN',
          reason: 'Risk policy thresholds are governance metadata, not general finance detail.',
        },
        {
          field: 'journalPreview',
          defaultLevel: 'HIDDEN',
          reason: 'S9H does not expose accounting journal preview.',
        },
      ],
    };
  }

  private toPublicReason(reason: FinanceRiskReason) {
    return {
      code: reason.code,
      severity: reason.severity,
      publicMessage: reason.publicMessage,
      field: reason.field ?? null,
      sourceType: reason.sourceType ?? null,
      sourceId: reason.sourceId ?? null,
    };
  }
}