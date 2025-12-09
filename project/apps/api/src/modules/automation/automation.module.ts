import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "../../prisma/prisma.module";
import { AutomationService } from "./automation.service";
import { WorkflowEngine } from "./workflow-engine.service";
import { RuleEngine } from "./rule-engine.service";
import { AutomationController } from "./automation.controller";

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  controllers: [AutomationController],
  providers: [AutomationService, WorkflowEngine, RuleEngine],
  exports: [AutomationService, WorkflowEngine],
})
export class AutomationModule {}
