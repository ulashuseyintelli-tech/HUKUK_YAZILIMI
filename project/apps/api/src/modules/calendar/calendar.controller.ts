import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Optional } from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CaseViewScopeService, requireCaseViewScope } from "../case/case-view-scope.service";

// F02-D-2 dilim 5 (owner ek talimatı 30.10.2026): VIEWER takvim olayı oluşturamaz / güncelleyemez / silemez (3 yazma). Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard`; okuma uçları DEĞİŞMEZ.
@Controller("calendar")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class CalendarController {
  constructor(
    private readonly service: CalendarService,
    @Optional() private readonly caseViewScope?: CaseViewScopeService,
  ) {}

  /** F02 P3 tarama S7: takvim kaydı dosyaya FK'siz bağlıdır → görünür dosyalar aday kimliklerden çözülür (bayrak kapalı → undefined). */
  private caseVisibility(tenantId: string, actorUserId?: string) {
    const viewScope = requireCaseViewScope(this.caseViewScope);
    return viewScope ? (caseIds: Array<string | null>) => viewScope.visibleCaseIds(tenantId, actorUserId, caseIds) : undefined;
  }
  @Get("events")
  async getEvents(
    @CurrentUser("tenantId") tenantId: string,
    @Query("year") year: string,
    @Query("month") month: string,
    @CurrentUser("id") actorUserId?: string
  ) {
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;
    // S7: dosyalı takvim kayıtları yalnız görünen dosyalarla; dosyasız kayıtlar mevcut yetkisinde kalır.
    return this.service.getEvents(tenantId, y, m, this.caseVisibility(tenantId, actorUserId));
  }

  @Post("events")
  async createEvent(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() body: {
      title: string;
      description?: string;
      date: string;
      time?: string;
      type: string;
      caseId?: string;
      location?: string;
    }
  ) {
    return this.service.createEvent(tenantId, userId, body);
  }

  @Put("events/:id")
  async updateEvent(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: {
      title?: string;
      description?: string;
      date?: string;
      time?: string;
      type?: string;
      location?: string;
      isCompleted?: boolean;
    }
  ) {
    return this.service.updateEvent(tenantId, id, body);
  }

  @Delete("events/:id")
  async deleteEvent(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.service.deleteEvent(tenantId, id);
  }

  @Get("upcoming")
  async getUpcomingEvents(
    @CurrentUser("tenantId") tenantId: string,
    @Query("days") days?: string,
    @CurrentUser("id") actorUserId?: string
  ) {
    return this.service.getUpcomingEvents(tenantId, parseInt(days || "7"), this.caseVisibility(tenantId, actorUserId)); // S7
  }
}
