/**
 * Region Types (SDK)
 * 
 * Region-aware types for SDK.
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
 * Default region for single-region deployments.
 */
export const DEFAULT_REGION: RegionId = 'tr-default';

/**
 * Known regions (for documentation).
 */
export const KNOWN_REGIONS = [
  'tr-default',
  'tr-istanbul-1',
  'tr-ankara-1',
  'eu-west-1',
  'eu-central-1',
] as const;

/**
 * Region routing mode.
 * Currently only 'disabled' is supported.
 */
export type RegionRoutingMode = 'disabled';

/**
 * Region configuration for SDK.
 */
export interface RegionConfig {
  /** Region identifier (optional, defaults to tr-default) */
  readonly regionId?: RegionId;
  
  /** Region routing mode (only 'disabled' for now) */
  readonly regionRouting?: RegionRoutingMode;
}

/**
 * Validate region ID format.
 */
export function isValidRegionId(regionId: string): boolean {
  return /^[a-z]{2}-[a-z]+-(\d+|default)$/.test(regionId);
}
