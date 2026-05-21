---
status: deferred
owner: ulas
review-trigger: "İlk tebligat send / UYAP submit dispatcher Faz 2'de devreye girince"
depends-on: "Faz 2 — outbox dispatch pipeline"
---

# Sealed Artifacts (Trinity 4. Katman)

## Why deferred

Trinity'nin 4. katmanı: dış dünyada gerçekleşmiş, geri alınamaz nesneler (gönderilmiş PDF, UYAP receipt, PTT barkodu). Faz 1'de **dispatch yok** — bu yüzden sealed artifact üretimi yok.

Mevcut altyapı parçaları zaten var:
- `evidence_objects` tablosu (write-once trigger)
- `bundle_seal_events` tablosu (write-once trigger)
- `BundleSealEvent` Prisma modeli
- `calc-preview/evidence-bundle/` (formalize edilecek)

Faz 2'de tebligat send dispatcher yazıldığında:
- Gönderilen PDF artifact olarak seal edilir
- Hash payload event'inde tutulur
- Generic interface: `core-runtime/sealed-artifacts/`

## Trigger to start

- İlk tebligat dispatcher Faz 2'de aktif olunca
- İlk UYAP submit dispatcher
- İlk SMS/email send (KEP/UETS dahil)

## Risk if delayed

- Düşük (Faz 1 dispatch yok)
- Faz 2 başlangıcında zorunlu
