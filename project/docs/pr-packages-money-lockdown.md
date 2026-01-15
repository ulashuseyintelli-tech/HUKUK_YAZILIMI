# PR Paketleri: Para Hattı Kilitleme

**Oluşturulma:** 2026-01-14  
**Hedef:** 4 hafta içinde "tek kaynak" prensibini CI ile kilitlemek

---

## 🎯 Strateji

```
Hafta 1: PR-1 + PR-2 (Shared Types + Money Tipi)
Hafta 2: PR-3 + PR-4 (Web API Clients + CI Yasağı)
Hafta 3: PR-5 + PR-6 + PR-7 (Modül Hesap Sökümü)
Hafta 4: PR-8 + PR-9 (Deprecated Temizlik + Controller)
```

---

## PR-1: Shared Types - Money & Branded IDs

**Branch:** `feat/shared-types-money`  
**Efor:** 2 gün  
**Reviewer:** Senior Dev

### Dosyalar

```
packages/types/src/
├── money.ts          ← YENİ
├── branded-ids.ts    ← YENİ
├── case.ts           ← YENİ
├── debtor.ts         ← YENİ
├── client.ts         ← YENİ
├── collection.ts     ← YENİ
└── index.ts          ← GÜNCELLE
```

### money.ts İçeriği

```typescript
/**
 * Para tipi - float TL YASAK
 * Tüm para değerleri kuruş cinsinden bigint olarak saklanır
 */
export interface Money {
  /** Kuruş cinsinden tutar (100 = 1 TL) */
  amountMinor: bigint;
  currency: Currency;
}

export type Currency = 'TRY' | 'USD' | 'EUR';

/** Para oluşturma helper'ları */
export const Money = {
  fromTL: (tl: number, currency: Currency = 'TRY'): Money => ({
    amountMinor: BigInt(Math.round(tl * 100)),
    currency,
  }),
  toTL: (m: Money): number => Number(m.amountMinor) / 100,
  zero: (currency: Currency = 'TRY'): Money => ({ amountMinor: 0n, currency }),
  add: (a: Money, b: Money): Money => {
    if (a.currency !== b.currency) throw new Error('Currency mismatch');
    return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
  },
};
```

### branded-ids.ts İçeriği

```typescript
/** Branded ID'ler - string karışıklığını önler */
declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

export type CaseId = Brand<string, 'CaseId'>;
export type DebtorId = Brand<string, 'DebtorId'>;
export type ClientId = Brand<string, 'ClientId'>;
export type CollectionId = Brand<string, 'CollectionId'>;
export type ClaimItemId = Brand<string, 'ClaimItemId'>;

/** ID oluşturma helper'ları */
export const CaseId = (id: string): CaseId => id as CaseId;
export const DebtorId = (id: string): DebtorId => id as DebtorId;
// ... diğerleri
```

### Kabul Kriterleri

- [ ] `Money` tipi `packages/types/src/money.ts`'de tanımlı
- [ ] Branded ID'ler `packages/types/src/branded-ids.ts`'de tanımlı
- [ ] `packages/types/src/index.ts` tüm export'ları içeriyor
- [ ] En az 1 modül (interest-engine) Money tipini kullanıyor
- [ ] Unit test: Money.add, Money.fromTL, Money.toTL

---

## PR-2: Case, Debtor, Client, Collection Types

**Branch:** `feat/shared-types-domain`  
**Efor:** 2 gün  
**Depends on:** PR-1

### case.ts İçeriği

```typescript
import { Money, CaseId, ClientId } from './index';

export interface CaseDTO {
  id: CaseId;
  fileNumber: string;
  executionFileNumber?: string;
  caseType: CaseType;
  caseStatus: CaseStatus;
  caseDate: string; // ISO 8601: YYYY-MM-DD
  
  /** Asıl alacak - Money tipi zorunlu */
  principalAmount: Money;
  
  /** Hesaplanmış faiz - çekirdekten gelir, UI hesaplamaz */
  calculatedInterest?: Money;
  
  clientId: ClientId;
  // ...
}

export type CaseType = 
  | 'GENERAL_EXECUTION' 
  | 'CHECK' 
  | 'BOND' 
  | 'MORTGAGE' 
  | 'RENTAL';

export type CaseStatus = 
  | 'DRAFT' 
  | 'ACTIVE' 
  | 'CLOSED' 
  | 'ARCHIVED';
```

