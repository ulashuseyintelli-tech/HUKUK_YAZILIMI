import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private prisma: PrismaService) {}

  async getEvents(tenantId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    return this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        date: { gte: startDate, lte: endDate },
      },
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

  async getUpcomingEvents(tenantId: string, days: number = 7) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        date: { gte: now, lte: futureDate },
        isCompleted: false,
      },
      orderBy: { date: "asc" },
      take: 10,
    });
  }
}
