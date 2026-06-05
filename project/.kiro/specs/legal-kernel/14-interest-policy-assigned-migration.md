---
status: active
review-trigger: "Sprint 2C kodlama başlamadan önce — onay gerekli"
phase: 2
sprint: 2C
---

# 14 — INTEREST_POLICY_ASSIGNED Migration Mini-Spec

**Tarih:** 2026-05-21  
**Durum:** Active — kodlama öncesi mimari karar belgesi  
**Bağımlılık:** Sprint 2B (PAYMENT_RECEIVED), 00-architecture §5, interest-strategy.config.ts  
**Hedef:** Make legal computation contract explicit in the case event stream.

---

## 0. Neden Bu Event Kritik

`PAYMENT_RECEIVED` artık event stream'de. Ama bu event'in bakiye üzerindeki etkisini deterministic hesaplamak için:

- Hangi faiz türü? (`COMMERCIAL_AVANS_3095_2_2` vs `LEGAL_3095` vs `TTK_1530`)
- Hangi oran serisi? (`TCMB_AVANS` vs `TCMB_YASAL` vs `CONTRACT`)
- Hangi başlangıç tarihi? (keşide, ibraz, vade, ihtar, takip)
- Hangi gün sayısı bazı? (365 vs 360)
- Hangi yorum profili? (TBK100_V1 vs gelecek varyantlar)
- Hangi allocation policy? (TBK100_STANDARD vs gelecek varyantlar)

Bu soruların cevabı **event stream'de** olmalı. Aksi halde replay determinism bozulur: "o gün hangi policy geçerliydi?" sorusu cevapsız kalır.

`INTEREST_POLICY_ASSIGNED` = **legal computation contract**. Hesap sonucu değil, hesap kuralı.

---

## 1. Karar Tablosu

