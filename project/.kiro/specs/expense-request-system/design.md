# Design Document: Expense Request System

## Overview

Bu tasarım, icra takiplerinde masraf taleplerinin otomatik oluşturulması, 3 farklı görünümde (Yapılacaklar, Finans, Müvekkil Talepleri) yönetilmesi ve ödeme kontrolü ile UYAP gate mekanizmasını tanımlar.

Mevcut `ExpenseRequest` ve `ExpenseRequestItem` modelleri kullanılacak, eksik alanlar eklenecek ve yeni servisler oluşturulacaktır.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXPENSE REQUEST SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   TRIGGER    │    │   SERVICE    │    │    VIEWS     │          │
│  │              │    │              │    │              │          │
│  │ Case Created │───▶│ ExpenseReq   │───▶│ Tasks Panel  │          │
│  │ Stage Change │    │ Service      │    │ Finance Panel│          │
│  │ Manual       │    │              │    │ Client Panel │          │
│  └──────────────┘    └──────┬───────┘    └──────────────┘          │
│                             │                                        │
│                             ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      EXPENSE REQUEST                          │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │  │
│  │  │ PENDING │─▶│ PARTIAL │─▶│  PAID   │  │CANCELLED│         │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                             │                                        │
│                             ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                       GATE SYSTEM                             │  │
│  │  BLOCKING expense unpaid? ──▶ UYAP actions LOCKED            │  │
│  │  All BLOCKING paid?       ──▶ UYAP actions UNLOCKED          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ExpenseRequestService

```typescript
interface ExpenseRequestService {
  // Otomatik masraf seti oluşturma
  createOpeningExpenseSet(caseId: string, tenantId: string): Promise<ExpenseRequest>;
  createStageExpenseSet(caseId: string, stageCode: string, tenantId: string): Promise<ExpenseRequest>;
  
  // Manuel masraf talebi
  createManualExpenseRequest(params: CreateExpenseParams): Promise<ExpenseRequest>;
  
  // Kalem yönetimi
  addExpenseItem(requestId: string, item: ExpenseItemInput): Promise<ExpenseRequestItem>;
  updateExpenseItem(itemId: string, updates: Partial<ExpenseItemInput>): Promise<ExpenseRequestItem>;
  removeExpenseItem(itemId: string): Promise<void>;
  
  // Durum yönetimi
  finalizeAndSend(requestId: string): Promise<ExpenseRequest>;
  recordPayment(requestId: string, payment: PaymentInput): Promise<ExpenseRequest>;
  cancelRequest(requestId: string, reason: string): Promise<ExpenseRequest>;
  
  // Sorgular
  getExpenseRequestsForCase(caseId: string): Promise<ExpenseRequest[]>;
  getPendingExpenseRequests(tenantId: string): Promise<ExpenseRequest[]>;
  getExpenseSummaryForCase(caseId: string): Promise<ExpenseSummary>;
  
  // Gate kontrolü
  checkExpenseGate(caseId: string): Promise<GateStatus>;
  isUyapBlocked(caseId: string): Promise<boolean>;
}
```

### 2. ExpenseCalculatorService

```typescript
interface ExpenseCalculatorService {
  // Tarife bazlı hesaplama
  calculateOpeningExpenses(caseData: CaseData): Promise<ExpenseItemCalculation[]>;
  calculateStageExpenses(stageCode: string, caseData: CaseData): Promise<ExpenseItemCalculation[]>;
  
  // Tek kalem hesaplama
  calculateBasvurmaHarci(principalAmount: Decimal): Decimal;
  calculatePesinHarc(principalAmount: Decimal): Decimal;
  calculateVekaletHarci(): Decimal;
  calculateTebligatGideri(count: number): Decimal;
  calculateDosyaGideri(): Decimal;
  calculateVekaletPulu(): Decimal;
}
```

### 3. ExpenseGateService

```typescript
interface ExpenseGateService {
  // Gate kontrolü
  checkGate(caseId: string): Promise<GateCheckResult>;
  
  // UYAP işlem izni
  canPerformUyapAction(caseId: string, actionType: string): Promise<boolean>;
  
  // Gate durumu güncelleme
  updateGateStatus(caseId: string): Promise<void>;
}

interface GateCheckResult {
  isBlocked: boolean;
  blockingExpenses: ExpenseRequest[];
  totalPending: Decimal;
  message?: string;
}
```

