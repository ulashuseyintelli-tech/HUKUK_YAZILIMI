# Modül Öncelik Matrisi

**Oluşturulma:** 2026-01-14  
**Toplam Modül:** 67  
**Refactored:** 6 (%9)

---

## 🔴 KRİTİK - Hemen Müdahale (P0)

| Modül | Sorun | Çakışma | Aksiyon | Efor |
|-------|-------|---------|---------|------|
| `claim-engine` | Faiz hesaplama + oran okuma yapıyor | `interest-engine` ile çakışıyor | `getInterestRate()` deprecated ama modül hâlâ aktif. Tamamen `interest-engine`'e yönlendir | 2 gün |
| `claim-item` | Kendi faiz hesaplama metodu var | `interest-engine` ile çakışıyor | `calculateInterest()` metodunu `interest-engine`'e bağla | 1 gün |
| `summary-engine` | TBK 100 mahsup mantığı var | `interest-engine/allocation` ile çakışıyor | Tek TBK 100 implementasyonu seç, diğerini sil | 3 gün |
| `rule-engine` | ⚰️ DEPRECATED ama hâlâ dosya var | `policy-engine` | Klasörü tamamen sil | 1 saat |
| `validation-gate` | ⚰️ DEPRECATED adapter | `policy-engine` | Tüm kullanımları taşı, sonra sil | 2 gün |

---

## 🟠 YÜKSEK - Bu Ay (P1)

| Modül | Sorun | Bağımlılık | Aksiyon | Efor |
|-------|-------|------------|---------|------|
| `case-balance` | İsim karışıklığı (alacak bakiyesi değil, masraf avansı) | - | Rename: `advance-ledger` veya en azından dokümantasyon | 1 gün |
| `limitation-engine` | Zamanaşımı hesaplama - incelenmedi | `interest-engine` ile potansiyel çakışma | Analiz et, gerekirse entegre et | 2 gün |
| `fee-engine` | ✅ Refactored ama `summary-engine` de masraf hesaplıyor | `summary-engine` | Tek kaynak belirle | 1 gün |
| `tariff` | ✅ Refactored | - | Tamamlandı | - |
| `exchange-rate` | Döviz kuru okuma - `interest-engine` de yapıyor | `interest-engine` | Tek kaynak belirle (muhtemelen `exchange-rate` kalmalı) | 1 gün |

---

## 🟡 ORTA - Bu Çeyrek (P2)

| Modül | Sorun | Aksiyon | Efor |
|-------|-------|---------|------|
| `case` | Core modül, tip tanımları modül içinde | `packages/types/case.ts` oluştur | 2 gün |
| `debtor` | Core modül, tip tanımları modül içinde | `packages/types/debtor.ts` oluştur | 1 gün |
| `client` | Core modül, tip tanımları modül içinde | `packages/types/client.ts` oluştur | 1 gün |
| `document` | Belge yönetimi | Tip paylaşımı | 1 gün |
| `tebligat` | Tebligat sistemi | Tip paylaşımı | 1 gün |
| `collection` | Tahsilat - `summary-engine` ile çakışma potansiyeli | Analiz et | 1 gün |
| `template-engine` | `fee-engine` bağımlılığı var | OK, bağımlılık doğru yönde | - |
| `pdf` | `template-engine` bağımlılığı | OK | - |

---

## 🟢 DÜŞÜK - Gelecek Çeyrek (P3)

| Modül | Durum | Not |
|-------|-------|-----|
| `auth` | Bağımsız | Dokunma |
| `user` | Bağımsız | Dokunma |
| `tenant` | Bağımsız | Dokunma |
| `notification` | Bağımsız | Dokunma |
| `scheduler` | Bağımsız | Dokunma |
| `audit` | Bağımsız | Dokunma |
| `calendar` | Bağımsız | Dokunma |
| `greeting` | Bağımsız | Dokunma |
| `lookup` | Bağımsız | Dokunma |
| `office` | Bağımsız | Dokunma |
| `staff` | Bağımsız | Dokunma |
| `lawyer` | Bağımsız | Dokunma |
| `poa` | Bağımsız | Dokunma |
| `portal` | Bağımsız | Dokunma |
| `report` | Bağımsız | Dokunma |
| `risk` | Bağımsız | Dokunma |
| `seed` | Bağımsız | Dokunma |
| `error-log` | Bağımsız | Dokunma |
| `group` | Bağımsız | Dokunma |
| `form-type` | Bağımsız | Dokunma |
| `execution-office` | Bağımsız | Dokunma |
| `export-import` | Bağımsız | Dokunma |
| `message-template` | Bağımsız | Dokunma |
| `payment-instruction` | Bağımsız | Dokunma |
| `public-institution` | Bağımsız | Dokunma |
| `bank` | Bağımsız | Dokunma |
| `esign` | Bağımsız | Dokunma |
| `ocr` | `claim-engine` bağımlılığı | claim-engine refactor sonrası kontrol et |
| `ai` | Bağımsız | Dokunma |

