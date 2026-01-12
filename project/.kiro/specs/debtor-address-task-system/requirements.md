# Requirements Document

## Introduction

Borçlu adres yönetimi için kapsamlı bir görev (task) ve hatırlatma sistemi. Sistem, borçlu adreslerini çeşitli kaynaklardan (evrak, müvekkil, UYAP/MERNİS) toplar, eksiklikleri tespit eder ve otomatik görevler oluşturarak avukatları yönlendirir. Her işlem "Yapılacaklar" ve "Notlar" panellerinde görünür.

## Temel Tasarım Kararları

- **SLA Hesaplama**: Tüm SLA süreleri calendar day (takvim günü) olarak hesaplanır. "3 gün = 72 saat" anlamına gelir.
- **Data Retention**: Eski adresler silinmez, `is_current=false` ile pasiflenir. Audit kayıtları kalıcıdır.
- **TR Adres Formatı**: İl/ilçe/posta kodu parse edilmez; tek string olarak saklanır. Normalizasyon standart kurallara göre yapılır.
- **Hata Kodları**: Sistem standart failure reason enum'ları kullanır: `UYAP_UNAVAILABLE`, `NO_CONTACT`, `CLIENT_NO_RESPONSE`, `INVALID_ADDRESS`, `DUPLICATE_TASK`, `SLA_EXCEEDED`

## Glossary

- **Task_Engine**: Görevleri oluşturan, takip eden ve SLA kontrolü yapan motor
- **Debtor_Address**: Borçlu adres kaydı modeli
- **Address_Source**: Adresin nereden geldiği (DOCUMENT_SCAN, CLIENT_REPLY, MERNIS vb.)
- **Address_Type**: Adres türü (DECLARED_DOCUMENT, DECLARED_CLIENT, MERNIS_RESIDENCE vb.)
- **SLA**: Service Level Agreement - görev tamamlanma süresi (calendar day bazlı, 3 gün = 72 saat)
- **Audit_Log**: Sistem işlemlerinin kaydı
- **Task_Panel**: UI'daki "Yapılacaklar" paneli
- **Notes_Panel**: UI'daki "Notlar" paneli
- **dedupeKey**: Task tekilliği için kullanılan anahtar (taskType + scope kombinasyonu)
- **addressHash**: Normalize edilmiş adres string'inin hash değeri
- **evidenceRef**: Adresin kaynağını gösteren referans (documentId, communicationId, uyapQueryId)
- **correlationId**: Giden mesaj ile gelen cevabı eşleştiren token

## Requirements

### Requirement 1: Adres Kayıt Tipleri

**User Story:** As a avukat, I want to see the source and type of each debtor address, so that I can prioritize addresses for service of process.

#### Acceptance Criteria

1. THE Debtor_Address model SHALL support `address_type` values: `DECLARED_DOCUMENT`, `DECLARED_CLIENT`, `MERNIS_RESIDENCE`, `SGK_ADDRESS`, `TICARET_SICIL`
2. THE Debtor_Address model SHALL store `source` field with values: `DOCUMENT_SCAN`, `MANUAL_ENTRY`, `CLIENT_REPLY_EMAIL`, `CLIENT_REPLY_WHATSAPP`, `UYAP_MERNIS`, `UYAP_SGK`
3. THE Debtor_Address model SHALL store `evidence_ref` object containing exactly one of: `documentId`, `communicationId`, or `uyapQueryId`
4. THE Debtor_Address model SHALL store `retrieved_at` timestamp
5. THE Debtor_Address model SHALL store `confidence` score (LOW, MEDIUM, HIGH)
6. THE Debtor_Address model SHALL store `is_current` boolean (default true, false for archived addresses)
7. WHEN duplicate addresses are detected (same `address_hash`), THE System SHALL update `retrieved_at` instead of creating new record

### Requirement 2: Borç Evrakından Adres Kaydı

**User Story:** As a avukat, I want addresses from debt documents to be automatically extracted and saved, so that I have initial address data for debtors.

#### Acceptance Criteria

1. WHEN a debt document (evidence) is uploaded or entered, THE System SHALL create a task `DOC_EXTRACT_DEBTOR_ADDRESSES`
2. WHEN address fields are found in the document, THE System SHALL create `debtor_address` records with `address_type = DECLARED_DOCUMENT`
3. THE System SHALL set `source = DOCUMENT_SCAN` for OCR/AI extracted addresses
4. THE System SHALL set `source = MANUAL_ENTRY` for manually entered addresses
5. THE System SHALL create an Audit_Log entry: "Borç evrakından adres kaydı oluşturuldu"
6. THE Notes_Panel SHALL display: "Evraktan X adet adres kaydedildi"

