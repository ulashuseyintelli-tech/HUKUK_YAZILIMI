import { Injectable, NotFoundException, BadRequestException, Optional, ForbiddenException, ConflictException } from '@nestjs/common';
import { OfficeApprovalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import {
  CreateClaimItemDto,
  UpdateClaimItemDto,
  AutoGenerateClaimItemsDto,
  CalculateInterestDto,
  ClaimItemType,
  DocumentSourceType,
  InterestType,
  ClaimSummary,
  InterestCalculationResult,
} from './dto/claim-item.dto';
import { ClaimEngineService } from '../claim-engine/claim-engine.service';
import { defaultInterestAccrualStatusForItemType, validateInterestAccrualState } from './interest-accrual-policy';
import {
  CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
  CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS,
  CLAIM_ITEM_INTENT_VERSION,
  CLAIM_ITEM_LOW_IMPACT_USER_FIELDS,
  CLAIM_ITEM_TARGET_TYPE,
  type ClaimItemHighImpactSavedIntent,
  type ClaimItemPatch,
} from './claim-item-approval.constants';
import {
  claimItemCreationAmounts,
  claimItemNormalUpdateAmounts,
} from './claim-item-amount-contract';
import {
  assertInvoiceClaimItemCreateAllowed,
  assertInvoiceClaimItemTypeTransitionAllowed,
} from './invoice-claim-item.policy';
import { interestWriteData, normalizeInterestWriteIntent } from './interest-write-admission';
import { type ClaimItemWriteGateResult } from './claim-item-write-gate.service';
import { ClaimItemWriterRouterService } from './claim-item-writer-router.service';
import { buildCanonicalWriteEnvelopeV1 } from '../../common/canonical-write-envelope';
import { DomainEventIngestService } from '../icrabot/domain-event-ingest';
import { CLAIM_ITEM_HUMAN_WRITE_POLICY_REF } from './claim-item-writer-routes';
import {
  appendClaimItemContinuity,
  assertClaimItemHardDeleteForbidden,
  assertClaimItemLifecycleMutation,
  type ClaimItemLifecycleRecord,
} from './claim-item-lifecycle-contract';
import { throwClaimItemFormationContextRequired } from './claim-item-formation-containment';

export interface ClaimItemMutationResult {
  applied: boolean;
  approvalRequired: boolean;
  approvalRequestId?: string;
  data?: unknown;
}

@Injectable()
export class ClaimItemService {
  constructor(
    private prisma: PrismaService,
    @Optional() private claimEngineService?: ClaimEngineService,
    @Optional() _audit?: AuditService,
    @Optional() private officeApproval?: OfficeApprovalService,
    @Optional() private claimItemWriterRouter?: ClaimItemWriterRouterService,
    @Optional() private domainEventIngest?: DomainEventIngestService,
  ) {}

  // ==================== CRUD İŞLEMLERİ ====================

  // Alacak kalemi oluştur
  async create(tenantId: string, dto: CreateClaimItemDto, actorUserId?: string) {
    assertInvoiceClaimItemCreateAllowed(dto);

    // Dosya kontrolü
    const caseExists = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });
    if (!caseExists) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    // TBK100 Interest Accrual Contract v1: caller hiç değer göndermediyse itemType-bazlı mekanik
    // varsayım (hukuki tahmin DEĞİL — bkz. interest-accrual-policy.ts); caller açıkça NO_INTEREST
    // yazdıysa audit zorunlu.
    const normalizedPatch = this.normalizeInterestPatch(
      this.stripUndefined({ ...dto }),
      null,
      actorUserId,
    );
    const interestAccrualStatus =
      (normalizedPatch.interestAccrualStatus as string | undefined) ?? defaultInterestAccrualStatusForItemType(dto.itemType);
    const noInterestExplicitlyRequested = dto.interestAccrualStatus === ('NO_INTEREST' as any);
    validateInterestAccrualState(
      {
        interestAccrualStatus,
        interestType: normalizedPatch.interestType as string | null | undefined,
        interestTypeCode: normalizedPatch.interestTypeCode as string | null | undefined,
        interestRate: normalizedPatch.interestRate as number | null | undefined,
        interestStartDate: dto.interestStartDate,
        interestStartDateProvenance: dto.interestStartDateProvenance,
        noInterestReason: normalizedPatch.noInterestReason as string | null | undefined,
        noInterestConfirmedById: normalizedPatch.noInterestConfirmedById as string | null | undefined,
      },
      noInterestExplicitlyRequested,
    );

    return (this.prisma as any).claimItem.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        itemType: dto.itemType,
        ...claimItemCreationAmounts(dto.amount),
        currency: dto.currency || 'TRY',
        sourceDocumentId: dto.sourceDocumentId,
        sourceDocumentType: dto.sourceDocumentType,
        interestType: normalizedPatch.interestType,
        interestTypeCode: normalizedPatch.interestTypeCode,
        interestRate: normalizedPatch.interestRate,
        interestStartDate: dto.interestStartDate ? new Date(dto.interestStartDate) : null,
        interestEndDate: dto.interestEndDate ? new Date(dto.interestEndDate) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        interestAccrualStatus,
        interestStartDateProvenance: dto.interestStartDateProvenance ?? null,
        noInterestReason: noInterestExplicitlyRequested ? normalizedPatch.noInterestReason : null,
        noInterestConfirmedById: noInterestExplicitlyRequested ? normalizedPatch.noInterestConfirmedById : null,
        noInterestConfirmedAt: noInterestExplicitlyRequested ? new Date() : null,
        description: dto.description,
        referenceNo: dto.referenceNo,
        isAllDebtorsLiable: dto.isAllDebtorsLiable ?? true,
        liableDebtorIds: dto.liableDebtorIds || [],
        sortOrder: dto.sortOrder || 0,
      },
    });
  }

  async createFromUser(tenantId: string, actorUserId: string, dto: CreateClaimItemDto): Promise<ClaimItemMutationResult> {
    assertInvoiceClaimItemCreateAllowed(dto);

    const caseExists = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
      select: { id: true },
    });
    if (!caseExists) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    const proposedPatch = this.buildCreatePatch(dto, actorUserId);
    const gateResult = await this.requireClaimItemWriterRouter().evaluateHuman({
      operation: 'CREATE',
      tenantId,
      caseId: dto.caseId,
      actorUserId,
      payload: proposedPatch,
      currency: dto.currency ?? 'TRY',
    });
    this.assertApprovalRequired(gateResult);
    throwClaimItemFormationContextRequired();
  }


  // Dosyanın alacak kalemlerini getir
  async findByCaseId(tenantId: string, caseId: string) {
    return (this.prisma as any).claimItem.findMany({
      where: { tenantId, caseId, status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // Tek alacak kalemi getir
  async findOne(tenantId: string, id: string) {
    const item = await (this.prisma as any).claimItem.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new NotFoundException('Alacak kalemi bulunamadı');
    }
    return item;
  }

  // Alacak kalemi güncelle
  async update(tenantId: string, id: string, dto: UpdateClaimItemDto, actorUserId?: string) {
    const existing = await this.findOne(tenantId, id);
    this.assertNoNewOtherAdmission(existing, dto.itemType);
    const normalizedPatch = this.normalizeInterestPatch(
      this.stripUndefined({ ...dto }),
      existing,
      actorUserId,
    );

    // PR-5b — tahsilat invariant'ları (PR-5c edit açılmadan ÖNCE backend guard).
    const collected = Number(existing.collectedAmount) || 0;
    // G-A: tahsil edilen tutarın ALTINA düşürmek yasak (eşitleme/artırma serbest).
    if (dto.amount !== undefined && Number(dto.amount) < collected) {
      throw new BadRequestException(`Tutar tahsil edilen tutardan (${collected}) düşük olamaz.`);
    }
    // G-B: tahsilat başlamışsa kalem tipi değişemez (TBK100 dağıtım kategorisi bozulmasın).
    if (collected > 0 && dto.itemType && dto.itemType !== existing.itemType) {
      throw new BadRequestException('Tahsilat yapılmış kalemde kalem tipi (itemType) değiştirilemez.');
    }

    const updateData: any = {};
    if (dto.itemType) updateData.itemType = dto.itemType;
    if (dto.amount !== undefined) Object.assign(updateData, claimItemNormalUpdateAmounts(dto.amount));
    if (dto.currency) updateData.currency = dto.currency;
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'interestType')) updateData.interestType = normalizedPatch.interestType;
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'interestTypeCode')) updateData.interestTypeCode = normalizedPatch.interestTypeCode;
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'interestRate')) updateData.interestRate = normalizedPatch.interestRate;
    if (dto.interestStartDate) updateData.interestStartDate = new Date(dto.interestStartDate);
    if (dto.interestEndDate) updateData.interestEndDate = new Date(dto.interestEndDate);
    if (dto.dueDate) updateData.dueDate = new Date(dto.dueDate);
    if (normalizedPatch.interestAccrualStatus) updateData.interestAccrualStatus = normalizedPatch.interestAccrualStatus;
    if (dto.interestStartDateProvenance) updateData.interestStartDateProvenance = dto.interestStartDateProvenance;
    if (normalizedPatch.interestAccrualStatus === 'NO_INTEREST') {
      updateData.noInterestReason = normalizedPatch.noInterestReason;
      updateData.noInterestConfirmedById = normalizedPatch.noInterestConfirmedById;
      updateData.noInterestConfirmedAt = new Date();
    } else if (normalizedPatch.interestAccrualStatus === 'UNKNOWN') {
      updateData.noInterestReason = null;
      updateData.noInterestConfirmedById = null;
      updateData.noInterestConfirmedAt = null;
    }
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.referenceNo !== undefined) updateData.referenceNo = dto.referenceNo;
    if (dto.isAllDebtorsLiable !== undefined) updateData.isAllDebtorsLiable = dto.isAllDebtorsLiable;
    if (dto.liableDebtorIds) updateData.liableDebtorIds = dto.liableDebtorIds;
    if (dto.status) updateData.status = dto.status;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    assertClaimItemLifecycleMutation(existing.status, updateData);

    return (this.prisma as any).claimItem.update({
      where: { id },
      data: updateData,
    });
  }

  async updateFromUser(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateClaimItemDto,
  ): Promise<ClaimItemMutationResult> {
    const patch = this.stripUndefined(dto as Record<string, unknown>);
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Güncellenecek alan yok.');
    }

    const highImpact = this.hasHighImpactField(patch);
    const unknownFields = Object.keys(patch).filter(
      (field) => !this.isLowImpactField(field) && !this.isHighImpactField(field),
    );
    if (unknownFields.length > 0) {
      throw new BadRequestException(`ClaimItem update için desteklenmeyen alan(lar): ${unknownFields.join(', ')}`);
    }

    if (!highImpact) {
      const data = await this.applyLowImpactMetadataUpdate(tenantId, actorUserId, id, patch);
      return { applied: true, approvalRequired: false, data };
    }

    const existing = await this.findOne(tenantId, id);
    assertInvoiceClaimItemTypeTransitionAllowed(existing, dto.itemType);
    this.assertUpdateInvariants(existing, dto);
    const currentSnapshot = this.snapshotClaimItem(existing);
    const proposedPatch = this.normalizePatchForIntent(
      this.normalizeInterestPatch(patch, existing, actorUserId),
    );
    const gateResult = await this.requireClaimItemWriterRouter().evaluateHuman({
      operation: 'UPDATE',
      tenantId,
      caseId: existing.caseId,
      actorUserId,
      claimItemId: id,
      payload: proposedPatch,
      currency: String(proposedPatch.currency ?? existing.currency),
    });
    this.assertApprovalRequired(gateResult);
    const request = await this.createHighImpactApprovalRequest({
      tenantId,
      actorUserId,
      targetType: CLAIM_ITEM_TARGET_TYPE,
      targetRef: id,
      intent: {
        version: CLAIM_ITEM_INTENT_VERSION,
        operation: 'UPDATE',
        caseId: existing.caseId,
        claimItemId: id,
        proposedPatch,
        currentSnapshot,
        currentSnapshotHash: stableJsonHash(currentSnapshot),
        reason: 'ClaimItem high-impact update requires K4 four-eyes approval.',
      },
      idempotencyKey: `claim-item-high-impact:${id}`,
    });
    return {
      applied: false,
      approvalRequired: true,
      approvalRequestId: request.id,
      data: request,
    };
  }

  // Alacak kalemi sil (soft delete - status değiştir)
  async remove(tenantId: string, id: string) {
    const existing = await this.findOne(tenantId, id);
    const lifecycle = assertClaimItemLifecycleMutation(existing.status, { status: 'CANCELLED' });
    if (lifecycle.noOp) return existing;
    return (this.prisma as any).claimItem.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async removeFromUser(tenantId: string, actorUserId: string, id: string): Promise<ClaimItemMutationResult> {
    const existing = await this.findOne(tenantId, id);
    const gateResult = await this.requireClaimItemWriterRouter().evaluateHuman({
      operation: 'CANCEL',
      tenantId,
      caseId: existing.caseId,
      actorUserId,
      claimItemId: id,
      payload: {},
      currency: existing.currency,
    });
    this.assertApprovalRequired(gateResult);
    const currentSnapshot = this.snapshotClaimItem(existing);
    const proposedPatch = { status: 'CANCELLED' };
    const request = await this.createHighImpactApprovalRequest({
      tenantId,
      actorUserId,
      targetType: CLAIM_ITEM_TARGET_TYPE,
      targetRef: id,
      intent: {
        version: CLAIM_ITEM_INTENT_VERSION,
        operation: 'DELETE',
        caseId: existing.caseId,
        claimItemId: id,
        proposedPatch,
        currentSnapshot,
        currentSnapshotHash: stableJsonHash(currentSnapshot),
        reason: 'ClaimItem delete/cancel requires K4 four-eyes approval.',
      },
      idempotencyKey: `claim-item-high-impact:${id}`,
    });
    return {
      applied: false,
      approvalRequired: true,
      approvalRequestId: request.id,
      data: request,
    };
  }

  // Alacak kalemi kalıcı sil
  async hardDelete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return assertClaimItemHardDeleteForbidden();
  }

  // ==================== OTOMATİK ALACAK KALEMİ OLUŞTURMA ====================

  // Evraktan otomatik alacak kalemleri oluştur
  async autoGenerateFromDocument(
    tenantId: string,
    actorUserId: string,
    dto: AutoGenerateClaimItemsDto,
  ) {
    if (dto.documentType === DocumentSourceType.FATURA) {
      throw new BadRequestException(
        'Fatura alacağı auto-generate ile oluşturulamaz; kanonik Due -> ClaimItem yolu kullanılmalıdır.',
      );
    }

    const items: any[] = [];

    // Belge türüne göre alacak kalemleri oluştur
    switch (dto.documentType) {
      case DocumentSourceType.CEK:
        items.push(...this.generateFromCek(tenantId, dto));
        break;
      case DocumentSourceType.SENET:
        items.push(...this.generateFromSenet(tenantId, dto));
        break;
      case DocumentSourceType.KIRA:
        items.push(...this.generateFromKira(tenantId, dto));
        break;
      case DocumentSourceType.ILAM:
      case DocumentSourceType.KARAR:
        items.push(...this.generateFromIlam(tenantId, dto));
        break;
      default:
        throw new BadRequestException({
          code: 'UNSUPPORTED_COMPONENT',
          message: 'Document component is not supported.',
        });
    }

    // Toplu oluştur
    const createdItems = [];
    for (const [sourceIndex, item] of items.entries()) {
      const data = {
        ...item,
        ...claimItemCreationAmounts(item.amount),
      };
      const created = await this.requireClaimItemWriterRouter().createSystemClaimItem<any>({
        route: 'DOCUMENT_AUTO_GENERATOR',
        tenantId,
        caseId: dto.caseId,
        sourceId: dto.documentId,
        sourceSlot: `${dto.documentType}:${sourceIndex}:${item.itemType}`,
        initiatedByUserId: actorUserId,
        data,
        currency: item.currency,
      });
      createdItems.push(created);
    }

    return createdItems;
  }

  // Çekten alacak kalemleri
  private generateFromCek(tenantId: string, dto: AutoGenerateClaimItemsDto): any[] {
    const items: any[] = [];
    const amount = dto.totalAmount || 0;

    // Ana para (çek bedeli)
    items.push({
      tenantId,
      caseId: dto.caseId,
      itemType: ClaimItemType.PRINCIPAL,
      amount,
      currency: dto.currency || 'TRY',
      sourceDocumentId: dto.documentId,
      sourceDocumentType: DocumentSourceType.CEK,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
      referenceNo: dto.referenceNo,
      description: 'Çek bedeli',
      isCalculated: true,
      calculatedAt: new Date(),
      sortOrder: 1,
    });

    // Karşılıksız çek tazminatı (%10 veya %20)
    const penaltyRate = dto.checkPenaltyRate || 10;
    const penaltyAmount = (amount * penaltyRate) / 100;
    items.push({
      tenantId,
      caseId: dto.caseId,
      itemType: ClaimItemType.CHECK_PENALTY,
      amount: penaltyAmount,
      currency: dto.currency || 'TRY',
      sourceDocumentId: dto.documentId,
      sourceDocumentType: DocumentSourceType.CEK,
      referenceNo: dto.referenceNo,
      description: `Karşılıksız çek tazminatı (%${penaltyRate})`,
      isCalculated: true,
      calculatedAt: new Date(),
      sortOrder: 2,
    });

    return items;
  }

  // Senetten alacak kalemleri
  private generateFromSenet(tenantId: string, dto: AutoGenerateClaimItemsDto): any[] {
    const items: any[] = [];

    items.push({
      tenantId,
      caseId: dto.caseId,
      itemType: ClaimItemType.PRINCIPAL,
      amount: dto.totalAmount || 0,
      currency: dto.currency || 'TRY',
      sourceDocumentId: dto.documentId,
      sourceDocumentType: DocumentSourceType.SENET,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
      referenceNo: dto.referenceNo,
      description: 'Senet/Bono bedeli',
      isCalculated: true,
      calculatedAt: new Date(),
      sortOrder: 1,
    });

    return items;
  }

  // Kira sözleşmesinden alacak kalemleri
  private generateFromKira(tenantId: string, dto: AutoGenerateClaimItemsDto): any[] {
    const items: any[] = [];

    items.push({
      tenantId,
      caseId: dto.caseId,
      itemType: ClaimItemType.PRINCIPAL,
      amount: dto.totalAmount || 0,
      currency: dto.currency || 'TRY',
      sourceDocumentId: dto.documentId,
      sourceDocumentType: DocumentSourceType.KIRA,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      referenceNo: dto.referenceNo,
      description: 'Kira alacağı',
      isCalculated: true,
      calculatedAt: new Date(),
      sortOrder: 1,
    });

    return items;
  }


  // İlamdan alacak kalemleri
  private generateFromIlam(tenantId: string, dto: AutoGenerateClaimItemsDto): any[] {
    const items: any[] = [];

    items.push({
      tenantId,
      caseId: dto.caseId,
      itemType: ClaimItemType.PRINCIPAL,
      amount: dto.totalAmount || 0,
      currency: dto.currency || 'TRY',
      sourceDocumentId: dto.documentId,
      sourceDocumentType: dto.documentType,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
      referenceNo: dto.referenceNo,
      description: 'İlam alacağı',
      isCalculated: true,
      calculatedAt: new Date(),
      sortOrder: 1,
    });

    return items;
  }

  // ==================== FAİZ HESAPLAMA ====================
  // ⚠️ HESAP YASAĞI: Bu modül faiz hesabı YAPMAZ
  // Tüm faiz hesaplamaları interest-engine üzerinden yapılmalı
  // @see ARCHITECTURE.md - Source of Truth Matrix

  /**
   * @deprecated KALDIRILDI - interest-engine kullanın
   * 
   * Bu metod artık hesap YAPMAZ, sadece hata fırlatır.
   * Doğru kullanım:
   * ```typescript
   * import { InterestEngineService } from '@/modules/interest-engine';
   * const result = await interestEngine.calculate({
   *   caseId,
   *   asOfDate: new Date().toISOString(),
   * });
   * ```
   * 
   * @throws Error - Her zaman hata fırlatır
   * @see ARCHITECTURE.md - Source of Truth Matrix
   */
  async calculateInterest(_dto: CalculateInterestDto): Promise<InterestCalculationResult> {
    throw new Error(
      '🚫 claim-item.calculateInterest() KALDIRILDI. ' +
      'Faiz hesabı için interest-engine kullanın: interestEngine.calculate(request). ' +
      '@see ARCHITECTURE.md'
    );
  }

  /**
   * @deprecated KALDIRILDI - interest-engine/RateProviderService kullanın
   * @throws Error - Her zaman hata fırlatır
   */
  private async getInterestRate(_type: InterestType, _currency: string, _date: Date): Promise<number> {
    throw new Error(
      '🚫 claim-item.getInterestRate() KALDIRILDI. ' +
      'Faiz oranı için RateProviderService kullanın. ' +
      '@see ARCHITECTURE.md'
    );
  }


  // ==================== ALACAK ÖZETİ ====================

  // Dosyanın alacak özetini hesapla
  async getClaimSummary(tenantId: string, caseId: string, calculationDate?: string): Promise<ClaimSummary> {
    const calcDate = calculationDate ? new Date(calculationDate) : new Date();

    // Aktif alacak kalemlerini getir
    const items = await (this.prisma as any).claimItem.findMany({
      where: { tenantId, caseId, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    });

    // Türlere göre grupla
    const typeLabels: Record<string, string> = {
      PRINCIPAL: 'Asıl Alacak',
      INTEREST: 'Faiz',
      PRE_INTEREST: 'Takip Öncesi Faiz',
      POST_INTEREST: 'Takip Sonrası Faiz',
      EXPENSE: 'Masraf',
      FEE: 'Harç',
      ATTORNEY_FEE: 'Vekalet Ücreti',
      PENALTY: 'Tazminat',
      CHECK_PENALTY: 'Çek Tazminatı',
      CONTRACTUAL_PENALTY: 'Cezai Şart',
      TAX_KDV: 'KDV',
      TAX_BSMV: 'BSMV',
      TAX_KKDF: 'KKDF',
      OTHER: 'Diğer',
    };

    const groupedItems: Record<string, { amount: number; count: number }> = {};
    let currency = 'TRY';

    for (const item of items) {
      const type = item.itemType;
      if (!groupedItems[type]) {
        groupedItems[type] = { amount: 0, count: 0 };
      }
      groupedItems[type].amount += Number(item.amount || 0);
      groupedItems[type].count += 1;
      currency = item.currency || currency;
    }

    // Toplamları hesapla
    const totals = {
      principal: 0,
      preInterest: 0,
      postInterest: 0,
      totalInterest: 0,
      expense: 0,
      fee: 0,
      attorneyFee: 0,
      penalty: 0,
      tax: 0,
      other: 0,
      grandTotal: 0,
    };

    for (const item of items) {
      const amount = Number(item.amount || 0);
      switch (item.itemType) {
        case 'PRINCIPAL':
          totals.principal += amount;
          break;
        case 'INTEREST':
        case 'PRE_INTEREST':
          totals.preInterest += amount;
          totals.totalInterest += amount;
          break;
        case 'POST_INTEREST':
          totals.postInterest += amount;
          totals.totalInterest += amount;
          break;
        case 'EXPENSE':
          totals.expense += amount;
          break;
        case 'FEE':
          totals.fee += amount;
          break;
        case 'ATTORNEY_FEE':
          totals.attorneyFee += amount;
          break;
        case 'PENALTY':
        case 'CHECK_PENALTY':
        case 'CONTRACTUAL_PENALTY':
          totals.penalty += amount;
          break;
        case 'TAX_KDV':
        case 'TAX_BSMV':
        case 'TAX_KKDF':
          totals.tax += amount;
          break;
        default:
          totals.other += amount;
      }
      totals.grandTotal += amount;
    }

    return {
      caseId,
      currency,
      items: Object.entries(groupedItems).map(([type, data]) => ({
        type: type as ClaimItemType,
        label: typeLabels[type] || type,
        amount: Math.round(data.amount * 100) / 100,
        count: data.count,
      })),
      totals: {
        principal: Math.round(totals.principal * 100) / 100,
        preInterest: Math.round(totals.preInterest * 100) / 100,
        postInterest: Math.round(totals.postInterest * 100) / 100,
        totalInterest: Math.round(totals.totalInterest * 100) / 100,
        expense: Math.round(totals.expense * 100) / 100,
        fee: Math.round(totals.fee * 100) / 100,
        attorneyFee: Math.round(totals.attorneyFee * 100) / 100,
        penalty: Math.round(totals.penalty * 100) / 100,
        tax: Math.round(totals.tax * 100) / 100,
        other: Math.round(totals.other * 100) / 100,
        grandTotal: Math.round(totals.grandTotal * 100) / 100,
      },
      calculationDate: calcDate.toISOString(),
    };
  }


  // ==================== TOPLU İŞLEMLER ====================

  // Dosyaya faiz kalemi ekle (otomatik hesaplamalı)
  /**
   * @deprecated Faiz kalemi ekleme interest-engine üzerinden yapılmalı
   * 
   * Bu metod artık hesap YAPMAZ. Faiz kalemi eklemek için:
   * 1. interest-engine.calculate() ile faiz hesaplayın
   * 2. Sonucu claim-item olarak kaydedin
   * 
   * @throws Error - Her zaman hata fırlatır
   */
  async addInterestItem(
    _tenantId: string,
    _caseId: string,
    _interestType: InterestType,
    _isPreInterest: boolean = true,
  ) {
    throw new Error(
      '🚫 claim-item.addInterestItem() KALDIRILDI. ' +
      'Faiz kalemi eklemek için interest-engine.calculate() kullanın, ' +
      'sonucu claim-item olarak kaydedin. @see ARCHITECTURE.md'
    );
  }

  // Masraf kalemi ekle
  async addExpenseItem(
    tenantId: string,
    caseId: string,
    amount: number,
    description: string,
    currency: string = 'TRY',
  ) {
    return (this.prisma as any).claimItem.create({
      data: {
        tenantId,
        caseId,
        itemType: 'EXPENSE',
        ...claimItemCreationAmounts(amount),
        currency,
        description,
        sortOrder: 30,
      },
    });
  }

  // Harç kalemi ekle
  async addFeeItem(
    tenantId: string,
    caseId: string,
    amount: number,
    description: string,
    currency: string = 'TRY',
  ) {
    return (this.prisma as any).claimItem.create({
      data: {
        tenantId,
        caseId,
        itemType: 'FEE',
        ...claimItemCreationAmounts(amount),
        currency,
        description,
        sortOrder: 40,
      },
    });
  }

  // Vekalet ücreti kalemi ekle
  async addAttorneyFeeItem(
    tenantId: string,
    caseId: string,
    amount: number,
    description: string = 'Vekalet ücreti',
    currency: string = 'TRY',
  ) {
    return (this.prisma as any).claimItem.create({
      data: {
        tenantId,
        caseId,
        itemType: 'ATTORNEY_FEE',
        ...claimItemCreationAmounts(amount),
        currency,
        description,
        sortOrder: 50,
      },
    });
  }

  // Tüm faizleri yeniden hesapla
  /**
   * @deprecated Faiz yeniden hesaplama interest-engine üzerinden yapılmalı
   * @throws Error - Her zaman hata fırlatır
   */
  async recalculateAllInterest(_tenantId: string, _caseId: string) {
    throw new Error(
      '🚫 claim-item.recalculateAllInterest() KALDIRILDI. ' +
      'Faiz yeniden hesaplama için interest-engine.calculate() kullanın. ' +
      '@see ARCHITECTURE.md'
    );
  }

  // ==================== CLAIM ENGINE ENTEGRASYONU ====================

  // Kural motorundan alacak kalemleri oluştur
  async generateFromRuleEngine(
    tenantId: string,
    actorUserId: string,
    caseId: string,
    subCategory: string,
    extractedData: Record<string, any>,
    wizardData: Record<string, any> = {},
  ) {
    if (!this.claimEngineService) {
      throw new BadRequestException('Claim Engine servisi mevcut değil');
    }

    // Dosya kontrolü
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    // Kural motorundan şablonları al
    const generatedItems = this.claimEngineService.generateClaimItems(
      subCategory,
      extractedData,
      wizardData,
    );

    const preflightedItems = generatedItems.map((item, sourceIndex) => ({
      item,
      sourceIndex,
      itemType: this.mapItemType(item.type),
    }));
    const createdItems: any[] = [];

    for (const { item, sourceIndex, itemType } of preflightedItems) {
      // Sadece zorunlu veya tutarı olan kalemleri oluştur
      if (!item.required && !item.amount) continue;

      const amount = item.amount ?? 0;

      const data = {
        tenantId,
        caseId,
        itemType,
        ...claimItemCreationAmounts(amount),
        currency: item.currency || 'TRY',
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        description: item.label,
        isCalculated: item.isCalculated,
        calculatedAt: item.isCalculated ? new Date() : null,
        interestType: item.interestRule?.interestType,
        interestRate: item.interestRule?.annualRate,
        sortOrder: createdItems.length + 1,
      };
      const createdItem = await this.requireClaimItemWriterRouter().createSystemClaimItem<any>({
        route: 'RULE_ENGINE_GENERATOR',
        tenantId,
        caseId,
        sourceId: caseId,
        sourceSlot: `${subCategory}:${sourceIndex}:${item.type}`,
        initiatedByUserId: actorUserId,
        data,
        currency: data.currency,
      });

      createdItems.push(createdItem);
    }

    return createdItems;
  }

  // Item type mapping
  private mapItemType(type: unknown): string {
    const mapping: Record<string, string> = {
      'PRINCIPAL': 'PRINCIPAL',
      'ACCRUED_INTEREST': 'PRE_INTEREST',
      'PENALTY': 'PENALTY',
      'COMMISSION': 'EXPENSE',
      'FEE': 'FEE',
      'ATTORNEY_FEE': 'ATTORNEY_FEE',
    };
    if (typeof type !== 'string' || type.trim().length === 0 || !mapping[type]) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_COMPONENT',
        message: 'Rule Engine component is not supported.',
      });
    }
    return mapping[type];
  }

  // Dosyayı doğrula (kural motoru ile)
  async validateWithRuleEngine(
    tenantId: string,
    caseId: string,
    caseType: string,
    subCategory: string,
    extractedData: Record<string, any> = {},
    wizardData: Record<string, any> = {},
  ) {
    if (!this.claimEngineService) {
      return { isValid: true, errors: [], warnings: [] };
    }

    // Mevcut alacak kalemlerini al
    const items = await (this.prisma as any).claimItem.findMany({
      where: { tenantId, caseId, status: 'ACTIVE' },
    });

    const claimItems = items.map((item: any) => ({ type: item.itemType }));

    return this.claimEngineService.validateCase(
      caseType,
      subCategory,
      claimItems,
      extractedData,
      wizardData,
    );
  }

  // Faiz oranını kural motorundan al
  /**
   * @deprecated Faiz oranı için interest-engine/RateProviderService kullanın
   * @throws Error - Her zaman hata fırlatır
   */
  async getInterestRateFromEngine(
    _currency: string,
    _interestType: string,
    _date?: Date,
  ): Promise<number | null> {
    throw new Error(
      '🚫 claim-item.getInterestRateFromEngine() KALDIRILDI. ' +
      'Faiz oranı için RateProviderService kullanın. ' +
      '@see ARCHITECTURE.md'
    );
  }

  // Çek tazminatı hesapla (kural motoru ile)
  async calculateCheckPenalty(principalAmount: number, customRate?: number): Promise<number> {
    if (!this.claimEngineService) {
      // Varsayılan hesaplama
      const rate = customRate || 0.10;
      return principalAmount * rate;
    }

    return this.claimEngineService.calculatePenalty(
      'bad_check_compensation',
      principalAmount,
      customRate,
    );
  }

  private async applyLowImpactMetadataUpdate(
    tenantId: string,
    actorUserId: string,
    id: string,
    patch: ClaimItemPatch,
  ) {
    const data = this.pickLowImpactUpdateData(patch);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Metadata güncellemesi için desteklenen alan yok.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.claimItem.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        throw new NotFoundException('Alacak kalemi bulunamadı');
      }

      assertClaimItemLifecycleMutation(existing.status, data);

      const gateResult = await this.requireClaimItemWriterRouter().evaluateHuman(
        {
          operation: 'UPDATE',
          tenantId,
          caseId: existing.caseId,
          actorUserId,
          claimItemId: id,
          payload: patch,
          currency: existing.currency,
        },
        tx,
      );
      this.assertDirectAllowed(gateResult);

      const updated = await tx.claimItem.update({
        where: { id },
        data,
      });

      const occurredAt = new Date().toISOString();
      const envelope = buildCanonicalWriteEnvelopeV1({
        tenantId,
        caseId: existing.caseId,
        target: { aggregateType: 'ClaimItem' as const, aggregateId: id },
        actor: { type: 'HUMAN', userId: actorUserId },
        correlationId: `claim-item-direct:${id}`,
        idempotencyKey: `claim-item-direct-update:${id}:${stableJsonHash({ data, occurredAt })}`,
        occurredAt,
        effectiveAt: occurredAt,
        source: {
          sourceType: 'USER_COMMAND',
          sourceId: id,
          evidenceRefs: [`user:${actorUserId}`, `claim-item:${id}`],
        },
        authority: { policyRef: CLAIM_ITEM_HUMAN_WRITE_POLICY_REF },
        currency: existing.currency,
      });
      await appendClaimItemContinuity({
        tx,
        domainEventIngest: this.domainEventIngest,
        envelope,
        operation: 'UPDATE',
        before: existing as ClaimItemLifecycleRecord,
        after: updated as ClaimItemLifecycleRecord,
        auditAction: 'CLAIM_ITEM_METADATA_UPDATED',
        auditUserId: actorUserId,
        auditSource: 'USER_DIRECT_METADATA_EDIT',
        approvalRequired: false,
      });

      return updated;
    });
  }

  private requireClaimItemWriterRouter(): ClaimItemWriterRouterService {
    if (!this.claimItemWriterRouter) {
      throw new ConflictException('ClaimItem writer routing dependency is not available.');
    }
    return this.claimItemWriterRouter;
  }

  private assertApprovalRequired(result: ClaimItemWriteGateResult): void {
    if (result.outcome === 'DENIED') {
      throw new ForbiddenException(`ClaimItem write denied: ${result.reasonCode}`);
    }
    if (result.outcome !== 'OFFICE_APPROVAL_REQUIRED') {
      throw new ConflictException('ClaimItem high-impact command did not require OfficeApproval.');
    }
  }

  private assertDirectAllowed(result: ClaimItemWriteGateResult): void {
    if (result.outcome === 'DENIED') {
      throw new ForbiddenException(`ClaimItem write denied: ${result.reasonCode}`);
    }
    if (result.outcome !== 'DIRECT_ALLOWED' || result.actorType !== 'HUMAN') {
      throw new ConflictException('ClaimItem low-impact command was not directly authorized.');
    }
  }

  private async createHighImpactApprovalRequest(input: {
    tenantId: string;
    actorUserId: string;
    targetType: string;
    targetRef: string;
    intent: ClaimItemHighImpactSavedIntent;
    idempotencyKey: string;
  }) {
    if (!this.officeApproval) {
      throw new ConflictException('ClaimItem approval dependency is not available.');
    }

    const existing = await this.prisma.officeApprovalRequest.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing?.status === OfficeApprovalStatus.PENDING_APPROVAL && existing.payloadHash !== stableJsonHash(input.intent)) {
      throw new ConflictException('Bu ClaimItem için farklı içerikli bekleyen bir onay talebi zaten var.');
    }

    return this.officeApproval.createPendingRequest({
      tenantId: input.tenantId,
      actionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
      targetType: input.targetType,
      targetRef: input.targetRef,
      requesterUserId: input.actorUserId,
      savedIntent: input.intent,
      idempotencyKey: input.idempotencyKey,
      reason: input.intent.reason,
    });
  }

  private buildCreatePatch(dto: CreateClaimItemDto, actorUserId: string): ClaimItemPatch {
    return this.normalizePatchForIntent(
      this.normalizeInterestPatch(this.stripUndefined({ ...dto }), null, actorUserId),
    );
  }

  private normalizeInterestPatch(
    patch: ClaimItemPatch,
    current: Record<string, any> | null,
    actorUserId?: string,
  ): ClaimItemPatch {
    const interestFields = [
      'interestTypeCode',
      'interestType',
      'interestRate',
      'interestAccrualStatus',
      'noInterestReason',
      'interestStartDate',
      'interestEndDate',
      'interestStartDateProvenance',
    ];
    if (!interestFields.some((field) => Object.prototype.hasOwnProperty.call(patch, field))) {
      return patch;
    }

    const richExplicit = Object.prototype.hasOwnProperty.call(patch, 'interestTypeCode');
    const legacyExplicit = Object.prototype.hasOwnProperty.call(patch, 'interestType');
    const explicitNoInterest = patch.interestAccrualStatus === 'NO_INTEREST';
    if (explicitNoInterest && !actorUserId) {
      throw new BadRequestException('NO_INTEREST aktörü authenticated server context üzerinden zorunludur.');
    }

    const normalized = normalizeInterestWriteIntent({
      interestTypeCode: richExplicit ? patch.interestTypeCode as any : current?.interestTypeCode,
      legacyInterestType: legacyExplicit
        ? patch.interestType as string | null
        : richExplicit
          ? undefined
          : current?.interestType,
      interestRate: explicitNoInterest && !Object.prototype.hasOwnProperty.call(patch, 'interestRate')
        ? null
        : Object.prototype.hasOwnProperty.call(patch, 'interestRate')
          ? patch.interestRate
        : current?.interestRate == null
          ? current?.interestRate
          : Number(current.interestRate),
      explicitNoInterest,
      noInterestReason: patch.noInterestReason as string | null | undefined,
    });

    let result: ClaimItemPatch;
    if (normalized.mode === 'OMITTED') {
      if (patch.interestAccrualStatus === 'UNKNOWN') {
        result = {
          ...patch,
          interestTypeCode: null,
          interestType: null,
          interestRate: null,
          noInterestReason: null,
          noInterestConfirmedById: null,
          noInterestConfirmedAt: null,
        };
      } else {
        result = patch;
      }
    } else if (normalized.mode === 'NO_INTEREST') {
      result = {
        ...patch,
        ...interestWriteData(normalized),
        noInterestReason: normalized.noInterestReason,
        noInterestConfirmedById: actorUserId,
      };
    } else {
      result = {
        ...patch,
        ...interestWriteData(normalized),
        ...(patch.interestAccrualStatus === undefined ? {} : { interestAccrualStatus: patch.interestAccrualStatus }),
        noInterestReason: null,
        noInterestConfirmedById: null,
        noInterestConfirmedAt: null,
      };
    }

    const effective = (field: string) => Object.prototype.hasOwnProperty.call(result, field)
      ? result[field]
      : current?.[field];
    validateInterestAccrualState(
      {
        interestAccrualStatus: String(effective('interestAccrualStatus') ?? 'UNKNOWN'),
        interestType: effective('interestType') as string | null | undefined,
        interestTypeCode: effective('interestTypeCode') as string | null | undefined,
        interestRate: effective('interestRate') == null ? effective('interestRate') as null | undefined : Number(effective('interestRate')),
        interestStartDate: effective('interestStartDate') as string | null | undefined,
        interestStartDateProvenance: effective('interestStartDateProvenance') as string | null | undefined,
        noInterestReason: effective('noInterestReason') as string | null | undefined,
        noInterestConfirmedById: effective('noInterestConfirmedById') as string | null | undefined,
      },
      explicitNoInterest,
    );
    return result;
  }

  private pickLowImpactUpdateData(patch: ClaimItemPatch): Record<string, unknown> {
    const updateData: Record<string, unknown> = {};
    if (patch.description !== undefined) updateData.description = patch.description;
    if (patch.referenceNo !== undefined) updateData.referenceNo = patch.referenceNo;
    if (patch.sortOrder !== undefined) updateData.sortOrder = patch.sortOrder;
    return updateData;
  }

  private assertUpdateInvariants(existing: any, dto: Partial<UpdateClaimItemDto>): void {
    this.assertNoNewOtherAdmission(existing, dto.itemType);
    const collected = Number(existing.collectedAmount) || 0;
    if (dto.amount !== undefined && Number(dto.amount) < collected) {
      throw new BadRequestException(`Tutar tahsil edilen tutardan (${collected}) düşük olamaz.`);
    }
    if (collected > 0 && dto.itemType && dto.itemType !== existing.itemType) {
      throw new BadRequestException('Tahsilat yapılmış kalemde kalem tipi (itemType) değiştirilemez.');
    }
  }

  private assertNoNewOtherAdmission(existing: any, requestedItemType: unknown): void {
    if (requestedItemType === undefined) return;
    if (
      requestedItemType === null ||
      (typeof requestedItemType === 'string' && requestedItemType.trim() === '') ||
      !Object.values(ClaimItemType).includes(requestedItemType as ClaimItemType) ||
      requestedItemType === ClaimItemType.OTHER ||
      existing.itemType === ClaimItemType.OTHER
    ) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_COMPONENT',
        message: 'Claim component is not supported.',
      });
    }
  }

  private hasHighImpactField(patch: ClaimItemPatch): boolean {
    return Object.keys(patch).some((field) => this.isHighImpactField(field));
  }

  private isLowImpactField(field: string): boolean {
    return (CLAIM_ITEM_LOW_IMPACT_USER_FIELDS as readonly string[]).includes(field);
  }

  private isHighImpactField(field: string): boolean {
    return (CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS as readonly string[]).includes(field);
  }

  private stripUndefined(input: Record<string, unknown>): ClaimItemPatch {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  }

  private normalizePatchForIntent(input: ClaimItemPatch): ClaimItemPatch {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
    );
  }

  private snapshotClaimItem(item: any): Record<string, unknown> {
    return {
      id: item.id,
      tenantId: item.tenantId,
      caseId: item.caseId,
      itemType: item.itemType,
      amount: this.toSnapshotScalar(item.amount),
      originalAmount: this.toSnapshotScalar(item.originalAmount),
      demandedAmount: this.toSnapshotScalar(item.demandedAmount),
      collectedAmount: this.toSnapshotScalar(item.collectedAmount),
      currency: item.currency,
      interestType: item.interestType ?? null,
      interestTypeCode: item.interestTypeCode ?? null,
      interestRate: this.toSnapshotScalar(item.interestRate),
      interestStartDate: this.toSnapshotDate(item.interestStartDate),
      interestEndDate: this.toSnapshotDate(item.interestEndDate),
      dueDate: this.toSnapshotDate(item.dueDate),
      interestAccrualStatus: item.interestAccrualStatus ?? null,
      interestStartDateProvenance: item.interestStartDateProvenance ?? null,
      noInterestReason: item.noInterestReason ?? null,
      noInterestConfirmedById: item.noInterestConfirmedById ?? null,
      noInterestConfirmedAt: this.toSnapshotDate(item.noInterestConfirmedAt),
      isAllDebtorsLiable: item.isAllDebtorsLiable,
      liableDebtorIds: Array.isArray(item.liableDebtorIds) ? [...item.liableDebtorIds] : [],
      status: item.status,
      description: item.description ?? null,
      referenceNo: item.referenceNo ?? null,
      sortOrder: item.sortOrder ?? 0,
      updatedAt: this.toSnapshotDate(item.updatedAt),
    };
  }

  private toSnapshotScalar(value: unknown): string | number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    return String(value);
  }

  private toSnapshotDate(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

}
