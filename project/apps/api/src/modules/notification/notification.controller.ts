import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { GuidedOpenObserveService } from "../permission-diagnostics/guided-open-observe.service";
import { ActionCode } from "../policy-engine/types/action-code.enum";
import { NotificationStatus } from "@prisma/client";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    // P2b-2: Guided-Open observe adapter (diagnostic only; engelleme yok)
    private guidedOpenObserve: GuidedOpenObserveService,
  ) {}

  // Dosya için tebligatları getir
  @Get("case/:caseId")
  async findByCaseId(@Param("caseId") caseId: string) {
    return this.notificationService.findByCaseId(caseId);
  }

  // Ödeme emri tebligatı oluştur
  @Post("case/:caseId/payment-order")
  async createPaymentOrder(
    @Param("caseId") caseId: string,
    @Body() body: { tcNo: string; name: string; address?: string }
  ) {
    return this.notificationService.createPaymentOrderNotification(caseId, body);
  }

  // Tebligat durumunu güncelle
  @Put(":id/status")
  async updateStatus(
    @Param("id") id: string,
    @Body() body: { status: NotificationStatus; deliveredAt?: string; errorMessage?: string }
  ) {
    return this.notificationService.updateStatus(id, body.status, {
      deliveredAt: body.deliveredAt ? new Date(body.deliveredAt) : undefined,
      errorMessage: body.errorMessage,
    });
  }

  // E-Tebligat durumu kontrol et
  @Post(":id/check-status")
  async checkStatus(@Param("id") id: string) {
    return this.notificationService.checkETebligatStatus(id);
  }

  // Ödeme süresi bilgisi
  @Get("case/:caseId/payment-deadline")
  async getPaymentDeadline(@Param("caseId") caseId: string) {
    return this.notificationService.getPaymentDeadline(caseId);
  }

  // SMS gönder
  @Post("case/:caseId/sms")
  async sendSMS(
    @CurrentUser("id") userId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Body() body: { phone: string; message: string }
  ) {
    // P2b-2 observe (PRE-action; JwtAuthGuard'dan SONRA; engelleme YOK, response değişmez).
    // GİZLİLİK: body.phone / body.message observe'a GEÇMEZ (yalnız actionCode + caseId referansı).
    await this.guidedOpenObserve.observe({
      actorUserId: userId,
      tenantId,
      caseId,
      actionCode: ActionCode.SEND_NOTIFICATION,
    });
    return this.notificationService.sendSMS(caseId, body.phone, body.message);
  }

  // Email gönder
  @Post("case/:caseId/email")
  async sendEmail(
    @CurrentUser("id") userId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Body() body: { email: string; subject: string; content: string }
  ) {
    // P2b-2 observe (PRE-action; JwtAuthGuard'dan SONRA; engelleme YOK, response değişmez).
    // GİZLİLİK: body.email / subject / content observe'a GEÇMEZ (yalnız actionCode + caseId referansı).
    await this.guidedOpenObserve.observe({
      actorUserId: userId,
      tenantId,
      caseId,
      actionCode: ActionCode.SEND_NOTIFICATION,
    });
    return this.notificationService.sendEmail(
      caseId,
      body.email,
      body.subject,
      body.content
    );
  }

  // Bekleyen tebligatlar
  @Get("pending")
  async findPending() {
    return this.notificationService.findPending();
  }

  // Süresi dolan tebligatlar
  @Get("expired")
  async findExpired() {
    return this.notificationService.findExpired();
  }

  // İstatistikler
  @Get("stats")
  async getStats(@Query("tenantId") tenantId?: string) {
    return this.notificationService.getStats(tenantId);
  }

  // ==================== TAHSİLAT BİLDİRİMİ ŞABLONLARI ====================

  /**
   * Tahsilat bildirimi şablonlarını oluştur (SMS ve E-posta)
   * POST /notifications/collection-templates
   */
  @Post("collection-templates")
  async getCollectionTemplates(
    @Body() body: {
      debtorName: string;
      amount: number;
      currency: string;
      dueDate?: string;
      documentNo?: string;
      documentType?: string;
      creditorName?: string;
      fileNumber?: string;
      bankName?: string;
      iban?: string;
    }
  ) {
    const templates = this.notificationService.getCollectionTemplates(body);
    return {
      success: true,
      data: templates,
    };
  }
}
