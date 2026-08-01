# UYAP Official Serializer Bypass Hardening I01 — Exact Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-EG01 -->

```text
Grant ID                     : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-EG01
Task ID                      : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01
Program                      : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Executor                     : CODEX_LOCAL
Mode                         : GO-COMPLETE
Scope                        : UYAP SERIALIZER-BYPASS-HARDENING-I01 ONLY
Known-good floor             : 2694d1e4bbc4173ee8dc328d97edb853d0d32b78
Binding original captured base: ee0ebe1fbd825b007de71c5f4a9deed6cc4d9a6e
Materialization base         : 3803f0346b3efda39cb90ea2cac19b3b96939340
Reusable                     : NO
Grant expiry                 : TERMINAL CLOSEOUT
Second use                   : FAIL-CLOSED
```

## Semantic authority binding

```text
semanticAuthorityRef.kind     : SEMANTIC_AUTHORITY
semanticAuthorityRef.path     : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-SA01
```

## Hash-bound owner evidence

Exact owner excerpt:

```text
OWNER TASK-BOUND AUTHORITY
SEMANTIC AUTHORITY + EXECUTION GRANT
GO-COMPLETE

OWNER:
Av. Ulaş Hüseyin Telli

PROGRAM:
UYAP-MODULE-FULL-GAP-CLOSURE-R02

CURRENT PHASE:
POST-STRUCTURED-EMISSION AUTHORITY HARDENING

EXACT TASK:
UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01

TITLE:
Canonical Resolution Provenance / Capability Enforcement

SEMANTIC AUTHORITY:
UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-SA01

EXECUTION GRANT:
UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-EG01

KNOWN GOOD FLOOR:
2694d1e4bbc4173ee8dc328d97edb853d0d32b78

OWNER DECISION:
RATIFIED

EXECUTION:
GO-COMPLETE

GRANT:
ONE-SHOT / TASK-BOUND

GRANT EXPIRY:
TERMINAL CLOSEOUT
```

```text
Exact excerpt SHA-256 : 7f935ec61b02222e556a237f6cdadd700aa7f457dcdc0935778e89bfb0eae5b6
```

## Granted chain

Bu tek kullanımlık grant yalnız exact task için şu zinciri yetkilendirir:

```text
ANALYZE → IMPLEMENT → VERIFY → COMMIT → PUSH → PR → CI
→ IF GO-COMPLETE → SQUASH-MERGE → MAIN SYNC → POST-MERGE VERIFY
→ TERMINAL CLOSEOUT → TASK-LOCAL CLEANUP
```

Merge; exact authorized scope, local validation ve required CI `PASS`, PR
`CLEAN / MERGEABLE`, semantic/merge conflict `NONE`, active same-task veya
same-path writer `NONE`, runtime activation `NONE` ve owner WIP mutation `NONE`
olduğunda yapılabilir.

## Binding boundaries

- `takipTuru` ve `mahiyetKodu` için yalnız canonical resolver-issued,
  runtime-verifiable `OfficialCodeResolution` serializer authority'sidir.
- Caller-created veya canonical sonucu yapısal olarak kopyalayan `RESOLVED`
  nesnesi authority değildir; XML ve byte üretiminden önce fail-closed
  reddedilir.
- Mevcut official-code mapping'leri ve public output anlamı değişmez; yeni
  mapping veya fallback eklenmez.
- RECEIVABLE Legal Basis semantic authority ve M01 consumer-only sınırı
  değişmez.
- Runtime default OFF, production call-site `NONE` ve production reachability
  sıfır kalır.

## Explicit denials

```text
NEW_OFFICIAL_CODE_MAPPING
LEGAL_BASIS_SEMANTIC_CHANGE
M01_REINTERPRETATION_OR_MUTATION
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
append-only doldurulur. Yeni semantic authority veya ikinci grant üretmez.

```text
TASK STATUS               : CLOSED
CHANGE STATUS             : MERGED
DELIVERY STATUS           : PASS
SEMANTIC AUTHORITY        : CANONICAL
EXECUTION GRANT           : CONSUMED / CLOSED
IMPLEMENTATION PR         : #2067
IMPLEMENTATION SHA        : 11ffb62994e95d7e6a051dbf609d5db74101a6b7
RESOLUTION PROVENANCE     : CANONICAL RESOLVER CAPABILITY ENFORCED
CALLER-CREATED RESOLVED   : FAIL-CLOSED
STRUCTURAL COPY           : FAIL-CLOSED
REJECTED XML / BYTE       : 0 / 0
OFFICIAL MAPPINGS         : UNCHANGED
M01 / RECEIVABLE AUTHORITY: UNCHANGED
DEFAULT-OFF               : PROVEN
PRODUCTION ACTIVATION     : NONE
SCHEMA / MIGRATION        : NONE
STRICT DTD                : NOT CLAIMED
REQUIRED CI               : PASS
SECOND USE: FAIL-CLOSED
WAITING FOR OWNER : NO FOR THIS TASK — TASK COMPLETE
```

Terminal kanıt zinciri:

- Implementation PR `#2067`, exact squash
  `11ffb62994e95d7e6a051dbf609d5db74101a6b7` ile canonical main'e alındı.
- Targeted official-code test paketi `15/15` suite ve `333/333` test ile geçti;
  post-merge tekrarında aynı sonuç doğrulandı.
- Nest API build, diff/scope/secret/generated-artifact kontrolleri ve current-head
  required/observed CI kontrolleri geçti.
- Caller-created ve structural-copy `RESOLVED` girdileri XML veya byte üretilmeden
  mevcut deterministic authority error contract'ı ile reddedilir.
- Runtime default-OFF kalır; production activation, schema/migration, official-code
  mapping, M01 veya RECEIVABLE authority değişikliği yapılmamıştır.
