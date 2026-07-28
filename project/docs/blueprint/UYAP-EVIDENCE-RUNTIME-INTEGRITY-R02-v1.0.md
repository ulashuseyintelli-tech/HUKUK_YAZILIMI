# UYAP Evidence Runtime Integrity R02 v1.0

```text
Task              : UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02
Parent program    : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Tür               : EVIDENCE / TRANSACTION / TENANT INTEGRITY
Durum             : IMPLEMENTED — bounded patch (owner §15)
Tarih             : 2026-07-28
Kanıt tabanı      : canonical main `06a62b7f` (analiz) → `6e2b114b` (PR A merged)
Yetki             : Owner `GO-COMPLETE — UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02`
Öncüller (ANCESTOR doğrulandı):
                    I01 `dde01ca2` · I02 `e20b36ff` · I03 `d778d3bb` ·
                    I04 `8b0fc020` · I04B `19a88b20` · PREFLIGHT `2c62dcf1`
REAL TRANSPORT    : NOT AUTHORIZED
PRODUCTION CUTOVER: HARD HOLD
```

Bu belge **kayıttır**; yeni hukuk veya ürün semantiği üretmez.

---

## 1. CURRENT MODELS

| Model | tenantId | Tenant FK | Idempotency/unique | Delete semantiği |
|---|---|---|---|---|
| `CpeDecisionLog` | **YOK** (case üzerinden) | — | `@@unique([id, caseId])` (composite hedef) | `case` → **Cascade**; link FK'si RESTRICT |
| `CpeExecutionRecord` | VAR | Cascade | **`@@unique([tenantId, executionId])`** (R02) | `case` → Cascade, `tenant` → Cascade |
| `UyapOperation` | VAR | Cascade | `@@unique([tenantId, idempotencyKey])` | `case` → **Restrict** |
| `UyapAttempt` | VAR | Cascade | `@@unique([operationId, attemptNumber])` | `operation` → Cascade |
| `UyapAttemptCpeDecisionLink` | VAR | — | `@@unique([cpeDecisionLogId])` | 3 FK'nin **tamamı RESTRICT** |
| `UyapRequestLog` | **nullable** | **FK YOK** | yok | FK yok — cascade zincirinde değil |

---

## 2. ROLE OWNERSHIP

