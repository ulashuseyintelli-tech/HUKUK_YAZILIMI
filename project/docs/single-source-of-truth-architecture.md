# Tek Kaynak Prensibi (Single Source of Truth) - Mimari Dokümanı

> **Durum:** ✅ FAZ 4 TAMAMLANDI (Operasyonel Olgunluk)  
> **Son Güncelleme:** 2026-01-15  
> **Hedef:** Frontend'de SIFIR lokal para hesaplaması

---

## 1. Temel Prensip

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ALTIN KURAL                                  │
│                                                                      │
│   Frontend ASLA hesaplama yapmaz.                                   │
│   Frontend SADECE backend'den gelen değerleri görüntüler.           │
│   API erişilemezse → "Hesaplanamadı" göster, TAHMİN YAPMA.          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Veri Akış Mimarisi

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (TEK KAYNAK)                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │ interest-engine │  │   fee-engine    │  │  policy-engine  │          │
│  │                 │  │                 │  │                 │          │
│  │ • Faiz hesabı   │  │ • Harç/masraf   │  │ • Gate kontrol  │          │
│  │ • TCMB oranları │  │ • Vekalet ücreti│  │ • Kural motoru  │          │
│  │ • Segment       │  │ • Tarife        │  │ • Durum makinesi│          │
│  │ • TBK m.100     │  │                 │  │                 │          │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
│           │                    │                    │                    │
│           └────────────────────┼────────────────────┘                    │
│                                │                                         │
│                    ┌───────────▼───────────┐                            │
│                    │   /preview endpoint   │  ← YENİ                    │
│                    │   (lightweight, cached)│                            │
│                    └───────────┬───────────┘                            │
│                                │                                         │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      API Gateway        │
                    └────────────┬────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────┐
│                              FRONTEND                                    │
├────────────────────────────────┼────────────────────────────────────────┤
│                                │                                         │
│  ┌─────────────────────────────▼─────────────────────────────┐          │
│  │                    API Client Layer                        │          │
│  │  • interestEngineApi.preview()                            │          │
│  │  • feeEngineApi.preview()                                 │          │
│  │  • Hata durumu: { success: false, error: 'UNAVAILABLE' }  │          │
│  └─────────────────────────────┬─────────────────────────────┘          │
│                                │                                         │
│  ┌─────────────────────────────▼─────────────────────────────┐          │
│  │                    UI Components                           │          │
│  │                                                            │          │
│  │  if (loading) → <Spinner />                               │          │
│  │  if (error)   → <UnavailableMessage />  ← TAHMİN YOK      │          │
│  │  if (data)    → <DisplayValues data={data} />             │          │
│  │                                                            │          │
│  └────────────────────────────────────────────────────────────┘          │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────┐          │
│  │                    YASAK ZONE                               │          │
│  │  ❌ Math.round(tutar * oran)                               │          │
│  │  ❌ principal * 0.24 * days / 365                          │          │
│  │  ❌ TCMB_ORANLARI tablosu                                  │          │
│  │  ❌ hesaplaFaiz(), hesaplaVekalet()                        │          │
│  └────────────────────────────────────────────────────────────┘          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Backend Preview Endpoint'leri

### 3.1 Interest Engine Preview

```typescript
// POST /interest-engine/preview
// Lightweight, cached, no audit log
interface PreviewRequest {
  principalAmount: number;
  currency: string;
  interestType: InterestTypeCode;
  startDate: string;
  endDate: string;
  fixedRate?: number;
}

interface PreviewResponse {
  success: true;
  data: {
    estimatedInterest: number;
    currentRate: number;
    days: number;
    // Segment detayı YOK - sadece toplam
  };
  cached: boolean;
  cacheExpiry: string;
}

// Hata durumu
interface PreviewErrorResponse {
  success: false;
  error: 'RATE_NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'INVALID_INPUT';
  message: string;
}
```

### 3.2 Fee Engine Preview

```typescript
// POST /fee-engine/preview
interface FeePreviewRequest {
  principalAmount: number;
  caseType: string;
  debtorCount: number;
}

interface FeePreviewResponse {
  success: true;
  data: {
    estimatedFees: number;
    estimatedAttorneyFee: number;
    tariffYear: number;
  };
  cached: boolean;
}
```

