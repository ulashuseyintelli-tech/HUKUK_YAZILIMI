/**
 * Idempotency Decorators
 * 
 * Phase 10.3 - PR-2
 * 
 * Controller decorators for idempotency gate metadata.
 * 
 * Usage:
 * ```typescript
 * @Post(':id/redrive')
 * @IdempotencyAction({ actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY', resourceIdParam: 'id' })
 * async redrive(@Param('id') id: string) { ... }
 * ```
 */

import { SetMetadata } from '@nestjs/common';

// ============================================================================
// Metadata Key
// ============================================================================

export const IDEMPOTENCY_META_KEY = 'idempotency_meta';

// ============================================================================
// Metadata Type
// ============================================================================

export interface IdempotencyMeta {
  /** Action type for audit (e.g., 'DLQ_REDRIVE', 'WORKER_PAUSE') */
  actionType: string;
  
  /** Resource type (e.g., 'DLQ_ENTRY', 'WORKER') */
  resourceType: string;
  
  /** 
   * Request param name for resource ID (e.g., 'id', 'bundleId')
   * If not provided, resourceId will be null
   */
  resourceIdParam?: string;
  
  /**
   * Custom lease duration in seconds (default: 30)
   */
  leaseSeconds?: number;
  
  /**
   * Custom retention in days (default: 7)
   */
  retentionDays?: number;
}

// ============================================================================
// Decorator
// ============================================================================

/**
 * Mark a controller method as idempotent.
 * 
 * When applied, the IdempotencyGateInterceptor will:
 * 1. Require Idempotency-Key header
 * 2. Check/acquire action ownership
 * 3. Return cached response for duplicate requests
 * 4. Handle lease expiry and takeover
 * 
 * @param meta - Idempotency metadata
 */
export const IdempotencyAction = (meta: IdempotencyMeta) =>
  SetMetadata(IDEMPOTENCY_META_KEY, meta);