### Requirement 3: Müvekkil İletişim Doğrulama

**User Story:** As a sistem, I want to validate client contact information before sending address requests, so that automated messages can be delivered.

#### Acceptance Criteria

1. WHEN a new debtor (INDIVIDUAL type) is created, THE System SHALL create task `CLIENT_CONTACT_VALIDATE`
2. IF client has no email AND no whatsapp number, THE System SHALL create a manual task for case responsible: "Müvekkil iletişim bilgilerini tamamla"
3. THE manual task SHALL have `due_at = now + 1 day`
4. IF client has at least one contact method (email OR whatsapp), THE task SHALL be marked as `DONE`
5. THE System SHALL NOT proceed to address request until `CLIENT_CONTACT_VALIDATE` is `DONE`
6. THE Task_Panel SHALL display pending contact validation tasks

### Requirement 4: Müvekkile Adres Talebi Gönderimi

**User Story:** As a avukat, I want the system to automatically request debtor addresses from clients, so that I don't have to manually send messages.

#### Acceptance Criteria

1. WHEN `CLIENT_CONTACT_VALIDATE` is `DONE`, THE System SHALL create task `CLIENT_REQUEST_DEBTOR_ADDRESSES`
2. IF client has only email, THE System SHALL send request via email
3. IF client has only whatsapp, THE System SHALL send request via whatsapp
4. IF client has both email AND whatsapp, THE System SHALL send request via both channels
5. THE message SHALL contain: debtor name, TC number (if available), file reference, and address request text
6. WHEN message is sent, THE task status SHALL be `WAITING_EXTERNAL` with `due_at = now + 3 days`
7. THE Audit_Log SHALL record: "Müvekkile adres talebi gönderildi (Email/WhatsApp)"
8. THE Notes_Panel SHALL display: "Müvekkile adres talebi gönderildi"

### Requirement 5: Hatırlatma Mekanizması (3 Günde Bir)

**User Story:** As a avukat, I want the system to automatically remind clients who haven't responded, so that address requests don't get forgotten.

#### Acceptance Criteria

1. WHEN task `CLIENT_REQUEST_DEBTOR_ADDRESSES` is `WAITING_EXTERNAL` AND `due_at` has passed AND no response received, THE System SHALL send a reminder
2. THE System SHALL increment `attempt_count` and set `due_at = now + 3 days`
3. THE System SHALL create Audit_Log: "Hatırlatma #N gönderildi"
4. WHEN `attempt_count >= 3`, THE System SHALL create manual task `ASSIGN_MANUAL_CALL_CLIENT` for case responsible
5. THE manual task SHALL have description: "Müvekkili telefonla arayın - adres bilgisi bekleniyor"
6. THE Task_Panel SHALL show reminder count and next reminder date

### Requirement 6: Müvekkil Cevabı İşleme

**User Story:** As a avukat, I want client responses to be processed and addresses saved automatically, so that I don't have to manually enter data.

#### Acceptance Criteria

1. WHEN client responds with addresses (positive response), THE System SHALL create `debtor_address` records with `address_type = DECLARED_CLIENT`
2. THE System SHALL set `source = CLIENT_REPLY_EMAIL` or `CLIENT_REPLY_WHATSAPP` based on channel
3. THE System SHALL set `evidence_ref.communicationId` to the message/communication ID
4. THE task SHALL be marked as `DONE`
5. THE Audit_Log SHALL record: "Müvekkil adres verdi → X yeni adres işlendi"
6. THE Notes_Panel SHALL display: "Müvekkilden gelen adresler işlendi"

### Requirement 7: Olumsuz Cevap ve Yıllık Tekrar

**User Story:** As a avukat, I want the system to periodically re-request addresses from clients who couldn't provide them, so that new information can be captured over time.

#### Acceptance Criteria