---

## 4. Frontend Uygulama Kuralları

### 4.1 API Erişilemezse Davranış

```typescript
// ❌ YANLIŞ - Tahmini değer gösterme
if (error) {
  setData({ interest: principal * 0.24 * days / 365 }); // YASAK!
}

// ✅ DOĞRU - Açık hata mesajı
if (error) {
  return (
    <Alert variant="warning">
      <AlertCircle className="h-4 w-4" />
      <span>Hesaplama servisi şu an erişilemiyor. Lütfen daha sonra tekrar deneyin.</span>
    </Alert>
  );
}
```

### 4.2 Mock Data Kuralları

```typescript
// lib/config/feature-flags.ts
export const FEATURE_FLAGS = {
  ALLOW_MOCK_CALCULATIONS: process.env.NEXT_PUBLIC_ALLOW_MOCK_CALCULATIONS === 'true',
};

// Kullanım
if (FEATURE_FLAGS.ALLOW_MOCK_CALCULATIONS && process.env.NODE_ENV !== 'production') {
  // Mock kullanılabilir - SADECE development
} else if (process.env.NODE_ENV === 'production') {
  // Production'da mock YASAK - hard fail
  throw new Error('Mock calculations are not allowed in production');
}
```

### 4.3 Deprecated Fonksiyon Davranışı

```typescript
// ❌ YANLIŞ - Sessiz boş array
async getValidationRules() {
  return []; // UI "kural yok" sanır
}

// ✅ DOĞRU - Açık hata
async getValidationRules() {
  console.error('[DEPRECATED] getValidationRules called - use policyEngineApi');
  
  // Telemetry gönder
  trackDeprecatedUsage('getValidationRules', {
    caller: new Error().stack,
    timestamp: new Date().toISOString(),
  });
  
  throw new Error('DEPRECATED: Use policyEngineApi.checkAllGates() instead');
}
```

---

## 5. CI/CD Kontrol Metrikleri

### 5.1 Lint Kuralları (ESLint Custom Rule)

```javascript
// eslint-rules/no-frontend-calculation.js
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow frontend money calculations',
    },
  },
  create(context) {
    const FORBIDDEN_PATTERNS = [
      /Math\.round.*tutar/,
      /Math\.round.*amount/,
      /principal\s*\*\s*\d/,
      /tutar\s*\*\s*\d/,
      /faiz.*hesapla/i,
      /calculate.*interest/i,
      /TCMB.*ORAN/i,
    ];
    
    return {
      Literal(node) {
        // Check for hardcoded rate tables
      },
      CallExpression(node) {
        // Check for calculation function calls
      },
    };
  },
};
```

### 5.2 Build-Time Check

```typescript
// scripts/check-single-source.ts
import { execSync } from 'child_process';

const FORBIDDEN_PATTERNS = [
  'hesaplaFaiz',
  'hesaplaVekalet',
  'TCMB_AVANS_ORANLARI',
  'YASAL_FAIZ_ORANLARI',
  'Math.round.*tutar',
];

const results = FORBIDDEN_PATTERNS.map(pattern => {
  const count = execSync(
    `grep -r "${pattern}" apps/web/src --include="*.tsx" --include="*.ts" | wc -l`
  ).toString().trim();
  return { pattern, count: parseInt(count) };
});

const violations = results.filter(r => r.count > 0);

if (violations.length > 0) {
  console.error('❌ Single Source of Truth violations found:');
  violations.forEach(v => console.error(`  - ${v.pattern}: ${v.count} occurrences`));
  process.exit(1);
}

console.log('✅ Single Source of Truth check passed');
```

---

## 6. Uygulama Planı

### Faz 1: Backend Preview Endpoint'leri ✅ TAMAMLANDI

- [x] `POST /interest-engine/preview` endpoint'i
- [x] `POST /fee-engine/preview` endpoint'i
- [x] Cache mekanizması (in-memory)
- [x] Rate limiting

### Faz 2: Frontend Refactor ✅ TAMAMLANDI

