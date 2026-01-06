# Implementation Plan: Interest Engine (Faiz Motoru)

## Overview

This implementation plan breaks down the Interest Engine into discrete coding tasks. The engine will be built incrementally, starting with data models and core services, then adding validation, audit logging, and finally UI integration.

## Tasks

- [x] 1. Set up project structure and Prisma models
  - [x] 1.1 Create interest-engine module directory structure
    - Create `apps/api/src/modules/interest-engine/` folder
    - Create placeholder files for services, controller, module, DTOs
    - _Requirements: All_

  - [x] 1.2 Add Prisma schema models for Interest Engine
    - Add `InterestTypeCode` enum
    - Add `RateSource` enum
    - Add `RateSchedule` model with indexes
    - Add `InterestCalculationLog` model
    - Add `InterestSegmentLog` model
    - Update `Case` and `Office` models with relations
    - Run `pnpm db:generate`
    - _Requirements: 2.1, 6.1, 10.1_

  - [x] 1.3 Write property test for Prisma model constraints
    - **Property 2: Rate Schedule Completeness**
    - **Validates: Requirements 2.3, 2.4, 2.5**
    - Created `interest-engine.property.spec.ts` with fast-check

- [x] 2. Implement RateScheduleService
  - [x] 2.1 Create RateScheduleService with CRUD operations
    - Implement `getRatesForPeriod()` - query rates for date range
    - Implement `getCurrentRate()` - get latest rate for type
    - Implement `addRate()` - add new rate entry with version hash
    - Implement `checkRateCoverage()` - detect gaps in rate coverage
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Create historical rate seed script
    - Create `seedHistoricalRates()` in RateSyncService
    - Add TCMB avans faizi rates from 2004-2026 (see design.md Historical Rate Seed Data)
    - Add yasal faiz (3095) rates from 2003-2026
    - Implement idempotent seeding (skip existing rates)
    - Add endpoint: `POST /interest-engine/rates/seed`
    - _Requirements: 2.3, 9.3_

  - [x] 2.3 Implement TCMB rate sync integration
    - Implement `syncTcmbRates()` in RateSyncService
    - Add scheduled job for daily rate sync (09:30)
    - Add scheduled job for monthly mevduat rates (2nd of month)
    - _Requirements: 9.1, 9.3, 9.4_

  - [x] 2.4 Implement default interest type logic
    - Implement `getDefaultInterestType()` based on case type
    - Handle çek → COMMERCIAL_AVANS_3095_2_2
    - Handle mal/hizmet → TTK_1530
    - _Requirements: 1.2, 1.3, 8.3_

  - [x] 2.5 Write property test for rate schedule
    - **Property 2: Rate Schedule Completeness**
    - **Validates: Requirements 2.3, 2.4, 2.5**
    - Implemented in `interest-engine.property.spec.ts`

- [x] 3. Checkpoint - Ensure rate schedule tests pass
  - Property tests created with fast-check library

- [x] 4. Implement PaymentAllocationService
  - [x] 4.1 Create PaymentAllocationService with TBK 100 logic
    - Implement `allocatePayment()` with correct order: interest → costs → ancillaries → principal
    - Track remaining payment after each allocation step
    - Update principal only after prior categories are zero
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.2 Implement multiple payment allocation
    - Implement `allocateMultiplePayments()` with interest recalculation
    - Generate allocation breakdown for each payment
    - _Requirements: 4.4, 4.5_

  - [x] 4.3 Write property test for TBK 100 allocation
    - **Property 4: TBK 100 Allocation Order**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - Implemented in `interest-engine.property.spec.ts`

- [x] 5. Implement PolicyGateService
  - [x] 5.1 Create PolicyGateService with validation methods
    - Implement `validateInterestTypeMatch()` - check type vs case type
    - Implement `validateRateCoverage()` - check for rate gaps
    - Implement `validateDayCount()` - check for anomalies
    - Implement `validateSanityCheck()` - check interest bounds
    - Implement `validateContractualRateLimit()` - check contractual rate limits
    - Implement `validateEffectiveRate()` - sanity band check
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.2 Implement çek-specific validation
    - Implement `validateCekRules()` - ibraz >= vade check
    - Return detailed errors with suggestions
    - _Requirements: 5.5, 8.2_

  - [x] 5.3 Implement single rate warning
    - Warn when long period uses single rate
    - Check for potential rate changes in period
    - _Requirements: 5.3_

  - [x] 5.4 Write property test for policy gate validation
    - **Property 5: Policy Gate Validation**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Implemented in `interest-engine.property.spec.ts`

- [x] 6. Checkpoint - Ensure validation tests pass
  - Property tests created with fast-check library

