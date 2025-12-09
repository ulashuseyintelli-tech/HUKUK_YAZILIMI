# Design Document

## Overview

Akıllı Form Sihirbazı, icra takip formu seçim sürecini kullanıcı dostu bir deneyime dönüştürür. Sistem, 4 soruluk bir karar ağacı ile kullanıcının durumunu analiz eder ve en uygun formu önerir. Formlar hukuki kategorilere göre gruplandırılır, her form için açıklayıcı bilgiler sunulur ve yanlış form seçimleri otomatik tespit edilir.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NewCasePage Component                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  FormWizard     │  │  FormSelector   │  │  FormDetails    │  │
│  │  (Sihirbaz)     │  │  (Liste/Grid)   │  │  (Modal)        │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│  ┌─────────────────────────────┴─────────────────────────────┐  │
│  │                    Form State Manager                      │  │
│  │  - selectedForm, selectedSubForm                          │  │
│  │  - wizardAnswers, recommendedForm                         │  │
│  │  - recentForms, frequentForms                             │  │
│  └─────────────────────────────┬─────────────────────────────┘  │
│                                │                                │
│  ┌─────────────────────────────┴─────────────────────────────┐  │
│  │                    Form Metadata Config                    │  │
│  │  - caseFormTypes[] with extended metadata                 │  │
│  │  - categories, descriptions, examples                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Form Metadata Interface

```typescript
interface FormMetadata {
  code: string;
  name: string;
  title: string;           // Hukuki başlık (örn: "Kambiyo Senedine Dayalı Takip")
  description: string;     // Kısa açıklama
  category: FormCategory;
  uyapCode: string;
  iikMaddesi: string;      // İİK maddesi referansı
  usageScenario: string;   // 1 satırlık kullanım senaryosu
  exampleCase: string;     // Örnek dava açıklaması
  requiredDocuments: string[];
  hasJudgment: boolean;    // İlam gerekli mi?
  needsMortgage: boolean;  // İpotek/rehin var mı?
  isKambiyo: boolean;      // Kambiyo senedine dayalı mı?
  isRental: boolean;       // Kira ile ilgili mi?
  subForms?: SubFormMetadata[];
}

interface SubFormMetadata {
  code: string;
  name: string;
  title: string;
  uyapCode: string;
  usageScenario: string;
}

type FormCategory = 'GENEL_ICRA' | 'KAMBIYO' | 'IPOTEK_REHIN' | 'IFLAS' | 'KIRA';
```

### 2. Wizard State Interface

```typescript
interface WizardState {
  currentStep: number;
  answers: {
    hasJudgment: boolean | null;      // Soru 1: İlam var mı?
    isKambiyo: boolean | null;        // Soru 2: Kambiyo senedi mi?
    hasMortgage: boolean | null;      // Soru 3: İpotek/rehin var mı?
    isRental: boolean | null;         // Soru 4: Kira mı?
  };
  recommendedForm: FormMetadata | null;
  showAllForms: boolean;
}
```

### 3. User Form History Interface

```typescript
interface FormUsageHistory {
  formCode: string;
  usageCount: number;
  lastUsedAt: Date;
}
```

## Data Models

### Form Metadata Configuration