1. WHEN client responds negatively (no address available), THE task SHALL be marked as `DONE`
2. IF case status is `DERDEST`, THE System SHALL create task `CLIENT_ANNUAL_ADDRESS_REFRESH` with `next_run_at = now + 365 days`
3. THE Audit_Log SHALL record: "Müvekkil olumsuz yanıtladı → yıllık talep planlandı"
4. WHEN `next_run_at` arrives AND case is still `DERDEST`, THE System SHALL send new address request
5. THE annual refresh task SHALL follow same SLA rules (3-day reminders)
6. IF case status changes from `DERDEST`, THE annual refresh task SHALL be cancelled

### Requirement 8: Yapılacaklar Paneli Entegrasyonu

**User Story:** As a avukat, I want to see all pending address-related tasks in the Yapılacaklar panel, so that I can track what needs to be done.

#### Acceptance Criteria

1. THE Task_Panel SHALL display all pending tasks with type containing `ADDRESS` or `CLIENT_REQUEST`
2. EACH task item SHALL show: task title, due date, attempt count (if applicable), assigned person
3. THE Task_Panel SHALL highlight overdue tasks in red
4. WHEN a task is completed, THE System SHALL remove it from Task_Panel
5. THE Task_Panel SHALL support filtering by task type and status

### Requirement 9: Notlar Paneli Entegrasyonu

**User Story:** As a avukat, I want to see a history of address-related actions in the Notlar panel, so that I can track what has been done.

#### Acceptance Criteria

1. WHEN any address-related action is completed, THE System SHALL create a note entry
2. THE note SHALL include: action description, timestamp, result summary
3. THE Notes_Panel SHALL display notes in chronological order (newest first)
4. THE Notes_Panel SHALL show source icon (system/manual) for each note
5. THE Notes_Panel SHALL support filtering by note type

### Requirement 10: Tetikleyici Kuralları

**User Story:** As a sistem, I want to automatically trigger appropriate tasks based on events, so that the workflow progresses without manual intervention.

#### Acceptance Criteria

1. WHEN event `EVIDENCE_UPLOADED` occurs with address fields, THE System SHALL trigger `DOC_EXTRACT_DEBTOR_ADDRESSES`
2. WHEN event `DEBTOR_CREATED` occurs for INDIVIDUAL type, THE System SHALL trigger `CLIENT_CONTACT_VALIDATE`
3. WHEN `CLIENT_CONTACT_VALIDATE` completes with `DONE`, THE System SHALL trigger `CLIENT_REQUEST_DEBTOR_ADDRESSES`
4. WHEN `DOC_EXTRACT_DEBTOR_ADDRESSES` completes, THE System SHALL also trigger `CLIENT_REQUEST_DEBTOR_ADDRESSES` for verification
5. WHEN `CASE_STATUS_CHANGED` to non-DERDEST, THE System SHALL cancel pending annual refresh tasks

### Requirement 11: Tekillik ve Idempotency

**User Story:** As a sistem, I want to prevent duplicate tasks from being created, so that the same work is not done twice.

#### Acceptance Criteria

1. THE AddressTask model SHALL have a `dedupeKey` field combining `taskType + caseId + debtorId + scope`
2. THE System SHALL enforce unique constraint on `dedupeKey` in database
3. WHEN the same event is received multiple times, THE System SHALL NOT create duplicate tasks
4. IF a task with same `dedupeKey` exists and is not `DONE` or `CANCELLED`, THE System SHALL skip task creation
5. THE System SHALL log duplicate event detection in audit log

### Requirement 12: Adres Normalizasyon ve Hash Standardı

**User Story:** As a sistem, I want addresses to be normalized before storage, so that duplicate addresses are correctly identified.

#### Acceptance Criteria

1. THE System SHALL apply normalization function before creating `addressHash`
2. THE normalization SHALL convert text to Turkish uppercase (İ→I, Ş→S, Ğ→G, Ü→U, Ö→O, Ç→C)
3. THE normalization SHALL collapse multiple whitespaces to single space
4. THE normalization SHALL remove line breaks and replace with space
5. THE normalization SHALL standardize common abbreviations: "NO:" → "NO", "NO." → "NO", "MAH." → "MAHALLESİ", "CAD." → "CADDESİ", "SK." → "SOKAK"
6. THE normalization SHALL trim leading/trailing whitespace
7. THE `addressHash` SHALL be SHA-256 hash of normalized address text

### Requirement 13: Adres Kaynak ve Kanıt İlişkisi

**User Story:** As a avukat, I want every address to have a traceable source, so that I can verify where the address came from during audits.

#### Acceptance Criteria

