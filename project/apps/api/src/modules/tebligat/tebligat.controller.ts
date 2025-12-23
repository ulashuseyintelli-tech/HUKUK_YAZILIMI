import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { TebligatService } from "./tebligat.service";
import {
  CreateTebligatDto,
  RecordPttResultDto,
  UpdateTebligatDto,
  TebligatAddressType,
} from "./dto/tebligat.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("tebligat")
@UseGuards(JwtAuthGuard)
export class TebligatController {
  constructor(private tebligatService: TebligatService) {}

  // ==================== CRUD ====================

  /**
   * Yeni tebligat oluştur
   * POST /tebligat
   */
  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @Body() dto: CreateTebligatDto
  ) {
    return this.tebligatService.create(tenantId, dto);
  }

  /**
   * Tebligat detayı getir
   * GET /tebligat/:id
   */
  @Get(":id")
  findById(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.tebligatService.findById(tenantId, id);
  }

  /**
   * Dosya için tebligatları getir
   * GET /tebligat/case/:caseId
   */
  @Get("case/:caseId")
  findByCaseId(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string
  ) {
    return this.tebligatService.findByCaseId(tenantId, caseId);
  }

  /**
   * Borçlu için tebligatları getir
   * GET /tebligat/case-debtor/:caseDebtorId
   */
  @Get("case-debtor/:caseDebtorId")
  findByCaseDebtorId(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseDebtorId") caseDebtorId: string
  ) {
    return this.tebligatService.findByCaseDebtorId(tenantId, caseDebtorId);
  }

  /**
   * Tebligat güncelle
   * PUT /tebligat/:id
   */
  @Put(":id")
  update(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateTebligatDto
  ) {
    return this.tebligatService.update(tenantId, id, dto);
  }

  /**
   * Tebligatı gönderildi olarak işaretle
   * POST /tebligat/:id/send
   */
  @Post(":id/send")
  markAsSent(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: { barcodeNo?: string }
  ) {
    return this.tebligatService.markAsSent(tenantId, id, body.barcodeNo);
  }

  // ==================== PTT SONUCU ====================

  /**
   * PTT sonucunu kaydet
   * POST /tebligat/:id/ptt-result
   */
  @Post(":id/ptt-result")
  recordPttResult(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: RecordPttResultDto
  ) {
    return this.tebligatService.recordPttResult(tenantId, id, dto);
  }

  // ==================== ADRES ÖNCELİK KONTROLÜ ====================

  /**
   * Adres öncelik kurallarını kontrol et
   * GET /tebligat/check-priority/:caseId
   */
  @Get("check-priority/:caseId")
  checkAddressPriority(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Query("caseDebtorId") caseDebtorId?: string,
    @Query("addressType") addressType?: TebligatAddressType
  ) {
    return this.tebligatService.checkAddressPriority(
      tenantId,
      caseId,
      caseDebtorId,
      addressType
    );
  }

  // ==================== OTOMATİK MERNİS ====================

  /**
   * Başarısız tebligat için MERNİS tebligatı oluştur
   * POST /tebligat/:id/create-mernis
   */
  @Post(":id/create-mernis")
  createMernisTebligat(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: { mernisAddress: string }
  ) {
    return this.tebligatService.createMernisTebligat(tenantId, id, body.mernisAddress);
  }

  // ==================== İSTATİSTİKLER ====================

  /**
   * Tebligat özeti getir
   * GET /tebligat/summary
   */
  @Get("summary")
  getSummary(
    @CurrentUser("tenantId") tenantId: string,
    @Query("caseId") caseId?: string
  ) {
    return this.tebligatService.getSummary(tenantId, caseId);
  }

  /**
   * Bekleyen işlemleri getir
   * GET /tebligat/pending-actions
   */
  @Get("pending-actions")
  getPendingActions(@CurrentUser("tenantId") tenantId: string) {
    return this.tebligatService.getPendingActions(tenantId);
  }
}
