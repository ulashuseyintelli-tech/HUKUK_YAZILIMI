---
status: deferred
owner: ulas
review-trigger: "v28 UYAP timeline persistence yeniden aktive edilmeden önce; veya v28 path canlıya alınırsa derhal"
depends-on: "Sprint 1 aggregateVersion + gap-free trigger (mevcut)"
discovered: "spec-15 Faz 2 Writer B boundary testi sırasında (2026-06-05)"
---

# v28 timeline aggregateVersion gap

## Note (canonical)

> v28 timeline.addEntry path currently cannot persist real DB entries because aggregateVersion is required after Sprint 1.
> Observed during spec-15 Writer B test.
> Current v28 boundary test stubs timeline write and only verifies tenantId resolution/propagation.
> Before reactivating v28 timeline persistence, add aggregateVersion assignment compatible with gap-free trigger.

## Why deferred

spec-15 (timeline tenant isolation) hattını dağıtmamak için. Şimdi `aggregateVersion`
atamasını `timeline.service.addEntry`'ye eklemek, tenantId migration'ının kapsamını
genişletir ve gap-free trigger ile etkileşim (concurrency, sıralama) ayrı bir tasarım gerektirir.

## Observed where

- `timeline.service.ts: addEntry` → `icrabotTimelineEntry.create({ data })` `aggregateVersion` sağlamıyor.
- Sprint 1'den beri `aggregateVersion BigInt` (NOT NULL, default yok) → her v28 `addEntry` çağrısı
  runtime'da `PrismaClientValidationError: Argument 'aggregateVersion' is missing`.
- Etkilenen call site'lar: `uyap-event-ingest`, `engine-runner` (6), `action-handler` (4),
  `action-feedback` (2), `seed` (4) — toplam 16.
- Canonical path (`DomainEventIngest`) `getNextAggregateVersion` ile bunu zaten sağlıyor; v28 yolu sağlamıyor.

## Trigger to start

- v28 UYAP timeline persistence yeniden aktive edilecekse, VEYA
- UYAP event ingestion canlıya alınacaksa (o anda derhal).

## Depends on

- Mevcut gap-free trigger semantiği (`enforce_aggregate_version_gap_free`).

## Risk if delayed

- v28 UYAP path canlıda kullanılırsa timeline yazımı tamamen patlar (ingestion akışı kırılır).
- v28 dormant kaldığı sürece risk düşük (canonical path DomainEventIngest çalışıyor).

## Suggested fix (when picked up)

- `addEntry`'ye `DomainEventIngest.getNextAggregateVersion` benzeri `max(aggregateVersion)+1`
  hesaplaması ekle (aynı tx içinde, gap-free trigger ile uyumlu).
- Concurrency: per-case sıralama trigger tarafından zaten enforce ediliyor; atama tx içinde olmalı.

## Decision owner

ulas

## Next review

review-trigger (yukarıda).
