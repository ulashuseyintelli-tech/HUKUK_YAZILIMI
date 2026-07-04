import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Prisma,
  CaseFeeAgreement,
  FeeAgreementType,
  FeeAgreementBase,
  FeeAgreementStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateCaseFeeAgreementInput,
  UpdateCaseFeeAgreementInput,
  NormalizedFeeShape,
} from './dto/case-fee-agreement.dto';

const PERCENTAGE_BPS_MIN = 1; // > %0 (0 anlamsız sözleşme)
const PERCENTAGE_BPS_MAX = 10000; // %100 üst sınır (brütü aşamaz mantığı recommendation'da; burada taban guard)

/**
 * S8-B FAZ-2 — CaseFeeAgreement domain servisi (Akdi Ücret Sözleşmesi CRUD + validation + versiyonlama).
 *
 * ÇEKİRDEK İLKE: Bu servis bir SÖZLEŞME KAYDI yönetir. Para hareketi YAPMAZ, yevmiye YAZMAZ,
 * dağıtım önerisine BAĞLANMAZ (recommendation entegrasyonu = PR-3; flag = PR-3). Yalnız agreement
 * yaşam döngüsü: create / update(=yeni versiyon) / terminate + read.
 *
 * v1 ürün kuralları (schema DB-enforce edemez → burada enforce edilir):
 *  - Tek ACTIVE / (tenant, caseClient). Edit = yeni satır (ACTIVE) + eski SUPERSEDED (immutable versiyonlama).
 *  - Yalnız GROSS taban (NET_OF_EXPENSE REDDEDİLİR — FAZ-1b sonrası).
 *  - FLAT_AMOUNT → flatAmount (faithful decimal-string, >0, ≤2dp); PERCENTAGE_OF_COLLECTION → percentageBps (int 1..10000).
 *  - Mutasyon (create/update/terminate) capability-gated (PARTNER / yetkilendirilmiş avukat — isApproverEligible).
 *  - Tenant scope tüm sorgularda zorunlu.
 */
@Injectable()
export class CaseFeeAgreementService {
  private readonly logger = new Logger(CaseFeeAgreementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly officeApproval: OfficeApprovalService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Yeni ücret sözleşmesi (ACTIVE). Aynı caseClient için zaten ACTIVE varsa reddedilir (güncelleme kullanılmalı).
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - (PR-3) distribution-recommendation entegrasyonu / FE editör → henüz YOK (dormant; controller bağlanmadı).
   * /// </remarks>
   */
  async create(
    tenantId: string,
    input: CreateCaseFeeAgreementInput,
    actor: { userId: string },
  ): Promise<CaseFeeAgreement> {
    if (!actor?.userId) throw new BadRequestException('create için actor (userId) gerekir');
    await this.assertCanManage(actor.userId, tenantId);
    if (!input?.caseClientId) throw new BadRequestException('caseClientId gerekir');
    const norm = this.validateFeeShape(input);
    await this.assertCaseClientInTenant(tenantId, input.caseClientId);

    const caseId = await this.resolveCaseId(input.caseClientId);

    const created = await this.prisma.$transaction(async (tx) => {
      const existingActive = await tx.caseFeeAgreement.findFirst({
        where: { tenantId, caseClientId: input.caseClientId, status: FeeAgreementStatus.ACTIVE },
        select: { id: true },
      });
      if (existingActive) {
        throw new ConflictException(
          'Bu müvekkil için zaten ACTIVE ücret sözleşmesi var; güncelleyin (edit = yeni versiyon)',
        );
      }
      const row = await tx.caseFeeAgreement.create({
        data: {
          tenantId,
          caseClientId: input.caseClientId,
          feeType: input.feeType,
          flatAmount: norm.flatAmount,
          percentageBps: norm.percentageBps,
          feeBase: norm.feeBase,
          status: FeeAgreementStatus.ACTIVE,
          effectiveFrom: norm.effectiveFrom,
          note: input.note ?? null,
          createdById: actor.userId,
        },
      });

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CASE_FEE_AGREEMENT_CREATE',
        entityType: 'CASE_FEE_AGREEMENT',
        entityId: row.id,
        userId: actor.userId,
        newValues: {
          caseId,
          caseClientId: row.caseClientId,
          feeType: row.feeType,
          flatAmount: row.flatAmount,
          percentageBps: row.percentageBps,
          feeBase: row.feeBase,
          status: row.status,
          effectiveFrom: row.effectiveFrom,
        },
      });

      return row;
    });

