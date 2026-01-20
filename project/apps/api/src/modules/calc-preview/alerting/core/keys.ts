/**
 * Key Generation Utilities
 * 
 * Production Alerting System - Sprint 0
 * 
 * Deterministic key generation for alerts, incidents, and correlations.
 * 
 * @see .kiro/specs/production-alerting-system/design.md
 * @see Requirements 13.2, 16.1
 */

import { TenantScope, NotificationChannel } from '../types/alerting.types';
import { deterministicHashParts, generateTimestampedId } from './hash';

// ============================================================================
// ALERT KEY
// ============================================================================

/**
 * Alert key generation parameters
 */
export interface AlertKeyParams {
  /** Alert type */
  alertType: string;
  /** Tenant scope */
  tenantScope: TenantScope;
  /** Primary dimension (varies by alert type) */
  primaryDimension: string;
  /** Source component */
  component: string;
}

/**
 * Generate deterministic alert key for dedupe
 * 
 * Formula: hash(alertType + tenantScope + primaryDimension + component)
 * 
 * Primary dimension examples:
 * - rate limit: tenantId + limitKey
 * - queue: queueName
 * - degraded: serviceName
 * - security anomaly: anomalyKind + jtiBucket
 * 
 * @see Requirements 16.1
 */
export function makeAlertKey(params: AlertKeyParams): string {
  const { alertType, tenantScope, primaryDimension, component } = params;
  return deterministicHashParts(alertType, tenantScope, primaryDimension, component);
}

/**
 * Generate alert key from raw parts (convenience function)
 */
export function makeAlertKeyFromParts(
  alertType: string,
  tenantScope: TenantScope,
  primaryDimension: string,
  component: string,
): string {
  return makeAlertKey({ alertType, tenantScope, primaryDimension, component });
}

// ============================================================================
// CORRELATION ID
// ============================================================================

/**
 * Correlation ID generation parameters
 */
export interface CorrelationIdParams {
  /** Root dimension (dependency/service/outage id, deploy id, region id) */
  rootDimension: string;
  /** Timestamp in milliseconds */
  timestampMs: number;
  /** Component cluster */
  componentCluster: string;
  /** Window size in milliseconds (default: 5 minutes) */
  windowMs?: number;
}

/**
 * Generate deterministic correlation ID
 * 
 * Formula: hash(rootDimension + windowBucket(5m) + componentCluster)
 * 
 * Window bucket ensures alerts within same 5-minute window
 * get the same correlation ID.
 * 
 * @see Requirements 13.2
 */
export function makeCorrelationId(params: CorrelationIdParams): string {
  const { rootDimension, timestampMs, componentCluster, windowMs = 5 * 60 * 1000 } = params;
  const windowBucket = Math.floor(timestampMs / windowMs);
  return deterministicHashParts(rootDimension, windowBucket, componentCluster);
}

/**
 * Generate correlation ID from raw parts (convenience function)
 */
export function makeCorrelationIdFromParts(
  rootDimension: string,
  timestampMs: number,
  componentCluster: string,
  windowMs: number = 5 * 60 * 1000,
): string {
  return makeCorrelationId({ rootDimension, timestampMs, componentCluster, windowMs });
}

// ============================================================================
// IDEMPOTENCY KEY
// ============================================================================

/**
 * Idempotency key generation parameters
 */
export interface IdempotencyKeyParams {
  /** Alert ID */
  alertId: string;
  /** Notification channel */
  channel: NotificationChannel;
  /** Timestamp in milliseconds */
  timestampMs: number;
  /** Window size in milliseconds (default: 5 minutes) */
  windowMs?: number;
}

/**
 * Generate idempotency key for notification deduplication
 * 
 * Format: {alertId}:{channel}:{timestamp_bucket}
 * 
 * Same alert to same channel within 5-minute window
 * gets the same idempotency key.
 * 
 * @see Notification Service Contract
 */
export function makeIdempotencyKey(params: IdempotencyKeyParams): string {
  const { alertId, channel, timestampMs, windowMs = 5 * 60 * 1000 } = params;
  const bucket = Math.floor(timestampMs / windowMs);
  return `${alertId}:${channel}:${bucket}`;
}

/**
 * Generate idempotency key from raw parts (convenience function)
 */
export function makeIdempotencyKeyFromParts(
  alertId: string,
  channel: NotificationChannel,
  timestampMs: number,
  windowMs: number = 5 * 60 * 1000,
): string {
  return makeIdempotencyKey({ alertId, channel, timestampMs, windowMs });
}

// ============================================================================
// INCIDENT ID
// ============================================================================

/**
 * Incident ID generation parameters
 */
export interface IncidentIdParams {
  /** Alert key */
  alertKey: string;
  /** Timestamp in milliseconds */
  timestampMs: number;
}

/**
 * Generate unique incident ID
 * 
 * Format: inc_{timestamp_hex}_{hash}
 * 
 * Ensures:
 * - Chronological ordering (timestamp prefix)
 * - Uniqueness (hash suffix)
 * - Identifiable as incident (inc_ prefix)
 */