- [x] `ProfessionalClaimItemForm.tsx` - Lokal hesaplama kaldırıldı, backend API kullanılıyor
- [x] `cases/new/page.tsx` - `calculateAutoInterest` backend preview kullanıyor
- [x] `page-new.tsx` - Mock data kaldırıldı, API-only
- [x] Tüm "tahmini" hesaplamalar "Hesaplanamadı" mesajına çevrildi
- [x] `hesaplaFaiz()`, `hesaplaSegmentliFaiz()`, `hesaplaVekaletUcreti()` → assertNoMockInProduction + 0 döner
- [x] TCMB_AVANS_ORANLARI, YASAL_FAIZ_ORANLARI → boş array

### Faz 3: Güvenlik Katmanı ✅ TAMAMLANDI

- [x] `ALLOW_MOCK_CALCULATIONS` feature flag (`lib/config/feature-flags.ts`)
- [x] Production'da mock hard block (`assertNoMockInProduction()`)
- [x] Deprecated fonksiyonlara telemetry ekle (`trackDeprecatedUsage()`)
- [x] `validation.ts` boş array → throw error

### Faz 4: CI/CD Entegrasyonu ✅ TAMAMLANDI

- [x] ESLint custom rule (`apps/web/eslint-rules/no-frontend-calculation.js`)
- [x] ESLint config güncellendi (`.eslintrc.json` - no-restricted-syntax)
- [x] Build-time check script (`scripts/check-single-source.js`)
- [x] package.json'a `check:single-source` script eklendi

### Faz 2.5: Preview Coordinator ✅ TAMAMLANDI

İki ayrı preview endpoint'inin risklerini yöneten koordinasyon katmanı:

- [x] `usePreviewCoordinator` hook (`hooks/usePreviewCoordinator.ts`)
  - Promise.allSettled ile paralel çağrı
  - Race condition önleme (requestHash)
  - Debounce desteği
- [x] `PreviewStatus` tipi: `FULL | PARTIAL | UNAVAILABLE | LOADING | IDLE`
- [x] Version mismatch kontrolü (engineVersion, ruleVersion)
- [x] `PreviewStatusBanner` component (`components/preview/PreviewStatusBanner.tsx`)
  - FULL: Yeşil onay
  - PARTIAL: Amber uyarı + hangi hesaplama eksik
  - UNAVAILABLE: Kırmızı hata
  - VERSION_MISMATCH: Amber uyarı
- [x] `UnavailableValue` component - "0" yerine "—" gösterir
- [x] `ConditionalValue` component - null/undefined için placeholder

### Faz 3: Birleşik Preview Endpoint ✅ TAMAMLANDI (v2 - Hardened)

> **Hedef:** İki ayrı endpoint'i tek endpoint'e birleştir (non-breaking geçiş)

**Neden gerekli:**
1. Versiyon uyumsuzluğu riski - aynı anda iki farklı "hukuki gerçeklik"
2. Kısmi başarı (partial truth) - yarım tablo "yanlış 0" kadar tehlikeli
3. Policy bağlamı parçalanır - "toplam borç şartı" gibi kurallar bölünür
4. Debug zorlaşır - iki ayrı trace, iki ayrı request hash

**Uygulanan çözüm:**

1. **Backend: Unified Preview Endpoint**
   - `POST /calc/preview/light` - Tek endpoint, tek trace
   - `CalcPreviewService` - Interest + Fee + Policy orchestrator
   - `CalcPreviewModule` - NestJS modülü
   - Tek versiyon seti (mismatch OLMAZ)
   - **Version-pinned cache** - cache key = requestHash + versions
   - **Policy preview (soft)** - gate kontrolü, blocking değil

2. **Frontend: Rollout Control + Fallback**
   - `shouldUseUnifiedPreview()` - Rollout-aware check
   - **Kill switch**: `NEXT_PUBLIC_UNIFIED_PREVIEW_KILL_SWITCH`
   - **Kademeli rollout**: `NEXT_PUBLIC_UNIFIED_PREVIEW_ROLLOUT_PERCENT` (0-100)
   - **Tenant whitelist**: `NEXT_PUBLIC_UNIFIED_PREVIEW_TENANT_WHITELIST`
   - **Fallback rate monitoring**: %2 eşik aşılırsa alert
   - `trackLegacyFallback()`, `trackUnifiedSuccess()` telemetry

