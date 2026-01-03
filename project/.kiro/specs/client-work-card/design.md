# Müvekkil Çalışma Kartı - Teknik Tasarım

## Yaklaşım
Mevcut client drawer'ı yerinde refactor edilecek. Yeni API endpoint yerine mevcut case data'dan aggregation yapılacak (performans için).

## Veri Stratejisi

### Seçenek A: Frontend Aggregation (Tercih Edilen)
- Case detail sayfasında zaten `caseData` mevcut
- Müvekkile ait tüm case'leri çekmek için `api.getCases({ clientId })` kullanılabilir
- Drawer açıldığında lazy load

### Seçenek B: Backend Endpoint
- Yeni `/clients/:id/summary` endpoint
- Daha temiz ama ek backend çalışması gerektirir

**Karar:** Seçenek A ile başla, performans sorunu olursa B'ye geç.

## Bileşen Yapısı

```
ClientWorkCard (drawer content)
├── ClientHeader
│   ├── Name + Type Badge
│   └── TCKN/VKN + Phone
├── CaseVolumeSection
│   ├── ActiveCount (clickable)
│   └── TotalCount (clickable)
├── FinancialSummarySection
│   ├── TotalReceivable
│   ├── TotalCollected
│   └── TotalExpense (color-coded)
├── RiskIndicatorsSection
│   ├── ExpiryWarning (clickable)
│   ├── PendingNotification (clickable)
│   └── SuspendedCases (clickable)
└── QuickActionsSection
    ├── ViewCasesButton
    ├── SendMessageButton
    ├── AddExpenseButton
    └── NewCaseButton
```

## State Yönetimi

```typescript
// Drawer açıldığında fetch edilecek
const [clientStats, setClientStats] = useState<{
  activeCases: number;
  totalCases: number;
  totalReceivable: number;
  totalCollected: number;
  totalExpense: number;
  expenseCollected: number;
  nearExpiryCases: number;
  pendingNotifications: number;
  suspendedCases: number;
} | null>(null);

const [loadingStats, setLoadingStats] = useState(false);
```

## API Çağrısı

```typescript
// Drawer açıldığında
useEffect(() => {
  if (clientDrawerOpen && selectedClient?.id) {
    fetchClientStats(selectedClient.id);
  }
}, [clientDrawerOpen, selectedClient?.id]);

const fetchClientStats = async (clientId: string) => {
  setLoadingStats(true);
  try {
    // Müvekkile ait tüm case'leri çek
    const cases = await api.getCases({ clientId, limit: 1000 });
    
    // Aggregation yap
    const stats = {
      activeCases: cases.filter(c => c.caseStatus === 'ACTIVE').length,
      totalCases: cases.length,
      totalReceivable: cases.reduce((sum, c) => sum + (c.principalAmount || 0), 0),
      totalCollected: cases.reduce((sum, c) => sum + (c.totalCollected || 0), 0),
      totalExpense: cases.reduce((sum, c) => sum + (c.totalExpense || 0), 0),
      expenseCollected: cases.reduce((sum, c) => sum + (c.expenseCollected || 0), 0),
      nearExpiryCases: cases.filter(c => c.remainingDays && c.remainingDays < 60).length,
      pendingNotifications: cases.filter(c => c.hasPendingNotification).length,
      suspendedCases: cases.filter(c => c.caseStatus === 'SUSPENDED').length,
    };
    setClientStats(stats);
  } finally {
    setLoadingStats(false);
  }
};
```

## Renk Kodlaması (Masraf)

```typescript
const getExpenseColor = (expense: number, expenseCollected: number) => {
  if (expense === 0) return 'text-gray-500 bg-gray-50'; // Masraf yok
  if (expenseCollected === 0) return 'text-red-600 bg-red-50'; // Masraf var, tahsil yok
  if (expenseCollected >= expense) return 'text-green-600 bg-green-50'; // Tam tahsil
  return 'text-amber-600 bg-amber-50'; // Kısmi tahsil
};
```

## Navigasyon

```typescript
// Dosyalara git (filtreli)
const goToCases = (filter?: string) => {
  const params = new URLSearchParams({ clientId: selectedClient.id });
  if (filter) params.set('filter', filter);
  router.push(`/cases?${params}`);
};

// Yeni takip aç (müvekkil seçili)
const goToNewCase = () => {
  router.push(`/cases/new?clientId=${selectedClient.id}`);
};
```

## Implementasyon Adımları

1. ✅ Spec ve design dosyaları oluştur
2. [ ] Mevcut drawer içeriğini yedekle
3. [ ] ClientHeader bölümünü implement et
4. [ ] CaseVolumeSection implement et
5. [ ] FinancialSummarySection implement et
6. [ ] RiskIndicatorsSection implement et
7. [ ] QuickActionsSection implement et
8. [ ] Stats fetch logic ekle
9. [ ] Loading state ekle
10. [ ] Test et

## Dosya Değişiklikleri

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` | Drawer içeriği refactor |

## Risk ve Azaltma

| Risk | Azaltma |
|------|---------|
| Çok fazla API çağrısı | Drawer açıldığında tek seferde fetch, cache |
| Büyük müvekkillerde yavaşlık | Limit + pagination, backend endpoint'e geçiş |
| Mevcut fonksiyonellik kaybı | Mevcut butonları koru (Mesaj, Düzenle) |