export function makeIncidentId(params: IncidentIdParams): string {
  const { alertKey, timestampMs } = params;
  const id = generateTimestampedId([alertKey], timestampMs);
  return `inc_${id}`;
}

// ============================================================================
// ALERT ID
// ============================================================================

/**
 * Alert ID generation parameters
 */
export interface AlertIdParams {
  /** Incident ID */
  incidentId: string;
  /** Alert sequence number within incident */
  sequence: number;
  /** Timestamp in milliseconds */
  timestampMs: number;
}

/**
 * Generate unique alert ID
 * 
 * Format: alt_{timestamp_hex}_{hash}
 * 
 * Ensures:
 * - Chronological ordering (timestamp prefix)
 * - Uniqueness (hash suffix)
 * - Identifiable as alert (alt_ prefix)
 */
export function makeAlertId(params: AlertIdParams): string {
  const { incidentId, sequence, timestampMs } = params;
  const id = generateTimestampedId([incidentId, sequence], timestampMs);
  return `alt_${id}`;
}

// ============================================================================
// OUTAGE ID
// ============================================================================

/**
 * Outage ID generation parameters
 */
export interface OutageIdParams {
  /** Outage reason */
  reason: string;
  /** Timestamp in milliseconds */
  timestampMs: number;
}

/**
 * Generate unique global outage ID
 * 
 * Format: out_{timestamp_hex}_{hash}
 */
export function makeOutageId(params: OutageIdParams): string {
  const { reason, timestampMs } = params;
  const id = generateTimestampedId([reason], timestampMs);
  return `out_${id}`;
}

// ============================================================================
// SIGNAL ID
// ============================================================================

/**
 * Signal ID generation parameters
 */
export interface SignalIdParams {
  /** Collector type */
  collectorType: string;
  /** Signal type */
  signalType: string;
  /** Timestamp in milliseconds */
  timestampMs: number;
  /** Additional entropy (e.g., tenant ID, component) */
  entropy?: string;
}

/**
 * Generate unique signal ID
 * 
 * Format: sig_{timestamp_hex}_{hash}
 */
export function makeSignalId(params: SignalIdParams): string {
  const { collectorType, signalType, timestampMs, entropy = '' } = params;
  const id = generateTimestampedId([collectorType, signalType, entropy], timestampMs);
  return `sig_${id}`;
}

// ============================================================================
// NOTIFICATION ID
// ============================================================================

/**
 * Notification ID generation parameters
 */
export interface NotificationIdParams {
  /** Alert ID */
  alertId: string;
  /** Timestamp in milliseconds */
  timestampMs: number;
}

/**
 * Generate unique notification ID
 * 
 * Format: ntf_{timestamp_hex}_{hash}
 */
export function makeNotificationId(params: NotificationIdParams): string {
  const { alertId, timestampMs } = params;
  const id = generateTimestampedId([alertId], timestampMs);
  return `ntf_${id}`;
}

// ============================================================================
// DEAD LETTER ID
// ============================================================================

/**
 * Dead letter entry ID generation parameters
 */
export interface DeadLetterIdParams {
  /** Notification ID */
  notificationId: string;
  /** Timestamp in milliseconds */
  timestampMs: number;
}

/**
 * Generate unique dead letter entry ID
 * 
 * Format: dlq_{timestamp_hex}_{hash}
 */
export function makeDeadLetterId(params: DeadLetterIdParams): string {
  const { notificationId, timestampMs } = params;
  const id = generateTimestampedId([notificationId], timestampMs);
  return `dlq_${id}`;
}

// ============================================================================
// PRIMARY DIMENSION HELPERS
// ============================================================================

/**
 * Build primary dimension for rate limit alerts
 */
export function buildRateLimitDimension(tenantId: string, limitKey: string): string {
  return `${tenantId}:${limitKey}`;
}

/**
 * Build primary dimension for queue alerts
 */
export function buildQueueDimension(queueName: string): string {
  return queueName;
}

/**
 * Build primary dimension for degraded alerts
 */
export function buildDegradedDimension(serviceName: string): string {
  return serviceName;
}

/**
 * Build primary dimension for security anomaly alerts
 */
export function buildSecurityAnomalyDimension(
  anomalyKind: string,
  jti?: string,
  timestampMs?: number,
  bucketMs: number = 5 * 60 * 1000,
): string {
  if (jti && timestampMs) {
    const bucket = Math.floor(timestampMs / bucketMs);
    return `${anomalyKind}:${jti}:${bucket}`;
  }
  return anomalyKind;
}

/**
 * Build primary dimension for resource alerts
 */
export function buildResourceDimension(resourceType: string, component: string): string {
  return `${resourceType}:${component}`;
}

/**
 * Build primary dimension for integrity alerts
 */
export function buildIntegrityDimension(component: string, checkType: string): string {
  return `${component}:${checkType}`;
}

/**
 * Build primary dimension for hygiene alerts
 */
export function buildHygieneDimension(errorType: string): string {
  return errorType;
}
