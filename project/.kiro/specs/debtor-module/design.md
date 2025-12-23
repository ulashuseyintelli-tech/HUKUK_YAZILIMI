# Design Document: Borçlu Modülü

## Overview

Borçlu Modülü, icra takip yazılımının en kritik bileşenidir. Bu modül, borçlu kayıtlarının oluşturulması, dosya bazında yönetimi, tebligat süreçleri, üçüncü şahıs (89 ihbarname) işlemleri, AI/OCR evrak tarama ve tahsilat iletişimini kapsar.

Mimari olarak "Master Borçlu + Dosya Borçlusu" iki katmanlı yapı kullanılır. Bu sayede bir borçlu bir kez oluşturulur ve farklı dosyalarda farklı rollerle kullanılabilir.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BORÇLU MODÜLÜ                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Master     │    │    Case      │    │   Third      │      │
│  │   Debtor     │───▶│   Debtor     │───▶│   Party      │      │
│  │   (Rehber)   │    │  (Dosya)     │    │  (89 İhbar)  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Address    │    │ Notification │    │  Ihbarname   │      │
│  │   (Adres)    │    │  (Tebligat)  │    │   Tracking   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                                   │
│         ▼                   ▼                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │    Asset     │    │Communication │    │   Document   │      │
│  │ (Mal Varlığı)│    │  (İletişim)  │    │   Scanner    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Katman Yapısı

1. **Master Debtor Layer**: Borçlu rehberi - tek seferlik kayıt
2. **Case Debtor Layer**: Dosya bazında borçlu ilişkisi ve rol
3. **Third Party Layer**: 89 ihbarname için üçüncü şahıslar
4. **Communication Layer**: SMS/Email iletişim
5. **Document Scanner Layer**: AI/OCR evrak tarama

## Components and Interfaces

### 1. DebtorService (Backend)

```typescript
interface DebtorService {
  // Master Debtor CRUD
  createDebtor(data: CreateDebtorDto): Promise<Debtor>;
  updateDebtor(id: string, data: UpdateDebtorDto): Promise<Debtor>;
  getDebtor(id: string): Promise<Debtor>;
  searchDebtors(query: DebtorSearchDto): Promise<PaginatedResult<Debtor>>;
  deleteDebtor(id: string): Promise<void>;
  
  // Duplicate Check
  checkDuplicate(identityNo: string, type: DebtorType): Promise<Debtor | null>;
  
  // Address Management
  addAddress(debtorId: string, address: AddressDto): Promise<DebtorAddress>;
  updateAddress(addressId: string, address: AddressDto): Promise<DebtorAddress>;
  deleteAddress(addressId: string): Promise<void>;
  setPrimaryAddress(debtorId: string, addressId: string): Promise<void>;
}
```

### 2. CaseDebtorService (Backend)

```typescript
interface CaseDebtorService {
  // Case Debtor Management
  addDebtorToCase(caseId: string, data: AddCaseDebtorDto): Promise<CaseDebtor>;
  updateCaseDebtor(id: string, data: UpdateCaseDebtorDto): Promise<CaseDebtor>;
  removeCaseDebtor(id: string): Promise<void>;
  getCaseDebtors(caseId: string): Promise<CaseDebtor[]>;
  
  // Notification Integration
  createNotificationForDebtor(caseDebtorId: string): Promise<Notification>;
  
  // Bulk Operations
  addMultipleDebtors(caseId: string, debtors: AddCaseDebtorDto[]): Promise<CaseDebtor[]>;
}
```

### 3. ThirdPartyService (Backend)

```typescript
interface ThirdPartyService {
  // Third Party CRUD
  createThirdParty(data: CreateThirdPartyDto): Promise<ThirdParty>;
  updateThirdParty(id: string, data: UpdateThirdPartyDto): Promise<ThirdParty>;
  getThirdPartiesForDebtor(caseDebtorId: string): Promise<ThirdParty[]>;
  
  // 89 Ihbarname Tracking
  recordIhbarname(thirdPartyId: string, type: '89_1' | '89_2' | '89_3', date: Date): Promise<void>;
  recordResponse(thirdPartyId: string, response: IhbarnameResponseDto): Promise<void>;
  getOverdueIhbarnames(): Promise<ThirdParty[]>;
}
```

