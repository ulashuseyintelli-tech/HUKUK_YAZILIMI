# OFFICE P6A Runtime Truth and Release Readiness R01

## 1. Scope and authority boundary

| Field | Verified value |
|---|---|
| Task | `OFFICE-P6A-RUNTIME-TRUTH-AND-RELEASE-R01` |
| Workspace modules | `OFFICE + SHARED_CONTROL_PLANE` |
| Canonical reference | `origin/main` |
| Canonical/base SHA | `42f620ce2dcae77d491949e59004f15168b942a3` |
| Runtime root | `C:\Development\HY_WT\RUNTIME` |
| Runtime HEAD | `3c73708da29bceb71421edb6d00a6d8713f196a0` |
| Observation date | `2026-08-12` |
| Runtime mutation | `NONE` |
| Database mutation | `NONE` |
| Migration apply | `NONE` |
| Deploy / activation | `NONE` |

This record is a read-only source/dist/ancestry/consumer and release-delta
reconciliation. It does not grant release, migration, deployment, cutover, or
production activation authority.

## 2. B01 — OFFICE capability matrix

The status vocabulary is deliberately closed:
`PRESENT_IN_SOURCE`, `PRESENT_IN_DIST`, `ABSENT`, `STALE`, and `UNKNOWN`.
Consumer presence is independent evidence and is not folded into artifact status.

| Capability | Lineage evidence | Artifact status | Runtime consumer | Verified reason |
|---|---|---|---|---|
| F01 authorization enforcement | PR #2076 squash `2cae1fb11685674fe78898d2781f06f5f6f30aeb`; not an ancestor of Runtime HEAD | `STALE` | `ABSENT` | Guard/projection source and dist are absent; hot-deployed service sources match main but their dist lacks F01 markers. |
| Lawyer credential response containment | PR #1932 squash `8899cf5fae135e55955c8cbe01927976f80f1db9`; not an ancestor of Runtime HEAD | `PRESENT_IN_DIST` | `ABSENT` | All three source blobs match main and all compiled containment markers are present. This is a source overlay, not commit ancestry. |
| CAP-02 neutral telemetry | PRs #1738/#1796/#1805; squashes `d4f0e5be3c8e8ab18b18fe35ed6290cad39d7e80`, `1801748aab2f2197ffc5882b46d182613b1e92b1`, `4c888dbddfbe15a7e0b3b441ac8b81c5d20aecf8` | `PRESENT_IN_DIST` | `ABSENT` | Source blobs match main; compiled neutral-decision markers are present; all listed commits are ancestors of Runtime HEAD. |
| CAP-02 canary tenant/actor scope | PR #1849 squash / Runtime HEAD `3c73708da29bceb71421edb6d00a6d8713f196a0` | `PRESENT_IN_DIST` | `ABSENT` | Source blobs match main and tenant/actor fail-closed markers exist in dist. |
| CAP-02 identity-binding operate runner | PR #1765 squash `5ec415813c270db0347ea2ef77d3c78dd65ab48d` plus `4c888dbddfbe15a7e0b3b441ac8b81c5d20aecf8` | `PRESENT_IN_DIST` | `ABSENT` | Source parity, dist markers, and ancestry all pass. |
| ReportingLine population / idempotency | PRs #1772/#1781 squashes `e633552345358193c8035b4dacfd480a44d0117f`, `cdf26aac135eab09ce11724aec78f495d89805b7` | `PRESENT_IN_DIST` | `ABSENT` | Source parity, `buildInitialPopulationPlan`/runner dist markers, and ancestry pass. |
| Password recovery + hardening | PRs #1481/#1494 squashes `7676d8514292f03914f1f46c0c67041f04489194`, `b9916f5bfe9a27e483d779e5c98d31828552f92e` | `PRESENT_IN_DIST` | `ABSENT` | Controller/service/auth source parity and all required compiled markers pass. |
| Staff/lawyer lifecycle | PR #1239 squash `b0ce36db78e6d6dbc5324d7b1f0d14e3ab96c2c8` | `PRESENT_IN_DIST` | `ABSENT` | Staff/lawyer source parity, compiled lifecycle marker, and ancestry pass. |
| Office approval engine baseline | PR #1226 squash `a3eee8b8d12013b368193839331783a0337dd3b9` | `STALE` | `ABSENT` | Approval service Runtime source blob differs from main; controller/executor match and dist markers exist, so the package is mixed rather than absent. |

### 2.1 Artifact hash evidence

