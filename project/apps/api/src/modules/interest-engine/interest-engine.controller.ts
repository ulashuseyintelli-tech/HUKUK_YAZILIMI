/**
 * Task 17.4 - Interest Engine Controller
 * 
 * POST /interest-engine/calculate
 * POST /interest-engine/preview  ← YENİ: Lightweight preview (no audit)
 * GET /interest-engine/records/:id
 * GET /interest-engine/trace/:id
 */

import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InterestEngineService } from './interest-engine.service';
import { AuditWriterService } from './audit/audit-writer.service';
import { TraceExporterService } from './trace/trace-exporter.service';
import { InterestEngineMetricsService } from './metrics/interest-engine-metrics.service';
import { CalculationRequest, CalculationResult } from './types/calculation.types';
import { RateEntry } from './rates/rate-entry.entity';
import { CalculationMode } from './types/common.types';
import { InterestTypeCode } from './types/domain.types';

// ═══════════════════════════════════════════════════════════════════════════
// DTOs
// ═══════════════════════════════════════════════════════════════════════════

export interface CalculateRequestDto {
  request: CalculationRequest;
  rates: RateEntry[];
  tenantId: string;
  userId?: string;
}

export interface CalculateResponseDto {
  success: boolean;
  result?: CalculationResult;
  error?: {
    code: string;
    message: string;
    evidence?: Record<string, unknown>;
  };
  metrics?: {
    durationMs: number;
    segmentCount: number;
  };
}

/**
 * Preview Request DTO - Lightweight hesaplama için
 * Audit log tutulmaz, cache'lenir
 */
export interface PreviewRequestDto {
  principalAmount: number;
  currency?: string;
  interestType: InterestTypeCode;
  startDate: string;
  endDate: string;
  fixedRate?: number;
  tenantId?: string;
}

export interface PreviewResponseDto {
  success: boolean;
  data?: {
    estimatedInterest: number;
    currentRate: number;
    days: number;
    interestType: InterestTypeCode;
  };
  error?: {
    code: 'RATE_NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'INVALID_INPUT' | 'INVALID_DATE_RANGE';
    message: string;
  };
  cached: boolean;
  cacheExpiry?: string;
}

export interface RecordQueryDto {
  caseId?: string;
  mode?: CalculationMode;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

@Controller('interest-engine')
export class InterestEngineController {
  constructor(
    private readonly interestEngine: InterestEngineService,
    private readonly auditWriter: AuditWriterService,
    private readonly traceExporter: TraceExporterService,
    private readonly metrics: InterestEngineMetricsService,
  ) {}

