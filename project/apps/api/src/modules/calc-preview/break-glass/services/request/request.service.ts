/**
 * BreakGlassRequestService
 * 
 * Manages break-glass request creation and lifecycle.
 * 
 * Key behaviors:
 * - Create request with structured reason validation
 * - 30-minute approval window
 * - Requester overdue post-mortem check (fail-closed)
 * - Emit REQUESTED audit event
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BreakGlassRequest,
  BreakGlassReason,
  BreakGlassRequestStatus,
  validateBreakGlassReason,
  isValidCrossTenantScope,
} from '../../break-glass.types';
import { BreakGlassConfigService } from '../../break-glass.config';
import {
  CrossTenantAuditService,
  AuditContext,
} from '../audit/cross-tenant-audit.service';
import { BreakGlassGrantService } from '../grant/grant.service';

/**
 * DI token - declared first to avoid hoisting issues
 */
export const BREAK_GLASS_REQUEST_REPOSITORY = 'BREAK_GLASS_REQUEST_REPOSITORY';

/**
 * Request repository interface
 */
export interface IBreakGlassRequestRepository {
  save(request: BreakGlassRequest): Promise<void>;
  findById(requestId: string): Promise<BreakGlassRequest | null>;
  findPendingByRequester(requesterId: string): Promise<BreakGlassRequest[]>;
  update(request: BreakGlassRequest): Promise<void>;
  updateStatus(
    requestId: string,
    status: BreakGlassRequestStatus,
    version: number,
  ): Promise<{ success: boolean; currentVersion: number }>;
  findExpired(): Promise<BreakGlassRequest[]>;
}

/**
 * Request with version for optimistic locking
 */
export interface BreakGlassRequestWithVersion extends BreakGlassRequest {
  version: number;
}

/**
 * In-memory request repository for development/testing
 */
@Injectable()
export class InMemoryBreakGlassRequestRepository implements IBreakGlassRequestRepository {
  private readonly requests = new Map<string, BreakGlassRequestWithVersion>();

  async save(request: BreakGlassRequest): Promise<void> {
    this.requests.set(request.requestId, { ...request, version: 1 });
  }

  async findById(requestId: string): Promise<BreakGlassRequestWithVersion | null> {
    return this.requests.get(requestId) || null;
  }

  async findPendingByRequester(requesterId: string): Promise<BreakGlassRequest[]> {
    return Array.from(this.requests.values()).filter(
      r => r.requesterId === requesterId && r.status === 'PENDING',
    );
  }

  async update(request: BreakGlassRequest): Promise<void> {
    const existing = this.requests.get(request.requestId);
    if (!existing) {
      throw new Error(`Request not found: ${request.requestId}`);
    }
    this.requests.set(request.requestId, {
      ...request,
      version: existing.version + 1,
    });
  }

  /**
   * Optimistic lock update
   * Returns success=false if version mismatch (409 scenario)
   */
  async updateStatus(
    requestId: string,
    status: BreakGlassRequestStatus,
    version: number,
  ): Promise<{ success: boolean; currentVersion: number }> {
    const existing = this.requests.get(requestId);
    if (!existing) {
      throw new Error(`Request not found: ${requestId}`);
    }

    if (existing.version !== version) {
      return { success: false, currentVersion: existing.version };
    }

    existing.status = status;
    existing.version += 1;
    return { success: true, currentVersion: existing.version };
  }

  async findExpired(): Promise<BreakGlassRequest[]> {
    const now = new Date().toISOString();
    return Array.from(this.requests.values()).filter(
      r => r.status === 'PENDING' && r.expiresAt <= now,
    );
  }

  /**
   * For testing only
   * @internal
   */
  _clearForTesting(): void {
    this.requests.clear();
  }
}

/**
 * Create request DTO
 */
export interface CreateBreakGlassRequestDto {
  requesterId: string;
  requesterName?: string;
  targetTenantId: string;
  requestedScopes: string[];
  reason: BreakGlassReason;
}

/**
 * Request service
 */
@Injectable()
export class BreakGlassRequestService {
  private readonly logger = new Logger(BreakGlassRequestService.name);

