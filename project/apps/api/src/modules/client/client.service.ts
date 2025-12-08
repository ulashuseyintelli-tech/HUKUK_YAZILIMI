import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class ClientService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.client.findMany({
      where: { tenantId, isActive: true },
      include: { _count: { select: { cases: true } } },
      orderBy: { name: "asc" },
    });
  }

  async findOne(tenantId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId },
      include: { cases: { take: 10, orderBy: { createdAt: "desc" } } },
    });

    if (!client) throw new NotFoundException("Müvekkil bulunamadı");
    return client;
  }

  async create(tenantId: string, data: any) {
    return this.prisma.client.create({ data: { tenantId, ...data } });
  }

  async update(tenantId: string, id: string, data: any) {
    await this.findOne(tenantId, id);
    return this.prisma.client.update({ where: { id }, data });
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.client.update({ where: { id }, data: { isActive: false } });
  }
}
