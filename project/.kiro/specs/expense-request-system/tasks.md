# Implementation Plan: Expense Request System

## Overview

Masraf talep sisteminin implementasyonu. Mevcut `ExpenseRequest` modeli genişletilecek, yeni servisler oluşturulacak ve 3-view entegrasyonu sağlanacak.

## Tasks

- [x] 1. Schema güncellemeleri ve migration
  - [x] 1.1 ExpenseRequest modeline yeni alanlar ekle (gateType, stageCode, paidTotal, taskId)
    - `gateType` enum: BLOCKING, NON_BLOCKING
    - `stageCode` string: OPENING, RE_NOTIFICATION, SEIZURE, SALE
    - `paidTotal` Decimal: Kısmi ödeme takibi
    - _Requirements: 4.1, 5.1_
  - [x] 1.2 ExpensePayment modeli oluştur
    - Ödeme kayıtları için ayrı tablo
    - amount, paymentDate, method, reference alanları
    - _Requirements: 3.1, 3.5_
  - [x] 1.3 ExpenseAuditLog modeli oluştur
    - Override ve durum değişikliği audit log'u
    - _Requirements: 7.4_
  - [x] 1.4 Prisma migration çalıştır
    - `prisma db push` ile schema senkronize et
    - _Requirements: 1.1_

- [x] 2. ExpenseCalculatorService implementasyonu
  - [x] 2.1 Tarife hesaplama fonksiyonları
    - `calculateBasvurmaHarci(principalAmount)` - 2026 tarifesine göre
    - `calculatePesinHarc(principalAmount)` - %2 formülü
    - `calculateVekaletHarci()` - Sabit tutar
    - `calculateTebligatGideri(count)` - Adet bazlı
    - `calculateDosyaGideri()` - Sabit tutar
    - `calculateVekaletPulu()` - Sabit tutar
    - _Requirements: 7.2, 7.3_
  - [x] 2.2 Property test: Tarife hesaplama doğruluğu
    - **Property 8: Tariff Calculation Correctness**
    - **Validates: Requirements 7.2, 7.3**
  - [x] 2.3 Masraf seti hesaplama
    - `calculateOpeningExpenses(caseData)` - 6 kalemli açılış seti
    - `calculateStageExpenses(stageCode, caseData)` - Aşama bazlı
    - _Requirements: 1.3_

- [x] 3. ExpenseRequestService implementasyonu
  - [x] 3.1 Otomatik masraf seti oluşturma
    - `createOpeningExpenseSet(caseId, tenantId)` - Case oluşturulduğunda
    - `createStageExpenseSet(caseId, stageCode, tenantId)` - Aşama değişikliğinde
    - _Requirements: 1.1, 5.1_
  - [x] 3.2 Property test: Case creation triggers expense set
    - **Property 1: Case Creation Triggers Expense Set**
    - **Validates: Requirements 1.1, 1.5**
  - [x] 3.3 Ödeme kaydetme ve durum güncelleme
    - `recordPayment(requestId, payment)` - Ödeme eşleştirme
    - Kısmi ödeme → PARTIAL, tam ödeme → PAID
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 3.4 Property test: Payment status correctness
    - **Property 3: Payment Status Correctness**
    - **Validates: Requirements 3.2, 3.3**
  - [x] 3.5 Property test: Payment sum invariant
    - **Property 4: Payment Sum Invariant**
    - **Validates: Requirements 3.1, 3.5**
  - [x] 3.6 Masraf talebi finalize ve gönderme
    - `finalizeAndSend(requestId)` - Talebi kesinleştir ve müvekkile gönder
    - _Requirements: 1.5, 6.1_

- [x] 4. ExpenseGateService implementasyonu
  - [x] 4.1 Gate kontrolü fonksiyonları
    - `checkGate(caseId)` - BLOCKING expense kontrolü
    - `isUyapBlocked(caseId)` - Boolean döndür
    - `canPerformUyapAction(caseId, actionType)` - İşlem izni
    - _Requirements: 4.1, 4.3_
  - [x] 4.2 Property test: Gate mechanism consistency
    - **Property 5: Gate Mechanism Consistency**
    - **Validates: Requirements 4.1, 4.3, 4.5**
  - [x] 4.3 Gate durumu güncelleme
    - `updateGateStatus(caseId)` - Ödeme sonrası otomatik güncelleme
    - Case status → "UYAP'a Gönderilebilir" when cleared
    - _Requirements: 4.4_

- [x] 5. Checkpoint - Core services tamamlandı
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. ExpenseNotificationService implementasyonu
  - [x] 6.1 E-posta şablonu ve gönderimi
    - `renderExpenseEmail(request)` - HTML şablon
    - `sendExpenseRequest(requestId)` - E-posta gönder
    - İçerik: dosya no, kalemler, toplam, IBAN, son tarih
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 6.2 Property test: Email content completeness
    - **Property 7: Email Content Completeness**
    - **Validates: Requirements 6.2, 6.3**
  - [x] 6.3 Hatırlatma sistemi
    - `sendReminder(requestId)` - Son tarih yaklaşınca
    - Gecikme durumunda manuel görev oluştur
    - _Requirements: 6.4, 6.5_

