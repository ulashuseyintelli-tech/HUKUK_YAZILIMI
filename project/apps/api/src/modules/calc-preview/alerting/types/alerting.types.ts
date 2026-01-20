/**
 * Alerting Types
 * 
 * Production Alerting System - Sprint 0
 * 
 * Core types and enums for the alerting system.
 * 
 * @see .kiro/specs/production-alerting-system/requirements.md
 * @see .kiro/specs/production-alerting-system/design.md
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Alert Severity Levels
 * 
 * P0: Critical - Immediate pager alert (SECURITY only)
 * P1: High - Pager alert, requires immediate attention
 * P2: Medium - Ticket creation, requires attention within SLA
 * P3: Low - Log only, informational
 * 
 * @see Requirements 15.1
 */
export enum AlertSeverity {
  P0 = 'P0',
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
}

/**
 * Alert Categories
 * 
 * Each category maps to a specific owner team.
 * 
 * SECURITY: JTI anomaly, cross-tenant access, manual reset required
 * AVAILABILITY: DEGRADED mode, consecutive failures
 * CAPACITY: Rate limits, queue depth, resource pressure
 * INTEGRITY: Audit trail failures, status mismatches
 * HYGIENE: Validation error spikes
 * 
 * @see Requirements 3, 4, 5, 6, 7
 */
export enum AlertCategory {
  SECURITY = 'SECURITY',
  AVAILABILITY = 'AVAILABILITY',
  CAPACITY = 'CAPACITY',
  INTEGRITY = 'INTEGRITY',
  HYGIENE = 'HYGIENE',
}

/**
 * Owner Teams
 * 
 * Routing targets for alerts based on category.
 * 
 * @see Requirements 11.1-11.6
 */
export enum OwnerTeam {
  SecOps = 'SecOps',
  PlatformSRE = 'Platform/SRE',
  DataPlatform = 'Data/Platform',
  ProductBackend = 'Product/Backend',
}

/**
 * Tenant Scope
 * 
 * Determines the impact scope of an alert.
 * 
 * single_tenant: Affects only one tenant
 * multi_tenant: Affects 3+ tenants within 5 minute window
 * global: Affects cross-tenant/management paths or system-wide
 * 
 * @see Requirements 10.1-10.4
 */
export enum TenantScope {
  SingleTenant = 'single_tenant',
  MultiTenant = 'multi_tenant',
  Global = 'global',
}

/**
 * Alert Status
 * 
 * Lifecycle states for alerts/incidents.
 */
export enum AlertStatus {
  Open = 'OPEN',
  Acknowledged = 'ACKNOWLEDGED',
  Resolved = 'RESOLVED',
}

/**
 * Incident Status
 */
export enum IncidentStatus {
  Open = 'OPEN',
  Resolved = 'RESOLVED',
}

/**
 * Resolution Reason
 * 
 * How an incident was resolved.
 * 
 * @see Requirements 8.2
 */
export enum ResolutionReason {
  AutoRecovery = 'auto_recovery',
  ManualReset = 'manual_reset',
  Timeout = 'timeout',
}

/**
 * Escalation Policy
 * 
 * Determines notification urgency based on severity.
 */
export enum EscalationPolicy {
  Pager = 'pager',
  Ticket = 'ticket',
  LogOnly = 'log_only',
}

/**
 * Notification Channel
 */
export enum NotificationChannel {
  Slack = 'slack',
  PagerDuty = 'pagerduty',
  Email = 'email',
  Webhook = 'webhook',
  Console = 'console',
}

/**
 * Suppression Reason
 * 
 * Why an alert was suppressed.
 * 
 * @see Requirements 17.1-17.5
 */
export enum SuppressionReason {
  MaintenanceClamp = 'maintenance_clamp',
  ParentInhibit = 'parent_inhibit',
  CooldownActive = 'cooldown_active',
  DedupeWindow = 'dedupe_window',
}

/**
 * Global Outage Reason
 * 
 * @see Requirements 17.4
 */
export enum GlobalOutageReason {
  MultiTenantEscalation = 'multi_tenant_escalation',
  CriticalDependencyDown = 'critical_dependency_down',
  ManualDeclaration = 'manual_declaration',
}

/**
 * Signal Collector Type
 */
export enum SignalCollectorType {
  Security = 'security',
  Health = 'health',
  Capacity = 'capacity',
  Integrity = 'integrity',
  Hygiene = 'hygiene',
}

// ============================================================================
// ALERT TYPES (String Literals)
// ============================================================================

/**
 * Security Alert Types
 * 
 * @see Requirements 3.1-3.5
 */
