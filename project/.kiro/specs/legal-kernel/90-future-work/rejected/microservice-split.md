---
status: rejected
rejection-date: 2026-05-19
rejected-by: ulas
review-trigger: "Bounded context'ler stabilize ve aralarında ölçek baskısı oluşursa"
---

# Microservice Split

## Reason for Rejection

Mevcut monolitin (NestJS monorepo) sorunu **scope yönetimi**, network split değil. Vocabulary parçalanması, motor isim çakışmaları, frontend legal logic leak — hepsi disiplin sorunu, dağılma sorunu değil.

Microservice'e şimdi geçmek:
- Vocabulary stabilize değil → bounded context'ler hâlâ belirsiz → service boundary'leri yanlış çizilir
- Mevcut transactional consistency dağılır
- Operasyonel maliyet artar (çoklu deploy, network latency, distributed tracing)
- "Şu an 1 ekip + 1 buçuk geliştirici" ölçeğine uymaz

## Reopen Trigger

Bu fikir şu durumda yeniden gündeme gelir:

- Vocabulary stabilize + bounded context'ler iyi tanımlı + 5+ geliştirici çalışmaya başladığında
- Iki ayrı domain (icra vs vergi vs tahkim) tek deploy'da çatışmaya başlarsa
- Müşteri SLA'sı service-level isolation talep ederse

## What Was Considered Instead

- Module boundary disiplini (NestJS modules)
- `core-runtime/` vs `runtime-lab/` ayrımı (architectural, deploy değil)
- 70 modülün konsolidasyonu (Faz 2 işi, ayrı görev)

## References

- `00-architecture.md v2` §14 (Yasak Alanlar)
- ADR-0001 (formalize değil split, ana mimari karar zaten formalize)
