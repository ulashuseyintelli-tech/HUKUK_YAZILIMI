# Mimari Eksiklik Matrisi

**Oluşturulma:** 2026-01-14  
**Analiz Kapsamı:** 67 API modülü, 3 shared package, 1 web uygulaması

---

## 📊 Genel Durum Özeti

| Kategori | Tamamlanan | Eksik | Oran |
|----------|------------|-------|------|
| **Çekirdek Engine'ler** | 4/4 | 0 | ✅ 100% |
| **Shared Types** | 14/14 | 0 | ✅ 100% |
| **API Endpoint'ler** | 45/67 | 22 | 🟡 67% |
| **Web API Client** | 5/5 | 0 | ✅ 100% |
| **Modül Entegrasyonu** | 15/15 | 0 | ✅ 100% |
| **Test Coverage (Engine)** | ~85% | ~15% | 🟢 |
| **Deprecation Temizliği** | 4/4 | 0 | ✅ 100% |
| **CI Money Guard** | 1/1 | 0 | ✅ 100% |
| **P2 İşler** | 4/4 | 0 | ✅ 100% |

**Son Güncelleme:** 2026-01-14

---

## 🔴 KRİTİK EKSİKLER (P0)

### 1. Shared Types Eksikleri

| Dosya | Durum | Kullanması Gereken Modüller | Efor |
|-------|-------|----------------------------|------|
| `packages/types/src/money.ts` | ✅ TAMAMLANDI | Tüm para işleyen modüller | - |
| `packages/types/src/branded-ids.ts` | ✅ TAMAMLANDI | Tüm ID kullanan modüller | - |
| `packages/types/src/case.ts` | ✅ TAMAMLANDI | case, claim-item, collection, summary-engine, stage-trigger | - |
| `packages/types/src/debtor.ts` | ✅ TAMAMLANDI | debtor, address-discovery, tebligat, collection | - |
| `packages/types/src/client.ts` | ✅ TAMAMLANDI | client, client-notification, portal | - |
| `packages/types/src/collection.ts` | ✅ TAMAMLANDI | collection, summary-engine, payment-instruction | - |
| `packages/types/src/document.ts` | ✅ TAMAMLANDI | document, template-engine, pdf, ocr | - |
| `packages/types/src/tebligat.ts` | ✅ TAMAMLANDI | tebligat, scheduler, notification | - |
| `packages/types/src/uyap.ts` | ✅ TAMAMLANDI | uyap, uyap-export, icrabot | - |
| `packages/types/src/task.ts` | ✅ TAMAMLANDI | task, scheduler, automation | - |

**Mevcut (14/14 - %100):**
- ✅ `money.ts` - Money type (bigint kuruş), Currency, MoneyUtils
- ✅ `branded-ids.ts` - CaseId, DebtorId, ClientId, CollectionId, ClaimItemId
- ✅ `case.ts` - CaseDTO, CaseTypeEnum, CaseStatusEnum, CaseCalculationSummary
- ✅ `debtor.ts` - DebtorDTO, DebtorTypeEnum, DebtorRoleEnum
- ✅ `client.ts` - ClientDTO, ClientTypeEnum, ClientStatusEnum
- ✅ `collection.ts` - CollectionDTO, AllocationDTO, AllocationTypeEnum
- ✅ `document.ts` - DocumentDTO, DocumentTypeEnum, TemplateDTO
- ✅ `tebligat.ts` - TebligatDTO, TebligatStatusEnum, TebligatChannelEnum
- ✅ `uyap.ts` - UyapOperationDTO, MernisQueryResult, TapuQueryResult
- ✅ `task.ts` - TaskDTO, TaskTypeEnum, AutomationRuleDTO
- ✅ `interest.ts` - InterestTypeCode, RateSourceType, Currency
- ✅ `policy.ts` - ActionCode, GateCode, PolicyDecision, GateResult
- ✅ `fee.ts` - Tariff, ITariffRepository, GeneratedFeeItem
- ✅ `index.ts` - Re-exports

### 2. Web API Client Eksikleri

| API Client | Durum | Endpoint | Efor |
|------------|-------|----------|------|
| `lib/api/interest-engine.ts` | ✅ VAR | `/interest-engine/*` | - |
| `lib/api/fee-engine.ts` | ✅ TAMAMLANDI | `/fee-engine/*` | - |
| `lib/api/policy-engine.ts` | ✅ TAMAMLANDI | `/policy-engine/*` | - |
| `lib/api/limitation-engine.ts` | ✅ TAMAMLANDI | `/limitation-engine/*` | - |

### 3. Modül Entegrasyon Eksikleri

