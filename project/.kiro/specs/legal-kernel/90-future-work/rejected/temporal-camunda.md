---
status: rejected
rejection-date: 2026-05-19
rejected-by: ulas
review-trigger: "Custom workflow engine kanıtlanabilir şekilde başarısız olursa"
---

# Temporal / Camunda / Generic Workflow Engine

## Reason for Rejection

Generic workflow engine'ler:

- Domain semantiği bilmez (tebligat, haciz, kesinleşme bunların hepsi "task")
- Türkçe hukuki tarih aritmetiği yapmaz (adli tatil, iş günü vs takvim günü, tebligat süreleri)
- Multi-tenant isolation'ı bizim ihtiyacımız kadar sıkı yapmaz
- Compliance/audit log formatı bizim ihtiyacımıza uymaz

Custom ama minimal engine — Türk icra hukuku vocabulary'siyle yazılmış — generic engine'den 10x daha hızlı sonuç verir.

Bizim mevcut altyapı (v28-engine'in EventRuntimeService) bu custom engine zaten. Generic'e dönüş regression olur.

## Reopen Trigger

Bu fikir şu durumda yeniden gündeme gelir:

- Custom EventRuntimeService bakım maliyeti haftada 1+ gün'e çıkarsa
- Çoklu domain (sadece icra değil, tahkim/vergi/SGK) tek motorda sürdürülmeye başlanırsa
- Microservice split kararı alınırsa (rejected — bkz microservice-split.md)

## What Was Considered Instead

Custom rule runner: `icrabot/v28-engine/EngineRunnerService`. YAML rule definitions + expression evaluator + outbox dispatcher. Domain-aware.

## References

- `00-architecture.md v2` §14 (Yasak Alanlar)
- ADR-0002 (policy-vs-runtime split — bu generic engine değil, custom 2-layer split)
