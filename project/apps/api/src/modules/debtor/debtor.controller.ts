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
} from "@nestjs/common";
import { DebtorService } from "./debtor.service";
import {
  CreateDebtorDto,
  UpdateDebtorDto,
  CheckDuplicateDto,
  CreateDebtorAddressDto,
  UpdateDebtorAddressDto,
  CreateDebtorIntelligenceDto,
} from "./dto/debtor.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { DebtorCrossCaseNotificationService } from "./debtor-cross-case-notification.service";
import { CaseDebtorService } from "./case-debtor.service";
import { DebtorCrossCaseNotificationTaskLinkService } from "./debtor-cross-case-notification-task-link.service";

@Controller("debtors")
@UseGuards(JwtAuthGuard)
export class DebtorController {
  constructor(
    private debtorService: DebtorService,
    private crossCaseNotification: DebtorCrossCaseNotificationService,
    private caseDebtorService: CaseDebtorService,
    private taskLink: DebtorCrossCaseNotificationTaskLinkService
  ) {}

  // ==================== CASE DEBTORS (FAZ 1) ====================

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DebtorController.getDebtorsForCase() → GET /debtors/case/:caseId (operasyonel dosya borçlusu listesi)
  /// </remarks>
  @Get("case/:caseId")
  getDebtorsForCase(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Query("includePassive") includePassive?: string
  ) {
    return this.debtorService.getDebtorsForCase(
      tenantId,
      caseId,
      includePassive === "true"
    );
  }

  @Get("case/:caseId/:caseDebtorId")
  getCaseDebtorDetail(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Param("caseDebtorId") caseDebtorId: string
  ) {
    return this.debtorService.getCaseDebtorDetail(tenantId, caseId, caseDebtorId);
  }

  @Put("case/:caseId/:caseDebtorId/note")
  updateQuickNote(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("caseId") caseId: string,
    @Param("caseDebtorId") caseDebtorId: string,
    @Body("text") text: string
  ) {
    return this.debtorService.updateQuickNote(tenantId, caseId, caseDebtorId, userId, text);
  }

  // ==================== FAZ 2: TEBLİGAT YÖNETİMİ ====================

  @Put("case/:caseId/:caseDebtorId/service")
  updateServiceStatus(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("caseId") caseId: string,
    @Param("caseDebtorId") caseDebtorId: string,
    @Body() data: {
      status: string;
      channel?: string;
      trackingNo?: string;
      sentAt?: string;
      deliveredAt?: string;
      returnedAt?: string;
      returnReason?: string;
      note?: string;
      directEntry?: boolean;
    }
  ) {
    return this.debtorService.updateServiceStatus(
      tenantId,
      caseId,
      caseDebtorId,
      userId,
      data as any
    );
  }

  @Get("case/:caseId/:caseDebtorId/service/history")
  getServiceHistory(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Param("caseDebtorId") caseDebtorId: string
  ) {
    return this.debtorService.getServiceHistory(tenantId, caseId, caseDebtorId);
  }

  @Post("case/:caseId/:caseDebtorId/service/retry")
  startNewServiceAttempt(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("caseId") caseId: string,
    @Param("caseDebtorId") caseDebtorId: string,
    @Body("newAddressId") newAddressId?: string
  ) {
    return this.debtorService.startNewServiceAttempt(
      tenantId,
      caseId,
      caseDebtorId,
      userId,
      newAddressId
    );
  }

  // ==================== DEBTOR CRUD ====================