  /**
   * POST /interest-engine/calculate
   * 
   * Main calculation endpoint
   */
  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  async calculate(@Body() dto: CalculateRequestDto): Promise<CalculateResponseDto> {
    const startTime = Date.now();

    try {
      // Validate request
      if (!dto.request) {
        throw new BadRequestException('request is required');
      }
      if (!dto.rates || dto.rates.length === 0) {
        throw new BadRequestException('rates are required');
      }
      if (!dto.tenantId) {
        throw new BadRequestException('tenantId is required');
      }

      // Execute calculation
      const result = await this.interestEngine.calculate(
        dto.request,
        dto.rates,
        dto.tenantId,
        dto.userId,
      );

      const durationMs = Date.now() - startTime;

      // Record metrics
      this.metrics.recordCalculation(
        dto.request.mode,
        durationMs,
        result.segments.length,
        true,
        dto.tenantId,
      );

      return {
        success: true,
        result,
        metrics: {
          durationMs,
          segmentCount: result.segments.length,
        },
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const err = error as { code?: string; message?: string; evidence?: Record<string, unknown> };

      // Record metrics
      this.metrics.recordCalculation(
        dto.request?.mode || CalculationMode.PREVIEW,
        durationMs,
        0,
        false,
        dto.tenantId || 'unknown',
      );

      if (err.code) {
        this.metrics.recordPolicyBlock(err.code, dto.request?.mode || CalculationMode.PREVIEW, dto.tenantId || 'unknown');
      }

      return {
        success: false,
        error: {
          code: err.code || 'UNKNOWN_ERROR',
          message: err.message || 'An unknown error occurred',
          evidence: err.evidence,
        },
        metrics: {
          durationMs,
          segmentCount: 0,
        },
      };
    }
  }

  /**
   * POST /interest-engine/preview
   * 
   * Lightweight preview endpoint - NO audit log, cached
   * Frontend form preview için kullanılır
   * 
   * @see docs/single-source-of-truth-architecture.md
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(@Body() dto: PreviewRequestDto): Promise<PreviewResponseDto> {
    try {
      // Validate input
      if (!dto.principalAmount || dto.principalAmount <= 0) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'principalAmount must be greater than 0',
          },
          cached: false,
        };
      }

      if (!dto.startDate || !dto.endDate) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'startDate and endDate are required',
          },
          cached: false,
        };
      }

      const startDate = new Date(dto.startDate);
      const endDate = new Date(dto.endDate);

      if (startDate >= endDate) {
        return {
          success: false,
          error: {
            code: 'INVALID_DATE_RANGE',
            message: 'startDate must be before endDate',
          },
          cached: false,
        };
      }

      // Calculate days
      const days = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      // Get current rate based on interest type
      // TODO: Implement proper rate lookup from RateProviderService
      const currentRate = this.getPreviewRate(dto.interestType, dto.fixedRate);

      if (currentRate === null) {
        return {
          success: false,
          error: {
            code: 'RATE_NOT_FOUND',
            message: `Rate not found for interest type: ${dto.interestType}`,
          },
          cached: false,
        };
      }

      // Simple interest calculation (preview only - not for legal use)
      const annualRate = currentRate / 100;
      const estimatedInterest = Math.round(dto.principalAmount * annualRate * days / 365 * 100) / 100;

      // Cache expiry: 5 minutes
      const cacheExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      return {
        success: true,
        data: {
          estimatedInterest,
          currentRate,
          days,
          interestType: dto.interestType,
        },
        cached: false, // TODO: Implement caching
        cacheExpiry,
      };
    } catch (error) {
      console.error('[InterestEngine] Preview error:', error);
      return {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Interest calculation service is temporarily unavailable',
        },
        cached: false,
      };
    }
  }

  /**
   * Get preview rate for interest type
   * Simplified rate lookup for preview purposes
   */
  private getPreviewRate(interestType: InterestTypeCode, fixedRate?: number): number | null {
    // Fixed rate types
    if (fixedRate !== undefined && (
      interestType === InterestTypeCode.COMMERCIAL_FIXED ||
      interestType === InterestTypeCode.CONTRACTUAL
    )) {
      return fixedRate;
    }

    // Current rates (2025 Q1) - should be fetched from DB in production
    const currentRates: Partial<Record<InterestTypeCode, number>> = {
      [InterestTypeCode.LEGAL_3095]: 24, // Yasal faiz (2024+)
      [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: 39.75, // TCMB Avans (2025-12-20)
      [InterestTypeCode.TTK_1530]: 39.75, // TTK 1530 = TCMB Avans
      [InterestTypeCode.MEVDUAT_TL_BANKALARCA]: 45, // Tahmini
      [InterestTypeCode.MEVDUAT_TL_KAMU]: 42, // Tahmini
    };

    return currentRates[interestType] ?? null;
  }

  /**
   * GET /interest-engine/records/:id
   * 
   * Get calculation record by ID
   */
  @Get('records/:id')
  async getRecord(@Param('id') id: string): Promise<unknown> {
    const record = await this.auditWriter.getRecord(id);
    
    if (!record) {
      throw new NotFoundException(`Record ${id} not found`);
    }

    return record;
  }

  /**
   * GET /interest-engine/records
   * 
   * Query calculation records
   */
  @Get('records')
  async queryRecords(@Query() query: RecordQueryDto): Promise<unknown[]> {
    if (query.caseId) {
      return this.auditWriter.getRecordsForCase(query.caseId, 'default');
    }

    // Return empty for now - would need full query implementation
    return [];
  }

  /**
   * GET /interest-engine/trace/:recordId
   * 
   * Get calculation trace for a record
   */
  @Get('trace/:recordId')
  async getTrace(@Param('recordId') recordId: string): Promise<unknown> {
    const trace = await this.traceExporter.exportTrace(recordId);
    
    if (!trace) {
      throw new NotFoundException(`Trace for record ${recordId} not found`);
    }

    return trace;
  }

  /**
   * GET /interest-engine/metrics
   * 
   * Get engine metrics
   */
  @Get('metrics')
  async getMetrics(@Query('tenantId') tenantId: string): Promise<unknown> {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    return this.metrics.getDashboardMetrics(tenantId);
  }

  /**
   * GET /interest-engine/health
   * 
   * Health check endpoint
   */
  @Get('health')
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
