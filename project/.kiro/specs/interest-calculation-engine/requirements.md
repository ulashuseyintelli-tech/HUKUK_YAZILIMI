# Requirements Document

## Introduction

Faiz Hesaplama Motoru (Interest Calculation Engine), icra takip sisteminde alacak kalemlerine uygulanan faizlerin doğru, segmentli ve hukuki kurallara uygun şekilde hesaplanmasını sağlayan kritik bir bileşendir. Bu modül, TCMB oran tablolarını entegre eder, takip tipine göre faiz stratejisi belirler, TBK 100 mahsup sıralamasını uygular ve hesaplama hatalarını policy gate ile yakalar.

**Temel İlke:** Aynı girdi → Aynı çıktı (Deterministik hesaplama)

## Glossary

- **Interest_Engine**: Faiz hesaplama motorunun ana servisi
- **Rate_Schedule**: TCMB ve diğer kaynaklardan alınan faiz oranlarının dönemsel tablosu
- **Segment**: Tek bir oran döneminde hesaplanan faiz dilimi
- **TBK_100_Allocator**: Türk Borçlar Kanunu 100. madde uyarınca ödeme mahsup sıralaması servisi
- **Policy_Gate**: Hesaplama öncesi doğrulama ve anomali tespiti servisi
- **Rate_Sync**: TCMB oran tablolarını otomatik senkronize eden servis
- **Interest_Type**: Faiz türü (Yasal, Ticari Avans, TTK 1530, Akdi)
- **Case_Type**: Takip türü (Kambiyo, İlamsız, İlamlı, TTK 1530)
- **Principal_Item**: Faiz hesaplanacak alacak kalemi (claim bucket)
- **Enforcement_Date**: Takip tarihi (takip öncesi/sonrası faiz ayrımı için)
- **Day_Count_Basis**: Gün sayımı kuralı (Actual/365 veya Actual/360)
- **Rounding_Mode**: Yuvarlama modu (HALF_UP veya BANKERS)
- **Calculation_Record**: Hesaplama denetim kaydı (input hash, output, versions)
- **Ancillary_Type**: Fer'i alacak türü (vekalet ücreti, harç, tazminat)
- **FX_Rate_Source**: Döviz kuru kaynağı (TCMB satış kuru)
- **Rate_Table_Version**: Oran tablosu sürüm hash'i

## Requirements

### Requirement 1: TCMB Oran Tabloları Entegrasyonu

**User Story:** As a hukuk bürosu çalışanı, I want TCMB faiz oranlarının otomatik güncellenmesini, so that faiz hesaplamalarım her zaman güncel ve doğru olsun.

#### Acceptance Criteria

1. THE Rate_Sync SHALL fetch TCMB Reeskont ve Avans faiz oranlarını resmi kaynaktan
2. THE Rate_Sync SHALL fetch TCMB TTK 1530 geç ödeme faiz oranlarını resmi kaynaktan
3. THE Rate_Sync SHALL fetch yasal faiz oranlarını (3095 sayılı Kanun m.1) resmi kaynaktan
4. WHEN a new rate is published by TCMB, THE Rate_Sync SHALL detect and store the new rate within 24 hours
5. THE Rate_Schedule SHALL store each rate with validFrom date, validTo date, annualRate, source, and sourceReference
6. WHEN storing a new rate, THE Rate_Schedule SHALL automatically close the previous rate's validTo date
7. THE Rate_Schedule SHALL generate a versionHash for each rate entry for change detection
8. WHEN a rate gap is detected for a calculation period, THE Rate_Schedule SHALL return hasGaps=true with gap details

### Requirement 2: Takip Tipine Göre Faiz Stratejisi Eşlemesi

**User Story:** As a avukat, I want takip tipine göre otomatik faiz türü ve başlangıç tarihi belirlenmesini, so that her dosya için doğru faiz stratejisi uygulanabilsin.

#### Acceptance Criteria

