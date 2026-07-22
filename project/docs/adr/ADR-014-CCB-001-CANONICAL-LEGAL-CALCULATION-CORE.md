# ADR-014: CCB-001 Canonical Legal Calculation Core

**Status:** Accepted as binding direction; allocation-authority target amended 2026-07-18; legal-application cross-domain single-writer boundary and TPA-02 independent LegalApplicationBatch target persistence architecture ratified 2026-07-19; TPA-03 Option B two-file hybrid schema-foundation contract ratified and TPA-03A foundation closed 2026-07-20; TPA-04 Option C target-native plan-then-persist / dormant-first single-writer contract and TPA-04A receipt-bound snapshot/bucket identity contract ratified 2026-07-20; TPA-04B required-evidence schema-amendment contract ratified and exact two-file amendment closed/canonical via PR #1470 / `9dabe8db` 2026-07-21; TPA-04C pure `LegalApplicationPlan` builder contract OD-TPA-04C-01..20 ratified 2026-07-22; M2 live DB apply/post-validation completed with empty target tables and no runtime writer; Wave 0 and PR-1A/PR-1B/PR-2/PR-3h/PR-4/PR-5/PR-6/PR-7/PR-8a/PR-8b/PR-9/PR-10 historical closures preserved; Balance Engine target remains SHADOW_ONLY; PR #407 final disposition B / CLOSED UNMERGED / REQUIREMENTS PRESERVED / CODE DISCARDED; builder/writer runtime, replay, cutover, retirement and PR-11 remain unauthorized until separate owner GO
**Date:** 2026-07-05 (original direction); final numbering settled on `main` 2026-07-10 via owner arbitration (see Revision History for the full renumbering history — this document was briefly `ADR-013` for part of 2026-07-10)
**Deciders:** Owner - Ulas
**Related:** CCB-001, MPB-011, GOV-ADR-NAMING-000, ADR-010, ADR-012 (Waiting & Progress Policy — unrelated, no naming overlap), ADR-013 (Fee / Harç / Snapshot / Journal draft owner-review ADR; a related but separate architecture line, not a sub-component of this document), `balance-display-shadow-diff`, `balance-shadow-compare`, `InterestEngineService.computeBalance`, `ClaimItem`, `LedgerEntry`, `LedgerAllocation`, `CaseService.getCalculationSummary`

> **Reading note:** This ADR is the CCB-001 constitution. It locks the target architecture and the allowed implementation sequence. It does not authorize immediate cutover, UI switch, legacy deletion, snapshot creation, or hidden fallback.