1. THE DebtorAddress model SHALL have mandatory `evidenceRef` field
2. THE `evidenceRef` SHALL contain one of: `documentId`, `communicationId`, or `uyapQueryId`
3. THE System SHALL NOT allow address creation without valid `evidenceRef`
4. THE System SHALL store `evidenceType` enum: `DOCUMENT`, `COMMUNICATION`, `UYAP_QUERY`
5. WHEN displaying address details, THE System SHALL show source document/message link

### Requirement 14: Response Correlation (Cevap Eşleştirme)

**User Story:** As a sistem, I want to correctly match client responses to the right task, so that the correct case and debtor are updated.

#### Acceptance Criteria

1. WHEN sending address request message, THE System SHALL include `correlationId` (task_id) in message
2. FOR email messages, THE `correlationId` SHALL be included in subject line as token: `[REF:task_id]`
3. FOR WhatsApp messages, THE `correlationId` SHALL be included as short code in message body
4. WHEN client response is received, THE System SHALL extract `correlationId` from message
5. IF `correlationId` cannot be extracted, THE System SHALL attempt fuzzy matching by client + recent tasks
6. THE System SHALL log correlation success/failure in audit log

### Requirement 15: SLA Hesaplama Kuralları

**User Story:** As a avukat, I want clear SLA rules, so that I know exactly when reminders will be sent.

#### Acceptance Criteria

1. THE SLA duration "3 gün" SHALL mean 72 calendar hours (not business days)
2. THE `dueAt` calculation SHALL be: `sentAt + 72 hours`
3. THE SLA check job SHALL run every hour
4. WHEN `now > dueAt` AND no response received, THE System SHALL trigger reminder
5. THE System SHALL NOT send reminders between 22:00-08:00 local time (queue for morning)
6. THE System SHALL respect Turkish public holidays for manual task due dates only

### Requirement 16: Manuel Görev Tanımı (3. Deneme Sonrası)

**User Story:** As a avukat, I want clear manual task definitions, so that I know exactly what action to take.

#### Acceptance Criteria

1. WHEN `attemptCount >= 3` AND no response, THE System SHALL create `ASSIGN_MANUAL_CALL_CLIENT` task
2. THE manual task SHALL be assigned to case responsible (sorumlu avukat)
3. THE manual task title SHALL be: "Müvekkili telefonla arayın - adres bilgisi bekleniyor"
4. THE manual task description SHALL include: client name, phone number, debtor name, file reference
5. THE manual task `dueAt` SHALL be `now + 1 business day`
6. THE manual task SHALL be closeable with reasons: `CLIENT_RESPONDED`, `CONTACT_UPDATED`, `CLIENT_UNREACHABLE`, `OTHER`
7. WHEN manual task is closed with `CLIENT_RESPONDED`, THE System SHALL prompt for address entry

### Requirement 17: Dosya Kapanışında Görev Yönetimi

**User Story:** As a sistem, I want tasks to be properly handled when a case is closed, so that no orphan tasks remain.

#### Acceptance Criteria

1. WHEN case status changes to `HITAM`, `INFAZ`, `MUVEKKILE_IADE`, `ACIZ`, `BATAK`, `FERAGAT`, or `SULH`, THE System SHALL mark case as closed
2. WHEN case is closed, THE System SHALL cancel all `PENDING` and `WAITING_EXTERNAL` address tasks
3. WHEN case is closed, THE System SHALL cancel all `CLIENT_ANNUAL_ADDRESS_REFRESH` tasks
4. THE cancelled tasks SHALL have `cancellationReason = CASE_CLOSED`
5. THE audit log SHALL record all cancelled tasks with case closure reference
6. THE System SHALL NOT delete any task or address records (soft delete / status change only)

### Requirement 18: Yetki ve KVKK Uyumu

**User Story:** As a sistem, I want to protect personal data in addresses, so that KVKK compliance is maintained.

#### Acceptance Criteria

1. THE address data SHALL only be visible to case team members (lawyers, staff assigned to case)
2. THE System SHALL NOT allow address export without explicit permission
3. WHEN exporting address data, THE System SHALL log export action with user and timestamp
4. THE address display SHALL mask middle characters for non-team viewers: "Atatürk Cad. No:*** ..."
5. THE audit log SHALL NOT contain full address text, only address ID references
6. THE System SHALL support "right to be forgotten" by anonymizing address data on request

### Requirement 19: Adres Öncelik ve Seçim Mantığı

