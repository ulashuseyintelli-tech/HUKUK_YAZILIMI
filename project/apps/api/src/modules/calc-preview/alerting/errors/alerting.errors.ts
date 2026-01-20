/**
 * Alerting Error Taxonomy
 * 
 * Production Alerting System - Sprint 0
 * 
 * Structured error types for the alerting system.
 * 
 * @see .kiro/specs/production-alerting-system/design.md
 */

/**
 * Base alerting error
 */
export abstract class AlertingError extends Error {
  abstract readonly code: string;
  abstract readonly category: AlertingErrorCategory;
  readonly timestamp: string;
  readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.context = context;
    
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

/**
 * Error categories
 */
export enum AlertingErrorCategory {
  Collector = 'COLLECTOR',
  Store = 'STORE',
  Notification = 'NOTIFICATION',
  Configuration = 'CONFIGURATION',
  Validation = 'VALIDATION',
  Internal = 'INTERNAL',
}

// ============================================================================
// COLLECTOR ERRORS
// ============================================================================

/**
 * Base collector error
 */
export abstract class CollectorError extends AlertingError {
  readonly category = AlertingErrorCategory.Collector;
  readonly collectorType: string;

  constructor(message: string, collectorType: string, context?: Record<string, unknown>) {
    super(message, { ...context, collectorType });
    this.collectorType = collectorType;
  }
}

/**
 * Collector initialization failed
 */
export class CollectorInitError extends CollectorError {
  readonly code = 'COLLECTOR_INIT_FAILED';

  constructor(collectorType: string, reason: string, context?: Record<string, unknown>) {
    super(`Collector initialization failed: ${reason}`, collectorType, context);
  }
}

/**
 * Collector signal processing failed
 */
export class CollectorSignalError extends CollectorError {
  readonly code = 'COLLECTOR_SIGNAL_FAILED';

  constructor(collectorType: string, signalType: string, reason: string, context?: Record<string, unknown>) {
    super(`Signal processing failed: ${reason}`, collectorType, { ...context, signalType });
  }
}

/**
 * Collector source unavailable
 */
export class CollectorSourceUnavailableError extends CollectorError {
  readonly code = 'COLLECTOR_SOURCE_UNAVAILABLE';

  constructor(collectorType: string, source: string, context?: Record<string, unknown>) {
    super(`Signal source unavailable: ${source}`, collectorType, context);
  }
}

// ============================================================================
// STORE ERRORS
// ============================================================================

/**
 * Base store error
 */
export abstract class StoreError extends AlertingError {
  readonly category = AlertingErrorCategory.Store;
  readonly storeName: string;

  constructor(message: string, storeName: string, context?: Record<string, unknown>) {
    super(message, { ...context, storeName });
    this.storeName = storeName;
  }
}

/**
 * Store connection failed
 */
export class StoreConnectionError extends StoreError {
  readonly code = 'STORE_CONNECTION_FAILED';

  constructor(storeName: string, reason: string, context?: Record<string, unknown>) {
    super(`Store connection failed: ${reason}`, storeName, context);
  }
}

/**
 * Store operation failed
 */
export class StoreOperationError extends StoreError {
  readonly code = 'STORE_OPERATION_FAILED';
  readonly operation: string;

  constructor(storeName: string, operation: string, reason: string, context?: Record<string, unknown>) {
    super(`Store operation '${operation}' failed: ${reason}`, storeName, { ...context, operation });
    this.operation = operation;
  }
}

/**
 * Store item not found
 */
export class StoreNotFoundError extends StoreError {
  readonly code = 'STORE_NOT_FOUND';
  readonly itemId: string;

  constructor(storeName: string, itemId: string, context?: Record<string, unknown>) {
    super(`Item not found: ${itemId}`, storeName, { ...context, itemId });
    this.itemId = itemId;
  }
}

/**
 * Store conflict (concurrent modification)
 */
export class StoreConflictError extends StoreError {
  readonly code = 'STORE_CONFLICT';
  readonly itemId: string;

