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
  BadRequestException,
} from "@nestjs/common";
import { CaseService } from "./case.service";
import { CreateCaseDto, UpdateCaseDto } from "./dto/case.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { OcrService } from "../ocr/ocr.service";
import { ResponsibleCandidatesService } from "./responsible-candidates.service";
import { TemporalResponsibilityService } from "./temporal-responsibility.service";
import { ResponsibilityHistoryService, type HistoryEventType } from "./responsibility-history.service";
import { AssignResponsiblePersonDto } from "./dto/responsible-person.dto";
import { WarnOnlyAuditService } from "../permission-diagnostics/warn-only-audit.service";
import { PermissionHardGuardService } from "../permission-diagnostics/permission-hard-guard.service";
import { LegalResponsibleLawyerService } from "./legal-responsible-lawyer.service";
import { ChangeLegalResponsibleLawyerDto } from "./dto/legal-responsible-lawyer.dto";
import { GuidedOpenObserveService } from "../permission-diagnostics/guided-open-observe.service";
import { ActionCode } from "../policy-engine/types/action-code.enum";

@Controller("cases")
@UseGuards(JwtAuthGuard)
export class CaseController {
  constructor(
    private caseService: CaseService,
    private ocrService: OcrService,
    private responsibleCandidatesService: ResponsibleCandidatesService,
    private temporalResponsibilityService: TemporalResponsibilityService,
    private warnOnlyAudit: WarnOnlyAuditService,
    private permissionHardGuard: PermissionHardGuardService,
    private responsibilityHistoryService: ResponsibilityHistoryService,
    private legalResponsibleLawyerService: LegalResponsibleLawyerService,
    // P2b-1: Guided-Open observe adapter (diagnostic only; engelleme yok)
    private guidedOpenObserve: GuidedOpenObserveService
  ) {}

