/**
 * BreakGlassController
 * 
 * Task 10.5.1 - Break-glass management endpoints
 * 
 * Endpoints:
 * - POST /api/v1/internal-ops/break-glass/request
 * - POST /api/v1/internal-ops/break-glass/approve
 * - POST /api/v1/internal-ops/break-glass/deny
 * - POST /api/v1/internal-ops/break-glass/revoke
 * - POST /api/v1/internal-ops/break-glass/renew
 * - GET /api/v1/internal-ops/break-glass/status/:requestId
 * 
 * Guards (in order):
 * 1. KillSwitchGuard - 503 when disabled (Gate 3)
 * 2. NetworkAllowlistGuard - 403 outside VPN (INV-4)
 * 3. InternalOpsGuard - 403 if not internal_ops role
 * 4. BreakGlassApproverGuard - 403 if not approver (for approve/deny only)
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  GoneException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import {
  BreakGlassKillSwitchGuard,
  NetworkAllowlistGuard,
  InternalOpsGuard,
  BreakGlassApproverGuard,
} from '../guards';
import {
  BreakGlassRequestService,
  RequesterBlockedException,
  InvalidReasonException,
  InvalidScopeException,
  CreateBreakGlassRequestDto as ServiceCreateRequestDto,
} from '../services/request';
import {
  BreakGlassApprovalService,
  RequestNotFoundException,
  RequestAlreadyProcessedException,
  RequestExpiredException,
  FourEyesViolationException,
  CircuitBreakerBlockedException,
  DenialReasonTooLongException,
} from '../services/approval';
import {
  BreakGlassGrantService,
  GrantNotFoundException,
  GrantNotActiveException,
  RenewalCapExceededException,
} from '../services/grant';
import { CrossTenantAuditService, AuditContext } from '../services/audit';
import {
  CreateBreakGlassRequestDto,
  ApproveBreakGlassRequestDto,
  DenyBreakGlassRequestDto,
  RevokeBreakGlassGrantDto,
  RenewBreakGlassGrantDto,
  CreateRequestResponseDto,
  ApproveRequestResponseDto,
  DenyRequestResponseDto,
  RevokeGrantResponseDto,
  RenewGrantResponseDto,
  RequestStatusResponseDto,
  BreakGlassRequestResponseDto,
  BreakGlassGrantResponseDto,
} from './break-glass.dto';
import { BreakGlassRequest, BreakGlassGrant, RevocationReason } from '../break-glass.types';

/**
 * Extended request with user info from guards
 */
interface InternalOpsRequest extends Request {
  user?: {
    userId: string;
    userName?: string;
    role: string;
    tenantId?: string;
  };
}

@Controller('api/v1/internal-ops/break-glass')
@UseGuards(BreakGlassKillSwitchGuard, NetworkAllowlistGuard, InternalOpsGuard)
export class BreakGlassController {
  private readonly logger = new Logger(BreakGlassController.name);

  constructor(
    private readonly requestService: BreakGlassRequestService,
    private readonly approvalService: BreakGlassApprovalService,
    private readonly grantService: BreakGlassGrantService,
    private readonly auditService: CrossTenantAuditService,
  ) {}

  // ==========================================================================
  // POST /request - Create break-glass request
  // ==========================================================================

  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async createRequest(
    @Body() dto: CreateBreakGlassRequestDto,
    @Req() req: InternalOpsRequest,
  ): Promise<CreateRequestResponseDto> {
    this.logger.debug('Creating break-glass request', {
      targetTenantId: dto.targetTenantId,
      scopes: dto.requestedScopes,
      category: dto.reason.category,
      ticketRef: dto.reason.ticketRef,
    });

    const context = this.extractAuditContext(req);
    const user = this.extractUser(req);

    try {
      // Build service DTO with conditional properties
      const serviceDto: ServiceCreateRequestDto = {
        requesterId: user.userId,
        targetTenantId: dto.targetTenantId,
        requestedScopes: dto.requestedScopes,
        reason: dto.reason,
      };
      if (user.userName) {
        serviceDto.requesterName = user.userName;
      }

      const request = await this.requestService.createRequest(serviceDto, context);

      return {
        requestId: request.requestId,
        expiresAt: request.expiresAt,
      };
    } catch (error) {
      this.handleRequestError(error);
    }
  }

  // ==========================================================================
  // POST /approve - Approve break-glass request
  // ==========================================================================

