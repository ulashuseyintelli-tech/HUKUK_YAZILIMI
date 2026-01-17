# Tek Kaynak Prensibi (Single Source of Truth) - Mimari Dokümanı

> **Durum:** ✅ FAZ 5 TAMAMLANDI (Güvenilirlik + Kanıt + Yönetişim)  
> **Son Güncelleme:** 2026-01-16  
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
│  ═══════════════ PHASE 5.1 METRİKLERİ ═══════════════          │
│                                                                 │
│  ✅ TraceBundle her request için üretiliyor                    │
│  ✅ Sampling: 1% default, force on critical conditions         │
│  ✅ X-Trace-Id header her response'ta                          │
│  ✅ PII/KVKK compliant (no raw debtor data)                    │
│  ✅ Dependency call tracking with evidence                     │
│  ✅ Trace endpoints: get, download, recent, stats              │
│                                                                 │
│  ═══════════════ PHASE 5.2 METRİKLERİ ═══════════════          │
│                                                                 │
│  ✅ Golden scenarios: 3+ senaryo tanımlı                       │
│  ✅ Regression runner: compare + assert + report               │
│  ✅ Diff classification: NOISE/MINOR/MAJOR/CRITICAL            │
│  ✅ JUnit XML + JSON rapor üretimi                             │
│  ✅ Baseline update mekanizması                                │
│                                                                 │
│  ═══════════════ PHASE 5.3 METRİKLERİ ═══════════════          │
│                                                                 │
│  ✅ FaultInjector: 7 fault mode destekli                       │
│  ✅ Chaos scenarios: 3+ senaryo tanımlı                        │
│  ✅ Test-only endpoints (prod'da disabled)                     │
│  ✅ Breaker/fallback/evidence doğrulama                        │
│  ✅ ChaosModule.forRoot() - prod'da sıfır saldırı yüzeyi       │
│                                                                 │
│  ═══════════════ OPERASYONEL HİJYEN ═══════════════            │
│                                                                 │
│  ✅ Trace RBAC: tenant-admin vs internal-ops                   │
│  ✅ Trace Retention: 7-30 gün, severity-based                  │
│  ✅ Access Audit: kim hangi trace'i çekti                      │
│  ✅ Download Rate Limit: 100/hour per user                     │
│  ✅ Baseline Governance: CODEOWNERS + expiry + audit           │
│  ✅ known-diffs şişme alarmı (max 10)                          │
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

### 4.3 Circuit Breaker ✅ TAMAMLANDI (+ HALF_OPEN Guardrails)

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

4. **HALF_OPEN Guardrails (Flapping Önleme)**
   - `halfOpenTrialLimit`: Max deneme sayısı (1 değil, 3-5)
   - `halfOpenFailureThreshold`: Kaç hata sonra re-open
   - Trial limit aşılırsa → otomatik re-open
   - Flappy dependency seni delirtmez

5. **Domain-Level Success Validation**
   - HTTP 200 yetmez, response içeriği de valid olmalı
   - `recordDomainSuccess(dependency, result, validator)`
   - Validator: `{ valid: boolean, reason?: string }`
   - Empty coverage, invalid response → domain failure

6. **Deterministic Fallback with Evidence**
   ```typescript
   interface FallbackResult<T> {
     value: T;
     source: 'CACHED_STALE' | 'DEFAULT' | 'UNAVAILABLE';
     evidence: {
       circuitState: CircuitState;
       dependency: DependencyName;
       reason: string;
       timestamp: string;
     };
   }
   ```

7. **Circuit Breaker Endpoints**
   - `GET /calc/circuit-breaker/status?dependency=xxx` - Single status (halfOpenTrials dahil)
   - `GET /calc/circuit-breaker/all` - All statuses (ops dashboard)

**Dosyalar:**
- `apps/api/src/modules/calc-preview/circuit-breaker/calc-preview-circuit-breaker.service.ts`
- `apps/api/src/modules/calc-preview/calc-preview.service.ts` (circuit breaker integration)
- `apps/api/src/modules/calc-preview/calc-preview.controller.ts` (endpoints)
- `apps/api/src/modules/calc-preview/calc-preview.module.ts` (providers)

### 4.4 Redis/Distributed Cache ✅ TAMAMLANDI (In-Memory Phase + Guardrails)

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

3. **Guardrail 1: Key Fingerprint Schemas**
   - `RateProviderKeyParams`: tenantId + rateType + startDate + endDate + currency + jurisdiction
   - `TariffProviderKeyParams`: tenantId + tariffCode + asOfDate + jurisdiction
   - `PolicySoftCheckKeyParams`: tenantId + policyVersion + requestFingerprint
   - `CoverageMapKeyParams`: tenantId + rateType + startDate + endDate + currency
   - Her parametre key'e girer, eksik parametre = yanlış cache

4. **Guardrail 2: Version Source-of-Truth**
   - `versionRegistry`: tek mekanizmadan version üretimi
   - `getCurrentVersion(namespace)`: tek kaynak
   - `updateVersion(namespace, newVersion)`: otomatik invalidation
   - `getAllVersions()`: tüm namespace'lerin versiyonları

5. **Guardrail 3: Stale Labeling**
   - `staleHits`: stale hit sayısı (metrics'e)
   - `staleServedTotal`: toplam stale servis sayısı
   - `staleServedCount`: entry başına stale servis sayısı
   - Her stale hit loglanır ve metrics'e işaretlenir

6. **Cache Endpoints**
   - `GET /calc/cache/stats` - All namespaces (stale metrics dahil)
   - `GET /calc/cache/stats?namespace=rate_provider` - Single namespace

**Dosyalar:**
- `apps/api/src/modules/calc-preview/cache/versioned-cache.service.ts`
- `apps/api/src/modules/calc-preview/calc-preview.controller.ts` (endpoints)
- `apps/api/src/modules/calc-preview/calc-preview.module.ts` (providers)

**Redis Migration (Gelecek):**
- [ ] Redis client integration
- [ ] Multi-pod cache consistency
- [ ] LRU eviction (FIFO değil)
- [ ] Cache invalidation on deploy

### 4.5 Legacy Endpoint Deprecation ✅ TAMAMLANDI (+ Shadow Compare Guardrails)

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

4. **Shadow Compare with Severity Classification**
   ```typescript
   interface ShadowDiff {
     path: string;
     legacyValue: unknown;
     unifiedValue: unknown;
     severity: 'NOISE' | 'MINOR' | 'MAJOR' | 'CRITICAL';
     category: 'ROUNDING' | 'ORDERING' | 'FORMAT' | 'VALUE' | 'MISSING' | 'POLICY';
   }
   ```
   
   - **NOISE**: Sub-cent rounding, array ordering, format differences → gürültü, alarm yok
   - **MINOR**: < 0.1% relative difference, missing non-critical fields
   - **MAJOR**: 0.1-1% difference, type mismatches
   - **CRITICAL**: > 1% difference, policy gate differences → gerçek regresyon

5. **Normalized Diff Logic**
   - Number comparison: rounding tolerance (< 0.01 = noise)
   - String comparison: case/trim normalization
   - Array comparison: ordering vs content difference
   - Policy fields: otomatik CRITICAL severity

6. **Deprecation Endpoints**
   - `GET /calc/deprecation/traffic` - Traffic stats
   - `GET /calc/deprecation/shadow` - Shadow compare stats (bySeverity, byCategory dahil)
   - `GET /calc/deprecation/kill-switches` - Kill switch statuses

7. **Kill Switch**
   - Emergency revert to legacy
   - Per-endpoint control

**Dosyalar:**
- `apps/api/src/modules/calc-preview/deprecation/legacy-deprecation.service.ts`
- `apps/api/src/modules/calc-preview/deprecation/legacy-deprecation.interceptor.ts`
- `apps/api/src/modules/calc-preview/calc-preview.controller.ts` (endpoints)
- `apps/api/src/modules/calc-preview/calc-preview.module.ts` (providers)

---

## 9. Phase 5 Yol Haritası (Güvenilirlik + Kanıt)

> **Hedef:** Sistemin "ürün"e dönüşmesi için kanıt üretme ve regresyon disiplini

### 5.1 Evidence/Trace Export ✅ TAMAMLANDI

> **"Truth artifact - log değil, kanıt."**

**Uygulanan çözüm:**

1. **TraceBundle Schema**
   ```typescript
   interface TraceBundle {
     meta: TraceMeta;           // traceId, requestId, tenantId, endpoint, timing, version
     input: TraceInput;         // PII-free fingerprint + normalizedSummary
     cache: TraceCacheInfo;     // hits, misses, staleServed, byNamespace
     circuitBreaker: TraceCircuitBreakerInfo;  // byDependency, events
     rateLimit: TraceRateLimitInfo;  // applied, bucket, remaining
     dependencies: TraceDependencyCall[];  // name, callId, duration, outcome, evidence
     policy: TracePolicyInfo;   // softCheck outcome + reasons
     warnings: TraceWarning[];  // code, severity, message
     result: TraceResult;       // status (OK|DEGRADED|UNAVAILABLE), totals
     shadowCompare?: TraceShadowCompare;  // severity, category, diffSummary
   }
   ```

2. **TraceContext (Request-Scoped)**
   - Per-request trace data collection
   - Methods: `setInput()`, `recordCacheHit()`, `recordCircuitState()`, `startDependencyCall()`, `setResult()`, `finalize()`
   - PII/KVKK compliant: No raw debtor name, TCKN, address, phone, email

3. **TraceStorageService**
   - In-memory ring buffer (1000 traces)
   - Sampling policy: 1% default, force on fallback/critical/circuit-open/degraded
   - Query methods: `get(traceId)`, `query(params)`, `getRecent(limit)`
   - Stats: totalStored, producedTotal, persistedTotal, sampledOutTotal

4. **TraceCollectorService**
   - `traceDependencyCall()` wrapper with domain validation
   - `recordSkippedCall()` for circuit-open cases
   - `finalizeAndStore()` with sampling

5. **TraceInterceptor**
   - Adds `X-Trace-Id` header to response
   - Attaches TraceContext to request
   - Finalizes and stores trace on response/error
   - Force trace via `X-Force-Trace: true` header

6. **Trace Endpoints**
   - `GET /calc/trace/:traceId` - Get specific trace (trusted/internal-ops)
   - `GET /calc/trace/:traceId/download` - Download as JSON file
   - `GET /calc/trace/recent?tenantId=...&severity=...&status=...` - Query traces
   - `GET /calc/trace/stats` - Storage stats

7. **CalcPreviewService Integration**
   - TraceContext initialized at request start
   - Input set with PII-free summary
   - Dependency calls tracked with outcome + evidence
   - Cache hits/misses recorded
   - Circuit breaker states recorded
   - Policy info recorded
   - Result set at end
   - Warnings propagated to trace

**Sampling Policy:**
```typescript
const DEFAULT_SAMPLING_POLICY = {
  defaultRate: 0.01,  // 1%
  forceOn: {
    fallbackOutcome: true,
    criticalShadowDiff: true,
    circuitOpen: true,
    degradedResult: true,
  },
  forceHeader: 'X-Force-Trace',
};
```

**Kullanım alanları:**
- Debug: "Bu hesap niye böyle çıktı?"
- Müşteri itirazı: "Kanıt göster"
- Regression: "Önceki sonuçla karşılaştır"
- Ops: "Hangi dependency yavaş?"

**Dosyalar:**
- `apps/api/src/modules/calc-preview/trace/trace.types.ts` - TraceBundle schema
- `apps/api/src/modules/calc-preview/trace/trace-context.ts` - Request-scoped container
- `apps/api/src/modules/calc-preview/trace/trace-storage.service.ts` - Ring buffer storage
- `apps/api/src/modules/calc-preview/trace/trace-collector.service.ts` - Collection wrapper
- `apps/api/src/modules/calc-preview/trace/trace.interceptor.ts` - NestJS interceptor
- `apps/api/src/modules/calc-preview/calc-preview.service.ts` - Trace integration
- `apps/api/src/modules/calc-preview/calc-preview.controller.ts` - Trace endpoints
- `apps/api/src/modules/calc-preview/calc-preview.module.ts` - Trace providers

### 5.2 Golden Scenarios + Regression Gate ✅ TAMAMLANDI

> **"Tek kaynak yemini"** - Her release'te otomatik doğrulama

**Uygulanan çözüm:**

1. **Scenario Format**
   ```typescript
   interface GoldenScenario {
     id: string;
     name: string;
     request: { tenantId: string; payload: CalcPreviewRequest };
     expect: {
       status: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
       tolerances: { moneyAbs: number; moneyRel: number };
       must: Record<string, unknown>;
       forbid: Record<string, unknown[]>;
       traceAssertions: TraceAssertions;
     };
   }
   ```

2. **Baseline Yaklaşımı**
   - Snapshot baseline: `expected.result.json`, `expected.trace.json`
   - Kural bazlı assert: `must`, `forbid`, `traceAssertions`
   - İkisi birlikte çalışır

3. **Compare Stratejisi**
   - Parasal alanlarda abs <= 0.01 tolerans
   - Tarih string normalizasyonu
   - Ordering bağımsız karşılaştırma
   - Policy alanları değiştiyse otomatik CRITICAL

4. **Diff Severity Classification**
   - `NOISE`: Sub-cent rounding, ordering → pass
   - `MINOR`: < 0.1% fark → warn
   - `MAJOR`: 0.1-1% fark → fail on main
   - `CRITICAL`: > 1% fark, policy gate → always fail

5. **Reporters**
   - Console: Renkli, severity bazlı özet
   - JUnit XML: CI/CD entegrasyonu
   - JSON: Detaylı rapor

6. **İlk 3 Golden Scenario**
   - `001-basic-tcmb-avans`: Temel TCMB avans hesaplaması
   - `002-multi-segment-rate-change`: Oran değişimi, multi-segment
   - `003-high-fee-ratio-warning`: Düşük anapara, policy warning

**Dosyalar:**
- `apps/api/src/modules/calc-preview/regression/runner/regression.types.ts`
- `apps/api/src/modules/calc-preview/regression/runner/regression-runner.ts`
- `apps/api/src/modules/calc-preview/regression/runner/compare/diff-classifier.ts`
- `apps/api/src/modules/calc-preview/regression/runner/compare/compare-result.ts`
- `apps/api/src/modules/calc-preview/regression/runner/compare/compare-trace.ts`
- `apps/api/src/modules/calc-preview/regression/runner/normalizers/normalize-result.ts`
- `apps/api/src/modules/calc-preview/regression/runner/normalizers/normalize-trace.ts`
- `apps/api/src/modules/calc-preview/regression/runner/reporters/console-reporter.ts`
- `apps/api/src/modules/calc-preview/regression/runner/reporters/junit-reporter.ts`
- `apps/api/src/modules/calc-preview/regression/scenarios/*.json`
- `apps/api/src/modules/calc-preview/regression/allowlists/*.json`

### 5.3 Chaos / Fault Injection ✅ TAMAMLANDI

> **"Dayanıklılık ayini"** - Circuit breaker, cache, fallback gerçekten çalışıyor mu?

**Uygulanan çözüm:**

1. **FaultInjectorService**
   - Dependency bazlı fault injection
   - Fault modları: DELAY, TIMEOUT, ERROR_500, ERROR_503, INVALID_RESPONSE, PARTIAL_DATA, EMPTY_RESPONSE
   - Probability ve duration desteği
   - Auto-cleanup (expired injections)

2. **Chaos Controller (Test-only)**
   - `POST /calc/chaos/inject` - Fault injection başlat
   - `DELETE /calc/chaos/inject/:id` - Injection kaldır
   - `POST /calc/chaos/clear` - Tüm injection'ları temizle
   - `GET /calc/chaos/status` - Aktif injection'ları listele
   - ⚠️ `ENABLE_CHAOS_ENDPOINTS=true` gerekli

3. **Chaos Scenario Format**
   ```typescript
   interface ChaosScenario {
     id: string;
     name: string;
     inject: FaultInjectionConfig;
     request?: { tenantId: string; payload: Record<string, unknown> };
     expect: {
       'result.status'?: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
       dependencies?: Record<string, { outcome: DependencyOutcome }>;
       breaker?: Record<string, { state: CircuitState }>;
       trace?: { mustContainEvidence?: boolean; maxDurationMs?: number };
     };
   }
   ```

4. **İlk 3 Chaos Scenario**
   - `C01-rate-provider-timeout`: Timeout → breaker OPEN → fallback evidence
   - `C02-interest-engine-500`: 500 error → PARTIAL status → fee hesaplanmalı
   - `C03-fee-engine-latency-spike`: Delay → yavaş ama başarılı

5. **Güvenlik**
   - Production'da devre dışı (`ENABLE_CHAOS_ENDPOINTS=false`)
   - ForbiddenException if disabled

**Dosyalar:**
- `apps/api/src/modules/calc-preview/chaos/chaos.types.ts`
- `apps/api/src/modules/calc-preview/chaos/fault-injector.service.ts`
- `apps/api/src/modules/calc-preview/chaos/chaos.controller.ts`
- `apps/api/src/modules/calc-preview/chaos/scenarios/*.json`

### 5.4 Operasyonel Hijyen + Yönetişim ✅ TAMAMLANDI

> **"Production'da yıllarca sorunsuz yaşasın"**

**1. Chaos Modülünün Prod'dan Fiziken Sökülmesi**

```typescript
// ChaosModule.forRoot() - Production'da sıfır saldırı yüzeyi
@Module({})
export class ChaosModule {
  static forRoot(): DynamicModule {
    if (IS_PRODUCTION) {
      return { module: ChaosModule, controllers: [], providers: [], exports: [] };
    }
    // ... test ortamında full modül
  }
}
```

- ENV flag yetmez → prod build'de module hiç compile/import edilmesin
- Route'lar register edilmesin (sıfır saldırı yüzeyi)
- `ChaosModule.forTesting()` - test ortamı için her zaman aktif

**2. Trace RBAC + Retention**

```typescript
// TraceAccessService - Roller
type TraceAccessRole = 'tenant-admin' | 'internal-ops' | 'system' | 'anonymous';

// Kurallar:
// - tenant-admin: Sadece kendi tenant'ının trace'lerine erişebilir
// - internal-ops: Tüm trace'lere erişebilir
// - anonymous: Erişim YASAK

// TraceRetentionService - Retention
const DEFAULT_RETENTION = {
  defaultRetentionMs: 7 * 24 * 60 * 60 * 1000,  // 7 gün
  severityRetention: {
    CRITICAL: 30 * 24 * 60 * 60 * 1000,  // 30 gün
    MAJOR: 14 * 24 * 60 * 60 * 1000,     // 14 gün
    MINOR: 7 * 24 * 60 * 60 * 1000,      // 7 gün
    NOISE: 1 * 24 * 60 * 60 * 1000,      // 1 gün
  },
  maxTracesPerTenant: 5000,
};
```

- Tenant isolation
- RBAC (tenant-admin vs internal-ops)
- Retention (7-30 gün, severity-based)
- Export before delete (CRITICAL traces)
- Download rate limit (100/hour per user)
- Download size limit (10MB)
- Access audit log (kim hangi trace'i çekti)

**3. Baseline Governance**

```
┌─────────────────────────────────────────────────────────────────┐
│                    BASELINE GOVERNANCE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ Baseline update sadece release branch + CODEOWNERS onayı   │
│  ✅ Allowlist değişiklikleri audit'li (kim, neden, hangi PR)   │
│  ✅ known-diffs şişerse alarm (max 10 item)                    │
│  ✅ Her known-diff için expiry date ZORUNLU (max 30 gün)       │
│  ✅ Expired diff'ler otomatik fail                             │
│  ✅ Orphaned baseline kontrolü                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- `check-governance.ts` - CI'da çalışan governance kontrolleri
- `GOVERNANCE.md` - Kurallar ve sorumluluklar dokümantasyonu
- CODEOWNERS entegrasyonu

**Dosyalar:**
- `apps/api/src/modules/calc-preview/chaos/chaos.module.ts` - Prod exclusion
- `apps/api/src/modules/calc-preview/trace/trace-access.service.ts` - RBAC
- `apps/api/src/modules/calc-preview/trace/trace-retention.service.ts` - Retention
- `apps/api/src/modules/calc-preview/regression/GOVERNANCE.md` - Kurallar
- `apps/api/src/modules/calc-preview/regression/scripts/check-governance.ts` - CI checks

### 5.5 Gelecek İyileştirmeler (Backlog)

10-20 "golden scenario" ile her release'te preview orchestration output'u karşılaştır:

```typescript
interface GoldenScenario {
  id: string;
  name: string;
  input: CalcPreviewRequest;
  expectedOutput: {
    status: CalcPreviewStatus;
    interestRange: { min: number; max: number };
    feeRange: { min: number; max: number };
    warnings: string[];
  };
  tolerance: {
    interestPercent: number;  // e.g., 0.01 = 1%
    feePercent: number;
  };
}
```

**CI/CD entegrasyonu:**
- Her PR'da golden scenarios çalıştır
- Tolerance dışı sonuç → build fail
- "Tek kaynak" prensibinin yemin töreni

### 5.3 Chaos / Fault Injection (Mini)

Circuit breaker'ı gerçekten test etmeden güvenmek, paraşütü paketini açmadan uçaktan atlamak gibidir:

```typescript
interface FaultInjectionConfig {
  dependency: DependencyName;
  faultType: 'TIMEOUT' | 'ERROR_500' | 'LATENCY_SPIKE' | 'EMPTY_RESPONSE';
  duration: number;  // ms
  probability: number;  // 0-1
}
```

**Test senaryoları:**
- `rate_provider` timeout simülasyonu
- `tariff_provider` 500 error
- `interest_engine` latency spike (3x normal)

**Beklenen davranış:**
- Sistem "ölmeden" degrade etmeli
- Metrics/alerts çalışmalı
- Fallback evidence üretmeli

### 5.5 Load / Soak Test ✅ TAMAMLANDI

> "Ferrari'yi dyno'ya sokmadan otoyola çıkma"

**Amaç:** Phase 5'in "mezar taşı" - sistemin sadece doğru değil, uzun süre doğru kalabileceğini kanıtlamak.

**Uygulanan çözüm:**

1. **k6 Test Suite**
   - `soak-test.js`: 1 saat sabit yük (10 RPS)
   - `burst-test.js`: Rate limit + burst capacity testi
   - `chaos-soak-test.js`: Fault injection ile dayanıklılık
   - `stress-test.js`: Kırılma noktası tespiti

2. **SLO Thresholds**
   ```
   Soak:   p95 < 200ms, p99 < 500ms, success > 99%, memory growth < 20%
   Burst:  p95 < 300ms, p99 < 1000ms, success > 95%, rate limited < 20%
   Chaos:  p95 < 500ms, p99 < 2000ms, success > 90%, fallback < 15%
   Stress: p95 < 1000ms, p99 < 3000ms, success > 80%
   ```

3. **Memory Leak Detection**
   - Her 1 dakikada heap snapshot
   - Start vs End karşılaştırması
   - Growth > 20% → WARNING
   - Growth > 50% → FAIL

4. **Breaker Flapping Detection**
   - 5 dakika içinde 4+ state change → FLAP event
   - Flaps/hour > threshold → FAIL

5. **CI Integration**
   - Nightly soak test (2 AM UTC)
   - Manual trigger (soak/burst/chaos/stress)
   - Artifact upload (30 gün retention)
   - Summary report (GitHub Actions)

**Dosyalar:**
- `apps/api/src/modules/calc-preview/load-test/load-test.types.ts`
- `apps/api/src/modules/calc-preview/load-test/load-test-runner.ts`
- `apps/api/src/modules/calc-preview/load-test/load-test-reporter.ts`
- `apps/api/src/modules/calc-preview/load-test/k6/soak-test.js`
- `apps/api/src/modules/calc-preview/load-test/k6/burst-test.js`
- `apps/api/src/modules/calc-preview/load-test/k6/chaos-soak-test.js`
- `.github/workflows/load-test.yml`

**Çalıştırma:**
```bash
# Lokal
k6 run apps/api/src/modules/calc-preview/load-test/k6/soak-test.js

# CI
gh workflow run load-test.yml -f test_type=soak
```

---

### 5.6 Contract Tests ✅ TAMAMLANDI

> "Provider response'ları bilinçsizce değiştirilemez."

**Amaç:**
- Breaking change → CI fail
- Non-breaking change → allowlist/versiyon bump ile kontrollü geçiş
- Sadece JSON shape değil, domain semantiği de korunur

**Uygulanan çözüm:**

1. **2 Katmanlı Sözleşme**
   - Katman A: JSON Schema (Zod) - shape validation
   - Katman B: Semantic Contract - domain invariants

2. **Rate Provider Contract**
   - Schema: RateEntry, CoverageInfo, RatesForPeriodResponse
   - Semantic: DATE_ORDER, OVERLAP_DETECTED, SILENT_GAP, INVALID_CURRENCY
   - Fixtures: ok-minimal, ok-multi-segment, bad-overlap, bad-gap-silent

3. **Tariff Provider Contract**
   - Schema: FeeItem, FeeCalculationResult, FeePreviewResponse
   - Semantic: NEGATIVE_AMOUNT, TOTAL_MISMATCH, MIXED_CURRENCIES, EMPTY_VERSION
   - Fixtures: ok-minimal, ok-full-breakdown, bad-negative-amount, bad-total-mismatch

4. **Policy Engine Contract**
   - Schema: PolicyReason, PolicySoftCheckResult
   - Semantic: BLOCK_WITHOUT_REASONS, PASS_WITH_ERRORS, UNKNOWN_REASON_CODE
   - Fixtures: ok-pass, ok-warn, ok-block, bad-block-no-reasons, bad-pass-with-errors

5. **CI Integration**
   - PR'da zorunlu contract tests
   - Schema değişikliği uyarısı
   - Live smoke test (staging varsa)

**Dosyalar:**
- `apps/api/src/modules/calc-preview/contracts/providers/rate-provider/`
- `apps/api/src/modules/calc-preview/contracts/providers/tariff-provider/`
- `apps/api/src/modules/calc-preview/contracts/providers/policy-engine/`
- `.github/workflows/contract-tests.yml`

**Çalıştırma:**
```bash
pnpm --filter api test -- --testPathPattern='contracts/providers'
```

---

### 5.7 Gelecek İyileştirmeler (Backlog)

**Contract Tests v2 (İleri Seviye)**
- [ ] Schema'yı DTO'dan otomatik üretme
- [ ] X-Contract-Version header desteği
- [ ] Live smoke tests (staging)

**PolicyEngineService.softCheck() (Tam Entegrasyon)**
- [ ] Gerçek policy engine entegrasyonu
- [ ] Hardcoded gate'lerden kurtulma
- [ ] Policy version tracking

**TBK100 Allocation Preview**
- [ ] Ödeme mahsubu preview'da
- [ ] "Tahsilat girince faiz niye değişti" sorusunun cevabı
- [ ] paymentPreview[] response'a ekleme

**bigint Migration (Uzun vadeli)**
- [ ] Float TL → bigint kuruş
- [ ] Tüm sistemde migration
- [ ] Backward compatibility

**Release Reliability Gate**
- [ ] SLO: success rate / p95 / fallback / stale ratio eşikleri
- [ ] CRITICAL shadow diff = 0
- [ ] breaker OPEN spike = fail (ya da manual approval)

---

## 10. Referanslar

- `ARCHITECTURE.md` - Source of Truth Matrix
- `lib/api/interest-engine.ts` - Interest Engine API Client
- `lib/api/fee-engine.ts` - Fee Engine API Client
- `lib/api/calc-preview.ts` - Unified Preview API Client (Phase 3)
- `lib/api/policy-engine.ts` - Policy Engine API Client
- `hooks/useCaseCalculation.ts` - Hesap Özeti Hook
- `hooks/usePreviewCoordinator.ts` - Preview Coordinator Hook (Unified + Fallback)
- `components/preview/PreviewStatusBanner.tsx` - Preview Status UI
- `apps/api/src/modules/calc-preview/` - Unified Preview Backend Module
- `apps/api/src/modules/calc-preview/trace/` - Trace Bundle System (Phase 5.1)
- `apps/api/src/modules/calc-preview/regression/` - Golden Scenarios + Regression Gate (Phase 5.2)
- `apps/api/src/modules/calc-preview/chaos/` - Chaos / Fault Injection (Phase 5.3)
- `apps/api/src/modules/calc-preview/regression/GOVERNANCE.md` - Baseline Governance (Phase 5.4)
- `apps/api/src/modules/calc-preview/load-test/` - Load/Soak Test Suite (Phase 5.5)
- `apps/api/src/modules/calc-preview/contracts/` - Contract Tests (Phase 5.6)
- `.github/workflows/load-test.yml` - Load Test CI Workflow
- `.github/workflows/contract-tests.yml` - Contract Tests CI Workflow
- `apps/api/src/modules/calc-preview/sweep/` - Compile/Lint/Integration Sweep (Phase 5.7)
- `.github/workflows/sweep.yml` - Sweep CI Workflow

---

## 11. Phase 5.7 - Compile/Lint/Integration Sweep ✅ TAMAMLANDI

> "Kullanılmayan kod yok, çakışan env flag yok, prod build'de test/chaos/debug kalıntısı yok."

### 11.1 TypeScript Strict Mode

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

### 11.2 Environment Flags Registry

Tüm env flag'lerin merkezi kaydı (`sweep/env-flags.ts`):
- `ENV_FLAG_REGISTRY` - Tüm flag'ler metadata ile
- `loadEnvConfig()` - Type-safe config loading
- `validateEnvConfig()` - Production validation
- `generateEnvFlagTable()` - Markdown documentation

**Kurallar:**
- Test-only flag → prod build'de yok
- Aynı anlamda iki flag → birleştir
- Default davranış açıkça tanımlı

### 11.3 Module Boundary Sweep

Import grafiği analizi (`sweep/module-boundary-sweep.ts`):
- `NO_UPWARD_IMPORTS`: Internal modules → parent import edemez
- `NO_CROSS_PROVIDER_IMPORTS`: Provider'lar birbirini göremez
- `NO_CHAOS_IN_PROD`: Chaos module prod code'da import edilemez
- `NO_REGRESSION_IN_PROD`: Regression module prod code'da import edilemez

### 11.4 Build Artifact Sweep

Prod build temizlik kontrolü (`sweep/build-artifact-sweep.ts`):
- chaos/ klasörü yok
- regression/ klasörü yok
- .spec.js dosyaları yok
- FaultInjectorService referansı yok
- Source map'ler kapalı

### 11.5 Integration Sweep Tests

3 kritik akış testi (`sweep/integration-sweep.spec.ts`):
1. **Happy Path**: cache hit, breaker CLOSED
2. **Degraded Path**: rate_provider down, fallback
3. **Policy Block**: softCheck BLOCK

### 11.6 Production Build Config

`tsconfig.prod.json` - chaos/regression/test exclude:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "sourceMap": false
  },
  "exclude": [
    "src/**/*.spec.ts",
    "src/**/*.test.ts",
    "src/**/chaos/**",
    "src/**/regression/**",
    "src/**/load-test/**",
    "src/**/contracts/**"
  ]
}
```

### 11.7 CI Workflow

`.github/workflows/sweep.yml`:
- `typescript-strict`: TypeScript compile check
- `eslint-architecture`: ESLint architectural rules
- `module-boundary`: Import graph analysis
- `build-artifact`: Prod build cleanliness
- `env-flag-validation`: Env flag usage check
- `integration-sweep`: 3 flow integration tests

### 11.8 Çıkış Kriterleri

- [x] `npm run build` → warning = 0
- [x] `npm run lint` → error = 0
- [x] CI full pipeline → yeşil
- [x] Prod build'de chaos/regression/test yok
- [x] Env flag tablosu dokümante

---

## 12. Phase 5 Özet

```
Phase 5.1 ✅ Trace Bundle (kanıt üretimi)
Phase 5.2 ✅ Golden Scenarios (tek kaynak yemini)
Phase 5.3 ✅ Chaos/Fault Injection (dayanıklılık ayini)
Phase 5.4 ✅ Operasyonel Hijyen (yönetişim + güvenlik)
Phase 5.5 ✅ Load/Soak Test (dayanıklılık kanıtı)
Phase 5.6 ✅ Contract Tests (provider schema koruması)
Phase 5.7 ✅ Compile/Lint/Integration Sweep (temizlik)
```

**Sonuç:**
> "Bu platforma feature eklemek güvenli. Çünkü yanlışlıkla eski bir şeyi bozamam."

Phase 6 (ürün genişletme) artık güvenli.


---

## Phase 6A: Explainable Policy Preview ✅ BAŞLADI

> "Yeni feature = yeni invariant + yeni kanıt"

**Amaç:** Policy kararlarının (PASS/WARN/BLOCK) arkasındaki gerekçeleri kullanıcıya açıklamak.

### 6A.1 Core Invariant

```
BLOCK → explanations.length > 0
```

Her BLOCK kararının en az bir açıklaması OLMALIDIR. Bu invariant runtime'da zorlanır.

### 6A.2 Mimari

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CalcPreviewService                                   │
│                                                                              │
│  PolicyEngine.softCheck() ──► PolicySoftCheckResult                         │
│                                    │                                         │
│                                    ▼                                         │
│                          ExplanationService.explain()                        │
│                                    │                                         │
│                                    ▼                                         │
│                          PolicyExplanation[]                                 │
│                                    │                                         │
│                                    ▼                                         │
│                          CalcPreviewResponse.policy.explanations             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6A.3 Bileşenler

| Bileşen | Sorumluluk |
|---------|------------|
| `ExplanationService` | Reason code → human-readable açıklama |
| `ReasonCodeRegistry` | Static mapping (MVP: 10 kod) |
| `PolicyExplanation` | UX contract interface |

### 6A.4 Trace Event

```typescript
interface PolicyExplanationGeneratedEvent {
  eventType: 'POLICY_EXPLANATION_GENERATED';
  timestamp: string;
  policyOutcome: 'PASS' | 'WARN' | 'BLOCK';
  explanationCount: number;
  reasonCodes: string[];  // PII-free
  severityCounts: { error: number; warning: number; info: number };
  fallbackUsed: boolean;
}
```

### 6A.5 Degraded Mode

ExplanationService başarısız olursa:
- Policy outcome korunur (PASS/WARN/BLOCK)
- `explanationsDegraded: true` flag'i eklenir
- Fallback explanation döner

### 6A.6 Dosyalar

```
calc-preview/
├── explanation/
│   ├── explanation.types.ts      # Core types
│   ├── explanation.service.ts    # Main service
│   ├── reason-code-registry.ts   # MVP codes
│   └── index.ts                  # Exports
├── types.ts                      # Updated with PolicyExplanation
└── calc-preview.service.ts       # Integration
```

### 6A.7 Contract Updates

- `PolicyExplanationSchema` added to policy-engine contract
- Semantic validation: `validateBlockHasExplanations()`
- Semantic validation: `validateExplanationsSeverityOrder()`

---

**Phase 6A Durumu:** ✅ Core implementation complete, tests pending
