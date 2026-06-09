---
status: accepted-pending-implementation
review-trigger: legal sign-off
phase: 2
date: 2026-06-07
purpose: "TBK100AllocatorService float/number → minor-unit adoption kararı. İLK davranış-değiştiren PR (hesap politikası); legal sign-off + explicit 'devam' onayı olmadan implementation BAŞLAMAZ."
---

# 18 — TBK100Allocator minor-unit Adoption — Decision Record

**Karar durumu:** accepted-pending-implementation
**Önkoşul:** legal sign-off ✅ (doc 25, 2026-06-08) **+** ulas'ın açık "devam" onayı (BEKLENİYOR)
**Kırmızı çizgi:** *minor-unit adoption = hesap politikası değişikliği; "teknik refactor" diye geçilemez.*

> Bu belge yalnız KARARDIR. Kod, test expected güncellemesi, helper, allocator değişikliği **bu belgeyle başlamaz.** Implementation ayrı, açık onayla.

---

## 1. Mevcut durum
- `TBK100AllocatorService` `number` + `Map<AncillaryType, number>` ile çalışıyor.
- `allocateToCategory` = `Math.min` + ham subtraction; **rounding yok**.
- `isFullyPaid` = `calculateTotalDebt <= 0.001` (float tolerans).
- Currency bilgisi yok.
- Karakterizasyon main'de (`df7b62b`): L1 `tbk100-allocator.characterization` (6 test) + L2 `allocation-engine.characterization` (5 test).

## 2. Seçilen yaklaşım — B: Lightweight minor-unit helper
- İç temsil: **`bigint` cents**.
- Helper: `toCents(number): bigint` (exact-scale + HALF_UP away-from-zero) · `fromCents(bigint): number`.
- **Public API değişmez** (number/Map kontratı korunur); çıktı hâlâ `number`.
- **Money VO KULLANILMAZ** — TBK100 currency taşımıyor; VO burada ağır + DebtState kontratını kırma riski. Money VO, currency-safety'nin gerçek değer ürettiği **döviz/faiz katmanına** saklanır.

### Reddedilen: A — Money VO tabanlı adoption
- currency-safety bu modülde değersiz (currency yok) · `Map<,Money>` → kontrat kırılır veya her sınırda wrap/unwrap · blast radius büyük → **over-engineering**.

## 3. Boundary policy — R1
- Entry'de sub-cent `number` input'lar **HALF_UP ile cent'e normalize** edilir.
- Negatifler **away-from-zero** (interest-formula exact-rounding policy ile tutarlı).
- Sub-cent değerlere izin var, **normalize edilir**: `0.005 → 0.01`.
- İç hesap tamamen integer cents; boundary'de `fromCents` ile number.

## 4. Legal impact ⚠️
- Bu **yalnız float-dust temizliği DEĞİL** — sub-cent değerler legal toplamları değiştirir.
- Doğrulanmış örnekler (R1 prototip, 2026-06-07):
  - `calculateTotalDebt: 1550.0200000000002 → 1550.03` (iki 0.005 → 0.01 yukarı)
  - `remainingPayment: 234.5569999999999 → 234.56` (DÜZELTİLDİ — doc 25: HALF_UP away-from-zero, 3. ondalık 6≥5 → yukarı. Eski "→ 234.55" kurala aykırıydı; nihai değerler kademe-2 capture ile gerçek koddan doğrulanacak.)
  - `amountBefore: 0.005 → 0.01`, `1000.005 → 1000.01`
- **Legal review / sign-off ZORUNLU** (mahkeme raporu / TBK 100 determinizmi). Karar belgelenip onaylanmadan production'a girmez.

## 5. Expected test impact
- **L1 TBK100Allocator:** 6/6 bilinçli güncellenecek (dust + sub-cent rounding).
- **L2 AllocationEngine:** 5/5 bilinçli güncellenecek (engine kodu değişmeden, temiz değer üretir).
- **sprint-3 (clean integer; order/count/property): YEŞİL kalmalı** → istenmeyen davranış değişikliği OLMADIĞININ kanıtı.

## 6. Implementation guardrails (onay sonrası geçerli)
- No schema · No migration · No DB · No event payload · No public API shape change · No Money VO.
- Yalnız `tbk100-allocator.service.ts` internals + L1/L2 characterization expected güncellemeleri.

## 7. Capture stratejisi — 2 kademe
- **Kademe 1 (şimdi, prototip):** headline/sub-cent etkisi doğrulandı (§4 örnekleri).
- **Kademe 2 (implementation anında, en güvenilir):** tam L1 (multi-cost/ancillary Map) + tüm L2 değerleri **gerçek minor-unit koddan** capture edilip pinlenir. Multi-cost/ancillary döngüsü + AllocationEngine orkestrasyonu elle replike EDİLMEZ (divergence riski → hatalı güven).

## Onay zinciri
- [x] Yaklaşım B + R1 prensip onayı (ulas, 2026-06-07)
- [x] Decision record (bu belge)
- [x] **Legal sign-off** (sub-cent policy + örnek değer değişimleri) → ✅ doc 25 (ulas beyanı, 2026-06-08)
- [ ] **ulas açık "devam" onayı** (implementation başlatma)
- [ ] Implementation + kademe-2 capture + characterization güncelleme (ayrı PR)

---
**Decision Status:** Accepted. Legal sign-off ✅ (doc 25, 2026-06-08). Pending explicit "devam" + kademe-2 capture. Implementation NOT started.