| Artifact | Canonical source blob | Runtime source blob | Runtime dist SHA-256 |
|---|---|---|---|
| `office-f01-authorization.guard` | `2db4e88f3a85d2ce5fe57469f4c39b0d465d86af` | `ABSENT` | `ABSENT` |
| `office-f01-projection` | `76a135dafc7f513f7348efc73598292dc3e4802f` | `ABSENT` | `ABSENT` |
| `lawyer-public-projection` | `d2a6a602e4da545d4b24519b0e53c5d0716446b4` | same | `923cf90f73aa0ac76900a5ee0bf7f4bd5ee4bb74504a55f595fb7280998e8ed6` |
| `lawyer.service` | `e62a4ec1261a1ae04236c59bea1a83cb1f09bfbb` | same | `430837b9ae2bb7f99623dacc8d6584739a5b8d4db4ccdd669ad0ee7ae6411f1f` |
| `office.service` | `605409e6814554908ed07a4ee58ad7bdbafd2875` | same | `698de18f4ff0a3f860c2532b6f0e6437a449b208e238785a080289183f747082` |
| `office-approval-shadow.service` | `c6a87bf47a01b4a0c470ef358c91a5381ad3fbf9` | same | `9b89643f72ec2d4e4032df56082080ba9fd26d64d253b287c11ceed962918f24` |
| `office-cap02-authorization-shadow.core` | `bb88844b74ac37fc0acd5f023f89fde270476c7e` | same | `b7a986ce4fe02c2eaf22773ac9a80303b9494180ac6446f461f5c50ce6f2567d` |
| `office-cap02-telemetry-canary-scope.core` | `e440af4bb241905855cbdd722cbce4d47adecb17` | same | `94e6c9bfc6b650986f4d57d3618ddcffd047de0a3ad565b9772836ce4139f198` |
| `office-cap02-identity-binding-operate.core` | `a1fdc231a5ba1b956126ec7a35896fdd84576eec` | same | `f1d4c5e1089aa6a081b06a6d7edadf4192e574919b83b7cb0d450fa198e47b27` |
| `office-cap02-identity-binding-operate` | `87ba66fc7ad5cd869a1aa8027a96b9449c69d7da` | same | `133f7381e268ad5b94f64b4b4cc24ceb9c1b876094c0a6f90180522fcdf2122a` |
| `office-cap02-reportingline-initial-population.plan` | `abc575615d720ded063dcc23b0a7a502ca3d9e5e` | same | `afc87bae7ef6dff1eb355a8bfef234b97439187fbb51b6ef9523d49c57b0eee1` |
| `office-cap02-reportingline-initial-population` | `6082053fc66842185df7c2601faf32ccbb7f69a0` | same | `276f97ba91963bed867f472ffe0e25ca441b8b49dde5c7ba1fdb9cdf5e1627cd` |
| `password-reset.controller` | `a9ada86c033732c2a05c6238ea364fa740d9eef0` | same | `89832312ac9dc55d1d30945528340f36d032a037a9f74408a486c474bfdbc4cb` |
| `password-reset.service` | `689db63d3e7aef2a089f7fff58531ce4b001478f` | same | `a2ad3160909874388ce307dc5e029c00f6ef0942fda5035d28b36ed14ac7cf23` |
| `auth.controller` | `40653f31624eef90e14f5459edd89b2c9780346a` | same | `69df7aba452c52651cc84dca2314a2bcd936003a22801652adc56d033b4bc5cd` |
| `staff.service` | `0e4e0b7c4b587bc44deeacc5cbe3ee51d811d8c3` | same | `ade7028b21fbfeead22fe5625bcf03faa657440a94a8dee8548822f6bde9bca2` |
| `office-approval.service` | `2369e400a55865a28769dca1507b9bab107573b0` | `c3ea757d00a1dc34d85a82860581cb6ca261e405` | `265043237c1e9cff23bd9b8eaffa26f8c78dd09c9178d694ebeb8db709477d19` |
| `office-approval.controller` | `4cd8b1a782293bd423e68fddcc55f129dd1804d0` | same | `dbbf52f6fcb66c8d06ecea01e430f21bfcb6a6ed9d6fc4a347b17bf6553c8bb6` |
| `office-approval-executor.service` | `5a5ca76d2da74d757b26bbc105bc9b706225986b` | same | `1b7f0db175855bc099da5f29e00c5d0a2fe71b4fb3168b8d1d60a0f2b3a17679` |