```typescript
const formMetadata: FormMetadata[] = [
  {
    code: "FORM_7",
    name: "Form 7",
    title: "İlamsız İcra Takibi",
    description: "İlamsız İcra (49)",
    category: "GENEL_ICRA",
    uyapCode: "49",
    iikMaddesi: "İİK m. 42-49",
    usageScenario: "Fatura, sözleşme, cari hesap, yazılı belge – kambiyo senedi değil – ilam yok.",
    exampleCase: "X A.Ş.'nin Y Ltd.'ye kestiği fatura alacağının tahsili",
    requiredDocuments: ["fatura", "sözleşme", "cari_hesap_ekstresi"],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: false
  },
  {
    code: "FORM_2_3_4_5",
    name: "Form 2-3-4-5",
    title: "İlamlı İcra Takibi",
    description: "İlamlı İcra (53-54-55)",
    category: "GENEL_ICRA",
    uyapCode: "53-54-55",
    iikMaddesi: "İİK m. 32-38",
    usageScenario: "Mahkeme kararı / hakem kararı / ilam niteliğinde belgeye dayalı para veya teminat alacağı.",
    exampleCase: "Kesinleşmiş mahkeme kararına dayalı tazminat alacağının tahsili",
    requiredDocuments: ["ilam", "kesinlesme_serhi", "vekaletname"],
    hasJudgment: true,
    needsMortgage: false,
    isKambiyo: false,
    isRental: false,
    subForms: [
      { code: "FORM_2_5_TASINIR", name: "Form 2-5", title: "Taşınır Teslimi", uyapCode: "53-54", usageScenario: "Taşınır mal teslimi kararının icrası" },
      { code: "FORM_2_5_TASINMAZ", name: "Form 2-5", title: "Taşınmaz Tahliye Ve Teslimi", uyapCode: "53-54", usageScenario: "Taşınmaz tahliye ve teslim kararının icrası" },
      { code: "FORM_2_5_TAHLIYE", name: "Form 2-5", title: "Tahliye", uyapCode: "53-54", usageScenario: "Tahliye kararının icrası" },
      { code: "FORM_3_5_COCUK", name: "Form 3-5", title: "Çocuk Teslimi", uyapCode: "53-55", usageScenario: "Çocuk teslimi kararının icrası" },
      { code: "FORM_4_IS", name: "Form 4", title: "İşin Yapılması", uyapCode: "53", usageScenario: "Bir işin yapılması kararının icrası" },
      { code: "FORM_4_IRTIFAK", name: "Form 4", title: "İrtifak Hakkı", uyapCode: "53", usageScenario: "İrtifak hakkı tesisi kararının icrası" },
      { code: "FORM_5_TEMINAT", name: "Form 5", title: "Teminat", uyapCode: "53", usageScenario: "Teminat alacağının tahsili" },
      { code: "FORM_5_ALACAK", name: "Form 5", title: "Alacak", uyapCode: "53", usageScenario: "Para alacağının tahsili" }
    ]
  },
  {
    code: "FORM_10",
    name: "Form 10",
    title: "Kambiyo Senedine Dayalı Takip",
    description: "Kambiyo Senetleri (163)",
    category: "KAMBIYO",
    uyapCode: "163",
    iikMaddesi: "İİK m. 167-176",
    usageScenario: "Bono / poliçe / çek alacağının tahsili – özel kambiyo takibi.",
    exampleCase: "Vadesi geçmiş 100.000 TL'lik bono alacağının tahsili",
    requiredDocuments: ["kambiyo_senedi_aslı", "protesto", "vekaletname"],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: true,
    isRental: false
  },
  {
    code: "FORM_12",
    name: "Form 12",
    title: "İflas Yoluyla Kambiyo Takibi",
    description: "İflas Kambiyo Senetleri (152)",
    category: "KAMBIYO",
    uyapCode: "152",
    iikMaddesi: "İİK m. 167, 171",
    usageScenario: "Kambiyo senedine dayalı iflas yoluyla takip.",
    exampleCase: "Tacir borçluya karşı çek alacağı için iflas takibi",
    requiredDocuments: ["kambiyo_senedi_aslı", "ticaret_sicil_kaydı"],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: true,
    isRental: false
  },
  {
    code: "FORM_6",
    name: "Form 6",
    title: "İpotekli İlamlı Takip",
    description: "İpotek İlamlı (151)",
    category: "IPOTEK_REHIN",
    uyapCode: "151",
    iikMaddesi: "İİK m. 149-150",
    usageScenario: "İpotek akit tablosuna veya ilama dayalı ipotek alacağının tahsili.",
    exampleCase: "Banka kredisi için tesis edilen ipotek alacağının tahsili",
    requiredDocuments: ["ipotek_akit_tablosu", "ilam", "tapu_kaydı"],
    hasJudgment: true,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false
  },
  {
    code: "FORM_9",
    name: "Form 9",
    title: "İpotekli İlamsız Takip",
    description: "İpotek İlamsız (152)",
    category: "IPOTEK_REHIN",
    uyapCode: "152",
    iikMaddesi: "İİK m. 148",
    usageScenario: "İpotek akit tablosuna dayalı (ilamsız) ipotek alacağının tahsili.",
    exampleCase: "Vadesi gelmiş ipotek alacağının ilamsız takibi",
    requiredDocuments: ["ipotek_akit_tablosu", "hesap_özeti", "tapu_kaydı"],
    hasJudgment: false,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false
  },
  {
    code: "FORM_8",
    name: "Form 8",
    title: "Taşınır Rehni Takibi",
    description: "Taşınır Rehni (50)",
    category: "IPOTEK_REHIN",
    uyapCode: "50",
    iikMaddesi: "İİK m. 145-147",
    usageScenario: "Taşınır rehni (ticari işletme rehni, araç rehni vb.) alacağının tahsili.",
    exampleCase: "Araç rehni karşılığı verilen kredi alacağının tahsili",
    requiredDocuments: ["rehin_sözleşmesi", "sicil_kaydı"],
    hasJudgment: false,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false
  },
  {
    code: "FORM_44",
    name: "Form 44",
    title: "Taşınır Rehni İlamlı Takip",
    description: "Taşınır Rehni İlamlı (201)",
    category: "IPOTEK_REHIN",
    uyapCode: "201",
    iikMaddesi: "İİK m. 145-147, 32-38",
    usageScenario: "İlama dayalı taşınır rehni alacağının tahsili.",
    exampleCase: "Mahkeme kararına dayalı rehinli alacağın tahsili",
    requiredDocuments: ["ilam", "rehin_sözleşmesi", "sicil_kaydı"],
    hasJudgment: true,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false
  },
  {
    code: "FORM_11",
    name: "Form 11",
    title: "İflas Adi Takip",
    description: "İflas Adı Takip (153)",
    category: "IFLAS",
    uyapCode: "153",
    iikMaddesi: "İİK m. 154-166",
    usageScenario: "Tacir borçluya karşı adi alacak için iflas yoluyla takip.",
    exampleCase: "Ticaret şirketine karşı fatura alacağı için iflas takibi",
    requiredDocuments: ["alacak_belgesi", "ticaret_sicil_kaydı"],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: false
  },
  {
    code: "FORM_13",
    name: "Form 13",
    title: "Kira Alacağı Takibi",
    description: "Kira Alacakları (51)",
    category: "KIRA",
    uyapCode: "51",
    iikMaddesi: "İİK m. 269-269/d",
    usageScenario: "Kira sözleşmesine dayalı kira borçlarının tahsili – konut/işyeri.",
    exampleCase: "3 aylık birikmiş kira alacağının tahsili",
    requiredDocuments: ["kira_sözleşmesi", "ihtarname"],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: true
  },
  {
    code: "FORM_14",
    name: "Form 14",
    title: "Tahliye Takibi",
    description: "Tahliye (56)",
    category: "KIRA",
    uyapCode: "56",
    iikMaddesi: "İİK m. 272-276",
    usageScenario: "Kira sözleşmesi sona ermiş kiracının tahliyesi.",
    exampleCase: "Kira süresi dolan kiracının tahliye takibi",
    requiredDocuments: ["kira_sözleşmesi", "fesih_ihtarnamesi"],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: true
  }
];
```

