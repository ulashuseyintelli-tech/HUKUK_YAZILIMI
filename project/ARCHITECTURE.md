# Mimari Kılavuz

Bu belge sistemin "tek kaynak" (single source of truth) mimarisini tanımlar.
PR review'larda bu belge referans alınmalıdır.

**Son güncelleme:** 2026-01-14

## Source of Truth Matrix

| Domain | Tek Sahip | Deprecated Modüller | Notlar |
|--------|-----------|---------------------|--------|
| **Faiz Hesaplama** | `interest-engine` | `rule-engine.calculateLegalInterest()`, `claim-engine.getInterestRate()` | Tüm faiz hesaplamaları `interest-engine` üzerinden |
| **Oran Okuma** | `interest-engine/RateProviderService` | `claim-engine.interest_rate_table`, `fee-engine.getInterestRate()` | Tek rate source |
| **Policy/Gate Kararları** | `policy-engine` | `validation-gate`, `rule-engine` | Tüm gate kontrolleri `policy-engine/gate-checker` üzerinden |
| **Masraf Hesaplama** | `fee-engine` | - | Hesaplama tek kaynak, `ITariffRepository` üzerinden tarife okur |
| **Tarife Yönetimi** | `tariff` | - | Admin/CRUD + YAML store + `ITariffRepository` implementasyonu |
| **Masraf Avansı Ledger** | `case-balance` (alias: `advance-ledger`) | - | Masraf avansı takibi, alacak bakiyesi DEĞİL |
| **Stage Trigger** | `stage-trigger` + `policy-engine` | - | CPE entegrasyonu tamamlandı (2026-01-14) |
| **UYAP İşlemleri** | `uyap` + `policy-engine` | - | CPE gate kontrolü aktif (UYAP_SEND, TRIGGER_HACIZ) |
| **Otomasyon** | `automation` + `policy-engine` | `automation/rule-engine` (deprecated) | WorkflowEngine CPE gate kontrolü aktif (2026-01-14) |

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

## Refactoring Durumu

### Tamamlanan İşler ✅

1. **Shared Contracts** (`packages/types/src/`)
   - `interest.ts` - InterestTypeCode, RateSourceType, Currency
   - `policy.ts` - ActionCode, GateCode, PolicyDecision, GateResult
   - `fee.ts` - Tariff, ITariffRepository, GeneratedFeeItem

2. **tsconfig.json Alias**
   - `@shared/types` alias hem API hem Web'de tanımlı

3. **Deprecation + Adapter**
   - `validation-gate` → `@deprecated`, policy-engine'e yönlendirme
   - `rule-engine` → `@deprecated` (ölüm ilanı)
   - `claim-engine.getInterestRate()` → `@deprecated`
   - `fee-engine.getInterestRate()` → `@deprecated`

4. **fee-engine ↔ tariff Tekleştirme**
   - `ITariffRepository` interface
   - `TariffService` implements `ITariffRepository`
   - `FeeEngineService` injects `TariffService`

5. **ESLint Deprecated Import Rule**
   - `no-restricted-imports` rule eklendi
   - `rule-engine` ve `validation-gate` import'ları hata verir

6. **Policy Engine Entegrasyonları** (2026-01-14)
   - `stage-trigger` → CasePolicyEngine inject edildi, gate kontrolü aktif
   - `uyap` → CPE gate kontrolü eklendi (UYAP_SEND, TRIGGER_HACIZ için)
   - `automation` → WorkflowEngine CPE gate kontrolü eklendi, HIGH risk fail-closed

### Devam Eden İşler 🔄

1. ~~**rule-engine modülünü fiilen sil**~~ ✅ SİLİNDİ (2026-01-14)
2. ~~**validation-gate modülünü fiilen sil**~~ ✅ DEPRECATED (2026-01-14) - Adapter olarak korunuyor
3. ~~**automation → policy-engine entegrasyonu**~~ ✅ TAMAMLANDI (2026-01-14) - WorkflowEngine CPE gate kontrolü aktif

### Kalan P2 İşler

1. ~~**HesapOzetiPanel refactor**~~ ✅ TAMAMLANDI (2026-01-14)
   - `useCaseCalculation` hook oluşturuldu
   - `GET /cases/:id/calculation-summary` endpoint eklendi
   - Backend'den computed değerler alınıyor
