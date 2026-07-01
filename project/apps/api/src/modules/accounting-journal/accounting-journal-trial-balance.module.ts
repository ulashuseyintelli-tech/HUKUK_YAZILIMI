import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingJournalCutoverReadinessController } from './accounting-journal-cutover-readiness.controller';
import { AccountingJournalCutoverReadinessService } from './accounting-journal-cutover-readiness.service';
import { AccountingJournalFinancialStatementController } from './accounting-journal-financial-statement.controller';
import { AccountingJournalFinancialStatementProjectionService } from './accounting-journal-financial-statement.projection.service';
import { AccountingJournalLegalShadowCompareService } from './accounting-journal-legal-shadow-compare.service';
import { AccountingJournalTrialBalanceController } from './accounting-journal-trial-balance.controller';
import { AccountingJournalTrialBalanceService } from './accounting-journal-trial-balance.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    AccountingJournalTrialBalanceController,
    AccountingJournalCutoverReadinessController,
    AccountingJournalFinancialStatementController,
  ],
  providers: [
    AccountingJournalTrialBalanceService,
    AccountingJournalLegalShadowCompareService,
    AccountingJournalCutoverReadinessService,
    AccountingJournalFinancialStatementProjectionService,
  ],
  exports: [AccountingJournalCutoverReadinessService],
})
export class AccountingJournalTrialBalanceModule {}
