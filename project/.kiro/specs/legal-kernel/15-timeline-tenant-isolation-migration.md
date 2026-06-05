---
status: active
review-trigger: "Kodlama başlamadan önce — onay gerekli"
phase: 2
sprint: 2D
---

# 15 — IcrabotTimelineEntry Tenant Isolation Migration Mini-Spec

**Tarih:** 2026-06-05
**Durum:** Active — kodlama öncesi mimari karar belgesi
**Bağımlılık:** Sprint 1 (DomainEventIngest + aggregate_version + immutability triggers), Sprint 2B (PAYMENT_RECEIVED)
**Hedef:** Event log'da tenant izolasyonunu convention'dan **storage-level enforcement**'a taşımak.

---

## 0. Neden Bu Spec Gerekli

Event log (`IcrabotTimelineEntry`) hukuki olguların kanonik kaydı. Ama tabloda **`tenantId` kolonu yok** — sadece `caseId` var. tenantId, DomainEventIngest yolunda `body` JSON'una (`body.header.tenantId`) gömülü; sorgulanabilir/partition'lanabilir bir kolon değil.

**Risk:** Tenant izolasyonu "her sorgu caseId ile gelir, caseId zaten tenant-unique" convention'ına dayanıyor. Immutability'yi DB trigger ile zorladık; **tenancy'yi de aynı seviyeye çıkarmalıyız.** Bir gün caseId olmadan (tenant bazlı) sorgu/partition gerektiğinde veya çapraz-tenant bir caseId sızdığında, kolon-seviyesi koruma şart.

**Anayasal ilke (eklenir):**
> Tenant identity must be explicit at write time on every legal-fact row, not inferred per-read.

---

## 1. Karar Tablosu (Writer-by-Writer)

İki writer var, gerçeklikleri farklı:

| Writer | tenantId context'te var mı? | Karar |
|--------|------------------------------|-------|
| **A — `DomainEventIngestService`** (canonical path: case/collection) | ✅ `event.header.tenantId` zaten elde | Kolona **doğrudan** yaz. Sıfır maliyet. |
| **B — `v28 timeline.service`** (UYAP event işleme) | ❌ Pipeline caseId-merkezli (engine-runner sadece `caseId` taşır) | **Boundary-resolution + threading** (aşağıda) |

### Writer B kararı (onaylı)

**Ana yol = explicit `tenantId` param.** `AddTimelineParams`'a `tenantId: string` eklenir.

tenantId nasıl elde edilir:
- **v28 ingestion sınırında BİR KEZ** çözülür (`uyap-event-ingest.service` caseId→`case.tenantId`), sonra pipeline boyunca explicit taşınır: `uyap-event-ingest → engine-runner → action-handler/action-feedback → timeline.service`.
- UYAP event'leri sisteme `caseId` ile girdiği için (tenantId göndermiyor), sınırda **tek sefer** türetme kaçınılmaz ve kabul edilir.

**Yasak:** Per-insert lookup (her timeline yazımında `case` sorgusu). Kırılgan ve dolaylı.

**Geçici köprü (fallback):** Tam threading bu sprint'e sığmazsa, `timeline.service` param eksikse caseId'den türetir — ama **açık `// TODO(bridge): remove after v28 threading` işaretiyle.** Kalıcı tasarım değil; sunset'i Sprint 2D sonu.

---

## 2. Schema Değişikliği

```prisma
model IcrabotTimelineEntry {
  // ... mevcut alanlar ...
  tenantId String   // YENİ — Faz 2 sonunda NOT NULL
  // ...
  @@unique([caseId, aggregateVersion])     // değişmez (caseId zaten tenant-unique)
  @@index([tenantId, caseId])              // YENİ — tenant-scoped sorgu/partition
  @@index([caseId])                        // mevcut, korunur
}
```

**Constraint notu:** `@@unique([caseId, aggregateVersion])` değişmiyor — caseId tenant-unique olduğu için aggregate sırası bozulmaz. Savunma derinliği için ileride `[tenantId, caseId, aggregateVersion]`'a genişletilebilir (opsiyonel, bu sprint değil).

---

## 3. Backfill

Tek seferlik, mevcut satırlar için:

```sql
UPDATE icrabot_timeline_entries t
SET tenant_id = c.tenant_id
FROM cases c
WHERE c.id = t.case_id
  AND t.tenant_id IS NULL;
```

