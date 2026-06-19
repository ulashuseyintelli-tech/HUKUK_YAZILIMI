import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { DebtorService } from "../debtor/debtor.service";
import { UetsService } from "./uets.service"; // PR-S1: UETS/KEP teslim durumu sorgulama
import {
  CreateTebligatDto,
  RecordPttResultDto,
  UpdateTebligatDto,
  TebligatAddressType,
  TebligatStatus,
  TebligatPttResult,
  TebligatNextAction,
  Tk21Type,
  AddressPriorityCheck,
  TebligatSummary,
} from "./dto/tebligat.dto";

// PR-D5-b-1: TebligatStatus → CaseDebtor ServiceStatus eşleme (O-b). Tebligat=entegrasyon/evrak,
// CaseDebtor.serviceStatus=KANONİK canlı durum. Tek yönlü (Tebligat → CaseDebtor).
export const TEBLIGAT_TO_SERVICE_STATUS: Record<string, string> = {
  HAZIRLANDI: "READY",
  GONDERILDI: "SENT",
  TESLIM_EDILDI: "DELIVERED",
  IADE_GELDI: "RETURNED",
  MUHTARLIGA_BIRAKILDI: "MUHTAR",
  TEBLIG_EDILMIS_SAYILDI: "DELIVERED",
  IPTAL: "FAILED",
};
// O-c: ilk sürümde yalnız SONUÇ olayları senkronlanır (DELIVERED/RETURNED/MUHTAR).
export const SYNC_SERVICE_STATUSES = new Set(["DELIVERED", "RETURNED", "MUHTAR"]);
// PTT sonucu → ServiceReturnReason (istihbarat [C] MOVED/ADDRESS_NOT_FOUND tetiği için).
export const PTT_RESULT_TO_RETURN_REASON: Record<string, string> = {
  TASINMIS: "MOVED",
  ADRESTE_BULUNAMADI: "ADDRESS_NOT_FOUND",
  ADRES_YETERSIZ: "ADDRESS_NOT_FOUND",
  BINA_YIKILMIS: "ADDRESS_NOT_FOUND",
  ADRES_KAPALI: "ADDRESS_NOT_FOUND",
  TANIMIYOR: "OTHER",
  VEFAT: "DECEASED",
};

// PR-S1: UETS/KEP teslim durumu (UetsDeliveryStatus) → TebligatStatus eşleme.
// Yalnız TERMİNAL sonuçlar eşlenir; ara durumlar (GONDERILDI/OKUNAMADI) → undefined = no-op
// (durum değiştirilmez, senkron tetiklenmez). TESLIM_EDILDI → DELIVERED (sync set'inde),
// HATA → IPTAL/FAILED (sync set'i DIŞINDA, CaseDebtor'a yansımaz = güvenli).
export const ELECTRONIC_DELIVERY_TO_TEBLIGAT_STATUS: Record<string, TebligatStatus> = {
  TESLIM_EDILDI: TebligatStatus.TESLIM_EDILDI,
  HATA: TebligatStatus.IPTAL,
};

@Injectable()
export class TebligatService {
  private readonly logger = new Logger(TebligatService.name);

  // TK 21/2 için tebliğ edilmiş sayılma süresi (gün)
  private readonly TK_21_2_DAYS = 15;

  constructor(
    private prisma: PrismaService,
    private debtorService: DebtorService, // PR-D5-b-1: CaseDebtor senkronu
    private uetsService: UetsService // PR-S1: UETS/KEP teslim durumu
  ) {}

  // ==================== CRUD İŞLEMLERİ ====================