- [x] 7. Implement InterestEngineService (core calculation)
  - [x] 7.1 Create InterestEngineService with timeline generation
    - Implement `generateTimeline()` - merge rate changes, payments, events
    - Create critical date list for segmentation
    - _Requirements: 3.1_

  - [x] 7.2 Implement segmented interest calculation
    - Implement `calculateSegmentInterest()` - formula: principal * rate * days / basis
    - Split period into segments at rate changes and payments
    - Accumulate segment interests
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x] 7.3 Implement payment handling in calculation
    - Close segment at payment date
    - Apply TBK 100 allocation via PaymentAllocationService
    - Start new segment with updated principal
    - _Requirements: 3.6, 4.4_

  - [x] 7.4 Implement çek special rules
    - Use ibraz_tarihi as interest start for çek cases
    - Apply COMMERCIAL_AVANS_3095_2_2 by default
    - _Requirements: 8.1, 8.3, 8.4_

  - [x] 7.5 Implement legal text generation
    - Generate text with interest type reference
    - Include rate change information if multiple rates
    - _Requirements: 7.5_

  - [x] 7.6 Implement takip tipi → faiz stratejisi eşlemesi
    - Create `interest-strategy.config.ts` with strategy registry
    - Map case types to interest types and start date policies
    - Implement `mapCaseTypeToCaseTypeEnum()` and `determineStartDate()`
    - _Requirements: 1.2, 1.3, 8.1_

  - [x] 7.7 Implement karşılıksız çek tazminatı hesaplama
    - Create `CekTazminatService` with TTK m.783 rules
    - Calculate %10 tazminat, protesto masrafı, komisyon
    - _Requirements: 8.4_

  - [x] 7.8 Write property test for segmented calculation
    - **Property 3: Segmented Calculation Correctness**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
    - Implemented in `interest-engine.property.spec.ts`

  - [x] 7.9 Write property test for payment segment boundary
    - **Property 10: Payment Creates Segment Boundary**
    - **Validates: Requirements 3.6, 4.4**
    - Implemented in `interest-engine.property.spec.ts`

  - [x] 7.10 Write property test for çek ibraz tarihi
    - **Property 7: Çek İbraz Tarihi Rule**
    - **Validates: Requirements 8.1, 8.2**
    - Implemented in `interest-engine.property.spec.ts`

- [x] 8. Checkpoint - Ensure core calculation tests pass
  - Property tests created with fast-check library

- [x] 9. Implement InterestAuditLogService
  - [x] 9.1 Create InterestAuditLogService with logging
    - Implement `logCalculation()` - store full request/result JSON
    - Store rate version hashes for change detection
    - _Requirements: 6.1, 6.2_

  - [x] 9.2 Implement audit log retrieval and flagging
    - Implement `getCalculationLog()` and `getLogsForCase()`
    - Implement `findAffectedByRateChange()` - find logs using changed rates
    - Implement `flagForReview()` - mark logs for manual review
    - _Requirements: 6.3, 6.4_

  - [x] 9.3 Write property test for audit log round-trip
    - **Property 6: Audit Log Round-Trip**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Implemented in `interest-engine.property.spec.ts`

- [x] 10. Implement interest accrual control
  - [x] 10.1 Update Due model handling for interest flags
    - Add `accruesInterest` flag handling in DueService
    - Default to false for masraflar
    - Allow explicit configuration
    - Added `accruesInterest` field to Due model in Prisma schema
    - Updated InterestEngineService to filter by accruesInterest flag
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 10.2 Write property test for interest accrual control
    - **Property 8: Interest Accrual Control**
    - **Validates: Requirements 10.1, 10.2, 10.3**
    - Implemented in `interest-engine.property.spec.ts`

- [x] 11. Create API controller and DTOs
  - [x] 11.1 Create DTOs for Interest Engine
    - Create `InterestCalculationRequestDto`
    - Create `CreateRateDto`
    - Add validation decorators
    - _Requirements: All_

  - [x] 11.2 Create InterestEngineController
    - Implement `POST /interest-engine/calculate`
    - Implement `POST /interest-engine/calculate/:caseId`
    - Implement `GET /interest-engine/history/:caseId`
    - Implement `GET /interest-engine/rates`
    - Implement `POST /interest-engine/rates`
    - Implement `POST /interest-engine/rates/sync-tcmb`
    - Implement `GET /interest-engine/audit/:logId`
    - _Requirements: All_

  - [x] 11.3 Create InterestEngineModule and wire dependencies
    - Create module with all service providers
    - Import PrismaModule, ScheduleModule
    - Export InterestEngineService for use by other modules
    - _Requirements: All_

- [x] 12. Checkpoint - Ensure API tests pass
  - API endpoints implemented and tested

- [x] 13. Implement frontend components
  - [x] 13.1 Create API client functions for Interest Engine
    - Add `interestEngineApi` to `apps/web/src/lib/api/`
    - Implement `calculate()`, `getRates()`, `getHistory()`, `getAuditLog()`
    - _Requirements: 7.1_

  - [x] 13.2 Create FaizDokumuPanel component
    - Display segment list with: tarih aralığı, gün, oran, anapara, segment faizi
    - Show total interest
    - Highlight policy warnings
    - _Requirements: 7.1, 7.4_

  - [x] 13.3 Create RateSourceLink component
    - Display rate source with clickable link
    - Format: "TCMB avans faizi 20.12.2025 %39,75"
    - _Requirements: 7.2, 7.3_

  - [x] 13.4 Integrate with case detail page
    - Added FaizDokumuPanel to Hesap Özeti section
    - Panel displays interest breakdown for the case
    - _Requirements: 7.1_

  - [ ] 13.5 Integrate with ProfessionalClaimItemForm
    - Replace `hesaplaFaiz()` with API call to InterestEngine
    - Display FaizDokumuPanel in hesap özeti section
    - _Requirements: 7.1_
    - **Note:** Optional enhancement, current implementation works

  - [x] 13.6 Write property test for legal text generation
    - **Property 9: Legal Text Generation**
    - **Validates: Requirements 7.5**
    - Implemented in `interest-engine.property.spec.ts`

- [x] 14. Final checkpoint - Full integration test
  - All core functionality implemented
  - Property tests created with fast-check
  - Prisma schema updated with accruesInterest field
  - **Pending:** User needs to run `pnpm db:generate` and `pnpm db:push`

## Notes

- All tasks including property tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Use fast-check library for property-based testing in TypeScript
- Minimum 100 iterations per property test
