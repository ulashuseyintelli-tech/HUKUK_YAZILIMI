import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountingJournalWriterService,
  buildAccountingJournal,
  validateJournalDraft,
  type CollectionDispositionExpenseApplicationJournalSource,
} from '../accounting-journal';
import type { ActionHandlerContext } from '../icrabot/v28-engine/action-handler.service';
import { clientOffsetLockKey } from './expense-remaining-lock';

interface ExpenseApplicationJournalRow {
  id: string;
  caseId: string;
  expenseRequestId: string;
  collectionDispositionId: string;
  collectionDispositionLineId: string;
  kind: 'APPLY' | 'REVERSAL';
  amount: Prisma.Decimal;
  currency: string;
  reimbursementScope: 'CLIENT_FRONTED' | 'FIRM_FRONTED';
  reversesApplicationId: string | null;
  createdAt: Date;
  createdById: string | null;
}
interface ExactPayoutAllocation {
  id: string;
  tenantId: string;
  caseId: string;
  caseClientId: string;
  clientPayoutId: string;
  collectionId: string;
  collectionDispositionId: string;
  collectionDispositionLineId: string;
  amount: unknown;
  currency: string;
}

interface PostedDispositionForReversal {
  id: string;
  tenantId: string;
  caseId: string;
  caseClientId: string | null;
  collectionId: string;
  status: string;
  currency: string;
  manualReversalRequiredAt: Date | null;
}

interface ManualReversalTransaction {
  collectionDisposition: {
    update(args: unknown): Promise<unknown>;
  };
  clientPayoutAllocation: {
    findMany(args: unknown): Promise<ExactPayoutAllocation[]>;
  };
  clientPayoutManualReversal: {
    upsert(args: unknown): Promise<unknown>;
  };
}
/**
 * M1R reversal sonucu. `outcome` davranÄ±ÅŸ matrisini birebir yansÄ±tÄ±r; handler bu nesneyi
 * dÃ¶ndÃ¼rÃ¼r â†’ ActionHandlerService dispatch'i markDone (success:true) yapar ve sonucu
 * timeline/factstore feedback'ine yazar. (BaÅŸarÄ± = THROW etmemek; bu dÃ¶nÃ¼ÅŸ deÄŸeri
 * outbox success/fail'Ä± belirlemez, yalnÄ±z feedback/audit izidir.)
 */
export type ReverseOutcome =
  | 'reversed'
  | 'skip-no-disposition'
  | 'skip-already-reversed'
  | 'skip-already-cancelled'
  | 'posted-manual-reversal-required'
  | 'skip-missing-collection-id'
  | 'skip-unsupported-status';

export interface ReverseResult {
  outcome: ReverseOutcome;
  dispositionId?: string;
  previousStatus?: string;
  /** POSTED senaryosu: finansal reversal M1R kapsamÄ± DIÅI â†’ manuel iÅŸlem sinyali. */
  manualReversalRequired?: boolean;
  /** FU1: POSTED marker ZATEN konmuÅŸtu (ikinci PAYMENT_REVERSED) â†’ idempotent, overwrite YOK. */
  alreadyMarked?: boolean;
  /** Reversal'Ä± tetikleyen outbox action id (provenance). FU1'den itibaren POSTED'de kalÄ±cÄ± kolona da yazÄ±lÄ±r. */
  reversalSourceEventId?: string;
}