export const SecurityAlertTypes = {
  JTI_ANOMALY_DETECTED: 'BREAK_GLASS_JTI_ANOMALY_DETECTED',
  CROSS_TENANT_ATTEMPT: 'CROSS_TENANT_ACCESS_ATTEMPT',
  CROSS_TENANT_BLOCKED: 'CROSS_TENANT_ACCESS_BLOCKED',
  MANUAL_RESET_REQUIRED: 'MANUAL_RESET_REQUIRED',
} as const;

export type SecurityAlertType = typeof SecurityAlertTypes[keyof typeof SecurityAlertTypes];

/**
 * Availability Alert Types
 * 
 * @see Requirements 1.1-1.5, 4.1-4.3
 */
export const AvailabilityAlertTypes = {
  DEGRADED_ENTERED: 'DEGRADED_ENTERED',
  DEGRADED_PERSISTING: 'DEGRADED_PERSISTING',
  FAILURE_TREND_CRITICAL: 'FAILURE_TREND_CRITICAL',
} as const;

export type AvailabilityAlertType = typeof AvailabilityAlertTypes[keyof typeof AvailabilityAlertTypes];

/**
 * Capacity Alert Types
 * 
 * @see Requirements 5.1-5.6
 */
export const CapacityAlertTypes = {
  TENANT_RATE_LIMIT_EXHAUSTED: 'TENANT_RATE_LIMIT_EXHAUSTED',
  TENANT_RATE_LIMIT_EXHAUSTED_SUSTAINED: 'TENANT_RATE_LIMIT_EXHAUSTED_SUSTAINED',
  QUEUE_DEPTH_HIGH: 'QUEUE_DEPTH_HIGH',
  QUEUE_DEPTH_CRITICAL: 'QUEUE_DEPTH_CRITICAL',
  CPU_HIGH: 'CPU_HIGH',
  MEMORY_HIGH: 'MEMORY_HIGH',
  FD_EXHAUSTION: 'FD_EXHAUSTION',
} as const;

export type CapacityAlertType = typeof CapacityAlertTypes[keyof typeof CapacityAlertTypes];

/**
 * Integrity Alert Types
 * 
 * @see Requirements 6.1-6.3
 */
export const IntegrityAlertTypes = {
  AUDIT_WRITE_FAILURE: 'AUDIT_WRITE_FAILURE',
  STATUS_MISMATCH: 'STATUS_MISMATCH',
} as const;

export type IntegrityAlertType = typeof IntegrityAlertTypes[keyof typeof IntegrityAlertTypes];

/**
 * Hygiene Alert Types
 * 
 * @see Requirements 7.1-7.2
 */
export const HygieneAlertTypes = {
  VALIDATION_ERROR_SPIKE: 'VALIDATION_ERROR_SPIKE',
} as const;

export type HygieneAlertType = typeof HygieneAlertTypes[keyof typeof HygieneAlertTypes];

/**
 * Recovery Alert Types
 * 
 * @see Requirements 8.1-8.3
 */
export const RecoveryAlertTypes = {
  INCIDENT_RESOLVED: 'INCIDENT_RESOLVED',
  RECOVERY_WITH_FLAPPING_RISK: 'RECOVERY_WITH_FLAPPING_RISK',
} as const;

export type RecoveryAlertType = typeof RecoveryAlertTypes[keyof typeof RecoveryAlertTypes];

/**
 * Flapping Alert Types
 * 
 * @see Requirements 9.1-9.5
 */
export const FlappingAlertTypes = {
  FLAPPING_DETECTED: 'FLAPPING_DETECTED',
  FLAPPING_RCA_REQUIRED: 'FLAPPING_RCA_REQUIRED',
} as const;

export type FlappingAlertType = typeof FlappingAlertTypes[keyof typeof FlappingAlertTypes];

/**
 * Global Outage Alert Types
 */
export const GlobalOutageAlertTypes = {
  GLOBAL_OUTAGE_ACTIVE: 'GLOBAL_OUTAGE_ACTIVE',
  GLOBAL_OUTAGE_RESOLVED: 'GLOBAL_OUTAGE_RESOLVED',
} as const;

export type GlobalOutageAlertType = typeof GlobalOutageAlertTypes[keyof typeof GlobalOutageAlertTypes];

/**
 * All Alert Types Union
 */
export type AlertType =
  | SecurityAlertType
  | AvailabilityAlertType
  | CapacityAlertType
  | IntegrityAlertType
  | HygieneAlertType
  | RecoveryAlertType
  | FlappingAlertType
  | GlobalOutageAlertType;

// ============================================================================
// MAPPINGS
// ============================================================================

/**
 * Category to Owner Team mapping
 * 
 * @see Requirements 11.1-11.6
 */
