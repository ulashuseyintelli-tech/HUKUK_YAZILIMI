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
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  CreateApprovalRequestDto,
  SubmitApprovalDecisionDto,
} from './dto/enterprise-approval.dto';
import { AuditChainService } from './audit-chain.service';
import { ApprovalWorkflowService, ApprovalDecision } from './approval-workflow.service';
import { BackpressureService } from './backpressure.service';
import { PlanLimitsService, PlanType } from './plan-limits.service';

// ============================================================
// PII MASKING CONTROLLER — KALDIRILDI
//
// DEBTOR-ENTERPRISE-PII-DIAGNOSTIC-CONTAINMENT-P1-I02 (bulgu R02-F09D)
//
// `POST /icrabot/enterprise/pii/test-mask` ve `GET /icrabot/enterprise/pii/should-mask`
// KIMLIK DOGRULAMASIZ yayindaydi. Endpoint'ler depolanmis PII okumuyordu
// (PiiMaskingService saf/IO-suz), fakat kimliksiz olarak:
//   - hangi alanin hangi rol icin maskelendigini (KVKK maskeleme politikasi) ve
//   - maskeleme fonksiyonlarinin ne kadarini acikta biraktigini
// olculebilir kiliyordu.
//
// Repo genelinde iki bagimsiz tarama uretim tuketicisi bulamadi (frontend 0,
// servis 0, script 0, Python katmaninda HTTP cagrisi 0); route yalniz kendi
// tanimi, iki audit dokumani ve README'de geciyordu. Bu nedenle yetki modeli
// ICAT EDILMEDI — HTTP yuzeyi tamamen kaldirildi.
//
// `PiiMaskingService` KASITLI OLARAK DEGISTIRILMEDI ve provider olarak kayitli
// kalir: ileride gercek bir uretim tuketicisi cikarsa servis yerinde durur,
// ancak public HTTP yuzeyi olmadan.
// ============================================================

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
/**
 * DEBTOR-ENTERPRISE-APPROVAL-AUTHORIZATION-P0-I01 (R02-F09A) — I01A CONTAINMENT
 *
 * Bu sinif ONCEDEN TAMAMEN KIMLIKSIZDI: tenant, actor ve rol dogrudan govdeden/URL'den
 * okunuyordu. Guard BILEREK sinif seviyesindedir ve YALNIZ bu sinifa uygulanir —
 * ayni dosyadaki PII (F09D), audit (F09B) ve leasing (F09C) controller'lari AYRI
 * siniflardir ve davranislari bu gorevde DEGISTIRILMEMISTIR.
 */
@UseGuards(JwtAuthGuard)
export class ApprovalWorkflowController {
  constructor(private readonly approvalService: ApprovalWorkflowService) {}

  /**
   * Govdede/URL'de tasinabilen tenant degeri yalniz TUTARLILIK IDDIASIDIR.
   * Kanonik authority principal'dir; uyusmazlik sessizce yok sayilmaz, FAIL-CLOSED.
   */
  private resolveTenantAuthority(principalTenantId: unknown, claimedTenantId?: string): string {
    if (typeof principalTenantId !== 'string' || principalTenantId.length === 0) {
      throw new ForbiddenException('enterprise_approval_tenant_required: principal tenant cozumlenemedi');
    }
    if (typeof claimedTenantId === 'string' && claimedTenantId !== principalTenantId) {
      throw new ForbiddenException('enterprise_approval_tenant_mismatch: tenant iddiasi principal ile uyusmuyor');
    }
    return principalTenantId;
  }

