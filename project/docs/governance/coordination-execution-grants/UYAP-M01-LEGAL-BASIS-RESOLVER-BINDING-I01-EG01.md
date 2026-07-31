# UYAP-M01 Legal Basis Resolver Binding I01 — Exact Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-EG01 -->

```text
Grant ID              : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-EG01
Task ID               : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01
Program               : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Executor              : CODEX_LOCAL
Mode                  : GO-COMPLETE
Scope                 : UYAP-M01 ONLY
Original captured base: ca749dd61376fc9e393489ca5f5e13d3efab8f18
Reusable              : NO
Second use            : FAIL-CLOSED
```

## Semantic authority binding

```text
semanticAuthorityRef.kind     : SEMANTIC_AUTHORITY
semanticAuthorityRef.path     : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-SA01
```

## Hash-bound owner evidence

Exact owner excerpt:

```text
Av. Ulaş Hüseyin Telli olarak, UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01 görevinin canonical RECEIVABLE Legal-Basis release’ini UYAP içinde consumer-only, exact-version, checksum-bound, fail-closed ve production activation oluşturmayan biçimde bağlamasını; gerekli task-specific Semantic Authority ve Execution Grant kayıtlarının oluşturulmasını; analiz, implementasyon, test, PR, required CI, squash-merge, main sync, post-merge doğrulama ve güvenli cleanup işlemlerinin aynı görev içinde GO-COMPLETE yetkisiyle tamamlanmasını onaylıyorum.
```

```text
Exact excerpt SHA-256 : b6e5202f14c49eba84c66a4173bf11d0ff1674b1e60cfdce2da6ab1c3e7374ae
```

## Granted chain

Bu grant yalnız exact task için şu zinciri yetkilendirir:

```text
ANALYZE → IMPLEMENT → VERIFY → COMMIT → PUSH → PR → CI
→ IF GO-COMPLETE → SQUASH-MERGE → MAIN SYNC → POST-MERGE VERIFY
→ TASK-LOCAL CLEANUP → TERMINAL CLOSEOUT
```

Merge; exact authorized scope, local validation ve required CI `PASS`, PR
`CLEAN / MERGEABLE`, semantic/merge conflict `NONE`, active same-task writer
`NONE` ve production activation `NONE` olduğunda yapılabilir.

## Binding boundaries

- RECEIVABLE, Legal Basis semantic ve exact-version authority sahibidir.
- UYAP yalnız consumer adapter ve dormant/default-OFF composition kurabilir.
- Exact release/version/checksum/snapshot/tenant/case/ClaimItem ilişkisi fail-closed
  doğrulanır.
- Caller, transport, legacy code, `CaseSubCategory`, `DueType`, `mahiyetKodu`,
  `takipTuru`, XML parent veya free text hukuki authority üretemez.
- Production reachability ve activation bu grant kapsamında sıfır kalır.

## Explicit denials

```text
LEGAL_BASIS_SEMANTIC_CHANGE
SECOND_REGISTRY_OR_RESOLVER
CURRENT_LATEST_DEFAULT_FALLBACK
SCHEMA_OR_MIGRATION
LIVE_DB_OR_BACKFILL
SERIALIZER_OR_STRUCTURED_EMISSION
PRODUCTION_ACTIVATION_OR_CUTOVER
OWNER_WIP_MUTATION
CROSS_TASK_REUSE
```

```text
SECOND USE: FAIL-CLOSED
```

## Terminal consumption receipt

Bu bölüm yeni semantic authority veya ikinci grant kullanımı üretmez. Yukarıdaki
tek kullanımlık grant ile tamamlanan exact task'in terminal delivery kanıtını
append-only kaydeder.

```text
TASK STATUS           : CLOSED
CHANGE STATUS         : MERGED
DELIVERY STATUS       : PASS
SEMANTIC AUTHORITY    : CANONICAL
EXECUTION GRANT       : CONSUMED / CLOSED
IMPLEMENTATION PR     : #2033
IMPLEMENTATION SHA    : 5338a6214e21a52bd7e0fa4e82f85384952bd19d
RECEIVABLE PREDECESSOR: CLOSED / UYAP-CONSUMABLE
RESOLVER BINDING      : CANONICAL / CONSUMER-ONLY
DEFAULT-OFF           : PASS
PRODUCTION CALL-SITE  : NONE
PRODUCTION REACHABILITY: 0
REQUIRED CI           : 4/4 PASS
SUCCESSOR             : UYAP STRUCTURED EMISSION / SEPARATE TASK AUTHORITY REQUIRED
```

Delivery evidence:

- UYAP, RECEIVABLE-owned `LegalBasisExactVersionResolverPort` sonucunu exact
  release/version/checksum ile tüketir; ikinci registry/resolver veya semantic
  reinterpretation eklenmedi.
- Tenant/case/ClaimItem/snapshot, effective time, component, source/evidence ve
  liability uyumsuzlukları fail-closed sonuç üretir.
- Caller veya transport kaynaklı Legal Basis override'ları ve
  current/latest/default fallback kabul edilmez.
- M01 senaryo matrisi `19/19 PASS`; post-merge production TypeScript ve Nest
  build `PASS`.
- Required GitHub checks `Architectural Guardrails`, `Test Suite`, `Web Tests
  (vitest)` ve `Client Workspace Live Smoke`: `4/4 PASS`; gözlenen
  orchestration ve CodeQL kontrolleri de `PASS`.
- Schema, migration, live DB, historical mutation, serializer/structured
  emission ve production activation değişikliği yoktur.

PR #2010 (`claude/uyap-alacakkalemi-structured-emission-i01`) bu task içinde
merge edilmedi veya değiştirilmedi; branch/worktree/içerik korunmuştur. M01
terminal kapanışından sonra yalnız ayrı task-specific SA + EG ile yürütülebilen
next-sequence candidate olarak kalır.

```text
SECOND USE        : FAIL-CLOSED
OWNER WIP         : UNTOUCHED
WAITING FOR OWNER : NO FOR M01 — TASK COMPLETE
```
