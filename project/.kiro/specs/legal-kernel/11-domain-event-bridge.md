---
status: active
review-trigger: "Faz 1 imzasına kadar — sprint sonu"
---

# Domain Event Bridge

**Tarih:** 2026-05-19  
**Durum:** Active — vocabulary freeze son belgesi (7/7)  
**Bağlam:** Faz 1'in tüm formal modeli (vocabulary, aggregate, event, causality, temporal, implicit) imzalandı. Geriye **bu modelin koda nasıl bağlandığı** kaldı — özellikle **transaction discipline**.

---

## 0. Anayasal Cümle

Bu belgenin **iki** anayasal cümlesi var:

> **(1) Domain event bridge is transaction discipline, not a new event bus.**

> **(2) Outbox append must occur within the same transaction as domain mutation and event append.**

İkincisi kritik: event append ile outbox append **farklı transaction'larda** olursa:
- Event yazıldı ama outbox yazılmadı → **ghost dispatch**: hukuki gerçek var ama dış dünyaya bildirim hiç gitmeyecek
- Outbox yazıldı ama event yazılmadı → **missing event**: bildirim gidiyor ama event log'da iz yok
- İkisi farklı sırada commit edilirse → **replay divergence**: replay sırası tutarsız

Üçü de hukuki kanıt zincirini koparır. **Aynı transaction zorunluluğu** atomicity'i garanti eder — ya hepsi ya hiçbiri.

### Bu Belgenin NE OLMADIĞI

11 **event bus mimarisi belgesi değildir**. İçermez:

- ❌ Kafka / RabbitMQ / NATS / Redis Streams seçimi (rejected — `90-future-work/rejected/kafka-event-bus.md`)
- ❌ Distributed message broker konfigürasyonu
- ❌ Pub/sub pattern abstractions
- ❌ Generic event sourcing framework wiring
- ❌ Yeni "event bus service" yazımı

11 sadece **mevcut domain command'larının (`case.service.create()` vb.) event emission disiplini** belgesidir. Mevcut altyapı (`v28-engine/EventRuntimeService` = `EngineRunnerService`, `OutboxService`, `DomainEventIngestService` yeni) zaten event'i taşıyor — bu belge bunların **timing kurallarını** sertleştirir.

---

## 1. Emission Timing — Anayasal Tablo

> **The most critical question: When exactly is the event emitted?**

| Timing | Decision | Niye |
|---|---|---|
| **before DB commit** | ❌ FORBIDDEN | Event henüz "olmamış" bir gerçeği temsil eder. Transaction abort olabilir, event "sahte" hukuki gerçek olur. |
| **inside same transaction** | ✅ ALLOWED for event APPEND | Event log tablosuna (`case_events`) write yapılır, aynı transaction'da. Atomicity garantili (ya hepsi ya hiçbiri). Bu **Faz 1 default** pattern. |
| **after commit without outbox** | ❌ FORBIDDEN | Commit başarılı, ama event emission process crash → event kaybolur. Hukuki gerçek "olmuş" ama kayıt yok = audit zinciri kopar. |
| **outbox-backed after commit** | ✅ PREFERRED for DISPATCH | Event commit ile aynı tx'te outbox tablosuna yazılır, sonra worker dispatch eder. At-least-once delivery, idempotent. **External dispatch (UYAP, banka, SMS) için zorunlu.** |

### Üç Aşama Pattern (Faz 1 default)

```
1. Domain command (case.service.create) başlar
2. Transaction begin
3. Domain mutations: tx.case.create(...), tx.client.create(...), ...
4. Event APPEND: tx.case_event.create({event_type, payload, ...})    ← inside tx
5. Outbox APPEND: tx.outbox_action.create({...})                      ← if external dispatch needed
6. Transaction commit
7. (async) Outbox worker picks up + dispatches                        ← outbox-backed
8. (async) EventRuntime processes event log → projection updates      ← async, idempotent
```

**Atomicity garantisi:** 3-5 hepsi ya commit, ya rollback. Yarı durum yok.

---

## 2. Inside-Transaction Event Append (Faz 1 default)

### Pattern

