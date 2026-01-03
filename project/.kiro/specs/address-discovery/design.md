# Design: Address Discovery Module

## Overview

Adres İstihbarat Modülü, borçlu adreslerini sistematik olarak araştırmak için tasarlanmış bir sistemdir. Mevcut `legal-address-system` ile entegre çalışır ve bulunan adresleri `DebtorAddress` tablosuna ekler.

---

## Database Schema

### New Models

```prisma
// Müvekkil Bilgi Talebi
model ClientInfoRequest {
  id            String   @id @default(cuid())
  tenantId      String
  caseId        String
  clientId      String
  debtorId      String?  // Belirli borçlu için (opsiyonel)
  
  emailTo       String
  emailSubject  String
  emailBody     String
  
  status        ClientInfoRequestStatus @default(SENT)
  sentAt        DateTime @default(now())
  respondedAt   DateTime?
  responseNotes String?
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  case          Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  client        Client   @relation(fields: [clientId], references: [id])
  debtor        Debtor?  @relation(fields: [debtorId], references: [id])
  
  @@index([tenantId])
  @@index([caseId])
  @@index([clientId])
  @@index([status])
}

enum ClientInfoRequestStatus {
  SENT
  RESPONDED
  NO_RESPONSE
}

// UYAP Sorguları
model UyapQuery {
  id            String   @id @default(cuid())
  tenantId      String
  caseDebtorId  String
  
  queryType     UyapQueryType
  queryCode     String   // AA, AB, AF, AJ, AR, AL, AH, AN, AP
  
  status        UyapQueryStatus @default(PENDING)
  requestedAt   DateTime @default(now())
  requestedBy   String   // userId
  respondedAt   DateTime?
  
  // Sorgu sonucu (JSON)
  response      Json?
  errorMessage  String?
  
  // Bulunan adresler
  addressesFound Int     @default(0)
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  tenant        Tenant      @relation(fields: [tenantId], references: [id])
  caseDebtor    CaseDebtor  @relation(fields: [caseDebtorId], references: [id], onDelete: Cascade)
  requestedByUser User      @relation(fields: [requestedBy], references: [id])
  
  @@index([tenantId])
  @@index([caseDebtorId])
  @@index([queryType])
  @@index([status])
}

enum UyapQueryType {
  NUFUS_ADRES      // AA - Nüfus + Aile + Adres
  SGK              // AB - SGK işyeri
  TICARET_ODASI    // AF - Ticaret Odası
  VERGI_DAIRESI    // AJ - Vergi Dairesi
  GSM              // AR - GSM Operatörleri
  GUMRUK           // AL - Gümrük
  ORTAKLAR         // AH - Şirket ortakları
  AILE             // AN - Aile üyeleri
  ORTAK_DETAY      // AP - Ortak detayları
}

enum UyapQueryStatus {
  PENDING
  COMPLETED
  FAILED
  NO_RESULT
}

// Kurum Yazıları
model InstitutionLetter {
  id            String   @id @default(cuid())
  tenantId      String
  caseDebtorId  String
  
  institution   InstitutionType
  letterType    String   // Yazı türü (adres sorgu, haciz ihbarnamesi, vs.)
  
  // Yazı içeriği
  subject       String
  body          String
  documentUrl   String?  // Oluşturulan Word dosyası
  
  status        InstitutionLetterStatus @default(DRAFT)
  sentAt        DateTime?
  sentMethod    String?  // Posta, KEP, Elden
  respondedAt   DateTime?
  responseNotes String?
  
  // Bulunan bilgiler
  addressesFound Int     @default(0)
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  tenant        Tenant      @relation(fields: [tenantId], references: [id])
  caseDebtor    CaseDebtor  @relation(fields: [caseDebtorId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([caseDebtorId])
  @@index([institution])
  @@index([status])
}

enum InstitutionType {
  SGK
  VERGI_DAIRESI
  TICARET_SICILI
  BELEDIYE
  TAPU
  NUFUS
}

enum InstitutionLetterStatus {
  DRAFT
  SENT
  RESPONDED
  NO_RESPONSE
}

// Araştırma Durumu
model AddressResearch {
  id            String   @id @default(cuid())
  tenantId      String
  caseDebtorId  String   @unique
  
  status        AddressResearchStatus @default(NOT_STARTED)
  
  // Araştırma adımları
  clientInfoRequested   Boolean @default(false)
  uyapQueriesCompleted  Boolean @default(false)
  crossFileChecked      Boolean @default(false)
  institutionLettersSent Boolean @default(false)
  
  // İstatistikler
  totalAddressesFound   Int     @default(0)
  failedNotifications   Int     @default(0)
  
  startedAt     DateTime?
  completedAt   DateTime?
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  tenant        Tenant      @relation(fields: [tenantId], references: [id])
  caseDebtor    CaseDebtor  @relation(fields: [caseDebtorId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([status])
}

enum AddressResearchStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
  EXHAUSTED
}
```