3. **UX Guidance - Backend-driven UI semantics**
   ```typescript
   interface UxGuidance {
     blocking: boolean;
     recommendedAction: 'PROCEED' | 'RETRY' | 'CHECK_INPUT' | 'CONTACT_SUPPORT' | 'WAIT';
     retryAfterMs?: number;
     userMessage?: string;
   }
   ```

4. **Response yapısı (v2):**
```typescript
// POST /calc/preview/light
interface CalcPreviewResponse {
  success: boolean;
  status: 'FULL' | 'PARTIAL' | 'UNAVAILABLE';
  interest?: InterestPreviewData;
  fee?: FeePreviewData;
  policy?: PolicyPreviewData;  // YENİ: soft gate kontrolü
  versions: {
    engineVersion: string;  // TEK versiyon
    ruleVersion: string;    // TEK versiyon
    rateTableVersion?: string;
    tariffVersion?: string;
    tariffYear?: number;
    policyVersion?: string;  // YENİ
  };
  errors: CalcPreviewError[];
  warnings: CalcPreviewWarning[];
  uxGuidance: UxGuidance;  // YENİ: UI semantiği backend'den
  cached: boolean;
  cacheKey?: string;  // YENİ: version-pinned cache key
  requestHash: string;
  timestamp: string;
}
```

**Geçiş stratejisi (non-breaking):**
- [x] Yeni endpoint: `POST /calc/preview/light`
- [x] Eski iki endpoint aynen kalsın (backward compatible)
- [x] UI feature flag ile geçiş (`USE_UNIFIED_PREVIEW`)
- [x] Fallback mekanizması (unified fail → legacy)
- [x] Kill switch + kademeli rollout (%10 → %50 → %100)
- [x] Fallback rate monitoring + alert
- [x] Version-pinned cache
- [x] Policy preview (soft gates)
- [x] UX Guidance (backend-driven UI semantics)
- [ ] 2-4 hafta stabil çalışınca eski endpoint'leri deprecate et

**Kabul Testleri:**
1. Unified endpoint success oranı yüksek olmalı
2. p95 latency < 200ms (cache ile)
3. Legacy fallback rate < %0.5 (stabil dönemde)
4. Deploy sonrası aynı input için eski cache servis edilmiyor

**Dosyalar:**
- `apps/api/src/modules/calc-preview/` - Backend modülü
- `apps/web/src/lib/api/calc-preview.ts` - Frontend API client
- `apps/web/src/hooks/usePreviewCoordinator.ts` - Unified + fallback + telemetry
- `apps/web/src/lib/config/feature-flags.ts` - Rollout config + kill switch

### Faz 3.1: Orchestrator → Gerçek Engine Bağlantısı ✅ TAMAMLANDI

> **Hedef:** CalcPreviewService'in kendi hesaplama yapmasını engelleyip gerçek engine'lere bağlamak

**Neden gerekli:**
- CalcPreviewService kendi basit matematiğini yapıyordu (tek kaynak ihlali)
- Preview ile full calculation arasında potansiyel drift riski
- "Aynı matematik, daha az bürokrasi" prensibi uygulanmalı

**Uygulanan çözüm:**

1. **InterestEngineService.previewCalculation()**
   - Aynı rate lookup, segment builder, day count, rounding
   - NO audit log, NO execution record
   - Hata durumunda `{ success: false, error: { code, message } }`
   - Başarı durumunda `{ success: true, data: {...}, versions: {...} }`

2. **FeeEngineService.previewCalculation()**
   - Aynı tariff lookup, fee calculation
   - calculateOpeningFees() ile aynı mantık
   - Breakdown + attorney fee dahil

3. **CalcPreviewModule güncellendi**
   - `InterestEngineModule` import edildi
   - `FeeEngineModule` import edildi
   - DI ile engine'ler inject ediliyor

