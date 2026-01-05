/**
 * ENTERPRISE CONTROLLER (v38)
 * 
 * Kurumsal ölçek katmanı API endpoint'leri.
 * - PII masking
 * - Audit chain
 * - Approval workflow
 * - Job leasing
 * - Backpressure
 * - Plan limits
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PiiMaskingService, UserRole } from './pii-masking.service';
import { AuditChainService } from './audit-chain.service';
import { ApprovalWorkflowService, ApprovalDecision } from './approval-workflow.service';
import { JobLeasingService } from './job-leasing.service';
import { BackpressureService } from './backpressure.service';
import { PlanLimitsService, PlanType } from './plan-limits.service';

// ============================================================
// PII MASKING CONTROLLER
// ============================================================
@Controller('icrabot/enterprise/pii')
export class PiiMaskingController {
  constructor(private readonly piiService: PiiMaskingService) {}

  /**
   * Test PII masking on sample data
   */
  @Post('test-mask')
  @HttpCode(HttpStatus.OK)
  testMask(
    @Body() body: { data: Record<string, any>; role: UserRole },
  ): { masked: Record<string, any> } {
    const masked = this.piiService.applyMask(body.data, body.role);
    return { masked };
  }

  /**
   * Check if a field should be masked for a role
   */
  @Get('should-mask')
  shouldMask(
    @Query('field') field: string,
    @Query('role') role: UserRole,
  ): { shouldMask: boolean } {
    return { shouldMask: this.piiService.shouldMask(field, role) };
  }
}

// ============================================================
// AUDIT CHAIN CONTROLLER
// ============================================================
@Controller('icrabot/enterprise/audit')
export class AuditChainController {
  constructor(private readonly auditService: AuditChainService) {}

  /**
   * Log an audit event
   */
  @Post('log')
  @HttpCode(HttpStatus.CREATED)
  async logEvent(
    @Body() body: {
      tenantId: string;
      caseId?: string;
      userId: string;
      action: string;
      payload: Record<string, any>;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    const entry = await this.auditService.logEvent(body);
    return { ok: true, entry };
  }

  /**
   * Verify audit chain integrity
   */
  @Get('verify/:tenantId')
  async verifyChain(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.auditService.verifyChain(
      tenantId,
      limit ? parseInt(limit, 10) : 1000,
    );
    return { ok: result.valid, ...result };
  }
}

// ============================================================
// APPROVAL WORKFLOW CONTROLLER
// ============================================================
@Controller('icrabot/enterprise/approval')
export class ApprovalWorkflowController {
  constructor(private readonly approvalService: ApprovalWorkflowService) {}

  /**
   * Check if approval is required
   */
  @Get('check-required')
  checkRequired(
    @Query('riskLevel') riskLevel?: string,
    @Query('lockId') lockId?: string,
  ) {
    const rule = this.approvalService.isApprovalRequired(riskLevel, lockId);
    return {
      required: !!rule,
      rule,
    };
  }

  /**
   * Create an approval request
   */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async createRequest(
    @Body() body: {
      tenantId: string;
      caseId: string;
      requestedByUserId: string;
      reason: string;
      jobId?: string;
      riskLevel?: string;
      lockId?: string;
    },
  ) {
    const request = await this.approvalService.createApprovalRequest(
      body.tenantId,
      body.caseId,
      body.requestedByUserId,
      body.reason,
      {
        jobId: body.jobId,
        riskLevel: body.riskLevel,
        lockId: body.lockId,
      },
    );
    return { ok: true, request };
  }

  /**
   * Submit a decision on an approval request
   */
  @Post('decide')
  @HttpCode(HttpStatus.OK)
  async submitDecision(
    @Body() body: {
      tenantId: string;
      approvalRequestId: string;
      userId: string;
      userRole: UserRole;
      decision: ApprovalDecision;
      note?: string;
    },
  ) {
    const result = await this.approvalService.submitDecision(
      body.tenantId,
      body.approvalRequestId,
      body.userId,
      body.userRole,
      body.decision,
      body.note,
    );
    return { ok: true, ...result };
  }

  /**
   * Get pending approval requests
   */
  @Get('pending/:tenantId')
  async getPending(@Param('tenantId') tenantId: string) {
    const requests = await this.approvalService.getPendingRequests(tenantId);
    return { ok: true, requests };
  }
}

// ============================================================
// JOB LEASING CONTROLLER
// ============================================================
@Controller('icrabot/enterprise/leasing')
export class JobLeasingController {
  constructor(private readonly leasingService: JobLeasingService) {}

  /**
   * Acquire a job lease (for workers)
   */
  @Post('acquire')
  @HttpCode(HttpStatus.OK)
  async acquireLease(
    @Body() body: {
      tenantId: string;
      workerId: string;
      leaseTtlSeconds?: number;
    },
  ) {
    const job = await this.leasingService.acquireLease(
      body.tenantId,
      body.workerId,
      body.leaseTtlSeconds,
    );
    return { ok: !!job, job };
  }

