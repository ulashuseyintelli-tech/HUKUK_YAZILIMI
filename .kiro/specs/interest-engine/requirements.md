# Requirements Document

## Introduction

Faiz Motoru (Interest Engine), icra takiplerinde faiz hesaplamalarını doğru, denetlenebilir ve Meşe/UYAP uyumlu şekilde yapan bir hesaplama altyapısıdır. Mevcut sistemdeki "%44 çıktı, gün eksik, oran yanlış, fer'iler faizlendi" gibi hataları ortadan kaldırmayı hedefler.

## Glossary

- **Interest_Engine**: Faiz hesaplama motoru - segmentli basit faiz hesabı yapan ana servis
- **Rate_Schedule**: Faiz oranı serisi - tarih bazlı oran değişimlerini tutan tablo
- **Principal_Item**: Alacak kalemi - faiz hesaplanacak ana tutar ve metadata
- **Interest_Segment**: Faiz segmenti - tek oran geçerli olan dönem dilimi
- **Payment_Allocation**: Ödeme dağıtımı - TBK 100 kuralına göre ödeme mahsubu
- **Policy_Gate**: Doğrulama kapısı - hesaplama öncesi kontrol katmanı
- **Audit_Log**: Denetim kaydı - her hesaplamanın detaylı JSON logu

## Requirements

### Requirement 1: Faiz Türü Yönetimi

**User Story:** As a avukat, I want to select the correct interest type for each claim, so that the interest calculation follows the applicable legal framework.

#### Acceptance Criteria

1. THE Interest_Engine SHALL support the following interest types:
   - LEGAL_3095 (Yasal faiz - 3095 sayılı Kanun)
   - COMMERCIAL_AVANS_3095_2_2 (Ticari temerrüt/avans faizi)
   - TTK_1530 (Geç ödeme faizi - TTK 1530)
   - CONTRACTUAL (Sözleşmesel faiz)

2. WHEN a case type is "çek" and the claim is commercial, THE Interest_Engine SHALL default to COMMERCIAL_AVANS_3095_2_2

3. WHEN a case involves "mal/hizmet tedariki geç ödeme", THE Interest_Engine SHALL suggest TTK_1530

4. WHEN interest type is CONTRACTUAL, THE Interest_Engine SHALL require rate documentation/evidence attachment

5. THE Interest_Engine SHALL store day_count_basis (365 default, 360 for some contracts) per principal item

6. THE Interest_Engine SHALL default compounding to false (basit faiz) for icra takipleri

### Requirement 2: Oran Serisi (Rate Schedule) Yönetimi

**User Story:** As a sistem, I want to maintain historical interest rates with validity periods, so that calculations use the correct rate for each time segment.

#### Acceptance Criteria

1. THE Rate_Schedule SHALL store for each rate entry:
   - interest_type (enum)
   - valid_from (date)
   - annual_rate (decimal, e.g., 0.3975 for %39.75)
   - source (TCMB / Resmi Gazete / sözleşme)
   - version_hash (for audit)

2. WHEN a rate changes (e.g., TCMB announcement), THE Rate_Schedule SHALL create a new entry with the new valid_from date

3. THE Rate_Schedule SHALL maintain complete coverage for all supported interest types from system start date

4. WHEN querying rates for a period, THE Rate_Schedule SHALL return all applicable rates with their validity ranges

5. IF a rate gap exists for a requested period, THE Interest_Engine SHALL halt calculation and return "oran serisi eksik" error

### Requirement 3: Segmentli Faiz Hesaplama

**User Story:** As a avukat, I want interest calculated in segments based on rate changes and payments, so that the calculation is accurate and auditable.

#### Acceptance Criteria

1. THE Interest_Engine SHALL generate a timeline from start_date to as_of_date with critical dates:
   - Rate change dates
   - Payment dates
   - Legal event dates affecting interest start

2. THE Interest_Engine SHALL split the period into segments where each segment has a single applicable rate

3. FOR EACH segment, THE Interest_Engine SHALL calculate: `segment_interest = current_principal * annual_rate * days / basis`

4. THE Interest_Engine SHALL use consistent day counting: `days = (period_end - period_start)` where start is inclusive, end is exclusive

5. THE Interest_Engine SHALL accumulate segment interests: `accrued_interest += segment_interest`

6. WHEN a payment occurs mid-period, THE Interest_Engine SHALL close the current segment and start a new one with updated principal

### Requirement 4: TBK 100 Mahsup Motoru

**User Story:** As a avukat, I want partial payments allocated according to TBK 100 rules, so that interest, costs, and principal are reduced in the correct order.

#### Acceptance Criteria