export const CATEGORY_OWNER_MAP: Record<AlertCategory, OwnerTeam> = {
  [AlertCategory.SECURITY]: OwnerTeam.SecOps,
  [AlertCategory.AVAILABILITY]: OwnerTeam.PlatformSRE,
  [AlertCategory.CAPACITY]: OwnerTeam.PlatformSRE,
  [AlertCategory.INTEGRITY]: OwnerTeam.DataPlatform,
  [AlertCategory.HYGIENE]: OwnerTeam.ProductBackend,
};

/**
 * Severity to Escalation Policy mapping
 */
export const SEVERITY_ESCALATION_MAP: Record<AlertSeverity, EscalationPolicy> = {
  [AlertSeverity.P0]: EscalationPolicy.Pager,
  [AlertSeverity.P1]: EscalationPolicy.Pager,
  [AlertSeverity.P2]: EscalationPolicy.Ticket,
  [AlertSeverity.P3]: EscalationPolicy.LogOnly,
};

/**
 * Severity numeric values for comparison
 */
export const SEVERITY_NUMERIC: Record<AlertSeverity, number> = {
  [AlertSeverity.P0]: 0,
  [AlertSeverity.P1]: 1,
  [AlertSeverity.P2]: 2,
  [AlertSeverity.P3]: 3,
};

/**
 * Compare severities (lower number = higher severity)
 */
export function compareSeverity(a: AlertSeverity, b: AlertSeverity): number {
  return SEVERITY_NUMERIC[a] - SEVERITY_NUMERIC[b];
}

/**
 * Get the more severe of two severities
 */
export function maxSeverity(a: AlertSeverity, b: AlertSeverity): AlertSeverity {
  return compareSeverity(a, b) <= 0 ? a : b;
}

/**
 * Get the less severe of two severities
 */
export function minSeverity(a: AlertSeverity, b: AlertSeverity): AlertSeverity {
  return compareSeverity(a, b) >= 0 ? a : b;
}

/**
 * Check if severity is at least as severe as threshold
 */
export function isAtLeastSeverity(severity: AlertSeverity, threshold: AlertSeverity): boolean {
  return compareSeverity(severity, threshold) <= 0;
}

// ============================================================================
// SIGNAL TYPES
// ============================================================================

/**
 * Security Signal Types
 */
export const SecuritySignalTypes = {
  JTI_ANOMALY: 'JTI_ANOMALY',
  CROSS_TENANT_ATTEMPT: 'CROSS_TENANT_ATTEMPT',
  CROSS_TENANT_BLOCKED: 'CROSS_TENANT_BLOCKED',
} as const;

export type SecuritySignalType = typeof SecuritySignalTypes[keyof typeof SecuritySignalTypes];

/**
 * Health Signal Types
 */
export const HealthSignalTypes = {
  DEGRADED_ENTERED: 'DEGRADED_ENTERED',
  DEGRADED_EXITED: 'DEGRADED_EXITED',
  FAILURE_RECORDED: 'FAILURE_RECORDED',
  MANUAL_RESET_REQUIRED: 'MANUAL_RESET_REQUIRED',
} as const;

export type HealthSignalType = typeof HealthSignalTypes[keyof typeof HealthSignalTypes];

/**
 * Capacity Signal Types
 */
export const CapacitySignalTypes = {
  RATE_LIMIT_EXHAUSTED: 'RATE_LIMIT_EXHAUSTED',
  QUEUE_DEPTH_HIGH: 'QUEUE_DEPTH_HIGH',
  RESOURCE_HIGH: 'RESOURCE_HIGH',
} as const;

export type CapacitySignalType = typeof CapacitySignalTypes[keyof typeof CapacitySignalTypes];

/**
 * Integrity Signal Types
 */
export const IntegritySignalTypes = {
  AUDIT_WRITE_FAILURE: 'AUDIT_WRITE_FAILURE',
  STATUS_MISMATCH: 'STATUS_MISMATCH',
} as const;

export type IntegritySignalType = typeof IntegritySignalTypes[keyof typeof IntegritySignalTypes];

/**
 * Hygiene Signal Types
 */
export const HygieneSignalTypes = {
  VALIDATION_ERROR_SPIKE: 'VALIDATION_ERROR_SPIKE',
} as const;

export type HygieneSignalType = typeof HygieneSignalTypes[keyof typeof HygieneSignalTypes];

/**
 * Anomaly Severity (for JTI anomaly detection)
 */
export enum AnomalySeverity {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
}

/**
 * Resource Type (for capacity signals)
 */
export enum ResourceType {
  CPU = 'cpu',
  Memory = 'memory',
  FileDescriptor = 'fd',
}
