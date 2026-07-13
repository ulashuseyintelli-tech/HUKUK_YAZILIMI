import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LegalDeadlineService } from "./legal-deadline.service";

/**
 * MPB-028(a) PR-2 — kanonik hukuki süre hesabı foundation modülü.
 * Bilinçli olarak dar: hiçbir consumer (NotificationService, WorkflowEngine, controller)
 * import etmez; cutover ayrı PR'lar (PR-4/PR-5) kapsamındadır.
 */
@Module({
  imports: [PrismaModule],
  providers: [LegalDeadlineService],
  exports: [LegalDeadlineService],
})
export class LegalDeadlineModule {}