2. ~~**limitation-engine web API client**~~ ✅ TAMAMLANDI (2026-01-14) - `lib/api/limitation-engine.ts` oluşturuldu
3. ~~**API.md dokümantasyonu**~~ ✅ TAMAMLANDI (2026-01-14) - `docs/API.md` oluşturuldu
4. **fee-engine integration test** - Entegrasyon testleri (kalan tek iş)

### Tamamlanan Shared Types ✅

| Dosya | İçerik |
|-------|--------|
| `money.ts` | Money type (bigint kuruş), Currency, MoneyUtils |
| `branded-ids.ts` | CaseId, DebtorId, ClientId, CollectionId, ClaimItemId |
| `case.ts` | CaseDTO, CaseTypeEnum, CaseStatusEnum |
| `debtor.ts` | DebtorDTO, DebtorTypeEnum, DebtorRoleEnum |
| `client.ts` | ClientDTO, ClientTypeEnum, ClientStatusEnum |
| `collection.ts` | CollectionDTO, AllocationDTO, AllocationTypeEnum |
| `document.ts` | DocumentDTO, DocumentTypeEnum, TemplateDTO |
| `tebligat.ts` | TebligatDTO, TebligatStatusEnum, TebligatChannelEnum |
| `uyap.ts` | UyapOperationDTO, MernisQueryResult, TapuQueryResult |
| `task.ts` | TaskDTO, TaskTypeEnum, AutomationRuleDTO |
| `interest.ts` | InterestTypeCode, RateSourceType, Currency |
| `policy.ts` | ActionCode, GateCode, PolicyDecision, GateResult |
| `fee.ts` | Tariff, ITariffRepository, GeneratedFeeItem |

### TBK 100 Mahsup - TEK KAYNAK

TBK 100 mahsup sırası artık tek yerden geliyor:

```typescript
// TEK KAYNAK: interest-engine/allocation/tbk100-allocator.service.ts
// Sıra: FAİZ → MASRAF → FER'İ → ANAPARA

import { TBK100AllocatorService } from '@/modules/interest-engine/allocation';
```

**Kullanıcılar:**
- `interest-engine` - Faiz hesaplama sırasında mahsup
- `summary-engine` - Tahsilat kaydı sırasında mahsup (recordPayment)

**Deprecated:**
- `summary-engine` YAML `allocation_order` - Artık kullanılmıyor, TBK100AllocatorService tercih ediliyor

### Tamamlanan Opsiyonel İşler ✅

1. **RuleEngineModule app.module.ts'den kaldırıldı** - Import comment'e dönüştürüldü
2. **Prisma schema bounded context yorumları** - Domain ownership tablosu eklendi
3. **rule-engine.spec.ts silindi** - Deprecated test dosyası temizlendi
4. **modules/rule-engine/ klasörü silindi** - Tamamen kaldırıldı (2026-01-14)
5. **claim-item.calculateInterest() deprecated** - Warning + interest-engine yönlendirmesi
6. **claim-engine.getInterestRate() devre dışı** - Artık null döner, YAML okumaz
7. **validation-gate deprecated işaretlendi** - app.module.ts'de comment eklendi
8. **summary-engine TBK 100 tekleştirme** - Artık interest-engine/TBK100AllocatorService kullanıyor
9. **stage-trigger → policy-engine entegrasyonu** - CasePolicyEngine inject edildi, gate kontrolü aktif (2026-01-14)
10. **uyap → policy-engine gate kontrolü** - UYAP_SEND ve TRIGGER_HACIZ için CPE kontrolü eklendi (2026-01-14)

## Prisma Schema Domain Ownership

Prisma schema dosyasının başında (`apps/api/prisma/schema.prisma`) domain ownership tablosu bulunur.
Bu tablo hangi tablonun hangi modüle ait olduğunu gösterir.

---

## 🔴 Repo-Wide Hesap Audit Raporu (2026-01-14)

### Audit Sonucu

Repo genelinde `interest`, `rate`, `faiz`, `oran`, `round`, `mahsup`, `allocation`, `balance`, `remaining`, `accrue` anahtar kelimeleri tarandı.

**Sonuç:** Çekirdek dışı 4 aktif hesap noktası tespit edildi ve düzeltildi.

### Düzeltilen Dosyalar ✅