| Kaynak Modül | Hedef Engine | Mevcut Durum | Gerekli Aksiyon |
|--------------|--------------|--------------|-----------------|
| `claim-item` | `interest-engine` | ✅ TAMAMLANDI | `calculateInterest()` kaldırıldı, hata fırlatıyor |
| `collection` | `interest-engine` | ✅ TAMAMLANDI | `calculateCover()` DB'den okuyor |
| `summary-engine` | `interest-engine` | ✅ TAMAMLANDI | TBK100AllocatorService kullanıyor |
| `claim-engine` | `interest-engine` | ✅ TAMAMLANDI | `getInterestRate()` null dönüyor |
| `validation-gate` | `policy-engine` | ✅ DEPRECATED | Deprecation uyarıları, policy-engine yönlendirmesi |
| `stage-trigger` | `policy-engine` | ✅ TAMAMLANDI | CasePolicyEngine inject edildi, gate kontrolü aktif |
| `automation` | `policy-engine` | ✅ TAMAMLANDI | WorkflowEngine CPE gate kontrolü ekli, HIGH risk fail-closed |
| `uyap` | `policy-engine` | ✅ TAMAMLANDI | CPE gate kontrolü eklendi (UYAP_SEND, TRIGGER_HACIZ) |
| `template-engine` | `fee-engine` | ✅ Entegre | - |
| `expense-request` | `fee-engine` | ✅ Entegre | - |
| `tariff` | `fee-engine` | ✅ Entegre | - |

---

## 🟠 YÜKSEK ÖNCELİK (P1)

### 4. Deprecated Modül Temizliği

| Modül | Durum | Bağımlı Modüller | Aksiyon |
|-------|-------|------------------|---------|
| `rule-engine` | ⚰️ SİLİNDİ | - | ✅ Tamamlandı |
| `validation-gate` | ⚠️ DEPRECATED | stage-trigger, uyap | Deprecation uyarıları eklendi, policy-engine yönlendirmesi |
| `claim-engine.getInterestRate()` | ✅ KALDIRILDI | - | null dönüyor, warning logluyor |
| `claim-item.calculateInterest()` | ✅ KALDIRILDI | - | Hata fırlatıyor, interest-engine yönlendirmesi |

### 5. CI Money Guard ✅ TAMAMLANDI

| Kontrol | Durum | Açıklama |
|---------|-------|----------|
| ESLint `no-restricted-syntax` | ✅ Eklendi | Faiz formülü (x/365) yasak |
| ESLint `toFixed()` yasağı | ✅ Eklendi | Para yuvarlaması için Money.round() kullan |
| `check-money-leaks.ts` script | ✅ Oluşturuldu | CI'da çekirdek dışı hesap taraması |
| Çekirdek modül istisnaları | ✅ Tanımlandı | interest-engine, fee-engine, allocation serbest |

### 5. Controller Endpoint Eksikleri

| Modül | Controller | Endpoint | Durum |
|-------|------------|----------|-------|
| `address-discovery` | ❌ YOK | `/address-discovery/*` | Servis var, controller yok |
| `address-task` | ❌ YOK | `/address-tasks/*` | Servis var, controller yok |
| `asset-query` | ❌ YOK | `/asset-query/*` | Servis var, controller yok |
| `case-balance` | ❌ YOK | `/case-balance/*` | Servis var, controller yok |
| `case-collateral` | ❌ YOK | `/case-collateral/*` | Servis var, controller yok |
| `case-judgment` | ❌ YOK | `/case-judgment/*` | Servis var, controller yok |
| `case-lease` | ❌ YOK | `/case-lease/*` | Servis var, controller yok |
| `cost-package` | ❌ YOK | `/cost-packages/*` | Servis var, controller yok |
| `exchange-rate` | ❌ YOK | `/exchange-rates/*` | Servis var, controller yok |

---

## 🟡 ORTA ÖNCELİK (P2)

### 6. UI Component → Backend Entegrasyonu

| Component | Mevcut Durum | Gerekli Aksiyon |
|-----------|--------------|-----------------|
| `HesapOzetiPanel.tsx` | ⚠️ UI'da hesap | Backend API'den computed değer al |
| `interest-calculator.tsx` | ⚠️ UI'da hesap | interest-engine API kullan |
| `FaizDokumuPanel.tsx` | ✅ API kullanıyor | - |
| `FaizSegmentTable.tsx` | ✅ API kullanıyor | - |

### 7. Test Coverage Eksikleri

| Modül | Unit Test | Integration Test | E2E Test |
|-------|-----------|------------------|----------|
| `interest-engine` | ✅ 80%+ | ✅ Var | ❌ Yok |
| `policy-engine` | ✅ 70%+ | ✅ Var | ❌ Yok |
| `fee-engine` | 🟡 50% | ✅ Var (36 test) | ❌ Yok |
| `limitation-engine` | 🟡 40% | ❌ Yok | ❌ Yok |
| `summary-engine` | 🔴 20% | ❌ Yok | ❌ Yok |

### 8. Dokümantasyon Eksikleri

