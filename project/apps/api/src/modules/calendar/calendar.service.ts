import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { looseCaseIdWhere } from "../case/case-view-scope.service";

/** F02 P3 tarama S7: aday dosya kimliklerinden aktörün görebildiklerini çözer (`null` → süzme yok). */
export type CaseVisibility = (caseIds: Array<string | null>) => Promise<Set<string> | null>;

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * F02 P3 tarama S7 — takvim kaydı dosyaya FK'siz `caseId` ile bağlıdır: aynı sorgunun aday dosya kimlikleri çözülür,
   * dosyalı kayıtlar yalnız görünen dosyalarla sınırlanır; dosyasız kayıtlar kalır. Verilmezse (bayrak kapalı) süzgeç yok.
   */
  private async caseScope(where: Prisma.CalendarEventWhereInput, caseVisibility?: CaseVisibility) {
    if (!caseVisibility) return {};
    const candidates = await this.prisma.calendarEvent.findMany({ where: { ...where, caseId: { not: null } }, distinct: ["caseId"], select: { caseId: true } });
    const filter = looseCaseIdWhere(await caseVisibility(candidates.map((row) => row.caseId)));
    return filter ? { AND: [filter] } : {};
  }

  async getEvents(tenantId: string, year: number, month: number, caseVisibility?: CaseVisibility) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const where: Prisma.CalendarEventWhereInput = { tenantId, date: { gte: startDate, lte: endDate } };
    return this.prisma.calendarEvent.findMany({
      where: { ...where, ...(await this.caseScope(where, caseVisibility)) },
      orderBy: { date: "asc" },
    });
  }

  async createEvent(tenantId: string, userId: string, data: {
    title: string;
    description?: string;
    date: string;
    time?: string;
    type: string;
    caseId?: string;
    location?: string;
  }) {
    const event = await this.prisma.calendarEvent.create({
      data: {
        tenantId,
        createdById: userId,
        title: data.title,
        description: data.description,
        date: new Date(data.date),
        time: data.time,
        type: data.type,
        caseId: data.caseId,
        location: data.location,
      },
    });

    this.logger.log(`Takvim etkinliği oluşturuldu: ${data.title}`);
    return event;
  }

  async updateEvent(tenantId: string, eventId: string, data: {
    title?: string;
    description?: string;
    date?: string;
    time?: string;
    type?: string;
    location?: string;
    isCompleted?: boolean;
  }) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId },
    });

    if (!event) {
      throw new NotFoundException("Etkinlik bulunamadı");
    }

    return this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        ...data,
        date: data.date ? new Date(data.date) : undefined,
      },
    });
  }

  async deleteEvent(tenantId: string, eventId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId },
    });

    if (!event) {
      throw new NotFoundException("Etkinlik bulunamadı");
    }

    await this.prisma.calendarEvent.delete({
      where: { id: eventId },
    });

    return { success: true };
  }

  async getUpcomingEvents(tenantId: string, days: number = 7, caseVisibility?: CaseVisibility) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const where: Prisma.CalendarEventWhereInput = { tenantId, date: { gte: now, lte: futureDate }, isCompleted: false };
    return this.prisma.calendarEvent.findMany({
      where: { ...where, ...(await this.caseScope(where, caseVisibility)) }, // süzgeç `take`ten ÖNCE uygulanır
      orderBy: { date: "asc" },
      take: 10,
    });
  }
}
