---
status: forensic-evidence
review-trigger: "legal awareness + ulas açık 'devam' onayı — implementation öncesi"
phase: 2
date: 2026-06-07
purpose: "doc 20 §5 forensic gate çıktısının kalıcı kaydı. day-count TZ bug'ının call-path ile ANA FAİZ PATH'ine bağlandığını ve legal-material olduğunu kanıtlar. READ-ONLY analiz; fix/adoption/runtime değişikliği İÇERMEZ."
---

# 21 — legal-time Forensic Impact Analysis (Gate §5)

**Durum:** forensic-evidence
**Mod:** read-only call-path + legal-material etki analizi (kod yok)
**Girdi:** doc 19 (observed) + doc 20 (decision draft, Yaklaşım A)
**Sonuç:** Bug **canlı görünmekle kalmıyor, production ana faiz path'ine bağlanıyor.**

> Bu belge yalnız KANITTIR. Fix, runtime değişikliği, paket veya kod bu belgeyle başlamaz.

---

## 1. Önceki belirsizlik → bu belgenin kapattığı boşluk
- doc 19/20: "prod ≈ UTC → bug **canlı olabilir**" (call-path doğrulanmamıştı).
- doc 21 (bu belge): call-path izlendi → **adjustEndDateForPayment ana hesap path'inde (`buildAllSegments`) ve END_OF_DAY evrensel default.** Belirsizlik kalkmıştır.

## 2. Call-path kanıtı (tek canlı zincir)
```
interest-engine.service.ts:284  buildAllSegments  (ANA HESAP PATH)
  → paymentDates: request.payments?.map(p => p.date)         [satır 290 — DOLU geçer]
  → sameDayPaymentRule: effectiveOptions.sameDayPaymentRule  [satır 294]
  → segment-builder.service.ts:103  generateTimeline(...)
      → timeline-generator.ts:63  adjustEndDateForPayment(paymentDate, rule)
          → day-count-calculator: addDays(paymentDate, 1)        [END_OF_DAY dalı]
              → parseIstanbulDate + setDate + formatIstanbulDate  ← 🔴 TZ-kırılgan
```
İkinci çağrı `interest-engine.service.ts:528` ("light preview"): `fixedRate` + **paymentDates YOK** → `buildFixedRateSegment`, generateTimeline/adjust çalışmaz → **dormant**.

### Default kanıtı (END_OF_DAY evrensel)
- `types/calculation.types.ts:78` → Zod `.default(SameDayPaymentRule.END_OF_DAY)`.
- `strategy/case-type-strategy.registry.ts` → 5 stratejinin TÜMÜ `END_OF_DAY` (satır 56, 104, 150, 197, 245).

## 3. Live vs dormant fonksiyon matrisi
| Fonksiyon | Prod dış çağrı | Canlı path | TZ-durum | Sonuç |
|---|---|---|---|---|
| `adjustEndDateForPayment` (END_OF_DAY) | timeline-generator (tek) | ✅ buildAllSegments | 🔴 kırılgan | **CANLI + legal-material** |
| `addDays` (day-count) | yok (yalnız adjust içinden) | ✅ transitif | 🔴 kırılgan | CANLI |
| `parseIstanbulDate` (takvim okuma) | yok dışarıdan | ✅ transitif | 🔴 kırılgan | CANLI |
| `formatIstanbulDate` | **0 dış çağrı** | ✅ transitif | 🔴 kırılgan | CANLI |
| `calculateDays` | segment-builder | ✅ | ✅ kararlı | Güvenli |
| `determinePhase` | segment-builder | ✅ | ✅ kararlı | Güvenli |
| `adjustEndDateForPayment START_OF_DAY` | — | opsiyon | ✅ kararlı | Güvenli (no-op) |

> Uyarı: ilk grep'teki `addDays`/`calculateDays` eşleşmelerinin bir kısmı **farklı fonksiyonlardı** (retention.service private `addDays(Date)`, recipe DSL `addDays(now())`, coverage-map private `calculateDays`) — day-count-calculator'ınkiler değil. Day-count'un fonksiyonları prod'a **yalnız adjustEndDateForPayment zinciriyle** ulaşıyor.

## 4. Legal-material etki
- END_OF_DAY semantiği: "ödeme günü faiz işler" → boundary `paymentDate+1` olmalı.
- UTC altında `addDays(paymentDate,1)` → `paymentDate` döner (doc 19 Gate 2 kanıtı: adjustEND `2025-01-15`→`2025-01-15`). → **END_OF_DAY sessizce START_OF_DAY gibi davranır**; ödeme sınırı **1 gün erkene** kayar.
- Sınır `allocatePayments`'ı besler → principal indirimi 1 gün erken → **ödeme başına ~1 günlük faiz farkı**.
- Koşul üçlüsü: **(payments var) ∧ (END_OF_DAY evrensel default) ∧ (prod = UTC)** → sağlanıyor görünüyor → **sistematik**: UTC-prod'da ödemeli her hesapta TBK aynı-gün-ödeme muamelesi tersine döner.

## 5. Güven seviyeleri (dürüst)
| İddia | Güven | Dayanak |
|---|---|---|
| adjustEndDateForPayment ana canlı path'te | **Yüksek** | kod kanıtlı (buildAllSegments:284/290) |
| END_OF_DAY evrensel default | **Yüksek** | Zod default + 5/5 strateji |
| prod = UTC | **Yüksek (kesin değil)** | repo: alpine + TZ yok + CI ubuntu; çalışan container teyidi gerekli |
| nihai TL deltası | **Orta-yüksek** | sınır kayması kanıtlı; `allocatePayments` iç mantığı uçtan uca izlenmedi → karakterizasyonla pinlenmeli |

## 6. Implementation öncesi öneri (karar değil)
1. **Acil mitigasyon (C):** prod=UTC teyidinde `process.env.TZ='Europe/Istanbul'` bootstrap pin — anında ana-path'i doğruya çevirir (tek satır, global; "kanama durdurma").
2. **Asıl fix (A):** `day-count-calculator.ts` internals TZ-değişmez (dar yüzey, tek zincir).
3. **Karakterizasyon kademe-2:** A-fix öncesi `buildAllSegments`'ı payments + END_OF_DAY ile gerçek koddan exact-literal pinle (sınır + nihai tutar) → §5 "nihai delta" güven boşluğunu kapatır.
4. **Legal awareness:** UTC-prod geçmiş hesaplarında ödeme-günü muamelesi hatalıydı → etkilenen case'ler, yeniden-hesap/bildirim gereği.
5. **Prod TZ kesin teyidi:** deploy ortamında çalışan container `TZ`/`/etc/localtime`.

## 7. Onay zinciri (sıra kilitli)
```
doc 21 (forensic evidence) → doc 20 update (§5 ✅) → legal awareness → ulas açık "devam" → T0 fix (Approach A)
```

---
**Forensic Status:** Bug confirmed live AND connected to the main interest path AND legal-material. No implementation. No runtime change.