> **Naming note (owner arbitration, 2026-07-10 — supersedes an earlier same-day decision):** This document originated on the isolated `codex/ccb-001-pr1-pr6-rescue` branch as a draft numbered `ADR-012-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`. That number collided with `ADR-012-WAITING-PROGRESS-POLICY.md`, which independently became canonical on `main` (PR #1002, `GOV-ADR-NAMING-000`). Two candidate resolutions were considered the same day: **Option C** — broaden `ADR-013`'s reserved scope to mean this document, folding Fee/Harç/Snapshot/Journal in as sub-components (briefly implemented, PR #1019, merged `0afc401a`) — and **a distinct-number option** — keep `ADR-013` narrowly reserved for Fee/Harç/Snapshot/Journal per `GOV-ADR-NAMING-000`'s original text, and give this document its own number. After a side-by-side comparison (scope/invariants/architectural consequences/backward compatibility/migration impact/future ADR space — invariant and normative-rule content is identical either way), the owner's final arbitration is: **this document is `ADR-014`; `ADR-013` remains the Fee/Harç/Snapshot/Journal architecture line, unchanged from `GOV-ADR-NAMING-000`'s original scope.** PR #1026 later created the ADR-013 draft owner-review document. Rationale (owner): the two architectures are genuinely separate decision spaces; the existing ADR set is composed of narrow, single-purpose documents and this precedent should hold; broadening `ADR-013` would have re-interpreted an already-merged `GOV-ADR-NAMING-000` decision without a compelling need to; two separate ADRs keep future changes and cross-references independently tractable. This correction fully supersedes the Option C text that briefly existed in this document as `ADR-013` between PR #1019 and this correction.

## Context

The owner decision is final:

- Canonical Balance Engine + Receivable snapshot + `LegalCalculationBucket` + TBK100 +
  Interest Engine is the long-term target single calculation authority for claim, case,
  and enforcement balance. ClaimItem is legal source/provenance/calculation input, not
  the target legal-application grain.
- Legacy `getCalculationSummary` is not long-term production authority.
- Immediate clean-break cutover is blocked until the canonical hardening PR chain passes.
- Production dual-authority balance is prohibited.

The current repository has canonical building blocks, shadow/diff infrastructure, and legacy production display paths. CCB-001 exists to move from that transitional state to one explainable legal calculation core.

## Decision

The product target is:

```text
Canonical Legal Calculation Core
```

Every production-displayed balance must be derived from the same canonical pipeline:

```text
Case / legal obligation data
-> ClaimItem legal source / provenance / calculation input
-> canonical Receivable snapshot
-> LegalCalculationBucket model
-> case-scoped payment entry
-> intra-case TBK100 LegalApplication
-> ApplicationAttribution to ClaimItem/source lineage
-> interest base mutation
-> interest engine
-> currency-aware legal balance
-> reversal/refund/cancel netting
-> fee projection layer
-> trace / allocation log
-> canonical balance DTO
-> API / UI / reports / documents / reconciliation
```

`computeBalance` is necessary but not sufficient by itself. Production authority requires the surrounding legal, trace, currency, fee, and DTO contracts.

**Scope boundary note (owner arbitration, 2026-07-10):** Fee Projection and the trace/AllocationLog/Snapshot layer below are pipeline steps *within this document's own CCB-001 scope* (unchanged from v1.0 — see Blocker Classification and Required PR Sequence). This is a narrower claim than "ADR-013's Fee/Harç/Snapshot/Journal architecture" — that is a separate, related but distinct draft owner-review architecture line, not a subsumed part of this document. See the Naming note above for the full history of this distinction.

## Allocation Authority Amendment — 2026-07-18

This amendment supersedes the target-authority interpretation that treated
ClaimItem-keyed `LedgerAllocation` as the target persisted legal allocation authority.
It does not erase or invalidate historical implementation/closure evidence.

1. `ClaimItem` is the legal receivable source, provenance source, and calculation input.
   It is not a direct payment or legal-application target.
2. The target legal-application grain is `LegalCalculationBucket`, produced from a
   canonical Receivable snapshot.
3. The canonical order remains
   `MASRAF → FERİ → FAİZ → ANA PARA`. Different currency, legal basis, effective date,
   interest rule, or priority contexts remain separate calculation sub-buckets.
4. `LegalApplication` is the receipt's legal effect on a calculation bucket.
   `ApplicationAttribution` explains that result against ClaimItem/source lineage.
   These are separate facts.
5. ClaimItem-keyed `LedgerAllocation` remains current AS-IS/legacy persistence and is not
   ratified as target legal authority.
6. `CollectionAllocation` remains compatibility projection only and cannot be legal or
   fallback authority.
7. `ClaimItem.collectedAmount` is a deprecated, non-authoritative derived cache. New
   consumers are prohibited.
8. Accrued and determinable interest through the enforcement date is an
   `ACCRUED_INTEREST` debt bucket. Future interest is an `InterestPolicy`/calculation
   rule, not a fixed-amount ClaimItem. Compound interest requires explicit legal basis.
9. The Balance Engine is the target canonical legal-calculation authority but remains
   `SHADOW_ONLY`. Authority promotion, consumer switch, and cutover are not authorized.
10. Target persistence likely requires schema/migration. Design and implementation are
    not authorized by this ADR amendment.

Package disposition is append-only:

```text
WS04-P01   AMENDMENT REQUIRED
WS04-P02   AMENDMENT REQUIRED
WS04-P03   SUPERSEDED / REQUIRES REDESIGN
WS04-P03-A CONFIRMED — SAFETY INFRASTRUCTURE ONLY
WS04-P03-B SUPERSEDED / DO NOT EXECUTE
```

ACT-28 and REC-AUTH-011/012 remain open. ClaimItem-keyed synthetic corpus,
representative replay, data access, production observation, schema/migration, cutover,
WS05, and WS06 remain on hard hold.

PR #407 is `HOLD / DO NOT MERGE`. It must not be directly rebased or merged. After this
amendment becomes canonical, a separate read-only semantic triage may classify it only
as `SUPERSEDED / CLOSE`, `PARTIALLY REUSABLE — SAFE PATCH EXTRACTION`, or
`COORDINATED REDESIGN REQUIRED`.

## RD01 Balance Exposure Projection Contract — 2026-07-19

Owner disposition for PR #407 is `COORDINATED REDESIGN REQUIRED`. No production code hunk
may be rebased, cherry-picked, or extracted; only its business-rule scenarios may inform
the redesigned contract. PR #407 remains `OPEN / HOLD / DO NOT MERGE / DO NOT REBASE /
DO NOT CLOSE YET`.

The target logical contract separates stable `bucketContextKey` from snapshot-specific
`bucketInstanceId`. The stable key binds category/subcategory, currency, legal basis,
effective date/period, interest rule and priority. The instance binds that context to
tenant/case, canonical Receivable snapshot, as-of date and calculation-rule version.
`sourceLineageSetRef` is mandatory; ClaimItem identity is not the application target.

Gross, legally applied and remaining exposure are reconciled per currency and category in
minor units. Costs, ancillaries, accrued interest and principal remain separate;
held/unapplied receipt is outside legal exposure. `LegalApplication` binds receipt effect
to bucket context plus the application-time snapshot, rule version and effective time.
`ApplicationAttribution` remains a separate, non-authoritative lineage fact; missing
attribution does not automatically void bucket-level application, but incomplete
trace/provenance prevents primary-eligible projection.

Public projection is limited to per-currency/category totals. Sub-bucket/source trace is
restricted diagnostic evidence. Missing or stale context returns typed `null` and
`UNAVAILABLE`, `NOT_COMPARABLE`, `STALE` or `FAIL_CLOSED`; it never returns a fabricated
zero. Projection authority vocabulary is
`SHADOW_ONLY | CANONICAL | LEGACY_COMPATIBILITY`, while the current Balance Engine value
remains only `SHADOW_ONLY`. Legacy deprecation, authority promotion, consumer switch and
cutover require explicit later gates.

TPA-02 target persistence analysis is owner-decided and recorded below. Schema/migration,
writer, replay/evidence, consumer cutover and retirement remain unauthorized. ACT-28 and
REC-AUTH-011/012 remain open.

## XD-001 Legal Application Boundary Decision — 2026-07-19

The owner-ratified constitutional boundary is:

1. Receivable owns canonical bucket semantics and legal-application policy.
2. Collection owns receipt lifecycle and deterministic execution orchestration inside the
   authorized transaction boundary.
3. Target legal-application persistence requires one logical writer and one canonical
   authority across the boundary. Permanent dual write or dual authority is prohibited.
4. `ClaimItem` is not an application target, payment-state source, or allocation authority.
   No new `ClaimItem.collectedAmount` reader or writer may be introduced.
5. `CollectionAllocation` cannot be an independent or fallback authority; it may survive
   temporarily only as a canonical-output-derived compatibility projection.
6. The physical persistence owner, aggregate, keys, relations, immutability, exact-cent
   reconciliation, idempotency and retention contract are deliberately unselected.

`TPA-02 — Target Persistence Architecture` is the next read-only owner-gated analysis.
`ApplicationBatch` is only one alternative to compare there; it is not a ratified aggregate,
canonical vocabulary requirement, schema direction, or implementation authorization.
ACT-28 and REC-AUTH-011/012 remain open until the target persistence and later cutover gates
are separately closed.

## TPA-02 Target Persistence Architecture Decision — 2026-07-19

The owner-ratified physical target is an independent aggregate:

```text
LegalApplicationBatch
  ├─ immutable LegalApplication[]
  └─ non-authoritative ApplicationAttribution[]
```

Receivable owns bucket/context/snapshot semantics and TBK100 allocation policy. Collection
owns receipt lifecycle, idempotency and outer transaction orchestration. The RCV-COL Legal
Application Boundary owns aggregate persistence. Its single logical writer is
`LegalApplicationWriter`, invoked only inside the canonical Collection transaction with the
existing transaction client. An independent endpoint or a separate/nested transaction is
prohibited.

Each `APPLY` batch corresponds to exactly one Collection receipt and must conserve exact
cents:

```text
receiptAmountMinor
=
Σ appliedAmountMinor
+ heldRemainderMinor
```

Replay authority is `tenantId + idempotencyKey + commandHash`. The same key/hash returns the
existing batch without a new write, audit or event. The same key with a different hash fails
closed. A full reversal is a linked append-only `REVERSAL` batch. Existing batches and
applications are never updated or deleted; partial reversal remains owner-gated. Tenant-safe
composite foreign keys and `ON DELETE RESTRICT` are mandatory. Historical guessing, silent
backfill, dual allocators and dual authority are prohibited.

Legacy disposition:

- `ClaimItem.collectedAmount`: frozen legacy cache; retirement required; no new reader/writer.
- `CollectionAllocation`: no independent authority; transitional projection derived only
  from the canonical result.
- `LedgerAllocation`: historical legacy record; prohibited as target-era authority.

The `codex/rcv-ws04-p03-syn-01` disposition, PR #407 hold/conflict, deterministic bucket
identity, representative replay/evidence and consumer-cutover authority remain blockers.
ACT-28 and REC-AUTH-011/012 remain open. TPA-03 schema-foundation analysis requires separate
owner `GO-ANALYZE`; implementation authority is `NONE`.

## TPA-03 Schema-Foundation Contract Decision — 2026-07-20

The owner ratified Option B — Two-File Hybrid Schema Foundation. The additive foundation uses:

```text
LegalApplicationBatch
  ├─ immutable LegalApplication[]
  └─ non-authoritative ApplicationAttribution[]

LegalApplicationBatchType:
  APPLY | REVERSAL

LegalApplicationComponentType:
  COST | ANCILLARY | ACCRUED_INTEREST | PRINCIPAL
```

Its future implementation scope is exactly two files: `schema.prisma` and one additive
`migration.sql`. It is writer-free, has no backfill, and cannot change runtime, consumer,
historical-data or legacy reader/writer behavior. Tenant-safe composite foreign keys,
`ON DELETE RESTRICT`, and UPDATE/DELETE immutability protection for batches/applications are
mandatory.

All amount fields contain positive minor-unit magnitudes; batch type carries direction.
`receiptAmountMinor` is the canonical Collection receipt magnitude for APPLY and the linked
original receipt magnitude for REVERSAL. The canonical conservation equation remains:

```text
receiptAmountMinor
=
SUM(appliedAmountMinor)
+ heldRemainderMinor
```

Foundation does not weaken this invariant, but aggregate-level enforcement is deferred to the
separate writer-stage contract. Replay uniqueness is `(tenantId, idempotencyKey)`. Same key and
same `commandHash` returns the existing batch with no new write; same key and different hash
fails closed. Full reversal is a linked append-only REVERSAL batch. Self-reversal and double
reversal are prohibited; partial reversal is not authorized.

`bucketContextKey` and `bucketInstanceId` are required, opaque and nonblank. Their generation
algorithm is a writer-stage decision. `ApplicationAttribution` remains non-authoritative; its
ClaimItem link and attributed amount are optional lineage/provenance only.

The `codex/rcv-ws04-p03-syn-01` worktree is non-blocking for TPA-03A schema foundation but
blocking for writer/evidence/cutover. PR #407 remains `HOLD / CONFLICTING / DO NOT MERGE /
DO NOT REBASE`. ACT-28 and REC-AUTH-011/012 remain open. TPA-03A requires separate owner
`GO-IMPLEMENT`; this decision does not authorize schema, migration or implementation.

## TPA-03A Schema-Foundation Implementation Evidence — 2026-07-20

Implementation PR #1449 / squash
`63f0b0ea2cbef3f5d106ae3dfd8be6b770b5229f` is `CLOSED / CANONICAL EVIDENCE`.
Its exact two-file diff is `project/apps/api/prisma/schema.prisma` plus
`project/apps/api/prisma/migrations/20260720174245_legal_application_batch_foundation/migration.sql`.
The additive, writer-free and no-backfill foundation creates `LegalApplicationBatch`,
immutable `LegalApplication` and non-authoritative `ApplicationAttribution` with tenant-safe
composite foreign keys, restrictive deletes, replay/reversal/nonblank-bucket/minor-unit row
guards and UPDATE/DELETE immutability triggers.

No runtime writer, feature flag, test, consumer, legacy-reader/writer or historical-data
behavior changed. Aggregate exact-cent conservation enforcement and bucket-key generation
remain deferred to the separately owner-gated writer contract. ACT-28 and REC-AUTH-011/012
remain open; PR #407 remains on hold and untouched; the synthetic-corpus worktree remains
blocking for writer/evidence/cutover. The next task is analysis-only
`TPA-04 — LegalApplicationWriter Contract Analysis`, requiring separate owner `GO-ANALYZE`.

## TPA-04 LegalApplicationWriter Contract — 2026-07-20

Owner ratifies **Option C — Target-Native Plan-Then-Persist / Dormant-First Single Writer**.
`LegalApplicationWriter` is the sole target persistence writer. Its only authoritative input is
an official canonical Receivable snapshot plus a Receivable-owned, target-native
`LegalApplicationPlan`. The writer does not calculate TBK100 policy and must not derive a target
plan from ClaimItem, `ClaimItem.collectedAmount`, `LedgerAllocation` or
`CollectionAllocation`.

The writer may be called only with the existing Prisma transaction client inside the canonical
Collection transaction. It has no independent endpoint, nested transaction or second writer,
and is not yet connected to the production Collection call chain. Production shadow persistence,
legacy-derived targets, dual authority and long-lived dual-write are prohibited.

An official canonical snapshot is required. `authority=NONE`, `snapshotAvailable=false`,
unavailable or stale snapshots, and unmapped components fail closed; none may be converted to
HELD. `bucketContextKey` identifies stable legal context and `bucketInstanceId` identifies the
snapshot-specific instance. Both are generated from versioned canonical serialization plus
SHA-256; ClaimItem identity is not a key input.

All amounts are `bigint` minor-unit magnitudes with one currency and minor-unit contract across
the batch. The invariant is:

```text
receiptAmountMinor
=
SUM(appliedAmountMinor)
+
heldRemainderMinor
```

Database aggregate-conservation enforcement must be installed by an owner-gated schema
amendment before the writer can persist. Replay authority is `tenantId + idempotencyKey`, with
`commandHash` comparison: same key/hash returns the existing batch with no new write, audit or
event; same key/different hash fails closed. A second APPLY for the same Collection under
another key is prohibited.

One APPLY batch corresponds to one Collection receipt and consumes only a target-native bucket
plan. It creates no ClaimItem-keyed allocation and does not mutate `collectedAmount`. Full
reversal is a separate owner-gated package: linked append-only REVERSAL, same-case advisory
lock and exact inverse of the original APPLY are required. Partial reversal remains
unauthorized.

Audit is transaction-bound and allowlist-only; replay emits no new audit/event/outbox. The
current `PAYMENT_RECEIVED` / `PAYMENT_REVERSED` chain is preserved. A public
`LEGAL_APPLICATION` event contract requires a separate owner gate.

Legacy runtime remains temporary authority until coordinated cutover. No new legacy reader or
writer may be opened; target persistence may not be derived from legacy `LedgerAllocation`.
`CollectionAllocation` may later exist only as a canonical-output-derived compatibility
projection, and `ClaimItem.collectedAmount` remains a frozen legacy cache. Consumer cutover is
a separate owner decision.

The physical `codex/rcv-ws04-p03-syn-01` worktree is preserved. Its ClaimItem-grain corpus is
legacy evidence only and is superseded for the target writer; it remains blocking for
writer/evidence/cutover until owner-gated redesign or retirement. PR #407 remains
`OPEN / HOLD / CONFLICTING / DO NOT MERGE / DO NOT REBASE`; code extraction is not authorized.
ACT-28 and REC-AUTH-011/012 remain open.

The ordered successor gates are:

1. `TPA-04A — Canonical Snapshot / Bucket Identity Contract`
2. `TPA-04B — Writer Evidence Schema Amendment`
3. `TPA-04C — Pure LegalApplicationPlan Builder`
4. `TPA-04D — Dormant LegalApplicationWriter`
5. `TPA-04E — Full Reversal Writer`
6. `TPA-04F — Representative Replay / Reconciliation Evidence`
7. `TPA-04G — Coordinated Writer / Consumer Cutover Decision`

Each successor is `OWNER GO REQUIRED / NOT AUTHORIZED`. This ratification changes no code,
test, schema, migration, runtime, feature flag, replay evidence, consumer or legacy surface.

## TPA-04A Canonical Snapshot / Bucket Identity Contract — 2026-07-20

Owner ratifies **Option C — Receipt-Bound Embedded Canonical Snapshot Envelope**.
`CanonicalReceivableApplicationSnapshotV1` is the only official narrow snapshot subtype
eligible as input to the target-native `LegalApplicationPlan`. Receivable owns its semantics;
the RCV-COL Legal Application Boundary owns embedded persistence in the
`LegalApplicationBatch` aggregate. General presentation, Fee/Harç, Journal and consumer
snapshot authority remain outside this ratification and open under ADR-013.

Snapshot eligibility requires all of the following:

1. tenant, case, target Collection and currency resolve to one trusted context;
2. the target receipt has passed canonical admission, idempotency and finality gates;
3. the target receipt is excluded from pre-application history and bucket balances;
4. `applicationEffectiveDate` comes only from COL/OD-03;
5. `confirmedAt`, `valueDate` and `externalSettledAt` remain provenance/lifecycle timestamps;
6. source/version set and hash are complete;
7. engine, rule, policy, rate, interpretation and bucket-identity versions are explicit;
8. COST, ANCILLARY, ACCRUED_INTEREST and PRINCIPAL completeness is explicit;
9. history is target-native or an owner-approved baseline, never guessed or silently backfilled;
10. the read is transaction-consistent for one as-of context.

The immutable envelope contains:

```text
contractVersion
serializationVersion
tenantId
caseId
targetCollectionId
currency
minorUnit
receiptAmountMinor
asOfDate
applicationEffectiveDate
historyBoundaryRef
engineVersion
calculationRuleVersion
policyVersion
rateTableVersion
interpretationProfileId
bucketIdentityVersion
sourceVersionSet
sourceVersionSetHash
canonicalBuckets
```

`minorUnit` is a required semantic input. A repository-wide hard-coded value of `2` is
prohibited unless a separately ratified single-currency contract proves it; writer-stage
currency/minor-unit validation must fail closed.

Snapshot identity is:

```text
canonicalEnvelopeBytes = RCV-CAS/v1 domain-restricted canonical JSON
snapshotHash = SHA-256("RCV-CAS/v1\0" + canonicalEnvelopeBytes)
snapshotRef  = "rcv-app-snapshot:v1:sha256:" + lowercaseHex(snapshotHash)
```

Serialization is RFC 8785-based, domain-restricted canonical JSON: UTF-8 without BOM, Unicode
NFC, no locale-dependent ordering, minor-unit integers serialized without floating point,
ISO `YYYY-MM-DD` dates, explicit null/absent rules and application ordering
`component order → priorityRank → bucketContextKey byte order`.
`generatedAt`, actor, correlation, display/free text, raw provider/bank payload, IBAN and
description are excluded from the hash.

`bucketContextKey = bctx:v1:sha256:<64-lowercase-hex>`. Its canonical inputs are
componentType, componentCode, currency, minorUnit, legalBasisRef/version, effective context,
interest rule/version, priority policy/version/rank and liability context. ClaimItem ID,
tenantId, caseId, snapshotRef, targetCollectionId, amount, sequence, actor, display label and
database insertion order are forbidden.

`bucketInstanceId = binst:v1:sha256:<64-lowercase-hex>`. Its canonical inputs are
identityContractVersion, tenantId, caseId, snapshotRef/hash, asOfDate,
calculationRuleVersion and `bucketContextKey`. Stable context identity may persist across
snapshots; instance identity changes with snapshot context. Both identities use versioned,
domain-separated SHA-256.

The Receivable-owned `LegalApplicationPlan` is a pure typed output using `bigint` minor units.
It contains no ClaimItem target and consumes no legacy allocation/cache authority. No plan is
emitted unless:

```text
receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor
```

Canonical typed fail-closed states are:

```text
SOURCE_VERSION_INCOMPLETE
FORMATION_CONTEXT_INCOMPLETE
POLICY_VERSION_MISSING
FEE_AUTHORITY_UNRESOLVED
BUCKET_CONTEXT_UNMAPPED
CURRENCY_OR_MINOR_UNIT_INVALID
HISTORY_BOUNDARY_UNAUTHORIZED
DUPLICATE_BUCKET_CONTEXT
SNAPSHOT_STALE
HASH_MISMATCH
SOURCE_CONCURRENCY_UNSAFE
```

Availability `NONE`, target-receipt inclusion, negative/float amount or conservation failure
also fails closed and is not converted to HELD.

TPA-04B required-evidence schema-amendment contract is ratified below. It is limited to the
snapshot/version evidence, canonical payload, bucket arithmetic evidence and aggregate
conservation constraints needed before any writer can exist. Its exact two-file implementation
is closed/canonical via PR #1470 / `9dabe8db`; no runtime writer or live-database apply was
authorized. PR #407 is closed unmerged under final disposition B and is not a code source; the
synthetic corpus remains blocking for writer/evidence/cutover; ACT-28 and REC-AUTH-011/012
remain open.

## TPA-04B Writer Evidence Schema Amendment Contract — 2026-07-20

Owner ratifies the **Two-File Required-Evidence Schema Amendment**. The future implementation
may change only `project/apps/api/prisma/schema.prisma` and one new `migration.sql`; it is
additive, writer-free and runtime-neutral. All new fields are required, default-free and
backfill-free. After table locks are acquired, the migration must fail closed if any foundation
table already contains a row; nullable transition, guessed backfill and historical inference are
prohibited.

`LegalApplicationBatch` must add:

```text
snapshotContractVersion
snapshotSerializationVersion
snapshotRef
snapshotHash
snapshotCanonicalPayload TEXT
sourceVersionSetHash
snapshotAsOfDate DATE
applicationEffectiveDate DATE
historyBoundaryRef
engineVersion
calculationRuleVersion
policyVersion
rateTableVersion
interpretationProfileId
bucketIdentityVersion
minorUnit
```

`LegalApplication` must add `componentCode`, `sourceLineageSetRef`, `bucketBeforeMinor` and
`bucketAfterMinor`. `ApplicationAttribution` remains unchanged and non-authoritative.
`snapshotCanonicalPayload` stores exact canonical bytes as PostgreSQL `TEXT`; JSONB storage is
prohibited. The DB may validate JSON syntax, unique object keys, required formats and relational
arithmetic, but canonical serialization and hash recomputation belong to the future writer.

Identity and format constraints are exact:

```text
snapshotContractVersion      = CanonicalReceivableApplicationSnapshotV1
snapshotSerializationVersion = RCV-CAS/v1
snapshotHash                 = 64 lowercase hexadecimal
sourceVersionSetHash         = 64 lowercase hexadecimal
snapshotRef                  = rcv-app-snapshot:v1:sha256:<snapshotHash>
bucketContextKey             = bctx:v1:sha256:<64-lowercase-hex>
bucketInstanceId             = binst:v1:sha256:<64-lowercase-hex>
```

Reference/version fields are trimmed and nonblank. `minorUnit` is required and is not a
repository-wide constant `2`. Existing replay, single-APPLY and double-reversal protections
remain. Within a batch, both `(tenantId, batchId, bucketContextKey)` and
`(tenantId, batchId, bucketInstanceId)` are unique; snapshot ref/hash are not global or
tenant-unique.

The amendment must enforce aggregate exact-cent conservation:

```text
receiptAmountMinor
=
SUM(appliedAmountMinor)
+ heldRemainderMinor
```

A fully HELD batch is valid with zero applications and
`heldRemainderMinor = receiptAmountMinor`. For APPLY,
`bucketBeforeMinor - bucketAfterMinor = appliedAmountMinor`; for REVERSAL,
`bucketAfterMinor - bucketBeforeMinor = appliedAmountMinor`. Full-reversal exact-inverse
matching remains deferred to TPA-04E.

This ratification creates no schema, migration, runtime writer, plan builder, feature flag,
replay execution, consumer cutover or legacy-remediation authority. PR #1469 is merged and is
not a schema-writer blocker. The physical synthetic-corpus worktree is non-blocking for the
schema amendment and remains blocking for writer/evidence/cutover. The next task is only
`TPA-04B-ENTRY — OWNER GO-VERIFY REQUIRED`; ACT-28 and REC-AUTH-011/012 remain open.

## TPA-04B Schema-Amendment Implementation Evidence — 2026-07-21

Implementation PR #1470 / squash
`9dabe8dbddecafad49dbe58958ef2c3642d14a01` is `CLOSED / CANONICAL EVIDENCE`.
Its exact two-file diff is `project/apps/api/prisma/schema.prisma` plus
`project/apps/api/prisma/migrations/20260721002219_legal_application_writer_evidence/migration.sql`.
The required, default-free and no-backfill evidence fields preserve canonical snapshot bytes as
PostgreSQL `TEXT`; enforce snapshot/hash/ref/minor-unit/nonblank formats, per-batch bucket
uniqueness, APPLY/REVERSAL bucket arithmetic, immutable UPDATE/DELETE protection and deferred
transaction-end conservation:

```text
receiptAmountMinor
=
SUM(appliedAmountMinor)
+ heldRemainderMinor
```

PostgreSQL 16 disposable-database apply, rollback and re-apply evidence passed, including the
nonempty-foundation hard stop and unchanged seeded-row hash. `ApplicationAttribution` is
unchanged. Runtime writer and backfill are absent; live/production database apply was neither
authorized nor performed. ACT-28 and REC-AUTH-011/012 remain open; the synthetic corpus remains
blocking for writer/evidence/cutover. The next task is analysis-only `TPA-04C — Pure
LegalApplicationPlan Builder Analysis`, requiring separate owner `GO-ANALYZE`.

## PR #407 Final Disposition B — 2026-07-20

Owner supersedes the prior `COORDINATED REDESIGN REQUIRED / KEEP OPEN` lifecycle decision:
PR #407 is closed unmerged, its code is discarded, and no hunk may be extracted or reused.
The requirements survive independently in RD01/TPA:

1. expose gross and remaining principal/interest separately;
2. never derive remaining principal as `totalDue - totalInterest`;
3. interest-only application does not reduce principal;
4. with no application, gross equals remaining in the same valid context;
5. missing, stale or unverified exposure is typed null and fail-closed, never zero;
6. exact-cent reconciliation includes cost and ancillary components;
7. held receipt remains outside exposure reconciliation; and
8. `claimRemaining = remainingPrincipal + remainingInterest` is not a general invariant,
   because cost and ancillary amounts may remain.

This disposition authorizes no runtime, test, schema, migration, writer, consumer or cutover
change. ACT-28, REC-AUTH-011/012, CAN-CUT-02 and TPA-04B+ remain open and owner-gated.

## Normative Rules

### MUST

1. Use canonical balance as the target single authority.
2. Keep standard manual payment entry case-scoped: the user opens a case and records payment into that case.
3. Apply TBK100 allocation inside the selected case in this order:

```text
costs / enforcement expenses / legal expenses
-> accessory claims / fer'i claims
-> accrued interest
-> principal
```

4. Reduce principal only when allocation reaches principal.
5. Reduce future interest base only by the principal-allocated amount and only from the allocation date forward.
6. Net reversal/refund/cancel effects deterministically:

```text
PAYMENT + matching REVERSAL = zero net legal effect
```

7. Fail closed on missing buckets, unresolved reversal relation, missing FX basis, missing required rate, non-deterministic allocation, missing caseId, or trace-generation failure for production display.
8. Keep foreign currency claims currency-aware. Do not apply TRY statutory interest to foreign-currency principal by default.
9. Produce an explainable trace for production-displayed balances.
10. Keep fee projection separate from core legal balance while presenting both through the canonical DTO.

### MUST NOT

1. Re-open the legacy vs canonical decision.
2. Keep legacy `getCalculationSummary` as independent production authority.
3. Create permanent production dual authority.
4. Implement automatic cross-case payment allocation in the standard manual payment workflow.
5. Silently skip payments when a currency has no matching claim bucket.
6. Switch UI/report/template production display before canonical hardening gates pass.
7. Delete legacy before adapter, fee projection, trace, and golden legal fixtures exist.
8. Create balance snapshots before reversal, NO_BUCKETS, TBK100, interest-base, and FX blockers are fixed.
9. Hide fallback behavior from API/UI/report consumers.

## Legacy Role

Legacy may survive only as:

```text
migration reference
golden fixture source
diagnostic comparison
compatibility wrapper
temporary fee projection reference until migrated
```

Legacy is forbidden as:

```text
production display authority
```

If a legacy endpoint name must remain for compatibility, its implementation must become a canonical + fee-projection wrapper.

## Payment Workflow Policy

Standard manual workflow:

```text
User opens Case A
-> user records payment in Case A
-> system validates receipt/file clues and warns if needed
-> user confirms case selection
-> payment persists with caseId = Case A
-> canonical engine applies TBK100 only inside Case A
```

Allowed warning/audit concepts:

```text
CURRENT_CASE_SELECTED
DEBTOR_DECLARED_THIS_CASE
DEBTOR_DECLARED_DIFFERENT_CASE_BUT_USER_OVERRIDDEN
NO_DECLARATION_USER_CONFIRMED
COURT_OR_OFFICE_DIRECTED
BANK_IMPORT_MANUAL_MATCH
```

Forbidden persisted behavior:

```text
SYSTEM_AUTO_ALLOCATED_TO_OTHER_CASE
```

TBK 101/102 is a warning, validation, receipt-check, suggestion, and audit layer for this workflow. It is not an automatic cross-case allocator for standard manual payment entry.

## Invariants

### Determinism

```text
I-01 Same input set -> same balance.
I-02 Event ordering is deterministic.
I-03 Same-day events have explicit tie-breakers.
I-04 Decimal and rounding rules are explicit.
I-05 Currency rules are explicit.
I-06 Date/timezone cutoffs are explicit.
I-07 Reversal is a compensating event and is netted.
I-08 Negative principal exists only through explicit overpayment modeling.
I-09 Overpayment does not corrupt principal or interest buckets.
I-10 UI balance = API balance = report balance.
I-11 Legal balance reconciles with accounting or explains the difference.
```

### TBK100 / interest base

```text
I-12 Partial payment must not reduce principal unless allocation reaches principal.
I-13 Payment allocated only to costs / fer'i / interest must not reduce future interest base.
I-14 Payment allocated partly to principal must reduce future interest base only by the principal-allocated amount.
I-15 Intra-case allocation order is costs -> fer'i -> accrued interest -> principal.
I-16 Principal allocation is forbidden while a higher-priority bucket remains open.
I-17 Allocation trace shows whether principal was touched.
```

### Currency

```text
I-18 Foreign currency principal must not use TRY statutory rate by default.
I-19 Foreign currency balance must show original currency and TRY equivalent basis.
I-20 FX date, FX source, settlement basis, and display basis are mandatory for production display.
I-21 Missing FX basis is fail-closed.
```

## Blocker Classification

| Topic | Class | Rule |
|---|---:|---|
| Reversal netting | CUTOVER BLOCKER | Cancelled payment must not keep reducing balance. |
| NO_BUCKETS silent skip | CUTOVER BLOCKER | Payment without claim bucket must not disappear. |
| TBK100 intra-case allocation | CUTOVER BLOCKER | Costs / fer'i / interest / principal order is mandatory. |
| Partial payment interest base | CUTOVER BLOCKER | Future interest base changes only by principal allocation. |
| Foreign currency / FX basis | CUTOVER BLOCKER | Currency-aware policy and TRY equivalent basis are required. |
| Fee projection | PRE-CUTOVER REQUIRED | Summary is incomplete without fees/cost projection. |
| Trace / AllocationLog | PRE-CUTOVER REQUIRED | Production display must be explainable. |
| UI legacy primary | PRE-CUTOVER REQUIRED | UI must consume canonical DTO before cutover. |
| Report/template separate formulas | PRE-CUTOVER REQUIRED | No independent formulas outside canonical DTO. |
| TBK101/102 full fallback | FUTURE / WARNING-AUDIT | Not an automatic manual-payment allocator. |
| Bankruptcy/concordat/ranking | FUTURE / GUARDED SCOPE | V1 may guard out of scope. |
| Bank import unmatched payments | FUTURE / DESIGN RESERVED | User matching required before case-scoped payment. |

## Required PR Sequence

This order is mandatory:

```text
PR-0  ADR / constitution documentation
PR-1A Reversal netting verification only
PR-1B Reversal netting fix
PR-2  NO_BUCKETS fail-closed
PR-3  TBK100 intra-case allocation hardening
PR-4  Partial payment interest-base mutation
PR-5  Enforcement date / pre-post interest
PR-6  Currency-aware foreign claim engine
PR-7  Fee Projection Layer
PR-8  Trace / AllocationLog / BalanceSnapshot
PR-9  Golden legal fixture matrix
PR-10 Canonical primary adapter
PR-11 UI/API/report/template switch
PR-12 Legacy fallback disable
PR-13 Shadow/diff cleanup
PR-14 Legacy quarantine/deletion
```

No PR may implement work from a later PR.

**Execution-order clarification (owner decision, 2026-07-11):** This numbered order is the canonical merge, governance-closure, and downstream-eligibility order. Independent workstreams may be analyzed, prepared, or developed on branches in parallel, but parallel preparation does not authorize an out-of-order canonical merge, governance closure, or downstream eligibility claim.

## Split-PR Plan Status (post-PR-10, 2026-07-12)

The direct-rescue disposition remains binding:

```text
DIRECT_RESCUE_MERGE_NO_GO / RESCUE_SOURCE_ONLY
```

Historical analysis inputs, preserved for traceability:

- Current main at analysis: `1f913d624e2cd014c6375aa7e0e0cfd8726726d3`.
- Rescue branch: `codex/ccb-001-pr1-pr6-rescue @ 961bbaf38d3ab1a7c7a691fbd56880ca3f6ffcc8`.
- Rescue branch drift at analysis: 7 commits ahead / 77 commits behind.
- Rescue branch diff at analysis: 72 files, +6623 / -1138.
- Merge-tree content conflicts were present in governance/support files; semantic drift was high in calculation, report, template, and UI authority surfaces.

The rescue branch is **not** a merge branch. It may only be used as a reference source for controlled rewrite or split-PR preparation. No rescue-branch runtime hunk is approved by this document.

Canonical completion state:

```text
Wave 0 (W0.1/W0.2/W0.3) → CLOSED / CANONICAL
REVERSAL method             → RESOLVED / CONDITIONAL OPTION B
PR-1A                       → CLOSED / CHARACTERIZATION CANONICAL
PR-1B                       → CLOSED / IMPLEMENTATION CANONICAL
PR-2                        → CLOSED / NO_BUCKETS FAIL-CLOSED CANONICAL
PR-3h                       → CLOSED / TBK100 CENT-HARDENING CANONICAL
PR-4                        → CLOSED / PARTIAL-PAYMENT INTEREST-BASE CANONICAL
PR-5                        → CLOSED / ENFORCEMENT-DATE PRE/POST INTEREST CANONICAL
PR-6                        → CLOSED / CURRENCY-ISOLATION FAIL-CLOSED CANONICAL
PR-7                        → CLOSED / FEE-PROJECTION PLUMBING FAIL-CLOSED CANONICAL
PR-8a                       → CLOSED / SNAPSHOT-READINESS CONSISTENCY CANONICAL
PR-8b                       → CLOSED / NON-OFFICIAL EXPLAINABILITY TRACE CANONICAL
PR-9                        → CLOSED / GOLDEN FIXTURE MATRIX CANONICAL
PR-10                       → CLOSED / ADDITIVE COMPATIBILITY ADAPTER CANONICAL
Runtime cutover             → NOT AUTHORIZED
Next eligible step          → `UNASSIGNED` owner cutover-authorization governance gate
PR-11 consumer switch       → NOT AUTHORIZED
```

PR-1B canonical behavior is limited to valid linked full reversals: matching `PAYMENT + REVERSAL` has net-zero legal effect, ledger provenance is preserved, malformed reversal remains fail-closed, and the real `CollectionService.create()` → `cancel()` → `CaseBalance` disposable-DB gate passed. Partial reversal/refund support, inferred matching, historical repair/backfill, and runtime authority promotion were not authorized.

PR-2 canonical behavior is limited to visibility and eligibility hardening for payment-effect groups with no calculable claim bucket: `CaseBalanceService` preserves the per-currency `result: null / skippedReason: NO_BUCKETS` evidence and additionally emits one deterministic case-level fatal blocker; display becomes `UNAVAILABLE / UNSAFE_FOR_PRIMARY_DISPLAY`, and scenario evidence carries the typed `NO_BUCKETS` blocker with sorted currency details. Normal bucket calculation, Collection writer behavior, ledger provenance, PR-1B reversal netting, schema/migrations, API/UI consumer selection, financial authority, and runtime cutover remain unchanged or unauthorized.

PR-3h canonical behavior is limited to the existing `AllocationEngineService.allocateSinglePayment()` R2/R3 hardening boundary: COST/ANCILLARY/INTEREST/PRINCIPAL component math uses the existing allocator-local `minor-unit.ts` cents conversion, negative direct payments are rejected before normalization, and stale SummaryEngine comments now report the already-canonical MASRAF → FER'İ → FAİZ → ANAPARA order. The core order did not change; competing allocator implementations were not unified or dispositioned. PR-2 `NO_BUCKETS`, PR-1B reversal netting, Collection writer behavior, schema/migrations, PR-4 interest-base mutation, financial authority, and runtime cutover remain unchanged or unauthorized.

PR-4 canonical behavior is limited to payment-aware interest accrual continuity inside `InterestEngineService.computeBalance()`: each claim accrues through the applicable payment boundary on its current principal, the existing TBK100 allocator applies COST → ANCILLARY → INTEREST → PRINCIPAL in cent-normalized form, and only the amount actually allocated to PRINCIPAL becomes the reduced base for later periods. Cost, ancillary, or interest-only allocation does not mutate principal. Same-day START_OF_DAY/END_OF_DAY policy, PR-3h cent normalization, PR-2 `NO_BUCKETS`, PR-1B reversal netting, tenant isolation, Collection writer behavior, schema/migrations, financial authority, and runtime cutover remain preserved or unauthorized.

PR-5 canonical behavior is limited to deterministic enforcement-boundary classification and aggregation inside the existing calculation authority: tenant-scoped `Case.caseDate` is carried as `CalculationRequest.enforcementDate`; variable-rate and fixed-rate periods split at the existing `[start, end)` boundary; PRE keeps its normally rounded value and any `TOTAL_ONLY` cent remainder is assigned deterministically to POST so `PRE + POST = totalInterest` in minor units. Payment before, on, or after enforcement continues to use the existing START_OF_DAY/END_OF_DAY and date+id policies, and only actual PRINCIPAL allocation mutates later interest base. PR-4/PR-3h/PR-2/PR-1B behavior, tenant isolation, Collection writer, schema/migrations, API/UI authority, financial authority, and runtime cutover remain preserved or unauthorized.

PR-6 canonical behavior is limited to exact currency-domain validation and per-currency isolation in the existing CaseBalance path: TRY/USD/EUR/GBP/CHF groups enter independent `computeBalance` calls; missing or unsupported currency never reaches rate lookup/calculation; payment-only currency mismatch remains `NO_BUCKETS` fail-closed and now carries a typed `CURRENCY_MISMATCH` display/evidence blocker; linked reversal currency mismatch retains PR-1B fatal netting semantics and now remains visible as a typed blocker. No cross-currency aggregation, normalization, conversion, fallback, new FX/rate authority, conversion-date/basis policy, schema/migration, or runtime cutover was introduced. Per-currency PR-5 PRE/POST reconciliation, PR-4 principal-only base mutation, PR-3h cent normalization, PR-2 `NO_BUCKETS`, PR-1B reversal behavior, and tenant isolation remain canonical.

PR-8a canonical behavior is limited to a read-only, non-official snapshot-readiness signal: reversal, `NO_BUCKETS`, TBK100 invalid-payment, interest-base/engine-unavailable and currency-integrity evidence form five typed blocker classes in mandatory deterministic order. Any blocker makes display `UNAVAILABLE / UNSAFE_FOR_PRIMARY_DISPLAY`, readiness `BLOCKED`, `snapshotAvailable=false` and primary-display eligibility false. With no blocker, existing `SHADOW_ONLY` behavior remains and readiness is still `UNSAFE` because no official snapshot exists. Scenario evidence now compares this signal without fabricating a snapshot. No trace/snapshot persistence, lifecycle/hash, schema/migration, writer, consumer switch, new authority or runtime cutover was introduced.

PR-8b canonical behavior is limited to an additive explainability read model on the existing CaseBalance display response: canonical allocation steps and interest segments are mirrored in deterministic currency-first/canonical-result order; principal final-state, interest segment, case-level cost/ancillary projection, and fee-projection sources remain separately identified. The accompanying snapshot DTO is explicitly `NON_OFFICIAL`, `authority=NONE`, `persisted=false`, contains no snapshot ID/hash/lifecycle authority, and preserves PR-8a readiness/blocker evidence without changing `snapshotAvailable=false`, display authority, legal totals, or consumer eligibility. No official snapshot persistence, schema/migration, writer, consumer switch, new financial authority, or runtime cutover was introduced.

PR-9 canonical behavior is limited to test/readiness evidence: the existing Wave 0 `ScenarioDefinition` remains the single scenario and expected contract for a 12-scenario golden fixture matrix. An in-memory twin and the real disposable-PostgreSQL materializer/`CaseBalanceService` path are normalized to integer cents while DB/generated identities and timestamps are excluded; expected-contract matching, exact twin equality and a second materialization run are all required. The matrix covers full and malformed reversal, `NO_BUCKETS`, TBK100/cent allocation, principal-only future interest-base mutation, enforcement PRE/POST reconciliation, multi-currency isolation/mismatch, fee projection states, blocker coverage 5/5, trace/non-official snapshot, tenant isolation and date+id ordering. The required persistence-only `Case.caseDate` default is normalized as `UNSPECIFIED` when the Wave 0 contract provides no enforcement date, so storage default is not promoted to legal evidence. No production calculation, writer, schema/migration, API/UI consumer, financial authority, official snapshot, or runtime-cutover behavior changed.

PR-10 canonical behavior is limited to an additive `canonicalCompatibility` payload on the existing calculation-summary response and additive per-currency display evidence. All legacy response fields and semantics remain unchanged. The adapter maps canonical gross/remaining principal, PRE/POST interest, payment, cost projection, currency groups, readiness/blockers, fee projection, trace and non-official snapshot without cross-currency aggregation or zero fallback. `NOT_CALCULATED`/`UNAVAILABLE` fee states remain typed; legacy/canonical numeric conflicts make the adapter `BLOCKED`. The adapter is permanently marked `ADDITIVE_SHADOW_ONLY`, `consumerSwitchAuthorized=false`, `primaryAuthorityPromoted=false` and `primaryDisplayEligible=false`; trace and non-official snapshot remain `authority=NONE / persisted=false`. No consumer switch, feature activation, API/UI rendering change, formula, financial authority, schema/migration, persistence, backfill or runtime cutover was introduced.

Remaining owner decisions and later gates:

- Duplicate TBK100 implementation disposition remains owner-held; PR-3h did not unify competing allocators.
- PR-7 projection-producer boundary with ADR-013; ADR-014 owns projection plumbing, while fee/harç policy remains ADR-013.
- Official snapshot persistence, hash, and lifecycle remain ADR-013 owner decisions; closed PR-8a is read-only readiness signaling and closed PR-8b is non-official diagnostic/trace plumbing only.
- Legal signoff refresh policy, monitoring, rollback, bake, and post-cutover acceptance metrics.
- Separate owner gates for PR-11, PR-12, and PR-14.

The post-PR-10 dependency chain is maintained in `docs/design/adr-014-split-pr-plan.md` v2.10. Cutover authorization is now the next eligible owner-gated step; PR-11 is not eligible until that decision closes. Cutover authorization, PR-11 stability verification, PR-12 bake verification, post-cutover verification, and final ADR closure remain `UNASSIGNED` until the owner assigns canonical IDs. DB-gated validation remains mandatory for each affected downstream gate.

## PR Work Protocol

Every CCB-001 PR must start with:

```text
# CCB-001 PR-N WORK PLAN

Current PR:
[PR number + title]

Allowed scope:
[...]

Forbidden scope:
[...]

Relevant owner policies:
[...]

Expected tests:
[...]

Stop conditions:
[...]

No out-of-scope work will be performed.
```

Every CCB-001 PR must end with:

```text
# CCB-001 PR-N COMPLETION REPORT

1. Scope compliance
2. Files changed
3. Behavior changed
4. Tests added/updated
5. Tests run
6. Invariants verified
7. Remaining blockers
8. Next PR recommendation
9. Out-of-scope findings
10. Verdict
```

## Stop Conditions

Stop with `BLOCKED`, `VERIFICATION REQUIRED`, or `OWNER DECISION REQUIRED` if any of these appear:

```text
1. Canonical calculation runs with missing required data.
2. Payment currency has NO_BUCKETS and system silently skips it.
3. Reversal netting is unclear.
4. PAYMENT + REVERSAL does not produce zero net legal effect.
5. TBK100 allocation order is broken.
6. Payment does not reach principal but principal decreases.
7. Payment reaches principal but future interest base does not decrease.
8. Foreign currency principal uses TRY statutory interest by default.
9. FX date/source/TRY equivalent is missing.
10. UI still reads legacy primary fields in a cutover PR.
11. Report/template uses separate formulas.
12. Allocation trace cannot be produced.
13. Summary is called complete without fee projection.
14. Legacy deletion starts early.
15. Snapshot is built on unverified or incorrect calculation.
16. Required behavior conflicts with owner legal policy.
```

## Report Application Compliance Check

Each CCB-001 PR completion report must include this checklist:

```text
# CCB-001 REPORT APPLICATION COMPLIANCE CHECK

A. Context lock
[ ] CCB-001 scope preserved.
[ ] Legacy vs canonical debate not reopened.
[ ] Only current PR scope implemented.
[ ] Future PR work not implemented early.

B. Owner policy compliance
[ ] Canonical target followed.
[ ] Legacy production authority not created.
[ ] Case-scoped payment workflow preserved.
[ ] Automatic cross-case payment allocation not implemented.
[ ] TBK100 intra-case allocation rule preserved.
[ ] Principal effect limited to principal allocation.
[ ] Currency-aware rule not violated.
[ ] Trace/audit requirement addressed or marked blocker.

C. Mathematical correctness
[ ] Same inputs -> same output invariant preserved.
[ ] Rounding/currency/date behavior not left ambiguous.
[ ] Reversal/refund/cancel tested or explicitly out of scope.
[ ] Overpayment not mixed into principal/interest buckets.

D. Legal defensibility
[ ] Legal basis of calculation stated.
[ ] Allocation legal basis produced or missing basis marked blocker.
[ ] UI/report/document effect evaluated.
[ ] Court/expert explainability risk stated.

E. Test compliance
[ ] Fail-first test written first when required.
[ ] Test commands run or non-run reason stated.
[ ] Red/green result reported.
[ ] Golden fixture impact stated.

F. Deletion safety
[ ] Legacy not deleted early.
[ ] Migration/golden/reference parts preserved.
[ ] Wrapper candidates separated.
[ ] Shadow/diff cleanup not done early.

G. Final verdict
Choose exactly one:
[ ] PR COMPLETE
[ ] PR INCOMPLETE
[ ] BLOCKED
[ ] VERIFICATION REQUIRED
[ ] OWNER DECISION REQUIRED

H. Next action
Recommend only the next approved PR in sequence.
```

## TPA-04C Pure LegalApplicationPlan Builder Contract — 2026-07-22

Owner, TPA-04C analizinin `A — READY FOR OWNER CONTRACT RATIFICATION` önerisini
`OD-TPA-04C-01..20` kararlarıyla ratifiye etmiştir. Bu bölüm pure plan-builder
sözleşmesinin tek tam canonical kaydıdır; aşağıdaki pointer kayıtları bu sözleşmeyi
genişletemez.

### OD-TPA-04C-01 — Builder ownership

Pure `LegalApplicationPlan` builder, Receivable-owned legal calculation authority ile
RCV-COL Legal Application Boundary içinde konumlanır. Collection receipt lifecycle,
admission, idempotency, outer transaction, actor/correlation ve audit/event/outbox
owner'ıdır. Builder DB/Prisma kullanmaz, transaction açmaz, persistence yapmaz ve
audit/event/outbox yazmaz.

### OD-TPA-04C-02 — Official snapshot producer

Official snapshot producer ayrı bir Receivable-owned component olacaktır. Current
`CaseBalanceService` DB/clock dependency, preview/shadow authority, number arithmetic ve
canonical-snapshot eksikliği nedeniyle doğrudan official producer olarak reddedilmiştir.
Snapshot producer implementation future owner-gated package'tır ve yetkili değildir.

### OD-TPA-04C-03 — Preview engine reuse

Existing Balance Engine, `CaseBalanceService` ve `ClaimBucketAssembler` doğrudan TPA-04C
builder olarak reuse edilmez. Yalnız policy intent, component-ordering semantics ve isolated
domain rules kanıt olarak incelenebilir. ClaimItem-grain allocation, ClaimItem-ID bucket
identity, DB/clock dependency, number/fixed-cent arithmetic ve preview-projection authority
yeni builder'a taşınamaz.

### OD-TPA-04C-04 — Component set

Closed component set ve canonical rank şudur: `COST=10`, `ANCILLARY=20`,
`ACCRUED_INTEREST=30`, `PRINCIPAL=40`. Unknown/unmapped component fail-closed'dur; skip,
fallback veya HELD dönüşümü yasaktır.

### OD-TPA-04C-05 — Exact money model

Arithmetic yalnız bigint-safe integer minor unit kullanır. Floating point ve implicit
`minorUnit=2` yasaktır. Persistence-compatible aralık `0..9223372036854775807`; JSON
boundary unsigned decimal integer string'dir. Leading plus, decimal, exponent, whitespace
ve leading-zero ambiguity reddedilir.

### OD-TPA-04C-06 — Application order

Deterministic sıra `component rank -> priorityRank -> bucketContextKey UTF-8 byte order`dır.
Locale-aware sort, ClaimItem-ID tie-break, insertion order ve DB-row order yasaktır.
Duplicate canonical identity tie-break değil hatadır.

### OD-TPA-04C-07 — Snapshot staleness

Staleness wall-clock tolerance ile belirlenmez. Expected `snapshotRef`, `snapshotHash`,
`sourceVersionSetHash`, `historyBoundary` ve `effectiveDate` değerlerinin exact equality'si
zorunludur. Mismatch `SNAPSHOT_STALE` veya ilgili deterministic error ile plan üretmeden
sonlanır. Arbitrary N-minute validity reddedilmiştir.

### OD-TPA-04C-08 — Effective date

Application effective date command ile canonical snapshot arasında exact equality taşır.
Timezone dönüşümü ve implicit today yasaktır; representation canonical ISO date contract'tır.

### OD-TPA-04C-09 — Cost/fee authority

`COST` yalnız official Receivable snapshot evidence'ından gelebilir. Builder fee tahmin
edemez; ClaimItem metninden, legacy allocation'dan veya default fee authority'den fee
türetemez. Eksik/belirsiz authority `FEE_AUTHORITY_UNRESOLVED` ile fail-closed'dur.

### OD-TPA-04C-10 — HELD semantics

Permitted closed reasons yalnız `NO_ELIGIBLE_OUTSTANDING` ve
`EXCESS_OVER_ELIGIBLE_OUTSTANDING`dır. HELD, valid snapshot ve authority sonrasında
uygulanabilir bucket bulunmayan gerçek remainder'dır. Snapshot unavailable/stale,
hash/ref mismatch, unsupported component, currency/minor-unit mismatch, missing fee authority,
duplicate identity, arithmetic veya policy/version mismatch HELD değildir; bunlar no-plan /
fail-closed sonucudur.

### OD-TPA-04C-11 — Zero receipt / zero buckets

`receiptAmountMinor <= 0` fail-closed'dur. Valid snapshot ile zero eligible positive bucket
full HELD (`NO_ELIGIBLE_OUTSTANDING`) üretebilir. Zero-balance bucket application row üretmez.

### OD-TPA-04C-12 — Plan identity

Builder deterministic `planFingerprint` üretir. `LegalApplicationBatch.id`,
`LegalApplication.id` ve `ApplicationAttribution.id` writer/orchestrator sorumluluğudur.
Fingerprint yalnız canonical authoritative plan facts'ten oluşur; actor, correlation ID,
generated DB ID, current time, runtime environment ve non-authoritative attribution ordering
girdi değildir.

### OD-TPA-04C-13 — Attribution

`ApplicationAttribution` optional ve non-authoritative'dir; yalnız legal source lineage
açıklayabilir. Amount, order, balance authority veya plan-success şartı olamaz.
`sourceLineageSetRef` Receivable-owned producer tarafından üretilir ve her
`LegalApplication` row'unda required evidence field'dır; attribution row'u optional kalır.

### OD-TPA-04C-14 — Canonical serialization

Current generic canonical-JSON helper doğrudan RCV-CAS/v1 authority değildir. Implementation
domain-restricted RCV-CAS/v1 serializer/validator kullanmalıdır: UTF-8, no BOM, Unicode NFC,
deterministic object-key order, duplicate-key rejection, strict integer-string profile,
explicit null-vs-absent, locale independence ve exact payload/hash/ref validation. Generic
helper yalnız bunların tamamı kanıtlanırsa reuse edilebilir.

### OD-TPA-04C-15 — Error model

Builder discriminated machine-readable union döndürür. Minimum canonical set:
`SNAPSHOT_UNAVAILABLE`, `SNAPSHOT_CONTRACT_UNSUPPORTED`,
`SNAPSHOT_SERIALIZATION_INVALID`, `SNAPSHOT_HASH_MISMATCH`, `SNAPSHOT_REF_MISMATCH`,
`SOURCE_VERSION_INCOMPLETE`, `FORMATION_CONTEXT_INCOMPLETE`, `POLICY_VERSION_MISSING`,
`FEE_AUTHORITY_UNRESOLVED`, `BUCKET_CONTEXT_UNMAPPED`, `BUCKET_IDENTITY_INVALID`,
`DUPLICATE_BUCKET_CONTEXT`, `CURRENCY_OR_MINOR_UNIT_INVALID`,
`EFFECTIVE_DATE_MISMATCH`, `HISTORY_BOUNDARY_UNAUTHORIZED`, `SNAPSHOT_STALE`,
`SOURCE_CONCURRENCY_UNSAFE`, `RECEIPT_AMOUNT_INVALID`, `AMOUNT_OUT_OF_RANGE`,
`CONSERVATION_FAILURE`, `DIRECTION_NOT_AUTHORIZED`, `TENANT_CONTEXT_MISMATCH` ve
`CASE_CONTEXT_MISMATCH`. Builder audit yazmaz. Orchestrator yalnız allowlisted error code ve
evidence reference taşır; raw canonical payload ve PII audit/log'a yazılmaz.

### OD-TPA-04C-16 — Reversal

Initial builder contract `APPLY ONLY`dir. Full reversal TPA-04E'ye deferred, partial reversal
yetkisizdir. Current legacy cancellation/reversal değişmez.

### OD-TPA-04C-17 — ClaimItem / legacy prohibition

Builder `ClaimItem.collectedAmount`, `LedgerAllocation`, `CollectionAllocation`, legacy
allocator output, legacy balance reconstruction, ClaimItem-targeted application veya
ClaimItem-ID bucket identity okuyamaz/üretemez. Legacy model unchanged/quarantined'dır;
cutover ve retirement ayrı owner-gated work'tür.

### OD-TPA-04C-18 — Input size guards

Canonical payload byte size, bucket/attribution count, `componentCode` length ve lineage-ref
length için explicit upper limits gerekir. Exact sayılar implementation öncesi repository
constraints ve operational evidence ile ayrı teknik öneride pinlenecektir. Pinlenene kadar
production-ready sayılamaz; bu implementation-detail gate'tir, architectural blocker değildir.

### OD-TPA-04C-19 — Implementation slices

Ratified sıra: `I01` contracts/branded types/money primitives; `I02` snapshot validation and
deterministic errors; `I03` pure APPLY ordering/exact-minor-unit allocation; `I04` HELD,
fingerprint and attribution isolation; `I05` unit/property/security tests; `I06` TPA-04B
persistence-compatibility contract tests; `I07` dormant integration seam. I01-I06 planned but
not implementation-authorized; I07 writer contract implementation, snapshot producer,
synthetic-corpus disposition ve writer/cutover gate'leri nedeniyle blocked'dır. Hiçbir slice
self-start edemez.

### OD-TPA-04C-20 — M2 live state

TPA-04B migration `20260721002219_legal_application_writer_evidence`, execution anchor
`9dabe8dbddecafad49dbe58958ef2c3642d14a01` ile live DB'ye uygulanmış ve post-validate
edilmiştir. Data/backfill `NONE`; `LegalApplicationBatch`, `LegalApplication` ve
`ApplicationAttribution` hedef tabloları `EMPTY`; runtime writer `NOT IMPLEMENTED / NOT
ACTIVATED`dır. Önceki “live DB apply NOT AUTHORIZED / NOT PERFORMED” ifadesi tarihsel
pre-apply durumudur ve bu kayıtla superseded'dır.

M2 live apply, ACT-28 veya REC-AUTH-011/012'yi kapatmaz; builder, writer, cutover veya legacy
retirement yetkisi vermez. Exact-cent persistence invariant'ı değişmez:

```text
receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor
```

### OD-TPA-04C-21 — I01 closure

`TPA-04C-I01 — CONTRACT TYPES / BRANDED MONEY PRIMITIVES`, implementation PR #1517 / squash
`568f76e1847d5ee0060e81d76996f8e2177bada1` ile `CLOSED / CANONICAL EVIDENCE`dır. Exact
four-file implementation scope, `57/57` targeted test, production type-check, API build ve
required CI `4/4 PASS` kanıtlanmıştır. Runtime davranışı değişmemiştir. Sonraki task yalnız
`TPA-04C-I02 — CANONICAL SNAPSHOT VALIDATION / DETERMINISTIC ERRORS`dır; bu docs kaydı I02
implementation yetkisi üretmez.

### OD-TPA-04C-22 — Hash preimage contract

RCV-CAS/v1 canonical hash preimage'ı korunur:

```text
UTF8("RCV-CAS/v1") || 0x00 || canonicalEnvelopeBytes
```

Hash exact preimage bytes üzerinde SHA-256'dır; çıktı 64 lowercase hexadecimal karakterdir.
Payload-only, parsed-object, pretty-printed, kabul sonrası normalize edilmiş, UTF-16,
platform-newline-dependent veya BOM-bearing hash reddedilir. Önceki/draft
`SHA-256(exact canonical payload bytes)` ifadesi bu kararla superseded'dır.

### OD-TPA-04C-23 — Hashed object boundary

Hash'e giren JSON bytes `canonicalEnvelopeBytes`tır; parse sonrası çıkarılan nested payload
değildir. Versioned canonical snapshot envelope, `CanonicalReceivableApplicationSnapshotV1`
tarafından tanımlanan bütün authoritative snapshot facts'i taşır. HTTP/transport metadata,
correlation/actor/generated IDs ve canonical snapshot fact'i olmayan timestamps hash'e girmez.

### OD-TPA-04C-24 — Domain separator

Domain separator ASCII/UTF-8 `RCV-CAS/v1` bytes'ı ve hemen ardından tam bir NUL byte `0x00`dır.
Trailing newline, BOM, farklı casing, whitespace, length prefix veya locale conversion yasaktır.

### OD-TPA-04C-25 — Snapshot payload size limit

`canonicalEnvelopeBytes` UTF-8 uzunluğu domain separator eklenmeden önce ölçülür. `0` byte
invalid; `1..1,048,576` byte geçerli; daha büyük değer
`SNAPSHOT_SERIALIZATION_INVALID / PAYLOAD_LIMIT_EXCEEDED`dır. Limit ortam değişkeni değildir;
gelecekteki artış versioned owner amendment gerektirir.

### OD-TPA-04C-26 — Bucket count limit

Canonical snapshot başına en fazla `10,000` bucket kabul edilir. Zero bucket, snapshot
readiness/evidence aksi halde geçerliyse mümkündür. Limit aşımı
`SNAPSHOT_SERIALIZATION_INVALID / BUCKET_LIMIT_EXCEEDED`dır.

### OD-TPA-04C-27 — Attribution count limit

Attribution evidence canonical snapshot envelope içindeyse üst sınır `50,000` entry'dir.
Attribution snapshot contract'ının parçası değilse bu limit yalnız sonraki attribution-specific
input contract'ına uygulanır. Attribution non-authoritative kalır; legal amount, component order,
bucket balance veya plan validity authority'si olamaz.

### OD-TPA-04C-28 — String length limits

NFC olduğu doğrulanmış input üzerinde Unicode code-point sayısıyla şu üst sınırlar uygulanır:

| Alan | Maksimum |
|---|---:|
| `componentCode` | 128 |
| `sourceLineageSetRef` | 512 |
| `historyBoundaryRef` | 512 |
| `legalBasisRef` | 512 |
| `effectivePeriodRef` | 256 |
| `interestRuleRef` | 256 |
| version identifier alanları | 128 |
| `tenantId` / `caseId` / `collectionId` / `idempotencyKey` | I01 daha strict değilse 256 |

Free text canonical authority field'larında yasaktır. JavaScript UTF-16 code-unit length hukuki
ölçüm değildir; ayrıca bütün envelope için 1 MiB UTF-8 byte sınırı uygulanır.

### OD-TPA-04C-29 — Nesting depth limit

Canonical JSON maksimum nesting depth `32`dir. Aşım
`SNAPSHOT_SERIALIZATION_INVALID / MAX_DEPTH_EXCEEDED` üretir.

### OD-TPA-04C-30 — JSON member / array safety

Duplicate object member names reddedilir. Versioned contract object'lerinde unknown fields,
missing required fields ve contract'ın açıkça izin vermediği null reddedilir. Optional field
yalnız contract optional işaretliyorsa absent olabilir. Branded evidence/reference/version
alanlarında empty string yasaktır; empty array yalnız domain contract izin veriyorsa mümkündür.

### OD-TPA-04C-31 — Null vs absent

Required property mevcut ve non-null olmalıdır. Optional property değeri yoksa property absent
olmalıdır; optional property için null placeholder yasaktır. Böylece aynı logical state için
birden fazla canonical encoding oluşamaz.

### OD-TPA-04C-32 — Integer representation

Bütün minor-unit integer değerleri canonical JSON'da unsigned decimal string'dir. `0`, `1`,
`10` ve `9223372036854775807` kabul edilir. `-0`, `+1`, leading zero, decimal, exponent,
whitespace, empty, negative veya PostgreSQL signed BIGINT maksimumunu aşan değer reddedilir.

### OD-TPA-04C-33 — Unicode policy

Canonical input object property adları ve string değerleri önceden Unicode NFC olmalıdır.
Non-NFC input reddedilir; sessiz normalize edip kabul etmek yasaktır.

### OD-TPA-04C-34 — Validation error precedence

I02 deterministic first-error contract'ı dışarıdan gözlemlenebilir ve şu sırayı izler:

```text
01 envelope presence/basic type
02 payload byte limit
03 JSON syntax/duplicate keys/depth
04 contract version
05 serialization version
06 command direction
07 primitive formats
08 tenant/case binding
09 currency/minorUnit binding
10 effective-date binding
11 history-boundary binding
12 source-version binding
13 schema/unknown/missing/null validation
14 Unicode NFC
15 integer-string rules
16 bucket count
17 bucket structural validation
18 duplicate bucket identities
19 canonical envelope reserialization
20 exact byte equality
21 domain-separated hash computation
22 snapshotHash equality
23 snapshotRef/hash equality
24 success
```

### OD-TPA-04C-35 — Limit error surface

Yeni broad public error-code family eklenmez. Limit hataları
`SNAPSHOT_SERIALIZATION_INVALID` altında şu allowlisted machine-readable reason'lara map edilir:
`PAYLOAD_LIMIT_EXCEEDED`, `BUCKET_LIMIT_EXCEEDED`, `ATTRIBUTION_LIMIT_EXCEEDED`,
`STRING_LIMIT_EXCEEDED`, `MAX_DEPTH_EXCEEDED`. Safe metadata yalnız field/path, configured
maximum ve actual numeric size/count taşıyabilir; payload, free text, PII, ClaimItem açıklaması
ve raw serialized fragment taşıyamaz.

### OD-TPA-04C-36 — I02 entry gate

I02 yalnız I01 closure, next-task transition, OD-TPA-04C-22..35 ratification, stale hash
ifadelerinin supersession'ı, explicit limitlerin docs-only merge'i, fresh collision check ve
ayrı owner `GO-IMPLEMENT` sonrasında implementation-eligible olur. I03-I07, runtime writer,
snapshot producer, allocation, persistence, replay, cutover ve retirement yetkisiz kalır.

TPA-04C-I01 `CLOSED / CANONICAL EVIDENCE`; sıradaki tek owner-gated görev
`TPA-04C-I02 — CANONICAL SNAPSHOT VALIDATION / DETERMINISTIC ERRORS`dır. I02
`NOT STARTED / NOT AUTHORIZED`; ayrı `OWNER GO-IMPLEMENT REQUIRED`dır.

### TPA-04C-I02 implementation closure evidence — 2026-07-22

TPA-04C-I02 implementation PR #1520 / squash
`d46df4cec753b03bebcaefd07e5540dcb2b97709`, exact seven-file scope, I01+I02
`113/113` targeted test ve required CI `4/4 PASS` ile canonical main'dedir. Implementation;
strict duplicate-key-safe parsing, domain-restricted canonical serialization, exact
`SHA-256(UTF8("RCV-CAS/v1") || 0x00 || canonicalEnvelopeBytes)` binding'i, bounded deterministic
first-error validation ve opaque/non-forgeable `ValidatedCanonicalSnapshotV1` boundary'sini
OD-TPA-04C-21..36 ile uyumlu biçimde kurmuştur.

Bu compliance evidence yeni owner kararı değildir ve OD-TPA-04C-01..36'yı değiştirmez.
Allocation, HELD reason, plan fingerprint, attribution, writer, persistence, runtime wiring,
schema, migration, backfill veya live-DB action yoktur. ACT-28 ve REC-AUTH-011/012 `OPEN`;
runtime writer `NOT IMPLEMENTED / NOT ACTIVATED`; synthetic corpus writer/evidence/cutover için
`BLOCKING` kalır. Sonraki owner-gated slice `TPA-04C-I03 — PURE APPLY ORDERING /
EXACT-MINOR-UNIT ALLOCATION CORE`; ayrı owner `GO-IMPLEMENT REQUIRED / NOT YET AUTHORIZED`dır.
I04-I07 self-start etmez.

## Consequences

### Positive

- One legal calculation authority becomes the explicit product target.
- Implementation order is constrained enough to prevent unsafe UI or legacy cleanup jumps.
- Reversal, NO_BUCKETS, TBK100, interest-base, FX, fee, and trace risks are treated as gates, not later polish.

### Negative

- Cutover becomes a multi-PR hardening program.
- UI/API/report consolidation must wait for legal calculation gates.
- Legacy code may remain temporarily as fixture, adapter, or diagnostic reference.

### Neutral

- This ADR changes no runtime behavior by itself.
- Existing shadow/diff tooling remains diagnostic until the required gates are closed.

## References

- `project/apps/api/src/modules/interest-engine/interest-engine.service.ts`
- `project/apps/api/src/modules/interest-engine/orchestration/case-balance.service.ts`
- `project/apps/api/src/modules/interest-engine/orchestration/case-balance-display.ts`
- `project/apps/api/src/modules/balance-display-shadow-diff`
- `project/apps/api/src/modules/case/case.service.ts`
- `project/apps/web/src/components/finance/HesapOzetiPanel.tsx`
- `project/apps/web/src/hooks/useCaseCalculation.ts`
- ADR-010: AccountingJournal North-Star Source of Truth
- ADR-013: Fee / Harç / Snapshot / Journal draft owner-review architecture (separate from this document, see GOV-ADR-NAMING-000 and `ADR-013-FEE-HARC-SNAPSHOT-JOURNAL.md`)
- CCB-001 Constitution Report, 2026-07-05
- GOV-ADR-NAMING-000 (`decision-log.md`, 2026-07-09): established `ADR-012` = Waiting & Progress Policy on `main`, reserved `ADR-013` for the Fee/Harç/Snapshot/Journal line
- CCB-001 Branch Merge Reconciliation — Owner Arbitration (`decision-log.md`, 2026-07-10): final numbering decision (this document is `ADR-014`; `ADR-013` remains reserved per `GOV-ADR-NAMING-000`'s original scope), superseding the brief Option C interpretation

## Revision History

| Date | Version | Change |
|---|---|---|
| 2026-07-05 | 1.0 | Initial CCB-001 constitution ADR, drafted on isolated `codex/ccb-001-pr1-pr6-rescue` branch as `ADR-012-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`. Canonical target accepted, immediate cutover blocked, hardening PR sequence locked. |
| 2026-07-10 | 1.1 (superseded same day) | Briefly created on `main` as `ADR-013-CANONICAL-LEGAL-CALCULATION-CORE.md` (PR #1019, Option C): `ADR-013`'s reserved scope was broadened to mean this document, with Fee Projection/Snapshot/Journal/tariff-classification framed as sub-components. No substantive rule/invariant/PR-sequence content changed from v1.0. |
| 2026-07-10 | 1.2 | Owner arbitration superseded v1.1 the same day: this document is renumbered to **`ADR-014`**; `ADR-013` reverts to its original `GOV-ADR-NAMING-000` scope (Fee/Harç/Snapshot/Journal architecture, a separate document). Rationale: the two architectures are separate decision spaces; existing ADRs are narrow/single-purpose by precedent; two independent ADRs keep future changes and cross-references tractable. No substantive rule/invariant/PR-sequence content changed from v1.0 — only the title, number, and framing paragraphs changed across v1.1 and v1.2. CCB-001 branch implementation itself remains unmerged; this file establishes the architecture record on `main` independent of that merge. |
| 2026-07-10 | 1.3 | Split-plan status added: direct merge of `codex/ccb-001-pr1-pr6-rescue @ 961bbaf3` is **NO-GO**; the branch is rescue/evidence source only. Runtime cutover remains blocked until scenario infrastructure, REVERSAL owner decision, PR-1A..PR-9 revalidation, and DB-gated validation close. Also updates stale ADR-013 wording now that ADR-013 exists as draft owner-review ADR. |
| 2026-07-11 | 1.4 | Post-PR-1B governance reconciliation: W0.1/W0.2/W0.3, Conditional Option B, PR-1A, and PR-1B are recorded CLOSED/CANONICAL; PR-2 is the next unresolved technical slice. Owner clarified that parallel work is preparation/branch parallelism only, while canonical merge, governance closure, and downstream eligibility follow the mandatory order. Runtime cutover remains not authorized. |
| 2026-07-11 | 1.5 | PR-2 governance closure: payment-effect `NO_BUCKETS` is recorded as a deterministic fatal/display/evidence blocker; PR #1104 and squash `11023234457e57bdad108b0fb753a9892389ee4c` are canonical. PR-3h becomes next eligible only after this separate register closure; runtime cutover remains not authorized. |
| 2026-07-11 | 1.6 | PR-3h governance closure: AllocationEngine R2 cent-normalization, R3 negative-payment guard, and reporting-order correction are canonical via PR #1101 / squash `566ae47a26e505a79ba8867b3c21c5f724c3b1ef`. Duplicate allocator disposition remains unresolved and out of scope; PR-4 becomes next eligible only after this separate register closure; runtime cutover remains not authorized. |
| 2026-07-11 | 1.7 | PR-4 governance closure: payment-aware sequential accrual reduces the future interest base only by actual principal allocation via PR #1109 / squash `77a4ca353cbbc7687deb44d9eb794a3df511967c`. Cost/ancillary/interest-only payment leaves principal unchanged; cent and same-day policy remain canonical. PR-5 becomes next eligible only after this separate register closure; runtime cutover remains not authorized. |
| 2026-07-11 | 1.8 | PR-5 governance closure: tenant-scoped `Case.caseDate` now drives existing PRE/POST enforcement classification; variable and fixed-rate periods split at the enforcement boundary and minor-unit phase totals reconcile exactly via PR #1113 / squash `6df5560bbab79a1314c41aadd412b6497d1f23af`. PR-4 principal-only future-base mutation and prior fail-closed behavior remain canonical. PR-6 becomes next eligible only after this separate register closure; runtime cutover remains not authorized. |
| 2026-07-11 | 1.9 | PR-6 governance closure: exact canonical currency validation and per-currency CaseBalance isolation are canonical via PR #1118 / squash `371a6552717f6bc01ba4084450e45b5a4986cb1e`. Missing/unsupported and payment/reversal mismatch currency evidence is fail-closed; no conversion, new FX/rate authority, schema, or runtime cutover was introduced. PR-7 becomes next eligible only after this separate register closure. |
| 2026-07-11 | 2.0 | PR-7 governance closure: persisted tenant/case-scoped ClaimItem projection evidence is carried through a typed per-currency fee projection DTO via PR #1120 / squash `a3bfb26b719fe9dbf7cd9f197305ed7709867b5e`. Missing, invalid, unsupported, mismatched or legal-balance-blocked projection data returns deterministic `NOT_CALCULATED`/`UNAVAILABLE` evidence and never a zero fallback. Cross-currency totals/conversion, fee/harç formula or policy, new financial authority, official persistence, consumer promotion and runtime cutover were not introduced. PR-8a becomes next eligible only after this separate register closure. |
| 2026-07-11 | 2.1 | PR-8a governance closure: the five ADR-014 snapshot-readiness blocker classes and authority/snapshot/display/evidence consistency are canonical via PR #1125 / squash `ce40d98a47fcf77431468275a993e4f2a0255276`. The signal is read-only and non-official; no snapshot persistence/hash/lifecycle, trace layer, schema, writer, authority promotion or runtime cutover was introduced. PR-8b becomes next eligible only after this separate register closure. |
| 2026-07-11 | 2.2 | PR-8b governance closure: deterministic allocation/interest explainability trace and an ephemeral non-official snapshot DTO are canonical via PR #1128 / squash `995333a77aba63ad8c3b093d714ba6c529f13485`. Both DTOs carry `authority=NONE` and `persisted=false`; PR-8a blocker/readiness and display authority remain unchanged. Official persistence/hash/lifecycle, schema, writer, consumer switch, new authority and runtime cutover were not introduced. PR-9 becomes next eligible only after this separate register closure. |
| 2026-07-11 | 2.3 | PR-9 governance closure: the existing Wave 0 scenario contract now drives a 12-scenario golden fixture matrix via PR #1132 / squash `6ca5b6333abdc288bb6001e794230501fb1178f6`. Unit and disposable-PostgreSQL observations use one cent-normalized expected contract, exact twin comparison and repeatability gate; blocker coverage is 5/5. Runtime calculation, schema/migration, writer, API/UI, official snapshot and financial authority remain unchanged. PR-10 becomes next eligible only after this separate register closure. |
| 2026-07-12 | 2.4 | PR-10 governance closure: PR #1137 / squash `681203fad25ffd6e2e51f3c92e4656b0c853a6f8` adds a typed, additive, shadow-only calculation-summary compatibility adapter while preserving every legacy field. Canonical per-currency balance, fee status, blocker/readiness, trace and non-official snapshot evidence remain lossless; conflicts fail closed. Consumer switch, primary authority promotion and runtime cutover remain unauthorized. The next eligible step is the owner-gated cutover-authorization decision; PR-11 does not start automatically. |
| 2026-07-18 | 2.5 | Allocation-authority amendment: ClaimItem source/input is separated from target `LegalCalculationBucket`; `LegalApplication` and `ApplicationAttribution` are distinct; current ClaimItem-keyed Ledger persistence is legacy AS-IS rather than target authority. Balance Engine remains TARGET/SHADOW_ONLY; P01/P02 require amendment, P03 is superseded/redesign-required, P03-A remains safety infrastructure only, P03-B must not execute. PR #407 is HOLD/DO NOT MERGE. Schema/migration design, data/replay, PR-11 and cutover remain unauthorized. |
| 2026-07-19 | 2.6 | RD01 balance-exposure contract: stable bucket context and snapshot instance are separated; per-currency/category gross-applied-remaining amounts, LegalApplication identity, non-authoritative attribution, typed-null/fail-closed availability and restricted sub-bucket/source trace are ratified. PR #407 remains OPEN/HOLD; current authority remains SHADOW_ONLY; target persistence analysis is read-only authorized, design/implementation/cutover are not. |
| 2026-07-19 | 2.7 | XD-001 legal-application boundary: Receivable owns bucket/policy, Collection owns receipt/execution orchestration, and target persistence is a single-writer cross-domain boundary. Physical persistence and aggregate selection remain open for TPA-02; `ApplicationBatch` is an unselected analysis alternative only. |
| 2026-07-19 | 2.8 | TPA-02 target persistence architecture: independent `LegalApplicationBatch`, immutable bucket-effect `LegalApplication`, non-authoritative `ApplicationAttribution`, single `LegalApplicationWriter` inside the canonical Collection transaction, exact-cent conservation, key+hash replay, append-only full reversal, tenant-safe restrictive FK and legacy-disposition contract are ratified. ACT-28/REC-AUTH-011/012 remain open; implementation/cutover remain unauthorized. |
| 2026-07-20 | 2.9 | TPA-03 Option B schema-foundation contract: exact two-file additive/writer-free/no-backfill scope, model/enum names, positive minor-unit amount semantics, tenant-safe restrictive FK, immutability, replay/reversal and opaque bucket-identity boundaries are ratified. Exact-cent enforcement remains deferred to the writer stage; TPA-03A requires separate owner GO-IMPLEMENT. |
| 2026-07-20 | 3.0 | TPA-03A schema-foundation closure: PR #1449 / `63f0b0ea` establishes the exact two-file additive/writer-free/no-backfill persistence foundation. Runtime writer, conservation enforcement, replay/evidence, cutover and retirement remain unauthorized; ACT-28/REC-AUTH-011/012 remain open. |
| 2026-07-20 | 3.1 | TPA-04 Option C writer contract: official canonical Receivable snapshot plus target-native `LegalApplicationPlan` is the sole writer input; `LegalApplicationWriter` is dormant-first and transaction-bound. Snapshot/bucket SHA-256 identity, bigint conservation, replay, APPLY/full reversal, audit and fail-closed legacy coexistence are ratified. TPA-04A..G remain separately owner-gated and implementation is not authorized. |
| 2026-07-20 | 3.2 | TPA-04A Option C receipt-bound embedded `CanonicalReceivableApplicationSnapshotV1`: exact eligibility/envelope, RCV-CAS/v1 serialization/hash, deterministic bucket identities, fail-closed readiness and pure `LegalApplicationPlan` input are ratified. Broader ADR-013 and TPA-04B+ implementation remain owner-gated. |
| 2026-07-20 | 3.2 compliance update | PR #407 final disposition B supersedes its prior keep-open lifecycle decision: CLOSED UNMERGED, requirements preserved in RD01/TPA, code discarded, extraction/reuse prohibited. No architecture version or implementation authority changes. |
| 2026-07-20 | 3.3 | TPA-04B required-evidence schema-amendment contract: required/default-free/no-backfill snapshot and bucket evidence fields, canonical TEXT payload, exact identity formats, per-batch bucket uniqueness, arithmetic checks and DB aggregate conservation are ratified. Implementation remains exact-two-file and owner-gated through TPA-04B-ENTRY. |
| 2026-07-21 | 3.3 compliance update | TPA-04B schema-amendment closure: PR #1470 / `9dabe8db` establishes the exact two-file required-evidence amendment with PostgreSQL 16 apply/rollback/re-apply evidence. Runtime writer, live DB apply, replay, cutover and retirement remain unauthorized; ACT-28/REC-AUTH-011/012 remain open. |
| 2026-07-22 | 3.4 | TPA-04C pure LegalApplicationPlan builder contract ratified through OD-TPA-04C-01..20. Builder is Receivable-owned, pure/APPLY-only, deterministic and exact-minor-unit; legacy allocation and ClaimItem payment-state dependencies are prohibited. M2 live apply/post-validation is recorded with empty target tables and no runtime writer. I01 is owner-gated and not authorized. |
| 2026-07-22 | 3.5 | TPA-04C-I01 closure evidence (PR #1517 / `568f76e`) and OD-TPA-04C-21..36 I02 technical amendment are ratified. Domain-separated envelope hash, explicit input limits, null/absent and deterministic validation precedence are canonical; I02 remains separately owner-gated and not authorized. |
| 2026-07-22 | 3.6 compliance update | TPA-04C-I02 implementation closure: PR #1520 / `d46df4ce` establishes the exact seven-file strict snapshot-validation boundary with 113/113 targeted tests and CI 4/4 PASS. Runtime/schema/migration/live-DB impact is none; I03 becomes the next separately owner-gated slice. |
