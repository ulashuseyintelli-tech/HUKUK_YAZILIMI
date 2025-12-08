import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class LawyerService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, search?: string) {
    const where: any = { tenantId, isActive: true };
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { surname: { contains: search, mode: "insensitive" } },
        { barNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    return this.prisma.lawyer.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  async create(tenantId: string, data: {
    name: string;
    surname: string;
    barNumber?: string;
    barName?: string;
    identityNo?: string;
    email?: string;
    phone?: string;
  }) {
    return this.prisma.lawyer.create({
      data: {
        tenantId,
        ...data,
      },
    });
  }
}