**Yetim satır kontrolü:** caseId'si `cases`'te bulunmayan timeline satırı varsa migration durur (veri tutarsızlığı sinyali). Önce `SELECT COUNT(*) ... WHERE c.id IS NULL` ile doğrulanır.

---

## 4. Migration Fazları (zero-downtime)

| Faz | İş | Neden |
|-----|-----|-------|
| 1 | `tenantId` **nullable** kolon ekle + index | Mevcut yazımları kırmaz |
| 2 | App writer'ları güncelle (A: header'dan; B: param) → yeni satırlar dolu gelir | Yeni veri canonical |
| 3 | Backfill (§3) → eski satırlar dolar | Geçmiş tutarlı |
| 4 | `NOT NULL` constraint ekle | Storage-level garanti |

**Faz 4, Faz 2+3 doğrulanmadan uygulanmaz.** (Doluluk: `SELECT COUNT(*) WHERE tenant_id IS NULL` = 0 olmalı.)

---

## 5. Opsiyonel DB-Enforcement (Deferred — Sprint 3)

Immutability'yi DB trigger'la zorladığımız gibi, tenant tutarlılığını da zorlayabiliriz:

```sql
-- timeline.tenantId, case'in tenant'ı ile eşleşmeli (defense-in-depth)
CREATE TRIGGER enforce_timeline_tenant_consistency ...
```

Bu sprint **kapsamı dışı** — önce kolon + backfill + NOT NULL. Trigger Sprint 3.

---

## 6. Etki Alanı (Impact Scope — koddan doğrulandı)

| Soru | Cevap |
|------|-------|
| Kim yazıyor? | A: `DomainEventIngestService:95` (header'dan) · B: `v28 timeline.service:69` (param + boundary resolution) |
| Kim okuyor? | Hepsi caseId ile: `getNextAggregateVersion`, `validateRetroactive`, `timeline.service` findMany, testler. **Kolon additive → hiçbiri kırılmaz.** |
| v28 threading etkilenen dosyalar | `uyap-event-ingest`, `engine-runner`, `action-handler`, `action-feedback`, `seed`, `v28-engine.controller` |
| Test kırılır mı? | Hayır (additive). Yeni test: her iki writer'ın tenantId doldurduğunu assert. |
| Migration? | Evet (§4). |

---

## 7. Test Planı

| Test | Doğrular |
|------|----------|
| Writer A: case.create → CASE_OPENED satırında `tenantId = header.tenantId` | Header propagation |
| Writer B: UYAP event → timeline satırında `tenantId` dolu (sınırda çözülmüş) | Boundary resolution |
| Backfill: nullable satır + backfill → tüm satırlar dolu | Migration correctness |
| NOT NULL sonrası: tenantId'siz insert reddedilir | Storage enforcement |
| Tenant-scoped sorgu: `WHERE tenantId = X` doğru satırları döner | Index/partition |

---

## 8. Explicitly Deferred

| Item | Neden | Ne Zaman |
|------|-------|----------|
| DB trigger tenant consistency (§5) | Önce kolon + backfill yeter | Sprint 3 |
| `[tenantId, caseId, aggregateVersion]` unique genişletme | Mevcut unique yeterli | Sprint 3 |
| Geçici bridge fallback'in kaldırılması (tam threading) | Sığmazsa | Sprint 2D sonu |
| Aynı pattern `IcrabotFactAudit` / `IcrabotOutboxAction`'a | Ayrı tablolar, ayrı migration | Sprint 2D+ |

---

## 9. Başarı Kriteri

> Her yeni event log satırı, yazım anında explicit `tenantId` taşır (per-read inference yok). Mevcut satırlar backfill ile doldurulur. Faz sonunda `tenantId` NOT NULL ve tenant-scoped sorgu index'li.

---

## 10. Anayasal Uyum

| İlke | Uyum |
|------|------|
| Tenant identity explicit at write time | ✅ Param/header, lookup değil |
| Immutability korunur | ✅ Kolon additive, mevcut trigger'lar değişmez |
| aggregate_version sırası bozulmaz | ✅ `@@unique([caseId, aggregateVersion])` aynı |

---

## DoD

- [ ] §1 writer kararları onaylı (A: header, B: boundary+threading, fallback TODO'lu)
- [ ] §2 schema değişikliği
- [ ] §3 backfill + yetim kontrolü
- [ ] §4 4-faz migration (nullable → write → backfill → NOT NULL)
- [ ] §7 test planı
- [ ] **ulas onayı**

---

**Decision Status:** Pending approval
**Sonraki:** Onay sonrası Faz 1 (nullable kolon + index migration).
