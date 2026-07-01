import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingJournalCutoverReadinessController } from './accounting-journal-cutover-readiness.controller';
import { AccountingJournalCutoverReadinessService } from './accounting-journal-cutover-readiness.service';
import { AccountingJournalFinancialStatementController } from './accounting-journal-financial-statement.controller';
import { AccountingJournalFinancialStatementProjectionService } from './accounting-journal-financial-statement.projection.service';
import { AccountingJournalLegalShadowCompareService } from './accounting-journal-legal-shadow-compare.service';
import { AccountingJournalReversalController } from './accounting-journal-reversal.controller';
import { AccountingJournalReversalService } from './accounting-journal-reversal.service';
import { AccountingJournalTrialBalanceController } from './accounting-journal-trial-balance.controller';
import { AccountingJournalTrialBalanceService } from './accounting-journal-trial-balance.service';
import { AccountingJournalWriterService } from './accounting-journal.writer';

@Module({
  imports: [PrismaModule],
  controllers: [
    AccountingJournalTrialBalanceController,
    AccountingJournalCutoverReadinessController,
    AccountingJournalFinancialStatementController,
    AccountingJournalReversalController,
  ],
  providers: [
    AccountingJournalTrialBalanceService,
    AccountingJournalLegalShadowCompareService,
    AccountingJournalCutoverReadinessService,
    AccountingJournalFinancialStatementProjectionService,
    AccountingJournalWriterService,
    AccountingJournalReversalService,
  ],
  exports: [AccountingJournalCutoverReadinessService],
})
export class AccountingJournalTrialBalanceModule {}