  @Get()
  findAll(
    @CurrentUser("tenantId") tenantId: string,
    @Query("status") status?: string,
    @Query("expenseRequestStatus") expenseRequestStatus?: string,
    @Query("clientId") clientId?: string,
    @Query("noOwner") noOwner?: string,
    @Query("legalResponsibleMissing") legalResponsibleMissing?: string,
    @Query("responsibleLawyerId") responsibleLawyerId?: string,
    @Query("responsibleStaffId") responsibleStaffId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.caseService.findAll(tenantId, {
      status,
      expenseRequestStatus,
      clientId,
      noOwner: noOwner === "1" || noOwner === "true",
      // WP-3a: LEGAL_RESPONSIBLE_MISSING warn/report filtresi (staff-owner + hukuki sorumlu yok).
      legalResponsibleMissing: legalResponsibleMissing === "1" || legalResponsibleMissing === "true",
      responsibleLawyerId,
      responsibleStaffId,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get("stats")
  getStats(@CurrentUser("tenantId") tenantId: string) {
    return this.caseService.getStats(tenantId);
  }

  // M2-G2: Dosya Sorumlusu picker kaynağı (aktif gerçek kişiler). İzole servise delege; { data } zarfı.
  @Get("responsible-candidates")
  async getResponsibleCandidates(@CurrentUser("tenantId") tenantId: string) {
    const data =
      await this.responsibleCandidatesService.getResponsibleCandidates(tenantId);
    return { data };
  }

  // M2-G3b: Dosyanın MEVCUT Dosya Sorumlusu (gerçek kişi); legacy sorumluPersonel fallback. İzole servis.
  @Get(":id/responsible-person")
  getCaseResponsiblePerson(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.responsibleCandidatesService.getCaseResponsiblePerson(
      tenantId,
      id
    );
  }

  // WP-1d-3: read-only combined temporal sorumluluk. "asOf tarihinde Dosya Operasyon Sorumlusu ve
  // Hukuki Sorumlu Avukat kimdi?" İki mevcut temporal service'i birleştirir; yeni reconstruction/mutation YOK.
  @Get(":id/responsibility-at")
  async getResponsibilityAt(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Query("asOf") asOf?: string
  ) {
    let asOfDate: Date;
    if (asOf === undefined || asOf === "") {
      asOfDate = new Date();
    } else {
      asOfDate = new Date(asOf);
      if (Number.isNaN(asOfDate.getTime())) {
        // Geçersiz asOf → mevcut error path korunur; warn-only event YAZILMAZ.
        throw new BadRequestException("Geçersiz asOf tarihi (ISO 8601 bekleniyor).");
      }
    }
    const result = await this.temporalResponsibilityService.getResponsibilityAt(tenantId, id, asOfDate);
    // WP-4d-1: Phase 2 warn-only — response AYNEN döner; ek olarak diagnostic audit (best-effort, block YOK).
    await this.warnOnlyAudit.recordWouldDeny("cases.responsibilityAt", {
      tenantId,
      actorUserId: userId,
      entityId: id,
      requestPath: "/cases/:id/responsibility-at",
    });
    return result;
  }

  // WP-1d-4c-1: Sorumluluk DEĞİŞİM geçmişi (timeline) — READ-ONLY. Mevcut responsibility-at (point-in-time) DEĞİŞMEZ.
  @Get(":id/responsibility-history")
  async getResponsibilityHistory(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("includeInferred") includeInferred?: string,
    @Query("type") type?: string
  ) {
    const fromDate = this.parseHistoryDate(from, "from");
    const toDate = this.parseHistoryDate(to, "to");
    const typeOpt: HistoryEventType | "all" =
      type === "operationOwner" || type === "legalResponsibleLawyer" ? type : "all";
    return this.responsibilityHistoryService.getResponsibilityHistory(tenantId, id, {
      from: fromDate,
      to: toDate,
      includeInferred: includeInferred === undefined ? true : includeInferred !== "false",
      type: typeOpt,
    });
  }

  private parseHistoryDate(value: string | undefined, label: string): Date | undefined {
    if (value === undefined || value === "") return undefined;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Geçersiz ${label} tarihi (ISO 8601 bekleniyor).`);
    }
    return d;
  }

  // M2-G3a: Dosya Sorumlusu (gerçek kişi) atama. İzole servise delege; case.service.ts'e dokunmadan.
  // WP-1a: userId (actor) servise geçer → owner-change audit "kim değiştirdi" alanını doldurur.
  @Patch(":id/responsible-person")
  assignResponsiblePerson(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: AssignResponsiblePersonDto
  ) {
    return this.responsibleCandidatesService.assignResponsiblePerson(
      tenantId,
      id,
      dto,
      userId
    );
  }

  // WP-1d-5-4: Hukuki Sorumlu Avukat KONTROLLÜ değişikliği (devir DEĞİL — kayıt kurallı değiştirilir).
  // ADMIN-only hard guard servis İÇİNDE; izole servise delege. CaseLawyer.isResponsible⇔role coupling +
  // tek CASE_LAWYER audit (changeType=LEGAL_RESPONSIBLE_LAWYER_CHANGED) → history EVENT_CONFIRMED. Sözleşme #473.
  // Operation owner / sorumluPersonelId / CaseStaff.roleOnCase / Task alanlarına DOKUNMAZ.
  @Patch(":id/legal-responsible-lawyer")
  async changeLegalResponsibleLawyer(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
    @Param("id") id: string,
    @Body() dto: ChangeLegalResponsibleLawyerDto
  ) {
    // P2b-1 observe (PRE-action; best-effort; engelleme YOK, response/akış değişmez)
    await this.guidedOpenObserve.observe({
      actorUserId: userId,
      tenantId,
      caseId: id,
      actionCode: ActionCode.ASSIGN_LEGAL_RESPONSIBLE,
    });
    const data = await this.legalResponsibleLawyerService.changeLegalResponsibleLawyer(
      tenantId,
      id,
      dto,
      userId,
      role
    );
    return { data };
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
  create(@CurrentUser("tenantId") tenantId: string, @CurrentUser("id") userId: string, @Body() dto: CreateCaseDto) {
    return this.caseService.create(tenantId, dto, userId);
  }

  @Put(":id")
  update(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCaseDto
  ) {
    return this.caseService.update(tenantId, id, dto, userId);
  }

  @Delete(":id")
  async delete(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
    @Param("id") id: string
  ) {
    // WP-4e-1: Phase 3 İLK hard guard (geçici ADMIN-only bridge). Non-ADMIN → 403 + PERMISSION_DENIED.
    // ADMIN ise success path mevcut silme davranışıyla AYNEN devam eder.
    await this.permissionHardGuard.assertBridgeAdmin("cases.delete", {
      tenantId,
      actorUserId: userId,
      role,
      entityId: id,
      requestPath: "/cases/:id",
    });
    // P2b-1 observe (best-effort; ADMIN guard'dan SONRA; engelleme YOK, response değişmez)
    await this.guidedOpenObserve.observe({
      actorUserId: userId,
      tenantId,
      caseId: id,
      actionCode: ActionCode.DELETE_CASE,
    });
    return this.caseService.delete(tenantId, id, userId);
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
    @CurrentUser("id") userId: string,
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
      body.updates,
      userId
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
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() body: {
      lawyerId: string;
      role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
      canSign?: boolean;
    }
  ) {
    return this.caseService.addCaseLawyer(tenantId, id, body, userId);
  }

  /**
   * Dosyadan avukat çıkar
   * DELETE /cases/:id/lawyers/:caseLawyerId
   */
  @Delete(":id/lawyers/:caseLawyerId")
  async removeCaseLawyer(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Param("caseLawyerId") caseLawyerId: string
  ) {
    return this.caseService.removeCaseLawyer(tenantId, id, caseLawyerId, userId);
  }

  /**
   * Dosyadaki avukatın rol ve yetkilerini güncelle
   * PATCH /cases/:id/lawyers/:caseLawyerId
   */
  @Patch(":id/lawyers/:caseLawyerId")
  async updateCaseLawyer(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
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
    return this.caseService.updateCaseLawyer(tenantId, id, caseLawyerId, body, userId);
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

  /**
   * Dosyadaki personelin bu-dosyaya özel rol/yetki/bildirim ayarlarını güncelle (ASSIGN-3a).
   * PATCH /cases/:id/staff/:caseStaffId
   * @remarks Çağıran: apps/web/.../cases/[id]/page.tsx (personel drawer "Bu dosya için kaydet").
   *   Body INLINE tip (class-DTO DEĞİL): global ValidationPipe forbidNonWhitelisted=true olduğu için
   *   class-DTO canSign/permissions'ı 400'lerdi → frontend kırılırdı. Inline tip + service-whitelist:
   *   yalnız CaseStaff alanları güncellenir; canSign/permissions (lawyer-kopyası, PR-ASSIGN-3b'de
   *   kaldırılacak) SESSİZCE yok sayılır → 3a tek başına 404'ü çözer, geçişte kırmaz.
   */
  @Patch(":id/staff/:caseStaffId")
  async updateCaseStaff(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Param("caseStaffId") caseStaffId: string,
    @Body() body: {
      roleOnCase?: string;
      canEdit?: boolean;
      canApprove?: boolean;
      canView?: boolean;
      receiveNotifications?: boolean;
      notes?: string;
    }
  ) {
    return this.caseService.updateCaseStaff(tenantId, id, caseStaffId, body, userId);
  }

  // ==================== ALACAK KALEMLERİ (DUES) ====================

  /**
   * Dosyanın alacak kalemlerini getir
   * GET /cases/:id/dues
   */
  @Get(":id/dues")
  async getCaseDues(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.caseService.getCaseDues(tenantId, id);
  }

  /**
   * Alacak kalemi ekle
   * POST /cases/:id/dues
   */
  @Post(":id/dues")
  async createDue(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: {
      type: string;
      description?: string;
      amount: number;
      dueDate: string;
      currency?: string;
      interestType?: string;
      interestRate?: number;
      interestStartDate?: string;
      interestEndDate?: string;
      sourceDocumentNo?: string;
      hasKdv?: boolean;
      kdvRate?: number;
      isPrimary?: boolean;
    }
  ) {
    return this.caseService.createDue(tenantId, id, body);
  }

  /**
   * Alacak kalemi güncelle
   * PATCH /cases/:id/dues/:dueId
   */
  @Patch(":id/dues/:dueId")
  async updateDue(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Param("dueId") dueId: string,
    @Body() body: {
      type?: string;
      description?: string;
      amount?: number;
      dueDate?: string;
      currency?: string;
      interestType?: string;
      interestRate?: number;
      interestStartDate?: string;
      interestEndDate?: string;
      sourceDocumentNo?: string;
      hasKdv?: boolean;
      kdvRate?: number;
      isFinalized?: boolean;
      finalizationDate?: string;
      finalizationNote?: string;
      sortOrder?: number;
      isPrimary?: boolean;
    }
  ) {
    return this.caseService.updateDue(tenantId, id, dueId, body);
  }

  /**
   * Alacak kalemi sil
   * DELETE /cases/:id/dues/:dueId
   */
  @Delete(":id/dues/:dueId")
  async deleteDue(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Param("dueId") dueId: string
  ) {
    return this.caseService.deleteDue(tenantId, id, dueId);
  }

  // ==================== TAHSİLATLAR (COLLECTIONS) ====================

  /**
   * Dosyanın tahsilatlarını getir
   * GET /cases/:id/collections
   */
  @Get(":id/collections")
  async getCaseCollections(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.caseService.getCaseCollections(tenantId, id);
  }

  /**
   * Tahsilat ekle
   * POST /cases/:id/collections
   */
  @Post(":id/collections")
  async createCollection(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() body: {
      caseDebtorId?: string;
      amount: number;
      currency?: string;
      type: string;
      channel: string;
      date: string;
      valueDate?: string;
      description?: string;
      receiptNo?: string;
      bankName?: string;
      accountNo?: string;
      notes?: string;
    }
  ) {
    return this.caseService.createCollection(tenantId, id, body, userId);
  }

  /**
   * Tahsilat güncelle
   * PATCH /cases/:id/collections/:collectionId
   */
  @Patch(":id/collections/:collectionId")
  async updateCollection(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Param("collectionId") collectionId: string,
    @Body() body: {
      amount?: number;
      type?: string;
      channel?: string;
      date?: string;
      valueDate?: string;
      description?: string;
      receiptNo?: string;
      bankName?: string;
      notes?: string;
      status?: string;
    }
  ) {
    return this.caseService.updateCollection(tenantId, id, collectionId, body);
  }

  /**
   * Tahsilat iptal et
   * POST /cases/:id/collections/:collectionId/cancel
   */
  @Post(":id/collections/:collectionId/cancel")
  async cancelCollection(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Param("collectionId") collectionId: string,
    @Body() body: { reason?: string }
  ) {
    return this.caseService.cancelCollection(tenantId, id, collectionId, body.reason);
  }

  /**
   * Tahsilat sil
   * DELETE /cases/:id/collections/:collectionId
   */
  @Delete(":id/collections/:collectionId")
  async deleteCollection(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Param("collectionId") collectionId: string
  ) {
    return this.caseService.deleteCollection(tenantId, id, collectionId);
  }

  /**
   * Dosya finans özeti
   * GET /cases/:id/finance-summary
   */
  @Get(":id/finance-summary")
  async getCaseFinanceSummary(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.caseService.getCaseFinanceSummary(tenantId, id);
  }

  /**
   * Hesap özeti (computed values from engines)
   * GET /cases/:id/calculation-summary
   * 
   * TEK KAYNAK PRENSİBİ:
   * - Faiz hesabı: interest-engine
   * - Masraf/harç: fee-engine
   * - Vekalet ücreti: fee-engine/attorney-fee
   * 
   * @see ARCHITECTURE.md - Source of Truth Matrix
   */
  @Get(":id/calculation-summary")
  async getCalculationSummary(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Query("date") date?: string
  ) {
    const calculationDate = date || new Date().toISOString().split('T')[0];
    return this.caseService.getCalculationSummary(tenantId, id, calculationDate);
  }
}