### 4. ExpenseNotificationService

```typescript
interface ExpenseNotificationService {
  // Bildirim gönderme
  sendExpenseRequest(requestId: string): Promise<void>;
  sendReminder(requestId: string): Promise<void>;
  
  // E-posta şablonu
  renderExpenseEmail(request: ExpenseRequest): Promise<EmailContent>;
}
```

## Data Models

### Schema Güncellemeleri

```prisma
// Mevcut ExpenseRequest modeline eklenecek alanlar
model ExpenseRequest {
  // ... mevcut alanlar ...
  
  // YENİ: Gate tipi
  gateType ExpenseGateType @default(BLOCKING)
  
  // YENİ: Aşama kodu (hangi aşamada oluşturuldu)
  stageCode String? // OPENING, RE_NOTIFICATION, SEIZURE, SALE
  
  // YENİ: Kısmi ödeme takibi
  paidTotal Decimal @default(0) @db.Decimal(15, 2)
  
  // YENİ: İlişkili görev
  taskId String? // AddressTask veya genel Task ID
  
  // YENİ: Audit log
  auditLogs ExpenseAuditLog[]
  
  // YENİ: Ödeme kayıtları
  payments ExpensePayment[]
}

enum ExpenseGateType {
  BLOCKING     // Ödenmeden UYAP kilitli
  NON_BLOCKING // Ödenmese de devam edilebilir
}

// Yeni model: Ödeme kayıtları
model ExpensePayment {
  id               String         @id @default(cuid())
  expenseRequestId String
  expenseRequest   ExpenseRequest @relation(fields: [expenseRequestId], references: [id], onDelete: Cascade)
  
  amount      Decimal  @db.Decimal(15, 2)
  paymentDate DateTime
  method      String   // BANK_TRANSFER, CASH, VIRTUAL_POS
  reference   String?  // Dekont no, referans kodu
  notes       String?
  
  // Eşleştirme bilgisi
  matchedBy   String?  // AUTO, MANUAL
  matchedById String?  // Eşleştiren kullanıcı
  
  createdAt DateTime @default(now())
  
  @@index([expenseRequestId])
}

// Yeni model: Audit log
model ExpenseAuditLog {
  id               String         @id @default(cuid())
  expenseRequestId String
  expenseRequest   ExpenseRequest @relation(fields: [expenseRequestId], references: [id], onDelete: Cascade)
  
  action    String   // CREATED, ITEM_ADDED, ITEM_UPDATED, SENT, PAYMENT_RECORDED, STATUS_CHANGED
  details   Json?
  userId    String?
  
  createdAt DateTime @default(now())
  
  @@index([expenseRequestId])
  @@index([action])
}
```

### Masraf Kalemi Kodları

```typescript
enum ExpenseItemCode {
  // Açılış Masrafları
  BASVURMA_HARCI = 'BASVURMA_HARCI',
  PESIN_HARC = 'PESIN_HARC',
  VEKALET_HARCI = 'VEKALET_HARCI',
  TEBLIGAT_GIDERI = 'TEBLIGAT_GIDERI',
  DOSYA_GIDERI = 'DOSYA_GIDERI',
  VEKALET_PULU = 'VEKALET_PULU',
  
  // İkinci Dalga
  YENIDEN_TEBLIGAT = 'YENIDEN_TEBLIGAT',
  ILAN_GIDERI = 'ILAN_GIDERI',
  HACIZ_MASRAFI = 'HACIZ_MASRAFI',
  SATIS_GIDERI = 'SATIS_GIDERI',
  BILIRKISI_UCRETI = 'BILIRKISI_UCRETI',
  
  // Diğer
  DIGER = 'DIGER',
}
```

### Masraf Seti Şablonları

