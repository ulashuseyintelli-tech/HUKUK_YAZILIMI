# Implementation Plan: Borçlu Adres Görev Sistemi

## Overview

Bu plan, borçlu adres yönetimi görev sisteminin TypeScript/Prisma tabanlı implementasyonunu kapsar. Event-driven mimari, idempotent task oluşturma, SLA tabanlı hatırlatmalar ve audit log entegrasyonu içerir.

## Tasks

- [x] 1. Veritabanı Şeması ve Altyapı
  - [x] 1.1 AddressTask modeli ve enum'ları Prisma schema'ya ekle
    - AddressTaskType, AddressTaskStatus enum'ları
    - AddressTask modeli (taskType, status, dueAt, attemptCount, maxAttempts, channelUsed, resultType, nextRunAt)
    - Unique index: `@@unique([caseId, debtorId, taskType, scopeKey])` (dedupe key)
    - _Requirements: 1.1, 1.2, 3.1, 4.1, 5.1_

  - [x] 1.2 DebtorAddress modeline yeni alanlar ekle
    - addressCategory (AddressCategory enum)
    - sourceDetail (AddressSourceDetail enum)
    - evidenceId, confidenceLevel, addressHash alanları
    - Unique index: `@@unique([debtorId, addressHash])`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.3 OutboxEvent modeli ekle (event güvenilirliği için)
    - eventType, payload, status, createdAt, processedAt
    - Transaction içinde event yazma garantisi
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 1.4 Prisma migration oluştur ve çalıştır
    - `npx prisma migrate dev --name add_address_task_system`
    - _Requirements: 1.1-1.6_

- [-] 2. Address Utility Fonksiyonları
  - [x] 2.1 Address normalization ve hash fonksiyonu implement et
    - TR uppercase, whitespace squash, punctuation standardization
    - SHA256 hash üretimi
    - `normalizeAddress(address: string): string`
    - `hashAddress(normalizedAddress: string): string`
    - _Requirements: 1.6_

  - [ ] 2.2 Address hash property testi yaz
    - **Property 2: Address Deduplication**
    - *For any* iki adres aynı normalize edilmiş içeriğe sahipse, aynı hash üretmeli
    - **Validates: Requirements 1.6**

  - [x] 2.3 Confidence level hesaplama fonksiyonu
    - Source'a göre confidence belirleme kuralları
    - MERNIS/UYAP: HIGH, Client reply: MEDIUM, Document OCR: MEDIUM, Manual: MEDIUM
    - _Requirements: 1.5_

- [ ] 3. Checkpoint - Veritabanı ve Utility Testleri
  - Ensure all tests pass, ask the user if questions arise.

- [-] 4. TaskEngine Core Service
  - [x] 4.1 TaskEngine service interface ve base implementasyonu
    - `createTask()`, `updateTaskStatus()`, `completeTask()`, `cancelTask()`
    - Idempotent task creation (dedupe key kontrolü)
    - _Requirements: 3.1, 4.1, 5.1, 7.2_

  - [ ] 4.2 Task idempotency property testi yaz
    - **Property 3: Document Upload Triggers Task**
    - *For any* aynı (caseId, debtorId, taskType, scopeKey) kombinasyonu için sadece bir task oluşturulmalı
    - **Validates: Requirements 2.1, 10.1**

  - [ ] 4.3 Task state machine transitions implement et
    - PENDING → IN_PROGRESS → WAITING_EXTERNAL → DONE/FAILED/CANCELLED
    - Guard checks (geçersiz geçişleri engelle)
    - _Requirements: 4.6, 5.1, 6.4, 7.1_

  - [ ] 4.4 SLA Monitor ve Scheduler implement et
    - `checkOverdueTasks()`: dueAt < now olan taskları bul
    - `processReminders()`: hatırlatma gönder, attemptCount artır
    - Cron job entegrasyonu için hazırlık
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 4.5 SLA reminder property testi yaz
    - **Property 7: SLA Reminder Mechanism**
    - *For any* WAITING_EXTERNAL task where dueAt < now and attemptCount < maxAttempts, reminder gönderilmeli
    - **Validates: Requirements 5.1, 5.2**

