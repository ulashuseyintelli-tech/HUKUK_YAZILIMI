import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

export interface ComputedExpenseItem {
  itemCode: string;
  label: string;
  suggestedAmount: number;
  finalAmount: number;
  isEditable: boolean;
  calcParams?: Record<string, any>;
  sortOrder: number;
}

export interface ComputeExpenseParams {
  caseId: string;
  packageCode: string;
  debtorCount?: number;
  tebligatCount?: number;
  principalAmount?: number;
}

@Injectable()
export class CostPackageService {
  constructor(private prisma: PrismaService) {}

  /**
   * Tüm aktif masraf paketlerini listele
   */
  async findAll(tenantId?: string) {
    return this.prisma.costPackage.findMany({
      where: {
        isActive: true,
        OR: [
          { tenantId: null }, // Sistem paketleri
          { tenantId },       // Tenant'a özel paketler
        ],
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Tek bir paketi getir
   */
  async findByCode(code: string, tenantId?: string) {
    const pkg = await this.prisma.costPackage.findFirst({
      where: {
        code,
        isActive: true,
        OR: [
          { tenantId: null },
          { tenantId },
        ],
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!pkg) {
      throw new NotFoundException(`Masraf paketi bulunamadı: ${code}`);
    }

    return pkg;
  }

  /**
   * Masraf talebini hesapla (computeExpenseRequest)
   * Case parametrelerine göre kalemleri hesaplar
   */
  async computeExpenseRequest(params: ComputeExpenseParams): Promise<{
    packageCode: string;
    packageName: string;
    items: ComputedExpenseItem[];
    totalSuggested: number;
    messageTemplateCode: string | null;
  }> {
    const { caseId, packageCode, debtorCount, tebligatCount, principalAmount } = params;

    // Case bilgilerini al
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        debtors: true,
        executionOffice: true,
      },
    });

    if (!caseData) {
      throw new NotFoundException('Takip bulunamadı');
    }

    // Paketi al
    const pkg = await this.findByCode(packageCode, caseData.tenantId);

    // Hesaplama parametreleri
    const calcContext = {
      debtorCount: debtorCount ?? caseData.debtors.length,
      tebligatCount: tebligatCount ?? caseData.debtors.length, // Varsayılan: borçlu sayısı kadar
      principalAmount: principalAmount ?? Number(caseData.principalAmount || 0),
    };

    // Kalemleri hesapla
    const items: ComputedExpenseItem[] = [];
    let totalSuggested = 0;

    for (const item of pkg.items) {
      let suggestedAmount = Number(item.defaultAmount);
      const calcParams: Record<string, any> = {};

      // Hesaplama kuralı varsa uygula
      if (item.calcRule) {
        const rule = item.calcRule as any;
        
        if (rule.type === 'per_unit') {
          // Birim başına hesaplama (örn: tebligat gideri)
          const multiplier = calcContext[rule.multiplier as keyof typeof calcContext] || 1;
          suggestedAmount = rule.unitAmount * multiplier;
          calcParams.unitAmount = rule.unitAmount;
          calcParams.multiplier = rule.multiplier;
          calcParams.multiplierValue = multiplier;
        } else if (rule.type === 'percentage') {
          // Yüzde hesaplama (örn: peşin harç)
          const base = calcContext[rule.base as keyof typeof calcContext] || 0;
          suggestedAmount = base * rule.rate;
          if (rule.min && suggestedAmount < rule.min) {
            suggestedAmount = rule.min;
          }
          if (rule.max && suggestedAmount > rule.max) {
            suggestedAmount = rule.max;
          }
          calcParams.rate = rule.rate;
          calcParams.base = rule.base;
          calcParams.baseValue = base;
        }
      }

      // Tutarı yuvarla (2 ondalık)
      suggestedAmount = Math.round(suggestedAmount * 100) / 100;
      totalSuggested += suggestedAmount;

      items.push({
        itemCode: item.itemCode,
        label: item.label,
        suggestedAmount,
        finalAmount: suggestedAmount, // Başlangıçta aynı
        isEditable: item.isEditable,
        calcParams: Object.keys(calcParams).length > 0 ? calcParams : undefined,
        sortOrder: item.sortOrder,
      });
    }

    return {
      packageCode: pkg.code,
      packageName: pkg.name,
      items,
      totalSuggested: Math.round(totalSuggested * 100) / 100,
      messageTemplateCode: pkg.messageTemplateCode,
    };
  }

  /**
   * Paket oluştur (tenant'a özel)
   */
  async create(tenantId: string, data: {
    code: string;
    name: string;
    description?: string;
    caseTypes?: string[];
    items: Array<{
      itemCode: string;
      label: string;
      defaultAmount: number;
      isEditable?: boolean;
      isRequired?: boolean;
      calcRule?: any;
    }>;
  }) {
    return this.prisma.costPackage.create({
      data: {
        tenantId,
        code: data.code,
        name: data.name,
        description: data.description,
        caseTypes: data.caseTypes || undefined,
        isSystem: false,
        items: {
          create: data.items.map((item, index) => ({
            itemCode: item.itemCode,
            label: item.label,
            defaultAmount: item.defaultAmount,
            isEditable: item.isEditable ?? true,
            isRequired: item.isRequired ?? true,
            calcRule: item.calcRule || undefined,
            sortOrder: index,
          })),
        },
      },
      include: {
        items: true,
      },
    });
  }

  /**
   * Paket güncelle
   */
  async update(id: string, tenantId: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
  }) {
    const pkg = await this.prisma.costPackage.findFirst({
      where: { id, tenantId, isSystem: false },
    });

    if (!pkg) {
      throw new NotFoundException('Paket bulunamadı veya sistem paketi');
    }

    return this.prisma.costPackage.update({
      where: { id },
      data,
    });
  }
}
