import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateCaseDto, UpdateCaseDto } from "./dto/case.dto";
import { Prisma } from "@prisma/client";

@Injectable()
export class CaseService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, params?: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = params || {};

    const where: any = { tenantId };
    if (status) where.status = status;

    const [cases, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          debtors: {
            include: { debtor: { select: { id: true, name: true } } },
          },
          _count: { select: { tasks: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.case.count({ where }),
    ]);

    return {
      data: cases,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const caseItem = await this.prisma.case.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        court: true,
        debtors: { include: { debtor: true } },
        lawyers: { include: { lawyer: true } },
        tasks: { orderBy: { createdAt: "desc" }, take: 10 },
        collections: { orderBy: { date: "desc" } },
        dues: true,
      },
    });

    if (!caseItem) {
      throw new NotFoundException("Takip bulunamadı");
    }

    return caseItem;
  }

  async create(tenantId: string, dto: CreateCaseDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Alacaklı (Client) - mevcut veya yeni
        let clientId: string | undefined;
        if (dto.creditors && dto.creditors.length > 0) {
          const firstCreditor = dto.creditors[0];
          if (firstCreditor.id) {
            // Mevcut client kullan
            clientId = firstCreditor.id;
          } else {
            // Yeni client oluştur
            const client = await tx.client.create({
              data: {
                tenantId,
                type: firstCreditor.type,
                name: firstCreditor.name,
                identityNo: firstCreditor.identityNo,
                taxOffice: firstCreditor.taxOffice,
                phone: firstCreditor.phone,
                email: firstCreditor.email,
                address: firstCreditor.address ? { text: firstCreditor.address } : undefined,
              },
            });
            clientId = client.id;
          }
        }

        // 2. Case oluştur
        const newCase = await tx.case.create({
          data: {
            tenantId,
            fileNumber: dto.fileNumber,
            executionFileNumber: dto.executionFileNumber,
            type: dto.type,
            subType: dto.subType,
            status: dto.status || "ACTIVE",
            clientId,
            courtId: dto.courtId,
            principalAmount: dto.principalAmount,
            interestRate: dto.interestRate,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            notes: dto.notes,
          },
        });

        // 3. Avukatları - mevcut veya yeni
        if (dto.lawyers && dto.lawyers.length > 0) {
          for (const lawyerDto of dto.lawyers) {
            let lawyerId: string;
            if (lawyerDto.id) {
              // Mevcut avukat kullan
              lawyerId = lawyerDto.id;
            } else {
              // Yeni avukat oluştur
              const lawyer = await tx.lawyer.create({
                data: {
                  tenantId,
                  name: lawyerDto.name,
                  surname: lawyerDto.surname,
                  barNumber: lawyerDto.barNumber,
                },
              });
              lawyerId = lawyer.id;
            }

            await tx.caseLawyer.create({
              data: {
                caseId: newCase.id,
                lawyerId,
                canSign: lawyerDto.canSign || false,
              },
            });
          }
        }

        // 4. Borçluları - mevcut veya yeni
        if (dto.debtors && dto.debtors.length > 0) {
          for (const debtorDto of dto.debtors) {
            let debtorId: string;
            if (debtorDto.id) {
              // Mevcut borçlu kullan
              debtorId = debtorDto.id;
            } else {
              // Yeni borçlu oluştur
              const debtor = await tx.debtor.create({
                data: {
                  tenantId,
                  type: debtorDto.type,
                  name: debtorDto.name,
                  identityNo: debtorDto.identityNo,
                  taxOffice: debtorDto.taxOffice,
                  phone: debtorDto.phone,
                  email: debtorDto.email,
                  addresses: debtorDto.address ? { primary: debtorDto.address } : undefined,
                },
              });
              debtorId = debtor.id;
            }

            await tx.caseDebtor.create({
              data: {
                caseId: newCase.id,
                debtorId,
                role: "DEBTOR",
              },
            });
          }
        }

        // 5. Tam case'i döndür
        return tx.case.findUnique({
          where: { id: newCase.id },
          include: {
            client: { select: { id: true, name: true } },
            debtors: {
              include: { debtor: { select: { id: true, name: true } } },
            },
            lawyers: {
              include: { lawyer: { select: { id: true, name: true, surname: true } } },
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException(`Bu dosya numarası (${dto.fileNumber}) zaten kullanılıyor`);
        }
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateCaseDto) {
    await this.findOne(tenantId, id);

    // Boş string'leri undefined'a çevir
    const data: any = { ...dto };
    if (data.startDate === "" || data.startDate === null) {
      data.startDate = undefined;
    } else if (data.startDate) {
      data.startDate = new Date(data.startDate);
    }

    // Boş string'leri temizle
    Object.keys(data).forEach((key) => {
      if (data[key] === "") {
        data[key] = undefined;
      }
    });

    return this.prisma.case.update({
      where: { id },
      data,
    });
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.case.delete({
      where: { id },
    });
  }

  async getStats(tenantId: string) {
    const [total, active, closed, thisMonth] = await Promise.all([
      this.prisma.case.count({ where: { tenantId } }),
      this.prisma.case.count({ where: { tenantId, status: "ACTIVE" } }),
      this.prisma.case.count({ where: { tenantId, status: "CLOSED" } }),
      this.prisma.case.count({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    return { total, active, closed, thisMonth };
  }
}
