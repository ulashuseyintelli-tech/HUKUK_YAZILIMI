import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetQueryType, AssetQueryJobStatus, AssetQueryStatus } from '@prisma/client';
import { AssetQueryDTO, AssetSummaryDTO, RunAssetQueriesDTO, UpdateAssetQueryResultDTO } from './dto/asset-query.dto';

@Injectable()
export class AssetQueryService {
  constructor(private prisma: PrismaService) {}

  // ==================== RUN QUERIES ====================

  /**
   * Start asset queries for a debtor
   * Creates query records and returns job info
   */
  async runQueries(
    tenantId: string,
    caseDebtorId: string,
    userId: string,
    dto: RunAssetQueriesDTO
  ): Promise<{ jobId: string; queries: AssetQueryDTO[] }> {
    // Verify caseDebtor exists and belongs to tenant
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId },
      include: { case: true },
    });

    if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
      throw new NotFoundException('Borçlu bulunamadı');
    }

    // Check idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.assetQuery.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Bu sorgu zaten başlatılmış',
          existingQueryId: existing.id,
        });
      }
    }

    // Check rate limit (max 5 queries per debtor per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentQueries = await this.prisma.assetQuery.count({
      where: {
        caseDebtorId,
        requestedAt: { gte: oneHourAgo },
      },
    });

    if (recentQueries >= 5) {
      throw new BadRequestException({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Bu borçlu için saatte en fazla 5 sorgu yapılabilir',
      });
    }

    // Create query records
    const queries = await Promise.all(
      dto.types.map(async (queryType, index) => {
        return this.prisma.assetQuery.create({
          data: {
            tenantId,
            caseDebtorId,
            queryType,
            status: 'QUEUED',
            reason: dto.reason,
            requestedBy: userId,
            idempotencyKey: dto.idempotencyKey 
              ? `${dto.idempotencyKey}_${queryType}` 
              : undefined,
          },
          include: {
            requestedByUser: { select: { name: true, surname: true } },
          },
        });
      })
    );

    // Generate a pseudo job ID (first query's ID)
    const jobId = queries[0].id;

    return {
      jobId,
      queries: queries.map(q => this.mapToDTO(q)),
    };
  }

  // ==================== GET QUERIES ====================

  /**
   * Get all asset queries for a debtor
   */
  async getQueriesForDebtor(
    tenantId: string,
    caseDebtorId: string
  ): Promise<AssetQueryDTO[]> {
    const queries = await this.prisma.assetQuery.findMany({
      where: { tenantId, caseDebtorId },
      include: {
        requestedByUser: { select: { name: true, surname: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return queries.map(q => this.mapToDTO(q));
  }

  /**
   * Get a single query by ID
   */
  async getQueryById(
    tenantId: string,
    queryId: string
  ): Promise<AssetQueryDTO> {
    const query = await this.prisma.assetQuery.findFirst({
      where: { id: queryId, tenantId },
      include: {
        requestedByUser: { select: { name: true, surname: true } },
      },
    });

    if (!query) {
      throw new NotFoundException('Sorgu bulunamadı');
    }

    return this.mapToDTO(query);
  }

  // ==================== UPDATE QUERY RESULT ====================

  /**
   * Update query result (called when query completes)
   * This would typically be called by a background job or webhook
   */
  async updateQueryResult(
    tenantId: string,
    queryId: string,
    dto: UpdateAssetQueryResultDTO
  ): Promise<AssetQueryDTO> {
    const query = await this.prisma.assetQuery.findFirst({
      where: { id: queryId, tenantId },
    });

    if (!query) {
      throw new NotFoundException('Sorgu bulunamadı');
    }

    // Update query
    const updated = await this.prisma.assetQuery.update({
      where: { id: queryId },
      data: {
        status: dto.result === 'ERROR' ? 'FAILED' : 'COMPLETED',
        result: dto.result,
        resultData: dto.resultData || undefined,
        errorMessage: dto.errorMessage,
        completedAt: new Date(),
      },
      include: {
        requestedByUser: { select: { name: true, surname: true } },
      },
    });

    // Update CaseDebtor asset fields
    await this.updateCaseDebtorAssets(query.caseDebtorId, query.queryType, dto.result);

    return this.mapToDTO(updated);
  }

  /**
   * Mark query as processing
   */
  async markAsProcessing(tenantId: string, queryId: string): Promise<void> {
    await this.prisma.assetQuery.updateMany({
      where: { id: queryId, tenantId, status: 'QUEUED' },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });
  }

  /**
   * Cancel a queued query
   */
  async cancelQuery(tenantId: string, queryId: string): Promise<void> {
    const result = await this.prisma.assetQuery.updateMany({
      where: { id: queryId, tenantId, status: 'QUEUED' },
      data: { status: 'CANCELLED' },
    });

    if (result.count === 0) {
      throw new BadRequestException('Sadece kuyruktaki sorgular iptal edilebilir');
    }
  }

  // ==================== ASSET SUMMARY ====================

  /**
   * Get asset summary for a debtor
   */
  async getAssetSummary(
    tenantId: string,
    caseDebtorId: string
  ): Promise<AssetSummaryDTO> {
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId },
      include: { case: true },
    });

    if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
      throw new NotFoundException('Borçlu bulunamadı');
    }

    // Count pending queries
    const pendingQueries = await this.prisma.assetQuery.count({
      where: {
        caseDebtorId,
        status: { in: ['QUEUED', 'PROCESSING'] },
      },
    });

    return {
      vehicle: caseDebtor.assetVehicle as AssetQueryStatus,
      realEstate: caseDebtor.assetRealEstate as AssetQueryStatus,
      bank: caseDebtor.assetBank as AssetQueryStatus,
      sgkWage: caseDebtor.assetSgkWage as AssetQueryStatus,
      lastQueryAt: caseDebtor.assetLastQueryAt?.toISOString() || null,
      pendingQueries,
    };
  }

  // ==================== HELPERS ====================

  private async updateCaseDebtorAssets(
    caseDebtorId: string,
    queryType: AssetQueryType,
    result: AssetQueryStatus
  ): Promise<void> {
    const fieldMap: Partial<Record<AssetQueryType, string>> = {
      VEHICLE: 'assetVehicle',
      REAL_ESTATE: 'assetRealEstate',
      BANK: 'assetBank',
      SGK_WAGE: 'assetSgkWage',
      // Other query types don't have dedicated fields on CaseDebtor
    };

    const field = fieldMap[queryType];
    if (!field) return;

    await this.prisma.caseDebtor.update({
      where: { id: caseDebtorId },
      data: {
        [field]: result,
        assetLastQueryAt: new Date(),
      },
    });
  }

  private mapToDTO(query: any): AssetQueryDTO {
    return {
      id: query.id,
      queryType: query.queryType,
      status: query.status,
      result: query.result,
      resultData: query.resultData as Record<string, any> | null,
      errorMessage: query.errorMessage,
      reason: query.reason,
      requestedAt: query.requestedAt.toISOString(),
      requestedBy: query.requestedBy,
      requestedByName: query.requestedByUser 
        ? `${query.requestedByUser.name} ${query.requestedByUser.surname}`
        : 'Bilinmiyor',
      startedAt: query.startedAt?.toISOString() || null,
      completedAt: query.completedAt?.toISOString() || null,
    };
  }
}
