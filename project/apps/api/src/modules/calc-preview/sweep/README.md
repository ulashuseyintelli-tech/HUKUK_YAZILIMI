# Phase 5.7 - Compile/Lint/Integration Sweep

> "Kullanılmayan kod yok, çakışan env flag yok, prod build'de test/chaos/debug kalıntısı yok."

## Amaç

Bu aşama "yeni şey ekleme" modunda değil; **çöp toplama ve çatışma kapatma** modundadır.
En çok production kazasını burada engellersin.

## Çıkış Kriterleri

- [x] `npm run build` → warning = 0
- [x] `npm run lint` → error = 0
- [x] CI full pipeline → yeşil
- [x] Prod build'de:
  - chaos yok
  - regression yok
  - test util yok
- [x] Env flag tablosu dokümante

## Araçlar

### 1. Environment Flags Registry (`env-flags.ts`)

Tüm env flag'lerin merkezi kaydı. `process.env` doğrudan kullanımı YASAK.

```typescript
import { getEnvConfig } from './sweep/env-flags';

const config = getEnvConfig();
if (config.enableChaosEndpoints) {
  // ...
}
```

### 2. Module Boundary Sweep (`module-boundary-sweep.ts`)

Import grafiğini analiz eder:

```bash
npx ts-node src/modules/calc-preview/sweep/module-boundary-sweep.ts
```

Kurallar:
- `NO_UPWARD_IMPORTS`: Internal modules → parent import edemez
- `NO_CROSS_PROVIDER_IMPORTS`: Provider'lar birbirini göremez
- `NO_CHAOS_IN_PROD`: Chaos module prod code'da import edilemez
- `NO_REGRESSION_IN_PROD`: Regression module prod code'da import edilemez

### 3. Build Artifact Sweep (`build-artifact-sweep.ts`)

Prod build'in temiz olduğunu doğrular:

```bash
npx ts-node src/modules/calc-preview/sweep/build-artifact-sweep.ts dist
```

Kontroller:
- chaos/ klasörü yok
- regression/ klasörü yok
- .spec.js dosyaları yok
- FaultInjectorService referansı yok
- Source map'ler kapalı

### 4. ESLint Architectural Rules

```javascript
// eslint-architecture.rules.js
'no-restricted-imports': [
  'error',
  {
    patterns: [
      { group: ['**/chaos/**'], message: 'Chaos module cannot be imported in production code.' },
      { group: ['**/regression/**'], message: 'Regression module is test-only.' },
    ],
  },
],
```

### 5. Integration Sweep Tests

3 kritik akışı test eder:

1. **Happy Path**: cache hit, breaker CLOSED
2. **Degraded Path**: rate_provider down, fallback
3. **Policy Block**: softCheck BLOCK

```bash
pnpm --filter api test -- --testPathPattern=integration-sweep
```

## TypeScript Strict Mode

`tsconfig.json` güncellemeleri:

```json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

## Production Build

`tsconfig.prod.json` kullanarak chaos/regression exclude:

```bash
tsc -p tsconfig.prod.json
```

## Env Flag Tablosu

| Flag | Description | Default | Prod? | Used By |
|------|-------------|---------|-------|---------|
| NODE_ENV | Runtime environment | development | ✅ | chaos.module, interest-engine.module |
| SERVICE_VERSION | Service version for trace | 1.0.0 | ✅ | trace-context |
| ENABLE_CHAOS_ENDPOINTS | Enable chaos endpoints | false | ❌ | chaos.module |
| ... | ... | ... | ... | ... |

Tam tablo için:
```bash
npx ts-node -e "const { generateEnvFlagTable } = require('./sweep/env-flags'); console.log(generateEnvFlagTable());"
```

## CI Entegrasyonu

`.github/workflows/sweep.yml`:

- `typescript-strict`: TypeScript compile check
- `eslint-architecture`: ESLint architectural rules
- `module-boundary`: Import graph analysis
- `build-artifact`: Prod build cleanliness
- `env-flag-validation`: Env flag usage check
- `integration-sweep`: 3 flow integration tests

## Sonraki Adım

Phase 5.7 bittiğinde:

> "Bu platforma feature eklemek güvenli. Çünkü yanlışlıkla eski bir şeyi bozamam."

Phase 6 (ürün genişletme) artık güvenli.