  @Post('approve')
  @UseGuards(BreakGlassApproverGuard)
  @HttpCode(HttpStatus.OK)
  async approveRequest(
    @Body() dto: ApproveBreakGlassRequestDto,
    @Req() req: InternalOpsRequest,
  ): Promise<ApproveRequestResponseDto> {
    this.logger.debug('Approving break-glass request', {
      requestId: dto.requestId,
    });

    const context = this.extractAuditContext(req);
    const user = this.extractUser(req);

    try {
      const result = await this.approvalService.approve(
        dto.requestId,
        user.userId,
        user.userName,
        context,
      );

      return {
        grantId: result.grant.grantId,
        token: result.token,
        expiresAt: result.grant.expiresAt,
      };
    } catch (error) {
      this.handleApprovalError(error);
    }
  }

  // ==========================================================================
  // POST /deny - Deny break-glass request
  // ==========================================================================

  @Post('deny')
  @UseGuards(BreakGlassApproverGuard)
  @HttpCode(HttpStatus.OK)
  async denyRequest(
    @Body() dto: DenyBreakGlassRequestDto,
    @Req() req: InternalOpsRequest,
  ): Promise<DenyRequestResponseDto> {
    this.logger.debug('Denying break-glass request', {
      requestId: dto.requestId,
      hasReason: !!dto.denialReason,
    });

    const context = this.extractAuditContext(req);
    const user = this.extractUser(req);

    try {
      const result = await this.approvalService.deny(
        dto.requestId,
        user.userId,
        dto.denialReason,
        context,
      );

      const response: DenyRequestResponseDto = {
        requestId: result.request.requestId,
        status: 'DENIED',
      };
      if (result.denialReason) {
        response.denialReason = result.denialReason;
      }
      return response;
    } catch (error) {
      this.handleApprovalError(error);
    }
  }

  // ==========================================================================
  // POST /revoke - Revoke break-glass grant
  // ==========================================================================

  @Post('revoke')
  @UseGuards(BreakGlassApproverGuard)
  @HttpCode(HttpStatus.OK)
  async revokeGrant(
    @Body() dto: RevokeBreakGlassGrantDto,
    @Req() req: InternalOpsRequest,
  ): Promise<RevokeGrantResponseDto> {
    this.logger.debug('Revoking break-glass grant', {
      grantId: dto.grantId,
      hasReason: !!dto.reason,
    });

    const context = this.extractAuditContext(req);
    const user = this.extractUser(req);

    try {
      const grant = await this.grantService.revoke(dto.grantId, user.userId, (dto.reason ?? 'manual') as RevocationReason);

      // Emit revoked audit event - build payload conditionally
      const revokedPayload: Parameters<typeof this.auditService.emitRevoked>[0] = {
        grant,
        revokedBy: user.userId,
        context,
      };
      if (dto.reason) {
        revokedPayload.revocationReason = dto.reason;
      }
      await this.auditService.emitRevoked(revokedPayload);

      return {
        success: true,
        grantId: grant.grantId,
        revokedAt: grant.revokedAt!,
      };
    } catch (error) {
      this.handleGrantError(error);
    }
  }

  // ==========================================================================
  // POST /renew - Renew break-glass grant
  // ==========================================================================

  @Post('renew')
  @HttpCode(HttpStatus.OK)
  async renewGrant(
    @Body() dto: RenewBreakGlassGrantDto,
    @Req() _req: InternalOpsRequest,
  ): Promise<RenewGrantResponseDto> {
    this.logger.debug('Renewing break-glass grant', {
      grantId: dto.grantId,
      ticketRef: dto.ticketRef,
    });

    try {
      const result = await this.grantService.renew(dto.grantId, dto.ticketRef);

      return {
        grantId: result.grant.grantId,
        token: result.token,
        expiresAt: result.grant.expiresAt,
        renewalCount: result.grant.renewalCount,
        renewalsLeft: result.grant.maxRenewals - result.grant.renewalCount,
      };
    } catch (error) {
      this.handleGrantError(error);
    }
  }

  // ==========================================================================
  // GET /status/:requestId - Get request status
  // ==========================================================================

