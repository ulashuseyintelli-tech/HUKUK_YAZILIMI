import { Module, forwardRef } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "../../prisma/prisma.module";
import { AutomationService } from "./automation.service";
import { WorkflowEngine } from "./workflow-engine.service";
import { RuleEngine } from "./rule-engine.service";
import { AutomationController } from "./automation.controller";
import { ExpenseRequestModule } from "../expense-request/expense-request.module";
import { PolicyEngineModule } from "../policy-engine/policy-engine.module";

/**
 * Automation Module
 * 
 * Otomatik iş akışı yönetimi.
 * 
 * CPE Entegrasyonu:
 * - WorkflowEngine tüm otomatik aksiyonlar için CPE gate kontrolü yapar
 * - HIGH risk aksiyonlar (haciz, satış) için CPE onayı zorunludur
 * 
 * @deprecated RuleEngine (automation) → CPE RuleEngine'e taşındı
 * @see ARCHITECTURE.md
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    forwardRef(() => ExpenseRequestModule),
    forwardRef(() => PolicyEngineModule), // CPE entegrasyonu için
  ],
  controllers: [AutomationController],
  providers: [AutomationService, WorkflowEngine, RuleEngine],
  exports: [AutomationService, WorkflowEngine],
})
export class AutomationModule {}
