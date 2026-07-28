# PB01 V1 Disposition Matrix

External failure responses use the existing non-enumerating Claim Formation
error taxonomy. The semantic distinctions below remain internally testable. All
denied finalization outcomes prohibit ClaimItem, snapshot, audit, event and
outbox writes.

| Condition | Admission Result | Finalization Result | ClaimItem Created | Snapshot Created | Retry Behavior | Disposition |
|---|---|---|---|---|---|---|
| Valid exact active binding | ACCEPT | FINALIZE | YES | YES, exact copy | Idempotent replay returns same result | ALLOW |
| Binding triple absent on canonical new admission | REJECT | N/A | NO | NO | Correct request required | INVALID_FORMATION_CONTEXT |
| Legacy all-null pending intent | Historical/readable | REJECT before resolver | NO | NO | Explicit re-admission required | FORMATION_LEGAL_BASIS_BINDING_REQUIRED |
| Partial binding triple | REJECT | REJECT | NO | NO | Terminal until corrected outside PB01 | BINDING_INVALID |
| Stored payload not canonical | REJECT | REJECT | NO | NO | Deterministic terminal result | INTENT_INTEGRITY_MISMATCH |
| Stored checksum mismatch | REJECT | REJECT | NO | NO | Deterministic terminal result | INTENT_INTEGRITY_MISMATCH |
| Release identity/checksum drift | REJECT | REJECT | NO | NO | Exact pinned authority only | LEGAL_BASIS_MISMATCH / IDENTITY_MISMATCH |
| Legal Basis code/version/checksum drift | REJECT | REJECT | NO | NO | Exact pinned authority only | LEGAL_BASIS_MISMATCH / IDENTITY_MISMATCH |
| Registry ID/version/checksum drift | REJECT | REJECT | NO | NO | Exact pinned registry only | LEGAL_BASIS_MISMATCH / REGISTRY_MISMATCH |
| Subtype code/version/checksum drift | REJECT | REJECT | NO | NO | Exact pinned subtype only | LEGAL_BASIS_MISMATCH / SUBTYPE_MISMATCH |
| Same identities, changed decision projection | REJECT | REJECT | NO | NO | Deterministic terminal result | LEGAL_BASIS_MISMATCH / PROJECTION_MISMATCH |
| Missing evidence/source compatibility | REJECT | REJECT | NO | NO | New valid admission required | ELIGIBILITY_MISMATCH |
| Liability incompatibility | REJECT | REJECT | NO | NO | New valid admission required | ELIGIBILITY_MISMATCH |
| Interest eligibility mismatch | REJECT | REJECT | NO | NO | New valid admission required | ELIGIBILITY_MISMATCH |
| Authority not yet effective at admission | REJECT | N/A | NO | NO | Retry only with valid effective context | LEGAL_BASIS_NOT_EFFECTIVE |
| Authority revoked/archived | REJECT | REJECT | NO | NO | Terminal; no fallback | LEGAL_BASIS_MISMATCH |
| Exact authority superseded but valid at admission and still resolvable/integrity-valid/not revoked | New admission requires explicit authority | FINALIZE exact old binding | YES | YES | Idempotent | ALLOW_PENDING_EXACT |
| Exact authority unresolvable | REJECT | REJECT | NO | NO | Only `AUTHORITY_UNAVAILABLE` may be retried; same pinned identity | LEGAL_BASIS_MISMATCH / UNRESOLVABLE |
| Same idempotency key, same intent and binding | REPLAY | N/A | NO additional write | NO additional write | Return existing intent | IDEMPOTENT_REPLAY |
| Same idempotency key, different binding checksum | REJECT | N/A | NO | NO | Terminal conflict for that key | DUPLICATE_FORMATION_CONFLICT |
| Finalizer retry after success | N/A | REPLAY | NO second ClaimItem | NO second snapshot | Return canonical result | IDEMPOTENT_REPLAY |
| Transactional event/outbox failure | N/A | ROLLBACK | NO | NO | Retry same pinned binding | TRANSIENT_TRANSACTION_FAILURE |