- [ ] 5. Event Handlers
  - [ ] 5.1 onEvidenceUploaded handler implement et
    - Address alanları varsa DOC_EXTRACT_DEBTOR_ADDRESSES task oluştur
    - Outbox'a event yaz
    - _Requirements: 2.1, 10.1_

  - [ ] 5.2 onDebtorCreated handler implement et
    - INDIVIDUAL type ise CLIENT_CONTACT_VALIDATE task oluştur
    - _Requirements: 3.1, 10.2_

  - [ ] 5.3 Individual debtor property testi yaz
    - **Property 4: Individual Debtor Triggers Contact Validation**
    - *For any* INDIVIDUAL debtor oluşturulduğunda CLIENT_CONTACT_VALIDATE task oluşturulmalı
    - **Validates: Requirements 3.1, 10.2**

  - [ ] 5.4 onCaseStatusChanged handler implement et
    - DERDEST'ten başka duruma geçişte annual refresh taskları iptal et
    - _Requirements: 7.6, 10.5_

  - [ ] 5.5 Case closure property testi yaz
    - **Property 11: Case Closure Cancels Annual Tasks**
    - *For any* case DERDEST'ten çıkınca CLIENT_ANNUAL_ADDRESS_REFRESH taskları CANCELLED olmalı
    - **Validates: Requirements 7.6, 10.5**

  - [ ] 5.6 onClientResponseReceived handler implement et
    - Positive response: adres kaydet, task DONE
    - Negative response: annual refresh planla
    - _Requirements: 6.1-6.6, 7.1-7.3_

- [ ] 6. Checkpoint - TaskEngine Testleri
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Communication Service
  - [ ] 7.1 CommunicationService interface implement et
    - `sendAddressRequest()`, `sendReminder()`, `getClientContactChannels()`
    - Email ve WhatsApp adapter'ları (şimdilik simüle)
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [ ] 7.2 Channel selection logic implement et
    - Sadece email varsa → EMAIL
    - Sadece whatsapp varsa → WHATSAPP
    - İkisi de varsa → BOTH
    - _Requirements: 4.2, 4.3, 4.4_

  - [ ] 7.3 Channel selection property testi yaz
    - **Property 6: Channel Selection Logic**
    - *For any* client contact durumu için doğru kanal seçilmeli
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [ ] 7.4 Message correlation implement et
    - Her mesaja correlation_id = taskId ekle
    - Cevap geldiğinde task eşleştirme
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 8. Address Service
  - [ ] 8.1 AddressService implement et
    - `createAddress()`, `updateAddress()`, `findByDebtor()`
    - Hash bazlı upsert (tekrar engelleme)
    - _Requirements: 1.6, 2.2, 2.3, 6.1_

  - [ ] 8.2 Address creation property testi yaz
    - **Property 1: Address Model Field Completeness**
    - *For any* oluşturulan adres addressCategory, sourceDetail, retrievedAt, confidenceLevel alanlarına sahip olmalı
    - **Validates: Requirements 1.1, 1.2, 1.4, 1.5**

  - [ ] 8.3 Document address extraction implement et
    - Evraktan adres çıkarma (şimdilik manuel/simüle)
    - addressCategory = DECLARED_DOCUMENT
    - _Requirements: 2.2, 2.3, 2.4_

- [ ] 9. Audit Log Service
  - [ ] 9.1 AuditLogService implement et
    - `logAddressAction()` fonksiyonu
    - AddressAuditAction enum'ları
    - Notes paneline entegrasyon için showInNotes flag
    - _Requirements: 2.5, 4.7, 5.3, 6.5, 7.3_

  - [ ] 9.2 Audit log completeness property testi yaz
    - **Property 12: Audit Log Completeness**
    - *For any* address action için audit log kaydı oluşturulmalı
    - **Validates: Requirements 2.5, 4.7, 5.3, 6.5, 7.3**