  /**
   * Release a job lease
   */
  @Post('release')
  @HttpCode(HttpStatus.OK)
  async releaseLease(
    @Body() body: {
      jobId: string;
      workerId: string;
      status: 'DONE' | 'FAILED';
      errorCode?: string;
      errorMessage?: string;
    },
  ) {
    const success = await this.leasingService.releaseLease(
      body.jobId,
      body.workerId,
      body.status,
      body.errorCode,
      body.errorMessage,
    );
    return { ok: success };
  }

  /**
   * Extend a job lease
   */
  @Post('extend')
  @HttpCode(HttpStatus.OK)
  async extendLease(
    @Body() body: {
      jobId: string;
      workerId: string;
      extensionSeconds?: number;
    },
  ) {
    const success = await this.leasingService.extendLease(
      body.jobId,
      body.workerId,
      body.extensionSeconds,
    );
    return { ok: success };
  }

  /**
   * Cleanup expired leases
   */
  @Post('cleanup/:tenantId')
  @HttpCode(HttpStatus.OK)
  async cleanupExpired(@Param('tenantId') tenantId: string) {
    const count = await this.leasingService.cleanupExpiredLeases(tenantId);
    return { ok: true, cleanedUp: count };
  }
}

// ============================================================
// BACKPRESSURE CONTROLLER
// ============================================================
@Controller('icrabot/enterprise/backpressure')
export class BackpressureController {
  constructor(private readonly backpressureService: BackpressureService) {}

  /**
   * Check backpressure status
   */
  @Get('status/:tenantId')
  async getStatus(@Param('tenantId') tenantId: string) {
    const status = await this.backpressureService.checkBackpressure(tenantId);
    return { ok: true, ...status };
  }

  /**
   * Record an action (for rate limiting)
   */
  @Post('record-action/:tenantId')
  @HttpCode(HttpStatus.OK)
  recordAction(@Param('tenantId') tenantId: string) {
    this.backpressureService.recordAction(tenantId);
    return { ok: true };
  }

  /**
   * Manually enable throttle
   */
  @Post('enable-throttle')
  @HttpCode(HttpStatus.OK)
  enableThrottle(
    @Body() body: {
      tenantId: string;
      durationSeconds: number;
      reason: string;
    },
  ) {
    this.backpressureService.enableThrottle(
      body.tenantId,
      body.durationSeconds,
      body.reason,
    );
    return { ok: true };
  }

  /**
   * Manually disable throttle
   */
  @Post('disable-throttle/:tenantId')
  @HttpCode(HttpStatus.OK)
  disableThrottle(@Param('tenantId') tenantId: string) {
    this.backpressureService.disableThrottle(tenantId);
    return { ok: true };
  }

  /**
   * Get current configuration
   */
  @Get('config')
  getConfig() {
    return { ok: true, config: this.backpressureService.getConfig() };
  }
}

// ============================================================
// PLAN LIMITS CONTROLLER
// ============================================================
@Controller('icrabot/enterprise/plan')
export class PlanLimitsController {
  constructor(private readonly planService: PlanLimitsService) {}

  /**
   * Get plan limits
   */
  @Get('limits/:plan')
  getPlanLimits(@Param('plan') plan: PlanType) {
    return { ok: true, limits: this.planService.getPlanLimits(plan) };
  }

  /**
   * Get usage stats for a tenant
   */
  @Get('usage/:tenantId')
  async getUsage(@Param('tenantId') tenantId: string) {
    const stats = await this.planService.getUsageStats(tenantId);
    return { ok: true, usage: stats };
  }

  /**
   * Get usage summary with percentages
   */
  @Get('summary/:tenantId')
  async getSummary(
    @Param('tenantId') tenantId: string,
    @Query('plan') plan: PlanType = 'FREE',
  ) {
    const summary = await this.planService.getUsageSummary(tenantId, plan);
    return { ok: true, ...summary };
  }

  /**
   * Check if a new case can be created
   */
  @Get('can-create-case/:tenantId')
  async canCreateCase(
    @Param('tenantId') tenantId: string,
    @Query('plan') plan: PlanType = 'FREE',
  ) {
    const result = await this.planService.canCreateCase(tenantId, plan);
    return { ok: true, ...result };
  }

  /**
   * Check if a new job can be created
   */
  @Get('can-create-job/:tenantId')
  async canCreateJob(
    @Param('tenantId') tenantId: string,
    @Query('plan') plan: PlanType = 'FREE',
  ) {
    const result = await this.planService.canCreateJob(tenantId, plan);
    return { ok: true, ...result };
  }

  /**
   * Check if a feature is available
   */
  @Get('has-feature')
  hasFeature(
    @Query('plan') plan: PlanType,
    @Query('feature') feature: string,
  ) {
    return {
      ok: true,
      hasFeature: this.planService.hasFeature(plan, feature),
    };
  }
}
