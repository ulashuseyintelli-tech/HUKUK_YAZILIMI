import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ClientNotificationService } from "./client-notification.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("client-notifications")
@UseGuards(JwtAuthGuard)
export class ClientNotificationController {
  constructor(private service: ClientNotificationService) {}

  // E-posta gönder
  @Post("send-email")
  sendEmail(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body()
    body: {
      clientId: string;
      caseId?: string;
      type: string;
      subject: string;
      body: string;
      templateId?: string;
    }
  ) {
    return this.service.sendEmail(tenantId, userId, body);
  }

  // SMS gönder
  @Post("send-sms")
  sendSms(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body()
    body: {
      clientId: string;
      caseId?: string;
      type: string;
      body: string;
    }
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
    @Body()
    body: {
      name: string;
      code: string;
      category: string;
      subject: string;
      body: string;
      isDefault?: boolean;
    }
  ) {
    return this.service.createEmailTemplate(tenantId, body);
  }

  // Şablon güncelle
  @Put("templates/:id")
  updateEmailTemplate(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") templateId: string,
    @Body()
    body: {
      name?: string;
      subject?: string;
      body?: string;
      isActive?: boolean;
      isDefault?: boolean;
    }
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
}
