import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { allocationHoldReason, type PayerLiabilityScopeErrorCode } from "../claim-item/payer-liability-scope";
import {
  PAYMENT_ALLOCATION_COMPLETED_EVENT,
  createCollectionAllocationHoldInTx,
  paymentAllocationCompletedEventId,
} from "./collection-allocation-hold";
import { lockExecutionActorRows } from "../office-approval/office-approval-execution-authority";
import {
  ReceiptObjectScopeAuthorizationService,
  type ReceiptAuthorizationBasis,
} from "./receipt-object-scope-authorization.service";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  CancelCollectionDto,
  CollectionStatus,
  CollectionSource,
  CollectionChannel,
  AllocationType,
  CoverCalculation,
  CollectionSummary,
} from "./dto/collection.dto";
import {
  assertCollectionConfirmedAtInvariant,
  assertCollectionPublicUpdateAllowed,
  COLLECTION_METADATA_UPDATE_FIELDS,
  COLLECTION_STATUS_PENDING,
  pickDefinedCollectionUpdateData,
  resolveCollectionConfirmedAt,
} from "./collection-safety.helper";
import { DomainEventIngestService } from "../icrabot/domain-event-ingest";
import { OccurredAtConfidence } from "../icrabot/domain-event-ingest/domain-event-ingest.types";
import { SummaryEngineService } from "../summary-engine/summary-engine.service";
import {
  AllocationBreakdown,
  emptyBreakdown,
  mapClaimItemTypeToAllocationType,
} from "./allocation-read.helper";
import { CaseDebtorLifecycleGuardService } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service";
import {
  AccountingJournalWriterService,
  buildAccountingJournal,
  createCanonicalSourceHash,
  type CollectionJournalSource,
  type ValidatedJournalEntryDraft,
  validateJournalDraft,
} from "../accounting-journal";
import { OfficeApprovalService } from "../office-approval/office-approval.service";
import { AuditService } from "../audit/audit.service";
import {
  COLLECTION_AUDIT_ACTION,
  changedCollectionFields,
  createCollectionMutationTrace,
  logCollectionMutationInTransaction,
  type CollectionMutationTrace,
  type CollectionRequestContext,
} from "./collection-audit";
import {
  buildCollectionVoidIntent,
  COLLECTION_VOID_ACTION_CODE,
  COLLECTION_VOID_TARGET_TYPE,
  executeCollectionCancelInTransaction,
} from "./collection-cancel-executor";
import { resolveCanonicalCollectionReceiptCommand } from "./collection-receipt-command";
import {
  assertCollectionSemanticReplay,
  buildCollectionSemanticCommandEvidence,
  CollectionIdempotencyConflictError,
  digestCollectionActorAuthority,
  digestIdempotencyKey,
} from "./collection-semantic-command";
import {
  buildAllocationComparisonContext,
  diagnoseCollectionAllocationProjection,
  type AllocationComparisonResult,
} from "../summary-engine/allocation-drift-baseline";

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
  CollectionSource.BANK_INTEGRATION,
]);

// RCV-COL-IDEM-01: replay authority yalnız persisted full semantic evidence'dır.
const IDEMPOTENCY_PAYLOAD_SELECT = {
  id: true,
  commandFingerprintVersion: true,
  commandFingerprint: true,
  commandCanonicalPayload: true,
} as const;

function coerceDate(value: unknown, fallback: unknown): Date {
  const candidate = value instanceof Date ? value : value ? new Date(String(value)) : null;
  if (candidate && !Number.isNaN(candidate.getTime())) return candidate;
  const fallbackDate = fallback instanceof Date ? fallback : fallback ? new Date(String(fallback)) : null;
  if (fallbackDate && !Number.isNaN(fallbackDate.getTime())) return fallbackDate;
  return new Date();
}

function toFiniteAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumAmounts(rows: Array<{ amount: unknown }>): number {
  return roundMoney(rows.reduce((sum, row) => sum + toFiniteAmount(row.amount), 0));
}

type OverpaymentBlockReason =
  | 'EXCLUDED_OUTSTANDING'
  | 'CURRENCY_MISMATCH'
  | 'RESTRICTED_PAYMENT_UNSUPPORTED'
  | 'LEDGER_CONTEXT_MISMATCH';

interface OverpaymentBlock {
  reason: OverpaymentBlockReason;
  message: string;
  details?: Record<string, unknown>;
}

const RESTRICTED_OVERPAYMENT_SOURCES = new Set<string>([
  CollectionSource.BANK_SEIZURE,
  CollectionSource.SALARY_SEIZURE,
  CollectionSource.AUCTION,
]);

const RESTRICTED_OVERPAYMENT_CHANNELS = new Set<string>([
  CollectionChannel.HACIZ,
  CollectionChannel.ICRA_DAIRESI,
]);