**User Story:** As a avukat, I want the system to suggest the best address for service of process, so that I can make informed decisions.

#### Acceptance Criteria

1. THE DebtorAddress model SHALL have `priorityScore` field (0-100)
2. THE System SHALL calculate priority based on source: MERNIS=90, CLIENT_VERIFIED=80, DOCUMENT=60, UNVERIFIED=40
3. THE System SHALL have `isCurrentCandidate` boolean flag for "tebligata yarar" addresses
4. WHEN multiple addresses exist, THE System SHALL sort by `priorityScore` descending
5. THE System SHALL mark address as `isCurrentCandidate = false` if service failed at that address
6. THE UI SHALL highlight recommended address with highest priority

### Requirement 20: Operasyonel Gözlem ve Metrikler

**User Story:** As a sistem yöneticisi, I want to monitor task system health, so that I can identify and fix issues quickly.

#### Acceptance Criteria

1. THE System SHALL log every task state transition to audit log
2. THE System SHALL track metrics: tasks_created_count, tasks_completed_count, tasks_failed_count
3. THE System SHALL track metrics: reminders_sent_count, manual_escalations_count
4. THE System SHALL track metrics: addresses_found_count, addresses_found_rate (percentage)
5. THE System SHALL expose metrics endpoint for monitoring dashboard
6. THE System SHALL alert when: reminder failure rate > 10%, manual escalation rate > 30%

### Requirement 21: Hata Kodları ve Failure Reasons

**User Story:** As a avukat, I want clear error messages, so that I understand why a task failed.

#### Acceptance Criteria

1. THE System SHALL use standardized failure reason enum for task failures
2. THE failure reasons SHALL include: `UYAP_UNAVAILABLE`, `NO_CONTACT_INFO`, `CLIENT_NO_RESPONSE`, `EMAIL_BOUNCE`, `WHATSAPP_UNDELIVERED`, `INVALID_ADDRESS`, `SYSTEM_ERROR`
3. WHEN task fails, THE System SHALL store `failureReason` and `failureDetails`
4. THE UI SHALL display human-readable failure message based on failure reason
5. THE System SHALL suggest remediation action for each failure type

### Requirement 22: Veri Saklama ve Pasifleştirme

**User Story:** As a sistem, I want to preserve historical address data, so that audit trail is maintained.

#### Acceptance Criteria

1. THE System SHALL NOT delete address records, only mark as `isCurrent = false`
2. WHEN new address is added for same location, THE old address SHALL be marked `isCurrent = false`
3. THE System SHALL preserve all audit log entries indefinitely
4. THE address history SHALL be viewable in UI with timeline view
5. THE System SHALL support data anonymization for KVKK compliance without deletion

### Requirement 11: Tekillik ve Idempotency

**User Story:** As a sistem, I want to prevent duplicate tasks from being created, so that the same work is not done twice.

#### Acceptance Criteria

1. EVERY task SHALL have a `dedupe_key` field composed of `{taskType}:{scope}` (e.g., `CLIENT_REQUEST_DEBTOR_ADDRESSES:debtor_123`)
2. THE database SHALL enforce unique index on `dedupe_key` for non-terminal task statuses (PENDING, WAITING_EXTERNAL)
3. WHEN an event triggers a task creation AND a task with same `dedupe_key` already exists in non-terminal status, THE System SHALL skip creation and log: "Task zaten mevcut, atlandı"
4. WHEN a task reaches terminal status (DONE, CANCELLED, FAILED), THE `dedupe_key` constraint SHALL allow new task creation
5. THE Audit_Log SHALL record all skipped task creation attempts with reason `DUPLICATE_TASK`

### Requirement 12: Adres Normalizasyonu ve Hash Standardı

**User Story:** As a sistem, I want addresses to be normalized before storage, so that duplicate addresses are correctly identified.

#### Acceptance Criteria

1. THE System SHALL apply `normalizeAddress()` function before storing any address
2. THE normalization SHALL include:
   - Convert to Turkish uppercase (İ→I, Ş→S, Ğ→G, Ü→U, Ö→O, Ç→C)
   - Collapse multiple whitespaces to single space
   - Normalize line breaks to single space
   - Standardize "No:", "NO:", "NO.", "No." to "NO:"
   - Trim leading/trailing whitespace
