import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ClaimEngineService, ClassificationResult, RoutingResult, GeneratedClaimItem, ValidationResult } from './claim-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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

@Controller('claim-engine')
@UseGuards(JwtAuthGuard)
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
  @Post('classify')
  classifyDocument(@Body() dto: ClassifyDocumentDto): ClassificationResult {
    return this.claimEngineService.classifyDocument(dto.ocrText);
  }

  // Takip türü belirle
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