```typescript
async create(tenantId: string, dto: CreateCaseDto) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Validate (PolicyGate.canPerformAction'ı tx-DIŞINDA çağır — read-only)
    
    // 2. Domain mutations
    const newCase = await tx.case.create({...});
    const client = await tx.client.upsert({...});
    
    // 3. Event APPEND (aynı tx)
    await this.domainEventIngest.appendInTransaction(tx, {
      event_type: 'CASE_OPENED',
      tenant_id: tenantId,
      aggregate_type: 'Case',
      aggregate_id: newCase.id,
      occurred_at: new Date(),
      occurred_at_confidence: 'USER_DECLARED',
      actor: { type: 'user', user_id: ctx.userId },
      source: 'user',
      payload: {...}
    });
    
    // 4. Outbox APPEND if external action needed (yine aynı tx)
    // (Faz 1'de external action genellikle yok — Faz 2'de tebligat ile gelir)
    
    return newCase;
  });
}
```

### Kurallar

| Kural | Niye |
|---|---|
| Event append `prisma.$transaction` içinde | Atomicity (HR-39) |
| Event ingestion service `appendInTransaction(tx, event)` API'si vermeli | Tx instance'ı paylaşmalı |
| Event append'den sonra başka bir DB write **yapılabilir** ama event'i etkileyemez | Event payload immutable (HR-1 ile uyumlu) |
| `aggregate_version` DB-side increment (sequence veya advisory lock) | Gap-free monotonic (HR-11 ile uyumlu) |
| `recorded_at` DB tarafından `now()` | HR-29 ile uyumlu |
| `event_id` UUID uygulama tarafından üretilir | Idempotency için client-known ID gerek |

### YASAK

- Event'i transaction commit **sonrası** append etmek (mesela `try { commit; await emit(event) }` → event kaybolabilir)
- Birden fazla aggregate'i tek transaction'da update edip tek event yazmak — **istisna** `case.service.create()`'in pragmatic kararı (Case + Debtor + Client aynı tx, ama her aggregate için ayrı event'ler)
- Event append'i lazy yapmak ("sonra emit ederim, şimdi sıkışığım")

### 2.1 Atomicity Guarantee (Anayasal)

> **Domain mutation succeeds only if corresponding event append succeeds.**

Bu **event-sourced formalization'ın en kritik transactional garantisi.** Aksi halde:

- Row update başarılı ama event append başarısız → **ghost mutation**: state değişti ama event log'da iz yok, replay uyumsuz
- Event append başarılı ama row update başarısız → **phantom event**: olmuş gibi görünen ama gerçekleşmemiş hukuki gerçek

### Pratik Sonuçlar

| Senaryo | Davranış |
|---|---|
| `tx.case.create()` succeeds, `domainEventIngest.appendInTransaction()` fails | **Tüm tx rollback.** Case row yazılmaz, event yazılmaz. Domain command exception fırlatır. |
| Event append constraint violation (örn duplicate `event_id`, `aggregate_version` çakışması) | **Tüm tx rollback.** Row update'leri de geri alınır. |
| Outbox append fails (örn idempotency_key duplicate başka tx'ten) | **Tüm tx rollback.** Domain mutation + event append da geri alınır. |
| Tx commit fails (DB connection drop, deadlock) | Event yazılmamış, outbox yazılmamış, domain mutation yapılmamış. Sıfırdan başlanır. |

### Implementation Pattern (zorunlu)

```typescript
// ✅ CORRECT — atomic
await this.prisma.$transaction(async (tx) => {
  const newCase = await tx.case.create({...});
  
  await this.domainEventIngest.appendInTransaction(tx, {
    event_type: 'CASE_OPENED',
    ...
  });
  // Eğer event append fail ederse → tx otomatik rollback → tx.case.create da geri alınır
});

// ❌ WRONG — yarı durum yaratır
const newCase = await this.prisma.case.create({...});  // Tx-DIŞINDA yazılmış
await this.domainEventIngest.append({                   // Bu fail ederse case row yetim kalır
  event_type: 'CASE_OPENED',
  ...
});
```

### CI Gate

CI lint rule:
- Domain mutation (`tx.case.*`, `tx.debtor.*`, `tx.collection.*`) içeren transaction'da **`appendInTransaction(tx, ...)` çağrısı yoksa** warning
- Domain mutation transaction-DIŞINDA + ardından event append **forbidden** (AST tarama)

### Kural

> **Yarı durum yoktur.** Ya tüm tx commit (mutation + event + outbox), ya tüm tx rollback. Sistem hiçbir zaman "row var ama event yok" veya "event var ama row yok" durumda olamaz.

---

## 3. Outbox-Backed Dispatch (External Actions)

### Pattern

External action'lar (UYAP submit, banka query, SMS send, KEP send, PDF generate-and-store) **Faz 1'de henüz yok ama Faz 2'de geliyor**. Hazırlık şimdi yapılıyor:

```
Transaction:
  1. Domain mutation
  2. Event append (inside tx)
  3. Outbox row append (inside tx):
       outbox_id, action_type, payload, status='PENDING', idempotency_key
  4. Commit

Async (separate process):
  5. Outbox worker SELECT FOR UPDATE SKIP LOCKED → claim row
  6. Dispatch to external system (UYAP API, vs.)
  7. On success: SET status='SENT', sealed_at=now()
  8. On failure: SET status='FAILED', retry_count++
  9. Worker idempotent — aynı idempotency_key ile yeniden dispatch yapmaz
```

### Kurallar

| Kural | Niye |
|---|---|
| Outbox row event ile **aynı transaction'da** yazılır | Atomicity (event + outbox commit'i bir arada) — Anayasal Cümle (2) |
| `idempotency_key` zorunlu | At-least-once delivery, retry'da duplicate engellenir |
| Worker `SELECT FOR UPDATE SKIP LOCKED` kullanır | Multi-instance safety |
| Sealed (status=SENT) outbox row'ları **immutable** | Write-once — DB trigger ile zorlanır |
| External call timeout zorunlu | `fetchWithTimeout` (zaten var) |
| Retry policy: action type'a göre sınıflandırılır | Bkz §3.5 Retry Semantics |

