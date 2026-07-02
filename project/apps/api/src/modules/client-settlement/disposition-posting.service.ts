import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma, CollectionDispositionLineType, OfficeApprovalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import {
  AccountingJournalWriterService,
  buildAccountingJournal,
  validateJournalDraft,
  type AccountingAccountCode,
  type CollectionDispositionExpenseApplicationJournalSource,
  type CollectionDispositionLineJournalSource,
  type ValidatedJournalEntryDraft,
} from '../accounting-journal';
import { PostDispositionDto } from './dto/post-disposition.dto';
import { ClientSettlementReadService } from './client-settlement-read.service';
import { FinanceApprovalIntentBuilder } from './finance-approval-intent.builder';
import { FinanceRiskEngine } from './finance-risk.engine';
import { FinanceRiskCollectionDispositionInput, FinanceRiskDecision, FinanceRiskEvaluation } from './finance-risk.types';
import { clientOffsetLockKey } from './expense-remaining-lock';

const HELD = CollectionDispositionLineType.HELD_PENDING_DISTRIBUTION;
/** CLUSTER'da caseClientId zorunlu olan müvekkile-atfedilen tipler. */
const CLIENT_ATTRIBUTED = new Set<CollectionDispositionLineType>([
  CollectionDispositionLineType.CLIENT_PAYABLE,
  CollectionDispositionLineType.CLIENT_EXPENSE_REIMBURSEMENT,
]);
/** S8-B FAZ-1b — ExpenseRequest'i kapatan reimbursement satır tipleri (post()'ta APPLY application yazar). */
const REIMBURSEMENT_TYPES = new Set<CollectionDispositionLineType>([
  CollectionDispositionLineType.CLIENT_EXPENSE_REIMBURSEMENT,
  CollectionDispositionLineType.FIRM_EXPENSE_REIMBURSEMENT,
]);

/** P4 OfficeApprovalRequest action sözleşmesi (disposition post onayı). */
const APPROVAL_ACTION_CODE = 'COLLECTION_DISPOSITION_POST';
const APPROVAL_TARGET_TYPE = 'COLLECTION_DISPOSITION';

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
interface ResolvedLine {
  type: CollectionDispositionLineType;
  amount: Prisma.Decimal;
  caseClientId: string | null;
  note: string | null;
  expenseRequestId: string | null; // FAZ-1b: REIMBURSEMENT tiplerinde dolu (kapatılan ExpenseRequest)
}

/**
 * TM3 M2 + S8-B FAZ-0 — Disposition Approval Lifecycle (Claude domaini).
 *
 * Politikanın çekirdek vaadi: **Partner/Manager onayı olmadan disposition POSTED olamaz.**
 * Akış: HELD_PENDING_DISTRIBUTION → recommend() → DISTRIBUTION_RECOMMENDED → approve() (P4 + capability)
 *       → DISTRIBUTION_APPROVED → post() → POSTED (finansal etki YALNIZ burada).
 *
 * - recommend(): kullanıcı dağıtım satırlarını yazar; line'lar DB'ye yazılır AMA finansal etki YOK;
 *   P4 OfficeApprovalRequest (PENDING) açılır (4-göz: requester onaylayamaz).
 * - approve(): yalnız PARTNER/yetkilendirilmiş avukat (isApproverEligible) + P4.approve (requester≠approver);
 *   line'lar bu noktadan sonra DONDU; finansal etki YOK.
 * - post(): yalnız DISTRIBUTION_APPROVED + APPROVED P4 request; OFFSET_CLIENT_ADVANCE→BalanceLedger CREDIT
 *   ve status→POSTED bu tek $transaction'da. İnvariantlar: sum==totalAmount; collection CONFIRMED; çift-sayım yok.
 */
@Injectable()
export class DispositionPostingService {
  private readonly logger = new Logger(DispositionPostingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly officeApproval: OfficeApprovalService,
    private readonly readService: ClientSettlementReadService,
    private readonly financeRisk: FinanceRiskEngine = new FinanceRiskEngine(),
    private readonly approvalIntentBuilder: FinanceApprovalIntentBuilder = new FinanceApprovalIntentBuilder(),
    private readonly journalWriter: AccountingJournalWriterService = new AccountingJournalWriterService(prisma),
  ) {}