| Rol | Sahip | Durum |
|---|---|---|
| Immutable policy-decision evidence | `CpeDecisionLog` | ✅ uyumlu |
| CPE evaluation/execution journal | `CpeExecutionRecord` | ✅ uyumlu (R02'den sonra idempotency tenant-scoped) |
| Domain operation aggregate + **idempotency source-of-truth** | `UyapOperation` | ✅ uyumlu |
| Dispatch/provider attempt + **retry source-of-truth** | `UyapAttempt` | ✅ **R02'den sonra tekil** |
| Immutable attempt/decision relationship | `UyapAttemptCpeDecisionLink` | ✅ uyumlu |
| Request/serialization/dispatch-boundary journal | `UyapRequestLog` | ⚠️ rol **daraltıldı** (aşağıda) |

### 2.1 `CpeExecutionRecord` ↔ `UyapOperation` ayrımı (kesinleştirildi)

Bunlar **rakip değil, farklı düzlemlerdir**:

- `CpeExecutionRecord` **CPE düzlemidir**: "bir aksiyon *yürütüldü* ve state transition
  uygulandı mı?" Anahtarı istemcinin verdiği `executionId`'dir; kapsamı `Case` +
  `ActionCode`'dur. UYAP'a özgü değildir — her CPE aksiyonu için geçerlidir.
- `UyapOperation` **UYAP domain düzlemidir**: "hangi hukuki gönderim işlemi, hangi
  aktör/POA bağlamıyla, hangi attempt zinciriyle?" Anahtarı **server-controlled**
  `UYAP-OP/v1:<uuid>` biçimli `idempotencyKey`'dir; ham istemci string'ine eşitlenemez.

İkisi **aynı state'i yazmaz**: `CpeExecutionRecord.status` CPE yürütmesinin sonucudur;
`UyapAttempt.providerState`/`legalEffectState` gönderimin sonucudur. Duplicate authority
**YOKTUR**. R02'den önceki tek çakışma noktası idempotency **namespace**'iydi
(`executionId` global, `idempotencyKey` tenant-scoped) — bu düzeltildi.

---

## 3. TRANSACTION MAP

```text
HTTP isteği (JwtAuthGuard, tenant doğrulanmış)
  │
  ├─ TX-0  CPE evaluation            → CpeDecisionLog.create        [BAĞIMSIZ commit]
  │        (canPerformAction)          allowed/denied FARK ETMEZ
  │
  ├─ (denied ise) BURADA BİTER — karar kaydı KALIR, domain operation OLUŞMAZ
  │
  ├─ TX-1  evidence (flag-gated)     → UyapOperation.create         ┐
  │        recordEvidence()            + UyapAttempt#1.create       │ TEK
  │                                    + UyapAttemptCpeDecisionLink │ ATOMİK
  │                                                                 ┘
  │        advisory lock sırası: operation-create → decision-link (kod-sabit)
  │        TX-1 hatası → dispatch/logRequest BAŞLAMAZ (fail-closed throw)
  │
  ├─ TX-2  logRequest()              → UyapRequestLog.create        [BAĞIMSIZ commit]
  ├─ dispatch (STUB — gerçek transport YOK)
  └─ TX-3  logResponse()             → UyapRequestLog.update        [BAĞIMSIZ commit]
```

### 3.1 Ayrımların semantiği (owner §5)

| Ayrım | Gerekçe | Doğrulama |
|---|---|---|
| TX-0 ayrı | **DENIED DECISION: retained / DOMAIN OPERATION: not created.** Karar delili operation'ın yaşamından bağımsızdır; reddedilen bir istek de hukuki iz bırakmalıdır. | Canary R01 ile birebir uyumlu (21 `CpeDecisionLog` satırı, 0 operation) |
| TX-1 atomik | operation + attempt#1 + link **birlikte** ya var ya yok → "operation var, attempt yok" / "link var, attempt yok" üretilemez | `uyap-operation-writer.service.ts` içinde attempt#1 yokken idempotent reuse **veri bütünlüğü ihlali** olarak atar |
| TX-2/TX-3 ayrı | request log bir **journal**'dır, state sahibi değildir; commit'i evidence'ı bloklamaz | R02 sonrası request log'da hiçbir retry/attempt state'i yazılmaz |

### 3.2 Yasak durumların kapatılması (owner §5)

| Yasak durum | Kapatan mekanizma |
|---|---|
| operation var, required attempt yok | TX-1 atomik + writer'ın açık bütünlük kontrolü |
| attempt var, operation yok | `UyapAttempt.operation` composite FK `[operationId, tenantId]` |
| link var, referenced decision yok | `cpeDecisionLog` FK `[cpeDecisionLogId, caseId] → [id, caseId]`, RESTRICT |
| cross-tenant operation/decision link | link'in **üç** FK'si de tenant/case taşır; `UyapOperation.caseId` NULL ise link **kurulamaz** |
| failed transaction sonrası orphan | tüm writer'lar tek `$transaction`; hata → tam rollback |
| request log var, tenant operation yok | ⚠️ **AÇIK / ARCH-4** — request log ile operation arasında referans YOK (aşağıda R-2) |

---

## 4. IDEMPOTENCY CONTRACT

| Soru | Cevap |
|---|---|
| Key'i kim üretir? | `UyapOperation`: **server** — `deriveUyapOperationIdempotencyKeyFromHttpToken(namespace, httpToken)`; ham istemci string'i **kabul edilmez** (`UYAP-OP/v1:<uuid>` branded tip + runtime guard). `CpeExecutionRecord`: **istemci** (`ActionExecutedDto.executionId`) |
| Kim normalize eder? | Namespace `${tenantId}:${action}` — aynı token farklı tenant/action için **farklı** key üretir |
| Unique owner | `UyapOperation.@@unique([tenantId, idempotencyKey])` |
| Aynı key başka tenant'ta? | **Bağımsız namespace** — her iki modelde de (R02'den sonra) |
| Aynı key farklı operation type? | Namespace'e `action` girdiği için **farklı key** olur |
| Failed operation replay | Envelope birebir aynıysa `IDEMPOTENT_REUSE` (mevcut operation + attempt#1 döner); **materially different** envelope → `UyapOperationIdempotencyConflictError` (fail-closed) |
| Concurrent same request | `pg_advisory_xact_lock(hashtext(key))` + unique kısıt; kaybeden `P2002` → typed `ConcurrentWriteConflictError` |
| Stale authority yeniden değerlendirme | Her attempt'te CPE yeniden değerlendirilir (`@@unique([cpeDecisionLogId])` bir kararın ikinci attempt'e **taşınmasını yasaklar**) — freshness/TOCTOU penceresi **I05** |