    this.logger.log(`CaseFeeAgreement created: ${created.id} (caseClient=${input.caseClientId}, ${input.feeType})`);
    return created;
  }

  /**
   * Düzenleme = yeni versiyon: mevcut ACTIVE sözleşme SUPERSEDED yapılır, yeni ACTIVE satır yazılır
   * (supersedesId = eski). Eski satırın alanları MUTATE EDİLMEZ (immutable audit). caseClientId devralınır.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - (PR-3) FE agreement editör → henüz YOK (dormant).
   * /// </remarks>
   */
  async update(
    tenantId: string,
    agreementId: string,
    input: UpdateCaseFeeAgreementInput,
    actor: { userId: string },
  ): Promise<CaseFeeAgreement> {
    if (!actor?.userId) throw new BadRequestException('update için actor (userId) gerekir');
    await this.assertCanManage(actor.userId, tenantId);
    const norm = this.validateFeeShape(input);

    const created = await this.prisma.$transaction(async (tx) => {
      const current = await tx.caseFeeAgreement.findFirst({
        where: { id: agreementId, tenantId },
        select: {
          id: true, caseClientId: true, status: true, feeType: true,
          flatAmount: true, percentageBps: true, feeBase: true, effectiveFrom: true, note: true,
        },
      });
      if (!current) throw new NotFoundException('Ücret sözleşmesi bulunamadı');
      if (current.status !== FeeAgreementStatus.ACTIVE) {
        throw new ConflictException(`Yalnız ACTIVE sözleşme güncellenebilir (durum: ${current.status})`);
      }
      // Yarış-güvenli fence: yalnız ACTIVE ise SUPERSEDED yap.
      const fenced = await tx.caseFeeAgreement.updateMany({
        where: { id: agreementId, tenantId, status: FeeAgreementStatus.ACTIVE },
        data: { status: FeeAgreementStatus.SUPERSEDED },
      });
      if (fenced.count === 0) {
        throw new ConflictException('Sözleşme eşzamanlı değişti (ACTIVE değil); güncelleme uygulanmadı');
      }
      const fresh = await tx.caseFeeAgreement.create({
        data: {
          tenantId,
          caseClientId: current.caseClientId, // değiştirilemez (mevcut sözleşmeden devralınır)
          feeType: input.feeType,
          flatAmount: norm.flatAmount,
          percentageBps: norm.percentageBps,
          feeBase: norm.feeBase,
          status: FeeAgreementStatus.ACTIVE,
          effectiveFrom: norm.effectiveFrom,
          note: input.note ?? null,
          supersedesId: agreementId,
          createdById: actor.userId,
        },
      });

      const caseId = await this.resolveCaseId(current.caseClientId);
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CASE_FEE_AGREEMENT_UPDATE',
        entityType: 'CASE_FEE_AGREEMENT',
        entityId: agreementId,
        userId: actor.userId,
        oldValues: {
          caseId,
          status: current.status,
          feeType: current.feeType,
          flatAmount: current.flatAmount,
          percentageBps: current.percentageBps,
          feeBase: current.feeBase,
          effectiveFrom: current.effectiveFrom,
          note: current.note,
        },
        newValues: {
          caseId,
          status: FeeAgreementStatus.SUPERSEDED,
          newAgreementId: fresh.id,
          feeType: fresh.feeType,
          flatAmount: fresh.flatAmount,
          percentageBps: fresh.percentageBps,
          feeBase: fresh.feeBase,
          effectiveFrom: fresh.effectiveFrom,
          note: fresh.note,
        },
      });

      return fresh;
    });

    this.logger.log(`CaseFeeAgreement updated (new version): ${created.id} supersedes ${agreementId}`);
    return created;
  }

  /**
   * Sözleşmeyi sonlandır: ACTIVE → TERMINATED. Yeni satır yazılmaz; geçmiş korunur.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - (PR-3) FE agreement editör → henüz YOK (dormant).
   * /// </remarks>
   */
  async terminate(
    tenantId: string,
    agreementId: string,
    actor: { userId: string },
  ): Promise<CaseFeeAgreement> {
    if (!actor?.userId) throw new BadRequestException('terminate için actor (userId) gerekir');
    await this.assertCanManage(actor.userId, tenantId);

    await this.prisma.$transaction(async (tx) => {
      // A1A: oldValues snapshot — tx üzerinden (transaction-tutarlı okuma). updateMany'nin
      // count-tabanlı ACTIVE/yok-ayrımına DOKUNMAZ (aynı where + aynı Conflict davranışı korunur;
      // bu yalnız audit zenginleştirmesi, bulunamazsa oldValues eksik kalır ama akış değişmez).
      const before = await tx.caseFeeAgreement.findFirst({
        where: { id: agreementId, tenantId },
        select: {
          id: true, caseClientId: true, status: true, feeType: true,
          flatAmount: true, percentageBps: true, feeBase: true, effectiveFrom: true, note: true,
        },
      });

      const upd = await tx.caseFeeAgreement.updateMany({
        where: { id: agreementId, tenantId, status: FeeAgreementStatus.ACTIVE },
        data: { status: FeeAgreementStatus.TERMINATED },
      });
      if (upd.count === 0) {
        throw new ConflictException('Sonlandırılacak ACTIVE sözleşme bulunamadı (durum ACTIVE değil veya kayıt yok)');
      }

      const caseId = before ? await this.resolveCaseId(before.caseClientId) : null;
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CASE_FEE_AGREEMENT_TERMINATE',
        entityType: 'CASE_FEE_AGREEMENT',
        entityId: agreementId,
        userId: actor.userId,
        oldValues: before
          ? {
              caseId,
              status: before.status,
              feeType: before.feeType,
              flatAmount: before.flatAmount,
              percentageBps: before.percentageBps,
              feeBase: before.feeBase,
              effectiveFrom: before.effectiveFrom,
              note: before.note,
            }
          : undefined,
        newValues: { caseId, status: FeeAgreementStatus.TERMINATED },
      });
    });

    this.logger.log(`CaseFeeAgreement terminated: ${agreementId}`);
    return this.getById(tenantId, agreementId);
  }

  /** Tek kayıt (tenant-scoped); yoksa 404. */
  async getById(tenantId: string, agreementId: string): Promise<CaseFeeAgreement> {
    const row = await this.prisma.caseFeeAgreement.findFirst({ where: { id: agreementId, tenantId } });
    if (!row) throw new NotFoundException('Ücret sözleşmesi bulunamadı');
    return row;
  }

  /** caseClient için ACTIVE sözleşme (recommendation kaynağı; PR-3 tüketir). Yoksa null. */
  async getActiveForCaseClient(tenantId: string, caseClientId: string): Promise<CaseFeeAgreement | null> {
    return this.prisma.caseFeeAgreement.findFirst({
      where: { tenantId, caseClientId, status: FeeAgreementStatus.ACTIVE },
    });
  }

  /** caseClient sözleşme geçmişi (yeni → eski). */
  async listForCaseClient(tenantId: string, caseClientId: string): Promise<CaseFeeAgreement[]> {
    return this.prisma.caseFeeAgreement.findMany({
      where: { tenantId, caseClientId },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  // ───────────────────────────── internals ─────────────────────────────

  /**
   * v1 ücret şekli doğrulaması (saf, IO yok → kolay test). feeBase=GROSS zorunlu (NET reddedilir).
   * FLAT → flatAmount faithful decimal-string (>0, ≤2dp); PERCENTAGE → percentageBps int (1..10000).
   * FLAT ve PERCENTAGE alanları XOR (çapraz dolu olamaz).
   */
  private validateFeeShape(
    input: CreateCaseFeeAgreementInput | UpdateCaseFeeAgreementInput,
  ): NormalizedFeeShape {
    const feeBase = input.feeBase ?? FeeAgreementBase.GROSS;
    if (feeBase !== FeeAgreementBase.GROSS) {
      throw new BadRequestException('FAZ-2 v1 yalnız GROSS taban destekler (NET_OF_EXPENSE FAZ-1b sonrası)');
    }

    let flatAmount: Prisma.Decimal | null = null;
    let percentageBps: number | null = null;

    if (input.feeType === FeeAgreementType.FLAT_AMOUNT) {
      if (input.percentageBps !== undefined && input.percentageBps !== null) {
        throw new BadRequestException('FLAT_AMOUNT sözleşmesinde percentageBps olamaz');
      }
      const raw: unknown = input.flatAmount;
      if (typeof raw !== 'string') {
        throw new BadRequestException('flatAmount faithful decimal-string olmalı (number kabul edilmez)');
      }
      let dec: Prisma.Decimal;
      try {
        dec = new Prisma.Decimal(raw);
      } catch {
        throw new BadRequestException('Geçersiz flatAmount');
      }
      if (!dec.isFinite()) throw new BadRequestException('Geçersiz flatAmount');
      if (dec.lte(0)) throw new BadRequestException('flatAmount pozitif olmalı');
      if (dec.decimalPlaces() > 2) {
        throw new BadRequestException('flatAmount en fazla 2 ondalık olabilir (Decimal 15,2)');
      }
      flatAmount = dec;
    } else if (input.feeType === FeeAgreementType.PERCENTAGE_OF_COLLECTION) {
      if (input.flatAmount !== undefined && input.flatAmount !== null) {
        throw new BadRequestException('PERCENTAGE_OF_COLLECTION sözleşmesinde flatAmount olamaz');
      }
      const bps: unknown = input.percentageBps;
      if (typeof bps !== 'number' || !Number.isInteger(bps)) {
        throw new BadRequestException('percentageBps tam sayı basis-points olmalı (float YOK)');
      }
      if (bps < PERCENTAGE_BPS_MIN || bps > PERCENTAGE_BPS_MAX) {
        throw new BadRequestException(`percentageBps ${PERCENTAGE_BPS_MIN}..${PERCENTAGE_BPS_MAX} aralığında olmalı`);
      }
      percentageBps = bps;
    } else {
      throw new BadRequestException('Geçersiz feeType');
    }

    let effectiveFrom: Date;
    if (input.effectiveFrom !== undefined) {
      effectiveFrom = new Date(input.effectiveFrom);
      if (Number.isNaN(effectiveFrom.getTime())) throw new BadRequestException('Geçersiz effectiveFrom');
    } else {
      effectiveFrom = new Date();
    }

    return { flatAmount, percentageBps, feeBase, effectiveFrom };
  }

  /** Mutasyon yetkisi: PARTNER / yetkilendirilmiş avukat (isApproverEligible). Değilse 403. */
  private async assertCanManage(userId: string, tenantId: string): Promise<void> {
    if (!(await this.officeApproval.isApproverEligible(userId, tenantId))) {
      throw new ForbiddenException(
        'Ücret sözleşmesi yönetimi için yetki yok (PARTNER veya yetkilendirilmiş avukat gerekir)',
      );
    }
  }

  /** caseClient bu tenant'a ait mi (defense-in-depth; CaseClient.client.tenantId üzerinden). */
  private async assertCaseClientInTenant(tenantId: string, caseClientId: string): Promise<void> {
    const cc = await this.prisma.caseClient.findFirst({
      where: { id: caseClientId, client: { tenantId } },
      select: { id: true },
    });
    if (!cc) throw new BadRequestException('caseClientId geçersiz/yabancı (tenant dışı veya yok)');
  }

  /**
   * A1A: caseClientId → caseId (audit metadata zenginleştirme; salt-okuma, lifecycle'a etkisi yok).
   * Kasıtlı olarak DIŞ `this.prisma` kullanır (tx değil) — CaseClient→Case ilişkisi sabittir,
   * transaction'ın atomiklik garantisine ihtiyaç duymaz.
   */
  private async resolveCaseId(caseClientId: string): Promise<string | null> {
    const cc = await this.prisma.caseClient.findFirst({ where: { id: caseClientId }, select: { caseId: true } });
    return cc?.caseId ?? null;
  }
}
