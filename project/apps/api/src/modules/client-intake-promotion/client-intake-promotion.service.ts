import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ClientIntakeSubmissionStatus,
  ClientIntakeFieldReviewStatus,
  ClientIntelCategory,
  ClientIntelSource,
  ClientIntelConfidence,
  ClientIntelStatus,
  AddressSource,
  AddressType,
  AddressCategory,
  ConfidenceLevel,
} from '@prisma/client';
import { findOrCreateDebtorAddress } from '@/common/address-hash.util';
import { PromoteAddressDto } from './dto/promote-address.dto';

export interface PromoteAddressResult {
  result: 'PROMOTED' | 'DUPLICATE_ADDRESS';
  debtorAddressId: string;
  submissionStatus: ClientIntakeSubmissionStatus;
}

// Yalnız YUMUŞAK istihbarat → ClientIntelStatement (F46-K2). Diğerleri (ADDRESS/ASSET/CONTACT) 4.6b/c.
const SOFT_TO_INTEL: Record<string, ClientIntelCategory> = {
  INCOME_SOURCE: ClientIntelCategory.INCOME_SOURCE,
  COMMERCIAL_RELATION: ClientIntelCategory.COMMERCIAL_RELATION,
  FAMILY_CIRCLE: ClientIntelCategory.FAMILY_CIRCLE,
  DIGITAL_FOOTPRINT: ClientIntelCategory.DIGITAL_FOOTPRINT,
  PAYMENT_HISTORY: ClientIntelCategory.PAYMENT_HISTORY,
  STRATEGY: ClientIntelCategory.STRATEGY,
};

export interface PromoteResult {
  submissionStatus: ClientIntakeSubmissionStatus;
  promoted: { fieldId: string; clientIntelStatementId: string }[];
  skipped: { fieldId: string; category: string; reason: string }[];
}

export interface PromoteSoftResult {
  result: 'PROMOTED';
  clientIntelStatementId: string;
  submissionStatus: ClientIntakeSubmissionStatus;
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
   * Onaylı soft-intel alanları ClientIntelStatement'a promote et (SUBMISSION-LEVEL, toplu).
   *
   * NOT (Faz 4.7 PR-C2a): Frontend (C2b) bu ucu KULLANMAZ — alan-bazlı promoteSoftField()
   * (POST /client-intake-fields/:fieldId/promote-soft) tercih edilir (bulk/tek-tık yok).
   * Bu metod backend'de ÇALIŞIR halde kalır (deprecate EDİLMEDİ); davranışı değişmedi.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakePromotionController.promote() → POST /client-intake-submissions/:id/promote
   *   (frontend kullanmaz; geriye-dönük/programatik çağrılar için durur)
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

