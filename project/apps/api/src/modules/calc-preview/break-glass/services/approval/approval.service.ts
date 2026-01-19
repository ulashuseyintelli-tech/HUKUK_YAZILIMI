/**
 * BreakGlassApprovalService
 * 
 * Manages break-glass request approval/denial.
 * 
 * Key behaviors:
 * - Four-eyes principle: requesterId != approverId
 * - Optimistic lock: WHERE id=? AND status='PENDING' AND version=?
 * - Circuit breaker check before grant
 * - Emit GRANTED/DENIED audit events
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  BreakGlassRequest,
  BreakGlassGrant,
} from '../../break-glass.types';
import {
  CrossTenantAuditService,
  AuditContext,
  DeniedEventPayload,
} from '../audit/cross-tenant-audit.service';
import {
  BreakGlassCircuitBreakerService,
  CircuitBreakerTrippedException,
} from '../circuit-breaker/circuit-breaker.service';
import { BreakGlassGrantService } from '../grant/grant.service';
import {
  BreakGlassRequestService,
  BreakGlassRequestWithVersion,
} from '../request/request.service';

/**
 * Approval result
 */
export interface ApprovalResult {
  grant: BreakGlassGrant;
  token: string;
}

/**
 * Denial result
 */
export interface DenialResult {
  request: BreakGlassRequest;
  denialReason?: string;
}

/**
 * Approval service
 */
@Injectable()
export class BreakGlassApprovalService {
  private readonly logger = new Logger(BreakGlassApprovalService.name);

  constructor(
    private readonly requestService: BreakGlassRequestService,
    private readonly grantService: BreakGlassGrantService,
    private readonly circuitBreakerService: BreakGlassCircuitBreakerService,
    private readonly auditService: CrossTenantAuditService,
  ) {}

  /**
   * Approve a break-glass request
   * 
   * INV-2: Four-eyes enforced - no single actor can both request and approve
   */
  async approve(
    requestId: string,
    approverId: string,
    approverName: string | undefined,
    context: AuditContext,
  ): Promise<ApprovalResult> {
    // 1. Get request with version for optimistic lock
    const request = await this.requestService.getRequestWithVersion(requestId);
    
    if (!request) {
      throw new RequestNotFoundException(requestId);
    }

    // 2. Check request is still pending
    if (request.status !== 'PENDING') {
      throw new RequestAlreadyProcessedException(requestId, request.status);
    }

    // 3. Check not expired
    if (new Date(request.expiresAt) <= new Date()) {
      throw new RequestExpiredException(requestId);
    }

    // 4. INV-2: Four-eyes check
    if (request.requesterId === approverId) {
      this.logger.warn('Four-eyes violation attempt', {
        requestId,
        requesterId: request.requesterId,
        approverId,
      });
      throw new FourEyesViolationException(requestId);
    }

    // 5. Check circuit breaker
    try {
      await this.circuitBreakerService.checkBeforeGrant();
    } catch (error) {
      if (error instanceof CircuitBreakerTrippedException) {
        throw new CircuitBreakerBlockedException();
      }
      throw error;
    }

    // 6. Optimistic lock: update status to APPROVED
    const updateResult = await this.requestService.updateStatusWithLock(
      requestId,
      'APPROVED',
      (request as BreakGlassRequestWithVersion).version,
    );

    if (!updateResult.success) {
      // Version mismatch - someone else processed this request
      throw new RequestAlreadyProcessedException(requestId, 'CONCURRENT_MODIFICATION');
    }

    // 7. Issue grant
    const { grant, token } = await this.grantService.issue(
      request,
      approverId,
      approverName,
    );

    // 8. Record grant in circuit breaker
    const tripped = await this.circuitBreakerService.recordGrant(approverId);
    if (tripped) {
      this.logger.warn('Circuit breaker tripped after grant', {
        grantId: grant.grantId,
        trippedBy: approverId,
      });
    }

    // 9. Emit audit event
    await this.auditService.emitGranted({
      request,
      grant,
      context,
    });

    this.logger.log('Break-glass request approved', {
      requestId,
      grantId: grant.grantId,
      approverId,
      targetTenantId: grant.targetTenantId,
    });

    return { grant, token };
  }

  /**
   * Deny a break-glass request
   */
  async deny(
    requestId: string,
    approverId: string,
    denialReason: string | undefined,
    context: AuditContext,
  ): Promise<DenialResult> {
    // 1. Get request with version
    const request = await this.requestService.getRequestWithVersion(requestId);
    
    if (!request) {
      throw new RequestNotFoundException(requestId);
    }

    // 2. Check request is still pending
    if (request.status !== 'PENDING') {
      throw new RequestAlreadyProcessedException(requestId, request.status);
    }

    // 3. Validate denial reason length
    if (denialReason && denialReason.length > 200) {
      throw new DenialReasonTooLongException();
    }

    // 4. Optimistic lock: update status to DENIED
    const updateResult = await this.requestService.updateStatusWithLock(
      requestId,
      'DENIED',
      (request as BreakGlassRequestWithVersion).version,
    );

    if (!updateResult.success) {
      throw new RequestAlreadyProcessedException(requestId, 'CONCURRENT_MODIFICATION');
    }

    // 5. Update request with denial reason
    request.status = 'DENIED';
    if (denialReason) {
      request.denialReason = denialReason;
    }

    // 6. Emit audit event
    const deniedPayload: DeniedEventPayload = {
      request,
      context,
    };
    if (denialReason) {
      deniedPayload.denialReason = denialReason;
    }
    await this.auditService.emitDenied(deniedPayload);

    this.logger.log('Break-glass request denied', {
      requestId,
      approverId,
      denialReason,
    });

    const result: DenialResult = { request };
    if (denialReason) {
      result.denialReason = denialReason;
    }
    return result;
  }
}

/**
 * Request not found exception
 */
export class RequestNotFoundException extends Error {
  constructor(requestId: string) {
    super(`Break-glass request not found: ${requestId}`);
    this.name = 'RequestNotFoundException';
  }
}

/**
 * Request already processed exception (409 Conflict)
 */
export class RequestAlreadyProcessedException extends Error {
  constructor(requestId: string, currentStatus: string) {
    super(`Break-glass request ${requestId} already processed: ${currentStatus}`);
    this.name = 'RequestAlreadyProcessedException';
  }
}

/**
 * Request expired exception (410 Gone)
 */
export class RequestExpiredException extends Error {
  constructor(requestId: string) {
    super(`Break-glass request ${requestId} has expired`);
    this.name = 'RequestExpiredException';
  }
}

/**
 * Four-eyes violation exception (403 Forbidden)
 */
export class FourEyesViolationException extends Error {
  constructor(requestId: string) {
    super(`Four-eyes violation: same person cannot request and approve (${requestId})`);
    this.name = 'FourEyesViolationException';
  }
}

/**
 * Circuit breaker blocked exception (503 Service Unavailable)
 */
export class CircuitBreakerBlockedException extends Error {
  constructor() {
    super('Break-glass circuit breaker is tripped - new grants blocked');
    this.name = 'CircuitBreakerBlockedException';
  }
}

/**
 * Denial reason too long exception
 */
export class DenialReasonTooLongException extends Error {
  constructor() {
    super('Denial reason must be at most 200 characters');
    this.name = 'DenialReasonTooLongException';
  }
}