  constructor(
    private readonly config: BreakGlassConfigService,
    @Inject(BREAK_GLASS_REQUEST_REPOSITORY)
    private readonly requestRepository: IBreakGlassRequestRepository,
    private readonly auditService: CrossTenantAuditService,
    private readonly grantService: BreakGlassGrantService,
  ) {}

  /**
   * Create a new break-glass request
   */
  async createRequest(
    dto: CreateBreakGlassRequestDto,
    context: AuditContext,
  ): Promise<BreakGlassRequest> {
    // 1. Check for overdue post-mortems (fail-closed)
    const hasOverdue = await this.checkOverduePostMortems(dto.requesterId);
    if (hasOverdue) {
      throw new RequesterBlockedException(dto.requesterId);
    }

    // 2. Validate reason
    const reasonValidation = validateBreakGlassReason(dto.reason);
    if (!reasonValidation.valid) {
      throw new InvalidReasonException(reasonValidation.errors);
    }

    // 3. Validate scopes
    for (const scope of dto.requestedScopes) {
      if (!isValidCrossTenantScope(scope)) {
        throw new InvalidScopeException(scope);
      }
    }

    // 4. Create request
    const timingConfig = this.config.getTimingConfig();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timingConfig.requestTtlMinutes * 60 * 1000);

    const request: BreakGlassRequest = {
      requestId: randomUUID(),
      requesterId: dto.requesterId,
      targetTenantId: dto.targetTenantId,
      requestedScopes: dto.requestedScopes,
      reason: dto.reason,
      requestedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'PENDING',
    };
    
    if (dto.requesterName) {
      request.requesterName = dto.requesterName;
    }

    await this.requestRepository.save(request);

    // 5. Emit audit event
    await this.auditService.emitRequested({
      request,
      context,
    });

    this.logger.log('Break-glass request created', {
      requestId: request.requestId,
      requesterId: request.requesterId,
      targetTenantId: request.targetTenantId,
      scopes: request.requestedScopes,
      expiresAt: request.expiresAt,
    });

    return request;
  }

  /**
   * Get request by ID
   */
  async getRequest(requestId: string): Promise<BreakGlassRequest | null> {
    return this.requestRepository.findById(requestId);
  }

  /**
   * Get request with version (for optimistic locking)
   */
  async getRequestWithVersion(requestId: string): Promise<BreakGlassRequestWithVersion | null> {
    return this.requestRepository.findById(requestId) as Promise<BreakGlassRequestWithVersion | null>;
  }

  /**
   * Update request status with optimistic lock
   * Returns 409 conflict if version mismatch
   */
  async updateStatusWithLock(
    requestId: string,
    status: BreakGlassRequestStatus,
    version: number,
  ): Promise<{ success: boolean; currentVersion: number }> {
    return this.requestRepository.updateStatus(requestId, status, version);
  }

  /**
   * Expire pending requests that have passed their approval window
   */
  async expireRequests(): Promise<BreakGlassRequest[]> {
    const expired = await this.requestRepository.findExpired();

    for (const request of expired) {
      request.status = 'EXPIRED';
      await this.requestRepository.update(request);

      this.logger.log('Break-glass request expired', {
        requestId: request.requestId,
      });
    }

    return expired;
  }

  /**
   * Check if requester has overdue post-mortems
   * Fail-closed: if check fails, assume overdue
   */
  private async checkOverduePostMortems(requesterId: string): Promise<boolean> {
    try {
      return await this.grantService.hasOverduePostMortems(requesterId);
    } catch (error) {
      // Fail-closed: if we can't check, block the request
      this.logger.error('Failed to check overdue post-mortems - failing closed', {
        requesterId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return true;
    }
  }
}

/**
 * Requester blocked due to overdue post-mortems
 */
export class RequesterBlockedException extends Error {
  constructor(requesterId: string) {
    super(`Requester ${requesterId} is blocked due to overdue post-mortems`);
    this.name = 'RequesterBlockedException';
  }
}

/**
 * Invalid reason exception
 */
export class InvalidReasonException extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid break-glass reason: ${errors.join(', ')}`);
    this.name = 'InvalidReasonException';
  }
}

/**
 * Invalid scope exception
 */
export class InvalidScopeException extends Error {
  constructor(scope: string) {
    super(`Invalid cross-tenant scope: ${scope}`);
    this.name = 'InvalidScopeException';
  }
}
