import { Module, forwardRef } from '@nestjs/common';
import { ExpenseRequestController } from './expense-request.controller';
import { ExpenseRequestService } from './expense-request.service';
import { ExpenseCalculatorService } from './expense-calculator.service';
import { ExpenseGateService } from './expense-gate.service';
import { ExpenseNotificationService } from './expense-notification.service';
import { ExpenseViewService } from './expense-view.service';
import { ExpensePaymentReversalContractService } from './expense-payment-reversal-contract.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { CaseBalanceModule } from '@/modules/case-balance/case-balance.module';
import { TariffModule } from '@/modules/tariff/tariff.module';
import { NotificationModule } from '@/modules/notification/notification.module';
import { ClientNotificationModule } from '@/modules/client-notification/client-notification.module';
import { OfficeModule } from '@/modules/office/office.module';
import { ClientSettlementModule } from '@/modules/client-settlement/client-settlement.module';

@Module({
  imports: [PrismaModule, forwardRef(() => CaseBalanceModule), TariffModule, NotificationModule, ClientNotificationModule, OfficeModule, ClientSettlementModule],
  controllers: [ExpenseRequestController],
  providers: [ExpenseRequestService, ExpenseCalculatorService, ExpenseGateService, ExpenseNotificationService, ExpenseViewService, ExpensePaymentReversalContractService],
  exports: [ExpenseRequestService, ExpenseCalculatorService, ExpenseGateService, ExpenseNotificationService, ExpenseViewService, ExpensePaymentReversalContractService],
})
export class ExpenseRequestModule {}
