import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { TebligatStatus } from "@prisma/client";
import {
  AddDebtorToCaseDto,
  UpdateCaseDebtorDto,
  NotificationMode,
} from "./dto/case-debtor.dto";
import { AuditService } from "../audit/audit.service";
import { OfficeApprovalService } from "../office-approval/office-approval.service";
import { CaseDebtorLifecycleGuardService } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service";
import type { AuditActor } from "@/modules/client/client.service";
import { buildCaseDebtorFieldDiff } from "./case-debtor-audit.util";

@Injectable()
export class CaseDebtorService {
  // C1A: OfficeApprovalService passivate capability-gate için (DebtorService.
  // assertCanManageDebtorLifecycle / LawyerService.assertCanManageLawyerLifecycle ile birebir
  // desen). AuditService @Global (AuditModule) — DebtorModule zaten import ediyor (Task D1A).
  // DBND-D2: caseDebtorLifecycleGuard opsiyonel — DebtorService'teki AYNI desen (mevcut test
  // dosyalarının çoğu updateCaseDebtor()'a dokunmuyor, kırılmasınlar).
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
    private readonly caseDebtorLifecycleGuard?: CaseDebtorLifecycleGuardService,
  ) {}

  private requireCaseDebtorLifecycleGuard(): CaseDebtorLifecycleGuardService {
    if (!this.caseDebtorLifecycleGuard) {
      throw new Error("CaseDebtorLifecycleGuardService yapılandırılmadı");
    }
    return this.caseDebtorLifecycleGuard;
  }

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

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseDebtorController.getCaseDebtors() → GET /cases/:caseId/debtors (legacy CaseDebtor okuyucu; ACTIVE-only default)
  /// </remarks>
  async getCaseDebtors(tenantId: string, caseId: string) {
    // Verify case belongs to tenant
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });

    if (!caseRecord) {
      throw new NotFoundException("Takip bulunamadı");
    }

    return this.prisma.caseDebtor.findMany({
      where: { caseId, lifecycleStatus: "ACTIVE" },
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
  /// - CaseDebtorController.updateCaseDebtor() → PUT /case-debtors/:id (Dosya borçlusu bilgilerini güncelleme;
  ///   userId req.user.id'den — DBND-D2)
  /// DBND-D2: PASSIVE kontrolü artık merkezi CaseDebtorLifecycleGuardService (diğer tüm CaseDebtor
  /// mutasyon yollarıyla aynı desen) — eski kopya inline kontrol kaldırıldı. role/liabilityAmount
  /// dahil değişen alanlar CASE_DEBTOR_UPDATE audit'e yazılır (değişiklik yoksa audit YOK).
  /// </remarks>
  async updateCaseDebtor(tenantId: string, caseDebtorId: string, dto: UpdateCaseDebtorDto, actor?: AuditActor) {
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

    await this.requireCaseDebtorLifecycleGuard().assertActiveByCaseDebtorId(tenantId, caseDebtorId, {
      expectedCaseId: caseDebtor.caseId,
    });

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

    const result = await this.prisma.caseDebtor.update({
      where: { id: caseDebtorId },
      data: dto,
      include: {
        debtor: { include: { debtorAddresses: true } },
        selectedAddress: true,
      },
    });

    // DBND-D2: role/liabilityAmount dahil değişen alanlar audit'e yazılır; gerçek değişiklik
    // yoksa (fieldDiff boş) audit YOK.
    const fieldDiff = buildCaseDebtorFieldDiff(caseDebtor, result);
    if (fieldDiff.length > 0) {
      await this.audit.log({
        tenantId,
        action: "CASE_DEBTOR_UPDATE",
        entityType: "CASE_DEBTOR",
        entityId: caseDebtorId,
        userId: actor?.userId,
        metadata: { fieldDiff },
      });
    }

    return result;
  }

  /**
   * C1A (owner-locked 2026-07-02) — CaseDebtor passivate yetkisi. ClientService.
   * assertCanManageLifecycle / DebtorService.assertCanManageDebtorLifecycle / LawyerService.
   * assertCanManageLawyerLifecycle / PoaService.assertCanManagePoaLifecycle ile BİREBİR desen
   * (reuse, yeni altyapı YOK): PARTNER veya canApproveOfficeActions=true delege avukat.
   */
  private async assertCanManageCaseDebtorLifecycle(userId: string | undefined | null, tenantId: string): Promise<void> {
    if (!userId || !(await this.officeApproval.isApproverEligible(userId, tenantId))) {
      throw new ForbiddenException(
        "Dosya borçlusunu pasifleştirme yetkiniz yok (PARTNER veya yetkilendirilmiş avukat gerekir)"
      );
    }
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseDebtorController.removeCaseDebtor() → DELETE /case-debtors/:id (dosya borçlusunu aktif işlem öznesi olmaktan çıkarır; userId req.user.id'den; Task C1A)
  ///
  /// Task C1A: passivate semantiği DEĞİŞMEDİ (lifecycleStatus=PASSIVE, hard delete YOK, zaten
  /// PASSIVE ise no-op). Eklenen: capability gate (mutasyondan ÖNCE, addressTask iptali dahil hiçbir
  /// yazma yetkisiz aktörle olmaz) + aynı transaction içinde AuditLog (yalnız GERÇEK geçiş olduğunda
  /// — no-op dalında audit YOK, çünkü oldValues=newValues anlamsız olurdu).
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

    // C1A: passivate yetkisi — transaction'dan ÖNCE (yetkisiz aktör addressTask iptali dahil
    // hiçbir yazma yapmaz).
    await this.assertCanManageCaseDebtorLifecycle(currentUserId, tenantId);

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

      const updated = await tx.caseDebtor.update({
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

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: "CASE_DEBTOR_PASSIVATE",
        entityType: "CASE_DEBTOR",
        entityId: caseDebtorId,
        userId: currentUserId ?? undefined,
        oldValues: caseDebtor,
        newValues: {
          lifecycleStatus: "PASSIVE",
          passivatedAt: now,
          passivatedById: currentUserId ?? null,
          passivationReason: "MANUAL",
        },
      });

      return updated;
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

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseDebtorController.getCaseDebtorStatistics() → GET /cases/:caseId/debtors/statistics (legacy CaseDebtor istatistikleri; ACTIVE-only)
  /// </remarks>
  async getCaseDebtorStatistics(tenantId: string, caseId: string) {
    const caseDebtors = await this.prisma.caseDebtor.findMany({
      where: { caseId, lifecycleStatus: "ACTIVE", case: { tenantId } },
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

  /**
   * DBND-D6-TEBLIGAT-BRIDGE (owner-locked, bkz `docs/design/d6-legal-semantics-triage.md` Q5):
   * Salt-okuma sinyal — bu CaseDebtor'a bağlı AKTİF/BEKLEYEN Tebligat sayısını döner.
   * Otomatik hukukî hüküm ÜRETMEZ (tebligatı geçersiz kılmaz, icra/tahsilatı durdurmaz),
   * Collection/Tebligat kaydına hiçbir YAZMA yapmaz. Yalnız "manuel hukukî inceleme
   * önerilir" seviyesinde bir gözlemdir. Collection bu bridge'in KAPSAMI DIŞINDA (owner
   * kararı: Collection bir "aktif süreç" değil, mali işlem kaydıdır — ayrı bir backlog
   * adayı, D6-Collection attribution signal, ileride ayrıca değerlendirilebilir).
   * NULL caseDebtorId'li Tebligat kayıtları (bu CaseDebtor'a hiç bağlanmamış olanlar) bu
   * sorgunun kapsamı dışındadır — "aktif süreç yok" ile "veri bağlanmamış" birbirine
   * KARIŞTIRILMAMALI.
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DebtorController.getCaseDebtorActiveProcessSummary() → GET /debtors/case-debtors/:caseDebtorId/active-process-summary
  /// </remarks>
  async getActiveProcessSummary(tenantId: string, caseDebtorId: string) {
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId, case: { tenantId } },
      select: { id: true },
    });
    if (!caseDebtor) {
      throw new NotFoundException("Dosya borçlusu bulunamadı");
    }

    const activeTebligatCount = await this.prisma.tebligat.count({
      where: {
        caseDebtorId,
        status: {
          in: [
            TebligatStatus.HAZIRLANDI,
            TebligatStatus.GONDERILDI,
            TebligatStatus.MUHTARLIGA_BIRAKILDI,
            TebligatStatus.IADE_GELDI,
          ],
        },
      },
    });

    return {
      caseDebtorId,
      activeTebligatCount,
      manualReviewRecommended: activeTebligatCount > 0,
    };
  }
}
