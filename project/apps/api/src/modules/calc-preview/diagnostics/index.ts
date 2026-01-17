/**
 * Diagnostics Module - Public Exports
 * 
 * Phase 7A - Self-serve Diagnostics
 */

// Module
export { DiagnosticsModule } from './diagnostics.module';

// Services
export { DiagnosticsService } from './diagnostics.service';
export { DiagnosticsAggregatorService } from './diagnostics-aggregator.service';
export { DiagnosticsRedactionService } from './diagnostics-redaction.service';
export { DiagnosticsAuditService } from './diagnostics-audit.service';
export { DiagnosticsIncidentService } from './diagnostics-incident.service';

// Guards
export { DiagnosticsRBACGuard, DiagnosticsRateLimitGuard, TenantContext } from './guards';

// Types
export {
  // Tenant context
  TenantAccessContext,
  ROLE_PERMISSIONS,
  
  // Health
  HealthStatus,
  DiagnosticsHealthResponse,
  CacheHealthInfo,
  CircuitBreakerHealthInfo,
  RateLimitHealthInfo,
  PolicyEngineHealthInfo,
  IncidentCriteria,
  
  // Metrics
  MetricsWindow,
  VALID_METRICS_WINDOWS,
  METRICS_WINDOW_MS,
  DiagnosticsMetricsResponse,
  LatencyMetrics,
  RateMetrics,
  CountMetrics,
  
  // Traces (Sprint 2)
  TraceListQuery,
  TraceSeverityFilter,
  TraceStatusFilter,
  DiagnosticsTraceSummary,
  DiagnosticsTraceListResponse,
  DiagnosticsTraceDetailResponse,
  TraceCursor,
  TRACE_QUERY_LIMITS,
  TRACE_SIZE_LIMITS,
  
  // Audit (Sprint 2)
  AuditAction,
  DiagnosticsAuditEntry,
  
  // Incidents (Sprint 3)
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
  DiagnosticsIncident,
  IncidentEvidence,
  IncidentSummaryStats,
  DiagnosticsIncidentResponse,
  IncidentDetectionConfig,
  DEFAULT_INCIDENT_CONFIG,
  INCIDENT_TYPE_META,
  
  // Errors
  DiagnosticsErrorResponse,
  
  // Constants
  DIAGNOSTICS_SLO,
  DIAGNOSTICS_RATE_LIMITS,
  
  // Type guards
  isValidMetricsWindow,
  isValidRole,
  isValidIncidentType,
  isValidIncidentSeverity,
} from './diagnostics.types';
