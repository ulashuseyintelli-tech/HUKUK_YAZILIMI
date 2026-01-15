# Preview Coordinator Kullanım Kılavuzu

> **Amaç:** İki ayrı preview endpoint'ini (interest + fee) koordineli çağırmak ve riskleri yönetmek.

---

## 1. Temel Kullanım

```tsx
import { usePreviewCoordinator } from '@/hooks/usePreviewCoordinator';
import { PreviewStatusBanner, ConditionalValue } from '@/components/preview';
import { InterestTypeCode } from '@/lib/api/interest-engine';

function MyCalculationForm() {
  const { bundle, loading, execute, reset } = usePreviewCoordinator({
    debounceMs: 400,
  });

  // Form değiştiğinde preview hesapla
  const handleCalculate = async () => {
    await execute({
      principalAmount: 100000,
      currency: 'TRY',
      interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      caseType: 'CEK',
      debtorCount: 1,
    });
  };

  return (
    <div>
      {/* Status Banner */}
      <PreviewStatusBanner 
        bundle={bundle} 
        loading={loading}
        onRetry={handleCalculate}
      />

      {/* Sonuçlar */}
      <div className="mt-4 space-y-2">
        <div className="flex justify-between">
          <span>Faiz:</span>
          <ConditionalValue 
            value={bundle.interest?.estimatedInterest}
            formatter={(v) => `${v.toLocaleString('tr-TR')} ₺`}
            unavailableLabel="Hesaplanamadı"
          />
        </div>
        
        <div className="flex justify-between">
          <span>Masraf:</span>
          <ConditionalValue 
            value={bundle.fee?.estimatedFees}
            formatter={(v) => `${v.toLocaleString('tr-TR')} ₺`}
            unavailableLabel="Hesaplanamadı"
          />
        </div>
      </div>
    </div>
  );
}
```

---

## 2. PreviewStatus Durumları

| Status | Açıklama | UI Davranışı |
|--------|----------|--------------|
| `IDLE` | Henüz hesaplama yapılmadı | Banner gösterme |
| `LOADING` | Hesaplama devam ediyor | Spinner göster |
| `FULL` | Her iki hesaplama başarılı | Yeşil onay (opsiyonel) |
| `PARTIAL` | Biri başarılı, diğeri başarısız | Amber uyarı + detay |
| `UNAVAILABLE` | İkisi de başarısız | Kırmızı hata |

---

## 3. Version Mismatch Kontrolü

Hook otomatik olarak versiyon uyumsuzluğunu kontrol eder:

```tsx
if (bundle.versionMismatch) {
  console.warn('Versiyon uyumsuzluğu:', bundle.versionMismatch.type);
  // ENGINE_VERSION_MISMATCH: Ciddi - farklı motor sürümleri
  // RULE_VERSION_MISMATCH: Policy drift riski
}
```

---

## 4. Hata Yönetimi

```tsx
// Tüm hatalar bundle.errors array'inde
bundle.errors.forEach(error => {
  console.error(`[${error.source}] ${error.code}: ${error.message}`);
});

// Uyarılar bundle.warnings array'inde
bundle.warnings.forEach(warning => {
  console.warn(`[${warning.source}] ${warning.code}: ${warning.message}`);
});
```

---

## 5. Race Condition Önleme

Hook otomatik olarak race condition'ları önler:

1. Her request'e unique `requestHash` atanır
2. Response geldiğinde "hala son request mi?" kontrol edilir
3. Eski response'lar drop edilir

```tsx
// Hızlı yazarken eski response'lar otomatik drop edilir
const handleInputChange = (value: string) => {
  setAmount(value);
  execute({ principalAmount: parseFloat(value), ... });
};
```

---

## 6. Cache Bilgisi

```tsx
// Hangi sonuçlar cache'den geldi?
console.log('Interest cached:', bundle.cached.interest);
console.log('Fee cached:', bundle.cached.fee);
```

---

## 7. UnavailableValue Component

"0" yerine "—" veya "Hesaplanamadı" göstermek için:

```tsx
import { UnavailableValue, ConditionalValue } from '@/components/preview';

// Basit kullanım
{value === null ? <UnavailableValue /> : formatMoney(value)}

// ConditionalValue ile
<ConditionalValue 
  value={bundle.interest?.estimatedInterest}
  formatter={formatMoney}
  unavailableLabel="—"
/>
```

---

## 8. Kaydet Butonu Davranışı

```tsx
const canSave = bundle.status !== 'LOADING';

// UNAVAILABLE durumunda kaydet'e basılabilir
// Ama kaydet akışında full validate zorunlu
const handleSave = async () => {
  if (bundle.status === 'UNAVAILABLE' || bundle.status === 'PARTIAL') {
    // Kullanıcıya uyarı göster
    const confirmed = await confirm(
      'Önizleme eksik. Kaydetmeden önce tam doğrulama yapılacak.'
    );
    if (!confirmed) return;
  }
  
  // Full validate + save
  await saveCase();
};
```

---

## 9. Backlog: Birleşik Endpoint (Phase 3)

Gelecekte `POST /calc/preview/light` birleşik endpoint'e geçildiğinde:

```tsx
// Feature flag ile geçiş
const USE_UNIFIED_PREVIEW = process.env.NEXT_PUBLIC_USE_UNIFIED_PREVIEW === 'true';

// Hook içinde otomatik fallback
// Unified başarısız olursa legacy coordinator'a düş
```

---

## 10. Referanslar

- `hooks/usePreviewCoordinator.ts` - Hook implementasyonu
- `components/preview/PreviewStatusBanner.tsx` - UI bileşenleri
- `docs/single-source-of-truth-architecture.md` - Mimari doküman
