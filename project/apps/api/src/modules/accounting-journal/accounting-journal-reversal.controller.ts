import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CpeRequired } from '../policy-engine/decorators/cpe-required.decorator';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { AccountingJournalReversalService, AccountingJournalReversalResult } from './accounting-journal-reversal.service';
import { ReverseAccountingJournalEntryDto } from './dto/reverse-accounting-journal-entry.dto';

@Controller('accounting-journal')
@UseGuards(JwtAuthGuard)
export class AccountingJournalReversalController {
  constructor(private readonly reversalService: AccountingJournalReversalService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - AccountingJournalReversalController.reverseEntry() -> POST /accounting-journal/entries/:entryId/reverse (JWT-only HTTP boundary; service enforces PARTNER/MANAGER office-admin gate).
  /// - AccountingJournalReversalService.reverseEntry() -> tenant-scoped generic AccountingJournalEntry reversal writer + audit transaction.
  /// </remarks>
  @Post('entries/:entryId/reverse')
  @CpeRequired(ActionCode.ACCOUNTING_JOURNAL_REVERSE)
  async reverseEntry(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('entryId') entryId: string,
    @Body() dto: ReverseAccountingJournalEntryDto,
  ): Promise<AccountingJournalReversalResult> {
    return this.reversalService.reverseEntry(tenantId, actorUserId, entryId, {
      reason: dto.reason,
      evidenceRef: dto.evidenceRef,
    });
  }
}