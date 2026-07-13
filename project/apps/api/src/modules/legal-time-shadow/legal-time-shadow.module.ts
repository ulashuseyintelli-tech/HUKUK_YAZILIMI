import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LegalDeadlineModule } from "../legal-deadline/legal-deadline.module";
import { LegalTimeShadowService } from "./legal-time-shadow.service";

/**
 * MPB-028(a) PR-3 — Shadow-Read + Diff Evidence modülü.
 * Bilinçli olarak dar: hiçbir consumer (WorkflowEngine, Scheduler, NotificationQueue,
 * UI, Automation) import etmez veya bunlar tarafından import edilmez; consumer
 * cutover'ları PR-4/PR-5 kapsamındadır (bu PR'ın dışında).
 */
@Module({
  imports: [PrismaModule, LegalDeadlineModule],
  providers: [LegalTimeShadowService],
  exports: [LegalTimeShadowService],
})
export class LegalTimeShadowModule {}
