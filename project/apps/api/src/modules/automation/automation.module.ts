import { Module, forwardRef } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "../../prisma/prisma.module";
import { AutomationService } from "./automation.service";
import { WorkflowEngine } from "./workflow-engine.service";
import { RuleEngine } from "./rule-engine.service";
import { AutomationController } from "./automation.controller";
import { ExpenseRequestModule } from "../expense-request/expense-request.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    forwardRef(() => ExpenseRequestModule),
  ],
  controllers: [AutomationController],
  providers: [AutomationService, WorkflowEngine, RuleEngine],
  exports: [AutomationService, WorkflowEngine],
})
export class AutomationModule {}