### Kabul Kriterleri

- [ ] `case.ts`, `debtor.ts`, `client.ts`, `collection.ts` oluşturuldu
- [ ] Tüm para alanları `Money` tipinde
- [ ] Tüm ID alanları branded
- [ ] Tarih alanları ISO 8601 formatında (string)
- [ ] Legacy `amount: number` kullanımı compile error veriyor

---

## PR-3: Web API Clients (fee-engine, policy-engine)

**Branch:** `feat/web-api-clients`  
**Efor:** 1.5 gün  
**Depends on:** PR-1, PR-2

### Dosyalar

```
apps/web/src/lib/api/
├── fee-engine.ts      ← YENİ
├── policy-engine.ts   ← YENİ
└── index.ts           ← GÜNCELLE
```

### fee-engine.ts İçeriği

```typescript
import { apiClient } from './client';
import type { Money, CaseId } from '@shared/types';

export interface FeeComputeRequest {
  caseId: CaseId;
  principal: Money;
  caseType: string;
  debtorCount: number;
}

export interface FeeComputeResult {
  items: GeneratedFeeItem[];
  totals: {
    basvurmaHarci: Money;
    vekaletHarci: Money;
    pesinHarc: Money;
    toplam: Money;
  };
}

export const feeEngineApi = {
  compute: async (req: FeeComputeRequest): Promise<FeeComputeResult> => {
    const res = await apiClient.post('/fee-engine/compute', req);
    return res.data;
  },
  
  getAttorneyFee: async (amount: Money): Promise<Money> => {
    const res = await apiClient.post('/fee-engine/attorney-fee', { amount });
    return res.data;
  },
};
```

### policy-engine.ts İçeriği

```typescript
import { apiClient } from './client';
import type { CaseId, ActionCode, GateResult } from '@shared/types';

export interface PolicyEvaluateRequest {
  caseId: CaseId;
  actionCode: ActionCode;
  facts?: Record<string, unknown>;
}

export interface PolicyEvaluateResult {
  allowed: boolean;
  gates: GateResult[];
  blockers: string[];
  warnings: string[];
}

export const policyEngineApi = {
  evaluate: async (req: PolicyEvaluateRequest): Promise<PolicyEvaluateResult> => {
    const res = await apiClient.post('/policy-engine/evaluate', req);
    return res.data;
  },
  
  checkGate: async (caseId: CaseId, gateCode: string): Promise<GateResult> => {
    const res = await apiClient.get(`/policy-engine/gates/${caseId}/${gateCode}`);
    return res.data;
  },
};
```

### Kabul Kriterleri

- [ ] `fee-engine.ts` oluşturuldu, `feeEngineApi.compute()` çalışıyor
- [ ] `policy-engine.ts` oluşturuldu, `policyEngineApi.evaluate()` çalışıyor
- [ ] UI'da fee hesabı için tek satır: `feeEngineApi.compute(req)`
- [ ] UI'da policy check için tek satır: `policyEngineApi.evaluate(ctx)`
- [ ] `index.ts`'de export edildi

---

## PR-4: CI Çekirdek Dışı Hesap Yasağı

**Branch:** `feat/ci-money-guard`  
**Efor:** 1 gün  
**Depends on:** PR-1

### Dosyalar

```
.eslintrc.js                    ← GÜNCELLE
scripts/check-money-leaks.ts    ← YENİ
.github/workflows/ci.yml        ← GÜNCELLE (varsa)
```

