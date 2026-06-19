import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  AddDebtorToCaseDto,
  UpdateCaseDebtorDto,
  NotificationMode,
} from "./dto/case-debtor.dto";

@Injectable()
export class CaseDebtorService {
  constructor(private prisma: PrismaService) {}

  // ==================== CASE DEBTOR OPERATIONS ====================

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseDebtorService.addDebtorToCase() → POST /cases/:caseId/debtors (seçili adres ownership guard)
  /// - CaseDebtorService.updateCaseDebtor() → PUT /case-debtors/:id (seçili adres ownership guard)
  /// </remarks>
  private async assertSelectedAddressBelongsToDebtor(
    debtorId: string,
    selectedAddressId?: string | null
  ): Promise<void> {
    if (selectedAddressId === undefined || selectedAddressId === null) return;

    const address = await this.prisma.debtorAddress.findFirst({
      where: { id: selectedAddressId, debtorId },
      select: { id: true },
    });

    if (!address) {
      throw new NotFoundException("Adres bulunamadı veya bu borçluya ait değil");
    }
  }

  async getCaseDebtors(tenantId: string, caseId: string) {
    // Verify case belongs to tenant
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });

    if (!caseRecord) {
      throw new NotFoundException("Takip bulunamadı");
    }

    return this.prisma.caseDebtor.findMany({
      where: { caseId },
      include: {
        debtor: {
          include: { debtorAddresses: true },
        },
        selectedAddress: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseDebtorController.addDebtorToCase() → POST /cases/:caseId/debtors (Dosyaya mevcut borçlu ekleme)
  /// - CaseDebtorService.bulkAddDebtorsToCase() → Çoklu borçlu ekleme
  /// </remarks>
  async addDebtorToCase(tenantId: string, caseId: string, dto: AddDebtorToCaseDto) {
    // Verify case belongs to tenant
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });

    if (!caseRecord) {
      throw new NotFoundException("Takip bulunamadı");
    }

    // Verify debtor belongs to tenant
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: dto.debtorId, tenantId },
      include: { debtorAddresses: true },
    });

    if (!debtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    // Check if debtor already exists in case with same role
    const existing = await this.prisma.caseDebtor.findFirst({
      where: {
        caseId,
        debtorId: dto.debtorId,
        role: dto.role || "ASIL_BORCLU",
      },
    });

    if (existing) {
      throw new ConflictException("Bu borçlu zaten bu takipte aynı rolle mevcut");
    }

    // Validate notification mode
    this.validateNotificationMode(dto.notificationMode, debtor.kepAddress, dto.ilanenJustification);

    // If no address selected, use primary address
    let selectedAddressId = dto.selectedAddressId;
    await this.assertSelectedAddressBelongsToDebtor(dto.debtorId, selectedAddressId);
    if (!selectedAddressId && debtor.debtorAddresses.length > 0) {
      const primaryAddress = debtor.debtorAddresses.find((a) => a.isPrimary);
      selectedAddressId = primaryAddress?.id || debtor.debtorAddresses[0].id;
    }

    const caseDebtor = await this.prisma.caseDebtor.create({
      data: {
        caseId,
        debtorId: dto.debtorId,
        role: dto.role || "ASIL_BORCLU",
        liabilityAmount: dto.liabilityAmount,
        liabilityType: dto.liabilityType,
        notificationMode: dto.notificationMode || "NORMAL",
        selectedAddressId,
        prepareNotification: dto.prepareNotification ?? true,
        ilanenJustification: dto.ilanenJustification,
        debtorLawyerId: dto.debtorLawyerId,
        debtorLawyerName: dto.debtorLawyerName,
        debtorLawyerBarNo: dto.debtorLawyerBarNo,
        caseNote: dto.caseNote,
      },
      include: {
        debtor: { include: { debtorAddresses: true } },
        selectedAddress: true,
      },
    });

    // TODO: If prepareNotification is true, create notification record

    return caseDebtor;
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseDebtorController.updateCaseDebtor() → PUT /case-debtors/:id (Dosya borçlusu bilgilerini güncelleme)
  /// </remarks>
  async updateCaseDebtor(tenantId: string, caseDebtorId: string, dto: UpdateCaseDebtorDto) {
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId, case: { tenantId } },
      include: {
        case: true,
        debtor: true,
      },
    });

    if (!caseDebtor) {
      throw new NotFoundException("Dosya borçlusu bulunamadı");
    }

    if (caseDebtor.lifecycleStatus === "PASSIVE") {
      throw new BadRequestException(
        "Pasif dosya borçlusu güncellenemez."
      );
    }

    // Validate notification mode if changing
    if (dto.notificationMode) {
      this.validateNotificationMode(
        dto.notificationMode,
        caseDebtor.debtor.kepAddress,
        dto.ilanenJustification || caseDebtor.ilanenJustification
      );
    }

    // Check role uniqueness if changing role
    if (dto.role && dto.role !== caseDebtor.role) {
      const existing = await this.prisma.caseDebtor.findFirst({
        where: {
          caseId: caseDebtor.caseId,
          debtorId: caseDebtor.debtorId,
          role: dto.role,
          id: { not: caseDebtorId },
        },
      });

      if (existing) {
        throw new ConflictException("Bu borçlu zaten bu takipte bu rolle mevcut");
      }
    }

    await this.assertSelectedAddressBelongsToDebtor(caseDebtor.debtorId, dto.selectedAddressId);

    return this.prisma.caseDebtor.update({
      where: { id: caseDebtorId },
      data: dto,
      include: {
        debtor: { include: { debtorAddresses: true } },
        selectedAddress: true,
      },
    });
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseDebtorController.removeCaseDebtor() → DELETE /case-debtors/:id (dosya borçlusunu aktif işlem öznesi olmaktan çıkarır)
  /// </remarks>
  async removeCaseDebtor(
    tenantId: string,
    caseDebtorId: string,
    currentUserId?: string | null
  ) {
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId, case: { tenantId } },
    });

    if (!caseDebtor) {
      throw new NotFoundException("Dosya borçlusu bulunamadı");
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.addressTask.updateMany({
        where: {
          tenantId,
          caseId: caseDebtor.caseId,
          debtorId: caseDebtor.debtorId,
          status: { in: ["PENDING", "IN_PROGRESS", "WAITING_EXTERNAL"] },
        },
        data: {
          status: "CANCELLED",
          cancellationReason: "MANUAL_CANCEL",
          completedAt: now,
          updatedAt: now,
        },
      });

      if (caseDebtor.lifecycleStatus === "PASSIVE") {
        return caseDebtor;
      }

      return tx.caseDebtor.update({
        where: { id: caseDebtorId },
        data: {
          lifecycleStatus: "PASSIVE",
          passivatedAt: now,
          passivatedById: currentUserId ?? null,
          passivationReason: "MANUAL",
          passivationNote: null,
          passivationEffectiveAt: null,
        },
      });
    });
  }


  // ==================== VALIDATION ====================

  private validateNotificationMode(
    mode?: NotificationMode | string,
    kepAddress?: string | null,
    ilanenJustification?: string | null
  ) {
    if (!mode) return;

    // KEP/UETS requires KEP address
    if ((mode === NotificationMode.KEP || mode === NotificationMode.UETS) && !kepAddress) {
      throw new BadRequestException(
        "KEP veya UETS tebligat modu için borçlunun KEP adresi gereklidir"
      );
    }

    // ILANEN requires justification
    if (mode === NotificationMode.ILANEN && !ilanenJustification) {
      throw new BadRequestException(
        "İlanen tebligat için gerekçe belirtilmelidir"
      );
    }
  }

  // ==================== BULK OPERATIONS ====================

  async addMultipleDebtorsToCase(
    tenantId: string,
    caseId: string,
    debtors: AddDebtorToCaseDto[]
  ) {
    const results = [];
    const errors = [];

    for (const dto of debtors) {
      try {
        const result = await this.addDebtorToCase(tenantId, caseId, dto);
        results.push(result);
      } catch (error) {
        errors.push({
          debtorId: dto.debtorId,
          error: error.message,
        });
      }
    }

    return { success: results, errors };
  }

  // ==================== STATISTICS ====================

  async getCaseDebtorStatistics(tenantId: string, caseId: string) {
    const caseDebtors = await this.prisma.caseDebtor.findMany({
      where: { caseId, case: { tenantId } },
      include: { debtor: true },
    });

    const byRole = caseDebtors.reduce((acc, cd) => {
      acc[cd.role] = (acc[cd.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byNotificationMode = caseDebtors.reduce((acc, cd) => {
      acc[cd.notificationMode] = (acc[cd.notificationMode] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalLiability = caseDebtors.reduce((sum, cd) => {
      return sum + (cd.liabilityAmount?.toNumber() || 0);
    }, 0);

    return {
      total: caseDebtors.length,
      byRole,
      byNotificationMode,
      totalLiability,
      pendingNotifications: caseDebtors.filter((cd) => cd.prepareNotification).length,
    };
  }
}
