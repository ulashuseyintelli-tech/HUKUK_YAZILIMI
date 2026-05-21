---
status: active
review-trigger: every-sprint
---

# Pending Investigation

Henüz karar verilemeyen, **bilgi eksik** mimari sorular. Bu kategori **tehlikelidir** — sonsuz belirsizlik çöplüğüne dönüşmesin diye sıkı kural:

## Anayasal Kural (Pending Timeout)

> Pending kategorisindeki bir öğe, **bir review cycle içinde** active / deferred / rejected / experimental durumlarından birine geçmek zorundadır.

Faz 1 boyunca bir review cycle = **2 hafta**.

Timeout aşılırsa varsayılan: `deferred` (Decision Owner zorunlu).

## Format

```yaml
---
status: pending
created: YYYY-MM-DD
timeout: YYYY-MM-DD          # created + 14 gün
owner: <kişi>
investigation-needed: <ne araştırılacak>
---

# Question

## Why Pending
Hangi bilgi eksik?

## Investigation Plan
Ne yapılacak / kim araştıracak / nasıl cevaplanacak?

## Possible Resolutions
- Active'e dönerse: ne olur
- Deferred'a dönerse: hangi trigger
- Rejected'a dönerse: hangi sebep
```

## Disiplin

- Her sprint review'da pending items kontrol edilir
- Timeout aşan item'lar **default olarak deferred'a düşürülür**
- Pending'de "tartışılıyor olarak" durmak yasak

## Mevcut Items

Bkz dosya listesi.
