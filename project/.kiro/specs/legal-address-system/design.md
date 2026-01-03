# Design Document: Legal Address System

## Overview

Tebligat Kanunu'na (TK) uygun, hukuki geçerliliği olan bir adres yönetim sistemi. Mevcut `DebtorAddress` modeli genişletilerek adres türü, kaynağı, hukuki önceliği ve risk durumu takip edilecek. Her tebligat denemesi hangi adrese yapıldığını kaydedecek, böylece hukuki savunma için tam audit trail sağlanacak.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  DebtorDetailDrawer                                              │
│  ├── AddressListSection (yeni)                                   │
│  │   ├── AddressCard (type icon, priority, risk flags)          │
│  │   ├── AddressForm (create/edit modal)                        │
│  │   └── AddressHistoryTimeline (per-address notifications)     │
│  └── ServiceUpdateModal (address selection dropdown)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (NestJS)                          │
├─────────────────────────────────────────────────────────────────┤
│  AddressModule (yeni)                                            │
│  ├── AddressService                                              │
│  │   ├── create/update/delete                                   │
│  │   ├── setActiveAddress()                                     │
│  │   ├── suggestPriorityAddress()                               │
│  │   ├── addRiskFlag()                                          │
│  │   └── getAddressHistory()                                    │
│  └── AddressController                                           │
│                                                                  │
│  DebtorModule (güncelleme)                                       │
│  └── DebtorService                                               │
│      └── getCaseDebtorDetail() - addresses dahil                │
│                                                                  │
│  ServiceModule (güncelleme)                                      │
│  └── updateServiceStatus() - addressId kaydı                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Database (PostgreSQL)                     │
├─────────────────────────────────────────────────────────────────┤
│  DebtorAddress (genişletilmiş)                                   │
│  ServiceHistory (addressId eklendi)                              │
│  CaseDebtor (activeAddressId eklendi)                           │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Backend Components

#### AddressService

```typescript
interface AddressService {
  // CRUD
  create(tenantId: string, debtorId: string, dto: CreateAddressDto): Promise<DebtorAddress>;
  update(tenantId: string, addressId: string, dto: UpdateAddressDto): Promise<DebtorAddress>;
  delete(tenantId: string, addressId: string): Promise<void>;
  
  // Business Logic
  setActiveAddress(tenantId: string, caseDebtorId: string, addressId: string): Promise<void>;
  suggestPriorityAddress(debtorType: DebtorType, addresses: DebtorAddress[]): DebtorAddress | null;
  addRiskFlag(addressId: string, flag: AddressRiskFlag, reason?: string): Promise<void>;
  removeRiskFlag(addressId: string, flag: AddressRiskFlag): Promise<void>;
  
  // Queries
  getAddressHistory(addressId: string): Promise<ServiceAttempt[]>;
  getAddressesForDebtor(debtorId: string): Promise<DebtorAddress[]>;
  
  // TK 21/2
  canApplyTK21_2(address: DebtorAddress): boolean;
  recordTK21_2(addressId: string, dto: TK21_2RecordDto): Promise<void>;
}
```

#### DTOs

```typescript
interface CreateAddressDto {
  type: AddressType;
  subType?: AddressSubType;
  source: AddressSource;
  street: string;
  city: string;
  district?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
}

interface UpdateAddressDto extends Partial<CreateAddressDto> {
  verified?: boolean;
  riskFlags?: AddressRiskFlag[];
}

interface TK21_2RecordDto {
  muhtarDeliveryDate: Date;
  doorPostingDate: Date;
  noticeDate: Date;
  notes?: string;
}
```

### Frontend Components

#### AddressListSection

```typescript
interface AddressListSectionProps {
  debtorId: string;
  caseDebtorId: string;
  addresses: AddressDTO[];
  activeAddressId?: string;
  onAddressChange: () => void;
}
```

#### AddressCard

```typescript
interface AddressCardProps {
  address: AddressDTO;
  isActive: boolean;
  onSetActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
}
```

## Data Models

### Prisma Schema Updates