1. WHEN a case type is KAMBIYO_CEK, THE Interest_Engine SHALL default to COMMERCIAL_AVANS_3095_2_2 interest type with PRESENTATION_DATE start event
2. WHEN a case type is KAMBIYO_BONO, THE Interest_Engine SHALL default to COMMERCIAL_AVANS_3095_2_2 interest type with DUE_DATE start event
3. WHEN a case type is ILAMSIZ_GENEL, THE Interest_Engine SHALL determine interest type based on debt nature (commercial vs civil)
4. WHEN a case type is ILAMSIZ_KIRA, THE Interest_Engine SHALL default to LEGAL_3095 interest type
5. WHEN a case type is TTK_1530_SUPPLY, THE Interest_Engine SHALL default to TTK_1530 interest type with DUE_DATE_OR_30D policy
6. WHEN a case type is ILAMLI, THE Interest_Engine SHALL determine interest type based on debt nature with JUDGMENT_DATE start event
7. THE Interest_Engine SHALL allow manual override of interest type with audit logging
8. WHEN interest type is overridden manually, THE Interest_Engine SHALL log the change with reason field

### Requirement 3: Segmentli Faiz Hesaplama

**User Story:** As a icra takip uzmanı, I want değişen oranlarda segmentli faiz hesaplaması, so that TCMB oran değişiklikleri doğru şekilde yansıtılsın.

#### Acceptance Criteria

1. THE Interest_Engine SHALL calculate interest in segments where each segment uses a single rate
2. WHEN TCMB rate changes during calculation period, THE Interest_Engine SHALL create a new segment at the rate change date
3. FOR ALL segments, THE Interest_Engine SHALL calculate interest using formula: principal * annualRate * days / dayCountBasis
4. THE Interest_Engine SHALL support both 365 and 360 day count basis
5. WHEN enforcement date is provided, THE Interest_Engine SHALL separate segments into PRE_ENFORCEMENT and POST_ENFORCEMENT phases
6. THE Interest_Engine SHALL sum all segment interests to produce totalInterest
7. THE Interest_Engine SHALL generate a timeline of critical dates including start, end, rate changes, and enforcement date
8. FOR ALL calculations, THE Interest_Engine SHALL round results to 2 decimal places

### Requirement 4: TBK 100 Mahsup Sıralaması

**User Story:** As a muhasebe sorumlusu, I want kısmi ödemelerin TBK 100'e göre doğru sırayla mahsup edilmesini, so that alacak bakiyesi hukuki kurallara uygun hesaplansın.

#### Acceptance Criteria

1. WHEN a payment is received, THE TBK_100_Allocator SHALL allocate first to accrued interest
2. WHEN interest is fully paid, THE TBK_100_Allocator SHALL allocate next to costs (harç, tebligat)
3. WHEN costs are fully paid, THE TBK_100_Allocator SHALL allocate next to ancillaries (komisyon, tazminat)
4. WHEN ancillaries are fully paid, THE TBK_100_Allocator SHALL allocate remaining to principal
5. WHEN multiple payments exist, THE TBK_100_Allocator SHALL process payments in chronological order
6. WHEN processing multiple payments, THE TBK_100_Allocator SHALL recalculate interest between payment dates
7. THE TBK_100_Allocator SHALL return allocation breakdown for each payment showing amountBefore, amountAllocated, amountAfter
8. THE TBK_100_Allocator SHALL calculate newPrincipal after each payment allocation

### Requirement 5: Policy Gate Doğrulama

**User Story:** As a sistem yöneticisi, I want hatalı hesaplamaların otomatik yakalanmasını, so that yanlış faiz hesaplamalarının önüne geçilebilsin.

#### Acceptance Criteria