  constructor(storeName: string, itemId: string, reason: string, context?: Record<string, unknown>) {
    super(`Conflict on item '${itemId}': ${reason}`, storeName, { ...context, itemId });
    this.itemId = itemId;
  }
}

/**
 * Store capacity exceeded
 */
export class StoreCapacityError extends StoreError {
  readonly code = 'STORE_CAPACITY_EXCEEDED';

  constructor(storeName: string, limit: number, context?: Record<string, unknown>) {
    super(`Store capacity exceeded: limit=${limit}`, storeName, { ...context, limit });
  }
}

// ============================================================================
// NOTIFICATION ERRORS
// ============================================================================

/**
 * Base notification error
 */
export abstract class NotifyError extends AlertingError {
  readonly category = AlertingErrorCategory.Notification;
  readonly channel?: string;

  constructor(message: string, channel?: string, context?: Record<string, unknown>) {
    super(message, { ...context, channel });
    this.channel = channel;
  }
}

/**
 * Notification delivery failed
 */
export class NotifyDeliveryError extends NotifyError {
  readonly code = 'NOTIFY_DELIVERY_FAILED';
  readonly alertId: string;

  constructor(alertId: string, channel: string, reason: string, context?: Record<string, unknown>) {
    super(`Notification delivery failed: ${reason}`, channel, { ...context, alertId });
    this.alertId = alertId;
  }
}

/**
 * Notification channel unavailable
 */
export class NotifyChannelUnavailableError extends NotifyError {
  readonly code = 'NOTIFY_CHANNEL_UNAVAILABLE';

  constructor(channel: string, reason: string, context?: Record<string, unknown>) {
    super(`Notification channel unavailable: ${reason}`, channel, context);
  }
}

/**
 * Notification retry exhausted
 */
export class NotifyRetryExhaustedError extends NotifyError {
  readonly code = 'NOTIFY_RETRY_EXHAUSTED';
  readonly alertId: string;
  readonly attemptCount: number;

  constructor(alertId: string, channel: string, attemptCount: number, context?: Record<string, unknown>) {
    super(`Notification retry exhausted after ${attemptCount} attempts`, channel, { ...context, alertId, attemptCount });
    this.alertId = alertId;
    this.attemptCount = attemptCount;
  }
}

/**
 * Notification rate limited
 */
export class NotifyRateLimitedError extends NotifyError {
  readonly code = 'NOTIFY_RATE_LIMITED';
  readonly retryAfterMs?: number;

  constructor(channel: string, retryAfterMs?: number, context?: Record<string, unknown>) {
    super(`Notification rate limited${retryAfterMs ? `, retry after ${retryAfterMs}ms` : ''}`, channel, { ...context, retryAfterMs });
    this.retryAfterMs = retryAfterMs;
  }
}

// ============================================================================
// CONFIGURATION ERRORS
// ============================================================================

/**
 * Base configuration error
 */
export abstract class ConfigError extends AlertingError {
  readonly category = AlertingErrorCategory.Configuration;
}

/**
 * Invalid configuration value
 */
export class InvalidConfigError extends ConfigError {
  readonly code = 'CONFIG_INVALID';
  readonly configKey: string;

  constructor(configKey: string, reason: string, context?: Record<string, unknown>) {
    super(`Invalid configuration '${configKey}': ${reason}`, { ...context, configKey });
    this.configKey = configKey;
  }
}

/**
 * Missing required configuration
 */
export class MissingConfigError extends ConfigError {
  readonly code = 'CONFIG_MISSING';
  readonly configKey: string;

  constructor(configKey: string, context?: Record<string, unknown>) {
    super(`Missing required configuration: ${configKey}`, { ...context, configKey });
    this.configKey = configKey;
  }
}

/**
 * Configuration validation failed
 */
export class ConfigValidationError extends ConfigError {
  readonly code = 'CONFIG_VALIDATION_FAILED';
  readonly errors: string[];