### Extend AddressSource Enum

```prisma
enum AddressSource {
  // Mevcut
  MANUAL
  CLIENT
  MERNIS
  MERSIS
  UYAP
  COURT_RECORD
  CONTRACT
  INVOICE
  OTHER
  
  // Yeni - UYAP Sorgu Detayları
  UYAP_AA       // Nüfus + Adres sorgusu
  UYAP_AB       // SGK sorgusu
  UYAP_AF       // Ticaret Odası sorgusu
  UYAP_AJ       // Vergi Dairesi sorgusu
  UYAP_AR       // GSM sorgusu
  
  // Yeni - Kurum Yazıları
  SGK_LETTER
  VERGI_LETTER
  TICARET_SICILI_LETTER
  BELEDIYE_LETTER
  
  // Yeni - Cross-file
  CROSS_FILE    // Başka dosyadan
}
```

---

## Backend Architecture

### New Module: AddressDiscoveryModule

```
apps/api/src/modules/address-discovery/
├── address-discovery.module.ts
├── address-discovery.controller.ts
├── address-discovery.service.ts
├── client-info-request.service.ts
├── uyap-query.service.ts
├── institution-letter.service.ts
├── cross-file.service.ts
├── confidence-score.service.ts
├── dto/
│   ├── create-client-info-request.dto.ts
│   ├── create-uyap-query.dto.ts
│   ├── create-institution-letter.dto.ts
│   ├── update-query-response.dto.ts
│   └── address-confidence.dto.ts
└── templates/
    ├── client-info-email.template.ts
    ├── sgk-letter.template.ts
    ├── vergi-letter.template.ts
    └── ticaret-sicili-letter.template.ts
```

### Service Methods

#### AddressDiscoveryService
```typescript
// Ana servis - orchestration
class AddressDiscoveryService {
  // Araştırma durumu
  getResearchStatus(caseDebtorId: string): Promise<AddressResearchDTO>
  startResearch(caseDebtorId: string): Promise<AddressResearch>
  
  // Otomatik öneriler
  suggestNextAction(caseDebtorId: string): Promise<ResearchSuggestion>
  
  // Araştırma geçmişi
  getResearchTimeline(caseDebtorId: string): Promise<ResearchTimelineDTO[]>
}
```

#### ClientInfoRequestService
```typescript
class ClientInfoRequestService {
  // Müvekkil bilgi talebi
  createRequest(dto: CreateClientInfoRequestDTO): Promise<ClientInfoRequest>
  sendEmail(requestId: string): Promise<void>
  markAsResponded(requestId: string, notes: string): Promise<ClientInfoRequest>
  
  // Otomatik gönderim (case oluşturulduğunda)
  sendAutoRequestOnCaseCreate(caseId: string): Promise<ClientInfoRequest[]>
  
  // Liste
  getRequestsForCase(caseId: string): Promise<ClientInfoRequest[]>
}
```

