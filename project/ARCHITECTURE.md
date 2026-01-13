# Mimari Kılavuz

Bu belge sistemin "tek kaynak" (single source of truth) mimarisini tanımlar.
PR review'larda bu belge referans alınmalıdır.

## Source of Truth Matrix

| Domain | Tek Sahip | Deprecated Modüller | Notlar |
|--------|-----------|---------------------|--------|
| **Faiz Hesaplama** | `interest-engine` | `rule-engine.calculateLegalInterest()`, `claim-engine.getInterestRate()` | Tüm faiz hesaplamaları `interest-engine` üzerinden |
| **Oran Okuma** | `interest-engine/RateProviderService` | `claim-engine.interest_rate_table`, `fee-engine.getInterestRate()` | Tek rate source |
| **Policy/Gate Kararları** | `policy-engine` | `validation-gate`, `rule-engine` | Tüm gate kontrolleri `policy-engine/gate-checker` üzerinden |
| **Masraf Hesaplama** | `fee-engine` | - | Hesaplama tek kaynak, `ITariffRepository` üzerinden tarife okur |
| **Tarife Yönetimi** | `tariff` | - | Admin/CRUD + YAML store + `ITariffRepository` implementasyonu |
| **Masraf Avansı Ledger** | `case-balance` → `advance-ledger` | - | İsim değişikliği planlanıyor |

## Shared Contracts

Tüm modüller arası iletişim `packages/types` üzerinden yapılmalıdır:

```typescript
// ✅ DOĞRU
import { InterestTypeCode } from '@shared/types';
import { PolicyDecision, GateResult, ActionCode } from '@shared/types';

// ❌ YANLIŞ - Modül içi tip kullanımı
import { InterestTypeCode } from '../interest-engine/types/domain.types';
import { PolicyDecision } from '../policy-engine/types';
```

### Mevcut Shared Contracts

| Dosya | İçerik |
|-------|--------|
| `packages/types/src/interest.ts` | `InterestTypeCode`, `RateSourceType`, `Currency` |
| `packages/types/src/policy.ts` | `ActionCode`, `GateCode`, `PolicyDecision`, `GateResult`, `DecisionCode` |

## Deprecation Kuralları

### 1. Deprecated Modül Kullanımı

```typescript
/**
 * @deprecated Use policy-engine/gate-checker instead
 * Migration: Phase 3 sonunda silinecek
 * @see ARCHITECTURE.md
 */
```

### 2. Adapter Pattern

Deprecated modüller hemen silinmez, önce adapter'a dönüştürülür:

```typescript
// validation-gate.service.ts
/** @deprecated Use policy-engine/gate-checker */
async validateGate(caseId: string, gateId: GateId): Promise<GateValidationResult> {
  // Artık kendi mantığı yok, sadece policy-engine'e paslar
  const result = await this.policyEngineGateChecker.checkGates(caseId, actionCode, facts);
  return this.mapToLegacyFormat(result);
}
```

### 3. Silme Süreci

1. `@deprecated` annotation ekle
2. Adapter pattern uygula (eski API'yi koru, yeni engine'e pasla)
3. Tüm kullanımları yeni engine'e taşı
4. CI'da import kontrolü ekle
5. Modülü sil

## Pipeline Standardı

Tüm hesaplama engine'leri aynı pipeline pattern'ı izler:

```
Input → Normalize → Policy Gate → Compute → Audit/Evidence → Export
```

### Örnek: Interest Engine Pipeline

```
CalculationRequest
  → InputNormalizer (tarih/tutar normalizasyonu)
  → PolicyGateV2 (TBK 100, LEGAL_REPORT kontrolü)
  → SegmentBuilder (dönem hesaplama)
  → AllocationEngine (TBK 100 mahsup)
  → AuditWriter (evidence kaydı)
  → LegalReportRenderer (çıktı)
```

## Modül Bağımlılık Kuralları

### İzin Verilen Bağımlılıklar

```
packages/types ← Tüm modüller (shared contracts)
prisma ← Tüm modüller (DB erişimi)
interest-engine ← claim-engine (oran okuma için)
policy-engine ← validation-gate (adapter olarak)
fee-engine ← tariff (tarife okuma için)
```

### Yasak Bağımlılıklar

```
❌ interest-engine → claim-engine (döngüsel)
❌ policy-engine → rule-engine (deprecated)
❌ fee-engine → claim-engine (domain karışıklığı)
```

## Yeni Modül Ekleme Kuralları

1. `packages/types`'a contract ekle
2. Mevcut "tek sahip" ile çakışma kontrolü yap
3. Pipeline pattern'ı uygula
4. Audit/evidence mekanizması ekle
5. Bu belgeyi güncelle

---

Son güncelleme: 2026-01-14
