---
status: rejected
rejection-date: 2026-05-19
rejected-by: ulas
review-trigger: "1M+ async events/day veya regional event distribution gereksinimi"
---

# Kafka / Distributed Event Bus

## Reason for Rejection

Mevcut PostgreSQL-based event store (`IcrabotTimelineEntry` + `IcrabotCaseFact` + `IcrabotEngineRun`) tek bir Türkiye-merkezli operasyonun ihtiyacını fazlasıyla karşılıyor. Kafka/RabbitMQ/NATS gibi distributed event bus'lar:

- Operasyonel karmaşıklık artırır (cluster yönetimi, partition stratejisi, consumer group)
- Mevcut transactional consistency garantisini bozar (DB transaction ile event atomicity uyumlu, Kafka değil)
- Hukuk yazılımında "event'i kaybettim" tolerans noktası yok
- Mevcut ölçek (Türkiye, kurumsal hukuk firmaları) bu altyapıyı talep etmiyor

## Reopen Trigger

Bu fikir şu durumda yeniden gündeme gelir:

- Sistem 1M+ async event/day işlemeye başlar
- Multi-region deployment kararı alınır (rejected — bkz multi-region.md)
- Real-time stream processing kritik bir özellik haline gelir (örn dashboard analytics, fraud detection)

## What Was Considered Instead

`IcrabotTimelineEntry` + cron-based polling + transactional outbox pattern (DB-backed). Mevcut altyapı zaten bu doğrultuda.

## References

- `00-architecture.md v2` §14 (Yasak Alanlar)
- ADR-0001 (formalize vs rewrite — Kafka rewrite'in parçası olur)