1. WHEN rate coverage has gaps for calculation period, THE Policy_Gate SHALL return ERROR severity warning
2. WHEN calculated interest is outside expected bounds (5%-60% annual), THE Policy_Gate SHALL return WARNING severity
3. WHEN day count is negative, THE Policy_Gate SHALL return ERROR severity and block calculation
4. WHEN day count is zero, THE Policy_Gate SHALL return WARNING severity
5. WHEN segment exceeds 180 days without rate change, THE Policy_Gate SHALL return WARNING for potential missing rate changes
6. WHEN ibraz date is before vade date for çek, THE Policy_Gate SHALL return ERROR severity
7. WHEN contractual interest rate exceeds 3x legal rate, THE Policy_Gate SHALL return WARNING about potential court reduction
8. WHEN single rate is used for period longer than 90 days, THE Policy_Gate SHALL return WARNING about potential missing rate changes
9. IF Policy_Gate returns any ERROR severity warnings, THEN THE Interest_Engine SHALL block the calculation

### Requirement 6: Faiz Raporu Oluşturma

**User Story:** As a avukat, I want detaylı faiz raporu oluşturabilmeyi, so that mahkemeye veya karşı tarafa sunulabilecek belgeler hazırlayabileyim.

#### Acceptance Criteria

1. THE Interest_Engine SHALL generate legalText describing the interest type and applicable law
2. THE Interest_Engine SHALL include all segment details in calculation result (periodStart, periodEnd, days, rate, rateSource, segmentInterest)
3. WHEN enforcement date is provided, THE Interest_Engine SHALL report preEnforcementInterest and postEnforcementInterest separately
4. THE Interest_Engine SHALL include policyWarnings in calculation result
5. THE Interest_Engine SHALL generate auditLogId for each calculation
6. THE Interest_Engine SHALL include rate source references (e.g., "TCMB 20.12.2025") in segment details
7. THE Interest_Engine SHALL calculate and report totalDue (principal + totalInterest)

### Requirement 7: Hesaplama Denetim Kaydı

**User Story:** As a denetçi, I want tüm faiz hesaplamalarının kayıt altına alınmasını, so that geçmiş hesaplamalar incelenebilsin ve değişiklikler izlenebilsin.

#### Acceptance Criteria

1. THE Interest_Engine SHALL log every calculation to audit log with request and result
2. THE Interest_Engine SHALL store rateVersionHashes used in calculation for reproducibility
3. THE Interest_Engine SHALL record calculatedAt timestamp for each calculation
4. THE Interest_Engine SHALL record userId who triggered the calculation
5. THE Interest_Engine SHALL store segments array in audit log
6. WHEN retrieving calculation history, THE Interest_Engine SHALL return all past calculations for a case

### Requirement 8: Çek Tazminatı Hesaplama

**User Story:** As a avukat, I want karşılıksız çek tazminatının otomatik hesaplanmasını, so that çek takiplerinde tazminat tutarı doğru belirlensin.

#### Acceptance Criteria

1. WHEN case type is KAMBIYO_CEK and includeKarsilisizCekTazminati option is true, THE Interest_Engine SHALL calculate çek tazminatı
2. THE Interest_Engine SHALL calculate çek tazminatı as percentage of çek amount per applicable law
3. THE Interest_Engine SHALL add çek tazminatı to totalDue calculation
4. WHEN ibraz date is provided, THE Interest_Engine SHALL use ibraz date as interest start date for çek

### Requirement 9: Döviz Alacağı Faiz Hesaplama

**User Story:** As a avukat, I want döviz alacaklarında doğru faiz türünün uygulanmasını, so that 3095 m.2/3 kapsamında mevduat faizi hesaplanabilsin.

#### Acceptance Criteria

1. WHEN principal currency is USD, THE Interest_Engine SHALL support MEVDUAT_USD_BANKALARCA and MEVDUAT_USD_KAMU interest types
2. WHEN principal currency is EUR, THE Interest_Engine SHALL support MEVDUAT_EUR_BANKALARCA and MEVDUAT_EUR_KAMU interest types
3. THE Rate_Schedule SHALL store separate rate series for each currency and bank type
4. THE Interest_Engine SHALL apply currency-specific rates for foreign currency principals

### Requirement 10: Performans ve Güvenilirlik

**User Story:** As a sistem kullanıcısı, I want faiz hesaplamalarının hızlı ve güvenilir olmasını, so that iş akışım kesintiye uğramasın.

