/**
 * Region Types
 * 
 * Core types for region-aware naming.
 * Phase 6C: Naming only, no routing.
 */

/**
 * Region identifier.
 * Format: {provider}-{location}-{index} or {provider}-default
 * 
 * @example 'tr-default', 'tr-istanbul-1', 'eu-west-1'
 */
export type RegionId = string;

/**
 * Tenant scope within a region.
 * Every artifact is scoped to a tenant within a region.
 */
export interface TenantScope {
  readonly regionId: RegionId;
  readonly tenantId: string;
}

/**
 * Known artifact namespaces.
 * Used for key prefixing and validation.
 */
export type ArtifactNamespace =
  | 'cache'    // Cache keys
  | 'cb'       // Circuit breaker state
  | 'rl'       // Rate limit buckets
  | 'trace'    // Trace storage
  | 'lock'     // Distributed locks
  | 'session'; // Session state

/**
 * Artifact scope for keys.
 * Extends tenant scope with namespace.
 */
export interface ArtifactScope extends TenantScope {
  readonly namespace: ArtifactNamespace;
}

/**
 * Scoped key components.
 * Result of parsing a scoped key.
 */
export interface ScopedKeyComponents {
  readonly regionId: RegionId;
  readonly tenantId: string;
  readonly namespace: ArtifactNamespace;
  readonly key: string;
}

/**
 * Options for building a scoped key.
 */
export interface ScopedKeyOptions {
  readonly regionId?: RegionId;
  readonly tenantId: string;
  readonly namespace: ArtifactNamespace;
  readonly key: string;
}

/**
 * Region metadata for responses.
 */
export interface RegionMeta {
  readonly regionId: RegionId;
  readonly tenantScope?: string;
}