  /**
   * ADDRESS alanını DebtorAddress(source=CLIENT)'e promote et (Faz 4.6b — HYBRID).
   * Ham müvekkil beyanı rawAddress'te korunur; YAPISAL street/city personelden (dto).
   * Duplicate (aynı hash) → promotedRef DOLDURULMAZ, DUPLICATE_ADDRESS döner (audit doğru).
   * Soft-intel promote (promote()) davranışına DOKUNMAZ.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakePromotionController.promoteAddress() → POST /client-intake-fields/:fieldId/promote-address
   * </remarks>
   */
  async promoteAddress(tenantId: string, fieldId: string, userId: string, dto: PromoteAddressDto): Promise<PromoteAddressResult> {
    const field = await this.prisma.clientIntakeField.findFirst({
      where: { id: fieldId, submission: { tenantId } },
      select: {
        id: true, category: true, value: true, reviewStatus: true, promotedRefId: true,
        submission: { select: { id: true, status: true, caseId: true } },
      },
    });
    if (!field) throw new NotFoundException('Alan bulunamadı');
    if (field.category !== 'ADDRESS') throw new BadRequestException('Yalnız ADDRESS alanı bu uçtan promote edilir');
    if (field.reviewStatus !== ClientIntakeFieldReviewStatus.APPROVED) throw new BadRequestException('Yalnız onaylı (APPROVED) alan promote edilir');
    if (field.promotedRefId) throw new BadRequestException('Alan zaten promote edilmiş'); // idempotent
    const subStatus = field.submission.status;
    if (subStatus !== ClientIntakeSubmissionStatus.IN_REVIEW && subStatus !== ClientIntakeSubmissionStatus.PARTIALLY_PROMOTED) {
      throw new BadRequestException(`Promote yalnız IN_REVIEW/PARTIALLY_PROMOTED için (durum: ${subStatus})`);
    }

    // F46-K1: debtor aynı tenant + aynı case (CaseDebtor) mi?
    const debtor = await this.prisma.debtor.findFirst({ where: { id: dto.debtorId, tenantId }, select: { id: true } });
    if (!debtor) throw new BadRequestException('Borçlu bulunamadı (tenant)');
    const cd = await this.prisma.caseDebtor.findFirst({ where: { caseId: field.submission.caseId, debtorId: dto.debtorId }, select: { id: true } });
    if (!cd) throw new BadRequestException('Borçlu bu takibe ait değil');

    const data = {
      debtorId: dto.debtorId,
      street: dto.street,
      city: dto.city,
      district: dto.district ?? null,
      postalCode: dto.postalCode ?? null,
      country: dto.country ?? 'Türkiye',
      source: AddressSource.CLIENT,
      type: AddressType.DECLARED,
      addressCategory: AddressCategory.DECLARED_CLIENT,
      verified: false,
      confidenceLevel: ConfidenceLevel.LOW,
      rawAddress: field.value, // ham müvekkil beyanı korunur
    };

    // Atomik: bul-veya-oluştur (RFA-006 ortak helper) + (created ise) promotedRef damgası tek transaction.
    const { address, created } = await this.prisma.$transaction(async (tx) => {
      const r = await findOrCreateDebtorAddress(tx, data);
      if (r.created) {
        await tx.clientIntakeField.update({
          where: { id: fieldId },
          data: { promotedRefType: 'DebtorAddress', promotedRefId: r.address.id },
        });
      }
      return r;
    });

    if (!created) {
      // DUPLICATE: yeni kanonik kayıt YOK → promotedRef DOLDURULMADI (D3). Audit doğru kalır.
      this.logger.log(`Promote-address DUPLICATE: field ${fieldId} → mevcut DebtorAddress ${address.id} (promotedRef set edilmedi)`);
      return { result: 'DUPLICATE_ADDRESS', debtorAddressId: address.id, submissionStatus: subStatus };
    }

    const submissionStatus = await this.recomputeSubmissionStatus(field.submission.id, subStatus, userId);
    return { result: 'PROMOTED', debtorAddressId: address.id, submissionStatus };
  }

