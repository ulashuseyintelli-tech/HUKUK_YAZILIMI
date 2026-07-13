import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LegalDeadlineModule } from "../legal-deadline/legal-deadline.module";
import { LegalTimeShadowService } from "./legal-time-shadow.service";
import { LegalTimeShadowController } from "./legal-time-shadow.controller";

/**
 * MPB-028(a) PR-3 — Shadow-Read + Diff Evidence modülü.
 * Bilinçli olarak dar: hiçbir consumer (WorkflowEngine, Scheduler, NotificationQueue,
 * UI, Automation) import etmez veya bunlar tarafından import edilmez; consumer
 * cutover'ları PR-4/PR-5 kapsamındadır (bu PR'ın dışında). Controller yalnız PR-3
 * Evidence Activation'ın manuel/lokal tetikleme + kanıt okuma yüzeyidir.
 */
@Module({
  imports: [PrismaModule, LegalDeadlineModule],
  controllers: [LegalTimeShadowController],
  providers: [LegalTimeShadowService],
  exports: [LegalTimeShadowService],
})
export class LegalTimeShadowModule {}
