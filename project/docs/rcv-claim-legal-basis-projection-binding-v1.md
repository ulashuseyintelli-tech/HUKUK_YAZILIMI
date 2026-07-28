# RCV Claim Legal Basis Projection Binding V1

Status: `RATIFIED`

Contract: `RCV-CLAIM-LEGAL-BASIS-PROJECTION-BINDING`

Contract version: `1`

Projection schema version: `1`

Runtime: `DORMANT`

## Purpose

This contract closes the time-of-check/time-of-use gap between Claim Formation
admission and finalization. The exact Legal Basis release, Legal Basis entry,
Subtype Registry entry and every decision-driving projection value accepted at
admission are serialized once, checksum-bound and persisted with the immutable
intent. Finalization may create a ClaimItem only after the stored binding and a
fresh exact-version resolution are byte-exact equivalent.

This document does not create Legal Basis content, keys, signatures, a signed
release, a production resolver, runtime activation or a new database migration.

## Source-chain manifest

| Source | Canonical evidence | Authority/use in PB01 |
|---|---|---|
| Receivable Domain Law | `project/docs/governance/RECEIVABLE-GOVERNANCE.md` | Claim Formation and exact legal authority boundary |
| SR01 registry | `project/docs/governance/receivable-legal-subtype-registry-v1.json` | Registry V1, seven subtype entries and decision semantics |
| SR01 checksum | `project/docs/governance/receivable-legal-subtype-registry-v1.checksum.json` | Registry checksum `320f671e...6e64` |
| PB01 persistence foundation | migration `20260726120000_claim_formation_projection_binding_persistence` | Existing nullable triple, immutability and intent/snapshot equality |
| Admission | `human-claim-item-formation-admission.service.ts` | Exact source/basis resolution, eligibility and atomic intent input |
| Persistence adapter | `claim-item-formation-office-approval.adapter.ts` | Atomic intent + OfficeApproval insertion and idempotent replay |
| Finalizer | `transactional-claim-item-formation-finalizer.service.ts` | Exact re-resolution and transactional ClaimItem/snapshot write |
| Canonical serializer | `permission-diagnostics/guided-edge/canonical-json.ts` | Recursive key ordering, array-order preservation and SHA-256 |
| Historical residual closure | HCR-08 canonical closure | No blocking historical residual; PB01 selected next |

Historical analysis and superseded task records are provenance only. The live
repository, ratified governance and the sources listed above control.

## Current risk and closed gap

Before PB01, the intent pinned scalar Legal Basis/subtype identities but did not
pin the full decision projection. Finalization re-resolved the authority and used
the then-returned eight-field `claimItemProjection`. An unchanged identity with
changed evidence, liability, interest, amount, currency, calculation or ClaimItem
projection semantics could therefore alter the final result.

PB01 makes this drift fail closed. There is no `current`, `latest`, `default`,
nearest-version, alias or automatic-upgrade fallback.

## Payload and checksum boundary

The canonical payload is a closed object with four sections:

1. `authorityIdentity`
2. `decisionProjection`
3. `temporalContext`
4. `integrityMetadata`

The payload is serialized with the existing canonical JSON helper. Textual
semantic values are normalized to Unicode NFC and LF before serialization;
object keys are recursively lexicographic and array order remains meaningful.
The envelope checksum is lowercase SHA-256 over UTF-8 canonical payload bytes.

Included in the checksum:

- exact release, Legal Basis, registry and subtype identity;
- all decision projection fields, including all eight ClaimItem projection fields;
- authority effective-from/effective-until;
- contract, schema, serializer and checksum algorithm identity.

Excluded from the checksum:

- `admittedAt` (already immutable intent metadata and deliberately neutral for
  semantic idempotency);
- database IDs, row timestamps, trace/request IDs, paths and log metadata;
- the checksum itself.

The complete field treatment is in
`rcv-claim-legal-basis-projection-binding-v1-field-crosswalk.md`. The payload
shape is closed by `rcv-claim-legal-basis-projection-binding-v1.schema.json`.

## Admission contract

The admission sequence is:

1. resolve exact document and exact Legal Basis version;
2. verify release, registry, subtype and Legal Basis identities;
3. enforce component, source/evidence, liability and interest eligibility;
4. build the complete decision projection;
5. call the pure binding factory with explicit `admittedAt`;
6. include the binding checksum in the intent checksum;
7. insert the binding triple atomically with the immutable intent and
   OfficeApproval.

Missing/invalid identity, semantic mismatch, incomplete projection,
non-canonical payload or checksum failure rejects admission before the writer.
The factory performs no database, network, environment, clock or random access.

The same idempotency key is a replay only when the intent checksum and complete
binding triple are identical. A different authority or projection produces the
existing deterministic duplicate conflict and no partial write.

## Finalization contract

Before any resolver or financial write, finalization:

1. requires an all-present V1 binding triple;
2. verifies canonical payload, closed shape and checksum;
3. verifies the complete immutable intent checksum;
4. re-resolves only the exact pinned source and Legal Basis version;
5. applies the ratified lifecycle and eligibility rules;
6. recomputes the complete projection binding;
7. compares authority identity, canonical payload and checksum exactly;
8. creates ClaimItem, exact-copy snapshot, audit, event/outbox and completion
   state in the existing single transaction.

Every failure occurs before ClaimItem/snapshot creation. Existing transaction
rollback preserves zero partial ClaimItem, snapshot, audit, event and outbox
writes. Successful retries reconcile the existing exact snapshot and cannot
produce a second ClaimItem.

## Lifecycle

| State | Admission | Pending-intent finalization |
|---|---|---|
| `ACTIVE` | Allowed when effective and eligible | Allowed only on exact match |
| `SUPERSEDED` | New admission requires current explicit authority | Previously admitted exact version may finish when still resolvable, integrity-valid, not revoked and valid at admission |
| `REVOKED` / `ARCHIVED` | Denied | Denied |
| Not yet effective | Denied | Cannot arise from a valid admission |
| Expired after valid admission | N/A | Expiry alone does not invalidate; exact authority must remain resolvable, integrity-valid and not revoked |
| Unresolvable | Denied | Denied; no fallback |

This policy does not silently upgrade a pending intent.

## Snapshot and audit

`ClaimFormationSnapshot` copies the intent binding contract version, canonical
payload and checksum byte-for-byte. Existing database constraints enforce
all-null/all-present, immutability and intent/snapshot equality. The snapshot can
therefore explain the release, Legal Basis, registry, subtype and exact decision
projection even if a future authority source is unavailable.

## Legacy policy

An intent with all three binding columns `NULL` is `LEGACY / UNBOUND`. The PB01
finalizer returns `FORMATION_LEGAL_BASIS_BINDING_REQUIRED` before resolver or
write access. It may not infer a binding, use a newer authority or mutate/backfill
the row. Explicit re-admission is outside PB01.

## Security and compatibility

- Tenant/case/object-scope checks remain in the existing admission boundary.
- External errors remain typed but non-enumerating; no release content, PII,
  credentials, key material or production data is emitted.
- Production API, Web and controller surfaces are unchanged.
- Existing schema and migrations are unchanged by PB01.
- Historical records are not changed.
- Production resolver wiring and feature activation remain absent/default-disabled.

## Deferred work

The next eligible task after canonical PB01 closure is
`RCV-CLAIM-FORM-P02-S08-D02-KC01`. D02-F01, D02-I01/I02/I03, I04, I05,
production canary and containment retirement remain ineligible and require their
own owner authority.