#### Acceptance Criteria

1. THE Interest_Engine SHALL complete calculation within 500ms for typical cases (p95)
2. THE Rate_Schedule SHALL cache rates with configurable TTL
3. WHEN rate cache is invalidated, THE Rate_Schedule SHALL refresh from database
4. THE Interest_Engine SHALL handle concurrent calculations without data corruption
5. IF database connection fails during calculation, THEN THE Interest_Engine SHALL return appropriate error without partial results

### Requirement 11: Hesaplama Sözleşmesi (Calculation Contract)

**User Story:** As a geliştirici, I want hesaplama girdilerinin ve çıktılarının net tanımlı olmasını, so that deterministik ve tekrarlanabilir sonuçlar elde edeyim.

#### Acceptance Criteria

1. THE Interest_Engine SHALL accept a standardized CalculationRequest containing: principalItems[], payments[], startDate, endDate, interestType, rateTableSource, currency, caseType, roundingMode, dayCountBasis
2. THE Interest_Engine SHALL return a standardized CalculationResult containing: totalInterest, segments[], allocations[], warnings[], auditHash, rateTableVersion, engineVersion, ruleVersion
3. FOR ALL identical inputs, THE Interest_Engine SHALL produce identical outputs (deterministic)
4. THE Interest_Engine SHALL include inputHash in CalculationResult for verification
5. THE Interest_Engine SHALL reject requests with missing required fields with descriptive error

### Requirement 12: Gün Sayımı ve Tarih Kuralları

**User Story:** As a avukat, I want gün sayımı kurallarının net ve yapılandırılabilir olmasını, so that faiz hesaplamalarında tarih kaynaklı hatalar önlensin.

#### Acceptance Criteria

1. THE Interest_Engine SHALL support Actual/365 day count basis as default
2. THE Interest_Engine SHALL support Actual/360 day count basis as configurable option
3. THE Interest_Engine SHALL include start date in day count (start day inclusive)
4. THE Interest_Engine SHALL exclude end date from day count (end day exclusive)
5. THE Interest_Engine SHALL support sameDayPaymentRule options: END_OF_DAY (default), START_OF_DAY
6. WHEN sameDayPaymentRule is END_OF_DAY, THE Interest_Engine SHALL accrue interest for payment day
7. WHEN sameDayPaymentRule is START_OF_DAY, THE Interest_Engine SHALL NOT accrue interest for payment day
8. THE Interest_Engine SHALL use Istanbul timezone (Europe/Istanbul) for all date operations
9. THE Interest_Engine SHALL store and process dates as date-only (no time component, 00:00:00)
10. FOR ALL segments, THE Interest_Engine SHALL report dayCountRule and sameDayPaymentRule used in calculation
11. THE Interest_Engine SHALL include in report text: "Ödeme [gün sonunda/gün başında] uygulanmıştır"

### Requirement 13: Yuvarlama Standardı

**User Story:** As a muhasebe sorumlusu, I want yuvarlama kurallarının tutarlı ve yapılandırılabilir olmasını, so that kuruş farklılıkları kontrol altında olsun.

#### Acceptance Criteria

1. THE Interest_Engine SHALL support currencyMinorUnit configuration (TRY=2, USD=2, EUR=2, JPY=0)
2. THE Interest_Engine SHALL use HALF_UP rounding mode as default (0.005 → 0.01)
3. THE Interest_Engine SHALL support BANKERS rounding mode as configurable option
4. THE Interest_Engine SHALL support roundingScope options: PER_SEGMENT (default), TOTAL_ONLY
5. WHEN roundingScope is PER_SEGMENT, THE Interest_Engine SHALL round each segment interest individually
6. WHEN roundingScope is TOTAL_ONLY, THE Interest_Engine SHALL sum raw segment values and round only the total
7. WHEN currency conversion is applied, THE Interest_Engine SHALL round after conversion
8. THE Interest_Engine SHALL report roundingMode and roundingScope used in CalculationResult
9. THE Interest_Engine SHALL include rounding difference (if any) in audit log for TOTAL_ONLY mode