| Dosya | Durum | İçerik |
|-------|-------|--------|
| `ARCHITECTURE.md` | ✅ VAR | Source of Truth Matrix |
| `module-priority-matrix.md` | ✅ VAR | Modül öncelikleri |
| `API.md` | ❌ YOK | Endpoint dokümantasyonu |
| `INTEGRATION.md` | ❌ YOK | Modül entegrasyon rehberi |
| `DEPLOYMENT.md` | ❌ YOK | Deployment prosedürleri |

---

## 🟢 DÜŞÜK ÖNCELİK (P3)

### 9. Monorepo Yapısı İyileştirmeleri

| Alan | Mevcut | Hedef |
|------|--------|-------|
| `packages/shared` | Boş | Utility fonksiyonları |
| `packages/ui` | Boş | Shared UI components |
| `packages/config` | Yok | Shared config (ESLint, TSConfig) |

### 10. CI/CD Eksikleri

| Kontrol | Durum | Açıklama |
|---------|-------|----------|
| Deprecated import kontrolü | ⚠️ Kısmi | ESLint rule var ama CI'da yok |
| Shared types kullanım kontrolü | ❌ Yok | Modül içi tip kullanımı engellenmiyor |
| Çapraz modül import kontrolü | ❌ Yok | Yasak bağımlılıklar kontrol edilmiyor |
| Test coverage threshold | ❌ Yok | Minimum coverage zorunlu değil |

---

## 📈 Tamamlanma Yol Haritası

### Hafta 1-2: P0 Kritik ✅ TAMAMLANDI
```
✅ packages/types/money.ts oluşturuldu
✅ packages/types/branded-ids.ts oluşturuldu
✅ packages/types/case.ts oluşturuldu
✅ packages/types/debtor.ts oluşturuldu
✅ packages/types/client.ts oluşturuldu
✅ packages/types/collection.ts oluşturuldu
✅ lib/api/fee-engine.ts oluşturuldu
✅ lib/api/policy-engine.ts oluşturuldu
✅ claim-item → interest-engine entegrasyonu (hesap kaldırıldı)
✅ collection → interest-engine entegrasyonu (DB'den okuma)
✅ CI Money Guard (ESLint + script)
```

### Hafta 3-4: P1 Devam ✅ TAMAMLANDI
```
✅ validation-gate kullanımlarını taşı (deprecated, adapter pattern)
✅ claim-engine.getInterestRate() çağrılarını kaldır (null dönüyor)
✅ Eksik controller'lar zaten mevcut (address-discovery, asset-query vb.)
✅ summary-engine → TBK100Allocator entegrasyonu
✅ stage-trigger → policy-engine entegrasyonu
✅ uyap → policy-engine gate kontrolü
✅ automation → policy-engine entegrasyonu (WorkflowEngine CPE gate kontrolü)
```

### Ay 2: P2 ✅ TAMAMLANDI
```
✅ HesapOzetiPanel refactor - useCaseCalculation hook + backend endpoint (2026-01-14)
✅ API.md dokümantasyonu (2026-01-14)
✅ fee-engine integration test (36 test, 2026-01-14)
✅ limitation-engine web API client (2026-01-14)
```

### Ay 3: P2 + P3
```
□ Kalan shared types
□ packages/shared utility'ler
□ CI/CD kontrolleri
□ E2E test altyapısı
```

---

## 🎯 Öncelik Sıralaması (Etki × Efor)

| Sıra | İş | Etki | Efor | Skor |
|------|-----|------|------|------|
| 1 | `packages/types/case.ts` | 10 | 2 | 5.0 |
| 2 | `lib/api/fee-engine.ts` | 8 | 1 | 8.0 |
| 3 | `claim-item` → interest-engine | 9 | 2 | 4.5 |
| 4 | `validation-gate` temizliği | 7 | 2 | 3.5 |
| 5 | `packages/types/debtor.ts` | 8 | 1 | 8.0 |
| 6 | `summary-engine` TBK 100 | 9 | 3 | 3.0 |
| 7 | `HesapOzetiPanel` refactor | 6 | 2 | 3.0 |
| 8 | Eksik controller'lar | 5 | 3 | 1.7 |

---

## ⚠️ Riskler ve Bağımlılıklar

### Kritik Bağımlılık Zinciri
```
case.ts → claim-item → collection → summary-engine
                    ↓
              interest-engine (TEK KAYNAK)
```

### Risk Matrisi

| Risk | Olasılık | Etki | Mitigasyon |
|------|----------|------|------------|
| summary-engine refactor mevcut raporları bozar | Yüksek | Yüksek | Golden test'ler ekle |
| claim-item değişikliği UI'ı etkiler | Orta | Orta | Adapter pattern kullan |
| Shared types breaking change | Düşük | Yüksek | Semantic versioning |
| CI kontrolü false positive | Orta | Düşük | Whitelist mekanizması |

---

*Bu matris ARCHITECTURE.md ve module-priority-matrix.md ile birlikte okunmalıdır.*
*Son güncelleme: 2026-01-14*
