import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ClientIntakeSubmissionStatus,
  ClientIntakeFieldReviewStatus,
  ClientIntelCategory,
  ClientIntelSource,
  ClientIntelConfidence,
  ClientIntelStatus,
} from '@prisma/client';

// Yalnız YUMUŞAK istihbarat → ClientIntelStatement (F46-K2). Diğerleri (ADDRESS/ASSET/CONTACT) 4.6b/c.
const SOFT_TO_INTEL: Record<string, ClientIntelCategory> = {
  INCOME_SOURCE: ClientIntelCategory.INCOME_SOURCE,
  COMMERCIAL_RELATION: ClientIntelCategory.COMMERCIAL_RELATION,
  FAMILY_CIRCLE: ClientIntelCategory.FAMILY_CIRCLE,
  DIGITAL_FOOTPRINT: ClientIntelCategory.DIGITAL_FOOTPRINT,
  PAYMENT_HISTORY: ClientIntelCategory.PAYMENT_HISTORY,
  STRATEGY: ClientIntelCategory.STRATEGY,
};

interface PromoteResult {
  submissionStatus: ClientIntakeSubmissionStatus;
  promoted: { fieldId: string; clientIntelStatementId: string }[];
  skipped: { fieldId: string; category: string; reason: string }[];
}

/**
 * Client Intake PROMOTE servisi (Faz 4.6) — dış-form verisinin İLK KEZ kanoniğe yazıldığı KÖPRÜ.
 *
 * KAPSAM (dar): YALNIZ onaylı (APPROVED) SOFT-INTEL alanları → ClientIntelStatement.
 * ADDRESS/ASSET/CONTACT bu PR'da promote EDİLMEZ (skip + rapor; 4.6b/c).
 *
 * KURALLAR (kilitli):
 * - IDEMPOTENT: aday = reviewStatus=APPROVED & promotedRefId=null. promotedRef dolu alan tekrar yazılmaz.
 * - Her field: ClientIntelStatement.create + field.promotedRef update TEK transaction (orphan/çift-yazım yok).
 * - debtorId promote body'den; aynı tenant + aynı case (CaseDebtor) doğrulanır (F46-K1).
 * - Skip edilen APPROVED alanlar SESSİZCE KAYBOLMAZ → submission PARTIALLY_PROMOTED + skipped[] döner (F46-K4).
 * - 4.5 ReviewQueueModule'a DOKUNULMAZ; promote AYRI modül/serviste.
 */
@Injectable()
export class ClientIntakePromotionService {
  private readonly logger = new Logger(ClientIntakePromotionService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Onaylı soft-intel alanları ClientIntelStatement'a promote et.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakePromotionController.promote() → POST /client-intake-submissions/:id/promote
   * </remarks>
   */
  async promote(tenantId: string, submissionId: string, userId: string, debtorId: string): Promise<PromoteResult> {
    const sub = await this.prisma.clientIntakeSubmission.findFirst({
      where: { id: submissionId, tenantId },
      select: { id: true, status: true, caseId: true },
    });
    if (!sub) throw new NotFoundException('Gönderim bulunamadı');
    if (
      sub.status !== ClientIntakeSubmissionStatus.IN_REVIEW &&
      sub.status !== ClientIntakeSubmissionStatus.PARTIALLY_PROMOTED
    ) {
      throw new BadRequestException(`Promote yalnız IN_REVIEW/PARTIALLY_PROMOTED için (durum: ${sub.status})`);
    }

    // F46-K1: debtor aynı tenant + aynı case (CaseDebtor) mi?
    const debtor = await this.prisma.debtor.findFirst({ where: { id: debtorId, tenantId }, select: { id: true } });
    if (!debtor) throw new BadRequestException('Borçlu bulunamadı (tenant)');
    const link = await this.prisma.caseDebtor.findFirst({ where: { caseId: sub.caseId, debtorId }, select: { id: true } });
    if (!link) throw new BadRequestException('Borçlu bu takibe ait değil');

    // İdempotent aday: APPROVED & henüz promote edilmemiş.
    const fields = await this.prisma.clientIntakeField.findMany({
      where: { submissionId, reviewStatus: ClientIntakeFieldReviewStatus.APPROVED, promotedRefId: null },
      select: { id: true, category: true, label: true, value: true },
    });

    const promoted: PromoteResult['promoted'] = [];
    const skipped: PromoteResult['skipped'] = [];

    for (const f of fields) {
      const intelCategory = SOFT_TO_INTEL[f.category];
      if (!intelCategory) {
        // ADDRESS/ASSET/CONTACT → bu fazda promote yok (sessizce kaybolmaz).
        skipped.push({ fieldId: f.id, category: f.category, reason: 'NON_SOFT_INTEL_4_6B' });
        continue;
      }
      // Atomik: kanonik create + promotedRef damgası tek transaction.
      const cis = await this.prisma.$transaction(async (tx) => {
        const created = await tx.clientIntelStatement.create({
          data: {
            tenantId,
            caseId: sub.caseId,
            debtorId,
            category: intelCategory,
            label: f.label ?? null,
            value: f.value,
            source: ClientIntelSource.CLIENT_DECLARATION,
            confidence: ClientIntelConfidence.DECLARED,
            status: ClientIntelStatus.ACTIVE,
            createdById: userId,
          },
        });
        await tx.clientIntakeField.update({
          where: { id: f.id },
          data: { promotedRefType: 'ClientIntelStatement', promotedRefId: created.id },
        });
        return created;
      });
      promoted.push({ fieldId: f.id, clientIntelStatementId: cis.id });
    }

    // Submission status: tüm APPROVED promote edildiyse COMPLETED, kalan varsa PARTIALLY_PROMOTED (F46-K4).
    const approvedTotal = await this.prisma.clientIntakeField.count({
      where: { submissionId, reviewStatus: ClientIntakeFieldReviewStatus.APPROVED },
    });
    const promotedTotal = await this.prisma.clientIntakeField.count({
      where: { submissionId, reviewStatus: ClientIntakeFieldReviewStatus.APPROVED, promotedRefId: { not: null } },
    });

    let newStatus: ClientIntakeSubmissionStatus = sub.status;
    if (approvedTotal > 0) {
      newStatus = promotedTotal >= approvedTotal
        ? ClientIntakeSubmissionStatus.COMPLETED
        : ClientIntakeSubmissionStatus.PARTIALLY_PROMOTED;
    }
    if (newStatus !== sub.status) {
      await this.prisma.clientIntakeSubmission.update({
        where: { id: submissionId },
        data: { status: newStatus, reviewedById: userId, reviewedAt: new Date() },
      });
    }
    if (skipped.length) {
      this.logger.log(`Promote: ${promoted.length} yazıldı, ${skipped.length} skip (4.6b) — submission ${submissionId} → ${newStatus}`);
    }

    return { submissionStatus: newStatus, promoted, skipped };
  }
}
