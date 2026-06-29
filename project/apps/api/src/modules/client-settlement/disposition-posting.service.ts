import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma, CollectionDispositionLineType, OfficeApprovalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { PostDispositionDto } from './dto/post-disposition.dto';
import { FinanceApprovalIntentBuilder } from './finance-approval-intent.builder';
import { FinanceRiskEngine } from './finance-risk.engine';
import { FinanceRiskCollectionDispositionInput, FinanceRiskDecision, FinanceRiskEvaluation } from './finance-risk.types';

const HELD = CollectionDispositionLineType.HELD_PENDING_DISTRIBUTION;
/** CLUSTER'da caseClientId zorunlu olan müvekkile-atfedilen tipler. */
const CLIENT_ATTRIBUTED = new Set<CollectionDispositionLineType>([
  CollectionDispositionLineType.CLIENT_PAYABLE,
  CollectionDispositionLineType.CLIENT_EXPENSE_REIMBURSEMENT,
]);

/** P4 OfficeApprovalRequest action sözleşmesi (disposition post onayı). */
const APPROVAL_ACTION_CODE = 'COLLECTION_DISPOSITION_POST';
const APPROVAL_TARGET_TYPE = 'COLLECTION_DISPOSITION';

interface ResolvedLine {
  type: CollectionDispositionLineType;
  amount: Prisma.Decimal;
  caseClientId: string | null;
  note: string | null;
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
    private readonly financeRisk: FinanceRiskEngine = new FinanceRiskEngine(),
    private readonly approvalIntentBuilder: FinanceApprovalIntentBuilder = new FinanceApprovalIntentBuilder(),
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
          data: { dispositionId, type: r.type, amount: r.amount, caseClientId: r.caseClientId, note: r.note },
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
      select: { id: true, type: true, amount: true },
    });
    if (lines.length === 0) throw new BadRequestException('Dağıtım satırı yok');
    const sum = lines.reduce((acc, l) => acc.plus(new Prisma.Decimal(l.amount)), new Prisma.Decimal(0));
    if (!sum.equals(disp.totalAmount)) {
      throw new BadRequestException(`POSTED dağıtım toplamı (${sum.toString()}) tahsilat tutarına (${disp.totalAmount.toString()}) eşit olmalı`);
    }

    const postRisk = this.financeRisk.evaluateCollectionDispositionPost(this.toRiskInput(tenantId, disp, lines));
    this.assertRiskAllowsFinancialPosting(postRisk);

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
        }
      }
      const upd = await tx.collectionDisposition.updateMany({
        where: { id: dispositionId, tenantId, status: 'DISTRIBUTION_APPROVED' },
        data: { status: 'POSTED', postedAt: new Date(), postedById: actor?.userId },
      });
      if (upd.count === 0) throw new ConflictException('Disposition eşzamanlı değişti (APPROVED değil); post uygulanmadı');
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
        caseClientId = disp.caseClientId ?? ln.caseClientId ?? null;
      } else {
        caseClientId = ln.caseClientId ?? null;
        if (CLIENT_ATTRIBUTED.has(ln.type) && !caseClientId) {
          throw new BadRequestException(`Satır ${i}: çoklu-alacaklı (CLUSTER) ${ln.type} için caseClientId zorunlu`);
        }
      }
      return { type: ln.type, amount, caseClientId, note: ln.note ?? null };
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
