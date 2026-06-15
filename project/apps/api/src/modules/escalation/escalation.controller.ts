import { Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OperationalEscalationService } from "./operational-escalation.service";

@Controller("escalation")
@UseGuards(JwtAuthGuard)
export class EscalationController {
  constructor(private service: OperationalEscalationService) {}

  /**
   * Manuel tetik (test/operasyon): saat başı cron'u beklemeden eskalasyon turunu çalıştırır.
   * Sonuç: { processed, notified, skipped, failed } (PR-3b.2: failed = sağlayıcı hatası → retry edilir).
   */
  @Post("run")
  run() {
    return this.service.processEscalations();
  }
}
