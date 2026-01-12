# Design Document: Borçlu Adres Görev Sistemi

## Overview

Bu sistem, borçlu adreslerinin çeşitli kaynaklardan (evrak, müvekkil, UYAP) toplanması, eksikliklerin tespiti ve otomatik görev/hatırlatma mekanizması ile avukatların yönlendirilmesini sağlar. Event-driven mimari ile tetiklenen görevler, SLA tabanlı hatırlatmalar ve audit log entegrasyonu içerir.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EVENT BUS                                 │
│  (EVIDENCE_UPLOADED, DEBTOR_CREATED, CASE_STATUS_CHANGED, ...)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      TASK ENGINE                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Event       │  │ Task        │  │ SLA         │              │
│  │ Listener    │──│ Creator     │──│ Monitor     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────────────────────────────────────────┐            │
│  │              TASK REPOSITORY                     │            │
│  │  (AddressTask, status, due_at, attempt_count)   │            │
│  └─────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Communication   │ │ Address         │ │ Audit Log       │
│ Service         │ │ Service         │ │ Service         │
│ (Email/WA)      │ │ (CRUD)          │ │ (Notes)         │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Components and Interfaces

### 1. AddressTask Model (Prisma)

```prisma
model AddressTask {
  id        String   @id @default(cuid())
  tenantId  String
  caseId    String
  debtorId  String
  
  // Task Type
  taskType  AddressTaskType
  
  // Status & SLA
  status       AddressTaskStatus @default(PENDING)
  dueAt        DateTime?
  attemptCount Int               @default(0)
  maxAttempts  Int               @default(3)
  
  // Assignment
  assignedToId String?
  assignedTo   User?   @relation(fields: [assignedToId], references: [id])
  
  // Communication
  channelUsed  String?  // EMAIL, WHATSAPP, BOTH
  messageId    String?  // İlgili iletişim kaydı
  
  // Result
  resultType   String?  // POSITIVE, NEGATIVE, NO_RESPONSE
  resultData   Json?    // Gelen adresler vb.
  
  // Scheduling (Annual refresh için)
  nextRunAt    DateTime?
  lastRunAt    DateTime?
  
  // Meta
  notes        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  completedAt  DateTime?
  
  // Relations
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  case         Case     @relation(fields: [caseId], references: [id])
  debtor       Debtor   @relation(fields: [debtorId], references: [id])
  
  @@index([tenantId])
  @@index([caseId])
  @@index([debtorId])
  @@index([status])
  @@index([taskType])
  @@index([dueAt])
}

enum AddressTaskType {
  DOC_EXTRACT_DEBTOR_ADDRESSES    // Evraktan adres çıkarma
  CLIENT_CONTACT_VALIDATE         // Müvekkil iletişim doğrulama
  CLIENT_REQUEST_DEBTOR_ADDRESSES // Müvekkile adres talebi
  CLIENT_REMIND_DEBTOR_ADDRESSES  // Hatırlatma
  CLIENT_ANNUAL_ADDRESS_REFRESH   // Yıllık tekrar
  ASSIGN_MANUAL_CALL_CLIENT       // Manuel arama görevi
  UYAP_PULL_MERNIS               // MERNİS sorgusu (sonraki faz)
}

enum AddressTaskStatus {
  PENDING           // Bekliyor
  IN_PROGRESS       // İşleniyor
  WAITING_EXTERNAL  // Dış cevap bekleniyor
  DONE              // Tamamlandı
  FAILED            // Başarısız
  CANCELLED         // İptal
}
```

### 2. Extended DebtorAddress Fields

```prisma
// Mevcut DebtorAddress modeline eklenecek alanlar
model DebtorAddress {
  // ... mevcut alanlar ...
  
  // Yeni alanlar
  addressCategory  AddressCategory  @default(DECLARED_DOCUMENT)
  sourceDetail     AddressSourceDetail?
  evidenceId       String?          // Kaynak evrak/mesaj ID
  confidenceLevel  ConfidenceLevel  @default(MEDIUM)
  addressHash      String?          // Tekrar kontrolü için normalize hash
  
  @@unique([debtorId, addressHash]) // Tekrar engelleme
}

enum AddressCategory {
  DECLARED_DOCUMENT  // Borç evrakından
  DECLARED_CLIENT    // Müvekkilden
  MERNIS_RESIDENCE   // MERNİS
  SGK_ADDRESS        // SGK
  TICARET_SICIL      // Ticaret Sicili
}

enum AddressSourceDetail {
  DOCUMENT_SCAN       // OCR/AI tarama
  MANUAL_ENTRY        // Manuel giriş
  CLIENT_REPLY_EMAIL  // Müvekkil email cevabı
  CLIENT_REPLY_WHATSAPP // Müvekkil WhatsApp cevabı
  UYAP_MERNIS         // UYAP MERNİS sorgusu
  UYAP_SGK            // UYAP SGK sorgusu
}

enum ConfidenceLevel {
  LOW     // Düşük güven
  MEDIUM  // Orta güven
  HIGH    // Yüksek güven
}
```

