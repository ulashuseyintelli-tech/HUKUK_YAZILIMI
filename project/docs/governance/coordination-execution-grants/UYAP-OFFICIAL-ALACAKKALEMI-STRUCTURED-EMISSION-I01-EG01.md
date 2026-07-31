# UYAP Official AlacakKalemi Structured Emission I01 — Exact Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-EG01 -->

```text
Grant ID                     : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-EG01
Task ID                      : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01
Program                      : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Executor                     : CODEX_LOCAL
Mode                         : GO-COMPLETE
Scope                        : UYAP STRUCTURED-EMISSION-I01 ONLY
Binding original captured base: 9e55f0bf2b65fa3914087e6f5f21ad2c72eedd3e
Fence-captured execution base: 6e0a84c473ca56c69a6b173739864f9f3b0195d2
Reusable                     : NO
Grant expiry                 : TERMINAL CLOSEOUT
Second use                   : FAIL-CLOSED
```

## Semantic authority binding

```text
semanticAuthorityRef.kind     : SEMANTIC_AUTHORITY
semanticAuthorityRef.path     : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-SA01
```

## Hash-bound owner evidence

Exact owner excerpt:

```text
Av. Ulaş Hüseyin Telli olarak, UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01 görevinin canonical M01 Legal-Basis sonucunu değiştirmeden tüketmesini; yalnız W-01…W-05 ile doğrulanmış resmî çek, senet, poliçe ve ilam sarmalayıcıları altında deterministik ve fail-closed structured emission üretmesini; gerekli SA01 ve EG01 kayıtlarının oluşturulmasını; bounded reconstruction, test, required CI, PR, squash-merge, main sync, post-merge doğrulama, terminal closeout ve güvenli cleanup işlemlerinin aynı görev içinde GO-COMPLETE yetkisiyle tamamlanmasını onaylıyorum.
```

```text
Exact excerpt SHA-256 : 5975da98c0e8f2cdf5db86743bf6caa2ed21fde941515791ea27de422b6d1b10
```

## Granted chain

Bu tek kullanımlık grant yalnız exact task için şu zinciri yetkilendirir:

```text
ANALYZE → BOUNDED RECONSTRUCTION → VERIFY → COMMIT → PUSH → PR → CI
→ IF GO-COMPLETE → SQUASH-MERGE → MAIN SYNC → POST-MERGE VERIFY
→ TERMINAL CLOSEOUT → TASK-LOCAL CLEANUP
```

Merge; exact authorized scope, local validation ve required CI `PASS`, PR
`CLEAN / MERGEABLE`, semantic/merge conflict `NONE`, active same-task writer
`NONE`, merge fence `ENFORCING`, M01 mutation `NONE` ve production activation
`NONE` olduğunda yapılabilir.

## Binding boundaries

- Legal Basis semantic authority yalnız RECEIVABLE'dadır.
- UYAP canonical M01-qualified sonucu değiştirmeden tüketir; yeniden
  sınıflandırmaz ve ikinci registry/resolver oluşturmaz.
- Exact tenant/case/ClaimItem/snapshot ile release/version/checksum bağı
  zorunludur.
- Wrapper presentation mapping'i yalnız W-01…W-05 canonical sinyallerinden
  server-side çözülür; caller-supplied authority kabul edilmez.
- Yalnız `cek`, `senet`, `police` ve `ilam` wrapper aileleri desteklenir.
- Unresolved/ambiguous tek kalem bütün emission'ı fail-closed durdurur; XML
  üretilmez ve byte sayısı sıfırdır.
- Faiz bu dilimde reddedilir; `digerAlacak`/`kontrat` fallback'i yoktur.
- Runtime default OFF, production call-site `NONE` ve production reachability
  `0` kalır.

## Explicit denials

```text
LEGAL_BASIS_SEMANTIC_CHANGE
M01_REINTERPRETATION_OR_MUTATION
CALLER_SUPPLIED_LEGAL_BASIS_OR_WRAPPER_AUTHORITY
CURRENT_LATEST_DEFAULT_FALLBACK
SCHEMA_OR_MIGRATION
LIVE_DB_OR_BACKFILL
PRODUCTION_ACTIVATION_OR_LIVE_EMISSION
STRICT_DTD_CLAIM
OWNER_WIP_MUTATION
SUCCESSOR_MUTATION
CROSS_TASK_REUSE
```

```text
SECOND USE: FAIL-CLOSED
```

## Terminal consumption receipt

Bu bölüm implementation merge sonrasında aynı task-bound grant altında
append-only doldurulur. Yeni semantic authority veya ikinci grant kullanımı
üretmez. Doldurulmadan önce task açık, grant tek-kullanımlık ve yalnız yukarıdaki
exact zincir için aktiftir.

```text
TASK STATUS            : OPEN
CHANGE STATUS          : NOT YET MERGED
DELIVERY STATUS        : PENDING
SEMANTIC AUTHORITY     : CANONICAL UPON APPROVED MERGE
EXECUTION GRANT        : ACTIVE / SINGLE-USE
IMPLEMENTATION PR      : PENDING
IMPLEMENTATION SHA     : PENDING
M01 QUALIFICATION      : REQUIRED
LEGAL-BASIS OWNER      : RECEIVABLE ONLY
FALLBACK               : NONE
FAIZ                    : REJECTED IN THIS SLICE
DEFAULT-OFF            : REQUIRED
PRODUCTION CALL-SITE   : NONE
PRODUCTION REACHABILITY: 0
STRICT DTD             : NOT CLAIMED
REQUIRED CI            : PENDING
```

PR #2010 (`claude/uyap-alacakkalemi-structured-emission-i01`) bu görevde
reopen/rebase/force-push/merge edilmez. Head
`6e4d6c43647ef8cc221920486acde2338b76e824`, patch-id
`1b46b54c579228f79530a18ab15e7cef34527f3c` yalnız read-only bounded
reconstruction kanıtıdır; stale caller-supplied `wrapperResolution` trust
boundary'si taşınmaz.
