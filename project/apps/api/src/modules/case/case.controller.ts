import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CaseService } from "./case.service";
import { CreateCaseDto, UpdateCaseDto } from "./dto/case.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { OcrService } from "../ocr/ocr.service";

@Controller("cases")
@UseGuards(JwtAuthGuard)
export class CaseController {
  constructor(
    private caseService: CaseService,
    private ocrService: OcrService
  ) {}

  @Get()
  findAll(
    @CurrentUser("tenantId") tenantId: string,
    @Query("status") status?: string,
    @Query("expenseRequestStatus") expenseRequestStatus?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.caseService.findAll(tenantId, {
      status,
      expenseRequestStatus,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get("stats")
  getStats(@CurrentUser("tenantId") tenantId: string) {
    return this.caseService.getStats(tenantId);
  }

  @Get("next-file-number")
  async getNextFileNumber(@CurrentUser("tenantId") tenantId: string) {
    const fileNumber = await this.caseService.getNextFileNumber(tenantId);
    return { fileNumber };
  }

  @Get(":id")
  findOne(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.caseService.findOne(tenantId, id);
  }

  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @Body() dto: CreateCaseDto) {
    return this.caseService.create(tenantId, dto);
  }

  @Put(":id")
  update(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCaseDto
  ) {
    return this.caseService.update(tenantId, id, dto);
  }

  @Delete(":id")
  delete(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.caseService.delete(tenantId, id);
  }

  @Patch(":id")
  patchFlags(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: Partial<UpdateCaseDto>
  ) {
    return this.caseService.patchFlags(tenantId, id, dto);
  }

  /**
   * Metin içeriğinden takip türü öner
   * POST /cases/suggest-type
   */
  @Post("suggest-type")
  suggestCaseType(@Body() body: { text: string }) {
    const result = this.ocrService.classifyDocument(body.text);
    return {
      success: true,
      suggestion: {
        caseType: result.detectedType,
        subCategory: result.detectedSubCategory,
        confidence: result.confidence,
        matchedKeywords: result.matchedKeywords,
        suggestedFormCode: result.suggestedFormCode,
        explanation: result.explanation,
      },
    };
  }

  /**
   * Toplu güncelleme (Batch Update)
   * POST /cases/batch-update
   */
  @Post("batch-update")
  async batchUpdate(
    @CurrentUser("tenantId") tenantId: string,
    @Body()
    body: {
      caseIds: string[];
      updates: {
        riskId?: string | null;
        durumEtiketiId?: string | null;
        sorumluPersonelId?: string | null;
        takipTuruId?: string | null;
        mahiyetTipiId?: string | null;
      };
    }
  ) {
    const result = await this.caseService.batchUpdate(
      tenantId,
      body.caseIds,
      body.updates
    );
    return { success: true, data: result };
  }

  /**
   * Eksik UYAP kodlarını düzelt
   * POST /cases/fix-uyap-codes
   */
  @Post("fix-uyap-codes")
  async fixUyapCodes(@CurrentUser("tenantId") tenantId: string) {
    const result = await this.caseService.fixMissingUyapCodes(tenantId);
    return { success: true, data: result };
  }

  /**
   * Dosya notları - GET /cases/:id/notes
   */
  @Get(":id/notes")
  async getNotes(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.caseService.getNotes(tenantId, id);
  }

  /**
   * Not ekle - POST /cases/:id/notes
   */
  @Post(":id/notes")
  async addNote(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() body: { content: string; isPrivate?: boolean }
  ) {
    return this.caseService.addNote(tenantId, id, userId, body.content, body.isPrivate);
  }

  /**
   * Not sil - DELETE /cases/:id/notes/:noteId
   */
  @Delete(":id/notes/:noteId")
  async deleteNote(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Param("noteId") noteId: string
  ) {
    return this.caseService.deleteNote(tenantId, id, noteId);
  }

  /**
   * Dosya zaman çizelgesi - GET /cases/:id/timeline
   */
  @Get(":id/timeline")
  async getTimeline(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.caseService.getTimeline(tenantId, id);
  }

  // ==================== TEBLİGAT TAKİP ====================

  /**
   * Dosyadaki borçluların tebligat durumlarını getir
   * GET /cases/:id/debtors/notifications
   */
  @Get(":id/debtors/notifications")
  async getCaseDebtorsWithNotification(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.caseService.getCaseDebtorsWithNotification(tenantId, id);
  }

  /**
   * Borçlu tebligat bilgisini güncelle
   * PATCH /cases/:id/debtors/:caseDebtorId/notification
   */
  @Patch(":id/debtors/:caseDebtorId/notification")
  async updateCaseDebtorNotification(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Param("caseDebtorId") caseDebtorId: string,
    @Body() body: {
      notificationBarcode?: string;
      notificationSentDate?: string;
      notificationDeliveredDate?: string;
      notificationStatus?: string;
      notificationNote?: string;
    }
  ) {
    return this.caseService.updateCaseDebtorNotification(tenantId, id, caseDebtorId, body);
  }

  // ==================== AVUKAT YÖNETİMİ ====================

  /**
   * Dosyadaki avukatları getir
   * GET /cases/:id/lawyers
   */
  @Get(":id/lawyers")
  async getCaseLawyers(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.caseService.getCaseLawyers(tenantId, id);
  }

  /**
   * Dosyaya avukat ekle
   * POST /cases/:id/lawyers
   */
  @Post(":id/lawyers")
  async addCaseLawyer(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: {
      lawyerId: string;
      role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
      canSign?: boolean;
    }
  ) {
    return this.caseService.addCaseLawyer(tenantId, id, body);
  }

  /**
   * Dosyadan avukat çıkar
   * DELETE /cases/:id/lawyers/:caseLawyerId
   */
  @Delete(":id/lawyers/:caseLawyerId")
  async removeCaseLawyer(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Param("caseLawyerId") caseLawyerId: string
  ) {
    return this.caseService.removeCaseLawyer(tenantId, id, caseLawyerId);
  }

  /**
   * Dosyadaki avukatın rol ve yetkilerini güncelle
   * PATCH /cases/:id/lawyers/:caseLawyerId
   */
  @Patch(":id/lawyers/:caseLawyerId")
  async updateCaseLawyer(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Param("caseLawyerId") caseLawyerId: string,
    @Body() body: {
      role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
      canSign?: boolean;
      hasSignatureAuthority?: boolean;
      isResponsible?: boolean;
      casePermissions?: {
        canEditCase?: boolean;
        canGenerateDocs?: boolean;
        canSyncUYAP?: boolean;
        canViewFinance?: boolean;
        canEditFinance?: boolean;
        canChangeStatus?: boolean;
        canEditParties?: boolean;
      };
      receiveNotifications?: boolean;
    }
  ) {
    return this.caseService.updateCaseLawyer(tenantId, id, caseLawyerId, body);
  }

  /**
   * Dosyadaki personelleri getir
   * GET /cases/:id/staff
   */
  @Get(":id/staff")
  async getCaseStaff(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.caseService.getCaseStaff(tenantId, id);
  }

  /**
   * Dosyaya personel ekle
   * POST /cases/:id/staff
   */
  @Post(":id/staff")
  async addCaseStaff(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: {
      staffMemberId: string;
      roleOnCase?: string;
    }
  ) {
    return this.caseService.addCaseStaff(tenantId, id, body);
  }

  /**
   * Dosyadan personel çıkar
   * DELETE /cases/:id/staff/:caseStaffId
   */
  @Delete(":id/staff/:caseStaffId")
  async removeCaseStaff(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Param("caseStaffId") caseStaffId: string
  ) {
    return this.caseService.removeCaseStaff(tenantId, id, caseStaffId);
  }
}
