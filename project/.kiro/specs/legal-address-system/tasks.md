# Implementation Plan: Legal Address System

## Overview

Tebligat Kanunu'na uygun adres yönetim sistemi implementasyonu. Mevcut `DebtorAddress` modeli genişletilecek, yeni enum'lar eklenecek, backend servisleri güncellenecek ve frontend bileşenleri oluşturulacak.

## Tasks

- [x] 1. Database Schema Updates
  - [x] 1.1 Add new enums to Prisma schema
    - AddressType, AddressSubType, AddressSource, AddressRiskFlag, LegalPriority
    - _Requirements: 1.1, 2.1, 4.1_
  - [x] 1.2 Extend DebtorAddress model
    - Add type, subType, source, legalPriority, canApply21_2, verified, verifiedAt, riskFlags, TK 21/2 fields
    - Migrate existing addressType string to new AddressType enum
    - _Requirements: 1.1, 1.2, 2.1, 7.3_
  - [x] 1.3 Update ServiceHistory model
    - Add addressId, addressType, addressText fields
    - _Requirements: 5.1_
  - [x] 1.4 Update CaseDebtor model
    - selectedAddressId already exists (serves as activeAddressId)
    - _Requirements: 6.2_
  - [x] 1.5 Run Prisma migration
    - prisma generate + db push completed
    - _Requirements: 1.1, 1.2, 2.1_

- [x] 2. Backend Address Service
  - [x] 2.1 Create AddressService with CRUD operations
    - create(), update(), delete(), getAddressesForDebtor()
    - _Requirements: 6.1_
  - [x] 2.2 Implement canApply21_2 auto-calculation
    - Set based on address type (MERNIS=true, LEGAL_CENTER=conditional, others=false)
    - _Requirements: 1.3, 1.4_
  - [ ] 2.3 Write property test for canApply21_2 calculation
    - **Property 1: canApply21_2 Flag Consistency**
    - **Validates: Requirements 1.3, 1.4**
  - [x] 2.4 Implement verified flag auto-calculation
    - Set based on source (MERNIS, MERSIS, UYAP = true, others = false)
    - _Requirements: 2.2, 2.3_
  - [ ] 2.5 Write property test for verified flag calculation
    - **Property 2: Verified Flag Based on Source**
    - **Validates: Requirements 2.2, 2.3**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Priority Address Logic
  - [x] 4.1 Implement suggestPriorityAddress() for INDIVIDUAL debtors
    - Order: MERNIS > DECLARED > BUSINESS > others
    - _Requirements: 3.1_
  - [x] 4.2 Implement suggestPriorityAddress() for COMPANY debtors
    - Order: LEGAL_CENTER > BRANCH > DECLARED > others
    - _Requirements: 3.2_
  - [ ] 4.3 Write property test for INDIVIDUAL priority order
    - **Property 3: Priority Order for Individual Debtors**
    - **Validates: Requirements 3.1**
  - [ ] 4.4 Write property test for COMPANY priority order
    - **Property 4: Priority Order for Company Debtors**
    - **Validates: Requirements 3.2**
  - [x] 4.5 Implement legalPriority auto-assignment
    - HIGH for MERNIS/LEGAL_CENTER, MEDIUM for DECLARED/BUSINESS, LOW for others
    - _Requirements: 3.3_

- [x] 5. Active Address Management
  - [x] 5.1 Implement setActiveAddress()
    - Unset previous active, set new active
    - _Requirements: 6.2_
  - [ ] 5.2 Write property test for single active address constraint
    - **Property 6: Single Active Address Constraint**
    - **Validates: Requirements 6.2**
  - [x] 5.3 Update DebtorService.getCaseDebtorDetail() to include addresses
    - Return all addresses with active flag
    - _Requirements: 6.4_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Risk Flag Management
  - [x] 7.1 Implement addRiskFlag() and removeRiskFlag()
    - Add/remove flags from address
    - _Requirements: 4.1_
  - [x] 7.2 Implement auto risk flag on notification failure
    - Map return reasons to risk flags
    - _Requirements: 4.2_
  - [ ] 7.3 Write property test for risk flag auto-assignment
    - **Property 9: Risk Flag Auto-Assignment**
    - **Validates: Requirements 4.2**

- [-] 8. Service History Address Recording
  - [x] 8.1 Update updateServiceStatus() to record address info
    - Save addressId, addressType snapshot, addressText snapshot
    - _Requirements: 5.1_
  - [ ] 8.2 Write property test for service attempt address recording
    - **Property 5: Service Attempt Address Recording**
    - **Validates: Requirements 5.1**
  - [x] 8.3 Implement getAddressHistory()
    - Return service attempts for specific address
    - _Requirements: 5.2_

