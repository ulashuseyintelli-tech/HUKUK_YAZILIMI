import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { normalizePersonName } from "@/common/name-match.util"; // RFA-008 isim-fallback dedup
import {
  CreateThirdPartyDto,
  UpdateThirdPartyDto,
  RecordIhbarnameDto,
  RecordResponseDto,
} from "./dto/third-party.dto";
import { CollectionService } from "../collection/collection.service";
import {
  CollectionChannel,
  CollectionSource,
  CollectionStatus,
  CollectionType,
} from "../collection/dto/collection.dto";
import { CaseDebtorLifecycleGuardService } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service";

export interface ExternalCaseReceiptInput {
  amount: number;
  date?: string;
  notes?: string;
  syncToMainCase?: boolean;
  idempotencyKey?: string;
  confirmationToken?: string;
}

function externalReceiptIdentity(externalCaseId: string, dto: ExternalCaseReceiptInput): string {
  const explicit = dto.idempotencyKey?.trim();
  const payload = explicit || JSON.stringify({
    externalCaseId,
    amountMinor: BigInt(Math.round(Number(dto.amount) * 100)).toString(),
    date: dto.date ? new Date(dto.date).toISOString() : null,
    notes: dto.notes?.trim() || null,
  });
  return createHash("sha256").update(payload).digest("hex");
}

@Injectable()
export class ThirdPartyService {
  constructor(
    private prisma: PrismaService,
    // G3d: alacak haczi tahsilatını ana dosyaya kanonik yoldan yansıtır.
    private collectionService: CollectionService,
    private caseDebtorLifecycleGuard: CaseDebtorLifecycleGuardService,
  ) {}

  // 89 İhbarname için 7 günlük cevap süresi
  private readonly RESPONSE_DEADLINE_DAYS = 7;

