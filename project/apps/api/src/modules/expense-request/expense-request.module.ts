import { Module, forwardRef } from '@nestjs/common';
import { ExpenseRequestController } from './expense-request.controller';
import { ExpenseRequestService } from './expense-request.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { CaseBalanceModule } from '@/modules/case-balance/case-balance.module';

@Module({
  imports: [PrismaModule, forwardRef(() => CaseBalanceModule)],
  controllers: [ExpenseRequestController],
  providers: [ExpenseRequestService],
  exports: [ExpenseRequestService],
})
export class ExpenseRequestModule {}
