import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeeEngineService } from './fee-engine.service';
import { buildFeePreviewCurrencyStatus, type FeePreviewCurrencyStatus } from './fee-preview-currency';
import type { GeneratedFeeItem } from '@shared/types';

interface CalculateFeesDto {
  caseType: string;
  principalAmount: number;
  accruedInterest?: number;
  debtorCount?: number;
  postageType?: string;
  tariffYear?: number;
}

/**
 * Preview Request DTO - Lightweight hesaplama için
 * Audit log tutulmaz, cache'lenir
 */
interface FeePreviewDto {
  principalAmount: number;
  /**
   * Takip türü kodu (lookup `takipTuru.code`: ILAMSIZ_GENEL, ILAMSIZ_KIRA, KAMBIYO_CEK …). Sihirbaz bunu gönderir; sunucu
   * masraf profiline `fee-case-type.ts` eşlemesiyle çevirir. Bilinmeyen / profili olmayan kod "hesaplanamadı" döner.
   */
  takipTuruCode?: string;
  /**
   * Doğrudan masraf profili kodu (ILAMSIZ, KIRA, TAHLIYE, KAMBIYO, ILAMLI, REHIN, IFLAS). `takipTuruCode` yoksa kullanılır.
   * KALEM TÜRÜ (ASIL_ALACAK, FATURA …) takip türü DEĞİLDİR: eşleşmez, "hesaplanamadı" döner (eskiden sessiz 0 idi).
   */
  caseType?: string;
  debtorCount?: number;
  /** Alacak kaleminin para birimi. Verilirse yanıt `data.paraBirimiDurumu` kararını taşır; sayısal alanlar DEĞİŞMEZ. */
  currency?: string;
  /** Dosya para birimi (kalemden farklı olabilir). Verilmezse kalemin para birimi dosya para birimi sayılır. */
  caseCurrency?: string;
}

interface FeePreviewResponse {
  success: boolean;
  data?: {
    estimatedFees: number;
    estimatedAttorneyFee: number;
    tariffYear: number;
    breakdown: {
      basvurmaHarci: number;
      vekaletHarci: number;
      pesinHarc: number;
      dosyaGideri: number;
      tebligatGideri: number;
      vekaletPulu: number;
    };
    /**
     * Tutarların para birimi ve geçerliliği (yalnız istek `currency` taşıyorsa). Tarife TL'dir: dövizli / dosyayla
     * uyuşmayan kalemde oranlı tutarlar HESAPLANAMADI, tek toplamlar GOSTERILEMEZ bildirilir. Çevirme ve hesap YOK.
     */
    paraBirimiDurumu?: FeePreviewCurrencyStatus;
  };
  /**
   * `success: false` = masraflar HESAPLANAMADI (sıfır DEĞİL). `CASE_TYPE_UNRESOLVED` takip türü yok / eşleşmedi,
   * `TARIFF_NOT_FOUND` tarife yok, `FEE_PROFILE_NOT_FOUND` profil yok, `TARIFF_ITEM_MISSING` tarifede gerekli kalem yok.
   */
  error?: {
    code:
      | 'INVALID_INPUT'
      | 'SERVICE_UNAVAILABLE'
      | 'CASE_TYPE_UNRESOLVED'
      | 'TARIFF_NOT_FOUND'
      | 'FEE_PROFILE_NOT_FOUND'
      | 'TARIFF_ITEM_MISSING';
    message: string;
  };
  /**
   * Yalnız `success:false` yanıtında: masraf hesaplanamasa da hesaplanabilen kısım. Vekalet ücreti masraf profiline ve
   * tarifeye bağlı DEĞİLDİR (servisteki mevcut tablo; formül seçimi ayrı hukuki karar): satır kaybolmaz, tabandaki gibi
   * hesaplanır; masraf ve ona bağlı satırlar "hesaplanamadı", toplamlar "gösterilemez" kalır.
   */
  partial?: { estimatedAttorneyFee: number };
  cached: boolean;
  cacheExpiry?: string;
}