#### UyapQueryService
```typescript
class UyapQueryService {
  // Sorgu oluşturma
  createQuery(dto: CreateUyapQueryDTO): Promise<UyapQuery>
  
  // Sorgu sonucu kaydetme (manuel)
  recordQueryResponse(queryId: string, dto: UpdateQueryResponseDTO): Promise<UyapQuery>
  
  // Bulunan adresleri DebtorAddress'e ekleme
  processQueryAddresses(queryId: string, addresses: AddressFromQueryDTO[]): Promise<DebtorAddress[]>
  
  // Liste
  getQueriesForDebtor(caseDebtorId: string): Promise<UyapQuery[]>
  
  // Sorgu kodu mapping
  getQueryCodeForType(type: UyapQueryType): string
}
```

#### InstitutionLetterService
```typescript
class InstitutionLetterService {
  // Yazı oluşturma
  createLetter(dto: CreateInstitutionLetterDTO): Promise<InstitutionLetter>
  
  // Word dosyası oluşturma
  generateDocument(letterId: string): Promise<string> // URL
  
  // Durum güncelleme
  markAsSent(letterId: string, method: string): Promise<InstitutionLetter>
  markAsResponded(letterId: string, notes: string, addressesFound: number): Promise<InstitutionLetter>
  
  // Liste
  getLettersForDebtor(caseDebtorId: string): Promise<InstitutionLetter[]>
}
```

#### CrossFileService
```typescript
class CrossFileService {
  // Aynı borçluyu bul (TCKN/VKN bazlı)
  findSameDebtor(debtorId: string): Promise<CrossFileMatch[]>
  
  // Diğer dosyalardaki adresleri getir
  getAddressesFromOtherCases(debtorId: string, currentCaseId: string): Promise<CrossFileAddressDTO[]>
  
  // Adresi mevcut dosyaya kopyala
  copyAddressToCase(addressId: string, targetCaseDebtorId: string): Promise<DebtorAddress>
  
  // Uyarı kontrolü
  hasDifferentAddressInOtherCase(debtorId: string, currentCaseId: string): Promise<boolean>
}
```

#### ConfidenceScoreService
```typescript
class ConfidenceScoreService {
  // Güven skoru hesapla
  calculateScore(address: DebtorAddress): Promise<number>
  
  // Faktör detayları
  getScoreBreakdown(addressId: string): Promise<ConfidenceScoreBreakdown>
  
  // Toplu güncelleme
  updateAllScoresForDebtor(caseDebtorId: string): Promise<void>
}
```

---

## API Endpoints

### Client Info Request
```
POST   /api/address-discovery/client-info-request
GET    /api/address-discovery/client-info-request/case/:caseId
PUT    /api/address-discovery/client-info-request/:id/respond
POST   /api/address-discovery/client-info-request/:id/resend
```

### UYAP Queries
```
POST   /api/address-discovery/uyap-query
GET    /api/address-discovery/uyap-query/debtor/:caseDebtorId
PUT    /api/address-discovery/uyap-query/:id/response
POST   /api/address-discovery/uyap-query/:id/process-addresses
```

### Institution Letters
```
POST   /api/address-discovery/institution-letter
GET    /api/address-discovery/institution-letter/debtor/:caseDebtorId
PUT    /api/address-discovery/institution-letter/:id/sent
PUT    /api/address-discovery/institution-letter/:id/responded
GET    /api/address-discovery/institution-letter/:id/download
```

### Cross-File
```
GET    /api/address-discovery/cross-file/:debtorId
POST   /api/address-discovery/cross-file/copy-address
```

### Research Status
```
GET    /api/address-discovery/research/:caseDebtorId
POST   /api/address-discovery/research/:caseDebtorId/start
GET    /api/address-discovery/research/:caseDebtorId/timeline
GET    /api/address-discovery/research/:caseDebtorId/suggestions
```

### Confidence Score
```
GET    /api/address-discovery/confidence/:addressId
GET    /api/address-discovery/confidence/:addressId/breakdown
```

---

## Frontend Components

### New Components