### 3. TaskEngine Service Interface

```typescript
interface ITaskEngine {
  // Event handlers
  onEvidenceUploaded(evidenceId: string, debtorId: string): Promise<void>;
  onDebtorCreated(debtorId: string, debtorType: DebtorType): Promise<void>;
  onCaseStatusChanged(caseId: string, newStatus: string): Promise<void>;
  onClientResponseReceived(taskId: string, response: ClientResponse): Promise<void>;
  
  // Task operations
  createTask(params: CreateTaskParams): Promise<AddressTask>;
  updateTaskStatus(taskId: string, status: AddressTaskStatus): Promise<void>;
  completeTask(taskId: string, result: TaskResult): Promise<void>;
  cancelTask(taskId: string, reason: string): Promise<void>;
  
  // SLA operations
  checkOverdueTasks(): Promise<AddressTask[]>;
  processReminders(): Promise<void>;
  
  // Query
  getPendingTasksForCase(caseId: string): Promise<AddressTask[]>;
  getTasksByDebtor(debtorId: string): Promise<AddressTask[]>;
}
```

### 4. Communication Service Interface

```typescript
interface ICommunicationService {
  sendAddressRequest(params: {
    clientId: string;
    debtorId: string;
    caseId: string;
    channels: ('EMAIL' | 'WHATSAPP')[];
  }): Promise<{ messageIds: string[]; channelsUsed: string[] }>;
  
  sendReminder(params: {
    clientId: string;
    taskId: string;
    attemptNumber: number;
    channels: ('EMAIL' | 'WHATSAPP')[];
  }): Promise<{ messageIds: string[] }>;
  
  getClientContactChannels(clientId: string): Promise<{
    hasEmail: boolean;
    hasWhatsapp: boolean;
    email?: string;
    whatsapp?: string;
  }>;
}
```

### 5. AuditLog Service Interface

```typescript
interface IAuditLogService {
  logAddressAction(params: {
    caseId: string;
    debtorId: string;
    action: AddressAuditAction;
    details: Record<string, any>;
    showInNotes: boolean;
  }): Promise<void>;
}

enum AddressAuditAction {
  ADDRESS_EXTRACTED_FROM_DOCUMENT = 'ADDRESS_EXTRACTED_FROM_DOCUMENT',
  ADDRESS_REQUEST_SENT = 'ADDRESS_REQUEST_SENT',
  REMINDER_SENT = 'REMINDER_SENT',
  CLIENT_RESPONDED_POSITIVE = 'CLIENT_RESPONDED_POSITIVE',
  CLIENT_RESPONDED_NEGATIVE = 'CLIENT_RESPONDED_NEGATIVE',
  ANNUAL_REFRESH_SCHEDULED = 'ANNUAL_REFRESH_SCHEDULED',
  MANUAL_TASK_CREATED = 'MANUAL_TASK_CREATED',
}
```

## Data Models

### Task State Machine

```
                    ┌──────────────┐
                    │   PENDING    │
                    └──────┬───────┘
                           │ start processing
                           ▼
                    ┌──────────────┐
                    │ IN_PROGRESS  │
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │     DONE     │ │   FAILED     │ │  WAITING_    │
    └──────────────┘ └──────────────┘ │  EXTERNAL    │
                                      └──────┬───────┘
                                             │
                           ┌─────────────────┼─────────────────┐
                           │                 │                 │
                           ▼                 ▼                 ▼
                    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                    │     DONE     │  │   FAILED     │  │  CANCELLED   │
                    │  (response)  │  │ (max retry)  │  │ (case closed)│
                    └──────────────┘  └──────────────┘  └──────────────┘
```

### Event-Task Mapping Table

| Event | Condition | Task Created | Notes |
|-------|-----------|--------------|-------|
| EVIDENCE_UPLOADED | Has address fields | DOC_EXTRACT_DEBTOR_ADDRESSES | Evraktan adres çıkar |
| DEBTOR_CREATED | type=INDIVIDUAL | CLIENT_CONTACT_VALIDATE | İletişim kontrolü |
| CLIENT_CONTACT_VALIDATE.DONE | Has contact | CLIENT_REQUEST_DEBTOR_ADDRESSES | Talep gönder |
| CLIENT_CONTACT_VALIDATE.DONE | No contact | ASSIGN_MANUAL_CALL_CLIENT | Manuel görev |
| DOC_EXTRACT.DONE | Always | CLIENT_REQUEST_DEBTOR_ADDRESSES | Teyit için |
| SLA_EXPIRED | WAITING_EXTERNAL | CLIENT_REMIND_DEBTOR_ADDRESSES | Hatırlatma |
| attempt_count >= 3 | No response | ASSIGN_MANUAL_CALL_CLIENT | Eskale et |
| CLIENT_RESPONSE | Negative | CLIENT_ANNUAL_ADDRESS_REFRESH | Yıllık plan |
| CASE_STATUS_CHANGED | != DERDEST | Cancel annual tasks | Temizlik |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Address Model Field Completeness
*For any* DebtorAddress record created through the system, it SHALL have valid `addressCategory`, `sourceDetail`, `retrievedAt`, and `confidenceLevel` fields set.
**Validates: Requirements 1.1, 1.2, 1.4, 1.5**

