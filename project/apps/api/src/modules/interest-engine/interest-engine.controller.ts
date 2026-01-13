/**
 * Task 17.4 - Interest Engine Controller
 * 
 * POST /interest-engine/calculate
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
