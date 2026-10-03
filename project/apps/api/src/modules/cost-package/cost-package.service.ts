import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { evaluateOpeningExpenseBasis, openingExpenseBasisInputOfCase } from '@/modules/expense-request/opening-expense-basis';
import {
  CostPackageIncompleteSuggestion,
  CostPackageNotCalculableItem,
  describeIncompleteSuggestion,
  isBasisDependentCalcRule,
} from './cost-package-basis';

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
  /**
   * Çağıran, hesaplanamayan kalem içeren (EKSİK) öneriyi işleyebildiğini beyan eder. Beyan yoksa eksik öneri dönmez:
   * gerekçesiyle reddedilir (409) — eksik toplam, haberi olmayan çağırana paket toplamı gibi verilmez.
   */
  acceptIncomplete?: boolean;
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
   * Case parametrelerine göre kalemleri hesaplar. SALT HESAP: kayıt yazmaz.
   *
   * Matraha bağlı (oranlı) kalemin önerisi yalnız matrah TL iken hesaplanır (bkz. cost-package-basis.ts). Dövizli / karma
   * dosyada bu kalemler için tutar ÜRETİLMEZ (0 da yazılmaz): `items` ve `totalSuggested` yalnız hesaplanabilen kalemleri
   * taşır, eksik kalan `incompleteSuggestion` ile bildirilir. Bu alan yalnız eksik öneride vardır; TL dosyada yanıt aynen.
   *
   * Cagrildigi yerler:
   * - CostPackageController.computeExpenseRequest() -> POST /cost-packages/compute (masraf talebi penceresi, paket modu)
   * - StageTriggerService.handleUyapPrepare() -> POST /cases/:caseId/uyap/prepare, .../stage-trigger, .../operations
   *   (bakiye ↔ paket toplamı; eksik öneriyi kabul ettiğini beyan ETMEZ → dövizli / karma dosyada 409)
   */
  async computeExpenseRequest(tenantId: string, params: ComputeExpenseParams): Promise<{
    packageCode: string;
    packageName: string;
    items: ComputedExpenseItem[];
    totalSuggested: number;
    messageTemplateCode: string | null;
    incompleteSuggestion?: CostPackageIncompleteSuggestion;
  }> {
    const { caseId, packageCode, debtorCount, tebligatCount, principalAmount } = params;

    // Case bilgilerini al — büro (tenant) sınırı: dosya çağıranın bürosunda aranır; başka büronun dosyası, var olmayan
    // dosyayla AYNI "bulunamadı" yanıtını alır (anapara / borçlu sayısı / büroya özel paket sızmaz). `tenantId` yalnız
    // doğrulanmış oturumdan gelir, istek gövdesinden DEĞİL. Çağıranlar: CostPackageController.computeExpenseRequest()
    // (POST /cost-packages/compute) ve StageTriggerService.handleUyapPrepare() (POST /cases/:caseId/uyap/prepare,
    // .../stage-trigger, .../operations). Kimlik metin değilse ya da boşsa sorguya gidilmez: Prisma tanımsız süzgeci yok
    // sayar, gövdeden gelen nesne de süzgeç işleci gibi yorumlanırdı.
    const caseData =
      typeof caseId === 'string' && caseId && typeof tenantId === 'string' && tenantId
        ? await this.prisma.case.findFirst({
            where: { id: caseId, tenantId },
            include: {
              debtors: true,
              executionOffice: true,
            },
          })
        : null;

    if (!caseData) {
      throw new NotFoundException('Takip bulunamadı');
    }

    // Paketi al (çağıranın bürosu = dosyanın bürosu)
    const pkg = await this.findByCode(packageCode, tenantId);

    // Hesaplama parametreleri
    const calcContext = {
      debtorCount: debtorCount ?? caseData.debtors.length,
      tebligatCount: tebligatCount ?? caseData.debtors.length, // Varsayılan: borçlu sayısı kadar
      principalAmount: principalAmount ?? Number(caseData.principalAmount || 0),
    };

    // Matraha bağlı (oranlı) kalemin önerisi yalnız matrah TL iken hesaplanır. Eksik öneri, onu işleyebildiğini beyan
    // etmeyen çağırana verilmez: eksik toplam paket toplamı gibi kullanılamasın diye gerekçesiyle reddedilir.
    const incompleteSuggestion = await this.evaluateIncompleteSuggestion(caseData, pkg);
    if (incompleteSuggestion && params.acceptIncomplete !== true) {
      throw new ConflictException({
        code: incompleteSuggestion.reasonCode,
        message: incompleteSuggestion.message,
        requiredInfo: incompleteSuggestion.requiredInfo,
        notCalculableItems: incompleteSuggestion.notCalculableItems,
        caseCurrency: incompleteSuggestion.caseCurrency,
        basisCurrencies: incompleteSuggestion.basisCurrencies,
        tariffCurrency: incompleteSuggestion.tariffCurrency,
      });
    }

    // Kalemleri hesapla
    const items: ComputedExpenseItem[] = [];
    let totalSuggested = 0;

    for (const item of pkg.items) {
      // Önerisi hesaplanamayan kalem: tutar üretilmez, 0 yazılmaz; eksik kalan `incompleteSuggestion` ile bildirilir
      if (incompleteSuggestion && isBasisDependentCalcRule(item.calcRule)) {
        continue;
      }

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
      ...(incompleteSuggestion ? { incompleteSuggestion } : {}),
    };
  }

  /**
   * Paketin matraha bağlı (oranlı) kalemleri bu dosyada hesaplanabiliyor mu? Hesaplanamıyorsa eksik öneriyi anlatır;
   * paket oranlı kalem içermiyorsa ya da matrah TL ise null döner. SALT OKUMA: hesap yapmaz, tutar çevirmez.
   *
   * Cagrildigi yerler:
   * - CostPackageService.computeExpenseRequest()
   */
  private async evaluateIncompleteSuggestion(
    caseData: { id: string; currency: string },
    pkg: {
      name: string;
      items: ReadonlyArray<{ itemCode: string; label: string; isEditable: boolean; sortOrder: number; calcRule: unknown }>;
    },
  ): Promise<CostPackageIncompleteSuggestion | null> {
    const notCalculableItems: CostPackageNotCalculableItem[] = pkg.items
      .filter((item) => isBasisDependentCalcRule(item.calcRule))
      .map((item) => ({ itemCode: item.itemCode, label: item.label, isEditable: item.isEditable, sortOrder: item.sortOrder }));
    if (notCalculableItems.length === 0) {
      return null;
    }

    // Matrah, açılış masraf setiyle AYNI kayıtlardan okunur: anapara kalemleri (Due), yoksa anapara alacak kalemleri
    const [dues, claimItems] = await Promise.all([
      this.prisma.due.findMany({ where: { caseId: caseData.id, type: 'PRINCIPAL' }, select: { currency: true } }),
      this.prisma.claimItem.findMany({ where: { caseId: caseData.id, itemType: 'PRINCIPAL' }, select: { currency: true } }),
    ]);
    const basis = evaluateOpeningExpenseBasis(openingExpenseBasisInputOfCase({ currency: caseData.currency, dues, claimItems }));

    return basis.calculable ? null : describeIncompleteSuggestion(pkg.name, notCalculableItems, basis);
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
