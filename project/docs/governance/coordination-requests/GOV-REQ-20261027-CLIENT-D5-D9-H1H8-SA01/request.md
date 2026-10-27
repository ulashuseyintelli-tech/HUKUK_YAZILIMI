# Existing Ek142 owner acceptance — request only

Transcribes the verified D-5, combined D-9 and H1-H8 decisions with their explicit limits. No Decision Log write or live action in this request PR. A fresh Decision Log writer turn is required before execution; the closed KI-116 turn is not reused.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261027-CLIENT-D5-D9-H1H8-SA01",
  "requestFingerprint": "3b9be3be107711d8bb069c66816591edebb1fe90bd396d4d68bfc21f3fa265ea",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-27T16:52:36Z",
  "baseMainSha": "96376bbabd5e62b7d221bce6910d416fc95cb949",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "96376bbabd5e62b7d221bce6910d416fc95cb949"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "96376bbabd5e62b7d221bce6910d416fc95cb949"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-10-27 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-D5-D9-H1H8-ACCEPTANCE-SA01 --> **CLIENT D-5 PASS; COMBINED D-9 ACCEPTED; H1-H8 SERVICE ACCEPTANCE 8/8 — EXISTING OWNER DECISIONS RECORDED.** Owner Ek142 confirms D-5 run 5c61d598 under the consumed Ek141 one-run authorization: exit 0, 32 distinct PASS / 0 FAIL / 0 UNMEASURED, actual nine-field owner declaration, verified closure and 7/7 manifest binding. This is transcription of the existing owner acceptance, not agent ratification or a new live authorization. | D-9 combines D-4 e34b7e6d (narrow), D-5 5c61d598, D-6 e1a9a546 and D-7 244d4aa2 within each defined scope; D-8 is NOT a component and remains partial. H1/H2/H4/H5 accepted under Ek133 limits; H8 under Ek134 B-source 10/10 evidence; H3 under Ek135 only B-mapped A-1..A-4 + K9 (each of twelve other paths explicitly outside this delivery acceptance, not measured or defect-free); H6 under Ek135 with B-source G7 local-sink run 969ffd7f (target 1 / foreign 0 / total 1, second trigger +0); H7 now accepted by the verified D-5 result. Earlier R25B/R26/R27 measurements are not presented as repeated live-B measurements. | Owner Ek134(3), Ek135, Ek137, Ek141 and Ek142; updated 07 handoff and direct owner instruction to finish 6b/15 through existing PR/CI/exact-head merge authority. Owner record SHA256 CD6CD1CB31A9A03E03C2D0B463AD0591DB761ED41503E9FF6C8330BD87B9296B; handoff SHA256 1A2EF70A309539D879D0FCEC8BAC725AC40B01E24FFB4FD486D663A9CD3EFBA1; run manifest SHA256 C86998BC3BBB4AEDE6FDB99496DB1E1FD070B2C3D15C1A1D3704469E16D99DC5. Runner main 96376bbabd5e62b7d221bce6910d416fc95cb949, package C64E48D397E5D1A38D694D5C5253AA10A76280058BE4268DDCF4CF75EA12BCB4; published B identity remains separate. | S1 password login 201 and external list 200; old credentials/session 401; closure uses hash-verified NEW password, local/external login and S1/S0 401, account/access disabled, reset token absent, version 2, synthetic staff/cases closed, K4 scrub complete, other-tenant snapshot unchanged (55); Recover not needed. Single-use combines machine OBS PASS with owner H. Mailbox delivery is OWNER-REPORTED only (E, one minute), NOT machine-measured SMTP/mailbox proof. | Keep historical runs 00c96bd5 and 052788e6 unchanged, including failures/unmeasured evidence. Preserve D-8 partial status, d5-selftest T-7 old-R27 expectation (40/41), possible unmasked recipient in live API log and unmeasured provider retention (existing owner acceptance, no log deletion authority), and NOT_PROVEN exact input divergence cause for 052788e6. No raw recipient, password, token or consumed GO reference is published. Terminal row15 must preserve HV pool and these limits; no new product work, Run, Recover, live probe, service action, migration or DB access. |",
    "evidenceSha": "96376bbabd5e62b7d221bce6910d416fc95cb949",
    "expectedResultSha256": "34f7b7d27dcd008d873eb82c1f9bab0377e48b4e694ca51173b196c666337360"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
