# RCV-COL Representative Corpus Foundation

## Contract

`RCV-REP-CORPUS/v1` is a deterministic, test-only evidence corpus for the
`CanonicalReceivableApplicationSnapshotV1 -> LegalApplicationPlan` boundary. It prepares the
acceptance input for TPA-04D and later writer/reconciliation work without implementing or
activating a writer.

The corpus has no runtime, legal-effect, persistence, schema, migration, live-database or
production authority. It must never be imported by a runtime module or exported from the
`legal-application-plan` production index.

## Authority boundary

- Receivable owns the canonical snapshot, legal component buckets and TBK100 policy.
- The pure plan applies `COST -> ANCILLARY -> ACCRUED_INTEREST -> PRINCIPAL`.
- A ClaimItem is legal source/lineage only; it is not an application target or balance authority.
- `ClaimItem.collectedAmount`, `LedgerAllocation` and `CollectionAllocation` are never corpus
  input authority.
- All monetary values are positive integer minor-unit magnitudes. The scenario-specific
  `minorUnit` is preserved and is not globally assumed to be 2.
- Every successful plan must satisfy:

  `receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor`

- Every application must satisfy:

  `bucketBeforeMinor = appliedAmountMinor + bucketAfterMinor`

## Deterministic artifact and checksum

The generator uses no clock, locale, environment, database, network or randomness. Scenario
order is manifest order. Object keys are ordered by UTF-8 bytes, strings must be NFC-normalized,
arrays retain semantic order and monetary magnitudes are serialized as decimal strings.

The checksum is:

`SHA-256(UTF8("RCV-REP-CORPUS/v1") || 0x00 || canonicalCorpusBytes)`

The checksum reference is:

`rcv-representative-corpus:v1:sha256:<64-lowercase-hex>`

Bucket keys in this corpus are deterministic fixture identities. They exist only to satisfy the
already-ratified key format and must not be copied as a production bucket-identity algorithm.

## Acceptance matrix

The versioned manifest contains nineteen required scenarios:

1. single principal;
2. principal plus accrued interest;
3. principal plus cost;
4. all four canonical components;
5. partial application;
6. exact application;
7. overpayment with HELD remainder;
8. full HELD;
9. multiple prior receipts in the source-version boundary;
10. same-day history;
11. mixed history;
12. full-reversal expectation;
13. currency mismatch;
14. semantic replay expectation;
15. semantic conflict expectation;
16. concurrent-command expectation;
17. single-minor-unit boundary;
18. legacy evidence unknown;
19. cross-tenant rejection.

The reversal, replay, semantic-conflict and concurrency scenarios pin future obligations only.
They do not claim writer, persistence, transaction, race or exact-inverse evidence. Those remain
in the later owner-gated TPA-04E/TPA-04F stages.

## Legacy corpus disposition

The existing `codex/rcv-ws04-p03-syn-01` worktree remains owner WIP and is not modified by this
foundation. Its legacy `LedgerAllocation`, `CollectionAllocation` and
`ClaimItem.collectedAmount` expectations are superseded as target-authority evidence.

Disposition order:

1. preserve the legacy worktree byte-for-byte;
2. accept this target-native corpus through its pinned version/checksum and CI gate;
3. use only this corpus as the Task 11 acceptance input;
4. archive or retire the legacy corpus only under a later explicit owner decision.

No file deletion, historical guessing, legacy-to-target conversion or backfill is authorized.

## Task 11 input contract

Task 11 may consume the corpus only when all of the following are true:

- corpus version is exactly `RCV-REP-CORPUS/v1`;
- all nineteen scenario IDs are present exactly once;
- the canonical payload reproduces the pinned SHA-256 checksum;
- golden input/output vectors pass;
- canonical snapshot validation and pure plan assembly pass for every PLAN scenario;
- rejection scenarios produce their exact fail-closed error codes;
- no runtime module imports the corpus;
- no legacy allocation/cache surface appears as an application target;
- the synthetic owner WIP remains untouched.

Passing this gate makes Task 11 eligible for separate execution. It does not authorize Task 11,
LegalApplicationWriter, runtime activation, consumer cutover, reversal, or legacy retirement.
