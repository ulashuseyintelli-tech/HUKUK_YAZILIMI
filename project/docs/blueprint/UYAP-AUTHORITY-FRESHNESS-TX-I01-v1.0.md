# UYAP Authority Freshness TX I01 v1.0

```text
Task              : UYAP-AUTHORITY-FRESHNESS-TX-I01
Parent program    : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Tür               : SECURITY / TOCTOU / TRANSACTION BOUNDARY
Durum             : IMPLEMENTED — bounded patch (owner §19)
Tarih             : 2026-07-28
Kanıt tabanı      : canonical main `f2e93186`
Yetki             : Owner `GO-COMPLETE — UYAP-AUTHORITY-FRESHNESS-TX-I01`
Öncüller (ANCESTOR doğrulandı):
                    I01 `dde01ca2` · I02 `e20b36ff` · I03 `d778d3bb` · I04 `8b0fc020` ·
                    I04B `19a88b20` · PREFLIGHT `2c62dcf1` · PR-A `6e2b114b` · PR-B `43a52554`
SCHEMA DELTA      : NONE
REAL TRANSPORT    : NOT AUTHORIZED
PRODUCTION CUTOVER: HARD HOLD
```

---

## 1. Kapatılan açık

CPE gate kararı (Phase 1 / TX-0) ile `UyapOperation` evidence commit'i (TX-1) arasında bir
TOCTOU penceresi vardı. Bu pencerede POA azledilebilir, avukat pasifleştirilebilir, dosya
kapatılabilir/arşivlenebilir, `CaseClient` ilişkisi değişebilir, masraf bloğu açılabilir veya
UYAP erişilebilirliği kapatılabilirdi. TX-1 bunların **hiçbirini görmeden** commit ediyordu.

```text
ÖNCE :  CPE allowed  →  (pencere: kaynaklar değişebilir)  →  TX-1 commit
SONRA:  CPE allowed  →  Phase 1 snapshot  →  TX-1 revalidation  →  commit | STALE + rollback
```

---

## 2. AUTHORITY SNAPSHOT CONTRACT

**Sürüm:** `UYAP-AUTHORITY-SNAPSHOT/v1` · **Tip:** `UyapAuthoritySnapshot`