  /**
   * S8-B FAZ-0 — Dağıtım önerisi: line'ları yazar (finansal etki YOK) + P4 onay talebi açar. HELD → DISTRIBUTION_RECOMMENDED.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - DispositionController.recommend() → POST /collection-dispositions/:id/recommend
   * /// </remarks>
   */
  async recommend(
    tenantId: string,
    dispositionId: string,
    dto: PostDispositionDto,
    actor: { userId: string },
  ): Promise<{ recommended: boolean; dispositionId: string; lineCount: number; approvalRequestId: string }> {
    if (!actor?.userId) throw new BadRequestException('recommend için actor (requester) gerekir');
    const disp = await this.requireDisposition(tenantId, dispositionId);
    if (disp.status !== 'HELD_PENDING_DISTRIBUTION') {
      throw new BadRequestException(`Yalnız HELD_PENDING_DISTRIBUTION önerilebilir (durum: ${disp.status})`);
    }
    await this.assertCollectionConfirmed(disp);
    const resolved = this.resolveLines(disp, dto?.lines ?? []);
    await this.assertCaseClientRoles(tenantId, disp.caseId, resolved);

    const riskInput = this.toRiskInput(tenantId, disp, resolved);
    const recommendRisk = this.financeRisk.evaluateCollectionDispositionRecommend(riskInput);
    this.assertRiskAllowsDomainMutation(recommendRisk);

    const postRisk = this.financeRisk.evaluateCollectionDispositionPost(riskInput);
    this.assertRiskRequiresApprovalRequest(postRisk);
    const savedIntent = this.approvalIntentBuilder.buildCollectionDispositionPostIntent({
      ...riskInput,
      riskEvaluation: postRisk,
    });

    // P4 onay talebi: 4-goz (requester onaylayamaz). OfficeApproval risk motoru degil; REQUIRE_APPROVAL tuketicisidir.
    const approval = await this.officeApproval.createPendingRequest({
      tenantId,
      actionCode: APPROVAL_ACTION_CODE,
      targetType: APPROVAL_TARGET_TYPE,
      targetRef: dispositionId,
      requesterUserId: actor.userId,
      savedIntent,
      reason: this.approvalIntentBuilder.buildOfficeApprovalReason(postRisk),
      idempotencyKey: `collection-disposition-recommend:${dispositionId}`,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.collectionDispositionLine.deleteMany({ where: { dispositionId } });
      for (const r of resolved) {
        await tx.collectionDispositionLine.create({
          data: { dispositionId, type: r.type, amount: r.amount, caseClientId: r.caseClientId, note: r.note, expenseRequestId: r.expenseRequestId },
        });
      }
      // Yalnız HELD ise RECOMMENDED yap (yarış-güvenli; eşzamanlı recommend/post fence).
      const upd = await tx.collectionDisposition.updateMany({
        where: { id: dispositionId, tenantId, status: 'HELD_PENDING_DISTRIBUTION' },
        data: {
          status: 'DISTRIBUTION_RECOMMENDED',
          recommendedAt: new Date(),
          recommendedById: actor.userId,
          approvalRequestId: approval.id,
        },
      });
      if (upd.count === 0) throw new ConflictException('Disposition eşzamanlı değişti (HELD değil); öneri uygulanmadı');
    });

    this.logger.log(`CollectionDisposition RECOMMENDED: ${dispositionId} (${resolved.length} satır, approval=${approval.id})`);
    return { recommended: true, dispositionId, lineCount: resolved.length, approvalRequestId: approval.id };
  }