  async getThirdPartiesForCaseDebtor(tenantId: string, caseDebtorId: string) {
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId },
      include: { case: true },
    });

    if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
      throw new NotFoundException("Dosya borçlusu bulunamadı");
    }

    return this.prisma.thirdParty.findMany({
      where: { caseDebtorId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Üçüncü şahıs (89 ihbarname muhatabı) ekle.
   *
   * RFA-008 dedup (idempotent, guard YOK iken sessiz duplicate oluyordu):
   * - identityNo varsa → caseDebtorId + identityNo eşleşmesi (otoriter; type farkı overwrite ETMEZ).
   * - identityNo yoksa → caseDebtorId + type + normalize-isim eşleşmesi (sadece isim YETMEZ:
   *   "kiracı Ahmet" ≠ "işveren Ahmet"). Eşleşme → MEVCUT döndür (_existingReturned), yeni satır YOK.
   * - 409 YOK (alt kayıt; re-add = no-op, 89-ihbarname state'i ezilmez). forceCreate YOK.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ThirdPartyController.createThirdParty() → POST /case-debtors/:caseDebtorId/third-parties (ThirdPartyPanel)
   * </remarks>
   */
  async create(tenantId: string, caseDebtorId: string, dto: CreateThirdPartyDto) {
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, caseDebtorId);

    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId },
      include: { case: true },
    });

    if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
      throw new NotFoundException("Dosya borçlusu bulunamadı");
    }

    // RFA-008: aynı caseDebtor içinde dedup. identityNo otoriter; yoksa type+normalize-isim.
    const siblings = await this.prisma.thirdParty.findMany({ where: { caseDebtorId } });
    const wantName = normalizePersonName(dto.name);
    const dup = siblings.find((t) =>
      dto.identityNo
        ? t.identityNo === dto.identityNo
        : !!wantName && t.type === dto.type && normalizePersonName(t.name) === wantName,
    );
    if (dup) {
      // idempotent: mevcut kaydı döndür, overwrite YOK (type/89-ihbarname state korunur).
      return { ...(dup as any), _existingReturned: true };
    }

    return this.prisma.thirdParty.create({
      data: {
        tenantId,
        caseDebtorId,
        ...dto,
      },
    });
  }


  async update(tenantId: string, thirdPartyId: string, dto: UpdateThirdPartyDto) {
    const thirdParty = await this.prisma.thirdParty.findFirst({
      where: { id: thirdPartyId, tenantId },
    });

    if (!thirdParty) {
      throw new NotFoundException("Üçüncü şahıs bulunamadı");
    }

    // Gate-2: pasif CaseDebtor üzerinde operasyonel write engellenir (tarihsel read serbest).
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, thirdParty.caseDebtorId);

    return this.prisma.thirdParty.update({
      where: { id: thirdPartyId },
      data: dto,
    });
  }

  async delete(tenantId: string, thirdPartyId: string) {
    const thirdParty = await this.prisma.thirdParty.findFirst({
      where: { id: thirdPartyId, tenantId },
    });

    if (!thirdParty) {
      throw new NotFoundException("Üçüncü şahıs bulunamadı");
    }

    // Gate-2: pasif CaseDebtor üzerinde operasyonel write engellenir (tarihsel read serbest).
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, thirdParty.caseDebtorId);

    return this.prisma.thirdParty.delete({ where: { id: thirdPartyId } });
  }

  // ==================== İHBARNAME TRACKING ====================

  async recordIhbarname(tenantId: string, thirdPartyId: string, dto: RecordIhbarnameDto) {
    const thirdParty = await this.prisma.thirdParty.findFirst({
      where: { id: thirdPartyId, tenantId },
    });

    if (!thirdParty) {
      throw new NotFoundException("Üçüncü şahıs bulunamadı");
    }

    // Gate-2: pasif CaseDebtor üzerinde operasyonel write engellenir (tarihsel read serbest).
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, thirdParty.caseDebtorId);

    const updateData: any = {};
    const dateField = `ihbarname${dto.ihbarnameType}_date`;
    const statusField = `ihbarname${dto.ihbarnameType}_status`;

    updateData[dateField] = new Date(dto.date);
    updateData[statusField] = dto.status || "GONDERILDI";

    return this.prisma.thirdParty.update({
      where: { id: thirdPartyId },
      data: updateData,
    });
  }

  async recordResponse(tenantId: string, thirdPartyId: string, dto: RecordResponseDto) {
    const thirdParty = await this.prisma.thirdParty.findFirst({
      where: { id: thirdPartyId, tenantId },
    });

    if (!thirdParty) {
      throw new NotFoundException("Üçüncü şahıs bulunamadı");
    }

    // Gate-2 ÜRÜN KARARI: recordResponse = 3. şahıstan gelen CEVAP = "late-result" (dış sistem
    // sonucu). Pasifleştirme SONRASI gelen cevap kaydedilebilmeli → lifecycle guard BİLİNÇLİ
    // EKLENMEZ (diğer operasyonel write'lar bloklu; bkz. update/delete/recordIhbarname/sendNext).

    // Update the latest ihbarname status to CEVAP_ALINDI
    const updateData: any = {
      responseDate: new Date(dto.responseDate),
      responseContent: dto.responseContent,
    };

    // Find which ihbarname was sent last and update its status
    if (thirdParty.ihbarname89_3_date) {
      updateData.ihbarname89_3_status = "CEVAP_ALINDI";
    } else if (thirdParty.ihbarname89_2_date) {
      updateData.ihbarname89_2_status = "CEVAP_ALINDI";
    } else if (thirdParty.ihbarname89_1_date) {
      updateData.ihbarname89_1_status = "CEVAP_ALINDI";
    }

    return this.prisma.thirdParty.update({
      where: { id: thirdPartyId },
      data: updateData,
    });
  }

  // ==================== OVERDUE ALERTS ====================

  async getOverdueIhbarnames(tenantId: string) {
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() - this.RESPONSE_DEADLINE_DAYS);

    const overdueThirdParties = await this.prisma.thirdParty.findMany({
      where: {
        tenantId,
        responseDate: null,
        OR: [
          {
            ihbarname89_1_date: { lte: deadlineDate },
            ihbarname89_1_status: { in: ["GONDERILDI", "TEBLIG_EDILDI"] },
          },
          {
            ihbarname89_2_date: { lte: deadlineDate },
            ihbarname89_2_status: { in: ["GONDERILDI", "TEBLIG_EDILDI"] },
          },
          {
            ihbarname89_3_date: { lte: deadlineDate },
            ihbarname89_3_status: { in: ["GONDERILDI", "TEBLIG_EDILDI"] },
          },
        ],
      },
      include: {
        caseDebtor: {
          include: {
            case: { select: { id: true, fileNumber: true } },
            debtor: { select: { id: true, name: true } },
          },
        },
      },
    });

    return overdueThirdParties.map((tp) => ({
      ...tp,
      daysOverdue: this.calculateDaysOverdue(tp),
    }));
  }

  private calculateDaysOverdue(thirdParty: any): number {
    const now = new Date();
    let latestDate: Date | null = null;

    if (thirdParty.ihbarname89_3_date) {
      latestDate = new Date(thirdParty.ihbarname89_3_date);
    } else if (thirdParty.ihbarname89_2_date) {
      latestDate = new Date(thirdParty.ihbarname89_2_date);
    } else if (thirdParty.ihbarname89_1_date) {
      latestDate = new Date(thirdParty.ihbarname89_1_date);
    }

    if (!latestDate) return 0;

    const deadline = new Date(latestDate);
    deadline.setDate(deadline.getDate() + this.RESPONSE_DEADLINE_DAYS);

    const diffTime = now.getTime() - deadline.getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  // ==================== 89 İHBARNAME ZİNCİRİ OTOMASYONU ====================

  /**
   * Üçüncü şahıs için mevcut durumu ve sonraki adımı belirle
   */
  getIhbarnameStatus(thirdParty: any): {
    currentStage: "NONE" | "89_1" | "89_2" | "89_3" | "COMPLETED";
    currentStatus: string | null;
    nextAction: "SEND_89_1" | "SEND_89_2" | "SEND_89_3" | "WAIT_RESPONSE" | "COMPLETED" | null;
    daysRemaining: number | null;
    canProceed: boolean;
    message: string;
  } {
    const now = new Date();
    
    // Cevap alındıysa tamamlandı
    if (thirdParty.responseDate) {
      return {
        currentStage: "COMPLETED",
        currentStatus: "CEVAP_ALINDI",
        nextAction: "COMPLETED",
        daysRemaining: null,
        canProceed: false,
        message: "Üçüncü şahıstan cevap alındı",
      };
    }

    // 89/3 gönderilmişse
    if (thirdParty.ihbarname89_3_date) {
      const deadline = new Date(thirdParty.ihbarname89_3_date);
      deadline.setDate(deadline.getDate() + this.RESPONSE_DEADLINE_DAYS);
      const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        currentStage: "89_3",
        currentStatus: thirdParty.ihbarname89_3_status,
        nextAction: daysRemaining <= 0 ? "COMPLETED" : "WAIT_RESPONSE",
        daysRemaining: Math.max(0, daysRemaining),
        canProceed: false,
        message: daysRemaining <= 0 
          ? "89/3 süresi doldu - Haciz işlemi başlatılabilir" 
          : `89/3 cevap bekleniyor (${daysRemaining} gün kaldı)`,
      };
    }

    // 89/2 gönderilmişse
    if (thirdParty.ihbarname89_2_date) {
      const deadline = new Date(thirdParty.ihbarname89_2_date);
      deadline.setDate(deadline.getDate() + this.RESPONSE_DEADLINE_DAYS);
      const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        currentStage: "89_2",
        currentStatus: thirdParty.ihbarname89_2_status,
        nextAction: daysRemaining <= 0 ? "SEND_89_3" : "WAIT_RESPONSE",
        daysRemaining: Math.max(0, daysRemaining),
        canProceed: daysRemaining <= 0,
        message: daysRemaining <= 0 
          ? "89/2 süresi doldu - 89/3 gönderilebilir" 
          : `89/2 cevap bekleniyor (${daysRemaining} gün kaldı)`,
      };
    }

    // 89/1 gönderilmişse
    if (thirdParty.ihbarname89_1_date) {
      const deadline = new Date(thirdParty.ihbarname89_1_date);
      deadline.setDate(deadline.getDate() + this.RESPONSE_DEADLINE_DAYS);
      const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        currentStage: "89_1",
        currentStatus: thirdParty.ihbarname89_1_status,
        nextAction: daysRemaining <= 0 ? "SEND_89_2" : "WAIT_RESPONSE",
        daysRemaining: Math.max(0, daysRemaining),
        canProceed: daysRemaining <= 0,
        message: daysRemaining <= 0 
          ? "89/1 süresi doldu - 89/2 gönderilebilir" 
          : `89/1 cevap bekleniyor (${daysRemaining} gün kaldı)`,
      };
    }

    // Hiç ihbarname gönderilmemişse
    return {
      currentStage: "NONE",
      currentStatus: null,
      nextAction: "SEND_89_1",
      daysRemaining: null,
      canProceed: true,
      message: "89/1 ihbarnamesi gönderilebilir",
    };
  }

  /**
   * Dosya için tüm üçüncü şahısların durumunu getir
   */
  async getThirdPartiesWithStatus(tenantId: string, caseDebtorId: string) {
    const thirdParties = await this.getThirdPartiesForCaseDebtor(tenantId, caseDebtorId);
    
    return thirdParties.map(tp => ({
      ...tp,
      ihbarnameStatus: this.getIhbarnameStatus(tp),
    }));
  }

  /**
   * Sonraki ihbarnameyi otomatik gönder (89/1 -> 89/2 -> 89/3)
   */
  async sendNextIhbarname(tenantId: string, thirdPartyId: string) {
    const thirdParty = await this.prisma.thirdParty.findFirst({
      where: { id: thirdPartyId, tenantId },
    });

    if (!thirdParty) {
      throw new NotFoundException("Üçüncü şahıs bulunamadı");
    }

    // Gate-2: pasif CaseDebtor üzerinde operasyonel write engellenir (tarihsel read serbest).
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, thirdParty.caseDebtorId);

    const status = this.getIhbarnameStatus(thirdParty);
    
    if (!status.canProceed) {
      throw new BadRequestException(status.message);
    }

    const now = new Date();
    let updateData: any = {};

    switch (status.nextAction) {
      case "SEND_89_1":
        updateData = {
          ihbarname89_1_date: now,
          ihbarname89_1_status: "GONDERILDI",
        };
        break;
      case "SEND_89_2":
        updateData = {
          ihbarname89_2_date: now,
          ihbarname89_2_status: "GONDERILDI",
        };
        break;
      case "SEND_89_3":
        updateData = {
          ihbarname89_3_date: now,
          ihbarname89_3_status: "GONDERILDI",
        };
        break;
      default:
        throw new BadRequestException("Gönderilebilecek ihbarname yok");
    }

    const updated = await this.prisma.thirdParty.update({
      where: { id: thirdPartyId },
      data: updateData,
    });

    return {
      ...updated,
      ihbarnameStatus: this.getIhbarnameStatus(updated),
    };
  }

  /**
   * Üçüncü şahıs türüne göre önerilen işlem
   */
  getSuggestedAction(thirdPartyType: string): {
    suggestedIhbarname: "HACIZ_IHBARNAMESI" | "MAAS_HACZI" | "KIRA_HACZI" | "BANKA_HACZI";
    description: string;
  } {
    switch (thirdPartyType) {
      case "BANKA":
        return {
          suggestedIhbarname: "BANKA_HACZI",
          description: "Banka hesaplarına haciz ihbarnamesi (89/1) gönderilmesi önerilir",
        };
      case "ISVEREN":
        return {
          suggestedIhbarname: "MAAS_HACZI",
          description: "Maaş haczi için 89/1 ihbarnamesi gönderilmesi önerilir",
        };
      case "KIRACI":
        return {
          suggestedIhbarname: "KIRA_HACZI",
          description: "Kira alacağına haciz için 89/1 ihbarnamesi gönderilmesi önerilir",
        };
      default:
        return {
          suggestedIhbarname: "HACIZ_IHBARNAMESI",
          description: "Alacak haczi için 89/1 ihbarnamesi gönderilmesi önerilir",
        };
    }
  }

  /**
   * Dosya için 89 ihbarname özeti
   */
  async getIhbarnameSummary(tenantId: string, caseId: string) {
    // Tenant boundary: caseId bilinse bile başka tenant dosyasının özeti okunamasın.
    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    if (!caseRow) {
      throw new NotFoundException("Dosya bulunamadı");
    }

    const caseDebtors = await this.prisma.caseDebtor.findMany({
      where: { caseId, case: { tenantId } },
      include: {
        thirdParties: true,
        debtor: { select: { id: true, name: true } },
      },
    });

    const summary = {
      totalThirdParties: 0,
      pending89_1: 0,
      pending89_2: 0,
      pending89_3: 0,
      waitingResponse: 0,
      completed: 0,
      overdueCount: 0,
      debtors: [] as any[],
    };

    for (const cd of caseDebtors) {
      const debtorSummary = {
        debtorId: cd.debtorId,
        debtorName: cd.debtor?.name,
        thirdParties: [] as any[],
      };

      for (const tp of cd.thirdParties) {
        summary.totalThirdParties++;
        const status = this.getIhbarnameStatus(tp);

        if (status.currentStage === "COMPLETED") {
          summary.completed++;
        } else if (status.nextAction === "WAIT_RESPONSE") {
          summary.waitingResponse++;
          if (status.daysRemaining !== null && status.daysRemaining <= 0) {
            summary.overdueCount++;
          }
        } else if (status.nextAction === "SEND_89_1") {
          summary.pending89_1++;
        } else if (status.nextAction === "SEND_89_2") {
          summary.pending89_2++;
        } else if (status.nextAction === "SEND_89_3") {
          summary.pending89_3++;
        }

        debtorSummary.thirdParties.push({
          id: tp.id,
          name: tp.name,
          type: tp.type,
          status,
        });
      }

      if (debtorSummary.thirdParties.length > 0) {
        summary.debtors.push(debtorSummary);
      }
    }

    return summary;
  }

  // ==================== DIŞ DOSYALAR (ALACAK HACZİ) ====================

  /**
   * Borçlunun alacaklı olduğu dış dosyaları getir
   */
  async getExternalCases(tenantId: string, caseDebtorId: string) {
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId },
      include: { case: true },
    });

    if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
      throw new NotFoundException("Dosya borçlusu bulunamadı");
    }

    return (this.prisma as any).externalCase.findMany({
      where: { caseDebtorId, tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Yeni dış dosya ekle (alacak haczi)
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - ThirdPartyController.createExternalCase() → POST /case-debtors/:caseDebtorId/external-cases (alacak haczi dış dosya oluşturma)
  /// </remarks>
  async createExternalCase(tenantId: string, caseDebtorId: string, dto: any) {
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, caseDebtorId);

    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId },
      include: { case: true },
    });

    if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
      throw new NotFoundException("Dosya borçlusu bulunamadı");
    }

    const externalOffice = dto.externalOffice;
    const externalCaseNo = dto.externalCaseNo;
    const logicalIdentityKey = {
      tenantId,
      caseDebtorId,
      externalOffice,
      externalCaseNo,
    };

    // I15-PHASE-A (owner GO-COMPLETE, legacy TASK 09): ayni borclunun ayni icra
    // dairesindeki ayni dis dosyasi iki kez "Alacak Haczi" olarak kaydedilmesin.
    // Onceden bu metodda hicbir dedup yoktu (ne app-level ne DB-level). Ozgun
    // desen: findFirst on-kontrolu (hizli, cogunlukla yeterli yol) + DB composite
    // unique constraint + P2002 yakalayip idempotent replay (Collection.create()
    // PR #1969 "make bank admission atomic" ile ayni felsefe — bkz. migration
    // 20260730170000_debtor_external_case_logical_identity_unique).
    const existing = await (this.prisma as any).externalCase.findUnique({
      where: { external_case_logical_identity: logicalIdentityKey },
    });
    if (existing) {
      return existing;
    }

    try {
      return await (this.prisma as any).externalCase.create({
        data: {
          tenantId,
          caseDebtorId,
          externalOffice,
          externalOfficeId: dto.externalOfficeId,
          externalCaseNo,
          counterpartyName: dto.counterpartyName,
          counterpartyId: dto.counterpartyId,
          claimAmount: dto.claimAmount,
          claimCurrency: dto.claimCurrency || "TRY",
          attachmentStatus: dto.attachmentStatus || "HACIZ_TALEP",
          attachedAt: dto.attachedAt ? new Date(dto.attachedAt) : null,
          notes: dto.notes,
          priorityNote: dto.priorityNote,
        },
      });
    } catch (e: unknown) {
      // On-kontrole ragmen kalan yaris penceresi (iki eszamanli istek) icin DB
      // constraint son savunma hattidir; P2002 -> idempotent replay (ham 500 YOK).
      //
      // NOT: meta.target'in icerigi veritabanina gore degisir (Postgres icin
      // Prisma bunu KOLON ADLARI dizisi olarak raporlar, constraint/index ADI
      // DEGIL) — bu yuzden bu create() cagrisinin TEK unique constraint'i
      // oldugu bilgisine dayanarak meta.target icerigini ayristirmiyoruz;
      // bu spesifik create() uzerindeki HERHANGI bir P2002 mantiksal-kimlik
      // celismesidir (ilk denemede meta.target'in constraint adini icerdigi
      // yanlis varsayimiyla yazilan surum CI'in gercek eszamanlilik yarisinda
      // yakalanmadan gecti — bkz. Phase A final rapor).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const row = await (this.prisma as any).externalCase.findUnique({
          where: { external_case_logical_identity: logicalIdentityKey },
        });
        if (row) return row;
      }
      throw e;
    }
  }

  /**
   * Dış dosya güncelle
   */
  async updateExternalCase(tenantId: string, externalCaseId: string, dto: any) {
    const externalCase = await (this.prisma as any).externalCase.findFirst({
      where: { id: externalCaseId, tenantId },
    });

    if (!externalCase) {
      throw new NotFoundException("Dış dosya bulunamadı");
    }

    // Gate-2: pasif CaseDebtor üzerinde operasyonel write engellenir (tarihsel read serbest).
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, externalCase.caseDebtorId);

    return (this.prisma as any).externalCase.update({
      where: { id: externalCaseId },
      data: {
        externalOffice: dto.externalOffice,
        externalCaseNo: dto.externalCaseNo,
        counterpartyName: dto.counterpartyName,
        claimAmount: dto.claimAmount,
        claimCurrency: dto.claimCurrency,
        attachmentStatus: dto.attachmentStatus,
        attachedAt: dto.attachedAt ? new Date(dto.attachedAt) : undefined,
        notes: dto.notes,
        priorityNote: dto.priorityNote,
      },
    });
  }

  /**
   * Dış dosyaya tahsilat ekle ve ana dosyaya yansıt
   */
  async addExternalCaseCollection(
    tenantId: string, 
    externalCaseId: string, 
    dto: ExternalCaseReceiptInput,
    actorUserId: string,
    correlationId?: string,
  ) {
    if (dto.syncToMainCase === false) {
      throw new BadRequestException({
        code: "EXTERNAL_RECEIPT_REQUIRES_CANONICAL_COLLECTION",
        message: "Dış dosya tahsilatı canonical Collection kaydı olmadan yazılamaz.",
      });
    }
    if (!actorUserId?.trim()) {
      throw new BadRequestException({ code: "EXTERNAL_RECEIPT_ACTOR_REQUIRED" });
    }
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException({ code: "EXTERNAL_RECEIPT_AMOUNT_INVALID" });
    }
    if (dto.date && Number.isNaN(new Date(dto.date).getTime())) {
      throw new BadRequestException({ code: "EXTERNAL_RECEIPT_DATE_INVALID" });
    }

    const externalCase = await (this.prisma as any).externalCase.findFirst({
      where: { id: externalCaseId, tenantId },
      include: {
        caseDebtor: {
          include: {
            case: true,
          },
        },
      },
    });

    if (!externalCase) {
      throw new NotFoundException("Dış dosya bulunamadı");
    }

    const caseId = externalCase.caseDebtor?.case?.id;
    if (!caseId) {
      throw new BadRequestException({ code: "EXTERNAL_RECEIPT_CASE_REQUIRED" });
    }
    const currency = String(externalCase.claimCurrency || "").trim().toUpperCase();
    if (!currency) {
      throw new BadRequestException({ code: "EXTERNAL_RECEIPT_CURRENCY_REQUIRED" });
    }

    const receiptIdentity = externalReceiptIdentity(externalCaseId, dto);
    const sourceId = `${externalCaseId}:${receiptIdentity}`;
    const existingReceipt = await (this.prisma as any).collection.findFirst({
      where: {
        tenantId,
        caseId,
        sourceType: CollectionSource.EXTERNAL_CASE,
        sourceId,
        status: { not: CollectionStatus.CANCELLED },
      },
      select: { date: true },
    });
    const collectionDate = dto.date
      ? new Date(dto.date)
      : existingReceipt?.date || startOfCurrentUtcDay();

    await this.collectionService.create(
      tenantId,
      {
        caseId,
        idempotencyKey: `external-case:${externalCaseId}:${receiptIdentity}`,
        amount,
        currency,
        type: CollectionType.OTHER,
        channel: CollectionChannel.ICRA_DAIRESI,
        date: collectionDate.toISOString(),
        sourceType: CollectionSource.EXTERNAL_CASE,
        sourceId,
        description: `[Alacak Haczi] ${externalCase.externalOffice} ${externalCase.externalCaseNo} - ${externalCase.counterpartyName}${dto.notes ? ` - ${dto.notes}` : ''}`,
      },
      actorUserId,
      {
        correlationId,
        causationId: `external-case-receipt:${sourceId}`,
        producer: "EXTERNAL_CASE_RECEIPT",
        actor: { type: "HUMAN", userId: actorUserId },
      },
    );

    // ExternalCase.receivedAmount yalnız canonical Collection fact'lerinden yeniden
    // türetilir; retry/replay kümülatif projection'ı ikinci kez artırmaz.
    const receiptTotal = await (this.prisma as any).collection.aggregate({
      where: {
        tenantId,
        caseId,
        sourceType: CollectionSource.EXTERNAL_CASE,
        status: CollectionStatus.CONFIRMED,
        OR: [
          { sourceId: externalCaseId },
          { sourceId: { startsWith: `${externalCaseId}:` } },
        ],
      },
      _sum: { amount: true },
    });
    const newReceived = Number(receiptTotal?._sum?.amount) || 0;
    const claimAmount = Number(externalCase.claimAmount);
    let newStatus = externalCase.attachmentStatus;
    if (newReceived > 0 && newStatus !== "KAPANDI") {
      newStatus = "TAHSIL_BASLADI";
    }
    if (newReceived >= claimAmount) {
      newStatus = "KAPANDI";
    }
    const noteMarker = `[Collection:${receiptIdentity}]`;
    const collectionNote = `${noteMarker} [${collectionDate.toLocaleDateString("tr-TR")}] Alacak Haczi Tahsilatı: ${amount.toLocaleString("tr-TR")} ${currency} - Dış Dosya: ${externalCase.externalCaseNo}${dto.notes ? ` - ${dto.notes}` : ""}`;
    const notes = externalCase.notes?.includes(noteMarker)
      ? externalCase.notes
      : externalCase.notes
        ? `${externalCase.notes}\n${collectionNote}`
        : collectionNote;

    return (this.prisma as any).externalCase.update({
      where: { id: externalCaseId },
      data: {
        receivedAmount: newReceived,
        attachmentStatus: newStatus,
        lastReceivedAt: collectionDate,
        notes,
      },
    });
  }

  /**
   * Dış dosya sil
   */
  async deleteExternalCase(tenantId: string, externalCaseId: string) {
    const externalCase = await (this.prisma as any).externalCase.findFirst({
      where: { id: externalCaseId, tenantId },
    });

    if (!externalCase) {
      throw new NotFoundException("Dış dosya bulunamadı");
    }

    // Gate-2: pasif CaseDebtor üzerinde operasyonel write engellenir (tarihsel read serbest).
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, externalCase.caseDebtorId);

    // Tahsilat varsa uyar
    if (externalCase.receivedAmount && Number(externalCase.receivedAmount) > 0) {
      throw new BadRequestException(
        `Bu dış dosyada ${Number(externalCase.receivedAmount).toLocaleString('tr-TR')} ${externalCase.claimCurrency} tahsilat kaydı bulunmaktadır. Silmek için önce tahsilatları iptal edin.`
      );
    }

    return (this.prisma as any).externalCase.delete({
      where: { id: externalCaseId },
    });
  }
}

function startOfCurrentUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
