/**
 * Simulation Error Types
 * 
 * Sprint 2F - Consistent error responses for simulation API
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitType } from './simulation-rate-limit.constants';

// ============================================================================
// Error Codes
// ============================================================================

export type SimulationErrorCode =
  | 'SIMULATION_DISABLED'
  | 'INCIDENT_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'BUNDLE_NOT_FOUND'
  | 'FORBIDDEN_TENANT_SCOPE'
  | 'SIMULATION_ALREADY_RUNNING'
  | 'TOO_MANY_SIMULATIONS'
  | 'CANNOT_ARCHIVE_BASELINE';

// ============================================================================
// Error Response Interface
// ============================================================================

export interface SimulationErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: {
    errorCode?: SimulationErrorCode;
    retryAfter?: number | undefined;
    limitType?: RateLimitType;
    incidentId?: string;
    runId?: string;
    bundleId?: string;
    snapshotId?: string;
  };
}

// ============================================================================
// Error Factory Functions
// ============================================================================

export function createSimulationDisabledError(): SimulationErrorResponse {
  return {
    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    error: 'Service Unavailable',
    message: 'Simulation feature is disabled',
    details: { errorCode: 'SIMULATION_DISABLED' },
  };
}

export function createIncidentNotFoundError(incidentId: string): SimulationErrorResponse {
  return {
    statusCode: HttpStatus.NOT_FOUND,
    error: 'Not Found',
    message: `Incident ${incidentId} not found`,
    details: { errorCode: 'INCIDENT_NOT_FOUND', incidentId },
  };
}

export function createRunNotFoundError(runId: string): SimulationErrorResponse {
  return {
    statusCode: HttpStatus.NOT_FOUND,
    error: 'Not Found',
    message: `Run ${runId} not found`,
    details: { errorCode: 'RUN_NOT_FOUND', runId },
  };
}

export function createBundleNotFoundError(bundleId: string): SimulationErrorResponse {
  return {
    statusCode: HttpStatus.NOT_FOUND,
    error: 'Not Found',
    message: `Bundle ${bundleId} not found`,
    details: { errorCode: 'BUNDLE_NOT_FOUND', bundleId },
  };
}

export function createForbiddenTenantScopeError(): SimulationErrorResponse {
  return {
    statusCode: HttpStatus.FORBIDDEN,
    error: 'Forbidden',
    message: 'Access denied to requested tenant scope',
    details: { errorCode: 'FORBIDDEN_TENANT_SCOPE' },
  };
}

export function createSimulationAlreadyRunningError(incidentId: string): SimulationErrorResponse {
  return {
    statusCode: HttpStatus.CONFLICT,
    error: 'Conflict',
    message: 'Simulation already running for this incident',
    details: { errorCode: 'SIMULATION_ALREADY_RUNNING', incidentId },
  };
}

export function createTooManySimulationsError(
  limitType: RateLimitType,
  retryAfterSec?: number,
): SimulationErrorResponse {
  const messages: Record<RateLimitType, string> = {
    concurrent: 'Concurrent simulation limit exceeded',
    incident: 'Per-incident rate limit exceeded',
    daily: 'Daily simulation limit exceeded',
  };

  return {
    statusCode: HttpStatus.TOO_MANY_REQUESTS,
    error: 'Too Many Requests',
    message: messages[limitType],
    details: {
      errorCode: 'TOO_MANY_SIMULATIONS',
      limitType,
      retryAfter: retryAfterSec,
    },
  };
}

export function createCannotArchiveBaselineError(snapshotId: string): SimulationErrorResponse {
  return {
    statusCode: HttpStatus.CONFLICT,
    error: 'Conflict',
    message: 'Cannot archive baseline snapshot',
    details: { errorCode: 'CANNOT_ARCHIVE_BASELINE', snapshotId },
  };
}

// ============================================================================
// HTTP Exceptions
// ============================================================================

export class SimulationDisabledException extends HttpException {
  constructor() {
    super(createSimulationDisabledError(), HttpStatus.SERVICE_UNAVAILABLE);
  }
}

export class IncidentNotFoundException extends HttpException {
  constructor(incidentId: string) {
    super(createIncidentNotFoundError(incidentId), HttpStatus.NOT_FOUND);
  }
}

export class RunNotFoundException extends HttpException {
  constructor(runId: string) {
    super(createRunNotFoundError(runId), HttpStatus.NOT_FOUND);
  }
}

export class BundleNotFoundException extends HttpException {
  constructor(bundleId: string) {
    super(createBundleNotFoundError(bundleId), HttpStatus.NOT_FOUND);
  }
}

export class ForbiddenTenantScopeException extends HttpException {
  constructor() {
    super(createForbiddenTenantScopeError(), HttpStatus.FORBIDDEN);
  }
}

export class SimulationAlreadyRunningException extends HttpException {
  constructor(incidentId: string) {
    super(createSimulationAlreadyRunningError(incidentId), HttpStatus.CONFLICT);
  }
}

export class TooManySimulationsException extends HttpException {
  constructor(limitType: RateLimitType, retryAfterSec?: number) {
    super(createTooManySimulationsError(limitType, retryAfterSec), HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class CannotArchiveBaselineException extends HttpException {
  constructor(snapshotId: string) {
    super(createCannotArchiveBaselineError(snapshotId), HttpStatus.CONFLICT);
  }
}