  /**
   * S8-B FAZ-0 — Onay: yalnız PARTNER/yetkilendirilmiş avukat + P4.approve (4-göz). DISTRIBUTION_RECOMMENDED → DISTRIBUTION_APPROVED.
   * Finansal etki YOK; line'lar bu noktadan sonra dondu.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - DispositionController.approve() → POST /collection-dispositions/:id/approve
   * /// </remarks>
   */
  async approve(
    tenantId: string,
    dispositionId: string,
    actor: { userId: string },
    note?: string,
  ): Promise<{ approved: boolean; dispositionId: string; approvalRequestId: string }> {
    if (!actor?.userId) throw new BadRequestException('approve için actor (approver) gerekir');
    const disp = await this.requireDisposition(tenantId, dispositionId);
    if (disp.status !== 'DISTRIBUTION_RECOMMENDED') {
      throw new BadRequestException(`Yalnız DISTRIBUTION_RECOMMENDED onaylanabilir (durum: ${disp.status})`);
    }
    if (!disp.approvalRequestId) throw new ConflictException('Onay talebi bulunamadı (approvalRequestId yok)');

    // K2: capability guard = bypass engeli (P4 da ayrıca enforce eder; defense-in-depth).
    if (!(await this.officeApproval.isApproverEligible(actor.userId, tenantId))) {
      throw new ForbiddenException('Onay yetkisi yok (PARTNER veya yetkilendirilmiş avukat gerekir)');
    }
    // K2: P4 approval = business karar kaydı (4-göz: requester onaylayamaz → SELF_APPROVAL_FORBIDDEN). Dış-etki YÜRÜTÜLMEZ.
    await this.officeApproval.approve(disp.approvalRequestId, actor.userId, note);

    const upd = await this.prisma.collectionDisposition.updateMany({
      where: { id: dispositionId, tenantId, status: 'DISTRIBUTION_RECOMMENDED' },
      data: { status: 'DISTRIBUTION_APPROVED', approvedAt: new Date(), approvedById: actor.userId },
    });
    if (upd.count === 0) throw new ConflictException('Disposition eşzamanlı değişti (RECOMMENDED değil); onay uygulanmadı');

    this.logger.log(`CollectionDisposition APPROVED: ${dispositionId} (approver=${actor.userId})`);
    return { approved: true, dispositionId, approvalRequestId: disp.approvalRequestId };
  }

