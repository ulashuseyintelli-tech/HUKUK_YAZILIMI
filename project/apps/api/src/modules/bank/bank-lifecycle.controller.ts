import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { BankSettlementEvidenceSource } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BankCandidateSettlementTransitionService } from './bank-candidate-settlement-transition.service';
import { BankSettlementEvidenceWriterService } from './bank-settlement-evidence-writer.service';
import {
  AppendBankSettlementEvidenceDto,
  TransitionBankCandidateFinalityDto,
} from './dto/bank-lifecycle.dto';

/**
 * W2.2C-6 production command boundary for the canonical bank-candidate lifecycle.
 *
 * Tenant and actor authority always come from JwtAuthGuard's trusted principal.
 * Evidence append and candidate finality remain separate canonical mutations.
 */
@Controller('bank')
@UseGuards(JwtAuthGuard)
export class BankLifecycleController {
  constructor(
    private readonly evidenceWriter: BankSettlementEvidenceWriterService,
    private readonly transitionService: BankCandidateSettlementTransitionService,
  ) {}

  /// <remarks>
  /// Called by authenticated settlement-verifier clients through
  /// POST /bank/settlement-evidence. The human evidence source is server-owned.
  /// </remarks>
  @Post('settlement-evidence')
  appendEvidence(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Body() body: AppendBankSettlementEvidenceDto,
  ) {
    return this.evidenceWriter.appendHumanEvidence({
      trustedTenantId: tenantId,
      actorUserId,
      idempotencyKey: body.idempotencyKey,
      source: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
      outcome: body.outcome,
      evidenceReference: body.evidenceReference,
      evidenceHash: body.evidenceHash,
      observedAt: new Date(body.observedAt),
    });
  }

  /// <remarks>
  /// Called by authenticated settlement-verifier clients through
  /// POST /bank/transactions/:id/finality. The service derives the terminal
  /// status only from the immutable, tenant-scoped evidence row.
  /// </remarks>
  @Post('transactions/:id/finality')
  transitionFinality(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('id') transactionId: string,
    @Body() body: TransitionBankCandidateFinalityDto,
  ) {
    return this.transitionService.transition({
      trustedTenantId: tenantId,
      actorUserId,
      transactionId,
      settlementEvidenceId: body.settlementEvidenceId,
      idempotencyKey: body.idempotencyKey,
    });
  }
}
