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

@Controller("debtors")
@UseGuards(JwtAuthGuard)
export class DebtorController {
  constructor(private debtorService: DebtorService) {}

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

  @Get(":id")
  findOne(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.debtorService.findOne(tenantId, id);
  }

  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @Body() dto: CreateDebtorDto) {
    return this.debtorService.create(tenantId, dto);
  }

  @Put(":id")
  update(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateDebtorDto
  ) {
    return this.debtorService.update(tenantId, id, dto);
  }

  @Delete(":id")
  delete(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.debtorService.delete(tenantId, id);
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
    @Param("id") debtorId: string,
    @Param("addressId") addressId: string,
    @Body() dto: UpdateDebtorAddressDto
  ) {
    return this.debtorService.updateAddress(tenantId, debtorId, addressId, dto);
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
