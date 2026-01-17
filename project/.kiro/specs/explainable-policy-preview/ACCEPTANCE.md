# Phase 6A - Explainable Policy Preview

## ACCEPTANCE NOTE

**Durum:** ✅ MVP TAMAMLANDI VE DONDURULDU  
**Tarih:** 2026-01-16  
**Karar:** Bu spec MVP olarak mühürlenmiştir. Genişletme için yeni spec açılmalıdır.

---

## Teslim Edilen Değer

### Core Invariant (Zorlanan)
```
BLOCK → explanations.length > 0
```
Runtime'da zorlanıyor. Kağıt üzerinde değil, çalışırken.

### Scope Disiplini
- ✅ Preview-only kaldı
- ✅ Production kararına temas yok
- ✅ Karar mekanizması DEĞİŞMEDİ

### Kanıt Zinciri
```
PolicyEngine.softCheck()
    ↓
ExplanationService.explain()
    ↓
PolicyExplanationGeneratedEvent (trace)
    ↓
CalcPreviewResponse.policy.explanations (UX)
```

### Degraded Davranış
- `explanationsDegraded: true` bayrağı
- Sessiz yalan yok
- Policy outcome korunuyor

---

## Dosya Envanteri

### Yeni Dosyalar
| Dosya | Sorumluluk |
|-------|------------|
| `explanation/explanation.types.ts` | Core types, constants |
| `explanation/explanation.service.ts` | Main service, invariant enforcement |
| `explanation/reason-code-registry.ts` | MVP reason codes (10) |
| `explanation/index.ts` | Module exports |

### Güncellenen Dosyalar
| Dosya | Değişiklik |
|-------|------------|
| `types.ts` | PolicyPreviewData.explanations, explanationsDegraded |
| `calc-preview.module.ts` | Provider registration |
| `calc-preview.service.ts` | ExplanationService integration |
| `contracts/.../schema.ts` | PolicyExplanationSchema |
| `contracts/.../semantic.ts` | Explanation validation rules |
| `trace/trace-collector.service.ts` | addEvent method |

---

## MVP Reason Codes

| Code | Severity | Açıklama |
|------|----------|----------|
| STATUTE_OF_LIMITATIONS | ERROR | Zamanaşımı |
| INVALID_CLAIM_TYPE | ERROR | Geçersiz alacak türü |
| AMOUNT_EXCEEDS_LIMIT | ERROR | Limit aşımı |
| MISSING_REQUIRED_FIELD | ERROR | Eksik alan |
| DATE_RANGE_INVALID | ERROR | Geçersiz tarih |
| HIGH_INTEREST_RATE_WARNING | WARNING | Yüksek faiz |
| LONG_INTEREST_PERIOD | WARNING | Uzun süre |
| HIGH_FEE_RATIO | WARNING | Yüksek masraf oranı |
| DEBTOR_COUNT_WARNING | INFO | Çok borçlu |
| MIN_TAKIP_TUTARI | INFO | Düşük tutar |

---

## Ertelenen Görevler (Backlog)

Bu görevler MVP kapsamı dışında bırakıldı:

- [ ] Property-based tests (Task 4) - Invariant'ı rastgele inputlarla test et
- [ ] Integration tests (Task 5.3) - Uçtan uca zincir testi
- [ ] Contract fixtures (Task 7.3) - Provider tarafı koruma
- [ ] exactOptionalPropertyTypes cleanup - Hygiene ticket

---

## Genişletme Kuralı

Bu spec'e yeni özellik EKLENEMEZ. Genişletme için:

1. Yeni spec aç: `.kiro/specs/explainable-policy-v2/`
2. Yeni invariant tanımla
3. Yeni kanıt üret
4. Karar haritasında yer göster

**Sınır Kuralı:**
- Hangi invariant'ı ekliyor?
- Hangi kanıtı üretiyor?
- Karar haritasında net yeri var mı?

Geçemiyorsa, reddedilir.

---

## Onay

```
Phase 6A: Explainable Policy Preview
Status: MVP SEALED
Date: 2026-01-16

Bu sistem artık her BLOCK kararını açıklar.
Açıklama yoksa, invariant violation loglanır ve fallback eklenir.
Sessiz karar yok.
```

---

**Sonraki Adım:** Phase 6B - SDK v0.1 (read-only preview + trace)
