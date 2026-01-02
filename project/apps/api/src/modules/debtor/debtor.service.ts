import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  CreateDebtorDto,
  UpdateDebtorDto,
  SearchDebtorsDto,
  CheckDuplicateDto,
  CreateDebtorAddressDto,
  UpdateDebtorAddressDto,
  DebtorType,
} from "./dto/debtor.dto";

@Injectable()
export class DebtorService {
  constructor(private prisma: PrismaService) {}

  // ==================== CRUD OPERATIONS ====================

  async findAll(
    tenantId: string,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      type?: string;
      riskLevel?: string;
      city?: string;
    }
  ) {
    const { page = 1, limit = 20, search, type, riskLevel, city } = params || {};

    const where: any = { tenantId };

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { identityNo: { contains: search } },
        { tckn: { contains: search } },
        { vkn: { contains: search } },
        { detsisNo: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    // Type filter
    if (type) {
      where.type = type;
    }

    // Risk level filter
    if (riskLevel) {
      where.riskLevel = riskLevel;
    }

    // City filter (from addresses)
    if (city) {
      where.debtorAddresses = {
        some: { city: { contains: city, mode: "insensitive" } },
      };
    }

    const [debtors, total] = await Promise.all([
      this.prisma.debtor.findMany({
        where,
        include: {
          debtorAddresses: true,
          estateHeirs: true,
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
        debtorAddresses: { orderBy: { isPrimary: "desc" } },
        estateHeirs: true,
        caseDebtors: {
          include: {
            case: { select: { id: true, fileNumber: true, status: true, caseStatus: true } },
            selectedAddress: true,
          },
        },
        assets: true,
        communications: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!debtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    return debtor;
  }


  async create(tenantId: string, dto: CreateDebtorDto) {
    // Validate required fields based on type
    this.validateDebtorByType(dto);

    // Check for duplicates
    const duplicate = await this.checkDuplicateInternal(tenantId, dto);
    if (duplicate) {
      throw new ConflictException({
        message: "Bu kimlik numarasına sahip borçlu zaten mevcut",
        existingDebtor: duplicate,
      });
    }

    // Compute name and identityNo
    const { name, identityNo } = this.computeNameAndIdentity(dto);

    // Extract addresses and estateHeirs from dto
    const { addresses, estateHeirs, ...debtorData } = dto;

    // Create debtor with addresses and estate heirs
    const debtor = await this.prisma.debtor.create({
      data: {
        tenantId,
        ...debtorData,
        name,
        identityNo,
        debtorAddresses: addresses?.length
          ? {
              create: addresses.map((addr, index) => ({
                ...addr,
                isPrimary: addr.isPrimary ?? index === 0,
              })),
            }
          : undefined,
        // Tereke için mirasçıları oluştur
        estateHeirs: dto.type === DebtorType.ESTATE && estateHeirs?.length
          ? {
              create: estateHeirs.map((heir) => ({
                name: heir.name,
                tckn: heir.tckn || null,
                address: heir.address || "", // Zorunlu alan
                city: heir.city || null,
                district: heir.district || null,
                shareRatio: heir.shareRatio || null,
                phone: heir.phone || null,
                email: heir.email || null,
              })),
            }
          : undefined,
      },
      include: { 
        debtorAddresses: true,
        estateHeirs: true,
      },
    });

    return debtor;
  }

  async update(tenantId: string, id: string, dto: UpdateDebtorDto) {
    const existing = await this.findOne(tenantId, id);

    // If type is changing, validate new type requirements
    const newType = dto.type || existing.type;
    if (dto.type) {
      this.validateDebtorByType({ ...dto, type: newType } as CreateDebtorDto);
    }

    // Check for duplicates if identity number is changing
    if (dto.tckn || dto.vkn || dto.detsisNo) {
      const duplicate = await this.checkDuplicateInternal(tenantId, {
        type: newType as DebtorType,
        tckn: dto.tckn,
        vkn: dto.vkn,
        detsisNo: dto.detsisNo,
      }, id);
      if (duplicate) {
        throw new ConflictException({
          message: "Bu kimlik numarasına sahip başka bir borçlu mevcut",
          existingDebtor: duplicate,
        });
      }
    }

    // Compute name and identityNo if relevant fields changed
    const updateData: any = { ...dto };
    if (dto.firstName || dto.lastName || dto.companyName || dto.institutionName) {
      const merged = {
        type: dto.type || existing.type,
        firstName: dto.firstName || existing.firstName,
        lastName: dto.lastName || existing.lastName,
        companyName: dto.companyName || existing.companyName,
        institutionName: dto.institutionName || existing.institutionName,
        tckn: dto.tckn || existing.tckn,
        vkn: dto.vkn || existing.vkn,
        detsisNo: dto.detsisNo || existing.detsisNo,
      };
      const { name, identityNo } = this.computeNameAndIdentity(merged as CreateDebtorDto);
      updateData.name = name;
      updateData.identityNo = identityNo;
    }

    return this.prisma.debtor.update({
      where: { id },
      data: updateData,
      include: { debtorAddresses: true },
    });
  }

  async delete(tenantId: string, id: string) {
    const debtor = await this.findOne(tenantId, id);

    // Check for active case associations
    const activeCases = await this.prisma.caseDebtor.count({
      where: {
        debtorId: id,
        case: {
          caseStatus: { in: ["DERDEST", "ISLEMDE", "DERKENAR"] },
        },
      },
    });

    if (activeCases > 0) {
      throw new BadRequestException(
        `Bu borçlu ${activeCases} aktif takipte yer almaktadır. Silmeden önce takiplerden çıkarılmalıdır.`
      );
    }

    return this.prisma.debtor.delete({ where: { id } });
  }

  // ==================== DUPLICATE CHECK ====================

  async checkDuplicate(tenantId: string, dto: CheckDuplicateDto) {
    const duplicate = await this.checkDuplicateInternal(tenantId, dto);
    return {
      isDuplicate: !!duplicate,
      existingDebtor: duplicate,
    };
  }

  private async checkDuplicateInternal(
    tenantId: string,
    dto: { type?: DebtorType; tckn?: string; vkn?: string; detsisNo?: string },
    excludeId?: string
  ) {
    const conditions: any[] = [];

    if (dto.tckn) {
      conditions.push({ tckn: dto.tckn });
    }
    if (dto.vkn) {
      conditions.push({ vkn: dto.vkn });
    }
    if (dto.detsisNo) {
      conditions.push({ detsisNo: dto.detsisNo });
    }

    if (conditions.length === 0) return null;

    const where: any = {
      tenantId,
      OR: conditions,
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    return this.prisma.debtor.findFirst({
      where,
      select: { id: true, name: true, type: true, identityNo: true },
    });
  }


  // ==================== ADDRESS MANAGEMENT ====================

  async addAddress(tenantId: string, debtorId: string, dto: CreateDebtorAddressDto) {
    await this.findOne(tenantId, debtorId);

    // If this is primary, unset other primaries
    if (dto.isPrimary) {
      await this.prisma.debtorAddress.updateMany({
        where: { debtorId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.debtorAddress.create({
      data: { debtorId, ...dto },
    });
  }

  async updateAddress(
    tenantId: string,
    debtorId: string,
    addressId: string,
    dto: UpdateDebtorAddressDto
  ) {
    await this.findOne(tenantId, debtorId);

    const address = await this.prisma.debtorAddress.findFirst({
      where: { id: addressId, debtorId },
    });

    if (!address) {
      throw new NotFoundException("Adres bulunamadı");
    }

    // If setting as primary, unset others
    if (dto.isPrimary) {
      await this.prisma.debtorAddress.updateMany({
        where: { debtorId, id: { not: addressId } },
        data: { isPrimary: false },
      });
    }

    return this.prisma.debtorAddress.update({
      where: { id: addressId },
      data: dto,
    });
  }

  async deleteAddress(tenantId: string, debtorId: string, addressId: string) {
    await this.findOne(tenantId, debtorId);

    const address = await this.prisma.debtorAddress.findFirst({
      where: { id: addressId, debtorId },
    });

    if (!address) {
      throw new NotFoundException("Adres bulunamadı");
    }

    // Check if address is used in any case
    const usedInCases = await this.prisma.caseDebtor.count({
      where: { selectedAddressId: addressId },
    });

    if (usedInCases > 0) {
      throw new BadRequestException(
        "Bu adres aktif takiplerde tebligat adresi olarak seçili. Önce takiplerdeki adresi değiştirin."
      );
    }

    return this.prisma.debtorAddress.delete({ where: { id: addressId } });
  }

  async setPrimaryAddress(tenantId: string, debtorId: string, addressId: string) {
    await this.findOne(tenantId, debtorId);

    const address = await this.prisma.debtorAddress.findFirst({
      where: { id: addressId, debtorId },
    });

    if (!address) {
      throw new NotFoundException("Adres bulunamadı");
    }

    // Unset all primaries and set the new one
    await this.prisma.$transaction([
      this.prisma.debtorAddress.updateMany({
        where: { debtorId },
        data: { isPrimary: false },
      }),
      this.prisma.debtorAddress.update({
        where: { id: addressId },
        data: { isPrimary: true },
      }),
    ]);

    return { success: true };
  }

  // ==================== HELPER METHODS ====================

  private validateDebtorByType(dto: CreateDebtorDto) {
    switch (dto.type) {
      case DebtorType.INDIVIDUAL:
        if (!dto.firstName || !dto.lastName) {
          throw new BadRequestException("Gerçek kişi için ad ve soyad zorunludur");
        }
        break;
      case DebtorType.COMPANY:
        if (!dto.companyName) {
          throw new BadRequestException("Tüzel kişi için şirket adı zorunludur");
        }
        break;
      case DebtorType.PUBLIC_INSTITUTION:
        if (!dto.institutionName) {
          throw new BadRequestException("Kamu kurumu için kurum adı zorunludur");
        }
        break;
      case DebtorType.ESTATE:
        if (!dto.deceasedName) {
          throw new BadRequestException("Tereke için murisin adı zorunludur");
        }
        if (!dto.estateHeirs || dto.estateHeirs.length === 0) {
          throw new BadRequestException("Tereke için en az bir mirasçı girilmelidir");
        }
        break;
    }
  }

  private computeNameAndIdentity(dto: CreateDebtorDto): { name: string; identityNo: string | null } {
    let name = "";
    let identityNo: string | null = null;

    switch (dto.type) {
      case DebtorType.INDIVIDUAL:
        name = `${dto.firstName || ""} ${dto.lastName || ""}`.trim();
        identityNo = dto.tckn || null;
        break;
      case DebtorType.COMPANY:
        name = dto.companyName || "";
        identityNo = dto.vkn || null;
        break;
      case DebtorType.PUBLIC_INSTITUTION:
        name = dto.institutionName || "";
        identityNo = dto.detsisNo || null;
        break;
      case DebtorType.ESTATE:
        // Tereke için isim: "Muris Adı Mirasçıları" formatında
        name = `${dto.deceasedName || ""} Mirasçıları`.trim();
        identityNo = dto.deceasedTckn || null;
        break;
    }

    return { name, identityNo };
  }

  // ==================== STATISTICS ====================

  async getStatistics(tenantId: string) {
    const [total, byType, byRisk, recentlyAdded] = await Promise.all([
      this.prisma.debtor.count({ where: { tenantId } }),
      this.prisma.debtor.groupBy({
        by: ["type"],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.debtor.groupBy({
        by: ["riskLevel"],
        where: { tenantId, riskLevel: { not: null } },
        _count: true,
      }),
      this.prisma.debtor.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      total,
      byType: byType.reduce((acc, item) => ({ ...acc, [item.type]: item._count }), {}),
      byRisk: byRisk.reduce((acc, item) => ({ ...acc, [item.riskLevel || "NONE"]: item._count }), {}),
      recentlyAdded,
    };
  }
}
