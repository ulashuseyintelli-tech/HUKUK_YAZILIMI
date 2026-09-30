import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClaimItemService } from './claim-item.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AllowViewerReadOnlyPost, ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateClaimItemDto,
  UpdateClaimItemDto,
  AutoGenerateClaimItemsDto,
  CalculateInterestDto,
  CekFormationPreviewDto,
  InterestType,
} from './dto/claim-item.dto';
import { previewCekFormation } from './formation-cek/cek-formation-preview';

@Controller('claim-items')
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class ClaimItemController {
  constructor(private readonly service: ClaimItemService) {}

  // Alacak kalemi oluştur
  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Body() dto: CreateClaimItemDto,
  ) {
    const data = await this.service.createFromUser(tenantId, actorUserId, dto);
    return { success: true, data };
  }

  // Dosyanın alacak kalemlerini getir
  @Get('case/:caseId')
  async findByCaseId(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const data = await this.service.findByCaseId(tenantId, caseId);
    return { success: true, data };
  }

  // Tek alacak kalemi getir
  @Get(':id')
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.service.findOne(tenantId, id);
    return { success: true, data };
  }


  // Alacak kalemi güncelle
  @Put(':id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('id') id: string,
    @Body() dto: UpdateClaimItemDto,
  ) {
    const data = await this.service.updateFromUser(tenantId, actorUserId, id, dto);
    return { success: true, data };
  }

  // Alacak kalemi sil
  @Delete(':id')
  async remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('id') id: string,
  ) {
    const data = await this.service.removeFromUser(tenantId, actorUserId, id);
    return { success: true, message: 'Alacak kalemi silme talebi onaya gönderildi', data };
  }

  // Evraktan otomatik alacak kalemleri oluştur
  @Post('auto-generate')
  async autoGenerate(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Body() dto: AutoGenerateClaimItemsDto,
  ) {
    // K3: insan isteği insan yazma politikasından geçer (sistem yazıcısı autoGenerateFromDocument DEĞİL).
    const data = await this.service.autoGenerateFromUser(tenantId, actorUserId, dto);
    return { success: true, data };
  }

  /**
   * @deprecated Use /api/interest-engine/calculate instead
   * Bu endpoint geriye uyumluluk için korunuyor.
   */
  @Post('calculate-interest')
  @AllowViewerReadOnlyPost() // okuma/hesap: yazma YAPMAZ (kaynaktan dogrulandi)
  async calculateInterest(@Body() dto: CalculateInterestDto) {
    const data = await this.service.calculateInterest(dto);
    return { success: true, data, _deprecated: 'Use /api/interest-engine/calculate for accurate calculations' };
  }

  /**
   * K3-L Faz 2b — TASLAK çek tazminatı önizlemesi (sihirbaz; dosya henüz yok). SALT HESAP: veritabanına erişmez,
   * hiçbir kayıt/onay üretmez. Çıktı "Taslak — onay bekliyor, gönderime hazır değil" olarak işaretlidir; kesin kalem
   * yalnız K3 onayıyla oluşur. Girdi eksikse tutar üretilmez (VERI_EKSIK).
   * POST /claim-items/cek-formation/preview
   */
  @Post('cek-formation/preview')
  @AllowViewerReadOnlyPost() // okuma/hesap: yazma YAPMAZ (saf fonksiyon; kaynaktan dogrulandi)
  previewCekFormation(@Body() dto: CekFormationPreviewDto) {
    return { success: true, data: previewCekFormation(dto) };
  }
  // Dosyanın alacak özetini getir
  @Get('case/:caseId/summary')
  async getClaimSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Query('calculationDate') calculationDate?: string,
  ) {
    const data = await this.service.getClaimSummary(tenantId, caseId, calculationDate);
    return { success: true, data };
  }

  // KALDIRILMIŞ işlev: faiz kalemi ekleme — 410 CLAIM_ITEM_ENDPOINT_REMOVED (yazma yok). Rota ve
  // JwtAuthGuard/ViewerWriteDenyGuard sınırı korunur (owner GO 2026-09-28, seçenek B).
  @Post('case/:caseId/add-interest')
  async addInterest(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Body() body: { interestType: InterestType; isPreInterest?: boolean },
  ) {
    const data = await this.service.addInterestItem(
      tenantId,
      caseId,
      body.interestType,
      body.isPreInterest ?? true,
    );
    return { success: true, data };
  }

  // Dosyaya masraf kalemi ekle
  @Post('case/:caseId/add-expense')
  async addExpense(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('caseId') caseId: string,
    @Body() body: { amount: number; description: string; currency?: string },
  ) {
    const data = await this.service.createFromUser(
      tenantId,
      actorUserId,
      {
      caseId,
      itemType: 'EXPENSE' as any,
      amount: body.amount,
      description: body.description,
      currency: body.currency,
    });
    return { success: true, data };
  }

  // Dosyaya harç kalemi ekle
  @Post('case/:caseId/add-fee')
  async addFee(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('caseId') caseId: string,
    @Body() body: { amount: number; description: string; currency?: string },
  ) {
    const data = await this.service.createFromUser(
      tenantId,
      actorUserId,
      {
      caseId,
      itemType: 'FEE' as any,
      amount: body.amount,
      description: body.description,
      currency: body.currency,
    });
    return { success: true, data };
  }

  // Dosyaya vekalet ücreti kalemi ekle
  @Post('case/:caseId/add-attorney-fee')
  async addAttorneyFee(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('caseId') caseId: string,
    @Body() body: { amount: number; description?: string; currency?: string },
  ) {
    const data = await this.service.createFromUser(
      tenantId,
      actorUserId,
      {
      caseId,
      itemType: 'ATTORNEY_FEE' as any,
      amount: body.amount,
      description: body.description || 'Vekalet ücreti',
      currency: body.currency,
    });
    return { success: true, data };
  }

  // KALDIRILMIŞ işlev: toplu faiz yeniden hesaplama — 410 CLAIM_ITEM_ENDPOINT_REMOVED (yazma yok).
  // Rota ve guard sınırı korunur (owner GO 2026-09-28, seçenek B).
  @Post('case/:caseId/recalculate-interest')
  async recalculateInterest(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const data = await this.service.recalculateAllInterest(tenantId, caseId);
    return { success: true, data };
  }

  // ==================== CLAIM ENGINE ENTEGRASYONU ====================

  // Kural motorundan alacak kalemleri oluştur
  @Post('case/:caseId/generate-from-rules')
  async generateFromRules(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('caseId') caseId: string,
    @Body() body: {
      subCategory: string;
      extractedData: Record<string, any>;
      wizardData?: Record<string, any>;
    },
  ) {
    // K3: insan isteği insan yazma politikasından geçer (sistem yazıcısı generateFromRuleEngine DEĞİL).
    const data = await this.service.generateFromRuleEngineForUser(
      tenantId,
      actorUserId,
      caseId,
      body.subCategory,
      body.extractedData,
      body.wizardData || {},
    );
    return { success: true, data };
  }

  // Dosyayı kural motoru ile doğrula
  @Post('case/:caseId/validate')
  @AllowViewerReadOnlyPost() // okuma/hesap: yazma YAPMAZ (kaynaktan dogrulandi)
  async validateCase(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Body() body: {
      caseType: string;
      subCategory: string;
      extractedData?: Record<string, any>;
      wizardData?: Record<string, any>;
    },
  ) {
    const data = await this.service.validateWithRuleEngine(
      tenantId,
      caseId,
      body.caseType,
      body.subCategory,
      body.extractedData || {},
      body.wizardData || {},
    );
    return { success: true, data };
  }

  // Çek tazminatı hesapla
  @Post('calculate-check-penalty')
  @AllowViewerReadOnlyPost() // okuma/hesap: yazma YAPMAZ (kaynaktan dogrulandi)
  async calculateCheckPenalty(
    @Body() body: { principalAmount: number; customRate?: number },
  ) {
    const amount = await this.service.calculateCheckPenalty(
      body.principalAmount,
      body.customRate,
    );
    return { success: true, data: { amount } };
  }
}
