---
status: pending
created: 2026-05-19
timeout: 2026-06-02
owner: ulas
investigation-needed: "IcrabotCaseFact mutable kalmaya devam mı, append-only event log'a dönüştürülmeli mi"
---

# IcrabotCaseFact Mutability Status

## Why Pending

`00-architecture.md v2 §11` "IcrabotCaseFact mutable kalacak (current state), gerçek event log IcrabotTimelineEntry ve IcrabotFactAudit'tedir" diyor. **Ama:** mevcut kod (`factstore.service.ts:write()`) `IcrabotFactAudit`'e eski değeri kopyalayıp `IcrabotCaseFact`'e yeni değeri yazıyor (upsert).

Bu pattern **append-only değil**, "audit-logged mutable state". Anayasal ilke ihlali sayılır mı?

İki yaklaşım:
- **(α) Mevcut hali kabul:** `IcrabotCaseFact` = current state (mutable), `IcrabotFactAudit` = event log (append-only). Audit log "gerçek" kabul edilir, fact "cache" gibi davranır.
- **(β) Append-only'e geçir:** `IcrabotCaseFact` artık update-able olmaz, yeni fact = yeni satır (versionlı). `IcrabotFactAudit` silinir veya birleşir.

(β) daha "purist event-sourced" ama mevcut kod tabanı (α) varsayıyor. Karar gerek.

## Investigation Plan

1. `IcrabotFactAudit` query patterns: kim ne için okuyor? Replay için mi, görüntüleme için mi?
2. (β)'ye geçişin maliyeti: kaç sorgu kırılır, projection ne kadar değişir?
3. (α) altında DB-level UPDATE engelleme triggers'ı `IcrabotFactAudit` tablosuna yeterli mi?

## Possible Resolutions

- **Active'e dönerse (α seçildiyse):** `IcrabotFactAudit`'e UPDATE/DELETE trigger'ı eklenir, ADR-0006 yazılır, `00-architecture.md` §11 netleşir.
- **Active'e dönerse (β seçildiyse):** Migration script yazılır, kod refactor edilir. Faz 1 kapsamı dışına taşar — alternatif olarak Faz 2'ye deferred.
- **Deferred'a dönerse:** Mevcut hali sürdürülür, ADR yazımı Faz 2'ye kalır.

## Timeout

2026-06-02 (created + 14 gün).

Aşılırsa default: `deferred` (mevcut pattern devam eder, Faz 2'de revize).
