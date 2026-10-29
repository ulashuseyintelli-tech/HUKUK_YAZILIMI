import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { DebtorCommunicationService } from "./communication.service";
import { SendSmsDto, SendEmailDto, LogPhoneCallDto } from "./dto/communication.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

// F02-D-2 dilim 1 (owner devam talimatı 30.10.2026): VIEWER borçluya SMS / e-posta GÖNDEREMEZ, çağrı kaydı yazamaz. Ölçülen
// boşluk: yalnız JWT; servis (DebtorCommunicationService) rol sormuyor — debtorCommunication.create + gönderim. Kapalı kural
// OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard`. Okuma uçları (geçmiş, şablonlar) DEĞİŞMEZ.
@Controller()
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class CommunicationController {
  constructor(private communicationService: DebtorCommunicationService) {}

  // ==================== SEND COMMUNICATIONS ====================

  @Post("debtors/:debtorId/communications/sms")
  sendSms(
    @CurrentUser("tenantId") tenantId: string,
    @Param("debtorId") debtorId: string,
    @Body() dto: SendSmsDto
  ) {
    return this.communicationService.sendSms(tenantId, debtorId, dto);
  }

  @Post("debtors/:debtorId/communications/email")
  sendEmail(
    @CurrentUser("tenantId") tenantId: string,
    @Param("debtorId") debtorId: string,
    @Body() dto: SendEmailDto
  ) {
    return this.communicationService.sendEmail(tenantId, debtorId, dto);
  }

  @Post("debtors/:debtorId/communications/call")
  logPhoneCall(
    @CurrentUser("tenantId") tenantId: string,
    @Param("debtorId") debtorId: string,
    @Body() dto: LogPhoneCallDto
  ) {
    return this.communicationService.logPhoneCall(tenantId, debtorId, dto);
  }

  // ==================== HISTORY ====================

  @Get("debtors/:debtorId/communications")
  getCommunicationHistory(
    @CurrentUser("tenantId") tenantId: string,
    @Param("debtorId") debtorId: string,
    @Query("caseId") caseId?: string,
    @Query("channel") channel?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.communicationService.getCommunicationHistory(tenantId, debtorId, {
      caseId,
      channel,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  // ==================== TEMPLATES ====================

  @Get("communication-templates")
  getTemplates() {
    return this.communicationService.getMessageTemplates();
  }
}
