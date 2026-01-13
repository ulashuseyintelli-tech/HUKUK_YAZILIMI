# Design Document: Interest Calculation Engine

## Overview

Faiz Hesaplama Motoru (Interest Calculation Engine), icra takip sisteminde alacak kalemlerine uygulanan faizlerin doğru, segmentli ve hukuki kurallara uygun şekilde hesaplanmasını sağlayan kritik bir bileşendir.

### Temel İlkeler
- **Deterministik**: Aynı girdi → Aynı çıktı
- **Parametrik**: Tüm kurallar yapılandırılabilir
- **Denetlenebilir**: Her hesaplama kayıt altında
- **Testable Core**: CPE'ye entegre edilebilir pure business logic

### Calculation Modes

```typescript
enum CalculationMode {
  PREVIEW = 'PREVIEW',           // What-if, önizleme (gap warning only)
  PRODUCTION = 'PRODUCTION',     // Gerçek hesaplama (gap blocks)
  LEGAL_REPORT = 'LEGAL_REPORT', // Mahkeme raporu (strictest validation)
}
```

**Mode Determinism Sözleşmesi:**
- **PREVIEW**: Gap varken segmentler üretilir AMA `is_preview=true`, `non_authoritative=true` bayrakları ile işaretlenir. PreviewRecord olarak saklanır, CalculationRecord ile aynı statüde DEĞİL. Disclaimer metni zorunlu.
- **PRODUCTION**: Gap varken hesaplama bloke edilir. CalculationRecord oluşturulur.
- **LEGAL_REPORT**: En katı doğrulama. Gap, overlap, anomaly → hepsi ERROR. CalculationRecord + CalculationTrace zorunlu.

**Kritik Kural:** PREVIEW çıktısı asla mahkemeye sunulabilir belge olarak kabul edilmez. UI'da "Bu bir önizlemedir, resmi hesaplama değildir" uyarısı gösterilir.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Interest Calculation Engine                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Request   │  │   Policy    │  │  Segment    │  │ Allocation │ │
│  │  Validator  │→ │    Gate     │→ │   Builder   │→ │   Engine   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│         │               │               │                │          │
│         ▼               ▼               ▼                ▼          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Rate Provider (Cache + Version)           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │               │               │                │          │
│         ▼               ▼               ▼                ▼          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  Strategy   │  │   Reporter  │  │   Audit     │  │   Result   │ │
│  │   Layer     │  │  (Legal)    │  │   Writer    │  │  Builder   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces


### 1. Domain Model

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// CLAIM BUCKET (Alacak Kalemi)
// ═══════════════════════════════════════════════════════════════════════════
interface ClaimBucket {
  id: string;
  amount: number;                    // Anapara tutarı
  currency: Currency;                // TRY, USD, EUR
  startDate: string;                 // Faiz başlangıç tarihi (ISO)
  interestType: InterestTypeCode;    // Faiz türü
  dayCountBasis: 365 | 360;          // Gün sayımı bazı
  priority?: number;                 // CUSTOM mode için öncelik
  
  // Çek/Senet için
  ibrazTarihi?: string;
  vadeTarihi?: string;
  
  // Sabit oran için
  fixedRate?: number;                // e.g., 0.48 for %48
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT (Faiz Dilimi)
// ═══════════════════════════════════════════════════════════════════════════
interface Segment {
  claimBucketId: string;
  periodStart: string;               // ISO date
  periodEnd: string;                 // ISO date
  days: number;                      // Gün sayısı
  rate: number;                      // Yıllık oran (decimal)
  rateId: string;                    // Rate entry ID
  rateSource: string;                // "TCMB 20.12.2025"
  principal: number;                 // Segment anaparası
  segmentInterest: number;           // Segment faizi
  phase?: 'PRE_ENFORCEMENT' | 'POST_ENFORCEMENT';
  dayCountRule: string;              // "Actual/365"
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT
// ═══════════════════════════════════════════════════════════════════════════
interface Payment {
  id: string;
  date: string;                      // ISO date
  amount: number;
  currency: Currency;
  source?: string;                   // "Banka havalesi", "Haciz"
}

// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION STEP (TBK 100 Mahsup Adımı)
// ═══════════════════════════════════════════════════════════════════════════
interface AllocationStep {
  paymentId: string;
  paymentDate: string;
  paymentAmount: number;
  allocations: AllocationCategory[];
  remainingPayment: number;
  newPrincipal: number;
  claimBucketId: string;
}

interface AllocationCategory {
  category: AncillaryType | 'INTEREST' | 'PRINCIPAL';
  label: string;
  amountBefore: number;
  amountAllocated: number;
  amountAfter: number;
}

enum AncillaryType {
  VEKALET_UCRETI = 'VEKALET_UCRETI',
  HARC = 'HARC',
  TEBLIGAT_MASRAFI = 'TEBLIGAT_MASRAFI',
  CEK_TAZMINATI = 'CEK_TAZMINATI',
  KOMISYON = 'KOMISYON',
  DIGER = 'DIGER',
}
```

### 2. Strategy Layer

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// CASE TYPE STRATEGY
// ═══════════════════════════════════════════════════════════════════════════
interface CaseTypeStrategy {
  caseType: CaseType;
  defaultInterestType: InterestTypeCode | 'AUTO_BY_DEBT_NATURE';
  defaultStartEvent: StartDateEvent;
  allowedStartEvents: StartDateEvent[];
  dayCountBasis: 365 | 360;
  rateSeriesSource: RateSeriesSource;
  assumeCommercial: boolean;
  specialRules?: {
    includeKarsilisizCekTazminati?: boolean;
    requireIbrazAfterVade?: boolean;
  };
}

// Strategy Registry
const CASE_TYPE_STRATEGIES: Record<CaseType, CaseTypeStrategy> = {
  KAMBIYO_CEK: {
    caseType: CaseType.KAMBIYO_CEK,
    defaultInterestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    defaultStartEvent: StartDateEvent.PRESENTATION_DATE,
    allowedStartEvents: [DRAW_DATE, PRESENTATION_DATE, NOTICE_DATE, FOLLOWUP_DATE],
    dayCountBasis: 365,
    rateSeriesSource: 'TCMB_AVANS',
    assumeCommercial: true,
    specialRules: { includeKarsilisizCekTazminati: true, requireIbrazAfterVade: true },
  },
  // ... diğer stratejiler
};
```


### 3. Rate Provider

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// RATE PROVIDER (Cache + Version)
// ═══════════════════════════════════════════════════════════════════════════
interface RateProvider {
  // Dönem için oranları getir
  getRatesForPeriod(
    interestType: InterestTypeCode,
    startDate: string,
    endDate: string,
    tenantId: string,
  ): Promise<RateQueryResult>;
  
  // Belirli tarihteki oranı getir
  getRateAtDate(
    interestType: InterestTypeCode,
    date: string,
    tenantId: string,
  ): Promise<RateEntry | null>;
  