/**
 * TM3 M1R â€” PAYMENT_REVERSED Disposition Handler (Claude domaini).
 *
 * KÃ¶prÃ¼nÃ¼n TERS yÃ¶nlÃ¼ (reversal) tÃ¼ketici tarafÄ±: CODEX `CollectionService.cancel()` bir
 * PAYMENT_REVERSED outbox event'i Ã¼rettiÄŸinde (TM3-S2), bu servis ilgili CollectionDisposition'Ä±
 * GÃœVENLÄ° ÅŸekilde kapatÄ±r / no-op consume eder. AmaÃ§: `EVENT_PUBLISHED:PAYMENT_REVERSED` action'Ä±
 * "no-handler" yoluna dÃ¼ÅŸÃ¼p sonsuz retry-poison Ã¼retmesin (handler yoksa dispatch erken success:false
 * dÃ¶ner ve action attemptCount artmadan pending kalÄ±r â†’ processPendingActions tekrar tekrar seÃ§er).
 *
 * KÄ°LÄ°TLÄ° KARAR (UlaÅŸ, 2026-06-27): POSTED disposition KÃ–R ÅEKÄ°LDE `REVERSED` YAPILMAZ ve status
 * DEÄÄ°ÅMEZ (POSTED kalÄ±r). POSTED, M2'nin proceeds satÄ±rlarÄ±nÄ± (ve ClientStatement okumasÄ±nÄ±) Ã¼rettiÄŸi
 * anlamÄ±na gelebilir; yalnÄ±z status deÄŸiÅŸtirmek finansal hakikati dÃ¼zeltmez (ekstre hÃ¢lÃ¢ satÄ±rÄ± gÃ¶sterir).
 * Bu yÃ¼zden POSTED â†’ handled consume + "manual-reversal-required" sinyali; finansal reversal YOK.
 * FU1 (2026-06-27): bu sinyal artÄ±k KALICI kolona persist edilir (manualReversalRequiredAt/Reason/
 * SourceActionId) â†’ operasyonel gÃ¶rÃ¼nÃ¼rlÃ¼k (takip kaÃ§aÄŸÄ± Ã¶nlenir); idempotent (bir kez iÅŸaretlenir).
 *
 * SÄ±nÄ±r (boundary Â§1-12 + M1R/FU1 contract):
 *  - ClientStatement / BalanceLedger / payout / legal allocation (TBK100) tarafÄ±na DOKUNMAZ.
 *  - CollectionService.create/cancel davranÄ±ÅŸÄ±nÄ± DEÄÄ°ÅTÄ°RMEZ; PAYMENT_RECEIVED payload kontratÄ±nÄ± bozmaz.
 *  - clientId VARSAYMAZ; CASE_CREDITOR_CLUSTER kuralÄ±na dokunmaz.
 *  - tenantId zorunlu (outbox satÄ±rÄ±ndan); collectionId @unique ile disposition bulunur; tenant/case
 *    uyuÅŸmazlÄ±ÄŸÄ± fail-closed (mutasyon YOK, gÃ¶rÃ¼nÃ¼r hata â†’ dead-letter).
 *  - HELD_PENDING_DISTRIBUTION â†’ yalnÄ±z `status = REVERSED` (DRAFT/HELD = kanonik enum). POSTED â†’
 *    status KORUNUR, yalnÄ±z FU1 marker alanlarÄ± yazÄ±lÄ±r (additive migration: FU1).
 */
@Injectable()
export class CollectionReversalService {
  private readonly logger = new Logger(CollectionReversalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journalWriter: AccountingJournalWriterService = new AccountingJournalWriterService(prisma),
  ) {}