  /**
   * Yeni tebligat oluştur
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TebligatController.create() → POST /tebligat (tebligat oluşturma)
  /// </remarks>
  async create(tenantId: string, dto: CreateTebligatDto) {
    // Dosya kontrolü
    const caseData = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });

    if (!caseData) {
      throw new NotFoundException("Dosya bulunamadı");
    }

    await this.validateCreateCaseDebtorAddress(
      tenantId,
      dto.caseId,
      dto.caseDebtorId,
      dto.addressId
    );

    // Adres öncelik kontrolü
    const priorityCheck = await this.checkAddressPriority(
      tenantId,
      dto.caseId,
      dto.caseDebtorId,
      dto.addressType
    );

    if (priorityCheck.mustUseBilinen && dto.addressType !== TebligatAddressType.BILINEN) {
      throw new BadRequestException(
        "Önce bilinen adrese tebligat çıkarılmalıdır. " + priorityCheck.message
      );
    }

    return (this.prisma as any).tebligat.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        caseDebtorId: dto.caseDebtorId,
        tebligatType: dto.tebligatType,
        addressType: dto.addressType,
        addressId: dto.addressId,
        addressText: dto.addressText,
        city: dto.city,
        district: dto.district,
        recipientName: dto.recipientName,
        recipientTcVkn: dto.recipientTcVkn,
        channel: dto.channel,
        status: TebligatStatus.HAZIRLANDI,
        notes: dto.notes,
      },
    });
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TebligatService.create() → tebligat oluşturma öncesi CaseDebtor ve adres sahiplik kontrolü
  /// </remarks>
  private async validateCreateCaseDebtorAddress(
    tenantId: string,
    caseId: string,
    caseDebtorId?: string | null,
    addressId?: string | null
  ) {
    const hasCaseDebtorId = caseDebtorId !== undefined && caseDebtorId !== null;
    const hasAddressId = addressId !== undefined && addressId !== null;

    if (!hasCaseDebtorId && !hasAddressId) {
      return;
    }

    if (hasAddressId && !hasCaseDebtorId) {
      throw new BadRequestException("Adres bağlantısı için borçlu bağlantısı zorunludur");
    }

    let caseDebtor: {
      id: string;
      caseId: string;
      debtorId: string;
      case?: { tenantId: string } | null;
    } | null = null;

    if (hasCaseDebtorId) {
      if (caseDebtorId.trim() === "") {
        throw new BadRequestException("Tebligat borçlu bağlantısı geçersiz");
      }

      caseDebtor = await (this.prisma as any).caseDebtor.findUnique({
        where: { id: caseDebtorId },
        select: {
          id: true,
          caseId: true,
          debtorId: true,
          case: { select: { tenantId: true } },
        },
      });

      if (!caseDebtor) {
        throw new BadRequestException("Tebligat borçlu bağlantısı geçersiz");
      }

      if (caseDebtor.case?.tenantId !== tenantId) {
        throw new BadRequestException("Tebligat borçlu bağlantısı bu tenant'a ait değil");
      }

      if (caseDebtor.caseId !== caseId) {
        throw new BadRequestException("Tebligat borçlu bağlantısı bu dosyaya ait değil");
      }
    }

    if (!hasAddressId) {
      return;
    }

    if (addressId.trim() === "") {
      throw new BadRequestException("Tebligat adres bağlantısı geçersiz");
    }

    const debtorAddress = await (this.prisma as any).debtorAddress.findUnique({
      where: { id: addressId },
      select: {
        id: true,
        debtorId: true,
      },
    });

    if (!debtorAddress) {
      throw new BadRequestException("Tebligat adres bağlantısı geçersiz");
    }

    if (debtorAddress.debtorId !== caseDebtor?.debtorId) {
      throw new BadRequestException("Tebligat adres bağlantısı bu borçluya ait değil");
    }
  }

  /**
   * Tebligat getir
   */
  async findById(tenantId: string, id: string) {
    const tebligat = await (this.prisma as any).tebligat.findFirst({
      where: { id, tenantId },
      include: {
        case: {
          select: { id: true, fileNumber: true, executionFileNumber: true },
        },
      },
    });

    if (!tebligat) {
      throw new NotFoundException("Tebligat bulunamadı");
    }

    return tebligat;
  }

