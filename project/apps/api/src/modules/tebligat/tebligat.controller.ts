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
import { PttTrackingService } from "./ptt-tracking.service";
import { UetsService, UetsSendRequest } from "./uets.service";
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
  constructor(
    private tebligatService: TebligatService,
    private pttTrackingService: PttTrackingService,
    private uetsService: UetsService,
  ) {}

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

  /**
   * PR-S1: UETS/KEP elektronik tebligat sonucunu sorgulayıp kanonik duruma akıt.
   * Tebligat.status + CaseDebtor.serviceStatus senkronu + istihbarat tetiği (atomik).
   * POST /tebligat/:id/electronic-result
   */
  @Post(":id/electronic-result")
  recordElectronicResult(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.tebligatService.recordElectronicResult(tenantId, id);
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

  // ==================== PTT BARKOD SORGULAMA ====================

  /**
   * PTT barkod sorgula
   * GET /tebligat/ptt-track/:barcodeNo
   */
  @Get("ptt-track/:barcodeNo")
  trackPttBarcode(@Param("barcodeNo") barcodeNo: string) {
    return this.pttTrackingService.trackBarcode(barcodeNo);
  }

  /**
   * Toplu PTT barkod sorgula
   * POST /tebligat/ptt-track-bulk
   */
  @Post("ptt-track-bulk")
  async trackPttBarcodesBulk(@Body() body: { barcodeNos: string[] }) {
    const results = await this.pttTrackingService.trackMultipleBarcodes(body.barcodeNos);
    return Object.fromEntries(results);
  }

  // ==================== UETS/KEP ====================

  /**
   * Alicinin UETS/KEP kayitli olup olmadigini kontrol et
   * GET /tebligat/uets-check/:tcVkn
   */
  @Get("uets-check/:tcVkn")
  checkUetsRegistration(@Param("tcVkn") tcVkn: string) {
    return this.uetsService.checkRecipientRegistration(tcVkn);
  }

  /**
   * UETS ile tebligat gonder
   * POST /tebligat/:id/send-uets
   */
  @Post(":id/send-uets")
  async sendViaUets(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: { subject: string; content: string }
  ) {
    const tebligat = await this.tebligatService.findById(tenantId, id);
    
    const request: UetsSendRequest = {
      tebligatId: id,
      recipientTcVkn: tebligat.recipientTcVkn,
      recipientName: tebligat.recipientName,
      subject: body.subject,
      content: body.content,
    };

    return this.uetsService.sendViaUets(request);
  }

  /**
   * KEP ile tebligat gonder
   * POST /tebligat/:id/send-kep
   */
  @Post(":id/send-kep")
  async sendViaKep(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: { subject: string; content: string }
  ) {
    const tebligat = await this.tebligatService.findById(tenantId, id);
    
    const request: UetsSendRequest = {
      tebligatId: id,
      recipientTcVkn: tebligat.recipientTcVkn,
      recipientName: tebligat.recipientName,
      subject: body.subject,
      content: body.content,
    };

    return this.uetsService.sendViaKep(request);
  }

  /**
   * UETS/KEP teslim durumunu sorgula
   * GET /tebligat/uets-status/:uetsNo
   */
  @Get("uets-status/:uetsNo")
  checkUetsDeliveryStatus(@Param("uetsNo") uetsNo: string) {
    return this.uetsService.checkDeliveryStatus(uetsNo);
  }

  /**
   * Elektronik tebligat icin en uygun kanali belirle
   * GET /tebligat/electronic-channel/:tcVkn
   */
  @Get("electronic-channel/:tcVkn")
  determineElectronicChannel(@Param("tcVkn") tcVkn: string) {
    return this.uetsService.determineElectronicChannel(tcVkn);
  }
}