```
apps/web/src/components/address-discovery/
├── AddressDiscoveryPanel.tsx       # Ana panel (drawer içinde)
├── ResearchStatusCard.tsx          # Araştırma durumu kartı
├── ResearchTimeline.tsx            # Araştırma geçmişi timeline
├── ClientInfoRequestCard.tsx       # Müvekkil talebi kartı
├── UyapQueryList.tsx               # UYAP sorguları listesi
├── UyapQueryModal.tsx              # Yeni sorgu oluşturma modal
├── InstitutionLetterList.tsx       # Kurum yazıları listesi
├── InstitutionLetterModal.tsx      # Yeni yazı oluşturma modal
├── CrossFileAddressPanel.tsx       # Diğer dosyalardaki adresler
├── ConfidenceScoreBadge.tsx        # Güven skoru badge
└── ResearchSuggestionAlert.tsx     # Öneri uyarısı
```

### Integration Points

1. **DebtorDetailDrawer**: "Adres Araştırma" tab'ı ekle
2. **AddressCard**: Güven skoru badge'i ekle
3. **CaseDetail**: Müvekkil bilgi talebi durumu göster
4. **DebtorRow**: "Farklı adres var" uyarı badge'i

---

## Workflow Automation

### Query Hierarchy (Sorgu Hiyerarşisi)

Adres bulunamazsa otomatik olarak bir üst sorguya geçiş:

```typescript
const QUERY_HIERARCHY = [
  { code: 'AA', type: 'NUFUS_ADRES', name: 'MERNİS', priority: 1 },
  { code: 'AB', type: 'SGK', name: 'SGK İşyeri', priority: 2 },
  { code: 'AF', type: 'TICARET_ODASI', name: 'Ticaret Odası', priority: 3 },
  { code: 'AJ', type: 'VERGI_DAIRESI', name: 'Vergi Dairesi', priority: 4 },
  { code: 'AR', type: 'GSM', name: 'GSM Operatörleri', priority: 5 },
  { code: 'AL', type: 'GUMRUK', name: 'Gümrük', priority: 6 },
  { code: 'AH', type: 'ORTAKLAR', name: 'Şirket Ortakları', priority: 7 },
  { code: 'AN', type: 'AILE', name: 'Aile Üyeleri', priority: 8 },
  { code: 'AP', type: 'ORTAK_DETAY', name: 'Ortak Detayları', priority: 9 },
];

// Bir sonraki sorguyu öner
function suggestNextQuery(completedQueries: UyapQueryType[]): UyapQueryType | null {
  const completedCodes = completedQueries.map(q => getQueryCode(q));
  
  for (const query of QUERY_HIERARCHY) {
    if (!completedCodes.includes(query.code)) {
      return query.type;
    }
  }
  
  return null; // Tüm sorgular tamamlandı
}
```

### Debtor Type Based Query Selection

```typescript
// Gerçek kişi için öncelikli sorgular
const INDIVIDUAL_QUERIES = ['AA', 'AB', 'AR', 'AN'];

// Tüzel kişi için öncelikli sorgular
const COMPANY_QUERIES = ['AF', 'AJ', 'AB', 'AH', 'AP'];

function getRecommendedQueries(debtorType: DebtorType): string[] {
  return debtorType === 'COMPANY' || debtorType === 'PUBLIC_INSTITUTION'
    ? COMPANY_QUERIES
    : INDIVIDUAL_QUERIES;
}
```

### Auto-Trigger Rules

