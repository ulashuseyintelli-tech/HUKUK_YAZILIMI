import { Module } from '@nestjs/common';
import { OfficeApprovalExecutorService } from './office-approval-executor.service';
import { OfficeApprovalModule } from './office-approval.module';
import { CaseStatusModule } from '../case-status/case-status.module';
import { PrismaModule } from '../../prisma/prisma.module';

// P4-5A — CHANGE_STATUS deferred executor modülü.
//
// ⚠️ AYRI modül (executor OfficeApprovalModule providers'ına EKLENMEDİ) — KASITLI: CaseStatusModule ZATEN
//    OfficeApprovalModule'ü import ediyor (P4-2 shadow için). OfficeApprovalModule'e CaseStatusModule import etmek
//    CIRCULAR module dependency yaratırdı (forwardRef gerektirir + P4-2 case-status.module dosyasını değiştirirdi).
//    Bu tüketici modül her ikisini de import eder → asiklik DAG korunur, P4-2 wiring'e DOKUNULMAZ.
//
// Route/cron/frontend YOK (P4-5A). Yalnız internal callable OfficeApprovalExecutorService sağlar + exports eder
// (ileride P4-5B cron/internal caller bu modülü import edip executor'ı injeksiyonla çağırabilir).
@Module({
  imports: [PrismaModule, OfficeApprovalModule, CaseStatusModule],
  providers: [OfficeApprovalExecutorService],
  exports: [OfficeApprovalExecutorService],
})
export class OfficeApprovalExecutorModule {}