  /**
   * Dosya için tebligatları getir
   */
  async findByCaseId(tenantId: string, caseId: string) {
    return (this.prisma as any).tebligat.findMany({
      where: { tenantId, caseId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Borçlu için tebligatları getir
   */
  async findByCaseDebtorId(tenantId: string, caseDebtorId: string) {
    return (this.prisma as any).tebligat.findMany({
      where: { tenantId, caseDebtorId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Tebligat güncelle
   */
  async update(tenantId: string, id: string, dto: UpdateTebligatDto) {
    const tebligat = await this.findById(tenantId, id);

    return (this.prisma as any).tebligat.update({
      where: { id },
      data: {
        status: dto.status,
        sentAt: dto.sentAt ? new Date(dto.sentAt) : undefined,
        deliveredAt: dto.deliveredAt ? new Date(dto.deliveredAt) : undefined,
        notes: dto.notes,
        barcodeNo: dto.barcodeNo,
      },
    });
  }

  /**
   * Tebligatı gönderildi olarak işaretle
   */
  async markAsSent(tenantId: string, id: string, barcodeNo?: string) {
    await this.findById(tenantId, id);

    return (this.prisma as any).tebligat.update({
      where: { id },
      data: {
        status: TebligatStatus.GONDERILDI,
        sentAt: new Date(),
        barcodeNo,
      },
    });
  }

  // ==================== PTT SONUCU İŞLEME ====================

  /**
   * PTT sonucunu kaydet ve sonraki adımı belirle
   */
  async recordPttResult(tenantId: string, id: string, dto: RecordPttResultDto) {
    const tebligat = await this.findById(tenantId, id);

    const updateData: any = {
      pttResult: dto.pttResult,
      pttResultDate: dto.pttResultDate ? new Date(dto.pttResultDate) : new Date(),
      pttResultNote: dto.pttResultNote,
      barcodeNo: dto.barcodeNo || tebligat.barcodeNo,
    };

    // PTT sonucuna göre durum ve sonraki adım belirle
    const { status, nextAction, tk21Type, tebligSayilmaDate } = 
      this.determinePttResultAction(tebligat, dto);

    updateData.status = status;
    updateData.nextAction = nextAction;

    if (tk21Type) {
      updateData.tk21Type = tk21Type;
    }

    if (dto.muhtarlikDate) {
      updateData.muhtarlikDate = new Date(dto.muhtarlikDate);
    }

    if (dto.ilanDate) {
      updateData.ilanDate = new Date(dto.ilanDate);
    }

    if (tebligSayilmaDate) {
      updateData.tebligSayilmaDate = tebligSayilmaDate;
    }

    // Teslim edildiyse
    if (status === TebligatStatus.TESLIM_EDILDI) {
      updateData.deliveredAt = dto.pttResultDate ? new Date(dto.pttResultDate) : new Date();
    }

    // İade geldiyse
    if (status === TebligatStatus.IADE_GELDI) {
      updateData.returnedAt = dto.pttResultDate ? new Date(dto.pttResultDate) : new Date();
    }

    // PR-D5-b-1: Tebligat sonucu + CaseDebtor senkronu AYNI TRANSACTION (atomik; sync başarısızsa
    // Tebligat de yazılmaz → divergence yok, kullanıcı retry eder). caseDebtorId yoksa NO-OP.
    const serviceStatus = TEBLIGAT_TO_SERVICE_STATUS[status];
    const shouldSync = !!tebligat.caseDebtorId && SYNC_SERVICE_STATUSES.has(serviceStatus);
    const returnReason = status === TebligatStatus.IADE_GELDI ? (PTT_RESULT_TO_RETURN_REASON[dto.pttResult] || "OTHER") : null;
    const actionDate = dto.pttResultDate ? new Date(dto.pttResultDate) : new Date();

    let syncResult: { debtorId: string; addressId: string | null; newStatus: string; channel: string | null; returnReason: string | null } | null = null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await (tx as any).tebligat.update({ where: { id }, data: updateData });
      if (shouldSync) {
        syncResult = await this.debtorService.syncServiceStatusInTx(tx, {
          tenantId,
          caseDebtorId: tebligat.caseDebtorId,
          newStatus: serviceStatus,
          channel: "NORMAL", // PTT fiziksel
          returnReason,
          addressId: tebligat.addressId || null,
          actionDate,
        });
      }
      return upd;
    });

    // Commit sonrası: istihbarat tetiği — ORTAK method (Tebligat sonuçlarında KAÇMAZ). best-effort.
    if (syncResult) {
      const sr = syncResult as { debtorId: string; addressId: string | null; newStatus: string; channel: string | null; returnReason: string | null };
      await this.debtorService.runServiceResultIntelligence(tenantId, sr.debtorId, sr.addressId, sr.newStatus, sr.channel, sr.returnReason);
    }

    return {
      tebligat: updated,
      nextAction,
      message: this.getNextActionMessage(nextAction, tebligat.addressType),
    };
  }

  /**
   * PR-S1: UETS/KEP elektronik tebligat sonucunu kanonik duruma akıtır (ölü-uç kapatma).
   * recordPttResult'ın elektronik ikizi: UETS/KEP teslim durumu sorgulanır → TebligatStatus +
   * CaseDebtor.serviceStatus AYNI TRANSACTION'da (atomik) güncellenir, commit sonrası istihbarat
   * tetiklenir. Kanal UETS/KEP olarak korunur (D4e-2 [B] e-tebligat fiziksel-teyit tetiği için ŞART).
   * Yalnız terminal sonuçlar (TESLIM_EDILDI→DELIVERED) CaseDebtor'a yansır; ara durumlar no-op.
   * caseDebtorId yoksa sync NO-OP. NOT: checkDeliveryStatus şu an mock; gerçek UETS/KEP API ile
   * çalışınca aynı yol kullanılır. Cron entegrasyonu PR-S2'de (burada YOK).
   * <remarks>
   * Çağrıldığı yerler:
   * - TebligatController.recordElectronicResult() → POST /tebligat/:id/electronic-result (UETS/KEP teslim senkronu)
   * </remarks>
   */
  async recordElectronicResult(tenantId: string, id: string) {
    const tebligat = await this.findById(tenantId, id);

    if (tebligat.channel !== "UETS" && tebligat.channel !== "KEP") {
      throw new BadRequestException("Bu tebligat elektronik kanaldan (UETS/KEP) gönderilmemiş");
    }
    if (!tebligat.barcodeNo) {
      throw new BadRequestException("Elektronik tebligat numarası (UETS/KEP No) bulunamadı");
    }

    // UETS/KEP teslim durumu (mock/gerçek API). Deterministik mock TESLIM_EDILDI döner.
    const delivery = await this.uetsService.checkDeliveryStatus(tebligat.barcodeNo);

    const tebligatStatus = ELECTRONIC_DELIVERY_TO_TEBLIGAT_STATUS[delivery.status];
    if (!tebligatStatus) {
      // Ara durum (GONDERILDI/OKUNAMADI) → terminal sonuç değil, durumu değiştirme.
      return { tebligat, synced: false, message: "Elektronik tebligat henüz sonuçlanmadı" };
    }

    const actionDate = delivery.deliveredAt ? new Date(delivery.deliveredAt) : new Date();
    const updateData: any = { status: tebligatStatus };
    if (tebligatStatus === TebligatStatus.TESLIM_EDILDI) {
      updateData.deliveredAt = actionDate;
      updateData.notes = `${tebligat.channel} teslim edildi. No: ${tebligat.barcodeNo}`;
    } else if (tebligatStatus === TebligatStatus.IPTAL) {
      updateData.notes = `${tebligat.channel} hata: ${delivery.errorMessage || "bilinmeyen"}`;
    }

    const serviceStatus = TEBLIGAT_TO_SERVICE_STATUS[tebligatStatus];
    const shouldSync = !!tebligat.caseDebtorId && SYNC_SERVICE_STATUSES.has(serviceStatus);

    let syncResult: { debtorId: string; addressId: string | null; newStatus: string; channel: string | null; returnReason: string | null } | null = null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await (tx as any).tebligat.update({ where: { id }, data: updateData });
      if (shouldSync) {
        syncResult = await this.debtorService.syncServiceStatusInTx(tx, {
          tenantId,
          caseDebtorId: tebligat.caseDebtorId,
          newStatus: serviceStatus,
          channel: tebligat.channel, // UETS | KEP — KORUNUR (istihbarat [B] tetiği için kritik)
          returnReason: null,
          addressId: tebligat.addressId || null,
          actionDate,
        });
      }
      return upd;
    });

    // Commit sonrası: istihbarat tetiği — ORTAK method. E-tebligat DELIVERED + UETS/KEP + adres →
    // fiziksel teyit eksikse istihbarat görevi açar (D4e-2 [B]). best-effort.
    if (syncResult) {
      const sr = syncResult as { debtorId: string; addressId: string | null; newStatus: string; channel: string | null; returnReason: string | null };
      await this.debtorService.runServiceResultIntelligence(tenantId, sr.debtorId, sr.addressId, sr.newStatus, sr.channel, sr.returnReason);
    }

    return { tebligat: updated, synced: !!syncResult };
  }

  /**
   * PTT sonucuna göre durum ve sonraki adımı belirle
   */
  private determinePttResultAction(
    tebligat: any,
    dto: RecordPttResultDto
  ): {
    status: TebligatStatus;
    nextAction: TebligatNextAction;
    tk21Type?: Tk21Type;
    tebligSayilmaDate?: Date;
  } {
    const { pttResult, tk21Type, muhtarlikDate, ilanDate } = dto;

    // Başarılı teslim durumları
    if (
      pttResult === TebligatPttResult.TESLIM_EDILDI ||
      pttResult === TebligatPttResult.AYNI_KONUTTA_TESLIM ||
      pttResult === TebligatPttResult.ISYERINDE_TESLIM
    ) {
      return {
        status: TebligatStatus.TESLIM_EDILDI,
        nextAction: TebligatNextAction.TEBLIG_TAMAMLANDI,
      };
    }

    // İmtina durumu (21/1)
    if (pttResult === TebligatPttResult.IMTINA) {
      // Bilinen adreste imtina = 21/1 (aynı gün tebliğ)
      if (tebligat.addressType === TebligatAddressType.BILINEN) {
        return {
          status: TebligatStatus.MUHTARLIGA_BIRAKILDI,
          nextAction: TebligatNextAction.TEBLIG_TAMAMLANDI,
          tk21Type: Tk21Type.TK_21_1,
          tebligSayilmaDate: muhtarlikDate ? new Date(muhtarlikDate) : new Date(),
        };
      }
    }

    // Muhtarlığa bırakıldı
    if (pttResult === TebligatPttResult.MUHTARLIGA_BIRAKILDI) {
      // MERNİS adresinde muhtarlığa bırakıldı = 21/2 (+15 gün)
      if (tebligat.addressType === TebligatAddressType.MERNIS) {
        const ilanTarihi = ilanDate ? new Date(ilanDate) : new Date();
        const tebligTarihi = new Date(ilanTarihi);
        tebligTarihi.setDate(tebligTarihi.getDate() + this.TK_21_2_DAYS);

        return {
          status: TebligatStatus.MUHTARLIGA_BIRAKILDI,
          nextAction: TebligatNextAction.BEKLE,
          tk21Type: Tk21Type.TK_21_2,
          tebligSayilmaDate: tebligTarihi,
        };
      }

      // Bilinen adreste muhtarlığa bırakıldı = 21/1 (aynı gün)
      return {
        status: TebligatStatus.MUHTARLIGA_BIRAKILDI,
        nextAction: TebligatNextAction.TEBLIG_TAMAMLANDI,
        tk21Type: Tk21Type.TK_21_1,
        tebligSayilmaDate: muhtarlikDate ? new Date(muhtarlikDate) : new Date(),
      };
    }

    // Başarısız teslim durumları - MERNİS'e yönlendir
    if (
      pttResult === TebligatPttResult.ADRESTE_BULUNAMADI ||
      pttResult === TebligatPttResult.TASINMIS ||
      pttResult === TebligatPttResult.ADRES_YETERSIZ ||
      pttResult === TebligatPttResult.BINA_YIKILMIS ||
      pttResult === TebligatPttResult.ADRES_KAPALI ||
      pttResult === TebligatPttResult.TANIMIYOR
    ) {
      // Bilinen adreste başarısız = MERNİS'e git
      if (tebligat.addressType === TebligatAddressType.BILINEN) {
        return {
          status: TebligatStatus.IADE_GELDI,
          nextAction: TebligatNextAction.MERNIS_TEBLIGAT,
        };
      }

      // MERNİS'te de başarısız = İlanen tebligat
      if (tebligat.addressType === TebligatAddressType.MERNIS) {
        return {
          status: TebligatStatus.IADE_GELDI,
          nextAction: TebligatNextAction.ILANEN_TEBLIGAT,
        };
      }
    }

    // Vefat durumu
    if (pttResult === TebligatPttResult.VEFAT) {
      return {
        status: TebligatStatus.IADE_GELDI,
        nextAction: TebligatNextAction.YENI_ADRES_ARA,
      };
    }

    // Diğer durumlar
    return {
      status: TebligatStatus.IADE_GELDI,
      nextAction: TebligatNextAction.YENI_ADRES_ARA,
    };
  }

  /**
   * Sonraki adım mesajını getir
   */
  private getNextActionMessage(
    nextAction: TebligatNextAction,
    currentAddressType: string
  ): string {
    switch (nextAction) {
      case TebligatNextAction.MERNIS_TEBLIGAT:
        return "Bilinen adrese tebligat başarısız oldu. MERNİS adresine TK 21/2 ile tebligat çıkarılmalıdır.";
      case TebligatNextAction.ILANEN_TEBLIGAT:
        return "MERNİS adresine de tebligat yapılamadı. İlanen tebligat başlatılmalıdır.";
      case TebligatNextAction.TEBLIG_TAMAMLANDI:
        return "Tebligat başarıyla tamamlandı.";
      case TebligatNextAction.YENI_ADRES_ARA:
        return "Yeni adres araştırması yapılmalıdır.";
      case TebligatNextAction.BEKLE:
        return "TK 21/2 süresi bekleniyor (ihbar + 15 gün).";
      default:
        return "";
    }
  }

  // ==================== ADRES ÖNCELİK KONTROLÜ ====================

  /**
   * Adres öncelik kurallarını kontrol et
   * TK m.10: Önce bilinen adres, başarısız olursa MERNİS
   */
  async checkAddressPriority(
    tenantId: string,
    caseId: string,
    caseDebtorId?: string,
    requestedAddressType?: TebligatAddressType
  ): Promise<AddressPriorityCheck> {
    // Bu borçlu için önceki tebligatları getir
    const previousTebligatlar = await (this.prisma as any).tebligat.findMany({
      where: {
        tenantId,
        caseId,
        ...(caseDebtorId && { caseDebtorId }),
      },
      orderBy: { createdAt: "desc" },
    });

    // Önceki denemeleri analiz et
    const previousAttempts = previousTebligatlar
      .filter((t: any) => t.pttResult)
      .map((t: any) => ({
        addressType: t.addressType as TebligatAddressType,
        result: t.pttResult as TebligatPttResult,
        date: t.pttResultDate || t.createdAt,
      }));

    // Bilinen adrese hiç tebligat çıkılmamış mı?
    const bilinenAttempt = previousAttempts.find(
      (a: any) => a.addressType === TebligatAddressType.BILINEN
    );

    // Bilinen adres başarısız mı?
    const bilinenFailed =
      bilinenAttempt &&
      [
        TebligatPttResult.ADRESTE_BULUNAMADI,
        TebligatPttResult.TASINMIS,
        TebligatPttResult.ADRES_YETERSIZ,
        TebligatPttResult.BINA_YIKILMIS,
        TebligatPttResult.ADRES_KAPALI,
        TebligatPttResult.TANIMIYOR,
      ].includes(bilinenAttempt.result);

    // Bilinen adres başarılı mı?
    const bilinenSuccess =
      bilinenAttempt &&
      [
        TebligatPttResult.TESLIM_EDILDI,
        TebligatPttResult.AYNI_KONUTTA_TESLIM,
        TebligatPttResult.ISYERINDE_TESLIM,
        TebligatPttResult.MUHTARLIGA_BIRAKILDI,
        TebligatPttResult.IMTINA,
      ].includes(bilinenAttempt.result);

    // Karar ver
    let mustUseBilinen = false;
    let canUseMernis = false;
    let suggestedAction: TebligatNextAction;
    let message: string;

    if (!bilinenAttempt) {
      // Hiç bilinen adrese tebligat çıkılmamış
      mustUseBilinen = true;
      canUseMernis = false;
      suggestedAction = TebligatNextAction.BEKLE;
      message = "Önce bilinen adrese tebligat çıkarılmalıdır (TK m.10).";
    } else if (bilinenSuccess) {
      // Bilinen adres başarılı
      mustUseBilinen = false;
      canUseMernis = false;
      suggestedAction = TebligatNextAction.TEBLIG_TAMAMLANDI;
      message = "Bilinen adrese tebligat başarılı olmuştur.";
    } else if (bilinenFailed) {
      // Bilinen adres başarısız, MERNİS'e geçilebilir
      mustUseBilinen = false;
      canUseMernis = true;
      suggestedAction = TebligatNextAction.MERNIS_TEBLIGAT;
      message = "Bilinen adres başarısız. MERNİS adresine TK 21/2 ile tebligat çıkarılabilir.";
    } else {
      // Beklemede
      mustUseBilinen = false;
      canUseMernis = false;
      suggestedAction = TebligatNextAction.BEKLE;
      message = "Tebligat sonucu bekleniyor.";
    }

    return {
      currentAddressType: bilinenAttempt?.addressType || TebligatAddressType.BILINEN,
      canUseMernis,
      mustUseBilinen,
      previousAttempts,
      suggestedAction,
      message,
    };
  }

  // ==================== 21/2 SÜRE TAKİBİ ====================

  /**
   * TK 21/2 süresi dolan tebligatları kontrol et
   */
  async checkTk212Deadlines(tenantId?: string) {
    const now = new Date();

    const where: any = {
      status: TebligatStatus.MUHTARLIGA_BIRAKILDI,
      tk21Type: Tk21Type.TK_21_2,
      tebligSayilmaDate: { lte: now },
      nextAction: TebligatNextAction.BEKLE,
    };

    if (tenantId) {
      where.tenantId = tenantId;
    }

    const expiredTebligatlar = await (this.prisma as any).tebligat.findMany({
      where,
      include: {
        case: { select: { id: true, fileNumber: true, tenantId: true } },
      },
    });

    // Süresi dolmuş olanları güncelle
    for (const tebligat of expiredTebligatlar) {
      await (this.prisma as any).tebligat.update({
        where: { id: tebligat.id },
        data: {
          status: TebligatStatus.TEBLIG_EDILMIS_SAYILDI,
          nextAction: TebligatNextAction.TEBLIG_TAMAMLANDI,
        },
      });

      this.logger.log(
        `TK 21/2 süresi doldu - Tebliğ edilmiş sayıldı: ${tebligat.case?.fileNumber}`
      );
    }

    return expiredTebligatlar;
  }

  // ==================== İSTATİSTİKLER ====================

  /**
   * Tebligat özeti getir
   */
  async getSummary(tenantId: string, caseId?: string): Promise<TebligatSummary> {
    const where: any = { tenantId };
    if (caseId) {
      where.caseId = caseId;
    }

    const [total, hazirlanan, gonderilen, teslimEdilen, iadeGelen, tebligEdilmisSayilan] =
      await Promise.all([
        (this.prisma as any).tebligat.count({ where }),
        (this.prisma as any).tebligat.count({
          where: { ...where, status: TebligatStatus.HAZIRLANDI },
        }),
        (this.prisma as any).tebligat.count({
          where: { ...where, status: TebligatStatus.GONDERILDI },
        }),
        (this.prisma as any).tebligat.count({
          where: { ...where, status: TebligatStatus.TESLIM_EDILDI },
        }),
        (this.prisma as any).tebligat.count({
          where: { ...where, status: TebligatStatus.IADE_GELDI },
        }),
        (this.prisma as any).tebligat.count({
          where: { ...where, status: TebligatStatus.TEBLIG_EDILMIS_SAYILDI },
        }),
      ]);

    // Bekleyen işlem = MERNİS'e yönlendirilmesi gereken + İlanen tebligat bekleyen
    const bekleyenIslem = await (this.prisma as any).tebligat.count({
      where: {
        ...where,
        nextAction: {
          in: [TebligatNextAction.MERNIS_TEBLIGAT, TebligatNextAction.ILANEN_TEBLIGAT],
        },
      },
    });

    return {
      total,
      hazirlanan,
      gonderilen,
      teslimEdilen,
      iadeGelen,
      tebligEdilmisSayilan,
      bekleyenIslem,
    };
  }

  /**
   * Bekleyen işlemleri getir (MERNİS'e yönlendirilmesi gereken vs.)
   */
  async getPendingActions(tenantId: string) {
    return (this.prisma as any).tebligat.findMany({
      where: {
        tenantId,
        nextAction: {
          in: [
            TebligatNextAction.MERNIS_TEBLIGAT,
            TebligatNextAction.ILANEN_TEBLIGAT,
            TebligatNextAction.YENI_ADRES_ARA,
          ],
        },
      },
      include: {
        case: { select: { id: true, fileNumber: true, executionFileNumber: true } },
      },
      orderBy: { pttResultDate: "asc" },
    });
  }

  // ==================== OTOMATİK MERNİS TEBLİGATI ====================

  /**
   * Başarısız bilinen adres tebligatı için otomatik MERNİS tebligatı oluştur
   */
  async createMernisTebligat(tenantId: string, failedTebligatId: string, mernisAddress: string) {
    const failedTebligat = await this.findById(tenantId, failedTebligatId);

    if (failedTebligat.addressType !== TebligatAddressType.BILINEN) {
      throw new BadRequestException("Sadece bilinen adres tebligatı için MERNİS tebligatı oluşturulabilir");
    }

    if (failedTebligat.nextAction !== TebligatNextAction.MERNIS_TEBLIGAT) {
      throw new BadRequestException("Bu tebligat için MERNİS tebligatı önerilmiyor");
    }

    // Yeni MERNİS tebligatı oluştur
    const mernisTebligat = await (this.prisma as any).tebligat.create({
      data: {
        tenantId,
        caseId: failedTebligat.caseId,
        caseDebtorId: failedTebligat.caseDebtorId,
        tebligatType: failedTebligat.tebligatType,
        addressType: TebligatAddressType.MERNIS,
        addressText: mernisAddress,
        recipientName: failedTebligat.recipientName,
        recipientTcVkn: failedTebligat.recipientTcVkn,
        channel: failedTebligat.channel,
        status: TebligatStatus.HAZIRLANDI,
        notes: `Bilinen adres başarısız (${failedTebligat.pttResult}). TK 21/2 ile MERNİS adresine tebligat.`,
      },
    });

    // Eski tebligatın sonraki adımını güncelle
    await (this.prisma as any).tebligat.update({
      where: { id: failedTebligatId },
      data: { nextAction: TebligatNextAction.TEBLIG_TAMAMLANDI },
    });

    return mernisTebligat;
  }
}
