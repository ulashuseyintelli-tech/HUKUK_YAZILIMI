---
status: completed
phase: 2
sprint: 2B
sealed-on: 2026-05-21
---

# Phase 2 Sprint 2B — Checkpoint

**Tarih:** 2026-05-21  
**Durum:** ✅ TAMAMLANDI ve KAPANDI  
**Başarı Kriteri:** A payment cannot be recorded without a canonical PAYMENT_RECEIVED event in the same transaction.

---

## Teslim Edilen İşler

| Task | Açıklama |
|------|----------|
| 13-payment-received-migration.md | Mini-spec (accepted, 3 sertleştirme) |
| collection.service.ts rewrite | $transaction wrap + event append + duplicate + closed-case |
| collection.module.ts | DomainEventIngestModule import |
| collection-payment-received.integration.spec.ts | 12 integration test (real PostgreSQL) |

---

## Değişen Dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `collection/collection.service.ts` | create() → $transaction, PAYMENT_RECEIVED append, duplicate pre-check, closed-case reject, source→header mapping, autoAllocateInTx, late-entry warning |
| `collection/collection.module.ts` | DomainEventIngestModule import |
| `collection/__tests__/collection-payment-received.integration.spec.ts` | 12 yeni integration test |
| `.kiro/specs/legal-kernel/13-payment-received-migration.md` | Mini-spec (accepted) |

---

## Test Evidence

```
collection-payment-received.integration.spec.ts: 12/12 PASSED
domain-event-ingest.validation.spec.ts:          24/24 PASSED
domain-event-ingest.integration.spec.ts:         10/10 PASSED
─────────────────────────────────────────────────────────────
TOTAL:                                           46/46 PASSED
Database: postgresql://postgres:***@localhost:5432/hukuk_db
```

---

## Accepted Rules (Sprint 2B'de enforce edilen)

| Rule | Enforcement |
|------|-------------|
| HR-39 | Same-tx: collection + event + outbox atomic |
| HR-44 | Outbox same-tx |
| HR-45 | Rollback guarantee (Test 7: autoAllocate fail → full rollback) |
| HR-34 | EXTERNAL_SIGNED → evidence zorunlu (Test 8) |
| HR-12 | Currency explicit in event payload (Test 5) |
| Anayasa C | Allocation payload'da yok (Test 4) |
| IR-003 (simplified) | External duplicate → ConflictException (Test 3) |
| 06-aggregate-boundaries | forDebtorId propagation (Test 6) |
| Closed-case rule | HITAM/INFAZ → BadRequestException (Test 2) |

---

## Known Limitations

| Limitation | Deferred To |
|-----------|-------------|
| `amountMinor` (bigint canonical money) | Sprint 3 |
| Late-entry threshold enforcement (30/365 gün) | Sprint 3 |
| Quarantine workflow (IR-003 full) | Sprint 3+ |
| Pending intake queue (closed-case soft handling) | Sprint 3 |
| PAYMENT_REVERSED event | Sprint 2C veya 2D |
| autoAllocate → event-driven allocation rewrite | Sprint 4+ |

---

## Sprint 2 Toplam Durum

| Sprint | İş | Test | Durum |
|--------|-----|------|-------|
| 2A | Actor propagation (userId → event header) | — | ✅ |
| 2B | PAYMENT_RECEIVED migration (tx + event + guards) | 12 integration | ✅ |

**Toplam test sayısı:** 46 (Sprint 1: 34 + Sprint 2B: 12)

---

## Sonraki Sprint

**Phase 2 Sprint 2C: INTEREST_POLICY_ASSIGNED**

Hedef: Faiz politikası atama event'i — Money Truth Kernel'in "hangi yorumla hesaplanacak?" sorusunun canonical cevabı.

Önemli fark: Bu mevcut akışa event ekleme değil, **yeni event emission noktası yaratma**. Mevcut `interestType` field'ı case create'te set ediliyor ama event olarak emit edilmiyor.

---

**İmza:** ulas (2026-05-21)  
**Resmi Status:** Phase 2 Sprint 2B sealed.