```typescript
const EXPENSE_SET_TEMPLATES = {
  OPENING: {
    code: 'OPENING',
    name: 'Takip Açılış Masrafları',
    items: [
      { code: 'BASVURMA_HARCI', label: 'Başvurma Harcı', calculator: 'calculateBasvurmaHarci' },
      { code: 'PESIN_HARC', label: 'Peşin Harç', calculator: 'calculatePesinHarc' },
      { code: 'VEKALET_HARCI', label: 'Vekalet Harcı', calculator: 'calculateVekaletHarci' },
      { code: 'TEBLIGAT_GIDERI', label: 'Tebligat Gideri', calculator: 'calculateTebligatGideri', params: { count: 1 } },
      { code: 'DOSYA_GIDERI', label: 'Dosya Gideri', calculator: 'calculateDosyaGideri' },
      { code: 'VEKALET_PULU', label: 'Vekalet Pulu', calculator: 'calculateVekaletPulu' },
    ],
    gateType: 'BLOCKING',
  },
  RE_NOTIFICATION: {
    code: 'RE_NOTIFICATION',
    name: 'Yeniden Tebligat Masrafları',
    items: [
      { code: 'YENIDEN_TEBLIGAT', label: 'Yeniden Tebligat Gideri', calculator: 'calculateTebligatGideri', params: { count: 1 } },
    ],
    gateType: 'BLOCKING',
  },
  SEIZURE: {
    code: 'SEIZURE',
    name: 'Haciz Masrafları',
    items: [
      { code: 'HACIZ_MASRAFI', label: 'Haciz Masrafı', calculator: 'calculateHacizMasrafi' },
    ],
    gateType: 'BLOCKING',
  },
  SALE: {
    code: 'SALE',
    name: 'Satış Masrafları',
    items: [
      { code: 'ILAN_GIDERI', label: 'İlan Gideri', calculator: 'calculateIlanGideri' },
      { code: 'SATIS_GIDERI', label: 'Satış Gideri', calculator: 'calculateSatisGideri' },
    ],
    gateType: 'BLOCKING',
  },
};
```

## State Machine

```
                    ┌─────────────────────────────────────────┐
                    │         EXPENSE REQUEST STATES          │
                    └─────────────────────────────────────────┘

     ┌──────────┐                                      ┌──────────┐
     │  DRAFT   │──────── finalize() ────────────────▶│ PENDING  │
     └──────────┘                                      └────┬─────┘
          │                                                 │
          │ cancel()                                        │
          ▼                                                 │
     ┌──────────┐                                          │
     │CANCELLED │◀─────────── cancel() ────────────────────┤
     └──────────┘                                          │
                                                           │
                         recordPayment()                   │
                         (partial)                         │
                              │                            │
                              ▼                            │
                         ┌──────────┐                      │
                         │ PARTIAL  │◀─────────────────────┘
                         └────┬─────┘
                              │
                              │ recordPayment()
                              │ (full)
                              ▼
                         ┌──────────┐
                         │   PAID   │
                         └──────────┘
                              │
                              │ triggers
                              ▼
                    ┌─────────────────────┐
                    │ - Complete Task     │
                    │ - Update Gate       │
                    │ - Unlock UYAP       │
                    └─────────────────────┘
```

## 3-View Integration

### A) Yapılacaklar Paneli Entegrasyonu

```typescript
// ExpenseRequest → Task dönüşümü
function expenseToTask(expense: ExpenseRequest): Task {
  return {
    id: expense.id,
    title: `Müvekkilden ${expense.packageCode === 'OPENING' ? 'takip açılış masrafları' : expense.stageCode} talep edildi`,
    description: `Toplam: ${formatTL(expense.totalAmount)} - ${expense.status}`,
    source: 'SISTEM',
    basis: 'MASRAF_TALEBI',
    status: expense.status === 'PAID' ? 'YAPILDI' : 'BEKLIYOR',
    dueDate: expense.dueDate?.toISOString(),
    priority: expense.status === 'PENDING' ? 'HIGH' : 'MEDIUM',
    category: 'SURE_BAGLI',
    taskType: 'EXPENSE_REQUEST',
    metadata: {
      expenseRequestId: expense.id,
      totalAmount: expense.totalAmount,
      paidAmount: expense.paidTotal,
      status: expense.status,
    },
  };
}
```

### B) Finans Paneli Entegrasyonu

```typescript
// ExpenseRequest → FinanceItem dönüşümü
function expenseToFinanceItem(expense: ExpenseRequest): FinanceItem {
  return {
    id: expense.id,
    type: 'MASRAF_TALEP',
    amount: expense.totalAmount,
    date: expense.createdAt.toISOString(),
    description: expense.packageCode === 'OPENING' 
      ? 'Takip Açılış Masrafları' 
      : `${expense.stageCode} Masrafları`,
    status: expense.status,
    paidAmount: expense.paidTotal,
    remainingAmount: expense.totalAmount - expense.paidTotal,
    items: expense.requestItems.map(item => ({
      code: item.itemCode,
      label: item.label,
      amount: item.finalAmount,
    })),
  };
}
```

