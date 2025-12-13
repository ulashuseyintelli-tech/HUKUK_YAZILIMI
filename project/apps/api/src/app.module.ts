import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UserModule } from "./modules/user/user.module";
import { TenantModule } from "./modules/tenant/tenant.module";
import { CaseModule } from "./modules/case/case.module";
import { DebtorModule } from "./modules/debtor/debtor.module";
import { TaskModule } from "./modules/task/task.module";
import { ClientModule } from "./modules/client/client.module";
import { LawyerModule } from "./modules/lawyer/lawyer.module";
import { FormTypeModule } from "./modules/form-type/form-type.module";
import { AutomationModule } from "./modules/automation/automation.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { DocumentModule } from "./modules/document/document.module";
import { RiskModule } from "./modules/risk/risk.module";
import { AiModule } from "./modules/ai/ai.module";
import { CaseStatusModule } from "./modules/case-status/case-status.module";
import { ExecutionOfficeModule } from "./modules/execution-office/execution-office.module";
import { UyapModule } from "./modules/uyap/uyap.module";
import { SchedulerModule } from "./modules/scheduler/scheduler.module";
import { RuleEngineModule } from "./modules/rule-engine/rule-engine.module";
import { OcrModule } from "./modules/ocr/ocr.module";
import { LookupModule } from "./modules/lookup/lookup.module";
import { GroupModule } from "./modules/group/group.module";
import { ReportModule } from "./modules/report/report.module";
import { OfficeModule } from "./modules/office/office.module";
import { StaffModule } from "./modules/staff/staff.module";
import { ClientNotificationModule } from "./modules/client-notification/client-notification.module";
import { GreetingModule } from "./modules/greeting/greeting.module";
import { ExportImportModule } from "./modules/export-import/export-import.module";
import { PoaModule } from "./modules/poa/poa.module";
import { PortalModule } from "./modules/portal/portal.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { AuditModule } from "./modules/audit/audit.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UserModule,
    TenantModule,
    CaseModule,
    DebtorModule,
    TaskModule,
    ClientModule,
    LawyerModule,
    FormTypeModule,
    AutomationModule,
    NotificationModule,
    DocumentModule,
    RiskModule,
    AiModule,
    CaseStatusModule,
    ExecutionOfficeModule,
    UyapModule,
    SchedulerModule,
    RuleEngineModule,
    OcrModule,
    LookupModule,
    GroupModule,
    ReportModule,
    OfficeModule,
    StaffModule,
    ClientNotificationModule,
    GreetingModule,
    ExportImportModule,
    PoaModule,
    PortalModule,
    CalendarModule,
    AuditModule,
  ],
})
export class AppModule {}