3. THE System SHALL compute `address_hash` as SHA-256 of normalized address string
4. THE database SHALL store both `raw_address` (original) and `address_hash` (normalized hash)
5. THE unique constraint on `debtor_id + address_hash` SHALL prevent duplicate address records

### Requirement 13: Adres Kanıt İlişkisi (Evidence Reference)

**User Story:** As a avukat, I want to know where each address came from, so that I can verify and audit address sources.

#### Acceptance Criteria

1. EVERY Debtor_Address record SHALL have a non-null `evidence_ref` object
2. THE `evidence_ref` SHALL contain exactly one of:
   - `documentId`: Reference to uploaded document (for DOCUMENT_SCAN source)
   - `communicationId`: Reference to email/whatsapp message (for CLIENT_REPLY sources)
   - `uyapQueryId`: Reference to UYAP query log (for UYAP_MERNIS, UYAP_SGK sources)
3. THE System SHALL NOT allow address creation without valid `evidence_ref`
4. THE UI SHALL display "Kaynak: [document/message/query link]" for each address
5. THE Audit_Log SHALL include `evidence_ref` in all address-related entries

### Requirement 14: Mesaj Korelasyonu (Response Correlation)

**User Story:** As a sistem, I want to match incoming client responses to the correct task, so that the right case is updated.

#### Acceptance Criteria

1. EVERY outgoing message (email/whatsapp) SHALL include a `correlation_id` equal to the task_id
2. FOR email messages, THE `correlation_id` SHALL be embedded in:
   - Subject line as suffix: "[REF:task_123]"
   - Email body as hidden token
3. FOR whatsapp messages, THE `correlation_id` SHALL be embedded as short code in message template
4. WHEN a response is received, THE System SHALL extract `correlation_id` and match to originating task
5. IF `correlation_id` cannot be extracted or matched, THE System SHALL create manual task: "Eşleştirilemeyen müvekkil cevabı - manuel inceleme gerekli"
6. THE Audit_Log SHALL record correlation success/failure for each response

### Requirement 15: SLA Hesaplama Kuralları

**User Story:** As a avukat, I want clear SLA rules, so that I know exactly when tasks are due.

#### Acceptance Criteria

1. ALL SLA durations SHALL be calculated in calendar days (not business days)
2. "3 gün" SLA SHALL mean exactly 72 hours from task creation/last action
3. THE `due_at` timestamp SHALL be calculated as `action_timestamp + (days * 24 * 60 * 60 * 1000)` milliseconds
4. THE System SHALL check SLA compliance every hour via scheduled job
5. WHEN `current_time > due_at`, THE task SHALL be marked as `OVERDUE`
6. THE Task_Panel SHALL display remaining time in human-readable format: "2 gün 5 saat kaldı" or "1 gün gecikmiş"

### Requirement 16: Manuel Görev Tanımı (3. Deneme Sonrası)

**User Story:** As a avukat, I want clear manual task definitions after automated attempts fail, so that I know exactly what to do.

#### Acceptance Criteria

1. WHEN `attempt_count >= 3` for `CLIENT_REQUEST_DEBTOR_ADDRESSES`, THE System SHALL create manual task `MANUAL_CLIENT_FOLLOWUP`
2. THE manual task SHALL be assigned to: case responsible (dosya sorumlusu) if defined, otherwise primary lawyer (avukat)
3. THE manual task description SHALL be: "Müvekkil [müvekkil_adı] ile telefonla iletişime geçin. Borçlu [borçlu_adı] için adres bilgisi 3 kez talep edildi, yanıt alınamadı."
4. THE manual task SHALL have `due_at = now + 1 day`
5. THE manual task SHALL be closeable with one of:
   - `RESOLVED_CLIENT_RESPONDED`: Müvekkil cevapladı
   - `RESOLVED_ADDRESS_UPDATED`: Adres manuel güncellendi
   - `RESOLVED_NO_ADDRESS_AVAILABLE`: Müvekkil adres bilmiyor (yıllık refresh planlanır)
   - `RESOLVED_CLIENT_UNREACHABLE`: Müvekkile ulaşılamıyor
6. THE Audit_Log SHALL record manual task creation and resolution reason

### Requirement 17: Dosya Kapanışında Görev Yönetimi

**User Story:** As a sistem, I want tasks to be properly handled when a case is closed, so that no orphan tasks remain.

#### Acceptance Criteria

