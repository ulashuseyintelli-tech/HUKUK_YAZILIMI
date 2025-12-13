import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("calendar")
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get("events")
  async getEvents(
    @CurrentUser("tenantId") tenantId: string,
    @Query("year") year: string,
    @Query("month") month: string
  ) {
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;
    return this.service.getEvents(tenantId, y, m);
  }

  @Post("events")
  async createEvent(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("sub") userId: string,
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
    @Query("days") days?: string
  ) {
    return this.service.getUpcomingEvents(tenantId, parseInt(days || "7"));
  }
}