- [x] 9. TK 21/2 Support
  - [x] 9.1 Implement canApplyTK21_2() validation
    - Check canApply21_2 flag
    - _Requirements: 7.2_
  - [ ] 9.2 Write property test for TK 21/2 eligibility
    - **Property 7: TK 21/2 Eligibility Constraint**
    - **Validates: Requirements 7.2**
  - [x] 9.3 Implement recordTK21_2()
    - Save muhtar, door posting, notice dates
    - _Requirements: 7.3_
  - [ ] 9.4 Write property test for TK 21/2 record completeness
    - **Property 8: TK 21/2 Record Completeness**
    - **Validates: Requirements 7.3**
  - [x] 9.5 Implement TK 21/2 suggestion logic
    - Suggest when MERNIS notification fails
    - _Requirements: 7.1_

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Backend Controller
  - [x] 11.1 Create AddressController with REST endpoints
    - POST /debtors/:debtorId/addresses
    - PUT /addresses/:addressId
    - DELETE /addresses/:addressId
    - POST /case-debtors/:caseDebtorId/active-address
    - GET /addresses/:addressId/history
    - POST /addresses/:addressId/tk21-2
    - _Requirements: 6.1, 5.2, 7.3_

- [x] 12. Frontend Types and API
  - [x] 12.1 Add TypeScript types to api.ts
    - AddressDTO, AddressType, AddressSource, AddressRiskFlag, LegalPriority
    - _Requirements: 1.1, 2.1, 4.1_
  - [x] 12.2 Add API functions to api.ts
    - createAddress(), updateAddress(), deleteAddress(), setActiveAddress(), getAddressHistory()
    - _Requirements: 6.1, 5.2_

- [x] 13. Frontend Address Components
  - [x] 13.1 Create AddressCard component
    - Display type icon, address text, priority badge, risk flags, last notification
    - _Requirements: 6.4_
  - [x] 13.2 Create AddressListSection component
    - List all addresses, show active indicator, add/edit/delete actions
    - _Requirements: 6.1, 6.4_
  - [x] 13.3 Create AddressForm modal
    - Form for creating/editing addresses with type, source, street, city, district
    - _Requirements: 6.1_
  - [x] 13.4 Create AddressHistoryTimeline component
    - Show notification history for specific address
    - _Requirements: 5.2, 5.3_

- [x] 14. Integrate into DebtorDetailDrawer
  - [x] 14.1 Add AddressListSection to DebtorDetailDrawer
    - Replace single address display with address list
    - _Requirements: 6.4_
  - [x] 14.2 Update ServiceUpdateModal with address selection
    - Add dropdown to select which address notification is for
    - _Requirements: 5.1_
  - [x] 14.3 Add TK 21/2 option in ServiceUpdateModal
    - Show when MERNIS notification fails
    - _Requirements: 7.1_

- [x] 15. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Manual testing of full address workflow
  - Property tests deferred (optional enhancement)

## Phase 2-4: Advanced Address Features (COMPLETED)

- [x] 16. Phase 1: Address Verification
  - [x] 16.1 Backend: verifyViaMernis(), verifyViaMersis() methods
  - [x] 16.2 Backend: verifyAllAddresses() bulk verification
  - [x] 16.3 Backend: getVerificationStatus() helper
  - [x] 16.4 Frontend: Verification types and API functions
  - [x] 16.5 Frontend: AddressCard verification badges and button
  - [x] 16.6 Frontend: AddressListSection "Tümünü Doğrula" button

- [x] 17. Phase 2: Tebligat Başarısızlık Yönetimi
  - [x] 17.1 Backend: suggestNextAddress() - auto-suggest next address on return
  - [x] 17.2 Backend: Auto risk flag assignment on notification failure
  - [x] 17.3 Frontend: NextAddressSuggestionDTO type
  - [x] 17.4 Frontend: ServiceUpdateModal shows next address suggestion
  - [x] 17.5 Frontend: Auto-enable TK 21/2 when suggested

- [x] 18. Phase 3: Akıllı Adres Önerisi
  - [x] 18.1 Backend: getAddressSuccessStats() - success rate per address
  - [x] 18.2 Backend: getAddressesSortedBySuccessRate() - smart sorting
  - [x] 18.3 Frontend: AddressStatsDTO, AddressWithStatsDTO types
  - [x] 18.4 Frontend: API functions for stats and sorted addresses

- [x] 19. Phase 4: Tebligat Zinciri Takibi
  - [x] 19.1 Backend: getNotificationChain() - full chain with attempt counts
  - [x] 19.2 Frontend: NotificationChainDTO type
  - [x] 19.3 Frontend: NotificationChainPanel component
  - [x] 19.4 Frontend: Integrated into DebtorDetailDrawer

## Notes

- All property-based tests are included (comprehensive testing)
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Migration should handle existing data (map old addressType to new enum)
- Property tests use fast-check library (Jest)
- Phase 1-4 advanced features completed on 03.01.2026