@Controller('fee-engine')
@UseGuards(JwtAuthGuard)
export class FeeEngineController {
  constructor(private readonly feeEngineService: FeeEngineService) {}

  /**
   * POST /fee-engine/preview
   * 
   * Lightweight preview endpoint - NO audit log, cached
   * Frontend form preview için kullanılır
   *
   * Cagrildigi yerler:
   * - web feeEngineApi.preview() -> ProfessionalClaimItemForm.hesapla() (sihirbaz alacak kalemi formu, "Hesap Özeti")
   * - web feeEngineApi.preview() -> usePreviewCoordinator (para birimi göndermez; profil dışı `caseType` artık
   *   "hesaplanamadı" döner, eskiden sessiz 0; kancayı çağıran bileşen yok)
   *
   * @see docs/single-source-of-truth-architecture.md
   */
  @Post('preview')
  preview(@Body() dto: FeePreviewDto): FeePreviewResponse {
    try {
      // Validate input (tutar sayıya çevrilir: metin gövde "10000" + 0 = "100000" olmasın)
      const principalAmount = Number(dto.principalAmount);
      if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'principalAmount must be greater than 0',
          },
          cached: false,
        };
      }

      // Hesap TEK kaynakta: FeeEngineService.previewCalculation() (takip türü çözümü, tarife, profil, döküm kodları,
      // dosya gideri). Denetleyicide ikinci bir döküm kodu listesi ya da vekalet tablosu KALMADI (§15.2, REC-FEE-002).
      const result = this.feeEngineService.previewCalculation({
        principalAmount,
        takipTuruCode: dto.takipTuruCode,
        caseType: dto.caseType,
        debtorCount: dto.debtorCount || 1,
        postageType: 'NORMAL',
        // Takip türü hiç verilmezse eski varsayılana (`ILAMSIZ_GENEL`) DÜŞÜLMEZ: eksik bilgi sıfır sayılmaz.
        requireCaseType: true,
      });

      if (!result.success || !result.data) {
        return {
          success: false,
          error: {
            code: (result.error?.code ?? 'SERVICE_UNAVAILABLE') as NonNullable<FeePreviewResponse['error']>['code'],
            message: result.error?.message ?? 'Masraf hesaplama servisi geçici olarak kullanılamıyor; masraflar hesaplanamadı.',
          },
          ...(result.partial ? { partial: result.partial } : {}),
          cached: false,
        };
      }

      // Para birimi bağlamı (eklemeli; hesap ve çevirme YOK). İstek para birimi taşımıyorsa blok üretilmez.
      const paraBirimiDurumu = buildFeePreviewCurrencyStatus({
        principalAmount,
        currency: dto.currency,
        caseCurrency: dto.caseCurrency,
      });

      // Cache expiry: 5 minutes
      const cacheExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      return {
        success: true,
        data: {
          estimatedFees: result.data.estimatedFees,
          estimatedAttorneyFee: result.data.estimatedAttorneyFee,
          tariffYear: result.data.tariffYear,
          breakdown: result.data.breakdown,
          ...(paraBirimiDurumu ? { paraBirimiDurumu } : {}),
        },
        cached: false, // TODO: Implement caching
        cacheExpiry,
      };
    } catch (error) {
      console.error('[FeeEngine] Preview error:', error);
      return {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Masraf hesaplama servisi geçici olarak kullanılamıyor; masraflar hesaplanamadı.',
        },
        cached: false,
      };
    }
  }

  /**
   * Açılış masraflarını hesapla
   */
  @Post('calculate-opening-fees')
  calculateOpeningFees(@Body() dto: CalculateFeesDto): {
    items: GeneratedFeeItem[];
    total: number;
    tariffYear: number;
  } {
    const items = this.feeEngineService.calculateOpeningFees(
      dto.caseType,
      dto.principalAmount,
      dto.accruedInterest || 0,
      dto.debtorCount || 1,
      dto.postageType || 'NORMAL',
      dto.tariffYear,
    );

    return {
      items,
      total: this.feeEngineService.calculateTotalFees(items),
      tariffYear: dto.tariffYear || this.feeEngineService.getCurrentTariffYear(),
    };
  }

  /**
   * Faiz oranını getir
   */
  @Get('interest-rate')
  getInterestRate(
    @Query('currency') currency: string = 'TRY',
    @Query('interestType') interestType: string = 'YASAL',
    @Query('date') date?: string,
  ): { rate: number; currency: string; interestType: string } {
    const rate = this.feeEngineService.getInterestRate(
      currency,
      interestType,
      date ? new Date(date) : undefined,
    );

    return { rate, currency, interestType };
  }

  /**
   * Tebligat türlerini getir
   */
  @Get('postage-types')
  getPostageTypes(
    @Query('caseType') caseType?: string,
  ): Array<{ code: string; label: string; amount: number | null; allowed: boolean }> {
    const allTypes = this.feeEngineService.getPostageTypes();
    const allowedTypes = caseType 
      ? this.feeEngineService.getAllowedPostageTypes(caseType)
      : allTypes.map(t => t.code);

    return allTypes.map(type => ({
      ...type,
      allowed: allowedTypes.includes(type.code),
    }));
  }

  /**
   * Ceza/tazminat hesapla
   */
  @Post('calculate-penalty')
  calculatePenalty(
    @Body() dto: { penaltyType: string; principalAmount: number; customRate?: number },
  ): { amount: number; penaltyType: string; rate: number } {
    const amount = this.feeEngineService.calculatePenalty(
      dto.penaltyType,
      dto.principalAmount,
      dto.customRate,
    );

    return {
      amount,
      penaltyType: dto.penaltyType,
      rate: dto.customRate || 0.10,
    };
  }

  /**
   * Mevcut tarife yılını getir
   */
  @Get('current-tariff-year')
  getCurrentTariffYear(): { year: number } {
    return { year: this.feeEngineService.getCurrentTariffYear() };
  }

  /**
   * Faiz hesapla
   */
  @Post('calculate-interest')
  calculateInterest(
    @Body() dto: { 
      principal: number; 
      startDate: string; 
      endDate: string; 
      interestType?: string;
      currency?: string;
    },
  ): { 
    principal: number; 
    interest: number; 
    total: number; 
    rate: number;
    days: number;
    startDate: string;
    endDate: string;
    interestType: string;
  } {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const rate = this.feeEngineService.getInterestRate(
      dto.currency || 'TRY',
      dto.interestType || 'YASAL',
      startDate,
    );
    
    // Yıllık faiz oranını günlük faize çevir ve hesapla
    const dailyRate = rate / 100 / 365;
    const interest = dto.principal * dailyRate * days;
    
    return {
      principal: dto.principal,
      interest: Math.round(interest * 100) / 100,
      total: Math.round((dto.principal + interest) * 100) / 100,
      rate,
      days,
      startDate: dto.startDate,
      endDate: dto.endDate,
      interestType: dto.interestType || 'YASAL',
    };
  }

  /**
   * Masraf hesapla (basit)
   */
  @Post('calculate')
  calculate(
    @Body() dto: { 
      principal: number; 
      caseType?: string;
      profile?: string;
    },
  ): { 
    principal: number;
    fees: Array<{ name: string; amount: number }>;
    total: number;
    profile: string;
  } {
    const items = this.feeEngineService.calculateOpeningFees(
      dto.caseType || 'ILAMSIZ_GENEL',
      dto.principal,
      0,
      1,
      'NORMAL',
    );
    
    const fees = items.map(item => ({
      name: item.label,
      amount: item.amount,
    }));
    
    const total = this.feeEngineService.calculateTotalFees(items);
    
    return {
      principal: dto.principal,
      fees,
      total,
      profile: dto.profile || 'STANDART',
    };
  }
}