### 3.4 Idempotency Scope Matrix

> **`idempotency_key` global değildir. Her action type'ın kendi scope'u vardır.**

Tek bir global "idempotency_key" alanı yetmiyor — farklı eylemlerin farklı doğal "tekillik anahtarı" var:

| Action Type | Idempotency Scope | Niye |
|---|---|---|
| `PAYMENT_RECEIVED` (external/bank) | `external_bank_reference` (banka transaction ID, IBAN + valör + amount) | Banka'nın kendi unique referansı; aynı havale iki kez kayıt edilmemeli |
| `PAYMENT_RECEIVED` (external/uyap) | `uyap_event_id` (UYAP'ın kendi event_id'si) | UYAP zaten unique event_id veriyor |
| `SMS dispatch` | Provider message key (NetGSM message_id, İletimerkezi key) | SMS provider kendi tracking'i için key veriyor |
| `Email dispatch` | Provider message_id (SendGrid message_id) | Aynı şekilde |
| `KEP dispatch` | KEP service tracking key | KEP zorunlu unique tracking |
| `UYAP submit` | `case_id + payload_hash` | UYAP'a aynı case için aynı payload iki kez gönderilmesin |
| `PTT tebligat` | `ptt_barcode` veya `tracking_reference` | PTT barkod sistemine bağlı |
| `Document generation` | `case_id + document_type + version_hash` | Aynı doküman aynı versiyonla iki kez üretilmesin |
| Internal projection rebuild | `case_id + projection_type + up_to_version` | Aynı projection aynı version'a kadar iki kez rebuild edilmesin |

### Kurallar

| Kural | Niye |
|---|---|
| Her action type için scope **canonical olarak belgelenmeli** | "Tek global idempotency" yanlış — domain'e göre değişir |
| Scope tanımı action handler'da değil, **bu spec'te** kayıtlı | Vocabulary disiplini — bir yerden okunur |
| Aynı scope ile ikinci request gelirse: action handler **silently skip** + audit log entry | At-least-once delivery semantiği |
| Scope değişimi (yeni action type eklenmesi) ADR gerektirir | Implicit rule disiplini gibi (HR-22 ile uyumlu) |

### CI Gate

`outbox.createAction()` veya `domainEventIngest.ingestExternal()` çağrısında `idempotency_key` parametresi zorunlu — eksikse build fail.

### 3.5 Retry Semantics Classification

> **Tüm hatalar retry-safe değildir.** Failure mode'a göre davranış sınıflandırılır.

