import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssetQueryService } from './asset-query.service';
import { RunAssetQueriesDTO, UpdateAssetQueryResultDTO } from './dto/asset-query.dto';

@Controller('asset-queries')
@UseGuards(JwtAuthGuard)
export class AssetQueryController {
  constructor(private readonly assetQueryService: AssetQueryService) {}

  // ==================== RUN QUERIES ====================

  /**
   * POST /asset-queries/debtor/:caseDebtorId/run
   * Start asset queries for a debtor
   */
  @Post('debtor/:caseDebtorId/run')
  async runQueries(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string,
    @Body() dto: RunAssetQueriesDTO
  ) {
    return this.assetQueryService.runQueries(
      req.user.tenantId,
      caseDebtorId,
      req.user.userId,
      dto
    );
  }

  // ==================== GET QUERIES ====================

  /**
   * GET /asset-queries/debtor/:caseDebtorId
   * Get all asset queries for a debtor
   */
  @Get('debtor/:caseDebtorId')
  async getQueriesForDebtor(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string
  ) {
    return this.assetQueryService.getQueriesForDebtor(
      req.user.tenantId,
      caseDebtorId
    );
  }

  /**
   * GET /asset-queries/:queryId
   * Get a single query by ID
   */
  @Get(':queryId')
  async getQueryById(
    @Request() req: any,
    @Param('queryId') queryId: string
  ) {
    return this.assetQueryService.getQueryById(req.user.tenantId, queryId);
  }

  // ==================== UPDATE QUERY ====================

  /**
   * PUT /asset-queries/:queryId/result
   * Update query result (typically called by background job)
   */
  @Put(':queryId/result')
  async updateQueryResult(
    @Request() req: any,
    @Param('queryId') queryId: string,
    @Body() dto: UpdateAssetQueryResultDTO
  ) {
    return this.assetQueryService.updateQueryResult(
      req.user.tenantId,
      queryId,
      dto
    );
  }

  /**
   * PUT /asset-queries/:queryId/processing
   * Mark query as processing
   */
  @Put(':queryId/processing')
  async markAsProcessing(
    @Request() req: any,
    @Param('queryId') queryId: string
  ) {
    await this.assetQueryService.markAsProcessing(req.user.tenantId, queryId);
    return { success: true };
  }

  /**
   * DELETE /asset-queries/:queryId
   * Cancel a queued query
   */
  @Delete(':queryId')
  async cancelQuery(
    @Request() req: any,
    @Param('queryId') queryId: string
  ) {
    await this.assetQueryService.cancelQuery(req.user.tenantId, queryId);
    return { success: true };
  }

  // ==================== ASSET SUMMARY ====================

  /**
   * GET /asset-queries/debtor/:caseDebtorId/summary
   * Get asset summary for a debtor
   */
  @Get('debtor/:caseDebtorId/summary')
  async getAssetSummary(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string
  ) {
    return this.assetQueryService.getAssetSummary(
      req.user.tenantId,
      caseDebtorId
    );
  }
}
