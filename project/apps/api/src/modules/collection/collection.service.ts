import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  CancelCollectionDto,
  CollectionStatus,
  AllocationType,
  CoverCalculation,
  CollectionSummary,
} from "./dto/collection.dto";

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(private prisma: PrismaService) {}

  // ==================== CRUD İŞLEMLERİ ====================

  /**
   * Yeni tahsilat oluştur
   */
  async create(tenantId: string, dto: CreateCollectionDto, userId?: string) {
    // Dosya kontrolü
    const caseData = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });

    if (!caseData) {
      throw new NotFoundException("Dosya bulunamadı");
    }

    // Tahsilat oluştur
    const collection = await (this.prisma.collection as any).create({
      data: {
        tenantId,
        caseId: dto.caseId,
        caseDebtorId: dto.caseDebtorId,
        amount: dto.amount,
        currency: dto.currency || "TRY",
        type: dto.type,
        channel: dto.channel || "BANKA",
        date: new Date(dto.date),
        valueDate: dto.valueDate ? new Date(dto.valueDate) : undefined,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        description: dto.description,
        receiptNo: dto.receiptNo,
        bankName: dto.bankName,
        accountNo: dto.accountNo,
        notes: dto.notes,
        status: CollectionStatus.CONFIRMED,
        createdById: userId,
      },
    });

    // Otomatik mahsup
    if (dto.autoAllocate !== false) {
      await this.autoAllocate(tenantId, collection.id, dto.amount);
    }

    // Manuel mahsup
    if (dto.allocations && dto.allocations.length > 0) {
      for (const alloc of dto.allocations) {
        await (this.prisma as any).collectionAllocation.create({
          data: {
            collectionId: collection.id,
            allocationType: alloc.allocationType,
            amount: alloc.amount,
            description: alloc.description,
          },
        });
      }
    }

    return this.findById(tenantId, collection.id);
  }

  /**
   * Tahsilat getir
   */
  async findById(tenantId: string, id: string) {
    const collection = await (this.prisma.collection as any).findFirst({
      where: { id, tenantId },
      include: {
        case: {
          select: { id: true, fileNumber: true, executionFileNumber: true },
        },
        allocations: true,
      },
    });

    if (!collection) {
      throw new NotFoundException("Tahsilat bulunamadı");
    }

    return collection;
  }

  /**
   * Dosya için tahsilatları getir
   */
  async findByCaseId(tenantId: string, caseId: string) {
    return (this.prisma.collection as any).findMany({
      where: { tenantId, caseId, status: { not: CollectionStatus.CANCELLED } },
      include: {
        allocations: true,
      },
      orderBy: { date: "desc" },
    });
  }

  /**
   * Tahsilat güncelle
   */
  async update(tenantId: string, id: string, dto: UpdateCollectionDto) {
    const collection = await this.findById(tenantId, id);

    if (collection.status === CollectionStatus.CANCELLED) {
      throw new BadRequestException("İptal edilmiş tahsilat güncellenemez");
    }

    return (this.prisma.collection as any).update({
      where: { id },
      data: {
        amount: dto.amount,
        date: dto.date ? new Date(dto.date) : undefined,
        description: dto.description,
        receiptNo: dto.receiptNo,
        notes: dto.notes,
      },
      include: {
        allocations: true,
      },
    });
  }

  /**
   * Tahsilat iptal et
   */
  async cancel(tenantId: string, id: string, dto: CancelCollectionDto) {
    const collection = await this.findById(tenantId, id);

    if (collection.status === CollectionStatus.CANCELLED) {
      throw new BadRequestException("Tahsilat zaten iptal edilmiş");
    }

    return (this.prisma.collection as any).update({
      where: { id },
      data: {
        status: CollectionStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.cancelReason,
      },
    });
  }

  // ==================== OTOMATİK MAHSUP ====================

  /**
   * Otomatik mahsup - Yasal sıraya göre
   * Sıra: 1) Masraf, 2) Faiz, 3) Ana Para
   */
  async autoAllocate(tenantId: string, collectionId: string, amount: number) {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, tenantId },
      include: { case: true },
    });

    if (!collection) return;

    // Mevcut kapak hesabını al
    const cover = await this.calculateCover(tenantId, collection.caseId);
    
    let remaining = amount;
    const allocations: { type: AllocationType; amount: number }[] = [];

    // 1. Önce masraflar
    if (remaining > 0 && cover.collectionDetails.expense < cover.expenseAmount) {
      const expenseRemaining = cover.expenseAmount - cover.collectionDetails.expense;
      const expenseAlloc = Math.min(remaining, expenseRemaining);
      if (expenseAlloc > 0) {
        allocations.push({ type: AllocationType.EXPENSE, amount: expenseAlloc });
        remaining -= expenseAlloc;
      }
    }

    // 2. Harçlar
    if (remaining > 0 && cover.collectionDetails.fee < cover.feeAmount) {
      const feeRemaining = cover.feeAmount - cover.collectionDetails.fee;
      const feeAlloc = Math.min(remaining, feeRemaining);
      if (feeAlloc > 0) {
        allocations.push({ type: AllocationType.FEE, amount: feeAlloc });
        remaining -= feeAlloc;
      }
    }

    // 3. Vekalet ücreti
    if (remaining > 0 && cover.collectionDetails.attorneyFee < cover.attorneyFeeAmount) {
      const attRemaining = cover.attorneyFeeAmount - cover.collectionDetails.attorneyFee;
      const attAlloc = Math.min(remaining, attRemaining);
      if (attAlloc > 0) {
        allocations.push({ type: AllocationType.ATTORNEY_FEE, amount: attAlloc });
        remaining -= attAlloc;
      }
    }

    // 4. Faiz
    if (remaining > 0 && cover.collectionDetails.interest < cover.interestAmount) {
      const intRemaining = cover.interestAmount - cover.collectionDetails.interest;
      const intAlloc = Math.min(remaining, intRemaining);
      if (intAlloc > 0) {
        allocations.push({ type: AllocationType.INTEREST, amount: intAlloc });
        remaining -= intAlloc;
      }
    }

    // 5. Ana para
    if (remaining > 0 && cover.collectionDetails.principal < cover.principalAmount) {
      const prinRemaining = cover.principalAmount - cover.collectionDetails.principal;
      const prinAlloc = Math.min(remaining, prinRemaining);
      if (prinAlloc > 0) {
        allocations.push({ type: AllocationType.PRINCIPAL, amount: prinAlloc });
        remaining -= prinAlloc;
      }
    }

    // 6. Kalan varsa "diğer"e
    if (remaining > 0) {
      allocations.push({ type: AllocationType.OTHER, amount: remaining });
    }

    // Mahsupları kaydet
    for (const alloc of allocations) {
      await (this.prisma as any).collectionAllocation.create({
        data: {
          collectionId,
          allocationType: alloc.type,
          amount: alloc.amount,
        },
      });
    }

    return allocations;
  }

  // ==================== KAPAK HESABI ====================

  /**
   * Kapak hesabı (dosya borç özeti) hesapla
   * 
   * ⚠️ HESAP YASAĞI: Bu metod faiz hesabı YAPMAZ
   * Faiz değeri DB'deki calculatedInterest alanından okunur.
   * Bu alan interest-engine tarafından güncellenir.
   * 
   * @see ARCHITECTURE.md - Source of Truth Matrix
   * @see interest-engine/interest-engine.service.ts
   */
  async calculateCover(
    tenantId: string,
    caseId: string,
    calculationDate?: Date
  ): Promise<CoverCalculation> {
    const calcDate = calculationDate || new Date();

    // Dosya bilgilerini al
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });

    if (!caseData) {
      throw new NotFoundException("Dosya bulunamadı");
    }

    // Ana alacak
    const principalAmount = Number(caseData.principalAmount) || 0;
    const principalCurrency = caseData.currency || "TRY";

    // ⚠️ FAİZ: DB'den oku - hesaplama YASAK
    // Bu değer interest-engine tarafından güncellenir.
    // Güncel faiz için: POST /interest-engine/calculate
    const interestAmount = Number((caseData as any).calculatedInterest) || 0;

    // Masraflar (şimdilik sabit değerler - gerçek sistemde expense tablosundan)
    const expenseAmount = 0;
    const feeAmount = 0;
    const attorneyFeeAmount = 0;
    const otherAmount = 0;

    // Toplam alacak
    const totalClaim = principalAmount + interestAmount + expenseAmount + feeAmount + attorneyFeeAmount + otherAmount;

    // Tahsilatları al
    const collections = await (this.prisma.collection as any).findMany({
      where: {
        tenantId,
        caseId,
        status: CollectionStatus.CONFIRMED,
      },
      include: {
        allocations: true,
      },
    });

    // Tahsilat detayları
    const collectionDetails = {
      principal: 0,
      interest: 0,
      expense: 0,
      fee: 0,
      attorneyFee: 0,
      other: 0,
    };

    let totalCollected = 0;

    for (const col of collections) {
      totalCollected += Number(col.amount);

      for (const alloc of (col as any).allocations || []) {
        const allocAmount = Number(alloc.amount);
        switch (alloc.allocationType) {
          case AllocationType.PRINCIPAL:
            collectionDetails.principal += allocAmount;
            break;
          case AllocationType.INTEREST:
            collectionDetails.interest += allocAmount;
            break;
          case AllocationType.EXPENSE:
            collectionDetails.expense += allocAmount;
            break;
          case AllocationType.FEE:
            collectionDetails.fee += allocAmount;
            break;
          case AllocationType.ATTORNEY_FEE:
            collectionDetails.attorneyFee += allocAmount;
            break;
          default:
            collectionDetails.other += allocAmount;
        }
      }
    }

    // Kalan borç
    const remainingDebt = Math.max(0, totalClaim - totalCollected);

    return {
      principalAmount,
      principalCurrency,
      interestAmount,
      interestStartDate: caseData.interestStartDate?.toISOString(),
      interestEndDate: calcDate.toISOString(),
      interestType: caseData.interestType || undefined,
      expenseAmount,
      feeAmount,
      attorneyFeeAmount,
      otherAmount,
      totalClaim,
      totalCollected,
      collectionDetails,
      remainingDebt,
      calculationDate: calcDate.toISOString(),
    };
  }

  // ==================== İSTATİSTİKLER ====================

  /**
   * Tahsilat özeti getir
   */
  async getSummary(tenantId: string, caseId?: string): Promise<CollectionSummary> {
    const where: any = { tenantId };
    if (caseId) {
      where.caseId = caseId;
    }

    // Toplam tahsilat
    const confirmed = await this.prisma.collection.aggregate({
      where: { ...where, status: CollectionStatus.CONFIRMED },
      _sum: { amount: true },
      _count: true,
    });

    const pending = await this.prisma.collection.aggregate({
      where: { ...where, status: CollectionStatus.PENDING },
      _sum: { amount: true },
    });

    const cancelled = await this.prisma.collection.aggregate({
      where: { ...where, status: CollectionStatus.CANCELLED },
      _sum: { amount: true },
    });

    // Son tahsilat
    const lastCollection = await this.prisma.collection.findFirst({
      where: { ...where, status: CollectionStatus.CONFIRMED },
      orderBy: { date: "desc" },
      select: { date: true },
    });

    // Kanala göre dağılım
    const byChannel = await (this.prisma.collection as any).groupBy({
      by: ["channel"],
      where: { ...where, status: CollectionStatus.CONFIRMED },
      _sum: { amount: true },
    });

    // Kaynağa göre dağılım
    const bySource = await (this.prisma.collection as any).groupBy({
      by: ["sourceType"],
      where: { ...where, status: CollectionStatus.CONFIRMED },
      _sum: { amount: true },
    });

    return {
      totalCollected: Number(confirmed._sum.amount) || 0,
      totalPending: Number(pending._sum.amount) || 0,
      totalCancelled: Number(cancelled._sum.amount) || 0,
      collectionCount: confirmed._count || 0,
      lastCollectionDate: lastCollection?.date?.toISOString(),
      byChannel: byChannel.reduce((acc: Record<string, number>, item: any) => {
        acc[item.channel || "DIGER"] = Number(item._sum?.amount) || 0;
        return acc;
      }, {} as Record<string, number>),
      bySource: bySource.reduce((acc: Record<string, number>, item: any) => {
        acc[item.sourceType || "MANUAL"] = Number(item._sum?.amount) || 0;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Dosya kapanış kontrolü
   * Kalan borç 0 veya negatifse dosya kapatılabilir
   */
  async checkCaseCompletion(tenantId: string, caseId: string): Promise<{
    canClose: boolean;
    remainingDebt: number;
    message: string;
  }> {
    const cover = await this.calculateCover(tenantId, caseId);

    if (cover.remainingDebt <= 0) {
      return {
        canClose: true,
        remainingDebt: cover.remainingDebt,
        message: "Dosya borcu tamamen tahsil edilmiştir. Dosya kapatılabilir.",
      };
    }

    return {
      canClose: false,
      remainingDebt: cover.remainingDebt,
      message: `Kalan borç: ${cover.remainingDebt.toLocaleString("tr-TR")} ${cover.principalCurrency}`,
    };
  }
}
