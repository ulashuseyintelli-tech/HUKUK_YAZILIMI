# Case Detail Components

Bu klasör, takip detay sayfası (`cases/[id]/page.tsx`) için modüler bileşenler içerir.

## Bileşenler

### 1. CaseHeader
Sıkıştırılmış tek satır header - dosya no, statü, UYAP durumu, kalan gün gösterir.

```tsx
<CaseHeader
  fileNumber="2026/3"
  executionFileNumber="2025/12345 E."
  caseStatus="DERDEST"
  type="Genel Haciz"
  executionOffice={{ name: "Adana 2. Genel İcra", city: "Adana" }}
  uyapBirimKodu="1234567"
  lastEnforcementActionAt="2025-12-01"
  caseDate="2025-01-15"
/>
```

### 2. CaseTypeWidget
Takip türü badge + dropdown detay paneli.

```tsx
<CaseTypeWidget
  type="Genel Haciz"
  subType="İlamsız"
  executionPath="HACİZ"
  subCategory="GENEL"
/>
```

### 3. MiniFinanceWidget
Mini hesap özeti widget - asıl, tahsil, masraf, açık bakiye gösterir.

```tsx
<MiniFinanceWidget
  principalAmount={325000}
  collectedAmount={0}
  expenseAmount={0}
  currency="TRY"
  onClick={() => setFinanceDrawerOpen(true)}
/>
```

### 4. CasePartiesSection
Dosya Ekibi, Müvekkiller, Borçlular - 3 kolonlu grid.

```tsx
<CasePartiesSection
  lawyers={caseData.lawyers}
  staff={caseData.staff}
  clients={caseData.caseClients}
  debtors={caseDebtors}
  onLawyerClick={handleLawyerClick}
  onClientClick={handleClientClick}
  onDebtorClick={handleDebtorClick}
  onAddTeamMember={() => setTeamModalOpen(true)}
/>
```

### 5. OperationalRow
Alacak Kalemleri, Ödemeler, Yapılacak İşler - 3 kolonlu operasyonel alan.

```tsx
<OperationalRow
  claimItems={caseData.claimItems}
  payments={payments}
  tasks={tasks}
  principalAmount={325000}
  collectedAmount={0}
  currency="TRY"
  onAddClaimItem={() => {}}
  onAddPayment={() => {}}
/>
```

### 6. AccordionTabs
Notlar, Masraflar, UYAP, Log, İlişkili Dosyalar, Chat - accordion/tab yapısı.

```tsx
<AccordionTabs
  notes={notes}
  expenses={expenses}
  uyapQueries={uyapQueries}
  logs={logs}
  relatedCases={relatedCases}
  messages={messages}
  onAddNote={() => {}}
  onAddExpense={() => {}}
/>
```

## Kullanım

```tsx
import { 
  CaseHeader, 
  CaseTypeWidget, 
  MiniFinanceWidget,
  CasePartiesSection,
  OperationalRow,
  AccordionTabs 
} from "@/components/case-detail";
```

## Mimari

Wireframe'e göre sayfa yapısı:

```
┌─────────────────────────────────────────────────────────────┐
│ CaseHeader + CaseTypeWidget + MiniFinanceWidget + Actions   │ ← Üst Header
├─────────────────────────────────────────────────────────────┤
│ CasePartiesSection (3 kolon)                                │ ← Taraflar
├─────────────────────────────────────────────────────────────┤
│ OperationalRow (3 kolon - her zaman açık)                   │ ← Operasyon
├─────────────────────────────────────────────────────────────┤
│ AccordionTabs (varsayılan kapalı)                           │ ← Derinlik
└─────────────────────────────────────────────────────────────┘
```

## Durum

- [x] CaseHeader - Tamamlandı, entegre edildi
- [x] CaseTypeWidget - Tamamlandı, entegre edildi
- [x] MiniFinanceWidget - Tamamlandı, entegre edildi
- [x] CasePartiesSection - Tamamlandı, entegrasyon bekliyor
- [x] OperationalRow - Tamamlandı, entegrasyon bekliyor
- [x] AccordionTabs - Tamamlandı, entegrasyon bekliyor

## Notlar

Mevcut `cases/[id]/page.tsx` dosyası 2700+ satır ve çok karmaşık. Kademeli refactoring önerilir:

1. Header bileşenleri entegre edildi ✅
2. Parties, Operational, Accordion bileşenleri hazır, entegrasyon için mevcut kodun dikkatli analizi gerekli
3. Drawer ve modal'lar mevcut yapıda kalabilir