**Minimum invariant'lar (owner §4) → hepsi karşılanıyor.**

---

## 5. RETRY CONTRACT

**Canonical retry sahibi: `UyapAttempt` (TEKİL).**

State kaynakları: `internalState` (`UyapInternalOperationState`), `providerState`
(`NOT_DISPATCHED | DISPATCH_IN_PROGRESS | RECEIVED | ACCEPTED | REJECTED |
OUTCOME_UNKNOWN`), `legalEffectState` (`NONE | PENDING_CONFIRMATION | CONFIRMED`).
Lineage `@@unique([operationId, attemptNumber])` ile **gap-free**, `previousAttemptId`
composite FK ile aynı operation+tenant'a **kilitli**.

### 5.1 R02 ile kapatılan duplicate ownership

`UyapRequestLog.status`/`retryCount`, attempt lineage'ından **bağımsız ikinci bir retry
state machine**'iydi ve **iki** yerden yazılıyordu:

1. `SchedulerService.retryFailedUyapRequests()` — `@Cron(EVERY_6_HOURS)`, **CANLI**,
   **tenant sınırı YOK**, tüm tenant'ları tarayıp `FAILED → RETRY` + `retryCount++`.
2. `UyapService.retryFailedRequests()` — UYAP-RETRY-CONTAIN-01 ile erişilemez, ama gövdesi
   terminal-state kontrolü olmadan, `actorUserId`/`Idempotency-Key` **olmadan** re-dispatch
   ediyordu.

Sonuç: dispatcher kapalı olduğu için satırlar `RETRY`'a girip **bir daha çıkmıyordu**
(tüketicisi olmayan tek yönlü durum); `getStats()` sayımları da bozuluyordu (RETRY ne
pending ne failed sayılır).

**Karar (bounded containment):** her iki yazma yolu da kaldırıldı. Gerçek retry sözleşmesi
(attempt lineage üzerinden eligibility + POA/CPE yeniden değerlendirme + tenant-scoped
dispatch + idempotency) ayrı bir **retry-contract birimine** aittir ve ayrı owner kararı
gerektirir — burada icat edilmez.

### 5.2 Owner §7 kontrol listesi

| Kural | Durum |
|---|---|
| terminal success tekrar dispatch edilemez | ✅ dispatch yolu YOK |
| terminal failure retry edilemez | ✅ dispatch yolu YOK |
| retryable failure tek canonical kural | ⏸ **retry-contract birimi** (henüz yetkilendirilmedi) |
| unknown provider result duplicate dispatch üretmez | ✅ `OUTCOME_UNKNOWN` ayrı durum; otomatik dispatch YOK |
| stale authority yeni evaluation gerektirir | ✅ `@@unique([cpeDecisionLogId])` karar taşımayı yasaklar |
| aynı retry state başka modelde bağımsız source-of-truth olmamalı | ✅ **R02 ile sağlandı** |

---

## 6. DECISION CARDINALITY

Owner-ratified sözleşme (schema yorumunda): **1 `UyapAttempt` → N `CpeDecisionLog`**.
Aynı kararın **başka** bir attempt'e bağlanması YASAK (UYAP-CONST-002 "PRIOR ATTEMPT
AUTHORITY ≠ CURRENT ATTEMPT AUTHORITY").

| Kanıtlanacak | Mekanizma |
|---|---|
| duplicate decision link yok | `@@unique([cpeDecisionLogId])` (DB) |
| same decision yanlış attempt'e bağlanamaz | aynı unique + writer'ın `IDEMPOTENT_REPLAY` vs `ConflictError` ayrımı |
| cross-tenant decision bağlanamaz | üç composite FK: attempt `[id, operationId, tenantId]`, operation `[id, caseId, tenantId]`, decision `[id, caseId]` |
| required decision eksikse commit olmaz | orchestrator TX-1'de link yazımı zorunlu; hata → tam rollback |
| negative-control decision yanlış bağlanmaz | denied kararda `recordEvidence` **hiç çağrılmaz** (CPE allowed sonrası çağrılır) |

Fiilî runtime kardinalitesi bugün **1 attempt → 1 decision**'dır (orchestrator tek link
yazar). Pre-dispatch revalidation ikinci kararı **I05**'te getirecektir; schema bunu
zaten destekler.

---

## 7. REQUEST LOG ROLE

