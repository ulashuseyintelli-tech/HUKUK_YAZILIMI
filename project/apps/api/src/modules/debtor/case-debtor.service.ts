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

  /**
   * Borçluyu dosyadan çıkarır + o (caseId, debtorId) çiftine ait AÇIK adres
   * görevlerini (AddressTask) AYNI transaction içinde iptal eder (öksüz görev temizliği).
   *
   * Neden burada: AddressTask'ın CaseDebtor'a foreign key'i YOKTUR — yalnız caseId ve
   * debtorId tutar; onDelete:Cascade sadece Case veya Debtor silinince tetiklenir.
   * CaseDebtor linki kalkınca (Case/Debtor yaşamaya devam ettiği için) DB cascade
   * çalışmaz → açık görevler "öksüz" kalır ve AddressTaskScheduler onları boşa işler
   * (saatlik hatırlatma + ASSIGN_MANUAL_CALL_CLIENT escalation + yıllık adres refresh).
   * Bu yüzden iptal, silme noktasında uygulama katmanında yapılır.
   *
   * Kapsam: where = tenantId + caseId + debtorId (üçü birden pinlenir) → başka
   * borçlu / başka dosya / başka tenant ETKİLENMEZ. Yalnız açık statüler
   * (PENDING/IN_PROGRESS/WAITING_EXTERNAL) iptal edilir; terminal görevlere dokunulmaz.
   * Reason = MANUAL_CANCEL (prod'da boş slot; "borçlu çıkarıldı" anlamını temiz taşır —
   * SUPERSEDED repo'da "ardıl kayıt ikame etti" demek, burada ardıl yok).
   *
   * Finansal koruma (BLOK): bu borçluya (caseDebtorId) bağlı Collection (tahsilat) kaydı
   * varsa silme ENGELLENİR — ThirdParty guard'ıyla aynı felsefe. Collection.caseDebtorId
   * loose String'tir (Prisma @relation YOK → FK/onDelete YOK); CaseDebtor silinince tahsilatın
   * "hangi borçludan geldiği" kanonik/muhasebe atfı öksüz kalır. null'a çekmek muhasebe izini
   * zayıflatır, cascade tahsilatı yok eder → ikisi de yanlış; doğru tercih BLOK.
   *
   * @remarks Çağrıldığı yerler:
   * - CaseDebtorController.removeCaseDebtor() → DELETE /case-debtors/:id (borçluyu dosyadan çıkar)
   */
  async removeCaseDebtor(tenantId: string, caseDebtorId: string) {
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId },
      include: { case: true },
    });

    if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
      throw new NotFoundException("Dosya borçlusu bulunamadı");
    }

    // Check if there are third parties linked
    const thirdPartyCount = await this.prisma.thirdParty.count({
      where: { caseDebtorId },
    });

    if (thirdPartyCount > 0) {
      throw new BadRequestException(
        `Bu borçluya bağlı ${thirdPartyCount} üçüncü şahıs kaydı var. Önce bunları silin.`
      );
    }

    // Finansal bütünlük: bu borçluya bağlı tahsilat (Collection) varsa silmeyi BLOKLA.
    // Collection.caseDebtorId loose String'tir (Prisma @relation/FK yok) → CaseDebtor
    // silinince tahsilatın borçlu atfı öksüz kalır. Tenant-scoped sayım (multitenant +
    // defense-in-depth; caseDebtorId zaten benzersiz).
    const collectionCount = await this.prisma.collection.count({
      where: { caseDebtorId, tenantId },
    });

    if (collectionCount > 0) {
      throw new BadRequestException(
        "Bu borçluya bağlı tahsilat kaydı bulunduğu için borçlu dosyadan çıkarılamaz. " +
          "Önce tahsilat kaydını başka borçluya aktarın, atfı kaldırın veya tahsilatı iptal/düzeltin."
      );
    }

    // Borçlu çıkarılırken açık adres görevlerini iptal et + CaseDebtor'u sil — atomik.
    return this.prisma.$transaction(async (tx) => {
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
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return tx.caseDebtor.delete({ where: { id: caseDebtorId } });
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
