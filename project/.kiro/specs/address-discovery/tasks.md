# Implementation Plan: Address Discovery Module

## Overview

Adres İstihbarat Modülü implementasyonu. Borçlu adreslerini sistematik olarak araştırmak için müvekkil bilgi talebi, UYAP sorguları, kurum yazıları ve cross-file eşleştirme özellikleri.

## Tasks

### Phase 1: Database Schema

- [x] 1. Schema Updates
  - [x] 1.1 Add ClientInfoRequestStatus enum
  - [x] 1.2 Add ClientInfoRequest model
  - [x] 1.3 Add UyapQueryType, UyapQueryStatus enums
  - [x] 1.4 Add UyapQuery model
  - [x] 1.5 Add InstitutionType, InstitutionLetterStatus enums
  - [x] 1.6 Add InstitutionLetter model
  - [x] 1.7 Add AddressResearchStatus enum
  - [x] 1.8 Add AddressResearch model
  - [x] 1.9 Extend AddressSource enum with new sources (UYAP_AA, UYAP_AB, etc.)
  - [x] 1.10 Add confidenceScore field to DebtorAddress model
  - [x] 1.11 Run Prisma migration
  - _Requirements: 1.2, 2.2, 4.3, 5.2, 6.1_

### Phase 2: Backend - Client Info Request

- [x] 2. ClientInfoRequestService
  - [x] 2.1 Create address-discovery module structure
  - [x] 2.2 Implement createRequest() method
  - [x] 2.3 Implement sendEmail() method (using notification module)
  - [x] 2.4 Implement markAsResponded() method
  - [x] 2.5 Implement getRequestsForCase() method
  - [x] 2.6 Create email template (client-info-email.template.ts)
  - _Requirements: 1.1, 1.2_

- [x] 3. Auto Email on Case Create
  - [x] 3.1 Implement sendAutoRequestOnCaseCreate() method
  - [x] 3.2 Hook into CaseService.create() to trigger auto email ✅ AKTIF
  - [x] 3.3 Add tenant setting for auto-email enable/disable (settings.autoClientInfoRequest)
  - _Requirements: 1.1_

### Phase 3: Backend - UYAP Queries

- [x] 4. UyapQueryService
  - [x] 4.1 Implement createQuery() method
  - [x] 4.2 Implement recordQueryResponse() method
  - [x] 4.3 Implement processQueryAddresses() - add found addresses to DebtorAddress
  - [x] 4.4 Implement getQueriesForDebtor() method
  - [x] 4.5 Create query code mapping (AA, AB, AF, AJ, AR, AL, AH, AN, AP)
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

### Phase 4: Backend - Institution Letters

- [x] 5. InstitutionLetterService
  - [x] 5.1 Implement createLetter() method
  - [x] 5.2 Implement generateDocument() - Word file generation (body text only, Word export TBD)
  - [x] 5.3 Implement markAsSent() method
  - [x] 5.4 Implement markAsResponded() method
  - [x] 5.5 Implement getLettersForDebtor() method
  - [x] 5.6 Create letter templates (SGK, Vergi, Ticaret Sicili)
  - _Requirements: 4.1, 4.2, 4.3_

### Phase 5: Backend - Cross-File Matching

- [x] 6. CrossFileService
  - [x] 6.1 Implement findSameDebtor() - TCKN/VKN based matching
  - [x] 6.2 Implement getAddressesFromOtherCases() method
  - [x] 6.3 Implement copyAddressToCase() method
  - [x] 6.4 Implement hasDifferentAddressInOtherCase() for alert
  - _Requirements: 3.1, 3.2, 3.3_

### Phase 6: Backend - Confidence Score

- [x] 7. ConfidenceScoreService
  - [x] 7.1 Implement calculateScore() method with 4 factors
  - [x] 7.2 Implement getScoreBreakdown() method
  - [x] 7.3 Implement updateAllScoresForDebtor() method
  - [x] 7.4 Hook into AddressService to auto-calculate on create/update
  - _Requirements: 6.1, 6.2, 6.3_

### Phase 7: Backend - Research Orchestration