  /**
   * TM3 M2 + S8-B FAZ-0 — Finansal post: YALNIZ DISTRIBUTION_APPROVED + APPROVED P4 request. DISTRIBUTION_APPROVED → POSTED.
   * Finansal etki (OFFSET_CLIENT_ADVANCE→BalanceLedger CREDIT, proceeds line'ları) BU adımda doğar.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - DispositionController.post() → POST /collection-dispositions/:id/post
   * /// </remarks>
   */
  async post(
    tenantId: string,
    dispositionId: string,
    actor?: { userId?: string },
  ): Promise<{ posted: boolean; dispositionId: string; lineCount: number }> {
    const disp = await this.requireDisposition(tenantId, dispositionId);
    if (disp.status !== 'DISTRIBUTION_APPROVED') {
      throw new BadRequestException(`Yalnız DISTRIBUTION_APPROVED post edilebilir — Partner/Manager onayı gerekir (durum: ${disp.status})`);
    }
    if (!disp.approvalRequestId) throw new ConflictException('Onay talebi bulunamadı (approvalRequestId yok)');

    // P4 approval kaydını TÜKET: gerçekten APPROVED mı (disp.status ile P4 arasında drift guard).
    const approval = await this.prisma.officeApprovalRequest.findFirst({
      where: { id: disp.approvalRequestId, tenantId },
      select: { status: true },
    });
    if (!approval || (approval.status !== OfficeApprovalStatus.APPROVED && approval.status !== OfficeApprovalStatus.APPROVED_WITH_CHANGES)) {
      throw new ConflictException('Onay kaydı APPROVED değil — post yasak');
    }

    // Posting anında collection YENİDEN doğrulanır (approve→post arası iptal/değişim guard).
    await this.assertCollectionConfirmed(disp);

    // Line'lar recommend'da yazıldı + approve'da donduruldu. Defense-in-depth: sum==totalAmount yeniden doğrula.
    const lines = await this.prisma.collectionDispositionLine.findMany({
      where: { dispositionId },
      select: { id: true, type: true, amount: true, expenseRequestId: true, caseClientId: true },
    });
    if (lines.length === 0) throw new BadRequestException('Dağıtım satırı yok');
    const sum = lines.reduce((acc, l) => acc.plus(new Prisma.Decimal(l.amount)), new Prisma.Decimal(0));
    if (!sum.equals(disp.totalAmount)) {
      throw new BadRequestException(`POSTED dağıtım toplamı (${sum.toString()}) tahsilat tutarına (${disp.totalAmount.toString()}) eşit olmalı`);
    }

    const postRisk = this.financeRisk.evaluateCollectionDispositionPost(this.toRiskInput(tenantId, disp, lines));
    this.assertRiskAllowsFinancialPosting(postRisk);

    const postedAt = new Date();
    const clientIdsByCaseClientId = await this.resolveJournalLineClientIds(tenantId, disp.caseId, lines);
    const journalDrafts = this.buildCollectionDispositionJournalDrafts(
      tenantId,
      disp,
      lines,
      clientIdsByCaseClientId,
      postedAt,
      actor?.userId ?? null,
    );

    await this.prisma.$transaction(async (tx) => {
      let caseBalanceId: string | null = null;
      for (const l of lines) {
        // OFFSET_CLIENT_ADVANCE → bakiye etkisi YALNIZ BalanceLedger'dan (avans defteri; çift-sayım yok).
        // Yön CREDIT(+): borçlu tahsilatı müvekkilin avansladığı masrafı geri ödüyor → avans havuzuna para döner.
        if (l.type === CollectionDispositionLineType.OFFSET_CLIENT_ADVANCE) {
          if (!caseBalanceId) {
            const cb = await tx.caseBalance.findFirst({ where: { caseId: disp.caseId, tenantId }, select: { id: true } });
            caseBalanceId = cb?.id
              ?? (await tx.caseBalance.create({ data: { tenantId, caseId: disp.caseId, currency: disp.currency }, select: { id: true } })).id;
          }
          await tx.balanceLedger.create({
            data: {
              tenantId,
              caseBalanceId,
              type: 'CREDIT',
              amount: new Prisma.Decimal(l.amount),
              currency: disp.currency,
              source: `disposition_line:${l.id}`,
              sourceId: l.id,
              description: 'Tahsilat avans mahsubu (OFFSET_CLIENT_ADVANCE)',
              createdById: actor?.userId,
            },
          });
        } else if (REIMBURSEMENT_TYPES.has(l.type)) {
          // FAZ-1b: reimbursement → ExpenseRequest kapatma PROJECTION'ı (APPLY application). paidTotal MUTATE YOK
          // (projection-first); kapanış computeExpenseRemaining tarafından Σ application'lardan türetilir.
          if (!l.expenseRequestId) throw new BadRequestException(`Reimbursement satırı expenseRequestId taşımıyor (line ${l.id})`);
          // ROLL-001: lock-key için clientId gerekli — minimal probe read (lock ÖNCESİ, henüz validasyon/hesap YOK).
          const erForLock = await tx.expenseRequest.findFirst({
            where: { id: l.expenseRequestId, tenantId, caseId: disp.caseId },
            select: { clientId: true },
          });
          if (!erForLock) throw new BadRequestException(`Reimbursement hedefi masraf bulunamadı/scope dışı (line ${l.id})`);
          // ClientOffsetService (APPLY/REVERSAL) ile BİREBİR aynı key — computeExpenseRemaining üzerinde
          // eşzamanlı APPLY yarışını (over-apply) önler. Lock, authoritative okuma+hesaptan ÖNCE alınır.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clientOffsetLockKey(tenantId, erForLock.clientId, disp.currency)}))`;
          const er = await tx.expenseRequest.findFirst({
            where: { id: l.expenseRequestId, tenantId, caseId: disp.caseId },
            select: { totalAmount: true, paidTotal: true, currency: true, status: true, expenseApprovalStatus: true, clientId: true },
          });
          if (!er) throw new BadRequestException(`Reimbursement hedefi masraf bulunamadı/scope dışı (line ${l.id})`);
          if (er.status === 'CANCELLED') throw new BadRequestException(`Reimbursement hedefi masraf CANCELLED (line ${l.id})`);
          if (er.expenseApprovalStatus !== 'APPROVED') throw new BadRequestException(`Reimbursement hedefi masraf onaylı (APPROVED) değil (line ${l.id})`);
          if ((er.currency ?? 'TRY') !== disp.currency) throw new BadRequestException(`Cross-currency reimbursement yasak (line ${l.id})`);
          const remaining = await this.readService.computeExpenseRemaining(tx, tenantId, l.expenseRequestId, er.totalAmount, er.paidTotal);
          const reimbAmount = new Prisma.Decimal(l.amount);
          if (reimbAmount.gt(remaining)) {
            throw new BadRequestException(`Reimbursement tutarı (${reimbAmount.toString()}) masraf kalanını (${remaining.toString()}) aşamaz (line ${l.id})`);
          }
          const application = await tx.collectionDispositionExpenseApplication.create({
            data: {
              tenantId,
              caseId: disp.caseId,
              expenseRequestId: l.expenseRequestId,
              collectionDispositionId: dispositionId,
              collectionDispositionLineId: l.id,
              kind: 'APPLY',
              amount: reimbAmount,
              currency: disp.currency,
              reimbursementScope: l.type === CollectionDispositionLineType.CLIENT_EXPENSE_REIMBURSEMENT ? 'CLIENT_FRONTED' : 'FIRM_FRONTED',
              createdById: actor?.userId ?? null,
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
            tenantId,
            collectionId: disp.collectionId,
            clientId: er.clientId,
            application,
          });
        }
      }
      const upd = await tx.collectionDisposition.updateMany({
        where: { id: dispositionId, tenantId, status: 'DISTRIBUTION_APPROVED' },
        data: { status: 'POSTED', postedAt, postedById: actor?.userId },
      });
      if (upd.count === 0) throw new ConflictException('Disposition eşzamanlı değişti (APPROVED değil); post uygulanmadı');

      for (const draft of journalDrafts) {
        const write = await this.journalWriter.write({ draft }, tx);
        if (!write.ok) {
          throw new ConflictException('Accounting journal write failed: ' + write.errors.map((error) => error.code).join(', '));
        }
      }
    });

    // P4 yürütme işaretleyici (bookkeeping; finansal truth zaten commit). Hata olursa post'u bozma — reconcile sonradan.
    try {
      await this.officeApproval.markExecutionSucceeded(disp.approvalRequestId, actor?.userId ?? disp.approvedById ?? '');
    } catch (e) {
      this.logger.warn(`markExecutionSucceeded başarısız (post commit edildi): ${dispositionId} — ${(e as Error).message}`);
    }

    this.logger.log(`CollectionDisposition POSTED: ${dispositionId} (${lines.length} satır)`);
    return { posted: true, dispositionId, lineCount: lines.length };
  }

  // ───────────────────────── internals ─────────────────────────

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
  private buildCollectionDispositionJournalDrafts(
    tenantId: string,
    disp: {
      id: string;
      collectionId: string;
      caseId: string;
      currency: string;
      manualReversalRequiredAt?: Date | null;
    },
    lines: Array<{ id: string; type: CollectionDispositionLineType; amount: Prisma.Decimal; caseClientId?: string | null }>,
    clientIdsByCaseClientId: Map<string, string>,
    postedAt: Date,
    actorUserId: string | null,
  ): ValidatedJournalEntryDraft[] {
    return lines.map((line) => {
      const source = this.collectionDispositionLineJournalSource(
        tenantId,
        disp,
        line,
        clientIdsByCaseClientId,
        postedAt,
        actorUserId,
      );
      const built = buildAccountingJournal(source);
      if (!built.ok) {
        throw new ConflictException(`Accounting journal mapping failed: ${built.errors.map((error) => error.code).join(', ')}`);
      }
      const validated = validateJournalDraft(built.draft);
      if (!validated.ok) {
        throw new ConflictException(`Accounting journal validation failed: ${validated.errors.map((error) => error.code).join(', ')}`);
      }
      return validated.draft;
    });
  }

  private collectionDispositionLineJournalSource(
    tenantId: string,
    disp: {
      id: string;
      collectionId: string;
      caseId: string;
      currency: string;
      manualReversalRequiredAt?: Date | null;
    },
    line: { id: string; type: CollectionDispositionLineType; amount: Prisma.Decimal; caseClientId?: string | null },
    clientIdsByCaseClientId: Map<string, string>,
    postedAt: Date,
    actorUserId: string | null,
  ): CollectionDispositionLineJournalSource {
    const creditAccountCode = this.dispositionCreditAccount(line.type);
    if (!creditAccountCode) {
      throw new ConflictException(`Accounting journal mapping yok; ${line.type} manual review gerektirir`);
    }

    const postedAtIso = postedAt.toISOString();
    return {
      tenantId,
      sourceType: 'COLLECTION_DISPOSITION_LINE',
      sourceId: line.id,
      sourceVersion: `${postedAtIso}:${line.id}`,
      sourceAction: 'posted',
      occurredAt: postedAtIso,
      effectiveDate: postedAtIso.slice(0, 10),
      actorId: actorUserId,
      currency: disp.currency,
      sourceHash: null,
      metadata: {
        dispositionId: disp.id,
        lineType: line.type,
        manualReversalRequiredAt: disp.manualReversalRequiredAt?.toISOString() ?? null,
      },
      payload: {
        lineType: line.type,
        amount: line.amount.toString(),
        caseId: disp.caseId,
        caseClientId: line.caseClientId ?? null,
        clientId: line.caseClientId ? (clientIdsByCaseClientId.get(line.caseClientId) ?? null) : null,
        collectionId: disp.collectionId,
        dispositionLineId: line.id,
        creditAccountCode,
        manualReversalRequiredAt: disp.manualReversalRequiredAt?.toISOString() ?? null,
      },
    };
  }

  private async resolveJournalLineClientIds(
    tenantId: string,
    caseId: string,
    lines: Array<{ caseClientId?: string | null }>,
  ): Promise<Map<string, string>> {
    const caseClientIds = [...new Set(lines.map((line) => line.caseClientId).filter((id): id is string => !!id))];
    if (caseClientIds.length === 0) return new Map();

    const rows = await this.prisma.caseClient.findMany({
      where: { id: { in: caseClientIds }, caseId, client: { tenantId } },
      select: { id: true, clientId: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row.clientId]));
    const missing = caseClientIds.find((id) => !byId.has(id));
    if (missing) {
      throw new BadRequestException(`journal caseClientId scope disi veya yabanci: ${missing}`);
    }
    return byId;
  }

  private dispositionCreditAccount(type: CollectionDispositionLineType): AccountingAccountCode | null {
    switch (type) {
      case CollectionDispositionLineType.CLIENT_PAYABLE:
        return 'CLIENT_PAYABLE';
      case CollectionDispositionLineType.CLIENT_EXPENSE_REIMBURSEMENT:
        return 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE';
      case CollectionDispositionLineType.CONTRACTUAL_FEE_WITHHELD:
        return 'ATTORNEY_FEE_REVENUE';
      case CollectionDispositionLineType.FIRM_EXPENSE_REIMBURSEMENT:
        return 'FIRM_EXPENSE_REIMBURSEMENT';
      case CollectionDispositionLineType.OFFSET_CLIENT_ADVANCE:
        return 'CLIENT_ADVANCE_BALANCE';
      default:
        return null;
    }
  }
  private toRiskInput(
    tenantId: string,
    disp: {
      id: string;
      collectionId: string;
      caseId: string;
      totalAmount: Prisma.Decimal;
      currency: string;
      status: string;
      manualReversalRequiredAt?: Date | null;
    },
    lines: Array<{
      id?: string;
      type: CollectionDispositionLineType;
      amount: Prisma.Decimal;
      caseClientId?: string | null;
      note?: string | null;
    }>,
  ): FinanceRiskCollectionDispositionInput {
    return {
      tenantId,
      dispositionId: disp.id,
      caseId: disp.caseId,
      collectionId: disp.collectionId,
      status: disp.status,
      totalAmount: disp.totalAmount.toString(),
      currency: disp.currency,
      manualReversalRequiredAt: disp.manualReversalRequiredAt ?? null,
      lines: lines.map((line) => ({
        id: line.id,
        type: line.type,
        amount: line.amount.toString(),
        caseClientId: line.caseClientId ?? null,
        note: line.note ?? null,
      })),
    };
  }

  private assertRiskRequiresApprovalRequest(evaluation: FinanceRiskEvaluation): void {
    if (evaluation.decision === FinanceRiskDecision.REQUIRE_APPROVAL) return;
    this.throwForRiskDecision(evaluation, 'Onay talebi olusturulamaz');
  }

  private assertRiskAllowsDomainMutation(evaluation: FinanceRiskEvaluation): void {
    if (evaluation.decision === FinanceRiskDecision.ALLOW_DIRECT || evaluation.decision === FinanceRiskDecision.REQUIRE_APPROVAL) return;
    this.throwForRiskDecision(evaluation, 'Dagitim onerisi uygulanamaz');
  }

  private assertRiskAllowsFinancialPosting(evaluation: FinanceRiskEvaluation): void {
    if (evaluation.decision === FinanceRiskDecision.ALLOW_DIRECT || evaluation.decision === FinanceRiskDecision.REQUIRE_APPROVAL) return;
    this.throwForRiskDecision(evaluation, 'Dagitim kesinlestirilemez');
  }

  private throwForRiskDecision(evaluation: FinanceRiskEvaluation, prefix: string): never {
    const message = `${prefix}: ${this.riskPublicMessage(evaluation)}`;
    if (evaluation.decision === FinanceRiskDecision.BLOCK) throw new BadRequestException(message);
    if (evaluation.decision === FinanceRiskDecision.MANUAL_REVIEW) throw new ConflictException(message);
    throw new ConflictException(message);
  }

  private riskPublicMessage(evaluation: FinanceRiskEvaluation): string {
    const messages = evaluation.reasons.map((reason) => reason.publicMessage).filter(Boolean);
    return messages.length > 0 ? messages.join(' | ') : evaluation.decision;
  }
  private async requireDisposition(tenantId: string, dispositionId: string) {
    const disp = await this.prisma.collectionDisposition.findFirst({
      where: { id: dispositionId, tenantId },
      select: {
        id: true, collectionId: true, caseId: true, beneficiaryScope: true,
        caseClientId: true, totalAmount: true, currency: true, status: true,
        approvalRequestId: true, approvedById: true, manualReversalRequiredAt: true,
      },
    });
    if (!disp) throw new NotFoundException('Dağıtım kaydı bulunamadı');
    return disp;
  }

  private async assertCollectionConfirmed(disp: { collectionId: string; caseId: string }) {
    const col = await this.prisma.collection.findFirst({
      where: { id: disp.collectionId, caseId: disp.caseId },
      select: { status: true },
    });
    if (!col) throw new BadRequestException('Tahsilat scope dışı (tenant/case/collection mismatch)');
    if (col.status !== 'CONFIRMED') {
      throw new BadRequestException(`Tahsilat ${col.status} — posting yasak (CONFIRMED değil)`);
    }
  }

  /** Line validasyonu + çözümleme (sum==totalAmount; pozitif; HELD yasak; caseClientId scope). */
  private resolveLines(
    disp: { beneficiaryScope: string; caseClientId: string | null; totalAmount: Prisma.Decimal },
    lines: PostDispositionDto['lines'],
  ): ResolvedLine[] {
    if (!lines || lines.length === 0) throw new BadRequestException('En az bir dağıtım satırı gerekir');
    let sum = new Prisma.Decimal(0);
    const resolved = lines.map((ln, i) => {
      if (ln.type === HELD) {
        throw new BadRequestException(`Satır ${i}: HELD_PENDING_DISTRIBUTION dağıtım satırı olamaz`);
      }
      let amount: Prisma.Decimal;
      try {
        amount = new Prisma.Decimal(ln.amount as Prisma.Decimal.Value);
      } catch {
        throw new BadRequestException(`Satır ${i}: geçersiz tutar`);
      }
      if (amount.lte(0)) throw new BadRequestException(`Satır ${i}: tutar pozitif olmalı`);
      sum = sum.plus(amount);

      let caseClientId: string | null;
      if (disp.beneficiaryScope === 'SINGLE_CASE_CLIENT') {
        // Q3: yalnız müvekkile-atfedilen tipler (CLIENT_PAYABLE, CLIENT_EXPENSE_REIMBURSEMENT) tek-alacaklının
        // caseClientId'sini devralır. Büro-geliri/firm tipleri (CONTRACTUAL_FEE_WITHHELD, OFFSET_CLIENT_ADVANCE,
        // FIRM_EXPENSE_REIMBURSEMENT, OTHER) client-attributed DEĞİLDİR → caseClientId null kalır (fee = büro geliri,
        // müvekkil alacağı değil; SINGLE scope'ta dahi client'a override edilmez).
        caseClientId = CLIENT_ATTRIBUTED.has(ln.type)
          ? (disp.caseClientId ?? ln.caseClientId ?? null)
          : (ln.caseClientId ?? null);
      } else {
        caseClientId = ln.caseClientId ?? null;
        if (CLIENT_ATTRIBUTED.has(ln.type) && !caseClientId) {
          throw new BadRequestException(`Satır ${i}: çoklu-alacaklı (CLUSTER) ${ln.type} için caseClientId zorunlu`);
        }
      }
      // FAZ-1b: reimbursement satırı bir ExpenseRequest'i kapatır → expenseRequestId ZORUNLU (1:1 binding;
      // hedef ExpenseRequest tam doğrulaması post()'ta finansal anda yapılır: APPROVED + remaining + currency).
      let expenseRequestId: string | null = ln.expenseRequestId ?? null;
      if (REIMBURSEMENT_TYPES.has(ln.type)) {
        if (!expenseRequestId) {
          throw new BadRequestException(`Satır ${i}: ${ln.type} için expenseRequestId zorunlu (kapatılan masraf)`);
        }
      } else {
        expenseRequestId = null; // reimbursement-dışı satırlar masraf bağlamaz
      }
      return { type: ln.type, amount, caseClientId, note: ln.note ?? null, expenseRequestId };
    });
    if (!sum.equals(disp.totalAmount)) {
      throw new BadRequestException(
        `Dağıtım toplamı (${sum.toString()}) tahsilat tutarına (${disp.totalAmount.toString()}) eşit olmalı`,
      );
    }
    return resolved;
  }

  /** Her caseClientId BU case'in eligible alacaklısı (ALACAKLI/ORTAK_ALACAKLI) olmalı; yabancı/uygunsuz rol reddedilir. */
  private async assertCaseClientRoles(tenantId: string, caseId: string, resolved: ResolvedLine[]): Promise<void> {
    const caseClientIds = [...new Set(resolved.map((r) => r.caseClientId).filter((x): x is string => !!x))];
    if (caseClientIds.length === 0) return;
    const valid = await this.prisma.caseClient.findMany({
      where: { id: { in: caseClientIds }, caseId, role: { in: ['ALACAKLI', 'ORTAK_ALACAKLI'] }, client: { tenantId } },
      select: { id: true },
    });
    const validSet = new Set(valid.map((v) => v.id));
    const foreign = caseClientIds.find((id) => !validSet.has(id));
    if (foreign) {
      throw new BadRequestException(`caseClientId geçersiz/yabancı veya uygun rolde değil (ALACAKLI/ORTAK_ALACAKLI): ${foreign}`);
    }
  }
}