### 2.2 Consumer and working-copy evidence

- Scanner result: `RUNTIME_CONSUMER ABSENT NO_RUNTIME_ROOT_API_PROCESS`.
- Port `8080` was listening, but its process ancestry resolved to
  `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE10`, not the target Runtime root.
- Runtime has 10 tracked/untracked source-overlay paths. Every one hashes to the
  corresponding `origin/main` blob; unexpected Runtime dirty paths are `0`.
- Overlay parity does not prove dist provenance and does not convert the Runtime
  worktree into the active API consumer.

## 3. B02 — Current main versus Runtime release delta

Runtime HEAD is an ancestor of current main. The delta is broad and cross-program:

| Measure | Verified value |
|---|---:|
| Commits after Runtime HEAD | 491 |
| Changed paths | 1033 |
| Added / modified / deleted | 662 / 353 / 18 |
| Runtime overlay paths already equal to main | 10 |
| Effective source delta | 1023 |
| OFFICE-classified paths | 27 |
| CLIENT-classified paths | 103 |
| DEBTOR-classified paths | 23 |
| RECEIVABLE/COLLECTION-classified paths | 32 |
| SHARED_CONTROL_PLANE-classified paths | 370 |
| Ownership not proven from the positive path rules | 478 |

The `UNKNOWN` count is not silently assigned to OFFICE. It means path-level program
ownership is not proven by the scanner's positive allowlist; the paths and hashes are
still present in the deterministic Git delta.

Material release surfaces:

- Schema: `project/apps/api/prisma/schema.prisma`.
- Migrations: 16 directories listed in B03.
- Dependency graph: `project/apps/api/package.json`, `project/pnpm-lock.yaml`.
- API entrypoint: `project/apps/api/src/app.module.ts`.
- Configuration: `project/apps/web/playwright.client-workspace.config.ts`.
- Background/cron/worker/scheduler name candidates: 40 paths. This is a lexical
  candidate set, not proof that all 40 are active background consumers.

This delta cannot be represented as an OFFICE-only build or deployment unit.

## 4. B03 — Pending non-OFFICE migration analysis

### 4.1 Fresh observed database state

The observed database is the local development Postgres container
`hukuk-postgres`, database `hukuk_db`, user `postgres`, PostgreSQL `16.14`. This is not
production evidence.

| Check | Result |
|---|---|
| Prisma migration inventory | 125 repository migrations / 125 DB migrations |
| Successful DB rows | 125 |
| Rolled back / unfinished | 0 / 0 |
| Repository migrations pending in DB | 0 |
| Repository/DB checksum drift | 0 |
| DB-only orphan migration rows | 0 |
| `prisma migrate status` | `Database schema is up to date!` |

Therefore the handoff expectation of 10 pending migrations is stale for the observed
database. The required pending non-OFFICE migration table is empty:

| Pending migration | Program | Tables/invariants | Dependency | Current DB state | Apply risk | Deploy-without-apply risk |
|---|---|---|---|---|---|---|
| _None_ | — | — | — | `0 pending` | — | — |

### 4.2 Migrations absent from Runtime HEAD but already applied in the observed DB

All rows below have repository/DB checksum parity. Prisma will skip them on the
observed DB; manual re-application is neither required nor authorized.

