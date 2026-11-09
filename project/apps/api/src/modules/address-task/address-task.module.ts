import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClientNotificationModule } from '../client-notification/client-notification.module';
import { AddressTaskService } from './address-task.service';
import { AddressTaskController } from './address-task.controller';
import { AddressTaskSchedulerService } from './address-task-scheduler.service';
import { CaseDebtorLifecycleGuardModule } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.module';
// F02 P3 tarama S4: okuma kapıları ve liste satır süzgeci bu servisi ister; yoksa bayrak açıkken 403.
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [PrismaModule, ClientNotificationModule, CaseDebtorLifecycleGuardModule, CaseViewScopeModule],
  controllers: [AddressTaskController],
  providers: [AddressTaskService, AddressTaskSchedulerService],
  exports: [AddressTaskService, AddressTaskSchedulerService],
})
export class AddressTaskModule {}