```typescript
// Araştırma tetikleme kuralları
interface ResearchTrigger {
  condition: string;
  action: string;
  priority: number;
}

const RESEARCH_TRIGGERS: ResearchTrigger[] = [
  // 2 başarısız tebligat → UYAP AA öner
  {
    condition: 'failedNotifications >= 2 && !uyapAACompleted',
    action: 'SUGGEST_UYAP_AA',
    priority: 1
  },
  
  // MERNİS + işyeri uyumsuz → SGK sorgusu öner
  {
    condition: 'mernisAddress && businessAddress && mernisAddress !== businessAddress',
    action: 'SUGGEST_UYAP_AB',
    priority: 2
  },
  
  // Dosya tutarı > 50.000 TL → Tüm sorguları öner
  {
    condition: 'caseAmount > 50000 && researchStatus === NOT_STARTED',
    action: 'SUGGEST_FULL_RESEARCH',
    priority: 3
  },
  
  // Tüzel kişi → Ticaret Sicili öncelikli
  {
    condition: 'debtorType === COMPANY && !uyapAFCompleted',
    action: 'SUGGEST_UYAP_AF',
    priority: 1
  },
  
  // 3+ iade → Kurum yazısı öner
  {
    condition: 'failedNotifications >= 3 && !institutionLettersSent',
    action: 'SUGGEST_INSTITUTION_LETTERS',
    priority: 4
  },
  
  // Tüm adresler tükendi → Kurum yazısı öner
  {
    condition: 'allAddressesExhausted && !institutionLettersSent',
    action: 'SUGGEST_INSTITUTION_LETTERS',
    priority: 5
  }
];

// Öneri hesaplama
function calculateSuggestions(research: AddressResearch): ResearchSuggestion[] {
  const suggestions: ResearchSuggestion[] = [];
  
  for (const trigger of RESEARCH_TRIGGERS) {
    if (evaluateCondition(trigger.condition, research)) {
      suggestions.push({
        action: trigger.action,
        priority: trigger.priority,
        reason: getReasonText(trigger.action)
      });
    }
  }
  
  return suggestions.sort((a, b) => a.priority - b.priority);
}
```

---

## Confidence Score Algorithm

```typescript
function calculateConfidenceScore(address: DebtorAddress): number {
  let score = 0;
  
  // 1. Kaynak güvenilirliği (40%)
  const sourceScores = {
    MERNIS: 100, UYAP: 90, MERSIS: 85, UYAP_AA: 90, UYAP_AB: 80,
    UYAP_AF: 85, UYAP_AJ: 75, SGK_LETTER: 80, VERGI_LETTER: 75,
    CLIENT: 50, CROSS_FILE: 40, MANUAL: 30, OTHER: 20
  };
  score += (sourceScores[address.source] || 20) * 0.4;
  
  // 2. Doğrulama durumu (25%)
  if (address.verified) score += 100 * 0.25;
  else if (address.verifiedAt) score += 50 * 0.25; // Eski doğrulama
  
  // 3. Güncellik (20%)
  const daysSinceUpdate = daysBetween(address.updatedAt, now());
  if (daysSinceUpdate < 30) score += 100 * 0.2;
  else if (daysSinceUpdate < 90) score += 75 * 0.2;
  else if (daysSinceUpdate < 180) score += 50 * 0.2;
  else if (daysSinceUpdate < 365) score += 25 * 0.2;
  
  // 4. Tebligat başarı oranı (15%)
  const successRate = address.successfulNotifications / address.totalNotifications;
  score += (successRate * 100) * 0.15;
  
  return Math.round(score);
}
```

---

## Email Templates

### Client Info Request Email

```typescript
const clientInfoEmailTemplate = (data: {
  clientName: string;
  debtorName: string;
  caseNumber: string;
  lawyerName: string;
  firmName: string;
}) => `
Sayın ${data.clientName},

Tarafınız adına başlatılan icra dosyasında yer alan borçluya ilişkin 
elinizde bulunan adres, telefon, e-posta ve diğer iletişim bilgilerini 
tarafımıza iletmenizi rica ederiz.

Borçlu: ${data.debtorName}
Dosya No: ${data.caseNumber}

Bu bilgiler, tebligat işlemlerinin sağlıklı yürütülmesi için gereklidir.

Bilgilerinizi bu e-postaya yanıt olarak iletebilirsiniz.

Saygılarımızla,
${data.lawyerName}
${data.firmName}
`;
```

---

## Notes

- UYAP API entegrasyonu şimdilik manuel (sorgu sonuçları elle girilir)
- Email gönderimi için mevcut notification modülü kullanılacak
- Word dosyası oluşturma için `docx` kütüphanesi kullanılacak
- Güven skoru her adres güncellemesinde yeniden hesaplanacak