1. WHEN case status changes to `CLOSED`, THE System SHALL:
   - Mark all `PENDING` tasks as `CANCELLED` with reason `CASE_CLOSED`
   - Mark all `WAITING_EXTERNAL` tasks as `CANCELLED` with reason `CASE_CLOSED`
   - Cancel all scheduled annual refresh tasks
2. THE System SHALL NOT delete any task records; only status changes
3. THE Audit_Log SHALL record: "Dosya kapatıldı → X görev iptal edildi"
4. THE System SHALL NOT create new tasks for closed cases
5. IF case is reopened (status changes from `CLOSED` to `DERDEST`), THE System SHALL NOT automatically recreate cancelled tasks; manual trigger required

### Requirement 18: Yetki ve KVKK Uyumu

**User Story:** As a avukat, I want address data to be protected according to KVKK, so that personal data is secure.

#### Acceptance Criteria

1. THE System SHALL implement role-based access control for address data:
   - `CASE_TEAM`: Can view/edit addresses for assigned cases only
   - `LAWYER`: Can view/edit addresses for all cases in their office
   - `ADMIN`: Full access
2. THE UI SHALL only display addresses to users with appropriate role for that case
3. THE export functionality SHALL mask sensitive data: TC number shown as "***[last 4 digits]"
4. THE Audit_Log SHALL record all address view/edit/export actions with user_id
5. THE System SHALL NOT include full addresses in email notifications; only "Yeni adres eklendi" type summaries

### Requirement 19: Adres Önceliklendirme (Priority Score)

**User Story:** As a avukat, I want addresses to be prioritized, so that I can choose the best address for service of process.

#### Acceptance Criteria

1. EVERY Debtor_Address SHALL have a `priority_score` field (1-100)
2. THE priority calculation SHALL follow these rules:
   - MERNIS_RESIDENCE: base score 90
   - DECLARED_CLIENT with client confirmation: base score 80
   - DECLARED_DOCUMENT: base score 60
   - SGK_ADDRESS: base score 50
   - TICARET_SICIL: base score 40
3. THE score SHALL be modified by:
   - +10 if retrieved within last 30 days
   - -20 if older than 1 year
   - +5 if confidence = HIGH
   - -10 if confidence = LOW
4. THE System SHALL flag `is_current_candidate = true` for address with highest priority_score per debtor
5. THE UI SHALL display addresses sorted by `priority_score` descending
6. THE UI SHALL highlight `is_current_candidate` address with visual indicator

### Requirement 20: Operasyonel Gözlem (Audit ve Metrikler)

**User Story:** As a sistem yöneticisi, I want to monitor system health and performance, so that I can ensure the system is working correctly.

#### Acceptance Criteria

1. EVERY state transition SHALL be recorded in Audit_Log with:
   - `timestamp`, `entity_type`, `entity_id`, `action`, `old_state`, `new_state`, `user_id`, `metadata`
2. THE System SHALL track and expose these metrics:
   - `tasks_created_total`: Total tasks created (by type)
   - `tasks_completed_total`: Total tasks completed (by type, by resolution)
   - `reminders_sent_total`: Total reminders sent
   - `manual_escalations_total`: Total manual escalations created
   - `addresses_found_total`: Total addresses found (by source)
   - `address_found_rate`: Percentage of debtors with at least one address
   - `avg_response_time_hours`: Average time from request to client response
3. THE System SHALL provide a dashboard endpoint `/api/metrics/address-tasks` returning current metric values
4. THE Audit_Log SHALL be queryable by: date range, entity_type, action, user_id
5. THE System SHALL retain Audit_Log entries for minimum 7 years (KVKK compliance)


### Requirement 23: Task Bypass - Müvekkil Teyitli Adres

**User Story:** As a avukat, I want to mark addresses as "client confirmed" during case creation, so that unnecessary address request emails are not sent.

#### Acceptance Criteria

1. THE Debtor creation UI SHALL include checkbox: "Bu adres(ler) müvekkilden alındı (teyitli)"
2. WHEN checkbox is checked, THE System SHALL set `addressCategory = DECLARED_CLIENT` and `sourceDetail = CLIENT_CONFIRMED_UI`
3. WHEN checkbox is checked, THE System SHALL set `confidenceLevel = MEDIUM_HIGH`
4. THE UI SHALL display info message: "Müvekkile adres talebi gönderilmeyecek"
5. WHEN checkbox is NOT checked, THE System SHALL proceed with normal address request workflow

### Requirement 24: Task Bypass Rules - Client Confirmed