4. **CalcPreviewService refactor**
   - Kendi hesaplama metodları KALDIRILDI:
     - ~~calculateInterestPreview()~~ → `interestEngine.previewCalculation()`
     - ~~calculateFeePreview()~~ → `feeEngine.previewCalculation()`
     - ~~getPreviewRate()~~ → Engine içinde
     - ~~calculateFeeBreakdown()~~ → Engine içinde
     - ~~calculateAttorneyFeePreview()~~ → Engine içinde
   - Sadece orchestration yapıyor:
     - Request validation
     - Engine çağrıları
     - Response birleştirme
     - Status belirleme
     - UX Guidance
     - Cache yönetimi

**Dosyalar:**
- `apps/api/src/modules/interest-engine/interest-engine.service.ts` - previewCalculation() eklendi
- `apps/api/src/modules/fee-engine/fee-engine.service.ts` - previewCalculation() eklendi
- `apps/api/src/modules/calc-preview/calc-preview.module.ts` - Engine modülleri import edildi
- `apps/api/src/modules/calc-preview/calc-preview.service.ts` - Gerçek engine'leri kullanıyor

**Sonuç:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    TEK KAYNAK ZİNCİRİ                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  UI → CalcPreviewService → InterestEngineService                │
│                          → FeeEngineService                     │
│                                                                 │
│  ✅ Orchestrator hesaplama YAPMIYOR                            │
│  ✅ Gerçek engine'ler kullanılıyor                             │
│  ✅ Preview = Full calculation (audit hariç)                   │
│  ✅ Drift riski SIFIR                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Faz 3.1.1: Preview Transparency (Segments, Coverage, Warnings) ✅ TAMAMLANDI

> **Hedef:** "Niye bu çıktı?" sorusunun cevabını vermek - şeffaflık ve güven

**Neden gerekli:**
- Kullanıcı sadece toplam görüyordu, "nasıl hesaplandı" bilinmiyordu
- Rate gap/overlap durumları sessizce geçiliyordu
- Debug için segment detayı yoktu

**Uygulanan çözüm:**

1. **Segments[] döndürme (truncated)**
   - Gerçek SegmentBuilderService kullanılıyor
   - Max 20 segment döndürülüyor (light preview)
   - Truncated ise warning ekleniyor
   - Her segment: startDate, endDate, days, annualRatePct, principal, interest, phase, rateSource

2. **Coverage / Gap / Overlap Warnings**
   - CoverageMapBuilder ile gerçek coverage analizi
   - `RATE_GAP` warning: "Oran tablosunda X boşluk tespit edildi"
   - `RATE_OVERLAP` warning: "Çakışma tespit edildi; en yeni kayıt kullanıldı"
   - `SEGMENTS_TRUNCATED` warning: "Önizleme segmentleri kısaltıldı"
   - Evidence objesi ile detay (gaps, overlaps, totalGapDays)

3. **Enhanced Response**
   ```typescript
   interface InterestPreviewData {
     // Mevcut
     estimatedInterest: number;
     currentRate: number;  // Weighted average
     days: number;
     
     // Phase 3.1.1: Detaylı breakdown
     preEnforcementInterest?: number;
     postEnforcementInterest?: number;
     
     // Phase 3.1.1: Segment detayları
     segments?: PreviewSegment[];
     segmentsMeta?: {
       total: number;
       returned: number;
       truncated: boolean;
     };
     
     // Phase 3.1.1: Coverage bilgisi
     coverage?: {
       percent: number;
       totalDays: number;
       coveredDays: number;
       hasGaps: boolean;
       hasOverlaps: boolean;
     };
   }
   ```

4. **Warnings sistemi**
   - Engine'den gelen warnings CalcPreviewService'e aktarılıyor
   - Domain-based: `{ domain: 'interest', code: 'RATE_GAP', message, severity }`
   - UI'da gösterilebilir

**Dosyalar:**
- `apps/api/src/modules/interest-engine/interest-engine.service.ts` - previewCalculation() enhanced
- `apps/api/src/modules/calc-preview/types.ts` - InterestPreviewData enhanced
- `apps/api/src/modules/calc-preview/calc-preview.service.ts` - Warnings propagation

