# Implementation Plan

## Phase 1: Database Schema & Backend Foundation

- [x] 1. Update Prisma Schema with new models and enums
  - [x] 1.1 Add new enums (DebtorRole, NotificationMode, LiabilityType, ThirdPartyType, PublicInstitutionType, RiskLevel)
  - [x] 1.2 Update Debtor model with new fields
  - [x] 1.4 Create DebtorAddress model
  - [x] 1.6 Update CaseDebtor model with new fields
  - [x] 1.8 Create ThirdParty model
  - [x] 1.9 Create DebtorCommunication model
  - [x] 1.10 Run Prisma migration (db push)

- [x] 2. Checkpoint - Schema complete

## Phase 2: Backend Services - Debtor Management

- [x] 3. Implement DebtorService
  - [x] 3.1 Create debtor CRUD operations
  - [x] 3.3 Implement duplicate check
  - [x] 3.5 Implement address management
  - [x] 3.6 Implement debtor deletion protection

- [x] 4. Implement CaseDebtorService
  - [x] 4.1 Create case debtor operations
  - [x] 4.2 Implement notification mode validation
  - [x] 4.4 Implement auto notification creation (placeholder)

- [x] 5. Checkpoint - Backend services complete

## Phase 3: Backend Services - Third Party & Communication

- [x] 6. Implement ThirdPartyService
  - [x] 6.1 Create third party CRUD operations
  - [x] 6.2 Implement ihbarname tracking
  - [x] 6.4 Implement response recording
  - [x] 6.5 Implement overdue alert generation

- [x] 7. Implement DebtorCommunicationService
  - [x] 7.1 Create communication operations (SMS, Email, Phone)
  - [x] 7.2 Implement communication logging
  - [x] 7.4 Implement communication history
  - [x] 7.5 Create message templates

- [x] 8. Checkpoint - Communication services complete

## Phase 4: Backend Services - Document Scanner

- [ ] 9. Implement DocumentScannerService (Future Phase)
  - [ ] 9.1 Create document upload endpoint
  - [ ] 9.3 Implement document classification
  - [ ] 9.4 Implement debtor extraction
  - [ ] 9.5 Implement confidence scoring
  - [ ] 9.7 Implement debtor matching
  - [ ] 9.8 Implement multi-party extraction

## Phase 5: API Endpoints

- [x] 11. Create Debtor API endpoints
  - [x] 11.1 Implement debtor CRUD endpoints
  - [x] 11.2 Implement address endpoints
  - [x] 11.3 Implement duplicate check endpoint

- [x] 12. Create CaseDebtor API endpoints
  - [x] 12.1 Implement case debtor endpoints
  - [x] 12.2 Implement notification creation endpoint (placeholder)

- [x] 13. Create ThirdParty API endpoints
  - [x] 13.1 Implement third party endpoints
  - [x] 13.2 Implement ihbarname endpoints

- [x] 14. Create Communication API endpoints
  - [x] 14.1 Implement communication endpoints
  - [x] 14.2 Implement template endpoint

- [x] 16. Checkpoint - API endpoints complete

## Phase 6: Frontend - Debtor Step UI

- [x] 17. Create Debtor Step main component
  - [x] 17.1 Create DebtorStep component structure (3-panel layout)
  - [x] 17.3 Implement debtor directory panel
  - [x] 17.4 Implement selected debtors panel

- [x] 18. Create Debtor Modal components
  - [x] 18.1 Create NewDebtorModal (Şahıs/Kurum/Kamu)
  - [x] 18.3 Create SelectedDebtorCard component

- [ ] 19. Create Third Party components (Future Phase)
  - [ ] 19.1 Create ThirdPartySection component
  - [ ] 19.2 Create ThirdPartyModal
  - [ ] 19.3 Create IhbarnameStatusBadge component

- [x] 20. Checkpoint - Frontend UI complete

## Phase 7: Frontend - Communication & Scanner

- [ ] 21. Create Communication components (Future Phase)
  - [ ] 21.1 Create CommunicationModal
  - [ ] 21.2 Create BulkCommunicationModal
  - [ ] 21.3 Create CommunicationHistory component

- [ ] 22. Create Document Scanner components (Future Phase)
  - [ ] 22.1 Create DebtDocumentScanner component
  - [ ] 22.2 Create ScanResultCard component
  - [ ] 22.3 Create MultiPartyResultList component

- [ ] 23. Update Debtors settings page (Future Phase)
  - [ ] 23.1 Enhance debtors list page
  - [ ] 23.2 Add risk management UI

- [x] 24. Final Checkpoint - Core implementation complete

---

## Summary of Completed Work (2024-12-14)

### Backend:
- DebtorService: CRUD, duplicate check, address management, statistics
- CaseDebtorService: Add/update/remove debtors from cases, notification validation
- ThirdPartyService: CRUD, 89 ihbarname tracking, overdue alerts
- DebtorCommunicationService: SMS/Email/Phone logging, templates

### API Endpoints:
- GET/POST /api/debtors
- GET/PUT/DELETE /api/debtors/:id
- POST /api/debtors/check-duplicate
- POST/PUT/DELETE /api/debtors/:id/addresses/*
- GET/POST /api/cases/:caseId/debtors
- PUT/DELETE /api/case-debtors/:id
- GET/POST /api/case-debtors/:id/third-parties
- POST /api/third-parties/:id/ihbarname
- POST /api/debtors/:id/communications/sms|email|call
- GET /api/communication-templates

### Frontend:
- DebtorStep component (3-panel layout)
- NewDebtorModal (Şahıs/Kurum/Kamu support)
- SelectedDebtorCard (role, notification mode, address selection)
- Types and labels for all debtor-related enums