### 4. DebtorCommunicationService (Backend)

```typescript
interface DebtorCommunicationService {
  // Communication
  sendSms(debtorId: string, caseId: string, templateId: string, customContent?: string): Promise<Communication>;
  sendEmail(debtorId: string, caseId: string, templateId: string, customContent?: string): Promise<Communication>;
  logPhoneCall(debtorId: string, caseId: string, notes: string): Promise<Communication>;
  
  // History
  getCommunicationHistory(debtorId: string, caseId?: string): Promise<Communication[]>;
  
  // Templates
  getTemplates(channel: 'SMS' | 'EMAIL'): Promise<MessageTemplate[]>;
}
```

### 5. DocumentScannerService (Backend)

```typescript
interface DocumentScannerService {
  // Document Processing
  scanDocument(file: File, documentType?: DocumentType): Promise<ScanResult>;
  classifyDocument(file: File): Promise<DocumentType>;
  
  // Extraction
  extractDebtorInfo(scanResult: ScanResult): Promise<ExtractedDebtor[]>;
  extractDueInfo(scanResult: ScanResult): Promise<ExtractedDue>;
  
  // Matching
  matchWithExistingDebtor(extracted: ExtractedDebtor): Promise<MatchResult>;
}
```

### 6. Frontend Components

```typescript
// Borçlu Adımı (Step 5) Ana Bileşeni
interface DebtorStepProps {
  caseId?: string;
  existingDebtors: Debtor[];
  selectedDebtors: CaseDebtor[];
  onDebtorsChange: (debtors: CaseDebtor[]) => void;
}

// Evrak Tarama Sihirbazı
interface DebtDocumentScannerProps {
  onScanComplete: (result: ScanResult) => void;
  onDebtorExtracted: (debtor: ExtractedDebtor) => void;
  onDueExtracted: (due: ExtractedDue) => void;
}

// Borçlu Detay Modalı
interface DebtorDetailModalProps {
  debtor: Debtor;
  onClose: () => void;
  onUpdate: (debtor: Debtor) => void;
  editable?: boolean;
}

// Seçili Borçlu Kartı
interface SelectedDebtorCardProps {
  caseDebtor: CaseDebtor;
  onRoleChange: (role: DebtorRole) => void;
  onAddressChange: (addressId: string) => void;
  onRemove: () => void;
}

// Üçüncü Şahıs Yönetimi
interface ThirdPartyManagerProps {
  caseDebtorId: string;
  thirdParties: ThirdParty[];
  onAdd: (thirdParty: ThirdParty) => void;
  onIhbarnameRecord: (id: string, type: string, date: Date) => void;
}
```

## Data Models

### Prisma Schema Updates

