# Phase 6C: Region-Aware Naming & Contracts - Design

## Overview

Region-aware isimlendirme standardı. Deploy/routing yok, sadece "dil" standardizasyonu.

---

## 1. Region Identity Model

### 1.1 Core Types

```typescript
/**
 * Region identifier.
 * Format: {provider}-{location}-{index}
 * Examples: tr-default, eu-west-1, tr-istanbul-1
 */
type RegionId = string;

/**
 * Default region for single-region deployments.
 */
const DEFAULT_REGION: RegionId = 'tr-default';

/**
 * Tenant scope within a region.
 */
interface TenantScope {
  readonly regionId: RegionId;
  readonly tenantId: string;
}

/**
 * Artifact scope for keys.
 */
interface ArtifactScope extends TenantScope {
  readonly namespace: ArtifactNamespace;
}

/**
 * Known artifact namespaces.
 */
type ArtifactNamespace = 
  | 'cache'      // Cache keys
  | 'cb'         // Circuit breaker state
  | 'rl'         // Rate limit buckets
  | 'trace'      // Trace IDs
  | 'lock'       // Distributed locks
  | 'session';   // Session state
```

### 1.2 Region Registry

```typescript
/**
 * Known regions (for validation).
 * Extensible at runtime via config.
 */
const KNOWN_REGIONS = [
  'tr-default',    // Default single-region
  'tr-istanbul-1', // Turkey primary
  'tr-ankara-1',   // Turkey secondary
  'eu-west-1',     // EU primary
  'eu-central-1',  // EU secondary
] as const;

/**
 * Check if region is valid.
 */
function isValidRegion(regionId: string): boolean {
  // Accept known regions or custom format
  return KNOWN_REGIONS.includes(regionId as any) ||
         /^[a-z]{2}-[a-z]+-\d+$/.test(regionId);
}
```

---

## 2. Key Format Standard

### 2.1 Format Specification

```
r:{regionId}:t:{tenantId}:{namespace}:{key}
```

**Components:**
- `r:` - Region prefix (literal)
- `{regionId}` - Region identifier
- `t:` - Tenant prefix (literal)
- `{tenantId}` - Tenant identifier
- `{namespace}` - Artifact namespace
- `{key}` - Artifact-specific key

### 2.2 Key Builder

```typescript
interface ScopedKeyOptions {
  readonly regionId?: RegionId;
  readonly tenantId: string;
  readonly namespace: ArtifactNamespace;
  readonly key: string;
}

/**
 * Build scoped key.
 * Single source of truth for key format.
 */
function buildScopedKey(options: ScopedKeyOptions): string {
  const region = options.regionId ?? DEFAULT_REGION;
  return `r:${region}:t:${options.tenantId}:${options.namespace}:${options.key}`;
}

/**
 * Parse scoped key back to components.
 */
function parseScopedKey(key: string): ScopedKeyOptions | null {
  const match = key.match(/^r:([^:]+):t:([^:]+):([^:]+):(.+)$/);
  if (!match) return null;
  
  return {
    regionId: match[1],
    tenantId: match[2],
    namespace: match[3] as ArtifactNamespace,
    key: match[4],
  };
}
```

### 2.3 Namespace-Specific Builders

```typescript
// Cache key
function buildCacheKey(scope: TenantScope, cacheKey: string): string {
  return buildScopedKey({ ...scope, namespace: 'cache', key: cacheKey });
}

// Circuit breaker key
function buildBreakerKey(scope: TenantScope, dependency: string): string {
  return buildScopedKey({ ...scope, namespace: 'cb', key: dependency });
}

// Rate limit key
function buildRateLimitKey(scope: TenantScope, endpoint: string): string {
  return buildScopedKey({ ...scope, namespace: 'rl', key: endpoint });
}

// Trace key
function buildTraceKey(scope: TenantScope, traceId: string): string {
  return buildScopedKey({ ...scope, namespace: 'trace', key: traceId });
}
```

---

## 3. Contract Surface Updates

### 3.1 API Response Meta

```typescript
interface ResponseMeta {
  readonly traceId: string;
  readonly requestHash: string;
  readonly serverVersion: string;
  readonly replay?: boolean;
  
  // NEW: Region-aware fields (optional)
  readonly regionId?: RegionId;
  readonly tenantScope?: string;
}
```

### 3.2 SDK Config

```typescript
interface SdkConfig {
  // Existing fields...
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly bearerToken?: string;
  readonly timeout?: number;
  readonly deadline?: number;
  readonly retry?: RetryConfig;
  readonly headers?: Record<string, string>;
  readonly logging?: LoggingConfig;
  
  // NEW: Region-aware fields (optional)
  readonly regionId?: RegionId;
  readonly regionRouting?: 'disabled';  // Only 'disabled' for now
}
```

### 3.3 TraceBundle Meta

```typescript
interface TraceMeta {
  readonly traceId: string;
  readonly requestId: string;
  readonly tenantId: string;
  readonly clientId?: string;
  readonly endpoint: string;
  readonly mode: 'PREVIEW';
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly version: TraceVersionInfo;
  
  // NEW: Region-aware fields (optional)
  readonly regionId?: RegionId;
  readonly tenantScope?: string;
}
```

---

## 4. Migration Strategy

### 4.1 Backward Compatibility

All new fields are optional:
- Missing `regionId` → use `DEFAULT_REGION`
- Missing `tenantScope` → derive from `tenantId`
- Missing region in key → assume default

### 4.2 Key Migration

Existing keys without region prefix:
```
cache:rate:v5:2024-01-15
```

New keys with region prefix:
```
r:tr-default:t:123:cache:rate:v5:2024-01-15
```

**Migration approach:**
1. New code writes both formats (dual-write)
2. New code reads new format first, falls back to old
3. Background job migrates old keys
4. Remove old format support

**For 6C:** Only step 1 - write new format. No migration yet.

---

## 5. Observability

### 5.1 Metrics Labels

```typescript
interface MetricLabels {
  readonly regionId: RegionId;  // Required (default if missing)
  readonly tenantId: string;
  readonly endpoint: string;
  readonly status: string;
}
```

### 5.2 Log Context

```typescript
interface LogContext {
  readonly regionId: RegionId;
  readonly tenantId: string;
  readonly traceId: string;
  // ... other fields
}
```

---

## 6. File Structure

```
apps/api/src/modules/calc-preview/
├── region/
│   ├── region.types.ts      # Core types
│   ├── region.constants.ts  # Default region, known regions
│   ├── scoped-key.ts        # Key builder/parser
│   └── index.ts             # Exports

packages/calc-preview-sdk/src/
├── types/
│   ├── region.ts            # SDK region types
│   └── config.ts            # Updated with regionId
```

---

## 7. Non-Goals (Explicit)

| Feature | Status | Reason |
|---------|--------|--------|
| Region routing | ❌ | Future phase |
| Data migration | ❌ | Future phase |
| Region failover | ❌ | Future phase |
| Multi-region deploy | ❌ | Future phase |
| Region-specific config | ❌ | Future phase |

---

## 8. Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Key format consistency | Single `buildScopedKey` function |
| Default region | `DEFAULT_REGION` constant |
| Backward compatibility | All new fields optional |
| Namespace validation | TypeScript union type |