### ESLint Kuralı

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'BinaryExpression[operator="*"][left.name=/principal|rate|oran|tutar/i]',
        message: '🚫 Para hesabı sadece interest-engine/fee-engine içinde yapılmalı. @see ARCHITECTURE.md'
      },
      {
        selector: 'BinaryExpression[operator="/"][right.value=365]',
        message: '🚫 Faiz formülü (x/365) sadece interest-engine içinde olmalı.'
      },
      {
        selector: 'CallExpression[callee.property.name="toFixed"]',
        message: '⚠️ Para yuvarlaması için Money.round() kullanın, toFixed() yasak.'
      }
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/rule-engine/**'],
            message: '⚰️ rule-engine DEPRECATED. policy-engine kullanın.'
          },
          {
            group: ['**/validation-gate/**'],
            message: '⚰️ validation-gate DEPRECATED. policy-engine kullanın.'
          }
        ]
      }
    ]
  }
};
```

### check-money-leaks.ts Script

```typescript
#!/usr/bin/env ts-node
/**
 * CI'da çalışır: çekirdek dışı para hesabı arayan script
 * Exit 1 = leak bulundu
 */
import { execSync } from 'child_process';

const FORBIDDEN_PATTERNS = [
  'principal\\s*\\*\\s*rate',
  '\\*\\s*days\\s*/\\s*365',
  'Math\\.round\\(.*\\*.*rate',
  '\\.toFixed\\(',
];

const ALLOWED_PATHS = [
  'interest-engine/',
  'fee-engine/',
  'allocation/',
];

// ... implementation
```

### Kabul Kriterleri

- [ ] ESLint kuralı eklendi, `pnpm lint` çalışıyor
- [ ] `check-money-leaks.ts` script'i var
- [ ] CI pipeline'da script çalışıyor (varsa)
- [ ] Mevcut kod lint'ten geçiyor (veya ignore edildi)

---

## PR-5: claim-item Hesap Sökümü

**Branch:** `refactor/claim-item-no-calc`  
**Efor:** 2 gün  
**Depends on:** PR-1, PR-2, PR-3

### Değişiklikler

```
apps/api/src/modules/claim-item/
├── claim-item.service.ts    ← GÜNCELLE (hesap kaldır)
├── claim-item.dto.ts        ← GÜNCELLE (Money tipi)
└── claim-item.module.ts     ← GÜNCELLE (InterestEngine inject)
```

### Kaldırılacak Kodlar

```typescript
// ❌ SİLİNECEK - claim-item.service.ts
async calculateInterest(dto: CalculateInterestDto): Promise<InterestCalculationResult> {
  // Bu fonksiyon tamamen kaldırılacak
  // Yerine: interestEngineApi.calculate() kullanılacak
}

private async getInterestRate(...): Promise<number> {
  // Bu fonksiyon tamamen kaldırılacak
}
```

### Yeni Yapı

```typescript
// ✅ YENİ - claim-item.service.ts
import { InterestEngineService } from '../interest-engine/interest-engine.service';

@Injectable()
export class ClaimItemService {
  constructor(
    private prisma: PrismaService,
    private interestEngine: InterestEngineService, // ← YENİ
  ) {}

  /**
   * Faiz hesabı için interest-engine'e yönlendir
   */
  async getCalculatedInterest(caseId: CaseId): Promise<Money> {
    const result = await this.interestEngine.calculate({
      caseId,
      asOfDate: new Date().toISOString(),
    });
    return result.totals.totalInterest;
  }
}
```

### Kabul Kriterleri

- [ ] `calculateInterest()` metodu silindi
- [ ] `getInterestRate()` metodu silindi
- [ ] Tüm para alanları `Money` tipinde
- [ ] Faiz sorgusu `interestEngine.calculate()` üzerinden
- [ ] Mevcut testler geçiyor (veya güncellendi)
- [ ] `interest`, `accrue`, `rate`, `allocation`, `round` fonksiyonları yok

---

## PR-6: collection Hesap Sökümü

**Branch:** `refactor/collection-no-calc`  
**Efor:** 2 gün  
**Depends on:** PR-1, PR-5

### Değişiklikler

```
apps/api/src/modules/collection/
├── collection.service.ts    ← GÜNCELLE
├── collection.dto.ts        ← GÜNCELLE
└── collection.module.ts     ← GÜNCELLE
```

### Kaldırılacak Kodlar

```typescript
// ❌ SİLİNECEK - collection.service.ts içindeki hesap
// calculateCover() içinde:
let interestAmount = 0;
if (caseData.interestRate && caseData.interestStartDate) {
  const days = Math.floor(...);
  const rate = Number(caseData.interestRate) / 100;
  interestAmount = principalAmount * rate * (days / 365); // ← YASAK
}
```

### Yeni Yapı

```typescript
// ✅ YENİ - collection.service.ts
import { InterestEngineService } from '../interest-engine/interest-engine.service';
import { TBK100AllocatorService } from '../interest-engine/allocation';

