import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { SchedulerMetricsService } from './scheduler-metrics.service';
import { TebligatModule } from '../tebligat/tebligat.module'; // PR-S2: cron tebligat senkronu ortak yola alındı
import { CaseDebtorLifecycleGuardModule } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.module'; // P1-I13 (R02-B): passive CaseDebtor icin yeni is uretimini durdurur
import { OfficeApprovalModule } from '../office-approval/office-approval.module'; // F02: manuel tetik yetkisi (I02-R3 elevated esigi = isApproverEligible)

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    TebligatModule, // PR-S2: TebligatService inject (cycle yok: tebligat→scheduler referansı yok)
    CaseDebtorLifecycleGuardModule, // P1-I13: guard yalnız PrismaModule'e bağımlı, cycle yok
    OfficeApprovalModule, // F02: yalniz Prisma/DomainEventIngest/Audit/Config'e bagimli, scheduler'a referansi yok → cycle yok
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService, SchedulerMetricsService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