| Soru | Cevap |
|---|---|
| operation öncesi mi sonrası mı? | **sonrası** — `recordEvidence` (TX-1) → `logRequest` (TX-2) |
| serializer input/output mu? | request/response gövdesi (`requestData`/`responseData`) |
| dispatch payload hash taşıyor mu? | **HAYIR** |
| retry'de yeni log oluşur mu? | **Artık retry yok** (§5) |
| aynı payload duplicate log üretir mi? | evet — unique kısıt yok; journal semantiği |
| transport hiç çalışmadığında kayıt beklenir mi? | evet — bugün STUB dispatch'te de yazılır |

**Rol sınırı:** request log operation/attempt state source-of-truth **değildir** —
R02 ile bu fiilen sağlandı (`providerState`/`legalEffectState`/`attemptNumber`
kolonlarını taşımaz ve retry state'i artık yazılmaz).

**Hassas veri:** `uyap-debtor-assets-pii-persistence.spec.ts` (CAP-11) ham
`debtorIdentityNo`'nun `requestData`/`responseData`'ya yazılmasını engeller. Tam POA
belgesi kopyalanmaz, credential yazılmaz.

---

## 8. TENANT INVARIANTS

| Bağ | DB seviyesinde zorlanıyor mu? |
|---|---|
| `operation.tenantId = case.tenantId` | ✅ composite FK `[caseId, tenantId]` |
| `attempt.tenantId = operation.tenantId` | ✅ composite FK `[operationId, tenantId]` |
| `link.tenantId = attempt.tenantId = operation.tenantId` | ✅ üç composite FK |
| `link.caseId = operation.caseId` | ✅ FK `[operationId, caseId, tenantId]` |
| `decision.caseId = link.caseId` | ✅ FK `[cpeDecisionLogId, caseId]` |
| `execution.tenantId` + idempotency namespace | ✅ **R02**: `@@unique([tenantId, executionId])` |
| `requestLog.tenantId = case.tenantId` | ❌ **AÇIK** — kolon nullable, FK yok (R-2) |

Uygulama seviyesi kapı: `CasePolicyEngine.assertCaseBelongsToTenant()` her public
entrypoint'te (boş tenant → `Forbidden`; yabancı case → `NotFound`, varlık sızıntısı yok).

---

## 9. FAILURE MATRIX

| Başarısız yazım | Sonuç | Sınıf |
|---|---|---|
| `CpeDecisionLog` write fails | `canPerformAction` catch → `handleError`; `UYAP_SEND` `failMode: CLOSED` + HIGH risk → `SYSTEM_ERROR_BLOCKED` | **terminal failure (deny)** |
| `CpeExecutionRecord` write fails (create) | P2002 → kazananın kaydı okunur, deterministik duplicate; başka hata → yükselir | **retryable system error** |
| `CpeExecutionRecord` concurrent duplicate | tek kazanan; kaybeden duplicate cevabı alır | **deterministic** |
| decision link write fails | TX-1 **tam rollback** → operation+attempt de yazılmaz; `UYAP_EVIDENCE_WRITE_FAILED` | **rollback + terminal failure** |
| operation write fails | aynı TX-1 rollback | **rollback + terminal failure** |
| attempt write fails | aynı TX-1 rollback | **rollback + terminal failure** |
| request log write fails | TX-2 bağımsız; hata dispatch'i durdurur (`logRequest` await'li) | **terminal failure** |
| CPE **denied** | `CpeDecisionLog` **KALIR**, operation **OLUŞMAZ** | **retained denied decision** |

Sessiz hata veya yarım evidence yolu **bulunamadı**; TX-1'in atomikliği yarım evidence'ı
yapısal olarak imkânsız kılar.

---

## 10. LEGAL HOLD VE RETENTION

### 10.1 R02 ile kapatılan yıkıcı yol

`DecisionLogRetentionService` dokümantasyonu *"KVKK uyumlu: Kayıtlar silinmez, arşiv
tablosuna taşınır"* diyordu. Gerçek davranış **tersiydi**:

- `archiveBatch()` **yalnızca** `deleteMany` çağırıyordu,
- `ARCHIVE_TABLE` sabiti **hiç kullanılmıyordu**,
- `CpeDecisionLogArchive` modeli **ne şemada ne migration'da** vardı,
- servis `PolicyEngineModule` provider'ı → `@Cron(EVERY_DAY_AT_3AM)` **CANLI**.