| Migration | Program | Principal dependency/surface | Observed DB / risk disposition |
|---|---|---|---|
| `20260729120000_rc_col_w2_2b_bank_reference_idempotency` | RECEIVABLE/COLLECTION | `BankTransaction`; normalized reference check and tenant/account/reference uniqueness | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260730120000_debtor_service_occurrence_snapshot_invariant_i08` | DEBTOR | `LegalDeadlineSnapshot`; one ACTIVE row per tenant/tebligat | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260730170000_debtor_external_case_logical_identity_unique` | DEBTOR | `ExternalCase` logical identity constraint | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260731120000_rcv_col_full_semantic_command_idempotency` | RECEIVABLE/COLLECTION | `Collection`; command evidence completeness/idempotency | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260801183656_debtor_external_case_status_integrity_d2i01_provenance` | DEBTOR | `ExternalCase` status/closure provenance | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260802120000_bank_tenant_fk_name_reconciliation_r01` | RECEIVABLE/COLLECTION | Existing `BankSettlementEvidence`/`BankTransaction` tenant FK names | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260802190000_client_identity_active_partial_unique` | CLIENT | Active `Client` TCKN/VKN partial uniqueness | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260803170000_client_consent_and_greeting_defaults` | CLIENT | `Tenant`, composite `Client`, new `ClientConsent`, greeting defaults | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260803190000_client_disclosure_and_dsar` | CLIENT | Disclosure text/delivery and data-subject request tables | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260803210000_client_legal_hold` | CLIENT | `ClientLegalHold`, tenant/client composite FKs | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260803230000_client_special_category_record` | CLIENT | `ClientSpecialCategoryRecord`, tenant/client composite FKs | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260804010000_client_cancollect_default_false` | CLIENT | `Client.canCollect` fail-closed default | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260809090000_client_statement_interest_projection` | CLIENT | `ClientStatementLineType` enum foundation | Applied, checksum match; required before the shape migration |
| `20260809090100_client_statement_interest_projection_shape` | CLIENT | `ClientStatementLine` interest columns/index/check | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260809090500_client_statement_delivery_ledger` | CLIENT | `ClientStatementDeliveryLedger`, tenant/client/statement FKs | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |
| `20260809210000_expense_actual_typed_posting` | CLIENT | `BalanceLedger` typed entry/posting key | Applied, checksum match; deploy-without-apply risk `NONE` on observed DB |

The zero pending result removes `BLOCKED_BY_NON_OFFICE_MIGRATIONS` for this observed
database. It does not establish another database's state and does not authorize a
migration apply.

## 5. B04 — Deterministic read-only scanner

The scanner is implemented in:

- `project/apps/api/src/scripts/office-runtime-release-readiness.core.ts`
- `project/apps/api/src/scripts/office-runtime-release-readiness.ts`

Direct invocation uses the repository's existing `tsx` convention without a
`package.json` change:

```powershell
npx --yes tsx src/scripts/office-runtime-release-readiness.ts `
  --repo-root=C:\Development\HUKUK_YAZILIMI\project `
  --runtime-root=C:\Development\HY_WT\RUNTIME `
  --canonical-ref=origin/main `
  --format=json
```

Properties:

- reads Git refs, source files, compiled dist files, and process inventory only;
- emits canonical/runtime blob hashes, dist SHA-256 values, required marker gaps,
  commit ancestry, consumer evidence, and release-delta classification;
- separates artifact status from consumer presence;
- returns `UNKNOWN` when canonical source evidence is unavailable;
- leaves unproven program ownership as `UNKNOWN`;
- emits redacted process signatures and never emits process command lines.

Validation at evidence creation:

- focused and negative scanner unit result: `7/7 PASS`;
- complete `pure/office-auth-user` manifest: `28/28 suites`, `602/602 tests PASS`;
- CI-equivalent API production typecheck (`tsconfig.prod.json`): `PASS`;
- full development typecheck differential: current-main baseline `578` diagnostic
  signatures, task branch `521`, branch-only `0`; no scanner diagnostic remains;
- changed-file ESLint: `PASS`;
- instruction policy: `PASS` with the pre-existing AGENTS maintenance-target warning;
- `git diff --check`: `PASS`;
- changed-file secret pattern scan: `PASS`.

## 6. B05 — Single deployment disposition

```text
BLOCKED_BY_RUNTIME_MODEL
```

Evidence for the single disposition:

1. The target Runtime root has no detected API consumer; the observed port `8080`
   process belongs to another worktree.
2. F01 is `STALE`: mandatory guard/projection source and dist are absent while two
   service source files are overlaid from main.
3. The approval engine is also `STALE` because source provenance is mixed.
4. Runtime is 491 commits and 1033 changed paths behind main, including schema,
   migrations, dependency graph, API entrypoint, configuration, and background surfaces.
5. The observed DB has zero pending migrations, so migration pending state is not the
   controlling blocker.

`READY_FOR_CROSS_PROGRAM_RELEASE` and `OFFICE_ONLY_RUNTIME_ACCEPTANCE_COMPLETE` are not
established. No deploy, cutover, process restart, Runtime mutation, DB mutation,
migration apply, or production activation was performed.

## 7. Terminal block state

| Block | State |
|---|---|
| B01 capability matrix | `COMPLETE` |
| B02 release delta | `COMPLETE` |
| B03 pending non-OFFICE migration analysis | `COMPLETE` |
| B04 deterministic scanner | `COMPLETE` |
| B05 single disposition | `COMPLETE — BLOCKED_BY_RUNTIME_MODEL` |
| Successor unit | `NONE` |
| New owner decision | `PAGE-O0 DECISION REQUIRED` |