  // Oran tablosu sürümü
  getRateTableVersion(
    interestType: InterestTypeCode,
    startDate: string,
    endDate: string,
    tenantId: string,
  ): Promise<string>;
}

interface RateEntry {
  id: string;
  interestType: InterestTypeCode;
  validFrom: string;                 // Geçerlilik başlangıcı
  validTo: string | null;            // Geçerlilik bitişi (null = güncel)
  annualRate: number;                // Yıllık oran (decimal)
  source: RateSourceType;            // TCMB, RESMI_GAZETE
  sourceReference: string;           // "TCMB 20.12.2025"
  publishedDate?: string;            // Yayın tarihi (effective date'ten farklı olabilir)
  versionHash: string;               // Change detection için
}

interface RateQueryResult {
  rates: RateEntry[];
  hasGaps: boolean;
  gaps?: { from: string; to: string }[];
  rateTableVersion: string;          // Tüm oranların hash'i
  
  // Coverage Map (Policy Gate için)
  coverage: {
    coveragePercent: number;         // 0-100
    totalDays: number;
    coveredDays: number;
    gaps: { from: string; to: string; days: number }[];
    overlaps: { date: string; entries: string[] }[];
    hasInferredRates: boolean;       // Varsayılan oran kullanıldı mı
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE SYNC SERVICE (TCMB Entegrasyonu)
// ═══════════════════════════════════════════════════════════════════════════
interface RateSyncService {
  // TCMB'den oranları çek ve kaydet
  syncTcmbAvansRates(): Promise<SyncResult>;
  syncTcmbTtk1530Rates(): Promise<SyncResult>;
  syncLegalRates(): Promise<SyncResult>;
  
  // Effective date normalization
  normalizeEffectiveDate(publishedDate: string, source: RateSourceType): string;
}

/**
 * Rate Source-of-Truth Kuralları:
 * 
 * 1. TCMB Avans: TCMB Reeskont ve Avans Faiz Oranları tablosu
 *    - Yayın tarihi = Geçerlilik tarihi (aynı gün)
 *    - Source: "TCMB", SourceRef: "TCMB 20.12.2025"
 * 
 * 2. TTK 1530: TCMB yıllık ilan
 *    - Yayın tarihi ≠ Geçerlilik tarihi (yıl başı)
 *    - Source: "TCMB", SourceRef: "TCMB TTK1530 2025"
 * 
 * 3. Yasal Faiz: Resmi Gazete
 *    - Yayın tarihi ≠ Geçerlilik tarihi (kanun yürürlük)
 *    - Source: "RESMI_GAZETE", SourceRef: "RG 01.01.2024"
 * 
 * Gap Fill Politikası:
 * - Gap varsa: ASLA varsayılan oran kullanılmaz (fail-closed)
 * - Overlap varsa: En son eklenen kayıt geçerli (createdAt DESC)
 * - Coverage map her zaman döndürülür, Policy Gate karar verir
 */
```

### 4. Segment Builder

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT BUILDER
// ═══════════════════════════════════════════════════════════════════════════
interface SegmentBuilder {
  buildSegments(
    claimBucket: ClaimBucket,
    asOfDate: string,
    rates: RateEntry[],
    options: SegmentBuildOptions,
  ): Segment[];
}

interface SegmentBuildOptions {
  enforcementDate?: string;          // Takip tarihi (phase ayrımı için)
  dayCountBasis: 365 | 360;
  roundingMode: RoundingMode;
  roundingScope: RoundingScope;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMELINE GENERATOR
// ═══════════════════════════════════════════════════════════════════════════
// Timeline kritik tarihleri içerir:
// 1. startDate (faiz başlangıcı)
// 2. endDate (hesap tarihi)
// 3. Rate change dates (oran değişim tarihleri)
// 4. enforcementDate (takip tarihi - varsa)
// 5. Payment dates (ödeme tarihleri - varsa)

function generateTimeline(
  startDate: string,
  endDate: string,
  rates: RateEntry[],
  enforcementDate?: string,
  paymentDates?: string[],
): string[] {
  const dates = new Set<string>();
  dates.add(startDate);
  dates.add(endDate);
  
  if (enforcementDate && enforcementDate > startDate && enforcementDate < endDate) {
    dates.add(enforcementDate);
  }
  
  for (const rate of rates) {
    if (rate.validFrom > startDate && rate.validFrom <= endDate) {
      dates.add(rate.validFrom);
    }
  }
  
  if (paymentDates) {
    for (const pd of paymentDates) {
      if (pd > startDate && pd < endDate) {
        dates.add(pd);
      }
    }
  }
  
  return Array.from(dates).sort();
}

// ═══════════════════════════════════════════════════════════════════════════
// DAY COUNT CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL RULE: [start, end) - Start inclusive, end exclusive
// Timezone: Europe/Istanbul (date-only, 00:00:00)

/**
 * Segment Boundary Rules (Hukuki Mayın Tarlası Çözümü):
 * 
 * 1. Day Count: [start, end) - Başlangıç dahil, bitiş hariç
 *    Örnek: 01.01.2025 → 05.01.2025 = 4 gün
 * 
 * 2. Rate Change Boundary: Oran değişim günü YENİ orana dahil
 *    Örnek: 20.12.2025'te oran değişti → 20.12.2025 yeni oranla hesaplanır
 *    Segment 1: [start, 20.12.2025) eski oran
 *    Segment 2: [20.12.2025, end) yeni oran
 * 
 * 3. Payment Boundary (sameDayPaymentRule):
 *    - END_OF_DAY: Ödeme günü faiz işler, ödeme gün sonunda uygulanır
 *      Segment: [start, payment_date] faiz hesaplanır
 *    - START_OF_DAY: Ödeme günü faiz işlemez, ödeme gün başında uygulanır
 *      Segment: [start, payment_date) faiz hesaplanır
 * 
 * 4. Enforcement Date Boundary: Takip tarihi POST_ENFORCEMENT'a dahil
 *    PRE_ENFORCEMENT: [start, enforcement_date)
 *    POST_ENFORCEMENT: [enforcement_date, end)
 */

function calculateDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00+03:00'); // Istanbul
  const end = new Date(endDate + 'T00:00:00+03:00');
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEREST FORMULA
// ═══════════════════════════════════════════════════════════════════════════
// Formula: principal * annualRate * days / dayCountBasis

function calculateSegmentInterest(
  principal: number,
  annualRate: number,
  days: number,
  dayCountBasis: 365 | 360,
): number {
  return (principal * annualRate * days) / dayCountBasis;
}
```


### 5. Allocation Engine (TBK 100)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// TBK 100 ALLOCATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════
interface AllocationEngine {
  allocatePayment(
    payment: Payment,
    debtState: DebtState,
    options: AllocationOptions,
  ): AllocationStep;
  
  allocateMultiplePayments(
    payments: Payment[],
    initialDebtState: DebtState,
    claimBuckets: ClaimBucket[],
    options: AllocationOptions,
    interestCalculator: InterestCalculatorFn,
  ): AllocationStep[];
}

interface DebtState {
  principal: number;
  accruedInterest: number;
  costs: Map<AncillaryType, number>;  // Masraflar by type
  ancillaries: Map<AncillaryType, number>; // Fer'iler by type
}

interface AllocationOptions {
  claimPriorityRule: ClaimPriorityRule;
  sameDayPaymentRule: SameDayPaymentRule;
  ancillaryPriority: AncillaryType[]; // Öncelik sırası
}

enum ClaimPriorityRule {
  OLDEST_DUE_FIRST = 'OLDEST_DUE_FIRST',
  HIGHEST_RATE_FIRST = 'HIGHEST_RATE_FIRST',
  CUSTOM = 'CUSTOM',
}

enum SameDayPaymentRule {
  END_OF_DAY = 'END_OF_DAY',     // Ödeme günü faiz işler
  START_OF_DAY = 'START_OF_DAY', // Ödeme günü faiz işlemez
}

// ═══════════════════════════════════════════════════════════════════════════
// TBK 100 ALLOCATION ORDER
// ═══════════════════════════════════════════════════════════════════════════
// Sıra: INTEREST → HARC → TEBLIGAT_MASRAFI → VEKALET_UCRETI → 
//       CEK_TAZMINATI → KOMISYON → DIGER → PRINCIPAL

/**
 * TBK 100 vs Policy Çakışma Protokolü:
 * 
 * HARD RULE (TBK 100 - Kanun):
 * 1. Faiz önce
 * 2. Masraflar (costs) ikinci
 * 3. Fer'iler (ancillaries) üçüncü
 * 4. Anapara son
 * 
 * SOFT RULE (Policy - Ürün):
 * - claimPriorityRule: Aynı sınıf içinde tie-breaker
 * - ancillaryPriority: Masraf/fer'i alt sıralaması
 * 
 * ÇAKIŞMA KURALI:
 * TBK 100 HARD RULE her zaman galip.
 * Policy sadece aynı sınıf kalemleri arasında sıralama belirler.
 * 
 * Örnek:
 * - 3 claim bucket var (A, B, C)
 * - claimPriorityRule = OLDEST_DUE_FIRST
 * - Ödeme geldi: 10.000 TL
 * 
 * Sıra:
 * 1. A'nın faizi → B'nin faizi → C'nin faizi (TBK 100: faiz önce)
 * 2. A'nın masrafları → B'nin masrafları → C'nin masrafları (TBK 100: masraf ikinci)
 * 3. A'nın fer'ileri → B'nin fer'ileri → C'nin fer'ileri (TBK 100: fer'i üçüncü)
 * 4. A'nın anaparası → B'nin anaparası → C'nin anaparası (TBK 100: anapara son)
 * 
 * A, B, C sırası claimPriorityRule ile belirlenir (OLDEST_DUE_FIRST).
 */

const DEFAULT_ANCILLARY_PRIORITY: AncillaryType[] = [
  AncillaryType.HARC,
  AncillaryType.TEBLIGAT_MASRAFI,
  AncillaryType.VEKALET_UCRETI,
  AncillaryType.CEK_TAZMINATI,
  AncillaryType.KOMISYON,
  AncillaryType.DIGER,
];

function allocatePayment(
  payment: Payment,
  debtState: DebtState,
  options: AllocationOptions,
): AllocationStep {
  let remaining = payment.amount;
  const allocations: AllocationCategory[] = [];
  
  // 1. INTEREST (İşlemiş Faiz)
  const interestAlloc = allocateToCategory('INTEREST', 'İşlemiş Faiz', 
    debtState.accruedInterest, remaining);
  allocations.push(interestAlloc);
  remaining -= interestAlloc.amountAllocated;
  
  // 2. COSTS & ANCILLARIES (Masraflar ve Fer'iler - öncelik sırasına göre)
  for (const ancType of options.ancillaryPriority) {
    const amount = debtState.costs.get(ancType) || debtState.ancillaries.get(ancType) || 0;
    if (amount > 0 && remaining > 0) {
      const alloc = allocateToCategory(ancType, getAncillaryLabel(ancType), amount, remaining);
      allocations.push(alloc);
      remaining -= alloc.amountAllocated;
    }
  }
  
  // 3. PRINCIPAL (Anapara)
  const principalAlloc = allocateToCategory('PRINCIPAL', 'Anapara', 
    debtState.principal, remaining);
  allocations.push(principalAlloc);
  remaining -= principalAlloc.amountAllocated;
  
  return {
    paymentId: payment.id,
    paymentDate: payment.date,
    paymentAmount: payment.amount,
    allocations,
    remainingPayment: remaining,
    newPrincipal: debtState.principal - principalAlloc.amountAllocated,
    claimBucketId: '', // Multi-claim'de set edilir
  };
}
```

### 6. Policy Gate

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// POLICY GATE
// ═══════════════════════════════════════════════════════════════════════════
interface PolicyGate {
  validate(
    request: CalculationRequest,
    rates: RateQueryResult,
    mode: CalculationMode,
  ): PolicyValidationResult;
}

interface PolicyValidationResult {
  valid: boolean;
  warnings: PolicyWarning[];
  canProceed: boolean;
}

interface PolicyWarning {
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  suggestion?: string;
  field?: string;
  
  // Evidence (deterministik audit için)
  evidence?: {
    gaps?: { from: string; to: string; days: number }[];
    overlaps?: { date: string; entries: string[] }[];
    anomalyValue?: number;
    expectedRange?: { min: number; max: number };
  };
}

/**
 * PolicyGate Decision Object Standardı:
 * 
 * Her PolicyGate kararı şunları içermelidir:
 * 1. decisionCode: ALLOW | BLOCK | WARN
 * 2. humanMessage: Türkçe açıklama
 * 3. evidence: Deterministik kanıt (tarihler, günler, ID'ler)
 * 
 * Örnek:
 * {
 *   decisionCode: 'BLOCK',
 *   humanMessage: 'Oran tablosunda 15 günlük boşluk tespit edildi',
 *   evidence: {
 *     gaps: [{ from: '2025-01-05', to: '2025-01-20', days: 15 }]
 *   }
 * }
 */

enum GapPolicy {
  BLOCK = 'BLOCK',                           // Her gap bloke eder
  WARN_AND_BLOCK_FOR_HIGH_RISK = 'WARN_AND_BLOCK_FOR_HIGH_RISK', // Yüksek risk bloke
  WARN_ONLY_FOR_PREVIEW = 'WARN_ONLY_FOR_PREVIEW', // Sadece uyarı
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION RULES
// ═══════════════════════════════════════════════════════════════════════════
const POLICY_RULES = {
  // Rate Gap
  RATE_GAP: {
    check: (rates: RateQueryResult) => rates.hasGaps,
    severity: (mode: CalculationMode) => 
      mode === CalculationMode.PREVIEW ? 'WARNING' : 'ERROR',
    message: 'Oran tablosunda boşluk tespit edildi',
  },
  
  // Inferred Rate (LEGAL_REPORT'ta otomatik ERROR)
  INFERRED_RATE: {
    check: (rates: RateQueryResult) => rates.coverage.hasInferredRates,
    severity: (mode: CalculationMode) => 
      mode === CalculationMode.LEGAL_REPORT ? 'ERROR' : 'WARNING',
    message: 'Varsayılan oran kullanıldı - mahkeme modunda kabul edilmez',
  },
  
  // Negative Days
  NEGATIVE_DAYS: {
    check: (days: number) => days < 0,
    severity: () => 'ERROR',
    message: 'Negatif gün sayısı',
  },
  
  // Zero Days
  ZERO_DAYS: {
    check: (days: number) => days === 0,
    severity: () => 'WARNING',
    message: 'Sıfır gün faiz hesabı',
  },
  
  // Long Segment
  LONG_SEGMENT: {
    check: (days: number, rateCount: number) => days > 180 && rateCount === 1,
    severity: () => 'WARNING',
    message: 'Uzun segment oran değişikliği içerebilir',
  },
  
  // Çek İbraz Before Vade
  IBRAZ_BEFORE_VADE: {
    check: (ibraz: string, vade: string) => ibraz < vade,
    severity: () => 'ERROR',
    message: 'İbraz tarihi vade tarihinden önce olamaz',
  },
  
  // Excessive Contractual Rate
  EXCESSIVE_CONTRACTUAL_RATE: {
    check: (contractRate: number, legalRate: number) => contractRate > legalRate * 3,
    severity: () => 'WARNING',
    message: 'Sözleşmesel faiz yasal faizin 3 katını aşıyor',
  },
  
  // Interest Anomaly
  INTEREST_ANOMALY: {
    check: (effectiveRate: number) => effectiveRate < 0.05 || effectiveRate > 0.60,
    severity: () => 'WARNING',
    message: 'Hesaplanan faiz beklenen aralık dışında',
  },
};
```


### 7. Reporter (Legal Text Generator)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// LEGAL TEXT REPORTER
// ═══════════════════════════════════════════════════════════════════════════
interface Reporter {
  generateLegalText(result: CalculationResult): string;
  generateSegmentReport(segments: Segment[]): string;
  generateAllocationReport(allocations: AllocationStep[]): string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL TEXT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════
const LEGAL_TEXT_TEMPLATES: Record<InterestTypeCode, string> = {
  [InterestTypeCode.LEGAL_3095]: 
    '3095 sayılı Kanun m.1 uyarınca yasal faiz',
  [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: 
    '3095 sayılı Kanun m.2/2 uyarınca ticari temerrüt faizi (TCMB avans oranı)',
  [InterestTypeCode.TTK_1530]: 
    'TTK m.1530 uyarınca geç ödeme faizi',
  [InterestTypeCode.CONTRACTUAL]: 
    'Sözleşme hükümleri uyarınca akdi faiz',
  // ... diğer türler
};

function generateLegalText(result: CalculationResult): string {
  const lines: string[] = [];
  
  // Faiz türü
  const typeText = LEGAL_TEXT_TEMPLATES[result.interestType];
  lines.push(`${typeText} uyarınca hesaplanan faiz.`);
  
  // Oran bilgisi
  const rates = [...new Set(result.segments.map(s => s.rate))];
  if (rates.length > 1) {
    lines.push(`Dönemsel oran değişiklikleri dikkate alınmıştır.`);
    lines.push(`Uygulanan oranlar: ${rates.map(r => `%${(r * 100).toFixed(2)}`).join(', ')}`);
  } else {
    lines.push(`Uygulanan oran: %${(rates[0] * 100).toFixed(2)}`);
  }
  
  // Gün sayımı kuralı
  lines.push(`Gün sayımı: ${result.dayCountRule}`);
  
  // Same-day payment kuralı
  if (result.sameDayPaymentRule) {
    const ruleText = result.sameDayPaymentRule === 'END_OF_DAY' 
      ? 'gün sonunda' : 'gün başında';
    lines.push(`Ödeme ${ruleText} uygulanmıştır.`);
  }
  
  // Yuvarlama
  lines.push(`Yuvarlama: ${result.roundingMode}, ${result.roundingScope}`);
  
  return lines.join('\n');
}
```

### 8. Calculation Record / Audit

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION RECORD
// ═══════════════════════════════════════════════════════════════════════════
interface CalculationRecord {
  id: string;
  caseId: string;
  tenantId: string;
  
  // Input
  inputHash: string;                 // SHA-256 of request
  request: CalculationRequest;       // Full request (for reproduction)
  
  // Output Summary
  totalInterest: number;
  totalDue: number;
  segmentCount: number;
  warningCount: number;
  
  // Versions
  rateTableVersion: string;
  engineVersion: string;
  ruleVersion: string;
  
  // Metadata
  mode: CalculationMode;
  calculatedAt: string;
  calculatedBy?: string;
  
  // Retention
  retentionExpiresAt: string;        // 90 days default
  isArchived: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION TRACE (Detaylı - Opsiyonel)
// ═══════════════════════════════════════════════════════════════════════════
interface CalculationTrace {
  recordId: string;
  segments: Segment[];               // Full segment details
  allocations: AllocationStep[];     // Full allocation details
  ratesUsed: RateEntry[];            // Rates snapshot
  
  // Retention (shorter than record)
  retentionExpiresAt: string;        // 30 days default
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT WRITER
// ═══════════════════════════════════════════════════════════════════════════
interface AuditWriter {
  writeRecord(
    request: CalculationRequest,
    result: CalculationResult,
    tenantId: string,
    userId?: string,
  ): Promise<string>; // Returns recordId
  
  writeTrace(
    recordId: string,
    segments: Segment[],
    allocations: AllocationStep[],
    rates: RateEntry[],
  ): Promise<void>;
  
  getRecord(recordId: string): Promise<CalculationRecord | null>;
  getTrace(recordId: string): Promise<CalculationTrace | null>;
  getRecordsForCase(caseId: string, tenantId: string): Promise<CalculationRecord[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT HASH GENERATION
// ═══════════════════════════════════════════════════════════════════════════
function generateInputHash(request: CalculationRequest): string {
  const normalized = JSON.stringify({
    claimBuckets: request.claimBuckets.map(c => ({
      amount: c.amount,
      currency: c.currency,
      startDate: c.startDate,
      interestType: c.interestType,
    })),
    payments: request.payments?.map(p => ({
      date: p.date,
      amount: p.amount,
    })),
    asOfDate: request.asOfDate,
    mode: request.mode,
    options: request.options,
  });
  return createHash('sha256').update(normalized).digest('hex');
}
```

## Data Models


### Request / Response Models

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION REQUEST
// ═══════════════════════════════════════════════════════════════════════════
interface CalculationRequest {
  caseId: string;
  claimBuckets: ClaimBucket[];
  payments?: Payment[];
  asOfDate: string;                  // Hesap tarihi (ISO)
  enforcementDate?: string;          // Takip tarihi (ISO)
  mode: CalculationMode;
  
  options: CalculationOptions;
}

interface CalculationOptions {
  // Day Count
  dayCountBasis: 365 | 360;
  sameDayPaymentRule: SameDayPaymentRule;
  
  // Rounding
  roundingMode: RoundingMode;
  roundingScope: RoundingScope;
  
  // Policy
  gapPolicy: GapPolicy;
  
  // Allocation
  claimPriorityRule: ClaimPriorityRule;
  ancillaryPriority?: AncillaryType[];
  
  // FX (Döviz)
  fxRateSource?: FxRateSource;
  conversionDateRule?: ConversionDateRule;
  interestCurrency?: 'SAME_AS_PRINCIPAL' | 'TRY';
  
  // Special
  includeKarsilisizCekTazminati?: boolean;
  skipPolicyGate?: boolean;          // Test only
}

enum RoundingMode {
  HALF_UP = 'HALF_UP',
  BANKERS = 'BANKERS',
}

enum RoundingScope {
  PER_SEGMENT = 'PER_SEGMENT',
  TOTAL_ONLY = 'TOTAL_ONLY',
}

enum FxRateSource {
  TCMB_SATIS = 'TCMB_SATIS',
  TCMB_ALIS = 'TCMB_ALIS',
  TCMB_EFEKTIF_SATIS = 'TCMB_EFEKTIF_SATIS',
}

enum ConversionDateRule {
  PAYMENT_DATE = 'PAYMENT_DATE',
  CALCULATION_DATE = 'CALCULATION_DATE',
  ENFORCEMENT_DATE = 'ENFORCEMENT_DATE',
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION RESULT
// ═══════════════════════════════════════════════════════════════════════════
interface CalculationResult {
  caseId: string;
  calculatedAt: string;
  asOfDate: string;
  
  // Totals
  totalInterest: number;
  totalDue: number;
  preEnforcementInterest?: number;
  postEnforcementInterest?: number;
  
  // Details
  segments: Segment[];
  allocations?: AllocationStep[];
  
  // Warnings
  policyWarnings: PolicyWarning[];
  
  // Legal
  legalText: string;
  interestType: InterestTypeCode;
  
  // Audit
  auditLogId: string;
  inputHash: string;
  
  // Versions
  rateTableVersion: string;
  engineVersion: string;
  ruleVersion: string;
  
  // Options Used
  dayCountRule: string;              // "Actual/365"
  sameDayPaymentRule?: SameDayPaymentRule;
  roundingMode: RoundingMode;
  roundingScope: RoundingScope;
  gapPolicy: GapPolicy;
  claimPriorityRule?: ClaimPriorityRule;
  
  // FX (if applicable)
  fxRate?: number;
  fxDate?: string;
  fxSource?: FxRateSource;
}
```

### Database Schema (Prisma)

```prisma
// ═══════════════════════════════════════════════════════════════════════════
// RATE SCHEDULE
// ═══════════════════════════════════════════════════════════════════════════
model RateSchedule {
  id            String    @id @default(cuid())
  tenantId      String
  interestType  String    // InterestTypeCode
  validFrom     DateTime
  validTo       DateTime?
  annualRate    Decimal   @db.Decimal(10, 6)
  source        String    // RateSourceType
  sourceRef     String?   // "TCMB 20.12.2025"
  publishedDate DateTime? // Yayın tarihi
  versionHash   String
  createdBy     String?
  createdAt     DateTime  @default(now())
  
  @@unique([tenantId, interestType, validFrom])
  @@index([tenantId, interestType])
  @@index([validFrom])
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION RECORD
// ═══════════════════════════════════════════════════════════════════════════
model InterestCalculationRecord {
  id                  String    @id @default(cuid())
  tenantId            String
  caseId              String
  inputHash           String
  request             Json      // CalculationRequest
  
  // Output Summary
  totalInterest       Decimal   @db.Decimal(15, 2)
  totalDue            Decimal   @db.Decimal(15, 2)
  segmentCount        Int
  warningCount        Int
  
  // Versions
  rateTableVersion    String
  engineVersion       String
  ruleVersion         String
  
  // Metadata
  mode                String    // CalculationMode
  calculatedAt        DateTime  @default(now())
  calculatedBy        String?
  
  // Retention
  retentionExpiresAt  DateTime
  isArchived          Boolean   @default(false)
  
  trace               InterestCalculationTrace?
  
  @@index([tenantId, caseId])
  @@index([inputHash])
  @@index([calculatedAt])
  @@index([retentionExpiresAt])
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION TRACE
// ═══════════════════════════════════════════════════════════════

model InterestCalculationTrace {
  id                  String    @id @default(cuid())
  recordId            String    @unique
  record              InterestCalculationRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)
  segments            Json      // Segment[]
  allocations         Json?     // AllocationStep[]
  ratesUsed           Json      // RateEntry[]
  retentionExpiresAt  DateTime
  createdAt           DateTime  @default(now())
  
  @@index([retentionExpiresAt])
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Determinism (Round Trip)

*For any* valid CalculationRequest, calculating interest twice with identical inputs SHALL produce identical outputs (same totalInterest, same segments, same inputHash).

**Validates: Requirements 11.3**

### Property 2: Segment Interest Formula Correctness

*For any* segment with principal P, annual rate R, days D, and day count basis B, the segment interest SHALL equal P * R * D / B (within rounding tolerance).

**Validates: Requirements 3.3**

### Property 3: TBK 100 Allocation Order

*For any* payment allocation, the allocation order SHALL be: INTEREST first, then COSTS (by ancillary priority), then ANCILLARIES (by ancillary priority), then PRINCIPAL. No category SHALL receive allocation before a higher-priority category is fully satisfied.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 4: Policy Gate Blocking

*For any* calculation where Policy_Gate returns at least one ERROR severity warning, the Interest_Engine SHALL block the calculation and return error (not partial result).

**Validates: Requirements 5.9**

### Property 5: Rate Gap Detection

*For any* calculation period where rate table has gaps, the Rate_Schedule SHALL return hasGaps=true and gaps array SHALL contain all gap periods (fromDate, toDate).

**Validates: Requirements 1.8, 5.1**

### Property 6: Day Count Calculation Consistency

*For any* two dates startDate and endDate in Istanbul timezone, the day count SHALL be calculated as: start day inclusive, end day exclusive. The result SHALL be consistent regardless of time component (date-only).

**Validates: Requirements 12.3, 12.4, 12.8, 12.9**

### Property 7: Rounding Consistency

*For any* calculation with roundingMode M and roundingScope S, all monetary values SHALL be rounded according to M, and rounding SHALL be applied at scope S (per-segment or total-only). The result SHALL be reproducible.

**Validates: Requirements 13.2, 13.3, 13.4, 13.5, 13.6**

### Property 8: Multi-Claim Priority Order

*For any* calculation with multiple claim buckets and claimPriorityRule R, payment allocation SHALL process claims in order determined by R (OLDEST_DUE_FIRST: by startDate ascending, HIGHEST_RATE_FIRST: by rate descending, CUSTOM: by priority field).

**Validates: Requirements 17.4, 17.5, 17.6, 17.7**

### Property 9: Version Reproducibility

*For any* past calculation with recorded rateTableVersion, engineVersion, and ruleVersion, re-running the calculation with same versions SHALL produce identical result.

**Validates: Requirements 15.6**

### Property 10: Segment Sum Equals Total

*For any* calculation result, the sum of all segment interests SHALL equal totalInterest (within rounding tolerance based on roundingScope).

**Validates: Requirements 3.6**

### Property 11: Rate Version Hash Determinism

*For any* rate entry with same (interestType, validFrom, annualRate, source), the generated versionHash SHALL be identical.

**Validates: Requirements 1.7**

### Property 12: Enforcement Date Phase Separation

*For any* calculation with enforcementDate E, all segments with periodEnd <= E SHALL have phase='PRE_ENFORCEMENT', and all segments with periodStart >= E SHALL have phase='POST_ENFORCEMENT'.

**Validates: Requirements 3.5**

### Property 13: Monotonicity Under Additional Payment

*For any* calculation with existing payments P1..Pn, adding a new payment Pn+1 SHALL NOT increase previously calculated interest or debt components (within rounding tolerance). The total debt SHALL decrease or stay same, never increase due to payment.

**Validates: Requirements 4.6, 11.3**

### Property 14: Idempotent Allocation Steps

*For any* calculation with same input, same rateTableVersion, same roundingParams, the AllocationStep[] array SHALL be identical in both order and values (not just totals).

**Validates: Requirements 11.3, 4.7**

## KVKK / Audit Compliance

Faiz hesaplama motoru, kişisel veri içeren hesaplama kayıtlarını KVKK (6698 sayılı Kanun) ve hukuki denetim gereksinimlerine uygun şekilde yönetir.

### 1. Veri Sınıflandırması

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// VERİ KATEGORİLERİ
// ═══════════════════════════════════════════════════════════════════════════
enum DataCategory {
  // Kişisel Veri (KVKK kapsamında)
  PERSONAL = 'PERSONAL',           // TC Kimlik, isim, adres
  FINANCIAL = 'FINANCIAL',         // Alacak tutarları, ödeme bilgileri
  
  // Operasyonel Veri
  CALCULATION = 'CALCULATION',     // Hesaplama sonuçları
  AUDIT = 'AUDIT',                 // Denetim izleri
  SYSTEM = 'SYSTEM',               // Sistem logları
}

// Veri alanı → Kategori eşlemesi
const DATA_FIELD_CLASSIFICATION = {
  // CalculationRecord
  'caseId': DataCategory.PERSONAL,           // Dosya no → kişiye bağlanabilir
  'calculatedBy': DataCategory.PERSONAL,     // Kullanıcı ID
  'request.claimBuckets': DataCategory.FINANCIAL,
  'request.payments': DataCategory.FINANCIAL,
  'totalInterest': DataCategory.CALCULATION,
  'segments': DataCategory.CALCULATION,
  
  // Trace
  'allocations': DataCategory.FINANCIAL,
  'ratesUsed': DataCategory.SYSTEM,
};
```

### 2. Maskeleme (Pseudonymization) Kuralları

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// MASKELEME SERVİSİ
// ═══════════════════════════════════════════════════════════════════════════
interface MaskingService {
  // Kişisel veri maskeleme
  maskPersonalData(data: any, context: MaskingContext): any;
  
  // Maskelenmiş veriyi geri çözme (yetkili kullanıcı için)
  unmaskPersonalData(maskedData: any, context: MaskingContext): any;
}

interface MaskingContext {
  tenantId: string;
  userId: string;
  purpose: MaskingPurpose;
  accessLevel: AccessLevel;
}

enum MaskingPurpose {
  AUDIT_EXPORT = 'AUDIT_EXPORT',       // Denetim raporu
  LEGAL_REPORT = 'LEGAL_REPORT',       // Mahkeme raporu (maskelenmez)
  ANALYTICS = 'ANALYTICS',             // İstatistik (tam maskeleme)
  SUPPORT = 'SUPPORT',                 // Destek (kısmi maskeleme)
}

/**
 * Maskeleme Kuralları:
 * 
 * 1. TC Kimlik No: İlk 3 ve son 2 hane görünür → "123*****89"
 * 2. İsim: İlk harf görünür → "A*** B***"
 * 3. Dosya No: Yıl görünür, sıra no maskelenir → "2025/****"
 * 4. Tutar: LEGAL_REPORT hariç maskelenir → "***,**.** TL"
 * 5. IBAN: İlk 4 ve son 4 karakter görünür → "TR12****5678"
 * 
 * İstisna: LEGAL_REPORT purpose için maskeleme uygulanmaz
 * (mahkeme belgesi tam veri gerektirir)
 */

function maskCaseId(caseId: string, purpose: MaskingPurpose): string {
  if (purpose === MaskingPurpose.LEGAL_REPORT) return caseId;
  // "2025/12345" → "2025/****"
  const parts = caseId.split('/');
  return `${parts[0]}/${'*'.repeat(parts[1]?.length || 5)}`;
}

function maskAmount(amount: number, purpose: MaskingPurpose): string {
  if (purpose === MaskingPurpose.LEGAL_REPORT) return amount.toFixed(2);
  return '***,**.** TL';
}
```

### 3. Rol Tabanlı Erişim Kontrolü (RBAC)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// ERİŞİM SEVİYELERİ
// ═══════════════════════════════════════════════════════════════════════════
enum AccessLevel {
  NONE = 0,
  SUMMARY_ONLY = 1,      // Sadece özet (toplam faiz, segment sayısı)
  MASKED = 2,            // Maskelenmiş detay
  FULL_READ = 3,         // Tam okuma (maskelenmemiş)
  FULL_WRITE = 4,        // Tam okuma + yazma
  ADMIN = 5,             // Silme dahil tüm yetkiler
}

// Rol → Erişim seviyesi eşlemesi
const ROLE_ACCESS_MATRIX: Record<string, Record<string, AccessLevel>> = {
  // CalculationRecord erişimi
  'CALCULATION_RECORD': {
    'VIEWER': AccessLevel.SUMMARY_ONLY,
    'STAFF': AccessLevel.MASKED,
    'LAWYER': AccessLevel.FULL_READ,
    'MANAGER': AccessLevel.FULL_READ,
    'ADMIN': AccessLevel.ADMIN,
    'AUDITOR': AccessLevel.FULL_READ,  // Denetçi tam okuma
  },
  
  // CalculationTrace erişimi
  'CALCULATION_TRACE': {
    'VIEWER': AccessLevel.NONE,
    'STAFF': AccessLevel.SUMMARY_ONLY,
    'LAWYER': AccessLevel.MASKED,
    'MANAGER': AccessLevel.FULL_READ,
    'ADMIN': AccessLevel.ADMIN,
    'AUDITOR': AccessLevel.FULL_READ,
  },
  
  // PreviewRecord erişimi
  'PREVIEW_RECORD': {
    'VIEWER': AccessLevel.MASKED,
    'STAFF': AccessLevel.FULL_READ,
    'LAWYER': AccessLevel.FULL_READ,
    'MANAGER': AccessLevel.FULL_READ,
    'ADMIN': AccessLevel.ADMIN,
    'AUDITOR': AccessLevel.NONE,  // Denetçi preview görmez
  },
};

/**
 * Erişim Kontrolü Kuralları:
 * 
 * 1. Tenant izolasyonu: Kullanıcı sadece kendi tenant verilerine erişir
 * 2. Case bazlı erişim: Kullanıcı atandığı dosyalara erişir
 * 3. Rol bazlı erişim: Rol seviyesine göre veri detayı
 * 4. Audit log: Her erişim kaydedilir
 */
```

### 4. Saklama Politikası (Retention Policy)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// SAKLAMA SÜRELERİ
// ═══════════════════════════════════════════════════════════════════════════
const RETENTION_POLICY = {
  // CalculationRecord: 10 yıl (hukuki zorunluluk)
  CALCULATION_RECORD: {
    activeDays: 90,              // Aktif erişim süresi
    archiveDays: 3650,           // Arşiv süresi (10 yıl)
    totalDays: 3740,             // Toplam saklama
    deleteAfter: false,          // Silme yerine arşivleme
  },
  
  // CalculationTrace: 2 yıl (detaylı iz)
  CALCULATION_TRACE: {
    activeDays: 30,              // Aktif erişim süresi
    archiveDays: 730,            // Arşiv süresi (2 yıl)
    totalDays: 760,
    deleteAfter: true,           // Süre sonunda silinir
    summaryRetained: true,       // Özet saklanır
  },
  
  // PreviewRecord: 30 gün (geçici)
  PREVIEW_RECORD: {
    activeDays: 30,
    archiveDays: 0,
    totalDays: 30,
    deleteAfter: true,           // Süre sonunda silinir
    summaryRetained: false,
  },
  
  // AuditAccessLog: 5 yıl (erişim logları)
  AUDIT_ACCESS_LOG: {
    activeDays: 365,
    archiveDays: 1825,           // 5 yıl
    totalDays: 2190,
    deleteAfter: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// RETENTION SERVICE
// ═══════════════════════════════════════════════════════════════════════════
interface RetentionService {
  // Süresi dolan kayıtları arşivle
  archiveExpiredRecords(): Promise<ArchiveResult>;
  
  // Süresi dolan trace'leri sil (özet sakla)
  purgeExpiredTraces(): Promise<PurgeResult>;
  
  // Preview kayıtlarını temizle
  cleanupPreviewRecords(): Promise<CleanupResult>;
  
  // Arşivden geri yükle (yetkili kullanıcı)
  restoreFromArchive(recordId: string, reason: string): Promise<void>;
}

/**
 * Arşivleme Stratejisi:
 * 
 * 1. Aktif → Arşiv: Sıkıştırılmış JSON, ayrı tablo/storage
 * 2. Arşiv erişimi: Sadece ADMIN/AUDITOR, log kaydı zorunlu
 * 3. Trace silme: Önce özet çıkar, sonra detay sil
 * 4. Preview silme: Doğrudan silme, özet yok
 */
```

### 5. Silme Talebi İşleme (Right to Erasure)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// SİLME TALEBİ İŞLEME
// ═══════════════════════════════════════════════════════════════════════════
interface ErasureRequestHandler {
  // KVKK m.11 silme talebi
  handleErasureRequest(request: ErasureRequest): Promise<ErasureResult>;
}

interface ErasureRequest {
  requesterId: string;           // Talep eden kişi
  dataSubjectId: string;         // Veri sahibi (borçlu/alacaklı)
  requestDate: string;
  scope: ErasureScope;
  legalBasis?: string;           // Hukuki dayanak
}

enum ErasureScope {
  FULL = 'FULL',                 // Tüm kişisel veri
  PARTIAL = 'PARTIAL',           // Belirli kayıtlar
  ANONYMIZE = 'ANONYMIZE',       // Anonimleştirme
}

interface ErasureResult {
  success: boolean;
  recordsAffected: number;
  blockedRecords: BlockedRecord[];  // Silinemeyen kayıtlar
  completedAt: string;
  auditLogId: string;
}

interface BlockedRecord {
  recordId: string;
  reason: ErasureBlockReason;
  retentionUntil?: string;
}

enum ErasureBlockReason {
  LEGAL_HOLD = 'LEGAL_HOLD',           // Hukuki bekletme
  ACTIVE_CASE = 'ACTIVE_CASE',         // Aktif dava
  REGULATORY_RETENTION = 'REGULATORY_RETENTION', // Yasal saklama süresi
  AUDIT_REQUIREMENT = 'AUDIT_REQUIREMENT',       // Denetim gereksinimi
}

/**
 * Silme Talebi Kuralları:
 * 
 * 1. Aktif dosya varsa: Silme BLOKE, dosya kapanana kadar beklet
 * 2. Yasal saklama süresi dolmadıysa: Silme BLOKE, süre sonuna kadar beklet
 * 3. Hukuki bekletme varsa: Silme BLOKE, bekletme kalkana kadar
 * 4. Silme mümkünse: Kişisel veri anonimleştirilir, hesaplama verisi kalır
 * 
 * Anonimleştirme:
 * - TC Kimlik → Hash
 * - İsim → "Anonim Borçlu #12345"
 * - Dosya No → "ANON/2025/12345"
 * - Tutarlar → Korunur (istatistik için)
 */
```

### 6. Denetim Erişim Logu (Audit Access Log)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// ERİŞİM LOGU
// ═══════════════════════════════════════════════════════════════════════════
interface AuditAccessLog {
  id: string;
  tenantId: string;
  
  // Kim
  userId: string;
  userRole: string;
  userIp: string;
  userAgent: string;
  
  // Ne
  resourceType: 'CALCULATION_RECORD' | 'CALCULATION_TRACE' | 'PREVIEW_RECORD';
  resourceId: string;
  action: AccessAction;
  
  // Nasıl
  accessLevel: AccessLevel;
  maskedFields?: string[];       // Maskelenen alanlar
  
  // Ne zaman
  accessedAt: string;
  
  // Neden (opsiyonel)
  purpose?: string;
  justification?: string;
}

enum AccessAction {
  VIEW = 'VIEW',
  EXPORT = 'EXPORT',
  PRINT = 'PRINT',
  DOWNLOAD = 'DOWNLOAD',
  UNMASK = 'UNMASK',             // Maskeyi kaldırma
  ARCHIVE_ACCESS = 'ARCHIVE_ACCESS',
  RESTORE = 'RESTORE',
}

/**
 * Erişim Logu Kuralları:
 * 
 * 1. Her okuma loglanır (VIEW, EXPORT, PRINT, DOWNLOAD)
 * 2. Maskeyi kaldırma ayrıca loglanır (UNMASK)
 * 3. Arşiv erişimi ayrıca loglanır (ARCHIVE_ACCESS)
 * 4. Log kaydı değiştirilemez (immutable)
 * 5. Log kaydı 5 yıl saklanır
 */

// Prisma Schema
// model AuditAccessLog {
//   id           String   @id @default(cuid())
//   tenantId     String
//   userId       String
//   userRole     String
//   userIp       String
//   userAgent    String
//   resourceType String
//   resourceId   String
//   action       String
//   accessLevel  Int
//   maskedFields Json?
//   accessedAt   DateTime @default(now())
//   purpose      String?
//   justification String?
//   
//   @@index([tenantId, resourceId])
//   @@index([userId])
//   @@index([accessedAt])
// }
```

### 7. Preview Kayıt Ayrımı

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW RECORD (Önizleme Kaydı)
// ═══════════════════════════════════════════════════════════════════════════
interface PreviewRecord {
  id: string;
  tenantId: string;
  caseId: string;
  
  // Preview bayrakları
  isPreview: true;               // Sabit true
  nonAuthoritative: true;        // Sabit true
  
  // Disclaimer
  disclaimer: string;            // Zorunlu uyarı metni
  
  // Input/Output (CalculationRecord ile aynı yapı)
  inputHash: string;
  request: CalculationRequest;
  totalInterest: number;
  segments: Segment[];
  
  // Metadata
  createdAt: string;
  createdBy: string;
  expiresAt: string;             // 30 gün sonra
  
  // Gap bilgisi (preview'da gap olabilir)
  hasRateGaps: boolean;
  gapDetails?: { from: string; to: string }[];
}

const PREVIEW_DISCLAIMER = `
⚠️ BU BİR ÖNİZLEMEDİR - RESMİ HESAPLAMA DEĞİLDİR

Bu hesaplama sonucu yalnızca bilgilendirme amaçlıdır.
Mahkemeye veya resmi kurumlara sunulamaz.
Oran tablosunda eksiklik olabilir.
Kesin hesaplama için "Hesapla" butonunu kullanınız.

Oluşturulma: {createdAt}
Geçerlilik: {expiresAt} tarihine kadar
`;

/**
 * Preview vs CalculationRecord Farkları:
 * 
 * | Özellik              | Preview          | CalculationRecord |
 * |----------------------|------------------|-------------------|
 * | Gap varken hesaplama | ✅ İzin verilir  | ❌ Bloke edilir   |
 * | Mahkemeye sunulabilir| ❌ Hayır         | ✅ Evet           |
 * | Saklama süresi       | 30 gün           | 10 yıl            |
 * | Denetçi erişimi      | ❌ Hayır         | ✅ Evet           |
 * | Disclaimer           | ✅ Zorunlu       | ❌ Yok            |
 * | Trace kaydı          | ❌ Yok           | ✅ Opsiyonel      |
 */
```

### 8. KVKK Uyumluluk Kontrol Listesi

| Madde | Gereksinim | Uygulama |
|-------|------------|----------|
| m.4/2-c | Veri minimizasyonu | Sadece gerekli veri toplanır |
| m.4/2-ç | Doğruluk | inputHash ile veri bütünlüğü |
| m.4/2-d | Saklama süresi sınırı | Retention policy |
| m.5 | İşleme şartları | Meşru menfaat (hukuki süreç) |
| m.7 | Veri güvenliği | Maskeleme, RBAC, şifreleme |
| m.11 | Silme hakkı | ErasureRequestHandler |
| m.12 | Veri sorumlusu yükümlülükleri | Audit log, erişim kontrolü |


### Error Codes

```typescript
const InterestEngineErrorCodes = {
  // Rate Errors
  RATE_GAP: 'RATE_GAP',                       // Oran tablosunda boşluk
  RATE_OVERLAP: 'RATE_OVERLAP',               // Oran tablosunda çakışma
  RATE_NOT_FOUND: 'RATE_NOT_FOUND',           // Oran bulunamadı
  
  // Date Errors
  NEGATIVE_DAYS: 'NEGATIVE_DAYS',             // Negatif gün sayısı
  ZERO_DAYS: 'ZERO_DAYS',                     // Sıfır gün
  INVALID_DATE_FORMAT: 'INVALID_DATE_FORMAT', // Geçersiz tarih formatı
  
  // Validation Errors
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_INTEREST_TYPE: 'INVALID_INTEREST_TYPE',
  INVALID_CURRENCY: 'INVALID_CURRENCY',
  
  // Çek Errors
  IBRAZ_BEFORE_VADE: 'IBRAZ_BEFORE_VADE',     // İbraz < vade
  
  // Anomaly Warnings
  INTEREST_ANOMALY: 'INTEREST_ANOMALY',       // Beklenen aralık dışı
  LONG_SEGMENT: 'LONG_SEGMENT',               // Uzun segment
  SINGLE_RATE_LONG_PERIOD: 'SINGLE_RATE_LONG_PERIOD',
  EXCESSIVE_CONTRACTUAL_RATE: 'EXCESSIVE_CONTRACTUAL_RATE',
  
  // System Errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  CALCULATION_TIMEOUT: 'CALCULATION_TIMEOUT',
} as const;
```

### Error Handling Strategy

1. **Validation Errors (400)**: Missing fields, invalid formats → Immediate rejection with descriptive error
2. **Policy Gate Errors (422)**: Rate gaps, rule violations → Block with warnings array
3. **System Errors (500)**: Database failures → No partial results, clean error response
4. **Warnings (200 with warnings)**: Anomalies, suggestions → Proceed but include warnings

```typescript
interface InterestEngineError {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
  details?: Record<string, any>;
}

// Error Response
interface ErrorResponse {
  success: false;
  error: InterestEngineError;
  warnings?: PolicyWarning[];
}

// Success Response (may include warnings)
interface SuccessResponse {
  success: true;
  data: CalculationResult;
}
```

## Testing Strategy

### Unit Tests

Unit tests verify specific examples and edge cases:

1. **Day Count Calculation**
   - Same day (0 days)
   - Single day (1 day)
   - Month boundary
   - Year boundary
   - Leap year handling

2. **Rounding**
   - HALF_UP: 0.005 → 0.01
   - BANKERS: 0.015 → 0.02, 0.025 → 0.02
   - PER_SEGMENT vs TOTAL_ONLY difference

3. **TBK 100 Allocation**
   - Payment < interest
   - Payment = interest
   - Payment > interest + costs
   - Full payoff

4. **Policy Gate**
   - Rate gap detection
   - Negative days rejection
   - Çek ibraz/vade validation

### Property-Based Tests

Property-based tests verify universal properties across all inputs using fast-check library.

**Configuration:**
- Minimum 100 iterations per property
- Tag format: `Feature: interest-calculation-engine, Property N: {property_text}`

**Test File:** `interest-engine.property.spec.ts`

```typescript
import fc from 'fast-check';

describe('Interest Calculation Engine Properties', () => {
  // Property 1: Determinism
  it('Property 1: identical inputs produce identical outputs', () => {
    fc.assert(
      fc.property(
        arbitraryCalculationRequest(),
        (request) => {
          const result1 = engine.calculate(request);
          const result2 = engine.calculate(request);
          return result1.totalInterest === result2.totalInterest &&
                 result1.inputHash === result2.inputHash;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Property 2: Segment formula
  it('Property 2: segment interest equals P * R * D / B', () => {
    fc.assert(
      fc.property(
        arbitrarySegmentInput(),
        ({ principal, rate, days, basis }) => {
          const expected = (principal * rate * days) / basis;
          const actual = calculateSegmentInterest(principal, rate, days, basis);
          return Math.abs(actual - expected) < 0.01; // Rounding tolerance
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Property 3: TBK 100 order
  it('Property 3: allocation follows TBK 100 order', () => {
    fc.assert(
      fc.property(
        arbitraryPaymentAndDebtState(),
        ({ payment, debtState }) => {
          const result = allocatePayment(payment, debtState);
          // Interest must be allocated before principal
          const interestIdx = result.allocations.findIndex(a => a.category === 'INTEREST');
          const principalIdx = result.allocations.findIndex(a => a.category === 'PRINCIPAL');
          return interestIdx < principalIdx;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // ... diğer property testleri
});
```

### Integration Tests

1. **Full Calculation Flow**: Request → Validation → Segments → Allocation → Result
2. **Rate Provider Integration**: TCMB sync → Rate storage → Rate retrieval
3. **Audit Trail**: Calculation → Record creation → Trace creation → Retrieval

### Regression Tests (Golden Scenarios)

Real case snapshots for regression testing:
- Kambiyo çek with multiple rate changes
- İlamsız genel with partial payments
- TTK 1530 with 30-day rule
- Multi-claim with different start dates
