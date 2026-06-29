import { Module } from '@nestjs/common';
import { OfficeApprovalExecutorService } from './office-approval-executor.service';
import { OfficeApprovalExecutorCronService } from './office-approval-executor-cron.service';
import { OfficeApprovalModule } from './office-approval.module';
import { CaseStatusModule } from '../case-status/case-status.module';
import { PrismaModule } from '../../prisma/prisma.module';

// P4-5A/P4-5B — CHANGE_STATUS deferred executor + automation modülü.
//
// ⚠️ AYRI modül (executor OfficeApprovalModule providers'ına EKLENMEDİ) — KASITLI: CaseStatusModule ZATEN
//    OfficeApprovalModule'ü import ediyor (P4-2 shadow için). OfficeApprovalModule'e CaseStatusModule import etmek
//    CIRCULAR module dependency yaratırdı (forwardRef gerektirir + P4-2 case-status.module dosyasını değiştirirdi).
//    Bu tüketici modül her ikisini de import eder → asiklik DAG korunur, P4-2 wiring'e DOKUNULMAZ.
//
// P4-5A: internal callable OfficeApprovalExecutorService (route/cron YOK).
// P4-5B: OfficeApprovalExecutorCronService (config-gated @Cron; default-OFF). ScheduleModule.forRoot zaten app.module'de
//    global → re-import YOK. Cron service executor + PrismaService injekte eder; CaseStatusModule'ü DOĞRUDAN import etmez
//    (executor zaten köprülüyor) → yeni circular-dep YOK. Public route YOK.
@Module({
  imports: [PrismaModule, OfficeApprovalModule, CaseStatusModule],
  providers: [OfficeApprovalExecutorService, OfficeApprovalExecutorCronService],
  exports: [OfficeApprovalExecutorService],
})
export class OfficeApprovalExecutorModule {}
