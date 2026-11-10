import { Controller, Get, Post, Param, Body, UseGuards, Optional } from "@nestjs/common";
import { AutomationService } from "./automation.service";
import { WorkflowEngine } from "./workflow-engine.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CaseViewScoped } from "../case/case-view-scope.guard";
import { CaseViewScopeService, requireCaseViewScope } from "../case/case-view-scope.service";

// F02-D-2 dilim 5 (owner ek talimatı 30.10.2026): VIEWER otomatik modu açamaz / dosya işleyemez (2 yazma). Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard`; okuma uçları DEĞİŞMEZ.
@Controller("automation")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class AutomationController {
  constructor(
    private automationService: AutomationService,
    private workflowEngine: WorkflowEngine,
    @Optional() private readonly caseViewScope?: CaseViewScopeService,
  ) {}

  // Otomasyon istatistikleri
  @Get("stats")
  async getStats(@CurrentUser() user: any) {
    // S6: sayaçlar ve son otomatik kararlar yalnız aktörün görebildiği dosyalardan üretilir.
    const caseFilter = await requireCaseViewScope(this.caseViewScope)?.caseRowFilter(user.tenantId, user.id);
    return caseFilter ? this.automationService.getAutomationStats(user.tenantId, caseFilter) : this.automationService.getAutomationStats(user.tenantId); // bayrak kapalı: bugünkü çağrı aynen
  }

  // Dosya için otomatik modu aç/kapat
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - Nest Router -> POST /automation/cases/:id/toggle-auto (JWT kullanıcısının tenantId'si zorunlu geçer)
  /// </remarks>
  @Post("cases/:id/toggle-auto")
  async toggleAutoMode(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") caseId: string,
    @Body() body: { enabled: boolean }
  ) {
    await this.automationService.toggleAutoMode(caseId, body.enabled, tenantId);
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
  @CaseViewScoped("id") // F02 P3 tarama S5–S7: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  async getCaseContext(@CurrentUser() user: any, @Param("id") caseId: string) {
    return this.workflowEngine.buildContext(caseId, user.tenantId);
  }

  // Dosya için sonraki işlem zamanını hesapla
  @Get("cases/:id/next-action")
  @CaseViewScoped("id") // F02 P3 tarama S5–S7: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  async getNextAction(@CurrentUser() user: any, @Param("id") caseId: string) {
    const nextActionAt =
      await this.workflowEngine.calculateNextActionTime(caseId, user.tenantId);
    return { nextActionAt };
  }
}