- [ ] 10. Checkpoint - Services Testleri
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Flow: Müvekkile Adres Talebi
  - [ ] 11.1 CLIENT_CONTACT_VALIDATE flow implement et
    - İletişim bilgisi kontrolü
    - Yoksa manuel görev oluştur
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ] 11.2 Contact validation blocking property testi yaz
    - **Property 5: Contact Validation Blocking**
    - *For any* CLIENT_CONTACT_VALIDATE DONE olmadan CLIENT_REQUEST_DEBTOR_ADDRESSES oluşturulmamalı
    - **Validates: Requirements 3.5**

  - [ ] 11.3 CLIENT_REQUEST_DEBTOR_ADDRESSES flow implement et
    - Mesaj gönderimi
    - WAITING_EXTERNAL durumuna geçiş
    - dueAt = now + 3 days
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ] 11.4 Hatırlatma mekanizması implement et
    - 3 günde bir hatırlatma
    - attemptCount artırma
    - 3. denemede manuel görev oluşturma
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 11.5 Escalation property testi yaz
    - **Property 8: Escalation After Max Attempts**
    - *For any* attemptCount >= maxAttempts durumunda ASSIGN_MANUAL_CALL_CLIENT oluşturulmalı
    - **Validates: Requirements 5.4**

  - [ ] 11.6 Müvekkil cevabı işleme implement et
    - Positive: adres kaydet, task DONE
    - Negative: annual refresh planla
    - _Requirements: 6.1-6.6, 7.1-7.5_

  - [ ] 11.7 Positive response property testi yaz
    - **Property 9: Positive Response Creates Addresses**
    - *For any* positive response için DebtorAddress kaydı oluşturulmalı
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ] 11.8 Negative response property testi yaz
    - **Property 10: Negative Response Schedules Annual Refresh**
    - *For any* negative response ve DERDEST case için annual refresh planlanmalı
    - **Validates: Requirements 7.2**

- [ ] 12. Checkpoint - Flow Testleri
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. API Endpoints
  - [ ] 13.1 Task API endpoints oluştur
    - GET /api/cases/:caseId/address-tasks (pending tasks)
    - POST /api/address-tasks/:taskId/complete (manuel tamamlama)
    - POST /api/address-tasks/:taskId/cancel (iptal)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 13.2 Address API endpoints oluştur
    - GET /api/debtors/:debtorId/addresses
    - POST /api/debtors/:debtorId/addresses (manuel ekleme)
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ] 13.3 Audit log API endpoint oluştur
    - GET /api/cases/:caseId/address-audit-logs
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 14. UI Entegrasyonu
  - [ ] 14.1 Yapılacaklar paneline address task'ları ekle
    - Task listesi görüntüleme
    - Overdue task'ları kırmızı göster
    - Task tamamlama/iptal butonları
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 14.2 Notlar paneline audit log entegrasyonu
    - Address action'ları göster
    - Kronolojik sıralama
    - Source icon (sistem/manuel)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ] 14.3 Borçlu adres listesi UI güncellemesi
    - Source ve confidence gösterimi
    - Son güncelleme tarihi
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

- [ ] 15. Scheduler/Cron Job
  - [ ] 15.1 SLA checker cron job implement et
    - Her saat çalışan job
    - Overdue task'ları işle
    - Hatırlatma gönder
    - _Requirements: 5.1, 5.2_

  - [ ] 15.2 Annual refresh checker implement et
    - Günlük çalışan job
    - nextRunAt <= now olan taskları işle
    - _Requirements: 7.4_

  - [ ] 15.3 Outbox publisher worker implement et
    - Pending event'leri yayınla
    - Retry mekanizması
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 16. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Tüm property testleri geçmeli
  - Integration testleri geçmeli
  - UI manuel test

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- TypeScript kullanılacak
- fast-check kütüphanesi property-based testing için kullanılacak


## Sprint: Task Bypass & Auto-Completion (Yeni)

Bu sprint, müvekkil spam'ini önlemek ve görev panelini temiz tutmak için bypass ve auto-completion kurallarını implement eder.

- [ ] 17. UI: Müvekkil Teyit Checkbox
  - [ ] 17.1 Borçlu oluşturma formuna "Adres müvekkilden alındı" checkbox ekle
    - Checkbox label: "Bu adres(ler) müvekkilden alındı (teyitli)"
    - Checkbox işaretlenince info mesajı: "Müvekkile adres talebi gönderilmeyecek"
    - _Requirements: 23.1, 23.4, 23.5_

  - [ ] 17.2 Checkbox state'ini backend'e gönder
    - `clientConfirmed: boolean` field'ı request body'ye ekle
    - _Requirements: 23.2, 23.3_

