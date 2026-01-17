/**
 * Region Constants
 * 
 * Default region and known regions.
 * Phase 6C: Single source of truth.
 */

import type { RegionId, ArtifactNamespace } from './region.types';

/**
 * Default region for single-region deployments.
 * Used when regionId is not specified.
 */
export const DEFAULT_REGION: RegionId = 'tr-default';

/**
 * Known regions (for validation and documentation).
 * Extensible at runtime via config.
 */
export const KNOWN_REGIONS = [
  'tr-default',     // Default single-region
  'tr-istanbul-1',  // Turkey primary
  'tr-ankara-1',    // Turkey secondary
  'eu-west-1',      // EU primary
  'eu-central-1',   // EU secondary
] as const;

/**
 * Known artifact namespaces.
 */
export const ARTIFACT_NAMESPACES: readonly ArtifactNamespace[] = [
  'cache',
  'cb',
  'rl',
  'trace',
  'lock',
  'session',
] as const;

/**
 * Region ID format pattern.
 * Matches: xx-location-N or xx-default
 */
export const REGION_ID_PATTERN = /^[a-z]{2}-[a-z]+-(\d+|default)$/;

/**
 * Scoped key format pattern.
 * Matches: r:{regionId}:t:{tenantId}:{namespace}:{key}
 */
export const SCOPED_KEY_PATTERN = /^r:([^:]+):t:([^:]+):([^:]+):(.+)$/;

/**
 * Key prefix constants.
 */
export const KEY_PREFIXES = {
  REGION: 'r',
  TENANT: 't',
} as const;