### Requirement 14: Oran Tablosu Boşluk ve Çakışma Politikası

**User Story:** As a sistem yöneticisi, I want oran tablosu anomalilerinin net kurallarla ele alınmasını, so that sessiz yanlış hesaplamalar önlensin.

#### Acceptance Criteria

1. THE Interest_Engine SHALL support gapPolicy options: BLOCK, WARN_AND_BLOCK_FOR_HIGH_RISK, WARN_ONLY_FOR_PREVIEW
2. WHEN gapPolicy is BLOCK, THE Interest_Engine SHALL fail-closed for any rate gap (default for production calculations)
3. WHEN gapPolicy is WARN_AND_BLOCK_FOR_HIGH_RISK, THE Interest_Engine SHALL block for UYAP_SEND/LEGAL_REPORT actions but allow preview with warning
4. WHEN gapPolicy is WARN_ONLY_FOR_PREVIEW, THE Interest_Engine SHALL allow calculation with warning (for what-if/preview mode only)
5. WHEN rate table has overlapping entries for same date, THE Rate_Schedule SHALL use most recently created entry
6. THE Rate_Schedule SHALL log overlap detection with both entry IDs
7. THE Policy_Gate SHALL validate rate coverage before calculation starts
8. WHEN gap is detected, THE Policy_Gate SHALL return gap details (fromDate, toDate, interestType)
9. THE Interest_Engine SHALL include gapPolicy used in CalculationResult

### Requirement 15: Sürüm Yönetimi (Versioning)

**User Story:** As a denetçi, I want hesaplamalarda kullanılan tüm sürümlerin kaydedilmesini, so that geçmiş hesaplamalar yeniden üretilebilsin.

#### Acceptance Criteria

1. THE Interest_Engine SHALL include rateTableVersion (hash of rates used) in CalculationResult
2. THE Interest_Engine SHALL include engineVersion (semantic version) in CalculationResult
3. THE Interest_Engine SHALL include ruleVersion (strategy config hash) in CalculationResult
4. THE Interest_Engine SHALL include reportTemplateVersion in generated reports
5. THE Calculation_Record SHALL store all version identifiers for audit trail
6. WHEN reproducing past calculation, THE Interest_Engine SHALL accept version parameters to use historical rates/rules

### Requirement 16: Fer'i Alacak Tanımları (Ancillary Types)

**User Story:** As a avukat, I want fer'i alacak kalemlerinin net tanımlı ve öncelikli olmasını, so that TBK 100 mahsubu doğru uygulanabilsin.

#### Acceptance Criteria

1. THE TBK_100_Allocator SHALL define ancillary types as enum: VEKALET_UCRETI, HARC, TEBLIGAT_MASRAFI, CEK_TAZMINATI, KOMISYON, DIGER
2. THE TBK_100_Allocator SHALL apply allocation priority: INTEREST → HARC → TEBLIGAT_MASRAFI → VEKALET_UCRETI → CEK_TAZMINATI → KOMISYON → DIGER → PRINCIPAL
3. THE TBK_100_Allocator SHALL allow custom priority configuration per case type
4. THE TBK_100_Allocator SHALL report ancillary breakdown by type in allocation result
5. WHEN ancillary type is CEK_TAZMINATI, THE TBK_100_Allocator SHALL treat it as fer'i (not separate principal)

### Requirement 17: Çoklu Alacak Kalemi Desteği (Multi-Claim)

**User Story:** As a icra takip uzmanı, I want birden fazla alacak kaleminin ayrı ayrı hesaplanabilmesini, so that karmaşık dosyalarda her kalem izlenebilsin.

#### Acceptance Criteria