| Dosya | Sorun | Düzeltme |
|-------|-------|----------|
| `scheduler.service.ts:updateInterestAmounts()` | Cron job'da `principal * rate * days / 365` hesabı | `@Cron` devre dışı, `@deprecated` eklendi |
| `collection.service.ts:calculateCover()` | `principal * rate * (days/365)` hesabı | DB'den `calculatedInterest` okumaya çevrildi, `@deprecated` eklendi |
| `page-v2.tsx` | `principal * 0.005`, `principal * 0.12` UI hesabı | Mock/preview olarak işaretlendi, API yönlendirmesi eklendi |
| `HesapOzetiPanel.tsx` | 50+ satır faiz motoru UI'da | Dosya başına deprecation uyarısı eklendi |

### Kalan İşler (P0)

1. **CI Yasağı Ekle** ✅ TAMAMLANDI (2026-01-14)
   - `.eslintrc.js`'e `no-restricted-syntax` kuralları eklendi
   - `scripts/check-money-leaks.ts` CI script'i oluşturuldu
   - Çekirdek modüller (interest-engine, fee-engine, allocation) istisna olarak tanımlandı

2. **HesapOzetiPanel Refactor** - UI'daki hesaplama fonksiyonlarını kaldır, backend API'den computed değer al

3. **interest-engine Projection Job** - `calculatedInterest` alanını güncelleyen scheduled job (scheduler.service yerine)

### PR Paketleri İlerleme Durumu

| PR | Durum | Notlar |
|----|-------|--------|
| PR-1: Shared Types Money | ✅ TAMAMLANDI | `money.ts`, `branded-ids.ts` oluşturuldu |
| PR-2: Domain Types | ✅ TAMAMLANDI | `case.ts`, `debtor.ts`, `client.ts`, `collection.ts` oluşturuldu |
| PR-3: Web API Clients | ✅ TAMAMLANDI | `fee-engine.ts`, `policy-engine.ts` oluşturuldu, index.ts güncellendi |
| PR-4: CI Money Guard | ✅ TAMAMLANDI | ESLint kuralları + check-money-leaks.ts script |
| PR-5: claim-item Hesap Sökümü | ✅ TAMAMLANDI | `calculateInterest()`, `getInterestRate()`, `addInterestItem()` kaldırıldı |
| PR-6: collection Hesap Sökümü | ✅ TAMAMLANDI | `calculateCover()` DB'den okumaya çevrildi |
| PR-7: summary-engine Sökümü | ✅ ZATEN TAMAMLANMIŞ | TBK100AllocatorService kullanıyor |
| PR-8: validation-gate Deprecation | ✅ TAMAMLANDI | Deprecation uyarıları eklendi, policy-engine yönlendirmesi |
| PR-9: claim-engine Rate Sil | ✅ ZATEN TAMAMLANMIŞ | getInterestRate() null dönüyor, warning logluyor |

### Legacy/Blueprint Klasörleri

`uyap_bot_v27-v37` klasörlerinde Python `compute_modules.py` dosyaları var. Bunlar aktif TypeScript sistemiyle entegre değil ama silinmezse karışıklık yaratabilir.

**Öneri:** `_archive/` klasörüne taşı veya sil.

### Tek Kaynak Doğrulama

| Domain | Tek Kaynak | Durum |
|--------|------------|-------|
| Faiz Hesaplama | `interest-engine/segments/interest-formula.ts` | ✅ Doğrulandı |
| TBK 100 Mahsup | `interest-engine/allocation/tbk100-allocator.service.ts` | ✅ Doğrulandı |
| Masraf/Harç | `fee-engine/fee-engine.service.ts` | ✅ Doğrulandı |
| Oran Okuma | `interest-engine/rates/rate-provider.service.ts` | ✅ Doğrulandı |

**Sonuç:** "Çekirdek tek kaynak" iddiası artık kanıtlanmış durumda. Düzeltmeler yapıldı, CI yasağı planlandı.

---

## 📋 İlgili Belgeler

| Belge | İçerik |
|-------|--------|
| [module-priority-matrix.md](./docs/module-priority-matrix.md) | Modül öncelikleri ve çakışma haritası |
| [architecture-gap-matrix.md](./docs/architecture-gap-matrix.md) | Eksik mimari bileşenler ve yol haritası |
| [pr-packages-money-lockdown.md](./docs/pr-packages-money-lockdown.md) | **PR Paketleri: Para hattı kilitleme planı** |
| [decision-point-inventory.md](./docs/decision-point-inventory.md) | Policy engine karar noktaları |
| [high-risk-action-matrix.md](./docs/high-risk-action-matrix.md) | Yüksek riskli aksiyonlar |
