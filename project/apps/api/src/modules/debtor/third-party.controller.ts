import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ThirdPartyService } from "./third-party.service";
import {
  CreateThirdPartyDto,
  UpdateThirdPartyDto,
  RecordIhbarnameDto,
  RecordResponseDto,
} from "./dto/third-party.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller()
@UseGuards(JwtAuthGuard)
export class ThirdPartyController {
  constructor(private thirdPartyService: ThirdPartyService) {}

  // ==================== THIRD PARTY CRUD ====================

  @Get("case-debtors/:caseDebtorId/third-parties")
  getThirdParties(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseDebtorId") caseDebtorId: string
  ) {
    return this.thirdPartyService.getThirdPartiesForCaseDebtor(tenantId, caseDebtorId);
  }

  @Post("case-debtors/:caseDebtorId/third-parties")
  createThirdParty(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseDebtorId") caseDebtorId: string,
    @Body() dto: CreateThirdPartyDto
  ) {
    return this.thirdPartyService.create(tenantId, caseDebtorId, dto);
  }

  @Put("third-parties/:id")
  updateThirdParty(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateThirdPartyDto
  ) {
    return this.thirdPartyService.update(tenantId, id, dto);
  }

  @Delete("third-parties/:id")
  deleteThirdParty(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.thirdPartyService.delete(tenantId, id);
  }

  // ==================== İHBARNAME ====================

  @Post("third-parties/:id/ihbarname")
  recordIhbarname(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: RecordIhbarnameDto
  ) {
    return this.thirdPartyService.recordIhbarname(tenantId, id, dto);
  }

  @Post("third-parties/:id/response")
  recordResponse(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: RecordResponseDto
  ) {
    return this.thirdPartyService.recordResponse(tenantId, id, dto);
  }

  // ==================== ALERTS ====================

  @Get("third-parties/overdue")
  getOverdueIhbarnames(@CurrentUser("tenantId") tenantId: string) {
    return this.thirdPartyService.getOverdueIhbarnames(tenantId);
  }

  // ==================== 89 İHBARNAME ZİNCİRİ ====================

  /**
   * Üçüncü şahısları durum bilgisiyle getir
   * GET /case-debtors/:caseDebtorId/third-parties/with-status
   */
  @Get("case-debtors/:caseDebtorId/third-parties/with-status")
  getThirdPartiesWithStatus(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseDebtorId") caseDebtorId: string
  ) {
    return this.thirdPartyService.getThirdPartiesWithStatus(tenantId, caseDebtorId);
  }

  /**
   * Sonraki ihbarnameyi gönder (89/1 -> 89/2 -> 89/3)
   * POST /third-parties/:id/send-next
   */
  @Post("third-parties/:id/send-next")
  sendNextIhbarname(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.thirdPartyService.sendNextIhbarname(tenantId, id);
  }

  /**
   * Dosya için 89 ihbarname özeti
   * GET /cases/:caseId/ihbarname-summary
   */
  @Get("cases/:caseId/ihbarname-summary")
  getIhbarnameSummary(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string
  ) {
    return this.thirdPartyService.getIhbarnameSummary(tenantId, caseId);
  }

  // ==================== DIŞ DOSYALAR (ALACAK HACZİ) ====================

  /**
   * Borçlunun alacaklı olduğu dış dosyaları getir
   * GET /case-debtors/:caseDebtorId/external-cases
   */
  @Get("case-debtors/:caseDebtorId/external-cases")
  getExternalCases(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseDebtorId") caseDebtorId: string
  ) {
    return this.thirdPartyService.getExternalCases(tenantId, caseDebtorId);
  }

  /**
   * Yeni dış dosya ekle (alacak haczi)
   * POST /case-debtors/:caseDebtorId/external-cases
   */
  @Post("case-debtors/:caseDebtorId/external-cases")
  createExternalCase(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseDebtorId") caseDebtorId: string,
    @Body() dto: any
  ) {
    return this.thirdPartyService.createExternalCase(tenantId, caseDebtorId, dto);
  }

  /**
   * Dış dosya güncelle
   * PUT /external-cases/:id
   */
  @Put("external-cases/:id")
  updateExternalCase(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: any
  ) {
    return this.thirdPartyService.updateExternalCase(tenantId, id, dto);
  }

  /**
   * Dış dosyaya tahsilat ekle
   * POST /external-cases/:id/collection
   */
  @Post("external-cases/:id/collection")
  addExternalCaseCollection(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: { amount: number; date?: string; notes?: string; syncToMainCase?: boolean }
  ) {
    return this.thirdPartyService.addExternalCaseCollection(tenantId, id, dto);
  }

  /**
   * Dış dosya sil
   * DELETE /external-cases/:id
   */
  @Delete("external-cases/:id")
  deleteExternalCase(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.thirdPartyService.deleteExternalCase(tenantId, id);
  }
}