### Category Configuration

```typescript
const formCategories = [
  { code: 'GENEL_ICRA', label: 'Genel İcra', icon: 'FileText' },
  { code: 'KAMBIYO', label: 'Kambiyo', icon: 'Receipt' },
  { code: 'IPOTEK_REHIN', label: 'İpotek / Rehin', icon: 'Building' },
  { code: 'IFLAS', label: 'İflas', icon: 'AlertTriangle' },
  { code: 'KIRA', label: 'Kira', icon: 'Home' }
];
```

### Wizard Questions Configuration

```typescript
const wizardQuestions = [
  {
    id: 'hasJudgment',
    question: 'Elinde mahkeme kararı veya ilam var mı?',
    description: 'Kesinleşmiş mahkeme kararı, hakem kararı veya ilam niteliğinde belge',
    options: [
      { value: true, label: 'Evet, ilam var' },
      { value: false, label: 'Hayır, ilam yok' }
    ]
  },
  {
    id: 'isKambiyo',
    question: 'Alacak kambiyo senedine mi dayanıyor?',
    description: 'Bono, poliçe veya çek',
    options: [
      { value: true, label: 'Evet, kambiyo senedi var' },
      { value: false, label: 'Hayır, kambiyo senedi yok' }
    ]
  },
  {
    id: 'hasMortgage',
    question: 'Alacak ipotek veya rehne mi dayanıyor?',
    description: 'Taşınmaz ipoteği veya taşınır rehni',
    options: [
      { value: true, label: 'Evet, ipotek/rehin var' },
      { value: false, label: 'Hayır, ipotek/rehin yok' }
    ]
  },
  {
    id: 'isRental',
    question: 'Takip konusu kira ile mi ilgili?',
    description: 'Kira alacağı veya tahliye',
    options: [
      { value: true, label: 'Evet, kira ile ilgili' },
      { value: false, label: 'Hayır, kira ile ilgili değil' }
    ]
  }
];
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Wizard Answer Filtering - Judgment
*For any* wizard state where hasJudgment is answered, filtering the form list should return only forms where the hasJudgment metadata matches the answer.
**Validates: Requirements 1.2**

### Property 2: Wizard Answer Filtering - Kambiyo
*For any* wizard state where isKambiyo is answered, filtering the form list should return only forms where the isKambiyo metadata matches the answer.
**Validates: Requirements 1.3**

### Property 3: Wizard Answer Filtering - Mortgage
*For any* wizard state where hasMortgage is answered, filtering the form list should return only forms where the needsMortgage metadata matches the answer.
**Validates: Requirements 1.4**

### Property 4: Wizard Answer Filtering - Rental
*For any* wizard state where isRental is answered, filtering the form list should return only forms where the isRental metadata matches the answer.
**Validates: Requirements 1.5**

### Property 5: Category Grouping Completeness
*For any* form in the form list, the form must belong to exactly one of the 5 defined categories (GENEL_ICRA, KAMBIYO, IPOTEK_REHIN, IFLAS, KIRA).
**Validates: Requirements 2.1**

### Property 6: Category Filter Correctness
*For any* selected category filter, the filtered form list should contain only forms whose category matches the selected filter.
**Validates: Requirements 2.2**

### Property 7: All Forms Category Distribution
*For any* form list displayed with "Tümü" filter, grouping forms by category should produce non-overlapping groups that together contain all forms.
**Validates: Requirements 2.3**

### Property 8: Form Card Content Completeness
*For any* form metadata, the rendered card should contain the title, name, uyapCode, and iikMaddesi fields.
**Validates: Requirements 3.1, 3.2**

### Property 9: Form Usage History Persistence
*For any* form selection that results in a successful case creation, the form code should be added to the user's usage history with incremented count.
**Validates: Requirements 4.2**

### Property 10: Usage History Display Count
*For any* form in the usage history, the displayed count should match the actual number of times the form was used.
**Validates: Requirements 4.4**

### Property 11: Cross-check Kambiyo Inconsistency
*For any* case where Form 10 (Kambiyo) is selected but the case data indicates no kambiyo document, the system should generate a warning suggesting Form 7.
**Validates: Requirements 5.1**

### Property 12: Cross-check Rental Inconsistency
*For any* case where Form 7 (İlamsız) is selected but the case data indicates rental-related claim, the system should generate a warning suggesting Form 13.
**Validates: Requirements 5.2**

### Property 13: Form Metadata Schema Completeness
*For any* form metadata object, it must contain all required fields: code, name, title, description, category, uyapCode, iikMaddesi, usageScenario, hasJudgment, needsMortgage, isKambiyo, isRental.
**Validates: Requirements 6.1**

## Error Handling

1. **Invalid Wizard State**: If wizard answers lead to no matching forms, show all forms with a message "Kriterlere uygun form bulunamadı, tüm formlar gösteriliyor"
2. **Missing Form Metadata**: If a form is missing required metadata fields, log error and exclude from display
3. **LocalStorage Unavailable**: If localStorage is not available for usage history, gracefully degrade without history features
4. **Cross-check Override**: Allow users to proceed despite cross-check warnings with explicit confirmation

## Testing Strategy

### Unit Tests
- Test wizard question rendering
- Test form card rendering with all metadata fields
- Test category filter UI state changes
- Test modal open/close behavior

### Property-Based Tests
- Use fast-check library for property-based testing
- Test form filtering logic with random wizard answer combinations
- Test category grouping with random form sets
- Test cross-check logic with random form/data combinations
- Each property test should run minimum 100 iterations
- Tag each test with: **Feature: smart-form-wizard, Property {number}: {property_text}**
