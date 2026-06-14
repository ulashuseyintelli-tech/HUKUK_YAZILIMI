import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class ClaimItemService {
  constructor(
    private prisma: PrismaService,
    @Optional() private claimEngineService?: ClaimEngineService,
  ) {}

  // ==================== CRUD İŞLEMLERİ ====================

  // Alacak kalemi oluştur
  async create(tenantId: string, dto: CreateClaimItemDto) {
    // Dosya kontrolü
    const caseExists = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });
    if (!caseExists) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    return (this.prisma as any).claimItem.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        itemType: dto.itemType,
        amount: dto.amount,
        currency: dto.currency || 'TRY',
        sourceDocumentId: dto.sourceDocumentId,
        sourceDocumentType: dto.sourceDocumentType,
        interestType: dto.interestType,
        interestRate: dto.interestRate,
        interestStartDate: dto.interestStartDate ? new Date(dto.interestStartDate) : null,
        interestEndDate: dto.interestEndDate ? new Date(dto.interestEndDate) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        description: dto.description,
        referenceNo: dto.referenceNo,
        isAllDebtorsLiable: dto.isAllDebtorsLiable ?? true,
        liableDebtorIds: dto.liableDebtorIds || [],
        sortOrder: dto.sortOrder || 0,
      },
    });
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
  async update(tenantId: string, id: string, dto: UpdateClaimItemDto) {
    await this.findOne(tenantId, id);

    const updateData: any = {};
    if (dto.itemType) updateData.itemType = dto.itemType;
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.currency) updateData.currency = dto.currency;
    if (dto.interestType) updateData.interestType = dto.interestType;
    if (dto.interestRate !== undefined) updateData.interestRate = dto.interestRate;
    if (dto.interestStartDate) updateData.interestStartDate = new Date(dto.interestStartDate);
    if (dto.interestEndDate) updateData.interestEndDate = new Date(dto.interestEndDate);
    if (dto.dueDate) updateData.dueDate = new Date(dto.dueDate);
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.referenceNo !== undefined) updateData.referenceNo = dto.referenceNo;
    if (dto.isAllDebtorsLiable !== undefined) updateData.isAllDebtorsLiable = dto.isAllDebtorsLiable;
    if (dto.liableDebtorIds) updateData.liableDebtorIds = dto.liableDebtorIds;
    if (dto.status) updateData.status = dto.status;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    return (this.prisma as any).claimItem.update({
      where: { id },
      data: updateData,
    });
  }

  // Alacak kalemi sil (soft delete - status değiştir)
  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return (this.prisma as any).claimItem.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  // Alacak kalemi kalıcı sil
  async hardDelete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return (this.prisma as any).claimItem.delete({ where: { id } });
  }


  // ==================== OTOMATİK ALACAK KALEMİ OLUŞTURMA ====================

  // Evraktan otomatik alacak kalemleri oluştur
  async autoGenerateFromDocument(tenantId: string, dto: AutoGenerateClaimItemsDto) {
    const items: any[] = [];

    // Belge türüne göre alacak kalemleri oluştur
    switch (dto.documentType) {
      case DocumentSourceType.FATURA:
        items.push(...this.generateFromFatura(tenantId, dto));
        break;
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
        items.push(...this.generateDefault(tenantId, dto));
    }

    // Toplu oluştur
    const createdItems = [];
    for (const item of items) {
      const created = await (this.prisma as any).claimItem.create({ data: item });
      createdItems.push(created);
    }

    return createdItems;
  }

  // Faturadan alacak kalemleri
  private generateFromFatura(tenantId: string, dto: AutoGenerateClaimItemsDto): any[] {
    const items: any[] = [];
    const baseAmount = dto.totalAmount || 0;
    const kdvAmount = dto.kdvAmount || 0;
    const netAmount = baseAmount - kdvAmount;

    // Ana para (KDV hariç)
    items.push({
      tenantId,
      caseId: dto.caseId,
      itemType: ClaimItemType.PRINCIPAL,
      amount: netAmount > 0 ? netAmount : baseAmount,
      currency: dto.currency || 'TRY',
      sourceDocumentId: dto.documentId,
      sourceDocumentType: DocumentSourceType.FATURA,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
      referenceNo: dto.referenceNo,
      description: 'Fatura alacağı',
      isCalculated: true,
      calculatedAt: new Date(),
      sortOrder: 1,
    });

    // KDV varsa ayrı kalem
    if (kdvAmount > 0) {
      items.push({
        tenantId,
        caseId: dto.caseId,
        itemType: ClaimItemType.TAX_KDV,
        amount: kdvAmount,
        currency: dto.currency || 'TRY',
        sourceDocumentId: dto.documentId,
        sourceDocumentType: DocumentSourceType.FATURA,
        referenceNo: dto.referenceNo,
        description: 'KDV',
        isCalculated: true,
        calculatedAt: new Date(),
        sortOrder: 2,
        // D (vergi): fatura KDV'si asıl alacağın parçası → mahsup tier'i ANAPARA.
        // metadata konvansiyonu (şemasız parent-link, ledger D-Q2/D-Q3).
        metadata: { taxParentCategory: 'PRINCIPAL' },
      });
    }

    return items;
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

  // Varsayılan alacak kalemi
  private generateDefault(tenantId: string, dto: AutoGenerateClaimItemsDto): any[] {
    return [{
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
      description: 'Alacak',
      isCalculated: true,
      calculatedAt: new Date(),
      sortOrder: 1,
    }];
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
        amount,
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
        amount,
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
        amount,
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

    const createdItems: any[] = [];

    for (const item of generatedItems) {
      // Sadece zorunlu veya tutarı olan kalemleri oluştur
      if (!item.required && !item.amount) continue;

      const createdItem = await (this.prisma as any).claimItem.create({
        data: {
          tenantId,
          caseId,
          itemType: this.mapItemType(item.type),
          amount: item.amount || 0,
          currency: item.currency || 'TRY',
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          description: item.label,
          isCalculated: item.isCalculated,
          calculatedAt: item.isCalculated ? new Date() : null,
          interestType: item.interestRule?.interestType,
          interestRate: item.interestRule?.annualRate,
          sortOrder: createdItems.length + 1,
        },
      });

      createdItems.push(createdItem);
    }

    return createdItems;
  }

  // Item type mapping
  private mapItemType(type: string): string {
    const mapping: Record<string, string> = {
      'PRINCIPAL': 'PRINCIPAL',
      'ACCRUED_INTEREST': 'PRE_INTEREST',
      'POST_INTEREST_RULE': 'POST_INTEREST',
      'PENALTY': 'PENALTY',
      'COMMISSION': 'EXPENSE',
      'FEE': 'FEE',
      'ATTORNEY_FEE': 'ATTORNEY_FEE',
      'OTHER': 'OTHER',
    };
    return mapping[type] || 'OTHER';
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
}
