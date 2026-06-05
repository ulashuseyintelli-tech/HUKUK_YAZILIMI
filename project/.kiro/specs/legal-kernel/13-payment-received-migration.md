---
status: active
review-trigger: "Sprint 2B kodlama başlamadan önce — onay gerekli"
phase: 2
sprint: 2B
---

# 13 — PAYMENT_RECEIVED Migration Mini-Spec

**Tarih:** 2026-05-21  
**Durum:** Active — kodlama öncesi mimari karar belgesi  
**Bağımlılık:** Sprint 1 (DomainEventIngestService), Sprint 2A (actor propagation)  
**Hedef:** `collection.service.create()` → `PAYMENT_RECEIVED` event emission (same-tx)

---

## 0. Neden Bu Spec Gerekli

`PAYMENT_RECEIVED` migration'ı `CASE_OPENED`'dan temelden farklı:

| Boyut | CASE_OPENED | PAYMENT_RECEIVED |
|-------|-------------|------------------|
| Source | Tek (HUMAN) | Üç (HUMAN, EXTERNAL, SYSTEM) |
| Duplicate riski | Yok | Var (bank reference) |
| Retroactive | Yok | Var (geçmiş tarihli ödeme) |
| Closed-case | N/A | Engellenmeli |
| Transaction | Zaten vardı | **Yok — eklenmeli** |
| Allocation | N/A | Projection (payload'da yok) |

Bu belge kodlama öncesi kararları kilitler.

---

## 1. Source → Header Mapping (Canonical)

Mevcut `CollectionSource` enum'ı canonical kaynak. Yeni enum yaratılmaz.

| CollectionSource | actor.type | occurredAtConfidence | occurredAtEvidence |
|-----------------|-----------|---------------------|-------------------|
| `MANUAL` | HUMAN | USER_DECLARED | — |
| `SETTLEMENT` | HUMAN | USER_DECLARED | — |
| `BANK_SEIZURE` | EXTERNAL | EXTERNAL_SIGNED | bank transaction ID |
| `SALARY_SEIZURE` | EXTERNAL | EXTERNAL_SIGNED | employer reference |
| `AUCTION` | EXTERNAL | EXTERNAL_SIGNED | auction record ID |
| `EXTERNAL_CASE` | EXTERNAL | EXTERNAL_SIGNED | external case ref |
| `THIRD_PARTY` | EXTERNAL | USER_DECLARED | — |

**Kural:** `EXTERNAL_SIGNED` seçildiğinde `occurredAtEvidence` zorunlu. Bu zaten HR-34 tarafından enforce ediliyor (DomainEventIngestService validation).

**actor.userId mapping:**
- `HUMAN` → request context'ten `userId` (Sprint 2A ile kuruldu)
- `EXTERNAL` → `actor.externalSystem` = source system adı (bank name, UYAP, vb.)
- `SYSTEM` → `actor.userId = 'system'`, `actor.reason` = migration/backfill açıklaması

---

## 2. PAYMENT_RECEIVED Event Payload

```typescript
interface PaymentReceivedPayload {
  // Zorunlu
  amount: number;           // current DTO decimal (mevcut uyum)
  amountMinor?: bigint;     // future canonical money field (Sprint 3 canonicalization)
  currency: string;         // Explicit zorunlu — event'e normalize edilmiş değer yazılır
  paymentDate: string;      // ISO8601 — occurred_at ile aynı olabilir
  
  // Kaynak bilgisi
  channel: CollectionChannel;     // BANKA, NAKIT, CEK, HACIZ, vb.
  sourceType: CollectionSource;   // MANUAL, BANK_SEIZURE, vb.
  sourceId?: string;              // External reference (bank tx ID, receipt no)
  
  // Opsiyonel
  forDebtorId?: string;           // Per-debtor allocation (06-aggregate-boundaries)
  description?: string;
  bankName?: string;
  receiptNo?: string;
  
  // Audit
  collectionId: string;           // DB row ID (cross-reference)
}
```

**Currency normalization kuralı:** DTO'da `currency` boş gelebilir. Service seviyesinde `const currency = dto.currency ?? 'TRY'` normalize edilir. Ama event payload'a **mutlaka normalize edilmiş değer** yazılır. Event'te "default yok" = "boş bırakılamaz" demek, "DTO'dan default alınamaz" demek değil.

**Payload'da OLMAYACAKLAR (Anayasa C — allocation = projection):**
- ❌ `allocatedToPrincipal`
- ❌ `allocatedToInterest`
- ❌ `allocatedToExpense`
- ❌ `remainingBalance`
- ❌ `allocationBreakdown`

---

## 3. Duplicate Pre-Check (Domain Level)

**Sorumluluk:** `collection.service.create()` — event infrastructure değil.

### Kural

| Durum | Davranış |
|-------|----------|
| `sourceType ∈ {BANK_SEIZURE, SALARY_SEIZURE, AUCTION, EXTERNAL_CASE}` AND `sourceId` mevcut | `caseId + sourceType + sourceId` ile mevcut collection var mı kontrol et |
| Duplicate bulunursa | `ConflictException` fırlat (hard reject) |
| `sourceType = MANUAL` | Duplicate kontrolü yapılmaz (aynı tutarda ödeme geçerli olabilir) |
| `sourceType = THIRD_PARTY` | Warning log, reject yok |

**Neden hard reject (IR-003'ten farklı):** IR-003 quarantine + human review öneriyordu. Ama Sprint 2B'de quarantine queue henüz yok. Şimdilik: external source duplicate = hard reject. Quarantine workflow Sprint 3+ scope.

### Implementation

```typescript
// collection.service.create() içinde, event append'den ÖNCE
if (EXTERNAL_SOURCES.has(dto.sourceType) && dto.sourceId) {
  const existing = await tx.collection.findFirst({
    where: { caseId: dto.caseId, sourceType: dto.sourceType, sourceId: dto.sourceId },
  });
  if (existing) {
    throw new ConflictException(
      `Duplicate payment: ${dto.sourceType}/${dto.sourceId} already recorded`
    );
  }
}
```

---

## 4. Closed-Case Intake Handling

**Kural:** Closed case'e (`caseStatus ∈ {HITAM, INFAZ}`) payment doğrudan event olarak yazılmaz.

### Davranış

| Case Status | Davranış |
|-------------|----------|
| `DERDEST`, `ISLEMDE`, `DERKENAR` | Normal akış — event append |
| `HITAM`, `INFAZ` | `BadRequestException`: "Kapalı dosyaya tahsilat eklenemez. Dosyayı yeniden açın." |

**Neden reject (pending_intake queue değil):** Pending intake queue henüz yok. Sprint 2B'de minimal: hard reject + açıklayıcı mesaj. Avukat önce `CASE_REOPENED` emit eder, sonra payment kaydeder. Bu HR-26 ile uyumlu (reopen = human decision).

### Implementation

```typescript
// collection.service.create() içinde, tx başlangıcında
const caseData = await tx.case.findFirst({
  where: { id: dto.caseId, tenantId },
  select: { id: true, caseStatus: true },
});

if (!caseData) throw new NotFoundException("Dosya bulunamadı");

const CLOSED_STATUSES = ['HITAM', 'INFAZ'];
if (CLOSED_STATUSES.includes(caseData.caseStatus)) {
  throw new BadRequestException(
    "Kapalı dosyaya tahsilat eklenemez. Önce dosyayı yeniden açın (CASE_REOPENED)."
  );
}
```

---

## 5. Transaction Wrapping (Kritik Değişiklik)

**Mevcut durum:** `collection.service.create()` transaction kullanmıyor.  
**Yeni durum:** Tüm akış `prisma.$transaction()` içine sarılacak.

### Atomic Boundary

```
prisma.$transaction(async (tx) => {
  1. Case status kontrolü (closed-case reject)
  2. Duplicate pre-check (external source)
  3. Collection row create
  4. PAYMENT_RECEIVED event append (DomainEventIngestService)
  5. Auto-allocate (mevcut logic, tx içinde)
})
```

**Garanti (HR-39, HR-44, HR-45):**
- Collection row + event + outbox = atomic
- Biri fail → hepsi rollback
- Yarı durum (collection var, event yok) imkansız

### autoAllocate Değişikliği

Mevcut `autoAllocate()` ayrı Prisma call'lar yapıyor. Sprint 2B'de tx parametresi alacak:

```typescript
await this.autoAllocate(tx, tenantId, collection.id, dto.amount);
```

**Kritik kural:** `autoAllocate()` may update projection/allocation tables within the same tx, but:
- ❌ May NOT mutate PAYMENT_RECEIVED event payload
- ❌ May NOT emit PAYMENT_ALLOCATED event (allocation = projection, not event — Anayasa C+D)
- ✅ May write to `collectionAllocation` table (projection data, not legal fact)

---

## 6. Late Entry Audit Flag

**Kural:** `occurred_at` (payment date) ile `recorded_at` (now) arasında fark varsa audit flag.

| Fark | Davranış |
|------|----------|
| ≤ 30 gün | Normal — flag yok |
| > 30 gün | `is_late_entry: true` audit log'a yazılır |
| > 365 gün | `is_late_entry: true` + `late_entry_distance_days: N` |

**Sprint 2B scope:** Sadece flag. Reject veya authorization zorunluluğu yok (Sprint 3+ policy refinement).

### Implementation

Event payload'a ek field değil — event header'daki `occurredAt` vs `recorded_at` (createdAt) farkı replay validator tarafından tespit edilir. Sprint 2B'de: service-level warning log yeterli.

```typescript
const daysDiff = Math.floor(
  (Date.now() - new Date(dto.date).getTime()) / (1000 * 60 * 60 * 24)
);
if (daysDiff > 30) {
  this.logger.warn(
    `Late payment entry: ${daysDiff} days old (case=${dto.caseId})`
  );
}
```

---

## 7. Explicitly Deferred (Sprint 2B Scope DIŞI)

| Deferred Item | Neden | Ne Zaman |
|---------------|-------|----------|
| `amountMinor` canonicalization (bigint Money) | Mevcut DTO decimal uyumu korunmalı | Sprint 3 |
| Late-entry threshold enforcement (reject/authorization) | Policy refinement, premature | Sprint 3 |
| Allocation rewrite (TBK 100 event-driven) | Projection layer, ayrı spec | Sprint 4+ |
| Bank reconciliation engine | External integration | Phase 3 |
| Automatic quarantine workflow (IR-003 full) | Operational maturity | Sprint 3+ |
| Pending intake queue (closed-case soft handling) | Queue infrastructure | Sprint 3 |
| PAYMENT_REVERSED event | Ayrı migration, caused_by chain | Sprint 2C |
| Multi-currency conversion at event time | Faz 1 TRY-only | Phase 3 |

---

## 8. Implementation Sırası

| Adım | İş | Bağımlılık |
|------|-----|-----------|
| 1 | `collection.service.create()` → `$transaction` wrap | — |
| 2 | Closed-case status check (tx içinde) | 1 |
| 3 | Duplicate pre-check (external source, tx içinde) | 1 |
| 4 | Source → header mapping utility function | — |
| 5 | `PAYMENT_RECEIVED` event append (tx içinde, step 3 sonrası) | 1, 4 |
| 6 | `autoAllocate()` → tx parametresi al | 1 |
| 7 | Late-entry warning log | — |
| 8 | Unit tests (validation, mapping, duplicate) | 4, 5 |
| 9 | Integration tests (same-tx, rollback, closed-case reject) | 1-7 |

---

## 9. Başarı Kriteri

> Bir ödeme kaydedildiğinde, aynı transaction içinde:
> - Collection row yazılır
> - PAYMENT_RECEIVED event append edilir (aggregate_version increment)
> - Outbox row yazılır
> - Allocation projection hesaplanır
>
> Ve şu durumlar DB-enforced olarak engellenir:
> - Closed case'e payment (hard reject)
> - External source duplicate (ConflictException)
> - Event payload'da allocation bilgisi (type system)

---

## 10. Anayasal Uyum Kontrolü

| Anayasa | Uyum |
|---------|------|
| **(A)** Legal facts are immutable | ✅ Event append-only, DB trigger korumalı |
| **(C)** Payment is a legal fact, allocation is calculation | ✅ Payload'da allocation yok |
| **(D)** Events represent legal facts, not computations | ✅ Allocation projection ayrı |
| **(E)** Legal consequences not inferred automatically | ✅ Payment kayıt otomatik olabilir, ama closure/reopen insan kararı |
| **(09a)** Replay uses recorded truth | ✅ recorded_at server-side, occurred_at payload'da |
| **(11a)** Domain event bridge = transaction discipline | ✅ Same-tx append |
| **(11b)** Outbox same-tx | ✅ Atomic boundary |

---

## DoD

- [x] Source → header mapping tablosu
- [x] Event payload tanımı (allocation yok)
- [x] Duplicate pre-check kuralı
- [x] Closed-case handling kararı
- [x] Transaction wrapping planı
- [x] Late-entry audit flag
- [x] Explicitly deferred listesi
- [x] Implementation sırası
- [x] Başarı kriteri
- [x] Anayasal uyum kontrolü
- [x] **ulas onayı (2026-05-21)**

---

**Decision Status:** Accepted  
**Accepted On:** 2026-05-21  
**Sertleştirmeler:** amountMinor deferred, currency normalization kuralı, autoAllocate isolation kuralı  
**Sonraki:** Implementation adım 1 (transaction wrap) başlıyor.