### Property 2: Address Deduplication
*For any* two addresses with the same normalized hash for the same debtor, only one record SHALL exist in the database, with the most recent `retrievedAt` timestamp.
**Validates: Requirements 1.6**

### Property 3: Document Upload Triggers Task
*For any* evidence upload event containing address fields, a `DOC_EXTRACT_DEBTOR_ADDRESSES` task SHALL be created within the same transaction.
**Validates: Requirements 2.1, 10.1**

### Property 4: Individual Debtor Triggers Contact Validation
*For any* debtor creation event where `debtorType = INDIVIDUAL`, a `CLIENT_CONTACT_VALIDATE` task SHALL be created.
**Validates: Requirements 3.1, 10.2**

### Property 5: Contact Validation Blocking
*For any* case where `CLIENT_CONTACT_VALIDATE` task exists and is not `DONE`, no `CLIENT_REQUEST_DEBTOR_ADDRESSES` task SHALL be created.
**Validates: Requirements 3.5**

### Property 6: Channel Selection Logic
*For any* `CLIENT_REQUEST_DEBTOR_ADDRESSES` task execution:
- If client has only email → channelUsed = 'EMAIL'
- If client has only whatsapp → channelUsed = 'WHATSAPP'  
- If client has both → channelUsed = 'BOTH'
**Validates: Requirements 4.2, 4.3, 4.4**

### Property 7: SLA Reminder Mechanism
*For any* task in `WAITING_EXTERNAL` status where `dueAt < now` and `attemptCount < maxAttempts`, a reminder SHALL be sent and `attemptCount` SHALL be incremented by 1 and `dueAt` SHALL be set to `now + 3 days`.
**Validates: Requirements 5.1, 5.2**

### Property 8: Escalation After Max Attempts
*For any* task where `attemptCount >= maxAttempts` and no response received, a `ASSIGN_MANUAL_CALL_CLIENT` task SHALL be created for the case responsible.
**Validates: Requirements 5.4**

### Property 9: Positive Response Creates Addresses
*For any* positive client response containing addresses, `DebtorAddress` records SHALL be created with `addressCategory = DECLARED_CLIENT` and `evidenceId` set to the message ID.
**Validates: Requirements 6.1, 6.2, 6.3**

### Property 10: Negative Response Schedules Annual Refresh
*For any* negative client response where case status is `DERDEST`, a `CLIENT_ANNUAL_ADDRESS_REFRESH` task SHALL be created with `nextRunAt = now + 365 days`.
**Validates: Requirements 7.2**

### Property 11: Case Closure Cancels Annual Tasks
*For any* case status change from `DERDEST` to another status, all pending `CLIENT_ANNUAL_ADDRESS_REFRESH` tasks for that case SHALL be cancelled.
**Validates: Requirements 7.6, 10.5**

### Property 12: Audit Log Completeness
*For any* address-related action (extraction, request sent, reminder, response), an audit log entry SHALL be created with the action type and relevant details.
**Validates: Requirements 2.5, 4.7, 5.3, 6.5, 7.3**

## Error Handling

### Communication Failures
- Email/WhatsApp gönderim hatası → Task `FAILED` durumuna geçer, retry mekanizması devreye girer
- 3 başarısız deneme sonrası manuel görev oluşturulur

### Database Errors
- Transaction rollback ile tutarlılık sağlanır
- Audit log her zaman yazılır (ayrı transaction)

### External Service Timeouts
- UYAP/MERNİS sorguları için timeout: 30 saniye
- Timeout sonrası task `PENDING` kalır, sonraki cron'da tekrar denenir

## Testing Strategy

### Unit Tests
- TaskEngine service methods
- Channel selection logic
- SLA calculation
- Address hash normalization

### Property-Based Tests (fast-check)
- Address deduplication property
- Channel selection property
- SLA reminder mechanism property
- Task state transitions

### Integration Tests
- Event → Task creation flow
- Communication service integration
- Audit log creation

### Test Configuration
- Minimum 100 iterations per property test
- Mock external services (email, whatsapp, UYAP)
- In-memory database for fast tests
