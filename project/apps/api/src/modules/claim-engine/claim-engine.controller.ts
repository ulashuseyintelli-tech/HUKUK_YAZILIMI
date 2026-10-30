import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ClaimEngineService, ClassificationResult, RoutingResult, GeneratedClaimItem, ValidationResult } from './claim-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AllowViewerReadOnlyPost, ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';

// DTO'lar
export class ClassifyDocumentDto {
  ocrText: string;
}

export class RouteCaseDto {
  docType: string;
  documentContent?: string;
}

export class GenerateClaimItemsDto {
  subCategory: string;
  extractedData: Record<string, any>;
  wizardData?: Record<string, any>;
}

export class ValidateCaseDto {
  caseType: string;
  subCategory: string;
  claimItems: Array<{ type: string }>;
  extractedData: Record<string, any>;
  wizardData?: Record<string, any>;
}

export class CalculatePenaltyDto {
  calculatorName: string;
  principalAmount: number;
  customRate?: number;
}

// F02-D-2 dilim 3 (owner "Burada başla" + ek talimat 30.10.2026): VIEWER kural kümesini yeniden YÜKLEYEMEZ (`reload` = sunucu geneli kural durumu). Sınıflandırma / yönlendirme /
// kalem üretimi / doğrulama / ceza hesabı saf hesap → açık. Ölçülen boşluk: yalnız JWT; ClaimEngineService rol sormuyor.
// Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard` (JwtAuthGuard'dan SONRA).
@Controller('claim-engine')
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class ClaimEngineController {
  constructor(private readonly claimEngineService: ClaimEngineService) {}

  // Kuralları yeniden yükle
  @Post('reload')
  async reloadRules(): Promise<{ success: boolean; message: string }> {
    await this.claimEngineService.loadRules();
    return { success: true, message: 'Kurallar yeniden yüklendi' };
  }

  // Belge türlerini getir
  @Get('document-types')
  getDocumentTypes(): string[] {
    return this.claimEngineService.getDocumentTypes();
  }

  // Alt kategorileri getir
  @Get('sub-categories')
  getSubCategories(): string[] {
    return this.claimEngineService.getSubCategories();
  }

  // Belge sınıflandır
  @AllowViewerReadOnlyPost() // saf: belge sınıflandırma hesabı — DB yazma / denetim izi / dış çağrı yok (servis kaynağı yan etki haritası)
  @Post('classify')
  classifyDocument(@Body() dto: ClassifyDocumentDto): ClassificationResult {
    return this.claimEngineService.classifyDocument(dto.ocrText);
  }

  // Takip türü belirle
  @AllowViewerReadOnlyPost() // saf: dava yönlendirme hesabı — DB yazma / denetim izi / dış çağrı yok (servis kaynağı yan etki haritası)
  @Post('route')
  routeCase(@Body() dto: RouteCaseDto): RoutingResult | null {
    return this.claimEngineService.routeCase(dto.docType, dto.documentContent);
  }

  // Alacak kalemi şablonlarını getir
  @Get('templates/:subCategory')
  getClaimItemTemplates(@Param('subCategory') subCategory: string) {
    return this.claimEngineService.getClaimItemTemplates(subCategory);
  }

  // Alacak kalemleri oluştur
  @AllowViewerReadOnlyPost() // saf: alacak kalemi üretimi (yalnız yanıt gövdesi) — DB yazma / denetim izi / dış çağrı yok (servis kaynağı yan etki haritası)
  @Post('generate-items')
  generateClaimItems(@Body() dto: GenerateClaimItemsDto): GeneratedClaimItem[] {
    return this.claimEngineService.generateClaimItems(
      dto.subCategory,
      dto.extractedData,
      dto.wizardData || {},
    );
  }

  // Faiz oranını getir
  @Get('interest-rate')
  getInterestRate(
    @Query('currency') currency: string,
    @Query('interestType') interestType: string,
    @Query('date') date?: string,
  ): { rate: number | null } {
    const dateObj = date ? new Date(date) : new Date();
    const rate = this.claimEngineService.getInterestRate(currency, interestType, dateObj);
    return { rate };
  }

  // Dosya doğrula
  @AllowViewerReadOnlyPost() // saf: dava doğrulama hesabı — DB yazma / denetim izi / dış çağrı yok (servis kaynağı yan etki haritası)
  @Post('validate')
  validateCase(@Body() dto: ValidateCaseDto): ValidationResult {
    return this.claimEngineService.validateCase(
      dto.caseType,
      dto.subCategory,
      dto.claimItems,
      dto.extractedData,
      dto.wizardData || {},
    );
  }

  // Şablon adını getir
  @Get('template/:subCategory')
  getTemplate(
    @Param('subCategory') subCategory: string,
    @Query('templateSet') templateSet?: string,
  ): { template: string | null } {
    const template = this.claimEngineService.getTemplateForCase(subCategory, templateSet);
    return { template };
  }

  // İletişim önerilerini getir
  @Get('communication-suggestions/:caseType')
  getCommunicationSuggestions(@Param('caseType') caseType: string) {
    return this.claimEngineService.getCommunicationSuggestions(caseType);
  }

  // Ceza/tazminat hesapla
  @AllowViewerReadOnlyPost() // saf: ceza hesabı — DB yazma / denetim izi / dış çağrı yok (servis kaynağı yan etki haritası)
  @Post('calculate-penalty')
  calculatePenalty(@Body() dto: CalculatePenaltyDto): { amount: number } {
    const amount = this.claimEngineService.calculatePenalty(
      dto.calculatorName,
      dto.principalAmount,
      dto.customRate,
    );
    return { amount };
  }

  // Varsayılan ayarları getir
  @Get('defaults')
  getDefaults() {
    return {
      currency: this.claimEngineService.getDefaultCurrency(),
      rounding: this.claimEngineService.getRoundingConfig(),
    };
  }
}