1. WHEN a payment is received, THE Payment_Allocation SHALL apply in this order:
   - First: accrued interest (işlemiş faiz)
   - Second: costs (masraflar - harç, tebligat vb.)
   - Third: ancillary claims (fer'iler - komisyon, tazminat)
   - Last: principal (anapara)

2. THE Payment_Allocation SHALL track remaining payment after each allocation step

3. THE Payment_Allocation SHALL update principal only after interest, costs, and ancillaries are fully paid

4. THE Interest_Engine SHALL recalculate future interest based on the new principal after payment allocation

5. THE Payment_Allocation SHALL generate a detailed breakdown showing amount applied to each category

### Requirement 5: Policy Gate (Doğrulama Kapısı)

**User Story:** As a sistem, I want to validate calculation inputs before processing, so that common errors are caught early.

#### Acceptance Criteria

1. THE Policy_Gate SHALL validate interest type matches case type:
   - Çek + ticari → COMMERCIAL_AVANS_3095_2_2 expected
   - Mal/hizmet geç ödeme → TTK_1530 expected
   - Sözleşmesel → CONTRACTUAL + evidence required

2. THE Policy_Gate SHALL verify rate coverage:
   - All dates between start_date and as_of_date must have applicable rates
   - IF coverage gap exists, THEN calculation SHALL halt with specific error

3. THE Policy_Gate SHALL check day count anomalies:
   - days < 0 → error
   - days == 0 → warning
   - Single segment > 300 days with rate changes in period → warning

4. THE Policy_Gate SHALL perform sanity check on calculated interest:
   - Calculate expected_min = principal * min_rate * total_days / 365
   - Calculate expected_max = principal * max_rate * total_days / 365
   - IF calculated interest outside this band, THEN flag as anomaly

5. IF any Policy_Gate check fails, THE Interest_Engine SHALL return detailed error with fix suggestions

### Requirement 6: Audit Log ve Denetlenebilirlik

**User Story:** As a avukat, I want every interest calculation to have a detailed audit trail, so that I can verify and explain the calculation.

#### Acceptance Criteria

1. THE Interest_Engine SHALL generate an audit log for every calculation containing:
   - start_date, end_date (as_of_date)
   - segments array with: period_start, period_end, days, rate_id, rate_value, principal, segment_interest
   - payments_applied array with TBK100 breakdown
   - total_interest
   - total_due

2. THE Audit_Log SHALL include rate source references (TCMB tarih, Resmi Gazete no)

3. THE Audit_Log SHALL be stored with the case and retrievable for any historical calculation

4. WHEN rates change after a calculation, THE Interest_Engine SHALL flag affected calculations for review

### Requirement 7: UI Faiz Dökümü Görüntüleme

**User Story:** As a avukat, I want to see a detailed interest breakdown in the UI, so that I can verify the calculation and use it in documents.

#### Acceptance Criteria

1. THE UI SHALL display a "Faiz Dökümü" panel showing:
   - Segment list with: tarih aralığı, gün, oran, anapara, segment faizi
   - Total interest

2. THE UI SHALL show rate source links (e.g., "TCMB avans faizi 20.12.2025 %39,75")

3. WHEN a rate source is clicked, THE UI SHALL show the official source reference

4. THE UI SHALL highlight any Policy_Gate warnings or anomalies

5. THE UI SHALL auto-generate legal text for documents: "3095/2-2 uyarınca değişen oranlarda avans faizi"

### Requirement 8: Çek Takiplerinde Özel Kurallar

**User Story:** As a avukat, I want check (çek) cases to use ibraz tarihi for interest start, so that the calculation follows legal requirements.

#### Acceptance Criteria

1. WHEN case type is ÇEK, THE Interest_Engine SHALL use ibraz_tarihi (presentation date) as interest start date, not vade_tarihi

2. THE Interest_Engine SHALL validate ibraz_tarihi >= vade_tarihi

3. THE Interest_Engine SHALL apply COMMERCIAL_AVANS_3095_2_2 rate for çek cases by default

4. THE Interest_Engine SHALL include %10 karşılıksız çek tazminatı in the calculation (separate from interest)

### Requirement 9: TCMB Oran Entegrasyonu

**User Story:** As a sistem, I want to automatically fetch and update TCMB rates, so that calculations always use current official rates.

#### Acceptance Criteria

1. THE Rate_Schedule SHALL integrate with TCMB API/XML for avans faizi rates

2. WHEN TCMB announces a new rate, THE Rate_Schedule SHALL be updated within 24 hours

3. THE Rate_Schedule SHALL maintain historical rates for all past periods

4. THE Interest_Engine SHALL use the existing tcmb.service.ts for rate fetching

5. THE Rate_Schedule SHALL support manual rate entry for contractual rates with audit trail

### Requirement 10: Fer'i Alacakların Faiz Durumu

**User Story:** As a avukat, I want to control whether ancillary claims accrue interest, so that I don't accidentally apply interest to items that shouldn't have it.

#### Acceptance Criteria

1. EACH cost/fee item SHALL have an `accrues_interest` flag (default: false)

2. THE Interest_Engine SHALL NOT automatically apply interest to masraflar (harç, tebligat, vekalet pulu)

3. THE Interest_Engine SHALL allow explicit configuration of interest on specific items when legally applicable

4. THE UI SHALL clearly show which items are accruing interest and which are not