| Alan | İçerik |
|---|---|
| `snapshotVersion`, `evaluatedAt` | sözleşme sürümü + Phase 1 anı |
| `tenantId`, `authenticatedUserId`, `actionCode` | bağlam bağları (digest'e girer) |
| `actingLawyer` | `actingLawyerId`, `tenantId`, `userId`, `isActive`, `lawyerUpdatedAt` |
| `caseState` | `caseId`, `tenantId`, `caseStatus`, `isArchived`, `allowUyapActions`, `caseUpdatedAt` |
| `clientIds` | `clientId` **ASC** |
| `authorityEvidence` | `poaId` **ASC**: `poaId`, `clientId`, `tenantId`, `poaLawyerId`, `poaStatus`, `poaScopeType`, `poaIsActive`, `poaIsLimited`, `poaDateIssued`, `poaValidUntil`, `poaUpdatedAt` |
| `expenseBlocks` | `blockReasonId` **ASC**: `id`, `tenantId`, `caseId`, `blockedActionCode`, `status`, `createdAt`, `resolvedAt`, `cancelledAt` |
| `systemAvailability` | `explicitlyConfigured`, `available` |
| `authorityVersion`, `authorityDigest` | `UYAP-SEND-AUTHORITY/v1` + sha256 |

**PII sınırı (UYAP-CONST-007):** POA belge içeriği, `scopeDescription`, `note`, `resolutionNote`,
kimlik numaraları ve müvekkil kişisel verileri snapshot'a **kopyalanmaz**. Test hem tam anahtar
kümesini hem açık yasak-alan listesini doğrular.

**Güven sınırı (FR-05/FR-06):** snapshot **yalnız server-side** üretilir; hiçbir alanı DTO'dan
doldurulmaz ve HTTP yüzeyine çıkmaz.

### 2.1 `AuthorityEvidenceRef` genişletmesi (additive)

I03'ün evidence tipine dört yürürlük alanı eklendi: `poaIsActive`, `poaIsLimited`,
`poaDateIssued`, `poaValidUntil`. Gerekçe: **`updatedAt` tek başına yeterli değildir** —
aynı milisaniye içindeki değişim, saat kayması ve `updatedAt` tetiklemeyen raw yazma yolları
`updatedAt` karşılaştırmasını atlatabilir. Semantik alan karşılaştırması bunu kapatır.

---

## 3. REVALIDATION SOURCES

TX-1 içinde **aynı resolver'lar** (mantık kopyalanmaz), yalnız okuma client'ı transaction
client'tır:

| Kaynak | Okuyan | Yeniden okunan semantik alanlar |
|---|---|---|
| `Case` | snapshot servisi | `caseStatus`, `isArchived`, `allowUyapActions`, `tenantId`, `updatedAt` |
| `Lawyer` | I01 + freshness okuması | `isActive`, `tenantId`, `userId`, `updatedAt` |
| `CaseClient` → `Client` | I03 | `clientId` seti, `client.tenantId` |
| `ClientPowerOfAttorney` | I03 | `status`, `isActive`, `dateIssued`, `validUntil`, `isLimited`, `scopeType`, `tenantId`, `clientId`, `updatedAt` |
| `PoaLawyer` | I03 (nested) | `lawyerId`, `tenantId`, `poaId` (ilişki varlığı) |
| `ExpenseBlockReason` | I04B | `status`, `blockedActionCode`, `tenantId`, `caseId`, `createdAt`, `resolvedAt`, `cancelledAt` |
| system availability | `UyapAvailabilityService` | `explicitlyConfigured`, `available` |

### 3.1 Zaman semantiği (bilinçli karar)

Phase 1 `evaluatedAt` = CPE karar anı. **Revalidation `evaluatedAt` = commit anı.**

Aynı `evaluatedAt` kullanılsaydı, Phase 1'den sonra açılan bir masraf bloğu
(`createdAt <= evaluatedAt` filtresi nedeniyle) **görülemezdi**. Commit anı kullanmak owner
§11'in *"blocking reason created after Phase 1 → AUTHORITY_CONTEXT_STALE"* gereğini
karşılar; aynı sebeple araya giren POA süre dolumu da yakalanır.

---

## 4. TRANSACTION BOUNDARY

```text
TX-0  CpeDecisionLog                                    [BAĞIMSIZ commit — denied de KALIR]
        │
TX-1  ┌── AŞAMA 0: authority revalidation (bu görev)    ── stale ⇒ throw, HİÇBİR yazma yok
      ├── AŞAMA 1: UyapOperation + UyapAttempt#1        (P-E5B advisory lock)
      └── AŞAMA 2: UyapAttemptCpeDecisionLink           (P05C-P03 advisory lock)
        │
TX-2/TX-3  UyapRequestLog                               [BAĞIMSIZ journal]
```

Stale hâlinde ölçülen sonuç (gerçek DB): `UyapOperation` **0**, `UyapAttempt` **0**,
`UyapAttemptCpeDecisionLink` **0**, orphan **0**.

CPE kararı bağımsız commit edildiği için **stale sonucu mevcut allowed kararı sessizce
değiştirmez** (owner §9). Ayrıca yeni bir "stale decision" kaydı **üretilmez** — bu ikinci bir
karar otoritesi yaratırdı (owner §9: *"Duplicate decision authority üretme"*). Stale
disposition `UyapAuthorityStaleError.failureCode` + `changedSources` olarak taşınır ve
`UyapService` tarafından tek bir generic dış yanıta çevrilir.

---

## 5. LOCK / ORDERING

Row lock, `FOR UPDATE` veya broad table lock **kullanılmaz** (owner §7 tercih sırası: önce
transaction içinde deterministic re-read). Okuma sırası bütün code path'lerde aynıdır ve
**tek yerde** kodludur (`UyapAuthoritySnapshotService.build`) — Phase 1 ile Phase 2 aynı
fonksiyonu çağırdığı için sıra farkı **oluşamaz**:

```text
Case → Lawyer → CaseClient/Client → ClientPowerOfAttorney ASC → PoaLawyer ASC
     → ExpenseBlockReason ASC → systemAvailability
     → UyapOperation → UyapAttempt → DecisionLink
```

### 5.1 Sağlanan garantinin tam sınırı (dürüst ifade)

Prisma varsayılan izolasyonu **READ COMMITTED**'dır. Revalidation, TX-1 içinde o ana kadar
commit edilmiş her değişikliği görür. Garanti şudur:

> **Yetki, TX-1 içinde — Phase 1'in bütün okumalarından SONRA — bir anda geçerliydi.**

Revalidation ile commit arasındaki (mikrosaniye ölçeğinde) pencerede commit edilen bir azil
görülmez. Bu **kaçınılmazdır**: kilit kullanılsa bile azil commit'ten 1 ns sonra gelebilir.
Hukuken de doğrudur — yetki, işlem anında geçerliydi. Kilit ekleme yalnız bu pencereyi
kapatmak için gerekli olurdu ve owner §7 bunu son tercih olarak sıralar; bu görevde
**gerekmedi**. Artık risk R-3 olarak kaydedilmiştir.

---

## 6. DIGEST VERSION

```text
sha256( "UYAP-AUTHORITY-SNAPSHOT/v1" || \0 || canonicalJson(payload) )
```

- **Canonical serialization:** `canonicalJsonStringify` (mevcut repo yardımcısı;
  anahtar sırasından bağımsız, dizi sırası anlamlı). Yeni crypto bağımlılığı **eklenmedi**.
- **Domain separation:** emsal `claim-item-formation-canonical.domainSeparatedFormationHash`.
- **Tarih normalizasyonu:** ISO-8601 (`toJSON` davranışına bağımlı değil).
- **Bound (FR-07):** `tenantId`, `actionCode`, `authenticatedUserId`, `caseId` digest'in
  **içindedir** → bir bağlamın digest'i başka bağlamda kullanılamaz. Test ile kanıtlı.

---

## 7. STALE FAILURE MATRIX

| Durum | Kod | `changedSources` |
|---|---|---|
| Revalidation **geçerli**, digest **farklı** | `AUTHORITY_CONTEXT_STALE` | değişen kaynak(lar) |
| Revalidation **başarısız** (azil, kapanma, pasif avukat, blok, tenant uyumsuzluğu) | `AUTHORITY_REVALIDATION_FAILED` | `POA_CHANGED` / `CASE_STATE_CHANGED` / `ACTING_LAWYER_CHANGED` / … + `revalidationFailureCode` |
| Erişilebilirlik `true→false` veya yapılandırma kalktı veya provider hatası | `SYSTEM_AVAILABILITY_STALE` | `SYSTEM_AVAILABILITY_CHANGED` |
| Aynı key + materyal farklı envelope | `IDEMPOTENCY_CONFLICT` (P-E5B, değişmedi) | — |

**Internal evidence etiketleri:** `POA_CHANGED`, `POA_LAWYER_RELATION_CHANGED`,
`CASE_STATE_CHANGED`, `CASE_CLIENT_SET_CHANGED`, `ACTING_LAWYER_CHANGED`,
`EXPENSE_STATE_CHANGED`, `SYSTEM_AVAILABILITY_CHANGED`, `AUTHORITY_EVIDENCE_CHANGED`.

Dış yanıt **generic**'tir (yetki ilişkilerinin enumeration'ı önlenir); ayrıntı yalnız
sunucu log'unda ve hata nesnesinde kalır. Digest farklı ama hiçbir spesifik kaynak
eşleşmezse `AUTHORITY_EVIDENCE_CHANGED` düşer — **sessiz geçiş yoktur**.