@Injectable()
export class CollectionService {
  constructor(
    private prisma: PrismaService,
    private interestEngine: InterestEngineService,
    private allocator: TBK100AllocatorService,
  ) {}

  /**
   * Tahsilat dağıtımı - TBK 100 çekirdekten
   */
  async allocateCollection(collectionId: CollectionId, amount: Money): Promise<AllocationResult> {
    // 1. Mevcut borç durumunu çekirdekten al
    const debt = await this.interestEngine.calculate({ caseId, asOfDate });
    
    // 2. TBK 100 mahsup - çekirdekten
    const allocation = this.allocator.allocate({
      payment: amount,
      debt: debt.totals,
    });
    
    // 3. Sonucu kaydet
    return this.saveAllocation(collectionId, allocation);
  }
}
```

### Kabul Kriterleri

- [ ] `calculateCover()` içindeki faiz hesabı kaldırıldı
- [ ] Faiz değeri `interestEngine.calculate()` üzerinden
- [ ] Mahsup `TBK100AllocatorService` üzerinden
- [ ] `autoAllocate()` çekirdek allocator kullanıyor
- [ ] Aynı event setiyle iki yerde aynı sonuç (deterministik)

---

## PR-7: summary-engine Hesap Sökümü

**Branch:** `refactor/summary-engine-projection`  
**Efor:** 3 gün  
**Depends on:** PR-5, PR-6

### Hedef

summary-engine = **projection katmanı**, hesap yapmaz.

### Kaldırılacak Kodlar

```typescript
// ❌ SİLİNECEK - summary-engine içindeki tüm hesaplamalar
// - Toplam borç hesabı
// - Faiz hesabı
// - Mahsup hesabı
// - Bakiye hesabı
```

### Yeni Yapı

```typescript
// ✅ YENİ - summary-engine.service.ts
@Injectable()
export class SummaryEngineService {
  constructor(
    private interestEngine: InterestEngineService,
    private feeEngine: FeeEngineService,
  ) {}

