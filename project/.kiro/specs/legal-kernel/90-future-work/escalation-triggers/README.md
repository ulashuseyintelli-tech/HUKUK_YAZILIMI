---
status: active
review-trigger: continuous
---

# Escalation Triggers

Bu klasör tek bir tablo dosyası tutar: `triggers.md`. Belirli bir capability'nin (özelliğin) hangi **teknik** ve hangi **iş** koşullarında aktive edilmesi gerektiğini eşler.

## Mantık

Bir capability iki tür baskıyla domain'e döner:
- **Technical trigger:** Ölçek, performans, hata oranı, vs. (örn 1M+ events)
- **Business trigger:** Kurumsal müşteri, denetim, KVKK, vs. (örn ilk 3rd party kurumsal müşteri)

Hangisi önce gerçekleşirse capability `deferred` veya `pending`'den `active`'a geçer.

## Format

`triggers.md` tablosu:

| Capability | Technical Trigger | Business Trigger | Owner | Current Status |
|---|---|---|---|---|
| ... | ... | ... | ... | deferred/pending/... |

## Hukuk Domain'inde Önemli

Hukuk yazılımında **business trigger genellikle technical trigger'dan önce gelir**. Örnek: ilk kurumsal müşteri 100 dosya tutsa bile KVKK silme talebi getirir → "kurumsal silme stratejisi" technical bir ölçek baskısı olmadan domain işi olur.

Bu yüzden iki ayrı sütun kullanıyoruz, ikisinden hangisi önce gerçekleşirse o tetikler.

## Disiplin

- Her deferred capability'nin escalation trigger'ı tanımlı olmalı
- Trigger gerçekleştiğinde owner haberdar olur
- Trigger güncel kalmalı (çeyrek sonu review)
