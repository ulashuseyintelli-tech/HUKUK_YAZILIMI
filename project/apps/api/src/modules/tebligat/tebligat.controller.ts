import {
  Controller,
  ForbiddenException,
  Get,
  Optional,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
import { ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { isCaseViewScopeEnabled } from "../case/case-view-scope";
import { CaseViewScoped, CaseViewScopedByObject } from "../case/case-view-scope.guard";
import { CaseViewScopeService } from "../case/case-view-scope.service";

// F02 P3 Tebligat (R12 Kabul A sonrası, 09.11.2026): dosyaya bağlı tebligat OKUMALARI D1 dosya görünüm kapsamına bağlanır
// (yeni kural / anahtar / bayrak YOK; CaseViewScopeService sözleşmesi aynen):
//  - dosya kimliği yolda → `@CaseViewScoped()` (GET case/:caseId, check-priority/:caseId);
//  - kendi kimliğiyle okunan → `@CaseViewScopedByObject` — dosya SUNUCUDAKİ satırdan çözülür (GET :id → tebligat;
//    GET case-debtor/:caseDebtorId → CaseDebtor);
//  - özet (`summary?caseId=`) → caseId verilirse dosya doğrulanır, verilmezse yalnız kapsamdaki dosyalar sayılır.
// Bayrak KAPALI → ek sorgu yok, davranış bugünküyle aynı. Kapsam dışı = var olmayan: AYNI 404 gövdesi.
// Kapsam dışı bırakılanlar: yazım uçları (değişmez); dış sistem sorguları (ptt-track, uets-check, uets-status,
// electronic-channel — DB okumaz); `pending-actions` (bugün `:id` gölgesinde 404; erişilebilir KILINMADI).

// F02-D-2 dilim 3 (owner "Burada başla" + ek talimat 30.10.2026): VIEWER tebligat oluşturamaz / güncelleyemez / gönderildi işaretleyemez, PTT ve elektronik sonuç yazamaz,
// MERNİS tebligatı açamaz, UETS/KEP ile GÖNDEREMEZ, toplu PTT sorgusu tetikleyemez (dış sistem). Ölçülen boşluk: yalnız JWT;
// TebligatService / UetsService / PttTrackingService rol sormuyor. Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard`
// (JwtAuthGuard'dan SONRA). Okuma uçları (liste, detay, takip, UETS kayıt kontrolü) DEĞİŞMEZ.
@Controller("tebligat")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class TebligatController {
  constructor(
    private tebligatService: TebligatService,
    private pttTrackingService: PttTrackingService,
    private uetsService: UetsService,
    @Optional() private readonly caseViewScope?: CaseViewScopeService,
  ) {}

  /**
   * F02 P3: bayrak açıkken satırların DOSYASI için süzgeç (dosya kiracısı belirleyici + D1 kapsamı; ALLOW → yalnız kiracı).
   * Bayrak kapalı → undefined (ek sorgu yok). Bayrak açık + servis yok → 403 (fail-closed; CaseViewScopeGuard emsali).
   */
  private async caseRowFilter(tenantId: string, actorUserId: string): Promise<Prisma.CaseWhereInput | undefined> {
    if (!isCaseViewScopeEnabled()) return undefined;
    if (!this.caseViewScope) {
      throw new ForbiddenException({ code: "CASE_VIEW_SCOPE_UNRESOLVED", message: "Dosya görünüm kapsamı çözümlenemedi" });
    }
    const scope = await this.caseViewScope.scopeWhere(tenantId, actorUserId);
    return { tenantId, ...(scope ? { AND: [scope] } : {}) };
  }

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
   * Tebligat özeti getir
   * GET /tebligat/summary
   *
   * R12 Kabul A (09.11.2026): Express rotaları TANIM SIRASIYLA eşler. Bu uç `:id`'den SONRA
   * tanımlıyken `GET /tebligat/summary` → findById("summary") → 404 "Tebligat bulunamadı"
   * dönüyordu (dosya Tebligat paneli meşru boş durumda bile hata bandı gösteriyordu).
   * Bu yüzden `:id`'den ÖNCE durur. Kapı DEĞİŞMEDİ: sınıf düzeyi JwtAuthGuard +
   * ViewerWriteDenyGuard, kiracı JWT'den (`@CurrentUser("tenantId")`).
   *
   * F02 P3: bayrak açıkken `caseId` verilirse dosya kiracı + kapsamla doğrulanır (kapsam dışı / yok → AYNI 404
   * "Dosya bulunamadı"); verilmezse yalnız aktörün kapsamındaki dosyaların tebligatları sayılır (liste ile tutarlı).
   */
  @Get("summary")
  async getSummary(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") actorUserId: string,
    @Query("caseId") caseId?: string
  ) {
    if (caseId && isCaseViewScopeEnabled()) {
      if (!this.caseViewScope) {
        throw new ForbiddenException({ code: "CASE_VIEW_SCOPE_UNRESOLVED", message: "Dosya görünüm kapsamı çözümlenemedi" });
      }
      await this.caseViewScope.assertCaseVisible(tenantId, actorUserId, caseId);
      return this.tebligatService.getSummary(tenantId, caseId);
    }
    const caseFilter = await this.caseRowFilter(tenantId, actorUserId);
    // Bayrak kapalı → çağrı bugünküyle birebir aynı (ek argüman yok).
    return caseFilter ? this.tebligatService.getSummary(tenantId, caseId, caseFilter) : this.tebligatService.getSummary(tenantId, caseId);
  }

  /**
   * Tebligat detayı getir
   * GET /tebligat/:id
   */
  @CaseViewScopedByObject("tebligat", "id") // F02 P3: dosya tebligat satırından çözülür (bayrak açıkken; kapsam dışı / yok aynı 404)
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
  @CaseViewScoped() // F02 P3: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
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
   *
   * F02 P3: dosya CaseDebtor satırından çözülür (kapsam dışı / yok → "Dosya bulunamadı"; servis bulunamadı vermez).
   * Tebligat.caseId ile CaseDebtor.caseId arasında DB kısıtı yok → bayrak açıkken satırlar KENDİ dosyalarının
   * kiracı + kapsamıyla da süzülür (detay ucuyla tutarlı).
   */
  @CaseViewScopedByObject("caseDebtor", "caseDebtorId")
  @Get("case-debtor/:caseDebtorId")
  async findByCaseDebtorId(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") actorUserId: string,
    @Param("caseDebtorId") caseDebtorId: string
  ) {
    const caseFilter = await this.caseRowFilter(tenantId, actorUserId);
    return caseFilter
      ? this.tebligatService.findByCaseDebtorId(tenantId, caseDebtorId, caseFilter)
      : this.tebligatService.findByCaseDebtorId(tenantId, caseDebtorId); // bayrak kapalı → bugünkü çağrı
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
    @CurrentUser("id") actorUserId: string,
    @Param("id") id: string,
    @Body() dto: RecordPttResultDto
  ) {
    return this.tebligatService.recordPttResult(tenantId, id, dto, actorUserId);
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
   *
   * F02 P3: önceki tebligat sonuçlarını OKUR (servis `tenantId + caseId [+ caseDebtorId]` ile süzer) → dosya kapsamı.
   */
  @CaseViewScoped() // F02 P3: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
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
  // (`GET /tebligat/summary` yukarıda, `:id`'den önce tanımlı — bkz. getSummary.)

  /**
   * Bekleyen işlemleri getir
   * GET /tebligat/pending-actions
   *
   * NOT (R12 Kabul A, 09.11.2026): bu uç hâlâ `:id`'den SONRA → bugün findById'ye düşer (404).
   * Web'de çağıranı yok; erişilebilir kılmak kiracı geneli liste açtığı için ayrı karardır, burada değiştirilmedi.
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
