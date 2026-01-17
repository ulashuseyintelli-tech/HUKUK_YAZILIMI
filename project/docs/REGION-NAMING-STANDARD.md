# Region Naming Standard

Phase 6C: Region-aware isimlendirme standardı.

---

## Overview

Her "global" sanılan şey aslında scoped'dur. Bu doküman, region-aware isimlendirme standardını tanımlar.

**Hedef:** Bugün tek region'da koşarken bile, yarın çok region'a geçince isimlerin ve sözleşmelerin kırılmaması.

---

## 1. Region Identity

### 1.1 Region ID Format

```
{provider}-{location}-{index}
```

veya

```
{provider}-default
```

**Örnekler:**
- `tr-default` - Default single-region
- `tr-istanbul-1` - Turkey primary
- `tr-ankara-1` - Turkey secondary
- `eu-west-1` - EU primary
- `eu-central-1` - EU secondary

### 1.2 Default Region

Tek region deployment'larda: `tr-default`

---

## 2. Key Format Standard

### 2.1 Format

```
r:{regionId}:t:{tenantId}:{namespace}:{key}
```

**Bileşenler:**
- `r:` - Region prefix (literal)
- `{regionId}` - Region identifier
- `t:` - Tenant prefix (literal)
- `{tenantId}` - Tenant identifier
- `{namespace}` - Artifact namespace
- `{key}` - Artifact-specific key

### 2.2 Namespaces

| Namespace | Kullanım |
|-----------|----------|
| `cache` | Cache keys |
| `cb` | Circuit breaker state |
| `rl` | Rate limit buckets |
| `trace` | Trace storage |
| `lock` | Distributed locks |
| `session` | Session state |

### 2.3 Örnekler

```
# Cache key
r:tr-default:t:123:cache:rate:v5:2024-01-15

# Circuit breaker
r:tr-default:t:123:cb:rate_provider

# Rate limit
r:tr-default:t:123:rl:calc_preview

# Trace
r:tr-default:t:123:trace:abc-123-def

# Lock
r:tr-default:t:123:lock:case:456

# Session
r:tr-default:t:123:session:user:789
```

---

## 3. API Contract

### 3.1 Response Meta

```typescript
interface ResponseMeta {
  traceId: string;
  requestHash: string;
  serverVersion: string;
  replay?: boolean;
  
  // Region-aware (optional)
  regionId?: string;
  tenantScope?: string;
}
```

### 3.2 Trace Meta

```typescript
interface TraceMeta {
  traceId: string;
  tenantId: string;
  // ...
  
  // Region-aware (optional)
  regionId?: string;
  tenantScope?: string;
}
```

---

## 4. SDK Contract

### 4.1 Config

```typescript
interface SdkConfig {
  // Existing...
  
  // Region-aware (optional)
  regionId?: string;           // Default: 'tr-default'
  regionRouting?: 'disabled';  // Only 'disabled' for now
}
```

### 4.2 Kullanım

```typescript
const sdk = new CalcPreviewSdk({
  baseUrl: 'https://api.example.com',
  apiKey: 'key',
  regionId: 'tr-istanbul-1',  // Optional
});
```

---

## 5. Observability

### 5.1 Metrics Labels

```typescript
{
  regionId: 'tr-default',  // Required (default if missing)
  tenantId: '123',
  endpoint: '/calc/preview',
  status: 'success',
}
```

### 5.2 Log Context

```typescript
{
  regionId: 'tr-default',
  tenantId: '123',
  traceId: 'abc-123',
  // ...
}
```

---

## 6. Migration

### 6.1 Backward Compatibility

Tüm yeni alanlar opsiyonel:
- Missing `regionId` → `tr-default`
- Missing `tenantScope` → derive from `tenantId`

### 6.2 Key Migration (Future)

1. Yeni kod her iki formatı yazar (dual-write)
2. Yeni kod önce yeni formatı okur, fallback eski
3. Background job eski key'leri migrate eder
4. Eski format desteği kaldırılır

**Phase 6C'de:** Sadece adım 1 - yeni format yaz.

---

## 7. Code Usage

### 7.1 API (Backend)

```typescript
import { 
  buildCacheKey, 
  buildBreakerKey,
  createTenantScope,
  DEFAULT_REGION,
} from './region';

// Create scope
const scope = createTenantScope('tenant-123');
// => { regionId: 'tr-default', tenantId: 'tenant-123' }

// Build keys
const cacheKey = buildCacheKey(scope, 'rate:v5:2024-01-15');
// => 'r:tr-default:t:tenant-123:cache:rate:v5:2024-01-15'

const breakerKey = buildBreakerKey(scope, 'rate_provider');
// => 'r:tr-default:t:tenant-123:cb:rate_provider'
```

### 7.2 SDK (Client)

```typescript
import { DEFAULT_REGION, isValidRegionId } from '@hukuk/calc-preview-sdk';

// Validate region
isValidRegionId('tr-istanbul-1'); // true
isValidRegionId('invalid');       // false

// Use in config
const sdk = new CalcPreviewSdk({
  baseUrl: 'https://api.example.com',
  apiKey: 'key',
  regionId: 'tr-istanbul-1',
});
```

---

## 8. Non-Goals (Phase 6C)

| Feature | Status |
|---------|--------|
| Region routing | ❌ Future |
| Data migration | ❌ Future |
| Region failover | ❌ Future |
| Multi-region deploy | ❌ Future |

---

## 9. Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Key format tutarlılığı | Tek `buildScopedKey` function |
| Default region | `DEFAULT_REGION` constant |
| Backward compatibility | Tüm yeni alanlar opsiyonel |
| Namespace validation | TypeScript union type |
