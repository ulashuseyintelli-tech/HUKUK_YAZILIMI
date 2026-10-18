import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { CLIENT_INTAKE_WRITE_TX, lockClientIntakeFieldSubmission, lockClientIntakeSubmission } from '../../common/client-intake-submission-lock';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { CaseDebtorLifecycleGuardService } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
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

// Yumuşak istihbarat (soft-6) + CLIENT-INTEL-4.6C ile ASSET/CONTACT → ClientIntelStatement (F46-K2).
// ADDRESS hâlâ AYRI (promote-address, DebtorAddress hedefi — HYBRID akış, burada DEĞİL).
// ASSET/CONTACT BİLİNÇLİ olarak serbest-metin beyan kalır (CLIENT-INTEL-FORM-TYPE-DESIGN kararı,
// 2026-07-04): canonical Asset/DebtorCommunication'a YAZILMAZ, yalnız 2 yeni ClientIntelCategory
// değeriyle (ASSET_DECLARATION/CONTACT_DECLARATION) diğer 6 kategoriyle BİREBİR aynı davranır.
const SOFT_TO_INTEL: Record<string, ClientIntelCategory> = {
  INCOME_SOURCE: ClientIntelCategory.INCOME_SOURCE,
  COMMERCIAL_RELATION: ClientIntelCategory.COMMERCIAL_RELATION,
  FAMILY_CIRCLE: ClientIntelCategory.FAMILY_CIRCLE,
  DIGITAL_FOOTPRINT: ClientIntelCategory.DIGITAL_FOOTPRINT,
  PAYMENT_HISTORY: ClientIntelCategory.PAYMENT_HISTORY,
  STRATEGY: ClientIntelCategory.STRATEGY,
  ASSET: ClientIntelCategory.ASSET_DECLARATION,
  CONTACT: ClientIntelCategory.CONTACT_DECLARATION,
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
 * KAPSAM: onaylı (APPROVED) SOFT-INTEL alanları → ClientIntelStatement (soft-6 + CLIENT-INTEL-4.6C
 * ile ASSET/CONTACT dahil, serbest-metin beyan olarak — 8 kategori). ADDRESS AYRI kalır (promote-address,
 * DebtorAddress hedefi — HYBRID akış farklı); bu uçtan skip edilir (skip + rapor; 4.6b).
 *
 * KURALLAR (kilitli):
 * - IDEMPOTENT: aday = reviewStatus=APPROVED & promotedRefId=null. promotedRef dolu alan tekrar yazılmaz.
 * - Gönderim kaynak kilidi altında hedef, field referansı, durum ve audit TEK transaction (orphan/çift-yazım yok).
 * - debtorId promote body'den; aynı tenant + aynı case (CaseDebtor) doğrulanır (F46-K1).
 * - Skip edilen APPROVED alanlar SESSİZCE KAYBOLMAZ → submission PARTIALLY_PROMOTED + skipped[] döner (F46-K4).
 * - 4.5 ReviewQueueModule'a DOKUNULMAZ; promote AYRI modül/serviste.
 */
@Injectable()
export class ClientIntakePromotionService {
  private readonly logger = new Logger(ClientIntakePromotionService.name);

  // I1A: OfficeApprovalService promote/promoteAddress/promoteSoft capability-gate için.
  // AuditService @Global.
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
    private readonly caseDebtorLifecycleGuard: CaseDebtorLifecycleGuardService,
  ) {}

  /**
   * I1A (owner-locked 2026-07-02) — promote, müvekkilin doğrulanmamış beyanını kanonik kayda
   * (ClientIntelStatement/DebtorAddress) çeviren TEK yol; bu domainin en yüksek-otorite eylemi
   * (veri-provenance sınırı). ClientIntelStatementService/ClientIntakeLinkService ile birebir desen.
   * Çağrıldığı yerler: promote(), promoteAddress(), promoteSoftField() (aynı transaction client'ı).
   */
  private async assertCanManagePromotion(userId: string | undefined, tenantId: string, db?: Prisma.TransactionClient): Promise<void> {
    if (!userId || !(await this.officeApproval.isApproverEligible(userId, tenantId, db))) {
      throw new ForbiddenException('Bu alanı kanonik kayda promote etme yetkiniz yok (PARTNER veya yetkilendirilmiş avukat gerekir)');
    }
  }

  /**
   * Onaylı soft-intel alanları ClientIntelStatement'a promote et (SUBMISSION-LEVEL, toplu).
   *
   * NOT (Faz 4.7 PR-C2a): Frontend (C2b) bu ucu KULLANMAZ — alan-bazlı promoteSoftField()
   * (POST /client-intake-fields/:fieldId/promote-soft) tercih edilir (bulk/tek-tık yok).
   * Bu metod backend'de ÇALIŞIR halde kalır (deprecate EDİLMEDİ); toplu komut bütünüyle atomiktir.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakePromotionController.promote() → POST /client-intake-submissions/:id/promote
   *   (frontend kullanmaz; geriye-dönük/programatik çağrılar için durur)
   * </remarks>
   */
  async promote(tenantId: string, submissionId: string, userId: string, debtorId: string): Promise<PromoteResult> {
    return this.prisma.$transaction(async tx => {
      await lockClientIntakeSubmission(tx, tenantId, submissionId);

      const sub = await tx.clientIntakeSubmission.findFirst({
        where: { id: submissionId, tenantId },
        select: { id: true, status: true, caseId: true },
      });
      if (!sub) throw new NotFoundException('Gönderim bulunamadı');

      // I1A: promote yetkisi — herhangi bir yazmadan/detaydan ÖNCE.
      await this.assertCanManagePromotion(userId, tenantId, tx);

      if (
        sub.status !== ClientIntakeSubmissionStatus.IN_REVIEW &&
        sub.status !== ClientIntakeSubmissionStatus.PARTIALLY_PROMOTED
      ) {
        throw new BadRequestException(`Promote yalnız IN_REVIEW/PARTIALLY_PROMOTED için (durum: ${sub.status})`);
      }

      // F46-K1: debtor aynı tenant + aynı case (CaseDebtor) mi?
      const debtor = await tx.debtor.findFirst({ where: { id: debtorId, tenantId }, select: { id: true } });
      if (!debtor) throw new BadRequestException('Borçlu bulunamadı (tenant)');
      const link = await tx.caseDebtor.findFirst({ where: { caseId: sub.caseId, debtorId }, select: { id: true } });
      if (!link) throw new BadRequestException('Borçlu bu takibe ait değil');

      // I09: passive CaseDebtor artık yeni promote hedefi olamaz (mevcut assertActiveByCaseDebtorId
      // deseni — diğer tüm CaseDebtor "yeni operasyon" yazıcılarıyla aynı). Late-result DEĞİL:
      // promote onaylı beyanı İLK KEZ kanoniğe yazan aktif bir karar eylemidir.
      await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, link.id, {
        expectedCaseId: sub.caseId,
        prisma: tx,
      });

      // İdempotent aday: APPROVED & henüz promote edilmemiş.
      const fields = await tx.clientIntakeField.findMany({
        where: { submissionId, reviewStatus: ClientIntakeFieldReviewStatus.APPROVED, promotedRefId: null },
        select: { id: true, category: true, label: true, value: true },
      });

      const promoted: PromoteResult['promoted'] = [];
      const skipped: PromoteResult['skipped'] = [];

      for (const f of fields) {
        const intelCategory = SOFT_TO_INTEL[f.category];
        if (!intelCategory) {
          // Yalnız ADDRESS bu yoldan promote edilmez (promote-address ayrı uç); sessizce kaybolmaz.
          skipped.push({ fieldId: f.id, category: f.category, reason: 'NON_SOFT_INTEL_4_6B' });
          continue;
        }
        // Atomik: kanonik create + promotedRef damgası tek transaction.
        const cis = await tx.clientIntelStatement.create({
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
          data: { promotedRefType: 'ClientIntelStatement', promotedRefId: cis.id, promotedAt: new Date(), promotedById: userId },
        });
        promoted.push({ fieldId: f.id, clientIntelStatementId: cis.id });
      }

      const newStatus = await this.recomputeSubmissionStatus(submissionId, sub.status, userId, tx);
      if (skipped.length) {
        this.logger.log(`Promote: ${promoted.length} yazıldı, ${skipped.length} skip (4.6b) — submission ${submissionId} → ${newStatus}`);
      }

      // Source decision, all target links, status and the single summary audit are atomic.
      if (promoted.length > 0) {
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: 'CLIENT_INTAKE_PROMOTE',
          entityType: 'CLIENT_INTAKE_SUBMISSION',
          entityId: submissionId,
          userId,
          oldValues: { status: sub.status },
          newValues: { status: newStatus, promoted, skipped },
        });
      }

      return { submissionStatus: newStatus, promoted, skipped };

    }, CLIENT_INTAKE_WRITE_TX);
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
    return this.prisma.$transaction(async tx => {
      await lockClientIntakeFieldSubmission(tx, tenantId, fieldId);

      const field = await tx.clientIntakeField.findFirst({
        where: { id: fieldId, submission: { tenantId } },
        select: {
          id: true, category: true, value: true, reviewStatus: true, promotedRefId: true,
          submission: { select: { id: true, status: true, caseId: true } },
        },
      });
      if (!field) throw new NotFoundException('Alan bulunamadı');

      // I1A: promote yetkisi — herhangi bir yazmadan/detaydan ÖNCE.
      await this.assertCanManagePromotion(userId, tenantId, tx);

      if (field.category !== 'ADDRESS') throw new BadRequestException('Yalnız ADDRESS alanı bu uçtan promote edilir');
      if (field.reviewStatus !== ClientIntakeFieldReviewStatus.APPROVED) throw new BadRequestException('Yalnız onaylı (APPROVED) alan promote edilir');
      if (field.promotedRefId) throw new BadRequestException('Alan zaten promote edilmiş'); // idempotent
      const subStatus = field.submission.status;
      if (subStatus !== ClientIntakeSubmissionStatus.IN_REVIEW && subStatus !== ClientIntakeSubmissionStatus.PARTIALLY_PROMOTED) {
        throw new BadRequestException(`Promote yalnız IN_REVIEW/PARTIALLY_PROMOTED için (durum: ${subStatus})`);
      }

      // F46-K1: debtor aynı tenant + aynı case (CaseDebtor) mi?
      const debtor = await tx.debtor.findFirst({ where: { id: dto.debtorId, tenantId }, select: { id: true } });
      if (!debtor) throw new BadRequestException('Borçlu bulunamadı (tenant)');
      const cd = await tx.caseDebtor.findFirst({ where: { caseId: field.submission.caseId, debtorId: dto.debtorId }, select: { id: true } });
      if (!cd) throw new BadRequestException('Borçlu bu takibe ait değil');

      // I09: passive CaseDebtor artık yeni promote hedefi olamaz (bkz. promote() üstündeki not).
      await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, cd.id, {
        expectedCaseId: field.submission.caseId,
        prisma: tx,
      });

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
      const r = await findOrCreateDebtorAddress(tx, data);
      if (r.created) {
        await tx.clientIntakeField.update({
          where: { id: fieldId },
          data: { promotedRefType: 'DebtorAddress', promotedRefId: r.address.id, promotedAt: new Date(), promotedById: userId },
        });
        // I1A: yalnız GERÇEK promote'ta audit — DUPLICATE dalında (r.created=false) kanonik
        // yazma yok, audit de yok (aşağıdaki !created kontrolü).
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: 'CLIENT_INTAKE_PROMOTE_ADDRESS',
          entityType: 'CLIENT_INTAKE_FIELD',
          entityId: fieldId,
          userId,
          oldValues: { reviewStatus: field.reviewStatus, promotedRefId: field.promotedRefId },
          newValues: { promotedRefType: 'DebtorAddress', promotedRefId: r.address.id },
        });
      }
      const { address, created } = r;

      if (!created) {
        // DUPLICATE: yeni kanonik kayıt YOK → promotedRef DOLDURULMADI (D3). Audit doğru kalır.
        this.logger.log(`Promote-address DUPLICATE: field ${fieldId} → mevcut DebtorAddress ${address.id} (promotedRef set edilmedi)`);
        return { result: 'DUPLICATE_ADDRESS', debtorAddressId: address.id, submissionStatus: subStatus };
      }

      const submissionStatus = await this.recomputeSubmissionStatus(field.submission.id, subStatus, userId, tx);
      return { result: 'PROMOTED', debtorAddressId: address.id, submissionStatus };

    }, CLIENT_INTAKE_WRITE_TX);
  }

  /**
   * TEK soft-intel alanını ClientIntelStatement'a promote et (Faz 4.7 PR-C2a — FIELD-LEVEL).
   *
   * Bulk YOK: tam olarak BİR alan yazılır (C2b promote yolu yalnız budur).
   * SOFT_TO_INTEL kapsamındaki 8 kategori (soft-6 + CLIENT-INTEL-4.6C ile ASSET/CONTACT).
   * ADDRESS AYRI kalır → promote-address ucu kullanılır (HYBRID, DebtorAddress hedefi farklı).
   * Diğer promote uçlarıyla aynı kaynak kilidini kullanır; SOFT_TO_INTEL +
   * recomputeSubmissionStatus REUSE edilir (kod tekrarı yok).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakePromotionController.promoteSoft() → POST /client-intake-fields/:fieldId/promote-soft
   * </remarks>
   */
  async promoteSoftField(tenantId: string, fieldId: string, userId: string, debtorId: string): Promise<PromoteSoftResult> {
    return this.prisma.$transaction(async tx => {
      await lockClientIntakeFieldSubmission(tx, tenantId, fieldId);

      const field = await tx.clientIntakeField.findFirst({
        where: { id: fieldId, submission: { tenantId } },
        select: {
          id: true, category: true, label: true, value: true, reviewStatus: true, promotedRefId: true,
          submission: { select: { id: true, status: true, caseId: true } },
        },
      });
      if (!field) throw new NotFoundException('Alan bulunamadı');

      // I1A: promote yetkisi — herhangi bir yazmadan/detaydan ÖNCE.
      await this.assertCanManagePromotion(userId, tenantId, tx);

      // SOFT_TO_INTEL kapsamındaki 8 kategori (soft-6 + ASSET/CONTACT). ADDRESS bu uçtan promote EDİLMEZ.
      const intelCategory = SOFT_TO_INTEL[field.category];
      if (!intelCategory) {
        throw new BadRequestException('Bu uç yumuşak istihbarat + varlık/iletişim beyanını promote eder (ADDRESS için promote-address kullanın)');
      }
      if (field.reviewStatus !== ClientIntakeFieldReviewStatus.APPROVED) throw new BadRequestException('Yalnız onaylı (APPROVED) alan promote edilir');
      if (field.promotedRefId) throw new BadRequestException('Alan zaten promote edilmiş'); // idempotent
      const subStatus = field.submission.status;
      if (subStatus !== ClientIntakeSubmissionStatus.IN_REVIEW && subStatus !== ClientIntakeSubmissionStatus.PARTIALLY_PROMOTED) {
        throw new BadRequestException(`Promote yalnız IN_REVIEW/PARTIALLY_PROMOTED için (durum: ${subStatus})`);
      }

      // F46-K1: debtor aynı tenant + aynı case (CaseDebtor) mi?
      const debtor = await tx.debtor.findFirst({ where: { id: debtorId, tenantId }, select: { id: true } });
      if (!debtor) throw new BadRequestException('Borçlu bulunamadı (tenant)');
      const cd = await tx.caseDebtor.findFirst({ where: { caseId: field.submission.caseId, debtorId }, select: { id: true } });
      if (!cd) throw new BadRequestException('Borçlu bu takibe ait değil');

      // I09: passive CaseDebtor artık yeni promote hedefi olamaz (bkz. promote() üstündeki not).
      await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, cd.id, {
        expectedCaseId: field.submission.caseId,
        prisma: tx,
      });

      // Atomik: kanonik create + promotedRef damgası TEK transaction (orphan/çift-yazım yok).
      const cis = await tx.clientIntelStatement.create({
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
        data: { promotedRefType: 'ClientIntelStatement', promotedRefId: cis.id, promotedAt: new Date(), promotedById: userId },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_INTAKE_PROMOTE_SOFT',
        entityType: 'CLIENT_INTAKE_FIELD',
        entityId: fieldId,
        userId,
        oldValues: { reviewStatus: field.reviewStatus, promotedRefId: field.promotedRefId },
        newValues: { promotedRefType: 'ClientIntelStatement', promotedRefId: cis.id },
      });

      const submissionStatus = await this.recomputeSubmissionStatus(field.submission.id, subStatus, userId, tx);
      return { result: 'PROMOTED', clientIntelStatementId: cis.id, submissionStatus };

    }, CLIENT_INTAKE_WRITE_TX);
  }

  /** APPROVED alanların tamamı promote edildiyse COMPLETED, kalan varsa PARTIALLY_PROMOTED.
   * Çağrıldığı yerler: promote(), promoteAddress(), promoteSoftField() (kaynak kilidi altında).
   */
  private async recomputeSubmissionStatus(
    submissionId: string,
    fallback: ClientIntakeSubmissionStatus,
    userId: string,
    db: Prisma.TransactionClient,
  ): Promise<ClientIntakeSubmissionStatus> {
    const approvedTotal = await db.clientIntakeField.count({
      where: { submissionId, reviewStatus: ClientIntakeFieldReviewStatus.APPROVED },
    });
    const promotedTotal = await db.clientIntakeField.count({
      where: { submissionId, reviewStatus: ClientIntakeFieldReviewStatus.APPROVED, promotedRefId: { not: null } },
    });
    let newStatus = fallback;
    if (approvedTotal > 0) {
      newStatus = promotedTotal >= approvedTotal
        ? ClientIntakeSubmissionStatus.COMPLETED
        : ClientIntakeSubmissionStatus.PARTIALLY_PROMOTED;
    }
    if (newStatus !== fallback) {
      await db.clientIntakeSubmission.update({
        where: { id: submissionId },
        data: { status: newStatus, reviewedById: userId, reviewedAt: new Date() },
      });
    }
    return newStatus;
  }
}