  @Get('status/:requestId')
  async getRequestStatus(
    @Param('requestId') requestId: string,
  ): Promise<RequestStatusResponseDto> {
    this.logger.debug('Getting break-glass request status', { requestId });

    const request = await this.requestService.getRequest(requestId);
    if (!request) {
      throw new NotFoundException({
        error: 'REQUEST_NOT_FOUND',
        message: `Break-glass request not found: ${requestId}`,
      });
    }

    // Get associated grant if approved
    let grant: BreakGlassGrant | null = null;
    if (request.status === 'APPROVED') {
      grant = await this.grantService.getGrant(requestId);
    }

    // Get audit trail
    const auditTrail = await this.auditService.getAuditTrail(requestId);

    // Build response with conditional grant property
    const response: RequestStatusResponseDto = {
      request: this.toRequestDto(request),
      auditTrail,
    };
    if (grant) {
      response.grant = this.toGrantDto(grant);
    }
    return response;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private extractAuditContext(req: InternalOpsRequest): AuditContext {
    const context: AuditContext = {
      ip: this.getClientIp(req),
      correlationId: (req.headers['x-correlation-id'] as string) || randomUUID(),
    };
    const userAgent = req.headers['user-agent'];
    if (userAgent) {
      context.userAgent = userAgent;
    }
    const traceId = req.headers['x-trace-id'] as string | undefined;
    if (traceId) {
      context.traceId = traceId;
    }
    return context;
  }

  private extractUser(req: InternalOpsRequest): { userId: string; userName?: string } {
    if (!req.user?.userId) {
      throw new ForbiddenException({
        error: 'USER_NOT_AUTHENTICATED',
        message: 'User information not available',
      });
    }
    const result: { userId: string; userName?: string } = {
      userId: req.user.userId,
    };
    if (req.user.userName) {
      result.userName = req.user.userName;
    }
    return result;
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  private toRequestDto(request: BreakGlassRequest): BreakGlassRequestResponseDto {
    const dto: BreakGlassRequestResponseDto = {
      requestId: request.requestId,
      requesterId: request.requesterId,
      targetTenantId: request.targetTenantId,
      requestedScopes: request.requestedScopes,
      reason: {
        category: request.reason.category,
        ticketRef: request.reason.ticketRef,
      },
      requestedAt: request.requestedAt,
      expiresAt: request.expiresAt,
      status: request.status,
    };
    if (request.requesterName) {
      dto.requesterName = request.requesterName;
    }
    if (request.reason.description) {
      dto.reason.description = request.reason.description;
    }
    if (request.denialReason) {
      dto.denialReason = request.denialReason;
    }
    return dto;
  }

  private toGrantDto(grant: BreakGlassGrant): BreakGlassGrantResponseDto {
    const dto: BreakGlassGrantResponseDto = {
      grantId: grant.grantId,
      requestId: grant.requestId,
      approverId: grant.approverId,
      targetTenantId: grant.targetTenantId,
      grantedScopes: grant.grantedScopes,
      grantedAt: grant.grantedAt,
      expiresAt: grant.expiresAt,
      renewalCount: grant.renewalCount,
      maxRenewals: grant.maxRenewals,
      isActive: grant.isActive,
    };
    if (grant.approverName) {
      dto.approverName = grant.approverName;
    }
    return dto;
  }

  private handleRequestError(error: unknown): never {
    if (error instanceof RequesterBlockedException) {
      throw new ForbiddenException({
        error: 'REQUESTER_BLOCKED',
        message: error.message,
      });
    }
    if (error instanceof InvalidReasonException) {
      throw new BadRequestException({
        error: 'INVALID_REASON',
        message: error.message,
        details: { errors: error.errors },
      });
    }
    if (error instanceof InvalidScopeException) {
      throw new BadRequestException({
        error: 'INVALID_SCOPE',
        message: error.message,
      });
    }
    throw error;
  }

  private handleApprovalError(error: unknown): never {
    if (error instanceof RequestNotFoundException) {
      throw new NotFoundException({
        error: 'REQUEST_NOT_FOUND',
        message: error.message,
      });
    }
    if (error instanceof RequestAlreadyProcessedException) {
      throw new ConflictException({
        error: 'REQUEST_ALREADY_PROCESSED',
        message: error.message,
      });
    }
    if (error instanceof RequestExpiredException) {
      throw new GoneException({
        error: 'REQUEST_EXPIRED',
        message: error.message,
      });
    }
    if (error instanceof FourEyesViolationException) {
      throw new ForbiddenException({
        error: 'FOUR_EYES_VIOLATION',
        message: error.message,
      });
    }
    if (error instanceof CircuitBreakerBlockedException) {
      throw new ServiceUnavailableException({
        error: 'CIRCUIT_BREAKER_TRIPPED',
        message: error.message,
      });
    }
    if (error instanceof DenialReasonTooLongException) {
      throw new BadRequestException({
        error: 'DENIAL_REASON_TOO_LONG',
        message: error.message,
      });
    }
    throw error;
  }

  private handleGrantError(error: unknown): never {
    if (error instanceof GrantNotFoundException) {
      throw new NotFoundException({
        error: 'GRANT_NOT_FOUND',
        message: error.message,
      });
    }
    if (error instanceof GrantNotActiveException) {
      throw new ConflictException({
        error: 'GRANT_NOT_ACTIVE',
        message: error.message,
      });
    }
    if (error instanceof RenewalCapExceededException) {
      throw new ForbiddenException({
        error: 'RENEWAL_CAP_EXCEEDED',
        message: error.message,
      });
    }
    throw error;
  }
}