| Failure Mode | Retry? | Davranış | Örnek |
|---|---|---|---|
| **Network timeout** | ✅ Yes (exponential backoff, max 5) | Worker geri alır, yeniden dispatch | TCMB EVDS slow response, UYAP API timeout |
| **Provider rate limit** (429) | ✅ Yes (Retry-After header'a saygı) | Worker bekler, sonra retry | NetGSM/SendGrid rate limit |
| **Provider unavailable** (5xx) | ✅ Yes (exponential backoff) | Worker retry, monitor alarm | UYAP gateway down |
| **Connection refused** | ✅ Yes (kısa backoff) | Worker retry | Geçici network issue |
| **Duplicate dispatch** (idempotency_key match) | ❌ No | Silent skip + audit log | Aynı bank reference iki kez gelir |
| **Invalid payload** (4xx, 422) | ❌ No | Quarantine + human review | Schema mismatch, eksik field |
| **Authentication failure** (401, 403) | ❌ No | Halt worker + alarm | API key süresi dolmuş, yetki sorunu |
| **Causality violation** | ❌ Halt | **Replay durdurulur, manuel inceleme** | Event log integrity violation |
| **Data corruption** (hash mismatch) | ❌ Halt | **Replay durdurulur, forensic inceleme** | IR-005 senaryosu |
| **Resource not found** (404) | ⚠️ Conditional | Action type'a göre — bazıları skip, bazıları retry-then-quarantine | UYAP case not found vs SMS recipient unreachable |
| **Business logic conflict** (örn closed-case payment) | ❌ No | PolicyGate zaten reddetmeli — eğer outbox'a ulaştıysa, queue'ya alınır + audit alarm | Şüphe halinde human review |

### Disiplin

- **Retry sınırı:** Max 5 retry, exponential backoff (1s, 2s, 4s, 8s, 16s), sonra `status='FAILED'`
- **Halt durumları (causality, hash, integrity):** Worker durur, manuel müdahale, alarm
- **Quarantine durumları (invalid, conflict):** Operational queue'ya alınır, avukata bildirim, otomatik retry yok
- **Skip durumları (duplicate):** Silent skip + audit log, alarm yok

### CI Gate

Outbox worker implementation'ı retry policy'sini bu sınıflandırmaya **uymak zorunda**. Yeni failure mode eklenmek istenirse ADR.

### Kural

> **Worker'lar bu sınıflandırma haricinde retry kararı veremez.** "Şüphe halinde retry" yasak — şüphe halinde quarantine.

### Carrier Write-Once Disiplin

`bundle_seal_event` write-once trigger zaten var (`prisma/migrations/20260202110000_phase9c_task2_evidence_bundles/migration.sql`). Aynı disiplin outbox sealed row'larına da uygulanır:

```sql
CREATE TRIGGER outbox_action_sealed_immutable
BEFORE UPDATE ON icrabot_outbox_actions
FOR EACH ROW
WHEN (OLD.sealed_at IS NOT NULL)
EXECUTE FUNCTION raise_immutability_violation();
```

(Migration spec ayrı belge — bu burada karar olarak yazılı, implementation Faz 1 sonu.)

---

## 4. Event Ingestion Pipeline (Mevcut Altyapı)

```
┌─────────────────────────────────────────────────────────────────┐
│ DOMAIN COMMAND (case.service / collection.service / vb.)        │
│   - Validate                                                     │
│   - PolicyGate.canPerformAction (pre-action, sync, no DB write) │
│   - Begin transaction                                            │
│   - Domain mutations                                             │
│   - Event APPEND (inside tx, via DomainEventIngestService)      │
│   - Outbox APPEND (if external action)                          │
│   - Commit                                                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (after commit)
┌─────────────────────────────────────────────────────────────────┐
│ ASYNC PIPELINE (eventually consistent)                          │
│                                                                 │
│   [a] EventRuntimeService (eski EngineRunnerService)            │
│       - Reads new case_events                                   │
│       - Runs YAML rules (when/then)                             │
│       - Updates fact store (IcrabotCaseFact)                    │
│       - Writes timeline projection (IcrabotTimelineEntry)       │
│                                                                 │
│   [b] PolicyGate.onActionExecuted (post-action)                 │
│       - Updates decision log (CpeDecisionLog)                   │
│       - Triggers next-action recommendations                    │
│                                                                 │
│   [c] Projection updater                                        │
│       - case_balance_view rebuild (asOf bazlı)                  │
│       - payment_allocation_log update                           │
│       - case_timeline projection                                │
│                                                                 │
│   [d] Outbox worker                                             │
│       - SELECT FOR UPDATE SKIP LOCKED                           │
│       - Dispatch external action                                │
│       - Seal on success (write-once)                            │
└─────────────────────────────────────────────────────────────────┘
```

**Önemli:** Yukarıdaki [a], [b], [c], [d] hepsi **async, idempotent, retry-safe**. Domain command bunlardan etkilenmez — commit'ten sonra "fire and forget" mantığı.

---

## 5. UYAP / Bank / External Adapter Pattern

External event ingestion (UYAP'tan event geldiğinde) **iç domain'in tersi**:

```
External event arrives (UYAP webhook / scheduled poll)
   ↓
UyapAdapter.normalize(externalEvent) → DomainEvent
   ↓
DomainEventIngestService.ingestExternal(event)
   ↓
Transaction:
  1. Validate (idempotency check via idempotency_key)
  2. Append to case_events (source='external', actor.external_system='uyap')
  3. Optionally: outbox row for follow-up internal action
  4. Commit
   ↓
Async pipeline (same as above)
```

### External Event'ler için Ek Kurallar

- `external_reference` zorunlu (UYAP event_id, banka transaction_id)
- `idempotency_key = sha256(external_system + external_reference)` (HR-39'a ek)
- Aynı `idempotency_key` ile ikinci kez gelirse: ya sessizce skip, ya quarantine (IR-003)
- `occurred_at_confidence` external sistemden geliyorsa default `EXTERNAL_SIGNED` (UYAP imzalı timestamp ise)

---

## 6. PolicyGate ile Etkileşim

`canPerformAction(action, ctx)` çağrısı domain command'ın **başlangıcında** (transaction-DIŞINDA) yapılır:

| Aşama | Yer | Niye |
|---|---|---|
| `PolicyGate.canPerformAction(action)` | Transaction-DIŞINDA, command başlangıcında | DB write yok, sadece read + decision log. Tx açmak gereksiz. |
| Domain mutation + event append | **Transaction İÇİNDE** | Atomicity gerek |
| `PolicyGate.onActionExecuted(action, result)` | Transaction-SONRASI (after commit) | Decision log'a sonuç yazılır, async eventual consistency |

### Kural

> **PolicyGate domain command'ın transaction'ına dahil edilmez.**

Niye:
- PolicyGate read + decision log (kendi tablosu) — domain transaction'ına bağlı değil
- Aynı tx'e dahil etmek lock contention yaratır
- PolicyGate'in DB write'ı (decision log) bağımsız failure mode'da olabilir

Ama: `canPerformAction` `DENY` dönerse domain command **hiç başlamaz** — bu yüzden tx-öncesi çağrı doğru yer.

---

## 7. Failure Modes ve Recovery

| Senaryo | Davranış |
|---|---|
| Transaction abort (DB constraint violation) | Rollback. Event yazılmamış, outbox yazılmamış. Domain command exception fırlatır. Avukat retry edebilir. |
| Transaction commit + EventRuntime async crash | Event kayıt edilmiş (transaction commit). EventRuntime restart'ta kaldığı yerden devam eder (event_log_cutoff). Projection eventually rebuild olur. |
| Transaction commit + Outbox worker crash | Outbox row kayıt edilmiş, status='PENDING'. Worker restart'ta SELECT FOR UPDATE SKIP LOCKED ile alır. |
| Outbox dispatch external API fail | Worker retry (max 5, exponential backoff). Tüm retry fail → status='FAILED', avukata bildirim. |
| Outbox dispatch success ama seal yazılmadı (worker crash arasında) | Sıradaki worker idempotency_key ile skip eder (external system zaten kayıt almış). Sonraki check sealed flag'i set eder. |
| External event aynı idempotency_key ile ikinci kez gelir | Sessizce skip + audit log entry. (IR-003 quarantine senaryosu farklı — mismatch durumu için) |

### Disiplin

> **Domain commit edildi mi → event "olmuş" demektir.** Async pipeline'da gecikme olabilir ama event log'a kaydedilmiştir. Replay her zaman mümkün.

> **Domain commit edilmedi mi → hiçbir şey olmamıştır.** Event log'da iz yok, outbox'ta iz yok. Avukat "kayıt edemedim" görür, retry eder.

Yarı durum YOKTUR.

---

## 8. Mevcut case.service Migration Path

`case.service.ts` (~2000 satır) ve diğer command service'leri (`collection.service`, `payment-instruction.service`, vb.) **şu an event emit etmiyor** (`04-deep-scan-findings.md` §D).

### Faz 1 Migration (gradual)

```
Adım 1: DomainEventIngestService yazılır (yeni servis, küçük)
        - appendInTransaction(tx, event)
        - ingestExternal(event)  // UYAP adapter'lar için

Adım 2: case.service.create() düzeltme:
        - Mevcut tx içine event append eklenir
        - CASE_OPENED, INSTRUMENT_REGISTERED (varsa), CLAIM_REGISTERED (varsa),
          INTEREST_POLICY_ASSIGNED (varsa), DEBTOR_REGISTERED (yeni debtor varsa)
        - 5-10 satırlık değişiklik per command
        
Adım 3: collection.service.create() düzeltme:
        - PAYMENT_RECEIVED event append
        - (yorum satırındaki interestEngine.recalculateForCase artık event consumer)

Adım 4: case.service.update() / delete() — daha geniş kapsam, dikkatli
        
Adım 5: Diğer command'lar (payment-instruction, expense-request, vb.) — ihtiyaca göre
```

**Strangler fig:** Her command kendi başına event emission'a geçirilir. Tüm sistem aynı anda değiştirilmez.

### Backward Compatibility

Domain command'ı event emit etmeye geçirilirken **mevcut davranış değişmez**:
- Aynı tablo writes (case, debtor, client) korunur
- Aynı return value
- Sadece event log'a ek kayıt
- Frontend farkı görmez

İleride (Faz 2) projection'lar primary read source olunca eski tablolar ya kaldırılır ya read-only olur.

---

## 9. EventRuntimeService Bridge

`EventRuntimeService` (eski `EngineRunnerService`) zaten **case_events'ten okuyup** YAML rules çalıştırıyor + fact store + timeline yazıyor. Faz 1 migration:

| Şu an | Faz 1 sonu |
|---|---|
| `UyapEventIngestService.ingestEvent()` event yaratır + EventRuntime tetiklenir | `DomainEventIngestService.appendInTransaction()` event yaratır + EventRuntime tetiklenir (aynı pipeline) |
| Sadece UYAP event'leri | UYAP + iç domain event'leri (Case, Debtor lifecycle) |
| Rule library: UYAP-specific | Rule library: domain event'leri için kurallar (örn `PAYMENT_RECEIVED → InterestEngine.recalculate`) |

EventRuntime mantığı **değişmez**, sadece **input event scope'u genişler**.

---

## 10. Bu Belgenin Kapsamı Dışı

- Event bus mimarisi (Kafka vb.) — rejected
- Distributed message broker — rejected
- Pub/sub framework — out of scope
- Replay daemon detaylı tasarımı — Faz 2
- Snapshot strategy implementation — Faz 2
- Multi-region replication — rejected
- Saga pattern / process manager — Faz 2 (workflow orchestration)
- Generic CQRS framework — rejected (`90-future-work/rejected/temporal-camunda.md`)

---

## 11. Hard Rules (Bridge Disiplini)

(00-architecture.md Hard Rules'a eklenir)

**HR-39 (yeni):** Event APPEND domain mutation transaction'ı ile **aynı tx içinde** yazılmalı. Before-commit veya after-commit-without-outbox emission yasak. CI gate `appendInTransaction(tx, ...)` pattern'ini zorlar.

**HR-40 (yeni):** External dispatch (UYAP, bank, SMS, KEP) **outbox-backed olmalı**. Doğrudan API call from domain command yasak. Outbox row event ile aynı tx'te yazılır.

**HR-41 (yeni):** Outbox sealed row'ları (status=SENT, sealed_at IS NOT NULL) immutable — UPDATE/DELETE DB trigger ile yasak.

**HR-42 (yeni):** External event ingestion `idempotency_key` ile dedupe edilmeli. **Idempotency scope action type'a göre canonical olarak belgelenmeli** (Section 3.4 matrix). Aynı scope ile ikinci request silently skip + audit log entry.

**HR-43 (yeni):** PolicyGate `canPerformAction()` çağrısı domain command transaction'ı **dışında** yapılmalı. PolicyGate decision log kendi tx'inde yazılır.

**HR-44 (yeni):** **Outbox append, domain mutation ve event append AYNI TRANSACTION içinde olmak zorunda.** Event log'a yazılmış ama outbox'a yazılmamış (veya tersi) durum kabul edilmez. Atomicity guarantee anayasal.

**HR-45 (yeni):** **Domain mutation succeeds only if corresponding event append succeeds.** Yarı durum yasak — row update başarılı + event append başarısız = tüm tx rollback. CI lint rule domain mutation içeren tx'te `appendInTransaction(tx, ...)` çağrısının varlığını kontrol eder.

**HR-46 (yeni):** Outbox worker retry policy Section 3.5 sınıflandırmasına uymak zorunda. Retry-safe / quarantine / halt failure mode'ları açık ayrılır. "Şüphe halinde retry" yasak — şüphe halinde quarantine. Yeni failure mode için ADR.

---

## 12. DoD

- [x] **İki anayasal cümle:** "Bridge is transaction discipline" + "Outbox append same-tx as domain mutation and event append"
- [x] Emission timing tablosu (4 kategori: before commit / inside tx / after without outbox / outbox-backed)
- [x] Inside-transaction event append pattern (Faz 1 default)
- [x] **Atomicity guarantee** — "Domain mutation succeeds only if event append succeeds" anayasal seviye
- [x] Outbox-backed dispatch pattern (external actions için, Faz 2 hazırlığı)
- [x] **Idempotency Scope Matrix** — 9 action type × scope tanımı
- [x] **Retry Semantics Classification** — 11 failure mode × davranış (retry / skip / quarantine / halt)
- [x] Event ingestion pipeline diyagramı (sync + async ayrımı)
- [x] UYAP / external adapter pattern
- [x] PolicyGate etkileşim disiplini (tx dışı)
- [x] Failure modes ve recovery senaryoları
- [x] case.service migration path (strangler fig, gradual)
- [x] EventRuntime bridge (mevcut altyapı genişlemesi)
- [x] **8 yeni Hard Rule (HR-39..46)** — 4 yeni eklendi (HR-44..46)
- [x] "Out of scope" listesi (Kafka, broker, CQRS framework — kasıtlı reddedildi)
- [x] **ulas onayı (2026-05-19)**

**Decision Status:** Accepted  
**Accepted On:** 2026-05-19  
**Supersedes:** none

---

## 13. Faz 1 Vocabulary Freeze TAMAMLANDI

11'in imzasıyla birlikte **Faz 1 vocabulary freeze tamam**. 7 belge:

| # | Belge | Status |
|---|---|---|
| 03 | Vocabulary Unification | accepted |
| 06 | Aggregate Boundaries | accepted |
| 07 | Event Taxonomy v1 | accepted |
| 08 | Causality Rules | accepted |
| 09 | Temporal Semantics | accepted |
| 10 | Implicit Rules | accepted |
| 11 | Domain Event Bridge | accepted |

İmza sonrası → **Implementation Readiness Pass** (yeni belge: `12-implementation-readiness.md`).

### Sıradaki Adım: Implementation Readiness Pass

> **Kod migration'a doğrudan atlamadan önce** ayrı bir kısa belge yazılır.

Niye gerek: 46 hard rule var, ama her birinin **enforce mekanizması henüz haritalanmadı**. Belirsiz kalırsa rule'lar "iyi niyet listesi" olur.

12'nin scope'u:

| Mapping | Açıklama |
|---|---|
| Hard Rule ↔ Enforcement Mechanism | Hangi rule lint, hangi runtime check, hangi DB constraint, hangi human review |
| Spec ↔ Mevcut Kod Gap Analizi | Hangi rule zaten enforce ediliyor, hangisi yeni implementation gerekiyor |
| Implementation Sequencing | Hangi enforce mekanizması önce, hangisi sonra |
| Owner Assignment | Her enforce mekanizması için sorumlu (developer, dev-ops, lint config) |

12'den sonra **gerçek implementation specs** başlar.

### Implementation Specs Listesi (12 sonrası)

| # | Spec | Süre |
|---|---|---|
| 13 | `DomainEventIngestService` skeleton | 2-3 gün |
| 14 | `packages/types` → `packages/domain` rename | 1 gün |
| 15 | CI gate scripts (HR-1..46 tarama) | 3-4 gün |
| 16 | Deprecation aliases (5 rename target) | 2 gün |
| 17 | `case.service.create()` event emission | 2-3 gün |
| ... | ... | ... |

Her biri ayrı spec, ayrı PR, gradual migration. Strangler fig disiplini.