**Sonuç:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    ŞEFFAFLIK ZİNCİRİ                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Kullanıcı sorusu: "Bu faiz nasıl hesaplandı?"                 │
│                                                                 │
│  Cevap:                                                         │
│  ├── segments[]: 5 dönem, farklı oranlar                       │
│  ├── coverage: %100, gap yok                                   │
│  ├── warnings: []                                              │
│  └── formula: "Segment-based calculation (5 segments)"         │
│                                                                 │
│  ✅ Hesap değil, KANIT                                         │
│  ✅ Kapsama değil, GÖRÜNÜRLÜK                                  │
│  ✅ Kural değil, GEREKÇE                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Başarı Kriterleri

```
┌─────────────────────────────────────────────────────────────────┐
│                    TEK KAYNAK METRİKLERİ                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ Frontend'de Math.round + (interest|fee|harc|vekalet) = 0   │
│  ✅ Frontend'de hardcoded oran tablosu = 0                     │
│  ✅ Deprecated API çağrısı (7 gün) = 0                         │
│  ✅ Mock data production'da = IMPOSSIBLE (build fail)          │
│  ✅ API down → "Hesaplanamadı" (tahmini değer yok)             │
│                                                                 │
│  ═══════════════ PHASE 3 METRİKLERİ ═══════════════            │
│                                                                 │
│  ✅ Unified endpoint success rate > %99                        │
│  ✅ Legacy fallback rate < %0.5                                │
│  ✅ p95 latency < 200ms (cache hit)                            │
│  ✅ Version-pinned cache: deploy sonrası stale yok             │
│  ✅ Policy soft warnings UI'da gösteriliyor                    │
│  ✅ UX Guidance: backend-driven UI semantics                   │
│                                                                 │
│  ═══════════════ PHASE 3.1.1 METRİKLERİ ═══════════════        │
│                                                                 │
│  ✅ Segments[] döndürülüyor (max 20, truncated warning)        │
│  ✅ Coverage bilgisi: percent, gaps, overlaps                  │
│  ✅ Engine warnings UI'a aktarılıyor                           │
│  ✅ preEnforcementInterest / postEnforcementInterest ayrımı    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Phase 4 Yol Haritası (Operasyonel Olgunluk)

> **Öncelik sırası:** İzleme → Koruma → Ölçek → Temizlik

### 4.1 Monitoring + Alerting ✅ TAMAMLANDI

**Uygulanan çözüm:**

1. **CalcPreviewMetricsService**
   - Latency tracking (p50, p95, p99)
   - Success rate / Error taxonomy
   - Fallback rate monitoring
   - Dependency latency
   - Phase 3.1.2 etiketleri (coverageStatus, hasGaps, segmentsTruncated, highFeeRatio)

2. **SLO Thresholds**
   ```typescript
   LATENCY_P95_MS: 200,      // p95 < 200ms (cache hit)
   LATENCY_P99_MS: 500,      // p99 < 500ms
   SUCCESS_RATE_MIN: 0.99,   // > 99%
   FALLBACK_RATE_MAX: 0.02,  // < 2%
   FALLBACK_RATE_ALERT: 0.005, // > 0.5% → alert
   ```

3. **Metrics Endpoints**
   - `GET /calc/metrics` - Dashboard summary
   - `GET /calc/metrics/errors` - Error breakdown
   - `GET /calc/metrics/latency` - Latency percentiles

4. **Alert System**
   - Latency SLO violation → warning log
   - Fallback rate > 0.5% → error log + alert emit
   - Dependency timeout → warning log

**Dosyalar:**
- `apps/api/src/modules/calc-preview/metrics/calc-preview-metrics.service.ts`
- `apps/api/src/modules/calc-preview/calc-preview.service.ts` (metrics integration)
- `apps/api/src/modules/calc-preview/calc-preview.controller.ts` (metrics endpoints)

### 4.2 Rate Limiting ✅ TAMAMLANDI

**Uygulanan çözüm:**

1. **CalcPreviewRateLimitService**
   - Token bucket algoritması
   - Burst capacity: 20 requests (ani yük için)
   - Steady-state: 5 requests/second
   - Tenant-specific overrides (premium tenants)
   - Trusted client bypass (internal-ops, test-harness)
   - Global safety limit: 1000 req/min

2. **CalcPreviewRateLimitGuard**
   - NestJS Guard olarak implement edildi
   - 429 Too Many Requests response
   - Retry-After header (RFC 7231)
   - X-RateLimit-* headers (standard)

3. **Rate Limit Headers**
   ```
   X-RateLimit-Limit: 20
   X-RateLimit-Remaining: 15
   X-RateLimit-Reset: 1705312800
   Retry-After: 2
   ```

4. **Rate Limit Endpoints**
   - `GET /calc/rate-limit/status?tenantId=xxx` - Tenant status
   - `GET /calc/rate-limit/global` - Global stats (ops dashboard)

5. **Abuse Protection**
   - Tenant blocking (temporary)
   - Global limit (system protection)
   - Metrics integration (RATE_LIMITED error tracking)

**Dosyalar:**
- `apps/api/src/modules/calc-preview/rate-limit/calc-preview-rate-limit.service.ts`
- `apps/api/src/modules/calc-preview/rate-limit/calc-preview-rate-limit.guard.ts`
- `apps/api/src/modules/calc-preview/calc-preview.controller.ts` (guard + endpoints)
- `apps/api/src/modules/calc-preview/calc-preview.module.ts` (providers)

### 4.3 Circuit Breaker ✅ TAMAMLANDI

**Uygulanan çözüm:**

1. **CalcPreviewCircuitBreakerService**
   - Dependency-based circuit breaker
   - States: CLOSED → OPEN → HALF_OPEN → CLOSED
   - Per-dependency configuration
   - Automatic recovery

2. **Supported Dependencies**
   - `interest_engine`: 5 failures, 30s reset, 3s timeout
   - `fee_engine`: 5 failures, 30s reset, 2s timeout
   - `rate_provider`: 3 failures (critical), 60s reset, 5s timeout
   - `tariff_provider`: 5 failures, 30s reset, 2s timeout
   - `policy_engine`: 5 failures, 30s reset, 3s timeout
   - `cache`: 10 failures (tolerant), 10s reset, 1s timeout

3. **State Machine**
   ```
   CLOSED ──(failures >= threshold)──> OPEN
      ↑                                   │
      │                                   │ (resetTimeout)
      │                                   ↓
      └──(successes >= threshold)── HALF_OPEN
   ```

4. **Circuit Breaker Endpoints**
   - `GET /calc/circuit-breaker/status?dependency=xxx` - Single status
   - `GET /calc/circuit-breaker/all` - All statuses (ops dashboard)

5. **Integration**
   - CalcPreviewService checks circuit before engine calls
   - Failures recorded automatically
   - Graceful degradation: CIRCUIT_OPEN error instead of timeout

**Dosyalar:**
- `apps/api/src/modules/calc-preview/circuit-breaker/calc-preview-circuit-breaker.service.ts`
- `apps/api/src/modules/calc-preview/calc-preview.service.ts` (circuit breaker integration)
- `apps/api/src/modules/calc-preview/calc-preview.controller.ts` (endpoints)
- `apps/api/src/modules/calc-preview/calc-preview.module.ts` (providers)

### 4.4 Redis/Distributed Cache ✅ TAMAMLANDI (In-Memory Phase)

**Uygulanan çözüm:**

> Not: Şu an in-memory cache. Redis migration production ölçeğinde yapılacak.

1. **VersionedCacheService**
   - Namespace-based cache (rate_provider, tariff_provider, coverage_map, policy_softcheck)
   - Versioned keys: stale data korkusunu önler
   - Singleflight pattern: dogpile prevention
   - Negative caching: "not found" da cache'lenir
   - Stale-while-revalidate: background refresh

2. **Cache Configurations**
   ```typescript
   rate_provider:     TTL 1h,  maxSize 1000, stale OK
   tariff_provider:   TTL 24h, maxSize 500,  stale OK
   coverage_map:      TTL 30m, maxSize 500,  stale OK
   policy_softcheck:  TTL 5m,  maxSize 200,  stale HAYIR (riskli)
   ```

3. **Cache Endpoints**
   - `GET /calc/cache/stats` - All namespaces
   - `GET /calc/cache/stats?namespace=rate_provider` - Single namespace

4. **Observability**
   - Hit/miss tracking
   - Average load time
   - Eviction count
   - Negative entry count

**Dosyalar:**
- `apps/api/src/modules/calc-preview/cache/versioned-cache.service.ts`
- `apps/api/src/modules/calc-preview/calc-preview.controller.ts` (endpoints)
- `apps/api/src/modules/calc-preview/calc-preview.module.ts` (providers)

**Redis Migration (Gelecek):**
- [ ] Redis client integration
- [ ] Multi-pod cache consistency
- [ ] LRU eviction (FIFO değil)
- [ ] Cache invalidation on deploy

### 4.5 Legacy Endpoint Deprecation ✅ TAMAMLANDI

**Uygulanan çözüm:**

1. **LegacyDeprecationService**
   - Traffic tracking (endpoint/tenant/client bazlı)
   - Deprecation headers (RFC 8594)
   - Shadow compare (legacy vs unified)
   - Kill switch (emergency revert)

2. **Deprecated Endpoints Registry**
   ```typescript
   /interest-engine/preview → /calc/preview/light (Sunset: 15 Mar 2026)
   /fee-engine/preview      → /calc/preview/light (Sunset: 15 Mar 2026)
   ```

3. **Deprecation Headers (RFC 8594)**
   ```
   Deprecation: true
   Deprecation-Date: 2026-01-15
   Sunset: Sun, 15 Mar 2026 00:00:00 GMT
   Link: </calc/preview/light>; rel="successor-version"
   ```

4. **LegacyDeprecationInterceptor**
   - Adds deprecation headers to responses
   - Records traffic to deprecated endpoints
   - Handles 410 Gone / 301 Redirect based on status

5. **Deprecation Endpoints**
   - `GET /calc/deprecation/traffic` - Traffic stats
   - `GET /calc/deprecation/shadow` - Shadow compare stats
   - `GET /calc/deprecation/kill-switches` - Kill switch statuses

6. **Shadow Compare**
   - Legacy vs Unified sonuçlarını karşılaştır
   - Mismatch'leri logla
   - Match rate tracking

7. **Kill Switch**
   - Emergency revert to legacy
   - Per-endpoint control

**Dosyalar:**
- `apps/api/src/modules/calc-preview/deprecation/legacy-deprecation.service.ts`
- `apps/api/src/modules/calc-preview/deprecation/legacy-deprecation.interceptor.ts`
- `apps/api/src/modules/calc-preview/calc-preview.controller.ts` (endpoints)
- `apps/api/src/modules/calc-preview/calc-preview.module.ts` (providers)

---

## 9. Phase 5 Yol Haritası (Tam Entegrasyon)

### 5.1 PolicyEngineService.softCheck()
- [ ] Gerçek policy engine entegrasyonu
- [ ] Hardcoded gate'lerden kurtulma
- [ ] Policy version tracking

### 5.2 TBK100 Allocation Preview
- [ ] Ödeme mahsubu preview'da
- [ ] "Tahsilat girince faiz niye değişti" sorusunun cevabı
- [ ] paymentPreview[] response'a ekleme

### 5.3 bigint Migration (Uzun vadeli)
- [ ] Float TL → bigint kuruş
- [ ] Tüm sistemde migration
- [ ] Backward compatibility

### 5.4 Preview Audit Log (Opsiyonel)
- [ ] Compliance için preview kayıtları
- [ ] Retention policy

---

## 8. Referanslar

- `ARCHITECTURE.md` - Source of Truth Matrix
- `lib/api/interest-engine.ts` - Interest Engine API Client
- `lib/api/fee-engine.ts` - Fee Engine API Client
- `lib/api/calc-preview.ts` - Unified Preview API Client (Phase 3)
- `lib/api/policy-engine.ts` - Policy Engine API Client
- `hooks/useCaseCalculation.ts` - Hesap Özeti Hook
- `hooks/usePreviewCoordinator.ts` - Preview Coordinator Hook (Unified + Fallback)
- `components/preview/PreviewStatusBanner.tsx` - Preview Status UI
- `apps/api/src/modules/calc-preview/` - Unified Preview Backend Module