  private resolveActorAuthority(principalUserId: unknown): string {
    if (typeof principalUserId !== 'string' || principalUserId.length === 0) {
      throw new ForbiddenException('enterprise_approval_actor_required: principal actor cozumlenemedi');
    }
    return principalUserId;
  }

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
    @Body() body: CreateApprovalRequestDto,
    @CurrentUser('tenantId') principalTenantId: string,
    @CurrentUser('id') principalUserId: string,
  ) {
    // Tenant VE requester kimligi principal'dan turer; govde alanlari authority degildir.
    const tenantId = this.resolveTenantAuthority(principalTenantId, body.tenantId);
    const requestedByUserId = this.resolveActorAuthority(principalUserId);

    const request = await this.approvalService.createApprovalRequest(
      tenantId,
      body.caseId,
      requestedByUserId,
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
    @Body() body: SubmitApprovalDecisionDto,
    @CurrentUser('tenantId') principalTenantId: string,
    @CurrentUser('id') principalUserId: string,
  ) {
    // Tenant ve actor principal'dan turer. `userRole` DTO'dan TAMAMEN CIKARILDI:
    // cagiran kendi rolunu beyan edemez.
    const tenantId = this.resolveTenantAuthority(principalTenantId, body.tenantId);
    const actorUserId = this.resolveActorAuthority(principalUserId);

    const result = await this.approvalService.submitDecisionAuthorized(
      tenantId,
      body.approvalRequestId,
      actorUserId,
      body.decision as ApprovalDecision,
      body.note,
    );
    return { ok: true, ...result };
  }

  /**
   * Get pending approval requests
   */
  /**
   * URL'deki tenant segmenti KORUNUR (route uyumlulugu) ama AUTHORITY DEGILDIR:
   * yalnizca principal tenant'i ile karsilastirilir. Baska tenant'in id'si
   * yazildiginda liste sessizce bos donmez — istek fail-closed reddedilir.
   */
  @Get('pending/:tenantId')
  async getPending(
    @Param('tenantId') pathTenantId: string,
    @CurrentUser('tenantId') principalTenantId: string,
  ) {
    const tenantId = this.resolveTenantAuthority(principalTenantId, pathTenantId);
    const requests = await this.approvalService.getPendingRequests(tenantId);
    return { ok: true, requests };
  }
}

// ============================================================
// JOB LEASING CONTROLLER — KALDIRILDI
//
// DEBTOR-ENTERPRISE-LEASING-CONTAINMENT-P1-I03 (bulgu R02-F09C)
//
// Dort ucun HEPSI YAZMA idi ve HICBIRINDE guard yoktu; tenant ve worker kimligi
// dogrudan istek govdesinden/URL'den okunuyordu:
//   POST /icrabot/enterprise/leasing/acquire          (body: tenantId, workerId)
//   POST /icrabot/enterprise/leasing/release          (body: jobId, workerId, status)
//   POST /icrabot/enterprise/leasing/extend           (body: jobId, workerId)
//   POST /icrabot/enterprise/leasing/cleanup/:tenantId (URL: tenantId)
//
// Kimliksiz bir cagiran boylece baska tenant'in kuyrugundan is kapabiliyor,
// baskasinin isini DONE/FAILED isaretleyebiliyor, lease uzatarak gercek worker'i
// ac birakabiliyor ve bir tenant'in lease'lerini toplu temizleyebiliyordu.
//
// Iki bagimsiz repo taramasi uretim tuketicisi bulamadi: frontend 0, servis 0,
// scheduler/worker 0, Python katmanindaki `job_leasing_pseudo.py` bastan sona
// `# Pseudo-code (Django)` tasarim notu — calisan bir HTTP istemcisi DEGIL.
// Route yalniz kendi tanimi, iki audit dokumani ve README'de geciyordu.
//
// Bu nedenle yetki modeli ICAT EDILMEDI; public HTTP yuzeyi kaldirildi.
//
// `JobLeasingService`, veri modeli ve schema KORUNDU (PRESERVED / DORMANT
// INTERNAL CAPABILITY). Ileride gercek bir worker gerektiginde bu yetenek
// yerinde durur; ancak o noktada AUTHENTICATED bir internal control-plane
// TASARLANARAK eklenmelidir — bu dosyadaki eski guard'siz uclar geri getirilmez.
// ============================================================

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
