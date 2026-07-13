import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LegalDeadlineService } from "./legal-deadline.service";
import { ProceedingClassificationService } from "./proceeding-classification.service";
import { LegalPeriodCalculationService } from "./legal-period-calculation.service";

/**
 * MPB-028(a) PR-2/PR-3C — kanonik hukuki süre hesabı foundation modülü.
 * Bilinçli olarak dar: hiçbir consumer (NotificationService, WorkflowEngine, controller)
 * import etmez; cutover ayrı PR'lar (PR-4/PR-5) kapsamındadır. PR-3C'nin
 * ProceedingClassificationService/LegalPeriodCalculationService'i de aynı ilkeyle
 * eklenmiştir — hiçbir controller/endpoint bu servisleri dışarıya açmaz.
 */
@Module({
  imports: [PrismaModule],
  providers: [LegalDeadlineService, ProceedingClassificationService, LegalPeriodCalculationService],
  exports: [LegalDeadlineService, ProceedingClassificationService, LegalPeriodCalculationService],
})
export class LegalDeadlineModule {}