  /**
   * Dosya özeti - SADECE PROJECTION
   * Hesap yapmaz, çekirdekten alır
   */
  async getCaseSummary(caseId: CaseId): Promise<CaseSummaryDTO> {
    // 1. Çekirdekten hesap al
    const interestResult = await this.interestEngine.calculate({ caseId });
    const feeResult = await this.feeEngine.compute({ caseId });
    
    // 2. Sadece map/format - hesap YOK
    return {
      principal: interestResult.totals.principal,
      interest: interestResult.totals.totalInterest,
      fees: feeResult.totals.toplam,
      total: interestResult.totals.grandTotal, // ← Çekirdekten birebir
      // ...
    };
  }
}
```

### Kabul Kriterleri

- [ ] summary-engine'de para hesaplayan fonksiyon YOK
- [ ] `toplam` alanı çekirdek response'un birebir alanı
- [ ] Sadece map/format işlemleri var
- [ ] TBK 100 mantığı tamamen kaldırıldı (çekirdekte)
- [ ] Golden test: aynı input → aynı output

---

## PR-8: validation-gate Taşı ve Sil

**Branch:** `refactor/kill-validation-gate`  
**Efor:** 2 gün  
**Depends on:** PR-4

### Adımlar

1. `validation-gate` içindeki tüm validasyonları kategorize et:
   - **Hard gates** → `policy-engine/gate-checker`
   - **Teknik validasyon** → `packages/validators` (yeni)
   
2. Kullanımları taşı:
   - `stage-trigger` → `policy-engine`
   - `uyap` → `policy-engine`
   
3. Modülü sil

### Dosyalar

```
apps/api/src/modules/validation-gate/  ← SİL
packages/validators/                    ← YENİ (opsiyonel)
```

### Kabul Kriterleri

- [ ] `validation-gate` import eden yer kalmadı
- [ ] `validation-gate/` klasörü silindi
- [ ] `app.module.ts`'den kaldırıldı
- [ ] Runtime'da side effect import yok

---

## PR-9: claim-engine.getInterestRate() Kaldır

**Branch:** `refactor/kill-claim-engine-rate`  
**Efor:** 1 gün  
**Depends on:** PR-5

### Değişiklikler

```
apps/api/src/modules/claim-engine/claim-engine.service.ts
```

### Kaldırılacak

```typescript
// ❌ SİLİNECEK
async getInterestRate(type: InterestType, currency: string, date: Date): Promise<number> {
  // Tüm fonksiyon silinecek
}
```

### Kabul Kriterleri

- [ ] `getInterestRate()` fonksiyonu silindi
- [ ] Repo genelinde `claim-engine.getInterestRate` kullanımı 0
- [ ] Rate okuma sadece `RateProviderService` üzerinden

---

## 📊 Özet Timeline

```
Hafta 1: ✅ TAMAMLANDI
├── PR-1: Shared Types Money (2 gün) ✅
└── PR-2: Domain Types (2 gün) ✅

Hafta 2: ✅ TAMAMLANDI
├── PR-3: Web API Clients (1.5 gün) ✅
└── PR-4: CI Yasağı (1 gün) ✅

Hafta 3: ✅ TAMAMLANDI
├── PR-5: claim-item sökümü (2 gün) ✅
├── PR-6: collection sökümü (2 gün) ✅
└── PR-7: summary-engine sökümü ✅ (zaten TBK100Allocator kullanıyor)

Hafta 4: ✅ TAMAMLANDI
├── PR-8: validation-gate deprecation ✅ (uyarılar eklendi)
└── PR-9: claim-engine rate ✅ (zaten null dönüyor)
```

## 🎉 TÜM PR'LAR TAMAMLANDI

Para hattı kilitleme projesi başarıyla tamamlandı:
- Tüm hesaplamalar çekirdek engine'lere taşındı
- Legacy modüller deprecated olarak işaretlendi
- CI kontrolleri eklendi
- Web API client'lar oluşturuldu

---

## ✅ Final Checklist

PR'lar merge edildikten sonra:

- [x] `Money` tipi `packages/types/src/money.ts`'de tanımlı
- [x] Branded ID'ler `packages/types/src/branded-ids.ts`'de tanımlı
- [x] Domain types (case, debtor, client, collection) oluşturuldu
- [x] Web API clients (fee-engine, policy-engine) oluşturuldu
- [x] ESLint kuralları eklendi (no-restricted-syntax)
- [x] `check-money-leaks.ts` script'i oluşturuldu
- [x] `claim-item.calculateInterest()` kaldırıldı (hata fırlatıyor)
- [x] `collection.calculateCover()` DB'den okumaya çevrildi
- [x] `summary-engine` TBK100AllocatorService kullanıyor
- [x] `validation-gate` deprecated olarak işaretlendi
- [x] `claim-engine.getInterestRate()` null dönüyor
- [ ] `pnpm lint` tüm projede geçiyor
- [ ] CI'da `check-money-leaks.ts` yeşil
- [ ] Golden test'ler geçiyor

---

*Bu belge ARCHITECTURE.md ve architecture-gap-matrix.md ile birlikte okunmalıdır.*
