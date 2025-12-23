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

  // Faiz hesapla
  async calculateInterest(dto: CalculateInterestDto): Promise<InterestCalculationResult> {
    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();
    
    // Gün sayısı
    const days = Math.max(0, Math.floor(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ));

    // Faiz oranını belirle
    let rate = dto.customRate;
    if (!rate) {
      rate = await this.getInterestRate(dto.interestType, dto.currency || 'TRY', startDate);
    }

    // Faiz hesapla (basit faiz formülü)
    const calculatedInterest = (dto.principalAmount * rate * days) / (365 * 100);

    return {
      principalAmount: dto.principalAmount,
      interestType: dto.interestType,
      rate,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days,
      calculatedInterest: Math.round(calculatedInterest * 100) / 100,
      currency: dto.currency || 'TRY',
    };
  }

  // Faiz oranını getir (veritabanından veya varsayılan)
  private async getInterestRate(type: InterestType, currency: string, date: Date): Promise<number> {
    // Önce veritabanından dene
    const dbRate = await (this.prisma as any).interestRate?.findFirst({
      where: {
        interestType: type,
        currency,
        startDate: { lte: date },
        OR: [
          { endDate: null },
          { endDate: { gte: date } },
        ],
      },
      orderBy: { startDate: 'desc' },
    });

    if (dbRate) {
      return Number(dbRate.rate);
    }

    // Varsayılan oranlar (2024 güncel)
    const defaultRates: Record<string, Record<string, number>> = {
      TRY: {
        YASAL: 24,    // Yasal faiz
        TICARI: 48,   // Ticari faiz (avans)
        AVANS: 48,    // Avans faizi
        OZEL: 24,     // Özel (varsayılan yasal)
      },
      USD: {
        YASAL: 9,
        TICARI: 12,
        AVANS: 12,
        OZEL: 9,
      },
      EUR: {
        YASAL: 9,
        TICARI: 12,
        AVANS: 12,
        OZEL: 9,
      },
    };

    return defaultRates[currency]?.[type] || defaultRates['TRY'][type] || 24;
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
  async addInterestItem(
    tenantId: string,
    caseId: string,
    interestType: InterestType,
    isPreInterest: boolean = true,
  ) {
    // Dosyanın ana para toplamını al
    const items = await (this.prisma as any).claimItem.findMany({
      where: { tenantId, caseId, itemType: 'PRINCIPAL', status: 'ACTIVE' },
    });

    const principalAmount = items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    if (principalAmount <= 0) {
      throw new BadRequestException('Ana para bulunamadı');
    }

    // Dosya bilgilerini al
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });

    // Faiz başlangıç tarihi
    const startDate = caseData?.interestStartDate || caseData?.caseDate || new Date();
    const currency = caseData?.currency || 'TRY';

    // Faiz hesapla
    const interestResult = await this.calculateInterest({
      principalAmount,
      interestType,
      startDate: startDate.toISOString(),
      currency,
    });

    // Faiz kalemi oluştur
    return (this.prisma as any).claimItem.create({
      data: {
        tenantId,
        caseId,
        itemType: isPreInterest ? 'PRE_INTEREST' : 'POST_INTEREST',
        amount: interestResult.calculatedInterest,
        currency,
        interestType,
        interestRate: interestResult.rate,
        interestStartDate: new Date(interestResult.startDate),
        interestEndDate: new Date(interestResult.endDate),
        description: `${isPreInterest ? 'Takip öncesi' : 'Takip sonrası'} ${interestType} faiz`,
        isCalculated: true,
        calculatedAt: new Date(),
        sortOrder: isPreInterest ? 10 : 20,
      },
    });
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
  async recalculateAllInterest(tenantId: string, caseId: string) {
    // Mevcut faiz kalemlerini sil
    await (this.prisma as any).claimItem.deleteMany({
      where: {
        tenantId,
        caseId,
        itemType: { in: ['INTEREST', 'PRE_INTEREST', 'POST_INTEREST'] },
        isCalculated: true,
      },
    });

    // Dosya bilgilerini al
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });

    if (!caseData) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    // Yeni faiz kalemi ekle
    const interestType = (caseData.interestType as InterestType) || InterestType.YASAL;
    return this.addInterestItem(tenantId, caseId, interestType, true);
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
  async getInterestRateFromEngine(
    currency: string,
    interestType: string,
    date?: Date,
  ): Promise<number | null> {
    if (!this.claimEngineService) {
      return null;
    }

    return this.claimEngineService.getInterestRate(
      currency,
      interestType,
      date || new Date(),
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
