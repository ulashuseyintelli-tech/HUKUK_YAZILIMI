---
status: active
review-trigger: "Sprint sonu — Faz 1 belgeleri tamamlanırken"
---

# Legal Kernel — Frozen Architecture (v2 — Formalize, not Rewrite)

**Tarih:** 2026-05-19  
**Durum:** FROZEN. Bu belge mimari karar referansıdır.  
**Versiyon:** v2 (v1 stale baseline'a dayanıyordu, deep scan sonrası revize)  
**Önceki:** 5 oturumluk mimari tartışmanın damıtılmış final hali.

---

## 0. Anayasal İlke

Mimarinin **beş** anayasal cümlesi var:

> **(A) Legal facts are immutable. Interpretations are rebuildable.**

> **(B) Policy karar verir, runtime kayıt altına alır.**

> **(C) Payment is a legal fact. Allocation is a calculation result. Policy governs interpretation, not event existence.**

> **(D) Events represent legal facts, not internal computations.**

> **(E) Events may be recorded automatically. Legal consequences may not be inferred automatically unless explicitly authorized by policy.**

Her tasarım kararı bu beşine referansla doğrulanır.

### (C)'nin pratik sonuçları
- `PAYMENT_RECEIVED` her durumda kayıt altına alınır (CASE_SUSPENDED, INTEREST_POLICY_ASSIGNED yok, vb. — fark etmez).
- `PAYMENT_ALLOCATED` **event değildir** — TBK 100 allocator'ın çıktısıdır, projection.
- `BALANCE_UPDATED`, `INTEREST_RECALCULATED`, `PROJECTION_REBUILT` event olmaz — internal computation.
- Policy yokluğu event'i engellemez, sadece **finalization** kısıtlanır.

### (D)'nin pratik sonuçları
- Calculator çıktıları event log'una yazılmaz (event spam yasağı).
- "Debug kolay olsun" diye computation event'i eklenmesi yasaktır — bu replay consistency'yi öldürür.
- Ne event'tir, ne değildir kararı `07-event-taxonomy-v1.md`'de canonical olarak belgelenir.

### (E)'nin pratik sonuçları
- Sistem `PAYMENT_RECEIVED` event'ini otomatik kayıt edebilir (banka entegrasyonu, UYAP, vs.).
- Ama hukuki sonuç (closure, reopen, profile override, identity correction, enforcement action) **avukat kararı** gerektirir.
- "Şüphe varsa: human required" — yeni bir karar tipi otomatize edilmez, ADR ile gerekçelenir.
- Detay: `08-causality-rules.md` §3 Human Authority Boundaries.

---

## 1. Önemli Çerçeve: Bu proje sıfırdan kernel yazmıyor

Deep scan (bkz. `04-deep-scan-findings.md`) gösterdi ki sistem **zaten event-sourced bir kernel'e sahip** — sadece yanlış adla, yanlış yerde, yanlış scope'la. Mevcut altyapı:

| Mevcut | Rolü |
|---|---|
| `icrabot/v28-engine/EngineRunnerService` | Async event runtime (rule eval + fact write + outbox + timeline) |
| `icrabot/v28-engine/FactStoreService` | DB-backed write-side fact store (`IcrabotCaseFact` + `IcrabotFactAudit`) |
| `icrabot/v28-engine/UyapEventIngestService` | UYAP event adapter |
| `icrabot/v28-engine/OutboxService` | External action dispatch |
| `icrabot/v28-engine/TimelineService` | Event projection (UI timeline) |
| `policy-engine/CasePolicyEngine` | Sync authorization gate (`canPerformAction` / `getNextActions`) |
| `policy-engine/FactStoreService` (kuzeni) | In-memory cached read-side fact reader |
| `policy-engine/StateMachineService` | İcra type → state transitions |
| `policy-engine/GateCheckerService` | Action matrix + rules + facts → decision |
| `interest-engine/InterestEngineService` | Segmented interest calculator + TBK 100 allocator + version pinning |
| `IcrabotAuditLog` (Prisma) | Hash chain immutable audit log (v38) |
| `evidence-bundle/`, `bundle_seal_event` | Write-once sealed artifact infrastructure |
| `pii-mask.util.ts`, `LoginRateLimitGuard`, `fetchWithTimeout`, `runBatched` | Hardening utilities (zaten kapatılmış) |

**Bu projenin asıl işi:** Bu altyapıyı **formalize** etmek — rename, data-layer unification, domain command bridge, vocabulary cleanup. **Rewrite değil.**

Önceki mimari dili: "build kernel".  
Yeni mimari dili: **"formalize existing kernel"**.

---

## 2. Trinity (Üçlü Katman) — Mevcut Durumun Eşlemesi

Önceki v1'de Trinity "yeni inşa edilecek" diye anlatılıyordu. Gerçekte var, sadece formalize edilmemiş:

```
EVENT LOG (mevcut, formalize edilecek)
   ↓
   IcrabotCaseFact + IcrabotCaseFlag + IcrabotFactAudit
   IcrabotTimelineEntry (event projection)
   IcrabotAuditLog (hash chain)

CALCULATORS (mevcut, pure'lığa hizalanacak)
   ↓
   InterestEngineService (split: computeBalance pure + writeAudit side-effect)
   SegmentBuilderService (zaten pure)
   TBK100AllocatorService (zaten pure)
   ClaimPriorityService (zaten pure)

PROJECTIONS (mevcut)
   ↓
   IcrabotTimelineEntry (timeline)
   InterestAuditLog (calc audit)
   case_balance_view (yeni eklenmeli — şu an case.service inline hesaplıyor)

SEALED ARTIFACTS (mevcut, generic-leşmesi gerek)
   ↓
   evidence_objects (write-once trigger var)
   bundle_seal_events (write-once trigger var)
```

---

## 3. Layer Discipline (Hard Rule)

| Katman | Cevapladığı Soru | Zaman | Yan Etki | Güncel Yer |
|---|---|---|---|---|
| **PolicyGateService** | "Bu işlem yapılabilir mi?" | İşlem öncesi (pre-action, sync) | Sadece decision log | `policy-engine/CasePolicyEngine` (rename edilecek) |
| **EventRuntimeService** | "İşlem oldu, hangi fact/outbox/timeline doğar?" | İşlem sonrası (post-action, async) | Fact write, outbox dispatch, timeline | `icrabot/v28-engine/EngineRunnerService` (rename edilecek) |
| **InterestEngine** | "Bu event/fact setinden parasal sonuç ne?" | Hesap anı | Yok (pure olmalı) | `interest-engine/` (computeBalance/writeAudit ayrılacak) |
| **CaseService** | "Kullanıcı komutunu al, transaction başlat, event yay" | Command time | Tx + DomainEvent emit | `case/case.service.ts` (event emission eklenecek) |

### Yasak Geçişler (CI gate ile)
- PolicyGateService DB write yapamaz (sadece decision log dışında).
- EventRuntimeService legal authorization kararı veremez.
- InterestEngine event emit edemez veya fact write yapamaz.
- CaseService directly outbox yazamaz (EventRuntime üzerinden).

---

## 4. İlk Kernel: Money Truth Kernel — Ne yapmıyoruz, ne yapıyoruz

### Yapmadığımız (önceki v1'in yanlış kısmı)
- ❌ Yeni `case_events` tablosu yazılmaz (zaten `IcrabotCaseFact` + `IcrabotTimelineEntry` var)
- ❌ Yeni event taxonomy sıfırdan tanımlanmaz (mevcut UYAP event'ler envanter olur)
- ❌ Yeni outbox / dispatcher yazılmaz (zaten var)
- ❌ Yeni audit / hash chain yazılmaz (zaten v38 hash chain var)
- ❌ "Workflow engine yazılır" — iki tane var, üçüncü gereksiz

### Yaptığımız (formalize)
1. **Event taxonomy envanteri:** v28-engine'in normalize ettiği UYAP event tipleri (`PAYMENT_RECEIVED`, `OBJECTION_FILED`, `HACIZ_PLACED`, `ASSET_FOUND_*`, `TEBLIGAT_*`, `SALE_*`, `CASE_STATUS`...) **canonical event taxonomy** olarak belge haline getirilir. Eksikler eklenir (örn `CASE_OPENED`, `CLAIM_REGISTERED`, `INTEREST_POLICY_ASSIGNED` — bunlar şu an UYAP'tan gelmiyor).
2. **DomainEventIngest servisi (yeni, küçük):** İç domain command'larından (case create, payment receive) gelen event'leri v28-engine ingestion'una bağlar.
3. **CaseService event emission:** Transaction sonunda `DomainEventIngest.emit(...)` çağırır.
4. **InterestEngine pure split:** `computeBalance()` (pure) + `writeAudit()` (side-effect) ayrımı.
5. **Hardcoded rate fallback temizliği:** `getPreviewRates()` içindeki TODO kapatılır.
6. **PolicyGate write disiplini:** `canPerformAction` decision log dışında write yapmasın.

### Başarı Kriteri
> Aynı event stream verildiğinde sistem her zaman aynı bakiyeyi üretmelidir.

Bu önceki v1'den korundu. Doğru kriter.

---

## 5. INTEREST_POLICY_ASSIGNED — Legal Computation Contract

Bu event mimarinin en kritik tek event'idir. Şu anda v28-engine taxonomy'sinde yok — eklenmesi gerek. Payload:

```typescript
{
  policy_id: 'CAMBIAL_CHECK' | 'GENERAL_ENFORCEMENT' | 'TTK_1530_SUPPLY_DELAY' | ...
  interest_type: 'COMMERCIAL_AVANS_3095_2_2' | 'LEGAL_3095' | 'TTK_1530' | ...
  start_event: 'DRAW_DATE' | 'PRESENTATION_DATE' | 'NOTICE_DATE' | ...
  start_date: ISO8601
  day_count_basis: 360 | 365
  compounding: false
  interpretation_profile_id: 'TBK100_v1' | 'TBK100_v2' | ...
  rate_series_source: 'TCMB_REESKONT_AVANS_TABLE' | ...
  reasoning?: string
}
```

Mevcut `interest-strategy.config.ts` `INTEREST_STRATEGIES` registry'si bu event payload'ının doğrudan ön formu. Strategy registry → event payload mapping yazılmalı.

---

## 6. Multi-Debtor Modeli (Korundu)

**Seçilen:** Tek case + per-debtor allocation. `PAYMENT_RECEIVED.for_debtor_id` opsiyonel.

---

## 7. Currency Modeli (Korundu)

**Seçilen:** TRY-only Faz 1, ama architecture currency-aware. Mevcut `Money` value object zaten currency taşıyor.

---

## 8. Migration Stratejisi (Revize)

Önceki v1: "Parallel strangler + shadow comparison" — yeni kernel canlı, eski sistem dokunulmaz.

**Yeni v2:** Mevcut kernel zaten production'da. **Strangler değil, formalize.** Yani:

1. Mevcut v28-engine + policy-engine + interest-engine + IcrabotCaseFact halen production'da
2. Domain command bridge eklenir → case.service event yaymaya başlar
3. Rename + alias: eski isimler `@deprecated`, yeni isimler kanonik
4. Vocabulary unification: duplicate enum/sınıf temizliği
5. CI gate'ler eklenir
6. 4 hafta sonra deprecated alias'lar silinir

Yeni kod yeni isimleri kullanır, eski kod alias'larla çalışmaya devam eder.

---

## 9. Event Ordering = Legal Ordering

Mevcut `IcrabotEngineRun` tablosu `snapshotHash` tutuyor (event sequencing güvencesi var). Eksik: per-aggregate `aggregate_version`. **Yeni kolon eklenecek:**

```
icrabot_case_facts / icrabot_timeline_entries
  + aggregate_version BIGINT
  + UNIQUE (case_id, aggregate_version)
```

`recorded_at` (insert time) ve event'in `occurred_at`'i (event payload'ında) ayrı tutulur.

---

## 10. asOf Semantiği

Mevcut `interest-engine.service.ts:111` `asOfDate` zaten alıyor. Eksik: `interpretationProfileId`. Calculator imzasına eklenir:

```typescript
computeBalance(
  events: CaseEvent[],
  refData: ReferenceData,
  asOf: ISO8601,
  interpretationProfileId: string  // YENİ, zorunlu
): Balance
```

---

## 11. Manuel Düzeltme UX → Compensating Event (Korundu)

| Avukat aksiyonu | Sistem davranışı |
|---|---|
| Ödeme satırını sil | `PAYMENT_REVERSED`, eski PAYMENT_RECEIVED log'da kalır |
| Geriye dönük ödeme ekle | Yeni `PAYMENT_RECEIVED`, occurred_at = geçmiş tarih, recorded_at = bugün |
| Ödeme tutarını değiştir | `PAYMENT_REVERSED` + yeni `PAYMENT_RECEIVED` (atomik) |

Mevcut `PAYMENT_RECEIVED` event'i v28 taxonomy'sinde var. `PAYMENT_REVERSED` eklenmeli.

UPDATE/DELETE engelleme:
- `IcrabotCaseFact` halen update-able (factstore upsert eder). Bu **append-only değil** — değişti.
- Mimari kararı: `IcrabotCaseFact` mutable kalacak (current state), **gerçek event log `IcrabotTimelineEntry` ve `IcrabotFactAudit`'tedir**. İkisi append-only (DB trigger eklenir).

---

## 12. Runtime Reclassification (Genişletildi)

```
core-runtime/   (legal-grade — kalır, generic-leşir)
  audit-trail/                ← IcrabotAuditLog hash chain
  event-runtime/              ← v28-engine/EngineRunnerService (rename edildi)
  event-ingest/               ← UyapAdapter + DomainEventIngest
  fact-store/                 ← v28-engine/FactStoreService (canonical write)
  evidence-bundle/            ← evidence_objects + bundle_seal_events
  hash-determinism/           ← canonical JSON + SHA-256
  kill-switch/
  outbox/                     ← v28-engine/OutboxService (sealed dispatch)
  
policy-gate/    (legal decision — eski policy-engine, rename edildi)
  PolicyGateService           ← CasePolicyEngine (rename)
  CachedFactReader            ← policy-engine/FactStoreService (rename, write devredildi)
  StateMachineService
  GateCheckerService
  ActionMatrix
  DecisionLogger
  
interest-engine/ (calculator — pure'a hizalandı)
  InterestEngineService
    computeBalance() — pure
    writeAudit() — side effect, separate
  ...

runtime-lab/    (lab — taşındı, bağımsız, silinebilir)
  drift-guard/                ← eski calc-preview/diagnostics
  adaptive-control/           ← sd-2, sd-3, sd-25, sd-26
  shadow-rollout/             ← stage-0, stage-1
  chaos-harness/
  synthetic-load/
  governance-experiments/
```

**Kural değişmedi:**
- Domain → core-runtime'ı kullanır
- Domain → lab'i import etmez
- Lab → core-runtime'ı observe edebilir
- Lab silinse domain çalışmaya devam eder

---

## 13. Hard Rules (CI gate ile zorlanır)

1. Calculator imzasında `asOf` + `interpretationProfileId` zorunlu.
2. Calculator I/O yapamaz (no DB, no fetch, no fs).
3. Calculator event emit edemez ve fact write yapamaz.
4. `IcrabotTimelineEntry` ve `IcrabotFactAudit` tablolarına UPDATE yasak (DB trigger).
5. `IcrabotTimelineEntry` ve `IcrabotFactAudit` tablolarına DELETE yasak (DB trigger).
6. Engine kodu (event runtime + projections) ≤ 2500 LOC (mevcut zaten bu civarda).
7. Bir abstraction'ın 3 somut kullanımı olmadan base class yasak.
8. Yeni event tanımı için spec dokümanı zorunlu (CI gate).
9. Yeni mimari bileşen için "hangi legal failure'ı engelliyor" cevabı zorunlu.
10. Stabilization fix'leri target architecture yönünde olmalı (no temp hacks).
11. Per-aggregate `aggregate_version` monotonic ve gap-free olmalı (DB unique constraint).
12. `Money` value object her yerde currency taşımalı (Faz 1'de validator TRY-only).
13. **Frontend may not infer legal truth.** Yasak: faiz türü inference, mahsup hesaplama, hukuki status determination, süre hesabı, legal branching.
14. Domain enum'lar tek kaynaktan (`@hukuk/domain`) import edilmeli.
15. **PolicyGateService DB write yapamaz** (decision log dışında).
16. **EventRuntimeService legal authorization kararı veremez.**
17. **CaseService direkt outbox yazamaz** (EventRuntime üzerinden).
18. **`@deprecated` alias'lar sunset tarihinden sonra otomatik silinir** (CI gate, vocabulary unification spec imza tarihi + 4 hafta).
19. **Every architectural item must be classified.** `.kiro/specs/legal-kernel/` ve `90-future-work/` altındaki her `.md` dosyası YAML frontmatter ile başlamalı: `status: active|deferred|rejected|experimental|completed|pending` + ilgili meta alanlar (owner, review-trigger, rejection-date, vb.). Hard Rule #18'e benzer kademeli aktivasyon: önce lint warning, vocabulary unification + 2 hafta sonra CI fail. Pending kategorisi için **one-cycle timeout** zorunlu (default 14 gün, sonra auto-deferred).

---

## 14. Yasak Alanlar (Faz 1+ boyunca, Korundu)

- Generic workflow DSL
- Distributed event bus (Kafka, Rabbit, NATS, vs.)
- CQRS framework (Axon, EventStoreDB, vs.)
- Multi-region deployment
- Generic policy compiler
- Temporal / Camunda entegrasyonu
- Microservice split
- Generic orchestration platform
- Sıfırdan kernel rewrite

---

## 15. Faz 1 Çıktıları (Revize)

Faz 1 tamamlandığında elimizde olacaklar:

1. ~~`case_events` + `reference_data_events` tabloları~~ → mevcut tablolar canonical kabul edildi (`IcrabotCaseFact`, `IcrabotTimelineEntry`, `IcrabotFactAudit`, `IcrabotEngineRun`)
2. ~~`case_snapshots` + hash chain~~ → mevcut `IcrabotAuditLog` hash chain v38 (snapshot stratejisi Faz 2)
3. ~~`packages/@hukuk/calc`: 3 calculator~~ → mevcut `interest-engine` segmentor + allocator + balance hazır, sadece `computeBalance/writeAudit` split gerekiyor
4. **YENİ:** `core-runtime/event-ingest/DomainEventIngestService` (küçük servis, case.service'e event emission disiplini)
5. **YENİ:** Renamed services + deprecated alias'lar
6. **YENİ:** Vocabulary unification (frontend + backend)
7. **YENİ:** `INTEREST_POLICY_ASSIGNED` event tanımı + emit (case.create sırasında)
8. CI gate'ler (18 hard rule için)
9. `aggregate_version` kolonu eklenmiş + DB UNIQUE constraint
10. Tek başarı testi: "aynı event stream → aynı bakiye" property test
11. Frontend `interest-type-resolver.ts` ve `form-validator.ts` backend'e taşınmış (legal truth migration)

**Süre tahmini:** 6-8 hafta (önceki "6 ay rewrite" yerine).

---

## 16. Vocabulary Freeze Sırası (Revize)

| # | Belge | Süre | Notlar |
|---|---|---|---|
| 0 | `03-vocabulary-unification.md` revize | 1 gün | Backend çakışmaları eklenir (FactStoreService dual, CaseType triple, vs.) |
| 1 | `06-aggregate-boundaries.md` | 2 gün | Case aggregate root, debtor sub-entity, **mevcut yapıya dayanır** |
| 2 | `07-event-taxonomy-v1.md` | 3 gün | **Mevcut v28 UYAP event'leri envanteri** + eksiklerin eklenmesi (CASE_OPENED, CLAIM_REGISTERED, INTEREST_POLICY_ASSIGNED, PAYMENT_REVERSED) |
| 3 | `08-causality-rules.md` | 2 gün | Yasak transition'lar, kullanıcı kararı gerektirenler |
| 4 | `09-temporal-semantics.md` | 1 gün | Day count basis, asOf semantiği |
| 5 | `10-implicit-rules.md` | 1 gün | Guard clause'lar (closed case'e payment yok, vb.) |
| 6 | `11-domain-event-bridge.md` | 2 gün | case.service.create/update/delete + collection.create event emission disiplini |

Toplam: ~12 iş günü.

---

## 17. Stabilization Sprint (Tarihsel)

Önceki v1'de `01-stabilization-pre-kernel.md` aktif iş olarak işaretliydi. Deep scan gösterdi ki stabilization 5/5 madde **3 ay önce kapatılmış**. Belge `01-stabilization-status.md` olarak revize edildi — historical verification record.

---

## 18. Onay

**v2 onay:** 2026-05-19 (ulas / dev) — deep scan + engine consolidation kararları sonrası.

**Değişiklik prosedürü:** Yeni spec açılır, bu belge `STATUS: SUPERSEDED` ile işaretlenir.

---

## 19. Önceki Versiyondan Değişen Şeyler (Audit Trail)

| Bölüm | v1 (yanlış) | v2 (doğru) |
|---|---|---|
| Ana cümle | "build kernel from scratch" | "formalize existing kernel" |
| Workflow engine | "yok" | İki tane var (PolicyGate + EventRuntime), katmanlı |
| Event-sourced infra | "yazılacak" | Var (v28-engine), genişletilecek |
| Faiz motoru | "bug, hızlı patch lazım" | Olgun (pure split + hardcoded fallback temizliği yeter) |
| Stabilization sprint | "3-4 günlük iş" | Kapatılmış (3 ay önce), historical record |
| Migration | "parallel strangler shadow" | Formalize + rename + deprecation |
| Faz 1 süresi | 6 ay | 6-8 hafta |
| 9 case event listesi | "yeni tanımlanacak" | Mevcut UYAP taxonomy envanter olacak + eksikler eklenecek |
