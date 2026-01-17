# Implementation Plan: Explainable Policy Preview

> **⚠️ MVP SEALED - 2026-01-16**  
> Bu spec dondurulmuştur. Genişletme için yeni spec açılmalıdır.  
> Bkz: [ACCEPTANCE.md](./ACCEPTANCE.md)

## Overview

Phase 6A giriş kapısı: Policy kararlarının (PASS/WARN/BLOCK) arkasındaki gerekçeleri açıklayan katman. Mevcut CalcPreviewService'e entegre olur, karar mekanizmasını DEĞİŞTİRMEZ.

## Tasks

- [x] 1. Create core types and interfaces
  - [x] 1.1 Create PolicyExplanation interface
    - Define reasonCode, message, severity, suggestedAction, sourceRule fields
    - _Requirements: 3.1_
  - [x] 1.2 Create ExplanationResult interface
    - Define explanations array and degraded flag
    - _Requirements: 7.2, 7.3_
  - [x] 1.3 Create trace event interfaces
    - PolicyExplanationGeneratedEvent and PolicyExplanationFailedEvent
    - _Requirements: 4.2_
  - [x] 1.4 Update PolicyPreviewData interface
    - Add explanations field to existing interface
    - _Requirements: 5.1, 5.2_

- [x] 2. Implement ReasonCodeRegistry
  - [x] 2.1 Create ReasonCodeRegistry service
    - Static mapping with get/has/getAllCodes methods
    - _Requirements: 2.1_
  - [x] 2.2 Add MVP reason codes
    - STATUTE_OF_LIMITATIONS, INVALID_CLAIM_TYPE, AMOUNT_EXCEEDS_LIMIT, MISSING_REQUIRED_FIELD, DATE_RANGE_INVALID
    - _Requirements: 2.3_
  - [ ]* 2.3 Write unit tests for ReasonCodeRegistry
    - Test all MVP codes exist, get returns correct entry, has returns boolean
    - _Requirements: 2.1, 2.3_

- [x] 3. Implement ExplanationService
  - [x] 3.1 Create ExplanationService with explain() method
    - Main entry point, orchestrates generation and invariant enforcement
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 3.2 Implement generateExplanations() method
    - Map reason codes to explanations, handle unknown codes with fallback
    - _Requirements: 1.1, 1.2, 2.2_
  - [x] 3.3 Implement enforceInvariant() method
    - BLOCK + empty → add fallback, log CRITICAL, emit metric
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 3.4 Implement sortBySeverity() method
    - Order: ERROR > WARNING > INFO
    - _Requirements: 3.2_
  - [x] 3.5 Implement handleDegradedMode() method
    - Return degraded explanation, emit metric and trace event
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 3.6 Implement emitTraceEvent() method
    - Emit POLICY_EXPLANATION_GENERATED with correct payload
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 4. Property-based tests for ExplanationService
  - [ ]* 4.1 Write property test: PASS outcome returns empty explanations
    - **Property 1: PASS Outcome Returns Empty Explanations**
    - **Validates: Requirements 1.3, 3.3**
  - [ ]* 4.2 Write property test: BLOCK/WARN returns non-empty explanations (Core Invariant)
    - **Property 2: BLOCK/WARN Outcome Returns Non-Empty Explanations**
    - **Validates: Requirements 3.4, 6.1, 6.3**
  - [ ]* 4.3 Write property test: Unknown code returns fallback
    - **Property 3: Unknown Code Returns Fallback Explanation**
    - **Validates: Requirements 2.2**
  - [ ]* 4.4 Write property test: Explanations ordered by severity
    - **Property 4: Explanations Ordered by Severity**
    - **Validates: Requirements 3.2**
  - [ ]* 4.5 Write property test: Trace event emitted on generation
    - **Property 5: Trace Event Emitted on Generation**
    - **Validates: Requirements 4.1, 4.2**
  - [ ]* 4.6 Write property test: Trace event contains no PII
    - **Property 6: Trace Event Contains No PII**
    - **Validates: Requirements 4.4**
  - [ ]* 4.7 Write property test: Degraded mode preserves policy outcome
    - **Property 7: Degraded Mode Preserves Policy Outcome**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 5. Integrate with CalcPreviewService
  - [x] 5.1 Add ExplanationService to CalcPreviewModule
    - Register as provider, inject dependencies
    - _Requirements: All_
  - [x] 5.2 Modify CalcPreviewService.preview() method
    - Call explanationService.explain() after policyEngine.softCheck()
    - Add explanations to response, add explanationsDegraded flag
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 5.3 Write integration test for full flow
    - CalcPreviewService → ExplanationService → TraceCollector
    - _Requirements: All_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update contract tests
  - [x] 7.1 Add PolicyExplanation to policy-engine contract schema
    - Update schema.ts with new interface
    - _Requirements: 3.1_
  - [x] 7.2 Add semantic validation for explanations
    - BLOCK → explanations.length > 0
    - _Requirements: 6.1_
  - [ ] 7.3 Add contract test fixtures
    - ok-with-explanations, ok-pass-empty-explanations, bad-block-no-explanations
    - _Requirements: 3.3, 3.4, 6.1_

- [ ] 8. Add metrics
  - [x] 8.1 Add explanation_unknown_code metric
    - Counter with code label
    - _Requirements: 2.2_
  - [x] 8.2 Add explanation_fallback_used metric
    - Counter for invariant enforcement
    - _Requirements: 6.2_
  - [x] 8.3 Add explanation_degraded metric
    - Counter for degraded mode
    - _Requirements: 7.4_

- [ ] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases

## Completed Files

- `explanation/explanation.types.ts` - Core types and interfaces
- `explanation/reason-code-registry.ts` - MVP reason codes
- `explanation/explanation.service.ts` - Main service
- `explanation/index.ts` - Module exports
- `types.ts` - Updated with PolicyExplanation import and explanationsDegraded
- `calc-preview.module.ts` - Updated with ExplanationService registration
- `calc-preview.service.ts` - Updated with ExplanationService integration