- [x] 8. AddressDiscoveryService
  - [x] 8.1 Implement getResearchStatus() method
  - [x] 8.2 Implement startResearch() method
  - [x] 8.3 Implement suggestNextAction() - auto-trigger rules
  - [x] 8.4 Implement getResearchTimeline() method
  - _Requirements: 5.1, 5.2, 5.3_

### Phase 8: Backend - Controller & DTOs

- [x] 9. AddressDiscoveryController
  - [x] 9.1 Create DTOs for all operations
  - [x] 9.2 Client Info Request endpoints (POST, GET, PUT)
  - [x] 9.3 UYAP Query endpoints (POST, GET, PUT)
  - [x] 9.4 Institution Letter endpoints (POST, GET, PUT, DELETE)
  - [x] 9.5 Cross-File endpoints (GET, POST copy)
  - [x] 9.6 Research Status endpoints (GET, POST start, GET timeline, GET suggestions)
  - [x] 9.7 Confidence Score endpoints (GET, GET breakdown)
  - _Requirements: All_

### Phase 9: Frontend - Types & API

- [x] 10. Frontend Types
  - [x] 10.1 Add ClientInfoRequest types
  - [x] 10.2 Add UyapQuery types
  - [x] 10.3 Add InstitutionLetter types
  - [x] 10.4 Add AddressResearch types
  - [x] 10.5 Add CrossFileAddress types
  - [x] 10.6 Add ConfidenceScore types
  - _Requirements: All_

- [x] 11. Frontend API Functions
  - [x] 11.1 Client Info Request API functions
  - [x] 11.2 UYAP Query API functions
  - [x] 11.3 Institution Letter API functions
  - [x] 11.4 Cross-File API functions
  - [x] 11.5 Research Status API functions
  - [x] 11.6 Confidence Score API functions
  - _Requirements: All_

### Phase 10: Frontend - Components

- [x] 12. Research Status Components
  - [x] 12.1 Create ResearchStatusCard component
  - [x] 12.2 Create ResearchTimeline component
  - [x] 12.3 Create ResearchSuggestionAlert component (integrated in ResearchStatusCard)
  - _Requirements: 5.2, 5.3_

- [x] 13. Client Info Request Components
  - [x] 13.1 Create ClientInfoRequestCard component
  - [x] 13.2 Create ClientInfoRequestModal component
  - _Requirements: 1.1, 1.2_

- [x] 14. UYAP Query Components
  - [x] 14.1 Create UyapQueryList component
  - [x] 14.2 Create UyapQueryModal component
  - [x] 14.3 Create UyapQueryResponseModal component
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 15. Institution Letter Components
  - [x] 15.1 Create InstitutionLetterList component
  - [x] 15.2 Create InstitutionLetterModal component
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 16. Cross-File Components
  - [x] 16.1 Create CrossFileAddressPanel component
  - [x] 16.2 Add "Farklı adres var" alert badge to DebtorRow
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 17. Confidence Score Components
  - [x] 17.1 Create ConfidenceScoreBadge component
  - [x] 17.2 Integrate into AddressCard
  - _Requirements: 6.3_

### Phase 11: Frontend - Integration

- [x] 18. Main Panel Integration
  - [x] 18.1 Create AddressDiscoveryPanel component
  - [x] 18.2 Add "Adres Araştırma" tab to DebtorDetailDrawer
  - [x] 18.3 Add research status indicator to debtor list
  - _Requirements: All_

### Phase 12: Final Testing

- [ ] 19. Integration Testing
  - [ ] 19.1 Test full research workflow
  - [ ] 19.2 Test cross-file matching
  - [ ] 19.3 Test confidence score calculation
  - [ ] 19.4 Test auto-trigger rules
  - _Requirements: All_

## Notes

- UYAP API entegrasyonu şimdilik manuel (sorgu sonuçları elle girilir)
- Email gönderimi için mevcut notification modülü kullanılacak
- Word dosyası oluşturma için `docx` kütüphanesi kullanılacak
- Her phase sonunda checkpoint yapılacak
- Phase 1-8: Backend, Phase 9-11: Frontend, Phase 12: Test
