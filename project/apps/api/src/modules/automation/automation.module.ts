import { Module, forwardRef } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "../../prisma/prisma.module";
import { AutomationService } from "./automation.service";
import { WorkflowEngine } from "./workflow-engine.service";
import { RuleEngine } from "./rule-engine.service";
import { AutomationController } from "./automation.controller";
import { ExpenseRequestModule } from "../expense-request/expense-request.module";
import { PolicyEngineModule } from "../policy-engine/policy-engine.module";
import { EscalationModule } from "../escalation/escalation.module";
import { PoaExpiryDeliveryService } from "./poa-expiry-delivery.service";

/**
 * Automation Module
 * 
 * Otomatik iÅŸ akÄ±ÅŸÄ± yÃ¶netimi.
 * 
 * CPE Entegrasyonu:
 * - WorkflowEngine tÃ¼m otomatik aksiyonlar iÃ§in CPE gate kontrolÃ¼ yapar
 * - HIGH risk aksiyonlar (haciz, satÄ±ÅŸ) iÃ§in CPE onayÄ± zorunludur
 * 
 * @deprecated RuleEngine (automation) â†’ CPE RuleEngine'e taÅŸÄ±ndÄ±
 * @see ARCHITECTURE.md
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    forwardRef(() => ExpenseRequestModule),
    forwardRef(() => PolicyEngineModule), // CPE entegrasyonu iÃ§in
    EscalationModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationService, WorkflowEngine, RuleEngine, PoaExpiryDeliveryService],
  exports: [AutomationService, WorkflowEngine],
})
export class AutomationModule {}
