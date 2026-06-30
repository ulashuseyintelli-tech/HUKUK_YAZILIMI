import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingJournalTrialBalanceController } from './accounting-journal-trial-balance.controller';
import { AccountingJournalTrialBalanceService } from './accounting-journal-trial-balance.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountingJournalTrialBalanceController],
  providers: [AccountingJournalTrialBalanceService],
})
export class AccountingJournalTrialBalanceModule {}
