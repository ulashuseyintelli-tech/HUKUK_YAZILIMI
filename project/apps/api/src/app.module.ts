import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
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
import { SeedModule } from "./modules/seed/seed.module";
import { ErrorLogModule } from "./modules/error-log/error-log.module";
import { PublicInstitutionModule } from "./modules/public-institution/public-institution.module";
import { TebligatModule } from "./modules/tebligat/tebligat.module";
import { CollectionModule } from "./modules/collection/collection.module";
import { ClaimItemModule } from "./modules/claim-item/claim-item.module";
import { ClaimEngineModule } from "./modules/claim-engine/claim-engine.module";
import { FeeEngineModule } from "./modules/fee-engine/fee-engine.module";
import { TemplateEngineModule } from "./modules/template-engine/template-engine.module";
import { ExchangeRateModule } from "./modules/exchange-rate/exchange-rate.module";
import { TariffModule } from "./modules/tariff/tariff.module";
import { PdfModule } from "./modules/pdf/pdf.module";
import { ValidationGateModule } from "./modules/validation-gate/validation-gate.module";
import { CaseInstrumentModule } from "./modules/case-instrument/case-instrument.module";
import { CaseLeaseModule } from "./modules/case-lease/case-lease.module";
import { CaseJudgmentModule } from "./modules/case-judgment/case-judgment.module";
import { CaseCollateralModule } from "./modules/case-collateral/case-collateral.module";
import { ESignModule } from "./modules/esign/esign.module";
import { BankModule } from "./modules/bank/bank.module";
import { SummaryEngineModule } from "./modules/summary-engine/summary-engine.module";
import { PrecautionaryOrderModule } from "./modules/precautionary-order/precautionary-order.module";
import { LimitationEngineModule } from "./modules/limitation-engine/limitation-engine.module";
import { RelatedLawsuitsModule } from "./modules/related-lawsuits/related-lawsuits.module";
import { PaymentInstructionModule } from "./modules/payment-instruction/payment-instruction.module";
import { ExpenseRequestModule } from "./modules/expense-request/expense-request.module";
import { MessageTemplateModule } from "./modules/message-template/message-template.module";
import { CostPackageModule } from "./modules/cost-package/cost-package.module";
import { CaseBalanceModule } from "./modules/case-balance/case-balance.module";
import { StageTriggerModule } from "./modules/stage-trigger/stage-trigger.module";
import { AddressDiscoveryModule } from "./modules/address-discovery/address-discovery.module";
import { AssetQueryModule } from "./modules/asset-query/asset-query.module";
import { UyapExportModule } from "./modules/uyap-export/uyap-export.module";
import { V28EngineModule } from "./modules/icrabot/v28-engine/v28-engine.module";
import { InterestEngineModule } from "./modules/interest-engine/interest-engine.module";
// TODO: IcrabotModule geçici olarak devre dışı - Prisma client regenerate gerekli
// import { IcrabotModule } from "./modules/icrabot/icrabot.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
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
    SeedModule,
    ErrorLogModule,
    PublicInstitutionModule,
    TebligatModule,
    CollectionModule,
    ClaimItemModule,
    ClaimEngineModule,
    FeeEngineModule,
    TemplateEngineModule,
    ExchangeRateModule,
    TariffModule,
    PdfModule,
    ValidationGateModule,
    CaseInstrumentModule,
    CaseLeaseModule,
    CaseJudgmentModule,
    CaseCollateralModule,
    ESignModule,
    BankModule,
    SummaryEngineModule,
    PrecautionaryOrderModule,
    LimitationEngineModule,
    RelatedLawsuitsModule,
    PaymentInstructionModule,
    ExpenseRequestModule,
    MessageTemplateModule,
    CostPackageModule,
    CaseBalanceModule,
    StageTriggerModule,
    AddressDiscoveryModule,
    AssetQueryModule,
    UyapExportModule,
    V28EngineModule,
    InterestEngineModule,
    // IcrabotModule, // TODO: Prisma client regenerate sonrası aktif et
  ],
})
export class AppModule {}
