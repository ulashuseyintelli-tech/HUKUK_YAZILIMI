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
import { CollectionService } from "./collection.service";
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  CancelCollectionDto,
} from "./dto/collection.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("collections")
@UseGuards(JwtAuthGuard)
export class CollectionController {
  constructor(private collectionService: CollectionService) {}

  // ==================== CRUD ====================

  /**
   * Yeni tahsilat oluştur
   * POST /collections
   */
  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreateCollectionDto
  ) {
    return this.collectionService.create(tenantId, dto, userId);
  }

  /**
   * Tahsilat detayı getir
   * GET /collections/:id
   */
  @Get(":id")
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
    @Param("id") id: string,
    @Body() dto: UpdateCollectionDto
  ) {
    return this.collectionService.update(tenantId, id, dto);
  }

  /**
   * Tahsilat iptal et
   * POST /collections/:id/cancel
   */
  @Post(":id/cancel")
  cancel(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: CancelCollectionDto
  ) {
    return this.collectionService.cancel(tenantId, id, dto);
  }

  // ==================== KAPAK HESABI ====================

  /**
   * Kapak hesabı (dosya borç özeti) getir
   * GET /collections/cover/:caseId
   */
  @Get("cover/:caseId")
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
  getSummary(
    @CurrentUser("tenantId") tenantId: string,
    @Query("caseId") caseId?: string
  ) {
    return this.collectionService.getSummary(tenantId, caseId);
  }

  /**
   * Dosya kapanış kontrolü
   * GET /collections/check-completion/:caseId
   */
  @Get("check-completion/:caseId")
  checkCaseCompletion(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string
  ) {
    return this.collectionService.checkCaseCompletion(tenantId, caseId);
  }
}