function hasUnsupportedRestrictedPaymentSignal(dto: CreateCollectionDto): boolean {
  return Boolean(
    dto.caseDebtorId ||
    (dto.sourceType && RESTRICTED_OVERPAYMENT_SOURCES.has(dto.sourceType)) ||
    (dto.channel && RESTRICTED_OVERPAYMENT_CHANNELS.has(dto.channel)),
  );
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
    private caseDebtorLifecycleGuard: CaseDebtorLifecycleGuardService,
    // G3a: kanonik ledger forward write. @Optional → enjekte edilmezse ledger
    // atlanır + diagnostic (akış kırılmaz; test/araç bağlamları için).
    @Optional() private readonly summaryEngine?: SummaryEngineService,
    @Optional() private readonly journalWriter: AccountingJournalWriterService = new AccountingJournalWriterService(prisma),
    @Optional() private readonly officeApproval?: OfficeApprovalService,
    @Optional() private readonly auditService: AuditService = new AuditService(prisma),
    // K3-L: bekletilen mahsup tamamlamada yetkinin İŞLEM ANINDA (tx içi) yeniden doğrulanması.
    @Optional() private readonly receiptAuthorization?: ReceiptObjectScopeAuthorizationService,
  ) {}

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CollectionService.create() → POST /collections (overpayment guard diagnostic event)
  /// </remarks>
  private async appendOverpaymentBlockedDiagnosticInTx(
    tx: any,
    input: {
      tenantId: string;
      caseId: string;
      collectionId: string;
      paymentEventId: string;
      sourceLedgerEntryId?: string;
      collectionAmount: number;
      allocatedAmount: number;
      attemptedOverpaymentAmount: number;
      currency: string;
      blocks: OverpaymentBlock[];
      trace: CollectionMutationTrace;
    },
  ): Promise<void> {
    const eventId = randomUUID();
    await this.domainEventIngestService.appendInTransaction(tx, {
      header: {
        eventId,
        aggregateType: 'Case',
        aggregateId: input.caseId,
        eventType: 'OVERPAYMENT_BLOCKED',
        occurredAt: new Date().toISOString(),
        occurredAtConfidence: 'SYSTEM_VERIFIED',
        actor: {
          type: 'SYSTEM',
          reason: 'COLLECTION_OVERPAYMENT_GUARD',
        },
        causedBy: input.paymentEventId,
        correlationId: input.trace.correlationId,
        commandId: input.trace.commandId,
        tenantId: input.tenantId,
      },
      payload: {
        collectionId: input.collectionId,
        sourceLedgerEntryId: input.sourceLedgerEntryId,
        collectionAmount: input.collectionAmount,
        allocatedAmount: input.allocatedAmount,
        attemptedOverpaymentAmount: input.attemptedOverpaymentAmount,
        currency: input.currency,
        unsafeForOverpayment: true,
        blockedReasons: input.blocks,
      },
    });
  }

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

  private async diagnoseCollectionAllocationProjectionInTx(
    tx: any,
    input: {
      tenantId: string;
      caseId: string;
      collectionId: string;
      currency: string;
      heldOverpaymentAmount: number;
    },
  ): Promise<AllocationComparisonResult> {
    const [ledgerAllocations, collectionAllocations] = await Promise.all([
      tx.ledgerAllocation.findMany({
        where: {
          ledgerEntry: {
            tenantId: input.tenantId,
            caseId: input.caseId,
            collectionId: input.collectionId,
            status: "CONFIRMED",
          },
        },
        select: {
          amount: true,
          claimItem: {
            select: {
              itemType: true,
              metadata: true,
            },
          },
        },
      }),
      tx.collectionAllocation.findMany({
        where: { collectionId: input.collectionId },
        select: { allocationType: true, amount: true },
      }),
    ]);
    const context = buildAllocationComparisonContext({
      tenantId: input.tenantId,
      caseId: input.caseId,
      currency: input.currency,
      frozenInputId: input.collectionId,
    });
    const diagnostic = diagnoseCollectionAllocationProjection({
      ledgerAllocation: ledgerAllocations.map((allocation: any) => ({
        key: mapClaimItemTypeToAllocationType(
          allocation.claimItem.itemType,
          allocation.claimItem.metadata,
        ),
        amount: allocation.amount,
      })),
      collectionAllocation: collectionAllocations.map((allocation: any) => ({
        key: allocation.allocationType,
        amount: allocation.amount,
      })),
      heldOverpayment: input.heldOverpaymentAmount > 0
        ? [{ key: AllocationType.OTHER, amount: input.heldOverpaymentAmount }]
        : undefined,
      context,
      comparisonContextComplete:
        ledgerAllocations.length > 0 && collectionAllocations.length > 0,
    });

    const diagnosticMessage = JSON.stringify({
      code: "COLLECTION_ALLOCATION_PROJECTION_DIAGNOSTIC",
      collectionId: input.collectionId,
      classification: diagnostic.classification,
      reason: diagnostic.reason,
      canonicalTotal: diagnostic.canonicalTotal,
      projectionTotal: diagnostic.candidateTotal,
      allowedDivergenceTotal: diagnostic.allowedDivergenceTotal,
    });
    if (
      diagnostic.classification === "FAIL_CLOSED_DRIFT" ||
      diagnostic.classification === "NOT_COMPARABLE"
    ) {
      this.logger.warn(diagnosticMessage);
    } else {
      this.logger.debug(diagnosticMessage);
    }
    return diagnostic;
  }

  /**
   * Cover calculation within transaction (for autoAllocateInTx)
   */
  private async calculateCoverInTx(tx: any, tenantId: string, caseId: string) {
    const caseData = await tx.case.findFirst({
      where: { id: caseId, tenantId },
    });

    const principalAmount = Number(caseData?.principalAmount) || 0;
    // G5: calculatedInterest DB alanı YOK; faiz computeBalance/ledger entegrasyonu bekler (şu an 0).
    const interestAmount = 0;
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

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CollectionService.create() → POST /collections ve tahsilat delegasyonları için CaseDebtor integrity guard
  /// </remarks>
  /**
   * K3-L — mahsup kapsamı: HESABINA ödeme yapılan borçlunun (Collection.caseDebtorId → Debtor.id) çözümü ve bekletme
   * kararı. Kısıtlı kalem yoksa ek sorgu YOK, bekletme YOK (davranış aynı). Gönderen kişi ve icra dairesi bu kimliğe
   * DÖNÜŞTÜRÜLMEZ.
   *
   * <remarks>
   * Cagrildigi yerler:
   * - CollectionService.create() → ledger dağıtımından ÖNCE
   * </remarks>
   */
  private async resolveAllocationScopeInTx(
    tx: Prisma.TransactionClient,
    caseId: string,
    caseDebtorId: string | null | undefined,
    activeItems: ReadonlyArray<{ isAllDebtorsLiable: boolean; liableDebtorIds: string[] }>,
  ): Promise<{ onBehalfDebtorId: string | null; holdReason: PayerLiabilityScopeErrorCode | null }> {
    if (allocationHoldReason(activeItems, null) === null) return { onBehalfDebtorId: null, holdReason: null };
    const onBehalf = caseDebtorId
      ? await tx.caseDebtor.findFirst({ where: { id: caseDebtorId, caseId }, select: { debtorId: true } })
      : null;
    const onBehalfDebtorId = onBehalf?.debtorId ?? null;
    return { onBehalfDebtorId, holdReason: allocationHoldReason(activeItems, onBehalfDebtorId) };
  }

  /**
   * K3-L — mahsubu bekletilen tahsilat: ayrı `CollectionAllocationHold` kaydı (fazla ödeme DEĞİL). Tutar = tahsilatın
   * tamamı, defter kaydı YOK. Tamamlama `completeHeldAllocation`, iptal yürütücüsü REVERSED yapar.
   *
   * <remarks>
   * Cagrildigi yerler:
   * - CollectionService.create() → mahsup bekletme
   * </remarks>
   */
  private async holdCollectionAllocationInTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      caseId: string;
      collectionId: string;
      amount: number;
      currency: string;
      userId?: string;
      holdReason: PayerLiabilityScopeErrorCode;
    },
  ): Promise<string> {
    return createCollectionAllocationHoldInTx(tx, {
      tenantId: input.tenantId,
      caseId: input.caseId,
      collectionId: input.collectionId,
      amount: input.amount,
      currency: input.currency,
      holdReason: input.holdReason,
      createdById: input.userId,
    });
  }

  /**
   * Defter mahsubu sonrası para birimi kontrolü ve fazla ödeme kararı — tahsilat KAYDI ile bekletilen mahsubun
   * TAMAMLANMASI aynı kuralı paylaşır (create() ile birebir): fazla tutar engel yoksa CollectionOverpayment HELD +
   * OVERPAYMENT_RECORDED; engel varsa (kısıtlı kaynak/kanal/borçlu, dışlanan borç, bağlam) yalnız OVERPAYMENT_BLOCKED
   * tanı olayı. Kalan tutar hiçbir durumda sessizce kaybolmaz.
   *
   * <remarks>
   * Cagrildigi yerler:
   * - CollectionService.create() → ledger yazıldıktan sonra
   * - CollectionService.completeHeldAllocation() → bekletilen mahsup tamamlanınca
   * </remarks>
   */
  private async settleLedgerAllocationInTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      caseId: string;
      collectionId: string;
      collectionAmount: number;
      currency: string;
      caseCurrency: string;
      restrictedPaymentSignal: boolean;
      restrictedDetails: Record<string, unknown>;
      paymentEventId: string;
      userId?: string;
      trace: CollectionMutationTrace;
      ledger: Awaited<ReturnType<SummaryEngineService['allocatePaymentToLedgerInTx']>>;
    },
  ): Promise<{ ledgerAllocationCount: number; overpaymentId?: string; heldOverpaymentAmount: number; allocatedAmount: number }> {
    const { ledger } = input;
    if (!ledger.allocated || !ledger.ledgerEntry) {
      return { ledgerAllocationCount: 0, heldOverpaymentAmount: 0, allocatedAmount: 0 };
    }
    const ledgerCurrency = String(ledger.ledgerEntry.currency || input.caseCurrency);
    if (ledgerCurrency !== input.caseCurrency || ledgerCurrency !== input.currency) {
      throw new BadRequestException({
        code: 'COLLECTION_CURRENCY_MISMATCH',
        message: 'Persisted ledger currency must match the collection and case currencies.',
        collectionCurrency: input.currency,
        caseCurrency: input.caseCurrency,
        ledgerCurrency,
      });
    }
    const ledgerAllocationCount = ledger.allocations?.length ?? 0;
    const allocatedAmount = sumAmounts(ledger.allocations || []);
    const overpaymentAmount = roundMoney(input.collectionAmount - allocatedAmount);
    if (overpaymentAmount <= 0) {
      return { ledgerAllocationCount, heldOverpaymentAmount: 0, allocatedAmount };
    }

    const blocks: OverpaymentBlock[] = [];
    const excludedOutstanding = toFiniteAmount((ledger as any).excludedOutstanding);
    if ((ledger as any).unsafeForOverpayment || excludedOutstanding > 0) {
      blocks.push({
        reason: 'EXCLUDED_OUTSTANDING',
        message: 'Allocator excluded legitimate outstanding debt; overpayment cannot be trusted.',
        details: { excludedOutstanding, diagnostics: (ledger as any).diagnostics || [] },
      });
    }
    if (
      (ledger.ledgerEntry.tenantId && ledger.ledgerEntry.tenantId !== input.tenantId) ||
      (ledger.ledgerEntry.caseId && ledger.ledgerEntry.caseId !== input.caseId)
    ) {
      blocks.push({
        reason: 'LEDGER_CONTEXT_MISMATCH',
        message: 'Ledger entry tenant/case context does not match the collection.',
        details: {
          collectionTenantId: input.tenantId,
          collectionCaseId: input.caseId,
          ledgerTenantId: ledger.ledgerEntry.tenantId,
          ledgerCaseId: ledger.ledgerEntry.caseId,
        },
      });
    }
    if (input.restrictedPaymentSignal) {
      blocks.push({
        reason: 'RESTRICTED_PAYMENT_UNSUPPORTED',
        message: 'Payment may be restricted/earmarked, but PaymentDesignation is not implemented yet.',
        details: input.restrictedDetails,
      });
    }

    if (blocks.length > 0) {
      this.logger.warn(
        `overpayment blocked; allocation unsafe ` +
          `(case=${input.caseId}, collection=${input.collectionId}, reasons=${blocks.map((b) => b.reason).join(',')})`,
      );
      await this.appendOverpaymentBlockedDiagnosticInTx(tx, {
        tenantId: input.tenantId,
        caseId: input.caseId,
        collectionId: input.collectionId,
        paymentEventId: input.paymentEventId,
        sourceLedgerEntryId: ledger.ledgerEntry.id,
        collectionAmount: input.collectionAmount,
        allocatedAmount,
        attemptedOverpaymentAmount: overpaymentAmount,
        currency: input.currency,
        blocks,
        trace: input.trace,
      });
      return { ledgerAllocationCount, heldOverpaymentAmount: 0, allocatedAmount };
    }

    const overpayment = await tx.collectionOverpayment.create({
      data: {
        tenantId: input.tenantId,
        caseId: input.caseId,
        collectionId: input.collectionId,
        sourceLedgerEntryId: ledger.ledgerEntry.id,
        amount: overpaymentAmount,
        remainingAmount: overpaymentAmount,
        currency: input.currency,
        status: 'HELD',
        createdById: input.userId,
        metadata: { collectionAmount: input.collectionAmount, allocatedAmount },
      },
    });
    await this.domainEventIngestService.appendInTransaction(tx, {
      header: {
        eventId: randomUUID(),
        aggregateType: 'Case',
        aggregateId: input.caseId,
        eventType: 'OVERPAYMENT_RECORDED',
        occurredAt: new Date().toISOString(),
        occurredAtConfidence: 'SYSTEM_VERIFIED',
        actor: { type: 'SYSTEM', reason: 'COLLECTION_OVERPAYMENT_PROJECTION' },
        causedBy: input.paymentEventId,
        correlationId: input.trace.correlationId,
        commandId: input.trace.commandId,
        tenantId: input.tenantId,
      },
      payload: {
        collectionId: input.collectionId,
        sourceLedgerEntryId: ledger.ledgerEntry.id,
        amount: overpaymentAmount,
        remainingAmount: overpaymentAmount,
        currency: input.currency,
        collectionAmount: input.collectionAmount,
        allocatedAmount,
      },
    });
    return { ledgerAllocationCount, overpaymentId: overpayment.id, heldOverpaymentAmount: overpaymentAmount, allocatedAmount };
  }

  /**
   * K3-L (owner GO 2026-09-29) — BEKLETİLEN MAHSUBUN TAMAMLANMASI: hesabına ödeme yapılan borçlu girilince aynı
   * transaction'da defter mahsubu (TBK100, borçlunun sorumlu olduğu kalemler) ve bekletme kaydı HELD → RELEASED.
   *
   * Tekrar üretilmeyenler: Collection satırı, nakit girişi yevmiyesi, PAYMENT_RECEIVED olayı, müvekkil dağıtım taslağı,
   * COLLECTION_CREATE denetimi (hepsi kayda bağlı). Tek kez üretilenler: LedgerEntry/LedgerAllocation (+kalem tahsil
   * tutarı mutabakatı), fazla ödeme kararı (create ile aynı kural), PAYMENT_ALLOCATION_COMPLETED olayı (deterministik id),
   * COLLECTION_ALLOCATION_COMPLETED denetimi.
   *
   * Yarış/tekrar koruması: aktör satır kilidi + yetkinin tx içi yeniden doğrulanması → COL-LOCK-001 → Collection FOR
   * UPDATE (CONFIRMED şart) → bekletme FOR UPDATE (HELD şart; RELEASED + aynı borçlu = tekrar yanıtı, farklı borçlu =
   * 409) → mevcut CONFIRMED PAYMENT defteri yoksa devam → koşullu updateMany (count=1) → DB'de
   * LedgerEntry_collection_payment_key ve outbox evt:<deterministik id> tekillikleri son savunma hattı.
   * `Collection.caseDebtorId` DEĞİŞTİRİLMEZ (yevmiye kaynak hash'i kayıt anındaki değere bağlı); borçlu bekletme
   * kaydında, defter metadata'sında ve denetimde tutulur.
   *
   * <remarks>
   * Cagrildigi yerler:
   * - CaseService.completeCollectionAllocation() → POST /cases/:id/collections/:collectionId/allocation/complete
   * </remarks>
   */
  async completeHeldAllocation(
    tenantId: string,
    input: { caseId: string; collectionId: string; caseDebtorId: string; authorizationBasis: ReceiptAuthorizationBasis },
    actorUserId: string,
    requestContext: CollectionRequestContext = {},
  ) {
    if (!actorUserId) throw new ForbiddenException({ code: 'RECEIPT_AUTHORIZATION_IDENTITY_REQUIRED' });
    if (!input.caseDebtorId?.trim()) {
      throw new BadRequestException({ code: 'ON_BEHALF_DEBTOR_REQUIRED', message: 'Hesabına ödeme yapılan borçlu zorunludur.' });
    }
    if (!this.summaryEngine) {
      throw new ConflictException({ code: 'LEDGER_ALLOCATION_UNAVAILABLE', message: 'Mahsup motoru bu ortamda bağlı değil.' });
    }
    const trace = createCollectionMutationTrace(
      requestContext.correlationId,
      requestContext.causationId,
      requestContext.producer ?? 'COLLECTION_ALLOCATION_COMPLETION',
    );

    return this.prisma.$transaction(async (tx) => {
      // 1) Yetki İŞLEM ANINDA: aktör satırları kilitli, profil + (üyelik dayanağında) dosya üyeliği yeniden okunur.
      if (!this.receiptAuthorization) {
        throw new ConflictException({ code: 'RECEIPT_AUTHORIZATION_BOUNDARY_UNAVAILABLE' });
      }
      await lockExecutionActorRows(tx, actorUserId);
      await this.receiptAuthorization.assertStillAuthorizedInTx(tx, {
        tenantId,
        actorUserId,
        caseId: input.caseId,
        basis: input.authorizationBasis,
      });

      // 2) Dosya (tenant kapsamlı, kapalı değil) → COL-LOCK-001 → tahsilat satırı FOR UPDATE
      const caseData = await tx.case.findFirst({
        where: { id: input.caseId, tenantId },
        select: { id: true, caseStatus: true, currency: true },
      });
      if (!caseData) throw new NotFoundException("Dosya bulunamadı");
      if (CLOSED_STATUSES.includes(caseData.caseStatus)) {
        throw new BadRequestException("Kapalı dosyada mahsup tamamlanamaz. Önce dosyayı yeniden açın (CASE_REOPENED).");
      }
      await tx.$executeRaw`
        /* COL-LOCK-001: canonical allocation lock */
        SELECT pg_advisory_xact_lock(hashtextextended(${input.caseId}, 0))
      `;
      const lockedCollection = await tx.$queryRaw<{ id: string; status: string; amount: string; currency: string; date: Date; description: string | null; receiptNo: string | null; sourceType: string | null; channel: string | null; caseDebtorId: string | null }[]>`
        SELECT "id", "status", "amount"::text AS "amount", "currency", "date", "description", "receiptNo", "sourceType"::text AS "sourceType", "channel"::text AS "channel", "caseDebtorId"
        FROM "Collection" WHERE "id" = ${input.collectionId} AND "tenantId" = ${tenantId} AND "caseId" = ${input.caseId} FOR UPDATE`;
      const collection = lockedCollection[0];
      if (!collection) throw new NotFoundException("Tahsilat bulunamadı");
      if (collection.status !== CollectionStatus.CONFIRMED) {
        throw new ConflictException({ code: 'COLLECTION_NOT_CONFIRMED', message: 'Yalnız onaylı (iptal edilmemiş) tahsilatın mahsubu tamamlanabilir.' });
      }

      // 3) Bekletme kaydı FOR UPDATE — tekrar / çakışma ayrımı
      const holdRows = await tx.$queryRaw<{ id: string; status: string; amount: string; currency: string; holdReason: string; releasedOnBehalfCaseDebtorId: string | null; releasedLedgerEntryId: string | null }[]>`
        SELECT "id", "status"::text AS "status", "amount"::text AS "amount", "currency", "holdReason"::text AS "holdReason", "releasedOnBehalfCaseDebtorId", "releasedLedgerEntryId"
        FROM "CollectionAllocationHold" WHERE "collectionId" = ${input.collectionId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const hold = holdRows[0];
      if (!hold) {
        throw new ConflictException({ code: 'ALLOCATION_HOLD_NOT_FOUND', message: 'Bu tahsilat için bekletilen mahsup yok.' });
      }
      if (hold.status === 'RELEASED') {
        if (hold.releasedOnBehalfCaseDebtorId === input.caseDebtorId) {
          return this.completionReplayResult(tx, tenantId, input.collectionId, hold.id);
        }
        throw new ConflictException({ code: 'ALLOCATION_HOLD_ALREADY_RELEASED', message: 'Bekletilen mahsup başka bir borçlu için zaten tamamlandı.' });
      }
      if (hold.status !== 'HELD') {
        throw new ConflictException({ code: 'ALLOCATION_HOLD_NOT_ACTIVE', message: 'Bekletme kaydı etkin değil (iptal edilmiş).' });
      }
      const existingLedger = await tx.ledgerEntry.findFirst({
        where: { tenantId, caseId: input.caseId, collectionId: input.collectionId, entryType: 'PAYMENT', status: 'CONFIRMED' },
        select: { id: true },
      });
      if (existingLedger) {
        throw new ConflictException({ code: 'LEDGER_PAYMENT_ALREADY_EXISTS', message: 'Bu tahsilat için defter mahsubu zaten var.' });
      }

      // 4) Para birimi ve kalem kapsamı (create() ile aynı kurallar)
      const currency = String(collection.currency || 'TRY');
      const caseCurrency = String(caseData.currency || 'TRY');
      if (currency !== caseCurrency || String(hold.currency || 'TRY') !== currency) {
        throw new BadRequestException({ code: 'COLLECTION_CURRENCY_MISMATCH', message: 'Collection and case currencies must match.' });
      }
      const activeAllocationItems = await tx.claimItem.findMany({
        where: { tenantId, caseId: input.caseId, status: 'ACTIVE' },
        select: { currency: true, isAllDebtorsLiable: true, liableDebtorIds: true },
      });
      if (activeAllocationItems.some((item) => String(item.currency || 'TRY') !== caseCurrency)) {
        throw new BadRequestException({ code: 'COLLECTION_CURRENCY_MISMATCH', message: 'Active allocation-input currencies must match the case currency.' });
      }
      await this.validateCaseDebtorForCollectionInTx(tx, tenantId, input.caseId, input.caseDebtorId);
      const scope = await this.resolveAllocationScopeInTx(tx, input.caseId, input.caseDebtorId, activeAllocationItems);
      if (activeAllocationItems.length === 0 || scope.holdReason) {
        // Bilgi hâlâ yetersiz → bekletme AYNEN korunur, hiçbir yazma yok.
        throw new ConflictException({
          code: scope.holdReason ?? 'NO_ACTIVE_CLAIM_ITEMS',
          message: 'Mahsup hâlâ tamamlanamıyor; bekletme korunur.',
        });
      }

      // 5) Orijinal PAYMENT_RECEIVED olayı (causedBy) — tamamlama olayı ona bağlanır, yeniden yayınlanmaz.
      const originalPaymentEvent = await tx.icrabotTimelineEntry.findFirst({
        where: { tenantId, caseId: input.caseId, type: 'PAYMENT_RECEIVED', body: { path: ['payload', 'collectionId'], equals: input.collectionId } },
        orderBy: { createdAt: 'asc' },
        select: { body: true },
      });
      const originalBody = (originalPaymentEvent?.body ?? null) as { header?: { eventId?: string }; eventId?: string } | null;
      const paymentEventId = String(originalBody?.header?.eventId ?? originalBody?.eventId ?? '');
      if (!paymentEventId) {
        throw new ConflictException({ code: 'PAYMENT_RECEIVED_EVENT_NOT_FOUND', message: 'Tahsilatın ödeme olayı bulunamadı.' });
      }

      // 6) Defter mahsubu — bekletilen tutarın tamamı, orijinal tahsilat tarihiyle
      const holdAmount = toFiniteAmount(hold.amount);
      const ledger = await this.summaryEngine!.allocatePaymentToLedgerInTx(tx, tenantId, input.caseId, holdAmount, {
        entryDate: coerceDate(collection.date, new Date()),
        description: collection.description ?? undefined,
        referenceNo: collection.receiptNo ?? undefined,
        sourceType: (collection.sourceType as CollectionSource | null) ?? undefined,
        collectionId: input.collectionId,
        correlationId: trace.correlationId,
        commandId: trace.commandId,
        causationId: trace.causationId,
        producer: 'COLLECTION_ALLOCATION_COMPLETION',
        onBehalfDebtorId: scope.onBehalfDebtorId,
      });
      if (!ledger.allocated || !ledger.ledgerEntry) {
        throw new ConflictException({ code: ledger.reason ?? 'LEDGER_ALLOCATION_FAILED', message: 'Defter mahsubu yapılamadı; bekletme korunur.' });
      }
      await tx.ledgerEntry.update({
        where: { id: ledger.ledgerEntry.id },
        data: { metadata: { ...((ledger.ledgerEntry.metadata as Record<string, unknown> | null) ?? {}), allocationHoldId: hold.id, onBehalfCaseDebtorId: input.caseDebtorId } },
      });
      const settled = await this.settleLedgerAllocationInTx(tx, {
        tenantId,
        caseId: input.caseId,
        collectionId: input.collectionId,
        collectionAmount: holdAmount,
        currency,
        caseCurrency,
        // create() ile aynı sinyal: hesabına ödeme yapılan borçlu belli → kısıtlı ödeme sinyali
        restrictedPaymentSignal: hasUnsupportedRestrictedPaymentSignal({
          caseDebtorId: input.caseDebtorId,
          sourceType: (collection.sourceType as CollectionSource | null) ?? undefined,
          channel: (collection.channel as CollectionChannel | null) ?? undefined,
        } as CreateCollectionDto),
        restrictedDetails: { caseDebtorId: input.caseDebtorId, sourceType: collection.sourceType, channel: collection.channel },
        paymentEventId,
        userId: actorUserId,
        trace,
        ledger,
      });

      // 7) Bekletme HELD → RELEASED (koşullu; count=1 değilse yarış)
      const releasedAt = new Date();
      const released = await tx.collectionAllocationHold.updateMany({
        where: { id: hold.id, tenantId, status: 'HELD' },
        data: {
          status: 'RELEASED',
          releasedLedgerEntryId: ledger.ledgerEntry.id,
          releasedOnBehalfCaseDebtorId: input.caseDebtorId,
          releasedAt,
          releasedById: actorUserId,
          metadata: {
            collectionAmount: holdAmount,
            allocatedAmount: settled.allocatedAmount,
            overpaymentId: settled.overpaymentId ?? null,
            heldOverpaymentAmount: settled.heldOverpaymentAmount,
            commandId: trace.commandId,
            correlationId: trace.correlationId,
          },
        },
      });
      if (released.count !== 1) {
        throw new ConflictException({ code: 'ALLOCATION_HOLD_RACE', message: 'Bekletme eşzamanlı değişti; tamamlama uygulanmadı.' });
      }

      // 8) Olay (deterministik id → ikinci yayın outbox tekilliğine takılır) + denetim
      const completedEventId = paymentAllocationCompletedEventId(tenantId, input.collectionId);
      await this.domainEventIngestService.appendInTransaction(tx, {
        header: {
          eventId: completedEventId,
          aggregateType: 'Case',
          aggregateId: input.caseId,
          eventType: PAYMENT_ALLOCATION_COMPLETED_EVENT,
          occurredAt: releasedAt.toISOString(),
          occurredAtConfidence: 'SYSTEM_VERIFIED',
          actor: { type: 'HUMAN', userId: actorUserId },
          causedBy: paymentEventId,
          correlationId: trace.correlationId,
          commandId: trace.commandId,
          ...(trace.causationId ? { causationId: trace.causationId } : {}),
          tenantId,
        },
        payload: {
          tenantId,
          caseId: input.caseId,
          collectionId: input.collectionId,
          allocationHoldId: hold.id,
          onBehalfCaseDebtorId: input.caseDebtorId,
          ledgerEntryId: ledger.ledgerEntry.id,
          allocatedAmount: settled.allocatedAmount,
          heldOverpaymentAmount: settled.heldOverpaymentAmount,
          currency,
          completedAt: releasedAt.toISOString(),
        },
      });
      await logCollectionMutationInTransaction(this.auditService, tx, {
        tenantId,
        collectionId: input.collectionId,
        action: COLLECTION_AUDIT_ACTION.ALLOCATION_COMPLETED,
        trace,
        evidence: {
          caseId: input.caseId,
          status: collection.status,
          actor: { type: 'HUMAN', userId: actorUserId },
          amount: String(holdAmount),
          currency,
          occurredAt: releasedAt.toISOString(),
          ledgerEntryIds: [ledger.ledgerEntry.id],
          ledgerAllocationCount: settled.ledgerAllocationCount,
          eventId: completedEventId,
          outboxIdempotencyKey: `evt:${completedEventId}`,
          overpaymentId: settled.overpaymentId,
          allocationHoldId: hold.id,
          onBehalfCaseDebtorId: input.caseDebtorId,
        },
      });

      return {
        collectionId: input.collectionId,
        allocationHoldId: hold.id,
        status: 'RELEASED' as const,
        replayed: false,
        onBehalfCaseDebtorId: input.caseDebtorId,
        ledgerEntryId: ledger.ledgerEntry.id,
        allocatedAmount: settled.allocatedAmount,
        heldOverpaymentAmount: settled.heldOverpaymentAmount,
        ledgerAllocationCount: settled.ledgerAllocationCount,
      };
    });
  }

  private async completionReplayResult(tx: Prisma.TransactionClient, tenantId: string, collectionId: string, holdId: string) {
    const hold = await tx.collectionAllocationHold.findFirstOrThrow({ where: { id: holdId, tenantId } });
    const allocationCount = hold.releasedLedgerEntryId
      ? await tx.ledgerAllocation.count({ where: { ledgerEntryId: hold.releasedLedgerEntryId } })
      : 0;
    const meta = (hold.metadata as Record<string, unknown> | null) ?? {};
    return {
      collectionId,
      allocationHoldId: hold.id,
      status: 'RELEASED' as const,
      replayed: true,
      onBehalfCaseDebtorId: hold.releasedOnBehalfCaseDebtorId,
      ledgerEntryId: hold.releasedLedgerEntryId,
      allocatedAmount: toFiniteAmount(meta.allocatedAmount),
      heldOverpaymentAmount: toFiniteAmount(meta.heldOverpaymentAmount),
      ledgerAllocationCount: allocationCount,
    };
  }

  private async validateCaseDebtorForCollectionInTx(
    tx: any,
    tenantId: string,
    caseId: string,
    caseDebtorId?: string | null,
  ) {
    if (caseDebtorId === undefined || caseDebtorId === null) return;

    if (caseDebtorId.trim() === "") {
      throw new BadRequestException("Tahsilat borçlu bağlantısı geçersiz");
    }

    try {
      await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(
        tenantId,
        caseDebtorId,
        {
          expectedCaseId: caseId,
          prisma: tx,
        }
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException("Tahsilat borçlu bağlantısı geçersiz");
      }
      throw error;
    }
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
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CollectionController.create() → POST /collections (doğrudan tahsilat oluşturma)
  /// - CaseService.createCollection() → POST /cases/:id/collections (dosya detayından tahsilat ekleme)
  /// - BankService.matchTransaction() → POST /bank/transactions/:id/match (banka hareketinden tahsilat oluşturma)
  /// - ThirdPartyService.addExternalCaseCollection() → POST /external-cases/:id/collection (alacak haczi tahsilatını ana dosyaya yansıtma)
  /// </remarks>
  async create(
    tenantId: string,
    dto: CreateCollectionDto,
    userId?: string,
    requestContext: CollectionRequestContext = {},
    transactionClient?: Prisma.TransactionClient,
  ) {
    const traceSeed = createCollectionMutationTrace(
      requestContext.correlationId,
      requestContext.causationId,
      requestContext.producer,
    );
    const command = resolveCanonicalCollectionReceiptCommand({
      tenantId,
      dto,
      userId,
      requestContext,
      trace: traceSeed,
    });
    const trace = command.trace;
    tenantId = command.tenantId;
    dto = command.dto;
    const actor = command.actor;
    const semanticEvidence = buildCollectionSemanticCommandEvidence({
      tenantId,
      dto,
      actor,
      producer: command.producer,
      requestContext,
    });

    // Late-entry warning (audit flag, no reject)
    const daysDiff = Math.floor(
      (Date.now() - new Date(dto.date).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff > 30) {
      this.logger.warn(
        `Late payment entry: ${daysDiff} days old (case=${dto.caseId}, source=${dto.sourceType || 'MANUAL'})`
      );
    }

    // ── P0-1 (S9): idempotencyKey zorunlu — eksik/boş key ile tahsilat kaydedilemez ──
    if (!dto.idempotencyKey) {
      throw new BadRequestException(
        "idempotencyKey zorunlu — tahsilat kaydı için gerekli",
      );
    }

    // ── P0-1: idempotent fast-path (tx öncesi hızlı yol) ────────────────────
    //  Aynı (tenant, idempotencyKey) → aynı full semantic command ise mevcut tahsilat
    //  döner; farklı komut IDEMPOTENCY_SEMANTIC_CONFLICT ile fail-closed kalır.
    const preExisting = transactionClient
      ? await this.findByIdempotencyKeyTx(transactionClient, tenantId, dto.idempotencyKey)
      : await this.findByIdempotencyKey(tenantId, dto.idempotencyKey);
    if (preExisting) {
      try {
        assertCollectionSemanticReplay(preExisting, semanticEvidence);
      } catch (error) {
        if (
          !transactionClient &&
          error instanceof CollectionIdempotencyConflictError
        ) {
          await this.auditCollectionIdempotencyConflict({
            tenantId,
            idempotencyKey: dto.idempotencyKey,
            collectionId: preExisting.id,
            actor,
            error,
          });
        }
        throw error;
      }
      return this.findById(tenantId, preExisting.id, transactionClient);
    }

    try {
      const createInTransaction = async (tx: Prisma.TransactionClient) => {
      // ── P0-1: advisory xact lock (tenant+key) → aynı-key eşzamanlı create'ler ──
      //  SERIALIZE olur; farklı-key (meşru ikinci ödeme) contend ETMEZ. Lock altında
      //  re-check + payload-conflict guard: race'te ikinci istek P2002 yerine replay döner.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${
        `collection:idem:${tenantId}:${dto.idempotencyKey}`
      }))`;
      const lockedDup = await this.findByIdempotencyKeyTx(tx, tenantId, dto.idempotencyKey);
      if (lockedDup) {
        assertCollectionSemanticReplay(lockedDup, semanticEvidence);
        return lockedDup;
      }

      // ── 1. Case status check (closed-case reject) ───────────────────────
      const caseData = await tx.case.findFirst({
        where: { id: dto.caseId, tenantId },
        select: { id: true, caseStatus: true, currency: true },
      });

      if (!caseData) {
        throw new NotFoundException("Dosya bulunamadı");
      }

      if (CLOSED_STATUSES.includes(caseData.caseStatus)) {
        throw new BadRequestException(
          "Kapalı dosyaya tahsilat eklenemez. Önce dosyayı yeniden açın (CASE_REOPENED)."
        );
      }

      // ── RCV-COL-CURRENCY-BOUNDARY-01: ilk finansal write öncesi fail-closed ──
      // Ratifiye bir FX/conversion contract'ı yokken Collection, Case ve allocation
      // girdileri tek currency taşır. Omitted Collection currency mevcut backward-
      // compatible TRY semantiğini korur; non-TRY Case için explicit eşleşme gerekir.
      const currency = String(dto.currency || 'TRY');
      const caseCurrency = String(caseData.currency || 'TRY');
      if (currency !== caseCurrency) {
        throw new BadRequestException({
          code: 'COLLECTION_CURRENCY_MISMATCH',
          message: 'Collection and case currencies must match.',
          collectionCurrency: currency,
          caseCurrency,
        });
      }

      // ── COL-LOCK-001: canonical allocation concurrency authority ─────────
      // Tenant-scoped Case doğrulamasından sonra, ilk allocation-sensitive ClaimItem
      // okumasından önce aynı case'i serialize et. Lock transaction commit/rollback'una
      // kadar tutulur; hata fail-closed olarak bütün Collection transaction'ını geri alır.
      await tx.$executeRaw`
        /* COL-LOCK-001: canonical allocation lock */
        SELECT pg_advisory_xact_lock(hashtextextended(${dto.caseId}, 0))
      `;

      const activeAllocationItems = await tx.claimItem.findMany({
        where: { tenantId, caseId: dto.caseId, status: 'ACTIVE' },
        select: { currency: true, isAllDebtorsLiable: true, liableDebtorIds: true },
      });
      const allocationCurrencies = Array.from(
        new Set(activeAllocationItems.map((claimItem) => String(claimItem.currency || 'TRY'))),
      ).sort();
      if (allocationCurrencies.some((claimCurrency) => claimCurrency !== caseCurrency)) {
        throw new BadRequestException({
          code: 'COLLECTION_CURRENCY_MISMATCH',
          message: 'Active allocation-input currencies must match the case currency.',
          collectionCurrency: currency,
          caseCurrency,
          allocationCurrencies,
        });
      }

      // ── 2. Duplicate pre-check (external source) ────────────────────────
      await this.validateCaseDebtorForCollectionInTx(tx, tenantId, dto.caseId, dto.caseDebtorId);
      // K3-L (owner kararı 2026-09-29): gerçekleşmiş tahsilat REDDEDİLMEZ. Hesabına ödeme yapılan borçlu (Debtor.id)
      // belirsizse veya sorumlu olduğu kalem yoksa tahsilat kaydedilir, otomatik mahsup BEKLETİLİR.
      const { onBehalfDebtorId, holdReason: allocationHold } = await this.resolveAllocationScopeInTx(
        tx,
        dto.caseId,
        dto.caseDebtorId,
        activeAllocationItems,
      );

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
      const confirmedAt = resolveCollectionConfirmedAt({
        currentConfirmedAt: null,
        nextStatus: CollectionStatus.CONFIRMED,
        serverNow: new Date(),
      });
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
          // K3-L kaynak kimlikleri (gönderen / ileten) — borçlu kimliğinden ayrı
          payerName: dto.payerName,
          forwardingOfficeName: dto.forwardingOfficeName,
          status: CollectionStatus.CONFIRMED,
          confirmedAt,
          idempotencyKey: dto.idempotencyKey,
          commandFingerprintVersion: semanticEvidence.fingerprintVersion,
          commandFingerprint: semanticEvidence.commandFingerprint,
          commandCanonicalPayload: semanticEvidence.commandCanonicalPayload,
          createdById: userId,
        },
      });
      const persistedConfirmedAt = assertCollectionConfirmedAtInvariant(
        String(collection.status),
        collection.confirmedAt,
      );
      if (!persistedConfirmedAt || !confirmedAt || persistedConfirmedAt.getTime() !== confirmedAt.getTime()) {
        throw new Error("COLLECTION_CONFIRMED_AT_PERSISTENCE_MISMATCH");
      }

      const recordedJournalEntryId = await this.writeCollectionRecordedJournal(
        tx,
        tenantId,
        userId,
        collection,
        trace,
      );

      // ── 4. PAYMENT_RECEIVED event append (HR-39: same-tx) ───────────────
      const confidence = mapSourceToConfidence(dto.sourceType as CollectionSource);
      const paymentEventId = randomUUID();

      await this.domainEventIngestService.appendInTransaction(tx, {
        header: {
          eventId: paymentEventId,
          aggregateType: 'Case',
          aggregateId: dto.caseId,
          eventType: 'PAYMENT_RECEIVED',
          occurredAt: new Date(dto.date).toISOString(),
          occurredAtConfidence: confidence,
          occurredAtEvidence: confidence === 'EXTERNAL_SIGNED' ? (dto.sourceId || undefined) : undefined,
          actor,
          correlationId: trace.correlationId,
          commandId: trace.commandId,
          causationId: trace.causationId,
          tenantId,
        },
        payload: {
          amount: dto.amount,
          currency,
          paymentDate: new Date(dto.date).toISOString(),
          channel: dto.channel || 'BANKA',
          sourceType: dto.sourceType || 'MANUAL',
          sourceId: dto.sourceId,
          sourceIdentity: command.sourceIdentity,
          producer: command.producer,
          forDebtorId: dto.caseDebtorId,
          description: dto.description,
          bankName: dto.bankName,
          receiptNo: dto.receiptNo,
          // K3-L: gönderen ve ileten icra dairesi (forDebtorId = hesabına ödeme yapılan borçlu; ayrı kimlikler)
          payerName: dto.payerName,
          forwardingOfficeName: dto.forwardingOfficeName,
          collectionId: collection.id,
        },
      });

      const ledgerEntryIds: string[] = [];
      let overpaymentId: string | undefined;
      let heldOverpaymentAmount = 0;
      let ledgerAllocationCount = 0;

      // ── 5. G3a: KANONİK ledger forward write (LedgerAllocation = legal SoT) ──
      // Aynı tx; case'te ACTIVE ClaimItem varsa LedgerEntry+LedgerAllocation üretilir
      // (P-0 allocator tek otorite; sıra düzeltmesi PR-AO). Kalem yoksa S5(i): ledger
      // yazılmaz, intake+event KORUNUR, diagnostic loglanır.
      if (allocationHold) {
        // K3-L: mahsup BEKLETİLİR — defter yazılmaz; mevcut HELD kayıt (emanet) tutarı, kaynağı ve sebebi korur.
        overpaymentId = await this.holdCollectionAllocationInTx(tx, {
          tenantId,
          caseId: dto.caseId,
          collectionId: collection.id,
          amount: dto.amount,
          currency,
          userId,
          holdReason: allocationHold,
        });
        this.logger.warn(
          `collection allocation held (case=${dto.caseId}, collection=${collection.id}, reason=${allocationHold})`,
        );
      } else if (this.summaryEngine) {
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
            collectionId: collection.id,
            correlationId: trace.correlationId,
            commandId: trace.commandId,
            causationId: trace.causationId,
            producer: command.producer,
            onBehalfDebtorId,
          },
        );
        if (ledger.allocated && ledger.ledgerEntry) {
          const settled = await this.settleLedgerAllocationInTx(tx, {
            tenantId,
            caseId: dto.caseId,
            collectionId: collection.id,
            collectionAmount: toFiniteAmount(dto.amount),
            currency,
            caseCurrency,
            restrictedPaymentSignal: hasUnsupportedRestrictedPaymentSignal(dto),
            restrictedDetails: { caseDebtorId: dto.caseDebtorId, sourceType: dto.sourceType, channel: dto.channel },
            paymentEventId,
            userId,
            trace,
            ledger,
          });
          ledgerEntryIds.push(ledger.ledgerEntry.id);
          ledgerAllocationCount = settled.ledgerAllocationCount;
          if (settled.overpaymentId) overpaymentId = settled.overpaymentId;
          heldOverpaymentAmount = settled.heldOverpaymentAmount;
        }
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
      // K3-L: mahsup bekletilen tahsilatta gölge projeksiyon da YAZILMAZ (mahsup yapılmış gibi görünmesin).
      if (dto.autoAllocate !== false && !allocationHold) {
        await this.autoAllocateInTx(tx, tenantId, collection.id, dto.amount);
      }

      // ── 7. Manual allocations (CollectionAllocation compat, S2) ─────────
      if (!allocationHold && dto.allocations && dto.allocations.length > 0) {
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

      if (
        ledgerAllocationCount > 0 &&
        (dto.autoAllocate !== false || (dto.allocations?.length ?? 0) > 0)
      ) {
        await this.diagnoseCollectionAllocationProjectionInTx(tx, {
          tenantId,
          caseId: dto.caseId,
          collectionId: collection.id,
          currency,
          heldOverpaymentAmount,
        });
      }

      await logCollectionMutationInTransaction(this.auditService, tx, {
        tenantId,
        collectionId: collection.id,
        action: COLLECTION_AUDIT_ACTION.CREATE,
        trace,
        evidence: {
          caseId: collection.caseId,
          status: collection.status,
          actor,
          amount: collection.amount?.toString?.() ?? String(collection.amount),
          currency,
          occurredAt: coerceDate(collection.createdAt, collection.date).toISOString(),
          confirmedAt: persistedConfirmedAt.toISOString(),
          journalEntryIds: [recordedJournalEntryId],
          ledgerEntryIds,
          ledgerAllocationCount,
          eventId: paymentEventId,
          outboxIdempotencyKey: `evt:${paymentEventId}`,
          overpaymentId,
        },
      });

      return collection;
      };
      const result = transactionClient
        ? await createInTransaction(transactionClient)
        : await this.prisma.$transaction(createInTransaction);
      return this.findById(tenantId, result.id, transactionClient);
    } catch (e: unknown) {
      // Harici transaction sahibi rollback/retry authority'sidir. Failed interactive
      // transaction client ile tx-disina kacarak replay aramasi yapilmaz.
      if (transactionClient) throw e;

      if (e instanceof CollectionIdempotencyConflictError) {
        const row = await this.findByIdempotencyKey(
          tenantId,
          dto.idempotencyKey,
        );
        await this.auditCollectionIdempotencyConflict({
          tenantId,
          idempotencyKey: dto.idempotencyKey,
          collectionId: row?.id,
          actor,
          error: e,
        });
        throw e;
      }

      // ── P0-1: idempotencyKey race → P2002 → idempotent replay ──────────────
      //  Lock'a rağmen kalan yarış (veya external dedup index) P2002 üretirse:
      //  key ile mevcut satır bulunursa replay; yoksa external dup → conflict.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const row = await this.findByIdempotencyKey(tenantId, dto.idempotencyKey);
        if (row) {
          try {
            assertCollectionSemanticReplay(row, semanticEvidence);
          } catch (error) {
            if (error instanceof CollectionIdempotencyConflictError) {
              await this.auditCollectionIdempotencyConflict({
                tenantId,
                idempotencyKey: dto.idempotencyKey,
                collectionId: row.id,
                actor,
                error,
              });
            }
            throw error;
          }
          return this.findById(tenantId, row.id);
        }
        // meta.target ile ayrıştır: yalnız external-dedup index'i (source_dedupe)
        // DUPLICATE_EXTERNAL_PAYMENT'a çevrilir; ilgisiz P2002 aynen fırlatılır
        // (yanlış etiketleme yok — truthful-audit ilkesi).
        const target = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
        if (target.includes("source_dedupe") || target.includes("sourceId")) {
          throw new ConflictException({
            code: "DUPLICATE_EXTERNAL_PAYMENT",
            message:
              "Aynı dış-kaynak tahsilatı (sourceType/sourceId) bu dosyada zaten kayıtlı",
          });
        }
      }
      throw e;
    }
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CollectionService.create() → idempotent fast-path (tx öncesi) + P2002 replay
  /// </remarks>
  private async findByIdempotencyKey(tenantId: string, idempotencyKey: string) {
    return (this.prisma.collection as any).findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: IDEMPOTENCY_PAYLOAD_SELECT,
    });
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CollectionService.create() → advisory-lock altında race re-check
  /// </remarks>
  private async findByIdempotencyKeyTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    idempotencyKey: string,
  ) {
    return (tx as any).collection.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: IDEMPOTENCY_PAYLOAD_SELECT,
    });
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CollectionService.create() → standalone replay/conflict yolları
  /// </remarks>
  private async auditCollectionIdempotencyConflict(input: {
    tenantId: string;
    idempotencyKey: string;
    collectionId?: string;
    actor: ReturnType<typeof resolveCanonicalCollectionReceiptCommand>['actor'];
    error: CollectionIdempotencyConflictError;
  }): Promise<void> {
    await this.auditService.log({
      tenantId: input.tenantId,
      action: 'COLLECTION_IDEMPOTENCY_SEMANTIC_CONFLICT',
      entityType: 'COLLECTION',
      entityId: input.collectionId,
      userId:
        input.actor.type === 'HUMAN' ? input.actor.userId : undefined,
      actorType:
        input.actor.type === 'HUMAN' ? 'USER' : input.actor.type,
      reasonCode: input.error.reason,
      description: 'Collection semantic idempotency conflict rejected.',
      metadata: {
        idempotencyKeyDigest: digestIdempotencyKey(input.idempotencyKey),
        existingFingerprint: input.error.existingFingerprint,
        incomingFingerprint: input.error.incomingFingerprint,
        fingerprintVersion: input.error.fingerprintVersion,
        actorAuthorityDigest: digestCollectionActorAuthority(input.actor),
        operation: 'CREATE_COLLECTION_RECEIPT',
      },
    });
  }

  /**
   * Tahsilat getir
   */
  async findById(
    tenantId: string,
    id: string,
    transactionClient?: Prisma.TransactionClient,
  ) {
    const client = transactionClient ?? this.prisma;
    const collection = await (client.collection as any).findFirst({
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

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CollectionController.update() → PUT /collections/:id (doğrudan tahsilat metadata güncelleme)
  /// </remarks>
  async update(
    tenantId: string,
    id: string,
    dto: UpdateCollectionDto,
    actorUserId?: string,
    options: CollectionRequestContext & { expectedCaseId?: string } = {},
  ) {
    const trace = createCollectionMutationTrace(options.correlationId);
    return this.prisma.$transaction(async (tx) => {
      const collection = await (tx.collection as any).findFirst({
        where: { id, tenantId, ...(options.expectedCaseId ? { caseId: options.expectedCaseId } : {}) },
        include: {
          case: { select: { id: true, fileNumber: true, executionFileNumber: true } },
          allocations: true,
        },
      });
      if (!collection) {
        throw new NotFoundException("Tahsilat bulunamadı");
      }

      assertCollectionPublicUpdateAllowed(String(collection.status), dto as Record<string, unknown>);

      const updateData = pickDefinedCollectionUpdateData(
        dto as Record<string, unknown>,
        collection.status === COLLECTION_STATUS_PENDING
          ? ["amount", "date", ...COLLECTION_METADATA_UPDATE_FIELDS]
          : COLLECTION_METADATA_UPDATE_FIELDS,
        ["date"],
      );
      const changedFields = changedCollectionFields(collection, updateData);

      if (changedFields.length === 0) {
        return collection;
      }

      const updated = await (tx.collection as any).update({
        where: { id },
        data: Object.fromEntries(changedFields.map((field) => [field, updateData[field]])),
        include: { allocations: true },
      });
      await logCollectionMutationInTransaction(this.auditService, tx, {
        tenantId,
        collectionId: id,
        action: COLLECTION_AUDIT_ACTION.UPDATE,
        trace,
        evidence: {
          caseId: collection.caseId,
          status: updated.status,
          actor: { type: 'HUMAN', ...(actorUserId ? { userId: actorUserId } : {}) },
          changedFields,
        },
      });
      return updated;
    });
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CollectionController.cancel() → POST /collections/:id/cancel (tahsilat iptal onay talebi)
  /// - CaseService.cancelCollection() → POST /cases/:id/collections/:collectionId/cancel (dosya detayından tahsilat iptal onay talebi; caseId boundary guard)
  /// </remarks>
  async requestCancel(
    tenantId: string,
    id: string,
    dto: CancelCollectionDto,
    actorUserId: string,
    expectedCaseId?: string,
    requestContext: CollectionRequestContext = {},
  ) {
    if (!this.officeApproval) {
      throw new ConflictException('OfficeApproval service is required for collection void requests.');
    }
    const cancelReason = (dto.cancelReason ?? '').trim();
    if (!cancelReason) {
      throw new BadRequestException('Tahsilat iptal gerekçesi zorunludur');
    }
    const collection = await (this.prisma.collection as any).findFirst({
      where: { id, tenantId, ...(expectedCaseId ? { caseId: expectedCaseId } : {}) },
      select: { id: true, caseId: true, status: true },
    });
    if (!collection) {
      throw new NotFoundException("Tahsilat bulunamadı");
    }
    if (collection.status === CollectionStatus.CANCELLED) {
      throw new BadRequestException("Tahsilat zaten iptal edilmiş");
    }
    if (collection.status !== CollectionStatus.CONFIRMED) {
      throw new BadRequestException("Tahsilat iptal onayı yalnız confirmed/posted tahsilatlar için kullanılabilir");
    }
    const approval = await this.officeApproval.createPendingRequest({
      tenantId,
      actionCode: COLLECTION_VOID_ACTION_CODE,
      targetType: COLLECTION_VOID_TARGET_TYPE,
      targetRef: id,
      requesterUserId: actorUserId,
      savedIntent: buildCollectionVoidIntent({
        caseId: collection.caseId,
        collectionId: id,
        cancelReason,
        correlationId: createCollectionMutationTrace(requestContext.correlationId).correlationId,
      }),
      reason: "Confirmed/posted tahsilat iptali K4 four-eyes onayı gerektirir.",
      idempotencyKey: `collection-void:${id}`,
    });
    return {
      requested: true,
      approvalRequestId: approval.id,
      status: approval.status,
      collectionId: id,
    };
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - OfficeApprovalDomainSyncService.syncAfterDecision() → COLLECTION_VOID APPROVED sonrası finansal reversal finalize
  /// - Mevcut iç testler/legacy internal callers → onay sonrası aynı reversal semantiğini doğrular
  /// </remarks>
  async cancel(
    tenantId: string,
    id: string,
    dto: CancelCollectionDto,
    actorUserId: string,
    expectedCaseId?: string,
    requestContext: CollectionRequestContext = {},
  ) {
    const trace = createCollectionMutationTrace(requestContext.correlationId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        return executeCollectionCancelInTransaction(tx, {
          domainEventIngestService: this.domainEventIngestService,
          journalWriter: this.journalWriter,
        }, {
          tenantId,
          id,
          dto,
          actorUserId,
          expectedCaseId,
          trace,
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const collection = await this.findById(tenantId, id);
        if (collection.status === CollectionStatus.CANCELLED) {
          throw new BadRequestException("Tahsilat zaten iptal edilmiş");
        }
      }
      throw error;
    }
  }

  private async writeCollectionRecordedJournal(
    tx: any,
    tenantId: string,
    actorUserId: string | undefined,
    collection: any,
    trace: CollectionMutationTrace,
  ): Promise<string> {
    const draft = this.buildCollectionCashJournalDraft({
      tenantId,
      actorUserId,
      collection,
      kind: 'RECORDED',
      sourceAction: 'recorded',
      sourceVersionSuffix: 'RECORDED',
      originalRecordedSourceVersion: null,
      trace,
    });
    const write = await this.journalWriter.write({ draft }, tx);
    if (!write.ok) {
      throw new ConflictException('Collection recorded journal write failed: ' + write.errors.map((error) => error.code).join(', '));
    }
    return write.output.journalEntryId;
  }

  private buildCollectionCashJournalDraft(params: {
    tenantId: string;
    actorUserId: string | undefined;
    collection: any;
    kind: 'RECORDED' | 'CANCEL';
    sourceAction: 'recorded' | 'cancel';
    sourceVersionSuffix: 'RECORDED' | 'CANCEL';
    originalRecordedSourceVersion: string | null;
    trace?: CollectionMutationTrace;
  }): ValidatedJournalEntryDraft {
    const { tenantId, actorUserId, collection, kind, sourceAction, sourceVersionSuffix, originalRecordedSourceVersion, trace } = params;
    const occurredAt = kind === 'RECORDED'
      ? coerceDate(collection.date, collection.createdAt)
      : coerceDate(collection.cancelledAt, collection.updatedAt);
    const sourceVersionDate = kind === 'RECORDED'
      ? coerceDate(collection.createdAt, occurredAt)
      : coerceDate(collection.cancelledAt, occurredAt);
    const occurredAtIso = occurredAt.toISOString();
    const sourceVersion = `${sourceVersionDate.toISOString()}:${collection.id}:${sourceVersionSuffix}`;
    const effectiveDate = coerceDate(kind === 'RECORDED' ? (collection.valueDate ?? collection.date) : (collection.cancelledAt ?? occurredAt), occurredAt)
      .toISOString()
      .slice(0, 10);
    const amount = collection.amount?.toString?.() ?? String(collection.amount);
    const currency = collection.currency || 'TRY';
    const payload: CollectionJournalSource['payload'] = {
      kind,
      amount,
      caseId: collection.caseId,
      collectionId: collection.id,
      collectionStatus: kind === 'RECORDED' ? 'CONFIRMED' : 'CANCELLED',
      debtorId: collection.caseDebtorId ?? null,
      originalRecordedSourceVersion,
    };
    const source: CollectionJournalSource = {
      tenantId,
      sourceType: 'COLLECTION',
      sourceId: collection.id,
      sourceVersion,
      sourceAction,
      occurredAt: occurredAtIso,
      effectiveDate,
      actorId: actorUserId ?? null,
      currency,
      sourceHash: createCanonicalSourceHash({
        tenantId,
        sourceType: 'COLLECTION',
        sourceId: collection.id,
        sourceAction,
        sourceVersion,
        occurredAt: occurredAtIso,
        effectiveDate,
        actorId: actorUserId ?? null,
        currency,
        payload,
      }),
      metadata: {
        sourceName: 'collection',
        status: kind,
        ...(trace ? { correlationId: trace.correlationId, commandId: trace.commandId } : {}),
        ...(trace?.causationId ? { causationId: trace.causationId } : {}),
        ...(trace?.producer ? { producer: trace.producer } : {}),
      },
      payload,
    };

    const built = buildAccountingJournal(source);
    if (!built.ok) {
      throw new ConflictException(`Collection journal mapping failed: ${built.errors.map((error) => error.code).join(', ')}`);
    }

    const validated = validateJournalDraft(built.draft);
    if (!validated.ok) {
      throw new ConflictException(`Collection journal validation failed: ${validated.errors.map((error) => error.code).join(', ')}`);
    }

    return validated.draft;
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
   * G5: calculatedInterest DB alanı YOK; faiz computeBalance/ledger entegrasyonu bekler (şu an 0).
   * 
   * @see ARCHITECTURE.md - Source of Truth Matrix
   * @see interest-engine/interest-engine.service.ts
   */
  /**
   * G3b — Tahsilat mahsup KIRILIMINI kanonik kaynaktan üretir (PER-CASE TEK KAYNAK).
   *
   * Çift-sayım GUARD'ı tek nokta: case'te EN AZ BİR (CONFIRMED) LedgerAllocation
   * varsa YALNIZ ledger okunur (LedgerAllocation = legal SoT); yoksa CollectionAllocation
   * fallback (compat). İkisi ASLA birlikte toplanmaz.
   *
   * NOT (mixed-case): ledgerli case'te dönen kırılım ledger alt-kümesidir; ledger'sız
   * eski collection'lar dahil DEĞİLDİR. Çift-sayımı önler; tam tarihsel hizalama G3c.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CollectionService.calculateCover() → GET /collections/cover/:caseId (cover.collectionDetails)
   * - ReportService.getCaseDebtReport() → GET /reports/... (allocatedByType)
   * </remarks>
   */
  async getCollectedBreakdown(tenantId: string, caseId: string): Promise<AllocationBreakdown> {
    const breakdown = emptyBreakdown();

    // 1. Ledger var mı? (kanonik kaynak)
    const ledgerAllocs = await (this.prisma as any).ledgerAllocation.findMany({
      where: { ledgerEntry: { tenantId, caseId, status: "CONFIRMED" } },
      // D (vergi): TAX_* kovası metadata.taxParentCategory'den çözülür → metadata seç.
      select: { amount: true, claimItem: { select: { itemType: true, metadata: true } } },
    });

    if (ledgerAllocs.length > 0) {
      // LEDGER-ONLY (CollectionAllocation'a BAKILMAZ → çift-sayım imkânsız)
      for (const la of ledgerAllocs) {
        const at = mapClaimItemTypeToAllocationType(la.claimItem.itemType, la.claimItem.metadata);
        breakdown[at] += Number(la.amount);
      }
      return breakdown;
    }

    // 2. FALLBACK: CollectionAllocation (compat; case'te ledger yok)
    const collections = await (this.prisma.collection as any).findMany({
      where: { tenantId, caseId, status: CollectionStatus.CONFIRMED },
      include: { allocations: true },
    });
    for (const col of collections) {
      for (const alloc of (col as any).allocations || []) {
        const at = alloc.allocationType as AllocationType;
        const key = breakdown[at] !== undefined ? at : AllocationType.OTHER;
        breakdown[key] += Number(alloc.amount);
      }
    }
    return breakdown;
  }

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

    // G5: calculatedInterest DB alanı YOK; faiz computeBalance/ledger entegrasyonu bekler (şu an 0).
    // Güncel faiz için: POST /interest-engine/calculate (veya GET /interest-engine/case/:caseId/balance).
    const interestAmount = 0;

    // Masraflar (şimdilik sabit değerler - gerçek sistemde expense tablosundan)
    const expenseAmount = 0;
    const feeAmount = 0;
    const attorneyFeeAmount = 0;
    const otherAmount = 0;

    // Toplam alacak
    const totalClaim = principalAmount + interestAmount + expenseAmount + feeAmount + attorneyFeeAmount + otherAmount;

    // Tahsilatları al (totalCollected için; kırılım getCollectedBreakdown'dan gelir)
    const collections = await (this.prisma.collection as any).findMany({
      where: {
        tenantId,
        caseId,
        status: CollectionStatus.CONFIRMED,
      },
      select: { amount: true },
    });

    const totalCollected = collections.reduce(
      (sum: number, c: any) => sum + Number(c.amount),
      0,
    );

    // G3b: mahsup kırılımı kanonik kaynaktan (ledger-varsa-ledger / yoksa-CollectionAllocation).
    const bd = await this.getCollectedBreakdown(tenantId, caseId);
    const collectionDetails = {
      principal: bd[AllocationType.PRINCIPAL],
      interest: bd[AllocationType.INTEREST],
      expense: bd[AllocationType.EXPENSE],
      fee: bd[AllocationType.FEE],
      attorneyFee: bd[AllocationType.ATTORNEY_FEE],
      // cover 6-alan şeması: PENALTY kovası "other"a katlanır (mevcut default davranışı).
      other: bd[AllocationType.OTHER] + bd[AllocationType.PENALTY],
    };

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
