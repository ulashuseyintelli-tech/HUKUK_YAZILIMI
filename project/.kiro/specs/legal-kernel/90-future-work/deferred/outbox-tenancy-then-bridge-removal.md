---
status: deferred
owner: ulas
review-trigger: "v28 worker/callback path'leri (action-handler, action-feedback) tenant-scoped sorgulanması gerektiğinde; veya v28 timeline persistence canlıya alınmadan önce bridge removal istenirse"
depends-on: "spec-15 (timeline tenant isolation), doc 26 (bridge-removal-blocked-decision)"
discovered: "bridge removal read-only forensic (2026-06-10)"
---

# outbox-tenancy → then bridge removal

## Strand (canonical)

> v28 `TimelineService.addEntry` tenantId bridge fallback'i kaldırmak için ön-koşul:
> worker/callback path'leri (action-handler, action-feedback) explicit tenantId taşımalı.
> Bu path'ler `IcrabotOutboxAction` kuyruğundan / callback'ten besleniyor ve outbox satırında
> tenantId YOK. Bu yüzden bridge removal, bağımsız bir **outbox-tenancy tasarımına** bağımlıdır.

## Neden ayrı strand

doc 26 (bridge-removal-blocked-decision) forensic'i: 19 addEntry çağrısının 11'i fallback'e
bağımlı; bunların 6'sı (action-handler 4 + action-feedback 2) worker/callback path'leri.
Bu path'lerde tenantId threading, ya `IcrabotOutboxAction`'a tenantId kolonu eklemeyi (schema +
migration) ya da worker boundary lookup'ı (bridge'i taşır, kaldırmaz) gerektirir. Her ikisi de
bridge removal'ın kırmızı çizgilerinin (no schema/migration) dışında → ayrı tasarım kararı.

## İş sırası (öneri, karar değil)

1. **outbox-tenancy design:** `IcrabotOutboxAction` (+ callback path'leri) tenantId taşıma kararı.
   - Seçenek: outbox satırına tenantId kolonu (additive, nullable→forward-only; spec-15 deseni) +
     worker'ların satırdan thread etmesi.
   - Seçenek: worker boundary'sinde tek-sefer resolution (bridge'i worker'a taşır — daha zayıf).
2. **seed path threading** (5 çağrı): kolay, seed case'i kendi yaratır; düşük öncelik (demo/test).
3. **bridge removal:** tüm 19 çağrı explicit tenantId taşıyınca addEntry fallback'i kaldır +
   doluluk doğrula (`tenant_id IS NULL` = 0) + (opsiyonel) spec-15 §5 tenant-consistency trigger.

## Risk if delayed

- Düşük: mevcut bridge fallback 11 yazımı tenant-doğru tutuyor (fail-closed değil, fail-correct).
- Bridge'i ÖN-KOŞULSUZ kaldırmak yüksek risk: fail-open tenant izolasyonu (doc 26 §3).

## Decision owner

ulas

## İlgili

- doc 26 — bridge-removal-blocked-decision (forensic + karar)
- spec-15 — timeline-tenant-isolation-migration (Writer B bridge, forward-only)
- v28-timeline-aggregate-version-gap.md (v28 gap — PR #32'de RESOLVED; bu strand'den ayrı)
