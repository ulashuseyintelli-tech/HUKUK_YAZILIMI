---
status: active
review-trigger: continuous
---

# Architecture Decision Log (ADR)

Bu klasör, projedeki **mimari kararların kalıcı kayıt defteridir**. Amaç: 6 ay sonra "bu kararı neden aldık?" sorusunun cevabı kaybolmasın.

## ADR Nedir?

Architecture Decision Record. Her ADR bir karar = bir dosya:
- Karar başlığı
- Bağlamı (neden gerekti)
- Düşünülen alternatifler
- Seçilen yön
- Sonuçlar (consequences)
- Status: Proposed / Accepted / Superseded / Deprecated

## Adlandırma

```
ADR-NNNN-konu-vs-alternatif.md
```

- `NNNN` = 4 haneli numara (9999'a kadar elastiki)
- Başlık karar-yönelimli, "why-..." değil. Örnek:
  - ✅ `ADR-0001-formalize-vs-rewrite.md`
  - ❌ `ADR-0001-why-formalize.md`

## Template

`_template.md` dosyasını kopyala, doldur.

## Status Lifecycle

```
Proposed  → Accepted → (Superseded → daha sonra ADR-XXXX tarafından)
        ↘ Rejected (alternatif seçildi)
        ↘ Deprecated (artık geçerli değil)
```

Bir ADR `Accepted` olduktan sonra **silinmez**, yalnızca `Superseded` olur.

## Mevcut ADR'lar

Bkz. dosya listesi (kronolojik).