- [ ] 18. Backend: Address Intake Mode
  - [ ] 18.1 Debtor modeline `addressIntakeMode` field ekle
    - Enum: `CLIENT_CONFIRMED`, `UNKNOWN`, `NEEDS_CLIENT_REQUEST`
    - Migration oluştur
    - _Requirements: 28.1, 28.2, 28.3, 28.4_

  - [ ] 18.2 Debtor create endpoint'ini güncelle
    - `clientConfirmed` parametresine göre `addressIntakeMode` set et
    - Adres varsa ve checkbox işaretliyse: `CLIENT_CONFIRMED`
    - Adres yoksa: `NEEDS_CLIENT_REQUEST`
    - Adres var ama checkbox işaretli değilse: `UNKNOWN`
    - _Requirements: 28.2, 28.3, 28.4, 28.5_

- [ ] 19. TaskEngine: Bypass Rules
  - [ ] 19.1 `shouldBypassAddressRequest()` fonksiyonu implement et
    - Debtor'un useful address'i var mı kontrol et
    - `addressIntakeMode === CLIENT_CONFIRMED` ise bypass
    - _Requirements: 24.1, 24.2, 27.1, 27.2_

  - [ ] 19.2 `hasUsefulAddresses()` fonksiyonu implement et
    - addressCategory IN (DECLARED_CLIENT, DECLARED_DOCUMENT, MERNIS_RESIDENCE)
    - isCurrent = true
    - confidenceLevel IN (MEDIUM, MEDIUM_HIGH, HIGH)
    - _Requirements: 27.1, 27.2, 27.3_

  - [ ] 19.3 onDebtorCreated handler'ı güncelle
    - Bypass kurallarını uygula
    - Bypass edilirse audit log: "Borçlu adresleri müvekkil teyidi ile kaydedildi → otomatik talep tetiklenmedi"
    - _Requirements: 24.2, 24.3, 24.4_

- [ ] 20. TaskEngine: Auto-Completion Rules
  - [ ] 20.1 `autoCompleteOnAddressReceived()` fonksiyonu implement et
    - Açık CLIENT_REQUEST_DEBTOR_ADDRESSES task'ını bul
    - status = DONE, resultType = POSITIVE, doneReason = ADDRESSES_RECEIVED
    - Açık reminder task'larını CANCELLED yap
    - _Requirements: 25.1, 25.2, 25.3_

  - [ ] 20.2 onAddressesReceived event handler implement et
    - CLIENT_REPLY veya CLIENT_CONFIRMED_UI source'larını dinle
    - autoCompleteOnAddressReceived() çağır
    - _Requirements: 25.1_

  - [ ] 20.3 "Zaten aldık" butonu için endpoint ekle
    - POST /api/address-tasks/:taskId/confirm-received
    - doneReason = CONFIRMED_BY_OPERATOR
    - _Requirements: 26.1, 26.2, 26.3, 26.4_

- [ ] 21. UI: Task Panel Updates
  - [ ] 21.1 CLIENT_REQUEST_DEBTOR_ADDRESSES task'larına "Zaten aldık" butonu ekle
    - Butona tıklanınca confirm-received endpoint'i çağır
    - Task panelinden kaldır
    - _Requirements: 26.1, 26.2_

  - [ ] 21.2 Debtor kartlarına "Yararlı adres var" indicator ekle
    - hasUsefulAddresses() sonucuna göre göster
    - _Requirements: 27.4_

- [ ] 22. Checkpoint - Bypass & Auto-Completion Testleri
  - [ ] 22.1 Bypass property testi yaz
    - *For any* CLIENT_CONFIRMED debtor ile useful address varsa, address request task oluşturulmamalı
    - **Validates: Requirements 24.1, 24.2**

  - [ ] 22.2 Auto-completion property testi yaz
    - *For any* address received event'i için açık request task DONE olmalı
    - **Validates: Requirements 25.1, 25.2**

  - Ensure all tests pass, ask the user if questions arise.