```prisma
// Borçlu Türü Enum - Güncelleme
enum DebtorType {
  INDIVIDUAL       // Gerçek Kişi
  COMPANY          // Tüzel Kişi / Şirket
  PUBLIC_INSTITUTION // Kamu Kurumu
}

// Borçlu Rolü Enum - YENİ
enum DebtorRole {
  ASIL_BORCLU       // Asıl Borçlu
  MUSETEREK_BORCLU  // Müşterek (Müteselsil) Borçlu
  ADI_KEFIL         // Adi Kefil
  MUTESELSIL_KEFIL  // Müteselsil Kefil
  AVAL              // Aval Veren
  CIRANTA           // Ciranta
  LEHDAR            // Lehdar
  KESIDECI          // Keşideci
  MUHATAP           // Muhatap (Çekte)
  MIRASCI           // Mirasçı
  TASFIYE_MEMURU    // Tasfiye Memuru
  IFLAS_MASASI      // İflas Masası
}

// Tebligat Modu Enum - YENİ
enum NotificationMode {
  NORMAL    // PTT ile normal tebligat
  KEP       // Kayıtlı Elektronik Posta
  UETS      // Ulusal Elektronik Tebligat Sistemi
  ILANEN    // İlanen Tebligat
}

// Sorumluluk Türü Enum - YENİ
enum LiabilityType {
  TAM       // Tam sorumluluk
  KISMI     // Kısmi sorumluluk
  SINIRLI   // Sınırlı sorumluluk
}

// Üçüncü Şahıs Türü Enum - YENİ
enum ThirdPartyType {
  ISVEREN       // İşveren
  BANKA         // Banka
  KIRACI        // Kiracı
  BORC_ALACAKLI // Borç-Alacaklı
  DIGER         // Diğer
}

// Kamu Kurumu Türü Enum - YENİ
enum PublicInstitutionType {
  BAKANLIK
  BELEDIYE
  IL_OZEL_IDARESI
  UNIVERSITE
  KIT
  DIGER_KAMU
}

// Risk Seviyesi Enum - YENİ
enum RiskLevel {
  DUSUK
  ORTA
  YUKSEK
  COK_YUKSEK
}

// ==================== GÜNCELLENECEK MODELLER ====================

model Debtor {
  id                    String     @id @default(cuid())
  tenantId              String
  tenant                Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // Temel Bilgiler
  type                  DebtorType
  
  // Gerçek Kişi Alanları
  firstName             String?
  lastName              String?
  tckn                  String?    @db.VarChar(11)
  gender                String?    // E, K
  birthDate             DateTime?
  fatherName            String?
  motherName            String?
  birthPlace            String?
  
  // Tüzel Kişi Alanları
  companyName           String?
  vkn                   String?    @db.VarChar(10)
  taxOffice             String?
  mersisNo              String?
  tradeRegisterNo       String?
  
  // Kamu Kurumu Alanları
  institutionName       String?
  detsisNo              String?
  institutionType       PublicInstitutionType?
  parentInstitution     String?
  authorizedPerson      String?
  
  // Computed Display Name
  name                  String     // Ad Soyad veya Ünvan
  identityNo            String?    // TCKN, VKN veya DETSİS
  
  // İletişim
  email                 String?
  phone                 String?
  kepAddress            String?
  
  // Risk ve Notlar
  riskLevel             RiskLevel?
  riskNotes             String?
  notes                 String?
  
  // Timestamps
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt

  // Relations
  addresses             DebtorAddress[]
  caseDebtors           CaseDebtor[]
  assets                Asset[]
  communications        DebtorCommunication[]

  @@index([tenantId])
  @@index([tenantId, tckn])
  @@index([tenantId, vkn])
  @@index([tenantId, detsisNo])
  @@index([tenantId, name])
}

// Borçlu Adresi - YENİ MODEL
model DebtorAddress {
  id            String   @id @default(cuid())
  debtorId      String
  debtor        Debtor   @relation(fields: [debtorId], references: [id], onDelete: Cascade)
  
  addressType   String   // EV, IS, TEBLIGAT, MERNIS, KEP
  street        String
  city          String
  district      String?
  postalCode    String?
  country       String   @default("Türkiye")
  
  isPrimary     Boolean  @default(false)
  isMernis      Boolean  @default(false)
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Used in case debtors
  caseDebtors   CaseDebtor[]

  @@index([debtorId])
}

// Dosya Borçlusu - GÜNCELLENMİŞ MODEL
model CaseDebtor {
  id                    String           @id @default(cuid())
  caseId                String
  case                  Case             @relation(fields: [caseId], references: [id], onDelete: Cascade)
  debtorId              String
  debtor                Debtor           @relation(fields: [debtorId], references: [id], onDelete: Cascade)
  
  // Rol ve Sorumluluk
  role                  DebtorRole       @default(ASIL_BORCLU)
  liabilityAmount       Decimal?         @db.Decimal(15, 2)
  liabilityType         LiabilityType?
  
  // Tebligat
  notificationMode      NotificationMode @default(NORMAL)
  selectedAddressId     String?
  selectedAddress       DebtorAddress?   @relation(fields: [selectedAddressId], references: [id])
  prepareNotification   Boolean          @default(true)
  
  // Borçlu Vekili
  debtorLawyerId        String?
  debtorLawyerName      String?
  debtorLawyerBarNo     String?
  
  // Dosyaya Özel
  caseNote              String?
  
  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt

  // Relations
  thirdParties          ThirdParty[]
  notifications         Notification[]

  @@unique([caseId, debtorId, role])
  @@index([caseId])
  @@index([debtorId])
}

// Üçüncü Şahıs - YENİ MODEL
model ThirdParty {
  id              String          @id @default(cuid())
  tenantId        String
  caseDebtorId    String
  caseDebtor      CaseDebtor      @relation(fields: [caseDebtorId], references: [id], onDelete: Cascade)
  
  // Temel Bilgiler
  type            ThirdPartyType
  name            String
  identityNo      String?         // TCKN veya VKN
  
  // İletişim
  address         String
  city            String?
  phone           String?
  email           String?
  kepAddress      String?
  
  // İlişki
  relationDesc    String?         // Borçlu ile ilişki açıklaması
  
  // 89 İhbarname Takibi
  ihbarname89_1_date      DateTime?
  ihbarname89_1_status    String?
  ihbarname89_2_date      DateTime?
  ihbarname89_2_status    String?
  ihbarname89_3_date      DateTime?
  ihbarname89_3_status    String?
  
  // Cevap
  responseDate    DateTime?
  responseContent String?
  
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([caseDebtorId])
  @@index([tenantId])
}

// Borçlu İletişim - YENİ MODEL
model DebtorCommunication {
  id            String   @id @default(cuid())
  tenantId      String
  debtorId      String
  debtor        Debtor   @relation(fields: [debtorId], references: [id], onDelete: Cascade)
  caseId        String?
  case          Case?    @relation(fields: [caseId], references: [id], onDelete: SetNull)
  
  channel       String   // SMS, EMAIL, PHONE_CALL
  templateId    String?
  templateName  String?
  content       String
  
  status        String   @default("PENDING") // PENDING, SENT, DELIVERED, FAILED
  sentAt        DateTime?
  deliveredAt   DateTime?
  failReason    String?
  
  // Telefon görüşmesi için
  callDuration  Int?
  callNotes     String?
  
  createdAt     DateTime @default(now())

  @@index([debtorId])
  @@index([caseId])
  @@index([tenantId])
}
```