  /**
   * TEK soft-intel alanını ClientIntelStatement'a promote et (Faz 4.7 PR-C2a — FIELD-LEVEL).
   *
   * Bulk YOK: tam olarak BİR alan yazılır (C2b promote yolu yalnız budur).
   * Yalnız 6 SOFT kategori (SOFT_TO_INTEL). ADDRESS → promote-address; ASSET/CONTACT → 400 (4.6c yok).
   * Submission-level promote() ve promoteAddress() davranışına DOKUNMAZ; SOFT_TO_INTEL +
   * recomputeSubmissionStatus REUSE edilir (kod tekrarı yok).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakePromotionController.promoteSoft() → POST /client-intake-fields/:fieldId/promote-soft
   * </remarks>
   */
  async promoteSoftField(tenantId: string, fieldId: string, userId: string, debtorId: string): Promise<PromoteSoftResult> {
    const field = await this.prisma.clientIntakeField.findFirst({
      where: { id: fieldId, submission: { tenantId } },
      select: {
        id: true, category: true, label: true, value: true, reviewStatus: true, promotedRefId: true,
        submission: { select: { id: true, status: true, caseId: true } },
      },
    });
    if (!field) throw new NotFoundException('Alan bulunamadı');

    // Yalnız SOFT-6. ADDRESS/ASSET/CONTACT bu uçtan promote EDİLMEZ.
    const intelCategory = SOFT_TO_INTEL[field.category];
    if (!intelCategory) {
      throw new BadRequestException('Bu uç yalnız yumuşak istihbarat alanlarını promote eder (ADDRESS için promote-address; ASSET/CONTACT henüz yok)');
    }
    if (field.reviewStatus !== ClientIntakeFieldReviewStatus.APPROVED) throw new BadRequestException('Yalnız onaylı (APPROVED) alan promote edilir');
    if (field.promotedRefId) throw new BadRequestException('Alan zaten promote edilmiş'); // idempotent
    const subStatus = field.submission.status;
    if (subStatus !== ClientIntakeSubmissionStatus.IN_REVIEW && subStatus !== ClientIntakeSubmissionStatus.PARTIALLY_PROMOTED) {
      throw new BadRequestException(`Promote yalnız IN_REVIEW/PARTIALLY_PROMOTED için (durum: ${subStatus})`);
    }

    // F46-K1: debtor aynı tenant + aynı case (CaseDebtor) mi?
    const debtor = await this.prisma.debtor.findFirst({ where: { id: debtorId, tenantId }, select: { id: true } });
    if (!debtor) throw new BadRequestException('Borçlu bulunamadı (tenant)');
    const cd = await this.prisma.caseDebtor.findFirst({ where: { caseId: field.submission.caseId, debtorId }, select: { id: true } });
    if (!cd) throw new BadRequestException('Borçlu bu takibe ait değil');

    // Atomik: kanonik create + promotedRef damgası TEK transaction (orphan/çift-yazım yok).
    const cis = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clientIntelStatement.create({
        data: {
          tenantId,
          caseId: field.submission.caseId,
          debtorId,
          category: intelCategory,
          label: field.label ?? null,
          value: field.value,
          source: ClientIntelSource.CLIENT_DECLARATION,
          confidence: ClientIntelConfidence.DECLARED,
          status: ClientIntelStatus.ACTIVE,
          createdById: userId,
        },
      });
      await tx.clientIntakeField.update({
        where: { id: fieldId },
        data: { promotedRefType: 'ClientIntelStatement', promotedRefId: created.id },
      });
      return created;
    });

    const submissionStatus = await this.recomputeSubmissionStatus(field.submission.id, subStatus, userId);
    return { result: 'PROMOTED', clientIntelStatementId: cis.id, submissionStatus };
  }

  /** APPROVED alanların tamamı promote edildiyse COMPLETED, kalan varsa PARTIALLY_PROMOTED. */
  private async recomputeSubmissionStatus(
    submissionId: string,
    fallback: ClientIntakeSubmissionStatus,
    userId: string,
  ): Promise<ClientIntakeSubmissionStatus> {
    const approvedTotal = await this.prisma.clientIntakeField.count({
      where: { submissionId, reviewStatus: ClientIntakeFieldReviewStatus.APPROVED },
    });
    const promotedTotal = await this.prisma.clientIntakeField.count({
      where: { submissionId, reviewStatus: ClientIntakeFieldReviewStatus.APPROVED, promotedRefId: { not: null } },
    });
    let newStatus = fallback;
    if (approvedTotal > 0) {
      newStatus = promotedTotal >= approvedTotal
        ? ClientIntakeSubmissionStatus.COMPLETED
        : ClientIntakeSubmissionStatus.PARTIALLY_PROMOTED;
    }
    if (newStatus !== fallback) {
      await this.prisma.clientIntakeSubmission.update({
        where: { id: submissionId },
        data: { status: newStatus, reviewedById: userId, reviewedAt: new Date() },
      });
    }
    return newStatus;
  }
}
