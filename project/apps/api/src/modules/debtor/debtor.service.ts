import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateDebtorDto, UpdateDebtorDto } from "./dto/debtor.dto";

@Injectable()
export class DebtorService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, params?: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 20, search } = params || {};

    const where: any = { tenantId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { identityNo: { contains: search } },
      ];
    }

    const [debtors, total] = await Promise.all([
      this.prisma.debtor.findMany({
        where,
        include: {
          _count: { select: { caseDebtors: true, assets: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.debtor.count({ where }),
    ]);

    return {
      data: debtors,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id, tenantId },
      include: {
        caseDebtors: {
          include: { case: { select: { id: true, fileNumber: true, status: true } } },
        },
        assets: true,
      },
    });

    if (!debtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    return debtor;
  }

  async create(tenantId: string, dto: CreateDebtorDto) {
    return this.prisma.debtor.create({
      data: { tenantId, ...dto },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateDebtorDto) {
    await this.findOne(tenantId, id);
    return this.prisma.debtor.update({
      where: { id },
      data: dto,
    });
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.debtor.delete({ where: { id } });
  }
}
