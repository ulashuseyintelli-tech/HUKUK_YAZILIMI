import { Controller, Get, Post, Param, Body, UseGuards } from "@nestjs/common";
import { AutomationService } from "./automation.service";
import { WorkflowEngine } from "./workflow-engine.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("automation")
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(
    private automationService: AutomationService,
    private workflowEngine: WorkflowEngine
  ) {}

  // Otomasyon istatistikleri
  @Get("stats")
  async getStats(@CurrentUser() user: any) {
    return this.automationService.getAutomationStats(user.tenantId);
  }

  // Dosya için otomatik modu aç/kapat
  @Post("cases/:id/toggle-auto")
  async toggleAutoMode(
    @Param("id") caseId: string,
    @Body() body: { enabled: boolean }
  ) {
    await this.automationService.toggleAutoMode(caseId, body.enabled);
    return { success: true, isAutoMode: body.enabled };
  }

  // Dosyayı manuel olarak işle
  @Post("cases/:id/process")
  async processCase(@CurrentUser() user: any, @Param("id") caseId: string) {
    await this.automationService.processCaseManually(caseId, user.tenantId);
    return { success: true, message: "Case processed" };
  }

  // Dosya için bağlam bilgisi al
  @Get("cases/:id/context")
  async getCaseContext(@CurrentUser() user: any, @Param("id") caseId: string) {
    return this.workflowEngine.buildContext(caseId, user.tenantId);
  }

  // Dosya için sonraki işlem zamanını hesapla
  @Get("cases/:id/next-action")
  async getNextAction(@CurrentUser() user: any, @Param("id") caseId: string) {
    const nextActionAt =
      await this.workflowEngine.calculateNextActionTime(caseId, user.tenantId);
    return { nextActionAt };
  }
}
