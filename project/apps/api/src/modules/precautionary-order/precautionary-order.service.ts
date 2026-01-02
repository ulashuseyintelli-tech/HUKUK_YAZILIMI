import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreatePrecautionaryOrderDto {
  caseId: string;
  orderType?: string;
  courtName: string;
  courtCity?: string;
  decisionDate: string;
  decisionNo?: string;
  scopeNote?: string;
  coveredDebtorIds?: string[];
  securedAmount: number;
  currency?: string;
  requiresSecurityDeposit?: boolean;
  securityDepositAmount?: number;
  securityDepositType?: 'NAKIT' | 'TEMINAT_MEKTUBU' | 'GAYRIMENKUL' | 'KEFALET' | 'DIGER';
  securityDepositNote?: string;
  notes?: string;
}

export interface CreatePrecautionaryCostDto {
  precautionaryOrderId: string;
  costType: 'HARC' | 'POSTA' | 'VEKALET' | 'TEMINAT' | 'YEDIEMIN' | 'BILIRKISI' | 'MUHAFAZA' | 'DIGER';
  amount: number;
  currency?: string;
  description?: string;
  label?: string;
  isClaimedInEnforcement?: boolean;
}

@Injectable()
export class PrecautionaryOrderService {
  private readonly logger = new Logger(PrecautionaryOrderService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * İhtiyati haciz kararı oluştur
   */
  async create(tenantId: string, dto: CreatePrecautionaryOrderDto, userId?: string) {
    // Case'i kontrol et
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });

