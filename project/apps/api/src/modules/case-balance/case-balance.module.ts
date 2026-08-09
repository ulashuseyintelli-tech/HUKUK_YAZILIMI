import { Module } from '@nestjs/common';
import { CaseBalanceService } from './case-balance.service';
import { CaseBalanceController } from './case-balance.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { AccountingJournalWriterService } from '../accounting-journal';
// C1-B05-B: typed EXPENSE_ACTUAL posting → QUEUED delivery-intent + commit-sonrası dispatch.
// ClientNotificationModule bu modülü import ETMEZ (döngü yok; doğrulandı).
import { ClientNotificationModule } from '@/modules/client-notification/client-notification.module';

@Module({
  imports: [PrismaModule, ClientNotificationModule],
  controllers: [CaseBalanceController],
  providers: [CaseBalanceService, AccountingJournalWriterService],
  exports: [CaseBalanceService],
})
export class CaseBalanceModule {}