## UI/UX Design

### Borçlu Adımı (Step 5) Ekran Düzeni

```
┌─────────────────────────────────────────────────────────────────────────┐
│  👥 Borçlular                                                           │
│  Takipte yer alacak borçluları ekleyin                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  📄 Borç Evrakını Tara - Borçluyu Otomatik Bul                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  [Fatura] [Çek] [Senet] [Kira Sözl.] [Cari Hesap]       │    │   │
│  │  │                                                          │    │   │
│  │  │         📤 Dosya Yükle veya Sürükle-Bırak               │    │   │
│  │  │         PDF, JPG, PNG (max 10MB)                         │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐   │
│  │  📋 Borçlu Rehberi       │  │  ✅ Bu Takip İçin Seçili         │   │
│  │  ┌────────────────────┐  │  │                                   │   │
│  │  │ 🔍 Ara...          │  │  │  ┌─────────────────────────────┐ │   │
│  │  └────────────────────┘  │  │  │ 👤 Ahmet Yılmaz             │ │   │
│  │  [Şahıs] [Kurum] [Kamu]  │  │  │ Rol: [Asıl Borçlu ▼]        │ │   │
│  │                          │  │  │ Adres: [Ev Adresi ▼]        │ │   │
│  │  ☐ Mehmet Demir          │  │  │ ☑ Tebligat Hazırla          │ │   │
│  │    TCKN: 123...          │  │  │ [Üçüncü Şahıs] [Kaldır]     │ │   │
│  │  ☐ ABC Ltd. Şti.         │  │  └─────────────────────────────┘ │   │
│  │    VKN: 456...           │  │                                   │   │
│  │  ☐ X Belediyesi          │  │  ┌─────────────────────────────┐ │   │
│  │    DETSİS: 789...        │  │  │ 🏢 XYZ A.Ş.                 │ │   │
│  │                          │  │  │ Rol: [Müteselsil Kefil ▼]   │ │   │
│  │  [+ Yeni Borçlu Ekle]    │  │  │ Adres: [Merkez ▼]           │ │   │
│  └──────────────────────────┘  │  │ ☑ Tebligat Hazırla          │ │   │
│                                 │  └─────────────────────────────┘ │   │
│                                 │                                   │   │
│                                 │  [📱 Toplu SMS] [📧 Toplu Email] │   │
│                                 └──────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  👥 Üçüncü Şahıslar (89 İhbarname)                    [+ Ekle]  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ İşveren: ABC Holding  │ 89/1: 01.12.2024 ✓ │ Cevap: -   │    │   │
│  │  │ Banka: X Bankası      │ 89/1: 05.12.2024 ✓ │ Cevap: Var │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Identity Number Uniqueness
*For any* debtor creation attempt with a TCKN, VKN, or DETSİS number that already exists in the same tenant, the system should either return the existing debtor or reject the creation with a duplicate warning.
**Validates: Requirements 1.5**

### Property 2: Required Fields by Type
*For any* debtor of type PERSON, the system should require firstName, lastName, and valid 11-digit TCKN. *For any* debtor of type COMPANY, the system should require companyName and valid 10-digit VKN. *For any* debtor of type PUBLIC_INSTITUTION, the system should require institutionName and DETSİS number.
**Validates: Requirements 1.2, 1.3, 1.4**

### Property 3: Primary Address Uniqueness
*For any* debtor with multiple addresses, exactly one address should be marked as primary at any time.
**Validates: Requirements 2.2**

### Property 4: Case Debtor Role Uniqueness
*For any* case and debtor combination, the same debtor can appear multiple times only if each record has a different role.
**Validates: Requirements 3.4**

### Property 5: Notification Mode Validation
*For any* CaseDebtor with notification mode KEP or UETS, the associated debtor must have a valid KEP address.
**Validates: Requirements 4.3**

### Property 6: Document Scan Confidence Score
*For any* document scan result, the confidence score should be categorized as HIGH (>80%), MEDIUM (50-80%), or LOW (<50%) based on extraction quality.
**Validates: Requirements 5.4**

### Property 7: Ihbarname Response Deadline
*For any* 89/1 or 89/2 ihbarname sent to a third party, the system should track a 7-day response deadline and create an alert if no response is recorded.
**Validates: Requirements 6.3, 6.5**

### Property 8: Communication History Completeness
*For any* communication sent to a debtor, the system should record channel, content, timestamp, and delivery status.
**Validates: Requirements 7.4**

### Property 9: Identity Number Format Validation
*For any* TCKN input, the system should validate it is exactly 11 digits. *For any* VKN input, the system should validate it is exactly 10 digits.
**Validates: Requirements 1.6**

### Property 10: Debtor Deletion Protection
*For any* debtor with active cases (CaseDebtor records), the system should prevent deletion and warn the user.
**Validates: Requirements 12.5**

## Error Handling

### Validation Errors

| Error Code | Description | User Message |
|------------|-------------|--------------|
| DEBTOR_001 | Invalid TCKN format | TC Kimlik No 11 haneli olmalıdır |
| DEBTOR_002 | Invalid VKN format | Vergi Kimlik No 10 haneli olmalıdır |
| DEBTOR_003 | Duplicate identity number | Bu kimlik numarası ile kayıtlı borçlu mevcut |
| DEBTOR_004 | Missing required field | Zorunlu alan eksik: {field} |
| DEBTOR_005 | Invalid DETSİS format | Geçersiz DETSİS numarası |
| DEBTOR_006 | KEP address required | KEP/UETS tebligat için KEP adresi zorunludur |
| DEBTOR_007 | Cannot delete with active cases | Aktif dosyası olan borçlu silinemez |

### OCR/Scan Errors

| Error Code | Description | User Message |
|------------|-------------|--------------|
| SCAN_001 | File too large | Dosya boyutu 10MB'ı aşamaz |
| SCAN_002 | Unsupported format | Desteklenmeyen dosya formatı |
| SCAN_003 | OCR failed | Belge okunamadı, lütfen daha net bir görüntü yükleyin |
| SCAN_004 | No debtor found | Belgede borçlu bilgisi tespit edilemedi |

### Communication Errors

| Error Code | Description | User Message |
|------------|-------------|--------------|
| COMM_001 | Invalid phone number | Geçersiz telefon numarası |
| COMM_002 | Invalid email | Geçersiz e-posta adresi |
| COMM_003 | SMS send failed | SMS gönderilemedi |
| COMM_004 | Email send failed | E-posta gönderilemedi |

## Testing Strategy

### Unit Testing

Unit tests will cover:
- Debtor CRUD operations
- Identity number validation (TCKN, VKN, DETSİS)
- Address management (add, update, delete, set primary)
- CaseDebtor role assignment
- Communication template rendering

### Property-Based Testing

Using **fast-check** library for TypeScript:

1. **Identity Validation Properties**: Generate random strings and verify TCKN/VKN validation
2. **Duplicate Detection**: Generate debtors and verify duplicate detection works
3. **Address Primary Uniqueness**: Generate multiple addresses and verify only one is primary
4. **Role Assignment**: Generate case-debtor combinations and verify role uniqueness

### Integration Testing

- Full debtor creation flow with addresses
- Case debtor assignment with notification creation
- Third party 89 ihbarname workflow
- Document scan and debtor extraction
- Communication send and delivery tracking

### Test Configuration

```typescript
// Property-based test configuration
const PBT_CONFIG = {
  numRuns: 100,  // Minimum 100 iterations per property
  seed: Date.now(),
  verbose: true
};
```

## API Endpoints

### Debtor Endpoints

```
POST   /api/debtors                    - Create debtor
GET    /api/debtors                    - List debtors (with search/filter)
GET    /api/debtors/:id                - Get debtor details
PUT    /api/debtors/:id                - Update debtor
DELETE /api/debtors/:id                - Delete debtor
POST   /api/debtors/check-duplicate    - Check for duplicate

