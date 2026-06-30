import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingJournalCutoverReadinessController } from './accounting-journal-cutover-readiness.controller';
import { AccountingJournalCutoverReadinessService } from './accounting-journal-cutover-readiness.service';
import { AccountingJournalLegalShadowCompareService } from './accounting-journal-legal-shadow-compare.service';
import { AccountingJournalTrialBalanceController } from './accounting-journal-trial-balance.controller';
import { AccountingJournalTrialBalanceService } from './accounting-journal-trial-balance.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountingJournalTrialBalanceController, AccountingJournalCutoverReadinessController],
  providers: [
    AccountingJournalTrialBalanceService,
    AccountingJournalLegalShadowCompareService,
    AccountingJournalCutoverReadinessService,
  ],
  exports: [AccountingJournalCutoverReadinessService],
})
export class AccountingJournalTrialBalanceModule {}