    if (!caseRecord) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    // İhtiyati haciz kararı oluştur
    const order = await (this.prisma as any).precautionaryOrder.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        orderType: dto.orderType || 'IHTIYATI_HACIZ',
        courtName: dto.courtName,
        courtCity: dto.courtCity,
        decisionDate: new Date(dto.decisionDate),
        decisionNo: dto.decisionNo,
        scopeNote: dto.scopeNote,
        coveredDebtorIds: dto.coveredDebtorIds || [],
        securedAmount: dto.securedAmount,
        currency: dto.currency || 'TRY',
        requiresSecurityDeposit: dto.requiresSecurityDeposit || false,
        securityDepositAmount: dto.securityDepositAmount,
        securityDepositType: dto.securityDepositType,
        securityDepositNote: dto.securityDepositNote,
        status: 'DECIDED',
        notes: dto.notes,
        createdById: userId,
      },
    });

    // Case'de flag'i güncelle
    await this.prisma.case.update({
      where: { id: dto.caseId },
      data: { hasPrecautionaryOrder: true } as any,
    });

    this.logger.log(`İhtiyati haciz kararı oluşturuldu: ${order.id}`);
    return order;
  }

  /**
   * İhtiyati haciz kararını getir
   */
  async findOne(tenantId: string, id: string) {
    const order = await (this.prisma as any).precautionaryOrder.findFirst({
      where: { id, tenantId },
      include: {
        costs: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('İhtiyati haciz kararı bulunamadı');
    }

    return order;
  }

  /**
   * Dosyaya ait ihtiyati haciz kararlarını getir
   */
  async findByCase(tenantId: string, caseId: string) {
    return (this.prisma as any).precautionaryOrder.findMany({
      where: { tenantId, caseId },
      include: {
        costs: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { decisionDate: 'desc' },
    });
  }


  /**
   * İhtiyati haciz kararını güncelle
   */
  async update(tenantId: string, id: string, dto: Partial<CreatePrecautionaryOrderDto>) {
    const order = await this.findOne(tenantId, id);

    const updateData: any = {};

    if (dto.courtName) updateData.courtName = dto.courtName;
    if (dto.courtCity !== undefined) updateData.courtCity = dto.courtCity;
    if (dto.decisionDate) updateData.decisionDate = new Date(dto.decisionDate);
    if (dto.decisionNo !== undefined) updateData.decisionNo = dto.decisionNo;
    if (dto.scopeNote !== undefined) updateData.scopeNote = dto.scopeNote;
    if (dto.coveredDebtorIds) updateData.coveredDebtorIds = dto.coveredDebtorIds;
    if (dto.securedAmount !== undefined) updateData.securedAmount = dto.securedAmount;
    if (dto.currency) updateData.currency = dto.currency;
    if (dto.requiresSecurityDeposit !== undefined) updateData.requiresSecurityDeposit = dto.requiresSecurityDeposit;
    if (dto.securityDepositAmount !== undefined) updateData.securityDepositAmount = dto.securityDepositAmount;
    if (dto.securityDepositType !== undefined) updateData.securityDepositType = dto.securityDepositType;
    if (dto.securityDepositNote !== undefined) updateData.securityDepositNote = dto.securityDepositNote;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    return (this.prisma as any).precautionaryOrder.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * İhtiyati haciz kararını uygula
   */
  async apply(tenantId: string, id: string) {
    const order = await this.findOne(tenantId, id);

    if (order.status !== 'DECIDED') {
      throw new Error('Sadece "Karar Alındı" durumundaki kararlar uygulanabilir');
    }

    return (this.prisma as any).precautionaryOrder.update({
      where: { id },
      data: {
        status: 'APPLIED',
        appliedAt: new Date(),
      },
    });
  }

  /**
   * İhtiyati haciz kararını kaldır
   */
  async lift(tenantId: string, id: string, reason?: string) {
    const order = await this.findOne(tenantId, id);

    if (order.status !== 'APPLIED') {
      throw new Error('Sadece "Uygulandı" durumundaki kararlar kaldırılabilir');
    }

    return (this.prisma as any).precautionaryOrder.update({
      where: { id },
      data: {
        status: 'LIFTED',
        liftedAt: new Date(),
        liftReason: reason,
      },
    });
  }

  /**
   * İhtiyati haciz kararını sil
   */
  async delete(tenantId: string, id: string) {
    const order = await this.findOne(tenantId, id);

    // Masrafları sil
    await (this.prisma as any).precautionaryCost.deleteMany({
      where: { precautionaryOrderId: id },
    });

    // Kararı sil
    await (this.prisma as any).precautionaryOrder.delete({
      where: { id },
    });

    // Case'de başka ihtiyati haciz var mı kontrol et
    const remainingOrders = await (this.prisma as any).precautionaryOrder.count({
      where: { caseId: order.caseId, tenantId },
    });

    if (remainingOrders === 0) {
      await this.prisma.case.update({
        where: { id: order.caseId },
        data: { hasPrecautionaryOrder: false } as any,
      });
    }

    return { success: true };
  }

  // ==================== MASRAF KALEMLERİ ====================

  /**
   * İhtiyati haciz masraf kalemi ekle
   */
  async addCost(tenantId: string, dto: CreatePrecautionaryCostDto, userId?: string) {
    // Kararı kontrol et
    const order = await this.findOne(tenantId, dto.precautionaryOrderId);

    // Sıralama için mevcut kalem sayısını al
    const existingCount = await (this.prisma as any).precautionaryCost.count({
      where: { precautionaryOrderId: dto.precautionaryOrderId },
    });

    // Masraf kalemi oluştur
    const cost = await (this.prisma as any).precautionaryCost.create({
      data: {
        tenantId,
        precautionaryOrderId: dto.precautionaryOrderId,
        costType: dto.costType,
        amount: dto.amount,
        currency: dto.currency || 'TRY',
        description: dto.description,
        label: dto.label || this.getCostLabel(dto.costType),
        isClaimedInEnforcement: dto.isClaimedInEnforcement ?? true,
        sortOrder: existingCount,
      },
    });

    // Ana takipte talep ediliyorsa ClaimItem oluştur
    if (dto.isClaimedInEnforcement !== false) {
      await this.createClaimItemFromCost(tenantId, order.caseId, cost.id, dto);
    }

    return cost;
  }

  /**
   * İhtiyati haciz masraf kalemini güncelle
   */
  async updateCost(tenantId: string, costId: string, dto: Partial<CreatePrecautionaryCostDto>) {
    const cost = await (this.prisma as any).precautionaryCost.findFirst({
      where: { id: costId, tenantId },
    });

    if (!cost) {
      throw new NotFoundException('Masraf kalemi bulunamadı');
    }

    const updateData: any = {};

    if (dto.costType) updateData.costType = dto.costType;
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.currency) updateData.currency = dto.currency;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.label !== undefined) updateData.label = dto.label;
    if (dto.isClaimedInEnforcement !== undefined) updateData.isClaimedInEnforcement = dto.isClaimedInEnforcement;

    return (this.prisma as any).precautionaryCost.update({
      where: { id: costId },
      data: updateData,
    });
  }

  /**
   * İhtiyati haciz masraf kalemini sil
   */
  async deleteCost(tenantId: string, costId: string) {
    const cost = await (this.prisma as any).precautionaryCost.findFirst({
      where: { id: costId, tenantId },
    });

    if (!cost) {
      throw new NotFoundException('Masraf kalemi bulunamadı');
    }

    // Bağlı ClaimItem varsa sil
    if (cost.claimItemId) {
      await this.prisma.claimItem.delete({
        where: { id: cost.claimItemId },
      }).catch(() => {}); // Hata olursa sessizce geç
    }

    await (this.prisma as any).precautionaryCost.delete({
      where: { id: costId },
    });

    return { success: true };
  }

  /**
   * İhtiyati haciz masraflarının toplamını hesapla
   */
  async calculateTotalCosts(tenantId: string, precautionaryOrderId: string) {
    const costs = await (this.prisma as any).precautionaryCost.findMany({
      where: { tenantId, precautionaryOrderId },
    });

    const total = costs.reduce((sum: number, cost: any) => sum + Number(cost.amount), 0);
    const claimedTotal = costs
      .filter((c: any) => c.isClaimedInEnforcement)
      .reduce((sum: number, cost: any) => sum + Number(cost.amount), 0);

    return {
      total,
      claimedTotal,
      count: costs.length,
      claimedCount: costs.filter((c: any) => c.isClaimedInEnforcement).length,
    };
  }

  // ==================== YARDIMCI FONKSİYONLAR ====================

  /**
   * Masraf türüne göre varsayılan etiket
   */
  private getCostLabel(costType: string): string {
    const labels: Record<string, string> = {
      HARC: 'İhtiyati Haciz Harcı',
      POSTA: 'İhtiyati Haciz Tebligat/Posta',
      VEKALET: 'İhtiyati Haciz Vekalet Ücreti',
      TEMINAT: 'Teminat Masrafı',
      YEDIEMIN: 'Yediemin Ücreti',
      BILIRKISI: 'Bilirkişi Ücreti',
      MUHAFAZA: 'Muhafaza Gideri',
      DIGER: 'Diğer Masraf',
    };
    return labels[costType] || 'İhtiyati Haciz Masrafı';
  }

  /**
   * Masraf kaleminden ClaimItem oluştur
   */
  private async createClaimItemFromCost(
    tenantId: string,
    caseId: string,
    costId: string,
    dto: CreatePrecautionaryCostDto
  ) {
    const itemType = this.mapCostTypeToClaimItemType(dto.costType);

    const claimItem = await (this.prisma.claimItem as any).create({
      data: {
        tenantId,
        caseId,
        itemType: itemType as any,
        sourceProcess: 'PRECAUTIONARY',
        sourceProcessId: dto.precautionaryOrderId,
        originalAmount: dto.amount,
        demandedAmount: dto.amount,
        collectedAmount: 0,
        amount: dto.amount,
        currency: dto.currency || 'TRY',
        description: dto.description,
        label: dto.label || this.getCostLabel(dto.costType),
        bucket: 'precautionary_bucket',
      },
    });

    // Cost'a claimItemId'yi bağla
    await (this.prisma as any).precautionaryCost.update({
      where: { id: costId },
      data: { claimItemId: claimItem.id },
    });

    return claimItem;
  }

  /**
   * Masraf türünü ClaimItemType'a dönüştür
   */
  private mapCostTypeToClaimItemType(costType: string): string {
    const mapping: Record<string, string> = {
      HARC: 'FEE',
      POSTA: 'EXPENSE',
      VEKALET: 'ATTORNEY_FEE',
      TEMINAT: 'EXPENSE',
      YEDIEMIN: 'EXPENSE',
      BILIRKISI: 'EXPENSE',
      MUHAFAZA: 'EXPENSE',
      DIGER: 'OTHER',
    };
    return mapping[costType] || 'OTHER';
  }
}