POST   /api/debtors/:id/addresses      - Add address
PUT    /api/debtors/:id/addresses/:aid - Update address
DELETE /api/debtors/:id/addresses/:aid - Delete address
POST   /api/debtors/:id/addresses/:aid/set-primary - Set primary
```

### Case Debtor Endpoints

```
POST   /api/cases/:caseId/debtors      - Add debtor to case
GET    /api/cases/:caseId/debtors      - Get case debtors
PUT    /api/case-debtors/:id           - Update case debtor
DELETE /api/case-debtors/:id           - Remove from case
POST   /api/case-debtors/:id/notification - Create notification
```

### Third Party Endpoints

```
POST   /api/case-debtors/:id/third-parties     - Add third party
GET    /api/case-debtors/:id/third-parties     - List third parties
PUT    /api/third-parties/:id                   - Update third party
DELETE /api/third-parties/:id                   - Delete third party
POST   /api/third-parties/:id/ihbarname         - Record ihbarname
POST   /api/third-parties/:id/response          - Record response
```

### Communication Endpoints

```
POST   /api/debtors/:id/communications/sms     - Send SMS
POST   /api/debtors/:id/communications/email   - Send Email
POST   /api/debtors/:id/communications/call    - Log phone call
GET    /api/debtors/:id/communications         - Get history
GET    /api/communication-templates            - Get templates
```

### Document Scanner Endpoints

```
POST   /api/ocr/scan-debt-document     - Scan and extract
POST   /api/ocr/classify-document      - Classify document type
```