**User Story:** As a sistem, I want to skip address request tasks when addresses are already confirmed by client, so that clients are not spammed.

#### Acceptance Criteria

1. WHEN event `DEBTOR_ADDRESSES_UPSERTED` occurs with `client_confirmed = true`, THE System SHALL check for "useful addresses"
2. IF debtor has at least 1 address with `addressCategory IN (DECLARED_CLIENT, DECLARED_DOCUMENT)`, THE System SHALL:
   - NOT create `CLIENT_CONTACT_VALIDATE` task
   - NOT create `CLIENT_REQUEST_DEBTOR_ADDRESSES` task
   - Log: "Borçlu adresleri müvekkil teyidi ile kaydedildi → otomatik talep tetiklenmedi"
3. IF debtor has NO useful addresses AND `client_confirmed = false`, THE System SHALL proceed with normal workflow
4. THE Audit_Log SHALL record bypass decision with reason

### Requirement 25: Task Auto-Completion - Addresses Received

**User Story:** As a sistem, I want to automatically complete address request tasks when addresses are received, so that the task panel stays clean.

#### Acceptance Criteria

1. WHEN event `ADDRESSES_RECEIVED` occurs (from CLIENT_REPLY or CLIENT_CONFIRMED_UI), THE System SHALL:
   - Find open `CLIENT_REQUEST_DEBTOR_ADDRESSES` task for that debtor
   - Set task status = `DONE` with `resultType = POSITIVE` and `doneReason = ADDRESSES_RECEIVED`
   - Cancel any open `CLIENT_REMIND_DEBTOR_ADDRESSES` tasks
2. THE Audit_Log SHALL record: "Müvekkilden adres talebi görevi, adresler eklendiği için otomatik tamamlandı"
3. THE Notes_Panel SHALL display: "Adres bilgileri alındı - görev otomatik tamamlandı"

### Requirement 26: Task Auto-Completion - Operator Confirmation

**User Story:** As a avukat, I want to manually mark "addresses already received" to close pending tasks, so that I can clean up the task panel.

#### Acceptance Criteria

1. THE Task_Panel SHALL include "Zaten aldık" button for `CLIENT_REQUEST_DEBTOR_ADDRESSES` tasks
2. WHEN "Zaten aldık" button is clicked, THE System SHALL:
   - Set task status = `DONE` with `resultType = POSITIVE` and `doneReason = CONFIRMED_BY_OPERATOR`
   - Cancel any open reminder tasks for that debtor
3. THE System SHALL prompt user to enter/confirm addresses if not already present
4. THE Audit_Log SHALL record: "Görev operatör tarafından tamamlandı - adresler zaten alınmış"

### Requirement 27: Useful Address Definition

**User Story:** As a sistem, I want a clear definition of "useful address", so that bypass rules are applied consistently.

#### Acceptance Criteria

1. AN address SHALL be considered "useful" if:
   - `addressCategory IN (DECLARED_CLIENT, DECLARED_DOCUMENT, MERNIS_RESIDENCE)` AND
   - `isCurrent = true` AND
   - `confidenceLevel IN (MEDIUM, MEDIUM_HIGH, HIGH)`
2. A debtor SHALL be considered "has useful addresses" if at least 1 useful address exists
3. THE System SHALL use this definition for all bypass and auto-completion rules
4. THE UI SHALL display "Yararlı adres var" indicator on debtor cards

### Requirement 28: Address Intake Mode Flag

**User Story:** As a sistem, I want to track how debtor addresses were initially obtained, so that appropriate workflows are triggered.

#### Acceptance Criteria

1. THE Debtor model SHALL have `addressIntakeMode` field with values:
   - `CLIENT_CONFIRMED`: Addresses confirmed by client at creation
   - `UNKNOWN`: Address source unknown, needs verification
   - `NEEDS_CLIENT_REQUEST`: No addresses, client request needed
2. WHEN debtor is created with addresses AND checkbox is checked, THE System SHALL set `addressIntakeMode = CLIENT_CONFIRMED`
3. WHEN debtor is created without addresses, THE System SHALL set `addressIntakeMode = NEEDS_CLIENT_REQUEST`
4. WHEN debtor is created with addresses AND checkbox is NOT checked, THE System SHALL set `addressIntakeMode = UNKNOWN`
5. THE TaskEngine SHALL use `addressIntakeMode` to determine workflow path
