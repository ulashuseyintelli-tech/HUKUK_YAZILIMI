import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Optional,
  UseGuards,
  Req,
} from "@nestjs/common";
import { CollectionService } from "./collection.service";
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  CancelCollectionDto,
} from "./dto/collection.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { getRequestId } from "../../common/request-id.middleware";
import {
  RECEIPT_AUTHORIZATION_SURFACES,
  ReceiptObjectScopeAuthorizationService,
} from "./receipt-object-scope-authorization.service";
import { CaseViewScoped, CaseViewScopedBy, CaseViewScopedByObject } from "../case/case-view-scope.guard";
import { CaseViewScopeService, requireCaseViewScope } from "../case/case-view-scope.service";

@Controller("collections")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class CollectionController {
  constructor(
    private collectionService: CollectionService,
    private receiptAuthorization: ReceiptObjectScopeAuthorizationService,
    @Optional() private caseViewScope?: CaseViewScopeService,
  ) {}

  // ==================== CRUD ====================

  /**
   * Yeni tahsilat oluştur
   * POST /collections
   */
  @Post()
  async create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreateCollectionDto,
    @Req() req: any,
  ) {
    const { confirmationToken, ...collectionDto } = dto;
    const authorization = await this.receiptAuthorization.authorize({
      tenantId,
      actorUserId: userId,
      caseId: collectionDto.caseId,
      surface: RECEIPT_AUTHORIZATION_SURFACES.COLLECTIONS,
      payload: collectionDto,
      confirmationToken,
    });
    if (authorization.kind === 'ENVELOPE') return authorization.envelope;

    return this.collectionService.create(tenantId, collectionDto as CreateCollectionDto, userId, {
      correlationId: getRequestId(req),
      producer: 'COLLECTION_PUBLIC_API',
      actor: { type: 'HUMAN', userId },
    });
  }

  /**
   * Tahsilat detayı getir
   * GET /collections/:id
   */
  @Get(":id")
  @CaseViewScopedByObject("collection", "id") // F02 P3 tarama S1: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  findById(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.collectionService.findById(tenantId, id);
  }

  /**
   * Dosya için tahsilatları getir
   * GET /collections/case/:caseId
   */
  @Get("case/:caseId")
  @CaseViewScoped() // F02 P3 tarama S1: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  findByCaseId(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string
  ) {
    return this.collectionService.findByCaseId(tenantId, caseId);
  }

  /**
   * Tahsilat güncelle
   * PUT /collections/:id
   */
  @Put(":id")
  update(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") actorUserId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCollectionDto,
    @Req() req: any,
  ) {
    return this.collectionService.update(tenantId, id, dto, actorUserId, {
      correlationId: getRequestId(req),
    });
  }

  /**
   * Tahsilat iptali için onay talebi oluştur
   * POST /collections/:id/cancel
   */
  @Post(":id/cancel")
  cancel(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") actorUserId: string,
    @Param("id") id: string,
    @Body() dto: CancelCollectionDto,
    @Req() req: any,
  ) {
    return this.collectionService.requestCancel(
      tenantId,
      id,
      dto,
      actorUserId,
      undefined,
      { correlationId: getRequestId(req) },
    );
  }

  // ==================== KAPAK HESABI ====================

  /**
   * Kapak hesabı (dosya borç özeti) getir
   * GET /collections/cover/:caseId
   */
  @Get("cover/:caseId")
  @CaseViewScoped() // F02 P3 tarama S1: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  calculateCover(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Query("date") date?: string
  ) {
    const calcDate = date ? new Date(date) : undefined;
    return this.collectionService.calculateCover(tenantId, caseId, calcDate);
  }

  // ==================== İSTATİSTİKLER ====================

  /**
   * Tahsilat özeti getir
   * GET /collections/summary
   */
  @Get("summary")
  @CaseViewScopedBy("query", "caseId", { optional: true }) // F02 P3 tarama S1: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  async getSummary(
    @CurrentUser("tenantId") tenantId: string,
    @Query("caseId") caseId?: string,
    @Query("currency") currency?: string,
    @CurrentUser("id") actorUserId?: string // sonda: mevcut konumsal çağrılar değişmez
  ) {
    // S1: dosya süzgeçsiz çağrıda toplam yalnız aktörün görebildiği dosyaların tahsilatlarından oluşur (dosya listesiyle aynı
    // kapsam). Dosya kimliği verilmişse kapı (dekoratör) doğrular.
    const caseFilter = caseId ? undefined : await requireCaseViewScope(this.caseViewScope)?.caseRowFilter(tenantId, actorUserId);
    return this.collectionService.getSummary(tenantId, caseId, currency, caseFilter);
  }

  /**
   * Dosya kapanış kontrolü
   * GET /collections/check-completion/:caseId
   */
  @Get("check-completion/:caseId")
  @CaseViewScoped() // F02 P3 tarama S1: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  checkCaseCompletion(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string
  ) {
    return this.collectionService.checkCaseCompletion(tenantId, caseId);
  }
}
