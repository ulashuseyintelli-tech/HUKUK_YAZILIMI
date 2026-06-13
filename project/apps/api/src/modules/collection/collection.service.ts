import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { randomUUID } from "crypto";
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  CancelCollectionDto,
  CollectionStatus,
  CollectionSource,
  AllocationType,
  CoverCalculation,
  CollectionSummary,
} from "./dto/collection.dto";
import { DomainEventIngestService } from "../icrabot/domain-event-ingest";
import { OccurredAtConfidence, ActorType } from "../icrabot/domain-event-ingest/domain-event-ingest.types";
import { SummaryEngineService } from "../summary-engine/summary-engine.service";

// ─── Source → Header Mapping ─────────────────────────────────────────────────

const EXTERNAL_SIGNED_SOURCES = new Set<string>([
  CollectionSource.BANK_SEIZURE,
  CollectionSource.SALARY_SEIZURE,
  CollectionSource.AUCTION,
  CollectionSource.EXTERNAL_CASE,
]);

const EXTERNAL_SOURCES = new Set<string>([
  ...EXTERNAL_SIGNED_SOURCES,
  CollectionSource.THIRD_PARTY,
]);

function mapSourceToActor(sourceType: CollectionSource | undefined, userId?: string): { type: ActorType; userId?: string; externalSystem?: string } {
  if (!sourceType || sourceType === CollectionSource.MANUAL || sourceType === CollectionSource.SETTLEMENT) {
    return { type: 'HUMAN', userId: userId || 'unknown' };
  }
  return { type: 'EXTERNAL', externalSystem: sourceType };
}

function mapSourceToConfidence(sourceType: CollectionSource | undefined): OccurredAtConfidence {
  if (sourceType && EXTERNAL_SIGNED_SOURCES.has(sourceType)) {
    return 'EXTERNAL_SIGNED';
  }
  return 'USER_DECLARED';
}

// ─── Closed Case Statuses ────────────────────────────────────────────────────