```prisma
// Adres Türü
enum AddressType {
  MERNIS          // MERNİS Yerleşim Yeri (TK m.10/m.21)
  BUSINESS_HQ     // İşyeri Merkez (TK m.12/m.13)
  BUSINESS_BRANCH // İşyeri Şube
  LEGAL_CENTER    // Tüzel Kişi Merkez (Ticaret Sicili)
  DECLARED        // Bildirilen/Sözleşme Adresi (TK m.10/2)
  KEP             // Kayıtlı Elektronik Posta
}

// Adres Alt Türü (İşyeri için)
enum AddressSubType {
  HQ              // Merkez
  BRANCH          // Şube
}

// Adres Kaynağı
enum AddressSource {
  MERNIS          // MERNİS sorgusu
  MERSIS          // MERSİS sorgusu
  TICARET_SICILI  // Ticaret Sicil Gazetesi
  CONTRACT        // Sözleşme
  USER_INPUT      // Manuel giriş
  UYAP            // UYAP sorgusu
}

// Adres Risk Durumu
enum AddressRiskFlag {
  ADDRESS_SUSPECT // Adres şüpheli
  MOVED           // Taşınmış
  CLOSED          // Kapalı
  NOT_FOUND       // Bulunamadı
  REFUSED         // Tebellüğden imtina
}

// Hukuki Öncelik
enum LegalPriority {
  HIGH            // Birincil tercih
  MEDIUM          // İkincil tercih
  LOW             // Son tercih
}

// Genişletilmiş DebtorAddress
model DebtorAddress {
  id              String   @id @default(cuid())
  debtorId        String
  debtor          Debtor   @relation(fields: [debtorId], references: [id], onDelete: Cascade)
  
  // Temel Bilgiler
  type            AddressType
  subType         AddressSubType?
  source          AddressSource
  
  // Adres Detayları
  street          String
  city            String
  district        String?
  postalCode      String?
  country         String   @default("Türkiye")
  fullText        String?  // Computed: tam adres metni
  
  // Hukuki Bilgiler
  legalPriority   LegalPriority @default(MEDIUM)
  canApply21_2    Boolean  @default(false)
  
  // Doğrulama
  verified        Boolean  @default(false)
  verifiedAt      DateTime?
  verifiedSource  String?  // Sorgu referansı
  
  // Risk Durumu
  riskFlags       AddressRiskFlag[]
  riskNotes       String?
  
  // TK 21/2 Bilgileri (bila tebligat)
  tk21_2Applied       Boolean   @default(false)
  tk21_2MuhtarDate    DateTime?
  tk21_2DoorPostDate  DateTime?
  tk21_2NoticeDate    DateTime?
  
  // Meta
  isPrimary       Boolean  @default(false)
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // İlişkiler
  caseDebtors     CaseDebtor[]
  serviceAttempts ServiceHistory[]

  @@index([debtorId])
  @@index([type])
  @@index([verified])
}

// ServiceHistory güncelleme - adres bağlantısı
model ServiceHistory {
  // ... mevcut alanlar ...
  
  // Adres Bağlantısı (yeni)
  addressId       String?
  address         DebtorAddress? @relation(fields: [addressId], references: [id])
  addressType     AddressType?   // Snapshot
  addressText     String?        // Snapshot
  
  @@index([addressId])
}

// CaseDebtor güncelleme - aktif adres
model CaseDebtor {
  // ... mevcut alanlar ...
  
  // Aktif Tebligat Adresi (yeni)
  activeAddressId String?
  activeAddress   DebtorAddress? @relation(fields: [activeAddressId], references: [id])
}
```

### TypeScript Types (Frontend)

