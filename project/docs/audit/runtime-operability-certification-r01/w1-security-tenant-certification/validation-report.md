# W1 Security/Tenant Certification — Validation Report

Audit base: `422af3e63975ce9200bfc6fe234b89ccfc1c0e88`

## Generator-enforced assertions

- PASS — `SCHEMA_VERSION_1`
- PASS — `PROGRAM_TASK_IDENTITY`
- PASS — `EXACT_W0_SECURITY_TENANT_MODULE_SELECTION`
- PASS — `THIRTY_THREE_CAPABILITIES_EXACT`
- PASS — `UNIQUE_CAPABILITY_CERTIFICATIONS`
- PASS — `ALL_SELECTED_CAPABILITIES_ROOT_BOUND`
- PASS — `CONTROLLED_RUNTIME_DOES_NOT_IMPLY_DEPLOYED_RUNTIME`
- PASS — `DORMANT_CAPABILITIES_NOT_ACTIVATED`
- PASS — `NO_CONSUMER_NOT_PROMOTED_TO_DEFECT`
- PASS — `NO_PRODUCTION_ACTIVATION_OR_POLICY_CHANGE`
- PASS — `ZERO_BOUNDED_REMEDIATIONS`
- PASS — `REPOSITORY_WIDE_PARTIAL_DISPOSITION_PRESERVED`
- PASS — `W0_ARTIFACT_BLOBS_PINNED`
- PASS — `PR_1795_SEALED_TREE_PINNED`

## Required execution evidence

- `project/apps/api/src/modules/auth/__tests__/security-tenant-runtime-certification.spec.ts` exercises all 16 selected HTTP routes through a controlled Nest application
  with actual JWT, admin, and rate-limit guards.
- `project/apps/api/ci-manifests/pure/office-auth-user.txt` binds auth/invite/password-reset behavior to required CI.
- `project/apps/api/ci-manifests/pure/platform-scripts-shared.txt` binds audit and permission-diagnostics regressions to required CI.
- Node syntax, focused tests, manifest execution, deterministic regeneration, exact allowlist,
  instruction policy, and frozen W0/PR #1795 artifact checks are execution-time evidence.

This deterministic artifact does not fabricate local or CI command outcomes; those outcomes are
admission evidence recorded by the pull request and final closeout.
