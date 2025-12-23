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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateClaimItemDto,
  UpdateClaimItemDto,
  AutoGenerateClaimItemsDto,
  CalculateInterestDto,
  InterestType,
} from './dto/claim-item.dto';

@Controller('claim-items')
@UseGuards(JwtAuthGuard)
export class ClaimItemController {
  constructor(private readonly service: ClaimItemService) {}

  // Alacak kalemi oluştur
  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateClaimItemDto,
  ) {
    const data = await this.service.create(tenantId, dto);
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
    @Param('id') id: string,
    @Body() dto: UpdateClaimItemDto,
  ) {
    const data = await this.service.update(tenantId, id, dto);
    return { success: true, data };
  }

  // Alacak kalemi sil
  @Delete(':id')
  async remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    await this.service.remove(tenantId, id);
    return { success: true, message: 'Alacak kalemi silindi' };
  }

  // Evraktan otomatik alacak kalemleri oluştur
  @Post('auto-generate')
  async autoGenerate(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: AutoGenerateClaimItemsDto,
  ) {
    const data = await this.service.autoGenerateFromDocument(tenantId, dto);
    return { success: true, data };
  }

  // Faiz hesapla
  @Post('calculate-interest')
  async calculateInterest(@Body() dto: CalculateInterestDto) {
    const data = await this.service.calculateInterest(dto);
    return { success: true, data };
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

  // Dosyaya faiz kalemi ekle
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
    @Param('caseId') caseId: string,
    @Body() body: { amount: number; description: string; currency?: string },
  ) {
    const data = await this.service.addExpenseItem(
      tenantId,
      caseId,
      body.amount,
      body.description,
      body.currency,
    );
    return { success: true, data };
  }

  // Dosyaya harç kalemi ekle
  @Post('case/:caseId/add-fee')
  async addFee(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Body() body: { amount: number; description: string; currency?: string },
  ) {
    const data = await this.service.addFeeItem(
      tenantId,
      caseId,
      body.amount,
      body.description,
      body.currency,
    );
    return { success: true, data };
  }

  // Dosyaya vekalet ücreti kalemi ekle
  @Post('case/:caseId/add-attorney-fee')
  async addAttorneyFee(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Body() body: { amount: number; description?: string; currency?: string },
  ) {
    const data = await this.service.addAttorneyFeeItem(
      tenantId,
      caseId,
      body.amount,
      body.description,
      body.currency,
    );
    return { success: true, data };
  }

  // Tüm faizleri yeniden hesapla
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
    @Param('caseId') caseId: string,
    @Body() body: {
      subCategory: string;
      extractedData: Record<string, any>;
      wizardData?: Record<string, any>;
    },
  ) {
    const data = await this.service.generateFromRuleEngine(
      tenantId,
      caseId,
      body.subCategory,
      body.extractedData,
      body.wizardData || {},
    );
    return { success: true, data };
  }

  // Dosyayı kural motoru ile doğrula
  @Post('case/:caseId/validate')
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