### C) Müvekkil Talepleri Paneli Entegrasyonu

```typescript
// ExpenseRequest → ClientRequest dönüşümü
function expenseToClientRequest(expense: ExpenseRequest): ClientRequest {
  return {
    id: expense.id,
    type: 'MASRAF_TALEBI',
    content: `${expense.packageCode === 'OPENING' ? 'Takip Açılış Masrafları' : expense.stageCode}`,
    amount: expense.totalAmount,
    status: expense.status === 'PAID' ? 'TAMAMLANDI' : 'BEKLIYOR',
    createdAt: expense.createdAt.toISOString(),
    completedAt: expense.paidAt?.toISOString(),
    items: expense.requestItems.map(item => ({
      label: item.label,
      amount: item.finalAmount,
    })),
    paymentInfo: {
      iban: 'TR...', // Office IBAN
      description: `${expense.case.fileNumber} - Masraf`,
    },
  };
}
```

## Error Handling

| Error Code | Description | Resolution |
|------------|-------------|------------|
| EXPENSE_001 | Case not found | Verify case ID |
| EXPENSE_002 | Client not found for case | Assign client to case first |
| EXPENSE_003 | Expense request already exists for stage | Use existing request or cancel it |
| EXPENSE_004 | Payment exceeds remaining amount | Adjust payment amount |
| EXPENSE_005 | Cannot cancel paid expense | Refund first if needed |
| EXPENSE_006 | UYAP blocked by unpaid expenses | Pay blocking expenses first |

## Testing Strategy

### Unit Tests
- ExpenseCalculatorService hesaplama doğruluğu
- State machine geçişleri
- Gate kontrolü mantığı

### Property-Based Tests
- Ödeme toplamı hiçbir zaman talep toplamını aşamaz
- PAID durumundaki talebin paidTotal = totalAmount olmalı
- BLOCKING expense varken UYAP her zaman kilitli olmalı

### Integration Tests
- Case oluşturulduğunda otomatik masraf seti
- Ödeme kaydedildiğinde 3 görünüm güncellenmesi
- E-posta gönderimi



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Case Creation Triggers Expense Set
*For any* Case that transitions from DRAFT to CREATED status, the system should automatically create an ExpenseRequest with the standard opening expense items (6 items).
**Validates: Requirements 1.1, 1.5**

### Property 2: Three-View Consistency
*For any* ExpenseRequest, it should appear simultaneously in Tasks panel, Finance panel, and Client Requests panel with consistent data (amount, status, items).
**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 3: Payment Status Correctness
*For any* ExpenseRequest with payments, if paidTotal < totalAmount then status should be PARTIAL, if paidTotal >= totalAmount then status should be PAID.
**Validates: Requirements 3.2, 3.3**

### Property 4: Payment Sum Invariant
*For any* ExpenseRequest, the sum of all associated ExpensePayment amounts should equal paidTotal, and paidTotal should never exceed totalAmount.
**Validates: Requirements 3.1, 3.5**

### Property 5: Gate Mechanism Consistency
*For any* Case, if there exists at least one ExpenseRequest with gateType=BLOCKING and status in (PENDING, PARTIAL), then isUyapBlocked should return true. If all BLOCKING expenses are PAID, isUyapBlocked should return false.
**Validates: Requirements 4.1, 4.3, 4.5**

### Property 6: Task Completion on Payment
*For any* ExpenseRequest that transitions to PAID status, the associated task in Tasks panel should automatically be marked as completed.
**Validates: Requirements 3.4**

### Property 7: Email Content Completeness
*For any* expense notification email sent, it should contain: case file number, all expense item labels and amounts, total amount, payment IBAN, and due date.
**Validates: Requirements 6.2, 6.3**

### Property 8: Tariff Calculation Correctness
*For any* principal amount, the calculated Başvurma Harcı and Peşin Harç should match the formula defined in the current tariff table.
**Validates: Requirements 7.2, 7.3**

### Property 9: Override Audit Trail
*For any* ExpenseRequestItem where wasOverridden=true, there should exist an audit log entry recording the original value, new value, and user who made the change.
**Validates: Requirements 7.4**

### Property 10: Independent Expense Sets
*For any* Case with multiple ExpenseRequests (different stages), each ExpenseRequest should have independent status and payment tracking, but all should reference the same caseId.
**Validates: Requirements 5.1, 5.2**