Yani 90 günden eski her CPE karar delili (referential legal-hold ile bağlı olanlar hariç)
her gece **kalıcı olarak imha ediliyor** ve sonuç `archived` diye raporlanıyordu.

**Containment (owner §12):** silme kaldırıldı. Cron yalnız aday sayar; `manualArchive`
açık hata atar. Gerçek arşiv sözleşmesi **ARCH-4**'e bırakıldı.

### 10.2 Cascade haritası

| Silme | Etki | Değerlendirme |
|---|---|---|
| `Case` sil | `CpeDecisionLog` **Cascade**, `CpeExecutionRecord` **Cascade** | ⚠️ ama `UyapOperation.case` **Restrict** → operation'ı olan case zaten silinemez; link'i olan karar da RESTRICT'e çarpar |
| `Tenant` sil | operation/attempt/execution **Cascade** | ⚠️ link FK'leri RESTRICT olduğundan bağlı delil varken tenant silinemez (fail-closed) |
| `UyapOperation` sil | attempt **Cascade** | link RESTRICT → bağlı delil varken silinemez |

---

## 11. OPEN ARCH RESIDUALS

| # | Bulgu | Sınıf | Devir |
|---|---|---|---|
| R-1 | `CpeDecisionLog` **tenantId kolonu yok** — tenant yalnız `case` üzerinden türetilir | schema-level | **ARCH-4** (P05C-P01 bilinçli kapsam kararı) |
| R-2 | `UyapRequestLog`: `tenantId` nullable, `Tenant`/`Case` FK **yok**, operation'a referans **yok** → "request log var, tenant operation yok" durumu **tespit edilemez** | schema-level | **ARCH-4** |
| R-3 | Gerçek arşiv/retention sözleşmesi (arşiv modeli, saklama süresi, KVKK minimizasyonu, legal-hold matrisi) | governance + schema | **ARCH-4** |
| R-4 | Retry sözleşmesi (attempt lineage üzerinden eligibility + yeniden değerlendirme + dispatch) | domain | **retry-contract birimi — owner kararı gerekir** |
| R-5 | `Case`/`Tenant` silmede `CpeDecisionLog`/`CpeExecutionRecord` **Cascade** — link'siz kararlar sessizce gider | schema-level | **ARCH-4** |
| R-6 | `UyapOperation.caseId` **nullable**; NULL ise link kurulamaz (fail-closed, ama "case'siz operation" mümkün) | domain | **ARCH-4** |

---

## 12. I05 FRESHNESS DEPENDENCIES

`UYAP-AUTHORITY-FRESHNESS-TX-I01` (I05) bu görevin bıraktığı şu zeminden başlar:

1. `ActionContext.evaluatedAt` CPE'ye **geçiyor** (I04) ama TX-1 ile TX-0 arasındaki
   pencerede yeniden değerlendirilmiyor → TOCTOU penceresi **açık**.
2. Schema **hazır**: `1 attempt → N decision` kardinalitesi pre-dispatch revalidation
   kararını taşıyabilir; `@@unique([cpeDecisionLogId])` her kararın tek attempt'e ait
   olmasını garanti eder.
3. `UyapAttempt.startedAt`/`finishedAt` mevcut; freshness penceresi bunlara bağlanabilir.
4. Retry sözleşmesi (R-4) I05'in **girdisi değil çıktısıdır** — I05 tek bir attempt
   içindeki tazelikle ilgilenir.

---

## 13. ACCEPTANCE (owner §16)

```text
IDEMPOTENCY OWNER          : SINGLE      (UyapOperation; CpeExecutionRecord ayrı düzlem, tenant-scoped)
RETRY OWNER                : SINGLE      (UyapAttempt)
TRANSACTION BOUNDARY       : PROVEN      (§3 — TX-0/TX-1/TX-2/TX-3, her ayrımın semantiği yazılı)
ROLLBACK                   : ATOMIC      (TX-1 tek $transaction; yarım evidence yapısal olarak imkânsız)
ORPHAN PATH                : NONE        (repository-içi; R-2 tespit edilemezliği ARCH-4'e devredildi)
CROSS-TENANT LINK          : IMPOSSIBLE / TESTED
DECISION CARDINALITY       : DETERMINISTIC
REPLAY                     : DETERMINISTIC
LEGAL-HOLD DESTRUCTIVE RISK: CONTAINED (yıkıcı cron kapatıldı) + ARCH-4'e DEFERRED
BLOCKING CI                : PROVEN
```
