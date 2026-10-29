import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AllowViewerReadOnlyPost, ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { GuidedOpenObserveService } from "../permission-diagnostics/guided-open-observe.service";
import { ActionCode } from "../policy-engine/types/action-code.enum";
import { NotificationStatus } from "@prisma/client";

// F02-D-2 dilim 1 (owner devam talimatı 30.10.2026): VIEWER tebligat oluşturamaz, durum yazamaz, durum sorgusu tetikleyemez,
// SMS / e-posta GÖNDEREMEZ. Ölçülen boşluk: bu denetleyici yalnız JWT taşıyordu; servis katmanında rol kontrolü YOK
// (NotificationService). Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard` (JwtAuthGuard'dan SONRA).
// Okuma uçları ve saf şablon üretimi (collection-templates: DB okumaz/yazmaz, kaynaktan doğrulandı) DEĞİŞMEZ.
@Controller("notifications")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    // P2b-2: Guided-Open observe adapter (diagnostic only; engelleme yok)
    private guidedOpenObserve: GuidedOpenObserveService,
  ) {}

  // Dosya için tebligatları getir
  @Get("case/:caseId")
  async findByCaseId(@CurrentUser("tenantId") tenantId: string, @Param("caseId") caseId: string) {
    return this.notificationService.findByCaseId(tenantId, caseId);
  }

  // Ödeme emri tebligatı oluştur
  @Post("case/:caseId/payment-order")
  async createPaymentOrder(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Body() body: { tcNo: string; name: string; address?: string }
  ) {
    return this.notificationService.createPaymentOrderNotification(tenantId, caseId, body);
  }

  // Tebligat durumunu güncelle
  @Put(":id/status")
  async updateStatus(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: { status: NotificationStatus; deliveredAt?: string; errorMessage?: string }
  ) {
    return this.notificationService.updateStatus(tenantId, id, body.status, {
      deliveredAt: body.deliveredAt ? new Date(body.deliveredAt) : undefined,
      errorMessage: body.errorMessage,
    });
  }

  // E-Tebligat durumu kontrol et
  @Post(":id/check-status")
  async checkStatus(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.notificationService.checkETebligatStatus(tenantId, id);
  }

  // Ödeme süresi bilgisi
  @Get("case/:caseId/payment-deadline")
  async getPaymentDeadline(@CurrentUser("tenantId") tenantId: string, @Param("caseId") caseId: string) {
    return this.notificationService.getPaymentDeadline(tenantId, caseId);
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
    return this.notificationService.sendSMS(tenantId, caseId, body.phone, body.message);
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
      tenantId,
      caseId,
      body.email,
      body.subject,
      body.content
    );
  }

  // Bekleyen tebligatlar
  @Get("pending")
  async findPending(@CurrentUser("tenantId") tenantId: string) {
    return this.notificationService.findPending(tenantId);
  }

  // Süresi dolan tebligatlar
  @Get("expired")
  async findExpired(@CurrentUser("tenantId") tenantId: string) {
    return this.notificationService.findExpired(tenantId);
  }

  // İstatistikler
  @Get("stats")
  async getStats(@CurrentUser("tenantId") tenantId: string) {
    return this.notificationService.getStats(tenantId);
  }

  // ==================== TAHSİLAT BİLDİRİMİ ŞABLONLARI ====================

  /**
   * Tahsilat bildirimi şablonlarını oluştur (SMS ve E-posta)
   * POST /notifications/collection-templates
   */
  @Post("collection-templates")
  @AllowViewerReadOnlyPost() // saf şablon üretimi: DB okumaz/yazmaz, dış çağrı yok (notification.service.ts getCollectionTemplates — kaynaktan doğrulandı)
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