---

## 8. IDEMPOTENCY BEHAVIOR

`UyapOperation` **tek idempotency sahibi olarak KALIR** (FR-12). `CpeExecutionRecord` veya
`UyapRequestLog` idempotency sahibi **yapılmadı**.

| Senaryo | Sonuç |
|---|---|
| stale authority | operation **yazılmaz** → başarı olarak cache edilemez |
| aynı key ile yeniden çağrı | authority **yeniden** değerlendirilir (revalidation her TX-1'de çalışır) |
| aynı key + materyal farklı payload | `UyapOperationIdempotencyConflictError` (fail-closed) |
| aynı key + aynı payload + önceki success | `IDEMPOTENT_REUSE` — deterministik önceki sonuç |
| aynı key + stale/abort edilmiş öncül | öncül **hiç yazılmadığı** için yeni çağrı taze authority ile değerlendirilir |
| eşzamanlı aynı key | tek kazanan (advisory lock + `@@unique([tenantId, idempotencyKey])`) — gerçek DB'de kanıtlı |

---

## 9. TEST EVIDENCE

### 9.1 Birim (`uyap-authority-freshness-tx.spec.ts`) — **40/40 PASS**

Snapshot üretimi (4) · digest özellikleri (6: determinizm, alan-sırası bağımsızlığı,
tenant/action/actor/case bound, domain separation) · POA yarışları (9) · Case yarışları (6) ·
masraf bloğu yarışları (3) · sistem erişilebilirliği (3) · orchestrator rollback/orphan +
deterministik barrier (7).

### 9.2 Gerçek DB (`uyap-authority-freshness.db-gated.integration.spec.ts`) — **9/9 PASS**

Disposable `postgres:16-alpine`, tam yetki zinciri gerçek satırlarla
(`Tenant → User → Lawyer → Client → Case → CaseClient → POA → PoaLawyer`):

| Senaryo | Ölçülen sonuç |
|---|---|
| Phase 1 snapshot gerçek satırlardan üretilir | digest `^[0-9a-f]{64}$` |
| taze authority | operation **1**, attempt **1**, link **1** |
| POA azledildi | **0 / 0 / 0** |
| dosya kapatıldı | **0 / 0 / 0** |
| `PoaLawyer` ilişkisi silindi | **0 / 0 / 0** |
| Phase 1 sonrası masraf bloğu açıldı | **0 / 0 / 0** |
| erişilebilirlik kapandı | **0 / 0 / 0** (`SYSTEM_AVAILABILITY_STALE`) |
| eşzamanlı aynı idempotency key | **tek** operation |
| §15 performans | **9 sorgu**, 1 client/1 POA ile de 3 client/3 POA ile de **aynı** |

### 9.3 Deterministik test barrier

`UyapAuthorityCoordinationHook` — `beforeTxRevalidation`, `afterTxRevalidation`,
`beforeOperationCreate`. **Production'da no-op ve erişilemez**: token `UyapModule` içinde
kaydedilmez (`@Optional()` → `undefined`), global mutable state / env anahtarı / statik
singleton yoktur. Testler orchestrator'ı doğrudan kurarak kancayı verir. Race testleri
gerçek zamanlamaya güvenmez.

### 9.4 Regresyon

| Kapsam | Sonuç |
|---|---|
| `src/modules/uyap` (DB'li) | **705 PASS / 41 suite / 0 FAIL** |
| `src/modules/policy-engine` | 360 PASS / 0 FAIL |
| `src/modules/lawyer` | 79 PASS |
| `src/modules/expense*` | 127 PASS |
| `src/modules/scheduler` | 23 PASS |
| Tüm `db-gated` spec'ler (gerçek Postgres 16) | PASS |
| `tsc -p tsconfig.prod.json` | EXIT 0 |
| `pnpm build` | EXIT 0 |

### 9.5 Uyarlanan davranış kilitleri (silinmedi)

| Dosya | Değişiklik | Gerekçe |
|---|---|---|
| `uyap-send-authority-resolver.spec.ts` | evidence anahtar kümesine 4 yürürlük alanı eklendi + **açık yasak-alan listesi** | Testin asıl güvencesi (serbest metin/PII taşınmaz) korundu ve **güçlendirildi** |
| `uyap-operation-evidence.orchestrator.spec.ts` | "her zaman taze" snapshot stub'ı + revalidation-önce-yazma sırası testi | Dosyanın konusu kompozisyon; tazelik kendi spec'inde |
| `uyap-operation-evidence-activation.spec.ts` | snapshot servisi stub'ı | Dosyanın konusu aktivasyon/sıralama |
| `...orchestrator.db-gated.integration.spec.ts` | "her zaman taze" stub | Dosyanın konusu idempotency/replay; tazelik ayrı db-gated spec'te |

---

## 10. SCHEMA DELTA: NONE

Owner §14 önceliği (*"schema değişikliği olmadan çözmek"*) karşılandı. Ölçüm:

| Model | Freshness göstergesi | Delta gerekli mi? |
|---|---|---|
| `Case` | `updatedAt` ✓ | hayır |
| `Lawyer` | `updatedAt` ✓ | hayır |
| `ClientPowerOfAttorney` | `updatedAt` ✓ | hayır |
| `PoaLawyer` | `updatedAt` **yok** | hayır — anlamlı mutasyon *ilişkinin varlığıdır*; silme, evidence setinden düşerek görülür. `isPrimary` yetkiye etki etmez |
| `ExpenseBlockReason` | `updatedAt` **yok** | hayır — `status`/`resolvedAt`/`cancelledAt` semantik alanları doğrudan karşılaştırılır |

Migration yok, backfill yok, mevcut veri riski yok.

---

## 11. SECURITY INVARIANTS (owner §16)

| # | Invariant | Durum | Kanıt |
|---|---|---|---|
| FR-01 | Phase 1 allowed ≠ TX-1 authority | ✅ | orchestrator TX-1 aşama 0 |
| FR-02 | Commit öncesi tüm mutable kaynaklar revalidate | ✅ | §3 tablosu + birim testler |
| FR-03 | Stale authority operation yaratamaz | ✅ | gerçek DB 0/0/0 |
| FR-04 | Cross-tenant source kullanılamaz | ✅ | `CLIENT_TENANT_MISMATCH` testi + composite FK'lar |
| FR-05 | Client-supplied snapshot/digest kabul edilmez | ✅ | tip DTO'ya bağlı değil; HTTP yüzeyi yok |
| FR-06 | Snapshot server-side üretilir | ✅ | `UyapService` içinde `build()` |
| FR-07 | Digest tenant/action/actor/case bound | ✅ | 4 ayrı digest testi |
| FR-08 | Availability missing/değişmişse deny/stale | ✅ | 3 test + PREFLIGHT-R02 gate'i |
| FR-09 | Concurrent revoke stale true üretmez | ✅ | deterministik barrier testi + gerçek DB azil testi (sınır §5.1'de) |
| FR-10 | Rollback orphan üretmez | ✅ | gerçek DB 0/0/0 |
| FR-11 | Replay authority'yi yeniden doğrular | ✅ | revalidation her TX-1'de çalışır |
| FR-12 | Idempotency owner `UyapOperation` | ✅ | branded key testi + gerçek DB concurrency |

---

## 12. OPEN ARCH-4 RESIDUALS

| # | Bulgu | Sınıf | Devir |
|---|---|---|---|
| R-1 | `CpeDecisionLog` tenantId kolonu yok — tenant yalnız `case` üzerinden | schema-level | **ARCH-4** |
| R-2 | `UyapRequestLog`: nullable `tenantId`, `Tenant`/`Case` FK yok, operation referansı yok | schema-level | **ARCH-4** |
| R-3 | Revalidation ile commit arasındaki mikrosaniye penceresi (READ COMMITTED) — kapatmak `FOR SHARE`/SERIALIZABLE gerektirir | concurrency | **ARCH-4 / owner kararı** — bu görevde gerekmedi (§5.1) |
| R-4 | Arşiv/retention sözleşmesi (PR-A containment'ından devir) | governance + schema | **ARCH-4** |
| R-5 | Retry sözleşmesi (PR-B containment'ından devir) | domain | **retry-contract birimi — owner kararı** |
| R-6 | `Case`/`Tenant` silmede `CpeDecisionLog`/`CpeExecutionRecord` Cascade | schema-level | **ARCH-4** |
| R-7 | `UyapOperation.caseId` nullable — "case'siz operation" mümkün (link kurulamaz, fail-closed) | domain | **ARCH-4** |

---

## 13. CANONICAL VERDICT

```text
AUTHORITY FRESHNESS        : PROVEN
STALE AUTHORITY COMMIT     : IMPOSSIBLE / TESTED   (birim 40/40 + gerçek DB 9/9)
COMMIT-TIME GATE VALIDITY  : CLOSED
SCHEMA DELTA               : NONE
IDEMPOTENCY OWNER          : UyapOperation (DEĞİŞMEDİ)
LOCK STRATEGY              : deterministic in-transaction re-read (row lock YOK)
PERFORMANCE                : 9 sorgu, client/POA sayısından BAĞIMSIZ (N+1 yok)
```
