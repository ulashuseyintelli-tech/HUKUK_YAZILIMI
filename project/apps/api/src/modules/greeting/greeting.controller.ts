import { Controller, Get, Post, Put, Body, Param, UseGuards } from "@nestjs/common";
import { GreetingService } from "./greeting.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UpsertSpecialDayDto } from "./dto/upsert-special-day.dto";

@Controller("greetings")
@UseGuards(JwtAuthGuard)
export class GreetingController {
  constructor(private service: GreetingService) {}

  // Özel günleri listele
  @Get("special-days")
  getSpecialDays(@CurrentUser("tenantId") tenantId: string) {
    return this.service.getSpecialDays(tenantId);
  }

  // Özel gün ekle/güncelle
  @Post("special-days")
  upsertSpecialDay(
    @CurrentUser("tenantId") tenantId: string,
    @Body() data: UpsertSpecialDayDto
  ) {
    return this.service.upsertSpecialDay(tenantId, data);
  }

  // Varsayılan özel günleri oluştur
  @Post("special-days/create-defaults")
  createDefaultSpecialDays(@CurrentUser("tenantId") tenantId: string) {
    return this.service.createDefaultSpecialDays(tenantId);
  }

  // Bugünkü tebrik edilecekleri getir
  @Get("today")
  getTodayGreetings(@CurrentUser("tenantId") tenantId: string) {
    return this.service.findTodayGreetings(tenantId);
  }

  // Manuel tebrik gönder
  @Post("send")
  sendGreeting(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() data: {
      clientId: string;
      type: string; // BIRTHDAY, FOUNDING_ANNIVERSARY, POA_ANNIVERSARY, HOLIDAY
      channel: string; // EMAIL, SMS, BOTH
      specialDayId?: string;
    }
  ) {
    return this.service.sendGreeting(tenantId, userId, data.clientId, data.type, data.channel, data.specialDayId);
  }
}
