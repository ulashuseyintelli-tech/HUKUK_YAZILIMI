---
status: deferred
owner: ulas
review-trigger: "Event log büyüklüğü 1M+ event'e ulaşır veya replay süresi 30 dakikayı aşar"
depends-on: "Aggregate version + snapshot pattern Faz 1'de eklenmeli"
---

# Snapshot Verifier Daemon

## Why deferred

`00-architecture.md` §9 snapshot strategy zaten tanımlı: her N event'te bir, hash chain ile doğrulama. Ama **periyodik tüm zinciri doğrulayan bir daemon** Faz 2 işi.

Şu an event sayısı az → on-demand doğrulama yeterli.

## Trigger to start

- Event log 1M+ event/case'e ulaşır
- Replay süresi 30 dakikayı aşar (snapshot olmadan)
- Audit denetimi "günlük integrity check" talep eder

## Risk if delayed

- Düşük. Snapshot pattern Faz 1'de doğru kurulursa, daemon eklemek 1 haftalık iş.
- Ama Faz 1'de snapshot pattern doğru kurulmazsa daemon eklemek geri dönüşlü iş.
