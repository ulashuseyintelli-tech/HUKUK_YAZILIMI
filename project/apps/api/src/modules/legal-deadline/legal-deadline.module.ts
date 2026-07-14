import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LegalDeadlineService } from "./legal-deadline.service";
import { ProceedingClassificationService } from "./proceeding-classification.service";
import { LegalPeriodCalculationService } from "./legal-period-calculation.service";

/**
 * MPB-028(a) PR-2/PR-3C/PR-4/PR-5 — kanonik hukuki süre hesabı foundation modülü.
 * PR-4 ile ilk consumer (DebtorModule) bu modülü import etmeye başladı — yalnız
 * `LEGAL_TIME_CUTOVER` flag'i altında, read-only. PR-5 ile ikinci consumer
 * (AutomationModule/WorkflowEngine.calculateNextActionTime) eklendi — dar kapsam,
 * yalnız PAYMENT_ORDER/WAITING_RESPONSE dalı; `NotificationService.getPaymentDeadline`
 * (gerçek consumer'ı yok, owner kararıyla kapsam dışı bırakıldı) ve
 * `RuleEngine.checkNotificationExpiry`/Scheduler ENFORCEMENT cutover'ları (itiraz fact'i
 * kanonik olarak modellenmeden dokunulamaz, ayrı workstream) hâlâ ayrı kapsamdadır.
 * Hiçbir controller/endpoint bu servisleri doğrudan dışarıya açmaz.
 */
@Module({
  imports: [PrismaModule],
  providers: [LegalDeadlineService, ProceedingClassificationService, LegalPeriodCalculationService],
  exports: [LegalDeadlineService, ProceedingClassificationService, LegalPeriodCalculationService],
})
export class LegalDeadlineModule {}
