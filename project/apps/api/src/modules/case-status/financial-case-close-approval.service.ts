import { Injectable, NotFoundException } from '@nestjs/common';
import type { LegalCaseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { buildGuardedEdgeOutcome } from '../permission-diagnostics/guided-edge/guarded-edge-outcome.envelope';
import { GuidedOpenDecision } from '../policy-engine/types/effective-permission.types';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import {
  FINANCIAL_CASE_CLOSE_ACTION_CODE,
  FINANCIAL_CASE_CLOSE_INTENT_VERSION,
  FINANCIAL_CASE_CLOSE_STATUSES,
  FINANCIAL_CASE_CLOSE_TARGET_TYPE,
  type FinancialCaseCloseSavedIntent,
} from './financial-case-close.constants';

interface RequestFinancialCaseCloseApprovalInput {
  actorUserId: string;
  tenantId: string;
  caseId: string;
  status: LegalCaseStatus;
  reason?: string | null;
}

@Injectable()
export class FinancialCaseCloseApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeApproval: OfficeApprovalService,
  ) {}

  isFinancialCloseStatus(status: LegalCaseStatus): boolean {
    return FINANCIAL_CASE_CLOSE_STATUSES.has(status);
  }

  async requestApproval(input: RequestFinancialCaseCloseApprovalInput) {
    const caseRow = await this.prisma.case.findFirst({
      where: { id: input.caseId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!caseRow) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    const savedIntent: FinancialCaseCloseSavedIntent = {
      version: FINANCIAL_CASE_CLOSE_INTENT_VERSION,
      caseId: input.caseId,
      status: input.status,
      reason: input.reason ?? null,
    };
    const idempotencyKey = `financial-case-close:${input.caseId}`;
    const request = await this.officeApproval.createPendingRequest({
      tenantId: input.tenantId,
      actionCode: FINANCIAL_CASE_CLOSE_ACTION_CODE,
      targetType: FINANCIAL_CASE_CLOSE_TARGET_TYPE,
      targetRef: input.caseId,
      requesterUserId: input.actorUserId,
      savedIntent,
      reason: 'Finansal dosya kapanışı yetkili onayı gerektirir.',
      idempotencyKey,
    });

    if (
      request.status === 'PENDING_APPROVAL' &&
      request.payloadHash !== stableJsonHash(savedIntent)
    ) {
      return this.buildEnvelope(request.id, input.caseId, 'FINANCIAL_CASE_CLOSE_PENDING_EXISTS');
    }

    return this.buildEnvelope(request.id, input.caseId, 'FINANCIAL_CASE_CLOSE_REQUIRES_APPROVAL');
  }

  private buildEnvelope(requestId: string, caseId: string, reasonCode: string) {
    return buildGuardedEdgeOutcome({
      outcome: GuidedOpenDecision.APPROVAL_REQUIRED,
      actionCode: ActionCode.FINANCIAL_CASE_CLOSE,
      target: { resourceType: FINANCIAL_CASE_CLOSE_TARGET_TYPE, caseId },
      reasonCode,
      message: 'Finansal dosya kapanışı için yetkili onayı gerekiyor.',
      approval: { requestId, status: 'PENDING_APPROVAL' },
    });
  }
}