---

## ⚫ ÖZEL MODÜLLER

| Modül | Durum | Not |
|-------|-------|-----|
| `icrabot` | Büyük, karmaşık | Ayrı proje gibi, dokunma |
| `v28-engine` | Icrabot alt modülü | Dokunma |
| `uyap` | Entegrasyon | Dokunma |
| `uyap-export` | Entegrasyon | Dokunma |
| `address-discovery` | Bağımsız | Dokunma |
| `address-task` | Bağımsız | Dokunma |
| `asset-query` | Bağımsız | Dokunma |
| `precautionary-order` | Bağımsız | Dokunma |
| `related-lawsuits` | Bağımsız | Dokunma |
| `stage-trigger` | `case-balance` bağımlılığı | case-balance rename sonrası kontrol et |
| `cost-package` | Bağımsız | Dokunma |
| `expense-request` | `case-balance`, `tariff` bağımlılığı | OK, bağımlılıklar doğru |
| `case-instrument` | Case alt modülü | Dokunma |
| `case-lease` | Case alt modülü | Dokunma |
| `case-judgment` | Case alt modülü | Dokunma |
| `case-collateral` | Case alt modülü | Dokunma |
| `case-status` | Case alt modülü | Dokunma |
| `client-notification` | Bağımsız | Dokunma |
| `automation` | Bağımsız | Dokunma |

---

## 📊 Çakışma Haritası

```
┌─────────────────────────────────────────────────────────────────┐
│                     FAİZ HESAPLAMA ÇAKIŞMASI                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   interest-engine ◄──────── TEK KAYNAK (YENİ)                  │
│         │                                                       │
│         ├── claim-engine.getInterestRate() ⚠️ DEPRECATED       │
│         │                                                       │
│         ├── claim-item.calculateInterest() ⚠️ ÇAKIŞMA          │
│         │                                                       │
│         └── summary-engine (TBK 100) ⚠️ ÇAKIŞMA                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     POLICY/GATE ÇAKIŞMASI                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   policy-engine ◄──────── TEK KAYNAK (YENİ)                    │
│         │                                                       │
│         ├── rule-engine ⚰️ DEPRECATED (SİLİNECEK)              │
│         │                                                       │
│         └── validation-gate ⚰️ DEPRECATED (ADAPTER)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     MASRAF/TARİFE ÇAKIŞMASI                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   fee-engine ◄──────── HESAPLAMA                               │
│         │                                                       │
│         └── tariff ◄──────── YAML STORE (ITariffRepository)    │
│                                                                 │
│   summary-engine ⚠️ Kendi masraf hesaplaması var               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Önerilen Yol Haritası

### Hafta 1-2: P0 Kritik
1. `rule-engine` klasörünü sil
2. `claim-engine.getInterestRate()` → `interest-engine` yönlendirmesi tamamla
3. `claim-item.calculateInterest()` → `interest-engine` entegrasyonu

### Hafta 3-4: P0 Devam + P1 Başlangıç
4. `summary-engine` vs `interest-engine/allocation` - TBK 100 tekleştirme
5. `validation-gate` kullanımlarını taşı, modülü sil
6. `case-balance` dokümantasyonu / rename

### Ay 2: P1 + P2 Başlangıç
7. `limitation-engine` analizi
8. `exchange-rate` tekleştirme
9. `packages/types/case.ts`, `debtor.ts`, `client.ts` oluştur

### Ay 3: P2 Devam
10. Core modüllerin tip paylaşımı
11. ESLint kurallarını genişlet
12. CI/CD deprecated import kontrolü

---

## 📈 Metrikler

| Metrik | Şu An | Hedef (3 Ay) |
|--------|-------|--------------|
| Refactored modül | 6 (%9) | 20 (%30) |
| Shared types kullanımı | 3 dosya | 10 dosya |
| Deprecated modül | 2 | 0 |
| Çakışan hesaplama | 3 | 0 |
| Test coverage (engine'ler) | ~80% | 90% |

---

## ⚠️ Riskler

1. **summary-engine refactor** - Mevcut raporları bozabilir
2. **claim-item değişikliği** - Tüm dosya hesaplamalarını etkiler
3. **case-balance rename** - DB migration gerektirebilir
4. **icrabot dokunma** - Ayrı ekosistem, riskli

---

*Bu matris ARCHITECTURE.md ile birlikte okunmalıdır.*