  @Get()
  findAll(
    @CurrentUser("tenantId") tenantId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("type") type?: string,
    @Query("riskLevel") riskLevel?: string,
    @Query("city") city?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string
  ) {
    return this.debtorService.findAll(tenantId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      type,
      riskLevel,
      city,
      sortBy,
      sortOrder,
    });
  }

  @Get("statistics")
  getStatistics(@CurrentUser("tenantId") tenantId: string) {
    return this.debtorService.getStatistics(tenantId);
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - (ileride) Ofis-içi "görülmemiş bildirimlerim" listesi → GET /debtors/cross-case-notifications
  ///   (DBND-D6A-2-SURFACE). tenantId/recipientUserId YALNIZ JWT'den (@CurrentUser) türetilir —
  ///   client bu ikisini query/body ile ASLA veremez. Statik route, :id route'undan ÖNCE
  ///   tanımlanmalı (aksi halde Nest bunu debtor id'si sanır).
  /// </remarks>
  @Get("cross-case-notifications")
  listCrossCaseNotifications(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") recipientUserId: string,
    @Query("status") status?: "PENDING" | "ACKNOWLEDGED" | "EXPIRED"
  ) {
    return this.crossCaseNotification.listForRecipient(tenantId, recipientUserId, status);
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - (ileride) "Gördüm" aksiyonu → POST /debtors/cross-case-notifications/:id/acknowledge
  ///   (DBND-D6A-2-SURFACE). Yalnız görüldü bilgisi — hukuki kabul/önlem/dosya işlemi anlamına
  ///   GELMEZ. tenantId/recipientUserId YALNIZ JWT'den türetilir; compare-and-set kendi
  ///   recipientUserId + tenantId + status=PENDING dışındaki kayıtları etkilemez.
  /// </remarks>
  @Post("cross-case-notifications/:id/acknowledge")
  acknowledgeCrossCaseNotification(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") recipientUserId: string,
    @Param("id") notificationId: string
  ) {
    return this.crossCaseNotification.acknowledge(tenantId, notificationId, recipientUserId);
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - (ileride) D6 bildirim ekranı / dosya-borçlu detay → GET /debtors/case-debtors/:caseDebtorId/active-process-summary
  ///   (DBND-D6-TEBLIGAT-BRIDGE; salt-okuma sinyal — D6A-2'ye YAZMA yapmaz, otomatik hukukî
  ///   hüküm ÜRETMEZ; yalnız "manuel hukukî inceleme önerilir" gözlemi). Statik route,
  ///   :id route'undan ÖNCE tanımlı (aksi halde Nest bunu debtor id'si sanır).
  /// </remarks>
  @Get("case-debtors/:caseDebtorId/active-process-summary")
  getCaseDebtorActiveProcessSummary(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseDebtorId") caseDebtorId: string
  ) {
    return this.caseDebtorService.getActiveProcessSummary(tenantId, caseDebtorId);
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - (ileride) "Görev oluştur" aksiyonu → POST /debtors/cross-case-notifications/:id/create-task
  ///   (DBND-D6-TASK-LINK; kullanıcı-tetikli, idempotent — D6A-2 çekirdeğine YAZMA yapmaz,
  ///   D6A-2-SURFACE DTO'suna dokunmaz). tenantId/recipientUserId YALNIZ JWT'den türetilir.
  /// </remarks>
  @Post("cross-case-notifications/:id/create-task")
  createTaskForCrossCaseNotification(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") recipientUserId: string,
    @Param("id") notificationId: string
  ) {
    return this.taskLink.createTaskForNotification(tenantId, notificationId, recipientUserId);
  }

  @Get(":id")
  findOne(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.debtorService.findOne(tenantId, id);
  }

  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreateDebtorDto
  ) {
    return this.debtorService.create(tenantId, dto, { userId });
  }

  @Put(":id")
  update(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateDebtorDto
  ) {
    return this.debtorService.update(tenantId, id, dto, { userId });
  }

  @Delete(":id")
  delete(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string
  ) {
    return this.debtorService.delete(tenantId, id, { userId });
  }

  // ==================== DUPLICATE CHECK ====================

  @Post("check-duplicate")
  checkDuplicate(
    @CurrentUser("tenantId") tenantId: string,
    @Body() dto: CheckDuplicateDto
  ) {
    return this.debtorService.checkDuplicate(tenantId, dto);
  }

  // ==================== ADDRESS MANAGEMENT ====================

  // ==================== INTELLIGENCE (PR-D4e-3a) ====================

  @Post(":id/intelligence")
  createIntelligence(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") debtorId: string,
    @Body() dto: CreateDebtorIntelligenceDto
  ) {
    return this.debtorService.createIntelligence(tenantId, debtorId, userId, dto);
  }

  @Post(":id/addresses")
  addAddress(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") debtorId: string,
    @Body() dto: CreateDebtorAddressDto
  ) {
    return this.debtorService.addAddress(tenantId, debtorId, dto);
  }

  @Put(":id/addresses/:addressId")
  updateAddress(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") debtorId: string,
    @Param("addressId") addressId: string,
    @Body() dto: UpdateDebtorAddressDto
  ) {
    return this.debtorService.updateAddress(tenantId, debtorId, addressId, dto, { userId });
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DebtorDetailDrawer (frontend) → GET /debtors/:id/cross-file-alerts (drawer açılışında
  ///   paylaşılan Debtor.id'nin başka aktif dosyada yakın zamanda güncellenip güncellenmediğini
  ///   kontrol eder; DBND-D6A-1 pull/MVP, push bildirim DEĞİL)
  /// </remarks>
  @Get(":id/cross-file-alerts")
  getCrossFileAlerts(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") debtorId: string,
    @Query("excludeCaseId") excludeCaseId?: string
  ) {
    return this.debtorService.getCrossFileDebtorAlerts(tenantId, debtorId, excludeCaseId);
  }

  @Delete(":id/addresses/:addressId")
  deleteAddress(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") debtorId: string,
    @Param("addressId") addressId: string
  ) {
    return this.debtorService.deleteAddress(tenantId, debtorId, addressId);
  }

  @Post(":id/addresses/:addressId/set-primary")
  setPrimaryAddress(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") debtorId: string,
    @Param("addressId") addressId: string
  ) {
    return this.debtorService.setPrimaryAddress(tenantId, debtorId, addressId);
  }
}