  /**
   * Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
   *  - PaymentReversedRegistrar.onModuleInit() â†’ ActionHandlerService 'EVENT_PUBLISHED:PAYMENT_REVERSED' handler (collection cancel downstream reversal consume)
   */
  async reverseFromPaymentReversed(
    payload: Record<string, any>,
    caseId: string,
    context?: ActionHandlerContext,
  ): Promise<ReverseResult> {
    // Boundary invariant: tenantId outbox satÄ±rÄ±ndan (IcrabotOutboxAction.tenantId) thread edilir.
    // Infra invariant (outbox.tenantId NOT NULL) â†’ pratikte hiÃ§ tetiklenmez; tip daraltmasÄ± + fail-closed.
    const tenantId = context?.tenantId;
    if (!tenantId) {
      throw new Error('outbox context.tenantId yok â€” tenant doÄŸrulanmadan reversal iÅŸlenmez');
    }

    const collectionId: string | undefined = payload?.collectionId;
    if (!collectionId) {
      // Malformed reversal payload: hiÃ§bir disposition'a map EDÄ°LEMEZ â†’ poison ÃœRETME.
      // handled no-op (success) + structured warn (sessiz yutma DEÄÄ°L â€” gÃ¶rÃ¼nÃ¼r kalÄ±r).
      this.logger.warn(
        `PAYMENT_REVERSED payload.collectionId yok (tenant=${tenantId}, case=${caseId}, ` +
          `srcEvent=${context?.actionId}) â€” handled no-op (reverse edilecek hedef yok)`,
      );
      return { outcome: 'skip-missing-collection-id' };
    }

    // collectionId @unique â†’ tek disposition. Tenant/case doÄŸrulamasÄ± KODDA yapÄ±lÄ±r:
    // null ise "henÃ¼z draft yok" (benign) ile "cross-tenant" (anomali) ayrÄ±mÄ± iÃ§in unscoped okunur,
    // sonra tenant/case kodda karÅŸÄ±laÅŸtÄ±rÄ±lÄ±r.
    const disp = await this.prisma.collectionDisposition.findUnique({
      where: { collectionId },
      // FU1: manualReversalRequiredAt POSTED idempotency kontrolÃ¼ iÃ§in seÃ§ilir (zaten iÅŸaretliyse overwrite YOK).
      select: {
        id: true,
        tenantId: true,
        caseId: true,
        caseClientId: true,
        collectionId: true,
        status: true,
        currency: true,
        manualReversalRequiredAt: true,
      },
    });

    if (!disp) {
      // PAYMENT_RECEIVED hiÃ§ draft AÃ‡MAMIÅ olabilir (collection CONFIRMED deÄŸildi / 0 alacaklÄ± /
      // event henÃ¼z iÅŸlenmedi). Reverse edilecek bir ÅŸey yok â†’ idempotent handled skip.
      return { outcome: 'skip-no-disposition' };
    }

    // Cross-tenant / wrong-case integrity guard (fail-closed): disposition BU collection iÃ§in VAR ama
    // baÅŸka tenant/case'e ait â†’ gerÃ§ek bir tutarsÄ±zlÄ±k. Mutasyon YOK; gÃ¶rÃ¼nÃ¼r hata (dead-letter).
    // (Sonsuz poison DEÄÄ°L: handler var â†’ throw markFailed â†’ 8 denemede dead-letter.)
    if (disp.tenantId !== tenantId) {
      throw new Error(
        `Disposition tenant mismatch (fail-closed): collection=${collectionId} ` +
          `disp.tenant=${disp.tenantId} event.tenant=${tenantId}`,
      );
    }
    if (disp.caseId !== caseId) {
      throw new Error(
        `Disposition case mismatch (fail-closed): collection=${collectionId} ` +
          `disp.case=${disp.caseId} event.case=${caseId}`,
      );
    }

    switch (disp.status) {
      // Kanonik enum'da ayrÄ± 'DRAFT'/'HELD' YOK; aktif taslak durumu = HELD_PENDING_DISTRIBUTION.
      // S8-B FAZ-0: DISTRIBUTION_RECOMMENDED/APPROVED de POSTED-Ã¶ncesi (post() henÃ¼z Ã§alÄ±ÅŸmamÄ±ÅŸ) â†’ HELD ile aynÄ±:
      // gÃ¼venli REVERSED, finansal yan etki YOK. (P4 onay talebi PENDING/APPROVED kalsa da post() disp.status'a
      // baÄŸlÄ± olduÄŸundan artÄ±k Ã§alÄ±ÅŸamaz â†’ orphan zararsÄ±z.)
      case 'HELD_PENDING_DISTRIBUTION':
      case 'DISTRIBUTION_RECOMMENDED':
      case 'DISTRIBUTION_APPROVED': {
        // Aktif taslak/Ã¶neri/onay (POSTED Ã¶ncesi) â†’ gÃ¼venli REVERSED. Finansal taraf YOK (post henÃ¼z Ã§alÄ±ÅŸmamÄ±ÅŸ:
        // proceeds satÄ±rÄ±, ClientStatementLine, BalanceLedger, payout YAZILMAMIÅ). YalnÄ±z status set edilir (migration YOK).
        await this.prisma.collectionDisposition.update({
          where: { id: disp.id },
          data: { status: 'REVERSED' },
        });
        this.logger.log(
          `CollectionDisposition REVERSED: ${disp.id} (collection=${collectionId}, ` +
            `from=${disp.status}, srcEvent=${context?.actionId})`,
        );
        return {
          outcome: 'reversed',
          dispositionId: disp.id,
          previousStatus: disp.status,
          reversalSourceEventId: context?.actionId,
        };
      }

      case 'REVERSED':
        // Ä°dempotent: aynÄ± reversal iki kez gelse de tekrar yazma yok.
        return { outcome: 'skip-already-reversed', dispositionId: disp.id, previousStatus: disp.status };

      case 'CANCELLED':
        // Zaten kapalÄ± (M2 Ã¶ncesi iptal) â†’ idempotent handled skip.
        return { outcome: 'skip-already-cancelled', dispositionId: disp.id, previousStatus: disp.status };

      case 'POSTED': {
        // KÄ°LÄ°TLÄ°: POSTED kÃ¶r REVERSED YAPILMAZ ve status DEÄÄ°ÅMEZ (POSTED kalÄ±r). M2
        // ClientStatementLine Ã¼retmiÅŸ olabilir; status deÄŸiÅŸtirmek finansal hakikati dÃ¼zeltmez.
        // M1R/FU1 finansal reversal (ClientStatement/BalanceLedger/payout) YAZMAZ. FU1: manuel
        // reversal sinyali artÄ±k KALICI kolona persist edilir (operasyonel gÃ¶rÃ¼nÃ¼rlÃ¼k â€” takip kaÃ§aÄŸÄ± Ã¶nlenir).
        const alreadyMarked = Boolean(disp.manualReversalRequiredAt);
        const workflowCount = await this.prisma.$transaction(async (tx) => {
          if (!disp.manualReversalRequiredAt) {
            const reason =
              'PAYMENT_REVERSED POSTED disposition\'a geldi â€” finansal reversal (ClientStatement/' +
              'BalanceLedger/payout) manuel gerekir; M1R/FU1 otomatik yazmaz, status POSTED kalÄ±r.';
            // status ALANI data'da YOK â†’ POSTED korunur; yalnÄ±z marker alanlarÄ± set edilir.
            await (tx as ManualReversalTransaction).collectionDisposition.update({
              where: { id: disp.id },
              data: {
                manualReversalRequiredAt: new Date(),
                manualReversalReason: reason,
                manualReversalSourceActionId: context?.actionId ?? null,
              },
            });
          }

          // FAZ-1b: reimbursement application REVERSAL simetrisi â€” POSTED disposition reverse edilirken her APPLY
          // iÃ§in bir REVERSAL row (idempotent) â†’ computeExpenseRemaining geri artar. YalnÄ±z expense projection
          // unwind; ExpenseRequest.paidTotal / payout / TM47 manual-reversal akÄ±ÅŸÄ±na DOKUNMAZ.
          await this.createReimbursementReversals(tx, { ...disp, collectionId });

          return this.createExactPriorPayoutManualReversals(
            tx as ManualReversalTransaction,
            disp as PostedDispositionForReversal,
            collectionId,
            context,
          );
        });

        if (disp.manualReversalRequiredAt) {
          // Ä°dempotent: marker ZATEN konmuÅŸ (Ã¶r. ikinci PAYMENT_REVERSED). Overwrite YOK â€” ilk
          // tetikleyen kayÄ±t (zaman/sebep/sourceActionId) korunur; TM47D-3 yine de eksik exact
          // prior-payout workflow kaydÄ±nÄ± dedupeKey ile idempotent ÅŸekilde aÃ§abilir.
          this.logger.warn(
            `MANUAL_REVERSAL_REQUIRED (zaten iÅŸaretli): POSTED disposition ${disp.id} ` +
              `(collection=${collectionId}, srcEvent=${context?.actionId}, exactWorkflows=${workflowCount}) â€” ` +
              `marker korundu, exact workflow idempotent kontrol edildi.`,
          );
          return {
            outcome: 'posted-manual-reversal-required',
            dispositionId: disp.id,
            previousStatus: disp.status,
            manualReversalRequired: true,
            alreadyMarked,
          };
        }

        this.logger.warn(
          `MANUAL_REVERSAL_REQUIRED: POSTED disposition ${disp.id} (collection=${collectionId}, ` +
            `srcEvent=${context?.actionId}) â€” PAYMENT_REVERSED consume edildi; status POSTED korundu, ` +
            `kalÄ±cÄ± marker yazÄ±ldÄ±, exactWorkflows=${workflowCount}. Finansal reversal manuel.`,
        );
        return {
          outcome: 'posted-manual-reversal-required',
          dispositionId: disp.id,
          previousStatus: disp.status,
          manualReversalRequired: true,
          reversalSourceEventId: context?.actionId,
        };
      }

      default:
        // Bilinmeyen/gelecekte eklenmiÅŸ status â†’ mutasyon YOK; handled skip + warn (poison YOK).
        this.logger.warn(
          `PAYMENT_REVERSED: desteklenmeyen disposition status=${disp.status} (id=${disp.id}, ` +
            `collection=${collectionId}) â€” handled no-op`,
        );
        return { outcome: 'skip-unsupported-status', dispositionId: disp.id, previousStatus: disp.status };
    }
  }
  /// <remarks>
  /// Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
  /// - CollectionReversalService.reverseFromPaymentReversed() â†’ PAYMENT_REVERSED POSTED disposition exact prior payout workflow creation
  /// </remarks>
  private async createExactPriorPayoutManualReversals(
    tx: ManualReversalTransaction,
    disp: PostedDispositionForReversal,
    collectionId: string,
    context?: ActionHandlerContext,
  ): Promise<number> {
    const allocationWhere: Record<string, unknown> = {
      tenantId: disp.tenantId,
      caseId: disp.caseId,
      collectionId,
      collectionDispositionId: disp.id,
      currency: disp.currency,
      clientPayout: { status: 'RECORDED' },
    };
    if (disp.caseClientId) {
      allocationWhere.caseClientId = disp.caseClientId;
    }

    const allocations = await tx.clientPayoutAllocation.findMany({
      where: allocationWhere,
      select: {
        id: true,
        tenantId: true,
        caseId: true,
        caseClientId: true,
        clientPayoutId: true,
        collectionId: true,
        collectionDispositionId: true,
        collectionDispositionLineId: true,
        amount: true,
        currency: true,
      },
      orderBy: [{ clientPayoutId: 'asc' }, { collectionDispositionLineId: 'asc' }],
    });

    for (const allocation of allocations) {
      const dedupeKey = this.exactManualReversalDedupeKey(allocation.tenantId, collectionId, allocation.id);
      await tx.clientPayoutManualReversal.upsert({
        where: { dedupeKey },
        update: {},
        create: {
          tenantId: allocation.tenantId,
          caseId: allocation.caseId,
          caseClientId: allocation.caseClientId,
          amount: allocation.amount,
          currency: allocation.currency,
          status: 'OPEN',
          confidence: 'EXACT',
          dedupeKey,
          sourceActionId: context?.actionId ?? null,
          collectionId: allocation.collectionId,
          collectionDispositionId: allocation.collectionDispositionId,
          collectionDispositionLineId: allocation.collectionDispositionLineId,
          clientPayoutId: allocation.clientPayoutId,
          clientPayoutAllocationId: allocation.id,
          openedById: null,
          note: 'PAYMENT_REVERSED sonrasÄ± exact prior payout manual reversal workflow.',
          metadata: {
            source: 'PAYMENT_REVERSED',
            actionType: context?.actionType ?? null,
          },
        },
      });
    }

    return allocations.length;
  }