const CLOSED_STATUSES = ['HITAM', 'INFAZ'];

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(
    private prisma: PrismaService,
    private domainEventIngestService: DomainEventIngestService,
    // G3a: kanonik ledger forward write. @Optional → enjekte edilmezse ledger
    // atlanır + diagnostic (akış kırılmaz; test/araç bağlamları için).
    @Optional() private readonly summaryEngine?: SummaryEngineService,
  ) {}

  /**
   * Otomatik mahsup - Yasal sıraya göre (transaction-aware)
   * Sıra: 1) Masraf, 2) Faiz, 3) Ana Para
   *
   * CRITICAL RULE (13-payment-received-migration.md §5):
   * - May update projection/allocation tables within same tx
   * - May NOT mutate PAYMENT_RECEIVED event payload
   * - May NOT emit PAYMENT_ALLOCATED event (Anayasa C+D)
   */
  private async autoAllocateInTx(tx: any, tenantId: string, collectionId: string, amount: number) {
    const collection = await tx.collection.findFirst({
      where: { id: collectionId, tenantId },
      include: { case: true },
    });

    if (!collection) return;

    // Mevcut kapak hesabını al (tx içinde)
    const cover = await this.calculateCoverInTx(tx, tenantId, collection.caseId);
    
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

    // Mahsupları kaydet (projection data, not legal fact)
    for (const alloc of allocations) {
      await tx.collectionAllocation.create({
        data: {
          collectionId,
          allocationType: alloc.type,
          amount: alloc.amount,
        },
      });
    }

    return allocations;
  }

  /**
   * Cover calculation within transaction (for autoAllocateInTx)
   */
  private async calculateCoverInTx(tx: any, tenantId: string, caseId: string) {
    const caseData = await tx.case.findFirst({
      where: { id: caseId, tenantId },
    });

    const principalAmount = Number(caseData?.principalAmount) || 0;
    const interestAmount = Number((caseData as any)?.calculatedInterest) || 0;
    const expenseAmount = 0;
    const feeAmount = 0;
    const attorneyFeeAmount = 0;

    const collections = await tx.collection.findMany({
      where: { tenantId, caseId, status: CollectionStatus.CONFIRMED },
      include: { allocations: true },
    });

    const collectionDetails = { principal: 0, interest: 0, expense: 0, fee: 0, attorneyFee: 0, other: 0 };

    for (const col of collections) {
      for (const alloc of (col as any).allocations || []) {
        const allocAmount = Number(alloc.amount);
        switch (alloc.allocationType) {
          case AllocationType.PRINCIPAL: collectionDetails.principal += allocAmount; break;
          case AllocationType.INTEREST: collectionDetails.interest += allocAmount; break;
          case AllocationType.EXPENSE: collectionDetails.expense += allocAmount; break;
          case AllocationType.FEE: collectionDetails.fee += allocAmount; break;
          case AllocationType.ATTORNEY_FEE: collectionDetails.attorneyFee += allocAmount; break;
          default: collectionDetails.other += allocAmount;
        }
      }
    }

    return { principalAmount, interestAmount, expenseAmount, feeAmount, attorneyFeeAmount, collectionDetails };
  }

  // ==================== CRUD İŞLEMLERİ (eski, tx-dışı) ====================

  /**
   * Yeni tahsilat oluştur
   *
   * Sprint 2B: Transaction-wrapped + PAYMENT_RECEIVED event append
   * HR-39: Same-tx (collection + event + outbox)
   * HR-44: Outbox same-tx
   * HR-45: Rollback guarantee
   */
  async create(tenantId: string, dto: CreateCollectionDto, userId?: string) {
    // Late-entry warning (audit flag, no reject)
    const daysDiff = Math.floor(
      (Date.now() - new Date(dto.date).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff > 30) {
      this.logger.warn(
        `Late payment entry: ${daysDiff} days old (case=${dto.caseId}, source=${dto.sourceType || 'MANUAL'})`
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // ── 1. Case status check (closed-case reject) ───────────────────────
      const caseData = await tx.case.findFirst({
        where: { id: dto.caseId, tenantId },
        select: { id: true, caseStatus: true },
      });

      if (!caseData) {
        throw new NotFoundException("Dosya bulunamadı");
      }

      if (CLOSED_STATUSES.includes(caseData.caseStatus)) {
        throw new BadRequestException(
          "Kapalı dosyaya tahsilat eklenemez. Önce dosyayı yeniden açın (CASE_REOPENED)."
        );
      }

      // ── 2. Duplicate pre-check (external source) ────────────────────────
      if (dto.sourceType && EXTERNAL_SOURCES.has(dto.sourceType) && dto.sourceId) {
        const existing = await (tx as any).collection.findFirst({
          where: {
            caseId: dto.caseId,
            sourceType: dto.sourceType,
            sourceId: dto.sourceId,
            status: { not: CollectionStatus.CANCELLED },
          },
        });
        if (existing) {
          throw new ConflictException(
            `Duplicate payment: ${dto.sourceType}/${dto.sourceId} already recorded for this case`
          );
        }
      }

      // ── 3. Collection row create ────────────────────────────────────────
      const currency = dto.currency || 'TRY'; // normalize for event payload

      const collection = await (tx as any).collection.create({
        data: {
          tenantId,
          caseId: dto.caseId,
          caseDebtorId: dto.caseDebtorId,
          amount: dto.amount,
          currency,
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

      // ── 4. PAYMENT_RECEIVED event append (HR-39: same-tx) ───────────────
      const confidence = mapSourceToConfidence(dto.sourceType as CollectionSource);
      const actor = mapSourceToActor(dto.sourceType as CollectionSource, userId);

      await this.domainEventIngestService.appendInTransaction(tx, {
        header: {
          eventId: randomUUID(),
          aggregateType: 'Case',
          aggregateId: dto.caseId,
          eventType: 'PAYMENT_RECEIVED',
          occurredAt: new Date(dto.date).toISOString(),
          occurredAtConfidence: confidence,
          occurredAtEvidence: confidence === 'EXTERNAL_SIGNED' ? (dto.sourceId || undefined) : undefined,
          actor,
          tenantId,
        },
        payload: {
          amount: dto.amount,
          currency,
          paymentDate: new Date(dto.date).toISOString(),
          channel: dto.channel || 'BANKA',
          sourceType: dto.sourceType || 'MANUAL',
          sourceId: dto.sourceId,
          forDebtorId: dto.caseDebtorId,
          description: dto.description,
          bankName: dto.bankName,
          receiptNo: dto.receiptNo,
          collectionId: collection.id,
        },
      });

      // ── 5. G3a: KANONİK ledger forward write (LedgerAllocation = legal SoT) ──
      // Aynı tx; case'te ACTIVE ClaimItem varsa LedgerEntry+LedgerAllocation üretilir
      // (P-0 allocator tek otorite; sıra düzeltmesi PR-AO). Kalem yoksa S5(i): ledger
      // yazılmaz, intake+event KORUNUR, diagnostic loglanır.
      if (this.summaryEngine) {
        const ledger = await this.summaryEngine.allocatePaymentToLedgerInTx(
          tx,
          tenantId,
          dto.caseId,
          dto.amount,
          {
            entryDate: new Date(dto.date),
            description: dto.description,
            referenceNo: dto.receiptNo,
            sourceType: dto.sourceType,
          },
        );
        if (!ledger.allocated) {
          this.logger.warn(
            `case has no claimItems; payment not ledger-allocated ` +
              `(case=${dto.caseId}, collection=${collection.id}, reason=${ledger.reason})`,
          );
        }
      } else {
        this.logger.warn(
          `SummaryEngine not injected; payment not ledger-allocated ` +
            `(case=${dto.caseId}, collection=${collection.id})`,
        );
      }

      // ── 6. Auto-allocate (CollectionAllocation = geçici compat/gölge, S2) ───
      //  ⚠ Çift-sayım YASAK: bu projeksiyon legal SoT DEĞİL; okuma yüzeyleri
      //  G3b'de ledger'a taşınacak. Şimdilik geriye-uyum için korunuyor.
      if (dto.autoAllocate !== false) {
        await this.autoAllocateInTx(tx, tenantId, collection.id, dto.amount);
      }

      // ── 7. Manual allocations (CollectionAllocation compat, S2) ─────────
      if (dto.allocations && dto.allocations.length > 0) {
        for (const alloc of dto.allocations) {
          await (tx as any).collectionAllocation.create({
            data: {
              collectionId: collection.id,
              allocationType: alloc.allocationType,
              amount: alloc.amount,
              description: alloc.description,
            },
          });
        }
      }

      return collection;
    });

    return this.findById(tenantId, result.id);
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