| Soru | Karar | Gerekçe |
|------|-------|---------|
| Event ne zaman emit edilir? | `case.service.create()` içinde, CASE_OPENED'dan hemen sonra (aynı tx) | İlk policy atama case lifecycle başlangıcı |
| Kaynak veri ne? | `interest-strategy.config.ts` registry + DTO alanları | Mevcut strategy resolver canonical |
| Default profile nedir? | `DEFAULT_TBK100_V1` (hardcoded, Sprint 3'te registry) | Yer ayır, implement sonra |
| Default allocation policy? | `TBK100_STANDARD` (hardcoded, Sprint 3'te registry) | Aynı yaklaşım |
| Override nasıl yapılır? | `reasoning` zorunlu, `is_default_profile: false` | Audit trail |
| Reassignment mümkün mü? | Evet — yeni INTEREST_POLICY_ASSIGNED event (superseding) | Deferred: Sprint 3 |
| Case başına kaç aktif policy? | Event stream'de N tane olabilir. Aktif = en son effective_from geçerli olan (projection) | Event store ≠ projection |
| PAYMENT_RECEIVED policy yokken? | Ödeme kabul edilir (Anayasa C). Allocation finalization blocked. Unallocated bekler. | 06-aggregate-boundaries invariant #6 |

---

## 2. Event Payload

```typescript
interface InterestPolicyAssignedPayload {
  // ─── Computation Contract ──────────────────────────────────────────
  interestType: InterestTypeCode;           // COMMERCIAL_AVANS_3095_2_2, LEGAL_3095, TTK_1530, CONTRACTUAL
  rateSeriesSource: string;                 // TCMB_AVANS, TCMB_YASAL, TCMB_TTK1530, CONTRACT
  startEvent: StartDateEvent;               // DRAW_DATE, PRESENTATION_DATE, DUE_DATE, etc.
  startDate: string;                        // ISO8601 — resolved concrete date
  dayCountBasis: 365 | 360;
  compoundingRule: 'NONE' | 'ANNUAL' | 'CUSTOM';
  
  // ─── Interpretation Context ────────────────────────────────────────
  interpretationProfileId: string;          // DEFAULT_TBK100_V1 (Sprint 2C hardcoded)
  allocationPolicyId: string;               // TBK100_STANDARD (Sprint 2C hardcoded)
  
  // ─── Source Classification ─────────────────────────────────────────
  debtNature: DebtNature;                   // COMMERCIAL, CIVIL, CONTRACTUAL, SUPPLY_DELAY
  caseTypeClassification: string;           // interest-strategy.config CaseType key
  
  // ─── Resolution Metadata ──────────────────────────────────────────
  isDefaultProfile: boolean;                // true = strategy registry'den otomatik
  reasoning?: string;                       // zorunlu if isDefaultProfile = false (override)
  
  // ─── Effective Date ────────────────────────────────────────────────
  // NOT: event header.effectiveFrom da kullanılır
  // payload.startDate = faiz başlangıç tarihi (hesap için)
  // header.effectiveFrom = policy'nin geçerlilik başlangıcı (genelde aynı)
}
```

**Payload'da OLMAYACAKLAR (Anayasa D — computation result değil):**
- ❌ `calculatedInterest`
- ❌ `currentBalance`
- ❌ `segments`
- ❌ `rateValues` (oran tablosu snapshot'ı — sealed artifact'te olur, event'te değil)

---

## 3. Source → Event Mapping

Mevcut `interest-strategy.config.ts` registry'si → event payload mapping:

```typescript
function resolveInitialPolicy(
  dto: CreateCaseDto,
  strategy: InterestStrategy,
): InterestPolicyAssignedPayload {
  // 1. interestType resolve
  let interestType: InterestTypeCode;
  if (strategy.defaultInterestType === 'AUTO_BY_DEBT_NATURE') {
    const debtNature = dto.assumeCommercial ? DebtNature.COMMERCIAL : DebtNature.CIVIL;
    interestType = resolveInterestTypeByDebtNature(debtNature);
  } else {
    interestType = strategy.defaultInterestType;
  }

  // 2. startDate resolve
  const startDate = dto.interestStartDate || dto.startDate || new Date().toISOString();

  return {
    interestType,
    rateSeriesSource: strategy.rateSeriesSource,
    startEvent: strategy.defaultStartEvent,
    startDate,
    dayCountBasis: strategy.dayCountBasis,
    compoundingRule: strategy.compounding ? 'ANNUAL' : 'NONE',
    interpretationProfileId: 'DEFAULT_TBK100_V1',
    allocationPolicyId: 'TBK100_STANDARD',
    debtNature: strategy.assumeCommercial ? DebtNature.COMMERCIAL : DebtNature.CIVIL,
    caseTypeClassification: resolveCaseTypeKey(dto),
    isDefaultProfile: true,
    // reasoning undefined for default
  };
}
```

---

## 4. Emission Point (Sprint 2C Scope)

### Initial Assignment (case.create içinde)

```
prisma.$transaction(async (tx) => {
  // ... mevcut case create steps ...
  
  // 8.5 CASE_OPENED (mevcut — Sprint 2B'den) → aggregateVersion = 1
  await domainEventIngest.appendInTransaction(tx, caseOpenedEvent);
  
  // 8.6 INTEREST_POLICY_ASSIGNED (YENİ — Sprint 2C) → aggregateVersion = 2
  // SERTLEŞTIRME 1: Sıra garanti altında.
  // INTEREST_POLICY_ASSIGNED.aggregateVersion = CASE_OPENED.aggregateVersion + 1.
  // Replay: "case önce var oldu, sonra computation contract aldı."
  const strategy = getInterestStrategy(resolveCaseTypeKey(dto));
  const policyPayload = resolveInitialPolicy(dto, strategy);
  await domainEventIngest.appendInTransaction(tx, {
    header: {
      eventId: randomUUID(),
      aggregateType: 'Case',
      aggregateId: newCase.id,
      eventType: 'INTEREST_POLICY_ASSIGNED',
      occurredAt: new Date().toISOString(),
      occurredAtConfidence: 'SYSTEM_VERIFIED',
      effectiveFrom: policyPayload.startDate,
      actor: { type: 'HUMAN', userId },
      tenantId,
    },
    payload: policyPayload,
  });
  
  // 9. Tam case'i döndür
});
```

**Sıra:** CASE_OPENED (v1) → INTEREST_POLICY_ASSIGNED (v2) — aynı tx, ardışık, gap-free.

### Sertleştirme 1: Event Sırası Garantisi

`DomainEventIngestService.appendInTransaction()` her çağrıda `max(aggregateVersion) + 1` kullanır. CASE_OPENED ve INTEREST_POLICY_ASSIGNED ardışık append edildiği için:

```
CASE_OPENED.aggregateVersion = 1
INTEREST_POLICY_ASSIGNED.aggregateVersion = 2
```

DB trigger `enforce_aggregate_version_gap_free` sırayı enforce eder. Test: "case create sonrası timeline'da v1=CASE_OPENED, v2=INTEREST_POLICY_ASSIGNED."

### Explicit Reassignment (Deferred — Sprint 3)

```
POST /cases/:id/interest-policy
Body: { interestType, startDate, reasoning, ... }
→ Yeni INTEREST_POLICY_ASSIGNED event (effectiveFrom = yeni tarih)
→ Eski policy superseded (projection seviyesinde)
```

Sprint 2C'de implement edilmez. Sadece spec'te yer ayrılır.

---

## 5. HR-26 Uyumu

`INTEREST_POLICY_ASSIGNED` **HR-26 listesinde** (human actor required). Bu doğru çünkü:
- Faiz politikası seçimi hukuki karar
- Otomatik resolve edilse bile **avukat adına** yapılıyor (case create = avukat aksiyonu)
- `actor.type = 'HUMAN'` zorunlu

Sprint 2C'de: case.create zaten `userId` propagate ediyor (Sprint 2A). Aynı actor kullanılır.

---

## 5a. Sertleştirme 2: effective_from Kuralı

**Kural:** Initial assignment için `effective_from = caseDate || createdAt`.

Case açılışında `caseDate` geçmiş tarihli girilebilir (takip dosyası geriye dönük kayıt). Bu normal bir geçmiş tarih girişidir.

| Durum | Davranış |
|-------|----------|
| `effective_from >= CASE_OPENED.occurred_at` | Normal — retroactive flag yok |
| `effective_from < CASE_OPENED.occurred_at` | `isRetroactiveInitialPolicy: true` audit flag + payload'a eklenir. Authorization zorunlu DEĞİL. |

**Neden authorization zorunlu değil:** HR-33 "earliest legally relevant event'ten önce" için retroactive override gerektiriyor. Ama burada case'in kendi `caseDate`'i, case'in kendisinin created_at'inden önce. Bu case'in tarihsel gerçeği — avukat retroactive karar vermemiş, sadece gerçeği kaydediyor.

**Payload'a eklenen flag:**

```typescript
// policyPayload içine
isRetroactiveInitialPolicy?: boolean; // true if caseDate < case.createdAt
retroactiveDistanceDays?: number;     // kaç gün geriye
```

**Test:** "caseDate = 30 gün önce → isRetroactiveInitialPolicy: true, authorization yok."

---

## 5b. Sertleştirme 3: startEvent + startDate İkisi Birden

Event payload'da ikisi de zorunlu. `startEvent` semantik kaynak, `startDate` concrete değer.

```typescript
startEvent: StartDateEvent;  // CASE_OPENED | DRAW_DATE | DUE_DATE | CUSTOM_DATE | ...
startDate: string;           // ISO8601 resolved date
```

**Sprint 2C default:**
```typescript
startEvent: 'CASE_OPENED'   // semantic: takip tarihinden faiz
startDate: caseDate          // concrete: dto.startDate || new Date()
```

**Neden ikisi birden:** Replay sırasında `startEvent` "neden bu tarih?" sorusunu cevaplar. `startDate` "hangi tarih?" sorusunu cevaplar. Sadece `startDate` yeterli değil — tarih değişebilir ama semantic context (keşide mi, vade mi, takip mi) değişmez.

---

## 5c. Sertleştirme 4: Drift Kontrolü (Paralel Yaşam Koruması)

**Kural:** Event payload'daki `interestType` ile `case` row'undaki `interestType` aynı transaction içinde tutarlı olmalı.

**Implementation'da assert:**

```typescript
// case.create tx içinde, step 8.6 tamamlandıktan sonra
if (newCase.interestType !== policyPayload.interestType) {
  throw new Error(
    `DRIFT_VIOLATION: case.interestType="${newCase.interestType}" ` +
    `!= event.payload.interestType="${policyPayload.interestType}". ` +
    'These must match during parallel-life period.'
  );
}
```

**Test:** "case.interestType === event.payload.interestType — drift yok."

Bu strangler fig döneminde (eski field + yeni event paralel) kritik. İleride event canonical olduğunda bu assert kaldırılır.

---

## 6. Mevcut `interestType` Field ile İlişki (Strangler Fig)

| Eski | Yeni | Geçiş |
|------|------|-------|
| `case.interestType` (DB column) | `INTEREST_POLICY_ASSIGNED` event payload | Paralel yaşar |
| `case.interestStartDate` (DB column) | Event payload `startDate` | Paralel yaşar |

**Sprint 2C:** Her iki yere de yazılır (eski field + yeni event). Eski field'ı okuyan kod çalışmaya devam eder.

**Sprint 4+ (deferred):** Eski field event'ten derive edilir (projection). Doğrudan write kaldırılır.

---

## 7. Explicitly Deferred

| Deferred Item | Neden | Ne Zaman |
|---------------|-------|----------|
| Explicit reassignment endpoint | Ayrı API, ayrı spec | Sprint 3 |
| Interpretation profile registry | Hardcoded default yeterli | Sprint 3 |
| Allocation policy registry | Hardcoded default yeterli | Sprint 3 |
| `interestType` field → event-derived projection | Strangler fig tamamlanması | Sprint 4+ |
| Contractual rate override (akdi faiz) | Özel payload extension | Sprint 3 |
| Multi-claim per-item policy (farklı alacak kalemlerine farklı faiz) | Complexity, Faz 2+ | Sprint 4+ |

---

## 8. Implementation Sırası (Sprint 2C)

| Adım | İş | Bağımlılık |
|------|-----|-----------|
| 1 | `resolveInitialPolicy()` utility function | interest-strategy.config.ts |
| 2 | `resolveCaseTypeKey(dto)` → CaseType mapping | DTO → strategy key |
| 3 | case.service.create() → INTEREST_POLICY_ASSIGNED append (step 8.6) | 1, 2 |
| 4 | Unit test: resolveInitialPolicy (strategy → payload mapping) | 1 |
| 5 | Integration test: case create → CASE_OPENED + INTEREST_POLICY_ASSIGNED (v1, v2) | 3 |
| 6 | Integration test: payload has no computation results | 3 |
| 7 | Integration test: HR-26 actor validation (SYSTEM actor → reject) | 3 |

---

## 9. Başarı Kriteri

> Bir case oluşturulduğunda, aynı transaction içinde:
> - CASE_OPENED event (v1)
> - INTEREST_POLICY_ASSIGNED event (v2)
> append edilir. Policy event, hesap sonucu değil hesap kuralı taşır.
> Replay sırasında "hangi faiz politikası geçerliydi?" sorusu event stream'den cevaplanabilir.

---

## 10. Anayasal Uyum

| Anayasa | Uyum |
|---------|------|
| **(A)** Legal facts immutable | ✅ Policy event append-only |
| **(B)** Policy karar verir, runtime kayıt altına alır | ✅ Policy = karar, event = kayıt |
| **(C)** Allocation = calculation result | ✅ Payload'da allocation yok |
| **(D)** Events = legal facts, not computations | ✅ Computation contract, not result |
| **(09a)** Replay uses recorded truth | ✅ Policy event replay'de okunur |
| **(09b)** Sealed artifacts persist context | ✅ interpretationProfileId event'te |

---

## DoD

- [x] Karar tablosu (7 soru, 7 cevap)
- [x] Event payload tanımı (computation contract, result yok)
- [x] Source → event mapping (strategy registry → payload)
- [x] Emission point (case.create, step 8.6)
- [x] HR-26 uyumu (human actor required)
- [x] Strangler fig planı (eski field + yeni event paralel)
- [x] Explicitly deferred listesi
- [x] Implementation sırası
- [x] Başarı kriteri
- [x] Anayasal uyum
- [x] **ulas onayı (2026-05-21)**
- [x] Sertleştirme 1: aggregateVersion sırası (v1=CASE_OPENED, v2=INTEREST_POLICY_ASSIGNED)
- [x] Sertleştirme 2: effective_from retroactive flag (authorization zorunlu değil)
- [x] Sertleştirme 3: startEvent + startDate ikisi birden zorunlu
- [x] Sertleştirme 4: case.interestType === event.payload.interestType drift kontrolü

---

**Decision Status:** Accepted  
**Accepted On:** 2026-05-21  
**Sonraki:** Implementation adım 1 (resolveInitialPolicy utility) başlıyor.
