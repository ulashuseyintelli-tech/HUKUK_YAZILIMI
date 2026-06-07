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

---

## Canonical path concurrency race (2026-06-07 read-only scan — ek bulgu)

Yukarıdaki gap **v28 dormant path** ile ilgili. Bu bölüm, **canonical path'i de etkileyen** ayrı ve daha geniş bir bulguyu belgeler. (İmplementasyon YOK; bilinçli olarak ertelendi.)

### 1. v28 gap (mevcut not — özet)
- `timeline.service.addEntry` `aggregateVersion` sağlamıyor → NOT NULL ihlali.
- Şu an **dormant/stub**; canonical `DomainEventIngest` çalışıyor.
- v28 reactivation öncesi fix edilmeli. Şimdilik production etkisi düşük.

### 2. Canonical path concurrency race (YENİ)
- `DomainEventIngest.appendInTransaction` → `getNextAggregateVersion` = **kilitsiz** `aggregate _max(aggregateVersion) where caseId` **+ 1** (read-then-write).
- Hem canonical hem v28 **aynı `IcrabotTimelineEntry` tablosuna** yazar (gap-free trigger + `(caseId, aggregateVersion)` unique index orada).
- **Aynı `caseId` için eş zamanlı iki transaction** aynı `max+1`'i hesaplayabilir → ikisi de aynı versiyonu INSERT etmeye çalışır.
- **Veri bütünlüğü KORUNUR:** unique index + `validate_aggregate_version` trigger birini reddeder → **corruption yok, gap yok.**
- **Ama:** kaybeden transaction **hata alır** (unique violation → çağıranın tx'i rollback). **Retry / advisory lock / serileştirme YOK.**
- **Aynı tx içinde çift append güvenli** (ör. CASE_OPENED v1 → INTEREST_POLICY_ASSIGNED v2): ikinci append kendi tx'inin yazımını gördüğü için doğru `max+1` hesaplar. Risk yalnız **ayrı/eş zamanlı** tx'ler arası.

### 3. Karar (2026-06-07)
- **No implementation now.**
- **No schema / no migration.**
- **No advisory lock / retry yet** — contention kanıtı yok; integrity zaten constraint ile korunuyor → runtime hardening **spekülatif**, ölçmeden yapılmayacak.

### 4. Future trigger (bunlardan biri olursa ele alınır)
- v28 timeline persistence reactivation, **veya**
- Aynı case üzerinde **concurrent append hatası gözlemlenmesi** (prod log / unique-violation), **veya**
- Yüksek hacimli event append senaryosu (tek case'e paralel yazım).

### 5. Picked-up olduğunda muhtemel yönler (karar değil, seçenek)
- `getNextAggregateVersion`'da **per-case advisory lock** (`pg_advisory_xact_lock(hashtext(caseId))`) → serileştirme.
- veya unique-violation'da **idempotent retry** (max+1 yeniden hesapla).
- v28 fix: `addEntry`'ye aynı `max+1` mantığı (canonical ile tek kaynak).