  private async writeExpenseApplicationJournal(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      collectionId: string | null;
      clientId: string;
      application: ExpenseApplicationJournalRow;
    },
  ): Promise<void> {
    const source = this.expenseApplicationJournalSource(params);
    const built = buildAccountingJournal(source);
    if (!built.ok) {
      throw new ConflictException(`Expense application journal mapping failed: ${built.errors.map((error) => error.code).join(', ')}`);
    }

    const validated = validateJournalDraft(built.draft);
    if (!validated.ok) {
      throw new ConflictException(`Expense application journal validation failed: ${validated.errors.map((error) => error.code).join(', ')}`);
    }

    const write = await this.journalWriter.write({ draft: validated.draft }, tx);
    if (!write.ok) {
      throw new ConflictException(`Expense application journal write failed: ${write.errors.map((error) => error.code).join(', ')}`);
    }
  }

  private expenseApplicationJournalSource(params: {
    tenantId: string;
    collectionId: string | null;
    clientId: string;
    application: ExpenseApplicationJournalRow;
  }): CollectionDispositionExpenseApplicationJournalSource {
    const createdAtIso = params.application.createdAt.toISOString();
    const sourceAction = params.application.kind === 'REVERSAL' ? 'reversal' : 'apply';
    return {
      tenantId: params.tenantId,
      sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
      sourceId: params.application.id,
      sourceVersion: `${createdAtIso}:${params.application.id}:${params.application.kind}`,
      sourceAction,
      occurredAt: createdAtIso,
      effectiveDate: createdAtIso,
      actorId: params.application.createdById,
      currency: params.application.currency,
      sourceHash: null,
      metadata: {
        sourceName: 'CollectionDispositionExpenseApplication',
      },
      payload: {
        kind: params.application.kind,
        amount: params.application.amount.toString(),
        caseId: params.application.caseId,
        clientId: params.clientId,
        expenseRequestId: params.application.expenseRequestId,
        expenseApplicationId: params.application.id,
        collectionId: params.collectionId,
        collectionDispositionId: params.application.collectionDispositionId,
        collectionDispositionLineId: params.application.collectionDispositionLineId,
        reimbursementScope: params.application.reimbursementScope,
        reversesApplicationId: params.application.reversesApplicationId,
      },
    };
  }
  /// <remarks>
  /// Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
  /// - CollectionReversalService.createExactPriorPayoutManualReversals() â†’ ClientPayoutManualReversal unique dedupe key Ã¼retimi
  /// </remarks>
  private exactManualReversalDedupeKey(tenantId: string, collectionId: string, allocationId: string): string {
    return `payment-reversed:exact:${tenantId}:${collectionId}:${allocationId}`;
  }

  /**
   * FAZ-1b â€” POSTED disposition reverse: her APPLY reimbursement application iÃ§in bir REVERSAL row.
   * Ä°dempotent (mevcut REVERSAL'lar pre-check + CDEApp_line_kind_key/CDEApp_reverses_key DB guard). YalnÄ±z expense
   * projection unwind â†’ computeExpenseRemaining geri artar; ExpenseRequest.paidTotal / payout / BalanceLedger /
   * ClientStatement / TM47 manual-reversal akÄ±ÅŸÄ±na DOKUNMAZ (Codex-adjacent sÄ±nÄ±r: payout reversal ayrÄ± + manuel kalÄ±r).
   */
  private async createReimbursementReversals(
    tx: Prisma.TransactionClient,
    disp: { id: string; tenantId: string; caseId: string; collectionId: string | null },
  ): Promise<number> {
    const applies = await tx.collectionDispositionExpenseApplication.findMany({
      where: { tenantId: disp.tenantId, collectionDispositionId: disp.id, kind: 'APPLY' },
      select: { id: true, expenseRequestId: true, collectionDispositionLineId: true, amount: true, currency: true, reimbursementScope: true },
    });
    if (applies.length === 0) return 0;
    const existing = await tx.collectionDispositionExpenseApplication.findMany({
      where: { tenantId: disp.tenantId, collectionDispositionId: disp.id, kind: 'REVERSAL' },
      select: { reversesApplicationId: true },
    });
    const reversed = new Set(existing.map((r) => r.reversesApplicationId));
    let count = 0;
    for (const a of applies) {
      if (reversed.has(a.id)) continue; // idempotent: bu APPLY zaten reverse edilmiÅŸ
      const expenseRequest = await tx.expenseRequest.findFirst({
        where: { id: a.expenseRequestId, tenantId: disp.tenantId, caseId: disp.caseId },
        select: { clientId: true },
      });
      if (!expenseRequest) {
        throw new ConflictException(`Expense application reversal target request missing: ${a.expenseRequestId}`);
      }
      // ROLL-001b: ClientOffsetService (APPLY/REVERSAL) ve DispositionPostingService (reimbursement APPLY,
      // ROLL-001) ile BİREBİR aynı key — computeExpenseRemaining'in TÜM yazarları (bu REVERSAL dahil) aynı
      // kilit altında serialize olur. Lock, reversal create()'den ÖNCE alınır.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clientOffsetLockKey(disp.tenantId, expenseRequest.clientId, a.currency)}))`;
      const reversalApplication = await tx.collectionDispositionExpenseApplication.create({
        data: {
          tenantId: disp.tenantId,
          caseId: disp.caseId,
          expenseRequestId: a.expenseRequestId,
          collectionDispositionId: disp.id,
          collectionDispositionLineId: a.collectionDispositionLineId,
          kind: 'REVERSAL',
          amount: a.amount,
          currency: a.currency,
          reimbursementScope: a.reimbursementScope,
          reversesApplicationId: a.id,
          reason: 'PAYMENT_REVERSED - POSTED disposition reverse: reimbursement projection unwind (paidTotal/payout/TM47 dokunulmaz).',
          createdById: null, // event-driven (PAYMENT_REVERSED); user actor yok
        },
        select: {
          id: true,
          caseId: true,
          expenseRequestId: true,
          collectionDispositionId: true,
          collectionDispositionLineId: true,
          kind: true,
          amount: true,
          currency: true,
          reimbursementScope: true,
          reversesApplicationId: true,
          createdAt: true,
          createdById: true,
        },
      }) as ExpenseApplicationJournalRow;
      await this.writeExpenseApplicationJournal(tx, {
        tenantId: disp.tenantId,
        collectionId: disp.collectionId,
        clientId: expenseRequest.clientId,
        application: reversalApplication,
      });
      count++;
    }
    return count;
  }
}
