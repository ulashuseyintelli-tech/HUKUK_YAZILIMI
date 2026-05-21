---
status: rejected
rejection-date: 2026-05-19
rejected-by: ulas
review-trigger: "Vocabulary unification başarısız olur ve frontend yapısal çözülemez kalırsa"
---

# Frontend Rewrite

## Reason for Rejection

Frontend seam scan (`02-frontend-seam-scan.md`) gösterdi ki:

- Stack seçimi modern ve doğru (Next 14 + React Hook Form + Zod + TanStack Query + Zustand)
- `Money` value object kernel-grade
- Vocabulary parçalanması var ama **mekanik problem** (CI gate ile çözülür)
- Legal logic leak var ama **iki dosyada toplanmış** (`interest-type-resolver.ts`, `form-validator.ts`) — kontrollü extract seam

Rewrite riskli, vocabulary unification + legal logic migration aynı sonucu çok daha az riskle verir.

## Reopen Trigger

Bu fikir şu durumda yeniden gündeme gelir:

- Vocabulary unification 4 hafta içinde tamamlanmaz ve frontend yapısal olarak çözülemez kalırsa
- Mobile native istemci kararı alınırsa (bu durumda frontend-shared logic ortak paket gerektirebilir)
- React major version değişimi (örn React 20+) breaking olur ve güncelleme rewrite'tan kolay olmazsa

## What Was Considered Instead

- Vocabulary unification (`03-vocabulary-unification.md`)
- Legal logic migration (frontend resolvers → backend calculators) — ADR-0003

## References

- `02-frontend-seam-scan.md` (frontend baseline)
- ADR-0003 (frontend may not infer legal truth)
