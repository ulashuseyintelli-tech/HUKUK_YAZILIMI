# Governance Coordination Request — GOV-REQ-20260731-RECEIVABLE-NAFAKA-TERMINAL-CLOSEOUT

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RECEIVABLE-NAFAKA-LEGAL-BASIS-TERMINAL-CLOSURE-R01`
owner-authorized terminal closeout programıdır; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260731-RECEIVABLE-NAFAKA-TERMINAL-CLOSEOUT",
  "requestFingerprint": "b9732529c84ff6f1e70ea739a348531cbbbd803b974fa7c0771b2622b723e4f0",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-31T12:43:29Z",
  "baseMainSha": "7ca6af75b893960cd1e152903f97692ddac4fc36",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-SA01",
    "evidenceSha": "7ca6af75b893960cd1e152903f97692ddac4fc36"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "7ca6af75b893960cd1e152903f97692ddac4fc36"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/product-backlog.md",
    "recordIdentity": "Spring-cleaning successor kayıtları ve exact sırası",
    "anchor": "Spring-cleaning successor kayıtları ve exact sırası\n`office-spring-cleaning-reconciliation-r01/successor-execution-order.md` altındadır.\nTüm successor'lar `OWNER GO REQUIRED / NOT STARTED`; backlog correction execution\nauthority üretmez.",
    "expectedOldValue": "Spring-cleaning successor kayıtları ve exact sırası\n`office-spring-cleaning-reconciliation-r01/successor-execution-order.md` altındadır.\nTüm successor'lar `OWNER GO REQUIRED / NOT STARTED`; backlog correction execution\nauthority üretmez.",
    "newValue": "\n\n---\n\n## RECEIVABLE Nafaka Legal-Basis Terminal Closeout — 2026-07-31\n\n```text\nMASTER PROGRAM          RECEIVABLE-NAFAKA-LEGAL-BASIS-TERMINAL-CLOSURE-R01\nCLOSEOUT TASK           RECEIVABLE-LEGAL-BASIS-UYAP-DEPENDENCY-CLOSEOUT-R01\nPROGRAM STATUS          CLOSED / CANONICAL / UYAP-CONSUMABLE\nCONTENT AUTHORITY       OWNER + LDO RATIFIED / HASH-BOUND\nDECISION PACK           v2 / SHA-256 1e1fa725107a63cb736e927d810f07c5e70b6120f3b34248e2e87f5a61088a77\nREGISTRY RELEASE        RCV-LB-R1 / RELEASE VERSION 1 / 13 ENTRIES\nREGISTRY CHECKSUM       f62c738afc201c4733be654c5d1ce273ccad695b66b25814209cafeda4c68e0c\nRELEASE CHECKSUM        57894751d415bfc02dbdacf0a5b4291c3bc8c0c8dc198b8d0913944ea1825104\nPRODUCTION SIGNATURE    PENDING / NOT EXECUTED\nEXACT-VERSION RESOLVER  SUCCESS PATH CLOSED / DEFAULT OFF\nPRODUCTION PROVIDER     NONE\nPRODUCTION CALL-SITE    NONE\nPRODUCTION REACHABILITY 0\nFORMATION RUNTIME       DORMANT\nSCHEMA / MIGRATION      NONE\nHISTORICAL DATA         UNTOUCHED\n```\n\nCanonical phase evidence:\n\n- Stage 1 authority bootstrap: PR #2003, squash `21a15f91636e61e48768a704abb4f94c30b92743`.\n- Stage 2 SA/EG materialization: PR #2004, squash `9df8f93cf9fc8c210f8babb495a2aa7c5d07a125`.\n- Decision Pack v2 content ratification: PR #2006, squash `de9a62bcfcdace20fa03d76e527186c20728c7c4`.\n- Immutable successor registry/release: PR #2009, squash `5904f0276a092990f30ec1ee0584f3fae71dd4ec`.\n- Exact-version resolver success path: PR #2012, squash `c029aa535d1df128e197be589a9837c520e3bf59`.\n\nRatified scope is limited to six claim-level `PRINCIPAL` nafaka subtypes (`INTERIM_MAINTENANCE`, `MINOR_CHILD_MAINTENANCE`, `ADULT_CHILD_EDUCATION_MAINTENANCE`, `POVERTY_MAINTENANCE`, `SEPARATE_LIVING_SPOUSAL_MAINTENANCE`, `FAMILY_SUPPORT_MAINTENANCE`) and seven exact Legal Basis codes (`TMK_169`, `TMK_182_2`, `TMK_327_330`, `TMK_328_2`, `TMK_175_176`, `TMK_197`, `TMK_364_366`). Automatic interest, generic principal fallback, current/latest/default resolution, production activation and UYAP implementation are not authorized by this closeout.\n\nValidation evidence: Stage 1/2 task-specific governance matrix `7/7 PASS`; Legal Basis release/resolver required pure manifest `49 suites / 666 tests PASS`; production TypeScript `PASS`; PR #2003, #2004, #2006, #2009 and #2012 required/observed GitHub checks `PASS`. Local Nest build was not usable because the root dependency link resolved to a stale foreign worktree; PR #2012 canonical GitHub build/test checks passed.\n\nUYAP dependency return condition is satisfied at the canonical contract/release/resolver boundary. `UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01` is therefore `ELIGIBLE / SEPARATE UYAP OWNER AUTHORITY REQUIRED / NOT STARTED BY THIS CLOSEOUT`. UYAP remains consumer-only; runtime binding, serializer work, production activation and cutover remain outside this RECEIVABLE closeout.\n",
    "evidenceSha": "7ca6af75b893960cd1e152903f97692ddac4fc36",
    "expectedResultSha256": "36fb347ebafbb6a9d34832b674ac7f28b819b6ab4c27a101029b41fcd7b9c0ad"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/product-backlog.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