1. THE Interest_Engine SHALL accept multiple Principal_Items (claim buckets) in single request
2. THE Interest_Engine SHALL calculate interest separately for each Principal_Item
3. THE Interest_Engine SHALL report segments grouped by principalItemId
4. THE Interest_Engine SHALL support claimPriorityRule options: OLDEST_DUE_FIRST (default), HIGHEST_RATE_FIRST, CUSTOM
5. WHEN claimPriorityRule is OLDEST_DUE_FIRST, THE TBK_100_Allocator SHALL allocate to claims ordered by startDate ascending
6. WHEN claimPriorityRule is HIGHEST_RATE_FIRST, THE TBK_100_Allocator SHALL allocate to claims ordered by interestRate descending
7. WHEN claimPriorityRule is CUSTOM, THE TBK_100_Allocator SHALL use explicit priority field on each Principal_Item
8. WHEN payment is allocated, THE TBK_100_Allocator SHALL first apply TBK100 order (interest→costs→ancillary→principal) within each claim, then move to next claim
9. THE Interest_Engine SHALL support different interest types per Principal_Item
10. THE Interest_Engine SHALL report totalInterest as sum of all claim interests
11. THE Interest_Engine SHALL support claim-level start dates (different vade dates per claim)
12. THE Interest_Engine SHALL include claimPriorityRule used in CalculationResult

### Requirement 18: Döviz Alacağı Detaylı Kurallar

**User Story:** As a avukat, I want döviz alacaklarında kur ve faiz kurallarının net olmasını, so that 3095 m.2/3 doğru uygulanabilsin.

#### Acceptance Criteria

1. THE Interest_Engine SHALL support FX_Rate_Source options: TCMB_SATIS, TCMB_ALIS, TCMB_EFEKTIF_SATIS
2. THE Interest_Engine SHALL default to TCMB_SATIS (satış kuru) for creditor-favorable conversion
3. THE Interest_Engine SHALL support conversion_date_rule options: PAYMENT_DATE, CALCULATION_DATE, ENFORCEMENT_DATE
4. THE Interest_Engine SHALL support interest_currency options: SAME_AS_PRINCIPAL, TRY
5. WHEN interest_currency is SAME_AS_PRINCIPAL, THE Interest_Engine SHALL calculate interest in foreign currency
6. WHEN interest_currency is TRY, THE Interest_Engine SHALL convert principal to TRY first, then calculate interest
7. THE Interest_Engine SHALL report fx_rate and fx_date used in CalculationResult

### Requirement 19: Çek Tazminatı Strateji Modülü

**User Story:** As a avukat, I want çek tazminatı hesaplamasının yapılandırılabilir olmasını, so that dönemsel kural değişikliklerine uyum sağlanabilsin.

#### Acceptance Criteria

1. THE Interest_Engine SHALL implement çek tazminatı as separate CekTazminatiStrategy
2. THE CekTazminatiStrategy SHALL accept ruleVersion parameter for historical rule application
3. THE CekTazminatiStrategy SHALL calculate tazminat based on applicable law reference
4. THE CekTazminatiStrategy SHALL include law_reference in calculation result (e.g., "5941 s.K. m.5")
5. THE CekTazminatiStrategy SHALL support multiple tazminat calculation methods (percentage, fixed, tiered)
6. WHEN çek tazminatı is calculated, THE Interest_Engine SHALL add it to ancillaries (not principal)

### Requirement 20: Hesaplama Kaydı ve Saklama (Calculation Record)

**User Story:** As a denetçi, I want hesaplama kayıtlarının yapılandırılabilir saklama süresiyle tutulmasını, so that denetim ve arşiv gereksinimleri karşılansın.

#### Acceptance Criteria

1. THE Interest_Engine SHALL create Calculation_Record for every calculation
2. THE Calculation_Record SHALL contain: inputHash, outputSummary, versions, warnings, calculatedAt, calculatedBy
3. THE Interest_Engine SHALL optionally create Calculation_Trace with full segment details
4. THE Calculation_Record SHALL have configurable retention period (default: 90 days active)
5. WHEN retention period expires, THE Interest_Engine SHALL archive Calculation_Record (not delete)
6. THE Interest_Engine SHALL support retrieval of archived records by inputHash or caseId
7. THE Calculation_Trace SHALL have separate retention policy (default: 30 days, then summary only)
