import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { ClientNotificationService } from "./client-notification.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CreateClientNotificationTemplateDto,
  SendClientNotificationBulkEmailDto,
  SendClientNotificationEmailDto,
  SendClientNotificationSmsDto,
  UpdateClientNotificationTemplateDto,
} from "./dto/client-notification.dto";

@Controller("client-notifications")
@UseGuards(JwtAuthGuard)
export class ClientNotificationController {
  constructor(private service: ClientNotificationService) {}

  // Bildirim Kontrol Merkezi — sağlık/özet/teşhis. ADMIN gate: teslimat istatistiği ve hata
  // mesajları operasyonel/hassas veridir, salt-JWT yetmez (office.controller / reports ile aynı çizgi).
  @Get("overview")
  async getOverview(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("role") role: string
  ) {
    if (role !== "ADMIN") {
      throw new ForbiddenException(
        "Bildirim Kontrol Merkezi'ne yalnız yönetici (ADMIN) erişebilir"
      );
    }
    const data = await this.service.getNotificationOverview(tenantId);
    return { success: true, data };
  }

  // E-posta gönder
  @Post("send-email")
  sendEmail(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() body: SendClientNotificationEmailDto
  ) {
    return this.service.sendEmail(tenantId, userId, body);
  }

  // SMS gönder
  @Post("send-sms")
  sendSms(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() body: SendClientNotificationSmsDto
  ) {
    return this.service.sendSms(tenantId, userId, body);
  }

  // Müvekkilin bildirim geçmişi
  @Get("client/:clientId")
  getClientNotifications(
    @CurrentUser("tenantId") tenantId: string,
    @Param("clientId") clientId: string
  ) {
    return this.service.getClientNotifications(tenantId, clientId);
  }

  // Dosya bazlı bildirimler
  @Get("case/:caseId")
  getCaseNotifications(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string
  ) {
    return this.service.getCaseNotifications(tenantId, caseId);
  }

  // E-posta şablonları
  @Get("templates")
  getEmailTemplates(
    @CurrentUser("tenantId") tenantId: string,
    @Query("category") category?: string
  ) {
    return this.service.getEmailTemplates(tenantId, category);
  }

  // Şablon oluştur
  @Post("templates")
  createEmailTemplate(
    @CurrentUser("tenantId") tenantId: string,
    @Body() body: CreateClientNotificationTemplateDto
  ) {
    return this.service.createEmailTemplate(tenantId, body);
  }

  // Şablon güncelle
  @Put("templates/:id")
  updateEmailTemplate(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") templateId: string,
    @Body() body: UpdateClientNotificationTemplateDto
  ) {
    return this.service.updateEmailTemplate(tenantId, templateId, body);
  }

  // Varsayılan şablonları oluştur
  @Post("templates/create-defaults")
  createDefaultTemplates(@CurrentUser("tenantId") tenantId: string) {
    return this.service.createDefaultTemplates(tenantId);
  }

  // SMTP bağlantı testi
  @Post("test-smtp")
  testSmtpConnection(@CurrentUser("tenantId") tenantId: string) {
    return this.service.testSmtpConnection(tenantId);
  }

  // SMS bağlantı testi
  @Post("test-sms")
  testSmsConnection(@CurrentUser("tenantId") tenantId: string) {
    return this.service.testSmsConnection(tenantId);
  }

  // Gerçek Test Gönderimi — seçili müvekkile GERÇEK [TEST] bildirimi (bağlantı testinden AYRI).
  // ADMIN gate + confirm zorunlu (yanlışlıkla gerçek gönderimi engeller). Mevcut send yolu kullanılır;
  // sonuç ClientNotification'a loglanır ve "Son Gönderimler"de Test etiketiyle görünür.
  @Post("test-send")
  async testSend(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
    @Body() body: { clientId?: string; channel?: "EMAIL" | "SMS"; confirm?: boolean }
  ) {
    if (role !== "ADMIN") {
      throw new ForbiddenException(
        "Gerçek test gönderimi yalnız yönetici (ADMIN) tarafından yapılabilir"
      );
    }
    if (body?.confirm !== true) {
      throw new BadRequestException(
        "Onay gerekli: bu işlem seçili müvekkilin gerçek adresine GERÇEK bildirim gönderir"
      );
    }
    if (!body?.clientId) {
      throw new BadRequestException("Müvekkil seçilmedi");
    }
    if (body?.channel !== "EMAIL" && body?.channel !== "SMS") {
      throw new BadRequestException("Geçersiz kanal (EMAIL veya SMS olmalı)");
    }
    const data = await this.service.testSend(tenantId, userId, {
      clientId: body.clientId,
      channel: body.channel,
    });
    return { success: data.success, data };
  }

  // Toplu e-posta gönder
  @Post("bulk-email")
  sendBulkEmail(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() body: SendClientNotificationBulkEmailDto
  ) {
    return this.service.sendBulkEmail(tenantId, userId, body);
  }
}
