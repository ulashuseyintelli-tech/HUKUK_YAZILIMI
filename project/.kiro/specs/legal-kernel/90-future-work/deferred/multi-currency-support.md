---
status: deferred
owner: ulas
review-trigger: "İlk USD/EUR alacak gerçek müşteriden gelir, veya 3+ FX alacaklı müşteri"
depends-on: "Faz 1 (TRY-only kernel) tamamlanmalı"
---

# Multi-Currency Support

## Why deferred

İlk kernel TRY-only. Multi-currency:
- FX history (TCMB kur tarihleri)
- Valuation date (kur hangi tarih için, ödeme mi takip mi)
- TCMB alış/satış efektif kur ayrımı
- Partial conversion (kısmi ödeme TRY, kalanı USD)
- Kur farkı faizi
- Foreign judgment semantics

İlk kernel'in başarı kriteri (deterministik bakiye) multi-currency olmadan kanıtlanır. Sonra eklenir.

Architecture currency-aware: `Money` value object zaten `currency` field taşıyor, validator Faz 1'de `currency === 'TRY'`.

## Trigger to start

- İlk USD/EUR alacak gerçek müşteriden gelir
- Veya: 3+ FX alacaklı müşteri (toplu olarak ihtiyaç oluşur)

## Risk if delayed

- Düşük (mevcut müşteri profilinde dövizli alacak yok ya da çok az)
- Mevcut `mevduat-USD-bankalarca` gibi enum'lar zaten var, ileride aktive olunabilir