  constructor(errors: string[], context?: Record<string, unknown>) {
    super(`Configuration validation failed: ${errors.join(', ')}`, { ...context, errors });
    this.errors = errors;
  }
}

// ============================================================================
// VALIDATION ERRORS
// ============================================================================

/**
 * Base validation error
 */
export abstract class ValidationError extends AlertingError {
  readonly category = AlertingErrorCategory.Validation;
}

/**
 * Invalid signal format
 */
export class InvalidSignalError extends ValidationError {
  readonly code = 'SIGNAL_INVALID';
  readonly signalId?: string;

  constructor(reason: string, signalId?: string, context?: Record<string, unknown>) {
    super(`Invalid signal: ${reason}`, { ...context, signalId });
    this.signalId = signalId;
  }
}

/**
 * Invalid alert format
 */
export class InvalidAlertError extends ValidationError {
  readonly code = 'ALERT_INVALID';
  readonly alertId?: string;

  constructor(reason: string, alertId?: string, context?: Record<string, unknown>) {
    super(`Invalid alert: ${reason}`, { ...context, alertId });
    this.alertId = alertId;
  }
}

/**
 * Invalid payload format
 */
export class InvalidPayloadError extends ValidationError {
  readonly code = 'PAYLOAD_INVALID';
  readonly field?: string;

  constructor(reason: string, field?: string, context?: Record<string, unknown>) {
    super(`Invalid payload${field ? ` (field: ${field})` : ''}: ${reason}`, { ...context, field });
    this.field = field;
  }
}

// ============================================================================
// INTERNAL ERRORS
// ============================================================================

/**
 * Base internal error
 */
export abstract class InternalError extends AlertingError {
  readonly category = AlertingErrorCategory.Internal;
}

/**
 * Unexpected internal error
 */
export class UnexpectedError extends InternalError {
  readonly code = 'INTERNAL_UNEXPECTED';
  readonly originalError?: Error;

  constructor(message: string, originalError?: Error, context?: Record<string, unknown>) {
    super(message, { ...context, originalError: originalError?.message });
    this.originalError = originalError;
  }
}

/**
 * State machine error
 */
export class StateMachineError extends InternalError {
  readonly code = 'STATE_MACHINE_ERROR';
  readonly currentState: string;
  readonly attemptedTransition: string;

  constructor(currentState: string, attemptedTransition: string, reason: string, context?: Record<string, unknown>) {
    super(`State machine error: cannot transition from '${currentState}' via '${attemptedTransition}': ${reason}`, {
      ...context,
      currentState,
      attemptedTransition,
    });
    this.currentState = currentState;
    this.attemptedTransition = attemptedTransition;
  }
}

/**
 * Invariant violation
 */
export class InvariantViolationError extends InternalError {
  readonly code = 'INVARIANT_VIOLATION';
  readonly invariant: string;

  constructor(invariant: string, context?: Record<string, unknown>) {
    super(`Invariant violation: ${invariant}`, { ...context, invariant });
    this.invariant = invariant;
  }
}

// ============================================================================
// ERROR HELPERS
// ============================================================================

/**
 * Check if error is an AlertingError
 */
export function isAlertingError(error: unknown): error is AlertingError {
  return error instanceof AlertingError;
}

/**
 * Check if error is a specific alerting error type
 */
export function isAlertingErrorCode(error: unknown, code: string): boolean {
  return isAlertingError(error) && error.code === code;
}

/**
 * Wrap unknown error as AlertingError
 */
export function wrapError(error: unknown, context?: Record<string, unknown>): AlertingError {
  if (isAlertingError(error)) {
    return error;
  }
  
  if (error instanceof Error) {
    return new UnexpectedError(error.message, error, context);
  }
  
  return new UnexpectedError(String(error), undefined, context);
}