- [x] 7. 3-View entegrasyonu
  - [x] 7.1 Yapılacaklar paneli entegrasyonu
    - `expenseToTask()` dönüşüm fonksiyonu
    - Task status senkronizasyonu
    - _Requirements: 2.1_
  - [x] 7.2 Finans paneli entegrasyonu
    - `expenseToFinanceItem()` dönüşüm fonksiyonu
    - Kalem döküm ve ödeme geçmişi
    - _Requirements: 2.2, 2.5_
  - [x] 7.3 Müvekkil Talepleri paneli entegrasyonu
    - `expenseToClientRequest()` dönüşüm fonksiyonu
    - Ödeme bilgileri (IBAN, açıklama)
    - _Requirements: 2.3_
  - [x] 7.4 Property test: Three-view consistency
    - **Property 2: Three-View Consistency**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  - [x] 7.5 Task completion on payment
    - PAID olunca ilgili task'ı tamamla
    - _Requirements: 3.4_
  - [x] 7.6 Property test: Task completion on payment
    - **Property 6: Task Completion on Payment**
    - **Validates: Requirements 3.4**

- [x] 8. Checkpoint - Backend tamamlandı
  - All 77 tests passing

- [x] 9. API Controller implementasyonu
  - [x] 9.1 ExpenseRequestController oluştur
    - `POST /expense-requests/case/:caseId/opening` - Açılış masrafları
    - `POST /expense-requests/case/:caseId/stage/:stageCode` - Aşama masrafları
    - `POST /expense-requests/:id/finalize` - Kesinleştir ve gönder
    - `POST /expense-requests/:id/payment` - Ödeme kaydet
    - `GET /expense-requests/case/:caseId` - Dosya masrafları
    - `GET /expense-requests/case/:caseId/summary` - Özet
    - `GET /expense-requests/case/:caseId/gate-status` - Gate durumu
    - `POST /expense-requests/:id/send-email` - E-posta gönder
    - `POST /expense-requests/:id/send-reminder` - Hatırlatma gönder
    - `GET /expense-requests/:id/three-view` - 3 görünüm
    - `GET /expense-requests/pending-tasks` - Bekleyen task'lar
    - `POST /expense-requests/calculate-preview` - Hesaplama önizleme
    - _Requirements: 1.1, 3.1, 4.1_
  - [x] 9.2 Module ve dependency injection
    - ExpenseRequestModule güncellendi
    - Tüm servisler inject edildi
    - _Requirements: 1.1_

- [x] 10. Frontend entegrasyonu
  - [x] 10.1 API client metodları
    - `api.createOpeningExpenses(caseId)`
    - `api.createStageExpenses(caseId, stageCode)`
    - `api.finalizeExpenseRequest(id, channel)`
    - `api.recordExpensePayment(id, payment)`
    - `api.getExpenseSummary(caseId)`
    - `api.checkExpenseGate(caseId)`
    - `api.canPerformUyapAction(caseId, actionType)`
    - `api.getExpenseThreeView(id)`
    - `api.getPendingExpenseTasks()`
    - `api.calculateExpensePreview(data)`
    - _Requirements: 2.1_
  - [x] 10.2 ExpenseGateWarning component
    - Gate durumu gösterimi
    - Bekleyen masraflar listesi
    - Ödeme kaydet butonu
    - _Requirements: 4.2_
  - [x] 10.3 UyapActionButton component
    - UYAP butonlarında masraf kontrolü
    - "Masraf ödenmeden işlem yapılamaz" uyarısı
    - _Requirements: 4.2_
  - [x] 10.4 OperationDeck güncellemesi (opsiyonel)
    - Yapılacaklar panelinde expense task'ları göster
    - Finans panelinde expense breakdown
    - Müvekkil Talepleri panelinde masraf talepleri
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 11. Case lifecycle entegrasyonu
  - [x] 11.1 Case oluşturma hook'u
    - Case oluşturulduğunda otomatik masraf seti
    - ExpenseRequestService inject edildi
    - createOpeningExpenseSet arka planda çağrılıyor
    - _Requirements: 1.1_
  - [x] 11.2 Aşama değişikliği hook'u (opsiyonel)
    - RE_NOTIFICATION, SEIZURE, SALE aşamalarında yeni masraf seti
    - _Requirements: 5.1_

- [x] 12. Final checkpoint
  - All 77 tests passing
  - Backend services: ExpenseCalculatorService, ExpenseRequestService, ExpenseGateService, ExpenseNotificationService, ExpenseViewService
  - API Controller: 20+ endpoints
  - Frontend: API client methods, ExpenseGateWarning component
  - Case lifecycle: Auto expense set on case creation

## Notes

- All property tests are included for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Mevcut ExpenseRequest modeli genişletiliyor, yeni model oluşturulmuyor
- TypeScript kullanılacak (mevcut proje yapısına uygun)