```typescript
// Address DTO
interface AddressDTO {
  id: string;
  type: AddressType;
  subType?: AddressSubType;
  source: AddressSource;
  street: string;
  city: string;
  district?: string;
  postalCode?: string;
  fullText: string;
  legalPriority: LegalPriority;
  canApply21_2: boolean;
  verified: boolean;
  verifiedAt?: string;
  riskFlags: AddressRiskFlag[];
  isPrimary: boolean;
  lastNotificationResult?: {
    date: string;
    status: ServiceStatus;
  };
}

// Address Type Labels
const AddressTypeLabels: Record<AddressType, string> = {
  MERNIS: "MERNİS Yerleşim Yeri",
  BUSINESS_HQ: "İşyeri Merkez",
  BUSINESS_BRANCH: "İşyeri Şube",
  LEGAL_CENTER: "Şirket Merkez (Ticaret Sicili)",
  DECLARED: "Bildirilen Adres",
  KEP: "KEP Adresi",
};

// Address Type Icons
const AddressTypeIcons: Record<AddressType, string> = {
  MERNIS: "🏠",
  BUSINESS_HQ: "🏢",
  BUSINESS_BRANCH: "🏬",
  LEGAL_CENTER: "🏛️",
  DECLARED: "✍️",
  KEP: "📧",
};

// Priority Labels
const LegalPriorityLabels: Record<LegalPriority, string> = {
  HIGH: "Birincil",
  MEDIUM: "İkincil",
  LOW: "Alternatif",
};

// Risk Flag Labels
const AddressRiskFlagLabels: Record<AddressRiskFlag, string> = {
  ADDRESS_SUSPECT: "Adres Şüpheli",
  MOVED: "Taşınmış",
  CLOSED: "Kapalı",
  NOT_FOUND: "Bulunamadı",
  REFUSED: "Tebellüğden İmtina",
};
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: canApply21_2 Flag Consistency

*For any* address, the `canApply21_2` flag SHALL be correctly set based on address type:
- MERNIS → true
- LEGAL_CENTER → true (conditional)
- BUSINESS_HQ, BUSINESS_BRANCH → false
- DECLARED → false
- KEP → false

**Validates: Requirements 1.3, 1.4**

### Property 2: Verified Flag Based on Source

*For any* address, the `verified` flag SHALL be correctly set based on source:
- MERNIS, MERSIS, UYAP → true (official sources)
- USER_INPUT → false
- CONTRACT, TICARET_SICILI → false (requires manual verification)

**Validates: Requirements 2.2, 2.3**

### Property 3: Priority Order for Individual Debtors

*For any* INDIVIDUAL debtor with multiple addresses, the `suggestPriorityAddress()` function SHALL return addresses in this order:
1. MERNIS (if exists and no risk flags)
2. DECLARED (if exists)
3. BUSINESS_HQ or BUSINESS_BRANCH
4. Any remaining address

**Validates: Requirements 3.1**

### Property 4: Priority Order for Company Debtors

*For any* COMPANY debtor with multiple addresses, the `suggestPriorityAddress()` function SHALL return addresses in this order:
1. LEGAL_CENTER (if exists and no risk flags)
2. BUSINESS_BRANCH (if exists)
3. DECLARED (if exists)
4. Any remaining address

**Validates: Requirements 3.2**

### Property 5: Service Attempt Address Recording

*For any* service attempt (notification), the ServiceHistory record SHALL contain:
- addressId (non-null)
- addressType (snapshot of address type at time of attempt)
- addressText (snapshot of full address text)

**Validates: Requirements 5.1**

### Property 6: Single Active Address Constraint

*For any* CaseDebtor, at most one address SHALL be marked as active at any time. Setting a new active address SHALL unset the previous one.

**Validates: Requirements 6.2**

### Property 7: TK 21/2 Eligibility Constraint

*For any* address where `canApply21_2` is false, the system SHALL reject TK 21/2 application attempts.

**Validates: Requirements 7.2**

### Property 8: TK 21/2 Record Completeness

*For any* address where TK 21/2 is applied, the record SHALL contain:
- tk21_2MuhtarDate (muhtar teslim tarihi)
- tk21_2DoorPostDate (kapıya yapıştırma tarihi)
- tk21_2NoticeDate (ihbarname tarihi)

**Validates: Requirements 7.3**

### Property 9: Risk Flag Auto-Assignment

*For any* failed notification (RETURNED status), the system SHALL automatically add appropriate risk flag to the address based on return reason:
- ADDRESS_NOT_FOUND → NOT_FOUND flag
- MOVED → MOVED flag
- REFUSED → REFUSED flag
- COMPANY_CLOSED → CLOSED flag

**Validates: Requirements 4.2**

## Error Handling

| Error Case | HTTP Status | Error Code | Message |
|------------|-------------|------------|---------|
| Address not found | 404 | ADDRESS_NOT_FOUND | Adres bulunamadı |
| Invalid address type | 400 | INVALID_ADDRESS_TYPE | Geçersiz adres türü |
| TK 21/2 not allowed | 400 | TK21_2_NOT_ALLOWED | Bu adres için TK 21/2 uygulanamaz |
| Address in use | 400 | ADDRESS_IN_USE | Bu adres aktif tebligatlarda kullanılıyor |
| Duplicate address | 409 | DUPLICATE_ADDRESS | Bu adres zaten kayıtlı |

## Testing Strategy

### Unit Tests

- AddressService CRUD operations
- Priority calculation logic
- canApply21_2 flag computation
- Risk flag management
- TK 21/2 eligibility check

### Property-Based Tests

Property-based testing library: **fast-check** (TypeScript)

Each property test will run minimum 100 iterations with randomly generated addresses.

1. **Property 1 Test**: Generate random addresses with all types, verify canApply21_2 matches expected value
2. **Property 2 Test**: Generate random addresses with all sources, verify verified flag matches expected value
3. **Property 3 Test**: Generate random INDIVIDUAL debtors with multiple addresses, verify priority order
4. **Property 4 Test**: Generate random COMPANY debtors with multiple addresses, verify priority order
5. **Property 5 Test**: Generate random service attempts, verify all have required address fields
6. **Property 6 Test**: Generate random setActiveAddress calls, verify only one active at a time
7. **Property 7 Test**: Generate random TK 21/2 attempts on ineligible addresses, verify rejection
8. **Property 8 Test**: Generate random TK 21/2 records, verify all required fields present
9. **Property 9 Test**: Generate random failed notifications, verify correct risk flag added

### Integration Tests

- Address creation with debtor association
- Service attempt with address recording
- Active address switching
- TK 21/2 workflow end-to-end
