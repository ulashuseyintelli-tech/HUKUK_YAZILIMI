# Financial G2 model A — verified decision transcription result

This SUCCEEDED result closes only the registered single-row owner-decision transcription. Request #3285 head ec85bd2746078c59af676ab4890763c13eb7f0b7 merged as 066d8e727961873e42a422933b94ef2f847d47b0. Execution #3287 at exact head 77e147f95ca3a70e6b70147fdfaaaeba762b1eba merged as 35f97485b2a8da6109df3b8b5527c1e1f5603a91. The only execution change was one appended Decision Log row, no deletion, record CLIENT-ACCOUNTING-NATIVE-G2-SA01. Whole-file SHA256 f1d26d3e12fc148b3e0564af21e5d4f478e9b4108e843488393d1b81894768e9 matches the immutable request and remains unchanged at this exact result base. Actual request/execution-main CI, CodeQL and orchestration passed. No agent-created authority or machine grant is claimed.

The supplied owner decision authorizes a rate-free native-currency current General Account projection with the same monetary sources, formulas, status/sign and canonical CaseClient attribution. Client-specific A and shared case-wide B remain distinct; no common TRY total, FX conversion, new financial SoT or role grant. Source validation and every currency amount, including HELD, share one RepeatableRead transaction. Inconsistent/unproven source identity/currency is unavailable rather than partial/zero success. The legacy single-currency API/reader selection, journal/shadow boundary, CL-R12 remaining helper, offset/reimbursement APPLY/REVERSAL and negative pending review are preserved. The G2 selector does not alter existing payment/offset, movement or statement operation currencies. E2/E1/H6, default-OFF E2 activation and FR-7 remain unchanged.

Fresh direct-owner row/manifest writer assignment is recorded at #2750 comment6915692144, not CLIENT acknowledgement or reuse of a closed E2/POA turn. The row turn returned in https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/2750#issuecomment-6923551454. The separate one-entry manifest turn remains bounded until actual product-main acceptance, then returns through the same coordination channel. Other decision rows and product-backlog.md were not written. All seven F04 WIP files, OD-07 materials, protected evidence seals and 45 prior physical residues remain preserved.

Separate product #3286 at exact head 07999da32c9a0bd6d67737b24503ac6c75b72cd8 passed required PR controls and merged as 6893262fae3d37fc6aa7cf6f48b198f6aaa28331. Product-main CI/CodeQL/orchestration are PENDING at this result publication; they are not asserted as PASS here. This result PR must not merge until actual product-main acceptance and selected-suite evidence pass. All 13 delivered source blobs match the locally validated source. Local focused acceptance: 155 distinct API tests, including 29 real HTTP/disposable-PostgreSQL scenarios, and 39 web tests. API production typecheck passed. The real concurrent HELD regression reached expected 0 / actual 100 before correction, then passed with shared transaction context. Initial fixture/parser diagnostics are retained and not behavioral PASS evidence; filtered tests are not counted as passed. A supplementary raw whole-web tsc diagnostic remains exit 2 with seven diagnostics in five unchanged test files, none in G2 files; it is not presented as PASS. The required normal PR Next build passed under its unchanged existing test-diagnostic filtering.

Initial product CI failed in unchanged settings-clients-address-guard-i01.test.tsx:213; cause remains NOT_PROVEN. Owner authorized one same-head failed/dependent-job retry, which passed. Only Web Tests and its dependent smoke execution were rerun; successful Test Suite, Windows Poppler and Guardrails execution timestamps remained unchanged, and successful CodeQL/orchestration were not rerun. Original failure evidence is preserved. Official exact-head PR logs explicitly select and pass thirteen relevant API/web suites, including G2 and preserved E2/G1/CL-R12 boundaries. Product-main selection must be independently proved before this result merges.

No schema/migration, source rewrite, backfill, cron, dispatch, money movement, new permission, production/live operation, release, Office/Client product seal or successor-module acceptance occurred. This immutable result's own main controls and safe owned-resource cleanup remain final delivery gates, recorded in HY_G2_NATIVE_EVIDENCE_20261116_CODEX.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261116-CLIENT-ACCOUNTING-NATIVE-G2-SA01",
  "requestId": "GOV-REQ-20261116-CLIENT-ACCOUNTING-NATIVE-G2-SA01",
  "requestFingerprint": "df0e3dfbf6563d33b42241f183f9bb10a7ee63d12ddb2f203dd50316ebeff411",
  "status": "SUCCEEDED",
  "executionPrNumber": 3287,
  "executionMergeSha": "35f97485b2a8da6109df3b8b5527c1e1f5603a91",
  "effectiveMainSha": "6893262fae3d37fc6aa7cf6f48b198f6aaa28331",
  "completedAt": "2026-11-16T17:19:33Z",
  "validationEvidence": [
    {
      "name": "exact-one-row-target-sha256:f1d26d3e12fc148b3e0564af21e5d4f478e9b4108e843488393d1b81894768e9",
      "status": "PASS",
      "evidenceSha": "35f97485b2a8da6109df3b8b5527c1e1f5603a91"
    },
    {
      "name": "same-registered-decision-result-on-current-base",
      "status": "PASS",
      "evidenceSha": "6893262fae3d37fc6aa7cf6f48b198f6aaa28331"
    },
    {
      "name": "sa-request-main:CI:run-43865143836:attempt-1",
      "status": "PASS",
      "evidenceSha": "066d8e727961873e42a422933b94ef2f847d47b0"
    },
    {
      "name": "sa-request-main:Push on main:run-43865143755:attempt-1",
      "status": "PASS",
      "evidenceSha": "066d8e727961873e42a422933b94ef2f847d47b0"
    },
    {
      "name": "sa-request-main:GOV-COORD-V2 Orchestration Tests:run-43865143841:attempt-1",
      "status": "PASS",
      "evidenceSha": "066d8e727961873e42a422933b94ef2f847d47b0"
    },
    {
      "name": "sa-execution-main:CI:run-43912560976:attempt-1",
      "status": "PASS",
      "evidenceSha": "35f97485b2a8da6109df3b8b5527c1e1f5603a91"
    },
    {
      "name": "sa-execution-main:Push on main:run-43912560076:attempt-1",
      "status": "PASS",
      "evidenceSha": "35f97485b2a8da6109df3b8b5527c1e1f5603a91"
    },
    {
      "name": "sa-execution-main:GOV-COORD-V2 Orchestration Tests:run-43912560847:attempt-1",
      "status": "PASS",
      "evidenceSha": "35f97485b2a8da6109df3b8b5527c1e1f5603a91"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->
